import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const EXPECTED_BACKEND = 'google-obr-official';
const EXPECTED_REVISION = '478dc7c752d5eccae534635139ff0253eee3a14a';
const FRAME_COUNT = 128;
const SAMPLE_RATE = 48_000;
const BLOCK_COUNT = 240;

const projectRoot = new URL('../', import.meta.url);
const vendorRoot = new URL('web/vendor/google-obr/', projectRoot);
const moduleUrl = new URL('obr-official.js', vendorRoot);

const [moduleStat, revision, license, patents, abseilLicense, eigenLicense, pffftLicense] = await Promise.all([
  stat(moduleUrl),
  readFile(new URL('REVISION', vendorRoot), 'utf8'),
  readFile(new URL('LICENSE', vendorRoot), 'utf8'),
  readFile(new URL('PATENTS', vendorRoot), 'utf8'),
  readFile(new URL('ABSEIL-LICENSE', vendorRoot), 'utf8'),
  readFile(new URL('EIGEN-COPYING.MPL2', vendorRoot), 'utf8'),
  readFile(new URL('PFFFT-LICENSE', vendorRoot), 'utf8')
]);

assert.ok(moduleStat.size > 1_000_000, 'The embedded official OBR runtime is missing or unexpectedly small.');
assert.equal(revision.trim(), EXPECTED_REVISION, 'The shipped OBR revision is not the pinned official revision.');
assert.match(license, /Copyright \(c\) 2025 Google LLC/i, 'The official OBR license was not shipped.');
assert.match(license, /Redistribution and use in source and binary forms/i, 'The OBR redistribution terms are incomplete.');
assert.match(patents, /Open Binaural Renderer Patent License/i, 'The official OBR patent license was not shipped.');
assert.match(abseilLicense, /Apache License[\s\S]*Version 2\.0/i, 'The Abseil license was not shipped.');
assert.match(eigenLicense, /Mozilla Public License[\s\S]*2\.0/i, 'The Eigen license was not shipped.');
assert.match(pffftLicense, /Julien Pommier[\s\S]*University Corporation for Atmospheric Research/i, 'The PFFFT license was not shipped.');

const importUrl = `${moduleUrl.href}?runtime-probe=${Date.now()}`;
const { default: createOfficialObrModule } = await import(importUrl);
const module = await createOfficialObrModule({ noInitialRun: true });

assert.equal(
  module.UTF8ToString(module._obr_backend_name()),
  EXPECTED_BACKEND,
  'The loaded runtime did not identify as the official Google OBR backend.'
);
assert.equal(
  module.UTF8ToString(module._obr_source_revision()),
  EXPECTED_REVISION,
  'The loaded runtime reported a different OBR source revision.'
);
assert.ok(module.HEAPF32 instanceof Float32Array, 'The live OBR WebAssembly float heap is not exposed.');

const renderer = module._obr_create(FRAME_COUNT, SAMPLE_RATE, 1);
assert.ok(renderer, 'The official Google OBR stereo renderer did not initialize.');
assert.equal(module._obr_is_ready(renderer), 1, 'The official Google OBR renderer is not ready.');
assert.equal(module._obr_frame_count(renderer), FRAME_COUNT, 'The renderer block size is incorrect.');

const inputLeft = module._obr_input_channel(renderer, 0) >>> 2;
const inputRight = module._obr_input_channel(renderer, 1) >>> 2;
const outputLeft = module._obr_output_channel(renderer, 0) >>> 2;
const outputRight = module._obr_output_channel(renderer, 1) >>> 2;
assert.ok(inputLeft && inputRight && outputLeft && outputRight, 'The OBR PCM channel pointers are unavailable.');

let inputEnergy = 0;
let outputEnergy = 0;
let outputPeak = 0;
let outputIsFinite = true;
let sampleCursor = 0;

try {
  for (let block = 0; block < BLOCK_COUNT; block += 1) {
    for (let frame = 0; frame < FRAME_COUNT; frame += 1, sampleCursor += 1) {
      const left = 0.22 * Math.sin((2 * Math.PI * 220 * sampleCursor) / SAMPLE_RATE);
      const right = 0.16 * Math.sin((2 * Math.PI * 330 * sampleCursor) / SAMPLE_RATE);
      module.HEAPF32[inputLeft + frame] = left;
      module.HEAPF32[inputRight + frame] = right;
      inputEnergy += left * left + right * right;
    }

    assert.equal(module._obr_process(renderer), 1, `Official OBR processing failed at block ${block}.`);
    for (let frame = 0; frame < FRAME_COUNT; frame += 1) {
      const left = module.HEAPF32[outputLeft + frame];
      const right = module.HEAPF32[outputRight + frame];
      outputIsFinite &&= Number.isFinite(left) && Number.isFinite(right);
      outputEnergy += left * left + right * right;
      outputPeak = Math.max(outputPeak, Math.abs(left), Math.abs(right));
    }
  }
} finally {
  module._obr_destroy(renderer);
}

assert.equal(outputIsFinite, true, 'Official OBR produced a non-finite PCM sample.');
assert.ok(outputEnergy > 0, 'Official OBR did not produce PCM output.');

const sampleCount = BLOCK_COUNT * FRAME_COUNT * 2;
const result = {
  backend: EXPECTED_BACKEND,
  revision: EXPECTED_REVISION,
  frameCount: FRAME_COUNT,
  processedBlocks: BLOCK_COUNT,
  inputRms: Math.sqrt(inputEnergy / sampleCount),
  outputRms: Math.sqrt(outputEnergy / sampleCount),
  outputPeak
};

console.log(`Google OBR official runtime PASS ${JSON.stringify(result)}`);
