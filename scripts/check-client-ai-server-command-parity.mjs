import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const commandBusSource = fs.readFileSync(path.join(root, 'web', 'app-command.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const petSource = fs.readFileSync(path.join(root, 'web', 'pet-assistant.js'), 'utf8');

function sliceBetween(source, startToken, endToken, label) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `cannot extract production ${label}`);
  return source.slice(start, end);
}

function productionCommandObjectSource(command) {
  const marker = `command: '${command}'`;
  const registryStart = appSource.indexOf('function registerPetAssistantAppCommands()');
  assert.ok(registryStart >= 0, 'real client command registry is not present');
  const markerIndex = appSource.indexOf(marker, registryStart);
  assert.ok(markerIndex >= 0, `real client command ${command} is not registered`);
  const start = appSource.lastIndexOf('\n    {', markerIndex);
  const end = appSource.indexOf('\n    },', markerIndex);
  assert.ok(start >= 0 && end > markerIndex, `cannot extract real client command ${command}`);
  return appSource.slice(start + 5, end + 6);
}

const legacyCommandSource = sliceBetween(
  appSource,
  'const PET_ASSISTANT_LEGACY_COMMANDS',
  'const PET_BUILTIN_SCENE_PRESETS',
  'legacy command aliases',
);
const boundedTextSource = sliceBetween(
  appSource,
  'function petAssistantBoundedText',
  'function petAssistantArguments',
  'bounded command text helper',
);
const argumentsSource = sliceBetween(
  appSource,
  'function petAssistantArguments',
  'let playbackIntelligence',
  'structured command arguments helper',
);
const bridgeSource = sliceBetween(
  appSource,
  'function resolvePetAssistantRoutableCommand',
  'async function init()',
  'FeMonsterPetActionBridge',
);
const localToolSource = sliceBetween(
  petSource,
  'let petAiToolCommandMap = {}',
  'function clientAiPhysicalRequestId',
  'local model command adapter',
);

class FixtureCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

const window = {
  __volume: 20,
  __privateReads: 0,
  __sentMessages: [],
  __confirmedValue: '',
  __sceneColor: '#ffffff',
  __confirmationDecisions: [],
  __confirmationRequests: [],
  dispatchEvent() {},
};
window.window = window;

const sandbox = {
  AbortController,
  CustomEvent: FixtureCustomEvent,
  Date,
  JSON,
  Map,
  Math,
  Object,
  Set,
  console,
  window,
  clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
  safeText: (value, fallback = '') => String(value ?? fallback),
  boundedString: (value, maximum = 1_000, fallback = '') => String(value ?? fallback).trim().slice(0, maximum),
  els: {
    audio: {
      get volume() { return window.__volume / 100; },
    },
  },
  petAssistantSetVolume(args) {
    const before = window.__volume;
    const after = Math.max(0, Math.min(100, Math.round(Number(args.volume ?? args.value))));
    window.__volume = after;
    return {
      status: before === after ? 'unchanged' : 'changed',
      changed: before !== after,
      before,
      after,
      undo: { command: 'playback.volume.set', parameters: { volume: before } },
    };
  },
  petAssistantCommunityMessagesQuery() {
    window.__privateReads += 1;
    return { messages: [{ id: 'private-message', text: 'never expose this to a custom model' }] };
  },
  async sendCommunityMessageTo(targetId, text) {
    const message = { id: `sent-${window.__sentMessages.length + 1}`, targetId, text };
    window.__sentMessages.push(message);
    return { message };
  },
  petAssistantPresetCatalog: () => [],
  petAssistantPlaybackSnapshot: () => ({ volume: window.__volume }),
  petAssistantClientContextSnapshot: () => ({ playback: { volume: window.__volume } }),
  petAssistantParameterPage(args = {}, includeCatalog = false) {
    const item = {
      key: 'ui.sonic-center-color-input',
      title: '场景中心颜色',
      category: 'scene',
      type: 'color',
      currentValue: window.__sceneColor,
      ...(includeCatalog ? { description: '调整场景中心光效颜色' } : {}),
    };
    return { items: [item], nextCursor: null, total: 1, query: String(args.query || '') };
  },
  petAssistantApplyParameterBatch(args = {}) {
    const changes = Array.isArray(args.changes) ? args.changes : [];
    const colorChange = changes.find((change) => change?.key === 'ui.sonic-center-color-input');
    if (!colorChange || !/^#[0-9a-f]{6}$/i.test(String(colorChange.value || ''))) {
      throw new Error('场景颜色参数无效');
    }
    const before = window.__sceneColor;
    window.__sceneColor = String(colorChange.value).toLowerCase();
    return {
      status: before === window.__sceneColor ? 'unchanged' : 'changed',
      changed: before !== window.__sceneColor,
      before: { 'ui.sonic-center-color-input': before },
      after: { 'ui.sonic-center-color-input': window.__sceneColor },
    };
  },
  async requestActionConfirmation(payload, inspection) {
    window.__confirmationRequests.push({ payload, inspection });
    return window.__confirmationDecisions.shift() === true;
  },
};
const context = vm.createContext(sandbox);

vm.runInContext(commandBusSource, context, { filename: 'web/app-command.js' });
const bus = window.FeMonsterAppCommands;
sandbox.commands = bus;

const commandObjects = [
  'app.capabilities.query',
  'app.parameters.catalog.query',
  'app.parameters.current.query',
  'app.parameters.batch.apply',
  'playback.volume.set',
  'community.messages.query',
  'community.message.send',
].map((command) => vm.runInContext(
  `(${productionCommandObjectSource(command)})`,
  context,
  { filename: `web/app.js#${command}` },
));
bus.registerMany(commandObjects);
bus.register({
  command: 'fixture.confirmed.set',
  category: 'settings',
  title: 'Confirmation continuation fixture',
  description: 'Models a registered non-private command whose inspected policy requires user confirmation.',
  parameters: { value: 'string' },
  requiredParameterGroups: [['value']],
  requiresConfirmation: true,
  handler(args) {
    window.__confirmedValue = String(args.value);
    return { applied: true, value: window.__confirmedValue };
  },
});

vm.runInContext(
  `${legacyCommandSource}\n${boundedTextSource}\n${argumentsSource}\n${bridgeSource}`,
  context,
  { filename: 'web/app.js#pet-action-bridge' },
);
vm.runInContext(localToolSource, context, {
  filename: 'web/pet-assistant.js#local-model-command-adapter',
});
sandbox.clientAiServiceToolDefinitions();

const bridge = window.FeMonsterPetActionBridge;
assert.ok(bridge && typeof bridge.inspect === 'function' && typeof bridge.execute === 'function',
  'real FeMonsterPetActionBridge did not initialize');

const discoveryEnvelope = {
  name: 'query_app_capabilities',
  arguments: { limit: 20 },
};
const serverDiscovery = await bridge.execute(discoveryEnvelope, { source: 'server-model' });
const localDiscovery = await sandbox.executeLocalPetCommand(
  'query_app_capabilities',
  JSON.stringify(discoveryEnvelope.arguments),
);
assert.deepEqual(
  JSON.parse(JSON.stringify(localDiscovery)),
  JSON.parse(JSON.stringify(serverDiscovery)),
  'server and local models did not discover the same shared command catalog',
);
assert.ok(localDiscovery.commands.some((definition) => definition.command === 'playback.volume.set'),
  'local model could not discover the real playback.volume.set command');

const colorCapabilities = await sandbox.executeLocalPetCommand(
  'query_app_capabilities',
  JSON.stringify({ query: '场景颜色', limit: 20 }),
);
assert.ok(colorCapabilities.commands.some((definition) => definition.command === 'app.parameters.catalog.query'),
  'local model could not discover the real parameter catalog from the scene-color intent');
assert.ok(colorCapabilities.commands.some((definition) => definition.command === 'app.parameters.batch.apply'),
  'local model could not discover the real parameter apply command from the scene-color intent');
const colorCatalog = await sandbox.executeLocalPetCommand('control_app', JSON.stringify({
  command: 'app.parameters.catalog.query',
  arguments: { query: '场景颜色', limit: 20 },
}));
assert.equal(colorCatalog.items[0].key, 'ui.sonic-center-color-input');
const colorApply = await sandbox.executeLocalPetCommand('control_app', JSON.stringify({
  command: 'app.parameters.batch.apply',
  arguments: { changes: [{ key: colorCatalog.items[0].key, value: '#7c5cff' }] },
}), { operationId: 'local-scene-color' });
assert.equal(window.__sceneColor, '#7c5cff',
  'local model received a success-shaped reply but did not change the real scene-color state');
assert.equal(colorApply.after['ui.sonic-center-color-input'], '#7c5cff');

// This is an explicit privacy exception: the server path may service the signed
// account-scoped read, while an arbitrary user-supplied model must be denied
// before the registered private handler executes.
const privateEnvelope = {
  name: 'control_app',
  arguments: { command: 'community.messages.query', arguments: {} },
};
const serverPrivate = await bridge.execute(privateEnvelope, { source: 'server-model' });
assert.equal(serverPrivate.messages[0].id, 'private-message');
assert.equal(window.__privateReads, 1);
await assert.rejects(
  sandbox.executeLocalPetCommand('control_app', JSON.stringify(privateEnvelope.arguments)),
  /私密|private/i,
  'custom local model crossed the explicit private-command deny boundary',
);
assert.equal(window.__privateReads, 1, 'private local-model command reached the real handler');

// This is the shared centralized safety exception: protected arbitrary file
// operations never enter either model's discoverable command directory.
assert.throws(
  () => bus.register({
    command: 'filesystem.delete',
    category: 'filesystem-write',
    handler() { return { deleted: true }; },
  }),
  (error) => error?.code === 'denied_command',
  'protected filesystem command entered the shared command catalog',
);

const serverVolumeResult = await bridge.execute({
  name: 'control_app',
  arguments: { command: 'playback.volume.set', arguments: { volume: 35 } },
}, {
  source: 'server-model',
  operationId: 'server-volume',
});
assert.equal(serverVolumeResult.after, 35);
const localVolumeResult = await sandbox.executeLocalPetCommand('control_app', JSON.stringify({
  command: 'playback.volume.set',
  arguments: { volume: 40 },
}), { operationId: 'local-volume' });
assert.equal(localVolumeResult.after, 40,
  'local model could not execute an ordinary real command through the shared bridge');

const confirmedEnvelope = {
  name: 'control_app',
  arguments: { command: 'fixture.confirmed.set', arguments: { value: 'confirmed' } },
};
const serverInspection = bridge.inspect(confirmedEnvelope, { source: 'server-model' });
assert.equal(serverInspection.command, 'fixture.confirmed.set');
assert.equal(serverInspection.requiresConfirmation, true,
  'shared command inspect lost its registered confirmation policy');
await assert.rejects(
  bridge.execute(confirmedEnvelope, { source: 'server-model' }),
  (error) => error?.code === 'confirmation_required',
  'server bridge executed a command before confirmation',
);
const serverConfirmedResult = await bridge.execute(confirmedEnvelope, {
  source: 'server-model',
  confirmed: true,
});
assert.equal(serverConfirmedResult.value, 'confirmed',
  'server model could not continue command execution after confirmation');

const parityFailures = [];
async function expectParity(label, action) {
  try {
    await action();
  } catch (error) {
    parityFailures.push(`${label}: ${error?.message || error}`);
  }
}

// RED #1: this real registered write does not reveal stored private messages;
// it only transmits the target/text already supplied by the user. The server
// path can execute it, while the local adapter's broad `messages?` deny regex
// currently rejects it together with the intentionally-private query above.
const serverSendResult = await bridge.execute({
  name: 'control_app',
  arguments: {
    command: 'community.message.send',
    arguments: { targetId: '12345678', text: 'server path' },
  },
}, { source: 'server-model' });
assert.equal(serverSendResult.sent, true);
await expectParity('real community.message.send is unavailable to the local model', async () => {
  const localSendResult = await sandbox.executeLocalPetCommand('control_app', JSON.stringify({
    command: 'community.message.send',
    arguments: { targetId: '12345678', text: 'local path' },
  }));
  assert.equal(localSendResult.sent, true);
  assert.equal(window.__sentMessages.at(-1)?.text, 'local path');
});

// RED #2: the server action flow can continue an inspected action after user
// confirmation, but the local-model adapter currently discards `confirmed`
// and has no equivalent confirmation continuation.
await assert.rejects(
  sandbox.executeLocalPetCommand('control_app', JSON.stringify(confirmedEnvelope.arguments)),
  /确认|取消/,
  'local model executed a registered command before confirmation',
);
await expectParity('local confirmation continuation is unavailable', async () => {
  const localConfirmedResult = await sandbox.executeLocalPetCommand(
    'control_app',
    JSON.stringify(confirmedEnvelope.arguments),
    { confirmed: true },
  );
  assert.equal(localConfirmedResult.value, 'confirmed');
});
window.__confirmationDecisions.push(true);
const promptedConfirmationResult = await sandbox.executeLocalPetCommand(
  'control_app',
  JSON.stringify({
    command: 'fixture.confirmed.set',
    arguments: { value: 'confirmed-through-local-ui' },
  }),
);
assert.equal(promptedConfirmationResult.value, 'confirmed-through-local-ui',
  'local model did not resume the real command after the local confirmation decision');
assert.equal(window.__confirmationRequests.length, 2,
  'local confirmation requester was not used for both cancel and confirm decisions');

// A superseded local-model turn must not execute a stale command after its
// confirmation promise eventually resolves. beginClientAiRequest aborts the
// previous turn, so the command adapter has to observe that same signal both
// before and after awaiting the user's decision.
const staleConfirmationController = new AbortController();
let settleStaleConfirmation;
const staleConfirmationExecution = sandbox.executeLocalPetCommand(
  'control_app',
  JSON.stringify({
    command: 'fixture.confirmed.set',
    arguments: { value: 'must-not-run-after-abort' },
  }),
  {
    signal: staleConfirmationController.signal,
    requestConfirmation: () => new Promise((resolve) => { settleStaleConfirmation = resolve; }),
  },
);
await Promise.resolve();
assert.equal(typeof settleStaleConfirmation, 'function',
  'stale-confirmation fixture did not reach the real confirmation boundary');
staleConfirmationController.abort();
settleStaleConfirmation(true);
await assert.rejects(
  staleConfirmationExecution,
  (error) => error?.name === 'AbortError' || /中止|取消|abort/i.test(String(error?.message || error)),
  'an aborted local-model turn executed after its stale confirmation resolved',
);
assert.notEqual(window.__confirmedValue, 'must-not-run-after-abort',
  'an aborted local-model turn mutated client state after confirmation');

if (parityFailures.length) {
  throw new assert.AssertionError({
    message: `server/local client command parity failures:\n- ${parityFailures.join('\n- ')}`,
  });
}

console.log(JSON.stringify({
  ok: true,
  sharedCatalog: true,
  sharedInspect: true,
  sharedConfirmationContinuation: true,
  sharedExecution: true,
  explicitPrivateDeny: true,
  centralizedSafetyDeny: true,
}, null, 2));
