import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const jar = path.resolve(process.env.FE_TEST_JAR || 'out/fe-monster-java.jar');
const javaCandidates = [
  process.env.FE_TEST_JAVA,
  process.env.FE_JAVA26_HOME ? path.join(process.env.FE_JAVA26_HOME, 'bin', 'java.exe') : '',
  path.resolve('runtime/java/bin/java.exe'),
  'E:\\java26\\bin\\java.exe',
  'java.exe'
].filter(Boolean);
const java = javaCandidates.find((candidate) => candidate === 'java.exe' || existsSync(candidate));
if (!java || !existsSync(jar)) throw new Error('Java runtime or FE Monster jar is missing');

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const searchQuery = String(process.env.FE_QISHUI_TEST_QUERY || '周杰伦').trim();
const app = spawn(java, ['-jar', jar, '--no-client'], {
  cwd: root,
  env: { ...process.env, FE_MONSTER_PORT: String(port), FE_MONSTER_BIND: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});
let output = '';
app.stdout.on('data', (chunk) => { output += String(chunk); });
app.stderr.on('data', (chunk) => { output += String(chunk); });
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function requestJson(pathname, timeout = 15000) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${pathname}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout)
  });
  const payload = await response.json().catch(() => ({}));
  const elapsedMs = performance.now() - startedAt;
  if (!response.ok) throw new Error(`${pathname} returned ${response.status} in ${elapsedMs.toFixed(0)}ms: ${JSON.stringify(payload)}`);
  return { payload, elapsedMs };
}

try {
  let appReady = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (app.exitCode !== null) throw new Error(`FE Monster exited early: ${output.trim()}`);
    try {
      await requestJson('/api/music-apis', 800);
      appReady = true;
      break;
    } catch {
      await delay(120);
    }
  }
  if (!appReady) throw new Error(`FE Monster did not start: ${output.trim()}`);

  let pluginReadyMs = 0;
  const pluginStartedAt = performance.now();
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = await requestJson('/api/music-apis/status?provider=qishui', 1200).catch(() => null);
    if (status?.payload?.reachable === true) {
      pluginReadyMs = performance.now() - pluginStartedAt;
      break;
    }
    await delay(120);
  }
  if (!pluginReadyMs) throw new Error('Qishui plugin did not become reachable within 12 seconds');

  const health = await requestJson('/api/qishui/health', 5000).catch(() => ({ payload: { ok: true }, elapsedMs: 0 }));
  const search = await requestJson(`/api/qishui/search?q=${encodeURIComponent(searchQuery)}&limit=10`, 15000);
  const songs = Array.isArray(search.payload.songs) ? search.payload.songs : [];
  if (!songs.length) throw new Error(`Qishui search returned no songs in ${search.elapsedMs.toFixed(0)}ms`);

  let playback = null;
  const playbackAttempts = [];
  for (const song of songs) {
    try {
      const source = await requestJson(`/api/qishui/song/url?id=${encodeURIComponent(song.id)}&quality=standard`, 15000);
      if (!source.payload.url) {
        playbackAttempts.push({ id: song.id, title: song.title, sourceMs: source.elapsedMs, error: source.payload.error || 'missing URL' });
        continue;
      }
      const sourceUrl = new URL(source.payload.url);
      const localPluginAudio = sourceUrl.pathname === '/audio'
        && ['127.0.0.1', 'localhost', '::1'].includes(sourceUrl.hostname);
      const playbackUrl = localPluginAudio
        ? sourceUrl.href
        : `${baseUrl}/api/audio/stream?url=${encodeURIComponent(sourceUrl.href)}`;
      const mediaStartedAt = performance.now();
      const media = await fetch(playbackUrl, {
        headers: {
          Range: 'bytes=0-4095',
          Origin: baseUrl
        },
        signal: AbortSignal.timeout(30000)
      });
      const contentType = String(media.headers.get('content-type') || '');
      const mediaMs = performance.now() - mediaStartedAt;
      const playableMedia = (media.status === 200 || media.status === 206)
        && /^(audio\/|application\/octet-stream)/i.test(contentType);
      const responseBody = playableMedia ? '' : (await media.text()).slice(0, 500);
      if (playableMedia) await media.body?.cancel();
      playbackAttempts.push({
        id: song.id,
        title: song.title,
        sourceMs: source.elapsedMs,
        mediaMs,
        status: media.status,
        contentType,
        route: localPluginAudio ? 'plugin-direct' : 'app-proxy',
        cors: media.headers.get('access-control-allow-origin') || '',
        ...(responseBody ? { responseBody } : {})
      });
      if (playableMedia) {
        playback = {
          title: song.title,
          status: media.status,
          contentType: contentType.split(';')[0],
          sourceMs: source.elapsedMs,
          mediaMs: Number(mediaMs.toFixed(1))
        };
        break;
      }
    } catch (error) {
      playbackAttempts.push({ id: song.id, title: song.title, error: error.message });
    }
  }
  if (!playback) throw new Error(`Qishui search results exposed no playable audio: ${JSON.stringify(playbackAttempts)}`);

  const result = {
    pluginReadyMs: Number(pluginReadyMs.toFixed(1)),
    healthMs: Number(health.elapsedMs.toFixed(1)),
    searchMs: Number(search.elapsedMs.toFixed(1)),
    songCount: songs.length,
    playback
  };
  result.pass = result.pluginReadyMs < 12000 && result.searchMs < 15000;
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.pass ? 0 : 1;
} finally {
  if (app.exitCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      app.kill('SIGTERM');
    }
  }
}
