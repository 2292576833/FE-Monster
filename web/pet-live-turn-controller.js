(function initializePetLiveTurnController(globalObject, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (globalObject) globalObject.FeMonsterPetLiveTurnController = api;
})(typeof globalThis === 'object' ? globalThis : this, function createPetLiveTurnController() {
  'use strict';

  // Inspired by the local turn-taking architecture in katipally/openlive
  // (https://github.com/katipally/openlive, MIT). This is a dependency-free
  // FE Monster rewrite: it keeps the existing Chinese STT/TTS pipeline and
  // only adapts the silence endpoint from already available VAD/transcript data.
  const DEFAULT_ENDPOINTS = Object.freeze({
    minimumMs: 520,
    longSpeechMs: 560,
    clearSpeechMs: 600,
    baseMs: 650,
    shortSpeechMs: 760,
    softBoundaryMs: 820,
    incompletePhraseMs: 900,
    conjunctionMs: 940,
    maximumMs: 980
  });

  const HARD_BOUNDARY_PATTERN = /[\u3002\uff01\uff1f!?\u2026]\s*$/u;
  const SOFT_BOUNDARY_PATTERN = /[\uff0c,\u3001\uff1b;\uff1a:]\s*$/u;
  const TRAILING_CONJUNCTION_PATTERN = /(?:\u7136\u540e|\u4f46\u662f|\u4e0d\u8fc7|\u56e0\u4e3a|\u6240\u4ee5|\u5982\u679c|\u800c\u4e14|\u53e6\u5916|\u8fd8\u6709|\u4ee5\u53ca|\u6216\u8005|\u6bd4\u5982|\u4f8b\u5982)\s*$/iu;
  const TRAILING_INCOMPLETE_PATTERN = /(?:\u5e2e\u6211|\u8bf7|\u628a|\u8ba9|\u7ed9|\u8ddf|\u548c|\u518d|\u60f3\u8981|\u64ad\u653e|\u6253\u5f00|\u5207\u5230|\u8c03\u5230|\u8bbe\u7f6e\u6210|\u6362\u6210)\s*$/iu;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Number(value) || 0));
  }

  function normalizeTranscript(value) {
    return String(value || '').replace(/\s+/gu, ' ').trim().slice(-240);
  }

  function resolveEndpointSilenceMs(input = {}, endpointOverrides = {}) {
    const endpoint = { ...DEFAULT_ENDPOINTS, ...endpointOverrides };
    const speechMs = clamp(input.speechMs, 0, 60_000);
    const transcript = normalizeTranscript(input.transcript);

    if (transcript && HARD_BOUNDARY_PATTERN.test(transcript) && speechMs >= 350) {
      return endpoint.minimumMs;
    }
    if (transcript && TRAILING_CONJUNCTION_PATTERN.test(transcript)) {
      return Math.min(endpoint.maximumMs, endpoint.conjunctionMs);
    }
    if (transcript && TRAILING_INCOMPLETE_PATTERN.test(transcript)) {
      return Math.min(endpoint.maximumMs, endpoint.incompletePhraseMs);
    }
    if (transcript && SOFT_BOUNDARY_PATTERN.test(transcript)) {
      return Math.min(endpoint.maximumMs, endpoint.softBoundaryMs);
    }
    if (speechMs < 450) return endpoint.shortSpeechMs;
    if (input.transcriptFinal === true && transcript) {
      return Math.max(endpoint.minimumMs, 540);
    }
    if (speechMs >= 6_000) return endpoint.longSpeechMs;
    if (speechMs >= 2_400 || transcript.length >= 14) return endpoint.clearSpeechMs;
    if (transcript && transcript.length <= 3) return Math.max(endpoint.baseMs, 700);
    return endpoint.baseMs;
  }

  return Object.freeze({
    DEFAULT_ENDPOINTS,
    resolveEndpointSilenceMs
  });
});
