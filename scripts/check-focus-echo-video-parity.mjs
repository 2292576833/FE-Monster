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
  let quote = '';
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}' && --depth === 0) return source.slice(markerIndex, index + 1);
  }
  return '';
}

function rule(selector) {
  return balancedBlock(css, selector);
}

function functionBody(name) {
  return balancedBlock(app, `function ${name}`);
}

function numericConstant(name) {
  const expression = app.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9.]+)\\s*;`))?.[1];
  return expression == null ? Number.NaN : Number(expression);
}

const checks = [];
function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail });
}

const visualLead = numericConstant('FOCUS_ECHO_VISUAL_LEAD_SECONDS');
const minimumDuration = numericConstant('FOCUS_ECHO_TRANSITION_MIN_MS');
const maximumDuration = numericConstant('FOCUS_ECHO_TRANSITION_MAX_MS');
const layerStagger = numericConstant('FOCUS_ECHO_LAYER_STAGGER_MS');

check(
  'focus echo begins on the real lyric timestamp',
  visualLead === 0,
  `Expected zero FOCUS_ECHO_VISUAL_LEAD_SECONDS; received ${visualLead}.`
);
check(
  'focus echo convergence is clamped to the confirmed 420-480ms window',
  minimumDuration === 420 && maximumDuration === 480,
  `Expected 420/480ms bounds; received ${minimumDuration}/${maximumDuration}.`
);
check(
  'echo layers use a 20ms media-timeline stagger and settle within 520ms',
  layerStagger === 20 && maximumDuration + layerStagger * 2 <= 520,
  `Expected a 20ms stagger and <=520ms total; received ${layerStagger}ms/${maximumDuration + layerStagger * 2}ms.`
);

const leadSource = functionBody('playbackLyricVisualLeadSeconds');
check(
  'focus echo line selection uses zero synthetic lead',
  /return\s+0\s*;/.test(leadSource),
  'playbackLyricVisualLeadSeconds() must use the real media clock without lead.'
);

const disposeSource = functionBody('disposeFocusEchoTransition');
const durationSource = functionBody('focusEchoTransitionDurationMs');
const startSource = functionBody('startFocusEchoTransition');
const syncSource = functionBody('syncFocusEchoTransition');

check(
  'focus echo owns one disposable transition runtime',
  /focusEchoTransition\s*:/.test(app)
    && /state\.focusEchoTransition/.test(disposeSource)
    && /\.cancel\s*\(/.test(disposeSource),
  'state.focusEchoTransition and disposeFocusEchoTransition() must own/cancel the WAAPI handles.'
);
check(
  'focus echo duration is derived and clamped through the named timing bounds',
  /FOCUS_ECHO_TRANSITION_MIN_MS/.test(durationSource)
    && /FOCUS_ECHO_TRANSITION_MAX_MS/.test(durationSource)
    && /clamp\s*\(/.test(durationSource),
  'focusEchoTransitionDurationMs() must clamp the effective lyric duration to 420-480ms.'
);
check(
  'line entry creates paused WAAPI animations with fill on both sides',
  /\.animate\s*\(/.test(startSource)
    && /fill\s*:\s*['"]both['"]/.test(startSource)
    && /\.pause\s*\(\s*\)/.test(startSource)
    && /\.currentTime\s*=\s*0/.test(startSource)
    && /FOCUS_ECHO_LAYER_STAGGER_MS/.test(startSource),
  'startFocusEchoTransition() must create, pause, and zero the staggered WAAPI animations.'
);
check(
  'the focus phase is a pure function of effective display time',
  /displayTime/.test(syncSource)
    && /\.time/.test(syncSource)
    && /1000/.test(syncSource)
    && /\.currentTime\s*=/.test(syncSource),
  'syncFocusEchoTransition(displayTime) must write (displayTime - line.time) * 1000 to every animation.'
);
check(
  'focus transition code has no wall-clock scheduler',
  !/(?:requestAnimationFrame|setTimeout|performance\.now|Date\.now)\s*\(/.test(`${startSource}\n${syncSource}`),
  'The focus transition must not advance from rAF, timers, performance.now(), or Date.now().'
);

const setLineSource = functionBody('setPlaybackLyricLine');
check(
  'lyric line changes start the transition from sampled display time',
  /startFocusEchoTransition\s*\(\s*currentTime/.test(setLineSource),
  'setPlaybackLyricLine() must pass its effective display-time sample into startFocusEchoTransition().'
);
check(
  'every lyric sample synchronizes the paused transition',
  /syncFocusEchoTransition\s*\(\s*currentTime\s*\)/.test(setLineSource),
  'setPlaybackLyricLine() must resample the focus phase even when the text did not change.'
);
check(
  'the effective display time remains threaded through the playback update',
  /setPlaybackLyricLine\s*\([\s\S]*?displayTime,[\s\S]*?currentTime/.test(functionBody('updatePlaybackLyricAtTime')),
  'updatePlaybackLyricAtTime() must pass the calibrated displayTime to the focus transition path.'
);

check(
  'the old class/rAF/timer transition path is removed',
  !/triggerFocusEchoTransition|focusEchoAnimationFrame|focusEchoAnimationTimer|is-focus-echo-entering/.test(app),
  'Legacy class toggling, requestAnimationFrame, or cleanup-timer state is still present.'
);
check(
  'focus echo has no CSS animation or 160ms CSS delay',
  !/@keyframes\s+focusEcho/.test(css)
    && !/--focus-echo-main-delay/.test(css)
    && !/is-focus-echo-entering/.test(css),
  'Focus convergence must be owned by paused WAAPI, not CSS keyframes/delay selectors.'
);

const mainLayer = rule('.playback-lyric-scene.is-focus-echo-text .lyric-depth-0');
check(
  'the stable main phrase remains sharp, opaque, and frontmost',
  /filter\s*:\s*(?:none|blur\(0(?:px)?\))/.test(mainLayer)
    && /scale\(1\)/.test(mainLayer)
    && /opacity\s*:\s*1/.test(mainLayer),
  'Only background echoes may retain blur; the settled main phrase must stay clear.'
);

const focusVisibleLayer = rule(
  '.playback-lyric-scene.is-focus-echo-text .playback-lyric-layer.is-text-composer-layer-visible'
);
check(
  'selected echo layers keep their static spatial blur profile',
  /display\s*:\s*block\s*!important/.test(focusVisibleLayer)
    && /blur\(var\(--focus-echo-blur\)\)/.test(focusVisibleLayer)
    && /scaleX\(var\(--focus-echo-scale-x\)\)/.test(focusVisibleLayer)
    && /scale\(var\(--focus-echo-scale\)\)/.test(focusVisibleLayer),
  'Stable blur/scale must remain a CSS spatial profile while WAAPI animates only transform/opacity.'
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
  'focus echo retains a single-color main phrase with no rolling wipe',
  /content\s*:\s*none\s*!important/.test(focusAfter)
    && /display\s*:\s*none\s*!important/.test(focusAfter),
  'The generic rolling-highlight pseudo-element is still active.'
);

check(
  'the focus phrase retains its independent larger fit',
  /function\s+focusEchoFitMetrics\s*\(/.test(app)
    && /focusEchoFitMetrics\s*\(focusText/.test(app)
    && /viewportWidth\s*\*\s*0\.102/.test(app),
  'The semantic focus phrase must remain independently fitted from the full lyric line.'
);
check(
  'stable echoes stay centered behind the main phrase',
  /x:\s*-3,\s*y:\s*1\.5/.test(app)
    && /x:\s*2,\s*y:\s*2\.5/.test(app)
    && /x:\s*0,\s*y:\s*3\.5/.test(app),
  'The confirmed shared-center echo geometry changed.'
);
check(
  'echo opacity retains the subtle dark-teal hierarchy',
  /opacity:\s*0\.24,\s*blur:\s*4\.8/.test(app)
    && /opacity:\s*0\.15,\s*blur:\s*8\.5/.test(app)
    && /opacity:\s*0\.09,\s*blur:\s*13/.test(app),
  'The confirmed 0.24/0.15/0.09 echo hierarchy changed.'
);

for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
  if (!item.ok) console.log(`  ${item.detail}`);
}

const failures = checks.filter((item) => !item.ok);
if (failures.length) {
  console.error(`\nFocus echo media-clock parity failed: ${failures.length}/${checks.length}`);
  process.exit(1);
}

console.log(`\nFocus echo media-clock parity passed: ${checks.length}/${checks.length}`);
