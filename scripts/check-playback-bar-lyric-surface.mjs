import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

// The new playback bar shows the lyric text directly on its own glass panel.
// No well, tint, border, vignette, plate or inner frame may sit behind the
// lyrics, and the lyric area must paint nothing but text.
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output/playwright/playback-bar-lyric-surface');
mkdirSync(output, { recursive: true });
const require = createRequire(import.meta.url);
let chromium;
for (const candidate of [
  process.env.PLAYWRIGHT_MODULE_PATH,
  'playwright',
  path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch {}
}
assert.ok(chromium, 'Playwright is required');

const rate = 8000;
const samples = rate * 8;
const tone = Buffer.alloc(44 + samples * 2);
tone.write('RIFF', 0); tone.writeUInt32LE(tone.length - 8, 4);
tone.write('WAVEfmt ', 8); tone.writeUInt32LE(16, 16);
tone.writeUInt16LE(1, 20); tone.writeUInt16LE(1, 22);
tone.writeUInt32LE(rate, 24); tone.writeUInt32LE(rate * 2, 28);
tone.writeUInt16LE(2, 32); tone.writeUInt16LE(16, 34);
tone.write('data', 36); tone.writeUInt32LE(samples * 2, 40);

const queue = [0, 1].map((index) => ({
  id: `queue-${index}`, title: `队列歌曲 ${index}`, artist: `队列歌手 ${index}`,
  album: `队列专辑 ${index}`, provider: 'netease', duration: 8
}));
const lyricText = ['[00:00.00]夜色先落下来', '[00:01.20]风把城市吹成海', '[00:02.40]我在句子的缝隙里',
  '[00:03.60]等一句没有说完的对白', '[00:04.80]海浪翻过旧站台'].join('\n');
const fixtures = {
  '/api/music-apis': { ok: true, providers: [{ id: 'netease', label: '网易云', enabled: true, configured: true, status: 'ready', baseUrl: 'http://127.0.0.1:1/netease' }] },
  '/api/login/status': { ok: true, provider: 'netease', loggedIn: false, account: {} },
  '/api/app/achievements': { version: 2, progress: {}, unlocked: {}, themes: { page: 'classic', toast: 'classic' },
    settings: { soundEnabled: true }, ornaments: { claimed: {}, equipped: { achievementId: null, changedAt: 0 } },
    _sync: { scope: 'anonymous', provider: 'netease', remoteRequired: false, serverSynced: true } },
  '/api/lyric': { lrc: { lyric: lyricText } },
  '/data/android-bundled-library.json': { playlists: [], songs: [] }
};
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav',
  '.webp': 'image/webp', '.jpg': 'image/jpeg' };

let current = queue[0];
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture');
  const pathname = decodeURIComponent(url.pathname);
  const json = (value) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)); };
  if (pathname === '/fixture-tone.wav') {
    response.setHeader('Content-Type', 'audio/wav');
    response.setHeader('Accept-Ranges', 'bytes');
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), tone.length - 1) : tone.length - 1;
    if (start > end || start >= tone.length) {
      response.writeHead(416, { 'Content-Range': `bytes */${tone.length}` });
      response.end(); return;
    }
    if (range) response.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${tone.length}`, 'Content-Length': end - start + 1
    });
    else response.setHeader('Content-Length', tone.length);
    response.end(tone.subarray(start, end + 1)); return;
  }
  if (pathname === '/api/app/preferences/bootstrap.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(''); return; }
  if (pathname === '/api/app/preferences' || pathname === '/api/app/preferences/cloud-sync') return json({ ok: true });
  if (pathname === '/api/player/state') {
    return json({ ok: true, song: current, volume: 0.8, playing: false, paused: true, position: 0,
      duration: current.duration, queue, queueLength: queue.length, queueRevision: 1, queueIndex: 0 });
  }
  if (pathname === '/api/player/load') {
    const id = url.searchParams.get('id');
    current = queue.find((item) => item.id === id) || queue[0];
    return json({ playable: true, url: `/fixture-tone.wav?id=${encodeURIComponent(current.id)}`, song: current, quality: 'fixture' });
  }
  if (pathname.startsWith('/api/')) return json(fixtures[pathname] || { ok: true });
  if (pathname === '/data/android-bundled-library.json') return json({ playlists: [], songs: [] });
  const file = path.resolve(pathname.startsWith('/components/') ? root : path.join(root, 'web'),
    pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file.startsWith(root + path.sep) || !existsSync(file)) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  response.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const errors = [];
const evidence = {};
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(!existsSync(chromium.executablePath()) && edge ? { executablePath: edge } : {}),
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--mute-audio',
      '--autoplay-policy=no-user-gesture-required', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])]
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => {
    if (response.status() >= 400) console.error(`fixture ${response.status()} ${response.url()}`);
  });
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof playQueueIndex === 'function', null, { timeout: 30000 });
  const boot = page.locator('#bootLogoButton');
  if (await boot.count() && await boot.isVisible()) {
    await page.waitForFunction(() => !document.getElementById('bootLogoButton')?.disabled, null, { timeout: 20000 });
    await boot.click();
  }
  await page.waitForFunction(() => document.getElementById('bootScreen')?.hidden, null, { timeout: 20000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    if (typeof clearBackgroundPolling === 'function') clearBackgroundPolling();
    if (typeof clearRealtimePolling === 'function') clearRealtimePolling();
    if (typeof enterPresetPlaybackPage === 'function') enterPresetPlaybackPage('lyric');
  });
  await page.waitForTimeout(400);
  await page.evaluate(async () => {
    els.audio.muted = true;
    state.audioSourceSelectionKnown = true;
    state.audioSourceSelection = { id: 'builtin', builtin: true, name: '内置音源', supportedProviders: [] };
    await playQueueIndex(0);
  });
  await page.waitForFunction(() => document.querySelectorAll('#qishuiPlaybackLyricPage .qishui-playback-lyric-line').length > 1,
    null, { timeout: 20000 });
  await page.waitForTimeout(600);

  // The player keeps clear glass only, without tinting other glass consumers.
  evidence.glassSurface = await page.evaluate(async () => {
    const panel = document.querySelector('#qishuiPlaybackPhone .qishui-playback-ambient');
    const source = document.querySelector('link[href*="/components/GlassSurface.css"]');
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-10000px;width:100px;height:100px;visibility:hidden;pointer-events:none';
    const ready = new Promise((resolve) => { frame.onload = resolve; });
    frame.srcdoc = `<link rel="stylesheet" href="${source.href}"><div id="reference"></div><div id="defaults"></div>`;
    document.body.appendChild(frame);
    const originalClasses = panel.className;
    try {
      await ready;
      const reference = frame.contentDocument.getElementById('reference');
      const defaults = frame.contentDocument.getElementById('defaults');
      for (const property of ['--filter-id']) {
        reference.style.setProperty(property, getComputedStyle(panel).getPropertyValue(property));
      }
      const properties = ['backgroundColor', 'backgroundImage', 'backdropFilter', 'boxShadow',
        'borderTopWidth', 'borderTopStyle', 'borderTopColor'];
      const read = (style) => Object.fromEntries(properties.map((property) => [property,
        property === 'borderTopColor' && style.borderTopWidth === '0px' ? 'none' : style[property]]));
      return ['svg', 'fallback'].map((mode) => {
        panel.classList.remove('glass-surface--svg', 'glass-surface--fallback');
        panel.classList.add(`glass-surface--${mode}`);
        reference.className = `glass-surface glass-surface--${mode}`;
        defaults.className = reference.className;
        reference.style.background = 'none';
        reference.style.border = '0';
        reference.style.boxShadow = 'none';
        reference.style.backdropFilter = mode === 'svg' ? 'var(--filter-id, url(#glass-filter))' : 'blur(24px)';
        return { mode, actual: read(getComputedStyle(panel)),
          expected: read(frame.contentWindow.getComputedStyle(reference)),
          defaults: read(frame.contentWindow.getComputedStyle(defaults)),
          pointerEvents: getComputedStyle(panel).pointerEvents,
          backdropImage: getComputedStyle(panel.querySelector('img')).display };
      });
    } finally {
      panel.className = originalClasses;
      frame.remove();
    }
  });
  for (const surface of evidence.glassSurface) {
    assert.deepEqual(surface.actual, surface.expected,
      `${surface.mode}: playback panel must retain only transparent blur/refraction`);
    assert.equal(surface.defaults.backgroundColor, 'rgba(0, 0, 0, 0.74)',
      'the shared glass default must stay unchanged for other panels');
    assert.match(surface.defaults.backdropFilter, /brightness\(0\.82\)/);
    assert.equal(surface.actual.backgroundColor, 'rgba(0, 0, 0, 0)');
    assert.equal(surface.actual.backgroundImage, 'none', 'the panel must not add gradient colors');
    assert.equal(surface.actual.boxShadow, 'none', 'the panel must not add colored shadows');
    assert.doesNotMatch(surface.actual.backdropFilter, /brightness|saturate/,
      'the panel must not recolor or dim its backdrop');
    assert.equal(surface.pointerEvents, 'none', 'the panel must not intercept player input');
    assert.equal(surface.backdropImage, 'none', 'cover imagery must not tint the glass material');
  }

  const layers = await page.evaluate(() => {
    const read = (node, pseudo = null) => {
      const style = getComputedStyle(node, pseudo);
      return {
        background: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderWidths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
        boxShadow: style.boxShadow,
        borderRadius: style.borderRadius,
        filter: style.filter,
        content: pseudo ? style.content : '',
        display: style.display
      };
    };
    const well = document.getElementById('qishuiPlaybackLyrics');
    const page_ = document.getElementById('qishuiPlaybackLyricPage');
    const line = document.querySelector('#qishuiPlaybackLyricPage .qishui-playback-lyric-line');
    const current = document.querySelector('#qishuiPlaybackLyricPage .qishui-playback-lyric-line.is-current');
    return {
      well: read(well), wellBefore: read(well, '::before'), wellAfter: read(well, '::after'),
      page: read(page_), pageBefore: read(page_, '::before'), pageAfter: read(page_, '::after'),
      line: read(line), lineBefore: read(line, '::before'), lineAfter: read(line, '::after'),
      currentLine: read(current), currentBefore: read(current, '::before'), currentAfter: read(current, '::after'),
      lineCount: document.querySelectorAll('#qishuiPlaybackLyricPage .qishui-playback-lyric-line').length,
      wellRect: (() => { const rect = well.getBoundingClientRect(); return [rect.x, rect.y, rect.width, rect.height]; })(),
      phoneRect: (() => { const rect = document.getElementById('qishuiPlaybackPhone').getBoundingClientRect(); return [rect.x, rect.y, rect.width, rect.height]; })()
    };
  });
  const paintFree = (layer) => layer.background === 'rgba(0, 0, 0, 0)'
    && layer.backgroundImage === 'none'
    && layer.borderWidths.every((width) => width === '0px')
    && layer.boxShadow === 'none'
    && layer.borderRadius === '0px'
    && layer.filter === 'none';
  const hidden = (layer) => layer.content === 'none' || layer.display === 'none';
  assert.ok(layers.lineCount >= 5, `the fixture rendered real lyric lines: ${layers.lineCount}`);
  for (const name of ['well', 'page', 'line', 'currentLine']) {
    assert.ok(paintFree(layers[name]), `${name} must not paint a container: ${JSON.stringify(layers[name])}`);
  }
  for (const name of ['wellBefore', 'wellAfter', 'pageBefore', 'pageAfter', 'lineBefore', 'lineAfter',
    'currentBefore', 'currentAfter']) {
    assert.ok(hidden(layers[name]), `${name} must not render a plate or frame: ${JSON.stringify(layers[name])}`);
  }
  evidence.layers = layers;

  // No clipping: the lyric page is offset with a transform, so no line is cut
  // by a boundary. Lines outside the reading area fade out by distance and
  // every line that is painted stays inside the playback bar.
  const viewport = await page.evaluate(() => {
    const list = document.getElementById('qishuiPlaybackLyricPage');
    const phone = document.getElementById('qishuiPlaybackPhone');
    const listStyle = getComputedStyle(list);
    const phoneBox = phone.getBoundingClientRect();
    const lines = Array.from(list.querySelectorAll('.qishui-playback-lyric-line')).map((line) => {
      const rect = line.getBoundingClientRect();
      return {
        index: Number(line.dataset.bookLyricIndex),
        distance: Number(line.dataset.lyricDistance ?? 6),
        opacity: Number(getComputedStyle(line).opacity),
        insideBar: rect.top >= phoneBox.top - 1 && rect.bottom <= phoneBox.bottom + 1
      };
    });
    return {
      overflow: listStyle.overflow,
      contain: listStyle.contain,
      transform: listStyle.transform,
      offset: Number(list.__lyricOffset) || 0,
      currentIndex: Number(list.dataset.activeIndex),
      lines
    };
  });
  await page.locator('#qishuiPlaybackPhone').screenshot({ path: path.join(output, 'playback-card.png'), scale: 'device' });
  assert.equal(viewport.overflow, 'visible', 'the lyric page carries no clipping window');
  assert.doesNotMatch(viewport.contain, /\b(?:paint|content|strict)\b/,
    'paint containment clips scaled lyrics and translations even with overflow: visible');
  assert.notEqual(viewport.transform, 'none', 'the reading axis is applied as a transform offset');
  const visibleLines = viewport.lines.filter((line) => line.opacity > 0.02);
  assert.ok(visibleLines.length >= 2, `the reading area still shows lyric lines: ${JSON.stringify(viewport.lines)}`);
  for (const line of visibleLines) {
    assert.ok(line.insideBar,
      `a painted lyric line must stay inside the playback bar: ${JSON.stringify(line)}`);
  }
  for (const line of viewport.lines) {
    if (line.distance < 3) continue;
    assert.ok(line.opacity <= 0.02,
      `a line outside the reading area fades out instead of being cut: ${JSON.stringify(line)}`);
  }
  evidence.viewport = viewport;

  // Pixel proof: hiding the lyric area removes text ink only. The top band of
  // the lyric area carries no glyphs, so a container would show up there.
  // Clear glass exposes the live background; stop the fixture media so the
  // two images differ by lyric visibility, not playback/visualizer progress.
  await page.evaluate(() => els.audio.pause());
  await page.waitForTimeout(400);
  // Material assertions above use the real backdrop. This ink-only comparison
  // must not count animated scene canvases showing through clear glass as ink.
  const staticBackdrop = await page.addStyleTag({ content: 'canvas, video { visibility: hidden !important; }' });
  const withLyrics = await page.locator('#qishuiPlaybackPhone').screenshot({ animations: 'disabled' });
  await page.evaluate(() => { document.getElementById('qishuiPlaybackLyrics').style.visibility = 'hidden'; });
  await page.waitForTimeout(150);
  const withoutLyrics = await page.locator('#qishuiPlaybackPhone').screenshot({ animations: 'disabled' });
  await page.evaluate(() => { document.getElementById('qishuiPlaybackLyrics').style.visibility = ''; });
  await staticBackdrop.evaluate(node => node.remove());
  const bands = await page.evaluate(async ([aData, bData, well, phone]) => {
    const load = (data) => new Promise((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = reject;
      node.src = data;
    });
    const [imageA, imageB] = await Promise.all([load(aData), load(bData)]);
    const canvas = document.createElement('canvas');
    canvas.width = imageA.width;
    canvas.height = imageA.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(imageA, 0, 0);
    const first = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(imageB, 0, 0);
    const second = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const left = Math.max(4, Math.round(well[0] - phone[0]) + 4);
    const right = Math.min(canvas.width - 4, Math.round(well[0] - phone[0] + well[2]) - 4);
    const measure = (top, bottom) => {
      let total = 0;
      let changed = 0;
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const index = (y * canvas.width + x) * 4;
          total += 1;
          const delta = Math.abs(first[index] - second[index])
            + Math.abs(first[index + 1] - second[index + 1])
            + Math.abs(first[index + 2] - second[index + 2]);
          if (delta > 24) changed += 1;
        }
      }
      return { top, bottom, ratio: Number((changed / Math.max(1, total)).toFixed(4)) };
    };
    const top = Math.round(well[1] - phone[1]);
    const height = Math.round(well[3]);
    return {
      // With no clipping the lyrics may reach slightly past the reading area,
      // but they must never spill onto the cover art or the player controls.
      coverBand: measure(40, Math.max(48, top - 40)),
      controlsBand: measure(Math.min(canvas.height - 12, top + height + 40), canvas.height - 12),
      whole: measure(top, top + height)
    };
  }, [
    `data:image/png;base64,${withLyrics.toString('base64')}`,
    `data:image/png;base64,${withoutLyrics.toString('base64')}`,
    layers.wellRect,
    layers.phoneRect
  ]);
  assert.ok(bands.coverBand.ratio < 0.03,
    `lyrics never spill onto the cover art: ${JSON.stringify(bands)}`);
  assert.ok(bands.controlsBand.ratio < 0.05,
    `lyrics never spill onto the player controls: ${JSON.stringify(bands)}`);
  // Plain white glyphs occupy less ink than the previous colored gradient/glow.
  assert.ok(bands.whole.ratio > 0.03, `the lyric text itself is painted: ${JSON.stringify(bands)}`);
  evidence.bands = bands;

  // Reproduce the reported wrapped English line with its Chinese translation.
  // Short untranslated fixtures cannot reveal cropped initials or subtitle tails.
  evidence.lyricWindows = [];
  const lyricWindowFailures = [];
  for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 },
    { width: 390, height: 844 }, { width: 1440, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    for (const { expanded, windowMode } of [
      { expanded: false, windowMode: 'normal' },
      { expanded: true, windowMode: 'normal' },
      ...(size.width > 900 ? [
        { expanded: false, windowMode: 'fullscreen' },
        { expanded: true, windowMode: 'fullscreen' }
      ] : [])
    ]) {
    const radius = 1;
    await page.evaluate(({ expanded, windowMode }) => {
      els.audio.pause();
      state.appWindowFullscreen = windowMode === 'fullscreen';
      syncWindowFullscreenState();
      state.qishuiPlaybackCard.expanded = expanded;
      syncQishuiPlaybackExpansion();
      const copy = [
        ['Holding onto the dream', '紧握这未竟之梦'],
        ["Be who you've always been", '做最真实的自我'],
        ['Shine your light on me', '请将光芒向我倾洒'],
        ["You stay out all night, hit the ground runnin'", '彻夜不眠 一路飞奔'],
        ["Superstar, keep the good times comin'", '光芒万丈 欢乐无疆']
      ];
      state.lyricLines = Array.from({ length: 11 }, (_, index) => ({
        time: index * 10, endTime: (index + 1) * 10,
        text: copy[index % copy.length][0], translationText: copy[index % copy.length][1]
      }));
      state.qishuiPlaybackCard.lyricSignature = '';
      renderQishuiPlaybackCard();
    }, { expanded, windowMode });
    await page.waitForTimeout(450);
    for (const activeIndex of [0, 5, 10, 2]) {
      const layout = await page.evaluate((index) => {
        updateQishuiPlaybackLyrics('', '', index * 10 + 1, { playbackRunning: false });
        const list = document.getElementById('qishuiPlaybackLyricPage');
        const well = document.getElementById('qishuiPlaybackLyrics').getBoundingClientRect();
        const cover = document.getElementById('qishuiPlaybackCoverFrame');
        const track = document.querySelector('#qishuiPlaybackPhone .qishui-playback-track').getBoundingClientRect();
        const visible = Array.from(list.children).filter(line => getComputedStyle(line).visibility !== 'hidden');
        return { currentIndex: Number(list.dataset.activeIndex), coverSize: cover.clientWidth, coverHeight: cover.clientHeight,
          lyricWidth: document.getElementById('qishuiPlaybackLyrics').clientWidth,
          gridRows: getComputedStyle(document.querySelector('#qishuiPlaybackPhone .qishui-playback-content')).gridTemplateRows,
          visible: visible.map(line => {
            const rect = line.getBoundingClientRect();
            return { index: Number(line.dataset.bookLyricIndex),
              fontSize: parseFloat(getComputedStyle(line.querySelector('.book-lyric-line-text')).fontSize),
              translationSize: parseFloat(getComputedStyle(line.querySelector('.book-lyric-translation')).fontSize),
              paragraphGap: parseFloat(getComputedStyle(line).marginBottom),
              lineHeight: parseFloat(getComputedStyle(line.querySelector('.book-lyric-line-text')).lineHeight),
              translationGap: parseFloat(getComputedStyle(line.querySelector('.book-lyric-translation')).marginTop),
              insideWell: rect.top >= well.top - 2 && rect.bottom <= well.bottom + 2,
              aboveTrack: rect.bottom <= track.top,
              rect: [rect.top, rect.bottom], well: [well.top, well.bottom] };
          }) };
      }, activeIndex);
      try {
      assert.equal(layout.currentIndex, activeIndex);
      const start = Math.max(0, Math.min(activeIndex - 1, 8));
      const end = start + 2;
      assert.deepEqual(layout.visible.map(line => line.index),
        Array.from({ length: end - start + 1 }, (_, index) => start + index),
        `the ${windowMode} ${expanded ? 'expanded' : 'compact'} player must show ${radius * 2 + 1} lyric entries when available`);
      for (const line of layout.visible) {
        const current = line.index === activeIndex;
        const wideExpanded = expanded && size.width >= 901;
        const minimumSize = (wideExpanded ? 18 : 16) * (current ? 1 : 0.8);
        const maximumSize = (wideExpanded ? 30 : 28) * (current ? 1 : 0.8);
        assert.ok(line.fontSize >= minimumSize && line.fontSize <= maximumSize
          && line.translationSize >= 12 && line.translationSize < line.fontSize,
          `responsive lyrics must stay readable with a smaller translation: ${JSON.stringify(line)}`);
        const currentSize = layout.visible.find(item => item.index === activeIndex).fontSize;
        assert.ok(Math.abs(line.fontSize - currentSize * (current ? 1 : 0.8)) < 0.01,
          'regular and current lyrics must share one proportional scale');
        assert.ok(Math.abs(line.translationSize - Math.max(12, currentSize * 0.66)) < 0.01,
          'translation size must follow the main lyric scale with a readable minimum');
        assert.ok(line.paragraphGap >= 4, 'keep a separate gap between lyric paragraphs');
        assert.ok(Math.abs(line.lineHeight / line.fontSize - 1.18) < 0.01, 'keep wrapped lines close within a lyric paragraph');
        assert.ok(line.translationGap <= 2 && line.translationGap < line.paragraphGap, 'translation belongs with its original lyric, not the next paragraph');
        assert.ok(Math.abs(layout.coverSize - layout.coverHeight) <= 1, 'preserve square cover artwork');
        assert.ok(line.fontSize / layout.coverSize <= 0.18,
          `lyrics must not overwhelm the cover: ${JSON.stringify(layout)}`);
        assert.ok(line.insideWell && line.aboveTrack,
          `${size.width}x${size.height} ${windowMode} expanded=${expanded}: lyric window must stay clear of cover and controls: ${JSON.stringify(layout)}`);
      }
      } catch (error) {
        lyricWindowFailures.push({ size, expanded, windowMode, activeIndex, message: error.message });
      }
      evidence.lyricWindows.push({ ...size, expanded, windowMode, activeIndex, ...layout });
    }
    await page.locator('#qishuiPlaybackPhone').screenshot({ path: path.join(output, `${windowMode}-${expanded ? 'expanded' : 'compact'}-${radius * 2 + 1}-lines-${size.width}x${size.height}.png`), scale: 'device' });
    }
  }

  // Resize a paused song without rerendering it in the test: production's
  // resize handler must reflow the same active line and highlight mask.
  writeFileSync(path.join(output, 'layout-result.json'), JSON.stringify({ lyricWindowFailures, lyricWindows: evidence.lyricWindows }, null, 2));
  assert.deepEqual(lyricWindowFailures, [], 'all lyric windows must fit without cover or control overlap');
  await page.evaluate(() => {
    els.audio.pause();
    state.qishuiPlaybackCard.expanded = false;
    state.appWindowFullscreen = false;
    syncWindowFullscreenState();
    syncQishuiPlaybackExpansion();
    state.currentSong = { ...state.currentSong, position: 3, duration: 8 };
    state.lyricLines = [
      { time: 0, endTime: 2, text: 'Before the chorus', translationText: '序曲缓缓响起' },
      { time: 2, endTime: 6, text: 'There comes a time when we heed a certain call', translationText: '当我们听到了恳切的呼唤' },
      { time: 6, endTime: 8, text: 'Let the music carry on', translationText: '让音乐继续流淌' }
    ];
    state.qishuiPlaybackCard.lyricSignature = '';
    renderQishuiPlaybackCard();
    els.audio.currentTime = 3;
    updateQishuiPlaybackLyrics('', '', 3, { playbackRunning: false });
    window.__resizeLyricNode = document.querySelector('#qishuiPlaybackLyricPage .is-current');
  });
  await page.waitForTimeout(450);
  evidence.resizeScales = [];
  for (const size of [{ width: 1280, height: 760 }, { width: 1280, height: 960 },
    { width: 1600, height: 960 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(450);
    const layout = await page.evaluate(() => {
      const current = document.querySelector('#qishuiPlaybackLyricPage .is-current');
      const text = getComputedStyle(current.querySelector('.book-lyric-line-text'));
      const translation = getComputedStyle(current.querySelector('.book-lyric-translation'));
      const hot = getComputedStyle(current.querySelector('.book-lyric-copy--hot'));
      const rect = current.getBoundingClientRect();
      const well = document.getElementById('qishuiPlaybackLyrics').getBoundingClientRect();
      const track = document.querySelector('#qishuiPlaybackPhone .qishui-playback-track').getBoundingClientRect();
      return { activeIndex: Number(current.dataset.bookLyricIndex), sameNode: current === window.__resizeLyricNode,
        mediaTime: els.audio.currentTime, mediaReadyState: els.audio.readyState,
        lyricTime: currentPlaybackLyricTime(), lyricOffset: lyricClockOffsetSeconds(),
        paused: els.audio.paused, fontSize: parseFloat(text.fontSize), translationSize: parseFloat(translation.fontSize),
        highlightColor: hot.color, highlightMask: hot.clipPath, highlightOpacity: Number(hot.opacity),
        insideWell: rect.top >= well.top - 2 && rect.bottom <= well.bottom + 2, aboveTrack: rect.bottom <= track.top };
    });
    assert.equal(layout.activeIndex, 1, `resizing must not change the active lyric: ${JSON.stringify(layout)}`);
    assert.ok(layout.sameNode && layout.paused, 'resizing must reuse the paused lyric without restarting playback');
    assert.ok(layout.insideWell && layout.aboveTrack, `resize must recenter the active lyric: ${JSON.stringify(layout)}`);
    assert.equal(layout.highlightColor, 'rgb(255, 255, 255)');
    assert.notEqual(layout.highlightMask, 'none');
    assert.ok(layout.highlightOpacity > 0, 'resizing must retain the current white highlight');
    evidence.resizeScales.push({ ...size, ...layout });
  }
  assert.ok(evidence.resizeScales[1].fontSize > evidence.resizeScales[0].fontSize + 0.5,
    'a taller window must increase lyric size at the same width');
  assert.ok(evidence.resizeScales[2].fontSize > evidence.resizeScales[1].fontSize + 0.5,
    'a wider window must increase lyric size at the same height');
  assert.ok(evidence.resizeScales[4].fontSize < evidence.resizeScales[2].fontSize,
    'shrinking to a mobile window must reduce lyric size automatically');

  await page.evaluate(() => {
    state.qishuiPlaybackCard.expanded = false;
    syncQishuiPlaybackExpansion();
  });
  evidence.bilingual = [];
  for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await page.evaluate(() => {
      els.audio.pause();
      state.currentSong = { ...state.currentSong, title: 'Into You', artist: 'Lyric layout fixture', position: 1 };
      state.lyricLines = [{
        time: 0, endTime: 8, text: "I'm breathing, I'm feeling alone",
        translationText: '呼吸之间 孤独由心而生'
      }];
      state.qishuiPlaybackCard.lyricSignature = '';
      renderQishuiPlaybackCard();
      updateQishuiPlaybackLyrics('', '', 1, { playbackRunning: false });
    });
    await page.waitForTimeout(450);
    const layout = await page.evaluate(() => {
      updateQishuiPlaybackLyrics('', '', 1, { playbackRunning: false });
      const phone = document.getElementById('qishuiPlaybackPhone');
      const current = phone.querySelector('.qishui-playback-lyric-line.is-current');
      const bar = phone.getBoundingClientRect();
      const track = phone.querySelector('.qishui-playback-track').getBoundingClientRect();
      const glyphs = [];
      for (const selector of ['.book-lyric-copy--base', '.book-lyric-translation-copy--base']) {
        const copy = current.querySelector(selector);
        const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          for (let index = 0; index < node.length; index += 1) {
            if (!node.textContent[index].trim()) continue;
            const range = document.createRange();
            range.setStart(node, index); range.setEnd(node, index + 1);
            const box = range.getBoundingClientRect();
            glyphs.push({ text: node.textContent[index],
              insideBar: box.left >= bar.left && box.right <= bar.right
                && box.top >= bar.top && box.bottom <= bar.bottom,
              aboveTrack: box.bottom <= track.top,
              box: [box.left, box.top, box.right, box.bottom] });
          }
        }
      }
      const selectors = ['.book-lyric-copy--base', '.book-lyric-copy--hot',
        '.book-lyric-translation-copy--base', '.book-lyric-translation-copy--hot'];
      const colors = selectors.map(selector => {
        const style = getComputedStyle(current.querySelector(selector));
        return { selector, color: style.color, backgroundImage: style.backgroundImage,
          opacity: Number(style.opacity) };
      });
      const readHighlight = () => selectors.filter(selector => selector.endsWith('--hot'))
        .map(selector => getComputedStyle(current.querySelector(selector)).clipPath);
      const highlightBefore = readHighlight();
      updateQishuiPlaybackLyrics('', '', 5, { playbackRunning: false });
      const highlightAfter = readHighlight();
      updateQishuiPlaybackLyrics('', '', 1, { playbackRunning: false });
      return { glyphs, colors, highlightBefore, highlightAfter,
        translation: current.querySelector('.book-lyric-translation-copy--base')?.textContent };
    });
    const screenshot = `bilingual-${size.width}x${size.height}.png`;
    await page.locator('#qishuiPlaybackPhone').screenshot({ path: path.join(output, screenshot), scale: 'device' });
    assert.equal(layout.translation, '呼吸之间 孤独由心而生');
    for (const layer of layout.colors) {
      assert.match(layer.color, /^rgba?\(255, 255, 255(?:, [\d.]+)?\)$/,
        `original lyrics and translations must use white ink: ${JSON.stringify(layer)}`);
      assert.equal(layer.backgroundImage, 'none', 'colored text gradients must not tint the lyrics');
      assert.ok(layer.opacity > 0, 'both the base text and current highlight must remain visible');
    }
    for (let index = 0; index < layout.highlightBefore.length; index += 1) {
      assert.notEqual(layout.highlightBefore[index], 'none', 'keep the progressive highlight mask');
      assert.notEqual(layout.highlightBefore[index], layout.highlightAfter[index],
        'white lyric highlights must still follow the playback clock');
    }
    assert.ok(layout.glyphs.length > 30, 'measure both original lyrics and translation');
    for (const glyph of layout.glyphs) {
      assert.ok(glyph.insideBar && glyph.aboveTrack,
        `${size.width}x${size.height}: lyric glyph must remain fully visible above song metadata: ${JSON.stringify(glyph)}`);
    }
    evidence.bilingual.push({ ...size, ...layout, screenshot });
  }
  assert.deepEqual(errors, [], 'the playback surfaces reported no page or console errors');

  await page.locator('#qishuiPlaybackPhone').screenshot({ path: path.join(output, 'playback-card.png'), scale: 'device' });
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ errors, evidence }, null, 2));
  console.log('PASS playback bar lyric surface: only lyric text over the playback bar panel, no well, plate or inner frame');
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
