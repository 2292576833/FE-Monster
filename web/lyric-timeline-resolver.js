(() => {
  'use strict';

  const CACHE_KEY = 'fe-monster-lyric-timeline-cache-v1';
  const CACHE_SCHEMA_VERSION = 1;
  const CACHE_ENTRY_LIMIT = 72;
  const CACHE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
  const CACHE_MAX_SERIALIZED_BYTES = 3 * 1024 * 1024;
  const MIN_MATCH_SCORE = 96;
  const MAX_DURATION_DIFFERENCE_SECONDS = 6;
  const MIN_LYRIC_TEXT_SIMILARITY = 0.62;

  function safeText(value, fallback = '') {
    return typeof value === 'string' ? value : value == null ? fallback : String(value);
  }

  function normalizeMatchText(value) {
    return safeText(value)
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[\p{P}\p{S}\s]+/gu, '');
  }

  function normalizedSong(song = {}, fallbackProvider = '') {
    return {
      id: safeText(song.id).trim(),
      provider: safeText(song.provider || fallbackProvider).trim().toLowerCase(),
      title: safeText(song.title || song.name).trim(),
      artist: safeText(song.artist || song.singer).trim(),
      album: safeText(
        typeof song.album === 'object' && song.album
          ? song.album.name || song.album.title
          : song.album
      ).trim(),
      duration: Math.max(0, Number(song.duration) || 0)
    };
  }

  function timelineCacheKey(song = {}, primaryProvider = '') {
    const normalized = normalizedSong(song, primaryProvider);
    return [
      normalized.provider || safeText(primaryProvider).trim().toLowerCase(),
      normalized.id,
      normalizeMatchText(normalized.title),
      normalizeMatchText(normalized.artist),
      Math.round(normalized.duration)
    ].join('|');
  }

  function recordingMatchScore(sourceSong = {}, candidateSong = {}) {
    const source = normalizedSong(sourceSong);
    const candidate = normalizedSong(candidateSong);
    const sourceTitle = normalizeMatchText(source.title);
    const candidateTitle = normalizeMatchText(candidate.title);
    if (!sourceTitle || !candidateTitle || sourceTitle !== candidateTitle) {
      return Number.NEGATIVE_INFINITY;
    }

    const sourceArtist = normalizeMatchText(source.artist);
    const candidateArtist = normalizeMatchText(candidate.artist);
    if (sourceArtist && (!candidateArtist || (
      sourceArtist !== candidateArtist
      && !sourceArtist.includes(candidateArtist)
      && !candidateArtist.includes(sourceArtist)
    ))) {
      return Number.NEGATIVE_INFINITY;
    }

    const sourceDuration = source.duration;
    const candidateDuration = candidate.duration;
    let score = 72;
    if (sourceArtist && candidateArtist) score += sourceArtist === candidateArtist ? 24 : 14;
    if (sourceDuration > 0 && candidateDuration > 0) {
      const difference = Math.abs(sourceDuration - candidateDuration);
      if (difference > MAX_DURATION_DIFFERENCE_SECONDS) return Number.NEGATIVE_INFINITY;
      if (difference <= 2) score += 16;
      else if (difference <= 4) score += 10;
      else score += 5;
    }

    const sourceAlbum = normalizeMatchText(source.album);
    const candidateAlbum = normalizeMatchText(candidate.album);
    if (sourceAlbum && candidateAlbum) {
      if (sourceAlbum === candidateAlbum) score += 8;
      else if (sourceAlbum.includes(candidateAlbum) || candidateAlbum.includes(sourceAlbum)) score += 3;
    }
    return score;
  }

  function lyricTimelineStats(lines) {
    const source = Array.isArray(lines) ? lines : [];
    let detailedLines = 0;
    let timingPointCount = 0;
    for (const line of source) {
      const groups = [line?.karaokeSegments, line?.glyphTimings, line?.wordTimings]
        .filter((group) => Array.isArray(group) && group.length);
      if (!groups.length) continue;
      detailedLines += 1;
      timingPointCount += Math.max(...groups.map((group) => group.length));
    }
    return {
      lineCount: source.length,
      detailedLines,
      timingPointCount,
      detailed: detailedLines > 0 && timingPointCount > 0,
      score: detailedLines * 1000 + timingPointCount
    };
  }

  function lyricText(lines) {
    return normalizeMatchText((Array.isArray(lines) ? lines : [])
      .map((line) => safeText(line?.text))
      .filter(Boolean)
      .join(''));
  }

  function textShingles(text, width = 2) {
    const normalized = safeText(text);
    const shingles = new Set();
    if (normalized.length <= width) {
      if (normalized) shingles.add(normalized);
      return shingles;
    }
    for (let index = 0; index <= normalized.length - width; index += 1) {
      shingles.add(normalized.slice(index, index + width));
    }
    return shingles;
  }

  function lyricTextSimilarity(leftLines, rightLines) {
    const left = lyricText(leftLines);
    const right = lyricText(rightLines);
    if (!left || !right) return 1;
    if (left === right) return 1;
    if (left.length < 8 || right.length < 8) {
      return left.includes(right) || right.includes(left) ? 0.85 : 0;
    }
    const leftShingles = textShingles(left);
    const rightShingles = textShingles(right);
    let intersection = 0;
    leftShingles.forEach((value) => {
      if (rightShingles.has(value)) intersection += 1;
    });
    return (2 * intersection) / Math.max(1, leftShingles.size + rightShingles.size);
  }

  function lyricTrackForCache(value) {
    if (!value || typeof value !== 'object') return undefined;
    const lyric = safeText(value.lyric).trim();
    if (!lyric) return undefined;
    return { lyric };
  }

  function lyricPayloadForCache(payload = {}, sourceProvider = '') {
    const cached = {
      provider: safeText(payload.provider || sourceProvider).trim().toLowerCase()
    };
    ['lrc', 'tlyric', 'romalrc', 'klyric', 'yrc'].forEach((name) => {
      const track = lyricTrackForCache(payload[name]);
      if (track) cached[name] = track;
    });
    ['nolyric', 'uncollected', 'needDesc'].forEach((name) => {
      if (payload[name] === true) cached[name] = true;
    });
    return cached;
  }

  function mergeLyricPayload(primaryPayload, timingPayload, sourceProvider) {
    const merged = lyricPayloadForCache(timingPayload, sourceProvider);
    const primary = lyricPayloadForCache(primaryPayload);
    ['lrc', 'tlyric', 'romalrc'].forEach((name) => {
      if (!merged[name] && primary[name]) merged[name] = primary[name];
    });
    return merged;
  }

  function emptyCache() {
    return { version: CACHE_SCHEMA_VERSION, entries: [] };
  }

  function readCache(storage) {
    if (!storage || typeof storage.getItem !== 'function') return emptyCache();
    try {
      const parsed = JSON.parse(storage.getItem(CACHE_KEY) || '{}');
      if (Number(parsed?.version) !== CACHE_SCHEMA_VERSION || !Array.isArray(parsed.entries)) {
        return emptyCache();
      }
      return {
        version: CACHE_SCHEMA_VERSION,
        entries: parsed.entries.filter((entry) => entry && typeof entry === 'object')
      };
    } catch {
      return emptyCache();
    }
  }

  function writeCache(storage, cache) {
    if (!storage || typeof storage.setItem !== 'function') return false;
    const entries = Array.isArray(cache?.entries) ? cache.entries.slice(0, CACHE_ENTRY_LIMIT) : [];
    while (entries.length) {
      const serialized = JSON.stringify({ version: CACHE_SCHEMA_VERSION, entries });
      if (serialized.length <= CACHE_MAX_SERIALIZED_BYTES) {
        try {
          storage.setItem(CACHE_KEY, serialized);
          return true;
        } catch {
          return false;
        }
      }
      entries.pop();
    }
    return false;
  }

  function create(options = {}) {
    const storage = options.storage;
    const allowCrossProvider = options.allowCrossProvider === true;
    const parsePayload = typeof options.parsePayload === 'function' ? options.parsePayload : () => [];
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const providerIds = typeof options.providerIds === 'function' ? options.providerIds : () => [];
    const isProviderConfigured = typeof options.isProviderConfigured === 'function'
      ? options.isProviderConfigured
      : () => true;
    const loadPrimary = typeof options.loadPrimary === 'function' ? options.loadPrimary : async () => ({});
    const searchProvider = typeof options.searchProvider === 'function' ? options.searchProvider : async () => [];
    const loadLyrics = typeof options.loadLyrics === 'function' ? options.loadLyrics : async () => ({});
    const requests = new Map();

    function cachedTimeline(song, primaryProvider) {
      const key = timelineCacheKey(song, primaryProvider);
      if (!key) return null;
      const cache = readCache(storage);
      const currentTime = now();
      const entry = cache.entries.find((candidate) => (
        candidate?.key === key
        && currentTime - Number(candidate.savedAt) >= 0
        && currentTime - Number(candidate.savedAt) <= CACHE_MAX_AGE_MS
      ));
      if (!entry?.payload) return null;
      const cachedProvider = safeText(entry.sourceProvider || entry.payload.provider || primaryProvider)
        .trim().toLowerCase();
      if (!allowCrossProvider && cachedProvider !== primaryProvider) return null;
      const lines = parsePayload(entry.payload);
      const stats = lyricTimelineStats(lines);
      if (!stats.detailed) return null;
      return {
        payload: entry.payload,
        lines,
        detailed: true,
        cacheHit: true,
        sourceProvider: cachedProvider,
        sourceSongId: safeText(entry.sourceSongId),
        strategy: safeText(entry.strategy, 'cached-word-timeline'),
        textSimilarity: Number(entry.textSimilarity) || 1
      };
    }

    function rememberTimeline(song, primaryProvider, result) {
      if (!result?.detailed || !result.payload) return false;
      const key = timelineCacheKey(song, primaryProvider);
      if (!key) return false;
      const cache = readCache(storage);
      const entry = {
        key,
        savedAt: now(),
        sourceProvider: safeText(result.sourceProvider),
        sourceSongId: safeText(result.sourceSongId),
        strategy: safeText(result.strategy),
        textSimilarity: Number(result.textSimilarity) || 1,
        payload: lyricPayloadForCache(result.payload, result.sourceProvider)
      };
      cache.entries = [entry, ...cache.entries.filter((candidate) => candidate?.key !== key)]
        .slice(0, CACHE_ENTRY_LIMIT);
      return writeCache(storage, cache);
    }

    async function findCrossProviderTimeline(song, primaryProvider, primaryPayload, primaryLines) {
      const providers = [...new Set(providerIds()
        .map((provider) => safeText(provider).trim().toLowerCase())
        .filter((provider) => provider && provider !== primaryProvider && isProviderConfigured(provider)))];
      if (!providers.length) return null;
      const keyword = [safeText(song?.title), safeText(song?.artist)].filter(Boolean).join(' ').trim();
      if (!keyword) return null;

      const searchResults = await Promise.allSettled(providers.map(async (provider) => ({
        provider,
        songs: await searchProvider(provider, keyword, song)
      })));
      const candidates = [];
      const seen = new Set();
      for (const response of searchResults) {
        if (response.status !== 'fulfilled') continue;
        const provider = response.value.provider;
        for (const value of Array.isArray(response.value.songs) ? response.value.songs : []) {
          const candidate = normalizedSong(value, provider);
          if (!candidate.id) continue;
          const identity = `${provider}:${candidate.id}`;
          if (seen.has(identity)) continue;
          seen.add(identity);
          const matchScore = recordingMatchScore(song, candidate);
          if (!Number.isFinite(matchScore) || matchScore < MIN_MATCH_SCORE) continue;
          candidates.push({ provider, song: candidate, matchScore });
        }
      }
      candidates.sort((left, right) => right.matchScore - left.matchScore);

      let best = null;
      for (const candidate of candidates.slice(0, 6)) {
        let payload;
        try {
          payload = await loadLyrics(candidate.provider, candidate.song);
        } catch {
          continue;
        }
        const lines = parsePayload(payload);
        const stats = lyricTimelineStats(lines);
        if (!stats.detailed) continue;
        const similarity = lyricTextSimilarity(primaryLines, lines);
        if (primaryLines.length && similarity < MIN_LYRIC_TEXT_SIMILARITY) continue;
        const rank = candidate.matchScore * 100000 + Math.round(similarity * 10000) + stats.score;
        if (!best || rank > best.rank) {
          best = {
            rank,
            payload: mergeLyricPayload(primaryPayload, payload, candidate.provider),
            lines,
            detailed: true,
            cacheHit: false,
            sourceProvider: candidate.provider,
            sourceSongId: candidate.song.id,
            strategy: 'cross-provider-word-timeline',
            textSimilarity: similarity
          };
        }
      }
      return best;
    }

    async function resolveFresh(song, primaryProvider) {
      const cached = cachedTimeline(song, primaryProvider);
      if (cached) return cached;

      const primaryPayload = await loadPrimary(song, primaryProvider);
      const primaryLines = parsePayload(primaryPayload);
      const primaryStats = lyricTimelineStats(primaryLines);
      if (primaryStats.detailed) {
        const result = {
          payload: primaryPayload,
          lines: primaryLines,
          detailed: true,
          cacheHit: false,
          sourceProvider: primaryProvider,
          sourceSongId: safeText(song?.id),
          strategy: 'provider-word-timeline',
          textSimilarity: 1
        };
        rememberTimeline(song, primaryProvider, result);
        return result;
      }

      const fallback = allowCrossProvider
        ? await findCrossProviderTimeline(
            song,
            primaryProvider,
            primaryPayload,
            primaryLines
          )
        : null;
      if (fallback) {
        rememberTimeline(song, primaryProvider, fallback);
        return fallback;
      }
      return {
        payload: primaryPayload,
        lines: primaryLines,
        detailed: false,
        cacheHit: false,
        sourceProvider: primaryProvider,
        sourceSongId: safeText(song?.id),
        strategy: 'provider-line-timeline',
        textSimilarity: 1
      };
    }

    async function resolve(song, provider = song?.provider) {
      const primaryProvider = safeText(provider || song?.provider).trim().toLowerCase();
      const key = timelineCacheKey(song, primaryProvider);
      if (requests.has(key)) return requests.get(key);
      const request = resolveFresh(song, primaryProvider).finally(() => requests.delete(key));
      requests.set(key, request);
      return request;
    }

    return Object.freeze({ resolve, cachedTimeline });
  }

  const root = typeof window === 'object' && window ? window : globalThis;
  root.FeLyricTimelineResolver = Object.freeze({
    create,
    lyricTextSimilarity,
    lyricTimelineStats,
    normalizeMatchText,
    recordingMatchScore,
    timelineCacheKey
  });
})();
