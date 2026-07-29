"use strict";

const http = require("node:http");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync
} = require("node:fs");
const path = require("node:path");
const { gunzipSync } = require("node:zlib");

const PROVIDER = "qishui";
const VERSION = "3.1.0";
const CONTRACT = "fe-monster.music-api/v1";
const DEFAULT_PORT = 3013;
const DEFAULT_FEED_URL = "https://open.douyin.com/api/luna/v1/platform/feed/song-tab/";
const DEFAULT_REFRESH_URL = "https://open.douyin.com/oauth/refresh_token/";
const MAX_BODY_BYTES = 64 * 1024;
const MAX_LIBRARY_BODY_BYTES = 2 * 1024 * 1024;
const MAX_QUEUE_CACHE_BYTES = 2 * 1024 * 1024;
const MAX_QUEUE_CACHE_JSON_BYTES = 8 * 1024 * 1024;
const MAX_QUEUE_CACHE_DEPTH = 20;
const MAX_QUEUE_CACHE_NODES = 50_000;
const MAX_QUEUE_CACHE_CONTAINER_ITEMS = 10_000;
const MAX_QUEUE_CACHE_TRACKS = 500;
const MAX_LOCAL_CONFIG_BYTES = 512 * 1024;
const MAX_LOCAL_CONFIG_JSON_BYTES = 2 * 1024 * 1024;
const MAX_PUBLIC_PROFILE_DEPTH = 8;
const MAX_PUBLIC_PROFILE_NODES = 5_000;
const MAX_PUBLIC_PROFILE_CONTAINER_ITEMS = 1_000;
const MAX_LOCAL_LEVELDB_FILE_BYTES = 16 * 1024 * 1024;
const MAX_LOCAL_LEVELDB_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_LOCAL_LEVELDB_VALUE_BYTES = 12 * 1024 * 1024;
const MAX_LOCAL_LEVELDB_BLOCK_BYTES = 16 * 1024 * 1024;
const MAX_LOCAL_LEVELDB_ENTRIES = 20_000;
const MAX_LOCAL_COLLECTION_TRACKS = 5_000;
const LOCAL_QUEUE_PLAYLIST_ID = "local-queue-cache";
const LOCAL_LIKED_SUMMARY_ID = "sodamusic-liked-summary";
const LOCAL_LIKED_PLAYLIST_TYPE = 1;
const LOCAL_DOUYIN_PLAYLIST_TYPE = 4;
const LOCAL_LIBRARY_SCHEMA = "fe-monster.qishui-library/v1";
const EXPIRED_TOKEN_CODES = new Set([10008, 2190008, 28001008]);

function argument(name, fallback = "") {
  const prefix = `--${name}=`;
  const item = process.argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function json(response, status, body) {
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": payload.length,
    "cache-control": "no-store"
  });
  response.end(payload);
}

function safeError(message, type = "api") {
  return {
    ok: false,
    provider: PROVIDER,
    errorType: type,
    error: text(message) || "汽水音乐 OpenAPI 请求失败"
  };
}

function readJson(request, maximumBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maximumBytes) {
        reject(new Error("请求体过大"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("请求体必须是 JSON"));
      }
    });
    request.on("error", reject);
  });
}

function safeFile(pathname) {
  try {
    return existsSync(pathname) && statSync(pathname).isFile();
  } catch {
    return false;
  }
}

function readBoundedFile(pathname, maximumBytes) {
  const descriptor = openSync(pathname, "r");
  try {
    const size = fstatSync(descriptor).size;
    if (!Number.isSafeInteger(size) || size < 1 || size > maximumBytes) {
      throw new Error("local queue cache size is outside the allowed range");
    }
    const content = Buffer.allocUnsafe(size);
    let offset = 0;
    while (offset < size) {
      const count = readSync(descriptor, content, offset, size - offset, offset);
      if (count <= 0) break;
      offset += count;
    }
    if (offset !== size) throw new Error("local queue cache changed while being read");
    return content;
  } finally {
    closeSync(descriptor);
  }
}

function localQueueCachePath() {
  const appData = text(process.env.APPDATA);
  return appData
    ? path.join(path.resolve(appData), "SodaMusic", "LunaStorage", "QueueCache")
    : "";
}

function localSodaMusicConfigPath() {
  const appData = text(process.env.APPDATA);
  return appData
    ? path.join(path.resolve(appData), "SodaMusic", "LunaStorage", "Config")
    : "";
}

function localSodaMusicLevelDbPath() {
  const appData = text(process.env.APPDATA);
  return appData
    ? path.join(path.resolve(appData), "SodaMusic", "Local Storage", "leveldb")
    : "";
}

function levelDbVarintAt(content, offset, limit = content.length) {
  let value = 0;
  let multiplier = 1;
  for (let index = 0; index < 10 && offset + index < limit; index += 1) {
    const byte = content[offset + index];
    value += (byte & 0x7f) * multiplier;
    if (!Number.isSafeInteger(value)) throw new Error("LevelDB varint is too large");
    if ((byte & 0x80) === 0) return { value, bytes: index + 1 };
    multiplier *= 128;
  }
  throw new Error("LevelDB varint is truncated");
}

function levelDbLengthPrefixedAt(content, offset, limit = content.length) {
  const length = levelDbVarintAt(content, offset, limit);
  const start = offset + length.bytes;
  const end = start + length.value;
  if (length.value > MAX_LOCAL_LEVELDB_VALUE_BYTES || end > limit) {
    throw new Error("LevelDB value is outside the allowed range");
  }
  return {
    value: content.subarray(start, end),
    next: end
  };
}

function chromiumLocalStorageRecord(key, value) {
  const origin = Buffer.from("_app://resources\0", "utf8");
  if (
    !Buffer.isBuffer(key)
    || key.length <= origin.length + 1
    || !key.subarray(0, origin.length).equals(origin)
    || key[origin.length] !== 1
  ) {
    return null;
  }
  const cacheKey = key.subarray(origin.length + 1).toString("utf8");
  const match = cacheKey.match(
    /^useRequestCache:(playlists|playlist_detail|user_mixed_collections):([A-Za-z0-9._-]{1,300})$/
  );
  if (!match || !Buffer.isBuffer(value) || value.length < 2) return null;
  const encoding = value[0];
  const body = value.subarray(1);
  if (body.length > MAX_LOCAL_LEVELDB_VALUE_BYTES) {
    throw new Error("Chromium local storage value is too large");
  }
  if (encoding === 0 && body.length % 2 !== 0) {
    throw new Error("Chromium UTF-16 value is truncated");
  }
  const source = encoding === 0
    ? body.toString("utf16le")
    : encoding === 1
      ? body.toString("utf8")
      : "";
  if (!source) return null;
  const payload = JSON.parse(source);
  assertLocalCacheJsonBounds(payload);
  return {
    cacheKey,
    kind: match[1],
    ownerHash: match[1] === "playlist_detail"
      ? ""
      : localAccountCacheHash(match[2]),
    itemId: match[1] === "playlist_detail" ? match[2] : "",
    payload
  };
}

function readLevelDbWriteBatch(content, onRecord) {
  if (!Buffer.isBuffer(content) || content.length < 12) return;
  const sequence = content.readBigUInt64LE(0);
  const count = content.readUInt32LE(8);
  if (count > MAX_LOCAL_LEVELDB_ENTRIES) {
    throw new Error("LevelDB write batch contains too many entries");
  }
  let offset = 12;
  for (let index = 0; index < count; index += 1) {
    if (offset >= content.length) throw new Error("LevelDB write batch is truncated");
    const type = content[offset];
    offset += 1;
    const key = levelDbLengthPrefixedAt(content, offset);
    offset = key.next;
    if (type === 0) {
      onRecord(key.value, null, sequence + BigInt(index), true);
      continue;
    }
    if (type !== 1) throw new Error("LevelDB write batch has an unsupported record type");
    const value = levelDbLengthPrefixedAt(content, offset);
    offset = value.next;
    onRecord(key.value, value.value, sequence + BigInt(index), false);
  }
}

function readLevelDbLog(content, onRecord) {
  const blockBytes = 32 * 1024;
  let offset = 0;
  let fragments = [];
  while (offset < content.length) {
    const remainingInBlock = blockBytes - (offset % blockBytes);
    if (remainingInBlock < 7) {
      offset += remainingInBlock;
      continue;
    }
    if (offset + 7 > content.length) break;
    const length = content.readUInt16LE(offset + 4);
    const type = content[offset + 6];
    offset += 7;
    if (length === 0 && type === 0) {
      offset += Math.min(remainingInBlock - 7, content.length - offset);
      fragments = [];
      continue;
    }
    if (length > remainingInBlock - 7 || offset + length > content.length) {
      throw new Error("LevelDB log record is truncated");
    }
    const payload = content.subarray(offset, offset + length);
    offset += length;
    if (type === 1) {
      fragments = [];
      readLevelDbWriteBatch(payload, onRecord);
    } else if (type === 2) {
      fragments = [payload];
    } else if (type === 3 && fragments.length) {
      fragments.push(payload);
    } else if (type === 4 && fragments.length) {
      fragments.push(payload);
      readLevelDbWriteBatch(Buffer.concat(fragments), onRecord);
      fragments = [];
    } else {
      fragments = [];
    }
  }
}

function snappyDecompress(content) {
  let offset = 0;
  const expected = levelDbVarintAt(content, offset);
  offset += expected.bytes;
  if (expected.value > MAX_LOCAL_LEVELDB_BLOCK_BYTES) {
    throw new Error("LevelDB Snappy block is too large");
  }
  const output = Buffer.allocUnsafe(expected.value);
  let written = 0;
  while (offset < content.length && written < output.length) {
    const tag = content[offset];
    offset += 1;
    const type = tag & 3;
    if (type === 0) {
      let lengthCode = tag >>> 2;
      let length;
      if (lengthCode < 60) {
        length = lengthCode + 1;
      } else {
        const byteCount = lengthCode - 59;
        if (byteCount < 1 || byteCount > 4 || offset + byteCount > content.length) {
          throw new Error("LevelDB Snappy literal length is invalid");
        }
        let literalLength = 0;
        let multiplier = 1;
        for (let index = 0; index < byteCount; index += 1) {
          literalLength += content[offset + index] * multiplier;
          multiplier *= 256;
        }
        offset += byteCount;
        length = literalLength + 1;
      }
      if (offset + length > content.length || written + length > output.length) {
        throw new Error("LevelDB Snappy literal is truncated");
      }
      content.copy(output, written, offset, offset + length);
      offset += length;
      written += length;
      continue;
    }
    let length;
    let distance;
    if (type === 1) {
      if (offset >= content.length) throw new Error("LevelDB Snappy copy is truncated");
      length = 4 + ((tag >>> 2) & 7);
      distance = ((tag & 0xe0) << 3) | content[offset];
      offset += 1;
    } else if (type === 2) {
      if (offset + 2 > content.length) throw new Error("LevelDB Snappy copy is truncated");
      length = 1 + (tag >>> 2);
      distance = content.readUInt16LE(offset);
      offset += 2;
    } else {
      if (offset + 4 > content.length) throw new Error("LevelDB Snappy copy is truncated");
      length = 1 + (tag >>> 2);
      distance = content.readUInt32LE(offset);
      offset += 4;
    }
    if (distance < 1 || distance > written || written + length > output.length) {
      throw new Error("LevelDB Snappy copy is outside the output buffer");
    }
    for (let index = 0; index < length; index += 1) {
      output[written + index] = output[written - distance + index];
    }
    written += length;
  }
  if (written !== output.length) throw new Error("LevelDB Snappy output is truncated");
  return output;
}

function levelDbBlockEntries(content, onEntry) {
  if (!Buffer.isBuffer(content) || content.length < 4) {
    throw new Error("LevelDB block is empty");
  }
  const restartCount = content.readUInt32LE(content.length - 4);
  const entriesEnd = content.length - 4 - restartCount * 4;
  if (restartCount > MAX_LOCAL_LEVELDB_ENTRIES || entriesEnd < 0) {
    throw new Error("LevelDB restart table is invalid");
  }
  let offset = 0;
  let previousKey = Buffer.alloc(0);
  let entries = 0;
  while (offset < entriesEnd) {
    const shared = levelDbVarintAt(content, offset, entriesEnd);
    offset += shared.bytes;
    const unshared = levelDbVarintAt(content, offset, entriesEnd);
    offset += unshared.bytes;
    const valueLength = levelDbVarintAt(content, offset, entriesEnd);
    offset += valueLength.bytes;
    if (
      shared.value > previousKey.length
      || unshared.value > MAX_LOCAL_LEVELDB_VALUE_BYTES
      || valueLength.value > MAX_LOCAL_LEVELDB_VALUE_BYTES
      || offset + unshared.value + valueLength.value > entriesEnd
    ) {
      throw new Error("LevelDB block entry is invalid");
    }
    const key = Buffer.concat([
      previousKey.subarray(0, shared.value),
      content.subarray(offset, offset + unshared.value)
    ]);
    offset += unshared.value;
    const value = content.subarray(offset, offset + valueLength.value);
    offset += valueLength.value;
    previousKey = key;
    onEntry(key, value);
    entries += 1;
    if (entries > MAX_LOCAL_LEVELDB_ENTRIES) {
      throw new Error("LevelDB block contains too many entries");
    }
  }
}

function levelDbBlockHandleAt(content, offset = 0) {
  const blockOffset = levelDbVarintAt(content, offset);
  const blockSize = levelDbVarintAt(content, offset + blockOffset.bytes);
  return {
    offset: blockOffset.value,
    size: blockSize.value,
    bytes: blockOffset.bytes + blockSize.bytes
  };
}

function readLevelDbTableBlock(file, handle) {
  if (
    handle.offset < 0
    || handle.size < 0
    || handle.size > MAX_LOCAL_LEVELDB_BLOCK_BYTES
    || handle.offset + handle.size + 5 > file.length
  ) {
    throw new Error("LevelDB table block handle is invalid");
  }
  const content = file.subarray(handle.offset, handle.offset + handle.size);
  const compression = file[handle.offset + handle.size];
  if (compression === 0) return content;
  if (compression === 1) return snappyDecompress(content);
  throw new Error("LevelDB table compression is unsupported");
}

function readLevelDbTable(content, onRecord) {
  if (!Buffer.isBuffer(content) || content.length < 48) {
    throw new Error("LevelDB table is too small");
  }
  const magic = Buffer.from([0x57, 0xfb, 0x80, 0x8b, 0x24, 0x75, 0x47, 0xdb]);
  if (!content.subarray(content.length - 8).equals(magic)) {
    throw new Error("LevelDB table magic is invalid");
  }
  const footer = content.subarray(content.length - 48, content.length - 8);
  const metaIndex = levelDbBlockHandleAt(footer);
  const index = levelDbBlockHandleAt(footer, metaIndex.bytes);
  const dataBlocks = [];
  levelDbBlockEntries(readLevelDbTableBlock(content, index), (_key, value) => {
    dataBlocks.push(levelDbBlockHandleAt(value));
  });
  if (dataBlocks.length > MAX_LOCAL_LEVELDB_ENTRIES) {
    throw new Error("LevelDB table contains too many data blocks");
  }
  for (const handle of dataBlocks) {
    levelDbBlockEntries(readLevelDbTableBlock(content, handle), (internalKey, value) => {
      if (internalKey.length < 8) return;
      const trailer = internalKey.readBigUInt64LE(internalKey.length - 8);
      const type = Number(trailer & 0xffn);
      const sequence = trailer >> 8n;
      const key = internalKey.subarray(0, internalKey.length - 8);
      onRecord(key, type === 1 ? value : null, sequence, type === 0);
    });
  }
}

function localAccountCacheHash(value) {
  return createHash("sha256").update(text(value)).digest("hex");
}

function assertLocalCacheJsonBounds(root) {
  const stack = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    nodes += 1;
    if (nodes > 100_000) throw new Error("local cache contains too many JSON values");
    if (value == null || typeof value !== "object") continue;
    if (depth > 20) throw new Error("local cache JSON is too deeply nested");
    const children = Array.isArray(value) ? value : Object.values(value);
    if (children.length > 10_000) throw new Error("local cache JSON container is too large");
    for (const child of children) stack.push({ value: child, depth: depth + 1 });
  }
}

function localCachePayloadData(payload) {
  const data = plainObject(payload?.data);
  if (Object.keys(data).length) return data;
  const dataList = Array.isArray(payload?.dataList) ? payload.dataList : [];
  return plainObject(dataList[dataList.length - 1]);
}

function localCollectionKind(collectionType) {
  return Number(collectionType) === LOCAL_DOUYIN_PLAYLIST_TYPE ? "douyin" : "liked";
}

function localCollectionId(collectionType) {
  return `sodamusic-local-${localCollectionKind(collectionType)}`;
}

function normalizeLocalCachedTrack(resource, collectionType) {
  const entity = plainObject(resource?.entity);
  const trackWrapper = plainObject(entity.track_wrapper);
  const track = plainObject(trackWrapper.track || entity.track || resource);
  const title = boundedMetadataText(track.name || track.title, 300);
  const artist = localQueueArtists(track.artists);
  if (!title || !artist) return null;
  const rawDuration = Number(track.duration ?? track.duration_ms);
  const duration = Number.isFinite(rawDuration) && rawDuration > 0
    ? Math.round(rawDuration > 1000 ? rawDuration / 1000 : rawDuration)
    : 0;
  const collection = localCollectionKind(collectionType);
  return {
    id: `metadata:${collection}:${title}:${artist}`,
    title,
    artist,
    album: localQueueAlbum(track.album),
    cover: localQueueCover(track.cover_url || track.album?.url_cover),
    provider: PROVIDER,
    duration,
    sourceRef: {
      metadataOnly: true,
      matchTitle: title,
      matchArtist: artist,
      localClientCache: true,
      localCollection: collection
    }
  };
}

function normalizeLocalCachedPlaylist(rawPlaylist, detailPayload) {
  const type = Number(rawPlaylist?.type);
  if (![LOCAL_LIKED_PLAYLIST_TYPE, LOCAL_DOUYIN_PLAYLIST_TYPE].includes(type)) return null;
  const privateId = boundedMetadataText(rawPlaylist?.id, 300);
  if (!privateId) return null;
  const fallbackName = type === LOCAL_LIKED_PLAYLIST_TYPE
    ? "我喜欢的音乐"
    : "抖音收藏的音乐";
  const name = boundedMetadataText(rawPlaylist?.title || rawPlaylist?.public_title, 300)
    || fallbackName;
  const detail = localCachePayloadData(detailPayload);
  const resources = Array.isArray(detail.media_resources)
    ? detail.media_resources.slice(0, MAX_LOCAL_COLLECTION_TRACKS)
    : Array.isArray(detail.tracks)
      ? detail.tracks.slice(0, MAX_LOCAL_COLLECTION_TRACKS)
      : [];
  const tracks = resources
    .map((resource) => normalizeLocalCachedTrack(resource, type))
    .filter(Boolean);
  const reportedCount = Number(rawPlaylist?.resource_cnt?.track_cnt);
  const trackCount = Number.isFinite(reportedCount) && reportedCount >= 0
    ? Math.max(Math.round(reportedCount), tracks.length)
    : tracks.length;
  return {
    id: localCollectionId(type),
    name,
    cover: localQueueCover(rawPlaylist?.url_cover),
    provider: PROVIDER,
    tracks,
    trackCount,
    localCollectionType: type,
    cacheSource: "sodamusic-local-public-cache"
  };
}

let localCollectionCache = {
  pathname: "",
  key: "",
  ownerHash: "",
  snapshot: null
};

function localCollectionSnapshot(publicProfile = localPublicProfileSnapshot()) {
  const pathname = localSodaMusicLevelDbPath();
  const empty = (present, state) => ({
    present,
    state,
    playlists: [],
    trackCount: 0
  });
  if (!pathname || !existsSync(pathname)) return empty(false, "missing");
  let files;
  try {
    if (!statSync(pathname).isDirectory()) return empty(false, "missing");
    files = readdirSync(pathname)
      .filter((name) => /\.(?:ldb|log)$/i.test(name))
      .map((name) => {
        const filePath = path.join(pathname, name);
        const stats = statSync(filePath);
        return { name, filePath, size: stats.size, mtimeMs: stats.mtimeMs };
      })
      .filter((file) => file.size > 0 && file.size <= MAX_LOCAL_LEVELDB_FILE_BYTES)
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch {
    return empty(true, "invalid");
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_LOCAL_LEVELDB_TOTAL_BYTES) return empty(true, "invalid");
  const ownerHash = text(publicProfile.accountCacheHash);
  if (!ownerHash) return empty(true, "unavailable");
  const key = files.map((file) => `${file.name}:${file.size}:${file.mtimeMs}`).join("|");
  if (
    localCollectionCache.pathname === pathname
    && localCollectionCache.key === key
    && localCollectionCache.ownerHash === ownerHash
    && localCollectionCache.snapshot
  ) {
    return localCollectionCache.snapshot;
  }

  const latest = new Map();
  let validFiles = 0;
  const acceptRecord = (keyBuffer, value, sequence, deleted) => {
    let decoded;
    try {
      decoded = deleted ? null : chromiumLocalStorageRecord(keyBuffer, value);
    } catch {
      return;
    }
    if (
      !decoded
      || (decoded.kind !== "playlist_detail" && decoded.ownerHash !== ownerHash)
    ) return;
    const previous = latest.get(decoded.cacheKey);
    if (!previous || sequence > previous.sequence) {
      latest.set(decoded.cacheKey, { ...decoded, sequence });
    }
  };
  for (const file of files) {
    try {
      const content = readBoundedFile(file.filePath, MAX_LOCAL_LEVELDB_FILE_BYTES);
      if (/\.log$/i.test(file.name)) readLevelDbLog(content, acceptRecord);
      else readLevelDbTable(content, acceptRecord);
      validFiles += 1;
    } catch {
      // A concurrently compacted or malformed file is ignored; every exposed value
      // still has to pass the allowlisted record and JSON structure checks above.
    }
  }

  const playlistRecords = [...latest.values()]
    .filter((record) => record.kind === "playlists");
  const playlistRecord = playlistRecords
    .sort((left, right) => {
      const leftTime = Number(left.payload?.time) || 0;
      const rightTime = Number(right.payload?.time) || 0;
      return rightTime - leftTime;
    })[0];
  const detailById = new Map(
    [...latest.values()]
      .filter((record) => record.kind === "playlist_detail")
      .map((record) => [record.itemId, record.payload])
  );
  const rawPlaylists = Array.isArray(localCachePayloadData(playlistRecord?.payload).playlists)
    ? localCachePayloadData(playlistRecord.payload).playlists
    : [];
  const playlists = rawPlaylists
    .slice(0, 200)
    .map((playlist) => normalizeLocalCachedPlaylist(
      playlist,
      detailById.get(boundedMetadataText(playlist?.id, 300))
    ))
    .filter(Boolean);
  const snapshot = {
    present: true,
    state: playlists.length ? "ready" : validFiles ? "empty" : "invalid",
    playlists,
    trackCount: playlists.reduce((sum, playlist) => sum + playlist.tracks.length, 0)
  };
  localCollectionCache = { pathname, key, ownerHash, snapshot };
  return snapshot;
}

function assertPublicProfileBounds(root) {
  const stack = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    nodes += 1;
    if (nodes > MAX_PUBLIC_PROFILE_NODES) {
      throw new Error("local public profile contains too many JSON values");
    }
    if (value == null || typeof value !== "object") continue;
    if (depth > MAX_PUBLIC_PROFILE_DEPTH) {
      throw new Error("local public profile is too deeply nested");
    }
    const children = Array.isArray(value) ? value : Object.values(value);
    if (children.length > MAX_PUBLIC_PROFILE_CONTAINER_ITEMS) {
      throw new Error("local public profile container is too large");
    }
    for (const child of children) stack.push({ value: child, depth: depth + 1 });
  }
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function publicProfileName(myInfo) {
  return boundedMetadataText(myInfo.public_name || myInfo.nickname, 80)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
}

function publicProfileVip(myInfo) {
  const value = myInfo.is_vip ?? myInfo.isVip ?? myInfo.vip_info?.is_vip ?? false;
  if (value === true) return true;
  if (typeof value === "number") return value > 0;
  return ["1", "true", "vip", "active"].includes(text(value).toLowerCase());
}

function publicLikedCount(myStats) {
  const count = Number(myStats.count_all_liked);
  return Number.isFinite(count)
    ? Math.max(0, Math.min(10_000_000, Math.round(count)))
    : 0;
}

function publicProfileAvatar(myInfo) {
  const candidates = [];
  for (const value of [myInfo.larger_avatar_url, myInfo.medium_avatar_url]) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if (typeof value.url === "string") candidates.push(value.url);
    if (Array.isArray(value.urls)) candidates.push(...value.urls.slice(0, 8));
    if (Array.isArray(value.url_list)) candidates.push(...value.url_list.slice(0, 8));
  }
  return firstHttpsUrl(candidates);
}

function parseLocalSodaMusicConfig(content) {
  if (!Buffer.isBuffer(content) || content.length <= 4) {
    throw new Error("local SodaMusic Config is empty");
  }
  if (!content.subarray(0, 4).equals(Buffer.from("LUNA", "ascii"))) {
    throw new Error("local SodaMusic Config magic is invalid");
  }
  const expanded = gunzipSync(content.subarray(4), {
    maxOutputLength: MAX_LOCAL_CONFIG_JSON_BYTES
  });
  if (expanded.length < 2 || expanded.length > MAX_LOCAL_CONFIG_JSON_BYTES) {
    throw new Error("local SodaMusic Config expanded size is outside the allowed range");
  }
  const root = JSON.parse(expanded.toString("utf8"));
  const userInfoStateCache = plainObject(root?.userInfoStateCache);
  assertPublicProfileBounds(userInfoStateCache);
  const myInfo = plainObject(userInfoStateCache.my_info);
  const myStats = plainObject(userInfoStateCache.my_stats);
  const localAccountId = boundedMetadataText(myInfo.id, 256);
  const loginDetected = Boolean(localAccountId);
  const likedCount = publicLikedCount(myStats);
  const displayName = loginDetected ? publicProfileName(myInfo) : "";
  const avatar = loginDetected ? publicProfileAvatar(myInfo) : "";
  const isVip = loginDetected && publicProfileVip(myInfo);
  const collections = loginDetected
    ? [{
        id: LOCAL_LIKED_SUMMARY_ID,
        name: "我喜欢的音乐",
        trackCount: likedCount,
        metadataState: "unavailable",
        playable: false
      }]
    : [];
  return {
    loginDetected,
    loginState: loginDetected ? "logged-in" : "logged-out",
    displayName,
    avatar,
    isVip,
    likedCount,
    accountCacheHash: loginDetected ? localAccountCacheHash(localAccountId) : "",
    metadataState: "unavailable",
    collections
  };
}

let localPublicProfileCache = {
  pathname: "",
  key: "",
  snapshot: null
};

function localPublicProfileSnapshot() {
  const pathname = localSodaMusicConfigPath();
  if (!pathname || !safeFile(pathname)) {
    localPublicProfileCache = { pathname, key: "", snapshot: null };
    return {
      present: false,
      configState: "missing",
      loginDetected: false,
      loginState: "unknown",
      displayName: "",
      avatar: "",
      isVip: false,
      likedCount: 0,
      accountCacheHash: "",
      metadataState: "unavailable",
      collections: []
    };
  }
  let key = "";
  try {
    const stats = statSync(pathname);
    key = `${stats.size}:${stats.mtimeMs}`;
    if (
      localPublicProfileCache.pathname === pathname
      && localPublicProfileCache.key === key
      && localPublicProfileCache.snapshot
    ) {
      return localPublicProfileCache.snapshot;
    }
    const profile = parseLocalSodaMusicConfig(
      readBoundedFile(pathname, MAX_LOCAL_CONFIG_BYTES)
    );
    const snapshot = {
      present: true,
      configState: "ready",
      ...profile
    };
    localPublicProfileCache = { pathname, key, snapshot };
    return snapshot;
  } catch {
    const snapshot = {
      present: true,
      configState: "invalid",
      loginDetected: false,
      loginState: "unknown",
      displayName: "",
      avatar: "",
      isVip: false,
      likedCount: 0,
      accountCacheHash: "",
      metadataState: "unavailable",
      collections: []
    };
    localPublicProfileCache = { pathname, key, snapshot };
    return snapshot;
  }
}

function assertQueueCacheJsonBounds(root) {
  const stack = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    nodes += 1;
    if (nodes > MAX_QUEUE_CACHE_NODES) {
      throw new Error("local queue cache contains too many JSON values");
    }
    if (value == null || typeof value !== "object") continue;
    if (depth > MAX_QUEUE_CACHE_DEPTH) {
      throw new Error("local queue cache JSON is too deeply nested");
    }
    const children = Array.isArray(value) ? value : Object.values(value);
    if (children.length > MAX_QUEUE_CACHE_CONTAINER_ITEMS) {
      throw new Error("local queue cache JSON container is too large");
    }
    for (const child of children) {
      stack.push({ value: child, depth: depth + 1 });
    }
  }
}

function localQueueArtists(value) {
  if (!Array.isArray(value)) return "";
  return boundedMetadataText(
    value
      .slice(0, 20)
      .map((artist) => boundedMetadataText(
        typeof artist === "string" ? artist : artist?.name,
        100
      ))
      .filter(Boolean)
      .join(" / "),
    300
  );
}

function localQueueAlbum(value) {
  return boundedMetadataText(
    typeof value === "string" ? value : value?.name,
    300
  );
}

function localQueueCover(value) {
  if (typeof value === "string") return firstHttpsUrl([value]);
  if (Array.isArray(value)) return firstHttpsUrl(value);
  if (!value || typeof value !== "object") return "";
  const candidates = [
    value.url,
    ...(Array.isArray(value.urls) ? value.urls : []),
    ...(Array.isArray(value.url_list) ? value.url_list : [])
  ];
  return firstHttpsUrl(candidates);
}

function normalizeLocalQueueSong(playable) {
  if (!playable || typeof playable !== "object" || Array.isArray(playable)) return null;
  const providerSongId = boundedMetadataText(playable.id, 300);
  const title = boundedMetadataText(playable.name, 300);
  const artist = localQueueArtists(playable.artists);
  if (!providerSongId || !title || !artist) return null;
  const rawDuration = Number(playable.duration);
  const duration = Number.isFinite(rawDuration) && rawDuration > 0
    ? Math.round(rawDuration > 1000 ? rawDuration / 1000 : rawDuration)
    : 0;
  return {
    id: providerSongId,
    title,
    artist,
    album: localQueueAlbum(playable.album),
    cover: localQueueCover(playable.cover_url),
    provider: PROVIDER,
    duration,
    sourceRef: {
      metadataOnly: true,
      providerSongId,
      matchTitle: title,
      matchArtist: artist,
      matchDuration: duration,
      localQueueCache: true
    }
  };
}

function newestLocalQueueFeed(root) {
  if (!root || typeof root !== "object" || Array.isArray(root)) return null;
  const feeds = Object.entries(root)
    .filter(([key, value]) => /^u_\d+:feed$/.test(key) && value && typeof value === "object" && !Array.isArray(value))
    .map(([key, value]) => ({
      key,
      value,
      savedAt: Number(value.savedAt) || 0
    }))
    .sort((left, right) => right.savedAt - left.savedAt || left.key.localeCompare(right.key));
  return feeds[0]?.value || null;
}

function parseLocalQueueCache(content) {
  if (!Buffer.isBuffer(content) || content.length <= 4) {
    throw new Error("local queue cache is empty");
  }
  if (!content.subarray(0, 4).equals(Buffer.from("LUNA", "ascii"))) {
    throw new Error("local queue cache magic is invalid");
  }
  const expanded = gunzipSync(content.subarray(4), {
    maxOutputLength: MAX_QUEUE_CACHE_JSON_BYTES
  });
  if (expanded.length < 2 || expanded.length > MAX_QUEUE_CACHE_JSON_BYTES) {
    throw new Error("local queue cache expanded size is outside the allowed range");
  }
  const root = JSON.parse(expanded.toString("utf8"));
  assertQueueCacheJsonBounds(root);
  const feed = newestLocalQueueFeed(root);
  if (!feed) throw new Error("local queue cache does not contain a supported feed");
  const playables = Array.isArray(feed.playables) ? feed.playables : [];
  if (playables.length > MAX_QUEUE_CACHE_TRACKS) {
    throw new Error("local queue cache contains too many tracks");
  }
  const tracks = playables.map(normalizeLocalQueueSong).filter(Boolean);
  return {
    id: LOCAL_QUEUE_PLAYLIST_ID,
    name: "本地播放队列",
    cover: tracks.find((track) => track.cover)?.cover || "",
    provider: PROVIDER,
    tracks
  };
}

function localQueueCacheSnapshot() {
  const pathname = localQueueCachePath();
  if (!pathname || !safeFile(pathname)) {
    return {
      present: false,
      state: "missing",
      playlist: null,
      trackCount: 0
    };
  }
  try {
    const playlist = parseLocalQueueCache(
      readBoundedFile(pathname, MAX_QUEUE_CACHE_BYTES)
    );
    return {
      present: true,
      state: "ready",
      playlist,
      trackCount: playlist.tracks.length
    };
  } catch {
    return {
      present: true,
      state: "invalid",
      playlist: null,
      trackCount: 0
    };
  }
}

function localSodaMusicCandidates() {
  const candidates = [];
  const explicit = text(process.env.FE_QISHUI_LOCAL_APP_PATH);
  if (explicit) candidates.push(path.resolve(explicit));
  const localAppData = text(process.env.LOCALAPPDATA);
  const programFiles = text(process.env.ProgramFiles);
  const programFilesX86 = text(process.env["ProgramFiles(x86)"]);
  for (const root of [localAppData, programFiles, programFilesX86].filter(Boolean)) {
    candidates.push(
      path.join(root, "SodaMusic", "SodaMusic.exe"),
      path.join(root, "Programs", "SodaMusic", "SodaMusic.exe"),
      path.join(root, "汽水音乐", "SodaMusic.exe"),
      path.join(root, "QishuiMusic", "QishuiMusic.exe"),
      path.join(root, "Programs", "QishuiMusic", "QishuiMusic.exe"),
      path.join(root, "汽水音乐", "QishuiMusic.exe")
    );
  }
  return [...new Set(candidates)];
}

function localSodaMusicRunning() {
  if (process.platform !== "win32") return false;
  for (const executable of ["SodaMusic.exe", "QishuiMusic.exe"]) {
    try {
      const result = spawnSync("tasklist.exe", [
        "/FI", `IMAGENAME eq ${executable}`,
        "/FO", "CSV",
        "/NH"
      ], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 1500
      });
      if (result.status === 0 && new RegExp(`"${executable.replace(".", "\\.")}"`, "i").test(result.stdout || "")) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

function localSodaMusicStatus(
  queueCache = localQueueCacheSnapshot(),
  publicProfile = localPublicProfileSnapshot(),
  collectionCache = localCollectionSnapshot(publicProfile)
) {
  const installed = queueCache.present
    || publicProfile.present
    || collectionCache.present
    || localSodaMusicCandidates().some(safeFile);
  const cachedCollections = collectionCache.playlists.map((playlist) => ({
    id: playlist.id,
    name: playlist.name,
    trackCount: playlist.trackCount,
    metadataState: playlist.tracks.length ? "ready" : "summary",
    playable: playlist.tracks.length > 0
  }));
  const likedPlaylist = collectionCache.playlists.find(
    (playlist) => playlist.localCollectionType === LOCAL_LIKED_PLAYLIST_TYPE
  );
  const likedCount = Math.max(publicProfile.likedCount, likedPlaylist?.trackCount || 0);
  const cachedCollectionNote = "已只读识别 SodaMusic 本地公开资料与已缓存歌单元数据；未读取凭据或音源";
  return {
    ok: true,
    provider: PROVIDER,
    installed,
    running: localSodaMusicRunning(),
    localProfilePresent: queueCache.present || publicProfile.present || collectionCache.present,
    queueCacheState: queueCache.state,
    configState: publicProfile.configState,
    collectionCacheState: collectionCache.state,
    trackCount: queueCache.trackCount + collectionCache.trackCount,
    loginState: publicProfile.loginState,
    loginDetected: publicProfile.loginDetected,
    displayName: publicProfile.displayName,
    avatar: publicProfile.avatar,
    isVip: publicProfile.isVip,
    likedCount,
    metadataState: cachedCollections.length ? "ready" : publicProfile.metadataState,
    collections: cachedCollections.length ? cachedCollections : publicProfile.collections,
    credentialsRead: false,
    libraryMode: "read-only-public-cache+explicit-metadata-import",
    note: cachedCollections.length
      ? cachedCollectionNote
      : publicProfile.loginDetected
      ? "已从固定 Config 的公开资料白名单确认本地登录；收藏歌曲元数据未公开，未读取任何凭据"
      : "未读取 SodaMusic 凭据；本地客户端没有可确认的公开收藏歌曲元数据"
  };
}

function forbiddenMetadataField(value, depth = 0) {
  if (value == null || depth > 8) return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = forbiddenMetadataField(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  const forbidden = /(?:access|refresh)[_-]?token|cookie|session|password|secret|authorization|(?:play|audio|stream)[_-]?url|url[_-]?player[_-]?info/i;
  for (const [key, item] of Object.entries(value)) {
    if (forbidden.test(key)) return key;
    const found = forbiddenMetadataField(item, depth + 1);
    if (found) return found;
  }
  return "";
}

function boundedMetadataText(value, maximum = 300) {
  return text(value).slice(0, maximum);
}

function stableMetadataId(...parts) {
  return createHash("sha256")
    .update(parts.map(text).join("\u001f"))
    .digest("hex")
    .slice(0, 20);
}

function normalizeLibrarySong(track, playlistId) {
  if (!track || typeof track !== "object") return null;
  const title = boundedMetadataText(track.title || track.name, 300);
  const artist = boundedMetadataText(track.artist, 300);
  if (!title || !artist) return null;
  const album = boundedMetadataText(track.album, 300);
  const durationValue = Number(track.duration ?? (
    Number.isFinite(Number(track.durationMs)) ? Number(track.durationMs) / 1000 : 0
  ));
  const duration = Number.isFinite(durationValue) && durationValue > 0
    ? Math.round(durationValue)
    : 0;
  const providerSongId = boundedMetadataText(
    track.providerSongId
      || track.sourceRef?.providerSongId
      || track.officialId
      || (text(track.id).startsWith("metadata:") ? "" : track.id),
    300
  );
  const id = providerSongId || `metadata:${stableMetadataId(playlistId, title, artist, duration)}`;
  return {
    id,
    title,
    artist,
    album,
    cover: firstHttpsUrl([track.cover]),
    provider: PROVIDER,
    duration,
    sourceRef: {
      metadataOnly: true,
      providerSongId,
      matchTitle: title,
      matchArtist: artist,
      matchDuration: duration
    }
  };
}

function normalizeLibrary(payload) {
  if (!payload || typeof payload !== "object") throw new Error("元数据文件必须是 JSON 对象");
  if (text(payload.schema) !== LOCAL_LIBRARY_SCHEMA) {
    throw new Error(`元数据 schema 必须是 ${LOCAL_LIBRARY_SCHEMA}`);
  }
  const forbidden = forbiddenMetadataField(payload);
  if (forbidden) throw new Error(`元数据包含不允许导入的敏感或音源字段：${forbidden}`);
  const inputPlaylists = Array.isArray(payload.playlists) ? payload.playlists : [];
  if (inputPlaylists.length > 200) throw new Error("歌单数量超过 200");
  let totalTracks = 0;
  const playlists = inputPlaylists.map((playlist, index) => {
    const name = boundedMetadataText(playlist?.name || playlist?.title, 300) || `导入歌单 ${index + 1}`;
    const id = boundedMetadataText(playlist?.id, 300)
      || `playlist:${stableMetadataId(name, index)}`;
    const inputTracks = Array.isArray(playlist?.tracks) ? playlist.tracks : [];
    totalTracks += inputTracks.length;
    if (totalTracks > 10_000) throw new Error("歌曲数量超过 10000");
    const tracks = inputTracks
      .map((track) => normalizeLibrarySong(track, id))
      .filter(Boolean);
    return {
      id,
      name,
      cover: firstHttpsUrl([playlist?.cover]),
      provider: PROVIDER,
      tracks
    };
  });
  return {
    schema: LOCAL_LIBRARY_SCHEMA,
    importedAt: new Date().toISOString(),
    playlists
  };
}

function loadLibrary(libraryPath) {
  try {
    return normalizeLibrary(JSON.parse(readFileSync(libraryPath, "utf8")));
  } catch {
    return { schema: LOCAL_LIBRARY_SCHEMA, playlists: [] };
  }
}

function saveLibrary(libraryPath, library) {
  mkdirSync(path.dirname(libraryPath), { recursive: true });
  const temporaryPath = `${libraryPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(library), {
    encoding: "utf8",
    mode: 0o600
  });
  renameSync(temporaryPath, libraryPath);
}

function librarySongs(library) {
  const playlists = Array.isArray(library?.playlists) ? library.playlists : [];
  return playlists.flatMap((playlist) => Array.isArray(playlist.tracks) ? playlist.tracks : []);
}

function loadSession(sessionPath) {
  try {
    const parsed = JSON.parse(readFileSync(sessionPath, "utf8"));
    const accessToken = text(parsed.accessToken);
    return accessToken
      ? {
          accessToken,
          openId: text(parsed.openId),
          refreshToken: text(parsed.refreshToken),
          clientKey: text(parsed.clientKey)
        }
      : {};
  } catch {
    return {};
  }
}

function saveSession(sessionPath, session) {
  mkdirSync(path.dirname(sessionPath), { recursive: true });
  const temporaryPath = `${sessionPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(session), {
    encoding: "utf8",
    mode: 0o600
  });
  renameSync(temporaryPath, sessionPath);
}

function upstreamFailure(payload) {
  if (!payload || typeof payload !== "object") return null;
  const code = Number(
    payload.err_no
      ?? payload.error_code
      ?? payload.data?.error_code
      ?? payload.data?.err_no
      ?? 0
  );
  if (Number.isFinite(code) && code !== 0) {
    return {
      code,
      message: text(
        payload.err_msg
        ?? payload.message
        ?? payload.data?.description
        ?? payload.data?.err_msg
        ?? `OpenAPI 错误 ${code}`
      )
    };
  }
  return null;
}

function upstreamError(payload) {
  return upstreamFailure(payload)?.message || "";
}

async function requestOfficialFeed(feedUrl, accessToken, count = 50) {
  const requestedCount = Number.isInteger(count) ? Math.max(1, Math.min(count, 50)) : 50;
  const response = await fetch(feedUrl, {
    method: "POST",
    headers: {
      "access-token": accessToken,
      "content-type": "application/json",
      "user-agent": "FE-Monster-Qishui-OpenAPI/2.0"
    },
    body: JSON.stringify({
      is_first_request: true,
      is_did_first_request: true,
      with_client_cache: false,
      played_media: [],
      count: requestedCount
    }),
    signal: AbortSignal.timeout(12_000)
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`官方 OpenAPI 返回了非 JSON 响应（HTTP ${response.status}）`);
  }
  if (!response.ok) {
    throw new Error(`官方 OpenAPI HTTP ${response.status}`);
  }
  const failure = upstreamFailure(payload);
  if (failure) {
    const safeMessage = accessToken
      ? failure.message.split(accessToken).join("[redacted]")
      : failure.message;
    const error = new Error(safeMessage);
    error.openApiCode = failure.code;
    throw error;
  }
  return payload;
}

async function refreshOfficialAccessToken(refreshUrl, authorization) {
  const clientKey = text(authorization?.clientKey);
  const refreshToken = text(authorization?.refreshToken);
  if (!clientKey || !refreshToken) {
    throw new Error("官方 access_token 已过期，请重新授权或同时提供 client_key 与 refresh_token");
  }
  const form = new URLSearchParams({
    client_key: clientKey,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  const response = await fetch(refreshUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "FE-Monster-Qishui-OpenAPI/2.0"
    },
    body: form,
    signal: AbortSignal.timeout(12_000)
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`官方 OAuth 刷新接口返回了非 JSON 响应（HTTP ${response.status}）`);
  }
  if (!response.ok) throw new Error(`官方 OAuth 刷新接口 HTTP ${response.status}`);
  const failure = upstreamFailure(payload);
  if (failure) throw new Error(`官方 OAuth 刷新失败（错误 ${failure.code}）`);
  const accessToken = text(payload?.data?.access_token);
  if (!accessToken) throw new Error("官方 OAuth 刷新响应缺少 access_token");
  return {
    ...authorization,
    accessToken,
    refreshToken: text(payload?.data?.refresh_token) || refreshToken
  };
}

async function requestAuthorizedFeed(feedUrl, refreshUrl, authorization, count) {
  try {
    return {
      payload: await requestOfficialFeed(feedUrl, authorization.accessToken, count),
      authorization
    };
  } catch (error) {
    if (!EXPIRED_TOKEN_CODES.has(Number(error?.openApiCode))) throw error;
    const refreshed = await refreshOfficialAccessToken(refreshUrl, authorization);
    return {
      payload: await requestOfficialFeed(feedUrl, refreshed.accessToken, count),
      authorization: refreshed
    };
  }
}

function firstHttpsUrl(value) {
  const candidates = Array.isArray(value) ? value : [];
  for (const candidate of candidates) {
    try {
      const url = new URL(text(candidate));
      if (url.protocol === "https:") return url.toString();
    } catch {
      // Ignore malformed media URLs returned by the upstream response.
    }
  }
  return "";
}

function normalizeTrack(item) {
  const track = item?.entity?.media?.track_entity;
  const base = track?.base_info;
  if (!track || !base) return null;
  const id = text(base.id);
  if (!id) return null;
  const artists = Array.isArray(track.related_info?.artist_links)
    ? track.related_info.artist_links
        .map((artist) => text(artist?.name || artist?.simple_display_name))
        .filter(Boolean)
    : [];
  const durationMs = Number(base.duration_ms);
  return {
    id,
    title: text(base.name) || "未命名歌曲",
    artist: artists.join(" / "),
    album: text(track.related_info?.album_link?.name),
    cover: firstHttpsUrl(track.display_info?.cover_url?.urls),
    provider: PROVIDER,
    duration: Number.isFinite(durationMs) && durationMs > 0
      ? Math.round(durationMs / 1000)
      : 0
  };
}

function feedTracks(payload) {
  const items = Array.isArray(payload?.data?.items) ? payload.data.items : [];
  return items.map(normalizeTrack).filter(Boolean);
}

function feedTrackEntities(payload) {
  const items = Array.isArray(payload?.data?.items) ? payload.data.items : [];
  const tracks = new Map();
  for (const item of items) {
    const track = item?.entity?.media?.track_entity;
    const id = text(track?.base_info?.id);
    if (id) tracks.set(id, track);
  }
  return tracks;
}

function directHttpsUrl(value) {
  const candidate = text(value);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function playbackPayload(trackId, track) {
  const fullUrl = directHttpsUrl(
    track?.player_info?.full?.video_model_info?.url_player_info
  );
  if (fullUrl) {
    return {
      ok: true,
      provider: PROVIDER,
      quality: "full",
      playable: true,
      url: fullUrl
    };
  }
  return {
    ok: true,
    provider: PROVIDER,
    quality: "full",
    playable: false,
    url: "",
    restriction: {
      code: "official-full-stream-unavailable",
      message: "官方 OpenAPI 未向当前授权返回可直接播放的完整 HTTPS 音源",
      trackId,
      paymentType: track?.commerce_info?.payment_type ?? null,
      playableCondition: text(track?.commerce_info?.playable_condition)
    }
  };
}

function comparableText(value) {
  return text(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function matchOfficialTrack(trackCache, request) {
  const ids = [request.providerSongId, request.id].map(text).filter(Boolean);
  for (const id of ids) {
    const track = trackCache.get(id);
    if (track) return { track, matchedBy: "official-id", officialTrackId: id };
  }

  const wantedTitle = comparableText(request.title);
  const wantedArtist = comparableText(request.artist);
  const wantedDuration = Number(request.duration);
  if (!wantedTitle || !wantedArtist || !Number.isFinite(wantedDuration) || wantedDuration <= 0) {
    return null;
  }
  for (const [officialTrackId, track] of trackCache) {
    const normalized = normalizeTrack({ entity: { media: { track_entity: track } } });
    if (!normalized) continue;
    if (comparableText(normalized.title) !== wantedTitle) continue;
    if (comparableText(normalized.artist) !== wantedArtist) continue;
    if (!normalized.duration || Math.abs(normalized.duration - wantedDuration) > 3) continue;
    return {
      track,
      matchedBy: "title-artist-duration",
      officialTrackId
    };
  }
  return null;
}

function unmatchedPlaybackPayload(trackId) {
  return {
    ok: true,
    provider: PROVIDER,
    quality: "full",
    playable: false,
    url: "",
    restriction: {
      code: "official-track-match-not-found",
      message: "导入的歌曲元数据未在当前官方授权 feed 中匹配到",
      trackId
    }
  };
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(text(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function validateOpenApiUrl(value) {
  const url = new URL(value);
  if (url.protocol === "https:") return url.toString();
  const allowFixture = process.env.FE_QISHUI_ALLOW_HTTP_FIXTURE === "1";
  const loopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
  if (allowFixture && url.protocol === "http:" && loopback) return url.toString();
  throw new Error("汽水音乐 OpenAPI 地址必须使用 HTTPS");
}

function healthPayload(session) {
  return {
    ok: true,
    provider: PROVIDER,
    version: VERSION,
    label: "汽水音乐",
    contract: CONTRACT,
    authMode: "official-openapi-token",
    loginQr: false,
    loggedIn: Boolean(session.accessToken),
    persistence: true,
    capabilities: [
      "search",
      "playback",
      "local-client-detection",
      "local-library-metadata",
      "official-openapi-session"
    ]
  };
}

function createApp(options = {}) {
  const dataDir = path.resolve(options.dataDir || argument("data-dir", path.join(process.cwd(), "data", "qishui-music-api")));
  const sessionPath = path.join(dataDir, "session.json");
  const libraryPath = path.join(dataDir, "local-library.json");
  const feedUrl = validateOpenApiUrl(
    options.feedUrl
      || process.env.FE_QISHUI_OPENAPI_FEED_URL
      || DEFAULT_FEED_URL
  );
  const refreshUrl = validateOpenApiUrl(
    options.refreshUrl
      || process.env.FE_QISHUI_OPENAPI_REFRESH_URL
      || DEFAULT_REFRESH_URL
  );
  let session = loadSession(sessionPath);
  let library = loadLibrary(libraryPath);
  const trackCache = new Map();

  function rememberFeed(payload) {
    for (const [id, track] of feedTrackEntities(payload)) {
      trackCache.set(id, track);
    }
  }

  function acceptAuthorization(result) {
    const next = result.authorization;
    if (next.accessToken !== session.accessToken || next.refreshToken !== session.refreshToken) {
      saveSession(sessionPath, next);
    }
    session = next;
    rememberFeed(result.payload);
    return result.payload;
  }

  function visibleLocalPlaylists(
    queueCache,
    collectionCache = localCollectionSnapshot()
  ) {
    const imported = Array.isArray(library?.playlists)
      ? library.playlists.filter((playlist) => playlist.id !== LOCAL_QUEUE_PLAYLIST_ID)
      : [];
    const combined = [
      ...collectionCache.playlists,
      ...(queueCache.playlist ? [queueCache.playlist] : []),
      ...imported
    ];
    const ids = new Set();
    return combined.filter((playlist) => {
      if (!playlist?.id || ids.has(playlist.id)) return false;
      ids.add(playlist.id);
      return true;
    });
  }

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/health") {
        json(response, 200, healthPayload(session));
        return;
      }
      if (request.method === "GET" && url.pathname === "/login/status") {
        const localStatus = localSodaMusicStatus();
        const playbackAuthorized = Boolean(session.accessToken);
        const localLoginDetected = localStatus.loginDetected === true;
        const account = localLoginDetected
          ? {
              nickname: localStatus.displayName || "汽水音乐用户",
              avatar: localStatus.avatar,
              isVip: localStatus.isVip === true
            }
          : session.openId
            ? { userId: session.openId, nickname: "汽水音乐 OpenAPI" }
            : {};
        json(response, 200, {
          ok: true,
          provider: PROVIDER,
          loggedIn: playbackAuthorized || localLoginDetected,
          playbackAuthorized,
          localLoginDetected,
          account,
          likedCount: localStatus.likedCount,
          metadataState: localStatus.metadataState,
          collections: localStatus.collections,
          credentialsRead: false
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/local/status") {
        json(response, 200, localSodaMusicStatus(localQueueCacheSnapshot()));
        return;
      }
      if (request.method === "POST" && url.pathname === "/local/library/import") {
        try {
          const body = await readJson(request, MAX_LIBRARY_BODY_BYTES);
          const nextLibrary = normalizeLibrary(body);
          saveLibrary(libraryPath, nextLibrary);
          library = nextLibrary;
          json(response, 200, {
            ok: true,
            provider: PROVIDER,
            schema: LOCAL_LIBRARY_SCHEMA,
            playlists: library.playlists.length,
            tracks: librarySongs(library).length,
            credentialsRead: false
          });
        } catch (error) {
          json(response, 400, safeError(text(error?.message), "validation"));
        }
        return;
      }
      if (request.method === "GET" && url.pathname === "/user/playlist") {
        const playlists = visibleLocalPlaylists(localQueueCacheSnapshot());
        json(response, 200, {
          ok: true,
          provider: PROVIDER,
          source: "local-metadata",
          metadataOnly: true,
          playlists: playlists.map((playlist) => ({
            id: playlist.id,
            name: playlist.name,
            cover: playlist.cover,
            provider: PROVIDER,
            trackCount: Number.isFinite(Number(playlist.trackCount))
              ? Math.max(0, Math.round(Number(playlist.trackCount)))
              : playlist.tracks.length
          }))
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/playlist/track/all") {
        const playlistId = text(url.searchParams.get("id"));
        const playlist = visibleLocalPlaylists(localQueueCacheSnapshot())
          .find((item) => item.id === playlistId);
        json(response, 200, {
          ok: true,
          provider: PROVIDER,
          source: playlist?.cacheSource || (
            playlistId === LOCAL_QUEUE_PLAYLIST_ID
              ? "sodamusic-local-queue-metadata"
              : "explicit-metadata-import"
          ),
          metadataOnly: true,
          songs: playlist ? playlist.tracks : []
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/session/token") {
        const body = await readJson(request);
        const accessToken = text(body.accessToken);
        if (!accessToken) {
          json(response, 400, safeError("accessToken 不能为空", "validation"));
          return;
        }
        const nextSession = {
          accessToken,
          openId: text(body.openId),
          refreshToken: text(body.refreshToken),
          clientKey: text(body.clientKey)
        };
        const result = await requestAuthorizedFeed(feedUrl, refreshUrl, nextSession, 1);
        acceptAuthorization(result);
        json(response, 200, {
          ok: true,
          provider: PROVIDER,
          loggedIn: true,
          account: nextSession.openId
            ? { userId: nextSession.openId, nickname: "汽水音乐 OpenAPI" }
            : {}
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/search") {
        const keyword = text(url.searchParams.get("keyword") || url.searchParams.get("q")).toLocaleLowerCase();
        const page = positiveInteger(url.searchParams.get("page"), 1, 10_000);
        const limit = positiveInteger(url.searchParams.get("limit"), 20, 50);
        const localPlaylists = visibleLocalPlaylists(localQueueCacheSnapshot());
        const localMatches = librarySongs({ playlists: localPlaylists }).filter((song) => {
          if (!keyword) return true;
          return [song.title, song.artist, song.album]
            .some((value) => value.toLocaleLowerCase().includes(keyword));
        });
        if (!session.accessToken) {
          const offset = (page - 1) * limit;
          json(response, 200, {
            ok: true,
            provider: PROVIDER,
            source: "local-metadata-filter",
            songs: localMatches.slice(offset, offset + limit),
            total: localMatches.length,
            authorizationRequiredForPlayback: true,
            limitedToImportedMetadata: true
          });
          return;
        }
        const payload = acceptAuthorization(
          await requestAuthorizedFeed(feedUrl, refreshUrl, session, 50)
        );
        const matches = feedTracks(payload).filter((song) => {
          if (!keyword) return true;
          return [song.title, song.artist, song.album]
            .some((value) => value.toLocaleLowerCase().includes(keyword));
        });
        const combined = [...matches];
        const ids = new Set(matches.map((song) => song.id));
        for (const song of localMatches) {
          if (!ids.has(song.id)) combined.push(song);
        }
        const offset = (page - 1) * limit;
        json(response, 200, {
          ok: true,
          provider: PROVIDER,
          source: localMatches.length ? "official-feed-filter+local-metadata" : "official-feed-filter",
          songs: combined.slice(offset, offset + limit),
          total: combined.length,
          limitedToOfficialFeed: true
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/song/url") {
        if (!session.accessToken) {
          json(response, 401, safeError("请先配置具备汽水音乐权限的官方 OpenAPI token", "auth"));
          return;
        }
        const trackId = text(url.searchParams.get("id"));
        if (!trackId) {
          json(response, 400, safeError("歌曲 id 不能为空", "validation"));
          return;
        }
        const matchRequest = {
          id: trackId,
          providerSongId: text(url.searchParams.get("providerSongId")),
          title: text(url.searchParams.get("title")),
          artist: text(url.searchParams.get("artist")),
          duration: text(url.searchParams.get("duration"))
        };
        let match = matchOfficialTrack(trackCache, matchRequest);
        if (!match) {
          acceptAuthorization(
            await requestAuthorizedFeed(feedUrl, refreshUrl, session, 50)
          );
          match = matchOfficialTrack(trackCache, matchRequest);
        }
        if (!match) {
          json(response, 200, unmatchedPlaybackPayload(trackId));
          return;
        }
        json(response, 200, {
          ...playbackPayload(match.officialTrackId, match.track),
          matchedBy: match.matchedBy,
          officialTrackId: match.officialTrackId
        });
        return;
      }
      json(response, 404, safeError("接口不存在", "routing"));
    } catch (error) {
      const message = error && error.name === "TimeoutError"
        ? "官方 OpenAPI 请求超时"
        : text(error && error.message);
      json(response, 422, safeError(message, "api"));
    }
  });
}

if (require.main === module) {
  const requestedPort = Number(argument("port", String(DEFAULT_PORT)));
  const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535
    ? requestedPort
    : DEFAULT_PORT;
  createApp().listen(port, "127.0.0.1");
}

module.exports = {
  createApp,
  refreshOfficialAccessToken,
  requestAuthorizedFeed,
  requestOfficialFeed,
  feedTracks,
  feedTrackEntities,
  normalizeTrack,
  matchOfficialTrack,
  playbackPayload,
  upstreamError
};
