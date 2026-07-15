import React from 'react';
import { createRoot } from 'react-dom/client';
import GlassSurface from '../components/GlassSurface.jsx';
import '../../reactbits-glass-skin.css';

const BUTTON_SELECTOR = [
  '#bottom-bar .ctrl-btn',
  '#bottom-handle',
  '#top-right .icon-btn',
  '.desktop-mode-btn',
  '.home-orb-tool',
  '.search-mode-tabs button',
  '.search-history-chip',
  '.home-chip',
  '.panel-tab',
  '.fx-mini-btn',
  '.fx-toggle',
  '.fx-seg button',
  '.quality-option',
  '.modal-btn',
  '.visual-guide-actions button',
  '.song-action-btn',
  '.search-result .add-btn',
  '.mini-queue-remove',
  '.pl-detail-play'
].join(',');

const mountedRoots = new WeakMap();

function surfaceProfile(kind) {
  if (kind === 'player') {
    return {
      brightness: 53,
      blur: 12,
      displace: 0.42,
      backgroundOpacity: 0.1,
      distortionScale: -176,
      redOffset: -6,
      greenOffset: 8,
      blueOffset: 20
    };
  }

  if (kind === 'primary') {
    return {
      brightness: 57,
      blur: 11,
      displace: 0.44,
      backgroundOpacity: 0.16,
      distortionScale: -170,
      redOffset: -5,
      greenOffset: 9,
      blueOffset: 20
    };
  }

  return {
    brightness: 49,
    blur: 10,
    displace: 0.34,
    backgroundOpacity: 0.08,
    distortionScale: -162,
    redOffset: -4,
    greenOffset: 8,
    blueOffset: 18
  };
}

function GlassSkinSurface({ kind = 'button', radius = 999 }) {
  const profile = surfaceProfile(kind);
  const tone = kind === 'player' ? 'black' : 'clear';

  return (
    <GlassSurface
      className={`rb-glass-surface rb-glass-surface--${kind}`}
      tone={tone}
      width="100%"
      height="100%"
      borderRadius={radius}
      borderWidth={0.075}
      opacity={0.94}
      saturation={1.15}
      mixBlendMode="difference"
      {...profile}
    >
      <span aria-hidden="true" />
    </GlassSurface>
  );
}

function radiusFor(el, fallback) {
  const style = window.getComputedStyle(el);
  const parsed = Number.parseFloat(style.borderRadius);
  if (Number.isFinite(parsed) && parsed > 0) return Math.max(10, Math.round(parsed));
  const rect = el.getBoundingClientRect();
  if (rect.height > 0) return Math.round(rect.height / 2);
  return fallback;
}

function mountSurface(el, className, kind, fallbackRadius) {
  if (!el || mountedRoots.has(el)) return;

  const mount = document.createElement('span');
  mount.className = className;
  mount.setAttribute('aria-hidden', 'true');
  el.insertBefore(mount, el.firstChild);

  const root = createRoot(mount);
  mountedRoots.set(el, root);
  el.classList.add(className === 'rb-glass-panel-mount' ? 'reactbits-glass-panel-target' : 'reactbits-glass-target');
  root.render(<GlassSkinSurface kind={kind} radius={radiusFor(el, fallbackRadius)} />);
}

function mountButton(el) {
  const kind = el.id === 'play-btn' || el.classList.contains('active') ? 'primary' : 'button';
  mountSurface(el, 'rb-glass-mount', kind, 18);
}

function mountPlayerBar() {
  const bar = document.getElementById('bottom-bar');
  mountSurface(bar, 'rb-glass-panel-mount', 'player', 50);
}

function mountAllSurfaces() {
  mountPlayerBar();
  document.querySelectorAll(BUTTON_SELECTOR).forEach(mountButton);
  document.documentElement.classList.add('reactbits-glass-ready');
}

function scheduleMount() {
  window.clearTimeout(scheduleMount.timer);
  scheduleMount.timer = window.setTimeout(mountAllSurfaces, 80);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountAllSurfaces, { once: true });
} else {
  mountAllSurfaces();
}

const observer = new MutationObserver(scheduleMount);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('resize', scheduleMount, { passive: true });
