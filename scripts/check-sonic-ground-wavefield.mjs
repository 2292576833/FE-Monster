import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const functionBody = (name, nextName) => {
  const start = app.indexOf(`function ${name}(`);
  const end = app.indexOf(`function ${nextName}(`, start + 1);
  return start >= 0 && end > start ? app.slice(start, end) : '';
};

const updateBody = functionBody('updateSonicTopographyMotion', 'hslToRgb');
const materialBody = functionBody('createSonicTopographyMaterial', 'sonicTopographyPaletteColors');
const collisionBody = functionBody('sonicRainCollisionHeight', 'resetSonicRainDrop');
const updateAudioBody = functionBody('updateAudioSpectrum', 'drawLowFrequencyGraph');
const audioStateStart = app.indexOf('  audioAnalysis: {');
const audioStateEnd = app.indexOf('  lowFrequencyGraph: {', audioStateStart);
const audioState = app.slice(audioStateStart, audioStateEnd);
const moundLift = app.match(/float groundMoundLift\s*=\s*([^;]+);/)?.[1] ?? '';

const checks = {
  peaksReuseExistingTerrainInstances:
    /const count = SONIC_TOPOGRAPHY_GRID \* SONIC_TOPOGRAPHY_GRID/.test(app)
    && /new THREE\.InstancedMesh\(geometry, material, count\)/.test(app)
    && /attribute float aGroundMoundMask;/.test(app),
  ringsAndPhasesAreLayered:
    /float groundRingWaveA =/.test(app)
    && /float groundRingWaveB =/.test(app)
    && /float groundCrossWave =/.test(app)
    && /groundRingWaveA \* 0\.48\s*\+ groundRingWaveB \* 0\.32 \+ groundCrossWave \* 0\.2/.test(app),
  peaksRemainPositiveAndFollowLowFrequency:
    moundLift.includes('aGroundMoundMask')
    && moundLift.includes('moundColumnStaticBase')
    && moundLift.includes('moundColumnAudioLift')
    && /float moundLowDrive = clamp\([\s\S]{0,180}?uLowFrequencyAmplitude/.test(app)
    && /float moundColumnAudioDrive = clamp\([\s\S]{0,220}?moundColumnBandDrive/.test(app)
    && /float moundColumnStaticBase = mix\(/.test(app)
    && !/groundMoundLift\s*=\s*[^;]*-\s*(?:uLowFrequencyAmplitude|moundLowDrive)/.test(app),
  fullTerrainPeaksAreFixedIrregularAndIndependent:
    /function sonicTerrainMoundFieldAt\(x, z\)/.test(app)
    && /broad \* 0\.48 \+ diagonal \* 0\.34 \+ cross \* 0\.18/.test(app)
    && /SONIC_GROUND_MOUND_NEIGHBOR_CELLS = 2/.test(app)
    && /SONIC_GROUND_MOUND_CENTERS\[gridZ \* SONIC_GROUND_MOUND_GRID_SIZE \+ gridX\]/.test(app)
    && !/groundMoundCount|allGroundFloat|uAllGroundFloat/.test(app),
  centerColumnsKeepIndependentAudioRange:
    /float bassColumnPedestalLift = bassColumnBlend/.test(app)
    && /float centerColumnAudioLift = centerColumnRawLift <= centerColumnKnee/.test(app)
    && /const centerColumnAudioLift = sonicCenterColumnSoftLimit\(/.test(app)
    && /SONIC_CENTER_COLUMN_MAX_LIFT = MOBILE_RENDER_TARGET \? 9\.6 : 13\.2/.test(app)
    && /float bassColumnImpactDrive = bassColumnDrive/.test(app)
    && /float bassColumnCoreLowFrequencyGain = mix\(/.test(app)
    && /float bassColumnLayerTier =/.test(app)
    && /float bassColumnDynamicScale =/.test(app),
  movementStaysVertical:
    /pos\.y = -0\.5 \+ yPos \* totalHeight/.test(materialBody)
    && !/pos\.(?:x|z)\s*[+\-*/]?=/.test(materialBody),
  entranceIsOneShotSmoothAndStaggered:
    /const SONIC_GROUND_ENTRANCE_SECONDS = MOBILE_RENDER_TARGET \? 1\.65 : 2\.15/.test(app)
    && /groundEntranceProgress < 1/.test(updateBody)
    && /groundEntranceTime \* groundEntranceTime\s*\* \(3 - 2 \* groundEntranceTime\)/.test(updateBody)
    && /groundEntranceCursor = uGroundEntrance \* 1\.34/.test(app),
  reducedMotionSkipsTheEntrance:
    /if \(reducedMotion\) \{\s*topo\.groundEntranceProgress = 1/.test(updateBody),
  cpuCollisionMirrorsPeakHeights:
    /sonicRainMoundMaskAt\(cellX, cellZ, settings\)/.test(collisionBody)
    && /settings\.groundMoundsEnabled && moundMask > 0/.test(collisionBody)
    && /1 - clusterBlend \* 0\.58/.test(collisionBody),
  qualityTierGridDowngradeIsPreserved:
    /topographyGrid: lowEndAndroid \? 64 : 84/.test(app)
    && /topographyGrid: 184/.test(app)
    && /topographyGrid: 124/.test(app)
    && /topographyGrid: 156/.test(app),
  hotPathAllocatesNoGroundObjects:
    updateBody.length > 0
    && !/new\s+(?:THREE\.|Float\d+Array|Uint\d+Array|Array\b|Object\b)/.test(updateBody)
    && !/\.(?:forEach|map|filter|reduce)\(/.test(updateBody),
  audioAnalysisOwnsReusableLowFrequencyLookup:
    /lowFrequencyBinLower:\s*new Uint16Array\(SONIC_LOW_FREQUENCY_BAND_COUNT\)/.test(audioState)
    && /lowFrequencyBinMix:\s*new Float64Array\(SONIC_LOW_FREQUENCY_BAND_COUNT\)/.test(audioState)
    && /analysis\.lowFrequencyBinLower\[index\] = lowerIndex/.test(updateAudioBody)
    && !/new (?:Uint16Array|Float64Array)/.test(updateAudioBody),
  hiddenSceneDoesNotUpdate:
    /if \(!state\.playbackPage \|\| !isSonicTopographyPreset\(\) \|\| !topo\.uniforms/.test(updateBody),
  noExtraPeakMeshOrAnimationLoop:
    !/(?:const|let|var)\s+groundMound\w*\s*=\s*new THREE\.(?:Mesh|InstancedMesh|Points)/i.test(app)
    && !/requestAnimationFrame[\s\S]{0,240}?groundMound/i.test(app)
};

const entranceSamples = Array.from({ length: 21 }, (_, index) => {
  const time = index / 20;
  return time * time * (3 - 2 * time);
});
checks.entranceCurveIsMonotonic = entranceSamples.every((value, index) => (
  index === 0 || value >= entranceSamples[index - 1]
));

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
process.stdout.write(`${JSON.stringify({
  pass: failures.length === 0,
  parameters: { entranceSeconds: { desktop: 2.15, mobile: 1.65 }, phaseLayers: 3 },
  checks,
  failures
}, null, 2)}\n`);
process.exitCode = failures.length === 0 ? 0 : 1;
