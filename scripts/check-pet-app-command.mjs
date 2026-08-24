import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const commandSource = read('web/app-command.js');
const appSource = read('web/app.js');
const petSource = read('web/pet-assistant.js');
const html = read('web/index.html');
const loader = read('web/runtime-module-loader.js');

class FixtureCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

const events = [];
const window = {
  dispatchEvent(event) { events.push(event); },
  CustomEvent: FixtureCustomEvent
};
vm.runInNewContext(commandSource, { window, CustomEvent: FixtureCustomEvent }, { filename: 'app-command.js' });
const bus = window.FeMonsterAppCommands;
assert.ok(bus, 'app command bus did not initialize');

let receivedParameters = null;
bus.register({
  command: 'fixture.volume.set',
  aliases: ['fixture_set_volume'],
  category: 'playback',
  title: 'Fixture volume',
  parameters: { volume: 'number' },
  handler(parameters) {
    receivedParameters = parameters;
    return { volume: parameters.volume, unsafe: parameters.__proto__ };
  }
});
const execution = await bus.execute('fixture_set_volume', {
  volume: 42,
  __proto__: { polluted: true },
  constructor: 'blocked'
}, { source: 'test' });
assert.equal(execution.volume, 42);
assert.equal(receivedParameters.constructor, undefined, 'prototype-sensitive parameter was not removed');
assert.equal({}.polluted, undefined, 'command parameters polluted Object.prototype');
assert.deepEqual(events.map((event) => event.type), [
  'fe-monster-app-command-start',
  'fe-monster-app-command-complete'
]);

const socialDefinition = bus.register({
  command: 'community.fixture.send',
  category: 'social',
  handler(parameters) { return { sent: parameters.text }; }
});
assert.equal(socialDefinition.category, 'social');
assert.equal((await bus.execute('community.fixture.send', { text: 'hello' })).sent, 'hello');

let requiredParameterHandlerCalls = 0;
const requiredParameterDefinition = bus.register({
  command: 'fixture.toggle.set',
  category: 'settings',
  parameters: { enabled: 'boolean' },
  requiredParameterGroups: [['enabled', 'value']],
  handler(parameters) {
    requiredParameterHandlerCalls += 1;
    return { enabled: parameters.enabled ?? parameters.value };
  }
});
assert.deepEqual(
  JSON.parse(JSON.stringify(requiredParameterDefinition.requiredParameterGroups)),
  [['enabled', 'value']],
  'required parameter alternatives were not published to capability discovery'
);
assert.throws(
  () => bus.inspect('fixture.toggle.set', {}),
  (error) => error?.code === 'missing_parameters' && /enabled\/value/.test(error.message),
  'inspection must request clarification when every required parameter alternative is missing'
);
await assert.rejects(
  () => bus.execute('fixture.toggle.set', {}),
  (error) => error?.code === 'missing_parameters',
  'execution must not guess a default for a missing required parameter'
);
assert.equal(requiredParameterHandlerCalls, 0, 'a command with missing required parameters reached its handler');
assert.equal((await bus.execute('fixture.toggle.set', { value: false })).enabled, false,
  'an explicit false value must count as a provided required parameter');
assert.throws(
  () => bus.inspect('fixture.toggle.set', { value: 'false' }),
  (error) => error?.code === 'invalid_parameter_type',
  'inspection accepted a string fallback for a boolean write parameter'
);
await assert.rejects(
  () => bus.execute('fixture.toggle.set', { enabled: 1 }),
  (error) => error?.code === 'invalid_parameter_type',
  'execution accepted a numeric fallback for a boolean write parameter'
);
assert.equal(requiredParameterHandlerCalls, 1,
  'an invalid boolean write reached the production command handler');

bus.register({
  command: 'fixture.dynamic.setting',
  category: 'settings',
  requiresConfirmation: (parameters) => parameters.highImpact === true,
  confirmationMessage: 'fixture confirmation',
  handler(parameters) { return { applied: parameters.highImpact === true }; }
});
assert.equal(bus.inspect('fixture.dynamic.setting', { highImpact: false }).requiresConfirmation, false);
assert.equal(bus.inspect('fixture.dynamic.setting', { highImpact: true }).requiresConfirmation, true);
await assert.rejects(
  () => bus.execute('fixture.dynamic.setting', { highImpact: true }),
  (error) => error?.code === 'confirmation_required'
);
assert.equal(
  (await bus.execute('fixture.dynamic.setting', { highImpact: true }, { confirmed: true })).applied,
  true
);

for (const definition of [
  { command: 'account.delete', category: 'app', handler() {} },
  { command: 'system.restart', category: 'settings', handler() {} },
  { command: 'fixture.payment.start', category: 'app', handler() {} },
  { command: 'fixture.shell.run', category: 'app', handler() {} }
]) {
  assert.throws(() => bus.register(definition), (error) => error?.code === 'denied_command');
}
for (const definition of [
  { command: 'fixture.admin.query', category: 'admin', handler() { return { ok: true }; } },
  { command: 'wallpaper.file.open', category: 'wallpaper', handler() { return { ok: true }; } }
]) {
  bus.register(definition);
  assert.equal((await bus.execute(definition.command)).ok, true,
    `ordinary registered command ${definition.command} was not allowed by default`);
}
await assert.rejects(() => bus.execute('fixture.unknown'), (error) => error?.code === 'unsupported_command');

const capabilities = bus.capabilities();
assert.equal(capabilities.defaultPolicy, 'allow-registered');
assert.equal(capabilities.arbitraryCode, false);
assert.equal(capabilities.shell, false);
assert.ok(capabilities.deniedCategories.includes('destructive'));
assert.ok(capabilities.deniedCategories.includes('code-execution'));
assert.ok(capabilities.deniedCategories.includes('filesystem-write'));
assert.ok(capabilities.commands.some((command) => command.command === 'fixture.volume.set'));
assert.equal('handler' in capabilities.commands[0], false, 'capability catalog leaked executable handlers');
assert.equal(capabilities.total, 6);
assert.equal(capabilities.nextCursor, null);
assert.equal(bus.capabilities({ query: 'volume', limit: 1 }).commands[0].command, 'fixture.volume.set');
assert.equal(bus.capabilities({ query: 'missing' }).total, 0);

bus.register({
  command: 'playback.restart',
  category: 'playback',
  reversible: true,
  handler() {
    return {
      restarted: true,
      undo: { command: 'playback.seek.set', parameters: { seconds: 42 } }
    };
  }
});
assert.equal((await bus.execute('playback.restart')).restarted, true,
  'a media playback restart must not be mistaken for a protected system restart');
for (const command of [
  'restart', 'system.restart', 'server.restart', 'service.restart', 'app.restart',
  'client.restart', 'process.restart', 'restart.client'
]) {
  assert.throws(
    () => bus.register({ command, category: 'settings', handler() {} }),
    (error) => error?.code === 'denied_command',
    `protected lifecycle command ${command} was accepted`
  );
}

bus.register({
  command: 'playlist.item.remove',
  category: 'playback',
  handler(parameters) { return { removed: parameters.id }; }
});
assert.equal((await bus.execute('playlist.item.remove', { id: 'track-1' })).removed, 'track-1',
  'a registered ordinary remove operation must be allowed and execute directly');
bus.register({
  command: 'music.account.profile.query',
  category: 'read',
  readOnly: true,
  handler() { return { loggedIn: true }; }
});
assert.equal((await bus.execute('music.account.profile.query')).loggedIn, true,
  'a safe account query must not be rejected merely because its command contains account');

let taintedMutationCount = 0;
bus.register({
  command: 'fixture.tainted.mutation',
  category: 'settings',
  readOnly: false,
  handler() { taintedMutationCount += 1; return { applied: true }; }
});
bus.register({
  command: 'fixture.tainted.query',
  category: 'settings',
  readOnly: true,
  handler() { return { value: 42 }; }
});
const untrustedWebContext = {
  taintedByExternalContent: true,
  sourceTrust: 'untrusted-external-web',
  readOnly: true // forged payload metadata must not override the local definition
};
assert.equal(
  bus.inspect('fixture.tainted.mutation', {}, untrustedWebContext).requiresConfirmation,
  true,
  'an external-web-tainted local mutation must require confirmation'
);
await assert.rejects(
  () => bus.execute('fixture.tainted.mutation', {}, untrustedWebContext),
  (error) => error?.code === 'confirmation_required'
);
assert.equal(taintedMutationCount, 0, 'tainted mutation ran before confirmation');
await bus.execute('fixture.tainted.mutation', {}, { ...untrustedWebContext, confirmed: true });
assert.equal(taintedMutationCount, 1);
assert.equal(
  bus.inspect('fixture.tainted.query', {}, untrustedWebContext).requiresConfirmation,
  false,
  'the locally registered read-only command may remain non-mutating'
);

assert.match(html, /app-command\.js[^>]*>[\s\S]*app\.js[^>]*>[\s\S]*runtime-module-loader\.js/,
  'command bus must load before the app and the pet runtime loader');
assert.ok(loader.indexOf('pet-assistant.js') >= 0,
  'the pet runtime loader must deliver pet-assistant.js');
assert.doesNotMatch(appSource, /const\s+PET_ASSISTANT_ACTIONS\s*=\s*new Set/,
  'the old fixed pet action whitelist is still active');
assert.match(appSource, /registerPetAssistantAppCommands\(\)/);
assert.doesNotMatch(appSource, /command:\s*'community\.market\.work\.publish'[\s\S]{0,500}?requiresConfirmation:\s*true/,
  'an explicit creative work publish still requires a redundant client confirmation');
assert.doesNotMatch(appSource, /command:\s*'app\.parameters\.batch\.apply'[\s\S]{0,700}?requiresConfirmation:\s*petAssistantBatchRequiresConfirmation/,
  'structured client parameter changes still require a redundant second confirmation');
for (const command of [
  'app.context.query',
  'ui.controls.query', 'ui.control.click', 'ui.key.press',
  'pet.desktop.position.query', 'pet.desktop.position.set', 'pet.desktop.position.smart',
  'playback.automation.rule.create',
  'community.call.start',
  'community.call.accept'
]) {
  const start = appSource.indexOf(`command: '${command}'`);
  assert.ok(start >= 0, `missing app command ${command}`);
  const nextCommand = appSource.indexOf("command: '", start + 10);
  const definition = appSource.slice(start, nextCommand >= 0 ? nextCommand : start + 1_500);
  assert.doesNotMatch(definition, /requiresConfirmation:\s*true/,
    `${command} still adds a redundant local confirmation for an explicit user request`);
}
assert.match(appSource, /commands\.capabilities\(args\)/,
  'client capability discovery is not paginated');
assert.match(appSource, /petAssistantPaginate\(petAssistantPresetCatalog\(args\), args\)/,
  'dynamic preset catalogs are not paginated');
assert.match(appSource, /name === 'control_app' \|\| name === 'execute_app_command'/);
assert.match(
  appSource,
  /function\s+petAssistantCommandContext[\s\S]{0,800}automatic:\s*context\.automatic\s*===\s*true[\s\S]{0,250}proactive:\s*context\.proactive\s*===\s*true[\s\S]{0,350}operationId:/,
  'the app bridge drops automatic or operation identity before the command bus'
);
assert.match(
  appSource,
  /FeMonsterAppCommands\.inspect\([\s\S]{0,120}requestedCommand,[\s\S]{0,80}parameters,[\s\S]{0,80}petAssistantCommandContext\(/,
  'generic control_app inspection bypasses the trusted command context adapter'
);
assert.match(
  appSource,
  /FeMonsterAppCommands\.execute\([\s\S]{0,120}requestedCommand,[\s\S]{0,80}parameters,[\s\S]{0,80}petAssistantCommandContext\(/,
  'generic control_app execution bypasses the trusted command context adapter'
);
assert.match(appSource, /resolvePetAssistantRoutableCommand\(name\)/,
  'direct registered command names are not routed through the local registry');
assert.match(appSource, /FeMonsterAppCommands\.resolve\(name\)\.command/,
  'direct command routing bypasses registry resolution');
assert.match(appSource, /aliases:\s*\[[^\]]*'music\.search_and_play'[^\]]*'music\.play'/,
  'server migration song commands are not bridged into the client catalog');
assert.match(appSource, /aliases:\s*\[[^\]]*'preset\.switch'/,
  'server preset.switch command is not bridged into the client catalog');
assert.match(petSource, /FeMonsterPetActionBridge\?\.execute/);
assert.doesNotMatch(petSource, /actions\?\.includes/);
assert.match(petSource, /requestActionConfirmation\(payload, inspection/);
assert.match(
  petSource,
  /const\s+actionCommandContext\s*=\s*Object\.freeze\([\s\S]{0,500}operationId:\s*actionId[\s\S]{0,300}automatic:\s*payload\.automatic\s*===\s*true\s*\|\|\s*payload\.automaticExecutionRequested\s*===\s*true[\s\S]{0,300}proactive:\s*payload\.proactive\s*===\s*true/,
  'server tool events do not derive trusted automatic and idempotency context from the outer action payload'
);
assert.match(petSource, /\.inspect\?\.\(actionEnvelope,\s*actionCommandContext\)/,
  'server action inspection does not receive the trusted automatic context');
assert.match(petSource, /FeMonsterPetActionBridge\.execute\(actionEnvelope,\s*\{[\s\S]{0,200}\.\.\.actionCommandContext/,
  'server action execution does not receive the same automatic context used during inspection');
assert.match(petSource, /sourceTrust\s*===\s*['"]untrusted-external-web['"]/);
assert.match(petSource, /provenance\.taintedByExternalContent[\s\S]*inspection\?\.readOnly\s*!==\s*true/,
  'client provenance handling must use the local inspected readOnly definition');
assert.doesNotMatch(petSource, /payload\?*\.readOnly\s*===\s*true/,
  'server/model readOnly metadata must not bypass external-content confirmation');
assert.match(appSource, /taintedByExternalContent:\s*context\.taintedByExternalContent\s*===\s*true/);
assert.match(petSource, /compactActionResult/,
  'client action results are not kept under the server payload budget');
assert.match(petSource, /cancelAllActionConfirmations\(\)/,
  'hiding the mascot can leave confirmation promises unresolved');
assert.match(petSource, /\{ sessionId, actionId, clientRole: petClientRole\(\), cancelled: true \}/);
assert.match(petSource, /targetStreamRole === petClientRole\(\)/,
  'same-computer desktop roles must not race the originating role for one action');
assert.match(petSource, /\.\.\.\(confirmed \? \{ confirmed: true \} : \{\}\)/);
assert.ok(
  petSource.indexOf('await requestActionConfirmation(payload, inspection') < petSource.indexOf("/api/community/pet/action-claim"),
  'confirmation UI must resolve before acquiring an execution lease'
);

for (const command of [
  'app.context.query',
  'playback.play', 'playback.pause', 'playback.next', 'playback.previous',
  'playback.volume.set', 'music.search', 'music.search.play', 'music.play.similar',
  'navigation.open', 'community.page.open', 'scene.preset.set', 'lyrics.mode.set',
  'lyrics.offset.adjust', 'wallpaper.setting.set',
  'app.parameters.catalog.query', 'app.parameters.current.query', 'app.parameters.batch.apply',
  'scene.preset.catalog.query', 'scene.preset.search',
  'community.state.query', 'community.friends.query', 'community.friend.request.send',
  'community.messages.query', 'community.message.send', 'community.square.query', 'community.square.post',
  'community.market.query', 'community.market.work.publish', 'community.market.work.comment',
  'community.profile.query', 'community.mailbox.query', 'community.listen.invite',
  'server.broadcast.latest.query', 'server.update.check'
]) {
  assert.ok(appSource.includes(`command: '${command}'`), `missing app command ${command}`);
}
assert.match(appSource, /petAssistantEditSimilarity/);
assert.match(appSource, /const attempted = \[\]/,
  'parameter rollback does not include the currently failing setter');
assert.match(appSource, /restoreLocalProfileState/,
  'profile mutations are not rolled back when the server write fails');
assert.match(appSource, /petAssistantCommunityFriendRequestSummary/,
  'friend queries still expose unbounded raw request records');
assert.match(appSource, /\['range', 'number', 'checkbox', 'color'\]/,
  'number inputs are missing from the real parameter catalog');
assert.match(appSource, /PET_MUSIC_ALIASES/);
assert.match(appSource, /request\.title && request\.artist/);
assert.match(appSource, /(?:类似\|相似\|similar)/);
assert.doesNotMatch(`${commandSource}\n${appSource}\n${petSource}`, /\beval\s*\(|new Function\s*\(/);
assert.doesNotMatch(commandSource, /querySelector|getElementById|\.click\s*\(/,
  'generic command bus must not expose arbitrary DOM clicking');

console.log(JSON.stringify({
  ok: true,
  catalogCommands: capabilities.commands.length,
  centralizedDenyCategories: capabilities.deniedCategories,
  controlledSocial: true,
  dynamicConfirmation: true,
  genericEnvelope: 'control_app',
  legacyActionSet: false
}, null, 2));
