import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const app = readFileSync(path.join(root, "web", "app.js"), "utf8").replace(/\r\n/g, "\n");
const html = readFileSync(path.join(root, "web", "index.html"), "utf8").replace(/\r\n/g, "\n");
const runHeadless = process.argv.includes("--headless");

function headlessSonicSmoke() {
  if (!runHeadless) return { pass: true, skipped: true };
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "check-preset-performance.mjs")], {
    cwd: root,
    encoding: "utf8",
    timeout: 90_000,
    maxBuffer: 16 * 1024 * 1024
  });
  try {
    const payload = JSON.parse(result.stdout || "{}");
    const defaultPixels = payload?.sonicRefresh?.sonicAtmosphere?.pixelMetrics?.defaults || {};
    const raisedPixels = payload?.sonicRefresh?.sonicAtmosphere?.pixelMetrics?.raisedAtmosphere || {};
    return {
      pass: Array.isArray(payload.browserErrors)
        && payload.browserErrors.length === 0
        && payload?.sonicRefresh?.contextLost === false
        && payload?.sonicRefresh?.sonicAtmosphere?.mistLayerCount === 8
        && payload?.sonicRefresh?.sonicAtmosphere?.beamCount === 9
        && payload?.sonicRefresh?.sonicAtmosphere?.haloCount === 9
        && payload?.sonicRefresh?.sonicAtmosphere?.groundReceiverCount === 1
        && payload?.sonicRefresh?.sonicAtmosphere?.receiverBounceCount >= 2
        && payload?.sonicRefresh?.sonicAtmosphere?.groundUsesDirectionalSheen === true
        && payload?.sonicRefresh?.sonicAtmosphere?.groundHasNoSpotGeometry === true
        && payload?.sonicRefresh?.sonicAtmosphere?.opticsCoupling?.temperatureChangesAllReceivers === true
        && payload?.sonicRefresh?.sonicAtmosphere?.opticsCoupling?.reflectanceRaisesReceiverEnergy === true
        && payload?.sonicRefresh?.sonicAtmosphere?.highlightShoulder >= 0.82
        && payload?.sonicRefresh?.sonicAtmosphere?.blackLiftGuard >= 0.48
        && raisedPixels.clippedHighlightRatio <= 0.005
        && raisedPixels.highlightRatio <= 0.02
        && raisedPixels.shadowRatio >= 0.45
        && raisedPixels.localContrast >= 0.006
        && raisedPixels.luminanceStdDev >= defaultPixels.luminanceStdDev * 0.95
        && raisedPixels.midtoneRatio >= defaultPixels.midtoneRatio + 0.015
        && raisedPixels.luminanceMean <= 0.18
        && payload?.sonicRefresh?.sonicAtmosphere?.shaderMaterials === true
        && payload?.sonicRefresh?.sonicAtmosphere?.programsRunnable === true
        && payload?.sonicRefresh?.sonicAtmosphere?.glError === 0,
      skipped: false,
      browserErrors: payload.browserErrors || [],
      contextLost: payload?.sonicRefresh?.contextLost ?? null,
      fps: payload?.sonicRefresh?.renderFps ?? null,
      atmosphere: payload?.sonicRefresh?.sonicAtmosphere ?? null
    };
  } catch (error) {
    return {
      pass: false,
      skipped: false,
      error: error instanceof Error ? error.message : String(error),
      stderr: String(result.stderr || "").trim()
    };
  }
}

const headless = headlessSonicSmoke();

const checks = {
  closerFraming: /return Math\.hypot\(activeRadius, 10\) \* 0\.(?:6\d|7[0-6]) \/ Math\.sin/.test(app),
  lowerSceneCompositionLeavesWallpaperVisible:
    /SONIC_TOPOGRAPHY_CAMERA\s*=\s*Object\.freeze\(\{\s*x:\s*102,\s*y:\s*48,\s*z:\s*102,\s*fov:\s*44,\s*targetY:\s*8\s*\}\)/.test(app)
    && /topo\.camera\.lookAt\(0,\s*SONIC_TOPOGRAPHY_CAMERA\.targetY,\s*0\)/.test(app),
  wallpaperUsesUpperDomeConcavity:
    /const sideWrap = x \* x \* \(0\.26 \+ dome \* 0\.055\);/.test(app)
    && /const topDome = dome \* dome \* 0\.18;/.test(app)
    && /positions\.setZ\(index,\s*sideWrap \+ midRecline \+ topDome \+ centerInset\)/.test(app)
    && /wallpaperSurface\.userData\.surface = ['"]camera-deep-concave-contain-dome['"]/.test(app)
    && /surface\.scale\.set\([\s\S]{0,220}distance \* 0\.25\s*\)/.test(app)
    && /uContainRegion/.test(app)
    && /bottomFeather/.test(app),
  separatedColumns: /const SONIC_TOPOGRAPHY_SIZE = 0\.[78]\d;/.test(app),
  denserSmallerStarfield: /const SONIC_STARFIELD_PARTICLES = (?:[6-9]\d{3}|[1-9]\d{4});/.test(app)
    && /size:\s*0\.(?:1\d|2\d)/.test(app),
  starfieldAudioFlash: /uStarfieldAudio/.test(app)
    && /audio\.energy/.test(app)
    && /audio\.beat/.test(app),
  galaxySingleDrawCall: /const SONIC_GALAXY_PARTICLES = \d+;/.test(app)
    && /const galaxy = new THREE\.Points\(/.test(app)
    && /topo\.galaxy\.rotation\.y/.test(app),
  fogLowOverdraw: /const SONIC_WATER_MIST_LAYER_COUNT = [6-9];/.test(app)
    && /fogLayers/.test(app)
    && /position\.x -=/.test(app),
  tyndallLightAndBeams: /tyndallLight/.test(app)
    && /tyndallBeams/.test(app)
    && /tyndallTone/.test(app),
  coverPaletteBackground: /backgroundMaterial/.test(app)
    && /coverColors/.test(app)
    && /uBackgroundColor[123]/.test(app)
    && /\.lerp\(topo\.backgroundTargetColors/.test(app),
  normalizedPersistentSettings: [
    "galaxyEnabled", "galaxyColor", "galaxyIntensity",
    "atmosphereEnabled", "fogEnabled", "fogDensity", "fogSpeed", "fogGlow", "mistReflectance", "mistEmission",
    "tyndallEnabled", "tyndallTone", "tyndallIntensity", "tyndallSpread",
    "coverBackgroundEnabled", "coverBackgroundMix"
  ].every((name) => app.includes(name)),
  controlsPresent: [
    "sonicGalaxyToggle", "sonicGalaxyColorInput", "sonicGalaxyIntensityRange",
    "sonicAtmosphereToggle", "sonicFogDensityRange", "sonicFogSpeedRange", "sonicFogGlowRange",
    "sonicMistReflectanceRange", "sonicMistEmissionRange",
    "sonicTyndallToneSelect", "sonicTyndallIntensityRange", "sonicTyndallSpreadRange",
    "sonicCoverBackgroundToggle", "sonicCoverBackgroundMixRange"
  ].every((id) => html.includes(`id="${id}"`) && app.includes(id)),
  disposalReferences: /galaxy:\s*null/.test(app)
    && /fogLayers:\s*\[\]/.test(app)
    && /tyndallBeams:\s*\[\]/.test(app)
    && /backgroundMaterial:\s*null/.test(app),
  // A high cover mix must remain a continuous field instead of three visible
  // radial/banded regions. Normalized soft weights + micro dithering lock down
  // the shader seam that previously produced hard color blocks.
  coverBackgroundHasContinuousNormalizedBlend: /uBackgroundDither/.test(app)
    && /paletteWeight(?:1|A)/.test(app)
    && /paletteWeight(?:2|B)/.test(app)
    && /paletteWeight(?:3|C)/.test(app)
    && /paletteWeightSum/.test(app)
    && /color\s*\+=\s*\([^;]*uBackgroundDither/.test(app),
  // Water mist is a layered atmospheric volume: several independently moving
  // fine strata, not three large billboard fog sprites.
  waterMistHasFineDepthLayers: /const SONIC_WATER_MIST_LAYER_COUNT = (?:[6-9]|[1-9]\d+);/.test(app)
    && /createSonicWaterMistTexture/.test(app)
    && /mistLayer\.userData\.parallax/.test(app)
    && /mistLayer\.userData\.phase/.test(app)
    && /mistLayer\.position\.x -=/.test(app),
  waterMistTextureHasMultiScaleDetail: /const mistOctaves = \[/.test(app)
    && /globalCompositeOperation = ['"]screen['"]/.test(app)
    && /filter = ['"]blur\(/.test(app),
  // Tyndall light should read as a family of narrow, tapered shafts with soft
  // gobo breakup and mist coupling, not three broad solid MeshBasic cones.
  tyndallUsesFineTexturedShafts: /const SONIC_TYNDALL_BEAM_COUNT = (?:[7-9]|[1-9]\d+);/.test(app)
    && /createSonicTyndallBeamMaterial/.test(app)
    && /uGoboPhase/.test(app)
    && /uMistCoupling/.test(app)
    && /edgeSoftness/.test(app)
    && !/const tyndallBeams = \[\s*\{ target:[\s\S]{0,900}new THREE\.MeshBasicMaterial/.test(app),
  tyndallHasRestrainedMistModulatedHalo: /createSonicTyndallHaloMaterial/.test(app)
    && /uHaloStrength/.test(app)
    && /halo\.userData\.baseOpacity/.test(app)
    && /halo\.material\.uniforms\.uMistCoupling/.test(app),
  mergedWaterMistLightControl: html.includes('id="sonicAtmosphereToggle"')
    && !html.includes('id="sonicFogToggle"')
    && !html.includes('id="sonicTyndallToggle"')
    && /atmosphereEnabled/.test(app)
    && /legacyAtmosphereEnabled/.test(app),
  waterMistOpticsControls: [
    "sonicMistReflectanceRange",
    "sonicMistEmissionRange"
  ].every((id) => html.includes(`id="${id}"`) && app.includes(id)),
  physicallyLinkedAtmosphere: /mistReflectance/.test(app)
    && /mistEmission/.test(app)
    && /uMistReflectance/.test(app)
    && /uForwardScatterColor/.test(app)
    && /uMistScatterColor/.test(app)
    && /uSkyContribution/.test(app)
    && /beamVisibility\s*=\s*1\s*-\s*smoothstep\([^;]*mistEmission/.test(app),
  headlessWebGlSmoke: headless.pass
};

const output = {
  pass: Object.values(checks).every(Boolean),
  checks,
  failures: Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name),
  headless
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exitCode = output.pass ? 0 : 1;
