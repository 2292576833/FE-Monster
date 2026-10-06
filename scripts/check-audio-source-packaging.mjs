import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const buildPath = path.join(root, 'scripts', 'build-installer.ps1');
const runtimeRoot = path.join(root, 'native', 'audio-sources');
const build = readFileSync(buildPath, 'utf8');
const manifest = JSON.parse(readFileSync(path.join(runtimeRoot, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(path.join(runtimeRoot, 'package-lock.json'), 'utf8'));

assert.deepEqual(manifest.dependencies, {
  'ipaddr.js': '2.5.0',
  'quickjs-emscripten': '0.32.0'
}, 'audio-source runtime dependencies must remain exactly pinned');
assert.equal(lock.lockfileVersion, 3, 'the distributable dependency lock must use npm lockfile v3');
assert.equal(lock.packages['node_modules/quickjs-emscripten']?.version, '0.32.0');
assert.equal(lock.packages['node_modules/ipaddr.js']?.version, '2.5.0');

const productionModules = readdirSync(runtimeRoot)
  .filter((name) => name.endsWith('.mjs'))
  .sort();
assert.deepEqual(productionModules, [
  'download.mjs',
  'lx-runner.mjs',
  'media-relay.mjs',
  'network.mjs',
  'relay.mjs',
  'runtime.mjs'
], 'review the packaging contract when the production module surface changes');

for (const file of [
  ...productionModules,
  'package.json',
  'package-lock.json',
  'THIRD_PARTY_NOTICES.md'
]) {
  assert.ok(existsSync(path.join(runtimeRoot, file)), `missing production runtime file: ${file}`);
}

const installedPackages = Object.keys(lock.packages)
  .filter((entry) => entry.startsWith('node_modules/') && entry.split('/').length <= (entry.startsWith('node_modules/@') ? 3 : 2));
for (const packagePath of installedPackages) {
  const absolute = path.join(runtimeRoot, ...packagePath.split('/'));
  assert.ok(existsSync(absolute), `locked dependency is not installed: ${packagePath}`);
  const license = readdirSync(absolute).find((name) => /^(?:license|copying|notice)(?:\..+)?$/i.test(name));
  assert.ok(license, `installed dependency license is missing: ${packagePath}`);
}

const releaseWasm = 'node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm';
assert.ok(existsSync(path.join(runtimeRoot, ...releaseWasm.split('/'))),
  'the QuickJS release-sync WASM artifact must be installed before packaging');
assert.match(readFileSync(path.join(runtimeRoot, 'runtime.mjs'), 'utf8'), /\bRELEASE_SYNC\b/,
  'the required payload WASM must match the runtime variant actually imported');

const stageStart = build.indexOf('function Stage-AudioSourceRuntime {');
const stageEnd = build.indexOf('\nfunction ', stageStart + 1);
assert.ok(stageStart >= 0 && stageEnd > stageStart,
  'build-installer.ps1 must define a bounded Stage-AudioSourceRuntime function');
const stageFunction = build.slice(stageStart, stageEnd);
assert.match(stageFunction, /native\\audio-sources/,
  'audio source runtime must retain its native/audio-sources payload path');
assert.match(stageFunction, /Get-ChildItem[^\n]+-Filter '\*\.mjs'[^\n]+-File/,
  'all top-level production .mjs modules must be enumerated');
assert.match(stageFunction, /'package\.json'[\s\S]*?'package-lock\.json'[\s\S]*?'THIRD_PARTY_NOTICES\.md'/,
  'package metadata, lockfile, and third-party notices must be copied');
// The staged tree must contain every locked dependency package, because the
// quickjs-emscripten ESM entry statically imports all four wasm variants.
// Individual packages may nevertheless drop files Node never loads
// (TypeScript declarations, source maps, and the iife/browser/workerd
// emscripten-module variants); keeping them pushes the payload's longest
// relative path past the length that deep installation roots can afford.
assert.match(stageFunction, /\$audioSourceRuntimePackages = @\(/,
  'the staged dependency packages must be enumerated explicitly');
for (const packagePath of installedPackages) {
  // The build script writes Windows separators; the lockfile uses forward slashes.
  const packageName = packagePath.replace(/^node_modules\//, '');
  const windowsName = packageName.replace(/\//g, '\\');
  assert.ok(
    stageFunction.includes("'" + windowsName + "'"),
    'the staged dependency package list must include every locked dependency: ' + packageName
  );
}
assert.match(stageFunction, /Copy-Item -LiteralPath \$packageFile\.FullName -Destination \$packageTarget -Force/,
  'each staged dependency package must copy its runtime files individually');
assert.match(stageFunction, /\$packageFile\.Name -like 'LICENSE\*'/,
  'dependency licenses must stay in the staged payload');
assert.match(stageFunction, /emscripten-module\.browser\.mjs[\s\S]*?emscripten-module\.cloudflare\.cjs/,
  'the Node-unreachable emscripten-module variants must be excluded explicitly');
assert.match(stageFunction, /lost its manifest/,
  'a staged dependency package without package.json must fail the build');
assert.match(stageFunction, /over-long relative path/,
  'the staged payload must self-check its longest relative path');
assert.match(stageFunction, /Audio source runtime dependencies are missing/,
  'missing preinstalled dependencies must fail with a clear packaging error');
assert.doesNotMatch(stageFunction, /\$NoNodeBundle/,
  'audio-source dependency staging must not change NoNodeBundle behavior');
assert.doesNotMatch(stageFunction, /Copy-Dir\s+\$audioSourceRuntimeSource/,
  'the runtime root must not be copied wholesale with tests and implementation reports');
assert.doesNotMatch(stageFunction, /\bnpm(?:\.cmd)?\s+(?:ci|install)\b/i,
  'installer construction must never fetch or install runtime packages');

const stagePayloadStart = build.indexOf('function Stage-Payload {');
const stagePayloadEnd = build.indexOf('\nfunction ', stagePayloadStart + 1);
const stagePayload = build.slice(stagePayloadStart, stagePayloadEnd);
assert.match(stagePayload, /Stage-AudioSourceRuntime/,
  'payload staging must invoke the audio-source runtime copy');
assert.ok(stagePayload.indexOf('Stage-AudioSourceRuntime') < stagePayload.indexOf('New-PayloadIntegrityManifest'),
  'the audio-source runtime must be present before payload integrity hashing');

for (const required of [
  'web\\audio-source-manager.js',
  'web\\audio-source-manager.css',
  'native\\audio-sources\\lx-runner.mjs',
  'native\\audio-sources\\media-relay.mjs',
  'native\\audio-sources\\relay.mjs',
  'native\\audio-sources\\package.json',
  'native\\audio-sources\\package-lock.json',
  'native\\audio-sources\\THIRD_PARTY_NOTICES.md',
  'native\\audio-sources\\node_modules\\@jitl\\quickjs-wasmfile-release-sync\\dist\\emscripten-module.wasm',
  'native\\audio-sources\\node_modules\\quickjs-emscripten\\LICENSE',
  'native\\audio-sources\\node_modules\\ipaddr.js\\LICENSE'
]) {
  assert.ok(build.includes(`'${required}'`), `requiredPayloadItems is missing ${required}`);
}

assert.doesNotMatch(build, /\bnpm(?:\.cmd)?\s+(?:ci|install)\b/i,
  'the installer script must remain an offline consumer of pinned dependencies');
assert.match(build, /Invoke-Step 'Validating audio source packaging contract'[\s\S]*?check-audio-source-packaging\.mjs[\s\S]*?Audio source packaging contract check failed/,
  'the installer build must run the packaging contract before staging');

console.log(JSON.stringify({
  ok: true,
  productionModules,
  installedPackages: installedPackages.length,
  requiredWasm: releaseWasm
}, null, 2));
