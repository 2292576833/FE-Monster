import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const argument = process.argv.find(value => value.startsWith('--package='));
const packageRoot = path.resolve(argument ? argument.slice('--package='.length) : path.join(root, 'output/wallpaper-engine/harmonic-realm'));
assert.ok(existsSync(packageRoot), `Wallpaper package does not exist: ${packageRoot}. Run the package builder first.`);
assert.ok(lstatSync(packageRoot).isDirectory() && !lstatSync(packageRoot).isSymbolicLink(), 'package root must be a real directory');
const realPackage = realpathSync(packageRoot);
const inside = (parent, value) => value === parent || value.startsWith(parent + path.sep);
function packagePath(relative) {
  assert.equal(typeof relative, 'string');
  assert.ok(relative && !path.isAbsolute(relative) && !/^[a-z][a-z\d+.-]*:/i.test(relative) && !relative.startsWith('//'), `not a relative package asset: ${relative}`);
  const file = path.resolve(packageRoot, relative);
  assert.ok(inside(packageRoot, file), `package asset escapes root: ${relative}`);
  assert.ok(existsSync(file), `missing package asset: ${relative}`);
  assert.ok(inside(realPackage, realpathSync(file)), `package asset follows a link outside root: ${relative}`);
  return file;
}
function filesBelow(directory, prefix = '') {
  const files = [];
  for (const name of readdirSync(directory)) {
    const full = path.join(directory, name), relative = prefix ? `${prefix}/${name}` : name, stat = lstatSync(full);
    assert.equal(stat.isSymbolicLink(), false, `package may not depend on symbolic links: ${relative}`);
    if (stat.isDirectory()) files.push(...filesBelow(full, relative));
    else if (stat.isFile()) files.push(relative);
    else assert.fail(`unsupported file type in package: ${relative}`);
  }
  return files;
}
const files = filesBelow(packageRoot);
const project = JSON.parse(readFileSync(packagePath('project.json'), 'utf8'));
assert.equal(project.type, 'web');
assert.equal(project.file, 'index.html');
assert.equal(project.general?.supportsaudioprocessing, true);
assert.match(project.title || '', /谐波|Harmonic/i);
assert.ok(typeof project.description === 'string' && project.description.trim().length > 0);
assert.equal(project.workshopid, undefined, 'a new local wallpaper must not impersonate an existing Workshop item');
assert.equal(project.workshopurl, undefined);
assert.notEqual(project.approved, true, 'a local build must not claim Workshop approval');
assert.equal(project.preview, 'preview.jpg');
const preview = readFileSync(packagePath(project.preview));
assert.equal(preview.readUInt16BE(0), 0xffd8, 'preview has a JPEG start marker');
let previewSize;
for (let cursor = 2; cursor + 3 < preview.length;) {
  assert.equal(preview[cursor], 0xff, 'valid JPEG segment');
  while (preview[cursor] === 0xff) cursor++;
  const marker = preview[cursor++];
  if (marker === 0xda || marker === 0xd9) break;
  if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
  const length = preview.readUInt16BE(cursor);
  assert.ok(length >= 2 && cursor + length <= preview.length, 'JPEG segment fits in preview');
  if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
    assert.ok(length >= 8);
    previewSize = { width: preview.readUInt16BE(cursor + 5), height: preview.readUInt16BE(cursor + 3) };
    break;
  }
  cursor += length;
}
assert.ok(previewSize?.width >= 32 && previewSize?.height >= 32, 'preview is a real image with useful dimensions');

const context = vm.createContext({ window: {} });
vm.runInContext(readFileSync(path.join(root, 'web/harmonic-state-settings.js'), 'utf8'), context);
const schema = context.window.FeHarmonicSettings.schema;
assert.equal(schema.length, 94, 'the package contract includes the current 94 scene controls');
const extras = ['wallpaperSensitivity', 'wallpaperQuality', 'wallpaperFrameLimit', 'wallpaperYaw', 'wallpaperPitch', 'wallpaperZoom', 'wallpaperMediaEnabled', 'wallpaperCardTitle', 'wallpaperCardArtist', 'wallpaperCardHint'];
const properties = project.general?.properties;
assert.ok(properties && typeof properties === 'object' && !Array.isArray(properties));
assert.equal(Object.keys(properties).length, 104);
assert.deepEqual(Object.keys(properties).sort(), [...schema.map(field => field.key), ...extras].sort());
const indices = [], orders = [];
for (const [key, property] of Object.entries(properties)) {
  assert.ok(property && typeof property === 'object');
  assert.ok(typeof property.text === 'string' && property.text.trim(), `${key}: visible property label`);
  assert.ok(Number.isInteger(property.index), `${key}: integer property index`);
  assert.ok(Number.isFinite(property.order), `${key}: explicit property ordering`);
  indices.push(property.index); orders.push(property.order);
  assert.ok(['slider', 'bool', 'combo', 'color', 'textinput'].includes(property.type), `${key}: supported Wallpaper Engine property type (${property.type})`);
  if (property.type === 'slider') {
    assert.ok([property.min, property.max, property.step, property.value].every(Number.isFinite), `${key}: numeric slider metadata`);
    assert.ok(property.min < property.max && property.step > 0 && property.value >= property.min && property.value <= property.max, `${key}: valid slider bounds`);
  } else if (property.type === 'bool') assert.equal(typeof property.value, 'boolean');
  else if (property.type === 'combo') {
    assert.ok(Array.isArray(property.options) && property.options.length > 0);
    assert.ok(property.options.every(option => typeof option.label === 'string' && Object.hasOwn(option, 'value')));
    assert.ok(property.options.some(option => option.value === property.value), `${key}: selected option is declared`);
  } else if (property.type === 'color') {
    assert.equal(typeof property.value, 'string');
    const channels = property.value.trim().split(/\s+/).map(Number);
    assert.equal(channels.length, 3); assert.ok(channels.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 1));
  } else assert.equal(typeof property.value, 'string');
}
assert.equal(new Set(indices).size, indices.length, 'property indices are unique');
assert.equal(new Set(orders).size, orders.length, 'property ordering is unambiguous');
for (const field of schema) {
  const property = properties[field.key];
  const expectedType = { checkbox: 'bool', range: 'slider', select: 'combo', color: 'color' }[field.type];
  assert.equal(property.type, expectedType, `${field.key}: scene type maps correctly`);
  if (field.type === 'color') {
    const expected = [1, 3, 5].map(at => Number.parseInt(field.defaultValue.slice(at, at + 2), 16) / 255);
    const actual = property.value.trim().split(/\s+/).map(Number);
    assert.ok(actual.every((channel, index) => Math.abs(channel - expected[index]) < .00001), `${field.key}: source color default preserved`);
  } else assert.equal(property.value, field.defaultValue, `${field.key}: source default preserved`);
  if (field.type === 'range') {
    for (const key of ['min', 'max', 'step']) assert.equal(property[key], field[key], `${field.key}: source ${key} preserved`);
  } else if (field.type === 'select') {
    assert.deepEqual(property.options.map(option => ({ value: option.value, label: option.label })), JSON.parse(JSON.stringify(field.options)), `${field.key}: source options preserved`);
  }
}

const copied = ['vendor/three.r128.min.js', 'harmonic-state-settings.js', 'harmonic-orbital-core.js', 'harmonic-orbital-atmosphere.js', 'harmonic-state-runtime.js'];
const identities = {};
for (const relative of copied) {
  const source = readFileSync(path.join(root, 'web', relative));
  const target = relative.startsWith('vendor/') ? relative : `runtime/${relative}`;
  const bundled = readFileSync(packagePath(target));
  assert.ok(source.equals(bundled), `${target}: packaged renderer must be byte-identical to the software preset`);
  identities[target] = createHash('sha256').update(bundled).digest('hex');
}
const html = readFileSync(packagePath(project.file), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
const styles = [...html.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
assert.ok(scripts.length >= 6, 'the standalone entry loads Three.js, the shared scene modules, and its adapter');
for (const reference of [...scripts, ...styles]) {
  assert.ok(!/^(?:https?:)?\/\//i.test(reference) && !reference.startsWith('/'), `entry asset must remain relative and local: ${reference}`);
  packagePath(reference.split(/[?#]/, 1)[0]);
}
for (const required of ['vendor/three.r128.min.js', 'runtime/harmonic-state-settings.js', 'runtime/harmonic-orbital-core.js', 'runtime/harmonic-orbital-atmosphere.js', 'runtime/harmonic-state-runtime.js', 'wallpaper.js']) {
  assert.ok(scripts.some(reference => reference.split(/[?#]/, 1)[0] === required), `standalone entry loads ${required}`);
}
assert.ok(scripts.indexOf('vendor/three.r128.min.js') < scripts.indexOf('runtime/harmonic-state-runtime.js'), 'Three.js loads before the renderer');
const forbiddenFiles = files.filter(file => /(?:^|\/)(?:app\.js|package(?:-lock)?\.json|node_modules|src)(?:$|\/)|\.(?:jar|exe|dll|node|ps1)$/i.test(file));
assert.deepEqual(forbiddenFiles, [], 'the package contains no desktop backend or Node runtime dependency');
for (const file of files.filter(file => /\.(?:html|css|js)$/i.test(file) && !file.startsWith('vendor/'))) {
  const source = readFileSync(packagePath(file), 'utf8');
  assert.doesNotMatch(source, /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::\d+)?/i, `${file}: no local application server`);
  assert.doesNotMatch(source, /(?:fetch|XMLHttpRequest|WebSocket)\s*\(\s*["'`]\/?api\//, `${file}: no backend API calls`);
  assert.doesNotMatch(source, /\brequire\s*\(|\bimport\s+(?:[\s\S]{0,100}?from\s*)?["']node:/, `${file}: no Node dependency`);
}
assert.ok(readFileSync(packagePath('LICENSE')).equals(readFileSync(path.join(root, 'LICENSE'))), 'the project license is preserved');
const threeLicense = readFileSync(packagePath('THREE-LICENSE.txt'), 'utf8');
assert.match(threeLicense, /Three\.js Authors/i); assert.match(threeLicense, /Permission is hereby granted/); assert.match(threeLicense, /THE SOFTWARE IS PROVIDED "AS IS"/);
const readme = readFileSync(packagePath('README.md'), 'utf8');
assert.match(readme, /Wallpaper Engine/i); assert.match(readme, /project\.json|index\.html/);
const ownership = JSON.parse(readFileSync(packagePath('.fe-harmonic-wallpaper-build.json'), 'utf8'));
assert.equal(ownership.owner, 'fe-monster-harmonic-wallpaper'); assert.equal(ownership.version, 1);
assert.ok(Array.isArray(ownership.files));
assert.deepEqual([...ownership.files].sort(), files.filter(file => file !== '.fe-harmonic-wallpaper-build.json').sort(), 'ownership metadata enumerates exactly the files in the package');
assert.equal(ownership.schemaControls, schema.length); assert.equal(ownership.properties, Object.keys(properties).length);
for (const relative of ownership.files) {
  const bytes = readFileSync(packagePath(relative));
  assert.equal(ownership.sha256?.[relative], createHash('sha256').update(bytes).digest('hex'), `${relative}: build manifest matches the packaged file`);
}
const appHtml = readFileSync(path.join(root, 'web/index.html'), 'utf8');
const appSource = readFileSync(path.join(root, 'web/app.js'), 'utf8');
assert.match(appHtml, /id="diyHarmonicStatePreset"[^>]+data-preset="harmonic-state"/);
assert.match(appHtml, /id="harmonicStateCore"/);
assert.match(appSource, /['"]harmonic-state['"][\s\S]{0,250}harmonic-state-runtime\.js|harmonic-state-runtime\.js/);
console.log(JSON.stringify({ ok: true, packageRoot, sceneProperties: schema.length, wallpaperProperties: extras.length, totalProperties: Object.keys(properties).length, fileCount: files.length, preview: previewSize, softwarePresetRetained: true, identities }, null, 2));
