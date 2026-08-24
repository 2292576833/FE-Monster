import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const appPath = path.join(root, 'web', 'app.js');
const source = fs.readFileSync(appPath, 'utf8');

function extractFunction(name) {
  const functionStart = source.indexOf(`function ${name}(`);
  assert.notEqual(functionStart, -1, `${name} must exist in web/app.js.`);
  const start = source.slice(functionStart - 6, functionStart) === 'async '
    ? functionStart - 6
    : functionStart;
  const signatureStart = source.indexOf('(', start);
  let signatureDepth = 0;
  let signatureEnd = -1;
  for (let index = signatureStart; index < source.length; index += 1) {
    if (source[index] === '(') signatureDepth += 1;
    if (source[index] === ')') signatureDepth -= 1;
    if (signatureDepth === 0) {
      signatureEnd = index;
      break;
    }
  }
  const bodyStart = source.indexOf('{', signatureEnd);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} has an unterminated function body.`);
}

const enqueueSource = extractFunction('enqueueNativeSpatialBlock');
const recycleSource = extractFunction('recycleNativeSpatialBlock');
const discardSource = extractFunction('discardNativeSpatialBlocks');
const pumpSource = extractFunction('pumpNativeSpatialBlocks');
const disposeSource = extractFunction('disposeOfficialGoogleObrGraph');
const prerollSource = extractFunction('waitForNativeGoogleObrPreroll');
const healthSource = extractFunction('refreshNativeGoogleObrHealth');

assert.match(
  disposeSource,
  /discardNativeSpatialBlocks\(graph\)/,
  'Native graph disposal must synchronously discard queued ownership before closing the port.'
);
for (const [label, functionSource] of [
  ['preroll', prerollSource],
  ['steady-state health', healthSource]
]) {
  assert.match(
    functionSource,
    /graph\.transportDroppedBlocks\s*>\s*0/,
    `${label} must fail the graph after a main-thread upload overflow.`
  );
  assert.match(
    functionSource,
    /graph\.poolStarvedFrames\s*>\s*0/,
    `${label} must fail the graph after AudioWorklet pool starvation.`
  );
}

let fetchImplementation = null;
const failures = [];
const context = vm.createContext({
  AbortController,
  Float32Array,
  URLSearchParams,
  GOOGLE_OBR_NATIVE_TRANSPORT_FRAMES: 4096,
  GOOGLE_OBR_NATIVE_MAX_PENDING_BLOCKS: 4,
  fetch: (...args) => fetchImplementation(...args),
  safeText: (value, fallback) => String(value || fallback),
  state: { obrSpatialAudio: { requested: true } },
  failGoogleObr: (error) => failures.push(error)
});
vm.runInContext(`
  ${recycleSource}
  ${discardSource}
  ${enqueueSource}
  ${pumpSource}
  globalThis.nativeSpatialBufferApi = {
    enqueueNativeSpatialBlock,
    recycleNativeSpatialBlock,
    discardNativeSpatialBlocks,
    pumpNativeSpatialBlocks
  };
`, context, { filename: appPath });
const api = context.nativeSpatialBufferApi;

const response = (sequence) => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, sequence })
});

const sequenceFromUrl = (url) => Number(new URL(String(url), 'http://localhost').searchParams.get('sequence'));

function makeGraph() {
  const recycleMessages = [];
  return {
    disposed: false,
    session: 41,
    generation: 9,
    streamAbort: { signal: {} },
    blockQueue: [],
    blockUploadActive: false,
    activeBlock: null,
    nextBlockSequence: 0,
    uploadedBlocks: 0,
    transportDroppedBlocks: 0,
    node: {
      port: {
        postMessage(message, transfer = []) {
          recycleMessages.push({
            message: structuredClone(message, { transfer }),
            transferCount: transfer.length
          });
        }
      }
    },
    recycleMessages
  };
}

const makePcm = (seed) => {
  const pcm = new Float32Array(4096 * 2);
  pcm[0] = seed;
  return pcm;
};

const ownership = (bufferId, poolEpoch = 3) => ({ bufferId, poolEpoch });

async function waitUntil(predicate, label) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`Timed out waiting for ${label}.`);
}

// The active upload owns its transferable until the HTTP body and response
// have completed; only then may it be posted back to the worklet.
{
  const graph = makeGraph();
  const pcm = makePcm(1);
  let resolveUpload;
  let request = null;
  fetchImplementation = (url, options) => {
    request = { url, options };
    return new Promise((resolve) => { resolveUpload = resolve; });
  };
  assert.equal(api.enqueueNativeSpatialBlock(graph, pcm, ownership(0)), true);
  assert.equal(graph.recycleMessages.length, 0, 'An uploading buffer must remain exclusively owned by fetch.');
  assert.equal(request.options.body, pcm, 'The exact Float32Array should be uploaded without a per-block wrapper.');
  resolveUpload(response(0));
  await waitUntil(() => !graph.blockUploadActive, 'the first upload to finish');
  assert.equal(graph.recycleMessages.length, 1, 'A completed upload must return its transferable once.');
  assert.equal(graph.recycleMessages[0].message.type, 'recycle-pcm');
  assert.notEqual(graph.recycleMessages[0].message.pcm, pcm);
  assert.equal(graph.recycleMessages[0].message.pcm.byteLength, 4096 * 2 * Float32Array.BYTES_PER_ELEMENT);
  assert.equal(pcm.byteLength, 0, 'Recycling must detach the main-thread upload view.');
  assert.equal(graph.recycleMessages[0].message.bufferId, 0);
  assert.equal(graph.recycleMessages[0].message.poolEpoch, 3);
  assert.equal(graph.recycleMessages[0].transferCount, 1);
}

// Queue overflow may return the oldest queued block immediately, but never the
// block still owned by the pending upload.
{
  const graph = makeGraph();
  const blocks = Array.from({ length: 6 }, (_, index) => makePcm(index + 10));
  let resolveFirst;
  let fetchCalls = 0;
  fetchImplementation = (url) => {
    const sequence = sequenceFromUrl(url);
    fetchCalls += 1;
    if (fetchCalls === 1) {
      return new Promise((resolve) => { resolveFirst = () => resolve(response(sequence)); });
    }
    return Promise.resolve(response(sequence));
  };
  blocks.forEach((pcm, index) => {
    assert.equal(api.enqueueNativeSpatialBlock(graph, pcm, ownership(index)), true);
  });
  assert.deepEqual(
    graph.recycleMessages.map(({ message }) => message.bufferId),
    [1],
    'Only the oldest queued block should be returned when the four-block queue overflows.'
  );
  assert.ok(
    !graph.recycleMessages.some(({ message }) => message.bufferId === 0),
    'The active upload must not be recycled by queue overflow.'
  );
  resolveFirst();
  await waitUntil(() => !graph.blockUploadActive, 'the overflow probe uploads to drain');
  assert.deepEqual(
    graph.recycleMessages.map(({ message }) => message.bufferId).sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5],
    'Every accepted or dropped transferable should be returned exactly once while the graph remains live.'
  );
  assert.equal(graph.transportDroppedBlocks, 1);
}

// Once disposal begins, queued and active storage belongs to the obsolete pool
// epoch. It must be dropped rather than posted into a closing worklet port.
{
  const graph = makeGraph();
  let rejectUpload;
  fetchImplementation = () => new Promise((resolve, reject) => { rejectUpload = reject; });
  api.enqueueNativeSpatialBlock(graph, makePcm(30), ownership(0, 8));
  api.enqueueNativeSpatialBlock(graph, makePcm(31), ownership(1, 8));
  graph.disposed = true;
  api.discardNativeSpatialBlocks(graph);
  assert.equal(graph.blockQueue.length, 0, 'Disposal must release queued references immediately.');
  assert.equal(graph.recycleMessages.length, 0, 'Disposed graphs must not return obsolete epoch buffers.');
  const aborted = new Error('aborted');
  aborted.name = 'AbortError';
  rejectUpload(aborted);
  await waitUntil(() => !graph.blockUploadActive, 'the disposed upload to settle');
  assert.equal(graph.activeBlock, null, 'The settled active upload must release its main-thread reference.');
  assert.equal(graph.recycleMessages.length, 0, 'The active buffer must also be discarded after disposal.');
}

assert.equal(failures.length, 0, 'Focused successful/abort paths must not fail the native chain.');

console.log(JSON.stringify({
  pass: true,
  activeOwnership: 'until-response-complete',
  overflow: 'oldest-queued-returned',
  disposal: 'obsolete-epoch-discarded'
}, null, 2));
