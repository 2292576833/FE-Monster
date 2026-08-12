import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const html = readFileSync(path.join(root, 'web', 'index.html'), 'utf8').replace(/\r\n/g, '\n');

const moundLift = app.match(/float groundMoundLift\s*=\s*([^;]+);/)?.[1] ?? '';
const checks = {
  legacyAllGroundFloatRemoved:
    !/allGroundFloat|AllGroundFloat|uAllGroundFloat|allGroundFloatLift/.test(app)
    && !/sonicAllGroundFloatToggle|全部地面浮动/.test(html),
  visiblePeakToggle:
    /id="sonicGroundMoundsToggle"[^>]*role="switch"[^>]*checked/.test(html)
    && />全地形波峰</.test(html),
  persistedPeakSetting:
    /groundMoundsEnabled:\s*true/.test(app)
    && /groundMoundsEnabled:\s*source\?\.groundMoundsEnabled !== false/.test(app)
    && /SONIC_SETTINGS_PREFS_KEY/.test(app),
  toggleControlsOnlyPeaks:
    /settings\.groundMoundsEnabled\s*=\s*els\.sonicGroundMoundsToggle\.checked/.test(app)
    && /uGroundMoundHeight\.value = settings\.groundMoundsEnabled[\s\S]{0,100}?settings\.groundMoundHeight[\s\S]{0,40}?: 0/.test(app),
  fixedTerrainPeakField:
    /const SONIC_GROUND_MOUND_GRID_SPACING = 18/.test(app)
    && /const SONIC_GROUND_MOUND_GRID_EXTENT = 90/.test(app)
    && /const SONIC_GROUND_MOUND_CENTERS = Object\.freeze\(\(\(\) => \{/.test(app)
    && /SONIC_GROUND_MOUND_NEIGHBOR_CELLS = 2/.test(app)
    && /SONIC_GROUND_MOUND_CENTERS\[gridZ \* SONIC_GROUND_MOUND_GRID_SIZE \+ gridX\]/.test(app)
    && /sonicTerrainMoundFieldAt\(x, z\)/.test(app)
    && !/groundMoundCount/.test(app),
  peaksStayIndependentOfColumnHeight:
    moundLift.includes('aGroundMoundMask')
    && moundLift.includes('uGroundMoundHeight')
    && !moundLift.includes('uColumnHeightScale'),
  deterministicStaggeredPeakMotion:
    /float groundPhase = dot\(groundGridCell, vec2\(0\.47, 0\.71\)\) \+ groundPhaseJitter/.test(app)
    && /float groundRingWaveA = 0\.5 \+ 0\.5 \* sin\(/.test(app)
    && /float groundRingWaveB = 0\.5 \+ 0\.5 \* sin\(/.test(app)
    && /groundLayeredWave = groundRingWaveA \* 0\.48/.test(app),
  smoothOneShotEntrance:
    /uniform float uGroundEntrance;/.test(app)
    && /float groundEntrance = smoothstep\(0\.0, 1\.0, groundEntranceCursor\)/.test(app)
    && /groundEntranceProgress < 1/.test(app)
};

const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
process.stdout.write(`${JSON.stringify({ pass: failures.length === 0, checks, failures }, null, 2)}\n`);
process.exitCode = failures.length === 0 ? 0 : 1;
