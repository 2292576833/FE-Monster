import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('web/index.html', 'utf8');
const css = readFileSync('web/fe-identity-card.css', 'utf8');
const client = readFileSync('web/fe-identity-card.js', 'utf8');

assert.match(html, /href="fe-identity-card\.css\?v=[^"]+"/,
  'identity card stylesheet must be versioned in the production document');
assert.match(html, /id="communityIdentityCardButton"[^>]*aria-label="打开身份卡列表"[^>]*>\s*<span[^>]*>FE<\/span>\s*<\/button>/,
  'community avatar header must expose only the accessible identity-card icon');
assert.match(html, /id="communityIdentityCardMenu"[^>]*hidden[\s\S]*?id="feIdentityCardPreview"[\s\S]*?id="feIdentityCardCollection"/,
  'community identity-card icon must open an owned-card picker with a separate showcase action');
assert.match(html, /id="feIdentityCardDialog"[^>]*role="dialog"[^>]*aria-modal="true"/,
  'identity card viewer must be an accessible modal dialog');
assert.match(html, /id="feIdentityCardFront"[\s\S]*id="feIdentityCardFeId"[\s\S]*id="feIdentityCardNickname"/,
  'front face must expose engraved FE ID and nickname surfaces');
assert.match(html, /id="feIdentityCardNickname"[^>]*role="button"[^>]*tabindex="0"/,
  'the engraved nickname itself must be a keyboard-accessible edit target');
assert.match(html, /id="feIdentityCardBack"[\s\S]*FE MOSTER/,
  'back face must carry the fixed FE MOSTER engraving');
assert.match(html, /id="feIdentityCardNicknameForm"[\s\S]*maxlength="32"/,
  'nickname editing needs an explicit bounded input');
assert.match(html, /src="fe-identity-card\.js\?v=[^"]+"/,
  'identity card runtime must be versioned in the production document');

assert.match(css, /\.community-identity-card-trigger\s*\{[\s\S]*?width:\s*28px[\s\S]*?border:\s*0[\s\S]*?background:\s*transparent[\s\S]*?box-shadow:\s*none/,
  'community identity card entry must be an icon-only control without a button panel');
assert.match(css, /\.fe-identity-card__backdrop\s*\{[\s\S]*?background:\s*transparent[\s\S]*?backdrop-filter:\s*none/,
  'identity card must stay directly over the program scene without a dark modal surface');
assert.match(css, /\.fe-identity-card__viewer\s*\{[\s\S]*?border:\s*0[\s\S]*?padding:\s*0[\s\S]*?background:\s*transparent[\s\S]*?box-shadow:\s*none/,
  'identity card viewer must not render a surrounding window panel');
assert.match(css, /\.fe-identity-card__card\s*\{[\s\S]*?aspect-ratio:\s*1\.586/,
  'identity card must keep a real card proportion');
assert.match(css, /transform-style:\s*preserve-3d/,
  'identity card needs a true two-sided 3D surface');
assert.match(css, /backface-visibility:\s*hidden/,
  'front and back must not bleed through one another');
assert.match(css, /\.fe-identity-card__front::after[\s\S]*?animation:\s*fe-identity-card-sweep/,
  'opening must include a golden light sweep');
assert.match(css, /is-entering\[data-entrance="corner-fall-float"\][\s\S]*?animation:\s*none;[\s\S]*?transform-origin:\s*0\s+100%/,
  'the default entrance must reserve the lower-left corner as its fixed support point');
assert.doesNotMatch(css, /@keyframes\s+fe-identity-card-(?:corner-fall-float|ground-contact)/,
  'the obsolete straight-drop and positional-rebound keyframes must not remain as a fallback');
assert.match(client, /function\s+cornerFallMotion\(durationMs\)[\s\S]*?gravityTorque\s*\*\s*Math\.cos\(angle\)[\s\S]*?--fe-card-angular-speed/,
  'the corner fall must be generated from deterministic gravity torque, not hand-authored easing');
assert.match(client, /function\s+runCornerFall[\s\S]*?elements\.shell\.animate\(motion\.frames[\s\S]*?fe-identity-card-corner-balance/,
  'the physical trajectory must drive the compositor through WAAPI');
assert.match(client, /\[0,\s*1\.65\][\s\S]*?\[1,\s*0(?:,\s*0)?\]/,
  'face contact must use a bounded, decaying angular ring without a positional bounce');
assert.match(client, /function\s+cornerFallShadowFrames\(motion\)[\s\S]*?contactProgress\s*=\s*Math\.cos\(angle[\s\S]*?centreHeight\s*=\s*Math\.sin\(angle[\s\S]*?projectedArea/,
  'the floor shadow must be derived continuously from each rigid-body height, tilt and projected-area pose');
assert.match(client, /state\.shadowAnimation\s*=\s*elements\.stage\.querySelector[\s\S]*?cornerFallShadowFrames\(motion\)/,
  'the physical entrance must animate the generated pose-aligned shadow timeline');
assert.match(css, /\.fe-identity-card__stage\.is-landed \.fe-identity-card__shell\s*\{[\s\S]*?rotateX\(78deg\)/,
  'the landed card needs a stable flat waiting pose');
assert.match(css, /@keyframes\s+fe-identity-card-lift-from-ground/,
  'a separate user-triggered lift must raise the landed card');
assert.match(css, /\.fe-identity-card__stage\.is-lifting \.fe-identity-card__shell\s*\{[\s\S]*?transform-origin:\s*0\s+100%/,
  'the click-triggered lift must retain the landed corner pivot on its first frame');
assert.match(css, /@keyframes\s+fe-identity-card-showcase/,
  'opened card must enter a slow showcase rotation');
assert.match(css, /\.fe-identity-card__stage\.is-showcasing \.fe-identity-card__shell\s*\{[\s\S]*?animation:\s*fe-identity-card-showcase[^;]*linear[^;]*infinite/,
  'showcase motion must be a continuous constant-speed rotation');
assert.doesNotMatch(css, /\.fe-identity-card__stage\.is-showcasing[^\{]*:is\([^\)]*(?:hover|focus-within)[^\)]*\)[\s\S]*?animation-play-state:\s*paused/,
  'click focus or a stationary pointer must not pause the requested continuous rotation');
assert.match(css, /@keyframes\s+fe-identity-card-showcase\s*\{[\s\S]*?rotateY\(-360deg\)/,
  'showcase motion must spin from right to left around the Y axis');
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/,
  'the physical animation must provide a reduced-motion fallback');
assert.match(css, /text-shadow:[^;}]*rgba\(255,\s*255,\s*255[^;}]*rgba\(75,\s*42,\s*0/,
  'identity text needs an inset engraved treatment');
assert.match(css, /\.fe-identity-card__nickname-form input\s*\{[\s\S]*?background:\s*transparent/,
  'the nickname editor must stay engraved on the card instead of drawing a black field');
assert.match(css, /\.fe-identity-card__nickname\s*\{[\s\S]*?background:\s*transparent\s*!important[\s\S]*?background-image:\s*none\s*!important[\s\S]*?box-shadow:\s*none\s*!important/,
  'the displayed engraved nickname must override the global role-button black panel');

assert.match(client, /fe-monster-community-profile/,
  'identity UI must consume the shared community profile event');
assert.match(client, /\/api\/community\/identity-cards\?/,
  'owned cards must be read from the community server');
assert.match(client, /\/api\/community\/identity-cards\/equip/,
  'owned cards must be replaceable through the equip endpoint');
assert.match(client, /function\s+setMenuOpen[\s\S]*?elements\.trigger\.setAttribute\('aria-expanded'/,
  'community identity-card picker must expose deterministic open state');
assert.match(client, /elements\.nickname\?\.addEventListener\('click'[\s\S]*?toggleNicknameEditor\(true\)/,
  'clicking the engraved nickname must open the editor without flipping the card');
assert.match(client, /function\s+settleCardOnGround[\s\S]*?classList\.add\('is-landed'\)/,
  'the runtime must stop on the ground instead of automatically starting the showcase');
assert.match(client, /'corner-fall-float':\s*Object\.freeze\(\{[^}]*durationMs:\s*3600/,
  'the built-in spin, friction loss and gravity fall must remain slow enough to read');
assert.match(client, /startAngleDeg\s*=\s*90[\s\S]*?balanceRollDeg\s*=\s*-Math\.atan\(1\.586\)[\s\S]*?spinDecay[\s\S]*?spinDegrees\s*=\s*4\s*\*\s*360/,
  'the default entrance must begin near 90 degrees and visibly decelerate through four turns');
assert.match(client, /rotateX\(\$\{floorPitchDeg\}deg\) rotateZ\(\$\{spin\.angle\}deg\) rotateX\(\$\{-angleDeg\}deg\) rotateZ\(\$\{balanceRollDeg\}deg\)/,
  'the vertical spin must rotate around the virtual-floor normal while one diagonal corner supports the card');
assert.match(client, /inferredPreset\s*===\s*'corner-fall-float'[\s\S]*?kind\s*===\s*'float-front'[\s\S]*?kind\s*===\s*'gold-sweep'[\s\S]*?break/,
  'server showcase stages must not extend the pre-click ground drop');
assert.match(client, /emitEntrancePhase\('corner-contact',[\s\S]*?playCornerContactCue[\s\S]*?emitEntrancePhase\('face-impact',[\s\S]*?playImpactCue/,
  'support-corner contact and full-face impact must have separate motion-aligned metal cues');
assert.match(client, /function\s+liftCardFromGround[\s\S]*?classList\.add\('is-lifting'\)[\s\S]*?classList\.add\('is-showcasing'\)/,
  'only a user click may lift the card and begin its showcase rotation');
assert.match(client, /nicknameEditable/,
  'server-issued card nickname policy must reach the client runtime');
assert.match(client, /function\s+canEditNickname[\s\S]*?state\.currentCard/,
  'nickname edits must be gated by the currently equipped card');
assert.match(client, /payload\.owned/,
  'client must consume the server-owned identity card collection');
assert.match(client, /payload\.equippedId/,
  'client must follow the equipped identity card returned by the server');
for (const field of [
  'primaryColor', 'secondaryColor', 'accentColor', 'frontColor', 'backColor', 'borderColor',
  'metalness', 'roughness', 'bevel', 'sweepIntensity', 'engravingDepth'
]) {
  assert.ok(client.includes(`source.${field}`), `server-defined ${field} must reach the card material`);
}
for (const variable of [
  '--card-front', '--card-back-base', '--card-border', '--card-metal-alpha',
  '--card-roughness-alpha', '--card-sweep-alpha', '--card-radius', '--card-engraving-offset',
  '--card-primary', '--card-secondary', '--card-accent', '--card-front-color', '--card-back-color',
  '--card-border-color', '--card-metalness', '--card-roughness', '--card-bevel',
  '--card-sweep-intensity', '--card-engraving-depth'
]) {
  assert.ok(client.includes(variable), `server customization must set ${variable}`);
}
assert.doesNotMatch(css, /\[data-material="[^"]+"\][^{]*\{[^}]*!important/,
  'material presets must never use !important to override server-defined colors');
assert.match(client, /\/api\/community\/profile\?/,
  'nickname edits must be saved through the community profile endpoint');
assert.match(client, /AudioContext|webkitAudioContext/,
  'metal motion cues must be generated without downloading audio assets');
assert.match(client, /createOscillator\(\)/,
  'metal cues need a crisp synthesized strike');
assert.match(client, /createStereoPanner/,
  'identity-card sound must spread its metal overtones subtly in space');
assert.match(client, /createDynamicsCompressor[\s\S]*?filter\.type\s*=\s*'bandpass'/,
  'identity-card sound must use controlled metallic partials instead of a harsh buzzer');
assert.match(client, /740,\s*1768,\s*2819,\s*4277/,
  'the impact cue must keep its elegant inharmonic metal overtone stack');
for (const cue of ['noble-metal', 'royal-chime', 'platinum-ring']) {
  assert.match(client, new RegExp(`'${cue}':\\s*Object\\.freeze\\(\\{[\\s\\S]*?spinFrequencies:[\\s\\S]*?impactFrequencies:[\\s\\S]*?impactAttack:`),
    `${cue} needs its own synthesized frequency and envelope profile`);
}
assert.match(client, /function\s+soundCueProfile[\s\S]*?SOUND_CUE_PROFILES\[cue\]/,
  'server-selected metal cues must resolve through the bounded local synthesis catalog');
assert.match(client, /function\s+playSpinCue[\s\S]*?profile\.spinFrequencies[\s\S]*?profile\.spinAttack/,
  'spin synthesis must consume each cue profile instead of changing volume only');
assert.match(client, /function\s+playImpactCue[\s\S]*?profile\.impactFrequencies[\s\S]*?profile\.noiseFrequency/,
  'impact synthesis must consume each cue profile without external audio assets');
assert.match(client, /prefers-reduced-motion:\s*reduce/,
  'runtime must honor the user motion preference');
assert.match(client, /fe-monster-identity-card-muted-v1/,
  'metal sounds must have a persistent mute control');
assert.match(client, /Object\.freeze\(\{[\s\S]*?open[\s\S]*?close[\s\S]*?refresh[\s\S]*?equip/,
  'the identity module needs a small public integration surface');

console.log('Community identity card UI contract PASS');
