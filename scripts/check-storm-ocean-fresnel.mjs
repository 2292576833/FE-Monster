import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const debugPort = 12000 + (process.pid % 18000);
const viewportWidth = Math.max(960, Number.parseInt(process.argv[2] || "1600", 10) || 1600);
const viewportHeight = Math.max(540, Number.parseInt(process.argv[3] || "900", 10) || 900);
const baseUrl = String(process.env.FE_TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const profile = path.resolve(tmpdir(), `fe-monster-fresnel-check-${process.pid}`);
const artifactDir = path.resolve("artifacts");
const screenshotPath = path.join(artifactDir, `storm-ocean-fresnel-audit-${viewportWidth}x${viewportHeight}.png`);
const thunderstormScreenshotPath = path.join(artifactDir, `storm-ocean-thunderstorm-audit-${viewportWidth}x${viewportHeight}.png`);
const seagullScreenshotPath = path.join(artifactDir, `storm-ocean-sunset-seagulls-audit-${viewportWidth}x${viewportHeight}.png`);
const stormRuntimeSource = readFileSync(path.resolve("web", "storm-ocean-runtime.js"), "utf8");
const surfaceDetailV9SourcePass = [
  "stormSurfaceDetailV9",
  "stormFarFieldFade",
  "stormFoamFiligreeV2",
  "stormCloudWindShearV2",
  "stormCloudReliefV2",
  "stormSkyBandLimitedSine",
  "stormUnresolvedMicroVariance",
  "fwidth(stormFoamPoreField)",
  "roughnessMap.offset.copy(runtime.waterTextures.normalMap.offset)",
  "stormReflectedSkyFbmV3",
  "stormDirectSpecularV3",
  "stormSecondaryNormalV3",
  "stormNormalDerivativeVarianceV3",
  "uStormSceneColor",
  "StormOcean_UnderwaterRadianceBackdrop",
  "captureRefraction",
].every((marker) => stormRuntimeSource.includes(marker));
const browser = spawn(edge, [
  "--headless=new",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();
const browserErrors = [];
const networkErrors = [];

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

function screenshotBuffer(result) {
  return Buffer.from(result.data, "base64");
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
    if (message.method === "Runtime.exceptionThrown") {
      browserErrors.push(message.params?.exceptionDetails?.text || "runtime exception");
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      browserErrors.push((message.params.args || []).map((item) => item.value || item.description || "").join(" "));
    }
    if (message.method === "Network.loadingFailed") {
      networkErrors.push({
        errorText: message.params?.errorText || "",
        canceled: message.params?.canceled === true,
        blockedReason: message.params?.blockedReason || "",
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
  await command("Emulation.setDeviceMetricsOverride", {
    width: viewportWidth,
    height: viewportHeight,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await command("Page.navigate", { url: `${baseUrl}/?qa=view-ray-fresnel` });
  await delay(1800);

  const evaluation = await command("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const poll = async (read, timeout = 20000) => {
        const started = performance.now();
        while (performance.now() - started < timeout) {
          const value = read();
          if (value) return value;
          await wait(200);
        }
        return null;
      };

      const boot = document.querySelector('#bootScreen');
      const bootButton = document.querySelector('#bootLogoButton');
      if (boot && !boot.hidden && bootButton) {
        bootButton.disabled = false;
        bootButton.click();
        await wait(1100);
      }

      document.querySelector('#diyButton')?.click();
      await wait(350);
      document.querySelector('#diyPresetButton')?.click();
      const presetGroupToggle = document.querySelector('#diySandboxPresetToggle');
      const personalPresetList = document.querySelector('#diySandboxPresetList');
      const defaultPersonalPresetsCollapsed = presetGroupToggle?.getAttribute('aria-expanded') === 'false'
        && personalPresetList?.hidden === true
        && getComputedStyle(personalPresetList).display === 'none';
      const enter = await poll(() => document.querySelector('[data-diy-featured-preset="preset-storm-ocean-horizon"]'));
      const stormInDesktopScenePresets = Boolean(enter && document.querySelector('#diyScenePresetList')?.contains(enter));
      const stormAbsentFromPersonalPresets = !personalPresetList?.querySelector('[data-diy-preset-card="preset-storm-ocean-horizon"]');
      const quickLightingControls = document.querySelector('#stormPresetLightingQuickControls');
      const quickLightingControlsHiddenBeforeStorm = Boolean(
        quickLightingControls
        && quickLightingControls.hidden
        && getComputedStyle(quickLightingControls).display === 'none'
      );
      if (enter) enter.click();
      const playback = document.querySelector('#sandboxPlaybackScene');
      const resolved = enter ? await poll(() => playback?.classList.contains('is-model-ready') || playback?.classList.contains('is-model-failed'), 60000) : null;
      await wait(2500);
      document.querySelector('#diyButton')?.click();
      await wait(350);
      document.querySelector('#diyPresetButton')?.click();
      await wait(350);
      const quickLightingRect = quickLightingControls?.getBoundingClientRect();
      const diySidebarRect = document.querySelector('#diySidebar')?.getBoundingClientRect();
      const quickLightingControlsVisible = Boolean(
        quickLightingControls
        && !quickLightingControls.hidden
        && getComputedStyle(quickLightingControls).display !== 'none'
        && quickLightingRect?.width > 0
        && quickLightingRect?.height > 0
        && quickLightingRect.top >= 0
        && quickLightingRect.bottom <= innerHeight
      );
      const quickLightingBottomGap = quickLightingRect && diySidebarRect
        ? Math.round((diySidebarRect.bottom - quickLightingRect.bottom) * 100) / 100
        : -1;
      const quickLightingAnchoredAtBottom = quickLightingControlsVisible
        && quickLightingBottomGap >= 10
        && quickLightingBottomGap <= 18
        && quickLightingRect.top > diySidebarRect.top + diySidebarRect.height * 0.55;
      const quickThunderstormButton = quickLightingControls?.querySelector('[data-storm-weather-mode="thunderstorm"]');
      const quickThunderstormRect = quickThunderstormButton?.getBoundingClientRect();
      const thunderstormButtonPass = Boolean(
        quickThunderstormButton
        && quickThunderstormButton.type === 'button'
        && quickThunderstormButton.textContent.trim() === '雷暴'
        && quickThunderstormRect?.width > 0
        && quickThunderstormRect.left >= quickLightingRect.left
        && quickThunderstormRect.right <= quickLightingRect.right
      );
      const quickSunsetButton = quickLightingControls?.querySelector('[data-storm-lighting-mode="sunset"]');
      if (quickSunsetButton) quickSunsetButton.click();
      await wait(350);

      const canvas = document.querySelector('#sandboxCanvas');
      const canvasStyle = canvas ? getComputedStyle(canvas) : null;
      const fallback = document.querySelector('#sandboxPlaybackFallback');
      const fallbackStyle = fallback ? getComputedStyle(fallback) : null;
      const rect = canvas?.getBoundingClientRect();
      const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
      const rendererInfo = gl?.getExtension('WEBGL_debug_renderer_info');
      const presetPayload = await fetch('/api/sandbox/presets', { cache: 'no-store' }).then((response) => response.json());
      const componentPayload = await fetch('/api/sandbox/components', { cache: 'no-store' }).then((response) => response.json());
      const stormPreset = (presetPayload.presets || []).find((preset) => preset.id === 'preset-storm-ocean-horizon');
      const stormAsset = stormPreset?.sceneItems?.[0]?.component?.asset || {};
      const stormComponent = (componentPayload.components || []).find((component) => (
        component.id === 'blender-scene-1dec0986-a81d-4847-af22-93d1976b5f2d'
      ));
      const componentAsset = stormComponent?.asset || {};
      const shipItem = stormPreset?.sceneItems?.find((item) => item.id === 'scene-item-storm-pirate-ship');
      const shipAsset = shipItem?.component?.asset || {};
      await poll(() => window.FeSandboxDiagnostics?.component?.('blender-scene-storm-pirate-ship')?.loaded, 60000);
      await poll(() => {
        const diagnostic = window.FeSandboxDiagnostics?.component?.('blender-scene-1dec0986-a81d-4847-af22-93d1976b5f2d')?.stormOcean || {};
        return diagnostic.waterNormalImageWidth === 8192 && diagnostic.waterRoughnessImageWidth === 8192;
      }, 60000);
      const shipBefore = window.FeSandboxDiagnostics?.component?.('blender-scene-storm-pirate-ship') || {};
      const oceanRuntimeDiagnostic = window.FeSandboxDiagnostics?.component?.('blender-scene-1dec0986-a81d-4847-af22-93d1976b5f2d')?.stormOcean || {};
      await wait(420);
      const shipAfter = window.FeSandboxDiagnostics?.component?.('blender-scene-storm-pirate-ship') || {};
      const shipPoseBefore = [...(shipBefore.position || []), ...(shipBefore.rotation || [])];
      const shipPoseAfter = [...(shipAfter.position || []), ...(shipAfter.rotation || [])];
      const shipPoseDelta = shipPoseAfter.reduce((total, value, index) => (
        total + Math.abs(value - (shipPoseBefore[index] || 0))
      ), 0);
      const playbackView = stormAsset.playbackView || {};
      const reactivity = stormAsset.reactivity || {};
      const verticalFov = Number(playbackView.fov) || 42;
      const aspect = Math.max(1, (rect?.width || innerWidth) / Math.max(1, rect?.height || innerHeight));
      const horizontalFov = 2 * Math.atan(Math.tan(verticalFov * Math.PI / 360) * aspect) * 180 / Math.PI;
      const waterTextureTiles = Number(reactivity.waterTextureTiles) || 4;
      const rayTracingMode = String(reactivity.rayTracingMode || 'none');
      const rayTraceSamples = Number(reactivity.rayTraceSamples) || 0;
      const underwaterRaySteps = Number(reactivity.underwaterRaySteps) || 0;
      const rayTraceFilter = String(reactivity.rayTraceFilter || 'none');
      const waveSpectrum = String(reactivity.waveSpectrum || 'none');
      const microWaveLayers = Number(reactivity.microWaveLayers) || 0;
      const textureSpectrum = String(reactivity.textureSpectrum || 'none');
      const textureRevision = Number(reactivity.textureRevision) || 0;
      const textureDetailLayers = Number(reactivity.textureDetailLayers) || 0;
      const waterTextureResolution = Number(reactivity.waterTextureResolution) || 0;
      const surfaceShaderRevision = Number(reactivity.surfaceShaderRevision) || 0;
      const surfaceDetailModel = String(reactivity.surfaceDetailModel || 'none');
      const assetTextureDetailLayers = Number(stormAsset.textures?.detailLayers) || 0;
      const assetTextureSpectrum = String(stormAsset.textures?.spectrum || 'none');
      const assetTextureRevision = Number(stormAsset.textures?.revision) || 0;
      const assetTextureResolution = Number(stormAsset.textures?.resolution) || 0;
      const assetTextureFallbackResolution = Number(stormAsset.textures?.fallbackResolution) || 0;
      const mirroredStormMetadata = JSON.stringify(componentAsset.reactivity?.thunderstorm || {})
        === JSON.stringify(stormAsset.reactivity?.thunderstorm || {})
        && JSON.stringify(componentAsset.reactivity?.sunsetSeagulls || {})
          === JSON.stringify(stormAsset.reactivity?.sunsetSeagulls || {})
        && Number(componentAsset.reactivity?.surfaceShaderRevision) === surfaceShaderRevision
        && Number(componentAsset.reactivity?.textureDetailLayers) === textureDetailLayers
        && String(componentAsset.reactivity?.textureSpectrum) === textureSpectrum
        && Number(componentAsset.textures?.detailLayers) === assetTextureDetailLayers
        && String(componentAsset.textures?.spectrum) === assetTextureSpectrum
        && Number(componentAsset.textures?.revision) === assetTextureRevision;
      const sunsetSeagulls = reactivity.sunsetSeagulls || {};
      const lowFrequencyRangeHz = Array.isArray(reactivity.lowFrequencyRangeHz)
        ? reactivity.lowFrequencyRangeHz.map(Number)
        : [];
      const lightingModel = String(reactivity.lightingModel || 'none');
      const lightingMode = String(reactivity.lightingMode || 'none');
      const lightingCycleMinutes = Number(reactivity.lightingCycleMinutes) || 0;
      const lightingPhases = Array.isArray(reactivity.lightingPhases) ? reactivity.lightingPhases : [];
      const lightingPreview = [5, 15, 25, 35, 45, 55, 65, 75, 85].map((minute) => (
        window.FeStormOceanRuntime?.lightingAtElapsedMinute?.(minute, reactivity)?.phase || ''
      ));
      const thunderstorm = reactivity.thunderstorm || {};
      const thunderstormSchedule = thunderstorm.schedule || {};
      const thunderstormClouds = thunderstorm.clouds || {};
      const thunderstormLightning = thunderstorm.lightning || {};
      const thunderstormSampler = window.FeStormOceanRuntime?.thunderstormAtMinute;
      const scheduleMinutes = [5, 35, 65, 95, 125, 155];
      const scheduleSamples = scheduleMinutes.map((minute) => thunderstormSampler?.(minute, reactivity) || {});
      const eligibleCyclePattern = scheduleSamples.map((sample) => Boolean(sample.eligible));
      const eligibleCycleScans = Array.from({ length: 8 }, (_, index) => 2 + index * 3).map((cycleIndex) => {
        const samples = Array.from({ length: 60 }, (_, halfMinute) => (
          thunderstormSampler?.(cycleIndex * 30 + halfMinute * 0.5, reactivity) || {}
        ));
        return {
          cycleIndex,
          occurs: samples.some((sample) => sample.occurs),
          active: samples.some((sample) => sample.active)
        };
      });
      const deterministicScheduleA = thunderstormSampler?.(65, reactivity) || {};
      const deterministicScheduleB = thunderstormSampler?.(65, reactivity) || {};
      const lightningSampler = window.FeStormOceanRuntime?.lightningStrikeAtIndex;
      const lightningSamples = Array.from({ length: 12 }, (_, index) => lightningSampler?.(index, reactivity) || {});
      const lightningTargets = lightningSamples.map((sample) => sample.target || []);
      const uniqueLightningTargets = new Set(lightningTargets.map((target) => target.map((value) => Number(value).toFixed(3)).join(',')));
      const lightningX = lightningTargets.map((target) => Number(target[0]) || 0);
      const lightningZ = lightningTargets.map((target) => Number(target[1]) || 0);
      const deterministicLightning = JSON.stringify(lightningSampler?.(4, reactivity) || {})
        === JSON.stringify(lightningSampler?.(4, reactivity) || {});
      const seagullFlightSampler = window.FeStormOceanRuntime?.sunsetSeagullFlightAtSecond;
      const seagullPoseSampler = window.FeStormOceanRuntime?.sampleSunsetSeagullPose;
      const seagullSunsetSamples = Array.from({ length: 361 }, (_, index) => (
        seagullFlightSampler?.(index * 0.5, 'sunset', reactivity) || {}
      ));
      const seagullDaySamples = Array.from({ length: 61 }, (_, index) => (
        seagullFlightSampler?.(index * 3, 'day', reactivity) || {}
      ));
      const seagullEveningSamples = Array.from({ length: 61 }, (_, index) => (
        seagullFlightSampler?.(index * 3, 'evening', reactivity) || {}
      ));
      const seagullVisibleSamples = seagullSunsetSamples.filter((sample) => sample.active && Number(sample.intensity) > 0.01);
      const seagullGapSamples = seagullSunsetSamples.filter((sample) => !sample.active);
      const seagullScheduleTransitions = seagullSunsetSamples.reduce((count, sample, index, samples) => (
        index > 0 && Boolean(sample.active) !== Boolean(samples[index - 1].active) ? count + 1 : count
      ), 0);
      const seagullMaxIntensityDelta = seagullSunsetSamples.reduce((maximum, sample, index, samples) => (
        index > 0
          ? Math.max(maximum, Math.abs((Number(sample.intensity) || 0) - (Number(samples[index - 1].intensity) || 0)))
          : maximum
      ), 0);
      const deterministicSeagullSchedule = JSON.stringify(seagullFlightSampler?.(71.25, 'sunset', reactivity) || {})
        === JSON.stringify(seagullFlightSampler?.(71.25, 'sunset', reactivity) || {});
      const seagullCount = Number(sunsetSeagulls.count) || 0;
      let seagullPoseFinite = true;
      let seagullPoseMaxStep = 0;
      let seagullPoseMinStep = Number.POSITIVE_INFINITY;
      let seagullVelocityMaxTurn = 0;
      for (let birdIndex = 0; birdIndex < Math.min(10, seagullCount); birdIndex += 1) {
        let previousPose = null;
        for (let frame = 0; frame <= 360; frame += 1) {
          const pose = seagullPoseSampler?.(birdIndex, 3 + frame / 60, 24, 1, reactivity) || {};
          const values = [...(pose.position || []), ...(pose.velocity || []), pose.wingAngle, pose.bank];
          if (values.length < 8 || values.some((value) => !Number.isFinite(Number(value)))) seagullPoseFinite = false;
          if (previousPose) {
            const step = Math.hypot(...pose.position.map((value, axis) => value - previousPose.position[axis]));
            seagullPoseMaxStep = Math.max(seagullPoseMaxStep, step);
            seagullPoseMinStep = Math.min(seagullPoseMinStep, step);
            const currentLength = Math.hypot(...pose.velocity) || 1;
            const previousLength = Math.hypot(...previousPose.velocity) || 1;
            const cosine = pose.velocity.reduce((total, value, axis) => (
              total + value * previousPose.velocity[axis]
            ), 0) / (currentLength * previousLength);
            seagullVelocityMaxTurn = Math.max(seagullVelocityMaxTurn, Math.acos(Math.max(-1, Math.min(1, cosine))));
          }
          previousPose = pose;
        }
      }
      const seagullPoseSnapshot = Array.from({ length: Math.min(10, seagullCount) }, (_, birdIndex) => (
        seagullPoseSampler?.(birdIndex, 6.25, 24, 1, reactivity) || {}
      ));
      const uniqueSeagullPositions = new Set(seagullPoseSnapshot.map((pose) => (
        (pose.position || []).map((value) => Number(value).toFixed(2)).join(',')
      ))).size;
      const uniqueSeagullWingAngles = new Set(seagullPoseSnapshot.map((pose) => (
        Number(pose.wingAngle).toFixed(2)
      ))).size;
      const beforeDaySunset = window.FeStormOceanRuntime?.lightingAtMinute?.(9.24, reactivity)?.highlight || [];
      const afterDaySunset = window.FeStormOceanRuntime?.lightingAtMinute?.(9.26, reactivity)?.highlight || [];
      const lightingContinuityDelta = Math.max(0, ...beforeDaySunset.map((value, index) => Math.abs(value - afterDaySunset[index])));
      const quickLightingSelectionApplied = document.documentElement.dataset.stormLightingMode === 'sunset'
        && document.documentElement.dataset.stormLightingPhase === 'sunset';
      const omnidirectionalWaveSampler = window.FeStormOceanRuntime?.sampleOmnidirectionalBassWaveHeight;
      const bassSurgeStateSampler = window.FeStormOceanRuntime?.sampleBassSurgeState;
      const samplePoints = Array.from({ length: 19 * 15 }, (_, index) => ({
        x: -180 + (index % 19) * 20,
        z: -300 + Math.floor(index / 19) * 24
      }));
      const omnidirectionalWaveRms = (bassAmount, thunderstormIntensity = 0) => Math.sqrt(samplePoints.reduce((total, point) => {
        const height = omnidirectionalWaveSampler?.(
          point.x,
          point.z,
          18,
          bassAmount,
          reactivity,
          thunderstormIntensity
        ) || 0;
        return total + height * height;
      }, 0) / samplePoints.length);
      const surgeTimes = Array.from({ length: 16 }, (_, index) => index * 8);
      const highBassSurgeStates = surgeTimes.map((seconds) => bassSurgeStateSampler?.(seconds, 0.85) || {});
      const lowBassSurgeStates = surgeTimes.map((seconds) => bassSurgeStateSampler?.(seconds, 0.25) || {});
      const dominantBassDirections = [...new Set(highBassSurgeStates.map((state) => state.dominantDirection))];
      const averageActiveDirections = (states) => states.reduce((total, state) => total + (state.activeDirectionCount || 0), 0) / states.length;
      const lowBassActiveDirections = averageActiveDirections(lowBassSurgeStates);
      const highBassActiveDirections = averageActiveDirections(highBassSurgeStates);
      const omnidirectionalWaveLowBassRms = omnidirectionalWaveRms(0.25);
      const omnidirectionalWaveHighBassRms = omnidirectionalWaveRms(0.85);
      const thunderstormWaveHighBassRms = omnidirectionalWaveRms(0.85, 1);
      const thunderstormWaveRatio = thunderstormWaveHighBassRms / Math.max(0.001, omnidirectionalWaveHighBassRms);
      const lightingControls = document.querySelector('#stormLightingControls');
      const lightingControlResults = {};
      for (const mode of ['day', 'sunset', 'evening', 'realtime']) {
        lightingControls?.querySelector('[data-storm-lighting-mode="' + mode + '"]')?.click();
        await wait(900);
        lightingControlResults[mode] = {
          mode: document.documentElement.dataset.stormLightingMode || '',
          phase: document.documentElement.dataset.stormLightingPhase || ''
        };
      }
      const lightingControlsVisible = Boolean(lightingControls && !lightingControls.hidden && getComputedStyle(lightingControls).display !== 'none');
      const frameTiming = await new Promise((resolve) => {
        let frameCount = 0;
        const startedAt = performance.now();
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          resolve({ frameCount, elapsed: performance.now() - startedAt });
        };
        const timeout = setTimeout(finish, 1600);
        const measure = (timestamp) => {
          if (finished) return;
          frameCount += 1;
          if (timestamp - startedAt >= 1200) {
            clearTimeout(timeout);
            finish();
            return;
          }
          requestAnimationFrame(measure);
        };
        requestAnimationFrame(measure);
      });
      const frameRate = frameTiming.elapsed > 0 ? (frameTiming.frameCount - 1) * 1000 / frameTiming.elapsed : 0;
      return {
        presetFound: Boolean(enter),
        defaultPersonalPresetsCollapsed,
        stormInDesktopScenePresets,
        stormAbsentFromPersonalPresets,
        quickLightingControlsHiddenBeforeStorm,
        quickLightingControlsVisible,
        quickLightingAnchoredAtBottom,
        quickLightingBottomGap,
        quickLightingSelectionApplied,
        thunderstormButtonPass,
        libraryPlacement: stormPreset?.libraryPlacement || '',
        resolved: Boolean(resolved),
        playbackClass: playback?.className || '',
        modelReady: Boolean(playback?.classList.contains('is-model-ready')),
        modelFailed: Boolean(playback?.classList.contains('is-model-failed')),
        canvasVisible: Boolean(canvas && canvasStyle?.visibility !== 'hidden' && Number(canvasStyle?.opacity) > 0 && rect?.width > 0 && rect?.height > 0),
        canvasSize: rect ? [Math.round(rect.width), Math.round(rect.height)] : [0, 0],
        canvasOpacity: canvasStyle?.opacity || '',
        fallbackOpacity: fallbackStyle?.opacity || '',
        webgl: Boolean(gl),
        renderer: gl ? gl.getParameter(rendererInfo?.UNMASKED_RENDERER_WEBGL || gl.RENDERER) : '',
        shipConfigured: Boolean(shipItem && shipAsset.modelUrl && shipAsset.waveFollower),
        shipLoaded: shipAfter.loaded === true,
        shipFailed: shipAfter.failed === true,
        shipWaveFollower: shipAsset.waveFollower?.sampleMode || '',
        shipRuntimeBatches: Number(shipAsset.optimization?.runtimeMeshCount) || 0,
        shipBoundsSize: shipAfter.boundsSize || [],
        shipPosition: (shipAfter.position || []).map((value) => Number(value.toFixed(3))),
        shipFarPlacement: Number(shipAfter.position?.[2]) < -100,
        shipMiddleLeftPlacement: Number(shipItem?.position?.x) >= -75 && Number(shipItem?.position?.x) <= -35,
        shipSceneScale: Number(shipAsset.playbackView?.sceneScale) || 0,
        shipPoseDelta: Number(shipPoseDelta.toFixed(6)),
        shipWaveMotion: shipAfter.waveFollowerActive === true && shipPoseDelta > 0.00001,
        oceanRuntimeDiagnostic,
        oceanMaterialShaderPass: oceanRuntimeDiagnostic.materialCount > 0
          && oceanRuntimeDiagnostic.compiledMaterialCount === oceanRuntimeDiagnostic.materialCount
          && oceanRuntimeDiagnostic.radianceShoulderCompiled === true
          && oceanRuntimeDiagnostic.sceneColorRefractionReady === true
          && Number(oceanRuntimeDiagnostic.sceneColorRefractionTarget?.[0]) > 0
          && Number(oceanRuntimeDiagnostic.sceneColorRefractionTarget?.[1]) > 0
          && oceanRuntimeDiagnostic.surfaceDetailCompiled === true
          && oceanRuntimeDiagnostic.clearWaterOpticsCompiled === true
          && oceanRuntimeDiagnostic.skyReflectionCoupledCompiled === true
          && oceanRuntimeDiagnostic.normalDerivativeAaCompiled === true,
        verticalFov,
        horizontalFov: Number(horizontalFov.toFixed(2)),
        waterTextureTiles,
        rayTracingMode,
        rayTraceSamples,
        underwaterRaySteps,
        rayTraceFilter,
        waveSpectrum,
        microWaveLayers,
        textureSpectrum,
        textureRevision,
        textureDetailLayers,
        waterTextureResolution,
        surfaceShaderRevision,
        surfaceDetailModel,
        assetTextureDetailLayers,
        assetTextureSpectrum,
        assetTextureRevision,
        assetTextureResolution,
        assetTextureFallbackResolution,
        mirroredStormMetadata,
        sunsetSeagulls,
        lowFrequencyRangeHz,
        lightingModel,
        lightingMode,
        lightingCycleMinutes,
        lightingPhases,
        lightingPreview,
        lightingContinuityDelta: Number(lightingContinuityDelta.toFixed(5)),
        eligibleCyclePattern,
        eligibleCycleScans,
        thunderstormMetadataPass: Number(thunderstorm.revision) >= 1
          && thunderstorm.enabled === true
          && thunderstorm.manualControl === true
          && thunderstormSchedule.mode === 'seeded-every-third-cycle'
          && thunderstormSchedule.appliesToLightingMode === 'realtime'
          && Number(thunderstormSchedule.cycleMinutes) === 30
          && Number(thunderstormSchedule.eligibleCycleModulo) === 3
          && Number(thunderstormSchedule.eligibleCycleRemainder) === 2
          && Number(thunderstormSchedule.chance) > 0
          && Number(thunderstormSchedule.chance) < 1
          && thunderstormClouds.convergence === 'omnidirectional'
          && Number(thunderstormClouds.convergenceDirections) >= 4
          && Number(thunderstormClouds.coverage) >= 0.9
          && thunderstormLightning.mode === 'seeded-random-cloud-to-ocean'
          && thunderstormLightning.internalGlowColor === '#9B7CFF'
          && Number(thunderstorm.bassWaveGain) >= 1.5,
        thunderstormSchedulePass: eligibleCyclePattern.join(',') === 'false,false,true,false,false,true'
          && JSON.stringify(deterministicScheduleA) === JSON.stringify(deterministicScheduleB)
          && scheduleSamples[0]?.active === false
          && scheduleSamples[1]?.active === false
          && eligibleCycleScans.some((sample) => sample.occurs && sample.active),
        thunderstormLightningSamplingPass: uniqueLightningTargets.size >= 8
          && Math.max(...lightningX) - Math.min(...lightningX) >= 120
          && Math.max(...lightningZ) - Math.min(...lightningZ) >= 100
          && lightningTargets.every((target) => target.length === 2 && target[1] >= -300 && target[1] <= -60)
          && deterministicLightning,
        lightingControlsVisible,
        lightingControlResults,
        lightingControlsPass: lightingControlResults.day?.mode === 'day'
          && lightingControlResults.day?.phase === 'day'
          && lightingControlResults.sunset?.mode === 'sunset'
          && lightingControlResults.sunset?.phase === 'sunset'
          && lightingControlResults.evening?.mode === 'evening'
          && lightingControlResults.evening?.phase === 'evening'
          && lightingControlResults.realtime?.mode === 'realtime',
        omnidirectionalBassWaves: reactivity.bassWaveDirection === 'omnidirectional-random'
          && Number(reactivity.bassWavePackets) >= 6
          && reactivity.bassDirectionCrossfade === true
          && Number(reactivity.bassDirectionChangeSeconds) <= 16,
        lowFrequencyDrivenWaves: reactivity.waveDriver === 'low-frequency-envelope'
          && reactivity.bassWaveDrive === 'low-frequency-envelope-random-360-surge'
          && reactivity.lowFrequencyAmplitudeResponse === 'smoothed-rms-envelope'
          && lowFrequencyRangeHz[0] === 20
          && lowFrequencyRangeHz[1] === 150,
        dominantBassDirections,
        lowBassActiveDirections: Number(lowBassActiveDirections.toFixed(2)),
        highBassActiveDirections: Number(highBassActiveDirections.toFixed(2)),
        omnidirectionalWaveLowBassRms: Number(omnidirectionalWaveLowBassRms.toFixed(4)),
        omnidirectionalWaveHighBassRms: Number(omnidirectionalWaveHighBassRms.toFixed(4)),
        thunderstormWaveHighBassRms: Number(thunderstormWaveHighBassRms.toFixed(4)),
        thunderstormWaveRatio: Number(thunderstormWaveRatio.toFixed(3)),
        omnidirectionalDirectionPass: dominantBassDirections.length >= 4
          && highBassActiveDirections > lowBassActiveDirections,
        omnidirectionalAmplitudePass: omnidirectionalWaveHighBassRms > omnidirectionalWaveLowBassRms * 2.4,
        thunderstormWavePass: thunderstormWaveRatio >= 1.48 && thunderstormWaveRatio <= 1.62,
        translucentWater: Number(reactivity.waterTransmission) >= 0.72
          && reactivity.waterColorModel === 'screen-space-scene-refraction-beer-lambert-v5'
          && Number(reactivity.fogDensity) <= 0.0013,
        activeLightingPhase: document.documentElement.dataset.stormLightingPhase || '',
        frameRate: Number(frameRate.toFixed(1)),
        documentVisibility: document.visibilityState,
        wideFraming: verticalFov >= 54 && horizontalFov >= 84,
        actual8KWater: waterTextureResolution === 8192
          && assetTextureResolution === 8192
          && assetTextureFallbackResolution === 4096
          && oceanRuntimeDiagnostic.waterTextureRequestedResolution === 8192
          && oceanRuntimeDiagnostic.waterTextureResolution === 8192
          && oceanRuntimeDiagnostic.waterTextureUsingFallback === false
          && oceanRuntimeDiagnostic.waterNormalImageWidth === 8192
          && oceanRuntimeDiagnostic.waterRoughnessImageWidth === 8192,
        detailedWater: waterTextureTiles >= 6
          && waveSpectrum === 'directional-domain-warped'
          && microWaveLayers >= 18
          && /^wind-coherent-capillary-v(?:8|9)$/.test(textureSpectrum)
          && textureRevision >= 11
          && textureDetailLayers >= 30
          && surfaceShaderRevision >= 28
          && surfaceDetailModel === 'multiscale-cross-ripple-capillary-lace-v8'
          && assetTextureDetailLayers >= 30
          && /^wind-coherent-capillary-v(?:8|9)$/.test(assetTextureSpectrum)
          && assetTextureRevision >= 11
          && reactivity.microfacetAntiAlias === true
          && reactivity.microBreakupDetail === true
          && reactivity.foamMicrostructure === 'filament-bubble'
          && reactivity.radianceShoulder === 'scalar-luminance-energy-conserving-v2'
          && reactivity.waterColorModel === 'screen-space-scene-refraction-beer-lambert-v5'
          && Number(reactivity.textureNormalScale) <= 0.72
          && Number(reactivity.waterMicroNormal) <= 0.019
          && reactivity.crestThicknessVariation === true
          && reactivity.textureSeamless === true
          && reactivity.crestCurvatureFoam === true
          && reactivity.crestTransmission === true,
        waterV8ShaderPass: oceanRuntimeDiagnostic.surfaceDetailV8Compiled === true,
        seagullMetadataPass: Number(sunsetSeagulls.revision) >= 1
          && sunsetSeagulls.enabled === true
          && sunsetSeagulls.phase === 'sunset'
          && sunsetSeagulls.renderer === 'six-batch-instanced-3d'
          && seagullCount >= 8
          && seagullCount <= 12
          && sunsetSeagulls.motionModel === 'asynchronous-flap-glide-bank-v1'
          && sunsetSeagulls.weatherAvoidance === 'hide-during-thunderstorm',
        seagullSchedulePass: deterministicSeagullSchedule
          && seagullVisibleSamples.length > 0
          && seagullGapSamples.length > 0
          && seagullScheduleTransitions >= 3
          && seagullMaxIntensityDelta <= 0.5
          && seagullDaySamples.every((sample) => sample.phaseEligible === false && sample.active === false)
          && seagullEveningSamples.every((sample) => sample.phaseEligible === false && sample.active === false),
        seagullMotionPass: seagullPoseFinite
          && seagullPoseMaxStep > 0.001
          && seagullPoseMaxStep < 0.4
          && seagullPoseMinStep > 0.0001
          && seagullVelocityMaxTurn < 0.12
          && uniqueSeagullPositions === Math.min(10, seagullCount)
          && uniqueSeagullWingAngles >= 4,
        seagullScheduleTransitions,
        seagullMaxIntensityDelta: Number(seagullMaxIntensityDelta.toFixed(4)),
        seagullPoseMaxStep: Number(seagullPoseMaxStep.toFixed(4)),
        seagullPoseMinStep: Number(seagullPoseMinStep.toFixed(4)),
        seagullVelocityMaxTurn: Number(seagullVelocityMaxTurn.toFixed(5)),
        uniqueSeagullPositions,
        uniqueSeagullWingAngles,
        hybridRayTracing: rayTracingMode === 'hybrid-analytic'
          && rayTraceSamples >= 9
          && underwaterRaySteps >= 7
          && rayTraceFilter === 'roughness-cone-9tap-stable'
          && reactivity.reflectionTemporalStability === 'spatial-continuous'
          && lightingModel === 'ggx-fresnel-atmospheric-v4-rough-water'
          && reactivity.specularLobeModel === 'rough-water-sky-tinted',
        thirtyMinuteLighting: lightingMode === 'playback-elapsed'
          && lightingCycleMinutes === 30
          && lightingPhases.join(',') === 'day,sunset,evening'
          && reactivity.lightingLoop === true
          && reactivity.lightingCyclePolicy === 'repeat-day-sunset-evening'
          && lightingPreview.join(',') === 'day,sunset,evening,day,sunset,evening,day,sunset,evening'
          && lightingContinuityDelta < 0.02,
        thunderstormShaderPass: oceanRuntimeDiagnostic.thunderstormSkyCompiled === true
          && oceanRuntimeDiagnostic.thunderstormWaterCompiled === true
          && oceanRuntimeDiagnostic.lightningEnabled === true,
        performancePass: frameRate >= 24,
        status: document.querySelector('#sandboxPlaybackStatus')?.textContent?.trim() || '',
      };
    })()`,
  });
  if (evaluation.exceptionDetails) {
    throw new Error(evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text || "Playback evaluation failed");
  }
  if (!evaluation.result?.value || Object.keys(evaluation.result.value).length === 0) {
    throw new Error("Playback evaluation did not return a result");
  }

  const dayScreenshotEvaluation = await command("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const dayButton = document.querySelector('#stormLightingControls [data-storm-lighting-mode="day"]');
      dayButton?.click();
      const diyButton = document.querySelector('#diyButton');
      if (diyButton?.getAttribute('aria-expanded') === 'true') diyButton.click();
      const started = performance.now();
      while (performance.now() - started < 5000) {
        const mode = document.documentElement.dataset.stormLightingMode || '';
        const phase = document.documentElement.dataset.stormLightingPhase || '';
        if (mode === 'day' && phase === 'day') {
          await wait(700);
          return { buttonPresent: Boolean(dayButton), mode, phase, diyOpen: diyButton?.getAttribute('aria-expanded') === 'true' };
        }
        await wait(100);
      }
      return {
        buttonPresent: Boolean(dayButton),
        mode: document.documentElement.dataset.stormLightingMode || '',
        phase: document.documentElement.dataset.stormLightingPhase || '',
        diyOpen: diyButton?.getAttribute('aria-expanded') === 'true'
      };
    })()`
  });
  if (dayScreenshotEvaluation.exceptionDetails || !dayScreenshotEvaluation.result?.value) {
    throw new Error(dayScreenshotEvaluation.exceptionDetails?.exception?.description || "Day screenshot setup failed");
  }
  const dayScreenshot = dayScreenshotEvaluation.result.value;
  if (!dayScreenshot.buttonPresent || dayScreenshot.mode !== "day" || dayScreenshot.phase !== "day") {
    throw new Error(`Day screenshot setup did not settle: ${JSON.stringify({
      dayScreenshot,
      playback: evaluation.result?.value,
      browserErrors,
      networkErrors,
    })}`);
  }

  const first = screenshotBuffer(await command("Page.captureScreenshot", { format: "png", fromSurface: true }));
  await delay(1100);
  const second = screenshotBuffer(await command("Page.captureScreenshot", { format: "png", fromSurface: true }));
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(screenshotPath, second);
  const materialCheckProcess = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.resolve("scripts", "check-storm-ocean-material.ps1"),
    "-ImagePath",
    screenshotPath,
  ], { encoding: "utf8", windowsHide: true });
  const materialCheckStdout = String(materialCheckProcess.stdout || "").trim();
  let materialCheckResult = null;
  try {
    materialCheckResult = materialCheckStdout ? JSON.parse(materialCheckStdout) : null;
  } catch {
    // Preserve the raw output below so an invalid audit response is diagnosable.
  }
  const materialCheck = {
    exitCode: materialCheckProcess.status,
    result: materialCheckResult,
    stdout: materialCheckResult ? undefined : materialCheckStdout,
    stderr: String(materialCheckProcess.stderr || "").trim(),
    error: materialCheckProcess.error?.message || "",
  };
  const materialCheckPass = materialCheck.exitCode === 0 && materialCheck.result?.ok === true;
  const seagullEvaluation = await command("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const componentId = 'blender-scene-1dec0986-a81d-4847-af22-93d1976b5f2d';
      document.querySelector('#stormLightingControls [data-storm-lighting-mode="sunset"]')?.click();
      await wait(1100);
      const previewEnabled = window.FeSandboxDiagnostics?.previewSunsetSeagulls?.(componentId, true) === true;
      await wait(900);
      const before = window.FeSandboxDiagnostics?.component?.(componentId)?.stormOcean || {};
      await wait(350);
      const after = window.FeSandboxDiagnostics?.component?.(componentId)?.stormOcean || {};
      const frameTiming = await new Promise((resolve) => {
        let frameCount = 0;
        const startedAt = performance.now();
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          resolve({ frameCount, elapsed: performance.now() - startedAt });
        };
        const timeout = setTimeout(finish, 1600);
        const measure = (timestamp) => {
          if (finished) return;
          frameCount += 1;
          if (timestamp - startedAt >= 1200) {
            clearTimeout(timeout);
            finish();
            return;
          }
          requestAnimationFrame(measure);
        };
        requestAnimationFrame(measure);
      });
      return {
        previewEnabled,
        lightingMode: document.documentElement.dataset.stormLightingMode || '',
        lightingPhase: document.documentElement.dataset.stormLightingPhase || '',
        before,
        after,
        poseDelta: Math.abs((Number(after.seagullPoseChecksum) || 0) - (Number(before.seagullPoseChecksum) || 0)),
        frameRate: frameTiming.elapsed > 0 ? (frameTiming.frameCount - 1) * 1000 / frameTiming.elapsed : 0
      };
    })()`
  });
  if (seagullEvaluation.exceptionDetails || !seagullEvaluation.result?.value) {
    throw new Error(seagullEvaluation.exceptionDetails?.exception?.description || 'Sunset seagull evaluation failed');
  }
  const seagullScreenshot = screenshotBuffer(await command("Page.captureScreenshot", { format: "png", fromSurface: true }));
  writeFileSync(seagullScreenshotPath, seagullScreenshot);
  const seagullHiddenEvaluation = await command("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const componentId = 'blender-scene-1dec0986-a81d-4847-af22-93d1976b5f2d';
      window.FeSandboxDiagnostics?.previewSunsetSeagulls?.(componentId, false);
      document.querySelector('#stormLightingControls [data-storm-lighting-mode="day"]')?.click();
      await wait(3300);
      const day = window.FeSandboxDiagnostics?.component?.(componentId)?.stormOcean || {};
      document.querySelector('#stormLightingControls [data-storm-lighting-mode="evening"]')?.click();
      await wait(3300);
      const evening = window.FeSandboxDiagnostics?.component?.(componentId)?.stormOcean || {};
      document.querySelector('#stormLightingControls [data-storm-lighting-mode="realtime"]')?.click();
      await wait(900);
      return { day, evening };
    })()`
  });
  if (seagullHiddenEvaluation.exceptionDetails || !seagullHiddenEvaluation.result?.value) {
    throw new Error(seagullHiddenEvaluation.exceptionDetails?.exception?.description || 'Seagull hidden-state evaluation failed');
  }
  const thunderEvaluation = await command("Runtime.evaluate", {
    awaitPromise: true,
    returnByValue: true,
    expression: `(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const button = document.querySelector('#stormLightingControls [data-storm-weather-mode="thunderstorm"]');
      button?.click();
      await wait(6500);
      const forcedStrike = window.FeSandboxDiagnostics?.triggerStormLightning?.(
        'blender-scene-1dec0986-a81d-4847-af22-93d1976b5f2d',
        11
      ) || null;
      await wait(55);
      const diagnostic = window.FeSandboxDiagnostics?.component?.(
        'blender-scene-1dec0986-a81d-4847-af22-93d1976b5f2d'
      )?.stormOcean || {};
      return {
        buttonPresent: Boolean(button),
        buttonPressed: button?.getAttribute('aria-pressed') === 'true',
        lightingMode: document.documentElement.dataset.stormLightingMode || '',
        weatherMode: document.documentElement.dataset.stormWeatherMode || '',
        thunderstormActive: document.documentElement.dataset.stormThunderstormActive || '',
        thunderstormSource: document.documentElement.dataset.stormThunderstormSource || '',
        forcedStrike,
        diagnostic
      };
    })()`
  });
  if (thunderEvaluation.exceptionDetails || !thunderEvaluation.result?.value) {
    throw new Error(thunderEvaluation.exceptionDetails?.exception?.description || 'Thunderstorm evaluation failed');
  }
  const thunderstormScreenshot = screenshotBuffer(await command("Page.captureScreenshot", { format: "png", fromSurface: true }));
  writeFileSync(thunderstormScreenshotPath, thunderstormScreenshot);
  const firstHash = createHash("sha256").update(first).digest("hex");
  const secondHash = createHash("sha256").update(second).digest("hex");
  const shaderErrors = browserErrors.filter((message) => /shader|webglprogram|compile|link/i.test(message));
  const result = {
    viewport: [viewportWidth, viewportHeight],
    surfaceDetailV9SourcePass,
    ...evaluation.result.value,
    thunderstormManual: thunderEvaluation.result.value,
    sunsetSeagullsRuntime: seagullEvaluation.result.value,
    sunsetSeagullsHidden: seagullHiddenEvaluation.result.value,
    sunsetSeagullsRuntimePass: seagullEvaluation.result.value.previewEnabled
      && seagullEvaluation.result.value.lightingMode === 'sunset'
      && seagullEvaluation.result.value.lightingPhase === 'sunset'
      && seagullEvaluation.result.value.after?.seagullGroupVisible === true
      && Number(seagullEvaluation.result.value.after?.seagullVisibleCount) >= 8
      && Number(seagullEvaluation.result.value.after?.seagullRenderBatches) <= 6
      && Number(seagullEvaluation.result.value.poseDelta) > 0.02
      && Number(seagullEvaluation.result.value.frameRate) >= 24,
    sunsetSeagullsHiddenPass: seagullHiddenEvaluation.result.value.day?.seagullPhaseEligible === false
      && seagullHiddenEvaluation.result.value.day?.seagullGroupVisible === false
      && Number(seagullHiddenEvaluation.result.value.day?.seagullVisibleCount) === 0
      && seagullHiddenEvaluation.result.value.evening?.seagullPhaseEligible === false
      && seagullHiddenEvaluation.result.value.evening?.seagullGroupVisible === false
      && Number(seagullHiddenEvaluation.result.value.evening?.seagullVisibleCount) === 0,
    thunderstormManualPass: thunderEvaluation.result.value.buttonPresent
      && thunderEvaluation.result.value.buttonPressed
      && thunderEvaluation.result.value.lightingMode === 'realtime'
      && thunderEvaluation.result.value.weatherMode === 'on'
      && thunderEvaluation.result.value.thunderstormActive === 'true'
      && thunderEvaluation.result.value.thunderstormSource === 'manual'
      && thunderEvaluation.result.value.diagnostic?.thunderstormSource === 'manual'
      && Number(thunderEvaluation.result.value.diagnostic?.thunderstormIntensity) >= 0.65
      && Number(thunderEvaluation.result.value.diagnostic?.lightningStrikeCount) >= 1
      && Array.isArray(thunderEvaluation.result.value.diagnostic?.lastLightningTarget)
      && thunderEvaluation.result.value.diagnostic.lastLightningTarget.length === 3,
    animated: firstHash !== secondHash,
    shaderErrors,
    dayScreenshot,
    dayScreenshotPass: dayScreenshot.mode === "day" && dayScreenshot.phase === "day" && !dayScreenshot.diyOpen,
    materialCheck,
    materialCheckPass,
    screenshotPath,
    thunderstormScreenshotPath,
    seagullScreenshotPath,
  };
  result.ok = result.presetFound && result.modelReady && result.canvasVisible && result.webgl && result.animated
    && result.dayScreenshotPass && result.materialCheckPass
    && result.surfaceDetailV9SourcePass
    && result.wideFraming && result.detailedWater && result.actual8KWater && result.hybridRayTracing && result.thirtyMinuteLighting
    && result.defaultPersonalPresetsCollapsed && result.stormInDesktopScenePresets && result.stormAbsentFromPersonalPresets
    && result.quickLightingControlsHiddenBeforeStorm
    && result.quickLightingControlsVisible && result.quickLightingAnchoredAtBottom && result.quickLightingSelectionApplied
    && result.thunderstormButtonPass && result.thunderstormMetadataPass && result.thunderstormSchedulePass
    && result.thunderstormLightningSamplingPass && result.thunderstormWavePass
    && result.thunderstormShaderPass && result.thunderstormManualPass && result.mirroredStormMetadata
    && result.waterV8ShaderPass && result.seagullMetadataPass && result.seagullSchedulePass && result.seagullMotionPass
    && result.sunsetSeagullsRuntimePass && result.sunsetSeagullsHiddenPass
    && result.libraryPlacement === 'desktop-scene' && result.lightingControlsVisible && result.lightingControlsPass
    && result.omnidirectionalBassWaves && result.lowFrequencyDrivenWaves
    && result.omnidirectionalDirectionPass && result.omnidirectionalAmplitudePass
    && result.translucentWater && result.shipMiddleLeftPlacement && result.shipSceneScale >= 0.9
    && result.shipConfigured && result.shipLoaded && result.shipRuntimeBatches <= 3
    && result.shipFarPlacement && result.shipWaveMotion && result.oceanMaterialShaderPass
    && result.performancePass && !shaderErrors.length;
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  spawnSync("taskkill.exe", ["/PID", String(browser.pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
  await delay(600);
  const tempRoot = path.resolve(tmpdir()) + path.sep;
  if (profile.startsWith(tempRoot) && existsSync(profile)) {
    rmSync(profile, { recursive: true, force: true });
  }
}
