import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const resultId = 'karaoke-highlight-clock-browser-result';

const probe = String.raw`
<style>#bootScreen { display: none !important; }</style>
<script>
(() => {
  const runtimeErrors = [];
  window.addEventListener('error', (event) => runtimeErrors.push(event.message || 'window error'));
  window.addEventListener('unhandledrejection', (event) => runtimeErrors.push(String(event.reason || 'rejection')));
  const report = (payload) => {
    const output = document.createElement('pre');
    output.id = '${resultId}';
    output.textContent = JSON.stringify(payload);
    document.body.appendChild(output);
  };

  function run() {
    if (typeof createBookLyricLine !== 'function'
      || typeof lyricProgressForLineAtTime !== 'function'
      || typeof setBookLyricGlyphProgress !== 'function') {
      report({ error: 'karaoke highlight runtime is unavailable' });
      return;
    }

    const fixture = {
      time: 10,
      endTime: 11.2,
      text: '长音',
      glyphTimings: [
        { start: 10, end: 11 },
        { start: 11, end: 11.2 }
      ]
    };
    const line = createBookLyricLine(fixture, 0);
    line.classList.add('is-current');
    document.body.appendChild(line);
    const hotCopy = line.querySelector('.book-lyric-copy--hot');
    const firstGlyph = line.querySelector('.book-lyric-glyph');
    const samples = [10.25, 10.5, 10.75].map((mediaTime) => {
      const lineProgress = lyricProgressForLineAtTime(fixture, mediaTime, fixture.endTime);
      line.style.setProperty('--book-line-progress', (lineProgress * 100).toFixed(4) + '%');
      setBookLyricGlyphProgress(line, lineProgress * 100, mediaTime);
      return {
        mediaTime,
        lineProgress,
        firstGlyphHot: Number.parseFloat(firstGlyph.style.getPropertyValue('--book-glyph-hot'))
      };
    });
    const hotStyle = getComputedStyle(hotCopy);
    const glyphStyle = getComputedStyle(firstGlyph);

    const proportionalFixture = {
      time: 10,
      endTime: 12,
      text: 'Wiii',
      karaokeSegments: [
        { text: 'W', textStart: 0, textEnd: 1, startTime: 10, endTime: 11, duration: 1 },
        { text: 'iii', textStart: 1, textEnd: 4, startTime: 11, endTime: 12, duration: 1 }
      ]
    };
    const proportionalLine = createBookLyricLine(proportionalFixture, 1, { lazyGlyphs: true });
    proportionalLine.style.fontFamily = 'Arial, sans-serif';
    proportionalLine.style.fontSize = '64px';
    proportionalLine.style.letterSpacing = '0px';
    document.body.appendChild(proportionalLine);
    const proportionalBase = proportionalLine.querySelector('.book-lyric-copy--base');
    const textNode = proportionalBase.firstChild;
    const prefixRange = document.createRange();
    prefixRange.setStart(textNode, 0);
    prefixRange.setEnd(textNode, 1);
    const firstTokenWidth = prefixRange.getBoundingClientRect().width;
    const fullRange = document.createRange();
    fullRange.setStart(textNode, 0);
    fullRange.setEnd(textNode, proportionalFixture.text.length);
    const fullWidth = fullRange.getBoundingClientRect().width;
    const proportionalStyle = getComputedStyle(proportionalBase);
    const measureCanvas = document.createElement('canvas');
    const measureContext = measureCanvas.getContext('2d');
    measureContext.font = proportionalStyle.font;
    const firstTokenEnd = firstTokenWidth / fullWidth;
    const proportionalSamples = [10.5, 11.5].map((mediaTime) => ({
      mediaTime,
      progress: lyricProgressForLineAtTime(
        proportionalFixture,
        mediaTime,
        proportionalFixture.endTime,
        { measureElement: proportionalBase }
      )
    }));
    const slowPlainLines = autoDetectLyricSpeed([
      { time: 10, text: '慢慢唱完这一句' },
      { time: 20, text: '下一句从这里开始' },
      { time: 28, text: '最后一句' }
    ], { id: 'slow-vocal-browser-fixture', duration: 60 });
    const slowPlainLine = slowPlainLines[0];
    const slowPlain = {
      providerStart: slowPlainLine.time,
      inferredVocalEnd: slowPlainLine.autoVocalEndTime,
      nextLineStart: slowPlainLines[1].time,
      atVocalEnd: lyricProgressForLineAtTime(
        slowPlainLine,
        slowPlainLine.autoVocalEndTime,
        slowPlainLines[1].time
      ),
      duringPause: lyricProgressForLineAtTime(
        slowPlainLine,
        slowPlainLines[1].time - 0.25,
        slowPlainLines[1].time
      )
    };
    const slowGapFixture = {
      time: 30,
      endTime: 38,
      text: '慢 慢 唱',
      karaokeSegments: [
        { textStart: 0, textEnd: 1, startTime: 30, endTime: 31.4 },
        { textStart: 2, textEnd: 3, startTime: 33, endTime: 34.6 },
        { textStart: 4, textEnd: 5, startTime: 36.2, endTime: 38 }
      ]
    };
    const slowGapLine = createBookLyricLine(slowGapFixture, 2, { lazyGlyphs: true });
    slowGapLine.style.fontFamily = 'Arial, sans-serif';
    slowGapLine.style.fontSize = '64px';
    slowGapLine.style.letterSpacing = '0px';
    document.body.appendChild(slowGapLine);
    const slowGapBase = slowGapLine.querySelector('.book-lyric-copy--base');
    const slowGap = {
      atFirstWordEnd: lyricProgressForLineAtTime(
        slowGapFixture,
        31.4,
        slowGapFixture.endTime,
        { measureElement: slowGapBase }
      ),
      duringVocalPause: lyricProgressForLineAtTime(
        slowGapFixture,
        32.5,
        slowGapFixture.endTime,
        { measureElement: slowGapBase }
      ),
      duringSecondWord: lyricProgressForLineAtTime(
        slowGapFixture,
        33.8,
        slowGapFixture.endTime,
        { measureElement: slowGapBase }
      )
    };
    report({
      samples,
      proportional: {
        firstTokenEnd,
        debug: {
          font: proportionalStyle.font,
          fontFamily: proportionalStyle.fontFamily,
          fontSize: proportionalStyle.fontSize,
          fontWeight: proportionalStyle.fontWeight,
          letterSpacing: proportionalStyle.letterSpacing,
          domFirstWidth: firstTokenWidth,
          domFullWidth: fullWidth,
          canvasFirstWidth: measureContext.measureText('W').width,
          canvasFullWidth: measureContext.measureText('Wiii').width
        },
        expected: [firstTokenEnd * 0.5, firstTokenEnd + (1 - firstTokenEnd) * 0.5],
        samples: proportionalSamples
      },
      slowPlain,
      slowGap,
      transitions: {
        hotProperty: hotStyle.transitionProperty,
        hotDuration: hotStyle.transitionDuration,
        glyphProperty: glyphStyle.transitionProperty,
        glyphDuration: glyphStyle.transitionDuration
      },
      timelineResolverAvailable: typeof window.FeLyricTimelineResolver?.create === 'function',
      runtimeErrors
    });
  }

  setTimeout(() => {
    try { run(); } catch (error) { report({ error: error.stack || error.message }); }
  }, 80);
})();
</script>`;

const originalHtml = readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const injectedHtml = originalHtml.replace('</body>', `${probe}\n</body>`);

function contentType(filePath) {
  return ({
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
  })[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
  if (pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(injectedHtml);
    return;
  }
  if (pathname.startsWith('/api/')) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end('{}');
    return;
  }
  const base = pathname.startsWith('/components/') ? root : webRoot;
  const filePath = path.resolve(base, `.${pathname}`);
  if (!filePath.startsWith(base + path.sep)) {
    response.writeHead(403);
    response.end();
    return;
  }
  try {
    const content = readFileSync(filePath);
    response.writeHead(200, { 'content-type': contentType(filePath) });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end();
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const profileDir = mkdtempSync(path.join(tmpdir(), 'fe-monster-karaoke-clock-'));
let stdout = '';
try {
  const address = server.address();
  const result = await execFileAsync(edgePath, [
    '--headless=new',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`,
    '--window-size=1280,720',
    '--virtual-time-budget=5000',
    '--dump-dom',
    `http://127.0.0.1:${address.port}/?client=desktop-scene`
  ], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 15000,
    windowsHide: true
  });
  stdout = result.stdout;
} finally {
  await new Promise((resolve) => server.close(resolve));
  assert.ok(profileDir.startsWith(path.join(tmpdir(), 'fe-monster-karaoke-clock-')));
  rmSync(profileDir, { recursive: true, force: true });
}

const resultMatch = stdout.match(new RegExp(`<pre id="${resultId}">([\\s\\S]*?)<\\/pre>`));
assert.ok(resultMatch, `headless browser did not return the karaoke clock result:\n${stdout.slice(-2000)}`);
const payload = JSON.parse(resultMatch[1]
  .replaceAll('&quot;', '"')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&amp;', '&'));
assert.equal(payload.error, undefined, payload.error);

const expected = [
  { lineProgress: 0.125, firstGlyphHot: 0.25 },
  { lineProgress: 0.25, firstGlyphHot: 0.5 },
  { lineProgress: 0.375, firstGlyphHot: 0.75 }
];
payload.samples.forEach((sample, index) => {
  assert.ok(Math.abs(sample.lineProgress - expected[index].lineProgress) < 0.0001,
    `browser line progress drifted at ${sample.mediaTime}s: ${sample.lineProgress}`);
  assert.ok(Math.abs(sample.firstGlyphHot - expected[index].firstGlyphHot) < 0.0001,
    `browser glyph highlight drifted at ${sample.mediaTime}s: ${sample.firstGlyphHot}`);
});
payload.proportional.samples.forEach((sample, index) => {
  assert.ok(Math.abs(sample.progress - payload.proportional.expected[index]) < 0.001,
    `proportional-font provider token drifted at ${sample.mediaTime}s: ${sample.progress}, expected ${payload.proportional.expected[index]} (${JSON.stringify(payload.proportional.debug)})`);
});
assert.ok(payload.slowPlain.inferredVocalEnd > payload.slowPlain.providerStart
    && payload.slowPlain.inferredVocalEnd < payload.slowPlain.nextLineStart,
  `slow plain LRC did not receive a bounded visual vocal end: ${JSON.stringify(payload.slowPlain)}`);
assert.equal(payload.slowPlain.atVocalEnd, 1,
  'slow plain LRC did not finish highlighting with the inferred vocal end');
assert.equal(payload.slowPlain.duringPause, 1,
  'slow plain LRC did not hold its completed highlight before the next line');
assert.ok(Math.abs(payload.slowGap.atFirstWordEnd - payload.slowGap.duringVocalPause) < 0.0001,
  `native karaoke drifted during a slow vocal pause: ${JSON.stringify(payload.slowGap)}`);
assert.ok(payload.slowGap.duringSecondWord > payload.slowGap.duringVocalPause,
  'native karaoke did not resume from the supplied second-word timestamp');
assert.equal(payload.transitions.hotDuration, '0s', 'hot mask still has a CSS clock delay');
assert.equal(payload.transitions.glyphDuration, '0s', 'glyph highlight still has a CSS clock delay');
assert.equal(payload.timelineResolverAvailable, true,
  'the cross-provider lyric timeline resolver was not available in the real browser runtime');
assert.deepEqual(payload.runtimeErrors, [], `browser runtime errors: ${payload.runtimeErrors.join('\n')}`);

console.log(JSON.stringify({ ok: true, ...payload }, null, 2));
