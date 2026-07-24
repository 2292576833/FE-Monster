import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');

const functionBody = (name) => {
  const start = app.indexOf(`function ${name}(`);
  if (start < 0) return '';
  let depth = 0;
  let opened = false;
  for (let index = app.indexOf('{', start); index < app.length; index += 1) {
    if (app[index] === '{') {
      depth += 1;
      opened = true;
    } else if (app[index] === '}') {
      depth -= 1;
      if (opened && depth === 0) return app.slice(start, index + 1);
    }
  }
  return '';
};

const playbackQuality = functionBody('updatePlaybackQuality');
const orbQuality = functionBody('updateOrbQuality');
const clarityObserver = functionBody('observeRenderClarityFrame');
const drawOrb = functionBody('drawOrb');
const init = functionBody('init');
const polling = functionBody('startBackgroundPolling');
const dynamicVisibility = functionBody('updateDynamicCubeVisibility');
const sonicVisibility = functionBody('updateSonicTopographyVisibility');
const nativeRefresh = functionBody('playbackPresetsUseNativeRefresh');

const checks = {
  playbackParticleDensityIsFixed:
    playbackQuality.length > 0
    && !/quality\s*=\s*Math\.(?:min|max)/.test(playbackQuality)
    && /RENDER_PROFILE\.playbackQualityMax/.test(playbackQuality),
  orbParticleDensityIsFixed:
    orbQuality.length > 0
    && !/quality\s*=\s*Math\.(?:min|max)/.test(orbQuality)
    && /RENDER_PROFILE\.orbQualityMax/.test(orbQuality),
  clarityDoesNotAdaptWhileRendering:
    clarityObserver.length > 0
    && !/setAutoRenderClarityPercent\s*\(/.test(clarityObserver),
  orbFrameReusesProjectionStorage:
    drawOrb.length > 0
    && !/state\.particles\.slice\s*\([^)]*\)\.map\s*\(/.test(drawOrb)
    && /orb\.drawable/.test(drawOrb),
  visibleFrameRateRemainsNative:
    /return\s+!document\.hidden/.test(nativeRefresh)
    && /playbackPresetsUseNativeRefresh\(\)\s*\?\s*0/.test(drawOrb),
  permanentInitIntervalsRemoved:
    init.length > 0
    && !/setInterval\s*\(/.test(init)
    && /startBackgroundPolling\s*\(/.test(init),
  pollingStopsWhenDocumentIsHidden:
    polling.length > 0
    && /document\.hidden/.test(polling)
    && /clearBackgroundPolling\s*\(/.test(app)
    && /visibilitychange/.test(app),
  inactiveDynamicCubeIsDisposed:
    /else\s+disposeDynamicCube\s*\(/.test(dynamicVisibility)
    && /function disposeDynamicCube\s*\(/.test(app),
  inactiveSonicSceneIsDisposed:
    /else\s+disposeSonicTopography\s*\(/.test(sonicVisibility)
    && /function disposeSonicTopography\s*\(/.test(app)
};

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({
  pass: failures.length === 0,
  policy: {
    adaptiveFrameRate: false,
    adaptiveParticleDensity: false,
    adaptiveClarityDuringRendering: false
  },
  checks,
  failures
}, null, 2));

if (failures.length) process.exitCode = 1;
