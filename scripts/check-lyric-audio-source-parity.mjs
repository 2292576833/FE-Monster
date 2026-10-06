import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

function functionSource(name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${name} is missing`);
  const signatureEnd = source.indexOf(') {', start);
  assert.notEqual(signatureEnd, -1, `${name} signature is malformed`);
  const open = signatureEnd + 2;
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} has an unbalanced body`);
}

const songParams = functionSource('songParams');
const loadSong = functionSource('loadSong');
const loadLyrics = functionSource('loadPlaybackLyrics');
const requestLyrics = functionSource('requestLyricPayload');

assert.match(songParams, /id:\s*song\.id[\s\S]*provider:\s*song\.provider\s*\|\|\s*'netease'/,
  'audio load parameters are not bound to one song/provider identity');
assert.match(loadSong, /apiJson\(`\/api\/player\/load\?\$\{songParams\(song,\s*\{\s*quality\s*\}\)\}`\)/,
  'audio URL loading bypasses the selected song identity');
assert.match(loadSong, /state\.currentSong\s*=\s*\{[\s\S]*?\.\.\.song,[\s\S]*?\.\.\.\(data\.song\s*\|\|\s*\{\}\)[\s\S]*?\}[\s\S]*?renderCurrent\(state\.currentSong\)/,
  'the canonical backend song identity is not committed before lyric loading');
assert.match(loadLyrics, /const provider\s*=\s*playbackQualityProvider\(song\)[\s\S]*?playbackLyricTimelineResolver\(\)\.resolve\(song, provider\)/,
  'lyrics do not use the same canonical song/provider identity as playback');
assert.match(requestLyrics, /provider,[\s\S]*?id:\s*safeText\(song\s*&&\s*song\.id/,
  'lyric API requests are not bound to the resolved provider and canonical song id');

console.log(JSON.stringify({
  ok: true,
  audioIdentity: 'song.id + song.provider',
  lyricIdentity: 'canonical currentSong.id + currentSong.provider'
}, null, 2));
