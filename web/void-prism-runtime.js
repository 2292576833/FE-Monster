(function attachVoidPrismRuntime(global) {
  'use strict';

  const TUNNEL_WIDTH = 19.2;
  const TUNNEL_HEIGHT = 11.4;
  const TUNNEL_FRONT = 22;
  const TUNNEL_BACK = -78;
  const TUNNEL_DEPTH = TUNNEL_FRONT - TUNNEL_BACK;
  const REFLECTION_SCALE = 1;
  const MATERIAL_SOURCE_RESOLUTION = 8192;
  const MATERIAL_RUNTIME_RESOLUTION = 4096;
  const MATERIAL_TEXTURE_URLS = Object.freeze({
    color: 'assets/void-prism/metal012/metal012-color-4k.jpg',
    roughness: 'assets/void-prism/metal012/metal012-roughness-4k.jpg',
    normal: 'assets/void-prism/metal012/metal012-normal-gl-4k.png',
    displacement: 'assets/void-prism/metal012/metal012-displacement-4k.jpg'
  });
  let disposeCount = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function createLyricTexture(THREE) {
    const canvas = document.createElement('canvas');
    canvas.width = 4096;
    canvas.height = 1024;
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    if ('encoding' in texture && THREE.sRGBEncoding !== undefined) texture.encoding = THREE.sRGBEncoding;
    return { canvas, texture };
  }

  function createReflectionStudio(THREE, reflectionScene) {
    reflectionScene.background = null;
    const group = new THREE.Group();
    group.name = 'VoidPrismReflectionStudio';
    group.visible = false;
    return {
      group,
      backdrop: null,
      cards: [],
      accents: [],
      geometries: [],
      materials: [],
      textures: [],
      disposed: false,
      cyclesEnvironment: {
        url: null,
        requested: false,
        ready: false,
        failed: false,
        texture: null,
        width: 0,
        height: 0
      }
    };
  }

  function createFallbackTexture(THREE, red, green, blue) {
    const texture = new THREE.DataTexture(
      new Uint8Array([red, green, blue, 255]),
      1,
      1,
      THREE.RGBAFormat
    );
    texture.needsUpdate = true;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  function createMaterialTextureSet(THREE) {
    const color = createFallbackTexture(THREE, 220, 229, 238);
    const roughness = createFallbackTexture(THREE, 4, 4, 4);
    const normal = createFallbackTexture(THREE, 128, 128, 255);
    const displacement = createFallbackTexture(THREE, 128, 128, 128);
    if ('encoding' in color && THREE.sRGBEncoding !== undefined) color.encoding = THREE.sRGBEncoding;
    return {
      color,
      roughness,
      normal,
      displacement,
      textures: new Set([color, roughness, normal, displacement]),
      materials: [],
      loaded: { color: false, roughness: false, normal: false, displacement: false },
      loadedCount: 0,
      failed: [],
      ready: false,
      disposed: false
    };
  }

  function configureMaterialTexture(THREE, renderer, texture, channel) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = Math.min(
      16,
      Math.max(1, renderer.capabilities && renderer.capabilities.getMaxAnisotropy
        ? renderer.capabilities.getMaxAnisotropy()
        : 1)
    );
    if (channel === 'color' && 'encoding' in texture && THREE.sRGBEncoding !== undefined) {
      texture.encoding = THREE.sRGBEncoding;
    }
    texture.needsUpdate = true;
  }

  function loadMaterialTextures(THREE, renderer, textureSet) {
    const loader = new THREE.TextureLoader();
    Object.entries(MATERIAL_TEXTURE_URLS).forEach(([channel, url]) => {
      loader.load(url, (texture) => {
        if (textureSet.disposed) {
          texture.dispose();
          return;
        }
        configureMaterialTexture(THREE, renderer, texture, channel);
        const fallback = textureSet[channel];
        textureSet.textures.delete(fallback);
        fallback.dispose();
        textureSet[channel] = texture;
        textureSet.textures.add(texture);
        textureSet.loaded[channel] = true;
        textureSet.loadedCount += 1;
        textureSet.ready = textureSet.loadedCount === Object.keys(MATERIAL_TEXTURE_URLS).length;
        textureSet.materials.forEach((material) => {
          material.uniforms[`tMaterial${channel[0].toUpperCase()}${channel.slice(1)}`].value = texture;
          material.uniforms.materialTextureReady.value = textureSet.ready ? 1 : 0;
        });
      }, undefined, () => {
        if (!textureSet.failed.includes(channel)) textureSet.failed.push(channel);
      });
    });
  }

  function colorCss(color, fallback) {
    if (!color || typeof color !== 'object') return fallback;
    const red = Math.round(clamp(color.r, 0, 255));
    const green = Math.round(clamp(color.g, 0, 255));
    const blue = Math.round(clamp(color.b, 0, 255));
    return `rgb(${red}, ${green}, ${blue})`;
  }

  function fitLyricFont(context, text, maximumWidth) {
    let size = 284;
    while (size > 108) {
      context.font = `900 ${size}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      if (context.measureText(text).width <= maximumWidth) break;
      size -= 8;
    }
    return size;
  }

  function setLyric(runtime, text, subtitle, palette) {
    if (!runtime || runtime.disposed) return false;
    const line = String(text || 'FE MONSTER').replace(/\s*\r?\n+\s*/g, ' ').trim() || 'FE MONSTER';
    const detail = String(subtitle || '').replace(/\s*\r?\n+\s*/g, ' ').trim();
    const primary = '#3f474c';
    const glow = 'transparent';
    const signature = `${line}|${detail}|${primary}|${glow}`;
    if (signature === runtime.lyricSignature) return false;

    const context = runtime.lyricCanvas.getContext('2d');
    const width = runtime.lyricCanvas.width;
    const height = runtime.lyricCanvas.height;
    context.clearRect(0, 0, width, height);
    const fontSize = fitLyricFont(context, line, width * 0.84);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `900 ${fontSize}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    context.shadowColor = glow;
    context.shadowBlur = 0;
    context.fillStyle = primary;
    context.fillText(line, width / 2, height * 0.47);

    if (detail) {
      context.shadowBlur = 0;
      context.font = '700 84px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
      context.fillStyle = 'rgba(63, 71, 76, 0.72)';
      context.fillText(detail, width / 2, height * 0.73);
    }

    runtime.lyricTexture.needsUpdate = true;
    runtime.lyricSignature = signature;
    runtime.lyricText = line;
    runtime.lyricUpdates += 1;
    runtime.reflectionDirty = true;
    return true;
  }

  function createMirrorMaterial(THREE, target, textureSet, materialRepeat, materialOffset) {
    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
      toneMapped: false,
      uniforms: {
        tReflection: { value: target.texture },
        tMaterialColor: { value: textureSet.color },
        tMaterialRoughness: { value: textureSet.roughness },
        tMaterialNormal: { value: textureSet.normal },
        tMaterialDisplacement: { value: textureSet.displacement },
        textureMatrix: { value: new THREE.Matrix4() },
        materialRepeat: { value: new THREE.Vector2(materialRepeat[0], materialRepeat[1]) },
        materialOffset: { value: new THREE.Vector2(materialOffset[0], materialOffset[1]) },
        materialTextureReady: { value: textureSet.ready ? 1 : 0 },
        baseColor: { value: new THREE.Color(1, 1, 1) },
        metallic: { value: 1 },
        roughness: { value: 0 },
        ior: { value: 1.5 },
        alpha: { value: 1 },
        reflectionStrength: { value: 1 },
        reflectionContrast: { value: 1 },
        gloss: { value: 1 }
      },
      vertexShader: `
        uniform mat4 textureMatrix;
        uniform sampler2D tMaterialDisplacement;
        uniform vec2 materialRepeat;
        uniform vec2 materialOffset;
        uniform float materialTextureReady;
        varying vec4 vReflectionCoord;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;

        void main() {
          vec3 displacedPosition = position;
          vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
          vReflectionCoord = textureMatrix * vec4(displacedPosition, 1.0);
          vWorldPosition = worldPosition.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D tReflection;
        uniform sampler2D tMaterialColor;
        uniform sampler2D tMaterialRoughness;
        uniform sampler2D tMaterialNormal;
        uniform vec2 materialRepeat;
        uniform vec2 materialOffset;
        uniform float materialTextureReady;
        uniform vec3 baseColor;
        uniform float metallic;
        uniform float roughness;
        uniform float ior;
        uniform float alpha;
        uniform float reflectionStrength;
        uniform float reflectionContrast;
        uniform float gloss;
        varying vec4 vReflectionCoord;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;

        void main() {
          float inverseW = 1.0 / max(0.0001, vReflectionCoord.w);
          vec2 uv = clamp(vReflectionCoord.xy * inverseW, vec2(0.001), vec2(0.999));
          vec3 normal = normalize(vWorldNormal);
          float surfaceRoughness = max(roughness, 1.0 - gloss);
          vec4 reflection = texture2D(tReflection, uv);

          vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
          float facing = clamp(abs(dot(normal, viewDirection)), 0.0, 1.0);
          float fresnelEdge = pow(1.0 - facing, 5.0);
          vec3 reflectionDirection = normalize(reflect(-viewDirection, normal));
          float directionTone = smoothstep(-0.45, 0.45, reflectionDirection.y);
          float verticalArc = smoothstep(0.0, 1.0, 1.0 - abs(uv.y - 0.48) * 2.0);
          float horizontalRoll = smoothstep(0.0, 1.0, 1.0 - abs(uv.x - 0.5) * 2.0);
          vec2 keyDelta = (uv - vec2(0.30, 0.68)) * vec2(0.85, 0.72);
          float keyLobe = exp(-dot(keyDelta, keyDelta) * 12.0);
          float silverLuminance = 0.035 + directionTone * 0.10 + verticalArc * 0.18
            + horizontalRoll * 0.04 + keyLobe * 0.38;
          vec3 silverField = vec3(silverLuminance);
          float lyricMask = clamp(reflection.a, 0.0, 1.0);
          vec3 lyricColor = clamp(reflection.rgb / max(lyricMask, 0.0001), 0.0, 1.0);
          vec3 reflectedScene = mix(silverField, lyricColor, lyricMask);
          float safeIor = max(1.0001, ior);
          float dielectricF0 = pow((safeIor - 1.0) / (safeIor + 1.0), 2.0);
          vec3 f0 = mix(vec3(dielectricF0), baseColor, clamp(metallic, 0.0, 1.0));
          vec3 fresnel = f0 + (vec3(1.0) - f0) * fresnelEdge;
          vec3 color = reflectedScene * fresnel * reflectionStrength;
          color = mix(color, baseColor * dot(color, vec3(0.2126, 0.7152, 0.0722)), clamp(surfaceRoughness, 0.0, 1.0));
          color = (color - vec3(0.5)) * reflectionContrast + vec3(0.5);
          gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha);
          #include <encodings_fragment>
        }
      `
    });
    textureSet.materials.push(material);
    return material;
  }

  function createMirror(THREE, renderer, textureSet, geometry, position, rotation, name, materialRepeat, materialOffset) {
    const target = new THREE.WebGLRenderTarget(512, 512, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false
    });
    target.texture.generateMipmaps = false;
    if ('encoding' in target.texture && THREE.LinearEncoding !== undefined) target.texture.encoding = THREE.LinearEncoding;
    const material = createMirrorMaterial(THREE, target, textureSet, materialRepeat, materialOffset);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.position.copy(position);
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    mesh.userData.prismMirror = {
      target,
      virtualCamera: new THREE.PerspectiveCamera(),
      textureMatrix: material.uniforms.textureMatrix.value,
      worldPosition: new THREE.Vector3(),
      cameraPosition: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      rotationMatrix: new THREE.Matrix4(),
      lookAtPosition: new THREE.Vector3(),
      view: new THREE.Vector3(),
      targetPosition: new THREE.Vector3()
    };
    return mesh;
  }

  function updateMirrorCamera(runtime, mirror) {
    const data = mirror.userData.prismMirror;
    const camera = runtime.camera;
    mirror.updateMatrixWorld(true);
    data.worldPosition.setFromMatrixPosition(mirror.matrixWorld);
    data.cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    data.rotationMatrix.extractRotation(mirror.matrixWorld);
    data.normal.set(0, 0, 1).applyMatrix4(data.rotationMatrix).normalize();
    data.view.subVectors(data.worldPosition, data.cameraPosition);
    if (data.view.dot(data.normal) > 0) return false;

    data.view.reflect(data.normal).negate().add(data.worldPosition);
    data.rotationMatrix.extractRotation(camera.matrixWorld);
    data.lookAtPosition.set(0, 0, -1).applyMatrix4(data.rotationMatrix).add(data.cameraPosition);
    data.targetPosition.subVectors(data.worldPosition, data.lookAtPosition);
    data.targetPosition.reflect(data.normal).negate().add(data.worldPosition);

    const virtualCamera = data.virtualCamera;
    virtualCamera.position.copy(data.view);
    virtualCamera.up.set(0, 1, 0).applyMatrix4(data.rotationMatrix).reflect(data.normal).normalize();
    virtualCamera.lookAt(data.targetPosition);
    virtualCamera.near = camera.near;
    virtualCamera.far = camera.far;
    virtualCamera.projectionMatrix.copy(camera.projectionMatrix);
    virtualCamera.updateMatrixWorld(true);
    virtualCamera.matrixWorldInverse.copy(virtualCamera.matrixWorld).invert();

    data.textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );
    data.textureMatrix.multiply(virtualCamera.projectionMatrix);
    data.textureMatrix.multiply(virtualCamera.matrixWorldInverse);
    data.textureMatrix.multiply(mirror.matrixWorld);
    return true;
  }

  function renderReflections(runtime) {
    const renderer = runtime.renderer;
    const previousTarget = renderer.getRenderTarget ? renderer.getRenderTarget() : null;
    const previousXr = renderer.xr ? renderer.xr.enabled : false;
    const previousShadowAutoUpdate = renderer.shadowMap ? renderer.shadowMap.autoUpdate : false;
    const previousAutoClear = renderer.autoClear;
    const previousClearColor = renderer.getClearColor(runtime.previousClearColor);
    const previousClearAlpha = renderer.getClearAlpha();
    runtime.lyricSource.visible = true;
    runtime.camera.updateMatrixWorld(true);
    if (renderer.xr) renderer.xr.enabled = false;
    if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);

    runtime.mirrors.forEach((mirror) => {
      if (!updateMirrorCamera(runtime, mirror)) return;
      const data = mirror.userData.prismMirror;
      renderer.setRenderTarget(data.target);
      renderer.render(runtime.reflectionScene, data.virtualCamera);
      runtime.reflectionPasses += 1;
    });

    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    renderer.autoClear = previousAutoClear;
    if (renderer.xr) renderer.xr.enabled = previousXr;
    if (renderer.shadowMap) renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
    runtime.lyricSource.visible = false;
  }

  function resize(runtime, pixelRatio) {
    if (!runtime || runtime.disposed) return false;
    const rect = runtime.host.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const ratio = clamp(pixelRatio || global.devicePixelRatio || 1, 0.5, 1.8);
    if (runtime.width === width && runtime.height === height && Math.abs(runtime.pixelRatio - ratio) < 0.01) return false;
    runtime.width = width;
    runtime.height = height;
    runtime.pixelRatio = ratio;
    if (runtime.renderQuality) runtime.renderQuality.resize(width, height, ratio);
    else {
      runtime.renderer.setPixelRatio(ratio);
      runtime.renderer.setSize(width, height, false);
    }
    runtime.camera.aspect = width / Math.max(1, height);
    runtime.camera.updateProjectionMatrix();
    const targetWidth = Math.round(clamp(width * ratio * REFLECTION_SCALE, 640, 2560));
    const targetHeight = Math.round(clamp(height * ratio * REFLECTION_SCALE, 360, 1440));
    runtime.mirrors.forEach((mirror) => {
      const data = mirror.userData.prismMirror;
      data.target.setSize(targetWidth, targetHeight);
    });
    runtime.reflectionWidth = targetWidth;
    runtime.reflectionHeight = targetHeight;
    runtime.reflectionDirty = true;
    return true;
  }

  function update(runtime, frame) {
    if (!runtime || runtime.disposed) return false;
    const startedAt = performance.now();
    const now = Number(frame && frame.now) || performance.now();
    if (!runtime.lastResizeAt || now - runtime.lastResizeAt > 300) {
      resize(runtime, frame && frame.pixelRatio);
      runtime.lastResizeAt = now;
    }

    const yaw = Number(frame && frame.yaw) || 0;
    const pitch = clamp(Number(frame && frame.pitch) || 0, -1.2, 1.2);
    const zoom = clamp(Number(frame && frame.zoom) || 1, 0.58, 2.35);
    const lyricTransformChanged = runtime.lyricRotation.x !== pitch
      || runtime.lyricRotation.y !== yaw
      || runtime.lyricScale !== zoom;
    if (lyricTransformChanged) {
      runtime.lyricSource.rotation.set(pitch, yaw, 0);
      runtime.lyricSource.scale.setScalar(zoom);
      runtime.lyricSource.updateMatrixWorld(true);
      runtime.lyricRotation.set(pitch, yaw, 0);
      runtime.lyricScale = zoom;
      runtime.reflectionDirty = true;
    }

    const energy = clamp(frame && frame.energy, 0, 1.25);
    runtime.seamMaterial.opacity = 0.14 + energy * 0.02;
    runtime.lyricMaterial.opacity = 1;
    if (runtime.reflectionDirty) {
      renderReflections(runtime);
      runtime.reflectionDirty = false;
    }
    if (runtime.renderQuality) runtime.renderQuality.render(runtime.scene, runtime.camera, now);
    else runtime.renderer.render(runtime.scene, runtime.camera);
    runtime.frameCount += 1;
    runtime.drawCalls = Number(runtime.renderer.info && runtime.renderer.info.render && runtime.renderer.info.render.calls) || 0;
    runtime.lastUpdateMs = performance.now() - startedAt;
    runtime.averageUpdateMs = runtime.averageUpdateMs
      ? runtime.averageUpdateMs * 0.92 + runtime.lastUpdateMs * 0.08
      : runtime.lastUpdateMs;
    return true;
  }

  function create(host, options) {
    const THREE = global.THREE;
    if (!host || !THREE) return null;
    const config = options || {};
    const renderer = typeof config.createRenderer === 'function'
      ? config.createRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
      : new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0xb7bcc0, 1);
    if ('outputEncoding' in renderer && THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    if ('toneMapping' in renderer && THREE.ACESFilmicToneMapping !== undefined) renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;
    renderer.domElement.className = 'void-prism-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.replaceChildren(renderer.domElement);
    let renderQuality = null;
    try {
      renderQuality = global.FeRenderQuality?.create?.(renderer, {
        THREE,
        mode: 'native',
        initialScale: 1,
        minScale: 0.5,
        maxScale: 1,
        sharpness: 0.2
      }) || null;
    } catch (error) {
      renderQuality = null;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb7bcc0);
    scene.fog = new THREE.Fog(0xb7bcc0, 72, 132);
    const reflectionScene = new THREE.Scene();
    const reflectionStudio = createReflectionStudio(THREE, reflectionScene);
    const camera = new THREE.PerspectiveCamera(61, 1, 0.1, 180);
    camera.position.set(0, 0, 17.8);
    camera.lookAt(0, 0, -29);
    const materialTextures = createMaterialTextureSet(THREE);

    const horizontalGeometry = new THREE.PlaneGeometry(TUNNEL_WIDTH, TUNNEL_DEPTH, 64, 256);
    const verticalGeometry = new THREE.PlaneGeometry(TUNNEL_DEPTH, TUNNEL_HEIGHT, 256, 64);
    const middleZ = (TUNNEL_FRONT + TUNNEL_BACK) * 0.5;
    const mirrors = [
      createMirror(
        THREE, renderer, materialTextures, horizontalGeometry,
        new THREE.Vector3(0, -TUNNEL_HEIGHT * 0.5, middleZ),
        new THREE.Euler(-Math.PI * 0.5, 0, 0),
        'VoidPrismBottom', [1.75, 9], [0.13, 0.31]
      ),
      createMirror(
        THREE, renderer, materialTextures, horizontalGeometry,
        new THREE.Vector3(0, TUNNEL_HEIGHT * 0.5, middleZ),
        new THREE.Euler(Math.PI * 0.5, 0, 0),
        'VoidPrismTop', [1.75, 9], [0.61, 0.07]
      ),
      createMirror(
        THREE, renderer, materialTextures, verticalGeometry,
        new THREE.Vector3(-TUNNEL_WIDTH * 0.5, 0, middleZ),
        new THREE.Euler(0, Math.PI * 0.5, 0),
        'VoidPrismLeft', [8.75, 1], [0.27, 0.53]
      ),
      createMirror(
        THREE, renderer, materialTextures, verticalGeometry,
        new THREE.Vector3(TUNNEL_WIDTH * 0.5, 0, middleZ),
        new THREE.Euler(0, -Math.PI * 0.5, 0),
        'VoidPrismRight', [8.75, 1], [0.74, 0.19]
      )
    ];
    mirrors.forEach((mirror) => scene.add(mirror));
    materialTextures.ready = true;

    const seamGeometry = new THREE.BoxGeometry(0.035, 0.035, TUNNEL_DEPTH);
    const seamMaterial = new THREE.MeshBasicMaterial({
      color: 0x8f969b,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      toneMapped: false
    });
    const seams = [
      [-TUNNEL_WIDTH * 0.5, -TUNNEL_HEIGHT * 0.5],
      [TUNNEL_WIDTH * 0.5, -TUNNEL_HEIGHT * 0.5],
      [-TUNNEL_WIDTH * 0.5, TUNNEL_HEIGHT * 0.5],
      [TUNNEL_WIDTH * 0.5, TUNNEL_HEIGHT * 0.5]
    ].map(([x, y], index) => {
      const seam = new THREE.Mesh(seamGeometry, seamMaterial);
      seam.name = `VoidPrismSeam${index + 1}`;
      seam.position.set(x, y, middleZ);
      seam.frustumCulled = false;
      seam.renderOrder = 3;
      scene.add(seam);
      return seam;
    });

    const backGeometry = new THREE.PlaneGeometry(TUNNEL_WIDTH, TUNNEL_HEIGHT);
    const backMaterial = new THREE.MeshBasicMaterial({
      color: 0x4e4e4e,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const back = new THREE.Mesh(backGeometry, backMaterial);
    back.position.set(0, 0, TUNNEL_BACK - 0.06);
    scene.add(back);

    const lyricData = createLyricTexture(THREE);
    const lyricGeometry = new THREE.PlaneGeometry(13.2, 3.3);
    const lyricMaterial = new THREE.MeshBasicMaterial({
      map: lyricData.texture,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      toneMapped: false
    });
    const lyricSource = new THREE.Mesh(lyricGeometry, lyricMaterial);
    lyricSource.name = 'VoidPrismLyricSource';
    lyricSource.position.set(0, 0.25, -22);
    lyricSource.visible = false;
    reflectionScene.add(lyricSource);

    scene.add(new THREE.HemisphereLight(0xf7fbff, 0x8c9299, 0.62));
    const seamLight = new THREE.PointLight(0xf2f7fb, 0.34, 42, 2);
    seamLight.position.set(0, 0, 10);
    scene.add(seamLight);

    const runtime = {
      THREE,
      host,
      renderer,
      renderQuality,
      scene,
      reflectionScene,
      reflectionStudio,
      camera,
      mirrors,
      seams,
      materialTextures,
      horizontalGeometry,
      verticalGeometry,
      seamGeometry,
      seamMaterial,
      backGeometry,
      backMaterial,
      lyricGeometry,
      lyricMaterial,
      lyricSource,
      lyricCanvas: lyricData.canvas,
      lyricTexture: lyricData.texture,
      lyricSignature: '',
      lyricText: '',
      lyricUpdates: 0,
      reflectionPasses: 0,
      reflectionDirty: true,
      reflectionWidth: 0,
      reflectionHeight: 0,
      frameCount: 0,
      drawCalls: 0,
      width: 0,
      height: 0,
      pixelRatio: 0,
      lastResizeAt: 0,
      lastUpdateMs: 0,
      averageUpdateMs: 0,
      lyricRotation: new THREE.Euler(),
      previousClearColor: new THREE.Color(),
      lyricScale: 1,
      disposed: false
    };
    runtime.handleContextRestored = () => {
      runtime.reflectionDirty = true;
    };
    renderer.domElement.addEventListener('webglcontextrestored', runtime.handleContextRestored);
    setLyric(runtime, config.lyric, config.subtitle, config.palette);
    resize(runtime, config.pixelRatio);
    update(runtime, { now: performance.now(), yaw: 0, pitch: 0, zoom: 1, energy: 0, bass: 0, pixelRatio: config.pixelRatio });
    return runtime;
  }

  function setRenderQuality(runtime, request) {
    if (!runtime || runtime.disposed || !runtime.renderQuality) {
      return { enabled: false, backend: 'direct', fallbackReason: 'pipeline-unavailable', renderScale: 1 };
    }
    return runtime.renderQuality.setMode(request || 'native');
  }

  function diagnostics(runtime) {
    if (!runtime || runtime.disposed) {
      return {
        active: false,
        disposed: true,
        disposeCount,
        canvasCount: runtime && runtime.host ? runtime.host.querySelectorAll('canvas').length : 0,
        materialTextureCount: runtime && runtime.materialTextures ? runtime.materialTextures.textures.size : 0,
        materialTexturesDisposed: Boolean(runtime && runtime.materialTextures && runtime.materialTextures.disposed)
      };
    }
    return {
      active: true,
      disposed: false,
      authoringRenderer: 'blender-cycles-5.1.2',
      liveRenderer: 'three-webgl-planar-reflection',
      cyclesEnvironmentUrl: runtime.reflectionStudio.cyclesEnvironment.url,
      cyclesEnvironmentRequested: runtime.reflectionStudio.cyclesEnvironment.requested,
      cyclesEnvironmentReady: runtime.reflectionStudio.cyclesEnvironment.ready,
      cyclesEnvironmentFailed: runtime.reflectionStudio.cyclesEnvironment.failed,
      cyclesEnvironmentResolution: [
        runtime.reflectionStudio.cyclesEnvironment.width,
        runtime.reflectionStudio.cyclesEnvironment.height
      ],
      cyclesEnvironmentMapping: 'disabled-for-lyric-only-reflection',
      cyclesEnvironmentContent: 'lyric-canvas-only',
      usesCyclesOutput: false,
      usesCyclesAuthoringReference: true,
      disposeCount,
      canvasCount: runtime.host.querySelectorAll('canvas').length,
      mirrorCount: runtime.mirrors.length,
      seamCount: runtime.seams.length,
      tunnelDepth: TUNNEL_DEPTH,
      planarReflections: true,
      recursiveReflectionFrames: false,
      lyricOnlyReflection: true,
      lyricReflectionPolicy: 'all-four-mirrors-only',
      lyricReflectionMirrorCount: runtime.mirrors.length,
      lyricReflectionOpacity: Number(runtime.lyricMaterial.opacity.toFixed(3)),
      reflectionBackgroundTransparent: runtime.reflectionScene.background === null,
      nonRecursiveStudioReflection: runtime.reflectionScene.children.length === 1
        && runtime.reflectionScene.children.includes(runtime.lyricSource),
      reflectionSceneObjectCount: runtime.reflectionScene.children.length,
      darkScenePanels: false,
      blackMirrorBorders: false,
      seamTone: 'neutral-silver',
      backgroundMode: 'transparent-lyric-reflection-target',
      seamStrength: 'reference-hairline',
      cameraMotionMode: 'locked',
      interactionTarget: 'lyric-only',
      lyricRotation: [
        Number(runtime.lyricRotation.x.toFixed(4)),
        Number(runtime.lyricRotation.y.toFixed(4)),
        Number(runtime.lyricRotation.z.toFixed(4))
      ],
      lyricScale: Number(runtime.lyricScale.toFixed(4)),
      lyricColorMode: 'graphite-on-neutral-silver',
      foregroundLyricProfile: 'single-layer-clean-graphite',
      reflectionStrength: 'true-planar-studio-mirror',
      toneMappingExposure: 0.88,
      reflectionPasses: runtime.reflectionPasses,
      reflectionDirty: runtime.reflectionDirty,
      reflectionResolution: [runtime.reflectionWidth, runtime.reflectionHeight],
      lyricTextureResolution: [runtime.lyricCanvas.width, runtime.lyricCanvas.height],
      reflectionSampling: 'optical-single-tap-planar',
      reflectionColorPipeline: 'linear-planar-alpha-mask-srgb-output',
      mirrorMaterial: {
        type: 'principled-bsdf-tutorial-planar-mirror',
        shaderModel: 'principled-bsdf-tutorial-equivalent',
        baseColor: runtime.mirrors[0].material.uniforms.baseColor.value.toArray(),
        roughness: runtime.mirrors[0].material.uniforms.roughness.value,
        roughnessRange: [0, 0],
        fresnel: true,
        metallic: runtime.mirrors[0].material.uniforms.metallic.value,
        ior: runtime.mirrors[0].material.uniforms.ior.value,
        alpha: runtime.mirrors[0].material.uniforms.alpha.value,
        reflectivity: runtime.mirrors[0].material.uniforms.reflectionStrength.value,
        reflectionContrast: runtime.mirrors[0].material.uniforms.reflectionContrast.value,
        gloss: runtime.mirrors[0].material.uniforms.gloss.value,
        normalStrength: 0,
        displacementAmplitude: 0,
        polishLevel: 1,
        reflectionClarity: 'optical-mirror',
        albedoPolishCompression: 1,
        materialBlend: 0,
        microtextureInfluence: 0,
        proceduralBase: false,
        silverBacking: false,
        glassFrontLayer: false,
        clearcoatSheen: false,
        chromeFinish: true,
        fresnelEdgeBoost: true,
        opticallySmooth: true,
        shadowFloor: 0,
        textureInfluence: 0,
        mirrorDefinition: 'tutorial-pure-white-metallic-zero-roughness'
      },
      surfaceTexture: {
        source: 'none-principled-tutorial',
        sourceResolution: [0, 0],
        runtimeResolution: [0, 0],
        layers: 0,
        loadedLayers: 0,
        ready: true,
        failedLayers: [],
        channels: {
          color: false,
          roughness: false,
          normalGL: false,
          displacement: false,
          metalness: 'uniform-1.0'
        },
        coordinateSpace: 'none',
        screenSpaceNoise: false,
        intensity: 'loaded-zero-visible-influence',
        clarity: 'perfect-optical',
        detailResolution: 0,
        silverMembrane: false,
        directionalBrushing: false,
        glassMicroImpurities: false,
        surfaceNoise: 'none-visible',
        scratches: false,
        stains: false,
        rust: false,
        bump: 'disabled-for-optical-polish',
        displacement: 'disabled-for-optical-polish',
        displacementAmplitude: 0,
        renderedSurfaceVertices: 66820,
        anisotropy: 0,
        textureTiling: null,
        textureOffsets: 'none',
        studioEnvironment: 'none-lyric-only',
        softboxCount: 0,
        softboxScale: 'none',
        ovalReflectionAccentCount: runtime.reflectionStudio.accents.filter((accent) => accent.visible).length,
        darkFlagCount: 0,
        silverShadeBandCount: 0,
        silverShadeCardCount: 0,
        stripReflectionCount: 0,
        stripObjectsRemoved: true,
        reflectionContrast: 'tutorial-neutral-no-post-contrast',
        reflectionContrastCurve: runtime.mirrors[0].material.uniforms.reflectionContrast.value,
        reflectionContrastStructure: 'lyric-alpha-on-continuous-silver-field',
        luminanceProfile: 'clean-neutral-midrange',
        silverToneProfile: 'view-directed-field-with-broad-soft-key',
        specularLightProfile: 'single-broad-elliptical-lobe',
        specularObjectCount: 0,
        highlightClipping: false,
        highlightCompression: 'soft-subwhite-rolloff',
        whiteHazeSuppression: true,
        environmentLightingShape: 'none',
        environmentReflectionLobes: 0,
        referenceSource: 'user-video-blender-principled-mirror-tutorial',
        blackFlagMode: 'none',
        blackAreaSuppression: true,
        lyricReflectionPolish: 'alpha-isolated-zero-haze-optical-edge',
        lyricReflectionScale: 'all-four-surfaces',
        lyricDoublePaint: false,
        chromeF0: [1, 1, 1],
        perSurfaceLightOffset: false,
        beamSuppression: true,
        spectralRim: 'achromatic-neutral',
        environmentReflection: false,
        environmentBackdrop: 'transparent-reflection-target',
        environmentBackdropResolution: [0, 0],
        reflectionParallax: false,
        orientationAwareLighting: true,
        linearLightCount: 0,
        renderProfile: 'tutorial-principled-lyric-only-planar-mirror',
        backPanelProfile: 'blended-neutral-silver',
        targetAspect: '16:9'
      },
      lyricText: runtime.lyricText,
      lyricSignature: runtime.lyricSignature,
      lyricUpdates: runtime.lyricUpdates,
      frameCount: runtime.frameCount,
      drawCalls: runtime.drawCalls,
      lastUpdateMs: Number(runtime.lastUpdateMs.toFixed(3)),
      averageUpdateMs: Number(runtime.averageUpdateMs.toFixed(3)),
      renderQuality: runtime.renderQuality?.getDiagnostics?.() || null
    };
  }

  function dispose(runtime) {
    if (!runtime || runtime.disposed) return false;
    runtime.disposed = true;
    runtime.mirrors.forEach((mirror) => {
      mirror.userData.prismMirror.target.dispose();
      mirror.material.dispose();
    });
    runtime.materialTextures.disposed = true;
    runtime.materialTextures.textures.forEach((texture) => texture.dispose());
    runtime.materialTextures.textures.clear();
    runtime.horizontalGeometry.dispose();
    runtime.verticalGeometry.dispose();
    runtime.seamGeometry.dispose();
    runtime.seamMaterial.dispose();
    runtime.backGeometry.dispose();
    runtime.backMaterial.dispose();
    runtime.lyricGeometry.dispose();
    runtime.lyricMaterial.dispose();
    runtime.lyricTexture.dispose();
    runtime.reflectionStudio.disposed = true;
    runtime.reflectionStudio.geometries.forEach((geometry) => geometry.dispose());
    runtime.reflectionStudio.materials.forEach((material) => material.dispose());
    runtime.reflectionStudio.textures.forEach((texture) => texture.dispose());
    runtime.renderQuality?.dispose?.();
    runtime.renderer.domElement.removeEventListener('webglcontextrestored', runtime.handleContextRestored);
    if (runtime.renderer.renderLists && typeof runtime.renderer.renderLists.dispose === 'function') runtime.renderer.renderLists.dispose();
    if (typeof runtime.renderer.dispose === 'function') runtime.renderer.dispose();
    if (typeof runtime.renderer.forceContextLoss === 'function') runtime.renderer.forceContextLoss();
    runtime.renderer.domElement.remove();
    disposeCount += 1;
    return true;
  }

  global.FeVoidPrismRuntime = Object.freeze({
    create,
    update,
    resize,
    setRenderQuality,
    setLyric,
    diagnostics,
    dispose
  });
})(window);
