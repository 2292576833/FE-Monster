import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const app = readFileSync(path.join(root, "web", "app.js"), "utf8").replace(/\r\n/g, "\n");

const checks = {
  // Highlight energy must roll off before display output. A raw additive beam
  // may never be allowed to turn the whole scene into flat white fog.
  filmicHighlightShoulder: /ACESFilmicToneMapping/.test(app)
    && /sonicHighlightShoulder/.test(app)
    && /toneMappingExposure\s*=\s*clamp\(/.test(app),

  // Mist should remain a fine low-contrast volume while preserving scene
  // blacks and silhouettes instead of raising the entire framebuffer floor.
  waterMistBlackLevelGuard: /mistBlackLiftGuard/.test(app)
    && /mistLayer\.material\.opacity[^\n]*Math\.min/.test(app)
    && /maxMistSceneOpacity/.test(app),

  // Ground response is one continuous sun-lit receiving material with a
  // directional sheen and gobo shadows. It must never become a circular or
  // elliptical light decal / pool.
  softDirectionalGroundReceiver: /createSonicGroundSheenMaterial/.test(app)
    && /tyndallGroundSheen/.test(app)
    && /uSheenDirection/.test(app)
    && /uReflectionFeather/.test(app)
    && /uGoboOcclusion/.test(app)
    && /smoothstep\(/.test(app)
    && !/CircleGeometry[^\n]*tyndall/i.test(app)
    && !/tyndallGround(?:Spot|Pool|Ellipse)/i.test(app),

  directionalSunNotSpotLight: /const tyndallLight = new THREE\.DirectionalLight/.test(app)
    && !/const tyndallLight = new THREE\.SpotLight/.test(app),

  // The reflection follows both the chosen sun temperature and volumetric
  // reflectance, so it reads as bounced light rather than a white decal.
  reflectionTemperatureAndReflectanceCoupling: /uReflectionColor/.test(app)
    && /settings\.mistReflectance/.test(app)
    && /tyndallColor/.test(app)
    && /reflectionEnergyCap/.test(app),

  // Beam energy must be spatially local and independently capped. Combining
  // beam, halo, mist and receiver contributions may not exceed this budget.
  localEnergyConservation: /SONIC_TYNDALL_TOTAL_ENERGY_CAP/.test(app)
    && /beamEnergyBudget/.test(app)
    && /reflectionEnergyCap/.test(app)
    && /haloEnergyCap/.test(app),

  // The lit columns and curved background receive only a restrained color
  // bounce. This deliberately avoids a realtime ray-tracing pass.
  localColumnAndWallBounce: /tyndallColumnReceivers/.test(app)
    && /tyndallWallBounce/.test(app)
    && /uTyndallLightDirection/.test(app)
    && /receiverBounceStrength/.test(app)
    && /receiverEmissiveIntensity/.test(app),

  // Reference-like forest light: several narrow overlapping shafts with
  // progressive soft edges, not one broad cone.
  softLayeredOccludedShafts: /uGoboShadowDepth/.test(app)
    && /uEdgeFeather/.test(app)
    && /beamSoftProgress/.test(app)
    && /occlusionBands/.test(app),

  // Turning the atmosphere off must restore a crisp, neutral scene rather
  // than leaving the same fog and sky lift behind. This is the visual
  // contract that makes the switch unmistakable without overexposing "on".
  explicitAtmosphereOnOffContrast: /sonicAtmosphereContrast/.test(app)
    && /scene\.fog\.near\s*=\s*190\s*-\s*sonicAtmosphereContrast/.test(app)
    && /scene\.fog\.far\s*=\s*410\s*-\s*sonicAtmosphereContrast/.test(app)
    && /uSkyContribution\.value\s*=\s*settings\.atmosphereEnabled\s*\?/.test(app),

  // Shafts should breathe independently and carry a slow secondary drift so
  // the volume feels alive instead of nine identical static strips.
  livingNonUniformShafts: /atmosphereBreath/.test(app)
    && /beam\.userData\.phase/.test(app)
    && /beam\.userData\.driftRate/.test(app)
    && /uAtmosphereVariation/.test(app),

  // Runtime diagnostics expose the contract to the real WebGL smoke probe.
  diagnosticsExposeReflectionPipeline: /groundReceiverCount/.test(app)
    && /highlightShoulder/.test(app)
    && /blackLiftGuard/.test(app)
    && /receiverBounceCount/.test(app)
    && /atmosphereContrast/.test(app)
};

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

process.stdout.write(`${JSON.stringify({ pass: failures.length === 0, checks, failures }, null, 2)}\n`);
process.exitCode = failures.length === 0 ? 0 : 1;
