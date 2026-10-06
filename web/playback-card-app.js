(function createPlaybackCardApp(global) {
  'use strict';

  const PREF_KEY = 'fe-monster-playback-card-v1';
  const DEFAULTS = Object.freeze({
    mode: 'bar', size: 232, radius: 52, colorMode: 'cover',
    colorStart: '#243b43', colorEnd: '#b48865', solidColor: '#243b43',
    gradientAngle: 135, opacity: 92, borderWidth: 3, animation: true,
    breakStyle: 'center-out', assembleMs: 2400, longPressMs: 400,
    positionX: null, positionY: null
  });
  const LEGACY_DEFAULTS = Object.freeze({
    size: 208, radius: 52, colorMode: 'cover',
    colorStart: '#243b43', colorEnd: '#b48865', solidColor: '#243b43',
    gradientAngle: 135, opacity: 92, borderWidth: 3, animation: true,
    breakStyle: 'center-out', assembleMs: 2400, longPressMs: 400
  });
  const motionQuery = global.matchMedia?.('(prefers-reduced-motion: reduce)');
  let context = null;
  let prefs = { ...DEFAULTS };
  let mounted = false;
  let transitionBusy = false;
  let volumeDragging = false;
  let cardDragging = false;
  let cardPressTimer = 0;
  let cardPressX = 0;
  let cardPressY = 0;
  let dragPointerId = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let cardSeekCommitDone = false;
  let motionFrame = 0;
  let cardSyncTimer = 0;
  let volumeGeometry = null;
  let volumeGeometryKey = '';
  let geometryAnimating = false;

  const $ = (id) => document.getElementById(id);
  const els = {};

  function readPrefs() {
    let migrated = false;
    try {
      const stored = JSON.parse(global.localStorage.getItem(PREF_KEY) || 'null');
      if (stored && typeof stored === 'object') {
        prefs = { ...DEFAULTS, ...stored };
        // The first card release persisted its 208px defaults. Upgrade only
        // an untouched legacy profile so custom dimensions and drag positions
        // remain exactly as the user set them.
        const legacy = { ...LEGACY_DEFAULTS, ...stored };
        const same = (key) => String(legacy[key]) === String(LEGACY_DEFAULTS[key]);
        const noPosition = (stored.positionX == null && stored.positionY == null);
        const untouchedLegacy = noPosition
          && ['size', 'radius', 'colorMode', 'colorStart', 'colorEnd', 'solidColor',
            'gradientAngle', 'opacity', 'borderWidth', 'animation', 'breakStyle',
            'assembleMs', 'longPressMs'].every(same);
        if (untouchedLegacy) {
          prefs.size = DEFAULTS.size;
          migrated = true;
        }
      }
    } catch {}
    prefs.mode = prefs.mode === 'card' ? 'card' : 'bar';
    prefs.size = clamp(Number(prefs.size), 180, 300, DEFAULTS.size);
    prefs.radius = clamp(Number(prefs.radius), 24, 64, DEFAULTS.radius);
    prefs.opacity = clamp(Number(prefs.opacity), 40, 100, DEFAULTS.opacity);
    prefs.borderWidth = clamp(Number(prefs.borderWidth), 2, 8, DEFAULTS.borderWidth);
    prefs.assembleMs = clamp(Number(prefs.assembleMs), 1400, 4000, DEFAULTS.assembleMs);
    prefs.longPressMs = clamp(Number(prefs.longPressMs), 250, 800, DEFAULTS.longPressMs);
    prefs.gradientAngle = clamp(Number(prefs.gradientAngle), 0, 360, DEFAULTS.gradientAngle);
    if (migrated) savePrefs();
    return prefs;
  }

  function clamp(value, min, max, fallback = min) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function savePrefs() {
    try { global.localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {}
    context?.scheduleClientPreferencesSync?.();
  }

  function paletteColors() {
    const palette = context?.state?.playbackVisual?.palette || {};
    const colors = palette.coverColors || [];
    return { a: colors[0] || palette.primary || prefs.colorStart, b: colors[1] || palette.glow || prefs.colorEnd };
  }

  function applyCardStyle() {
    const card = els.card;
    if (!card) return;
    const size = `${prefs.size}px`;
    const colors = prefs.colorMode === 'solid'
      ? { a: prefs.solidColor, b: prefs.solidColor }
      : prefs.colorMode === 'gradient'
        ? { a: prefs.colorStart, b: prefs.colorEnd }
        : paletteColors();
    card.style.setProperty('--compact-card-size', size);
    card.style.setProperty('--compact-card-radius', `${prefs.radius}px`);
    card.style.setProperty('--compact-card-opacity', `${prefs.opacity / 100}`);
    card.style.setProperty('--compact-card-border-width', `${prefs.borderWidth}px`);
    card.style.setProperty('--compact-card-angle', `${prefs.gradientAngle}deg`);
    card.style.setProperty('--compact-card-color-start', colors.a);
    card.style.setProperty('--compact-card-color-end', colors.b);
    card.style.setProperty('--compact-card-solid-color', prefs.solidColor);
    const volumePrefs = context?.state?.volumeSliderPreferences || {};
    card.style.setProperty('--compact-volume-start', volumePrefs.colorStart || '#72e6ff');
    card.style.setProperty('--compact-volume-end', volumePrefs.colorEnd || '#b69cff');
    const stops = els.volumeGradient?.children;
    if (stops) {
      const start = volumePrefs.colorStart || '#72e6ff';
      const end = volumePrefs.gradient === false ? start : volumePrefs.colorEnd || '#b69cff';
      [start, end, start].forEach((color, index) => {
        if (stops[index]?.getAttribute('stop-color') !== color) stops[index]?.setAttribute('stop-color', color);
      });
    }
    card.style.setProperty('--compact-card-color-a', colors.a);
    card.style.setProperty('--compact-card-color-b', colors.b);
    card.dataset.colorMode = prefs.colorMode;
    card.dataset.breakStyle = prefs.breakStyle;
    syncVolumeGeometry();
    if (Number.isFinite(Number(prefs.positionX)) && Number.isFinite(Number(prefs.positionY))) {
      placeCard(Number(prefs.positionX), Number(prefs.positionY), false);
    } else {
      card.style.removeProperty('left'); card.style.removeProperty('top');
    }
  }

  /**
   * Keep the SVG perimeter on the real card outline. The old path used a
   * fixed 16px corner radius in a 100x100 viewBox, which drifted inward as
   * the card radius changed. Derive the path from the rendered card size and
   * the configured radius so every straight edge and rounded corner remains
   * part of the volume slider.
   */
  function getVolumeGeometry() {
    const cardStyle = els.card ? global.getComputedStyle(els.card) : null;
    const width = Math.max(1, parseFloat(cardStyle?.width) || Number(prefs.size) || 232);
    const height = Math.max(1, parseFloat(cardStyle?.height) || Number(prefs.size) || 232);
    const computed = els.volume ? global.getComputedStyle(els.volume) : null;
    const stroke = Math.max(1, Number.parseFloat(computed?.getPropertyValue('--compact-volume-stroke-width')) || 1.6);
    const edgeX = Math.max(0.18, Math.min(2, stroke / 2 / width * 100));
    const edgeY = Math.max(0.18, Math.min(2, stroke / 2 / height * 100));
    const radiusPx = clamp(parseFloat(cardStyle?.borderTopLeftRadius) || Number(prefs.radius), 0, Math.min(width, height) / 2, 0);
    const radiusX = clamp((radiusPx - stroke / 2) / width * 100, 0, (100 - edgeX * 2) / 2);
    const radiusY = clamp((radiusPx - stroke / 2) / height * 100, 0, (100 - edgeY * 2) / 2);
    return {
      width, height, edgeX, edgeY, radiusX, radiusY,
      left: edgeX, top: edgeY, right: 100 - edgeX, bottom: 100 - edgeY,
      straightX: Math.max(0, 100 - edgeX * 2 - radiusX * 2),
      straightY: Math.max(0, 100 - edgeY * 2 - radiusY * 2),
      arc: Math.PI * (radiusX + radiusY) / 4
    };
  }

  function roundedVolumePath(geometry) {
    const {
      left, top, right, bottom, radiusX: rx, radiusY: ry
    } = geometry;
    return [
      `M ${left + rx} ${top}`,
      `H ${right - rx}`,
      `A ${rx} ${ry} 0 0 1 ${right} ${top + ry}`,
      `V ${bottom - ry}`,
      `A ${rx} ${ry} 0 0 1 ${right - rx} ${bottom}`,
      `H ${left + rx}`,
      `A ${rx} ${ry} 0 0 1 ${left} ${bottom - ry}`,
      `V ${top + ry}`,
      `A ${rx} ${ry} 0 0 1 ${left + rx} ${top}`,
      'Z'
    ].join(' ');
  }

  function syncVolumeGeometry() {
    const track = $('compactPlaybackVolumeTrack');
    const fill = els.volumeFill || $('compactPlaybackVolumeFill');
    const hit = els.volumeHit || $('compactPlaybackVolumeHit');
    if (!track && !fill && !hit) return;
    const geometry = getVolumeGeometry();
    volumeGeometry = geometry;
    const key = [geometry.width, geometry.height, geometry.radiusX, geometry.radiusY, geometry.edgeX, geometry.edgeY].join('|');
    if (key === volumeGeometryKey) return;
    volumeGeometryKey = key;
    const path = roundedVolumePath(geometry);
    [track, fill, hit].forEach((node) => node?.setAttribute('d', path));
  }

  function placeCard(x, y, persist = true) {
    const card = els.card; if (!card) return;
    const size = card.getBoundingClientRect().width || prefs.size;
    const left = clamp(x, 8, Math.max(8, global.innerWidth - size - 8), 8);
    const top = clamp(y, 8, Math.max(8, global.innerHeight - size - 8), 8);
    card.style.left = `${left}px`; card.style.top = `${top}px`; card.style.right = 'auto'; card.style.bottom = 'auto';
    if (persist) { prefs.positionX = Math.round(left); prefs.positionY = Math.round(top); savePrefs(); }
  }

  function ensureDefaultPosition() {
    if (Number.isFinite(Number(prefs.positionX)) && Number.isFinite(Number(prefs.positionY))) return;
    const size = els.card?.getBoundingClientRect().width || prefs.size;
    placeCard(global.innerWidth - size - 26, global.innerHeight - size - 128, false);
  }

  function syncCardVolume(value = Number(context?.els?.qishuiPlaybackVolumeRange?.value || context?.els?.volumeRange?.value || 0)) {
    const percent = clamp(Math.round(Number(value)), 0, 100, 0);
    const volume = els.volume;
    if (!volume) return;
    volume.setAttribute('aria-valuenow', String(percent)); volume.setAttribute('aria-valuetext', `${percent}%`);
    volume.style.setProperty('--compact-volume', `${percent / 100}`);
    volume.style.setProperty('--compact-volume-progress', `${percent / 100}`);
    volume.style.setProperty('--compact-volume-pulse', String(clamp(Number(context?.state?.volumeSliderMotion?.pulse || 0), 0, 1)));
    if (els.volumeFill) els.volumeFill.style.strokeDashoffset = String(1 - percent / 100);
    const volumePrefs = context?.state?.volumeSliderPreferences || {};
    if (els.volumeGradient) {
      const angle = volumePrefs.gradient !== false && !motionQuery?.matches
        ? performance.now() / (Math.max(1, Number(volumePrefs.duration) || 6) * 1000) * 360 % 360 : 0;
      els.volumeGradient.setAttribute('gradientTransform', `rotate(${angle.toFixed(2)} .5 .5)`);
    }
  }

  function syncCardProgress() {
    const source = context?.els?.qishuiPlaybackProgressRange;
    if (!source || !els.progress) return;
    els.progress.value = source.value || '0';
    els.progress.disabled = source.disabled;
    els.progress.style.setProperty('--compact-progress', `${Number(els.progress.value) / 10}%`);
    if (els.currentTime) els.currentTime.textContent = context.els.qishuiPlaybackCurrentTime?.textContent || '00:00';
    if (els.totalTime) els.totalTime.textContent = context.els.qishuiPlaybackTotalTime?.textContent || '00:00';
  }

  function renderCard(force = false) {
    const song = context?.playbackCardSong?.();
    const title = String(song?.title || '等待播放');
    const artist = String(song?.artist || song?.album || '音乐播放');
    if (els.title) { els.title.textContent = title; els.title.title = title; }
    if (els.artist) { els.artist.textContent = artist; els.artist.title = artist; }
    const imageUrl = context?.coverUrl?.(song) || '';
    const colors = paletteColors();
    applyCardStyle();
    global.FEPlaybackCardRuntime?.start(els.canvas, { imageUrl, title, artist, colors, force });
    syncCardProgress(); syncCardVolume();
    if (els.play) {
      const playing = !!context?.els?.audio && !context.els.audio.paused && !!context?.state?.currentSong;
      els.play.textContent = playing ? 'Ⅱ' : '▶';
      els.play.setAttribute('aria-label', playing ? '暂停' : '播放');
      els.play.title = playing ? '暂停' : '播放';
    }
  }

  function showCard(show, preview = false) {
    if (!els.card) return;
    els.card.hidden = !show;
    els.card.classList.toggle('is-preview', preview);
    if (show) { ensureDefaultPosition(); renderCard(true); }
    global.FEPlaybackCardRuntime?.[show ? 'start' : 'stop']?.(els.canvas);
    if (show && !motionFrame) {
      const tick = () => {
        motionFrame = prefs.mode === 'card' || els.card.classList.contains('is-preview')
          ? global.requestAnimationFrame(tick) : 0;
        syncCardVolume();
        if (geometryAnimating) syncVolumeGeometry();
      };
      motionFrame = global.requestAnimationFrame(tick);
    } else if (!show && motionFrame) {
      global.cancelAnimationFrame(motionFrame); motionFrame = 0;
    }
  }

  function syncModeControls() {
    const cardMode = prefs.mode === 'card';
    if (context?.state) context.state.playbackCardMode = prefs.mode;
    if (els.card) {
      els.card.dataset.mode = prefs.mode;
      els.card.classList.toggle('is-card', cardMode);
      els.card.classList.toggle('is-bar', !cardMode);
    }
    context?.els?.qishuiPlaybackModeToggle?.setAttribute('aria-pressed', String(cardMode));
    context?.els?.qishuiPlaybackModeToggle?.setAttribute('aria-label', cardMode ? '切换新播放栏' : '切换播放卡片');
    context?.els?.qishuiPlaybackModeToggle?.setAttribute('title', cardMode ? '切换新播放栏' : '切换播放卡片');
    context?.els?.qishuiPlaybackModeToggle?.classList.toggle('is-card-mode', cardMode);
    if (!cardMode) {
      showCard(false);
      context?.els?.compactPlaybackCard?.setAttribute('aria-hidden', 'true');
    } else {
      showCard(true);
      context?.els?.compactPlaybackCard?.setAttribute('aria-hidden', 'false');
    }
    context?.syncQishuiPlaybackCard?.();
    if (cardMode) showCard(true);
  }

  function transitionNodes(fromMode, toMode) {
    const source = fromMode === 'card' ? els.card : context?.els?.qishuiPlaybackCard;
    const target = toMode === 'card' ? els.card : context?.els?.qishuiPlaybackCard;
    if (!source || !target) return Promise.resolve();
    if (toMode === 'card') {
      context.state.playbackCardMode = 'bar'; context.syncQishuiPlaybackCard?.();
      showCard(true, true);
    } else {
      context.state.playbackCardMode = 'card'; context.syncQishuiPlaybackCard?.();
      target.hidden = false; target.classList.add('is-transition-target');
      context.els.appShell?.classList.add('has-qishui-playback-card');
      context.renderQishuiPlaybackCard?.();
    }
    const animate = prefs.animation && global.FEPlaybackCardTransition?.run;
    if (!animate) return Promise.resolve();
    const particlePromise = global.FEPlaybackCardTransition.run({
      source, target, style: prefs.breakStyle, assembleMs: prefs.assembleMs,
      onPhase: (phase) => {
        document.documentElement.dataset.playbackCardTransition = phase;
        source.dataset.transitionPhase = phase;
        target.dataset.transitionPhase = phase;
      }
    }).catch((error) => { source.dataset.transitionError = String(error?.message || error); });
    return particlePromise;
  }

  async function setMode(mode, { animate = true, persist = true } = {}) {
    const next = mode === 'card' ? 'card' : 'bar';
    if (transitionBusy || next === prefs.mode) return;
    const previous = prefs.mode;
    transitionBusy = true;
    try {
      if (animate) await transitionNodes(previous, next);
      prefs.mode = next;
      if (persist) savePrefs();
      syncModeControls();
      renderCard(true);
    } finally {
      els.card?.classList.remove('is-transition-target', 'is-preview');
      context?.els?.qishuiPlaybackCard?.classList.remove('is-transition-target');
      transitionBusy = false;
      document.documentElement.dataset.playbackCardTransition = 'idle';
    }
  }

  function setVolumeFromEvent(event) {
    const svg = els.volume; if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 100;
    const y = (event.clientY - rect.top) / rect.height * 100;
    const ratio = perimeterRatio(x, y, volumeGeometry || getVolumeGeometry());
    const percent = Math.round(ratio * 100);
    context.syncPlayerVolume(percent / 100);
    context.schedulePlayerVolumeCommit(percent / 100);
    syncCardVolume(percent);
  }

  function perimeterRatio(x, y, geometry = getVolumeGeometry()) {
    const {
      left, top, right, bottom, radiusX: rx, radiusY: ry,
      straightX, straightY
    } = geometry;
    const arc = Math.PI * (rx + ry) / 4;
    const candidates = [];
    const line = (x1, y1, x2, y2, start, len) => {
      const dx = x2 - x1, dy = y2 - y1;
      const u = clamp(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy), 0, 1);
      const px = x1 + dx * u, py = y1 + dy * u;
      candidates.push({ d: (x - px) ** 2 + (y - py) ** 2, at: start + len * u });
    };
    const quarter = (cx, cy, startAngle, offset) => {
      const angle = Math.atan2(y - cy, x - cx);
      let t = angle - startAngle;
      while (t < 0) t += Math.PI * 2;
      while (t > Math.PI * 2) t -= Math.PI * 2;
      t = clamp(t, 0, Math.PI / 2);
      const px = cx + rx * Math.cos(startAngle + t), py = cy + ry * Math.sin(startAngle + t);
      candidates.push({ d: (x - px) ** 2 + (y - py) ** 2, at: offset + arc * t / (Math.PI / 2) });
    };
    let at = 0;
    line(left + rx, top, right - rx, top, at, straightX); at += straightX;
    quarter(right - rx, top + ry, -Math.PI / 2, at); at += arc;
    line(right, top + ry, right, bottom - ry, at, straightY); at += straightY;
    quarter(right - rx, bottom - ry, 0, at); at += arc;
    line(right - rx, bottom, left + rx, bottom, at, straightX); at += straightX;
    quarter(left + rx, bottom - ry, Math.PI / 2, at); at += arc;
    line(left, bottom - ry, left, top + ry, at, straightY); at += straightY;
    quarter(left + rx, top + ry, Math.PI, at);
    const total = straightX * 2 + straightY * 2 + arc * 4;
    return clamp((candidates.sort((a, b) => a.d - b.d)[0]?.at || 0) / total, 0, 1);
  }

  function onVolumeKey(event) {
    const current = Number(context?.els?.qishuiPlaybackVolumeRange?.value || context?.els?.volumeRange?.value || 0);
    let next = current;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(100, current + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, current - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 100;
    else return;
    event.preventDefault(); context.syncPlayerVolume(next / 100); context.schedulePlayerVolumeCommit(next / 100); syncCardVolume(next);
  }

  function onCardPointerDown(event) {
    // This handler is also registered during the window capture phase. Keep
    // native form controls out of the drag path: cancelling their pointerdown
    // prevents a select popup from opening and steals focus from settings.
    if (event.button !== 0 || !(event.target instanceof Element) || !els.card?.contains(event.target)
        || event.target.closest('button,input,select,textarea,label,svg,[contenteditable="true"],[role="combobox"],[role="slider"]')) return;
    const cardRect = els.card?.getBoundingClientRect();
    if (!cardRect) return;
    clearTimeout(cardPressTimer);
    const rect = els.card.getBoundingClientRect(); dragOffsetX = event.clientX - rect.left; dragOffsetY = event.clientY - rect.top;
    dragPointerId = event.pointerId; cardPressX = event.clientX; cardPressY = event.clientY;
    els.card.classList.add('is-pressing');
    event.preventDefault();
    cardPressTimer = global.setTimeout(() => {
      cardDragging = true; els.card.classList.remove('is-pressing'); els.card.classList.add('is-dragging'); els.card.dataset.dragging = 'true';
      els.card.setPointerCapture?.(dragPointerId); event.preventDefault();
    }, prefs.longPressMs);
  }

  function onCardPointerMove(event) {
    if (event.pointerId !== dragPointerId) return;
    if (!cardDragging && cardPressTimer && Math.hypot(event.clientX - cardPressX, event.clientY - cardPressY) > 10) {
      clearTimeout(cardPressTimer); cardPressTimer = 0; els.card.classList.remove('is-pressing'); dragPointerId = null;
      return;
    }
    if (!cardDragging) return;
    event.preventDefault(); placeCard(event.clientX - dragOffsetX, event.clientY - dragOffsetY);
  }

  function onCardPointerUp(event) {
    clearTimeout(cardPressTimer); cardPressTimer = 0;
    els.card?.classList.remove('is-pressing');
    if (event.pointerId !== dragPointerId) return;
    if (cardDragging) { cardDragging = false; els.card.classList.remove('is-dragging'); delete els.card.dataset.dragging; els.card.releasePointerCapture?.(dragPointerId); }
    dragPointerId = null;
  }

  function wire() {
    if (mounted) return; mounted = true;
    els.card = $('compactPlaybackCard'); els.canvas = $('compactPlaybackCanvas'); els.title = $('compactPlaybackTitle'); els.artist = $('compactPlaybackArtist');
    els.progress = $('compactPlaybackProgress'); els.currentTime = $('compactPlaybackCurrentTime'); els.totalTime = $('compactPlaybackTotalTime');
    els.previous = $('compactPlaybackPreviousButton'); els.play = $('compactPlaybackPlayButton'); els.next = $('compactPlaybackNextButton'); els.returnButton = $('compactPlaybackReturnButton') || $('compactPlaybackReturn');
    els.volume = $('compactPlaybackVolume'); els.volumeFill = $('compactPlaybackVolumeFill'); els.volumeHit = $('compactPlaybackVolumeHit');
    els.volumeGradient = $('compactPlaybackVolumeGradient');
    if (global.ResizeObserver) new ResizeObserver(syncVolumeGeometry).observe(els.card);
    els.card?.addEventListener('transitionrun', (event) => {
      if (event.target === els.card && /^(width|height|border-.*radius)$/.test(event.propertyName)) geometryAnimating = true;
    });
    const endGeometryAnimation = (event) => {
      if (event.target !== els.card || !/^(width|height|border-.*radius)$/.test(event.propertyName)) return;
      geometryAnimating = false;
      syncVolumeGeometry();
    };
    els.card?.addEventListener('transitionend', endGeometryAnimation);
    els.card?.addEventListener('transitioncancel', endGeometryAnimation);
    readPrefs(); applyCardStyle();
    global.addEventListener('resize', syncVolumeGeometry, { passive: true });
    context.els.qishuiPlaybackModeToggle?.addEventListener('click', () => setMode(prefs.mode === 'card' ? 'bar' : 'card'));
    els.returnButton?.addEventListener('click', () => setMode('bar'));
    els.previous?.addEventListener('click', () => context.switchQishuiPlaybackTrack(-1));
    els.next?.addEventListener('click', () => context.switchQishuiPlaybackTrack(1));
    els.play?.addEventListener('click', () => context.togglePlay());
    els.card?.addEventListener('wheel', (event) => {
      if (event.target.closest('button,input,svg')) return;
      if (event.ctrlKey || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
      event.preventDefault(); event.stopPropagation();
      context.switchQishuiPlaybackTrack(event.deltaY < 0 ? -1 : 1);
    }, { passive: false });
    global.addEventListener('wheel', (event) => {
      if (prefs.mode !== 'card' || !els.card || transitionBusy) return;
      const rect = els.card.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      const edge = Math.min(rect.width, rect.height) * 0.22;
      if (event.clientX < rect.left + edge || event.clientX > rect.right - edge || event.clientY < rect.top + edge || event.clientY > rect.bottom - edge) return;
      if (event.target?.closest?.('button,input')) return;
      if (event.ctrlKey || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
      event.preventDefault(); event.stopPropagation();
      context.switchQishuiPlaybackTrack(event.deltaY < 0 ? -1 : 1);
    }, { passive: false, capture: true });
    els.progress?.addEventListener('pointerdown', () => {
      cardSeekCommitDone = false;
      context.beginQishuiPlaybackSeek();
    });
    els.progress?.addEventListener('input', () => {
      if (context.els.qishuiPlaybackProgressRange) context.els.qishuiPlaybackProgressRange.value = els.progress.value;
      context.previewQishuiPlaybackSeek(); syncCardProgress();
    });
    const commitCardSeek = () => {
      if (cardSeekCommitDone) return;
      cardSeekCommitDone = true;
      const song = context.playbackCardSong?.();
      const metadataDuration = Number(song?.duration);
      const mediaDuration = Number(context.els.audio?.duration);
      if (!Number.isFinite(metadataDuration) || metadataDuration <= 0 || !Number.isFinite(mediaDuration)
        || mediaDuration <= 0 || Math.abs(metadataDuration - mediaDuration) < 1) {
        context.commitQishuiPlaybackSeek();
        return;
      }
      const target = clamp(Number(els.progress.value) / 1000 * metadataDuration, 0, metadataDuration);
      const nativeTarget = clamp(Number(els.progress.value) / 1000 * mediaDuration, 0, mediaDuration);
      const seekState = context.state?.qishuiPlaybackCard;
      if (seekState) {
        seekState.progressDragging = false;
        seekState.pendingSeekTarget = null;
        seekState.pendingAudioSeekTarget = null;
      }
      if (context.els.audio && Number.isFinite(nativeTarget)) {
        try { context.els.audio.currentTime = nativeTarget; } catch { /* media can reject a late seek */ }
      }
      if (context.state.currentSong) context.state.currentSong.position = target;
      context.updateQishuiPlaybackProgress?.(target, metadataDuration, { forceRange: true });
      fetch(`/api/player/seek?position=${encodeURIComponent(Math.round(target))}`, { credentials: 'same-origin' }).catch(() => {});
      els.progress.value = String(Math.round(Number(els.progress.value) || 0));
      els.progress.style.setProperty('--compact-progress', `${Number(els.progress.value) / 10}%`);
    };
    ['change', 'pointerup', 'blur'].forEach((event) => els.progress?.addEventListener(event, commitCardSeek));
    els.progress?.addEventListener('pointercancel', () => { cardSeekCommitDone = false; });
    els.volume?.addEventListener('pointerdown', (event) => { volumeDragging = true; els.volume.setPointerCapture?.(event.pointerId); setVolumeFromEvent(event); });
    els.volume?.addEventListener('pointermove', (event) => { if (volumeDragging) setVolumeFromEvent(event); });
    els.volume?.addEventListener('pointerup', () => { volumeDragging = false; });
    els.volume?.addEventListener('pointercancel', () => { volumeDragging = false; });
    els.volume?.addEventListener('wheel', (event) => {
      event.preventDefault(); event.stopPropagation();
      if (event.ctrlKey || event.metaKey || !Number.isFinite(event.deltaY) || !event.deltaY) return;
      const current = Number(context?.els?.qishuiPlaybackVolumeRange?.value || context?.els?.volumeRange?.value || 0);
      const step = Number(context?.state?.volumeSliderPreferences?.wheelStep || 2);
      const next = clamp(current - Math.sign(event.deltaY) * step, 0, 100);
      if (next === current) return;
      context.syncPlayerVolume(next / 100); context.schedulePlayerVolumeCommit(next / 100); syncCardVolume(next);
    }, { passive: false });
    els.volume?.addEventListener('keydown', onVolumeKey);
    els.card?.addEventListener('pointerdown', onCardPointerDown);
    els.card?.addEventListener('pointermove', onCardPointerMove);
    els.card?.addEventListener('pointerup', onCardPointerUp);
    els.card?.addEventListener('pointercancel', onCardPointerUp);
    global.addEventListener('pointerdown', onCardPointerDown, { passive: false, capture: true });
    global.addEventListener('pointermove', onCardPointerMove, { passive: false });
    global.addEventListener('pointerup', onCardPointerUp, { passive: false });
    global.addEventListener('pointercancel', onCardPointerUp, { passive: false });
    context.els.qishuiPlaybackVolumeRange?.addEventListener('input', () => syncCardVolume());
    context.els.qishuiPlaybackProgressRange?.addEventListener('input', syncCardProgress);
    global.addEventListener('resize', () => { if (prefs.mode === 'card') { applyCardStyle(); ensureDefaultPosition(); } });
    global.addEventListener('fe-settings-center:change', () => renderCard());
    global.addEventListener('fe-monster-playback-card:sync', () => renderCard());
    ['timeupdate', 'durationchange', 'loadedmetadata', 'play', 'pause'].forEach((event) => {
      context.els.audio?.addEventListener(event, () => { syncCardProgress(); renderCard(); });
    });
    cardSyncTimer = global.setInterval(() => {
      if (prefs.mode === 'card') renderCard();
    }, 360);
    syncModeControls();
  }

  function mountWhenReady() {
    context = global.FeMonsterPlaybackContext;
    if (!context) return;
    wire();
    global.FEPlaybackCardSettings?.mount?.({
      getPreferences: () => ({ ...prefs }),
      updatePreferences: (patch = {}) => { prefs = { ...prefs, ...patch }; savePrefs(); applyCardStyle(); renderCard(true); syncModeControls(); },
      defaults: DEFAULTS,
      setMode: (mode) => setMode(mode),
      onReset: () => { const mode = prefs.mode; prefs = { ...DEFAULTS, mode }; savePrefs(); applyCardStyle(); renderCard(true); syncModeControls(); }
    });
    if (prefs.mode === 'card') setMode('card', { animate: false, persist: false });
  }

  const publicApi = {
    mount: mountWhenReady,
    setMode,
    getPreferences: () => ({ ...prefs }),
    updatePreferences: (patch) => { prefs = { ...prefs, ...patch }; savePrefs(); applyCardStyle(); renderCard(true); syncModeControls(); },
    sync: () => { renderCard(true); syncModeControls(); return { ...prefs }; }
  };
  global.FEPlaybackCardApp = Object.freeze(publicApi);
  global.FEPlaybackCard = global.FEPlaybackCardApp;
  if (global.FeMonsterPlaybackContext) mountWhenReady();
  else global.addEventListener('fe-monster-playback-context-ready', mountWhenReady, { once: true });
})(window);
