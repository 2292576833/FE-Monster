import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const entryRelative = 'web/index.html';
const entryPath = path.join(projectRoot, entryRelative);
const manifestRelative = 'web/cache-fingerprints.json';
const manifestPath = path.join(projectRoot, manifestRelative);
const args = process.argv.slice(2);
const writeManifest = args.includes('--write');
const checkCopies = args.includes('--copies');
const versionPattern = /^[a-z0-9][a-z0-9._-]{5,}$/u;

const toPosix = (value) => value.replaceAll(path.sep, '/');
const sha256 = (filePath) => crypto
  .createHash('sha256')
  .update(fs.readFileSync(filePath))
  .digest('hex');

function sourceLine(source, index) {
  return source.slice(0, index).split('\n').length;
}

function resolveLocalReference(rawUrl, sourceRelative, errors, context) {
  const value = String(rawUrl || '').trim();
  if (!value || /^(?:[a-z]+:)?\/\//iu.test(value) || /^(?:data|blob):/iu.test(value)) {
    return null;
  }

  const withoutHash = value.split('#', 1)[0];
  const queryIndex = withoutHash.indexOf('?');
  const pathname = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  const query = queryIndex >= 0 ? withoutHash.slice(queryIndex + 1) : '';
  if (pathname.startsWith('/api/')) return null;
  if (!/\.(?:js|css)$/iu.test(pathname)) return null;

  const versions = new URLSearchParams(query).getAll('v');
  if (versions.length !== 1 || !versions[0]) {
    errors.push(`${context}: local ${pathname} must have exactly one non-empty ?v= cache key`);
  } else if (!versionPattern.test(versions[0])) {
    errors.push(`${context}: ${pathname} has invalid cache key ${JSON.stringify(versions[0])}`);
  }

  let absolutePath;
  if (pathname.startsWith('/components/')) {
    absolutePath = path.join(projectRoot, pathname.slice(1));
  } else if (pathname.startsWith('/')) {
    absolutePath = path.join(projectRoot, 'web', pathname.slice(1));
  } else {
    absolutePath = path.resolve(projectRoot, path.dirname(sourceRelative), pathname);
  }

  const relative = path.relative(projectRoot, absolutePath);
  if (!relative || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    errors.push(`${context}: ${pathname} resolves outside the project`);
    return null;
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    errors.push(`${context}: local asset is missing: ${toPosix(relative)}`);
  }

  return {
    path: toPosix(relative),
    absolutePath,
    version: versions[0] || '',
    context
  };
}

function collectReferences() {
  const errors = [];
  const references = new Map();
  const pendingJavaScript = [];
  const scannedJavaScript = new Set();

  function record(reference) {
    if (!reference) return;
    const previous = references.get(reference.path);
    if (previous && previous.version !== reference.version) {
      errors.push(
        `${reference.context}: ${reference.path} uses ${reference.version}, `
        + `but ${previous.contexts[0]} uses ${previous.version}`
      );
      return;
    }
    if (previous) {
      previous.contexts.push(reference.context);
    } else {
      references.set(reference.path, {
        path: reference.path,
        absolutePath: reference.absolutePath,
        version: reference.version,
        contexts: [reference.context]
      });
      if (reference.path.endsWith('.js')) pendingJavaScript.push(reference);
    }
  }

  const html = fs.readFileSync(entryPath, 'utf8');
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*>/giu)) {
    const attribute = match[0].match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/iu);
    if (!attribute) continue;
    const context = `${entryRelative}:${sourceLine(html, match.index)}`;
    record(resolveLocalReference(attribute[1], entryRelative, errors, context));
  }

  const dynamicPatterns = [
    /\bimport\s*\(\s*["']([^"']+\.js(?:\?[^"']*)?)["']/giu,
    /\b(?:src|url)\s*[:=]\s*["']([^"']+\.js(?:\?[^"']*)?)["']/giu,
    /\baddModule\s*\(\s*["']([^"']+\.js(?:\?[^"']*)?)["']/giu,
    /\b[A-Z][A-Z0-9_]*_URL\s*=\s*["']([^"']+\.js(?:\?[^"']*)?)["']/gu
  ];

  while (pendingJavaScript.length > 0) {
    const reference = pendingJavaScript.shift();
    if (scannedJavaScript.has(reference.path) || !fs.existsSync(reference.absolutePath)) continue;
    scannedJavaScript.add(reference.path);
    const source = fs.readFileSync(reference.absolutePath, 'utf8');
    for (const pattern of dynamicPatterns) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const context = `${reference.path}:${sourceLine(source, match.index)}`;
        record(resolveLocalReference(match[1], reference.path, errors, context));
      }
    }
  }

  return {
    errors,
    assets: [...references.values()].sort((left, right) => left.path.localeCompare(right.path))
  };
}

function expectedManifest(assets) {
  return {
    schemaVersion: 1,
    entry: entryRelative,
    assets: assets.map((asset) => ({
      path: asset.path,
      version: asset.version,
      sha256: sha256(asset.absolutePath)
    }))
  };
}

function compareManifest(expected, errors) {
  if (!fs.existsSync(manifestPath)) {
    errors.push(`${manifestRelative} is missing; run this check with --write after intentionally bumping cache keys`);
    return;
  }
  let actual;
  try {
    actual = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    errors.push(`${manifestRelative} is not valid JSON: ${error.message}`);
    return;
  }
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    errors.push(
      `${manifestRelative} does not match the current entry tokens/content; `
      + 'bump the affected ?v= key, then run this check with --write'
    );
  }
}

function validateManifestUpdate(expected) {
  if (!fs.existsSync(manifestPath)) return [];
  let current;
  try {
    current = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return [`${manifestRelative} is not valid JSON: ${error.message}`];
  }
  const currentAssets = new Map(
    Array.isArray(current.assets)
      ? current.assets.map((asset) => [asset.path, asset])
      : []
  );
  return expected.assets.flatMap((asset) => {
    const previous = currentAssets.get(asset.path);
    if (!previous || previous.sha256 === asset.sha256 || previous.version !== asset.version) return [];
    return [
      `${asset.path} content changed while reusing ?v=${asset.version}; `
      + 'bump its cache key before updating the fingerprint manifest'
    ];
  });
}

function resolveCopyRoots() {
  const roots = [];
  const add = (label, value) => {
    if (!value) return;
    const resolved = path.resolve(value);
    if (!roots.some((entry) => entry.root.toLowerCase() === resolved.toLowerCase())) {
      roots.push({ label, root: resolved });
    }
  };
  add('installer-payload', path.join(projectRoot, 'out', 'installer', 'work', 'payload', 'FE Monster'));
  if (process.env.LOCALAPPDATA) add('installed-client', path.join(process.env.LOCALAPPDATA, 'FE Monster'));
  for (const argument of args) {
    if (argument.startsWith('--copy-root=')) add('explicit-copy', argument.slice('--copy-root='.length));
  }
  return roots.filter((entry) => fs.existsSync(entry.root));
}

function checkCopy(rootEntry, expected) {
  const expectedPaths = [
    entryRelative,
    manifestRelative,
    ...expected.assets.map((asset) => asset.path)
  ];
  const stale = [];
  for (const relative of expectedPaths) {
    const source = path.join(projectRoot, relative);
    const copy = path.join(rootEntry.root, relative);
    if (!fs.existsSync(copy)) {
      stale.push({ path: relative, reason: 'missing' });
      continue;
    }
    if (sha256(copy) !== sha256(source)) stale.push({ path: relative, reason: 'content-mismatch' });
  }
  return {
    ...rootEntry,
    ok: stale.length === 0,
    staleCount: stale.length,
    stale: stale.slice(0, 24)
  };
}

function checkInstallerArtifacts(copies, expected) {
  const distRoot = path.join(projectRoot, 'dist');
  const executables = fs.existsSync(distRoot)
    ? fs.readdirSync(distRoot)
      .filter((name) => /^FE-Monster-Setup-.*\.exe$/iu.test(name))
      .map((name) => path.join(distRoot, name))
    : [];
  const newestSource = Math.max(
    fs.statSync(entryPath).mtimeMs,
    fs.statSync(manifestPath).mtimeMs,
    ...expected.assets.map((asset) => fs.statSync(path.join(projectRoot, asset.path)).mtimeMs)
  );
  const payload = copies.find((entry) => entry.label === 'installer-payload');
  return executables.map((executable) => {
    const info = fs.statSync(executable);
    const stale = info.mtimeMs < newestSource || (payload && !payload.ok);
    return {
      path: executable,
      ok: !stale,
      reason: stale ? 'older-than-source-or-staged-payload' : ''
    };
  });
}

const collected = collectReferences();
const expected = expectedManifest(collected.assets);

if (writeManifest) {
  const updateErrors = [...collected.errors, ...validateManifestUpdate(expected)];
  if (updateErrors.length > 0) {
    console.error(JSON.stringify({ ok: false, errors: updateErrors }, null, 2));
    process.exitCode = 1;
  } else {
    fs.writeFileSync(manifestPath, `${JSON.stringify(expected, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      ok: true,
      wrote: manifestRelative,
      assetCount: expected.assets.length
    }, null, 2));
  }
} else {
  const sourceErrors = [...collected.errors];
  compareManifest(expected, sourceErrors);
  const copies = checkCopies
    ? resolveCopyRoots().map((entry) => checkCopy(entry, expected))
    : [];
  const installers = checkCopies && fs.existsSync(manifestPath)
    ? checkInstallerArtifacts(copies, expected)
    : [];
  const ok = sourceErrors.length === 0
    && copies.every((entry) => entry.ok)
    && installers.every((entry) => entry.ok);
  console.log(JSON.stringify({
    ok,
    source: {
      ok: sourceErrors.length === 0,
      assetCount: expected.assets.length,
      errors: sourceErrors
    },
    copies,
    installers,
    host: os.hostname()
  }, null, 2));
  if (!ok) process.exitCode = 1;
}
