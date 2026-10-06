import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(root, 'web/search-window.js'), 'utf8');
const panelMarkup = readFileSync(path.join(root, 'web/index.html'), 'utf8')
  .match(/<section class="search-results-window"[\s\S]*?<\/section>/)?.[0];
assert.ok(panelMarkup, 'production search panel markup missing');
const require = createRequire(import.meta.url);
let chromium;
for (const candidate of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright',
  path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch {}
}
assert.ok(chromium, 'Playwright is required');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ headless: true,
  ...(existsSync(edge) ? { executablePath: edge } : {}) });
const errors = [];
async function fixture(script) {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('crash', () => errors.push('renderer crashed'));
  await page.setContent(`<input id="topSearchInput" value="测试歌曲">
    <section id="searchSuggestions"></section>${panelMarkup}`);
  await page.evaluate(() => {
    window.probe = { observerCalls: 0, loopDetected: false, ticks: 0, searches: 0 };
    const NativeObserver = window.MutationObserver;
    window.MutationObserver = class extends NativeObserver {
      constructor(callback) {
        super((records, observer) => {
          window.probe.observerCalls += 1;
          // Bound the known-broken variant so this regression test itself
          // never leaves a frozen renderer or waits for a watchdog restart.
          if (window.probe.observerCalls > 500) {
            observer.disconnect(); window.probe.loopDetected = true; return;
          }
          callback(records, observer);
        });
      }
    };
    setInterval(() => { window.probe.ticks += 1; }, 5);
    window.FeMonsterSearchContext = {
      activeProvider: () => 'fixture', providerLabel: () => '测试平台',
      isSongFavorite: () => window.probe.favorite === true,
      toggleFavoriteSong: () => (window.probe.favorite = !window.probe.favorite),
      playSearchSuggestion: async (song) => { window.probe.playedSong = song.id; },
      searchCurrentPlatformSongs: async () => {
        window.probe.searches += 1;
        return { songs: Array.from({ length: 6 }, (_, index) => ({ id: index, title: `测试歌曲 ${index}` })) };
      }
    };
  });
  await page.addScriptTag({ content: script });
  return page;
}
try {
  const brokenSource = source.replace('if (countEl && countEl.textContent !== countText)', 'if (countEl)');
  assert.notEqual(brokenSource, source, 'production loop guard missing');
  const legacy = await fixture(brokenSource);
  await legacy.evaluate(async () => {
    document.getElementById('searchSuggestions').innerHTML = '<button class="search-suggestion-item">歌曲</button>';
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  assert.equal(await legacy.evaluate(() => window.probe.loopDetected), true,
    'regression fixture did not reproduce the previous runaway observer');
  await legacy.close();

  const page = await fixture(source);
  const repeated = await page.evaluate(async () => {
    const section = document.getElementById('searchSuggestions');
    for (let round = 0; round < 80; round += 1) {
      const count = round % 12;
      const items = Array.from({ length: count }, (_, index) => {
        const item = document.createElement('button');
        item.className = 'search-suggestion-item'; item.textContent = `歌曲 ${round}-${index}`;
        return item;
      });
      section.replaceChildren(...items);
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (section.querySelectorAll('.search-suggestion-expand').length !== (count ? 1 : 0)) {
        throw new Error(`duplicate/missing expand control on round ${round}`);
      }
      if (count && section.querySelector('.search-suggestion-expand span:last-child').textContent !== `${count} 首 · 查看全部`) {
        throw new Error(`stale result count on round ${round}`);
      }
    }
    const settled = window.probe.observerCalls;
    await new Promise((resolve) => setTimeout(resolve, 60));
    return { ...window.probe, settled, finalCalls: window.probe.observerCalls };
  });
  assert.equal(repeated.loopDetected, false);
  assert.equal(repeated.settled, repeated.finalCalls, 'observer kept running after search results settled');
  assert.ok(repeated.ticks > 5, 'search updates starved the UI event loop');
  assert.ok(repeated.observerCalls < 250, 'too many observer deliveries for 80 searches');
  // Match the production cascade, including the global black-gold theme that
  // previously overrode all three pictured controls with black containers.
  for (const file of ['border-glow-buttons.css', 'styles.css', 'search-window.css', 'black-gold-buttons.css']) {
    await page.addStyleTag({ content: readFileSync(path.join(root, 'web', file), 'utf8') });
  }
  await page.locator('.search-suggestion-expand').click();
  await page.waitForFunction(() => document.querySelectorAll('.search-results-window-item').length === 6);
  assert.equal(await page.evaluate(() => window.probe.searches), 1);
  await page.locator('.search-results-window-play').first().click();
  assert.equal(await page.evaluate(() => window.probe.playedSong), 0, 'song selection stopped playing');
  assert.equal(await page.locator('#searchResultsWindow').evaluate((element) => element.hidden), false,
    'selecting a song automatically closed the search results');
  assert.equal(await page.locator('.search-results-window-item').count(), 6,
    'selecting a song cleared the current results');
  const selectors = ['#searchResultsWindowClose', '.search-results-window-favorite', '#searchResultsWindowRefresh'];
  const appearanceChecks = [];
  async function assertBare(selector, state) {
    const style = await page.locator(selector).first().evaluate((element) => {
      const computed = getComputedStyle(element);
      return { background: computed.backgroundColor, image: computed.backgroundImage,
        shadow: computed.boxShadow, border: computed.borderTopWidth,
        outline: computed.outlineStyle, outlineWidth: computed.outlineWidth };
    });
    assert.equal(style.background, 'rgba(0, 0, 0, 0)', `${selector} ${state}: nontransparent background`);
    assert.equal(style.image, 'none', `${selector} ${state}: background image remains`);
    assert.equal(style.shadow, 'none', `${selector} ${state}: container shadow remains`);
    assert.equal(style.border, '0px', `${selector} ${state}: container border remains`);
    appearanceChecks.push({ selector, state });
    return style;
  }
  for (const mode of ['browser', 'embedded']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.feClient = value;
      document.documentElement.dataset.fePlatform = value === 'embedded' ? 'desktop' : 'web';
    }, mode);
    for (const selector of selectors) {
      await page.mouse.move(0, 0);
      await assertBare(selector, `${mode}:default`);
      await page.locator(selector).first().hover();
      await assertBare(selector, `${mode}:hover`);
      await page.mouse.down();
      try { await assertBare(selector, `${mode}:pressed`); }
      finally { await page.mouse.move(0, 0); await page.mouse.up(); }
    }
  }
  await page.locator('.search-results-window-favorite').first().click();
  assert.equal(await page.evaluate(() => window.probe.favorite), true, 'favorite action stopped working');
  await assertBare('.search-results-window-favorite', 'selected');
  await page.locator('#topSearchInput').focus();
  await page.keyboard.press('Tab');
  await page.locator('#searchResultsWindowClose').focus();
  const focusStyle = await assertBare('#searchResultsWindowClose', 'keyboard-focus');
  assert.notEqual(focusStyle.outline, 'none', 'keyboard focus indication was removed');
  assert.equal(focusStyle.outlineWidth, '2px');
  await page.locator('#searchResultsWindowRefresh').click();
  assert.equal(await page.evaluate(() => window.probe.searches), 2, 'refresh action stopped working');
  const output = path.join(root, 'output/playwright/search-bare-buttons');
  mkdirSync(output, { recursive: true });
  await page.mouse.move(0, 0);
  await page.locator('#searchResultsWindowRefresh').evaluate((element) => element.blur());
  await page.locator('#searchResultsWindow').screenshot({ path: path.join(output, 'search-panel.png') });
  await page.locator('#searchResultsWindowClose').click();
  assert.equal(await page.locator('#searchResultsWindow').evaluate((element) => element.hidden), true);
  await page.locator('.search-suggestion-expand').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#searchResultsWindow').evaluate((element) => element.hidden), true);
  await page.locator('#topSearchInput').fill('仍可继续输入');
  assert.equal(await page.locator('#topSearchInput').inputValue(), '仍可继续输入');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, oldLoopReproduced: true, repeatedSearches: 80,
    observerCalls: repeated.observerCalls, uiTicks: repeated.ticks, expandedSearchWorks: true,
    escapeAndTypingResponsive: true, bareButtonAppearanceChecks: appearanceChecks.length,
    favoriteRefreshAndCloseWork: true, playbackKeepsWindowOpen: true,
    keyboardFocusPreserved: true, rendererErrors: errors }));
} finally {
  await browser.close();
}
