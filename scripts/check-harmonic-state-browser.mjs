import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output', 'playwright', 'harmonic-orbital');
const require = createRequire(import.meta.url);
const candidates = [
  process.env.PLAYWRIGHT_MODULE_PATH,
  'playwright',
  path.join(homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright')
].filter(Boolean);
let chromium;
for (const candidate of candidates) {
  try { ({ chromium } = require(candidate)); break; } catch { /* Try the next installed runtime. */ }
}
assert.ok(chromium, 'An installed Playwright is required; PLAYWRIGHT_MODULE_PATH can select its package directory.');
mkdirSync(output, { recursive: true });

// This fixture owns its clock and scene. It never starts the application,
// imports account state, or opens a browser profile belonging to the user.
function installFixture() {
  const paints = new WeakMap();
  const canvasListeners = new WeakMap();
  const errors = [];
  const eventTypes = new Set(['webglcontextlost', 'webglcontextrestored', 'webglcontextcreationerror']);
  const originalAdd = EventTarget.prototype.addEventListener;
  const originalRemove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (this instanceof HTMLCanvasElement && eventTypes.has(type)) {
      const listeners = canvasListeners.get(this) || new Map();
      const callbacks = listeners.get(type) || new Set();
      callbacks.add(listener);
      listeners.set(type, callbacks);
      canvasListeners.set(this, listeners);
    }
    return originalAdd.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    if (this instanceof HTMLCanvasElement) canvasListeners.get(this)?.get(type)?.delete(listener);
    return originalRemove.call(this, type, listener, options);
  };
  const listenerCount = canvas => Array.from(canvasListeners.get(canvas)?.values() || [])
    .reduce((sum, callbacks) => sum + callbacks.size, 0);
  const proto = CanvasRenderingContext2D.prototype;
  const originalFillText = proto.fillText;
  const originalClearRect = proto.clearRect;
  proto.clearRect = function (x, y, width, height) {
    if (x <= 0 && y <= 0 && width >= this.canvas.width && height >= this.canvas.height) {
      paints.set(this.canvas, []);
    }
    return originalClearRect.apply(this, arguments);
  };
  proto.fillText = function (text, x, y, maxWidth) {
    const metrics = this.measureText(String(text));
    const transform = this.getTransform();
    const left = x - metrics.actualBoundingBoxLeft;
    const right = x + metrics.actualBoundingBoxRight;
    const top = y - metrics.actualBoundingBoxAscent;
    const bottom = y + metrics.actualBoundingBoxDescent;
    const corners = [[left, top], [right, top], [left, bottom], [right, bottom]]
      .map(([px, py]) => new DOMPoint(px, py).matrixTransform(transform));
    const events = paints.get(this.canvas) || [];
    events.push({
      text: String(text), font: this.font, maxWidth: maxWidth ?? null,
      bounds: {
        left: Math.min(...corners.map(point => point.x)),
        right: Math.max(...corners.map(point => point.x)),
        top: Math.min(...corners.map(point => point.y)),
        bottom: Math.max(...corners.map(point => point.y))
      }
    });
    paints.set(this.canvas, events);
    return originalFillText.apply(this, arguments);
  };
  addEventListener('error', event => errors.push(String(event.error?.stack || event.message)));
  addEventListener('unhandledrejection', event => errors.push(String(event.reason?.stack || event.reason)));

  const host = document.getElementById('host');
  const api = window.FeHarmonicStateRuntime;
  const settingsApi = window.FeHarmonicSettings;
  const visualSamples = new Map();
  const hiddenForMist = new Map();
  let now = 1000;
  const entries = Array.from({ length: 7 }, (_, index) => ({
    key: `song-a:${index}`, text: ['听见星光落在海面', '让风带走昨天', '月光沿着玻璃流淌', '你在远方轻轻歌唱', 'Every quiet light stays', '海浪回应每次呼吸', '等黎明再次照亮'][index],
    subtitle: `原曲字幕 ${index + 1}`, active: index === 0
  }));
  let frame = {
    now, playing: true, bass: 0.35, energy: 0.3, mid: 0.24, treble: 0.2, beat: 0.15,
    yaw: 0, pitch: 0, zoom: 2.35, pixelRatio: 1, reducedMotion: false,
    progress: 0.25, lyricProgress: 0.2, lyricFraction: 0.2, lyricKey: entries[0].key, songKey: 'song-a',
    entries, lines: { previous: entries[6].text, current: entries[0].text, next: entries[1].text }
  };
  const renderPasses = [];
  function createRuntime(effects) {
    return api.create(host, {
      THREE: window.THREE, particleCount: 96000, pixelRatio: 1, effects,
      createRenderer(options) {
        const renderer = new THREE.WebGLRenderer(options);
        const render = renderer.render;
        renderer.render = function (scene, camera) {
          const target = this.getRenderTarget();
          renderPasses.push({ target: target?.texture?.uuid || null, width: target?.width || null, height: target?.height || null });
          return render.call(this, scene, camera);
        };
        return renderer;
      }
    });
  }
  const createStartedAt = performance.now();
  let runtime = createRuntime();
  const startupTimings = { createMs: performance.now() - createStartedAt, firstFrameMs: null };
  if (!runtime) throw new Error('Harmonic runtime create returned no scene');

  function numericValueIsFinite(value) {
    if (typeof value === 'number') return Number.isFinite(value);
    if (!value || typeof value !== 'object' || value.isTexture) return true;
    if (Array.isArray(value) || ArrayBuffer.isView(value)) return Array.from(value).every(numericValueIsFinite);
    if (value.elements) return Array.from(value.elements).every(Number.isFinite);
    return ['x', 'y', 'z', 'w', 'r', 'g', 'b'].every(key =>
      typeof value[key] !== 'number' || Number.isFinite(value[key]));
  }

  function snapshot() {
    runtime.scene.updateMatrixWorld(true);
    let sceneFinite = true;
    let uniformsFinite = true;
    const decorationTimes = [];
    runtime.scene.traverse(object => {
      sceneFinite &&= object.matrixWorld.elements.every(Number.isFinite);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material?.uniforms) {
          uniformsFinite &&= Object.values(material.uniforms).every(uniform => numericValueIsFinite(uniform.value));
          if (typeof material.uniforms.uTime?.value === 'number') decorationTimes.push(material.uniforms.uTime.value);
        }
      }
    });
    const cards = (runtime.cards || []).map(card => {
      const mesh = card.mesh;
      const position = mesh.getWorldPosition(new THREE.Vector3());
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      const corners = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
        corners.push(new THREE.Vector3(x, y, 0).applyMatrix4(mesh.matrixWorld).project(runtime.camera));
      }
      return {
        position: position.toArray(), matrix: mesh.matrixWorld.elements.slice(),
        canvas: !!card.canvas?.getContext && card.texture?.image === card.canvas,
        projectedBounds: {
          left: Math.min(...corners.map(point => point.x)), right: Math.max(...corners.map(point => point.x)),
          top: Math.max(...corners.map(point => point.y)), bottom: Math.min(...corners.map(point => point.y))
        }
      };
    });
    const diagnostics = api.diagnostics(runtime);
    return {
      diagnostics, cards, sceneFinite, uniformsFinite, decorationTimes, startupTimings: { ...startupTimings },
      groupMatrix: runtime.group.matrixWorld.elements.slice(),
      renderTargetNull: runtime.renderer.getRenderTarget() === null,
      outputEncodingRestored: runtime.renderer.outputEncoding === THREE.sRGBEncoding,
      effectsApi: typeof api.setEffects === 'function',
      settingsApi: !!settingsApi?.normalize && Array.isArray(settingsApi?.schema),
      effects: runtime.effects || null,
      atmosphere: runtime.atmosphere?.diagnostics?.() || null,
      orbital: runtime.orbital?.diagnostics?.() || null,
      towers: runtime.lightTowers?.diagnostics?.() || null,
      renderPasses: renderPasses.slice(),
      gpuMemory: { ...runtime.renderer.info.memory },
      contextListeners: listenerCount(runtime.renderer.domElement),
      crystalColumn: !!runtime.crystalColumn?.group?.isObject3D,
      coral: !!runtime.coral?.points?.isObject3D,
      canvasCount: host.querySelectorAll('canvas').length,
      contextLost: runtime.renderer.getContext().isContextLost(),
      glError: runtime.renderer.getContext().getError()
    };
  }

  function step(count, changes = {}, stepMs = 1000 / 60) {
    frame = { ...frame, ...changes };
    for (let index = 0; index < count; index += 1) {
      now += stepMs;
      renderPasses.length = 0;
      api.update(runtime, { ...frame, now });
    }
    return snapshot();
  }

  function simulate(count, changes = {}, stepMs = 80) {
    const render = runtime.renderer.render;
    try {
      runtime.renderer.render = () => {};
      step(count, changes, stepMs);
    } finally {
      runtime.renderer.render = render;
    }
    // Finish each batch with a real WebGL frame and an unchanged simulated clock.
    return step(1, changes, 0);
  }

  function textEvidence(expected) {
    return (runtime.cards || []).map((card, index) => {
      const events = paints.get(card.canvas) || [];
      let remaining = expected.replace(/\n/g, '');
      const matched = [];
      for (const event of events) {
        if (event.text && remaining.startsWith(event.text)) {
          matched.push(event);
          remaining = remaining.slice(event.text.length);
        }
      }
      return {
        index, complete: !remaining, missing: remaining,
        width: card.canvas.width, height: card.canvas.height,
        matched, text: events.map(event => event.text).join('')
      };
    });
  }

  function effectGeometryAndUniforms() {
    runtime.scene.updateMatrixWorld(true);
    const result = [];
    const serialize = value => {
      if (typeof value === 'number' || typeof value === 'boolean') return value;
      if (value?.isTexture) return null;
      if (value?.toArray) return value.toArray();
      if (Array.isArray(value) || ArrayBuffer.isView(value)) return Array.from(value);
      return null;
    };
    for (const group of [runtime.orbital?.group, runtime.lightTowers?.group, runtime.atmosphere?.group, runtime.gallery]) {
      group?.traverse(object => {
        const materials = (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean);
        if (object.geometry) object.geometry.computeBoundingBox();
        result.push({
          name: object.name, visible: object.visible, matrix: object.matrixWorld.elements.slice(),
          drawRange: object.geometry?.drawRange, instanceCount: object.geometry?.instanceCount,
          positions: object.geometry?.attributes?.position?.usage === THREE.DynamicDrawUsage
            ? Array.from(object.geometry.attributes.position.array) : null,
          bounds: object.geometry?.boundingBox ? [object.geometry.boundingBox.min.toArray(), object.geometry.boundingBox.max.toArray()] : null,
          materials: materials.map(material => ({
            color: material.color?.toArray?.() || null, opacity: material.opacity,
            metalness: material.metalness, roughness: material.roughness,
            uniforms: Object.fromEntries(Object.entries(material.uniforms || {}).map(([key, uniform]) => [key, serialize(uniform.value)]))
          }))
        });
      });
    }
    return result;
  }

  function towerLayout() {
    runtime.scene.updateMatrixWorld(true);
    runtime.camera.updateMatrixWorld(true);
    const width = runtime.renderer.domElement.width, height = runtime.renderer.domElement.height;
    const bounds = points => ({
      left: Math.min(...points.map(point => point.x)), right: Math.max(...points.map(point => point.x)),
      top: Math.min(...points.map(point => point.y)), bottom: Math.max(...points.map(point => point.y)),
      near: Math.min(...points.map(point => point.z)), far: Math.max(...points.map(point => point.z))
    });
    const project = point => {
      point.project(runtime.camera);
      return new THREE.Vector3((point.x + 1) * width / 2, (1 - point.y) * height / 2, point.z);
    };
    const projectVertices = (mesh, matrix, radialEnvelope = 1) => {
      const points = [], positions = mesh.geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index += 1) {
        const point = new THREE.Vector3().fromBufferAttribute(positions, index);
        // Tower shaders add at most 3.5% radial segment rounding. Include its
        // maximum envelope so CPU projection never understates the silhouette.
        point.x *= radialEnvelope;
        point.z *= radialEnvelope;
        points.push(project(point.applyMatrix4(matrix)));
      }
      return points;
    };
    const anchors = runtime.lightTowers.anchors.map(anchor => ({ ...anchor }));
    const roles = [
      ['body', 'LightTowerWetBodies', 1.035],
      ['halo', 'LightTowerSoftHalos', 1.035],
      ['rings', 'LightTowerCyanRings', 1]
    ];
    const towerPoints = anchors.map(() => []), instances = [];
    for (const [role, name, envelope] of roles) {
      const mesh = runtime.lightTowers.group.getObjectByName(name);
      if (!mesh?.isInstancedMesh) throw new Error(`Missing actual tower instances: ${role}`);
      const ids = mesh.geometry.getAttribute('aTowerId');
      for (let index = 0; index < mesh.count; index += 1) {
        const towerIndex = ids.getX(index);
        const matrix = new THREE.Matrix4();
        mesh.getMatrixAt(index, matrix);
        const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
        matrix.decompose(position, quaternion, scale);
        const worldMatrix = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, matrix);
        const points = projectVertices(mesh, worldMatrix, envelope);
        towerPoints[towerIndex].push(...points);
        instances.push({ role, towerIndex, position: position.toArray(), scale: scale.toArray(), bounds: bounds(points) });
      }
    }
    const centralPoints = [];
    runtime.orbital.rings.traverse(mesh => {
      if (mesh.isMesh && mesh.geometry?.getAttribute('position')) {
        centralPoints.push(...projectVertices(mesh, mesh.matrixWorld));
      }
    });
    return {
      width, height, anchors, instances,
      towers: towerPoints.map((points, index) => ({ index, ...bounds(points) })),
      central: bounds(centralPoints), centralMatrix: runtime.orbital.group.matrixWorld.elements.slice(),
      cardMatrices: runtime.cards.map(card => card.mesh.matrixWorld.elements.slice())
    };
  }

  function visualSample(label, compareTo) {
    step(1, { playing: false }, 0);
    const gl = runtime.renderer.getContext();
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const raw = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const pixels = [];
    let sum = 0, squared = 0;
    const shades = new Set();
    for (let y = 0; y < height; y += 4) for (let x = 0; x < width; x += 4) {
      const offset = (y * width + x) * 4;
      const luma = raw[offset] * 0.2126 + raw[offset + 1] * 0.7152 + raw[offset + 2] * 0.0722;
      pixels.push(luma);
      sum += luma;
      squared += luma * luma;
      shades.add(Math.round(luma));
    }
    const previous = visualSamples.get(compareTo);
    let totalDifference = 0, changed = 0, brighter = 0, darker = 0;
    if (previous) for (let index = 0; index < pixels.length; index += 1) {
      const difference = pixels[index] - previous[index];
      totalDifference += Math.abs(difference);
      if (Math.abs(difference) > 2) changed += 1;
      if (difference > 2) brighter += 1;
      if (difference < -2) darker += 1;
    }
    visualSamples.set(label, pixels);
    const mean = sum / pixels.length;
    const activeCard = runtime.cards.find(card => card.data?.active);
    let lyricTotal = 0, lyricSamples = 0;
    if (activeCard) {
      const canvas = activeCard.canvas;
      const textPixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const bounds = activeCard.mesh.geometry.boundingBox;
      for (let y = Math.floor(canvas.height * 0.32); y < canvas.height * 0.65; y += 6) {
        for (let x = Math.floor(canvas.width * 0.1); x < canvas.width * 0.9; x += 6) {
          const offset = (y * canvas.width + x) * 4;
          if (textPixels[offset + 3] < 210 || textPixels[offset] < 180) continue;
          const point = new THREE.Vector3(
            bounds.min.x + (bounds.max.x - bounds.min.x) * x / canvas.width,
            bounds.max.y - (bounds.max.y - bounds.min.y) * y / canvas.height, 0
          ).applyMatrix4(activeCard.mesh.matrixWorld).project(runtime.camera);
          const sx = Math.round((point.x + 1) * width / 2), sy = Math.round((point.y + 1) * height / 2);
          if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
          const screenOffset = (sy * width + sx) * 4;
          lyricTotal += raw[screenOffset] * 0.2126 + raw[screenOffset + 1] * 0.7152 + raw[screenOffset + 2] * 0.0722;
          lyricSamples += 1;
        }
      }
    }
    return {
      mean, deviation: Math.sqrt(Math.max(0, squared / pixels.length - mean * mean)), shades: shades.size,
      difference: totalDifference / pixels.length, changedFraction: changed / pixels.length,
      brighterFraction: brighter / pixels.length, darkerFraction: darker / pixels.length,
      lyricSamples, lyricLuminance: lyricTotal / Math.max(1, lyricSamples),
      glError: gl.getError()
    };
  }

  window.__harmonic = {
    step, simulate, snapshot, textEvidence, errors, effectGeometryAndUniforms, visualSample, towerLayout,
    lightingInvariant() {
      runtime.scene.updateMatrixWorld(true);
      const key = runtime.orbital.group.getObjectByName('HarmonicKeyLight');
      const actual = key.getWorldPosition(new THREE.Vector3()).sub(key.target.getWorldPosition(new THREE.Vector3())).normalize();
      const tower = runtime.lightTowers.group.getObjectByName('LightTowerWetBodies');
      const expected = runtime.keyDirectionWorld;
      return {
        directions: [actual, runtime.orbital.tiles.material.uniforms.uKeyDirectionWorld.value,
          tower.material.uniforms.uKeyDirectionWorld.value, runtime.atmosphere.mist.material.uniforms.uKeyDirectionWorld.value]
          .map(direction => direction.distanceTo(expected)),
        exposure: runtime.renderer.toneMappingExposure, shadowMap: runtime.renderer.shadowMap.enabled,
        memory: { ...runtime.renderer.info.memory }, programs: runtime.renderer.info.programs.length,
        draws: runtime.renderer.info.render.calls,
        cards: runtime.cards.map(card => ({ matrix: card.mesh.matrixWorld.elements.slice(),
          geometry: card.mesh.geometry.uuid, shader: card.glassMaterial.fragmentShader,
          text: (paints.get(card.canvas) || []).map(event => ({ text: event.text, font: event.font, bounds: event.bounds })) }))
      };
    },
    orbitalEvidence() {
      const core = runtime.orbital;
      core.group.updateMatrixWorld(true);
      const position = core.lineGeometry.getAttribute('position');
      const perRay = core.lineGeometry.drawRange.count / core.diagnostics().rayCount;
      const sourceErrors = [], targetErrors = [], ringErrors = [];
      for (let index = 0; index < core.diagnostics().rayCount; index += 1) {
        const source = new THREE.Vector3(index % 8 & 1 ? 1 : -1, index % 8 & 2 ? 1 : -1, index % 8 & 4 ? 1 : -1)
          .multiplyScalar(5.84 / 2).applyMatrix4(core.cube.matrix);
        sourceErrors.push(source.distanceTo(new THREE.Vector3().fromBufferAttribute(position, index * perRay)));
        targetErrors.push(core.targets[index].distanceTo(new THREE.Vector3().fromBufferAttribute(position, (index + 1) * perRay - 1)));
        const pivot = core.pivots[index % core.pivots.length];
        const ringLocal = core.targets[index].clone().divide(core.rings.scale).applyMatrix4(pivot.matrix.clone().invert());
        const ringRadius = pivot.children[0].geometry.parameters.radius;
        ringErrors.push(Math.abs(ringLocal.length() - ringRadius) + Math.abs(ringLocal.z));
      }
      const atmosphere = runtime.atmosphere;
      const rainOrigins = atmosphere.rain.geometry.getAttribute('aOrigin');
      const impactOrigins = atmosphere.impacts.geometry.getAttribute('aOrigin');
      const seeds = atmosphere.rain.geometry.getAttribute('aSeed');
      const rainTime = atmosphere.rain.material.uniforms.uRainTime.value;
      const beam=core.diagnostics(), dots=core.dotGeometry.getAttribute('position');
      let beamSpread=0,beamAttachmentError=0;
      for(let ray=0;ray<beam.rayCount;ray++)for(let sample=0;sample<beam.beamSamples;sample++){
        const first=(ray*beam.beamSamples+sample)*beam.beamStrands;
        const center=new THREE.Vector3().fromBufferAttribute(dots,first);
        for(let strand=1;strand<beam.beamStrands;strand++){
          const edge=new THREE.Vector3().fromBufferAttribute(dots,first+strand);
          beamSpread=Math.max(beamSpread,center.distanceTo(edge));
          if(sample===0||sample===beam.beamSamples-1)beamAttachmentError=Math.max(beamAttachmentError,
            edge.distanceTo(sample===0?core.sources[ray]:core.targets[ray]));
        }
      }
      let activeImpacts = 0;
      for (let index = 0; index < atmosphere.diagnostics().rainCount; index += 1) {
        if ((seeds.getX(index) + rainTime * seeds.getY(index)) % 1 >= 0.62) activeImpacts += 1;
      }
      return {
        sourceErrors, targetErrors, ringErrors, activeImpacts,
        beamSpread,beamAttachmentError,beamRadius:beam.beamRadius,
        beamParticleCount:core.dotGeometry.drawRange.count,
        onlyParticleBeams:core.rays.children.length===1&&core.rays.children[0].isPoints===true,
        ringsVisible:core.rings.visible,cubeVisible:core.cube.visible,beamsVisible:core.rays.visible,
        faceIds: [...new Set(core.tiles.geometry.getAttribute('aFaceId').array)],
        tileCount: core.tiles.count,
        tileBands: Object.fromEntries(['uBass', 'uMid', 'uTreble'].map(key => [key, core.tiles.material.uniforms[key].value])),
        rainImpactOriginsMatch: Array.from(rainOrigins.array).every((value, index) => value === impactOrigins.array[index]),
        rainClockShared: atmosphere.rain.material.uniforms.uRainTime === atmosphere.impacts.material.uniforms.uRainTime
          && atmosphere.rain.material.uniforms.uRainTime === atmosphere.splashes.material.uniforms.uRainTime,
        doubleRingShader: /r-\.65/.test(atmosphere.impacts.material.fragmentShader)
          && /r-\.88/.test(atmosphere.impacts.material.fragmentShader),
        rainVisible: atmosphere.rain.visible, impactsVisible: atmosphere.impacts.visible, splashesVisible: atmosphere.splashes.visible
      };
    },
    settingsSchema() { return settingsApi?.schema || []; },
    effects(changes = {}, viaFrame = false) {
      // Pixel-comparison fixtures explicitly stop idle motion; production defaults
      // are exercised separately below so quality comparisons see the same frame.
      const value = { ...settingsApi.defaults, idleAnimation: false, ...changes };
      if (viaFrame) {
        const state = step(1, { effects: value }, 0);
        delete frame.effects;
        return state;
      }
      api.setEffects(runtime, value);
      return step(1, {}, 0);
    },
    advanceFog(delta) {
      let remaining = delta;
      while (remaining > 1e-8) {
        const amount = Math.min(0.08, remaining);
        runtime.atmosphere.update({ delta: amount, playing: true, reducedMotion: false, bass: 0,
          settings: { ...runtime.effects, rainEnabled: false, waterSpeed: 0 }, ringRadius: runtime.orbital.diagnostics().ringRadius });
        remaining -= amount;
      }
      return step(1, { playing: false }, 0);
    },
    mistOnly(enabled) {
      if (enabled) {
        runtime.scene.traverse(object => {
          if (!object.isMesh && !object.isPoints && !object.isLine) return;
          let ancestor = object;
          while (ancestor && ancestor !== runtime.atmosphere.group) ancestor = ancestor.parent;
          if (ancestor === runtime.atmosphere.group) return;
          hiddenForMist.set(object, object.visible);
          object.visible = false;
        });
      } else {
        for (const [object, visible] of hiddenForMist) object.visible = visible;
        hiddenForMist.clear();
      }
      return step(1, { playing: false }, 0);
    },
    advanceLine() {
      return step(1, {
        entries: entries.map((entry, index) => ({ ...entry, active: index === 1 })),
        lyricKey: entries[1].key, lyricFraction: 0,
        lines: { previous: entries[0].text, current: entries[1].text, next: entries[2].text }
      });
    },
    replaceSong(text, song = 'song-b', fraction = 0) {
      const surrounding = ['', '光影映在水面', '风从远处吹来', '夜色轻轻回响', '星河沿着玻璃延展', '此刻听见你的声音', '让余音停留片刻'];
      const next = entries.map((entry, index) => ({
        ...entry, key: `${song}:${index}`, text: index === 0 ? text : surrounding[index], subtitle: '夜色轻轻回响'
      }));
      return step(1, {
        entries: next, songKey: song, lyricKey: next[0].key, lyricFraction: fraction, lyricProgress: fraction,
        lines: { previous: next[6].text, current: next[0].text, next: next[1].text }
      });
    },
    resize(width, height, pixelRatio = 1) {
      host.style.width = `${width}px`;
      host.style.height = `${height}px`;
      api.resize(runtime, pixelRatio);
      return step(1, { pixelRatio });
    },
    quality(mode) {
      const surface = mode === 'native' ? runtime.qualitySurface : null;
      const previousResources = surface ? [surface.target, surface.geometry, surface.material].filter(Boolean) : [];
      const released = new Set();
      for (const resource of previousResources) resource.addEventListener('dispose', () => released.add(resource));
      const accepted = api.setRenderQuality(runtime, mode);
      return {
        accepted, ...step(1, {}, 0),
        previousSurfaceResources: previousResources.length, releasedSurfaceResources: released.size
      };
    },
    brightnessSamples() {
      // Read immediately after a real frame, before the compositor may discard
      // a non-preserved drawing buffer. Coordinates are top-left screen pixels.
      step(1, { playing: false }, 0);
      const gl = runtime.renderer.getContext();
      const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
      const sample = (label, x, y) => {
        const left = Math.round(x) - 8, top = Math.round(y) - 8;
        if (left < 0 || top < 0 || left + 16 > width || top + 16 > height) {
          throw new Error(`Brightness sample ${label} falls outside the framebuffer`);
        }
        const pixels = new Uint8Array(16 * 16 * 4);
        gl.readPixels(left, height - top - 16, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const mean = [0, 0, 0];
        for (let index = 0; index < pixels.length; index += 4) {
          for (let channel = 0; channel < 3; channel += 1) mean[channel] += pixels[index + channel] / 256;
        }
        return { label, bounds: { left, top, width: 16, height: 16 }, mean };
      };
      const background = [[24, 24], [64, 24], [24, 64], [64, 64]]
        .map(([x, y], index) => sample(`background-${index}`, x, y));
      const activeCard = runtime.cards.find(card => card.data?.active);
      if (!activeCard) throw new Error('No active reading card is available for glass color sampling');
      activeCard.mesh.geometry.computeBoundingBox();
      const box = activeCard.mesh.geometry.boundingBox;
      // These fixed card-local points stay away from the center object, main
      // title, top label, subtitle, footer, and rounded card edges. No sample is
      // filtered out according to its resulting brightness or observed delta.
      const glass = [[0.18, 0.70], [0.26, 0.70], [0.74, 0.70], [0.82, 0.70], [0.22, 0.40], [0.78, 0.40]]
        .map(([u, v], index) => {
          const point = new THREE.Vector3(
            box.min.x + (box.max.x - box.min.x) * u,
            box.min.y + (box.max.y - box.min.y) * v, 0
          ).applyMatrix4(activeCard.mesh.matrixWorld).project(runtime.camera);
          return sample(`glass-${index}`, (point.x + 1) * width / 2, (1 - point.y) * height / 2);
        });
      return { width, height, background, glass, glError: gl.getError() };
    },
    recreate(effects) {
      runtime = createRuntime(effects);
      return step(1, { playing: true, reducedMotion: false, yaw: 0, pitch: 0, zoom: 2.35 });
    },
    palette(colors) { api.setPalette(runtime, colors); return step(1); },
    finish() {
      const resources = new Set([runtime.orbital.lineGeometry]);
      runtime.scene.traverse(object => {
        if (object.isInstancedMesh && typeof object.dispose === 'function') resources.add(object);
        if (object.geometry) resources.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material) resources.add(material);
          if (material?.envMap) resources.add(material.envMap);
          for (const uniform of Object.values(material?.uniforms || {})) {
            if (uniform.value?.isDataTexture || uniform.value?.isCubeTexture) resources.add(uniform.value);
          }
        }
      });
      for (const card of runtime.cards || []) if (card.texture) resources.add(card.texture);
      if (runtime.backdrop) resources.add(runtime.backdrop);
      const qualitySurfaceResources = runtime.qualitySurface
        ? [runtime.qualitySurface.target, runtime.qualitySurface.geometry, runtime.qualitySurface.material].filter(Boolean)
        : [];
      for (const resource of qualitySurfaceResources) resources.add(resource);
      const cubeEnvironments = [...resources].filter(resource => resource.isCubeTexture);
      const backdrop = runtime.backdrop;
      const canvas = runtime.renderer.domElement;
      const released = new Set();
      const releaseCounts = new Map([...resources].map(resource => [resource, 0]));
      for (const resource of resources) resource.addEventListener('dispose', () => {
        released.add(resource); releaseCounts.set(resource, releaseCounts.get(resource) + 1);
      });
      const first = api.dispose(runtime);
      const second = api.dispose(runtime);
      return {
        first, second, canvasCount: host.querySelectorAll('canvas').length,
        diagnostics: api.diagnostics(runtime),
        ownedResources: resources.size, releasedResources: released.size,
        allReleasedExactlyOnce: [...releaseCounts.values()].every(count => count === 1),
        cubeEnvironments: cubeEnvironments.length,
        releasedCubeEnvironments: cubeEnvironments.filter(resource => released.has(resource)).length,
        qualitySurfaceResources: qualitySurfaceResources.length,
        releasedQualitySurfaceResources: qualitySurfaceResources.filter(resource => released.has(resource)).length,
        backdropReleased: released.has(backdrop), contextListeners: listenerCount(canvas),
        updateAfterDispose: api.update(runtime, frame)
      };
    }
  };
  const firstFrameStartedAt = performance.now();
  step(1);
  // Isolated startup measurement only: wait for GPU completion, never in the app loop.
  runtime.renderer.getContext().finish();
  startupTimings.firstFrameMs = performance.now() - firstFrameStartedAt;
}

const fixture = `<!doctype html><html><head><meta charset="utf-8"><title>Harmonic Orbital isolated regression</title><link rel="icon" href="data:,"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#03040a}#host{width:100vw;height:100vh}canvas{display:block;width:100%;height:100%}</style></head><body><div id="host"></div><script src="/vendor/three.r128.min.js"></script><script src="/render-quality.js"></script><script src="/harmonic-state-settings.js"></script><script src="/harmonic-orbital-core.js"></script><script src="/harmonic-orbital-atmosphere.js"></script><script src="/harmonic-state-runtime.js"></script><script>(${installFixture.toString()})()</script></body></html>`;
const assets = new Map([
  ['/', { type: 'text/html; charset=utf-8', body: Buffer.from(fixture) }],
  ['/vendor/three.r128.min.js', { type: 'application/javascript; charset=utf-8', body: readFileSync(path.join(root, 'web', 'vendor', 'three.r128.min.js')) }],
  ['/render-quality.js', { type: 'application/javascript; charset=utf-8', body: readFileSync(path.join(root, 'web', 'render-quality.js')) }],
  ['/harmonic-state-settings.js', { type: 'application/javascript; charset=utf-8', body: readFileSync(path.join(root, 'web', 'harmonic-state-settings.js')) }],
  ['/harmonic-orbital-core.js', { type: 'application/javascript; charset=utf-8', body: readFileSync(path.join(root, 'web', 'harmonic-orbital-core.js')) }],
  ['/harmonic-orbital-atmosphere.js', { type: 'application/javascript; charset=utf-8', body: readFileSync(path.join(root, 'web', 'harmonic-orbital-atmosphere.js')) }],
  ['/harmonic-state-runtime.js', { type: 'application/javascript; charset=utf-8', body: readFileSync(path.join(root, 'web', 'harmonic-state-runtime.js')) }]
]);
const server = createServer((request, response) => {
  const asset = assets.get(new URL(request.url || '/', 'http://127.0.0.1').pathname);
  if (!asset) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': asset.type, 'Content-Length': asset.body.length, 'Cache-Control': 'no-store' });
  response.end(asset.body);
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });

const failures = [];
const consoleErrors = [];
const shaderErrors = [];
const networkErrors = [];
const evidence = {};
const screenshots = [];
let browser;
function check(condition, message, details) {
  if (!condition) failures.push({ message, ...(details === undefined ? {} : { details }) });
}
function atmosphereMotionState(state) {
  // A throttled reflection may finish its last capture after motion is frozen;
  // the diagnostic work counter is not an animation clock or visual property.
  const { passes, ...water } = state.water;
  return { ...state, water };
}
function checkScene(state, label) {
  check(state.cards.length === 7, `${label}: exactly seven orbiting cards`, state.cards.length);
  check(state.cards.every(card => card.canvas), `${label}: every card owns a canvas texture`);
  check(!state.crystalColumn && !state.coral, `${label}: removed crystal and coral are absent`);
  check(state.orbital?.ringCount >= 4 && state.orbital?.tileCount >= 1500 && state.orbital?.rayCount >= 8,
    `${label}: globe rings, tiled cube, and corner rays are present`, state.orbital);
  check(state.orbital?.rayAnchorError < 1e-5, `${label}: rays stay attached to moving ring walls`, state.orbital?.rayAnchorError);
  check(state.sceneFinite && state.uniformsFinite && state.diagnostics.finiteUniforms === true, `${label}: matrices and shader uniforms remain finite`);
  check(state.diagnostics.cardCount === state.cards.length, `${label}: diagnostics matches the rendered card count`);
  check(Number.isFinite(state.diagnostics.orbitPhase), `${label}: orbit phase is finite`);
  check(Number.isFinite(state.diagnostics.maxCardY) && state.diagnostics.maxCardY < 4, `${label}: diagnostic Y bound is finite`, state.diagnostics.maxCardY);
  check(state.cards.every(card => Math.abs(card.position[1]) < 4), `${label}: card world positions stay on a horizontal track`, state.cards.map(card => card.position));
  check(!state.contextLost && state.glError === 0, `${label}: WebGL context remains healthy`, { lost: state.contextLost, error: state.glError });
  check(state.renderTargetNull, `${label}: rendering restores the default framebuffer`);
  check(state.outputEncodingRestored, `${label}: rendering restores sRGB output encoding`);
}

try {
  const fallback = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  browser = await chromium.launch({
    headless: true,
    ...(!existsSync(chromium.executablePath()) && fallback ? { executablePath: fallback } : {}),
    args: [
      '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling',
      ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])
    ]
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const url = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', route => {
    const target = new URL(route.request().url());
    return target.origin === url || target.protocol === 'data:' ? route.continue() : route.abort();
  });
  page.on('pageerror', error => consoleErrors.push(String(error.stack || error.message)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
    if (/shader error|VALIDATE_STATUS|WebGLProgram:|GL_INVALID|glCompileShader|glLinkProgram/i.test(message.text())) shaderErrors.push(message.text());
  });
  page.on('requestfailed', request => networkErrors.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) networkErrors.push(`${response.status()} ${response.url()}`); });
  async function capture(name, options = {}) {
    const file = path.join(output, `${name}.png`);
    await page.screenshot({ path: file, ...options });
    screenshots.push(file);
  }
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__harmonic, null, { timeout: 10000 });
  evidence.initial = await page.evaluate(() => __harmonic.snapshot());
  checkScene(evidence.initial, 'initial');
  check(evidence.initial.canvasCount === 1, 'one rendering canvas is attached');
  check(evidence.initial.diagnostics.particleCount >= 960, 'desktop fixture uses the actual dense corner-ray particle field');
  check(evidence.initial.diagnostics.renderQuality.available, 'real render-quality controller is available');
  check(evidence.initial.settingsApi, 'shared effects settings schema and normalization are loaded');
  check(evidence.initial.effectsApi, 'runtime exposes setEffects for live controls');
  check(evidence.initial.diagnostics.towerCount === 2 && evidence.initial.towers?.towerCount === 2,
    'two independently placed side light towers are connected to the scene');
  check(evidence.initial.atmosphere?.enabled === true && evidence.initial.atmosphere.layerCount >= 2,
    'a layered, animated atmosphere is connected and enabled by default');
  const initialX = evidence.initial.cards.map(card => card.position[0]);
  const initialZ = evidence.initial.cards.map(card => card.position[2]);
  check(Math.min(...initialX) < -1 && Math.max(...initialX) > 1 && Math.max(...initialZ) - Math.min(...initialZ) > 3,
    'cards occupy both sides and multiple depths of the horizontal orbit');
  await capture('01-initial-1440');
  // Every lighting control is tested at a frozen frame using framebuffer pixels,
  // not just a changed uniform. These are min/max comparisons, not old-version screenshots.
  await page.evaluate(() => __harmonic.effects({}));
  await page.evaluate(() => __harmonic.simulate(45, { playing: true, bass: .7, mid: .4, treble: .3 }, 16));
  await page.evaluate(() => __harmonic.step(1, { playing: false }, 0));
  const lightFields = ['keyLightIntensity', 'keyLightAzimuth', 'keyLightElevation', 'ambientLightIntensity',
    'rimLightIntensity', 'lightAudioStrength', 'ringMetalness', 'ringRoughness', 'cubeEdgeGlow', 'cubeOcclusion',
    'towerReflectivity', 'glowStrength', 'glowSoftness', 'fogLightStrength', 'floorLightEnabled',
    'floorLightStrength', 'floorLightSpread', 'floorShadowStrength'];
  const lightSchema = await page.evaluate(() => __harmonic.settingsSchema());
  const stableCards = await page.evaluate(() => __harmonic.lightingInvariant());
  evidence.lightingControls = [];
  for (const key of lightFields) {
    const field = lightSchema.find(item => item.key === key);
    const low = field.type === 'checkbox' ? false : field.min;
    // -180/+180 are the same direction; compare left and right instead.
    const values = key === 'keyLightAzimuth' ? [-75, 75] : [low, field.type === 'checkbox' ? true : field.max];
    await page.evaluate(input => __harmonic.effects(input), { [key]: values[0] });
    await page.evaluate(label => __harmonic.visualSample(label), 'light-low-' + key);
    await page.evaluate(input => __harmonic.effects(input), { [key]: values[1] });
    const pixels = await page.evaluate(key => __harmonic.visualSample('light-high-' + key, 'light-low-' + key), key);
    const invariant = await page.evaluate(() => __harmonic.lightingInvariant());
    check(pixels.difference > 0.0001, `${key} changes actual frozen-frame pixels`, pixels);
    check(JSON.stringify(invariant.cards) === JSON.stringify(stableCards.cards), `${key} leaves lyric cards, type and geometry unchanged`);
    check(invariant.exposure === stableCards.exposure && !invariant.shadowMap,
      `${key} does not alter global exposure or add a shadow-map pass`);
    check(invariant.directions.every(error => error < 1e-6), `${key} keeps ring, cube, tower and mist light direction coherent`, invariant.directions);
    evidence.lightingControls.push({ key, values, difference: pixels.difference, changedFraction: pixels.changedFraction });
  }
  await page.evaluate(() => __harmonic.effects({}));
  await capture('01-lighting-default');
  await capture('01-lighting-detail', { clip: { x: 330, y: 140, width: 780, height: 620 } });
  for (const pose of [{ yaw: 2.3, pitch: .8 }, { yaw: -.7, pitch: -.5 }]) {
    await page.evaluate(input => __harmonic.step(1, { ...input, playing: false }, 0), pose);
    const invariant = await page.evaluate(() => __harmonic.lightingInvariant());
    check(invariant.directions.every(error => error < 1e-6), 'camera drag updates all lighting in the same frame', invariant.directions);
  }
  await page.evaluate(() => __harmonic.step(1, { yaw: 0, pitch: 0, playing: false }, 0));
  await page.evaluate(()=>__harmonic.step(1,{playing:false},0));
  const beforeRingToggle=await page.evaluate(()=>__harmonic.snapshot());
  await page.evaluate(()=>__harmonic.effects({ringsEnabled:false}));
  const hiddenRingGeometry=await page.evaluate(()=>__harmonic.orbitalEvidence());
  const afterRingToggle=await page.evaluate(()=>__harmonic.snapshot());
  check(!hiddenRingGeometry.ringsVisible&&hiddenRingGeometry.cubeVisible&&hiddenRingGeometry.beamsVisible,
    'hiding the rings preserves the cube and independently controlled beams',hiddenRingGeometry);
  check(JSON.stringify(beforeRingToggle.orbital)===JSON.stringify(afterRingToggle.orbital)
    && JSON.stringify(beforeRingToggle.cards)===JSON.stringify(afterRingToggle.cards),
    'ring visibility never moves the cube, particle attachments, or lyric cards');
  check(hiddenRingGeometry.onlyParticleBeams&&hiddenRingGeometry.beamSpread>.1
    &&hiddenRingGeometry.beamSpread<=hiddenRingGeometry.beamRadius+1e-5
    &&hiddenRingGeometry.beamAttachmentError<1e-5,
    'visible GPU geometry is a volumetric particle bundle converging at both attachments',hiddenRingGeometry);
  evidence.hiddenRings=hiddenRingGeometry;
  await capture('01-rings-hidden-particle-beams');
  await capture('01-particle-beams-closeup',{clip:{x:380,y:170,width:680,height:560}});
  await page.evaluate(()=>__harmonic.effects({}));

  evidence.audioBands = [];
  for (const band of ['silent', 'bass', 'mid', 'treble']) {
    const signal = { playing: true, reducedMotion: false, bass: 0, mid: 0, treble: 0, beat: 0, energy: 0 };
    if (band !== 'silent') signal[band] = 1;
    const before = await page.evaluate(() => __harmonic.snapshot());
    const state = await page.evaluate(input => __harmonic.simulate(150, input, 1000 / 60), signal);
    const geometry = await page.evaluate(() => __harmonic.orbitalEvidence());
    checkScene(state, `audio ${band}`);
    check(geometry.faceIds.length === 6 && geometry.tileCount >= 1500,
      `audio ${band}: six actual instanced grid faces are rendered`, geometry.faceIds);
    check([...geometry.sourceErrors, ...geometry.targetErrors, ...geometry.ringErrors].every(value => value < 1e-5),
      `audio ${band}: ray geometry stays fixed to each cube corner and rotating ring wall`, geometry);
    check(geometry.onlyParticleBeams&&geometry.beamSpread>.1&&geometry.beamSpread<=geometry.beamRadius+1e-5
      &&geometry.beamAttachmentError<1e-5&&geometry.beamParticleCount===state.orbital.beamParticleCount,
      `audio ${band}: volumetric flowing particles retain bounded width and exact corner adhesion`,geometry);
    for (const name of ['bass', 'mid', 'treble']) {
      check(name === band ? state.orbital[name] > 0.98 : state.orbital[name] < 0.002,
        `audio ${band}: ${name} response is independently driven`, state.orbital[name]);
      check(Math.abs(geometry.tileBands[`u${name[0].toUpperCase()}${name.slice(1)}`] - state.orbital[name]) < 1e-8,
        `audio ${band}: ${name} reaches the real tile shader`);
    }
    if (band === 'silent') check(state.orbital.time > before.orbital.time
      && JSON.stringify(state.orbital.cubePosition) !== JSON.stringify(before.orbital.cubePosition),
    'silent playback retains breathing float and rotating rings');
    if (band === 'bass') check(state.orbital.rippleAmplitude > .1 && state.orbital.surface.shakeAmount > .5,
      'bass drives synchronized tile flashing with the default surface rise', state.orbital);
    check(geometry.rainImpactOriginsMatch && geometry.rainClockShared && geometry.doubleRingShader
      && geometry.activeImpacts > 0 && geometry.impactsVisible && geometry.splashesVisible,
    `audio ${band}: particle rain creates double-ring impacts and splashes at matching floor origins`, geometry);
    evidence.audioBands.push({ band, orbital: state.orbital, atmosphere: state.atmosphere, geometry });
    await capture(`01-audio-${band}`);
  }
  await page.evaluate(() => __harmonic.step(1, { bass: 0.35, energy: 0.3, mid: 0.24, treble: 0.2, beat: 0.15 }));

  evidence.playing = await page.evaluate(() => __harmonic.simulate(90, {}, 1000 / 60));
  checkScene(evidence.playing, 'playing');
  check(Math.abs(evidence.playing.diagnostics.orbitPhase - evidence.initial.diagnostics.orbitPhase) > 0.001,
    'playing advances the orbit phase');
  check(JSON.stringify(evidence.playing.cards.map(card => card.position)) !== JSON.stringify(evidence.initial.cards.map(card => card.position)),
    'playing changes actual card positions');
  await capture('02-playing');
  await page.evaluate(() => __harmonic.effects({ idleAnimation: true }));
  evidence.idleStart = await page.evaluate(() => __harmonic.step(1, { playing: false }));
  evidence.idleEnd = await page.evaluate(() => __harmonic.simulate(240, { playing: false }, 1000 / 60));
  check(evidence.idleStart.orbital.ringPhase !== evidence.idleEnd.orbital.ringPhase
    && evidence.idleStart.atmosphere.rainTime !== evidence.idleEnd.atmosphere.rainTime
    && evidence.idleStart.towers.breathPhase !== evidence.idleEnd.towers.breathPhase,
    'idle animation continues rings, rain, fog and tower breathing');
  check(evidence.idleEnd.orbital.bass < 0.001, 'paused music energy fades instead of sustaining bass shake');
  check(JSON.stringify(evidence.idleStart.cards.map(card => card.matrix))
    === JSON.stringify(evidence.idleEnd.cards.map(card => card.matrix)),
    'idle decorations never advance paused lyric card matrices');
  await capture('02-idle');
  await page.evaluate(() => __harmonic.effects({ idleAnimation: false }));
  evidence.pausedStart = await page.evaluate(() => __harmonic.step(1, { playing: false }));
  evidence.pausedEnd = await page.evaluate(() => __harmonic.simulate(90, { playing: false }, 1000 / 60));
  check(Math.abs(evidence.pausedStart.diagnostics.orbitPhase - evidence.pausedEnd.diagnostics.orbitPhase) < 1e-9,
    'pause freezes the orbit phase');
  check(evidence.pausedStart.cards.every((card, index) => card.position.every((value, axis) =>
    Math.abs(value - evidence.pausedEnd.cards[index]?.position[axis]) < 0.025)), 'pause keeps card positions stable');
  check(JSON.stringify(evidence.pausedStart.orbital) === JSON.stringify(evidence.pausedEnd.orbital)
    && JSON.stringify(evidence.pausedStart.atmosphere) === JSON.stringify(evidence.pausedEnd.atmosphere),
  'pause freezes the complete orbital and atmosphere state');
  await capture('02-paused');
  evidence.resumed = await page.evaluate(() => __harmonic.simulate(60, { playing: true }, 1000 / 60));
  check(Math.abs(evidence.resumed.diagnostics.orbitPhase - evidence.pausedEnd.diagnostics.orbitPhase) > 0.001,
    'resume restarts the orbit');
  await page.evaluate(() => __harmonic.advanceLine());
  evidence.lineAdvance = await page.evaluate(() => __harmonic.simulate(90, { playing: true }, 1000 / 60));
  check(Math.abs(evidence.lineAdvance.diagnostics.orbitPhase - evidence.resumed.diagnostics.orbitPhase) > 0.4,
    'advancing the lyric key rotates a card into the reading position');
  checkScene(evidence.lineAdvance, 'lyric advance');
  await capture('02-lyric-advance');

  // Turn reduced motion on while a new lyric is still moving into place.
  await page.evaluate(() => __harmonic.step(1, { lyricKey: 'song-a:2', playing: true }));
  evidence.reducedStart = await page.evaluate(() => __harmonic.step(1, { reducedMotion: true }));
  evidence.reducedEnd = await page.evaluate(() => __harmonic.simulate(120, { reducedMotion: true, playing: true }, 1000 / 60));
  check(Math.abs(evidence.reducedStart.diagnostics.orbitPhase - evidence.reducedEnd.diagnostics.orbitPhase) < 1e-9,
    'reduced motion immediately settles an in-flight lyric transition');
  check(JSON.stringify(evidence.reducedStart.cards.map(card => card.matrix)) === JSON.stringify(evidence.reducedEnd.cards.map(card => card.matrix)),
    'reduced motion keeps all card matrices stable during playback');
  check(JSON.stringify(evidence.reducedStart.decorationTimes) === JSON.stringify(evidence.reducedEnd.decorationTimes),
    'reduced motion freezes decorative shader clocks');
  check(JSON.stringify(evidence.reducedStart.orbital) === JSON.stringify(evidence.reducedEnd.orbital)
    && JSON.stringify(atmosphereMotionState(evidence.reducedStart.atmosphere)) === JSON.stringify(atmosphereMotionState(evidence.reducedEnd.atmosphere)),
  'reduced motion freezes the complete orbital and atmosphere state');
  await capture('02-reduced-motion');
  await page.evaluate(() => __harmonic.step(1, { playing: false, reducedMotion: false }));

  evidence.viewControls = [];
  const neutral = await page.evaluate(() => __harmonic.step(1, { yaw: 0, pitch: 0, zoom: 2.35 }, 0));
  for (const changes of [{ yaw: 0.7 }, { yaw: 0, pitch: -0.6 }, { pitch: 0, zoom: 1.7 }]) {
    const state = await page.evaluate(input => __harmonic.step(1, input, 0), changes);
    check(JSON.stringify(state.groupMatrix) !== JSON.stringify(neutral.groupMatrix), 'view control changes the actual group matrix', changes);
    check(state.sceneFinite && state.uniformsFinite, 'view control keeps matrices and uniforms finite', changes);
    evidence.viewControls.push({ changes, matrix: state.groupMatrix });
  }
  await page.evaluate(() => __harmonic.step(1, { yaw: 0, pitch: 0, zoom: 2.35, playing: true }));

  const longLyric = '这是一句超过十八个字的中文歌词，必须完整显示而不能把后半句悄悄截掉。月光穿过透明的玻璃，仍能听见最后一个字。';
  await page.evaluate(text => __harmonic.replaceSong(text, 'long-song', 0.65), longLyric);
  evidence.longText = await page.evaluate(text => __harmonic.textEvidence(text), longLyric);
  const complete = evidence.longText.find(card => card.complete);
  check(!!complete, 'long Chinese lyric is drawn completely without truncation', evidence.longText.map(card => ({ index: card.index, missing: card.missing })));
  check(complete && complete.matched.every(event => event.bounds.left >= -1 && event.bounds.top >= -1
    && event.bounds.right <= complete.width + 1 && event.bounds.bottom <= complete.height + 1),
  'every wrapped Chinese glyph stays inside its canvas', complete?.matched);
  await capture('03-long-chinese');
  await page.evaluate(() => __harmonic.simulate(240, { playing: false, lyricFraction: 0.2 }, 1000 / 60));
  const sung = await page.screenshot();
  await page.evaluate(() => __harmonic.step(1, { lyricFraction: 0.9 }, 0));
  const later = await page.screenshot();
  check(!sung.equals(later), 'lyric fraction changes rendered pixels with the scene clock paused');
  const nextText = '雾气沿着光慢慢流动';
  const resetState = await page.evaluate(text => __harmonic.replaceSong(text, 'switched-song', 0), nextText);
  check(Math.abs(resetState.diagnostics.orbitPhase) < 0.1, 'a new song resets the card orbit to the reading axis');
  evidence.switchedText = await page.evaluate(text => __harmonic.textEvidence(text), nextText);
  check(evidence.switchedText.some(card => card.complete), 'switching the lyric key immediately draws the new song');
  check(evidence.switchedText.every(card => !card.text.includes('月光穿过') && !card.text.includes('悄悄截掉')),
    'switching songs clears old lyrics from all card canvases');
  await capture('04-song-switch');

  evidence.resizes = [];
  evidence.towerLayout = [];
  const expectedAnchors = [
    { x: -16.47, z: -11.5, baseY: -7, height: 20, radius: 1.105 },
    { x: 17.28, z: -13, baseY: -7, height: 22, radius: 1.17 }
  ];
  const nearly = (value, expected) => Number.isFinite(value) && Math.abs(value - expected) < 1e-5;
  for (const [width, height] of [[320, 568], [768, 640], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    const state = await page.evaluate(size => __harmonic.resize(...size), [width, height]);
    checkScene(state, `resize ${width}`);
    check(state.diagnostics.width === width && state.diagnostics.height === height, `resize ${width}: renderer follows host dimensions`);
    check(state.cards.some(card => card.projectedBounds.left >= -1 && card.projectedBounds.right <= 1
      && card.projectedBounds.bottom >= -1 && card.projectedBounds.top <= 1), `resize ${width}: at least one complete reading card remains in frame`);
    const layout = await page.evaluate(() => __harmonic.towerLayout());
    check(layout.anchors.length === 2 && layout.anchors.every((anchor, index) =>
      Object.entries(expectedAnchors[index]).every(([key, value]) => nearly(anchor[key], value))),
    `resize ${width}: two rendered anchors use the approved side positions and radii`, layout.anchors);
    check(layout.towers.every(tower => tower.left >= 0 && tower.right <= width && tower.right > tower.left
      && tower.near >= -1 && tower.far <= 1),
    `resize ${width}: both complete tower silhouettes including halos stay within horizontal viewport bounds`, layout.towers);
    const centerGaps = [layout.central.left - layout.towers[0].right, layout.towers[1].left - layout.central.right];
    check(centerGaps.every(gap => gap > 0) && layout.central.left < width / 2 && layout.central.right > width / 2,
      `resize ${width}: globe stays centered with clear space to both side towers`, { central: layout.central, centerGaps });
    check(layout.instances.length === 26 && layout.anchors.every((anchor, towerIndex) => {
      const owned = layout.instances.filter(instance => instance.towerIndex === towerIndex);
      const body = owned.find(instance => instance.role === 'body');
      const halo = owned.find(instance => instance.role === 'halo');
      const rings = owned.filter(instance => instance.role === 'rings');
      return owned.every(instance => nearly(instance.position[0], anchor.x) && nearly(instance.position[2], anchor.z))
        && [body, halo].every(instance => instance && nearly(instance.position[1], anchor.baseY + anchor.height / 2)
          && nearly(instance.scale[1], anchor.height))
        && nearly(body.scale[0], anchor.radius) && nearly(body.scale[2], anchor.radius)
        && nearly(halo.scale[0], anchor.radius * 1.16) && nearly(halo.scale[2], anchor.radius * 1.16)
        && rings.length === 11 && rings.every((ring, level) => nearly(ring.position[1], anchor.baseY + anchor.height * level / 10)
          && ring.scale.every(value => nearly(value, anchor.radius * 1.015)));
    }), `resize ${width}: body, all rings, and soft halos remain bound to each widened anchor`, layout.instances);
    if (evidence.towerLayout.length) {
      const previous = evidence.towerLayout[0];
      check(JSON.stringify(layout.centralMatrix) === JSON.stringify(previous.centralMatrix)
        && JSON.stringify(layout.cardMatrices) === JSON.stringify(previous.cardMatrices),
      `resize ${width}: responsive framing does not move the globe or paused lyric cards`);
    }
    evidence.towerLayout.push({ ...layout, centerGaps });
    evidence.resizes.push({ width, height, diagnostics: state.diagnostics, projectedBounds: state.cards.map(card => card.projectedBounds) });
    await capture(`05-resize-${width}`);
  }

  evidence.qualityModes = [];
  evidence.qualityBrightness = [];
  await page.evaluate(() => __harmonic.simulate(600, { playing: false }, 1000 / 60));
  if (evidence.initial.effectsApi) {
    // Preserve the original dark-surface calibration at the exact same sample
    // points. New luminous towers and mist deliberately illuminate those points
    // in the default scene, which is still tested against the same RGB limits.
    await page.evaluate(() => __harmonic.effects({ towersEnabled: false, fogEnabled: false, rainEnabled: false,
      ringsEnabled: false, cubeEnabled: false, raysEnabled: false }));
    await page.evaluate(() => __harmonic.quality('native'));
    evidence.darkCalibration = await page.evaluate(() => __harmonic.brightnessSamples());
    check(evidence.darkCalibration.glass.every(sample => Math.max(...sample.mean) < 100),
      'glass samples cover dark interior areas with added lighting disabled', evidence.darkCalibration.glass);
    await page.evaluate(() => __harmonic.effects({}));
  }
  let nativeBrightness;
  for (const [index, mode] of ['native', 'quality', 'performance', 'auto', 'native'].entries()) {
    const state = await page.evaluate(request => __harmonic.quality(request), mode);
    const quality = state.diagnostics.renderQuality;
    check(state.accepted && quality.available && quality.mode === mode, `quality ${mode}: real controller accepts the requested mode`, quality);
    checkScene(state, `quality ${mode}`);
    if (mode === 'native') {
      check(quality.backend === 'direct' && !quality.enabled && !quality.pipelineAllocated,
        'native releases upscale targets and renders directly', quality);
      check(state.previousSurfaceResources === state.releasedSurfaceResources,
        'returning to native releases all display-compositing surface resources', {
          previous: state.previousSurfaceResources, released: state.releasedSurfaceResources
        });
    } else if (quality.softwareRenderer) {
      // The production controller intentionally disables upscaling on software
      // GPUs. Validate that path without calling it hardware acceleration.
      check(quality.backend === 'direct' && !quality.enabled && quality.fallbackReason === 'software-renderer',
        `quality ${mode}: software GPU reports its deliberate direct-render fallback`, quality);
    } else {
      check(quality.webgl2 && quality.backend === 'webgl2-two-pass' && quality.enabled && quality.pipelineAllocated,
        `quality ${mode}: compatible WebGL2 upscaling is genuinely active`, quality);
      check(quality.internalWidth < quality.outputWidth && quality.internalHeight < quality.outputHeight,
        `quality ${mode}: scene renders below output resolution`, quality);
      check(new Set(state.renderPasses.map(pass => pass.target).filter(Boolean)).size >= 3,
        `quality ${mode}: actual rendering visits the backdrop, scene, and upscale targets`, state.renderPasses);
    }
    const pixels = await page.evaluate(() => __harmonic.brightnessSamples());
    check(pixels.glError === 0, `quality ${mode}: framebuffer color samples read successfully`);
    if (!nativeBrightness) {
      nativeBrightness = pixels;
      check(pixels.background.every(sample => Math.max(...sample.mean) < 25), 'background samples cover the dark corner');
      if (evidence.darkCalibration) {
        check(JSON.stringify(pixels.glass.map(sample => sample.bounds)) === JSON.stringify(evidence.darkCalibration.glass.map(sample => sample.bounds)),
          'default effects and dark calibration use exactly the same glass sample coordinates');
      } else {
        check(pixels.glass.every(sample => Math.max(...sample.mean) < 100), 'glass samples cover dark interior areas', pixels.glass);
      }
    }
    const deltas = {};
    for (const [kind, limit] of [['background', 3], ['glass', 10]]) {
      deltas[kind] = pixels[kind].map((sample, sampleIndex) => ({
        label: sample.label,
        rgb: sample.mean.map((value, channel) => Math.abs(value - nativeBrightness[kind][sampleIndex].mean[channel]))
      }));
      check(deltas[kind].every(sample => sample.rgb.every(delta => delta <= limit)),
        `quality ${mode}: ${kind} RGB means stay within ${limit} levels of paused native rendering`, deltas[kind]);
    }
    evidence.qualityBrightness.push({ mode, pixels, deltas });
    await capture(`07-quality-${index}-${mode}`);
    const resized = await page.evaluate(() => __harmonic.resize(768, 480));
    check(resized.renderTargetNull && resized.diagnostics.renderQuality.outputWidth === 768
      && resized.diagnostics.renderQuality.outputHeight === 480,
    `quality ${mode}: resize updates output dimensions and restores the framebuffer`, resized.diagnostics.renderQuality);
    evidence.qualityModes.push({ mode, diagnostics: quality, renderPasses: state.renderPasses, resized: resized.diagnostics.renderQuality });
    await page.evaluate(() => __harmonic.resize(1440, 900));
  }
  evidence.qualityCoverage = evidence.qualityModes.some(item => item.diagnostics.enabled)
    ? 'WebGL2 two-pass upscaling and native fallback exercised'
    : 'Software-renderer fallback exercised; hardware upscaling not covered on this GPU';

  if (evidence.initial.effectsApi && evidence.initial.atmosphere && evidence.initial.towers) {
    await page.evaluate(() => __harmonic.effects({}));
    await page.evaluate(() => __harmonic.simulate(120, { playing: false, bass: 0, beat: 0, energy: 0 }, 1000 / 60));
    evidence.fogDefault = await page.evaluate(() => __harmonic.visualSample('fog-default'));
    await capture('08-default-fog');
    await page.evaluate(() => __harmonic.effects({ fogEnabled: false }));
    evidence.fogDisabled = await page.evaluate(() => __harmonic.visualSample('fog-disabled', 'fog-default'));
    check(evidence.fogDisabled.difference > 0.15 && evidence.fogDisabled.changedFraction > 0.005,
      'turning fog off visibly changes the real scene', evidence.fogDisabled);
    check(evidence.fogDefault.lyricSamples >= 30 && evidence.fogDefault.lyricLuminance >= evidence.fogDisabled.lyricLuminance * 0.85,
      'default fog preserves the brightness of opaque current-lyric glyphs', {
        samples: evidence.fogDefault.lyricSamples, fog: evidence.fogDefault.lyricLuminance, clear: evidence.fogDisabled.lyricLuminance
      });
    await capture('08-no-fog');
    await page.evaluate(() => __harmonic.effects({}));
    const frozenScene = await page.evaluate(() => __harmonic.snapshot());
    await page.evaluate(() => __harmonic.advanceFog(12));
    const fogOnlyAdvanced = await page.evaluate(() => __harmonic.snapshot());
    evidence.fogSceneMotion = await page.evaluate(() => __harmonic.visualSample('fog-scene-12s', 'fog-default'));
    check(JSON.stringify(frozenScene.cards.map(card => card.matrix)) === JSON.stringify(fogOnlyAdvanced.cards.map(card => card.matrix))
      && JSON.stringify(frozenScene.towers) === JSON.stringify(fogOnlyAdvanced.towers)
      && JSON.stringify(frozenScene.orbital) === JSON.stringify(fogOnlyAdvanced.orbital)
      && frozenScene.atmosphere.rainTime === fogOnlyAdvanced.atmosphere.rainTime,
    'isolated fog advancement leaves cards, towers, orbital core, and rain clocks unchanged');
    check(evidence.fogSceneMotion.difference > 0.15 && evidence.fogSceneMotion.changedFraction > 0.005,
      'advancing only fog time changes visible scene pixels', evidence.fogSceneMotion);

    await page.evaluate(() => __harmonic.effects({ rainEnabled: false }));
    await page.evaluate(() => __harmonic.mistOnly(true));
    evidence.mistMotion = [{ seconds: 0, ...await page.evaluate(() => __harmonic.visualSample('mist-0')) }];
    await capture('09-mist-only-00s');
    await capture('09-mist-closeup-00s', { clip: { x: 0, y: 150, width: 800, height: 700 } });
    for (const seconds of [3, 6, 9, 12]) {
      await page.evaluate(() => __harmonic.advanceFog(3));
      const pixels = await page.evaluate(label => __harmonic.visualSample(label, 'mist-0'), `mist-${seconds}`);
      evidence.mistMotion.push({ seconds, ...pixels });
      await capture(`09-mist-only-${String(seconds).padStart(2, '0')}s`);
    }
    await capture('09-mist-closeup-12s', { clip: { x: 0, y: 150, width: 800, height: 700 } });
    const mistEnd = evidence.mistMotion.at(-1);
    check(mistEnd.deviation > 1 && mistEnd.shades >= 16, 'mist has spatial density detail rather than a flat overlay', mistEnd);
    check(mistEnd.difference > 0.15 && mistEnd.brighterFraction > 0.005 && mistEnd.darkerFraction > 0.005,
      'twelve seconds of mist motion produces both brightening and darkening in different pixels', mistEnd);
    if (process.argv.includes('--record-orbital')) {
      // Render each consecutive scene frame with the ordinary production update.
      await page.evaluate(() => __harmonic.mistOnly(false));
      await page.evaluate(() => __harmonic.effects({}));
      const ffmpeg = 'E:/Tools/ffmpeg/bin/ffmpeg.exe';
      assert.ok(existsSync(ffmpeg), 'FFmpeg is required to record the requested motion preview');
      const file = path.join(output, 'orbital-motion-6s.mp4');
      const encoder = spawn(ffmpeg, [
        '-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-i', 'pipe:0',
        '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file
      ], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
      let encodingError = '';
      encoder.stderr.on('data', chunk => { encodingError = (encodingError + chunk).slice(-8000); });
      const completed = new Promise((resolve, reject) => { encoder.once('error', reject); encoder.once('close', resolve); });
      try {
        for (let index = 0; index < 180; index += 1) {
          await page.evaluate(index => __harmonic.step(1, { playing: true, reducedMotion: false,
            bass: 0.3 + 0.25 * Math.sin(index * 0.14), mid: 0.3, treble: 0.2 }, 1000 / 30), index);
          const framePng = await page.screenshot({ type: 'png' });
          if (!encoder.stdin.write(framePng)) await once(encoder.stdin, 'drain');
        }
      } finally {
        encoder.stdin.end();
      }
      const code = await completed;
      check(code === 0, 'six-second orbital preview encodes successfully', encodingError);
      evidence.orbitalVideo = { file, frames: 180, fps: 30, seconds: 6, source: '180 consecutive real scene frames; no interpolation' };
      await page.evaluate(() => __harmonic.effects({ rainEnabled: false }));
      await page.evaluate(() => __harmonic.mistOnly(true));
    }
    // Isolate the fog clock from residual audio amplitude after motion recording.
    await page.evaluate(() => __harmonic.effects({ rainEnabled: false, coldAirEnabled: false, fogSpeed: 0, audioReactive: false }));
    await page.evaluate(() => __harmonic.visualSample('mist-zero-speed'));
    const speedZeroStart = await page.evaluate(() => __harmonic.snapshot());
    await page.evaluate(() => __harmonic.advanceFog(12));
    evidence.mistSpeedZero = await page.evaluate(() => __harmonic.visualSample('mist-zero-speed-later', 'mist-zero-speed'));
    check(evidence.mistSpeedZero.difference === 0, 'fog speed zero freezes actual mist pixels', evidence.mistSpeedZero);
    check((await page.evaluate(() => __harmonic.snapshot())).atmosphere.time === speedZeroStart.atmosphere.time,
      'fog speed zero freezes its time accumulator');
    await page.evaluate(() => __harmonic.mistOnly(false));
    await page.evaluate(() => __harmonic.effects({}));
    const pausedFog = await page.evaluate(() => __harmonic.snapshot());
    const pausedLater = await page.evaluate(() => __harmonic.simulate(90, { playing: false }, 1000 / 60));
    check(JSON.stringify(atmosphereMotionState(pausedFog.atmosphere)) === JSON.stringify(atmosphereMotionState(pausedLater.atmosphere))
      && JSON.stringify(pausedFog.orbital) === JSON.stringify(pausedLater.orbital)
      && pausedFog.towers.breathPhase === pausedLater.towers.breathPhase,
      'pause freezes orbital core, rain, fog, and tower breathing clocks');
    const reducedFog = await page.evaluate(() => __harmonic.step(1, { playing: true, reducedMotion: true }));
    const reducedEffectsBefore = await page.evaluate(() => __harmonic.effectGeometryAndUniforms());
    const reducedLater = await page.evaluate(() => __harmonic.simulate(90, {
      playing: true, reducedMotion: true, bass: 1, beat: 1, energy: 1
    }, 1000 / 60));
    check(reducedFog.atmosphere.time === reducedLater.atmosphere.time
      && reducedFog.towers.flowPosition === reducedLater.towers.flowPosition
      && reducedFog.towers.colorPhase === reducedLater.towers.colorPhase,
    'reduced motion freezes fog, tower flow, and color phases');
    check(JSON.stringify(reducedEffectsBefore) === JSON.stringify(await page.evaluate(() => __harmonic.effectGeometryAndUniforms())),
      'reduced motion prevents changing audio from flashing orbital, rain, fog, or tower materials');
    await page.evaluate(() => __harmonic.step(1, { playing: true, reducedMotion: false, bass: 0.65, mid: 0.45, treble: 0.35, beat: 0.3, energy: 0.5 }));

    const schema = await page.evaluate(() => __harmonic.settingsSchema());
    check(schema.length === 95, 'all ninety-five current orbital effect controls are exercised', schema.length);
    const speedFields = {
      breathSpeed: { section: 'towers', field: 'breathPhase', period: Math.PI * 2 },
      flowSpeed: { section: 'towers', field: 'flowPosition', period: 1 },
      colorSpeed: { section: 'towers', field: 'colorPhase', period: 3 },
      fogSpeed: { section: 'atmosphere', field: 'time', period: Infinity },
      rainSpeed: { section: 'atmosphere', field: 'rainTime', period: Infinity },
      ringSpeed: { section: 'orbital', field: 'ringPhase', period: Infinity },
      floatSpeed: { section: 'orbital', field: 'floatPhase', period: Infinity },
      raySpeed: { section: 'orbital', field: 'particlePhase', period: Infinity },
      flashSpeed: { section: 'orbital', field: 'flashClock', period: Infinity },
      shakeFrequency: { section: 'orbital', field: 'shakePhase', period: Infinity },
      waterSpeed: { section: 'atmosphere', field: 'water.time', period: Infinity }
    };
    evidence.effectControls = [];
    for (const descriptor of schema) {
      const key = descriptor.key;
      if (speedFields[key] || key === 'flowDirection') continue;
      if (key === 'idleAnimation') {
        const phases = [];
        for (const value of [false, true]) {
          await page.evaluate(input => __harmonic.effects({ idleAnimation: input }), value);
          const before = await page.evaluate(() => __harmonic.step(1, { playing: false }, 0));
          const after = await page.evaluate(() => __harmonic.simulate(30, { playing: false }, 1000 / 60));
          phases.push(after.orbital.ringPhase - before.orbital.ringPhase);
          check(after.effects.idleAnimation === value, 'idle toggle reaches the normalized runtime config');
        }
        check(phases[0] === 0 && phases[1] > 0, 'idle animation toggle changes paused decorative motion', phases);
        evidence.effectControls.push({ key, phases });
        continue;
      }
      const baseline = key.startsWith('color') && key !== 'colorMode' ? { colorMode: 'custom' }
        : ['towerColor', 'cubeColor', 'fogColor', 'coldAirColor'].includes(key) ? { [key + 'Mode']: 'custom' }
          : ['rippleStrength', 'bassRiseStrength'].includes(key) ? { surfaceRiseEnabled: true } : {};
      await page.evaluate(input => __harmonic.effects(input), baseline);
      await page.evaluate(playing => __harmonic.simulate(30, { playing }, 1000 / 60), key !== 'rippleStrength');
      const before = await page.evaluate(() => __harmonic.effectGeometryAndUniforms());
      const value = descriptor.type === 'checkbox' ? !descriptor.defaultValue
        : descriptor.type === 'range' ? descriptor.max
          : descriptor.type === 'color' ? '#ff3600'
            : descriptor.options.find(option => option.value !== descriptor.defaultValue).value;
      const afterState = await page.evaluate(input => __harmonic.effects(input), { ...baseline, [key]: value });
      if (['bassGain', 'midGain', 'trebleGain'].includes(key)) {
        const settled = await page.evaluate(() => __harmonic.simulate(90, { playing: true }, 1000 / 60));
        const band = key.replace('Gain', '');
        check(settled.orbital[band] > ({ bass: 0.65, mid: 0.45, treble: 0.35 }[band]) * 1.8,
          `effect ${key} amplifies the matching core audio band`, settled.orbital);
      }
      const after = await page.evaluate(() => __harmonic.effectGeometryAndUniforms());
      check(JSON.stringify(before) !== JSON.stringify(after), `effect ${key} changes actual uniforms, geometry, or visibility`);
      check(afterState.effects[key] === value, `effect ${key} reaches the normalized runtime config`);
      evidence.effectControls.push({ key, value, changed: JSON.stringify(before) !== JSON.stringify(after) });
    }
    for (const [key, phase] of Object.entries(speedFields)) {
      const descriptor = schema.find(item => item.key === key);
      const advances = [];
      for (const value of [descriptor.min, descriptor.max]) {
        await page.evaluate(input => __harmonic.effects(input), { [key]: value });
        const before = await page.evaluate(() => __harmonic.snapshot());
        const after = await page.evaluate(() => __harmonic.simulate(2, { playing: true }, 50));
        const readPhase = value => phase.field.split('.').reduce((current, key) => current[key], value[phase.section]);
        let change = readPhase(after) - readPhase(before);
        if (Number.isFinite(phase.period) && change < 0) change += phase.period;
        advances.push(change);
      }
      check(advances[1] > advances[0] * 2 + 0.001, `effect ${key} changes the measured animation rate`, advances);
      evidence.effectControls.push({ key, advances });
    }
    evidence.flowDirections = [];
    for (const direction of ['up', 'down']) {
      await page.evaluate(input => __harmonic.effects(input), { flowDirection: direction, flowSpeed: 3 });
      const before = await page.evaluate(() => __harmonic.snapshot());
      const after = await page.evaluate(() => __harmonic.simulate(2, { playing: true }, 50));
      const delta = ((after.towers.flowPosition - before.towers.flowPosition + 1.5) % 1) - 0.5;
      check(direction === 'up' ? delta > 0 : delta < 0, `flow ${direction} moves the band in the requested direction`, delta);
      evidence.flowDirections.push({ direction, delta });
    }
    await page.evaluate(() => __harmonic.effects({ flowDirection: 'alternate', flowSpeed: 3 }));
    const alternateDirections = new Set();
    for (let index = 0; index < 20; index += 1) {
      const state = await page.evaluate(() => __harmonic.simulate(8, { playing: true }, 80));
      alternateDirections.add(state.towers.flowDirection);
    }
    check(alternateDirections.has(1) && alternateDirections.has(-1), 'alternate flow reverses at both ends of the tower', [...alternateDirections]);
    evidence.flowDirections.push({ direction: 'alternate', observed: [...alternateDirections] });
    evidence.invalidEffects = await page.evaluate(() => {
      const invalid = Object.fromEntries(FeHarmonicSettings.schema.map(field => [field.key,
        field.type === 'range' ? Number.NaN : field.type === 'checkbox' ? 'true' : 'invalid']));
      const state = __harmonic.effects(invalid);
      return { defaultsRestored: FeHarmonicSettings.schema.every(field => state.effects[field.key] === FeHarmonicSettings.defaults[field.key]), state };
    });
    check(evidence.invalidEffects.defaultsRestored && evidence.invalidEffects.state.uniformsFinite,
      'invalid numbers, booleans, colors, and enums normalize to finite renderable defaults');
    const frameEffects = await page.evaluate(() => __harmonic.effects({ fogDensity: 0.21, flowDirection: 'down' }, true));
    check(frameEffects.effects.fogDensity === 0.21 && frameEffects.effects.flowDirection === 'down',
      'frame.effects applies through the same normalization contract');
    await page.evaluate(() => __harmonic.effects({}));
    await page.evaluate(() => __harmonic.step(1, { playing: false, bass: 0, beat: 0, energy: 0 }));
  }

  evidence.palette = await page.evaluate(() => __harmonic.palette([{ r: 220, g: 110, b: 100 }, { r: 140, g: 210, b: 255 }, { r: 110, g: 255, b: 180 }]));
  checkScene(evidence.palette, 'palette update');
  // Advance the complete update path while sampling real WebGL at each 30-second
  // boundary. Suppress only this test-owned renderer between samples to avoid
  // spending minutes drawing thousands of redundant frames on software GPUs.
  const longRunStart = await page.evaluate(() => __harmonic.resize(96, 96));
  const trajectory = [];
  for (let batch = 0; batch < 10; batch += 1) {
    const state = await page.evaluate(() => __harmonic.simulate(375, { playing: true }, 80));
    checkScene(state, `long run ${(batch + 1) * 30}s`);
    check(state.gpuMemory.geometries === longRunStart.gpuMemory.geometries
      && state.gpuMemory.textures === longRunStart.gpuMemory.textures,
    `long run ${(batch + 1) * 30}s: GPU geometry and texture counts remain constant`, {
      initial: longRunStart.gpuMemory, current: state.gpuMemory
    });
    trajectory.push({ simulatedSeconds: (batch + 1) * 30, phase: state.diagnostics.orbitPhase,
      positions: state.cards.map(card => card.position), gpuMemory: state.gpuMemory });
  }
  evidence.longRun = { simulatedSeconds: 300, initialGpuMemory: longRunStart.gpuMemory, trajectory };
  check(trajectory.every(sample => sample.positions.every(position => Math.abs(position[1]) < 4)), '300 simulated seconds never sends cards upward out of frame');
  await page.evaluate(() => __harmonic.resize(1440, 900));
  await capture('06-after-300-seconds');
  evidence.dispose = await page.evaluate(() => __harmonic.finish());
  check(evidence.dispose.first === true && evidence.dispose.second === false, 'dispose is idempotent', evidence.dispose);
  check(evidence.dispose.canvasCount === 0 && evidence.dispose.diagnostics.disposed === true, 'dispose removes the renderer canvas');
  check(evidence.dispose.ownedResources > 0 && evidence.dispose.ownedResources === evidence.dispose.releasedResources
    && evidence.dispose.allReleasedExactlyOnce,
    'dispose releases every orbital, atmosphere, gallery, and backdrop GPU resource exactly once', evidence.dispose);
  check(evidence.dispose.backdropReleased
    && evidence.dispose.cubeEnvironments === evidence.dispose.releasedCubeEnvironments,
  'dispose releases the shared refraction target and any owned cube environment', evidence.dispose);
  check(evidence.dispose.contextListeners === 0, 'dispose removes all WebGL context event listeners', evidence.dispose);
  check(evidence.dispose.updateAfterDispose === false, 'disposed runtime ignores subsequent updates');
  evidence.recreated = await page.evaluate(() => __harmonic.recreate({ fogEnabled: false, towersEnabled: false, flowDirection: 'down' }));
  checkScene(evidence.recreated, 'recreated runtime');
  if (evidence.initial.effectsApi) check(evidence.recreated.effects.fogEnabled === false
    && evidence.recreated.effects.towersEnabled === false && evidence.recreated.effects.flowDirection === 'down',
  'create effects uses the shared normalized config');
  check(evidence.recreated.canvasCount === 1 && evidence.recreated.contextListeners === evidence.initial.contextListeners,
    'recreating the runtime does not accumulate canvases or context listeners', evidence.recreated.contextListeners);
  evidence.recreatedQuality = await page.evaluate(() => __harmonic.quality('quality'));
  checkScene(evidence.recreatedQuality, 'recreated runtime with quality enabled');
  evidence.recreatedDispose = await page.evaluate(() => __harmonic.finish());
  check(evidence.recreatedDispose.canvasCount === 0 && evidence.recreatedDispose.contextListeners === 0
    && evidence.recreatedDispose.ownedResources === evidence.recreatedDispose.releasedResources,
  'recreated runtime releases all resources and listeners again', evidence.recreatedDispose);
  if (evidence.recreatedQuality.diagnostics.renderQuality.enabled) {
    check(evidence.recreatedDispose.qualitySurfaceResources === 3
      && evidence.recreatedDispose.releasedQualitySurfaceResources === 3,
    'disposing directly from active quality releases its target, geometry, and material', evidence.recreatedDispose);
  }
  check((await page.evaluate(() => __harmonic.errors)).length === 0, 'fixture has no uncaught asynchronous errors');
} catch (error) {
  failures.push({ message: String(error.stack || error.message || error) });
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
check(consoleErrors.length === 0, 'browser console has no errors', consoleErrors);
check(shaderErrors.length === 0, 'WebGL shaders compile and link without errors', shaderErrors);
check(networkErrors.length === 0, 'all fixture requests complete successfully', networkErrors);
const result = { pass: failures.length === 0, failures, consoleErrors, shaderErrors, networkErrors, screenshots, evidence };
writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ pass: result.pass, failures, screenshots, result: path.join(output, 'result.json') }, null, 2));
if (!result.pass) process.exitCode = 1;
