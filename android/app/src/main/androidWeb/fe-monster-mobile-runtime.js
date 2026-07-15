(() => {
  'use strict';

  if (window.__feMonsterAndroidMobileRuntime) return;
  window.__feMonsterAndroidMobileRuntime = true;

  const root = document.documentElement;
  const bridge = window.FeMonsterAndroid;
  const nativeTier = (() => {
    try {
      return String(bridge?.getPerformanceTier?.() || '').toLowerCase();
    } catch (_) {
      return '';
    }
  })();
  const memory = Math.max(0, Number(navigator.deviceMemory) || 0);
  const cores = Math.max(1, Number(navigator.hardwareConcurrency) || 2);
  const performanceTier = nativeTier === 'low' || nativeTier === 'high'
    ? nativeTier
    : memory > 0 && memory <= 3 || cores <= 4
      ? 'low'
      : memory >= 8 && cores >= 8
        ? 'high'
        : 'balanced';

  root.dataset.fePlatform = 'android';
  root.dataset.feClientSource = 'apk-bundled';
  root.dataset.androidPerformance = performanceTier;
  root.dataset.feServerState = 'checking';
  window.feMonsterPlatform = 'android';
  window.feMonsterClientSource = 'apk-bundled';
  window.feMonsterAndroidPerformanceTier = performanceTier;

  const state = {
    server: 'checking',
    probing: null,
    timer: 0
  };

  function visible(node) {
    if (!node || node.hidden) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function showMessage(message) {
    if (typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }
    try {
      bridge?.showMessage?.(message);
    } catch (_) {
      // The native bridge can be unavailable in browser-based QA.
    }
  }

  function ensureOfflineNotice() {
    let notice = document.getElementById('feMonsterAndroidOfflineNotice');
    if (notice) return notice;
    notice = document.createElement('button');
    notice.id = 'feMonsterAndroidOfflineNotice';
    notice.type = 'button';
    notice.hidden = true;
    notice.setAttribute('aria-live', 'polite');
    notice.addEventListener('click', () => probeServer(true));
    document.body.appendChild(notice);
    return notice;
  }

  function communityActions() {
    return Array.from(document.querySelectorAll([
      '#communityCard button:not(#communityCollapseButton)',
      '#communityCard [role="button"]',
      '#communityMessageDialog button',
      '#communityMessageDialog input',
      '#communityProfileDialog button',
      '#communityProfileDialog input',
      '#communityProfileDialog textarea'
    ].join(',')));
  }

  function applyServerState(nextState) {
    state.server = nextState;
    root.dataset.feServerState = nextState;
    const offline = nextState === 'offline';
    const sandboxButton = document.getElementById('sandboxModeButton');
    const communityCard = document.getElementById('communityCard');
    const notice = ensureOfflineNotice();

    sandboxButton?.classList.toggle('is-server-offline', offline);
    sandboxButton?.setAttribute('aria-disabled', String(offline));
    communityCard?.classList.toggle('is-server-offline', offline);
    communityCard?.setAttribute('aria-disabled', String(offline));
    communityActions().forEach((control) => {
      control.classList.toggle('is-server-offline', offline);
      control.setAttribute('aria-disabled', String(offline));
    });

    notice.hidden = !offline;
    if (offline) {
      notice.textContent = '服务器未启动 · 社区与沙盒暂不可用 · 点击重试';
      const status = document.getElementById('communityStatus');
      if (status) status.textContent = '社区离线：服务器未启动';
    }

    window.dispatchEvent(new CustomEvent('fe-monster-server-state', {
      detail: { state: nextState, online: nextState === 'online', platform: 'android' }
    }));
  }

  async function probeServer(force = false) {
    if (state.probing && !force) return state.probing;
    state.probing = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      try {
        const response = await fetch('/api/app/runtime?android-health=1', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal
        });
        applyServerState(response.ok ? 'online' : 'offline');
      } catch (_) {
        applyServerState('offline');
      } finally {
        clearTimeout(timeout);
        state.probing = null;
      }
      return state.server;
    })();
    return state.probing;
  }

  function blocksOfflineAction(target) {
    if (state.server !== 'offline' || !(target instanceof Element)) return false;
    if (target.closest('#sandboxModeButton')) return true;
    const communityTarget = target.closest('#communityCard, #communityMessageDialog, #communityProfileDialog');
    return Boolean(communityTarget && !target.closest('#communityCollapseButton'));
  }

  document.addEventListener('click', (event) => {
    if (!blocksOfflineAction(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showMessage('服务器未启动，社区与沙盒暂不可用；本地音乐、预设和播放功能仍可使用。');
    probeServer(true);
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    ensureOfflineNotice();
    applyServerState(state.server);
    probeServer();
  }, { once: true });

  window.addEventListener('online', () => probeServer(true), { passive: true });
  window.addEventListener('offline', () => applyServerState('offline'), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) probeServer(true);
  });

  state.timer = window.setInterval(() => {
    if (!document.hidden) probeServer();
  }, 15000);
})();
