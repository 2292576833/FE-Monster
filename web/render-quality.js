/*
 * FE Monster adaptive-spatial renderer for Three.js r128 / WebGL2.
 *
 * Reference and license boundary:
 * - The edge-adaptive upscaling and contrast-adaptive sharpening concepts are
 *   informed by AMD FidelityFX Super Resolution 1 (EASU/RCAS), whose reference
 *   source is published under the MIT License:
 *   https://github.com/GPUOpen-Effects/FidelityFX-FSR/blob/master/LICENSE.txt
 * - This file is an original, simplified WebGL fragment-shader implementation.
 *   It is not a line-by-line port of AMD source and is not an official AMD
 *   FidelityFX implementation. Its public name and diagnostics are therefore
 *   deliberately "adaptive-spatial", never FSR or DLSS.
 */
(function attachRenderQuality(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FeRenderQuality = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function renderQualityFactory(root) {
  'use strict';

  const ALGORITHM = 'adaptive-spatial';
  const VERSION = '1.0.1';
  const MODE_PRESETS = Object.freeze({
    auto: Object.freeze({ enabled: true, dynamic: true, scale: 0.77 }),
    'ultra-quality': Object.freeze({ enabled: true, dynamic: false, scale: 0.77 }),
    quality: Object.freeze({ enabled: true, dynamic: false, scale: 0.67 }),
    balanced: Object.freeze({ enabled: true, dynamic: false, scale: 0.59 }),
    performance: Object.freeze({ enabled: true, dynamic: false, scale: 0.5 }),
    native: Object.freeze({ enabled: false, dynamic: false, scale: 1 }),
    off: Object.freeze({ enabled: false, dynamic: false, scale: 1 })
  });

  const FULLSCREEN_VERTEX_SHADER = `
    precision highp float;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  // Original edge-directed elliptical reconstruction. It follows the broad
  // EASU idea (detect a local edge, then reconstruct along it), but none of the
  // official EASU shader constants or source expressions are copied here.
  const EDGE_UPSCALE_FRAGMENT_SHADER = `
    precision highp float;
    uniform sampler2D uInput;
    uniform vec2 uInputSize;
    uniform vec2 uInvInputSize;
    varying vec2 vUv;

    float adaptiveLuma(vec3 color) {
      return dot(color, vec3(0.2126, 0.7152, 0.0722));
    }

    vec4 adaptiveSamplePixel(vec2 pixelPosition) {
      vec2 uv = (pixelPosition + 0.5) * uInvInputSize;
      return texture2D(uInput, clamp(uv, vec2(0.0), vec2(1.0)));
    }

    void adaptiveTap(
      vec2 tapPosition,
      vec2 sourcePosition,
      vec2 tangent,
      vec2 normal,
      float edgeStrength,
      inout vec3 colorSum,
      inout float weightSum
    ) {
      vec2 offset = tapPosition - sourcePosition;
      float alongEdge = dot(offset, tangent);
      float acrossEdge = dot(offset, normal);
      float acrossCompression = mix(1.0, 1.85, edgeStrength);
      float radiusSquared = alongEdge * alongEdge
        + acrossEdge * acrossEdge * acrossCompression * acrossCompression;
      float weight = max(0.0, 1.0 - radiusSquared * 0.25);
      weight *= weight;
      colorSum += adaptiveSamplePixel(tapPosition).rgb * weight;
      weightSum += weight;
    }

    void main() {
      vec2 sourcePosition = vUv * uInputSize - 0.5;
      vec2 basePixel = floor(sourcePosition);
      vec4 centerSample = adaptiveSamplePixel(sourcePosition);
      float leftLuma = adaptiveLuma(adaptiveSamplePixel(sourcePosition + vec2(-1.0, 0.0)).rgb);
      float rightLuma = adaptiveLuma(adaptiveSamplePixel(sourcePosition + vec2(1.0, 0.0)).rgb);
      float downLuma = adaptiveLuma(adaptiveSamplePixel(sourcePosition + vec2(0.0, -1.0)).rgb);
      float upLuma = adaptiveLuma(adaptiveSamplePixel(sourcePosition + vec2(0.0, 1.0)).rgb);
      float centerLuma = adaptiveLuma(centerSample.rgb);

      vec2 gradient = vec2(rightLuma - leftLuma, upLuma - downLuma);
      float gradientLength = length(gradient);
      float normalizedGradient = gradientLength / max(0.08, centerLuma + 0.08);
      float edgeStrength = smoothstep(0.025, 0.24, normalizedGradient);
      vec2 normal = gradientLength > 0.00001 ? gradient / gradientLength : vec2(0.0, 1.0);
      vec2 tangent = vec2(-normal.y, normal.x);

      vec3 colorSum = vec3(0.0);
      float weightSum = 0.0;
      adaptiveTap(basePixel + vec2(-1.0, -1.0), sourcePosition, tangent, normal, edgeStrength, colorSum, weightSum);
      adaptiveTap(basePixel + vec2( 0.0, -1.0), sourcePosition, tangent, normal, edgeStrength, colorSum, weightSum);
      adaptiveTap(basePixel + vec2( 1.0, -1.0), sourcePosition, tangent, normal, edgeStrength, colorSum, weightSum);
      adaptiveTap(basePixel + vec2( 2.0, -1.0), sourcePosition, tangent, normal, edgeStrength, colorSum, weightSum);
      adaptiveTap(basePixel + vec2(-1.0,  0.0), sourcePosition, tangent, normal, edgeStrength, colorSum, weightSum);
      adaptiveTap(basePixel + vec2( 0.0,  0.0), sourcePosition, tangent, normal, edgeStrength, colorSum, weightSum);
      adaptiveTap(basePixel + vec2( 1.0,  0.0), sourcePosition, tangent, normal, edgeStrength, colorSum, weightSum);
      adaptiveTap(basePixel + vec2( 2.0,  0.0), sourcePosition, tangent, normal, edgeStrength, colorSum, weightSum);
      adaptiveTap(basePixel + vec2(-1.0,  1.0), sourcePosition, tangent, normal, edgeStrength, colorSum, weightSum);
      adaptiveTap(basePixel + vec2( 0.0,  1.0), sourcePosition, tangent, normal, edgeStrength, colorSum, weightSum);
      adaptiveTap(basePixel + vec2( 1.0,  1.0), sourcePosition, tangent, normal, edgeStrength, colorSum, weightSum);
      adaptiveTap(basePixel + vec2( 2.0,  1.0), sourcePosition, tangent, normal, edgeStrength, colorSum, weightSum);
      adaptiveTap(basePixel + vec2(-1.0,  2.0), sourcePosition, tangent, normal, edgeStrength, colorSum, weightSum);
      adaptiveTap(basePixel + vec2( 0.0,  2.0), sourcePosition, tangent, normal, edgeStrength, colorSum, weightSum);
      adaptiveTap(basePixel + vec2( 1.0,  2.0), sourcePosition, tangent, normal, edgeStrength, colorSum, weightSum);
      adaptiveTap(basePixel + vec2( 2.0,  2.0), sourcePosition, tangent, normal, edgeStrength, colorSum, weightSum);

      vec3 reconstructed = colorSum / max(weightSum, 0.00001);
      vec3 localMin = min(
        min(adaptiveSamplePixel(basePixel).rgb, adaptiveSamplePixel(basePixel + vec2(1.0, 0.0)).rgb),
        min(adaptiveSamplePixel(basePixel + vec2(0.0, 1.0)).rgb, adaptiveSamplePixel(basePixel + vec2(1.0, 1.0)).rgb)
      );
      vec3 localMax = max(
        max(adaptiveSamplePixel(basePixel).rgb, adaptiveSamplePixel(basePixel + vec2(1.0, 0.0)).rgb),
        max(adaptiveSamplePixel(basePixel + vec2(0.0, 1.0)).rgb, adaptiveSamplePixel(basePixel + vec2(1.0, 1.0)).rgb)
      );
      vec3 allowance = (localMax - localMin) * 0.08 + 0.002;
      reconstructed = clamp(reconstructed, localMin - allowance, localMax + allowance);

      gl_FragColor = vec4(reconstructed, centerSample.a);
      #include <encodings_fragment>
    }
  `;

  // Original contrast-adaptive unsharp pass. It follows the broad RCAS idea
  // (local contrast controls sharpening and ringing suppression) without using
  // official RCAS source expressions or constants.
  const CONTRAST_SHARPEN_FRAGMENT_SHADER = `
    precision highp float;
    uniform sampler2D uInput;
    uniform vec2 uInvOutputSize;
    uniform float uSharpness;
    varying vec2 vUv;

    float adaptiveLuma(vec3 color) {
      return dot(color, vec3(0.2126, 0.7152, 0.0722));
    }

    void main() {
      vec2 texel = uInvOutputSize;
      vec4 centerSample = texture2D(uInput, vUv);
      vec3 center = centerSample.rgb;
      vec3 north = texture2D(uInput, vUv + vec2(0.0, texel.y)).rgb;
      vec3 south = texture2D(uInput, vUv - vec2(0.0, texel.y)).rgb;
      vec3 east = texture2D(uInput, vUv + vec2(texel.x, 0.0)).rgb;
      vec3 west = texture2D(uInput, vUv - vec2(texel.x, 0.0)).rgb;

      vec3 localMin = min(center, min(min(north, south), min(east, west)));
      vec3 localMax = max(center, max(max(north, south), max(east, west)));
      vec3 blur = (north + south + east + west) * 0.25;
      vec3 detail = center - blur;

      float lumaMin = min(adaptiveLuma(center), min(min(adaptiveLuma(north), adaptiveLuma(south)), min(adaptiveLuma(east), adaptiveLuma(west))));
      float lumaMax = max(adaptiveLuma(center), max(max(adaptiveLuma(north), adaptiveLuma(south)), max(adaptiveLuma(east), adaptiveLuma(west))));
      float contrast = lumaMax - lumaMin;
      float edgeConfidence = smoothstep(0.012, 0.18, contrast);
      float highlightLimiter = 1.0 - smoothstep(0.72, 1.2, lumaMax);
      float gain = uSharpness * mix(0.32, 1.0, edgeConfidence) * mix(0.72, 1.0, highlightLimiter);
      vec3 sharpened = center + detail * gain * 1.35;
      vec3 allowance = (localMax - localMin) * 0.12 + 0.002;
      sharpened = clamp(sharpened, localMin - allowance, localMax + allowance);

      // The scene target stores premultiplied linear color. Encoding that value
      // directly would brighten low-alpha geometry because sRGB is nonlinear.
      // Convert to straight color for output encoding, then premultiply again
      // for the WebGL canvas compositor.
      float outputAlpha = clamp(centerSample.a, 0.0, 1.0);
      vec3 straightColor = outputAlpha > 0.00001
        ? max(sharpened, vec3(0.0)) / outputAlpha
        : vec3(0.0);
      gl_FragColor = vec4(straightColor, outputAlpha);
      #include <encodings_fragment>
      gl_FragColor.rgb *= outputAlpha;
    }
  `;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function nowMs() {
    return root?.performance?.now ? root.performance.now() : Date.now();
  }

  function normalizedModeName(value) {
    const name = String(value || 'auto').trim().toLowerCase();
    if (name === 'adaptive') return 'auto';
    if (name === 'disabled' || name === 'direct') return 'native';
    return MODE_PRESETS[name] ? name : 'auto';
  }

  function create(rendererOrConfig, suppliedOptions = {}) {
    const configForm = rendererOrConfig && rendererOrConfig.renderer;
    const renderer = configForm ? rendererOrConfig.renderer : rendererOrConfig;
    const options = configForm ? { ...rendererOrConfig, renderer: undefined } : suppliedOptions;
    if (!renderer || typeof renderer.render !== 'function' || typeof renderer.getContext !== 'function') {
      throw new TypeError('FeRenderQuality.create requires a Three.js WebGLRenderer');
    }

    const THREE = options.THREE || root?.THREE;
    const gl = renderer.getContext();
    const webgl2 = renderer.capabilities?.isWebGL2 === true;
    const minimumScale = clamp(finiteNumber(options.minScale, 0.5), 0.25, 1);
    const maximumScale = clamp(finiteNumber(options.maxScale, 1), minimumScale, 1);
    const state = {
      disposed: false,
      contextLost: false,
      pipelineFailed: false,
      fallbackReason: '',
      webgl2,
      mode: 'auto',
      modeEnabled: true,
      dynamicResolution: true,
      renderScale: clamp(finiteNumber(options.initialScale, 0.77), minimumScale, maximumScale),
      minimumScale,
      maximumScale,
      scaleStep: clamp(finiteNumber(options.scaleStep, 0.05), 0.01, 0.2),
      sharpness: clamp(finiteNumber(options.sharpness, 0.36), 0, 1),
      targetFrameMs: clamp(finiteNumber(options.targetFrameMs, 24), 8, 100),
      emaAlpha: clamp(finiteNumber(options.emaAlpha, 0.12), 0.01, 1),
      downThreshold: clamp(finiteNumber(options.downThreshold, 1.08), 1.01, 2),
      upThreshold: clamp(finiteNumber(options.upThreshold, 0.72), 0.2, 0.98),
      downSampleCount: Math.max(1, Math.floor(finiteNumber(options.downSampleCount, 24))),
      upSampleCount: Math.max(1, Math.floor(finiteNumber(options.upSampleCount, 90))),
      cooldownMs: Math.max(0, finiteNumber(options.cooldownMs, 500)),
      cssWidth: 0,
      cssHeight: 0,
      outputDpr: 1,
      outputWidth: 0,
      outputHeight: 0,
      internalWidth: 0,
      internalHeight: 0,
      emaFrameMs: 0,
      lastGpuFrameMs: 0,
      lastCpuSubmitMs: 0,
      timingSource: 'none',
      overBudgetSamples: 0,
      underBudgetSamples: 0,
      lastScaleChangeAt: -Infinity,
      scaleChanges: 0,
      frameCount: 0,
      lastFrameAt: 0,
      lastError: '',
      sceneTarget: null,
      upscaleTarget: null,
      postScene: null,
      postCamera: null,
      postGeometry: null,
      postMesh: null,
      edgeMaterial: null,
      sharpenMaterial: null,
      timerExtension: null,
      pendingQueries: [],
      activeQuery: null
    };

    function supportsPipeline() {
      return !!(
        state.webgl2
        && THREE
        && THREE.WebGLRenderTarget
        && THREE.ShaderMaterial
        && THREE.Scene
        && THREE.OrthographicCamera
        && THREE.Mesh
        && (THREE.PlaneBufferGeometry || THREE.PlaneGeometry)
      );
    }

    function pipelineActive() {
      return !!(
        state.modeEnabled
        && supportsPipeline()
        && !state.pipelineFailed
        && !state.contextLost
        && !state.disposed
        && state.sceneTarget
        && state.upscaleTarget
      );
    }

    function targetOptions(depthBuffer) {
      return {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer,
        stencilBuffer: false,
        generateMipmaps: false
      };
    }

    function makePostMaterial(fragmentShader, uniforms, name) {
      const material = new THREE.ShaderMaterial({
        name,
        uniforms,
        vertexShader: FULLSCREEN_VERTEX_SHADER,
        fragmentShader,
        depthTest: false,
        depthWrite: false,
        transparent: false,
        blending: THREE.NoBlending,
        toneMapped: false
      });
      material.extensions = material.extensions || {};
      return material;
    }

    function initializeTimerQueries() {
      state.timerExtension = null;
      if (!state.webgl2 || !gl?.getExtension) return;
      try {
        state.timerExtension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      } catch (error) {
        state.timerExtension = null;
      }
    }

    function buildPipeline() {
      if (!supportsPipeline()) {
        state.fallbackReason = state.webgl2 ? 'three-postprocess-unavailable' : 'webgl2-unavailable';
        return;
      }
      try {
        state.sceneTarget = new THREE.WebGLRenderTarget(1, 1, targetOptions(true));
        state.upscaleTarget = new THREE.WebGLRenderTarget(1, 1, targetOptions(false));
        state.sceneTarget.texture.name = 'AdaptiveSpatialSceneColor';
        state.upscaleTarget.texture.name = 'AdaptiveSpatialUpscaledColor';
        if (THREE.LinearEncoding !== undefined) {
          state.sceneTarget.texture.encoding = THREE.LinearEncoding;
          state.upscaleTarget.texture.encoding = THREE.LinearEncoding;
        }
        state.edgeMaterial = makePostMaterial(EDGE_UPSCALE_FRAGMENT_SHADER, {
          uInput: { value: state.sceneTarget.texture },
          uInputSize: { value: new THREE.Vector2(1, 1) },
          uInvInputSize: { value: new THREE.Vector2(1, 1) }
        }, 'AdaptiveSpatialEdgeUpscale');
        state.sharpenMaterial = makePostMaterial(CONTRAST_SHARPEN_FRAGMENT_SHADER, {
          uInput: { value: state.upscaleTarget.texture },
          uInvOutputSize: { value: new THREE.Vector2(1, 1) },
          uSharpness: { value: state.sharpness }
        }, 'AdaptiveSpatialContrastSharpen');
        const PlaneGeometry = THREE.PlaneBufferGeometry || THREE.PlaneGeometry;
        state.postGeometry = new PlaneGeometry(2, 2);
        state.postMesh = new THREE.Mesh(state.postGeometry, state.edgeMaterial);
        state.postMesh.frustumCulled = false;
        state.postScene = new THREE.Scene();
        state.postScene.add(state.postMesh);
        state.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
        state.postCamera.position.z = 1;
        state.pipelineFailed = false;
        state.fallbackReason = state.modeEnabled ? '' : 'mode-direct';
        initializeTimerQueries();
        resizeTargets(true);
      } catch (error) {
        state.pipelineFailed = true;
        state.fallbackReason = 'pipeline-initialization-failed';
        state.lastError = String(error?.message || error || 'pipeline initialization failed');
        disposePipelineResources();
      }
    }

    function resizeTargets(force = false) {
      if (!state.sceneTarget || !state.upscaleTarget || state.outputWidth < 1 || state.outputHeight < 1) return;
      const scale = clamp(state.renderScale, state.minimumScale, state.maximumScale);
      const internalWidth = Math.max(1, Math.round(state.outputWidth * scale));
      const internalHeight = Math.max(1, Math.round(state.outputHeight * scale));
      if (force || internalWidth !== state.internalWidth || internalHeight !== state.internalHeight) {
        state.sceneTarget.setSize(internalWidth, internalHeight);
        state.internalWidth = internalWidth;
        state.internalHeight = internalHeight;
        state.edgeMaterial.uniforms.uInputSize.value.set(internalWidth, internalHeight);
        state.edgeMaterial.uniforms.uInvInputSize.value.set(1 / internalWidth, 1 / internalHeight);
      }
      if (force || state.upscaleTarget.width !== state.outputWidth || state.upscaleTarget.height !== state.outputHeight) {
        state.upscaleTarget.setSize(state.outputWidth, state.outputHeight);
        state.sharpenMaterial.uniforms.uInvOutputSize.value.set(1 / state.outputWidth, 1 / state.outputHeight);
      }
    }

    function resize(widthOrOptions, suppliedHeight, suppliedDpr) {
      if (state.disposed) return getDiagnostics();
      const objectForm = widthOrOptions && typeof widthOrOptions === 'object';
      const width = Math.max(1, Math.round(finiteNumber(objectForm ? widthOrOptions.width : widthOrOptions, 1)));
      const height = Math.max(1, Math.round(finiteNumber(objectForm ? widthOrOptions.height : suppliedHeight, 1)));
      const dpr = clamp(finiteNumber(objectForm ? widthOrOptions.dpr : suppliedDpr, renderer.getPixelRatio?.() || 1), 0.5, 4);
      const sizeChanged = width !== state.cssWidth || height !== state.cssHeight || Math.abs(dpr - state.outputDpr) > 0.0001;
      state.cssWidth = width;
      state.cssHeight = height;
      state.outputDpr = dpr;
      if (sizeChanged) {
        if (typeof renderer.setPixelRatio === 'function' && Math.abs((renderer.getPixelRatio?.() || 1) - dpr) > 0.0001) {
          renderer.setPixelRatio(dpr);
        }
        renderer.setSize(width, height, false);
      }
      state.outputWidth = Math.max(1, renderer.domElement?.width || Math.round(width * dpr));
      state.outputHeight = Math.max(1, renderer.domElement?.height || Math.round(height * dpr));
      resizeTargets(sizeChanged);
      return getDiagnostics();
    }

    function ensureSize() {
      if (state.outputWidth > 0 && state.outputHeight > 0) return;
      const canvas = renderer.domElement;
      const dpr = renderer.getPixelRatio?.() || 1;
      const width = Math.max(1, canvas?.clientWidth || Math.round((canvas?.width || 1) / dpr));
      const height = Math.max(1, canvas?.clientHeight || Math.round((canvas?.height || 1) / dpr));
      resize(width, height, dpr);
    }

    function applyScale(nextScale, sampleTime) {
      const clamped = Math.round(clamp(nextScale, state.minimumScale, state.maximumScale) * 100) / 100;
      if (Math.abs(clamped - state.renderScale) < 0.001) return false;
      state.renderScale = clamped;
      state.lastScaleChangeAt = sampleTime;
      state.scaleChanges += 1;
      state.overBudgetSamples = 0;
      state.underBudgetSamples = 0;
      resizeTargets();
      return true;
    }

    function observeTiming(frameMs, source, sampleTime) {
      if (!Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 1000) return;
      state.timingSource = source;
      if (source === 'gpu') state.lastGpuFrameMs = frameMs;
      state.emaFrameMs = state.emaFrameMs > 0
        ? state.emaFrameMs + (frameMs - state.emaFrameMs) * state.emaAlpha
        : frameMs;
      if (!state.dynamicResolution || !pipelineActive()) return;

      if (state.emaFrameMs > state.targetFrameMs * state.downThreshold) {
        state.overBudgetSamples += 1;
        state.underBudgetSamples = Math.max(0, state.underBudgetSamples - 2);
      } else if (state.emaFrameMs < state.targetFrameMs * state.upThreshold) {
        state.underBudgetSamples += 1;
        state.overBudgetSamples = Math.max(0, state.overBudgetSamples - 2);
      } else {
        state.overBudgetSamples = Math.max(0, state.overBudgetSamples - 1);
        state.underBudgetSamples = Math.max(0, state.underBudgetSamples - 1);
      }

      if (sampleTime - state.lastScaleChangeAt < state.cooldownMs) return;
      if (state.overBudgetSamples >= state.downSampleCount) {
        applyScale(state.renderScale - state.scaleStep, sampleTime);
      } else if (state.underBudgetSamples >= state.upSampleCount) {
        applyScale(state.renderScale + state.scaleStep, sampleTime);
      }
    }

    function discardTimerQueries() {
      if (!gl) return;
      if (state.activeQuery) {
        try {
          gl.endQuery(state.timerExtension.TIME_ELAPSED_EXT);
        } catch (error) {
          // The context may already be lost.
        }
        try {
          gl.deleteQuery(state.activeQuery.query);
        } catch (error) {
          // The context may already be lost.
        }
        state.activeQuery = null;
      }
      state.pendingQueries.forEach((entry) => {
        try {
          gl.deleteQuery(entry.query);
        } catch (error) {
          // The context may already be lost.
        }
      });
      state.pendingQueries = [];
    }

    function pollTimerQueries(sampleTime) {
      const extension = state.timerExtension;
      if (!extension || !state.pendingQueries.length || state.contextLost) return;
      try {
        if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
          discardTimerQueries();
          return;
        }
        while (state.pendingQueries.length) {
          const entry = state.pendingQueries[0];
          if (!gl.getQueryParameter(entry.query, gl.QUERY_RESULT_AVAILABLE)) {
            if (sampleTime - entry.startedAt > 2500) {
              gl.deleteQuery(entry.query);
              state.pendingQueries.shift();
              continue;
            }
            break;
          }
          const nanoseconds = gl.getQueryParameter(entry.query, gl.QUERY_RESULT);
          gl.deleteQuery(entry.query);
          state.pendingQueries.shift();
          observeTiming(nanoseconds / 1000000, 'gpu', sampleTime);
        }
      } catch (error) {
        discardTimerQueries();
        state.timerExtension = null;
      }
    }

    function beginTimerQuery(sampleTime) {
      const extension = state.timerExtension;
      if (!extension || state.pendingQueries.length >= 6 || state.activeQuery || state.contextLost) return false;
      let query = null;
      try {
        query = gl.createQuery();
        if (!query) return false;
        gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
        state.activeQuery = { query, startedAt: sampleTime };
        return true;
      } catch (error) {
        if (query) {
          try {
            gl.deleteQuery(query);
          } catch (deleteError) {
            // The context may already be lost.
          }
        }
        state.timerExtension = null;
        state.activeQuery = null;
        return false;
      }
    }

    function finishTimerQuery() {
      if (!state.activeQuery || !state.timerExtension) return;
      const entry = state.activeQuery;
      state.activeQuery = null;
      try {
        gl.endQuery(state.timerExtension.TIME_ELAPSED_EXT);
        state.pendingQueries.push(entry);
      } catch (error) {
        try {
          gl.deleteQuery(entry.query);
        } catch (deleteError) {
          // The context may already be lost.
        }
        state.timerExtension = null;
      }
    }

    function renderDirect(scene, camera) {
      const previousTarget = renderer.getRenderTarget?.() || null;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      renderer.setRenderTarget(previousTarget);
    }

    function renderPipeline(scene, camera, sampleTime) {
      const previousTarget = renderer.getRenderTarget?.() || null;
      const previousAutoClear = renderer.autoClear;
      const previousScissorTest = renderer.getScissorTest?.() || false;
      const previousXrEnabled = renderer.xr?.enabled;
      const timerStarted = beginTimerQuery(sampleTime);
      try {
        if (renderer.xr) renderer.xr.enabled = false;
        if (typeof renderer.setScissorTest === 'function') renderer.setScissorTest(false);
        renderer.autoClear = true;

        renderer.setRenderTarget(state.sceneTarget);
        renderer.render(scene, camera);

        state.postMesh.material = state.edgeMaterial;
        state.edgeMaterial.uniforms.uInput.value = state.sceneTarget.texture;
        renderer.setRenderTarget(state.upscaleTarget);
        renderer.render(state.postScene, state.postCamera);

        state.postMesh.material = state.sharpenMaterial;
        state.sharpenMaterial.uniforms.uInput.value = state.upscaleTarget.texture;
        state.sharpenMaterial.uniforms.uSharpness.value = state.sharpness;
        renderer.setRenderTarget(null);
        renderer.render(state.postScene, state.postCamera);
      } finally {
        if (timerStarted) finishTimerQuery();
        renderer.autoClear = previousAutoClear;
        if (typeof renderer.setScissorTest === 'function') renderer.setScissorTest(previousScissorTest);
        if (renderer.xr && previousXrEnabled !== undefined) renderer.xr.enabled = previousXrEnabled;
        renderer.setRenderTarget(previousTarget);
      }
    }

    function render(sceneOrOptions, suppliedCamera, suppliedNow) {
      if (state.disposed) return false;
      const objectForm = sceneOrOptions && sceneOrOptions.scene && sceneOrOptions.camera;
      const scene = objectForm ? sceneOrOptions.scene : sceneOrOptions;
      const camera = objectForm ? sceneOrOptions.camera : suppliedCamera;
      const sampleTime = finiteNumber(objectForm ? sceneOrOptions.now : suppliedNow, nowMs());
      if (!scene || !camera || state.contextLost) return false;
      ensureSize();
      pollTimerQueries(sampleTime);

      const startedAt = nowMs();
      if (pipelineActive()) {
        try {
          renderPipeline(scene, camera, sampleTime);
        } catch (error) {
          state.pipelineFailed = true;
          state.fallbackReason = 'pipeline-render-failed';
          state.lastError = String(error?.message || error || 'pipeline render failed');
          discardTimerQueries();
          renderDirect(scene, camera);
        }
      } else {
        renderDirect(scene, camera);
      }
      const cpuSubmitMs = Math.max(0, nowMs() - startedAt);
      state.lastCpuSubmitMs = cpuSubmitMs;
      state.frameCount += 1;

      if (pipelineActive() && !state.timerExtension) {
        const frameDelta = state.lastFrameAt > 0 ? sampleTime - state.lastFrameAt : 0;
        const fallbackSample = frameDelta > 0
          ? Math.max(cpuSubmitMs, Math.min(frameDelta, state.targetFrameMs * 2.5))
          : cpuSubmitMs;
        observeTiming(fallbackSample, 'frame-wall', sampleTime);
      }
      state.lastFrameAt = sampleTime;
      return true;
    }

    function setMode(mode) {
      if (state.disposed) return getDiagnostics();
      const modeName = normalizedModeName(typeof mode === 'object' ? mode.name : mode);
      const preset = MODE_PRESETS[modeName];
      state.mode = modeName;
      state.modeEnabled = preset.enabled;
      state.dynamicResolution = preset.dynamic;
      if (typeof mode === 'object') {
        if (mode.dynamicResolution !== undefined) state.dynamicResolution = !!mode.dynamicResolution && preset.enabled;
        if (mode.sharpness !== undefined) state.sharpness = clamp(finiteNumber(mode.sharpness, state.sharpness), 0, 1);
        if (mode.targetFrameMs !== undefined) state.targetFrameMs = clamp(finiteNumber(mode.targetFrameMs, state.targetFrameMs), 8, 100);
      }
      const requestedScale = typeof mode === 'object' && mode.scale !== undefined
        ? finiteNumber(mode.scale, preset.scale)
        : preset.scale;
      state.renderScale = clamp(requestedScale, state.minimumScale, state.maximumScale);
      state.overBudgetSamples = 0;
      state.underBudgetSamples = 0;
      state.emaFrameMs = 0;
      state.fallbackReason = state.modeEnabled
        ? (!state.webgl2
            ? 'webgl2-unavailable'
            : !supportsPipeline()
              ? 'three-postprocess-unavailable'
              : state.pipelineFailed || !state.sceneTarget
                ? 'pipeline-unavailable'
                : '')
        : 'mode-direct';
      resizeTargets(true);
      return getDiagnostics();
    }

    function getDiagnostics() {
      const active = pipelineActive();
      return {
        algorithm: ALGORITHM,
        version: VERSION,
        label: 'Adaptive Spatial',
        officialVendorImplementation: false,
        backend: active ? 'webgl2-two-pass' : 'direct',
        webgl2: state.webgl2,
        enabled: active,
        dynamicResolution: active && state.dynamicResolution,
        mode: state.mode,
        fallbackReason: active ? '' : state.fallbackReason,
        renderScale: active ? state.renderScale : 1,
        minimumScale: state.minimumScale,
        maximumScale: state.maximumScale,
        outputWidth: state.outputWidth,
        outputHeight: state.outputHeight,
        internalWidth: active ? state.internalWidth : state.outputWidth,
        internalHeight: active ? state.internalHeight : state.outputHeight,
        targetFrameMs: state.targetFrameMs,
        emaFrameMs: state.emaFrameMs,
        lastGpuFrameMs: state.lastGpuFrameMs,
        lastCpuSubmitMs: state.lastCpuSubmitMs,
        timingSource: state.timingSource,
        sharpness: state.sharpness,
        scaleChanges: state.scaleChanges,
        frameCount: state.frameCount,
        contextLost: state.contextLost,
        lastError: state.lastError
      };
    }

    function disposePipelineResources() {
      state.sceneTarget?.dispose?.();
      state.upscaleTarget?.dispose?.();
      state.edgeMaterial?.dispose?.();
      state.sharpenMaterial?.dispose?.();
      state.postGeometry?.dispose?.();
      state.sceneTarget = null;
      state.upscaleTarget = null;
      state.edgeMaterial = null;
      state.sharpenMaterial = null;
      state.postGeometry = null;
      state.postMesh = null;
      state.postScene = null;
      state.postCamera = null;
      state.internalWidth = 0;
      state.internalHeight = 0;
    }

    function handleContextLost() {
      state.contextLost = true;
      state.fallbackReason = 'context-lost';
      discardTimerQueries();
    }

    function handleContextRestored() {
      if (state.disposed) return;
      state.contextLost = false;
      state.pipelineFailed = false;
      disposePipelineResources();
      buildPipeline();
    }

    function dispose() {
      if (state.disposed) return;
      state.disposed = true;
      renderer.domElement?.removeEventListener?.('webglcontextlost', handleContextLost);
      renderer.domElement?.removeEventListener?.('webglcontextrestored', handleContextRestored);
      discardTimerQueries();
      disposePipelineResources();
      state.fallbackReason = 'disposed';
    }

    renderer.domElement?.addEventListener?.('webglcontextlost', handleContextLost);
    renderer.domElement?.addEventListener?.('webglcontextrestored', handleContextRestored);
    buildPipeline();
    const initialMode = normalizedModeName(options.mode || 'auto');
    setMode(initialMode === 'auto' && options.initialScale !== undefined
      ? { name: initialMode, scale: options.initialScale }
      : initialMode);

    return Object.freeze({
      resize,
      render,
      setMode,
      getDiagnostics,
      dispose
    });
  }

  return Object.freeze({
    algorithm: ALGORITHM,
    version: VERSION,
    create
  });
});
