import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = String(process.env.FE_TEST_BASE_URL || 'http://127.0.0.1:31881').replace(/\/$/, '');
const debugPort = 19000 + (process.pid % 10000);
const profile = path.resolve(tmpdir(), `fe-monster-cover-palette-${process.pid}`);
const screenshotPath = path.resolve('artifacts', 'playback-cover-palette-live.png');
const qualityMenuScreenshotPath = path.resolve('artifacts', 'playback-quality-menu-live.png');
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
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Edge is still starting.
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
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No Edge page target was found');
  socket = new WebSocket(page.webSocketDebuggerUrl);
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

  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });
  await command('Page.navigate', { url: `${baseUrl}/?cover-palette-qa=${Date.now()}` });
  await waitFor(`document.readyState === 'complete'
    && typeof refreshPlayerState === 'function'
    && state.playbackVisual.particles.length > 0
    && document.getElementById('diyNoTextPreset')?.classList.contains('is-active')`);
  await evaluate(`(async () => {
    const boot = document.getElementById('bootScreen');
    if (boot) boot.hidden = true;
    await refreshPlayerState();
    renderCurrent(state.currentSong);
    const lyricScene = document.getElementById('playbackLyricScene');
    const cardLyrics = document.getElementById('qishuiPlaybackLyrics');
    const playerDock = document.querySelector('.player-dock');
    const qualityButton = document.getElementById('qishuiPlaybackQuality');
    const qualityMenu = document.getElementById('qishuiPlaybackQualityMenu');
    const defaultWallpaperPass = state.playbackPage
      && state.diyPage === 'wallpaper'
      && state.diyPreset === 'wallpaper'
      && state.textPreset === 'none'
      && lyricScene?.hidden
      && !cardLyrics?.hidden
      && getComputedStyle(cardLyrics).display !== 'none';
    const mainParticleBallRemovedPass = state.particles.length === 0
      && typeof window.initParticles === 'undefined';
    const oldPlayerDockRemovedPass = playerDock?.getAttribute('aria-hidden') === 'true'
      && getComputedStyle(playerDock).display === 'none';
    setTextPreset('depth');
    const depthPresetButtonsPass = document.getElementById('diyLyricPreset')
      ?.classList.contains('is-active')
      && Array.from(document.querySelectorAll('[data-inline-text-presets]'))
        .every((group) => !!group.querySelector('[data-text-preset="depth"].is-active'));
    const lyricsEnabledPass = state.textPreset === 'depth'
      && !lyricScene?.hidden
      && !cardLyrics?.hidden
      && getComputedStyle(cardLyrics).display !== 'none'
      && depthPresetButtonsPass;
    const lyricsEnabledDetails = {
      lyricPreset: state.textPreset,
      lyricSceneHidden: lyricScene?.hidden,
      cardLyricsHidden: cardLyrics?.hidden,
      depthPresetButtonsPass
    };
    enterPresetPlaybackPage('lyric');
    document.getElementById('homeButton')?.click();
    const wallpaperHomeNavigationPass = state.playbackPage
      && state.diyPage === 'wallpaper'
      && state.diyPreset === 'wallpaper'
      && state.textPreset === 'none'
      && lyricScene?.hidden
      && !cardLyrics?.hidden
      && getComputedStyle(cardLyrics).display !== 'none';
    qualityButton?.click();
    const qualityOptions = Array.from(
      qualityMenu?.querySelectorAll('.dock-quality-option') || []
    );
    const playbackQualityControlPass = !!qualityButton
      && !qualityButton.disabled
      && qualityButton.getAttribute('aria-expanded') === 'true'
      && !qualityMenu?.hidden
      && qualityOptions.length >= 1
      && qualityOptions.some((button) => button.classList.contains('is-active'));
    qualityButton?.click();
    window.__defaultWallpaperQa = {
      defaultWallpaperPass,
      mainParticleBallRemovedPass,
      oldPlayerDockRemovedPass,
      lyricsEnabledPass,
      wallpaperHomeNavigationPass,
      playbackQualityControlPass,
      defaultWallpaperQaDetails: {
        playerDockHidden: playerDock?.hidden,
        playerDockAriaHidden: playerDock?.getAttribute('aria-hidden'),
        playerDockDisplay: playerDock ? getComputedStyle(playerDock).display : '',
        lyricsEnabledDetails
      }
    };
    return true;
  })()`, true);
  await waitFor(`(() => {
    const image = document.getElementById('qishuiPlaybackCover');
    return !!state.currentSong?.cover && !!image?.complete && image.naturalWidth > 0;
  })()`);
  await delay(900);
  await evaluate(`(() => {
    if (state.lyricLines.length >= 8) return false;
    state.lyricLines = Array.from({ length: 12 }, (_, index) => ({
      time: index * 4,
      text: 'Playback lyric line ' + String(index + 1).padStart(2, '0')
    }));
    state.lyricIndex = 3;
    state.playerClock = {
      position: 12,
      duration: 48,
      updatedAt: performance.now(),
      playing: false
    };
    updateQishuiPlaybackLyrics(state.lyricLines[3].text, state.lyricLines[4].text, 12);
    window.__playbackLyricFixtureUsed = true;
    return true;
  })()`, true);
  await waitFor(`state.lyricLines.length >= 8
    && document.querySelectorAll('#qishuiPlaybackLyricPage .qishui-playback-lyric-line').length >= 8`, 6000);

  const result = await evaluate(`(() => {
    const phone = document.getElementById('qishuiPlaybackPhone');
    const image = document.getElementById('qishuiPlaybackCover');
    const sampled = sampleCoverPalette(image);
    const parse = (value) => {
      const channels = String(value).match(/[0-9.]+/g)?.map(Number) || [];
      return { r: channels[0] || 0, g: channels[1] || 0, b: channels[2] || 0, a: channels[3] ?? 1 };
    };
    const names = ['--playback-cover-a', '--playback-cover-b', '--playback-cover-c'];
    const values = names.map((name) => phone.style.getPropertyValue(name).trim());
    const actual = values.map(parse);
    const expected = sampled?.coverColors?.slice(0, 3).map((color, index) => (
      playbackGlowColor(color, index)
    )) || [];
    const distances = actual.map((color, index) => {
      const target = expected[index] || { r: 0, g: 0, b: 0 };
      return Math.hypot(color.r - target.r, color.g - target.g, color.b - target.b);
    });
    const luminances = actual.map((color) => (
      (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255
    ));
    const averageLuminance = luminances.reduce((sum, value) => sum + value, 0) / Math.max(1, luminances.length);
    const pipelinePass = !!sampled
      && expected.length === 3
      && distances.every((distance) => distance < 2)
      && actual.every((color) => color.a > 0 && color.a < 1);
    const visiblyColored = averageLuminance >= 0.32
      && Math.max(...luminances) >= 0.45
      && actual.every((color) => color.a >= 0.4 && color.a <= 0.72);
    const alternateCoverFieldsPass = coverUrl({ picUrl: state.currentSong.cover }) === coverUrl(state.currentSong)
      && coverUrl({ albumPic: state.currentSong.cover }) === coverUrl(state.currentSong)
      && coverUrl({ al: { picUrl: state.currentSong.cover } }) === coverUrl(state.currentSong);
    names.forEach((name) => phone.style.removeProperty(name));
    renderQishuiPlaybackCard(state.currentSong);
    const restoredValues = names.map((name) => phone.style.getPropertyValue(name).trim());
    const paletteRestorePass = restoredValues.every((value, index) => value === values[index]);
    const provider = playbackCardProvider(state.currentSong);
    const accountPayload = state.loginStatusByProvider[provider.id] || {};
    const accountElement = document.getElementById('qishuiPlaybackAccount');
    const accountAvatarElement = document.getElementById('qishuiPlaybackAccountAvatar');
    const accountAvatarImage = document.getElementById('qishuiPlaybackAccountAvatarImage');
    const accountNameElement = document.getElementById('qishuiPlaybackAccountName');
    const accountStatusElement = document.getElementById('qishuiPlaybackAccountStatus');
    const vipBadge = document.getElementById('qishuiPlaybackVipBadge');
    const expectedVipLabel = accountPayload.loggedIn ? accountVipLabel(accountPayload) : '';
    const expectedAccountName = accountPayload.loggedIn
      ? accountName(accountPayload) || provider.label + '用户'
      : provider.label + '未登录';
    const platformIdentityPass = accountElement?.dataset.provider === provider.id
      && accountNameElement?.textContent === expectedAccountName
      && !!accountStatusElement?.textContent
      && vipBadge?.hidden === !expectedVipLabel
      && (!expectedVipLabel || vipBadge.textContent === expectedVipLabel)
      && (!accountPayload.loggedIn
        || !accountAvatar(accountPayload)
        || (accountAvatarElement?.classList.contains('has-avatar') && !!accountAvatarImage?.src));
    const contentStyle = getComputedStyle(document.querySelector('.qishui-playback-content'));
    const toolStyle = getComputedStyle(document.querySelector('#qishuiPlaybackTools button'));
    const lyricSample = document.getElementById('qishuiPlaybackLyricNext')
      || document.querySelector('#qishuiPlaybackLyricPage .qishui-playback-lyric-line:not(.is-current)')
      || document.querySelector('#qishuiPlaybackLyricPage .qishui-playback-lyric-line');
    const lyricSampleText = lyricSample?.querySelector('.book-lyric-line-text') || lyricSample;
    const lyricSampleStyle = lyricSampleText ? getComputedStyle(lyricSampleText) : null;
    const artistStyle = getComputedStyle(document.getElementById('qishuiPlaybackArtist'));
    const playbackLyricLineCount = document.querySelectorAll(
      '#qishuiPlaybackLyricPage .qishui-playback-lyric-line'
    ).length;
    const fullPlaybackLyricsPass = state.lyricLines.length >= 8
      && playbackLyricLineCount === state.lyricLines.length;
    const colorAlpha = (value) => {
      const channels = String(value).match(/[0-9.]+/g)?.map(Number) || [];
      return channels[3] ?? 1;
    };
    const textClarityPass = !!lyricSampleStyle
      && contentStyle.transform === 'none'
      && Number.parseFloat(toolStyle.fontSize) >= 10
      && Number.parseFloat(lyricSampleStyle.fontSize) >= 12
      && Number.parseFloat(artistStyle.fontSize) >= 11
      && colorAlpha(lyricSampleStyle.color) >= 0.7
      && colorAlpha(artistStyle.color) >= 0.75
      && Number.parseFloat(lyricSampleStyle.fontWeight) >= 600
      && lyricSampleStyle.filter === 'none'
      && artistStyle.textShadow !== 'none';
    const defaultWallpaperQa = window.__defaultWallpaperQa || {};
    const cacheToken = '20260720-playback-lyric-color-14';
    const appScript = Array.from(document.scripts).find((script) => script.src.includes('/app.js'));
    const styleLink = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .find((link) => link.href.includes('/styles.css'));
    const cacheVersionPass = appScript?.src.includes(cacheToken) && styleLink?.href.includes(cacheToken);
    const pass = pipelinePass
      && visiblyColored
      && alternateCoverFieldsPass
      && paletteRestorePass
      && platformIdentityPass
      && textClarityPass
      && fullPlaybackLyricsPass
      && [
        defaultWallpaperQa.defaultWallpaperPass,
        defaultWallpaperQa.mainParticleBallRemovedPass,
        defaultWallpaperQa.oldPlayerDockRemovedPass,
        defaultWallpaperQa.lyricsEnabledPass,
        defaultWallpaperQa.wallpaperHomeNavigationPass,
        defaultWallpaperQa.playbackQualityControlPass
      ].every(Boolean)
      && cacheVersionPass;
    return {
      pass,
      pipelinePass,
      visiblyColored,
      alternateCoverFieldsPass,
      paletteRestorePass,
      platformIdentityPass,
      textClarityPass,
      fullPlaybackLyricsPass,
      playbackLyricLineCount,
      stateLyricLineCount: state.lyricLines.length,
      lyricFixtureUsed: window.__playbackLyricFixtureUsed === true,
      ...defaultWallpaperQa,
      cacheVersionPass,
      song: {
        id: state.currentSong?.id || '',
        title: state.currentSong?.title || '',
        cover: state.currentSong?.cover || ''
      },
      image: {
        src: image?.currentSrc || image?.src || '',
        width: image?.naturalWidth || 0,
        height: image?.naturalHeight || 0
      },
      signature: state.playbackVisual.coverSignature,
      values,
      restoredValues,
      actual,
      expected,
      distances,
      luminances,
      averageLuminance
    };
  })()`);
  const screenshot = await command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });
  mkdirSync(path.dirname(screenshotPath), { recursive: true });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  result.screenshot = screenshotPath;
  await evaluate(`(() => {
    const button = document.getElementById('qishuiPlaybackQuality');
    if (button && button.getAttribute('aria-expanded') !== 'true') button.click();
    return true;
  })()`);
  await delay(180);
  const qualityMenuScreenshot = await command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });
  writeFileSync(qualityMenuScreenshotPath, Buffer.from(qualityMenuScreenshot.data, 'base64'));
  result.qualityMenuScreenshot = qualityMenuScreenshotPath;
  await evaluate(`(() => {
    const button = document.getElementById('qishuiPlaybackQuality');
    if (button && button.getAttribute('aria-expanded') === 'true') button.click();
    return true;
  })()`);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.pass ? 0 : 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
    stdio: 'ignore',
    windowsHide: true
  });
  await delay(250);
  const tempRoot = `${path.resolve(tmpdir())}${path.sep}`;
  if (profile.startsWith(tempRoot) && existsSync(profile)) {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
}
