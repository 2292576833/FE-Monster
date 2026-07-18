import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adapterFile = path.join(root, "data", "music-api", "packages", "qishui-1784315285676", "server.cjs");
const classes = path.join(root, "out", "classes");
const mockState = { sendCalls: 0, verifyCalls: 0, verifyCookie: "", sendRequests: [] };

function passportMix(value) {
  return [...Buffer.from(String(value), "utf8")]
    .map((byte) => (byte ^ 5).toString(16))
    .join("");
}

function passportUnmix(value) {
  const bytes = String(value).match(/[0-9a-f]{2}/gi) || [];
  return Buffer.from(bytes.map((pair) => Number.parseInt(pair, 16) ^ 5)).toString("utf8");
}

const mock = http.createServer(async (request, response) => {
  const body = await readBody(request);
  const form = new URLSearchParams(body);
  const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
  response.setHeader("Content-Type", "application/json");
  if (requestUrl.pathname === "/passport/web/send_code/") {
    mockState.sendCalls += 1;
    mockState.sendRequests.push({
      method: request.method,
      query: Object.fromEntries(requestUrl.searchParams),
      origin: request.headers.origin || "",
      referer: request.headers.referer || "",
      form: Object.fromEntries(form),
    });
    assert.equal(request.method, "POST");
    assert.equal(requestUrl.searchParams.get("request_host"), "app%3A%2F%2Fresources");
    assert.equal(requestUrl.searchParams.get("version_code"), "3.5.1");
    assert.equal(requestUrl.searchParams.get("aid"), "386088");
    assert.match(requestUrl.searchParams.get("device_id") || "", /^\d{19}$/);
    assert.match(requestUrl.searchParams.get("install_id") || "", /^\d{19}$/);
    assert.equal(requestUrl.searchParams.get("did"), requestUrl.searchParams.get("device_id"));
    assert.equal(requestUrl.searchParams.get("iid"), requestUrl.searchParams.get("install_id"));
    assert.match(requestUrl.searchParams.get("biz_trace_id") || "", /^[0-9a-f]{8}$/);
    assert.equal(request.headers["x-tt-passport-trace-id"], requestUrl.searchParams.get("biz_trace_id"));
    assert.equal(request.headers["x-ss-stub"], crypto.createHash("md5").update(body).digest("hex").toUpperCase());
    assert.equal(request.headers.origin, undefined);
    assert.equal(request.headers.referer, undefined);
    assert.equal(form.get("type"), passportMix("24"));
    assert.equal(form.get("fixed_mix_mode"), "1");
    assert.equal(form.has("aid"), false);
    assert.match(form.get("mobile") || "", /^[0-9a-f]+$/);
    const decodedMobile = passportUnmix(form.get("mobile") || "");
    assert.match(decodedMobile, /^\+86 1[3-9]\d{9}$/);
    if (decodedMobile.endsWith("003")) {
      response.end(JSON.stringify({ message: "error", data: { error_code: 1105, captcha: "required", description: "captcha required" } }));
      return;
    }
    if (decodedMobile.endsWith("004")) {
      response.statusCode = 403;
      response.end(JSON.stringify({ message: "success", data: { retry_time: 60 } }));
      return;
    }
    if (decodedMobile.endsWith("005")) {
      response.end(JSON.stringify({
        message: "error",
        data: { error_code: 7, retry_time: 60, description: "request too frequent" },
      }));
      return;
    }
    response.setHeader("Set-Cookie", ["passport_csrf_token=mock-csrf; Path=/; Secure"]);
    response.end(JSON.stringify({ message: "success", data: { retry_time: 60 } }));
    return;
  }
  if (requestUrl.pathname === "/passport/web/sms_login/") {
    mockState.verifyCalls += 1;
    mockState.verifyCookie = request.headers.cookie || "";
    assert.equal(form.get("fixed_mix_mode"), "1");
    assert.equal(form.has("type"), false);
    assert.equal(form.has("aid"), false);
    assert.match(passportUnmix(form.get("mobile") || ""), /^\+86 1[3-9]\d{9}$/);
    assert.equal(passportUnmix(form.get("code") || ""), "123456");
    assert.equal(form.get("service"), "https://api.qishui.com");
    assert.match(mockState.verifyCookie, /passport_csrf_token=mock-csrf/);
    assert.equal(request.headers["x-tt-passport-csrf-token"], "mock-csrf");
    assert.equal(request.headers["x-tt-passport-trace-id"], requestUrl.searchParams.get("biz_trace_id"));
    assert.match(request.headers["x-tt-passport-verify-portrait"] || "", /^[0-9a-f-]{36}\.login$/);
    assert.equal(request.headers["x-ss-stub"], crypto.createHash("md5").update(body).digest("hex").toUpperCase());
    assert.equal(request.headers["x-csrftoken"], undefined);
    assert.equal(request.headers.origin, undefined);
    assert.equal(request.headers.referer, undefined);
    response.setHeader("Set-Cookie", [
      "sessionid=mock-session; Path=/; HttpOnly; Secure",
      "uid_tt=mock-user; Path=/; HttpOnly; Secure",
    ]);
    response.end(JSON.stringify({ message: "success", data: { user_id: "mock-user", nickname: "Mock Soda" } }));
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ message: "error", data: { error_code: 404 } }));
});

let adapter;
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "fe-qishui-phone-"));
try {
  const mockPort = await listen(mock);
  const adapterPort = await freePort();
  adapter = spawn(process.execPath, [adapterFile], {
    cwd: path.dirname(adapterFile),
    env: {
      ...process.env,
      PORT: String(adapterPort),
      QISHUI_PASSPORT_ORIGIN: `http://127.0.0.1:${mockPort}`,
      QISHUI_DEVICE_STATE_FILE: path.join(temporary, "qishui-device.json"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitFor(`http://127.0.0.1:${adapterPort}/health`);
  const health = await jsonRequest(`http://127.0.0.1:${adapterPort}/health`);
  assert.equal(health.body.adapterVersion, "1.1.0");

  const invalidPhone = await jsonRequest(`http://127.0.0.1:${adapterPort}/login/phone/send`, {
    method: "POST",
    body: { phone: "1380013800x" },
  });
  assert.equal(invalidPhone.status, 400);
  assert.equal(invalidPhone.body.code, "INVALID_PHONE");
  assert.equal(mockState.sendCalls, 0);

  const jar = new Map();
  const sent = await jsonRequest(`http://127.0.0.1:${adapterPort}/login/phone/send`, {
    method: "POST",
    body: { phone: "13800000001" },
    jar,
  });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.ok, true);
  assert.equal(sent.body.cooldownSeconds, 60);
  assert.match(sent.body.requestId, /^[a-f0-9]{16}$/);
  assert.equal(mockState.sendCalls, 1);

  const acceptedDiagnostic = await jsonRequest(`http://127.0.0.1:${adapterPort}/diagnostics/phone-send`);
  assert.equal(acceptedDiagnostic.status, 200);
  assert.equal(acceptedDiagnostic.body.outcome, "accepted-unconfirmed");
  assert.equal(acceptedDiagnostic.body.requestId, sent.body.requestId);
  assert.equal(acceptedDiagnostic.body.upstreamHttpStatus, 200);
  assert.equal(JSON.stringify(acceptedDiagnostic.body).includes("13800000001"), false);
  assert.equal(JSON.stringify(acceptedDiagnostic.body).includes("123456"), false);

  const cooldown = await jsonRequest(`http://127.0.0.1:${adapterPort}/login/phone/send`, {
    method: "POST",
    body: { phone: "13800000001" },
    jar,
  });
  assert.equal(cooldown.status, 429);
  assert.equal(cooldown.body.code, "SEND_COOLDOWN");
  assert.equal(mockState.sendCalls, 1);

  const invalidCode = await jsonRequest(`http://127.0.0.1:${adapterPort}/login/phone/verify`, {
    method: "POST",
    body: { phone: "13800000001", code: "12345x" },
    jar,
  });
  assert.equal(invalidCode.status, 400);
  assert.equal(invalidCode.body.code, "INVALID_CODE");
  assert.equal(mockState.verifyCalls, 0);

  const verified = await jsonRequest(`http://127.0.0.1:${adapterPort}/login/phone/verify`, {
    method: "POST",
    body: { phone: "13800000001", code: "123456" },
    jar,
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.loggedIn, true);
  assert.equal(mockState.verifyCalls, 1);

  const status = await jsonRequest(`http://127.0.0.1:${adapterPort}/login/status`, { jar });
  assert.equal(status.status, 200);
  assert.equal(status.body.loggedIn, true);

  const captcha = await jsonRequest(`http://127.0.0.1:${adapterPort}/login/phone/send`, {
    method: "POST",
    body: { phone: "13700000003" },
  });
  assert.equal(captcha.status, 409);
  assert.equal(captcha.body.code, "CAPTCHA_REQUIRED");
  assert.equal(captcha.body.captchaRequired, true);

  const captchaRetry = await jsonRequest(`http://127.0.0.1:${adapterPort}/login/phone/send`, {
    method: "POST",
    body: { phone: "13700000003" },
  });
  assert.equal(captchaRetry.status, 409);
  assert.equal(captchaRetry.body.code, "CAPTCHA_REQUIRED");

  const upstreamHttpFailure = await jsonRequest(`http://127.0.0.1:${adapterPort}/login/phone/send`, {
    method: "POST",
    body: { phone: "13600000004" },
  });
  assert.equal(upstreamHttpFailure.status, 502);
  assert.equal(upstreamHttpFailure.body.code, "UPSTREAM_HTTP_ERROR");
  assert.notEqual(upstreamHttpFailure.body.sent, true);

  const rateLimitCallsBefore = mockState.sendCalls;
  const upstreamRateLimited = await jsonRequest(`http://127.0.0.1:${adapterPort}/login/phone/send`, {
    method: "POST",
    body: { phone: "13500000005" },
  });
  assert.equal(upstreamRateLimited.status, 429);
  assert.equal(upstreamRateLimited.body.code, "UPSTREAM_RATE_LIMITED");
  assert.equal(upstreamRateLimited.body.sent, false);
  assert.match(upstreamRateLimited.body.error, /本次未发送短信/);
  assert.equal(mockState.sendCalls, rateLimitCallsBefore + 1);

  const locallyRateLimited = await jsonRequest(`http://127.0.0.1:${adapterPort}/login/phone/send`, {
    method: "POST",
    body: { phone: "13500000005" },
  });
  assert.equal(locallyRateLimited.status, 429);
  assert.equal(locallyRateLimited.body.code, "SEND_COOLDOWN");
  assert.equal(mockState.sendCalls, rateLimitCallsBefore + 1);
  assert.equal(upstreamRateLimited.body.retryAfterSeconds, 60);
  assert.equal(upstreamRateLimited.body.cooldownSeconds, 60);
  assert.equal(locallyRateLimited.body.retryAfterSeconds, 60);

  const rateLimitDiagnostic = await jsonRequest(`http://127.0.0.1:${adapterPort}/diagnostics/phone-send`);
  assert.equal(rateLimitDiagnostic.status, 200);
  assert.equal(rateLimitDiagnostic.body.outcome, "local-cooldown");
  assert.equal(rateLimitDiagnostic.body.upstreamCode, 0);
  assert.equal(JSON.stringify(rateLimitDiagnostic.body).includes("13500000005"), false);

  await runJavaHarness(adapterPort, temporary);
  const persisted = fs.readFileSync(path.join(temporary, "qishui-auth.json"), "utf8");
  assert.match(persisted, /mock-session/);
  assert.doesNotMatch(persisted, /13900000002|123456/);

  const routes = fs.readFileSync(path.join(root, "src", "main", "java", "com", "femonster", "api", "ApiRoutes.java"), "utf8");
  assert.match(routes, /\/api\/qishui\/login\/phone\/send/);
  assert.match(routes, /\/api\/qishui\/login\/phone\/verify/);
  console.log("Qishui phone login mock check passed.");
} finally {
  if (adapter && !adapter.killed) adapter.kill();
  await close(mock);
  fs.rmSync(temporary, { recursive: true, force: true });
}

async function runJavaHarness(adapterPort, directory) {
  const source = `
import com.femonster.music.GenericMusicClient;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

public final class QishuiPhoneHarness {
  public static void main(String[] args) throws Exception {
    Path session = Path.of(args[1]);
    GenericMusicClient client = new GenericMusicClient("qishui", "Soda", args[0], session);
    Map<String, Object> sent = client.loginPhoneSendPayload("13900000002");
    if (!Boolean.TRUE.equals(sent.get("ok"))) throw new AssertionError("send failed: " + sent);
    Map<String, Object> verified = client.loginPhoneVerifyPayload("13900000002", "123456");
    if (!Boolean.TRUE.equals(verified.get("ok"))) throw new AssertionError("verify failed: " + verified);
    Map<String, Object> account = client.accountPayload();
    if (!Boolean.TRUE.equals(account.get("loggedIn"))) throw new AssertionError("session not recognized: " + account);
    String saved = Files.readString(session);
    if (!saved.contains("mock-session") || saved.contains("13900000002") || saved.contains("123456")) {
      throw new AssertionError("unsafe or missing session persistence");
    }
  }
}`;
  const javaFile = path.join(directory, "QishuiPhoneHarness.java");
  fs.writeFileSync(javaFile, source, "utf8");
  const javac = javaTool("javac");
  const java = javaTool("java");
  const compiled = spawnSync(javac, ["-encoding", "UTF-8", "--release", "17", "-cp", classes, "-d", directory, javaFile], {
    cwd: root,
    encoding: "utf8",
  });
  if (compiled.status !== 0) throw new Error(`Java harness compile failed:\n${compiled.stdout}\n${compiled.stderr}`);
  const session = path.join(directory, "qishui-auth.json");
  const run = spawn(java, ["-cp", `${classes}${path.delimiter}${directory}`, "QishuiPhoneHarness", `http://127.0.0.1:${adapterPort}`, session], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  run.stdout.on("data", (chunk) => stdout.push(chunk));
  run.stderr.on("data", (chunk) => stderr.push(chunk));
  const exitCode = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      run.kill();
      reject(new Error("Java harness timed out"));
    }, 20000);
    run.once("error", reject);
    run.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
  if (exitCode !== 0) {
    throw new Error(`Java harness failed:\n${Buffer.concat(stdout).toString("utf8")}\n${Buffer.concat(stderr).toString("utf8")}`);
  }
}

function javaTool(name) {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  const candidates = [
    path.join(root, "runtime", "java", "bin", executable),
    `E:\\java26\\bin\\${executable}`,
    `D:\\java26\\bin\\${executable}`,
    `C:\\java26\\bin\\${executable}`,
    process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, "bin", executable),
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || name;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve) => server.close(resolve));
}

function freePort() {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("adapter did not start");
}

async function jsonRequest(url, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.jar?.size) headers.Cookie = [...options.jar].map(([key, value]) => `${key}=${value}`).join("; ");
  const response = await fetch(url, {
    method: options.method || (options.body === undefined ? "GET" : "POST"),
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  for (const raw of setCookies) {
    const pair = raw.split(";", 1)[0];
    const index = pair.indexOf("=");
    if (options.jar && index > 0) options.jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  return { status: response.status, body: await response.json() };
}
