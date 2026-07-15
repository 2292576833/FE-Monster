const mount = document.getElementById('bootLightfallMount');

if (!mount) {
  window.dispatchEvent(new CustomEvent('fe-lightfall-ready'));
} else {
  const container = document.createElement('div');
  container.className = 'lightfall-container boot-lightfall-react';
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: true });
  container.appendChild(canvas);
  mount.appendChild(container);

  const streakCount = 44;
  const streaks = Array.from({ length: streakCount }, (_, index) => ({
    angle: (index / streakCount) * Math.PI * 2 + Math.random() * 0.12,
    radius: 0.05 + Math.random() * 0.95,
    speed: 0.22 + Math.random() * 0.75,
    length: 0.05 + Math.random() * 0.18,
    width: 0.45 + Math.random() * 1.35,
    hue: Math.random() > 0.72 ? 315 : (205 + Math.random() * 55),
    phase: Math.random()
  }));
  let width = 1;
  let height = 1;
  let frame = 0;
  let lastFrame = 0;
  let ready = false;

  function resize() {
    const rect = mount.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(1, 0, 0, 1, 0, 0);
  }

  function draw(time) {
    frame = requestAnimationFrame(draw);
    if (time - lastFrame < 32) return;
    lastFrame = time;
    const seconds = time * 0.001;
    const cx = width * 0.5;
    const cy = height * 0.47;
    const radius = Math.hypot(width, height) * 0.62;
    context.clearRect(0, 0, width, height);

    const background = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
    background.addColorStop(0, 'rgba(119, 41, 255, 0.34)');
    background.addColorStop(0.2, 'rgba(38, 31, 129, 0.3)');
    background.addColorStop(0.58, 'rgba(8, 12, 42, 0.36)');
    background.addColorStop(1, 'rgba(1, 2, 10, 0.76)');
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    context.save();
    context.globalCompositeOperation = 'screen';
    for (const streak of streaks) {
      const travel = (streak.phase + seconds * 0.12 * streak.speed) % 1;
      const eased = travel * travel;
      const distance = (0.04 + eased * streak.radius) * radius;
      const tailDistance = Math.max(0, distance - streak.length * radius * (0.25 + eased));
      const cos = Math.cos(streak.angle);
      const sin = Math.sin(streak.angle);
      const x1 = cx + cos * tailDistance;
      const y1 = cy + sin * tailDistance;
      const x2 = cx + cos * distance;
      const y2 = cy + sin * distance;
      const alpha = Math.sin(Math.PI * travel) * (0.18 + eased * 0.66);
      const gradient = context.createLinearGradient(x1, y1, x2, y2);
      gradient.addColorStop(0, `hsla(${streak.hue}, 100%, 66%, 0)`);
      gradient.addColorStop(0.72, `hsla(${streak.hue}, 100%, 70%, ${alpha * 0.42})`);
      gradient.addColorStop(1, `hsla(${streak.hue}, 100%, 84%, ${alpha})`);
      context.strokeStyle = gradient;
      context.lineWidth = streak.width * (0.7 + eased * 1.6);
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    }
    context.restore();

    const core = context.createRadialGradient(cx, cy, 0, cx, cy, Math.min(width, height) * 0.23);
    core.addColorStop(0, 'rgba(218, 226, 255, 0.3)');
    core.addColorStop(0.12, 'rgba(139, 89, 255, 0.2)');
    core.addColorStop(1, 'rgba(62, 39, 165, 0)');
    context.fillStyle = core;
    context.fillRect(0, 0, width, height);

    if (!ready) {
      ready = true;
      window.dispatchEvent(new CustomEvent('fe-lightfall-ready'));
    }
  }

  resize();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(mount);
  window.addEventListener('resize', resize, { passive: true });
  frame = requestAnimationFrame(draw);

  window.addEventListener('fe-lightfall-stop', () => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener('resize', resize);
    container.remove();
  }, { once: true });
}
