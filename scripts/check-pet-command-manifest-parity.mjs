import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const commandBusSource = fs.readFileSync(path.join(root, 'web', 'app-command.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const contextSource = fs.readFileSync(path.join(root, 'web', 'pet-client-context.js'), 'utf8');
const assistantSource = fs.readFileSync(path.join(root, 'web', 'pet-assistant.js'), 'utf8');

class FixtureCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

function emitter(target = {}) {
  const listeners = new Map();
  target.addEventListener = (type, listener) => {
    const bucket = listeners.get(type) || new Set();
    bucket.add(listener);
    listeners.set(type, bucket);
  };
  target.removeEventListener = (type, listener) => listeners.get(type)?.delete(listener);
  target.dispatchEvent = (event) => {
    for (const listener of listeners.get(event?.type) || []) listener.call(target, event);
    return true;
  };
  return target;
}

function createCommandFixture(definitions) {
  const host = emitter({ CustomEvent: FixtureCustomEvent });
  host.window = host;
  const sandbox = vm.createContext({
    CustomEvent: FixtureCustomEvent,
    console,
    safeText: (value, fallback = '') => String(value ?? fallback),
    window: host,
  });
  vm.runInContext(commandBusSource, sandbox, { filename: 'web/app-command.js' });
  host.FeMonsterAppCommands.registerMany(definitions);
  return { host, sandbox, bus: host.FeMonsterAppCommands };
}

const baseDefinitions = [
  {
    command: 'playback.volume.set',
    aliases: ['volume.set'],
    category: 'playback',
    title: '音量',
    parameters: { volume: 'number 0..100' },
    requiredParameterGroups: [['volume']],
    reversible: true,
    handler: (args) => ({
      changed: true,
      value: args.volume,
      undo: { command: 'playback.volume.set', parameters: { volume: 20 } },
    }),
  },
  {
    command: 'app.capabilities.query',
    category: 'read',
    readOnly: true,
    title: '发现能力',
    parameters: { query: 'string?', limit: 'number?' },
    handler() { return { ok: true }; },
  },
];

const ordered = createCommandFixture(baseDefinitions);
const reversed = createCommandFixture([...baseDefinitions].reverse());
const orderedManifest = ordered.bus.manifest();
const reversedManifest = reversed.bus.manifest();

assert.equal(
  orderedManifest.catalogRevision,
  reversedManifest.catalogRevision,
  'command catalog revision changed only because registration order changed',
);
assert.deepEqual(
  JSON.parse(JSON.stringify(orderedManifest.commands)),
  JSON.parse(JSON.stringify(reversedManifest.commands)),
  'canonical command manifest is not sorted deterministically',
);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

const canonicalPayload = stableValue({
  schema: orderedManifest.schema,
  protocolVersion: orderedManifest.protocolVersion,
  catalogVersion: orderedManifest.catalogVersion,
  commands: JSON.parse(JSON.stringify(orderedManifest.commands)),
});
const expectedRevision = `sha256:${crypto.createHash('sha256')
  .update(JSON.stringify(canonicalPayload))
  .digest('hex')}`;
assert.equal(orderedManifest.catalogRevision, expectedRevision, 'browser command checksum is not real SHA-256');

const changed = createCommandFixture([
  { ...baseDefinitions[0], parameters: { volume: 'number 0..200' } },
  baseDefinitions[1],
]);
assert.notEqual(
  changed.bus.manifestSummary().catalogRevision,
  ordered.bus.manifestSummary().catalogRevision,
  'functional parameter drift did not change the catalog revision',
);

const renamedOnly = createCommandFixture([
  { ...baseDefinitions[0], title: '响度' },
  baseDefinitions[1],
]);
assert.equal(
  renamedOnly.bus.manifestSummary().catalogRevision,
  ordered.bus.manifestSummary().catalogRevision,
  'display-only localization changed the functional catalog revision',
);

const capabilities = ordered.bus.capabilities({ limit: 20 });
assert.deepEqual(
  JSON.parse(JSON.stringify(capabilities.manifest)),
  JSON.parse(JSON.stringify(ordered.bus.manifestSummary())),
  'capability discovery does not carry the exact shared command manifest',
);
assert.equal(ordered.bus.verifyManifest(capabilities.manifest).ok, true);
assert.equal(ordered.bus.verifyManifest(null).code, 'command_manifest_missing');
assert.equal(ordered.bus.verifyManifest(null, { required: false }).ok, true);
assert.equal(
  ordered.bus.verifyManifest({
    ...capabilities.manifest,
    catalogRevision: changed.bus.manifestSummary().catalogRevision,
  }).code,
  'command_catalog_changed',
);

const receipt = await ordered.bus.execute(
  'playback.volume.set',
  { volume: 35 },
  { operationId: 'manifest-receipt-probe' },
);
assert.equal(receipt.commandReceipt.schema, capabilities.manifest.receiptSchema);
assert.equal(receipt.commandReceipt.protocolVersion, capabilities.manifest.protocolVersion);
assert.equal(receipt.commandReceipt.catalogRevision, capabilities.manifest.catalogRevision);
assert.equal(receipt.commandReceipt.reversible, true);

const helperStart = appSource.indexOf('function petAssistantClientContextCommands');
const helperEnd = appSource.indexOf('\nfunction petAssistantClientContextSnapshot', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'cannot extract production command context helper');
vm.runInContext(appSource.slice(helperStart, helperEnd), ordered.sandbox, {
  filename: 'web/app.js#petAssistantClientContextCommands',
});
const commandContext = vm.runInContext(
  'petAssistantClientContextCommands(window.FeMonsterAppCommands.catalog())',
  ordered.sandbox,
);
assert.deepEqual(
  JSON.parse(JSON.stringify(commandContext.manifest)),
  JSON.parse(JSON.stringify(ordered.bus.manifestSummary())),
  'client context is not sourced from the same runtime manifest as discovery',
);

const document = emitter({
  documentElement: { getAttribute: () => '' },
  getElementById: () => null,
  querySelector: () => null,
});
ordered.host.document = document;
ordered.host.setTimeout = setTimeout;
ordered.host.clearTimeout = clearTimeout;
ordered.host.Date = Date;
ordered.host.FeMonsterPetActionBridge = {
  clientContextSnapshot: () => ({ commands: vm.runInContext(
    'petAssistantClientContextCommands(window.FeMonsterAppCommands.catalog())',
    ordered.sandbox,
  ) }),
};
ordered.sandbox.document = document;
ordered.sandbox.setTimeout = setTimeout;
ordered.sandbox.clearTimeout = clearTimeout;
vm.runInContext(contextSource, ordered.sandbox, { filename: 'web/pet-client-context.js' });
const initialContext = ordered.host.FeMonsterPetClientContext.compact();
assert.equal(initialContext.commands.manifest.catalogRevision, capabilities.manifest.catalogRevision);

ordered.bus.register({
  command: 'scene.preset.set',
  category: 'scene',
  parameters: { presetId: 'string' },
  requiredParameterGroups: [['presetId']],
  handler: () => ({ changed: true }),
});
await new Promise((resolve) => setTimeout(resolve, 5));
const refreshedContext = ordered.host.FeMonsterPetClientContext.current();
assert.equal(refreshedContext.commands.manifest.commandCount, 3);
assert.notEqual(
  refreshedContext.commands.manifest.catalogRevision,
  initialContext.commands.manifest.catalogRevision,
  'client context did not refresh after a command catalog change event',
);

const statusStart = assistantSource.indexOf('function serverActionCommandManifestStatus');
const statusEnd = assistantSource.indexOf('\n  async function cancelServerActionForCommandManifest', statusStart);
assert.ok(statusStart >= 0 && statusEnd > statusStart, 'server action manifest verifier is missing');
const applyStart = assistantSource.indexOf('async function applyToolEvent');
const manifestGuard = assistantSource.indexOf('serverActionCommandManifestStatus(payload)', applyStart);
const commandInspect = assistantSource.indexOf('FeMonsterPetActionBridge?.inspect', applyStart);
assert.ok(
  manifestGuard > applyStart && commandInspect > manifestGuard,
  'server action reaches command inspection before the manifest guard',
);
assert.match(
  assistantSource.slice(manifestGuard, commandInspect),
  /cancelServerActionForCommandManifest/,
  'manifest mismatch is not cancelled before any client command can execute',
);
const promptFieldsStart = assistantSource.indexOf('const CLIENT_AI_PROMPT_CONTEXT_FIELDS');
const promptFieldsEnd = assistantSource.indexOf(']);', promptFieldsStart);
assert.match(
  assistantSource.slice(promptFieldsStart, promptFieldsEnd),
  /['"]commands['"]/,
  'the user-configured local pet model does not receive the shared command manifest context',
);

console.log(JSON.stringify({
  ok: true,
  sha256Revision: true,
  registrationOrderIndependent: true,
  capabilityContextParity: true,
  receiptBoundToRevision: true,
  serverActionDriftGuard: true,
}, null, 2));
