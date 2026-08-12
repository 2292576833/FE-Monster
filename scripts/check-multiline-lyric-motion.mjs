import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '..');
const webRoot = path.join(workspaceRoot, 'web');
const appSource = fs.readFileSync(path.join(webRoot, 'app.js'), 'utf8');
const cssSource = fs.readFileSync(path.join(webRoot, 'styles.css'), 'utf8');

function cssRules(source) {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1].trim(),
    body: match[2]
  }));
}

function matchingBrace(source, openBrace) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openBrace; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function declaredFunctions(source) {
  const functions = [];
  const pattern = /(?:^|\n)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  for (const match of source.matchAll(pattern)) {
    const openParen = source.indexOf('(', match.index);
    let depth = 0;
    let closeParen = -1;
    let quote = '';
    let escaped = false;
    for (let index = openParen; index < source.length; index += 1) {
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
      if (character === '(') depth += 1;
      if (character === ')') {
        depth -= 1;
        if (depth === 0) {
          closeParen = index;
          break;
        }
      }
    }
    assert.ok(closeParen > openParen, `could not parse parameters for ${match[1]}()`);
    const openBrace = source.indexOf('{', closeParen + 1);
    const closeBrace = matchingBrace(source, openBrace);
    assert.ok(closeBrace > openBrace, `could not parse ${match[1]}()`);
    functions.push({
      name: match[1],
      source: source.slice(match.index, closeBrace + 1)
    });
  }
  return functions;
}

class MockStyle {
  constructor() {
    this.values = new Map();
    this.writeCount = 0;
    this.transition = '';
    this.transform = '';
    this.opacity = '';
    this.position = '';
  }

  setProperty(name, value) {
    this.writeCount += 1;
    this.values.set(name, String(value));
  }

  getPropertyValue(name) {
    return this.values.get(name) || '';
  }

  removeProperty(name) {
    const previous = this.getPropertyValue(name);
    this.values.delete(name);
    return previous;
  }
}

class MockClassList {
  constructor() {
    this.names = new Set();
  }

  add(...names) {
    names.forEach((name) => this.names.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.names.delete(name));
  }

  contains(name) {
    return this.names.has(name);
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.names.has(name) : !!force;
    if (enabled) this.names.add(name);
    else this.names.delete(name);
    return enabled;
  }

  replaceFromString(value) {
    this.names = new Set(String(value).split(/\s+/).filter(Boolean));
  }
}

class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.dataset = {};
    this.style = new MockStyle();
    this.classList = new MockClassList();
    this.children = [];
    this.parentElement = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = '';
    this._lastLayoutTop = 0;
  }

  set className(value) {
    this.classList.replaceFromString(value);
  }

  get className() {
    return [...this.classList.names].join(' ');
  }

  get isConnected() {
    return this.parentElement !== null;
  }

  get childNodes() {
    if (this.children.length) return this.children;
    if (!this.textContent) return [];
    if (!this.__mockTextNode || this.__mockTextNode.textContent !== this.textContent) {
      this.__mockTextNode = {
        nodeType: 3,
        textContent: this.textContent,
        __ownerElement: this
      };
    }
    return [this.__mockTextNode];
  }

  get offsetHeight() {
    return Math.max(1, this.children.length * 48);
  }

  appendChild(child) {
    if (child.parentElement) {
      const previousIndex = child.parentElement.children.indexOf(child);
      if (previousIndex >= 0) child.parentElement.children.splice(previousIndex, 1);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  insertBefore(child, reference) {
    if (child.parentElement) {
      const previousIndex = child.parentElement.children.indexOf(child);
      if (previousIndex >= 0) child.parentElement.children.splice(previousIndex, 1);
    }
    child.parentElement = this;
    const index = this.children.indexOf(reference);
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
    return child;
  }

  remove() {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, listener, options = {}) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push({ listener, once: options?.once === true });
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((entry) => entry.listener !== listener));
  }

  listenerCount(type) {
    return (this.listeners.get(type) || []).length;
  }

  dispatchEvent(event) {
    const entries = [...(this.listeners.get(event.type) || [])];
    const dispatched = { ...event, target: event.target || this, currentTarget: this };
    entries.forEach((entry) => {
      entry.listener(dispatched);
      if (entry.once) this.removeEventListener(event.type, entry.listener);
    });
    return true;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const normalized = String(selector).trim();
    return this.descendants().filter((element) => element.matches(normalized));
  }

  descendants() {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }

  matches(selector) {
    const notClasses = [...selector.matchAll(/:not\(\.([\w-]+)\)/g)].map((match) => match[1]);
    if (notClasses.some((name) => this.classList.contains(name))) return false;
    const withoutNot = selector.replace(/:not\([^)]*\)/g, '');
    const tagName = withoutNot.match(/^[a-z][\w-]*/i)?.[0];
    if (tagName && this.tagName !== tagName.toUpperCase()) return false;
    for (const match of withoutNot.matchAll(/\.([\w-]+)/g)) {
      if (!this.classList.contains(match[1])) return false;
    }
    for (const match of withoutNot.matchAll(/\[data-([\w-]+)(?:="([^"]*)")?\]/g)) {
      const property = match[1].replace(/-([a-z])/g, (_whole, letter) => letter.toUpperCase());
      if (!(property in this.dataset)) return false;
      if (match[2] !== undefined && this.dataset[property] !== match[2]) return false;
    }
    return true;
  }

  getBoundingClientRect() {
    if (this.mockBoundingRect) return this.mockBoundingRect;
    if (this.parentElement?.classList.contains('multi-row-lyric-list')) {
      const slot = Number.parseInt(
        this.style.getPropertyValue('--multi-row-slot'),
        10
      );
      if (Number.isFinite(slot) && !this.classList.contains('is-leaving')) {
        this._lastLayoutTop = (slot - 1) * 48;
      }
      return {
        x: 0,
        y: this._lastLayoutTop,
        top: this._lastLayoutTop,
        left: 0,
        right: 800,
        bottom: this._lastLayoutTop + 40,
        width: 800,
        height: 40
      };
    }
    return this.parentElement?.getBoundingClientRect() || {
      x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 40, width: 800, height: 40
    };
  }
}

function createAnimationScheduler() {
  let nextId = 1;
  const frames = new Map();
  const timers = new Map();
  return {
    requestAnimationFrame(callback) {
      const id = nextId;
      nextId += 1;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      frames.delete(id);
    },
    setTimeout(callback, delay = 0) {
      const id = nextId;
      nextId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    runFrame(timestamp = 16.67) {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(timestamp));
      return pending.length;
    },
    get frameCount() {
      return frames.size;
    },
    get timerDelays() {
      return [...timers.values()].map((timer) => timer.delay);
    }
  };
}

function multiRowRuntime(options = {}) {
  const start = appSource.indexOf('function normalizeMultiLyricEventText(');
  const end = appSource.indexOf('function setMultiRowLyricsEnabled(', start);
  assert.ok(start >= 0 && end > start, 'multi-row lyric renderer section is missing');
  const rendererSource = appSource.slice(start, end);
  const numericConstants = [...appSource.matchAll(
    /^const\s+(MULTI_ROW_[A-Z0-9_]+)\s*=\s*([0-9.]+)\s*;/gm
  )].map((match) => match[0]).join('\n');
  const scheduler = createAnimationScheduler();
  let rangeReadCount = 0;
  const list = new MockElement();
  list.className = 'multi-row-lyric-list';
  const lineTotal = Number(options.lineTotal) || 15;
  const state = {
    lyricLines: Array.from({ length: lineTotal }, (_, index) => ({
      time: index * 2,
      text: `Lyric ${index}`,
      translationText: `Translation ${index}`
    })),
    lyricIndex: Number.isFinite(options.active) ? options.active : 0,
    lyricSignature: 'smooth-lyric-motion',
    bilingualLyricsEnabled: options.bilingual === true,
    multiRowLyricsEnabled: true,
    multiRowLyricSignature: '',
    lyricProgressPercent: 0,
    textComposerSettings: {
      multiRowLineCount: Number(options.lineCount) || 5,
      flowIntensity: Number.isFinite(options.flowIntensity) ? options.flowIntensity : 24
    }
  };
  const document = {
    createElement(tagName) {
      return new MockElement(tagName);
    },
    createRange() {
      let target = null;
      let startNode = null;
      let startOffset = 0;
      let endOffset = 0;
      return {
        selectNodeContents(element) {
          target = element;
          startNode = null;
        },
        setStart(node, offset) {
          startNode = node;
          startOffset = offset;
        },
        setEnd(_node, offset) {
          endOffset = offset;
        },
        getClientRects() {
          rangeReadCount += 1;
          if (startNode?.__ownerElement?.mockGraphemeRects) {
            return startNode.__ownerElement.mockGraphemeRects
              .slice(startOffset, Math.max(startOffset + 1, endOffset));
          }
          const measured = target?.__ownerElement || target;
          return measured?.mockClientRects || [measured?.getBoundingClientRect()].filter(Boolean);
        },
        detach() {}
      };
    }
  };
  const window = {
    requestAnimationFrame: scheduler.requestAnimationFrame,
    cancelAnimationFrame: scheduler.cancelAnimationFrame,
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    getComputedStyle(element) {
      return {
        opacity: element.classList.contains('is-leaving') ? '0' : '1',
        transitionDuration: '320ms',
        transitionProperty: 'opacity, transform'
      };
    }
  };
  const context = vm.createContext({
    console,
    document,
    window,
    performance: { now: () => 0 },
    state,
    els: { multiRowLyricList: list },
    reducedMotion: options.reducedMotion === true,
    clamp: (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value)),
    safeText: (value, fallback = '') => String(value || fallback || ''),
    playbackLyricText: () => 'Waiting',
    playbackLyricSubtitle: () => '',
    playbackLyricTranslationText: (line) => {
      const translation = String(line?.translationText || '').trim();
      const original = String(line?.text || '').trim();
      return translation && translation !== original ? translation : '';
    },
    playbackDurationForLyricSpeed: () => lineTotal * 2,
    currentPlaybackLyricTime: () => (
      Math.max(0, Number(state.lyricIndex) || 0) * 2
        + Math.max(0, Number(state.lyricProgressPercent) || 0) / 50
    ),
    effectivePlaybackLyricTime: (currentTime, visualLead = 0) => (
      Math.max(0, (Number(currentTime) || 0) + (Number(visualLead) || 0))
    ),
    playbackLyricVisualLeadSeconds: () => 0,
    lyricTimelineTime: (time) => Number(time) || 0,
    lyricProgressForLineAtTime: (line, time, endTime) => {
      const startTime = Number(line?.time) || 0;
      return Math.min(1, Math.max(0, ((Number(time) || 0) - startTime) / Math.max(0.001, endTime - startTime)));
    },
    syncGlitchTextElement() {},
    glitchTextEffectActive: () => false,
    animateLyricGeometryFlip: () => null,
    syncMultiRowLyricsControl() {},
    textLyricsEnabled: () => true,
    normalizeTextComposerSettings: (settings) => ({
      ...settings,
      multiRowLineCount: Number(settings?.multiRowLineCount) || 5
    }),
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    requestAnimationFrame: scheduler.requestAnimationFrame,
    cancelAnimationFrame: scheduler.cancelAnimationFrame
  });
  vm.runInContext(`
${numericConstants}
${rendererSource}
globalThis.multiRowContract = { renderMultiRowLyrics };
`, context, { filename: 'web/app.js#multi-row-lyric-runtime' });
  return {
    render: context.multiRowContract.renderMultiRowLyrics,
    setSequentialHighlight: context.setSequentialLyricHighlight,
    invalidateSequentialHighlight: context.invalidateSequentialLyricHighlight,
    segmentHighlightGraphemes: context.lyricHighlightGraphemes,
    rangeReadCount: () => rangeReadCount,
    state,
    list,
    scheduler,
    source: rendererSource
  };
}

function rowAt(list, index) {
  return list.children.find(
    (row) => Number(row.dataset.multiRowLyricIndex) === index
      && !row.classList.contains('is-leaving')
  ) || null;
}

function visibleLyricRows(list) {
  return list.children.filter((row) => !row.classList.contains('is-leaving'));
}

function visibleLyricIndices(list) {
  return visibleLyricRows(list).map((row) => Number(row.dataset.multiRowLyricIndex));
}

function flipOffset(row) {
  const customProperty = Number.parseFloat(
    row.style.getPropertyValue('--multi-row-flip-y')
  );
  if (Number.isFinite(customProperty)) return customProperty;
  const transform = String(row.style.transform || '');
  const match = transform.match(/translateY\(\s*(-?[0-9.]+)px/);
  return match ? Number(match[1]) : 0;
}

function finishLeaving(row) {
  row.dispatchEvent({ type: 'transitionend', propertyName: 'transform' });
  if (row.isConnected) {
    row.dispatchEvent({ type: 'transitionend', propertyName: 'opacity' });
  }
}

const checks = [];
function check(name, callback) {
  try {
    callback();
    checks.push({ name, pass: true });
  } catch (error) {
    checks.push({ name, pass: false, error: error.message });
  }
}

check('leaving lyric CSS shrinks and fades smoothly', () => {
  const relevantRules = cssRules(cssSource).filter((rule) => (
    rule.selector.includes('.multi-row-lyric-line')
      && !rule.selector.includes('text-glitch')
  ));
  const leavingRules = relevantRules.filter((rule) => (
    rule.selector.includes('.multi-row-lyric-line.is-leaving')
  ));
  assert.ok(leavingRules.length > 0, 'missing .multi-row-lyric-line.is-leaving rule');
  const leavingBody = leavingRules.map((rule) => rule.body).join('\n');
  assert.match(leavingBody, /opacity\s*:\s*0(?:\D|$)/, 'leaving lyric must fade to opacity 0');
  assert.match(
    leavingBody,
    /(?:scale(?:3d)?\(\s*0?\.[0-9]+|scale\s*:\s*0?\.[0-9]+)/,
    'leaving lyric must shrink below scale 1'
  );
  const motionCss = relevantRules.map((rule) => rule.body).join('\n');
  assert.match(motionCss, /transition\s*:[^;]*(?:opacity|transform)/s);
  assert.match(motionCss, /transition\s*:[^;]*(?:transform|opacity)/s);
  assert.doesNotMatch(motionCss, /steps\s*\(/i, 'multi-row motion must not use stepped easing');
});

check('multi-row lyric stage has no whole-block glow', () => {
  assert.match(
    cssSource,
    /\.multi-row-lyric-stage::before,\s*\.multi-row-lyric-stage::after\s*\{[^}]*content:\s*none\s*!important;[^}]*box-shadow:\s*none\s*!important;[^}]*filter:\s*none\s*!important;/s,
    'multi-row stage pseudo-element glow must be disabled'
  );
  assert.match(
    cssSource,
    /\.multi-row-lyric-stage,\s*\.playback-lyric-scene\.is-multi-row-text \.multi-row-lyric-stage\s*\{[^}]*box-shadow:\s*none\s*!important;[^}]*filter:\s*none\s*!important;/s,
    'multi-row stage must not retain a block shadow or filter glow'
  );
});

check('multi-row lyric interaction cannot create a native blue text selection', () => {
  assert.match(
    cssSource,
    /\.multi-row-lyric-stage,\s*\.multi-row-lyric-list\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/s,
    'multi-row lyric surfaces must disable native text selection'
  );
  const bindOrbEventsSource = declaredFunctions(appSource)
    .find((entry) => entry.name === 'bindOrbEvents')?.source || '';
  assert.match(
    bindOrbEventsSource,
    /if\s*\(state\.playbackPage\s*&&\s*beginTextPresetGesture\(event\)\)\s*\{[\s\S]*?event\.preventDefault\(\);[\s\S]*?return;/,
    'every accepted lyric pointer gesture must prevent the browser selection default'
  );
});

check('multi-row lyrics stay crisp at enlarged raster sizes', () => {
  const lineRules = cssRules(cssSource).filter((rule) => (
    rule.selector.includes('.multi-row-lyric-line')
      && !rule.selector.includes('text-glitch')
  ));
  const currentContainerCss = lineRules
    .filter((rule) => rule.selector.trim() === '.multi-row-lyric-line.is-current')
    .map((rule) => rule.body)
    .join('\n');
  assert.doesNotMatch(currentContainerCss, /filter\s*:\s*[^;}]*(?:blur|drop-shadow)\s*\(/i,
    'the current multi-row lyric container must remain crisply rasterized');
  const textShadows = [...currentContainerCss.matchAll(/text-shadow\s*:\s*([^;}]+)/gi)]
    .map((match) => match[1].trim().replace(/\s*!important\s*$/i, ''));
  assert.ok(textShadows.every((value) => value === 'none'),
    'the current lyric container must not use a soft block shadow');
  assert.match(
    cssSource,
    /\.multi-row-lyric-stage\s*\{[^}]*zoom\s*:\s*var\(--lyric-raster-scale\)/s,
    'stage enlargement must use layout zoom so glyphs are rerasterized'
  );
  assert.match(
    cssSource,
    /\.multi-row-lyric-stage,\s*\.playback-lyric-scene\.is-multi-row-text \.multi-row-lyric-stage\s*\{[^}]*transform\s*:\s*translate3d\([^}]*rotateX\(var\(--text-preset-rotate-x\)\)[^}]*rotateY\(var\(--text-preset-rotate-y\)\)[^}]*rotateZ\(var\(--text-preset-rotate-z\)\)\s*!important;[^}]*transform-style\s*:\s*flat\s*!important;/s,
    'multi-row stage must share the single-row angles while keeping child glyphs on a crisp flat plane'
  );
});

check('current line owns an adaptive centre slot with stepped type and opacity', () => {
  assert.match(
    cssSource,
    /\.multi-row-lyric-list\s*\{[^}]*height:\s*var\(--multi-row-list-height,[^;}]+\);[^}]*grid-template-rows:\s*repeat\(var\(--multi-row-line-count,\s*7\),\s*minmax\(0,\s*1fr\)\)/s,
    'multi-row list must use the runtime adaptive height with equal centre-preserving slots'
  );
  assert.match(
    cssSource,
    /\.multi-row-lyric-line\s*\{[^}]*grid-row:\s*var\(--multi-row-slot,[^;}]+;[^}]*font-size:\s*var\(--multi-row-fit-font-size[^}]*opacity:\s*var\(--multi-row-line-opacity/s,
    'ordinary rows must consume their distance-based slot, fitted size and opacity'
  );
  assert.match(
    cssSource,
    /\.multi-row-lyric-line\.is-current\s*\{[^}]*grid-row:\s*var\(--multi-row-center-slot,[^;}]+;[^}]*font-size:\s*var\(--multi-row-fit-font-size[^}]*font-weight:\s*900;[^}]*opacity:\s*1/s,
    'current row must stay in the centre slot and be larger and brighter'
  );

  const runtime = multiRowRuntime({ active: 7, lineCount: 7 });
  runtime.render(true);
  const current = rowAt(runtime.list, 7);
  const nearFuture = rowAt(runtime.list, 8);
  const farFuture = rowAt(runtime.list, 10);
  assert.equal(current.style.getPropertyValue('--multi-row-slot'), '4');
  assert.equal(current.getAttribute('aria-current'), 'true');
  assert.equal(rowAt(runtime.list, 6), null, 'already-sung lyrics must not stay mounted');
  assert.ok(
    Number(nearFuture.style.getPropertyValue('--multi-row-line-opacity'))
      > Number(farFuture.style.getPropertyValue('--multi-row-line-opacity')),
    'opacity must descend one step at a time with distance'
  );
  assert.ok(
    Number(nearFuture.style.getPropertyValue('--multi-row-line-opacity')) <= 0.5,
    'the nearest future sentence must remain clearly subordinate to the current sentence'
  );
  assert.ok(
    Number.parseFloat(nearFuture.style.getPropertyValue('--multi-row-size-reduction'))
      < Number.parseFloat(farFuture.style.getPropertyValue('--multi-row-size-reduction')),
    'font reduction must grow with distance'
  );
  assert.ok(
    Number.parseFloat(nearFuture.style.getPropertyValue('--multi-row-curve-x')) < 0,
    'future rows must arc in from the left'
  );
});

check('3 and 5 row layouts compact their future context without moving the current lyric', () => {
  const layouts = [3, 5].map((lineCount) => {
    const runtime = multiRowRuntime({ active: 4, lineCount, lineTotal: 12, bilingual: true });
    runtime.render(true);
    return {
      lineCount,
      height: Number.parseFloat(runtime.list.style.getPropertyValue('--multi-row-list-height')),
      pitch: Number.parseFloat(runtime.list.style.getPropertyValue('--multi-row-row-pitch')),
      centerSlot: runtime.list.style.getPropertyValue('--multi-row-center-slot'),
    };
  });

  assert.ok(layouts.every(({ height, pitch }) => Number.isFinite(height) && Number.isFinite(pitch)),
    'adaptive multi-row layout metrics must reach the real list element');
  assert.ok(layouts[0].height < 450, '3-row lyrics must not keep the old 580px list height');
  assert.ok(layouts[1].height < 560, '5-row lyrics must not keep the old 580px list height');
  assert.ok(layouts[0].pitch < 150, '3-row current/future distance must be compact');
  assert.ok(layouts[1].pitch <= 110, '5-row current/future distance must be compact');
  assert.equal(layouts[0].centerSlot, '2');
  assert.equal(layouts[1].centerSlot, '3');
});

check('text-preset flow intensity controls the multi-row wave duration', () => {
  const slow = multiRowRuntime({ active: 3, lineCount: 5, flowIntensity: 0 });
  const fast = multiRowRuntime({ active: 3, lineCount: 5, flowIntensity: 100 });
  slow.render(true);
  fast.render(true);
  const slowDuration = Number.parseFloat(
    rowAt(slow.list, 3).style.getPropertyValue('--multi-row-motion-duration')
  );
  const fastDuration = Number.parseFloat(
    rowAt(fast.list, 3).style.getPropertyValue('--multi-row-motion-duration')
  );
  assert.ok(Number.isFinite(slowDuration) && Number.isFinite(fastDuration));
  assert.ok(fastDuration < slowDuration,
    'higher flow intensity must make the multi-row wave reach its slot sooner');
});

check('multi-row bilingual rendering suppresses an identical translation just like single-row lyrics', () => {
  const runtime = multiRowRuntime({ active: 0, lineCount: 3, lineTotal: 4, bilingual: true });
  runtime.state.lyricLines[0].translationText = runtime.state.lyricLines[0].text;
  runtime.render(true);
  assert.equal(
    rowAt(runtime.list, 0).querySelector('.multi-row-lyric-translation'),
    null,
    'an API response that repeats the main lyric in translationText must mount only one visible copy'
  );
  assert.ok(
    rowAt(runtime.list, 1).querySelector('.multi-row-lyric-translation'),
    'a genuinely different translation must remain visible'
  );
});

check('current lyric uses a one-shot arrival accent without an idle render loop', () => {
  assert.doesNotMatch(
    cssSource,
    /\.multi-row-lyric-line\.is-current:not\(\.is-leaving\)\s*\{[^}]*animation\s*:[^;}]*\binfinite\b/s,
    'the current lyric must not keep an infinite compositor animation alive'
  );
  assert.match(
    cssSource,
    /\.multi-row-lyric-line\.is-current\.is-lyric-transitioning:not\(\.is-leaving\)\s*\{[^}]*animation\s*:\s*multi-row-current-arrive\b[^;}]*\bboth\b/s,
    'a newly-current lyric needs one obvious, finite arrival accent'
  );
  const keyframes = cssSource.match(/@keyframes\s+multi-row-current-arrive\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(keyframes, /opacity\s*:\s*0?\.[0-9]+/, 'arrival accent needs a brief opacity contrast');
  assert.match(keyframes, /transform\s*:\s*translateX\(\s*-?[0-9.]+px\s*\)/,
    'current lyric needs a short horizontal arrival arc');
  assert.doesNotMatch(keyframes, /scale(?:3d)?\s*\(/i,
    'arrival animation must not scale glyph textures');
  assert.match(
    cssSource,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.multi-row-lyric-line\.is-current\.is-lyric-transitioning:not\(\.is-leaving\)\s*\{[^}]*animation\s*:\s*none/s,
    'reduced-motion mode must disable the arrival accent'
  );
});

check('current lyric keeps a contrasting rolling highlight layer', () => {
  assert.match(
    cssSource,
    /\.multi-row-lyric-line\.is-current\s*\{[^}]*color:\s*color-mix\([^}]*var\(--lyric-primary\)[^}]*var\(--lyric-depth\)[^}]*\)/s,
    'the unplayed base glyphs must use a quieter color than the karaoke highlight'
  );
  assert.match(
    cssSource,
    /\.multi-row-lyric-line\.is-current\s+:is\(\.multi-row-lyric-main,\s*\.multi-row-lyric-translation\)::after\s*\{[^}]*background-image:\s*linear-gradient\([^}]*--text-highlight-intensity[^}]*--text-highlight-gloss[^}]*--text-bass-spread/s,
    'the progress overlay must reuse the single-row gradient, gloss and low-frequency highlight material'
  );
});

check('wrapped current lyrics split time by visual-row grapheme weight', () => {
  const bookUpdateSource = declaredFunctions(appSource)
    .find((entry) => entry.name === 'updateBookLyricLines')?.source || '';
  const newPlaybackUpdateSource = declaredFunctions(appSource)
    .find((entry) => entry.name === 'updateQishuiPlaybackLyrics')?.source || '';
  assert.match(
    bookUpdateSource,
    /setBookLyricGlyphProgress\(current,/,
    'the ordinary lyric page must route live progress through visual-row highlighting'
  );
  assert.match(
    newPlaybackUpdateSource,
    /setBookLyricGlyphProgress\([\s\S]*?visibleProgress/,
    'the new playback bar must route live progress through visual-row highlighting'
  );
  assert.match(
    cssSource,
    /--lyric-wrap-highlight-clip,[\s\S]*?var\(--multi-row-progress,\s*0%\)/,
    'multi-row highlight must accept the cached visual-row clip'
  );
  assert.match(
    cssSource,
    /\.book-lyric-copy--hot\s*\{[\s\S]*?--lyric-wrap-highlight-clip,[\s\S]*?var\(--book-line-progress\)/,
    'playback-bar highlight must accept the same visual-row clip'
  );
  assert.match(
    appSource,
    /function setBookLyricGlyphProgress[\s\S]*?setSequentialLyricHighlight\(mainHot,\s*mainBase,\s*progressValue\)/,
    'the playback bar must drive wrapped highlighting from its existing sentence progress'
  );
  assert.match(
    appSource,
    /const visibleProgress = clamp\(Number\(progressPercent\) \|\| 0,\s*0,\s*100\);/,
    'playback-bar progress must keep advancing while the next sentence settles into position'
  );
  assert.match(
    cssSource,
    /\.qishui-playback-lyric-line\.is-arriving[\s\S]*?:is\(\.book-lyric-copy--hot,\s*\.book-lyric-translation-copy--hot\)\s*\{[^}]*opacity:\s*0\.42;[^}]*transition:\s*opacity 120ms ease-out;/,
    'the incoming sentence should reveal its live highlight without an abrupt visibility jump'
  );

  const runtime = multiRowRuntime();
  const target = new MockElement('span');
  target.textContent = '一二三四五六七八九十甲乙';
  target.mockBoundingRect = {
    x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 48, width: 100, height: 48
  };
  target.mockClientRects = [
    { x: 0, y: 0, top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20 },
    { x: 0, y: 26, top: 26, left: 0, right: 100, bottom: 46, width: 100, height: 20 }
  ];
  target.mockGraphemeRects = [
    ...Array.from({ length: 3 }, (_, index) => ({
      x: index * (100 / 3), y: 0, top: 0, left: index * (100 / 3),
      right: (index + 1) * (100 / 3), bottom: 20, width: 100 / 3, height: 20
    })),
    ...Array.from({ length: 9 }, (_, index) => ({
      x: index * (100 / 9), y: 26, top: 26, left: index * (100 / 9),
      right: (index + 1) * (100 / 9), bottom: 46, width: 100 / 9, height: 20
    }))
  ];

  runtime.setSequentialHighlight(target, target, 25);
  const readsAfterLayout = runtime.rangeReadCount();
  const firstLineClip = target.style.getPropertyValue('--lyric-wrap-highlight-clip');
  assert.match(firstLineClip, /100\.00px 0\.00px.*100\.00px 20\.00px/s);
  assert.doesNotMatch(
    firstLineClip,
    /26\.00px/,
    'the first 3/12 grapheme share must not reveal visual line two'
  );

  runtime.setSequentialHighlight(target, target, 50);
  const secondLineClip = target.style.getPropertyValue('--lyric-wrap-highlight-clip');
  assert.match(
    secondLineClip,
    /100% 26\.00px,\s*33\.33px 26\.00px,\s*33\.33px 46\.00px/s,
    'half sentence progress must consume 3 graphemes on line one and 3/9 on line two'
  );
  const writesAfterProgress = target.style.writeCount;
  runtime.setSequentialHighlight(target, target, 50);
  assert.equal(
    target.style.writeCount,
    writesAfterProgress,
    'an unchanged frame must not rewrite the clip style'
  );
  assert.equal(
    runtime.rangeReadCount(),
    readsAfterLayout,
    'cached visual rows must not re-read layout as sentence progress advances'
  );

  assert.equal(
    runtime.segmentHighlightGraphemes('A👩‍🚀中').length,
    3,
    'emoji ZWJ sequences must count as one grapheme timing unit'
  );

  const singleLine = new MockElement('span');
  singleLine.mockBoundingRect = target.mockBoundingRect;
  singleLine.mockClientRects = [target.mockClientRects[0]];
  runtime.setSequentialHighlight(singleLine, singleLine, 50);
  assert.equal(
    singleLine.style.getPropertyValue('--lyric-wrap-highlight-clip'),
    '',
    'single-line lyrics must retain the existing horizontal progress mask'
  );
});

check('wave timing and low-opacity text trail stay sharp', () => {
  const runtime = multiRowRuntime({ active: 5, lineCount: 5 });
  runtime.render(true);
  runtime.state.lyricIndex = 6;
  runtime.render();

  assert.equal(
    rowAt(runtime.list, 6).style.getPropertyValue('--multi-row-motion-duration'),
    '240ms',
    'new current sentence must take the fast lane'
  );
  const previousCurrent = runtime.list.children.find(
    (row) => Number(row.dataset.multiRowLyricIndex) === 5
      && row.classList.contains('is-leaving')
  );
  assert.ok(previousCurrent, 'old current sentence must begin its fade-out');
  assert.equal(previousCurrent.getAttribute('aria-hidden'), 'true');
  assert.ok(
    Number.parseFloat(rowAt(runtime.list, 6).style.getPropertyValue('--multi-row-trail-x')) < 0,
    'incoming current line must retain its left-hand arc during the transition'
  );

  const trailRule = cssSource.match(
    /\.multi-row-lyric-line::before\s*\{([^}]*)\}/s
  )?.[1] || '';
  const trailFrames = cssSource.match(
    /@keyframes\s+multi-row-motion-trail\s*\{([\s\S]*?)\n\}/
  )?.[1] || '';
  assert.match(trailRule, /content:\s*attr\(data-trail-text\)/, 'trail must reuse the lyric text');
  assert.match(trailRule, /text-shadow:\s*none/, 'trail must not soften glyph edges');
  assert.doesNotMatch(`${trailRule}\n${trailFrames}`, /(?:blur|drop-shadow)\s*\(/i,
    'trail must not use blur or drop-shadow');
  const trailOpacities = [...trailFrames.matchAll(/opacity:\s*(0?\.[0-9]+)/g)]
    .map((match) => Number(match[1]));
  assert.ok(trailOpacities.some((opacity) => opacity > 0 && opacity <= 0.12),
    'trail needs a visible but restrained opacity');
  assert.ok(trailOpacities.every((opacity) => opacity <= 0.12),
    'trail opacity must remain subtle');
});

check('multi-row renderer uses paint and motion completion events without interval stepping', () => {
  const runtime = multiRowRuntime();
  assert.match(runtime.source, /requestAnimationFrame\s*\(/, 'FLIP must begin on a paint frame');
  assert.match(runtime.source, /transitionend/, 'leaving cleanup must wait for transitionend');
  assert.doesNotMatch(runtime.source, /\bsetInterval\s*\(/, 'multi-row motion must not use setInterval');
  assert.doesNotMatch(runtime.source, /\bsteps\s*\(/, 'multi-row runtime must not quantize motion');
});

check('odd 3-11 row windows keep current centred and hide every completed lyric', () => {
  for (const lineCount of [3, 5, 7, 9, 11]) {
    const runtime = multiRowRuntime({ active: 0, lineCount, lineTotal: 17 });
    const half = Math.floor(lineCount / 2);
    const centreSlot = String(half + 1);

    runtime.render(true);
    assert.deepEqual(
      visibleLyricIndices(runtime.list),
      Array.from({ length: half + 1 }, (_, index) => index),
      `${lineCount} rows must leave empty past slots at the first lyric`
    );
    assert.equal(rowAt(runtime.list, 0).style.getPropertyValue('--multi-row-slot'), centreSlot);

    runtime.state.lyricIndex = 8;
    runtime.render(true);
    assert.deepEqual(
      visibleLyricIndices(runtime.list),
      Array.from({ length: Math.min(half + 1, 17 - 8) }, (_, index) => 8 + index),
      `${lineCount} rows must show only current and future context`
    );
    assert.equal(rowAt(runtime.list, 8).style.getPropertyValue('--multi-row-slot'), centreSlot);
    assert.equal(rowAt(runtime.list, 7), null);
    assert.ok(rowAt(runtime.list, 9)?.classList.contains('is-future'));

    runtime.state.lyricIndex = 16;
    runtime.render(true);
    assert.deepEqual(
      visibleLyricIndices(runtime.list),
      [16],
      `${lineCount} rows must leave all completed and unavailable future slots empty`
    );
    assert.equal(rowAt(runtime.list, 16).style.getPropertyValue('--multi-row-slot'), centreSlot);
    assert.equal(
      runtime.list.style.getPropertyValue('--multi-row-line-count'),
      String(lineCount)
    );
  }
});

check('sequential switches preserve identity and FLIP every retained row on one paint frame', () => {
  const runtime = multiRowRuntime({ active: 3, lineCount: 5, lineTotal: 10 });
  runtime.render(true);
  const initialRows = new Map(
    runtime.list.children.map((row) => [Number(row.dataset.multiRowLyricIndex), row])
  );
  assert.deepEqual([...initialRows.keys()], [3, 4, 5]);

  runtime.state.lyricIndex = 4;
  runtime.state.lyricProgressPercent = 12;
  runtime.render();
  const firstLeaving = initialRows.get(3);
  assert.equal(firstLeaving.classList.contains('is-leaving'), true);
  assert.equal(firstLeaving.isConnected, true, 'finished row was removed before its transition');
  assert.ok(firstLeaving.listenerCount('transitionend') > 0, 'finished row has no transitionend cleanup');
  for (let index = 4; index <= 5; index += 1) {
    assert.equal(rowAt(runtime.list, index), initialRows.get(index), `row ${index} was recreated`);
    assert.ok(flipOffset(initialRows.get(index)) > 0, `row ${index} has no FLIP inverse offset`);
  }
  assert.ok(rowAt(runtime.list, 6), 'next row was not mounted to keep a continuous window');
  assert.equal(runtime.scheduler.frameCount, 1, 'all retained rows must settle on the same paint frame');
  runtime.scheduler.runFrame();
  for (let index = 4; index <= 5; index += 1) {
    assert.equal(flipOffset(initialRows.get(index)), 0, `row ${index} did not animate toward layout position`);
  }
  finishLeaving(firstLeaving);
  assert.equal(firstLeaving.isConnected, false, 'finished row survived its transitionend');
});

check('seek jumps preserve overlapping DOM rows in both directions', () => {
  const forward = multiRowRuntime({ active: 5, lineCount: 5, lineTotal: 14 });
  forward.render(true);
  const forwardRows = new Map(
    visibleLyricRows(forward.list).map((row) => [Number(row.dataset.multiRowLyricIndex), row])
  );
  forward.state.lyricIndex = 6;
  forward.render();
  for (const index of [6, 7]) {
    assert.equal(rowAt(forward.list, index), forwardRows.get(index), `forward seek recreated row ${index}`);
    assert.ok(flipOffset(forwardRows.get(index)) > 0, `forward seek did not FLIP row ${index}`);
  }
  assert.equal(rowAt(forward.list, 6).style.getPropertyValue('--multi-row-slot'), '3');
  assert.equal(rowAt(forward.list, 5), null, 'completed row survived a forward seek');
  assert.equal(forward.scheduler.frameCount, 1);

  const backward = multiRowRuntime({ active: 8, lineCount: 5, lineTotal: 14 });
  backward.render(true);
  const backwardRows = new Map(
    visibleLyricRows(backward.list).map((row) => [Number(row.dataset.multiRowLyricIndex), row])
  );
  backward.state.lyricIndex = 7;
  backward.render();
  for (const index of [8, 9]) {
    assert.equal(rowAt(backward.list, index), backwardRows.get(index), `backward seek recreated row ${index}`);
    assert.ok(flipOffset(backwardRows.get(index)) < 0, `backward seek did not reverse FLIP row ${index}`);
  }
  assert.equal(backward.list.querySelector('.multi-row-lyric-line.is-past:not(.is-leaving)'), null);
  assert.equal(rowAt(backward.list, 7).style.getPropertyValue('--multi-row-trail-x'), '12px');
  assert.equal(backward.scheduler.frameCount, 1);
});

check('bilingual changes and lyric switches reuse the same line nodes', () => {
  const runtime = multiRowRuntime({ active: 7, lineCount: 7, bilingual: false });
  runtime.render(true);
  const originalRows = new Map(
    visibleLyricRows(runtime.list).map((row) => [Number(row.dataset.multiRowLyricIndex), row])
  );
  runtime.state.bilingualLyricsEnabled = true;
  runtime.render();
  for (const [index, row] of originalRows) {
    assert.equal(rowAt(runtime.list, index), row, `bilingual toggle recreated row ${index}`);
    assert.ok(
      row.querySelector('.multi-row-lyric-translation'),
      `bilingual toggle did not mount translation ${index}`
    );
  }

  runtime.state.lyricIndex = 8;
  runtime.render();
  assert.equal(rowAt(runtime.list, 7), null, 'newly completed bilingual row stayed visible');
  for (const index of [8, 9, 10]) {
    if (!originalRows.has(index)) continue;
    assert.equal(rowAt(runtime.list, index), originalRows.get(index),
      `bilingual lyric switch recreated retained row ${index}`);
  }
});

check('reduced motion is near-instant and removes the motion trail', () => {
  assert.match(
    cssSource,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.multi-row-lyric-line\s*\{[^}]*--multi-row-motion-duration:\s*1ms\s*!important;[^}]*transition-delay:\s*0ms\s*!important;/s,
    'reduced motion must collapse staggered transitions'
  );
  assert.match(
    cssSource,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.multi-row-lyric-line::before\s*\{[^}]*content:\s*none\s*!important;[^}]*animation:\s*none\s*!important;[^}]*opacity:\s*0\s*!important;/s,
    'reduced motion must remove the text trail'
  );
  const runtime = multiRowRuntime({ active: 5, reducedMotion: true });
  runtime.render(true);
  runtime.state.lyricIndex = 6;
  runtime.render();
  runtime.scheduler.runFrame();
  assert.ok(runtime.scheduler.timerDelays.length > 0);
  assert.ok(runtime.scheduler.timerDelays.every((delay) => delay <= 34),
    'reduced-motion cleanup timers must remain near-instant');
});

check('visible rAF work obeys the measured display budget without a fixed 60fps cap', () => {
  const drawOrbSource = declaredFunctions(appSource)
    .find((entry) => entry.name === 'drawOrb')?.source || '';
  assert.match(
    drawOrbSource,
    /consumeOrbFrameBudget\(now\)[\s\S]*?requestOrbFrame\(\);[\s\S]*?return;/,
    'the CPU-heavy Canvas path must skip work until its measured frame budget is due'
  );
  const budgetSource = declaredFunctions(appSource)
    .find((entry) => entry.name === 'orbFrameBudgetMs')?.source || '';
  assert.match(
    budgetSource,
    /state\.renderClarity\.targetFrameMs/,
    'the work gate must use the measured display frame budget'
  );
  assert.match(
    budgetSource,
    /1000\s*\/\s*120/,
    'active playback and interaction must retain a 120fps ceiling'
  );

  const intervalAnimationPattern = /\bsetInterval\s*\(/;
  const visibleName = /render|draw|animate|motion|frame|scene|lyric/i;
  const offenders = [];

  for (const entry of fs.readdirSync(webRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const source = fs.readFileSync(path.join(webRoot, entry.name), 'utf8');
    for (const declaration of declaredFunctions(source)) {
      if (visibleName.test(declaration.name) && intervalAnimationPattern.test(declaration.source)) {
        offenders.push(`${entry.name}:${declaration.name} uses setInterval for visible motion`);
      }
    }
  }
  assert.deepEqual(offenders, [], `interval-driven visible animations found:\n${offenders.join('\n')}`);
});

const failures = checks.filter((result) => !result.pass);
checks.forEach((result) => {
  console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}${result.error ? `: ${result.error}` : ''}`);
});
if (failures.length) {
  throw new Error(`Multiline lyric motion regression failed (${failures.length}/${checks.length})`);
}
console.log('Multiline lyric motion regression PASS');
