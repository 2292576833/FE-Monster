import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const start = app.indexOf('async function playPlaylistTracks(');
const end = app.indexOf('\nasync function playShelfSong(', start);

assert.notEqual(start, -1, 'playPlaylistTracks is missing');
assert.notEqual(end, -1, 'playPlaylistTracks boundary is missing');

const directSelection = app.slice(start, end);

assert.match(
  directSelection,
  /(?:const|let) loaded = await loadSong\(song, \{ silent: true \}\)/,
  'a clicked playlist row must load the exact selected song first'
);
assert.doesNotMatch(
  directSelection,
  /transport\(\s*['"]\/api\/player\/next['"]/,
  'a failed direct selection must not silently advance to a different song'
);
assert.match(
  directSelection,
  /if \(!loaded\) throw new Error\(/,
  'an unavailable clicked song must surface an explicit error'
);

console.log('Playlist direct-selection identity contract PASS');
