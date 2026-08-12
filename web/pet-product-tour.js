(() => {
  'use strict';

  const TOUR_VERSION = 1;
  const NEW_REGISTRATION_WINDOW_MS = 30 * 60 * 1000;
  const AUTO_START_DELAY_MS = 1_600;
  const STEP_DISPLAY_MS = 6_800;
  const STEP_MAX_NARRATION_WAIT_MS = 20_000;
  const PET_MOVE_MS = 640;
  const PET_RETURN_MS = 520;
  const PET_VIEWPORT_MARGIN = 12;
  const PET_TARGET_GAP = 16;
  const STORAGE_PREFIX = 'fe-monster-pet-product-tour-v1:';
  const SAFE_CLICK_TARGETS = new Set([
    '#communityRailButton',
    '#diyButton',
    '#diyPresetButton',
    '#diyTextModeButton',
    '#diyWallpaperModeButton',
    '#runtimeSettingsButton'
  ]);
  const STEPS = Object.freeze([
    Object.freeze({
      id: 'meet-pet',
      target: '#petAssistantCharacter',
      click: false,
      title: '先认识小 Fe',
      text: '我是小 Fe。先带你看一圈，八步就熟，不碰你的播放、作品和参数。'
    }),
    Object.freeze({
      id: 'music-account',
      target: '#neteaseLoginButton',
      click: false,
      title: '音乐账号',
      text: '这里查看或切换音乐平台账号。扫码登录后，头像、歌单和会员状态会自动同步。'
    }),
    Object.freeze({
      id: 'community',
      target: '#communityRailButton',
      click: true,
      title: '社区与 FE ID',
      text: '这里是社区。好友、一起听、作品、成就、挂饰和身份资料都从这里进入。'
    }),
    Object.freeze({
      id: 'diy',
      target: '#diyButton',
      click: true,
      title: '打开 DIY',
      text: '点 DIY 就能打开创作入口。接下来我只切换页面，不会替你改任何设置。'
    }),
    Object.freeze({
      id: 'scene',
      target: '#diyPresetButton',
      click: true,
      prepare: 'diy',
      title: '场景预设',
      text: '场景预设决定音乐画面的骨架。选择预设后，再按自己的设备和音乐微调。'
    }),
    Object.freeze({
      id: 'lyrics',
      target: '#diyTextModeButton',
      click: true,
      prepare: 'diy',
      title: '歌词效果',
      text: '歌词效果控制单行、多排、焦点回声的字体、层次、颜色和动画。'
    }),
    Object.freeze({
      id: 'wallpaper',
      target: '#diyWallpaperModeButton',
      click: true,
      prepare: 'diy',
      title: '壁纸模式',
      text: '壁纸模式可以选择本地或实时壁纸，再调整适配、亮度和透明度。'
    }),
    Object.freeze({
      id: 'settings',
      target: '#runtimeSettingsButton',
      click: true,
      prepare: 'settings',
      title: '设置与重新演示',
      text: '右上角是性能、语音和桌宠设置。以后想重看，点设置里的“重新演示”。'
    })
  ]);

  const state = {
    active: false,
    auto: false,
    stepIndex: 0,
    token: 0,
    timer: 0,
    autoStartTimer: 0,
    retryTimer: 0,
    movementTimer: 0,
    returnTimer: 0,
    narrationToken: 0,
    narrationController: null,
    narrationHandle: null,
    narrationUtterance: null,
    narrationPhase: 'idle',
    narrationStepId: '',
    narrationDone: Promise.resolve(),
    resolveNarration: null,
    stepShownAt: 0,
    feId: '',
    profileDetail: null,
    target: null,
    targetAriaDescribedBy: null,
    reducedMotion: false,
    pointerInside: false,
    petRoot: null,
    petOrigin: null,
    petTarget: null,
    petPhase: 'origin',
    root: null,
    ring: null,
    ripple: null,
    title: null,
    copy: null,
    progress: null,
    next: null,
    skip: null,
    resizeObserver: null
  };

  function boundedText(value, maxLength = 160) {
    return String(value ?? '').trim().slice(0, maxLength);
  }

  function normalizedFeId(value) {
    return boundedText(value, 64).replace(/[^a-z0-9_-]/gi, '');
  }

  function storageKey(feId) {
    return `${STORAGE_PREFIX}${normalizedFeId(feId) || 'preview'}`;
  }

  function readMarker(feId) {
    try {
      const parsed = JSON.parse(window.localStorage?.getItem(storageKey(feId)) || 'null');
      return parsed && parsed.version === TOUR_VERSION ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function writeMarker(status, stepIndex = state.stepIndex) {
    if (!state.feId) return;
    try {
      window.localStorage?.setItem(storageKey(state.feId), JSON.stringify({
        version: TOUR_VERSION,
        status,
        step: Math.max(0, Math.min(STEPS.length - 1, Number(stepIndex) || 0)),
        updatedAt: new Date().toISOString()
      }));
    } catch (error) {}
  }

  function registrationTime(profile = {}) {
    const raw = profile.registeredAt ?? profile.createdAt ?? profile.registrationTime;
    if (Number.isFinite(Number(raw)) && Number(raw) > 0) return Number(raw);
    const parsed = Date.parse(boundedText(raw, 120));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function shouldAutoStart(detail = {}, nowMs = Date.now()) {
    const profile = detail.profile || {};
    const feId = normalizedFeId(profile.feId || detail.feId);
    if (!detail.loggedIn || detail.hasCommunityIdentity === false || !feId) return false;
    const marker = readMarker(feId);
    if (marker?.status === 'completed') return false;
    if (marker?.status === 'running') return true;
    const explicitlyNew = detail.isNewRegistration === true
      || detail.newRegistration === true
      || profile.isNewRegistration === true;
    if (explicitlyNew) return true;
    const registeredAt = registrationTime(profile);
    return registeredAt > 0
      && nowMs >= registeredAt - 60_000
      && nowMs - registeredAt <= NEW_REGISTRATION_WINDOW_MS;
  }

  function isFullClient() {
    const mode = boundedText(
      document.documentElement?.getAttribute?.('data-fe-client')
        || new URLSearchParams(window.location?.search || '').get('client'),
      40
    );
    return !['embedded', 'desktop-scene', 'desktop-pet'].includes(mode);
  }

  function motionReduced() {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  }

  function delay(durationMs) {
    return new Promise((resolve) => window.setTimeout(resolve, durationMs));
  }

  function clearTimer() {
    window.clearTimeout(state.timer);
    state.timer = 0;
  }

  function clearAutoStartTimers() {
    window.clearTimeout(state.autoStartTimer);
    window.clearTimeout(state.retryTimer);
    state.autoStartTimer = 0;
    state.retryTimer = 0;
  }

  function uiIsReady() {
    const boot = document.getElementById('bootScreen');
    if (!boot) return true;
    if (boot.hidden || boot.getAttribute?.('aria-hidden') === 'true') return true;
    try {
      return window.getComputedStyle?.(boot)?.display === 'none';
    } catch (error) {
      return false;
    }
  }

  function targetVisible(target) {
    if (!target || target.hidden || target.disabled || target.getAttribute?.('aria-disabled') === 'true') return false;
    const rect = target.getBoundingClientRect?.();
    if (!rect || rect.width < 2 || rect.height < 2) return false;
    try {
      const style = window.getComputedStyle?.(target);
      return !style || (style.display !== 'none' && style.visibility !== 'hidden');
    } catch (error) {
      return true;
    }
  }

  function createUi() {
    if (state.root || !document.body) return !!state.root;
    const root = document.createElement('aside');
    root.className = 'pet-product-tour';
    root.id = 'petProductTour';
    root.hidden = true;
    root.setAttribute('aria-label', '小 Fe 程序演示');
    root.setAttribute('aria-live', 'polite');
    root.innerHTML = `
      <div class="pet-product-tour__header">
        <span class="pet-product-tour__eyebrow">小 FE 演示</span>
        <span class="pet-product-tour__progress" id="petProductTourProgress">1 / ${STEPS.length}</span>
      </div>
      <strong class="pet-product-tour__title" id="petProductTourTitle"></strong>
      <p class="pet-product-tour__copy" id="petProductTourCopy"></p>
      <div class="pet-product-tour__actions">
        <button class="pet-product-tour__skip" id="petProductTourSkip" type="button">跳过演示</button>
        <button class="pet-product-tour__next" id="petProductTourNext" type="button">下一步</button>
      </div>`;
    const ring = document.createElement('span');
    ring.className = 'pet-product-tour__target-ring';
    ring.hidden = true;
    ring.setAttribute('aria-hidden', 'true');
    const ripple = document.createElement('span');
    ripple.className = 'pet-product-tour__click-ripple';
    ripple.hidden = true;
    ripple.setAttribute('aria-hidden', 'true');
    document.body.append(ring, ripple, root);
    state.root = root;
    state.ring = ring;
    state.ripple = ripple;
    state.title = root.querySelector('#petProductTourTitle');
    state.copy = root.querySelector('#petProductTourCopy');
    state.progress = root.querySelector('#petProductTourProgress');
    state.next = root.querySelector('#petProductTourNext');
    state.skip = root.querySelector('#petProductTourSkip');
    state.next?.addEventListener('click', () => advance('manual'));
    state.skip?.addEventListener('click', () => finish('skipped'));
    root.addEventListener('pointerenter', () => {
      state.pointerInside = true;
      clearTimer();
    });
    root.addEventListener('pointerleave', () => {
      state.pointerInside = false;
      scheduleAdvance();
    });
    root.addEventListener('focusin', () => {
      state.pointerInside = true;
      clearTimer();
    });
    root.addEventListener('focusout', (event) => {
      if (root.contains(event.relatedTarget)) return;
      state.pointerInside = false;
      scheduleAdvance();
    });
    window.addEventListener('resize', () => {
      updateTargetRing();
      updatePetGuidePosition();
    }, { passive: true });
    window.addEventListener('scroll', updateTargetRing, { passive: true, capture: true });
    return true;
  }

  function setTarget(target) {
    if (state.target === target) {
      updateTargetRing();
      return;
    }
    if (state.target) {
      state.target.classList?.remove('is-pet-tour-target', 'is-pet-tour-clicking');
      if (state.targetAriaDescribedBy == null) state.target.removeAttribute?.('aria-describedby');
      else state.target.setAttribute?.('aria-describedby', state.targetAriaDescribedBy);
    }
    state.target = target || null;
    state.targetAriaDescribedBy = target?.getAttribute?.('aria-describedby') ?? null;
    if (target) {
      target.classList?.add('is-pet-tour-target');
      const describedBy = [state.targetAriaDescribedBy, 'petProductTourCopy'].filter(Boolean).join(' ');
      target.setAttribute?.('aria-describedby', describedBy);
    }
    updateTargetRing();
  }

  function updateTargetRing() {
    if (!state.ring || !state.active || !targetVisible(state.target)) {
      if (state.ring) state.ring.hidden = true;
      return;
    }
    const rect = state.target.getBoundingClientRect();
    const margin = 7;
    state.ring.hidden = false;
    state.ring.style.width = `${Math.max(0, rect.width + margin * 2)}px`;
    state.ring.style.height = `${Math.max(0, rect.height + margin * 2)}px`;
    state.ring.style.transform = `translate3d(${Math.round(rect.left - margin)}px, ${Math.round(rect.top - margin)}px, 0)`;
    state.ring.style.borderRadius = `${Math.max(12, Math.min(28, rect.height * .32))}px`;
  }

  function showClickRipple(target) {
    if (!state.ripple || !targetVisible(target)) return;
    const rect = target.getBoundingClientRect();
    const size = Math.max(34, Math.min(84, Math.min(rect.width, rect.height) * .86));
    state.ripple.hidden = false;
    state.ripple.style.width = `${size}px`;
    state.ripple.style.height = `${size}px`;
    state.ripple.style.left = `${rect.left + rect.width / 2 - size / 2}px`;
    state.ripple.style.top = `${rect.top + rect.height / 2 - size / 2}px`;
    state.ripple.classList.remove('is-active');
    void state.ripple.offsetWidth;
    state.ripple.classList.add('is-active');
    window.setTimeout(() => {
      if (state.ripple) state.ripple.hidden = true;
    }, state.reducedMotion ? 80 : 680);
  }

  function rectOverlapArea(left, right) {
    const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
    const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
    return width * height;
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Number(value) || 0));
  }

  function petGuidePosition(target) {
    const petRoot = state.petRoot;
    const origin = state.petOrigin;
    if (!petRoot || !origin || !targetVisible(target)) return null;
    const targetRect = target.getBoundingClientRect();
    const width = Math.max(64, origin.width || petRoot.offsetWidth || 176);
    const height = Math.max(64, origin.height || petRoot.offsetHeight || 218);
    const viewportWidth = Math.max(width + PET_VIEWPORT_MARGIN * 2, window.innerWidth || 0);
    const viewportHeight = Math.max(height + PET_VIEWPORT_MARGIN * 2, window.innerHeight || 0);
    const centeredX = targetRect.left + targetRect.width / 2 - width / 2;
    const centeredY = targetRect.top + targetRect.height / 2 - height / 2;
    const candidates = [
      { side: 'right', left: targetRect.right + PET_TARGET_GAP, top: centeredY },
      { side: 'left', left: targetRect.left - width - PET_TARGET_GAP, top: centeredY },
      { side: 'bottom', left: centeredX, top: targetRect.bottom + PET_TARGET_GAP },
      { side: 'top', left: centeredX, top: targetRect.top - height - PET_TARGET_GAP }
    ];
    const tourRect = state.root && !state.root.hidden ? state.root.getBoundingClientRect?.() : null;
    let best = null;
    for (const candidate of candidates) {
      const left = clamp(candidate.left, PET_VIEWPORT_MARGIN, viewportWidth - width - PET_VIEWPORT_MARGIN);
      const top = clamp(candidate.top, PET_VIEWPORT_MARGIN, viewportHeight - height - PET_VIEWPORT_MARGIN);
      const rect = { left, top, right: left + width, bottom: top + height };
      const targetOverlap = rectOverlapArea(rect, targetRect);
      const tourOverlap = tourRect ? rectOverlapArea(rect, tourRect) : 0;
      const travel = Math.hypot(left - origin.left, top - origin.top);
      const score = targetOverlap * 20 + tourOverlap * 2 + travel * 0.02;
      if (!best || score < best.score) best = { ...candidate, left, top, score };
    }
    return best;
  }

  function dispatchPetMove(phase, step, position = null) {
    window.dispatchEvent(new CustomEvent('fe-monster-pet-tour-move', {
      detail: {
        phase,
        step: step?.id || STEPS[state.stepIndex]?.id || '',
        target: step?.target || STEPS[state.stepIndex]?.target || '',
        side: position?.side || '',
        x: Math.round(position?.left || state.petOrigin?.left || 0),
        y: Math.round(position?.top || state.petOrigin?.top || 0),
        reducedMotion: state.reducedMotion
      }
    }));
  }

  function clearPetMovementTimer() {
    window.clearTimeout(state.movementTimer);
    state.movementTimer = 0;
  }

  function updatePetGuidePosition() {
    if (!state.active || !state.petRoot || !state.petOrigin || !state.petTarget) return false;
    if (state.petRoot.contains?.(state.petTarget)) return false;
    const position = petGuidePosition(state.petTarget);
    if (!position) return false;
    state.petRoot.style.setProperty('--pet-tour-x', `${Math.round(position.left - state.petOrigin.left)}px`);
    state.petRoot.style.setProperty('--pet-tour-y', `${Math.round(position.top - state.petOrigin.top)}px`);
    state.petRoot.dataset.petTourSide = position.side;
    return true;
  }

  function movePetBesideTarget(target, step) {
    const petRoot = state.petRoot;
    if (!petRoot || !state.petOrigin || !targetVisible(target) || petRoot.contains?.(target)) {
      state.petPhase = 'arrived';
      if (petRoot) petRoot.dataset.petTourPhase = 'arrived';
      dispatchPetMove('arrived', step);
      return false;
    }
    const position = petGuidePosition(target);
    if (!position) return false;
    clearPetMovementTimer();
    state.petTarget = target;
    state.petPhase = 'moving';
    petRoot.classList.add('is-pet-tour-guide');
    petRoot.dataset.petTourPhase = 'moving';
    petRoot.style.setProperty('--pet-tour-duration', `${state.reducedMotion ? 1 : PET_MOVE_MS}ms`);
    petRoot.style.setProperty('--pet-tour-x', `${Math.round(position.left - state.petOrigin.left)}px`);
    petRoot.style.setProperty('--pet-tour-y', `${Math.round(position.top - state.petOrigin.top)}px`);
    petRoot.dataset.petTourSide = position.side;
    dispatchPetMove('moving', step, position);
    const token = state.token;
    state.movementTimer = window.setTimeout(() => {
      state.movementTimer = 0;
      if (!state.active || token !== state.token || state.petTarget !== target) return;
      state.petPhase = 'arrived';
      petRoot.dataset.petTourPhase = 'arrived';
      dispatchPetMove('arrived', step, position);
    }, state.reducedMotion ? 1 : PET_MOVE_MS);
    return true;
  }

  function capturePetOrigin() {
    window.clearTimeout(state.returnTimer);
    state.returnTimer = 0;
    const petRoot = document.getElementById('petAssistant');
    state.petRoot = petRoot || null;
    state.petTarget = null;
    state.petPhase = 'origin';
    if (!petRoot) {
      state.petOrigin = null;
      return false;
    }
    petRoot.classList.remove('is-pet-tour-guide', 'is-pet-tour-returning');
    petRoot.removeAttribute('data-pet-tour-phase');
    petRoot.removeAttribute('data-pet-tour-side');
    petRoot.removeAttribute('data-pet-tour-narrating');
    petRoot.style.removeProperty('--pet-tour-duration');
    petRoot.style.removeProperty('--pet-tour-x');
    petRoot.style.removeProperty('--pet-tour-y');
    const rect = petRoot.getBoundingClientRect?.();
    state.petOrigin = rect ? {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    } : null;
    if (state.petOrigin) {
      petRoot.classList.add('is-pet-tour-guide');
      petRoot.style.setProperty('--pet-tour-x', '0px');
      petRoot.style.setProperty('--pet-tour-y', '0px');
      petRoot.dataset.petTourPhase = 'origin';
    }
    return !!state.petOrigin;
  }

  function returnPetToOrigin(reason = 'completed') {
    clearPetMovementTimer();
    const petRoot = state.petRoot;
    state.petTarget = null;
    if (!petRoot || !state.petOrigin) return false;
    window.clearTimeout(state.returnTimer);
    state.petPhase = 'returning';
    petRoot.classList.add('is-pet-tour-guide', 'is-pet-tour-returning');
    petRoot.dataset.petTourPhase = 'returning';
    petRoot.style.setProperty('--pet-tour-duration', `${state.reducedMotion ? 1 : PET_RETURN_MS}ms`);
    petRoot.style.setProperty('--pet-tour-x', '0px');
    petRoot.style.setProperty('--pet-tour-y', '0px');
    dispatchPetMove('returning', STEPS[state.stepIndex]);
    state.returnTimer = window.setTimeout(() => {
      state.returnTimer = 0;
      state.petPhase = 'origin';
      petRoot.classList.remove('is-pet-tour-guide', 'is-pet-tour-returning');
      petRoot.removeAttribute('data-pet-tour-phase');
      petRoot.removeAttribute('data-pet-tour-side');
      petRoot.removeAttribute('data-pet-tour-narrating');
      petRoot.style.removeProperty('--pet-tour-duration');
      petRoot.style.removeProperty('--pet-tour-x');
      petRoot.style.removeProperty('--pet-tour-y');
      dispatchPetMove('origin', STEPS[state.stepIndex]);
    }, state.reducedMotion ? 1 : PET_RETURN_MS);
    return true;
  }

  async function petClick(target) {
    if (!targetVisible(target)) return false;
    const selector = `#${target.id || ''}`;
    if (!SAFE_CLICK_TARGETS.has(selector)) return false;
    setTarget(target);
    target.classList?.add('is-pet-tour-clicking');
    showClickRipple(target);
    await delay(state.reducedMotion ? 20 : 260);
    if (!state.active || target.disabled) return false;
    target.click();
    window.dispatchEvent(new CustomEvent('fe-monster-pet-tour-click', {
      detail: { selector, step: STEPS[state.stepIndex]?.id || '' }
    }));
    window.setTimeout(() => target.classList?.remove('is-pet-tour-clicking'), state.reducedMotion ? 20 : 420);
    return true;
  }

  async function ensureDiyTargetsVisible() {
    const activeTarget = document.querySelector(STEPS[state.stepIndex]?.target || '');
    if (targetVisible(activeTarget)) return;
    const diy = document.getElementById('diyButton');
    if (targetVisible(diy)) {
      await petClick(diy);
      await delay(state.reducedMotion ? 20 : 280);
    }
  }

  async function prepareStep(step) {
    if (step.id === 'diy') {
      const community = document.getElementById('communityRailButton');
      if (community?.getAttribute?.('aria-expanded') === 'true') {
        await petClick(community);
        await delay(state.reducedMotion ? 20 : 240);
      }
    }
    if (step.prepare === 'diy') await ensureDiyTargetsVisible();
    if (step.prepare === 'settings') {
      const diy = document.getElementById('diyButton');
      if (diy?.getAttribute?.('aria-expanded') === 'true') {
        await petClick(diy);
        await delay(state.reducedMotion ? 20 : 220);
      }
    }
  }

  function dispatchNarration(phase, step, medium = '') {
    state.narrationPhase = phase;
    state.narrationStepId = step?.id || state.narrationStepId || STEPS[state.stepIndex]?.id || '';
    const activeNarration = phase === 'requested' || phase === 'playing';
    if (state.petRoot) {
      if (activeNarration) state.petRoot.dataset.petTourNarrating = 'true';
      else state.petRoot.removeAttribute('data-pet-tour-narrating');
    }
    window.dispatchEvent(new CustomEvent('fe-monster-pet-tour-narration', {
      detail: {
        phase,
        step: state.narrationStepId,
        medium,
        reducedMotion: state.reducedMotion
      }
    }));
    if (['ended', 'cancelled', 'fallback'].includes(phase) && state.resolveNarration) {
      const resolve = state.resolveNarration;
      state.resolveNarration = null;
      resolve({ phase, step: state.narrationStepId, medium });
    }
  }

  function cancelNarration(reason = 'cancelled') {
    const wasActive = !['idle', 'ended', 'cancelled'].includes(state.narrationPhase);
    const cancelledStep = STEPS.find((step) => step.id === state.narrationStepId)
      || STEPS[state.stepIndex];
    state.narrationToken += 1;
    try { state.narrationController?.abort?.(reason); } catch (error) {}
    try { state.narrationHandle?.cancel?.(reason); } catch (error) {}
    if (state.narrationUtterance && window.speechSynthesis?.cancel) {
      try { window.speechSynthesis.cancel(); } catch (error) {}
    }
    state.narrationController = null;
    state.narrationHandle = null;
    state.narrationUtterance = null;
    if (wasActive) dispatchNarration('cancelled', cancelledStep, reason);
    else state.narrationPhase = 'idle';
    return wasActive;
  }

  function beginBrowserNarration(text, step, token) {
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') {
      dispatchNarration('fallback', step, 'text');
      return false;
    }
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.04;
    utterance.pitch = 1.02;
    utterance.onstart = () => {
      if (token !== state.narrationToken) return;
      dispatchNarration('playing', step, 'browser-tts');
      window.FeMonsterPetAssistant?.setState?.('speaking', `正在讲解：${step.title}`);
    };
    utterance.onend = () => {
      if (token !== state.narrationToken) return;
      state.narrationUtterance = null;
      dispatchNarration('ended', step, 'browser-tts');
    };
    utterance.onerror = () => {
      if (token !== state.narrationToken) return;
      state.narrationUtterance = null;
      dispatchNarration('fallback', step, 'text');
    };
    state.narrationUtterance = utterance;
    try {
      window.speechSynthesis.speak(utterance);
      return true;
    } catch (error) {
      state.narrationUtterance = null;
      dispatchNarration('fallback', step, 'text');
      return false;
    }
  }

  function speak(text, step = STEPS[state.stepIndex]) {
    cancelNarration('replaced');
    const pet = window.FeMonsterPetAssistant;
    pet?.setVisible?.(true);
    pet?.setState?.('thinking', '正在带你认识 FE Monster');
    const bubbleShown = pet?.showBubble?.(text, STEP_DISPLAY_MS + 1_000) || false;
    const token = ++state.narrationToken;
    state.narrationStepId = step?.id || '';
    state.narrationDone = new Promise((resolve) => { state.resolveNarration = resolve; });
    state.narrationController = typeof window.AbortController === 'function'
      ? new window.AbortController()
      : null;
    dispatchNarration('requested', step, typeof pet?.narrate === 'function' ? 'pet-tts' : 'browser-tts');
    if (pet?.voicePlaybackEnabled === false) {
      dispatchNarration('fallback', step, 'text-muted');
      return bubbleShown;
    }
    if (typeof pet?.narrate !== 'function') {
      beginBrowserNarration(text, step, token);
      return bubbleShown;
    }
    let result;
    try {
      result = pet.narrate(text, {
        source: 'product-tour',
        stepId: step?.id || '',
        signal: state.narrationController?.signal || null
      });
    } catch (error) {
      beginBrowserNarration(text, step, token);
      return bubbleShown;
    }
    Promise.resolve(result).then((handle) => {
      if (token !== state.narrationToken || !state.active) {
        try { handle?.cancel?.('stale'); } catch (error) {}
        return;
      }
      state.narrationHandle = handle && typeof handle === 'object' ? handle : null;
      let terminalReported = false;
      const started = handle?.started && typeof handle.started.then === 'function'
        ? handle.started
        : Promise.resolve(true);
      started.then((outcome) => {
        if (token !== state.narrationToken || !state.active) return;
        if (outcome?.status === 'fallback') {
          terminalReported = true;
          dispatchNarration('fallback', step, outcome.mode || 'text');
          return;
        }
        if (outcome?.status === 'cancelled') {
          terminalReported = true;
          dispatchNarration('cancelled', step, outcome.reason || 'cancelled');
          return;
        }
        dispatchNarration('playing', step, 'pet-tts');
        pet?.setState?.('speaking', `正在讲解：${step.title}`);
      }).catch(() => {
        if (token === state.narrationToken && state.active) beginBrowserNarration(text, step, token);
      });
      if (handle?.finished && typeof handle.finished.then === 'function') {
        handle.finished.then((outcome) => {
          if (token !== state.narrationToken || !state.active) return;
          state.narrationHandle = null;
          if (outcome?.status === 'fallback') {
            if (!terminalReported) dispatchNarration('fallback', step, outcome.mode || 'text');
            terminalReported = true;
            return;
          }
          if (outcome?.status === 'cancelled') {
            if (!terminalReported) dispatchNarration('cancelled', step, outcome.reason || 'cancelled');
            terminalReported = true;
            return;
          }
          dispatchNarration('ended', step, 'pet-tts');
        }).catch(() => {
          if (token !== state.narrationToken || !state.active) return;
          state.narrationHandle = null;
          dispatchNarration('fallback', step, 'text');
        });
      }
    }).catch(() => {
      if (token === state.narrationToken && state.active) beginBrowserNarration(text, step, token);
    });
    return bubbleShown;
  }

  function scheduleAdvance() {
    clearTimer();
    if (!state.active || !state.auto || state.pointerInside) return;
    const token = state.token;
    const advanceIfCurrent = () => {
      if (!state.active || token !== state.token || state.pointerInside) return;
      state.timer = 0;
      advance('auto');
    };
    const maximumDelay = Math.max(
      1,
      STEP_MAX_NARRATION_WAIT_MS - Math.max(0, Date.now() - state.stepShownAt)
    );
    state.timer = window.setTimeout(advanceIfCurrent, maximumDelay);
    Promise.resolve(state.narrationDone).then(() => {
      if (!state.active || token !== state.token || state.pointerInside) return;
      clearTimer();
      const minimumDisplay = state.reducedMotion ? 2_400 : STEP_DISPLAY_MS;
      const remaining = Math.max(0, minimumDisplay - Math.max(0, Date.now() - state.stepShownAt));
      state.timer = window.setTimeout(advanceIfCurrent, remaining);
    });
  }

  async function showStep(index) {
    if (!state.active) return false;
    const token = ++state.token;
    state.stepIndex = Math.max(0, Math.min(STEPS.length - 1, Number(index) || 0));
    state.stepShownAt = Date.now();
    const step = STEPS[state.stepIndex];
    writeMarker('running', state.stepIndex);
    clearTimer();
    if (state.title) state.title.textContent = step.title;
    if (state.copy) state.copy.textContent = step.text;
    if (state.progress) state.progress.textContent = `${state.stepIndex + 1} / ${STEPS.length}`;
    if (state.next) state.next.textContent = state.stepIndex === STEPS.length - 1 ? '完成' : '下一步';
    await prepareStep(step);
    if (!state.active || token !== state.token) return false;
    let target = document.querySelector(step.target);
    if (target && !targetVisible(target)) {
      target.scrollIntoView?.({
        block: 'center',
        inline: 'center',
        behavior: state.reducedMotion ? 'auto' : 'smooth'
      });
      await delay(state.reducedMotion ? 20 : 300);
      target = document.querySelector(step.target);
    }
    if (!targetVisible(target)) {
      if (state.stepIndex < STEPS.length - 1) return showStep(state.stepIndex + 1);
      finish('completed');
      return false;
    }
    setTarget(target);
    movePetBesideTarget(target, step);
    speak(step.text, step);
    if (step.click) await petClick(target);
    if (!state.active || token !== state.token) return false;
    updateTargetRing();
    scheduleAdvance();
    return true;
  }

  function advance(source = 'manual') {
    if (!state.active) return false;
    if (state.stepIndex >= STEPS.length - 1) {
      finish('completed');
      return true;
    }
    void showStep(state.stepIndex + 1);
    return true;
  }

  function finish(reason = 'completed') {
    if (!state.active) return false;
    const completed = reason === 'completed' || reason === 'skipped';
    clearTimer();
    state.active = false;
    state.token += 1;
    cancelNarration(reason);
    setTarget(null);
    returnPetToOrigin(reason);
    if (state.root) state.root.hidden = true;
    if (state.ring) state.ring.hidden = true;
    if (state.ripple) state.ripple.hidden = true;
    document.documentElement?.removeAttribute?.('data-pet-product-tour');
    if (completed) writeMarker('completed', state.stepIndex);
    window.FeMonsterPetAssistant?.setState?.('idle', completed ? '演示完成' : '演示已暂停');
    if (reason === 'completed') {
      window.FeMonsterPetAssistant?.showBubble?.('转完一圈。剩下的交给好奇心，点到哪儿算哪儿。', 6_000);
    }
    window.dispatchEvent(new CustomEvent('fe-monster-pet-tour-end', {
      detail: { reason, completed, feId: state.feId }
    }));
    return true;
  }

  function start(options = {}) {
    if (!isFullClient() || !createUi()) return false;
    if (!uiIsReady()) {
      window.clearTimeout(state.retryTimer);
      state.retryTimer = window.setTimeout(() => start(options), 800);
      return false;
    }
    clearAutoStartTimers();
    if (state.active) finish('restarted');
    state.feId = normalizedFeId(options.feId || state.profileDetail?.profile?.feId || state.profileDetail?.feId) || 'preview';
    state.reducedMotion = motionReduced();
    state.auto = options.auto !== false;
    const marker = readMarker(state.feId);
    const resumeIndex = options.resume !== false && marker?.status === 'running'
      ? Number(marker.step) || 0
      : 0;
    state.active = true;
    state.pointerInside = false;
    state.stepIndex = Math.max(0, Math.min(STEPS.length - 1, resumeIndex));
    capturePetOrigin();
    state.root.hidden = false;
    state.root.dataset.motion = state.reducedMotion ? 'reduced' : 'full';
    document.documentElement?.setAttribute?.('data-pet-product-tour', 'active');
    window.dispatchEvent(new CustomEvent('fe-monster-pet-tour-start', {
      detail: { feId: state.feId, auto: state.auto, step: state.stepIndex }
    }));
    void showStep(state.stepIndex);
    return true;
  }

  function replay() {
    return start({
      auto: true,
      resume: false,
      feId: state.profileDetail?.profile?.feId || state.feId || 'preview'
    });
  }

  function queueAutoStart(detail) {
    state.profileDetail = detail;
    if (!shouldAutoStart(detail) || state.active || state.autoStartTimer) return false;
    state.autoStartTimer = window.setTimeout(() => {
      state.autoStartTimer = 0;
      start({ auto: true, resume: true, feId: detail.profile?.feId || detail.feId });
    }, AUTO_START_DELAY_MS);
    return true;
  }

  function handleProfile(event) {
    const detail = event?.detail || {};
    state.profileDetail = detail;
    queueAutoStart(detail);
  }

  function bindReplayButton() {
    const replayButton = document.getElementById('petProductTourReplay');
    if (!replayButton || replayButton.dataset.petTourBound === 'true') return;
    replayButton.dataset.petTourBound = 'true';
    replayButton.addEventListener('click', replay);
  }

  function initialize() {
    createUi();
    bindReplayButton();
    const snapshot = window.__feMonsterCommunityProfileSnapshot;
    if (snapshot) queueAutoStart(snapshot);
  }

  window.addEventListener('fe-monster-community-profile', handleProfile);
  window.addEventListener('keydown', (event) => {
    if (!state.active || event.defaultPrevented) return;
    if (event.key === 'Escape') finish('skipped');
    if (event.key === 'ArrowRight' && !event.target?.matches?.('input, textarea, select')) advance('manual');
  });
  document.addEventListener('visibilitychange', () => {
    if (!state.active) return;
    if (document.hidden) clearTimer();
    else scheduleAdvance();
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();

  window.FeMonsterProductTour = Object.freeze({
    steps: STEPS,
    storageKey,
    shouldAutoStart,
    start,
    stop: finish,
    replay,
    next: () => advance('manual'),
    skip: () => finish('skipped'),
    receiveProfile: queueAutoStart,
    get active() { return state.active; },
    snapshot: () => Object.freeze({
      active: state.active,
      auto: state.auto,
      step: state.stepIndex,
      stepId: STEPS[state.stepIndex]?.id || '',
      feId: state.feId,
      reducedMotion: state.reducedMotion,
      pet: Object.freeze({
        phase: state.petPhase,
        target: STEPS[state.stepIndex]?.target || '',
        side: state.petRoot?.dataset?.petTourSide || ''
      }),
      narration: Object.freeze({
        phase: state.narrationPhase,
        stepId: state.narrationStepId
      })
    })
  });
})();
