(function createMixerRenderWorker(scope) {
  'use strict';

  const surfaces = new Map();
  const CHANNEL_ANGLES = Object.freeze({ L: -30, R: 30, C: 0, LFE: 0, Lb: -135, Rb: 135, Ls: -90, Rs: 90 });
  const RENDER_SCALES = Object.freeze({
    spectrum: 0.45,
    'stereo-field': 0.65,
    surround: 0.75,
    waveform: 0.65
  });
  let latestFrame = null;
  let pumpTimer = 0;

  const clamp = (value, minimum, maximum, fallback = minimum) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
  };

  function configure(entry) {
    const surface = surfaces.get(entry.id);
    if (!surface) return;
    const deviceRatio = clamp(entry.ratio, 1, 2, 1);
    // Dynamic scopes do not need one backing pixel per display pixel. Keeping
    // their backing stores bounded avoids GPU readback/compositor stalls while
    // CSS still scales the continuously redrawn vector traces to the card.
    const ratio = deviceRatio * (RENDER_SCALES[entry.id] || 0.65);
    const width = Math.max(1, Math.round(Number(entry.width) || 640));
    const height = Math.max(1, Math.round(Number(entry.height) || 220));
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (surface.canvas.width !== pixelWidth) surface.canvas.width = pixelWidth;
    if (surface.canvas.height !== pixelHeight) surface.canvas.height = pixelHeight;
    surface.width = width;
    surface.height = height;
    surface.ratio = ratio;
    surface.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    surface.gradient = null;
  }

  function grid(context, width, height, columns = 8, rows = 4) {
    context.clearRect(0, 0, width, height);
    context.beginPath();
    for (let column = 1; column < columns; column += 1) {
      const x = (column / columns) * width;
      context.moveTo(x, 0);
      context.lineTo(x, height);
    }
    for (let row = 1; row < rows; row += 1) {
      const y = (row / rows) * height;
      context.moveTo(0, y);
      context.lineTo(width, y);
    }
    context.strokeStyle = 'rgba(139, 216, 187, 0.11)';
    context.lineWidth = 1;
    context.stroke();
  }

  function drawSpectrum(frame) {
    const surface = surfaces.get('spectrum');
    const bins = frame.telemetry.spectrum;
    if (!surface || !bins?.length) return;
    const { context, width, height } = surface;
    grid(context, width, height, 10, 4);
    const points = Math.min(48, bins.length);
    if (!surface.gradient) {
      surface.gradient = context.createLinearGradient(0, height, 0, 0);
      surface.gradient.addColorStop(0, 'rgba(76, 190, 145, 0.28)');
      surface.gradient.addColorStop(0.72, 'rgba(124, 240, 190, 0.82)');
      surface.gradient.addColorStop(1, 'rgba(255, 130, 121, 0.92)');
    }
    context.beginPath();
    context.moveTo(0, height);
    for (let point = 0; point < points; point += 1) {
      const from = Math.floor((point / points) * bins.length);
      const to = Math.max(from + 1, Math.floor(((point + 1) / points) * bins.length));
      let energy = 0;
      for (let index = from; index < to; index += 1) energy = Math.max(energy, clamp(bins[index], 0, 1, 0));
      const x = (point / Math.max(1, points - 1)) * width;
      context.lineTo(x, height - energy * height);
    }
    context.lineTo(width, height);
    context.closePath();
    context.fillStyle = surface.gradient;
    context.fill();
    context.strokeStyle = 'rgba(177, 255, 222, 0.82)';
    context.lineWidth = 1;
    context.stroke();
  }

  function drawStereo(frame) {
    const surface = surfaces.get('stereo-field');
    const stereo = frame.telemetry.stereo;
    if (!surface || !stereo?.leftSamples?.length || !stereo?.rightSamples?.length) return;
    const { context, width, height } = surface;
    grid(context, width, height, 4, 4);
    const count = Math.min(stereo.leftSamples.length, stereo.rightSamples.length);
    const step = Math.max(1, Math.floor(count / 96));
    context.strokeStyle = 'rgba(132, 241, 194, 0.9)';
    context.lineWidth = 1.1;
    context.beginPath();
    let point = 0;
    for (let index = 0; index < count; index += step) {
      const left = clamp(stereo.leftSamples[index], -1, 1, 0);
      const right = clamp(stereo.rightSamples[index], -1, 1, 0);
      const x = width / 2 + (right - left) * width * 0.22;
      const y = height / 2 - (right + left) * height * 0.22;
      if (point++ === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();
  }

  function drawSurround(frame) {
    const surface = surfaces.get('surround');
    const channels = frame.channels;
    if (!surface || !channels?.length) return;
    const { context, width, height } = surface;
    context.clearRect(0, 0, width, height);
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(10, Math.min(width, height) * 0.38);
    context.strokeStyle = 'rgba(139, 216, 187, 0.2)';
    for (const scale of [0.33, 0.66, 1]) {
      context.beginPath();
      context.arc(centerX, centerY, radius * scale, 0, Math.PI * 2);
      context.stroke();
    }
    for (const level of channels) {
      if (!Object.hasOwn(CHANNEL_ANGLES, level.id)) continue;
      const azimuth = Number.isFinite(Number(level.azimuthDeg)) ? Number(level.azimuthDeg) : CHANNEL_ANGLES[level.id];
      const angle = ((azimuth - 90) * Math.PI) / 180;
      const energyRadius = radius * clamp(level.rms, 0, 1, 0);
      const x = centerX + Math.cos(angle) * energyRadius;
      const y = centerY + Math.sin(angle) * energyRadius;
      context.beginPath();
      context.arc(x, y, 4 + clamp(level.peak, 0, 1, 0) * 7, 0, Math.PI * 2);
      context.fillStyle = Number(level.peak) >= 1 ? 'rgba(255, 112, 105, 0.95)' : 'rgba(126, 241, 192, 0.86)';
      context.fill();
      context.fillStyle = 'rgba(225, 247, 237, 0.78)';
      context.font = '11px "Segoe UI", sans-serif';
      context.textAlign = 'center';
      context.fillText(level.id, centerX + Math.cos(angle) * (radius + 14), centerY + Math.sin(angle) * (radius + 14));
    }
  }

  function drawWaveform(frame) {
    const surface = surfaces.get('waveform');
    const samples = frame.telemetry.waveform;
    const playback = frame.telemetry.playback;
    if (!surface || !samples?.length || !playback?.durationSeconds) return;
    const { context, width, height } = surface;
    grid(context, width, height, 8, 2);
    const step = Math.max(1, Math.floor(samples.length / 128));
    context.strokeStyle = 'rgba(129, 238, 193, 0.88)';
    context.lineWidth = 1.2;
    context.beginPath();
    let point = 0;
    for (let index = 0; index < samples.length; index += step) {
      const x = (index / Math.max(1, samples.length - 1)) * width;
      const y = height / 2 - clamp(samples[index], -1, 1, 0) * height * 0.44;
      if (point++ === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();
    const progress = clamp(playback.positionSeconds / playback.durationSeconds, 0, 1, 0);
    context.fillStyle = 'rgba(111, 232, 181, 0.13)';
    context.fillRect(0, 0, width * progress, height);
    context.strokeStyle = 'rgba(215, 255, 238, 0.88)';
    context.beginPath();
    context.moveTo(width * progress, 0);
    context.lineTo(width * progress, height);
    context.stroke();
  }

  function render(frame) {
    const active = new Set(frame.active || []);
    if (active.has('spectrum')) drawSpectrum(frame);
    if (active.has('stereo-field')) drawStereo(frame);
    if (active.has('surround')) drawSurround(frame);
    if (active.has('waveform')) drawWaveform(frame);
  }

  function schedulePump() {
    if (pumpTimer) return;
    pumpTimer = scope.setTimeout(() => {
      pumpTimer = 0;
      const frame = latestFrame;
      latestFrame = null;
      if (frame) {
        render(frame);
        scope.postMessage({ type: 'rendered', sequence: frame.sequence, active: frame.active || [] });
      }
      if (latestFrame) schedulePump();
    }, 0);
  }

  scope.onmessage = (event) => {
    const message = event.data || {};
    if (message.type === 'init') {
      const requestedSurfaces = Array.isArray(message.surfaces) ? message.surfaces : [];
      const failed = [];
      for (const entry of requestedSurfaces) {
        try {
          const context = entry.canvas?.getContext?.('2d', { alpha: true, desynchronized: true });
          if (!context) {
            failed.push(entry.id);
            continue;
          }
          surfaces.set(entry.id, { canvas: entry.canvas, context, width: 640, height: 220, ratio: 1, gradient: null });
          configure(entry);
        } catch {
          surfaces.delete(entry.id);
          failed.push(entry.id);
        }
      }
      if (!requestedSurfaces.length || failed.length || surfaces.size !== requestedSurfaces.length) {
        scope.postMessage({ type: 'init-error', failed });
        return;
      }
      scope.postMessage({ type: 'ready', modules: [...surfaces.keys()] });
      return;
    }
    if (message.type === 'resize') {
      for (const entry of message.surfaces || []) configure(entry);
      return;
    }
    if (message.type === 'frame') {
      latestFrame = message;
      schedulePump();
    }
  };
})(self);
