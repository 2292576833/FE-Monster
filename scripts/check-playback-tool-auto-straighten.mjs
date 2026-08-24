import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const componentsRoot = path.join(root, 'components');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const debugPort = 31000 + Math.floor(Math.random() * 8000);
const tempRoot = path.join(root, '.tmp');
const profile = path.join(tempRoot, `fe-monster-playback-tool-straighten-${process.pid}-${Date.now().toString(36)}`);
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2']
]);

if (!existsSync(edge)) throw new Error(`Microsoft Edge was not found: ${edge}`);
mkdirSync(tempRoot, { recursive: true });

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end('{}');
    return;
  }
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const componentAsset = requestedPath.startsWith('/components/');
  const staticRoot = componentAsset ? componentsRoot : webRoot;
  const relativePath = componentAsset
    ? requestedPath.slice('/components/'.length)
    : requestedPath.slice(1);
  const filePath = path.resolve(staticRoot, decodeURIComponent(relativePath));
  if (!filePath.startsWith(`${staticRoot}${path.sep}`) || !existsSync(filePath)) {
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

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
let browser;
let socket;
let nextId = 1;

function listen(httpServer) {
  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', resolve);
  });
}

async function retryJson(url, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return response.json();
    } catch {}
    await delay(100);
  }
  throw new Error(`Edge debugging endpoint did not start within ${timeout}ms`);
}

function command(method, params = {}, timeout = 20000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP ${method} timed out after ${timeout}ms`));
    }, timeout);
    pending.set(id, {
      resolve(value) {
        clearTimeout(timer);
        resolve(value);
      },
      reject(error) {
        clearTimeout(timer);
        reject(error);
      }
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = false) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(expression, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression, true)) return;
    await delay(80);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

try {
  await listen(server);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/`;
  browser = spawn(edge, [
    '--headless=new',
    '--disable-gpu-sandbox',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1440,900',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: 'ignore', windowsHide: true });

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
  await command('Page.navigate', { url: baseUrl });
  await waitFor(`document.readyState === 'complete'
    && !!window.FeRhythmGame
    && !!document.getElementById('qishuiPlaybackPhone')
    && document.querySelectorAll('#qishuiPlaybackTools [data-playback-tool]').length === 5`);

  const result = await evaluate(`(async () => {
    const phone = document.getElementById('qishuiPlaybackPhone');
    const tools = document.getElementById('qishuiPlaybackTools');
    document.getElementById('bootScreen').hidden = true;
    const noMotion = document.createElement('style');
    noMotion.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
    document.head.append(noMotion);

    const nextLayout = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const pose = () => {
      const matrix = new DOMMatrix(getComputedStyle(phone).transform);
      const yawDegrees = Math.asin(Math.max(-1, Math.min(1, matrix.m13))) * 180 / Math.PI;
      const rotationEnergy = Math.abs(matrix.m12) + Math.abs(matrix.m13)
        + Math.abs(matrix.m21) + Math.abs(matrix.m23)
        + Math.abs(matrix.m31) + Math.abs(matrix.m32);
      return {
        transform: getComputedStyle(phone).transform,
        yawDegrees: Number(yawDegrees.toFixed(2)),
        rotationEnergy: Number(rotationEnergy.toFixed(5)),
        classes: phone.className
      };
    };
    const reset = async () => {
      window.FeRhythmGame.close();
      returnHomePage();
      enterPlaybackPage();
      await nextLayout();
      return pose();
    };

    const initialPose = await reset();
    const testedTools = ['preset', 'text', 'wallpaper', 'rhythm'];
    const toolResults = [];
    for (const tool of testedTools) {
      const before = await reset();
      const button = tools.querySelector('[data-playback-tool="' + tool + '"]');
      button.click();
      await nextLayout();
      const after = pose();
      toolResults.push({
        tool,
        label: button.textContent.trim(),
        before,
        after,
        straight: after.rotationEnergy < 0.002,
        active: button.classList.contains('is-active'),
        pressed: button.getAttribute('aria-pressed') === 'true'
      });
    }
    const restoredPose = await reset();
    const buttonContract = Object.fromEntries(testedTools.map((tool) => {
      const button = tools.querySelector('[data-playback-tool="' + tool + '"]');
      return [tool, {
        exists: !!button,
        controls: button?.getAttribute('aria-controls') || '',
        label: button?.textContent?.trim() || ''
      }];
    }));
    const checks = {
      fourToolButtonsPresent: Object.values(buttonContract).every((button) => button.exists),
      defaultLeftBackTiltIsTenDegrees: Math.abs(Math.abs(initialPose.yawDegrees) - 10) <= 0.55,
      everyToolClickStraightensPlaybackBar: toolResults.every((entry) => entry.straight),
      everyClickedToolReportsActiveState: toolResults.every((entry) => entry.active && entry.pressed),
      leavingAndReenteringRestoresDefaultTilt: Math.abs(Math.abs(restoredPose.yawDegrees) - 10) <= 0.55
    };
    return {
      initialPose,
      restoredPose,
      buttonContract,
      toolResults,
      checks,
      pass: Object.values(checks).every(Boolean)
    };
  })()`, true);

  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  if (browser && browser.exitCode === null) {
    const exited = new Promise((resolve) => {
      const timer = setTimeout(resolve, 1800);
      browser.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    browser.kill();
    await exited;
  }
  await new Promise((resolve) => server.close(resolve));
  const resolvedProfile = path.resolve(profile);
  if (resolvedProfile.startsWith(`${path.resolve(tempRoot)}${path.sep}`)) {
    try {
      rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 6, retryDelay: 120 });
    } catch {}
  }
}
