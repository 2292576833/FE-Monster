import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = readFileSync(path.join(root, 'web', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

const functionSource = (name, nextName) => {
  const start = app.indexOf(`function ${name}(`);
  const end = app.indexOf(`function ${nextName}(`, start + 1);
  return start >= 0 && end > start ? app.slice(start, end) : '';
};

const layoutStart = app.indexOf('const SONIC_GROUND_MOUND_GRID_SPACING =');
const layoutEnd = app.indexOf('const SONIC_BASS_COLUMN_ATTACK_SECONDS', layoutStart + 1);
const generatedLayoutSource = layoutStart >= 0 && layoutEnd > layoutStart
  ? app.slice(layoutStart, layoutEnd)
  : '';
const terrainFieldSource = functionSource('sonicTerrainMoundFieldAt', 'sonicGroundMoundMaskAt');
const moundMaskSource = functionSource('sonicGroundMoundMaskAt', 'sonicGroundMoundMaskSignature');
const rainHashSource = functionSource('sonicRainHash', 'sonicRainSimplexMod289');
const groundMoundLiftExpression = app.match(
  /float\s+groundMoundLift\s*=\s*([\s\S]*?);/
)?.[1] ?? '';
const radiusRangeTag = html.match(
  /<input\b[^>]*\bid="sonicGroundMoundRadiusRange"[^>]*>/
)?.[0] ?? '';

let centers = [];
let gridSpacing = Number.NaN;
let gridExtent = Number.NaN;
let gridSize = Number.NaN;
let neighborCells = Number.NaN;
let moundMaskAt = null;
let centersAreFrozen = false;
let behaviorError = '';

try {
  const sandbox = {
    clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value))
  };
  vm.runInNewContext(`
    ${rainHashSource}
    ${generatedLayoutSource}
    ${terrainFieldSource}
    ${moundMaskSource}
    globalThis.__moundContract = {
      gridSpacing: SONIC_GROUND_MOUND_GRID_SPACING,
      gridExtent: SONIC_GROUND_MOUND_GRID_EXTENT,
      gridSize: SONIC_GROUND_MOUND_GRID_SIZE,
      neighborCells: SONIC_GROUND_MOUND_NEIGHBOR_CELLS,
      centers: SONIC_GROUND_MOUND_CENTERS,
      centersAreFrozen: Object.isFrozen(SONIC_GROUND_MOUND_CENTERS)
        && SONIC_GROUND_MOUND_CENTERS.every(Object.isFrozen),
      moundMaskAt: sonicGroundMoundMaskAt
    };
  `, sandbox, { timeout: 1000 });
  gridSpacing = Number(sandbox.__moundContract.gridSpacing);
  gridExtent = Number(sandbox.__moundContract.gridExtent);
  gridSize = Number(sandbox.__moundContract.gridSize);
  neighborCells = Number(sandbox.__moundContract.neighborCells);
  centersAreFrozen = sandbox.__moundContract.centersAreFrozen;
  centers = Array.from(sandbox.__moundContract.centers, (center) => ({ ...center }));
  moundMaskAt = sandbox.__moundContract.moundMaskAt;
} catch (error) {
  behaviorError = String(error?.message || error);
}

const expectedDefaultRadius = 18;
const expectedMinimumRadius = 16;
const expectedMaximumRadius = 30;
const expectedGridSpacing = 18;
const expectedGridExtent = 90;
const expectedAxisCount = 11;
const expectedPeakCount = expectedAxisCount * expectedAxisCount;
const defaultSettings = Object.freeze({
  groundMoundHeight: 1.45,
  groundMoundRadius: expectedDefaultRadius
});
const minimumRadiusSettings = Object.freeze({
  ...defaultSettings,
  groundMoundRadius: expectedMinimumRadius
});

const roundMetric = (value, precision = 6) => (
  Number.isFinite(value) ? Number(value.toFixed(precision)) : null
);
const uniqueSorted = (values) => Array.from(new Set(values)).sort((a, b) => a - b);
const axisX = uniqueSorted(centers.map((center) => Number(center.x)));
const axisZ = uniqueSorted(centers.map((center) => Number(center.z)));
const uniqueCoordinates = new Set(centers.map((center) => `${center.x},${center.z}`));
const axisUsesFixedSpacing = (axis) => (
  axis.length === expectedAxisCount
  && axis.every((value, index) => (
    index === 0 || Math.abs(value - axis[index - 1] - expectedGridSpacing) <= 1e-9
  ))
);
const fullGridCoordinatesPresent = (
  uniqueCoordinates.size === expectedPeakCount
  && axisX.every((x) => axisZ.every((z) => uniqueCoordinates.has(`${x},${z}`)))
);

const effectiveRadiusAtMinimum = centers.map(
  (center) => expectedMinimumRadius * Number(center.radiusScale)
);
const minimumEffectiveRadius = effectiveRadiusAtMinimum.length > 0
  ? Math.min(...effectiveRadiusAtMinimum)
  : Number.NaN;
const maximumEffectiveRadius = centers.length > 0
  ? Math.max(...centers.map((center) => expectedMaximumRadius * Number(center.radiusScale)))
  : Number.NaN;
const firstExcludedCenterDistance = (neighborCells + 0.5) * expectedGridSpacing;
const exactCoverageRadius = Number.isFinite(gridSpacing)
  ? gridSpacing / Math.sqrt(2)
  : Number.NaN;

const overlapGraph = Array.from({ length: centers.length }, () => []);
let overlappingPairCount = 0;
let worstNearestGap = Number.NEGATIVE_INFINITY;
for (let leftIndex = 0; leftIndex < centers.length; leftIndex += 1) {
  let nearestGap = Number.POSITIVE_INFINITY;
  for (let rightIndex = 0; rightIndex < centers.length; rightIndex += 1) {
    if (leftIndex === rightIndex) continue;
    const dx = Number(centers[leftIndex].x) - Number(centers[rightIndex].x);
    const dz = Number(centers[leftIndex].z) - Number(centers[rightIndex].z);
    const distance = Math.hypot(dx, dz);
    const gap = distance
      - effectiveRadiusAtMinimum[leftIndex]
      - effectiveRadiusAtMinimum[rightIndex];
    nearestGap = Math.min(nearestGap, gap);
    if (rightIndex > leftIndex && gap <= 1e-9) {
      overlappingPairCount += 1;
      overlapGraph[leftIndex].push(rightIndex);
      overlapGraph[rightIndex].push(leftIndex);
    }
  }
  worstNearestGap = Math.max(worstNearestGap, nearestGap);
}

const connectedPeakIndexes = new Set();
const pendingPeakIndexes = centers.length > 0 ? [0] : [];
while (pendingPeakIndexes.length > 0) {
  const peakIndex = pendingPeakIndexes.pop();
  if (connectedPeakIndexes.has(peakIndex)) continue;
  connectedPeakIndexes.add(peakIndex);
  for (const neighborIndex of overlapGraph[peakIndex]) {
    if (!connectedPeakIndexes.has(neighborIndex)) pendingPeakIndexes.push(neighborIndex);
  }
}

const coverageSampleStep = 3;
let coverageSampleCount = 0;
let coveredSampleCount = 0;
let minimumRuntimeMask = Number.POSITIVE_INFINITY;
let maximumUncoveredDistance = Number.NEGATIVE_INFINITY;
if (centers.length > 0 && typeof moundMaskAt === 'function' && Number.isFinite(gridExtent)) {
  for (let z = -gridExtent; z <= gridExtent + 1e-9; z += coverageSampleStep) {
    for (let x = -gridExtent; x <= gridExtent + 1e-9; x += coverageSampleStep) {
      coverageSampleCount += 1;
      let closestSignedDistance = Number.POSITIVE_INFINITY;
      for (let centerIndex = 0; centerIndex < centers.length; centerIndex += 1) {
        const dx = x - Number(centers[centerIndex].x);
        const dz = z - Number(centers[centerIndex].z);
        closestSignedDistance = Math.min(
          closestSignedDistance,
          Math.hypot(dx, dz) - effectiveRadiusAtMinimum[centerIndex]
        );
      }
      if (closestSignedDistance <= 1e-9) coveredSampleCount += 1;
      maximumUncoveredDistance = Math.max(maximumUncoveredDistance, closestSignedDistance);
      minimumRuntimeMask = Math.min(
        minimumRuntimeMask,
        Number(moundMaskAt(x, z, minimumRadiusSettings))
      );
    }
  }
}

const radiusDefaultsTo18 = (
  /groundMoundRadius:\s*18\b/.test(app)
  && /groundMoundRadius:\s*bounded\(\s*source\?\.groundMoundRadius,\s*DEFAULT_SONIC_SETTINGS\.groundMoundRadius,\s*16,\s*30\s*\)/.test(app)
);
const radiusSliderUses16To30 = (
  radiusRangeTag !== ''
  && /\bmin="16"/.test(radiusRangeTag)
  && /\bmax="30"/.test(radiusRangeTag)
  && /\bvalue="18"/.test(radiusRangeTag)
);
const maskRuntimeUsesCompleteSpatialTable = (
  /SONIC_GROUND_MOUND_NEIGHBOR_CELLS/.test(moundMaskSource)
  && /SONIC_GROUND_MOUND_GRID_SIZE/.test(moundMaskSource)
  && /SONIC_GROUND_MOUND_CENTERS\[gridZ \* SONIC_GROUND_MOUND_GRID_SIZE \+ gridX\]/.test(moundMaskSource)
);
const countSettingAppearsInApp = /\bgroundMoundCount\b|\bsonicGroundMoundCount\b/.test(app);
const countControlAppearsInHtml = (
  /sonicGroundMoundCount(?:Range|Value)/.test(html)
  || /(?:小)?波峰数量/.test(html)
);

const checks = {
  behaviorHarnessLoadsGeneratedMoundRuntime:
    behaviorError === '' && centers.length > 0 && typeof moundMaskAt === 'function',
  generatedLayoutUses18SpacingAndPlusMinus90Extent:
    gridSpacing === expectedGridSpacing && gridExtent === expectedGridExtent,
  generatedLayoutContainsExactly121FrozenPeaks:
    centers.length === expectedPeakCount && centersAreFrozen && gridSize === expectedAxisCount,
  generatedLayoutIsComplete11By11Grid:
    axisUsesFixedSpacing(axisX)
    && axisUsesFixedSpacing(axisZ)
    && axisX[0] === -expectedGridExtent
    && axisX.at(-1) === expectedGridExtent
    && axisZ[0] === -expectedGridExtent
    && axisZ.at(-1) === expectedGridExtent
    && fullGridCoordinatesPresent,
  radiusDefaultsTo18AndNormalizesBetween16And30: radiusDefaultsTo18,
  radiusSliderExposes16To30With18Default: radiusSliderUses16To30,
  everyPeakTouchesOrOverlapsAnotherAtMinimumRadius:
    centers.length === expectedPeakCount && worstNearestGap <= 1e-9,
  overlappingPeaksFormOneConnectedTerrainNetwork:
    centers.length === expectedPeakCount
    && overlappingPairCount >= expectedPeakCount - 1
    && connectedPeakIndexes.size === centers.length,
  minimumRadiusMathematicallyCoversEntirePlusMinus90Terrain:
    fullGridCoordinatesPresent
    && minimumEffectiveRadius >= exactCoverageRadius - 1e-9,
  sampledMinimumRadiusCoversEntirePlusMinus90Terrain:
    coverageSampleCount > 0
    && coveredSampleCount === coverageSampleCount
    && maximumUncoveredDistance <= 1e-9,
  generatedRuntimeMaskRemainsNonZeroAcrossEntireTerrain:
    Number.isFinite(minimumRuntimeMask) && minimumRuntimeMask > 0.001,
  moundLiftHasNoTerrainEdgeFade:
    groundMoundLiftExpression.includes('aGroundMoundMask')
    && groundMoundLiftExpression.includes('uGroundMoundHeight')
    && groundMoundLiftExpression.includes('groundEntrance')
    && !groundMoundLiftExpression.includes('groundEdgeFade'),
  fixedPeakHeightsStayIrregular:
    centers.length > 0
    && Math.max(...centers.map((center) => Number(center.heightScale) || 0))
      - Math.min(...centers.map((center) => Number(center.heightScale) || 0)) >= 0.18,
  runtimeUsesCompleteBoundedSpatialPeakLookup:
    maskRuntimeUsesCompleteSpatialTable
    && /const SONIC_GROUND_MOUND_NEIGHBOR_CELLS = 2/.test(generatedLayoutSource)
    && maximumEffectiveRadius < firstExcludedCenterDistance
    && !/settings\s*\.\s*groundMoundCount/.test(moundMaskSource),
  noMoundCountSettingPersistenceOrDomBinding:
    !countSettingAppearsInApp
    && !/sonicGroundMoundCount(?:Range|Value)|sonicGroundMoundCount\s*:/.test(app),
  noMoundCountSliderOrOutput: !countControlAppearsInHtml,
  originalToggleStillControlsFixedPeaks:
    /groundMoundsEnabled:\s*true/.test(app)
    && /groundMoundsEnabled:\s*source\?\.groundMoundsEnabled !== false/.test(app)
    && /sonicGroundMoundsToggle:\s*\$\('#sonicGroundMoundsToggle'\)/.test(app)
    && /id="sonicGroundMoundsToggle"[^>]*checked/.test(html)
    && /settings\.groundMoundsEnabled\s*=\s*els\.sonicGroundMoundsToggle\.checked/.test(app)
};

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

process.stdout.write(`${JSON.stringify({
  pass: failures.length === 0,
  parameters: {
    fixedPeakCount: centers.length,
    grid: `${axisX.length}x${axisZ.length}`,
    gridSpacing,
    terrainExtent: [-gridExtent, gridExtent],
    moundRadius: {
      minimum: expectedMinimumRadius,
      default: expectedDefaultRadius,
      maximum: expectedMaximumRadius
    },
    coverageVerifiedAtRadius: expectedMinimumRadius,
    coverageSamples: coverageSampleCount
  },
  metrics: {
    minimumEffectiveRadiusAt16: roundMetric(minimumEffectiveRadius),
    maximumEffectiveRadiusAt30: roundMetric(maximumEffectiveRadius),
    firstExcludedCenterDistance: roundMetric(firstExcludedCenterDistance),
    exactRadiusRequiredForGridCoverage: roundMetric(exactCoverageRadius),
    worstNearestPeakGapAt16: roundMetric(worstNearestGap),
    overlappingPairCount,
    connectedPeakCount: connectedPeakIndexes.size,
    sampledCoverageRatio: coverageSampleCount > 0
      ? roundMetric(coveredSampleCount / coverageSampleCount)
      : 0,
    maximumSampledUncoveredDistance: roundMetric(maximumUncoveredDistance),
    minimumRuntimeMaskAt16: roundMetric(minimumRuntimeMask)
  },
  checks,
  failures,
  behaviorError
}, null, 2)}\n`);
process.exitCode = failures.length === 0 ? 0 : 1;
