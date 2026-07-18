import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const baseUrl = String(process.env.FE_TEST_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const width = Math.max(360, Number.parseInt(process.argv[2] || '1440', 10) || 1440);
const height = Math.max(320, Number.parseInt(process.argv[3] || '900', 10) || 900);
const debugPort = 17000 + (process.pid % 10000);
const profile = path.resolve(tmpdir(), `fe-monster-rhythm-${process.pid}`);
const artifactDir = path.resolve('artifacts');
const setupScreenshot = path.join(artifactDir, `rhythm-game-setup-${width}x${height}-qa.png`);
const playingScreenshot = path.join(artifactDir, `rhythm-game-playing-${width}x${height}-qa.png`);
mkdirSync(artifactDir, { recursive: true });

const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu-sandbox',
  '--autoplay-policy=no-user-gesture-required',
  '--force-prefers-reduced-motion=no-preference',
  `--window-size=${width},${height}`,
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
const browserErrors = [];
let fileChooserEvents = 0;
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
  const result = await command('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}

async function waitFor(expression, timeout = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression, true)) return true;
    await delay(80);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function screenshot(filePath) {
  const capture = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(filePath, Buffer.from(capture.data, 'base64'));
}

async function clickSelector(selector) {
  const point = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) throw new Error(`Cannot click missing selector: ${selector}`);
  await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
}

const syntheticWavExpression = `
  (() => {
    const sampleRate = 44100;
    const duration = 8;
    const sampleCount = sampleRate * duration;
    const buffer = new ArrayBuffer(44 + sampleCount * 2);
    const view = new DataView(buffer);
    const write = (offset, text) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    write(0, 'RIFF');
    view.setUint32(4, 36 + sampleCount * 2, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, sampleCount * 2, true);
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const time = sample / sampleRate;
      const beatPhase = time % 0.5;
      const kick = beatPhase < 0.055 ? Math.sin(2 * Math.PI * (92 - beatPhase * 620) * time) * Math.exp(-beatPhase * 52) : 0;
      const bed = Math.sin(2 * Math.PI * 220 * time) * 0.035;
      view.setInt16(44 + sample * 2, Math.max(-32767, Math.min(32767, Math.round((kick * 0.86 + bed) * 32767))), true);
    }
    const file = new File([buffer], 'qa-120bpm.wav', { type: 'audio/wav' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.getElementById('rhythmGameAudioInput');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()
`;

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
    if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'runtime exception');
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      browserErrors.push((message.params.args || []).map((item) => item.value || item.description || '').join(' '));
    }
    if (message.method === 'Page.fileChooserOpened') fileChooserEvents += 1;
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 720 });
  await command('Page.navigate', { url: `${baseUrl}/?rhythm-game-qa=${Date.now()}` });
  await waitFor(`document.readyState === 'complete' && !!window.FeRhythmGame`);
  await waitFor(`document.getElementById('bootLogoButton') && !document.getElementById('bootLogoButton').disabled`);
  await clickSelector('#bootLogoButton');
  await waitFor(`document.getElementById('bootScreen').hidden === true`);

  const entry = await evaluate(`(() => {
    const button = document.getElementById('diyRhythmGameButton');
    return { exists: !!button, label: button?.textContent?.trim(), controls: button?.getAttribute('aria-controls') };
  })()`);
  await clickSelector('#diyButton');
  await waitFor(`document.getElementById('diyButton').getAttribute('aria-expanded') === 'true'`);
  await waitFor(`(() => {
    const button = document.getElementById('diyRhythmGameButton');
    if (!button) return false;
    const rect = button.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return target === button || button.contains(target);
  })()`);
  await clickSelector('#diyRhythmGameButton');
  await waitFor(`window.FeRhythmGame.getState().active === true && !document.getElementById('rhythmGameScene').hidden`);
  await command('Page.setInterceptFileChooserDialog', { enabled: true });
  await clickSelector('#rhythmGameChooseButton');
  for (let attempt = 0; attempt < 30 && fileChooserEvents === 0; attempt += 1) await delay(50);
  await command('Page.setInterceptFileChooserDialog', { enabled: false });
  await evaluate(syntheticWavExpression);
  await waitFor(`window.FeRhythmGame.getState().mode === 'ready' && window.FeRhythmGame.getState().beatCount >= 8`, 25000);
  const readyState = await evaluate(`(() => {
    const state = window.FeRhythmGame.getState();
    const scene = document.getElementById('rhythmGameScene');
    const setup = document.getElementById('rhythmGameSetup');
    const canvas = document.getElementById('rhythmGameCanvas');
    const style = getComputedStyle(scene);
    return {
      ...state,
      sceneDisplay: style.display,
      setupVisible: !setup.hidden && setup.getBoundingClientRect().width > 300,
      canvasSize: [Math.round(canvas.getBoundingClientRect().width), Math.round(canvas.getBoundingClientRect().height)],
      trackName: document.getElementById('rhythmGameTrackName').textContent,
      startEnabled: !document.getElementById('rhythmGameStartButton').disabled
    };
  })()`);
  await screenshot(setupScreenshot);

  await clickSelector('#rhythmGameStartButton');
  await waitFor(`window.FeRhythmGame.getState().mode === 'playing' && document.getElementById('rhythmGameAudio').currentTime > 0.2`, 3000);
  await waitFor(`document.getElementById('rhythmGameAudio').currentTime >= 1.72`, 6000);
  const unassistedPathStep = await evaluate(`window.FeRhythmGame.getState().pathStep`);
  await waitFor(`document.getElementById('rhythmGameAudio').currentTime >= 1.97`, 3000);
  await clickSelector('#rhythmGameHitButton');
  await delay(120);
  const pointerScoreText = await evaluate(`document.getElementById('rhythmGameScore').textContent`);
  await waitFor(`document.getElementById('rhythmGameAudio').currentTime >= 2.47`, 3000);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
  await delay(140);
  const playingState = await evaluate(`(() => ({
    ...window.FeRhythmGame.getState(),
    audioTime: Number(document.getElementById('rhythmGameAudio').currentTime.toFixed(3)),
    scoreText: document.getElementById('rhythmGameScore').textContent,
    accuracyText: document.getElementById('rhythmGameAccuracy').textContent,
    feedback: document.getElementById('rhythmGameFeedback').textContent
  }))()`);
  await screenshot(playingScreenshot);

  await evaluate('window.FeRhythmGame.close()');
  const closedState = await evaluate(`(() => ({
    ...window.FeRhythmGame.getState(),
    sceneHidden: document.getElementById('rhythmGameScene').hidden,
    shellClassRemoved: !document.querySelector('.app-shell').classList.contains('has-rhythm-game')
  }))()`);

  const report = {
    runtimeVersion: await evaluate('window.FeRhythmGame.VERSION'),
    entry,
    fileChooserOpened: fileChooserEvents > 0,
    readyState,
    playingState,
    unassistedPathStep,
    pointerScoreText,
    closedState,
    screenshots: [setupScreenshot, playingScreenshot],
    browserErrors,
    passed: entry.exists
      && entry.label === '音游'
      && fileChooserEvents > 0
      && readyState.startEnabled
      && readyState.beatCount >= 8
      && readyState.bpm >= 60
      && readyState.bpm <= 200
      && playingState.mode === 'playing'
      && unassistedPathStep === 0
      && playingState.pathStep === 2
      && Number.parseInt(pointerScoreText, 10) > 0
      && Number.parseInt(playingState.scoreText, 10) > 0
      && Number.parseInt(playingState.scoreText, 10) > Number.parseInt(pointerScoreText, 10)
      && closedState.sceneHidden
      && closedState.shellClassRemoved
      && browserErrors.length === 0
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  const browserExited = new Promise((resolve) => browser.once('exit', resolve));
  browser.kill();
  await Promise.race([browserExited, delay(1500)]);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
}
