#!/usr/bin/env node

const clientBaseUrl = process.env.FE_CLIENT_URL || "http://127.0.0.1:3000";
const communityBaseUrl = process.env.FE_COMMUNITY_SERVER_URL || "http://127.0.0.1:3020";
const provider = process.env.FE_COMMUNITY_PROVIDER || "netease";
const providerRecoveryDeadlineMs = Math.max(
  1_000,
  Math.min(30_000, Number(process.env.FE_PROVIDER_RECOVERY_TIMEOUT_MS) || 12_000),
);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchWithDeadline(url, timeoutMs = 2_000, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      cache: "no-store",
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function probe(url, options = {}) {
  try {
    const response = await fetchWithDeadline(url, options.timeoutMs, options.request);
    let payload = null;
    if (options.json !== false) {
      try {
        payload = await response.json();
      } catch {
        // The structured result records the malformed response status below.
      }
    }
    return { reached: true, ok: response.ok, status: response.status, payload, error: "" };
  } catch (error) {
    return {
      reached: false,
      ok: false,
      status: 0,
      payload: null,
      error: error?.message || String(error),
    };
  }
}

function providerUnavailable(error = "") {
  return /\b(?:unavailable|closedchannel(?:exception)?|connection refused|econnrefused)\b/i.test(error);
}

async function activateInteractiveServices() {
  return probe(`${clientBaseUrl}/api/app/interactive/activate`, {
    request: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider }),
    },
  });
}

async function waitForProviderRecovery() {
  const startedAt = performance.now();
  let attempts = 0;
  let login = null;
  let lifecycle = null;
  while (performance.now() - startedAt < providerRecoveryDeadlineMs) {
    attempts += 1;
    [login, lifecycle] = await Promise.all([
      probe(`${clientBaseUrl}/api/login/status?provider=${encodeURIComponent(provider)}`),
      probe(`${clientBaseUrl}/api/music-apis/status?provider=${encodeURIComponent(provider)}`),
    ]);
    const loginError = String(login.payload?.error || login.error || "");
    const lifecycleReachable = lifecycle.ok && lifecycle.payload?.reachable === true;
    const loginGatewayReached = login.ok && !providerUnavailable(loginError);
    if (lifecycleReachable || loginGatewayReached) break;
    await sleep(Math.min(750, 180 + attempts * 70));
  }
  return {
    attempts,
    elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
    login,
    lifecycle,
  };
}

function classifyFailure(checks) {
  if (!checks.clientPageReachable || !checks.interactiveActivationAccepted) return "client-runtime";
  if (!checks.communityServerHealthy || !checks.clientCommunityRouteOnline) return "community-transport";
  if (!checks.communityProtocolV2 || !checks.avatarOrnamentCapability) return "community-protocol";
  if (!checks.providerGatewayReachable || !checks.providerAuthenticated || !checks.communityIdentityHydrated) {
    return "provider-identity";
  }
  if (!checks.identityRegistered) return "community-registration";
  return "none";
}

const startedAt = performance.now();
const [clientPage, initialCommunityHealth] = await Promise.all([
  probe(`${clientBaseUrl}/`, { json: false }),
  probe(`${communityBaseUrl}/health`),
]);

const activation = clientPage.ok
  ? await activateInteractiveServices()
  : { reached: false, ok: false, status: 0, payload: null, error: "client is unreachable" };
const recovery = activation.ok
  ? await waitForProviderRecovery()
  : { attempts: 0, elapsedMs: 0, login: null, lifecycle: null };

const communityStateProbe = clientPage.ok
  ? await probe(`${clientBaseUrl}/api/community/state?provider=${encodeURIComponent(provider)}`)
  : { reached: false, ok: false, status: 0, payload: null, error: "client is unreachable" };
// Read health after the state route has had a chance to register the active
// client. Running these probes concurrently can report a false registration
// failure when the health request wins the race.
const finalCommunityHealth = clientPage.ok
  ? await probe(`${communityBaseUrl}/health`)
  : initialCommunityHealth;

const communityHealth = finalCommunityHealth.payload || initialCommunityHealth.payload;
const communityState = communityStateProbe.payload;
const loginStatus = recovery.login?.payload;
const providerLifecycle = recovery.lifecycle?.payload;
const providerError = String(loginStatus?.error || recovery.login?.error || "");
const providerGatewayReachable = Boolean(
  providerLifecycle?.reachable === true
  || (recovery.login?.ok && !providerUnavailable(providerError)),
);

const checks = {
  clientPageReachable: clientPage.ok,
  interactiveActivationAccepted: activation.ok && activation.payload?.active === true,
  communityServerHealthy: finalCommunityHealth.ok && communityHealth?.ok === true,
  communityProtocolV2: Number(communityHealth?.protocolVersion || 0) >= 2,
  avatarOrnamentCapability: communityHealth?.capabilities?.avatarOrnament === true,
  clientCommunityRouteOnline:
    communityStateProbe.ok && communityState?.serverOnline === true,
  providerGatewayReachable,
  providerAuthenticated: loginStatus?.loggedIn === true,
  communityIdentityHydrated:
    communityState?.loggedIn === true && Boolean(communityState?.profile?.feId),
  identityRegistered: Boolean(communityState?.profile?.feId),
  realtimeStreamConnected:
    Number(communityHealth?.status?.realtimeClients?.length || 0) > 0,
};
const failureDomain = classifyFailure(checks);

const result = {
  pass: failureDomain === "none",
  failureDomain,
  elapsedMs: Math.round((performance.now() - startedAt) * 10) / 10,
  clientBaseUrl,
  communityBaseUrl,
  provider,
  checks,
  activation: {
    ok: activation.ok,
    active: activation.payload?.active ?? null,
    firstActivation: activation.payload?.firstActivation ?? null,
    error: activation.error,
  },
  providerRecovery: {
    deadlineMs: providerRecoveryDeadlineMs,
    attempts: recovery.attempts,
    elapsedMs: recovery.elapsedMs,
    lifecycleStatus: providerLifecycle?.status ?? null,
    lifecycleReachable: providerLifecycle?.reachable ?? null,
  },
  clientCommunityState: {
    ok: communityState?.ok ?? null,
    serverOnline: communityState?.serverOnline ?? null,
    loggedIn: communityState?.loggedIn ?? null,
    hasFeId: Boolean(communityState?.profile?.feId),
    friendCount: Array.isArray(communityState?.friends) ? communityState.friends.length : null,
    error: String(communityState?.error || communityStateProbe.error || ""),
  },
  providerStatus: {
    ok: loginStatus?.ok ?? null,
    loggedIn: loginStatus?.loggedIn ?? null,
    error: providerError,
  },
  serverStatus: communityHealth?.status ?? null,
  serverProtocol: {
    version: communityHealth?.protocolVersion ?? null,
    capabilities: communityHealth?.capabilities ?? null,
  },
};

console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
