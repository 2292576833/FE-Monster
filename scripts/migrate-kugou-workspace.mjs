import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tempRoot = mkdtempSync(path.join(tmpdir(), 'fe-monster-kugou-workspace-'));
const classes = path.join(tempRoot, 'classes');
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

function latestJar() {
  const out = path.join(root, 'out');
  return readdirSync(out)
    .filter((name) => /^fe-monster-java-.*\.jar$/i.test(name))
    .map((name) => path.join(out, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0];
}

try {
  const jar = latestJar();
  if (!jar) throw new Error('Build the Java application before migration.');
  mkdirSync(classes, { recursive: true });
  const compile = spawnSync(executable('javac'), [
    '-encoding',
    'UTF-8',
    '--release',
    '17',
    '-cp',
    jar,
    '-d',
    classes,
    path.join(root, 'scripts', 'java', 'KugouWorkspaceMigration.java')
  ], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (compile.error) throw compile.error;
  if (compile.status !== 0) {
    process.stdout.write(compile.stdout || '');
    process.stderr.write(compile.stderr || '');
    process.exit(compile.status || 1);
  }

  const run = spawnSync(executable('java'), [
    '--enable-native-access=ALL-UNNAMED',
    '-cp',
    `${classes};${jar}`,
    'com.femonster.music.KugouWorkspaceMigration'
  ], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      FE_MONSTER_ROOT: root,
      FE_MUSIC_API_AUTOSTART: '0'
    },
    timeout: 30000
  });
  if (run.error) throw run.error;
  if (run.stderr) process.stderr.write(run.stderr);
  if (run.stdout) process.stdout.write(run.stdout);
  process.exitCode = run.status || 0;
} finally {
  rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
