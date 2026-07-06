#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

function packageRoot(name, paths) {
  return path.dirname(require.resolve(`${name}/package.json`, { paths }));
}

function isLegacyPathToRegexp(entry) {
  if (!entry || !fs.existsSync(entry)) return false;
  try {
    return typeof require(entry) === 'function';
  } catch {
    return false;
  }
}

function findLegacyPathToRegexp(root) {
  const pnpmRoot = path.join(root, 'node_modules', '.pnpm');
  if (!fs.existsSync(pnpmRoot)) return '';

  const matches = fs.readdirSync(pnpmRoot)
    .filter((name) => /^path-to-regexp@0\.1\./i.test(name))
    .sort()
    .reverse();

  for (const name of matches) {
    const entry = path.join(pnpmRoot, name, 'node_modules', 'path-to-regexp', 'index.js');
    if (isLegacyPathToRegexp(entry)) return entry;
  }
  return '';
}

function nearestLegacyPathToRegexp(start) {
  let current = path.resolve(start);
  while (current && current !== path.dirname(current)) {
    const regular = path.join(current, 'node_modules', 'path-to-regexp', 'index.js');
    if (isLegacyPathToRegexp(regular)) return regular;

    const pnpm = findLegacyPathToRegexp(current);
    if (pnpm) return pnpm;

    current = path.dirname(current);
  }
  return '';
}

function installExpressCompatibilityPatch(kugouRoot) {
  const expressRoot = packageRoot('express', [kugouRoot]);
  let legacyPath = '';

  try {
    const resolved = require.resolve('path-to-regexp', { paths: [expressRoot] });
    if (isLegacyPathToRegexp(resolved)) legacyPath = resolved;
  } catch {
  }

  if (!legacyPath) {
    legacyPath = nearestLegacyPathToRegexp(expressRoot) || nearestLegacyPathToRegexp(process.cwd());
  }

  if (!legacyPath) {
    throw new Error('Unable to find path-to-regexp 0.1.x required by Express 4.');
  }

  const expressPrefix = path.resolve(expressRoot).toLowerCase() + path.sep.toLowerCase();
  const originalResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function patchedResolveFilename(request, parent, isMain, options) {
    if (request === 'path-to-regexp' && parent && parent.filename) {
      const parentFile = path.resolve(parent.filename).toLowerCase();
      if (parentFile.startsWith(expressPrefix)) {
        return legacyPath;
      }
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}

async function main() {
  const kugouRoot = packageRoot('kugoumusicapi', [process.cwd(), path.resolve(__dirname, '..')]);
  installExpressCompatibilityPatch(kugouRoot);
  require(path.join(kugouRoot, 'util', 'runtime')).applyCliOverrides();
  await require(path.join(kugouRoot, 'server')).startService();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
