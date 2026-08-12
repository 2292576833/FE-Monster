import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const cssSource = fs.readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

function extractFunctionDeclaration(source, name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${name} must exist in the real lyric runtime`);

  const braceStart = source.indexOf('{', start + signature.length);
  assert.notEqual(braceStart, -1, `${name} must have a function body`);

  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
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
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`${name} must have a balanced function body`);
}

const failures = [];
function check(label, callback) {
  try {
    callback();
    console.log(`PASS ${label}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
    console.error(`FAIL ${label}: ${error.message}`);
  }
}

check('current row has continuously changing scroll highlight', () => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(extractFunctionDeclaration(appSource, 'computeMultiLyricHighlightProgress'), sandbox);
  const progressA = sandbox.computeMultiLyricHighlightProgress(10, 14, 11);
  const progressB = sandbox.computeMultiLyricHighlightProgress(10, 14, 13);
  assert.ok(progressA > 0 && progressA < progressB && progressB < 1,
    'the current multi-row line must expose continuously changing scroll-highlight progress');
  assert.equal(sandbox.computeMultiLyricHighlightProgress(10, 14, 9), 0);
  assert.equal(sandbox.computeMultiLyricHighlightProgress(10, 14, 15), 1);
  assert.match(appSource, /--multi-row-progress/,
    'the computed progress must reach the rendered multi-row lyric');
  assert.ok((appSource.match(/computeMultiLyricHighlightProgress\s*\(/g) || []).length >= 2,
    'the real render path must call the progress helper');
});

check('near-identical adjacent lyric event is deduplicated', () => {
  const line = { text: 'Space   space / 大空　大空', time: 10 };
  const adjacentDuplicate = { text: '  space space / 大空 大空  ', time: 10.045 };
  const laterRefrain = { text: 'Space space / 大空 大空', time: 22 };
  const sandbox = {
    state: {
      lyricLines: [line, adjacentDuplicate, laterRefrain],
      lyricSignature: 'dedupe-fixture',
      bilingualLyricsEnabled: true,
    },
    safeText: (value, fallback = '') => String(value || fallback || ''),
    playbackLyricText: () => '',
    playbackLyricSubtitle: () => '',
  };
  vm.createContext(sandbox);
  vm.runInContext([
    extractFunctionDeclaration(appSource, 'normalizeMultiLyricEventText'),
    extractFunctionDeclaration(appSource, 'areAdjacentMultiLyricEventsDuplicate'),
    extractFunctionDeclaration(appSource, 'multiRowDisplayModel'),
  ].join('\n'), sandbox);
  assert.equal(sandbox.areAdjacentMultiLyricEventsDuplicate(line, adjacentDuplicate), true,
    'same normalized lyric at nearly the same timestamp must occupy only one row');
  assert.equal(sandbox.areAdjacentMultiLyricEventsDuplicate(line, laterRefrain), false,
    'a legitimate repeated refrain at a later timestamp must remain visible');
  assert.equal(sandbox.normalizeMultiLyricEventText('go go go'), 'go go go',
    'normal repeated words inside one lyric must never be collapsed');
  const model = sandbox.multiRowDisplayModel();
  assert.equal(model.lines.length, 2, 'the real display model must remove the duplicate row');
  assert.deepEqual(Array.from(model.sourceToDisplay), [0, 0, 1],
    'both near-identical source events must map to the same mounted lyric row');
  assert.ok((appSource.match(/areAdjacentMultiLyricEventsDuplicate\s*\(/g) || []).length >= 2,
    'the real multi-row window builder must call adjacent-event dedupe');
});

check('multi-row stage reuses single-row X/Y/Z angles', () => {
  for (const axis of ['x', 'y', 'z']) {
    assert.match(appSource, new RegExp(`--text-preset-rotate-${axis}`),
      `the persisted single-row ${axis.toUpperCase()} angle must remain the shared source`);
  }
  const lateStageRule = cssSource.match(
    /\.multi-row-lyric-stage,\s*\.playback-lyric-scene\.is-multi-row-text\s+\.multi-row-lyric-stage\s*\{([^}]*)\}/,
  );
  assert.ok(lateStageRule, 'the final multi-row transform override must be explicit');
  assert.match(lateStageRule[1], /rotateX\(var\(--text-preset-rotate-x\)\)/,
    'multi-row X angle must use the persisted single-row angle');
  assert.match(lateStageRule[1], /rotateY\(var\(--text-preset-rotate-y\)\)/,
    'multi-row Y angle must use the persisted single-row angle');
  assert.match(lateStageRule[1], /rotateZ\(var\(--text-preset-rotate-z\)\)/,
    'multi-row Z angle must use the persisted single-row angle');
});

check('multi-row stage has no translucent panel or broad strip', () => {
  assert.match(appSource, /dataset\.multiLyricStage\s*=\s*["']true["']/,
    'the actual multi-row stage must opt into the panel-free style contract');
  const panelFreeRule = cssSource.match(/\[data-multi-lyric-stage=["']true["']\]\s*\{([^}]*)\}/);
  assert.ok(panelFreeRule, 'the actual multi-row stage must have an explicit panel-free rule');
  for (const declaration of [
    /background\s*:\s*none\s*!important/i,
    /backdrop-filter\s*:\s*none\s*!important/i,
    /box-shadow\s*:\s*none\s*!important/i,
    /border\s*:\s*0\s*!important/i,
  ]) {
    assert.match(panelFreeRule[1], declaration,
      'multi-row lyrics must not render a translucent panel or broad strip behind the rows');
  }
  const rowPanelFreeRule = cssSource.match(
    /\[data-multi-lyric-stage=["']true["']\]\s+\.multi-row-lyric-line\s*\{([^}]*)\}/,
  );
  assert.ok(rowPanelFreeRule, 'each actual multi-row line must opt out of broad strip styling');
  for (const declaration of [
    /background\s*:\s*none\s*!important/i,
    /backdrop-filter\s*:\s*none\s*!important/i,
    /box-shadow\s*:\s*none\s*!important/i,
    /border\s*:\s*0\s*!important/i,
  ]) {
    assert.match(rowPanelFreeRule[1], declaration,
      'each lyric row must be readable without a translucent background strip');
  }
});

check('multi-row current and future glyphs consume the shared text-preset material controls', () => {
  for (const variable of [
    '--text-depth-outline',
    '--text-highlight-intensity',
    '--text-highlight-softness',
    '--text-highlight-gloss',
    '--text-unplayed-blur-effective',
    '--text-letter-spacing',
    '--text-bass-spread',
  ]) {
    assert.match(appSource, new RegExp(variable), `${variable} must be derived from the text-preset settings`);
  }
  const currentPaint = Array.from(cssSource.matchAll(
    /\.multi-row-lyric-line\.is-current\s+:is\(\.multi-row-lyric-main,\s*\.multi-row-lyric-translation\)::after\s*\{([^}]*)\}/g,
  ), (match) => match[1]).join('\n');
  assert.ok(currentPaint, 'the active multi-row glyph paint layer must exist');
  for (const variable of [
    '--text-highlight-intensity',
    '--text-highlight-softness',
    '--text-highlight-gloss',
    '--text-bass-spread',
  ]) {
    assert.match(currentPaint, new RegExp(variable), `${variable} must affect the active multi-row paint`);
  }
  const futurePaint = Array.from(
    cssSource.matchAll(/\.multi-row-lyric-line\.is-future\s*\{([^}]*)\}/g),
    (match) => match[1],
  ).join('\n');
  assert.ok(futurePaint, 'future multi-row glyph material must exist');
  assert.match(futurePaint, /--text-unplayed-blur-effective/,
    'the text-preset unsung blur must affect future multi-row lyrics');
  assert.match(
    cssSource,
    /\.multi-row-lyric-main,\s*\.multi-row-lyric-translation\s*\{[^}]*filter:\s*brightness\(var\(--lyric-brightness\)\)/s,
    'the shared lyric brightness control must affect multi-row glyphs without filtering the whole stage',
  );
  assert.ok((appSource.match(/multiRowLyricMotionDuration\s*\(/g) || []).length >= 4,
    'the shared flow intensity must control current, future and leaving multi-row motion durations');
});

if (failures.length) {
  throw new AggregateError(failures, `${failures.length} multi-row lyric regressions detected`);
}
console.log('multi-row lyric highlight, dedupe, shared material, shared-angle, and panel-free regression checks passed');
