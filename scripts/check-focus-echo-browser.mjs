import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const cssPath = path.join(root, 'web', 'styles.css');
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = browserCandidates.find((candidate) => fs.existsSync(candidate));
assert.ok(browserPath, 'Chromium is required for the focus-echo browser regression');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-focus-echo-'));
const fixturePath = path.join(tempRoot, 'fixture.html');
const profilePath = path.join(tempRoot, 'profile');
const lyric = '你看着我眼睛';
const focusLyric = '看着我';

const layers = Array.from({ length: 6 }, (_, depth) => `
  <span
    id="depth${depth}"
    class="playback-lyric-layer lyric-depth-${depth}${depth > 0 && depth <= 3 ? ' is-text-composer-layer-visible' : ''}"
    data-text="${depth === 0 ? lyric : focusLyric}"
    style="--lyric-fit-font-size:${depth === 0 ? 38 : 72}px"
  >${depth === 0 ? lyric : focusLyric}</span>`).join('');

const fixture = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <link rel="stylesheet" href="${pathToFileURL(cssPath).href}">
    <style>
      html, body { width: 100%; height: 100%; margin: 0; background: #02060a; overflow: hidden; }
      .playback-lyric-scene { visibility: visible !important; opacity: 1 !important; }
    </style>
  </head>
  <body>
    <main class="app-shell">
      <section
        id="scene"
        class="playback-lyric-scene is-focus-echo-text"
        style="--lyric-duration:800ms;--text-letter-spacing:2.5px"
      >
        <div class="playback-lyric-rig">
          <div class="playback-lyric-core">${layers}</div>
        </div>
      </section>
    </main>
    <script>
      const scene = document.getElementById('scene');
      const elements = Array.from({ length: 6 }, (_, depth) => document.getElementById('depth' + depth));
      const snapshot = () => elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          display: style.display,
          color: style.color,
          opacity: Number(style.opacity),
          filter: style.filter,
          transform: style.transform,
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          animationDelay: style.animationDelay,
          fontSize: style.fontSize
        };
      });
      const blurPixels = (value) => Number.parseFloat(String(value).match(/blur\\(([-.0-9]+)px\\)/)?.[1] || 0);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const stable = snapshot();
        const after = getComputedStyle(elements[0], '::after');
        scene.classList.add('is-focus-echo-entering');
        setTimeout(() => {
          const entry = snapshot();
          setTimeout(() => {
            const middle = snapshot();
            setTimeout(() => {
              const settled = snapshot();
              scene.classList.remove('is-focus-echo-entering');
              elements[2].classList.remove('is-text-composer-layer-visible');
              elements[4].classList.add('is-text-composer-layer-visible');
              const toggled = snapshot();
              document.body.dataset.metrics = JSON.stringify({
                stable,
                entry,
                middle,
                settled,
                toggled,
                pseudo: {
                  display: after.display,
                  content: after.content,
                  backgroundImage: after.backgroundImage
                },
                blur: {
                  entryMain: blurPixels(entry[0].filter),
                  middleMain: blurPixels(middle[0].filter),
                  settledMain: blurPixels(settled[0].filter),
                  stableEchoes: stable.slice(1, 4).map((item) => blurPixels(item.filter)),
                  entryEcho: blurPixels(entry[1].filter),
                  toggledFourth: blurPixels(toggled[4].filter)
                }
              });
            }, 650);
          }, 340);
        }, 60);
      }));
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
    '--virtual-time-budget=1700',
    '--window-size=1280,720',
    `--user-data-dir=${profilePath}`,
    '--dump-dom',
    pathToFileURL(fixturePath).href
  ], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 20000
  });
  assert.equal(result.status, 0, result.stderr || 'Chromium focus-echo fixture failed');
  const metricsAttribute = result.stdout.match(/data-metrics="([^"]+)"/)?.[1];
  assert.ok(metricsAttribute, `Chromium did not return focus-echo metrics:\n${result.stdout.slice(-1200)}`);
  const metrics = JSON.parse(
    metricsAttribute
      .replaceAll('&quot;', '"')
      .replaceAll('&amp;', '&')
  );
  console.log(JSON.stringify(metrics, null, 2));

  assert.match(metrics.stable[0].color, /rgba?\(/, 'the stable main phrase has no visible palette color');
  assert.equal(metrics.stable[0].opacity, 1, 'the stable main phrase is not fully opaque');
  assert.equal(metrics.blur.settledMain, 0, 'the main phrase did not settle to zero blur');
  assert.deepEqual(
    metrics.stable.slice(1, 4).map((item) => item.display),
    ['block', 'block', 'block'],
    'the default three echo layers are not visible'
  );
  assert.deepEqual(
    metrics.stable.slice(4, 6).map((item) => item.display),
    ['none', 'none'],
    'unselected echo layers are visible'
  );
  assert.ok(
    metrics.blur.stableEchoes[0] >= 4.7
      && metrics.blur.stableEchoes[1] >= 8.4
      && metrics.blur.stableEchoes[2] >= 12.9,
    `stable echo blur is not stepped: ${metrics.blur.stableEchoes.join(', ')}`
  );
  assert.ok(
    metrics.blur.entryMain > metrics.blur.middleMain
      && metrics.blur.middleMain > metrics.blur.settledMain,
    'the main phrase does not progressively refocus'
  );
  assert.ok(
    metrics.blur.entryEcho > metrics.blur.stableEchoes[0],
    'the near echo does not spread outward during entry'
  );
  assert.match(metrics.entry[0].animationName, /focusEchoConverge/, 'the main entry animation is not active');
  assert.match(metrics.entry[1].animationName, /focusEchoShadowSettle/, 'the echo entry animation is not active');
  assert.equal(metrics.entry[0].animationDuration, '0.8s', 'the 800ms reference timing was not applied');
  assert.equal(metrics.entry[0].animationDelay, '0.16s', 'the dark focus phrase does not lead the main phrase');
  assert.equal(metrics.stable[0].fontSize, '38px', 'the main phrase lost its fitted reference size');
  assert.equal(metrics.stable[1].fontSize, '72px', 'the focus phrase lost its independent larger fit');
  assert.deepEqual(
    metrics.stable.slice(1, 4).map((item) => Number(item.opacity.toFixed(3))),
    [0.24, 0.15, 0.09],
    'the dark echo opacity no longer matches the subtle reference layers'
  );
  assert.equal(metrics.pseudo.display, 'none', 'the rolling highlight pseudo-element is visible');
  assert.ok(metrics.pseudo.content === 'none' || metrics.pseudo.content === 'normal', 'the rolling highlight still owns text content');
  assert.equal(metrics.toggled[2].display, 'none', 'removing an echo-layer class did not hide it');
  assert.equal(metrics.toggled[4].display, 'block', 'adding an echo-layer class did not reveal it');
  assert.ok(metrics.blur.toggledFourth >= 17.9, 'the optional fourth echo lost its spatial blur profile');

  console.log('Focus echo browser regression PASS');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
