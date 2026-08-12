(function initializePetEmotionRuntime(global) {
  'use strict';

  if (global.FeMonsterPetEmotionRuntime) return;

  const DEFAULT_STORAGE_KEY = 'fe-monster-pet-emotion-v1';
  const DEFAULT_DAILY_LIMIT = 3;
  const DEFAULT_SPONTANEITY = 0.35;
  const DEFAULT_COOLDOWN_MINUTES = 30;
  const PROACTIVE_IDLE_AFTER_MS = 7 * 60 * 1_000;
  const HEARTBEAT_MIN_MS = 4 * 60 * 1_000;
  const HEARTBEAT_JITTER_MS = 5 * 60 * 1_000;
  const RETURN_AFTER_MS = 2 * 60 * 60 * 1_000;
  const SKIP_WINDOW_MS = 10 * 60 * 1_000;
  const SEVEN_EMOTION_KEYS = Object.freeze([
    'joy', 'anger', 'sorrow', 'fear', 'love', 'disgust', 'desire'
  ]);
  const SEVEN_EMOTION_KEY_SET = new Set(SEVEN_EMOTION_KEYS);
  const CONVERSATION_VISUALS = Object.freeze({
    joy: Object.freeze({ mood: 5, energy: 4, motion: 'lift', responseStyle: 'aquarius-wry-explorer' }),
    anger: Object.freeze({ mood: 2, energy: 5, motion: 'pulse', responseStyle: 'aquarius-cool-boundary' }),
    sorrow: Object.freeze({ mood: 1, energy: 2, motion: 'droop', responseStyle: 'aquarius-quiet-observer' }),
    fear: Object.freeze({ mood: 2, energy: 4, motion: 'tremble', responseStyle: 'aquarius-calm-analyst' }),
    love: Object.freeze({ mood: 5, energy: 3, motion: 'orbit', responseStyle: 'aquarius-warm-observer' }),
    disgust: Object.freeze({ mood: 1, energy: 3, motion: 'recoil', responseStyle: 'aquarius-dry-boundary' }),
    desire: Object.freeze({ mood: 4, energy: 4, motion: 'reach', responseStyle: 'aquarius-curious-reframe' })
  });

  function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function boundedText(value, maximum = 160) {
    return String(value ?? '').trim().slice(0, maximum);
  }

  function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function safeStorage() {
    try { return global.localStorage || null; } catch (_) { return null; }
  }

  function normalizePlayback(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const song = source.song && typeof source.song === 'object'
      ? {
          id: boundedText(source.song.id, 240),
          name: boundedText(source.song.name || source.song.title, 240),
          artist: boundedText(source.song.artist, 240),
          provider: boundedText(source.song.provider, 80)
        }
      : null;
    const durationSeconds = Math.max(0, finiteNumber(source.durationSeconds));
    const positionSeconds = clamp(finiteNumber(source.positionSeconds), 0, durationSeconds || Number.MAX_SAFE_INTEGER);
    return {
      song,
      playing: source.playing === true,
      positionSeconds,
      durationSeconds,
      remainingSeconds: Math.max(0, finiteNumber(source.remainingSeconds, durationSeconds - positionSeconds)),
      progress: durationSeconds > 0
        ? clamp(finiteNumber(source.progress, positionSeconds / durationSeconds), 0, 1)
        : 0,
      queueIndex: Math.max(-1, Math.floor(finiteNumber(source.queueIndex, -1))),
      queueLength: Math.max(0, Math.floor(finiteNumber(source.queueLength))),
      volume: clamp(Math.round(finiteNumber(source.volume, 50)), 0, 100),
      preset: boundedText(source.preset, 80),
      page: boundedText(source.page, 40)
    };
  }

  function sevenEmotionsForSession(value) {
    const source = 'client-playback-session';
    if (value.recentSkips >= 6) {
      return { primary: 'disgust', intensity: 0.78, secondary: 'desire', source };
    }
    if (value.recentSkips >= 3) {
      return { primary: 'desire', intensity: 0.62, secondary: 'disgust', source };
    }
    if (value.deepNight && value.playing) {
      return { primary: 'desire', intensity: 0.55, secondary: 'sorrow', source };
    }
    if (Math.max(value.playbackSilenceMinutes, value.userSilenceMinutes) >= 6 * 60) {
      return { primary: 'sorrow', intensity: 0.55, secondary: 'love', source };
    }
    if (value.playbackMinutes >= 60) {
      return { primary: 'love', intensity: 0.8, secondary: 'joy', source };
    }
    if (value.playbackMinutes >= 20) {
      return { primary: 'joy', intensity: 0.68, secondary: 'love', source };
    }
    if (value.playing) {
      return { primary: 'joy', intensity: 0.5, secondary: 'desire', source };
    }
    return { primary: 'joy', intensity: 0.4, secondary: null, source };
  }

  function normalizeConversationEmotion(value) {
    const input = record(value);
    const source = boundedText(input.source, 40).toLowerCase();
    if (!['user-text', 'voice-transcript-final', 'proactive'].includes(source)) return null;
    const sessionId = boundedText(input.sessionId, 160);
    const requestId = boundedText(input.requestId, 160);
    const turnSequence = Math.max(0, Math.floor(finiteNumber(
      input.conversationEmotionSequence ?? input.turnSequence ?? input.sequence
    )));
    if (!sessionId || !requestId || turnSequence < 1) return null;
    const seven = record(input.sevenEmotion || input.sevenEmotions);
    const primaryValue = seven.primary;
    const primaryState = record(primaryValue);
    const primary = boundedText(
      typeof primaryValue === 'string' ? primaryValue : primaryState.key,
      20
    ).toLowerCase();
    if (!SEVEN_EMOTION_KEY_SET.has(primary)) return null;
    const intensity = clamp(finiteNumber(
      typeof primaryValue === 'string' ? seven.intensity : primaryState.intensity,
      0.6
    ), 0.01, 1);
    const secondaryValues = Array.isArray(seven.secondary)
      ? seven.secondary
      : seven.secondary ? [seven.secondary] : [];
    const secondary = secondaryValues.map((candidate) => {
      const state = record(candidate);
      return boundedText(typeof candidate === 'string' ? candidate : state.key, 20).toLowerCase();
    }).find((key) => SEVEN_EMOTION_KEY_SET.has(key) && key !== primary) || null;
    return Object.freeze({
      sessionId,
      requestId,
      turnSequence,
      source,
      preserveCurrent: input.preserveCurrent === true || source === 'proactive',
      sevenEmotions: Object.freeze({
        primary,
        intensity: Math.round(intensity * 100) / 100,
        secondary,
        confidence: Math.round(clamp(finiteNumber(seven.confidence, 0.5), 0, 1) * 100) / 100,
        source: `server-${source}`
      })
    });
  }

  function create(options = {}) {
    const storage = options.storage || null;
    const storageKey = boundedText(options.storageKey, 180) || DEFAULT_STORAGE_KEY;
    const nowValue = typeof options.now === 'function' ? options.now : () => Date.now();
    const getProgramState = typeof options.getProgramState === 'function' ? options.getProgramState : () => ({});
    const onProactive = typeof options.onProactive === 'function' ? options.onProactive : () => {};
    const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
    const randomValue = typeof options.random === 'function' ? options.random : Math.random;

    function currentTime() {
      const value = nowValue();
      const date = value instanceof Date ? new Date(value.getTime()) : new Date(finiteNumber(value, Date.now()));
      return { date, ms: date.getTime() };
    }

    function localDay(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    function readStoredState() {
      if (typeof storage?.getItem !== 'function') return {};
      try {
        const parsed = JSON.parse(storage.getItem(storageKey) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch (_) {
        return {};
      }
    }

    const stored = readStoredState();
    const started = currentTime();
    let playback = normalizePlayback(getProgramState());
    let playbackObservedAt = started.ms;
    let lastPlaybackActivityAt = started.ms;
    let activePlaybackMs = 0;
    let skipTimes = [];
    let lastUserInteractionAt = Math.max(0, finiteNumber(stored.lastUserInteractionAt, started.ms));
    let dailyLimit = clamp(Math.floor(finiteNumber(stored.dailyLimit, DEFAULT_DAILY_LIMIT)), 0, 10);
    let proactiveDay = boundedText(stored.proactiveDay, 10) || localDay(started.date);
    let proactiveCount = Math.max(0, Math.floor(finiteNumber(stored.proactiveCount)));
    let proactiveTypes = new Set(Array.isArray(stored.proactiveTypes)
      ? stored.proactiveTypes.map((value) => boundedText(value, 40)).filter(Boolean).slice(0, 12)
      : []);
    let spontaneity = clamp(finiteNumber(stored.spontaneity, DEFAULT_SPONTANEITY), 0, 1);
    let minimumCooldownMs = clamp(
      finiteNumber(stored.minimumCooldownMinutes, DEFAULT_COOLDOWN_MINUTES),
      1,
      24 * 60
    ) * 60_000;
    let quietMode = stored.quietMode === true;
    let hardDailyLimit = stored.hardDailyLimit === true;
    let lastProactiveAt = Math.max(0, finiteNumber(stored.lastProactiveAt));
    let lateNightAttemptDay = '';
    let lastChangeSignature = '';
    let lastSpontaneousProbeKey = '';
    let conversationEmotion = null;
    const latestConversationTurnBySession = new Map();
    const retiredConversationSessions = new Set();
    let activeConversationSessionId = '';
    let conversationEventGuardEnabled = false;
    let conversationTarget = { sessionId: '', requestId: '' };

    function persist() {
      if (typeof storage?.setItem !== 'function') return;
      try {
        storage.setItem(storageKey, JSON.stringify({
          version: 1,
          dailyLimit,
          lastUserInteractionAt,
          proactiveDay,
          proactiveCount,
          proactiveTypes: Array.from(proactiveTypes),
          spontaneity,
          minimumCooldownMinutes: minimumCooldownMs / 60_000,
          quietMode,
          hardDailyLimit,
          lastProactiveAt
        }));
      } catch (_) {}
    }

    function ensureCurrentDay(time = currentTime()) {
      const day = localDay(time.date);
      if (day === proactiveDay) return time;
      proactiveDay = day;
      proactiveCount = 0;
      proactiveTypes = new Set();
      persist();
      return time;
    }

    function recentSkipCount(nowMs) {
      skipTimes = skipTimes.filter((time) => nowMs - time <= SKIP_WINDOW_MS);
      return skipTimes.length;
    }

    function emotionAt(time = currentTime(), emotionOptions = {}) {
      ensureCurrentDay(time);
      const recentSkips = recentSkipCount(time.ms);
      const playbackMinutes = activePlaybackMs / 60_000;
      const playbackSilenceMinutes = playback.playing ? 0 : Math.max(0, time.ms - lastPlaybackActivityAt) / 60_000;
      const userSilenceMinutes = Math.max(0, time.ms - lastUserInteractionAt) / 60_000;
      const hour = time.date.getHours();
      const deepNight = hour >= 1 && hour < 5;

      let mood = 3;
      if (playbackMinutes >= 20) mood += 1;
      if (playbackMinutes >= 60) mood += 1;
      if (recentSkips >= 3) mood -= 1;
      if (recentSkips >= 6) mood -= 1;
      if (Math.max(playbackSilenceMinutes, userSilenceMinutes) >= 6 * 60) mood -= 1;
      mood = clamp(Math.round(mood), 1, 5);

      let energy = 3;
      if (playback.playing) energy += 1;
      if (playbackMinutes >= 45) energy += 1;
      if (recentSkips >= 3) energy += 1;
      if (deepNight) energy -= 1;
      if (playbackSilenceMinutes >= 60) energy -= 1;
      if (playbackSilenceMinutes >= 3 * 60) energy -= 1;
      energy = clamp(Math.round(energy), 1, 5);

      const sevenEmotions = sevenEmotionsForSession({
        recentSkips,
        deepNight,
        playing: playback.playing,
        playbackSilenceMinutes,
        userSilenceMinutes,
        playbackMinutes
      });

      const ambient = {
        mood,
        energy,
        sevenEmotions,
        responseStyle: energy <= 2 || deepNight
          ? 'aquarius-quiet-observer'
          : mood >= 4
            ? 'aquarius-wry-explorer'
            : recentSkips >= 3
              ? 'aquarius-curious-reframe'
              : 'aquarius-calm-analyst',
        recommendationStyle: mood <= 2
          ? 'gentle-unconventional'
          : mood >= 4
            ? 'adventurous-with-rationale'
            : 'open-ended-with-options',
        // The server generates the actual wording. The client only supplies a
        // concise style contract so emotion changes never turn into canned copy.
        replyLength: 'short',
        drivers: {
          playbackMinutes: Math.round(playbackMinutes * 10) / 10,
          recentSkips,
          playbackSilenceMinutes: Math.round(playbackSilenceMinutes),
          userSilenceMinutes: Math.round(userSilenceMinutes),
          timeOfDay: deepNight ? 'late-night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
        }
      };
      if (emotionOptions.includeConversation === false || !conversationEmotion) return ambient;
      const primary = conversationEmotion.sevenEmotions.primary;
      const visual = CONVERSATION_VISUALS[primary] || CONVERSATION_VISUALS.joy;
      return {
        ...ambient,
        mood: visual.mood,
        energy: visual.energy,
        sevenEmotions: conversationEmotion.sevenEmotions,
        responseStyle: visual.responseStyle,
        motion: visual.motion,
        motionIntensity: conversationEmotion.sevenEmotions.intensity,
        conversation: {
          sessionId: conversationEmotion.sessionId,
          requestId: conversationEmotion.requestId,
          turnSequence: conversationEmotion.turnSequence,
          source: conversationEmotion.source
        }
      };
    }

    function snapshot() {
      const emotion = emotionAt();
      return Object.freeze({
        mood: emotion.mood,
        energy: emotion.energy,
        sevenEmotions: Object.freeze({ ...emotion.sevenEmotions }),
        responseStyle: emotion.responseStyle,
        recommendationStyle: emotion.recommendationStyle,
        replyLength: emotion.replyLength,
        motion: boundedText(emotion.motion, 40),
        motionIntensity: clamp(finiteNumber(emotion.motionIntensity), 0, 1),
        conversation: emotion.conversation ? Object.freeze({ ...emotion.conversation }) : null,
        drivers: Object.freeze({ ...emotion.drivers }),
        playback: Object.freeze({ ...playback, song: playback.song ? Object.freeze({ ...playback.song }) : null }),
        proactive: Object.freeze({
          dailyLimit,
          dailyBudget: dailyLimit,
          usedToday: proactiveCount,
          remainingToday: Math.max(0, dailyLimit - proactiveCount),
          day: proactiveDay,
          spontaneity,
          minimumCooldownMinutes: minimumCooldownMs / 60_000,
          quietMode,
          hardDailyLimit
        })
      });
    }

    function context() {
      // Model input receives ambient playback/session emotion. The latest
      // server-classified conversation emotion is visual state, not history to
      // feed back into the next user turn.
      const ambient = emotionAt(currentTime(), { includeConversation: false });
      return Object.freeze({
        mood: ambient.mood,
        energy: ambient.energy,
        sevenEmotions: Object.freeze({ ...ambient.sevenEmotions }),
        responseStyle: ambient.responseStyle,
        recommendationStyle: ambient.recommendationStyle,
        replyLength: ambient.replyLength,
        affectsCommandExecution: false,
        executionPolicy: 'always-execute-valid-actions'
      });
    }

    function publishChange(current = snapshot()) {
      const signature = [
        current.mood,
        current.energy,
        current.drivers.recentSkips,
        current.playback.playing ? 1 : 0,
        current.playback.song?.id || '',
        current.sevenEmotions.primary,
        current.sevenEmotions.intensity,
        current.conversation?.requestId || ''
      ].join('|');
      if (signature === lastChangeSignature) return;
      lastChangeSignature = signature;
      try { onChange(Object.freeze({ snapshot: current, context: context() })); } catch (_) {}
    }

    function emitProactive(type, metadata = {}, optionsValue = {}) {
      const time = ensureCurrentDay();
      const oncePerDay = optionsValue.oncePerDay === true;
      const triggerWeight = clamp(finiteNumber(optionsValue.weight, spontaneity), 0, 1);
      if (quietMode || (hardDailyLimit && proactiveCount >= dailyLimit)) return null;
      if (oncePerDay && proactiveTypes.has(type)) return null;
      if (lastProactiveAt && time.ms - lastProactiveAt < minimumCooldownMs) return null;
      const overBudget = proactiveCount >= dailyLimit;
      const chance = triggerWeight * (overBudget ? 0.1 : 1);
      if (clamp(finiteNumber(randomValue(), 1), 0, 1) >= chance) return null;
      proactiveCount += 1;
      if (oncePerDay) proactiveTypes.add(type);
      lastProactiveAt = time.ms;
      persist();
      const detail = Object.freeze({
        type,
        source: boundedText(metadata.source, 40),
        createdAt: time.ms,
        variationKey: `${localDay(time.date)}:${time.date.getHours()}:${Math.floor(playback.positionSeconds / 30)}:${proactiveCount}`,
        emotion: context(),
        playback: Object.freeze({ ...playback, song: playback.song ? Object.freeze({ ...playback.song }) : null })
      });
      try { onProactive(detail); } catch (_) {}
      return detail;
    }

    function accruePlayback(nextPlayback, eventName, nowMs) {
      if (playback.playing) {
        const sameSong = !playback.song?.id || !nextPlayback.song?.id || playback.song.id === nextPlayback.song.id;
        const positionDelta = sameSong ? nextPlayback.positionSeconds - playback.positionSeconds : 0;
        const elapsed = clamp(nowMs - playbackObservedAt, 0, 15_000);
        const listened = positionDelta > 0 && positionDelta <= 30 ? positionDelta * 1_000 : elapsed;
        activePlaybackMs += Math.max(0, listened);
      }
      if ((eventName === 'play' || eventName === 'track-start') && nowMs - lastPlaybackActivityAt >= RETURN_AFTER_MS) {
        activePlaybackMs = 0;
        skipTimes = [];
      }
      if (eventName === 'play') nextPlayback.playing = true;
      if (eventName === 'pause' || eventName === 'track-complete') nextPlayback.playing = false;
      if (nextPlayback.playing || playback.playing) lastPlaybackActivityAt = nowMs;
      playbackObservedAt = nowMs;
      playback = nextPlayback;
    }

    function notifyPlayback(event, value = {}) {
      const eventName = boundedText(event, 40).toLowerCase();
      const time = currentTime();
      let live = {};
      try { live = getProgramState() || {}; } catch (_) {}
      const nextPlayback = normalizePlayback({ ...(value || {}), ...(live || {}) });
      accruePlayback(nextPlayback, eventName, time.ms);
      if (eventName === 'track-skip') {
        skipTimes.push(time.ms);
        recentSkipCount(time.ms);
      }
      const day = localDay(time.date);
      if (playback.playing
        && time.date.getHours() >= 1
        && time.date.getHours() < 5
        && lateNightAttemptDay !== day) {
        lateNightAttemptDay = day;
        emitProactive('late-night', { source: 'playback' }, { oncePerDay: true, weight: 0.82 });
      } else if (eventName === 'track-start' || eventName === 'track-complete') {
        emitProactive('spontaneous', { source: 'playback' }, { weight: 0.03 + spontaneity * 0.17 });
      }
      if (eventName === 'progress' && playback.playing && playback.positionSeconds >= 30) {
        const songKey = playback.song?.id || playback.song?.name || 'current';
        const probeKey = `${songKey}:${Math.floor(playback.positionSeconds / 30)}`;
        if (probeKey !== lastSpontaneousProbeKey) {
          lastSpontaneousProbeKey = probeKey;
          emitProactive('spontaneous', { source: 'playback-progress' }, {
            weight: 0.004 + spontaneity * 0.012
          });
        }
      }
      const current = snapshot();
      publishChange(current);
      return current;
    }

    function noteUserInteraction(metadata = {}) {
      const time = currentTime();
      const silentFor = Math.max(0, time.ms - lastUserInteractionAt);
      lastUserInteractionAt = time.ms;
      persist();
      const proactive = silentFor < RETURN_AFTER_MS
        ? null
        : emitProactive('return-greeting', metadata, {
            weight: 0.65 + spontaneity * 0.3
          });
      publishChange();
      return proactive;
    }

    function applyConversationEmotion(value = {}) {
      const normalized = normalizeConversationEmotion(value);
      if (!normalized) return snapshot();
      if (retiredConversationSessions.has(normalized.sessionId)) return snapshot();
      if (activeConversationSessionId && normalized.sessionId !== activeConversationSessionId) {
        retiredConversationSessions.add(activeConversationSessionId);
      }
      activeConversationSessionId = normalized.sessionId;
      const latestConversationTurnSequence = Math.max(
        0,
        Number(latestConversationTurnBySession.get(normalized.sessionId)) || 0
      );
      if (normalized.turnSequence < latestConversationTurnSequence) return snapshot();
      if (
        normalized.turnSequence === latestConversationTurnSequence
          && conversationEmotion?.sessionId === normalized.sessionId
          && conversationEmotion.requestId !== normalized.requestId
      ) return snapshot();
      latestConversationTurnBySession.set(normalized.sessionId, normalized.turnSequence);
      const preservesRecentConversation = normalized.source === 'proactive'
        && normalized.preserveCurrent
        && conversationEmotion
        && conversationEmotion.sessionId === normalized.sessionId;
      if (!preservesRecentConversation) conversationEmotion = normalized;
      const current = snapshot();
      publishChange(current);
      return current;
    }

    function setConversationTarget(value = {}) {
      const target = record(value);
      conversationEventGuardEnabled = true;
      conversationTarget = {
        sessionId: boundedText(target.sessionId, 160),
        requestId: boundedText(target.requestId, 160)
      };
      return Object.freeze({ ...conversationTarget });
    }

    function applyConversationEvent(value = {}) {
      const eventValue = record(value);
      if (
        conversationEventGuardEnabled
          && (
            boundedText(eventValue.sessionId, 160) !== conversationTarget.sessionId
              || boundedText(eventValue.requestId, 160) !== conversationTarget.requestId
          )
      ) return snapshot();
      return applyConversationEmotion(eventValue);
    }

    function probeProactive(metadata = {}) {
      const time = currentTime();
      if (time.ms - lastUserInteractionAt < PROACTIVE_IDLE_AFTER_MS) return null;
      try {
        const live = getProgramState() || {};
        playback = normalizePlayback({ ...playback, ...live });
      } catch (_) {}
      return emitProactive('companion-check-in', {
        source: boundedText(metadata.source, 40) || 'heartbeat'
      }, {
        weight: 0.12 + spontaneity * 0.56 + (playback.playing ? 0.1 : 0)
      });
    }

    function setDailyLimit(value) {
      dailyLimit = clamp(Math.floor(finiteNumber(value, DEFAULT_DAILY_LIMIT)), 0, 10);
      persist();
      return snapshot().proactive;
    }

    function setProactiveSettings(value = {}) {
      if (Object.prototype.hasOwnProperty.call(value, 'dailyLimit')) {
        dailyLimit = clamp(Math.floor(finiteNumber(value.dailyLimit, DEFAULT_DAILY_LIMIT)), 0, 10);
      }
      if (Object.prototype.hasOwnProperty.call(value, 'spontaneity')) {
        spontaneity = clamp(finiteNumber(value.spontaneity, DEFAULT_SPONTANEITY), 0, 1);
      }
      if (Object.prototype.hasOwnProperty.call(value, 'minimumCooldownMinutes')) {
        minimumCooldownMs = clamp(finiteNumber(value.minimumCooldownMinutes, DEFAULT_COOLDOWN_MINUTES), 1, 24 * 60) * 60_000;
      }
      if (Object.prototype.hasOwnProperty.call(value, 'quietMode')) quietMode = value.quietMode === true;
      if (Object.prototype.hasOwnProperty.call(value, 'hardDailyLimit')) hardDailyLimit = value.hardDailyLimit === true;
      persist();
      return snapshot().proactive;
    }

    return Object.freeze({
      snapshot,
      context,
      notifyPlayback,
      noteUserInteraction,
      applyConversationEmotion,
      applyConversationEvent,
      setConversationTarget,
      probeProactive,
      setDailyLimit,
      setProactiveSettings
    });
  }

  const runtime = create({
    storage: safeStorage(),
    getProgramState: () => global.FeMonsterPetActionBridge?.snapshot?.() || {},
    onProactive(detail) {
      if (typeof global.CustomEvent !== 'function') return;
      global.dispatchEvent?.(new global.CustomEvent('fe-monster-pet-proactive', { detail }));
    },
    onChange(detail) {
      if (typeof global.CustomEvent !== 'function') return;
      global.dispatchEvent?.(new global.CustomEvent('fe-monster-pet-emotion-change', { detail }));
    }
  });

  function scheduleProactiveHeartbeat() {
    if (typeof global.setTimeout !== 'function') return;
    const delay = HEARTBEAT_MIN_MS + Math.floor(Math.random() * HEARTBEAT_JITTER_MS);
    global.setTimeout(() => {
      runtime.probeProactive({ source: 'heartbeat' });
      scheduleProactiveHeartbeat();
    }, delay);
  }
  scheduleProactiveHeartbeat();

  global.addEventListener?.('fe-monster-playback-state', (event) => {
    const detail = event?.detail || {};
    runtime.notifyPlayback(detail.event, detail.snapshot || detail.payload || {});
  });

  global.addEventListener?.('fe-monster-pet-event', (event) => {
    const detail = record(event?.detail);
    if (detail.historical === true || boundedText(detail.type, 64) !== 'pet.ai.state') return;
    const payload = record(detail.payload);
    runtime.applyConversationEvent({
      sessionId: payload.sessionId,
      requestId: payload.requestId,
      conversationEmotionSequence: payload.conversationEmotionSequence ?? payload.sequence,
      source: payload.conversationEmotionSource,
      sevenEmotion: payload.sevenEmotion
    });
  });

  const publicApi = Object.freeze({
    version: 1,
    create,
    snapshot: runtime.snapshot,
    context: runtime.context,
    notifyPlayback: runtime.notifyPlayback,
    noteUserInteraction: runtime.noteUserInteraction,
    applyConversationEmotion: runtime.applyConversationEmotion,
    applyConversationEvent: runtime.applyConversationEvent,
    setConversationTarget: runtime.setConversationTarget,
    probeProactive: runtime.probeProactive,
    setDailyLimit: runtime.setDailyLimit,
    setProactiveSettings: runtime.setProactiveSettings
  });
  global.FeMonsterPetEmotionRuntime = publicApi;

  try {
    global.FeMonsterAppCommands?.registerMany?.([
      {
        command: 'pet.state.query',
        aliases: ['pet.emotion.query'],
        title: '读取桌宠实时状态',
        description: '读取当前播放状态、心情、精力和主动聊天设置。',
        category: 'pet',
        readOnly: true,
        handler: () => publicApi.snapshot()
      },
      {
        command: 'pet.proactive.settings.set',
        aliases: ['pet.proactive.limit.set'],
        title: '调整桌宠主动聊天',
        description: '调整随机主动程度、软预算、最短冷却、安静模式或可选硬上限。',
        category: 'pet',
        parameters: {
          dailyLimit: '0-10，默认作为每日软预算',
          spontaneity: '0-1',
          minimumCooldownMinutes: '1-1440',
          quietMode: 'boolean',
          hardDailyLimit: 'boolean'
        },
        handler: (parameters) => publicApi.setProactiveSettings(parameters)
      }
    ]);
  } catch (_) {}
})(window);
