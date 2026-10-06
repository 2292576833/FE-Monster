import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const extract = name => {
  const source = app.match(new RegExp(`^function ${name}\\([^]*?^}`, 'm'))?.[0];
  assert.ok(source, name);
  return source;
};
const pending = [];
let players = 0, bridges = 0, applied = 0;
const delayed = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
const context = vm.createContext({
  document: { hidden: false },
  refreshPlayerState() { players += 1; return delayed(); },
  apiJson(path, options) {
    assert.equal(path, '/api/visual-bridge/state');
    assert.equal(options.timeoutMs, 8000);
    bridges += 1;
    return delayed();
  },
  applyAudioBridgePayload() { applied += 1; }
});
vm.runInContext(`let playerStatePollRequest = null, visualBridgeRefreshRequest = null;
${extract('pollPlayerState')}
${extract('refreshVisualBridge')}`, context);

const playerBatch = Array.from({ length: 30 }, () => context.pollPlayerState());
assert.equal(players, 1, 'thirty timer ticks share one pending player poll');
assert.ok(playerBatch.every(promise => promise === playerBatch[0]));
// Manual playback actions remain independent and can request fresh state.
const manual = context.refreshPlayerState();
assert.equal(players, 2);
pending.shift().resolve();
pending.shift().resolve();
await Promise.all([...playerBatch, manual]);
const failedPoll = context.pollPlayerState();
pending.shift().reject(new Error('timeout'));
await failedPoll;
const recoveredPoll = context.pollPlayerState();
assert.equal(players, 4, 'a rejected or timed-out poll releases the slot');
pending.shift().resolve();
await recoveredPoll;

const bridgeBatch = Array.from({ length: 30 }, () => context.refreshVisualBridge());
assert.equal(bridges, 1);
pending.shift().resolve({ audio: { energy: .5 } });
await Promise.all(bridgeBatch);
assert.equal(applied, 1, 'one bridge result is applied once');
const failedBridge = context.refreshVisualBridge();
pending.shift().reject(new Error('timeout'));
await failedBridge;
const recoveredBridge = context.refreshVisualBridge();
pending.shift().resolve({ audio: {} });
await recoveredBridge;
assert.equal(bridges, 3);
assert.equal(applied, 2);
context.document.hidden = true;
context.refreshVisualBridge();
assert.equal(bridges, 3, 'a hidden document starts no new bridge fetch');
assert.match(app, /apiJson\('\/api\/player\/state', \{ timeoutMs: 8000 \}\)/);
console.log('Polling checks passed: shared timer requests, independent manual refresh, error/timeout recovery, hidden state and bounded player timeout.');
