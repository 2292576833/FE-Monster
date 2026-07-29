import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web/app.js'), 'utf8');

function functionBlock(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const bodyStart = app.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = bodyStart; index < app.length; index += 1) {
    const char = app[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

const normalizeStart = app.indexOf('function normalizeQishuiMatchText(');
const scoreStart = app.indexOf('function qishuiGuestMatchScore(');
const cacheKeyStart = app.indexOf('function qishuiGuestMatchCacheKey(');
const normalizeSource = app.slice(normalizeStart, scoreStart);
const scoreSource = app.slice(scoreStart, cacheKeyStart);
const score = new Function(`
  const safeText = (value, fallback = '') => value === undefined || value === null || value === ''
    ? fallback
    : String(value);
  ${normalizeSource}
  ${scoreSource}
  return qishuiGuestMatchScore;
`)();

const source = {
  title: '星河 入梦',
  artist: '测试-歌手',
  album: '夜 航',
  duration: 216
};
const exact = score(source, {
  title: '星河入梦',
  artist: '测试歌手',
  album: '夜航',
  duration: 217
});
const wrongArtist = score(source, {
  title: '星河入梦',
  artist: '另一位歌手',
  album: '夜航',
  duration: 216
});
const farDuration = score(source, {
  title: '星河入梦',
  artist: '测试歌手',
  album: '夜航',
  duration: 400
});
assert.ok(exact >= 100, `exact normalized metadata should rank high, got ${exact}`);
assert.equal(Number.isFinite(wrongArtist), false, 'artist mismatch must be rejected');
assert.ok(exact > farDuration, 'duration should improve best-match ordering');

const resolver = functionBlock('resolveQishuiMetadataViaGuestSearch');
const playableProbe = functionBlock('qishuiGuestCandidateIsPlayable');
const loadSong = app.slice(app.indexOf('async function loadSong('), app.indexOf('async function submitSearch('));
assert.match(app, /QISHUI_GUEST_FALLBACK_PROVIDERS\s*=\s*Object\.freeze\(\[['"]netease['"],\s*['"]qq['"],\s*['"]kugou['"]\]\)/);
assert.doesNotMatch(resolver, /accessToken|cookie|session|decrypt|解密/i);
assert.match(resolver, /provider\s*!==\s*['"]qishui['"]/);
assert.match(resolver, /Promise\.allSettled/);
assert.match(resolver, /qishuiGuestMatchScore/);
assert.match(resolver, /state\.qishuiGuestMatches\.cache/);
assert.match(resolver, /state\.qishuiGuestMatches\.requests/);
assert.match(playableProbe, /\/api\/song\/url/);
assert.match(playableProbe, /payload\.playable\s*===\s*true/);
assert.match(loadSong, /isQishuiMetadataSong\(song\)/);
assert.match(loadSong, /resolveQishuiMetadataViaGuestSearch\(song\)/);
assert.match(loadSong, /未找到可公开播放的游客搜索匹配/);
assert.match(app, /游客搜索匹配/);

console.log(JSON.stringify({
  ok: true,
  checks: [
    'Qishui metadata-only detection',
    'legal configured public providers only',
    'normalized title artist album duration scoring',
    'playable URL probe before selection',
    'deduplicated positive and negative cache',
    'unified loadSong playback path',
    'explicit no-public-source message',
    'visitor search match UI label'
  ],
  scores: { exact, farDuration }
}, null, 2));
