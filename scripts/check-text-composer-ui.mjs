import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const debugPort = 19000 + (process.pid % 10000);
const profile = path.join(tmpdir(), `fe-monster-text-composer-${process.pid}`);
const visualLanguageOnly = process.env.FE_TEST_SCOPE === 'visual-language';
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2']
]);

function apiFixture(url) {
  if (url.pathname === '/api/player/state') {
    return { queue: [], queueIndex: -1, position: 0, duration: 0, playing: false, volume: 0.8 };
  }
  if (url.pathname === '/api/visual-bridge/state') return { audio: {} };
  if (url.pathname === '/api/audio/sample') return {};
  if (url.pathname === '/api/community/state') {
    return { ok: false, serverOnline: false, loggedIn: false, friends: [] };
  }
  if (url.pathname === '/api/community/listen/state') return { ok: false };
  if (url.pathname === '/api/community/listening') return { ok: false };
  if (url.pathname === '/api/sandbox/presets') return { presets: [] };
  if (url.pathname === '/api/sandbox/components') return { components: [] };
  if (url.pathname === '/api/app/runtime') return {};
  if (url.pathname.endsWith('/login/status')) return { loggedIn: false };
  if (url.pathname.includes('/user/playlists')) return { loggedIn: false, playlists: [] };
  return { ok: false };
}

function safeFilePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const mapping = decoded.startsWith('/components/')
    ? { base: path.join(root, 'components'), relative: decoded.slice('/components/'.length) }
    : decoded.startsWith('/node_modules/')
      ? { base: path.join(root, 'node_modules'), relative: decoded.slice('/node_modules/'.length) }
      : { base: webRoot, relative: decoded === '/' ? 'index.html' : decoded.slice(1) };
  const base = path.resolve(mapping.base);
  const candidate = path.resolve(base, mapping.relative);
  return candidate === base || candidate.startsWith(`${base}${path.sep}`) ? candidate : '';
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    const body = Buffer.from(JSON.stringify(apiFixture(url)));
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    });
    response.end(body);
    return;
  }
  const filePath = safeFilePath(url.pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end();
    return;
  }
  const body = readFileSync(filePath);
  response.writeHead(200, {
    'Content-Type': contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  response.end(body);
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const baseUrl = `http://127.0.0.1:${server.address().port}`;

const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu',
  '--force-prefers-reduced-motion=no-preference',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();

async function retryJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await delay(100);
  }
  throw new Error('Edge debugging endpoint did not start');
}

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((item) => item.type === 'page');
  if (!target?.webSocketDebuggerUrl) throw new Error('No Edge page target was found');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });

  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });
  await command('Page.navigate', { url: `${baseUrl}/?text-composer-qa=${Date.now()}` });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = await evaluate(`document.readyState === 'complete'
      && typeof renderPlaylistShelf === 'function'
      && typeof setTextPreset === 'function'
      && document.getElementById('playlistShelfStage')`);
    if (ready) break;
    if (attempt === 119) throw new Error('FE Monster client did not finish booting');
    await delay(100);
  }

  const playlistSurface = await evaluate(`(async () => {
    document.getElementById('bootScreen')?.setAttribute('hidden', '');
    state.playbackPage = true;
    updatePlaybackPageClass();
    els.appShell.classList.add('has-qishui-playback-card', 'is-playback-song-panel-open');
    const songs = Array.from({ length: 5 }, (_, index) => ({
      id: 'transparent-stage-song-' + index,
      title: 'Transparent stage song ' + (index + 1),
      artist: 'FE Monster QA',
      provider: 'local',
      duration: 180
    }));
    renderPlaylistShelf({
      id: 'transparent-stage-playlist',
      name: 'Transparent stage contract',
      creator: 'FE Monster QA',
      provider: 'local',
      trackCount: songs.length
    }, songs);
    els.appShell.classList.add('is-playback-playlist-picker-open');
    renderPlaylistOrbit([{
      id: 'transparent-orbit-playlist',
      name: 'Floating playlist card contract',
      creator: 'FE Monster QA',
      provider: 'local',
      trackCount: songs.length,
      recommended: true
    }]);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const stage = document.getElementById('playlistShelfStage');
    const orbit = document.getElementById('orbPlaylists');
    let orbitCard = orbit.querySelector('.orb-playlist-card');
    if (!orbitCard) {
      orbitCard = document.createElement('button');
      orbitCard.type = 'button';
      orbitCard.className = 'orb-playlist-card is-focused';
      orbitCard.setAttribute('aria-selected', 'true');
      orbitCard.innerHTML = '<span class="orb-playlist-copy"><strong>Visual contract</strong><small>FE Monster QA</small></span>';
      orbit.appendChild(orbitCard);
    }
    const selected = document.getElementById('selectedPlaylistAlbum');
    const back = document.getElementById('playlistShelfBack');
    const songsRendered = Array.from(document.querySelectorAll('#playlistSongStack .shelf-song-button'));
    const song = songsRendered[0];
    const neutralSong = songsRendered[1];
    const currentSong = songsRendered[2];
    currentSong?.classList.add('is-current');
    song?.focus();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const stageStyle = getComputedStyle(stage);
    const orbitStyle = getComputedStyle(orbit);
    const orbitCardStyle = getComputedStyle(orbitCard);
    const selectedStyle = getComputedStyle(selected);
    const backStyle = getComputedStyle(back);
    const songStyle = getComputedStyle(song);
    const neutralSongStyle = getComputedStyle(neutralSong);
    const currentSongStyle = getComputedStyle(currentSong);
    const serializeSongSurface = (style) => ({
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      backdropFilter: style.backdropFilter,
      webkitBackdropFilter: style.webkitBackdropFilter
    });
    const songSurfaces = {
      neutral: serializeSongSurface(neutralSongStyle),
      focused: serializeSongSurface(songStyle),
      current: serializeSongSurface(currentSongStyle)
    };
    const songSurfaceValues = Object.values(songSurfaces);
    const songCardsUseExactTenPercentBlack = songSurfaceValues.every((surface) => (
      surface.backgroundColor === 'rgba(0, 0, 0, 0.1)'
      && surface.backgroundImage === 'none'
    ));
    const songCardsAvoidPerRowBackdropBlur = songSurfaceValues.every((surface) => (
      surface.backdropFilter === 'none'
      && (!surface.webkitBackdropFilter || surface.webkitBackdropFilter === 'none')
    ));
    const hasWarmExternalGlow = (surface) => (
      /rgba?\\(255,\\s*246,\\s*232,\\s*0?\\.\\d+\\)\\s+0px\\s+0px\\s+(?:1[0-9]|[2-9]\\d)px/.test(surface.boxShadow)
    );
    const songCardsUseWarmNeutralGlow = songSurfaceValues.every(hasWarmExternalGlow)
      && songSurfaceValues.every((surface) => !/(102,\\s*207,\\s*255|151,\\s*225,\\s*255)/.test(surface.boxShadow));
    const hasVisibleSurface = (style) => (
      style.backgroundImage !== 'none'
      || !/rgba?\\([^)]*,\\s*0(?:\\.0+)?\\)/.test(style.backgroundColor)
    );
    const transparent = stageStyle.backgroundImage === 'none'
      && /rgba?\\([^)]*,\\s*0(?:\\.0+)?\\)/.test(stageStyle.backgroundColor)
      && stageStyle.borderTopWidth === '0px'
      && stageStyle.boxShadow === 'none'
      && stageStyle.backdropFilter === 'none'
      && (!stageStyle.webkitBackdropFilter || stageStyle.webkitBackdropFilter === 'none');
    const orbitTransparent = orbitStyle.backgroundImage === 'none'
      && /rgba?\\([^)]*,\\s*0(?:\\.0+)?\\)/.test(orbitStyle.backgroundColor)
      && orbitStyle.borderTopWidth === '0px'
      && orbitStyle.boxShadow === 'none'
      && orbitStyle.backdropFilter === 'none'
      && (!orbitStyle.webkitBackdropFilter || orbitStyle.webkitBackdropFilter === 'none');
    const orbitCardPreserved = hasVisibleSurface(orbitCardStyle)
      && Number.parseFloat(orbitCardStyle.borderTopWidth) > 0
      && Number.parseFloat(orbitCardStyle.borderRadius) > 0
      && orbitCardStyle.boxShadow !== 'none';
    const playlistCardUsesExactFifteenPercentBlack = orbitCardStyle.backgroundColor === 'rgba(0, 0, 0, 0.15)'
      && orbitCardStyle.backgroundImage === 'none'
      && orbitCardStyle.backdropFilter === 'none'
      && (!orbitCardStyle.webkitBackdropFilter || orbitCardStyle.webkitBackdropFilter === 'none');
    const playlistCardUsesWarmNeutralGlow = orbitCardStyle.boxShadow.includes('255, 246, 232')
      && !/(102,\\s*207,\\s*255|151,\\s*225,\\s*255)/.test(orbitCardStyle.boxShadow);
    const selectedPlaylistUsesWarmNeutralGlow = selectedStyle.borderColor.includes('255, 246, 232')
      && selectedStyle.boxShadow.includes('255, 246, 232')
      && !/(102,\\s*207,\\s*255|151,\\s*225,\\s*255|218,\\s*241,\\s*255)/.test(
        selectedStyle.borderColor + ' ' + selectedStyle.boxShadow
      );
    const selectedPlaylistUsesExactFifteenPercentBlack = selectedStyle.backgroundColor === 'rgba(0, 0, 0, 0.15)'
      && selectedStyle.backgroundImage === 'none'
      && selectedStyle.backdropFilter === 'none'
      && (!selectedStyle.webkitBackdropFilter || selectedStyle.webkitBackdropFilter === 'none');
    const childrenFloat = hasVisibleSurface(selectedStyle)
      && hasVisibleSurface(backStyle)
      && hasVisibleSurface(songStyle)
      && songStyle.boxShadow !== 'none';
    const keyboardFocus = song?.tagName === 'BUTTON'
      && song.tabIndex === 0
      && song.getAttribute('aria-selected') === 'true'
      && song.classList.contains('is-focused')
      && songStyle.boxShadow !== 'none';
    return {
      pass: transparent
        && orbitTransparent
        && orbitCardPreserved
        && childrenFloat
        && keyboardFocus
        && playlistCardUsesExactFifteenPercentBlack
        && playlistCardUsesWarmNeutralGlow
        && selectedPlaylistUsesExactFifteenPercentBlack
        && selectedPlaylistUsesWarmNeutralGlow
        && songCardsUseExactTenPercentBlack
        && songCardsAvoidPerRowBackdropBlur
        && songCardsUseWarmNeutralGlow,
      transparent,
      orbitTransparent,
      orbitCardPreserved,
      playlistCardUsesExactFifteenPercentBlack,
      playlistCardUsesWarmNeutralGlow,
      selectedPlaylistUsesExactFifteenPercentBlack,
      selectedPlaylistUsesWarmNeutralGlow,
      childrenFloat,
      keyboardFocus,
      songCardsUseExactTenPercentBlack,
      songCardsAvoidPerRowBackdropBlur,
      songCardsUseWarmNeutralGlow,
      stage: {
        backgroundColor: stageStyle.backgroundColor,
        backgroundImage: stageStyle.backgroundImage,
        borderTopWidth: stageStyle.borderTopWidth,
        boxShadow: stageStyle.boxShadow,
        backdropFilter: stageStyle.backdropFilter,
        webkitBackdropFilter: stageStyle.webkitBackdropFilter
      },
      orbit: {
        backgroundColor: orbitStyle.backgroundColor,
        backgroundImage: orbitStyle.backgroundImage,
        borderTopWidth: orbitStyle.borderTopWidth,
        boxShadow: orbitStyle.boxShadow,
        backdropFilter: orbitStyle.backdropFilter,
        cardBackground: orbitCardStyle.backgroundColor,
        cardBorderTopWidth: orbitCardStyle.borderTopWidth,
        cardBorderRadius: orbitCardStyle.borderRadius,
        cardBoxShadow: orbitCardStyle.boxShadow
      },
      children: {
        selectedBackground: selectedStyle.backgroundColor,
        selectedBorderColor: selectedStyle.borderColor,
        selectedBoxShadow: selectedStyle.boxShadow,
        backBackground: backStyle.backgroundColor,
        songBackground: songStyle.backgroundColor,
        songBoxShadow: songStyle.boxShadow
      },
      songSurfaces
    };
  })()`);

  const visualLanguageSurfaces = await evaluate(`(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const panelStyle = getComputedStyle(document.getElementById('diySidebar'));
    const pageSurfaces = [
      'diyPresetPage',
      'diyTextPage',
      'diyWallpaperPage'
    ].map((id) => {
      const style = getComputedStyle(document.getElementById(id));
      return {
        id,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
        backdropFilter: style.backdropFilter,
        webkitBackdropFilter: style.webkitBackdropFilter
      };
    });
    const modeButtonSurfaces = [
      'diyPresetButton',
      'diyTextModeButton',
      'diyWallpaperModeButton'
    ].map((id) => {
      const style = getComputedStyle(document.getElementById(id));
      return {
        id,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow
      };
    });
    const canonicalWarmNeutral = rootStyle
      .getPropertyValue('--fe-primitive-rgb-warm-neutral')
      .trim() === '255 246 232';
    const panelUsesExactSevenPercentBlack = panelStyle.backgroundColor === 'rgba(0, 0, 0, 0.07)'
      && panelStyle.backgroundImage === 'none'
      && panelStyle.backdropFilter.includes('blur(20px)');
    const childPagesAreStructuralOnly = pageSurfaces.every((surface) => (
      surface.backgroundColor === 'rgba(0, 0, 0, 0)'
      && surface.backgroundImage === 'none'
      && surface.boxShadow === 'none'
      && surface.backdropFilter === 'none'
      && (!surface.webkitBackdropFilter || surface.webkitBackdropFilter === 'none')
    ));
    const modeButtonsUseExactWarmSurface = modeButtonSurfaces.every((surface) => (
      surface.backgroundColor === 'rgba(255, 246, 232, 0.1)'
      && surface.backgroundImage === 'none'
      && surface.boxShadow.includes('255, 246, 232')
    ));
    return {
      pass: canonicalWarmNeutral
        && panelUsesExactSevenPercentBlack
        && childPagesAreStructuralOnly
        && modeButtonsUseExactWarmSurface,
      canonicalWarmNeutral,
      panelUsesExactSevenPercentBlack,
      childPagesAreStructuralOnly,
      modeButtonsUseExactWarmSurface,
      panel: {
        backgroundColor: panelStyle.backgroundColor,
        backgroundImage: panelStyle.backgroundImage,
        backdropFilter: panelStyle.backdropFilter,
        boxShadow: panelStyle.boxShadow
      },
      pageSurfaces,
      modeButtonSurfaces
    };
  })()`);

  const composerSemantics = await evaluate(`(() => {
    const required = [
      ['textLayoutMode', 'select'],
      ['textLyricHighlightMode', 'select'],
      ['textHandwrittenMoodToggle', 'checkbox'],
      ['textFlowIntensity', 'range'],
      ['textEchoLayers', 'range'],
      ['textEchoSpacing', 'range'],
      ['textDepth', 'range'],
      ['textHighlightIntensity', 'range'],
      ['textHighlightSoftness', 'range'],
      ['textGloss', 'range'],
      ['textUnsungBlur', 'range'],
      ['textLetterSpacing', 'range'],
      ['textLowBassGlow', 'range']
    ];
    const fieldset = document.getElementById('textComposerControl');
    const controls = Object.fromEntries(required.map(([id, kind]) => {
      const control = document.getElementById(id);
      const label = document.querySelector('label[for="' + id + '"]');
      const output = document.querySelector('output[for="' + id + '"]');
      const correctKind = kind === 'select'
        ? control?.tagName === 'SELECT'
        : control?.tagName === 'INPUT' && control.type === kind;
      return [id, {
        present: !!control,
        correctKind,
        labelled: !!label,
        hasOutput: !!output
      }];
    }));
    const semanticControls = fieldset?.tagName === 'FIELDSET'
      && !!fieldset.querySelector('legend')
      && Object.values(controls).every((item) => (
        item.present && item.correctKind && item.labelled && item.hasOutput
      ));
    const textPresetCards = Array.from(document.querySelectorAll('.diy-preset-card[data-text-preset]'));
    const textPresetIds = textPresetCards.map((card) => card.dataset.textPreset).sort();
    const restoredTextPresetCards = textPresetCards.length === 2
      && textPresetIds.join('|') === 'depth|focus-echo'
      && document.getElementById('diyLyricPreset')?.dataset.textPreset === 'depth'
      && document.getElementById('diyFocusEchoTextPreset')?.dataset.textPreset === 'focus-echo'
      && !document.getElementById('diyWordGlowTextPreset');
    const layoutValues = Array.from(document.getElementById('textLayoutMode')?.options || [])
      .map((option) => option.value);
    const supportedLayoutsOnly = layoutValues.length === 2
      && layoutValues.includes('single')
      && layoutValues.includes('multi')
      && !layoutValues.includes('book');
    const defaultDepth = state.textPreset === 'depth'
      && state.lastSelectableTextPreset === 'depth';
    const noGlyphMaterialControl = !document.getElementById('textGlyphGlow')
      && !document.querySelector('#textComposerControl [data-text-composer-setting="glyphGlow"]');
    return {
      pass: semanticControls
        && restoredTextPresetCards
        && supportedLayoutsOnly
        && defaultDepth
        && noGlyphMaterialControl,
      semanticControls,
      restoredTextPresetCards,
      supportedLayoutsOnly,
      defaultDepth,
      noGlyphMaterialControl,
      controls,
      textPresetIds,
      layoutValues,
      statePreset: state.textPreset,
      lastSelectableTextPreset: state.lastSelectableTextPreset
    };
  })()`);

  const composerInteraction = await evaluate(`(async () => {
    if (
      typeof applyTextComposerSettings !== 'function'
      || typeof syncTextComposerControls !== 'function'
      || !state.textComposerSettings
    ) {
      return {
        pass: false,
        ready: false,
        stateSettings: state.textComposerSettings || null
      };
    }
    const setControl = (id, value, eventName = 'input') => {
      const control = document.getElementById(id);
      control.value = String(value);
      control.dispatchEvent(new Event(eventName, { bubbles: true }));
      return control;
    };
    state.playbackPage = true;
    state.currentSong = {
      id: 'text-composer-contract',
      title: 'Text composer contract',
      artist: 'FE Monster QA',
      duration: 180
    };
    setTextPreset('depth');
    setPlaybackLyricLine('整行滚动高亮正在跟随音乐', 'Full-line progress highlight', 0.46, 32);

    const echoFields = [
      document.getElementById('textEchoLayers')?.closest('.diy-text-composer-field'),
      document.getElementById('textEchoSpacing')?.closest('.diy-text-composer-field')
    ];
    const multiLayoutOption = Array.from(document.getElementById('textLayoutMode')?.options || [])
      .find((option) => option.value === 'multi');
    const ordinaryEchoControlsHidden = echoFields.every((field) => (
      field?.hidden && getComputedStyle(field).display === 'none'
    ));
    const ordinaryMultiLayoutAvailable = !!multiLayoutOption
      && !multiLayoutOption.hidden
      && !multiLayoutOption.disabled;

    const legacyBookLayoutRejected = normalizeTextComposerSettings({
      ...state.textComposerSettings,
      layoutMode: 'book'
    }).layoutMode === 'single'
      && !Array.from(document.getElementById('textLayoutMode')?.options || [])
        .some((option) => option.value === 'book');

    state.textComposerSettings = normalizeTextComposerSettings({
      ...state.textComposerSettings,
      unsungBlur: 6,
      glitchEnabled: true
    });
    document.getElementById('diyFocusEchoTextPreset')?.click();
    const focusEchoCard = state.textPreset === 'focus-echo'
      && els.playbackLyricScene.classList.contains('is-focus-echo-text')
      && els.playbackLyricScene.dataset.textGlitch === 'off'
      && els.playbackLyricScene.style.getPropertyValue('--text-unplayed-blur') === '0.00px'
      && document.getElementById('textUnsungBlur')?.disabled
      && document.getElementById('textGlitchToggle')?.disabled
      && !glitchTextEffectActive();
    const focusEchoControls = echoFields.every((field) => (
      field && !field.hidden && getComputedStyle(field).display !== 'none'
    ))
      && state.textComposerSettings.layoutMode === 'single'
      && !!multiLayoutOption
      && multiLayoutOption.hidden
      && multiLayoutOption.disabled;
    const playbackMultiRowToggle = document.getElementById('qishuiPlaybackMultiRowToggle');
    playbackMultiRowToggle?.click();
    setMultiRowLyricsEnabled(true);
    const focusEchoPlaybackToggleLocked = !!playbackMultiRowToggle
      && playbackMultiRowToggle.disabled
      && playbackMultiRowToggle.getAttribute('aria-disabled') === 'true'
      && state.textComposerSettings.layoutMode === 'single'
      && state.multiRowLyricsEnabled === false
      && !els.playbackLyricScene.classList.contains('is-multi-row-text');
    setControl('textLayoutMode', 'multi', 'change');
    const focusEchoRejectsMultiLayout = state.textComposerSettings.layoutMode === 'single';
    document.getElementById('diyLyricPreset')?.click();
    const ordinaryLyricCard = state.textPreset === 'depth'
      && !els.playbackLyricScene.classList.contains('is-focus-echo-text')
      && document.getElementById('diyLyricPreset')?.classList.contains('is-active')
      && !document.getElementById('textUnsungBlur')?.disabled
      && !document.getElementById('textGlitchToggle')?.disabled;
    const ordinaryControlsRestored = echoFields.every((field) => (
      field?.hidden && getComputedStyle(field).display === 'none'
    ))
      && !!multiLayoutOption
      && !multiLayoutOption.hidden
      && !multiLayoutOption.disabled
      && !playbackMultiRowToggle?.disabled
      && playbackMultiRowToggle?.getAttribute('aria-disabled') === 'false';

    setControl('textLayoutMode', 'multi', 'change');
    const multiLayout = state.textComposerSettings.layoutMode === 'multi'
      && state.multiRowLyricsEnabled
      && els.playbackLyricScene.dataset.textLayout === 'multi';

    setControl('textLayoutMode', 'single', 'change');
    const singleLayout = state.textComposerSettings.layoutMode === 'single'
      && !state.multiRowLyricsEnabled
      && !els.playbackLyricScene.classList.contains('is-book-effect-text');

    setControl('textFlowIntensity', 92);
    const flowTemplate = state.textPreset === 'depth'
      && state.textComposerSettings.flowIntensity === 92;

    setControl('textGloss', 86);
    const glossParameter = state.textPreset === 'depth'
      && state.textComposerSettings.layoutMode === 'single'
      && state.textComposerSettings.gloss === 86;

    setControl('textLayoutMode', 'single', 'change');
    setControl('textEchoLayers', 3);
    setControl('textEchoSpacing', 22);
    const echoTemplate = state.textPreset === 'depth'
      && state.textComposerSettings.echoLayers === 3
      && state.textComposerSettings.echoSpacing === 22;

    document.getElementById('textComposerResetButton')?.click();
    const resetDepth = state.textPreset === 'depth'
      && state.textComposerSettings.layoutMode === 'single'
      && state.textComposerSettings.flowIntensity === 24
      && state.textComposerSettings.echoLayers === 5
      && state.textComposerSettings.depth === 72
      && state.textComposerSettings.highlightIntensity === 88
      && state.textComposerSettings.lowBassGlow === 75;

    const customValues = {
      textLayoutMode: 'single',
      textFlowIntensity: 76,
      textEchoLayers: 2,
      textEchoSpacing: 21,
      textDepth: 84,
      textHighlightIntensity: 91,
      textHighlightSoftness: 6,
      textGloss: 73,
      textUnsungBlur: 4.5,
      textLetterSpacing: 3.5,
      textLowBassGlow: 82
    };
    Object.entries(customValues).forEach(([id, value]) => {
      setControl(id, value, id === 'textLayoutMode' ? 'change' : 'input');
    });
    const scene = els.playbackLyricScene;
    const customApplied = state.textComposerSettings.flowIntensity === 76
      && state.textComposerSettings.echoLayers === 2
      && state.textComposerSettings.echoSpacing === 21
      && state.textComposerSettings.depth === 84
      && state.textComposerSettings.highlightIntensity === 91
      && state.textComposerSettings.highlightSoftness === 6
      && state.textComposerSettings.gloss === 73
      && state.textComposerSettings.unsungBlur === 4.5
      && state.textComposerSettings.letterSpacing === 3.5
      && state.textComposerSettings.lowBassGlow === 82
      && scene.style.getPropertyValue('--text-flow-intensity') === '0.760'
      && scene.style.getPropertyValue('--text-echo-spacing') === '21.0px'
      && scene.style.getPropertyValue('--text-depth-strength') === '0.840'
      && scene.style.getPropertyValue('--text-highlight-intensity') === '0.910'
      && scene.style.getPropertyValue('--text-highlight-softness') === '6.00%'
      && scene.style.getPropertyValue('--text-highlight-gloss') === '0.730'
      && scene.style.getPropertyValue('--text-unplayed-blur') === '4.50px'
      && scene.style.getPropertyValue('--text-letter-spacing') === '3.50px'
      && scene.style.getPropertyValue('--text-bass-spread') === '0.820'
      && scene.querySelectorAll('.is-text-composer-layer-visible').length === 2;
    setPlaybackLyricLine('整行滚动高亮正在跟随音乐', 'Full-line progress highlight', 0.46, 32);
    const mainLine = scene.querySelector('.lyric-depth-0');
    const beforeHighlight = getComputedStyle(mainLine, '::before');
    const activeHighlight = getComputedStyle(mainLine, '::after');
    const clipAt46 = activeHighlight.clipPath;
    setPlaybackLyricLine('整行滚动高亮正在跟随音乐', 'Full-line progress highlight', 0.72, 34);
    const clipAt72 = getComputedStyle(mainLine, '::after').clipPath;
    const glyph = mainLine?.querySelector('.playback-lyric-glyph:not(.playback-lyric-glyph--space)');
    const glyphStyle = glyph ? getComputedStyle(glyph) : null;
    const computedUnplayedBlur = getComputedStyle(mainLine)
      .getPropertyValue('--text-unplayed-blur')
      .trim();
    const continuousLineHighlight = activeHighlight.content !== 'none'
      && activeHighlight.maskImage.includes('linear-gradient')
      && Number.parseFloat(activeHighlight.opacity) === 0.91
      && computedUnplayedBlur === '4.50px'
      && beforeHighlight.filter.includes('blur(')
      && clipAt46 !== clipAt72
      && (!glyphStyle || (
        glyphStyle.backgroundImage === 'none'
        && glyphStyle.textShadow === 'none'
      ));
    await new Promise((resolve) => setTimeout(resolve, 180));
    const saved = JSON.parse(localStorage.getItem('fe-monster-text-composer-v1') || '{}');
    const persisted = saved.version === 1
      && saved.settings?.flowIntensity === 76
      && saved.settings?.echoLayers === 2
      && saved.settings?.highlightIntensity === 91
      && saved.settings?.lowBassGlow === 82;
    return {
      pass: legacyBookLayoutRejected
        && ordinaryEchoControlsHidden
        && ordinaryMultiLayoutAvailable
        && focusEchoCard
        && focusEchoControls
        && focusEchoPlaybackToggleLocked
        && focusEchoRejectsMultiLayout
        && ordinaryLyricCard
        && ordinaryControlsRestored
        && multiLayout
        && singleLayout
        && flowTemplate
        && glossParameter
        && echoTemplate
        && resetDepth
        && customApplied
        && continuousLineHighlight
        && persisted,
      ready: true,
      legacyBookLayoutRejected,
      ordinaryEchoControlsHidden,
      ordinaryMultiLayoutAvailable,
      focusEchoCard,
      focusEchoControls,
      focusEchoPlaybackToggleLocked,
      focusEchoRejectsMultiLayout,
      ordinaryLyricCard,
      ordinaryControlsRestored,
      multiLayout,
      singleLayout,
      flowTemplate,
      glossParameter,
      echoTemplate,
      resetDepth,
      customApplied,
      continuousLineHighlight,
      highlightStyles: {
        sceneUnplayedBlur: getComputedStyle(scene).getPropertyValue('--text-unplayed-blur'),
        lineUnplayedBlur: getComputedStyle(mainLine).getPropertyValue('--text-unplayed-blur'),
        beforeFilter: beforeHighlight.filter,
        activeMask: activeHighlight.maskImage,
        activeOpacity: activeHighlight.opacity,
        clipAt46,
        clipAt72,
        glyphBackground: glyphStyle?.backgroundImage || '',
        glyphShadow: glyphStyle?.textShadow || ''
      },
      persisted,
      stateSettings: { ...state.textComposerSettings },
      saved
    };
  })()`);

  let composerPersistence = { pass: false };
  if (composerInteraction.ready) {
    const previousTimeOrigin = await evaluate('performance.timeOrigin');
    await command('Page.reload', { ignoreCache: true });
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const ready = await evaluate(`performance.timeOrigin !== ${previousTimeOrigin}
        && document.readyState === 'complete'
        && typeof applyTextComposerSettings === 'function'
        && state.textComposerSettings
        && document.getElementById('textHighlightIntensity')`);
      if (ready) break;
      if (attempt === 119) throw new Error('FE Monster client did not restore the text composer');
      await delay(100);
    }
    composerPersistence = await evaluate(`(() => {
      const scene = document.getElementById('playbackLyricScene');
      const settings = state.textComposerSettings;
      const pass = state.textPreset === 'depth'
        && settings.layoutMode === 'single'
        && settings.flowIntensity === 76
        && settings.echoLayers === 2
        && settings.echoSpacing === 21
        && settings.depth === 84
        && settings.highlightIntensity === 91
        && settings.highlightSoftness === 6
        && settings.gloss === 73
        && settings.unsungBlur === 4.5
        && settings.letterSpacing === 3.5
        && settings.lowBassGlow === 82
        && document.getElementById('textFlowIntensity')?.value === '76'
        && document.getElementById('textHighlightIntensity')?.value === '91'
        && document.getElementById('textLowBassGlow')?.value === '82'
        && scene?.style.getPropertyValue('--text-highlight-intensity') === '0.910'
        && scene?.style.getPropertyValue('--text-bass-spread') === '0.820';
      return {
        pass,
        statePreset: state.textPreset,
        settings: { ...settings },
        controls: {
          flow: document.getElementById('textFlowIntensity')?.value || '',
          highlight: document.getElementById('textHighlightIntensity')?.value || '',
          bass: document.getElementById('textLowBassGlow')?.value || ''
        }
      };
    })()`);
  }

  const composerSliderLayout = await evaluate(`(async () => {
    setDiyOpen(true);
    setDiyPage('text');
    setDiyCardOpen(true);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const root = document.getElementById('textComposerControl');
    const grids = Array.from(root?.querySelectorAll('.diy-text-composer-grid') || []);
    const gridChecks = grids.map((grid) => {
      const fields = Array.from(grid.children)
        .filter((child) => (
          child.matches('.diy-text-composer-field')
          && !child.hidden
          && getComputedStyle(child).display !== 'none'
        ));
      const fieldRects = fields.map((field) => {
        return {
          top: field.offsetTop,
          bottom: field.offsetTop + field.offsetHeight,
          width: field.offsetWidth
        };
      });
      const fieldsDoNotShareRows = fieldRects.every((rect, index) => (
        index === 0 || rect.top >= fieldRects[index - 1].bottom - 1
      ));
      const fieldsFillGrid = fieldRects.every((rect) => rect.width >= grid.clientWidth - 2);
      return {
        fieldCount: fields.length,
        gridWidth: grid.clientWidth,
        fieldsDoNotShareRows,
        fieldsFillGrid,
        fieldRects
      };
    });
    const ranges = Array.from(root?.querySelectorAll('input[type="range"]') || [])
      .filter((range) => {
        const field = range.closest('.diy-text-composer-field');
        return !field?.hidden && getComputedStyle(range).display !== 'none';
      });
    const rangeRects = ranges.map((range) => {
      const field = range.closest('.diy-text-composer-field');
      const style = getComputedStyle(range);
      return {
        id: range.id,
        width: range.offsetWidth,
        height: range.offsetHeight,
        minHeight: Number.parseFloat(style.minHeight) || 0,
        fieldWidth: field?.offsetWidth || 0
      };
    });
    const oneFieldPerRow = grids.length >= 4
      && gridChecks.every((check) => (
        check.fieldCount > 0
        && check.fieldsDoNotShareRows
        && check.fieldsFillGrid
      ));
    const slidersAreEnlarged = ranges.length >= 19
      && rangeRects.every((rect) => (
        rect.height >= 36
        && rect.minHeight >= 36
        && rect.width >= 160
        && rect.width >= rect.fieldWidth - 8
      ));
    return {
      pass: oneFieldPerRow && slidersAreEnlarged,
      oneFieldPerRow,
      slidersAreEnlarged,
      gridChecks,
      rangeRects
    };
  })()`);

  await command('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false
  });
  const composerNarrowLayout = await evaluate(`(async () => {
    setDiyOpen(true);
    setDiyPage('text');
    setDiyCardOpen(true);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise((resolve) => setTimeout(resolve, 420));
    const root = document.getElementById('textComposerControl');
    const rootRect = root?.getBoundingClientRect();
    const controls = Array.from(root?.querySelectorAll('input[type="range"], select') || [])
      .filter((control) => {
        const field = control.closest('.diy-text-composer-field');
        return !field?.hidden && getComputedStyle(control).display !== 'none';
      });
    const controlRects = controls.map((control) => {
      const rect = control.getBoundingClientRect();
      const layoutWidth = control.offsetWidth;
      return {
        id: control.id,
        width: layoutWidth,
        left: rect.left,
        right: rect.left + layoutWidth
      };
    });
    const noHorizontalOverflow = !!root
      && root.scrollWidth <= root.clientWidth + 1
      && rootRect.left >= 0
      && rootRect.right <= innerWidth + 1;
    const controlsUsable = controls.length >= 21
      && controlRects.every((rect) => (
        rect.width >= 80
        && rect.left >= rootRect.left - 1
        && rect.right <= rootRect.right + 1
      ));
    return {
      pass: noHorizontalOverflow && controlsUsable,
      viewport: [innerWidth, innerHeight],
      mobileMediaMatches: matchMedia('(max-width: 767px)').matches,
      sidebarTransform: getComputedStyle(document.getElementById('diySidebar')).transform,
      rootRect: rootRect ? {
        left: rootRect.left,
        right: rootRect.right,
        width: rootRect.width
      } : null,
      clientWidth: root?.clientWidth || 0,
      scrollWidth: root?.scrollWidth || 0,
      noHorizontalOverflow,
      controlsUsable,
      controlRects
    };
  })()`);
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });

  const visualLanguagePass = playlistSurface.pass === true
    && visualLanguageSurfaces.pass === true;
  const composerPass = composerSemantics.pass === true
    && composerInteraction.pass === true
    && composerPersistence.pass === true
    && composerSliderLayout.pass === true
    && composerNarrowLayout.pass === true;
  const result = {
    pass: visualLanguagePass && (visualLanguageOnly || composerPass),
    scope: visualLanguageOnly ? 'visual-language' : 'full',
    visualLanguagePass,
    composerPass,
    playlistSurface,
    visualLanguageSurfaces,
    composerSemantics,
    composerInteraction,
    composerPersistence,
    composerSliderLayout,
    composerNarrowLayout
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.pass ? 0 : 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (browser.pid) {
    spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
  }
  server.close();
  try {
    await delay(200);
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {}
  } catch {}
}
