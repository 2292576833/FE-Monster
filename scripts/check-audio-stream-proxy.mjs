import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tempRoot = mkdtempSync(path.join(tmpdir(), 'fe-monster-audio-stream-proxy-'));
const classes = path.join(tempRoot, 'classes');
const sources = [
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'json', 'SimpleJson.java'),
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'http', 'HttpUtil.java'),
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'api', 'AudioStreamProxy.java'),
  path.join(root, 'scripts', 'java', 'com', 'femonster', 'api', 'AudioStreamProxyFixtureProbe.java')
];
const javaHomes = [
  path.join(root, 'runtime', 'java'),
  'E:\\java26',
  'D:\\java26',
  'C:\\java26',
  process.env.FE_JAVA26_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME
].filter(Boolean);

function executable(name) {
  for (const home of javaHomes) {
    const candidate = path.join(home, 'bin', `${name}.exe`);
    if (existsSync(candidate)) return candidate;
  }
  return `${name}.exe`;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

try {
  mkdirSync(classes, { recursive: true });
  run(executable('javac'), ['-encoding', 'UTF-8', '--release', '17', '-d', classes, ...sources]);
  const result = run(executable('java'), [
    '-cp',
    classes,
    'com.femonster.api.AudioStreamProxyFixtureProbe'
  ]);
  if (result.stderr) process.stderr.write(result.stderr);
  const report = JSON.parse(result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || '{}');
  const proxySource = readFileSync(sources[2], 'utf8');
  const routeSource = readFileSync(
    path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'api', 'ApiRoutes.java'),
    'utf8'
  );
  report.checks ??= {};
  report.checks.streamsWithoutBuffering =
    /BodyHandlers\.ofInputStream\(\)/.test(proxySource)
      && /input\.transferTo\(output\)/.test(proxySource)
      && !/BodyHandlers\.ofByteArray|readAllBytes\(/.test(proxySource);
  report.checks.routeRegistered =
    /["']\/api\/audio\/stream["']/.test(routeSource)
      && /audioStreamProxy\.handle\(exchange,\s*query\)/.test(routeSource);
  report.pass = Boolean(report.pass) && Object.values(report.checks).every(Boolean);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.pass) process.exitCode = 1;
} finally {
  rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
