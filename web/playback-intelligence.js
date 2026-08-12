(function initializePlaybackIntelligence(global) {
  'use strict';

  if (global.FeMonsterPlaybackIntelligence) return;

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizedText(value) {
    return String(value ?? '').trim().toLocaleLowerCase();
  }

  const AUTOMATION_ACTIONS = new Set([
    'playback.play',
    'playback.pause',
    'playback.toggle',
    'playback.next',
    'playback.previous',
    'playback.volume.set',
    'playback.volume.adjust',
    'playback.seek',
    'music.search.play',
    'playlist.play'
  ]);
  const OPERATION_ALIASES = Object.freeze({
    'music.playlist.query': 'playlist.query',
    'music.playlist.play': 'playlist.play',
    'automation.query': 'automation.rule.query',
    'automation.create': 'automation.rule.create',
    'automation.enable': 'automation.rule.enable',
    'automation.disable': 'automation.rule.disable',
    'automation.archive': 'automation.rule.archive',
    'playback.automation.rule.query': 'automation.rule.query',
    'playback.automation.rule.create': 'automation.rule.create',
    'playback.automation.rule.enable': 'automation.rule.enable',
    'playback.automation.rule.disable': 'automation.rule.disable',
    'playback.automation.rule.archive': 'automation.rule.archive'
  });
  const AUTOMATION_ACTION_ALIASES = Object.freeze({
    'music.playlist.play': 'playlist.play'
  });

  function create(options = {}) {
    const player = options.player || {};
    const playlists = options.playlists || {};
    const storage = options.storage || {};
    const commandBus = options.commandBus || {};
    const identity = typeof options.identity === 'function' ? options.identity : () => 'local';
    const onPersist = typeof options.onPersist === 'function' ? options.onPersist : () => {};
    const runtimeProgress = new Map();
    const progressWatches = new Map();
    const runningRuleIds = new Set();
    let generatedId = 0;
    let generatedWatchId = 0;

    function operationError(message, code = 'invalid_operation') {
      const error = new Error(message);
      error.code = code;
      return error;
    }

    function publishPlaybackState(event) {
      if (typeof global.CustomEvent !== 'function' || typeof global.dispatchEvent !== 'function') return;
      try {
        global.dispatchEvent(new global.CustomEvent('fe-monster-playback-state', {
          detail: Object.freeze({
            event,
            snapshot: snapshot(),
            at: Date.now()
          })
        }));
      } catch (_) {}
    }

    function storageKey() {
      const scope = String(identity() || 'local').trim().slice(0, 180) || 'local';
      return `fe-monster-playback-intelligence:${encodeURIComponent(scope)}`;
    }

    function emptyPersistentState() {
      return {
        version: 1,
        rules: [],
        habits: {
          version: 1,
          events: 0,
          songs: {},
          artists: {},
          playlists: {},
          providers: {},
          timeBuckets: {},
          volumeBuckets: {}
        }
      };
    }

    function safeDictionary(value) {
      const output = {};
      if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
      Object.entries(value).slice(0, 100).forEach(([key, item]) => {
        if (key === '__proto__' || key === 'prototype' || key === 'constructor') return;
        if (item && typeof item === 'object' && !Array.isArray(item)) output[String(key).slice(0, 300)] = { ...item };
        else if (Number.isFinite(Number(item))) output[String(key).slice(0, 300)] = Number(item);
      });
      return output;
    }

    function safeHabits(value) {
      const empty = emptyPersistentState().habits;
      const habits = value && typeof value === 'object' ? value : empty;
      return {
        version: 1,
        events: Math.max(0, Math.floor(finiteNumber(habits.events))),
        songs: safeDictionary(habits.songs),
        artists: safeDictionary(habits.artists),
        playlists: safeDictionary(habits.playlists),
        providers: safeDictionary(habits.providers),
        timeBuckets: safeDictionary(habits.timeBuckets),
        volumeBuckets: safeDictionary(habits.volumeBuckets)
      };
    }

    function safeStoredRules(value) {
      if (!Array.isArray(value)) return [];
      const statuses = new Set(['active', 'disabled', 'completed', 'error', 'archived']);
      const output = [];
      for (const candidate of value.slice(0, 32)) {
        if (!candidate || typeof candidate !== 'object') continue;
        const id = String(candidate.id || '').trim().slice(0, 160);
        const status = normalizedText(candidate.status);
        if (!id || !statuses.has(status)) continue;
        try {
          output.push({
            id,
            title: String(candidate.title || 'Playback automation').trim().slice(0, 120),
            trigger: normalizeAutomationTrigger(candidate.trigger),
            action: normalizeAutomationAction(candidate.action),
            status,
            once: candidate.once !== false,
            createdAt: Math.max(0, finiteNumber(candidate.createdAt)),
            lastFiredAt: candidate.lastFiredAt == null ? null : Math.max(0, finiteNumber(candidate.lastFiredAt)),
            ...(candidate.archivedAt == null ? {} : { archivedAt: Math.max(0, finiteNumber(candidate.archivedAt)) }),
            ...(candidate.lastError ? { lastError: String(candidate.lastError).slice(0, 240) } : {})
          });
        } catch (_) {
          // Ignore corrupt or widened rules; persisted automation remains playback-only.
        }
      }
      return output;
    }

    function readPersistentState() {
      if (typeof storage.getItem !== 'function') return emptyPersistentState();
      try {
        const parsed = JSON.parse(storage.getItem(storageKey()) || 'null');
        if (!parsed || typeof parsed !== 'object') return emptyPersistentState();
        return {
          version: 1,
          rules: safeStoredRules(parsed.rules),
          habits: safeHabits(parsed.habits)
        };
      } catch (_) {
        return emptyPersistentState();
      }
    }

    function writePersistentState(value) {
      if (typeof storage.setItem === 'function') storage.setItem(storageKey(), JSON.stringify(value));
      try { onPersist(storageKey()); } catch (_) {}
    }

    function pageOf(values, parameters = {}, defaultLimit = 12) {
      const cursor = Math.max(0, Math.floor(finiteNumber(parameters.cursor)));
      const limit = clamp(Math.floor(finiteNumber(parameters.limit, defaultLimit)), 1, 50);
      const items = values.slice(cursor, cursor + limit);
      return Object.freeze({
        items: Object.freeze(items),
        total: values.length,
        cursor,
        limit,
        nextCursor: cursor + items.length < values.length ? String(cursor + items.length) : null
      });
    }

    function entityKey(prefix, id, fallback) {
      const stable = String(id || '').trim() || normalizedText(fallback);
      return `${prefix}:${stable.slice(0, 240)}`;
    }

    function bumpEntity(dictionary, key, metadata, field) {
      if (!key || key.endsWith(':')) return;
      const current = dictionary[key] && typeof dictionary[key] === 'object' ? dictionary[key] : {};
      const next = {
        ...current,
        ...metadata,
        starts: Math.max(0, Math.floor(finiteNumber(current.starts))),
        completes: Math.max(0, Math.floor(finiteNumber(current.completes))),
        skips: Math.max(0, Math.floor(finiteNumber(current.skips))),
        replays: Math.max(0, Math.floor(finiteNumber(current.replays))),
        lastAt: Date.now()
      };
      next[field] = Math.min(1_000_000, next[field] + 1);
      dictionary[key] = next;
    }

    function pruneDictionary(dictionary, maximum = 80) {
      const entries = Object.entries(dictionary);
      if (entries.length <= maximum) return dictionary;
      entries.sort((left, right) => {
        const leftValue = left[1] || {};
        const rightValue = right[1] || {};
        const leftScore = finiteNumber(leftValue.starts) + finiteNumber(leftValue.completes) + finiteNumber(leftValue.replays);
        const rightScore = finiteNumber(rightValue.starts) + finiteNumber(rightValue.completes) + finiteNumber(rightValue.replays);
        return rightScore - leftScore || finiteNumber(rightValue.lastAt) - finiteNumber(leftValue.lastAt);
      });
      return Object.fromEntries(entries.slice(0, maximum));
    }

    function timeBucket(now = new Date()) {
      const hour = now.getHours();
      if (hour >= 5 && hour < 12) return 'morning';
      if (hour >= 12 && hour < 18) return 'afternoon';
      if (hour >= 18 && hour < 24) return 'evening';
      return 'late-night';
    }

    function recordHabitEvent(name, payload = {}) {
      const persistent = readPersistentState();
      const habits = persistent.habits;
      const song = payload.song && typeof payload.song === 'object' ? payload.song : {};
      const playlist = payload.playlist && typeof payload.playlist === 'object' ? payload.playlist : {};
      const field = name === 'track-start' ? 'starts'
        : name === 'track-complete' ? 'completes'
          : name === 'track-skip' ? 'skips'
            : name === 'track-replay' ? 'replays'
              : null;
      if (field) {
        const provider = String(song.provider || payload.provider || '').trim().slice(0, 80);
        const songName = String(song.name || song.title || '').trim().slice(0, 160);
        const artistName = String(song.artist || song.artists || '').trim().slice(0, 160);
        bumpEntity(habits.songs, entityKey('song', `${provider}:${song.id || ''}`, `${provider}:${songName}:${artistName}`), {
          id: String(song.id || '').slice(0, 240), name: songName, artist: artistName, provider
        }, field);
        bumpEntity(habits.artists, entityKey('artist', '', artistName), { name: artistName }, field);
        bumpEntity(habits.providers, entityKey('provider', '', provider), { name: provider }, field);
        if (playlist.id || playlist.name) {
          bumpEntity(habits.playlists, entityKey('playlist', playlist.id, playlist.name), {
            id: String(playlist.id || '').slice(0, 240),
            name: String(playlist.name || '').trim().slice(0, 160),
            provider
          }, field);
        }
        if (name === 'track-start') {
          const bucket = timeBucket();
          habits.timeBuckets[bucket] = Math.min(1_000_000, Math.max(0, Math.floor(finiteNumber(habits.timeBuckets[bucket]))) + 1);
        }
      } else if (name === 'volume-change') {
        const volume = clamp(finiteNumber(payload.volume), 0, 100);
        const bucket = volume < 30 ? 'quiet' : volume < 70 ? 'balanced' : 'loud';
        habits.volumeBuckets[bucket] = Math.min(1_000_000, Math.max(0, Math.floor(finiteNumber(habits.volumeBuckets[bucket]))) + 1);
      }
      habits.events = Math.min(1_000_000, habits.events + 1);
      habits.songs = pruneDictionary(habits.songs);
      habits.artists = pruneDictionary(habits.artists);
      habits.playlists = pruneDictionary(habits.playlists);
      habits.providers = pruneDictionary(habits.providers, 16);
      writePersistentState(persistent);
    }

    function rankedHabitValues(dictionary, minimumEvidence = 3, maximum = 8) {
      return Object.values(dictionary || {})
        .map((value) => {
          const starts = Math.max(0, Math.floor(finiteNumber(value.starts)));
          const completes = Math.max(0, Math.floor(finiteNumber(value.completes)));
          const skips = Math.max(0, Math.floor(finiteNumber(value.skips)));
          const replays = Math.max(0, Math.floor(finiteNumber(value.replays)));
          const evidence = starts + completes + skips + replays;
          const completionRatio = starts > 0 ? clamp(completes / starts, 0, 1) : 0;
          const confidence = clamp((Math.min(evidence, 8) / 8) * 0.7 + completionRatio * 0.3, 0, 1);
          return { ...value, starts, completes, skips, replays, evidence, confidence };
        })
        .filter((value) => value.evidence >= minimumEvidence && value.starts >= 3)
        .sort((left, right) => (right.completes + right.replays * 2 - right.skips) - (left.completes + left.replays * 2 - left.skips)
          || right.evidence - left.evidence)
        .slice(0, maximum);
    }

    function habitSummary() {
      const habits = readPersistentState().habits;
      return Object.freeze({
        evidenceEvents: habits.events,
        topSongs: Object.freeze(rankedHabitValues(habits.songs)),
        topArtists: Object.freeze(rankedHabitValues(habits.artists)),
        topPlaylists: Object.freeze(rankedHabitValues(habits.playlists)),
        topProviders: Object.freeze(rankedHabitValues(habits.providers)),
        timeBuckets: Object.freeze({ ...habits.timeBuckets }),
        volumeBuckets: Object.freeze({ ...habits.volumeBuckets }),
        inferenceThreshold: 3
      });
    }

    function snapshot() {
      const live = typeof player.snapshot === 'function' ? (player.snapshot() || {}) : {};
      const durationSeconds = Math.max(0, finiteNumber(live.durationSeconds));
      const positionSeconds = clamp(finiteNumber(live.positionSeconds), 0, durationSeconds || Number.MAX_SAFE_INTEGER);
      return Object.freeze({
        song: live.song && typeof live.song === 'object' ? { ...live.song } : null,
        playing: live.playing === true,
        positionSeconds,
        durationSeconds,
        remainingSeconds: Math.max(0, durationSeconds - positionSeconds),
        progress: durationSeconds > 0 ? clamp(positionSeconds / durationSeconds, 0, 1) : 0,
        queueIndex: Math.max(-1, Math.floor(finiteNumber(live.queueIndex, -1))),
        queueLength: Math.max(0, Math.floor(finiteNumber(live.queueLength)))
      });
    }

    function publicProgressWatch(watch, status = 'watching') {
      return Object.freeze({
        watchId: watch.id,
        status,
        songId: watch.songId,
        positionSeconds: watch.positionSeconds,
        durationSeconds: watch.durationSeconds,
        progress: watch.durationSeconds > 0
          ? clamp(watch.positionSeconds / watch.durationSeconds, 0, 1)
          : 0,
        startedAt: watch.startedAt,
        updatedAt: watch.updatedAt
      });
    }

    function startProgressWatch(parameters = {}) {
      const live = snapshot();
      const requestedSongId = String(parameters.songId || '').trim().slice(0, 240);
      const songId = requestedSongId || String(live.song?.id || '').trim().slice(0, 240);
      if (!songId) throw operationError('A current song or song id is required.', 'progress_watch_song_required');
      generatedWatchId += 1;
      const now = Date.now();
      const watch = {
        id: `watch-${now.toString(36)}-${generatedWatchId.toString(36)}`,
        scope: storageKey(),
        songId,
        positionSeconds: live.positionSeconds,
        durationSeconds: live.durationSeconds,
        startedAt: now,
        updatedAt: now
      };
      progressWatches.set(watch.id, watch);
      while (progressWatches.size > 16) progressWatches.delete(progressWatches.keys().next().value);
      return publicProgressWatch(watch);
    }

    function stopProgressWatch(parameters = {}) {
      const id = String(parameters.watchId || parameters.id || '').trim().slice(0, 160);
      if (!id) throw operationError('A progress watch id is required.', 'progress_watch_required');
      const watch = progressWatches.get(id);
      if (!watch || watch.scope !== storageKey()) {
        throw operationError('The progress watch was not found.', 'progress_watch_not_found');
      }
      progressWatches.delete(id);
      return publicProgressWatch(watch, 'stopped');
    }

    function updateProgressWatches(payload = {}) {
      const scope = storageKey();
      const songId = String(payload.songId || payload.song?.id || '').trim().slice(0, 240);
      const positionSeconds = Math.max(0, finiteNumber(payload.positionSeconds));
      const durationSeconds = Math.max(0, finiteNumber(payload.durationSeconds));
      const updatedAt = Date.now();
      progressWatches.forEach((watch) => {
        if (watch.scope !== scope || (watch.songId && watch.songId !== songId)) return;
        watch.positionSeconds = positionSeconds;
        watch.durationSeconds = durationSeconds;
        watch.updatedAt = updatedAt;
      });
    }

    async function queryQueue(parameters = {}) {
      if (typeof player.queuePage !== 'function') {
        throw operationError('The player does not expose queue pages.', 'queue_unavailable');
      }
      const cursor = Math.max(0, Math.floor(finiteNumber(parameters.cursor)));
      const limit = clamp(Math.floor(finiteNumber(parameters.limit, 12)), 1, 50);
      const page = await player.queuePage(cursor, limit) || {};
      const items = Array.isArray(page.items) ? page.items.slice(0, limit).map((item) => ({ ...item })) : [];
      const total = Math.max(items.length, Math.floor(finiteNumber(page.total, cursor + items.length)));
      return Object.freeze({
        items: Object.freeze(items),
        total,
        cursor,
        limit,
        nextCursor: cursor + items.length < total ? String(cursor + items.length) : null,
        queueIndex: Math.max(-1, Math.floor(finiteNumber(page.queueIndex, -1))),
        queueRevision: Math.max(0, Math.floor(finiteNumber(page.queueRevision)))
      });
    }

    async function playlistCatalog() {
      if (typeof playlists.list !== 'function') {
        throw operationError('Playlist catalog is unavailable.', 'playlist_unavailable');
      }
      const values = await playlists.list();
      return (Array.isArray(values) ? values : [])
        .filter((item) => item && typeof item === 'object')
        .slice(0, 2_000)
        .map((item) => ({ ...item }));
    }

    async function queryPlaylists(parameters = {}) {
      const query = normalizedText(parameters.query || parameters.keyword);
      const catalog = await playlistCatalog();
      const matches = query
        ? catalog.filter((playlist) => [playlist.id, playlist.name, playlist.provider]
          .some((value) => normalizedText(value).includes(query)))
        : catalog;
      return pageOf(matches, parameters);
    }

    async function resolvePlaylist(value) {
      const requested = normalizedText(value);
      if (!requested) throw operationError('A playlist id or exact name is required.', 'playlist_required');
      const catalog = await playlistCatalog();
      const byId = catalog.filter((playlist) => normalizedText(playlist.id) === requested);
      if (byId.length === 1) return byId[0];
      const byName = catalog.filter((playlist) => normalizedText(playlist.name) === requested);
      if (byName.length === 1) return byName[0];
      if (byId.length > 1 || byName.length > 1) {
        throw operationError('More than one playlist has that name; use its id.', 'ambiguous_playlist');
      }
      throw operationError('No exact playlist match was found.', 'playlist_not_found');
    }

    async function playPlaylist(parameters = {}) {
      if (typeof playlists.tracks !== 'function' || typeof playlists.play !== 'function') {
        throw operationError('Playlist playback is unavailable.', 'playlist_playback_unavailable');
      }
      const playlist = await resolvePlaylist(parameters.playlist ?? parameters.playlistId ?? parameters.name);
      const values = await playlists.tracks(playlist);
      const tracks = (Array.isArray(values) ? values : []).filter(Boolean).slice(0, 2_000);
      if (!tracks.length) throw operationError('The playlist has no playable tracks.', 'playlist_empty');
      const index = clamp(Math.floor(finiteNumber(parameters.index)), 0, tracks.length - 1);
      const result = await playlists.play(playlist, tracks, index);
      return result && typeof result === 'object'
        ? Object.freeze({ ...result, playlist: { id: playlist.id, name: playlist.name }, queueLength: tracks.length })
        : Object.freeze({ ok: true, playlist: { id: playlist.id, name: playlist.name }, index, queueLength: tracks.length });
    }

    function normalizeAutomationTrigger(value) {
      const trigger = value && typeof value === 'object' ? value : {};
      const type = normalizedText(trigger.type);
      if (type === 'progress') {
        const hasSeconds = Number.isFinite(Number(trigger.atSeconds));
        const hasPercent = Number.isFinite(Number(trigger.atPercent));
        if (!hasSeconds && !hasPercent) {
          throw operationError('Progress automation requires atSeconds or atPercent.', 'invalid_trigger');
        }
        return {
          type,
          atSeconds: hasSeconds ? clamp(finiteNumber(trigger.atSeconds), 0, 86_400) : null,
          atPercent: hasPercent ? clamp(finiteNumber(trigger.atPercent), 0, 1) : null,
          songId: String(trigger.songId || '').trim().slice(0, 240) || null
        };
      }
      if (type === 'event') {
        const event = normalizedText(trigger.event || trigger.name);
        if (!['track-start', 'track-complete', 'track-skip', 'track-replay', 'play', 'pause'].includes(event)) {
          throw operationError('That playback event cannot trigger automation.', 'invalid_trigger');
        }
        return {
          type,
          event,
          songId: String(trigger.songId || '').trim().slice(0, 240) || null
        };
      }
      throw operationError('Automation requires a progress or playback-event trigger.', 'invalid_trigger');
    }

    function normalizeAutomationAction(value) {
      const action = value && typeof value === 'object' ? value : {};
      const requestedCommand = normalizedText(action.command);
      const command = AUTOMATION_ACTION_ALIASES[requestedCommand] || requestedCommand;
      if (!AUTOMATION_ACTIONS.has(command)) {
        throw operationError('That command cannot run from playback automation.', 'automation_action_denied');
      }
      return {
        command,
        parameters: action.parameters && typeof action.parameters === 'object'
          ? JSON.parse(JSON.stringify(action.parameters))
          : {}
      };
    }

    function createAutomationRule(parameters = {}, context = {}) {
      if (context.confirmed !== true) {
        throw operationError('Persistent playback automation requires confirmation.', 'confirmation_required');
      }
      const persistent = readPersistentState();
      if (persistent.rules.filter((rule) => rule?.status !== 'archived').length >= 32) {
        throw operationError('At most 32 active automation rules can be stored.', 'automation_limit');
      }
      generatedId += 1;
      const now = Date.now();
      const rule = {
        id: `rule-${now.toString(36)}-${generatedId.toString(36)}`,
        title: String(parameters.title || 'Playback automation').trim().slice(0, 120),
        trigger: normalizeAutomationTrigger(parameters.trigger),
        action: normalizeAutomationAction(parameters.action),
        status: 'active',
        once: parameters.once !== false,
        createdAt: now,
        lastFiredAt: null
      };
      persistent.rules.unshift(rule);
      persistent.rules = persistent.rules.slice(0, 32);
      writePersistentState(persistent);
      return Object.freeze({ ...rule });
    }

    function queryAutomationRules(parameters = {}) {
      const persistent = readPersistentState();
      const includeArchived = parameters.includeArchived === true;
      const rules = persistent.rules
        .filter((rule) => rule && (includeArchived || rule.status !== 'archived'))
        .map((rule) => ({ ...rule, action: { ...rule.action }, trigger: { ...rule.trigger } }));
      return pageOf(rules, parameters);
    }

    function updateAutomationRuleStatus(operation, parameters = {}, context = {}) {
      if (context.confirmed !== true) {
        throw operationError('Changing persistent playback automation requires confirmation.', 'confirmation_required');
      }
      const id = String(parameters.id || parameters.ruleId || '').trim().slice(0, 160);
      if (!id) throw operationError('An automation rule id is required.', 'automation_rule_required');
      const persistent = readPersistentState();
      const rule = persistent.rules.find((candidate) => candidate?.id === id);
      if (!rule) throw operationError('The automation rule was not found.', 'automation_rule_not_found');
      if (operation !== 'archive' && rule.status === 'archived') {
        throw operationError('Archived automation cannot be re-enabled.', 'automation_rule_archived');
      }
      if (operation === 'enable') {
        rule.status = 'active';
        delete rule.lastError;
      } else if (operation === 'disable') {
        rule.status = 'disabled';
      } else {
        rule.status = 'archived';
        rule.archivedAt = Date.now();
      }
      writePersistentState(persistent);
      return Object.freeze({ ...rule, action: { ...rule.action }, trigger: { ...rule.trigger } });
    }

    function triggerCrossed(rule, previous, current, payload) {
      if (rule.trigger.songId && String(payload.songId || '') !== rule.trigger.songId) return false;
      const threshold = rule.trigger.atSeconds != null
        ? rule.trigger.atSeconds
        : Math.max(0, finiteNumber(payload.durationSeconds)) * rule.trigger.atPercent;
      return Number.isFinite(threshold) && previous < threshold && current >= threshold;
    }

    async function runAutomationRule(rule, persistent) {
      if (runningRuleIds.has(rule.id) || typeof commandBus.execute !== 'function') return;
      runningRuleIds.add(rule.id);
      const stored = persistent.rules.find((candidate) => candidate?.id === rule.id);
      if (!stored || stored.status !== 'active') {
        runningRuleIds.delete(rule.id);
        return;
      }
      stored.lastFiredAt = Date.now();
      if (stored.once !== false) stored.status = 'completed';
      writePersistentState(persistent);
      try {
        await commandBus.execute(stored.action.command, stored.action.parameters || {}, {
          source: 'playback-automation',
          automationRuleId: stored.id,
          confirmed: true
        });
      } catch (error) {
        stored.lastError = String(error?.message || error || 'automation failed').slice(0, 240);
        stored.status = 'error';
        writePersistentState(persistent);
      } finally {
        runningRuleIds.delete(rule.id);
      }
    }

    async function notifyAutomationEvent(name, payload = {}) {
      const persistent = readPersistentState();
      const songId = String(payload.songId || payload.song?.id || '');
      const due = persistent.rules.filter((rule) => rule?.status === 'active'
        && rule?.trigger?.type === 'event'
        && rule.trigger.event === name
        && (!rule.trigger.songId || rule.trigger.songId === songId));
      for (const rule of due) await runAutomationRule(rule, persistent);
      return due.length;
    }

    async function notify(event, payload = {}) {
      const name = normalizedText(event);
      publishPlaybackState(name);
      if (['track-start', 'track-complete', 'track-skip', 'track-replay', 'volume-change'].includes(name)) {
        recordHabitEvent(name, payload);
        const fired = name === 'volume-change' ? 0 : await notifyAutomationEvent(name, payload);
        return Object.freeze({ processed: true, recorded: true, fired });
      }
      if (name !== 'progress') {
        const fired = await notifyAutomationEvent(name, payload);
        return Object.freeze({ processed: fired > 0, fired });
      }
      updateProgressWatches(payload);
      const positionSeconds = Math.max(0, finiteNumber(payload.positionSeconds));
      const second = Math.floor(positionSeconds);
      const songKey = String(payload.songId || payload.song?.id || 'current').slice(0, 240);
      const runtimeKey = `${storageKey()}|${songKey}`;
      const previousValue = runtimeProgress.get(runtimeKey);
      if (previousValue && previousValue.second === second) return Object.freeze({ processed: false, deduplicated: true });
      const previous = previousValue ? previousValue.positionSeconds : Math.max(-1, positionSeconds - 1);
      runtimeProgress.set(runtimeKey, { second, positionSeconds });
      const persistent = readPersistentState();
      const due = persistent.rules.filter((rule) => rule?.status === 'active'
        && rule?.trigger?.type === 'progress'
        && triggerCrossed(rule, previous, positionSeconds, payload));
      for (const rule of due) await runAutomationRule(rule, persistent);
      return Object.freeze({ processed: true, fired: due.length });
    }

    async function execute(operation, parameters = {}, context = {}) {
      const requestedName = String(operation || '').trim().toLowerCase();
      const name = OPERATION_ALIASES[requestedName] || requestedName;
      if (name === 'queue.query') return queryQueue(parameters);
      if (name === 'playlist.query') return queryPlaylists(parameters);
      if (name === 'playlist.play') return playPlaylist(parameters);
      if (name === 'playback.progress.watch.start') return startProgressWatch(parameters);
      if (name === 'playback.progress.watch.stop') return stopProgressWatch(parameters);
      if (name === 'automation.rule.create') return createAutomationRule(parameters, context);
      if (name === 'automation.rule.query') return queryAutomationRules(parameters);
      if (name === 'automation.rule.enable') return updateAutomationRuleStatus('enable', parameters, context);
      if (name === 'automation.rule.disable') return updateAutomationRuleStatus('disable', parameters, context);
      if (name === 'automation.rule.archive') return updateAutomationRuleStatus('archive', parameters, context);
      if (name === 'habit.summary' || name === 'habit.profile.query') return habitSummary();
      throw operationError(`Unsupported playback intelligence operation: ${name || '(empty)'}`, 'unsupported_operation');
    }

    return Object.freeze({ snapshot, execute, notify });
  }

  global.FeMonsterPlaybackIntelligence = Object.freeze({ version: 1, create });
})(window);
