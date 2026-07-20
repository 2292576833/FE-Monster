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
const playbackScreenshotPath = path.resolve("artifacts", "qishui-playback-card.png");
const playbackExpandedScreenshotPath = path.resolve("artifacts", "qishui-playback-card-expanded.png");
const playbackPresetScreenshotPath = path.resolve("artifacts", "unified-playback-preset-panel.png");
const playbackPlaylistScreenshotPath = path.resolve("artifacts", "unified-playback-playlist-panel.png");
const playbackSongScreenshotPath = path.resolve("artifacts", "unified-playback-song-panel.png");
const playbackLandscapeScreenshotPath = path.resolve("artifacts", "unified-playback-landscape.png");
const playbackFullscreenScreenshotPath = path.resolve("artifacts", "unified-playback-fullscreen-lyrics.png");
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
        if (pathname === '/api/player/seek') {
          const position = Number(requestUrl.searchParams.get('position'));
          window.__qishuiRequests.push({ route: 'seek', position });
          return jsonResponse({ ok: true, position });
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
      closeLoginDialog();
      const boot = document.querySelector('#bootScreen');
      if (boot) boot.hidden = true;
      state.activeProvider = 'qishui';
      state.currentSong = {
        id: 'qishui-card-current',
        title: 'Qishui Playback',
        artist: 'FE Monster',
        album: 'Qishui Music',
        provider: 'qishui',
        duration: 187
      };
      state.queue = [
        { id: 'qishui-card-previous', title: 'Previous', artist: 'FE Monster', provider: 'qishui' },
        state.currentSong,
        { id: 'qishui-card-next', title: 'Next', artist: 'FE Monster', provider: 'qishui' }
      ];
      state.queueIndex = 1;
      state.playbackPage = true;
      updatePlaybackPageClass();
      renderCurrent(state.currentSong);
      const playbackCard = document.querySelector('#qishuiPlaybackCard');
      const playbackPhone = document.querySelector('#qishuiPlaybackPhone');
      const playbackTitle = document.querySelector('#qishuiPlaybackTitle');
      const playbackArtist = document.querySelector('#qishuiPlaybackArtist');
      const playbackPrevious = document.querySelector('#qishuiPlaybackPreviousButton');
      const playbackPlay = document.querySelector('#qishuiPlaybackPlayButton');
      const playbackNext = document.querySelector('#qishuiPlaybackNextButton');
      const playbackProgress = document.querySelector('#qishuiPlaybackProgressRange');
      const playbackScaleToggle = document.querySelector('#qishuiPlaybackScaleToggle');
      const playbackVisibilityToggle = document.querySelector('#qishuiPlaybackVisibilityToggle');
      if (!playbackCard || !playbackPhone || !playbackTitle || !playbackArtist
        || !playbackPrevious || !playbackPlay || !playbackNext || !playbackProgress) {
        throw new Error('Qishui playback card controls are incomplete');
      }
      await waitFor(() => !playbackCard.hidden && playbackCard.getBoundingClientRect().width > 0, 'Qishui playback card');
      const compactWidth = playbackCard.getBoundingClientRect().width;
      const hitClick = (button) => {
        if (!button) return false;
        const rect = button.getBoundingClientRect();
        const target = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        );
        const hit = target === button || button.contains(target);
        if (hit) {
          target.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          }));
        }
        return hit;
      };
      const playbackPhoneRect = playbackPhone.getBoundingClientRect();
      const playbackScaleRect = playbackScaleToggle?.getBoundingClientRect();
      const playbackVisibilityRect = playbackVisibilityToggle?.getBoundingClientRect();
      const playbackToolsRect = document.querySelector('#qishuiPlaybackTools')?.getBoundingClientRect();
      const playbackViewControlsIntegrated = !!playbackScaleRect
        && !!playbackVisibilityRect
        && !!playbackToolsRect
        && playbackScaleRect.left >= playbackPhoneRect.left
        && playbackVisibilityRect.left >= playbackPhoneRect.left
        && playbackScaleRect.right <= playbackPhoneRect.right
        && playbackVisibilityRect.right <= playbackPhoneRect.right
        && playbackScaleRect.top >= playbackPhoneRect.top
        && playbackVisibilityRect.top >= playbackPhoneRect.top
        && playbackScaleRect.bottom <= playbackPhoneRect.top + 54
        && playbackVisibilityRect.bottom <= playbackPhoneRect.top + 54
        && playbackScaleRect.bottom <= playbackToolsRect.top
        && playbackVisibilityRect.bottom <= playbackToolsRect.top;
      const playbackViewButtonStyles = [playbackScaleToggle, playbackVisibilityToggle]
        .map((button) => {
          const style = getComputedStyle(button);
          return {
            backgroundColor: style.backgroundColor,
            boxShadow: style.boxShadow,
            backdropFilter: style.backdropFilter
          };
        });
      const playbackViewControlsPanelFree = playbackViewButtonStyles.every((style) =>
        style.backgroundColor === 'rgba(0, 0, 0, 0)'
        && style.boxShadow === 'none'
        && style.backdropFilter === 'none'
      );
      const playbackCardStartsCompact = playbackCard.classList.contains('is-compact')
        && !playbackCard.classList.contains('is-expanded');
      document.querySelector('.qishui-playback-ambient')?.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true
      }));
      await new Promise((resolve) => setTimeout(resolve, 320));
      const playbackCardClickDoesNotScale = playbackCard.classList.contains('is-compact')
        && !playbackCard.classList.contains('is-expanded');
      document.querySelector('.qishui-playback-ambient')?.dispatchEvent(new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true
      }));
      await new Promise((resolve) => setTimeout(resolve, 320));
      const playbackCardDoubleClickDoesNotScale = playbackCard.classList.contains('is-compact')
        && !playbackCard.classList.contains('is-expanded');
      const playbackScaleButtonHit = hitClick(playbackScaleToggle);
      await new Promise((resolve) => setTimeout(resolve, 320));
      const playbackScaleButtonExpands = playbackScaleButtonHit
        && playbackCard.classList.contains('is-expanded')
        && playbackCard.getBoundingClientRect().width > compactWidth
        && playbackScaleToggle.getAttribute('aria-pressed') === 'true';
      const playbackScaleRestoreButtonHit = hitClick(playbackScaleToggle);
      await new Promise((resolve) => setTimeout(resolve, 320));
      const playbackScaleButtonCompacts = playbackScaleRestoreButtonHit
        && playbackCard.classList.contains('is-compact')
        && !playbackCard.classList.contains('is-expanded')
        && playbackScaleToggle.getAttribute('aria-pressed') === 'false';
      const playbackHideButtonHit = hitClick(playbackVisibilityToggle);
      await new Promise((resolve) => setTimeout(resolve, 260));
      const hiddenToggleRect = playbackVisibilityToggle?.getBoundingClientRect();
      const hiddenCardRect = playbackCard.getBoundingClientRect();
      const playbackHideButtonHides = playbackHideButtonHit
        && playbackCard.classList.contains('is-user-hidden')
        && playbackVisibilityToggle.getAttribute('aria-pressed') === 'true'
        && hiddenCardRect.width <= 52
        && hiddenCardRect.height <= 52
        && hiddenToggleRect.left >= hiddenCardRect.left
        && hiddenToggleRect.right <= hiddenCardRect.right
        && hiddenToggleRect.top >= hiddenCardRect.top
        && hiddenToggleRect.bottom <= hiddenCardRect.bottom;
      const playbackRestoreButtonHit = hitClick(playbackVisibilityToggle);
      await new Promise((resolve) => setTimeout(resolve, 260));
      const playbackHideButtonRestores = playbackRestoreButtonHit
        && !playbackCard.classList.contains('is-user-hidden')
        && playbackVisibilityToggle.getAttribute('aria-pressed') === 'false'
        && Number.parseFloat(getComputedStyle(playbackPhone).opacity) > 0.95;

      setTextPreset('none');
      const qaPlaybackLyricLines = [
        { time: 0, text: 'Lyric line 01' },
        { time: 4, text: 'Lyric line 02' },
        { time: 8, text: 'Lyric line 03' },
        { time: 12, text: 'Lyric line 04' },
        { time: 16, text: 'Lyric line 05' },
        { time: 20, text: 'Lyric line 06' },
        { time: 24, text: 'Current lyric line 07 can wrap onto another line when needed' },
        { time: 28, text: 'Lyric line 08' },
        { time: 32, text: 'Lyric line 09' },
        { time: 36, text: 'Lyric line 10' },
        { time: 40, text: 'Lyric line 11' },
        { time: 44, text: 'Lyric line 12' },
        { time: 48, text: 'Lyric line 13' },
        { time: 52, text: 'Lyric line 14' },
        { time: 56, text: 'Lyric line 15' },
        { time: 60, text: 'Lyric line 16' },
        { time: 64, text: 'Lyric line 17' },
        { time: 68, text: 'Lyric line 18' },
        { time: 72, text: 'Lyric line 19' },
        { time: 76, text: 'Lyric line 20' },
        { time: 80, text: 'Lyric line 21' },
        { time: 84, text: 'Lyric line 22' },
        { time: 88, text: 'Lyric line 23' },
        { time: 92, text: 'Lyric line 24' }
      ];
      state.lyricLines = qaPlaybackLyricLines;
      const previousAudioSrc = els.audio?.getAttribute('src') ?? null;
      els.audio?.pause();
      els.audio?.removeAttribute('src');
      const previousPlayerClock = { ...state.playerClock };
      state.playerClock = {
        ...state.playerClock,
        playing: false,
        position: 24,
        duration: 52,
        updatedAt: performance.now()
      };
      state.lyricIndex = 6;
      updateQishuiPlaybackLyrics(state.lyricLines[6].text, state.lyricLines[7].text, 24);
      syncPlaybackLyricVisibility();
      const lyricPage = document.querySelector('#qishuiPlaybackLyricPage');
      const playbackCardLyricLines = Array.from(
        document.querySelectorAll('#qishuiPlaybackLyrics .qishui-playback-lyric-line')
      );
      const playbackCardBookLyrics = document.querySelector('#qishuiPlaybackLyrics')?.hidden === false
        && lyricPage?.classList.contains('book-lyric-list')
        && playbackCardLyricLines.length === state.lyricLines.length
        && playbackCardLyricLines.some((line) => line.classList.contains('is-current'))
        && playbackCardLyricLines.every((line) =>
          line.querySelector('.book-lyric-copy--base')
          && line.querySelector('.book-lyric-copy--hot')
        )
        && getComputedStyle(
          playbackCardLyricLines.find((line) => line.classList.contains('is-current'))
            ?.querySelector('.book-lyric-line-text')
        ).whiteSpace === 'normal'
        && document.querySelector('#playbackLyricScene')?.hidden === true;

      const initialPlaybackLyricIndex = lyricPage?.dataset.activeIndex || '';
      const initialPlaybackLyricArrivedIndex = lyricPage?.dataset.arrivedIndex || '';
      const lyricScrollStart = lyricPage.scrollTop;
      state.playerClock = {
        ...state.playerClock,
        playing: false,
        position: 28,
        duration: 52,
        updatedAt: performance.now()
      };
      state.lyricIndex = 7;
      updateQishuiPlaybackLyrics(
        state.lyricLines[7].text,
        state.lyricLines[8].text,
        28,
        { playbackRunning: true }
      );
      const arrivingPlaybackLyric = lyricPage?.querySelector('.is-arriving');
      const arrivingPlaybackLyricStyle = arrivingPlaybackLyric
        ? getComputedStyle(arrivingPlaybackLyric)
        : null;
      const lyricScrollTarget = arrivingPlaybackLyric
        ? bookLyricTargetScrollTop(arrivingPlaybackLyric, {
            list: lyricPage,
            store: state.qishuiPlaybackCard
          })
        : Number.NaN;
      const lyricScrollAfterFirstStep = lyricPage.scrollTop;
      const pendingPlaybackLyricIndex = lyricPage?.dataset.activeIndex || '';
      const pendingLyricClientHeight = lyricPage?.clientHeight ?? null;
      const pendingLyricScrollHeight = lyricPage?.scrollHeight ?? null;
      const playbackLyricHighlightWaitsForArrival = lyricPage?.classList.contains('is-highlight-pending')
        && arrivingPlaybackLyric
        && !arrivingPlaybackLyric.classList.contains('is-current')
        && !arrivingPlaybackLyric.hasAttribute('aria-current')
        && Number.parseFloat(arrivingPlaybackLyricStyle?.opacity || '1') <= 0.72;
      const playbackLyricHighlightWasPremature = Boolean(
        arrivingPlaybackLyric?.classList.contains('is-current')
        || arrivingPlaybackLyric?.classList.contains('is-scroll-arrived')
      );
      const playbackLyricMotionSmooth = Number.isFinite(lyricScrollTarget)
        && Math.abs(lyricScrollAfterFirstStep - lyricScrollStart) > 0.1
        && Math.abs(lyricScrollTarget - lyricScrollAfterFirstStep) > 0.65
        && Math.sign(lyricScrollAfterFirstStep - lyricScrollStart)
          === Math.sign(lyricScrollTarget - lyricScrollStart);

      const lyricScrollFixture = document.createElement('div');
      lyricScrollFixture.style.cssText = [
        'position:fixed',
        'left:-1000px',
        'top:0',
        'width:220px',
        'height:176px',
        'box-sizing:border-box',
        'border:0',
        'padding:0',
        'overflow:hidden'
      ].join(';');
      const lyricScrollFixtureBefore = document.createElement('div');
      lyricScrollFixtureBefore.style.height = '332px';
      const lyricScrollFixtureLine = document.createElement('button');
      lyricScrollFixtureLine.type = 'button';
      lyricScrollFixtureLine.style.cssText = [
        'display:block',
        'width:100%',
        'height:39px',
        'min-height:39px',
        'box-sizing:border-box',
        'border:0',
        'margin:0',
        'padding:0'
      ].join(';');
      const lyricScrollFixtureAfter = document.createElement('div');
      lyricScrollFixtureAfter.style.height = '400px';
      lyricScrollFixture.append(
        lyricScrollFixtureBefore,
        lyricScrollFixtureLine,
        lyricScrollFixtureAfter
      );
      document.body.appendChild(lyricScrollFixture);
      lyricScrollFixture.scrollTop = 230;
      const lyricScrollFixtureStore = {
        lyricBookScrollTarget: Number.NaN,
        lyricBookScrollFrameAt: 0,
        lyricBookLayoutVersion: 0
      };
      resetBookLyricScrollState({ store: lyricScrollFixtureStore });
      const continuousLyricSamples = [{
        at: performance.now(),
        top: lyricScrollFixture.scrollTop,
        arrived: false
      }];
      let continuousLyricArrived = false;
      for (let frame = 0; frame < 48 && !continuousLyricArrived; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame((at) => {
          continuousLyricArrived = syncBookLyricScroll(lyricScrollFixtureLine, {
            list: lyricScrollFixture,
            store: lyricScrollFixtureStore,
            lines: [{ time: 0 }, { time: 4 }],
            activeIndex: 0,
            reducedMotion: false,
            playbackRunning: true
          });
          continuousLyricSamples.push({
            at,
            top: lyricScrollFixture.scrollTop,
            arrived: continuousLyricArrived
          });
          resolve();
        }));
      }
      const continuousLyricTarget = bookLyricTargetScrollTop(lyricScrollFixtureLine, {
        list: lyricScrollFixture,
        store: lyricScrollFixtureStore
      });
      lyricScrollFixture.remove();
      const continuousLyricDeltas = continuousLyricSamples
        .slice(1)
        .map((sample, index) => sample.top - continuousLyricSamples[index].top);
      const continuousMovingFrames = continuousLyricDeltas
        .filter((delta) => Math.abs(delta) >= 0.5)
        .length;
      let continuousMaxStationaryRun = 0;
      let continuousStationaryRun = 0;
      continuousLyricDeltas.forEach((delta, index) => {
        const arrivedBeforeStep = continuousLyricSamples[index]?.arrived;
        if (!arrivedBeforeStep && Math.abs(delta) < 0.5) {
          continuousStationaryRun += 1;
          continuousMaxStationaryRun = Math.max(
            continuousMaxStationaryRun,
            continuousStationaryRun
          );
        } else {
          continuousStationaryRun = 0;
        }
      });
      const playbackLyricContinuousScrollSmooth = continuousLyricArrived
        && continuousMovingFrames >= 6
        && new Set(continuousLyricSamples.map((sample) => sample.top)).size >= 7
        && continuousMaxStationaryRun <= 2
        && Math.abs(
          continuousLyricSamples[continuousLyricSamples.length - 1].top
            - continuousLyricTarget
        ) <= 0.65;

      for (let frame = 0; frame < 90 && lyricPage?.dataset.arrivedIndex !== '7'; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
        state.lyricLines = qaPlaybackLyricLines;
        updateQishuiPlaybackLyrics(
          qaPlaybackLyricLines[7].text,
          qaPlaybackLyricLines[8].text,
          28,
          { playbackRunning: true }
        );
      }
      const arrivedPlaybackLyricIndex = lyricPage?.dataset.arrivedIndex || '';
      const arrivedPlaybackLyricScrollTop = lyricPage?.scrollTop ?? null;
      await new Promise((resolve) => setTimeout(resolve, 220));
      const currentPlaybackLyric = lyricPage?.querySelector('.is-current.is-scroll-arrived');
      const adjacentPlaybackLyric = currentPlaybackLyric?.previousElementSibling
        || currentPlaybackLyric?.nextElementSibling;
      const arrivedPlaybackLyricStyle = currentPlaybackLyric
        ? getComputedStyle(currentPlaybackLyric)
        : null;
      const arrivedAdjacentPlaybackLyricStyle = adjacentPlaybackLyric
        ? getComputedStyle(adjacentPlaybackLyric)
        : null;
      const arrivedPlaybackLyricTextStyle = currentPlaybackLyric
        ? getComputedStyle(currentPlaybackLyric.querySelector('.book-lyric-line-text'))
        : null;
      const arrivedAdjacentPlaybackLyricTextStyle = adjacentPlaybackLyric
        ? getComputedStyle(adjacentPlaybackLyric.querySelector('.book-lyric-line-text'))
        : null;
      const arrivedHotCopy = currentPlaybackLyric?.querySelector('.book-lyric-copy--hot');
      const playbackLyricScrollHighlight = lyricPage?.dataset.activeIndex === '7'
        && lyricPage.dataset.arrivedIndex === '7'
        && currentPlaybackLyric?.dataset.bookLyricIndex === '7'
        && currentPlaybackLyric?.dataset.text === 'Lyric line 08';
      const playbackLyricHighlightVisible = !lyricPage?.classList.contains('is-highlight-pending')
        && arrivedPlaybackLyricStyle
        && arrivedAdjacentPlaybackLyricStyle
        && arrivedPlaybackLyricTextStyle
        && arrivedAdjacentPlaybackLyricTextStyle
        && Number.parseFloat(arrivedPlaybackLyricStyle.opacity)
          - Number.parseFloat(arrivedAdjacentPlaybackLyricStyle.opacity) >= 0.3
        && Number.parseFloat(arrivedPlaybackLyricTextStyle.fontSize)
          - Number.parseFloat(arrivedAdjacentPlaybackLyricTextStyle.fontSize) >= 3
        && Number.parseFloat(getComputedStyle(arrivedHotCopy).opacity) > 0.9
        && Number.parseFloat(
          currentPlaybackLyric.style.getPropertyValue('--book-line-progress') || '0'
        ) > 0;
      const playbackLyricUsesSongTypeface = /SimSun|\u5b8b\u4f53/i.test(
        arrivedPlaybackLyricTextStyle?.fontFamily || ''
      );
      const playbackLyricVisualDelta = arrivedPlaybackLyricStyle
        && arrivedAdjacentPlaybackLyricStyle
        && arrivedPlaybackLyricTextStyle
        && arrivedAdjacentPlaybackLyricTextStyle
        ? {
            opacity: Number.parseFloat(arrivedPlaybackLyricStyle.opacity)
              - Number.parseFloat(arrivedAdjacentPlaybackLyricStyle.opacity),
            fontSize: Number.parseFloat(arrivedPlaybackLyricTextStyle.fontSize)
              - Number.parseFloat(arrivedAdjacentPlaybackLyricTextStyle.fontSize),
            fontFamily: arrivedPlaybackLyricTextStyle.fontFamily
          }
        : null;

      const playbackLyricFullscreenClassWasPresent = els.appShell.classList.contains('is-window-fullscreen');
      els.appShell.classList.add('is-window-fullscreen');
      scheduleQishuiPlaybackLyricLayout();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (state.orb.animationFrame) window.cancelAnimationFrame(state.orb.animationFrame);
      state.orb.animationFrame = 0;
      state.playerClock = {
        ...state.playerClock,
        playing: false,
        position: qaPlaybackLyricLines[7].time,
        duration: 52,
        updatedAt: performance.now()
      };
      state.lyricIndex = 7;
      updateQishuiPlaybackLyrics(
        qaPlaybackLyricLines[7].text,
        qaPlaybackLyricLines[8].text,
        qaPlaybackLyricLines[7].time
      );
      resetLyricFrameSync();
      state.playerClock = {
        ...state.playerClock,
        playing: true,
        position: qaPlaybackLyricLines[8].time,
        duration: 52,
        updatedAt: performance.now()
      };
      const playbackResumeScrollStart = lyricPage?.scrollTop ?? 0;
      els.audio.dispatchEvent(new Event('play'));
      const playbackResumeFrameScheduled = Boolean(state.orb.animationFrame);
      const playbackResumeScrollSamples = [playbackResumeScrollStart];
      for (let frame = 0; frame < 60 && lyricPage?.dataset.arrivedIndex !== '8'; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(() => {
          playbackResumeScrollSamples.push(lyricPage?.scrollTop ?? 0);
          resolve();
        }));
      }
      const playbackPostArrivalSamples = [];
      for (let frame = 0; frame < 36; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(() => {
          const highlighted = lyricPage?.querySelector(
            '.qishui-playback-lyric-line.is-current.is-scroll-arrived'
          );
          playbackPostArrivalSamples.push({
            activeIndex: lyricPage?.dataset.activeIndex || '',
            arrivedIndex: lyricPage?.dataset.arrivedIndex || '',
            highlightedIndex: highlighted?.dataset.bookLyricIndex || '',
            scrollTop: lyricPage?.scrollTop ?? 0
          });
          resolve();
        }));
      }
      const playbackLyricArrivalStable = playbackPostArrivalSamples.every((sample) => (
        sample.activeIndex === '8'
        && sample.arrivedIndex === '8'
        && sample.highlightedIndex === '8'
      ));
      const playbackResumeRestartsLyricFrames = playbackResumeFrameScheduled
        && lyricPage?.dataset.activeIndex === '8'
        && lyricPage?.dataset.arrivedIndex === '8'
        && new Set(playbackResumeScrollSamples).size >= 6;
      state.playerClock.playing = false;
      if (state.orb.animationFrame) window.cancelAnimationFrame(state.orb.animationFrame);
      state.orb.animationFrame = 0;
      if (!playbackLyricFullscreenClassWasPresent) {
        els.appShell.classList.remove('is-window-fullscreen');
        scheduleQishuiPlaybackLyricLayout();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }

      const playbackLyricProgression = [];
      for (const lyricIndex of [8, 9, 10, 11]) {
        state.lyricLines = qaPlaybackLyricLines;
        state.playerClock = {
          ...state.playerClock,
          playing: true,
          position: qaPlaybackLyricLines[lyricIndex].time,
          duration: 52,
          updatedAt: performance.now()
        };
        state.lyricIndex = lyricIndex;
        updateQishuiPlaybackLyrics(
          qaPlaybackLyricLines[lyricIndex].text,
          qaPlaybackLyricLines[lyricIndex + 1]?.text || '',
          qaPlaybackLyricLines[lyricIndex].time,
          { playbackRunning: true }
        );
        for (let frame = 0; frame < 90 && lyricPage?.dataset.arrivedIndex !== String(lyricIndex); frame += 1) {
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
          state.lyricLines = qaPlaybackLyricLines;
          updateQishuiPlaybackLyrics(
            qaPlaybackLyricLines[lyricIndex].text,
            qaPlaybackLyricLines[lyricIndex + 1]?.text || '',
            qaPlaybackLyricLines[lyricIndex].time,
            { playbackRunning: true }
          );
        }
        playbackLyricProgression.push({
          expectedIndex: lyricIndex,
          activeIndex: lyricPage?.dataset.activeIndex || '',
          arrivedIndex: lyricPage?.dataset.arrivedIndex || '',
          scrollTop: lyricPage?.scrollTop ?? null
        });
      }
      state.playerClock.playing = false;
      const playbackLyricBeyondTwoLines = playbackLyricProgression.every((entry) => (
        entry.activeIndex === String(entry.expectedIndex)
        && entry.arrivedIndex === String(entry.expectedIndex)
      )) && new Set(playbackLyricProgression.map((entry) => entry.scrollTop)).size === playbackLyricProgression.length;
      await new Promise((resolve) => setTimeout(resolve, 220));
      state.playerClock = {
        ...state.playerClock,
        playing: false,
        updatedAt: performance.now()
      };
      const lyricTransitionPerfStart = performance.now();
      for (let iteration = 0; iteration < 120; iteration += 1) {
        const lyricIndex = 4 + (iteration % 5);
        state.lyricLines = qaPlaybackLyricLines;
        state.playerClock.position = qaPlaybackLyricLines[lyricIndex].time;
        state.playerClock.updatedAt = performance.now();
        state.lyricIndex = lyricIndex;
        updateQishuiPlaybackLyrics(
          qaPlaybackLyricLines[lyricIndex].text,
          qaPlaybackLyricLines[lyricIndex + 1].text,
          qaPlaybackLyricLines[lyricIndex].time
        );
      }
      const playbackLyricTransitionDuration = performance.now() - lyricTransitionPerfStart;
      state.lyricLines = qaPlaybackLyricLines;
      updateQishuiPlaybackLyrics(
        qaPlaybackLyricLines[7].text,
        qaPlaybackLyricLines[8].text,
        28
      );
      const lyricPerfStart = performance.now();
      for (let iteration = 0; iteration < 240; iteration += 1) {
        updateQishuiPlaybackLyrics(
          qaPlaybackLyricLines[7].text,
          qaPlaybackLyricLines[8].text,
          28
        );
      }
      const playbackLyricUpdateDuration = performance.now() - lyricPerfStart;
      const playbackLyricUpdateOptimized = playbackLyricUpdateDuration < 80
        && playbackLyricTransitionDuration / 120 < 4.5
        && !updateQishuiPlaybackLyrics.toString().includes('offsetWidth')
        && lyricPage.getAnimations().length === 0;
      state.playerClock = previousPlayerClock;
      if (previousAudioSrc === null) els.audio?.removeAttribute('src');
      else els.audio?.setAttribute('src', previousAudioSrc);

      const paletteCanvas = document.createElement('canvas');
      paletteCanvas.width = 36;
      paletteCanvas.height = 36;
      const paletteContext = paletteCanvas.getContext('2d');
      paletteContext.fillStyle = '#1476d4';
      paletteContext.fillRect(0, 0, 12, 36);
      paletteContext.fillStyle = '#e0528d';
      paletteContext.fillRect(12, 0, 12, 36);
      paletteContext.fillStyle = '#f0b638';
      paletteContext.fillRect(24, 0, 12, 36);
      const paletteImage = new Image();
      paletteImage.src = paletteCanvas.toDataURL('image/png');
      await paletteImage.decode();
      const sampledPlaybackPalette = sampleCoverPalette(paletteImage);
      applyQishuiPlaybackPalette(sampledPlaybackPalette);
      const playbackPaletteValues = [
        '--playback-cover-a',
        '--playback-cover-b',
        '--playback-cover-c'
      ].map((name) => playbackPhone.style.getPropertyValue(name).trim());
      const playbackCoverThreeColorGlow = sampledPlaybackPalette?.coverColors?.length === 3
        && new Set(playbackPaletteValues).size === 3
        && playbackPaletteValues.every((value) => {
          const alpha = Number(value.slice(value.lastIndexOf(',') + 1, -1).trim());
          return Number.isFinite(alpha) && alpha > 0.3 && alpha < 0.75;
        })
        && getComputedStyle(document.querySelector('.qishui-playback-ambient'), '::before')
          .backgroundImage.includes('radial-gradient');
      const playbackAmbientStyle = getComputedStyle(document.querySelector('.qishui-playback-ambient'));
      const playbackAmbientColor = playbackAmbientStyle.backgroundColor;
      const playbackAmbientAlpha = Number(
        playbackAmbientColor.slice(playbackAmbientColor.lastIndexOf(',') + 1, -1).trim()
      );
      const playbackSceneShowsThrough = getComputedStyle(playbackPhone).backgroundColor === 'rgba(0, 0, 0, 0)'
        && Number.isFinite(playbackAmbientAlpha)
        && playbackAmbientAlpha > 0.1
        && playbackAmbientAlpha < 0.5
        && playbackAmbientStyle.backdropFilter !== 'none';

      playbackProgress.value = '500';
      playbackProgress.dispatchEvent(new Event('input', { bubbles: true }));
      playbackProgress.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(
        () => window.__qishuiRequests.some((request) => request.route === 'seek'),
        'playback progress seek'
      );
      await waitFor(() => state.qishuiPlaybackCard.seekPending === false, 'playback seek completion');
      const playbackSeekRequest = window.__qishuiRequests.find((request) => request.route === 'seek');
      const playbackProgressDraggable = playbackProgress.disabled === false
        && playbackSeekRequest?.position === 94
        && document.querySelector('#qishuiPlaybackCurrentTime')?.textContent === formatTime(187 * 0.5)
        && playbackProgress.style.getPropertyValue('--playback-progress').startsWith('50')
        && state.qishuiPlaybackCard.progressDragging === false;

      const playbackRoutes = [];
      const originalTransport = transport;
      transport = async (route) => {
        playbackRoutes.push(route);
      };
      const routesBeforeProgressWheel = playbackRoutes.length;
      playbackProgress.dispatchEvent(new WheelEvent('wheel', {
        deltaY: 88,
        bubbles: true,
        cancelable: true
      }));
      await new Promise((resolve) => setTimeout(resolve, 40));
      const playbackProgressWheelIsolated = playbackRoutes.length === routesBeforeProgressWheel;
      playbackCard.dispatchEvent(new WheelEvent('wheel', { deltaY: 88, bubbles: true, cancelable: true }));
      const playbackSwitchExitStarted = playbackPhone.classList.contains('is-switching-next')
        && state.qishuiPlaybackCard.switching === true;
      await new Promise((resolve) => setTimeout(resolve, 420));
      const playbackSwitchSettled = state.qishuiPlaybackCard.switching === false
        && !playbackPhone.classList.contains('is-switching-next')
        && !playbackPhone.classList.contains('is-switching-enter-next');
      playbackCard.dispatchEvent(new WheelEvent('wheel', { deltaY: -88, bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 420));
      playbackPrevious.click();
      await new Promise((resolve) => setTimeout(resolve, 420));
      playbackNext.click();
      await new Promise((resolve) => setTimeout(resolve, 420));
      const stageZoomBefore = Number(state.playbackVisual.zoom) || 1;
      document.querySelector('.stage')?.dispatchEvent(new WheelEvent('wheel', {
        deltaY: -88,
        bubbles: true,
        cancelable: true
      }));
      const playbackStageZoomPreserved = (Number(state.playbackVisual.zoom) || 1) > stageZoomBefore;
      transport = originalTransport;
      const playbackCardVisible = !playbackCard.hidden
        && getComputedStyle(playbackCard).visibility === 'visible'
        && getComputedStyle(playbackCard).opacity === '1';
      const playbackCardContent = playbackTitle.textContent === 'Qishui Playback'
        && playbackArtist.textContent === 'FE Monster'
        && playbackPlay.disabled === false;
      const playbackWheelRoutes = JSON.stringify(playbackRoutes)
        === JSON.stringify([
          '/api/player/next',
          '/api/player/previous',
          '/api/player/previous',
          '/api/player/next'
        ]);
      const playbackAccessibleTransport = playbackPrevious.disabled === false
        && playbackNext.disabled === false
        && playbackPrevious.getAttribute('aria-label') === '上一首'
        && playbackNext.getAttribute('aria-label') === '下一首';
      const playbackTools = Array.from(document.querySelectorAll('#qishuiPlaybackTools [data-playback-tool]'));
      const playbackTopTools = JSON.stringify(playbackTools.map((button) => button.dataset.playbackTool))
        === JSON.stringify(['playlists', 'preset', 'text', 'wallpaper', 'rhythm']);
      const playbackSingleLayer = getComputedStyle(playbackPhone, '::before').content === 'none'
        && getComputedStyle(playbackPhone, '::after').content === 'none';
      const presetBeforePanel = state.diyPreset;
      playbackTools.find((button) => button.dataset.playbackTool === 'preset')?.click();
      await new Promise((resolve) => setTimeout(resolve, 260));
      const diySidebar = document.querySelector('#diySidebar');
      const diySidebarStyle = getComputedStyle(diySidebar);
      const playbackPresetPanel = state.diyOpen
        && state.diyCardOpen
        && state.diyPage === 'preset'
        && state.diyPreset === presetBeforePanel
        && document.querySelector('.app-shell')?.classList.contains('has-playback-side-panel')
        && playbackPhone.classList.contains('is-panel-open')
        && diySidebarStyle.visibility === 'visible'
        && Number.parseFloat(diySidebarStyle.opacity) > 0.9;
      playbackTools.find((button) => button.dataset.playbackTool === 'text')?.click();
      await new Promise((resolve) => setTimeout(resolve, 260));
      const playbackTextPanel = state.diyOpen
        && state.diyPage === 'text'
        && !document.querySelector('#diyTextPage')?.hidden;
      playbackTools.find((button) => button.dataset.playbackTool === 'wallpaper')?.click();
      await new Promise((resolve) => setTimeout(resolve, 260));
      const playbackWallpaperPanel = state.diyOpen
        && state.diyPage === 'wallpaper'
        && !document.querySelector('#diyWallpaperPage')?.hidden;
      const playbackDiyTools = playbackTextPanel && playbackWallpaperPanel;
      playbackTools.find((button) => button.dataset.playbackTool === 'wallpaper')?.click();
      playbackTools.find((button) => button.dataset.playbackTool === 'playlists')?.click();
      await new Promise((resolve) => setTimeout(resolve, 260));
      const playlistOrbit = document.querySelector('#orbPlaylists');
      const playlistOrbitStyle = getComputedStyle(playlistOrbit);
      const playbackPlaylistPanel = state.playbackPlaylistPickerOpen
        && document.querySelector('.app-shell')?.classList.contains('is-playback-playlist-picker-open')
        && playbackPhone.classList.contains('is-panel-open')
        && playlistOrbitStyle.visibility === 'visible'
        && Number.parseFloat(playlistOrbitStyle.opacity) > 0.9;
      const playbackPlaylistPanelSurfaceClean = playlistOrbitStyle.backgroundColor === 'rgba(0, 0, 0, 0)'
        || playlistOrbitStyle.backgroundColor === 'transparent';
      const routesBeforePanelWheel = playbackRoutes.length;
      const panelWheelEvent = new WheelEvent('wheel', {
        deltaY: 120,
        bubbles: true,
        cancelable: true
      });
      playlistOrbit.dispatchEvent(panelWheelEvent);
      await new Promise((resolve) => setTimeout(resolve, 40));
      const playbackPanelWheelPreserved = !panelWheelEvent.defaultPrevented
        && playbackRoutes.length === routesBeforePanelWheel;
      playbackBack();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const playbackPickerBackPreserved = state.playbackPage
        && !state.playbackPlaylistPickerOpen
        && !state.playlistSongPageOpen;
      playbackTools.find((button) => button.dataset.playbackTool === 'playlists')?.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
      const originalUserPlaylistsForClick = state.userPlaylists;
      const originalApiJsonForPlaylistClick = apiJson;
      state.userPlaylists = [
        { id: 'qa-playlist', name: 'QA Playlist', provider: 'qishui', trackCount: 2 }
      ];
      renderPlaylistOrbit(playbackPlaylists());
      apiJson = async (path, options) => {
        if (String(path).includes('/playlist/tracks')) {
          return {
            songs: [
              state.currentSong,
              { id: 'qa-click-song', title: 'Single Click', artist: 'FE Monster', provider: 'qishui', duration: 201 }
            ]
          };
        }
        return originalApiJsonForPlaylistClick(path, options);
      };
      const qaPlaylistCard = document.querySelector('.orb-playlist-card[data-playlist-id="qa-playlist"]');
      qaPlaylistCard?.click();
      await waitFor(
        () => state.playlistSongPageOpen && state.activePlaylistSongs.length === 2,
        'playlist card song list'
      );
      const playbackPlaylistClickLoadsSongs = !!qaPlaylistCard
        && state.activePlaylist?.id === 'qa-playlist'
        && state.activePlaylistSongs.length === 2;
      apiJson = originalApiJsonForPlaylistClick;
      state.userPlaylists = originalUserPlaylistsForClick;
      renderPlaylistShelf(
        { id: 'qa-playlist', name: 'QA Playlist', provider: 'qishui' },
        [
          state.currentSong,
          { id: 'qa-click-song', title: 'Single Click', artist: 'FE Monster', provider: 'qishui', duration: 201 }
        ]
      );
      await new Promise((resolve) => setTimeout(resolve, 260));
      const playlistSongPage = document.querySelector('#playlistShelf');
      const playlistSongPageStyle = getComputedStyle(playlistSongPage);
      const playlistSongStage = document.querySelector('#playlistShelfStage');
      const playlistSongStageStyle = getComputedStyle(playlistSongStage);
      const playbackSongPanel = !state.playbackPlaylistPickerOpen
        && state.playlistSongPageOpen
        && document.querySelector('.app-shell')?.classList.contains('is-playback-song-panel-open')
        && playlistSongPageStyle.visibility === 'visible'
        && Number.parseFloat(playlistSongPageStyle.opacity) > 0.9
        && playlistSongStageStyle.display !== 'none'
        && playlistSongStageStyle.visibility === 'visible'
        && playlistSongStageStyle.pointerEvents === 'auto'
        && playlistSongStage.getBoundingClientRect().width > 0
        && document.querySelector('.shelf-song-button[data-song-index="0"]')?.getBoundingClientRect().height > 0;
      const playbackSongPanelSurfaceClean = playlistSongStageStyle.backgroundColor === 'rgba(0, 0, 0, 0)'
        || playlistSongStageStyle.backgroundColor === 'transparent';
      const originalApiJsonForSong = apiJson;
      const originalLoadSongForSong = loadSong;
      const originalRefreshPlayerStateForSong = refreshPlayerState;
      apiJson = async () => ({});
      loadSong = async () => true;
      refreshPlayerState = async () => {};
      const secondSongButton = document.querySelector('.shelf-song-button[data-song-index="1"]');
      await playShelfSong(secondSongButton);
      const playbackSongSingleClick = state.songFocusIndex === 1
        && state.queueIndex === 1
        && !state.playlistSongPageOpen
        && !state.playbackPlaylistPickerOpen
        && playlistSongPage.hidden;
      apiJson = originalApiJsonForSong;
      loadSong = originalLoadSongForSong;
      refreshPlayerState = originalRefreshPlayerStateForSong;

      const originalApiJsonForStale = apiJson;
      let resolveStalePlaylist;
      apiJson = async (path, options) => {
        if (String(path).includes('/playlist/tracks')) {
          return new Promise((resolve) => { resolveStalePlaylist = resolve; });
        }
        return originalApiJsonForStale(path, options);
      };
      const staleCard = document.createElement('button');
      staleCard.dataset.playlistId = 'qa-stale-playlist';
      staleCard.dataset.playlistProvider = 'qishui';
      staleCard.dataset.playlistIndex = '0';
      staleCard.dataset.playlistName = 'Stale Playlist';
      const staleLoadPromise = loadPlaylistFromCard(staleCard);
      await waitFor(() => typeof resolveStalePlaylist === 'function', 'stale playlist request');
      closePlaylistShelf({ reopenPicker: false });
      resolveStalePlaylist({
        songs: [{ id: 'stale-song', title: 'Must Not Reopen', provider: 'qishui' }]
      });
      await staleLoadPromise;
      const playbackStalePlaylistBlocked = !state.playlistSongPageOpen
        && !state.playbackPlaylistPickerOpen
        && playlistSongPage.hidden;
      apiJson = originalApiJsonForStale;

      const originalQqProvider = state.providers.qq;
      state.providers.qq = {
        ...(originalQqProvider || MUSIC_PROVIDERS.qq),
        configured: true,
        enabled: true
      };
      renderPlaylistShelf(
        { id: 'qa-provider-switch', name: 'Provider Switch', provider: 'qishui' },
        [state.currentSong]
      );
      setActiveProvider('qq');
      const playbackProviderSwitchClears = state.activeProvider === 'qq'
        && !state.playlistSongPageOpen
        && !state.playbackPlaylistPickerOpen
        && state.activePlaylist === null
        && state.activePlaylistSongs.length === 0
        && state.shelfLoadingPlaylistId === ''
        && document.querySelector('#qishuiPlaybackAccount')?.dataset.provider === 'qq';
      setActiveProvider('qishui');
      if (originalQqProvider) state.providers.qq = originalQqProvider;
      else delete state.providers.qq;
      const qishuiPlaybackSong = state.currentSong;
      const originalLoginStatuses = { ...state.loginStatusByProvider };
      const qaAvatar = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
      const providerCases = [
        {
          id: 'netease',
          label: providerInfo('netease').label,
          payload: {
            provider: 'netease',
            loggedIn: true,
            account: { nickname: '网易测试用户', avatarUrl: qaAvatar, vipType: 110 }
          }
        },
        {
          id: 'qq',
          label: providerInfo('qq').label,
          payload: {
            provider: 'qq',
            loggedIn: true,
            account: { nickname: 'QQ 测试用户', userId: '0', avatarUrl: '', vipType: '' }
          }
        },
        {
          id: 'kugou',
          label: providerInfo('kugou').label,
          payload: {
            provider: 'kugou',
            loggedIn: true,
            account: { nickname: '酷狗测试用户', avatarUrl: qaAvatar, vipLevel: 3 }
          }
        },
        {
          id: 'qishui',
          label: providerInfo('qishui').label,
          payload: {
            provider: 'qishui',
            loggedIn: true,
            account: { nickname: '汽水测试用户', avatarUrl: qaAvatar, vipType: '' }
          }
        },
        { id: 'local', label: '本地音乐', source: 'local', localUrl: 'blob:qa-local-track' }
      ];
      const playbackCardAllProviders = providerCases.every((providerCase) => {
        if (providerCase.payload) {
          state.loginStatusByProvider[providerCase.id] = providerCase.payload;
        }
        state.activeProvider = providerCase.id === 'local' ? 'qishui' : providerCase.id;
        state.currentSong = {
          id: providerCase.id + '-card-current',
          title: providerCase.id + ' Playback',
          artist: 'FE Monster',
          provider: providerCase.id,
          source: providerCase.source,
          localUrl: providerCase.localUrl,
          duration: 203
        };
        renderCurrent(state.currentSong);
        syncQishuiPlaybackCard();
        const expectedName = providerCase.id === 'local'
          ? '本地音乐'
          : accountName(providerCase.payload);
        const expectedAvatar = providerCase.id === 'local'
          ? ''
          : accountAvatar(providerCase.payload);
        const expectedVip = providerCase.id === 'local'
          ? ''
          : accountVipLabel(providerCase.payload);
        const accountElement = document.querySelector('#qishuiPlaybackAccount');
        const accountAvatarElement = document.querySelector('#qishuiPlaybackAccountAvatar');
        const accountNameElement = document.querySelector('#qishuiPlaybackAccountName');
        const vipElement = document.querySelector('#qishuiPlaybackVipBadge');
        return !playbackCard.hidden
          && !document.querySelector('#qishuiPlaybackProviderLabel')
          && !document.querySelector('.qishui-playback-brand')
          && playbackTitle.textContent === providerCase.id + ' Playback'
          && accountElement?.dataset.provider === providerCase.id
          && accountNameElement?.textContent === expectedName
          && accountAvatarElement?.classList.contains('has-avatar') === !!expectedAvatar
          && vipElement?.hidden === !expectedVip
          && (!expectedVip || vipElement.textContent === expectedVip);
      });
      state.loginStatusByProvider = originalLoginStatuses;
      state.activeProvider = 'qishui';
      state.currentSong = qishuiPlaybackSong;
      state.queue = [
        { id: 'qishui-card-previous', title: 'Previous', artist: 'FE Monster', provider: 'qishui' },
        state.currentSong,
        { id: 'qishui-card-next', title: 'Next', artist: 'FE Monster', provider: 'qishui' }
      ];
      state.queueIndex = 1;
      renderCurrent(state.currentSong);
      window.clearTimeout(toast.timer);
      els.toast.classList.remove('show');
      await new Promise((resolve) => setTimeout(resolve, 280));
      const restoredPlaylistOrbitStyle = getComputedStyle(document.querySelector('#orbPlaylists'));
      const playbackLegacyPlaylistReplaced = !state.playbackPlaylistPickerOpen
        && restoredPlaylistOrbitStyle.visibility === 'hidden'
        && Number.parseFloat(restoredPlaylistOrbitStyle.opacity) === 0;
      applyQishuiPlaybackPalette(sampledPlaybackPalette);
      await new Promise((resolve) => setTimeout(resolve, 560));
      const playbackCardStyle = getComputedStyle(playbackCard);
      const playbackPhoneStyle = getComputedStyle(playbackPhone);
      const playbackContentStyle = getComputedStyle(document.querySelector('.qishui-playback-content'));
      const playbackComputedStyle = {
        cardOpacity: playbackCardStyle.opacity,
        cardVisibility: playbackCardStyle.visibility,
        phoneOpacity: playbackPhoneStyle.opacity,
        phoneBackground: playbackPhoneStyle.backgroundColor,
        phoneFilter: playbackPhoneStyle.filter,
        contentOpacity: playbackContentStyle.opacity,
      };
      const playbackTextClear = playbackContentStyle.transform === 'none'
        && Number.parseFloat(getComputedStyle(document.querySelector('.qishui-playback-account-meta')).fontSize) >= 10
        && Number.parseFloat(getComputedStyle(document.querySelector('.qishui-playback-times')).fontSize) >= 10
        && Number.parseFloat(getComputedStyle(document.querySelector('.qishui-playback-direction small')).fontSize) >= 10
        && Number.parseFloat(getComputedStyle(playbackArtist).fontSize) >= 11
        && getComputedStyle(playbackArtist).textShadow !== 'none';
      playbackTools.find((button) => button.dataset.playbackTool === 'rhythm')?.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      const playbackRhythmTool = window.FeRhythmGame?.getState().active === true
        && !document.querySelector('#rhythmGameScene')?.hidden;
      window.FeRhythmGame?.close();
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
        playbackCardVisible,
        playbackCardContent,
        playbackViewControlsIntegrated,
        playbackViewControlsPanelFree,
        playbackViewButtonStyles,
        playbackCardStartsCompact,
        playbackCardClickDoesNotScale,
        playbackCardDoubleClickDoesNotScale,
        playbackScaleButtonExpands,
        playbackScaleButtonCompacts,
        playbackHideButtonHides,
        playbackHideButtonRestores,
        playbackCardBookLyrics,
        playbackLyricScrollHighlight,
        playbackLyricMotionSmooth,
        playbackLyricContinuousScrollSmooth,
        playbackLyricHighlightWaitsForArrival,
        playbackLyricHighlightVisible,
        playbackResumeRestartsLyricFrames,
        playbackResumeFrameScheduled,
        playbackResumeScrollSamples,
        playbackLyricArrivalStable,
        playbackPostArrivalSamples,
        playbackLyricBeyondTwoLines,
        playbackLyricProgression,
        playbackLyricHighlightWasPremature,
        playbackLyricUsesSongTypeface,
        playbackLyricScrollMetrics: {
          initialIndex: initialPlaybackLyricIndex,
          initialArrivedIndex: initialPlaybackLyricArrivedIndex,
          pendingIndex: pendingPlaybackLyricIndex,
          arrivedIndex: arrivedPlaybackLyricIndex,
          clientHeight: pendingLyricClientHeight,
          scrollHeight: pendingLyricScrollHeight,
          start: lyricScrollStart,
          firstStep: lyricScrollAfterFirstStep,
          target: lyricScrollTarget,
          arrived: arrivedPlaybackLyricScrollTop
        },
        playbackLyricContinuousScrollMetrics: {
          sampleCount: continuousLyricSamples.length,
          movingFrames: continuousMovingFrames,
          uniquePositions: new Set(continuousLyricSamples.map((sample) => sample.top)).size,
          maxStationaryRun: continuousMaxStationaryRun,
          target: continuousLyricTarget,
          arrived: continuousLyricSamples[continuousLyricSamples.length - 1].top,
          samples: continuousLyricSamples
        },
        playbackLyricVisualDelta,
        playbackLyricTransitionDuration,
        playbackLyricUpdateDuration,
        playbackLyricUpdateOptimized,
        playbackCoverThreeColorGlow,
        playbackSceneShowsThrough,
        playbackProgressDraggable,
        playbackProgressWheelIsolated,
        playbackSwitchExitStarted,
        playbackSwitchSettled,
        playbackWheelRoutes,
        playbackAccessibleTransport,
        playbackStageZoomPreserved,
        playbackTopTools,
        playbackSingleLayer,
        playbackPresetPanel,
        playbackDiyTools,
        playbackPlaylistPanel,
        playbackPlaylistPanelSurfaceClean,
        playbackPanelWheelPreserved,
        playbackPickerBackPreserved,
        playbackPlaylistClickLoadsSongs,
        playbackSongPanel,
        playbackSongPanelSurfaceClean,
        playbackSongSingleClick,
        playbackStalePlaylistBlocked,
        playbackProviderSwitchClears,
        playbackCardAllProviders,
        playbackTextClear,
        playbackLegacyPlaylistReplaced,
        playbackRhythmTool,
        playbackComputedStyle,
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
        && result.codeCleared
        && result.playbackCardVisible
        && result.playbackCardContent
        && result.playbackViewControlsIntegrated
        && result.playbackViewControlsPanelFree
        && result.playbackCardStartsCompact
        && result.playbackCardClickDoesNotScale
        && result.playbackCardDoubleClickDoesNotScale
        && result.playbackScaleButtonExpands
        && result.playbackScaleButtonCompacts
        && result.playbackHideButtonHides
        && result.playbackHideButtonRestores
        && result.playbackCardBookLyrics
        && result.playbackLyricScrollHighlight
        && result.playbackLyricMotionSmooth
        && result.playbackLyricContinuousScrollSmooth
        && result.playbackLyricHighlightWaitsForArrival
        && result.playbackLyricHighlightVisible
        && result.playbackResumeRestartsLyricFrames
        && result.playbackLyricArrivalStable
        && result.playbackLyricBeyondTwoLines
        && !result.playbackLyricHighlightWasPremature
        && result.playbackLyricUsesSongTypeface
        && result.playbackLyricUpdateOptimized
        && result.playbackCoverThreeColorGlow
        && result.playbackSceneShowsThrough
        && result.playbackProgressDraggable
        && result.playbackProgressWheelIsolated
        && result.playbackSwitchExitStarted
        && result.playbackSwitchSettled
        && result.playbackWheelRoutes
        && result.playbackAccessibleTransport
        && result.playbackStageZoomPreserved
        && result.playbackTopTools
        && result.playbackSingleLayer
        && result.playbackPresetPanel
        && result.playbackDiyTools
        && result.playbackPlaylistPanel
        && result.playbackPlaylistPanelSurfaceClean
        && result.playbackPanelWheelPreserved
        && result.playbackPickerBackPreserved
        && result.playbackPlaylistClickLoadsSongs
        && result.playbackSongPanel
        && result.playbackSongPanelSurfaceClean
        && result.playbackSongSingleClick
        && result.playbackStalePlaylistBlocked
        && result.playbackProviderSwitchClears
        && result.playbackCardAllProviders
        && result.playbackTextClear
        && result.playbackLegacyPlaylistReplaced
        && result.playbackRhythmTool;
      return result;
    })()`,
  });
  if (evaluation.exceptionDetails) {
    const details = evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text;
    throw new Error(details || "Qishui login UI evaluation failed");
  }
  await delay(650);
  const playbackScreenshot = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  mkdirSync(path.dirname(playbackScreenshotPath), { recursive: true });
  writeFileSync(playbackScreenshotPath, Buffer.from(playbackScreenshot.data, "base64"));
  evaluation.result.value.playbackScreenshotPath = playbackScreenshotPath;
  await command("Runtime.evaluate", {
    expression: `setQishuiPlaybackExpanded(true)`,
  });
  await delay(320);
  const playbackExpandedScreenshot = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(playbackExpandedScreenshotPath, Buffer.from(playbackExpandedScreenshot.data, "base64"));
  evaluation.result.value.playbackExpandedScreenshotPath = playbackExpandedScreenshotPath;
  await command("Runtime.evaluate", {
    expression: `setQishuiPlaybackExpanded(false)`,
  });
  await delay(280);
  await command("Runtime.evaluate", {
    expression: `openPlaybackDiyPanel('preset')`,
  });
  await delay(360);
  const playbackPresetScreenshot = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(playbackPresetScreenshotPath, Buffer.from(playbackPresetScreenshot.data, "base64"));
  evaluation.result.value.playbackPresetScreenshotPath = playbackPresetScreenshotPath;
  await command("Runtime.evaluate", {
    expression: `(() => {
      openPlaybackDiyPanel('preset');
      setPlaybackPlaylistPickerOpen(true);
    })()`,
  });
  await delay(360);
  const playbackPlaylistScreenshot = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(playbackPlaylistScreenshotPath, Buffer.from(playbackPlaylistScreenshot.data, "base64"));
  evaluation.result.value.playbackPlaylistScreenshotPath = playbackPlaylistScreenshotPath;
  await command("Runtime.evaluate", {
    expression: `(() => {
      state.songFocusIndex = 7;
      renderPlaylistShelf(
        { id: 'qa-visual-playlist', name: 'Playlist panel capacity', provider: 'qishui' },
        Array.from({ length: 15 }, (_, index) => ({
          id: 'qa-panel-song-' + index,
          title: 'Playlist song ' + String(index + 1).padStart(2, '0'),
          artist: 'FE Monster',
          provider: 'qishui',
          duration: 180 + index
        }))
      );
    })()`,
  });
  await delay(360);
  const playbackSongScreenshot = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(playbackSongScreenshotPath, Buffer.from(playbackSongScreenshot.data, "base64"));
  evaluation.result.value.playbackSongScreenshotPath = playbackSongScreenshotPath;
  const playbackSongPanelCapacity = await command("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const stage = document.querySelector('#playlistShelfStage');
      const viewport = document.querySelector('#playlistShelfScroll');
      const viewportRect = viewport.getBoundingClientRect();
      const visibleRows = Array.from(document.querySelectorAll('#playlistSongStack .shelf-song-button'))
        .filter((row) => {
          const style = getComputedStyle(row);
          const rect = row.getBoundingClientRect();
          return style.visibility !== 'hidden'
            && Number.parseFloat(style.opacity) > 0
            && rect.bottom > viewportRect.top
            && rect.top < viewportRect.bottom;
        }).length;
      return {
        stageWidth: stage.clientWidth,
        stageHeight: stage.clientHeight,
        listHeight: viewport.clientHeight,
        visibleRows,
        pass: stage.clientWidth >= 420
          && stage.clientHeight >= 680
          && viewport.clientHeight >= 560
          && visibleRows >= 9
      };
    })()`,
  });
  evaluation.result.value.playbackSongPanelCapacity = playbackSongPanelCapacity.result.value;
  evaluation.result.value.playbackSongPanelCapacityPass = playbackSongPanelCapacity.result.value.pass;
  evaluation.result.value.ok = evaluation.result.value.ok && playbackSongPanelCapacity.result.value.pass;
  await command("Runtime.evaluate", {
    expression: `(() => {
      closePlaylistShelf({ reopenPicker: false });
      setPlaybackPlaylistPickerOpen(false);
      if (state.diyOpen) setDiyOpen(false);
    })()`,
  });
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1024,
    height: 576,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(180);
  const desktopScaleEvaluation = await command("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      state.currentSong = {
        id: 'qa-fullscreen-book-lyric',
        title: 'Fullscreen book lyrics',
        artist: 'FE Monster',
        provider: 'local',
        duration: 52
      };
      if (!Array.isArray(state.lyricLines) || state.lyricLines.length < 9) {
        state.lyricLines = Array.from({ length: 13 }, (_, index) => ({
          time: index * 4,
          text: 'Fullscreen lyric line ' + String(index + 1).padStart(2, '0')
        }));
      }
      state.playerClock = {
        ...state.playerClock,
        playing: false,
        position: 24,
        duration: 52,
        updatedAt: performance.now()
      };
      els.audio?.pause();
      els.audio?.removeAttribute('src');
      updateQishuiPlaybackLyrics(state.lyricLines[6].text, state.lyricLines[7].text, 24);
      const card = document.querySelector('#qishuiPlaybackCard');
      const lyrics = document.querySelector('#qishuiPlaybackLyrics');
      const previousTransition = card.style.transition;
      card.style.transition = 'none';
      setQishuiPlaybackExpanded(false);
      const compactRect = card.getBoundingClientRect();
      setQishuiPlaybackExpanded(true);
      const expandedRect = card.getBoundingClientRect();
      const lyricsRect = lyrics.getBoundingClientRect();
      const lyricsStyle = getComputedStyle(lyrics);
      const lyricLines = Array.from(
        document.querySelectorAll('#qishuiPlaybackLyricPage .qishui-playback-lyric-line')
      );
      const lyricPanelRemoved = lyricsStyle.backgroundColor === 'rgba(0, 0, 0, 0)'
        && getComputedStyle(lyrics, '::before').content === 'none'
        && getComputedStyle(lyrics, '::after').content === 'none';
      const visibleLyricLines = lyricLines.filter((line) => {
          const rect = line.getBoundingClientRect();
          const style = getComputedStyle(line);
          return style.display !== 'none'
            && rect.width > 0
            && rect.height > 0
            && rect.bottom > lyricsRect.top + 1
            && rect.top < lyricsRect.bottom - 1;
        });
      const lyricsResponsive = lyricLines.length >= 9
        && visibleLyricLines.length >= 4
        && lyricLines.every((line) =>
          line.querySelector('.book-lyric-copy--base')
          && line.querySelector('.book-lyric-copy--hot')
        );
      setQishuiPlaybackExpanded(false);
      card.style.transition = previousTransition;
      return {
        compactWidth: compactRect.width,
        expandedWidth: expandedRect.width,
        lyricsWidth: lyricsRect.width,
        lyricsHeight: lyricsRect.height,
        lyricPanelRemoved,
        lyricLineCount: lyricLines.length,
        visibleLyricLineCount: visibleLyricLines.length,
        lyricsResponsive,
        right: compactRect.right,
        pass: compactRect.width >= 260
          && compactRect.width <= 278
          && expandedRect.width >= 620
          && expandedRect.width >= compactRect.width + 350
          && lyricsRect.width >= 300
          && lyricsRect.height >= 180
          && lyricPanelRemoved
          && lyricsResponsive
          && compactRect.right <= innerWidth
          && compactRect.right >= innerWidth - 20
      };
    })()`,
  });
  evaluation.result.value.playbackDesktopScale = desktopScaleEvaluation.result.value;
  evaluation.result.value.playbackDesktopScalePass = desktopScaleEvaluation.result.value.pass === true;
  evaluation.result.value.ok = evaluation.result.value.ok
    && evaluation.result.value.playbackDesktopScalePass;
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(180);
  const fullscreenLyricEvaluation = await command("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const card = document.querySelector('#qishuiPlaybackCard');
      const cover = document.querySelector('#qishuiPlaybackCoverFrame');
      const lyrics = document.querySelector('#qishuiPlaybackLyrics');
      const lyricPage = document.querySelector('#qishuiPlaybackLyricPage');
      const previousTransition = card.style.transition;
      card.style.transition = 'none';
      state.appWindowFullscreen = true;
      syncWindowFullscreenState();
      setQishuiPlaybackExpanded(false);
      updateQishuiPlaybackLyrics(state.lyricDisplayText, state.lyricSubtitleText);
      const cardRect = card.getBoundingClientRect();
      const coverRect = cover.getBoundingClientRect();
      const lyricsRect = lyrics.getBoundingClientRect();
      const lyricLines = Array.from(
        lyricPage.querySelectorAll('.qishui-playback-lyric-line')
      );
      const lineRects = lyricLines.map((line) => line.getBoundingClientRect());
      const currentLine = lyricLines.find((line) => line.classList.contains('is-current'));
      const currentLineRect = currentLine?.getBoundingClientRect();
      const currentText = currentLine?.querySelector('.book-lyric-line-text');
      const currentFontSize = Number.parseFloat(getComputedStyle(currentText).fontSize);
      const visibleLyricLineCount = lineRects.filter((rect) =>
        rect.bottom > lyricsRect.top + 1
        && rect.top < lyricsRect.bottom - 1
        && rect.width > 0
        && rect.height > 0
      ).length;
      const centerOffset = currentLineRect
        ? Math.abs(
            currentLineRect.top + currentLineRect.height / 2
              - (lyricsRect.top + lyricsRect.height / 2)
          )
        : Number.POSITIVE_INFINITY;
      const fullBookList = lyricLines.length >= 9
        && lyricLines.every((line) =>
          line.querySelector('.book-lyric-copy--base')
          && line.querySelector('.book-lyric-copy--hot')
        );
      const previousLyricLines = state.lyricLines;
      const previousPlayerClock = { ...state.playerClock };
      const previousLyricIndex = state.lyricIndex;
      const previousCurrentSong = state.currentSong;
      const previousLyricSignature = state.lyricSignature;
      const previousLocalQueueActive = state.localQueueActive;
      const originalRefreshPlayerState = refreshPlayerState;
      const fullscreenStabilityLines = Array.from({ length: 48 }, (_, index) => ({
        time: index * 6,
        text: index === 11
          ? '\u8f6c\u8eab\u770b\u89c1\u4f60\u707f\u70c2\u7684\u7b11\u5bb9'
          : 'Fullscreen lyric line ' + String(index + 1).padStart(2, '0')
      }));
      refreshPlayerState = async () => {};
      state.currentSong = {
        id: 'qa-fullscreen-lyric-stability',
        title: 'Fullscreen lyric stability',
        artist: 'QA',
        provider: 'local',
        source: 'local',
        localUrl: 'blob:qa-fullscreen-lyric-stability',
        duration: 288
      };
      state.localQueueActive = true;
      state.lyricSignature = 'qa-fullscreen-lyric-stability';
      state.lyricLines = fullscreenStabilityLines;
      state.playerClock = {
        position: fullscreenStabilityLines[11].time,
        duration: 288,
        updatedAt: performance.now(),
        playing: true
      };
      state.lyricIndex = 11;
      updateQishuiPlaybackLyrics(
        fullscreenStabilityLines[11].text,
        fullscreenStabilityLines[12].text,
        fullscreenStabilityLines[11].time,
        { playbackRunning: true }
      );
      requestOrbFrame();
      for (let frame = 0; frame < 120 && lyricPage.dataset.arrivedIndex !== '11'; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      const fullscreenArrivalSamples = [];
      for (let frame = 0; frame < 30; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(() => {
          const highlighted = lyricPage.querySelector(
            '.qishui-playback-lyric-line.is-current.is-scroll-arrived'
          );
          fullscreenArrivalSamples.push({
            activeIndex: lyricPage.dataset.activeIndex || '',
            arrivedIndex: lyricPage.dataset.arrivedIndex || '',
            highlightedIndex: highlighted?.dataset.bookLyricIndex || '',
            scrollTop: lyricPage.scrollTop
          });
          resolve();
        }));
      }
      const arrivalStable = fullscreenArrivalSamples.every((sample) => (
        sample.activeIndex === '11'
        && sample.arrivedIndex === '11'
        && sample.highlightedIndex === '11'
      ));
      state.playerClock = previousPlayerClock;
      state.lyricLines = previousLyricLines;
      state.lyricIndex = previousLyricIndex;
      state.currentSong = previousCurrentSong;
      state.lyricSignature = previousLyricSignature;
      state.localQueueActive = previousLocalQueueActive;
      refreshPlayerState = originalRefreshPlayerState;
      updateQishuiPlaybackLyrics(state.lyricDisplayText, state.lyricSubtitleText);
      state.appWindowFullscreen = false;
      syncWindowFullscreenState();
      setQishuiPlaybackExpanded(false);
      card.style.transition = previousTransition;
      return {
        cardWidth: cardRect.width,
        cardHeight: cardRect.height,
        coverHeight: coverRect.height,
        lyricsWidth: lyricsRect.width,
        lyricsHeight: lyricsRect.height,
        visibleLyricLineCount,
        centerOffset,
        currentFontSize,
        fullBookList,
        arrivalStable,
        fullscreenArrivalSamples,
        pass: cardRect.width >= 350
          && cardRect.width <= 372
          && cardRect.height >= innerHeight - 160
          && coverRect.width >= 278
          && coverRect.width <= 300
          && lyricsRect.width >= 320
          && lyricsRect.height >= 300
          && visibleLyricLineCount >= 5
          && centerOffset <= 20
          && currentFontSize >= 18
          && fullBookList
          && arrivalStable
      };
    })()`,
  });
  evaluation.result.value.playbackFullscreenLyrics = fullscreenLyricEvaluation.result.value;
  evaluation.result.value.playbackFullscreenLyricsPass = fullscreenLyricEvaluation.result.value.pass === true;
  evaluation.result.value.ok = evaluation.result.value.ok
    && evaluation.result.value.playbackFullscreenLyricsPass;
  await command("Runtime.evaluate", {
    expression: `(() => {
      state.lyricLines = [
        { time: 0, text: '\u591c\u8272\u843d\u5728\u6d77\u9762' },
        { time: 4, text: '\u98ce\u4ece\u57ce\u5e02\u8fb9\u7f18\u5439\u6765' },
        { time: 8, text: '\u8fdc\u65b9\u661f\u5149\u5212\u8fc7\u5929\u9645' },
        { time: 12, text: '\u8bb0\u5fc6\u968f\u65cb\u5f8b\u6162\u6162\u9192\u6765' },
        { time: 16, text: '\u6211\u4eec\u6cbf\u7740\u5149\u7684\u65b9\u5411' },
        { time: 20, text: '\u628a\u6bcf\u4e00\u4e2a\u77ac\u95f4\u5199\u6210\u6b4c' },
        { time: 24, text: '\u6b64\u523b\u8ba9\u97f3\u4e50\u586b\u6ee1\u6574\u4e2a\u5c4f\u5e55' },
        { time: 28, text: '\u6bcf\u4e00\u53e5\u6b4c\u8bcd\u90fd\u6709\u81ea\u5df1\u7684\u4f4d\u7f6e' },
        { time: 32, text: '\u4e0b\u4e00\u884c\u968f\u8282\u62cd\u8f7b\u8f7b\u5411\u4e0a' },
        { time: 36, text: '\u5f53\u524d\u6b4c\u8bcd\u59cb\u7ec8\u6e05\u6670\u9ad8\u4eae' },
        { time: 40, text: '\u524d\u540e\u6587\u4e5f\u4fdd\u6301\u5b8c\u6574\u53ef\u89c1' },
        { time: 44, text: '\u7ffb\u8fc7\u8fd9\u4e00\u9875\u7ee7\u7eed\u5411\u524d' },
        { time: 48, text: '\u76f4\u5230\u6700\u540e\u4e00\u4e2a\u97f3\u7b26' }
      ];
      state.playerClock = {
        ...state.playerClock,
        playing: false,
        position: 24,
        duration: 52,
        updatedAt: performance.now()
      };
      state.lyricIndex = 6;
      state.appWindowFullscreen = true;
      syncWindowFullscreenState();
      setQishuiPlaybackExpanded(false);
      updateQishuiPlaybackLyrics(state.lyricLines[6].text, state.lyricLines[7].text, 24);
    })()`,
  });
  await delay(280);
  const playbackFullscreenScreenshot = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(
    playbackFullscreenScreenshotPath,
    Buffer.from(playbackFullscreenScreenshot.data, "base64")
  );
  evaluation.result.value.playbackFullscreenScreenshotPath = playbackFullscreenScreenshotPath;
  await command("Runtime.evaluate", {
    expression: `(() => {
      state.appWindowFullscreen = false;
      syncWindowFullscreenState();
      setQishuiPlaybackExpanded(false);
    })()`,
  });
  await command("Emulation.setDeviceMetricsOverride", {
    width: 800,
    height: 360,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(280);
  const landscapeEvaluation = await command("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const card = document.querySelector('#qishuiPlaybackCard');
      const phone = document.querySelector('#qishuiPlaybackPhone');
      const cover = document.querySelector('#qishuiPlaybackCoverFrame');
      const tools = Array.from(document.querySelectorAll('#qishuiPlaybackTools button'));
      const cardRect = card.getBoundingClientRect();
      const phoneRect = phone.getBoundingClientRect();
      const coverRect = cover.getBoundingClientRect();
      const toolRects = tools.map((button) => {
        const rect = button.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      const usable = cardRect.width >= 300
        && cardRect.height >= 190
        && cardRect.left >= 0
        && cardRect.right <= innerWidth
        && phoneRect.height <= cardRect.height + 12
        && coverRect.width >= 80
        && tools.length === 5
        && toolRects.every((rect) => rect.width >= 42 && rect.height >= 22);
      return {
        usable,
        viewport: [innerWidth, innerHeight],
        card: {
          left: cardRect.left,
          right: cardRect.right,
          width: cardRect.width,
          height: cardRect.height
        },
        phoneHeight: phoneRect.height,
        coverWidth: coverRect.width,
        tools: toolRects
      };
    })()`,
  });
  evaluation.result.value.playbackLandscapeLayout = landscapeEvaluation.result.value;
  evaluation.result.value.playbackLandscapeUsable = landscapeEvaluation.result.value.usable === true;
  const playbackLandscapeScreenshot = await command("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(playbackLandscapeScreenshotPath, Buffer.from(playbackLandscapeScreenshot.data, "base64"));
  evaluation.result.value.playbackLandscapeScreenshotPath = playbackLandscapeScreenshotPath;
  await command("Emulation.setDeviceMetricsOverride", {
    width: 640,
    height: 320,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(220);
  const smallWindowEvaluation = await command("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const card = document.querySelector('#qishuiPlaybackCard');
      const phone = document.querySelector('#qishuiPlaybackPhone');
      const lyrics = document.querySelector('#qishuiPlaybackLyrics');
      const currentLyric = lyrics?.querySelector('.is-current');
      const tools = document.querySelector('#qishuiPlaybackTools');
      const transport = document.querySelector('#qishuiPlaybackCard .qishui-playback-controls');
      const progress = document.querySelector('#qishuiPlaybackCard .qishui-playback-progress');
      const cover = document.querySelector('#qishuiPlaybackCoverFrame');
      const cardRect = card.getBoundingClientRect();
      const phoneRect = phone.getBoundingClientRect();
      const lyricsRect = lyrics.getBoundingClientRect();
      const coverRect = cover.getBoundingClientRect();
      const currentLyricRect = currentLyric?.getBoundingClientRect();
      const requiredRects = [tools, transport, progress].map((element) =>
        element?.getBoundingClientRect()
      );
      const insideViewport = cardRect.left >= 0
        && cardRect.top >= 0
        && cardRect.right <= innerWidth
        && cardRect.bottom <= innerHeight;
      const requiredControlsVisible = requiredRects.every((rect) =>
        rect
        && rect.width > 0
        && rect.height > 0
        && rect.left >= cardRect.left - 1
        && rect.right <= cardRect.right + 1
        && rect.top >= cardRect.top - 1
        && rect.bottom <= cardRect.bottom + 1
      );
      const currentLyricVisible = currentLyricRect
        && currentLyricRect.width > 0
        && currentLyricRect.height > 0
        && currentLyricRect.top >= lyricsRect.top - 1
        && currentLyricRect.bottom <= lyricsRect.bottom + 1;
      const noInternalClipping = phone.scrollWidth <= phone.clientWidth + 2
        && phone.scrollHeight <= phone.clientHeight + 2;
      return {
        viewport: [innerWidth, innerHeight],
        card: {
          left: cardRect.left,
          top: cardRect.top,
          right: cardRect.right,
          bottom: cardRect.bottom,
          width: cardRect.width,
          height: cardRect.height
        },
        phone: {
          clientWidth: phone.clientWidth,
          clientHeight: phone.clientHeight,
          scrollWidth: phone.scrollWidth,
          scrollHeight: phone.scrollHeight
        },
        lyricsHeight: lyricsRect.height,
        cover: {
          width: coverRect.width,
          height: coverRect.height
        },
        requiredControls: requiredRects.map((rect) => rect
          ? {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height
            }
          : null),
        insideViewport,
        requiredControlsVisible,
        currentLyricVisible,
        noInternalClipping,
        pass: cardRect.width >= 300
          && coverRect.width >= 108
          && insideViewport
          && requiredControlsVisible
          && currentLyricVisible
          && noInternalClipping
      };
    })()`,
  });
  evaluation.result.value.playbackSmallWindowLayout = smallWindowEvaluation.result.value;
  evaluation.result.value.playbackSmallWindowLayoutPass = smallWindowEvaluation.result.value.pass === true;
  evaluation.result.value.ok = evaluation.result.value.ok
    && evaluation.result.value.playbackSmallWindowLayoutPass;
  await command("Emulation.setDeviceMetricsOverride", {
    width: 740,
    height: 360,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await command("Runtime.evaluate", {
    expression: `openPlaybackDiyPanel('preset')`,
  });
  await delay(280);
  const mobilePanelEvaluation = await command("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => {
      const phone = document.querySelector('#qishuiPlaybackPhone');
      const panel = document.querySelector('#diySidebar');
      const panelStyle = getComputedStyle(panel);
      return phone.inert === true
        && getComputedStyle(phone).pointerEvents === 'none'
        && panelStyle.visibility === 'visible'
        && Number.parseFloat(panelStyle.opacity) > 0.9;
    })()`,
  });
  evaluation.result.value.playbackMobilePanelInert = mobilePanelEvaluation.result.value === true;
  evaluation.result.value.ok = evaluation.result.value.ok
    && evaluation.result.value.playbackLandscapeUsable
    && evaluation.result.value.playbackMobilePanelInert;
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await command("Runtime.evaluate", {
    expression: `(() => {
      if (state.diyOpen) setDiyOpen(false);
      setPlaybackPlaylistPickerOpen(false);
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
  if (profile.startsWith(tempRoot) && existsSync(profile)) {
    rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 6,
      retryDelay: 200,
    });
  }
}
