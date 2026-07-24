import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeSource = await fs.readFile(path.join(here, 'fe-monster-ios-runtime.js'), 'utf8');
const cssSource = await fs.readFile(path.join(here, 'fe-monster-ios.css'), 'utf8');

assert.equal((cssSource.match(/\{/g) || []).length, (cssSource.match(/\}/g) || []).length);
for (const token of [
  '--ios-glass-background',
  'rgba(0, 0, 0, 0.74)',
  'blur(24px) saturate(1.08) brightness(0.82)',
  'min-inline-size: var(--ios-control)',
  'env(safe-area-inset-top',
  '@media (orientation: landscape)'
]) {
  assert.ok(cssSource.includes(token), `missing CSS contract: ${token}`);
}

const storage = new Map();
const root = {
  dataset: {},
  style: { setProperty() {} }
};
const documentListeners = new Map();
const document = {
  readyState: 'loading',
  documentElement: root,
  body: null,
  addEventListener(type, listener) {
    documentListeners.set(type, listener);
  },
  getElementById() {
    return null;
  },
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  }
};
const nativeMessages = [];
const windowListeners = new Map();
const window = {
  location: new URL('file:///FE%20Monster/index.html'),
  innerWidth: 390,
  innerHeight: 844,
  visualViewport: null,
  localStorage: {
    getItem(key) {
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    }
  },
  addEventListener(type, listener) {
    windowListeners.set(type, listener);
  },
  requestAnimationFrame(callback) {
    queueMicrotask(() => callback(0));
    return 1;
  },
  setTimeout,
  clearTimeout,
  dispatchEvent() {},
  btoa(value) {
    return Buffer.from(value, 'binary').toString('base64');
  },
  fetch: async () => new Response('external', { status: 200 }),
  webkit: {
    messageHandlers: {
      feMonsterIOS: {
        postMessage(message) {
          nativeMessages.push(message);
          queueMicrotask(() => {
            window.FEIOSNativeBridge._resolve(message.requestId, {
              ok: true,
              value: {
                status: 200,
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: JSON.stringify({
                  ok: true,
                  providers: [
                    { id: 'netease', enabled: true, configured: true },
                    { id: 'qq', enabled: true, configured: true },
                    { id: 'kugou', enabled: true, configured: true }
                  ]
                })
              }
            });
          });
        }
      }
    }
  }
};
window.window = window;
window.document = document;

class Element {}
class HTMLImageElement extends Element {}
class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
}
class MutationObserver {
  observe() {}
}

const context = vm.createContext({
  window,
  document,
  URL,
  URLSearchParams,
  Request,
  Response,
  Headers,
  Blob,
  FormData,
  ArrayBuffer,
  Uint8Array,
  Element,
  HTMLImageElement,
  CustomEvent,
  MutationObserver,
  FileReader: class {},
  console,
  setTimeout,
  clearTimeout,
  queueMicrotask
});

vm.runInContext(runtimeSource, context, {
  filename: 'fe-monster-ios-runtime.js'
});

assert.equal(root.dataset.fePlatform, 'ios');
assert.equal(root.dataset.feFormFactor, 'phone');
assert.equal(root.dataset.feClientSource, 'ios-bundled');

const runtimeResponse = await window.fetch('/api/app/runtime');
assert.equal(runtimeResponse.status, 200);
assert.equal((await runtimeResponse.json()).clientMode, 'ios-local');

const preset = { id: 'test-preset', name: 'Test', sceneItems: [] };
const saveResponse = await window.fetch('/api/sandbox/presets', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ preset })
});
assert.equal(saveResponse.status, 200);
assert.equal((await saveResponse.json()).presets.length, 1);
const listResponse = await window.fetch('/api/sandbox/presets');
assert.deepEqual((await listResponse.json()).presets, [preset]);

const providersResponse = await window.fetch('/api/providers');
const providersPayload = await providersResponse.json();
assert.equal(providersPayload.providers.length, 3);
assert.equal(nativeMessages.length, 1);
assert.equal(nativeMessages[0].action, 'nativeFetch');
assert.equal(nativeMessages[0].payload.path, '/api/providers');
assert.equal(nativeMessages[0].payload.method, 'GET');

console.log('FE Monster iOS WebOverlay validation passed.');

