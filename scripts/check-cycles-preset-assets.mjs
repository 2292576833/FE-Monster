import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function pngSize(filePath) {
  const data = readFileSync(filePath);
  assert.equal(data.subarray(1, 4).toString('ascii'), 'PNG', `${filePath} must be a PNG`);
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}

const targets = [
  {
    id: 'storm-ocean',
    runtime: path.join(root, 'web', 'storm-ocean-runtime.js'),
    marker: 'cyclesEnvironmentDiagnostics',
    runtimeUsesOutput: true
  },
  {
    id: 'void-prism',
    runtime: path.join(root, 'web', 'void-prism-runtime.js'),
    marker: 'cyclesEnvironmentReady',
    runtimeUsesOutput: false
  }
];

const results = targets.map(({ id, runtime, marker, runtimeUsesOutput }) => {
  const directory = path.join(root, 'web', 'assets', 'cycles', id);
  const manifestPath = path.join(directory, 'cycles-render.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const imagePath = path.join(directory, manifest.output.file);
  const sourcePath = path.join(root, ...manifest.sourceBlend.split('/'));
  const runtimeSource = readFileSync(runtime, 'utf8');

  assert.equal(manifest.schema, 'fe-monster.cycles-render/v1');
  assert.equal(manifest.preset, id);
  assert.equal(manifest.renderer.engine, 'CYCLES');
  assert.equal(manifest.renderer.deviceBackend, 'HIP');
  assert.equal(manifest.renderer.samples, 64);
  assert.deepEqual(manifest.renderer.resolution, [2048, 1024]);
  assert.equal(manifest.runtime.usesCyclesOutput, runtimeUsesOutput);
  assert.equal(manifest.runtime.usesCyclesAuthoringReference, true);
  assert.equal(manifest.runtime.keepsAudioReactiveInteraction, true);
  assert.equal(
    manifest.output.role,
    runtimeUsesOutput ? 'realtime-reflection-environment' : 'authoring-reference-environment'
  );
  assert.ok(!manifest.sourceBlend.startsWith('web/'), 'Cycles source blend must stay out of packaged web assets');
  assert.ok(existsSync(sourcePath), `${id} Cycles source blend is missing`);
  assert.deepEqual(pngSize(imagePath), [2048, 1024]);
  assert.equal(sha256(imagePath), manifest.output.sha256);
  if (runtimeUsesOutput) {
    assert.ok(runtimeSource.includes(manifest.output.file), `${id} runtime does not load the Cycles output`);
  } else {
    assert.ok(!runtimeSource.includes(manifest.output.file), `${id} runtime must not load the authoring-only Cycles output`);
    assert.ok(
      runtimeSource.includes("cyclesEnvironmentMapping: 'disabled-for-lyric-only-reflection'"),
      `${id} runtime must preserve lyric-only reflection`
    );
    assert.ok(runtimeSource.includes('usesCyclesAuthoringReference: true'));
  }
  assert.ok(runtimeSource.includes(marker), `${id} runtime diagnostics marker is missing`);

  return {
    preset: id,
    engine: manifest.renderer.engine,
    device: `${manifest.renderer.deviceBackend}:${manifest.renderer.deviceName}`,
    samples: manifest.renderer.samples,
    resolution: manifest.renderer.resolution,
    sha256: manifest.output.sha256
  };
});

console.log(JSON.stringify({ pass: true, results }, null, 2));
