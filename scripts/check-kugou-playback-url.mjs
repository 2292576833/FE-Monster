const baseUrl = String(process.env.FE_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const timeoutMs = 20000;

function audioSignature(bytes) {
  if (bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from("ID3"))) return "id3";
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from("fLaC"))) return "flac";
  if (bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from("OggS"))) return "ogg";
  if (
    bytes.length >= 12
    && bytes.subarray(0, 4).equals(Buffer.from("RIFF"))
    && bytes.subarray(8, 12).equals(Buffer.from("WAVE"))
  ) return "wave";
  if (bytes.length >= 8 && bytes.subarray(4, 8).equals(Buffer.from("ftyp"))) return "mp4";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "mpeg-frame";
  return "";
}

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
const mediaBytes = Buffer.from(await mediaResponse.arrayBuffer());
const signature = audioSignature(mediaBytes);
const cdnReadable = mediaResponse.ok || mediaResponse.status === 206;
const audioMime = /^(?:audio\/|video\/mp4|application\/octet-stream)/i.test(contentType);
const passed = cdnReadable && audioMime && Boolean(signature);
console.log(JSON.stringify({
  passed,
  song: { id: playable.song.id, title: playable.song.title, artist: playable.song.artist },
  url: playable.url,
  mediaStatus: mediaResponse.status,
  contentType,
  signature,
  bytesRead: mediaBytes.length,
  attempts: attempts.length
}, null, 2));
if (!passed) process.exit(1);
