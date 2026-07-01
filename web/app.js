const $ = (selector) => document.querySelector(selector);

const els = {
  bootScreen: $('#bootScreen'),
  bootLightfallMount: $('#bootLightfallMount'),
  bootLogoButton: $('#bootLogoButton'),
  bootLogoText: $('#bootLogoText'),
  audio: $('#audio'),
  appShell: $('.app-shell'),
  stage: $('.stage'),
  canvas: $('#orbCanvas'),
  dockCover: $('#dockCover'),
  dockStatus: $('#dockStatus'),
  dockTitle: $('#dockTitle'),
  dockArtist: $('#dockArtist'),
  playButton: $('#playButton'),
  prevButton: $('#prevButton'),
  nextButton: $('#nextButton'),
  searchForm: $('#topSearchForm'),
  searchInput: $('#topSearchInput'),
  loginButton: $('#neteaseLoginButton'),
  loginLabel: $('#neteaseLoginLabel'),
  homeButton: $('#homeButton'),
  diyButton: $('#diyButton'),
  diySidebar: $('#diySidebar'),
  diyCloseButton: $('#diyCloseButton'),
  diyPresetButton: $('#diyPresetButton'),
  diyPresetPage: $('#diyPresetPage'),
  diyLyricPreset: $('#diyLyricPreset'),
  diyCubePreset: $('#diyCubePreset'),
  lyricBrightnessRange: $('#lyricBrightnessRange'),
  lyricBrightnessValue: $('#lyricBrightnessValue'),
  lyricSpeedRange: $('#lyricSpeedRange'),
  lyricSpeedValue: $('#lyricSpeedValue'),
  cubeIntensityRange: $('#cubeIntensityRange'),
  cubeIntensityValue: $('#cubeIntensityValue'),
  spectrumStatus: $('#spectrumStatus'),
  spectrumBassFill: $('#spectrumBassFill'),
  loginDialog: $('#neteaseLoginDialog'),
  loginClose: $('#neteaseLoginClose'),
  loginRefresh: $('#neteaseQrRefresh'),
  qrShell: $('#neteaseQrShell'),
  qrImage: $('#neteaseQrImage'),
  qrPlaceholder: $('#neteaseQrPlaceholder'),
  qrStatus: $('#neteaseQrStatus'),
  playlistOrbit: $('#orbPlaylists'),
  playlistCards: $('#orbPlaylistCards'),
  playlistStatus: $('#orbPlaylistStatus'),
  playlistShelf: $('#playlistShelf'),
  playlistShelfStage: $('#playlistShelfStage'),
  playlistShelfBack: $('#playlistShelfBack'),
  playlistShelfClose: $('#playlistShelfClose'),
  playlistShelfTitle: $('#playlistShelfTitle'),
  playlistShelfMeta: $('#playlistShelfMeta'),
  playlistShelfCover: $('#playlistShelfCover'),
  playlistShelfCoverImage: $('#playlistShelfCoverImage'),
  playlistShelfBackCover: $('#playlistShelfBackCover'),
  playlistShelfBackCoverImage: $('#playlistShelfBackCoverImage'),
  playlistShelfBackTitle: $('#playlistShelfBackTitle'),
  playlistShelfBackMeta: $('#playlistShelfBackMeta'),
  playlistShelfBackScroll: $('#playlistShelfBackScroll'),
  playlistShelfScroll: $('#playlistShelfScroll'),
  playlistSongStack: $('#playlistSongStack'),
  playlistSongStackBack: $('#playlistSongStackBack'),
  dynamicCubeScene: $('#dynamicCubeScene'),
  dynamicCubeRig: $('#dynamicCubeRig'),
  dynamicCubeCore: $('#dynamicCubeCore'),
  playbackLyricScene: $('#playbackLyricScene'),
  playbackLyricRig: $('#playbackLyricRig'),
  playbackLyricCore: $('#playbackLyricCore'),
  playbackLyricText: $('#playbackLyricText'),
  playbackLyricBack: $('#playbackLyricBack'),
  playbackLyricSubtitle: $('#playbackLyricSubtitle'),
  progressRange: $('#progressRange'),
  currentTime: $('#currentTime'),
  totalTime: $('#totalTime'),
  volumeRange: $('#volumeRange'),
  volumeLabel: $('#volumeLabel'),
  toast: $('#toast')
};

const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const PLAYBACK_REST_YAW = 0.22;
const PLAYBACK_REST_PITCH = -0.16;
const DYNAMIC_CUBE_GRID = 32;
const DYNAMIC_CUBE_BOUNDS = 64;
// A 32^3 voxel field spans a 64^3 volume, with visible air between solid cubes.
const DYNAMIC_CUBE_SIZE = 1.46;
const DYNAMIC_CUBE_GAP = (DYNAMIC_CUBE_BOUNDS - DYNAMIC_CUBE_SIZE) / (DYNAMIC_CUBE_GRID - 1);
const BOOT_LOGO_TEXT = 'FE moster';

const bootVisual = {
  ready: false,
  entering: false,
  logoEnableTimer: 0,
  readyFallbackTimer: 0,
  exitTimer: 0
};

function numberAttr(element, name, fallback) {
  const raw = element.getAttribute(name);
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function supportsSvgBackdropFilter(filterId) {
  const isWebkit = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
  const isFirefox = /Firefox/.test(navigator.userAgent);
  if (isWebkit || isFirefox) return false;

  const test = document.createElement('div');
  test.style.backdropFilter = `url(#${filterId})`;
  return test.style.backdropFilter !== '';
}

function glassProfile(element) {
  return {
    borderRadius: numberAttr(element, 'data-glass-radius', 20),
    borderWidth: numberAttr(element, 'data-glass-border-width', 0.07),
    brightness: numberAttr(element, 'data-glass-brightness', 50),
    opacity: numberAttr(element, 'data-glass-opacity', 0.93),
    blur: numberAttr(element, 'data-glass-blur', 11),
    displace: numberAttr(element, 'data-glass-displace', 0),
    backgroundOpacity: numberAttr(element, 'data-glass-background-opacity', 0),
    saturation: numberAttr(element, 'data-glass-saturation', 1),
    distortionScale: numberAttr(element, 'data-glass-distortion-scale', -180),
    redOffset: numberAttr(element, 'data-glass-red-offset', 0),
    greenOffset: numberAttr(element, 'data-glass-green-offset', 10),
    blueOffset: numberAttr(element, 'data-glass-blue-offset', 20),
    xChannel: element.getAttribute('data-glass-x-channel') || 'R',
    yChannel: element.getAttribute('data-glass-y-channel') || 'G',
    mixBlendMode: element.getAttribute('data-glass-mix-blend-mode') || 'difference'
  };
}

function displacementMap(profile, rect, redGradId, blueGradId) {
  const width = Math.max(1, rect.width || 400);
  const height = Math.max(1, rect.height || 200);
  const edgeSize = Math.min(width, height) * (profile.borderWidth * 0.5);

  const svg = `
    <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${redGradId}" x1="100%" y1="0%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#0000"/>
          <stop offset="100%" stop-color="red"/>
        </linearGradient>
        <linearGradient id="${blueGradId}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#0000"/>
          <stop offset="100%" stop-color="blue"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" fill="black"></rect>
      <rect x="0" y="0" width="${width}" height="${height}" rx="${profile.borderRadius}" fill="url(#${redGradId})"></rect>
      <rect x="0" y="0" width="${width}" height="${height}" rx="${profile.borderRadius}" fill="url(#${blueGradId})" style="mix-blend-mode: ${profile.mixBlendMode}"></rect>
      <rect x="${edgeSize}" y="${edgeSize}" width="${width - edgeSize * 2}" height="${height - edgeSize * 2}" rx="${profile.borderRadius}" fill="hsl(0 0% ${profile.brightness}% / ${profile.opacity})" style="filter:blur(${profile.blur}px)"></rect>
    </svg>
  `;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function hydrateGlassSurface(element, index) {
  const profile = glassProfile(element);
  const filterId = `glass-filter-${index}`;
  const redGradId = `red-grad-${index}`;
  const blueGradId = `blue-grad-${index}`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  svg.classList.add('glass-surface__filter');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <defs>
      <filter id="${filterId}" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
        <feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"></feImage>
        <feDisplacementMap in="SourceGraphic" in2="map" result="dispRed"></feDisplacementMap>
        <feColorMatrix in="dispRed" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="red"></feColorMatrix>
        <feDisplacementMap in="SourceGraphic" in2="map" result="dispGreen"></feDisplacementMap>
        <feColorMatrix in="dispGreen" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="green"></feColorMatrix>
        <feDisplacementMap in="SourceGraphic" in2="map" result="dispBlue"></feDisplacementMap>
        <feColorMatrix in="dispBlue" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="blue"></feColorMatrix>
        <feBlend in="red" in2="green" mode="screen" result="rg"></feBlend>
        <feBlend in="rg" in2="blue" mode="screen" result="output"></feBlend>
        <feGaussianBlur in="output"></feGaussianBlur>
      </filter>
    </defs>
  `;
  element.insertBefore(svg, element.firstChild);

  const [feImage, redChannel, greenChannel, blueChannel, gaussianBlur] = [
    svg.querySelector('feImage'),
    svg.querySelectorAll('feDisplacementMap')[0],
    svg.querySelectorAll('feDisplacementMap')[1],
    svg.querySelectorAll('feDisplacementMap')[2],
    svg.querySelector('feGaussianBlur')
  ];

  const update = () => {
    const rect = element.getBoundingClientRect();
    feImage.setAttribute('href', displacementMap(profile, rect, redGradId, blueGradId));
    [
      [redChannel, profile.redOffset],
      [greenChannel, profile.greenOffset],
      [blueChannel, profile.blueOffset]
    ].forEach(([channel, offset]) => {
      channel.setAttribute('scale', String(profile.distortionScale + offset));
      channel.setAttribute('xChannelSelector', profile.xChannel);
      channel.setAttribute('yChannelSelector', profile.yChannel);
    });
    gaussianBlur.setAttribute('stdDeviation', String(profile.displace));
  };

  element.style.setProperty('--filter-id', `url(#${filterId})`);
  element.style.setProperty('--glass-frost', profile.backgroundOpacity);
  element.style.setProperty('--glass-saturation', profile.saturation);
  element.style.borderRadius = `${profile.borderRadius}px`;
  element.classList.toggle('glass-surface--svg', supportsSvgBackdropFilter(filterId));
  element.classList.toggle('glass-surface--fallback', !element.classList.contains('glass-surface--svg'));

  update();
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => window.requestAnimationFrame(update));
    observer.observe(element);
  } else {
    window.addEventListener('resize', update, { passive: true });
  }
}

function initGlassSurfaces() {
  document.querySelectorAll('[data-glass-surface]').forEach((element, index) => {
    hydrateGlassSurface(element, index + 1);
  });
}

const state = {
  queue: [],
  queueIndex: -1,
  currentSong: null,
  playerUrl: '',
  userPlaylists: [],
  activePlaylistId: '',
  playlistSignature: '',
  playlistRefreshTimer: 0,
  playlistsLoggedIn: false,
  playlistsLoading: false,
  activePlaylist: null,
  activePlaylistSongs: [],
  shelfLoadingPlaylistId: '',
  shelfDragging: false,
  shelfPointerId: null,
  shelfInteraction: '',
  shelfPressTimer: 0,
  shelfPressStartedAt: 0,
  shelfPressX: 0,
  shelfPressY: 0,
  shelfStartLeft: 0,
  shelfStartTop: 0,
  shelfLastX: 0,
  shelfLastY: 0,
  shelfRotateX: -7,
  shelfRotateY: -14,
  shelfHiddenByUser: false,
  shelfLastRightClickAt: 0,
  playbackPage: false,
  diyOpen: false,
  diyPreset: 'lyric',
  lyricBrightness: 1.12,
  lyricSpeed: 1,
  cubeIntensity: 1.1,
  lyricSignature: '',
  lyricLines: [],
  lyricIndex: -1,
  lyricDisplayText: '',
  lyricSubtitleText: '',
  lyricProgressPercent: -1,
  playbackVisual: {
    dragging: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    yaw: PLAYBACK_REST_YAW,
    pitch: PLAYBACK_REST_PITCH,
    velocityYaw: 0,
    velocityPitch: 0,
    mouseX: 0.5,
    mouseY: 0.5,
    lyricPulse: 0,
    coverSignature: '',
    quality: 0.76,
    lastFrameTime: 0,
    spriteDpr: 0,
    particleSprites: [],
    particles: []
  },
  loginLoggedIn: false,
  loginQrKey: '',
  loginQrTimer: 0,
  loginQrLoading: false,
  visual: { energy: 0, bass: 0, beat: 0, mid: 0, treble: 0 },
  visualBridge: { energy: 0, bass: 0, beat: 0, mid: 0, treble: 0 },
  audioAnalysis: {
    context: null,
    analyser: null,
    source: null,
    sourceMode: '',
    data: null,
    ready: false,
    live: false,
    blocked: false,
    bass: 0,
    energy: 0,
    mid: 0,
    treble: 0,
    beat: 0,
    previousBass: 0,
    silenceFrames: 0,
    signature: ''
  },
  dynamicCube: {
    built: false,
    count: 0,
    positions: null,
    directions: null,
    phases: null,
    weights: null,
    renderer: null,
    scene: null,
    camera: null,
    group: null,
    mesh: null,
    dummy: null,
    color: null,
    palette: null,
    lastWidth: 0,
    lastHeight: 0,
    push: 0,
    bass: 0,
    energy: 0
  },
  particles: [],
  orb: {
    yaw: -0.42,
    pitch: 0.24,
    velocityYaw: 0,
    velocityPitch: 0,
    trailYaw: 0,
    trailPitch: 0,
    trailBoost: 0,
    ambientStreaks: [],
    nextAmbientStreakAt: 0,
    dragging: false,
    pointerId: null,
    lastX: 0,
    lastY: 0,
    reducedMotion
  }
};

async function apiJson(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`接口返回不是 JSON: ${path}`);
  }
  if (!response.ok) {
    throw new Error(json.error || `接口失败: ${response.status}`);
  }
  return json;
}

function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  }
  return search.toString();
}

function songParams(song) {
  return query({
    id: song.id,
    title: song.title,
    artist: song.artist,
    album: song.album,
    cover: song.cover,
    duration: song.duration || 0,
    provider: song.provider || 'netease'
  });
}

function safeText(value, fallback = '') {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapRadians(value) {
  const fullTurn = Math.PI * 2;
  let next = value % fullTurn;
  if (next > Math.PI) next -= fullTurn;
  if (next < -Math.PI) next += fullTurn;
  return next;
}

function setupBootLogo() {
  if (!els.bootLogoText) return;
  const chars = Array.from(BOOT_LOGO_TEXT);
  els.bootLogoText.textContent = '';
  chars.forEach((char, index) => {
    const span = document.createElement('span');
    span.className = `boot-logo-char${char === ' ' ? ' is-space' : ''}`;
    span.style.setProperty('--boot-char-index', index);
    span.textContent = char === ' ' ? ' ' : char;
    els.bootLogoText.appendChild(span);
  });
}

function markBootReady() {
  if (bootVisual.ready || !els.bootScreen) return;
  bootVisual.ready = true;
  els.bootScreen.classList.add('is-bg-ready');
  window.clearTimeout(bootVisual.logoEnableTimer);
  bootVisual.logoEnableTimer = window.setTimeout(() => {
    if (!els.bootLogoButton || bootVisual.entering) return;
    els.bootLogoButton.disabled = false;
    els.bootScreen.classList.add('is-logo-ready');
  }, reducedMotion ? 240 : 2180);
}

function enterMainFromBoot() {
  if (!els.bootScreen || bootVisual.entering) return;
  bootVisual.entering = true;
  if (els.bootLogoButton) els.bootLogoButton.disabled = true;
  els.bootScreen.classList.add('is-exiting');
  window.dispatchEvent(new CustomEvent('fe-lightfall-stop'));
  window.clearTimeout(bootVisual.exitTimer);
  bootVisual.exitTimer = window.setTimeout(() => {
    window.clearTimeout(bootVisual.logoEnableTimer);
    window.clearTimeout(bootVisual.readyFallbackTimer);
    els.bootScreen.hidden = true;
  }, 460);
}

function initBootScreen() {
  if (!els.bootScreen || !els.bootLogoButton) return;
  setupBootLogo();
  bootVisual.ready = false;
  bootVisual.entering = false;
  els.bootLogoButton.disabled = true;
  els.bootLogoButton.addEventListener('click', enterMainFromBoot);
  window.addEventListener('fe-lightfall-ready', markBootReady, { once: true });
  window.clearTimeout(bootVisual.readyFallbackTimer);
  bootVisual.readyFallbackTimer = window.setTimeout(markBootReady, 2600);
}

function mediaIsSameOrigin(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.protocol === 'blob:' || parsed.protocol === 'data:' || parsed.origin === window.location.origin;
  } catch (error) {
    return false;
  }
}

function resetSpectrumForSong(song = state.currentSong) {
  const signature = lyricSignatureForSong(song) || safeText(song && song.id, '');
  if (signature && signature === state.audioAnalysis.signature) return;
  Object.assign(state.audioAnalysis, {
    signature,
    live: false,
    blocked: false,
    bass: 0,
    energy: 0,
    mid: 0,
    treble: 0,
    beat: 0,
    previousBass: 0,
    silenceFrames: 0
  });
  updateSpectrumUi();
}

function applyBridgeVisual() {
  if (state.audioAnalysis.live) return;
  state.visual.energy = state.visualBridge.energy;
  state.visual.bass = state.visualBridge.bass;
  state.visual.beat = state.visualBridge.beat;
  state.visual.mid = state.visualBridge.mid;
  state.visual.treble = state.visualBridge.treble;
  updateSpectrumUi();
}

async function ensureAudioAnalysis() {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor || !els.audio) return false;

  const analysis = state.audioAnalysis;
  try {
    if (!analysis.context) {
      analysis.context = new AudioContextCtor();
    }
    if (analysis.context.state === 'suspended') {
      await analysis.context.resume();
    }
    if (!analysis.analyser) {
      analysis.analyser = analysis.context.createAnalyser();
      analysis.analyser.fftSize = 2048;
      analysis.analyser.smoothingTimeConstant = 0.72;
      analysis.data = new Uint8Array(analysis.analyser.frequencyBinCount);
    }
    if (!analysis.source) {
      const capture = els.audio.captureStream || els.audio.mozCaptureStream;
      if (capture) {
        analysis.source = analysis.context.createMediaStreamSource(capture.call(els.audio));
        analysis.source.connect(analysis.analyser);
        analysis.sourceMode = 'capture';
      } else if (mediaIsSameOrigin(els.audio.currentSrc || els.audio.src)) {
        analysis.source = analysis.context.createMediaElementSource(els.audio);
        analysis.source.connect(analysis.analyser);
        analysis.analyser.connect(analysis.context.destination);
        analysis.sourceMode = 'media';
      } else {
        analysis.blocked = true;
        updateSpectrumUi();
        return false;
      }
    }
    analysis.ready = true;
    return true;
  } catch (error) {
    analysis.blocked = true;
    analysis.ready = false;
    updateSpectrumUi();
    return false;
  }
}

function averageFrequencyBand(data, analyser, fromHz, toHz) {
  const nyquist = (analyser.context && analyser.context.sampleRate ? analyser.context.sampleRate : 44100) / 2;
  const from = clamp(Math.floor((fromHz / nyquist) * data.length), 0, data.length - 1);
  const to = clamp(Math.ceil((toHz / nyquist) * data.length), from + 1, data.length);
  let sum = 0;
  let peak = 0;
  for (let index = from; index < to; index += 1) {
    const value = data[index] || 0;
    sum += value;
    if (value > peak) peak = value;
  }
  return clamp((sum / Math.max(1, to - from)) / 255 * 0.72 + (peak / 255) * 0.28, 0, 1);
}

function updateAudioSpectrum() {
  const analysis = state.audioAnalysis;
  if (!analysis.analyser || !analysis.data || els.audio.paused) {
    if (els.audio.paused) {
      analysis.live = false;
      applyBridgeVisual();
    }
    return false;
  }

  analysis.analyser.getByteFrequencyData(analysis.data);
  const bassRaw = averageFrequencyBand(analysis.data, analysis.analyser, 20, 180);
  const midRaw = averageFrequencyBand(analysis.data, analysis.analyser, 180, 1800);
  const trebleRaw = averageFrequencyBand(analysis.data, analysis.analyser, 1800, 9000);
  const energyRaw = clamp(bassRaw * 0.45 + midRaw * 0.34 + trebleRaw * 0.21, 0, 1);
  const active = bassRaw > 0.012 || midRaw > 0.012 || trebleRaw > 0.012;

  if (!active) {
    analysis.silenceFrames += 1;
    if (analysis.silenceFrames > 50) {
      analysis.live = false;
      analysis.blocked = true;
      applyBridgeVisual();
      return false;
    }
  } else {
    analysis.silenceFrames = 0;
    analysis.blocked = false;
  }

  const beatRaw = clamp((bassRaw - analysis.previousBass) * 4.6 + bassRaw * 0.38, 0, 1);
  analysis.previousBass = bassRaw;
  analysis.bass += (bassRaw - analysis.bass) * 0.34;
  analysis.mid += (midRaw - analysis.mid) * 0.26;
  analysis.treble += (trebleRaw - analysis.treble) * 0.22;
  analysis.energy += (energyRaw - analysis.energy) * 0.28;
  analysis.beat += (beatRaw - analysis.beat) * 0.42;
  analysis.live = true;

  state.visual.bass = clamp(analysis.bass * 1.45, 0, 1);
  state.visual.mid = clamp(analysis.mid * 1.28, 0, 1);
  state.visual.treble = clamp(analysis.treble * 1.18, 0, 1);
  state.visual.energy = clamp(analysis.energy * 1.36, 0, 1);
  state.visual.beat = clamp(analysis.beat * 1.28, 0, 1);
  updateSpectrumUi();
  return true;
}

function updateSpectrumUi() {
  if (els.spectrumBassFill) {
    const value = state.audioAnalysis.live ? state.visual.bass : state.visualBridge.bass;
    els.spectrumBassFill.style.width = `${Math.round(clamp(value, 0, 1) * 100)}%`;
  }
  if (els.spectrumStatus) {
    const status = state.audioAnalysis.live ? '实时' : state.audioAnalysis.blocked ? '桥接' : '待机';
    els.spectrumStatus.textContent = status;
  }
}

function buildDynamicCube() {
  if (!els.dynamicCubeCore || state.dynamicCube.built) return;
  if (!window.THREE) {
    state.dynamicCube.built = true;
    return;
  }
  const THREE = window.THREE;
  const cube = state.dynamicCube;
  const count = DYNAMIC_CUBE_GRID * DYNAMIC_CUBE_GRID * DYNAMIC_CUBE_GRID;
  const positions = new Float32Array(count * 3);
  const directions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const weights = new Float32Array(count);
  const center = (DYNAMIC_CUBE_GRID - 1) / 2;
  els.dynamicCubeCore.style.setProperty('--cube-bound', `${DYNAMIC_CUBE_BOUNDS}px`);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  renderer.domElement.className = 'dynamic-cube-canvas';
  els.dynamicCubeCore.textContent = '';
  els.dynamicCubeCore.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-48, 48, 48, -48, 0.1, 500);
  camera.position.set(0, 0, 160);
  camera.lookAt(0, 0, 0);

  const group = new THREE.Group();
  group.rotation.z = -0.035;
  scene.add(group);

  const ambient = new THREE.AmbientLight(0xffffff, 0.72);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(42, -58, 92);
  scene.add(key);
  const rim = new THREE.PointLight(0xdaf6ff, 1.8, 220);
  rim.position.set(-62, 54, 78);
  scene.add(rim);

  const geometry = new THREE.BoxGeometry(DYNAMIC_CUBE_SIZE, DYNAMIC_CUBE_SIZE, DYNAMIC_CUBE_SIZE);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    emissive: 0xf7fdff,
    emissiveIntensity: 0.075,
    roughness: 0.5,
    metalness: 0.04
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let index = 0;
  for (let x = 0; x < DYNAMIC_CUBE_GRID; x += 1) {
    for (let y = 0; y < DYNAMIC_CUBE_GRID; y += 1) {
      for (let z = 0; z < DYNAMIC_CUBE_GRID; z += 1) {
        const px = (x - center) * DYNAMIC_CUBE_GAP;
        const py = (y - center) * DYNAMIC_CUBE_GAP;
        const pz = (z - center) * DYNAMIC_CUBE_GAP;
        const longest = Math.max(Math.abs(px), Math.abs(py), Math.abs(pz), 1);
        const edge = Math.max(Math.abs(x - center), Math.abs(y - center), Math.abs(z - center)) / center;
        const offset = index * 3;
        positions[offset] = px;
        positions[offset + 1] = py;
        positions[offset + 2] = pz;
        directions[offset] = px / longest;
        directions[offset + 1] = py / longest;
        directions[offset + 2] = pz / longest;
        phases[index] = (x * 1.8 + y * 2.35 + z * 1.32) % (Math.PI * 2);
        weights[index] = 0.46 + edge * 0.74;

        dummy.position.set(px, py, pz);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
        index += 1;
      }
    }
  }

  mesh.instanceMatrix.needsUpdate = true;
  cube.count = count;
  cube.positions = positions;
  cube.directions = directions;
  cube.phases = phases;
  cube.weights = weights;
  cube.renderer = renderer;
  cube.scene = scene;
  cube.camera = camera;
  cube.group = group;
  cube.mesh = mesh;
  cube.dummy = dummy;
  cube.color = color;
  cube.built = true;
  applyDynamicCubePalette(cube.palette || fallbackLyricPalette(state.currentSong));
  resizeDynamicCubeRenderer();
  renderer.render(scene, camera);
}

function resizeDynamicCubeRenderer() {
  const cube = state.dynamicCube;
  if (!cube.renderer || !cube.camera || !els.dynamicCubeCore) return;
  const rect = els.dynamicCubeCore.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (width === cube.lastWidth && height === cube.lastHeight) return;
  cube.lastWidth = width;
  cube.lastHeight = height;
  cube.renderer.setSize(width, height, false);
  const aspect = width / Math.max(1, height);
  const view = 92;
  cube.camera.left = -view * aspect / 2;
  cube.camera.right = view * aspect / 2;
  cube.camera.top = view / 2;
  cube.camera.bottom = -view / 2;
  cube.camera.updateProjectionMatrix();
}

function updateDynamicCubeVisibility() {
  const visible = state.playbackPage && state.diyPreset === 'cube';
  if (els.dynamicCubeScene) els.dynamicCubeScene.hidden = !visible;
  els.appShell.classList.toggle('has-dynamic-cube', visible);
  if (visible) buildDynamicCube();
}

function updateDynamicCubeMotion() {
  const cube = state.dynamicCube;
  if (!state.playbackPage || state.diyPreset !== 'cube' || !cube.mesh || !cube.renderer || !cube.scene || !cube.camera) return;
  const bass = Math.max(state.visual.bass, els.audio.paused ? 0.04 : 0.22);
  const energy = Math.max(state.visual.energy, els.audio.paused ? 0.04 : 0.18);
  const beat = Math.max(state.visual.beat, els.audio.paused ? 0 : 0.12);
  cube.bass += (bass - cube.bass) * 0.32;
  cube.energy += (energy - cube.energy) * 0.24;

  const t = performance.now() / 1000;
  const heart = Math.pow(Math.max(0, Math.sin(t * Math.PI * (1.15 + state.lyricSpeed * 0.26))), 8);
  const motionScale = reducedMotion ? 0.28 : 1;
  const pushBase = (0.7 + cube.bass * 7.8 + beat * 2.7 + heart * cube.bass * 3.4) * state.cubeIntensity * motionScale;
  const scaleBase = 0.96 + cube.bass * 0.11 + beat * 0.035;
  if (els.dynamicCubeScene) {
    els.dynamicCubeScene.style.setProperty('--scene-rotate-x', `${state.playbackVisual.pitch}rad`);
    els.dynamicCubeScene.style.setProperty('--scene-rotate-y', `${state.playbackVisual.yaw}rad`);
    els.dynamicCubeScene.style.setProperty('--cube-glow-alpha', (0.18 + cube.energy * 0.36 + beat * 0.16).toFixed(3));
  }

  resizeDynamicCubeRenderer();
  cube.group.rotation.x = state.playbackVisual.pitch;
  cube.group.rotation.y = state.playbackVisual.yaw;

  const positions = cube.positions;
  const directions = cube.directions;
  const phases = cube.phases;
  const weights = cube.weights;
  const dummy = cube.dummy;
  for (let index = 0; index < cube.count; index += 1) {
    const offset = index * 3;
    const wave = 0.78 + Math.sin(t * (2.1 + state.lyricSpeed * 0.88) + phases[index]) * 0.16;
    const push = pushBase * weights[index] * wave;
    const drift = Math.sin(t * 1.25 + phases[index]) * cube.energy * 0.55;
    dummy.position.set(
      positions[offset] + directions[offset] * push + directions[offset + 1] * drift,
      positions[offset + 1] + directions[offset + 1] * push - directions[offset] * drift,
      positions[offset + 2] + directions[offset + 2] * push * 0.74
    );
    dummy.scale.setScalar(scaleBase);
    dummy.updateMatrix();
    cube.mesh.setMatrixAt(index, dummy.matrix);
  }
  cube.mesh.instanceMatrix.needsUpdate = true;
  cube.renderer.render(cube.scene, cube.camera);
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360 / 360;
  const sat = clamp(s, 0, 1);
  const light = clamp(l, 0, 1);
  if (sat === 0) {
    const value = Math.round(light * 255);
    return { r: value, g: value, b: value };
  }
  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const convert = (t) => {
    let next = t;
    if (next < 0) next += 1;
    if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };
  return {
    r: Math.round(convert(hue + 1 / 3) * 255),
    g: Math.round(convert(hue) * 255),
    b: Math.round(convert(hue - 1 / 3) * 255)
  };
}

function mixRgb(a, b, amount) {
  const t = clamp(amount, 0, 1);
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t)
  };
}

function rgbCss(color, alpha = 1) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function relativeLuminance(color) {
  return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
}

function readableLyricColor(color, mixAmount = 0.34) {
  const lifted = mixRgb(color, { r: 255, g: 255, b: 255 }, mixAmount);
  if (relativeLuminance(lifted) < 0.62) return mixRgb(lifted, { r: 255, g: 255, b: 255 }, 0.28);
  return lifted;
}

function lyricPaletteFromBase(base) {
  return {
    primary: readableLyricColor(base, 0.26),
    glow: mixRgb(base, { r: 255, g: 255, b: 255 }, 0.16),
    highlight: readableLyricColor(base, 0.5),
    depth: mixRgb(base, { r: 0, g: 0, b: 0 }, 0.68)
  };
}

function proxiedImageUrl(url) {
  return url ? `/api/cover?url=${encodeURIComponent(url)}` : '';
}

function coverUrl(song) {
  if (!song || !song.cover) return '';
  return proxiedImageUrl(song.cover);
}

function setImage(img, song) {
  const url = coverUrl(song);
  const frame = img.parentElement;
  if (!url) {
    img.removeAttribute('src');
    frame.classList.remove('has-cover');
    return;
  }
  img.src = url;
  frame.classList.add('has-cover');
}

function fallbackLyricPalette(song = state.currentSong) {
  const seedText = safeText(song && (song.title || song.artist || song.album), 'FE Monster');
  let hash = 0;
  for (let index = 0; index < seedText.length; index += 1) {
    hash = (hash * 31 + seedText.charCodeAt(index)) >>> 0;
  }
  const base = hslToRgb(185 + (hash % 96), 0.82, 0.62);
  return lyricPaletteFromBase(base);
}

function sampleCoverPalette(img) {
  if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight) return null;
  const canvas = document.createElement('canvas');
  const size = 28;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(img, 0, 0, size, size);
    const data = context.getImageData(0, 0, size, size).data;
    let total = 0;
    let r = 0;
    let g = 0;
    let b = 0;
    let best = { r: 131, g: 228, b: 255 };
    let bestScore = -1;
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3];
      if (alpha < 64) continue;
      const cr = data[index];
      const cg = data[index + 1];
      const cb = data[index + 2];
      const max = Math.max(cr, cg, cb);
      const min = Math.min(cr, cg, cb);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const luminance = (0.2126 * cr + 0.7152 * cg + 0.0722 * cb) / 255;
      const score = saturation * 1.55 + Math.abs(luminance - 0.58) * -0.52 + luminance * 0.18;
      r += cr;
      g += cg;
      b += cb;
      total += 1;
      if (score > bestScore) {
        bestScore = score;
        best = { r: cr, g: cg, b: cb };
      }
    }
    if (!total) return null;
    const average = { r: Math.round(r / total), g: Math.round(g / total), b: Math.round(b / total) };
    const base = mixRgb(best, average, 0.28);
    return lyricPaletteFromBase(base);
  } catch (error) {
    return null;
  }
}

function rgbTriplet(color) {
  return `${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}`;
}

function vividCubeColor(color, whiteMix = 0.08, saturationBoost = 1.22) {
  const lifted = mixRgb(color, { r: 255, g: 255, b: 255 }, whiteMix);
  const average = (lifted.r + lifted.g + lifted.b) / 3;
  return {
    r: clamp(Math.round(average + (lifted.r - average) * saturationBoost), 0, 255),
    g: clamp(Math.round(average + (lifted.g - average) * saturationBoost), 0, 255),
    b: clamp(Math.round(average + (lifted.b - average) * saturationBoost), 0, 255)
  };
}

function applyDynamicCubePalette(palette) {
  if (!palette) return;
  const cube = state.dynamicCube;
  cube.palette = palette;

  if (els.dynamicCubeScene) {
    els.dynamicCubeScene.style.setProperty('--cube-cover-glow', rgbTriplet(palette.glow));
    els.dynamicCubeScene.style.setProperty('--cube-cover-hot', rgbTriplet(palette.highlight));
    els.dynamicCubeScene.style.setProperty('--cube-cover-depth', rgbTriplet(palette.depth));
  }

  if (!cube.mesh || !cube.positions || typeof cube.mesh.setColorAt !== 'function' || !window.THREE) return;

  const THREE = window.THREE;
  const white = { r: 255, g: 255, b: 255 };
  const base = vividCubeColor(palette.primary, 0.06, 1.28);
  const glow = vividCubeColor(palette.glow, 0.04, 1.34);
  const highlight = mixRgb(vividCubeColor(palette.highlight, 0.12, 1.18), white, 0.1);
  const depth = vividCubeColor(mixRgb(palette.depth, palette.primary, 0.24), 0.02, 1.18);
  const half = DYNAMIC_CUBE_BOUNDS / 2;
  const planeSize = DYNAMIC_CUBE_GRID * DYNAMIC_CUBE_GRID;
  const color = cube.color || new THREE.Color();
  cube.color = color;

  if (cube.mesh.material) {
    cube.mesh.material.vertexColors = true;
    cube.mesh.material.color.setRGB(1, 1, 1);
    if (cube.mesh.material.emissive) {
      cube.mesh.material.emissive.setRGB(glow.r / 255, glow.g / 255, glow.b / 255);
    }
    cube.mesh.material.emissiveIntensity = 0.085 + relativeLuminance(glow) * 0.1;
    cube.mesh.material.needsUpdate = true;
  }

  for (let index = 0; index < cube.count; index += 1) {
    const x = Math.floor(index / planeSize);
    const yz = index - x * planeSize;
    const y = Math.floor(yz / DYNAMIC_CUBE_GRID);
    const z = yz - y * DYNAMIC_CUBE_GRID;
    const offset = index * 3;
    const nx = Math.abs(cube.positions[offset] / half);
    const ny = Math.abs(cube.positions[offset + 1] / half);
    const nz = Math.abs(cube.positions[offset + 2] / half);
    const edge = Math.max(nx, ny, nz);
    const surface = (nx * 0.42 + ny * 0.34 + nz * 0.24) / Math.max(0.001, nx + ny + nz);
    const checker = (x + y + z) % 2 === 0 ? 0.055 : -0.035;
    const stripe = ((x * 17 + y * 11 + z * 5) % 29) / 28;
    const topLight = (DYNAMIC_CUBE_GRID - 1 - y) / (DYNAMIC_CUBE_GRID - 1);
    let tone = mixRgb(base, glow, clamp(0.16 + edge * 0.26 + surface * 0.12 + stripe * 0.1 + checker, 0.06, 0.58));
    tone = mixRgb(tone, highlight, clamp(topLight * 0.13 + edge * 0.045, 0, 0.22));
    tone = mixRgb(tone, depth, clamp(z / (DYNAMIC_CUBE_GRID - 1) * 0.16 + (1 - edge) * 0.05, 0, 0.24));

    const lift = clamp(0.88 + checker + edge * 0.09 + topLight * 0.06, 0.72, 1.08);
    color.setRGB(
      clamp((tone.r * lift) / 255, 0, 1),
      clamp((tone.g * lift) / 255, 0, 1),
      clamp((tone.b * lift) / 255, 0, 1)
    );
    cube.mesh.setColorAt(index, color);
  }

  if (cube.mesh.instanceColor) {
    cube.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    cube.mesh.instanceColor.needsUpdate = true;
  }
}

function applyLyricPalette(palette) {
  if (!palette) return;
  const target = els.playbackLyricScene;
  if (target) {
    target.style.setProperty('--lyric-primary', rgbCss(palette.primary));
    target.style.setProperty('--lyric-glow', rgbCss(palette.glow));
    target.style.setProperty('--lyric-highlight', rgbCss(palette.highlight));
    target.style.setProperty('--lyric-depth', rgbCss(palette.depth));
    target.style.setProperty('--lyric-glow-soft', rgbCss(palette.glow, 0.26));
    target.style.setProperty('--lyric-glow-hot', rgbCss(palette.highlight, 0.3));
  }
  applyDynamicCubePalette(palette);
}

function applyCoverSample(img, signature) {
  if (signature !== state.playbackVisual.coverSignature) return false;
  const palette = sampleCoverPalette(img);
  if (!palette) return false;
  applyLyricPalette(palette);
  return true;
}

function loadCoverPalette(url, signature) {
  if (!url) return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.addEventListener('load', () => applyCoverSample(img, signature), { once: true });
  img.src = url;
}

function updateLyricPalette(song = state.currentSong) {
  const url = coverUrl(song);
  const signature = `${url}|${safeText(song && song.title, '')}`;
  if (signature === state.playbackVisual.coverSignature) return;
  state.playbackVisual.coverSignature = signature;
  applyLyricPalette(fallbackLyricPalette(song));
  const img = els.dockCover;
  const applySample = () => {
    if (!applyCoverSample(img, signature)) loadCoverPalette(url, signature);
  };
  if (img && img.complete && img.naturalWidth) {
    window.requestAnimationFrame(applySample);
  } else if (img) {
    img.addEventListener('load', applySample, { once: true });
    img.addEventListener('error', () => loadCoverPalette(url, signature), { once: true });
  } else {
    loadCoverPalette(url, signature);
  }
}

function formatTime(seconds) {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function compactCount(value) {
  const count = Number(value) || 0;
  if (count >= 100000000) return `${(count / 100000000).toFixed(count >= 1000000000 ? 0 : 1)}亿`;
  if (count >= 10000) return `${(count / 10000).toFixed(count >= 100000 ? 0 : 1)}万`;
  return String(count);
}

function clearElement(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function removeElement(element) {
  if (element && element.parentNode) element.parentNode.removeChild(element);
}

function visiblePlaylists(playlists) {
  return playlists.filter((playlist) => playlist && playlist.id).slice(0, 4);
}

function playlistSignature(playlists) {
  return playlists
    .map((playlist) => [
      playlist.id,
      playlist.name || '',
      playlist.cover || '',
      playlist.trackCount || 0,
      playlist.playCount || 0
    ].join('|'))
    .join('::');
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => els.toast.classList.remove('show'), 2600);
}

function accountName(payload) {
  const account = payload && payload.account ? payload.account : {};
  return safeText(account.nickname || account.userId, '');
}

function renderLoginStatus(payload = {}) {
  const loggedIn = !!payload.loggedIn;
  state.loginLoggedIn = loggedIn;
  els.loginButton.classList.toggle('is-logged-in', loggedIn);
  els.loginLabel.textContent = loggedIn ? accountName(payload) || '已登录' : '网易云登录';
  els.loginButton.setAttribute('aria-label', loggedIn ? `网易云已登录：${els.loginLabel.textContent}` : '打开网易云二维码登录');
}

async function refreshLoginStatus() {
  try {
    const payload = await apiJson('/api/login/status');
    renderLoginStatus(payload);
    return payload;
  } catch (error) {
    renderLoginStatus({ loggedIn: false });
    return { loggedIn: false };
  }
}

function clearLoginQrTimer() {
  window.clearInterval(state.loginQrTimer);
  state.loginQrTimer = 0;
}

function setQrStatus(message) {
  els.qrStatus.textContent = message;
}

function resetQrImage(message = '生成二维码') {
  els.qrImage.removeAttribute('src');
  els.qrShell.classList.remove('has-qr');
  els.qrPlaceholder.textContent = message;
}

function showLoginDialog() {
  els.loginDialog.hidden = false;
  els.loginButton.setAttribute('aria-expanded', 'true');
  loadLoginQr();
}

function closeLoginDialog() {
  clearLoginQrTimer();
  state.loginQrKey = '';
  state.loginQrLoading = false;
  els.loginDialog.hidden = true;
  els.loginButton.setAttribute('aria-expanded', 'false');
  els.loginRefresh.disabled = false;
}

function qrCodeMessage(code, message) {
  if (code === 800) return '二维码已过期，请刷新';
  if (code === 801) return '等待网易云 App 扫码';
  if (code === 802) return '已扫码，请在手机上确认';
  if (code === 803) return '登录成功，正在同步歌单';
  return message || '等待扫码确认';
}

async function checkLoginQr() {
  if (!state.loginQrKey) return;
  try {
    const payload = await apiJson(`/api/netease/login/qr/check?${query({ key: state.loginQrKey })}`);
    const code = Number(payload.code) || 0;
    setQrStatus(qrCodeMessage(code, payload.message));

    if (code === 800) {
      clearLoginQrTimer();
      resetQrImage('二维码过期');
      return;
    }

    if (code === 803) {
      clearLoginQrTimer();
      const account = await refreshLoginStatus();
      await refreshUserPlaylists();
      window.setTimeout(() => {
        if (account.loggedIn) closeLoginDialog();
      }, 650);
    }
  } catch (error) {
    clearLoginQrTimer();
    setQrStatus(error.message || '二维码状态检查失败');
  }
}

async function loadLoginQr() {
  if (state.loginQrLoading) return;
  state.loginQrLoading = true;
  clearLoginQrTimer();
  resetQrImage('生成二维码');
  setQrStatus('正在连接网易云第三方 API');
  els.loginRefresh.disabled = true;

  try {
    const keyPayload = await apiJson('/api/netease/login/qr/key');
    const key = safeText(keyPayload.data && keyPayload.data.unikey, safeText(keyPayload.unikey, ''));
    if (!key) throw new Error(keyPayload.error || '未获取到二维码 key');

    state.loginQrKey = key;
    const qrPayload = await apiJson(`/api/netease/login/qr/create?${query({ key, qrimg: 'true' })}`);
    const qrData = qrPayload.data || {};
    const qrImage = safeText(qrData.qrimg, safeText(qrPayload.qrimg, ''));
    if (!qrImage) throw new Error(qrPayload.error || '未获取到二维码图片');

    els.qrImage.src = qrImage;
    els.qrShell.classList.add('has-qr');
    setQrStatus('等待网易云 App 扫码');
    state.loginQrTimer = window.setInterval(checkLoginQr, 1800);
    checkLoginQr();
  } catch (error) {
    resetQrImage('无法生成');
    setQrStatus(error.message || '二维码生成失败');
  } finally {
    state.loginQrLoading = false;
    els.loginRefresh.disabled = false;
  }
}

function hidePlaylistOrbit() {
  els.playlistOrbit.hidden = true;
  clearElement(els.playlistCards);
  els.playlistStatus.textContent = '网易云歌单';
  state.playlistSignature = '';
  closePlaylistShelf({ resetActive: true });
}

function playlistSubtitle(playlist) {
  const count = Number(playlist.trackCount) || 0;
  const playCount = Number(playlist.playCount) || 0;
  if (count && playCount) return `${count} 首 · ${compactCount(playCount)} 播放`;
  if (count) return `${count} 首`;
  if (playCount) return `${compactCount(playCount)} 播放`;
  return safeText(playlist.creator, '网易云歌单');
}

function createPlaylistCard(playlist, index) {
  const button = document.createElement('button');
  button.className = 'orb-playlist-card';
  button.type = 'button';
  button.dataset.playlistId = playlist.id;
  button.dataset.playlistName = safeText(playlist.name, '网易云歌单');
  button.dataset.playlistCover = safeText(playlist.cover, '');
  button.dataset.slot = String(index + 1);
  button.setAttribute('aria-label', `打开歌单：${button.dataset.playlistName}`);
  if (String(playlist.id) === String(state.activePlaylistId)) {
    button.classList.add('is-active');
    button.setAttribute('aria-current', 'true');
  }

  const cover = document.createElement('span');
  cover.className = 'orb-playlist-cover';

  const fallback = document.createElement('span');
  fallback.textContent = '歌单';
  cover.appendChild(fallback);

  const imageUrl = proxiedImageUrl(playlist.cover);
  if (imageUrl) {
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    image.src = imageUrl;
    image.addEventListener('load', () => removeElement(fallback));
    image.addEventListener('error', () => removeElement(image));
    cover.appendChild(image);
  }

  const copy = document.createElement('span');
  copy.className = 'orb-playlist-copy';

  const title = document.createElement('strong');
  title.textContent = safeText(playlist.name, '网易云歌单');

  const meta = document.createElement('small');
  meta.textContent = playlistSubtitle(playlist);

  copy.appendChild(title);
  copy.appendChild(meta);
  button.appendChild(cover);
  button.appendChild(copy);
  window.requestAnimationFrame(() => button.classList.add('is-mounted'));
  return button;
}

function updateActivePlaylistCard() {
  els.playlistCards.querySelectorAll('.orb-playlist-card').forEach((card) => {
    const isActive = String(card.dataset.playlistId) === String(state.activePlaylistId);
    card.classList.toggle('is-active', isActive);
    if (isActive) card.setAttribute('aria-current', 'true');
    else card.removeAttribute('aria-current');
  });
}

function renderPlaylistOrbit(playlists) {
  const visible = visiblePlaylists(playlists);
  if (!visible.length) {
    hidePlaylistOrbit();
    return;
  }

  const signature = playlistSignature(visible);
  if (!els.playlistOrbit.hidden && signature === state.playlistSignature) {
    updateActivePlaylistCard();
    return;
  }

  els.playlistStatus.textContent = '我的网易云歌单';
  const fragment = document.createDocumentFragment();
  visible.forEach((playlist, index) => fragment.appendChild(createPlaylistCard(playlist, index)));
  clearElement(els.playlistCards);
  els.playlistCards.appendChild(fragment);
  state.playlistSignature = signature;
  els.playlistOrbit.hidden = false;
}

async function refreshUserPlaylists() {
  if (state.playlistsLoading) return;
  state.playlistsLoading = true;
  try {
    const data = await apiJson('/api/netease/user/playlists');
    const playlists = Array.isArray(data.playlists) ? data.playlists : [];
    state.playlistsLoggedIn = !!data.loggedIn;
    state.userPlaylists = state.playlistsLoggedIn ? playlists : [];

    if (state.playlistsLoggedIn && playlists.length) renderPlaylistOrbit(playlists);
    else hidePlaylistOrbit();
  } catch (error) {
    state.playlistsLoggedIn = false;
    state.userPlaylists = [];
    hidePlaylistOrbit();
  } finally {
    state.playlistsLoading = false;
  }
}

function scheduleUserPlaylistsRefresh(delay = 0) {
  window.clearTimeout(state.playlistRefreshTimer);
  state.playlistRefreshTimer = window.setTimeout(refreshUserPlaylists, delay);
}

function playlistById(playlistId) {
  return state.userPlaylists.find((playlist) => String(playlist.id) === String(playlistId)) || null;
}

function degrees360(value) {
  return ((value % 360) + 360) % 360;
}

function isShelfBackFacing(rotateY) {
  const angle = degrees360(rotateY);
  return angle > 90 && angle < 270;
}

function setShelfRotation(x, y) {
  state.shelfRotateX = clamp(x, -58, 58);
  state.shelfRotateY = y;
  els.playlistShelfStage.style.setProperty('--shelf-rotate-x', `${state.shelfRotateX}deg`);
  els.playlistShelfStage.style.setProperty('--shelf-rotate-y', `${state.shelfRotateY}deg`);
  els.playlistShelf.classList.toggle('is-back-facing', isShelfBackFacing(state.shelfRotateY));
}

function syncShelfRotationToPlaybackView(options = {}) {
  if (!state.playbackPage || els.playlistShelf.hidden) return;
  if (state.shelfDragging && state.shelfInteraction === 'move' && !options.force) return;
  const yawDeg = state.playbackVisual.yaw * 57.2958;
  const pitchDeg = state.playbackVisual.pitch * 57.2958;
  setShelfRotation(-6 + pitchDeg * 0.38, -18 + yawDeg * 1.08);
}

function showShelfFront() {
  setShelfRotation(state.playbackPage ? -6 : -7, state.playbackPage ? -18 : -14);
}

function resetShelfRotation() {
  if (reducedMotion) {
    setShelfRotation(0, 0);
    return;
  }
  if (state.playbackPage) {
    syncShelfRotationToPlaybackView({ force: true });
    return;
  }
  setShelfRotation(state.playbackPage ? -6 : -7, state.playbackPage ? -18 : -14);
}

function constrainShelfCenter(value, halfSize, availableSize, startInset, endInset) {
  const min = Math.min(availableSize / 2, halfSize + startInset);
  const max = Math.max(min, availableSize - halfSize - endInset);
  return clamp(value, min, max);
}

function setShelfPosition(left, top, options = {}) {
  const stageRect = els.stage.getBoundingClientRect();
  const width = options.width || (state.playbackPage ? 318 : 368);
  const height = options.height || (state.playbackPage ? 382 : 430);
  const sideInset = options.sideInset ?? 18;
  const topInset = options.topInset ?? 18;
  const bottomInset = options.bottomInset ?? 94;
  const nextLeft = constrainShelfCenter(left, width / 2, stageRect.width, sideInset, sideInset);
  const nextTop = constrainShelfCenter(top, height / 2, stageRect.height, topInset, bottomInset);
  els.playlistShelfStage.style.setProperty('--shelf-left', `${Math.round(nextLeft)}px`);
  els.playlistShelfStage.style.setProperty('--shelf-top', `${Math.round(nextTop)}px`);
}

function currentShelfCenter() {
  const stageRect = els.stage.getBoundingClientRect();
  const shelfRect = els.playlistShelfStage.getBoundingClientRect();
  if (shelfRect.width > 0 && shelfRect.height > 0) {
    return {
      left: shelfRect.left - stageRect.left + shelfRect.width / 2,
      top: shelfRect.top - stageRect.top + shelfRect.height / 2
    };
  }
  return state.playbackPage
    ? { left: stageRect.width - 226, top: stageRect.height * 0.49 }
    : { left: stageRect.width / 2 + 406, top: stageRect.height * 0.47 };
}

function positionShelfForPlayback() {
  const stageRect = els.stage.getBoundingClientRect();
  setShelfPosition(stageRect.width - 226, stageRect.height * 0.49, {
    width: 318,
    height: 382,
    bottomInset: 104
  });
}

function positionShelfNearCard(card) {
  if (!card || state.playbackPage) return;
  const stageRect = els.stage.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const shelfWidth = 368;
  const shelfHeight = 430;
  setShelfPosition(
    cardRect.right - stageRect.left + shelfWidth * 0.28,
    cardRect.top - stageRect.top + cardRect.height / 2,
    { width: shelfWidth, height: shelfHeight, bottomInset: 94 }
  );
}

function updatePlaybackPageClass() {
  els.appShell.classList.toggle('is-playback-page', state.playbackPage);
  els.stage.classList.toggle('is-playback-page', state.playbackPage);
  els.playlistShelf.classList.toggle('is-playback-mode', state.playbackPage && !els.playlistShelf.hidden);
  setPlaybackLyricVisible(state.playbackPage);
  updateDynamicCubeVisibility();
}

function enterPlaybackPage() {
  state.playbackPage = true;
  updatePlaybackPageClass();
  if (!els.playlistShelf.hidden) positionShelfForPlayback();
  resetShelfRotation();
}

function returnHomePage() {
  state.playbackPage = false;
  resetPlaybackView();
  updatePlaybackPageClass();
  resetShelfRotation();
  showActivePlaylistShelf();
}

function showActivePlaylistShelf(options = {}) {
  if (!state.activePlaylist) return false;
  renderPlaylistShelf(state.activePlaylist, state.activePlaylistSongs, {
    preserveScroll: options.preserveScroll !== false
  });
  return true;
}

function hidePlaylistShelf() {
  state.shelfHiddenByUser = true;
  closePlaylistShelf();
}

function setShelfCover(playlist = {}) {
  const url = proxiedImageUrl(playlist.cover || '');
  [
    [els.playlistShelfCover, els.playlistShelfCoverImage],
    [els.playlistShelfBackCover, els.playlistShelfBackCoverImage]
  ].forEach(([frame, image]) => {
    if (!frame || !image) return;
    if (!url) {
      image.removeAttribute('src');
      frame.classList.remove('has-cover');
      return;
    }
    image.src = url;
    frame.classList.add('has-cover');
  });
}

function shelfSongSubtitle(song) {
  const artist = safeText(song.artist, '');
  const album = safeText(song.album, '');
  if (artist && album) return `${artist} · ${album}`;
  return artist || album || '网易云音乐';
}

function shelfMeta(playlist, songs) {
  const count = songs.length || Number(playlist.trackCount) || 0;
  const creator = safeText(playlist.creator, '');
  return creator ? `${count} 首 · ${creator}` : `${count} 首`;
}

function createShelfSongButton(song, index) {
  const button = document.createElement('button');
  button.className = 'shelf-song-button';
  button.type = 'button';
  button.dataset.songIndex = String(index);
  button.dataset.songId = safeText(song.id, '');
  button.style.setProperty('--song-depth', `${8 + Math.min(index % 5, 4) * 9}px`);
  button.style.setProperty('--song-delay', `${Math.min(index, 8) * 28}ms`);
  button.setAttribute('aria-label', `播放：${safeText(song.title, '未命名歌曲')}`);

  const number = document.createElement('span');
  number.className = 'shelf-song-index';
  number.textContent = String(index + 1).padStart(2, '0');

  const copy = document.createElement('span');
  copy.className = 'shelf-song-copy';

  const title = document.createElement('strong');
  title.textContent = safeText(song.title, '未命名歌曲');

  const meta = document.createElement('small');
  meta.textContent = shelfSongSubtitle(song);

  const duration = document.createElement('span');
  duration.className = 'shelf-song-duration';
  duration.textContent = song.duration ? formatTime(Number(song.duration)) : '--:--';

  const play = document.createElement('span');
  play.className = 'shelf-song-play';
  play.setAttribute('aria-hidden', 'true');

  copy.appendChild(title);
  copy.appendChild(meta);
  button.appendChild(number);
  button.appendChild(copy);
  button.appendChild(duration);
  button.appendChild(play);
  return button;
}

function updateShelfCurrentSong() {
  const currentId = state.currentSong && state.currentSong.id ? String(state.currentSong.id) : '';
  [els.playlistSongStack, els.playlistSongStackBack].forEach((stack) => {
    if (!stack) return;
    stack.querySelectorAll('.shelf-song-button').forEach((button) => {
      const isCurrent = currentId && String(button.dataset.songId) === currentId;
      button.classList.toggle('is-current', !!isCurrent);
      if (isCurrent) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  });
}

function renderShelfSongsInto(stack) {
  if (!stack) return;
  clearElement(stack);
  if (!state.activePlaylistSongs.length) {
    const empty = document.createElement('div');
    empty.className = 'playlist-shelf-empty';
    empty.textContent = '暂无可播放歌曲';
    stack.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.activePlaylistSongs.forEach((song, index) => fragment.appendChild(createShelfSongButton(song, index)));
  stack.appendChild(fragment);
  const mount = () => stack.querySelectorAll('.shelf-song-button').forEach((button) => button.classList.add('is-mounted'));
  if (!reducedMotion) window.requestAnimationFrame(mount);
  else mount();
}

function renderShelfSongs() {
  renderShelfSongsInto(els.playlistSongStackBack);
  clearElement(els.playlistSongStack);
  if (!state.activePlaylistSongs.length) {
    const empty = document.createElement('div');
    empty.className = 'playlist-shelf-empty';
    empty.textContent = '暂无可播放歌曲';
    els.playlistSongStack.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.activePlaylistSongs.forEach((song, index) => fragment.appendChild(createShelfSongButton(song, index)));
  els.playlistSongStack.appendChild(fragment);
  updateShelfCurrentSong();
  if (!reducedMotion) {
    window.requestAnimationFrame(() => {
      els.playlistSongStack.querySelectorAll('.shelf-song-button').forEach((button) => button.classList.add('is-mounted'));
    });
  } else {
    els.playlistSongStack.querySelectorAll('.shelf-song-button').forEach((button) => button.classList.add('is-mounted'));
  }
}

function renderPlaylistShelf(playlist, songs, options = {}) {
  const previousScroll = els.playlistShelfScroll.scrollTop;
  state.activePlaylist = playlist;
  state.activePlaylistSongs = songs;
  els.playlistShelfTitle.textContent = safeText(playlist.name, '网易云歌单');
  els.playlistShelfMeta.textContent = shelfMeta(playlist, songs);
  if (els.playlistShelfBackTitle) els.playlistShelfBackTitle.textContent = els.playlistShelfTitle.textContent;
  if (els.playlistShelfBackMeta) els.playlistShelfBackMeta.textContent = els.playlistShelfMeta.textContent;
  setShelfCover(playlist);
  renderShelfSongs();
  els.playlistShelf.hidden = false;
  state.shelfHiddenByUser = false;
  els.playlistShelf.classList.remove('is-loading');
  els.playlistShelf.removeAttribute('aria-busy');
  if (options.preserveScroll) els.playlistShelfScroll.scrollTop = previousScroll;
  else els.playlistShelfScroll.scrollTop = 0;
  if (els.playlistShelfBackScroll) {
    if (options.preserveScroll) els.playlistShelfBackScroll.scrollTop = previousScroll;
    else els.playlistShelfBackScroll.scrollTop = 0;
  }
  resetShelfRotation();
  updatePlaybackPageClass();
  window.requestAnimationFrame(() => els.playlistShelf.classList.add('is-open'));
}

function renderShelfLoading(playlist) {
  state.activePlaylist = playlist;
  els.playlistShelfTitle.textContent = safeText(playlist.name, '网易云歌单');
  els.playlistShelfMeta.textContent = '正在读取歌单';
  if (els.playlistShelfBackTitle) els.playlistShelfBackTitle.textContent = els.playlistShelfTitle.textContent;
  if (els.playlistShelfBackMeta) els.playlistShelfBackMeta.textContent = els.playlistShelfMeta.textContent;
  setShelfCover(playlist);
  clearElement(els.playlistSongStack);
  clearElement(els.playlistSongStackBack);
  const loading = document.createElement('div');
  loading.className = 'playlist-shelf-empty';
  loading.textContent = '读取中';
  els.playlistSongStack.appendChild(loading);
  if (els.playlistSongStackBack) els.playlistSongStackBack.appendChild(loading.cloneNode(true));
  els.playlistShelf.hidden = false;
  state.shelfHiddenByUser = false;
  els.playlistShelf.classList.add('is-open', 'is-loading');
  els.playlistShelf.setAttribute('aria-busy', 'true');
  resetShelfRotation();
  updatePlaybackPageClass();
}

function closePlaylistShelf({ resetActive = false } = {}) {
  clearShelfPressTimer();
  els.playlistShelf.classList.remove('is-open', 'is-loading', 'is-playback-mode', 'is-pressing', 'is-dragging', 'is-position-dragging', 'is-back-facing');
  els.playlistShelf.hidden = true;
  els.playlistShelf.removeAttribute('aria-busy');
  state.shelfDragging = false;
  state.shelfPointerId = null;
  state.shelfInteraction = '';
  if (resetActive) {
    state.shelfHiddenByUser = false;
    state.activePlaylistId = '';
    state.activePlaylist = null;
    state.activePlaylistSongs = [];
    updateActivePlaylistCard();
  }
  updatePlaybackPageClass();
}

async function loadPlaylistFromCard(card) {
  const playlistId = card.dataset.playlistId;
  const playlistName = card.dataset.playlistName || '网易云歌单';
  if (!playlistId) return;
  const playlist = playlistById(playlistId) || {
    id: playlistId,
    name: playlistName,
    cover: card.dataset.playlistCover || ''
  };

  state.activePlaylistId = playlistId;
  updateActivePlaylistCard();
  positionShelfNearCard(card);

  if (String(state.activePlaylist && state.activePlaylist.id) === String(playlistId) && state.activePlaylistSongs.length) {
    renderPlaylistShelf(state.activePlaylist, state.activePlaylistSongs, { preserveScroll: true });
    return;
  }
  if (state.shelfLoadingPlaylistId === String(playlistId)) return;

  state.shelfLoadingPlaylistId = String(playlistId);
  card.classList.add('is-loading');
  card.disabled = true;
  card.setAttribute('aria-busy', 'true');
  renderShelfLoading(playlist);
  try {
    const data = await apiJson(`/api/playlist/tracks?${query({ id: playlistId, limit: 50 })}`);
    const songs = Array.isArray(data.songs) ? data.songs : [];
    if (!songs.length) {
      renderPlaylistShelf(playlist, []);
      toast(`歌单「${playlistName}」暂无可播放歌曲`);
      return;
    }
    renderPlaylistShelf(playlist, songs);
  } catch (error) {
    toast(error.message);
  } finally {
    state.shelfLoadingPlaylistId = '';
    card.classList.remove('is-loading');
    card.disabled = false;
    card.removeAttribute('aria-busy');
  }
}

async function playShelfSong(button) {
  const index = Number(button.dataset.songIndex);
  const song = state.activePlaylistSongs[index];
  if (!song) return;

  button.classList.add('is-loading');
  button.disabled = true;
  try {
    await apiJson('/api/player/queue', {
      method: 'POST',
      body: JSON.stringify({ songs: state.activePlaylistSongs, currentIndex: index })
    });
    state.queue = state.activePlaylistSongs;
    state.queueIndex = index;
    const loaded = await loadSong(song);
    if (loaded) {
      enterPlaybackPage();
      await refreshPlayerState();
      updateShelfCurrentSong();
      toast(`正在播放：${safeText(song.title, '歌曲')}`);
    }
  } catch (error) {
    toast(error.message);
  } finally {
    button.classList.remove('is-loading');
    button.disabled = false;
  }
}

function playbackLyricText(song = state.currentSong) {
  return safeText(song && song.title, 'FE Monster');
}

function playbackLyricSubtitle(song = state.currentSong) {
  return safeText(song && (song.artist || song.album), 'READY');
}

function parseLyricTime(raw) {
  const match = /^(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?$/.exec(raw.trim());
  if (!match) return Number.NaN;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = match[3] ? Number(`0.${match[3].padEnd(3, '0').slice(0, 3)}`) : 0;
  return minutes * 60 + seconds + fraction;
}

function parseLrc(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = [];
  text.split(/\r?\n/).forEach((rawLine) => {
    const stamps = Array.from(rawLine.matchAll(/\[([0-9:.]+)\]/g));
    if (!stamps.length) return;
    const lyric = rawLine.replace(/\[[^\]]+\]/g, '').trim();
    if (!lyric || /^作词|^作曲|^编曲|^制作|^出品|^发行/.test(lyric)) return;
    stamps.forEach((stamp) => {
      const time = parseLyricTime(stamp[1]);
      if (Number.isFinite(time)) lines.push({ time, text: lyric });
    });
  });
  return lines
    .sort((a, b) => a.time - b.time)
    .filter((line, index, arr) => index === 0 || line.time !== arr[index - 1].time || line.text !== arr[index - 1].text);
}

function lyricPayloadText(payload) {
  const candidates = [
    payload && payload.lrc && payload.lrc.lyric,
    payload && payload.tlyric && payload.tlyric.lyric,
    payload && payload.klyric && payload.klyric.lyric,
    payload && payload.yrc && payload.yrc.lyric
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim()) || '';
}

function setPlaybackLyricLine(text, subtitle, progress = 0) {
  const line = safeText(text, playbackLyricText());
  const nextSubtitle = safeText(subtitle, playbackLyricSubtitle());
  const progressPercent = Math.round(clamp(progress, 0, 1) * 100);

  if (line !== state.lyricDisplayText) {
    els.playbackLyricScene.querySelectorAll('.playback-lyric-layer').forEach((layer) => {
      layer.textContent = line;
      layer.setAttribute('data-text', line);
    });
    state.lyricDisplayText = line;
  }

  if (nextSubtitle !== state.lyricSubtitleText) {
    els.playbackLyricSubtitle.textContent = nextSubtitle;
    state.lyricSubtitleText = nextSubtitle;
  }

  if (progressPercent !== state.lyricProgressPercent) {
    els.playbackLyricScene.style.setProperty('--lyric-line-progress', `${progressPercent}%`);
    state.lyricProgressPercent = progressPercent;
  }
}

function findLyricIndexAtTime(lines, currentTime) {
  let low = 0;
  let high = lines.length - 1;
  let found = 0;
  const time = currentTime + 0.08;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lines[mid].time <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

function updatePlaybackLyricAtTime(currentTime = els.audio.currentTime || 0) {
  const lines = state.lyricLines;
  const subtitle = playbackLyricSubtitle();
  if (!lines.length) {
    setPlaybackLyricLine(playbackLyricText(), subtitle, 0);
    state.lyricIndex = -1;
    return;
  }

  let index = state.lyricIndex;
  if (index < 0 || !lines[index] || currentTime + 0.18 < lines[index].time) {
    index = findLyricIndexAtTime(lines, currentTime);
  } else {
    while (lines[index + 1] && lines[index + 1].time <= currentTime + 0.08) {
      index += 1;
    }
  }

  const line = lines[index];
  const nextLine = lines[index + 1];
  const endTime = nextLine ? nextLine.time : Math.max(line.time + 4, Number(els.audio.duration) || line.time + 4);
  const progress = endTime > line.time ? (currentTime - line.time) / (endTime - line.time) : 1;
  state.lyricIndex = index;
  setPlaybackLyricLine(line.text, subtitle, progress);
}

function lyricSignatureForSong(song = state.currentSong) {
  const id = safeText(song && song.id, '');
  return id ? `${id}|${safeText(song && song.title, '')}` : '';
}

async function loadPlaybackLyrics(song = state.currentSong) {
  const id = safeText(song && song.id, '');
  const signature = lyricSignatureForSong(song);
  if (!id || signature === state.lyricSignature) return;
  state.lyricSignature = signature;
  state.lyricLines = [];
  state.lyricIndex = -1;
  state.lyricProgressPercent = -1;
  setPlaybackLyricLine(playbackLyricText(song), playbackLyricSubtitle(song), 0);

  try {
    const payload = await apiJson(`/api/netease/lyric?${query({ id })}`);
    if (signature !== state.lyricSignature) return;
    const parsed = parseLrc(lyricPayloadText(payload));
    state.lyricLines = parsed.length ? parsed : [];
    state.lyricIndex = -1;
    updatePlaybackLyricAtTime();
  } catch (error) {
    if (signature === state.lyricSignature) {
      state.lyricLines = [];
      setPlaybackLyricLine(playbackLyricText(song), playbackLyricSubtitle(song), 0);
    }
  }
}

function updatePlaybackLyricText(song = state.currentSong) {
  if (!els.playbackLyricScene) return;
  updateLyricPalette(song);
  const signature = lyricSignatureForSong(song);
  if (!signature) {
    state.lyricSignature = '';
    state.lyricLines = [];
    state.lyricIndex = -1;
    setPlaybackLyricLine(playbackLyricText(song), playbackLyricSubtitle(song), 0);
    return;
  }
  if (signature !== state.lyricSignature) {
    loadPlaybackLyrics(song);
    return;
  }
  updatePlaybackLyricAtTime();
}

function setPlaybackLyricVisible(visible) {
  if (!els.playbackLyricScene) return;
  els.playbackLyricScene.hidden = !visible;
}

function updatePlaybackSceneTransform() {
  if (!els.playbackLyricScene) return;
  els.playbackLyricScene.style.setProperty('--scene-rotate-x', `${state.playbackVisual.pitch}rad`);
  els.playbackLyricScene.style.setProperty('--scene-rotate-y', `${state.playbackVisual.yaw}rad`);
  syncShelfRotationToPlaybackView();
}

function resetPlaybackView() {
  state.playbackVisual.yaw = PLAYBACK_REST_YAW;
  state.playbackVisual.pitch = PLAYBACK_REST_PITCH;
  state.playbackVisual.velocityYaw = 0;
  state.playbackVisual.velocityPitch = 0;
  updatePlaybackSceneTransform();
}

function updateLyricDiyVars() {
  if (!els.playbackLyricScene) return;
  els.playbackLyricScene.style.setProperty('--lyric-brightness', state.lyricBrightness.toFixed(2));
  els.playbackLyricScene.style.setProperty('--lyric-speed', state.lyricSpeed.toFixed(2));
  els.playbackLyricScene.style.setProperty('--lyric-duration', `${Math.round(720 / state.lyricSpeed)}ms`);
  if (els.lyricBrightnessValue) els.lyricBrightnessValue.textContent = `${Math.round(state.lyricBrightness * 100)}%`;
  if (els.lyricSpeedValue) els.lyricSpeedValue.textContent = `${Math.round(state.lyricSpeed * 100)}%`;
  if (els.cubeIntensityValue) els.cubeIntensityValue.textContent = `${Math.round(state.cubeIntensity * 100)}%`;
}

function setDiyPreset(preset) {
  state.diyPreset = preset === 'cube' ? 'cube' : 'lyric';
  if (els.diyLyricPreset) els.diyLyricPreset.classList.toggle('is-active', state.diyPreset === 'lyric');
  if (els.diyCubePreset) els.diyCubePreset.classList.toggle('is-active', state.diyPreset === 'cube');
  if (els.diyPresetPage) els.diyPresetPage.dataset.activePreset = state.diyPreset;
  updateDynamicCubeVisibility();
  updateLyricDiyVars();
}

function setDiyOpen(open) {
  state.diyOpen = !!open;
  els.appShell.classList.toggle('is-diy-open', state.diyOpen);
  if (els.diyButton) els.diyButton.setAttribute('aria-expanded', String(state.diyOpen));
  if (els.diySidebar) els.diySidebar.setAttribute('aria-hidden', String(!state.diyOpen));
}

function renderCurrent(song = state.currentSong) {
  resetSpectrumForSong(song);
  const active = song || { title: '未播放', artist: '等待播放器状态' };
  els.dockTitle.textContent = safeText(active.title, '未播放');
  els.dockArtist.textContent = safeText(active.artist || active.album, '等待播放器状态');
  setImage(els.dockCover, song);
  updatePlaybackLyricText(song);
  updatePlayState();
  updateShelfCurrentSong();
}

function updatePlayState() {
  const playing = !els.audio.paused && !!els.audio.src;
  els.playButton.classList.toggle('is-playing', playing);
  els.playButton.title = playing ? '暂停' : '播放';
  els.playButton.setAttribute('aria-label', playing ? '暂停' : '播放');
  els.dockStatus.textContent = playing ? 'PLAYING' : 'READY';
  els.dockStatus.classList.toggle('playing', playing);
  if (els.playbackLyricScene) els.playbackLyricScene.classList.toggle('is-playing', playing);
}

async function refreshPlayerState() {
  const data = await apiJson('/api/player/state');
  state.queue = Array.isArray(data.queue) ? data.queue : [];
  state.queueIndex = Number.isInteger(data.queueIndex) ? data.queueIndex : -1;
  state.currentSong = data.song && data.song.id ? data.song : state.currentSong;
  state.playerUrl = data.url || state.playerUrl;
  els.volumeRange.value = Math.round((Number(data.volume) || 0.8) * 100);
  els.volumeLabel.textContent = `${els.volumeRange.value}%`;
  renderCurrent();
}

async function refreshVisualBridge() {
  try {
    const data = await apiJson('/api/visual-bridge/state');
    const audio = data.audio || {};
    state.visualBridge.energy = Number(audio.energy) || 0;
    state.visualBridge.bass = Number(audio.bass) || 0;
    state.visualBridge.beat = Number(audio.beat) || 0;
    state.visualBridge.mid = Number(audio.mid) || 0;
    state.visualBridge.treble = Number(audio.treble) || 0;
    applyBridgeVisual();
  } catch (error) {
    // The particle stage keeps breathing even without bridge data.
  }
}

async function loadSong(song) {
  try {
    const data = await apiJson(`/api/player/load?${songParams(song)}`);
    if (!data.playable || !data.url) throw new Error(data.error || '当前歌曲不可播放');
    state.currentSong = data.song || song;
    state.playerUrl = data.url;
    els.audio.src = data.url;
    els.audio.volume = Number(els.volumeRange.value) / 100;
    resetSpectrumForSong(state.currentSong);
    enterPlaybackPage();
    renderCurrent(state.currentSong);
    await els.audio.play();
    ensureAudioAnalysis();
    updatePlayState();
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}

async function submitSearch(event) {
  event.preventDefault();

  const keyword = els.searchInput.value.trim();
  if (!keyword) {
    toast('请输入搜索关键词');
    els.searchInput.focus();
    return;
  }

  els.searchForm.classList.add('is-loading');
  els.searchForm.setAttribute('aria-busy', 'true');
  try {
    const data = await apiJson(`/api/search?${query({ q: keyword, limit: 1 })}`);
    const songs = Array.isArray(data.songs) ? data.songs : [];
    const song = songs[0];
    if (!song) {
      toast(`没有找到「${keyword}」`);
      return;
    }

    const loaded = await loadSong(song);
    if (loaded) {
      els.searchInput.blur();
      toast(`正在播放：${safeText(song.title, keyword)}`);
    }
  } catch (error) {
    toast(error.message);
  } finally {
    els.searchForm.classList.remove('is-loading');
    els.searchForm.removeAttribute('aria-busy');
  }
}

async function playQueueIndex(index) {
  const song = state.queue[index];
  if (!song) {
    toast('播放栏暂无歌曲');
    return;
  }
  await loadSong(song);
  await refreshPlayerState();
}

async function transport(path) {
  try {
    const data = await apiJson(path);
    if (!data.playable || !data.url) {
      toast(data.error || '队列里没有可播放歌曲');
      await refreshPlayerState();
      return;
    }
    state.currentSong = data.song || state.currentSong;
    state.playerUrl = data.url;
    els.audio.src = data.url;
    resetSpectrumForSong(state.currentSong);
    enterPlaybackPage();
    renderCurrent(state.currentSong);
    await els.audio.play();
    ensureAudioAnalysis();
    await refreshPlayerState();
  } catch (error) {
    toast(error.message);
  }
}

async function togglePlay() {
  if (!els.audio.src && state.currentSong) {
    await loadSong(state.currentSong);
    return;
  }
  if (!els.audio.src && state.queue.length) {
    await playQueueIndex(Math.max(0, state.queueIndex));
    return;
  }
  if (!els.audio.src) {
    toast('播放栏暂无歌曲');
    return;
  }
  if (els.audio.paused) {
    try {
      await apiJson('/api/player/play');
      enterPlaybackPage();
      await els.audio.play();
      ensureAudioAnalysis();
    } catch (error) {
      toast(error.message);
    }
  } else {
    els.audio.pause();
    await apiJson('/api/player/pause').catch(() => {});
  }
  updatePlayState();
}

function updateProgress() {
  const duration = Number.isFinite(els.audio.duration) ? els.audio.duration : 0;
  const current = Number.isFinite(els.audio.currentTime) ? els.audio.currentTime : 0;
  els.progressRange.value = duration > 0 ? Math.round((current / duration) * 1000) : 0;
  els.currentTime.textContent = formatTime(current);
  els.totalTime.textContent = formatTime(duration || (state.currentSong && state.currentSong.duration) || 0);
  updatePlaybackLyricAtTime(current);
}

function clearShelfPressTimer() {
  if (!state.shelfPressTimer) return;
  window.clearTimeout(state.shelfPressTimer);
  state.shelfPressTimer = 0;
}

function shelfPointerTargetIsInteractive(event) {
  return !!event.target.closest('.playlist-shelf-hide, .shelf-song-button');
}

function beginShelfDrag(event) {
  if (event.button !== 0) return;
  if (shelfPointerTargetIsInteractive(event)) return;
  const center = currentShelfCenter();
  state.shelfDragging = true;
  state.shelfPointerId = event.pointerId;
  state.shelfInteraction = 'pending';
  state.shelfPressStartedAt = performance.now();
  state.shelfPressX = event.clientX;
  state.shelfPressY = event.clientY;
  state.shelfStartLeft = center.left;
  state.shelfStartTop = center.top;
  state.shelfLastX = event.clientX;
  state.shelfLastY = event.clientY;
  els.playlistShelf.classList.add('is-pressing');
  els.playlistShelfStage.setPointerCapture(event.pointerId);
  clearShelfPressTimer();
  state.shelfPressTimer = window.setTimeout(() => {
    if (!state.shelfDragging || state.shelfPointerId !== event.pointerId || state.shelfInteraction !== 'pending') return;
    state.shelfInteraction = 'move';
    els.playlistShelf.classList.remove('is-pressing', 'is-dragging');
    els.playlistShelf.classList.add('is-position-dragging');
  }, state.playbackPage ? 240 : 420);
  event.preventDefault();
  event.stopPropagation();
}

function moveShelfDrag(event) {
  if (!state.shelfDragging || event.pointerId !== state.shelfPointerId) return;
  const totalDx = event.clientX - state.shelfPressX;
  const totalDy = event.clientY - state.shelfPressY;
  const dx = event.clientX - state.shelfLastX;
  const dy = event.clientY - state.shelfLastY;

  const distance = Math.hypot(totalDx, totalDy);
  if (state.shelfInteraction === 'pending') {
    if (state.playbackPage) {
      const heldMs = performance.now() - state.shelfPressStartedAt;
      if (distance > 5 && heldMs < 210) {
        clearShelfPressTimer();
        state.shelfInteraction = 'view';
        els.playlistShelf.classList.remove('is-pressing', 'is-position-dragging');
        els.playlistShelf.classList.add('is-dragging');
      } else if (heldMs > 180 && distance > 2) {
        clearShelfPressTimer();
        state.shelfInteraction = 'move';
        els.playlistShelf.classList.remove('is-pressing', 'is-dragging');
        els.playlistShelf.classList.add('is-position-dragging');
      }
    } else if (distance > 5) {
      clearShelfPressTimer();
      state.shelfInteraction = 'rotate';
      els.playlistShelf.classList.remove('is-pressing', 'is-position-dragging');
      els.playlistShelf.classList.add('is-dragging');
    }
  }

  if (state.shelfInteraction === 'rotate') {
    setShelfRotation(state.shelfRotateX - dy * 0.16, state.shelfRotateY + dx * 0.44);
  } else if (state.shelfInteraction === 'view') {
    state.playbackVisual.yaw += dx * 0.0095;
    state.playbackVisual.pitch -= dy * 0.0095;
    state.playbackVisual.velocityYaw = dx * 0.00062;
    state.playbackVisual.velocityPitch = -dy * 0.00062;
    updatePlaybackSceneTransform();
  } else if (state.shelfInteraction === 'move') {
    setShelfPosition(
      state.shelfStartLeft + totalDx,
      state.shelfStartTop + totalDy,
      {
        width: state.playbackPage ? 318 : 368,
        height: state.playbackPage ? 382 : 430,
        bottomInset: state.playbackPage ? 104 : 94
      }
    );
  }

  state.shelfLastX = event.clientX;
  state.shelfLastY = event.clientY;
  event.preventDefault();
  event.stopPropagation();
}

function endShelfDrag(event) {
  if (!state.shelfDragging || event.pointerId !== state.shelfPointerId) return;
  const wasPending = state.shelfInteraction === 'pending';
  const clickedBack = wasPending && event.type === 'pointerup' && event.target.closest('#playlistShelfBack');
  clearShelfPressTimer();
  state.shelfDragging = false;
  state.shelfPointerId = null;
  state.shelfInteraction = '';
  els.playlistShelf.classList.remove('is-pressing', 'is-dragging', 'is-position-dragging');
  if (els.playlistShelfStage.hasPointerCapture(event.pointerId)) {
    els.playlistShelfStage.releasePointerCapture(event.pointerId);
  }
  if (clickedBack) showShelfFront();
}

function bindEvents() {
  els.searchForm.addEventListener('submit', submitSearch);
  els.homeButton.addEventListener('click', returnHomePage);
  els.diyButton.addEventListener('click', () => setDiyOpen(!state.diyOpen));
  els.diyCloseButton.addEventListener('click', () => setDiyOpen(false));
  els.diyPresetButton.addEventListener('click', () => {
    if (!els.diyPresetPage) return;
    els.diyPresetPage.classList.toggle('is-expanded');
    els.diyPresetButton.setAttribute('aria-expanded', String(els.diyPresetPage.classList.contains('is-expanded')));
  });
  if (els.diyLyricPreset) els.diyLyricPreset.addEventListener('click', () => setDiyPreset('lyric'));
  if (els.diyCubePreset) els.diyCubePreset.addEventListener('click', () => setDiyPreset('cube'));
  els.lyricBrightnessRange.addEventListener('input', () => {
    state.lyricBrightness = clamp(Number(els.lyricBrightnessRange.value) / 100, 0.6, 1.8);
    updateLyricDiyVars();
  });
  els.lyricSpeedRange.addEventListener('input', () => {
    state.lyricSpeed = clamp(Number(els.lyricSpeedRange.value) / 100, 0.6, 1.8);
    updateLyricDiyVars();
  });
  if (els.cubeIntensityRange) {
    els.cubeIntensityRange.addEventListener('input', () => {
      state.cubeIntensity = clamp(Number(els.cubeIntensityRange.value) / 100, 0.4, 1.8);
      updateLyricDiyVars();
    });
  }
  els.loginButton.addEventListener('click', showLoginDialog);
  els.loginClose.addEventListener('click', closeLoginDialog);
  els.loginRefresh.addEventListener('click', loadLoginQr);
  els.loginDialog.addEventListener('click', (event) => {
    if (event.target.closest('[data-login-close]')) closeLoginDialog();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!els.loginDialog.hidden) closeLoginDialog();
    else if (state.diyOpen) setDiyOpen(false);
    else if (!els.playlistShelf.hidden) hidePlaylistShelf();
  });
  els.playlistCards.addEventListener('pointerdown', (event) => event.stopPropagation());
  els.playlistCards.addEventListener('click', (event) => {
    const card = event.target.closest('.orb-playlist-card');
    if (!card) return;
    event.stopPropagation();
    loadPlaylistFromCard(card);
  });
  els.playlistShelf.addEventListener('pointerdown', (event) => event.stopPropagation());
  els.playlistShelfClose.addEventListener('click', () => hidePlaylistShelf());
  els.playlistShelfBack.addEventListener('click', (event) => {
    event.stopPropagation();
    showShelfFront();
  });
  els.playlistShelfBack.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    showShelfFront();
  });
  els.playlistSongStack.addEventListener('click', (event) => {
    const button = event.target.closest('.shelf-song-button');
    if (!button) return;
    event.stopPropagation();
    playShelfSong(button);
  });
  if (els.playlistSongStackBack) {
    els.playlistSongStackBack.addEventListener('click', (event) => {
      const button = event.target.closest('.shelf-song-button');
      if (!button) return;
      event.stopPropagation();
      playShelfSong(button);
    });
  }
  els.playlistShelfStage.addEventListener('pointerdown', beginShelfDrag);
  els.playlistShelfStage.addEventListener('pointermove', moveShelfDrag);
  els.playlistShelfStage.addEventListener('pointerup', endShelfDrag);
  els.playlistShelfStage.addEventListener('pointercancel', endShelfDrag);
  els.playButton.addEventListener('click', togglePlay);
  els.prevButton.addEventListener('click', () => transport('/api/player/previous'));
  els.nextButton.addEventListener('click', () => transport('/api/player/next'));
  window.addEventListener('focus', () => {
    refreshLoginStatus();
    scheduleUserPlaylistsRefresh(160);
  }, { passive: true });
  window.addEventListener('online', () => scheduleUserPlaylistsRefresh(160), { passive: true });
  window.addEventListener('pageshow', () => scheduleUserPlaylistsRefresh(160), { passive: true });
  window.addEventListener('resize', () => {
    if (els.playlistShelf.hidden || state.playbackPage || !state.activePlaylistId) return;
    const activeCard = els.playlistCards.querySelector(`.orb-playlist-card[data-playlist-id="${CSS.escape(String(state.activePlaylistId))}"]`);
    positionShelfNearCard(activeCard);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshLoginStatus();
      scheduleUserPlaylistsRefresh(160);
    }
  });

  els.progressRange.addEventListener('input', () => {
    const duration = Number.isFinite(els.audio.duration) ? els.audio.duration : 0;
    if (!duration) return;
    els.audio.currentTime = (Number(els.progressRange.value) / 1000) * duration;
    updateProgress();
  });

  els.progressRange.addEventListener('change', () => {
    apiJson(`/api/player/seek?${query({ position: Math.round(els.audio.currentTime || 0) })}`).catch(() => {});
  });

  els.volumeRange.addEventListener('input', () => {
    const volume = Number(els.volumeRange.value) / 100;
    els.audio.volume = volume;
    els.volumeLabel.textContent = `${els.volumeRange.value}%`;
    apiJson(`/api/player/volume?${query({ value: volume.toFixed(2) })}`).catch(() => {});
  });

  els.audio.addEventListener('timeupdate', updateProgress);
  els.audio.addEventListener('durationchange', updateProgress);
  els.audio.addEventListener('loadedmetadata', () => resetSpectrumForSong(state.currentSong));
  els.audio.addEventListener('play', () => {
    ensureAudioAnalysis();
    updatePlayState();
  });
  els.audio.addEventListener('pause', () => {
    state.audioAnalysis.live = false;
    applyBridgeVisual();
    updatePlayState();
  });
  els.audio.addEventListener('ended', () => transport('/api/player/next'));
  els.audio.addEventListener('error', () => toast('本地客户端无法播放当前音频源'));
}

function rotatePoint(point, yaw, pitch) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x1 = point.x * cy + point.z * sy;
  const z1 = -point.x * sy + point.z * cy;
  const y1 = point.y * cp - z1 * sp;
  const z2 = point.y * sp + z1 * cp;
  return { x: x1, y: y1, z: z2 };
}

function bindOrbEvents() {
  els.stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (state.playbackPage) {
      state.playbackVisual.dragging = true;
      state.playbackVisual.pointerId = event.pointerId;
      state.playbackVisual.lastX = event.clientX;
      state.playbackVisual.lastY = event.clientY;
      state.playbackVisual.velocityYaw = 0;
      state.playbackVisual.velocityPitch = 0;
    } else {
      state.orb.dragging = true;
      state.orb.pointerId = event.pointerId;
      state.orb.lastX = event.clientX;
      state.orb.lastY = event.clientY;
      state.orb.velocityYaw = 0;
      state.orb.velocityPitch = 0;
    }
    els.stage.classList.add('is-dragging');
    els.stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  els.stage.addEventListener('pointermove', (event) => {
    const rect = els.stage.getBoundingClientRect();
    state.playbackVisual.mouseX = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    state.playbackVisual.mouseY = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    if (state.playbackPage) {
      if (!state.playbackVisual.dragging || event.pointerId !== state.playbackVisual.pointerId) return;
      const dx = event.clientX - state.playbackVisual.lastX;
      const dy = event.clientY - state.playbackVisual.lastY;
      state.playbackVisual.lastX = event.clientX;
      state.playbackVisual.lastY = event.clientY;
      state.playbackVisual.yaw += dx * 0.0095;
      state.playbackVisual.pitch -= dy * 0.0095;
      state.playbackVisual.velocityYaw = dx * 0.00062;
      state.playbackVisual.velocityPitch = -dy * 0.00062;
      updatePlaybackSceneTransform();
      return;
    }
    if (!state.orb.dragging || event.pointerId !== state.orb.pointerId) return;
    const dx = event.clientX - state.orb.lastX;
    const dy = event.clientY - state.orb.lastY;
    state.orb.lastX = event.clientX;
    state.orb.lastY = event.clientY;
    state.orb.yaw += dx * 0.0105;
    state.orb.pitch += dy * 0.0105;
    state.orb.velocityYaw = dx * 0.00072;
    state.orb.velocityPitch = dy * 0.00072;
    state.orb.trailYaw = clamp(dx * 0.0032, -0.28, 0.28);
    state.orb.trailPitch = clamp(dy * 0.0032, -0.22, 0.22);
    state.orb.trailBoost = clamp(Math.hypot(dx, dy) / 46, 0.28, 1.18);
  });

  const endDrag = (event) => {
    if (state.playbackVisual.dragging && event.pointerId === state.playbackVisual.pointerId) {
      state.playbackVisual.dragging = false;
      state.playbackVisual.pointerId = null;
      els.stage.classList.remove('is-dragging');
      if (els.stage.hasPointerCapture(event.pointerId)) els.stage.releasePointerCapture(event.pointerId);
      return;
    }
    if (!state.orb.dragging || event.pointerId !== state.orb.pointerId) return;
    state.orb.dragging = false;
    state.orb.pointerId = null;
    els.stage.classList.remove('is-dragging');
    if (els.stage.hasPointerCapture(event.pointerId)) els.stage.releasePointerCapture(event.pointerId);
  };

  els.stage.addEventListener('pointerup', endDrag);
  els.stage.addEventListener('pointercancel', endDrag);
  els.stage.addEventListener('pointerup', (event) => {
    if (event.button !== 2 || !state.shelfHiddenByUser) return;
    const now = performance.now();
    if (now - state.shelfLastRightClickAt < 460) {
      event.preventDefault();
      showActivePlaylistShelf();
      state.shelfLastRightClickAt = 0;
      return;
    }
    state.shelfLastRightClickAt = now;
  });
  els.stage.addEventListener('contextmenu', (event) => {
    if (state.shelfHiddenByUser && state.activePlaylist) event.preventDefault();
  });
  els.stage.addEventListener('dblclick', (event) => {
    if (!state.playbackPage || event.button !== 0) return;
    resetPlaybackView();
  });
}

function initParticles() {
  state.particles = Array.from({ length: 760 }, (_, index) => {
    const a = index * 2.399963;
    const z = 1 - (index / 759) * 2;
    const r = Math.sqrt(1 - z * z);
    return {
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      z,
      size: 0.62 + Math.random() * 1.28,
      phase: Math.random() * Math.PI * 2,
      seed: Math.random(),
      tint: Math.random()
    };
  });
}

function initPlaybackParticles() {
  state.playbackVisual.particles = Array.from({ length: 1400 }, () => ({
    x: Math.random() * 2 - 1,
    y: Math.random() * 2 - 1,
    z: Math.random() * 2 - 1,
    size: 0.42 + Math.random() * 1.05,
    speed: 0.18 + Math.random() * 0.74,
    drift: Math.random() * Math.PI * 2,
    phase: Math.random() * Math.PI * 2
  }));
}

function recyclePlaybackParticle(particle, direction = -1) {
  particle.x = Math.random() * 2 - 1;
  particle.y = direction < 0 ? 1.18 + Math.random() * 0.28 : -1.18 - Math.random() * 0.28;
  particle.z = Math.random() * 2 - 1;
  particle.phase = Math.random() * Math.PI * 2;
}

function createPlaybackParticleSprite(size, coreRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const center = size / 2;
  const radius = size / 2;
  const gradient = context.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
  gradient.addColorStop(coreRatio, 'rgba(255, 255, 255, 0.58)');
  gradient.addColorStop(0.52, 'rgba(255, 255, 255, 0.18)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return canvas;
}

function playbackParticleSprites(dpr) {
  const key = Math.round(dpr * 100);
  if (state.playbackVisual.spriteDpr === key && state.playbackVisual.particleSprites.length) {
    return state.playbackVisual.particleSprites;
  }
  state.playbackVisual.spriteDpr = key;
  state.playbackVisual.particleSprites = [
    createPlaybackParticleSprite(Math.ceil(14 * dpr), 0.16),
    createPlaybackParticleSprite(Math.ceil(22 * dpr), 0.12),
    createPlaybackParticleSprite(Math.ceil(32 * dpr), 0.09)
  ];
  return state.playbackVisual.particleSprites;
}

function updatePlaybackQuality(visual) {
  const now = performance.now();
  if (visual.lastFrameTime) {
    const frameMs = now - visual.lastFrameTime;
    if (frameMs > 25) visual.quality = Math.max(0.46, visual.quality - 0.035);
    else if (frameMs < 18) visual.quality = Math.min(0.82, visual.quality + 0.01);
  }
  visual.lastFrameTime = now;
}

function updateOrbMotion() {
  if (!state.orb.dragging && !state.orb.reducedMotion) {
    const beatPush = Math.max(0, state.visual.beat - 0.62) * 0.0018;
    state.orb.yaw += 0.0018 + beatPush + state.orb.velocityYaw;
    state.orb.pitch += state.orb.velocityPitch;
    state.orb.velocityYaw *= 0.94;
    state.orb.velocityPitch *= 0.94;
  }
  const trailDecay = state.orb.dragging ? 0.94 : 0.9;
  state.orb.trailYaw *= trailDecay;
  state.orb.trailPitch *= trailDecay;
  state.orb.trailBoost *= trailDecay;
  const fullTurn = Math.PI * 2;
  if (Math.abs(state.orb.yaw) > Math.PI * 64) state.orb.yaw %= fullTurn;
  if (Math.abs(state.orb.pitch) > Math.PI * 64) state.orb.pitch %= fullTurn;
}

function updatePlaybackSceneMotion() {
  const visual = state.playbackVisual;
  if (state.lyricLines.length) updatePlaybackLyricAtTime();
  if (!visual.dragging && !state.orb.reducedMotion) {
    visual.yaw += visual.velocityYaw;
    visual.pitch += visual.velocityPitch;
    visual.velocityYaw *= 0.91;
    visual.velocityPitch *= 0.91;
  }
  visual.yaw = wrapRadians(visual.yaw);
  visual.pitch = wrapRadians(visual.pitch);
  updatePlaybackSceneTransform();

  const energy = Math.max(state.visual.energy, els.audio.paused ? 0.08 : 0.48);
  const bass = Math.max(state.visual.bass, els.audio.paused ? 0.06 : 0.38);
  const beat = Math.max(state.visual.beat, els.audio.paused ? 0.04 : 0.32);
  const targetPulse = els.audio.paused ? 0.08 : clamp(energy * 0.42 + bass * 0.28 + beat * 0.48, 0.08, 1.18);
  const response = clamp(0.08 * state.lyricSpeed, 0.045, 0.24);
  visual.lyricPulse += (targetPulse - visual.lyricPulse) * response;
  const t = performance.now() / 1000;
  const heartA = Math.pow(Math.max(0, Math.sin(t * Math.PI * (1.35 + state.lyricSpeed * 0.34))), 12);
  const heartB = Math.pow(Math.max(0, Math.sin((t + 0.18) * Math.PI * (1.35 + state.lyricSpeed * 0.34))), 18) * 0.48;
  const heart = els.audio.paused ? 0 : clamp((heartA + heartB) * (0.42 + bass * 0.9), 0, 1.35);
  const bounce = els.audio.paused
    ? 0
    : Math.sin(t * (4.4 + state.lyricSpeed * 3.2)) * visual.lyricPulse * 3.8 - heart * 13;
  const scale = 1 + visual.lyricPulse * 0.04 + heart * 0.13;
  els.playbackLyricScene.style.setProperty('--lyric-pulse', visual.lyricPulse.toFixed(3));
  els.playbackLyricScene.style.setProperty('--lyric-bounce', `${bounce.toFixed(2)}px`);
  els.playbackLyricScene.style.setProperty('--lyric-scale', scale.toFixed(3));
  els.playbackLyricScene.style.setProperty('--lyric-heart', heart.toFixed(3));
  els.playbackLyricScene.style.setProperty('--lyric-glow-size', `${Math.round(8 + visual.lyricPulse * 10 + heart * 18)}px`);
  updateDynamicCubeMotion();
}

function drawPlaybackParticles(context, rect, dpr, width, height) {
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);
  updatePlaybackSceneMotion();

  const visual = state.playbackVisual;
  updatePlaybackQuality(visual);
  const t = performance.now() / 1000;
  const speed = state.lyricSpeed;
  const energy = Math.max(state.visual.energy, els.audio.paused ? 0.12 : 0.55);
  const bass = Math.max(state.visual.bass, els.audio.paused ? 0.08 : 0.42);
  const cx = width / 2;
  const cy = height / 2;
  const spreadX = width * 0.52;
  const spreadY = height * 0.62;
  const mouseX = visual.mouseX * width;
  const mouseY = visual.mouseY * height;
  const sprites = playbackParticleSprites(dpr);
  const particleLimit = Math.max(520, Math.floor(visual.particles.length * visual.quality));

  context.save();
  context.globalCompositeOperation = 'lighter';
  context.shadowBlur = 0;
  for (let index = 0; index < particleLimit; index += 1) {
    const particle = visual.particles[index];
    particle.y -= (0.00055 + particle.speed * 0.00082) * speed * (1 + energy * 0.55) * (height / 720);
    particle.x += Math.sin(t * 0.62 + particle.phase) * 0.00065 * speed;
    particle.z += Math.cos(t * 0.42 + particle.drift) * 0.0005 * speed;
    if (particle.y < -1.24) recyclePlaybackParticle(particle, -1);
    if (particle.x > 1.32 || particle.x < -1.32 || particle.z > 1.24 || particle.z < -1.24) {
      particle.x = Math.random() * 2 - 1;
      particle.z = Math.random() * 2 - 1;
    }

    const point = rotatePoint(particle, visual.yaw + particle.phase * 0.008, visual.pitch);
    const perspective = 1.34 / (1.34 - point.z * 0.42);
    let x = cx + point.x * spreadX * perspective;
    let y = cy + point.y * spreadY * perspective;
    const dx = x - mouseX;
    const dy = y - mouseY;
    const distance = Math.hypot(dx, dy);
    if (distance < 170 * dpr) {
      const force = (1 - distance / (170 * dpr)) * (26 + energy * 22) * dpr;
      const angle = Math.atan2(dy, dx);
      x += Math.cos(angle) * force;
      y += Math.sin(angle) * force;
    }
    const depth = (point.z + 1) / 2;
    const flicker = 0.72 + Math.sin(t * 2.2 + particle.phase) * 0.22;
    const size = Math.max(1.55 * dpr, particle.size * (3.4 + bass * 1.9) * perspective * dpr);
    const alpha = clamp(0.34 + depth * 0.5 + energy * 0.24, 0.18, 0.98) * flicker;
    const sprite = sprites[depth > 0.72 ? 2 : depth > 0.38 ? 1 : 0];
    const drawSize = size * (depth > 0.72 ? 2.3 : depth > 0.38 ? 1.9 : 1.55);
    context.globalAlpha = alpha;
    context.drawImage(sprite, x - drawSize / 2, y - drawSize / 2, drawSize, drawSize);
  }
  context.globalAlpha = 1;
  context.restore();
}

function scheduleAmbientOrbStreak(now) {
  state.orb.nextAmbientStreakAt = now + (state.orb.reducedMotion ? 6200 : 1400 + Math.random() * 3600);
}

function spawnAmbientOrbStreak(width, height, dpr, now) {
  const fromLeft = Math.random() > 0.42;
  const fromTop = !fromLeft && Math.random() > 0.36;
  const angle = fromLeft
    ? (-0.34 + Math.random() * 0.42)
    : (fromTop ? (0.46 + Math.random() * 0.42) : (-0.72 + Math.random() * 0.34));
  const distance = Math.max(width, height) * (0.74 + Math.random() * 0.32);
  const startX = fromLeft ? -120 * dpr : Math.random() * width;
  const startY = fromTop ? -80 * dpr : height * (0.16 + Math.random() * 0.68);
  state.orb.ambientStreaks.push({
    startX,
    startY,
    vx: Math.cos(angle) * distance,
    vy: Math.sin(angle) * distance,
    length: (150 + Math.random() * 230) * dpr,
    width: (1.2 + Math.random() * 1.8) * dpr,
    startedAt: now,
    duration: 1150 + Math.random() * 680,
    phase: Math.random() * Math.PI * 2
  });
}

function drawAmbientOrbStreaks(context, width, height, dpr, now) {
  if (!state.orb.nextAmbientStreakAt) scheduleAmbientOrbStreak(now);
  if (!state.orb.reducedMotion && now >= state.orb.nextAmbientStreakAt) {
    spawnAmbientOrbStreak(width, height, dpr, now);
    if (Math.random() > 0.72) spawnAmbientOrbStreak(width, height, dpr, now + 80);
    scheduleAmbientOrbStreak(now);
  }

  state.orb.ambientStreaks = state.orb.ambientStreaks.filter((streak) => now - streak.startedAt < streak.duration);
  if (!state.orb.ambientStreaks.length) return;

  context.save();
  context.globalCompositeOperation = 'lighter';
  context.lineCap = 'round';
  for (const streak of state.orb.ambientStreaks) {
    const progress = clamp((now - streak.startedAt) / streak.duration, 0, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const fade = Math.sin(progress * Math.PI);
    const x = streak.startX + streak.vx * ease;
    const y = streak.startY + streak.vy * ease;
    const angle = Math.atan2(streak.vy, streak.vx);
    const tail = streak.length * (0.74 + progress * 0.4);
    const tx = x - Math.cos(angle) * tail;
    const ty = y - Math.sin(angle) * tail;
    const gradient = context.createLinearGradient(tx, ty, x, y);
    gradient.addColorStop(0, 'rgba(25, 116, 255, 0)');
    gradient.addColorStop(0.42, `rgba(25, 145, 255, ${0.18 * fade})`);
    gradient.addColorStop(0.82, `rgba(91, 211, 255, ${0.48 * fade})`);
    gradient.addColorStop(1, `rgba(245, 253, 255, ${0.9 * fade})`);
    context.shadowBlur = 18 * dpr * fade;
    context.shadowColor = `rgba(68, 190, 255, ${0.48 * fade})`;
    context.strokeStyle = gradient;
    context.lineWidth = streak.width * (0.64 + fade * 0.7);
    context.beginPath();
    context.moveTo(tx, ty);
    context.lineTo(x, y);
    context.stroke();
  }
  context.restore();
}

function drawOrb() {
  updateAudioSpectrum();
  const canvas = els.canvas;
  const context = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = state.playbackPage
    ? Math.min(window.devicePixelRatio || 1, 1.25)
    : Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.clearRect(0, 0, width, height);

  if (state.playbackPage) {
    drawPlaybackParticles(context, rect, dpr, width, height);
    requestAnimationFrame(drawOrb);
    return;
  }

  updateOrbMotion();

  const now = performance.now();
  const t = now / 1000;
  const energy = Math.max(state.visual.energy, els.audio.paused ? 0.2 : 0.55);
  const bass = Math.max(state.visual.bass, els.audio.paused ? 0.16 : 0.46);
  const breath = state.orb.reducedMotion ? 0.62 : 0.52 + 0.48 * (0.5 + 0.5 * Math.sin(t * 1.68));
  const radiusCss = Math.min(rect.width, rect.height) * (0.31 + energy * 0.032 + breath * 0.018);
  const radius = radiusCss * dpr;
  const cx = (rect.width / 2) * dpr;
  const cy = (rect.height * 0.47) * dpr;
  const motionGlow = clamp(state.orb.trailBoost + Math.hypot(state.orb.velocityYaw, state.orb.velocityPitch) * 620, 0, 1.2);
  const autoTrail = state.orb.reducedMotion ? 0 : 0.08 + energy * 0.05;
  const trailAmount = Math.max(autoTrail, motionGlow);
  const trailYaw = clamp(state.orb.trailYaw || state.orb.velocityYaw * 54 || 0.035, -0.28, 0.28);
  const trailPitch = clamp(state.orb.trailPitch || state.orb.velocityPitch * 54 || 0.012, -0.22, 0.22);

  drawAmbientOrbStreaks(context, width, height, dpr, now);

  const drawable = state.particles.map((p) => {
    const yaw = state.orb.yaw + p.seed * 0.012;
    const point = rotatePoint(p, yaw, state.orb.pitch);
    const perspective = 1.32 / (1.32 - point.z * 0.36);
    const depth = (point.z + 1) / 2;
    const trailPoint = rotatePoint(p, yaw - trailYaw, state.orb.pitch - trailPitch);
    const trailPerspective = 1.32 / (1.32 - trailPoint.z * 0.36);
    const blueMix = clamp(0.34 + (1 - depth) * 0.18 + p.tint * 0.2 + Math.sin(t * 0.7 + p.phase) * 0.08, 0.26, 0.86);
    return {
      x: cx + point.x * radius * perspective,
      y: cy + point.y * radius * perspective,
      trailX: cx + trailPoint.x * radius * trailPerspective,
      trailY: cy + trailPoint.y * radius * trailPerspective,
      z: point.z,
      depth,
      seed: p.seed,
      blueMix,
      size: (p.size + bass * 0.55 + breath * 0.5) * perspective * dpr,
      alpha: Math.max(0.08, 0.13 + depth * 0.58 + breath * 0.13 + Math.sin(t * 1.4 + p.phase) * 0.05)
    };
  }).sort((a, b) => a.z - b.z);

  context.save();
  context.globalCompositeOperation = 'lighter';
  if (trailAmount > 0.06) {
    context.lineCap = 'round';
    for (const p of drawable) {
      if (p.depth < 0.16 || p.seed > 0.42) continue;
      const alpha = clamp((0.14 + p.depth * 0.3) * trailAmount, 0.04, 0.58);
      const gradient = context.createLinearGradient(p.trailX, p.trailY, p.x, p.y);
      gradient.addColorStop(0, 'rgba(12, 82, 255, 0)');
      gradient.addColorStop(0.52, `rgba(30, 142, 255, ${alpha * 0.58})`);
      gradient.addColorStop(1, `rgba(151, 231, 255, ${alpha})`);
      context.shadowBlur = (8 + p.depth * 18) * dpr * trailAmount;
      context.shadowColor = `rgba(47, 169, 255, ${alpha})`;
      context.strokeStyle = gradient;
      context.lineWidth = Math.max(0.85 * dpr, p.size * (0.42 + trailAmount * 0.34));
      context.beginPath();
      context.moveTo(p.trailX, p.trailY);
      context.lineTo(p.x, p.y);
      context.stroke();
    }
  }

  for (const p of drawable) {
    const alpha = Math.min(0.98, p.alpha);
    const blueAlpha = alpha * (0.26 + p.blueMix * 0.48);
    const glowSize = Math.max(0.8 * dpr, p.size * (1.72 + p.blueMix * 0.44));
    context.shadowBlur = (8 + p.depth * 13 + breath * 13 + trailAmount * 8) * dpr;
    context.shadowColor = `rgba(42, 172, 255, ${0.2 + p.depth * 0.22 + p.blueMix * 0.18})`;
    context.fillStyle = `rgba(55, 176, 255, ${blueAlpha})`;
    context.beginPath();
    context.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
    context.fill();

    context.shadowBlur = (3 + p.depth * 8 + breath * 7) * dpr;
    context.shadowColor = `rgba(226, 249, 255, ${0.18 + p.depth * 0.22})`;
    context.fillStyle = `rgba(246, 253, 255, ${alpha})`;
    context.beginPath();
    context.arc(p.x, p.y, Math.max(0.42 * dpr, p.size * 0.62), 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  requestAnimationFrame(drawOrb);
}

async function init() {
  initBootScreen();
  initGlassSurfaces();
  bindEvents();
  bindOrbEvents();
  initParticles();
  initPlaybackParticles();
  setDiyPreset('lyric');
  updateLyricDiyVars();
  resetPlaybackView();
  renderCurrent();
  els.audio.volume = Number(els.volumeRange.value) / 100;
  await Promise.allSettled([refreshPlayerState(), refreshVisualBridge(), refreshLoginStatus(), refreshUserPlaylists()]);
  window.setInterval(refreshVisualBridge, 1000);
  window.setInterval(() => refreshPlayerState().catch(() => {}), 5000);
  window.setInterval(refreshUserPlaylists, 30000);
  requestAnimationFrame(drawOrb);
}

init().catch((error) => toast(error.message));
