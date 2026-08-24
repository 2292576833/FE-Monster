import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFile(path.join(root, relative), 'utf8');

const [app, routes, engine, nativeBridge, pipeline] = await Promise.all([
  read('web/app.js'),
  read('src/main/java/com/femonster/api/ApiRoutes.java'),
  read('src/main/java/com/femonster/core/NativeAudioEngine.java'),
  read('native/windows/fe_monster_xaudio2.cpp'),
  read('native/windows/audio/fe_audio_pipeline.cpp')
]);

assert.match(engine, /activeSpatialGeneration/,
  'NativeAudioEngine must track an active PCM generation independently of the session id.');
assert.match(engine, /submitSpatialPcm\(long session, long generation,/,
  'Every streamed PCM block must be rejected unless its generation is current.');
assert.match(routes, /\/api\/audio\/spatial\/pause/,
  'The bridge must expose a synchronous native pause/flush acknowledgement.');
assert.match(routes, /\/api\/audio\/spatial\/timeline/,
  'The bridge must expose an in-place seek timeline reset.');
assert.match(routes, /longParam\(query, "generation", 0\)/,
  'Native stream, activation, pause and stop calls must carry a generation.');
assert.match(app, /async function invalidateNativeGoogleObrTimeline/,
  'The web clock must have one awaitable native timeline invalidation seam.');
assert.match(app, /function beginNativeSpatialTimelineTransition[\s\S]{0,900}type: 'reset-timeline'/,
  'A seek must rotate the AudioWorklet capture epoch before post-seek PCM is accepted.');
assert.match(app, /function setAudioCurrentTimeWithNativeContinuity[\s\S]{0,700}els\.audio\.currentTime = Number\(target\)/,
  'The media clock must move immediately while native reset/preroll runs off the UI thread.');
assert.doesNotMatch(
  app.match(/function setAudioCurrentTimeWithNativeContinuity[\s\S]*?\n}/)?.[0] || '',
  /await /,
  'The immediate seek handoff must not await HTTP, JNI, flush or preroll.'
);
assert.match(app, /els\.progressRange\.addEventListener\('input', \(\) =>[\s\S]{0,500}setAudioCurrentTimeWithNativeContinuity/,
  'Continuous progress scrubbing must use the non-blocking generation handoff.');
assert.match(app, /els\.progressRange\.addEventListener\('change', async[\s\S]{0,900}await ensureAudioAnalysis\(\{ announceObrFailure: false \}\)/,
  'The final seek handoff must retain the normal analysis readiness check.');
assert.match(app, /await invalidateNativeGoogleObrTimeline\('source-change'\)[\s\S]{0,1200}els\.audio\.src = browserAudioUrl\(data\.url\)/,
  'A remote source change must flush old native PCM before assigning the new source.');
assert.match(app, /await invalidateNativeGoogleObrTimeline\('pause'\)[\s\S]{0,500}els\.audio\.pause\(\)/,
  'An explicit pause must stop and flush XAudio2 before freezing the media clock.');
assert.match(nativeBridge, /config\.max_queued_buffers = 24/,
  'The regression assumes the production 24-buffer native queue.');
assert.match(pipeline, /HRESULT ResetTimeline\(\)[\s\S]{0,4500}source_voice_->Stop\(0\)[\s\S]{0,300}source_voice_->FlushSourceBuffers\(\)/,
  'Rotating a seek generation must stop and flush the old XAudio2 queue in place.');

console.log('Native spatial timeline epoch contract PASS');
