import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

// Serve the complete production app with local API fixtures. Each run launches
// an isolated browser; no running app, saved account, or external service is used.
const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const output = path.join(root, 'output/playwright/community-boot-race');
mkdirSync(output, { recursive: true });
const require = createRequire(import.meta.url);
let chromium;
for (const candidate of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright', path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch {}
}
assert.ok(chromium, 'Playwright is required');

let holdPresets = true;
const heldPresets = [];
const requests = [];
const fixtures = {
  '/api/music-apis': { ok: true, providers: [] },
  '/api/user-cursors': { ok: true, cursors: [] },
  '/api/app/runtime': { ok: true, clientMode: 'browser', renderBackend: 'webgl', settings: { gpuAcceleration: true } },
  '/api/player/state': { ok: true, volume: .8, playing: false, paused: true, position: 0, duration: 0, queue: [], queueLength: 0 },
  '/api/visual-bridge/state': { ok: true, audio: {} },
  '/api/sandbox/presets': { ok: true, presets: [] },
  '/api/sandbox/components': { ok: true, components: [] },
  '/api/community/state': { ok: true, loggedIn: false, serverOnline: true, friends: [], requests: [] },
  '/api/community/status': { ok: true, authenticated: false },
  '/api/community/pet/status': { ok: true, pet: { state: 'idle', voices: [] }, sessions: [] },
  '/api/community/messages': { ok: true, messages: [{ id: 'fixture-message', from: '87654321', text: '本地浏览器回归消息', createdAt: 1 }] }
};
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://fixture').pathname);
  const json = data => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(data)); };
  response.setHeader('Cache-Control', 'no-store');
  if (pathname === '/api/app/preferences/bootstrap.js') {
    response.setHeader('Content-Type', 'application/javascript'); response.end(''); return;
  }
  if (pathname.startsWith('/api/')) {
    requests.push({ path: pathname, method: request.method });
    const send = () => json(fixtures[pathname] || { ok: true });
    if (pathname === '/api/sandbox/presets' && holdPresets) heldPresets.push(send);
    else send();
    return;
  }
  if (pathname === '/data/android-bundled-library.json') { json({ playlists: [], songs: [] }); return; }
  const base = pathname.startsWith('/components/') ? root : webRoot;
  const file = path.resolve(base, pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file.startsWith(base + path.sep) || !existsSync(file)) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  response.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
let page;
const report = { ok: false, failures: [], snapshots: [], browserErrors: [], networkErrors: [], blockedExternalRequests: [] };
const check = (condition, message) => { if (!condition) report.failures.push(message); };
const releasePresets = () => { holdPresets = false; for (const send of heldPresets.splice(0)) send(); };
const snapshot = async name => {
  const result = await page.evaluate(name => {
    const visible = element => {
      if (!element) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      let effectiveOpacity = 1;
      for (let node = element; node; node = node.parentElement) effectiveOpacity *= Number(getComputedStyle(node).opacity);
      return { id: element.id, hidden: element.hidden, display: style.display, opacity: Number(style.opacity), effectiveOpacity, animationPlayState: style.animationPlayState, width: rect.width, height: rect.height, text: element.textContent.trim().slice(0, 180) };
    };
    const active = [...document.querySelectorAll('.community-profile-page:not([hidden])')];
    return {
      name,
      interactiveServices: document.documentElement.dataset.interactiveServices,
      servicesStarted: bootVisual.servicesStarted,
      initReady: desktopSceneRuntime.ready,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      head: visible(document.getElementById('communityProfileHead')),
      pages: visible(document.querySelector('.community-profile-pages')),
      messageHead: visible(document.getElementById('communityMessageHead')),
      messageStage: visible(document.getElementById('communityMessageStage')),
      tabs: document.querySelectorAll('.community-profile-tabs [role="tab"]').length,
      selectedTabs: document.querySelectorAll('.community-profile-tabs [aria-selected="true"]').length,
      activePages: active.map(visible)
    };
  }, name);
  report.snapshots.push(result);
  return result;
};
const checkProfile = (result, pageId) => {
  const prefix = result.name;
  check(result.interactiveServices === 'started', `${prefix}: interactive services must remain started`);
  check(result.head.effectiveOpacity > .99 && result.head.width > 0, `${prefix}: heading must be visible`);
  check(result.pages.effectiveOpacity > .99 && result.pages.height > 0, `${prefix}: content region must be visible`);
  check(result.tabs === 8 && result.selectedTabs === 1, `${prefix}: eight tabs must have exactly one selection`);
  check(result.activePages.length === 1, `${prefix}: exactly one content page must be active`);
  const active = result.activePages[0];
  check(active?.id === pageId && active.effectiveOpacity > .99 && active.width > 0 && active.height > 0 && active.text.length > 0, `${prefix}: selected page must contain visible content`);
};
const newPage = async () => {
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.browserErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) report.networkErrors.push(`${response.status()} ${response.url()}`); });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    report.blockedExternalRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
};

try {
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || (!existsSync(chromium.executablePath()) && existsSync(edge) ? edge : undefined);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--mute-audio', '--disable-gpu'] });
  await newPage();
  await page.waitForFunction(() => typeof bootVisual !== 'undefined' && typeof setCommunityProfileOpen === 'function');
  await page.locator('#bootLogoButton').click();
  await page.waitForFunction(() => bootVisual.servicesStarted && document.getElementById('bootScreen').hidden);
  assert.ok(heldPresets.length > 0, 'the initial sandbox request must be held until after boot entry');
  const beforeRelease = await snapshot('entered-before-init-completes');
  assert.equal(beforeRelease.initReady, false, 'the fixture must reproduce an unfinished init');
  assert.equal(beforeRelease.interactiveServices, 'started');
  assert.equal(beforeRelease.reducedMotion, false, 'normal motion is necessary to reveal the invisible animation frame');

  // Opening before init finishes is valid too. Closing and reopening after the
  // delayed response exposes the paused initial animation frame deterministically.
  await page.locator('#communityRailButton').click();
  await page.locator('#communityAvatar').click();
  await page.waitForTimeout(600);
  checkProfile(await snapshot('community-before-late-init'), 'communityProfileSelfPage');
  await page.locator('#communityProfileClose').click();

  releasePresets();
  await page.waitForFunction(() => desktopSceneRuntime.ready);
  await page.locator('#communityAvatar').click();
  await page.waitForTimeout(600);
  const afterRelease = await snapshot('community-after-late-init');
  await page.screenshot({ path: path.join(output, 'community-after-late-init.png') });
  check(afterRelease.interactiveServices === 'started', 'late init must not overwrite started with deferred');
  check(afterRelease.head.effectiveOpacity > .99, 'community heading must be visible after its entrance');
  check(afterRelease.pages.effectiveOpacity > .99, 'community content must be visible after its entrance');
  check(afterRelease.tabs === 8, 'community must expose all eight tabs');
  check(afterRelease.selectedTabs === 1 && afterRelease.activePages.length === 1, 'exactly one community tab and page must be active');

  const tabs = await page.locator('.community-profile-tabs [role="tab"]').evaluateAll(elements => elements.map(element => ({ id: element.id, pageId: element.getAttribute('aria-controls'), name: element.dataset.communityProfilePage })));
  for (const tab of tabs) {
    await page.locator(`#${tab.id}`).click();
    await page.waitForTimeout(500);
    checkProfile(await snapshot(`tab-${tab.name}`), tab.pageId);
    await page.screenshot({ path: path.join(output, `tab-${tab.name}.png`) });
  }
  await page.locator('#communityProfileClose').click();
  check(await page.locator('#communityProfileDialog').evaluate(element => element.hidden), 'community close button must close the panel');

  await page.evaluate(() => openCommunityMessages({ feId: '87654321', username: '本地测试好友' }));
  await page.waitForTimeout(600);
  const messages = await snapshot('friend-messages-after-late-init');
  check(messages.messageHead.effectiveOpacity > .99 && messages.messageHead.width > 0, 'friend message heading must be visible');
  check(messages.messageStage.effectiveOpacity > .99 && messages.messageStage.height > 0, 'friend message content must be visible');
  check(messages.messageStage.text.includes('本地浏览器回归消息'), 'friend message fixture must render through the production API client');
  await page.screenshot({ path: path.join(output, 'friend-messages.png') });
  await page.locator('#communityMessageClose').click();
  check(await page.locator('#communityMessageDialog').evaluate(element => element.hidden), 'friend message close button must work');
  await page.close();

  // The opposite order must still defer interactive services until the user
  // enters; fixing the race must not start background work on the boot screen.
  await newPage();
  await page.waitForFunction(() => desktopSceneRuntime.ready);
  const normalBoot = await snapshot('init-completed-before-boot-entry');
  check(normalBoot.interactiveServices === 'deferred' && normalBoot.servicesStarted === false, 'normal startup must remain deferred until boot entry');
  await page.locator('#bootLogoButton').click();
  await page.waitForFunction(() => bootVisual.servicesStarted && document.getElementById('bootScreen').hidden);
  await page.locator('#communityRailButton').click();
  await page.locator('#communityAvatar').click();
  await page.waitForTimeout(600);
  checkProfile(await snapshot('community-after-normal-init'), 'communityProfileSelfPage');
  await page.locator('#communityProfileClose').click();
  check(await page.locator('#communityProfileDialog').evaluate(element => element.hidden), 'normal startup community close button must work');
  check(report.browserErrors.length === 0, 'the complete app must not throw browser errors');
  check(report.networkErrors.length === 0, 'production local resources must load successfully');
  report.ok = report.failures.length === 0;
  assert.deepEqual(report.failures, [], 'community boot race browser regression');
} catch (error) {
  report.error = error.stack || String(error);
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  releasePresets();
  report.requests = requests;
  writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, failures: report.failures, output }));
  await browser?.close();
  server.closeAllConnections?.();
  await new Promise(resolve => server.close(resolve));
}
