(function createSettingsCenter(global) {
  'use strict';

  const panel = document.getElementById('runtimeSettingsPanel');
  const openerButton = document.getElementById('runtimeSettingsButton');
  const appShell = document.querySelector('.app-shell');
  const pages = new Map();
  const MOTION_DURATION_MS = 180;
  let selectedPage = '';
  let open = false;
  let opener = null;
  let lastCloseReason = '';
  let appShellWasInert = false;
  let motionToken = 0;
  let closeTimer = 0;

  if (panel && panel.parentElement !== document.body) document.body.appendChild(panel);
  if (panel) {
    panel.dataset.settingsMotionState = panel.hidden ? 'closed' : 'open';
    // A hidden dialog is already absent from focus navigation. Keeping a large
    // hidden subtree inert makes the next open synchronously walk every mixer
    // control before the first frame.
    panel.inert = false;
  }

  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'summary',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  function pageNode(id) {
    return panel?.querySelector(`[data-settings-page="${CSS.escape(id)}"]`) || null;
  }

  function navNode(id) {
    return panel?.querySelector(`[data-settings-page-id="${CSS.escape(id)}"]`) || null;
  }

  function hiddenByClosedDisclosure(element) {
    let ancestor = element.parentElement;
    while (ancestor && ancestor !== panel) {
      if (ancestor instanceof HTMLDetailsElement && !ancestor.open) {
        if (ancestor.querySelector(':scope > summary') !== element) return true;
      }
      ancestor = ancestor.parentElement;
    }
    return false;
  }

  function visibleFocusables() {
    if (!panel || panel.hidden) return [];
    return Array.from(panel.querySelectorAll(focusableSelector)).filter((element) => (
      element instanceof HTMLElement
      && element.tabIndex >= 0
      && !element.hidden
      && !element.closest('[hidden], [inert]')
      && !hiddenByClosedDisclosure(element)
      && element.getClientRects().length > 0
    ));
  }

  function notify(reason = '') {
    document.dispatchEvent(new CustomEvent('fe-settings-center:change', {
      detail: { ...snapshot(), reason }
    }));
  }

  function reducedMotion() {
    return global.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  }

  function cancelCloseTimer() {
    if (!closeTimer) return;
    global.clearTimeout(closeTimer);
    closeTimer = 0;
  }

  function setMotionState(state) {
    if (panel) panel.dataset.settingsMotionState = state;
  }

  function finishClose(token) {
    if (!panel || token !== motionToken || open || panel.dataset.settingsMotionState !== 'exiting') return;
    cancelCloseTimer();
    panel.hidden = true;
    panel.inert = false;
    setMotionState('closed');
    if (appShell) appShell.inert = appShellWasInert;
    const restoreTarget = opener?.isConnected && typeof opener.focus === 'function'
      ? opener
      : openerButton;
    restoreTarget?.focus({ preventScroll: true });
    opener = null;
  }

  function showLocalError(descriptor, error) {
    const node = descriptor.node;
    if (!node) return;
    let output = node.querySelector(':scope > .settings-center-page-error');
    if (!output) {
      output = document.createElement('p');
      output.className = 'settings-center-page-error';
      output.setAttribute('role', 'status');
      node.appendChild(output);
    }
    output.textContent = `此页暂时无法显示：${error?.message || '未知错误'}`;
    node.dataset.settingsPageError = 'true';
  }

  function clearLocalError(descriptor) {
    descriptor.node?.querySelector(':scope > .settings-center-page-error')?.remove();
    if (descriptor.node) delete descriptor.node.dataset.settingsPageError;
  }

  function activate(descriptor) {
    clearLocalError(descriptor);
    if (typeof descriptor.activate !== 'function') return;
    try {
      const activation = descriptor.activate({ id: descriptor.id, node: descriptor.node });
      if (activation && typeof activation.catch === 'function') {
        activation.catch((error) => showLocalError(descriptor, error));
      }
    } catch (error) {
      showLocalError(descriptor, error);
    }
  }

  function registerPage(descriptor = {}) {
    const id = String(descriptor.id || '').trim();
    if (!id) throw new TypeError('Settings page id is required');
    const node = descriptor.node instanceof HTMLElement
      ? descriptor.node
      : pageNode(id);
    if (!node) throw new Error(`Settings page "${id}" was not found`);
    const registered = {
      id,
      label: String(descriptor.label || navNode(id)?.textContent || id).trim(),
      node,
      activate: descriptor.activate || descriptor.onActivate || null
    };
    pages.set(id, registered);
    node.dataset.settingsPage = id;
    node.setAttribute('role', 'tabpanel');
    const nav = navNode(id);
    if (nav?.id) node.setAttribute('aria-labelledby', nav.id);
    if (!selectedPage) selectedPage = id;
    const selected = id === selectedPage;
    node.hidden = !selected;
    // Hidden tab panels do not participate in focus navigation. Clear the
    // markup-time inert flag once during registration so selecting a large
    // mixer page never performs an expensive subtree traversal.
    node.inert = false;
    node.setAttribute('aria-hidden', String(!selected));
    return api;
  }

  function select(pageId) {
    const id = String(pageId || '').trim();
    const descriptor = pages.get(id);
    if (!descriptor) return false;
    selectedPage = id;
    pages.forEach((pageDescriptor, candidateId) => {
      const selected = candidateId === id;
      pageDescriptor.node.hidden = !selected;
      pageDescriptor.node.setAttribute('aria-hidden', String(!selected));
      const nav = navNode(candidateId);
      if (nav) {
        nav.classList.toggle('is-selected', selected);
        nav.setAttribute('aria-selected', String(selected));
        nav.tabIndex = selected ? 0 : -1;
      }
    });
    activate(descriptor);
    notify('select');
    return true;
  }

  function openCenter(pageId) {
    if (!panel) return false;
    const token = ++motionToken;
    cancelCloseTimer();
    if (!open) {
      if (!opener) {
        opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : openerButton;
        appShellWasInert = !!appShell?.inert;
      }
      if (appShell) appShell.inert = true;
      open = true;
      panel.hidden = false;
      panel.inert = false;
      panel.setAttribute('aria-hidden', 'false');
      document.documentElement.dataset.settingsCenterOpen = 'true';
    }
    if (reducedMotion()) {
      setMotionState('open');
    } else {
      setMotionState('entering');
      global.requestAnimationFrame(() => {
        if (token === motionToken && open) setMotionState('open');
      });
    }
    const target = pages.has(String(pageId || ''))
      ? String(pageId)
      : selectedPage || pages.keys().next().value;
    if (target) select(target);
    openerButton?.setAttribute('aria-expanded', 'true');
    // Focus must move into the modal, but Chromium otherwise combines the
    // focus/accessibility walk with first layout of every mixer control. Hide
    // only the scrollable body for that focus frame, then reveal it on the next
    // frame; state and DOM stay mounted and audio work is never touched.
    const content = panel.querySelector('.settings-center-content');
    if (content) content.style.contentVisibility = 'hidden';
    const initialFocus = panel.querySelector('[data-settings-center-close]') || panel;
    global.requestAnimationFrame(() => {
      if (token === motionToken && open) initialFocus?.focus({ preventScroll: true });
      global.requestAnimationFrame(() => content?.style.removeProperty('content-visibility'));
    });
    notify('open');
    return true;
  }

  function close(reason = 'api') {
    if (!panel || !open) return false;
    const token = ++motionToken;
    cancelCloseTimer();
    open = false;
    lastCloseReason = String(reason || 'api');
    panel.setAttribute('aria-hidden', 'true');
    panel.inert = true;
    openerButton?.setAttribute('aria-expanded', 'false');
    delete document.documentElement.dataset.settingsCenterOpen;
    setMotionState('exiting');
    notify(lastCloseReason);
    if (reducedMotion()) {
      finishClose(token);
    } else {
      closeTimer = global.setTimeout(() => finishClose(token), MOTION_DURATION_MS + 40);
    }
    return true;
  }

  function snapshot() {
    return {
      open,
      motionState: panel?.dataset.settingsMotionState || 'closed',
      selectedPage,
      lastCloseReason,
      pageIds: Array.from(pages.keys()),
      pages: Array.from(pages.values(), (descriptor) => ({
        id: descriptor.id,
        label: descriptor.label,
        hidden: descriptor.node.hidden,
        error: descriptor.node.dataset.settingsPageError === 'true'
      }))
    };
  }

  panel?.addEventListener('click', (event) => {
    const closeButton = event.target.closest('[data-settings-center-close]');
    if (closeButton) {
      close('button');
      return;
    }
    const nav = event.target.closest('[data-settings-page-id]');
    if (!nav || !panel.contains(nav)) return;
    if (select(nav.dataset.settingsPageId)) nav.focus({ preventScroll: true });
  });

  panel?.addEventListener('keydown', (event) => {
    const nav = event.target.closest('[data-settings-page-id]');
    if (!nav || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const items = Array.from(panel.querySelectorAll('[data-settings-page-id]'))
      .filter((item) => pages.has(item.dataset.settingsPageId));
    const current = items.indexOf(nav);
    if (current < 0 || !items.length) return;
    event.preventDefault();
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    const item = items[next];
    select(item.dataset.settingsPageId);
    item.focus({ preventScroll: true });
  });

  panel?.addEventListener('transitionend', (event) => {
    if (event.target !== panel || event.propertyName !== 'opacity') return;
    if (panel.dataset.settingsMotionState === 'exiting') finishClose(motionToken);
  });

  document.addEventListener('keydown', (event) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close('escape');
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = visibleFocusables();
    if (!focusables.length) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }, true);

  const api = Object.freeze({
    registerPage,
    open: openCenter,
    select,
    close,
    snapshot
  });

  global.FeSettingsCenter = api;
})(window);
