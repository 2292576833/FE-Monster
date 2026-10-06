import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const html = readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const mixer = readFileSync(path.join(root, 'web', 'audio-mixer-ui.js'), 'utf8');

function elementSource(id) {
  const marker = `id="${id}"`;
  const index = html.indexOf(marker);
  assert.notEqual(index, -1, `missing settings control ${id}`);
  const start = html.lastIndexOf('<', index);
  const end = html.indexOf('>', index);
  assert.ok(start >= 0 && end > index, `cannot read settings control ${id}`);
  return html.slice(start, end + 1);
}

const manualBoundaries = {
  aiServiceModelBaseUrl: 'manual-external-endpoint',
  aiServiceModelApiKey: 'manual-credential',
  aiServiceTtsAppId: 'manual-credential',
  aiServiceTtsAccessKey: 'manual-credential',
  aiServiceTtsBaseUrl: 'manual-external-endpoint',
  aiServiceTtsApiKey: 'manual-credential',
  cursorImportInput: 'manual-file-picker',
};

const delegatedControls = {
  petAssistantVoiceSelect: 'pet.voice.select',
  aiServiceModelName: 'ai.model.select',
  aiServiceTtsModel: 'ai.tts.provider.select',
  aiServiceTtsVoice: 'ai.tts.voice.select',
  aiServiceTtsEmotion: 'ai.tts.prosody.set',
};

for (const [id, reason] of Object.entries(manualBoundaries)) {
  assert.match(elementSource(id), new RegExp(`data-pet-parameter-ignore-reason="${reason}"`),
    `${id} has no explicit manual boundary`);
}

for (const [id, command] of Object.entries(delegatedControls)) {
  assert.match(elementSource(id), new RegExp(`data-pet-parameter-ignore-reason="command:${command.replaceAll('.', '\\.')}"`),
    `${id} is not delegated to ${command}`);
  assert.ok(app.includes(`command: '${command}'`), `${command} is not registered`);
}

assert.match(elementSource('aiServiceTtsEnabledToggle'), /data-pet-parameter-key="ai\.tts\.enabled"/,
  'the button-backed TTS setting has no stable parameter key');
assert.match(app, /const roleSwitch = tag === 'button'/,
  'button-backed switches are not supported by the parameter registry adapter');
assert.match(app, /command: 'app\.parameters\.coverage\.query'/,
  'the parameter coverage audit is not exposed to the pet');
assert.match(app, /coverage\.missing\.push\(\{ id, reason: 'unregistered-setting-control' \}\)/,
  'unregistered settings are not reported as coverage failures');
assert.match(app, /window\.FeMonsterParameters\.replaceOwner\('pet-assistant-runtime'/,
  'runtime parameters do not replace their registry owner atomically');
assert.match(mixer, /const parameterKey = `audio\.channel\.\$\{String\(channelId\)\.toLowerCase\(\)\}\.\$\{parameterSlug\(definition\.key\)\}`/,
  'dynamic channel controls do not receive stable parameter keys');
assert.match(mixer, /petParameterIgnoreReason: 'mirrored-number-input'/,
  'mirrored mixer inputs are not explicitly classified');

console.log(JSON.stringify({
  ok: true,
  manualBoundaries: Object.keys(manualBoundaries).length,
  delegatedControls: Object.keys(delegatedControls).length,
  dynamicMixerMetadata: true,
  runtimeCoverageCommand: true,
}, null, 2));
