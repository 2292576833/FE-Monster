import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web/app.js'), 'utf8');
const html = readFileSync(path.join(root, 'web/index.html'), 'utf8');
assert.match(html, /id="bookLyricList"[^>]*data-lyric-offset="transform"/);
function source(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}`);
  let depth = 0;
  let open = -1;
  for (let i = app.indexOf('(', start); i < app.length; i += 1) {
    if (app[i] === '(') depth += 1;
    if (app[i] === ')' && --depth === 0) { open = app.indexOf('{', i); break; }
  }
  depth = 0;
  for (let i = open; i < app.length; i += 1) {
    if (app[i] === '{') depth += 1;
    if (app[i] === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error(`unbalanced function ${name}`);
}
const bookStart = app.indexOf('function bookLyricDisplayLines(');
const bookEnd = app.indexOf('function seekToBookLyric(', bookStart);
assert.ok(bookStart >= 0 && bookEnd > bookStart);
const helpers = [
  'clamp', 'safeText', 'formatTime', 'bookLyricProgressEndTime', 'updateBookLyricArtist',
  'lyricProgressForLineAtTime', 'lyricKaraokeElementMeasurer', 'lyricKaraokeVisualRanges',
  'lyricHighlightGraphemeWeight', 'lyricHighlightTextNodes', 'lyricHighlightGraphemes',
  'lyricHighlightVisualLines', 'invalidateSequentialLyricHighlight',
  'invalidateSequentialLyricHighlights', 'setSequentialLyricHighlight',
  'orbFrameBudgetMs', 'resetOrbFrameBudget', 'playbackFrameRateUncapped', 'consumeOrbFrameBudget'
];
const require = createRequire(import.meta.url);
let chromium;
for (const candidate of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright',
  path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch {}
}
assert.ok(chromium, 'Playwright is required');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(edge) ? { executablePath: edge } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  const stageStart = html.indexOf('<div class="book-lyric-stage"');
  const stageEnd = html.indexOf('<div class="multi-row-lyric-stage"', stageStart);
  assert.ok(stageStart > 0 && stageEnd > stageStart);
  await page.setContent(`<section class="playback-lyric-scene is-book-text" id="scene">${html.slice(stageStart, stageEnd)}</section>`);
  await page.addStyleTag({ content: readFileSync(path.join(root, 'web/styles.css'), 'utf8') });
  await page.addStyleTag({ content: `
    body { margin:0; background:#17131d; }
    #scene { position:absolute; inset:0; display:block; opacity:1; visibility:visible;
      --book-hot:#fff; --book-hot-rgb:255,255,255; --book-page:#302833; }
    .book-lyric-line { transition:none!important; }
  ` });
  await page.evaluate(() => {
    window.els = { bookLyricList: document.getElementById('bookLyricList'),
      bookLyricArtist: document.getElementById('bookLyricArtist') };
    window.DEFAULT_TEXT_COMPOSER_SETTINGS = { bookLyricLineCount: 7 };
    window.state = { textPreset: 'book', playbackPage: true, lyricLines: [], lyricIndex: -1,
      lyricBookIndex: -2, lyricBookSignature: '', bilingualLyricsEnabled: true,
      textComposerSettings: { bookLyricLineCount: 7 },
      renderClarity: { targetFrameMs: 1000 / 60 }, orb: {}, playbackVisual: {}, harmonicState: {} };
    window.RENDER_PROFILE = { targetFrameMs: 1000 / 60 };
    window.reducedMotion = false;
    window.running = true;
    window.mediaTime = 0;
    window.isPlaybackClockRunning = () => running;
    window.isHarmonicStatePreset = () => false;
    window.coverParticleIdleMotionGate = () => 0;
    window.playbackLyricText = () => '等待歌词';
    window.playbackLyricSubtitle = () => '书页测试作者';
    window.playbackLyricTranslationText = (line) => line.translationText || '';
    window.playbackDurationForLyricSpeed = () => 180;
    window.currentPlaybackLyricTime = () => mediaTime;
    window.effectivePlaybackLyricTime = (time) => time;
    window.clearElement = (element) => element.replaceChildren();
    window.requestOrbFrame = () => {};
  });
  await page.addScriptTag({ content: helpers.map(source).join('\n') + '\n' + app.slice(bookStart, bookEnd) });
  await page.evaluate(() => {
    els.bookLyricList.addEventListener('wheel', scrollBookLyricFromWheel, { passive: false });
    window.loadFixture = (kind) => {
      state.lyricSignature = kind;
      state.lyricLines = Array.from({ length: 18 }, (_, i) => {
        const text = i === 0 ? '唱完保持这一句' : `下一句歌词第${i + 1}行`;
        const time = 2 + i * 10;
        const glyphTimings = Array.from(text, (_, j) => ({ start: time + j * 2 / text.length,
          end: time + (j + 1) * 2 / text.length }));
        return { time, endTime: time + 2, text, translationText: 'The lyric remains visible until the next line.',
          ...(kind !== 'plain' ? { glyphTimings } : {}),
          ...(kind === 'karaoke' ? { karaokeSegments: glyphTimings.map((glyph, j) => ({
            startTime: glyph.start, endTime: glyph.end, textStart: j, textEnd: j + 1
          })) } : {}) };
      });
      state.lyricIndex = -1;
      updateBookLyricArtist();
      renderBookLyricLines(true);
    };
    window.sample = (time) => {
      mediaTime = time;
      state.lyricIndex = state.lyricLines.findLastIndex((line) => line.time <= time);
      const line = state.lyricLines[state.lyricIndex];
      const progress = line ? lyricProgressForLineAtTime(line, time, line.endTime) * 100 : 0;
      state.lyricProgressPercent = progress;
      updateBookLyricLines(progress, time);
    };
    window.appearance = () => {
      const row = state.lyricBookCurrentLine;
      const style = getComputedStyle(row);
      return { transform: style.transform, opacity: style.opacity, filter: style.filter,
        hotOpacity: getComputedStyle(row.__bookGlyphLayers.mainHot).opacity,
        current: row.getAttribute('aria-current'), progress: row.style.getPropertyValue('--book-line-progress') };
    };
  });
  const cases = [];
  for (const kind of ['plain', 'glyph', 'karaoke']) {
    await page.evaluate((kind) => loadFixture(kind), kind);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const result = await page.evaluate(() => {
      sample(1.999);
      const beforeFirst = els.bookLyricList.querySelectorAll('.is-current').length;
      sample(3.8);
      const singing = appearance();
      sample(5);
      const ended = appearance();
      sample(11.999);
      const gap = appearance();
      sample(12);
      const next = { index: state.lyricBookIndex,
        previousCurrent: els.bookLyricList.__bookLyricLines[0].classList.contains('is-current') };
      running = false;
      sample(2.1);
      const seek = appearance();
      const offsetBefore = lyricListViewportOffset(els.bookLyricList);
      const wheel = new WheelEvent('wheel', { deltaY: 48, cancelable: true });
      els.bookLyricList.dispatchEvent(wheel);
      const wheelDelta = lyricListViewportOffset(els.bookLyricList) - offsetBefore;
      running = true;
      sample(6);
      const counts = { queries: 0, styleWrites: 0, layoutReads: 0 };
      const originals = [];
      const wrap = (owner, key, counter) => {
        const original = owner[key];
        owner[key] = function (...args) { counts[counter] += 1; return original.apply(this, args); };
        originals.push(() => { owner[key] = original; });
      };
      wrap(Element.prototype, 'querySelector', 'queries');
      wrap(Element.prototype, 'querySelectorAll', 'queries');
      wrap(CSSStyleDeclaration.prototype, 'setProperty', 'styleWrites');
      wrap(Element.prototype, 'getBoundingClientRect', 'layoutReads');
      wrap(window, 'getComputedStyle', 'layoutReads');
      for (const key of ['clientHeight', 'scrollHeight']) {
        const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, key);
        Object.defineProperty(els.bookLyricList, key, { configurable: true,
          get() { counts.layoutReads += 1; return descriptor.get.call(this); } });
        originals.push(() => { delete els.bookLyricList[key]; });
      }
      try { for (let i = 0; i < 600; i += 1) sample(6 + i * 0.009); }
      finally { originals.reverse().forEach((restore) => restore()); }
      const list = els.bookLyricList;
      list.style.bottom = '80px';
      fitBookLyricLinesToPage();
      sample(11.5);
      const resizedTarget = bookLyricTargetScrollTop(state.lyricBookCurrentLine);
      const resizeError = Math.abs(lyricListViewportOffset(list) - resizedTarget);
      const pageBox = document.getElementById('bookLyricPage').getBoundingClientRect();
      const visibleBelow = list.__bookLyricLines.some((row) => {
        const box = row.getBoundingClientRect();
        if (box.top <= pageBox.bottom + 4 || box.bottom >= innerHeight - 4) return false;
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return hit?.closest('.book-lyric-line') === row;
      });
      return { beforeFirst, singing, ended, gap, next, seek, wheelDelta,
        wheelPrevented: wheel.defaultPrevented, counts, resizeError, visibleBelow,
        overflow: [getComputedStyle(list).overflowY, getComputedStyle(document.getElementById('bookLyricPage')).overflowY] };
    });
    assert.equal(result.beforeFirst, 0, `${kind}: no early lyric`);
    for (const key of ['transform', 'opacity', 'filter', 'hotOpacity', 'current']) {
      assert.equal(result.ended[key], result.singing[key], `${kind}: ended ${key} must not retract`);
      assert.equal(result.gap[key], result.singing[key], `${kind}: gap ${key} must remain`);
    }
    assert.equal(result.ended.progress, '100.00%');
    assert.deepEqual(result.next, { index: 1, previousCurrent: false });
    assert.ok(Number.parseFloat(result.seek.progress) < 15, `${kind}: backward seek must clear completion cache`);
    assert.equal(result.wheelDelta, 48);
    assert.equal(result.wheelPrevented, true);
    assert.deepEqual(result.counts, { queries: 0, styleWrites: 0, layoutReads: 0 });
    assert.ok(result.resizeError < 0.02, `${kind}: resized lyric must recenter`);
    assert.deepEqual(result.overflow, ['visible', 'visible']);
    assert.equal(result.visibleBelow, true, `${kind}: a row below the page must remain visible and hit-testable`);
    cases.push({ kind, gapFrames: 600, counts: result.counts, lowerBoundaryRemoved: result.visibleBelow });
  }
  const lineWindows = await page.evaluate(() => {
    const windows = [];
    for (const count of [1, 3, 7, 8, 15]) {
      state.textComposerSettings.bookLyricLineCount = count;
      for (const time of [3, 93, 173]) {
        sample(time);
        const visible = els.bookLyricList.__bookLyricLines.filter((row) => getComputedStyle(row).visibility !== 'hidden');
        windows.push({ count, time, visible: visible.length,
          currentVisible: visible.includes(state.lyricBookCurrentLine),
          hiddenFocusable: els.bookLyricList.__bookLyricLines.some((row) => row.classList.contains('is-outside-book-window') && row.tabIndex >= 0) });
      }
    }
    state.textComposerSettings.bookLyricLineCount = 7;
    sample(11.5);
    return windows;
  });
  for (const item of lineWindows) {
    assert.equal(item.visible, item.count);
    assert.equal(item.currentVisible, true);
    assert.equal(item.hiddenFocusable, false);
  }
  assert.equal(await page.locator('.book-lyric-cover-column #bookLyricArtist').count(), 1);
  assert.equal(await page.locator('.book-lyric-page #bookLyricArtist').count(), 0);
  const resizedViews = [];
  for (const width of [1024, 600, 390]) {
    await page.setViewportSize({ width, height: 1080 });
    await page.evaluate(() => { running = false; scheduleBookLyricFit(); });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const resized = await page.evaluate(() => ({
      overflow: getComputedStyle(els.bookLyricList).overflowY,
      centeredError: Math.abs(lyricListViewportOffset(els.bookLyricList)
        - bookLyricTargetScrollTop(state.lyricBookCurrentLine)),
      current: state.lyricBookCurrentLine.getAttribute('aria-current')
    }));
    assert.equal(resized.overflow, 'visible');
    assert.ok(resized.centeredError < 0.02, `paused resize at ${width}px must recenter`);
    assert.equal(resized.current, 'true');
    resizedViews.push({ width, ...resized });
  }
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.evaluate(() => { fitBookLyricLinesToPage(); sample(11.5); });
  const refreshRates = await page.evaluate(() => {
    running = true;
    return [60, 120, 144, 240, 360].map((hz) => {
      resetOrbFrameBudget();
      let accepted = 0;
      for (let i = 0; i < hz; i += 1) if (consumeOrbFrameBudget(1000 + i * 1000 / hz)) accepted += 1;
      return { hz, accepted };
    });
  });
  for (const { hz, accepted } of refreshRates) assert.equal(accepted, hz, `no software cap at ${hz} Hz`);
  const output = path.join(root, 'output/playwright/book-lyric-hold');
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: path.join(output, 'held-line.png') });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, cases, lineWindows, authorUnderCover: true,
    resizedViews, refreshRates, screenshot: path.join(output, 'held-line.png') }));
} finally {
  await browser.close();
}
