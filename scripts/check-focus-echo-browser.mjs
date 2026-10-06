import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const resultId = 'focus-echo-browser-result';
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = browserCandidates.find((candidate) => fs.existsSync(candidate));
assert.ok(browserPath, 'Chromium is required for the focus-echo browser regression');

const probe = String.raw`
<style>
  #bootScreen { display: none !important; }
  .app-shell, .stage { width: 100vw !important; height: 100vh !important; }
  #playbackLyricScene {
    display: grid !important;
    visibility: visible !important;
    opacity: 1 !important;
  }
</style>
<script>
(() => {
  const task = (delay = 0) => new Promise((resolve) => setTimeout(resolve, delay));
  const report = (payload) => {
    const output = document.createElement('pre');
    output.id = '${resultId}';
    output.textContent = JSON.stringify(payload);
    document.body.appendChild(output);
  };
  const round = (value) => Number(Number(value).toFixed(3));
  const blurPixels = (value) => round(String(value).match(/blur\(([-.0-9]+)px\)/)?.[1] || 0);
  const animationTimes = (animations) => animations.map((animation) => round(animation.currentTime));
  const percentile = (values, ratio) => {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] || 0;
  };

  async function run() {
    const bootWaitStartedAt = performance.now();
    while (document.documentElement.dataset.interactiveServices !== 'started') {
      if (performance.now() - bootWaitStartedAt > 2000) {
        throw new Error('application bootstrap did not reach interactive state');
      }
      await task(20);
    }
    // Let the final bootstrap render settle before the probe owns the lyric
    // state. Otherwise the asynchronous init chain can overwrite the probe's
    // selected layers and replace its paused WAAPI timeline mid-assertion.
    await task();

    const required = [
      'disposeFocusEchoTransition',
      'focusEchoTransitionDurationMs',
      'startFocusEchoTransition',
      'syncFocusEchoTransition'
    ];
    const missing = required.filter((name) => typeof globalThis[name] !== 'function'
      && typeof eval(name) !== 'function');
    if (missing.length) {
      report({ error: 'missing focus-echo WAAPI runtime: ' + missing.join(', ') });
      return;
    }

    const scene = document.getElementById('playbackLyricScene');
    const stage = document.querySelector('.stage');
    const layers = Array.from({ length: 6 }, (_, depth) => (
      document.querySelector('.lyric-depth-' + depth)
    ));
    if (!scene || !stage || layers.some((layer) => !layer)) {
      report({ error: 'focus-echo lyric DOM is incomplete' });
      return;
    }

    stage.classList.add('is-playback-page');
    scene.hidden = false;
    scene.className = 'playback-lyric-scene is-focus-echo-text';
    scene.style.setProperty('--lyric-duration', '800ms');
    scene.style.setProperty('--lyric-bounce', '0px');
    scene.style.setProperty('--text-letter-spacing', '2.5px');
    state.textPreset = 'focus-echo';
    state.sandbox.open = true;
    if (state.orb?.animationFrame) {
      cancelAnimationFrame(state.orb.animationFrame);
      state.orb.animationFrame = 0;
    }
    state.lyricLines = [{ time: 10, endTime: 12, text: '你看着我眼睛', focusText: '看着我' }];
    state.lyricIndex = 0;
    layers.forEach((layer, depth) => {
      layer.textContent = depth === 0 ? '你看着我眼睛' : '看着我';
      layer.dataset.text = layer.textContent;
      layer.classList.toggle('is-text-composer-layer-visible', depth > 0 && depth <= 3);
      layer.style.setProperty('--lyric-fit-font-size', depth === 0 ? '38px' : '72px');
    });

    const snapshot = () => layers.map((element) => {
      const style = getComputedStyle(element);
      return {
        display: style.display,
        opacity: round(style.opacity),
        filter: style.filter,
        blur: blurPixels(style.filter),
        transform: style.transform,
        letterSpacing: style.letterSpacing,
        animationName: style.animationName,
        animationDelay: style.animationDelay,
        fontSize: style.fontSize
      };
    });
    const focusAnimations = () => (state.focusEchoTransition?.animations || [])
      .map(({ animation }) => animation);

    disposeFocusEchoTransition();
    layers.flatMap((layer) => layer.getAnimations()).forEach((animation) => animation.cancel());
    const stable = snapshot();
    const pseudo = getComputedStyle(layers[0], '::after');
    layers[2].classList.remove('is-text-composer-layer-visible');
    layers[4].classList.add('is-text-composer-layer-visible');
    const toggled = snapshot();
    layers[2].classList.add('is-text-composer-layer-visible');
    layers[4].classList.remove('is-text-composer-layer-visible');

    startFocusEchoTransition(10, 0);
    await task();
    const animations = focusAnimations();
    const entry = snapshot();
    const entryPlayStates = animations.map((animation) => animation.playState);
    const entryTimes = animationTimes(animations);
    const wallFreezeBefore = animationTimes(animations);
    await task(140);
    const wallFreezeAfter = animationTimes(animations);

    syncFocusEchoTransition(10.11);
    await task();
    const audibleOnset = snapshot();
    const audibleOnsetTimes = animationTimes(animations);
    syncFocusEchoTransition(10.20);
    await task();
    const middle = snapshot();
    const middleTimes = animationTimes(animations);
    syncFocusEchoTransition(10.36);
    await task();
    const seekForwardTimes = animationTimes(animations);
    syncFocusEchoTransition(10.04);
    await task();
    const seekBackwardTimes = animationTimes(animations);
    syncFocusEchoTransition(10.24);
    await task();
    const doubleRateTimes = animationTimes(animations);
    syncFocusEchoTransition(10.52);
    await task();
    const settled = snapshot();

    state.lyricLines[0] = { ...state.lyricLines[0], time: 30, endTime: 32 };
    startFocusEchoTransition(30, 0);
    const frameIntervals = [];
    const syncCosts = [];
    const frameSources = { raf: 0, timer: 0 };
    await new Promise((resolve) => {
      let frame = 0;
      let previousFrameAt = Number.NaN;
      const queueFrame = () => {
        setTimeout(() => {
          frameSources.timer += 1;
          sampleFrame(performance.now());
        }, 17);
      };
      const sampleFrame = (frameAt) => {
        if (Number.isFinite(previousFrameAt)) frameIntervals.push(frameAt - previousFrameAt);
        previousFrameAt = frameAt;
        const startedAt = performance.now();
        syncFocusEchoTransition(30 + frame / 60);
        syncCosts.push(performance.now() - startedAt);
        frame += 1;
        if (frame >= 31) resolve();
        else queueFrame();
      };
      queueFrame();
    });

    const animationRecords = animations.map((animation) => {
      const timing = animation.effect.getTiming();
      const keyframes = animation.effect.getKeyframes();
      const animatedProperties = Array.from(new Set(keyframes.flatMap((keyframe) => (
        Object.keys(keyframe).filter((key) => ![
          'offset', 'computedOffset', 'easing', 'composite'
        ].includes(key))
      ))));
      return {
        target: animation.effect.target?.id || '',
        playState: animation.playState,
        duration: round(timing.duration),
        delay: round(timing.delay),
        endTime: round(Number(timing.duration) + Number(timing.delay)),
        animatedProperties
      };
    });

    report({
      stable,
      toggled,
      entry,
      middle,
      settled,
      entryTimes,
      entryPlayStates,
      middleTimes,
      seekForwardTimes,
      seekBackwardTimes,
      doubleRateTimes,
      wallFreezeBefore,
      wallFreezeAfter,
      audibleOnset,
      audibleOnsetTimes,
      animationRecords,
      performance: {
        frameIntervalP95: round(percentile(frameIntervals, 0.95)),
        syncCostP95: round(percentile(syncCosts, 0.95)),
        maximumSyncCost: round(Math.max(...syncCosts)),
        frameSources
      },
      duration: focusEchoTransitionDurationMs(),
      preEntryMs: round((
        playbackLyricVisualLeadSeconds() - LYRIC_TIMESTAMP_COMPENSATION_SECONDS
      ) * 1000),
      pseudo: { display: pseudo.display, content: pseudo.content }
    });
  }

  void run().catch((error) => report({ error: error.stack || error.message }));
})();
</script>`;

const originalHtml = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
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
  const base = pathname.startsWith('/components/') ? root : webRoot;
  const filePath = path.resolve(base, `.${pathname}`);
  if (!filePath.startsWith(base + path.sep)) {
    response.writeHead(403);
    response.end();
    return;
  }
  try {
    const body = fs.readFileSync(filePath);
    response.writeHead(200, { 'content-type': contentType(filePath) });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-focus-echo-'));
let stdout = '';
try {
  const address = server.address();
  const result = await execFileAsync(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--metrics-recording-only',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profilePath}`,
    '--window-size=1280,720',
    '--virtual-time-budget=4000',
    '--dump-dom',
    `http://127.0.0.1:${address.port}/?client=desktop-scene`
  ], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 30000,
    windowsHide: true
  });
  stdout = result.stdout;
} finally {
  await new Promise((resolve) => server.close(resolve));
  assert.ok(profilePath.startsWith(path.join(os.tmpdir(), 'fe-focus-echo-')));
  fs.rmSync(profilePath, { recursive: true, force: true });
}

const resultMatch = stdout.match(new RegExp(`<pre id="${resultId}">([\\s\\S]*?)<\\/pre>`));
assert.ok(resultMatch, `headless browser did not return focus-echo metrics:\n${stdout.slice(-2000)}`);
const metrics = JSON.parse(resultMatch[1]
  .replaceAll('&quot;', '"')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&amp;', '&'));
assert.equal(metrics.error, undefined, metrics.error);
if (process.env.FE_DEBUG_FOCUS_ECHO === '1') {
  console.log(JSON.stringify(metrics, null, 2));
}

assert.equal(metrics.preEntryMs, 0, `visual pre-entry must be zero, received ${metrics.preEntryMs}ms`);
assert.ok(metrics.duration >= 420 && metrics.duration <= 480, `duration is ${metrics.duration}ms`);
assert.ok(metrics.animationRecords.length >= 4, 'main + three selected echo layers did not receive WAAPI animations');
assert.ok(metrics.entryPlayStates.every((playState) => playState === 'paused'), 'focus WAAPI animations are not paused');
assert.ok(metrics.animationRecords.every((record) => record.playState === 'idle'), 'settled focus animations were not disposed');
assert.ok(
  metrics.animationRecords.every((record) => record.duration >= 420 && record.duration <= 480),
  `animation durations escaped 420-480ms: ${JSON.stringify(metrics.animationRecords)}`
);
assert.ok(
  metrics.animationRecords.every((record) => record.delay !== 160 && record.delay % 20 === 0),
  `animations contain a 160ms delay or non-20ms stagger: ${JSON.stringify(metrics.animationRecords)}`
);
assert.ok(
  Math.max(...metrics.animationRecords.map((record) => record.endTime)) <= 520,
  `focus echo settles after 520ms: ${JSON.stringify(metrics.animationRecords)}`
);
assert.ok(
  metrics.animationRecords.every((record) => record.animatedProperties.length > 0
    && record.animatedProperties.every((property) => ['transform', 'opacity'].includes(property))),
  `focus keyframes animate paint-heavy properties: ${JSON.stringify(metrics.animationRecords)}`
);

assert.deepEqual(metrics.wallFreezeAfter, metrics.wallFreezeBefore, 'paused phase advanced with wall-clock time');
assert.ok(metrics.audibleOnset[0].opacity >= 0.85, `main phrase opacity at audible onset is ${metrics.audibleOnset[0].opacity}`);
assert.ok(metrics.audibleOnset[0].blur <= 1, `main phrase blur at audible onset is ${metrics.audibleOnset[0].blur}px`);
assert.ok(metrics.audibleOnsetTimes.every((time) => Math.abs(time - 110) <= 0.1), `audible-onset phase mismatch: ${metrics.audibleOnsetTimes}`);
assert.ok(metrics.entryTimes.every((time) => Math.abs(time) <= 0.01), `entry phase is not zero: ${metrics.entryTimes}`);
assert.ok(metrics.middleTimes.every((time) => Math.abs(time - 200) <= 0.1), `200ms phase mismatch: ${metrics.middleTimes}`);
assert.ok(metrics.seekForwardTimes.every((time) => Math.abs(time - 360) <= 0.1), `forward seek mismatch: ${metrics.seekForwardTimes}`);
assert.ok(metrics.seekBackwardTimes.every((time) => Math.abs(time - 40) <= 0.1), `backward seek mismatch: ${metrics.seekBackwardTimes}`);
assert.ok(metrics.doubleRateTimes.every((time) => Math.abs(time - 240) <= 0.1), `2x media-time phase mismatch: ${metrics.doubleRateTimes}`);

assert.equal(metrics.stable[0].opacity, 1, 'stable main phrase is not opaque');
assert.equal(metrics.stable[0].blur, 0, 'stable main phrase is not sharp');
assert.deepEqual(metrics.stable.slice(1, 4).map((item) => item.display), ['block', 'block', 'block']);
assert.deepEqual(metrics.stable.slice(4, 6).map((item) => item.display), ['none', 'none']);
assert.deepEqual(metrics.stable.slice(1, 4).map((item) => item.opacity), [0.24, 0.15, 0.09]);
assert.ok(
  metrics.stable[1].blur >= 4.7 && metrics.stable[2].blur >= 8.4 && metrics.stable[3].blur >= 12.9,
  `stable echo blur is not stepped: ${metrics.stable.slice(1, 4).map((item) => item.blur)}`
);
assert.equal(metrics.stable[0].fontSize, '38px', 'main phrase lost its independent fit');
assert.equal(metrics.stable[1].fontSize, '72px', 'focus phrase lost its independent fit');
assert.equal(metrics.toggled[2].display, 'none', 'removing a selected echo class did not hide it');
assert.equal(metrics.toggled[4].display, 'block', 'adding an optional echo class did not reveal it');
assert.equal(metrics.pseudo.display, 'none', 'rolling-highlight pseudo-element is visible');
assert.ok(metrics.pseudo.content === 'none' || metrics.pseudo.content === 'normal');

for (const phase of [metrics.entry, metrics.middle, metrics.settled]) {
  assert.ok(phase.every((item) => item.animationName === 'none'), 'CSS focus animation is still active');
}
assert.deepEqual(
  [metrics.entry, metrics.middle, metrics.settled].map((phase) => phase.map((item) => item.filter)),
  [metrics.stable, metrics.stable, metrics.stable].map((phase) => phase.map((item) => item.filter)),
  'filter changed frame-by-frame instead of remaining a static spatial profile'
);
assert.deepEqual(
  [metrics.entry, metrics.middle, metrics.settled].map((phase) => phase.map((item) => item.letterSpacing)),
  [metrics.stable, metrics.stable, metrics.stable].map((phase) => phase.map((item) => item.letterSpacing)),
  'letter-spacing changed frame-by-frame'
);
assert.notEqual(metrics.entry[0].transform, metrics.settled[0].transform, 'main phrase has no convergence transform');
assert.ok(metrics.entry[0].opacity < metrics.middle[0].opacity, 'main phrase does not progressively appear');
assert.ok(metrics.performance.frameIntervalP95 <= 18.5, `60Hz frame interval p95 is ${metrics.performance.frameIntervalP95}ms`);
assert.ok(metrics.performance.syncCostP95 <= 2.5, `focus phase sync cost p95 is ${metrics.performance.syncCostP95}ms`);

console.log(JSON.stringify({
  ok: true,
  preEntryMs: metrics.preEntryMs,
  durationMs: metrics.duration,
  animationCount: metrics.animationRecords.length,
  maximumEndTimeMs: Math.max(...metrics.animationRecords.map((record) => record.endTime)),
  animatedProperties: Array.from(new Set(
    metrics.animationRecords.flatMap((record) => record.animatedProperties)
  )),
  wallClockPhaseDriftMs: Math.max(...metrics.wallFreezeAfter.map((value, index) => (
    Math.abs(value - metrics.wallFreezeBefore[index])
  ))),
  mediaTimelinePhasesMs: {
    entry: metrics.entryTimes[0],
    audibleOnset: metrics.audibleOnsetTimes[0],
    middle: metrics.middleTimes[0],
    seekForward: metrics.seekForwardTimes[0],
    seekBackward: metrics.seekBackwardTimes[0],
    doubleRate: metrics.doubleRateTimes[0]
  },
  stableEchoBlurPx: metrics.stable.slice(1, 4).map((item) => item.blur),
  performance: metrics.performance
}, null, 2));
