import assert from 'node:assert/strict';

const baseUrl = (process.env.FE_TEST_BASE_URL || process.argv[2] || 'http://127.0.0.1:3000').replace(/\/$/, '');
const providers = ['netease', 'qq', 'kugou'];
const officialBrowserProviders = ['netease', 'qq', 'kugou'];
const searchTerms = { netease: '周杰伦', qq: '生日快乐', kugou: '周杰伦' };

async function responseJson(pathname, timeout = 30_000) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(timeout)
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function json(pathname, timeout = 30_000) {
  const { response, payload } = await responseJson(pathname, timeout);
  assert.ok(response.ok, `${pathname} failed (${response.status}): ${payload.error || payload.message || 'unknown error'}`);
  return payload;
}

async function assertNoEmbeddedQr(provider) {
  for (const action of ['key', 'create', 'check']) {
    const { response } = await responseJson(`/api/${provider}/login/qr/${action}`);
    assert.ok(response.status === 404 || response.status === 400,
      `${provider} still exposes embedded QR ${action} (${response.status})`);
  }
}

async function assertPlayback(provider) {
  const search = await json(`/api/${provider}/search?q=${encodeURIComponent(searchTerms[provider])}&limit=12`);
  assert.ok(Array.isArray(search.songs) && search.songs.length > 0, `${provider} search returned no songs`);
  for (const song of search.songs) {
    const source = await json(`/api/${provider}/song/url?id=${encodeURIComponent(song.id)}&quality=standard`);
    if (!source.url) continue;
    const parsed = new URL(source.url);
    const localPlugin = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
    const playbackUrl = localPlugin ? source.url : `${baseUrl}/api/audio/stream?url=${encodeURIComponent(source.url)}`;
    const response = await fetch(playbackUrl, {
      headers: { Range: 'bytes=0-4095' },
      signal: AbortSignal.timeout(120_000)
    });
    const contentType = response.headers.get('content-type') || '';
    const playable = (response.status === 200 || response.status === 206)
      && /^(audio\/|application\/octet-stream)/i.test(contentType);
    await response.body?.cancel();
    if (playable) return { title: song.title, status: response.status, contentType: contentType.split(';')[0] };
  }
  throw new Error(`${provider} search results did not contain a playable source`);
}

const configuration = await json('/api/music-apis');
for (const provider of providers) {
  const item = configuration.providers?.find((candidate) => candidate.id === provider);
  assert.ok(item?.configured && item?.enabled, `${provider} plugin is not enabled`);
  assert.equal(item.loginQr, false, `${provider} still advertises embedded QR login`);
  const service = await json(`/api/music-apis/status?provider=${provider}`);
  assert.ok(service.reachable, `${provider} plugin service is not reachable`);
  await assertNoEmbeddedQr(provider);
}

const report = {};
for (const provider of officialBrowserProviders) {
  const account = await json(`/api/login/status?provider=${provider}`);
  assert.equal(typeof account.loggedIn, 'boolean', `${provider} login status is not normalized`);
  report[provider] = { loggedIn: account.loggedIn, playback: await assertPlayback(provider) };
}

console.log(`Music platform readiness PASS ${JSON.stringify(report)}`);
