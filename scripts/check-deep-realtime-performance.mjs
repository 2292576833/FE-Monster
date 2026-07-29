import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const skipNative = process.argv.includes('--skip-native');
const strictSpectrum = process.argv.includes('--strict-spectrum');
const startedAt = Date.now();
const tempRoot = mkdtempSync(path.join(tmpdir(), 'fe-monster-deep-perf-'));
const classes = path.join(tempRoot, 'classes');

const read = (...segments) => readFileSync(path.join(root, ...segments), 'utf8');
const app = read('web', 'app.js');
const nativeEngine = read('src', 'main', 'java', 'com', 'femonster', 'core', 'NativeAudioEngine.java');
const visualBridge = read('src', 'main', 'java', 'com', 'femonster', 'core', 'VisualBridgeService.java');
const playerService = read('src', 'main', 'java', 'com', 'femonster', 'core', 'PlayerService.java');
const simpleJson = read('src', 'main', 'java', 'com', 'femonster', 'json', 'SimpleJson.java');
const nativePipeline = read('native', 'windows', 'audio', 'fe_audio_pipeline.cpp');
const pcmWorklet = read('web', 'vendor', 'native-spatial', 'native-pcm-worklet.js');

function executable(name) {
  const javaHomes = [
    path.join(root, 'runtime', 'java'),
    'E:\\java26',
    'D:\\java26',
    'C:\\java26',
    process.env.FE_JAVA26_HOME,
    process.env.FE_JAVA_HOME,
    process.env.JAVA_HOME
  ].filter(Boolean);
  for (const home of javaHomes) {
    const candidate = path.join(home, 'bin', `${name}.exe`);
    if (existsSync(candidate)) return candidate;
  }
  return `${name}.exe`;
}

function functionBlock(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  if (!match) return '';
  const openingBrace = source.indexOf('{', match.index);
  if (openingBrace < 0) return '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, index + 1);
    }
  }
  return '';
}

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function javaSources(directory) {
  if (!existsSync(directory)) return [];
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...javaSources(candidate));
    else if (entry.isFile() && entry.name.endsWith('.java')) output.push(candidate);
  }
  return output;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout ?? 30_000,
    env: options.env ?? process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`${path.basename(command)} exited ${result.status}${detail ? `:\n${detail}` : ''}`);
  }
  return result.stdout.trim();
}

function runJsonScript(script) {
  const output = run(process.execPath, [path.join(root, 'scripts', script)]);
  const start = output.indexOf('{');
  if (start < 0) throw new Error(`${script} did not emit JSON.`);
  return JSON.parse(output.slice(start));
}

function parseLastJsonLine(output, label) {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].startsWith('{')) continue;
    try {
      return JSON.parse(lines[index]);
    } catch {
    }
  }
  throw new Error(`${label} did not emit a single-line JSON result: ${output}`);
}

function latestNativeDll() {
  const explicit = process.env.FE_MONSTER_XAUDIO2_DLL;
  if (explicit && existsSync(explicit)) return path.resolve(explicit);
  const windowsRoot = path.join(root, 'native', 'windows');
  const candidates = [];
  for (const entry of readdirSync(windowsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('.cmake-build-')) continue;
    const candidate = path.join(windowsRoot, entry.name, 'runtime', 'fe-monster-xaudio2.dll');
    if (existsSync(candidate)) candidates.push(candidate);
  }
  const installed = path.join(windowsRoot, 'build', 'fe-monster-xaudio2.dll');
  if (existsSync(installed)) candidates.push(installed);
  return candidates.sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0] || '';
}

const lyricFunctions = [
  'syncPlaybackLyricAnimationFrame',
  'syncPlaybackLyricAtTime',
  'updatePlaybackLyricAtTime',
  'findLyricIndexAtTime',
  'lyricProgressForLineAtTime'
];
const allocationPatterns = {
  arrayTransforms: /\.(?:map|filter|flatMap|sort|slice)\s*\(/g,
  arrayCopies: /\bArray\.from\s*\(/g,
  typedArrays: /\bnew\s+(?:Float32Array|Float64Array|Uint8Array|Uint16Array|Uint32Array)\s*\(/g,
  collections: /\bnew\s+(?:Array|Map|Set|WeakMap|WeakSet)\s*\(/g,
  objectSpread: /\{\s*\.\.\./g
};
const jsFunctions = Object.fromEntries(lyricFunctions.map((name) => [name, functionBlock(app, name)]));
const jsAllocationSites = Object.fromEntries(Object.entries(jsFunctions).map(([name, source]) => [
  name,
  Object.fromEntries(Object.entries(allocationPatterns).map(([kind, pattern]) => [kind, count(source, pattern)]))
]));
const jsSteadyAllocationSiteCount = Object.values(jsAllocationSites)
  .flatMap((sites) => Object.values(sites))
  .reduce((sum, value) => sum + value, 0);
const workletTransportFrames = Number(
  /FE_NATIVE_PCM_TRANSPORT_FRAMES\s*=\s*(\d+)/.exec(pcmWorklet)?.[1] || 0
);
const worklet = {
  transportFrames: workletTransportFrames,
  typedArrayAllocationsInSource: count(pcmWorklet, /new\s+Float32Array\s*\(/g),
  transfersCompletedBuffer: /\[block\.buffer\]/.test(pcmWorklet),
  estimatedTransportArraysPerSecond: workletTransportFrames > 0
    ? Number((48_000 / workletTransportFrames).toFixed(3))
    : null
};

const visualBridgeBoxesBands = /List<Double>\s+bands\s*=\s*new\s+ArrayList<>\(LOW_FREQUENCY_BAND_COUNT\)/.test(visualBridge)
  && /bands\.add\(clamp01\(band\)\)/.test(visualBridge);
const spectrum = {
  bandCount: Number(/LOW_FREQUENCY_BAND_COUNT\s*=\s*(\d+)/.exec(nativeEngine)?.[1] || 0),
  nativePrimitiveArray: /private\s+static\s+float\[\]\s+lowFrequencyBands/.test(nativeEngine),
  nativeBoxedFloatListSites: count(nativeEngine, /List<Float>/g),
  jsonWritesPrimitiveFloatArray: /value\s+instanceof\s+float\[\]\s+array/.test(simpleJson),
  visualBridgeBoxesBands,
  estimatedBoxedNumbersPerVisualSample: visualBridgeBoxesBands ? 512 : 0
};

const persistence = {
  debounceMs: Number(/SAVE_DEBOUNCE_MILLIS\s*=\s*(\d+)/.exec(playerService)?.[1] || 0),
  cancelsPreviousWrite: /pendingSave\s*\.\s*cancel\(false\)/.test(playerService),
  usesSingleWriter: /Executors\.newSingleThreadScheduledExecutor/.test(playerService),
  flushesLatestRevision: /flushInternal\(false\)/.test(playerService)
    && /flushInternal\(true\)/.test(playerService),
  atomicReplace: /StandardCopyOption\.ATOMIC_MOVE/.test(playerService)
};
const nativeStatic = {
  transportFrames: Number(/kFramesPerTransportBatch\s*=\s*(\d+)/.exec(nativePipeline)?.[1] || 0),
  renderFrames: Number(/kFramesPerRenderBlock\s*=\s*(\d+)/.exec(nativePipeline)?.[1] || 0),
  prerollBuffers: Number(/kPrerollQueuedBuffers\s*=\s*(\d+)/.exec(nativePipeline)?.[1] || 0),
  recordsQueueUnderruns: /queue_underruns_\.fetch_add\(1\)/.test(nativePipeline),
  recordsPoolExhaustions: /buffer_pool_exhaustions_\.fetch_add\(1\)/.test(nativePipeline)
};

let report;
try {
  const quickContract = runJsonScript('check-realtime-performance-contract.mjs');
  const audioStaticContract = runJsonScript('check-audio-realtime-performance.mjs');
  const mainSources = [
    ...javaSources(path.join(root, 'src', 'main', 'java')),
    ...javaSources(path.join(root, 'src', 'community-proprietary', 'java'))
  ];
  const probes = [
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'json', 'SimpleJsonPrimitiveArrayProbe.java'),
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'core', 'PlayerServicePersistenceProbe.java'),
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'core', 'VisualBridgeSpectrumProbe.java'),
    path.join(root, 'scripts', 'java', 'RealtimeAudioPerformanceProbe.java')
  ];
  run(executable('javac'), [
    '-encoding',
    'UTF-8',
    '--release',
    '17',
    '-d',
    classes,
    ...mainSources,
    ...probes
  ], { timeout: 60_000 });

  const simpleJsonProbe = run(
    executable('java'),
    ['-cp', classes, 'com.femonster.json.SimpleJsonPrimitiveArrayProbe']
  );
  const persistenceProbe = run(
    executable('java'),
    ['-cp', classes, 'com.femonster.core.PlayerServicePersistenceProbe'],
    { timeout: 10_000 }
  );
  const spectrumProbe = run(
    executable('java'),
    ['-cp', classes, 'com.femonster.core.VisualBridgeSpectrumProbe']
  );

  let nativeStress = { skipped: true, reason: 'disabled by --skip-native' };
  if (!skipNative && process.platform === 'win32') {
    const dll = latestNativeDll();
    if (!dll) throw new Error('No fe-monster-xaudio2.dll was found for the native stress probe.');
    const nativeOutput = run(
      executable('java'),
      [
        '--enable-native-access=ALL-UNNAMED',
        '-cp',
        classes,
        'com.femonster.core.RealtimeAudioPerformanceProbe'
      ],
      {
        timeout: 15_000,
        env: {
          ...process.env,
          FE_MONSTER_ROOT: root,
          FE_MONSTER_XAUDIO2_DLL: dll
        }
      }
    );
    nativeStress = { ...parseLastJsonLine(nativeOutput, 'native stress probe'), dll };
  } else if (!skipNative) {
    nativeStress = { skipped: true, reason: `native XAudio2 probe requires Windows (current: ${process.platform})` };
  }

  const checks = {
    quickContract: quickContract.pass === true,
    audioStaticContract: audioStaticContract.pass === true,
    jsLyricFunctionsFound: Object.values(jsFunctions).every(Boolean),
    jsSteadyHotPathsHaveNoTrackedAllocations: jsSteadyAllocationSiteCount === 0,
    audioWorkletAllocatesOnlyAtTransportBoundary: worklet.transportFrames === 4096
      && worklet.typedArrayAllocationsInSource === 2
      && worklet.transfersCompletedBuffer,
    spectrumUses512PrimitiveBands: spectrum.bandCount === 512
      && spectrum.nativePrimitiveArray
      && spectrum.nativeBoxedFloatListSites === 0
      && spectrum.jsonWritesPrimitiveFloatArray,
    spectrumAvoidsVisualBridgeBoxing: !spectrum.visualBridgeBoxesBands,
    persistenceDebouncesAndFlushes: persistence.debounceMs >= 100
      && persistence.debounceMs <= 500
      && persistence.cancelsPreviousWrite
      && persistence.usesSingleWriter
      && persistence.flushesLatestRevision
      && persistence.atomicReplace,
    simpleJsonRuntimeProbe: /passed/.test(simpleJsonProbe),
    visualBridgeSpectrumRuntimeProbe: /nativeSameReference=true, boxedBands=0/.test(spectrumProbe),
    persistenceRuntimeProbe: /passed/.test(persistenceProbe),
    nativeStaticPrerollAndMetrics: nativeStatic.transportFrames === 4096
      && nativeStatic.renderFrames === 256
      && nativeStatic.prerollBuffers === 24
      && nativeStatic.recordsQueueUnderruns
      && nativeStatic.recordsPoolExhaustions,
    nativeStressProbe: nativeStress.skipped === true || nativeStress.pass === true
  };
  const advisoryChecks = new Set(['spectrumAvoidsVisualBridgeBoxing']);
  const failures = Object.entries(checks)
    .filter(([name, passed]) => !passed && (strictSpectrum || !advisoryChecks.has(name)))
    .map(([name]) => name);
  const advisories = Object.entries(checks)
    .filter(([name, passed]) => !passed && advisoryChecks.has(name))
    .map(([name]) => name);

  report = {
    pass: failures.length === 0,
    strictSpectrum,
    elapsedMs: Date.now() - startedAt,
    checks,
    metrics: {
      js: {
        trackedSteadyAllocationSites: jsSteadyAllocationSiteCount,
        functions: jsAllocationSites,
        audioWorklet: worklet
      },
      spectrum,
      persistence,
      nativeStatic,
      nativeStress
    },
    advisories,
    failures
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (failures.length) process.exitCode = 1;
} catch (error) {
  report = {
    pass: false,
    elapsedMs: Date.now() - startedAt,
    error: error instanceof Error ? error.message : String(error)
  };
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  const resolvedTemp = path.resolve(tempRoot);
  const resolvedSystemTemp = path.resolve(tmpdir());
  if (resolvedTemp.startsWith(`${resolvedSystemTemp}${path.sep}`)) {
    rmSync(resolvedTemp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
