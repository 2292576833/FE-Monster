import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const app = read('web/app.js');
const html = read('web/index.html');
const css = read('web/styles.css');
const runtimePath = path.join(root, 'web', 'harmonic-state-runtime.js');
const runtime = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : '';

const checks = {
  runtimeFile: fs.existsSync(runtimePath),
  runtimeLoadedOnDemand:
    !/<script[^>]+src=["'][^'"]*harmonic-state-runtime\.js/.test(html)
    && /'harmonic-state':\s*Object\.freeze\([\s\S]{0,200}harmonic-state-runtime\.js/.test(app)
    && /ensurePresetRuntime\(runtimeKey\)/.test(app),
  sceneSurface: /id="harmonicStateScene"/.test(html) && /id="harmonicStateCore"/.test(html),
  presetCard: /id="diyHarmonicStatePreset"[\s\S]*data-preset="harmonic-state"/.test(html),
  normalizedPreset: /preset === 'harmonic-state'/.test(app),
  visiblePreset: /isHarmonicStatePreset/.test(app),
  visibilityLifecycle: /updateHarmonicStateVisibility\(\)/.test(app) && /disposeHarmonicState/.test(app),
  frameLoop: /updateHarmonicStateMotion\(\)/.test(app),
  runtimeSourceMap: /globalName: 'FeHarmonicStateRuntime'/.test(app),
  orbitalCore: /FeHarmonicOrbitalCore.create\(THREE\)/.test(runtime) && /group.add\(orbital.group\)/.test(runtime),
  orbitalAtmosphere: /FeHarmonicOrbitalAtmosphere.create\(THREE\)/.test(runtime),
  lazyOrbitalDependencies: /harmonic-orbital-core\.js/.test(app) && /harmonic-orbital-atmosphere\.js/.test(app)
    && /descriptor.dependencies/.test(app),
  glassCards: /drawGlassCard/.test(runtime) && /CARD_CENTER_WIDTH/.test(runtime),
  monospacedGlowTitle: /Cascadia Mono/.test(runtime) && /shadowBlur/.test(runtime),
  lyricProgressIndicator: /uniform float uProgress/.test(runtime)
    && /uProgress\.value = clamp\(frame\.lyricFraction, 0, 1\)/.test(runtime),
  lyricRingCards: /drawLyricCards/.test(runtime) && /previous/.test(runtime) && /next/.test(runtime),
  sevenHorizontalCards: /const CARD_COUNT = 7;/.test(runtime)
    && /gallery\.name = 'HarmonicHorizontalGallery'/.test(runtime)
    && /Array\.from\(\{ length: CARD_COUNT \},[^\n]+createCardMesh\(THREE, gallery, backdrop, i\)/.test(runtime),
  orbitAppliedToCards: /cardOrbitPose\(index, CARD_COUNT, phase\)/.test(runtime)
    && /card\.mesh\.position\.set\(pose\.x, pose\.y, pose\.z\)/.test(runtime),
  lyricKeyAdvancesReadingCard: /lyricKey !== runtime\.lastLyricKey/.test(runtime)
    && /runtime\.activeSlot = \(runtime\.activeSlot \+ 1\) % CARD_COUNT/.test(runtime)
    && /runtime\.targetPhase = -runtime\.activeSlot \* CARD_ORBIT_STEP/.test(runtime),
  songChangeResetsOrbit: /songKey !== runtime\.lastSongKey/.test(runtime)
    && /runtime\.basePhase = runtime\.targetPhase = 0/.test(runtime)
    && /runtime\.activeSlot = 0/.test(runtime),
  noUnboundedRise: !/SPIRAL_RISE_PER_TURN|spiralRise|lyricLift|liftCurve/.test(runtime),
  lyricWindowFrame: /frame\.lines = lyricWindow/.test(app) && /frame\.entries = lyricWindow\.entries/.test(app),
  unifiedLyricClockFrame: /effectivePlaybackLyricTime\(position\)/.test(app)
    && /harmonicStateLyricWindow\(displayTime\)/.test(app)
    && /lyricProgressForLineAtTime\(line, displayTime, bookLyricProgressEndTime\(line, lineEnd\)\)/.test(app),
  musicResponsive: /uBass/.test(runtime) && /uBeat/.test(runtime) && /uTreble/.test(runtime) && /uEnergy/.test(runtime),
  centralCrystalRemoved: !/group\.add\(crystalColumn\.group\)|runtime\.crystalColumn/.test(runtime),
  orbitalMusicDrive: /runtime\.orbital\.update\(effectsFrame\)/.test(runtime)
    && /mid: runtime\.mid, treble: runtime\.treble/.test(runtime),
  orbitalDispose: /runtime\.orbital\.dispose\(\)/.test(runtime) && /runtime\.atmosphere\.dispose\(\)/.test(runtime),
  playingGatedMotion: /if \(playing && !reducedMotion\) runtime\.lyricMotionTime \+= dt/.test(runtime)
    && /playing \|\| idleMotion/.test(runtime)
    && /if \(playing\) runtime\.basePhase \+= phaseDelta/.test(runtime),
  glassSceneRefraction: /WebGLRenderTarget/.test(runtime)
    && /texture2D\(uScene/.test(runtime) && /runtime\.renderer\.setRenderTarget\(runtime\.backdrop\)/.test(runtime),
  completeLyricText: /layoutCardText/.test(runtime) && /Array\.from\(paragraph\)/.test(runtime)
    && !/line\.slice\(0, 18\)|toUpperCase\(\)\.split/.test(runtime),
  yawPitchZoom: /frame\.yaw/.test(runtime) && /frame\.pitch/.test(runtime) && /frame\.zoom/.test(runtime),
  paletteDriven: /setPalette: applyPalette/.test(runtime) && /coverColors/.test(runtime) && /uColorHot/.test(runtime)
    && /runtime\.orbital\.setPalette\(colors\)/.test(runtime)
    && /if \(runtime\.entries\) drawLyricCards\(runtime, runtime\.entries\)/.test(runtime),
  starDust: /buildStarDust/.test(runtime) && /HarmonicStarDust/.test(runtime),
  reducedMotion: /reducedMotion/.test(runtime),
  renderQuality: /setRenderQuality/.test(runtime) && /renderQualityDiagnostics/.test(runtime),
  diagnosticSnapshot: /FeHarmonicStateRuntime/.test(runtime) && /diagnostics/.test(runtime)
    && /cardCount: runtime\.cards\.length/.test(runtime)
    && /orbitPhase: runtime\.orbitPhase/.test(runtime) && /maxCardY:/.test(runtime) && /finiteUniforms/.test(runtime),
  adaptiveDensity: /MOBILE_RENDER_TARGET/.test(app) && /particleCount/.test(runtime),
  sceneStyling: /\.harmonic-state-scene/.test(css) && /\.harmonic-state-canvas/.test(css),
  syncSceneName: /\u8c10\u6ce2\u4e4b\u5883/.test(app),
  outputEncoding: /sRGBEncoding/.test(runtime),
  toneMapping: /ACESFilmicToneMapping/.test(runtime),
  disposeResources: /forceContextLoss/.test(runtime) && /runtime\.renderer\.domElement\.remove\(\)/.test(runtime)
    && /runtime\.backdrop\.dispose\(\)/.test(runtime)
    && /card\.texture\.dispose\(\)/.test(runtime)
    && /card\.mesh\.geometry\.dispose\(\)/.test(runtime)
    && /card\.glassMaterial\.dispose\(\)/.test(runtime)
    && /runtime\.renderQuality\?\.dispose\?\.\(\)/.test(runtime)
};

// Execute the real pure orbit and frame adapter; the browser suite separately
// covers rendering. These probes fail on drift or a competing lyric clock.
const probeErrors = [];
try {
  const start = runtime.indexOf('  function cardOrbitPose(');
  const end = runtime.indexOf('  function layoutCardText(', start);
  if (start < 0 || end < 0) throw new Error('Cannot locate card orbit function');
  const orbit = vm.runInNewContext(`const TAU = Math.PI * 2;\n${runtime.slice(start, end)}\ncardOrbitPose`);
  checks.closedHorizontalOrbit = [0, 0.4, 2, 10, 400, 20000].every(phase =>
    Array.from({ length: 7 }, (_, index) => {
      const pose = orbit(index, 7, phase);
      const loop = orbit(index, 7, phase + Math.PI * 2);
      return Object.values(pose).every(Number.isFinite)
        && Math.abs(pose.y) < 1.3 && Math.abs(pose.x) <= 9.5 && Math.abs(pose.z) <= 5
        && ['x', 'y', 'z'].every(axis => Math.abs(pose[axis] - loop[axis]) < 1e-7);
    }).every(Boolean));
} catch (error) {
  checks.closedHorizontalOrbit = false;
  probeErrors.push(String(error.stack || error));
}

try {
  const start = app.indexOf('function harmonicStateSongSignature(');
  const end = app.indexOf('function harmonicStateRuntimeSnapshot(', start);
  if (start < 0 || end < 0) throw new Error('Cannot locate harmonic frame adapter');
  const calls = {};
  const state = {
    playbackPage: true, bilingualLyricsEnabled: true,
    currentSong: { provider: 'fixture', id: 'song-a', title: '测试歌曲', artist: '测试歌手', duration: 100, position: 99 },
    lyricIndex: 0, // Deliberately stale; the effective display clock must select the line.
    lyricLines: Array.from({ length: 9 }, (_, index) => ({ time: index * 5, text: `完整歌词${index}`, translationText: `译文${index}` })),
    harmonicState: { runtime: {}, zoom: 1.3, frame: {}, lastSongSignature: '' },
    audioAnalysis: { live: true, bass: 0.4, energy: 0.3, mid: 0.2, treble: 0.1, beat: 0.25 },
    visual: {}, playbackVisual: { yaw: 0.2, pitch: -0.1, zoom: 0.9 }, presetFsr: { lastDiagnostics: {} }
  };
  const context = vm.createContext({
    state, els: { audio: { duration: 100 } }, reducedMotion: false, HARMONIC_DEFAULT_ZOOM: 2.35,
    performance: { now: () => 1000 },
    safeText: (value, fallback = '') => value == null || value === '' ? fallback : String(value),
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    isHarmonicStatePreset: () => true,
    isPlaybackClockRunning: () => calls.playing !== false,
    currentPlaybackLyricTime: fallback => { calls.fallback = fallback; return 20; },
    effectivePlaybackLyricTime: position => { calls.position = position; return 20.25; },
    findLyricIndexAtDisplayTime: (lines, displayTime) => { calls.windowTime = displayTime; return 4; },
    bookLyricProgressEndTime: (line, lineEnd) => { calls.lineEnd = lineEnd; return lineEnd - 0.5; },
    lyricProgressForLineAtTime: (line, displayTime, endTime) => {
      calls.progress = { text: line.text, displayTime, endTime }; return 0.37;
    },
    applyHarmonicStatePalette: () => { calls.paletteChanges = (calls.paletteChanges || 0) + 1; },
    presetFsrOutputPixelRatio: () => 1.5,
    proxiedImageUrl: value => value,
    window: { FeHarmonicStateRuntime: { update: (_, frame) => { calls.frame = structuredClone(frame); } } }
  });
  const secondaryStart = app.indexOf('function playbackLyricSubtitle(');
  const secondaryEnd = app.indexOf('const LYRIC_TIME_PATTERN', secondaryStart);
  if (secondaryStart < 0 || secondaryEnd < 0) throw new Error('Cannot locate shared subtitle helpers');
  vm.runInContext(app.slice(secondaryStart, secondaryEnd) + '\n' + app.slice(start, end), context);
  vm.runInContext('updateHarmonicStateMotion()', context);
  const first = calls.frame;
  checks.effectiveClockBehavior = calls.fallback === 99 && calls.position === 20 && calls.windowTime === 20.25
    && calls.progress.displayTime === 20.25 && calls.progress.text === '完整歌词4'
    && calls.lineEnd === 25 && calls.progress.endTime === 24.5 && first.lyricFraction === 0.37 && first.progress === 0.2;
  checks.sevenEntryWindowBehavior = first.entries.length === 7
    && first.entries.filter(entry => entry.active).length === 1 && first.entries[3].active
    && first.entries.every((entry, index) => entry.text === `完整歌词${index + 1}` && entry.subtitle === `译文${index + 1}`)
    && first.lines.previous === '完整歌词3' && first.lines.current === '完整歌词4' && first.lines.next === '完整歌词5';
  checks.cameraAndAudioFrameBehavior = first.playing && first.bass === 0.4 && first.energy === 0.3
    && first.yaw === 0.2 && first.pitch === -0.1 && first.zoom === 1.3 && first.pixelRatio === 1.5;
  state.harmonicState.zoom = undefined;
  vm.runInContext('updateHarmonicStateMotion()', context);
  checks.harmonicDefaultFarthestCamera = calls.frame.zoom === 2.35 && state.playbackVisual.zoom === 0.9;
  state.harmonicState.zoom = 1.3;
  calls.playing = false;
  vm.runInContext('updateHarmonicStateMotion()', context);
  checks.pausedFrameBehavior = !calls.frame.playing && ['bass', 'energy', 'mid', 'treble', 'beat'].every(key => calls.frame[key] === 0);
  checks.stableLyricKeyBehavior = calls.frame.lyricKey === first.lyricKey && calls.frame.songKey === first.songKey
    && first.lyricKey === first.entries[3].key && calls.paletteChanges === 1;
  state.currentSong = { ...state.currentSong, id: 'song-b' };
  vm.runInContext('updateHarmonicStateMotion()', context);
  checks.songChangeKeyBehavior = calls.frame.songKey !== first.songKey && calls.frame.lyricKey !== first.lyricKey
    && calls.frame.entries.every((entry, index) => entry.key !== first.entries[index].key) && calls.paletteChanges === 2;
  state.bilingualLyricsEnabled = false;
  vm.runInContext('updateHarmonicStateMotion()', context);
  checks.bilingualDisabledBehavior = calls.frame.entries.every(entry => entry.subtitle === state.currentSong.artist);
  state.bilingualLyricsEnabled = true;
  state.lyricLines[4].translationText = state.lyricLines[4].text;
  vm.runInContext('updateHarmonicStateMotion()', context);
  checks.translationDeduplicationBehavior = calls.frame.entries[3].subtitle === state.currentSong.artist
    && calls.frame.entries[2].subtitle === '译文3';
} catch (error) {
  checks.effectiveClockBehavior = false;
  probeErrors.push(String(error.stack || error));
}

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({ pass: failures.length === 0, checks, failures, probeErrors }, null, 2));
if (failures.length) process.exit(1);
