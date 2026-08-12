import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const app = read('web/app.js');
const chladni = read('web/chladni-runtime.js');
const rhythmGame = read('web/rhythm-game.js');
const html = read('web/index.html');
const continuityPath = path.join(root, 'web', 'wallpaper-video-continuity.js');
const continuity = existsSync(continuityPath) ? readFileSync(continuityPath, 'utf8') : '';

function functionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`missing function ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

class FakeVideo {
  constructor() {
    this.listeners = new Map();
    this.paused = true;
    this.ended = false;
    this.src = '';
    this.duration = 8;
    this.readyState = 4;
    this._currentTime = 0;
    this.loop = false;
    this.loadCount = 0;
    this.playCount = 0;
    this.seekCount = 0;
    this.nativeLoopCount = 0;
    this.presentedFrame = 'first';
  }

  get currentTime() {
    return this._currentTime;
  }

  set currentTime(value) {
    this._currentTime = Number(value) || 0;
    this.seekCount += 1;
    this.ended = false;
    this.emit('seeked');
  }

  addEventListener(type, listener, options = {}) {
    const entries = this.listeners.get(type) || [];
    entries.push({ listener, once: options?.once === true });
    this.listeners.set(type, entries);
  }

  removeEventListener(type, listener) {
    const entries = this.listeners.get(type) || [];
    this.listeners.set(type, entries.filter((entry) => entry.listener !== listener));
  }

  emit(type, event = {}) {
    const entries = [...(this.listeners.get(type) || [])];
    entries.forEach((entry) => {
      entry.listener({ type, target: this, ...event });
      if (entry.once) this.removeEventListener(type, entry.listener);
    });
  }

  reachEnd() {
    this._currentTime = this.duration;
    this.ended = true;
    this.presentedFrame = 'last';
    if (this.loop) {
      // Chromium's native media loop may briefly clear its compositor surface
      // while the decoder seeks back to the first keyframe.
      this.nativeLoopCount += 1;
      this.presentedFrame = 'blank';
      this._currentTime = 0;
      this.ended = false;
      return;
    }
    this.emit('ended');
  }

  play() {
    this.paused = false;
    this.ended = false;
    this.playCount += 1;
    this.emit('play');
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.emit('pause');
  }

  load() {
    this.loadCount += 1;
    this.emit('loadstart');
  }

  removeAttribute(name) {
    if (name === 'src') this.src = '';
  }
}

class FakeTexture {
  constructor(source = null) {
    this.source = source;
    this.disposed = false;
  }

  dispose() {
    this.disposed = true;
  }
}

class FakeVideoTexture extends FakeTexture {}

const fakeThree = {
  VideoTexture: FakeVideoTexture,
  TextureLoader: class {},
  SRGBColorSpace: 'srgb',
  ClampToEdgeWrapping: 'clamp',
  LinearFilter: 'linear'
};

function makeContext(extra = {}) {
  const context = vm.createContext({
    console,
    setTimeout: () => 1,
    clearTimeout() {},
    clamp(value, minimum, maximum) {
      return Math.min(maximum, Math.max(minimum, Number(value) || 0));
    },
    safeText(value, fallback = '') {
      return typeof value === 'string' && value.trim() ? value : fallback;
    },
    ...extra
  });
  context.window = context;
  context.globalThis = context;
  if (continuity) vm.runInContext(continuity, context);
  return context;
}

function exerciseSonicBoundary() {
  const video = new FakeVideo();
  const topo = {
    built: true,
    wallpaperSurface: {
      visible: false,
      material: { map: null, opacity: 0, needsUpdate: false }
    },
    background: { visible: true },
    wallpaperTexture: null,
    wallpaperVideo: null,
    wallpaperRequestId: 0,
    wallpaperSignature: ''
  };
  const context = makeContext({
    state: { sonicTopography: topo },
    document: { createElement: () => video },
    requestOrbFrame() {}
  });
  context.THREE = fakeThree;
  vm.runInContext([
    functionSource(app, 'disposeSonicWallpaperSurface'),
    functionSource(app, 'fitSonicWallpaperTexture'),
    functionSource(app, 'setSonicWallpaperSurface'),
    'this.setSonicWallpaperSurface = setSonicWallpaperSurface;'
  ].join('\n'), context);
  context.setSonicWallpaperSurface({
    enabled: true,
    url: '/api/wallpapers/file?path=loop.mp4',
    mediaKind: 'video',
    opacity: 1
  });
  video.emit('loadeddata');
  const texture = topo.wallpaperTexture;
  const loadCount = video.loadCount;
  video.reachEnd();
  return {
    noBlankFrame: video.presentedFrame === 'last',
    manuallyRestarted: video.nativeLoopCount === 0 && video.seekCount > 0 && video.playCount >= 2,
    noReload: video.loadCount === loadCount,
    sameVideoAndTexture: topo.wallpaperVideo === video && topo.wallpaperTexture === texture && texture?.disposed !== true,
    surfaceStayedVisible: topo.wallpaperSurface.visible === true
  };
}

function exerciseChladniBoundary() {
  const video = new FakeVideo();
  const runtime = {
    disposed: false,
    THREE: fakeThree,
    wallpaperMesh: {
      visible: false,
      material: { map: null, opacity: 0, needsUpdate: false }
    },
    wallpaperTexture: null,
    wallpaperVideo: null,
    wallpaperRequestId: 0,
    wallpaperSignature: ''
  };
  const context = makeContext({ document: { createElement: () => video } });
  vm.runInContext([
    functionSource(chladni, 'disposeWallpaper'),
    functionSource(chladni, 'fitWallpaperTexture'),
    functionSource(chladni, 'setWallpaper'),
    'this.setWallpaper = setWallpaper;'
  ].join('\n'), context);
  context.setWallpaper(runtime, {
    enabled: true,
    url: '/api/wallpapers/file?path=loop.mp4',
    mediaKind: 'video',
    opacity: 1
  });
  video.emit('loadeddata');
  const texture = runtime.wallpaperTexture;
  const loadCount = video.loadCount;
  video.reachEnd();
  return {
    noBlankFrame: video.presentedFrame === 'last',
    manuallyRestarted: video.nativeLoopCount === 0 && video.seekCount > 0 && video.playCount >= 2,
    noReload: video.loadCount === loadCount,
    sameVideoAndTexture: runtime.wallpaperVideo === video && runtime.wallpaperTexture === texture && texture?.disposed !== true,
    surfaceStayedVisible: runtime.wallpaperMesh.visible === true
  };
}

function exerciseSonicReplacementLifecycle() {
  const videos = [new FakeVideo(), new FakeVideo(), new FakeVideo()];
  let nextVideo = 0;
  const topo = {
    built: true,
    wallpaperSurface: {
      visible: false,
      material: { map: null, opacity: 0, needsUpdate: false }
    },
    background: { visible: true },
    wallpaperTexture: null,
    wallpaperVideo: null,
    wallpaperRequestId: 0,
    wallpaperSignature: ''
  };
  const context = makeContext({
    state: { sonicTopography: topo },
    document: { createElement: () => videos[nextVideo++] },
    requestOrbFrame() {}
  });
  context.THREE = fakeThree;
  vm.runInContext([
    functionSource(app, 'disposeSonicWallpaperSurface'),
    functionSource(app, 'fitSonicWallpaperTexture'),
    functionSource(app, 'setSonicWallpaperSurface'),
    'this.setSonicWallpaperSurface = setSonicWallpaperSurface;'
  ].join('\n'), context);

  const useVideo = (name) => context.setSonicWallpaperSurface({
    enabled: true,
    url: `/api/wallpapers/file?path=${name}.mp4`,
    mediaKind: 'video',
    opacity: 1
  });
  useVideo('a');
  videos[0].emit('loadeddata');
  const firstCounts = { play: videos[0].playCount, seek: videos[0].seekCount };
  useVideo('b');
  videos[0].reachEnd();
  const replacedReleased = videos[0].playCount === firstCounts.play
    && videos[0].seekCount === firstCounts.seek;
  useVideo('c');
  const failedCounts = { play: videos[2].playCount, seek: videos[2].seekCount };
  videos[2].emit('error');
  videos[2].reachEnd();
  const failedReleased = videos[2].playCount === failedCounts.play
    && videos[2].seekCount === failedCounts.seek;
  return { replacedReleased, failedReleased };
}

function exerciseChladniReplacementLifecycle() {
  const videos = [new FakeVideo(), new FakeVideo(), new FakeVideo()];
  let nextVideo = 0;
  const runtime = {
    disposed: false,
    THREE: fakeThree,
    wallpaperMesh: {
      visible: false,
      material: { map: null, opacity: 0, needsUpdate: false }
    },
    wallpaperTexture: null,
    wallpaperVideo: null,
    wallpaperRequestId: 0,
    wallpaperSignature: ''
  };
  const context = makeContext({ document: { createElement: () => videos[nextVideo++] } });
  vm.runInContext([
    functionSource(chladni, 'disposeWallpaper'),
    functionSource(chladni, 'fitWallpaperTexture'),
    functionSource(chladni, 'setWallpaper'),
    'this.setWallpaper = setWallpaper;'
  ].join('\n'), context);

  const useVideo = (name) => context.setWallpaper(runtime, {
    enabled: true,
    url: `/api/wallpapers/file?path=${name}.mp4`,
    mediaKind: 'video',
    opacity: 1
  });
  useVideo('a');
  videos[0].emit('loadeddata');
  const firstCounts = { play: videos[0].playCount, seek: videos[0].seekCount };
  useVideo('b');
  videos[0].reachEnd();
  const replacedReleased = videos[0].playCount === firstCounts.play
    && videos[0].seekCount === firstCounts.seek;
  useVideo('c');
  const failedCounts = { play: videos[2].playCount, seek: videos[2].seekCount };
  videos[2].emit('error');
  videos[2].reachEnd();
  const failedReleased = videos[2].playCount === failedCounts.play
    && videos[2].seekCount === failedCounts.seek;
  return { replacedReleased, failedReleased };
}

const sonic = exerciseSonicBoundary();
const chladniResult = exerciseChladniBoundary();
const sonicLifecycle = exerciseSonicReplacementLifecycle();
const chladniLifecycle = exerciseChladniReplacementLifecycle();
const checks = {
  continuityRuntimeExists: continuity.length > 0,
  sonicBoundaryIsContinuous: Object.values(sonic).every(Boolean),
  chladniBoundaryIsContinuous: Object.values(chladniResult).every(Boolean),
  sonicReplacementReleasesContinuity: Object.values(sonicLifecycle).every(Boolean),
  chladniReplacementReleasesContinuity: Object.values(chladniLifecycle).every(Boolean),
  mainWallpaperUsesContinuityRuntime:
    /function\s+applyWallpaperMedia[\s\S]*FeWallpaperVideoContinuity\?\.prepare\(els\.wallpaperVideo/.test(app),
  sonicUsesContinuityRuntime:
    /function\s+setSonicWallpaperSurface[\s\S]*FeWallpaperVideoContinuity\?\.prepare\(video/.test(app),
  coverParticlesUseContinuityRuntime:
    /function\s+setCoverParticleWallpaper[\s\S]*FeWallpaperVideoContinuity\?\.prepare\(video/.test(app),
  communityBackgroundUsesContinuityRuntime:
    /function\s+syncCommunityMessageBackground[\s\S]*FeWallpaperVideoContinuity\?\.prepare\(video/.test(app),
  chladniUsesContinuityRuntime:
    /function\s+setWallpaper\(runtime,\s*request\)[\s\S]*FeWallpaperVideoContinuity\?\.prepare\(video/.test(chladni),
  rhythmGameUsesContinuityRuntime:
    /function\s+setBackgroundMedia[\s\S]*FeWallpaperVideoContinuity\?\.prepare\(els\.backgroundVideo/.test(rhythmGame),
  nativeLoopAttributesRemoved:
    !/<video[^>]+(?:wallpaperVideo|rhythmGameBackgroundVideo)[^>]+\bloop\b/.test(html),
  sameMainWallpaperDoesNotReload:
    /function\s+applyWallpaperMedia[\s\S]*mediaSignature[\s\S]*===\s*signature[\s\S]*return/.test(app)
};

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({
  ok: failed.length === 0,
  failed,
  checks,
  sonic,
  chladni: chladniResult,
  sonicLifecycle,
  chladniLifecycle
}, null, 2));
assert.deepEqual(failed, []);
