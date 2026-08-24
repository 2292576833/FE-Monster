import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const commandSource = read('web/app-command.js');
const appSource = read('web/app.js');
const careSource = read('web/companion-care-actions.js');

class FixtureCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

const window = { dispatchEvent() {} };
vm.runInNewContext(commandSource, { window, CustomEvent: FixtureCustomEvent }, {
  filename: 'web/app-command.js'
});
const bus = window.FeMonsterAppCommands;

let executions = 0;
bus.register({
  command: 'fixture.reversible.set',
  category: 'playback',
  title: 'Reversible fixture',
  description: 'A low-risk reversible fixture.',
  reversible: true,
  automaticAllowed: true,
  parameters: { value: 'number 0..100', operationId: 'string' },
  requiredParameterGroups: [['value']],
  handler(parameters) {
    executions += 1;
    return { before: 20, after: parameters.value, undo: { command: 'fixture.reversible.set', parameters: { value: 20 } } };
  }
});
bus.register({
  command: 'fixture.manual.set',
  category: 'settings',
  title: 'Manual fixture',
  description: 'Must not run proactively.',
  reversible: true,
  automaticAllowed: false,
  handler() { return { changed: true }; }
});
bus.register({
  command: 'fixture.invalid-reversible.set',
  category: 'settings',
  title: 'Invalid reversible fixture',
  description: 'Claims reversibility without an executable undo receipt.',
  reversible: true,
  automaticAllowed: true,
  parameters: { value: 'number', operationId: 'string' },
  requiredParameterGroups: [['value']],
  handler(parameters) { return { after: parameters.value }; }
});
bus.register({
  command: 'fixture.state.query',
  category: 'read',
  readOnly: true,
  title: 'State fixture',
  description: 'Reads state.',
  handler() { return { value: 1 }; }
});
bus.register({
  command: 'fixture.automatic.noop',
  category: 'playback',
  title: 'Automatic no-op fixture',
  description: 'An automatic command that observes no required change.',
  reversible: true,
  automaticAllowed: true,
  handler() { return { status: 'unchanged', changed: false }; }
});
bus.register({
  command: 'fixture.automatic.missing-undo',
  category: 'playback',
  title: 'Automatic changed fixture without undo',
  description: 'A deliberately invalid automatic mutation.',
  reversible: true,
  automaticAllowed: true,
  handler() { return { status: 'changed', changed: true }; }
});
bus.register({
  command: 'fixture.boolean.restore',
  category: 'settings',
  title: 'Strict boolean undo target',
  parameters: { enabled: 'boolean' },
  requiredParameterGroups: [['enabled']],
  handler(parameters) { return { enabled: parameters.enabled }; }
});
bus.register({
  command: 'fixture.automatic.invalid-undo-type',
  category: 'settings',
  title: 'Automatic fixture with a non-executable typed undo',
  reversible: true,
  automaticAllowed: true,
  handler() {
    return {
      status: 'changed',
      changed: true,
      undo: { command: 'fixture.boolean.restore', parameters: { enabled: 'false' } }
    };
  }
});

const serverCatalog = JSON.parse(JSON.stringify(bus.catalog()));
const localCatalog = JSON.parse(JSON.stringify(bus.catalog()));
assert.deepEqual(localCatalog, serverCatalog, 'server and local model paths do not share one catalog snapshot');

const reversible = bus.inspect('fixture.reversible.set', { value: 32, operationId: 'same-intent' }, {
  source: 'server-model', automatic: true
});
assert.equal(reversible.reversible, true, 'reversibility is not published by inspect');
assert.equal(reversible.automaticAllowed, true, 'automatic execution eligibility is not published by inspect');
assert.equal(reversible.requiresConfirmation, false);
assert.equal(bus.resolve('fixture.state.query').automaticAllowed, true,
  'read-only commands should be discoverable as safe automatic context reads');

const automaticNoop = await bus.execute('fixture.automatic.noop', {
  operationId: 'automatic-noop'
}, { source: 'server-model', automatic: true });
assert.equal(automaticNoop.status, 'unchanged',
  'an automatic command with no side effect must not fabricate an undo command');
await assert.rejects(
  () => bus.execute('fixture.automatic.missing-undo', {
    operationId: 'automatic-missing-undo'
  }, { source: 'server-model', automatic: true }),
  (error) => error?.code === 'invalid_undo_receipt',
  'an automatic command that changed state was accepted without an executable undo command'
);
await assert.rejects(
  () => bus.execute('fixture.automatic.invalid-undo-type', {
    operationId: 'automatic-invalid-undo-type'
  }, { source: 'server-model', automatic: true }),
  (error) => error?.code === 'invalid_parameter_type',
  'an automatic command was accepted with an undo that cannot pass its target parameter contract'
);

const first = await bus.execute('fixture.reversible.set', {
  value: 32,
  operationId: 'same-intent',
  automatic: true,
  proactive: true
}, { source: 'local-model' });
const replay = await bus.execute('fixture.reversible.set', {
  value: 32
}, { source: 'server-model', automatic: true, actionId: 'same-intent' });
assert.equal(executions, 1, 'one logical operation executed more than once across model paths');
assert.equal(first.commandReceipt.replayed, false);
assert.equal(replay.commandReceipt.replayed, true);
assert.equal(replay.commandReceipt.operationId, 'same-intent');
const trustedContextFirst = await bus.execute('fixture.reversible.set', {
  value: 34,
  operationId: 'model-supplied-id'
}, { source: 'server-model', automatic: true, actionId: 'trusted-action-id' });
const trustedContextReplay = await bus.execute('fixture.reversible.set', {
  value: 34,
  operationId: 'different-model-id'
}, { source: 'local-model', automatic: true, operationId: 'trusted-action-id' });
assert.equal(trustedContextFirst.commandReceipt.operationId, 'trusted-action-id',
  'a model-supplied inner operationId overrode the trusted action context');
assert.equal(trustedContextReplay.commandReceipt.replayed, true,
  'trusted cross-source operation identity did not deduplicate model-specific inner IDs');
await assert.rejects(
  () => bus.execute('fixture.reversible.set', { value: 33, operationId: 'same-intent' }),
  (error) => error?.code === 'idempotency_conflict',
  'reusing an operation ID with a different payload must fail loudly'
);
assert.throws(
  () => bus.inspect('fixture.manual.set', { automatic: true }, { source: 'server-model' }),
  (error) => error?.code === 'automatic_not_allowed',
  'a model could mark a manual command as automatic'
);
await assert.rejects(
  () => bus.execute('fixture.invalid-reversible.set', {
    value: 5,
    operationId: 'missing-undo'
  }, { automatic: true }),
  (error) => error?.code === 'invalid_undo_receipt',
  'automatic reversible execution must return an executable undo receipt'
);

const automaticPage = bus.capabilities({ automaticOnly: true, limit: 20 });
assert.ok(automaticPage.commands.every((definition) => definition.automaticAllowed === true));
assert.ok(automaticPage.commands.some((definition) => definition.command === 'fixture.reversible.set'));
assert.ok(automaticPage.commands.some((definition) => definition.command === 'fixture.state.query'));
assert.ok(!automaticPage.commands.some((definition) => definition.command === 'fixture.manual.set'));

for (const command of [
  'playback.mute.query',
  'playback.mute.set',
  'playback.mute.toggle',
  'playback.seek.adjust',
  'playback.restart',
  'navigation.current.query',
  'scene.preset.current.query',
  'lyrics.state.query',
  'lyrics.focus.echo.set',
  'lyrics.visibility.set',
  'wallpaper.appearance.query'
]) {
  assert.ok(appSource.includes(`command: '${command}'`), `missing real client command ${command}`);
}
assert.ok(careSource.includes("command: 'care.context.query'"),
  'models cannot read bounded time/playback context before composing low-risk actions');

const appRegistration = appSource.slice(appSource.indexOf('function registerPetAssistantAppCommands()'));
const combinedRegistrations = `${appRegistration}\n${careSource}`;
function commandRegistrationSource(command) {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const registration = new RegExp(
    `^[ \\t]{4,10}command: '${escaped}'[^\\n]*(?:\\n[^\\n]*){0,4}?category:`,
    'm'
  ).exec(combinedRegistrations);
  const start = registration
    ? registration.index + registration[0].indexOf(`command: '${command}'`)
    : -1;
  assert.ok(start >= 0, `missing shared command ${command}`);
  const next = combinedRegistrations.indexOf("command: '", start + 10);
  return combinedRegistrations.slice(start, next >= 0 ? next : start + 1_500);
}

for (const command of [
  'playback.play', 'playback.pause', 'playback.toggle',
  'playback.volume.set', 'playback.volume.adjust',
  'playback.mute.set', 'playback.mute.toggle', 'playback.restart',
  'scene.preset.set', 'lyrics.bilingual.set', 'lyrics.multi.row.set',
  'lyrics.focus.echo.set', 'lyrics.visibility.set', 'wallpaper.setting.set',
  'wallpaper.apply', 'care.music.comfort.play', 'care.volume.adapt'
]) {
  const definition = commandRegistrationSource(command);
  assert.match(definition, /reversible:\s*true/, `${command} does not declare reversibility`);
  assert.match(definition, /automaticAllowed:\s*true/, `${command} is unavailable to proactive low-risk composition`);
}

for (const command of [
  'pet.mascot.visibility.set', 'pet.desktop.visibility.set',
  'pet.desktop.show', 'pet.desktop.hide',
  'playback.next', 'playback.previous',
  'music.search.play', 'music.play.similar',
  'navigation.open', 'lyrics.mode.set'
]) {
  const definition = commandRegistrationSource(command);
  assert.doesNotMatch(definition, /automaticAllowed:\s*true/,
    `${command} claims proactive safety without a complete state-restoring undo`);
  assert.doesNotMatch(definition, /reversible:\s*true/,
    `${command} claims reversibility without a complete state-restoring undo`);
}

for (const command of ['playback.mute.set', 'playback.mute.toggle']) {
  assert.match(commandRegistrationSource(command), /requiresConfirmation:\s*\(/,
    `${command} can proactively turn audible playback back on without a confirmation boundary`);
}

console.log(JSON.stringify({
  ok: true,
  sharedCatalog: true,
  automaticPolicy: true,
  idempotentAcrossSources: true,
  expandedCommands: 12
}, null, 2));
