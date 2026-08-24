import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function topLevelFunction(name) {
  const markers = [`function ${name}(`, `async function ${name}(`];
  const starts = markers.map((marker) => source.indexOf(marker)).filter((index) => index >= 0);
  assert.ok(starts.length, `app.js must define ${name}()`);
  const start = Math.min(...starts);
  const nextFunction = /\n(?:async )?function [A-Za-z0-9_$]+\s*\(/g;
  nextFunction.lastIndex = start + 1;
  const next = nextFunction.exec(source);
  return source.slice(start, next ? next.index + 1 : source.length);
}

const importedAurora = { id: 'imported:aurora', name: 'Aurora', source: 'imported', kind: 'image' };
const importedLake = { id: 'imported:lake', name: 'Lake', source: 'imported', kind: 'image' };
const liveRain = { id: 'wallpaper-engine:rain', name: 'Rain', source: 'wallpaper-engine', kind: 'video' };
const liveCloud = { id: 'wallpaper-engine:cloud', name: 'Cloud', source: 'wallpaper-engine', kind: 'video' };
const state = {
  wallpapers: [],
  wallpaperCatalogs: { imported: [], live: [] },
  wallpaperLoading: false,
  wallpaperSource: 'imported',
  activeWallpaperId: importedAurora.id,
  activeWallpaperIds: { imported: importedAurora.id, live: '' }
};
const calls = [];
const context = vm.createContext({
  state,
  Date,
  window: { setTimeout },
  safeText(value, fallback = '') {
    const text = String(value ?? '').trim();
    return text || fallback;
  },
  wallpaperById(id) {
    return state.wallpapers.find((item) => item.id === id) || null;
  },
  async setWallpaperSource(sourceName) {
    calls.push(`switch:${sourceName}:start`);
    state.wallpaperSource = sourceName;
    state.wallpaperLoading = true;
    await new Promise((resolve) => setTimeout(resolve, 2));
    state.wallpaperLoading = false;
    calls.push(`switch:${sourceName}:ready`);
  },
  async refreshWallpapers({ source: sourceName }) {
    calls.push(`refresh:${sourceName}:start`);
    state.wallpaperLoading = true;
    await new Promise((resolve) => setTimeout(resolve, 2));
    state.wallpaperLoading = false;
    calls.push(`refresh:${sourceName}:ready`);
  },
  selectWallpaper(id) {
    assert.equal(state.wallpaperLoading, false, 'wallpaper was selected while its source catalog was refreshing');
    calls.push(`select:${state.wallpaperSource}:${id}`);
    state.activeWallpaperId = id;
    state.activeWallpaperIds[state.wallpaperSource] = id;
  }
});

vm.runInContext([
  topLevelFunction('replaceLoadedWallpaperCatalogs'),
  topLevelFunction('waitForWallpaperRefresh'),
  topLevelFunction('applyCompanionWallpaper')
].join('\n'), context);

context.replaceLoadedWallpaperCatalogs([importedAurora, liveRain], ['imported', 'live']);
assert.deepEqual(
  plain(state.wallpapers.map((item) => item.id)),
  [importedAurora.id, liveRain.id],
  'initial combined loaded catalog did not retain both sources'
);
context.replaceLoadedWallpaperCatalogs([liveCloud], ['live']);
assert.deepEqual(
  plain(state.wallpapers.map((item) => item.id)),
  [importedAurora.id, liveCloud.id],
  'refreshing Wallpaper Engine erased the already loaded imported catalog'
);
context.replaceLoadedWallpaperCatalogs([importedLake], ['imported']);
assert.deepEqual(
  plain(state.wallpapers.map((item) => item.id)),
  [importedLake.id, liveCloud.id],
  'refreshing imported wallpapers erased the already loaded Wallpaper Engine catalog'
);

await context.applyCompanionWallpaper(liveCloud);
assert.deepEqual(calls.slice(0, 3), [
  'switch:live:start',
  'switch:live:ready',
  `select:live:${liveCloud.id}`
]);
assert.equal(state.activeWallpaperIds.live, liveCloud.id);

calls.length = 0;
await context.applyCompanionWallpaper(importedLake);
assert.deepEqual(calls.slice(0, 3), [
  'switch:imported:start',
  'switch:imported:ready',
  `select:imported:${importedLake.id}`
]);
assert.equal(state.activeWallpaperIds.imported, importedLake.id);

console.log(JSON.stringify({
  ok: true,
  catalog: state.wallpapers.map((item) => item.id),
  activeWallpaperIds: state.activeWallpaperIds
}, null, 2));
