"use strict";

const crypto = require("crypto");
const http = require("http");

const listenHost = process.env.FE_MONSTER_PUBLIC_PROXY_HOST || "127.0.0.1";
const listenPort = Number(process.env.FE_MONSTER_PUBLIC_PROXY_PORT || 3099);
const upstreamHost = process.env.FE_MONSTER_PUBLIC_UPSTREAM_HOST || "127.0.0.1";
const upstreamPort = Number(process.env.FE_MONSTER_PUBLIC_UPSTREAM_PORT || 3000);
const accessKey = String(process.env.FE_MONSTER_PUBLIC_ACCESS_KEY || "").trim();
const cookieName = "fe_public_access";

if (accessKey.length < 32) {
  throw new Error("FE_MONSTER_PUBLIC_ACCESS_KEY must contain at least 32 characters");
}

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

function sendJson(response, statusCode, value) {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store"
  });
  response.end(body);
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

  if (pathname.startsWith("/api/") && request.method !== "OPTIONS" && !authorized(request)) {
    sendJson(response, 401, { ok: false, error: "FE Monster Android access credential is required" });
    return;
  }

  const headers = { ...request.headers, host: `${upstreamHost}:${upstreamPort}` };
  delete headers["x-fe-public-access"];
  const cookie = sanitizedCookie(headers.cookie);
  if (cookie) headers.cookie = cookie;
  else delete headers.cookie;

  const upstream = http.request({
    host: upstreamHost,
    port: upstreamPort,
    method: request.method,
    path: request.url,
    headers
  }, (upstreamResponse) => {
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
  console.log(`[public-mobile] listening on http://${listenHost}:${listenPort} -> http://${upstreamHost}:${upstreamPort}`);
});
