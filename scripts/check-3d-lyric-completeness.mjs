import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const workspaceRoot = process.cwd();
const cssPath = path.join(workspaceRoot, 'web', 'styles.css');
const lyricQualityCssPath = path.join(workspaceRoot, 'web', 'lyric-render-quality.css');
const css = fs.readFileSync(cssPath, 'utf8');
const app = fs.readFileSync(path.join(workspaceRoot, 'web', 'app.js'), 'utf8');
const blurRuntime = fs.readFileSync(
  path.join(workspaceRoot, 'components', 'BlurText.runtime.js'),
  'utf8'
);
const blurApkRuntime = fs.readFileSync(
  path.join(workspaceRoot, 'web', 'blur-text-lyrics-apk.js'),
  'utf8'
);
const requestedViewportWidth = Number.parseInt(process.env.FE_3D_LYRIC_VIEWPORT || '', 10);
const viewportWidths = Number.isFinite(requestedViewportWidth)
  ? [requestedViewportWidth]
  : [1280, 1600];
const viewportWidth = viewportWidths[0];
const lyricFixture = 'Through every silent city light we keep on running toward the morning together';
const cjkLyricFixture = '穿越星河寻找黎明守住所有微光直到晨曦再次照亮城市'.repeat(3);

function functionSource(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing ${name}()`);
  const openBrace = app.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = openBrace; index < app.length; index += 1) {
    const character = app[index];
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
    else if (character === '}' && --depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}()`);
}

const lyricFitRuntime = Function(
  'window',
  'clamp',
  `${functionSource('isCjkLyricGlyph')}\n`
    + `${functionSource('lyricLineVisualUnits')}\n`
    + `${functionSource('lyricLineFitMetrics')}\n`
    + 'return lyricLineFitMetrics;'
)({ innerWidth: viewportWidth }, (value, minimum, maximum) => (
  Math.min(maximum, Math.max(minimum, value))
));
const englishFit = lyricFitRuntime(lyricFixture, 1);
const cjkFit = lyricFitRuntime(cjkLyricFixture, 1);
const lyricSubtitleFitRuntime = Function(
  'window',
  'clamp',
  `${functionSource('isCjkLyricGlyph')}\n`
    + `${functionSource('lyricLineVisualUnits')}\n`
    + `${functionSource('lyricSubtitleFitMetrics')}\n`
    + 'return lyricSubtitleFitMetrics;'
)({ innerWidth: viewportWidth }, (value, minimum, maximum) => (
  Math.min(maximum, Math.max(minimum, value))
));
const englishSubtitleFit = lyricSubtitleFitRuntime(lyricFixture, 1, 1);
const cjkSubtitleFit = lyricSubtitleFitRuntime(cjkLyricFixture, 1, 1);

const edgeCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = edgeCandidates.find((candidate) => fs.existsSync(candidate));
assert.ok(browserPath, 'Chromium is required for the 3D lyric layout regression');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-3d-lyric-'));
const fixturePath = path.join(tempRoot, 'fixture.html');
const profilePath = path.join(tempRoot, 'profile');

const fixture = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <link rel="stylesheet" href="${pathToFileURL(cssPath).href}">
    <link rel="stylesheet" href="${pathToFileURL(lyricQualityCssPath).href}">
    <style>
      html, body { width: 100%; height: 100%; margin: 0; background: #02060a; overflow: hidden; }
      .playback-lyric-scene { visibility: visible !important; opacity: 1 !important; }
      #fixtureShell { position: relative !important; width: 100% !important; height: 100% !important; }
    </style>
  </head>
  <body>
    <main class="app-shell" id="fixtureShell">
    <section class="playback-lyric-scene" id="scene">
      <div class="playback-lyric-rig">
        <div class="playback-lyric-core">
          <span
            class="playback-lyric-layer lyric-depth-0 is-lyric-long"
            id="lyric"
            data-text="${lyricFixture}"
            style="--lyric-fit-font-size:${englishFit.fontSize.toFixed(3)}px"
          >${lyricFixture}</span>
          <span
            class="playback-lyric-layer lyric-depth-0 is-lyric-compact"
            id="cjkLyric"
            data-text="${cjkLyricFixture}"
            style="--lyric-fit-font-size:${cjkFit.fontSize.toFixed(3)}px"
          >${cjkLyricFixture}</span>
          <div
            class="playback-lyric-subtitle"
            id="subtitleLyric"
            data-text="${lyricFixture}"
            style="--lyric-subtitle-fit-font-size:${englishSubtitleFit.fontSize.toFixed(3)}px"
          >${lyricFixture}</div>
          <div
            class="playback-lyric-subtitle"
            id="cjkSubtitleLyric"
            data-text="${cjkLyricFixture}"
            style="--lyric-subtitle-fit-font-size:${cjkSubtitleFit.fontSize.toFixed(3)}px"
          >${cjkLyricFixture}</div>
        </div>
      </div>
    </section>
    <section class="playback-lyric-scene is-flow-text has-blur-lyrics">
      <div class="playback-lyric-rig">
        <div class="playback-lyric-core">
          <div class="blur-lyric-mount">
            <div class="blur-lyric-stack" style="--lyric-fit-font-size:${englishFit.fontSize.toFixed(3)}px">
              <div
                class="blur-lyric-copy blur-lyric-copy--base"
                id="flowLyric"
              >${lyricFixture}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
    </main>
    <script>
      requestAnimationFrame(() => {
        const shell = document.getElementById('fixtureShell');
        const scene = document.getElementById('scene');
        const lyric = document.getElementById('lyric');
        const cjkLyric = document.getElementById('cjkLyric');
        const subtitleLyric = document.getElementById('subtitleLyric');
        const cjkSubtitleLyric = document.getElementById('cjkSubtitleLyric');
        const presetMetrics = [
          ['default', '', ''],
          ['sonic', 'has-sonic-topography', ''],
          ['chladni', 'has-chladni', ''],
          ['free-cubes', 'has-free-cubes', ''],
          ['void-prism', 'has-void-prism', ''],
          ['flow', '', 'is-flow-text'],
          ['focus-echo', '', 'is-focus-echo-text'],
          ['rain-glass', '', 'is-rain-glass-text'],
          ['book-effect', '', 'is-book-effect-text']
        ].map(([name, shellClass, sceneClass]) => {
          shell.className = ['app-shell', shellClass].filter(Boolean).join(' ');
          scene.className = ['playback-lyric-scene', sceneClass].filter(Boolean).join(' ');
          const englishRange = document.createRange();
          englishRange.selectNodeContents(lyric);
          const cjkPresetRange = document.createRange();
          cjkPresetRange.selectNodeContents(cjkLyric);
          const subtitleRange = document.createRange();
          subtitleRange.selectNodeContents(subtitleLyric);
          const cjkSubtitleRange = document.createRange();
          cjkSubtitleRange.selectNodeContents(cjkSubtitleLyric);
          return {
            name,
            englishLineCount: Array.from(englishRange.getClientRects()).filter((rect) => rect.width > 0).length,
            englishClientWidth: lyric.clientWidth,
            englishScrollWidth: lyric.scrollWidth,
            cjkLineCount: Array.from(cjkPresetRange.getClientRects()).filter((rect) => rect.width > 0).length,
            cjkClientWidth: cjkLyric.clientWidth,
            cjkScrollWidth: cjkLyric.scrollWidth,
            subtitleLineCount: Array.from(subtitleRange.getClientRects()).filter((rect) => rect.width > 0).length,
            subtitleClientWidth: subtitleLyric.clientWidth,
            subtitleScrollWidth: subtitleLyric.scrollWidth,
            cjkSubtitleLineCount: Array.from(cjkSubtitleRange.getClientRects()).filter((rect) => rect.width > 0).length,
            cjkSubtitleClientWidth: cjkSubtitleLyric.clientWidth,
            cjkSubtitleScrollWidth: cjkSubtitleLyric.scrollWidth,
            subtitleWhiteSpace: getComputedStyle(subtitleLyric).whiteSpace,
            whiteSpace: getComputedStyle(lyric).whiteSpace,
            fontSize: getComputedStyle(lyric).fontSize
          };
        });
        shell.className = 'app-shell';
        scene.className = 'playback-lyric-scene';
        const computed = getComputedStyle(lyric);
        const range = document.createRange();
        range.selectNodeContents(lyric);
        const lineRects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
        const lyricRect = lyric.getBoundingClientRect();
        const sceneRect = scene.getBoundingClientRect();
        const cjkRange = document.createRange();
        cjkRange.selectNodeContents(cjkLyric);
        const cjkLineRects = Array.from(cjkRange.getClientRects())
          .filter((rect) => rect.width > 0);
        const flowLyric = document.getElementById('flowLyric');
        const flowComputed = getComputedStyle(flowLyric);
        const flowRange = document.createRange();
        flowRange.selectNodeContents(flowLyric);
        const flowLineRects = Array.from(flowRange.getClientRects())
          .filter((rect) => rect.width > 0);
        scene.style.setProperty('--lyric-raster-scale', '2.5');
        const highZoomRig = scene.querySelector('.playback-lyric-rig');
        const highZoomStyle = getComputedStyle(lyric);
        const metrics = {
          dpr: devicePixelRatio,
          overflowX: computed.overflowX,
          overflowY: computed.overflowY,
          textOverflow: computed.textOverflow,
          whiteSpace: computed.whiteSpace,
          lineCount: lineRects.length,
          clientWidth: lyric.clientWidth,
          scrollWidth: lyric.scrollWidth,
          clientHeight: lyric.clientHeight,
          scrollHeight: lyric.scrollHeight,
          textIntact: lyric.textContent === ${JSON.stringify(lyricFixture)},
          horizontallyInsideScene:
            lyricRect.left >= sceneRect.left - 1
            && lyricRect.right <= sceneRect.right + 1,
          verticallyInsideScene:
            lyricRect.top >= sceneRect.top - 1
            && lyricRect.bottom <= sceneRect.bottom + 1,
          cjkLineCount: cjkLineRects.length,
          cjkClientWidth: cjkLyric.clientWidth,
          cjkScrollWidth: cjkLyric.scrollWidth,
          flowOverflowX: flowComputed.overflowX,
          flowWhiteSpace: flowComputed.whiteSpace,
          flowLineCount: flowLineRects.length,
          flowClientWidth: flowLyric.clientWidth,
          flowScrollWidth: flowLyric.scrollWidth,
          flowClientHeight: flowLyric.clientHeight,
          flowScrollHeight: flowLyric.scrollHeight,
          highZoom: {
            rigZoom: parseFloat(getComputedStyle(highZoomRig).zoom),
            paintOrder: highZoomStyle.paintOrder,
            fontSynthesis: highZoomStyle.fontSynthesis,
            strokeWidth: parseFloat(highZoomStyle.webkitTextStrokeWidth)
          },
          presetMetrics
        };
        document.body.dataset.metrics = JSON.stringify(metrics);
      });
    </script>
  </body>
</html>`;

try {
  fs.writeFileSync(fixturePath, fixture, 'utf8');
  const result = spawnSync(browserPath, [
    '--headless=new',
    '--no-first-run',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    '--virtual-time-budget=1500',
    `--window-size=${viewportWidth},720`,
    `--user-data-dir=${profilePath}`,
    '--dump-dom',
    pathToFileURL(fixturePath).href
  ], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 15000
  });

  assert.equal(result.status, 0, result.stderr || 'Chromium layout fixture failed');
  const metricsAttribute = result.stdout.match(/data-metrics="([^"]+)"/)?.[1];
  assert.ok(metricsAttribute, `Chromium did not return lyric metrics:\n${result.stdout.slice(-1000)}`);
  const metrics = JSON.parse(
    metricsAttribute
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&')
  );
  console.log(JSON.stringify({ viewportWidth, ...metrics }, null, 2));

  assert.equal(metrics.textIntact, true, 'the renderer changed the lyric text');
  assert.ok(Math.abs(metrics.dpr - 2) < 0.02, `the high-DPI fixture rendered at DPR ${metrics.dpr}`);
  assert.ok(Math.abs(metrics.highZoom.rigZoom - 2.5) < 0.01, 'single-row lyrics are not layout-rasterized at 2.5x zoom');
  assert.ok(
    ['stroke', 'stroke fill'].includes(metrics.highZoom.paintOrder),
    'single-row high-zoom glyph contour paints in the wrong order'
  );
  assert.equal(metrics.highZoom.fontSynthesis, 'none', 'single-row high-zoom glyphs still use synthetic font faces');
  assert.ok(metrics.highZoom.strokeWidth >= 0.45, `single-row glyph contour is too weak at 2.5x: ${metrics.highZoom.strokeWidth}px`);
  assert.equal(metrics.whiteSpace, 'nowrap', 'long 3D lyrics must stay on one visual line');
  assert.notEqual(metrics.overflowX, 'hidden', 'long 3D lyrics are hidden at the layer boundary');
  assert.notEqual(metrics.textOverflow, 'ellipsis', 'long 3D lyrics are replaced with an ellipsis');
  assert.equal(metrics.lineCount, 1, `the English 3D lyric used ${metrics.lineCount} visual lines`);
  assert.ok(
    metrics.scrollWidth <= metrics.clientWidth + 1,
    `3D lyric content overflows horizontally (${metrics.scrollWidth}px > ${metrics.clientWidth}px)`
  );
  assert.ok(
    metrics.overflowY === 'visible' || metrics.scrollHeight <= metrics.clientHeight + 1,
    `3D lyric content is clipped vertically (${metrics.scrollHeight}px > ${metrics.clientHeight}px)`
  );
  assert.equal(metrics.horizontallyInsideScene, true, '3D lyric leaves the scene horizontally');
  assert.equal(metrics.verticallyInsideScene, true, '3D lyric leaves the scene vertically');
  assert.equal(metrics.cjkLineCount, 1, `the compact CJK lyric used ${metrics.cjkLineCount} lines`);
  assert.ok(
    metrics.cjkScrollWidth <= metrics.cjkClientWidth + 1,
    `CJK 3D lyric overflows horizontally (${metrics.cjkScrollWidth}px > ${metrics.cjkClientWidth}px)`
  );
  assert.equal(metrics.flowWhiteSpace, 'nowrap', 'Flow 3D lyrics must stay on one visual line');
  assert.notEqual(metrics.flowOverflowX, 'hidden', 'Flow 3D lyrics are hidden at the copy boundary');
  assert.equal(metrics.flowLineCount, 1, `Flow 3D lyric used ${metrics.flowLineCount} visual lines`);
  assert.ok(
    metrics.flowScrollWidth <= metrics.flowClientWidth + 1,
    `Flow 3D lyric overflows horizontally (${metrics.flowScrollWidth}px > ${metrics.flowClientWidth}px)`
  );
  metrics.presetMetrics.forEach((preset) => {
    assert.equal(
      preset.whiteSpace,
      'nowrap',
      `${preset.name} main lyric is not single-line at ${viewportWidth}px`
    );
    assert.equal(
      preset.englishLineCount,
      1,
      `${preset.name} English main lyric used ${preset.englishLineCount} lines at ${viewportWidth}px`
    );
    assert.equal(
      preset.cjkLineCount,
      1,
      `${preset.name} CJK main lyric used ${preset.cjkLineCount} lines at ${viewportWidth}px`
    );
    assert.ok(
      preset.englishScrollWidth <= preset.englishClientWidth + 1,
      `${preset.name} English main lyric overflowed at ${viewportWidth}px`
    );
    assert.ok(
      preset.cjkScrollWidth <= preset.cjkClientWidth + 1,
      `${preset.name} CJK main lyric overflowed at ${viewportWidth}px`
    );
    assert.equal(
      preset.subtitleWhiteSpace,
      'nowrap',
      `${preset.name} subtitle is not single-line at ${viewportWidth}px`
    );
    assert.equal(
      preset.subtitleLineCount,
      1,
      `${preset.name} English subtitle used ${preset.subtitleLineCount} lines at ${viewportWidth}px`
    );
    assert.equal(
      preset.cjkSubtitleLineCount,
      1,
      `${preset.name} CJK subtitle used ${preset.cjkSubtitleLineCount} lines at ${viewportWidth}px`
    );
    assert.ok(
      preset.subtitleScrollWidth <= preset.subtitleClientWidth + 1,
      `${preset.name} English subtitle overflowed at ${viewportWidth}px`
    );
    assert.ok(
      preset.cjkSubtitleScrollWidth <= preset.cjkSubtitleClientWidth + 1,
      `${preset.name} CJK subtitle overflowed at ${viewportWidth}px`
    );
  });

  assert.match(
    css,
    /\.playback-lyric-rig\s*\{[^}]*transform-style:\s*preserve-3d/s,
    'the lyric rig must retain its 3D composition'
  );
  assert.match(
    css,
    /\.playback-lyric-layer\s*\{[^}]*color:\s*var\(--lyric-primary\)[^}]*transform-style:\s*preserve-3d/s,
    'the lyric layer must retain palette color and 3D depth'
  );
  assert.doesNotMatch(
    css,
    /\.playback-lyric-layer\s*\{[^}]*(?:line-clamp|max-height)\s*:/s,
    'the main lyric layer must not cap or line-clamp long lyrics'
  );
  assert.match(
    css,
    /\.playback-lyric-layer\s*\{[^}]*font-size:\s*var\(--lyric-fit-font-size,[^}]*white-space:\s*nowrap/s,
    '3D lyrics need a cached dynamic font size and a single-line layout'
  );
  assert.match(
    app,
    /function\s+lyricLineVisualUnits\([^)]*\)[\s\S]{0,1100}Intl\.Segmenter[\s\S]{0,1100}Extended_Pictographic/,
    'the renderer must measure CJK, Latin and emoji lyric lengths by grapheme width'
  );
  assert.match(
    app,
    /function\s+lyricLineFitMetrics\([^)]*\)[\s\S]{0,1400}availableWidth[\s\S]{0,800}fontSize/,
    '3D line fitting must derive a cached font size from the viewport and grapheme width'
  );
  assert.match(
    app,
    /function\s+lyricSubtitleFitMetrics\([^)]*\)[\s\S]{0,1400}availableWidth[\s\S]{0,800}fontSize/,
    '3D subtitle fitting must derive its own cached font size from the viewport and grapheme width'
  );
  assert.match(
    app,
    /function\s+setPlaybackLayerText\([^)]*\)[\s\S]{0,600}is-lyric-long[\s\S]{0,300}is-lyric-compact/,
    'every 3D depth layer must receive the same lyric fit class'
  );
  assert.match(
    blurRuntime,
    /flexWrap:\s*'nowrap'/,
    'the desktop Flow lyric animation must stay on one visual line'
  );
  assert.match(
    blurApkRuntime,
    /flexWrap\s*=\s*'nowrap'/,
    'the local Flow lyric fallback must stay on one visual line'
  );

  const classifyLyric = Function(
    `${functionSource('isCjkLyricGlyph')}\n`
      + `${functionSource('lyricLineVisualUnits')}\n`
      + `${functionSource('lyricLineFitMode')}\n`
      + 'return lyricLineFitMode;'
  )();
  assert.equal(classifyLyric('Stay with me'), 'standard');
  assert.equal(classifyLyric(lyricFixture), 'compact');
  assert.equal(classifyLyric(cjkLyricFixture), 'compact');
  assert.match(
    css,
    /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
    'the lyric surface must preserve the project reduced-motion contract'
  );

  if (!Number.isFinite(requestedViewportWidth)) {
    const wideResult = spawnSync(process.execPath, [process.argv[1]], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: { ...process.env, FE_3D_LYRIC_VIEWPORT: String(viewportWidths[1]) },
      maxBuffer: 8 * 1024 * 1024,
      timeout: 20000
    });
    assert.equal(wideResult.status, 0, wideResult.stderr || wideResult.stdout);
    process.stdout.write(wideResult.stdout);
  }

  console.log('3D lyric completeness regression PASS');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
