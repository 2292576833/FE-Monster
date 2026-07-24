import assert from 'node:assert/strict';

const baseUrl = (process.env.FE_TEST_BASE_URL || process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');
const providers = ['netease', 'qq', 'kugou', 'qishui'];
const searchTerms = {
  netease: '周杰伦',
  qq: '生日快乐',
  kugou: '周杰伦',
  qishui: '生日快乐'
};

async function json(pathname, timeout = 30000) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout)
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${pathname} returned invalid JSON (${response.status})`);
  }
  assert.ok(response.ok, `${pathname} failed (${response.status}): ${payload.error || payload.message || 'unknown error'}`);
  return payload;
}

function firstString(root, keys, depth = 0) {
  if (depth > 7 || root == null) return '';
  if (Array.isArray(root)) {
    for (const value of root) {
      const found = firstString(value, keys, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof root !== 'object') return '';
  for (const key of keys) {
    const value = root[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  for (const value of Object.values(root)) {
    const found = firstString(value, keys, depth + 1);
    if (found) return found;
  }
  return '';
}

function qrImage(payload) {
  return firstString(payload, ['qrcode_img', 'qrimg', 'qrImg', 'base64', 'image', 'img']);
}

function qrKey(payload) {
  return firstString(payload, ['unikey', 'key', 'qrKey', 'qrcode', 'qrsig', 'token', 'id']);
}

async function assertQr(provider) {
  const keyPayload = await json(`/api/${provider}/login/qr/key`);
  const key = qrKey(keyPayload);
  assert.ok(key, `${provider} did not return a QR login key`);
  let image = qrImage(keyPayload);
  if (!image) {
    const createPayload = await json(`/api/${provider}/login/qr/create?key=${encodeURIComponent(key)}&qrimg=true`);
    image = qrImage(createPayload);
  }
  assert.match(image, /^(?:data:image\/|https?:\/\/)/i, `${provider} did not return a scannable QR image`);
}

async function assertPlaylists(provider) {
  const account = await json(`/api/login/status?provider=${provider}`);
  assert.equal(typeof account.loggedIn, 'boolean', `${provider} login status is not normalized`);
  const user = await json(`/api/${provider}/user/playlists`);
  assert.ok(Array.isArray(user.playlists), `${provider} user playlists are not normalized`);

  const recommended = await json(`/api/recommend/playlists?provider=${provider}&limit=5`);
  assert.ok(Array.isArray(recommended.playlists) && recommended.playlists.length > 0,
    `${provider} did not return recognizable playlists`);

  for (const playlist of recommended.playlists.slice(0, 3)) {
    const tracks = await json(`/api/${provider}/playlist/tracks?id=${encodeURIComponent(playlist.id)}&limit=10`);
    if (Array.isArray(tracks.songs) && tracks.songs.length > 0) {
      return { loggedIn: account.loggedIn, userPlaylists: user.playlists.length, tracks: tracks.songs.length };
    }
  }
  throw new Error(`${provider} playlists did not expose recognizable tracks`);
}

async function assertPlayback(provider) {
  const search = await json(`/api/${provider}/search?q=${encodeURIComponent(searchTerms[provider])}&limit=12`);
  assert.ok(Array.isArray(search.songs) && search.songs.length > 0, `${provider} search returned no songs`);
  for (const song of search.songs) {
    const source = await json(`/api/${provider}/song/url?id=${encodeURIComponent(song.id)}&quality=standard`);
    if (!source.url) continue;
    const parsed = new URL(source.url);
    const localPlugin = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
    const playbackUrl = localPlugin
      ? source.url
      : `${baseUrl}/api/audio/stream?url=${encodeURIComponent(source.url)}`;
    const response = await fetch(playbackUrl, {
      headers: { Range: 'bytes=0-4095' },
      signal: AbortSignal.timeout(120000)
    });
    const contentType = response.headers.get('content-type') || '';
    if ((response.status === 200 || response.status === 206) && /^(audio\/|application\/octet-stream)/i.test(contentType)) {
      await response.body?.cancel();
      return { status: response.status, contentType: contentType.split(';')[0], title: song.title };
    }
    await response.body?.cancel();
  }
  throw new Error(`${provider} search results did not contain a playable source`);
}

const configuration = await json('/api/music-apis');
for (const provider of providers) {
  const item = configuration.providers?.find((candidate) => candidate.id === provider);
  assert.ok(item?.configured && item?.enabled && item?.loginQr, `${provider} plugin is not enabled with QR login`);
  const service = await json(`/api/music-apis/status?provider=${provider}`);
  assert.ok(service.reachable, `${provider} plugin service is not reachable`);
}

const report = {};
for (const provider of providers) {
  await assertQr(provider);
  report[provider] = {
    playlists: await assertPlaylists(provider),
    playback: await assertPlayback(provider)
  };
}

console.log(`Music platform readiness PASS ${JSON.stringify(report)}`);
