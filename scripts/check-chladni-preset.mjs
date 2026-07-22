import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const app = read('web/app.js');
const html = read('web/index.html');
const css = read('web/styles.css');
const runtimePath = path.join(root, 'web', 'chladni-runtime.js');
const runtime = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : '';

const checks = {
  runtimeFile: fs.existsSync(runtimePath),
  runtimeLoadedBeforeApp: /chladni-runtime\.js[\s\S]*app\.js/.test(html),
  sceneSurface: /id="chladniScene"/.test(html) && /id="chladniCore"/.test(html),
  presetCard: /id="diyChladniPreset"[\s\S]*data-preset="chladni"/.test(html),
  normalizedPreset: /preset === 'chladni'/.test(app),
  visibilityLifecycle: /updateChladniVisibility\(\)/.test(app) && /disposeChladni/.test(app),
  frameLoop: /updateChladniMotion\(\)/.test(app),
  physicsEquation: /cos\(n \* PI \* p\.x\)/.test(runtime) && /cos\(m \* PI \* p\.y\)/.test(runtime),
  nodeAccumulation: /nodeProximity/.test(runtime) && /abs\(field\)/.test(runtime),
  threeDimensional: /displacement/.test(runtime) && /position\.y/.test(runtime),
  autoRotation: /autoRotation/.test(runtime) && /rotation\.y/.test(runtime),
  audioResponse: /bass/.test(runtime) && /beat/.test(runtime) && /treble/.test(runtime),
  restrainedBassMotion: /uBass \* 1\.35/.test(runtime)
    && /runtime\.bass \* 0\.008/.test(runtime),
  automaticRotation: /0\.035 \+ runtime\.energy \* 0\.01/.test(runtime)
    && /runtime\.autoRotation \+= dt \* runtime\.rotationSpeed/.test(runtime)
    && /mouseOrbitEnabled: false/.test(runtime),
  planeView45Degrees: /PLANE_VIEW_AZIMUTH = PI \/ 4/.test(runtime)
    && /PLANE_VIEW_ELEVATION = PI \/ 4/.test(runtime)
    && /planeViewElevationDegrees: 45/.test(runtime),
  sixFaceParticleCube: /CHLADNI_FACES/.test(runtime)
    && /faceCount: runtime\.faces\.length/.test(runtime)
    && /particlesPerFace/.test(runtime)
    && /faceMaterials/.test(runtime),
  directPlaneCubeSwitch: /id="chladniPlaneButton"/.test(html)
    && /id="chladniCubeButton"/.test(html)
    && /function setChladniMode/.test(app)
    && /setMode/.test(runtime),
  cornerFacingViewer: /CUBE_VIEW_YAW = PI \/ 4/.test(runtime)
    && /cubeCornerFacingViewer: true/.test(runtime),
  roundedEightCorners: /roundedCorner/.test(runtime)
    && /roundedCornerCount: 8/.test(runtime),
  smoothModeMorph: /modeBlend/.test(runtime) && /modeFrom/.test(runtime) && /modeTo/.test(runtime),
  adaptiveDensity: /particleCount/.test(runtime) && /MOBILE_RENDER_TARGET/.test(app),
  denserParticleField: /DEFAULT_PARTICLE_COUNT = 500000/.test(runtime)
    && /MAX_PARTICLE_COUNT = 520000/.test(runtime)
    && /MAX_FACE_PARTICLE_COUNT = 85000/.test(runtime)
    && /: 500000;/.test(app),
  highDensityPlane: /DEFAULT_PLANE_PARTICLE_COUNT = 600000/.test(runtime)
    && /MAX_PLANE_PARTICLE_COUNT = 620000/.test(runtime)
    && /planeGeometry/.test(runtime)
    && /: 600000;/.test(app),
  supportGeometryRemoved: !/createPlateFrame|createCenterPin|frameMaterial|pinMaterial/.test(runtime),
  transparentPlateRemoved: /transparentPlate: false/.test(runtime),
  centerSphereRemoved: /centerSphere: false/.test(runtime),
  crispParticleKernel: /1\.0 - smoothstep\(0\.46, 0\.5, radius\)/.test(runtime)
    && /particleProfile: 'crisp-antialiased-disc'/.test(runtime)
    && /maxPointSize: 2\.6/.test(runtime),
  enhancedParticleClarity: /sharpness \|\| 0\.42/.test(runtime)
    && /contrast\(1\.18\)/.test(css),
  reducedMotion: /reducedMotion/.test(runtime),
  diagnostics: /FeChladniRuntime/.test(runtime) && /diagnostics/.test(runtime),
  sceneStyling: /\.chladni-scene/.test(css) && /\.chladni-canvas/.test(css),
  coverThreeColorBackground: /function applyChladniPalette[\s\S]*source\.coverColors\?\.\[index\][\s\S]*--chladni-hot/.test(app)
    && /\.chladni-scene::before\s*\{[\s\S]*var\(--chladni-a\)[\s\S]*var\(--chladni-b\)[\s\S]*var\(--chladni-hot\)/.test(css),
  lyricComposition: /has-chladni/.test(css),
  wallpaperExclusion: /has-wallpaper-mode[\s\S]*chladni-scene/.test(css)
};

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
console.log(JSON.stringify({ pass: failures.length === 0, checks, failures }, null, 2));
if (failures.length) process.exit(1);
