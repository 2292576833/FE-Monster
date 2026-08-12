import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const html = read('web/index.html');
const css = read('web/pixel-adventure.css');
const app = read('web/app.js');
const achievements = read('web/pixel-achievements.js');
const staticFiles = read('src/main/java/com/femonster/http/StaticFileHandler.java');
const webTtf = fs.readFileSync(path.join(root, 'web/fonts/awei-pixel/AaWeiWeiDianZhenTi-web.ttf'));
const webWoff2 = fs.readFileSync(path.join(root, 'web/fonts/awei-pixel/AaWeiWeiDianZhenTi.woff2'));

function sfntTableVersion(buffer, tableTag) {
  const tableCount = buffer.readUInt16BE(4);
  for (let index = 0; index < tableCount; index += 1) {
    const recordOffset = 12 + index * 16;
    if (buffer.toString('ascii', recordOffset, recordOffset + 4) !== tableTag) continue;
    const tableOffset = buffer.readUInt32BE(recordOffset + 8);
    return buffer.readUInt32BE(tableOffset);
  }
  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function occurrences(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function tagWithId(id) {
  const escapedId = escapeRegExp(id);
  const match = html.match(new RegExp(`<[^>]+\\bid=["']${escapedId}["'][^>]*>`, 'i'));
  assert.ok(match, `${id} is missing from web/index.html`);
  assert.equal(
    occurrences(html, new RegExp(`\\bid=["']${escapedId}["']`, 'gi')),
    1,
    `${id} must be unique`
  );
  return match[0];
}

function textWithId(id) {
  const escapedId = escapeRegExp(id);
  const match = html.match(new RegExp(
    `<([a-z][\\w-]*)\\b[^>]*\\bid=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    'i'
  ));
  assert.ok(match, `${id} must have an explicit closing tag`);
  return match[2].replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();
}

function extractFunctionDeclaration(source, name) {
  const startMatch = new RegExp(`(?:async\\s+)?function\\s+${escapeRegExp(name)}\\s*\\(`).exec(source);
  assert.ok(startMatch, `${name}() is missing from production code`);
  const start = startMatch.index;
  const openBrace = source.indexOf('{', start + startMatch[0].length);
  assert.ok(openBrace >= 0, `${name}() has no function body`);

  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openBrace; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = '';
      }
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  assert.fail(`${name}() has an unterminated function body`);
}

function assertTokensInOrder(source, tokens, message) {
  let cursor = -1;
  for (const token of tokens) {
    const next = source.indexOf(token, cursor + 1);
    assert.ok(next > cursor, `${message}: missing or out-of-order token ${token}`);
    cursor = next;
  }
}

const overlayTag = tagWithId('worldPeaceCinematic');
tagWithId('worldPeaceLinePrimary');
tagWithId('worldPeaceLineSecondary');
assert.match(overlayTag, /\bhidden\b/i, 'the cinematic overlay must begin hidden');
assert.match(overlayTag, /aria-hidden=["']true["']/i, 'the decorative cinematic must stay out of the accessibility tree');
assert.equal(textWithId('worldPeaceLinePrimary'), '世界和平');
assert.equal(textWithId('worldPeaceLineSecondary'), '愿天下没有战争');

assert.match(staticFiles, /Map\.entry\("\.woff2",\s*"font\/woff2"\)/,
  'the bundled WOFF2 achievement font must use a browser-safe MIME type');
assert.match(staticFiles, /Map\.entry\("\.ttf",\s*"font\/ttf"\)/,
  'the fallback TTF achievement font must use a browser-safe MIME type');
assert.equal(webWoff2.toString('ascii', 0, 4), 'wOF2', 'the primary achievement font must be WOFF2');
assert.equal(
  sfntTableVersion(webTtf, 'vhea'),
  0x00010000,
  'the browser fallback font must use the OpenType-supported vhea 1.0 version'
);
assert.match(css, /AaWeiWeiDianZhenTi\.woff2\?v=[^"')]+["')]\)\s*format\("woff2"\)/,
  'the achievement @font-face must prefer the corrected WOFF2 asset');
assert.match(css, /AaWeiWeiDianZhenTi-web\.ttf\?v=[^"')]+["')]\)\s*format\("truetype"\)/,
  'the achievement @font-face must retain the corrected TTF fallback');
assert.match(html, /rel="preload"[^>]+AaWeiWeiDianZhenTi\.woff2[^>]+type="font\/woff2"/,
  'the corrected WOFF2 font must be preloaded');

assert.match(
  css,
  /\.world-peace-cinematic\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*pointer-events:\s*none;/s,
  'the cinematic must be a non-interactive full-window overlay'
);
assert.match(
  css,
  /\.world-peace-cinematic__line\s*\{[^}]*clip-path:\s*inset\(0\s+100%\s+0\s+0\);/s,
  'cinematic copy must start clipped from the right edge'
);
assert.match(
  css,
  /\.world-peace-cinematic\.is-line-one[\s\S]{0,360}?clip-path:\s*inset\(0\s+0\s+0\s+0\);[\s\S]{0,260}?cubic-bezier\(/,
  'the first pixel line must reveal continuously from left to right'
);
assert.match(
  css,
  /\.world-peace-cinematic\.is-line-two \.world-peace-cinematic__line--secondary\s*\{[^}]*clip-path:\s*inset\(0\s+0\s+0\s+0\);[^}]*cubic-bezier\(/s,
  'the second pixel line must reveal continuously from left to right'
);
assert.doesNotMatch(
  css.match(/\.world-peace-cinematic__line[\s\S]*?@keyframes pixel-secret-shift/)?.[0] ?? '',
  /steps\(/,
  'the world-peace cinematic must not impose an artificial stepped frame cadence'
);

assert.match(
  achievements,
  /id:\s*["']world-peace["'][\s\S]{0,100}?name:\s*["']世界和平["']/,
  'world-peace must be present in the production achievement catalog'
);

const playbackHookPattern = /window\.feAchievements\?\.handlePlaybackStarted\?\.\(state\.currentSong\)/g;
const playbackHookMatches = [...app.matchAll(playbackHookPattern)];
assert.equal(playbackHookMatches.length, 1, 'playback must have exactly one world-peace achievement hook');
const playListenerIndex = app.search(/els\.audio\.addEventListener\(["']play["']/);
const playingListenerIndex = app.search(/els\.audio\.addEventListener\(["']playing["']/);
const canPlayListenerIndex = app.search(/els\.audio\.addEventListener\(["']canplay["']/);
assert.ok(playListenerIndex >= 0, 'the audio play event listener is missing');
assert.ok(
  playingListenerIndex >= 0
    && playbackHookMatches[0].index > playingListenerIndex
    && (canPlayListenerIndex < 0 || playbackHookMatches[0].index < canPlayListenerIndex),
  'the sole achievement hook must run after real audio playback starts, not from play intent or polling'
);

const normalizeTitleSource = extractFunctionDeclaration(achievements, 'normalizeWorldPeaceTitle');
const matchesTitleSource = extractFunctionDeclaration(achievements, 'isWorldPeaceSong');
const songSignatureSource = extractFunctionDeclaration(achievements, 'worldPeaceSongSignature');
const playbackHandlerSource = extractFunctionDeclaration(achievements, 'handlePlaybackStarted');
const waitSource = extractFunctionDeclaration(achievements, 'wait');
const nextPaintSource = extractFunctionDeclaration(achievements, 'nextPaint');
const ensureAchievementFontReadySource = extractFunctionDeclaration(achievements, 'ensureAchievementFontReady');
const sequenceSource = extractFunctionDeclaration(achievements, 'runWorldPeaceSequence');

const titleContext = vm.createContext({});
vm.runInContext(`
${normalizeTitleSource}
${matchesTitleSource}
globalThis.contract = { normalizeWorldPeaceTitle, isWorldPeaceSong };
`, titleContext);

const positiveTitles = [
  { title: 'We Are the World' },
  { title: 'WE.ARE.THE.WORLD' },
  { title: 'Ｗｅ　Ａｒｅ　ｔｈｅ　Ｗｏｒｌｄ' },
  { title: 'We Are the World (1985 Version)' },
  { name: 'We Are the World — Live · USA for Africa' },
  { title: 'USA for Africa / We Are the World 25 for Haiti' }
];
for (const song of positiveTitles) {
  assert.equal(titleContext.contract.isWorldPeaceSong(song), true, `expected a match for ${JSON.stringify(song)}`);
}
for (const song of [{ title: 'We Are the Champions' }, { title: 'We Are the Worldly' }]) {
  assert.equal(titleContext.contract.isWorldPeaceSong(song), false, `expected no match for ${JSON.stringify(song)}`);
}
assert.equal(
  titleContext.contract.normalizeWorldPeaceTitle({ title: 'ＷＥ—ＡＲＥ：ＴＨＥ／ＷＯＲＬＤ（２５）' }),
  'we are the world 25',
  'normalization must fold full-width characters, case, and punctuation'
);

const dedupeContext = vm.createContext({ Promise, Error });
vm.runInContext(`
let worldPeaceSequenceActive = false;
let lastWorldPeaceSongSignature = '';
let runCount = 0;
let rejectRun = null;
const playbackUnlockCalls = [];
function unlock(id) {
  playbackUnlockCalls.push(id);
  return true;
}
function runWorldPeaceSequence() {
  runCount += 1;
  return new Promise((resolve, reject) => { rejectRun = reject; });
}
${normalizeTitleSource}
${matchesTitleSource}
${songSignatureSource}
${playbackHandlerSource}
globalThis.contract = {
  handlePlaybackStarted,
  getRunCount: () => runCount,
  getUnlockCalls: () => [...playbackUnlockCalls],
  reject: () => rejectRun(new Error('contract release'))
};
`, dedupeContext);

const firstSong = { provider: 'netease', id: '1985', title: 'We Are the World' };
assert.equal(dedupeContext.contract.handlePlaybackStarted(firstSong), true, 'first matching play must start the sequence');
assert.equal(
  dedupeContext.contract.handlePlaybackStarted({ provider: 'qq', id: 'cover', title: 'WE ARE THE WORLD (Live)' }),
  false,
  'the running lock must reject a second matching play while the sequence is active'
);
assert.equal(dedupeContext.contract.getRunCount(), 1, 'the running lock must keep one active sequence');
dedupeContext.contract.reject();
await new Promise((resolve) => setImmediate(resolve));
assert.deepEqual(
  Array.from(dedupeContext.contract.getUnlockCalls()),
  ['first-play'],
  'a first world-peace play must defer the ordinary playback achievement until the cinematic settles'
);
assert.equal(
  dedupeContext.contract.handlePlaybackStarted({ provider: 'netease', id: '1985', title: 'WE.ARE.THE.WORLD' }),
  false,
  'the same normalized song signature must not retrigger after the active sequence settles'
);
assert.equal(dedupeContext.contract.getRunCount(), 1, 'same-song replay must remain deduplicated');

const overlayClasses = new Set();
const classOperations = [];
const overlay = {
  hidden: true,
  classList: {
    add(...names) {
      names.forEach((name) => overlayClasses.add(name));
      classOperations.push(...names.map((name) => `add:${name}`));
    },
    remove(...names) {
      names.forEach((name) => overlayClasses.delete(name));
      classOperations.push(...names.map((name) => `remove:${name}`));
    }
  }
};
const audioOperations = [];
let preservedSource = 'qa://we-are-the-world';
const guardedAudio = {
  pause() { audioOperations.push('pause'); },
  load() { audioOperations.push('load'); },
  removeAttribute(name) { if (name === 'src') audioOperations.push('remove-src'); },
  setAttribute(name, value) { if (name === 'src') audioOperations.push(`set-src:${value}`); },
  get src() { return preservedSource; },
  set src(value) {
    audioOperations.push(`src:${value}`);
    preservedSource = value;
  }
};
const unlockCalls = [];
const requestedWaits = [];
const sequenceContext = vm.createContext({
  document: {
    fonts: {
      load() {
        return Promise.resolve([{}]);
      }
    },
    querySelector(selector) {
      if (selector === '#worldPeaceCinematic') return overlay;
      if (selector === '#audio') return guardedAudio;
      return null;
    }
  },
  audio: guardedAudio,
  els: { audio: guardedAudio },
  unlock(id) {
    unlockCalls.push({ id, hidden: overlay.hidden, classes: [...overlayClasses] });
    return true;
  },
  window: {
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
    setTimeout(callback, milliseconds) {
      requestedWaits.push(milliseconds);
      callback();
      return requestedWaits.length;
    }
  }
});
vm.runInContext(`
let worldPeaceSequenceActive = true;
${waitSource}
${nextPaintSource}
${ensureAchievementFontReadySource}
${sequenceSource}
globalThis.contract = {
  runWorldPeaceSequence,
  isActive: () => worldPeaceSequenceActive
};
`, sequenceContext);

assert.doesNotMatch(sequenceSource, /\.pause\s*\(/, 'the cinematic must not pause music');
assert.doesNotMatch(sequenceSource, /\.load\s*\(/, 'the cinematic must not reload music');
assert.doesNotMatch(
  sequenceSource,
  /\.src\s*=|(?:setAttribute|removeAttribute)\s*\(\s*["']src["']/,
  'the cinematic must not replace or remove the audio source'
);
assert.match(sequenceSource, /await\s+wait\(firstRevealTime\s*\+\s*2000\)/,
  'the first message must remain for two seconds before fading');
assertTokensInOrder(
  sequenceSource,
  ["add('is-dark')", "add('is-line-one')", "add('is-line-one-out')", "add('is-line-two')", "add('is-restoring')"],
  'cinematic state flow'
);

await sequenceContext.contract.runWorldPeaceSequence();
assert.deepEqual(audioOperations, [], 'the full cinematic must leave the live audio element untouched');
assert.equal(preservedSource, 'qa://we-are-the-world', 'the live audio source must survive the cinematic');
assert.deepEqual(unlockCalls.map((entry) => entry.id), ['world-peace'], 'completion must unlock world-peace exactly once');
assert.equal(unlockCalls[0].hidden, true, 'the interface must be restored before the achievement is unlocked');
assert.deepEqual(unlockCalls[0].classes, [], 'cinematic classes must be cleaned before the achievement toast');
assert.equal(overlay.hidden, true, 'the overlay must be hidden after completion');
assert.equal(sequenceContext.contract.isActive(), false, 'the running lock must be released after completion');
assertTokensInOrder(
  classOperations.join('|'),
  ['add:is-dark', 'add:is-line-one', 'add:is-line-one-out', 'add:is-line-two', 'add:is-restoring'],
  'runtime cinematic state flow'
);
assert.deepEqual(
  requestedWaits,
  [1800, 950, 3200, 1250, 2850, 950],
  'font readiness and production sequence timing contract changed unexpectedly'
);

console.log('World peace achievement contract PASS');
