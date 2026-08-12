import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');

function section(startMarker, endMarker) {
  const start = app.indexOf(startMarker);
  const end = app.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) return '';
  return app.slice(start, end);
}

const rainRuntime = section('function sonicRainHash', 'function buildSonicTopography');
const rainUpdate = section('function updateSonicRain(', 'function buildSonicTopography');
const rainApply = section('function applySonicRainSettings', 'function updateSonicRain');
const normalizeSettings = section('function normalizeSonicSettings', 'function loadSonicSettingsPreferences');
const saveSettings = section('function saveSonicSettingsPreferences', 'function flushSonicSettingsPreferences');
const buildSonic = section('function buildSonicTopography', 'function resizeSonicTopographyRenderer');
const disposeSonic = section('function disposeSonicTopography', 'function sonicAtmosphereRuntimeSnapshot');
const motion = section('function updateSonicTopographyMotion', 'function hslToRgb');

const controlIds = [
  'sonicRainToggle',
  'sonicRainIntensityRange',
  'sonicRainSpeedRange',
  'sonicRainWindRange',
  'sonicRainLengthRange',
  'sonicRainWidthRange',
  'sonicRainRippleIntensityRange',
  'sonicRainRippleSizeRange',
  'sonicRainRippleLifeRange',
  'sonicRainWetReflectanceRange',
  'sonicRainWetGlowRange'
];

const settingNames = [
  'rainEnabled',
  'rainIntensity',
  'rainSpeed',
  'rainWind',
  'rainLength',
  'rainWidth',
  'rainRippleIntensity',
  'rainRippleSize',
  'rainRippleLife',
  'rainWetReflectance',
  'rainWetGlow'
];

const checks = {
  controlsAreACompletePeerFeatureGroup:
    html.includes('id="sonicRainFeatureGroup"')
      && controlIds.every((id) => html.includes(`id="${id}"`))
      && html.includes('雨幕、落点水波与地面反光'),
  settingsNormalizeAndPersist:
    settingNames.every((name) => normalizeSettings.includes(`${name}:`))
      && saveSettings.includes('normalizeSonicSettings(state.sonicTopography.settings)')
      && saveSettings.includes('window.localStorage.setItem(SONIC_SETTINGS_PREFS_KEY'),
  qualityCapsCoverDesktopMobileAndReducedMotion:
    app.includes('const SONIC_RAIN_QUALITY = Object.freeze')
      && app.includes("RENDER_PROFILE.tier === 'high'")
      && app.includes("MOBILE_RENDER_TARGET && RENDER_PROFILE.tier === 'economy'")
      && app.includes('if (reducedMotion) return { streaks: 160')
      && rainRuntime.includes('SONIC_RAIN_QUALITY.streaks')
      && rainRuntime.includes('SONIC_RAIN_QUALITY.ripples')
      && rainRuntime.includes('SONIC_RAIN_QUALITY.splashes'),
  rainUsesThreeBoundedGpuBatches:
    (rainRuntime.match(/new THREE\.InstancedMesh\(/g) || []).length === 3
      && rainRuntime.includes("streakMesh.name = 'SonicRainStreakBatch'")
      && rainRuntime.includes("rippleMesh.name = 'SonicRainRippleBatch'")
      && rainRuntime.includes("splashMesh.name = 'SonicRainSplashBatch'"),
  poolsUseReusableTypedStorage:
    rainRuntime.includes('dropData: new Float32Array')
      && rainRuntime.includes('rippleData: new Float32Array')
      && rainRuntime.includes('splashData: new Float32Array')
      && rainRuntime.includes('rippleFades = new Float32Array')
      && rainRuntime.includes('rippleProgresses = new Float32Array')
      && rainRuntime.includes('rippleImpacts = new Float32Array')
      && rainRuntime.includes('rippleRadiusScales = new Float32Array'),
  rainCurtainsSampleOnlyRenderedGround:
    rainRuntime.includes('const curtainLane = index % 7')
      && rainRuntime.includes('const laneCenter = (-0.82 + curtainLane / 6 * 1.64) * rain.groundRadius')
      && rainRuntime.includes('index % 4 === 0')
      && rainRuntime.includes('sonicRainGroundSurfaceAt(x, z)')
      && rainRuntime.includes('sonicRainGroundVisibleAt(rain, x, 1, z)')
      && rainRuntime.includes("streakMesh.name = 'SonicRainStreakBatch'"),
  updateHotPathDoesNotAllocate:
    !/\bnew\s+THREE\.|\bnew\s+(?:Array|Float32Array|Object)|Array\.from|\.map\(|\.filter\(|\.slice\(|=>/.test(rainUpdate),
  collisionUsesKnownTerrainMath:
    rainRuntime.includes('function sonicRainCollisionHeight')
      && rainRuntime.includes('topo.frameAudio')
      && rainRuntime.includes('audio.lowFrequencyBands[bandIndex]')
      && rainRuntime.includes('const smallSeed = terrainSeedY')
      && rainRuntime.includes('const smallShape = (1 - smoothstep(0.07, 0.31, smallDistance))')
      && rainRuntime.includes('topo.groundMoundColumnProfileAttribute?.array')
      && rainRuntime.includes('const moundColumnBandDrive =')
      && rainRuntime.includes('groundEntranceProgress')
      && rainRuntime.includes('settings.groundMoundsEnabled && moundMask > 0')
      && rainRuntime.includes('SONIC_AUDIO_COLUMN_MAX_LIFT'),
  collisionHeightMatchesGpuAudioEntranceAndTerrainRipples:
    rainRuntime.includes('function sonicRainSimplexNoise2D')
      && rainRuntime.includes('topo.bassColumnBandAttribute?.array?.[terrainIndex]')
      && rainRuntime.includes('topo.terrainSeedAttribute?.array')
      && rainRuntime.includes('topo.terrainSmallLocalAttribute?.array')
      && rainRuntime.includes('topo.lowFrequencySpectrumData?.[bandIndex]')
      && rainRuntime.includes('const rhythmGate = lowGate * (0.32 + audioPulse * 0.68)')
      && rainRuntime.includes('const subLift = audio.subBass * rhythmGate')
      && rainRuntime.includes('const bassLift = audio.bass * rhythmGate')
      && rainRuntime.includes('const lowMidLift = audio.lowMid * rhythmGate')
      && rainRuntime.includes('const midLift = audio.mid * rhythmGate')
      && rainRuntime.includes('const highMidLift = highMidFraction > 0.8')
      && rainRuntime.includes('const entranceCursor = groundEntranceProgress * 1.34')
      && rainRuntime.includes('topo.groundMoundMaskAttribute?.array?.[terrainIndex]')
      && rainRuntime.includes('const terrainRipples = topo.ripples')
      && rainRuntime.includes('return 1 + elevation + rippleElevation'),
  collisionAndGpuSharePrecomputedQuantizedSeeds:
    app.includes('attribute vec4 aTerrainSeed')
      && app.includes('attribute vec2 aTerrainSmallLocal')
      && app.includes('float rnd = aTerrainSeed.x')
      && app.includes('float smallBassSeed = aTerrainSeed.y')
      && app.includes('vec2 smallBassCenter = (aTerrainSeed.zw - 0.5) * 0.26')
      && buildSonic.includes('const terrainSeedValues = new Uint8Array(count * 4)')
      && buildSonic.includes('const terrainSmallLocalValues = new Uint8Array(count * 2)')
      && buildSonic.includes("geometry.setAttribute('aTerrainSeed', terrainSeedAttribute)")
      && buildSonic.includes("geometry.setAttribute('aTerrainSmallLocal', terrainSmallLocalAttribute)")
      && rainRuntime.includes('terrainSeedValues[terrainSeedOffset] / 255')
      && rainRuntime.includes('terrainSmallLocalValues[terrainSmallLocalOffset] / 255 - 0.5'),
  collisionGateFollowsTallInteractiveTerrain:
    rainRuntime.includes('function sonicRainCollisionCeiling')
      && rainRuntime.includes('settings.groundMoundHeight * SONIC_GROUND_MOUND_COLUMN_MAX_RISE')
      && rainUpdate.includes('SONIC_CENTER_COLUMN_MAX_LIFT + SONIC_CENTER_COLUMN_PEDESTAL_MAX_LIFT')
      && rainUpdate.includes('const centerCollisionRadiusSquared = centerCollisionRadius * centerCollisionRadius + 0.5')
      && rainUpdate.includes('drops[offset + 1] > collisionCeiling && drops[offset + 1] <= centerCollisionCeiling')
      && rainUpdate.includes('if (overCenterColumns) dropCollisionCeiling = centerCollisionCeiling')
      && rainRuntime.includes('Math.exp(-waveRadius / fadeDistance)')
      && rainUpdate.includes('const collisionCeiling = sonicRainCollisionCeiling(topo, timeSeconds)')
      && rainUpdate.includes('drops[offset + 1] <= dropCollisionCeiling')
      && !rainUpdate.includes('drops[offset + 1] < 8'),
  collisionAvoidsGpuReadbackAndRaycasts:
    !/new\s+THREE\.Raycaster|\.readPixels\s*\(|gl_FragDepth\s*=/.test(rainRuntime),
  terrainMaskRejectsVoidGapsAndWallpaperOnlySpace:
    rainRuntime.includes('function sonicRainGroundFootprintAt')
      && rainRuntime.includes('function sonicRainGroundSurfaceAt')
      && rainRuntime.includes('function sonicRainGroundVisibleAt')
      && rainRuntime.includes('SONIC_RAIN_GROUND_RADIUS')
      && rainUpdate.includes('const overRenderedGround = sonicRainGroundFootprintAt')
      && rainUpdate.includes('if (hasGroundSurface)')
      && !rainUpdate.includes('rain.span'),
  streakPixelsAreClippedToPhysicalGroundColumns:
    rainRuntime.includes('varying vec3 vRainWorldPosition')
      && rainRuntime.includes('vec3 groundPoint = vec3(vRainWorldPosition.x, uGroundY, vRainWorldPosition.z)')
      && rainRuntime.includes('length(groundPoint.xz)')
      && rainRuntime.includes('if (groundMask <= 0.001) discard')
      && rainRuntime.includes('groundPoint.xz / uGroundSpacing')
      && rainRuntime.includes('groundCellDelta = abs(groundPoint.xz - nearestGroundCell)')
      && rainRuntime.includes('if (groundCellMask <= 0.001) discard')
      && rainRuntime.includes('groundMask * groundCellMask')
      && !rainUpdate.includes('&& sonicRainGroundVisibleAt(rain, drops[offset]'),
  impactsReuseRippleAndSplashPools:
    rainUpdate.includes('spawnSonicRainRipple(')
      && rainUpdate.includes('spawnSonicRainSplash(')
      && rainRuntime.includes('rain.rippleIndex = (index + 1) % SONIC_RAIN_QUALITY.ripples')
      && rainRuntime.includes('rain.splashIndex = (index + 1) % SONIC_RAIN_QUALITY.splashes'),
  offOnTransitionClearsOldImpactMatrices:
    rainApply.includes('rain.rippleData.fill(0)')
      && rainApply.includes('rain.splashData.fill(0)')
      && rainApply.includes('dummy.position.set(0, -1000, 0)')
      && rainApply.includes('rain.rippleMesh.setMatrixAt(index, dummy.matrix)')
      && rainApply.includes('rain.splashMesh.setMatrixAt(index, dummy.matrix)')
      && rainApply.includes('rain.rippleMesh.instanceMatrix.needsUpdate = true')
      && rainApply.includes('rain.splashMesh.instanceMatrix.needsUpdate = true'),
  audioOnlyGentlyLightsRain:
    motion.includes('const rainAudioLight = audioDriving')
      && motion.includes('updateSonicRain(topo, dt, now, rainAudioLight)')
      && rainUpdate.includes('0.96 + clamp(audioLight, 0, 1) * 0.08')
      && rainUpdate.includes('uRainAudioLight.value = clamp(audioLight, 0, 1)')
      && !/audioLight[^;\n]*(?:fallSpeed|activeDropCount|rainSpeed)/.test(rainUpdate),
  hiddenDocumentsPauseRain:
    rainUpdate.includes('if (!rain || !rain.enabled || document.hidden) return;'),
  realisticRipplesUseLayeredOptics:
    rainRuntime.includes('float rainBand(')
      && rainRuntime.includes('float primary = rainBand')
      && rainRuntime.includes('float trailing = rainBand')
      && rainRuntime.includes('float capillary = rainBand')
      && rainRuntime.includes('float fresnel = 0.02 + 0.98 * pow')
      && rainRuntime.includes('float specular = pow')
      && rainRuntime.includes('new THREE.PlaneGeometry(1, 1, 1, 1)')
      && rainRuntime.includes('blending: THREE.NormalBlending')
      && rainRuntime.includes('#include <tonemapping_fragment>'),
  rippleQuadIsClippedToItsHitTerrainCell:
    rainRuntime.includes('attribute vec2 aRainImpact')
      && rainRuntime.includes('vRainWorldPosition.xz - vRainImpact')
      && rainUpdate.includes('const cellX = Math.round(ripples[offset] / SONIC_TOPOGRAPHY_SPACING)')
      && rainUpdate.includes('dummy.scale.set(SONIC_TOPOGRAPHY_SIZE, SONIC_TOPOGRAPHY_SIZE, SONIC_TOPOGRAPHY_SIZE)')
      && rainUpdate.includes('const surfaceY = sonicRainCollisionHeight('),
  wetOpticsLiveOnlyOnTerrainTopFaces:
    app.includes('float wetEnergy = rainAmount * min(')
      && app.includes('if (isTop && wetEnergy > 0.0001)')
      && app.includes('uRainWetReflectance')
      && app.includes('uRainWetGlow')
      && !rainRuntime.includes("wetPlane.name = 'SonicRainWetGround'")
      && !rainRuntime.includes('createSonicRainWetMaterial'),
  buildApplyAndDisposeAreWired:
    buildSonic.includes('createSonicRainSystem(THREE, scene, group, dummy, theme, camera)')
      && buildSonic.includes('topo.rain = rain')
      && app.includes('applySonicRainSettings(topo, settings)')
      && disposeSonic.includes('disposePresetRenderer(topo, els.sonicTopographyCore)')
      && disposeSonic.includes('rain: null')
      && app.includes('disposeThreeSceneResources(owner.scene)')
      && app.includes('root.traverse((object) =>')
      && app.includes('disposeValue(object.geometry)'),
  rainAddsNoIndependentAnimationLoop:
    !/requestAnimationFrame|setInterval/.test(rainRuntime)
      && (motion.match(/updateSonicRain\(/g) || []).length === 1,
  remainsOnTheExistingDx11WebglRenderer:
    buildSonic.includes('createDirectX11Renderer(THREE')
      && !/WebGPURenderer|navigator\.gpu/.test(rainRuntime)
};

const failures = Object.entries(checks)
  .filter(([, pass]) => !pass)
  .map(([name]) => name);

console.log(JSON.stringify({
  pass: failures.length === 0,
  quality: {
    reducedMotion: { streaks: 160, ripples: 24, splashes: 32 },
    mobileEconomy: { streaks: 240, ripples: 28, splashes: 40 },
    mobile: { streaks: 380, ripples: 36, splashes: 56 },
    desktopEconomy: { streaks: 420, ripples: 40, splashes: 64 },
    desktopBalanced: { streaks: 720, ripples: 64, splashes: 104 },
    desktopHigh: { streaks: 980, ripples: 80, splashes: 144 }
  },
  checks,
  failures
}, null, 2));

if (failures.length) process.exitCode = 1;
