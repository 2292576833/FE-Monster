import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const webRoot = path.join(root, 'web');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profileDir = path.join(root, 'tmp', `.identity-card-browser-${process.pid}`);
const production = readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(existsSync(edge), `Microsoft Edge was not found: ${edge}`);

function extract(startMarker, endMarker) {
  const start = production.indexOf(startMarker);
  const end = production.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `production markup is missing: ${startMarker}`);
  return production.slice(start, end);
}

const trigger = extract('<button class="community-identity-card-trigger"', '<button class="community-broadcast-button"');
const dialog = extract('<section class="fe-identity-card-dialog"', '<section class="update-dialog"');
const fixture = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="/black-gold-buttons.css">
  <link rel="stylesheet" href="/fe-identity-card.css">
  <style>html,body{margin:0;width:100%;height:100%;background:#15120d}.community-card{position:fixed;left:20px;top:20px;width:480px}.community-card__head{display:grid}.community-profile{display:grid;color:white}</style>
</head><body>
  <section class="community-card"><div class="community-card__head">
    <span class="community-avatar">FE</span><span class="community-profile"><strong id="communityName"><span>星潮</span></strong></span>
    ${trigger}
  </div><strong id="communityFeId">12345678</strong></section>
  ${dialog}
  <script>
    localStorage.setItem('fe-monster-active-provider-v1', 'qq');
    localStorage.removeItem('fe-monster-identity-card-muted-v1');
    window.__requests = [];
    window.__equippedId = 'classic';
    window.__identityState = (equippedId = 'classic') => ({
      ok: true,
      feId: '12345678',
      nickname: '星潮',
      equippedId,
      equipped: equippedId === 'night'
        ? { id: 'night', label: '夜幕黑金', material: 'black-gold', finish: 'satin', primaryColor: '#13579B', secondaryColor: '#2468AC', accentColor: '#F05A7E', frontColor: '#0B3D91', backColor: '#7A1F5B', borderColor: '#19E6C3', metalness: 0.37, roughness: 0.73, bevel: 7.25, sweepIntensity: 1.41, engravingDepth: 0.29, entranceAnimationId: 'fe-soft', issuedByServer: true, nicknameEditable: false, engravedNickname: '夜幕限定' }
        : { id: 'classic', label: '经典黄金', material: 'polished-gold', finish: 'polished', primaryColor: '#D79A24', secondaryColor: '#6A3308', accentColor: '#FFF1A8', entranceAnimationId: 'fe-intro', nicknameEditable: true },
      owned: [
        { id: 'classic', label: '经典黄金', material: 'polished-gold', finish: 'polished', primaryColor: '#D79A24', secondaryColor: '#6A3308', accentColor: '#FFF1A8', entranceAnimationId: 'fe-intro', nicknameEditable: true },
        { id: 'night', label: '夜幕黑金', material: 'black-gold', finish: 'satin', primaryColor: '#13579B', secondaryColor: '#2468AC', accentColor: '#F05A7E', frontColor: '#0B3D91', backColor: '#7A1F5B', borderColor: '#19E6C3', metalness: 0.37, roughness: 0.73, bevel: 7.25, sweepIntensity: 1.41, engravingDepth: 0.29, entranceAnimationId: 'fe-soft', issuedByServer: true, nicknameEditable: false, engravedNickname: '夜幕限定' }
      ],
      animations: [
        { id: 'fe-intro', soundCue: 'crisp-metal', stages: [{ kind: 'corner-lift', durationMs: 220 }, { kind: 'spin', durationMs: 240 }, { kind: 'fall-flat', durationMs: 210 }, { kind: 'float-front', durationMs: 290 }] },
        { id: 'fe-soft', soundCue: 'soft-metal', stages: [{ kind: 'item-rise', durationMs: 240 }, { kind: 'settle', durationMs: 180 }] }
      ]
    });
    window.fetch = async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      window.__requests.push({ url: String(url), method: options.method || 'GET', body });
      if (String(url).includes('/equip')) {
        window.__equippedId = body.cardId;
        return { ok: true, status: 200, json: async () => window.__identityState(window.__equippedId) };
      }
      if (String(url).includes('/profile')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, profile: { feId: '12345678', username: body.username } }) };
      }
      return { ok: true, status: 200, json: async () => window.__identityState(window.__equippedId) };
    };
  </script>
  <script src="/fe-identity-card.js"></script>
</body></html>`;

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(fixture);
    return;
  }
  const file = path.resolve(webRoot, decodeURIComponent(url.pathname.slice(1)));
  if (!file.startsWith(`${webRoot}${path.sep}`) || !existsSync(file)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(readFileSync(file));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
mkdirSync(profileDir, { recursive: true });
const port = server.address().port;
const browser = spawn(edge, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--remote-allow-origins=*',
  '--remote-debugging-port=0',
  `--user-data-dir=${profileDir}`,
  '--window-size=1180,820',
  'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

let browserError = '';
browser.stderr.on('data', (chunk) => { browserError += String(chunk); });
let socket;
let nextId = 1;
const pending = new Map();

async function debugPort() {
  const file = path.join(profileDir, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(file)) {
      try {
        const value = Number.parseInt(readFileSync(file, 'utf8').split(/\r?\n/, 1)[0], 10);
        if (value > 0) return value;
      } catch {}
    }
    await delay(60);
  }
  throw new Error(`Edge debugging endpoint did not start: ${browserError.trim()}`);
}

async function retryJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await delay(60);
  }
  throw new Error('Edge target list was unavailable');
}

function command(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`DevTools command timed out: ${method}`));
    }, 15_000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = false) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

try {
  const devtoolsPort = await debugPort();
  const targets = await retryJson(`http://127.0.0.1:${devtoolsPort}/json/list`);
  const target = targets.find((item) => item.type === 'page');
  assert.ok(target?.webSocketDebuggerUrl, 'Edge page target was unavailable');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1180,
    height: 820,
    deviceScaleFactor: 1.25,
    mobile: false
  });
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate('Boolean(window.FeMonsterIdentityCard)')) break;
    await delay(50);
  }

  await evaluate(`window.dispatchEvent(new CustomEvent('fe-monster-community-profile', { detail: {
    loggedIn: true, hasCommunityIdentity: true, provider: 'qq',
    profile: { feId: '12345678', username: '星潮' }
  }})); document.getElementById('communityIdentityCardButton').click();`);
  await delay(130);

  const picker = await evaluate(`(() => ({
    dialogHidden: document.getElementById('feIdentityCardDialog').hidden,
    menuHidden: document.getElementById('communityIdentityCardMenu').hidden,
    expanded: document.getElementById('communityIdentityCardButton').getAttribute('aria-expanded'),
    cards: document.querySelectorAll('[data-identity-card-id]').length
  }))()`);
  assert.deepEqual(picker, { dialogHidden: true, menuHidden: false, expanded: 'true', cards: 2 },
    'single-clicking the community card icon must open the direct card picker, not the showcase');
  const pickerScreenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(path.join(root, 'artifacts', 'community-identity-card-picker.png'), Buffer.from(pickerScreenshot.data, 'base64'));

  await evaluate(`(async () => {
    document.querySelector('[data-identity-card-id="night"]').click();
    await new Promise((resolve) => setTimeout(resolve, 40));
  })()`, true);
  const directEquip = await evaluate(`({
    equippedId: window.FeMonsterIdentityCard.snapshot().equippedId,
    menuHidden: document.getElementById('communityIdentityCardMenu').hidden,
    dialogHidden: document.getElementById('feIdentityCardDialog').hidden,
    triggerMaterial: document.getElementById('communityIdentityCardButton').dataset.material,
    triggerPrimary: document.getElementById('communityIdentityCardButton').style.getPropertyValue('--community-card-primary'),
    request: window.__requests.filter((item) => item.url.includes('/equip')).at(-1)
  })`);
  assert.equal(directEquip.equippedId, 'night');
  assert.equal(directEquip.menuHidden, true, 'single-click replacement must close the picker');
  assert.equal(directEquip.dialogHidden, false, 'single-click replacement must immediately showcase the selected card');
  assert.equal(directEquip.triggerMaterial, 'black-gold', 'community identity-card icon did not reflect the equipped material');
  assert.equal(directEquip.triggerPrimary.toUpperCase(), '#0B3D91', 'community identity-card icon did not reflect the server-defined front color');
  assert.equal(directEquip.request.body.cardId, 'night');
  await delay(130);

  const opened = await evaluate(`(() => {
    const dialog = document.getElementById('feIdentityCardDialog');
    const card = document.getElementById('feIdentityCard');
    const stage = document.getElementById('feIdentityCardStage');
    const front = document.getElementById('feIdentityCardFront');
    const trigger = document.getElementById('communityIdentityCardButton');
    const backdrop = dialog.querySelector('.fe-identity-card__backdrop');
    const viewer = dialog.querySelector('.fe-identity-card__viewer');
    const rect = card.getBoundingClientRect();
    const cardStyle = getComputedStyle(card);
    const frontStyle = getComputedStyle(front);
    const backStyle = getComputedStyle(document.getElementById('feIdentityCardBack'));
    const triggerStyle = getComputedStyle(trigger);
    const backdropStyle = getComputedStyle(backdrop);
    const viewerStyle = getComputedStyle(viewer);
    const nicknameStyle = getComputedStyle(document.getElementById('feIdentityCardNickname'));
    return {
      hidden: dialog.hidden,
      feId: document.getElementById('feIdentityCardFeId').textContent,
      nickname: document.getElementById('feIdentityCardNickname').textContent,
      cards: document.querySelectorAll('[data-identity-card-id]').length,
      stageActive: stage.classList.contains('is-entering') || stage.classList.contains('is-showcasing'),
      ratio: card.offsetWidth / card.offsetHeight,
      declaredRatio: getComputedStyle(card).aspectRatio,
      backface: getComputedStyle(front).backfaceVisibility,
      withinViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      request: window.__requests[0],
      material: card.dataset.material,
      materialStyle: {
        primary: frontStyle.getPropertyValue('--card-base').trim(),
        secondary: frontStyle.getPropertyValue('--card-deep').trim(),
        accent: frontStyle.getPropertyValue('--card-highlight').trim(),
        front: cardStyle.getPropertyValue('--card-front').trim(),
        back: backStyle.getPropertyValue('--card-back-base').trim(),
        border: cardStyle.getPropertyValue('--card-border').trim(),
        metalness: cardStyle.getPropertyValue('--card-metalness').trim(),
        roughness: cardStyle.getPropertyValue('--card-roughness').trim(),
        bevel: cardStyle.getPropertyValue('--card-bevel').trim(),
        sweepIntensity: cardStyle.getPropertyValue('--card-sweep-intensity').trim(),
        engravingDepth: cardStyle.getPropertyValue('--card-engraving-depth').trim(),
        frontBorder: frontStyle.borderTopColor,
        backBorder: backStyle.borderTopColor,
        frontBackground: frontStyle.backgroundImage,
        backBackground: backStyle.backgroundImage
      },
      triggerText: trigger.textContent.trim(),
      triggerStyle: {
        width: triggerStyle.width,
        border: triggerStyle.borderTopWidth,
        background: triggerStyle.backgroundColor,
        shadow: triggerStyle.boxShadow
      },
      backdropStyle: {
        background: backdropStyle.backgroundColor,
        image: backdropStyle.backgroundImage,
        filter: backdropStyle.backdropFilter
      },
      viewerStyle: {
        border: viewerStyle.borderTopWidth,
        padding: viewerStyle.paddingTop,
        background: viewerStyle.backgroundColor,
        image: viewerStyle.backgroundImage,
        shadow: viewerStyle.boxShadow
      },
      nicknameStyle: {
        border: nicknameStyle.borderTopWidth,
        background: nicknameStyle.backgroundColor,
        image: nicknameStyle.backgroundImage,
        shadow: nicknameStyle.boxShadow,
        opacity: nicknameStyle.opacity,
        transform: nicknameStyle.transform
      }
    };
  })()`);
  assert.equal(opened.hidden, false, 'identity card dialog did not open');
  assert.equal(opened.feId, '12345678');
  assert.equal(opened.nickname, '夜幕限定');
  assert.equal(opened.cards, 2, 'owned card selector did not hydrate');
  assert.equal(opened.stageActive, true, 'physical opening choreography is not active');
  assert.match(opened.declaredRatio, /1\.586/);
  assert.ok(opened.ratio > 1.45 && opened.ratio < 1.75, `unexpected intrinsic card ratio: ${opened.ratio}`);
  assert.equal(opened.backface, 'hidden');
  assert.equal(opened.withinViewport, true, 'identity card is clipped by the viewport');
  assert.equal(opened.material, 'black-gold');
  assert.deepEqual({
    primary: opened.materialStyle.primary.toUpperCase(),
    secondary: opened.materialStyle.secondary.toUpperCase(),
    accent: opened.materialStyle.accent.toUpperCase(),
    front: opened.materialStyle.front.toUpperCase(),
    back: opened.materialStyle.back.toUpperCase(),
    border: opened.materialStyle.border.toUpperCase(),
    metalness: opened.materialStyle.metalness,
    roughness: opened.materialStyle.roughness,
    bevel: opened.materialStyle.bevel,
    sweepIntensity: opened.materialStyle.sweepIntensity,
    engravingDepth: opened.materialStyle.engravingDepth
  }, {
    primary: '#13579B',
    secondary: '#2468AC',
    accent: '#F05A7E',
    front: '#0B3D91',
    back: '#7A1F5B',
    border: '#19E6C3',
    metalness: '0.37',
    roughness: '0.73',
    bevel: '7.25',
    sweepIntensity: '1.41',
    engravingDepth: '0.29'
  }, 'Edge CSS variables diverged from the explicit server identity-card material');
  assert.equal(opened.materialStyle.frontBorder, 'rgb(25, 230, 195)');
  assert.equal(opened.materialStyle.backBorder, 'rgb(25, 230, 195)');
  assert.match(opened.materialStyle.frontBackground, /rgb\(11, 61, 145\)/,
    'the rendered front face ignored the explicit server front color');
  assert.match(opened.materialStyle.frontBackground, /rgb\(19, 87, 155\)/,
    'the rendered front face ignored the explicit server primary color');
  assert.match(opened.materialStyle.backBackground, /rgb\(122, 31, 91\)/,
    'the rendered back face ignored the explicit server back color');
  assert.equal(opened.triggerText, 'FE', 'community identity entry must contain only the card icon');
  assert.deepEqual(opened.triggerStyle, { width: '28px', border: '0px', background: 'rgba(0, 0, 0, 0)', shadow: 'none' });
  assert.deepEqual(opened.backdropStyle, { background: 'rgba(0, 0, 0, 0)', image: 'none', filter: 'none' });
  assert.deepEqual(opened.viewerStyle, { border: '0px', padding: '0px', background: 'rgba(0, 0, 0, 0)', image: 'none', shadow: 'none' });
  assert.deepEqual(opened.nicknameStyle, {
    border: '0px',
    background: 'rgba(0, 0, 0, 0)',
    image: 'none',
    shadow: 'none',
    opacity: '1',
    transform: 'none'
  }, 'engraved nickname must stay transparent when the global black-gold role=button skin is loaded');
  assert.match(opened.request.url, /identity-cards\?feId=12345678&provider=qq|identity-cards\?provider=qq&feId=12345678/);

  const alternateEntranceShadows = await evaluate(`(() => {
    const stage = document.getElementById('feIdentityCardStage');
    const shell = document.getElementById('feIdentityCardShell');
    const shadow = document.querySelector('.fe-identity-card__shadow');
    const results = {};
    for (const preset of ['rise-flip', 'soft-reveal']) {
      stage.classList.remove('is-landed', 'is-lifting', 'is-showcasing');
      stage.dataset.entrance = preset;
      stage.style.setProperty('--fe-card-entrance-duration', '1000ms');
      stage.classList.add('is-entering');
      void shadow.offsetWidth;
      const shellAnimation = shell.getAnimations()[0];
      const shadowAnimation = shadow.getAnimations()[0];
      if (!shellAnimation || !shadowAnimation) {
        results[preset] = { available: false };
      } else {
        shellAnimation.pause();
        shadowAnimation.pause();
        const duration = Number(shadowAnimation.effect.getTiming().duration);
        const samples = [0, 0.5, 1].map((progress) => {
          shadowAnimation.currentTime = duration * progress;
          const style = getComputedStyle(shadow);
          return {
            opacity: Number(style.opacity),
            filter: style.filter,
            transform: style.transform
          };
        });
        results[preset] = {
          available: true,
          shellDuration: Number(shellAnimation.effect.getTiming().duration),
          shadowDuration: duration,
          samples
        };
        shellAnimation.cancel();
        shadowAnimation.cancel();
      }
      stage.classList.remove('is-entering');
    }
    return results;
  })()`);
  for (const preset of ['rise-flip', 'soft-reveal']) {
    const result = alternateEntranceShadows[preset];
    assert.equal(result.available, true, `${preset} has no physical ground-shadow timeline in Edge`);
    assert.equal(result.shadowDuration, result.shellDuration, `${preset} shadow is not synchronized to card height`);
    assert.ok(result.samples.every((sample) => sample.opacity > 0 && sample.opacity <= 0.9),
      `${preset} loses the card shadow before landing: ${JSON.stringify(result.samples)}`);
    assert.ok(new Set(result.samples.map((sample) => sample.transform)).size === result.samples.length,
      `${preset} shadow footprint does not respond to the entrance pose`);
    assert.ok(new Set(result.samples.map((sample) => sample.filter)).size === result.samples.length,
      `${preset} shadow softness does not respond to height`);
  }

  await evaluate(`window.dispatchEvent(new CustomEvent('fe-monster-reward-animation', { detail: {
    phase: 'claim', itemType: 'identity-card', itemId: 'night', animationId: 'edge-corner-balance',
    animation: { id: 'edge-corner-balance', preset: 'corner-fall-float', durationMs: 1480, soundCue: 'noble-metal' }
  }}))`);
  await delay(20);
  const cornerBalancePhysics = await evaluate(`(() => {
    const stage = document.getElementById('feIdentityCardStage');
    const shell = document.getElementById('feIdentityCardShell');
    const shadow = document.querySelector('.fe-identity-card__shadow');
    window.__identityMotionEvents = [];
    if (!window.__identityMotionListener) {
      window.__identityMotionListener = (event) => window.__identityMotionEvents.push({ phase: event.detail?.phase, at: performance.now() });
      window.addEventListener('fe-monster-identity-card-animation', window.__identityMotionListener);
    }
    stage.classList.remove('is-entering', 'is-landed', 'is-lifting', 'is-showcasing');
    window.FeMonsterIdentityCard.replay();
    const shellAnimation = shell.getAnimations().find((animation) => animation.id === 'fe-identity-card-corner-balance');
    const shadowAnimation = shadow.getAnimations().find((animation) => animation.id === 'fe-identity-card-corner-shadow');
    if (!shellAnimation || !shadowAnimation) return { available: false };
    const shellDuration = Number(shellAnimation.effect.getTiming().duration);
    const shadowDuration = Number(shadowAnimation.effect.getTiming().duration);
    const makeCornerMarker = (position) => {
      const marker = document.createElement('span');
      marker.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none;' + position;
      shell.append(marker);
      return marker;
    };
    const pivotMarker = makeCornerMarker('left:0;bottom:0');
    const lowerRightMarker = makeCornerMarker('right:0;bottom:0');
    const upperLeftMarker = makeCornerMarker('left:0;top:0');
    const upperRightMarker = makeCornerMarker('right:0;top:0');
    shellAnimation.pause();
    shadowAnimation.pause();
    const sampleShell = (frame) => {
      shellAnimation.currentTime = shellDuration * frame.offset;
      shadowAnimation.currentTime = shadowDuration * frame.offset;
      const pivot = pivotMarker.getBoundingClientRect();
      const lowerRightScreen = lowerRightMarker.getBoundingClientRect();
      const upperLeftScreen = upperLeftMarker.getBoundingClientRect();
      const upperRightScreen = upperRightMarker.getBoundingClientRect();
      const matrix = new DOMMatrixReadOnly(getComputedStyle(shell).transform);
      const shadowStyle = getComputedStyle(shadow);
      const floorPitch = 78 * Math.PI / 180;
      const floorNormal = { y: -Math.sin(floorPitch), z: Math.cos(floorPitch) };
      const width = shell.offsetWidth;
      const height = shell.offsetHeight;
      const clearance = (x, y) => {
        const point = new DOMPoint(x, y - height, 0, 0).matrixTransform(matrix);
        return point.y * floorNormal.y + point.z * floorNormal.z;
      };
      const screenCorners = [
        [upperLeftScreen.left, upperLeftScreen.top],
        [upperRightScreen.left, upperRightScreen.top],
        [lowerRightScreen.left, lowerRightScreen.top],
        [pivot.left, pivot.top]
      ];
      const screenArea = Math.abs(screenCorners.reduce((sum, point, index) => {
        const next = screenCorners[(index + 1) % screenCorners.length];
        return sum + point[0] * next[1] - next[0] * point[1];
      }, 0)) / 2;
      return {
        progress: frame.offset,
        angle: frame.angle,
        fallSpeed: frame.speed,
        spinSpeed: frame.spinSpeed,
        x: pivot.left,
        y: pivot.top,
        height,
        width,
        screenArea,
        screenWidth: Math.max(...screenCorners.map((point) => point[0])) - Math.min(...screenCorners.map((point) => point[0])),
        screenHeight: Math.max(...screenCorners.map((point) => point[1])) - Math.min(...screenCorners.map((point) => point[1])),
        support: clearance(0, height),
        lowerRight: clearance(width, height),
        upperLeft: clearance(0, 0),
        upperRight: clearance(width, 0),
        centre: clearance(width / 2, height / 2)
        ,shadowOpacity: Number(shadowStyle.opacity)
        ,shadowBlur: Number.parseFloat(shadowStyle.getPropertyValue('--fe-card-shadow-softness'))
        ,shadowTransform: shadowStyle.transform
      };
    };
    const keyframes = shellAnimation.effect.getKeyframes().map((frame) => ({
      offset: frame.offset,
      angle: Number.parseFloat(frame['--fe-card-angle']),
      speed: Number.parseFloat(frame['--fe-card-angular-speed']),
      spinSpeed: Number.parseFloat(frame['--fe-card-spin-speed']),
      spinAngle: Number.parseFloat(frame['--fe-card-spin-angle']),
      transform: frame.transform
    }));
    const shadowFrames = shadowAnimation.effect.getKeyframes().map((frame) => ({
      offset: frame.offset,
      opacity: Number(frame.opacity),
      blur: Number.parseFloat(frame['--fe-card-shadow-softness']),
      transform: frame.transform
    }));
    const samples = keyframes.filter((_, index) => index % 6 === 0 || index === keyframes.length - 1)
      .map((frame) => sampleShell(frame));
    const origin = getComputedStyle(shell).transformOrigin.split(' ').slice(0, 2).map(Number.parseFloat);
    const shellHeight = shell.offsetHeight;
    pivotMarker.remove();
    lowerRightMarker.remove();
    upperLeftMarker.remove();
    upperRightMarker.remove();
    shellAnimation.cancel();
    shadowAnimation.cancel();
    window.FeMonsterIdentityCard.replay();
    return { available: true, keyframes, shadowFrames, samples, origin, shellHeight, shellDuration, shadowDuration };
  })()`);
  assert.equal(cornerBalancePhysics.available, true, 'the real Edge timeline is missing the corner-balance motion');
  assert.ok(cornerBalancePhysics.origin[0] < 1.5, `supporting corner x drifted: ${cornerBalancePhysics.origin[0]}px`);
  assert.ok(Math.abs(cornerBalancePhysics.origin[1] - cornerBalancePhysics.shellHeight) <= 1.5,
    `supporting corner y is not the lower edge: ${JSON.stringify(cornerBalancePhysics.origin)}`);
  assert.equal(cornerBalancePhysics.shadowFrames.length, cornerBalancePhysics.keyframes.length,
    'the ground shadow must follow every generated rigid-body pose, not four unrelated constants');
  assert.ok(cornerBalancePhysics.shadowFrames.length >= 120,
    'the physical shadow timeline is not dense enough for a smooth height/tilt response');
  assert.ok(cornerBalancePhysics.shadowFrames.every((frame) => frame.opacity > 0 && frame.opacity <= 0.9),
    'the card lost its floor shadow while it was above or touching the floor');
  assert.ok(new Set(cornerBalancePhysics.shadowFrames.map((frame) => frame.opacity.toFixed(3))).size >= 20,
    'shadow opacity is a stepped four-frame effect instead of a continuous height response');
  assert.ok(new Set(cornerBalancePhysics.shadowFrames.map((frame) => frame.blur.toFixed(2))).size >= 20,
    'shadow softness does not continuously respond to card height');
  assert.ok(new Set(cornerBalancePhysics.shadowFrames.map((frame) => frame.transform)).size >= 60,
    'shadow footprint does not continuously respond to tilt and projected card area');
  const impactIndex = cornerBalancePhysics.keyframes.findIndex((frame) => Math.abs(frame.offset - (
    (cornerBalancePhysics.shellDuration - Math.min(170, cornerBalancePhysics.shellDuration * 0.115))
      / cornerBalancePhysics.shellDuration
  )) < 0.0001 && frame.angle === 0);
  assert.ok(impactIndex >= 0, 'first face contact was not represented in the shadow timeline');
  assert.equal(cornerBalancePhysics.shadowFrames[impactIndex].offset,
    cornerBalancePhysics.keyframes[impactIndex].offset,
    'the floor shadow missed the first full-face contact frame');
  const pivotX = cornerBalancePhysics.samples[0].x;
  const pivotY = cornerBalancePhysics.samples[0].y;
  assert.ok(cornerBalancePhysics.samples.every((point) => Math.abs(point.x - pivotX) <= 1.5 && Math.abs(point.y - pivotY) <= 1.5),
    `supporting corner trajectory drifted: ${JSON.stringify(cornerBalancePhysics.samples)}`);
  const spinningFrames = cornerBalancePhysics.keyframes.filter((frame) => frame.spinSpeed > 0);
  assert.ok(spinningFrames[0].angle >= 89.5 && spinningFrames[0].angle <= 90,
    `unexpected starting angle: ${spinningFrames[0].angle}`);
  assert.ok(spinningFrames[0].spinSpeed >= 1000, `initial spin is too slow: ${spinningFrames[0].spinSpeed}deg/s`);
  assert.ok(spinningFrames[0].spinSpeed >= spinningFrames.at(-1).spinSpeed * 8,
    `Edge spin did not visibly slow: ${spinningFrames[0].spinSpeed} -> ${spinningFrames.at(-1).spinSpeed}deg/s`);
  for (let index = 1; index < spinningFrames.length; index += 1) {
    assert.ok(spinningFrames[index].spinSpeed <= spinningFrames[index - 1].spinSpeed + 0.05,
      `friction increased spin speed at Edge frame ${index}`);
    const spinDelta = spinningFrames[index - 1].spinAngle - spinningFrames[index].spinAngle;
    assert.ok(spinDelta >= -0.001 && spinDelta <= 30,
      `Edge spin angle jumped or reversed at frame ${index}: ${spinDelta}deg`);
  }
  assert.ok(Math.abs(spinningFrames.at(-1).spinAngle - spinningFrames[0].spinAngle) >= 900,
    `Edge rendered fewer than 2.5 turns: ${JSON.stringify(spinningFrames.slice(-2))}`);
  const balancedSamples = cornerBalancePhysics.samples.filter((sample) => sample.fallSpeed === 0 && sample.spinSpeed > 0);
  assert.ok(balancedSamples.length >= 12, 'Edge did not expose enough vertical-balance samples');
  assert.ok(balancedSamples[0].screenArea >= balancedSamples[0].width * balancedSamples[0].height * 0.08
    && balancedSamples[0].screenWidth >= balancedSamples[0].width * 0.3
    && balancedSamples[0].screenHeight >= balancedSamples[0].height * 0.5,
  `the physically vertical card is edge-on or visually unreadable: ${JSON.stringify(balancedSamples[0])}`);
  assert.ok(balancedSamples.every((sample) => Math.abs(sample.support) <= 0.5),
    `the supporting lower-left corner left the floor: ${JSON.stringify(balancedSamples)}`);
  assert.ok(balancedSamples.every((sample) => (
    sample.lowerRight >= sample.height * 0.7
      && sample.upperLeft >= sample.height * 0.45
      && sample.upperRight >= sample.height * 1.15
  )), `a second corner touched during the vertical spin: ${JSON.stringify(balancedSamples)}`);
  const balancedCentres = balancedSamples.map((sample) => sample.centre);
  assert.ok(Math.max(...balancedCentres) - Math.min(...balancedCentres) <= 1,
    `centre-of-mass height changed before critical speed: ${JSON.stringify(balancedCentres)}`);
  const fallStart = cornerBalancePhysics.keyframes.findIndex((frame) => frame.speed > 0);
  assert.ok(fallStart >= 0, 'real Edge timeline has no critical loss-of-balance phase');
  const tipFrames = cornerBalancePhysics.keyframes.slice(fallStart)
    .filter((frame) => frame.speed > 0 || (frame.angle === 0 && frame.spinSpeed > 0));
  assert.ok(tipFrames[0].angle >= 89 && tipFrames[0].angle <= 90,
    `unexpected critical angle: ${tipFrames[0].angle}`);
  for (let index = 1; index < tipFrames.length; index += 1) {
    assert.ok(tipFrames[index].angle <= tipFrames[index - 1].angle + 0.02, 'centre height rose before face contact');
    assert.ok(tipFrames[index].angle >= -0.02, 'free edge passed through the floor');
    assert.ok(tipFrames[index].speed + 0.08 >= tipFrames[index - 1].speed,
      'gravity did not monotonically accelerate the loss of balance');
  }
  const speedFrames = tipFrames.slice(0, -1);
  const speedThird = Math.floor(speedFrames.length / 3);
  const average = (values) => values.reduce((sum, value) => sum + value.speed, 0) / values.length;
  assert.ok(average(speedFrames.slice(-speedThird)) >= average(speedFrames.slice(0, speedThird)) * 1.5,
    'real Edge angular velocity did not increase under gravity torque');
  const fallingSamples = cornerBalancePhysics.samples.filter((sample) => sample.fallSpeed > 0 && sample.angle > 0);
  assert.ok(fallingSamples.every((sample) => (
    Math.min(sample.support, sample.lowerRight, sample.upperLeft, sample.upperRight) >= -0.5
  )), `a corner crossed through the virtual floor: ${JSON.stringify(fallingSamples)}`);
  for (let index = 1; index < fallingSamples.length; index += 1) {
    assert.ok(fallingSamples[index].centre <= fallingSamples[index - 1].centre + 0.5,
      `centre of mass rose after balance loss at Edge sample ${index}`);
  }
  const ringFrames = cornerBalancePhysics.keyframes.slice(-5);
  assert.ok(ringFrames[0].angle <= 2 && ringFrames.every((frame) => frame.angle >= 0), 'contact ring exceeded the floor boundary');
  assert.ok(ringFrames.every((frame) => /^translate3d\(0(?:px)?, 8vh, 0(?:px)?\)/.test(frame.transform)),
    `contact ring caused a positional rebound: ${JSON.stringify(ringFrames)}`);

  await delay(cornerBalancePhysics.shellDuration + 90);
  const landed = await evaluate(`(() => {
    const stage = document.getElementById('feIdentityCardStage');
    const shell = document.getElementById('feIdentityCardShell');
    return {
      landed: stage.classList.contains('is-landed'),
      entering: stage.classList.contains('is-entering'),
      showcasing: stage.classList.contains('is-showcasing'),
      transform: getComputedStyle(shell).transform,
      status: document.getElementById('feIdentityCardStatus').textContent
    };
  })()`);
  assert.equal(landed.landed, true, 'the card did not stop on the ground after its entrance');
  assert.equal(landed.entering, false);
  assert.equal(landed.showcasing, false, 'the card started floating without a user click');
  assert.notEqual(landed.transform, 'none');
  const motionPhases = await evaluate('window.__identityMotionEvents');
  const cornerContact = motionPhases.find((event) => event.phase === 'corner-contact');
  const faceImpact = motionPhases.find((event) => event.phase === 'face-impact');
  assert.ok(cornerContact && faceImpact, `missing physical audio phases: ${JSON.stringify(motionPhases)}`);
  const expectedImpact = cornerBalancePhysics.shellDuration - Math.min(170, cornerBalancePhysics.shellDuration * 0.115);
  assert.ok(Math.abs((faceImpact.at - cornerContact.at) - expectedImpact) <= 40,
    `face impact phase missed visual contact by more than 40ms: ${JSON.stringify(motionPhases)}`);
  assert.match(landed.status, /点击卡片/);

  const lifting = await evaluate(`(() => {
    const card = document.getElementById('feIdentityCard');
    const before = card.getBoundingClientRect();
    card.click();
    const after = card.getBoundingClientRect();
    const stage = document.getElementById('feIdentityCardStage');
    return {
      landed: stage.classList.contains('is-landed'),
      lifting: stage.classList.contains('is-lifting'),
      showcasing: stage.classList.contains('is-showcasing'),
      clickShift: Math.hypot(after.left - before.left, after.top - before.top)
    };
  })()`);
  assert.deepEqual({ landed: lifting.landed, lifting: lifting.lifting, showcasing: lifting.showcasing },
    { landed: false, lifting: true, showcasing: false }, 'clicking the landed card must begin the lift instead of flipping it');
  assert.ok(lifting.clickShift <= 2, `the card jumped ${lifting.clickShift.toFixed(2)}px when its lift began`);
  await delay(1000);
  const lifted = await evaluate(`(() => {
    const stage = document.getElementById('feIdentityCardStage');
    const shell = document.getElementById('feIdentityCardShell');
    const style = getComputedStyle(shell);
    return {
      lifting: stage.classList.contains('is-lifting'),
      showcasing: stage.classList.contains('is-showcasing'),
      animationName: style.animationName,
      timing: style.animationTimingFunction,
      iterations: style.animationIterationCount
    };
  })()`);
  assert.deepEqual(lifted, {
    lifting: false,
    showcasing: true,
    animationName: 'fe-identity-card-showcase',
    timing: 'linear',
    iterations: 'infinite'
  }, 'the user-triggered lift did not transition into the right-to-left showcase');

  const focusedRotationStart = await evaluate(`(() => {
    const card = document.getElementById('feIdentityCard');
    const shell = document.getElementById('feIdentityCardShell');
    card.focus();
    const animation = shell.getAnimations().find((item) => item.animationName === 'fe-identity-card-showcase')
      || shell.getAnimations()[0];
    return { playState: animation?.playState, currentTime: Number(animation?.currentTime || 0) };
  })()`);
  await delay(180);
  const focusedRotationEnd = await evaluate(`(() => {
    const shell = document.getElementById('feIdentityCardShell');
    const animation = shell.getAnimations().find((item) => item.animationName === 'fe-identity-card-showcase')
      || shell.getAnimations()[0];
    return { playState: animation?.playState, currentTime: Number(animation?.currentTime || 0) };
  })()`);
  assert.equal(focusedRotationStart.playState, 'running');
  assert.equal(focusedRotationEnd.playState, 'running');
  assert.ok(focusedRotationEnd.currentTime - focusedRotationStart.currentTime >= 100,
    'the continuous showcase stopped after the click left keyboard focus on the card');

  const showcase = await evaluate(`(() => {
    const stage = document.getElementById('feIdentityCardStage');
    const shell = document.getElementById('feIdentityCardShell');
    stage.classList.remove('is-entering');
    stage.classList.add('is-showcasing');
    const style = getComputedStyle(shell);
    return {
      name: style.animationName,
      duration: style.animationDuration,
      timing: style.animationTimingFunction,
      iterations: style.animationIterationCount
    };
  })()`);
  assert.deepEqual(showcase, {
    name: 'fe-identity-card-showcase',
    duration: '14s',
    timing: 'linear',
    iterations: 'infinite'
  }, 'identity card must keep rotating from right to left at a constant speed');
  await delay(180);
  const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(path.join(root, 'artifacts', 'community-identity-card-floating.png'), Buffer.from(screenshot.data, 'base64'));

  const flipped = await evaluate(`document.getElementById('feIdentityCardFlip').click(); document.getElementById('feIdentityCard').getAttribute('aria-pressed')`);
  assert.equal(flipped, 'true', 'identity card did not flip to its fixed back face');

  await evaluate(`document.getElementById('feIdentityCardFlip').click()`);
  const lockedNickname = await evaluate(`(() => {
    const card = document.getElementById('feIdentityCard');
    const nickname = document.getElementById('feIdentityCardNickname');
    const faceBefore = card.getAttribute('aria-pressed');
    nickname.click();
    return {
      formHidden: document.getElementById('feIdentityCardNicknameForm').hidden,
      faceBefore,
      faceAfter: card.getAttribute('aria-pressed'),
      editable: nickname.getAttribute('aria-disabled'),
      tabIndex: nickname.tabIndex,
      editHidden: document.getElementById('feIdentityCardEdit').hidden
    };
  })()`);
  assert.deepEqual(lockedNickname, {
    formHidden: true,
    faceBefore: 'false',
    faceAfter: 'false',
    editable: 'true',
    tabIndex: -1,
    editHidden: true
  }, 'server-issued locked engravings must not expose an editable client path');
  const lockedInputBypasses = await evaluate(`(() => {
    const nickname = document.getElementById('feIdentityCardNickname');
    const edit = document.getElementById('feIdentityCardEdit');
    const form = document.getElementById('feIdentityCardNicknameForm');
    nickname.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const hiddenAfterEnter = form.hidden;
    nickname.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    const hiddenAfterSpace = form.hidden;
    edit.hidden = false;
    edit.disabled = false;
    edit.click();
    return {
      hiddenAfterEnter,
      hiddenAfterSpace,
      hiddenAfterForcedEditButton: form.hidden,
      profileRequests: window.__requests.filter((item) => item.url.includes('/profile')).length
    };
  })()`);
  assert.deepEqual(lockedInputBypasses, {
    hiddenAfterEnter: true,
    hiddenAfterSpace: true,
    hiddenAfterForcedEditButton: true,
    profileRequests: 0
  }, 'keyboard and force-enabled edit controls must still honor the locked server-card policy');
  const forgedLockedEdit = await evaluate(`(async () => {
    const form = document.getElementById('feIdentityCardNicknameForm');
    form.hidden = false;
    document.getElementById('feIdentityCardNicknameInput').value = '伪造昵称';
    form.requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 40));
    return {
      formHidden: form.hidden,
      profileRequests: window.__requests.filter((item) => item.url.includes('/profile')).length,
      nickname: document.getElementById('feIdentityCardNickname').textContent
    };
  })()`, true);
  assert.deepEqual(forgedLockedEdit, {
    formHidden: true,
    profileRequests: 0,
    nickname: '夜幕限定'
  }, 'a forged form submit must not bypass the locked server-card nickname policy');

  await evaluate(`(async () => {
    document.querySelector('[data-identity-card-id="classic"]').click();
    await new Promise((resolve) => setTimeout(resolve, 40));
  })()`, true);
  const nicknameEditor = await evaluate(`(() => {
    const card = document.getElementById('feIdentityCard');
    const nickname = document.getElementById('feIdentityCardNickname');
    const faceBefore = card.getAttribute('aria-pressed');
    nickname.click();
    const input = document.getElementById('feIdentityCardNicknameInput');
    const inputStyle = getComputedStyle(input);
    const inputRect = input.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const parseColor = (value) => {
      const parts = String(value).match(/[\\d.]+/g)?.map(Number) || [];
      return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts[3] ?? 1 };
    };
    const composite = (foreground, background) => ({
      r: foreground.r * foreground.a + background.r * (1 - foreground.a),
      g: foreground.g * foreground.a + background.g * (1 - foreground.a),
      b: foreground.b * foreground.a + background.b * (1 - foreground.a)
    });
    const luminance = (color) => {
      const linear = [color.r, color.g, color.b].map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const contrast = (first, second) => {
      const a = luminance(first);
      const b = luminance(second);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    const backdrop = parseColor(getComputedStyle(document.body).backgroundColor);
    const foreground = composite(parseColor(inputStyle.color), backdrop);
    const focusLine = composite(parseColor(inputStyle.borderBottomColor), backdrop);
    const inputCenter = {
      x: inputRect.left + inputRect.width / 2,
      y: inputRect.top + inputRect.height / 2
    };
    return {
      formHidden: document.getElementById('feIdentityCardNicknameForm').hidden,
      faceBefore,
      faceAfter: card.getAttribute('aria-pressed'),
      focused: document.activeElement === input,
      inputBackground: inputStyle.backgroundColor,
      inputShadow: inputStyle.boxShadow,
      inputCenterOnCard: inputCenter.x >= cardRect.left && inputCenter.x <= cardRect.right
        && inputCenter.y >= cardRect.top && inputCenter.y <= cardRect.bottom,
      textContrastOnScene: contrast(foreground, backdrop),
      focusContrastOnScene: contrast(focusLine, backdrop),
      focusLineWidth: Number.parseFloat(inputStyle.borderBottomWidth) || 0
    };
  })()`);
  assert.equal(nicknameEditor.formHidden, false);
  assert.equal(nicknameEditor.faceBefore, 'false');
  assert.equal(nicknameEditor.faceAfter, 'false');
  assert.equal(nicknameEditor.focused, true);
  assert.equal(nicknameEditor.inputBackground, 'rgba(0, 0, 0, 0)');
  assert.equal(nicknameEditor.inputShadow, 'none');
  assert.ok(
    nicknameEditor.inputCenterOnCard
      || (nicknameEditor.textContrastOnScene >= 4.5
        && nicknameEditor.focusContrastOnScene >= 3
        && nicknameEditor.focusLineWidth >= 1),
    `transparent nickname editor lost contrast away from the gold card: ${JSON.stringify(nicknameEditor)}`
  );
  const nicknameScreenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(
    path.join(root, 'artifacts', 'community-identity-card-nickname-editor.png'),
    Buffer.from(nicknameScreenshot.data, 'base64')
  );

  await evaluate(`(async () => {
    const input = document.getElementById('feIdentityCardNicknameInput');
    input.value = '水瓶脑洞';
    document.getElementById('feIdentityCardNicknameForm').requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 40));
  })()`, true);
  const nicknameSave = await evaluate(`({
    nickname: document.getElementById('feIdentityCardNickname').textContent,
    request: window.__requests.find((item) => item.url.includes('/profile'))
  })`);
  assert.equal(nicknameSave.nickname, '水瓶脑洞');
  assert.equal(nicknameSave.request.method, 'POST');
  assert.equal(nicknameSave.request.body.username, '水瓶脑洞');

  const equipped = await evaluate(`({
    snapshot: window.FeMonsterIdentityCard.snapshot(),
    material: document.getElementById('feIdentityCard').dataset.material,
    request: window.__requests.filter((item) => item.url.includes('/equip')).at(-1)
  })`);
  assert.equal(equipped.snapshot.equippedId, 'classic');
  assert.equal(equipped.material, 'polished-gold');
  assert.equal(equipped.request.body.cardId, 'classic');

  const muted = await evaluate(`document.getElementById('feIdentityCardSound').click(); ({
    pressed: document.getElementById('feIdentityCardSound').getAttribute('aria-pressed'),
    stored: localStorage.getItem('fe-monster-identity-card-muted-v1')
  })`);
  assert.deepEqual(muted, { pressed: 'true', stored: '1' });

  const externalCard = await evaluate(`(() => {
    const before = window.FeMonsterIdentityCard.snapshot();
    window.FeMonsterIdentityCard.showExternal({
      owner: { feId: '87654321', username: '好友星光' },
      card: {
        id: 'friend-limited', label: '好友限定', material: 'black-gold', finish: 'hammered',
        primaryColor: '#13579B', secondaryColor: '#2468AC', accentColor: '#F05A7E',
        frontColor: '#0B3D91', backColor: '#7A1F5B', borderColor: '#19E6C3',
        metalness: 0.37, roughness: 0.73, bevel: 7.25, sweepIntensity: 1.41,
        engravingDepth: 0.29, engravedNickname: '好友限定刻字', displayAnimationId: 'friend-display'
      },
      displayAnimation: {
        id: 'friend-display', scope: 'identity-card-display', soundCue: 'noble-metal',
        stages: [{ kind: 'slow-showcase', durationMs: 820, intensity: 0.7 }]
      }
    });
    const after = window.FeMonsterIdentityCard.snapshot();
    return {
      equippedBefore: before.equippedId,
      equippedAfter: after.equippedId,
      externalFeId: after.externalView?.owner?.feId,
      externalCardId: after.currentCard?.id,
      visibleFeId: document.getElementById('feIdentityCardFeId').textContent,
      nickname: document.getElementById('feIdentityCardNickname').textContent,
      editable: document.getElementById('feIdentityCardNickname').getAttribute('aria-disabled'),
      editHidden: document.getElementById('feIdentityCardEdit').hidden,
      title: document.getElementById('feIdentityCardTitle').textContent,
      triggerMaterial: document.getElementById('communityIdentityCardButton').dataset.material
    };
  })()`);
  assert.deepEqual(externalCard, {
    equippedBefore: 'classic',
    equippedAfter: 'classic',
    externalFeId: '87654321',
    externalCardId: 'friend-limited',
    visibleFeId: '87654321',
    nickname: '好友限定刻字',
    editable: 'true',
    editHidden: true,
    title: '好友限定刻字 的身份卡',
    triggerMaterial: 'polished-gold'
  }, 'friend display must be read-only and must not replace the viewer equipped card');

  const ownCardRestored = await evaluate(`(() => {
    window.FeMonsterIdentityCard.close();
    const snapshot = window.FeMonsterIdentityCard.snapshot();
    return {
      external: snapshot.externalView,
      equippedId: snapshot.equippedId,
      currentId: snapshot.currentCard?.id,
      material: document.getElementById('feIdentityCard').dataset.material
    };
  })()`);
  assert.deepEqual(ownCardRestored, {
    external: null,
    equippedId: 'classic',
    currentId: 'classic',
    material: 'polished-gold'
  }, 'closing a friend card must restore the viewer own identity card');

  await evaluate(`window.FeMonsterIdentityCard.open()`);

  await command('Emulation.setEmulatedMedia', {
    media: '',
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  });
  await delay(20);
  const reducedMotionLanding = await evaluate(`(() => {
    window.FeMonsterIdentityCard.replay();
    const stage = document.getElementById('feIdentityCardStage');
    const shell = document.getElementById('feIdentityCardShell');
    return {
      reduced: window.FeMonsterIdentityCard.snapshot().reducedMotion,
      landed: stage.classList.contains('is-landed'),
      entering: stage.classList.contains('is-entering'),
      showcasing: stage.classList.contains('is-showcasing'),
      animations: shell.getAnimations().length
    };
  })()`);
  assert.deepEqual(reducedMotionLanding, {
    reduced: true,
    landed: true,
    entering: false,
    showcasing: false,
    animations: 0
  }, 'reduced motion must settle flat immediately and still wait for the click');
  await command('Emulation.setEmulatedMedia', { media: '', features: [] });

  const closed = await evaluate(`document.getElementById('feIdentityCardDialog').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); ({
    hidden: document.getElementById('feIdentityCardDialog').hidden,
    expanded: document.getElementById('communityIdentityCardButton').getAttribute('aria-expanded')
  })`);
  assert.deepEqual(closed, { hidden: true, expanded: 'false' });

  console.log('Community identity card browser contract PASS');
} finally {
  try { socket?.close(); } catch {}
  try { browser.stderr?.destroy(); } catch {}
  try { browser.kill(); } catch {}
  try { server.closeIdleConnections?.(); } catch {}
  try { server.closeAllConnections?.(); } catch {}
  await Promise.race([
    new Promise((resolve) => {
      try { server.close(resolve); } catch { resolve(); }
    }),
    delay(1000)
  ]);
  await delay(150);
  try { rmSync(profileDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 120 }); } catch {}
}
