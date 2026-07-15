import React from 'https://esm.sh/react@19';
import { createRoot } from 'https://esm.sh/react-dom@19/client?deps=react@19';
import BorderGlow from '/components/BorderGlow.runtime.js';

const BUTTON_SELECTOR = [
  '[data-border-glow]',
  '.runtime-topbar button',
  '.top-search button',
  '.netease-login-button',
  '.home-button',
  '.diy-button',
  '.sandbox-mode-button',
  '.player-dock button',
  '.community-market-entry',
  '.sandbox-primary-button',
  '.update-primary-button'
].join(',');
const GLASS_BUTTON_SELECTOR = [
  '[data-glass-surface]',
  '.glass-surface',
  '.reactbits-glass-target',
  '.reactbits-glass-panel-target'
].join(',');
const EXCLUDED_BUTTON_SELECTOR = [
  '#bootLogoButton',
  '.boot-logo-button',
  '.book-lyric-line'
].join(',');

const mountedButtons = new WeakMap();

function isGlassButton(button) {
  return button.matches(GLASS_BUTTON_SELECTOR);
}

function isExcludedButton(button) {
  return button.matches(EXCLUDED_BUTTON_SELECTOR);
}

function radiusFor(button) {
  const style = window.getComputedStyle(button);
  const parsed = Number.parseFloat(style.borderRadius);
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(4, Math.round(parsed));
  const rect = button.getBoundingClientRect();
  return rect.height > 0 ? Math.round(rect.height / 2) : 14;
}

function glowProfile(button) {
  const active = button.classList.contains('is-active')
    || button.classList.contains('play')
    || button.getAttribute('aria-pressed') === 'true';
  const close = button.classList.contains('window-control-button--close')
    || button.classList.contains('login-close-button')
    || button.id === 'windowQuitButton';
  const radius = radiusFor(button);

  if (close) {
    return {
      glowColor: '356 96 74',
      colors: ['#fb7185', '#f43f5e', '#38bdf8'],
      glowIntensity: 0.72,
      radius
    };
  }

  if (active) {
    return {
      glowColor: '178 96 76',
      colors: ['#67e8f9', '#a7f3d0', '#f0abfc'],
      glowIntensity: 0.78,
      radius
    };
  }

  return {
    glowColor: '194 96 78',
    colors: ['#7dd3fc', '#c084fc', '#f9a8d4'],
    glowIntensity: 0.58,
    radius
  };
}

function glowPropsFor(button) {
  const profile = glowProfile(button);
  const compactWindowControl = button.classList.contains('window-control-button');
  return {
    className: 'rb-button-border-glow',
    edgeSensitivity: compactWindowControl ? 34 : 18,
    glowColor: profile.glowColor,
    backgroundColor: 'transparent',
    borderRadius: profile.radius,
    glowRadius: compactWindowControl ? 4 : Math.max(12, Math.min(24, profile.radius + 10)),
    glowIntensity: profile.glowIntensity,
    coneSpread: 18,
    animated: false,
    colors: profile.colors,
    fillOpacity: compactWindowControl ? 0.04 : 0.08
  };
}

function propsSignature(props) {
  return [
    props.glowColor,
    props.borderRadius,
    props.glowRadius,
    props.glowIntensity,
    props.colors.join(',')
  ].join('|');
}

function cardFor(button) {
  const entry = mountedButtons.get(button);
  return entry?.mount.querySelector('.border-glow-card') || null;
}

function setCardActive(button, active) {
  const card = cardFor(button);
  if (!card) return;
  card.classList.toggle('is-button-glow-active', active);
  if (!active) card.style.setProperty('--edge-proximity', '0');
}

function setCardFocus(button) {
  const card = cardFor(button);
  if (!card) return;
  card.classList.add('is-button-glow-active');
  card.style.setProperty('--edge-proximity', '100');
  card.style.setProperty('--cursor-angle', '45deg');
}

function updatePointerGlow(button, event) {
  const card = cardFor(button);
  if (!card) return;
  const rect = button.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const kx = dx === 0 ? Infinity : cx / Math.abs(dx);
  const ky = dy === 0 ? Infinity : cy / Math.abs(dy);
  const edge = Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
  let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  if (angle < 0) angle += 360;

  card.classList.add('is-button-glow-active');
  card.style.setProperty('--edge-proximity', `${(edge * 100).toFixed(3)}`);
  card.style.setProperty('--cursor-angle', `${angle.toFixed(3)}deg`);
}

function addListeners(button) {
  const onPointerMove = (event) => updatePointerGlow(button, event);
  const onPointerEnter = () => setCardActive(button, true);
  const onPointerLeave = () => setCardActive(button, false);
  const onFocus = () => setCardFocus(button);
  const onBlur = () => setCardActive(button, false);

  button.addEventListener('pointermove', onPointerMove, { passive: true });
  button.addEventListener('pointerenter', onPointerEnter, { passive: true });
  button.addEventListener('pointerleave', onPointerLeave, { passive: true });
  button.addEventListener('focus', onFocus);
  button.addEventListener('blur', onBlur);

  return () => {
    button.removeEventListener('pointermove', onPointerMove);
    button.removeEventListener('pointerenter', onPointerEnter);
    button.removeEventListener('pointerleave', onPointerLeave);
    button.removeEventListener('focus', onFocus);
    button.removeEventListener('blur', onBlur);
  };
}

function unmountGlow(button) {
  const entry = mountedButtons.get(button);
  if (!entry) return;
  entry.dispose();
  entry.root.unmount();
  entry.mount.remove();
  if (entry.positioned) button.style.position = '';
  button.classList.remove('border-glow-button-target');
  mountedButtons.delete(button);
}

function mountOrUpdateGlow(button) {
  if (!(button instanceof HTMLElement)) return;

  if (isGlassButton(button) || isExcludedButton(button)) {
    unmountGlow(button);
    return;
  }

  const props = glowPropsFor(button);
  const signature = propsSignature(props);
  let entry = mountedButtons.get(button);

  if (!entry) {
    const style = window.getComputedStyle(button);
    const mount = document.createElement('span');
    mount.className = 'rb-border-glow-mount';
    mount.setAttribute('aria-hidden', 'true');
    button.insertBefore(mount, button.firstChild);

    const positioned = style.position === 'static';
    if (positioned) button.style.position = 'relative';
    button.classList.add('border-glow-button-target');

    entry = {
      root: createRoot(mount),
      mount,
      positioned,
      dispose: addListeners(button),
      signature: ''
    };
    mountedButtons.set(button, entry);
  }

  if (entry.signature !== signature) {
    entry.root.render(React.createElement(BorderGlow, props));
    entry.signature = signature;
  }
}

function scanButtons(root = document) {
  if (root instanceof HTMLElement && root.matches(BUTTON_SELECTOR)) {
    mountOrUpdateGlow(root);
  }
  root.querySelectorAll?.(BUTTON_SELECTOR).forEach(mountOrUpdateGlow);
}

function scheduleScan(root = document) {
  window.clearTimeout(scheduleScan.timer);
  scheduleScan.timer = window.setTimeout(() => scanButtons(root), 60);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => scanButtons(), { once: true });
} else {
  scanButtons();
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.type === 'attributes') {
      if (mutation.target instanceof HTMLElement && mutation.target.matches(BUTTON_SELECTOR)) {
        mountOrUpdateGlow(mutation.target);
      }
      continue;
    }

    for (const node of mutation.addedNodes) {
      if (node instanceof HTMLElement) scanButtons(node);
    }
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'data-glass-surface', 'aria-pressed']
});

window.addEventListener('resize', () => scheduleScan(), { passive: true });
