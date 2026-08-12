(function initializePetCompanionP2(global) {
  'use strict';

  if (global.FeMonsterPetCompanionP2) return;

  const STORAGE_KEY = 'fe-monster-pet-companion-p2-v1';
  const RAPID_SKIP_WINDOW_MS = 12_000;
  const RAPID_SKIP_THRESHOLD = 3;
  const EYE_ROLL_DURATION_MS = 2_800;
  const CHORUS_MAX_DELAY_MS = 7_000;
  const CHORUS_DELAY_COOLDOWN_MS = 30 * 60_000;
  const root = global.document?.getElementById?.('petAssistant') || null;
  const speech = global.document?.getElementById?.('petAssistantSpeech') || null;
  const media = global.document?.getElementById?.('audio') || null;

  const runtime = {
    activeTrackSignature: '',
    currentContext: null,
    currentSnapshot: null,
    energyEnvelope: 0,
    grooveUntil: 0,
    reactionTimer: 0,
    asideTimer: 0,
    skipMoments: [],
    lastSkipAt: 0,
    lastExplicitSkipAt: 0,
    lastDelayedNextAt: 0,
    pendingNext: null,
    store: loadStore()
  };

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function asDate(value) {
    const date = value instanceof Date ? value : new Date(value ?? Date.now());
    return Number.isFinite(date.getTime()) ? date : new Date();
  }

  function emptyStore() {
    return { version: 1, scopes: {} };
  }

  function loadStore() {
    try {
      const parsed = JSON.parse(global.localStorage?.getItem?.(STORAGE_KEY) || 'null');
      if (parsed?.version === 1 && parsed.scopes && typeof parsed.scopes === 'object') return parsed;
    } catch (_) {}
    return emptyStore();
  }

  function persistStore() {
    try { global.localStorage?.setItem?.(STORAGE_KEY, JSON.stringify(runtime.store)); } catch (_) {}
  }

  function localWeekKey(value) {
    const date = asDate(value);
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const weekday = monday.getDay() || 7;
    monday.setDate(monday.getDate() - weekday + 1);
    const year = monday.getFullYear();
    const month = String(monday.getMonth() + 1).padStart(2, '0');
    const day = String(monday.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function contextScope(context = runtime.currentContext) {
    const feId = String(context?.community?.profile?.feId || '').trim();
    if (feId) return `fe:${feId.slice(0, 32)}`;
    const provider = String(context?.accounts?.activeProvider || '').trim();
    return provider ? `provider:${provider.slice(0, 40)}` : 'local';
  }

  function scopeRecord(scope = contextScope()) {
    if (!runtime.store.scopes[scope] || typeof runtime.store.scopes[scope] !== 'object') {
      runtime.store.scopes[scope] = { weeks: {}, shownSummaryWeeks: [] };
    }
    const record = runtime.store.scopes[scope];
    if (!record.weeks || typeof record.weeks !== 'object') record.weeks = {};
    if (!Array.isArray(record.shownSummaryWeeks)) record.shownSummaryWeeks = [];
    return record;
  }

  function weekRecord(date, create = true) {
    const scope = scopeRecord();
    const key = localWeekKey(date);
    if (!scope.weeks[key] && create) {
      scope.weeks[key] = {
        songCount: 0,
        latestSleepMinute: null,
        lastTrackSignature: '',
        lastTrackAt: 0,
        updatedAt: 0
      };
      const keys = Object.keys(scope.weeks).sort();
      keys.slice(0, Math.max(0, keys.length - 8)).forEach((staleKey) => delete scope.weeks[staleKey]);
    }
    return scope.weeks[key] || null;
  }

  function songSignature(snapshot) {
    const song = snapshot?.song || {};
    const id = String(song.id || '').trim();
    const title = String(song.title || song.name || '').trim();
    const artist = String(song.artist || '').trim();
    const provider = String(song.provider || '').trim();
    const fallback = String(media?.currentSrc || media?.src || '').trim();
    return [provider, id || `${title}:${artist}` || fallback].filter(Boolean).join('|').slice(0, 420);
  }

  function noteLateListening(date) {
    const hour = date.getHours();
    if (hour < 22 && hour >= 6) return false;
    const minute = hour * 60 + date.getMinutes() + (hour < 6 ? 24 * 60 : 0);
    const week = weekRecord(date);
    if (finite(week.latestSleepMinute, -1) >= minute) return false;
    week.latestSleepMinute = minute;
    week.updatedAt = date.getTime();
    persistStore();
    return true;
  }

  function noteTrack(snapshot, date, eventName = '') {
    const signature = songSignature(snapshot);
    if (!signature) return false;
    const week = weekRecord(date);
    const restoredSameTrack = eventName === 'initialize'
      && week.lastTrackSignature === signature
      && date.getTime() - finite(week.lastTrackAt) < 6 * 60 * 60_000;
    if (restoredSameTrack) {
      runtime.activeTrackSignature = signature;
      return false;
    }
    const forceStart = eventName === 'track-start';
    if (!forceStart && signature === runtime.activeTrackSignature) return false;
    if (forceStart && signature === runtime.activeTrackSignature) return false;

    const previousSignature = runtime.activeTrackSignature;
    runtime.activeTrackSignature = signature;
    week.songCount = Math.max(0, Math.floor(finite(week.songCount))) + 1;
    week.lastTrackSignature = signature;
    week.lastTrackAt = date.getTime();
    week.updatedAt = date.getTime();
    persistStore();

    if (
      previousSignature
      && previousSignature !== signature
      && date.getTime() - runtime.lastExplicitSkipAt > 5_000
    ) noteSkip(date.getTime(), 'track-change');
    return true;
  }

  function setReaction(name, durationMs = EYE_ROLL_DURATION_MS) {
    if (!root) return;
    root.dataset.petReaction = name || '';
    global.clearTimeout?.(runtime.reactionTimer);
    runtime.reactionTimer = name ? global.setTimeout?.(() => {
      if (root.dataset.petReaction === name) root.dataset.petReaction = '';
      runtime.reactionTimer = 0;
    }, durationMs) || 0 : 0;
  }

  function noteSkip(at = Date.now(), source = 'playback') {
    const now = finite(at, Date.now());
    if (now - runtime.lastSkipAt < 450) return false;
    runtime.lastSkipAt = now;
    runtime.skipMoments = runtime.skipMoments.filter((value) => now - value <= RAPID_SKIP_WINDOW_MS);
    runtime.skipMoments.push(now);
    if (runtime.skipMoments.length < RAPID_SKIP_THRESHOLD) return false;
    runtime.skipMoments = [];
    setReaction('eye-roll');
    dispatch('fe-monster-pet-companion-reaction', { reaction: 'eye-roll', source, at: now });
    return true;
  }

  function isDeepNight(date) {
    const hour = date.getHours();
    return hour >= 1 && hour < 6;
  }

  function setBehavior(name, snapshot, at) {
    if (!root) return;
    const next = name || '';
    const changed = root.dataset.petBehavior !== next;
    root.dataset.petBehavior = next;
    root.dataset.petPlaying = snapshot?.playing === true ? 'true' : 'false';
    root.style.setProperty('--pet-program-energy', runtime.energyEnvelope.toFixed(3));
    if (changed) dispatch('fe-monster-pet-companion-state', {
      behavior: next || 'rest',
      playing: snapshot?.playing === true,
      energy: runtime.energyEnvelope,
      at
    });
  }

  function update(snapshot = {}, at = Date.now(), eventName = '') {
    const date = asDate(at);
    const now = date.getTime();
    runtime.currentSnapshot = { ...snapshot };
    const playing = snapshot.playing === true;
    const instantEnergy = clamp(Math.max(
      finite(snapshot.energy),
      finite(snapshot.bass) * .72,
      finite(snapshot.beat) * .84
    ), 0, 1);
    runtime.energyEnvelope += (instantEnergy - runtime.energyEnvelope) * (instantEnergy > runtime.energyEnvelope ? .42 : .16);

    if (eventName === 'track-skip') {
      runtime.lastExplicitSkipAt = now;
      noteSkip(now, 'playback');
    }
    if (playing || eventName === 'track-start') noteTrack(snapshot, date, eventName);
    if (eventName === 'track-complete') runtime.activeTrackSignature = '';
    if (playing) noteLateListening(date);
    if (playing) maybeShowWeeklySummary(date);

    if (!playing) {
      runtime.grooveUntil = 0;
      setBehavior('', snapshot, now);
      return status();
    }
    if (isDeepNight(date)) {
      setBehavior('night-yawn', snapshot, now);
      return status();
    }
    if (instantEnergy >= .5 || finite(snapshot.beat) >= .62 || finite(snapshot.bass) >= .72) {
      runtime.grooveUntil = now + 1_500;
    }
    setBehavior(runtime.grooveUntil > now || runtime.energyEnvelope >= .38 ? 'groove' : '', snapshot, now);
    return status();
  }

  function latestListeningText(value) {
    const minute = finite(value, -1);
    if (minute < 0) return '';
    const normalized = minute >= 24 * 60 ? minute - 24 * 60 : minute;
    const hour = Math.floor(normalized / 60);
    const remainder = normalized % 60;
    const time = remainder ? `${hour}点${remainder}分` : `${hour}点`;
    return minute >= 24 * 60 ? `最晚熬到凌晨${time}` : `最晚听到晚上${time}`;
  }

  function summaryForWeek(weekKey, label = '这周') {
    const week = scopeRecord().weeks[weekKey] || { songCount: 0, latestSleepMinute: null };
    const songCount = Math.max(0, Math.floor(finite(week.songCount)));
    const latest = latestListeningText(week.latestSleepMinute);
    const text = songCount === 0
      ? `${label}还没听歌，等你来开场。`
      : `${label}听了${songCount}首，${latest || '作息还挺稳'}，辛苦了。`;
    return Object.freeze({
      weekKey,
      scope: contextScope(),
      songCount,
      latestSleepMinute: Number.isFinite(Number(week.latestSleepMinute)) ? Number(week.latestSleepMinute) : null,
      text
    });
  }

  function weeklySummary(value = Date.now()) {
    const date = asDate(value);
    return summaryForWeek(localWeekKey(date), '这周');
  }

  function dispatch(type, detail) {
    try {
      if (typeof global.CustomEvent === 'function') global.dispatchEvent?.(new global.CustomEvent(type, { detail }));
    } catch (_) {}
  }

  function showAside(text, options = {}) {
    const message = String(text || '').trim().slice(0, 180);
    if (!message) return '';
    const previous = speech?.textContent || '';
    if (speech) speech.textContent = message;
    if (root) root.dataset.petAside = 'true';
    global.clearTimeout?.(runtime.asideTimer);
    const duration = clamp(finite(options.durationMs, 8_000), 1_000, 20_000);
    runtime.asideTimer = global.setTimeout?.(() => {
      if (speech?.textContent === message) speech.textContent = previous;
      if (root) root.dataset.petAside = 'false';
      runtime.asideTimer = 0;
    }, duration) || 0;
    dispatch('fe-monster-pet-companion-message', {
      kind: String(options.kind || 'aside').slice(0, 40),
      text: message,
      at: Date.now()
    });
    return message;
  }

  function showWeeklySummary(value = Date.now()) {
    const summary = weeklySummary(value);
    showAside(summary.text, { kind: 'weekly-summary', durationMs: 12_000 });
    dispatch('fe-monster-pet-weekly-summary', summary);
    return summary;
  }

  function maybeShowWeeklySummary(value = Date.now()) {
    const date = asDate(value);
    const scope = scopeRecord();
    const previousDate = new Date(date.getTime());
    previousDate.setDate(previousDate.getDate() - 7);
    const previousWeekKey = localWeekKey(previousDate);
    const targetWeekKey = scope.weeks[previousWeekKey]?.songCount ? previousWeekKey : '';
    if (!targetWeekKey || scope.shownSummaryWeeks.includes(targetWeekKey)) return null;
    const summary = summaryForWeek(targetWeekKey, '上周');
    scope.shownSummaryWeeks = [...scope.shownSummaryWeeks, targetWeekKey].slice(-8);
    persistStore();
    showAside(summary.text, { kind: 'weekly-summary', durationMs: 12_000 });
    dispatch('fe-monster-pet-weekly-summary', summary);
    return summary;
  }

  function explicitChorusPolicy(snapshot = {}, at = Date.now()) {
    const evaluatedAt = finite(at, Date.now());
    const section = snapshot.section;
    if (!section || section.reliable !== true) return Object.freeze({ delayMs: 0, reason: 'no-reliable-chorus' });
    const type = String(section.type || section.kind || section.name || '').trim().toLocaleLowerCase();
    if (!/(?:^|\b)(?:chorus|hook)(?:\b|$)|副歌|高潮/u.test(type)) {
      return Object.freeze({ delayMs: 0, reason: 'not-chorus' });
    }
    const start = finite(section.startSeconds, NaN);
    const end = finite(section.endSeconds, NaN);
    const position = finite(snapshot.positionSeconds, NaN);
    if (![start, end, position].every(Number.isFinite) || end <= start || position < start || position >= end) {
      return Object.freeze({ delayMs: 0, reason: 'outside-chorus' });
    }
    if (end - start > 90 || evaluatedAt - runtime.lastDelayedNextAt < CHORUS_DELAY_COOLDOWN_MS) {
      return Object.freeze({ delayMs: 0, reason: 'safety-fallback' });
    }
    const delayMs = Math.min(CHORUS_MAX_DELAY_MS, Math.max(0, Math.ceil((end - position) * 1_000)));
    if (delayMs < 450) return Object.freeze({ delayMs: 0, reason: 'chorus-ending' });
    return Object.freeze({
      delayMs,
      reason: 'explicit-chorus',
      message: '听完这段再切。',
      evaluatedAt
    });
  }

  function wait(delayMs) {
    return new Promise((resolve) => global.setTimeout?.(resolve, delayMs) ?? resolve());
  }

  function runNext(options = {}) {
    const execute = typeof options.execute === 'function' ? options.execute : null;
    if (!execute) return Promise.reject(new Error('next execution callback is required'));
    const source = String(options.source || '').trim().toLowerCase();
    if (!source.startsWith('pet-assistant')) return Promise.resolve().then(execute);
    if (runtime.pendingNext) return runtime.pendingNext;
    const requestedSnapshot = options.snapshot || runtime.currentSnapshot || {};
    const requestedTrack = songSignature(requestedSnapshot);
    const policy = explicitChorusPolicy(requestedSnapshot, options.at);
    runtime.pendingNext = (async () => {
      if (policy.delayMs > 0) {
        runtime.lastDelayedNextAt = Date.now();
        showAside(policy.message, { kind: 'chorus-hold', durationMs: policy.delayMs });
        await wait(policy.delayMs);
        let currentSnapshot = null;
        try { currentSnapshot = global.FeMonsterPetActionBridge?.snapshot?.() || null; } catch (_) {}
        const currentTrack = songSignature(currentSnapshot);
        if (requestedTrack && currentTrack && currentTrack !== requestedTrack) {
          return {
            ...(currentSnapshot && typeof currentSnapshot === 'object' ? currentSnapshot : {}),
            companion: {
              delayed: true,
              delayMs: policy.delayMs,
              message: policy.message,
              satisfiedByTrackChange: true
            }
          };
        }
      }
      const result = await execute();
      if (!result || typeof result !== 'object') return result;
      return { ...result, companion: { delayed: policy.delayMs > 0, delayMs: policy.delayMs, message: policy.message || '' } };
    })().finally(() => { runtime.pendingNext = null; });
    return runtime.pendingNext;
  }

  function status() {
    return Object.freeze({
      behavior: root?.dataset?.petBehavior || 'rest',
      reaction: root?.dataset?.petReaction || '',
      playing: runtime.currentSnapshot?.playing === true,
      energy: runtime.energyEnvelope,
      snapshot: runtime.currentSnapshot ? { ...runtime.currentSnapshot } : null
    });
  }

  function ingestPlaybackEvent(event) {
    const detail = event?.detail || {};
    let live = {};
    try { live = global.FeMonsterPetActionBridge?.snapshot?.() || {}; } catch (_) {}
    const snapshot = detail.snapshot && typeof detail.snapshot === 'object'
      ? { ...live, ...detail.snapshot }
      : live;
    update(snapshot, detail.at || Date.now(), String(detail.event || ''));
  }

  global.addEventListener?.('fe-monster-playback-state', ingestPlaybackEvent);
  global.addEventListener?.('fe-monster-pet-context-change', (event) => {
    runtime.currentContext = event?.detail?.context || runtime.currentContext;
  });
  global.FeMonsterPetClientContext?.subscribe?.((context) => { runtime.currentContext = context; });

  try { update(global.FeMonsterPetActionBridge?.snapshot?.() || {}, Date.now(), 'initialize'); } catch (_) {}

  global.FeMonsterPetCompanionP2 = Object.freeze({
    status,
    update,
    noteSkip,
    weeklySummary,
    showWeeklySummary,
    maybeShowWeeklySummary,
    showAside,
    nextPolicy: explicitChorusPolicy,
    runNext
  });
})(window);
