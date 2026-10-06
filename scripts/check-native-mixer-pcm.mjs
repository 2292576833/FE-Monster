import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'out');
const jar = path.resolve(readFileSync(path.join(out, 'run-jar.txt'), 'utf8').trim());
assert.equal(path.dirname(jar).toLowerCase(), out.toLowerCase(), 'run marker must stay in workspace/out');
assert.match(path.basename(jar), /^fe-monster-java-.+\.jar$/i);
assert.ok(existsSync(jar), 'an existing immutable Java build is required');
const java = [
  process.env.FE_JAVA_HOME && path.join(process.env.FE_JAVA_HOME, 'bin/java.exe'),
  'C:/Program Files/Eclipse Adoptium/jdk-17.0.19.10-hotspot/bin/java.exe',
  process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin/java.exe')
].filter(Boolean).find(existsSync) || 'java.exe';
const scratch = mkdtempSync(path.join(root, '.tmp-native-mixer-pcm-'));
const data = path.join(scratch, 'data');
const temporary = path.join(scratch, 'temp');
mkdirSync(data); mkdirSync(temporary);
const reserve = net.createServer();
await new Promise((resolve, reject) => { reserve.once('error', reject); reserve.listen(0, '127.0.0.1', resolve); });
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(java, ['-jar', jar, '--server'], {
  cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env, TEMP: temporary, TMP: temporary,
    FE_MONSTER_ROOT: root, FE_MONSTER_DATA_DIR: data,
    FE_MONSTER_BIND: '127.0.0.1', FE_MONSTER_PORT: String(port),
    FE_MUSIC_API_AUTOSTART: '0'
  }
});
let logs = '';
server.stdout.on('data', (chunk) => { logs = (logs + chunk).slice(-16000); });
server.stderr.on('data', (chunk) => { logs = (logs + chunk).slice(-16000); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let session = 0, generation = 0, sequence = 0, sent = 0, silent = false, stopPump = false, pump = null, pumpFailure = null;
let nativeActivationCalls = 0;
async function request(route, options = {}) {
  if (route.startsWith('/api/audio/spatial/activate')) {
    nativeActivationCalls += 1;
    throw new Error('This silent regression must never activate hardware output.');
  }
  const response = await fetch(base + route, { signal: AbortSignal.timeout(12000), ...options });
  const body = await response.json();
  if (!response.ok || body.ok === false) throw new Error(`${route}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}
const originHeaders = { Origin: base, 'Sec-Fetch-Site': 'same-origin' };
const nativeHeaders = { 'X-FE-Monster-Audio': '1' };
const status = () => request('/api/audio/spatial/status');
async function patch(parameters) {
  const current = await request('/api/audio/mixer', { headers: originHeaders });
  return request('/api/audio/mixer', {
    method: 'PATCH', headers: { ...originHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedRevision: current.revision, parameters })
  });
}
async function waitFor(action, predicate, timeout = 12000) {
  const end = Date.now() + timeout;
  let last = null;
  while (Date.now() < end) {
    if (server.exitCode !== null) throw new Error(`Isolated Java exited: ${logs}`);
    if (pumpFailure) throw pumpFailure;
    try { last = await action(); if (predicate(last)) return last; } catch (error) { last = error.message; }
    await sleep(30);
  }
  throw new Error(`Timed out: ${JSON.stringify(last)}\n${logs}`);
}
const frames = 4096;
const tone = Buffer.alloc(frames * 2 * 4);
for (let index = 0; index < frames; index += 1) {
  // Both tones have whole periods in every native 256-frame render block.
  tone.writeFloatLE(Math.sin(2 * Math.PI * 750 * index / 48000) * 0.12, index * 8);
  tone.writeFloatLE(Math.cos(2 * Math.PI * 1500 * index / 48000) * 0.08, index * 8 + 4);
}
const silence = Buffer.alloc(tone.length);
async function settledPhase(name, revision) {
  const after = sent + 6;
  const value = await waitFor(status, (snapshot) => sent >= after
    && snapshot.active === true && snapshot.transitionPending === false
    && snapshot.spatialRevisionCommitted === true
    && Number(snapshot.spatialActiveRevision) === Number(revision)
    && Number(snapshot.mixerProcessCalls) > 0);
  assert.equal(value.spatialRoute, 'stereo-mixer-out');
  assert.equal(value.upmixEnabled, false);
  assert.equal(value.obrEnabled, false);
  assert.equal(value.virtualBedChannels, 2);
  assert.equal(value.lastResult, 0);
  return { name, revision, rms: value.outputEnergy, processCalls: value.mixerProcessCalls,
    frames: value.framesProcessed, upmixCalls: value.rustUpmixProcessCalls, obrCalls: value.obrProcessCalls };
}

try {
  const runtime = await waitFor(() => request('/api/app/runtime'), (value) => value.nativeAudio?.active === true);
  assert.equal(runtime.nativeAudio.spatialStreaming, true);
  const clean = await patch({
    enabled: true, upmixEnabled: false, obrEnabled: false,
    inputGainDb: 0, outputGainDb: 0, balance: 0, stereoWidth: 1, eqDb: Array(10).fill(0),
    compressorEnabled: false, limiterEnabled: false, reverbEnabled: false,
    chorusEnabled: false, flangerEnabled: false, phaserEnabled: false,
    delayEnabled: false, earlyReflectionsEnabled: false
  });
  const started = await request('/api/audio/spatial/start?sampleRate=48000&inputChannels=2&layoutChannels=6&algorithm=2', {
    method: 'POST', headers: nativeHeaders
  });
  assert.equal(started.muted, true, 'native output must start hardware-muted');
  session = started.session; generation = started.generation;
  assert.ok(session > 0 && generation > 0);
  pump = (async () => {
    while (!stopPump) {
      await request(`/api/audio/spatial/block?session=${session}&generation=${generation}&inputChannels=2&sequence=${sequence++}`, {
        method: 'POST', headers: { ...nativeHeaders, 'Content-Type': 'application/octet-stream' },
        body: silent ? silence : tone
      });
      sent += 1;
      await sleep(35);
    }
  })().catch((error) => { pumpFailure = error; });
  const baseline = await settledPhase('0 dB', clean.revision);
  const reduced = await patch({ outputGainDb: -12 });
  const attenuated = await settledPhase('-12 dB', reduced.revision);
  const restored = await patch({ outputGainDb: 0 });
  const recovered = await settledPhase('restored 0 dB', restored.revision);
  silent = true;
  const mutedInput = await settledPhase('silent PCM input', restored.revision);
  const expectedRms = Math.sqrt((0.12 ** 2 + 0.08 ** 2) / 4);
  assert.ok(Math.abs(baseline.rms / expectedRms - 1) < 0.025, 'clean Mixer PCM must retain input RMS');
  const gainRatio = attenuated.rms / baseline.rms;
  assert.ok(Math.abs(gainRatio - 10 ** (-12 / 20)) < 0.015, `-12 dB PCM gain mismatch: ${gainRatio}`);
  assert.ok(Math.abs(recovered.rms / baseline.rms - 1) < 0.025, 'restoring gain must restore PCM amplitude');
  assert.ok(mutedInput.rms < 1e-7, 'silent input must produce silent rendered PCM');
  assert.ok(baseline.processCalls < attenuated.processCalls && attenuated.processCalls < recovered.processCalls
    && recovered.processCalls < mutedInput.processCalls, 'native Mixer processing must advance through every parameter change');
  assert.equal(mutedInput.upmixCalls, baseline.upmixCalls, 'disabled upmix must not run');
  assert.equal(mutedInput.obrCalls, baseline.obrCalls, 'disabled OBR must not run');
  const mixer = await request('/api/audio/mixer', { headers: originHeaders });
  assert.equal(mixer.playbackState, 'native-mixer');
  assert.equal(mixer.mixerActive, true);
  assert.equal(nativeActivationCalls, 0);
  const report = { pass: true, jar, java, nativeDll: runtime.nativeAudio.dll,
    isolatedData: true, hardwareOutputKeptMuted: true,
    route: 'stereo-mixer-out', phases: [baseline, attenuated, recovered, mutedInput], gainRatio,
    measuredAt: new Date().toISOString() };
  const reportDir = path.join(root, 'output/audio-mixer');
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(path.join(reportDir, 'native-mixer-pcm.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  stopPump = true;
  if (pump) await pump;
  if (session) await request(`/api/audio/spatial/stop?session=${session}&generation=${generation}`, {
    method: 'POST', headers: nativeHeaders
  }).catch(() => {});
  if (server.exitCode === null) server.kill();
  await Promise.race([new Promise((resolve) => server.once('exit', resolve)), sleep(2000)]);
  // Both paths are resolved and checked before any recursive removal.
  const resolvedScratch = path.resolve(scratch);
  assert.ok(resolvedScratch.startsWith(root + path.sep) && path.basename(resolvedScratch).startsWith('.tmp-native-mixer-pcm-'));
  rmSync(resolvedScratch, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
}
