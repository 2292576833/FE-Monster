import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const serverRoot = path.resolve(root, '..', 'FE moster server');
const temporaryRoot = path.join(root, 'tmp');
mkdirSync(temporaryRoot, { recursive: true });
const scratch = mkdtempSync(path.join(temporaryRoot, 'fe-identity-java-proxy-'));
const serverData = path.join(scratch, 'server-data');
const clientRoot = path.join(scratch, 'client');
const clientData = path.join(clientRoot, 'data');
const testClasses = path.join(scratch, 'classes');
const mainClasses = path.join(root, 'out', 'classes');
const applicationJar = path.join(root, 'out', 'fe-monster-java.jar');
for (const directory of [serverData, clientData, testClasses]) mkdirSync(directory, { recursive: true });

const apiRoutes = readFileSync(path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'api', 'ApiRoutes.java'), 'utf8');
assert.match(apiRoutes, /case "\/api\/community\/identity-cards" -> handleCommunityIdentityCards/,
  'Java GET router does not expose the identity-card proxy');
assert.match(apiRoutes, /case "\/api\/community\/identity-cards\/equip" -> handleCommunityIdentityCardEquip/,
  'Java POST router does not expose identity-card equip');
assert.match(apiRoutes, /context\.community\.updateProfile[\s\S]{0,240}root\.containsKey\("username"\)/,
  'Java profile proxy does not preserve explicit nickname edits');

const homes = [
  process.env.FE_JAVA26_HOME,
  'C:\\Program Files\\Java\\jdk-17',
  'E:\\java26',
  process.env.FE_TEST_JAVA_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME,
  path.join(root, 'runtime', 'java')
].filter(Boolean);
const java = homes.map((home) => path.join(home, 'bin', 'java.exe')).find(existsSync) || 'java';
const javac = homes.map((home) => path.join(home, 'bin', 'javac.exe')).find(existsSync) || 'javac';
assert.ok(existsSync(path.join(mainClasses, 'com', 'femonster', 'core', 'CommunityService.class')),
  'Run scripts/build-java.ps1 before the identity-card Java proxy check');
assert.ok(existsSync(applicationJar), 'Run scripts/build-java.ps1 before the Java static-file check');

async function freePort() {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  socket.close();
  await once(socket, 'close');
  return port;
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...env, TEMP: temporaryRoot, TMP: temporaryRoot },
    encoding: 'utf8',
    timeout: 45_000,
    windowsHide: true
  });
  if (result.status !== 0) throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'));
  return result.stdout.trim();
}

const port = await freePort();
const appPort = await freePort();
let serverOutput = '';
const server = spawn(process.execPath, [path.join(serverRoot, 'server.js')], {
  cwd: serverRoot,
  env: {
    ...process.env,
    TEMP: temporaryRoot,
    TMP: temporaryRoot,
    PORT: String(port),
    FE_MONSTER_COMMUNITY_HOST: '127.0.0.1',
    FE_MONSTER_COMMUNITY_DATA: serverData
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});
server.stdout.on('data', (chunk) => { serverOutput += String(chunk); });
server.stderr.on('data', (chunk) => { serverOutput += String(chunk); });

try {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`server exited early\n${serverOutput}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      const body = await response.json();
      if (response.ok && body.service === 'fe-monster-community') break;
    } catch {}
    if (attempt === 99) throw new Error(`server startup timed out\n${serverOutput}`);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  run(javac, [
    '-encoding', 'UTF-8', '--release', '17', '-cp', mainClasses, '-d', testClasses,
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'core', 'CommunityIdentityCardProxyIntegrationProbe.java')
  ]);
  const output = run(java, [
    '-cp', `${testClasses}${path.delimiter}${mainClasses}`,
    'com.femonster.core.CommunityIdentityCardProxyIntegrationProbe',
    path.join(clientData, 'community-server-url.txt'),
    `http://127.0.0.1:${port}`
  ], {
    ...process.env,
    FE_MONSTER_ROOT: clientRoot,
    FE_MONSTER_DATA_DIR: clientData,
    FE_MONSTER_COMMUNITY_URL: ''
  });
  assert.match(output, /CommunityIdentityCardProxyIntegrationProbe passed/);

  const database = JSON.parse(readFileSync(path.join(serverData, 'community-db.json'), 'utf8'));
  assert.equal(Object.keys(database.users || {}).length, 2, 'proxy account switch registered an unexpected account count');
  const users = Object.values(database.users || {});
  assert.equal(new Set(users.map((user) => user.feId)).size, 2, 'proxy account switch reused an FE ID');
  assert.ok(users.every((user) => user.identityCards?.equippedId === 'fe-gold'), 'default equipment was not persisted');

  let appOutput = '';
  const app = spawn(java, ['-jar', applicationJar, '--no-client'], {
    cwd: root,
    env: {
      ...process.env,
      TEMP: temporaryRoot,
      TMP: temporaryRoot,
      FE_MONSTER_ROOT: root,
      FE_MONSTER_WEB_ROOT: path.join(root, 'web'),
      FE_MONSTER_DATA_DIR: clientData,
      FE_MONSTER_COMMUNITY_URL: `http://127.0.0.1:${port}`,
      FE_MONSTER_BIND: '127.0.0.1',
      FE_MONSTER_PORT: String(appPort),
      FE_MUSIC_API_AUTOSTART: '0'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  app.stdout.on('data', (chunk) => { appOutput += String(chunk); });
  app.stderr.on('data', (chunk) => { appOutput += String(chunk); });
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (app.exitCode !== null) throw new Error(`Java backend exited early\n${appOutput}`);
      try {
        const response = await fetch(`http://127.0.0.1:${appPort}/api/app/version`);
        if (response.ok) break;
      } catch {}
      if (attempt === 99) throw new Error(`Java backend startup timed out\n${appOutput}`);
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    const [documentResponse, scriptResponse, styleResponse, loggedOutIdentityResponse] = await Promise.all([
      fetch(`http://127.0.0.1:${appPort}/`),
      fetch(`http://127.0.0.1:${appPort}/fe-identity-card.js`),
      fetch(`http://127.0.0.1:${appPort}/fe-identity-card.css`),
      fetch(`http://127.0.0.1:${appPort}/api/community/identity-cards?provider=netease`)
    ]);
    assert.equal(documentResponse.status, 200, 'Java static server did not serve the production document');
    assert.equal(scriptResponse.status, 200, 'Java static server did not serve the identity-card runtime');
    assert.equal(styleResponse.status, 200, 'Java static server did not serve the identity-card stylesheet');
    assert.match(await documentResponse.text(), /id="communityIdentityCardButton"/);
    assert.match(await scriptResponse.text(), /window\.FeMonsterIdentityCard/);
    assert.match(await styleResponse.text(), /\.fe-identity-card__card/);
    const loggedOutIdentity = await loggedOutIdentityResponse.json();
    assert.equal(loggedOutIdentity.ok, false, 'logged-out Java proxy exposed another account identity');
    assert.match(String(loggedOutIdentity.error || ''), /login required/i);
  } finally {
    if (app.exitCode === null) app.kill();
    await once(app, 'exit').catch(() => {});
  }
  console.log(output);
} finally {
  if (server.exitCode === null) server.kill();
  await once(server, 'exit').catch(() => {});
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
