import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const webRoot = path.resolve('web');
const debugPort = 24000 + (process.pid % 6000);
const profile = path.resolve(tmpdir(), `fe-monster-playback-lyric-palette-${process.pid}`);
const storageKey = 'fe-monster-playback-lyric-palette-v1';
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp']
]);

if (!existsSync(edge)) throw new Error(`Microsoft Edge was not found: ${edge}`);

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end('{}');
    return;
  }
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.resolve(webRoot, `.${decodeURIComponent(requestedPath)}`);
  if (!filePath.startsWith(`${webRoot}${path.sep}`) || !existsSync(filePath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
  });
  response.end(readFileSync(filePath));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu-sandbox',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
let nextId = 1;
let socket;

async function retryJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
    }
    await delay(100);
  }
  throw new Error('Edge debugging endpoint did not start');
}

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression, awaitPromise = false) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(expression, timeout = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression, true)) return;
    await delay(80);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((entry) => entry.type === 'page');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });
  await command('Page.navigate', { url: baseUrl });
  await waitFor(`document.readyState === 'complete'
    && typeof setPlaybackLyricPalettePreference === 'function'
    && typeof applyQishuiPlaybackPalette === 'function'
    && state.playbackLyricPalettePreference
    && document.getElementById('playbackLyricPaletteControl')`);

  const firstPass = await evaluate(`(() => {
    const root = document.getElementById('playbackLyricPaletteControl');
    const phone = document.getElementById('qishuiPlaybackPhone');
    const page = document.getElementById('qishuiPlaybackLyricPage');
    const mainScene = document.getElementById('playbackLyricScene');
    const swatches = Array.from(root.querySelectorAll('[data-playback-lyric-palette-color]'));
    const requiredIds = [
      'playbackLyricPaletteStatus',
      'playbackLyricPaletteAutoButton',
      'playbackLyricPaletteCustomInput',
      'playbackLyricPaletteResetButton'
    ];
    setTextPreset('none');
    const mainPreferencesBefore = JSON.stringify(state.textPalettePreferences);
    const mainColorBefore = mainScene.style.getPropertyValue('--lyric-primary');
    setPlaybackLyricPalettePreference('manual', '#64e7c3');
    const manualPreference = { ...state.playbackLyricPalettePreference };
    const manualValue = phone.style.getPropertyValue('--playback-lyric-current').trim();
    const storedManual = localStorage.getItem(${JSON.stringify(storageKey)}) || '';
    const manualPalette = manualTextLyricPalette('#ffadc9');
    applyQishuiPlaybackPalette(manualPalette);
    const manualAfterCoverChange = phone.style.getPropertyValue('--playback-lyric-current').trim();

    page.innerHTML = [
      '<button class="book-lyric-line qishui-playback-lyric-line" style="--book-line-distance:1">',
      '<span class="book-lyric-line-text"><span class="book-lyric-copy book-lyric-copy--base">清晰歌词</span></span>',
      '</button>',
      '<button class="book-lyric-line qishui-playback-lyric-line is-current is-scroll-arrived" style="--book-line-distance:0">',
      '<span class="book-lyric-line-text"><span class="book-lyric-copy book-lyric-copy--base">当前歌词</span>',
      '<span class="book-lyric-copy book-lyric-copy--hot">当前歌词</span></span>',
      '</button>'
    ].join('');
    const normalLine = page.firstElementChild;
    const currentLine = page.lastElementChild;
    const normalCopy = normalLine.querySelector('.book-lyric-copy--base');
    const currentHot = currentLine.querySelector('.book-lyric-copy--hot');
    const normalStyle = getComputedStyle(normalCopy);
    const currentStyle = getComputedStyle(currentLine);
    const hotStyle = getComputedStyle(currentHot);

    setPlaybackLyricPalettePreference('auto');
    const coverA = manualTextLyricPalette('#3478e5');
    const coverB = manualTextLyricPalette('#ffbc72');
    applyQishuiPlaybackPalette(coverA);
    const autoA = phone.style.getPropertyValue('--playback-lyric-current').trim();
    applyQishuiPlaybackPalette(coverB);
    const autoB = phone.style.getPropertyValue('--playback-lyric-current').trim();
    const independentFromMainPalette = JSON.stringify(state.textPalettePreferences) === mainPreferencesBefore
      && mainScene.style.getPropertyValue('--lyric-primary') === mainColorBefore;

    setTextPreset('focus-echo');
    const scene = document.getElementById('playbackLyricScene');
    scene.classList.remove('is-focus-echo-entering');
    const depths = [0, 1, 2, 3].map((depth) => {
      const element = document.querySelector('.playback-lyric-layer.lyric-depth-' + depth);
      if (element) element.style.animation = 'none';
      const style = getComputedStyle(element);
      return {
        opacity: Number(style.opacity),
        filter: style.filter,
        shadow: style.textShadow,
        display: style.display
      };
    });

    const checks = {
      controlsComplete: requiredIds.every((id) => document.getElementById(id))
        && swatches.length === 8
        && document.getElementById('playbackLyricPaletteCustomInput').type === 'color',
      staysEnabledWithoutMainLyrics: !root.classList.contains('is-disabled')
        && !swatches.some((swatch) => swatch.disabled),
      manualApplied: manualPreference.mode === 'manual'
        && manualPreference.color === '#64e7c3'
        && manualValue.includes('rgba(')
        && manualAfterCoverChange === manualValue
        && storedManual.toLowerCase().includes('#64e7c3'),
      independentFromMainPalette,
      autoFollowsCover: autoA.includes('rgba(') && autoB.includes('rgba(') && autoA !== autoB,
      textIsClear: Number.parseFloat(normalStyle.fontSize) >= 14
        && Number.parseFloat(normalStyle.fontWeight) >= 600
        && normalStyle.textShadow !== 'none'
        && currentStyle.opacity === '1'
        && hotStyle.color !== normalStyle.color,
      focusEchoVisible: depths[0].shadow !== 'none'
        && (depths[0].shadow.match(/rgba?\\(/g) || []).length >= 4
        && depths.slice(1).every((depth) => depth.display !== 'none' && depth.filter.includes('blur'))
        && depths[1].opacity > depths[2].opacity
        && depths[2].opacity > depths[3].opacity
    };
    setPlaybackLyricPalettePreference('manual', '#ffadc9');
    return {
      pass: Object.values(checks).every(Boolean),
      checks,
      manualValue,
      autoA,
      autoB,
      normalStyle: {
        color: normalStyle.color,
        fontSize: normalStyle.fontSize,
        fontWeight: normalStyle.fontWeight,
        textShadow: normalStyle.textShadow
      },
      currentStyle: {
        color: currentStyle.color,
        opacity: currentStyle.opacity,
        fontSize: getComputedStyle(currentLine.querySelector('.book-lyric-line-text')).fontSize
      },
      depths
    };
  })()`, true);

  await command('Page.reload', { ignoreCache: true });
  await waitFor(`document.readyState === 'complete'
    && state.playbackLyricPalettePreference
    && document.getElementById('playbackLyricPaletteCustomInput')`);
  const reloadPass = await evaluate(`(() => {
    const preference = state.playbackLyricPalettePreference;
    const input = document.getElementById('playbackLyricPaletteCustomInput');
    const status = document.getElementById('playbackLyricPaletteStatus');
    return {
      pass: preference.mode === 'manual'
        && preference.color === '#ffadc9'
        && input.value.toLowerCase() === '#ffadc9'
        && status.textContent === '#FFADC9',
      preference,
      input: input.value,
      status: status.textContent
    };
  })()`, true);

  const result = {
    pass: firstPass.pass === true && reloadPass.pass === true,
    firstPass,
    reloadPass
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  if (socket && socket.readyState <= 1) socket.close();
  browser.kill();
  server.close();
  await delay(250);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {
  }
}
