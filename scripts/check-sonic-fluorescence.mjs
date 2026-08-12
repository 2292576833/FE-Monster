import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = readFileSync(path.join(root, 'web', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const runHeadless = process.argv.includes('--headless');

function headlessFluorescenceProbe() {
  if (!runHeadless) return { pass: true, skipped: true };
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-preset-performance.mjs')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 90_000,
    maxBuffer: 16 * 1024 * 1024
  });
  try {
    const payload = JSON.parse(result.stdout || '{}');
    const contrast = payload?.sonicRefresh?.sonicAtmosphere?.fluorescencePixelContrast || {};
    return {
      pass: Array.isArray(payload.browserErrors)
        && payload.browserErrors.length === 0
        && payload?.sonicRefresh?.contextLost === false
        && payload?.sonicRefresh?.renderFps >= 50
        && contrast.meanLuminanceGain >= 0.0025
        && contrast.brightenedPixelRatio >= 0.035
        && contrast.p90LuminanceGain >= 0.012
        && contrast.p98LuminanceGain >= 0.045
        && contrast.gainStdDev >= 0.008
        && contrast.edgeDetailGain >= 0.0022
        && contrast.clippedHighlightRatio <= 0.006
        && contrast.offDrawCalls === contrast.onDrawCalls,
      skipped: false,
      fps: payload?.sonicRefresh?.renderFps ?? null,
      contextLost: payload?.sonicRefresh?.contextLost ?? null,
      browserErrors: payload.browserErrors || [],
      contrast
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

const headless = headlessFluorescenceProbe();

const checks = {
  fluorescenceControlIsExposed:
    html.includes('id="sonicFluorescenceRange"')
    && html.includes('id="sonicFluorescenceValue"')
    && app.includes("sonicFluorescenceRange: $('#sonicFluorescenceRange')")
    && app.includes("sonicFluorescenceValue: $('#sonicFluorescenceValue')"),
  fluorescenceIsNormalizedAndPersistent:
    /fluorescence:\s*0\.\d+/.test(app)
    && /fluorescence:\s*bounded\(source\?\.fluorescence,\s*DEFAULT_SONIC_SETTINGS\.fluorescence,\s*0,\s*1\.5\)/.test(app)
    && /bindSonicPercentRange\(els\.sonicFluorescenceRange,\s*['"]fluorescence['"]\)/.test(app),
  controlSynchronizesWithoutAResidentLoop:
    /syncRange\(els\.sonicFluorescenceRange,\s*els\.sonicFluorescenceValue,[\s\S]{0,180}?settings\.fluorescence/.test(app)
    && /uFluorescence\.value\s*=\s*settings\.fluorescence/.test(app),
  fluorescenceLivesInExistingTerrainShader:
    /uFluorescence:\s*\{\s*value:\s*DEFAULT_SONIC_SETTINGS\.fluorescence\s*\}/.test(app)
    && /uniform float uFluorescence;/.test(app)
    && /float fresnelGlow\s*=/.test(app)
    && /float topSheen\s*=/.test(app)
    && /float sideLightRibs\s*=/.test(app)
    && /vec3 fluorescentEmission\s*=/.test(app),
  lightDetailUsesViewAndAudioEnergy:
    /varying vec3 vViewDirection;/.test(app)
    && /vViewDirection\s*=\s*normalize\(/.test(app)
    && /uAudioPulse/.test(app)
    && /fluorescenceEnergy[\s\S]{0,260}?uAudioPulse/.test(app),
  fluorescenceAddsNoPostProcessOrNewAnimationLoop:
    !/EffectComposer[\s\S]{0,240}?fluorescen/i.test(app)
    && !/UnrealBloomPass[\s\S]{0,240}?fluorescen/i.test(app)
    && !/requestAnimationFrame[\s\S]{0,240}?fluorescen/i.test(app),
  fluorescenceChangesRealPixelsWithoutExtraDrawCalls: headless.pass
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
