#!/usr/bin/env node

/**
 * Select candidate AISHELL-3 speakers from official metadata.
 *
 * This script intentionally does not download audio. It only parses the
 * Apache-2.0 dataset metadata that the operator explicitly places in the
 * staging directory, then emits deterministic speaker/utterance candidates.
 */

import fs from "node:fs";
import path from "node:path";

const [, , metadataPath, outputPath] = process.argv;
if (!metadataPath || !outputPath) {
  console.error("usage: node select-aishell3-chatterbox-voices.mjs <label_train-set.txt> <output.json>");
  process.exit(2);
}

const source = fs.readFileSync(path.resolve(metadataPath), "utf8");
const rows = source
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => line.split(/\t+|\|/u));

const speakers = new Map();
for (const fields of rows) {
  const utteranceId = String(fields[0] || "").trim().replace(/\.wav$/iu, "");
  const speakerId = utteranceId.match(/^(SSB\d{4})\d{4}$/u)?.[1];
  if (!speakerId) continue;
  const bucket = speakers.get(speakerId) || [];
  bucket.push({ utteranceId, fields: fields.slice(1) });
  speakers.set(speakerId, bucket);
}

const candidates = [...speakers]
  .map(([speakerId, utterances]) => ({
    speakerId,
    utteranceCount: utterances.length,
    utteranceIds: utterances.slice(0, 12).map((item) => item.utteranceId),
  }))
  .filter((item) => item.utteranceCount >= 12)
  .sort((a, b) => b.utteranceCount - a.utteranceCount || a.speakerId.localeCompare(b.speakerId));

fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(
  path.resolve(outputPath),
  `${JSON.stringify({ source: path.resolve(metadataPath), speakerCount: candidates.length, candidates }, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify({ speakerCount: candidates.length, top: candidates.slice(0, 8) }));
