(() => {
  'use strict';

  const VIEW_WIDTH = 600;
  const VIEW_HEIGHT = 320;
  const GROUND_Y = 270;
  const PLAYER_SPEED = 158;
  const JUMP_SPEED = 352;
  const GRAVITY = 980;
  const MAX_PHYSICS_STEP = 1 / 240;
  const GAME_TARGET_FPS = 120;
  const GAME_FRAME_BUDGET_MS = 1000 / GAME_TARGET_FPS;
  const SECRET_LEFT_LOCK_TIME = 1.5;
  const SECRET_DRAWER_REVEAL_TIME = 2;
  const SECRET_ENTRY_X = 8;
  const SECRET_WORLD_MIN_X = -900;
  const SECRET_EXIT_OFFSET = 64;
  const PLAYER_MAX_HEALTH = 10;
  const PLAYER_HIT_INVULNERABILITY = 0.72;
  const CHARACTER_STORAGE_KEY = 'fe-monster-login-character-v1';
  const CHARACTER_STORAGE_VERSION = 1;
  const CHARACTER_WIDTH = 19;
  const CHARACTER_HEIGHT = 28;
  const CHARACTER_PIXEL_COUNT = CHARACTER_WIDTH * CHARACTER_HEIGHT;
  const CHARACTER_HISTORY_LIMIT = 32;
  const DEFAULT_CHARACTER_PALETTE = Object.freeze([
    '#13232d',
    '#69d6c2',
    '#f2c59b',
    '#e9b94e',
    '#365a79',
    '#f4f3e8',
    '#ef5b63',
    '#8e61d4'
  ]);
  const HELL_ENTRY_CHANCE = 0.26;
  const HELL_PITY_DEATHS = 4;
  const HELL_TRANSITION_FADE_OUT = 0.42;
  const HELL_TRANSITION_GLITCH = 0.48;
  const HELL_TRANSITION_FADE_IN = 0.55;
  const HELL_BLOCK_REPEL_RADIUS = 92;
  const HELL_BLOCK_MAX_SPEED = 52;
  const HELL_BLOCK_VERTICAL_SPEED = 16;
  const HELL_BLOCK_EXHAUST_TIME = 1.15;
  const HELL_BLOCK_CATCH_WINDOW = 2.4;
  const HELL_BLOCK_ATTACK_RADIUS = 286;
  const HELL_BLOCK_PROJECTILE_SPEED = 124;
  const HELL_BLOCK_ATTACK_COOLDOWN = 1.35;
  const HELL_PROJECTILE_LIMIT = 20;
  const PROVIDER_IDS = Object.freeze(['netease', 'qq', 'kugou', 'qishui']);
  const API_PACKAGE_JSON_MAX_BYTES = 64 * 1024;
  const API_PACKAGE_ZIP_MAX_BYTES = 25 * 1024 * 1024;
  const OFFICIAL_PROVIDERS = new Set(['netease', 'qq', 'kugou']);
  const PROVIDER_ART = Object.freeze({
    netease: { letter: 'N', color: '#f05245', dark: '#7d2622' },
    qq: { letter: 'Q', color: '#59c7ef', dark: '#1d6683' },
    kugou: { letter: 'K', color: '#f4ca55', dark: '#806320' },
    qishui: { letter: 'S', color: '#80e483', dark: '#31713b' }
  });
  const LETTERS = Object.freeze({
    N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
    K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110']
  });

  const SAFE_LAYOUTS = Object.freeze([
    {
      id: 'aurora-pass',
      width: 1740,
      gaps: [[334, 392], [760, 822], [1128, 1186]],
      slots: [[184, 190], [548, 174], [942, 198], [1410, 180]],
      enemies: [[560, 510, 690], [1270, 1210, 1370]],
      sky: ['#102644', '#1b4260', '#35718a'],
      ground: ['#2d765d', '#173d39', '#0b2628']
    },
    {
      id: 'ember-trail',
      width: 1780,
      gaps: [[276, 334], [676, 740], [1310, 1370]],
      slots: [[146, 176], [482, 198], [930, 172], [1532, 194]],
      enemies: [[820, 772, 900], [1440, 1398, 1510]],
      sky: ['#2d1835', '#62304a', '#a35b55'],
      ground: ['#a76745', '#663828', '#352329']
    },
    {
      id: 'mossy-ruins',
      width: 1710,
      gaps: [[412, 474], [906, 962], [1252, 1312]],
      slots: [[210, 198], [640, 176], [1058, 190], [1462, 170]],
      enemies: [[552, 506, 612], [1158, 1100, 1232]],
      sky: ['#102f2e', '#1f5048', '#47725a'],
      ground: ['#55774a', '#2e4935', '#172d2b']
    },
    {
      id: 'moonlit-circuit',
      width: 1810,
      gaps: [[362, 420], [846, 910], [1450, 1508]],
      slots: [[194, 172], [602, 194], [1092, 176], [1630, 198]],
      enemies: [[700, 650, 810], [1260, 1180, 1370]],
      sky: ['#11142f', '#252b58', '#4b4d79'],
      ground: ['#59629a', '#30375f', '#1a2140']
    }
  ]);

  const dom = {};
  let context = null;
  let resizeObserver = null;
  let audioContext = null;
  let lastTemplateId = '';
  let eventsBound = false;
  let activeCharacter = null;
  let characterSprites = null;
  let apiPackageImporting = false;

  const characterEditor = {
    pixels: null,
    palette: [],
    colorIndex: 1,
    tool: 'pencil',
    history: [],
    pointerId: null,
    lastCell: -1,
    strokeChanged: false,
    renderFrame: 0
  };

  const game = {
    open: false,
    drawerOpen: false,
    characterEditorOpen: false,
    frame: 0,
    lastFrame: 0,
    frameClock: 0,
    frameCarry: 0,
    levelTime: 0,
    syncRevision: 0,
    seed: 0,
    layout: null,
    cameraX: 0,
    checkpointX: 72,
    deathsSinceHell: 0,
    deathRandom: null,
    transition: createTransitionState(),
    hellHintShown: false,
    providerOnly: false,
    hitProviders: new Set(),
    keyboard: { left: false, right: false, aHeld: false },
    touch: { left: new Set(), right: new Set(), jump: new Set() },
    jumpQueued: false,
    secret: createSecretState(),
    returnFocus: null,
    player: createPlayer()
  };

  function createTransitionState() {
    return {
      active: false,
      phase: 'idle',
      elapsed: 0,
      darkness: 0,
      glitch: 0,
      swapped: false,
      reason: ''
    };
  }

  function createSecretState() {
    return {
      held: 0,
      progress: 0,
      entryUnlocked: false,
      achieved: false,
      eligibilityReady: false,
      eligible: false
    };
  }

  function createPlayer(spawnX = 72) {
    return {
      x: spawnX,
      y: GROUND_Y - 28,
      previousY: GROUND_Y - 28,
      width: 19,
      height: 28,
      vx: 0,
      vy: 0,
      knockbackX: 0,
      maxHealth: PLAYER_MAX_HEALTH,
      health: PLAYER_MAX_HEALTH,
      invulnerability: 0,
      hitFlash: 0,
      onGround: true,
      facing: 1,
      lastGroundIndex: 0,
      gapFromIndex: -1
    };
  }

  function fillCharacterRect(pixels, x, y, width, height, colorIndex) {
    const left = Math.max(0, Math.floor(x));
    const top = Math.max(0, Math.floor(y));
    const right = Math.min(CHARACTER_WIDTH, left + Math.max(0, Math.floor(width)));
    const bottom = Math.min(CHARACTER_HEIGHT, top + Math.max(0, Math.floor(height)));
    for (let row = top; row < bottom; row += 1) {
      for (let column = left; column < right; column += 1) {
        pixels[row * CHARACTER_WIDTH + column] = colorIndex;
      }
    }
  }

  function createDefaultCharacterModel() {
    const pixels = new Uint8Array(CHARACTER_PIXEL_COUNT);
    fillCharacterRect(pixels, 4, 1, 12, 7, 1);
    fillCharacterRect(pixels, 2, 4, 15, 6, 2);
    fillCharacterRect(pixels, 5, 10, 10, 7, 3);
    fillCharacterRect(pixels, 12, 12, 2, 2, 1);
    fillCharacterRect(pixels, 3, 17, 13, 7, 4);
    fillCharacterRect(pixels, 1, 18, 3, 5, 3);
    fillCharacterRect(pixels, 15, 18, 3, 5, 3);
    fillCharacterRect(pixels, 5, 24, 4, 4, 5);
    fillCharacterRect(pixels, 11, 24, 4, 4, 5);
    fillCharacterRect(pixels, 4, 27, 5, 1, 1);
    fillCharacterRect(pixels, 11, 27, 5, 1, 1);
    return {
      version: CHARACTER_STORAGE_VERSION,
      width: CHARACTER_WIDTH,
      height: CHARACTER_HEIGHT,
      palette: DEFAULT_CHARACTER_PALETTE.slice(),
      pixels
    };
  }

  function cloneCharacterModel(model) {
    return {
      version: CHARACTER_STORAGE_VERSION,
      width: CHARACTER_WIDTH,
      height: CHARACTER_HEIGHT,
      palette: model.palette.slice(),
      pixels: model.pixels.slice()
    };
  }

  function normalizeCharacterColor(value, fallback) {
    const color = String(value || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(color) ? color : fallback;
  }

  function normalizeCharacterModel(value) {
    if (!value || typeof value !== 'object') return null;
    if (Number(value.version) !== CHARACTER_STORAGE_VERSION
      || Number(value.width) !== CHARACTER_WIDTH
      || Number(value.height) !== CHARACTER_HEIGHT) return null;
    if (!Array.isArray(value.palette) || value.palette.length !== DEFAULT_CHARACTER_PALETTE.length) return null;
    const palette = value.palette.map((color, index) => (
      normalizeCharacterColor(color, DEFAULT_CHARACTER_PALETTE[index])
    ));
    const encoded = typeof value.pixels === 'string' ? value.pixels : '';
    if (encoded.length !== CHARACTER_PIXEL_COUNT || !/^[0-8]+$/.test(encoded)) return null;
    const pixels = new Uint8Array(CHARACTER_PIXEL_COUNT);
    let painted = false;
    for (let index = 0; index < encoded.length; index += 1) {
      pixels[index] = encoded.charCodeAt(index) - 48;
      painted ||= pixels[index] > 0;
    }
    if (!painted) return null;
    return {
      version: CHARACTER_STORAGE_VERSION,
      width: CHARACTER_WIDTH,
      height: CHARACTER_HEIGHT,
      palette,
      pixels
    };
  }

  function serializeCharacterModel(model) {
    return JSON.stringify({
      version: CHARACTER_STORAGE_VERSION,
      width: CHARACTER_WIDTH,
      height: CHARACTER_HEIGHT,
      palette: model.palette.slice(),
      pixels: Array.from(model.pixels, (value) => String(value)).join('')
    });
  }

  function characterModelsEqual(left, right) {
    if (!left || !right || left.palette.length !== right.palette.length
      || left.pixels.length !== right.pixels.length) return false;
    for (let index = 0; index < left.palette.length; index += 1) {
      if (left.palette[index] !== right.palette[index]) return false;
    }
    for (let index = 0; index < left.pixels.length; index += 1) {
      if (left.pixels[index] !== right.pixels[index]) return false;
    }
    return true;
  }

  function loadCharacterModel() {
    try {
      const stored = window.localStorage?.getItem(CHARACTER_STORAGE_KEY);
      if (stored) {
        const normalized = normalizeCharacterModel(JSON.parse(stored));
        if (normalized) return normalized;
      }
    } catch (error) {
    }
    return createDefaultCharacterModel();
  }

  function notifyCharacterPreferenceChanged() {
    if (typeof window.CustomEvent !== 'function') return;
    window.dispatchEvent(new window.CustomEvent('fe-client-preferences-change', {
      detail: { key: CHARACTER_STORAGE_KEY }
    }));
  }

  function persistCharacterModel(model) {
    try {
      const defaults = createDefaultCharacterModel();
      if (characterModelsEqual(model, defaults)) {
        window.localStorage?.removeItem(CHARACTER_STORAGE_KEY);
      } else {
        window.localStorage?.setItem(CHARACTER_STORAGE_KEY, serializeCharacterModel(model));
      }
      notifyCharacterPreferenceChanged();
      return true;
    } catch (error) {
      return false;
    }
  }

  function drawCharacterModelToCanvas(canvas, model, tint = '') {
    if (!canvas || !model) return false;
    const target = canvas.getContext('2d');
    if (!target) return false;
    if (canvas.width !== CHARACTER_WIDTH) canvas.width = CHARACTER_WIDTH;
    if (canvas.height !== CHARACTER_HEIGHT) canvas.height = CHARACTER_HEIGHT;
    target.imageSmoothingEnabled = false;
    target.clearRect(0, 0, CHARACTER_WIDTH, CHARACTER_HEIGHT);
    for (let index = 0; index < model.pixels.length; index += 1) {
      const colorIndex = model.pixels[index];
      if (!colorIndex) continue;
      target.fillStyle = tint || model.palette[colorIndex - 1] || DEFAULT_CHARACTER_PALETTE[0];
      target.fillRect(index % CHARACTER_WIDTH, Math.floor(index / CHARACTER_WIDTH), 1, 1);
    }
    return true;
  }

  function buildCharacterSprites(model) {
    if (!document.createElement) return null;
    const createSprite = (tint = '') => {
      const canvas = document.createElement('canvas');
      canvas.width = CHARACTER_WIDTH;
      canvas.height = CHARACTER_HEIGHT;
      drawCharacterModelToCanvas(canvas, model, tint);
      return canvas;
    };
    characterSprites = {
      normal: createSprite(),
      hitLight: createSprite('#fff3c2'),
      hitDanger: createSprite('#e94f50')
    };
    return characterSprites;
  }

  function ensureActiveCharacter() {
    if (!activeCharacter) activeCharacter = loadCharacterModel();
    if (!characterSprites) buildCharacterSprites(activeCharacter);
    return activeCharacter;
  }

  function setCharacterEditorStatus(message) {
    if (dom.characterEditorStatus) dom.characterEditorStatus.textContent = message;
  }

  function ensureCharacterPaletteButtons() {
    if (!dom.characterPalette || dom.characterPalette.children.length) return;
    DEFAULT_CHARACTER_PALETTE.forEach((_color, index) => {
      const button = document.createElement('button');
      const chip = document.createElement('span');
      button.type = 'button';
      button.dataset.characterColorIndex = String(index);
      button.setAttribute('aria-label', `角色颜色 ${index + 1}`);
      button.setAttribute('aria-pressed', index === characterEditor.colorIndex ? 'true' : 'false');
      chip.className = 'pixel-character-palette__chip';
      chip.setAttribute('aria-hidden', 'true');
      button.appendChild(chip);
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        characterEditor.colorIndex = index;
        setCharacterEditorTool('pencil');
      });
      dom.characterPalette.appendChild(button);
    });
    dom.characterPaletteButtons = Array.from(dom.characterPalette.children);
  }

  function renderCharacterEditorNow() {
    characterEditor.renderFrame = 0;
    if (!characterEditor.pixels || !characterEditor.palette.length) return;
    const model = {
      palette: characterEditor.palette,
      pixels: characterEditor.pixels
    };
    drawCharacterModelToCanvas(dom.characterEditorCanvas, model);
    drawCharacterModelToCanvas(dom.characterPreviewCanvas, model);
    dom.characterPaletteButtons?.forEach((button, index) => {
      const active = index === characterEditor.colorIndex;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
      button.style.setProperty('--character-color', characterEditor.palette[index]);
    });
    if (dom.characterColorInput) {
      dom.characterColorInput.value = characterEditor.palette[characterEditor.colorIndex]
        || DEFAULT_CHARACTER_PALETTE[characterEditor.colorIndex];
    }
    dom.characterToolButtons?.forEach((button) => {
      const active = button.dataset.characterTool === characterEditor.tool;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (dom.characterUndo) dom.characterUndo.disabled = characterEditor.history.length === 0;
  }

  function scheduleCharacterEditorRender() {
    if (characterEditor.renderFrame) return;
    characterEditor.renderFrame = window.requestAnimationFrame(renderCharacterEditorNow);
  }

  function setCharacterEditorTool(tool) {
    characterEditor.tool = ['pencil', 'eraser', 'fill'].includes(tool) ? tool : 'pencil';
    renderCharacterEditorNow();
  }

  function pushCharacterHistory() {
    if (!characterEditor.pixels) return;
    characterEditor.history.push(characterEditor.pixels.slice());
    if (characterEditor.history.length > CHARACTER_HISTORY_LIMIT) characterEditor.history.shift();
  }

  function characterCellFromPointer(event) {
    const canvas = dom.characterEditorCanvas;
    if (!canvas) return -1;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return -1;
    const column = Math.floor((event.clientX - bounds.left) / bounds.width * CHARACTER_WIDTH);
    const row = Math.floor((event.clientY - bounds.top) / bounds.height * CHARACTER_HEIGHT);
    if (column < 0 || column >= CHARACTER_WIDTH || row < 0 || row >= CHARACTER_HEIGHT) return -1;
    return row * CHARACTER_WIDTH + column;
  }

  function fillCharacterArea(startIndex, replacement) {
    const pixels = characterEditor.pixels;
    if (!pixels || startIndex < 0 || startIndex >= pixels.length) return false;
    const target = pixels[startIndex];
    if (target === replacement) return false;
    const pending = [startIndex];
    pixels[startIndex] = replacement;
    while (pending.length) {
      const index = pending.pop();
      const column = index % CHARACTER_WIDTH;
      const neighbors = [
        column > 0 ? index - 1 : -1,
        column < CHARACTER_WIDTH - 1 ? index + 1 : -1,
        index >= CHARACTER_WIDTH ? index - CHARACTER_WIDTH : -1,
        index < CHARACTER_PIXEL_COUNT - CHARACTER_WIDTH ? index + CHARACTER_WIDTH : -1
      ];
      neighbors.forEach((neighbor) => {
        if (neighbor >= 0 && pixels[neighbor] === target) {
          pixels[neighbor] = replacement;
          pending.push(neighbor);
        }
      });
    }
    return true;
  }

  function paintCharacterCell(index) {
    if (!characterEditor.pixels || index < 0 || index >= CHARACTER_PIXEL_COUNT) return false;
    const replacement = characterEditor.tool === 'eraser' ? 0 : characterEditor.colorIndex + 1;
    if (characterEditor.tool === 'fill') return fillCharacterArea(index, replacement);
    if (characterEditor.pixels[index] === replacement) return false;
    characterEditor.pixels[index] = replacement;
    return true;
  }

  function handleCharacterPointerDown(event) {
    if (!game.characterEditorOpen || characterEditor.pointerId !== null) return;
    event.preventDefault();
    event.stopPropagation();
    pushCharacterHistory();
    characterEditor.pointerId = event.pointerId;
    characterEditor.lastCell = -1;
    characterEditor.strokeChanged = false;
    try {
      dom.characterEditorCanvas.setPointerCapture(event.pointerId);
    } catch (error) {
    }
    const cell = characterCellFromPointer(event);
    if (cell >= 0) {
      characterEditor.lastCell = cell;
      characterEditor.strokeChanged = paintCharacterCell(cell);
      if (characterEditor.strokeChanged) scheduleCharacterEditorRender();
    }
  }

  function handleCharacterPointerMove(event) {
    if (event.pointerId !== characterEditor.pointerId || characterEditor.tool === 'fill') return;
    event.preventDefault();
    event.stopPropagation();
    const cell = characterCellFromPointer(event);
    if (cell < 0 || cell === characterEditor.lastCell) return;
    characterEditor.lastCell = cell;
    if (paintCharacterCell(cell)) {
      characterEditor.strokeChanged = true;
      scheduleCharacterEditorRender();
    }
  }

  function releaseCharacterPointer(event) {
    if (event.pointerId !== characterEditor.pointerId) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    if (!characterEditor.strokeChanged) characterEditor.history.pop();
    characterEditor.pointerId = null;
    characterEditor.lastCell = -1;
    characterEditor.strokeChanged = false;
    renderCharacterEditorNow();
  }

  function undoCharacterEdit() {
    const previous = characterEditor.history.pop();
    if (!previous) return;
    characterEditor.pixels = previous;
    setCharacterEditorStatus('已撤销上一步。');
    renderCharacterEditorNow();
  }

  function clearCharacterDraft() {
    if (!characterEditor.pixels?.some((value) => value > 0)) return;
    pushCharacterHistory();
    characterEditor.pixels.fill(0);
    setCharacterEditorStatus('画布已清空，请至少绘制一个像素后保存。');
    renderCharacterEditorNow();
  }

  function resetCharacterDraft() {
    pushCharacterHistory();
    const defaults = createDefaultCharacterModel();
    characterEditor.pixels = defaults.pixels;
    characterEditor.palette = defaults.palette;
    characterEditor.colorIndex = 1;
    characterEditor.tool = 'pencil';
    setCharacterEditorStatus('已恢复默认角色；点击“保存并使用”确认。');
    renderCharacterEditorNow();
  }

  function setCharacterEditorOpen(openEditor, { restoreFocus = true } = {}) {
    if (!dom.characterEditor) return false;
    if (openEditor) {
      ensureActiveCharacter();
      characterEditor.pixels = activeCharacter.pixels.slice();
      characterEditor.palette = activeCharacter.palette.slice();
      characterEditor.history = [];
      characterEditor.pointerId = null;
      characterEditor.lastCell = -1;
      characterEditor.strokeChanged = false;
      game.characterEditorOpen = true;
      stopLoop();
      resetInput();
      if (dom.viewport) dom.viewport.inert = true;
      if (dom.helpPanel) dom.helpPanel.inert = true;
      dom.characterEditor.hidden = false;
      dom.characterEditor.setAttribute('aria-hidden', 'false');
      setCharacterEditorStatus('选择颜色后在画布上绘制。');
      renderCharacterEditorNow();
      window.setTimeout(() => dom.characterEditorCanvas?.focus({ preventScroll: true }), 0);
      return true;
    }
    if (characterEditor.renderFrame) window.cancelAnimationFrame(characterEditor.renderFrame);
    characterEditor.renderFrame = 0;
    characterEditor.pointerId = null;
    game.characterEditorOpen = false;
    dom.characterEditor.hidden = true;
    dom.characterEditor.setAttribute('aria-hidden', 'true');
    if (dom.viewport) dom.viewport.inert = false;
    if (dom.helpPanel) dom.helpPanel.inert = false;
    draw();
    startLoop();
    if (restoreFocus) {
      window.setTimeout(() => dom.characterEditorOpen?.focus({ preventScroll: true }), 0);
    }
    return true;
  }

  function saveCharacterDraft() {
    if (!characterEditor.pixels?.some((value) => value > 0)) {
      setCharacterEditorStatus('角色不能完全透明，请至少绘制一个像素。');
      return false;
    }
    activeCharacter = {
      version: CHARACTER_STORAGE_VERSION,
      width: CHARACTER_WIDTH,
      height: CHARACTER_HEIGHT,
      palette: characterEditor.palette.slice(),
      pixels: characterEditor.pixels.slice()
    };
    buildCharacterSprites(activeCharacter);
    const persisted = persistCharacterModel(activeCharacter);
    setCharacterEditorStatus(persisted ? '角色已保存并立即应用。' : '角色已应用，但本机存储暂不可用。');
    setCharacterEditorOpen(false);
    return true;
  }

  function exportCharacter() {
    if (!activeCharacter) activeCharacter = loadCharacterModel();
    return JSON.parse(serializeCharacterModel(activeCharacter));
  }

  function installCharacter(value) {
    let source = value;
    if (typeof source === 'string') {
      try {
        source = JSON.parse(source);
      } catch (error) {
        return false;
      }
    }
    const normalized = normalizeCharacterModel(source);
    if (!normalized) return false;
    activeCharacter = cloneCharacterModel(normalized);
    buildCharacterSprites(activeCharacter);
    persistCharacterModel(activeCharacter);
    if (game.characterEditorOpen) {
      characterEditor.pixels = activeCharacter.pixels.slice();
      characterEditor.palette = activeCharacter.palette.slice();
      characterEditor.history = [];
      renderCharacterEditorNow();
    }
    if (ensureDom()) draw();
    return true;
  }

  function characterPreviewDataUrl(scale = 10) {
    if (!activeCharacter) activeCharacter = loadCharacterModel();
    const source = document.createElement('canvas');
    if (!drawCharacterModelToCanvas(source, activeCharacter)) return '';
    const safeScale = Math.max(2, Math.min(24, Math.round(Number(scale) || 10)));
    const preview = document.createElement('canvas');
    preview.width = CHARACTER_WIDTH * safeScale;
    preview.height = CHARACTER_HEIGHT * safeScale;
    const target = preview.getContext('2d', { alpha: true, colorSpace: 'srgb' });
    if (!target) return '';
    target.imageSmoothingEnabled = false;
    target.clearRect(0, 0, preview.width, preview.height);
    target.drawImage(source, 0, 0, preview.width, preview.height);
    return preview.toDataURL('image/png');
  }

  function ensureDom() {
    if (context && dom.canvas?.isConnected) return true;
    dom.dialog = document.getElementById('neteaseLoginDialog');
    dom.title = document.getElementById('neteaseLoginTitle');
    dom.subtitle = document.getElementById('loginProviderSubtitle');
    dom.scene = document.getElementById('pixelLoginScene');
    dom.canvas = document.getElementById('pixelLoginCanvas');
    dom.viewport = dom.canvas?.closest('.pixel-login-viewport') || null;
    dom.helpPanel = document.getElementById('pixelLoginHelp')?.closest('.pixel-login-help') || null;
    dom.level = document.getElementById('pixelLoginLevelLabel');
    dom.status = document.getElementById('pixelLoginStatus');
    dom.seed = document.getElementById('pixelLoginSeedLabel');
    dom.help = document.getElementById('pixelLoginHelp');
    dom.drawer = document.getElementById('pixelLoginAuthDrawer');
    dom.authBack = document.getElementById('pixelLoginAuthBack');
    dom.authMark = document.getElementById('pixelLoginAuthProviderMark');
    dom.authName = document.getElementById('pixelLoginAuthProviderName');
    dom.authNotice = document.getElementById('pixelLoginAuthNotice');
    dom.providerTabs = document.getElementById('loginProviderTabs');
    dom.browserStage = document.getElementById('browserLoginStage');
    dom.controls = Array.from(document.querySelectorAll('[data-pixel-control]'));
    dom.providerShortcuts = Array.from(document.querySelectorAll('[data-pixel-provider-shortcut]'));
    dom.characterEditor = document.getElementById('pixelCharacterEditor');
    dom.characterEditorOpen = document.getElementById('pixelCharacterEditorOpen');
    dom.characterEditorClose = document.getElementById('pixelCharacterEditorClose');
    dom.characterEditorCanvas = document.getElementById('pixelCharacterEditorCanvas');
    dom.characterPreviewCanvas = document.getElementById('pixelCharacterPreviewCanvas');
    dom.characterPalette = document.getElementById('pixelCharacterPalette');
    dom.characterColorInput = document.getElementById('pixelCharacterColorInput');
    dom.characterToolButtons = Array.from(document.querySelectorAll('[data-character-tool]'));
    dom.characterUndo = document.getElementById('pixelCharacterUndo');
    dom.characterClear = document.getElementById('pixelCharacterClear');
    dom.characterReset = document.getElementById('pixelCharacterReset');
    dom.characterCancel = document.getElementById('pixelCharacterCancel');
    dom.characterSave = document.getElementById('pixelCharacterSave');
    dom.characterEditorStatus = document.getElementById('pixelCharacterEditorStatus');

    if (!dom.dialog || !dom.scene || !dom.canvas || !dom.status || !dom.seed
      || !dom.drawer || !dom.authBack || !dom.authMark || !dom.authName || !dom.authNotice) return false;

    context = dom.canvas.getContext('2d', { alpha: false });
    if (!context) return false;
    context.imageSmoothingEnabled = false;
    dom.canvas.tabIndex = dom.canvas.tabIndex >= 0 ? dom.canvas.tabIndex : 0;
    dom.canvas.setAttribute('role', 'application');
    dom.canvas.setAttribute('aria-label', '像素登录冒险。按 A 和 D 移动，按空格跳跃并从下方顶音乐平台方块。');
    dom.canvas.setAttribute('aria-describedby', 'pixelLoginHelp pixelLoginStatus');
    dom.scene.style.setProperty('--secret-progress', '0');
    dom.scene.style.setProperty('--hell-darkness', '0');
    dom.scene.style.setProperty('--hell-glitch', '0');
    ensureActiveCharacter();
    ensureCharacterPaletteButtons();
    bindEvents();
    resizeCanvas();
    return true;
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    window.addEventListener('keydown', handleKeyDown, { passive: false });
    window.addEventListener('keydown', handleAuthEscape, true);
    window.addEventListener('keydown', handleDialogFocusTrap, true);
    window.addEventListener('keyup', handleKeyUp, { passive: false });
    window.addEventListener('blur', resetInput);
    window.addEventListener('resize', resizeCanvas, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!game.open || game.drawerOpen || game.characterEditorOpen) return;
      if (document.hidden) stopLoop();
      else startLoop();
    });
    dom.authBack.addEventListener('click', returnToScene);
    dom.viewport?.addEventListener('dragenter', handleApiPackageDragOver);
    dom.viewport?.addEventListener('dragover', handleApiPackageDragOver);
    dom.viewport?.addEventListener('dragleave', handleApiPackageDragLeave);
    dom.viewport?.addEventListener('drop', handleApiPackageDrop);
    window.addEventListener('dragend', clearApiPackageDropTarget);
    dom.controls.forEach(bindTouchControl);
    dom.characterEditorOpen?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setCharacterEditorOpen(true);
    });
    dom.characterEditorClose?.addEventListener('click', () => setCharacterEditorOpen(false));
    dom.characterCancel?.addEventListener('click', () => setCharacterEditorOpen(false));
    dom.characterSave?.addEventListener('click', saveCharacterDraft);
    dom.characterUndo?.addEventListener('click', undoCharacterEdit);
    dom.characterClear?.addEventListener('click', clearCharacterDraft);
    dom.characterReset?.addEventListener('click', resetCharacterDraft);
    dom.characterToolButtons?.forEach((button) => {
      button.addEventListener('click', () => setCharacterEditorTool(button.dataset.characterTool));
    });
    dom.characterColorInput?.addEventListener('input', () => {
      characterEditor.palette[characterEditor.colorIndex] = normalizeCharacterColor(
        dom.characterColorInput.value,
        DEFAULT_CHARACTER_PALETTE[characterEditor.colorIndex]
      );
      setCharacterEditorTool('pencil');
    });
    dom.characterEditorCanvas?.addEventListener('pointerdown', handleCharacterPointerDown, { passive: false });
    dom.characterEditorCanvas?.addEventListener('pointermove', handleCharacterPointerMove, { passive: false });
    dom.characterEditorCanvas?.addEventListener('pointerup', releaseCharacterPointer, { passive: false });
    dom.characterEditorCanvas?.addEventListener('pointercancel', releaseCharacterPointer, { passive: false });
    dom.characterEditorCanvas?.addEventListener('lostpointercapture', releaseCharacterPointer, { passive: false });
    dom.characterEditorCanvas?.addEventListener('contextmenu', (event) => event.preventDefault());
    dom.providerShortcuts.forEach((button) => {
      button.addEventListener('click', () => activateProviderShortcut(button.dataset.pixelProviderShortcut));
    });
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(resizeCanvas);
      resizeObserver.observe(dom.canvas);
    }
    if ('MutationObserver' in window) {
      new MutationObserver(() => {
        if (dom.dialog.hidden && game.open) close();
      }).observe(dom.dialog, { attributes: true, attributeFilter: ['hidden'] });
    }
  }

  function apiPackageDragHasFiles(event) {
    const types = Array.from(event?.dataTransfer?.types || []);
    return types.includes('Files');
  }

  function clearApiPackageDropTarget() {
    dom.scene?.classList.remove('is-api-package-drop-target');
  }

  function handleApiPackageDragOver(event) {
    if (!game.open || game.drawerOpen || game.characterEditorOpen || game.transition.active
      || !apiPackageDragHasFiles(event)) return false;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    dom.scene?.classList.add('is-api-package-drop-target');
    return true;
  }

  function handleApiPackageDragLeave(event) {
    if (dom.viewport?.contains?.(event.relatedTarget)) return;
    clearApiPackageDropTarget();
  }

  function validateApiPackageFile(file) {
    const name = typeof file?.name === 'string' ? file.name.trim() : '';
    const type = typeof file?.type === 'string' ? file.type.toLowerCase() : '';
    const size = Number(file?.size);
    if (!name || !Number.isFinite(size) || size <= 0 || !Number.isSafeInteger(size)) {
      throw new Error('API 包文件无效或为空');
    }
    const zip = /\.zip$/i.test(name) || /(?:^|\/)zip(?:$|;)/i.test(type);
    const declarative = /\.(?:json|feapi)$/i.test(name) || /json/i.test(type);
    if (!zip && !declarative) throw new Error('仅支持 JSON、FEAPI 或 ZIP API 包');
    const maximum = zip ? API_PACKAGE_ZIP_MAX_BYTES : API_PACKAGE_JSON_MAX_BYTES;
    if (size > maximum) {
      throw new Error(zip ? 'ZIP API 包不能超过 25 MB' : 'API 配置不能超过 64 KB');
    }
    return { name, size, zip };
  }

  function normalizeProviderItems(items, sourceLabel) {
    if (!Array.isArray(items) || items.length < 1 || items.length > PROVIDER_IDS.length) {
      throw new Error(`${sourceLabel}的平台数量无效`);
    }
    const seen = new Set();
    return items.map((item) => {
      const id = typeof item === 'string'
        ? item.trim().toLowerCase()
        : typeof item?.id === 'string'
          ? item.id.trim().toLowerCase()
          : '';
      if (!PROVIDER_IDS.includes(id) || seen.has(id)) {
        throw new Error(`${sourceLabel}包含未知或重复的音乐平台`);
      }
      seen.add(id);
      const label = typeof item?.label === 'string' && item.label.trim()
        ? item.label.trim().slice(0, 32)
        : providerDetails(id).label;
      return { id, label };
    });
  }

  function normalizeClientInspection(inspection) {
    if (inspection?.ok === false) throw new Error(inspection.error || '客户端未能识别 API 包');
    return normalizeProviderItems(inspection?.providers, '客户端识别结果');
  }

  function assertLocalApplyMatches(payload, clientProviders) {
    if (payload?.ok === false) throw new Error(payload.error || '音乐 API 包应用失败');
    const applied = normalizeProviderItems(payload?.importedProviders, '本地应用回执');
    const clientIds = clientProviders.map((provider) => provider.id).sort();
    const appliedIds = applied.map((provider) => provider.id).sort();
    if (clientIds.length !== appliedIds.length
      || clientIds.some((id, index) => id !== appliedIds[index])) {
      throw new Error(`本地应用结果与客户端识别不一致（识别：${clientIds.join('、')}；回执：${appliedIds.join('、')}）`);
    }
  }

  function platformBlockUsesSafeSlot(block, layout) {
    if (!block || !layout || !Array.isArray(layout.segments)) return false;
    const numbers = [block.x, block.y, block.width, block.height].map(Number);
    if (!numbers.every(Number.isFinite)) return false;
    const [x, y, width, height] = numbers;
    if (width < 24 || width > 48 || height < 24 || height > 48) return false;
    if (x < layout.minX || x + width > layout.width || y < 120 || y + height > GROUND_Y - 8) return false;
    const centerX = x + width / 2;
    return layout.segments.some((segment) => (
      Number.isFinite(Number(segment?.start))
        && Number.isFinite(Number(segment?.end))
        && centerX >= Number(segment.start)
        && centerX <= Number(segment.end)
    ));
  }

  function resolveImportedProviderBlocks(providers, expectedLayout) {
    if (!expectedLayout || game.layout !== expectedLayout || !Array.isArray(expectedLayout.blocks)) {
      throw new Error('登录场景已经切换，请重新拖入 API 包');
    }
    return providers.map((provider) => {
      const block = expectedLayout.blocks.find((candidate) => candidate.provider === provider.id);
      if (!platformBlockUsesSafeSlot(block, expectedLayout)) {
        throw new Error(`${provider.label} 没有可安全生成的平台槽位`);
      }
      return block;
    });
  }

  function regenerateImportedProviderBlocks(providers, expectedLayout) {
    const targets = resolveImportedProviderBlocks(providers, expectedLayout);
    targets.forEach((block) => {
      block.previousX = block.x;
      block.previousY = block.y;
      block.bump = Math.max(Number(block.bump) || 0, 0.88);
      block.spawn = 1;
    });
    return targets;
  }

  async function handleApiPackageDrop(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    clearApiPackageDropTarget();
    if (apiPackageImporting) return { ok: false, error: 'API 包正在导入' };
    const files = Array.from(event?.dataTransfer?.files || []);
    const expectedLayout = game.layout;
    try {
      if (!game.open || game.drawerOpen || game.characterEditorOpen || game.transition.active || !expectedLayout) {
        throw new Error('当前登录场景不能接收 API 包');
      }
      if (files.length !== 1) throw new Error('每次只能拖入一个 API 包');
      const file = files[0];
      validateApiPackageFile(file);
      if (typeof window.feMusicApiPackageClient?.inspect !== 'function') {
        throw new Error('客户端音乐 API 包识别器尚未就绪');
      }
      if (typeof window.feMusicApiImportFile !== 'function') {
        throw new Error('音乐 API 导入服务尚未就绪');
      }
      apiPackageImporting = true;
      dom.scene?.classList.add('is-api-package-importing');
      setStatus(`正在由客户端识别 ${file.name}`);
      const inspection = await window.feMusicApiPackageClient.inspect(file);
      if (!game.open || game.drawerOpen || game.characterEditorOpen || game.transition.active
        || game.layout !== expectedLayout) {
        throw new Error('登录场景已经切换，请重新拖入 API 包');
      }
      const providers = normalizeClientInspection(inspection);
      resolveImportedProviderBlocks(providers, expectedLayout);
      const labels = providers.map((provider) => provider.label).join('、');
      setStatus(`客户端已识别：${labels} · 正在应用 API 包`);
      const payload = await window.feMusicApiImportFile(file, {
        inspection: { ...inspection, providers }
      });
      if (!game.open || game.drawerOpen || game.characterEditorOpen || game.transition.active
        || game.layout !== expectedLayout) {
        throw new Error('登录场景已经切换，请重新拖入 API 包');
      }
      assertLocalApplyMatches(payload, providers);
      regenerateImportedProviderBlocks(providers, expectedLayout);
      setStatus(`客户端已识别并应用：${labels}；音乐方块已在安全槽位生成`);
      return { ok: true, providers: providers.map((provider) => provider.id) };
    } catch (error) {
      const message = error && typeof error.message === 'string' && error.message.trim()
        ? error.message.trim().slice(0, 180)
        : 'API 包未能应用到登录场景';
      setStatus(`API 包未应用：${message}`);
      return { ok: false, error: message };
    } finally {
      apiPackageImporting = false;
      dom.scene?.classList.remove('is-api-package-importing');
    }
  }

  function bindTouchControl(button) {
    const control = button.dataset.pixelControl;
    if (!Object.prototype.hasOwnProperty.call(game.touch, control)) return;
    const press = (event) => {
      if (!sceneIsInteractive()) return;
      event.preventDefault();
      primeAudio();
      game.touch[control].add(event.pointerId);
      button.classList.add('is-pressed');
      button.setAttribute('aria-pressed', 'true');
      if (control === 'jump') game.jumpQueued = true;
      try {
        button.setPointerCapture(event.pointerId);
      } catch (error) {
      }
    };
    const release = (event) => {
      game.touch[control].delete(event.pointerId);
      if (game.touch[control].size === 0) {
        button.classList.remove('is-pressed');
        button.setAttribute('aria-pressed', 'false');
      }
    };
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('pointerdown', press, { passive: false });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('click', (event) => {
      // Pointer activation is already handled above. A zero-detail click is
      // generated by Enter/Space or assistive technology and needs an
      // equivalent short control pulse.
      if (event.detail !== 0 || !sceneIsInteractive()) return;
      primeAudio();
      const keyboardToken = `keyboard-${control}`;
      game.touch[control].add(keyboardToken);
      button.classList.add('is-pressed');
      button.setAttribute('aria-pressed', 'true');
      if (control === 'jump') game.jumpQueued = true;
      window.setTimeout(() => {
        game.touch[control].delete(keyboardToken);
        if (game.touch[control].size === 0) {
          button.classList.remove('is-pressed');
          button.setAttribute('aria-pressed', 'false');
        }
      }, control === 'jump' ? 120 : 220);
    });
  }

  function isTypingTarget(target) {
    return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"]');
  }

  function isUiControlTarget(target) {
    return target instanceof Element
      && target !== dom.canvas
      && !!target.closest('button, a[href], input, textarea, select, [contenteditable="true"]');
  }

  function handleKeyDown(event) {
    if (!sceneIsInteractive() || event.defaultPrevented || isTypingTarget(event.target) || isUiControlTarget(event.target)) return;
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') {
      event.preventDefault();
      primeAudio();
      game.keyboard.left = true;
      if (event.code === 'KeyA') game.keyboard.aHeld = true;
      return;
    }
    if (event.code === 'KeyD' || event.code === 'ArrowRight') {
      event.preventDefault();
      primeAudio();
      game.keyboard.right = true;
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      primeAudio();
      if (!event.repeat) game.jumpQueued = true;
    }
  }

  function handleAuthEscape(event) {
    if (!game.open || event.key !== 'Escape') return;
    if (game.characterEditorOpen) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setCharacterEditorOpen(false);
      return;
    }
    if (!game.drawerOpen) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    returnToScene();
  }

  function handleDialogFocusTrap(event) {
    if (!game.open || dom.dialog?.hidden || event.key !== 'Tab') return;
    const focusable = Array.from(dom.dialog.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => {
      if (element.closest('[hidden], [inert]')) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    let next = null;
    if (!dom.dialog.contains(active)) next = event.shiftKey ? last : first;
    else if (event.shiftKey && active === first) next = last;
    else if (!event.shiftKey && active === last) next = first;
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    next.focus({ preventScroll: true });
  }

  function handleKeyUp(event) {
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') {
      game.keyboard.left = false;
      if (event.code === 'KeyA') game.keyboard.aHeld = false;
      if (game.open && !isTypingTarget(event.target) && !isUiControlTarget(event.target)) event.preventDefault();
    } else if (event.code === 'KeyD' || event.code === 'ArrowRight') {
      game.keyboard.right = false;
      if (game.open && !isTypingTarget(event.target) && !isUiControlTarget(event.target)) event.preventDefault();
    }
  }

  function resetInput() {
    game.keyboard.left = false;
    game.keyboard.right = false;
    game.keyboard.aHeld = false;
    game.jumpQueued = false;
    Object.values(game.touch).forEach((pointers) => pointers.clear());
    dom.controls?.forEach((button) => {
      button.classList.remove('is-pressed');
      button.setAttribute('aria-pressed', 'false');
    });
  }

  function resetSecret(immediate = false) {
    game.secret.held = 0;
    if (immediate) {
      game.secret.progress = 0;
      game.secret.entryUnlocked = false;
    }
    if (!dom.scene) return;
    dom.scene.style.setProperty('--secret-progress', String(game.secret.progress));
    if (immediate || game.secret.progress <= 0.001) dom.scene.classList.remove('is-secret-revealed');
  }

  function leftInputActive() {
    return !!(game.keyboard.left || game.touch.left.size > 0);
  }

  function atSecretEntrance() {
    return game.layout?.kind === 'surface'
      && game.player.x <= SECRET_ENTRY_X + 0.001;
  }

  function leftSceneProgress(heldSeconds) {
    return Math.max(0, Math.min(1,
      (Number(heldSeconds) - SECRET_LEFT_LOCK_TIME)
        / (SECRET_DRAWER_REVEAL_TIME - SECRET_LEFT_LOCK_TIME)));
  }

  function sceneIsInteractive() {
    return game.open && !game.drawerOpen && !game.characterEditorOpen && !game.transition.active
      && dom.scene && !dom.scene.hidden && !dom.dialog?.hidden;
  }

  function randomSeed() {
    const buffer = new Uint32Array(1);
    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(buffer);
    else buffer[0] = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    return buffer[0] || 0x51f15e;
  }

  function randomGenerator(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let next = value;
      next = Math.imul(next ^ (next >>> 15), next | 1);
      next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
      return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomInt(random, minimum, maximum) {
    return minimum + Math.floor(random() * (maximum - minimum + 1));
  }

  function shuffled(values, random) {
    const result = values.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  function groundSegments(width, gaps, minimumX = 0) {
    const segments = [];
    let start = minimumX;
    gaps.forEach(([left, right]) => {
      segments.push({ start, end: left, y: GROUND_Y });
      start = right;
    });
    segments.push({ start, end: width, y: GROUND_Y });
    return segments;
  }

  function createLayout() {
    const seed = randomSeed();
    const random = randomGenerator(seed);
    const candidates = SAFE_LAYOUTS.filter((layout) => layout.id !== lastTemplateId);
    const template = candidates[Math.floor(random() * candidates.length)] || SAFE_LAYOUTS[0];
    lastTemplateId = template.id;
    const providerOrder = shuffled(PROVIDER_IDS, random);
    const blocks = template.slots.map(([baseX, baseY], index) => ({
      provider: providerOrder[index],
      x: baseX + randomInt(random, -18, 18),
      y: Math.max(168, Math.min(202, baseY + randomInt(random, -2, 2) * 4)),
      width: 34,
      height: 34,
      bump: 0
    }));
    const monsters = template.enemies.map(([baseX, minimum, maximum], index) => ({
      x: baseX + randomInt(random, -34, 34),
      y: GROUND_Y - 18,
      width: 22,
      height: 18,
      minimum,
      maximum,
      speed: 24 + randomInt(random, 0, 15),
      direction: random() > 0.5 ? 1 : -1,
      color: index % 2 ? '#f27d66' : '#a5e46f',
      dead: false
    }));
    const stars = Array.from({ length: 42 }, () => ({
      x: random() * template.width,
      y: 20 + random() * 132,
      size: randomInt(random, 1, 3),
      tone: random() > 0.7 ? '#ffe8a3' : '#d4f4ff'
    }));
    const hills = Array.from({ length: 14 }, (_, index) => ({
      x: index * 150 + randomInt(random, -60, 60),
      width: randomInt(random, 100, 210),
      height: randomInt(random, 30, 92)
    }));
    const clouds = Array.from({ length: 9 }, (_, index) => ({
      x: index * 230 + randomInt(random, -80, 80),
      y: randomInt(random, 42, 118),
      width: randomInt(random, 38, 74)
    }));
    return {
      id: template.id,
      kind: 'surface',
      minX: SECRET_WORLD_MIN_X,
      secretExitX: SECRET_WORLD_MIN_X + SECRET_EXIT_OFFSET,
      width: template.width,
      seed,
      gaps: template.gaps.map((gap) => gap.slice()),
      segments: groundSegments(template.width, template.gaps, SECRET_WORLD_MIN_X),
      blocks,
      monsters,
      stars,
      hills,
      clouds,
      sky: template.sky,
      ground: template.ground
    };
  }

  function createHellLayout() {
    const seed = randomSeed();
    const random = randomGenerator(seed);
    const width = 1880;
    const gaps = [[430, 488], [890, 948], [1370, 1428]];
    const providerOrder = shuffled(PROVIDER_IDS, random);
    const slots = [
      { x: 210, y: 190, minX: 120, maxX: 258 },
      { x: 690, y: 184, minX: 620, maxX: 733 },
      { x: 1145, y: 196, minX: 1080, maxX: 1206 },
      { x: 1625, y: 180, minX: 1570, maxX: 1678 }
    ];
    const blocks = slots.map((slot, index) => {
      const x = slot.x + randomInt(random, -8, 8);
      const y = slot.y + randomInt(random, -4, 4);
      return {
        provider: providerOrder[index],
        x,
        y,
        previousX: x,
        previousY: y,
        originX: slot.x,
        originY: slot.y,
        minX: slot.minX,
        maxX: slot.maxX,
        minY: 174,
        maxY: 204,
        width: 34,
        height: 34,
        vx: 0,
        vy: 0,
        phase: random() * Math.PI * 2,
        frequencyX: 0.54 + random() * 0.22,
        frequencyY: 0.72 + random() * 0.24,
        pressure: 0,
        tired: 0,
        attackCooldown: 0.48 + random() * 0.72,
        attackFlash: 0,
        bump: 0
      };
    });
    const stars = Array.from({ length: 58 }, () => ({
      x: random() * width,
      y: 18 + random() * 178,
      size: randomInt(random, 1, 3),
      tone: random() > 0.72 ? '#ffd36b' : '#d94736'
    }));
    const hills = Array.from({ length: 16 }, (_, index) => ({
      x: index * 132 + randomInt(random, -52, 52),
      width: randomInt(random, 86, 190),
      height: randomInt(random, 46, 128)
    }));
    const clouds = Array.from({ length: 8 }, (_, index) => ({
      x: index * 260 + randomInt(random, -72, 72),
      y: randomInt(random, 54, 142),
      width: randomInt(random, 42, 86)
    }));
    const vents = [340, 815, 1288, 1760].map((x, index) => ({
      x,
      width: 34,
      period: 3.6,
      offset: index * 0.83 + random() * 0.42
    }));
    const crushers = [515, 980, 1470].map((x, index) => ({
      x,
      width: 42,
      period: 4.4,
      offset: index * 1.17 + random() * 0.36
    }));
    const launchers = [392, 852, 1332].map((x) => ({
      x,
      width: 28,
      cooldown: 0,
      pulse: 0
    }));
    return {
      id: 'inferno-echo',
      kind: 'hell',
      minX: 0,
      secretExitX: -Infinity,
      width,
      seed,
      gaps,
      segments: groundSegments(width, gaps),
      blocks,
      monsters: [],
      stars,
      hills,
      clouds,
      vents,
      crushers,
      launchers,
      projectiles: [],
      checkpoints: [72, 575, 1040, 1530],
      sky: ['#12070d', '#351018', '#6c201e'],
      ground: ['#9b4430', '#4c201d', '#1d1014']
    };
  }

  function providerDetails(id) {
    try {
      if (typeof providerInfo === 'function') return providerInfo(id);
    } catch (error) {
    }
    const fallbackLabels = { netease: '网易云', qq: 'QQ音乐', kugou: '酷狗音乐', qishui: '汽水音乐' };
    return { id, label: fallbackLabels[id] || id };
  }

  function isProviderConfigured(id) {
    try {
      return typeof providerConfigured === 'function' && providerConfigured(id);
    } catch (error) {
      return false;
    }
  }

  function isProviderLoggedIn(id) {
    if (!isProviderConfigured(id)) return false;
    try {
      return !!(typeof state === 'object' && state?.loginStatusByProvider?.[id]?.loggedIn);
    } catch (error) {
      return false;
    }
  }

  function setStatus(message) {
    if (dom.status) dom.status.textContent = message;
  }

  function unlockAchievement(id) {
    try {
      const result = window.feAchievements?.unlock?.(id);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (error) {
    }
  }

  async function prepareSecretEligibility(secret) {
    secret.eligibilityReady = false;
    secret.eligible = false;
    try {
      await Promise.resolve(window.feAchievements?.ready);
    } catch (error) {
    }
    if (!game.open || game.secret !== secret) return false;
    let alreadyUnlocked = true;
    try {
      alreadyUnlocked = window.feAchievements?.isUnlocked?.('secret-left') !== false;
    } catch (error) {
    }
    secret.eligibilityReady = true;
    secret.eligible = !alreadyUnlocked;
    return secret.eligible;
  }

  function primeAudio() {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return null;
    try {
      if (!audioContext) audioContext = new AudioContextConstructor();
      if (audioContext.state === 'suspended') void audioContext.resume();
      return audioContext;
    } catch (error) {
      return null;
    }
  }

  function playBumpSound() {
    const audio = primeAudio();
    if (!audio) return;
    const start = audio.currentTime;
    const gain = audio.createGain();
    const oscillator = audio.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(294, start);
    oscillator.frequency.setValueAtTime(392, start + 0.045);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.085, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.115);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.12);
  }

  function playHellTransitionSound() {
    const audio = primeAudio();
    if (!audio) return;
    const start = audio.currentTime;
    const gain = audio.createGain();
    const low = audio.createOscillator();
    const fracture = audio.createOscillator();
    low.type = 'sawtooth';
    fracture.type = 'square';
    low.frequency.setValueAtTime(96, start);
    low.frequency.exponentialRampToValueAtTime(38, start + 0.72);
    fracture.frequency.setValueAtTime(230, start);
    fracture.frequency.exponentialRampToValueAtTime(54, start + 0.46);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.105, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.82);
    low.connect(gain);
    fracture.connect(gain);
    gain.connect(audio.destination);
    low.start(start);
    fracture.start(start);
    low.stop(start + 0.84);
    fracture.stop(start + 0.58);
  }

  function isHellLevel() {
    return game.layout?.kind === 'hell';
  }

  function setHellTransitionFx(darkness = 0, glitch = 0) {
    if (!dom.scene) return;
    game.transition.darkness = Math.max(0, Math.min(1, darkness));
    game.transition.glitch = Math.max(0, Math.min(1, glitch));
    dom.scene.style.setProperty('--hell-darkness', game.transition.darkness.toFixed(3));
    dom.scene.style.setProperty('--hell-glitch', game.transition.glitch.toFixed(3));
    dom.scene.classList.toggle('is-hell-transitioning', game.transition.active);
  }

  function syncLevelUi() {
    if (!dom.scene || !game.layout) return;
    const hell = isHellLevel();
    dom.scene.classList.toggle('is-hell-level', hell);
    if (dom.level) dom.level.textContent = hell ? 'LEVEL · INFERNO ECHO' : 'LEVEL · MUSIC GATE';
    dom.seed.textContent = `WORLD ${game.layout.seed.toString(16).toUpperCase().padStart(8, '0')} · ${game.layout.id}`;
    if (dom.help) {
      dom.help.textContent = hell
        ? '地狱方块会在安全区域内漂移并躲开玩家。持续逼近会耗尽它的排斥能量；过热停机后，直接碰到方块即可进入对应平台。'
        : '走到平台方块下方，跳起来顶一下。发光方块表示该平台已登录，再顶一次即可切换账号。';
    }
    dom.canvas.setAttribute(
      'aria-label',
      hell
        ? '地狱回声像素关卡。按 A 向左，D 向右，空格跳跃。追逐会逃跑的音乐平台方块，等待它过热后触碰。'
        : '音乐平台像素冒险。按 A 向左，D 向右，空格跳跃，顶中平台方块登录。'
    );
  }

  function setProviderOnly(providerOnly) {
    game.providerOnly = providerOnly === true;
    if (!dom.drawer) return;
    dom.drawer.classList.toggle('is-provider-only', game.providerOnly);
    if (!dom.providerTabs) return;
    dom.providerTabs.inert = game.providerOnly;
    if (game.providerOnly) dom.providerTabs.setAttribute('aria-hidden', 'true');
    else dom.providerTabs.removeAttribute('aria-hidden');
  }

  function openAuthDrawer(id, configured, loggedIn, options = {}) {
    const info = providerDetails(id);
    const art = PROVIDER_ART[id];
    game.drawerOpen = true;
    stopLoop();
    resetInput();
    resetSecret(true);
    dom.scene.setAttribute('aria-hidden', 'true');
    dom.scene.inert = true;
    dom.drawer.hidden = false;
    dom.drawer.setAttribute('aria-hidden', 'false');
    // Let the drawer render once in its resting state so its entrance
    // transition remains visible instead of appearing at its final state.
    void dom.drawer.offsetWidth;
    dom.dialog.classList.add('is-pixel-auth-open');
    dom.drawer.dataset.provider = id;
    dom.drawer.dataset.locked = String(!configured);
    dom.drawer.classList.toggle('is-provider-locked', !configured);
    setProviderOnly(options.providerOnly === true);
    dom.authMark.textContent = art.letter;
    dom.authMark.dataset.provider = id;
    dom.authMark.style.setProperty('--pixel-provider-color', art.color);
    dom.authMark.style.borderColor = art.color;
    dom.authMark.style.backgroundColor = art.dark;
    dom.authMark.style.color = '#fffdf3';
    dom.authName.textContent = info.label;
    dom.authNotice.hidden = false;
    if (dom.browserStage) dom.browserStage.hidden = !configured;

    if (!configured) {
      dom.authNotice.textContent = `${info.label} API 插件尚未配置，请先在下方导入可信插件。当前音乐平台不会被切换。`;
      if (dom.title) dom.title.textContent = `${info.label}尚未配置`;
      if (dom.subtitle) dom.subtitle.textContent = '导入 API 插件后即可登录或切换账号';
    } else if (id === 'qishui' && loggedIn) {
      dom.authNotice.textContent = '当前汽水音乐授权已登录。请在下方重新填写 OpenAPI 授权，以切换账号。';
    } else if (id === 'qishui') {
      dom.authNotice.textContent = '请在下方填写并验证汽水音乐 OpenAPI 授权。';
    } else if (loggedIn) {
      dom.authNotice.textContent = typeof ANDROID_CLIENT !== 'undefined' && ANDROID_CLIENT
        ? `${info.label}已登录，请使用下方本机登录服务切换账号。`
        : `正在清除${info.label}当前本机会话，并打开新的官方扫码窗口。`;
    } else {
      dom.authNotice.textContent = `请在下方打开${info.label}官方扫码登录窗口。`;
    }
    if (options.focus !== false) {
      window.setTimeout(() => dom.authBack.focus({ preventScroll: true }), 0);
    }
  }

  function activeProviderId() {
    try {
      if (typeof state === 'object' && PROVIDER_IDS.includes(state?.activeProvider)) {
        return state.activeProvider;
      }
    } catch (error) {
    }
    const activeTab = dom.providerTabs?.querySelector('[data-login-provider].is-active');
    if (PROVIDER_IDS.includes(activeTab?.dataset.loginProvider)) return activeTab.dataset.loginProvider;
    return PROVIDER_IDS.find(isProviderConfigured) || PROVIDER_IDS[0];
  }

  function openAllProvidersDrawer() {
    if (game.drawerOpen) return;
    const id = activeProviderId();
    openAuthDrawer(id, isProviderConfigured(id), isProviderLoggedIn(id), { providerOnly: false });
  }

  function activateProviderBlock(block) {
    if (game.drawerOpen) return;
    block.bump = 1;
    playBumpSound();
    game.hitProviders.add(block.provider);
    if (game.hitProviders.size === 1) unlockAchievement('first-block');
    if (game.hitProviders.size === PROVIDER_IDS.length) unlockAchievement('all-platforms');

    const id = block.provider;
    const info = providerDetails(id);
    const configured = isProviderConfigured(id);
    const loggedIn = isProviderLoggedIn(id);
    setStatus(`${info.label}方块已触发${loggedIn ? ' · 已登录' : ''}`);
    if (!configured) {
      openAuthDrawer(id, false, false, { providerOnly: true });
      return;
    }

    let selected = false;
    game.drawerOpen = true;
    dom.drawer.dataset.provider = id;
    setProviderOnly(true);
    try {
      selected = typeof setActiveProvider === 'function' && setActiveProvider(id) !== false;
    } catch (error) {
      selected = false;
    }
    openAuthDrawer(id, selected, loggedIn, { providerOnly: true });
    if (!selected) {
      dom.authNotice.textContent = `${info.label}暂时不可用，请检查 API 插件状态。`;
      return;
    }
    if (loggedIn && OFFICIAL_PROVIDERS.has(id)
      && !(typeof ANDROID_CLIENT !== 'undefined' && ANDROID_CLIENT)) {
      Promise.resolve().then(() => {
        if (typeof switchOfficialBrowserAccount === 'function') return switchOfficialBrowserAccount();
        throw new Error('当前客户端不支持切换账号');
      }).catch((error) => {
        dom.authNotice.textContent = error?.message || `${info.label}账号切换失败，请重试。`;
      });
    }
  }

  function activateProviderShortcut(id) {
    if (!sceneIsInteractive() || !PROVIDER_IDS.includes(id) || !game.layout) return;
    const block = game.layout.blocks.find((candidate) => candidate.provider === id);
    if (block) activateProviderBlock(block);
  }

  function groundIndexAt(x) {
    if (!game.layout) return -1;
    return game.layout.segments.findIndex((segment) => x >= segment.start && x <= segment.end);
  }

  function rectanglesOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x
      && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  function respawn(message, spawnX = 72) {
    const next = createPlayer(spawnX);
    Object.assign(game.player, next);
    game.player.lastGroundIndex = Math.max(0, groundIndexAt(spawnX + game.player.width / 2));
    game.cameraX = Math.max(game.layout?.minX || 0, spawnX - 72);
    game.jumpQueued = false;
    setStatus(message);
  }

  function shouldEnterHell() {
    game.deathsSinceHell += 1;
    if (game.deathsSinceHell >= HELL_PITY_DEATHS) return true;
    const chance = HELL_ENTRY_CHANCE + (game.deathsSinceHell - 1) * 0.12;
    const roll = typeof game.deathRandom === 'function' ? game.deathRandom() : Math.random();
    return roll < chance;
  }

  function beginHellTransition(reason) {
    const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    game.transition = {
      ...createTransitionState(),
      active: true,
      phase: 'fade-out',
      reason,
      reduced
    };
    game.deathsSinceHell = 0;
    resetInput();
    resetSecret(true);
    dom.scene?.setAttribute('aria-busy', 'true');
    setHellTransitionFx(0, 0);
    setStatus('死亡信号发生畸变 · 正在坠入未知频道');
    playHellTransitionSound();
  }

  function enterHellLevel() {
    game.layout = createHellLayout();
    game.seed = game.layout.seed;
    game.levelTime = 0;
    game.cameraX = 0;
    game.checkpointX = game.layout.checkpoints[0];
    game.hellHintShown = false;
    game.player = createPlayer(game.checkpointX);
    game.player.lastGroundIndex = Math.max(0, groundIndexAt(game.player.x + game.player.width / 2));
    game.jumpQueued = false;
    resetSecret(true);
    syncLevelUi();
  }

  function updateHellTransition(step) {
    const transition = game.transition;
    if (!transition.active) return;
    const fadeOutDuration = transition.reduced ? 0.08 : HELL_TRANSITION_FADE_OUT;
    const glitchDuration = transition.reduced ? 0.04 : HELL_TRANSITION_GLITCH;
    const fadeInDuration = transition.reduced ? 0.08 : HELL_TRANSITION_FADE_IN;
    transition.elapsed += step;

    if (transition.phase === 'fade-out') {
      const progress = Math.min(1, transition.elapsed / fadeOutDuration);
      setHellTransitionFx(progress * progress * (3 - 2 * progress), Math.max(0, progress - 0.44) * 1.2);
      if (progress < 1) return;
      transition.phase = 'glitch';
      transition.elapsed = 0;
      return;
    }

    if (transition.phase === 'glitch') {
      const progress = Math.min(1, transition.elapsed / glitchDuration);
      setHellTransitionFx(1, transition.reduced ? 0 : 0.72 + Math.sin(progress * Math.PI * 9) * 0.2);
      if (!transition.swapped && progress >= 0.42) {
        transition.swapped = true;
        enterHellLevel();
      }
      if (progress < 1) return;
      if (!transition.swapped) enterHellLevel();
      transition.swapped = true;
      transition.phase = 'fade-in';
      transition.elapsed = 0;
      return;
    }

    const progress = Math.min(1, transition.elapsed / fadeInDuration);
    const remaining = 1 - progress;
    setHellTransitionFx(remaining * remaining, transition.reduced ? 0 : remaining * 0.62);
    if (progress < 1) return;
    game.transition = createTransitionState();
    dom.scene?.removeAttribute('aria-busy');
    setHellTransitionFx(0, 0);
    setStatus('地狱回声 · 持续追赶会让音乐方块过热停机');
  }

  function handlePlayerDeath(reason) {
    if (game.transition.active) return;
    if (isHellLevel()) {
      respawn(`${reason} · 最近的余烬祭坛已重构你`, game.checkpointX);
      return;
    }
    if (shouldEnterHell()) {
      beginHellTransition(reason);
      return;
    }
    respawn(`${reason} · 已返回安全营地`);
  }

  function damagePlayer(amount, reason, sourceX = game.player.x) {
    const player = game.player;
    if (!player || game.transition.active || player.invulnerability > 0) return false;
    const damage = Math.max(1, Math.floor(Number(amount) || 1));
    player.health = Math.max(0, player.health - damage);
    if (player.health <= 0) {
      handlePlayerDeath(reason);
      return true;
    }
    const playerCenterX = player.x + player.width / 2;
    const knockbackDirection = playerCenterX >= sourceX ? 1 : -1;
    player.invulnerability = PLAYER_HIT_INVULNERABILITY;
    player.hitFlash = 1;
    player.knockbackX = knockbackDirection * 112;
    player.vy = Math.min(player.vy, -158);
    player.onGround = false;
    setStatus(`${reason} · 剩余 ${player.health}/${player.maxHealth} 颗像素心`);
    return true;
  }

  function spawnHellProjectile(block, playerCenterX, playerCenterY) {
    const projectiles = game.layout?.projectiles;
    if (!Array.isArray(projectiles) || projectiles.length >= HELL_PROJECTILE_LIMIT) return false;
    const x = block.x + block.width / 2;
    const y = block.y + block.height / 2;
    const deltaX = playerCenterX - x;
    const deltaY = playerCenterY - y;
    const distance = Math.max(1, Math.hypot(deltaX, deltaY));
    projectiles.push({
      x: x - 3,
      y: y - 3,
      width: 6,
      height: 6,
      vx: deltaX / distance * HELL_BLOCK_PROJECTILE_SPEED,
      vy: deltaY / distance * HELL_BLOCK_PROJECTILE_SPEED,
      life: 3.2,
      provider: block.provider
    });
    block.attackFlash = 1;
    return true;
  }

  function updateHellBlocks(step) {
    if (!isHellLevel()) return;
    const playerCenterX = game.player.x + game.player.width / 2;
    const playerCenterY = game.player.y + game.player.height / 2;
    for (const block of game.layout.blocks) {
      block.attackCooldown = Math.max(0, (block.attackCooldown || 0) - step);
      block.attackFlash = Math.max(0, (block.attackFlash || 0) - step * 5.2);
      block.previousX = block.x;
      block.previousY = block.y;
      const blockCenterX = block.x + block.width / 2;
      const blockCenterY = block.y + block.height / 2;
      const deltaX = blockCenterX - playerCenterX;
      const deltaY = blockCenterY - playerCenterY;
      const distance = Math.hypot(deltaX, deltaY);

      if (block.tired > 0) {
        block.tired = Math.max(0, block.tired - step);
        block.vx *= Math.max(0, 1 - step * 8);
        block.vy += (Math.min(block.maxY, 200) - block.y) * step * 3.4;
        block.vy *= Math.max(0, 1 - step * 7);
      } else {
        const wanderX = block.originX + Math.sin(game.levelTime * block.frequencyX + block.phase) * 18;
        const wanderY = block.originY + Math.sin(game.levelTime * block.frequencyY + block.phase * 1.7) * 7;
        block.vx += (wanderX - block.x) * step * 1.7;
        block.vy += (wanderY - block.y) * step * 1.45;

        if (distance < HELL_BLOCK_REPEL_RADIUS) {
          const proximity = 1 - distance / HELL_BLOCK_REPEL_RADIUS;
          const escapeDirection = Math.abs(deltaX) > 1
            ? Math.sign(deltaX)
            : (Math.sin(block.phase + game.levelTime) >= 0 ? 1 : -1);
          block.vx += escapeDirection * (64 + proximity * 74) * step;
          block.vy += Math.sign(deltaY || -1) * proximity * 18 * step;
          block.pressure = Math.min(
            1,
            block.pressure + step * (0.78 + proximity * 0.52) / HELL_BLOCK_EXHAUST_TIME
          );
          if (!game.hellHintShown) {
            game.hellHintShown = true;
            setStatus('方块正在排斥你 · 别停下，持续逼近会耗尽它');
          }
          if (block.pressure >= 1) {
            block.pressure = 0;
            block.tired = HELL_BLOCK_CATCH_WINDOW;
            block.vx *= 0.12;
            block.vy *= 0.12;
            setStatus(`${providerDetails(block.provider).label}方块已过热 · 现在直接碰到它`);
          }
        } else {
          block.pressure = Math.max(0, block.pressure - step * 0.12);
        }
      }

      block.vx = Math.max(-HELL_BLOCK_MAX_SPEED, Math.min(HELL_BLOCK_MAX_SPEED, block.vx));
      block.vy = Math.max(-HELL_BLOCK_VERTICAL_SPEED, Math.min(HELL_BLOCK_VERTICAL_SPEED, block.vy));
      block.x += block.vx * step;
      block.y += block.vy * step;
      if (block.x < block.minX || block.x > block.maxX) {
        block.x = Math.max(block.minX, Math.min(block.maxX, block.x));
        block.vx *= -0.35;
      }
      if (block.y < block.minY || block.y > block.maxY) {
        block.y = Math.max(block.minY, Math.min(block.maxY, block.y));
        block.vy *= -0.35;
      }
      if (block.tired <= 0 && distance <= HELL_BLOCK_ATTACK_RADIUS && block.attackCooldown <= 0) {
        if (spawnHellProjectile(block, playerCenterX, playerCenterY)) {
          const cadenceVariation = 0.16 * (0.5 + 0.5 * Math.sin(block.phase + game.levelTime));
          block.attackCooldown = HELL_BLOCK_ATTACK_COOLDOWN + cadenceVariation;
        }
      }
    }
  }

  function updateHellProjectiles(step) {
    if (!isHellLevel() || !Array.isArray(game.layout.projectiles)) return false;
    let hit = false;
    for (let index = game.layout.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = game.layout.projectiles[index];
      projectile.life -= step;
      projectile.x += projectile.vx * step;
      projectile.y += projectile.vy * step;
      const outside = projectile.life <= 0
        || projectile.x < game.layout.minX - 24
        || projectile.x > game.layout.width + 24
        || projectile.y < -24
        || projectile.y > VIEW_HEIGHT + 24;
      if (outside) {
        game.layout.projectiles.splice(index, 1);
        continue;
      }
      if (!rectanglesOverlap(game.player, projectile)) continue;
      hit = damagePlayer(1, '被音乐方块的回声弹击中', projectile.x + projectile.width / 2) || hit;
      game.layout.projectiles.splice(index, 1);
    }
    return hit;
  }

  function updatePlayer(step) {
    const player = game.player;
    player.invulnerability = Math.max(0, player.invulnerability - step);
    player.hitFlash = Math.max(0, player.hitFlash - step * 4.8);
    const movingLeft = leftInputActive();
    const movingRight = game.keyboard.right || game.touch.right.size > 0;
    let direction = Number(movingRight) - Number(movingLeft);
    const waitingForLeftScene = atSecretEntrance()
      && movingLeft
      && !movingRight
      && !game.secret.achieved
      && !game.secret.entryUnlocked;
    if (waitingForLeftScene) direction = 0;
    player.vx = direction * PLAYER_SPEED + player.knockbackX;
    if (direction) player.facing = direction;
    if (game.jumpQueued && player.onGround) {
      player.vy = -JUMP_SPEED;
      player.onGround = false;
    }
    game.jumpQueued = false;

    player.previousY = player.y;
    const previousBottom = player.y + player.height;
    const minimumPlayerX = game.layout.kind === 'surface' && !game.secret.entryUnlocked
      ? SECRET_ENTRY_X
      : game.layout.minX + 8;
    player.x = Math.max(
      minimumPlayerX,
      Math.min(game.layout.width - player.width - 8, player.x + player.vx * step)
    );
    player.knockbackX *= Math.max(0, 1 - step * 7.4);
    player.vy += GRAVITY * step;
    player.y += player.vy * step;

    if (player.vy < 0) {
      for (const block of game.layout.blocks) {
        const blockBottom = block.y + block.height;
        const previousBlockBottom = (block.previousY ?? block.y) + block.height;
        const blockLeft = Math.min(block.previousX ?? block.x, block.x);
        const blockRight = Math.max(
          (block.previousX ?? block.x) + block.width,
          block.x + block.width
        );
        const horizontal = player.x + player.width > blockLeft && player.x < blockRight;
        if (horizontal && player.previousY >= previousBlockBottom - 1 && player.y <= blockBottom) {
          player.y = blockBottom + 0.1;
          player.vy = 72;
          activateProviderBlock(block);
          break;
        }
      }
    }

    if (isHellLevel() && !game.drawerOpen) {
      const touchedBlock = game.layout.blocks.find((block) => rectanglesOverlap(player, block));
      if (touchedBlock) activateProviderBlock(touchedBlock);
    }
    if (game.drawerOpen) return;

    const centerX = player.x + player.width / 2;
    const segmentIndex = groundIndexAt(centerX);
    const currentBottom = player.y + player.height;
    player.onGround = false;
    if (segmentIndex >= 0 && player.vy >= 0 && previousBottom <= GROUND_Y + 2 && currentBottom >= GROUND_Y) {
      player.y = GROUND_Y - player.height;
      player.vy = 0;
      player.onGround = true;
      if (player.gapFromIndex >= 0 && player.gapFromIndex !== segmentIndex) {
        unlockAchievement('gap-runner');
        setStatus('断崖跨越成功 · 新路线已记录');
      }
      player.gapFromIndex = -1;
      player.lastGroundIndex = segmentIndex;
    } else if (segmentIndex < 0 && player.gapFromIndex < 0 && player.lastGroundIndex >= 0) {
      player.gapFromIndex = player.lastGroundIndex;
    }

    if (isHellLevel()) {
      for (const checkpoint of game.layout.checkpoints) {
        if (checkpoint <= player.x && checkpoint > game.checkpointX) {
          game.checkpointX = checkpoint;
          setStatus('余烬祭坛已点亮 · 死亡后将从这里重构');
        }
      }
    }

    if (player.y > VIEW_HEIGHT + 56) {
      handlePlayerDeath(isHellLevel() ? '坠入熔岩裂隙' : '跌入断崖');
    } else if (!isHellLevel() && player.x <= game.layout.secretExitX) {
      openAllProvidersDrawer();
    }
  }

  function updateMonsters(step) {
    const player = game.player;
    const previousBottom = player.previousY + player.height;
    for (const monster of game.layout.monsters) {
      if (monster.dead) continue;
      monster.x += monster.direction * monster.speed * step;
      if (monster.x <= monster.minimum || monster.x + monster.width >= monster.maximum) {
        monster.x = Math.max(monster.minimum, Math.min(monster.maximum - monster.width, monster.x));
        monster.direction *= -1;
      }
      if (!rectanglesOverlap(player, monster)) continue;
      if (player.vy > 0 && previousBottom <= monster.y + 6) {
        monster.dead = true;
        player.y = monster.y - player.height;
        player.vy = -228;
        unlockAchievement('monster-stomp');
        setStatus('踩扁了像素巡游怪 · 道路暂时安全');
      } else {
        damagePlayer(1, '碰到了像素巡游怪', monster.x + monster.width / 2);
      }
      break;
    }
  }

  function hellCycleTime(trap) {
    return (game.levelTime + trap.offset) % trap.period;
  }

  function hellVentState(vent) {
    const time = hellCycleTime(vent);
    return {
      warning: time >= 1.72 && time < 2.34,
      active: time >= 2.34 && time < 2.88
    };
  }

  function hellCrusherState(crusher) {
    const time = hellCycleTime(crusher);
    let extension = 0;
    if (time >= 2.15 && time < 2.42) extension = (time - 2.15) / 0.27;
    else if (time >= 2.42 && time < 2.82) extension = 1;
    else if (time >= 2.82 && time < 3.28) extension = 1 - (time - 2.82) / 0.46;
    return {
      warning: time >= 1.45 && time < 2.15,
      extension: Math.max(0, Math.min(1, extension))
    };
  }

  function updateHellTraps(step) {
    if (!isHellLevel()) return false;
    const player = game.player;
    const centerX = player.x + player.width / 2;
    for (const launcher of game.layout.launchers) {
      launcher.cooldown = Math.max(0, launcher.cooldown - step);
      launcher.pulse = Math.max(0, launcher.pulse - step * 2.8);
      if (!player.onGround || launcher.cooldown > 0
        || centerX < launcher.x || centerX > launcher.x + launcher.width) continue;
      launcher.cooldown = 0.9;
      launcher.pulse = 1;
      player.vy = -JUMP_SPEED * 1.08;
      player.onGround = false;
      setStatus('反重力踏板启动 · 借势越过前方裂隙');
    }

    for (const vent of game.layout.vents) {
      if (!hellVentState(vent).active) continue;
      const flame = { x: vent.x, y: GROUND_Y - 48, width: vent.width, height: 48 };
      if (rectanglesOverlap(player, flame)) {
        damagePlayer(2, '被余烬喷口灼伤', vent.x + vent.width / 2);
        return true;
      }
    }

    for (const crusher of game.layout.crushers) {
      const extension = hellCrusherState(crusher).extension;
      if (extension < 0.18) continue;
      const bottom = 42 + (GROUND_Y - 50) * extension;
      const body = { x: crusher.x, y: 30, width: crusher.width, height: bottom - 30 };
      if (rectanglesOverlap(player, body)) {
        damagePlayer(3, '被回声压机击中', crusher.x + crusher.width / 2);
        return true;
      }
    }
    return false;
  }

  function updateSecret(step) {
    if (isHellLevel()) {
      game.secret.held = 0;
      game.secret.progress = Math.max(0, game.secret.progress - step * 2.4);
      return;
    }
    if (game.secret.achieved) {
      game.secret.held = 0;
      if (!leftInputActive()) {
        game.secret.progress = Math.max(0, game.secret.progress - step * 1.8);
      }
      return;
    }
    const holdingLeft = leftInputActive() && !game.keyboard.right && game.touch.right.size === 0;
    if (holdingLeft && (atSecretEntrance() || game.secret.entryUnlocked)) {
      game.secret.held += step;
      if (game.secret.held >= SECRET_LEFT_LOCK_TIME) game.secret.entryUnlocked = true;
      game.secret.progress = leftSceneProgress(game.secret.held);
      if (game.secret.held >= SECRET_DRAWER_REVEAL_TIME && !game.secret.achieved) {
        game.secret.achieved = true;
        if (game.secret.eligible) unlockAchievement('secret-left');
        openAllProvidersDrawer();
      }
    } else {
      game.secret.held = 0;
      game.secret.progress = Math.max(0, game.secret.progress - step * 1.8);
    }
  }

  function updateCamera(step) {
    const desiredCamera = game.layout.kind === 'surface' && game.player.x >= SECRET_ENTRY_X
      ? 0
      : game.player.x < 72
        ? game.player.x - 72
        : Math.max(0, game.player.x - VIEW_WIDTH * 0.34);
    const targetCamera = Math.max(game.layout.minX, Math.min(
      game.layout.width - VIEW_WIDTH,
      desiredCamera
    ));
    game.cameraX += (targetCamera - game.cameraX) * Math.min(1, step * 8);
  }

  function update(step) {
    if (!game.layout || game.drawerOpen) return;
    if (game.transition.active) {
      updateHellTransition(step);
      return;
    }
    game.levelTime += step;
    game.layout.blocks.forEach((block) => {
      block.bump = Math.max(0, block.bump - step * 4.6);
      block.spawn = Math.max(0, (Number(block.spawn) || 0) - step * 2.8);
    });
    updateHellBlocks(step);
    updatePlayer(step);
    if (game.drawerOpen || game.transition.active) return;
    updateHellProjectiles(step);
    if (updateHellTraps(step)) return;
    if (!isHellLevel()) updateMonsters(step);
    updateSecret(step);
    updateCamera(step);
  }

  function fillGradientBands(colors) {
    const bandHeight = VIEW_HEIGHT / colors.length;
    colors.forEach((color, index) => {
      context.fillStyle = color;
      context.fillRect(0, index * bandHeight, VIEW_WIDTH, bandHeight + 1);
    });
  }

  function drawBackground() {
    const layout = game.layout;
    fillGradientBands(layout.sky);
    for (const star of layout.stars) {
      const x = Math.round(star.x - game.cameraX * 0.18);
      if (x < -4 || x > VIEW_WIDTH + 4) continue;
      context.fillStyle = star.tone;
      context.fillRect(x, Math.round(star.y), star.size, star.size);
    }
    context.fillStyle = isHellLevel() ? 'rgba(84, 35, 36, 0.48)' : 'rgba(230, 246, 255, 0.22)';
    for (const cloud of layout.clouds) {
      const x = Math.round(cloud.x - game.cameraX * 0.3);
      if (x < -cloud.width || x > VIEW_WIDTH) continue;
      context.fillRect(x, cloud.y, cloud.width, 6);
      context.fillRect(x + 8, cloud.y - 5, cloud.width - 20, 5);
    }
    for (const hill of layout.hills) {
      const x = Math.round(hill.x - game.cameraX * 0.52);
      if (x < -hill.width || x > VIEW_WIDTH) continue;
      context.fillStyle = isHellLevel() ? 'rgba(18, 3, 8, 0.62)' : 'rgba(4, 18, 26, 0.34)';
      context.beginPath();
      context.moveTo(x, GROUND_Y);
      context.lineTo(x + hill.width / 2, GROUND_Y - hill.height);
      context.lineTo(x + hill.width, GROUND_Y);
      context.closePath();
      context.fill();
    }
  }

  function drawWorld() {
    const layout = game.layout;
    const tunnelLeft = Math.round(layout.minX - game.cameraX);
    const tunnelRight = Math.round(-game.cameraX);
    if (tunnelRight > 0 && tunnelLeft < VIEW_WIDTH) {
      const visibleLeft = Math.max(0, tunnelLeft);
      const visibleRight = Math.min(VIEW_WIDTH, tunnelRight);
      context.fillStyle = 'rgba(2, 6, 11, 0.82)';
      context.fillRect(visibleLeft, 36, visibleRight - visibleLeft, GROUND_Y - 36);
      context.fillStyle = '#18242b';
      context.fillRect(visibleLeft, 36, visibleRight - visibleLeft, 12);
      context.fillStyle = '#314049';
      for (let x = tunnelLeft; x < tunnelRight; x += 32) {
        if (x > -32 && x < VIEW_WIDTH) context.fillRect(x, 40, 20, 4);
      }
      const gateX = Math.round(layout.minX + 18 - game.cameraX);
      if (gateX > -48 && gateX < VIEW_WIDTH) {
        context.fillStyle = '#070b10';
        context.fillRect(gateX, GROUND_Y - 68, 44, 68);
        PROVIDER_IDS.forEach((provider, index) => {
          context.fillStyle = PROVIDER_ART[provider].color;
          context.fillRect(
            gateX + 7 + (index % 2) * 17,
            GROUND_Y - 56 + Math.floor(index / 2) * 19,
            12,
            12
          );
        });
      }
    }
    for (const segment of layout.segments) {
      const left = Math.round(segment.start - game.cameraX);
      const right = Math.round(segment.end - game.cameraX);
      if (right < 0 || left > VIEW_WIDTH) continue;
      context.fillStyle = layout.ground[2];
      context.fillRect(left, GROUND_Y, right - left + 1, VIEW_HEIGHT - GROUND_Y);
      context.fillStyle = layout.ground[1];
      context.fillRect(left, GROUND_Y + 5, right - left + 1, 17);
      context.fillStyle = layout.ground[0];
      context.fillRect(left, GROUND_Y, right - left + 1, 6);
      context.fillStyle = 'rgba(255,255,255,0.12)';
      for (let x = left + 12; x < right; x += 28) context.fillRect(x, GROUND_Y + 10, 10, 3);
      if (layout.kind === 'hell') {
        context.fillStyle = 'rgba(255, 105, 61, 0.34)';
        for (let x = left + 19; x < right; x += 47) {
          context.fillRect(x, GROUND_Y + 2, 2, 7);
          context.fillRect(x + 2, GROUND_Y + 7, 6, 2);
        }
      }
    }
    layout.gaps.forEach(([leftEdge, rightEdge]) => {
      const left = Math.round(leftEdge - game.cameraX);
      const right = Math.round(rightEdge - game.cameraX);
      if (right < 0 || left > VIEW_WIDTH) return;
      context.fillStyle = '#05080d';
      context.fillRect(left, GROUND_Y, right - left, VIEW_HEIGHT - GROUND_Y);
      context.fillStyle = 'rgba(238, 108, 75, 0.28)';
      for (let x = left + 5; x < right - 4; x += 12) {
        context.beginPath();
        context.moveTo(x, VIEW_HEIGHT);
        context.lineTo(x + 5, VIEW_HEIGHT - 12);
        context.lineTo(x + 10, VIEW_HEIGHT);
        context.fill();
      }
    });
  }

  function drawHellTraps(timestamp) {
    if (!isHellLevel()) return;
    for (const launcher of game.layout.launchers) {
      const x = Math.round(launcher.x - game.cameraX);
      if (x < -launcher.width || x > VIEW_WIDTH) continue;
      const pulse = launcher.pulse > 0 ? Math.round(Math.sin(launcher.pulse * Math.PI) * 4) : 0;
      context.fillStyle = '#172a31';
      context.fillRect(x, GROUND_Y - 5 - pulse, launcher.width, 5 + pulse);
      context.fillStyle = launcher.pulse > 0 ? '#a8f5df' : '#4db89f';
      context.fillRect(x + 3, GROUND_Y - 8 - pulse, launcher.width - 6, 4);
      context.fillStyle = '#d9fff3';
      context.fillRect(x + 7, GROUND_Y - 7 - pulse, launcher.width - 14, 2);
    }

    for (const vent of game.layout.vents) {
      const x = Math.round(vent.x - game.cameraX);
      if (x < -vent.width || x > VIEW_WIDTH) continue;
      const state = hellVentState(vent);
      context.fillStyle = '#190d11';
      context.fillRect(x, GROUND_Y - 5, vent.width, 5);
      context.fillStyle = state.active ? '#ffe079' : state.warning ? '#e56743' : '#603029';
      for (let stripe = 3; stripe < vent.width - 2; stripe += 7) {
        context.fillRect(x + stripe, GROUND_Y - 4, 3, 3);
      }
      if (state.warning) {
        const blink = Math.sin(timestamp / 55) > 0;
        context.fillStyle = blink ? '#ffcf64' : '#9e3428';
        context.fillRect(x + vent.width / 2 - 3, GROUND_Y - 13, 6, 6);
      }
      if (state.active) {
        const flicker = Math.round((Math.sin(timestamp / 38 + vent.x) + 1) * 4);
        context.fillStyle = '#d93d2f';
        context.fillRect(x + 2, GROUND_Y - 39 - flicker, vent.width - 4, 39 + flicker);
        context.fillStyle = '#ff8f42';
        context.fillRect(x + 7, GROUND_Y - 48 + flicker, vent.width - 14, 43 - flicker);
        context.fillStyle = '#ffe06a';
        context.fillRect(x + 12, GROUND_Y - 31, vent.width - 24, 28);
      }
    }

    for (const crusher of game.layout.crushers) {
      const x = Math.round(crusher.x - game.cameraX);
      if (x < -crusher.width || x > VIEW_WIDTH) continue;
      const state = hellCrusherState(crusher);
      const bottom = Math.round(42 + (GROUND_Y - 50) * state.extension);
      context.fillStyle = '#1b1116';
      context.fillRect(x + crusher.width / 2 - 4, 0, 8, Math.max(38, bottom - 14));
      context.fillStyle = state.warning && Math.sin(timestamp / 70) > 0 ? '#ffdc67' : '#8d2b2c';
      context.fillRect(x + crusher.width / 2 - 5, 18, 10, 8);
      context.fillStyle = '#321b22';
      context.fillRect(x, bottom - 18, crusher.width, 18);
      context.fillStyle = '#8f3f38';
      context.fillRect(x + 4, bottom - 15, crusher.width - 8, 8);
      context.fillStyle = '#130b0f';
      for (let tooth = 2; tooth < crusher.width - 4; tooth += 10) {
        context.beginPath();
        context.moveTo(x + tooth, bottom);
        context.lineTo(x + tooth + 4, bottom + 7);
        context.lineTo(x + tooth + 8, bottom);
        context.fill();
      }
    }
  }

  function drawLetter(letter, centerX, top, color) {
    const rows = LETTERS[letter];
    const scale = 3;
    const width = rows[0].length * scale;
    context.fillStyle = color;
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        if (row[x] === '1') context.fillRect(Math.round(centerX - width / 2 + x * scale), top + y * scale, scale, scale);
      }
    });
  }

  function drawHellProjectiles(timestamp) {
    if (!isHellLevel() || !Array.isArray(game.layout.projectiles)) return;
    for (const projectile of game.layout.projectiles) {
      const x = Math.round(projectile.x - game.cameraX);
      const y = Math.round(projectile.y);
      if (x < -18 || x > VIEW_WIDTH + 18) continue;
      const art = PROVIDER_ART[projectile.provider] || PROVIDER_ART.netease;
      const length = Math.max(1, Math.hypot(projectile.vx, projectile.vy));
      const tailX = Math.round(projectile.vx / length * 8);
      const tailY = Math.round(projectile.vy / length * 8);
      context.strokeStyle = 'rgba(255, 113, 78, 0.42)';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(x + 3, y + 3);
      context.lineTo(x + 3 - tailX, y + 3 - tailY);
      context.stroke();
      context.fillStyle = Math.sin(timestamp / 44 + projectile.life * 5) > 0 ? '#fff2a2' : art.color;
      context.fillRect(x, y, projectile.width, projectile.height);
      context.fillStyle = '#fffdf0';
      context.fillRect(x + 2, y + 1, 2, 2);
    }
  }

  function drawBlocks(timestamp) {
    for (const block of game.layout.blocks) {
      const art = PROVIDER_ART[block.provider];
      const configured = isProviderConfigured(block.provider);
      const loggedIn = isProviderLoggedIn(block.provider);
      const lift = block.bump > 0 ? Math.sin(block.bump * Math.PI) * 4 : 0;
      const x = Math.round(block.x - game.cameraX);
      const y = Math.round(block.y - lift);
      if (x < -block.width || x > VIEW_WIDTH) continue;
      const spawn = Math.max(0, Math.min(1, Number(block.spawn) || 0));
      const spawnProgress = 1 - spawn;
      const spawnScale = spawn > 0
        ? 0.2 + 0.8 * (1 - Math.pow(1 - spawnProgress, 3))
        : 1;
      if (spawn > 0) {
        context.save();
        context.translate(x + block.width / 2, y + block.height / 2);
        context.scale(spawnScale, spawnScale);
        context.translate(-(x + block.width / 2), -(y + block.height / 2));
        context.fillStyle = `rgba(255, 238, 146, ${Math.min(0.48, spawn * 0.48)})`;
        context.fillRect(x - 8, y - 8, block.width + 16, block.height + 16);
      }
      if (isHellLevel()) {
        const tired = block.tired > 0;
        const attackPulse = Math.round((block.attackFlash || 0) * 5);
        const halo = 3 + Math.round((1 - block.pressure) * 3) + attackPulse;
        context.fillStyle = tired
          ? 'rgba(194, 255, 225, 0.28)'
          : (attackPulse > 0 ? 'rgba(255, 229, 117, 0.4)' : 'rgba(255, 81, 54, 0.2)');
        context.fillRect(x - halo, y - halo, block.width + halo * 2, block.height + halo * 2);
      }
      if (loggedIn) {
        const pulse = 2 + Math.round((Math.sin(timestamp / 180) + 1) * 1.5);
        context.fillStyle = 'rgba(255, 232, 120, 0.22)';
        context.fillRect(x - pulse, y - pulse, block.width + pulse * 2, block.height + pulse * 2);
      }
      context.fillStyle = configured ? art.dark : '#394047';
      context.fillRect(x, y, block.width, block.height);
      context.fillStyle = configured ? art.color : '#68717a';
      context.fillRect(x + 3, y + 3, block.width - 6, block.height - 6);
      context.fillStyle = loggedIn ? '#fff0a3' : 'rgba(255,255,255,0.42)';
      context.fillRect(x + 4, y + 4, block.width - 8, 3);
      drawLetter(art.letter, x + block.width / 2, y + 7, configured ? '#fffdf3' : '#b6bec5');
      if (!configured) {
        context.fillStyle = '#23282d';
        context.fillRect(x + block.width - 9, y + block.height - 9, 6, 6);
      } else if (loggedIn) {
        context.fillStyle = '#fff2a8';
        context.fillRect(x + block.width - 8, y + 3, 5, 5);
      }
      if (isHellLevel()) {
        const energy = block.tired > 0 ? 0 : Math.max(0, 1 - block.pressure);
        for (let cell = 0; cell < 4; cell += 1) {
          context.fillStyle = cell < Math.ceil(energy * 4) ? '#ff8e57' : '#352027';
          context.fillRect(x + 3 + cell * 8, y + block.height + 4, 6, 3);
        }
        if (block.tired > 0) {
          context.fillStyle = Math.sin(timestamp / 82) > 0 ? '#d9fff0' : '#5b8c80';
          context.fillRect(x - 2, y + 5, 2, block.height - 10);
          context.fillRect(x + block.width, y + 5, 2, block.height - 10);
        }
      }
      if (spawn > 0) context.restore();
    }
  }

  function drawMonsters(timestamp) {
    for (const monster of game.layout.monsters) {
      if (monster.dead) continue;
      const x = Math.round(monster.x - game.cameraX);
      if (x < -monster.width || x > VIEW_WIDTH) continue;
      const bob = Math.round(Math.sin(timestamp / 150 + monster.x) * 1.4);
      const y = Math.round(monster.y + bob);
      context.fillStyle = '#18232a';
      context.fillRect(x + 2, y + 4, monster.width - 4, monster.height - 4);
      context.fillStyle = monster.color;
      context.fillRect(x + 4, y, monster.width - 8, monster.height - 4);
      context.fillRect(x + 1, y + 7, monster.width - 2, monster.height - 9);
      context.fillStyle = '#17212a';
      context.fillRect(x + 6, y + 5, 3, 3);
      context.fillRect(x + monster.width - 9, y + 5, 3, 3);
      context.fillRect(x + 3, y + monster.height - 3, 5, 3);
      context.fillRect(x + monster.width - 8, y + monster.height - 3, 5, 3);
    }
  }

  function drawPlayer(timestamp) {
    const player = game.player;
    const x = Math.round(player.x - game.cameraX);
    const y = Math.round(player.y);
    const walking = Math.abs(player.vx) > 0 && player.onGround;
    const bob = walking && Math.sin(timestamp / 70) > 0.25 ? -1 : 0;
    ensureActiveCharacter();
    const sprite = player.hitFlash > 0
      ? (player.hitFlash > 0.45 ? characterSprites?.hitLight : characterSprites?.hitDanger)
      : characterSprites?.normal;
    if (!sprite) return;
    context.save();
    context.imageSmoothingEnabled = false;
    if (player.facing < 0) {
      context.translate(x + player.width, y + bob);
      context.scale(-1, 1);
      context.drawImage(sprite, 0, 0, player.width, player.height);
    } else {
      context.drawImage(sprite, x, y + bob, player.width, player.height);
    }
    context.restore();
  }

  function drawPixelHeart(x, y, filled) {
    const rows = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];
    rows.forEach((row, rowIndex) => {
      for (let column = 0; column < row.length; column += 1) {
        if (row[column] !== '1') continue;
        context.fillStyle = filled
          ? (rowIndex <= 1 && column <= 2 ? '#ffb59d' : '#f05252')
          : '#40242b';
        context.fillRect(x + column * 2, y + rowIndex * 2, 2, 2);
      }
    });
  }

  function drawHud() {
    context.fillStyle = 'rgba(5, 10, 16, 0.72)';
    context.fillRect(10, 10, isHellLevel() ? 360 : 344, 26);
    for (let index = 0; index < PLAYER_MAX_HEALTH; index += 1) {
      drawPixelHeart(18 + index * 15, 17, index < game.player.health);
    }
    context.fillStyle = '#f4fbff';
    context.font = '700 10px "Courier New", monospace';
    context.textBaseline = 'middle';
    context.fillText(
      isHellLevel()
        ? `INFERNO  躲避 / 追逐  ${game.hitProviders.size}/4`
        : `A/D  SPACE  ${game.hitProviders.size}/4`,
      174,
      23
    );
  }

  function drawSecret() {
    const progress = game.secret.progress;
    dom.scene.style.setProperty('--secret-progress', progress.toFixed(3));
    dom.scene.classList.toggle('is-secret-revealed', progress > 0.001);
  }

  function draw(timestamp = performance.now()) {
    if (!context || !game.layout) return;
    context.setTransform(
      dom.canvas.width / VIEW_WIDTH,
      0,
      0,
      dom.canvas.height / VIEW_HEIGHT,
      0,
      0
    );
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    drawBackground();
    drawWorld();
    drawHellTraps(timestamp);
    drawHellProjectiles(timestamp);
    drawBlocks(timestamp);
    drawMonsters(timestamp);
    drawPlayer(timestamp);
    drawHud();
    drawSecret();
  }

  function frame(timestamp) {
    game.frame = 0;
    if (!game.open || game.drawerOpen || game.characterEditorOpen || document.hidden) return;
    const frameElapsed = game.frameClock
      ? Math.min(100, Math.max(0, timestamp - game.frameClock))
      : GAME_FRAME_BUDGET_MS;
    game.frameClock = timestamp;
    game.frameCarry = Math.min(GAME_FRAME_BUDGET_MS * 2, game.frameCarry + frameElapsed);
    if (game.frameCarry + 0.1 < GAME_FRAME_BUDGET_MS) {
      game.frame = window.requestAnimationFrame(frame);
      return;
    }
    game.frameCarry %= GAME_FRAME_BUDGET_MS;
    if (!game.lastFrame) game.lastFrame = timestamp;
    const elapsed = Math.min(0.05, Math.max(0, (timestamp - game.lastFrame) / 1000));
    game.lastFrame = timestamp;
    const physicsSteps = Math.max(1, Math.ceil(elapsed / MAX_PHYSICS_STEP));
    const frameStep = elapsed / physicsSteps;
    for (let step = 0; step < physicsSteps && !game.drawerOpen && !game.characterEditorOpen; step += 1) {
      update(frameStep);
    }
    draw(timestamp);
    if (game.open && !game.drawerOpen && !game.characterEditorOpen) {
      game.frame = window.requestAnimationFrame(frame);
    }
  }

  function startLoop() {
    if (game.frame || !game.open || game.drawerOpen || game.characterEditorOpen || document.hidden) return;
    game.lastFrame = 0;
    game.frameClock = 0;
    game.frameCarry = 0;
    game.frame = window.requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (game.frame) window.cancelAnimationFrame(game.frame);
    game.frame = 0;
    game.lastFrame = 0;
    game.frameClock = 0;
    game.frameCarry = 0;
  }

  function resizeCanvas() {
    if (!dom.canvas || !context) return;
    const bounds = dom.canvas.getBoundingClientRect();
    if (bounds.width < 2 || bounds.height < 2) return;
    const pixelRatio = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
    const width = Math.round(bounds.width * pixelRatio);
    const height = Math.round(bounds.height * pixelRatio);
    if (dom.canvas.width !== width || dom.canvas.height !== height) {
      dom.canvas.width = width;
      dom.canvas.height = height;
      context.imageSmoothingEnabled = false;
    }
    draw();
  }

  async function refreshProviderStates() {
    if (!ensureDom()) return false;
    const revision = ++game.syncRevision;
    setStatus('正在读取四个平台的本机登录状态…');
    try {
      if (typeof refreshMusicApiProviders === 'function') {
        await refreshMusicApiProviders({ silent: true });
      }
      const configured = PROVIDER_IDS.filter(isProviderConfigured);
      if (typeof refreshLoginStatus === 'function') {
        await Promise.allSettled(configured.map((id) => refreshLoginStatus(id)));
      }
    } catch (error) {
    }
    if (revision !== game.syncRevision) return false;
    if (!game.drawerOpen) {
      setStatus(isHellLevel()
        ? '地狱回声 · 持续追赶会让音乐方块过热停机'
        : 'A / D 移动 · 空格跳跃 · 从下方顶平台方块');
    }
    syncProviders();
    return true;
  }

  function syncProviders() {
    if (!ensureDom()) return false;
    dom.providerShortcuts.forEach((button) => {
      const id = button.dataset.pixelProviderShortcut;
      if (!PROVIDER_IDS.includes(id)) return;
      const info = providerDetails(id);
      const configured = isProviderConfigured(id);
      const loggedIn = isProviderLoggedIn(id);
      button.setAttribute(
        'aria-label',
        `${info.label}${configured ? (loggedIn ? '，已登录，激活后切换账号' : '，激活后登录') : '，插件未配置'}`
      );
    });
    if (game.open && game.drawerOpen) {
      const activeTab = document.querySelector('#loginProviderTabs [data-login-provider].is-active');
      const drawerProvider = dom.drawer.dataset.provider;
      const activeProvider = game.providerOnly
        ? drawerProvider
        : activeTab?.dataset.loginProvider || drawerProvider;
      if (PROVIDER_IDS.includes(activeProvider)) {
        openAuthDrawer(
          activeProvider,
          isProviderConfigured(activeProvider),
          isProviderLoggedIn(activeProvider),
          { focus: false, providerOnly: game.providerOnly }
        );
      }
    } else if (game.open && !dom.scene.hidden) {
      if (dom.title) dom.title.textContent = '音乐岛登录冒险';
      if (dom.subtitle) dom.subtitle.textContent = 'A / D 移动，空格跳跃，顶音乐平台方块进入登录';
    }
    draw();
    return true;
  }

  function open() {
    if (!ensureDom()) return false;
    const activeElement = document.activeElement;
    game.returnFocus = activeElement instanceof HTMLElement && !dom.dialog.contains(activeElement)
      ? activeElement
      : document.getElementById('neteaseLoginButton');
    game.open = true;
    game.drawerOpen = false;
    game.characterEditorOpen = false;
    game.syncRevision += 1;
    game.layout = createLayout();
    game.seed = game.layout.seed;
    game.levelTime = 0;
    game.cameraX = 0;
    game.checkpointX = 72;
    game.deathsSinceHell = 0;
    game.deathRandom = randomGenerator(game.seed ^ 0xa17f39c5);
    game.transition = createTransitionState();
    game.hellHintShown = false;
    game.providerOnly = false;
    game.hitProviders = new Set();
    game.secret = createSecretState();
    game.player = createPlayer();
    resetInput();
    resetSecret(true);
    dom.scene.removeAttribute('aria-busy');
    setHellTransitionFx(0, 0);
    dom.dialog.classList.remove('is-pixel-auth-open');
    dom.drawer.hidden = true;
    dom.drawer.setAttribute('aria-hidden', 'true');
    setProviderOnly(false);
    dom.authNotice.hidden = true;
    if (dom.browserStage) dom.browserStage.hidden = false;
    dom.scene.hidden = false;
    dom.scene.setAttribute('aria-hidden', 'false');
    dom.scene.inert = false;
    if (dom.characterEditor) {
      dom.characterEditor.hidden = true;
      dom.characterEditor.setAttribute('aria-hidden', 'true');
    }
    if (dom.viewport) dom.viewport.inert = false;
    if (dom.helpPanel) dom.helpPanel.inert = false;
    syncLevelUi();
    if (dom.title) dom.title.textContent = '音乐岛登录冒险';
    if (dom.subtitle) dom.subtitle.textContent = 'A / D 移动，空格跳跃，顶音乐平台方块进入登录';
    setStatus('A / D 移动 · 空格跳跃 · 从下方顶平台方块');
    resizeCanvas();
    startLoop();
    void prepareSecretEligibility(game.secret);
    void refreshProviderStates();
    window.setTimeout(() => dom.canvas.focus({ preventScroll: true }), 0);
    return true;
  }

  function returnToScene() {
    if (!ensureDom() || !game.open) return false;
    const returningFromSecretExit = !game.providerOnly
      && game.layout
      && game.player.x <= game.layout.secretExitX;
    const returningProvider = game.providerOnly ? dom.drawer.dataset.provider : '';
    game.drawerOpen = false;
    resetInput();
    resetSecret(true);
    dom.dialog.classList.remove('is-pixel-auth-open');
    dom.drawer.hidden = true;
    dom.drawer.setAttribute('aria-hidden', 'true');
    dom.authNotice.hidden = true;
    dom.drawer.classList.remove('is-provider-locked');
    setProviderOnly(false);
    delete dom.drawer.dataset.locked;
    if (dom.browserStage) dom.browserStage.hidden = false;
    dom.scene.hidden = false;
    dom.scene.setAttribute('aria-hidden', 'false');
    dom.scene.inert = false;
    if (returningFromSecretExit) {
      game.player.x = game.layout.secretExitX + 28;
      game.player.vx = 0;
      game.player.facing = 1;
    } else if (isHellLevel() && PROVIDER_IDS.includes(returningProvider)) {
      const block = game.layout.blocks.find((candidate) => candidate.provider === returningProvider);
      if (block) {
        const placeRight = block.x + block.width + game.player.width + 18 < block.maxX + 54;
        game.player.x = placeRight
          ? block.x + block.width + 14
          : block.x - game.player.width - 14;
        game.player.vx = 0;
      }
    }
    syncLevelUi();
    if (dom.title) dom.title.textContent = '音乐岛登录冒险';
    if (dom.subtitle) dom.subtitle.textContent = 'A / D 移动，空格跳跃，顶音乐平台方块进入登录';
    setStatus(isHellLevel()
      ? '地狱回声 · 持续追赶会让音乐方块过热停机'
      : 'A / D 移动 · 空格跳跃 · 从下方顶平台方块');
    resizeCanvas();
    startLoop();
    syncProviders();
    window.setTimeout(() => dom.canvas.focus({ preventScroll: true }), 0);
    return true;
  }

  function close() {
    const returnFocus = game.returnFocus;
    game.open = false;
    game.drawerOpen = false;
    game.characterEditorOpen = false;
    game.providerOnly = false;
    game.syncRevision += 1;
    game.transition = createTransitionState();
    stopLoop();
    resetInput();
    resetSecret(true);
    clearApiPackageDropTarget();
    dom.scene?.classList.remove('is-api-package-importing');
    dom.scene?.removeAttribute('aria-busy');
    setHellTransitionFx(0, 0);
    if (dom.dialog) dom.dialog.classList.remove('is-pixel-auth-open');
    if (dom.drawer) {
      dom.drawer.hidden = true;
      dom.drawer.setAttribute('aria-hidden', 'true');
      dom.authNotice.hidden = true;
      dom.drawer.classList.remove('is-provider-locked');
      setProviderOnly(false);
      delete dom.drawer.dataset.locked;
    }
    if (dom.browserStage) dom.browserStage.hidden = false;
    if (dom.characterEditor) {
      dom.characterEditor.hidden = true;
      dom.characterEditor.setAttribute('aria-hidden', 'true');
    }
    if (dom.viewport) dom.viewport.inert = false;
    if (dom.helpPanel) dom.helpPanel.inert = false;
    if (dom.scene) {
      dom.scene.classList.remove('is-hell-level', 'is-hell-transitioning');
      dom.scene.hidden = false;
      dom.scene.setAttribute('aria-hidden', 'false');
      dom.scene.inert = false;
    }
    game.returnFocus = null;
    window.setTimeout(() => {
      if (dom.dialog?.hidden && returnFocus instanceof HTMLElement && returnFocus.isConnected) {
        returnFocus.focus({ preventScroll: true });
      }
    }, 0);
    return true;
  }

  window.fePixelLogin = Object.freeze({
    open,
    close,
    syncProviders,
    returnToScene,
    exportCharacter,
    installCharacter,
    characterPreviewDataUrl
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureDom, { once: true });
  } else {
    ensureDom();
  }
})();
