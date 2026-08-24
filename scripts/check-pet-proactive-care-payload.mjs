import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/pet-assistant.js', import.meta.url), 'utf8');

function topLevelFunction(name) {
  const markers = [`function ${name}(`, `async function ${name}(`];
  const starts = markers.map((marker) => source.indexOf(marker)).filter((index) => index >= 0);
  assert.ok(starts.length, `pet-assistant.js must define ${name}()`);
  const start = Math.min(...starts);
  const nextFunction = /\n\s{2}(?:async )?function [A-Za-z0-9_$]+\s*\(/g;
  nextFunction.lastIndex = start + 1;
  const next = nextFunction.exec(source);
  return source.slice(start, next ? next.index + 1 : source.length);
}

const outgoing = [];
const bridgeCalls = [];
const pet = {
  proactiveRequestPending: false,
  liveConversationActive: false,
  voiceActive: false,
  messages: [{ role: 'assistant', text: 'previous assistant line' }],
  sessionId: 'session-care-fixture',
  requestId: '',
  muted: true,
  voiceId: 'fixture-voice',
  cancelledLiveRequestIds: new Set(),
  proactiveRequestIds: new Set(),
  assistantMessages: new Map()
};
const context = vm.createContext({
  window: {
    FeMonsterCompanionCareBridge: Object.freeze({
      async proactiveContext(detail) {
        bridgeCalls.push(detail);
        return { volumeHabitEvidenceCount: 7 };
      }
    })
  },
  pet,
  boundedString(value, limit, fallback = '') {
    const text = String(value ?? '').trim();
    return (text || fallback).slice(0, limit);
  },
  clientAiServiceActive: () => false,
  ensureSession: async () => 'session-care-fixture',
  newPetChatRequestId: () => 'request-care-fixture',
  apiPath: (path) => path,
  retryPetChatRequest: (operation) => operation(),
  async requestPetMutation(path, payload, options) {
    outgoing.push({ path, payload: JSON.parse(JSON.stringify(payload)), options });
    return { ok: true, sessionId: 'session-care-fixture', requestId: 'request-care-fixture' };
  },
  assistantMessageFor() {},
  applyServerConversationEmotion() {},
  persistState() {}
});

vm.runInContext([
  topLevelFunction('requestPetChat'),
  topLevelFunction('handlePetProactiveMessage')
].join('\n'), context);

const detail = {
  type: 'late-night',
  source: 'playback',
  createdAt: Date.now(),
  variationKey: 'care-fixture:1',
  playback: { playing: true, song: { id: 'song-1', name: 'Fixture song' } },
  emotion: { mood: 3, energy: 2 },
  volumeHabitEvidenceCount: 99
};
await context.handlePetProactiveMessage({ detail });

assert.equal(bridgeCalls.length, 1, 'the proactive handler did not request locally trusted care context');
assert.equal(bridgeCalls[0], detail, 'the care bridge did not receive the original trigger detail');
assert.equal(outgoing.length, 1, 'the proactive handler did not issue exactly one chat mutation');
assert.equal(outgoing[0].path, '/api/community/pet/chat');
assert.equal(outgoing[0].payload.text, '', 'proactive generation must not impersonate typed user text');
assert.equal(outgoing[0].payload.proactiveContext.type, 'late-night');
assert.equal(
  outgoing[0].payload.proactiveContext.volumeHabitEvidenceCount,
  7,
  'the outgoing proactive payload trusted event data or omitted local volume habit evidence'
);

console.log(JSON.stringify({
  ok: true,
  volumeHabitEvidenceCount: outgoing[0].payload.proactiveContext.volumeHabitEvidenceCount
}, null, 2));
