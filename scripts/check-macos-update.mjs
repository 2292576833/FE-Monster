import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(root, 'FE moster苹果端', 'Build', 'apply-client-update-macos.sh');
const source = fs.readFileSync(sourcePath, 'utf8');
const dependencies = path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies');
const bash = process.env.FE_TEST_BASH || (process.platform === 'win32' ? path.join(dependencies, 'native', 'git', 'usr', 'bin', 'sh.exe') : '/bin/bash');
const python = process.env.FE_TEST_PYTHON || (process.platform === 'win32' ? path.join(dependencies, 'python', 'python.exe') : 'python3');
const nativePath = value => process.platform === 'win32' ? `/${value[0].toLowerCase()}${value.slice(2).replaceAll('\\', '/')}` : value;
const syntax = spawnSync(bash, ['-n', sourcePath], { encoding: 'utf8', windowsHide: true });
assert.equal(syntax.status, 0, syntax.stderr);
assert.doesNotMatch(source, /declare\s+-A|mapfile|readarray|\$\{[^}]*,,|killall|pkill|sudo/);
assert.match(source, /attach -readonly -nobrowse -noautoopen/);
assert.match(source, /--proto '=https' --proto-redir '=https'/);
assert.match(source, /certificate leaf\[subject\.OU\]/);
assert.match(source, /spctl --assess/);

// Execute the production control flow with Apple commands replaced only in a
// temporary copy. No production bypass/fixture switch weakens installed updates.
const scratchBase = path.join(root, '.tmp');
fs.mkdirSync(scratchBase, { recursive: true });
const scratch = fs.mkdtempSync(path.join(scratchBase, 'macos-update-'));
const tools = path.join(scratch, 'tools');
fs.mkdirSync(tools);
const dispatcher = path.join(tools, 'dispatch.py');
fs.writeFileSync(dispatcher, String.raw`import hashlib, json, os, pathlib, shutil, sys
def local(value):
    if os.name == 'nt' and len(value) > 3 and value[0] == '/' and value[2] == '/': value = value[1].upper() + ':' + value[2:]
    return pathlib.Path(value)
command = pathlib.Path(sys.argv[1]).name
args = sys.argv[2:]
fixture = local(os.environ['FE_TEST_FIXTURE'])
scenario = os.environ['FE_TEST_SCENARIO']
state_file = fixture / 'processes.json'
state = json.loads(state_file.read_text())
def save(): state_file.write_text(json.dumps(state))
def app_version(app): return json.loads((local(app)/'Contents'/'Info.plist').read_text())['CFBundleShortVersionString']
if command == 'uname': print('Darwin')
elif command == 'stat': print(os.getuid() if hasattr(os, 'getuid') else 197609)
elif command == 'PlistBuddy':
    metadata = json.loads(local(args[2]).read_text())
    key = args[1].replace('Print :', '')
    if key not in metadata: sys.exit(1)
    print(metadata[key])
elif command == 'codesign':
    if '-dv' in args: print('TeamIdentifier=TESTTEAM01', file=sys.stderr)
    elif '-R' in args and scenario == 'signer': sys.exit(31)
elif command == 'spctl':
    if scenario == 'gatekeeper': sys.exit(32)
elif command == 'lipo':
    if scenario == 'arch': sys.exit(33)
elif command == 'sw_vers': print('13.5.0')
elif command == 'curl': local(args[args.index('--output') + 1]).write_bytes(b'verified-test-dmg')
elif command == 'shasum': print(hashlib.sha256(local(args[-1]).read_bytes()).hexdigest() + '  ' + args[-1])
elif command == 'hdiutil':
    if args[0] == 'attach':
        mount = local(args[args.index('-mountpoint') + 1])
        shutil.copytree(fixture/'candidate.app', mount/'FE Monster.app')
elif command == 'ditto': shutil.copytree(local(args[0]), local(args[1]))
elif command == 'ps':
    pid = args[args.index('-p') + 1]
    if not state.get(pid, False): sys.exit(1)
    field = args[args.index('-o') + 1]
    if field == 'uid=': print(os.getuid() if hasattr(os, 'getuid') else 197609)
    elif field == 'comm=':
        value = os.environ['FE_TEST_MAIN_COMMAND'] if pid == '12345' else os.environ['FE_TEST_JAVA_COMMAND']
        print('unrelated app' if scenario == 'owner' and pid == '12345' else value)
    elif field == 'lstart=': print('Wed Oct 7 10:00:00 2026')
    elif field == 'ppid=': print('12345')
elif command == 'kill':
    if args[-1] != '12345': raise RuntimeError('Unexpected process signal')
    (fixture/'signals.log').write_text(args[-1])
    state['12345'] = False; state['12346'] = False; save()
elif command == 'sleep': pass
elif command == 'mv':
    args = [value for value in args if value != '-f']
    origin, destination = local(args[0]), local(args[1])
    if scenario == 'rename' and origin.name.startswith('.FE-Monster-update-') and destination.name == 'FE Monster.app': sys.exit(34)
    if destination.is_file(): destination.unlink()
    shutil.move(str(origin), str(destination))
elif command == 'open':
    version = app_version(args[-1])
    if scenario == 'restart' and version == '2.2.4': sys.exit(35)
    (fixture/'opened.log').write_text(version)
else: raise RuntimeError('Unexpected shim command: ' + command)
`);
const replacements = [
  ['/usr/bin/uname', 'uname'], ['/usr/bin/stat', 'stat'], ['/usr/libexec/PlistBuddy', 'PlistBuddy'],
  ['/usr/bin/codesign', 'codesign'], ['/usr/sbin/spctl', 'spctl'], ['/usr/bin/lipo', 'lipo'],
  ['/usr/bin/sw_vers', 'sw_vers'], ['/usr/bin/curl', 'curl'], ['/usr/bin/hdiutil', 'hdiutil'], ['/usr/bin/shasum', 'shasum'],
  ['/usr/bin/ditto', 'ditto'], ['/bin/ps', 'ps'], ['/bin/kill', 'kill'], ['/usr/bin/open', 'open'],
  ['/bin/sleep', 'sleep'], ['/bin/mv', 'mv'],
];
let adapted = source;
for (const [absolute, command] of replacements) {
  adapted = adapted.replaceAll(absolute, `"\${FE_TEST_TOOLS}/${command}"`);
  fs.writeFileSync(path.join(tools, command), '#!/bin/sh\nexec "$FE_TEST_PYTHON" "$FE_TEST_DISPATCH" "$0" "$@"\n', { mode: 0o755 });
}
const adaptedFile = path.join(scratch, 'updater.sh');
fs.writeFileSync(adaptedFile, adapted);

function createApp(location, version) {
  const executableNames = ['Contents/MacOS/FE Monster', 'Contents/Resources/App/runtime/node/node', 'Contents/Resources/App/runtime/java/bin/java'];
  for (const name of executableNames) {
    const file = path.join(location, name); fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  }
  fs.writeFileSync(path.join(location, 'Contents', 'Info.plist'), JSON.stringify({
    CFBundleIdentifier: 'com.femonster.desktop', CFBundleExecutable: 'FE Monster', CFBundleShortVersionString: version,
    LSMinimumSystemVersion: '13.5',
  }));
  for (const relative of ['fe-monster-java.jar', 'web/index.html', 'web/app.js', 'web/mac-capture.js', 'scripts/apply-client-update-macos.sh',
    'native/audio-sources/node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm',
    'lib/sqlite-jdbc-3.53.2.1-without-natives.jar', 'lib/sqlite-jdbc-3.53.2.1-natives-mac.jar', 'lib/slf4j-api-1.7.36.jar',
    'native/macos/libfe-monster-keychain.dylib', 'native/macos/libfe-monster-coreaudio.dylib', 'native/macos/libfe_monster_upmix.dylib',
    ...['Netease', 'QQ', 'Kugou', 'Qishui'].map(provider => `plugins/music-api/FE-Monster-${provider}-${provider === 'Qishui' ? 'OpenAPI' : 'API'}-Plugin-1.0.0.zip`)]) {
    const file = path.join(location, 'Contents/Resources/App', relative);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'fixture resource');
  }
}

function runScenario(scenario) {
  const fixture = path.join(scratch, `${scenario} 安装目录`), bundle = path.join(fixture, 'FE Monster.app');
  const data = path.join(fixture, 'Application Support'), id = 'a'.repeat(32);
  const work = path.join(data, 'updates', `mac-${id}`), progress = path.join(data, 'update-progress', `${id}.json`);
  fs.mkdirSync(work, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(progress), { recursive: true });
  fs.writeFileSync(path.join(data, 'user-cookie.json'), 'private user data remains');
  createApp(bundle, '2.2.3'); createApp(path.join(fixture, 'candidate.app'), scenario === 'version' ? '2.2.5' : '2.2.4');
  if (scenario === 'resource') fs.unlinkSync(path.join(fixture, 'candidate.app/Contents/Resources/App/web/app.js'));
  if (scenario === 'dependency') fs.unlinkSync(path.join(fixture, 'candidate.app/Contents/Resources/App/plugins/music-api/FE-Monster-Qishui-OpenAPI-Plugin-1.0.0.zip'));
  fs.writeFileSync(path.join(fixture, 'processes.json'), JSON.stringify({ '12345': true, '12346': true }));
  const main = nativePath(path.join(bundle, 'Contents/MacOS/FE Monster'));
  const java = nativePath(path.join(bundle, 'Contents/Resources/App/runtime/java/bin/java'));
  const args = [adaptedFile, '--bundle', nativePath(bundle), '--data', nativePath(data), '--work', nativePath(work), '--update-id', id,
    '--download-url', 'https://github.com/2292576833/FE-Monster/releases/download/v2.2.4/FE-Monster-2.2.4-arm64.dmg',
    '--version', '2.2.4', '--sha256', scenario === 'hash' ? '0'.repeat(64) : crypto.createHash('sha256').update('verified-test-dmg').digest('hex'),
    '--arch', 'arm64', '--progress-file', nativePath(progress), '--main-pid', '12345', '--java-pid', '12346',
    '--main-executable', main, '--java-executable', java, '--main-command', main, '--java-command', java];
  const result = spawnSync(bash, args, { encoding: 'utf8', windowsHide: true, timeout: 60000, env: {
    ...process.env, FE_TEST_TOOLS: nativePath(tools), FE_TEST_PYTHON: python.replaceAll('\\', '/'),
    FE_TEST_DISPATCH: dispatcher, FE_TEST_FIXTURE: fixture, FE_TEST_SCENARIO: scenario,
    FE_TEST_MAIN_COMMAND: main, FE_TEST_JAVA_COMMAND: java,
    MSYS2_ENV_CONV_EXCL: 'FE_TEST_MAIN_COMMAND;FE_TEST_JAVA_COMMAND', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8',
  } });
  const expectedSuccess = scenario === 'success';
  assert.equal(result.status === 0, expectedSuccess, `${scenario}: ${result.stdout}\n${result.stderr}`);
  assert.equal(JSON.parse(fs.readFileSync(path.join(bundle, 'Contents', 'Info.plist'))).CFBundleShortVersionString, expectedSuccess ? '2.2.4' : '2.2.3', `${scenario}: original app must survive rejection/rollback`);
  assert.equal(fs.readFileSync(path.join(data, 'user-cookie.json'), 'utf8'), 'private user data remains');
  const status = JSON.parse(fs.readFileSync(progress, 'utf8')).status;
  assert.equal(status, expectedSuccess ? 'completed' : 'failed');
  assert.ok(!fs.existsSync(path.join(fixture, '.FE-Monster-update.lock')));
  if (['hash', 'signer', 'gatekeeper', 'arch', 'owner', 'version', 'resource', 'dependency'].includes(scenario)) {
    assert.ok(!fs.existsSync(path.join(fixture, 'signals.log')), `${scenario}: verification must precede any app termination`);
  }
  if (['rename', 'restart'].includes(scenario)) assert.equal(fs.readFileSync(path.join(fixture, 'opened.log'), 'utf8'), '2.2.3');
}

try {
  if (!process.argv.includes('--java-only')) {
    for (const scenario of ['success', 'hash', 'signer', 'gatekeeper', 'arch', 'owner', 'version', 'resource', 'dependency', 'rename', 'restart']) runScenario(scenario);
  }
  const classes = path.join(scratch, 'classes'); fs.mkdirSync(classes);
  const compile = spawnSync('javac', ['-encoding', 'UTF-8', '-d', classes,
    path.join(root, 'src/main/java/com/femonster/json/SimpleJson.java'),
    path.join(root, 'src/main/java/com/femonster/core/ProjectPaths.java'),
    path.join(root, 'src/main/java/com/femonster/core/UpdateService.java'),
    path.join(root, 'src/test/java/com/femonster/core/MacUpdateServiceProbe.java')], { encoding: 'utf8', windowsHide: true });
  assert.equal(compile.status, 0, compile.stderr);
  const probeEnvironment = { ...process.env, FE_MONSTER_ROOT: scratch, FE_MONSTER_DATA_DIR: path.join(scratch, 'probe-data') }; delete probeEnvironment.FE_MONSTER_BUNDLE_PATH;
  const probe = spawnSync('java', ['-cp', classes, 'com.femonster.core.MacUpdateServiceProbe'], { encoding: 'utf8', windowsHide: true, env: probeEnvironment });
  assert.equal(probe.status, 0, `${probe.stdout}\n${probe.stderr}`);
  console.log(probe.stdout.trim());
  if (!process.argv.includes('--java-only')) console.log('PASS macOS updater success, SHA/signer/Gatekeeper/CPU/version/owner/resource rejection, rename/restart rollback and external user data (native codesign/DMG acceptance requires macOS CI)');
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
