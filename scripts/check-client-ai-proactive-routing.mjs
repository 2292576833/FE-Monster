import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'web', 'pet-assistant.js'), 'utf8');
const start = source.indexOf('async function handlePetProactiveMessage');
const end = source.indexOf('function restoreMessages', start);
assert.ok(start >= 0 && end > start, 'proactive routing function is not inspectable');
const proactiveSource = source.slice(start, end);

function scenario({ failLocal = false, controlAttempted = false } = {}) {
  const localCalls = [];
  const serverCalls = [];
  const ttsCalls = [];
  const bubbles = [];
  const discarded = [];
  const states = [];
  let ensureSessionCalls = 0;
  let persisted = 0;
  const pendingMessages = new Map();
  const pet = {
    proactiveRequestPending: false,
    liveConversationActive: false,
    voiceActive: false,
    muted: false,
    messages: [{ role: 'assistant', text: '较早的陪伴回复' }],
    sessionId: '',
    requestId: '',
    proactiveRequestIds: new Set(),
    assistantMessages: pendingMessages,
  };
  const sandbox = {
    Date,
    Math,
    Object,
    Set,
    console,
    pet,
    boundedString: (value, maximum, fallback = '') => String(value ?? fallback).slice(0, maximum).trim(),
    clientAiServiceActive: () => true,
    newPetChatRequestId: () => 'local-proactive-turn-1',
    requestCustomAiReply: async (message, requestId, options = {}) => {
      localCalls.push({ message, requestId, options });
      if (failLocal) {
        if (controlAttempted && options.commandExecutionState) {
          options.commandExecutionState.controlAttempted = true;
        }
        const error = new Error('local provider unavailable');
        throw error;
      }
      return '我在，先给你放点适合现在的音乐。';
    },
    playConfiguredReplyTts: async (text, requestId) => {
      ttsCalls.push({ text, requestId });
      return true;
    },
    ensureSession: async () => {
      ensureSessionCalls += 1;
      return 'server-session-1';
    },
    requestPetChat: async (message, sessionId, options = {}) => {
      serverCalls.push({ message, sessionId, options });
      return { sessionId, requestId: options.requestId || 'server-proactive-turn-1' };
    },
    assistantMessageFor: (requestId) => {
      const pending = {
        paragraph: { textContent: '' },
        article: { classList: { add() {}, remove() {} }, remove() {} },
      };
      pendingMessages.set(requestId, pending);
      return pending;
    },
    discardCancelledAssistantReply: (requestId) => {
      discarded.push(requestId);
      pendingMessages.delete(requestId);
    },
    applyServerConversationEmotion() {},
    persistState: () => { persisted += 1; },
    showProactiveBubble: (text) => { bubbles.push(text); return true; },
    setPetState: (state, message = '') => { states.push({ state, message }); },
    scheduleIdle() {},
    clientAiSafeFailureMessage: () => '本地模型暂时不可用',
    abortClientAiRequest() {},
    window: {
      FeMonsterCompanionCareBridge: {
        proactiveContext: async () => ({ volumeHabitEvidenceCount: 5 }),
      },
    },
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(proactiveSource, context, {
    filename: 'web/pet-assistant.js#client-ai-proactive-routing',
  });
  return {
    run: () => sandbox.handlePetProactiveMessage({
      detail: {
        type: 'late-night',
        source: 'playback',
        createdAt: 1_786_900_000_000,
        variationKey: '2026-08-17:23:0:1',
        playback: { playing: false, volume: 42 },
        emotion: { sevenEmotions: { primary: 'sorrow', secondary: 'love', intensity: 0.72 } },
      },
    }),
    localCalls,
    serverCalls,
    ttsCalls,
    bubbles,
    discarded,
    states,
    get ensureSessionCalls() { return ensureSessionCalls; },
    get persisted() { return persisted; },
  };
}

const localSuccess = scenario();
await localSuccess.run();
assert.equal(localSuccess.localCalls.length, 1,
  'a proactive event ignored the currently selected local model source');
assert.equal(localSuccess.serverCalls.length, 0,
  'a successful local proactive turn also called the server model');
assert.equal(localSuccess.ensureSessionCalls, 0,
  'a successful local proactive turn unnecessarily created a server session');
assert.equal(localSuccess.localCalls[0].options.proactive, true);
assert.equal(localSuccess.localCalls[0].options.automatic, true);
assert.equal(localSuccess.localCalls[0].options.proactiveContext.type, 'late-night');
assert.equal(localSuccess.localCalls[0].options.proactiveContext.volumeHabitEvidenceCount, 5);
assert.equal(localSuccess.ttsCalls[0]?.requestId, localSuccess.localCalls[0].requestId,
  'local proactive text escaped to a different TTS source/request');
assert.equal(localSuccess.bubbles.length, 1, 'local proactive reply was not surfaced as a pet bubble');

const preCommandFailure = scenario({ failLocal: true });
await preCommandFailure.run();
assert.equal(preCommandFailure.localCalls.length, 1);
assert.equal(preCommandFailure.serverCalls.length, 1,
  'a local provider failure before command execution did not fall back to the server once');
assert.equal(preCommandFailure.ensureSessionCalls, 1);
assert.equal(preCommandFailure.discarded[0], 'local-proactive-turn-1',
  'local pending UI survived after the server fallback took ownership');

const postCommandFailure = scenario({ failLocal: true, controlAttempted: true });
await postCommandFailure.run();
assert.equal(postCommandFailure.localCalls.length, 1);
assert.equal(postCommandFailure.serverCalls.length, 0,
  'server fallback could execute a proactive command twice after local control began');
assert.equal(postCommandFailure.ensureSessionCalls, 0);
assert.match(postCommandFailure.states.at(-1)?.message || '', /本地模型/,
  'a post-command local failure was neither safely stopped nor explained');

console.log(JSON.stringify({
  ok: true,
  sourceConsistentLocalProactive: true,
  preCommandServerFallback: true,
  noDoubleExecutionAfterControl: true,
  localTtsCoupled: true,
}, null, 2));
