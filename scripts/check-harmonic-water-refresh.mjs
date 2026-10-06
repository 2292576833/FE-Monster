import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const scope = { window: {}, console };
for (const file of ['vendor/three.r128.min.js', 'harmonic-orbital-atmosphere.js']) {
  vm.runInNewContext(readFileSync(new URL('../web/' + file, import.meta.url), 'utf8'), scope);
}
const THREE = scope.THREE;

// Real r128 scene/projection/target objects; only the GPU boundary is faked.
function fixture() {
  const effect = scope.window.FeHarmonicOrbitalAtmosphere.create(THREE);
  const scene = new THREE.Scene();
  scene.add(effect.group);
  const camera = new THREE.PerspectiveCamera(48, 1440 / 900, .1, 100);
  camera.position.set(0, 0, 17.5);
  camera.lookAt(0, .2, 0);
  let target = null;
  const renderer = {
    ratio: 1, width: 1440, height: 900, calls: 0,
    capabilities: { maxTextureSize: 16384 },
    xr: { enabled: false }, shadowMap: { autoUpdate: true },
    getSize: v => v.set(renderer.width, renderer.height),
    getDrawingBufferSize: v => v.set(renderer.width * renderer.ratio, renderer.height * renderer.ratio),
    getPixelRatio: () => renderer.ratio,
    getRenderTarget: () => target,
    setRenderTarget: value => { target = value; },
    getViewport: v => v.set(0, 0, renderer.width, renderer.height),
    getScissor: v => v.set(0, 0, renderer.width, renderer.height),
    getScissorTest: () => false,
    getClearColor: v => v.set('#000000'), getClearAlpha: () => 1,
    setViewport() {}, setScissor() {}, setScissorTest() {}, setClearColor() {}, clear() {},
    render() { renderer.calls++; }
  };
  const capture = (now, revision) => effect.renderReflection(renderer, scene, camera, now, revision);
  const water = () => effect.diagnostics().water;
  return { effect, camera, renderer, capture, water };
}

for (const hz of [60, 120, 144, 240]) {
  test(`dynamic reflection captures every rendered frame at ${hz} Hz`, () => {
    const f = fixture();
    try {
      f.capture(0, 0);
      const before = f.water().passes;
      for (let i = 1; i <= hz; i++) f.capture(i * 1000 / hz, i);
      assert.equal(f.water().passes - before, hz);
    } finally { f.effect.dispose(); }
  });
}

test('paused camera dragging is immediate, unchanged frames still reuse the texture', () => {
  const f = fixture();
  try {
    f.capture(0, 'paused');
    const before = f.water().passes;
    for (let i = 1; i <= 80; i++) {
      f.camera.position.x += .01;
      f.camera.lookAt(0, .2, 0);
      assert.equal(f.capture(i * 1000 / 240, 'paused'), true);
    }
    assert.equal(f.water().passes - before, 80);
    assert.equal(f.capture(400, 'paused'), false);
    f.effect.update({ settings: { waterEnabled: false } });
    assert.equal(f.capture(401, 'changed'), false);
  } finally { f.effect.dispose(); }
});

test('native-density reflection follows device pixels, including a paused DPR-only change', () => {
  const f = fixture();
  try {
    f.capture(0, 'paused');
    const normal = f.water();
    assert.ok(normal.width >= 1400, `native viewport sampling, got ${normal.width}x${normal.height}`);
    f.renderer.ratio = 2;
    assert.equal(f.capture(1, 'paused'), true, 'DPR changes invalidate a static reflection');
    const retina = f.water();
    assert.ok(retina.width >= normal.width * 1.9);
    assert.ok(retina.height >= normal.height * 1.9);
    const size = [retina.width, retina.height];
    for (let i = 1; i < 40; i++) {
      f.camera.position.x = i * .001;
      f.capture(i + 1, i);
      assert.deepEqual([f.water().width, f.water().height], size, 'small drags reuse the target allocation');
    }
  } finally { f.effect.dispose(); }
});

test('clarity changes sampling density; large displays remain within GPU and memory limits', () => {
  const f = fixture();
  try {
    f.effect.update({ settings: { waterClarity: 0 } }); f.capture(0, 0);
    const low = f.water();
    f.effect.update({ settings: { waterClarity: 1 } }); f.capture(1, 0);
    const high = f.water();
    assert.ok(high.width * high.height > low.width * low.height * 2);
    assert.equal(low.reflection, high.reflection, 'clarity must not change brightness');
    f.renderer.width = 7680; f.renderer.height = 4320; f.renderer.ratio = 2;
    f.renderer.capabilities.maxTextureSize = 2048;
    f.capture(2, 1);
    const large = f.water();
    assert.ok(large.width <= 2048 && large.height <= 2048);
    assert.ok(large.width * large.height <= large.pixelBudget);
    assert.ok(large.width >= 1800, 'use the available GPU detail instead of the old 512px budget');
    const passes = large.passes;
    f.camera.position.y = -10;
    f.camera.lookAt(0, 0, 0);
    assert.equal(f.capture(3, 2), false);
    assert.equal(f.water().ready, false);
    assert.equal(f.water().passes, passes);
  } finally { f.effect.dispose(); }
});

test('a failed paused resize capture is invalidated and retried on the next frame', () => {
  const f = fixture();
  try {
    f.capture(0, 'paused');
    const before = f.water().passes;
    const render = f.renderer.render;
    f.renderer.ratio = 2;
    f.renderer.render = () => { throw new Error('capture interrupted'); };
    assert.throws(() => f.capture(1, 'paused'), /capture interrupted/);
    f.renderer.render = render;
    assert.equal(f.water().ready, false, 'never display a cleared/partial resized target');
    assert.equal(f.capture(2, 'paused'), true, 'same revision must retry a failed resize capture');
    assert.equal(f.water().passes, before + 1);
    assert.equal(f.water().ready, true);
  } finally { f.effect.dispose(); }
});
