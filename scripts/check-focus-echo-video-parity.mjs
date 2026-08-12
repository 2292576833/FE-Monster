import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const css = fs.readFileSync(path.join(root, 'web', 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');

function balancedBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return '';
  const openIndex = source.indexOf('{', markerIndex + marker.length);
  if (openIndex < 0) return '';
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(markerIndex, index + 1);
    }
  }
  return '';
}

function rule(selector) {
  return balancedBlock(css, selector);
}

function functionBody(name) {
  return balancedBlock(app, `function ${name}`);
}

const checks = [];
function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail });
}

const converge = balancedBlock(css, '@keyframes focusEchoConverge');
check(
  'the main phrase focuses from a large soft image to a clear 1x image',
  /0%\s*\{[\s\S]*?blur\(15px\)[\s\S]*?scale\(1\.62\)/.test(converge)
    && /100%\s*\{[\s\S]*?blur\(0(?:px)?\)[\s\S]*?scale\(1\)/.test(converge),
  'The reference enters around 1.6x/15px blur and settles at 1x/0px blur.'
);

const shadowSettle = balancedBlock(css, '@keyframes focusEchoShadowSettle');
check(
  'all selected echo layers share a parameter-aware soft-focus settle',
  /--focus-echo-blur/.test(shadowSettle)
    && /--focus-echo-scale-x/.test(shadowSettle)
    && /--focus-echo-scale/.test(shadowSettle),
  'Echo entry must finish on each layer\'s computed blur/scale so controls remain live after a line change.'
);

const mainLayer = rule('.playback-lyric-scene.is-focus-echo-text .lyric-depth-0');
check(
  'the stable main phrase remains sharp and frontmost',
  /filter\s*:\s*(?:none|blur\(0(?:px)?\))/.test(mainLayer)
    && /scale\(1\)/.test(mainLayer)
    && /opacity\s*:\s*1/.test(mainLayer),
  'Only the background echoes may stay blurred; the settled main phrase must remain clear.'
);

const focusVisibleLayer = rule(
  '.playback-lyric-scene.is-focus-echo-text .playback-lyric-layer.is-text-composer-layer-visible'
);
check(
  'focus echo visibility follows the echo-layer control',
  /display\s*:\s*block\s*!important/.test(focusVisibleLayer)
    && /blur\(var\(--focus-echo-blur\)\)/.test(focusVisibleLayer)
    && /scaleX\(var\(--focus-echo-scale-x\)\)/.test(focusVisibleLayer)
    && /scale\(var\(--focus-echo-scale\)\)/.test(focusVisibleLayer),
  'The preset still hard-codes three sharp copies instead of using the selected echo layers.'
);

for (let depth = 1; depth <= 5; depth += 1) {
  const layer = rule(`.playback-lyric-scene.is-focus-echo-text .lyric-depth-${depth}`);
  check(
    `echo depth ${depth} owns an increasingly soft spatial profile`,
    /--focus-echo-blur\s*:/.test(layer)
      && /--focus-echo-scale-x\s*:/.test(layer)
      && /--focus-echo-scale\s*:/.test(layer)
      && /--focus-echo-opacity\s*:/.test(layer),
    `Depth ${depth} is not wired to the focus-echo blur/scale/opacity profile.`
  );
}

const focusAfter = rule('.playback-lyric-scene.is-focus-echo-text .lyric-depth-0::after');
check(
  'focus echo has no rolling color wipe',
  /content\s*:\s*none\s*!important/.test(focusAfter)
    && /display\s*:\s*none\s*!important/.test(focusAfter),
  'The reference keeps the main phrase one color; the generic rolling-highlight pseudo-element is still active.'
);

const continuousHighlightStart = css.indexOf('/* Continuous lyric highlight: start */');
const continuousHighlightEnd = css.indexOf('/* Continuous lyric highlight: end */');
const continuousHighlight = continuousHighlightStart >= 0 && continuousHighlightEnd > continuousHighlightStart
  ? css.slice(continuousHighlightStart, continuousHighlightEnd)
  : css.slice(20100);
check(
  'generic rolling-highlight selectors explicitly exclude focus echo',
  (continuousHighlight.match(/:not\(\.is-focus-echo-text\)/g) || []).length >= 4,
  'A later generic selector can still make the focus main layer transparent and replace it with a progress mask.'
);

const sharedLetterSpacingStart = css.indexOf('/* Composable text controls');
const sharedLetterSpacing = sharedLetterSpacingStart >= 0
  ? css.slice(sharedLetterSpacingStart, sharedLetterSpacingStart + 700)
  : '';
check(
  'the generic important letter spacing does not override focus convergence',
  /:not\(\.is-focus-echo-text\)[\s\S]{0,220}letter-spacing\s*:\s*var\(--text-letter-spacing\)\s*!important/.test(
    sharedLetterSpacing
  ),
  'The focus keyframe cannot animate letter spacing while the shared !important rule targets it.'
);

const wordGlow = functionBody('wordGlowLyricActive');
const handwrittenMood = functionBody('handwrittenMoodLyricActive');
check(
  'focus echo stays visually pure when other single-line effects were previously enabled',
  /state\.textPreset\s*!==\s*['"]focus-echo['"]/.test(wordGlow)
    && /state\.textPreset\s*!==\s*['"]focus-echo['"]/.test(handwrittenMood),
  'Sweep/handwritten classes can still be inherited by focus echo and change the reference appearance.'
);

const focusScene = rule('.playback-lyric-scene.is-focus-echo-text');
check(
  'focus transition is clamped to the reference timing window',
  /--focus-echo-duration\s*:\s*clamp\(720ms\s*,\s*var\(--lyric-duration\)\s*,\s*880ms\)/.test(focusScene),
  'The measured reference settles in roughly 0.7–0.9 seconds.'
);

check(
  'the focus phrase has its own fitted display size',
  /function\s+focusEchoFitMetrics\s*\(/.test(app)
    && /focusEchoFitMetrics\s*\(focusText/.test(app)
    && /viewportWidth\s*\*\s*0\.102/.test(app),
  'The reference focus phrase is roughly 72px at 708px wide, independent of the 40px main-line fit.'
);

check(
  'stable echoes are centered and remain behind the main phrase',
  /x:\s*-3,\s*y:\s*1\.5/.test(app)
    && /x:\s*2,\s*y:\s*2\.5/.test(app)
    && /x:\s*0,\s*y:\s*3\.5/.test(app),
  'The video has a shared center anchor; large alternating x/y offsets create a trailing copy instead.'
);

check(
  'echo opacity matches the subtle dark-teal reference layers',
  /opacity:\s*0\.24,\s*blur:\s*4\.8/.test(app)
    && /opacity:\s*0\.15,\s*blur:\s*8\.5/.test(app)
    && /opacity:\s*0\.09,\s*blur:\s*13/.test(app),
  'The three reference layers are about 0.24/0.15/0.09 alpha, not dominant copies.'
);

const focusMainEntering = rule(
  '.playback-lyric-scene.is-focus-echo-text.is-focus-echo-entering .lyric-depth-0'
);
check(
  'the dark focus phrase leads the main refocus by about 160ms',
  /var\(--focus-echo-main-delay\)/.test(focusMainEntering)
    && /--focus-echo-main-delay\s*:\s*160ms/.test(focusScene)
    && /cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/.test(focusMainEntering),
  'The reference echo appears 150–250ms before the main phrase and uses a strong ease-out.'
);

for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
  if (!item.ok) console.log(`  ${item.detail}`);
}

const failures = checks.filter((item) => !item.ok);
if (failures.length) {
  console.error(`\nFocus echo video parity failed: ${failures.length}/${checks.length}`);
  process.exit(1);
}

console.log(`\nFocus echo video parity passed: ${checks.length}/${checks.length}`);
