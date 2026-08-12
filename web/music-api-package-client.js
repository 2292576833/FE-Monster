(() => {
  'use strict';

  const MAX_JSON_BYTES = 64 * 1024;
  const MAX_ZIP_BYTES = 25 * 1024 * 1024;
  const MAX_CENTRAL_DIRECTORY_BYTES = 1024 * 1024;
  const MAX_MANIFEST_COMPRESSED_BYTES = 128 * 1024;
  const MAX_ZIP_ENTRIES = 256;
  const MAX_EOCD_TAIL_BYTES = 22 + 0xffff;
  const PACKAGE_SCHEMA = 'fe-monster.music-api-package/v1';
  const CONFIG_SCHEMA = 'fe-monster.music-apis/v1';
  const MANIFEST_NAMES = new Set(['music-api-package.json', 'fe-music-api.json']);
  const WINDOWS_RESERVED = new Set([
    'con', 'prn', 'aux', 'nul', 'clock$',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
  ]);

  const PROVIDERS = Object.freeze({
    netease: Object.freeze({ id: 'netease', label: '网易云音乐' }),
    qq: Object.freeze({ id: 'qq', label: 'QQ音乐' }),
    kugou: Object.freeze({ id: 'kugou', label: '酷狗音乐' }),
    qishui: Object.freeze({ id: 'qishui', label: '汽水音乐' })
  });

  // Keep aliases byte-for-byte aligned with MusicProviderRegistry.normalize so a
  // package accepted by client recognition cannot later fail only at installation.
  // Chinese display names are labels only and never serve as package identities.
  const PROVIDER_ALIASES = new Map([
    ['netease', 'netease'],
    ['163', 'netease'],
    ['wangyiyun', 'netease'],
    ['qq', 'qq'],
    ['qqmusic', 'qq'],
    ['tencent', 'qq'],
    ['kugou', 'kugou'],
    ['kg', 'kugou'],
    ['kugoumusic', 'kugou'],
    ['qishui', 'qishui']
  ]);

  function fail(message) {
    throw new Error(message);
  }

  function own(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function dataView(bytes) {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  function u16(view, offset) {
    return view.getUint16(offset, true);
  }

  function u32(view, offset) {
    return view.getUint32(offset, true);
  }

  function assertRange(offset, length, maximum, label) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length)
      || offset < 0 || length < 0 || offset > maximum || length > maximum - offset) {
      fail(`${label} points outside the ZIP package`);
    }
  }

  async function readFileSlice(file, start, end, label) {
    assertRange(start, end - start, file.size, label);
    if (typeof file.slice !== 'function') fail('music API package does not support sliced client reads');
    const part = file.slice(start, end);
    if (!part || typeof part.arrayBuffer !== 'function') fail('music API package slice is unreadable');
    const buffer = await part.arrayBuffer();
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== end - start) {
      fail(`${label} was truncated while reading`);
    }
    return new Uint8Array(buffer);
  }

  function decodeUtf8(bytes, label) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      fail(`${label} is not valid UTF-8`);
    }
  }

  function decodeZipName(bytes, utf8) {
    if (utf8) return decodeUtf8(bytes, 'ZIP entry name');
    let value = '';
    for (const byte of bytes) value += String.fromCharCode(byte);
    return value;
  }

  function parseJsonObject(bytes, label) {
    const text = decodeUtf8(bytes, label).replace(/^\uFEFF/, '').trim();
    if (!text.startsWith('{') || !text.endsWith('}')) fail(`${label} must be a complete JSON object`);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      fail(`${label} contains invalid JSON`);
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') fail(`${label} must be a JSON object`);
    return parsed;
  }

  function normalizeProviderIdentity(value) {
    if (typeof value !== 'string' || !value.trim()) fail('an explicit non-empty id or provider is required');
    const alias = value.trim().toLowerCase();
    const id = PROVIDER_ALIASES.get(alias);
    if (!id) fail(`unsupported music provider: ${value.trim()}`);
    return id;
  }

  function providerFromRecord(record, allowProviderAlias) {
    if (!record || Array.isArray(record) || typeof record !== 'object') {
      fail('each provider must be an object with an explicit id field');
    }
    const hasId = own(record, 'id');
    const hasProvider = own(record, 'provider');
    if (!hasId && !(allowProviderAlias && hasProvider)) {
      fail('each JSON/FEAPI provider requires an explicit id field');
    }
    const id = hasId ? normalizeProviderIdentity(record.id) : null;
    const provider = hasProvider ? normalizeProviderIdentity(record.provider) : null;
    if (id && provider && id !== provider) fail('provider id and provider fields identify different platforms');
    return PROVIDERS[id || provider];
  }

  function inspectProviderObject(root, options = {}) {
    if (own(root, 'schema')) {
      if (typeof root.schema !== 'string' || (root.schema !== PACKAGE_SCHEMA && root.schema !== CONFIG_SCHEMA)) {
        fail(`unsupported music API package schema: ${String(root.schema || '')}`);
      }
    } else if (options.requirePackageSchema) {
      fail('ZIP music API manifest requires the package schema');
    }

    let records;
    if (own(root, 'providers')) {
      if (options.singleProvider) fail('ZIP music API manifest must identify one provider with id or provider');
      if (own(root, 'id') || own(root, 'provider')) fail('music API config cannot mix a root identity with providers');
      if (!Array.isArray(root.providers)) fail('providers must be an array');
      records = root.providers;
    } else {
      records = [root];
    }

    if (records.length < 1 || records.length > 4) fail('music API config must contain between one and four providers');
    const seen = new Set();
    const providers = records.map((record) => {
      const provider = providerFromRecord(record, options.allowProviderAlias === true);
      if (seen.has(provider.id)) fail(`duplicate music provider: ${provider.id}`);
      seen.add(provider.id);
      return { id: provider.id, label: provider.label };
    });
    return providers;
  }

  function hasZip64Extra(extra) {
    const view = dataView(extra);
    let offset = 0;
    while (offset < extra.byteLength) {
      if (extra.byteLength - offset < 4) fail('ZIP extra field is truncated');
      const type = u16(view, offset);
      const size = u16(view, offset + 2);
      offset += 4;
      if (size > extra.byteLength - offset) fail('ZIP extra field points outside its entry');
      if (type === 0x0001) return true;
      offset += size;
    }
    return false;
  }

  function findEndOfCentralDirectory(tail, tailStart, fileSize) {
    const view = dataView(tail);
    for (let offset = tail.byteLength - 22; offset >= 0; offset -= 1) {
      if (u32(view, offset) !== 0x06054b50) continue;
      const commentLength = u16(view, offset + 20);
      if (tailStart + offset + 22 + commentLength === fileSize) return offset;
    }
    fail('ZIP end-of-central-directory record was not found');
  }

  function parseCentralDirectory(bytes, expectedEntries, centralOffset) {
    const view = dataView(bytes);
    const entries = [];
    let offset = 0;
    for (let index = 0; index < expectedEntries; index += 1) {
      if (bytes.byteLength - offset < 46 || u32(view, offset) !== 0x02014b50) {
        fail('ZIP central directory is malformed or truncated');
      }
      const flags = u16(view, offset + 8);
      const method = u16(view, offset + 10);
      const checksum = u32(view, offset + 16);
      const compressedSize = u32(view, offset + 20);
      const uncompressedSize = u32(view, offset + 24);
      const nameLength = u16(view, offset + 28);
      const extraLength = u16(view, offset + 30);
      const commentLength = u16(view, offset + 32);
      const diskStart = u16(view, offset + 34);
      const localOffset = u32(view, offset + 42);
      const recordLength = 46 + nameLength + extraLength + commentLength;
      if (recordLength > bytes.byteLength - offset) fail('ZIP central directory entry is truncated');
      if ((flags & 0x0001) !== 0) fail('encrypted ZIP entries are not accepted');
      if (diskStart !== 0) fail('multi-disk ZIP packages are not accepted');
      if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
        fail('ZIP64 packages are not accepted');
      }
      const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
      const extra = bytes.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength);
      if (hasZip64Extra(extra)) fail('ZIP64 packages are not accepted');
      const name = decodeZipName(nameBytes, (flags & 0x0800) !== 0);
      if (!name || name.includes('\0')) fail('ZIP entry name is invalid');
      if (localOffset >= centralOffset) fail('ZIP local entry points into the central directory');
      entries.push({
        name,
        flags,
        method,
        checksum,
        compressedSize,
        uncompressedSize,
        localOffset
      });
      offset += recordLength;
    }
    if (offset !== bytes.byteLength) fail('ZIP central directory contains unaccounted data');
    return entries;
  }

  function validateZipEntryNames(entries) {
    const seen = new Set();
    for (const entry of entries) {
      const name = entry.name.replace(/\\/g, '/');
      if (!name || name.startsWith('/') || /^[a-z]:/i.test(name) || name.includes(':')) {
        fail('ZIP package contains an absolute or device path');
      }
      const path = name.endsWith('/') ? name.slice(0, -1) : name;
      if (!path) fail('ZIP package contains an empty path');
      for (const part of path.split('/')) {
        if (!part || part === '.' || part === '..' || part.endsWith(' ') || part.endsWith('.')) {
          fail('ZIP package contains an unsafe path segment');
        }
        const stem = part.toLowerCase().split('.', 1)[0];
        if (WINDOWS_RESERVED.has(stem)) fail('ZIP package contains a reserved Windows path');
      }
      const key = name.toLowerCase();
      if (seen.has(key)) fail('ZIP package contains duplicate paths');
      seen.add(key);
    }
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  async function inflateManifest(compressed, expectedSize) {
    if (typeof DecompressionStream !== 'function' || typeof Blob !== 'function') {
      fail('this client cannot inspect deflated ZIP manifests');
    }
    let stream;
    try {
      stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    } catch {
      fail('deflated ZIP manifest could not be opened');
    }
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        const chunk = part.value instanceof Uint8Array ? part.value : new Uint8Array(part.value);
        total += chunk.byteLength;
        if (total > MAX_JSON_BYTES || total > expectedSize) {
          await reader.cancel();
          fail('ZIP manifest exceeds 64 KB or its declared size');
        }
        chunks.push(chunk);
      }
    } catch (error) {
      if (error instanceof Error && /ZIP manifest exceeds/.test(error.message)) throw error;
      fail('deflated ZIP manifest is invalid');
    }
    if (total !== expectedSize) fail('ZIP manifest size does not match the central directory');
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  }

  async function readManifest(file, entry, centralOffset) {
    if (entry.uncompressedSize > MAX_JSON_BYTES) fail('ZIP manifest exceeds 64 KB');
    if (entry.compressedSize > MAX_MANIFEST_COMPRESSED_BYTES) fail('ZIP manifest compressed data is too large');

    const header = await readFileSlice(file, entry.localOffset, entry.localOffset + 30, 'ZIP local header');
    const headerView = dataView(header);
    if (u32(headerView, 0) !== 0x04034b50) fail('ZIP local header signature is invalid');
    const flags = u16(headerView, 6);
    const method = u16(headerView, 8);
    const checksum = u32(headerView, 14);
    const compressedSize = u32(headerView, 18);
    const uncompressedSize = u32(headerView, 22);
    const nameLength = u16(headerView, 26);
    const extraLength = u16(headerView, 28);
    if ((flags & 0x0001) !== 0) fail('encrypted ZIP entries are not accepted');
    if (flags !== entry.flags || method !== entry.method) fail('ZIP local and central entry metadata disagree');
    if ((flags & 0x0008) === 0
      && (checksum !== entry.checksum || compressedSize !== entry.compressedSize || uncompressedSize !== entry.uncompressedSize)) {
      fail('ZIP local and central entry sizes disagree');
    }
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) fail('ZIP64 packages are not accepted');

    const metadataLength = nameLength + extraLength;
    const metadataStart = entry.localOffset + 30;
    assertRange(metadataStart, metadataLength, centralOffset, 'ZIP local metadata');
    const metadata = await readFileSlice(file, metadataStart, metadataStart + metadataLength, 'ZIP local metadata');
    const localName = decodeZipName(metadata.subarray(0, nameLength), (flags & 0x0800) !== 0);
    if (localName !== entry.name) fail('ZIP local and central entry names disagree');
    if (hasZip64Extra(metadata.subarray(nameLength))) fail('ZIP64 packages are not accepted');

    const dataStart = metadataStart + metadataLength;
    assertRange(dataStart, entry.compressedSize, centralOffset, 'ZIP manifest data');
    const compressed = await readFileSlice(file, dataStart, dataStart + entry.compressedSize, 'ZIP manifest data');
    let manifest;
    if (entry.method === 0) {
      if (entry.compressedSize !== entry.uncompressedSize) fail('stored ZIP manifest size is invalid');
      manifest = compressed;
    } else if (entry.method === 8) {
      manifest = await inflateManifest(compressed, entry.uncompressedSize);
    } else {
      fail(`unsupported ZIP manifest compression method: ${entry.method}`);
    }
    if (crc32(manifest) !== entry.checksum) fail('ZIP manifest checksum is invalid');
    return manifest;
  }

  async function inspectZip(file) {
    if (file.size < 22) fail('ZIP music API package is truncated');
    if (file.size > MAX_ZIP_BYTES) fail('ZIP music API package exceeds 25 MB');
    const tailStart = Math.max(0, file.size - MAX_EOCD_TAIL_BYTES);
    const tail = await readFileSlice(file, tailStart, file.size, 'ZIP directory tail');
    const eocdOffsetInTail = findEndOfCentralDirectory(tail, tailStart, file.size);
    const eocdOffset = tailStart + eocdOffsetInTail;
    const view = dataView(tail);
    if (eocdOffsetInTail >= 20 && u32(view, eocdOffsetInTail - 20) === 0x07064b50) {
      fail('ZIP64 packages are not accepted');
    }
    const disk = u16(view, eocdOffsetInTail + 4);
    const centralDisk = u16(view, eocdOffsetInTail + 6);
    const diskEntries = u16(view, eocdOffsetInTail + 8);
    const totalEntries = u16(view, eocdOffsetInTail + 10);
    const centralSize = u32(view, eocdOffsetInTail + 12);
    const centralOffset = u32(view, eocdOffsetInTail + 16);
    if (disk === 0xffff || centralDisk === 0xffff || diskEntries === 0xffff || totalEntries === 0xffff
      || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      fail('ZIP64 packages are not accepted');
    }
    if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) fail('multi-disk ZIP packages are not accepted');
    if (totalEntries < 1 || totalEntries > MAX_ZIP_ENTRIES) fail('ZIP package has an invalid entry count');
    if (centralSize > MAX_CENTRAL_DIRECTORY_BYTES) fail('ZIP central directory is too large');
    if (centralOffset + centralSize !== eocdOffset) fail('ZIP central directory bounds are invalid');

    const central = await readFileSlice(file, centralOffset, centralOffset + centralSize, 'ZIP central directory');
    const entries = parseCentralDirectory(central, totalEntries, centralOffset);
    validateZipEntryNames(entries);
    const manifests = entries.filter((entry) => {
      const normalized = entry.name.replace(/\\/g, '/');
      const basename = normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase();
      return MANIFEST_NAMES.has(basename);
    });
    if (manifests.length !== 1) fail('ZIP package must contain exactly one music API manifest');
    const manifestBytes = await readManifest(file, manifests[0], centralOffset);
    const root = parseJsonObject(manifestBytes, 'ZIP music API manifest');
    return {
      providers: inspectProviderObject(root, {
        requirePackageSchema: true,
        singleProvider: true,
        allowProviderAlias: true
      }),
      packageType: 'zip'
    };
  }

  async function inspectJson(file, packageType) {
    if (file.size > MAX_JSON_BYTES) fail('music API config exceeds 64 KB');
    if (file.size < 2) fail('music API config is empty');
    const bytes = await readFileSlice(file, 0, file.size, 'music API config');
    const root = parseJsonObject(bytes, 'music API config');
    return { providers: inspectProviderObject(root), packageType };
  }

  async function inspect(file) {
    if (!file || typeof file.name !== 'string' || !Number.isSafeInteger(file.size) || file.size < 0) {
      fail('a readable music API package file is required');
    }
    const match = /\.([^.]+)$/.exec(file.name.trim().toLowerCase());
    const extension = match?.[1] || '';
    if (extension === 'zip') return inspectZip(file);
    if (extension === 'json' || extension === 'feapi') return inspectJson(file, extension);
    fail('music API package must be a .json, .feapi, or .zip file');
  }

  window.feMusicApiPackageClient = Object.freeze({ inspect });
})();
