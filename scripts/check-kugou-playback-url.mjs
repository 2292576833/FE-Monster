const baseUrl = String(process.env.FE_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const timeoutMs = 20000;

async function getJson(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`${pathname} returned HTTP ${response.status}`);
  return response.json();
}

const search = await getJson(`/api/search?provider=kugou&q=${encodeURIComponent("儿歌")}&limit=10`);
const songs = Array.isArray(search.songs) ? search.songs : [];
if (!songs.length) throw new Error("Kugou search returned no songs");

const attempts = [];
let playable = null;
for (const song of songs) {
  const query = new URLSearchParams({
    provider: "kugou",
    id: String(song.id || ""),
    title: String(song.title || ""),
    artist: String(song.artist || ""),
    quality: "standard"
  });
  const result = await getJson(`/api/player/load?${query}`);
  const url = String(result.url || "");
  const validWebAudioUrl = /^https?:\/\//i.test(url) && !/\.(?:mgg|kgm)(?:$|[?#])/i.test(url);
  attempts.push({ id: song.id, title: song.title, playable: result.playable === true, url, error: result.error || "" });
  if (result.playable === true && validWebAudioUrl) {
    playable = { song, result, url };
    break;
  }
}

if (!playable) {
  console.error(JSON.stringify({ passed: false, reason: "no playable Kugou URL", attempts }, null, 2));
  process.exit(1);
}

const mediaResponse = await fetch(playable.url, {
  headers: { Range: "bytes=0-1023" },
  redirect: "follow",
  signal: AbortSignal.timeout(timeoutMs)
});
const contentType = String(mediaResponse.headers.get("content-type") || "");
const cdnReadable = mediaResponse.ok || mediaResponse.status === 206;
const passed = cdnReadable && !/^application\/json/i.test(contentType);
console.log(JSON.stringify({
  passed,
  song: { id: playable.song.id, title: playable.song.title, artist: playable.song.artist },
  url: playable.url,
  mediaStatus: mediaResponse.status,
  contentType,
  attempts: attempts.length
}, null, 2));
if (!passed) process.exit(1);
