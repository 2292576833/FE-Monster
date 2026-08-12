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
assert.match(routes, /longParam\(query, "generation", 0\)/,
  'Native stream, activation, pause and stop calls must carry a generation.');
assert.match(app, /async function invalidateNativeGoogleObrTimeline/,
  'The web clock must have one awaitable native timeline invalidation seam.');
assert.match(app, /await invalidateNativeGoogleObrTimeline\('seek'\)[\s\S]{0,800}els\.audio\.currentTime = target/,
  'A committed seek must flush old native PCM before the media/lyric clock jumps.');
assert.match(app, /els\.progressRange\.addEventListener\('input', async[\s\S]{0,900}state\.audioPositionSync\.nativeSeekPromise = nativeSeek/,
  'The main progress seek must expose its native flush/currentTime handoff as an awaitable operation.');
assert.match(app, /els\.progressRange\.addEventListener\('change', async[\s\S]{0,900}await ensureAudioAnalysis\(\{ announceObrFailure: false \}\)/,
  'The main progress seek must rebuild native OBR after the final seek handoff completes.');
assert.match(app, /await invalidateNativeGoogleObrTimeline\('source-change'\)[\s\S]{0,1200}els\.audio\.src = browserAudioUrl\(data\.url\)/,
  'A remote source change must flush old native PCM before assigning the new source.');
assert.match(app, /await invalidateNativeGoogleObrTimeline\('pause'\)[\s\S]{0,500}els\.audio\.pause\(\)/,
  'An explicit pause must stop and flush XAudio2 before freezing the media clock.');
assert.match(nativeBridge, /config\.max_queued_buffers = 24/,
  'The regression assumes the production 24-buffer native queue.');
assert.match(pipeline, /source_voice_->Stop\(0\);[\s\S]{0,120}source_voice_->FlushSourceBuffers\(\);/,
  'Invalidating a native generation must destroy a pipeline that stops and flushes XAudio2.');

console.log('Native spatial timeline epoch contract PASS');
