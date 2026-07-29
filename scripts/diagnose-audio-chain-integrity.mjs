import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const webRoot = path.resolve('web');
const componentsRoot = path.resolve('components');
const profile = path.resolve('.tmp', `fe-monster-audio-chain-${process.pid}`);
const sampleRate = 48_000;
const durationSeconds = 36;
const wav = createDiagnosticWav(sampleRate, durationSeconds);
const liveResponses = new Set();
let recoverableGapRequests = 0;
const UX_FREEZE_LIMIT_MS = 650;
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.wasm', 'application/wasm']
]);

if (!existsSync(edge)) throw new Error(`Microsoft Edge was not found: ${edge}`);

function createDiagnosticWav(rate, seconds) {
  const frames = rate * seconds;
  const buffer = Buffer.allocUnsafe(44 + frames * 4);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + frames * 4, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(frames * 4, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    // Coherent with the 16,384-frame analysis window at 48 kHz so the
    // distortion measurement does not mistake FFT leakage for harmonics.
    const left = Math.sin((2 * Math.PI * 937.5 * frame) / rate) * 0.22;
    const right = Math.sin((2 * Math.PI * 1500 * frame) / rate) * 0.16;
    buffer.writeInt16LE(Math.round(left * 32767), 44 + frame * 4);
    buffer.writeInt16LE(Math.round(right * 32767), 46 + frame * 4);
  }
  return buffer;
}

function serveAudio(request, response, jittered) {
  const range = request.headers.range || '';
  const match = /^bytes=(\d+)-(\d*)$/i.exec(range);
  const start = match ? Number(match[1]) : 0;
  const requestedEnd = match && match[2] ? Number(match[2]) : wav.length - 1;
  const end = Math.min(wav.length - 1, Math.max(start, requestedEnd));
  const body = wav.subarray(start, end + 1);
  const headers = {
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
    'content-type': 'audio/wav',
    'content-length': body.length
  };
  if (match) headers['content-range'] = `bytes ${start}-${end}/${wav.length}`;
  response.writeHead(match ? 206 : 200, headers);
  liveResponses.add(response);
  response.once('close', () => liveResponses.delete(response));
  if (!jittered) {
    response.end(body);
    return;
  }
  const chunkBytes = sampleRate * 4;
  let offset = 0;
  const writeNext = () => {
    if (response.destroyed) return;
    if (offset >= body.length) {
      response.end();
      return;
    }
    const next = Math.min(body.length, offset + chunkBytes);
    response.write(body.subarray(offset, next));
    offset = next;
    const chunkIndex = Math.floor(offset / chunkBytes);
    const delayMs = chunkIndex % 3 === 0 ? 420 : 115;
    setTimeout(writeNext, delayMs);
  };
  writeNext();
}

function serveRecoverableGap(request, response) {
  recoverableGapRequests += 1;
  const range = request.headers.range || '';
  const match = /^bytes=(\d+)-(\d*)$/i.exec(range);
  const start = match ? Number(match[1]) : 0;
  const requestedEnd = match && match[2] ? Number(match[2]) : wav.length - 1;
  const end = Math.min(wav.length - 1, Math.max(start, requestedEnd));
  const body = wav.subarray(start, end + 1);
  const headers = {
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
    'content-type': 'audio/wav',
    'content-length': body.length
  };
  if (match) headers['content-range'] = `bytes ${start}-${end}/${wav.length}`;
  response.writeHead(match ? 206 : 200, headers);
  liveResponses.add(response);
  response.once('close', () => liveResponses.delete(response));
  const initialBytes = Math.min(body.length, 44 + sampleRate * 4 * 6);
  response.write(body.subarray(0, initialBytes));
  setTimeout(() => {
    if (!response.destroyed) response.end(body.subarray(initialBytes));
  }, 12_000);
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/diagnostic.wav') {
    serveAudio(request, response, false);
    return;
  }
  if (url.pathname === '/jitter.wav') {
    serveAudio(request, response, true);
    return;
  }
  if (url.pathname === '/recoverable-gap.wav') {
    serveRecoverableGap(request, response);
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end('{}');
    return;
  }
  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const componentAsset = requestPath.startsWith('/components/');
  const root = componentAsset ? componentsRoot : webRoot;
  const relative = componentAsset
    ? requestPath.slice('/components/'.length)
    : requestPath.slice(1);
  const file = path.resolve(root, decodeURIComponent(relative));
  if (!file.startsWith(`${root}${path.sep}`) || !existsSync(file)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': mimeTypes.get(path.extname(file).toLowerCase()) || 'application/octet-stream'
  });
  response.end(readFileSync(file));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Fixture server did not bind');
const baseUrl = `http://127.0.0.1:${address.port}`;

const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let browserError = '';
browser.stderr?.on('data', (chunk) => {
  browserError += String(chunk);
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
let nextId = 1;
let socket;

async function activeDebugPort() {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (existsSync(portFile)) {
      const port = Number.parseInt(readFileSync(portFile, 'utf8').split(/\r?\n/, 1)[0], 10);
      if (Number.isInteger(port) && port > 0) return port;
    }
    if (browser.exitCode !== null) break;
    await delay(50);
  }
  throw new Error(`Edge debugging endpoint did not start: ${browserError.trim()}`);
}

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression, awaitPromise = false) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(expression, timeout = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression, true)) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

try {
  const port = await activeDebugPort();
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No Edge page target was found');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const ids = new WeakMap();
      let nextId = 1;
      const id = (value) => {
        if (!ids.has(value)) ids.set(value, nextId++);
        return ids.get(value);
      };
      const edges = new Map();
      const duplicateConnects = [];
      const originalConnect = AudioNode.prototype.connect;
      const originalDisconnect = AudioNode.prototype.disconnect;
      AudioNode.prototype.connect = function(destination, output = 0, input = 0) {
        const key = id(this) + '>' + id(destination) + ':' + output + ':' + input;
        if (edges.has(key)) duplicateConnects.push(key);
        edges.set(key, {
          key,
          sourceId: id(this),
          destinationId: id(destination),
          sourceType: this.constructor?.name || '',
          destinationType: destination?.constructor?.name || '',
          output,
          input
        });
        return originalConnect.apply(this, arguments);
      };
      AudioNode.prototype.disconnect = function(destination, output, input) {
        const sourceId = id(this);
        if (!arguments.length) {
          for (const [key, edge] of edges) {
            if (edge.sourceId === sourceId) edges.delete(key);
          }
        } else if (destination) {
          const destinationId = id(destination);
          for (const [key, edge] of edges) {
            if (
              edge.sourceId === sourceId
              && edge.destinationId === destinationId
              && (output === undefined || edge.output === output)
              && (input === undefined || edge.input === input)
            ) edges.delete(key);
          }
        }
        return originalDisconnect.apply(this, arguments);
      };
      window.__audioTopologySnapshot = () => ({
        activeEdges: [...edges.values()],
        duplicateConnects: [...duplicateConnects]
      });
    })();`
  });
  await command('Page.navigate', { url: `${baseUrl}/?audio-chain-integrity=${Date.now()}` });
  await waitFor(`document.readyState === 'complete'
    && typeof loadSong === 'function'
    && typeof ensureAudioAnalysis === 'function'
    && typeof setGoogleObrSpatialAudioEnabled === 'function'
    && typeof setGoogleObrChannelLayout === 'function'
    && typeof state !== 'undefined'
    && typeof els !== 'undefined'
    && els.audio`);

  const result = await evaluate(`(async () => {
    const audio = els.audio;
    const originalApiJson = apiJson;
    const originalSong = state.currentSong;
    const errors = [];
    const wait = async (predicate, timeout = 20_000) => {
      const startedAt = performance.now();
      while (performance.now() - startedAt < timeout) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return false;
    };
    const analyse = (channels, frequencies, sampleRate) => {
      const channelMetrics = channels.map((samples, channelIndex) => {
        const sampleCount = samples.length;
        let sumSquares = 0;
        let peak = 0;
        let dc = 0;
        for (const value of samples) {
          sumSquares += value * value;
          peak = Math.max(peak, Math.abs(value));
          dc += value;
        }
        const projection = (frequency) => {
          let sin = 0;
          let cos = 0;
          for (let index = 0; index < sampleCount; index += 1) {
            const angle = 2 * Math.PI * frequency * index / sampleRate;
            sin += samples[index] * Math.sin(angle);
            cos += samples[index] * Math.cos(angle);
          }
          return 2 * Math.hypot(sin, cos) / sampleCount;
        };
        const fundamental = projection(frequencies[channelIndex]);
        const positiveCrossings = [];
        for (let index = 1; index < sampleCount; index += 1) {
          if (samples[index - 1] < 0 && samples[index] >= 0) positiveCrossings.push(index);
        }
        const crossingSpan = positiveCrossings.length > 1
          ? positiveCrossings[positiveCrossings.length - 1] - positiveCrossings[0]
          : 0;
        const estimatedFrequency = crossingSpan > 0
          ? (positiveCrossings.length - 1) * sampleRate / crossingSpan
          : 0;
        let harmonicPower = 0;
        for (let harmonic = 2; harmonic <= 5; harmonic += 1) {
          harmonicPower += projection(frequencies[channelIndex] * harmonic) ** 2;
        }
        return {
          frames: sampleCount,
          rms: Math.sqrt(sumSquares / sampleCount),
          peak,
          dc: dc / sampleCount,
          fundamental,
          estimatedFrequency,
          thdDb: 20 * Math.log10(Math.max(1e-12, Math.sqrt(harmonicPower)) / Math.max(1e-12, fundamental))
        };
      });
      return channelMetrics;
    };
    const captureNodes = async (nodes, frameTarget = 16_384) => {
      const context = state.audioAnalysis.context;
      const processor = context.createScriptProcessor(1024, 2, 2);
      const silence = context.createGain();
      silence.gain.value = 0;
      const channels = [[], []];
      let resolveCapture;
      const done = new Promise((resolve) => { resolveCapture = resolve; });
      processor.onaudioprocess = (event) => {
        for (let channel = 0; channel < 2; channel += 1) {
          const source = event.inputBuffer.getChannelData(Math.min(channel, event.inputBuffer.numberOfChannels - 1));
          channels[channel].push(...source);
        }
        if (channels[0].length >= frameTarget) resolveCapture();
      };
      for (const node of nodes) node.connect(processor);
      processor.connect(silence);
      silence.connect(context.destination);
      await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 4_000))]);
      for (const node of nodes) {
        try { node.disconnect(processor); } catch {}
      }
      processor.disconnect();
      silence.disconnect();
      return channels.map((channel) => channel.slice(0, frameTarget));
    };
    const captureNodePair = async (inputNode, outputNodes, frameTarget = 4096) => {
      const context = state.audioAnalysis.context;
      const inputSplitter = context.createChannelSplitter(2);
      const outputSum = context.createGain();
      const outputSplitter = context.createChannelSplitter(2);
      const merger = context.createChannelMerger(4);
      const processor = context.createScriptProcessor(1024, 4, 4);
      const silence = context.createGain();
      silence.gain.value = 0;
      const channels = [[], [], [], []];
      let resolveCapture;
      const done = new Promise((resolve) => { resolveCapture = resolve; });
      processor.onaudioprocess = (event) => {
        for (let channel = 0; channel < 4; channel += 1) {
          const source = event.inputBuffer.getChannelData(channel);
          channels[channel].push(...source);
        }
        if (channels[0].length >= frameTarget) resolveCapture();
      };
      inputNode.connect(inputSplitter);
      inputSplitter.connect(merger, 0, 0);
      inputSplitter.connect(merger, 1, 1);
      for (const node of outputNodes) node.connect(outputSum);
      outputSum.connect(outputSplitter);
      outputSplitter.connect(merger, 0, 2);
      outputSplitter.connect(merger, 1, 3);
      merger.connect(processor);
      processor.connect(silence);
      silence.connect(context.destination);
      await Promise.race([done, new Promise((resolve) => setTimeout(resolve, 4_000))]);
      try { inputNode.disconnect(inputSplitter); } catch {}
      for (const node of outputNodes) {
        try { node.disconnect(outputSum); } catch {}
      }
      inputSplitter.disconnect();
      outputSum.disconnect();
      outputSplitter.disconnect();
      merger.disconnect();
      processor.disconnect();
      silence.disconnect();
      return {
        input: channels.slice(0, 2).map((channel) => channel.slice(0, frameTarget)),
        output: channels.slice(2, 4).map((channel) => channel.slice(0, frameTarget))
      };
    };
    const comparePcm = (inputChannels, outputChannels) => inputChannels.map((input, channel) => {
      const output = outputChannels[channel] || [];
      const frames = Math.min(input.length, output.length);
      let inputPower = 0;
      let outputPower = 0;
      let dot = 0;
      for (let index = 0; index < frames; index += 1) {
        inputPower += input[index] * input[index];
        outputPower += output[index] * output[index];
        dot += input[index] * output[index];
      }
      const gain = dot / Math.max(1e-15, inputPower);
      let errorPower = 0;
      let maxError = 0;
      for (let index = 0; index < frames; index += 1) {
        const error = output[index] - input[index] * gain;
        errorPower += error * error;
        maxError = Math.max(maxError, Math.abs(error));
      }
      const inputRms = Math.sqrt(inputPower / Math.max(1, frames));
      const outputRms = Math.sqrt(outputPower / Math.max(1, frames));
      const errorRms = Math.sqrt(errorPower / Math.max(1, frames));
      return {
        frames,
        gain,
        inputRms,
        outputRms,
        errorRms,
        errorDb: 20 * Math.log10(Math.max(1e-15, errorRms) / Math.max(1e-15, inputRms)),
        maxError,
        correlation: dot / Math.max(1e-15, Math.sqrt(inputPower * outputPower))
      };
    });
    const fixtureSong = {
      id: 'audio-chain-integrity',
      title: 'Audio chain integrity',
      artist: 'FE Monster QA',
      provider: 'fixture',
      duration: ${durationSeconds},
      playing: true
    };
    apiJson = async (url) => String(url).startsWith('/api/player/load?')
      ? {
          song: fixtureSong,
          playable: true,
          url: ${JSON.stringify(`${baseUrl}/diagnostic.wav`)},
          quality: 'standard'
        }
      : {};
    await setGoogleObrSpatialAudioEnabled(false, { announce: false });
    const loaded = await loadSong(fixtureSong, { silent: true });
    audio.volume = 1;
    const analysisReady = await ensureAudioAnalysis({ announceObrFailure: false });
    await wait(() => Number(audio.currentTime) > 0.35 && state.audioAnalysis.context?.state === 'running');

    await setGoogleObrSpatialAudioEnabled(true, { announce: false });
    await wait(() => state.obrSpatialAudio.processedBlocks > 2 && state.obrSpatialAudio.graph);
    await setGoogleObrSpatialAudioEnabled(false, { announce: false });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const graph = state.obrSpatialAudio.graph;
    const offTopology = window.__audioTopologySnapshot();
    const offWorkletEdges = offTopology.activeEdges.filter((edge) => (
      edge.sourceType === 'AudioWorkletNode'
      || edge.destinationType === 'AudioWorkletNode'
    ));
    if (offWorkletEdges.length) {
      errors.push(
        'OBR off retained ' + offWorkletEdges.length
        + ' live AudioWorklet connection(s)'
      );
    }
    const offPair = await captureNodePair(state.audioAnalysis.analyser, [graph.dryGain], 4096);
    const offSamples = offPair.output;
    const offWetSamples = await captureNodes([graph.wetGain], 4096);
    const offPcmComparison = comparePcm(offPair.input, offPair.output);
    const offInputMetrics = analyse(offPair.input, [937.5, 1500], state.audioAnalysis.context.sampleRate);
    const offMetrics = analyse(offSamples, [937.5, 1500], state.audioAnalysis.context.sampleRate);
    const offWetMetrics = analyse(offWetSamples, [937.5, 1500], state.audioAnalysis.context.sampleRate);
    const expected = [
      { rms: 0.22 / Math.sqrt(2), peak: 0.22 },
      { rms: 0.16 / Math.sqrt(2), peak: 0.16 }
    ];
    const offChecks = offMetrics.map((metric, index) => ({
      gainRatio: metric.rms / expected[index].rms,
      peakRatio: metric.peak / expected[index].peak,
      thdDb: metric.thdDb,
      dc: metric.dc
    }));
    for (const [index, check] of offChecks.entries()) {
      if (!(check.gainRatio > 0.94 && check.gainRatio < 1.06)) {
        errors.push('OBR off channel ' + index + ' gain ratio=' + check.gainRatio.toFixed(4));
      }
      if (!(check.peakRatio < 1.08)) {
        errors.push('OBR off channel ' + index + ' peak/clipping ratio=' + check.peakRatio.toFixed(4));
      }
      if (!(Math.abs(check.dc) < 0.002)) {
        errors.push('OBR off channel ' + index + ' DC=' + check.dc.toFixed(5));
      }
    }
    for (const [index, comparison] of offPcmComparison.entries()) {
      if (
        Math.abs(comparison.gain - 1) > 0.0001
        || comparison.errorDb > -100
        || comparison.correlation < 0.999999
      ) {
        errors.push(
          'OBR off PCM differs from input on channel ' + index
          + ': gain=' + comparison.gain.toFixed(7)
          + ', error=' + comparison.errorDb.toFixed(2) + ' dB'
        );
      }
    }
    for (const [index, metric] of offWetMetrics.entries()) {
      if (metric.rms > 0.00001 || metric.peak > 0.00005) {
        errors.push(
          'OBR off wet channel ' + index + ' remained audible: rms='
          + metric.rms.toFixed(7) + ', peak=' + metric.peak.toFixed(7)
        );
      }
    }
    const normalClockBefore = Number(audio.currentTime);
    const backendClockPosition = normalClockBefore + 1.1;
    apiJson = async (url) => String(url) === '/api/player/state'
      ? {
          song: { ...fixtureSong, position: backendClockPosition },
          queue: [],
          queueIndex: -1,
          position: backendClockPosition,
          duration: ${durationSeconds},
          playing: true,
          paused: false,
          volume: 1,
          url: ${JSON.stringify(`${baseUrl}/diagnostic.wav`)}
        }
      : {};
    await refreshPlayerState();
    const normalPlaybackRateAfterPoll = Number(audio.playbackRate);
    const normalClockAfter = Number(audio.currentTime);
    if (Math.abs(normalPlaybackRateAfterPoll - 1) > 0.0001) {
      errors.push(
        'Normal non-community polling changed playbackRate to '
        + normalPlaybackRateAfterPoll.toFixed(5)
      );
    }
    audio.playbackRate = 1;
    apiJson = async (url) => String(url).startsWith('/api/player/load?')
      ? {
          song: fixtureSong,
          playable: true,
          url: ${JSON.stringify(`${baseUrl}/diagnostic.wav`)},
          quality: 'standard'
        }
      : {};

    const transitionQuantums = [];
    const sampleTransition = async (label, action) => {
      const context = state.audioAnalysis.context;
      const processor = context.createScriptProcessor(256, 2, 2);
      const silence = context.createGain();
      silence.gain.value = 0;
      let index = 0;
      processor.onaudioprocess = (event) => {
        let sum = 0;
        let peak = 0;
        let count = 0;
        for (let channel = 0; channel < Math.min(2, event.inputBuffer.numberOfChannels); channel += 1) {
          const data = event.inputBuffer.getChannelData(channel);
          for (const value of data) {
            sum += value * value;
            peak = Math.max(peak, Math.abs(value));
            count += 1;
          }
        }
        transitionQuantums.push({
          label,
          index: index++,
          rms: Math.sqrt(sum / Math.max(1, count)),
          peak,
          dry: Number(graph.dryGain.gain.value),
          wet: Number(graph.wetGain.gain.value)
        });
      };
      graph.dryGain.connect(processor);
      graph.wetGain.connect(processor);
      processor.connect(silence);
      silence.connect(context.destination);
      await new Promise((resolve) => setTimeout(resolve, 80));
      await action();
      await new Promise((resolve) => setTimeout(resolve, 260));
      try { graph.dryGain.disconnect(processor); } catch {}
      try { graph.wetGain.disconnect(processor); } catch {}
      processor.disconnect();
      silence.disconnect();
    };
    await sampleTransition('enable', () => setGoogleObrSpatialAudioEnabled(true, { announce: false }));
    await sampleTransition('disable', () => setGoogleObrSpatialAudioEnabled(false, { announce: false }));
    const activeQuantums = transitionQuantums.filter((quantum) => quantum.index >= 1);
    const baselineRms = (offMetrics[0].rms + offMetrics[1].rms) / 2;
    const silentQuantums = activeQuantums.filter((quantum) => quantum.rms < baselineRms * 0.035);
    const doubledQuantums = activeQuantums.filter((quantum) => quantum.peak > 0.43);
    if (silentQuantums.length) errors.push('OBR toggle emitted ' + silentQuantums.length + ' silent quantums');
    if (doubledQuantums.length) errors.push('OBR toggle emitted ' + doubledQuantums.length + ' doubled/clipped quantums');

    const topologyBeforeStress = window.__audioTopologySnapshot();
    for (let cycle = 0; cycle < 5; cycle += 1) {
      await setGoogleObrSpatialAudioEnabled(true, { announce: false });
      await setGoogleObrChannelLayout(cycle % 2 ? '5.1' : '7.1', { announce: false });
      await wait(() => state.obrSpatialAudio.enabled && state.obrSpatialAudio.graph?.processedBlocks > 0);
      await setGoogleObrSpatialAudioEnabled(false, { announce: false });
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
    const topologyAfterStress = window.__audioTopologySnapshot();
    const newDuplicateEdges = topologyAfterStress.duplicateConnects.slice(
      topologyBeforeStress.duplicateConnects.length
    );
    if (newDuplicateEdges.length) {
      errors.push('Audio graph repeated ' + newDuplicateEdges.length + ' connect() calls during stress');
    }
    const retainedEdgeDelta = topologyAfterStress.activeEdges.length
      - topologyBeforeStress.activeEdges.length;
    if (retainedEdgeDelta > 0) {
      errors.push(
        'Audio graph retained ' + retainedEdgeDelta
        + ' live connection(s) after OBR/layout stress'
      );
    }

    const obrLayoutMetrics = [];
    for (const layout of ['stereo', '5.1', '7.1']) {
      await setGoogleObrChannelLayout(layout, { announce: false });
      const enabled = await setGoogleObrSpatialAudioEnabled(true, { announce: false });
      const layoutGraph = state.obrSpatialAudio.graph;
      const layoutReady = await wait(() => (
        state.obrSpatialAudio.enabled
        && layoutGraph?.connected
        && layoutGraph.processedBlocks > 0
      ));
      const wetSamples = layoutReady
        ? await captureNodes([layoutGraph.wetGain], 4096)
        : [[], []];
      const metrics = analyse(
        wetSamples,
        [937.5, 1500],
        state.audioAnalysis.context.sampleRate
      );
      const finite = metrics.every((metric) => (
        Number.isFinite(metric.rms)
        && Number.isFinite(metric.peak)
        && Number.isFinite(metric.dc)
      ));
      const expectedChannels = layout === '7.1' ? 8 : layout === '5.1' ? 6 : 2;
      if (!enabled || !layoutReady) errors.push('OBR ' + layout + ' did not become PCM-ready');
      if (layoutGraph?.inputChannelCount !== expectedChannels) {
        errors.push('OBR ' + layout + ' input channel count mismatch');
      }
      if (!finite || metrics.some((metric) => metric.rms < 0.001 || metric.peak >= 0.98)) {
        errors.push('OBR ' + layout + ' emitted silence, non-finite PCM, or clipping');
      }
      if (
        Number(layoutGraph?.dryGain?.gain?.value) > 0.001
        || Number(layoutGraph?.wetGain?.gain?.value) < 0.999
      ) {
        errors.push('OBR ' + layout + ' stable route has overlapping dry/wet gain');
      }
      obrLayoutMetrics.push({
        layout,
        inputChannels: layoutGraph?.inputChannelCount || 0,
        metrics
      });
      await setGoogleObrSpatialAudioEnabled(false, { announce: false });
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    const jitterEvents = [];
    const listeners = new Map();
    for (const name of ['waiting', 'stalled', 'seeking', 'pause', 'playing']) {
      const listener = () => jitterEvents.push({
        type: name,
        at: performance.now(),
        time: Number(audio.currentTime),
        readyState: Number(audio.readyState)
      });
      listeners.set(name, listener);
      audio.addEventListener(name, listener);
    }
    const jitterSong = { ...fixtureSong, id: 'audio-chain-jitter' };
    apiJson = async (url) => String(url).startsWith('/api/player/load?')
      ? {
          song: jitterSong,
          playable: true,
          url: ${JSON.stringify(`${baseUrl}/jitter.wav`)},
          quality: 'standard'
        }
      : {};
    await setGoogleObrSpatialAudioEnabled(false, { announce: false });
    await loadSong(jitterSong, { silent: true });
    const samples = [];
    let previousTime = Number(audio.currentTime);
    let frozenStartedAt = Number.NaN;
    let maximumFrozenMs = 0;
    const startedAt = performance.now();
    while (performance.now() - startedAt < 5_200) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      const now = performance.now();
      const currentTime = Number(audio.currentTime);
      samples.push({
        elapsed: Math.round(now - startedAt),
        currentTime,
        readyState: Number(audio.readyState),
        paused: audio.paused
      });
      if (!audio.paused && currentTime > 0.12 && currentTime <= previousTime + 0.002) {
        if (!Number.isFinite(frozenStartedAt)) frozenStartedAt = now;
        maximumFrozenMs = Math.max(maximumFrozenMs, now - frozenStartedAt);
      } else {
        frozenStartedAt = Number.NaN;
      }
      previousTime = currentTime;
    }
    if (maximumFrozenMs >= 260) {
      errors.push('Normal playback currentTime froze for ' + Math.round(maximumFrozenMs) + ' ms');
    }
    if (jitterEvents.some((event) => event.type === 'waiting' || event.type === 'stalled')) {
      errors.push('Normal playback emitted waiting/stalled under above-realtime jitter stream');
    }
    for (const [name, listener] of listeners) audio.removeEventListener(name, listener);

    const gapSong = { ...fixtureSong, id: 'audio-chain-recoverable-gap' };
    window.__DEBUG_audio_continuity_9c42 = [];
    apiJson = async (url) => String(url).startsWith('/api/player/load?')
      ? {
          song: gapSong,
          playable: true,
          url: ${JSON.stringify(`${baseUrl}/recoverable-gap.wav`)},
          quality: 'standard'
        }
      : {};
    await setGoogleObrSpatialAudioEnabled(false, { announce: false });
    await loadSong(gapSong, { silent: true });
    const gapSourceGeneration = state.audioPlaybackContinuity.sourceGeneration;
    const gapStartedAt = performance.now();
    let gapMaximumFrozenMs = 0;
    let gapFrozenAt = Number.NaN;
    let gapPreviousTime = Number(audio.currentTime);
    while (performance.now() - gapStartedAt < 13_500) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const now = performance.now();
      const current = Number(audio.currentTime);
      if (!audio.paused && current > 0.2 && current <= gapPreviousTime + 0.002) {
        if (!Number.isFinite(gapFrozenAt)) gapFrozenAt = now;
        gapMaximumFrozenMs = Math.max(gapMaximumFrozenMs, now - gapFrozenAt);
      } else {
        gapFrozenAt = Number.NaN;
      }
      gapPreviousTime = current;
      await monitorAudioPlaybackContinuity(now);
    }
    const gapFinalGeneration = state.audioPlaybackContinuity.sourceGeneration;
    const gapFinalTime = Number(audio.currentTime);
    const gapRecoveryCount = gapFinalGeneration - gapSourceGeneration;
    if (gapRecoveryCount < 1 || gapRecoveryCount > 2) {
      errors.push(
        'Recoverable waiting gap used an unexpected number of bounded renewals: '
        + gapRecoveryCount
      );
    }
    if (gapMaximumFrozenMs > ${UX_FREEZE_LIMIT_MS}) {
      errors.push(
        'Recoverable waiting gap exceeded the UX freeze limit: frozen='
        + Math.round(gapMaximumFrozenMs) + 'ms, limit=${UX_FREEZE_LIMIT_MS}ms'
      );
    }
    if (!(gapMaximumFrozenMs > 0 && gapFinalTime > 6.2)) {
      errors.push(
        'Recoverable waiting fixture did not freeze and resume as expected: frozen='
        + Math.round(gapMaximumFrozenMs) + 'ms, final=' + gapFinalTime.toFixed(3)
      );
    }

    audio.pause();
    apiJson = originalApiJson;
    state.currentSong = originalSong;
    return {
      pass: loaded && analysisReady && errors.length === 0,
      errors,
      off: {
        metrics: offMetrics,
        inputMetrics: offInputMetrics,
        pcmComparison: offPcmComparison,
        wetMetrics: offWetMetrics,
        checks: offChecks,
        liveWorkletEdges: offWorkletEdges
      },
      normalClockOwnership: {
        before: normalClockBefore,
        backendPosition: backendClockPosition,
        after: normalClockAfter,
        playbackRate: normalPlaybackRateAfterPoll
      },
      transitions: {
        quantumCount: transitionQuantums.length,
        silentQuantums: silentQuantums.length,
        doubledQuantums: doubledQuantums.length,
        sample: transitionQuantums.slice(0, 20)
      },
      obrLayouts: obrLayoutMetrics,
      topology: {
        activeBefore: topologyBeforeStress.activeEdges.length,
        activeAfter: topologyAfterStress.activeEdges.length,
        retainedEdgeDelta,
        duplicateConnects: newDuplicateEdges.length,
        beforeEdges: topologyBeforeStress.activeEdges,
        afterEdges: topologyAfterStress.activeEdges
      },
      jitter: {
        maximumFrozenMs: Math.round(maximumFrozenMs),
        events: jitterEvents,
        sample: samples.filter((_, index) => index % 20 === 0).slice(0, 24)
      },
      recoverableGap: {
        uxFreezeLimitMs: ${UX_FREEZE_LIMIT_MS},
        recoveryCount: gapRecoveryCount,
        sourceGenerationBefore: gapSourceGeneration,
        sourceGenerationAfter: gapFinalGeneration,
        maximumFrozenMs: Math.round(gapMaximumFrozenMs),
        finalTime: gapFinalTime,
        debug: window.__DEBUG_audio_continuity_9c42.slice()
      },
      stages: {
        mediaElement: Boolean(audio),
        webAudioContext: state.audioAnalysis.context?.state || '',
        webAudioSampleRate: state.audioAnalysis.context?.sampleRate || 0,
        mediaPlaybackRate: Number(audio.playbackRate),
        webAudioSourceMode: state.audioAnalysis.sourceMode,
        obrBackend: state.obrSpatialAudio.backend,
        nativeBridge: state.clientRuntime?.audioSpatialBackend || '',
        proxyFixture: ${JSON.stringify(`${baseUrl}/jitter.wav`)}
      }
    };
  })()`, true);

  console.log(JSON.stringify(result, null, 2));
  result.recoverableGapRequests = recoverableGapRequests;
  assert.equal(result.pass, true, result.errors.join('\n'));
} finally {
  try {
    if (socket?.readyState === 1) {
      await Promise.race([
        command('Browser.close').catch(() => {}),
        delay(600)
      ]);
    }
  } catch {
  }
  try {
    socket?.close();
  } catch {
  }
  if (browser.exitCode === null) {
    browser.kill();
    await Promise.race([
      new Promise((resolve) => browser.once('exit', resolve)),
      delay(2_000)
    ]);
  }
  spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
    stdio: 'ignore',
    windowsHide: true
  });
  for (const response of liveResponses) response.destroy();
  await new Promise((resolve) => server.close(resolve));
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    if (error?.code !== 'EPERM' && error?.code !== 'EBUSY') throw error;
    console.warn(`Audio diagnostic profile cleanup deferred: ${error.code}`);
  }
}
