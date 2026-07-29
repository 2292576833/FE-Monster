import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const workspaceRoot = path.resolve('.');
const jar = path.resolve(process.env.FE_TEST_JAR || 'out/fe-monster-java.jar');
const pluginZip = path.resolve('dist/plugins/FE-Monster-Kugou-API-Plugin-2.0.1.zip');
const javaCandidates = [
  process.env.FE_TEST_JAVA,
  process.env.FE_JAVA26_HOME ? path.join(process.env.FE_JAVA26_HOME, 'bin', 'java.exe') : '',
  path.resolve('runtime/java/bin/java.exe'),
  'E:\\java26\\bin\\java.exe',
  'java.exe'
].filter(Boolean);
const java = javaCandidates.find((candidate) => candidate === 'java.exe' || existsSync(candidate));
if (!java) throw new Error('Java runtime was not found');
if (!existsSync(jar)) throw new Error(`FE Monster jar was not found: ${jar}`);
const configuredDataDir = String(process.env.FE_TEST_DATA_DIR || '').trim();
const testDataDir = configuredDataDir
  ? path.resolve(configuredDataDir)
  : mkdtempSync(path.join(tmpdir(), 'fe-monster-kugou-readiness-'));
const ownsTestDataDir = !configuredDataDir;
const shouldImportPlugin = existsSync(pluginZip)
  && process.env.FE_KUGOU_IMPORT_PLUGIN !== '0'
  && (ownsTestDataDir || process.env.FE_KUGOU_IMPORT_PLUGIN === '1');

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
const app = spawn(java, ['-jar', jar, '--no-client'], {
  cwd: workspaceRoot,
  env: {
    ...process.env,
    FE_MONSTER_PORT: String(port),
    FE_MONSTER_BIND: '127.0.0.1',
    FE_MONSTER_DATA_DIR: testDataDir
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});
let output = '';
app.stdout.on('data', (chunk) => { output += String(chunk); });
app.stderr.on('data', (chunk) => { output += String(chunk); });
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function json(pathname, timeout = 30000) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function playableSource(song) {
  let source;
  try {
    source = await json(`/api/kugou/song/url?id=${encodeURIComponent(song.id)}&quality=standard`);
  } catch (error) {
    if (/returned (?:403|404|422):/.test(String(error?.message || ''))) return null;
    throw error;
  }
  if (!source.url) return null;
  const media = await fetch(`${baseUrl}/api/audio/stream?url=${encodeURIComponent(source.url)}`, {
    headers: { Range: 'bytes=0-4095' },
    signal: AbortSignal.timeout(120000)
  });
  const contentType = String(media.headers.get('content-type') || '');
  await media.body?.cancel();
  if ((media.status !== 200 && media.status !== 206)
      || !/^(audio\/|application\/octet-stream)/i.test(contentType)) return null;
  return { title: song.title, status: media.status, contentType: contentType.split(';')[0] };
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (app.exitCode !== null) throw new Error(`FE Monster exited early: ${output.trim()}`);
    try {
      await json('/api/music-apis', 1000);
      ready = true;
      break;
    } catch {
      await delay(120);
    }
  }
  if (!ready) throw new Error(`FE Monster did not start: ${output.trim()}`);

  if (shouldImportPlugin) {
    const imported = await fetch(
      `${baseUrl}/api/music-apis/import?${new URLSearchParams({ name: path.basename(pluginZip), trusted: 'true' })}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/zip',
          'x-fe-monster-import': '1'
        },
        body: readFileSync(pluginZip),
        signal: AbortSignal.timeout(30000)
      }
    );
    const importedPayload = await imported.json().catch(() => ({}));
    if (!imported.ok || importedPayload.ok === false) {
      throw new Error(`Kugou plugin import failed: ${JSON.stringify(importedPayload)}`);
    }
  }

  let reachable = false;
  let lastProviderStatus = {};
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = await json('/api/music-apis/status?provider=kugou').catch(() => ({}));
    lastProviderStatus = status;
    if (status.reachable === true) {
      reachable = true;
      break;
    }
    await delay(150);
  }
  if (!reachable) {
    throw new Error(
      `Imported Kugou plugin did not become reachable: ${JSON.stringify(lastProviderStatus)}`
      + (output.trim() ? `; app output: ${output.trim()}` : '')
    );
  }

  const account = await json('/api/login/status?provider=kugou');
  const library = await json('/api/kugou/user/playlists');
  const userPlaylists = Array.isArray(library.playlists) ? library.playlists : [];
  if (account.loggedIn === true && !userPlaylists.length) {
    throw new Error('Kugou is logged in but the user playlist library is empty');
  }

  const userPlaylistReports = [];
  let userPlaylistPlayback = null;
  if (account.loggedIn === true) {
    for (const playlist of userPlaylists.slice(0, 3)) {
      const tracks = await json(`/api/kugou/playlist/tracks?id=${encodeURIComponent(playlist.id)}&limit=20`);
      const trackSongs = Array.isArray(tracks.songs) ? tracks.songs : [];
      userPlaylistReports.push({ id: playlist.id, name: playlist.name, tracks: trackSongs.length });
      if (!userPlaylistPlayback) {
        for (const song of trackSongs.slice(0, 12)) {
          userPlaylistPlayback = await playableSource(song);
          if (userPlaylistPlayback) break;
        }
      }
    }
    if (!userPlaylistReports.some((playlist) => playlist.tracks > 0)) {
      throw new Error(`Kugou user playlists could not load songs: ${JSON.stringify(userPlaylistReports)}`);
    }
    if (!userPlaylistPlayback) {
      throw new Error(`Kugou user playlist songs had no playable audio: ${JSON.stringify(userPlaylistReports)}`);
    }
  }

  const recommendations = await json('/api/recommend/playlists?provider=kugou&limit=8');
  const playlists = Array.isArray(recommendations.playlists) ? recommendations.playlists : [];
  if (!playlists.length) throw new Error('Kugou recommendations returned no playlists');
  const playlistReports = [];
  let playlistPlayback = null;
  for (const playlist of playlists.slice(0, 5)) {
    const tracks = await json(`/api/kugou/playlist/tracks?id=${encodeURIComponent(playlist.id)}&limit=12`);
    const trackSongs = Array.isArray(tracks.songs) ? tracks.songs : [];
    playlistReports.push({ id: playlist.id, name: playlist.name, tracks: trackSongs.length });
    if (!playlistPlayback) {
      for (const song of trackSongs.slice(0, 8)) {
        playlistPlayback = await playableSource(song);
        if (playlistPlayback) break;
      }
    }
  }
  const loadedPlaylists = playlistReports.filter((playlist) => playlist.tracks > 0);
  if (loadedPlaylists.length < 4) {
    throw new Error(`Kugou playlist loading is unstable: ${JSON.stringify(playlistReports)}`);
  }
  if (!playlistPlayback) throw new Error(`Kugou playlist songs had no playable audio: ${JSON.stringify(playlistReports)}`);

  const search = await json(`/api/kugou/search?q=${encodeURIComponent('纯音乐')}&limit=30`);
  const songs = Array.isArray(search.songs) ? search.songs : [];
  let playbackReport = null;
  for (const song of songs) {
    playbackReport = await playableSource(song);
    if (playbackReport) break;
  }
  if (!playbackReport) throw new Error('Kugou search results had no playable proxied audio');
  console.log(`Kugou app readiness PASS ${JSON.stringify({ loggedIn: account.loggedIn, userPlaylists: userPlaylists.length, userPlaylistReports, userPlaylistPlayback, playlists: playlistReports, playlistPlayback, searchPlayback: playbackReport })}`);
} finally {
  if (app.exitCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(app.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      app.kill('SIGTERM');
    }
  }
  if (ownsTestDataDir) {
    await delay(750);
    try {
      rmSync(testDataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 200 });
    } catch (error) {
      console.warn(`Kugou readiness cleanup was deferred: ${error.message}`);
    }
  }
}
