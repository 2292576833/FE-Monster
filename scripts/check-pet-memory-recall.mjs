import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(root, 'web', 'pet-memory-recall.js');
assert.ok(fs.existsSync(sourcePath), 'web/pet-memory-recall.js is missing');

const window = {};
window.window = window;
vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), { window, Object, Set, Map, Date, Math }, {
  filename: 'web/pet-memory-recall.js'
});

const recall = window.FeMonsterPetMemoryRecall;
assert.ok(recall && typeof recall.rank === 'function', 'memory recall rank API is unavailable');

const record = (eventId, occurredAt, text, stream = 'chat') => Object.freeze({
  eventId,
  occurredAt,
  stream,
  type: stream === 'knowledge' ? 'user.fact' : stream === 'operation' ? 'command.succeeded' : 'chat.message',
  payload: stream === 'knowledge'
    ? Object.freeze({ title: '音乐偏好', value: text, entityId: eventId })
    : stream === 'operation'
      ? Object.freeze({ title: text, action: 'apply', status: 'succeeded' })
      : Object.freeze({ role: 'user', text, source: 'pet-text' })
});

const newerUnrelated = record('newer-unrelated', '2026-08-31T12:00:00.000Z', '今天的天气很安静');
const olderRockPreference = record('older-rock', '2026-08-01T12:00:00.000Z', '我最喜欢后摇和氛围摇滚');
const ranked = recall.rank({
  message: '我以前说过喜欢哪种摇滚？',
  chats: [newerUnrelated, olderRockPreference],
  operations: [],
  knowledge: [],
  limits: { chats: 1, operations: 0, knowledge: 0 }
});
assert.equal(ranked.chats[0].eventId, 'older-rock', 'relevant older memory did not outrank unrelated recency');

const fallback = recall.rank({
  message: '完全没有重合的新问题',
  chats: [olderRockPreference, newerUnrelated],
  operations: [],
  knowledge: [],
  limits: { chats: 2, operations: 0, knowledge: 0 }
});
assert.deepEqual(Array.from(fallback.chats, (entry) => entry.eventId), ['newer-unrelated', 'older-rock'],
  'no-match fallback was not ordered by recency');

const knowledgeMatch = record('night-music', '2026-07-01T00:00:00.000Z', '深夜更喜欢低能量女声', 'knowledge');
const ordinaryKnowledgeMatch = record(
  'ordinary-knowledge',
  '2026-08-29T00:00:00.000Z',
  '普通知识笔记：后摇适合深夜播放',
  'knowledge'
);
const operationMatch = record('night-preset', '2026-08-30T00:00:00.000Z', '应用深夜场景', 'operation');
const multiStream = recall.rank({
  message: '深夜后摇音乐怎么设置？',
  chats: [],
  operations: [operationMatch],
  knowledge: [knowledgeMatch, ordinaryKnowledgeMatch],
  limits: { chats: 0, operations: 1, knowledge: 1 }
});
assert.equal(multiStream.operations[0].eventId, 'night-preset');
assert.equal(multiStream.knowledge[0].eventId, 'ordinary-knowledge',
  'ordinary knowledge no longer uses lexical relevance ranking');
assert.equal(Object.isFrozen(multiStream), true, 'rank result is mutable');
assert.equal(Object.isFrozen(multiStream.knowledge), true, 'rank arrays are mutable');

const latin = recall.rank({
  message: 'PLAY MY SYNTHWAVE MIX',
  chats: [record('latin', '2026-01-01T00:00:00.000Z', 'My Synthwave mix is called Neon Drive')],
  operations: [],
  knowledge: [],
  limits: { chats: 1, operations: 0, knowledge: 0 }
});
assert.equal(latin.chats[0].eventId, 'latin', 'Latin matching is not case-insensitive');

console.log(JSON.stringify({ ok: true, relevantOlderMemoryWins: true, recencyFallback: true }, null, 2));
