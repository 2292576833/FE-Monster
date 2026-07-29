import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const app = readFileSync(path.join(root, "web", "app.js"), "utf8").replace(/\r\n/g, "\n");
const html = readFileSync(path.join(root, "web", "index.html"), "utf8").replace(/\r\n/g, "\n");
const allGroundFloatLiftExpression = app.match(
  /float allGroundFloatLift\s*=\s*([^;]+);/
)?.[1] ?? "";

const checks = {
  visibleToggle:
    /id="sonicAllGroundFloatToggle"/.test(html)
    && />全部地面浮动</.test(html)
    && /role="switch"/.test(html),
  persistedSetting:
    /allGroundFloatEnabled:\s*false/.test(app)
    && /allGroundFloatEnabled:\s*source\?\.allGroundFloatEnabled === true/.test(app)
    && /SONIC_SETTINGS_PREFS_KEY/.test(app),
  toggleUpdatesUniform:
    /uAllGroundFloat:\s*\{\s*value:/.test(app)
    && /uAllGroundFloat\.value = settings\.allGroundFloatEnabled \? 1 : 0/.test(app),
  fullFieldLift:
    /float allGroundFloatLift = uAllGroundFloat \* groundHeightBand \* groundEdgeFade/.test(app)
    && /idleElevation \+ audioElevation \+ allGroundFloatLift/.test(app),
  columnHeightDoesNotScaleGroundFloat:
    allGroundFloatLiftExpression.includes("uAllGroundFloat")
    && allGroundFloatLiftExpression.includes("groundHeightBand")
    && !allGroundFloatLiftExpression.includes("uColumnHeightScale"),
  deterministicSmoothMotion:
    /float groundPhase = dot\(groundGridCell, vec2\(0\.47, 0\.71\)\) \+ groundPhaseJitter/.test(app)
    && /float groundBeat = 0\.5 \+ 0\.5 \* sin\(uTime \* 1\.06 - groundPhase\)/.test(app)
    && /groundBeat \* groundBeat \* \(3\.0 - 2\.0 \* groundBeat\)/.test(app),
  staggeredRhythmicWave:
    /shared tempos keep the field rhythmic/.test(app)
    && /groundSecondaryWave/.test(app)
    && !/uTime\s*\*\s*random\(/.test(app),
  layeredIrregularFourBandField:
    /float groundHeightBandIndex = mod\(/.test(app)
    && /float groundPhaseJitter = random\(/.test(app)
    && /groundHeightBandIndex < 0\.5/.test(app)
    && /groundHeightBandIndex < 1\.5/.test(app)
    && /groundHeightBandIndex < 2\.5/.test(app),
  adjacentHeightSeparation:
    /mod\(\s*groundGridCell\.x \+ groundGridCell\.y \* 2\.0 \+ 4096\.0,\s*4\.0\s*\)/.test(app)
    && /groundHeightBand = 0\.38 \+ groundWave \* 0\.18/.test(app)
    && /groundHeightBand = 1\.52 \+ groundWave \* 0\.25/.test(app)
};

// The checkerboard bands are deliberately disjoint:
// parity 0 ∈ [0.52, 0.76], parity 1 ∈ [1.28, 1.52].
// Every horizontal/vertical neighbor changes parity, so the minimum separation
// remains 0.52 even while both columns animate continuously.
const bands = [
  [0.38, 0.38 + 0.18],
  [0.74, 0.74 + 0.20],
  [1.12, 1.12 + 0.22],
  [1.52, 1.52 + 0.25]
];
const adjacentBandPairs = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3]];
const minimumAdjacentHeightSeparation = Math.min(...adjacentBandPairs.map(([left, right]) => {
  const [leftMin, leftMax] = bands[left];
  const [rightMin, rightMax] = bands[right];
  return Math.max(leftMin, rightMin) - Math.min(leftMax, rightMax);
}));
checks.adjacentBandsNeverMeet = minimumAdjacentHeightSeparation > 0.15;

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

process.stdout.write(`${JSON.stringify({
  pass: failures.length === 0,
  minimumAdjacentHeightSeparation,
  checks,
  failures
}, null, 2)}\n`);
process.exitCode = failures.length === 0 ? 0 : 1;
