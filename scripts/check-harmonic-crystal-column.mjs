import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../web/harmonic-state-runtime.js', import.meta.url), 'utf8');
assert.ok(/function buildCrystalColumn\(THREE, palette\)/.test(source),
  'the smooth neon tower must be replaced by the crystal-column factory');

const canvases = [];
const document = {
  createElement(tag) {
    assert.equal(tag, 'canvas', 'column assets are generated locally');
    const context = {
      fillRect() {}, clearRect() {}, beginPath() {}, closePath() {}, fill() {},
      moveTo() {}, lineTo() {}, save() {}, restore() {}, translate() {}, rotate() {},
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() { return { addColorStop() {} }; }
    };
    const canvas = { width: 0, height: 0, getContext(type) { assert.equal(type, '2d'); return context; } };
    canvases.push(canvas);
    return canvas;
  }
};
const sandbox = { window: {}, document, console };
vm.runInNewContext(readFileSync(new URL('../web/vendor/three.r128.min.js', import.meta.url), 'utf8'), sandbox);
const { THREE } = sandbox;
assert.equal(THREE.REVISION, '128', 'geometry checks use the shipped browser renderer');
vm.runInNewContext(source.replace('    create,', '    buildCrystalColumn,\n    create,'), sandbox);
const column = sandbox.window.FeHarmonicStateRuntime.buildCrystalColumn(THREE, [
  { r: 70, g: 235, b: 245 }, { r: 156, g: 100, b: 255 }, { r: 255, g: 100, b: 183 }
]);
assert.ok(column.group.isGroup);
assert.ok(Number.isInteger(column.segmentCount) && column.segmentCount >= 20 && column.segmentCount <= 36);
for (const name of ['update', 'setPalette', 'dispose']) assert.equal(typeof column[name], 'function');

const meshes = [], lights = [], resources = new Set();
column.group.traverse(object => {
  if (object.isLight) lights.push(object);
  if (!object.isMesh) return;
  meshes.push(object);
  resources.add(object.geometry);
  for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
    resources.add(material);
    if (material.envMap) resources.add(material.envMap);
  }
});
assert.ok(meshes.length >= column.segmentCount && meshes.length < 65, 'column fits a bounded draw-call budget');
assert.ok(lights.length >= 2 && lights.length <= 5, 'reflective surfaces have their own bounded lighting');
assert.ok(canvases.length === 6 && canvases.every(canvas => canvas.width <= 256 && canvas.height <= 256),
  'six small local canvas faces supply an environment without network requests');
let vertexCount = 0;
for (const mesh of meshes) {
  assert.ok(!/Cylinder|Torus/.test(mesh.geometry.type), 'the silhouette is assembled from broken crystals');
  const position = mesh.geometry.getAttribute('position');
  const normal = mesh.geometry.getAttribute('normal');
  vertexCount += position.count;
  assert.ok(Array.from(position.array).every(Number.isFinite), 'all crystal positions must be finite');
  assert.ok(Array.from(normal.array).every(Number.isFinite), 'all crystal normals must be finite');
  for (let i = 0; i < normal.count; i += 1) {
    assert.ok(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)) > 0.95, 'faces have usable reflection normals');
  }
}
assert.ok(vertexCount < 60000, 'crystal geometry is bounded for the two-pass card renderer');
const bounds = new THREE.Box3().setFromObject(column.group);
const size = bounds.getSize(new THREE.Vector3());
assert.ok(size.y >= 26 && size.y <= 29, `column spans the viewport vertically (${size.y})`);
assert.ok(size.x >= 3.6 && size.x <= 5.5, `lateral fragments give the intended narrow silhouette (${size.x})`);

column.group.position.set(2, 3, -2);
const positions = meshes.map(mesh => mesh.position.clone());
for (const time of [0, 1, 30, 3600, 1e10, NaN, Infinity]) {
  column.update({ time, bass: 0.7, beat: 1, energy: 0.9, playing: true, reducedMotion: false });
  column.group.updateMatrixWorld(true);
  assert.deepEqual(Array.from(column.group.position.toArray()), [2, 3, -2], 'external placement stays under caller control');
  for (let i = 0; i < meshes.length; i += 1) {
    assert.ok(meshes[i].matrixWorld.elements.every(Number.isFinite), 'long-running animation never creates NaN transforms');
    assert.equal(meshes[i].position.y, positions[i].y, 'crystal segments never drift vertically');
  }
}
column.update({ time: 10, bass: 1, beat: 1, energy: 1, playing: true, reducedMotion: true });
column.group.updateMatrixWorld(true);
const still = meshes.map(mesh => mesh.matrixWorld.elements.slice());
column.update({ time: 99999, bass: 0, beat: 0, energy: 0, playing: false, reducedMotion: true });
column.group.updateMatrixWorld(true);
meshes.forEach((mesh, index) => assert.deepEqual(mesh.matrixWorld.elements, still[index], 'reduced motion keeps crystal geometry still'));
const textures = [...resources].filter(resource => resource.isTexture);
const oldVersions = textures.map(texture => texture.version);
column.setPalette([{ r: 245, g: 70, b: 35 }, { r: 255, g: 210, b: 130 }, { r: 45, g: 235, b: 180 }]);
textures.forEach((texture, i) => assert.ok(texture.version > oldVersions[i], 'palette repaint invalidates the existing reflection texture'));
column.setPalette([{ r: Infinity, g: NaN, b: -20 }]);
column.update({ time: NaN, bass: Infinity, beat: NaN, energy: -1, playing: true });
assert.ok(lights.every(light => Number.isFinite(light.intensity)), 'bad input never contaminates light intensity');

const disposalCounts = new Map([...resources].map(resource => [resource, 0]));
for (const resource of resources) resource.addEventListener('dispose', () => disposalCounts.set(resource, disposalCounts.get(resource) + 1));
const parent = new THREE.Group();
parent.add(column.group);
column.dispose();
column.dispose();
for (const count of disposalCounts.values()) assert.equal(count, 1, 'shared resources are disposed exactly once');
assert.equal(column.group.parent, null);
assert.equal(column.group.children.length, 0);
console.log(`PASS harmonic crystal column: THREE r${THREE.REVISION}, ${column.segmentCount} layers, ${meshes.length} draws, ${vertexCount} vertices; finite motion, palette updates, and complete disposal`);
