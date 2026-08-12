import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = readFileSync(join(root, "web", "pet-assistant.js"), "utf8");

assert.match(source, /LIVE_BARGE_IN_DUCK_START_MS\s*=\s*45/,
  "a 45ms speech candidate should duck reply audio before the 180ms hard-interrupt threshold");
assert.match(source, /LIVE_BARGE_IN_DUCK_VOLUME\s*=\s*\.18/,
  "candidate speech should reduce reply audio to the bounded 18% level");
assert.match(source, /function\s+setReplyAudioDucked[\s\S]*?requestAnimationFrame/,
  "duck and restore must use a smooth animation instead of a hard volume jump");
assert.match(source, /speechCandidateMs\s*>=\s*LIVE_BARGE_IN_DUCK_START_MS[\s\S]{0,300}?setReplyAudioDucked/,
  "the VAD candidate boundary must drive ducking");
assert.match(source, /capture\.speechCandidateMs\s*<\s*LIVE_BARGE_IN_DUCK_START_MS[\s\S]{0,300}?setReplyAudioDucked\(false\)/,
  "a decayed false trigger must restore normal reply volume");
const interruptStart = source.indexOf('function interruptReplyForDeepSeekLive');
const interruptEnd = source.indexOf('function stopReplyAudioPlayback', interruptStart);
assert.ok(interruptStart >= 0 && interruptEnd > interruptStart,
  'the live barge-in function boundary is missing');
assert.match(source.slice(interruptStart, interruptEnd), /resetReplyAudioDuck/,
  "confirmed barge-in must reset volume for the next reply after cancelling the current one");
assert.match(source, /function\s+stopReplyAudioPlayback\([^)]*\)\s*\{[\s\S]{0,260}?resetReplyAudioDuck\(\)/,
  "every reply playback stop must restore full volume so a timeout cannot leave the next segment ducked");

console.log("pet live candidate ducking contract: ok");
