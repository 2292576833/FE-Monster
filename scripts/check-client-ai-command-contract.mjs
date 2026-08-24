import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const helperStart = appSource.indexOf('async function clientAiCommandService()');
const helperEnd = appSource.indexOf('async function saveRuntimeSettings()', helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'client AI command helpers are not inspectable');

const saves = [];
const current = {
  ttsMode: 'custom',
  tts: {
    provider: 'volcengine-doubao-tts-v3',
    output: { format: 'mp3', sampleRate: 24000, bitRate: 128000 },
  },
};
const service = {
  ready: async () => {},
  provider: () => ({ id: 'volcengine-doubao-tts-v3', kind: 'tts', implementationStatus: 'ready' }),
  load: () => structuredClone(current),
  save: async (patch) => {
    saves.push(structuredClone(patch));
    return { tts: { ...current.tts, ...patch.tts } };
  },
};
const sandbox = {
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  console,
  window: { FeMonsterClientAiService: service },
};
vm.runInContext(appSource.slice(helperStart, helperEnd), vm.createContext(sandbox), {
  filename: 'web/app.js#client-ai-command-helpers',
});

const failures = [];
async function check(name, action) {
  try {
    await action();
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
  }
}

await check('non-MP3 output clears MP3-only bitrate', async () => {
  saves.length = 0;
  await sandbox.clientAiCommandTtsOutputSet({ format: 'pcm' });
  assert.equal(saves.at(-1)?.tts?.output?.bitRate, 0,
    'PCM/Ogg must send bitRate=0 instead of retaining the previous MP3 bitrate');
});

await check('MP3 bitrate is constrained to the Java contract', async () => {
  saves.length = 0;
  await sandbox.clientAiCommandTtsOutputSet({ format: 'mp3', bitRate: 320000 });
  assert.equal(saves.at(-1)?.tts?.output?.bitRate, 160000,
    'MP3 bitrate must not exceed DoubaoV3Config.AudioOutput max 160000');
});

await check('unsupported sample rates fail before persistence', async () => {
  saves.length = 0;
  await assert.rejects(
    sandbox.clientAiCommandTtsOutputSet({ sampleRate: 12000 }),
    /采样率|sample/i,
    'sample rates outside the Java enum were forwarded to persistence',
  );
  assert.equal(saves.length, 0, 'invalid sample rate reached service.save');
});

await check('public command metadata matches the typed provider limits', async () => {
  const start = appSource.indexOf("command: 'ai.tts.output.set'");
  const end = appSource.indexOf("command: 'scene.preset.catalog.query'", start);
  assert.ok(start >= 0 && end > start, 'ai.tts.output.set definition is not inspectable');
  const definition = appSource.slice(start, end);
  assert.doesNotMatch(definition, /320000/, 'command catalog advertises a bitrate Java will reject');
  assert.match(definition, /160000/, 'command catalog omits the maximum supported MP3 bitrate');
});

if (failures.length) {
  throw new assert.AssertionError({
    message: `client AI command contract failures:\n- ${failures.join('\n- ')}`,
  });
}

console.log(JSON.stringify({
  ok: true,
  nonMp3Bitrate: true,
  mp3BitrateRange: true,
  sampleRateEnum: true,
  publicMetadata: true,
}, null, 2));
