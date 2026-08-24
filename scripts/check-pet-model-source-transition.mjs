import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'web', 'pet-assistant.js'), 'utf8');

function topLevelFunction(name) {
  const markers = [`function ${name}(`, `async function ${name}(`];
  const start = markers
    .map((marker) => source.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  assert.notEqual(start, undefined, `pet-assistant.js must define ${name}()`);
  const nextFunction = /\n\s{2}(?:async )?function [A-Za-z0-9_$]+\s*\(/g;
  nextFunction.lastIndex = start + 1;
  const next = nextFunction.exec(source);
  return source.slice(start, next ? next.index + 1 : source.length);
}

const sandbox = vm.createContext({
  AbortController,
  HISTORY_LIMIT: 48,
  PET_VISIBLE_CONTEXT_LIMIT: 12,
  PET_MODEL_SOURCE_LOCAL: 'local-custom',
  PET_MODEL_SOURCE_SERVER: 'server-community',
  window: {
    FeMonsterPetAffectPlan: { normalize: (value) => value },
    FeMonsterClientAiService: null,
  },
  boundedString(value, maximum, fallback = '') {
    const text = String(value ?? fallback).trim();
    return text.slice(0, maximum);
  },
});

vm.runInContext([
  topLevelFunction('normalizeStoredMessages'),
  topLevelFunction('mergeServerHistoryMessages'),
  topLevelFunction('recentVisibleConversation'),
  topLevelFunction('snapshotPetModelSource'),
  topLevelFunction('clientAiToolReceiptKey'),
  topLevelFunction('executeClientAiToolOnce'),
  topLevelFunction('clientAiAttemptRequestId'),
  topLevelFunction('clientAiRetryableBeforeOutput'),
  topLevelFunction('requestClientAiChatRound'),
].join('\n'), sandbox);

let snapshot = {
  modelMode: 'custom',
  model: { ready: true, provider: 'openai-compatible', model: 'fixture-model' },
  ttsMode: 'custom',
  tts: { ready: true, provider: 'volcengine-doubao-tts-v3' },
};
sandbox.window.FeMonsterClientAiService = {
  load: () => snapshot,
  isCustomModel: (value) => value?.modelMode === 'custom' && value?.model?.ready === true,
};
const localTurn = sandbox.snapshotPetModelSource();
snapshot = {
  modelMode: 'server',
  model: { ready: true, provider: 'server-community' },
  ttsMode: 'server',
  tts: { ready: true, provider: 'server-community' },
};
assert.equal(localTurn.source, 'local-custom', 'a local turn did not retain its source snapshot');
assert.equal(localTurn.config.model.provider, 'openai-compatible',
  'a mid-turn settings change mutated the captured local model configuration');
assert.equal(sandbox.snapshotPetModelSource().source, 'server-community',
  'the next turn did not observe the newly selected server source');
const chatConfigs = [];
await sandbox.requestClientAiChatRound({
  load: () => snapshot,
  async chatStream(config) {
    chatConfigs.push(config);
    return { text: 'ok', toolCalls: [] };
  },
}, [], {
  requestId: 'turn-snapshot:r1',
  signal: new AbortController().signal,
  serviceConfig: localTurn.config,
});
assert.equal(chatConfigs[0].model.provider, 'openai-compatible',
  'a later model round re-read the newly selected server config instead of the turn snapshot');

const current = [
  { role: 'user', text: '服务器旧问题', source: 'server-community' },
  { role: 'user', text: '本地独有问题', source: 'local-custom' },
  { role: 'assistant', text: '本地独有回答', source: 'local-custom' },
  { role: 'user', text: '切回服务器后的问题', source: 'server-community' },
];
const remote = [
  { role: 'user', text: '服务器旧问题', source: 'server-community' },
  { role: 'assistant', text: '服务器旧回答', source: 'server-community' },
  { role: 'user', text: '切回服务器后的问题', source: 'server-community' },
  { role: 'assistant', text: '切回服务器后的回答', source: 'server-community' },
];
const merged = sandbox.mergeServerHistoryMessages(current, remote);
assert.deepEqual(
  JSON.parse(JSON.stringify(merged.map(({ role, text, source: messageSource }) => ({ role, text, source: messageSource })))),
  [
    { role: 'user', text: '服务器旧问题', source: 'server-community' },
    { role: 'assistant', text: '服务器旧回答', source: 'server-community' },
    { role: 'user', text: '本地独有问题', source: 'local-custom' },
    { role: 'assistant', text: '本地独有回答', source: 'local-custom' },
    { role: 'user', text: '切回服务器后的问题', source: 'server-community' },
    { role: 'assistant', text: '切回服务器后的回答', source: 'server-community' },
  ],
  'server history reconciliation overwrote, duplicated, or reordered local-only visible messages'
);
const noAnchorMerge = sandbox.mergeServerHistoryMessages([
  { role: 'user', text: '只有本地知道', source: 'local-custom' },
], [
  { role: 'assistant', text: '服务器权威历史', source: 'server-community' },
]);
assert.deepEqual(
  JSON.parse(JSON.stringify(noAnchorMerge.map(({ text, source: messageSource }) => ({ text, source: messageSource })))),
  [
    { text: '服务器权威历史', source: 'server-community' },
    { text: '只有本地知道', source: 'local-custom' },
  ],
  'an authoritative server refresh without anchors discarded the local-only continuation'
);

const localOnly = Array.from({ length: 60 }, (_, index) => ({
  role: index % 2 ? 'assistant' : 'user',
  text: `本地消息 ${index}`,
  source: 'local-custom',
}));
const bounded = sandbox.mergeServerHistoryMessages(localOnly, []);
assert.equal(bounded.length, 48, 'visible history merge exceeded the persisted history bound');
const recent = sandbox.recentVisibleConversation(bounded);
assert.equal(recent.length, 12, 'source-switch context exceeded its prompt relay bound');
assert.equal(recent[0].text, '本地消息 48');
assert.equal(recent.at(-1).text, '本地消息 59');
assert.ok(recent.every((message) => message.source === 'local-custom'));
const redacted = sandbox.recentVisibleConversation([
  { role: 'user', text: '我的 key 是 sk-abcdefghijklmnop', source: 'local-custom' },
]);
assert.equal(redacted[0].text, '[redacted]', 'source-switch prompt relay leaked an obvious credential');

let toolExecutions = 0;
const receipts = new Map();
const call = { id: 'call-repeat-1', name: 'control_app', arguments: '{"command":"playback.pause"}' };
const firstReceipt = await sandbox.executeClientAiToolOnce(receipts, call, async () => {
  toolExecutions += 1;
  return { ok: true, commandReceipt: { operationId: 'turn-1:call-repeat-1' } };
});
const replayedReceipt = await sandbox.executeClientAiToolOnce(receipts, call, async () => {
  toolExecutions += 1;
  return { ok: true, commandReceipt: { operationId: 'wrong-second-execution' } };
});
assert.equal(toolExecutions, 1, 'a repeated tool call executed its side effect twice');
assert.equal(firstReceipt.first, true);
assert.equal(replayedReceipt.first, false);
assert.deepEqual(
  JSON.parse(JSON.stringify(replayedReceipt.result)),
  JSON.parse(JSON.stringify(firstReceipt.result)),
  'a repeated tool call did not preserve its single authoritative receipt'
);

const sendText = topLevelFunction('sendText');
assert.match(sendText, /snapshotPetModelSource\(\)/,
  'text turns still read the model source more than once instead of snapshotting it');
assert.match(sendText, /turnSource\.source\s*===\s*'local-custom'/,
  'the text route does not branch on the captured turn source');
assert.match(sendText, /requestCustomAiReply\([\s\S]*?turnSource/,
  'the captured local source is not carried into model generation');
assert.match(sendText, /playConfiguredReplyTts\([\s\S]*?turnSource/,
  'the captured local source is not carried into TTS routing');

const requestCustomAiReply = topLevelFunction('requestCustomAiReply');
assert.match(requestCustomAiReply, /executeClientAiToolOnce/,
  'local tool execution has no per-turn exactly-once receipt ledger');
assert.match(requestCustomAiReply, /toolReceipts\.has\(key\)[\s\S]*?toolCallKeys\.has\(key\)/,
  'a repeated tool-call id can still append a second protocol receipt');
assert.match(requestCustomAiReply, /commandExecutionState\.controlAttempted\s*=\s*true/,
  'control_app attempts are not recorded before execution begins');

const proactive = topLevelFunction('handlePetProactiveMessage');
assert.match(proactive, /if\s*\(commandExecutionState\.controlAttempted\)/,
  'a failed local control attempt can still fall back and execute again on the server');

const customTtsRoute = source.slice(
  source.indexOf('async function playConfiguredReplyTts('),
  source.indexOf('async function sendText(')
);
assert.doesNotMatch(customTtsRoute, /playServerReplyTts\s*\(|\/api\/community\/pet\/narrate|playServerAudio\s*\(/,
  'a custom-model reply can still escape to server narration/audio');

const serverChat = topLevelFunction('requestPetChat');
assert.doesNotMatch(serverChat, /client-ai\/tts|playClientAiTts|playConfiguredReplyTts/,
  'a server-model turn can still escape to client custom TTS');

console.log(JSON.stringify({
  ok: true,
  perTurnSourceSnapshot: true,
  nextTurnSwitch: true,
  boundedVisibleContinuity: true,
  localHistoryPreserved: true,
  exactlyOnceToolReceipt: true,
  ttsSourceIsolation: true,
}, null, 2));
