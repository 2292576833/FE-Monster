(function installMacCaptureBridge(global) {
  'use strict';
  if (global.FE_MONSTER_PLATFORM !== 'macos' || global.FeMonsterMacCapture) return;
  const bridge = global.chrome?.webview;
  if (!bridge?.postMessage || !bridge?.addEventListener) return;
  const pending = new Map();
  let sequence = 0;
  let spectrum = null;
  let spectrumAt = -Infinity;

  function request(action, parameters = {}, timeoutMs = 65_000) {
    const requestId = `mac-capture-${Date.now().toString(36)}-${++sequence}`;
    return new Promise((resolve, reject) => {
      const timeout = global.setTimeout(() => {
        pending.delete(requestId);
        const error = new Error('macOS 捕获操作超时，请检查系统权限。');
        error.name = 'TimeoutError';
        reject(error);
      }, Math.min(120_000, Math.max(1000, timeoutMs)));
      pending.set(requestId, { resolve, reject, timeout });
      try {
        bridge.postMessage({ ...parameters, type: 'fe-mac-capture', action, requestId,
          backendURL: global.location.origin });
      } catch (error) {
        global.clearTimeout(timeout);
        pending.delete(requestId);
        reject(error);
      }
    });
  }

  function emit(name, detail) {
    global.dispatchEvent(new global.CustomEvent(name, { detail }));
  }

  bridge.addEventListener('message', (event) => {
    let payload = event?.data;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch { return; }
    }
    if (!payload || typeof payload !== 'object') return;
    if (payload.type === 'fe-mac-capture-spectrum') {
      const rate = Number(payload.sampleRate);
      if (!Array.isArray(payload.bins) || payload.bins.length < 64 || payload.bins.length > 2048
        || !Number.isFinite(rate) || rate < 8000 || rate > 192000) return;
      spectrum = { ...payload, bins: Uint8Array.from(payload.bins, value =>
        Math.max(0, Math.min(255, Number(value) || 0))), sampleRate: rate };
      spectrumAt = global.performance.now();
      emit('fe-mac-capture-spectrum', spectrum);
      return;
    }
    if (payload.type === 'fe-mac-capture-state' || payload.type === 'fe-mac-capture-error') {
      if (payload.systemAudio === false || payload.type === 'fe-mac-capture-error') {
        spectrum = null; spectrumAt = -Infinity;
      }
      emit(payload.type, payload);
      return;
    }
    if (payload.type !== 'fe-mac-capture-result') return;
    const operation = pending.get(payload.requestId);
    if (operation) {
      global.clearTimeout(operation.timeout);
      pending.delete(payload.requestId);
      if (payload.ok === false) operation.reject(new Error(payload.error || 'macOS 捕获失败。'));
      else operation.resolve(payload);
    }
    emit('fe-mac-capture-result', payload);
  });

  global.addEventListener('pagehide', () => {
    for (const operation of pending.values()) {
      global.clearTimeout(operation.timeout);
      operation.reject(new Error('捕获页面已关闭。'));
    }
    pending.clear(); spectrum = null; spectrumAt = -Infinity;
    for (const action of ['cancel', 'system-audio-stop', 'microphone-stop']) {
      bridge.postMessage({ type: 'fe-mac-capture', action });
    }
  });

  global.FeMonsterMacCapture = Object.freeze({
    available: true,
    request,
    latestSpectrum(maxAgeMs = 500) {
      return spectrum && global.performance.now() - spectrumAt <= maxAgeMs ? spectrum : null;
    },
    startSystemAudio: () => request('system-audio-start'),
    stopSystemAudio: () => request('system-audio-stop'),
    startMicrophone: () => request('microphone-start'),
    stopMicrophone: () => request('microphone-stop'),
    permissions: () => request('permissions'),
    requestMediaPermission: kind => request('request-permission', { kind }),
  });
})(window);
