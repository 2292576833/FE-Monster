import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const buildSource = path.join(root, 'FE moster苹果端', 'Build');
const script = fs.readFileSync(path.join(buildSource, 'build-music-apis.sh'), 'utf8');
assert.ok(!/declare\s+-A|mapfile|readarray|\$\{[^}]*,,/.test(script), 'build must support macOS Bash 3.2');
assert.match(script, /source "\$\{SCRIPT_DIR\}\/common\.sh"/);
assert.match(script, /283f1e97b110726b208a64b486a657c0fc0a6126/);
assert.match(script, /esbuild@0\.28\.1/);
assert.match(script, /patch-runtime\.cjs/);
assert.match(script, /generate-notices\.cjs/);
assert.match(script, /archiveSha256/);

const bundled = path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies');
const bash = process.env.FE_TEST_BASH || (process.platform === 'win32'
  ? path.join(bundled, 'native', 'git', 'usr', 'bin', 'sh.exe') : 'bash');
const python = process.env.FE_TEST_PYTHON || (process.platform === 'win32'
  ? path.join(bundled, 'python', 'python.exe') : 'python3');
const syntax = spawnSync(bash, ['-n', path.join(buildSource, 'build-music-apis.sh')], { encoding: 'utf8', windowsHide: true });
assert.equal(syntax.status, 0, `bash syntax failed: ${syntax.stderr}`);

const fixtures = [
  ['netease', 'FE-Monster-Netease-API-Plugin-4.32.0.zip'],
  ['qq', 'FE-Monster-QQ-API-Plugin-2.4.2.zip'],
  ['kugou', 'FE-Monster-Kugou-API-Plugin-2.0.8.zip'],
  ['qishui', 'FE-Monster-Qishui-OpenAPI-Plugin-3.1.1.zip'],
];
for (const [, name] of fixtures.slice(0, 3)) {
  assert.ok(fs.existsSync(path.join(root, 'dist', 'plugins', name)), `Build the reviewed fixture first: ${name}`);
}

const scratchParent = path.join(root, '.tmp');
fs.mkdirSync(scratchParent, { recursive: true });
const scratch = fs.mkdtempSync(path.join(scratchParent, 'macos-music-api-build-'));
const fixtureRoot = path.join(scratch, 'repository with spaces');
const fixtureBuild = path.join(fixtureRoot, 'FE moster苹果端', 'Build');
const output = path.join(fixtureRoot, 'FE moster苹果端', '.build-macos', 'plugins');
const shims = path.join(scratch, 'tools');
const helper = path.join(shims, 'archive-helper.py');
const marker = path.join(scratch, 'npm-invoked');
fs.mkdirSync(fixtureBuild, { recursive: true });
fs.mkdirSync(shims, { recursive: true });

// Windows has no zip/unzip here. These test adapters use Python's real ZIP
// reader/writer while the production script still invokes macOS zip/unzip.
fs.writeFileSync(helper, `import pathlib, sys, zipfile
mode = sys.argv[1]
args = sys.argv[2:]
if mode == 'unzip':
    if args[0] == '-p':
        with zipfile.ZipFile(args[1]) as archive:
            sys.stdout.buffer.write(archive.read(args[2]))
    elif args[0] == '-tqq':
        with zipfile.ZipFile(args[1]) as archive:
            if archive.testzip() is not None: raise RuntimeError('Invalid CRC')
    else: raise RuntimeError('Unexpected unzip arguments')
elif mode == 'zip':
    if args[:2] != ['-q', '-r']: raise RuntimeError('Unexpected zip arguments')
    with zipfile.ZipFile(args[2], 'w', zipfile.ZIP_DEFLATED) as archive:
        for file in pathlib.Path('.').rglob('*'):
            if file.is_file(): archive.write(file, file.as_posix())
elif mode == 'invalidate':
    with zipfile.ZipFile(args[0]) as archive:
        files = {info.filename: archive.read(info) for info in archive.infolist()}
    if args[1] == 'version':
        import json
        manifest = json.loads(files['music-api-package.json'])
        manifest['version'] = '0.0.1'
        files['music-api-package.json'] = json.dumps(manifest).encode()
    elif args[1] == 'entry': del files['server.cjs']
    with zipfile.ZipFile(args[0], 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items(): archive.writestr(name, data)
`);
for (const command of ['zip', 'unzip']) {
  fs.writeFileSync(path.join(shims, command), `#!/bin/sh\nexec "$FE_TEST_PYTHON" "$FE_TEST_ZIP_HELPER" ${command} "$@"\n`, { mode: 0o755 });
}
fs.writeFileSync(path.join(shims, 'npm'), '#!/bin/sh\nprintf invoked > "$FE_TEST_NPM_MARKER"\nprintf "unexpected dependency install\\n" >&2\nexit 79\n', { mode: 0o755 });
for (const file of ['common.sh', 'build-music-apis.sh']) fs.copyFileSync(path.join(buildSource, file), path.join(fixtureBuild, file));
for (const [id] of fixtures) {
  const target = path.join(fixtureRoot, 'music-api-plugins', id);
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(path.join(root, 'music-api-plugins', id, 'music-api-package.json'), path.join(target, 'music-api-package.json'));
  const runtimePackage = path.join(root, 'music-api-plugins', id, 'runtime-package.json');
  if (fs.existsSync(runtimePackage)) fs.copyFileSync(runtimePackage, path.join(target, 'runtime-package.json'));
}
fs.cpSync(path.join(root, 'music-api-plugins', 'qishui'), path.join(fixtureRoot, 'music-api-plugins', 'qishui'), { recursive: true });
const cache = path.join(fixtureRoot, 'dist', 'plugins');
fs.mkdirSync(cache, { recursive: true });
for (const [, name] of fixtures.slice(0, 3)) fs.copyFileSync(path.join(root, 'dist', 'plugins', name), path.join(cache, name));

function runBuild() {
  const shimPath = process.platform === 'win32'
    ? `/${shims[0].toLowerCase()}${shims.slice(2).replaceAll('\\', '/')}` : shims;
  return spawnSync(bash, ['-c', 'export PATH="$FE_TEST_TOOLS:/usr/bin:$PATH"; exec "$FE_TEST_BUILD_SHELL" "$FE_TEST_BUILD_SCRIPT"'], {
    cwd: fixtureRoot,
    windowsHide: true,
    encoding: 'utf8',
    env: {
      ...process.env,
      FE_TEST_TOOLS: shimPath,
      FE_TEST_BUILD_SHELL: bash,
      FE_TEST_BUILD_SCRIPT: path.join(fixtureBuild, 'build-music-apis.sh').replaceAll('\\', '/'),
      FE_TEST_PYTHON: python,
      FE_TEST_ZIP_HELPER: helper,
      FE_TEST_NPM_MARKER: marker,
    },
  });
}

try {
  const built = runBuild();
  assert.equal(built.status, 0, `cache reuse and Qishui source build failed:\n${built.stdout}\n${built.stderr}`);
  assert.equal(fs.existsSync(marker), false, 'validated prebuilt APIs and pure CJS Qishui must need no npm install');
  for (const [, name] of fixtures) {
    const archive = path.join(output, name);
    assert.ok(fs.existsSync(archive), `Current macOS plugin missing: ${name}`);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    assert.equal(fs.readFileSync(`${archive}.sha256`, 'utf8'), `${hash}  ${name}\n`);
  }
  const repeated = runBuild();
  assert.equal(repeated.status, 0, `verified generated packages must be reusable: ${repeated.stderr}`);

  for (const reason of ['version', 'entry']) {
    const name = fixtures[1][1];
    fs.rmSync(path.join(output, name));
    fs.copyFileSync(path.join(root, 'dist', 'plugins', name), path.join(cache, name));
    const invalidated = spawnSync(python, [helper, 'invalidate', path.join(cache, name), reason], { encoding: 'utf8', windowsHide: true });
    assert.equal(invalidated.status, 0, invalidated.stderr);
    const rejected = runBuild();
    assert.notEqual(rejected.status, 0, `A cached plugin with wrong ${reason} must be rejected`);
    assert.ok(fs.existsSync(marker), 'invalid caches must take the source rebuild path');
    assert.equal(fs.existsSync(path.join(output, name)), false, 'invalid cached plugins must not be staged');
    fs.rmSync(marker);
    fs.copyFileSync(path.join(root, 'dist', 'plugins', name), path.join(output, name));
  }
  console.log('macOS music API build: Bash syntax, four current packages, Qishui source build, cache reuse, wrong version and missing entry rejection PASS');
} finally {
  assert.ok(path.resolve(scratch).startsWith(`${path.resolve(scratchParent)}${path.sep}`));
  fs.rmSync(scratch, { recursive: true, force: true });
}
