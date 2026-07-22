import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'android', 'app', 'build', 'generated', 'feMonsterWebAssets', 'fe-monster-web');
const mainActivityPath = path.join(root, 'android', 'app', 'src', 'main', 'java', 'com', 'femonster', 'mobile', 'MainActivity.java');
const manifestPath = path.join(root, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const buildGradlePath = path.join(root, 'android', 'app', 'build.gradle');
const artifactDirectory = path.join(root, 'artifacts', 'android-client-check');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = path.join(tmpdir(), `fe-monster-android-local-check-${process.pid}`);
const debugPort = 19000 + (process.pid % 10000);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

if (!existsSync(path.join(webRoot, 'index.html'))) {
  throw new Error(`Android generated web assets are missing: ${webRoot}`);
}
if (!existsSync(edge)) throw new Error(`Microsoft Edge was not found: ${edge}`);

const mainActivity = readFileSync(mainActivityPath, 'utf8');
const manifest = readFileSync(manifestPath, 'utf8');
const buildGradle = readFileSync(buildGradlePath, 'utf8');
const nativeShellContract = {
  privateLocalOrigin: mainActivity.includes('LOCAL_APP_ORIGIN = "https://fe-monster.local/"'),
  bundledDocumentUsesLocalOrigin: mainActivity.includes('loadDataWithBaseURL(LOCAL_APP_ORIGIN, html'),
  startsWithoutConnectionPanel: mainActivity.includes('configureWebView();\n        loadBundledClient();')
    && !mainActivity.includes('buildConnectPanel()'),
  localApiHasNativeFailClosedResponse: mainActivity.includes('localApiFallbackResponse(path)'),
  bridgeReportsLocalRuntime: mainActivity.includes('public String getRuntimeMode()')
    && mainActivity.includes('return "local";'),
  landscapeOnly: manifest.includes('android:screenOrientation="sensorLandscape"'),
  noRemoteGatewayBuildConfig: !buildGradle.includes('DEFAULT_SERVER_URL')
    && !buildGradle.includes('PUBLIC_ACCESS_KEY')
    && !buildGradle.includes('FE_MONSTER_ANDROID_SERVER_URL'),
  noRemoteGatewayInShell: !mainActivity.includes('frp-boy.com') && !mainActivity.includes('loadServer(')
};
const nativeShellFailures = Object.entries(nativeShellContract)
  .filter(([, passed]) => !passed)
  .map(([name]) => `native shell contract failed: ${name}`);

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.glb', 'model/gltf-binary'],
  ['.bin', 'application/octet-stream'],
  ['.woff2', 'font/woff2']
]);
const leakedApiRequests = [];

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/health' || url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    leakedApiRequests.push(`${request.method || 'GET'} ${url.pathname}`);
    response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: false, error: 'Android local API leaked to HTTP fixture' }));
    return;
  }

  const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const filePath = path.resolve(webRoot, relative);
  const insideBundle = filePath === path.resolve(webRoot)
    || filePath.startsWith(path.resolve(webRoot) + path.sep);
  if (!insideBundle || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end();
    return;
  }
  const body = readFileSync(filePath);
  response.writeHead(200, {
    'Content-Type': contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  response.end(body);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu',
  '--disable-background-networking',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();

async function retryJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await delay(100);
  }
  throw new Error('Edge debugging endpoint did not start');
}

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
  return result.result.value;
}

const viewports = [
  { name: 'ratio-21-9-landscape', aspect: '21:9 landscape', width: 840, height: 360 },
  { name: 'ratio-3-2-landscape', aspect: '3:2 landscape', width: 540, height: 360 },
  { name: 'ratio-16-9-landscape', aspect: '16:9 landscape', width: 640, height: 360 },
  { name: 'ratio-18-9-landscape', aspect: '18:9 landscape', width: 720, height: 360 },
  { name: 'ratio-20-9-landscape', aspect: '20:9 landscape', width: 800, height: 360 },
  { name: 'ratio-19_5-9-landscape', aspect: '19.5:9 landscape', width: 780, height: 360 },
  { name: 'ratio-20_5-9-landscape', aspect: '20.5:9 landscape', width: 820, height: 360 }
];

function failuresFor(report) {
  const failures = [];
  if (!report.mobileRuntime) failures.push('Android mobile runtime did not initialize');
  if (report.platform !== 'android') failures.push('Android platform marker is missing');
  if (report.runtime !== 'local') failures.push(`runtime is ${report.runtime || 'unset'}, expected local`);
  if (report.serverState !== 'local') failures.push(`server state is ${report.serverState || 'unset'}, expected local`);
  if (report.orientation !== report.expectedOrientation) failures.push(`orientation marker is ${report.orientation}`);
  if (!report.localApiOk) failures.push('local API contract is unavailable');
  if (!report.localStatePersists) failures.push('local runtime state did not persist');
  if (!report.localAudioInputReady) failures.push('local audio importer is unavailable');
  if (!report.removedCircledChrome) failures.push('removed Android rail/import controls are still present');
  if (!report.accountLoginEntry) failures.push('playback account is not the Android login entry');
  if (!report.loginDialogReachable) failures.push('music platform login dialog is suppressed in local runtime');
  if (!report.loginUsesAndroidErrorCopy) failures.push('login dialog fell back to desktop gateway instructions');
  if (!report.sandboxEnabled) failures.push('local sandbox was disabled');
  if (!report.communityHidden) failures.push('server-only community UI is visible');
  if (!report.searchFourColumns) failures.push('search field does not preserve input, favorites, and submit columns');
  if (!report.searchUsesFreedWidth) failures.push('search field still reserves space for removed Android chrome');
  if (!report.textFontSelector) failures.push('43-item text preset font selector is unavailable');
  if (!report.textFontLayout) failures.push('text font selector overflows the Android landscape panel');
  if (!report.textFontFallbackHonest) failures.push('missing text fonts are not identified with an explicit fallback state');
  if (report.smallTargets.length) failures.push(`touch targets below compact Android minimum (40px): ${report.smallTargets.join(', ')}`);
  if (report.outOfBounds.length) failures.push(`out-of-bounds controls: ${report.outOfBounds.join(', ')}`);
  if (report.overlaps.length) failures.push(`overlapping controls: ${report.overlaps.join(', ')}`);
  return failures;
}

const reports = [];
try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((item) => item.type === 'page');
  if (!target?.webSocketDebuggerUrl) throw new Error('No Edge page target was found');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      const bridge = {
        getDeviceId: () => 'android-local-layout-fixture',
        getPlatform: () => 'android',
        getServerUrl: () => 'https://fe-monster.local/',
        getRuntimeMode: () => 'local',
        getPerformanceTier: () => 'low',
        getMusicGatewayState: () => 'starting',
        requestMusicApi: (requestId) => setTimeout(() => {
          window.feMonsterAndroidMusicResult?.(requestId, 503, JSON.stringify({
            ok: false,
            code: 'ANDROID_GATEWAY_STARTING',
            gatewayState: 'starting',
            error: 'On-device music gateway is starting'
          }));
        }, 8),
        showMessage: () => {},
        openExternal: () => true,
        beginDownload: () => '',
        appendDownload: () => false,
        finishDownload: () => {},
        cancelDownload: () => {}
      };
      Object.defineProperty(window, 'FeMonsterAndroid', { value: bridge, configurable: false });
    })();`
  });

  mkdirSync(artifactDirectory, { recursive: true });
  for (const viewport of viewports) {
    const expectedOrientation = 'landscape';
    await command('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 2,
      mobile: true,
      screenOrientation: {
        type: 'landscapePrimary',
        angle: 90
      }
    });
    await command('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; FE-Monster-Local-Test) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36'
    });
    await command('Page.navigate', { url: `${baseUrl}/?android-local-check=${viewport.name}` });
    await delay(1800);

    const report = await evaluate(`(async () => {
      const boot = document.getElementById('bootScreen');
      if (boot) boot.hidden = true;
      const visible = (node) => {
        if (!node || node.hidden) return false;
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.05
          && rect.width > 0 && rect.height > 0;
      };
      const rectOf = (selector) => {
        const node = document.querySelector(selector);
        if (!visible(node)) return null;
        const rect = node.getBoundingClientRect();
        return { selector, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
      };
      const selectors = [
        '#qishuiPlaybackAccount', '#topSearchForm', '#topFavoritesButton', '#topSearchForm .top-search-submit', '#prevButton', '#playButton', '#nextButton',
        '#dockQualityButton', '#dockFavoriteButton', '#dockPinButton',
        '#qishuiPlaybackVisibilityToggle', '#qishuiPlaybackScaleToggle', '#qishuiPlaybackQuality',
        '#qishuiPlaybackProgressRange', '#qishuiPlaybackPreviousButton', '#qishuiPlaybackPlayButton', '#qishuiPlaybackNextButton'
      ];
      const targets = selectors.map(rectOf).filter(Boolean);
      document.querySelectorAll('#qishuiPlaybackTools button').forEach((node, index) => {
        if (!visible(node)) return;
        const rect = node.getBoundingClientRect();
        targets.push({
          selector: '#qishuiPlaybackTools button:nth-child(' + (index + 1) + ')',
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        });
      });
      const smallTargets = targets.filter((item) => item.width < 39.5 || item.height < 39.5)
        .map((item) => item.selector + ':' + Math.round(item.width) + 'x' + Math.round(item.height));
      const outOfBounds = targets.filter((item) => item.left < -1 || item.top < -1 || item.right > innerWidth + 1 || item.bottom > innerHeight + 1)
        .map((item) => item.selector);
      const interactiveSelectors = [
        '#qishuiPlaybackAccount', '#topSearchForm'
      ];
      const topRects = interactiveSelectors.map(rectOf).filter(Boolean);
      const overlaps = [];
      for (let left = 0; left < topRects.length; left += 1) {
        for (let right = left + 1; right < topRects.length; right += 1) {
          const a = topRects[left];
          const b = topRects[right];
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (overlapX > 2 && overlapY > 2) overlaps.push(a.selector + '+' + b.selector);
        }
      }
      const health = await fetch('/health').then((response) => response.json());
      const runtime = await fetch('/api/app/runtime').then((response) => response.json());
      await fetch('/api/player/volume?value=0.37');
      const player = await fetch('/api/player/state').then((response) => response.json());
      const search = rectOf('#topSearchForm');
      const searchInput = rectOf('#topSearchInput');
      const favorites = rectOf('#topFavoritesButton');
      const searchSubmit = rectOf('#topSearchForm .top-search-submit');
      const loginDialog = document.getElementById('neteaseLoginDialog');
      const loginWasHidden = loginDialog?.hidden;
      const accountEntry = document.getElementById('qishuiPlaybackAccount');
      if (loginDialog) loginDialog.hidden = true;
      accountEntry?.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const loginDialogReachable = visible(loginDialog);
      const loginDialogText = loginDialog?.textContent || '';
      if (loginDialog) loginDialog.hidden = loginWasHidden;
      setDiyOpen(true);
      setDiyPage('text');
      setTextPreset('depth');
      await new Promise((resolve) => setTimeout(resolve, 260));
      const textFontRoot = document.getElementById('textFontControl');
      const textFontSelect = document.getElementById('textFontSelect');
      const textFontPreview = document.getElementById('textFontPreview');
      textFontRoot?.scrollIntoView({ block: 'center', inline: 'nearest' });
      await new Promise((resolve) => setTimeout(resolve, 80));
      const textFontRect = textFontRoot?.getBoundingClientRect();
      return {
        mobileRuntime: Boolean(window.__feMonsterAndroidMobileRuntime),
        platform: document.documentElement.dataset.fePlatform || '',
        runtime: document.documentElement.dataset.feRuntime || '',
        serverState: document.documentElement.dataset.feServerState || '',
        orientation: document.documentElement.dataset.feOrientation || '',
        expectedOrientation: ${JSON.stringify(expectedOrientation)},
        localApiOk: health.ok === true && health.serverRequired === false
          && runtime.clientMode === 'android-local' && runtime.serverRequired === false,
        localStatePersists: Math.abs(Number(player.volume) - 0.37) < 0.001,
        localAudioInputReady: Boolean(document.getElementById('localPlaylistInput')?.multiple),
        removedCircledChrome: !document.getElementById('androidCommandBar')
          && !document.getElementById('androidLocalImportButton'),
        accountLoginEntry: accountEntry?.dataset.androidLoginEntry === 'true'
          && accountEntry?.getAttribute('role') === 'button'
          && accountEntry?.getAttribute('tabindex') === '0',
        loginDialogReachable,
        loginUsesAndroidErrorCopy: /\u672c\u673a\u97f3\u4e50\u767b\u5f55\u670d\u52a1/.test(loginDialogText)
          && !/127\.0\.0\.1|run\.cmd|\u5bfc\u5165\s*API/i.test(loginDialogText),
        sandboxEnabled: document.getElementById('sandboxModeButton')?.getAttribute('aria-disabled') !== 'true',
        communityHidden: !visible(document.getElementById('communityCard')),
        searchFourColumns: Boolean(searchInput && favorites && searchSubmit
          && searchInput.right <= favorites.left + 1 && favorites.right <= searchSubmit.left + 1
          && favorites.width >= 39.5 && searchSubmit.width >= 39.5),
        searchUsesFreedWidth: Boolean(search && search.left <= 16 && innerWidth - search.right <= 16),
        textFontSelector: visible(textFontRoot)
          && textFontSelect?.options.length === 43
          && Boolean(textFontPreview?.textContent.trim()),
        textFontLayout: Boolean(textFontRect
          && textFontRect.left >= -1
          && textFontRect.right <= innerWidth + 1
          && textFontRoot.scrollWidth <= textFontRoot.clientWidth + 1
          && textFontSelect.getBoundingClientRect().width >= 120),
        textFontFallbackHonest: Boolean(textFontSelect?.querySelector('option[data-font-available="false"]')
          && /需嵌入授权|授权待核实|授权已核/.test(textFontSelect.textContent || '')),
        smallTargets,
        outOfBounds,
        overlaps,
        viewport: { width: innerWidth, height: innerHeight }
      };
    })()`);
    const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(path.join(artifactDirectory, `${viewport.name}.png`), Buffer.from(screenshot.data, 'base64'));
    const failures = failuresFor(report);
    reports.push({ name: viewport.name, aspect: viewport.aspect, report, failures });
  }

  const leakedApiFailures = leakedApiRequests.length
    ? [`local API reached HTTP fixture: ${[...new Set(leakedApiRequests)].join(', ')}`]
    : [];
  const ok = nativeShellFailures.length === 0
    && leakedApiFailures.length === 0
    && reports.every((item) => item.failures.length === 0);
  console.log(JSON.stringify({
    ok,
    nativeShell: { contract: nativeShellContract, failures: nativeShellFailures },
    leakedApiRequests,
    leakedApiFailures,
    reports
  }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  browser.kill();
  server.close();
  await delay(120);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }); } catch {}
}
