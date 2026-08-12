import { writeFileSync } from 'node:fs';

function u32(value) {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(Number(value) >>> 0, 0);
  return buffer;
}

export function scenePackageBuffer(entries, options = {}) {
  const version = Buffer.from(options.version || 'PKGV0021', 'ascii');
  const normalizedEntries = entries.map((entry) => ({
    ...entry,
    nameBytes: entry.nameBytes || Buffer.from(String(entry.name || ''), 'utf8'),
    dataBytes: Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data ?? ''), 'utf8')
  }));
  let nextOffset = 0;
  const index = [];
  for (const entry of normalizedEntries) {
    const offset = entry.offset == null ? nextOffset : Number(entry.offset);
    const size = entry.size == null ? entry.dataBytes.length : Number(entry.size);
    index.push(u32(entry.nameBytes.length), entry.nameBytes, u32(offset), u32(size));
    nextOffset += entry.dataBytes.length;
  }
  return Buffer.concat([
    u32(version.length),
    version,
    u32(options.declaredCount ?? normalizedEntries.length),
    ...index,
    ...normalizedEntries.map((entry) => entry.dataBytes)
  ]);
}

export function writeScenePackage(file, entries, options = {}) {
  writeFileSync(file, scenePackageBuffer(entries, options));
}

export const VALID_SCENE_PACKAGE_ENTRIES = Object.freeze([
  {
    name: 'scene.json',
    data: JSON.stringify({
      scene: { name: 'Fixture scene' },
      script: 'export function update(value) { thisLayer.visible = value > 0.5; }'
    })
  },
  { name: 'materials/base.json', data: '{"material":"fixture"}' },
  { name: 'models/001 - 电脑.json', data: '{"model":"fixture"}' },
  { name: 'shaders/effect.vert', data: 'void main() { gl_Position = vec4(0.0); }' },
  { name: 'shaders/effect.frag', data: 'void main() { gl_FragColor = vec4(1.0); }' },
  { name: 'textures/base.tex', data: Buffer.from('TEXV0005fixture', 'ascii') }
]);
