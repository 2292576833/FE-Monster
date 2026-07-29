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
const resultId = 'lyric-axis-browser-result';

const probe = String.raw`
<style>
  #bootScreen { display: none !important; }
  .app-shell, .stage { width: 100vw !important; height: 100vh !important; }
  #playbackLyricScene {
    display: grid !important;
    opacity: 1 !important;
    visibility: visible !important;
  }
</style>
<script>
(() => {
  const frame = () => new Promise((resolve) => setTimeout(resolve, 0));
  const centerX = (rect) => rect.left + rect.width / 2;
  const ownZ = (element) => {
    const transform = getComputedStyle(element).transform;
    return transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m43;
  };
  const localAxisDelta = (main, subtitle) => Math.abs(
    main.offsetLeft + main.offsetWidth / 2
    - Number.parseFloat(getComputedStyle(subtitle).left)
  );
  const localGap = (main, subtitle) => (
    subtitle.offsetTop - main.offsetTop - main.offsetHeight
  );
  const report = (payload) => {
    const output = document.createElement('pre');
    output.id = '${resultId}';
    output.textContent = JSON.stringify(payload);
    document.body.appendChild(output);
  };

  async function run() {
    const appShell = document.querySelector('.app-shell');
    const scene = document.getElementById('playbackLyricScene');
    const rig = document.getElementById('playbackLyricRig');
    const core = document.getElementById('playbackLyricCore');
    const main = document.getElementById('playbackLyricText');
    const subtitle = document.getElementById('playbackLyricSubtitle');
    const stage = document.querySelector('.stage');
    if (!appShell || !scene || !rig || !core || !main || !subtitle || !stage) {
      report({ error: 'lyric DOM is incomplete' });
      return;
    }

    stage.classList.add('is-playback-page');
    scene.hidden = false;
    scene.style.setProperty('--lyric-bounce', '0px');
    scene.querySelectorAll('.playback-lyric-layer').forEach((layer) => {
      layer.textContent = '主歌词同轴测试';
      layer.dataset.text = layer.textContent;
    });
    subtitle.textContent = '中文字幕同轴测试';
    subtitle.dataset.text = subtitle.textContent;
    const scenarios = [
      { name: 'default', shell: [], scene: [] },
      {
        name: 'rotated-scaled',
        shell: [],
        scene: [],
        vars: { '--text-preset-rotate-y': '16deg', '--lyric-scale': '1.14' }
      },
      { name: 'sonic', shell: ['has-sonic-topography'], scene: [] },
      { name: 'chladni', shell: ['has-chladni'], scene: [] },
      { name: 'cover-particles', shell: ['has-cover-particle-scene'], scene: [] },
      { name: 'free-cubes', shell: ['has-free-cubes'], scene: [] },
      { name: 'void-prism', shell: ['has-void-prism'], scene: [] },
      { name: 'book-effect', shell: [], scene: ['is-book-effect-text'] },
      { name: 'focus-echo', shell: [], scene: ['is-focus-echo-text'] },
      { name: 'depth-sway-start', shell: [], scene: ['is-depth-single-text'], time: 0 },
      { name: 'depth-sway-middle', shell: [], scene: ['is-depth-single-text'], time: 3800 },
      { name: 'rain-glass-start', shell: ['has-rain-glass-scene'], scene: ['is-rain-glass-text'], time: 0 },
      { name: 'rain-glass-middle', shell: ['has-rain-glass-scene'], scene: ['is-rain-glass-text'], time: 4200 }
    ];
    const measurements = [];

    for (const scenario of scenarios) {
      appShell.className = ['app-shell', 'is-playback-page', ...scenario.shell].join(' ');
      scene.className = ['playback-lyric-scene', ...scenario.scene].join(' ');
      scene.style.removeProperty('--text-preset-rotate-y');
      scene.style.removeProperty('--lyric-scale');
      Object.entries(scenario.vars || {}).forEach(([name, value]) => {
        scene.style.setProperty(name, value);
      });
      subtitle.style.removeProperty('top');
      subtitle.style.removeProperty('left');
      const rawMainRect = main.getBoundingClientRect();
      const rawSubtitleRect = subtitle.getBoundingClientRect();
      const rawCenterDelta = Math.abs(centerX(rawMainRect) - centerX(rawSubtitleRect));
      let topOnly = main.offsetTop + main.offsetHeight + 4;
      subtitle.style.top = topOnly + 'px';
      for (let pass = 0; pass < 2; pass += 1) {
        const topMainRect = main.getBoundingClientRect();
        const topSubtitleRect = subtitle.getBoundingClientRect();
        topOnly += 4 - (topSubtitleRect.top - topMainRect.bottom);
        subtitle.style.top = topOnly + 'px';
      }
      const topOnlyMainRect = main.getBoundingClientRect();
      const topOnlySubtitleRect = subtitle.getBoundingClientRect();
      const topOnlyCenterDelta = Math.abs(centerX(topOnlyMainRect) - centerX(topOnlySubtitleRect));
      if (typeof syncPlaybackLyricSubtitleLayout === 'function') {
        syncPlaybackLyricSubtitleLayout();
      }
      await frame();
      if (Number.isFinite(scenario.time)) {
        core.getAnimations().forEach((animation) => {
          animation.pause();
          animation.currentTime = scenario.time;
        });
        await frame();
        if (typeof syncPlaybackLyricSubtitleLayout === 'function') {
          syncPlaybackLyricSubtitleLayout();
        }
      }
      const mainRect = main.getBoundingClientRect();
      const subtitleRect = subtitle.getBoundingClientRect();
      measurements.push({
        name: scenario.name,
        rawCenterDelta: Number(rawCenterDelta.toFixed(3)),
        topOnlyCenterDelta: Number(topOnlyCenterDelta.toFixed(3)),
        centerDelta: Number(Math.abs(centerX(mainRect) - centerX(subtitleRect)).toFixed(3)),
        gap: Number((subtitleRect.top - mainRect.bottom).toFixed(3)),
        localAxisDelta: Number(localAxisDelta(main, subtitle).toFixed(3)),
        localGap: Number(localGap(main, subtitle).toFixed(3)),
        mainZ: Number(ownZ(main).toFixed(3)),
        subtitleZ: Number(ownZ(subtitle).toFixed(3)),
        sharedRig: main.closest('.playback-lyric-rig') === subtitle.closest('.playback-lyric-rig'),
        sharedCore: main.parentElement === subtitle.parentElement
      });
    }

    if (typeof updateTextPresetTransform === 'function') {
      appShell.className = 'app-shell is-playback-page';
      scene.className = 'playback-lyric-scene is-depth-single-text';
      scene.style.removeProperty('--text-preset-rotate-y');
      scene.style.removeProperty('--lyric-scale');
      subtitle.style.removeProperty('top');
      subtitle.style.removeProperty('left');
      syncPlaybackLyricSubtitleLayout();
      state.textPreset = 'depth';
      state.textPresetTransforms.depth = normalizeTextPresetTransform({
        x: 0,
        y: 0,
        rotateX: 0,
        rotateY: 16,
        rotateZ: 0,
        scale: 1.14
      });
      const originalAnimationFrame = window.requestAnimationFrame;
      window.requestAnimationFrame = (callback) => setTimeout(() => callback(performance.now()), 0);
      updateTextPresetTransform();
      await frame();
      await frame();
      window.requestAnimationFrame = originalAnimationFrame;
      const mainRect = main.getBoundingClientRect();
      const subtitleRect = subtitle.getBoundingClientRect();
      measurements.push({
        name: 'runtime-rotate-scale-update',
        centerDelta: Number(Math.abs(centerX(mainRect) - centerX(subtitleRect)).toFixed(3)),
        gap: Number((subtitleRect.top - mainRect.bottom).toFixed(3)),
        localAxisDelta: Number(localAxisDelta(main, subtitle).toFixed(3)),
        localGap: Number(localGap(main, subtitle).toFixed(3)),
        mainZ: Number(ownZ(main).toFixed(3)),
        subtitleZ: Number(ownZ(subtitle).toFixed(3)),
        sharedRig: main.closest('.playback-lyric-rig') === subtitle.closest('.playback-lyric-rig'),
        sharedCore: main.parentElement === subtitle.parentElement
      });
    }

    let dragProbe = null;
    if (
      typeof updateTextPresetTransform === 'function'
      && typeof moveTextPresetGesture === 'function'
      && typeof endTextPresetGesture === 'function'
      && typeof syncPlaybackLyricSubtitleLayout === 'function'
    ) {
      appShell.className = 'app-shell is-playback-page';
      scene.className = 'playback-lyric-scene is-depth-single-text';
      state.playbackPage = true;
      state.textPreset = 'depth';
      state.textPresetTransforms.depth = normalizeTextPresetTransform();
      state.textPresetGesture = {
        ...state.textPresetGesture,
        dragging: true,
        pending: false,
        mode: 'rotate-end',
        zone: 'tail',
        pointerId: 919,
        startX: 640,
        startY: 360,
        startOffsetX: 0,
        startOffsetY: 0,
        startRotateX: 0,
        startRotateY: 0,
        startRotateZ: 0
      };
      subtitle.style.removeProperty('top');
      subtitle.style.removeProperty('left');
      syncPlaybackLyricSubtitleLayout();
      await frame();

      const samples = [];
      const dragPoints = [
        [668, 346],
        [706, 382],
        [748, 328],
        [792, 404],
        [724, 442],
        [654, 390]
      ];
      for (const [clientX, clientY] of dragPoints) {
        moveTextPresetGesture({ pointerId: 919, clientX, clientY });
        await frame();
        await frame();
        const computedSubtitle = getComputedStyle(subtitle);
        const mainLocalAxis = main.offsetLeft + main.offsetWidth / 2;
        samples.push({
          left: subtitle.style.left,
          top: subtitle.style.top,
          localAxisDelta: Number(
            Math.abs(mainLocalAxis - Number.parseFloat(computedSubtitle.left)).toFixed(3)
          )
        });
      }
      setPlaybackLyricLine(
        'Rigid lyric drag test',
        'Rigid subtitle drag test',
        0.42
      );
      await frame();
      const flipDuringDrag = {
        main: !!main.__lyricGeometryFlip,
        subtitle: !!subtitle.__lyricGeometryFlip
      };
      subtitle.style.top = '1px';
      const expectedFinalTop = (
        (
          main.offsetTop
          + main.offsetHeight
          + normalizeTextComposerSettings(state.textComposerSettings).translationGap
        ).toFixed(2)
        + 'px'
      );
      endTextPresetGesture({ pointerId: 919, clientX: 654, clientY: 390 });
      await frame();
      await frame();
      dragProbe = {
        samples,
        flipDuringDrag,
        expectedFinalTop,
        finalLeft: subtitle.style.left,
        finalTop: subtitle.style.top
      };
    }
    report({ measurements, dragProbe });
  }

  setTimeout(() => run().catch((error) => report({ error: error.stack || error.message })), 50);
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
const profileDir = mkdtempSync(path.join(tmpdir(), 'fe-monster-lyric-axis-'));
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
  assert.ok(profileDir.startsWith(path.join(tmpdir(), 'fe-monster-lyric-axis-')));
  rmSync(profileDir, { recursive: true, force: true });
}

const resultMatch = stdout.match(new RegExp(`<pre id="${resultId}">([\\s\\S]*?)<\\/pre>`));
assert.ok(
  resultMatch,
  `headless browser did not return the lyric-axis measurement:\n${stdout.slice(-2000)}`
);
const payload = JSON.parse(resultMatch[1]
  .replaceAll('&quot;', '"')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&amp;', '&'));
assert.equal(payload.error, undefined, payload.error);

const failures = payload.measurements.filter((measurement) => (
  measurement.localAxisDelta > 0.51
  || Math.abs(measurement.localGap - 4) > 0.01
  || Math.abs(measurement.mainZ - measurement.subtitleZ) > 0.01
  || !measurement.sharedRig
  || !measurement.sharedCore
));
assert.deepEqual(failures, [], `3D lyric/subtitle axis mismatch:\n${JSON.stringify(failures, null, 2)}`);
assert.ok(payload.dragProbe, '3D lyric drag probe did not run');
assert.ok(
  payload.dragProbe.samples.every((sample) => sample.left === '' && sample.localAxisDelta <= 0.51),
  `subtitle left axis was screen-space compensated during lyric rotation drag:\n${JSON.stringify(payload.dragProbe, null, 2)}`
);
assert.equal(
  new Set(payload.dragProbe.samples.map((sample) => sample.top)).size,
  1,
  `subtitle local top changed during lyric rotation drag:\n${JSON.stringify(payload.dragProbe, null, 2)}`
);
assert.deepEqual(
  payload.dragProbe.flipDuringDrag,
  { main: false, subtitle: false },
  `main lyric and subtitle must not run independent FLIP animations during a rotation drag:\n${
    JSON.stringify(payload.dragProbe, null, 2)
  }`
);
assert.equal(
  Number.parseFloat(payload.dragProbe.finalTop),
  Number.parseFloat(payload.dragProbe.expectedFinalTop),
  `subtitle should be calibrated once in local coordinates when lyric rotation drag ends:\n${
    JSON.stringify(payload.dragProbe, null, 2)
  }`
);

console.log(JSON.stringify({
  ok: true,
  viewport: '1280x720',
  measurements: payload.measurements,
  dragProbe: payload.dragProbe
}, null, 2));
