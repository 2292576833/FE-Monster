(function installPetAffectPlan(global) {
  'use strict';

  if (global.FeMonsterPetAffectPlan) return;

  const EMOTIONS = new Set([
    'neutral', 'joy', 'anger', 'sorrow', 'fear', 'love', 'disgust', 'desire'
  ]);
  const SOURCES = new Set([
    'server-seven-emotion', 'server-model', 'local-model', 'client-fallback'
  ]);
  const TIMES_OF_DAY = new Set(['morning', 'afternoon', 'evening', 'late-night']);
  const EMPTY = Object.freeze({});
  const DELIVERY = Object.freeze({
    neutral: Object.freeze({ speechRate: 0, loudnessRate: 0 }),
    joy: Object.freeze({ speechRate: 12, loudnessRate: 8 }),
    anger: Object.freeze({ speechRate: 9, loudnessRate: 12 }),
    sorrow: Object.freeze({ speechRate: -18, loudnessRate: -10 }),
    fear: Object.freeze({ speechRate: -10, loudnessRate: -8 }),
    love: Object.freeze({ speechRate: -6, loudnessRate: -2 }),
    disgust: Object.freeze({ speechRate: -4, loudnessRate: 2 }),
    desire: Object.freeze({ speechRate: 10, loudnessRate: 6 })
  });
  const DOUBAO_EMOTIONS = Object.freeze({
    neutral: '',
    joy: 'happy',
    anger: 'angry',
    sorrow: 'sad',
    fear: 'fear',
    love: 'affectionate',
    disgust: 'disgusted',
    desire: 'excited'
  });
  const NEGATIVE_EMOTIONS = new Set(['anger', 'sorrow', 'fear', 'disgust']);
  const AFFECTIVE_EMOTIONS = new Set(['joy', 'anger', 'sorrow', 'fear', 'love', 'disgust', 'desire']);
  const EMOTION_STAGE_PERCENT = Object.freeze({ subtle: 40, direct: 52, strong: 68 });
  const EMOTION_STAGE_CONFIDENCE = Object.freeze({ subtle: 0.6, direct: 0.68, strong: 0.78 });
  const EMOTION_STAGE_WEIGHT = Object.freeze({ dormant: 0, subtle: 0.35, direct: 0.7, strong: 1 });
  const EMOTION_TEXT_STEMS = Object.freeze({
    joy: '轻快地认可好消息并打开新角度',
    anger: '坚定而克制地指出问题',
    sorrow: '安静承认难受并给一个落脚点',
    fear: '稳定地拆解事实、风险与退路',
    love: '温暖回应但保留彼此自由',
    disgust: '冷静说明具体不适与边界',
    desire: '承认愿望并说清选项、成本与退出路径'
  });
  // Cultural persona styling only. These are not psychological claims about a user.
  const NEGATIVE_DISPOSITIONS = Object.freeze({
    anger: Object.freeze({
      tone: 'restrained-impatience',
      traits: Object.freeze(['克制的不耐烦', '直白质疑', '固执坚持事实']),
      promptCue: '克制地表达一点不耐烦，直接指出问题，但不把怒气对准用户。'
    }),
    sorrow: Object.freeze({
      tone: 'reserved-coolness',
      traits: Object.freeze(['克制的冷淡', '理性化整理', '安静陪伴']),
      promptCue: '克制而略显冷淡地收住煽情，用理性和安静陪伴给出下一步。'
    }),
    fear: Object.freeze({
      tone: 'skeptical-caution',
      traits: Object.freeze(['克制的怀疑', '风险拆解', '保留退路']),
      promptCue: '克制地保持怀疑，先核对事实、风险和退路，不放大恐惧。'
    }),
    disgust: Object.freeze({
      tone: 'cool-boundary',
      traits: Object.freeze(['克制的冷淡', '原则边界', '不盲从']),
      promptCue: '克制而冷淡地说明具体边界，可以反对做法，但不贬低任何人。'
    })
  });
  const SIGNALS = Object.freeze([
    Object.freeze({ emotion: 'sorrow', pattern: /(?:难过|伤心|想哭|失落|孤独|撑不住|心碎|低落|沮丧|委屈|痛苦|sad|lonely|depress)/iu, intensity: 0.9 }),
    Object.freeze({ emotion: 'fear', pattern: /(?:害怕|担心|焦虑|紧张|恐惧|不安|慌|压力|怕|anxious|afraid|worried)/iu, intensity: 0.84 }),
    Object.freeze({ emotion: 'anger', pattern: /(?:生气|愤怒|气死|火大|恼火|暴躁|烦死|怒|angry|furious)/iu, intensity: 0.86 }),
    Object.freeze({ emotion: 'disgust', pattern: /(?:讨厌|恶心|反感|厌恶|受不了|嫌弃|disgust|hate)/iu, intensity: 0.8 }),
    Object.freeze({ emotion: 'love', pattern: /(?:喜欢|爱你|想你|谢谢|感动|温暖|陪我|抱抱|love|thank)/iu, intensity: 0.82 }),
    Object.freeze({ emotion: 'desire', pattern: /(?:想要|希望|期待|想听|想看|想换|想试|渴望|wish|want|hope)/iu, intensity: 0.76 }),
    Object.freeze({ emotion: 'joy', pattern: /(?:开心|高兴|快乐|太棒|真棒|哈哈|好耶|惊喜|兴奋|happy|great|awesome)/iu, intensity: 0.82 })
  ]);

  function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : EMPTY;
  }

  function finite(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function rounded(value, digits = 2) {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
  }

  function emotion(value, fallback = 'neutral') {
    const key = String(value || '').trim().toLowerCase();
    return EMOTIONS.has(key) ? key : fallback;
  }

  function safeTurnId(value) {
    const id = String(value || '').trim();
    if (!id || id.length > 120 || /[^A-Za-z0-9._:-]/u.test(id)) return '';
    if (/(?:bearer|token|secret|api[_-]?key|https?|file)/iu.test(id)) return '';
    return id;
  }

  function timeOfDay(nowValue) {
    const candidate = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
    const now = Number.isFinite(candidate.getTime()) ? candidate : new Date();
    const hour = now.getHours();
    if (hour >= 22 || hour < 5) return 'late-night';
    if (hour >= 5 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 18) return 'afternoon';
    return 'evening';
  }

  function delivery(primary, secondary, intensity) {
    const first = DELIVERY[primary] || DELIVERY.neutral;
    const second = DELIVERY[secondary] || DELIVERY.neutral;
    const blend = secondary && secondary !== primary ? 0.2 : 0;
    const combined = (key) => first[key] * (1 - blend) + second[key] * blend;
    return {
      speechRate: Math.round(combined('speechRate') * intensity),
      loudnessRate: Math.round(combined('loudnessRate') * intensity)
    };
  }

  /** Canonical v1 boundary shared with the server; all other fields disappear. */
  function normalize(value = {}, options = {}) {
    const sourceValue = object(value);
    const optionValue = object(options);
    const primaryEmotion = emotion(sourceValue.primaryEmotion || sourceValue.primary);
    let secondaryEmotion = emotion(sourceValue.secondaryEmotion || sourceValue.secondary, '');
    if (secondaryEmotion === primaryEmotion) secondaryEmotion = '';
    const intensity = rounded(clamp(finite(sourceValue.intensity, 0.35), 0, 1));
    const confidence = rounded(clamp(finite(sourceValue.confidence, 0.5), 0, 1));
    const defaults = delivery(primaryEmotion, secondaryEmotion, intensity);
    const sourceCandidate = String(sourceValue.source || optionValue.source || 'client-fallback').trim().toLowerCase();
    const timeCandidate = String(sourceValue.timeOfDay || optionValue.timeOfDay || '').trim().toLowerCase();
    return Object.freeze({
      schemaVersion: 1,
      primaryEmotion,
      secondaryEmotion,
      intensity,
      confidence,
      speechRate: Math.round(clamp(finite(sourceValue.speechRate, defaults.speechRate), -50, 100)),
      loudnessRate: Math.round(clamp(finite(sourceValue.loudnessRate, defaults.loudnessRate), -50, 100)),
      source: SOURCES.has(sourceCandidate) ? sourceCandidate : 'client-fallback',
      timeOfDay: TIMES_OF_DAY.has(timeCandidate) ? timeCandidate : timeOfDay(optionValue.now),
      turnId: safeTurnId(sourceValue.turnId || optionValue.turnId),
      proactive: Object.prototype.hasOwnProperty.call(optionValue, 'proactive')
        ? optionValue.proactive === true
        : sourceValue.proactive === true,
      automatic: Object.prototype.hasOwnProperty.call(optionValue, 'automatic')
        ? optionValue.automatic === true
        : sourceValue.automatic === true
    });
  }

  function ambientSevenEmotion(contextValue) {
    const context = object(contextValue);
    const seven = object(context.sevenEmotions || context.sevenEmotion);
    const primaryValue = seven.primary;
    const primaryRecord = object(primaryValue);
    const primaryEmotion = emotion(
      typeof primaryValue === 'string' ? primaryValue : primaryRecord.key,
      ''
    );
    if (!primaryEmotion) return null;
    const candidates = Array.isArray(seven.secondary) ? seven.secondary : [seven.secondary];
    const secondaryEmotion = candidates.map((candidate) => {
      const state = object(candidate);
      return emotion(typeof candidate === 'string' ? candidate : state.key, '');
    }).find((key) => key && key !== primaryEmotion) || '';
    return {
      primaryEmotion,
      secondaryEmotion,
      intensity: finite(primaryRecord.intensity ?? seven.intensity, 0.5),
      confidence: finite(seven.confidence, 0.64)
    };
  }

  /** Deterministic fallback for endpoints that omit or reject tool calls. */
  function infer(options = {}) {
    const input = object(options);
    const text = String(input.text || '').slice(0, 8_000);
    const matches = SIGNALS.filter((signal) => signal.pattern.test(text))
      .sort((left, right) => right.intensity - left.intensity);
    const ambient = ambientSevenEmotion(input.context);
    const primaryEmotion = matches[0]?.emotion || ambient?.primaryEmotion || 'neutral';
    const secondaryEmotion = matches.find((item) => item.emotion !== primaryEmotion)?.emotion
      || ambient?.secondaryEmotion
      || (primaryEmotion === 'sorrow' || primaryEmotion === 'fear' ? 'love' : '');
    const bucket = timeOfDay(input.now);
    const intensity = matches[0]?.intensity ?? ambient?.intensity ?? 0.35;
    const defaults = delivery(primaryEmotion, secondaryEmotion, intensity);
    const quietAutomatic = bucket === 'late-night' && (input.proactive === true || input.automatic === true);
    return normalize({
      primaryEmotion,
      secondaryEmotion,
      intensity,
      confidence: matches.length ? 0.86 : ambient ? ambient.confidence : 0.35,
      speechRate: defaults.speechRate - (quietAutomatic ? 4 : 0),
      loudnessRate: defaults.loudnessRate - (quietAutomatic ? 5 : 0),
      source: 'client-fallback',
      timeOfDay: bucket,
      turnId: input.turnId
    }, {
      now: input.now,
      turnId: input.turnId,
      proactive: input.proactive === true,
      automatic: input.automatic === true
    });
  }

  function emotionDisposition(value = {}) {
    const plan = normalize(value, {
      source: object(value).source,
      timeOfDay: object(value).timeOfDay,
      turnId: object(value).turnId,
      proactive: object(value).proactive === true,
      automatic: object(value).automatic === true
    });
    const score = rounded(plan.confidence * plan.intensity);
    const evidencePercent = Math.round(score * 100);
    const affective = AFFECTIVE_EMOTIONS.has(plan.primaryEmotion);
    const stage = !affective
      || plan.confidence < EMOTION_STAGE_CONFIDENCE.subtle
      || evidencePercent < EMOTION_STAGE_PERCENT.subtle
      ? 'dormant'
      : plan.confidence >= EMOTION_STAGE_CONFIDENCE.strong
        && evidencePercent >= EMOTION_STAGE_PERCENT.strong
        ? 'strong'
        : plan.confidence >= EMOTION_STAGE_CONFIDENCE.direct
          && evidencePercent >= EMOTION_STAGE_PERCENT.direct
          ? 'direct'
          : 'subtle';
    const active = stage !== 'dormant';
    const voiceActive = active;
    const voiceWeight = EMOTION_STAGE_WEIGHT[stage];
    const stageText = stage === 'dormant'
      ? '保持中性表达，不主动渲染情绪'
      : stage === 'subtle'
        ? '轻微地'
        : stage === 'direct'
          ? '清楚地'
          : '强烈但仍克制地';
    const textCue = active
      ? `${stageText}${EMOTION_TEXT_STEMS[plan.primaryEmotion]}`
      : stageText;
    return Object.freeze({
      active,
      voiceActive,
      emotion: active ? plan.primaryEmotion : 'neutral',
      stage,
      level: stage,
      score,
      evidencePercent,
      voiceWeight,
      textCue
    });
  }

  function negativeDisposition(value = {}) {
    const plan = normalize(value, {
      source: object(value).source,
      timeOfDay: object(value).timeOfDay,
      turnId: object(value).turnId,
      proactive: object(value).proactive === true,
      automatic: object(value).automatic === true
    });
    const gate = emotionDisposition(plan);
    const active = NEGATIVE_EMOTIONS.has(plan.primaryEmotion) && gate.active;
    const voiceActive = active && gate.voiceActive;
    const profile = active ? NEGATIVE_DISPOSITIONS[plan.primaryEmotion] : null;
    return Object.freeze({
      active,
      voiceActive,
      emotion: active ? plan.primaryEmotion : 'neutral',
      tone: profile?.tone || 'neutral',
      level: active ? gate.stage : 'dormant',
      score: gate.score,
      traits: Object.freeze(profile ? [...profile.traits] : []),
      promptCue: profile ? `${gate.textCue}；${profile.promptCue}` : '',
      speech: Object.freeze({
        speechRate: voiceActive ? Math.round(plan.speechRate * gate.voiceWeight) : 0,
        loudnessRate: voiceActive ? Math.round(plan.loudnessRate * gate.voiceWeight) : 0
      }),
      insultAllowed: false,
      demeaningAllowed: false
    });
  }

  /** Maps the canonical plan only to fields the selected provider supports. */
  function ttsOverrides(value, providerValue) {
    const plan = normalize(value, {
      source: object(value).source,
      timeOfDay: object(value).timeOfDay,
      turnId: object(value).turnId,
      proactive: object(value).proactive === true,
      automatic: object(value).automatic === true
    });
    const provider = String(providerValue || '').trim().toLowerCase();
    const disposition = emotionDisposition(plan);
    const suppressedVoice = AFFECTIVE_EMOTIONS.has(plan.primaryEmotion) && !disposition.voiceActive;
    if (provider === 'volcengine-doubao-tts-v3') {
      if (suppressedVoice) {
        return Object.freeze({ emotion: '', emotionScale: 1, speechRate: 0, loudnessRate: 0 });
      }
      return Object.freeze({
        emotion: DOUBAO_EMOTIONS[plan.primaryEmotion],
        emotionScale: 1 + Math.round(clamp(plan.intensity * 4, 0, 4) * disposition.voiceWeight),
        speechRate: Math.round(plan.speechRate * disposition.voiceWeight),
        loudnessRate: Math.round(plan.loudnessRate * disposition.voiceWeight)
      });
    }
    if (provider === 'openai' || provider === 'openai-tts') {
      if (suppressedVoice) return Object.freeze({ speed: 1 });
      return Object.freeze({ speed: rounded(clamp(1 + (plan.speechRate * disposition.voiceWeight) / 100, 0.25, 4)) });
    }
    return EMPTY;
  }

  global.FeMonsterPetAffectPlan = Object.freeze({ normalize, infer, emotionDisposition, negativeDisposition, ttsOverrides });
})(window);
