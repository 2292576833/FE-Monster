(function lxPlaylistsModule() {
  'use strict';

  const STORAGE_KEY = 'fe.lx-playlists.v1';
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_JSON_BYTES = 16 * 1024 * 1024;
  const MAX_STORAGE_BYTES = 4 * 1024 * 1024;
  const MAX_LISTS = 100;
  const MAX_SONGS = 20000;
  const PROVIDERS = Object.freeze({ wy: 'netease', tx: 'qq', kg: 'kugou' });
  const LABELS = Object.freeze({ netease: '网易云', qq: 'QQ 音乐', kugou: '酷狗' });
  const QUALITIES = ['128k', '192k', '320k', 'flac', 'flac24bit', 'ape', 'wav'];
  let records = [];
  let storageError = '';
  let hooks = {};
  let pending = null;
  let fileRevision = 0;
  let dom;

  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const text = (value, max = 256) => (typeof value === 'string' || typeof value === 'number')
    ? String(value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
  const clone = value => JSON.parse(JSON.stringify(value));
  const byteLength = value => new TextEncoder().encode(value).byteLength;

  function duration(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? Math.min(86400, Math.max(0, Math.floor(value))) : 0;
    const parts = text(value, 16).split(':');
    if (parts.length > 3 || !parts.every(part => /^\d{1,5}$/.test(part))) return 0;
    return Math.min(86400, parts.reduce((total, part) => total * 60 + Number(part), 0));
  }

  function coverUrl(value) {
    try {
      const url = new URL(text(value, 2048));
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }

  function qualityMetadata(value) {
    const result = {};
    for (const quality of QUALITIES) {
      const item = object(object(value)[quality]);
      const hash = text(item.hash, 64);
      const size = text(item.size, 32);
      if (/^[a-f0-9]{32}$/i.test(hash) || size) {
        result[quality] = {};
        if (/^[a-f0-9]{32}$/i.test(hash)) result[quality].hash = hash;
        if (size) result[quality].size = size;
      }
    }
    return result;
  }

  function normalizeSong(value) {
    const raw = object(value);
    const source = text(raw.source, 8);
    const provider = Object.hasOwn(PROVIDERS, source) ? PROVIDERS[source] : '';
    if (!provider) return null;
    const meta = object(raw.meta);
    const ownId = text(raw.id).replace(new RegExp(`^${source}_`), '');
    let id = text(meta.songId || raw.songmid || raw.songId || ownId);
    const ref = {};
    if (provider === 'netease') {
      if (!/^\d{1,20}$/.test(id)) return null;
      ref.providerSongId = id;
    } else if (provider === 'qq') {
      id = text(meta.songmid || meta.mid || raw.songmid || id);
      if (!/^[a-z0-9]{1,64}$/i.test(id)) return null;
      ref.songmid = id;
      ref.mediaMid = text(meta.strMediaMid || meta.mediaMid || raw.strMediaMid || raw.mediaMid || id, 64);
      ref.qqId = text(meta.id || raw.songId || (/^\d+$/.test(text(meta.songId)) ? meta.songId : ''), 32);
      ref.albumId = text(meta.albumId || raw.albumId, 64);
    } else {
      const hash = text(meta.hash || raw.hash || id, 64);
      if (!/^[a-f0-9]{32}$/i.test(hash)) return null;
      ref.hash = hash.toLowerCase();
      ref.albumAudioId = text(meta.albumAudioId || raw.albumAudioId, 64);
      ref.albumId = text(meta.albumId || raw.albumId, 64);
      if (![ref.albumAudioId, ref.albumId].every(value => /^\d{0,20}$/.test(value))) return null;
      id = `kg|${ref.hash}|${ref.albumAudioId}|${ref.albumId}`;
    }
    const types = qualityMetadata(meta._qualitys || meta.qualitys || raw._types);
    if (Object.keys(types).length) ref.lxTypes = types;
    return {
      id, provider, title: text(raw.name, 512) || '未命名歌曲',
      artist: text(raw.singer, 512), album: text(meta.albumName || raw.albumName, 512),
      duration: duration(raw.interval), cover: coverUrl(meta.picUrl || raw.img || raw.pic), sourceRef: ref
    };
  }

  function playlistEntries(value) {
    const root = object(value);
    const type = text(root.type, 32).toLowerCase();
    if (type && !['playlist', 'playlistdata', 'alldata'].includes(type)) throw new Error('不是可识别的洛雪歌单备份。');
    const data = root.data === undefined ? root : root.data;
    if (Array.isArray(data)) return data;
    const lists = object(object(data).listData || data);
    if (Array.isArray(lists.list)) return [lists];
    const result = [];
    for (const [key, name] of [['defaultList', '默认列表'], ['loveList', '我的收藏']]) {
      if (Array.isArray(lists[key])) result.push({ id: key, name, list: lists[key] });
      else if (Array.isArray(object(lists[key]).list)) result.push({ ...lists[key], id: key });
    }
    if (Array.isArray(lists.userList)) result.push(...lists.userList);
    if (!result.length) throw new Error('未找到可识别的洛雪歌单；请导出歌单文件，而不是音源脚本或设置文件。');
    return result;
  }

  function parse(value) {
    const lists = playlistEntries(value);
    if (!lists.length || lists.length > MAX_LISTS) throw new Error(`每次需导入 1–${MAX_LISTS} 个歌单。`);
    const result = new Map();
    const report = { playlists: [], songs: 0, skipped: 0, duplicates: 0, unsupported: {} };
    let total = 0;
    for (const entry of lists) {
      const list = object(entry);
      if (!Array.isArray(list.list)) throw new Error('歌单结构不完整：缺少歌曲列表。');
      total += list.list.length;
      if (total > MAX_SONGS) throw new Error(`单次备份最多包含 ${MAX_SONGS} 首歌曲。`);
      const name = text(list.name, 200) || '未命名歌单';
      const identity = text(list.id) || name;
      for (const raw of list.list) {
        const source = text(object(raw).source, 8);
        if (!Object.hasOwn(PROVIDERS, source)) {
          const label = ['kw', 'mg', 'local'].includes(source) ? source : 'unknown';
          report.unsupported[label] = (report.unsupported[label] || 0) + 1;
          report.skipped += 1;
          continue;
        }
        const song = normalizeSong(raw);
        if (!song) { report.skipped += 1; continue; }
        const id = `lx-import:${song.provider}:${encodeURIComponent(identity)}`;
        let item = result.get(id);
        if (!item) {
          item = { id, name, provider: song.provider, creator: '洛雪导入', lxImported: true, songs: [], seen: new Set() };
          result.set(id, item);
        }
        if (item.seen.has(song.id)) { report.duplicates += 1; continue; }
        item.seen.add(song.id);
        item.songs.push(song);
        report.songs += 1;
      }
    }
    report.playlists = [...result.values()].map(({ seen, ...item }) => ({ ...item, trackCount: item.songs.length }));
    if (report.playlists.length > MAX_LISTS) throw new Error(`按平台拆分后最多保存 ${MAX_LISTS} 个歌单。`);
    return report;
  }

  async function readFile(file) {
    if (!file || !/\.(json|lxmc)$/i.test(file.name || '')) throw new Error('请选择洛雪导出的 .lxmc 或 .json 歌单文件。');
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE_BYTES) throw new Error('歌单文件不能为空，且不能超过 8 MiB。');
    let bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_FILE_BYTES) throw new Error('歌单文件超过 8 MiB。');
    const format = bytes[0] === 0x1f && bytes[1] === 0x8b ? 'gzip'
      : bytes[0] === 0x78 && ((bytes[0] << 8) + bytes[1]) % 31 === 0 ? 'deflate' : '';
    if (format) {
      if (typeof DecompressionStream !== 'function') throw new Error('当前浏览器不支持解压歌单，请使用解压后的 JSON 文件。');
      const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)).getReader();
      const chunks = [];
      let size = 0;
      try {
        for (;;) {
          const item = await reader.read();
          if (item.done) break;
          size += item.value.length;
          if (size > MAX_JSON_BYTES) throw new Error('解压后的歌单超过 16 MiB。');
          chunks.push(item.value);
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw new Error(error.message === '解压后的歌单超过 16 MiB。' ? error.message : '歌单压缩内容损坏或格式不受支持。');
      } finally { reader.releaseLock(); }
      bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    }
    let value;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new Error('无法读取歌单：仅支持 UTF-8 JSON 或 gzip/zlib 压缩的 JSON，不支持加密或其他备份格式。'); }
    return parse(value);
  }

  function validateRecords(items) {
    if (!Array.isArray(items) || items.length > MAX_LISTS) throw new Error('本地洛雪歌单数据无效。');
    let count = 0;
    const ids = new Set();
    for (const item of items) {
      if (!item || !Object.hasOwn(LABELS, item.provider) || typeof item.id !== 'string'
          || !item.id.startsWith(`lx-import:${item.provider}:`) || item.id.length > 2500
          || typeof item.name !== 'string' || item.name.length > 200 || ids.has(item.id)
          || !Array.isArray(item.songs) || !item.songs.length) throw new Error('本地洛雪歌单数据无效。');
      ids.add(item.id);
      count += item.songs.length;
      if (count > MAX_SONGS) throw new Error(`本地最多保存 ${MAX_SONGS} 首洛雪歌曲。`);
      for (const song of item.songs) {
        if (!song || song.provider !== item.provider || typeof song.id !== 'string'
            || !song.id || song.id.length > 256 || typeof song.title !== 'string'
            || typeof song.artist !== 'string' || typeof song.album !== 'string'
            || !Number.isFinite(song.duration) || song.duration < 0 || song.duration > 86400
            || song.localUrl || song.url || song.local || Object.keys(song).some(key => ![
              'id', 'provider', 'title', 'artist', 'album', 'duration', 'cover', 'sourceRef'
            ].includes(key))) throw new Error('本地洛雪歌曲数据无效。');
      }
    }
    return items;
  }

  function readStored() {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];
      if (byteLength(saved) > MAX_STORAGE_BYTES) throw new Error();
      const value = JSON.parse(saved);
      if (value.version !== 1) throw new Error();
      return validateRecords(value.playlists);
    } catch {
      storageError = '本地洛雪歌单无法读取；为保护已有数据，本次不会覆盖保存。';
      return [];
    }
  }

  function save(next) {
    if (storageError) throw new Error(storageError);
    validateRecords(next);
    const serialized = JSON.stringify({ version: 1, playlists: next });
    if (byteLength(serialized) > MAX_STORAGE_BYTES) throw new Error('洛雪歌单超过 4 MiB 本地保存上限，请先移除部分导入副本。');
    try { window.localStorage.setItem(STORAGE_KEY, serialized); }
    catch { throw new Error('本地空间不足或存储不可用，未修改已有歌单。'); }
    records = clone(next);
  }

  function importReport(report) {
    if (!report || !Array.isArray(report.playlists) || !report.playlists.length) throw new Error('没有可以导入的歌曲。');
    const next = new Map(records.map(item => [item.id, item]));
    for (const item of report.playlists) next.set(item.id, item);
    save([...next.values()]);
    changed();
  }

  function remove(id) {
    if (!records.some(item => item.id === id)) return;
    save(records.filter(item => item.id !== id));
    changed();
  }

  function getPlaylists(provider) {
    return records.filter(item => !provider || item.provider === provider).map(item => ({
      id: item.id, name: item.name, provider: item.provider, creator: '洛雪导入', lxImported: true,
      trackCount: item.songs.length, cover: item.songs.find(song => song.cover)?.cover || ''
    }));
  }

  function getSongs(id) { return clone(records.find(item => item.id === id)?.songs || []); }

  function status(message) { if (dom) dom.status.textContent = message; }

  function changed() {
    render();
    try { Promise.resolve(hooks.onChanged?.()).catch(() => status('歌单已保存，但列表刷新失败，请重新打开歌单栏。')); }
    catch { status('歌单已保存，但列表刷新失败，请重新打开歌单栏。'); }
  }

  function render() {
    if (!dom) return;
    dom.count.textContent = `${records.length} / ${MAX_LISTS}`;
    dom.saved.replaceChildren();
    for (const playlist of getPlaylists()) {
      const card = document.createElement('article');
      card.className = 'audio-source-card';
      const title = document.createElement('strong');
      title.textContent = playlist.name;
      const detail = document.createElement('p');
      detail.textContent = `${LABELS[playlist.provider]} · ${playlist.trackCount} 首`;
      const actions = document.createElement('div');
      actions.className = 'audio-source-import-actions';
      const open = document.createElement('button');
      open.type = 'button'; open.textContent = '打开歌单'; open.disabled = typeof hooks.onOpen !== 'function';
      open.addEventListener('click', async () => {
        try { await hooks.onOpen(playlist); } catch (error) { status(error.message); }
      });
      const drop = document.createElement('button');
      drop.type = 'button'; drop.textContent = '移除副本';
      drop.addEventListener('click', () => {
        if (!window.confirm(`移除「${playlist.name}」的本地导入副本？不会修改洛雪原文件或平台歌单。`)) return;
        try { remove(playlist.id); status('已移除本地导入副本。'); } catch (error) { status(error.message); }
      });
      actions.append(open, drop); card.append(title, detail, actions); dom.saved.append(card);
    }
  }

  function clearPreview() {
    fileRevision += 1; pending = null;
    dom.input.value = ''; dom.preview.replaceChildren(); dom.preview.hidden = true;
    dom.submit.disabled = true; dom.cancel.hidden = true;
  }

  function initialize() {
    const find = id => document.getElementById(id);
    if (!find('lxPlaylistChoose')) return;
    dom = { choose: find('lxPlaylistChoose'), input: find('lxPlaylistFile'), preview: find('lxPlaylistPreview'),
      submit: find('lxPlaylistImport'), cancel: find('lxPlaylistCancel'), saved: find('lxPlaylistSaved'),
      count: find('lxPlaylistCount'), status: find('lxPlaylistStatus') };
    dom.choose.addEventListener('click', () => dom.input.click());
    dom.cancel.addEventListener('click', () => { clearPreview(); status('已取消预览，未修改任何歌单。'); });
    dom.input.addEventListener('change', async () => {
      const file = dom.input.files?.[0];
      clearPreview();
      if (!file) return;
      const revision = fileRevision;
      dom.cancel.hidden = false;
      status('正在本机读取歌单；不会执行备份内容或访问网络…');
      try {
        const report = await readFile(file);
        if (revision !== fileRevision) return;
        pending = report;
        dom.preview.hidden = false;
        const summary = document.createElement('p');
        summary.textContent = `${text(file.name, 200)}：${report.playlists.length} 个平台歌单，${report.songs} 首歌曲；跳过 ${report.skipped} 首，去重 ${report.duplicates} 首。`;
        dom.preview.append(summary);
        for (const item of report.playlists) {
          const line = document.createElement('p');
          line.textContent = `${item.name} · ${LABELS[item.provider]} · ${item.trackCount} 首${records.some(saved => saved.id === item.id) ? '（更新已有导入副本）' : ''}`;
          dom.preview.append(line);
        }
        const skipped = Object.entries(report.unsupported).map(([source, count]) => `${source}: ${count}`).join('，');
        status(storageError || (report.songs ? `预览完成，确认后才保存。${skipped ? `未接入的平台已跳过（${skipped}）。` : ''}` : '没有支持的有效歌曲；当前只接入网易云、QQ、酷狗。'));
        dom.submit.disabled = !!storageError || !report.songs;
      } catch (error) { if (revision === fileRevision) status(error.message); }
    });
    dom.submit.addEventListener('click', () => {
      if (!pending) return;
      try {
        const count = pending.playlists.length;
        importReport(pending); clearPreview();
        status(`已保存 ${count} 个歌单到本机浏览器；点击“打开歌单”选歌，播放使用当前音源。`);
      } catch (error) { status(error.message); }
    });
    render();
    if (storageError) status(storageError);
  }

  function configure(options = {}) { hooks = { ...hooks, ...options }; render(); }
  records = readStored();
  window.feLxPlaylists = Object.freeze({ configure, getPlaylists, getSongs, parse, readFile, importReport, remove });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
