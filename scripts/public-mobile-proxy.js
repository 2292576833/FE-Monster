"use strict";

const crypto = require("crypto");
const http = require("http");
const net = require("net");

const listenHost = process.env.FE_MONSTER_PUBLIC_PROXY_HOST || "127.0.0.1";
const listenPort = Number(process.env.FE_MONSTER_PUBLIC_PROXY_PORT || 3099);
const upstreamHost = process.env.FE_MONSTER_PUBLIC_UPSTREAM_HOST || "127.0.0.1";
const upstreamPort = Number(process.env.FE_MONSTER_PUBLIC_UPSTREAM_PORT || 3000);
const communityUpstreamHost = process.env.FE_MONSTER_PUBLIC_COMMUNITY_HOST || "127.0.0.1";
const communityUpstreamPort = Number(process.env.FE_MONSTER_PUBLIC_COMMUNITY_PORT || 3020);
const communityPrefix = "/community";
const communityHealthPath = communityPrefix + "/health";
const publicCommunityGateway = "fe-monster-public-community-gateway";
const maxCommunityHealthBytes = 64 * 1024;
const accessKey = String(process.env.FE_MONSTER_PUBLIC_ACCESS_KEY || "").trim();
const defaultDownloadUrl = "https://2292576833.github.io/FE-Monster/";
const downloadUrl = String(process.env.FE_MONSTER_PUBLIC_DOWNLOAD_URL || defaultDownloadUrl).trim();
const cookieName = "fe_public_access";

function sameSecret(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cookieValue(header, name) {
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch (_) {
      return "";
    }
  }
  return "";
}

function authorized(request) {
  if (accessKey.length < 32) return false;
  const headerKey = request.headers["x-fe-public-access"];
  const cookieKey = cookieValue(request.headers.cookie, cookieName);
  return sameSecret(headerKey, accessKey) || sameSecret(cookieKey, accessKey);
}

function sanitizedCookie(header) {
  return String(header || "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !part.startsWith(cookieName + "="))
    .join("; ");
}

function normalizedIpAddress(value) {
  let address = String(value || "").trim();
  if (address.toLowerCase().startsWith("::ffff:")) address = address.slice(7);
  const zoneSeparator = address.indexOf("%");
  if (zoneSeparator >= 0) address = address.slice(0, zoneSeparator);
  return net.isIP(address) ? address : "";
}

function loopbackAddress(value) {
  const address = normalizedIpAddress(value);
  return address === "::1" || address.startsWith("127.");
}

function directClientAddress(request) {
  const peerAddress = normalizedIpAddress(request.socket && request.socket.remoteAddress);
  if (!loopbackAddress(peerAddress)) return peerAddress;

  // SakuraFrp is the only expected loopback peer and appends the address it
  // observed to X-Forwarded-For. Select only that final hop, never a
  // caller-controlled prefix, then collapse the chain to one canonical IP.
  const forwardedChain = String(request.headers["x-forwarded-for"] || "").split(",");
  const tunnelAddress = normalizedIpAddress(forwardedChain[forwardedChain.length - 1]);
  return tunnelAddress || peerAddress;
}

function sendJson(response, statusCode, value) {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function redirectToDownload(response) {
  response.writeHead(302, {
    Location: downloadUrl,
    "Cache-Control": "no-store",
    "Content-Length": "0"
  });
  response.end();
}

function publicCommunityHealth(value) {
  const payload = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const protocolVersion = typeof payload.protocolVersion === "number" ||
    typeof payload.protocolVersion === "string"
    ? payload.protocolVersion
    : null;
  const capabilities = payload.capabilities &&
    typeof payload.capabilities === "object" &&
    !Array.isArray(payload.capabilities)
    ? payload.capabilities
    : {};
  return {
    ok: payload.ok === true,
    service: typeof payload.service === "string" && payload.service.trim()
      ? payload.service.trim()
      : "fe-monster-community",
    protocolVersion,
    capabilities,
    gateway: publicCommunityGateway
  };
}

function relayPublicCommunityHealth(upstreamResponse, response) {
  const chunks = [];
  let size = 0;
  let settled = false;

  const fail = () => {
    if (settled) return;
    settled = true;
    sendJson(response, 502, publicCommunityHealth({ ok: false }));
  };

  upstreamResponse.on("data", (chunk) => {
    if (settled) return;
    size += chunk.length;
    if (size > maxCommunityHealthBytes) {
      upstreamResponse.destroy();
      fail();
      return;
    }
    chunks.push(chunk);
  });
  upstreamResponse.on("end", () => {
    if (settled) return;
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (_) {
      fail();
      return;
    }
    settled = true;
    sendJson(response, upstreamResponse.statusCode || 502, publicCommunityHealth(payload));
  });
  upstreamResponse.on("error", fail);
}

const server = http.createServer((request, response) => {
  let pathname = "/";
  try {
    pathname = new URL(request.url || "/", "http://localhost").pathname;
  } catch (_) {
    sendJson(response, 400, { ok: false, error: "invalid request URL" });
    return;
  }

  if (pathname === "/health") {
    sendJson(response, 200, { ok: true, service: "fe-monster-public-mobile-proxy", upstreamPort });
    return;
  }

  if ((pathname === "/" || pathname === "/download") && (request.method === "GET" || request.method === "HEAD")) {
    redirectToDownload(response);
    return;
  }

  const communityRequest = pathname === communityHealthPath ||
    pathname.startsWith(communityPrefix + "/api/");
  if (communityRequest && (
    pathname === communityPrefix + "/api/admin" ||
    pathname.startsWith(communityPrefix + "/api/admin/")
  )) {
    sendJson(response, 404, { ok: false, error: "not found" });
    return;
  }

  if (!communityRequest && pathname.startsWith("/api/") && request.method !== "OPTIONS" && !authorized(request)) {
    sendJson(response, 401, { ok: false, error: "FE Monster Android access credential is required" });
    return;
  }

  const selectedHost = communityRequest ? communityUpstreamHost : upstreamHost;
  const selectedPort = communityRequest ? communityUpstreamPort : upstreamPort;
  const originalHost = String(request.headers.host || "").trim();
  const headers = {
    ...request.headers,
    host: communityRequest && originalHost ? originalHost : `${selectedHost}:${selectedPort}`
  };
  if (communityRequest) {
    headers["x-forwarded-host"] = originalHost;
    headers["x-forwarded-proto"] = "https";
    // This process is the public trust boundary. Never pass caller-controlled
    // forwarding identity to the community server, where it drives abuse and
    // device-enrollment limits.
    delete headers.forwarded;
    delete headers["x-real-ip"];
    const clientAddress = directClientAddress(request);
    if (clientAddress) headers["x-forwarded-for"] = clientAddress;
    else delete headers["x-forwarded-for"];
  }
  delete headers["x-fe-public-access"];
  const cookie = sanitizedCookie(headers.cookie);
  if (cookie) headers.cookie = cookie;
  else delete headers.cookie;

  const upstream = http.request({
    host: selectedHost,
    port: selectedPort,
    method: request.method,
    path: communityRequest ? request.url.slice(communityPrefix.length) || "/" : request.url,
    headers
  }, (upstreamResponse) => {
    if (pathname === communityHealthPath) {
      relayPublicCommunityHealth(upstreamResponse, response);
      return;
    }
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });

  upstream.on("error", (error) => {
    if (!response.headersSent) {
      sendJson(response, 502, { ok: false, error: `FE Monster gateway unavailable: ${error.message}` });
    } else {
      response.destroy(error);
    }
  });
  request.pipe(upstream);
});

server.on("clientError", (_, socket) => socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
server.listen(listenPort, listenHost, () => {
  console.log(
    `[public-mobile] listening on http://${listenHost}:${listenPort} -> ` +
    `web http://${upstreamHost}:${upstreamPort}, community ${communityPrefix} -> ` +
    `http://${communityUpstreamHost}:${communityUpstreamPort}`
  );
});
