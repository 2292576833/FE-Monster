import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = path.join(root, 'wallpaper-engine/harmonic-realm');
const markerName = '.fe-harmonic-wallpaper-build.json';
const owner = 'fe-monster-harmonic-wallpaper';
const previewName = 'preview.jpg';
const arguments_ = process.argv.slice(2);
if (arguments_.includes('--help')) {
  console.log('node scripts/build-harmonic-wallpaper.mjs [--output=directory]\nDefault: output/wallpaper-engine/harmonic-realm\nOnly a new/empty directory or a directory owned by this builder can be updated.');
  process.exit(0);
}
if (arguments_.length > 1 || arguments_.some(argument => !argument.startsWith('--output=') || !argument.slice(9).trim())) {
  throw new Error('Expected at most one --output=directory argument.');
}
const output = path.resolve(arguments_[0]?.slice(9) || path.join(root, 'output/wallpaper-engine/harmonic-realm'));
const comparePath = value => process.platform === 'win32' ? value.toLowerCase() : value;
const isWithin = (parent, child) => comparePath(child) === comparePath(parent) || comparePath(child).startsWith(comparePath(parent) + path.sep);
if (isWithin(sourceDirectory, output) || isWithin(output, root)) {
  throw new Error('Output must be a separate package directory, not the source directory or a workspace ancestor.');
}

const copies = new Map([
  ['index.html', path.join(sourceDirectory, 'index.html')],
  ['wallpaper.css', path.join(sourceDirectory, 'wallpaper.css')],
  ['wallpaper.js', path.join(sourceDirectory, 'wallpaper.js')],
  ['README.md', path.join(sourceDirectory, 'README.md')],
  ['LICENSE', path.join(root, 'LICENSE')],
  ['THREE-LICENSE.txt', path.join(sourceDirectory, 'THREE-LICENSE.txt')],
  ['vendor/three.r128.min.js', path.join(root, 'web/vendor/three.r128.min.js')],
  ...['harmonic-state-settings.js', 'harmonic-orbital-core.js', 'harmonic-orbital-atmosphere.js', 'harmonic-state-runtime.js']
    .map(name => [`runtime/${name}`, path.join(root, 'web', name)])
]);
const allowed = new Set([...copies.keys(), 'project.json', previewName]);

async function statOrNull(file) {
  try { return await lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function assertRealPath(file) {
  for (let current = path.resolve(file); ; current = path.dirname(current)) {
    const stat = await statOrNull(current);
    if (stat?.isSymbolicLink()) throw new Error(`Refusing a symbolic link or junction in the output path: ${current}`);
    if (current === path.dirname(current)) break;
  }
}
async function validateOutput() {
  await assertRealPath(output);
  const outputStat = await statOrNull(output);
  if (outputStat && !outputStat.isDirectory()) throw new Error(`Output is not a directory: ${output}`);
  const entries = outputStat ? await readdir(output) : [];
  let previous = null;
  if (entries.length) {
    await assertRealPath(path.join(output, markerName));
    try { previous = JSON.parse(await readFile(path.join(output, markerName), 'utf8')); }
    catch { throw new Error(`Refusing to overwrite an unowned nonempty directory: ${output}`); }
    if (previous.owner !== owner || previous.version !== 1 || !Array.isArray(previous.files) || previous.files.some(file => !allowed.has(file))) {
      throw new Error(`Output ownership marker is not valid: ${output}`);
    }
  }
  for (const relative of [...allowed, markerName]) {
    const destination = path.join(output, relative);
    await assertRealPath(destination);
    const stat = await statOrNull(destination);
    if (stat && !stat.isFile()) throw new Error(`Refusing to replace a non-file: ${destination}`);
    if (stat && previous && relative !== markerName && !previous.files.includes(relative)
        && !(relative === previewName && previous.reservedFiles?.includes(previewName))) {
      throw new Error(`Refusing to overwrite a file not owned by this package: ${destination}`);
    }
  }
}

function colorValue(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Unsupported scene color: ${hex}`);
  return [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).join(' ');
}
function sceneProperty(field) {
  const property = { text: `${field.group} · ${field.key === 'lyricCardsEnabled' ? '信息卡片' : field.label}` };
  switch (field.type) {
    case 'range': return { ...property, type: 'slider', value: field.defaultValue, min: field.min, max: field.max, step: field.step };
    case 'checkbox': return { ...property, type: 'bool', value: field.defaultValue };
    case 'color': return { ...property, type: 'color', value: colorValue(field.defaultValue) };
    case 'select': return { ...property, type: 'combo', value: field.defaultValue, options: field.options.map(({ label, value }) => ({ label, value })) };
    default: throw new Error(`Unsupported scene property type: ${field.key} (${field.type})`);
  }
}

const sourceBuffers = await Promise.all([...copies].map(async ([relative, source]) => [relative, await readFile(source)]));
const bundle = new Map(sourceBuffers);
const context = vm.createContext({ window: {} }, { codeGeneration: { strings: false, wasm: false } });
vm.runInContext(bundle.get('runtime/harmonic-state-settings.js').toString('utf8'), context, { filename: 'harmonic-state-settings.js', timeout: 1000 });
const schema = context.window.FeHarmonicSettings?.schema;
if (!Array.isArray(schema) || !schema.length) throw new Error('Shared scene schema was not exported.');
const properties = {};
const addProperty = (key, property) => {
  if (Object.hasOwn(properties, key)) throw new Error(`Duplicate wallpaper property: ${key}`);
  const index = Object.keys(properties).length;
  properties[key] = { ...property, index, order: index };
};
addProperty('wallpaperSensitivity', { text: '壁纸 · 音频灵敏度', type: 'slider', value: 1, min: .25, max: 3, step: .05 });
addProperty('wallpaperQuality', { text: '壁纸 · 画质', type: 'combo', value: 'balanced', options: [
  { label: '节能', value: 'low' }, { label: '均衡', value: 'balanced' }, { label: '精细', value: 'high' }
] });
addProperty('wallpaperFrameLimit', { text: '壁纸 · 帧率上限（0 = 无上限）', type: 'slider', value: 0, min: 0, max: 360, step: 1 });
addProperty('wallpaperYaw', { text: '镜头 · 水平视角', type: 'slider', value: 0, min: -70, max: 70, step: 1 });
addProperty('wallpaperPitch', { text: '镜头 · 俯仰视角', type: 'slider', value: 0, min: -35, max: 35, step: 1 });
addProperty('wallpaperZoom', { text: '镜头 · 缩放', type: 'slider', value: 1, min: .6, max: 1.5, step: .01 });
addProperty('wallpaperMediaEnabled', { text: '信息 · 读取系统媒体信息', type: 'bool', value: true });
addProperty('wallpaperCardTitle', { text: '信息 · 自定义标题', type: 'textinput', value: '谐波之境' });
addProperty('wallpaperCardArtist', { text: '信息 · 自定义作者', type: 'textinput', value: 'HARMONIC REALM' });
addProperty('wallpaperCardHint', { text: '信息 · 自定义说明', type: 'textinput', value: '随声而动' });
for (const field of schema) addProperty(field.key, sceneProperty(field));
const project = {
  title: '谐波之境 · Harmonic Realm',
  description: 'FE Monster 谐波之境独立音频响应壁纸。旋转圆环、悬浮方块、粒子束、落地雾与真实水面倒影，支持系统媒体信息和独立颜色设置。信息卡片展示歌名与歌手，不包含逐字歌词。',
  type: 'web', file: 'index.html', preview: previewName,
  contentrating: 'Everyone', audio: { enabled: true },
  general: { supportsaudioprocessing: true, properties }
};
bundle.set('project.json', Buffer.from(JSON.stringify(project, null, 2) + '\n'));
const sourcePreview = path.join(sourceDirectory, previewName);
if (await statOrNull(sourcePreview)) bundle.set(previewName, await readFile(sourcePreview));

// Resolve and inspect every destination before writing; unknown files are never removed.
await validateOutput();
await mkdir(output, { recursive: true });
for (const [relative, bytes] of bundle) {
  const destination = path.join(output, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}
if (!bundle.has(previewName) && await statOrNull(path.join(output, previewName))) {
  bundle.set(previewName, await readFile(path.join(output, previewName)));
}
const metadata = {
  owner, version: 1,
  files: [...bundle.keys()].sort(),
  reservedFiles: [previewName],
  schemaControls: schema.length,
  properties: Object.keys(properties).length,
  sha256: Object.fromEntries([...bundle].map(([relative, bytes]) => [relative, createHash('sha256').update(bytes).digest('hex')]))
};
await writeFile(path.join(output, markerName), JSON.stringify(metadata, null, 2) + '\n');
if (!bundle.has(previewName)) {
  console.warn(`Preview pending: generate ${path.join(output, previewName)}, then copy it to ${sourcePreview} and rebuild before distributing.`);
}
console.log(JSON.stringify({ output, files: bundle.size + 1, sceneControls: schema.length, properties: metadata.properties, previewReady: bundle.has(previewName) }, null, 2));
