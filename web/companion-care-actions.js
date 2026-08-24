(function initializeCompanionCareActions(global) {
  'use strict';

  if (global.FeMonsterCompanionCareActions) return;

  const ALLOWED_WALLPAPER_SOURCES = new Set(['imported', 'live', 'wallpaper-engine']);
  const WALLPAPER_KIND_TERMS = Object.freeze({
    image: '图片 图像 静态 image photo picture',
    video: '视频 动态 动画 video motion animated',
    web: '网页 互动 web webpage interactive',
    scene: '场景 原生 3d scene native'
  });
  const SENSITIVE_MEMORY_CATEGORY = /(?:password|passwd|secret|credential|token|cookie|authorization|api.?key|private.?key|access.?key|refresh.?key)/i;
  const SENSITIVE_MEMORY_VALUE = /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\bsk-[A-Za-z0-9_-]{12,}|(?:password|passwd|secret|token|cookie|authorization|api.?key|private.?key|access.?key|refresh.?key)\s*[:=])/i;
  const CALLER_MEMORY_SCOPE = /^(?:fe.?id|computer.?id|computer.?id.?source|account|account.?id|user.?id)$/i;
  const ARBITRARY_MEDIA_LOCATION_KEY = new Set([
    'url', 'uri', 'path', 'file', 'filepath', 'location', 'sourceurl', 'sourcepath',
    'mediaurl', 'mediapath', 'audiourl', 'audiopath', 'code', 'script',
    'credential', 'credentials', 'token', 'secret', 'password'
  ]);
  const ARBITRARY_MEDIA_LOCATION_VALUE = /(?:\b(?:https?|file|ftp|data|blob):(?:\/\/)?|(?:^|\s)[A-Za-z]:[\\/]|(?:^|\s)\\\\|^\s*\/(?:api|audio|media|file|mnt|home|users?)\/|(?:^|[\\/])\.\.[\\/])/i;
  const IDENTIFYING_SELECTION_TEXT = /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?:\+?\d[\s-]*){7,}|\b\d{6,}\b|\b(?:email|phone|mobile|contact|account|user.?id|fe.?id)\b|(?:\u624b\u673a\u53f7?|\u7535\u8bdd|\u90ae\u7bb1|\u5fae\u4fe1|QQ|\u8d26\u53f7|\u7528\u6237\u540d|\u8eab\u4efd\u8bc1|\u4f4f\u5740|\u59d3\u540d))/iu;
  const MUSIC_DESCRIPTOR_TOKEN = /(?:\u8f7b\u97f3\u4e50|\u767d\u566a\u97f3|\u7eaf\u97f3\u4e50|\u97f3\u4e50|\u6b4c\u66f2?|\u94a2\u7434|\u5409\u4ed6|\u7235\u58eb|\u53e4\u5178|\u6447\u6eda|\u6c11\u8c23|\u7535\u5b50|\u6c1b\u56f4|\u8212\u7f13|\u6cbb\u6108|\u5b89\u9759|\u6e29\u67d4|\u96e8\u591c|\u7761\u7720|\u4e13\u6ce8|\u51a5\u60f3|lo-?fi|piano|jazz|ambient|classical|acoustic|instrumental|calm|comfort|relax|sleep|focus)/giu;
  const MOOD_DESCRIPTOR_TOKEN = /(?:\u96be\u8fc7|\u60b2\u4f24|\u4f24\u5fc3|\u4f4e\u843d|\u7126\u8651|\u5bb3\u6015|\u6050\u60e7|\u6124\u6012|\u751f\u6c14|\u7231|\u559c\u6b22|\u538c\u6076|\u5acc\u5f03|\u671f\u5f85|\u6e34\u671b|\u75b2\u60eb|\u5b64\u72ec|\u5e73\u9759|\u5f00\u5fc3|\u5feb\u4e50|\u6fc0\u52a8|\u538b\u529b|\u653e\u677e|\u5b89\u6170|joy|sorrow|fear|anger|love|disgust|desire|neutral|sad|blue|anxious|tired|lonely|peaceful|happy|excited|stressed|relaxed|comfort)/giu;
  const DESCRIPTOR_ALIASES = Object.freeze({
    '\u6b4c': '\u97f3\u4e50', '\u6b4c\u66f2': '\u97f3\u4e50',
    'lo-fi': 'lofi', piano: '\u94a2\u7434', jazz: '\u7235\u58eb', ambient: '\u6c1b\u56f4',
    classical: '\u53e4\u5178', acoustic: '\u539f\u58f0', instrumental: '\u7eaf\u97f3\u4e50',
    calm: '\u5e73\u9759', comfort: '\u5b89\u6170', relax: '\u653e\u677e', relaxed: '\u653e\u677e',
    sleep: '\u7761\u7720', focus: '\u4e13\u6ce8', sad: '\u96be\u8fc7', blue: '\u4f4e\u843d',
    anxious: '\u7126\u8651', tired: '\u75b2\u60eb', lonely: '\u5b64\u72ec', peaceful: '\u5e73\u9759',
    happy: '\u5f00\u5fc3', excited: '\u6fc0\u52a8', stressed: '\u538b\u529b',
    joy: '\u5f00\u5fc3', sorrow: '\u96be\u8fc7', fear: '\u5bb3\u6015', anger: '\u6124\u6012',
    love: '\u6e29\u67d4', disgust: '\u538c\u6076', desire: '\u671f\u5f85', neutral: '\u5e73\u9759'
  });

  function safeText(value, fallback = '', maximum = 240) {
    const text = String(value ?? '').trim();
    return (text || fallback).slice(0, maximum);
  }

  function finiteInteger(value, fallback, minimum, maximum) {
    const number = Number(value);
    return Math.max(minimum, Math.min(maximum,
      Number.isFinite(number) ? Math.floor(number) : fallback));
  }

  function normalizeSearchText(value) {
    return safeText(value, '', 320)
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  function editSimilarity(leftValue, rightValue) {
    const left = normalizeSearchText(leftValue).replaceAll(' ', '');
    const right = normalizeSearchText(rightValue).replaceAll(' ', '');
    if (!left || !right) return 0;
    if (left === right) return 1;
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const current = [leftIndex];
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        current[rightIndex] = Math.min(
          current[rightIndex - 1] + 1,
          previous[rightIndex] + 1,
          previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
        );
      }
      previous.splice(0, previous.length, ...current);
    }
    return Math.max(0, 1 - previous[right.length] / Math.max(left.length, right.length));
  }

  function fieldScore(fieldValue, query) {
    const field = normalizeSearchText(fieldValue);
    if (!field || !query) return 0;
    if (field === query) return 1;
    if (field.startsWith(query)) return 0.96;
    if (field.includes(query)) return 0.9;
    const queryTokens = query.split(' ').filter(Boolean);
    const tokenCoverage = queryTokens.length
      ? queryTokens.filter((token) => field.includes(token)).length / queryTokens.length
      : 0;
    return Math.max(editSimilarity(field, query), tokenCoverage * 0.86);
  }

  function create(dependencies = {}) {
    const commandBus = dependencies.commandBus;
    if (!commandBus?.registerMany) throw new Error('Companion care actions require the app command bus.');
    const readCatalog = typeof dependencies.catalog === 'function'
      ? dependencies.catalog
      : () => [];
    const wallpaper = dependencies.wallpaper && typeof dependencies.wallpaper === 'object'
      ? dependencies.wallpaper
      : {};
    const playback = dependencies.playback && typeof dependencies.playback === 'object'
      ? dependencies.playback
      : {};
    const readHabits = typeof dependencies.habits === 'function'
      ? dependencies.habits
      : async () => ({ volumeBuckets: {} });
    const memory = dependencies.memory && typeof dependencies.memory === 'object'
      ? dependencies.memory
      : {};
    const readClock = typeof dependencies.clock === 'function'
      ? dependencies.clock
      : () => new Date();
    const completedOperations = new Map();
    let operationSequence = 0;

    function operationId(parameters, context, command) {
      const explicit = safeText(
        parameters?.operationId ?? parameters?.idempotencyKey ?? context?.operationId,
        '',
        160
      );
      if (explicit) return explicit;
      operationSequence += 1;
      const now = new Date(readClock());
      return `${command}:${Number.isFinite(now.getTime()) ? now.getTime().toString(36) : 'local'}:${operationSequence}`;
    }

    function receipt(command, id, status, replayed = false) {
      const now = new Date(readClock());
      return Object.freeze({
        command,
        operationId: id,
        status,
        replayed,
        at: Number.isFinite(now.getTime()) ? now.toISOString() : ''
      });
    }

    async function runMutation(command, parameters, context, execute) {
      const explicitId = safeText(
        parameters?.operationId ?? parameters?.idempotencyKey ?? context?.operationId,
        '',
        160
      );
      const cacheKey = explicitId ? `${command}:${explicitId}` : '';
      const completed = cacheKey ? completedOperations.get(cacheKey) : null;
      if (completed) {
        return Object.freeze({
          ...completed,
          receipt: receipt(command, explicitId, completed.status, true)
        });
      }
      const result = await execute();
      const id = explicitId || operationId(parameters, context, command);
      const completedResult = Object.freeze({
        ...result,
        receipt: receipt(command, id, safeText(result?.status, 'completed', 60), false)
      });
      if (cacheKey) {
        completedOperations.set(cacheKey, completedResult);
        while (completedOperations.size > 64) {
          completedOperations.delete(completedOperations.keys().next().value);
        }
      }
      return completedResult;
    }

    function loadedWallpapers() {
      const seen = new Set();
      return (Array.isArray(readCatalog()) ? readCatalog() : []).filter((item) => {
        const id = safeText(item?.id);
        const source = safeText(item?.source).toLowerCase();
        if (!id || seen.has(id) || !ALLOWED_WALLPAPER_SOURCES.has(source)) return false;
        seen.add(id);
        return true;
      });
    }

    function wallpaperSummary(item) {
      const id = safeText(item?.id);
      return Object.freeze({
        id,
        name: safeText(item?.name, 'Wallpaper', 160),
        description: safeText(item?.description, '', 320),
        kind: safeText(item?.kind, 'image', 40).toLowerCase(),
        source: safeText(item?.source, 'imported', 40).toLowerCase(),
        current: id === safeText(wallpaper.currentId?.())
      });
    }

    function wallpaperCatalogQuery(parameters = {}) {
      const items = loadedWallpapers().map(wallpaperSummary);
      const cursor = finiteInteger(parameters.cursor, 0, 0, items.length);
      const limit = finiteInteger(parameters.limit, 12, 1, 20);
      const page = items.slice(cursor, cursor + limit);
      return Object.freeze({
        items: Object.freeze(page),
        total: items.length,
        cursor,
        limit,
        nextCursor: cursor + page.length < items.length ? String(cursor + page.length) : null
      });
    }

    function wallpaperMatchScore(item, query) {
      const kind = safeText(item?.kind, 'image', 40).toLowerCase();
      const source = safeText(item?.source, 'imported', 40).toLowerCase();
      const sourceTerms = source === 'imported'
        ? '已导入 本地 imported local'
        : 'Wallpaper Engine 实时 live';
      return Math.max(
        fieldScore(item?.name, query),
        fieldScore(item?.description, query) * 0.82,
        fieldScore(WALLPAPER_KIND_TERMS[kind] || kind, query) * 0.9,
        fieldScore(sourceTerms, query) * 0.82,
        fieldScore(item?.id, query) * 0.72
      );
    }

    function rankedWallpapers(query) {
      return loadedWallpapers()
        .map((item, index) => ({ item, index, score: wallpaperMatchScore(item, query) }))
        .filter((entry) => entry.score >= 0.42)
        .sort((left, right) => right.score - left.score || left.index - right.index);
    }

    function wallpaperSearch(parameters = {}) {
      const query = normalizeSearchText(parameters.query ?? parameters.keyword ?? parameters.text);
      if (!query) throw new Error('Wallpaper search requires a query.');
      const ranked = rankedWallpapers(query);
      const cursor = finiteInteger(parameters.cursor, 0, 0, ranked.length);
      const limit = finiteInteger(parameters.limit, 12, 1, 20);
      const page = ranked.slice(cursor, cursor + limit).map(({ item, score }) => Object.freeze({
        ...wallpaperSummary(item),
        confidence: Math.round(score * 100) / 100
      }));
      return Object.freeze({
        query,
        items: Object.freeze(page),
        total: ranked.length,
        cursor,
        limit,
        nextCursor: cursor + page.length < ranked.length ? String(cursor + page.length) : null
      });
    }

    function currentWallpaperQuery() {
      const currentId = safeText(wallpaper.currentId?.());
      const current = currentId
        ? loadedWallpapers().find((item) => safeText(item?.id) === currentId) || null
        : null;
      return Object.freeze({
        status: current ? 'active' : 'none',
        wallpaper: current ? wallpaperSummary(current) : null
      });
    }

    function hasArbitraryWallpaperLocation(parameters) {
      return Object.keys(parameters || {}).some((key) => /(?:url|path|file|location)/i.test(key));
    }

    function resolveWallpaper(parameters = {}) {
      const requestedId = safeText(parameters.id, '', 240);
      if (requestedId) {
        const exact = loadedWallpapers().find((item) => safeText(item?.id) === requestedId) || null;
        return exact
          ? { status: 'selected', item: exact, score: 1 }
          : { status: 'not_found', candidates: [] };
      }
      const query = normalizeSearchText(parameters.query ?? parameters.keyword);
      if (!query) return { status: 'not_found', candidates: [] };
      const ranked = rankedWallpapers(query);
      const top = ranked[0];
      if (!top) return { status: 'not_found', candidates: [] };
      if (top.score < 0.72) {
        return { status: 'low_confidence', candidates: ranked.slice(0, 3) };
      }
      const competing = ranked.filter((entry) => entry.score >= Math.max(0.68, top.score - 0.08));
      if (competing.length > 1) return { status: 'ambiguous', candidates: competing.slice(0, 5) };
      return { status: 'selected', item: top.item, score: top.score };
    }

    async function applyWallpaper(parameters = {}, context = {}) {
      if (hasArbitraryWallpaperLocation(parameters)) {
        return Object.freeze({
          status: 'rejected',
          applied: false,
          reason: 'arbitrary_location_not_allowed'
        });
      }
      const resolution = resolveWallpaper(parameters);
      if (resolution.status !== 'selected') {
        const candidates = (resolution.candidates || []).map(({ item, score }) => Object.freeze({
          ...wallpaperSummary(item),
          confidence: Math.round(score * 100) / 100
        }));
        return Object.freeze({
          status: resolution.status,
          applied: false,
          reason: resolution.status === 'not_found' ? 'wallpaper_not_loaded' : resolution.status,
          candidates: Object.freeze(candidates)
        });
      }
      const candidate = resolution.item;
      const requestedId = safeText(candidate?.id);
      return runMutation('wallpaper.apply', parameters, context, async () => {
        const beforeId = safeText(wallpaper.currentId?.());
        const beforeItem = beforeId
          ? loadedWallpapers().find((item) => safeText(item?.id) === beforeId) || null
          : null;
        if (context?.automatic === true && !beforeItem) {
          return Object.freeze({
            status: 'rejected',
            applied: false,
            reason: 'automatic_requires_reversible_wallpaper'
          });
        }
        if (beforeId === requestedId) {
          return Object.freeze({
            status: 'unchanged',
            applied: false,
            before: wallpaperSummary(candidate),
            after: wallpaperSummary(candidate)
          });
        }
        if (typeof wallpaper.apply !== 'function') throw new Error('Wallpaper application is unavailable.');
        await wallpaper.apply(candidate);
        return Object.freeze({
          status: 'applied',
          applied: true,
          before: beforeItem ? wallpaperSummary(beforeItem) : null,
          after: Object.freeze({ ...wallpaperSummary(candidate), current: true }),
          ...(beforeItem ? {
            undo: Object.freeze({
              command: 'wallpaper.apply',
              parameters: Object.freeze({ id: safeText(beforeItem.id) })
            })
          } : {})
        });
      });
    }

    function songSummary(song) {
      return Object.freeze({
        id: safeText(song?.id, '', 240),
        title: safeText(song?.title || song?.name, '', 180),
        artist: safeText(song?.artist || song?.singer, '', 160),
        album: safeText(song?.album, '', 160)
      });
    }

    function hasArbitraryMediaLocation(value, depth = 0) {
      if (depth > 4 || value == null) return false;
      if (typeof value === 'string') return ARBITRARY_MEDIA_LOCATION_VALUE.test(value);
      if (Array.isArray(value)) return value.some((item) => hasArbitraryMediaLocation(item, depth + 1));
      if (typeof value !== 'object') return false;
      return Object.entries(value).some(([key, item]) => {
        const normalizedKey = String(key).replace(/[^a-z]/gi, '').toLowerCase();
        if (ARBITRARY_MEDIA_LOCATION_KEY.has(normalizedKey) && item != null && item !== '') return true;
        return hasArbitraryMediaLocation(item, depth + 1);
      });
    }

    function structuredIntentText(value, keys, maximum = 120) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
      for (const key of keys) {
        const text = safeText(value[key], '', maximum);
        if (text && typeof value[key] !== 'object') return text;
      }
      return '';
    }

    function safeSelectionDescriptor(value, kind = 'music', maximum = 48) {
      if (typeof value !== 'string' && typeof value !== 'number') return '';
      const raw = String(value).trim();
      if (!raw || raw.length > maximum || /[\r\n]/.test(raw)) return '';
      if (ARBITRARY_MEDIA_LOCATION_VALUE.test(raw) || IDENTIFYING_SELECTION_TEXT.test(raw)) return '';
      const matcher = kind === 'mood' ? MOOD_DESCRIPTOR_TOKEN : MUSIC_DESCRIPTOR_TOKEN;
      const tokens = (raw.match(matcher) || []).map((token) => {
        const normalized = token.toLocaleLowerCase();
        return DESCRIPTOR_ALIASES[normalized] || normalized;
      });
      return Array.from(new Set(tokens)).join(' ');
    }

    function safeIntentQuery(value, maximum = 180) {
      if (typeof value !== 'string' && typeof value !== 'number') return '';
      const raw = String(value).trim();
      if (!raw || raw.length > maximum || /[\r\n]/.test(raw)) return '';
      if (ARBITRARY_MEDIA_LOCATION_VALUE.test(raw)
          || IDENTIFYING_SELECTION_TEXT.test(raw)
          || SENSITIVE_MEMORY_VALUE.test(raw)) return '';
      return safeText(raw, '', maximum);
    }

    function safeHabitDescriptor(value, maximum = 32) {
      if (typeof value !== 'string' && typeof value !== 'number') return '';
      const raw = String(value).normalize('NFKC').trim().replace(/\s+/g, ' ');
      if (!raw || raw.length > maximum || /[\r\n]/.test(raw)) return '';
      if (ARBITRARY_MEDIA_LOCATION_VALUE.test(raw)
          || IDENTIFYING_SELECTION_TEXT.test(raw)
          || SENSITIVE_MEMORY_VALUE.test(raw)
          || !/^[\p{L}\p{N}\s&+.'_-]+$/u.test(raw)) return '';
      return safeText(raw, '', maximum);
    }

    function safeTimeDescriptor(value) {
      const raw = safeText(value, '', 40).toLowerCase().replaceAll('_', '-');
      const aliases = {
        morning: 'morning', '\u65e9\u4e0a': 'morning', '\u6e05\u6668': 'morning',
        afternoon: 'afternoon', '\u4e0b\u5348': 'afternoon',
        evening: 'evening', '\u665a\u4e0a': 'evening',
        night: 'night', '\u591c\u665a': 'night',
        'late-night': 'late-night', latenight: 'late-night', '\u6df1\u591c': 'late-night'
      };
      return aliases[raw] || '';
    }

    function comfortSearchQuery(parameters = {}) {
      const direct = safeIntentQuery(
        parameters.query ?? parameters.keyword ?? parameters.text,
        180
      );
      if (direct) return direct;

      const intent = parameters.intent;
      if (typeof intent === 'string' || typeof intent === 'number') {
        const intentText = safeIntentQuery(intent, 180);
        if (intentText) return intentText;
      }
      const intentQuery = safeIntentQuery(structuredIntentText(
        intent,
        ['query', 'keyword', 'text', 'conversation', 'request'],
        180
      ), 180);
      if (intentQuery) return intentQuery;

      const selection = parameters.selectionContext && typeof parameters.selectionContext === 'object'
        ? parameters.selectionContext
        : {};
      const candidates = [
        safeSelectionDescriptor(intent?.mood ?? intent?.emotion, 'mood', 48),
        safeSelectionDescriptor(intent?.genre ?? intent?.style ?? intent?.activity, 'music', 48),
        safeSelectionDescriptor(parameters.mood, 'mood', 48),
        safeSelectionDescriptor(parameters.genre, 'music', 48),
        safeIntentQuery(parameters.title, 120),
        safeIntentQuery(parameters.artist, 100),
        safeSelectionDescriptor(selection.conversation, 'music', 48),
        safeSelectionDescriptor(
          structuredIntentText(selection.emotion, ['primary', 'mood', 'label', 'name'], 48)
            || selection.emotion,
          'mood',
          48
        ),
        ...(Array.isArray(selection.habitHints)
          ? selection.habitHints.slice(0, 3).map((hint) => safeHabitDescriptor(hint, 32))
          : []),
        safeTimeDescriptor(selection.timeOfDay)
      ].filter(Boolean);
      const unique = Array.from(new Set(candidates));
      return safeText(unique.join(' '), '', 180);
    }

    async function searchComfortMusic(parameters = {}) {
      if (typeof playback.search !== 'function') throw new Error('Music search is unavailable.');
      const query = comfortSearchQuery(parameters);
      if (!query) {
        return Object.freeze({
          query: '',
          missingSelection: true,
          rawSongs: Object.freeze([]),
          songs: Object.freeze([])
        });
      }
      const limit = finiteInteger(parameters.limit, 6, 1, 12);
      const result = await playback.search({ query, limit });
      const rawSongs = Array.isArray(result?.songs) ? result.songs.filter(Boolean) : [];
      return Object.freeze({
        query: safeText(result?.query, query, 180),
        rawSongs: Object.freeze(rawSongs),
        songs: Object.freeze(rawSongs.map(songSummary))
      });
    }

    async function recommendComfortMusic(parameters = {}) {
      if (hasArbitraryMediaLocation(parameters)) {
        return Object.freeze({
          status: 'rejected',
          sourceCommand: 'music.search',
          query: '',
          songs: Object.freeze([]),
          reason: 'arbitrary_location_not_allowed'
        });
      }
      const searched = await searchComfortMusic(parameters);
      return Object.freeze({
        status: searched.missingSelection
          ? 'missing_selection_context'
          : searched.songs.length ? 'recommended' : 'not_found',
        sourceCommand: 'music.search',
        query: searched.query,
        songs: searched.songs
      });
    }

    async function playComfortMusic(parameters = {}, context = {}) {
      if (hasArbitraryMediaLocation(parameters)) {
        return Object.freeze({
          status: 'rejected',
          played: false,
          reason: 'arbitrary_location_not_allowed'
        });
      }
      return runMutation('care.music.comfort.play', parameters, context, async () => {
        const undo = Object.freeze({
          command: 'playback.pause',
          parameters: Object.freeze({})
        });
        let snapshot = null;
        try {
          snapshot = typeof playback.snapshot === 'function' ? await playback.snapshot() : null;
        } catch (_) {
          snapshot = null;
        }
        if (!snapshot || snapshot.playing === true) {
          return Object.freeze({
            status: 'unchanged',
            played: false,
            reason: snapshot?.playing === true ? 'playback_active' : 'playback_state_unavailable'
          });
        }
        const useSimilar = parameters.similar === true;
        const sourceCommand = useSimilar ? 'music.play.similar' : 'music.search.play';
        const execute = useSimilar ? playback.playSimilar : playback.playSearch;
        if (typeof execute !== 'function') throw new Error(`${sourceCommand} is unavailable.`);
        if (useSimilar) {
          const result = await execute(parameters);
          const matched = result?.matched || result?.song || null;
          return Object.freeze({
            status: 'played',
            played: true,
            sourceCommand,
            matched: matched ? songSummary(matched) : null,
            undo
          });
        }
        const searched = await searchComfortMusic(parameters);
        if (searched.missingSelection) {
          return Object.freeze({
            status: 'missing_selection_context',
            played: false,
            sourceCommand: 'music.search',
            query: '',
            reason: 'dynamic_selection_context_required'
          });
        }
        const selected = searched.rawSongs.find((song) => safeText(song?.id, '', 240));
        if (!selected) {
          return Object.freeze({
            status: searched.rawSongs.length ? 'not_playable' : 'not_found',
            played: false,
            sourceCommand: 'music.search',
            query: searched.query,
            reason: searched.rawSongs.length ? 'search_result_missing_id' : 'no_search_results'
          });
        }
        const result = await execute({ songId: safeText(selected.id, '', 240) });
        const matched = result?.matched || result?.song || selected;
        return Object.freeze({
          status: 'played',
          played: true,
          sourceCommand,
          searchCommand: 'music.search',
          query: searched.query,
          matched: matched ? songSummary(matched) : null,
          undo
        });
      });
    }

    function localTimeBucket(now) {
      const hour = now.getHours();
      if (hour >= 5 && hour < 12) return 'morning';
      if (hour >= 12 && hour < 18) return 'afternoon';
      if (hour >= 18 && hour < 24) return 'evening';
      return 'late-night';
    }

    async function adaptCareVolume(parameters = {}, context = {}) {
      return runMutation('care.volume.adapt', parameters, context, async () => {
        if (typeof playback.volume !== 'function' || typeof playback.setVolume !== 'function') {
          throw new Error('Master volume control is unavailable.');
        }
        const before = finiteInteger(await playback.volume(), 0, 0, 100);
        let habits = null;
        try {
          habits = await readHabits();
        } catch (_) {
          habits = { volumeBuckets: {} };
        }
        const buckets = habits?.volumeBuckets && typeof habits.volumeBuckets === 'object'
          ? habits.volumeBuckets
          : {};
        const quiet = finiteInteger(buckets.quiet, 0, 0, 1_000_000);
        const balanced = finiteInteger(buckets.balanced, 0, 0, 1_000_000);
        const loud = finiteInteger(buckets.loud, 0, 0, 1_000_000);
        const evidence = quiet + balanced + loud;
        const now = new Date(readClock());
        const timeBucket = localTimeBucket(now);
        const signals = [parameters.type, parameters.timeBucket, parameters.reason]
          .map((value) => safeText(value, '', 40).toLowerCase().replaceAll('_', '-'));
        const proactiveLateNight = (parameters.proactive === true || parameters.automatic === true)
          && signals.includes('late-night')
          && timeBucket === 'late-night';
        const targetProvided = parameters.volume != null || parameters.targetVolume != null;
        const targetValue = Number(parameters.volume ?? parameters.targetVolume);
        const undo = Object.freeze({
          command: 'playback.volume.set',
          parameters: Object.freeze({ volume: before })
        });
        if (targetProvided && (!Number.isFinite(targetValue) || targetValue < 0 || targetValue > 100)) {
          return Object.freeze({
            status: 'unchanged', before, after: before,
            reason: 'invalid_volume_target', timeBucket, habitEvidence: evidence, undo
          });
        }
        if (evidence < 3 && !proactiveLateNight) {
          return Object.freeze({
            status: 'unchanged', before, after: before,
            reason: 'insufficient_volume_habit_evidence', timeBucket, habitEvidence: evidence, undo
          });
        }
        const preferred = evidence > 0
          ? Math.round((quiet * 24 + balanced * 50 + loud * 76) / evidence)
          : before;
        const timeCeiling = {
          morning: 50,
          afternoon: 58,
          evening: 48,
          'late-night': 28
        }[timeBucket];
        const desired = Math.min(
          before,
          proactiveLateNight && evidence < 3 ? before : preferred,
          timeCeiling,
          targetProvided ? targetValue : before
        );
        if (desired >= before - 2) {
          return Object.freeze({
            status: 'unchanged', before, after: before,
            reason: 'already_within_habit_time_guard', timeBucket, habitEvidence: evidence, undo
          });
        }
        const after = Math.max(desired, before - 8);
        await playback.setVolume(after);
        return Object.freeze({
          status: 'adjusted', before, after,
          reason: proactiveLateNight && evidence < 3 ? 'proactive_late_night_guard' : 'habit_time_guard',
          timeBucket, habitEvidence: evidence, undo
        });
      });
    }

    async function proactiveContext(parameters = {}) {
      const type = safeText(parameters.type, '', 60).toLowerCase();
      if (type !== 'late-night') return Object.freeze({});
      let habits = null;
      try {
        habits = await readHabits();
      } catch (_) {
        habits = null;
      }
      const buckets = habits?.volumeBuckets && typeof habits.volumeBuckets === 'object'
        ? habits.volumeBuckets
        : {};
      const evidence = finiteInteger(buckets.quiet, 0, 0, 1_000_000)
        + finiteInteger(buckets.balanced, 0, 0, 1_000_000)
        + finiteInteger(buckets.loud, 0, 0, 1_000_000);
      return Object.freeze({
        volumeHabitEvidenceCount: finiteInteger(evidence, 0, 0, 100)
      });
    }

    async function careContextQuery() {
      const now = new Date(readClock());
      const validTime = Number.isFinite(now.getTime()) ? now : new Date();
      let habits = null;
      try {
        habits = await readHabits();
      } catch (_) {
        habits = null;
      }
      const buckets = habits?.volumeBuckets && typeof habits.volumeBuckets === 'object'
        ? habits.volumeBuckets
        : {};
      const quiet = finiteInteger(buckets.quiet, 0, 0, 1_000_000);
      const balanced = finiteInteger(buckets.balanced, 0, 0, 1_000_000);
      const loud = finiteInteger(buckets.loud, 0, 0, 1_000_000);
      let snapshot = {};
      try {
        snapshot = typeof playback.snapshot === 'function' ? await playback.snapshot() : {};
      } catch (_) {
        snapshot = {};
      }
      let volume = null;
      try {
        volume = typeof playback.volume === 'function'
          ? finiteInteger(await playback.volume(), 0, 0, 100)
          : null;
      } catch (_) {
        volume = null;
      }
      return Object.freeze({
        timeOfDay: localTimeBucket(validTime),
        localHour: validTime.getHours(),
        playback: Object.freeze({
          playing: snapshot?.playing === true,
          song: snapshot?.song ? songSummary(snapshot.song) : null,
          volume
        }),
        habits: Object.freeze({
          volumeEvidenceCount: finiteInteger(quiet + balanced + loud, 0, 0, 100),
          volumeProfile: Object.freeze({ quiet, balanced, loud })
        })
      });
    }

    function hasCallerMemoryScope(parameters) {
      return Object.keys(parameters || {}).some((key) => CALLER_MEMORY_SCOPE.test(key));
    }

    function memorySummary(item) {
      const source = safeText(item?.source, '', 20).toLowerCase();
      const category = safeText(item?.category, '', 80).toLowerCase();
      const id = safeText(item?.id, '', 160);
      if (!id || !category || SENSITIVE_MEMORY_CATEGORY.test(category)) return null;
      if (source !== 'explicit' && source !== 'inferred') return null;
      const value = safeText(item?.value, '', 500);
      if (SENSITIVE_MEMORY_VALUE.test(value)) return null;
      const confidenceValue = Number(item?.confidence);
      const confidence = Math.max(0, Math.min(1, Number.isFinite(confidenceValue) ? confidenceValue : 0));
      return Object.freeze({
        id,
        category,
        value,
        source,
        confidence: Math.round(confidence * 100) / 100,
        createdAt: safeText(item?.createdAt, '', 40),
        updatedAt: safeText(item?.updatedAt, '', 40),
        expiresAt: safeText(item?.expiresAt, '', 40)
      });
    }

    function safeMemories(payload) {
      return (Array.isArray(payload?.memories) ? payload.memories : [])
        .map(memorySummary)
        .filter(Boolean);
    }

    async function queryPetMemories(parameters = {}) {
      if (hasCallerMemoryScope(parameters)) {
        return Object.freeze({ status: 'rejected', reason: 'account_scope_is_client_bound', items: [], total: 0 });
      }
      if (typeof memory.query !== 'function') throw new Error('Pet memory query is unavailable.');
      const payload = await memory.query({});
      const category = safeText(parameters.category, '', 80).toLowerCase();
      const source = safeText(parameters.source, '', 20).toLowerCase();
      const keyword = normalizeSearchText(parameters.query ?? parameters.keyword);
      const filtered = safeMemories(payload).filter((item) => {
        if (category && item.category !== category) return false;
        if (source && item.source !== source) return false;
        if (!keyword) return true;
        return normalizeSearchText(`${item.category} ${item.value}`).includes(keyword);
      });
      const cursor = finiteInteger(parameters.cursor, 0, 0, filtered.length);
      const limit = finiteInteger(parameters.limit, 12, 1, 20);
      const items = filtered.slice(cursor, cursor + limit);
      return Object.freeze({
        status: payload?.ok === false ? 'unavailable' : 'ok',
        items: Object.freeze(items),
        total: filtered.length,
        cursor,
        limit,
        nextCursor: cursor + items.length < filtered.length ? String(cursor + items.length) : null
      });
    }

    async function forgetPetMemory(parameters = {}, context = {}) {
      if (hasCallerMemoryScope(parameters)) {
        return Object.freeze({ status: 'rejected', removed: 0, reason: 'account_scope_is_client_bound' });
      }
      const memoryId = safeText(parameters.memoryId ?? parameters.id, '', 160);
      if (!memoryId) throw new Error('Pet memory forget requires an exact memory ID.');
      if (typeof memory.forget !== 'function') throw new Error('Pet memory deletion is unavailable.');
      return runMutation('pet.memory.forget', parameters, context, async () => {
        const payload = await memory.forget({ memoryId });
        const removed = finiteInteger(payload?.removed, 0, 0, 1_000_000);
        return Object.freeze({
          status: removed > 0 ? 'forgotten' : 'unchanged',
          removed,
          remaining: safeMemories(payload).length
        });
      });
    }

    function memoryForgetRequiresConfirmation(parameters = {}) {
      if (hasCallerMemoryScope(parameters)) return false;
      return Boolean(safeText(parameters.memoryId ?? parameters.id, '', 160));
    }

    commandBus.registerMany([
      {
        command: 'wallpaper.catalog.query',
        category: 'wallpaper',
        readOnly: true,
        title: 'Read loaded wallpapers',
        description: 'Lists only wallpapers already loaded by the imported or Wallpaper Engine catalog.',
        parameters: { cursor: 'number?', limit: 'number 1..20?' },
        handler: wallpaperCatalogQuery
      },
      {
        command: 'wallpaper.search',
        category: 'wallpaper',
        readOnly: true,
        title: 'Search loaded wallpapers',
        description: 'Fuzzy-searches names, descriptions and media types from the already loaded wallpaper catalog.',
        parameters: { query: 'string', cursor: 'number?', limit: 'number 1..20?' },
        requiredParameterGroups: [['query', 'keyword', 'text']],
        handler: wallpaperSearch
      },
      {
        command: 'wallpaper.current.query',
        category: 'wallpaper',
        readOnly: true,
        title: 'Read the current wallpaper',
        description: 'Returns the active wallpaper only when it still belongs to the loaded catalog.',
        handler: currentWallpaperQuery
      },
      {
        command: 'wallpaper.apply',
        category: 'wallpaper',
        title: 'Apply a loaded wallpaper',
        description: 'Applies an exact loaded wallpaper ID or an unambiguous high-confidence search result.',
        reversible: true,
        automaticAllowed: true,
        parameters: { id: 'loaded wallpaper ID?', query: 'string?', automatic: 'boolean?', operationId: 'string?' },
        requiredParameterGroups: [['id', 'query', 'keyword']],
        requiresConfirmation: false,
        handler: applyWallpaper
      },
      {
        command: 'care.context.query',
        category: 'care',
        readOnly: true,
        title: 'Read bounded care context',
        description: 'Returns local time bucket, current playback state and aggregate volume evidence for flexible low-risk action planning.',
        handler: careContextQuery
      },
      {
        command: 'care.music.comfort.recommend',
        category: 'care',
        readOnly: true,
        title: 'Recommend comforting music',
        description: 'Uses the existing music search and returns only songs actually found by the configured provider.',
        parameters: {
          query: 'string?', intent: 'string|object?', selectionContext: 'object?',
          mood: 'string?', genre: 'string?', limit: 'number 1..12?'
        },
        handler: recommendComfortMusic
      },
      {
        command: 'care.music.comfort.play',
        category: 'care',
        title: 'Play comforting music',
        description: 'When playback is idle, directly searches the live provider from bounded care context and plays one real match without a separate preference gate.',
        reversible: true,
        automaticAllowed: true,
        parameters: {
          query: 'string?', intent: 'string|object?', selectionContext: 'object?',
          similar: 'boolean?', proactive: 'boolean?', automatic: 'boolean?',
          onlyIfIdle: 'boolean?', operationId: 'string?'
        },
        handler: playComfortMusic
      },
      {
        command: 'care.volume.adapt',
        category: 'care',
        title: 'Conservatively adapt master volume',
        description: 'Uses local time and aggregated volume habits to lower only the master volume, with a reversible receipt.',
        reversible: true,
        automaticAllowed: true,
        parameters: {
          type: 'late-night?', timeBucket: 'late-night?', reason: 'late-night?',
          proactive: 'boolean?', automatic: 'boolean?', volume: 'number 0..100?',
          targetVolume: 'number 0..100?', operationId: 'string?'
        },
        handler: adaptCareVolume
      },
      {
        command: 'pet.memory.query',
        category: 'care',
        readOnly: true,
        title: 'Read account-scoped pet memories',
        description: 'Reads only the signed-in account and this computer, returning a redacted memory summary.',
        parameters: { category: 'string?', source: 'explicit|inferred?', query: 'string?', cursor: 'number?', limit: 'number 1..20?' },
        handler: queryPetMemories
      },
      {
        command: 'pet.memory.forget',
        category: 'care',
        title: 'Forget account-scoped pet memories',
        description: 'Forgets one exact server-issued memory ID. Account and computer scope are always client-bound.',
        parameters: { memoryId: 'string', operationId: 'string?' },
        requiredParameterGroups: [['memoryId', 'id']],
        requiresConfirmation: memoryForgetRequiresConfirmation,
        confirmationMessage: 'Forgetting a pet memory cannot be undone.',
        handler: forgetPetMemory
      }
    ]);

    return Object.freeze({ version: 1, proactiveContext });
  }

  global.FeMonsterCompanionCareActions = Object.freeze({ version: 1, create });
})(window);
