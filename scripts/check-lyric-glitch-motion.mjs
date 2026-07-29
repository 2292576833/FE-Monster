import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync
} from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const webRoot = path.join(root, "web");
const componentsRoot = path.join(root, "components");
const html = readFileSync(path.join(webRoot, "index.html"), "utf8").replace(/\r\n/g, "\n");
const app = readFileSync(path.join(webRoot, "app.js"), "utf8").replace(/\r\n/g, "\n");
const styles = readFileSync(path.join(webRoot, "styles.css"), "utf8").replace(/\r\n/g, "\n");

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const temporaryRoot = path.join(root, ".tmp");
const profile = path.join(temporaryRoot, `lyric-glitch-motion-${process.pid}`);
const runEdgeDomProbe = process.env.FE_EDGE_DOM_PROBE === "1";
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function balancedBlock(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return "";
  const start = source.indexOf("{", markerIndex + marker.length);
  if (start < 0) return "";
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return "";
}

function functionBlock(name) {
  const declaration = new RegExp(`function\\s+${escapeRegExp(name)}\\s*\\(`).exec(app);
  if (!declaration) return "";
  const openingParenthesis = app.indexOf("(", declaration.index);
  let depth = 0;
  let quote = "";
  let escaped = false;
  let closingParenthesis = -1;
  for (let index = openingParenthesis; index < app.length; index += 1) {
    const character = app[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth === 0) {
      closingParenthesis = index;
      break;
    }
  }
  if (closingParenthesis < 0) return "";
  return balancedBlock(app.slice(closingParenthesis + 1), "");
}

function elementOpeningTag(id) {
  return new RegExp(
    `<[a-z][^>]*\\bid=(["'])${escapeRegExp(id)}\\1[^>]*>`,
    "i"
  ).exec(html)?.[0] || "";
}

function elementById(source, id) {
  const opening = new RegExp(
    `<([a-z][\\w:-]*)\\b[^>]*\\bid=(["'])${escapeRegExp(id)}\\2[^>]*>`,
    "i"
  ).exec(source);
  if (!opening) return null;
  const tagName = opening[1];
  const start = opening.index;
  const openingEnd = start + opening[0].length;
  if (/\/\s*>$/.test(opening[0]) || /^(?:input|br|hr|img|meta|link)$/i.test(tagName)) {
    return { tagName, start, end: openingEnd, html: source.slice(start, openingEnd) };
  }
  const tags = new RegExp(`<\\/?${escapeRegExp(tagName)}\\b[^>]*>`, "gi");
  tags.lastIndex = start;
  let depth = 0;
  for (let match = tags.exec(source); match; match = tags.exec(source)) {
    const closing = /^<\//.test(match[0]);
    const selfClosing = /\/\s*>$/.test(match[0]);
    if (closing) depth -= 1;
    else if (!selfClosing) depth += 1;
    if (depth === 0) {
      const end = match.index + match[0].length;
      return { tagName, start, end, html: source.slice(start, end) };
    }
  }
  return null;
}

function attributeValue(tag, attribute) {
  return new RegExp(`\\b${escapeRegExp(attribute)}=(["'])([^"']+)\\1`, "i")
    .exec(tag)?.[2] || "";
}

const defaultSettings = balancedBlock(app, "const DEFAULT_TEXT_COMPOSER_SETTINGS");
const normalizeSettings = functionBlock("normalizeTextComposerSettings");
const syncControls = functionBlock("syncTextComposerControls");
const applySettings = functionBlock("applyTextComposerSettings");
const glitchActive = functionBlock("glitchTextEffectActive");
const syncGlitchElement = functionBlock("syncGlitchTextElement");
const beatMotion = functionBlock("updateGlitchBeatMotion");
const playbackMotion = functionBlock("updatePlaybackSceneMotion");
const subtitleLayout = functionBlock("syncPlaybackLyricSubtitleLayout");
const setPlaybackLine = functionBlock("setPlaybackLyricLine");
const playbackCardLyrics = functionBlock("updateQishuiPlaybackLyrics");
const startPlaybackCardLyricTransition = functionBlock("startQishuiLyricTransition");
const syncPlaybackCardLyricTransition = functionBlock("syncQishuiLyricTransition");
const flipMotion = functionBlock("animateLyricGeometryFlip");

const sensitivityInput = elementOpeningTag("textGlitchBeatSensitivity");
const durationInput = elementOpeningTag("textGlitchBeatDuration");
const sensitivityOutput = elementOpeningTag("textGlitchBeatSensitivityValue");
const durationOutput = elementOpeningTag("textGlitchBeatDurationValue");
const glitchControl = elementById(html, "textGlitchControl")?.html || "";
const textPresetCardTags = (html.match(/<[a-z][^>]*>/gi) || []).filter((tag) => (
  /\bdata-text-preset(?:\s*=|\s|>)/i.test(tag)
  && /\bclass=(["'])[^"']*\bdiy-preset-card\b[^"']*\1/i.test(tag)
));
const textPresetCardValues = textPresetCardTags
  .map((tag) => attributeValue(tag, "data-text-preset"))
  .sort();
const textPresetCardIds = textPresetCardTags
  .map((tag) => attributeValue(tag, "id"))
  .sort();

const expectedBeatSettings = ["glitchBeatSensitivity", "glitchBeatDuration"];
const staticChecks = {
  restoredTextPresetCardsAreLimited: textPresetCardTags.length === 2
    && textPresetCardValues.join("|") === "depth|focus-echo"
    && textPresetCardIds.join("|") === "diyFocusEchoTextPreset|diyLyricPreset"
    && !/\bid=(["'])diyGlitchTextPreset\1/i.test(html),
  beatControlsExistInGlitchGroup: !!sensitivityInput
    && !!durationInput
    && !!sensitivityOutput
    && !!durationOutput
    && glitchControl.includes('id="textGlitchBeatSensitivity"')
    && glitchControl.includes('id="textGlitchBeatDuration"'),
  beatControlsMapToDedicatedSettings:
    attributeValue(sensitivityInput, "data-text-composer-setting") === "glitchBeatSensitivity"
    && attributeValue(sensitivityInput, "data-text-glitch-setting") === "beatSensitivity"
    && attributeValue(durationInput, "data-text-composer-setting") === "glitchBeatDuration"
    && attributeValue(durationInput, "data-text-glitch-setting") === "beatDuration",
  beatSettingsHaveDefaultsAndNormalization: expectedBeatSettings.every((key) => (
    new RegExp(`\\b${key}\\s*:`).test(defaultSettings)
    && new RegExp(`\\b${key}\\b`).test(normalizeSettings)
  )),
  beatControlsAreRegisteredAndSynchronized: [
    ["textGlitchBeatSensitivity", "glitchBeatSensitivity"],
    ["textGlitchBeatDuration", "glitchBeatDuration"]
  ].every(([id, setting]) => (
    app.includes(`$('#${id}')`)
    && syncControls.includes(`els.${id}`)
    && attributeValue(elementOpeningTag(id), "data-text-composer-setting") === setting
  )),
  beatVariablesReachRenderedGlitch: expectedBeatSettings.every((key) => (
    applySettings.includes(key) || beatMotion.includes(key)
  )),
  playbackMotionCallsBeatUpdater: /updateGlitchBeatMotion\s*\(\s*playbackRunning(?:\s*,[^)]*)?\)/.test(
    playbackMotion
  ),
  beatUpdaterUsesUnifiedBeatAndSensitivity: /state\.visual\.beat/.test(beatMotion)
    && /glitchBeatSensitivity/.test(beatMotion),
  beatUpdaterHasRisingEdge: (
    /previous\w*Beat|previousBeat|lastBeat/i.test(beatMotion)
    && /(?:>=|>)\s*\w*(?:threshold|trigger|sensitivity)|\w*(?:threshold|trigger|sensitivity)\s*(?:<=|<)/i
      .test(beatMotion)
  ) || (
    /glitchBeatArmed/.test(beatMotion)
    && /releaseThreshold/.test(beatMotion)
    && /\bbeat\s*<=\s*releaseThreshold/.test(beatMotion)
    && /\bbeat\s*<\s*threshold/.test(beatMotion)
    && /glitchBeatArmed\s*=\s*false/.test(beatMotion)
  ),
  beatUpdaterHasCooldownAndDuration: /glitchBeatDuration/.test(beatMotion)
    && /cooldown|last\w*(?:Trigger|Hit)|activeUntil|triggeredAt/i.test(beatMotion)
    && /performance\.now|Date\.now|\bnow\b/.test(beatMotion),
  beatUpdaterSkipsPausedPlayback: /\bplaybackRunning\b/.test(beatMotion)
    && (
      /if\s*\(\s*!playbackRunning/.test(beatMotion)
      || (
        /\bactive\s*=\s*playbackRunning\s*&&/.test(beatMotion)
        && /if\s*\(\s*!active/.test(beatMotion)
      )
    ),
  beatUpdaterSkipsBookAndFocusEchoLyrics: /glitchTextEffectActive/.test(beatMotion)
    && /state\.textPreset\s*!==\s*['"]book['"]/.test(glitchActive)
    && /state\.textPreset\s*!==\s*['"]focus-echo['"]/.test(glitchActive),
  glitchLayerCreationIsIdempotent: /const\s+copies\s*=\s*Array\.from/.test(syncGlitchElement)
    && /copies\.find/.test(syncGlitchElement)
    && /if\s*\(\s*!copy\s*\)/.test(syncGlitchElement)
    && !/replaceChildren/.test(beatMotion)
    && !/appendChild/.test(beatMotion),
  sharedFlipHelperHasGeometryAnimation: /getBoundingClientRect/.test(flipMotion)
    && (
      /\.animate\s*\(/.test(flipMotion)
      || (/requestAnimationFrame/.test(flipMotion) && /transform/.test(flipMotion))
    ),
  singleBilingualUsesFlipSeam: /animateLyricGeometryFlip/.test(setPlaybackLine + subtitleLayout)
    && /getBoundingClientRect|capture\w*Geometry|previous\w*Rect|first\w*Rect/i
      .test(setPlaybackLine + subtitleLayout),
  playbackCardLyricsUseTimedFlipSeam:
    /startQishuiLyricTransition/.test(playbackCardLyrics)
    && /getBoundingClientRect/.test(startPlaybackCardLyricTransition)
    && /\.animate\s*\(/.test(startPlaybackCardLyricTransition)
    && /animation\.currentTime/.test(syncPlaybackCardLyricTransition)
    && /playbackTime/.test(playbackCardLyrics),
  flipCssDoesNotAnimateLayoutProperties: !/(?:transition|animation)[^;{}]*(?:height|width|font-size)/i
    .test(flipMotion)
    && !/scroll-behavior\s*:\s*smooth/i.test(styles)
};

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"]
]);

if (runEdgeDomProbe && !existsSync(edge)) throw new Error(`Microsoft Edge was not found: ${edge}`);
mkdirSync(temporaryRoot, { recursive: true });
let browserProbeExpression = "";

const server = createServer((request, response) => {
  const url = new URL(request.url || "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end("{}");
    return;
  }
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const componentAsset = requestedPath.startsWith("/components/");
  const staticRoot = componentAsset ? componentsRoot : webRoot;
  const relativePath = componentAsset
    ? requestedPath.slice("/components/".length)
    : requestedPath.slice(1);
  const filePath = path.resolve(staticRoot, decodeURIComponent(relativePath));
  if (!filePath.startsWith(`${staticRoot}${path.sep}`) || !existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": mimeTypes.get(path.extname(filePath).toLowerCase()) || "application/octet-stream"
  });
  let body = readFileSync(filePath);
  if (relativePath === "index.html"
      && url.searchParams.get("__lyric_glitch_probe") === "1"
      && browserProbeExpression) {
    const page = body.toString("utf8");
    const runner = `<script>
      window.addEventListener("load", () => setTimeout(async () => {
        const marker = document.createElement("pre");
        marker.id = "lyricGlitchProbe";
        try {
          const result = await ${browserProbeExpression};
          marker.textContent = btoa(unescape(encodeURIComponent(JSON.stringify(result))));
        } catch (error) {
          marker.dataset.error = "1";
          marker.textContent = btoa(unescape(encodeURIComponent(String(error && error.stack || error))));
        }
        document.body.appendChild(marker);
      }, 500), { once: true });
    </script>`;
    body = Buffer.from(page.replace("</body>", `${runner}</body>`), "utf8");
  }
  response.end(body);
});

if (runEdgeDomProbe) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}
const address = server.address();
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let browser = null;

let domChecks = {
  restoredTextPresetCardsAreLimited: staticChecks.restoredTextPresetCardsAreLimited,
  beatControlsAreMounted: staticChecks.beatControlsExistInGlitchGroup,
  glitchLayerCountStaysBounded: staticChecks.glitchLayerCreationIsIdempotent,
  geometryFlipProducesVisualMotion: staticChecks.sharedFlipHelperHasGeometryAnimation
};
let domContract = {
  runtimeProbe: runEdgeDomProbe ? "pending" : "source-contract",
  reason: runEdgeDomProbe ? "" : "Set FE_EDGE_DOM_PROBE=1 on a stable headless Edge runtime for the optional DOM probe"
};

if (runEdgeDomProbe) try {
  browserProbeExpression = `(async () => {
    const main = document.getElementById("playbackLyricText");
    let maximumGlitchCopies = 0;
    for (let frame = 0; frame < 240; frame += 1) {
      syncGlitchTextElement(main, "GLITCH FRAME", true);
      maximumGlitchCopies = Math.max(
        maximumGlitchCopies,
        main.querySelectorAll(":scope > .text-glitch-copy").length
      );
    }
    const finalGlitchCopies = main.querySelectorAll(":scope > .text-glitch-copy").length;

    let geometryAnimationCount = 0;
    let geometryInlineMotion = false;
    if (typeof animateLyricGeometryFlip === "function") {
      const probe = document.createElement("div");
      probe.textContent = "bilingual lyric geometry probe";
      Object.assign(probe.style, {
        position: "fixed",
        left: "20px",
        top: "20px",
        width: "220px",
        lineHeight: "24px"
      });
      document.body.appendChild(probe);
      const previousRect = probe.getBoundingClientRect();
      probe.style.left = "84px";
      probe.style.width = "132px";
      animateLyricGeometryFlip(probe, previousRect, {
        duration: 220,
        kind: "regression-probe"
      });
      geometryAnimationCount = probe.getAnimations().length;
      geometryInlineMotion = probe.style.transform !== ""
        || Array.from(probe.style).some((name) => name.includes("flip"));
      probe.remove();
    }

    return {
      checks: {
        restoredTextPresetCardsAreLimited: (() => {
          const cards = Array.from(
            document.querySelectorAll(".diy-preset-card[data-text-preset]")
          );
          const values = cards
            .map((card) => card.getAttribute("data-text-preset"))
            .sort()
            .join("|");
          const ids = cards.map((card) => card.id).sort().join("|");
          return cards.length === 2
            && values === "depth|focus-echo"
            && ids === "diyFocusEchoTextPreset|diyLyricPreset";
        })(),
        beatControlsAreMounted: !!document.getElementById("textGlitchBeatSensitivity")
          && !!document.getElementById("textGlitchBeatDuration"),
        glitchLayerCountStaysBounded: maximumGlitchCopies === 2 && finalGlitchCopies === 2,
        geometryFlipProducesVisualMotion: geometryAnimationCount > 0 || geometryInlineMotion
      },
      contract: {
        textPresetCardCount:
          document.querySelectorAll(".diy-preset-card[data-text-preset]").length,
        textPresetCardValues: Array.from(
          document.querySelectorAll(".diy-preset-card[data-text-preset]")
        ).map((element) => element.getAttribute("data-text-preset")).sort(),
        nonCardTextPresetCarriers: Array.from(
          document.querySelectorAll("[data-text-preset]:not(.diy-preset-card)")
        ).map((element) => ({
          tagName: element.tagName.toLowerCase(),
          id: element.id,
          className: element.className,
          value: element.getAttribute("data-text-preset")
        })),
        maximumGlitchCopies,
        finalGlitchCopies,
        geometryAnimationCount,
        geometryInlineMotion,
        hasBeatMotionFunction: typeof updateGlitchBeatMotion === "function",
        hasGeometryFlipFunction: typeof animateLyricGeometryFlip === "function"
      }
    };
  })()`;
  let browserOutput = "";
  let browserErrors = "";
  browser = spawn(edge, [
    "--headless=new",
    "--disable-gpu-sandbox",
    "--run-all-compositor-stages-before-draw",
    "--virtual-time-budget=12000",
    "--dump-dom",
    `--user-data-dir=${profile}`,
    `http://127.0.0.1:${address.port}/?__lyric_glitch_probe=1`
  ], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  browser.stdout.on("data", (chunk) => { browserOutput += chunk.toString("utf8"); });
  browser.stderr.on("data", (chunk) => { browserErrors += chunk.toString("utf8"); });
  const exitCode = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      browser.kill();
      reject(new Error("Edge DOM probe timed out"));
    }, 45000);
    browser.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    browser.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
  if (exitCode !== 0) {
    throw new Error(`Edge DOM probe exited with ${exitCode}: ${browserErrors.slice(-2000)}`);
  }
  const marker = /<pre[^>]*\bid="lyricGlitchProbe"[^>]*>([^<]*)<\/pre>/i.exec(browserOutput);
  if (!marker) {
    throw new Error(`Edge DOM probe did not return a result: ${browserErrors.slice(-2000)}`);
  }
  const decoded = Buffer.from(marker[1], "base64").toString("utf8");
  if (/\bdata-error="1"/i.test(marker[0])) throw new Error(decoded);
  const result = JSON.parse(decoded);
  domChecks = result.checks;
  domContract = result.contract;
} finally {
  if (browser && browser.exitCode === null) browser.kill();
  if (server.listening) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
  await delay(250);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {
  }
}

const checks = { ...staticChecks, ...domChecks };
const output = {
  pass: Object.values(checks).every(Boolean),
  checks,
  failures: Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name),
  contract: {
    expectedBeatSettings,
    textPresetCardSourceCount: textPresetCardTags.length,
    textPresetCardIds,
    textPresetCardValues,
    beatMotionFunctionPresent: !!beatMotion,
    flipMotionFunctionPresent: !!flipMotion,
    dom: domContract
  }
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exitCode = output.pass ? 0 : 1;
