import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const queue = readFileSync(new URL('../web/playback-queue.js', import.meta.url), 'utf8');

const start = app.indexOf('async function playPlaylistTracks(');
const end = app.indexOf('\nasync function playShelfSong(', start);
assert.ok(start >= 0 && end > start, 'playPlaylistTracks block is present');
const playPlaylist = app.slice(start, end);

assert.match(playPlaylist, /state\.activePlaylistSongs\s*=\s*tracks/);
assert.match(playPlaylist, /playback queue[\s\S]{0,80}explicit user-managed list/);
assert.match(playPlaylist, /syncPlaybackQueueIndexToCurrentSong\(\)/);
assert.doesNotMatch(playPlaylist, /state\.queue\s*=\s*tracks/);
assert.doesNotMatch(playPlaylist, /\/api\/player\/queue/);

const addToQueue = queue.slice(queue.indexOf('async function addToQueue('), queue.indexOf('\n  function ensureShelfQueueButtons'));
assert.ok(addToQueue.includes('queue.push(song)'), 'manual queue insertion remains available');
assert.doesNotMatch(addToQueue, /state\.queueIndex\s*=\s*0/);
assert.match(addToQueue, /isSameSong\(state\.currentSong, song\)/);

const switchStart = app.indexOf('function switchQishuiPlaybackTrack(');
const switchEnd = app.indexOf('\n\n', switchStart);
const switchBlock = app.slice(switchStart, switchEnd > switchStart ? switchEnd : switchStart + 2400);
assert.match(switchBlock, /advancePlaybackSelection\(direction\)/);
assert.doesNotMatch(switchBlock, /transport\(previous \? '\/api\/player\/previous'/);
const selectionStart = app.indexOf('async function advancePlaybackSelection(');
assert.ok(selectionStart >= 0, 'source-aware playback advancement is present');
const selectionBlock = app.slice(selectionStart, app.indexOf('\n\nfunction syncPlaybackQueueIndexToCurrentSong', selectionStart));
assert.match(selectionBlock, /playbackSelectionIsPlaylist/);
assert.match(selectionBlock, /playQueueIndex\(index\)/);

console.log(JSON.stringify({
  ok: true,
  checks: {
    playlistSelectionPreservesManualQueue: true,
    manualQueueInsertionDoesNotInventCurrentIndex: true,
    wheelNavigationFollowsActivePlaybackSource: true
  }
}, null, 2));
