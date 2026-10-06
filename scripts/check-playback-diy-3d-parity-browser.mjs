import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const app = read('web/app.js');
const start = app.indexOf('function updateDiySidebarFromPointer(');
const end = app.indexOf('\nfunction postNativeWindowAction(', start);
assert.ok(start >= 0 && end > start);
const require = createRequire(import.meta.url);
let chromium;
for (const candidate of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright',
  path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch {}
}
assert.ok(chromium, 'Playwright is required');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(edge) ? { executablePath: edge } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.setContent(`<div class="app-shell is-diy-open has-diy-card"><aside id="diySidebar" class="diy-sidebar">
    <header class="diy-sidebar-head"><strong>场景 / 文字</strong></header>
    <section id="diyPresetPage"><div class="diy-preset-grid"><button class="diy-preset-card" data-preset="cube"><strong>场景</strong></button></div></section>
    <section id="diyTextPage" hidden><div class="diy-preset-grid"><button class="diy-preset-card" data-text-preset="depth"><strong>文字</strong></button></div></section>
    </aside></div>`);
  for (const file of ['styles.css', 'playback-card.css', 'playback-bar-enhancements.css', 'black-gold-buttons.css']) {
    await page.addStyleTag({ content: read(`web/${file}`) });
  }
  await page.addStyleTag({ content: '.diy-sidebar,.diy-preset-card {transition:none!important}' });
  await page.evaluate(() => {
    window.els = { diySidebar: document.getElementById('diySidebar') };
    window.state = { diyCardOpen: true, diyCardDrag: null, diyCardYaw: -8, diyCardPitch: 2 };
    window.clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    window.saveVisualSettingsPreferences = () => {};
  });
  await page.addScriptTag({ content: app.slice(start, end) });
  await page.evaluate(() => {
    const sidebar = document.getElementById('diySidebar');
    sidebar.addEventListener('pointerdown', beginDiyCardRotation);
    sidebar.addEventListener('pointermove', moveDiyCardRotation);
    sidebar.addEventListener('pointerup', endDiyCardRotation);
    sidebar.addEventListener('pointercancel', endDiyCardRotation);
    sidebar.addEventListener('lostpointercapture', endDiyCardRotation);
  });
  const cases = [];
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const type of ['preset', 'text']) {
      const snapshots = {};
      for (const mode of ['diy', 'playback']) {
        await page.mouse.move(0, 0);
        await page.evaluate(({ mode, type }) => {
          document.querySelector('.app-shell').className = mode === 'diy' ? 'app-shell is-diy-open has-diy-card'
            : 'app-shell has-qishui-playback-card is-playback-page is-diy-open has-diy-card is-playback-diy-panel-open';
          document.getElementById('diyPresetPage').hidden = type !== 'preset';
          document.getElementById('diyTextPage').hidden = type !== 'text';
          state.diyCardYaw = -8; state.diyCardPitch = 2; state.diyCardDrag = null;
          els.diySidebar.style.setProperty('--diy-card-hover-yaw', '0deg');
          els.diySidebar.style.setProperty('--diy-card-hover-pitch', '0deg');
          updateDiyCardRotation();
        }, { mode, type });
        const rest = await page.locator('#diySidebar').evaluate((element) => getComputedStyle(element).transform);
        const hover = await page.evaluate(() => {
          const element = els.diySidebar;
          const box = element.getBoundingClientRect();
          updateDiySidebarFromPointer({ clientX: box.left + box.width * .85, clientY: box.top + box.height * .2 });
          return { transform: getComputedStyle(element).transform,
            yaw: element.style.getPropertyValue('--diy-card-hover-yaw'),
            pitch: element.style.getPropertyValue('--diy-card-hover-pitch') };
        });
        assert.notEqual(hover.transform, rest, `${mode} ${type}: pointer hover did not rotate the card`);
        const card = page.locator(type === 'preset' ? '[data-preset="cube"]' : '[data-text-preset="depth"]');
        await card.hover();
        await page.waitForFunction((selector) => {
          const transform = new DOMMatrixReadOnly(getComputedStyle(document.querySelector(selector)).transform);
          return transform.m43 > 23.99 && transform.m11 > 1.0519;
        }, type === 'preset' ? '[data-preset="cube"]' : '[data-text-preset="depth"]');
        await card.evaluate((element) => Promise.all(element.getAnimations()
          .filter((animation) => Number.isFinite(animation.effect.getTiming().iterations))
          .map((animation) => animation.finished.catch(() => {}))));
        const lift = await card.evaluate((element) => getComputedStyle(element).transform);
        const header = await page.locator('.diy-sidebar-head').boundingBox();
        await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2);
        await page.mouse.down();
        await page.mouse.move(header.x + header.width / 2 + 35, header.y + header.height / 2 + 15, { steps: 4 });
        await page.mouse.up();
        const drag = await page.evaluate(() => ({ yaw: state.diyCardYaw, pitch: state.diyCardPitch,
          dragging: state.diyCardDrag !== null, transform: getComputedStyle(els.diySidebar).transform }));
        assert.ok(Math.abs(drag.yaw + 8) > 10, `${mode} ${type}: header drag did not change yaw`);
        assert.equal(drag.dragging, false, 'drag state was not released');
        snapshots[mode] = { rest, hover, lift, drag };
      }
      assert.equal(snapshots.playback.rest, snapshots.diy.rest, `${type}: resting 3D transforms differ`);
      assert.equal(snapshots.playback.hover.transform, snapshots.diy.hover.transform, `${type}: hover 3D transforms differ`);
      assert.equal(snapshots.playback.lift, snapshots.diy.lift, `${type}: preset thumbnail lift differs`);
      cases.push({ width, type, sharedHover: true, sharedDrag: true, sharedPresetLift: true });
    }
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, cases, browserErrors: errors }));
} finally {
  await browser.close();
}
