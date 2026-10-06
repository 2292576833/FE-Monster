(function installLyricHighlightParticles(global) {
  'use strict';

  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    size: 0.75,
    density: 78,
    sensitivity: 68,
    spread: 56,
    color: '#eafbff'
  });
  const PROFILE_CAPACITY = Object.freeze({
    high: 840,
    balanced: 600,
    economy: 360,
    mobile: 260,
    low: 180
  });
  const MAX_POOL_SIZE = 840;
  const ATTACK_MS = 55;
  const RELEASE_MS = 220;
  const MAX_CANVAS_PIXELS_PER_LAYER = 1600000;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function normalizeColor(value, fallback = DEFAULT_SETTINGS.color) {
    const text = String(value || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(text) ? text : fallback;
  }

  function normalizeSettings(source = {}) {
    return {
      enabled: source.enabled !== false,
      size: Number(clamp(source.size ?? DEFAULT_SETTINGS.size, 0.35, 2.4).toFixed(2)),
      density: Math.round(clamp(source.density ?? DEFAULT_SETTINGS.density, 0, 100)),
      sensitivity: Math.round(clamp(source.sensitivity ?? DEFAULT_SETTINGS.sensitivity, 20, 100)),
      spread: Math.round(clamp(source.spread ?? DEFAULT_SETTINGS.spread, 0, 100)),
      color: normalizeColor(source.color)
    };
  }

  function particleDrive(lowFrequency, sensitivity = DEFAULT_SETTINGS.sensitivity) {
    const low = clamp(lowFrequency, 0, 1);
    if (low <= 0) return 0;
    const normalizedSensitivity = clamp(sensitivity, 20, 100) / 100;
    const gate = 0.055 - normalizedSensitivity * 0.045;
    const position = clamp((low - gate) / Math.max(0.001, 1 - gate), 0, 1);
    const smooth = position * position * (3 - 2 * position);
    return clamp(Math.pow(smooth, 0.72), 0, 1);
  }

  function nextEnvelope(current, target, deltaMs, attackMs = ATTACK_MS, releaseMs = RELEASE_MS) {
    const safeCurrent = clamp(current, 0, 1);
    const safeTarget = clamp(target, 0, 1);
    const duration = safeTarget > safeCurrent ? Math.max(1, attackMs) : Math.max(1, releaseMs);
    const coefficient = 1 - Math.exp(-clamp(deltaMs, 0, 100) / duration);
    return clamp(safeCurrent + (safeTarget - safeCurrent) * coefficient, 0, 1);
  }

  function particleBudget(density, profile = 'balanced', reducedMotion = false) {
    const capacity = PROFILE_CAPACITY[profile] || PROFILE_CAPACITY.balanced;
    const budget = Math.round(capacity * clamp(density, 0, 100) / 100);
    return reducedMotion ? Math.min(48, budget) : Math.min(MAX_POOL_SIZE, budget);
  }

  function create(options = {}) {
    const THREE = global.THREE;
    if (!THREE?.WebGLRenderer || !THREE?.Points || !THREE?.ShaderMaterial) {
      throw new Error('Three.js is required for 3D lyric highlight particles');
    }

    const canvas = options.canvas || options.frontCanvas || null;
    if (!canvas) {
      throw new Error('A transparent WebGL canvas is required for 3D lyric particles');
    }

    const rendererOptions = {
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: 'high-performance',
      premultipliedAlpha: true,
      preserveDrawingBuffer: false
    };
    const createRenderer = typeof options.createRenderer === 'function'
      ? options.createRenderer
      : (nextOptions) => new THREE.WebGLRenderer(nextOptions);
    const renderer = createRenderer(rendererOptions);
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    if ('outputEncoding' in renderer && THREE.sRGBEncoding) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }

    const positions = new Float32Array(MAX_POOL_SIZE * 3);
    const velocities = new Float32Array(MAX_POOL_SIZE * 3);
    const life = new Float32Array(MAX_POOL_SIZE);
    const totalLife = new Float32Array(MAX_POOL_SIZE);
    const sizes = new Float32Array(MAX_POOL_SIZE);
    const alphas = new Float32Array(MAX_POOL_SIZE);
    const depths = new Float32Array(MAX_POOL_SIZE);
    const phases = new Float32Array(MAX_POOL_SIZE);

    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    const sizeAttribute = new THREE.BufferAttribute(sizes, 1);
    const alphaAttribute = new THREE.BufferAttribute(alphas, 1);
    const depthAttribute = new THREE.BufferAttribute(depths, 1);
    if (THREE.DynamicDrawUsage) {
      positionAttribute.setUsage(THREE.DynamicDrawUsage);
      sizeAttribute.setUsage(THREE.DynamicDrawUsage);
      alphaAttribute.setUsage(THREE.DynamicDrawUsage);
      depthAttribute.setUsage(THREE.DynamicDrawUsage);
    }
    geometry.setAttribute('position', positionAttribute);
    geometry.setAttribute('aSize', sizeAttribute);
    geometry.setAttribute('aAlpha', alphaAttribute);
    geometry.setAttribute('aDepth', depthAttribute);
    geometry.setDrawRange(0, 0);

    const sharedUniforms = {
      uColor: { value: new THREE.Color(DEFAULT_SETTINGS.color) },
      uPixelRatio: { value: 1 },
      uPointScale: { value: 1 }
    };
    const vertexShader = `
      attribute float aSize;
      attribute float aAlpha;
      attribute float aDepth;
      uniform float uPixelRatio;
      uniform float uPointScale;
      varying float vAlpha;
      varying float vDepth;

      void main() {
        float perspectiveSize = mix(0.72, 1.24, clamp((aDepth + 1.0) * 0.5, 0.0, 1.0));
        vAlpha = aAlpha;
        vDepth = aDepth;
        vec4 modelPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * uPixelRatio * uPointScale * perspectiveSize, 1.0, 9.0);
        gl_Position = projectionMatrix * modelPosition;
      }
    `;
    const fragmentShader = `
      uniform vec3 uColor;
      varying float vAlpha;
      varying float vDepth;

      void main() {
        vec2 centered = gl_PointCoord - vec2(0.5);
        float radius = length(centered);
        float core = 1.0 - smoothstep(0.055, 0.27, radius);
        float halo = (1.0 - smoothstep(0.16, 0.5, radius)) * 0.5;
        float alpha = min(1.0, (core * 1.18 + halo) * vAlpha);
        if (alpha < 0.004) discard;
        vec3 hotColor = mix(uColor, vec3(1.0), core * 0.48 + max(vDepth, 0.0) * 0.16);
        gl_FragColor = vec4(hotColor, alpha);
      }
    `;

    const material = new THREE.ShaderMaterial({
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      fragmentShader,
      transparent: true,
      uniforms: sharedUniforms,
      vertexColors: false,
      vertexShader
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(points);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500);
    camera.position.z = 180;

    let settings = normalizeSettings(options.settings);
    let profile = PROFILE_CAPACITY[options.profile] ? options.profile : 'balanced';
    let reducedMotion = options.reducedMotion === true;
    const maxPixelRatio = clamp(options.maxPixelRatio ?? 2, 1, 2);
    let target = null;
    let host = null;
    let previousHost = null;
    let observer = null;
    let textRange = null;
    let boundsDirty = true;
    let canvasWidth = 1;
    let canvasHeight = 1;
    let pixelRatio = 1;
    let rendererWidth = 0;
    let rendererHeight = 0;
    let rendererRatio = 0;
    let targetWidth = 1;
    let targetHeight = 1;
    let emitterOffsetX = 0;
    let emitterOffsetY = 0;
    let activeCount = 0;
    let frontCount = 0;
    let backCount = 0;
    let envelope = 0;
    let currentDrive = 0;
    let emissionRemainder = 0;
    let randomState = 0x5f3759df;
    let emittedTotal = 0;
    let suspended = true;
    let hasContent = false;
    let contextLost = false;
    const lostContexts = new Set();
    let renderCalls = 0;
    let staticDirtyStart = MAX_POOL_SIZE;
    let staticDirtyEnd = 0;

    sharedUniforms.uColor.value.set(settings.color);

    function random() {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4294967296;
    }

    function markBoundsDirty() {
      boundsDirty = true;
    }

    function attachObserver() {
      if (typeof global.ResizeObserver !== 'function') return;
      observer = new global.ResizeObserver(markBoundsDirty);
    }
    attachObserver();
    global.addEventListener?.('resize', markBoundsDirty, { passive: true });

    function moveCanvases(nextHost) {
      if (!nextHost || host === nextHost) return;
      previousHost?.classList?.remove('has-three-lyric-particles');
      host = nextHost;
      previousHost = nextHost;
      host.classList?.add('has-three-lyric-particles');
      host.prepend(canvas);
      boundsDirty = true;
      suspended = true;
    }

    function setTarget(nextTarget, nextHost = nextTarget?.parentElement || options.scene || null) {
      const targetChanged = target !== nextTarget;
      const hostChanged = host !== nextHost;
      if (!targetChanged && !hostChanged) return;
      if (observer && target) observer.unobserve(target);
      if (observer && host && host !== target) observer.unobserve(host);
      textRange?.detach?.();
      textRange = null;
      target = nextTarget || null;
      if (hostChanged) moveCanvases(nextHost);
      if (observer && target) observer.observe(target);
      if (observer && host && host !== target) observer.observe(host);
      boundsDirty = true;
    }

    function setSettings(nextSettings) {
      const previousSpread = settings.spread;
      settings = normalizeSettings(nextSettings);
      sharedUniforms.uColor.value.set(settings.color);
      if (settings.spread !== previousSpread) boundsDirty = true;
    }

    function setColor(nextColor) {
      settings.color = normalizeColor(nextColor);
      sharedUniforms.uColor.value.set(settings.color);
    }

    function setProfile(nextProfile) {
      profile = PROFILE_CAPACITY[nextProfile] ? nextProfile : 'balanced';
    }

    function setReducedMotion(nextReducedMotion) {
      reducedMotion = nextReducedMotion === true;
    }

    function measuredTargetRect() {
      const fallback = target?.getBoundingClientRect?.();
      const ownerDocument = target?.ownerDocument;
      if (!fallback || !ownerDocument?.createRange || !String(target.textContent || '').trim()) {
        return fallback;
      }
      try {
        textRange ||= ownerDocument.createRange();
        textRange.selectNodeContents(target);
        const measured = textRange.getBoundingClientRect();
        if (measured.width > 1 && measured.height > 1) return measured;
      } catch {}
      return fallback;
    }

    function rendererPixelRatio(width, height) {
      const nativeRatio = clamp(global.devicePixelRatio || 1, 1, maxPixelRatio);
      const areaLimit = Math.sqrt(MAX_CANVAS_PIXELS_PER_LAYER / Math.max(1, width * height));
      return clamp(Math.min(nativeRatio, areaLimit), 1, maxPixelRatio);
    }

    function resizeRenderer(renderer, width, height, ratio) {
      const sizeChanged = width !== rendererWidth || height !== rendererHeight;
      if (ratio !== rendererRatio) {
        renderer.setPixelRatio(ratio);
        rendererRatio = ratio;
      }
      if (sizeChanged) {
        renderer.setSize(width, height, false);
        renderer.domElement.style.width = `${width}px`;
        renderer.domElement.style.height = `${height}px`;
        rendererWidth = width;
        rendererHeight = height;
      }
    }

    function refreshBounds() {
      if (!boundsDirty || !host || !target) return;
      boundsDirty = false;
      const hostRect = host.getBoundingClientRect?.();
      const targetRect = measuredTargetRect();
      if (!hostRect || !targetRect || hostRect.width <= 0 || hostRect.height <= 0) return;
      const localHostWidth = Math.max(1, host.clientWidth || host.offsetWidth || hostRect.width);
      const localHostHeight = Math.max(1, host.clientHeight || host.offsetHeight || hostRect.height);
      const scaleX = Math.max(0.05, hostRect.width / localHostWidth);
      const scaleY = Math.max(0.05, hostRect.height / localHostHeight);
      targetWidth = clamp(targetRect.width / scaleX, 12, localHostWidth * 1.32);
      targetHeight = clamp(targetRect.height / scaleY, 12, Math.max(180, localHostHeight));
      emitterOffsetX = (targetRect.left + targetRect.width * 0.5 - hostRect.left - hostRect.width * 0.5) / scaleX;
      emitterOffsetY = -(targetRect.top + targetRect.height * 0.5 - hostRect.top - hostRect.height * 0.5) / scaleY;
      const spread = settings.spread / 100;
      const paddingX = clamp(54 + targetHeight * 0.55 + spread * 90, 72, 190);
      const paddingY = clamp(38 + targetHeight * 0.45 + spread * 70, 54, 138);
      canvasWidth = Math.round(clamp(targetWidth + paddingX * 2, 280, 1480));
      canvasHeight = Math.round(clamp(targetHeight + paddingY * 2, 180, 540));
      pixelRatio = rendererPixelRatio(canvasWidth, canvasHeight);
      resizeRenderer(renderer, canvasWidth, canvasHeight, pixelRatio);
      camera.left = -canvasWidth * 0.5;
      camera.right = canvasWidth * 0.5;
      camera.top = canvasHeight * 0.5;
      camera.bottom = -canvasHeight * 0.5;
      camera.updateProjectionMatrix();
      sharedUniforms.uPixelRatio.value = pixelRatio;
      sharedUniforms.uPointScale.value = clamp(1.46 + pixelRatio * 0.16, 1.5, 1.82);
      suspended = false;
    }

    function copyParticle(source, destination) {
      const source3 = source * 3;
      const destination3 = destination * 3;
      positions[destination3] = positions[source3];
      positions[destination3 + 1] = positions[source3 + 1];
      positions[destination3 + 2] = positions[source3 + 2];
      velocities[destination3] = velocities[source3];
      velocities[destination3 + 1] = velocities[source3 + 1];
      velocities[destination3 + 2] = velocities[source3 + 2];
      life[destination] = life[source];
      totalLife[destination] = totalLife[source];
      sizes[destination] = sizes[source];
      alphas[destination] = alphas[source];
      depths[destination] = depths[source];
      phases[destination] = phases[source];
      staticDirtyStart = Math.min(staticDirtyStart, destination);
      staticDirtyEnd = Math.max(staticDirtyEnd, destination + 1);
    }

    function removeParticle(index) {
      const last = activeCount - 1;
      if (index !== last) copyParticle(last, index);
      activeCount = Math.max(0, last);
    }

    function spawnParticle() {
      if (activeCount >= MAX_POOL_SIZE || targetWidth <= 0 || targetHeight <= 0) return;
      const index = activeCount;
      const index3 = index * 3;
      activeCount += 1;
      const spread = settings.spread / 100;
      const angle = random() * Math.PI * 2;
      const radiusX = targetWidth * (0.4 + random() * 0.1) + 4 + spread * 14;
      const radiusY = targetHeight * (0.22 + random() * 0.18) + 3 + spread * 12;
      const depth = random() * 2 - 1;
      positions[index3] = emitterOffsetX + Math.cos(angle) * radiusX;
      positions[index3 + 1] = emitterOffsetY + Math.sin(angle) * radiusY;
      positions[index3 + 2] = depth * 112;
      const speed = 0.01 + currentDrive * 0.03 + spread * 0.012;
      velocities[index3] = Math.cos(angle) * speed * (0.65 + random() * 0.9);
      velocities[index3 + 1] = Math.sin(angle) * speed * (0.45 + random() * 0.75) + 0.01;
      velocities[index3 + 2] = (random() - 0.5) * 0.012;
      const duration = 460 + random() * 620 + spread * 180;
      life[index] = duration;
      totalLife[index] = duration;
      sizes[index] = settings.size * (0.62 + random() * 0.92);
      alphas[index] = 0;
      depths[index] = depth;
      phases[index] = random() * Math.PI * 2;
      staticDirtyStart = Math.min(staticDirtyStart, index);
      staticDirtyEnd = Math.max(staticDirtyEnd, index + 1);
      emittedTotal += 1;
    }

    function uploadRange(attribute, offset, count) {
      if (count <= 0) return;
      attribute.updateRange.offset = offset;
      attribute.updateRange.count = count;
      attribute.needsUpdate = true;
    }

    function advance(deltaMs) {
      const delta = clamp(deltaMs, 0, 50);
      frontCount = 0;
      backCount = 0;
      let index = 0;
      while (index < activeCount) {
        life[index] -= delta;
        if (life[index] <= 0) {
          removeParticle(index);
          continue;
        }
        const index3 = index * 3;
        phases[index] += delta * 0.003;
        positions[index3] += velocities[index3] * delta + Math.sin(phases[index]) * 0.014 * delta;
        positions[index3 + 1] += velocities[index3 + 1] * delta;
        positions[index3 + 2] += velocities[index3 + 2] * delta;
        velocities[index3 + 1] += 0.000004 * delta;
        const age = totalLife[index] - life[index];
        const fadeIn = clamp(age / 120, 0, 1);
        const fadeOut = clamp(life[index] / 210, 0, 1);
        const depth = depths[index];
        const depthAlpha = depth >= 0 ? 0.58 + depth * 0.34 : 0.25 + (depth + 1) * 0.2;
        alphas[index] = fadeIn * fadeOut * depthAlpha;
        if (depth >= 0) frontCount += 1;
        else backCount += 1;
        index += 1;
      }
      geometry.setDrawRange(0, activeCount);
      // The pool stays allocated; only live particles need to cross the CPU/GPU boundary.
      uploadRange(positionAttribute, 0, activeCount * 3);
      uploadRange(alphaAttribute, 0, activeCount);
      // Size and depth change only on birth or when a dead slot is replaced.
      const staticCount = Math.min(activeCount, staticDirtyEnd) - staticDirtyStart;
      uploadRange(sizeAttribute, staticDirtyStart, staticCount);
      uploadRange(depthAttribute, staticDirtyStart, staticCount);
    }

    function render() {
      if (contextLost || suspended) return;
      if (activeCount <= 0) {
        if (hasContent) renderer.clear();
        hasContent = false;
        return;
      }
      renderer.render(scene, camera);
      staticDirtyStart = MAX_POOL_SIZE;
      staticDirtyEnd = 0;
      hasContent = true;
      renderCalls += 1;
    }

    function suspendCanvases() {
      if (suspended) return;
      renderer.setSize(1, 1, false);
      rendererWidth = 1;
      rendererHeight = 1;
      canvas.style.width = '1px';
      canvas.style.height = '1px';
      hasContent = false;
      suspended = true;
      boundsDirty = true;
    }

    function update(lowFrequency, deltaMs, active = true) {
      const requested = active && settings.enabled && !!target && !!host;
      const targetDrive = requested ? particleDrive(lowFrequency, settings.sensitivity) : 0;
      const budget = particleBudget(settings.density, profile, reducedMotion);
      if (suspended && (targetDrive > 0 || activeCount > 0)) refreshBounds();
      else if (!suspended) refreshBounds();
      envelope = nextEnvelope(envelope, targetDrive, deltaMs);
      currentDrive = envelope;
      const reducedScale = reducedMotion ? 0.16 : 1;
      if (requested && budget > 0 && envelope > 0.001) {
        const weakFloor = envelope > 0.004 ? 0.9 : 0;
        const emissionPerSecond = (weakFloor + budget * (0.025 + Math.pow(envelope, 0.72) * 1.52)) * reducedScale;
        emissionRemainder += emissionPerSecond * clamp(deltaMs, 0, 50) / 1000;
        const available = Math.max(0, budget - activeCount);
        const spawnCount = Math.min(available, Math.floor(emissionRemainder));
        emissionRemainder -= spawnCount;
        for (let index = 0; index < spawnCount; index += 1) spawnParticle();
      } else if (!requested || budget <= 0) {
        emissionRemainder = 0;
      }
      advance(deltaMs);
      render();
      if (activeCount <= 0 && envelope < 0.001 && (!requested || budget <= 0 || targetDrive <= 0)) {
        suspendCanvases();
      }
    }

    function clear() {
      activeCount = 0;
      frontCount = 0;
      backCount = 0;
      envelope = 0;
      currentDrive = 0;
      emissionRemainder = 0;
      staticDirtyStart = MAX_POOL_SIZE;
      staticDirtyEnd = 0;
      geometry.setDrawRange(0, 0);
      if (!contextLost && !suspended) {
        renderer.clear();
      }
      hasContent = false;
    }

    function diagnostics() {
      return Object.freeze({
        activeCount,
        backCount,
        budget: particleBudget(settings.density, profile, reducedMotion),
        canvasHeight,
        canvasWidth,
        contextLost,
        drive: currentDrive,
        emittedTotal,
        engine: 'three',
        frontCount,
        maxPixelRatio,
        pixelRatio,
        profile,
        reducedMotion,
        rendererCount: 1,
        renderCalls,
        suspended,
        targetHeight,
        targetWidth
      });
    }

    function contextLostHandler(event) {
      event.preventDefault();
      lostContexts.add(event.currentTarget);
      contextLost = lostContexts.size > 0;
    }

    function contextRestoredHandler(event) {
      lostContexts.delete(event.currentTarget);
      contextLost = lostContexts.size > 0;
      boundsDirty = true;
    }

    canvas.addEventListener?.('webglcontextlost', contextLostHandler, false);
    canvas.addEventListener?.('webglcontextrestored', contextRestoredHandler, false);

    function destroy() {
      clear();
      observer?.disconnect();
      global.removeEventListener?.('resize', markBoundsDirty);
      textRange?.detach?.();
      textRange = null;
      canvas.removeEventListener?.('webglcontextlost', contextLostHandler, false);
      canvas.removeEventListener?.('webglcontextrestored', contextRestoredHandler, false);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      // The application keeps this DOM canvas for the next renderer instance.
      canvas.width = 1;
      canvas.height = 1;
      canvas.style.width = '1px';
      canvas.style.height = '1px';
      lostContexts.clear();
      previousHost?.classList?.remove('has-three-lyric-particles');
      target = null;
      host = null;
      previousHost = null;
    }

    return Object.freeze({
      clear,
      destroy,
      diagnostics,
      markBoundsDirty,
      setColor,
      setProfile,
      setReducedMotion,
      setSettings,
      setTarget,
      update
    });
  }

  global.FeMonsterLyricHighlightParticles = Object.freeze({
    DEFAULT_SETTINGS,
    create,
    nextEnvelope,
    normalizeSettings,
    particleBudget,
    particleDrive
  });
})(typeof window !== 'undefined' ? window : globalThis);
