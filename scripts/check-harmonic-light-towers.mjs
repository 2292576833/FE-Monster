import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../web/harmonic-state-runtime.js', import.meta.url), 'utf8');
assert.ok(/function buildLightTowers\(THREE\)/.test(source), 'the rear light-tower factory must exist');
const sandbox = { window: {}, console };
vm.runInNewContext(readFileSync(new URL('../web/vendor/three.r128.min.js', import.meta.url), 'utf8'), sandbox);
vm.runInNewContext(source.replace('    create,', '    buildLightTowers,\n    buildMistAtmosphere,\n    create,'), sandbox);
const { THREE } = sandbox;
assert.equal(THREE.REVISION, '128');
const towers = sandbox.window.FeHarmonicStateRuntime.buildLightTowers(THREE);
assert.ok(towers.group.isGroup);
for (const method of ['update', 'setPalette', 'dispose', 'diagnostics']) assert.equal(typeof towers[method], 'function');
assert.equal(towers.anchors.length, 2, 'only the two side pillars remain');
for (const anchor of towers.anchors) {
  assert.ok(Object.values(anchor).every(Number.isFinite), 'tower anchors are finite');
  assert.ok(Math.abs(anchor.x) >= 16 && anchor.z <= -8, 'towers occupy the far side wings, outside the enlarged ring sphere');
  assert.equal(anchor.baseY, -7);
  assert.ok(anchor.height >= 17 && anchor.height <= 25);
  assert.ok(anchor.radius >= 0.9 && anchor.radius <= 1.2, 'larger pillars remain proportionate to the central sculpture');
}
const originalRadii = [0.85, 0.9];
towers.anchors.forEach((anchor, index) => {
  assert.ok(Math.abs(anchor.radius / originalRadii[index] - 1.3) < 1e-8, 'each pillar is thirty percent thicker');
});
// Verify visible spacing, not just world-space distances: depth can make two
// widely separated pillars appear stuck together in the actual camera.
for (const width of [1440, 768, 320]) {
  const height = 900, aspect = width / height;
  const fov = aspect < 1.1 ? 2 * Math.atan(6.3 / (13 * aspect)) * 180 / Math.PI : 48;
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 180);
  camera.position.set(0, 0.45, 17.5);
  camera.lookAt(0, 0.2, 0);
  camera.updateMatrixWorld(true);
  const spans = towers.anchors.map(anchor => {
    const samples = [];
    // Project the cylindrical halo, not a larger square bounding box whose
    // nonexistent corners overstate the silhouette under perspective.
    for (let i = 0; i < 128; i++) {
      const angle = i * Math.PI / 64;
      samples.push(new THREE.Vector3(anchor.x + Math.cos(angle) * anchor.radius * 1.18, 0,
        anchor.z + Math.sin(angle) * anchor.radius * 1.18)
        .multiplyScalar(1 / Math.sqrt(2.35)).project(camera).x);
    }
    return { left: Math.min(...samples), right: Math.max(...samples) };
  });
  assert.ok(spans.every(span => span.left > -0.98 && span.right < 0.98), `${width}px: even the enlarged halos fit inside the frame`);
  assert.ok(spans[0].right < -0.45 && spans[1].left > 0.45, `${width}px: side columns leave the center open`);
}
const meshes = [], resources = new Set();
let vertices = 0, instances = 0;
towers.group.traverse(object => {
  if (!object.isMesh) return;
  meshes.push(object);
  resources.add(object.geometry);
  if (typeof object.dispose === 'function') resources.add(object);
  for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
  const positions = object.geometry.getAttribute('position');
  const normals = object.geometry.getAttribute('normal');
  vertices += positions.count;
  assert.ok(Array.from(positions.array).every(Number.isFinite));
  assert.ok(Array.from(normals.array).every(Number.isFinite));
  if (object.isInstancedMesh) {
    instances += object.count;
    assert.ok(Array.from(object.instanceMatrix.array).every(Number.isFinite), 'all tower and ring instances are finite');
  }
});
assert.ok(meshes.length >= 2 && meshes.length <= 10, 'new towers stay inside the draw-call budget');
assert.ok(vertices < 16000 && instances <= 80, 'the existing two scene passes remain bounded');
// Execute the shader's scalar pulse itself so a smooth phase cannot hide a hard
// discontinuity in the displayed light when its wrapped tail crosses a tower.
const pulseSource = meshes[0].material.fragmentShader.match(/float flowLight\(\) \{([\s\S]*?)\n      \}/);
assert.ok(pulseSource, 'the tower material exposes its scalar flow function');
const evaluatePulse = new Function('vHeight', 'values', `
  const { uFlowPosition, uFlowDirection, uFlowWidth, uFlowEnabled, uFlowAlternate } = values;
  const exp = Math.exp, pow = Math.pow, max = Math.max, min = Math.min, abs = Math.abs;
  const fract = value => value - Math.floor(value);
  const mix = (a, b, weight) => a + (b - a) * weight;
  const smoothstep = (a, b, value) => { const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t); };
  ${pulseSource[1].replace(/\bfloat\b/g, 'let')}
`);
for (const width of [0.05, 0.22, 0.6]) for (const direction of [-1, 1]) {
  const values = { uFlowPosition: 0.2, uFlowDirection: direction, uFlowWidth: width, uFlowEnabled: 1, uFlowAlternate: 0 };
  const beforeSeam = evaluatePulse(0.7 - 0.000001, values);
  const afterSeam = evaluatePulse(0.7 + 0.000001, values);
  assert.ok(Math.abs(beforeSeam - afterSeam) < 0.0001,
    `flow width ${width}, direction ${direction}: the wrapped tail must remain continuous (${beforeSeam} -> ${afterSeam})`);
  assert.ok(evaluatePulse(0.2, values) > 0.9, 'smoothing the seam keeps a clear moving head');
  assert.ok(evaluatePulse(0.2 - 0.08 * direction, values) > evaluatePulse(0.2 + 0.08 * direction, values),
    'the soft tail stays behind the chosen flow direction');
}
const placements = meshes.map(mesh => ({ matrix: mesh.matrix.toArray(), instances: mesh.instanceMatrix?.array.slice() }));
const base = { playing: true, reducedMotion: false, bass: 0.3, beat: 0.2, energy: 0.4 };
const settings = { towersEnabled: true, breathingEnabled: true, breathSpeed: 1, breathStrength: 1,
  flowEnabled: true, flowDirection: 'up', flowSpeed: 1, flowWidth: 0.22, colorSpeed: 1, audioReactive: true };
const frame = (delta, changes = {}, state = {}) => towers.update({ ...base, delta, time: 50, settings: { ...settings, ...changes }, ...state });
const before = towers.diagnostics();
frame(0.05);
const advanced = towers.diagnostics();
for (const key of ['breathPhase', 'flowPosition', 'colorPhase']) assert.notEqual(advanced[key], before[key], `${key} advances during playback`);
frame(0, { breathSpeed: 2.4, flowSpeed: 3, colorSpeed: 0.2 });
const retuned = towers.diagnostics();
for (const key of ['breathPhase', 'flowPosition', 'colorPhase']) assert.equal(retuned[key], advanced[key], `changing ${key} speed cannot reset the phase`);
frame(0, { flowDirection: 'down' });
assert.equal(towers.diagnostics().flowPosition, retuned.flowPosition, 'changing direction preserves the current light location');
frame(0.05, { flowDirection: 'down' });
assert.ok(towers.diagnostics().flowPosition < retuned.flowPosition, 'downward flow travels down');
assert.equal(towers.diagnostics().flowDirection, -1);
frame(0.05, { flowDirection: 'up' });
assert.equal(towers.diagnostics().flowDirection, 1);
let sawUp = false, sawDown = false;
for (let index = 0; index < 500; index += 1) {
  frame(0.1, { flowDirection: 'alternate', flowSpeed: 3 });
  const state = towers.diagnostics();
  assert.ok(state.flowPosition >= 0 && state.flowPosition <= 1, 'alternating flow remains inside the tower');
  sawUp ||= state.flowDirection === 1;
  sawDown ||= state.flowDirection === -1;
}
assert.ok(sawUp && sawDown, 'alternating flow reverses at both ends');
const held = towers.diagnostics();
frame(0.1, {}, { playing: false });
frame(0.1, {}, { reducedMotion: true });
for (const key of ['breathPhase', 'flowPosition', 'colorPhase', 'waterPhase']) assert.equal(towers.diagnostics()[key], held[key], `paused/reduced motion freezes ${key}`);
frame(0.1, { breathingEnabled: false, flowEnabled: false });
assert.equal(towers.diagnostics().breathPhase, held.breathPhase);
assert.equal(towers.diagnostics().flowPosition, held.flowPosition);
frame(0.1, { towersEnabled: false });
assert.equal(towers.group.visible, false);
frame(0, { towersEnabled: true });
assert.equal(towers.group.visible, true);
towers.setPalette([{ r: 25, g: 255, b: 215 }, { r: 140, g: 60, b: 245 }, { r: 255, g: 90, b: 165 }]);
const colorSnapshot = meshes.flatMap(mesh => Object.values(mesh.material.uniforms || {})
  .filter(uniform => uniform.value?.isColor).map(uniform => Array.from(uniform.value.toArray())));
towers.setPalette([{ r: 250, g: 75, b: 25 }, { r: 235, g: 240, b: 100 }, { r: 60, g: 190, b: 255 }]);
const newColors = meshes.flatMap(mesh => Object.values(mesh.material.uniforms || {})
  .filter(uniform => uniform.value?.isColor).map(uniform => Array.from(uniform.value.toArray())));
assert.notDeepEqual(newColors, colorSnapshot, 'the caller-selected palette reaches the tower shaders');
for (const value of [NaN, Infinity, -Infinity, -1, 1e12]) {
  frame(value, { breathSpeed: value, breathStrength: value, flowSpeed: value, flowWidth: value, colorSpeed: value },
    { time: value, bass: value, energy: value, beat: value });
  for (const state of Object.values(towers.diagnostics())) if (typeof state === 'number') assert.ok(Number.isFinite(state));
  for (const mesh of meshes) for (const uniform of Object.values(mesh.material.uniforms || {})) {
    if (typeof uniform.value === 'number') assert.ok(Number.isFinite(uniform.value), 'invalid control inputs never reach the GPU');
  }
}
meshes.forEach((mesh, index) => {
  assert.deepEqual(mesh.matrix.toArray(), placements[index].matrix, 'the tower bodies remain stationary');
  if (mesh.instanceMatrix) assert.deepEqual(mesh.instanceMatrix.array, placements[index].instances, 'tower instance placement does not drift');
});
const counts = new Map([...resources].map(resource => [resource, 0]));
for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
const parent = new THREE.Group(); parent.add(towers.group);
towers.dispose(); towers.dispose();
for (const count of counts.values()) assert.equal(count, 1, 'each owned resource is disposed once');
assert.equal(towers.group.children.length, 0);
assert.equal(towers.group.parent, null);
console.log(`PASS harmonic light towers: THREE r${THREE.REVISION}, ${towers.anchors.length} towers, ${meshes.length} draws, ${instances} instances, ${vertices} vertices; continuous phases, directions, pause, palette, and disposal`);
