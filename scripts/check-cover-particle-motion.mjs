import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const app = readFileSync(path.join(root, "web", "app.js"), "utf8").replace(/\r\n/g, "\n");
const html = readFileSync(path.join(root, "web", "index.html"), "utf8").replace(/\r\n/g, "\n");
const styles = readFileSync(path.join(root, "web", "styles.css"), "utf8").replace(/\r\n/g, "\n");

const coverRegionStart = app.indexOf("function buildCoverParticleSamples");
const coverRegionEnd = app.indexOf("function updatePlaybackQuality", coverRegionStart);
const coverRegion = coverRegionStart >= 0 && coverRegionEnd > coverRegionStart
  ? app.slice(coverRegionStart, coverRegionEnd)
  : "";
const jitterHotLoopStart = coverRegion.indexOf("if (bassJitterActive)");
const jitterHotLoopEnd = coverRegion.indexOf("const audioGate = motionGate;", jitterHotLoopStart);
const jitterHotLoop = jitterHotLoopStart >= 0 && jitterHotLoopEnd > jitterHotLoopStart
  ? coverRegion.slice(jitterHotLoopStart, jitterHotLoopEnd)
  : "";

const checks = {
  floatSpeedControl: /id="diyCoverParticleFloatSpeedRange"\s+type="range"\s+min="25"\s+max="200"\s+step="1"\s+value="100"/.test(html)
    && /id="diyCoverParticleFloatSpeedValue">100%/.test(html),
  floatSpeedPersists: /const COVER_PARTICLE_PREFS_KEY = 'fe-monster-cover-particle-v1';/.test(app)
    && /function loadCoverParticlePreferences\(\)/.test(app)
    && /function saveCoverParticlePreferences\(\)/.test(app)
    && /floatSpeed:\s*normalizeCoverParticleFloatSpeed/.test(app)
    && /coverParticleFloatSpeed:\s*state\.coverParticle\.floatSpeed/.test(app),
  twoHundredMicroSegments: /const COVER_PARTICLE_MICRO_WAVE_SEGMENTS = 200;/.test(app)
    && /COVER_PARTICLE_MICRO_WAVE_SEGMENTS/.test(coverRegion),
  signedPerParticleFloat: /floatPhase:\s*coverParticleNoise\(x,\s*y,\s*7\)\s*\*\s*Math\.PI\s*\*\s*2/.test(coverRegion)
    && /floatRate:\s*\(coverParticleNoise\(x,\s*y,\s*8\)\s*<\s*0\.5\s*\?\s*-1\s*:\s*1\)/.test(coverRegion),
  gpuAndCpuUseSameNaturalFloat: /float naturalFloat = particleFloat \* 0\.64 \+ baseNaturalWave \* 0\.28 \+ microWave \* 0\.08;/.test(coverRegion)
    && /const naturalFloat = particleFloat \* 0\.64 \+ baseNaturalWave \* 0\.28 \+ microWave \* 0\.08;/.test(coverRegion),
  simpleTravelingFlowGpuCpuParity: /float flowWave = sin\(position\.x \* 4\.2 \+ position\.y \* 2\.3 - sheetTime \* 0\.85\);/.test(coverRegion)
    && /float flowStrength = uAudioActive \* \(0\.006 \+ uEnergy \* 0\.006\) \* min\(uMotionScale, 1\.4\);/.test(coverRegion)
    && /source\.y \+= flowWave \* flowStrength \* 0\.28;/.test(coverRegion)
    && /source\.z \+= flowWave \* flowStrength;/.test(coverRegion)
    && /const flowWave = Math\.sin\(particle\.x \* 4\.2 \+ particle\.y \* 2\.3 - sheetTime \* 0\.85\);/.test(coverRegion)
    && /const flowStrength = audioGate \* \(0\.006 \+ energy \* 0\.006\) \* Math\.min\(motionScale, 1\.4\);/.test(coverRegion)
    && /const flowedSourceY = sourceY \+ flowWave \* flowStrength \* 0\.28;/.test(coverRegion)
    && /const flowedSourceZ = sourceZ \+ flowWave \* flowStrength;/.test(coverRegion),
  floatSpeedGpuCpuParity: /uniform float uFloatSpeed;/.test(coverRegion)
    && /float sheetTime = uTime;/.test(coverRegion)
    && /float particleFloatTime = uTime \* uFloatSpeed;/.test(coverRegion)
    && /float particleFloat = sin\(particleFloatTime \* aFloatRate \+ aFloatPhase\);/.test(coverRegion)
    && /uniforms\.uFloatSpeed\.value = coverParticleFloatSpeedScale\(\);/.test(coverRegion)
    && /const sheetTime = cover\.waveTime;/.test(coverRegion)
    && /const particleFloatTime = cover\.waveTime \* coverParticleFloatSpeedScale\(\);/.test(coverRegion)
    && /const particleFloat = Math\.sin\(particleFloatTime \* particle\.floatRate \+ particle\.floatPhase\);/.test(coverRegion),
  floatSpeedDoesNotDriveWholeSheet: !/sheetTime\s*=\s*(?:uTime|cover\.waveTime)\s*\*\s*(?:uFloatSpeed|coverParticleFloatSpeedScale\(\))/.test(coverRegion),
  lowFrequencyWholeCoverJump: /uniform float uWholeJump;/.test(coverRegion)
    && /const lowFrequencyTarget = audioActive/.test(coverRegion)
    && /const wholeJumpTarget = audioActive/.test(coverRegion)
    && /wholeJumpTarget > cover\.wholeJump \? 72 : 280/.test(coverRegion)
    && /cover\.wholeJump \+= \(wholeJumpTarget - cover\.wholeJump\) \* wholeJumpRate;/.test(coverRegion)
    && /uniforms\.uWholeJump\.value = cover\.wholeJump;/.test(coverRegion)
    && /const wholeJumpOffset = cover\.wholeJump \* 0\.052 \* motionScale;/.test(coverRegion)
    && /source\.z \+= wholeJumpOffset;/.test(coverRegion)
    && !/source\.y \+= wholeJumpOffset;/.test(coverRegion)
    && /const sourceY = particle\.y \+ particle\.bumpDriftY \* lateralWave;/.test(coverRegion)
    && /const sourceZ = particle\.z \+ depthLayerOffset \+ dynamicDepth \+ wholeJumpOffset;/.test(coverRegion),
  lowFrequencyPerParticleJitter: /bassJitter:\s*0,/.test(app)
    && /const bassJitterTarget = audioActive/.test(coverRegion)
    && /smoothstep\(0\.045, 0\.84, lowFrequencyTarget\)/.test(coverRegion)
    && /uniform float uBassJitter;/.test(coverRegion)
    && /uniforms\.uBassJitter\.value = cover\.bassJitter;/.test(coverRegion)
    && /source\.xy \+= bassJitterOffset;/.test(coverRegion)
    && /const jitteredSourceX = sourceX \+ bassJitterX;/.test(coverRegion)
    && /const jitteredSourceY = flowedSourceY \+ bassJitterY;/.test(coverRegion),
  independentJitterPhaseDirectionAndRate: /jitterDirectionX:\s*driftX,/.test(coverRegion)
    && /jitterDirectionY:\s*driftY,/.test(coverRegion)
    && /jitterRate:\s*COVER_PARTICLE_BASS_JITTER_BASE_RATE/.test(coverRegion)
    && /sheetTime \* jitterRate \+ aFloatPhase \* 1\.83 \+ aWavePhase \* 0\.37/.test(coverRegion)
    && /vec2 jitterPerpendicular = vec2\(-jitterDirection\.y, jitterDirection\.x\);/.test(coverRegion)
    && /sheetTime \* particle\.jitterRate[\s\S]*?particle\.floatPhase \* 1\.83 \+ particle\.wavePhase \* 0\.37/.test(jitterHotLoop)
    && /particle\.jitterDirectionX \* jitterA - particle\.jitterDirectionY \* jitterB \* 0\.62/.test(jitterHotLoop),
  smoothBoundedJitterReturnsToRest: /bassJitterTarget > cover\.bassJitter \? 28 : 110/.test(coverRegion)
    && /cover\.bassJitter = clamp\(/.test(coverRegion)
    && /if \(bassJitterTarget === 0 && cover\.bassJitter < 0\.006\) cover\.bassJitter = 0;/.test(coverRegion)
    && /float jitterLevel = clamp\(uBassJitter, 0\.0,/.test(coverRegion)
    && /vec2\(-1\.25\),[\s\S]*?vec2\(1\.25\)/.test(coverRegion)
    && /COVER_PARTICLE_BASS_JITTER_DEPTH_LIMIT/.test(coverRegion),
  jitterHotLoopHasNoFrameAllocations: jitterHotLoop.length > 0
    && !/\bnew\s+(?:Array|Float(?:32|64)Array)|Array\.from|\.map\(|\.filter\(|\{\s*[a-zA-Z_$][\w$]*\s*:/.test(jitterHotLoop),
  naturalFloatRemainsIndependentOfLowFrequency: /float naturalFloat = particleFloat \* 0\.64 \+ baseNaturalWave \* 0\.28 \+ microWave \* 0\.08;/.test(coverRegion)
    && /const naturalFloat = particleFloat \* 0\.64 \+ baseNaturalWave \* 0\.28 \+ microWave \* 0\.08;/.test(coverRegion)
    && !/naturalFloat\s*=.*(?:lowFrequency|uWholeJump)/.test(coverRegion),
  playbackClockOnlyGate: /const audioActive = isPlaybackClockRunning\(\);/.test(coverRegion)
    && /const gateTarget = audioActive \? 1 : 0;/.test(coverRegion),
  smoothAttackAndRelease: /gateTarget > cover\.motionGate \? 260 : 420/.test(coverRegion)
    && /cover\.motionGate \+= \(gateTarget - cover\.motionGate\) \* gateRate;/.test(coverRegion),
  phasePausesWithoutMusic: /if \(audioActive\) cover\.waveTime \+= envelopeStepMs \/ 1000 \* 0\.72;/.test(coverRegion),
  noShockwaveState: !/shockAge|shockStrength|shockCooldown|shockArmed|lastShockDrive|lastBassInput/.test(coverRegion),
  stableCpuFallbackHotPath: /renderFrame:\s*\{\s*canvas:\s*null,/.test(app)
    && /const frame = state\.coverParticle\.renderFrame;/.test(coverRegion)
    && /if \(canvas\.style\.width !== cssWidthStyle\) canvas\.style\.width = cssWidthStyle;/.test(coverRegion)
    && /cpuRadialPhase(?:\s*:|,)/.test(coverRegion)
    && /cpuMicroPhase(?:\s*:|,)/.test(coverRegion)
    && /colorCss:/.test(coverRegion)
    && !/context\.fillStyle = `rgba\(\$\{particle\.rgb\}/.test(coverRegion),
  decodedWallpaperFramesUploadOnce: /const supportsVideoFrames = typeof video\.requestVideoFrameCallback === 'function';/.test(app)
    && /if \(supportsVideoFrames\) \{\s*scheduleCoverParticleWallpaperVideoFrame/.test(app)
    && /else \{\s*video\.addEventListener\('timeupdate', drawCoverParticleWallpaper\);/.test(app),
  coverEntrance: /\.app-shell\.is-playback-page\.has-cover-particle-scene\s+\.cover-particle-rig\s*\{\s*animation:\s*coverParticleSceneEntrance\s+620ms\s+cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)\s+both;\s*\}/.test(styles)
    && /@keyframes\s+coverParticleSceneEntrance\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?translate3d\(0,\s*20px,\s*-150px\)[\s\S]*?100%\s*\{[\s\S]*?opacity:\s*1;/.test(styles),
  chladniEntrance: /\.chladni-canvas\s*\{[\s\S]*?animation:\s*chladniSceneEntrance\s+560ms\s+cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)\s+both;/.test(styles)
    && /@keyframes\s+chladniSceneEntrance\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?100%\s*\{[\s\S]*?opacity:\s*1;/.test(styles),
  reducedMotionFallback: /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.chladni-canvas,\s*\.cover-particle-rig\s*\{\s*animation:\s*none\s*!important;/.test(styles)
};

const output = {
  pass: Object.values(checks).every(Boolean),
  checks,
  failures: Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exitCode = output.pass ? 0 : 1;
