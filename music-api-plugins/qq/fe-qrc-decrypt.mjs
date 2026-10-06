// QQ Music cloud-QRC decoder derived from valenbine/LRC-GET (MIT).
// The DES compatibility code in fe-qrc-des.mjs preserves QQ Music's byte order.
// See LRC-GET-LICENSE.txt in this plugin package.

import { inflateRawSync, inflateSync } from 'node:zlib';
import { createSchedule, DECRYPT, tripleDESCrypt, tripleDESKeySetup } from './fe-qrc-des.mjs';

const QQ_QRC_KEY = Buffer.from('!@#)(*$%123ZXC!@!@#)(NHL', 'ascii');

export function decryptQrc(encrypted) {
  const cleanHex = String(encrypted ?? '').replace(/\s+/g, '');
  if (cleanHex.length > 2 * 1024 * 1024 || !/^[\da-f]+$/iu.test(cleanHex) || cleanHex.length % 16 !== 0) {
    throw new Error('QQ QRC encrypted content must be an even-length hex string');
  }
  const encryptedBytes = Buffer.from(cleanHex, 'hex');
  const schedule = createSchedule();
  tripleDESKeySetup(QQ_QRC_KEY, schedule, DECRYPT);
  const decrypted = Buffer.alloc(encryptedBytes.length);

  for (let offset = 0; offset < encryptedBytes.length; offset += 8) {
    const inputBlock = Buffer.alloc(8);
    const outputBlock = Buffer.alloc(8);
    encryptedBytes.copy(inputBlock, 0, offset, Math.min(offset + 8, encryptedBytes.length));
    tripleDESCrypt(inputBlock, outputBlock, schedule);
    outputBlock.copy(decrypted, offset, 0, Math.min(8, encryptedBytes.length - offset));
  }

  let inflated;
  try {
    inflated = inflateSync(decrypted, { maxOutputLength: 4 * 1024 * 1024 });
  } catch (zlibError) {
    try {
      inflated = inflateRawSync(decrypted, { maxOutputLength: 4 * 1024 * 1024 });
    } catch {
      throw zlibError;
    }
  }
  const xml = inflated.toString('utf8');
  if (!/LyricContent\s*=|\[\d+\s*,\s*\d+\]|\[\d+:\d+/iu.test(xml)) {
    throw new Error('QQ QRC decrypted content has no lyric timeline');
  }
  return xml;
}

export function decodeQqPayload(payload = {}) {
  const decode = (value) => {
    if (typeof value !== 'string') return '';
    if (Number(payload.crypt) === 1 && /^[\da-f]+$/iu.test(value.trim())) {
      return extractQrcLyricText(decryptQrc(value));
    }
    return extractQrcLyricText(value);
  };
  const lyric = decode(payload.lyric);
  const qrc = typeof payload.qrc === 'string' && payload.qrc ? decode(payload.qrc) : lyric;
  const detailed = /\[\d+,\d+\]/u.test(qrc) && /\(\d+,\d+\)/u.test(qrc);
  return {
    ...payload,
    lyric,
    qrc: detailed ? qrc : '',
    trans: decode(payload.trans),
    roma: decode(payload.roma),
    crypt: 0
  };
}

export function extractQrcLyricText(xml) {
  const source = String(xml ?? '');
  const match = /LyricContent\s*=\s*"([^"]*)"/iu.exec(source);
  return unescapeXml(match?.[1] || source).trim();
}

function unescapeXml(source) {
  return source
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replaceAll('&apos;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&#10;', '\n')
    .replaceAll('&#13;', '\r');
}
