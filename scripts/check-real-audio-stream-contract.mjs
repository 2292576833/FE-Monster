import assert from 'node:assert/strict';

const appBase = process.env.FE_AUDIO_APP_BASE || 'http://127.0.0.1:3000';
const neteaseBase = process.env.FE_NETEASE_API_BASE || 'http://127.0.0.1:3010';

async function resolveRealSong() {
  const feedResponse = await fetch(`${neteaseBase}/personalized/newsong?limit=20`);
  assert.equal(feedResponse.ok, true, `NetEase feed failed: ${feedResponse.status}`);
  const feed = await feedResponse.json();
  for (const entry of feed?.result || []) {
    const song = entry?.song || entry;
    if (!song?.id) continue;
    const playbackResponse = await fetch(`${neteaseBase}/song/url?id=${encodeURIComponent(song.id)}&level=lossless`);
    if (!playbackResponse.ok) continue;
    const playback = (await playbackResponse.json())?.data?.[0];
    if (playback?.url && Number(playback?.code) === 200) {
      return { id: String(song.id), title: String(song.name || entry.name || song.id), url: String(playback.url) };
    }
  }
  throw new Error('No real playable NetEase song was resolved');
}

const song = await resolveRealSong();
const proxy = `${appBase}/api/audio/stream?url=${encodeURIComponent(song.url)}`;
const response = await fetch(proxy, { headers: { Range: 'bytes=0-63' } });
const bytes = new Uint8Array(await response.arrayBuffer());
const signature = Buffer.from(bytes.subarray(0, 4)).toString('ascii');
const contentType = String(response.headers.get('content-type') || '').toLowerCase();
const acceptRanges = String(response.headers.get('accept-ranges') || '').toLowerCase();
const contentRange = String(response.headers.get('content-range') || '');

const expectedType = signature === 'fLaC'
  ? 'audio/flac'
  : signature === 'OggS'
    ? 'audio/ogg'
    : '';
const result = {
  pass: response.status === 206
    && bytes.length === 64
    && /^bytes 0-63\/\d+$/.test(contentRange)
    && acceptRanges === 'bytes'
    && !/charset=/i.test(contentType)
    && (!expectedType || contentType === expectedType),
  song: { id: song.id, title: song.title },
  status: response.status,
  signature,
  bytes: bytes.length,
  contentType,
  contentRange,
  acceptRanges,
  expectedType
};

console.log(JSON.stringify(result, null, 2));
assert.equal(result.pass, true, 'The real binary audio stream contract is unsafe for WebView2 range decoding');
