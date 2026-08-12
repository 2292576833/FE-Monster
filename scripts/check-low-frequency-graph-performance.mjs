import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

function extractFunction(name, required = true) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) {
    if (!required) return '';
    throw new Error(`Missing function: ${name}`);
  }
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
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

let layoutReads = 0;
let contextReads = 0;
let gradientCreates = 0;
let resizeObserverCount = 0;
let strokeCount = 0;
let drawCount = 0;
let now = 100;
const gradient = { addColorStop() {} };
const context2d = {
  beginPath() {},
  clearRect() {
    drawCount += 1;
  },
  createLinearGradient() {
    gradientCreates += 1;
    return gradient;
  },
  fillRect() {},
  lineTo() {},
  moveTo() {},
  stroke() {
    strokeCount += 1;
  },
  set fillStyle(_) {},
  set lineWidth(_) {},
  set shadowBlur(_) {},
  set shadowColor(_) {},
  set strokeStyle(_) {}
};
const canvas = {
  width: 202,
  height: 64,
  getBoundingClientRect() {
    layoutReads += 1;
    return { width: 202, height: 64 };
  },
  getContext() {
    contextReads += 1;
    return context2d;
  }
};
class FakeResizeObserver {
  constructor(callback) {
    this.callback = callback;
    resizeObserverCount += 1;
  }
  observe() {
    this.callback([{ contentRect: { width: 202, height: 64 } }]);
  }
}
const state = {
  audioAnalysis: { live: true },
  clientRuntime: { nativeAudioActive: false },
  visual: { lowFrequencyAmplitude: 0.5, bass: 0.5 },
  visualBridge: { lowFrequencyAmplitude: 0, bass: 0, source: '' },
  runtimeSettingsOpen: true,
  lowFrequencyGraph: {
    history: new Float32Array(96),
    cursor: 0,
    count: 96,
    lastValue: 0,
    lastDrawAt: 0,
    surface: null,
    resizeObserver: null
  }
};
const context = vm.createContext({
  els: {
    lowFrequencyGraph: canvas,
    lowFrequencyValue: { textContent: '' },
    spectrumBassFill: null,
    spectrumStatus: null
  },
  state,
  window: { devicePixelRatio: 1, ResizeObserver: FakeResizeObserver },
  ResizeObserver: FakeResizeObserver,
  Float32Array,
  Math,
  performance: { now: () => now },
  setStylePropertyIfChanged() {},
  clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }
});
vm.runInContext([
  extractFunction('ensureLowFrequencyGraphSurface', false),
  extractFunction('appendLowFrequencyGraphSample', false),
  extractFunction('readLowFrequencyGraphSample', false),
  extractFunction('drawLowFrequencyGraph'),
  extractFunction('updateSpectrumUi')
].filter(Boolean).join('\n'), context);

for (let frame = 0; frame < 240; frame += 1) {
  vm.runInContext(`drawLowFrequencyGraph(${frame} / 239)`, context);
}

strokeCount = 0;
drawCount = 0;
state.lowFrequencyGraph.lastDrawAt = 0;
for (let frame = 0; frame < 240; frame += 1) {
  now = 100 + frame * 4;
  state.visual.lowFrequencyAmplitude = frame / 239;
  vm.runInContext('updateSpectrumUi()', context);
}
const cadenceDraws = drawCount;

const checks = {
  cachedLayoutSize: layoutReads <= 1,
  cachedCanvasContext: contextReads <= 1,
  cachedBackgroundGradient: gradientCreates <= 1,
  oneResizeObserver: resizeObserverCount <= 1,
  fixedTypedHistory: state.lowFrequencyGraph.history instanceof Float32Array
    && state.lowFrequencyGraph.history.length === 96,
  boundedHistoryCursor: Number.isInteger(state.lowFrequencyGraph.cursor)
    && state.lowFrequencyGraph.cursor >= 0
    && state.lowFrequencyGraph.cursor < 96,
  settingsGraphKeepsBoundedCadence: cadenceDraws >= 10 && cadenceDraws <= 13
};
const result = {
  pass: Object.values(checks).every(Boolean),
  frames: 240,
  metrics: {
    layoutReads,
    contextReads,
    gradientCreates,
    resizeObserverCount,
    historyType: state.lowFrequencyGraph.history?.constructor?.name || '',
    historyLength: state.lowFrequencyGraph.history?.length || 0,
    cursor: state.lowFrequencyGraph.cursor,
    cadenceFrames: 240,
    cadenceElapsedMs: 956,
    cadenceDraws
  },
  checks
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
assert.equal(result.pass, true, 'Low-frequency graph hot path exceeded its CPU/allocation contract');
