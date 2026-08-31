import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const policySource = readFileSync(path.join(root, 'web', 'pet-preference-policy.js'), 'utf8');
const source = readFileSync(path.join(root, 'web', 'pet-preference-memory.js'), 'utf8');
const recordsByProvider = new Map();
let appendCount = 0;

function records(provider) {
  if (!recordsByProvider.has(provider)) recordsByProvider.set(provider, []);
  return recordsByProvider.get(provider);
}

function seedV1(provider, value, occurredAt) {
  appendCount += 1;
  records(provider).push({
    eventId: `00000000-0000-4000-8000-${String(appendCount).padStart(12, '0')}`,
    stream: 'knowledge',
    type: 'user.fact',
    occurredAt,
    recordedAt: occurredAt,
    sourceSequence: appendCount,
    payload: {
      source: 'pet-preference-learning',
      entityId: 'pet.preference.music_like.legacy',
      title: '用户偏好·音乐喜好',
      value: JSON.stringify(value),
      occurredAt,
      sourceSequence: appendCount
    }
  });
}

const memoryClient = {
  failNextReceipt: false,
  suppressNext: false,
  async context(options = {}) {
    return {
      available: true,
      knowledge: records(String(options.provider || 'netease')).slice().reverse()
    };
  },
  append(input) {
    appendCount += 1;
    const eventId = `00000000-0000-4000-8000-${String(appendCount).padStart(12, '0')}`;
    const occurredAt = input.occurredAt || new Date().toISOString();
    if (this.suppressNext) {
      this.suppressNext = false;
      return { eventId, accepted: false, suppressed: true, receipt: Promise.resolve({ suppressed: true }) };
    }
    if (this.failNextReceipt) {
      this.failNextReceipt = false;
      return {
        eventId,
        accepted: true,
        receipt: Promise.resolve({ accepted: false, code: 'LOCAL_MEMORY_RECEIPT_REJECTED' })
      };
    }
    records(String(input.provider || 'netease')).push({
      eventId,
      stream: input.stream,
      type: input.type,
      occurredAt,
      recordedAt: occurredAt,
      sourceSequence: appendCount,
      payload: { ...input.payload, occurredAt, sourceSequence: appendCount }
    });
    return {
      eventId,
      accepted: true,
      receipt: Promise.resolve({ accepted: true, recordedAt: occurredAt, sourceSequence: appendCount })
    };
  }
};

function loadRuntime() {
  const window = { FeLocalMemory: memoryClient };
  const sandbox = { Date, JSON, Map, Math, Object, Promise, Set, TextEncoder, console, window };
  window.window = window;
  vm.createContext(sandbox);
  vm.runInContext(policySource, sandbox, { filename: 'pet-preference-policy.js' });
  vm.runInContext(source, sandbox, { filename: 'pet-preference-memory.js' });
  return window.FeMonsterPetPreferenceMemory.create({ memoryClient });
}

seedV1('netease', {
  schemaVersion: 1,
  category: 'music_like',
  statement: '用户明确表示喜欢听：后摇',
  origin: 'explicit-chat',
  confidence: 1,
  evidence: 1
}, '2026-08-31T08:00:00.000Z');

const firstSession = loadRuntime();
const migrated = await firstSession.query({ provider: 'netease' });
assert.ok(Object.isFrozen(migrated) && Object.isFrozen(migrated.preferences));
assert.equal(migrated.preferences.length, 1, 'v1 fact was not hydrated through the v2 policy');
const rock = migrated.preferences[0];
assert.equal(rock.subject, '后摇');

const corrected = await firstSession.correct({
  provider: 'netease', entityId: rock.entityId, category: 'music_affinity', subject: '后摇',
  polarity: 'dislike', statement: '用户明确表示不再喜欢：后摇', occurredAt: '2026-08-31T09:00:00.000Z'
});
assert.equal(corrected.changed, true);
assert.equal((await firstSession.query({ provider: 'netease' })).preferences[0].polarity, 'dislike');

const forgotten = await firstSession.forget({
  provider: 'netease', entityIds: [rock.entityId], occurredAt: '2026-08-31T10:00:00.000Z'
});
assert.equal(forgotten.changed, 1);
assert.equal((await firstSession.query({ provider: 'netease' })).preferences.length, 0);

memoryClient.failNextReceipt = true;
await assert.rejects(firstSession.correct({
  provider: 'netease', category: 'response_style', subject: 'reply_length', polarity: 'like',
  statement: '用户希望回答简短', occurredAt: '2026-08-31T11:00:00.000Z'
}));
assert.equal((await firstSession.query({ provider: 'netease' })).preferences.length, 0,
  'failed receipt mutated active projection');

const learned = await firstSession.observeChat({
  provider: 'netease', role: 'user', text: '我喜欢听爵士', occurredAt: '2026-08-31T12:00:00.000Z'
});
assert.equal(learned.written, 1);
const inferred = await firstSession.observePlaybackSummary({
  provider: 'netease', occurredAt: '2026-08-31T12:01:00.000Z',
  summary: { topArtists: [{ name: '爵士', starts: 6, completes: 5, skips: 0, replays: 1, confidence: 0.9 }] }
});
assert.equal(inferred.written, 1);
const explicitWins = await firstSession.query({ provider: 'netease' });
assert.equal(explicitWins.preferences.find((item) => item.subject === '爵士').origin, 'explicit-chat',
  'a behavioral signal replaced an explicit preference');
memoryClient.suppressNext = true;
const suppressed = await firstSession.correct({
  provider: 'netease', category: 'interest', subject: '绘画', polarity: 'like',
  statement: '用户喜欢绘画', occurredAt: '2026-08-31T12:02:00.000Z'
});
assert.equal(suppressed.changed, false);
assert.equal(suppressed.suppressed, true);
assert.equal((await firstSession.query({ provider: 'netease' })).preferences.length, 1,
  'suppressed temporary write mutated active projection');
const secondSession = loadRuntime();
const restarted = await secondSession.recall({ provider: 'netease', message: '推荐爵士和后摇', limit: 24 });
assert.ok(Object.isFrozen(restarted) && Object.isFrozen(restarted.preferences));
assert.equal(restarted.preferences.length, 1, 'restart did not load only the latest active entity version');
assert.equal(restarted.preferences[0].subject, '爵士');
assert.ok(!restarted.preferences.some((item) => item.subject === '后摇'),
  'a retracted statement matched recall after restart');

const isolated = await secondSession.query({ provider: 'qq' });
assert.equal(isolated.preferences.length, 0, 'preferences leaked across providers');

console.log(JSON.stringify({
  ok: true,
  v1Migration: true,
  correction: true,
  retraction: true,
  failedReceiptIsolation: true,
  suppressedWriteIsolation: true,
  explicitOverridesBehavior: true,
  restartRecall: true,
  providerIsolation: true
}, null, 2));
