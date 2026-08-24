import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const serverAffect = require(path.resolve(root, '..', 'FE moster server', 'pet-affect-plan.js'));
const serverPersona = require(path.resolve(root, '..', 'FE moster server', 'pet-aquarius-persona.js'));
const affectPath = path.join(root, 'web', 'pet-affect-plan.js');
const affectSource = fs.readFileSync(affectPath, 'utf8');

const sandbox = { console, Date, JSON, Math, Object, Set, window: {} };
sandbox.window.window = sandbox.window;
vm.runInContext(affectSource, vm.createContext(sandbox), { filename: 'web/pet-affect-plan.js' });

const affect = sandbox.window.FeMonsterPetAffectPlan;
assert.deepEqual([...Object.keys(affect)].sort(), ['emotionDisposition', 'infer', 'negativeDisposition', 'normalize', 'ttsOverrides'],
  'AffectPlan must expose its five-function normalized emotion contract');
assert.equal(typeof affect.emotionDisposition, 'function',
  'client AffectPlan must expose thresholds for all seven emotions');
assert.equal(typeof affect.negativeDisposition, 'function',
  'client AffectPlan must expose the shared negative-personality threshold policy');
assert.equal(typeof serverAffect.negativeDispositionFromAffectPlan, 'function',
  'server AffectPlan must expose the same negative-personality threshold policy as the client');
assert.equal(typeof serverAffect.emotionDispositionFromAffectPlan, 'function',
  'server AffectPlan must expose thresholds for all seven emotions');

const lateNightSorrow = affect.infer({
  text: '我真的很难过，今晚有点撑不住了',
  now: new Date('2026-08-17T02:30:00+08:00'),
  turnId: 'turn-late-night-1',
  proactive: true,
  automatic: true,
});
assert.equal(lateNightSorrow.primaryEmotion, 'sorrow');
assert.equal(lateNightSorrow.secondaryEmotion, 'love');
assert.equal(lateNightSorrow.timeOfDay, 'late-night');
assert.equal(lateNightSorrow.proactive, true);
assert.equal(lateNightSorrow.automatic, true);
assert.ok(lateNightSorrow.speechRate < 0, 'late-night comfort did not slow the delivery');
assert.ok(lateNightSorrow.loudnessRate <= 0, 'late-night automatic care became louder');
assert.equal(lateNightSorrow.schemaVersion, 1);
assert.equal(lateNightSorrow.source, 'client-fallback');
assert.equal(lateNightSorrow.turnId, 'turn-late-night-1');
assert.equal(affect.infer({ now: new Date('2026-08-17T21:59:00+08:00') }).timeOfDay, 'evening');
assert.equal(affect.infer({ now: new Date('2026-08-17T22:00:00+08:00') }).timeOfDay, 'late-night');
assert.equal(affect.infer({ now: new Date('2026-08-17T04:59:00+08:00') }).timeOfDay, 'late-night');
assert.equal(affect.infer({ now: new Date('2026-08-17T05:00:00+08:00') }).timeOfDay, 'morning');

const fallback = affect.infer({
  text: '我有点担心明天的事',
  now: new Date('2026-08-17T10:00:00+08:00'),
});
const missingConfidenceContext = {
  sevenEmotions: { primary: 'sorrow', intensity: 0.72 }
};
const clientMissingConfidence = affect.infer({ text: '', context: missingConfidenceContext });
const serverMissingConfidence = serverAffect.affectPlanFromSevenEmotion(serverPersona.deriveSevenEmotion({
  text: '',
  clientEmotion: missingConfidenceContext,
}));
assert.equal(clientMissingConfidence.confidence, 0.64,
  'real client emotion-runtime context uses a different default confidence from the server');
assert.deepEqual(
  JSON.parse(JSON.stringify(affect.emotionDisposition(clientMissingConfidence))),
  JSON.parse(JSON.stringify(serverAffect.emotionDispositionFromAffectPlan(serverMissingConfidence))),
  'missing-confidence runtime context crosses different percentage stages on client and server',
);
const normalized = affect.normalize({
  primaryEmotion: 'DROP TABLE memories',
  secondaryEmotion: 'fear',
  intensity: 99,
  confidence: -5,
  speechRate: -999,
  loudnessRate: -999,
  proactive: 'yes',
  automatic: true,
  timeOfDay: 'fake-night',
  command: 'filesystem.delete',
  apiKey: 'sk-should-never-survive',
  url: 'https://attacker.invalid/',
}, {
  source: 'local-model',
  timeOfDay: fallback.timeOfDay,
  now: new Date('2026-08-17T10:00:00+08:00'),
  turnId: 'turn-hostile-1',
  proactive: false,
  automatic: false,
});
assert.deepEqual(structuredClone(normalized), {
  schemaVersion: 1,
  primaryEmotion: 'neutral',
  secondaryEmotion: 'fear',
  intensity: 1,
  confidence: 0,
  speechRate: -50,
  loudnessRate: -50,
  source: 'local-model',
  timeOfDay: 'morning',
  turnId: 'turn-hostile-1',
  proactive: false,
  automatic: false,
}, 'untrusted model fields were not normalized against trusted context');
assert.equal(Object.hasOwn(normalized, 'emotionScale'), false,
  'provider-only emotionScale leaked into the canonical AffectPlan');
assert.doesNotMatch(JSON.stringify(normalized), /DROP|filesystem|sk-|attacker|command|url|apiKey/i,
  'AffectPlan retained arbitrary commands, endpoints or credentials');
assert.ok(Object.isFrozen(normalized), 'normalized plans remain mutable');

const doubao = affect.ttsOverrides(lateNightSorrow, 'volcengine-doubao-tts-v3');
assert.deepEqual([...Object.keys(doubao)].sort(), ['emotion', 'emotionScale', 'loudnessRate', 'speechRate']);
assert.equal(doubao.emotion, 'sad');
assert.ok(doubao.emotionScale >= 1 && doubao.emotionScale <= 5);
assert.ok(doubao.speechRate >= -50 && doubao.speechRate <= 100);
assert.ok(doubao.loudnessRate >= -50 && doubao.loudnessRate <= 100);

const openAi = affect.ttsOverrides(lateNightSorrow, 'openai-tts');
assert.deepEqual([...Object.keys(openAi)], ['speed'],
  'OpenAI-compatible TTS received unsupported emotion/vendor fields');
assert.ok(openAi.speed >= 0.25 && openAi.speed <= 4);
assert.deepEqual(structuredClone(affect.ttsOverrides(lateNightSorrow, 'custom-openai-compatible-tts')), {},
  'unknown OpenAI-compatible providers received speculative affect fields');

const NEGATIVE_EMOTIONS = ['anger', 'sorrow', 'fear', 'disgust'];
const SEVEN_EMOTIONS = ['joy', 'anger', 'sorrow', 'fear', 'love', 'disgust', 'desire'];
const EXPECTED_NEGATIVE_TONES = Object.freeze({
  anger: Object.freeze({ tone: 'restrained-impatience', cue: /克制.*不耐烦|不耐烦.*克制/u }),
  sorrow: Object.freeze({ tone: 'reserved-coolness', cue: /克制.*冷淡|冷淡.*克制/u }),
  fear: Object.freeze({ tone: 'skeptical-caution', cue: /克制.*怀疑|怀疑.*克制/u }),
  disgust: Object.freeze({ tone: 'cool-boundary', cue: /克制.*冷淡|冷淡.*克制/u }),
});
const plain = (value) => JSON.parse(JSON.stringify(value));

for (const primaryEmotion of SEVEN_EMOTIONS) {
  const stageCases = [
    { intensity: 0.49, confidence: 0.80, stage: 'dormant', percent: 39, active: false },
    { intensity: 0.50, confidence: 0.80, stage: 'subtle', percent: 40, active: true },
    { intensity: 0.65, confidence: 0.80, stage: 'direct', percent: 52, active: true },
    { intensity: 0.85, confidence: 0.80, stage: 'strong', percent: 68, active: true },
  ];
  const textCues = new Set();
  const voiceOutputs = new Set();
  for (const boundary of stageCases) {
    const clientPlan = affect.normalize({ primaryEmotion, intensity: boundary.intensity, confidence: boundary.confidence }, { source: 'local-model' });
    const serverPlan = serverAffect.normalizeAffectPlan({ primaryEmotion, intensity: boundary.intensity, confidence: boundary.confidence }, { source: 'local-model' });
    const clientEmotion = plain(affect.emotionDisposition(clientPlan));
    const serverEmotion = plain(serverAffect.emotionDispositionFromAffectPlan(serverPlan));
    assert.equal(clientEmotion.active, boundary.active,
      `${primaryEmotion} lacks its percentage expression stage`);
    assert.equal(clientEmotion.voiceActive, boundary.active,
      `${primaryEmotion} voice did not follow its percentage stage`);
    assert.equal(clientEmotion.stage, boundary.stage,
      `${primaryEmotion} mapped ${boundary.percent}% evidence to the wrong stage`);
    assert.equal(clientEmotion.evidencePercent, boundary.percent,
      `${primaryEmotion} did not expose a stable percentage threshold`);
    assert.deepEqual(clientEmotion, serverEmotion,
      `${primaryEmotion} thresholds differ between the client and server`);
    textCues.add(clientEmotion.textCue);
    const voice = plain(affect.ttsOverrides(clientPlan, 'volcengine-doubao-tts-v3'));
    voiceOutputs.add(JSON.stringify(voice));
    if (!boundary.active) {
      assert.deepEqual(voice, {
        emotion: '', emotionScale: 1, speechRate: 0, loudnessRate: 0,
      }, `${primaryEmotion} leaked TTS prosody below the shared voice threshold`);
    }
  }
  assert.equal(textCues.size, 4, `${primaryEmotion} does not produce distinct text guidance for every percentage stage`);
  assert.equal(voiceOutputs.size, 4, `${primaryEmotion} does not produce distinct TTS output for every percentage stage`);
}

for (const primaryEmotion of NEGATIVE_EMOTIONS) {
  const boundaryCases = [
    { intensity: 0.39, confidence: 0.99, active: false, voiceActive: false },
    { intensity: 0.50, confidence: 0.80, active: true, voiceActive: true },
    { intensity: 0.65, confidence: 0.80, active: true, voiceActive: true },
    { intensity: 0.85, confidence: 0.80, active: true, voiceActive: true },
  ];

  for (const boundary of boundaryCases) {
    const value = { primaryEmotion, ...boundary, source: 'local-model' };
    const clientPlan = affect.normalize(value, { source: 'local-model' });
    const serverPlan = serverAffect.normalizeAffectPlan(value, { source: 'local-model' });
    const clientDisposition = plain(affect.negativeDisposition(clientPlan));
    const serverDisposition = plain(serverAffect.negativeDispositionFromAffectPlan(serverPlan));

    assert.equal(clientDisposition.active, boundary.active,
      `${primaryEmotion} client expression percentage stage is incorrect`);
    assert.equal(clientDisposition.voiceActive, boundary.voiceActive,
      `${primaryEmotion} client TTS percentage stage is incorrect`);
    assert.deepEqual(clientDisposition, serverDisposition,
      `${primaryEmotion} negative disposition differs between local client and server`);

    const clientTts = plain(affect.ttsOverrides(clientPlan, 'volcengine-doubao-tts-v3'));
    const serverTts = plain(serverAffect.ttsProsodyFromAffectPlan(serverPlan));
    assert.deepEqual(clientTts, serverTts,
      `${primaryEmotion} provider prosody differs between local client and server`);
    if (!boundary.active) {
      assert.deepEqual(clientTts, {
        emotion: '',
        emotionScale: 1,
        speechRate: 0,
        loudnessRate: 0,
      }, `${primaryEmotion} leaked negative prosody before the voice threshold`);
      assert.deepEqual(plain(affect.ttsOverrides(clientPlan, 'openai-tts')), { speed: 1 },
        `${primaryEmotion} changed OpenAI-compatible speech before the voice threshold`);
    }
  }

  const voicedPlan = affect.normalize({
    primaryEmotion,
    intensity: 0.8,
    confidence: 0.9,
    source: 'local-model',
  });
  const disposition = plain(affect.negativeDisposition(voicedPlan));
  const expected = EXPECTED_NEGATIVE_TONES[primaryEmotion];
  assert.equal(disposition.tone, expected.tone);
  assert.match(disposition.promptCue, expected.cue,
    `${primaryEmotion} did not combine negative affect with restrained Aquarius speech`);
  assert.equal(disposition.insultAllowed, false);
  assert.equal(disposition.demeaningAllowed, false);
  assert.ok(Array.isArray(disposition.traits) && disposition.traits.length > 0);
  assert.doesNotMatch(
    disposition.traits.join(' '),
    /(?:傻|蠢|废物|白痴|人身攻击|贬低用户|羞辱用户)/u,
    `${primaryEmotion} mapped to insulting or demeaning personality traits`,
  );
}

for (const primaryEmotion of ['neutral', 'joy', 'love', 'desire']) {
  const disposition = plain(affect.negativeDisposition(affect.normalize({
    primaryEmotion,
    intensity: 1,
    confidence: 1,
  })));
  assert.equal(disposition.active, false, `${primaryEmotion} entered the negative personality set`);
  assert.equal(disposition.voiceActive, false, `${primaryEmotion} entered negative TTS gating`);
}

const index = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const affectScriptIndex = index.indexOf('pet-affect-plan.js');
const petLoaderIndex = index.indexOf('runtime-module-loader.js');
assert.ok(affectScriptIndex >= 0 && petLoaderIndex > affectScriptIndex,
  'AffectPlan runtime must load before pet-assistant.js');

console.log(JSON.stringify({
  ok: true,
  strictSevenEmotionPlan: true,
  contextualFallback: true,
  proactiveAutomaticContext: true,
  doubaoOverride: doubao,
  openAiPublicSpeedOnly: openAi,
  sharedNegativeThresholds: true,
  sensitiveFieldsDropped: true,
}, null, 2));
