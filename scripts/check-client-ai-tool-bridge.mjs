import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const petSource = fs.readFileSync(path.join(root, 'web', 'pet-assistant.js'), 'utf8');
const commandBusSource = fs.readFileSync(path.join(root, 'web', 'app-command.js'), 'utf8');

const petToolsStart = petSource.indexOf('let petAiToolCommandMap = {}');
const petToolsEnd = petSource.indexOf('async function requestCustomAiReply', petToolsStart);
assert.ok(petToolsStart >= 0 && petToolsEnd > petToolsStart, 'local AI tool bridge is not inspectable');

const events = [];
const sandbox = {
  CustomEvent: class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
  },
  Date,
  JSON,
  Map,
  Math,
  Object,
  Set,
  console,
  boundedString: (value, max = 1000, fallback = '') => String(value ?? fallback).slice(0, max).trim(),
  window: { dispatchEvent: (event) => events.push(event) },
};
sandbox.window.window = sandbox.window;
const context = vm.createContext(sandbox);
vm.runInContext(commandBusSource, context, { filename: 'web/app-command.js' });

const executions = [];
let privateExecutions = 0;
let catalogConfirmationExecutions = 0;
const bridgeCalls = [];
const definitions = [{
  command: 'app.capabilities.query',
  category: 'read',
  readOnly: true,
  title: '读取可用程序命令',
  description: '分页读取当前注册的真实客户端命令目录。',
  parameters: { query: 'string?', cursor: 'number?', limit: 'number 1..20?' },
  handler: (args) => sandbox.window.FeMonsterAppCommands.capabilities(args),
}];
for (let index = 0; index < 60; index += 1) {
  definitions.push({
    command: `playback.fixture.${index}`,
    category: 'playback',
    title: `playback ${index}`,
    description: `playback fixture ${index}`,
    parameters: { value: 'string?' },
    handler: async (args) => {
      executions.push({ command: `playback.fixture.${index}`, args });
      return { ok: true, index, args };
    },
  });
}
definitions.push({
  command: 'community.messages.query',
  category: 'community',
  readOnly: true,
  title: '读取私密社区消息',
  description: '仅供受信任客户端 UI 使用。',
  handler: async () => {
    privateExecutions += 1;
    return { messages: [{ text: 'private fixture' }] };
  },
});
definitions.push({
  command: 'care.comfort.play',
  category: 'care',
  title: '播放低风险安慰音乐',
  description: '直接执行可逆的本地关怀动作。',
  reversible: true,
  automaticAllowed: true,
  handler: async () => {
    executions.push({ command: 'care.comfort.play', args: {} });
    return {
      ok: true,
      undo: { command: 'playback.fixture.0', parameters: { value: 'previous' } },
    };
  },
});
definitions.push({
  command: 'wallpaper.fixture.confirmed',
  category: 'wallpaper',
  title: '需要确认的动作',
  description: 'fixture',
  requiresConfirmation: true,
  handler: async () => ({ ok: true }),
});
definitions.push({
  command: 'ai.tts.voice.select',
  category: 'ai',
  title: '目录要求确认的音色切换',
  description: '确认策略必须只由共享命令目录决定。',
  requiresConfirmation: true,
  parameters: { voice: 'string' },
  handler: async () => {
    catalogConfirmationExecutions += 1;
    return { ok: true };
  },
});
sandbox.window.FeMonsterAppCommands.registerMany(definitions);

sandbox.window.FeMonsterPetActionBridge = {
  inspect(envelope, provenance = {}) {
    bridgeCalls.push({ phase: 'inspect', envelope, provenance });
    if (envelope.name === 'query_app_capabilities') {
      return sandbox.window.FeMonsterAppCommands.inspect(
        'app.capabilities.query', envelope.arguments, provenance,
      );
    }
    if (envelope.name === 'control_app') {
      return sandbox.window.FeMonsterAppCommands.inspect(
        envelope.arguments.command, envelope.arguments.arguments, provenance,
      );
    }
    throw new Error('unsupported envelope');
  },
  execute(envelope, provenance = {}) {
    bridgeCalls.push({ phase: 'execute', envelope, provenance });
    if (envelope.name === 'query_app_capabilities') {
      return sandbox.window.FeMonsterAppCommands.execute(
        'app.capabilities.query', envelope.arguments, provenance,
      );
    }
    if (envelope.name === 'control_app') {
      return sandbox.window.FeMonsterAppCommands.execute(
        envelope.arguments.command, envelope.arguments.arguments, provenance,
      );
    }
    throw new Error('unsupported envelope');
  },
};

vm.runInContext(petSource.slice(petToolsStart, petToolsEnd), context, {
  filename: 'web/pet-assistant.js#client-ai-tool-bridge',
});

const tools = sandbox.clientAiServiceToolDefinitions();
assert.deepEqual([...tools].map((item) => item.function.name), [
  'query_app_capabilities',
  'control_app',
  'fe_affect_plan',
], 'local model still receives a truncated list of one-tool-per-command definitions');
const controlTool = tools.find((item) => item.function.name === 'control_app');
assert.equal(controlTool.function.parameters.properties.arguments.type, 'object',
  'control_app arguments are not a structured object');
assert.deepEqual([...controlTool.function.parameters.required], ['command']);

const discovered = await sandbox.executeLocalPetCommand('query_app_capabilities', JSON.stringify({
  query: 'fixture.59',
  limit: 20,
}));
assert.equal(discovered.total, 1, 'capabilities query did not use the real registered command directory');
assert.equal(discovered.commands[0].command, 'playback.fixture.59');

const controlled = await sandbox.executeLocalPetCommand('control_app', JSON.stringify({
  command: 'playback.fixture.59',
  arguments: {
    value: '真实执行',
    apiKey: 'sk-should-never-reach-handler',
    authorization: 'Bearer should-never-reach-handler',
  },
}));
assert.equal(controlled.index, 59, 'a command beyond the old 40-tool cutoff did not execute');
assert.equal(executions.at(-1).args.value, '真实执行');
assert.equal(Object.hasOwn(executions.at(-1).args, 'apiKey'), false,
  'model-supplied API key reached a local command handler');
assert.equal(Object.hasOwn(executions.at(-1).args, 'authorization'), false,
  'model-supplied authorization reached a local command handler');

const bridgeCallsBeforePrivateQuery = bridgeCalls.length;
await assert.rejects(
  sandbox.executeLocalPetCommand('control_app', JSON.stringify({
    command: 'community.messages.query', arguments: {},
  })),
  /私密|敏感|拒绝|private|sensitive/i,
  'an external custom model received private community messages',
);
assert.equal(bridgeCalls.length, bridgeCallsBeforePrivateQuery,
  'private read command reached bridge.inspect/execute before being denied');
assert.equal(privateExecutions, 0, 'private read command reached its registered handler');

await sandbox.executeLocalPetCommand('control_app', JSON.stringify({
  command: 'care.comfort.play',
  arguments: { proactive: true, automatic: true, operationId: 'care-fixture-1' },
}), {
  proactive: true,
  automatic: true,
  operationId: 'care-fixture-1',
});
assert.equal(executions.at(-1).command, 'care.comfort.play',
  'low-risk registered care command did not execute directly');

await assert.rejects(
  sandbox.executeLocalPetCommand('control_app', JSON.stringify({
    command: 'totally.unknown.command', arguments: {},
  })),
  /不支持|unknown|unsupported/i,
  'unknown model command bypassed the registered command bus',
);
await assert.rejects(
  sandbox.executeLocalPetCommand('control_app', JSON.stringify({
    command: 'wallpaper.fixture.confirmed', arguments: {},
  })),
  /确认/,
  'confirmation-gated action executed without user confirmation',
);
await assert.rejects(
  sandbox.executeLocalPetCommand('control_app', JSON.stringify({
    command: 'ai.tts.voice.select', arguments: { voice: 'fixture-voice' },
  })),
  /确认/,
  'a hardcoded local-model exception overrode the shared catalog confirmation policy',
);
assert.equal(catalogConfirmationExecutions, 0,
  'a catalog-confirmed command reached its handler without user confirmation');
await assert.rejects(
  sandbox.executeLocalPetCommand('filesystem.delete', '{}'),
  /未授权|unsupported|不支持/,
  'an arbitrary tool name bypassed the deep local tool protocol',
);

assert.ok(events.some((event) => event.type === 'fe-monster-app-command-complete'),
  'control_app did not complete through the real command bus');

console.log(JSON.stringify({
  ok: true,
  deepToolCount: tools.length,
  fullCatalogDiscovery: true,
  commandBeyondOldCutoffExecuted: true,
  lowRiskCareExecuted: true,
  unknownToolDenied: true,
  confirmationPreserved: true,
  credentialsIgnored: true,
  privateReadsDeniedBeforeBridge: true,
}, null, 2));
