import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), 'utf8');

const pipeline = read('native', 'windows', 'audio', 'fe_audio_pipeline.cpp');
const jni = read('native', 'windows', 'fe_monster_xaudio2.cpp');
const java = read('src', 'main', 'java', 'com', 'femonster', 'core', 'NativeAudioEngine.java');
const routes = read('src', 'main', 'java', 'com', 'femonster', 'api', 'ApiRoutes.java');
const worklet = read('web', 'vendor', 'native-spatial', 'native-pcm-worklet.js');
const rust = read('native', 'rust-audio-upmix', 'src', 'lib.rs');

const functionBlock = (source, name) => {
  const start = source.indexOf(name);
  if (start < 0) return '';
  const bodyStart = source.indexOf('{', start);
  if (bodyStart < 0) return '';
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return '';
};

const submit = functionBlock(pipeline, 'HRESULT Submit(');
const queue = functionBlock(pipeline, 'HRESULT QueueRenderedBlock(');
const stream = functionBlock(routes, 'private void handleNativeSpatialStream(');

assert.match(
  worklet,
  /FE_NATIVE_PCM_(?:TRANSPORT|BLOCK)_FRAMES\s*=\s*4096/,
  'AudioWorklet should batch 4096 frames at the JS/Java transport boundary.'
);
assert.match(routes, /ByteBuffer\s*\.\s*allocateDirect\s*\(/, 'Native PCM upload should reuse direct memory.');
assert.match(routes, /Channels\.newChannel\s*\(/, 'PCM request body should stream directly into the direct buffer.');
assert.doesNotMatch(stream, /new\s+float\s*\[/, 'The PCM stream loop must not allocate a float[] per block.');
assert.doesNotMatch(stream, /ByteBuffer\.wrap\s*\(/, 'The PCM stream loop must not wrap/copy each block.');
assert.match(java, /submitSpatialPcm\s*\([^)]*ByteBuffer/, 'Java/native bridge should accept a direct ByteBuffer.');
assert.match(jni, /GetDirectBufferAddress\s*\(/, 'JNI should use the direct buffer address without array pin/copy.');
assert.match(jni, /nativeSubmitSpatialPcmDirect/, 'JNI should expose a dedicated direct-buffer submit entry point.');
assert.match(jni, /LowFrequencyAnalysisKernel/, 'Low-frequency analysis weights should be cached by sample rate.');
assert.doesNotMatch(functionBlock(jni, 'void analyze_window('), /std::(?:sin|cos)\s*\(/, 'Steady-state analysis must not recompute trigonometric kernels.');
assert.match(pipeline, /buffer_pool_/, 'XAudio2 blocks should come from a preallocated pool.');
assert.match(pipeline, /free_buffers_/, 'Consumed XAudio2 blocks should return to the free list.');
assert.doesNotMatch(queue, /new\s*(?:\([^)]*\)\s*)?QueuedAudioBuffer/, 'Queueing must not allocate a buffer.');
assert.doesNotMatch(submit, /std::vector<float>\s+rendered/, 'Submit must render into pooled storage.');
assert.match(pipeline, /spatial_cache_revision_/, 'X3DAudio results should be cached by pose revision.');
assert.match(pipeline, /rust_stereo_scratch_\.assign\s*\(/, 'Rust stereo scratch must be allocated before streaming.');
assert.match(pipeline, /rust_upmix_scratch_\.assign\s*\(/, 'Rust upmix scratch must be allocated before streaming.');
assert.match(pipeline, /kFramesPerTransportBatch\s*=\s*4096/, 'Rust upmix should share the 4096-frame transport batch.');
assert.match(submit, /TryRustUpmixBlock\(interleaved_pcm,\s*frame_count\)[\s\S]*?while\s*\(source_offset/, 'Rust should upmix once per transport batch, before OBR render quanta.');
assert.match(rust, /left_scratch:\s*Vec<f32>[\s\S]*?right_scratch:\s*Vec<f32>/, 'Rust stereo scratch should live on the handle.');
assert.doesNotMatch(functionBlock(rust, 'fn process_block('), /Vec::with_capacity/, 'Rust processing must not allocate stereo scratch per call.');

console.log(JSON.stringify({
  pass: true,
  transportFrames: 4096,
  javaJni: 'direct-buffer-zero-copy',
  nativeQueue: 'preallocated-pool',
  x3d: 'pose-revision-cache',
  obrBlockFrames: 256
}, null, 2));
