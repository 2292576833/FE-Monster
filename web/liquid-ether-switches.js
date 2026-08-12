(function () {
  "use strict";

  const SWITCH_SELECTOR = 'input.ui-switch[type="checkbox"]';
  const ACTIVE_CLASS = "is-visible";
  const WEBGL_CLASS = "fe-liquid-switches-webgl";
  const IDLE_TIMEOUT_MS = 950;
  const MAX_DEVICE_PIXEL_RATIO = 2;
  const registeredSwitches = new Set();
  const switchMeta = new WeakMap();
  const reduceMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  let renderer = null;
  let material = null;
  let scene = null;
  let camera = null;
  let canvas = null;
  let activeSwitch = null;
  let animationFrame = 0;
  let hideTimer = 0;
  let lastFrameTime = performance.now();
  let lastInteractionTime = 0;
  let checkedMix = 0;
  let hoverMix = 0;
  let pointerForce = 0;
  let pressedMix = 0;
  let renderCount = 0;
  let disposed = false;
  let webglAvailable = false;

  const pointer = { x: 0.5, y: 0.5, previousX: 0.5, previousY: 0.5 };
  const pointerVelocity = { x: 0, y: 0 };

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  const vertexShader = `
    precision highp float;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  const fragmentShader = `
    precision highp float;

    uniform float uTime;
    uniform float uChecked;
    uniform float uHover;
    uniform float uForce;
    uniform float uPressed;
    uniform vec2 uPointer;
    uniform vec2 uVelocity;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }

    float valueNoise(vec2 p) {
      vec2 cell = floor(p);
      vec2 local = fract(p);
      local = local * local * (3.0 - 2.0 * local);
      float a = hash21(cell);
      float b = hash21(cell + vec2(1.0, 0.0));
      float c = hash21(cell + vec2(0.0, 1.0));
      float d = hash21(cell + vec2(1.0, 1.0));
      return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.52;
      for (int octave = 0; octave < 4; octave++) {
        value += valueNoise(p) * amplitude;
        p = mat2(1.62, 1.18, -1.18, 1.62) * p + 0.17;
        amplitude *= 0.5;
      }
      return value;
    }

    float easeInOut(float value) {
      return value * value * (3.0 - 2.0 * value);
    }

    void main() {
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      float checked = easeInOut(clamp(uChecked, 0.0, 1.0));
      vec2 point = (vUv - 0.5) * vec2(aspect, 1.0);
      vec2 pointerPoint = (uPointer - 0.5) * vec2(aspect, 1.0);
      vec2 pointerDelta = point - pointerPoint;
      float pointerDistance = max(length(pointerDelta), 0.001);
      float pointerEnergy = exp(-pointerDistance * 3.9) * uForce;
      vec2 tangent = vec2(-pointerDelta.y, pointerDelta.x) / pointerDistance;

      float time = uTime * 0.58;
      point += tangent * pointerEnergy * (0.14 + 0.08 * sin(time * 4.0));
      point -= uVelocity * pointerEnergy * 0.12;
      point.x += sin(point.y * 5.4 - time * 1.8) * 0.08;
      point.y += cos(point.x * 4.2 + time * 1.35) * 0.07;

      float coarseFlow = fbm(point * 2.8 + vec2(time * 0.31, -time * 0.22));
      float fineFlow = fbm(point.yx * 5.1 + vec2(-time * 0.48, time * 0.37));
      float ribbon = 0.5 + 0.5 * sin(point.x * 5.7 - point.y * 3.1 + coarseFlow * 5.2 - time * 1.6);
      float dye = clamp(coarseFlow * 0.58 + fineFlow * 0.27 + ribbon * 0.35, 0.0, 1.0);
      float ripple = sin(pointerDistance * 20.0 - time * 8.0) * exp(-pointerDistance * 5.0) * uForce;
      dye = clamp(dye + ripple * 0.18, 0.0, 1.0);

      vec3 violet = vec3(0.322, 0.153, 1.0);   // #5227FF
      vec3 rose = vec3(1.0, 0.624, 0.988);    // #FF9FFC
      vec3 lilac = vec3(0.706, 0.592, 0.812); // #B497CF
      vec3 etherColor = mix(violet, lilac, smoothstep(0.08, 0.72, dye));
      etherColor = mix(etherColor, rose, smoothstep(0.58, 1.0, dye + pointerEnergy * 0.32));

      vec3 offBase = vec3(0.018, 0.014, 0.046);
      vec3 onBase = vec3(0.075, 0.025, 0.16);
      vec3 color = mix(offBase, onBase, checked);
      float liquidAmount = mix(0.34, 0.82, checked) + uHover * 0.11;
      color = mix(color, etherColor, clamp(liquidAmount * (0.55 + dye * 0.48), 0.0, 0.96));
      color += rose * pointerEnergy * (0.12 + uPressed * 0.1);

      float edgeDistance = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
      float edgeLight = 1.0 - smoothstep(0.0, 0.095, edgeDistance);
      color += mix(vec3(0.16, 0.08, 0.32), vec3(0.55, 0.42, 0.72), checked) * edgeLight * 0.18;
      color += vec3(1.0) * smoothstep(0.5, 0.0, vUv.y) * 0.055;

      float directionalFlow = smoothstep(-0.95, 0.78, mix(-point.x, point.x, checked));
      color += mix(violet, rose, checked) * directionalFlow * (0.035 + uHover * 0.025);
      color *= mix(1.0, 0.94, uPressed);

      gl_FragColor = vec4(color, 0.985);
    }
  `;

  function metaFor(input) {
    let meta = switchMeta.get(input);
    if (!meta) {
      meta = { hovered: false };
      switchMeta.set(input, meta);
    }
    return meta;
  }

  function clearHideTimer() {
    if (!hideTimer) return;
    window.clearTimeout(hideTimer);
    hideTimer = 0;
  }

  function positionCanvas() {
    if (!canvas || !renderer || !activeSwitch?.isConnected) return false;
    const rect = activeSwitch.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2 || rect.bottom <= 0 || rect.right <= 0
      || rect.top >= window.innerHeight || rect.left >= window.innerWidth) {
      return false;
    }

    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    canvas.style.left = `${rect.left}px`;
    canvas.style.top = `${rect.top}px`;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (canvas.width !== Math.round(width * renderer.getPixelRatio())
      || canvas.height !== Math.round(height * renderer.getPixelRatio())) {
      renderer.setSize(width, height, false);
    }
    material.uniforms.uResolution.value.set(width, height);
    return true;
  }

  function showCanvas() {
    if (!canvas) return;
    clearHideTimer();
    canvas.hidden = false;
    requestAnimationFrame(() => canvas?.classList.add(ACTIVE_CLASS));
  }

  function concealCanvas(immediate = false) {
    if (!canvas) return;
    canvas.classList.remove(ACTIVE_CLASS);
    clearHideTimer();
    const finish = () => {
      if (canvas && !canvas.classList.contains(ACTIVE_CLASS)) canvas.hidden = true;
      hideTimer = 0;
    };
    if (immediate) finish();
    else hideTimer = window.setTimeout(finish, 180);
  }

  function ensureAnimation() {
    if (animationFrame || disposed || !webglAvailable || document.hidden) return;
    lastFrameTime = performance.now();
    animationFrame = requestAnimationFrame(renderFrame);
  }

  function markInteraction(force = 0.24) {
    lastInteractionTime = performance.now();
    pointerForce = Math.max(pointerForce, force);
    showCanvas();
    ensureAnimation();
  }

  function updatePointer(event, input) {
    if (!Number.isFinite(event?.clientX) || !Number.isFinite(event?.clientY)) return;
    const rect = input.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nextX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const nextY = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
    pointerVelocity.x = clamp((nextX - pointer.x) * 12, -1, 1);
    pointerVelocity.y = clamp((nextY - pointer.y) * 12, -1, 1);
    pointer.previousX = pointer.x;
    pointer.previousY = pointer.y;
    pointer.x = nextX;
    pointer.y = nextY;
    const speed = Math.hypot(pointerVelocity.x, pointerVelocity.y);
    markInteraction(clamp(0.24 + speed * 0.78, 0.24, 1));
  }

  function activateSwitch(input, event) {
    if (!input || input.disabled) return;
    if (!webglAvailable) initialiseRenderer();
    if (!webglAvailable) return;
    if (activeSwitch !== input) {
      activeSwitch = input;
      checkedMix = input.checked ? 1 : 0;
      hoverMix = 0;
      pointer.x = 0.5;
      pointer.y = 0.5;
      pointer.previousX = 0.5;
      pointer.previousY = 0.5;
      pointerVelocity.x = 0;
      pointerVelocity.y = 0;
      pointerForce = 0.2;
    }
    updatePointer(event, input);
    markInteraction(0.3);
  }

  function maybeDeactivate(input) {
    if (activeSwitch !== input) return;
    const meta = metaFor(input);
    if (meta.hovered || document.activeElement === input || pressedMix > 0.1) return;
    concealCanvas();
    activeSwitch = null;
  }

  function registerSwitch(input) {
    if (!(input instanceof HTMLInputElement) || registeredSwitches.has(input)) return;
    registeredSwitches.add(input);
    const meta = metaFor(input);

    input.addEventListener("pointerenter", (event) => {
      meta.hovered = true;
      activateSwitch(input, event);
    });
    input.addEventListener("pointermove", (event) => {
      meta.hovered = true;
      activateSwitch(input, event);
    });
    input.addEventListener("pointerleave", () => {
      meta.hovered = false;
      pointerForce = Math.max(pointerForce, 0.18);
      window.setTimeout(() => maybeDeactivate(input), 60);
    });
    input.addEventListener("pointerdown", (event) => {
      pressedMix = 1;
      activateSwitch(input, event);
      markInteraction(1);
    });
    input.addEventListener("focus", () => activateSwitch(input));
    input.addEventListener("blur", () => window.setTimeout(() => maybeDeactivate(input), 0));
    input.addEventListener("change", () => {
      if (activeSwitch !== input) activateSwitch(input);
      markInteraction(0.72);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        activateSwitch(input);
        markInteraction(0.82);
      }
    });
  }

  function refreshSwitches(root = document) {
    root.querySelectorAll?.(SWITCH_SELECTOR).forEach(registerSwitch);
    for (const input of registeredSwitches) {
      if (!input.isConnected) registeredSwitches.delete(input);
    }
  }

  function renderFrame(now) {
    animationFrame = 0;
    if (disposed || document.hidden || !activeSwitch?.isConnected || activeSwitch.disabled) {
      concealCanvas(true);
      activeSwitch = null;
      return;
    }
    if (!positionCanvas()) {
      concealCanvas(true);
      return;
    }

    const delta = Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000));
    lastFrameTime = now;
    const checkedTarget = activeSwitch.checked ? 1 : 0;
    const hoverTarget = metaFor(activeSwitch).hovered || document.activeElement === activeSwitch ? 1 : 0;
    const response = 1 - Math.exp(-delta * 15);
    checkedMix += (checkedTarget - checkedMix) * response;
    hoverMix += (hoverTarget - hoverMix) * (1 - Math.exp(-delta * 11));
    pointerForce *= Math.exp(-delta * 2.7);
    pointerVelocity.x *= Math.exp(-delta * 7.5);
    pointerVelocity.y *= Math.exp(-delta * 7.5);
    pressedMix *= Math.exp(-delta * 11);

    const reducedMotion = Boolean(reduceMotionQuery?.matches);
    material.uniforms.uTime.value = now * 0.001 * (reducedMotion ? 0.12 : 1);
    material.uniforms.uChecked.value = checkedMix;
    material.uniforms.uHover.value = hoverMix;
    material.uniforms.uForce.value = reducedMotion ? pointerForce * 0.35 : pointerForce;
    material.uniforms.uPressed.value = pressedMix;
    material.uniforms.uPointer.value.set(pointer.x, pointer.y);
    material.uniforms.uVelocity.value.set(pointerVelocity.x, pointerVelocity.y);
    renderer.render(scene, camera);
    renderCount += 1;

    const stillTransitioning = Math.abs(checkedTarget - checkedMix) > 0.002
      || Math.abs(hoverTarget - hoverMix) > 0.002
      || pointerForce > 0.012
      || pressedMix > 0.012;
    const recentlyInteractive = now - lastInteractionTime < (reducedMotion ? 240 : IDLE_TIMEOUT_MS);
    if (stillTransitioning || recentlyInteractive) {
      animationFrame = requestAnimationFrame(renderFrame);
    } else {
      concealCanvas();
    }
  }

  function initialiseRenderer() {
    const THREE = window.THREE;
    if (renderer || !THREE?.WebGLRenderer || disposed) return;
    const graphicsBackend = window.feMonsterGraphicsBackend?.snapshot?.();
    if (graphicsBackend?.requested && graphicsBackend.hardwareD3D11 !== true) {
      webglAvailable = false;
      return;
    }
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
        premultipliedAlpha: true
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO));
      renderer.setClearColor(0x000000, 0);
      if ("outputEncoding" in renderer && THREE.sRGBEncoding !== undefined) {
        renderer.outputEncoding = THREE.sRGBEncoding;
      }

      canvas = renderer.domElement;
      canvas.className = "liquid-ether-switch-layer";
      canvas.hidden = true;
      canvas.setAttribute("aria-hidden", "true");
      canvas.dataset.liquidEtherColors = "#5227FF,#FF9FFC,#B497CF";

      const geometry = new THREE.PlaneGeometry(2, 2, 1, 1);
      material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uChecked: { value: 0 },
          uHover: { value: 0 },
          uForce: { value: 0 },
          uPressed: { value: 0 },
          uPointer: { value: new THREE.Vector2(0.5, 0.5) },
          uVelocity: { value: new THREE.Vector2(0, 0) },
          uResolution: { value: new THREE.Vector2(46, 24) }
        }
      });
      scene = new THREE.Scene();
      camera = new THREE.Camera();
      scene.add(new THREE.Mesh(geometry, material));
      document.body.appendChild(canvas);
      document.documentElement.classList.add(WEBGL_CLASS);
      webglAvailable = true;

      canvas.addEventListener("webglcontextlost", () => {
        webglAvailable = false;
        document.documentElement.classList.remove(WEBGL_CLASS);
        concealCanvas(true);
      });
      canvas.addEventListener("webglcontextrestored", () => {
        webglAvailable = true;
        document.documentElement.classList.add(WEBGL_CLASS);
      });
    } catch (error) {
      console.warn("LiquidEther switch renderer unavailable; using the CSS fallback.", error);
      webglAvailable = false;
    }
  }

  function dispose() {
    disposed = true;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    clearHideTimer();
    try {
      material?.dispose?.();
      scene?.traverse?.((node) => node.geometry?.dispose?.());
      renderer?.dispose?.();
    } catch {
    }
    canvas?.remove();
    document.documentElement.classList.remove(WEBGL_CLASS);
  }

  let initialised = false;

  function initialise() {
    if (initialised || disposed) return;
    initialised = true;
    refreshSwitches();
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches?.(SWITCH_SELECTOR)) registerSwitch(node);
          refreshSwitches(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("pointerup", () => {
      pressedMix = 0;
      if (activeSwitch) markInteraction(0.5);
    }, { passive: true });
    window.addEventListener("resize", () => activeSwitch && markInteraction(0.16), { passive: true });
    window.addEventListener("scroll", () => activeSwitch && markInteraction(0.12), { passive: true, capture: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        concealCanvas(true);
      }
    });
    window.addEventListener("beforeunload", dispose, { once: true });

  }

  window.FeLiquidEtherSwitches = Object.freeze({
    refresh() {
      initialise();
      refreshSwitches();
    },
    getDiagnostics() {
      if (initialised) refreshSwitches();
      return {
        initialised,
        registered: registeredSwitches.size,
        rendererCount: renderer ? 1 : 0,
        canvasCount: document.querySelectorAll("canvas.liquid-ether-switch-layer").length,
        webglAvailable,
        activeId: activeSwitch?.id || "",
        animationActive: Boolean(animationFrame),
        renderCount,
        mouseInteractive: true,
        palette: ["#5227FF", "#FF9FFC", "#B497CF"]
      };
    }
  });

  const startWhenInteractive = () => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initialise, { once: true });
    } else {
      initialise();
    }
  };
  if (
    document.documentElement.dataset.interactiveServices === "started"
    || document.documentElement.dataset.feClient === "desktop-scene"
  ) {
    startWhenInteractive();
  } else {
    window.addEventListener("fe-main-entered", startWhenInteractive, { once: true });
  }
})();
