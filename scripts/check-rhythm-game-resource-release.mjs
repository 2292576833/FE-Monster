import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../web/rhythm-game.js', import.meta.url), 'utf8');

function extractFunction(name, required = true) {
  const marker = `function ${name}(`;
  let start = source.indexOf(marker);
  if (start < 0) {
    if (!required) return '';
    throw new Error(`Missing function: ${name}`);
  }
  if (source.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
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
    else if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated function: ${name}`);
}

const releaseSource = extractFunction('releaseRhythmGameTrackResources', false);
assert.ok(releaseSource, 'Rhythm game must expose one complete track-resource release seam');

let revokedUrl = '';
let contextClosed = false;
let audioPaused = false;
let audioLoaded = false;
const game = {
  analysisToken: 4,
  audioBuffer: { length: 441000, numberOfChannels: 2 },
  audioContext: {
    state: 'running',
    close() {
      contextClosed = true;
      this.state = 'closed';
      return Promise.resolve();
    }
  },
  sourceUrl: 'blob:qa-track',
  objectUrl: 'blob:qa-track',
  trackName: 'QA track',
  chart: { beats: new Array(120), points: new Array(121) },
  judgements: new Array(120),
  pathGrades: new Array(120),
  pathStep: 42,
  stats: { score: 1000 },
  pulses: new Array(32)
};
const audio = {
  src: 'blob:qa-track',
  currentTime: 12,
  pause() { audioPaused = true; },
  removeAttribute(name) { if (name === 'src') this.src = ''; },
  load() { audioLoaded = true; }
};
const context = vm.createContext({
  game,
  els: { audio },
  URL: { revokeObjectURL(url) { revokedUrl = url; } },
  Promise
});
vm.runInContext([
  extractFunction('releaseObjectUrl'),
  releaseSource,
  'this.releaseTrackResources = releaseRhythmGameTrackResources;'
].join('\n'), context);
context.releaseTrackResources();
await Promise.resolve();

const checks = {
  invalidatesAnalysis: game.analysisToken === 5,
  releasesDecodedPcm: game.audioBuffer === null,
  releasesChart: game.chart === null && game.judgements.length === 0 && game.pathGrades.length === 0,
  releasesTransientState: game.stats === null && game.pulses.length === 0 && game.pathStep === 0,
  revokesObjectUrl: revokedUrl === 'blob:qa-track' && game.objectUrl === '',
  clearsMediaSource: audioPaused && audioLoaded && audio.src === '' && game.sourceUrl === '',
  closesAudioContext: contextClosed && game.audioContext === null
};
const result = { pass: Object.values(checks).every(Boolean), checks };
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
assert.equal(result.pass, true, 'Rhythm game close must release decoded audio and all owned resources');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createTrackLifecycleHarness(options = {}) {
  const fileRead = options.fileRead || deferred();
  const fetchRead = options.fetchRead || deferred();
  const decoded = {
    length: 220500,
    numberOfChannels: 2,
    duration: 5,
    sampleRate: 44100
  };
  const runtimeGame = {
    active: true,
    mode: 'setup',
    difficulty: 'normal',
    analysisToken: 0,
    analysisRequestAbortController: null,
    audioBuffer: null,
    audioContext: null,
    sourceUrl: '',
    objectUrl: '',
    trackName: '',
    chart: null,
    judgements: [],
    pathGrades: [],
    pathStep: 0,
    stats: null,
    resultStatus: '',
    lastInputAt: Number.NEGATIVE_INFINITY,
    pulses: []
  };
  const runtimeAudio = {
    src: '',
    currentSrc: '',
    currentTime: 0,
    pause() {},
    removeAttribute(name) {
      if (name === 'src') {
        this.src = '';
        this.currentSrc = '';
      }
    },
    load() {}
  };
  const mainAudio = { currentSrc: 'https://qa.invalid/current.mp3', src: '' };
  let createdObjectUrl = 0;
  let capturedFetchSignal = null;
  const runtimeContext = vm.createContext({
    AbortController,
    ArrayBuffer,
    Promise,
    URL: {
      createObjectURL() {
        createdObjectUrl += 1;
        return `blob:pending-${createdObjectUrl}`;
      },
      revokeObjectURL() {}
    },
    fetch(_url, requestOptions = {}) {
      capturedFetchSignal = requestOptions?.signal || null;
      return fetchRead.promise;
    },
    game: runtimeGame,
    els: {
      audio: runtimeAudio,
      mainAudio,
      dockTitle: { textContent: 'Pending QA track' },
      analysis: { textContent: '', classList: { toggle() {} } },
      trackName: { textContent: '' },
      trackMeta: { textContent: '' }
    },
    difficultySettings: {
      normal: { label: 'standard' }
    },
    setMode(mode) {
      runtimeGame.mode = mode;
    },
    setAnalysis() {},
    resetStats() {},
    analyzeAudioBuffer: async () => ({
      bpm: 120,
      beats: [{ time: 1 }],
      points: [{ x: 0, y: 0 }, { x: 1, y: 0 }]
    }),
    audioContextReady: async () => {
      if (!runtimeGame.audioContext) {
        runtimeGame.audioContext = {
          state: 'running',
          decodeAudioData: async () => decoded,
          close() {
            this.state = 'closed';
            return Promise.resolve();
          }
        };
      }
      return runtimeGame.audioContext;
    }
  });
  runtimeContext.global = runtimeContext;
  vm.runInContext([
    extractFunction('releaseObjectUrl'),
    extractFunction('releaseRhythmGameTrackResources'),
    extractFunction('decodeAndBuild'),
    extractFunction('chooseLocalFile'),
    extractFunction('useCurrentSong'),
    'this.releaseTrackResources = releaseRhythmGameTrackResources;',
    'this.choosePendingFile = chooseLocalFile;',
    'this.usePendingCurrentSong = useCurrentSong;'
  ].join('\n'), runtimeContext);
  return {
    context: runtimeContext,
    game: runtimeGame,
    fileRead,
    fetchRead,
    decoded,
    capturedFetchSignal: () => capturedFetchSignal
  };
}

async function checkPendingFileCloseDoesNotReviveTrack() {
  const harness = createTrackLifecycleHarness();
  const pending = harness.context.choosePendingFile({
    name: 'pending.wav',
    type: 'audio/wav',
    arrayBuffer: () => harness.fileRead.promise
  });
  await Promise.resolve();
  harness.game.active = false;
  harness.context.releaseTrackResources();
  harness.fileRead.resolve(new ArrayBuffer(16));
  await pending;
  return harness.game.audioBuffer === null
    && harness.game.chart === null
    && harness.game.audioContext === null
    && harness.game.sourceUrl === '';
}

async function checkPendingFetchCloseDoesNotReviveTrack() {
  const harness = createTrackLifecycleHarness();
  const pending = harness.context.usePendingCurrentSong();
  await Promise.resolve();
  harness.game.active = false;
  harness.context.releaseTrackResources();
  const signalWasAborted = harness.capturedFetchSignal()?.aborted === true;
  harness.fetchRead.resolve({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(16)
  });
  await pending;
  return signalWasAborted
    && harness.game.audioBuffer === null
    && harness.game.chart === null
    && harness.game.audioContext === null
    && harness.game.sourceUrl === '';
}

async function checkActiveFileStillBuildsTrack() {
  const harness = createTrackLifecycleHarness();
  const pending = harness.context.choosePendingFile({
    name: 'active.wav',
    type: 'audio/wav',
    arrayBuffer: () => harness.fileRead.promise
  });
  harness.fileRead.resolve(new ArrayBuffer(16));
  await pending;
  const passed = harness.game.audioBuffer === harness.decoded
    && harness.game.chart?.beats?.length === 1
    && harness.game.sourceUrl === 'blob:pending-1';
  harness.game.active = false;
  harness.context.releaseTrackResources();
  return passed;
}

async function checkActiveFetchStillBuildsTrack() {
  const harness = createTrackLifecycleHarness();
  const pending = harness.context.usePendingCurrentSong();
  harness.fetchRead.resolve({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(16)
  });
  await pending;
  const passed = harness.capturedFetchSignal()?.aborted === false
    && harness.game.audioBuffer === harness.decoded
    && harness.game.chart?.beats?.length === 1
    && harness.game.sourceUrl === 'https://qa.invalid/current.mp3';
  harness.game.active = false;
  harness.context.releaseTrackResources();
  return passed;
}

async function checkPendingWallpaperCloseDoesNotReviveMedia() {
  const wallpaperFetch = deferred();
  const wallpaperGame = {
    active: true,
    wallpaperRequestToken: 0,
    wallpaperRequestAbortController: null
  };
  const video = {
    paused: true,
    dataset: {},
    classList: { add() {}, remove() {} },
    getAttribute() { return ''; },
    pause() {},
    removeAttribute() {},
    load() {}
  };
  const image = {
    classList: { add() {}, remove() {} },
    getAttribute() { return ''; },
    removeAttribute() {}
  };
  let appliedWallpaper = null;
  let capturedSignal = null;
  const wallpaperContext = vm.createContext({
    AbortController,
    Promise,
    game: wallpaperGame,
    clamp(value, minimum, maximum) {
      return Math.min(maximum, Math.max(minimum, Number(value) || 0));
    },
    global: null,
    window: { FeWallpaperVideoContinuity: { release() {} } },
    els: {
      scene: { style: { setProperty() {} } },
      wallpaperVideo: video,
      wallpaperImage: image,
      backgroundVideo: video,
      backgroundImage: image
    },
    fetch(_url, requestOptions = {}) {
      capturedSignal = requestOptions?.signal || null;
      return wallpaperFetch.promise;
    },
    setBackgroundMedia(wallpaper) {
      appliedWallpaper = wallpaper;
    },
    localStorage: {
      getItem() {
        return JSON.stringify({ source: 'imported' });
      }
    }
  });
  wallpaperContext.global = wallpaperContext;
  vm.runInContext([
    extractFunction('releaseBackgroundMedia'),
    extractFunction('syncWallpaperBackground'),
    'this.releaseWallpaper = releaseBackgroundMedia;',
    'this.syncWallpaper = syncWallpaperBackground;'
  ].join('\n'), wallpaperContext);
  const pending = wallpaperContext.syncWallpaper();
  await Promise.resolve();
  wallpaperGame.active = false;
  wallpaperContext.releaseWallpaper();
  const signalWasAborted = capturedSignal?.aborted === true;
  wallpaperFetch.resolve({
    ok: true,
    json: async () => ({
      wallpapers: [{ id: 'qa-wallpaper', source: 'imported', kind: 'video', url: '/qa.mp4' }]
    })
  });
  await pending;
  return signalWasAborted && appliedWallpaper === null;
}

const pendingLifecycleChecks = {
  activeFileStillBuildsTrack: await checkActiveFileStillBuildsTrack(),
  activeFetchStillBuildsTrack: await checkActiveFetchStillBuildsTrack(),
  pendingFileCloseDoesNotReviveTrack: await checkPendingFileCloseDoesNotReviveTrack(),
  pendingFetchCloseDoesNotReviveTrack: await checkPendingFetchCloseDoesNotReviveTrack(),
  pendingWallpaperCloseDoesNotReviveMedia: await checkPendingWallpaperCloseDoesNotReviveMedia()
};
process.stdout.write(`${JSON.stringify({
  pass: Object.values(pendingLifecycleChecks).every(Boolean),
  checks: pendingLifecycleChecks
}, null, 2)}\n`);
assert.equal(
  Object.values(pendingLifecycleChecks).every(Boolean),
  true,
  'Closing the rhythm game must prevent pending file, fetch, and wallpaper work from reviving resources'
);
