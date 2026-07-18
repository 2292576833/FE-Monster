import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const baseUrl = String(process.env.FE_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const debugPort = 15000 + (process.pid % 14000);
const profile = path.resolve(tmpdir(), `fe-monster-storm-preset-${process.pid}`);
const gpuRequested = process.env.FE_TEST_GPU === '1';
const browser = spawn(edge, [
  "--headless=new",
  ...(gpuRequested ? ["--enable-webgl", "--ignore-gpu-blocklist"] : ["--disable-gpu"]),
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();
const consoleMessages = [];
const exceptions = [];
const networkFailures = [];
const modelResponses = [];
const networkRequests = new Map();
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function retryJson(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
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

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  return result.result.value;
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
    if (message.method === "Runtime.consoleAPICalled") {
      consoleMessages.push({
        type: message.params.type,
        text: message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' '),
      });
    } else if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Unknown exception');
    } else if (message.method === "Network.requestWillBeSent") {
      networkRequests.set(message.params.requestId, {
        url: message.params.request.url,
        method: message.params.request.method,
      });
    } else if (message.method === "Network.loadingFailed") {
      const request = networkRequests.get(message.params.requestId) || {};
      networkFailures.push({
        requestId: message.params.requestId,
        url: request.url || '',
        method: request.method || '',
        errorText: message.params.errorText,
        canceled: message.params.canceled || false,
      });
    } else if (message.method === "Network.responseReceived" && /storm-ocean-horizon|pirate-ship-storm|GLTFLoader/.test(message.params.response.url)) {
      modelResponses.push({
        url: message.params.response.url,
        method: networkRequests.get(message.params.requestId)?.method || '',
        status: message.params.response.status,
        type: message.params.response.mimeType,
      });
    }
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await command("Page.enable");
  await command("Runtime.enable");
  await command("Network.enable");
  await command("Page.navigate", { url: `${baseUrl}/?qa=storm-preset-presence` });
  await delay(1800);

  const result = await evaluate(`(async () => {
    const presetId = 'preset-storm-ocean-horizon';
    returnHomePage();
    document.querySelector('#diyButton')?.click();
    document.querySelector('#diyPresetButton')?.click();
    await refreshSandboxPresets({ silent: true });
    renderDiySandboxPresets();
    await new Promise((resolve) => setTimeout(resolve, 250));

    const apiPayload = await fetch('/api/sandbox/presets').then((response) => response.json());
    const apiPresets = Array.isArray(apiPayload?.presets) ? apiPayload.presets : [];
    const statePreset = state.sandbox.presets.find((preset) => preset?.id === presetId);
    const card = document.querySelector('[data-diy-featured-preset="' + presetId + '"]');
    const sceneList = document.querySelector('#diyScenePresetList');
    const page = document.querySelector('#diyPresetPage');
    const rect = card?.getBoundingClientRect();
    const style = card ? getComputedStyle(card) : null;
    const cardVisible = Boolean(
      card
      && sceneList?.contains(card)
      && rect?.width > 0
      && rect?.height > 0
      && style?.display !== 'none'
      && style?.visibility !== 'hidden'
    );
    const assetUrls = statePreset?.sceneItems?.map((item) => item.component?.asset?.modelUrl).filter(Boolean) || [];
    const previewUrl = statePreset?.sceneItems?.[0]?.component?.asset?.previewUrl || '';
    const assetUrlPolicy = {
      bundledModel: sandboxAssetUrl(assetUrls[0] || ''),
      stormTexture: sandboxAssetUrl('/assets/storm-ocean/water-normal-spectral-4k.png'),
      externalRejected: sandboxAssetUrl('https://example.com/model.glb') === '',
      traversalRejected: sandboxAssetUrl('/bundled-assets/../app.js') === '',
    };
    const probeAsset = async (url) => {
      if (!url) return { url: '', ok: false, status: 0, type: '', length: 0 };
      const response = await fetch(url, { method: 'HEAD' });
      return {
        url,
        ok: response.ok,
        status: response.status,
        type: response.headers.get('content-type') || '',
        length: Number(response.headers.get('content-length')) || 0,
      };
    };
    const [previewAsset, ...modelAssets] = await Promise.all([
      probeAsset(previewUrl),
      ...assetUrls.map(probeAsset),
    ]);
    card?.click();
    const loadStartedAt = performance.now();
    while (
      !state.sandbox.playbackAssetReady
      && !state.sandbox.playbackAssetFailed
      && performance.now() - loadStartedAt < 12000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const playbackWaitMs = Math.round(performance.now() - loadStartedAt);
    const upscaler = window.feMonsterPresetUpscaler;
    upscaler?.setVersion?.('1', { persist: false, announce: false });
    upscaler?.setMode?.('quality', { persist: false, announce: false });
    upscaler?.setEnabled?.(true, { persist: false, announce: false });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const presetFsr = upscaler?.snapshot?.() || null;
    const presetFsrDiagnostics = state.sandbox.renderQuality?.getDiagnostics?.() || null;
    return {
      gpuRequested: ${gpuRequested},
      apiPresetCount: apiPresets.length,
      apiHasStorm: apiPresets.some((preset) => preset?.id === presetId),
      statePresetCount: state.sandbox.presets.length,
      stateHasStorm: Boolean(statePreset),
      stateStormSource: statePreset?.source || '',
      pageVisible: Boolean(page && !page.hidden),
      sceneCardCount: sceneList?.children.length || 0,
      cardVisible,
      cardSize: [Math.round(rect?.width || 0), Math.round(rect?.height || 0)],
      previewAsset,
      modelAssets,
      assetUrlPolicy,
      playbackEntered: state.sandbox.playbackPresetId === presetId,
      playbackSceneVisible: !els.sandboxPlaybackScene.hidden,
      playbackAssetReady: state.sandbox.playbackAssetReady,
      playbackAssetFailed: state.sandbox.playbackAssetFailed,
      playbackWaitMs,
      playbackCanvasCount: els.sandboxPlaybackScene.querySelectorAll('canvas').length,
      fallbackVisible: !els.sandboxPlaybackFallback.hidden,
      hasThree: Boolean(window.THREE),
      hasGltfLoader: typeof window.THREE?.GLTFLoader === 'function',
      loaderScriptCount: document.querySelectorAll('script[data-sandbox-gltf-loader]').length,
      loaderScriptSrc: document.querySelector('script[data-sandbox-gltf-loader]')?.src || '',
      stageStatus: els.sandboxStageStatus?.textContent || '',
      playbackStatus: els.sandboxPlaybackStatus?.textContent || '',
      presetFsr,
      presetFsrDiagnostics,
    };
  })()`);

  result.consoleMessages = consoleMessages.filter((entry) => entry.type === 'error' || entry.type === 'warning').slice(-20);
  result.exceptions = exceptions.slice(-20);
  result.networkFailures = networkFailures
    .filter((entry) => !(entry.method === 'HEAD' && entry.canceled))
    .slice(-20);
  result.modelGets = modelResponses.filter((entry) => entry.method === 'GET').slice(-20);
  const fsrPathValid = result.presetFsrDiagnostics?.softwareRenderer === true
    ? result.presetFsrDiagnostics?.enabled === false && result.presetFsrDiagnostics?.mode === 'native'
    : result.presetFsrDiagnostics?.enabled === true
      && result.presetFsrDiagnostics?.family === 'fsr1-compatible-webgl'
      && result.presetFsrDiagnostics?.mode === 'quality'
      && result.presetFsrDiagnostics?.internalWidth < result.presetFsrDiagnostics?.outputWidth
      && result.presetFsrDiagnostics?.internalHeight < result.presetFsrDiagnostics?.outputHeight;
  result.ok = result.stateHasStorm
    && result.pageVisible
    && result.cardVisible
    && result.previewAsset?.ok
    && result.previewAsset?.type === 'image/png'
    && result.modelAssets?.length === 2
    && result.modelAssets.every((asset) => asset.ok && asset.length > 0)
    && result.playbackEntered
    && result.playbackSceneVisible
    && result.playbackAssetReady
    && !result.playbackAssetFailed
    && result.playbackCanvasCount > 0
    && result.presetFsr?.enabled === true
    && result.presetFsr?.activeScene === true
    && result.presetFsr?.effectiveVersion === '1'
    && fsrPathValid
    && result.assetUrlPolicy?.bundledModel.startsWith('/bundled-assets/')
    && result.assetUrlPolicy?.stormTexture.startsWith('/assets/storm-ocean/')
    && result.assetUrlPolicy?.externalRejected
    && result.assetUrlPolicy?.traversalRejected
    && result.modelGets.filter((entry) => /\.glb(?:$|\?)/.test(entry.url)).length === 2
    && result.exceptions.length === 0;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  spawnSync("taskkill.exe", ["/PID", String(browser.pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
  await delay(500);
  const tempRoot = path.resolve(tmpdir()) + path.sep;
  if (profile.startsWith(tempRoot) && existsSync(profile)) rmSync(profile, { recursive: true, force: true });
}
