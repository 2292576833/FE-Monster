import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
function block(start, end) {
  const offset = app.indexOf(start);
  const limit = app.indexOf(end, offset + start.length);
  assert.ok(offset >= 0 && limit > offset, `missing source block: ${start}`);
  return app.slice(offset, limit);
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const songs = ['shelf-a', 'shelf-b', 'shelf-c'].map((id) => ({ id, provider: 'netease' }));
const queue = ['queue-a', 'queue-b', 'queue-c'].map((id) => ({ id, provider: 'netease' }));
const playlist = { id: 'shelf', provider: 'netease' };
function harness() {
  const loads = [];
  const focuses = [];
  const state = {
    activeProvider: 'netease', audioSourceLibraryRevision: 0, queue: queue.slice(),
    queueIndex: -1, queueLength: queue.length, currentSong: null,
    playbackSelection: { kind: 'queue', index: -1, songs: [] },
    audioPlaybackContinuity: { sourceGeneration: 0 }
  };
  const context = vm.createContext({
    state, loads, focuses,
    safeText: (value, fallback = '') => String(value ?? '').trim() || fallback,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    audioSourceLibraryAllows: () => true,
    isQishuiMetadataSong: (song) => song.provider === 'qishui',
    isLocalSong: (song) => song.provider === 'local',
    loadSong: async (song) => {
      loads.push(song.id);
      state.audioPlaybackContinuity.sourceGeneration += 1;
      state.currentSong = song;
      return true;
    },
    audioPlaybackLoadIsCurrent: (generation) => generation === state.audioPlaybackContinuity.sourceGeneration,
    refreshPlayerState: async () => {},
    updateShelfCurrentSong: () => {},
    setSongFocus: (index) => focuses.push(index),
    closePlaylistShelf: () => {},
    petAssistantSongSummary: (song) => song,
    toast: () => {}
  });
  vm.runInContext([
    block('function nextPlaybackQueueIndex(', 'function switchQishuiPlaybackTrack('),
    block('async function playPlaylistTracks(', 'async function playShelfSong('),
    block('async function playQueueIndex(', 'async function transport(')
  ].join('\n'), context);
  return context;
}

// Browsing a different shelf and adding songs must not replace the active source.
{
  const ctx = harness();
  await ctx.playPlaylistTracks(playlist, songs, 0);
  ctx.state.activePlaylistSongs = queue;
  await ctx.advancePlaybackSelection(1);
  assert.equal(ctx.state.currentSong.id, 'shelf-b');
  assert.deepEqual(ctx.state.queue.map((song) => song.id), queue.map((song) => song.id));
  await ctx.advancePlaybackSelection(-1);
  await ctx.advancePlaybackSelection(-1);
  assert.equal(ctx.state.currentSong.id, 'shelf-c', 'song-bar navigation wraps in its own list');
  await ctx.playQueueIndex(1);
  await ctx.advancePlaybackSelection(1);
  assert.equal(ctx.state.currentSong.id, 'queue-c');
  await ctx.advancePlaybackSelection(1);
  assert.equal(ctx.state.currentSong.id, 'queue-a', 'queue navigation wraps in the queue');
  await ctx.playPlaylistTracks(playlist, songs, 1);
  await ctx.advancePlaybackSelection(1);
  assert.equal(ctx.state.currentSong.id, 'shelf-c', 'song-bar click switches navigation back');
}

// An old post-load refresh cannot move a newer song-bar selection backwards.
{
  const ctx = harness();
  const refresh = deferred();
  const refreshStarted = deferred();
  let first = true;
  ctx.refreshPlayerState = () => {
    if (!first) return Promise.resolve();
    first = false;
    refreshStarted.resolve();
    return refresh.promise;
  };
  const older = ctx.playPlaylistTracks(playlist, songs, 0);
  await refreshStarted.promise;
  await ctx.playPlaylistTracks(playlist, songs, 1);
  refresh.resolve();
  await older;
  assert.equal(ctx.state.playbackSelection.index, 1, 'stale refresh must not reset the selection index');
  await ctx.advancePlaybackSelection(1);
  assert.equal(ctx.state.currentSong.id, 'shelf-c');
}

// A slow metadata lookup cannot take playback back from a selected queue song.
{
  const ctx = harness();
  const match = deferred();
  ctx.resolveQishuiMetadataViaGuestSearch = () => match.promise;
  const older = ctx.playPlaylistTracks(playlist, [{ id: 'metadata', provider: 'qishui' }], 0);
  await ctx.playQueueIndex(0);
  match.resolve({ id: 'matched-song', provider: 'netease' });
  await older;
  assert.equal(ctx.state.playbackSelection.kind, 'queue', 'late metadata must not replace the queue source');
  assert.equal(ctx.state.currentSong.id, 'queue-a');
  assert.deepEqual(ctx.loads, ['queue-a'], 'stale song must never start loading');
  await ctx.advancePlaybackSelection(1);
  assert.equal(ctx.state.currentSong.id, 'queue-b');
}

console.log('PASS playback selection: independent sources, wraparound, stale refresh and metadata lookup');
