(function identityCardRuntime() {
  'use strict';

  const ACTIVE_PROVIDER_KEY = 'fe-monster-active-provider-v1';
  const MUTE_KEY = 'fe-monster-identity-card-muted-v1';
  const FALLBACK_CARD_ID = 'fe-gold-classic';
  const VALID_MATERIALS = new Set([
    'gold', 'polished-gold', 'brushed-gold', 'rose-gold', 'black-gold',
    'silver', 'titanium', 'obsidian', 'ceramic'
  ]);
  const VALID_FINISHES = new Set(['polished', 'brushed', 'hammered', 'satin', 'mirror']);
  const DEFAULT_ENTRANCES = Object.freeze({
    'corner-fall-float': Object.freeze({ preset: 'corner-fall-float', durationMs: 3600, impactAt: 0.953 }),
    'rise-flip': Object.freeze({ preset: 'rise-flip', durationMs: 1080, impactAt: 0.58 }),
    'soft-reveal': Object.freeze({ preset: 'soft-reveal', durationMs: 620, impactAt: 0.46 })
  });
  const animationPresets = new Map(Object.entries(DEFAULT_ENTRANCES));
  const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)') || {
    matches: false,
    addEventListener() {}
  };

  const byId = (id) => document.getElementById(id);
  const elements = {
    trigger: byId('communityIdentityCardButton'),
    menu: byId('communityIdentityCardMenu'),
    preview: byId('feIdentityCardPreview'),
    dialog: byId('feIdentityCardDialog'),
    title: byId('feIdentityCardTitle'),
    close: byId('feIdentityCardClose'),
    sound: byId('feIdentityCardSound'),
    stage: byId('feIdentityCardStage'),
    shell: byId('feIdentityCardShell'),
    card: byId('feIdentityCard'),
    front: byId('feIdentityCardFront'),
    back: byId('feIdentityCardBack'),
    feId: byId('feIdentityCardFeId'),
    nickname: byId('feIdentityCardNickname'),
    flip: byId('feIdentityCardFlip'),
    edit: byId('feIdentityCardEdit'),
    replay: byId('feIdentityCardReplay'),
    nicknameForm: byId('feIdentityCardNicknameForm'),
    nicknameInput: byId('feIdentityCardNicknameInput'),
    collection: byId('feIdentityCardCollection'),
    status: byId('feIdentityCardStatus'),
    communityFeId: byId('communityFeId'),
    communityName: byId('communityName')
  };

  if (!elements.trigger || !elements.dialog || !elements.card) return;

  const state = {
    provider: loadProvider(),
    profile: { feId: '', username: '' },
    cards: [],
    equippedId: FALLBACK_CARD_ID,
    currentCard: null,
    previewCardId: '',
    previewAnimationId: '',
    externalView: null,
    open: false,
    menuOpen: false,
    face: 'front',
    muted: readBoolean(MUTE_KEY),
    requestGeneration: 0,
    equipPending: '',
    animationTimer: 0,
    impactTimer: 0,
    motionAnimation: null,
    shadowAnimation: null,
    lastFocus: null,
    audioContext: null,
    profileEventSeen: false,
    inventoryHydrated: false,
    knownCardIds: new Set()
  };

  function safeText(value, fallback = '') {
    if (value == null) return fallback;
    const text = String(value).replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return text || fallback;
  }

  function bounded(value, fallback = '', max = 80) {
    return safeText(value, fallback).slice(0, Math.max(1, max));
  }

  function readBoolean(key) {
    try {
      return window.localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }

  function writeBoolean(key, value) {
    try {
      window.localStorage.setItem(key, value ? '1' : '0');
    } catch {}
  }

  function loadProvider() {
    try {
      return bounded(window.localStorage.getItem(ACTIVE_PROVIDER_KEY), 'netease', 24).toLowerCase();
    } catch {
      return 'netease';
    }
  }

  function normalizeProvider(value) {
    const source = value && typeof value === 'object' ? value.id || value.provider : value;
    return bounded(source, loadProvider(), 24).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'netease';
  }

  function normalizeFeId(value) {
    const candidate = bounded(value, '', 32);
    return candidate && candidate !== '--------' && !/离线|登录|失败/.test(candidate) ? candidate : '';
  }

  function validHexColor(value, fallback) {
    const candidate = safeText(value, '');
    return /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(candidate) ? candidate : fallback;
  }

  function boundedNumber(value, fallback, minimum, maximum) {
    const candidate = Number(value);
    return Number.isFinite(candidate)
      ? Math.min(maximum, Math.max(minimum, candidate))
      : fallback;
  }

  function normalizeEntrance(value) {
    const source = value && typeof value === 'object'
      ? value.id || value.preset || value.entrance
      : value;
    const id = bounded(source, 'corner-fall-float', 48).toLowerCase();
    const registered = animationPresets.get(id);
    if (registered) return { id, ...registered };
    return { id: 'corner-fall-float', ...DEFAULT_ENTRANCES['corner-fall-float'] };
  }

  function normalizeCard(value = {}, index = 0) {
    const source = value.card && typeof value.card === 'object' ? { ...value.card, ...value } : value;
    const presentation = source.presentation && typeof source.presentation === 'object'
      ? source.presentation
      : source.style && typeof source.style === 'object'
        ? source.style
        : {};
    const colors = presentation.colors && typeof presentation.colors === 'object'
      ? presentation.colors
      : source.colors && typeof source.colors === 'object'
        ? source.colors
        : {};
    const materialCandidate = bounded(presentation.material || source.material, 'gold', 28).toLowerCase();
    const finishCandidate = bounded(presentation.finish || source.finish, 'polished', 28).toLowerCase();
    const entrance = normalizeEntrance(
      presentation.entrance
      || presentation.entranceAnimation
      || source.entrance
      || source.entranceAnimationId
      || source.animation?.entrance
    );
    const nicknamePolicy = bounded(
      source.nicknamePolicy || presentation.nicknamePolicy,
      '',
      20
    ).toLowerCase();
    const issuedByServer = source.issuedByServer === true
      || source.serverIssued === true
      || source.deliverySource === 'server';
    const nicknameEditable = source.nicknameEditable === true
      ? true
      : source.nicknameEditable === false
        ? false
        : !issuedByServer && !['locked', 'fixed', 'server'].includes(nicknamePolicy);
    return {
      id: bounded(source.id || source.cardId, `${FALLBACK_CARD_ID}-${index}`, 64),
      name: bounded(source.name || source.title || source.label, index ? `身份卡 ${index + 1}` : '黄金身份卡', 48),
      material: VALID_MATERIALS.has(materialCandidate) ? materialCandidate : 'gold',
      finish: VALID_FINISHES.has(finishCandidate) ? finishCandidate : 'polished',
      baseColor: validHexColor(
        colors.base || colors.primary || presentation.baseColor || presentation.primaryColor || source.baseColor || source.primaryColor,
        ''
      ),
      highlightColor: validHexColor(
        colors.highlight || colors.accent || presentation.highlightColor || presentation.accentColor || source.highlightColor || source.accentColor,
        ''
      ),
      deepColor: validHexColor(
        colors.deep || colors.secondary || presentation.deepColor || presentation.secondaryColor || source.deepColor || source.secondaryColor,
        ''
      ),
      inkColor: validHexColor(
        colors.ink || colors.text || presentation.inkColor || presentation.textColor || source.inkColor || source.textColor,
        ''
      ),
      frontColor: validHexColor(source.frontColor || presentation.frontColor, ''),
      backColor: validHexColor(source.backColor || presentation.backColor, ''),
      borderColor: validHexColor(source.borderColor || presentation.borderColor, ''),
      metalness: boundedNumber(source.metalness ?? presentation.metalness, 0.92, 0, 1),
      roughness: boundedNumber(source.roughness ?? presentation.roughness, 0.2, 0, 1),
      bevel: boundedNumber(source.bevel ?? presentation.bevel, 10, 0, 24),
      sweepIntensity: boundedNumber(source.sweepIntensity ?? presentation.sweepIntensity, 0.9, 0, 2),
      engravingDepth: boundedNumber(source.engravingDepth ?? presentation.engravingDepth, 0.65, 0, 1),
      entrance,
      claimAnimationId: bounded(source.claimAnimationId || source.animation?.claim, '', 64),
      displayAnimationId: bounded(source.displayAnimationId || source.animation?.display, '', 64),
      mailAnimationId: bounded(source.mailAnimationId || source.animation?.mail, '', 64),
      issuedByServer,
      nicknamePolicy: nicknameEditable ? 'profile' : 'locked',
      nicknameEditable,
      engravedNickname: bounded(
        source.engravedNickname || source.cardholderName || source.fixedNickname,
        '',
        48
      ),
      owned: source.owned !== false,
      equipped: source.equipped === true || source.isEquipped === true
    };
  }

  function fallbackCard() {
    return normalizeCard({
      id: FALLBACK_CARD_ID,
      name: '黄金身份卡',
      material: 'gold',
      finish: 'polished',
      owned: true,
      equipped: true,
      entrance: 'corner-fall-float'
    });
  }

  function queryString(values) {
    const params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      const text = safeText(value, '');
      if (text) params.set(key, text);
    });
    return params.toString();
  }

  async function apiJson(path, options = {}) {
    const response = await window.fetch(path, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(bounded(payload.error || payload.message, `社区请求失败 (${response.status})`, 160));
    }
    return payload;
  }

  function setStatus(message, error = false) {
    if (!elements.status) return;
    elements.status.textContent = bounded(message, '', 180);
    elements.status.classList.toggle('is-error', error);
  }

  function displayNickname(card = state.currentCard) {
    if (card?.engravedNickname) return bounded(card.engravedNickname, 'FE 用户', 48);
    const profile = state.externalView?.owner || state.profile;
    return bounded(profile.username || profile.nickname, 'FE 用户', 32);
  }

  function canEditNickname(card = state.currentCard) {
    return Boolean(!state.externalView && card && card.nicknameEditable !== false && card.nicknamePolicy !== 'locked');
  }

  function setNicknameEditorOpen(open) {
    const nextOpen = Boolean(open && elements.nicknameForm && canEditNickname());
    if (elements.nicknameForm) elements.nicknameForm.hidden = !nextOpen;
    elements.stage?.classList.toggle('is-editing', nextOpen);
    return nextOpen;
  }

  function setCustomColor(name, value) {
    if (!elements.front) return;
    if (value) elements.front.style.setProperty(name, value);
    else elements.front.style.removeProperty(name);
  }

  function setBackColor(name, value) {
    if (!elements.back) return;
    if (value) elements.back.style.setProperty(name, value);
    else elements.back.style.removeProperty(name);
  }

  function setCardMaterialValue(name, value) {
    if (!elements.card) return;
    if (value !== '' && value != null) elements.card.style.setProperty(name, String(value));
    else elements.card.style.removeProperty(name);
  }

  function applyCard(card = state.currentCard || fallbackCard()) {
    state.currentCard = card;
    const external = state.externalView;
    const visibleProfile = external?.owner || state.profile;
    elements.card.dataset.cardId = card.id;
    elements.card.dataset.material = card.material;
    elements.card.dataset.finish = card.finish;
    elements.card.dataset.nicknameEditable = String(canEditNickname(card));
    setCardMaterialValue('--card-material', card.material);
    setCardMaterialValue('--card-finish', card.finish);
    setCardMaterialValue('--card-primary', card.baseColor);
    setCardMaterialValue('--card-secondary', card.deepColor);
    setCardMaterialValue('--card-accent', card.highlightColor);
    setCardMaterialValue('--card-front-color', card.frontColor);
    setCardMaterialValue('--card-back-color', card.backColor);
    setCardMaterialValue('--card-border-color', card.borderColor);
    setCardMaterialValue('--card-metalness', card.metalness);
    setCardMaterialValue('--card-roughness', card.roughness);
    setCardMaterialValue('--card-bevel', card.bevel);
    setCardMaterialValue('--card-sweep-intensity', card.sweepIntensity);
    setCardMaterialValue('--card-engraving-depth', card.engravingDepth);
    elements.card.style.setProperty('--card-front', card.frontColor || card.baseColor || '#cf9b31');
    elements.card.style.setProperty('--card-back-base', card.backColor || card.deepColor || card.baseColor || '#6f4308');
    elements.card.style.setProperty('--card-border', card.borderColor || card.highlightColor || '#ffeeb9');
    elements.card.style.setProperty('--card-metal-alpha', (0.24 + card.metalness * 0.5).toFixed(3));
    elements.card.style.setProperty('--card-roughness-alpha', (0.025 + card.roughness * 0.13).toFixed(3));
    elements.card.style.setProperty('--card-sweep-alpha', (0.14 + Math.min(1, card.sweepIntensity / 2) * 0.7).toFixed(3));
    elements.card.style.setProperty('--card-radius', `${(16 + card.bevel * 0.48).toFixed(2)}px`);
    elements.card.style.setProperty('--card-engraving-offset', `${(0.35 + card.engravingDepth * 0.95).toFixed(2)}px`);
    if (!external) {
      elements.trigger.dataset.material = card.material;
      elements.trigger.style.setProperty('--community-card-primary', card.frontColor || card.baseColor || '#cf9b31');
      elements.trigger.style.setProperty('--community-card-secondary', card.backColor || card.deepColor || '#6f4308');
      elements.trigger.style.setProperty('--community-card-accent', card.borderColor || card.highlightColor || '#ffeeb9');
      elements.trigger.title = `身份卡：${card.name}`;
      elements.trigger.setAttribute('aria-label', `打开身份卡列表，当前为${card.name}`);
    }
    elements.stage.dataset.entrance = card.entrance.preset;
    setCustomColor('--card-base', card.baseColor);
    setCustomColor('--card-highlight', card.highlightColor);
    setCustomColor('--card-deep', card.deepColor);
    setCustomColor('--card-ink', card.inkColor);
    setBackColor('--card-back-base', card.backColor || card.deepColor || card.baseColor);
    setBackColor('--card-back-highlight', card.highlightColor);
    setBackColor('--card-back-deep', card.deepColor);
    elements.feId.textContent = normalizeFeId(visibleProfile.feId) || '--------';
    elements.nickname.textContent = displayNickname(card);
    const nicknameEditable = canEditNickname(card);
    elements.nickname.setAttribute('aria-disabled', String(!nicknameEditable));
    elements.nickname.tabIndex = nicknameEditable ? 0 : -1;
    elements.nickname.title = nicknameEditable ? '点击编辑昵称' : '服务器专属刻字，不可修改';
    elements.nickname.setAttribute('aria-label', nicknameEditable ? '编辑身份卡昵称' : '服务器专属身份卡昵称');
    if (elements.edit) {
      elements.edit.hidden = !nicknameEditable;
      elements.edit.disabled = !nicknameEditable;
    }
    if (!nicknameEditable) setNicknameEditorOpen(false);
    if (elements.nicknameInput && document.activeElement !== elements.nicknameInput) {
      elements.nicknameInput.value = displayNickname(card) === 'FE 用户' ? '' : displayNickname(card);
    }
    elements.dialog.style.setProperty('--fe-card-accent', card.highlightColor || '#ffe6a2');
    if (elements.title) {
      elements.title.textContent = external ? `${displayNickname(card)} 的身份卡` : '我的身份卡';
    }
  }

  function renderCollection() {
    if (!elements.collection) return;
    elements.collection.replaceChildren();
    state.cards.forEach((card) => {
      if (!card.owned) return;
      const button = document.createElement('button');
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      const meta = document.createElement('small');
      button.type = 'button';
      button.role = 'option';
      button.dataset.identityCardId = card.id;
      button.dataset.material = card.material;
      button.className = card.id === state.equippedId ? 'is-equipped' : '';
      button.setAttribute('aria-selected', String(card.id === state.equippedId));
      button.setAttribute('aria-label', `${card.name}，${card.id === state.equippedId ? '正在使用' : '点击替换'}`);
      button.title = `${card.name} · ${card.id === state.equippedId ? '正在使用' : materialLabel(card.material)}`;
      button.disabled = Boolean(state.equipPending);
      title.textContent = card.name;
      meta.textContent = card.id === state.equippedId
        ? (card.nicknameEditable ? '正在使用' : '正在使用 · 固定刻字')
        : `${materialLabel(card.material)} · ${card.nicknameEditable ? '点击替换' : '固定刻字'}`;
      copy.append(title, meta);
      button.append(copy);
      button.addEventListener('click', () => equip(card.id).catch(() => {}));
      elements.collection.append(button);
    });
  }

  function materialLabel(material) {
    return {
      gold: '黄金',
      'brushed-gold': '拉丝金',
      'rose-gold': '玫瑰金',
      'black-gold': '黑金',
      silver: '银',
      titanium: '钛金属',
      obsidian: '黑曜石',
      ceramic: '陶瓷',
      'polished-gold': '镜面黄金'
    }[material] || '金属';
  }

  function render() {
    if (state.externalView?.card) {
      applyCard(state.externalView.card);
      renderCollection();
      return;
    }
    if (!state.cards.length) state.cards = [fallbackCard()];
    let current = state.previewCardId
      ? state.cards.find((card) => card.id === state.previewCardId)
      : null;
    if (!current) current = state.cards.find((card) => card.id === state.equippedId);
    if (!current) current = state.cards.find((card) => card.equipped) || state.cards[0];
    state.equippedId = current.id;
    applyCard(current);
    renderCollection();
    const hasIdentity = Boolean(normalizeFeId(state.profile.feId));
    elements.trigger.setAttribute('aria-disabled', String(!hasIdentity));
  }

  function normalizeInventory(payload = {}) {
    const inventory = payload.inventory && typeof payload.inventory === 'object' ? payload.inventory : {};
    const ownedIds = new Set([
      ...(Array.isArray(payload.ownedCardIds) ? payload.ownedCardIds : []),
      ...(Array.isArray(inventory.ownedCardIds) ? inventory.ownedCardIds : []),
      ...(Array.isArray(payload.profile?.identityCardIds) ? payload.profile.identityCardIds : [])
    ].map((id) => safeText(id, '')));
    let rawCards = payload.cards
      || payload.identityCards
      || payload.owned
      || inventory.cards
      || payload.profile?.identityCards
      || [];
    if ((!Array.isArray(rawCards) || !rawCards.length) && Array.isArray(payload.catalog)) {
      rawCards = payload.catalog.filter((item) => !ownedIds.size || ownedIds.has(safeText(item?.id || item?.cardId, '')));
    }
    const cards = (Array.isArray(rawCards) ? rawCards : [])
      .map(normalizeCard)
      .filter((card) => card.owned || ownedIds.has(card.id));
    if (!cards.length) cards.push(fallbackCard());
    const equipped = bounded(
      payload.equippedIdentityCardId
      || payload.equippedCardId
      || payload.equippedId
      || inventory.equippedIdentityCardId
      || inventory.equippedCardId
      || payload.profile?.equippedIdentityCardId
      || cards.find((card) => card.equipped)?.id,
      cards[0].id,
      64
    );
    return { cards, equipped };
  }

  function hydrateAnimationCatalog(payload = {}) {
    const source = payload.animationCatalog || payload.animations || payload.identityCardAnimations || [];
    const entries = Array.isArray(source)
      ? source.map((item) => [item?.id, item])
      : source && typeof source === 'object'
        ? Object.entries(source)
        : [];
    entries.forEach(([id, configuration]) => registerAnimationPreset(id, configuration || {}));
  }

  function announceNewCards(cards, suppressAnnouncement = false) {
    const nextIds = new Set(cards.map((card) => card.id));
    if (state.inventoryHydrated && suppressAnnouncement !== true) {
      cards.forEach((card) => {
        if (state.knownCardIds.has(card.id)) return;
        window.dispatchEvent(new CustomEvent('fe-monster-reward-animation', {
          detail: {
            phase: 'claim',
            itemType: 'identity-card',
            itemId: card.id,
            animationId: card.claimAnimationId || 'identity-card-gold-reveal',
            card: { ...card }
          }
        }));
      });
    }
    state.knownCardIds = nextIds;
    state.inventoryHydrated = true;
  }

  async function refresh(options = {}) {
    const suppressAnnouncement = options && typeof options === 'object'
      && !Array.isArray(options)
      && options.suppressAnnouncement === true;
    const feId = normalizeFeId(state.profile.feId);
    if (!feId) {
      state.cards = [fallbackCard()];
      state.equippedId = FALLBACK_CARD_ID;
      render();
      setStatus('登录社区后显示专属身份卡');
      return { ok: false, offline: true, cards: state.cards };
    }
    const generation = ++state.requestGeneration;
    setStatus('正在同步已领取身份卡…');
    try {
      const payload = await apiJson(`/api/community/identity-cards?${queryString({
        feId,
        provider: state.provider
      })}`);
      if (generation !== state.requestGeneration) return payload;
      if (payload.profile && typeof payload.profile === 'object') state.profile = { ...state.profile, ...payload.profile };
      state.profile = {
        ...state.profile,
        feId: normalizeFeId(payload.feId) || state.profile.feId,
        username: bounded(payload.nickname, state.profile.username, 32)
      };
      hydrateAnimationCatalog(payload);
      const inventory = normalizeInventory(payload);
      announceNewCards(inventory.cards, suppressAnnouncement);
      state.cards = inventory.cards;
      state.equippedId = inventory.equipped;
      render();
      setStatus(`${state.cards.length} 张身份卡 · ${state.currentCard.name}`);
      return payload;
    } catch (error) {
      if (generation !== state.requestGeneration) throw error;
      if (!state.cards.length) state.cards = [fallbackCard()];
      render();
      setStatus('服务器暂不可用，先展示本机身份卡', true);
      throw error;
    }
  }

  function getAudioContext() {
    if (state.audioContext && state.audioContext.state !== 'closed') return state.audioContext;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    try {
      state.audioContext = new AudioContext();
      return state.audioContext;
    } catch {
      return null;
    }
  }

  function soundAllowed() {
    return !state.muted && !motionPreference.matches;
  }

  function scheduleTone(context, at, frequency, duration, gainValue, type = 'sine', destination = context.destination, options = {}) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const panner = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.detune?.setValueAtTime?.(Number(options.detune) || 0, at);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(70, frequency * Math.min(1.02, Math.max(0.92, Number(options.frequencyRatio) || 0.995))),
      at + duration
    );
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(gainValue, at + Math.min(0.009, Math.max(0.002, Number(options.attack) || 0.0035)));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(gain);
    if (panner) {
      panner.pan.setValueAtTime(Math.min(1, Math.max(-1, Number(options.pan) || 0)), at);
      gain.connect(panner).connect(destination);
    } else {
      gain.connect(destination);
    }
    oscillator.start(at);
    oscillator.stop(at + duration + 0.02);
  }

  function metalBus(context, at, level = 1) {
    const output = context.createGain();
    output.gain.setValueAtTime(Math.max(0.05, Math.min(1, level)), at);
    if (typeof context.createDynamicsCompressor !== 'function') {
      output.connect(context.destination);
      return output;
    }
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-22, at);
    compressor.knee.setValueAtTime(8, at);
    compressor.ratio.setValueAtTime(3, at);
    compressor.attack.setValueAtTime(0.002, at);
    compressor.release.setValueAtTime(0.12, at);
    output.connect(compressor).connect(context.destination);
    return output;
  }

  const SOUND_CUE_PROFILES = Object.freeze({
    'crisp-metal': Object.freeze({
      level: 1,
      spinFrequencies: [1318.5, 1977.8, 2966.7],
      spinDurations: [0.22, 0.192, 0.164],
      spinGains: [0.018, 0.0154, 0.0128],
      spinSpacing: 0.058,
      spinAttack: 0.0035,
      impactFrequencies: [740, 1768, 2819, 4277],
      impactDurations: [0.34, 0.29, 0.23, 0.16],
      impactGains: [0.030, 0.024, 0.017, 0.010],
      impactAttack: 0.0024,
      bodyFrequency: 228,
      bodyDuration: 0.11,
      bodyGain: 0.025,
      noiseFrequency: 3680,
      noiseGain: 0.027,
      noiseDuration: 0.055
    }),
    'soft-metal': Object.freeze({
      level: 0.56,
      spinFrequencies: [1174.66, 1760, 2637.02],
      spinDurations: [0.28, 0.245, 0.21],
      spinGains: [0.014, 0.011, 0.0075],
      spinSpacing: 0.072,
      spinAttack: 0.005,
      impactFrequencies: [659.25, 1396.91, 2217.46, 3322.44],
      impactDurations: [0.30, 0.25, 0.20, 0.14],
      impactGains: [0.022, 0.016, 0.011, 0.0065],
      impactAttack: 0.0045,
      bodyFrequency: 196,
      bodyDuration: 0.13,
      bodyGain: 0.018,
      noiseFrequency: 3000,
      noiseGain: 0.015,
      noiseDuration: 0.065
    }),
    'noble-metal': Object.freeze({
      level: 0.76,
      spinFrequencies: [1108.73, 1661.22, 2489.02],
      spinDurations: [0.30, 0.25, 0.21],
      spinGains: [0.016, 0.012, 0.008],
      spinSpacing: 0.064,
      spinAttack: 0.0045,
      impactFrequencies: [587.33, 1480, 2349.32, 3520],
      impactDurations: [0.42, 0.34, 0.27, 0.19],
      impactGains: [0.026, 0.019, 0.013, 0.0075],
      impactAttack: 0.0038,
      bodyFrequency: 220,
      bodyDuration: 0.16,
      bodyGain: 0.020,
      noiseFrequency: 3420,
      noiseGain: 0.018,
      noiseDuration: 0.07
    }),
    'royal-chime': Object.freeze({
      level: 0.72,
      spinFrequencies: [1046.5, 1567.98, 2349.32, 3135.96],
      spinDurations: [0.34, 0.30, 0.25, 0.20],
      spinGains: [0.015, 0.012, 0.009, 0.005],
      spinSpacing: 0.052,
      spinAttack: 0.0055,
      impactFrequencies: [523.25, 1318.51, 2093, 3135.96],
      impactDurations: [0.48, 0.40, 0.31, 0.22],
      impactGains: [0.026, 0.019, 0.012, 0.006],
      impactAttack: 0.005,
      bodyFrequency: 261.63,
      bodyDuration: 0.18,
      bodyGain: 0.018,
      noiseFrequency: 3200,
      noiseGain: 0.013,
      noiseDuration: 0.075
    }),
    'platinum-ring': Object.freeze({
      level: 0.64,
      spinFrequencies: [1479.98, 2217.46, 3322.44],
      spinDurations: [0.24, 0.21, 0.17],
      spinGains: [0.014, 0.010, 0.006],
      spinSpacing: 0.046,
      spinAttack: 0.003,
      impactFrequencies: [880, 2093, 3322.44, 4698.64],
      impactDurations: [0.31, 0.27, 0.21, 0.14],
      impactGains: [0.023, 0.016, 0.010, 0.005],
      impactAttack: 0.0028,
      bodyFrequency: 293.66,
      bodyDuration: 0.12,
      bodyGain: 0.016,
      noiseFrequency: 4150,
      noiseGain: 0.012,
      noiseDuration: 0.048
    })
  });

  function soundCueProfile(soundCue) {
    const cue = bounded(soundCue, 'crisp-metal', 32).toLowerCase();
    const profile = SOUND_CUE_PROFILES[cue] || SOUND_CUE_PROFILES['crisp-metal'];
    return cue === 'none' ? { ...profile, level: 0 } : profile;
  }

  function soundCueScale(soundCue) {
    return soundCueProfile(soundCue).level;
  }

  function playSpinCue(soundCue = 'crisp-metal') {
    const profile = soundCueProfile(soundCue);
    const scale = soundCueScale(soundCue);
    if (!soundAllowed() || !scale) return;
    const context = getAudioContext();
    if (!context) return;
    context.resume?.().catch(() => {});
    const now = context.currentTime + 0.018;
    const bus = metalBus(context, now, scale);
    profile.spinFrequencies.forEach((frequency, index) => {
      scheduleTone(context, now + index * profile.spinSpacing, frequency, profile.spinDurations[index], profile.spinGains[index], 'sine', bus, {
        pan: [-0.24, 0.18, -0.08][index],
        detune: [0, 4, -3][index],
        frequencyRatio: 0.997,
        attack: profile.spinAttack
      });
    });
  }

  function playImpactCue(soundCue = 'crisp-metal', recontactDelay = 0) {
    const profile = soundCueProfile(soundCue);
    const scale = soundCueScale(soundCue);
    if (!soundAllowed() || !scale) return;
    const context = getAudioContext();
    if (!context) return;
    context.resume?.().catch(() => {});
    const now = context.currentTime + 0.006;
    const bus = metalBus(context, now, scale);
    profile.impactFrequencies.forEach((frequency, index) => {
      scheduleTone(context, now + index * 0.0018, frequency, profile.impactDurations[index], profile.impactGains[index], index ? 'sine' : 'triangle', bus, {
        pan: [-0.06, 0.12, -0.15, 0.18][index],
        detune: [0, 3, -4, 2][index],
        frequencyRatio: index ? 0.998 : 0.982,
        attack: profile.impactAttack
      });
    });
    scheduleTone(context, now, profile.bodyFrequency, profile.bodyDuration, profile.bodyGain, 'triangle', bus, {
      frequencyRatio: 0.95,
      attack: Math.min(0.004, profile.impactAttack)
    });
    if (recontactDelay > 0) {
      const recontactAt = now + recontactDelay;
      scheduleTone(context, recontactAt, profile.impactFrequencies[1] * 1.008, Math.min(0.16, profile.impactDurations[1] * 0.52), profile.impactGains[1] * 0.34, 'sine', bus, {
        pan: 0.08,
        detune: -2,
        frequencyRatio: 0.996,
        attack: Math.min(0.0028, profile.impactAttack)
      });
      scheduleTone(context, recontactAt + 0.0015, profile.bodyFrequency * 2.11, Math.min(0.12, profile.bodyDuration), profile.bodyGain * 0.26, 'triangle', bus, {
        pan: -0.05,
        frequencyRatio: 0.97,
        attack: Math.min(0.0024, profile.impactAttack)
      });
    }
    if (!context.createBuffer || !context.createBufferSource) return;
    const length = Math.max(1, Math.floor(context.sampleRate * Math.max(0.06, profile.noiseDuration + 0.015)));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      const envelope = Math.pow(1 - index / length, 5);
      samples[index] = (Math.random() * 2 - 1) * envelope;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = profile.noiseFrequency;
    filter.Q.value = 1.8;
    gain.gain.setValueAtTime(profile.noiseGain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.noiseDuration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(bus);
    source.start(now);
  }

  function playCornerContactCue(soundCue = 'crisp-metal') {
    const profile = soundCueProfile(soundCue);
    const scale = soundCueScale(soundCue);
    if (!soundAllowed() || !scale) return;
    const context = getAudioContext();
    if (!context) return;
    context.resume?.().catch(() => {});
    const now = context.currentTime + 0.006;
    const bus = metalBus(context, now, scale * 0.56);
    scheduleTone(context, now, profile.impactFrequencies[2] * 1.035, 0.09, profile.impactGains[2] * 0.42, 'sine', bus, {
      pan: -0.22,
      detune: 5,
      frequencyRatio: 0.996,
      attack: 0.002
    });
    scheduleTone(context, now + 0.002, profile.bodyFrequency * 1.72, 0.055, profile.bodyGain * 0.20, 'triangle', bus, {
      pan: -0.12,
      frequencyRatio: 0.982,
      attack: 0.0018
    });
  }

  function stopCornerFallAnimations() {
    state.motionAnimation?.cancel();
    state.shadowAnimation?.cancel();
    state.motionAnimation = null;
    state.shadowAnimation = null;
  }

  function clearAnimationTimers() {
    window.clearTimeout(state.animationTimer);
    window.clearTimeout(state.impactTimer);
    state.animationTimer = 0;
    state.impactTimer = 0;
    stopCornerFallAnimations();
  }

  function cornerFallMotion(durationMs) {
    const totalMs = Math.max(3400, Math.min(4600, Number(durationMs) || 3600));
    const ringMs = Math.min(170, totalMs * 0.115);
    const impactMs = totalMs - ringMs;
    const criticalMs = impactMs * 0.59;
    const criticalOffset = criticalMs / totalMs;
    const impactOffset = impactMs / totalMs;
    const fallSeconds = (impactMs - criticalMs) / 1000;
    const startAngleDeg = 90;
    const criticalAngleDeg = 89.4;
    const criticalAngle = criticalAngleDeg * Math.PI / 180;
    const initialVelocity = -0.105;
    const fallSteps = 720;
    const dt = fallSeconds / fallSteps;
    const floorPitchDeg = 78;
    const balanceRollDeg = -Math.atan(1.586) * 180 / Math.PI;
    const initialSpinAngle = -balanceRollDeg;
    const spinDecay = 0.78;
    const spinDegrees = 4 * 360;
    const impactSeconds = impactMs / 1000;
    const spinNormalization = 1 - Math.exp(-spinDecay * impactSeconds);
    const initialSpinSpeed = spinDegrees * spinDecay / spinNormalization;

    const spinPose = (timeSeconds) => ({
      angle: initialSpinAngle
        - spinDegrees * (1 - Math.exp(-spinDecay * timeSeconds)) / spinNormalization,
      speed: initialSpinSpeed * Math.exp(-spinDecay * timeSeconds)
    });

    const frameFor = (timeMs, angleDeg, fallSpeed) => {
      const spin = spinPose(Math.min(impactSeconds, timeMs / 1000));
      return {
        offset: timeMs / totalMs,
        transform: `translate3d(0, 8vh, 0) rotateX(${floorPitchDeg}deg) rotateZ(${spin.angle}deg) rotateX(${-angleDeg}deg) rotateZ(${balanceRollDeg}deg) scale(0.98)`,
        '--fe-card-angle': `${angleDeg}deg`,
        '--fe-card-angular-speed': `${fallSpeed}deg`,
        '--fe-card-spin-speed': `${spin.speed}deg`,
        '--fe-card-spin-angle': `${spin.angle}deg`
      };
    };

    const terminalAngle = (gravityTorque) => {
      let angle = criticalAngle;
      let velocity = initialVelocity;
      for (let index = 0; index < fallSteps; index += 1) {
        velocity -= gravityTorque * Math.cos(angle) * dt;
        angle += velocity * dt;
      }
      return angle;
    };

    let low = 0.05;
    let high = 80;
    for (let iteration = 0; iteration < 28; iteration += 1) {
      const middle = (low + high) / 2;
      if (terminalAngle(middle) > 0) low = middle;
      else high = middle;
    }
    const gravityTorque = (low + high) / 2;
    const frames = [];
    const balanceSamples = Math.max(72, Math.round(criticalMs / 14));
    for (let index = 0; index < balanceSamples; index += 1) {
      const progress = index / balanceSamples;
      const timeMs = criticalMs * progress;
      const angleDeg = startAngleDeg - (startAngleDeg - criticalAngleDeg) * progress ** 3;
      frames.push(frameFor(timeMs, angleDeg, 0));
    }

    let angle = criticalAngle;
    let velocity = initialVelocity;
    for (let index = 0; index <= fallSteps; index += 1) {
      if (index % 10 === 0 || index === fallSteps) {
        const angleDeg = Math.max(0, angle * 180 / Math.PI);
        const timeMs = criticalMs + (index / fallSteps) * (impactMs - criticalMs);
        frames.push(frameFor(timeMs, angleDeg, Math.abs(velocity * 180 / Math.PI)));
      }
      velocity -= gravityTorque * Math.cos(angle) * dt;
      angle = Math.max(0, angle + velocity * dt);
    }

    [
      [0, 1.65],
      [0.30, 0.92],
      [0.58, 0.44],
      [0.80, 0.18],
      [1, 0]
    ].forEach(([ringProgress, angleDeg]) => {
      const finalSpinAngle = initialSpinAngle - spinDegrees;
      frames.push({
        offset: impactOffset + ringProgress * (1 - impactOffset),
        transform: `translate3d(0, 8vh, 0) rotateX(${floorPitchDeg}deg) rotateZ(${finalSpinAngle}deg) rotateX(${-angleDeg}deg) rotateZ(${balanceRollDeg}deg) scale(0.98)`,
        '--fe-card-angle': `${angleDeg}deg`,
        '--fe-card-angular-speed': '0deg',
        '--fe-card-spin-speed': '0deg',
        '--fe-card-spin-angle': `${finalSpinAngle}deg`
      });
    });
    return { totalMs, criticalMs, criticalOffset, impactMs, impactOffset, frames };
  }

  function cornerFallShadowFrames(motion) {
    const angles = motion.frames.map((frame) => boundedNumber(
      Number.parseFloat(frame['--fe-card-angle']),
      0,
      0,
      90
    ));
    return motion.frames.map((frame, index) => {
      const angle = angles[index];
      const previousAngle = angles[Math.max(0, index - 1)];
      const contactProgress = Math.cos(angle * Math.PI / 180);
      const centreHeight = Math.sin(angle * Math.PI / 180);
      const projectedArea = 0.16 + contactProgress * 0.84;
      const ringLift = index > 0 && frame.offset >= motion.impactOffset
        ? Math.max(0, angle - previousAngle) / 1.65
        : 0;
      const distance = Math.min(1, centreHeight * 0.74 + ringLift * 0.16);
      const scaleX = 0.15 + projectedArea * 0.87 - distance * 0.08;
      const scaleY = 0.42 + projectedArea * 0.58 - distance * 0.08;
      const opacity = 0.22 + projectedArea * 0.58 - distance * 0.11;
      const softness = 7 + distance * 15 + (1 - projectedArea) * 3;
      const drift = -(1 - contactProgress) * 18;
      return {
        offset: frame.offset,
        opacity: Number(Math.max(0.16, Math.min(0.84, opacity)).toFixed(4)),
        transform: `translate3d(${drift.toFixed(2)}%, 0, 0) scale(${scaleX.toFixed(4)}, ${scaleY.toFixed(4)})`,
        '--fe-card-shadow-softness': `${softness.toFixed(2)}px`
      };
    });
  }

  function emitEntrancePhase(phase, entrance) {
    window.dispatchEvent(new CustomEvent('fe-monster-identity-card-animation', {
      detail: {
        phase,
        animationId: entrance.id,
        preset: entrance.preset,
        cardId: state.currentCard?.id || FALLBACK_CARD_ID
      }
    }));
  }

  function runCornerFall(entrance) {
    const motion = cornerFallMotion(entrance.durationMs);
    elements.stage.style.setProperty('--fe-card-entrance-duration', `${motion.totalMs}ms`);
    state.motionAnimation = elements.shell.animate(motion.frames, {
      duration: motion.totalMs,
      easing: 'linear',
      fill: 'both'
    });
    state.motionAnimation.id = 'fe-identity-card-corner-balance';
    state.shadowAnimation = elements.stage.querySelector('.fe-identity-card__shadow')?.animate(
      cornerFallShadowFrames(motion),
      { duration: motion.totalMs, easing: 'linear', fill: 'both' }
    ) || null;
    if (state.shadowAnimation) state.shadowAnimation.id = 'fe-identity-card-corner-shadow';
    emitEntrancePhase('corner-contact', entrance);
    playCornerContactCue(entrance.soundCue);
    playSpinCue(entrance.soundCue);
    state.impactTimer = window.setTimeout(() => {
      emitEntrancePhase('face-impact', entrance);
      playImpactCue(entrance.soundCue);
      state.impactTimer = 0;
    }, motion.impactMs);
    state.animationTimer = window.setTimeout(() => {
      settleCardOnGround();
      state.animationTimer = 0;
    }, motion.totalMs + 24);
  }

  function cardAwaitingLift() {
    return Boolean(elements.stage?.classList.contains('is-landed'));
  }

  function settleCardOnGround() {
    stopCornerFallAnimations();
    elements.stage.classList.remove('is-entering', 'is-lifting', 'is-showcasing');
    elements.stage.classList.add('is-landed');
    elements.card.setAttribute('aria-label', '身份卡已落地，点击使它悬浮展示');
    setStatus('身份卡已落地 · 点击卡片使它悬浮展示');
  }

  function liftCardFromGround() {
    if (!cardAwaitingLift()) return false;
    clearAnimationTimers();
    setFace('front');
    elements.stage.classList.remove('is-entering', 'is-landed', 'is-showcasing');
    if (motionPreference.matches) {
      elements.stage.classList.add('is-showcasing');
      setStatus(`${state.cards.length} 张身份卡 · ${state.currentCard.name}`);
      return true;
    }
    elements.stage.classList.add('is-lifting');
    elements.stage.style.setProperty('--fe-card-lift-duration', '920ms');
    playSpinCue(state.currentCard?.entrance?.soundCue || 'noble-metal');
    setStatus('身份卡正在悬浮起来…');
    state.animationTimer = window.setTimeout(() => {
      elements.stage.classList.remove('is-lifting');
      elements.stage.classList.add('is-showcasing');
      elements.card.setAttribute('aria-label', '翻转身份卡，查看背面');
      setStatus(`${state.cards.length} 张身份卡 · ${state.currentCard.name}`);
      state.animationTimer = 0;
      window.dispatchEvent(new CustomEvent('fe-monster-identity-card-animation', {
        detail: {
          phase: 'showcase',
          animationId: state.currentCard?.displayAnimationId || 'slow-showcase',
          cardId: state.currentCard?.id || FALLBACK_CARD_ID
        }
      }));
    }, 960);
    return true;
  }

  function setFace(face, withSound = false) {
    state.face = face === 'back' ? 'back' : 'front';
    const back = state.face === 'back';
    elements.card.setAttribute('aria-pressed', String(back));
    elements.card.setAttribute('aria-label', back ? '翻转身份卡，查看正面' : '翻转身份卡，查看背面');
    if (elements.flip) {
      const label = back ? '翻到正面' : '翻到背面';
      elements.flip.setAttribute('aria-label', label);
      elements.flip.title = label;
      const controlLabel = elements.flip.querySelector('.fe-identity-card__control-label');
      if (controlLabel) controlLabel.textContent = label;
    }
    if (withSound && soundAllowed()) {
      const context = getAudioContext();
      if (context) {
        context.resume?.().catch(() => {});
        const now = context.currentTime + 0.006;
        const bus = metalBus(context, now, 0.72);
        scheduleTone(context, now, 1174.7, 0.18, 0.020, 'triangle', bus, { pan: -0.12, frequencyRatio: 0.992 });
        scheduleTone(context, now + 0.003, 2637, 0.14, 0.013, 'sine', bus, { pan: 0.16, frequencyRatio: 0.998 });
      }
    }
  }

  function replayEntrance() {
    clearAnimationTimers();
    setFace('front');
    elements.stage.classList.remove('is-entering', 'is-landed', 'is-lifting', 'is-showcasing');
    void elements.shell?.offsetWidth;
    const entrance = state.previewAnimationId
      ? normalizeEntrance(state.previewAnimationId)
      : state.currentCard?.entrance || normalizeEntrance('corner-fall-float');
    elements.stage.dataset.entrance = entrance.preset;
    elements.stage.style.setProperty('--fe-card-entrance-duration', `${entrance.durationMs}ms`);
    emitEntrancePhase('entrance', entrance);
    if (motionPreference.matches) {
      settleCardOnGround();
      return;
    }
    elements.stage.classList.add('is-entering');
    if (entrance.preset === 'corner-fall-float') {
      runCornerFall(entrance);
      return;
    }
    playSpinCue(entrance.soundCue);
    state.impactTimer = window.setTimeout(
      () => playImpactCue(entrance.soundCue),
      Math.round(entrance.durationMs * entrance.impactAt)
    );
    state.animationTimer = window.setTimeout(() => {
      settleCardOnGround();
      state.animationTimer = 0;
    }, entrance.durationMs + 40);
  }

  function focusableNodes() {
    return Array.from(elements.dialog.querySelectorAll('button:not(:disabled), input:not(:disabled)'))
      .filter((node) => !node.hidden && node.getClientRects().length);
  }

  function onDialogKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const nodes = focusableNodes();
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function setMenuOpen(open) {
    const nextOpen = Boolean(open && elements.menu);
    state.menuOpen = nextOpen;
    if (elements.menu) elements.menu.hidden = !nextOpen;
    elements.trigger.setAttribute('aria-expanded', String(nextOpen));
    if (!nextOpen) return;
    syncFromCommunityDom();
    render();
    refresh().catch(() => {});
  }

  function toggleMenu() {
    setMenuOpen(!state.menuOpen);
  }

  function toggleNicknameEditor(forceOpen) {
    if (!elements.nicknameForm) return;
    if (!canEditNickname()) {
      setNicknameEditorOpen(false);
      setStatus('这张服务器专属身份卡的昵称已固定，不能修改');
      return;
    }
    const nextHidden = typeof forceOpen === 'boolean' ? !forceOpen : !elements.nicknameForm.hidden;
    if (!setNicknameEditorOpen(!nextHidden)) return;
    elements.nicknameInput.value = displayNickname() === 'FE 用户' ? '' : displayNickname();
    elements.nicknameInput.focus();
    elements.nicknameInput.select();
  }

  function open(options = {}) {
    if (state.open) return;
    setMenuOpen(false);
    if (options?.preserveExternal !== true) state.externalView = null;
    if (options?.preservePreview !== true) {
      state.previewCardId = '';
      state.previewAnimationId = '';
    }
    if (!state.externalView) syncFromCommunityDom();
    state.open = true;
    if (!state.externalView) state.lastFocus = elements.trigger;
    elements.dialog.hidden = false;
    document.documentElement.classList.add('is-identity-card-open');
    render();
    replayEntrance();
    window.requestAnimationFrame(() => elements.close?.focus({ preventScroll: true }));
    if (options?.skipRefresh !== true) refresh().catch(() => {});
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    clearAnimationTimers();
    elements.stage.classList.remove('is-entering', 'is-landed', 'is-lifting', 'is-showcasing');
    elements.dialog.hidden = true;
    document.documentElement.classList.remove('is-identity-card-open');
    setNicknameEditorOpen(false);
    state.previewCardId = '';
    state.previewAnimationId = '';
    const wasExternal = Boolean(state.externalView);
    state.externalView = null;
    if (wasExternal) render();
    const focusTarget = state.lastFocus && state.lastFocus.isConnected ? state.lastFocus : elements.trigger;
    focusTarget?.focus?.({ preventScroll: true });
  }

  function showcaseCard(cardId) {
    state.externalView = null;
    state.previewCardId = bounded(cardId, state.equippedId, 64);
    setMenuOpen(false);
    render();
    if (state.open) replayEntrance();
    else open({ preservePreview: true });
  }

  function showExternal(payload = {}) {
    const ownerSource = payload.owner && typeof payload.owner === 'object' ? payload.owner : {};
    const feId = normalizeFeId(ownerSource.feId || payload.feId);
    const username = bounded(ownerSource.username || ownerSource.nickname, 'FE 用户', 32);
    if (!/^\d{8}$/.test(feId)) throw new Error('好友身份卡所有者无效');
    if (!payload.card || typeof payload.card !== 'object') throw new Error('好友身份卡数据无效');
    const card = {
      ...normalizeCard(payload.card),
      owned: false,
      equipped: false,
      nicknameEditable: false,
      nicknamePolicy: 'locked'
    };
    const displayAnimation = payload.displayAnimation && typeof payload.displayAnimation === 'object'
      ? payload.displayAnimation
      : null;
    if (displayAnimation && safeText(displayAnimation.scope, '') !== 'identity-card-display') {
      throw new Error('好友身份卡展示动画类型无效');
    }
    if (displayAnimation) registerAnimationPreset(displayAnimation.id, displayAnimation);
    state.externalView = {
      owner: { feId, username },
      card,
      displayAnimation: displayAnimation ? { ...displayAnimation } : null
    };
    state.previewCardId = '';
    state.previewAnimationId = bounded(displayAnimation?.id || card.displayAnimationId, '', 48);
    setMenuOpen(false);
    if (!state.open) {
      state.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : elements.trigger;
    }
    if (state.open) {
      render();
      replayEntrance();
    } else {
      open({ preserveExternal: true, preservePreview: true, skipRefresh: true });
    }
    setStatus(`正在展示 ${username} 的身份卡`);
    return { owner: { ...state.externalView.owner }, card: { ...card } };
  }

  async function equip(cardId) {
    const id = bounded(cardId && typeof cardId === 'object' ? cardId.id || cardId.cardId : cardId, '', 64);
    const card = state.cards.find((item) => item.id === id && item.owned);
    if (!card) throw new Error('这张身份卡尚未领取');
    if (state.equipPending) return card;
    if (id === state.equippedId) {
      showcaseCard(id);
      return card;
    }
    const feId = normalizeFeId(state.profile.feId);
    if (!feId) throw new Error('请先登录社区');
    state.equipPending = id;
    renderCollection();
    setStatus(`正在替换为 ${card.name}…`);
    try {
      const payload = await apiJson(`/api/community/identity-cards/equip?${queryString({ provider: state.provider, feId })}`, {
        method: 'POST',
        body: JSON.stringify({ cardId: id, feId })
      });
      hydrateAnimationCatalog(payload);
      const inventory = normalizeInventory(payload);
      state.cards = inventory.cards.length ? inventory.cards : state.cards;
      state.equippedId = bounded(
        payload.equippedIdentityCardId || payload.equippedCardId || payload.equippedId || inventory.equipped,
        id,
        64
      );
      state.cards = state.cards.map((item) => ({ ...item, equipped: item.id === state.equippedId }));
      showcaseCard(state.equippedId);
      setStatus(`已换上 ${state.currentCard.name}`);
      window.dispatchEvent(new CustomEvent('fe-monster-identity-card-equipped', {
        detail: { feId, provider: state.provider, card: { ...state.currentCard } }
      }));
      return payload;
    } catch (error) {
      setStatus(error.message || '身份卡替换失败', true);
      throw error;
    } finally {
      state.equipPending = '';
      renderCollection();
    }
  }

  async function saveNickname(event) {
    event.preventDefault();
    if (!canEditNickname()) {
      setNicknameEditorOpen(false);
      setStatus('这张服务器专属身份卡的昵称已固定，不能修改', true);
      return;
    }
    const username = bounded(elements.nicknameInput?.value, '', 32);
    if (!username) {
      setStatus('昵称不能为空', true);
      elements.nicknameInput?.focus();
      return;
    }
    const feId = normalizeFeId(state.profile.feId);
    if (!feId) {
      setStatus('请先登录社区', true);
      return;
    }
    const submit = elements.nicknameForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    setStatus('正在把昵称刻到卡面…');
    try {
      const payload = await apiJson(`/api/community/profile?${queryString({ provider: state.provider, feId })}`, {
        method: 'POST',
        body: JSON.stringify({ username, feId })
      });
      state.profile = { ...state.profile, ...(payload.profile || {}), username };
      applyCard();
      setNicknameEditorOpen(false);
      setStatus('昵称已刻到身份卡');
      window.dispatchEvent(new CustomEvent('fe-monster-identity-card-nickname', {
        detail: { feId, provider: state.provider, username, profile: { ...state.profile } }
      }));
    } catch (error) {
      setStatus(error.message || '昵称保存失败', true);
    } finally {
      submit.disabled = false;
    }
  }

  function hydrate(detail = {}) {
    const profile = detail.profile && typeof detail.profile === 'object' ? detail.profile : detail;
    const nextProvider = normalizeProvider(detail.provider || profile.provider || state.provider);
    const nextFeId = normalizeFeId(profile.feId || detail.feId);
    const nextName = bounded(profile.username || profile.nickname || detail.username, '', 32);
    const identityChanged = Boolean(nextFeId && nextFeId !== normalizeFeId(state.profile.feId));
    state.profileEventSeen = true;
    state.provider = nextProvider;
    if (nextFeId) {
      if (identityChanged) {
        state.requestGeneration += 1;
        state.cards = [fallbackCard()];
        state.equippedId = FALLBACK_CARD_ID;
        state.inventoryHydrated = false;
        state.knownCardIds = new Set();
      }
      state.profile = { ...state.profile, ...profile, feId: nextFeId, username: nextName || state.profile.username };
    } else if (detail.loggedIn === false || detail.hasCommunityIdentity === false) {
      state.profile = { feId: '', username: '' };
      state.cards = [fallbackCard()];
      state.equippedId = FALLBACK_CARD_ID;
    }
    render();
    if ((state.open || state.menuOpen) && nextFeId) refresh().catch(() => {});
  }

  function syncFromCommunityDom() {
    const feId = normalizeFeId(elements.communityFeId?.textContent);
    if (!feId) {
      if (!state.profileEventSeen) render();
      return;
    }
    const nameNode = elements.communityName?.querySelector('span') || elements.communityName;
    const username = bounded(nameNode?.textContent, '', 32);
    if (feId !== normalizeFeId(state.profile.feId)) {
      state.requestGeneration += 1;
      state.cards = [fallbackCard()];
      state.equippedId = FALLBACK_CARD_ID;
      state.inventoryHydrated = false;
      state.knownCardIds = new Set();
    }
    state.profile = { ...state.profile, feId, username: username || state.profile.username };
    state.provider = loadProvider();
    render();
  }

  function registerAnimationPreset(id, configuration = {}) {
    const key = bounded(id, '', 48).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!key) return false;
    const stages = Array.isArray(configuration.stages) ? configuration.stages.slice(0, 12) : [];
    const stageKinds = new Set(stages.map((stage) => bounded(stage?.kind, '', 32).toLowerCase()));
    const inferredPreset = stageKinds.has('high-drop') || stageKinds.has('fall-flat') || stageKinds.has('corner-lift')
      ? 'corner-fall-float'
      : stageKinds.has('spin')
        ? 'rise-flip'
        : stages.length
          ? 'soft-reveal'
          : 'corner-fall-float';
    const baseName = bounded(configuration.preset, inferredPreset, 48).toLowerCase();
    const base = DEFAULT_ENTRANCES[baseName] || DEFAULT_ENTRANCES['corner-fall-float'];
    const entranceStages = [];
    for (const stage of stages) {
      const kind = bounded(stage?.kind, '', 32).toLowerCase();
      if (kind === 'slow-showcase'
        || (inferredPreset === 'corner-fall-float' && (kind === 'float-front' || kind === 'gold-sweep'))) break;
      entranceStages.push(stage);
    }
    const declaredDuration = entranceStages.reduce((total, stage) => (
      total + Math.min(5000, Math.max(80, Number(stage?.durationMs) || 0))
    ), 0);
    const fallIndex = entranceStages.findIndex((stage) => bounded(stage?.kind, '', 32).toLowerCase() === 'fall-flat');
    const impactDuration = fallIndex >= 0
      ? entranceStages.slice(0, fallIndex).reduce((total, stage) => total + Math.max(80, Number(stage?.durationMs) || 0), 0)
      : 0;
    const resolvedDuration = Math.min(4000, Math.max(200, Number(configuration.durationMs) || declaredDuration || base.durationMs));
    animationPresets.set(key, Object.freeze({
      preset: base.preset,
      durationMs: resolvedDuration,
      impactAt: Math.min(0.9, Math.max(0.1, Number(configuration.impactAt) || (impactDuration ? impactDuration / resolvedDuration : base.impactAt))),
      soundCue: bounded(configuration.soundCue, 'crisp-metal', 32).toLowerCase(),
      stages: entranceStages.map((stage) => ({
        kind: bounded(stage?.kind, '', 32).toLowerCase(),
        durationMs: Math.min(5000, Math.max(80, Number(stage?.durationMs) || 400)),
        intensity: Math.min(1, Math.max(0, Number(stage?.intensity) || 0.5))
      }))
    }));
    return true;
  }

  elements.trigger.addEventListener('click', toggleMenu);
  elements.preview?.addEventListener('click', open);
  elements.close?.addEventListener('click', close);
  elements.dialog.querySelectorAll('[data-fe-identity-close]').forEach((button) => button.addEventListener('click', close));
  elements.dialog.addEventListener('keydown', onDialogKeydown);
  elements.card.addEventListener('click', (event) => {
    if (liftCardFromGround()) return;
    if (event.target === elements.nickname || elements.nickname?.contains(event.target)) return;
    setFace(state.face === 'front' ? 'back' : 'front', true);
  });
  elements.flip?.addEventListener('click', () => setFace(state.face === 'front' ? 'back' : 'front', true));
  elements.replay?.addEventListener('click', replayEntrance);
  elements.edit?.addEventListener('click', () => toggleNicknameEditor());
  elements.nickname?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (liftCardFromGround()) return;
    toggleNicknameEditor(true);
  });
  elements.nickname?.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (liftCardFromGround()) return;
    toggleNicknameEditor(true);
  });
  elements.nicknameForm?.addEventListener('submit', saveNickname);
  elements.sound?.addEventListener('click', () => {
    state.muted = !state.muted;
    writeBoolean(MUTE_KEY, state.muted);
    elements.sound.setAttribute('aria-pressed', String(state.muted));
    elements.sound.setAttribute('aria-label', state.muted ? '打开身份卡音效' : '关闭身份卡音效');
    setStatus(state.muted ? '身份卡音效已关闭' : '身份卡音效已打开');
  });
  elements.sound?.setAttribute('aria-pressed', String(state.muted));
  elements.sound?.setAttribute('aria-label', state.muted ? '打开身份卡音效' : '关闭身份卡音效');
  document.addEventListener('pointerdown', (event) => {
    if (!state.menuOpen || elements.menu?.contains(event.target) || elements.trigger.contains(event.target)) return;
    setMenuOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.menuOpen) setMenuOpen(false);
  });

  window.addEventListener('fe-monster-community-profile', (event) => hydrate(event.detail || {}));
  window.addEventListener('fe-monster-reward-animation', (event) => {
    const detail = event.detail && typeof event.detail === 'object' ? event.detail : {};
    if (detail.itemType !== 'identity-card') return;
    if (detail.phase !== 'display' && !(detail.phase === 'claim' && detail.sequenceManaged !== true)) return;
    if (detail.animation && typeof detail.animation === 'object') {
      registerAnimationPreset(detail.animation.id || detail.animationId, detail.animation);
    }
    window.queueMicrotask(() => {
      const cardId = bounded(detail.itemId || detail.card?.id, '', 64);
      if (!state.cards.some((card) => card.id === cardId)) return;
      state.previewCardId = cardId;
      state.previewAnimationId = bounded(detail.animationId || detail.animation?.id, '', 48);
      render();
      if (!state.open) open({ preservePreview: true });
      else replayEntrance();
    });
  });
  window.addEventListener('storage', (event) => {
    if (event.key === ACTIVE_PROVIDER_KEY) state.provider = loadProvider();
  });

  const identityObserver = new MutationObserver(syncFromCommunityDom);
  if (elements.communityFeId) identityObserver.observe(elements.communityFeId, { childList: true, characterData: true, subtree: true });
  if (elements.communityName) identityObserver.observe(elements.communityName, { childList: true, characterData: true, subtree: true });

  state.cards = [fallbackCard()];
  syncFromCommunityDom();
  render();

  window.FeMonsterIdentityCard = Object.freeze({
    open,
    close,
    refresh,
    equip,
    showExternal,
    hydrate,
    flip: () => setFace(state.face === 'front' ? 'back' : 'front', true),
    replay: replayEntrance,
    registerAnimationPreset,
    snapshot: () => ({
      open: state.open,
      menuOpen: state.menuOpen,
      provider: state.provider,
      profile: { ...state.profile },
      equippedId: state.equippedId,
      currentCard: state.currentCard ? { ...state.currentCard } : null,
      externalView: state.externalView ? {
        owner: { ...state.externalView.owner },
        card: { ...state.externalView.card },
        displayAnimation: state.externalView.displayAnimation ? { ...state.externalView.displayAnimation } : null
      } : null,
      cards: state.cards.map((card) => ({ ...card })),
      face: state.face,
      muted: state.muted,
      reducedMotion: motionPreference.matches
    })
  });
}());
