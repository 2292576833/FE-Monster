import { readFileSync } from 'node:fs';

global.window = global;
await import('../web/storm-ocean-runtime.js');

const runtime = global.FeStormOceanRuntime;
const config = {
  idleWaveHeight: 0.72,
  bassWaveHeight: 2.2,
  randomSurgeBassGain: 0.76,
  thunderstormIntensity: 0
};
const points = [];
for (let z = -360; z <= 20; z += 20) {
  for (let x = -140; x <= 140; x += 10) points.push([x, z]);
}

function scaleEnergy(distance) {
  const samples = [];
  points.forEach(([x, z]) => {
    const height = runtime.sampleWaveHeight(x, z, 12.5, 0, config, 0);
    samples.push(Math.abs(runtime.sampleWaveHeight(x + distance, z, 12.5, 0, config, 0) - height));
    samples.push(Math.abs(runtime.sampleWaveHeight(x, z + distance, 12.5, 0, config, 0) - height));
  });
  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

const fineEnergy = scaleEnergy(2);
const midEnergy = scaleEnergy(8);
const coarseEnergy = scaleEnergy(32);
const idleRms = Math.sqrt(points.reduce((sum, [x, z]) => {
  const height = runtime.sampleWaveHeight(x, z, 12.5, 0, config, 0);
  return sum + height * height;
}, 0) / points.length);
const fineToCoarseRatio = fineEnergy / coarseEnergy;
const midToCoarseRatio = midEnergy / coarseEnergy;
const minimumFineToCoarseRatio = 0.2;
const minimumMidToCoarseRatio = 0.66;
const source = readFileSync(new URL('../web/storm-ocean-runtime.js', import.meta.url), 'utf8');
const cpuBlock = source.slice(
  source.indexOf('function sampleWaveHeight'),
  source.indexOf('function sampleWaveFrame')
);
const glslBlock = source.slice(
  source.indexOf('float stormHeight(vec2 point)'),
  source.indexOf('float bassWeight0')
);
const expectedFrequencies = ['0.102', '0.165', '0.244', '0.144', '0.220', '0.332', '0.341', '0.442', '0.575'];
const cpuGlslFrequencyParity = expectedFrequencies.every((frequency) =>
  cpuBlock.includes(`, ${frequency},`) && glslBlock.includes(`, ${frequency},`)
);
const passed = fineToCoarseRatio >= minimumFineToCoarseRatio
  && midToCoarseRatio >= minimumMidToCoarseRatio
  && idleRms >= 0.327
  && idleRms <= 0.347
  && cpuGlslFrequencyParity;

console.log(JSON.stringify({
  fineEnergy,
  midEnergy,
  coarseEnergy,
  idleRms,
  minimumIdleRms: 0.327,
  maximumIdleRms: 0.347,
  fineToCoarseRatio,
  minimumFineToCoarseRatio,
  midToCoarseRatio,
  minimumMidToCoarseRatio,
  cpuGlslFrequencyParity,
  passed
}, null, 2));

if (!passed) process.exitCode = 1;
