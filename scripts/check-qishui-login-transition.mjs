import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const webRoot = path.resolve('web');
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp']
]);

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

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Test server did not bind');
const baseUrl = `http://127.0.0.1:${address.port}`;
const debugPort = 18000 + (process.pid % 10000);
const profile = path.resolve(tmpdir(), `fe-monster-qishui-transition-${process.pid}`);
const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let socket;
let nextId = 1;
const pending = new Map();

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

try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((item) => item.type === 'page');
  if (!target?.webSocketDebuggerUrl) throw new Error('No Edge page target');
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
      const originalFetch = window.fetch.bind(window);
      const jsonResponse = (body) => new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
      window.__simulateQishuiLogin = false;
      window.__qishuiLoginStatusCalls = 0;
      window.__qishuiPlaylistCalls = 0;
      window.fetch = async (input, init = {}) => {
        const requestUrl = new URL(typeof input === 'string' ? input : input.url, location.href);
        const pathname = requestUrl.pathname;
        if (pathname === '/api/music-apis') {
          return jsonResponse({ ok: true, providers: [{
            id: 'qishui', label: '汽水音乐', appName: '汽水音乐 App',
            baseUrl: 'http://127.0.0.1:3013', enabled: true, configured: true,
            loginQr: true, status: 'ready'
          }] });
        }
        if (pathname === '/api/qishui/login/qr/check' && window.__simulateQishuiLogin) {
          return jsonResponse({ code: 803, status: 803, loggedIn: true, message: '登录成功' });
        }
        if (pathname === '/api/login/status' && requestUrl.searchParams.get('provider') === 'qishui') {
          if (!window.__simulateQishuiLogin) {
            return jsonResponse({ provider: 'qishui', loggedIn: false, account: null });
          }
          window.__qishuiLoginStatusCalls += 1;
          const ready = window.__qishuiLoginStatusCalls >= 2;
          return jsonResponse({
            provider: 'qishui', loggedIn: ready,
            account: ready ? { id: 'qishui-user', nickname: '扫码用户' } : null
          });
        }
        if (pathname === '/api/qishui/user/playlists') {
          window.__qishuiPlaylistCalls += 1;
          const ready = window.__qishuiLoginStatusCalls >= 2;
          return jsonResponse({
            provider: 'qishui', loggedIn: ready,
            playlists: ready ? [{ id: 'qishui-liked', name: '我喜欢的音乐', trackCount: 1 }] : []
          });
        }
        if (pathname === '/api/recommend/playlists') return jsonResponse({ playlists: [] });
        if (pathname.startsWith('/api/')) return jsonResponse({});
        return originalFetch(input, init);
      };
    })();`
  });
  await command('Page.navigate', { url: `${baseUrl}/?qa=qishui-login-transition` });
  await delay(2200);

  const evaluation = await command('Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const waitFor = async (predicate, timeout = 5000) => {
        const startedAt = performance.now();
        while (performance.now() - startedAt < timeout) {
          if (predicate()) return true;
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
        return false;
      };
      await waitFor(() => document.readyState === 'complete' && typeof checkLoginQr === 'function');
      await refreshMusicApiProviders({ silent: true });
      setActiveProvider('qishui');
      clearLoginQrTimer();
      state.loginQrKey = 'qishui-transition-test';
      els.loginDialog.hidden = false;
      window.__simulateQishuiLogin = true;
      await checkLoginQr();
      await waitFor(() => els.loginDialog.hidden === true, 5000);
      const result = {
        loginDialogClosed: els.loginDialog.hidden === true,
        loginStatusCalls: window.__qishuiLoginStatusCalls,
        playlistCalls: window.__qishuiPlaylistCalls,
        accountLoaded: state.loginStatusByProvider.qishui?.loggedIn === true,
        playlistsLoaded: state.playlistsLoggedIn === true && state.userPlaylists.length === 1
      };
      result.ok = result.loginDialogClosed
        && result.loginStatusCalls >= 2
        && result.accountLoaded
        && result.playlistsLoaded;
      return result;
    })()`
  });
  const result = evaluation.result.value;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
    stdio: 'ignore',
    windowsHide: true
  });
  server.close();
  await delay(250);
  const tempRoot = `${path.resolve(tmpdir())}${path.sep}`;
  if (profile.startsWith(tempRoot) && existsSync(profile)) {
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
    } catch {
      // Edge can briefly retain a Crashpad handle after taskkill; the OS clears it later.
    }
  }
}
