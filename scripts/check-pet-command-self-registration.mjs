import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const busSource = read('web/app-command.js');
const petSource = read('web/pet-assistant.js');
const events = [];
const host = { dispatchEvent: (event) => events.push(event) };
const sandbox = vm.createContext({
  window: host, console,
  CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  boundedString: (value, max = 1000, fallback = '') => String(value ?? fallback).slice(0, max).trim()
});
vm.runInContext(busSource, sandbox);
const bus = host.FeMonsterAppCommands;
const toolStart = petSource.indexOf('let petAiToolCommandMap = {}');
const toolEnd = petSource.indexOf('async function requestCustomAiReply', toolStart);
assert.ok(toolStart >= 0 && toolEnd > toolStart);
vm.runInContext(petSource.slice(toolStart, toolEnd), sandbox);
const tools = () => sandbox.clientAiServiceToolDefinitions();
const names = (definitions = tools()) => definitions.find((tool) => tool.function.name === 'control_app')
  ?.function.parameters.properties.command.enum || [];
assert.equal(names().length, 0, 'empty startup must not advertise imaginary operations');
bus.installCustomCommands();
const installedCount = bus.catalog().length;
bus.installCustomCommands();
assert.equal(bus.catalog().length, installedCount, 'reinitialization duplicated commands');
const effects = [];
const volumes = [];
bus.registerMany([
  { command: 'playback.state.query', readOnly: true, handler: () => ({ playing: true }) },
  { command: 'playback.volume.set', parameters: { volume: 'number' }, requiredParameterGroups: [['volume']],
    reversible: true, automaticAllowed: true,
    handler: (args, context) => {
      effects.push(['volume', args.volume]); volumes.push(context.operationId);
      return { changed: true, volume: args.volume,
        undo: { command: 'playback.volume.set', parameters: { volume: 20 } } };
    } },
  { command: 'lyrics.visible.set', parameters: { enabled: 'boolean' }, requiredParameterGroups: [['enabled']],
    handler: (args) => { effects.push(['lyrics', args.enabled]); return { ok: true }; } },
  { command: 'wallpaper.apply', requiresConfirmation: true,
    handler: () => { effects.push(['wallpaper']); return { ok: true }; } },
  { command: 'fixture.fail', handler: () => ({ ok: false, error: 'fixture failure' }) },
  { command: 'community.messages.query', aliases: ['inbox.peek'], readOnly: true,
    handler: () => { throw new Error('private handler must never execute'); } }
]);
host.FeMonsterPetActionBridge = {
  inspect: (envelope, context) => bus.inspect(envelope.arguments.command, envelope.arguments.arguments, context),
  execute: (envelope, context) => bus.execute(envelope.arguments.command, envelope.arguments.arguments, context)
};
const initialTools = tools();
assert.ok(names(initialTools).includes('app.commands.register'));
assert.ok(!names().includes('community.messages.query'));
const recipe = {
  command: 'pet.custom.quiet', title: '安静听歌',
  steps: [{ command: 'playback.volume.set', arguments: { volume: 15 } },
    { command: 'lyrics.visible.set', arguments: { enabled: true } }]
};
const beforeManifest = bus.manifestSummary();
const created = await sandbox.executeLocalPetCommand('control_app', JSON.stringify({
  command: 'app.commands.register', arguments: recipe
}), { automatic: true, operationId: 'register-quiet' });
assert.equal(created.changed, true);
assert.equal(effects.length, 0, 'registration executed the recipe');
assert.equal(created.undo.command, 'app.commands.unregister');
assert.ok(names().includes(recipe.command), 'next model round missed the new command');
assert.ok(!names(initialTools).includes(recipe.command), 'registration mutated an in-flight tool schema');
assert.notEqual(beforeManifest.catalogRevision, bus.manifestSummary().catalogRevision);
const repeat = await bus.execute('app.commands.register', recipe);
assert.equal(repeat.changed, false, 'same recipe should be idempotent');
await assert.rejects(bus.execute('app.commands.register', {
  ...recipe, steps: [{ command: 'playback.volume.set', arguments: { volume: 5 } }]
}), { code: 'custom_command_conflict' });
await assert.rejects(bus.execute(recipe.command, {}, { automatic: true, operationId: 'auto-quiet' }),
  { code: 'automatic_not_allowed' });
const ran = await sandbox.executeLocalPetCommand('control_app', JSON.stringify({ command: recipe.command }),
  { operationId: 'run-quiet' });
assert.equal(ran.completedSteps, 2);
assert.deepEqual(effects, [['volume', 15], ['lyrics', true]]);
await bus.execute(recipe.command, {}, { operationId: 'run-quiet' });
assert.equal(effects.length, 2, 'replayed operation executed twice');
assert.match(volumes[0], /^recipe:[a-f0-9]{64}$/);
for (const command of ['community.messages.query', 'inbox.peek', 'app.commands.register', recipe.command]) {
  await assert.rejects(bus.execute('app.commands.register', {
    command: 'pet.custom.unsafe', steps: [{ command }]
  }), { code: 'unsafe_custom_step' });
}
await assert.rejects(sandbox.executeLocalPetCommand('control_app', JSON.stringify({ command: 'inbox.peek' })),
  /私密/);
for (const command of ['playback.volume.set', 'pet.custom.shell.run']) {
  await assert.rejects(bus.execute('app.commands.register', {
    command, steps: [{ command: 'playback.state.query' }]
  }));
}
await assert.rejects(bus.execute('app.commands.register', {
  command: 'pet.custom.missing', steps: [{ command: 'playback.volume.set' }]
}), { code: 'missing_parameters' });
await assert.rejects(bus.execute('app.commands.register', {
  command: 'pet.custom.boolean', steps: [{ command: 'lyrics.visible.set', arguments: { enabled: 'false' } }]
}), { code: 'invalid_parameter_type' });
await assert.rejects(bus.execute('app.commands.register', {
  command: 'pet.custom.forged', steps: [{ command: 'wallpaper.apply', arguments: { confirmed: true } }]
}), { code: 'invalid_custom_arguments' });
await assert.rejects(bus.execute('app.commands.register', {
  command: 'pet.custom.many', steps: Array.from({ length: 9 }, () => ({ command: 'playback.state.query' }))
}), { code: 'invalid_custom_steps' });
await bus.execute('app.commands.register', {
  command: 'pet.custom.confirmed', steps: [...recipe.steps, { command: 'wallpaper.apply' }]
});
const beforeConfirmation = effects.length;
assert.equal(bus.inspect('pet.custom.confirmed').requiresConfirmation, true);
await assert.rejects(bus.execute('pet.custom.confirmed'), { code: 'confirmation_required' });
assert.equal(effects.length, beforeConfirmation, 'an early step ran before confirmation');
await bus.execute('pet.custom.confirmed', {}, { confirmed: true });
assert.equal(effects.length, beforeConfirmation + 3);
await assert.rejects(bus.execute(recipe.command, {}, { taintedByExternalContent: true }),
  { code: 'confirmation_required' });
await bus.execute('app.commands.register', {
  command: 'pet.custom.partial', steps: [recipe.steps[0], { command: 'fixture.fail' }, recipe.steps[1]]
});
const beforePartial = effects.length;
const partial = await bus.execute('pet.custom.partial');
assert.equal(partial.ok, false);
assert.equal(partial.completedSteps, 1);
assert.equal(effects.length, beforePartial + 1, 'recipe continued after a failed step');
await bus.execute('app.commands.register', {
  command: 'pet.custom.status', steps: [{ command: 'playback.state.query' }]
});
assert.equal((await bus.execute('pet.custom.status', {}, { automatic: true })).ok, true);
const inventory = await bus.execute('app.commands.custom.query');
assert.equal(inventory.persistence, 'session');
assert.equal(inventory.commands[0].stepCount, 2);
const recipeDetails = await bus.execute('app.commands.custom.query', { command: recipe.command });
assert.equal(recipeDetails.steps[0].arguments.volume, 15);
await assert.rejects(bus.execute('app.commands.unregister', {
  command: recipe.command, recipeRevision: 'wrong'
}), { code: 'custom_command_changed' });
await bus.execute(created.undo.command, created.undo.parameters);
assert.ok(!names().includes(recipe.command), 'removed recipe remained registered with the model');
await assert.rejects(bus.execute(recipe.command), { code: 'unsupported_command' });
const replacement = await bus.execute('app.commands.register', {
  ...recipe, steps: [{ command: 'playback.volume.set', arguments: { volume: 5 } }]
});
assert.notEqual(created.command.recipeRevision, replacement.command.recipeRevision);
await assert.rejects(bus.execute(created.undo.command, created.undo.parameters), { code: 'custom_command_changed' });
const replacedRun = await bus.execute(recipe.command, {}, { operationId: 'run-quiet' });
assert.equal(replacedRun.completedSteps, 1, 'removed recipe left a stale execution receipt');
assert.equal(effects.at(-1)[1], 5);
bus.register({ command: 'fixture.batch', parameters: { changes: 'array' }, requiredParameterGroups: [['changes']],
  handler: (args) => ({ ok: true, changes: args.changes }) });
const nested = { command: 'pet.custom.batch', steps: [{ command: 'fixture.batch',
  arguments: { changes: [{ key: 'lyrics.scale', value: 1.25 }] } }] };
const nestedRegistration = await bus.execute('app.commands.register', nested);
assert.equal(nestedRegistration.recipe.steps[0].arguments.changes[0].value, 1.25,
  'registration silently truncated nested batch arguments');
const nestedDetails = await bus.execute('app.commands.custom.query', { command: nested.command });
assert.equal(nestedDetails.steps[0].arguments.changes[0].value, 1.25);
let release;
const gate = new Promise((resolve) => { release = resolve; });
bus.register({ command: 'fixture.wait', handler: async () => { await gate; return { ok: true }; } });
const waiting = await bus.execute('app.commands.register', {
  command: 'pet.custom.wait', steps: [{ command: 'fixture.wait' }]
});
const running = bus.execute('pet.custom.wait', {}, { operationId: 'running' });
try {
  await assert.rejects(bus.execute(waiting.undo.command, waiting.undo.parameters), { code: 'custom_command_busy' });
} finally {
  release();
  await running;
}
await bus.execute(waiting.undo.command, waiting.undo.parameters);
const currentCount = (await bus.execute('app.commands.custom.query')).total;
for (let index = currentCount; index < 32; index += 1) {
  await bus.execute('app.commands.register', {
    command: `pet.custom.quota-${index}`, steps: [{ command: 'playback.state.query' }]
  });
}
await assert.rejects(bus.execute('app.commands.register', {
  command: 'pet.custom.over-quota', steps: [{ command: 'playback.state.query' }]
}), { code: 'custom_command_limit' });
assert.match(read('web/app.js'), /registerPetAssistantAppCommands\(\);\s*window\.FeMonsterAppCommands\.installCustomCommands\(\)/);
assert.match(petSource, /for \(let round = 0; round < 4; round \+= 1\)[\s\S]*?tools = clientAiServiceToolDefinitions\(\);[\s\S]*?requestClientAiChatRound/);
assert.ok(events.some((event) => event.type === 'fe-monster-app-command-catalog-change'));
console.log(JSON.stringify({ ok: true, selfRegistration: true, noExecutionOnRegistration: true,
  dynamicModelTools: true, idempotent: true, permissionsPreserved: true, aliasesProtected: true,
  safeRemoval: true, partialFailuresReported: true }));
