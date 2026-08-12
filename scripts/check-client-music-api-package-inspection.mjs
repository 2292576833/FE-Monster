import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { deflateRawSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const inspectorPath = path.join(root, 'web', 'music-api-package-client.js');
const source = await readFile(inspectorPath, 'utf8');

let fetchCalls = 0;
const windowObject = {};
const context = vm.createContext({
  window: windowObject,
  Blob,
  DecompressionStream,
  TextDecoder,
  Uint8Array,
  DataView,
  ArrayBuffer,
  DOMException,
  fetch() {
    fetchCalls += 1;
    throw new Error('the client package inspector must never call fetch');
  }
});
vm.runInContext(source, context, { filename: inspectorPath });

const inspector = windowObject.feMusicApiPackageClient;
assert.equal(typeof inspector?.inspect, 'function', 'window.feMusicApiPackageClient.inspect must be exposed');
assert.doesNotMatch(source, /\bfetch\s*\(/, 'the package inspector must not contain a server/network fetch path');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function crc32(input) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries, options = {}) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const method = entry.method === 'deflate' ? 8 : 0;
    const compressed = method === 8 ? deflateRawSync(content) : content;
    const flags = (entry.flags ?? 0) | 0x0800;
    const extra = entry.extra || Buffer.alloc(0);
    const checksum = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(extra.length, 28);
    const localRecord = Buffer.concat([local, name, extra, compressed]);
    localParts.push(localRecord);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.zip64 ? 0xffffffff : compressed.length, 20);
    central.writeUInt32LE(entry.zip64 ? 0xffffffff : content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(extra.length, 30);
    central.writeUInt32LE(entry.zip64 ? 0xffffffff : localOffset, 42);
    centralParts.push(Buffer.concat([central, name, extra]));
    localOffset += localRecord.length;
  }

  const locals = Buffer.concat(localParts);
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(options.zip64 ? 0xffffffff : centralDirectory.length, 12);
  eocd.writeUInt32LE(options.zip64 ? 0xffffffff : locals.length, 16);
  return Buffer.concat([locals, centralDirectory, eocd]);
}

function makeFile(name, data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  const stats = { fullReads: 0, slices: [], bytesRead: 0 };
  return {
    name,
    size: bytes.length,
    stats,
    async arrayBuffer() {
      stats.fullReads += 1;
      throw new Error('whole-file arrayBuffer() is forbidden');
    },
    slice(start = 0, end = bytes.length) {
      const from = Math.max(0, Math.min(bytes.length, Number(start) || 0));
      const to = Math.max(from, Math.min(bytes.length, end == null ? bytes.length : Number(end)));
      stats.slices.push([from, to]);
      stats.bytesRead += to - from;
      const copy = bytes.subarray(from, to);
      return {
        async arrayBuffer() {
          return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
        }
      };
    }
  };
}

async function expectReject(file, pattern) {
  await assert.rejects(() => inspector.inspect(file), pattern);
  assert.equal(file.stats.fullReads, 0, `${file.name} was read into memory as one full package`);
}

const rootJson = makeFile('qq-provider.json', JSON.stringify({ id: 'qqmusic' }));
assert.deepEqual(
  plain(await inspector.inspect(rootJson)),
  { providers: [{ id: 'qq', label: 'QQ音乐' }], packageType: 'json' },
  'a root provider object and documented QQ Music alias should be recognized'
);

const providerArray = makeFile('four.feapi', JSON.stringify({
  providers: [
    { id: '163' },
    { id: 'tencent' },
    { id: 'kg' },
    { id: 'qishui' }
  ]
}));
assert.deepEqual(
  plain(await inspector.inspect(providerArray)),
  {
    providers: [
      { id: 'netease', label: '网易云音乐' },
      { id: 'qq', label: 'QQ音乐' },
      { id: 'kugou', label: '酷狗音乐' },
      { id: 'qishui', label: '汽水音乐' }
    ],
    packageType: 'feapi'
  },
  'FEAPI provider arrays should normalize the explicit, documented aliases'
);

await expectReject(
  makeFile('missing-id.json', JSON.stringify({ providers: [{ label: 'No identity' }] })),
  /explicit.*(?:id|provider)|(?:id|provider).*required/i
);
await expectReject(
  makeFile('duplicate.json', JSON.stringify({ providers: [{ id: 'qq' }, { id: 'qqmusic' }] })),
  /duplicate.*qq/i
);
await expectReject(
  makeFile('json-provider-alias-field.json', JSON.stringify({ provider: 'qq' })),
  /explicit.*id|id.*required/i
);
await expectReject(
  makeFile('frontend-only-alias.json', JSON.stringify({ id: 'qq-music' })),
  /unsupported.*qq-music|unknown.*qq-music/i
);
await expectReject(
  makeFile('unknown.feapi', JSON.stringify({ id: 'spotify' })),
  /unsupported.*spotify|unknown.*spotify/i
);
await expectReject(
  makeFile('empty-providers.json', JSON.stringify({ providers: [] })),
  /between one and four/i
);
await expectReject(
  makeFile('too-many-providers.json', JSON.stringify({
    providers: ['netease', 'qq', 'kugou', 'qishui', 'qq'].map((id) => ({ id }))
  })),
  /between one and four/i
);

const storedManifest = JSON.stringify({ schema: 'fe-monster.music-api-package/v1', id: 'kugou' });
const storedZip = makeFile('kugou.zip', makeZip([
  { name: 'plugin/entry.js', data: 'window.__executedByInspector = true;' },
  { name: 'plugin/unread-payload.bin', data: Buffer.alloc(256 * 1024, 0x5a) },
  { name: 'plugin/music-api-package.json', data: storedManifest }
]));
assert.deepEqual(
  plain(await inspector.inspect(storedZip)),
  { providers: [{ id: 'kugou', label: '酷狗音乐' }], packageType: 'zip' },
  'stored ZIP manifests should be inspected'
);
assert.equal(windowObject.__executedByInspector, undefined, 'ZIP entry source was executed during inspection');
assert.equal(storedZip.stats.fullReads, 0, 'stored ZIP was read as a whole file');
assert(
  storedZip.stats.slices.every(([from, to]) => to - from < storedZip.size),
  'a large ZIP must only be read through bounded package segments'
);

const deflatedZip = makeFile('qishui.zip', makeZip([
  {
    name: 'fe-music-api.json',
    method: 'deflate',
    data: JSON.stringify({ schema: 'fe-monster.music-api-package/v1', provider: 'qishui' })
  }
]));
assert.deepEqual(
  plain(await inspector.inspect(deflatedZip)),
  { providers: [{ id: 'qishui', label: '汽水音乐' }], packageType: 'zip' },
  'deflated ZIP manifests should be inspected with the browser decompressor'
);
assert.equal(deflatedZip.stats.fullReads, 0, 'deflated ZIP was read as a whole file');

await expectReject(
  makeFile('two-manifests.zip', makeZip([
    { name: 'a/music-api-package.json', data: storedManifest },
    { name: 'b/fe-music-api.json', data: storedManifest }
  ])),
  /exactly one|multiple.*manifest/i
);
await expectReject(
  makeFile('zip-slip.zip', makeZip([
    { name: '../music-api-package.json', data: storedManifest }
  ])),
  /unsafe|absolute|path/i
);
await expectReject(
  makeFile('encrypted.zip', makeZip([
    { name: 'music-api-package.json', flags: 0x0001, data: storedManifest }
  ])),
  /encrypted/i
);
await expectReject(
  makeFile('zip64.zip', makeZip([
    { name: 'music-api-package.json', data: storedManifest }
  ], { zip64: true })),
  /zip64/i
);

const outOfBoundsZipBytes = makeZip([
  { name: 'music-api-package.json', data: storedManifest }
]);
const centralSignature = outOfBoundsZipBytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
assert(centralSignature >= 0, 'test fixture central directory was not generated');
outOfBoundsZipBytes.writeUInt32LE(0xfffffff0, centralSignature + 42);
await expectReject(
  makeFile('out-of-bounds.zip', outOfBoundsZipBytes),
  /central directory|outside|points/i
);

await expectReject(
  makeFile('wrong-schema.zip', makeZip([
    { name: 'music-api-package.json', data: JSON.stringify({ schema: 'third-party/v9', id: 'qq' }) }
  ])),
  /unsupported.*schema/i
);
await expectReject(
  makeFile('oversized-manifest.zip', makeZip([
    {
      name: 'music-api-package.json',
      method: 'deflate',
      data: JSON.stringify({
        schema: 'fe-monster.music-api-package/v1',
        id: 'qq',
        padding: 'x'.repeat(64 * 1024)
      })
    }
  ])),
  /manifest.*64\s*kB|manifest.*too large|exceeds.*64\s*kB/i
);

assert.equal(fetchCalls, 0, 'client inspection attempted a server/network request');
assert.equal(rootJson.stats.fullReads, 0, 'JSON inspection bypassed sliced reads');
assert.equal(providerArray.stats.fullReads, 0, 'FEAPI inspection bypassed sliced reads');

console.log(JSON.stringify({
  ok: true,
  cases: {
    json: true,
    feapi: true,
    zipStored: true,
    zipDeflate: true,
    noWholeZipRead: true,
    noFetch: fetchCalls === 0,
    invalidIdentityRejected: true,
    duplicateRejected: true,
    unknownRejected: true,
    aliasesMatchLocalRuntime: true,
    providerCountBounded: true,
    multipleManifestRejected: true,
    unsafePathRejected: true,
    encryptedRejected: true,
    zip64Rejected: true,
    outOfBoundsRejected: true,
    wrongSchemaRejected: true,
    oversizedManifestRejected: true,
    entryNeverExecuted: windowObject.__executedByInspector === undefined
  }
}, null, 2));
