(function createPlaybackCardRuntime(global) {
  'use strict';

  const THREE = global.THREE;
  const registry = new WeakMap();

  function fallbackArtwork(title = 'FE MONSTER', artist = '音乐播放', colors = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 720;
    const ctx = canvas.getContext('2d');
    const cssColor = (value, fallback) => {
      if (typeof value === 'string') {
        const candidate = value.trim();
        // Palette values can come from CSS serialization.  Reject malformed
        // strings before CanvasGradient.addColorStop throws and aborts the
        // card renderer.
        if (candidate && (!global.CSS?.supports || global.CSS.supports('color', candidate))) return candidate;
        return fallback;
      }
      if (value && typeof value === 'object') {
        const r = Number(value.r ?? value.red), g = Number(value.g ?? value.green), b = Number(value.b ?? value.blue);
        if ([r, g, b].every(Number.isFinite)) return `rgb(${r}, ${g}, ${b})`;
      }
      return fallback;
    };
    const a = cssColor(colors.a, '#223b46');
    const b = cssColor(colors.b, '#b27d62');
    const gradient = ctx.createLinearGradient(0, 0, 720, 720);
    gradient.addColorStop(0, a); gradient.addColorStop(1, b);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 720, 720);
    const glow = ctx.createRadialGradient(510, 160, 4, 510, 160, 240);
    glow.addColorStop(0, 'rgba(255,238,197,.88)'); glow.addColorStop(1, 'rgba(255,238,197,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 720, 720);
    ctx.fillStyle = 'rgba(7,14,18,.72)';
    ctx.beginPath(); ctx.moveTo(0, 620); ctx.lineTo(210, 310); ctx.lineTo(410, 560); ctx.lineTo(560, 380); ctx.lineTo(720, 610); ctx.lineTo(720, 720); ctx.lineTo(0, 720); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.font = '600 38px system-ui, sans-serif';
    ctx.fillText(String(title).slice(0, 22), 42, 590);
    ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.font = '24px system-ui, sans-serif';
    ctx.fillText(String(artist).slice(0, 28), 44, 632);
    return canvas;
  }

  function create(canvas) {
    if (!THREE || !canvas || !canvas.getContext) return null;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    } catch { return null; }
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 2;
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    const entry = { renderer, scene, camera, geometry, material, mesh, texture: null, artCanvas: null, frame: 0, started: false, tilt: 0, drawKey: '' };
    registry.set(canvas, entry);
    return entry;
  }

  function draw(entry, options = {}) {
    const art = fallbackArtwork(options.title, options.artist, options.colors);
    const source = options.imageUrl ? new Image() : null;
    entry.artCanvas = art;
    if (source) {
      source.decoding = 'async';
      source.onload = () => {
        const ctx = art.getContext('2d');
        ctx.clearRect(0, 0, art.width, art.height);
        const scale = Math.max(art.width / source.naturalWidth, art.height / source.naturalHeight);
        const width = source.naturalWidth * scale;
        const height = source.naturalHeight * scale;
        ctx.drawImage(source, (art.width - width) / 2, (art.height - height) / 2, width, height);
        const shade = ctx.createLinearGradient(0, 0, 0, art.height);
        shade.addColorStop(0, 'rgba(0,0,0,0)'); shade.addColorStop(0.72, 'rgba(0,0,0,.42)'); shade.addColorStop(1, 'rgba(0,0,0,.78)');
        ctx.fillStyle = shade; ctx.fillRect(0, 0, art.width, art.height);
        if (entry.texture) entry.texture.needsUpdate = true;
      };
      source.onerror = () => {};
      source.src = options.imageUrl;
    }
    if (entry.texture) entry.texture.dispose();
    entry.texture = new THREE.CanvasTexture(art);
    entry.texture.colorSpace = THREE.SRGBColorSpace || entry.texture.colorSpace;
    entry.texture.anisotropy = Math.min(entry.renderer.capabilities.getMaxAnisotropy?.() || 1, 4);
    entry.material.map = entry.texture;
    entry.material.needsUpdate = true;
  }

  function resize(entry, canvas) {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    entry.renderer.setSize(width, height, false);
  }

  function render(entry, canvas, now) {
    resize(entry, canvas);
    entry.tilt += (0.004 - entry.tilt) * 0.04;
    entry.mesh.rotation.z = Math.sin(now * 0.0003) * 0.0015;
    entry.renderer.render(entry.scene, entry.camera);
    if (entry.started) entry.frame = global.requestAnimationFrame((time) => render(entry, canvas, time));
  }

  function start(canvas, options = {}) {
    const entry = registry.get(canvas) || create(canvas);
    if (!entry) return false;
    if (options.title || options.artist || options.imageUrl || options.colors) {
      let colorKey = '';
      try { colorKey = JSON.stringify(options.colors || null); } catch { colorKey = String(options.colors || ''); }
      const drawKey = [options.imageUrl || '', options.title || '', options.artist || '', colorKey].join('\u0001');
      if (options.force || entry.drawKey !== drawKey) {
        draw(entry, options);
        entry.drawKey = drawKey;
      }
    }
    if (!entry.started) {
      entry.started = true;
      entry.frame = global.requestAnimationFrame((time) => render(entry, canvas, time));
    } else {
      resize(entry, canvas); entry.renderer.render(entry.scene, entry.camera);
    }
    return true;
  }

  function stop(canvas) {
    const entry = registry.get(canvas); if (!entry) return;
    entry.started = false; global.cancelAnimationFrame(entry.frame); entry.frame = 0;
  }

  function destroy(canvas) {
    const entry = registry.get(canvas); if (!entry) return;
    stop(canvas); entry.texture?.dispose(); entry.material.dispose(); entry.geometry.dispose(); entry.renderer.dispose(); registry.delete(canvas);
  }

  global.FEPlaybackCardRuntime = Object.freeze({ start, stop, destroy });
})(window);
