import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'fe-monster-spatial-http-'));
const javaHomes = [
  path.join(root, 'runtime', 'java'),
  'E:\\java26',
  'D:\\java26',
  'C:\\java26',
  process.env.FE_JAVA26_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME
].filter(Boolean);

function executable(name) {
  for (const home of javaHomes) {
    const candidate = path.join(home, 'bin', `${name}.exe`);
    if (existsSync(candidate)) return candidate;
  }
  return `${name}.exe`;
}

function latestJar() {
  const out = path.join(root, 'out');
  return readdirSync(out)
    .filter((name) => /^fe-monster-java-.*\.jar$/i.test(name))
    .map((name) => path.join(out, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0];
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(url, predicate, timeoutMs = 12000) {
  const startedAt = Date.now();
  let lastError = null;
  let lastPayload = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const payload = await response.json();
        lastPayload = payload;
        if (!predicate || predicate(payload)) return payload;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw lastError || new Error(
    `Timed out waiting for ${url}; last payload: ${JSON.stringify(lastPayload)}`
  );
}

function post(url) {
  return fetch(url, {
    method: 'POST',
    headers: { 'X-FE-Monster-Audio': '1' }
  }).then(async (response) => {
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  });
}

async function mixerStatus(baseUrl) {
  const response = await fetch(`${baseUrl}/api/audio/mixer`, {
    headers: {
      Origin: baseUrl,
      'Sec-Fetch-Site': 'same-origin'
    }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Mixer HTTP ${response.status}`);
  return payload;
}

async function applyMixerPreset(baseUrl, presetId) {
  const current = await mixerStatus(baseUrl);
  const response = await fetch(
    `${baseUrl}/api/audio/mixer/presets/${encodeURIComponent(presetId)}/apply`,
    {
      method: 'POST',
      headers: {
        Origin: baseUrl,
        'Sec-Fetch-Site': 'same-origin',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ expectedRevision: Number(current.revision) })
    }
  );
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Mixer preset HTTP ${response.status}`);
  return payload;
}

async function* pcmBlocks() {
  let phase = 0;
  for (let block = 0; block < 48; block += 1) {
    const bytes = Buffer.allocUnsafe(1024 * 2 * Float32Array.BYTES_PER_ELEMENT);
    for (let frame = 0; frame < 1024; frame += 1) {
      const left = Math.sin(phase) * 0.003;
      const right = Math.sin(phase * 1.011 + 0.19) * 0.0027;
      bytes.writeFloatLE(left, frame * 8);
      bytes.writeFloatLE(right, frame * 8 + 4);
      phase += Math.PI * 2 * 83 / 48000;
    }
    yield bytes;
    await new Promise((resolve) => setTimeout(resolve, 18));
  }
}

function pcmTransportBlock(blockIndex = 0) {
  const frames = 4096;
  const channels = 2;
  const bytes = Buffer.allocUnsafe(frames * channels * Float32Array.BYTES_PER_ELEMENT);
  let phase = blockIndex * frames * Math.PI * 2 * 83 / 48000;
  for (let frame = 0; frame < frames; frame += 1) {
    bytes.writeFloatLE(Math.sin(phase) * 0.003, frame * 8);
    bytes.writeFloatLE(Math.sin(phase * 1.011 + 0.19) * 0.0027, frame * 8 + 4);
    phase += Math.PI * 2 * 83 / 48000;
  }
  return bytes;
}

async function postPcmBlock(baseUrl, session, generation, sequence, body) {
  const response = await fetch(
    `${baseUrl}/api/audio/spatial/block?session=${session}&generation=${generation}&inputChannels=2&sequence=${sequence}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-FE-Monster-Audio': '1'
      },
      body
    }
  );
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `PCM block HTTP ${response.status}`);
  return payload;
}

const jar = latestJar();
if (!jar) throw new Error('Build the Java application before the HTTP stream probe.');
const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(executable('java'), [
  '--enable-native-access=ALL-UNNAMED',
  '-jar',
  jar,
  '--server'
], {
  cwd: root,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    FE_MONSTER_ROOT: root,
    FE_MONSTER_DATA_DIR: dataDir,
    FE_MONSTER_PORT: String(port),
    FE_MONSTER_BIND: '127.0.0.1',
    FE_MUSIC_API_AUTOSTART: '0'
  }
});
let stderr = '';
server.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  await waitFor(`${baseUrl}/api/app/version`, () => true);

  // The invariant Mixer must also bootstrap when both optional spatial
  // stages are disabled. This is the new-install/default route and used to
  // deadlock with the first atomic spatial + Mixer revision still staged.
  const mixerOnlyPreset = await applyMixerPreset(baseUrl, 'hall');
  if (mixerOnlyPreset.parameters?.enabled !== true
      || mixerOnlyPreset.parameters?.upmixEnabled !== false
      || mixerOnlyPreset.parameters?.obrEnabled !== false) {
    throw new Error('The hall preset did not configure the Mixer-only route');
  }
  const mixerOnlyStart = await post(
    `${baseUrl}/api/audio/spatial/start?sampleRate=48000&inputChannels=2&layoutChannels=6&algorithm=2`
  );
  const mixerOnlySession = Number(mixerOnlyStart.session);
  const mixerOnlyGeneration = Number(mixerOnlyStart.generation);
  for (let sequence = 0; sequence < 4; sequence += 1) {
    await postPcmBlock(
      baseUrl,
      mixerOnlySession,
      mixerOnlyGeneration,
      sequence,
      pcmTransportBlock(sequence)
    );
  }
  const mixerOnlyStatus = await waitFor(
    `${baseUrl}/api/audio/spatial/status`,
    (status) => status.active === true
      && Number(status.session) === mixerOnlySession
      && Number(status.generation) === mixerOnlyGeneration
      && status.transitionPending !== true
      && status.spatialRevisionCommitted === true
      && Number(status.framesProcessed) > 0
      && Number(status.mixerProcessCalls) > 0
      && status.upmixEnabled === false
      && status.obrEnabled === false
      && Number(status.virtualBedChannels) === 2
      && status.spatialRoute === 'stereo-mixer-out'
  );
  await postPcmBlock(
    baseUrl,
    mixerOnlySession,
    mixerOnlyGeneration,
    4,
    pcmTransportBlock(4)
  );
  const mixerOnlySteadyStatus = await waitFor(
    `${baseUrl}/api/audio/spatial/status`,
    (status) => Number(status.framesProcessed) > Number(mixerOnlyStatus.framesProcessed)
  );
  if (Number(mixerOnlySteadyStatus.rustUpmixProcessCalls)
      !== Number(mixerOnlyStatus.rustUpmixProcessCalls)
      || Number(mixerOnlySteadyStatus.obrProcessCalls)
        !== Number(mixerOnlyStatus.obrProcessCalls)) {
    throw new Error('The steady Mixer-only route still invoked upmix or OBR');
  }
  await post(
    `${baseUrl}/api/audio/spatial/stop?session=${mixerOnlySession}&generation=${mixerOnlyGeneration}`
  );

  // New installations deliberately start with both optional spatial stages
  // disabled. This probe explicitly selects the 3D preset because the
  // assertions below exercise the full upmix + Mixer + OBR route.
  const fullSpatialPreset = await applyMixerPreset(baseUrl, 'surround-3d');
  if (fullSpatialPreset.parameters?.upmixEnabled !== true
      || fullSpatialPreset.parameters?.obrEnabled !== true) {
    throw new Error('The surround-3d preset did not enable the full spatial route');
  }

  // Browser fetch request bodies over this HTTP/1.1 server must be finite.
  // A completed block request must not tear down the long-lived native session.
  const blockStart = await post(
    `${baseUrl}/api/audio/spatial/start?sampleRate=48000&inputChannels=2&layoutChannels=8&algorithm=2`
  );
  const blockSession = Number(blockStart.session);
  const blockGeneration = Number(blockStart.generation);
  if (!blockStart.ok || !blockSession || !blockGeneration || blockStart.rustUpmixActive !== true) {
    throw new Error(`Native block start failed: ${JSON.stringify(blockStart)}`);
  }
  const blockResults = [];
  for (let sequence = 0; sequence < 4; sequence += 1) {
    blockResults.push(await postPcmBlock(
      baseUrl,
      blockSession,
      blockGeneration,
      sequence,
      pcmTransportBlock(sequence)
    ));
  }
  const blockStatus = await waitFor(
    `${baseUrl}/api/audio/spatial/status`,
    (status) => status.active === true
      && Number(status.session) === blockSession
      && Number(status.generation) === blockGeneration
      && Number(status.rustUpmixProcessCalls) >= 4
      && Number(status.obrProcessCalls) >= 4
  );
  const shortBlock = await fetch(
    `${baseUrl}/api/audio/spatial/block?session=${blockSession}&generation=${blockGeneration}&inputChannels=2&sequence=4`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-FE-Monster-Audio': '1'
      },
      body: pcmTransportBlock(4).subarray(0, -4)
    }
  );
  if (shortBlock.status !== 400) {
    throw new Error(`Short PCM block must fail closed with HTTP 400, got ${shortBlock.status}`);
  }
  const afterShortBlock = await fetch(`${baseUrl}/api/audio/spatial/status`).then((response) => response.json());
  if (!afterShortBlock.active || Number(afterShortBlock.session) !== blockSession) {
    throw new Error('A rejected finite block stopped the active native spatial session');
  }

  // A retried HTTP request is idempotent: the same sequence must be
  // acknowledged without rendering the transport block twice.
  const framesBeforeDuplicate = Number(afterShortBlock.framesProcessed);
  const duplicateBlock = await postPcmBlock(
    baseUrl,
    blockSession,
    blockGeneration,
    3,
    pcmTransportBlock(3)
  );
  const afterDuplicate = await fetch(`${baseUrl}/api/audio/spatial/status`)
    .then((response) => response.json());
  if (Number(afterDuplicate.framesProcessed) !== framesBeforeDuplicate) {
    throw new Error('A retried native PCM sequence was rendered twice');
  }

  // Seeking rotates only the timeline generation. The native pipeline,
  // session and committed Mixer remain alive while obsolete HTTP blocks are
  // rejected and the new generation rearms the production preroll queue.
  const mixerBeforeTimeline = await mixerStatus(baseUrl);
  const timelineReset = await post(
    `${baseUrl}/api/audio/spatial/timeline?session=${blockSession}&generation=${blockGeneration}`
  );
  const timelineGeneration = Number(timelineReset.generation);
  if (!timelineReset.ok
      || Number(timelineReset.previousGeneration) !== blockGeneration
      || timelineGeneration <= blockGeneration
      || timelineReset.flushed !== true
      || timelineReset.rearmed !== true
      || !Number.isFinite(Number(timelineReset.resetElapsedMs))
      || Number(timelineReset.resetElapsedMs) > 100) {
    throw new Error(`Native timeline reset failed: ${JSON.stringify(timelineReset)}`);
  }
  const staleGenerationBlock = await fetch(
    `${baseUrl}/api/audio/spatial/block?session=${blockSession}&generation=${blockGeneration}&inputChannels=2&sequence=4`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-FE-Monster-Audio': '1'
      },
      body: pcmTransportBlock(4)
    }
  );
  if (staleGenerationBlock.status !== 400) {
    throw new Error(
      `An obsolete timeline generation must fail closed with HTTP 400, got ${staleGenerationBlock.status}`
    );
  }
  await postPcmBlock(baseUrl, blockSession, timelineGeneration, 0, pcmTransportBlock(5));
  await postPcmBlock(baseUrl, blockSession, timelineGeneration, 1, pcmTransportBlock(6));
  const timelineStatus = await waitFor(
    `${baseUrl}/api/audio/spatial/status`,
    (status) => status.active === true
      && Number(status.session) === blockSession
      && Number(status.generation) === timelineGeneration
      && status.voiceStarted === true
      && Number(status.buffersQueued) > 0
      && Number(status.droppedBuffers) === 0
      && Number(status.queueUnderruns) === 0
      && Number(status.bufferPoolExhaustions) === 0
  );
  const mixerAfterTimeline = await mixerStatus(baseUrl);
  if (Number(mixerAfterTimeline.revision) !== Number(mixerBeforeTimeline.revision)
      || mixerAfterTimeline.mixerActive !== mixerBeforeTimeline.mixerActive) {
    throw new Error('A timeline-only reset replaced or revised the committed Mixer graph');
  }
  await post(
    `${baseUrl}/api/audio/spatial/stop?session=${blockSession}&generation=${timelineGeneration}`
  );

  const start = await post(
    `${baseUrl}/api/audio/spatial/start?sampleRate=48000&inputChannels=2&layoutChannels=8&algorithm=2`
  );
  const session = Number(start.session);
  const generation = Number(start.generation);
  if (!start.ok || !session || !generation || start.rustUpmixActive !== true) {
    throw new Error(`Native start failed: ${JSON.stringify(start)}`);
  }

  const streamPromise = fetch(
    `${baseUrl}/api/audio/spatial/stream?session=${session}&generation=${generation}&inputChannels=2`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-FE-Monster-Audio': '1'
      },
      body: Readable.from(pcmBlocks()),
      duplex: 'half'
    }
  );
  const preroll = await waitFor(
    `${baseUrl}/api/audio/spatial/status`,
    (status) =>
      status.active === true
      && Number(status.session) === session
      && Number(status.generation) === generation
      && Number(status.rustUpmixProcessCalls) >= 4
      && Number(status.obrProcessCalls) >= 4
  );
  const mixer = await mixerStatus(baseUrl);
  const activated = await post(
    `${baseUrl}/api/audio/spatial/activate?session=${session}&generation=${generation}`
  );
  if (!activated.ok) throw new Error(`Native activate failed: ${JSON.stringify(activated)}`);

  const streamResponse = await streamPromise;
  const streamResult = await streamResponse.json();
  if (!streamResponse.ok) {
    throw new Error(streamResult.error || `PCM stream HTTP ${streamResponse.status}`);
  }
  const stopped = await waitFor(
    `${baseUrl}/api/audio/spatial/status`,
    (status) => status.active !== true
  );
  const pass =
    Number(preroll.droppedBuffers) === 0
    && Number(preroll.bufferPoolExhaustions) === 0
    && preroll.rustUpmixActive === true
    && preroll.voiceStarted === true
    && mixer.playbackState === 'native-mixer'
    && mixer.mixerActive === true
    && Number(mixer.processCalls) >= 4
    && mixer.upmix?.available === true
    && mixer.upmix?.active === true
    && mixer.obr?.available === true
    && mixer.obr?.rendererReady === true
    && Number(mixer.order?.upmix) < Number(mixer.order?.mixer)
    && Number(mixer.order?.mixer) < Number(mixer.order?.obr)
    && Number(streamResult.blocks) === 12
    && stopped.active === false;
  const report = {
    pass,
    mixerOnlyBootstrap: {
      frames: mixerOnlyStatus.framesProcessed,
      mixerCalls: mixerOnlyStatus.mixerProcessCalls,
      steadyUpmixDelta: Number(mixerOnlySteadyStatus.rustUpmixProcessCalls)
        - Number(mixerOnlyStatus.rustUpmixProcessCalls),
      steadyObrDelta: Number(mixerOnlySteadyStatus.obrProcessCalls)
        - Number(mixerOnlyStatus.obrProcessCalls),
      spatialRevisionCommitted: mixerOnlyStatus.spatialRevisionCommitted === true
    },
    finiteBlocks: {
      count: blockResults.length,
      sessionStayedActive: blockStatus.active === true,
      rustCalls: blockStatus.rustUpmixProcessCalls,
      obrCalls: blockStatus.obrProcessCalls,
      shortBlockRejected: shortBlock.status === 400,
      duplicateSequenceIdempotent: duplicateBlock.ok === true
        && Number(afterDuplicate.framesProcessed) === framesBeforeDuplicate,
      timelineReset: {
        generationAdvanced: timelineGeneration > blockGeneration,
        staleGenerationRejected: staleGenerationBlock.status === 400,
        voiceRearmed: timelineStatus.voiceStarted === true,
        queued: timelineStatus.buffersQueued,
        dropped: timelineStatus.droppedBuffers,
        underruns: timelineStatus.queueUnderruns,
        poolExhaustions: timelineStatus.bufferPoolExhaustions,
        resetElapsedMs: timelineReset.resetElapsedMs,
        maximumResetMs: 100,
        mixerRevisionPreserved: Number(mixerAfterTimeline.revision)
          === Number(mixerBeforeTimeline.revision)
      }
    },
    session,
    generation,
    preroll: {
      rustCalls: preroll.rustUpmixProcessCalls,
      obrCalls: preroll.obrProcessCalls,
      x3dCalls: preroll.x3dCalculateCalls,
      dropped: preroll.droppedBuffers,
      queueUnderruns: preroll.queueUnderruns,
      poolExhaustions: preroll.bufferPoolExhaustions,
      voiceStarted: preroll.voiceStarted,
      prerollTargetBuffers: preroll.prerollTargetBuffers
    },
    mixer: {
      playbackState: mixer.playbackState,
      processCalls: mixer.processCalls,
      upmix: mixer.upmix,
      obr: mixer.obr,
      order: mixer.order
    },
    stream: streamResult,
    stopped: stopped.active === false
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!pass) process.exitCode = 1;
} finally {
  if (!server.killed) server.kill();
  await new Promise((resolve) => {
    if (server.exitCode != null) resolve();
    else {
      server.once('exit', resolve);
      setTimeout(resolve, 1500);
    }
  });
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (process.exitCode && stderr) process.stderr.write(stderr);
}
