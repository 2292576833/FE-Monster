import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../web/storm-ocean-runtime.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const window = { navigator: { userAgent: 'desktop-test' } };
vm.runInNewContext(source, { window, console, URL, Uint8Array });

const runtime = window.FeStormOceanRuntime;
assert.ok(runtime, 'storm ocean runtime should attach');

const day = runtime.lightingAtMinute(0);
const sunset = runtime.lightingAtMinute(15);
const evening = runtime.lightingAtMinute(30);
const sunsetElevationDegrees = Math.asin(sunset.sunDirection[1]) * 180 / Math.PI;
const keyFillRatio = sunset.keyIntensity / sunset.fillIntensity;

assert.equal(sunset.phase, 'sunset');
assert.ok(sunsetElevationDegrees >= 3 && sunsetElevationDegrees <= 6, 'sunset should use a 3-6 degree grazing light');
assert.ok(keyFillRatio >= 3.5 && keyFillRatio <= 4.6, 'sunset key/fill ratio should stay cinematic but controlled');
assert.ok(sunset.exposure >= 0.82 && sunset.exposure <= 0.9, 'sunset exposure should protect white highlights');
assert.ok(sunset.zenith[2] > sunset.zenith[0] * 1.7, 'sunset zenith should keep a cool violet fill');
assert.ok(sunset.horizon[0] > sunset.horizon[2] * 4, 'sunset horizon should remain warm');
assert.ok(sunset.highlight[2] > sunset.highlight[0], 'cloud and water fill highlights should be cool');
assert.ok(sunset.reflectionGain > day.reflectionGain, 'sunset should strengthen grazing reflections');
assert.ok(sunset.backlight > day.backlight * 5, 'sunset should clearly enter backlight mode');
assert.ok(evening.sunDirection[1] < 0, 'evening sun should pass below the horizon');
assert.ok(appSource.includes("stormLightingMode: 'sunset'"), 'storm ocean should open with the cinematic sunset look');
assert.ok(appSource.includes("state.sandbox.stormLightingMode = 'sunset'"), 're-entering storm ocean should restore the sunset look');

for (const marker of [
  'stormCinematicEnvironmentV1',
  'stormCinematicBacklightV1',
  'stormWarmReflectionTrailV1',
  'uStormBacklight',
  'uStormReflectionGain',
]) {
  assert.ok(source.includes(marker), `missing cinematic lighting marker: ${marker}`);
}

console.log(JSON.stringify({
  runtimeVersion: runtime.runtimeVersion,
  sunsetElevationDegrees: Number(sunsetElevationDegrees.toFixed(2)),
  keyFillRatio: Number(keyFillRatio.toFixed(2)),
  sunsetExposure: sunset.exposure,
  reflectionGain: sunset.reflectionGain,
}, null, 2));
