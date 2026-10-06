"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PATCH_MARKER = "FE Monster QQ private-library patch";
const LYRIC_PATCH_MARKER = "FE Monster QQ native-QRC patch v2";
const REPLACEMENT = `var extractPlaylists = (payload) => {
	// ${PATCH_MARKER}: merge every authenticated private playlist array and ignore empty candidates.
	debugLog$1("payload top-level keys", Object.keys(payload || {}));
	debugLog$1("payload.data keys", payload?.data && typeof payload.data === "object" ? Object.keys(payload.data) : []);
	const candidateEntries = getNamedCandidateEntries(payload).filter(([, candidate]) => Array.isArray(candidate));
	const populatedEntries = candidateEntries.filter(([, candidate]) => candidate.length > 0);
	if (populatedEntries.length > 0) {
		const seen = new Set();
		const playlists = [];
		for (const [, candidate] of populatedEntries) {
			for (const playlist of candidate) {
				const identity = playlist && typeof playlist === "object"
					? [playlist.dissid, playlist.dissId, playlist.tid, playlist.id, playlist.playlistId]
						.find((value) => value !== void 0 && value !== null && String(value).trim() !== "")
					: "";
				const key = identity === void 0 || identity === ""
					? \`json:\${JSON.stringify(playlist)}\`
					: \`id:\${String(identity)}\`;
				if (seen.has(key)) continue;
				seen.add(key);
				playlists.push(playlist);
			}
		}
		debugLog$1("merged private playlist candidates", {
			candidatePaths: populatedEntries.map(([candidatePath]) => candidatePath),
			length: playlists.length
		});
		return playlists;
	}
	if (candidateEntries.length > 0) return [];
	debugLog$1("playlist candidates summary", getNamedCandidateEntries(payload).map(([candidatePath, candidate]) => ({
		candidatePath,
		type: Array.isArray(candidate) ? "array" : typeof candidate,
		keys: candidate && typeof candidate === "object" && !Array.isArray(candidate) ? Object.keys(candidate) : void 0
	})));
	throw new Error("User playlist response did not contain a playlist list field");
};`;

const LYRIC_NORMALIZER_REPLACEMENT = `var decodeLyricField = (value) => {
	if (typeof value !== "string" || !value) return "";
	const compact = value.trim().replace(/\\s+/g, "");
	if (!compact || compact.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return value;
	try {
		const decoded = Buffer.from(compact, "base64").toString("utf8");
		if (!decoded || decoded.includes("\\uFFFD")) return value;
		const sourceRoundTrip = compact.replace(/=+$/, "");
		const decodedRoundTrip = Buffer.from(decoded, "utf8").toString("base64").replace(/=+$/, "");
		return decodedRoundTrip === sourceRoundTrip ? decoded : value;
	} catch {
		return value;
	}
};
var normalizeLyricResponse = (resData, isFormat) => {
	// ${LYRIC_PATCH_MARKER}: QQ returns each lyric track as an independent Base64 field.
	const lyricString = decodeLyricField(resData?.lyric);
	const qrc = decodeLyricField(resData?.qrc || resData?.qrc_lyric || resData?.qrcLyric);
	const trans = decodeLyricField(resData?.trans || resData?.translation || resData?.translyric);
	const roma = decodeLyricField(resData?.roma || resData?.romanization || resData?.romalrc);
	const lyric = isFormat && lyricString ? lyricParse(lyricString) : lyricString;
	return {
		...resData,
		lyric,
		qrc,
		trans,
		roma
	};
};
var hasUsableQrc = (data) => {
	const qrc = decodeLyricField(data?.qrc || data?.qrc_lyric || data?.qrcLyric);
	return /\\[\\d+,\\d+\\]/.test(qrc) && /(?:\\(\\d+,\\d+(?:,\\d+)?\\)|<\\d+,\\d+(?:,\\d+)?>)/.test(qrc);
};
var shouldFetchNativeQrc = (data) => hasNegativeBizCode(data) || !hasUsableQrc(data);
`;

function patchPlaylistSource(source, filePath) {
  if (source.includes(PATCH_MARKER)) return source;
  const startMarker = "var extractPlaylists = (payload) => {";
  const endMarker = "var getErrorMessage = (payload) => {";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error(`QQ runtime playlist extractor was not found in ${filePath}`);
  }
  const original = source.slice(start, end);
  if (!original.includes("getNamedCandidateEntries(payload)")) {
    throw new Error(`QQ runtime playlist extractor shape changed in ${filePath}`);
  }
  return source.slice(0, start) + REPLACEMENT + "\n" + source.slice(end);
}

function patchLyricSource(source, filePath) {
  if (source.includes(LYRIC_PATCH_MARKER)) return source;
  const normalizerStartMarker = "var decodeLyricField = (value) => {";
  const normalizerEndMarker = "var hasNegativeBizCode = (data) => {";
  const start = source.indexOf(normalizerStartMarker);
  const end = source.indexOf(normalizerEndMarker, start);
  if (start < 0 || end < 0) {
    throw new Error(`QQ runtime lyric normalizer was not found in ${filePath} (start=${start}, end=${end})`);
  }
  let patched = source.slice(0, start) + LYRIC_NORMALIZER_REPLACEMENT + source.slice(end);
  const oldFetchCondition = "if (hasNegativeBizCode(payload)) try {";
  const newFetchCondition = "if (shouldFetchNativeQrc(payload)) try {";
  if (!patched.includes(oldFetchCondition)) {
    throw new Error(`QQ runtime lyric fallback condition changed in ${filePath}`);
  }
  patched = patched.replace(oldFetchCondition, newFetchCondition);
  patched = patched.replace("qrc_t: 0,", "qrc: 1,\n\t\t\t\tqrc_t: 0,");
  const musicuReturn = "return upstream?.req_0?.data || upstream?.PlayLyricInfo?.data || {};";
  if (patched.includes(musicuReturn)) {
    patched = patched.replace(musicuReturn,
      'const { decodeQqPayload } = await import("./fe-qrc-decrypt.mjs");\n\treturn decodeQqPayload(upstream?.req_0?.data || upstream?.PlayLyricInfo?.data || {});');
  }
  const oldRetryCondition = "if (hasNegativeBizCode(fallbackPayload) && !normalizeSongId(songid) && songmid) {";
  const newRetryCondition = "if (shouldFetchNativeQrc(fallbackPayload) && !normalizeSongId(songid) && songmid) {";
  if (patched.includes(oldRetryCondition)) {
    patched = patched.replace(oldRetryCondition, newRetryCondition);
  }
  return patched;
}

function patchServiceFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const patched = patchPlaylistSource(patchLyricSource(source, filePath), filePath);
  if (patched === source) return false;
  fs.writeFileSync(filePath, patched, "utf8");
  return true;
}

function patchRuntime(runtimeRoot) {
  const packageRoot = path.join(runtimeRoot, "node_modules", "@sansenjian", "qq-music-api", "dist");
  const targets = ["services.cjs", "services.js"]
    .map((name) => path.join(packageRoot, name))
    .filter((filePath) => fs.existsSync(filePath));
  if (targets.length === 0) throw new Error(`QQ runtime service files were not found below ${runtimeRoot}`);
  for (const file of ["fe-qrc-decrypt.mjs", "fe-qrc-des.mjs", "LRC-GET-LICENSE.txt"]) {
    fs.copyFileSync(path.join(__dirname, file), path.join(packageRoot, file));
  }
  return targets.map((filePath) => ({ filePath, changed: patchServiceFile(filePath) }));
}

if (require.main === module) {
  const runtimeRoot = process.argv[2] ? path.resolve(process.argv[2]) : "";
  if (!runtimeRoot) throw new Error("Usage: node patch-runtime.cjs <runtime-root>");
  const results = patchRuntime(runtimeRoot);
  process.stdout.write(`${JSON.stringify(results)}\n`);
}

module.exports = { LYRIC_PATCH_MARKER, PATCH_MARKER, patchRuntime, patchServiceFile };
