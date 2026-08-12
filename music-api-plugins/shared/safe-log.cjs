"use strict";

const INSTALL_MARK = Symbol.for("fe-monster.safe-log-installed");
const SENSITIVE_NAME = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api[-_]?key",
  "access[-_]?token",
  "refresh[-_]?token",
  "id[-_]?token",
  "client[-_]?secret",
  "secret",
  "token"
].join("|");

const URL_VALUE = new RegExp(`([?&](?:${SENSITIVE_NAME})=)[^&#\\s]*`, "gi");
const LABELED_VALUE = new RegExp(
  `((?:["']?(?:${SENSITIVE_NAME})["']?)\\s*[:=]\\s*)(["']?)(?:Bearer\\s+)?(\\[REDACTED\\]|[^\\s,;}&\\]"']+)\\2`,
  "gi"
);

function redactSensitiveText(value) {
  return String(value == null ? "" : value)
    .replace(URL_VALUE, "$1[REDACTED]")
    .replace(LABELED_VALUE, (_match, label, quote) => `${label}${quote}[REDACTED]${quote}`);
}

function patchStream(stream) {
  if (!stream || stream[INSTALL_MARK] || typeof stream.write !== "function") return;
  const originalWrite = stream.write.bind(stream);
  Object.defineProperty(stream, INSTALL_MARK, { value: true });
  stream.write = function safeWrite(chunk, encoding, callback) {
    const text = Buffer.isBuffer(chunk) || chunk instanceof Uint8Array
      ? Buffer.from(chunk).toString("utf8")
      : String(chunk);
    return originalWrite(redactSensitiveText(text), encoding, callback);
  };
}

function installSafeLogging() {
  patchStream(process.stdout);
  patchStream(process.stderr);
}

module.exports = {
  installSafeLogging,
  redactSensitiveText
};
