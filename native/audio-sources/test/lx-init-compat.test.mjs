import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execute } from '../runtime.mjs';

const init = `lx.send(lx.EVENT_NAMES.inited,{sources:{wy:{type:'music',actions:['musicUrl'],qualitys:['128k']}}});`;
const isolationCheck = `
  if ([typeof process, typeof require, typeof Buffer, typeof fetch, typeof window, typeof document].some(value => value !== 'undefined')) throw Error('Host capability exposed');
  if (lx.send.constructor('return typeof process')() !== 'undefined') throw Error('Host Function exposed');
`;
const request = { source: 'wy', action: 'musicUrl', info: { type: '128k', musicInfo: { id: 'fixture' } } };

function offlineNetwork() {
  const calls = { requests: 0, validated: [], closes: 0 };
  return {
    calls,
    network: {
      request() { calls.requests++; throw Error('This fixture must not make HTTP requests'); },
      async validateUrl(url) { calls.validated.push(url); },
      close() { calls.closes++; },
    },
  };
}

test('official currentScriptInfo exposes script header fields and exact raw script inside the guest', async () => {
  const script = `/*!
 * @name Synthetic source
 * @description Initialization metadata fixture
 * @version v1.2.3
 * @author Fixture author
 * @homepage https://source.example.org/
 */
${isolationCheck}
const info = lx.currentScriptInfo;
const expected = {name:'Synthetic source',description:'Initialization metadata fixture',version:'v1.2.3',author:'Fixture author',homepage:'https://source.example.org/'};
for (const key of Object.keys(expected)) if (info[key] !== expected[key]) throw Error('Incorrect metadata: ' + key);
if (typeof info.rawScript !== 'string') throw Error('Missing raw script');
lx.on(lx.EVENT_NAMES.request, async () => 'https://media.example.org/' + lx.utils.crypto.md5(info.rawScript) + '.mp3');
${init}`;
  const { network, calls } = offlineNetwork();
  const result = await execute({ op: 'resolve', script, allowedHosts: ['media.example.org'], request }, { network });
  const url = `https://media.example.org/${createHash('md5').update(script).digest('hex')}.mp3`;
  assert.deepEqual(result, { ok: true, url });
  assert.equal(calls.requests, 0);
  assert.deepEqual(calls.validated, [url]);
  assert.equal(calls.closes, 1);
});

test('an official updateAlert before inited preserves initialization and subsequent music URL resolution', async () => {
  const script = `${isolationCheck}
if (lx.EVENT_NAMES.updateAlert !== 'updateAlert') throw Error('Missing update event');
lx.send(lx.EVENT_NAMES.updateAlert,{log:'Synthetic update notice',updateUrl:'https://source.example.org/update'});
lx.on(lx.EVENT_NAMES.request, async ({info}) => 'https://media.example.org/' + info.musicInfo.id + '.mp3');
${init}`;
  const { network, calls } = offlineNetwork();
  const result = await execute({ op: 'resolve', script, allowedHosts: ['media.example.org'], request }, { network });
  const url = 'https://media.example.org/fixture.mp3';
  assert.deepEqual(result, { ok: true, url });
  assert.equal(calls.requests, 0);
  assert.deepEqual(calls.validated, [url]);
  assert.equal(calls.closes, 1);
});
