"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PATCH_MARKER = "FE Monster QQ private-library patch";
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

function patchServiceFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  if (source.includes(PATCH_MARKER)) return false;

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
  fs.writeFileSync(filePath, source.slice(0, start) + REPLACEMENT + "\n" + source.slice(end), "utf8");
  return true;
}

function patchRuntime(runtimeRoot) {
  const packageRoot = path.join(runtimeRoot, "node_modules", "@sansenjian", "qq-music-api", "dist");
  const targets = ["services.cjs", "services.js"]
    .map((name) => path.join(packageRoot, name))
    .filter((filePath) => fs.existsSync(filePath));
  if (targets.length === 0) throw new Error(`QQ runtime service files were not found below ${runtimeRoot}`);
  return targets.map((filePath) => ({ filePath, changed: patchServiceFile(filePath) }));
}

if (require.main === module) {
  const runtimeRoot = process.argv[2] ? path.resolve(process.argv[2]) : "";
  if (!runtimeRoot) throw new Error("Usage: node patch-runtime.cjs <runtime-root>");
  const results = patchRuntime(runtimeRoot);
  process.stdout.write(`${JSON.stringify(results)}\n`);
}

module.exports = { PATCH_MARKER, patchRuntime, patchServiceFile };
