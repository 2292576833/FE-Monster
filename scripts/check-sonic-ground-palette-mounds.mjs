import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = readFileSync(path.join(root, 'web', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

const groundMoundLiftExpression = app.match(
  /float groundMoundLift\s*=\s*([^;]+);/
)?.[1] ?? '';
const audioElevationExpression = app.match(
  /float audioElevation\s*=\s*([^;]+);/
)?.[1] ?? '';
const moundLowDriveExpression = app.match(
  /float moundLowDrive\s*=\s*([^;]+);/
)?.[1] ?? '';
const moundRiseExpression = app.match(
  /float moundRise\s*=\s*([^;]+);/
)?.[1] ?? '';

const checks = {
  groundControlsAreGroupedWithPeakToggle:
    /id="sonicGroundFeatureGroup"[\s\S]*?id="sonicGroundMoundsToggle"[\s\S]*?id="sonicGroundPaletteMode"[\s\S]*?id="sonicGroundFollowCoverButton"[\s\S]*?id="sonicGroundColorInput"[\s\S]*?id="sonicGroundEmissionRange"[\s\S]*?id="sonicGroundMoundHeightRange"[\s\S]*?id="sonicGroundMoundRadiusRange"[\s\S]*?<\/details>/.test(html),
  settingsAreNormalizedAndPersisted:
    /groundColor:\s*null/.test(app)
    && /groundEmission:\s*0\.\d+/.test(app)
    && /groundMoundsEnabled:\s*true/.test(app)
    && /groundMoundHeight:\s*1\.45/.test(app)
    && /groundMoundRadius:\s*18/.test(app)
    && /groundColor:\s*normalizeOptionalColor\(source\?\.groundColor\)/.test(app)
    && /groundEmission:\s*bounded\(source\?\.groundEmission,[^\n]+0,\s*1\.5\)/.test(app)
    && /groundMoundsEnabled:\s*source\?\.groundMoundsEnabled !== false/.test(app)
    && /groundMoundHeight:\s*bounded\(source\?\.groundMoundHeight,[^\n]+0,\s*4\)/.test(app)
    && /groundMoundRadius:\s*bounded\(source\?\.groundMoundRadius,[^\n]+16,\s*30\)/.test(app),
  coverColorReusesTheSonicPalette:
    /function resolvedSonicGroundColor\(\)/.test(app)
    && /sonicCoverBackgroundColors\(topo\.palette/.test(app)
    && /settings\.groundColor\s*\|\|\s*automatic/.test(app)
    && /sonicGroundFollowCoverButton[\s\S]{0,420}?settings\.groundColor\s*=\s*null/.test(app),
  settingsReachTheExistingTerrainShader:
    /uGroundColor:\s*\{\s*value:/.test(app)
    && /uGroundEmission:\s*\{\s*value:\s*DEFAULT_SONIC_SETTINGS\.groundEmission\s*\}/.test(app)
    && /uGroundMoundHeight:\s*\{\s*value:\s*DEFAULT_SONIC_SETTINGS\.groundMoundHeight\s*\}/.test(app)
    && /uniform vec3 uGroundColor;/.test(app)
    && /uniform float uGroundEmission;/.test(app)
    && /uniform float uGroundMoundHeight;/.test(app)
    && /uGroundColor\.value\.set\(resolvedSonicGroundColor\(\)\)/.test(app)
    && /uGroundEmission\.value\s*=\s*settings\.groundEmission/.test(app)
    && /uGroundMoundHeight\.value\s*=\s*settings\.groundMoundsEnabled[\s\S]{0,100}?settings\.groundMoundHeight[\s\S]{0,40}?: 0/.test(app),
  moundMaskIsAStaticInstanceAttribute:
    /attribute float aGroundMoundMask;/.test(app)
    && /attribute vec4 aGroundMoundColumnProfile;/.test(app)
    && /new THREE\.InstancedBufferAttribute\(groundMoundMaskValues,\s*1\)/.test(app)
    && /geometry\.setAttribute\(['"]aGroundMoundMask['"]/.test(app)
    && /geometry\.setAttribute\(['"]aGroundMoundColumnProfile['"]/.test(app)
    && /groundMoundMaskAttribute\.setUsage\(THREE\.DynamicDrawUsage\)/.test(app)
    && /function updateSonicGroundMoundMask\(/.test(app),
  moundsStayTerrainReliefAndYieldToCenterColumns:
    !groundMoundLiftExpression.includes('uAllGroundFloat')
    && groundMoundLiftExpression.includes('aGroundMoundMask')
    && groundMoundLiftExpression.includes('(1.0 - bassColumnBlend * 0.58)')
    && groundMoundLiftExpression.includes('uGroundMoundHeight')
    && groundMoundLiftExpression.includes('moundColumnStaticBase')
    && groundMoundLiftExpression.includes('moundColumnAudioLift')
    && groundMoundLiftExpression.includes('groundEntrance')
    && !/uColumnHeightScale/.test(groundMoundLiftExpression)
    && !/groundMound/i.test(audioElevationExpression)
    && /float elevation\s*=\s*idleElevation \+ bassColumnPedestalLift \+ audioElevation \+ groundMoundLift;/.test(app),
  moundsFollowLowFrequencyWithoutDroppingBelowGround:
    /uLowFrequencyAmplitude \* 0\.72 \+ uSubBass \* 0\.18 \+ uBass \* 0\.1/.test(moundLowDriveExpression)
    && /float moundColumnBandDrive = sampleLowFrequencyBand\(moundColumnBandIndex\)/.test(app)
    && /float moundColumnAudioDrive = clamp\(/.test(app)
    && /float moundColumnImpactDrive = moundColumnAudioDrive \* \(/.test(app)
    && /float moundColumnAudioLift = moundColumnImpactDrive \* mix\(/.test(app)
    && /SONIC_GROUND_MOUND_COLUMN_STATIC_MIN = 0\.42/.test(app)
    && !/-\s*(?:moundLowDrive|moundColumnAudioDrive)/.test(groundMoundLiftExpression),
  moundEntranceReusesTheTerrainShader:
    /uGroundEntrance:\s*\{\s*value:\s*0\s*\}/.test(app)
    && /uniform float uGroundEntrance;/.test(app)
    && /groundEntranceProgress = groundEntranceTime \* groundEntranceTime/.test(app),
  groundEmissionDoesNotTintBassColumns:
    /float groundSurfaceMask\s*=\s*1\.0 - vBassColumnBlend/.test(app)
    && /vec3 groundEmission\s*=[\s\S]{0,260}?groundSurfaceMask/.test(app)
    && /finalColor \+= groundEmission/.test(app),
  noExtraMoundMeshOrAnimationLoop:
    !/(?:const|let|var)\s+groundMound\w*\s*=\s*new THREE\.(?:Mesh|InstancedMesh|Points)/i.test(app)
    && !/requestAnimationFrame[\s\S]{0,180}?groundMound/i.test(app)
};

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

process.stdout.write(`${JSON.stringify({
  pass: failures.length === 0,
  checks,
  failures,
  groundMoundLiftExpression,
  moundLowDriveExpression,
  moundRiseExpression,
  audioElevationExpression
}, null, 2)}\n`);
process.exitCode = failures.length === 0 ? 0 : 1;
