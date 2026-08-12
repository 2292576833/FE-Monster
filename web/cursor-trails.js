(function () {
  "use strict";

  const TRAIL_MODES = new Set(["off", "glow", "comet", "stardust", "ribbon", "prism", "custom"]);
  const CUSTOM_TRAIL_STORAGE_KEY = "fe-monster-custom-cursor-trail-v1";
  const MODE_LIMITS = Object.freeze({
    glow: Object.freeze({ lifetime: 360, points: 22 }),
    comet: Object.freeze({ lifetime: 460, points: 30 }),
    stardust: Object.freeze({ lifetime: 620, points: 34 }),
    ribbon: Object.freeze({ lifetime: 480, points: 36 }),
    prism: Object.freeze({ lifetime: 520, points: 38 })
  });
  const TRAIL_TARGET_FPS = 60;
  const TRAIL_FRAME_BUDGET_MS = 1000 / TRAIL_TARGET_FPS;
  const finePointerQuery = window.matchMedia?.("(any-hover: hover) and (any-pointer: fine)");
  const reducedMotionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const samples = [];

  let mode = "off";
  let canvas = null;
  let context = null;
  let frame = 0;
  let devicePixelRatio = 1;
  let viewportWidth = 0;
  let viewportHeight = 0;
  let renderedFrames = 0;
  let lastAcceptedPoint = null;
  let frameClock = 0;
  let frameCarry = 0;
  let customTrail = null;

  function clamp(value, min, max, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
  }

  function normaliseColour(value, fallback) {
    const colour = String(value || "").trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(colour) ? colour : fallback;
  }

  function normaliseCustomTrail(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const style = ["glow", "comet", "stardust", "ribbon", "prism"].includes(value.style)
      ? value.style
      : "comet";
    return {
      schema: "fe-monster.cursor-trail/v1",
      name: String(value.name || "创作市场尾迹").trim().slice(0, 64) || "创作市场尾迹",
      style,
      primary: normaliseColour(value.primary, "#9ce5ff"),
      secondary: normaliseColour(value.secondary, "#ff9ffc"),
      lifetime: Math.round(clamp(value.lifetime, 180, 1200, 520)),
      points: Math.round(clamp(value.points, 10, 64, 36)),
      width: clamp(value.width, 0.5, 8, 2.4),
      glow: clamp(value.glow, 0, 28, 12),
      particles: value.particles !== false
    };
  }

  function loadCustomTrail() {
    try {
      return normaliseCustomTrail(JSON.parse(window.localStorage?.getItem(CUSTOM_TRAIL_STORAGE_KEY) || "null"));
    } catch (error) {
      return null;
    }
  }

  function installCustomTrail(value) {
    const normalised = normaliseCustomTrail(value);
    if (!normalised) return null;
    try {
      window.localStorage?.setItem(CUSTOM_TRAIL_STORAGE_KEY, JSON.stringify(normalised));
    } catch (error) {
      return null;
    }
    customTrail = normalised;
    syncMode();
    return { ...normalised };
  }

  function activeMode() {
    const requested = document.documentElement.dataset.feCursorTrail || "off";
    return TRAIL_MODES.has(requested) ? requested : "off";
  }

  function motionAllowed(pointerType = "mouse") {
    return mode !== "off"
      && pointerType !== "touch"
      && Boolean(finePointerQuery?.matches)
      && !Boolean(reducedMotionQuery?.matches)
      && !document.hidden;
  }

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.className = "cursor-trail-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.hidden = true;
    document.body.appendChild(canvas);
    context = canvas.getContext("2d", { alpha: true, desynchronized: true });
    resizeCanvas();
  }

  function resizeCanvas() {
    if (!canvas || !context) return;
    viewportWidth = Math.max(1, window.innerWidth);
    viewportHeight = Math.max(1, window.innerHeight);
    devicePixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(viewportWidth * devicePixelRatio));
    canvas.height = Math.max(1, Math.round(viewportHeight * devicePixelRatio));
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  function clearTrail() {
    samples.length = 0;
    lastAcceptedPoint = null;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    frameClock = 0;
    frameCarry = 0;
    if (context) context.clearRect(0, 0, viewportWidth, viewportHeight);
    if (canvas) canvas.hidden = true;
  }

  function syncMode() {
    customTrail = loadCustomTrail();
    mode = activeMode();
    if (mode === "custom" && !customTrail) mode = "off";
    if (!motionAllowed()) {
      clearTrail();
      return;
    }
    ensureCanvas();
  }

  function queueFrame() {
    if (!frame && motionAllowed()) frame = requestAnimationFrame(drawFrame);
  }

  function pushSample(event, bornAt) {
    const x = Number(event.clientX);
    const y = Number(event.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (lastAcceptedPoint && Math.hypot(x - lastAcceptedPoint.x, y - lastAcceptedPoint.y) < 1.15) return;
    const previous = samples.at(-1);
    const point = {
      x,
      y,
      bornAt,
      dx: previous ? x - previous.x : 0,
      dy: previous ? y - previous.y : 0,
      seed: ((x * 0.017 + y * 0.031 + bornAt * 0.0007) % 1 + 1) % 1
    };
    samples.push(point);
    lastAcceptedPoint = point;
    const limit = mode === "custom" ? customTrail?.points || 24 : MODE_LIMITS[mode]?.points || 24;
    if (samples.length > limit) samples.splice(0, samples.length - limit);
  }

  function handlePointerMove(event) {
    if (!motionAllowed(event.pointerType)) return;
    ensureCanvas();
    canvas.hidden = false;
    let coalesced = [];
    if (typeof event.getCoalescedEvents === "function") {
      try {
        coalesced = event.getCoalescedEvents();
      } catch {
        coalesced = [];
      }
    }
    const events = coalesced.length ? coalesced : [event];
    const now = performance.now();
    const spacing = Math.max(0.18, 1 / events.length);
    events.forEach((sample, index) => pushSample(sample, now - (events.length - index - 1) * spacing));
    queueFrame();
  }

  function drawGlow(now, lifetime) {
    for (const point of samples) {
      const progress = Math.min(1, Math.max(0, (now - point.bornAt) / lifetime));
      const alpha = Math.pow(1 - progress, 1.8);
      const radius = 2.4 + progress * 5.2;
      const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
      gradient.addColorStop(0, `rgba(255, 238, 255, ${0.72 * alpha})`);
      gradient.addColorStop(0.36, `rgba(255, 159, 252, ${0.42 * alpha})`);
      gradient.addColorStop(1, "rgba(82, 39, 255, 0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawSegmentTrail(now, lifetime, prism = false) {
    context.lineCap = "round";
    context.lineJoin = "round";
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const point = samples[index];
      const progress = Math.min(1, Math.max(0, (now - point.bornAt) / lifetime));
      const alpha = Math.pow(1 - progress, 1.45);
      if (alpha <= 0.01) continue;
      const speed = Math.min(1, Math.hypot(point.dx, point.dy) / 24);
      context.lineWidth = 0.8 + alpha * (2.8 + speed * 1.8);
      context.strokeStyle = prism
        ? `hsla(${Math.round((point.seed * 250 + now * 0.08) % 360)}, 94%, 72%, ${0.72 * alpha})`
        : `rgba(${Math.round(180 + 75 * point.seed)}, ${Math.round(150 + 80 * (1 - point.seed))}, 255, ${0.62 * alpha})`;
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
  }

  function drawStardust(now, lifetime) {
    context.lineCap = "round";
    for (const point of samples) {
      const progress = Math.min(1, Math.max(0, (now - point.bornAt) / lifetime));
      const alpha = Math.pow(1 - progress, 1.35);
      if (alpha <= 0.01) continue;
      const driftX = (point.seed - 0.5) * progress * 18;
      const driftY = -(5 + point.seed * 12) * progress;
      const x = point.x + driftX;
      const y = point.y + driftY;
      const radius = 0.7 + (1 - progress) * (1.1 + point.seed * 1.5);
      context.strokeStyle = `rgba(255, ${Math.round(194 + point.seed * 61)}, 255, ${0.82 * alpha})`;
      context.lineWidth = 0.75 + alpha * 0.8;
      context.beginPath();
      context.moveTo(x - radius * 2.2, y);
      context.lineTo(x + radius * 2.2, y);
      context.moveTo(x, y - radius * 2.2);
      context.lineTo(x, y + radius * 2.2);
      context.stroke();
      context.fillStyle = `rgba(180, 225, 255, ${0.48 * alpha})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawRibbon(now, lifetime) {
    if (samples.length < 2) return;
    for (const offset of [-2.2, 2.2]) {
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 1.25;
      context.strokeStyle = offset < 0 ? "rgba(82, 39, 255, 0.56)" : "rgba(255, 159, 252, 0.56)";
      context.beginPath();
      samples.forEach((point, index) => {
        const progress = Math.min(1, Math.max(0, (now - point.bornAt) / lifetime));
        const fadeOffset = offset * (1 - progress);
        const length = Math.max(1, Math.hypot(point.dx, point.dy));
        const nx = -point.dy / length;
        const ny = point.dx / length;
        const x = point.x + nx * fadeOffset;
        const y = point.y + ny * fadeOffset;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.stroke();
    }
  }

  function colourRgba(hex, alpha) {
    const value = normaliseColour(hex, "#ffffff");
    const red = Number.parseInt(value.slice(1, 3), 16);
    const green = Number.parseInt(value.slice(3, 5), 16);
    const blue = Number.parseInt(value.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha))})`;
  }

  function drawCustom(now, config) {
    if (!config || samples.length < 1) return;
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.shadowBlur = config.glow;
    context.shadowColor = colourRgba(config.secondary, 0.62);
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const point = samples[index];
      const progress = Math.min(1, Math.max(0, (now - point.bornAt) / config.lifetime));
      const alpha = Math.pow(1 - progress, 1.42);
      if (alpha <= 0.01) continue;
      const hueShift = config.style === "prism" ? (point.seed * 120 + now * 0.045) % 360 : null;
      context.strokeStyle = hueShift === null
        ? colourRgba(index % 2 ? config.primary : config.secondary, 0.72 * alpha)
        : `hsla(${hueShift}, 92%, 72%, ${0.76 * alpha})`;
      context.lineWidth = Math.max(0.5, config.width * (0.42 + alpha * 0.72));
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
    if (config.particles) {
      for (let index = 0; index < samples.length; index += 2) {
        const point = samples[index];
        const progress = Math.min(1, Math.max(0, (now - point.bornAt) / config.lifetime));
        const alpha = Math.pow(1 - progress, 1.7);
        if (alpha <= 0.02) continue;
        const drift = config.style === "stardust" ? progress * (5 + point.seed * 12) : 0;
        context.fillStyle = colourRgba(point.seed > 0.5 ? config.primary : config.secondary, 0.7 * alpha);
        context.beginPath();
        context.arc(point.x + (point.seed - 0.5) * drift, point.y - drift, 0.8 + alpha * config.width * 0.7, 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
  }

  function drawFrame(now) {
    frame = 0;
    if (!motionAllowed() || !context || !canvas) {
      clearTrail();
      return;
    }
    const frameElapsed = frameClock
      ? Math.min(100, Math.max(0, now - frameClock))
      : TRAIL_FRAME_BUDGET_MS;
    frameClock = now;
    frameCarry = Math.min(TRAIL_FRAME_BUDGET_MS * 2, frameCarry + frameElapsed);
    if (frameCarry + 0.1 < TRAIL_FRAME_BUDGET_MS) {
      queueFrame();
      return;
    }
    frameCarry %= TRAIL_FRAME_BUDGET_MS;
    const config = mode === "custom" ? customTrail : MODE_LIMITS[mode] || MODE_LIMITS.glow;
    while (samples.length && now - samples[0].bornAt >= config.lifetime) samples.shift();
    context.clearRect(0, 0, viewportWidth, viewportHeight);
    if (!samples.length) {
      canvas.hidden = true;
      lastAcceptedPoint = null;
      return;
    }

    context.save();
    context.globalCompositeOperation = "lighter";
    if (mode === "custom") drawCustom(now, config);
    else if (mode === "glow") drawGlow(now, config.lifetime);
    else if (mode === "comet") drawSegmentTrail(now, config.lifetime, false);
    else if (mode === "stardust") drawStardust(now, config.lifetime);
    else if (mode === "ribbon") drawRibbon(now, config.lifetime);
    else if (mode === "prism") drawSegmentTrail(now, config.lifetime, true);
    context.restore();
    renderedFrames += 1;
    queueFrame();
  }

  function initialise() {
    syncMode();
    document.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("fe-cursor-preferences-changed", syncMode);
    window.addEventListener("resize", () => {
      if (!canvas) return;
      resizeCanvas();
      clearTrail();
    }, { passive: true });
    window.addEventListener("blur", clearTrail);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clearTrail();
      else syncMode();
    });
    finePointerQuery?.addEventListener?.("change", syncMode);
    reducedMotionQuery?.addEventListener?.("change", syncMode);

    window.FeCursorTrails = Object.freeze({
      sync: syncMode,
      clear: clearTrail,
      installCustom: installCustomTrail,
      getCustom() {
        return customTrail ? { ...customTrail } : null;
      },
      getDiagnostics() {
        return {
          mode,
          enabled: motionAllowed(),
          canvasCount: document.querySelectorAll("canvas.cursor-trail-canvas").length,
          sampleCount: samples.length,
          animationActive: Boolean(frame),
          renderedFrames,
          coalescedEventsSupported: typeof PointerEvent !== "undefined"
            && typeof PointerEvent.prototype.getCoalescedEvents === "function"
        };
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialise, { once: true });
  } else {
    initialise();
  }
})();
