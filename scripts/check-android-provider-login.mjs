import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const runtimePath = path.join(root, "android/app/src/main/androidWeb/fe-monster-mobile-runtime.js");
const runtimeSource = readFileSync(runtimePath, "utf8");
const providers = ["netease", "qq", "kugou", "qishui"];
const require = createRequire(import.meta.url);
const gatewayHelpers = require(path.join(root, "android/app/src/main/nodeGateway/main.cjs"));

const results = {};
function check(name, passed, detail = undefined) {
  results[name] = { passed: !!passed, ...(detail === undefined ? {} : { detail }) };
  if (!passed) throw new Error(`${name}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
}

function providerFromPath(pathAndQuery) {
  const url = new URL(String(pathAndQuery || ""), "https://fe-monster.local/");
  return url.pathname.match(/^\/api\/(netease|qq|kugou|qishui)(?:\/|$)/)?.[1]
    || url.searchParams.get("provider")
    || "netease";
}

function makeFixture() {
  const bridgeCalls = [];
  const storage = new Map();
  const storageWrites = [];
  const domWrites = [];
  const listeners = new Map();
  let gatewayOnline = true;
  let sandbox;

  class FakeElement {
    constructor(id = "") {
      this.id = id;
      this.dataset = {};
      this.attributes = new Map();
      this._textContent = "";
      this._innerHTML = "";
    }

    set textContent(value) {
      this._textContent = String(value ?? "");
      domWrites.push(this._textContent);
    }

    get textContent() { return this._textContent; }

    set innerHTML(value) {
      this._innerHTML = String(value ?? "");
      domWrites.push(this._innerHTML);
    }

    get innerHTML() { return this._innerHTML; }

    setAttribute(name, value) {
      this.attributes.set(String(name), String(value));
      domWrites.push(String(value));
    }

    getAttribute(name) { return this.attributes.get(String(name)) ?? null; }
    closest() { return null; }
  }

  const documentElement = new FakeElement("documentElement");
  const document = {
    documentElement,
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    getElementById() { return null; },
    querySelector() { return null; },
    createElement() { return new FakeElement(); }
  };

  const localStorage = {
    getItem(key) { return storage.get(String(key)) ?? null; },
    setItem(key, value) {
      storage.set(String(key), String(value));
      storageWrites.push({ key: String(key), value: String(value) });
    },
    removeItem(key) { storage.delete(String(key)); },
    clear() { storage.clear(); }
  };

  const accounts = Object.fromEntries(providers.map((provider) => [provider, {
    id: `${provider}-account`,
    nickname: `${provider}-user`
  }]));

  const bridge = {
    getPerformanceTier: () => "balanced",
    showMessage: () => {},
    requestMusicApi(requestId, method, pathAndQuery, bodyJson) {
      const call = {
        requestId: String(requestId),
        method: String(method || "GET").toUpperCase(),
        pathAndQuery: String(pathAndQuery || ""),
        bodyJson: String(bodyJson || "")
      };
      call.provider = providerFromPath(call.pathAndQuery);
      bridgeCalls.push(call);

      const url = new URL(call.pathAndQuery, "https://fe-monster.local/");
      const isLoginStatus = url.pathname.endsWith("/login/status") || url.pathname === "/api/login/status";
      const isPhoneVerify = url.pathname === "/api/qishui/login/phone/verify";
      const status = gatewayOnline ? 200 : 503;
      const payload = gatewayOnline
        ? {
            ok: true,
            provider: call.provider,
            loggedIn: isLoginStatus || isPhoneVerify,
            account: accounts[call.provider]
          }
        : {
            ok: false,
            provider: call.provider,
            code: "ANDROID_GATEWAY_STARTING",
            gatewayState: "starting",
            error: "On-device music gateway is starting"
          };
      const delay = call.provider === "netease" ? 12 : call.provider === "qq" ? 4 : 0;
      setTimeout(() => {
        sandbox.window.feMonsterAndroidMusicResult(call.requestId, status, JSON.stringify(payload));
      }, delay);
    }
  };

  const externalFetch = async () => {
    throw new Error("Android provider requests must not escape through window.fetch");
  };
  const windowListeners = new Map();
  const location = new URL("https://fe-monster.local/");
  sandbox = {
    AbortController,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
    Element: FakeElement,
    Event: class Event {},
    Headers,
    MutationObserver: class MutationObserver { observe() {} disconnect() {} },
    Request,
    Response,
    URL,
    clearInterval,
    clearTimeout,
    console,
    crypto,
    document,
    fetch: externalFetch,
    innerHeight: 844,
    innerWidth: 390,
    localStorage,
    location,
    navigator: { deviceMemory: 6, hardwareConcurrency: 8 },
    queueMicrotask,
    setInterval,
    setTimeout
  };
  sandbox.window = sandbox;
  sandbox.FeMonsterAndroid = bridge;
  sandbox.addEventListener = (type, handler) => {
    const handlers = windowListeners.get(type) || [];
    handlers.push(handler);
    windowListeners.set(type, handlers);
  };
  sandbox.dispatchEvent = () => true;
  sandbox.showToast = () => {};

  return {
    sandbox,
    bridgeCalls,
    storageWrites,
    domWrites,
    setGatewayOnline(value) { gatewayOnline = !!value; }
  };
}

async function responseJson(response) {
  const resolved = await response;
  const payload = await resolved.json();
  return { response: resolved, payload };
}

async function main() {
  check("runtimeDeclaresFourProviders", providers.every((provider) => runtimeSource.includes(provider)));
  check("runtimeDefinesNativeGatewayContract",
    runtimeSource.includes("requestNativeMusicApi")
      && runtimeSource.includes("requestMusicApi")
      && runtimeSource.includes("feMonsterAndroidMusicResult"));
  check("runtimeHasNoDesktopGateway",
    !/(?:frp-boy\.com|sakurafrp|DEFAULT_SERVER_URL|PUBLIC_ACCESS_KEY|FE_MONSTER_ANDROID_SERVER_URL)/i.test(runtimeSource));
  const expiredQq = gatewayHelpers.normalizeQqQrCheck({
    status: 200,
    body: { status: 200, isOk: false, refresh: true, message: "\u4e8c\u7ef4\u7801\u5df2\u5931\u6548" }
  }, "qq|expired|fixture");
  check("qqExpiredQrStopsPolling", expiredQq.body?.code === 800);

  const fixture = makeFixture();
  vm.runInNewContext(runtimeSource, fixture.sandbox, { filename: runtimePath });
  check("nativeResultCallbackInstalled", typeof fixture.sandbox.feMonsterAndroidMusicResult === "function");
  check("localRuntimeInstalled", typeof fixture.sandbox.feMonsterAndroidLocalRuntime?.fetch === "function");

  fixture.setGatewayOnline(false);
  const startupProviders = await responseJson(fixture.sandbox.fetch("/api/music-apis"));
  const startupProviderList = Array.isArray(startupProviders.payload?.providers)
    ? startupProviders.payload.providers
    : [];
  check("gatewayStartupStillExposesAndroidProviders",
    startupProviders.response.status === 200
      && providers.every((provider) => startupProviderList.some((item) => item?.id === provider && item?.configured === true))
      && !JSON.stringify(startupProviders.payload).includes("127.0.0.1:3010"),
    {
      status: startupProviders.response.status,
      payload: startupProviders.payload
    });
  fixture.setGatewayOnline(true);

  const concurrentStatuses = await Promise.all(providers.map((provider) => responseJson(
    fixture.sandbox.fetch(`/api/${provider}/login/status`)
  )));
  const routedProviders = fixture.bridgeCalls.slice(0, providers.length).map((call) => call.provider);
  check("fourProvidersUseNativeGateway",
    providers.every((provider) => routedProviders.includes(provider)),
    { routedProviders });
  check("concurrentNativeRequestsUseUniqueIds",
    new Set(fixture.bridgeCalls.slice(0, providers.length).map((call) => call.requestId)).size === providers.length);
  check("concurrentProviderCallbacksDoNotCross",
    concurrentStatuses.every(({ payload }, index) => payload.provider === providers[index]
      && payload.account?.id === `${providers[index]}-account`),
    concurrentStatuses.map(({ payload }) => ({ provider: payload.provider, account: payload.account?.id })));

  const qrLoginPaths = ["netease", "qq", "kugou"].flatMap((provider) => [
    `/api/${provider}/login/qr/key`,
    `/api/${provider}/login/qr/create?key=${provider}-qr-key&qrimg=true`,
    `/api/${provider}/login/qr/check?key=${provider}-qr-key`
  ]);
  await Promise.all(qrLoginPaths.map((route) => responseJson(fixture.sandbox.fetch(route))));
  check("qrLoginFlowsRouteToNative",
    qrLoginPaths.every((route) => fixture.bridgeCalls.some((call) => call.pathAndQuery === route)),
    fixture.bridgeCalls.filter((call) => call.pathAndQuery.includes("/login/qr/")).map((call) => call.pathAndQuery));

  const qqStatus = await responseJson(fixture.sandbox.fetch("/api/login/status?provider=qq"));
  const neteaseAgain = await responseJson(fixture.sandbox.fetch("/api/login/status?provider=netease"));
  check("genericProviderSwitchStaysIsolated",
    qqStatus.payload.account?.id === "qq-account"
      && neteaseAgain.payload.account?.id === "netease-account"
      && qqStatus.payload.account?.id !== neteaseAgain.payload.account?.id);

  const credentialSentinels = {
    phone: "13900001234",
    code: "654321",
    token: "TOKEN-MUST-NOT-PERSIST",
    cookie: "COOKIE-MUST-NOT-PERSIST"
  };
  const verifyResult = await responseJson(fixture.sandbox.fetch("/api/qishui/login/phone/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentialSentinels)
  }));
  const verifyCall = fixture.bridgeCalls.find((call) => call.pathAndQuery.includes("/api/qishui/login/phone/verify"));
  check("qishuiPhoneLoginRoutesToNative",
    verifyResult.payload.provider === "qishui"
      && verifyCall?.method === "POST"
      && JSON.parse(verifyCall.bodyJson).code === credentialSentinels.code);

  const nativeCallsBeforeLocalWork = fixture.bridgeCalls.length;
  const queued = await responseJson(fixture.sandbox.fetch("/api/player/queue", {
    method: "POST",
    body: JSON.stringify({ songs: [{ id: "local-track", title: "Local track" }] })
  }));
  const volume = await responseJson(fixture.sandbox.fetch("/api/player/volume?value=0.37", { method: "POST" }));
  const presets = await responseJson(fixture.sandbox.fetch("/api/sandbox/presets", {
    method: "POST",
    body: JSON.stringify({ preset: { id: "offline-preset", name: "Offline preset" } })
  }));
  check("localFeaturesBypassProviderGateway",
    fixture.bridgeCalls.length === nativeCallsBeforeLocalWork
      && queued.payload.queue?.[0]?.id === "local-track"
      && Math.abs(volume.payload.volume - 0.37) < 0.001
      && presets.payload.presets?.[0]?.id === "offline-preset");

  fixture.setGatewayOnline(false);
  const offlineProvider = await responseJson(fixture.sandbox.fetch("/api/kugou/login/status"));
  const callsAfterOfflineProvider = fixture.bridgeCalls.length;
  const offlinePlayer = await responseJson(fixture.sandbox.fetch("/api/player/state"));
  check("providerOutageDoesNotBreakLocalRuntime",
    offlineProvider.response.status === 503
      && /\u672c\u673a\u97f3\u4e50\u767b\u5f55\u670d\u52a1\u6b63\u5728\u542f\u52a8/.test(offlineProvider.payload.error || "")
      && !/127\.0\.0\.1|run\.cmd|\u5bfc\u5165\s*API/i.test(JSON.stringify(offlineProvider.payload))
      && offlinePlayer.response.status === 200
      && offlinePlayer.payload.queue?.[0]?.id === "local-track"
      && fixture.bridgeCalls.length === callsAfterOfflineProvider);

  const persisted = JSON.stringify(fixture.storageWrites);
  const rendered = fixture.domWrites.join("\n");
  const secrets = Object.values(credentialSentinels);
  check("credentialsDoNotReachLocalStorage", secrets.every((secret) => !persisted.includes(secret)));
  check("credentialsDoNotReachDom", secrets.every((secret) => !rendered.includes(secret)));
  check("onlyLocalRuntimeStateIsPersisted",
    fixture.storageWrites.every(({ key }) => key === "fe-monster.android.local-runtime/v1"),
    fixture.storageWrites.map(({ key }) => key));

  console.log(JSON.stringify({ ok: true, checks: results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    checks: results,
    error: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exitCode = 1;
});
