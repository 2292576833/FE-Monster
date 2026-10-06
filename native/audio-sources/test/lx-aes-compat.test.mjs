import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { execute } from '../runtime.mjs';

const init = `lx.send('inited',{sources:{wy:{type:'music',actions:['musicUrl'],qualitys:['128k']}}});`;
const inspect = (script) => execute({ op: 'inspect', script: script + init, allowedHosts: [] });

test('LX AES accepts the string-input ECB pattern used by Sixyin and returns guest bytes', async () => {
  const cipher = createCipheriv('aes-128-ecb', Buffer.from('0123456789abcdef'), null);
  const expected = Buffer.concat([cipher.update('synthetic fixture'), cipher.final()]).toString('hex');
  const result = await inspect(`
    const encrypted=lx.utils.crypto.aesEncrypt('synthetic fixture','aes-128-ecb','0123456789abcdef','');
    if(!(encrypted instanceof Uint8Array))throw Error('not guest bytes');
    if(lx.utils.buffer.bufToString(encrypted,'hex')!==${JSON.stringify(expected)})throw Error('cipher mismatch');
    if(encrypted.constructor.constructor('return typeof process')()!=='undefined')throw Error('host escape');
  `);
  assert.equal(result.ok, true);
});

test('CBC accepts guest buffers and buffer.from can copy utility output', async () => {
  const key = '0123456789abcdef0123456789abcdef', iv = '0123456789abcdef';
  const cipher = createCipheriv('aes-256-cbc', Buffer.from(key), Buffer.from(iv));
  const expected = Buffer.concat([cipher.update('fixture'), cipher.final()]).toString('base64');
  const result = await inspect(`
    const {buffer,crypto}=lx.utils;
    const data=buffer.from(buffer.from('fixture'));
    const encrypted=crypto.aesEncrypt(data,'aes-256-cbc',buffer.from(${JSON.stringify(key)}),buffer.from(${JSON.stringify(iv)}));
    if(buffer.bufToString(buffer.from(encrypted),'base64')!==${JSON.stringify(expected)})throw Error('cipher mismatch');
  `);
  assert.equal(result.ok, true);
});

test('AES modes, key/IV sizes and payloads are bounded without exposing native crypto errors', async () => {
  for (const args of [
    `['fixture','des-ecb','SECRET','']`,
    `['fixture','aes-128-ecb','SECRET','']`,
    `['fixture','aes-128-cbc','0123456789abcdef','SECRET']`,
    `['fixture','aes-128-ecb','0123456789abcdef','not-an-empty-iv']`,
    `['x'.repeat(140000),'aes-128-ecb','0123456789abcdef','']`
  ]) {
    const result = await inspect(`lx.utils.crypto.aesEncrypt(...${args});`);
    assert.equal(result.ok, false);
    assert.doesNotMatch(JSON.stringify(result), /SECRET|openssl|cipher operation/i);
  }
});
