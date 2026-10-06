import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../Sources/FEMonsterMac/FeMonsterWindowController.swift', import.meta.url), 'utf8');
const match = source.match(/private static let compatibilityBridgeScript = #"""\r?\n([\s\S]*?)\r?\n    """#/);
assert.ok(match, 'The WKWebView bridge must be present in the shipped Swift source');

const nativeMessages = [];
const fetchCalls = [];
const window = {
  location: { href: 'http://127.0.0.1:50317/?client=embedded', origin: 'http://127.0.0.1:50317', hostname: '127.0.0.1' },
  webkit: { messageHandlers: { feMonster: { postMessage: message => nativeMessages.push(message) } } },
  getComputedStyle() {
    return { fontFamily: 'PingFang SC', getPropertyValue: key => ({ '--lyric-primary': 'rgb(12, 34, 56)', '--lyric-highlight': '#abc' }[key] || '') };
  },
  fetch(input, init) {
    fetchCalls.push({ input, init });
    return Promise.resolve(new Response('ordinary fetch'));
  }
};
const snapshot = {
  diyPreset: 'chladni', wallpaperOpacity: .42,
  lyricPlayback: { song: { title: 'Test song', artist: 'Artist', cover: '/cover.png' }, displayText: '同步歌词',
    progressPercent: 25, effectiveLyricTime: 12, lyricLineStartTime: 10, lyricLineEndTime: 18,
    position: 14, duration: 180, playbackRate: 1.25, playing: true, missingTime: Number.NaN }
};
const document = { hidden: true, documentElement: {}, querySelector: () => null };
const context = vm.createContext({ window, URL, Request, Response, console, setTimeout, clearTimeout, document,
  desktopSceneSnapshot: () => snapshot, activeTextFontFamilyStack: () => 'Custom font, PingFang SC' });
vm.runInContext(match[1], context);
const bridge = window.chrome.webview;
assert.equal(window.FE_MONSTER_PLATFORM, 'macos', 'The shared UI must select macOS updates rather than Windows installers');
assert.equal(bridge.__feMonsterMac, true);
assert.equal(typeof bridge.postMessage, 'function');

// Document-start reinjection must preserve the same object and subscribers.
const events = [];
const subscriber = event => events.push(event.data);
bridge.addEventListener('message', subscriber);
vm.runInContext(match[1], context);
assert.equal(window.chrome.webview, bridge);
bridge.__dispatch({ type: 'fe-render-capabilities-result', requestId: 'render-1' });
bridge.__dispatch({ type: 'fe-pet-desktop-result', supported: true, enabled: true });
assert.equal(events.length, 2);
assert.equal(events[1].supported, true);
bridge.removeEventListener('message', subscriber);
bridge.__dispatch({ type: 'unused' });
assert.equal(events.length, 2);

bridge.postMessage({ type: 'fe-window', action: 'minimize' });
assert.equal(nativeMessages[0].action, 'minimize');
for (const pathname of ['/api/app/quit', '/api/app/window/quit', '/api/app/window/close']) {
  const response = await window.fetch(new Request(`${window.location.origin}${pathname}`));
  assert.equal((await response.json()).nativeHost, 'wkwebview');
  assert.equal(nativeMessages.at(-1).action, 'quit');
}
assert.equal(fetchCalls.length, 0, 'Closing this client must use the native lifecycle cleanup');

const init = { method: 'POST', body: '{"provider":"qq"}' };
await window.fetch('/api/music/login/browser/start', init);
await window.fetch('https://example.com/api/app/quit');
assert.equal(fetchCalls.length, 2, 'Login and cross-origin requests must retain ordinary fetch behavior');
assert.equal(fetchCalls[0].init, init, 'The bridge must preserve login request options');
assert.equal(nativeMessages.length, 4, 'A foreign origin must not invoke native quit');

// A native snapshot can precede the auxiliary page's event subscriptions.
// Replaying its latest state makes startup and renderer recovery deterministic.
bridge.__dispatch({ type: 'fe-desktop-lyrics-state', state: { enabled: true, text: 'first' } });
const lyricsEvents = [];
const stopLyrics = window.desktopOverlay.onLyricsState(state => lyricsEvents.push(state));
assert.equal(lyricsEvents[0].text, 'first');
bridge.__dispatch({ type: 'fe-wallpaper-state', state: { title: 'wallpaper' } });
assert.equal(lyricsEvents.length, 1, 'Wallpaper state must not become a lyrics event');
bridge.__dispatch({ type: 'fe-desktop-lyrics-state', state: { enabled: true, text: 'second' } });
assert.equal(lyricsEvents[1].text, 'second');
stopLyrics();
bridge.__dispatch({ type: 'fe-desktop-lyrics-state', state: { text: 'third' } });
assert.equal(lyricsEvents.length, 2, 'Closing an auxiliary page must detach its observer');

assert.equal(window.desktopOverlay.supported, true);
const showPromise = window.desktopOverlay.showLyrics({ opacity: .8, size: 1.2 });
const showRequest = nativeMessages.at(-1);
assert.equal(showRequest.type, 'fe-desktop-lyrics');
assert.equal(showRequest.action, 'show');
assert.equal(showRequest.state.opacity, .8);
let showResolved = false;
showPromise.then(() => { showResolved = true; });
bridge.__dispatch({ type: 'fe-wallpaper-result', requestId: 'another-request', ok: true });
await Promise.resolve();
assert.equal(showResolved, false, 'Unrelated native responses must not resolve another page request');
bridge.__dispatch({ type: 'fe-desktop-lyrics-result', requestId: showRequest.requestId, ok: true, enabled: true });
assert.equal((await showPromise).enabled, true);

const unlockPromise = window.desktopOverlay.setLyricsLockState(false);
const unlockRequest = nativeMessages.at(-1);
assert.equal(unlockRequest.locked, false);
const unlockRejected = assert.rejects(unlockPromise, /native failure/);
bridge.__dispatch({ type: 'fe-desktop-lyrics-result', requestId: unlockRequest.requestId, ok: false, error: 'native failure' });
await unlockRejected;

const movement = window.desktopOverlay.moveLyricsBy(20, -8);
const moveRequest = nativeMessages.at(-1);
assert.equal(moveRequest.dx, 20); assert.equal(moveRequest.dy, -8);
bridge.__dispatch({ type: 'fe-desktop-lyrics-result', requestId: moveRequest.requestId, ok: true });
await movement;

const wallpaperPromise = window.desktopOverlay.showWallpaper({ preset: 'aurora' });
const wallpaperRequest = nativeMessages.at(-1);
assert.equal(wallpaperRequest.type, 'fe-wallpaper');
bridge.__dispatch({ type: 'fe-wallpaper-result', requestId: wallpaperRequest.requestId, ok: true });
await wallpaperPromise;

// The snapshot export reads the real shared producer even when document.hidden
// prevents its normal requestAnimationFrame publisher from running.
const envelope = window.feMonsterDesktopSnapshot();
assert.equal(document.hidden, true);
assert.equal(envelope.snapshot.diyPreset, 'chladni');
assert.equal(envelope.lyrics.text, '同步歌词');
assert.equal(envelope.lyrics.progress, .25);
assert.equal(envelope.lyrics.playback.time, 14);
assert.equal(envelope.lyrics.playback.rate, 1.25);
assert.equal(envelope.lyrics.lyricLineEndTime, 18);
assert.equal(envelope.lyrics.colors.primary, '#0c2238');
assert.equal(envelope.lyrics.colors.highlight, '#abc');
assert.equal(envelope.lyrics.fontFamily, 'Custom font, PingFang SC');
assert.equal(envelope.wallpaper.cover, '/cover.png');
assert.equal(envelope.wallpaper.opacity, .42);
assert.equal(envelope.snapshot.lyricPlayback.missingTime, null, 'Snapshots must be valid JSON for the native bridge');

const externalWindow = { location: { hostname: 'example.com' } };
vm.runInContext(match[1], vm.createContext({ window: externalWindow }));
assert.equal(externalWindow.chrome, undefined, 'External pages must not advertise a native bridge that rejects their requests');
process.stdout.write('macOS WKWebView bridge behavior passed. Native Swift/AppKit compilation still requires macOS.\n');
