import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const serverRoot = path.resolve(root, '..', 'FE moster server');
const scratch = mkdtempSync(path.join(os.tmpdir(), 'fe-community-java-enrollment-'));
const serverData = path.join(scratch, 'server-data');
const clientRoot = path.join(scratch, 'client');
const clientData = path.join(clientRoot, 'data');
const testClasses = path.join(scratch, 'classes');
const mainClasses = path.join(root, 'out', 'classes');
mkdirSync(serverData, { recursive: true });
mkdirSync(clientData, { recursive: true });
mkdirSync(testClasses, { recursive: true });

const homes = [
  'C:\\Program Files\\Java\\jdk-17',
  process.env.FE_TEST_JAVA_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME,
  path.join(root, 'runtime', 'java')
].filter(Boolean);
const java = homes.map((home) => path.join(home, 'bin', 'java.exe')).find(existsSync) || 'java';
const javac = homes.map((home) => path.join(home, 'bin', 'javac.exe')).find(existsSync) || 'javac';

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
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', timeout: 30_000, windowsHide: true });
  if (result.status !== 0) throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'));
  return result.stdout.trim();
}

const port = await freePort();
let serverOutput = '';
const server = spawn(process.execPath, [path.join(serverRoot, 'server.js')], {
  cwd: serverRoot,
  env: {
    ...process.env,
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
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`server exited early\n${serverOutput}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      const body = await response.json();
      if (response.ok && body.service === 'fe-monster-community') break;
    } catch {}
    if (attempt === 79) throw new Error(`server startup timed out\n${serverOutput}`);
    await new Promise((resolve) => setTimeout(resolve, 40));
  }

  run(javac, [
    '-encoding', 'UTF-8', '--release', '17', '-cp', mainClasses, '-d', testClasses,
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'core', 'CommunityDeviceEnrollmentIntegrationProbe.java')
  ]);
  const output = run(java, [
    '-cp', `${testClasses}${path.delimiter}${mainClasses}`,
    'com.femonster.core.CommunityDeviceEnrollmentIntegrationProbe',
    path.join(clientData, 'community-server-url.txt'),
    `http://127.0.0.1:${port}`
  ], {
    ...process.env,
    FE_MONSTER_ROOT: clientRoot,
    FE_MONSTER_DATA_DIR: clientData,
    FE_MONSTER_COMMUNITY_URL: ''
  });
  assert.match(output, /CommunityDeviceEnrollmentIntegrationProbe passed/);

  const database = JSON.parse(readFileSync(path.join(serverData, 'community-db.json'), 'utf8'));
  assert.equal(Object.keys(database.deviceCredentials || {}).length, 2,
    'credential rotation did not retain both independently signed device keys');
  assert.equal(Object.keys(database.users || {}).length, 1, 'client reload registered a duplicate account');
  console.log(output);
} finally {
  server.kill();
  await once(server, 'exit').catch(() => {});
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
