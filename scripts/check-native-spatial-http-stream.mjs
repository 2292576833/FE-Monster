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
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const payload = await response.json();
        if (!predicate || predicate(payload)) return payload;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
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
    && Number(streamResult.blocks) === 12
    && stopped.active === false;
  const report = {
    pass,
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
