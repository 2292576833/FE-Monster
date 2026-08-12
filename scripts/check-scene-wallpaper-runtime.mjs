import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');
const app = read('web/app.js');
const chladni = read('web/chladni-runtime.js');
const html = read('web/index.html');
const styles = read('web/styles.css');

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

const context = vm.createContext({
  safeText(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }
});
vm.runInContext(`${functionSource(app, 'sceneWallpaperTextureUrl')}; this.resolveSceneWallpaperUrl = sceneWallpaperTextureUrl;`, context);

class FakeVideo {
  constructor() {
    this.listeners = new Map();
    this.paused = true;
    this.src = '';
    this.removedSource = false;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  emit(type) {
    this.listeners.get(type)?.();
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }

  load() {}

  removeAttribute(name) {
    if (name === 'src') {
      this.src = '';
      this.removedSource = true;
    }
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
  TextureLoader: class {
    setCrossOrigin() {}
    load(url, onLoad) {
      onLoad(new FakeTexture(url));
    }
  },
  SRGBColorSpace: 'srgb',
  ClampToEdgeWrapping: 'clamp',
  LinearFilter: 'linear'
};

const sonicVideo = new FakeVideo();
const sonicTopo = {
  built: true,
  wallpaperSurface: {
    visible: false,
    material: {
      map: null,
      opacity: 0,
      needsUpdate: false
    }
  },
  wallpaperTexture: null,
  wallpaperVideo: null,
  wallpaperRequestId: 0,
  wallpaperSignature: ''
};
const sonicContext = vm.createContext({
  state: { sonicTopography: sonicTopo },
  window: { THREE: fakeThree },
  document: { createElement: () => sonicVideo },
  requestOrbFrame() {},
  clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  },
  safeText(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value : fallback;
  }
});
vm.runInContext(
  [
    functionSource(app, 'disposeSonicWallpaperSurface'),
    functionSource(app, 'fitSonicWallpaperTexture'),
    functionSource(app, 'setSonicWallpaperSurface'),
    'this.setSonicWallpaperSurface = setSonicWallpaperSurface;'
  ].join('\n'),
  sonicContext
);
const sonicAcceptedVideo = sonicContext.setSonicWallpaperSurface({
  enabled: true,
  url: '/api/wallpapers/file?path=video.mp4',
  mediaKind: 'video',
  opacity: 0.68
});
sonicVideo.emit('loadeddata');
const sonicLoadedVideo = sonicAcceptedVideo
  && sonicTopo.wallpaperSurface.visible
  && sonicTopo.wallpaperTexture instanceof FakeVideoTexture
  && sonicTopo.wallpaperSurface.material.map === sonicTopo.wallpaperTexture;
sonicContext.setSonicWallpaperSurface({ enabled: false });
const sonicDisposedVideo = sonicVideo.paused
  && sonicVideo.removedSource
  && sonicTopo.wallpaperVideo === null
  && sonicTopo.wallpaperSurface.visible === false;

const chladniVideo = new FakeVideo();
const chladniRuntime = {
  disposed: false,
  THREE: fakeThree,
  wallpaperMesh: {
    visible: false,
    material: {
      map: null,
      opacity: 0,
      needsUpdate: false
    }
  },
  wallpaperTexture: null,
  wallpaperVideo: null,
  wallpaperRequestId: 0,
  wallpaperSignature: ''
};
const chladniContext = vm.createContext({
  document: { createElement: () => chladniVideo },
  clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }
});
vm.runInContext(
  [
    functionSource(chladni, 'disposeWallpaper'),
    functionSource(chladni, 'fitWallpaperTexture'),
    functionSource(chladni, 'setWallpaper'),
    'this.setWallpaper = setWallpaper;'
  ].join('\n'),
  chladniContext
);
const chladniAcceptedVideo = chladniContext.setWallpaper(chladniRuntime, {
  enabled: true,
  url: '/api/wallpapers/file?path=video.mp4',
  mediaKind: 'video',
  opacity: 0.68
});
chladniVideo.emit('loadeddata');
const chladniLoadedVideo = chladniAcceptedVideo
  && chladniRuntime.wallpaperMesh.visible
  && chladniRuntime.wallpaperTexture instanceof FakeVideoTexture
  && chladniRuntime.wallpaperMesh.material.map === chladniRuntime.wallpaperTexture;
chladniContext.setWallpaper(chladniRuntime, { enabled: false });
const chladniDisposedVideo = chladniVideo.paused
  && chladniVideo.removedSource
  && chladniRuntime.wallpaperVideo === null
  && chladniRuntime.wallpaperMesh.visible === false;

const importedImage = {
  id: 'imported:image',
  kind: 'image',
  url: '/api/wallpapers/file?path=image.png'
};
const importedVideo = {
  id: 'imported:video',
  kind: 'video',
  url: '/api/wallpapers/file?path=video.mp4'
};
const wallpaperEngineScene = {
  id: 'wallpaper-engine:scene',
  kind: 'scene',
  previewUrl: '/api/wallpapers/file?path=preview.jpg'
};

const checks = {
  importedImageResolves:
    context.resolveSceneWallpaperUrl(importedImage) === importedImage.url,
  importedVideoResolves:
    context.resolveSceneWallpaperUrl(importedVideo) === importedVideo.url,
  engineSceneUsesSafePreview:
    context.resolveSceneWallpaperUrl(wallpaperEngineScene) === wallpaperEngineScene.previewUrl,
  mediaKindPersists:
    /function\s+normalizeSceneWallpaperSetting[\s\S]*mediaKind/.test(app)
    && /mediaKind:\s*safeText\(wallpaper\?\.kind/.test(app),
  requestCarriesMediaKind:
    /function\s+syncSceneWallpaperSurface[\s\S]*mediaKind:\s*descriptor\.mediaKind/.test(app),
  selectedWallpaperTargetsRememberedScene:
    /function\s+selectWallpaper[\s\S]*SCENE_WALLPAPER_PRESETS\.includes\(state\.scenePreset\)[\s\S]*setSceneWallpaperForPreset\(\s*state\.scenePreset/.test(app),
  softGlowRestoresCoverPaletteBackground:
    /function\s+selectSoftGlowBackground[\s\S]*removeSceneWallpaper/.test(app)
    && /function\s+selectSoftGlowBackground[\s\S]*backgroundEnabled\s*=\s*true/.test(app),
  coverSupportsImageAndVideo:
    /function\s+setCoverParticleWallpaper[\s\S]*createElement\(['"]video['"]\)/.test(app)
    && /function\s+drawCoverParticleWallpaper[\s\S]*videoWidth/.test(app)
    && /wallpaperVideo/.test(app),
  sonicSupportsImageAndVideo:
    /function\s+setSonicWallpaperSurface[\s\S]*VideoTexture/.test(app)
    && /function\s+disposeSonicWallpaperSurface[\s\S]*wallpaperVideo/.test(app)
    && sonicLoadedVideo
    && sonicDisposedVideo,
  chladniSupportsImageAndVideo:
    /function\s+setWallpaper\(runtime,\s*request\)[\s\S]*VideoTexture/.test(chladni)
    && /function\s+disposeWallpaper\(runtime\)[\s\S]*wallpaperVideo/.test(chladni)
    && chladniLoadedVideo
    && chladniDisposedVideo,
  threeSceneRouting:
    /preset\s*===\s*['"]cover-particles['"][\s\S]*setCoverParticleWallpaper/.test(app)
    && /preset\s*===\s*['"]topography['"][\s\S]*setSonicWallpaperSurface/.test(app)
    && /preset\s*===\s*['"]chladni['"][\s\S]*setWallpaper/.test(app),
  importAcceptsSupportedMedia:
    /id="sceneWallpaperImportInput"[^>]*accept="[^"]*image\/png[^"]*video\/mp4/.test(html),
  staysBehindScene:
    /cover-particle-wallpaper-canvas[\s\S]*z-index:\s*-\d+/.test(styles)
    && /wallpaperSurface\.renderOrder\s*=\s*-\d+/.test(app)
    && /mesh\.renderOrder\s*=\s*-\d+/.test(chladni)
    && [app, chladni].every((source) => (
      /depthTest:\s*false/.test(source)
      && /depthWrite:\s*false/.test(source)
    )),
  sonicWallpaperBlendsWithColorGlow:
    /function\s+setSonicWallpaperSurface[\s\S]{0,5000}topo\.background\.visible\s*=\s*true/.test(app)
    && /function\s+disposeSonicWallpaperSurface[\s\S]*topo\.background\.visible\s*=\s*true/.test(app)
    && /bottomFeather/.test(app)
    && /wallpaperSurface\.renderOrder\s*=\s*-\d+/.test(app),
  cameraAnchoredWallpaperSurfaces:
    /camera\.add\(wallpaperSurface\)/.test(app)
    && /camera\.add\(wallpaperMesh\)/.test(chladni)
    && /camera-deep-concave-contain-dome/.test(app)
    && /camera-concave-fullscreen/.test(chladni)
    && /function\s+fitSonicWallpaperSurface/.test(app)
    && /function\s+fitWallpaperSurface/.test(chladni),
  currentSceneOwnsItsControls:
    /id="scenePresetSettingsGroup"[\s\S]*id="sonicPresetControls"[\s\S]*id="chladniPresetControls"[\s\S]*id="sceneWallpaperControl"/.test(html)
    && /function\s+syncScenePresetSettingsGroup/.test(app)
    && /仅显示 \$\{sceneName\} 的开关与调节参数/.test(app)
};

const failed = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const report = {
  ok: failed.length === 0,
  failed,
  checks,
  fixture: {
    importedVideo,
    resolvedUrl: context.resolveSceneWallpaperUrl(importedVideo)
  }
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
