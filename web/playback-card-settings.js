(function createPlaybackCardSettings(global) {
  'use strict';

  const DEFAULTS = Object.freeze({
    mode: 'bar',
    size: 232,
    radius: 40,
    colorMode: 'cover',
    colorStart: '#243b43',
    colorEnd: '#b48865',
    solidColor: '#243b43',
    gradientAngle: 135,
    opacity: 92,
    borderWidth: 3,
    animation: true,
    breakStyle: 'center-out',
    assembleMs: 2400,
    longPressMs: 400
  });

  const CONTROL_KEYS = Object.freeze([
    'size', 'radius', 'colorMode', 'colorStart', 'colorEnd', 'solidColor',
    'gradientAngle', 'opacity', 'borderWidth', 'animation', 'breakStyle',
    'assembleMs', 'longPressMs'
  ]);

  const RANGE_LIMITS = Object.freeze({
    size: [180, 300],
    radius: [24, 64],
    gradientAngle: [0, 360],
    opacity: [40, 100],
    borderWidth: [2, 8],
    assembleMs: [1400, 4000],
    longPressMs: [250, 800]
  });

  const VALID = Object.freeze({
    mode: new Set(['bar', 'card']),
    colorMode: new Set(['cover', 'gradient', 'solid']),
    breakStyle: new Set(['bottom-up', 'center-out', 'scatter'])
  });

  const LABELS = Object.freeze({
    mode: { bar: '新播放栏', card: '播放卡片' },
    colorMode: { cover: '跟随封面颜色', gradient: '自定义渐变', solid: '自定义纯色' },
    breakStyle: { 'bottom-up': '从下向上', 'center-out': '中心撕裂（向四周）', scatter: '全体散射' }
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function numberValue(value, fallback, min, max) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
  }

  function colorValue(value, fallback) {
    const text = String(value || '').trim();
    return /^#[\da-f]{6}$/iu.test(text) ? text.toLowerCase() : fallback;
  }

  function normalize(source, defaults) {
    const input = source && typeof source === 'object' ? source : {};
    const base = defaults && typeof defaults === 'object' ? defaults : DEFAULTS;
    const next = { ...DEFAULTS, ...base };
    next.mode = VALID.mode.has(input.mode) ? input.mode : (VALID.mode.has(next.mode) ? next.mode : DEFAULTS.mode);
    next.size = numberValue(input.size, numberValue(next.size, DEFAULTS.size, ...RANGE_LIMITS.size), ...RANGE_LIMITS.size);
    next.radius = numberValue(input.radius, numberValue(next.radius, DEFAULTS.radius, ...RANGE_LIMITS.radius), ...RANGE_LIMITS.radius);
    next.colorMode = VALID.colorMode.has(input.colorMode) ? input.colorMode : (VALID.colorMode.has(next.colorMode) ? next.colorMode : DEFAULTS.colorMode);
    next.colorStart = colorValue(input.colorStart, colorValue(next.colorStart, DEFAULTS.colorStart));
    next.colorEnd = colorValue(input.colorEnd, colorValue(next.colorEnd, DEFAULTS.colorEnd));
    next.solidColor = colorValue(input.solidColor, colorValue(next.solidColor, DEFAULTS.solidColor));
    next.gradientAngle = numberValue(input.gradientAngle, numberValue(next.gradientAngle, DEFAULTS.gradientAngle, ...RANGE_LIMITS.gradientAngle), ...RANGE_LIMITS.gradientAngle);
    next.opacity = numberValue(input.opacity, numberValue(next.opacity, DEFAULTS.opacity, ...RANGE_LIMITS.opacity), ...RANGE_LIMITS.opacity);
    next.borderWidth = numberValue(input.borderWidth, numberValue(next.borderWidth, DEFAULTS.borderWidth, ...RANGE_LIMITS.borderWidth), ...RANGE_LIMITS.borderWidth);
    next.animation = input.animation === undefined ? next.animation !== false : input.animation !== false;
    next.breakStyle = VALID.breakStyle.has(input.breakStyle) ? input.breakStyle : (VALID.breakStyle.has(next.breakStyle) ? next.breakStyle : DEFAULTS.breakStyle);
    next.assembleMs = numberValue(input.assembleMs, numberValue(next.assembleMs, DEFAULTS.assembleMs, ...RANGE_LIMITS.assembleMs), ...RANGE_LIMITS.assembleMs);
    next.longPressMs = numberValue(input.longPressMs, numberValue(next.longPressMs, DEFAULTS.longPressMs, ...RANGE_LIMITS.longPressMs), ...RANGE_LIMITS.longPressMs);
    return next;
  }

  function readPreferences(getPreferences) {
    if (typeof getPreferences !== 'function') return {};
    try {
      const value = getPreferences();
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function optionMarkup(options, labels) {
    return options.map((value) => `<option value="${value}">${labels[value] || value}</option>`).join('');
  }

  function rangeRow(key, label, suffix, description = '') {
    const [min, max] = RANGE_LIMITS[key];
    const step = key === 'assembleMs' || key === 'longPressMs' ? 50 : 1;
    const id = `playbackCardSetting${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    return `<label class="playback-card-setting playback-card-setting--range" for="${id}">
      <span><span>${label}</span><output data-card-output="${key}" for="${id}"></output></span>
      <input id="${id}" data-card-preference="${key}" type="range" min="${min}" max="${max}" step="${step}" />
      ${description ? `<small>${description}</small>` : ''}
    </label>`;
  }

  function colorRow(key, label) {
    const id = `playbackCardSetting${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    return `<label class="playback-card-setting playback-card-setting--color" for="${id}">
      <span>${label}</span><input id="${id}" data-card-preference="${key}" type="color" />
    </label>`;
  }

  function findInsertionPoint() {
    const volume = global.document?.getElementById('runtimeVolumeSliderSettingsGroup');
    const visual = global.document?.getElementById('settingsCenterPageVisual');
    // Prefer the visual tab whenever it exists. During startup the volume
    // disclosure may still be in the legacy panel; placing this group in the
    // destination now keeps it inside the settings center when controls move
    // a frame later.
    if (visual) return { parent: visual, after: visual.contains(volume) ? volume : null };
    if (volume?.parentElement) return { parent: volume.parentElement, after: volume };
    const general = global.document?.getElementById('settingsCenterPageGeneral');
    return general ? { parent: general, after: null } : null;
  }

  function ensureVolumeGradient() {
    const volume = global.document?.getElementById('compactPlaybackVolume');
    const svg = volume?.matches('svg') ? volume : volume?.querySelector('svg');
    if (!svg || svg.querySelector('#compactPlaybackVolumeGradient')) return;
    const svgNamespace = 'http://www.w3.org/2000/svg';
    const defs = global.document.createElementNS(svgNamespace, 'defs');
    const gradient = global.document.createElementNS(svgNamespace, 'linearGradient');
    gradient.id = 'compactPlaybackVolumeGradient';
    gradient.setAttribute('x1', '0');
    gradient.setAttribute('y1', '0');
    gradient.setAttribute('x2', '1');
    gradient.setAttribute('y2', '1');
    gradient.setAttribute('gradientUnits', 'objectBoundingBox');
    [['0%', 'var(--compact-volume-start)'], ['50%', 'var(--compact-volume-end)'], ['100%', 'var(--compact-volume-start)']]
      .forEach(([offset, color]) => {
        const stop = global.document.createElementNS(svgNamespace, 'stop');
        stop.setAttribute('offset', offset);
        stop.style.setProperty('stop-color', color);
        gradient.appendChild(stop);
      });
    defs.appendChild(gradient);
    svg.insertBefore(defs, svg.firstChild);
  }

  function mount(options = {}) {
    if (!global.document) return null;
    ensureVolumeGradient();
    const insertion = findInsertionPoint();
    if (!insertion?.parent) return null;
    const existing = global.document.getElementById('runtimePlaybackCardSettingsGroup');
    if (existing) return existing.__fePlaybackCardSettingsApi || null;

    const defaults = { ...DEFAULTS, ...(options.defaults && typeof options.defaults === 'object' ? options.defaults : {}) };
    let preferences = normalize(readPreferences(options.getPreferences), defaults);
    const group = global.document.createElement('details');
    group.id = 'runtimePlaybackCardSettingsGroup';
    group.className = 'runtime-settings-group playback-card-settings';
    group.innerHTML = `
      <summary><span>播放卡片</span><small>小尺寸 · 大圆角 · Three.js 粒子切换</small></summary>
      <div class="runtime-settings-group-content playback-card-settings-content">
        <p class="playback-card-settings-hint">切换为播放卡片后，封面、进度和控制会保持在一张可拖动的小卡片里。卡片不显示新播放栏歌词。</p>
        <label class="playback-card-setting" for="playbackCardSettingMode"><span>播放模式</span>
          <select id="playbackCardSettingMode" data-card-preference="mode">${optionMarkup(['bar', 'card'], LABELS.mode)}</select>
        </label>
        <section class="playback-card-settings-section" aria-labelledby="playbackCardAppearanceHeading">
          <h3 id="playbackCardAppearanceHeading">外观</h3>
          ${rangeRow('size', '卡片尺寸', 'px', '建议保留 180–300 px，让封面和按钮有足够空间。')}
          ${rangeRow('radius', '圆角', 'px')}
          <label class="playback-card-setting" for="playbackCardSettingColorMode"><span>颜色来源</span>
            <select id="playbackCardSettingColorMode" data-card-preference="colorMode">${optionMarkup(['cover', 'gradient', 'solid'], LABELS.colorMode)}</select>
          </label>
          <div class="playback-card-color-grid" data-card-colors>
            ${colorRow('colorStart', '渐变起始色')}
            ${colorRow('colorEnd', '渐变结束色')}
            ${colorRow('solidColor', '纯色')}
          </div>
          ${rangeRow('gradientAngle', '渐变角度', '°')}
          ${rangeRow('opacity', '卡片不透明度', '%')}
          ${rangeRow('borderWidth', '边框宽度', 'px', '边框音量滑块会沿四条边和四个圆角共用这一条律动。')}
        </section>
        <section class="playback-card-settings-section" aria-labelledby="playbackCardMotionHeading">
          <h3 id="playbackCardMotionHeading">切换与操作</h3>
          <label class="runtime-toggle playback-card-setting-toggle" for="playbackCardSettingAnimation">
            <input id="playbackCardSettingAnimation" class="ui-switch" data-card-preference="animation" type="checkbox" role="switch" />
            <span>启用粒子切换动画</span>
          </label>
          <label class="playback-card-setting" for="playbackCardSettingBreakStyle"><span>破碎方式</span>
            <select id="playbackCardSettingBreakStyle" data-card-preference="breakStyle">${optionMarkup(['bottom-up', 'center-out', 'scatter'], LABELS.breakStyle)}</select>
          </label>
          ${rangeRow('assembleMs', '聚合速度', 'ms', '破碎完成后立即向播放卡片位置流动，速度由此处调节。')}
          <p class="playback-card-fixed-note">粒子会在破碎完成后立即朝目标播放卡片聚合。</p>
          ${rangeRow('longPressMs', '长按拖动触发', 'ms', '长按卡片后拖动位置；滚动卡片可切换上一首 / 下一首。')}
        </section>
        <button class="runtime-action-button playback-card-reset" id="playbackCardAppearanceReset" type="button">恢复播放卡片默认外观</button>
      </div>`;

    if (insertion.after?.nextSibling) insertion.parent.insertBefore(group, insertion.after.nextSibling);
    else if (insertion.after) insertion.parent.appendChild(group);
    else insertion.parent.appendChild(group);

    const controls = Array.from(group.querySelectorAll('[data-card-preference]'));
    const outputs = new Map(Array.from(group.querySelectorAll('[data-card-output]')).map((node) => [node.dataset.cardOutput, node]));
    const colorGrid = group.querySelector('[data-card-colors]');

    function update(nextValues, emit = true) {
      preferences = normalize({ ...preferences, ...(nextValues || {}) }, defaults);
      if (emit && typeof options.updatePreferences === 'function') {
        try { options.updatePreferences(nextValues || {}); } catch { /* persistence is owned by the host */ }
      }
      controls.forEach((control) => {
        const key = control.dataset.cardPreference;
        if (control.type === 'checkbox') control.checked = preferences[key] === true;
        else control.value = String(preferences[key]);
      });
      outputs.forEach((output, key) => {
        const value = preferences[key];
        if (key === 'assembleMs' || key === 'longPressMs') output.textContent = `${value} ms`;
        else if (key === 'gradientAngle') output.textContent = `${value}°`;
        else if (key === 'size' || key === 'radius' || key === 'borderWidth') output.textContent = `${value} px`;
        else if (key === 'opacity') output.textContent = `${value}%`;
      });
      colorGrid?.classList.toggle('is-gradient', preferences.colorMode === 'gradient');
      colorGrid?.classList.toggle('is-solid', preferences.colorMode === 'solid');
      colorGrid?.classList.toggle('is-cover', preferences.colorMode === 'cover');
      controls.forEach((control) => {
        if (control.type !== 'color') return;
        const enabled = preferences.colorMode === 'gradient'
          ? control.dataset.cardPreference === 'colorStart' || control.dataset.cardPreference === 'colorEnd'
          : preferences.colorMode === 'solid' && control.dataset.cardPreference === 'solidColor';
        control.disabled = !enabled;
      });
      group.dataset.cardMode = preferences.mode;
      group.dataset.cardColorMode = preferences.colorMode;
    }

    function onControlInput(event) {
      const control = event.target.closest('[data-card-preference]');
      if (!control || !group.contains(control)) return;
      // Ranges update on input for a responsive preview; selects, colors and
      // switches commit on change. This keeps persistence to one patch per
      // gesture while still making slider output feel immediate.
      if (control.type === 'range' && event.type === 'change') return;
      if (control.type !== 'range' && event.type === 'input') return;
      const key = control.dataset.cardPreference;
      const value = control.type === 'checkbox'
        ? control.checked
        : control.type === 'range' ? Number(control.value) : control.value;
      if (key === 'mode' && typeof options.setMode === 'function') {
        // The host owns the bar/card transition (including particle breakup),
        // so a mode select must use it instead of only changing persistence.
        update({ mode: value }, false);
        try { options.setMode(value); } catch { /* host transition is optional */ }
        return;
      }
      update({ [key]: value }, true);
    }

    group.addEventListener('input', onControlInput);
    group.addEventListener('change', onControlInput);
    group.querySelector('#playbackCardAppearanceReset')?.addEventListener('click', () => {
      const reset = {};
      CONTROL_KEYS.forEach((key) => { reset[key] = defaults[key] ?? DEFAULTS[key]; });
      update(reset, true);
    });

    const api = {
      element: group,
      defaults: { ...defaults },
      sync(values) {
        const source = values && typeof values === 'object' ? values : readPreferences(options.getPreferences);
        update(source, false);
        return { ...preferences };
      },
      getPreferences() { return { ...preferences }; },
      destroy() {
        group.remove();
        if (existing?.__fePlaybackCardSettingsApi === api) delete existing.__fePlaybackCardSettingsApi;
      }
    };
    group.__fePlaybackCardSettingsApi = api;
    update(preferences, false);
    return api;
  }

  const api = {
    defaults: { ...DEFAULTS },
    mount,
    normalize
  };
  ensureVolumeGradient();
  // Keep the requested all-caps FE namespace and the historical mixed-case
  // alias so older runtime bundles can discover the same module.
  global.FEPlaybackCardSettings = api;
  global.FePlaybackCardSettings = api;
}(window));
