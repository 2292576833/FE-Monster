import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { gzipSync, deflateSync } from 'node:zlib';
import test from 'node:test';

// Self-authored contract fixtures; real third-party backup files are not assumed.
const source = readFileSync(new URL('../web/lx-playlists.js', import.meta.url), 'utf8');
const hash = '0123456789abcdef0123456789abcdef';
const wy = id => ({ id: `wy_${id}`, name: `网易 ${id}`, singer: '歌手', source: 'wy', interval: '03:21',
  meta: { songId: id, albumName: '专辑', picUrl: 'https://media.example.org/cover.jpg' } });
const tx = { id: 'tx_TRACK', name: 'QQ 样本', singer: '歌手', source: 'tx', interval: '01:02:03',
  meta: { songId: 'TRACK', id: 777, strMediaMid: 'MEDIA', albumName: '专辑' } };
const kg = { name: '酷狗样本', singer: '歌手', source: 'kg', songmid: hash.toUpperCase(),
  albumAudioId: 123, albumId: 456, interval: 88,
  _types: { flac: { hash: hash.toUpperCase(), size: '24 MB', url: 'https://must-not-persist.example/secret' } } };
const backup = (songs = [wy('123'), tx, kg]) => ({ type: 'playList', version: '2.0.0',
  data: [{ id: 'fixture-list', name: '洛雪混合歌单', list: songs }] });
const plain = value => JSON.parse(JSON.stringify(value));

function fixture(storage = new Map()) {
  let failWrites = false;
  const window = { localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => { if (failWrites) throw new Error('QuotaExceededError'); storage.set(key, value); }
  } };
  runInNewContext(source, { window, document: { readyState: 'loading', addEventListener() {} },
    TextEncoder, TextDecoder, URL, Blob, DecompressionStream });
  return { api: window.feLxPlaylists, storage, failWrites: () => { failWrites = true; } };
}
const file = (bytes, name = 'fixture.lxmc') => ({ name, size: bytes.byteLength,
  arrayBuffer: async () => Uint8Array.from(bytes).buffer });

test('maps modern and legacy metadata without losing playback identities', () => {
  const result = fixture().api.parse(backup());
  assert.equal(result.playlists.length, 3);
  assert.equal(result.songs, 3);
  const [netease, qq, kugou] = result.playlists.map(item => item.songs[0]);
  assert.equal(netease.id, '123'); assert.equal(netease.duration, 201);
  assert.equal(qq.id, 'TRACK'); assert.equal(qq.duration, 3723);
  assert.equal(qq.sourceRef.songmid, 'TRACK');
  assert.equal(qq.sourceRef.mediaMid, 'MEDIA'); assert.equal(qq.sourceRef.qqId, '777');
  assert.equal(kugou.id, `kg|${hash}|123|456`);
  assert.deepEqual(plain(kugou.sourceRef.lxTypes), { flac: { hash: hash.toUpperCase(), size: '24 MB' } });
  assert.doesNotMatch(JSON.stringify(result), /must-not-persist|secret/);
});

test('reports unsupported platforms and invalid songs; deduplicates within each list', () => {
  const { api } = fixture();
  const result = api.parse(backup([wy('123'), wy('123'), wy('bad'), { source: 'kw' }, { source: 'mg' }, { source: 'local' }]));
  assert.equal(result.songs, 1); assert.equal(result.duplicates, 1); assert.equal(result.skipped, 4);
  assert.deepEqual(plain(result.unsupported), { kw: 1, mg: 1, local: 1 });
  const value = backup([wy('123')]); value.data.push({ id: 'other', name: '另一歌单', list: [wy('123')] });
  assert.equal(api.parse(value).songs, 2);
});

test('reads UTF-8, BOM, gzip and zlib locally and rejects other content', async () => {
  const { api } = fixture();
  const bytes = Buffer.from(JSON.stringify(backup()));
  for (const content of [bytes, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]), gzipSync(bytes), deflateSync(bytes)]) {
    assert.equal((await api.readFile(file(content))).songs, 3);
  }
  assert.equal((await api.readFile(file(bytes, 'fixture.json'))).songs, 3);
  await assert.rejects(api.readFile(file(bytes, 'unsafe.js')), /请选择洛雪/);
  await assert.rejects(api.readFile(file(Buffer.from([0xff, 0xfe]))), /无法读取/);
  await assert.rejects(api.readFile(file(Buffer.from('not JSON'))), /无法读取/);
  await assert.rejects(api.readFile(file(gzipSync(bytes).subarray(0, 12))), /压缩内容损坏/);
});

test('bounds file size, decompression, list count and track count', async () => {
  const { api } = fixture();
  await assert.rejects(api.readFile({ name: 'big.lxmc', size: 9 * 1024 * 1024, arrayBuffer() { throw new Error('must not read'); } }), /8 MiB/);
  await assert.rejects(api.readFile(file(gzipSync(Buffer.alloc(17 * 1024 * 1024, 32)))), /16 MiB/);
  assert.throws(() => api.parse(backup(Array(20001).fill(wy('1')))), /20000/);
  assert.throws(() => api.parse({ data: Array(101).fill({ list: [] }) }), /100/);
});

test('preview, import, update, removal and reload only touch the imported copy', () => {
  const { api, storage } = fixture();
  const report = api.parse(backup());
  assert.equal(storage.size, 0); assert.equal(api.getPlaylists().length, 0);
  api.importReport(report);
  assert.equal(api.getPlaylists().length, 3);
  const id = api.getPlaylists('netease')[0].id;
  api.getSongs(id)[0].title = 'modified';
  assert.notEqual(api.getSongs(id)[0].title, 'modified');
  api.importReport(api.parse(backup([wy('234')])));
  assert.equal(api.getPlaylists().length, 3);
  assert.equal(api.getSongs(id)[0].id, '234');
  fixture(storage).api.remove(id);
  assert.equal(fixture(storage).api.getPlaylists().length, 2);
  assert.equal(storage.size, 1);
});

test('write failure preserves disk and memory; corrupt saved data is not overwritten', () => {
  const env = fixture();
  env.api.importReport(env.api.parse(backup([wy('1')])));
  const before = [...env.storage.values()][0];
  env.failWrites();
  assert.throws(() => env.api.importReport(env.api.parse(backup([wy('2')]))), /未修改已有歌单/);
  assert.equal([...env.storage.values()][0], before);
  assert.equal(env.api.getSongs(env.api.getPlaylists()[0].id)[0].id, '1');
  const broken = fixture(new Map([['fe.lx-playlists.v1', '{broken']]));
  assert.throws(() => broken.api.importReport(broken.api.parse(backup())), /不会覆盖/);
  assert.equal(broken.storage.get('fe.lx-playlists.v1'), '{broken');
});
