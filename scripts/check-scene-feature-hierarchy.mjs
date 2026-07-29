import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = readFileSync(path.join(root, 'web/index.html'), 'utf8');
const app = readFileSync(path.join(root, 'web/app.js'), 'utf8');

function detailsBody(id) {
  const start = html.indexOf(`<details class="scene-feature-group" id="${id}"`);
  assert.notEqual(start, -1, `missing scene feature group ${id}`);
  const next = html.indexOf('<details class="scene-feature-group"', start + 1);
  const sceneEnd = html.indexOf('</div>\n          </details>', start);
  return html.slice(start, next === -1 || next > sceneEnd ? sceneEnd : next);
}

function includesAll(block, ids, label) {
  for (const id of ids) assert.match(block, new RegExp(`id="${id}"`), `${label} must contain ${id}`);
}

const sonicColumns = detailsBody('sonicColumnsFeatureGroup');
includesAll(sonicColumns, [
  'sonicFollowCoverButton',
  'sonicCenterColorInput',
  'sonicCoreColorInput',
  'sonicOuterColorInput',
  'sonicBrightnessRange',
  'sonicExposureRange',
  'sonicColumnHeightRange',
  'sonicFovRange',
  'sonicSmoothingRange'
], 'Sonic 音柱');
assert.doesNotMatch(sonicColumns, /id="sonicFountainToggle"|id="sonicStarfieldToggle"|id="sonicAtmosphereToggle"/);

const sonicFountain = detailsBody('sonicFountainFeatureGroup');
includesAll(sonicFountain, ['sonicFountainToggle', 'sonicFountainColorInput'], 'Sonic 粒子喷泉');

const sonicSky = detailsBody('sonicSkyFeatureGroup');
includesAll(sonicSky, [
  'sonicStarfieldToggle',
  'sonicStarfieldColorInput',
  'sonicGalaxyToggle',
  'sonicGalaxyColorInput',
  'sonicGalaxyIntensityRange'
], 'Sonic 星空星河');

const sonicGround = detailsBody('sonicGroundFeatureGroup');
includesAll(sonicGround, ['sonicAllGroundFloatToggle'], 'Sonic 全部地面浮动');

const sonicAtmosphere = detailsBody('sonicAtmosphereFeatureGroup');
includesAll(sonicAtmosphere, [
  'sonicAtmosphereToggle',
  'sonicTyndallToneSelect',
  'sonicFogDensityRange',
  'sonicFogSpeedRange',
  'sonicFogGlowRange',
  'sonicMistReflectanceRange',
  'sonicMistEmissionRange',
  'sonicTyndallIntensityRange',
  'sonicTyndallSpreadRange'
], 'Sonic 水雾丁达尔');

const sonicCover = detailsBody('sonicCoverBackgroundFeatureGroup');
includesAll(sonicCover, ['sonicCoverBackgroundToggle', 'sonicCoverBackgroundMixRange'], 'Sonic 封面背景');

for (const id of [
  'coverParticleBackgroundFeatureGroup',
  'coverParticleMotionFeatureGroup',
  'cubeIntensityFeatureGroup',
  'freeCubeModeFeatureGroup',
  'chladniFormFeatureGroup',
  'sceneWallpaperFeatureGroup',
  'stormLightingFeatureGroup'
]) {
  detailsBody(id);
}

assert.match(app, /function syncSceneFeatureGroups\(/);
assert.match(app, /data-scene-feature-preset/);
assert.match(app, /syncSceneFeatureGroups\(activeScenePreset/);

console.log(JSON.stringify({
  ok: true,
  checks: [
    'current scene feature sublevels',
    'Sonic columns isolated',
    'Sonic fountain isolated',
    'Sonic sky and galaxy isolated',
    'Sonic ground isolated',
    'Sonic water mist and Tyndall isolated',
    'Sonic cover background isolated',
    'other scene feature groups present'
  ]
}, null, 2));
