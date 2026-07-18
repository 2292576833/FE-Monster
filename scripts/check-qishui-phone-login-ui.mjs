import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const webRoot = path.resolve("web");
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end("{}");
    return;
  }

  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.resolve(webRoot, `.${decodeURIComponent(requestedPath)}`);
  if (!filePath.startsWith(`${webRoot}${path.sep}`) || !existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
  });
  response.end(readFileSync(filePath));
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();
if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port");
const baseUrl = `http://127.0.0.1:${address.port}`;
const debugPort = 17000 + (process.pid % 12000);
const profile = path.resolve(tmpdir(), `fe-monster-qishui-login-${process.pid}`);
const screenshotPath = path.resolve("artifacts", "qishui-guest-login.png");
const browser = spawn(edge, [
  "--headless=new",
  "--disable-gpu",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
  throw new Error("Edge debugging endpoint did not start");
}

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("No Edge page target was found");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await command("Page.enable");
  await command("Runtime.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await command("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const originalFetch = window.fetch.bind(window);
      const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' }
      });
      window.__qishuiRequests = [];
      window.__qishuiLoggedIn = false;
      window.fetch = async (input, init = {}) => {
        const requestUrl = new URL(typeof input === 'string' ? input : input.url, location.href);
        const pathname = requestUrl.pathname;
        if (pathname === '/api/qishui/login/phone/send') {
          const body = JSON.parse(String(init.body || '{}'));
          window.__qishuiRequests.push({ route: 'send', method: String(init.method || 'GET'), body });
          if (body.phone === '13600000005') {
            return jsonResponse({
              ok: false,
              sent: false,
              code: 'SEND_UNCONFIRMED',
              error: 'unconfirmed send'
            });
          }
          if (body.phone === '13700000006') {
            return jsonResponse({
              ok: false,
              sent: false,
              code: 'UPSTREAM_RATE_LIMITED',
              error: 'rate limited',
              retryAfterSeconds: 90
            }, 429);
          }
          return jsonResponse({
            ok: true,
            provider: 'qishui',
            sent: true,
            cooldownSeconds: 75,
            message: '验证码已发送'
          });
        }
        if (pathname === '/api/qishui/login/phone/verify') {
          const body = JSON.parse(String(init.body || '{}'));
          window.__qishuiRequests.push({ route: 'verify', method: String(init.method || 'GET'), body });
          if (body.code === '654321') {
            return jsonResponse({
              ok: false,
              code: 'INVALID_CODE',
              error: '验证码无效或已过期'
            }, 409);
          }
          window.__qishuiLoggedIn = true;
          return jsonResponse({
            ok: true,
            provider: 'qishui',
            loggedIn: true,
            message: '登录成功',
            account: { id: 'qishui-ui-qa', nickname: '汽水测试账号' }
          });
        }
        if (pathname === '/api/login/status' && requestUrl.searchParams.get('provider') === 'qishui') {
          return jsonResponse({
            provider: 'qishui',
            loggedIn: window.__qishuiLoggedIn,
            account: window.__qishuiLoggedIn
              ? { id: 'qishui-ui-qa', nickname: '汽水测试账号' }
              : null
          });
        }
        if (pathname === '/api/music-apis') {
          return jsonResponse({
            ok: true,
            providers: [{
              id: 'qishui',
              label: '汽水音乐',
              appName: '汽水音乐 App',
              baseUrl: 'http://127.0.0.1:3013',
              enabled: true,
              configured: true,
              loginQr: false,
              status: 'ready'
            }]
          });
        }
        if (pathname.startsWith('/api/')) return jsonResponse({});
        return originalFetch(input, init);
      };
    })();`,
  });
  await command("Page.navigate", { url: `${baseUrl}/?qa=qishui-phone-login` });
  await delay(2200);

  const evaluation = await command("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const waitFor = async (predicate, label, timeout = 4000) => {
        const startedAt = performance.now();
        while (performance.now() - startedAt < timeout) {
          if (predicate()) return;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        throw new Error('Timed out waiting for ' + label);
      };

      await waitFor(() => document.readyState === 'complete' && typeof showLoginDialog === 'function', 'client scripts');
      await refreshMusicApiProviders({ silent: true });
      showLoginDialog();
      const qishuiTab = document.querySelector('[data-login-provider="qishui"]');
      if (!qishuiTab) throw new Error('Qishui provider tab is missing');
      qishuiTab.click();
      const phoneInput = document.querySelector('#qishuiPhoneInput');
      const codeInput = document.querySelector('#qishuiCodeInput');
      const sendButton = document.querySelector('#qishuiSendCodeButton');
      const guestButton = document.querySelector('#qishuiGuestButton');
      const form = document.querySelector('#qishuiPhoneLogin');
      const status = document.querySelector('#qishuiPhoneStatus');
      if (!phoneInput || !codeInput || !sendButton || !guestButton || !form || !status) {
        throw new Error('Qishui phone login controls are incomplete');
      }
      await waitFor(() => !form.hidden && state.activeProvider === 'qishui', 'Qishui phone form');

      const requestsBeforeGuest = window.__qishuiRequests.length;
      guestButton.click();
      await waitFor(() => document.querySelector('#neteaseLoginDialog')?.hidden === true, 'guest dialog close');
      await new Promise((resolve) => setTimeout(resolve, 240));
      const guestModeEntered = state.qishuiGuestMode === true
        && state.activeProvider === 'qishui'
        && state.loginLoggedIn === false
        && document.querySelector('#neteaseLoginLabel')?.textContent.includes('访客');
      const guestKeptAccountFeaturesOff = document.querySelector('#loginVipBadge')?.hidden !== false
        && document.querySelector('#neteaseLoginButton')?.classList.contains('is-logged-in') === false
        && state.playlistsLoggedIn === false
        && state.userPlaylists.length === 0;
      const guestSkippedPhoneAuth = window.__qishuiRequests.length === requestsBeforeGuest;
      const guestUsesStandardQuality = JSON.stringify(playbackQualityOptions('qishui').map((option) => option.id))
        === JSON.stringify(['standard']);

      showLoginDialog();
      qishuiTab.click();
      await waitFor(() => !form.hidden && state.activeProvider === 'qishui', 'Qishui phone form after guest');

      phoneInput.value = '123';
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
      sendButton.click();
      await waitFor(() => status.textContent.includes('有效'), 'invalid phone validation');
      const invalidPhoneBlocked = window.__qishuiRequests.length === 0;

      phoneInput.value = '13600000005';
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
      sendButton.click();
      await waitFor(() => window.__qishuiRequests.some((request) => request.route === 'send' && request.body.phone === '13600000005'), 'unconfirmed send request');
      await waitFor(() => !state.qishuiPhoneSending && status.textContent.includes('unconfirmed send'), 'unconfirmed send rejection');
      const unconfirmedSendBlocked = !sendButton.disabled && state.qishuiPhoneCooldownUntil <= Date.now();

      phoneInput.value = '13700000006';
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
      sendButton.click();
      await waitFor(
        () => window.__qishuiRequests.filter((request) => request.route === 'send' && request.body.phone === '13700000006').length === 1,
        'rate-limited send request'
      );
      await waitFor(() => !state.qishuiPhoneSending && sendButton.disabled, 'rate-limit cooldown');
      const rateLimitCooldownLabel = sendButton.textContent.trim();
      sendButton.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const rateLimitRequestCount = window.__qishuiRequests.filter(
        (request) => request.route === 'send' && request.body.phone === '13700000006'
      ).length;
      closeLoginDialog();
      showLoginDialog();
      qishuiTab.click();
      await waitFor(() => !form.hidden && sendButton.disabled, 'preserved rate-limit cooldown');
      const rateLimitCooldownPreserved = state.qishuiPhoneCooldownUntil > Date.now();
      clearQishuiPhoneCooldownTimer();
      state.qishuiPhoneCooldownUntil = 0;
      syncQishuiPhoneControls();

      phoneInput.value = '13800138000';
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
      sendButton.click();
      await waitFor(() => window.__qishuiRequests.some((request) => request.route === 'send'), 'send request');
      await waitFor(() => sendButton.disabled, 'cooldown state');
      await waitFor(() => !state.qishuiPhoneSending && status.textContent.includes('验证码已发送'), 'send completion');

      const sendRequest = window.__qishuiRequests.find((request) => request.route === 'send' && request.body.phone === '13800138000');
      const cooldownLabel = sendButton.textContent.trim();
      const sendStatus = status.textContent.trim();

      codeInput.value = '12345';
      codeInput.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
      await waitFor(() => status.textContent.includes('6 位'), 'invalid code validation');
      const invalidCodeBlocked = !window.__qishuiRequests.some((request) => request.route === 'verify');

      codeInput.value = '654321';
      codeInput.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
      await waitFor(() => window.__qishuiRequests.filter((request) => request.route === 'verify').length === 1, 'rejected verify request');
      await waitFor(() => !state.qishuiPhoneVerifying && status.textContent.includes('验证码无效或已过期'), 'verify error');
      const verifyErrorSurfaced = status.textContent.includes('验证码无效或已过期');

      codeInput.value = '123456';
      codeInput.dispatchEvent(new Event('input', { bubbles: true }));
      form.requestSubmit();
      await waitFor(() => window.__qishuiRequests.filter((request) => request.route === 'verify').length === 2, 'successful verify request');
      await waitFor(() => window.__qishuiLoggedIn, 'logged-in state');
      await waitFor(() => status.textContent.includes('登录成功'), 'verify completion');
      await waitFor(() => state.qishuiGuestMode === false, 'guest mode exit after login');

      const verifyRequest = window.__qishuiRequests.find((request) => request.route === 'verify' && request.body.code === '123456');
      const result = {
        providerTabConfigured: !qishuiTab.classList.contains('is-unconfigured'),
        guestModeEntered,
        guestKeptAccountFeaturesOff,
        guestSkippedPhoneAuth,
        guestUsesStandardQuality,
        invalidPhoneBlocked,
        unconfirmedSendBlocked,
        rateLimitRequestCount,
        rateLimitCooldownLabel,
        rateLimitCooldownPreserved,
        invalidCodeBlocked,
        verifyErrorSurfaced,
        sendMethod: sendRequest?.method || '',
        sendBody: sendRequest?.body || null,
        cooldownLabel,
        sendStatus,
        verifyMethod: verifyRequest?.method || '',
        verifyBody: verifyRequest?.body || null,
        verifyStatus: status.textContent.trim(),
        codeCleared: codeInput.value === '',
      };
      result.ok = result.providerTabConfigured
        && result.guestModeEntered
        && result.guestKeptAccountFeaturesOff
        && result.guestSkippedPhoneAuth
        && result.guestUsesStandardQuality
        && result.invalidPhoneBlocked
        && result.unconfirmedSendBlocked
        && result.rateLimitRequestCount === 1
        && result.rateLimitCooldownLabel.includes('90')
        && result.rateLimitCooldownPreserved
        && result.invalidCodeBlocked
        && result.verifyErrorSurfaced
        && result.sendMethod === 'POST'
        && JSON.stringify(result.sendBody) === JSON.stringify({ phone: '13800138000' })
        && result.cooldownLabel.includes('75')
        && result.sendStatus.includes('验证码已发送')
        && result.verifyMethod === 'POST'
        && JSON.stringify(result.verifyBody) === JSON.stringify({ phone: '13800138000', code: '123456' })
        && result.verifyStatus.includes('登录成功')
        && result.codeCleared;
      return result;
    })()`,
  });
  if (evaluation.exceptionDetails) {
    const details = evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text;
    throw new Error(details || "Qishui login UI evaluation failed");
  }
  await delay(650);
  await command("Runtime.evaluate", {
    expression: `(() => {
      window.__qishuiLoggedIn = false;
      state.qishuiGuestMode = false;
      renderLoginStatus({ provider: 'qishui', loggedIn: false, account: null });
      const boot = document.querySelector('#bootScreen');
      if (boot) boot.hidden = true;
      showLoginDialog();
      setActiveProvider('qishui');
    })()`,
  });
  await delay(220);
  const screenshot = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  mkdirSync(path.dirname(screenshotPath), { recursive: true });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  evaluation.result.value.screenshotPath = screenshotPath;
  process.stdout.write(`${JSON.stringify(evaluation.result.value, null, 2)}\n`);
  process.exitCode = evaluation.result.value.ok ? 0 : 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  spawnSync("taskkill.exe", ["/PID", String(browser.pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
  server.close();
  await delay(300);
  const tempRoot = path.resolve(tmpdir()) + path.sep;
  if (profile.startsWith(tempRoot) && existsSync(profile)) rmSync(profile, { recursive: true, force: true });
}
