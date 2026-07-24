import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';

const timeoutMs = 20_000;
const pluginEntry = path.resolve('music-api-plugins/kugou/src/server-entry.cjs');

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
const plugin = spawn(process.execPath, [pluginEntry, `--port=${port}`], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});
let pluginError = '';
plugin.stderr.on('data', (chunk) => { pluginError += String(chunk); });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const json = async (pathname) => {
  const response = await fetch(`${baseUrl}${pathname}`, { signal: AbortSignal.timeout(timeoutMs) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
};

function candidateUrl(payload) {
  const values = [
    payload?.url,
    payload?.play_url,
    payload?.playUrl,
    payload?.data?.url,
    payload?.data?.play_url,
    payload?.data?.playUrl,
    ...(Array.isArray(payload?.backup_url) ? payload.backup_url : []),
    ...(Array.isArray(payload?.data?.backup_url) ? payload.data.backup_url : [])
  ].flatMap((value) => Array.isArray(value) ? value : [value]);
  return values.map((value) => String(value || '').trim()).find((value) => /^https?:\/\//i.test(value)) || '';
}

function nestedArray(root, names, depth = 0) {
  if (depth > 7 || root == null) return [];
  if (Array.isArray(root)) return root;
  if (typeof root !== 'object') return [];
  for (const name of names) {
    if (Array.isArray(root[name])) return root[name];
  }
  for (const value of Object.values(root)) {
    const found = nestedArray(value, names, depth + 1);
    if (found.length) return found;
  }
  return [];
}

function songHash(song) {
  return String(song?.hash || song?.Hash || song?.FileHash || song?.fileHash || '').trim();
}

try {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (plugin.exitCode !== null) throw new Error(`Kugou plugin exited early: ${pluginError.trim()}`);
    try {
      await json('/health');
      break;
    } catch (error) {
      if (attempt === 59) throw error;
      await delay(100);
    }
  }

  const top = await json('/top/playlist?page=1&pagesize=12&withsong=1');
  const playlists = nestedArray(top, ['special_list', 'playlists', 'lists']);
  if (!playlists.length) throw new Error('Kugou top playlists returned no recognizable playlists');
  let playlistReport = null;
  let numericAudioId = '';
  for (const playlist of playlists.slice(0, 12)) {
    const id = String(playlist.global_collection_id || playlist.specialid || playlist.id || '').trim();
    if (!id) continue;
    const tracks = await json(`/playlist/track/all?id=${encodeURIComponent(id)}&page=1&pagesize=8`);
    const songs = nestedArray(tracks, ['songs', 'songlist', 'info', 'lists']);
    const song = songs.find((item) => /^[a-f0-9]{32}$/i.test(songHash(item)));
    if (!song) continue;
    playlistReport = {
      id,
      name: playlist.specialname || playlist.name || '',
      tracks: songs.length,
      firstHash: songHash(song)
    };
    numericAudioId = String(song.MixSongID || song.mixsongid || song.album_audio_id || song.audio_id || '').trim();
    break;
  }
  if (!playlistReport) throw new Error('Kugou playlists did not expose recognizable tracks');

  let numericPlayback = null;
  if (/^\d+$/.test(numericAudioId)) {
    const payload = await json(`/song/url?id=${encodeURIComponent(numericAudioId)}`);
    const url = candidateUrl(payload);
    if (!url) throw new Error(`Kugou numeric audio id ${numericAudioId} returned no playback URL`);
    numericPlayback = { id: numericAudioId, url };
  }

  const search = await json(`/search?keyword=${encodeURIComponent('周杰伦')}&limit=12`);
  const songs = Array.isArray(search?.data?.lists) ? search.data.lists : [];
  if (!songs.length) throw new Error('Kugou search returned no songs');

  const attempts = [];
  for (const song of songs.slice(0, 12)) {
    const hash = String(song.FileHash || song.HQFileHash || song.SQFileHash || '').trim();
    if (!/^[a-f0-9]{32}$/i.test(hash)) continue;
    try {
      const playback = await json(`/song/url?hash=${encodeURIComponent(hash)}`);
      const url = candidateUrl(playback);
      if (!url) {
        attempts.push({ hash, title: song.SongName, reason: 'missing URL', keys: Object.keys(playback || {}) });
        continue;
      }
      const media = await fetch(url, {
        headers: { Range: 'bytes=0-1023' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs)
      });
      const contentType = String(media.headers.get('content-type') || '');
      attempts.push({ hash, title: song.SongName, status: media.status, contentType, url });
      if ((media.ok || media.status === 206) && !/^application\/json/i.test(contentType)) {
        console.log(`Kugou plugin playback PASS ${JSON.stringify({ playlist: playlistReport, numericPlayback, playback: attempts.at(-1) })}`);
        process.exitCode = 0;
        break;
      }
    } catch (error) {
      attempts.push({ hash, title: song.SongName, reason: error.message });
    }
  }

  if (!attempts.some((item) => item.status >= 200 && item.status < 300 && !/^application\/json/i.test(item.contentType || ''))) {
    console.error(JSON.stringify({ passed: false, symptom: 'Kugou songs cannot play', attempts }, null, 2));
    process.exitCode = 1;
  }
} finally {
  if (plugin.exitCode === null) plugin.kill();
}
