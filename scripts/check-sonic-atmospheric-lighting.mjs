import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const runHeadless = process.argv.includes('--headless');

function headlessLightingProbe() {
  if (!runHeadless) return { pass: true, skipped: true };
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-preset-performance.mjs')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 90_000,
    maxBuffer: 16 * 1024 * 1024
  });
  try {
    const payload = JSON.parse(result.stdout || '{}');
    const atmosphere = payload?.sonicRefresh?.sonicAtmosphere || {};
    const raisedPixels = atmosphere.pixelMetrics?.raisedAtmosphere || {};
    return {
      pass: Array.isArray(payload.browserErrors)
        && payload.browserErrors.length === 0
        && payload?.sonicRefresh?.contextLost === false
        && payload?.sonicRefresh?.renderFps >= 50
        && atmosphere.terrainUsesLayeredAtmosphere === true
        && atmosphere.backgroundUsesLayeredAtmosphere === true
        && atmosphere.terrainAtmosphereLightStrength > 0
        && atmosphere.fluorescencePixelContrast?.offDrawCalls
          === atmosphere.fluorescencePixelContrast?.onDrawCalls
        && raisedPixels.clippedHighlightRatio <= 0.006
        && raisedPixels.luminanceMean <= 0.2
        && atmosphere.programsRunnable === true
        && atmosphere.glError === 0,
      skipped: false,
      fps: payload?.sonicRefresh?.renderFps ?? null,
      contextLost: payload?.sonicRefresh?.contextLost ?? null,
      browserErrors: payload.browserErrors || [],
      atmosphere
    };
  } catch (error) {
    return {
      pass: false,
      skipped: false,
      error: error instanceof Error ? error.message : String(error),
      stderr: String(result.stderr || '').trim()
    };
  }
}

const headless = headlessLightingProbe();
const checks = {
  layeredTerrainLightingUsesExistingShader:
    /uAtmosphereLightStrength:\s*\{\s*value:\s*0\s*\}/.test(app)
    && /float lowFrequencyLight\s*=/.test(app)
    && /float highFrequencyLight\s*=/.test(app)
    && /float localLightPool\s*=/.test(app)
    && /float bassShadowBreath\s*=/.test(app)
    && /vec3 atmosphereReturn\s*=/.test(app),
  bassAndHighBandsDriveDifferentLightLayers:
    /lowFrequencyLight[\s\S]{0,180}?uSubBass[\s\S]{0,100}?uBass/.test(app)
    && /highFrequencyLight[\s\S]{0,220}?uMid[\s\S]{0,100}?uHighMid[\s\S]{0,140}?uPresence/.test(app),
  paletteAndTyndallColorTheAtmosphere:
    /paletteAtmosphereLight\s*=\s*mix\(targetGlow,\s*uTyndallBounceColor/.test(app)
    && /farPaletteHaze\s*=\s*mix\(uTyndallBounceColor,\s*targetGlow/.test(app)
    && /farLightColor\s*=\s*mix\(uBackgroundColor2,\s*uSkyAtmosphereColor/.test(app),
  farFieldHasBoundedSpatialGradient:
    /float farLightGradient\s*=\s*smoothstep\(/.test(app)
    && /float spatialFogMix\s*=\s*aerialFog\s*\*\s*clamp\(/.test(app)
    && /float atmosphereReturnPeak\s*=/.test(app)
    && /farLight\s*\/=\s*1\.0\s*\+\s*max\(/.test(app),
  backgroundAtmosphereUsesExistingDraw:
    /uAtmosphereBass:\s*\{\s*value:\s*0\s*\}/.test(app)
    && /uAtmosphereDetail:\s*\{\s*value:\s*0\s*\}/.test(app)
    && /float horizonVeil\s*=/.test(app)
    && /float keyLobe\s*=/.test(app),
  pauseAndReducedMotionSettleAudioLighting:
    /atmosphereAudioDriveTarget\s*=\s*audioDriving\s*&&\s*!reducedMotion\s*\?\s*1\s*:\s*0/.test(app)
    && /targetBassLight\s*=\s*lowBassDrive\s*\*\s*topo\.atmosphereAudioDrive/.test(app)
    && /targetDetailLight[\s\S]{0,260}?\*\s*topo\.atmosphereAudioDrive/.test(app),
  noExtraPostProcessingOrAnimationLoop:
    !/EffectComposer[\s\S]{0,240}?Atmosphere/i.test(app)
    && !/UnrealBloomPass[\s\S]{0,240}?Atmosphere/i.test(app)
    && !/requestAnimationFrame[\s\S]{0,240}?atmosphereAudioDrive/i.test(app),
  webGlCompilesAndStaysWithinExposureBudget: headless.pass
};

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

process.stdout.write(`${JSON.stringify({
  pass: failures.length === 0,
  checks,
  failures,
  headless
}, null, 2)}\n`);
process.exitCode = failures.length === 0 ? 0 : 1;
