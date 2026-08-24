import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scratch = path.join(root, '.tmp', `community-sse-proxy-${process.pid}`);
const classes = path.join(scratch, 'classes');
const candidates = [
  'C:\\Program Files\\Java\\jdk-17',
  process.env.FE_TEST_JAVA_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME,
  path.join(root, 'runtime', 'java')
].filter(Boolean);
const java = candidates.map((home) => path.join(home, 'bin', 'java.exe')).find(existsSync) || 'java';
const javac = candidates.map((home) => path.join(home, 'bin', 'javac.exe')).find(existsSync) || 'javac';

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'));
  }
  return result.stdout.trim();
}

rmSync(scratch, { recursive: true, force: true });
mkdirSync(classes, { recursive: true });
try {
  run(javac, [
    '-encoding', 'UTF-8',
    '--release', '17',
    '-d', classes,
    path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'api', 'SseProxyPump.java'),
    path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'api', 'SseProxyPumpProbe.java')
  ]);
  const output = run(java, ['-cp', classes, 'com.femonster.api.SseProxyPumpProbe']);
  process.stdout.write(`${output}\n`);
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
