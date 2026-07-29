import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const tempRoot = mkdtempSync(path.join(tmpdir(), 'fe-monster-user-cursor-'));
const classes = path.join(tempRoot, 'classes');
const dataDir = path.join(tempRoot, 'data');
const javaHomes = [
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

function run(command, args, allowFailure = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${command} failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

try {
  mkdirSync(classes, { recursive: true });
  const sources = [
    'src/main/java/com/femonster/json/SimpleJson.java',
    'src/main/java/com/femonster/core/UserCursorService.java',
    'scripts/java/com/femonster/core/UserCursorServiceProbe.java'
  ].map((relativePath) => path.join(root, relativePath));
  const compile = run(
    executable('javac'),
    ['-encoding', 'UTF-8', '--release', '17', '-d', classes, ...sources],
    true
  );
  assert.equal(compile.status, 0, `user cursor service must compile:\n${compile.stderr}`);

  const execution = run(
    executable('java'),
    ['-Djava.awt.headless=true', '-cp', classes, 'com.femonster.core.UserCursorServiceProbe', dataDir],
    true
  );
  assert.equal(execution.status, 0, execution.stderr || execution.stdout);
  const report = JSON.parse(execution.stdout.trim().split(/\r?\n/).at(-1) || '{}');
  assert.equal(report.pass, true, JSON.stringify(report));

  const html = readFileSync(path.join(root, 'web/index.html'), 'utf8');
  const app = readFileSync(path.join(root, 'web/app.js'), 'utf8');
  const routes = readFileSync(path.join(root, 'src/main/java/com/femonster/api/ApiRoutes.java'), 'utf8');
  assert.match(html, /id="cursorImportInput"[^>]*accept="image\/png,image\/jpeg,image\/webp,image\/gif"/);
  assert.match(html, /id="cursorImportButton"/);
  assert.match(html, /<option value="system">系统自动<\/option>/);
  assert.match(app, /MAX_CURSOR_IMPORT_BYTES\s*=\s*4\s*\*\s*1024\s*\*\s*1024/);
  assert.match(app, /MAX_CURSOR_SOURCE_DIMENSION\s*=\s*2048/);
  assert.match(app, /createImageBitmap\(file/);
  assert.match(app, /canvas\.toBlob\([^)]*'image\/png'/s);
  assert.match(app, /GIF[\s\S]*?静态首帧/);
  assert.match(app, /refreshUserCursors\(\)/);
  assert.match(routes, /"\/api\/user-cursors"/);
  assert.match(routes, /"\/api\/user-cursors\/import"/);
  assert.match(routes, /"\/api\/user-cursors\/file"/);

  console.log(JSON.stringify({ pass: true, checks: report.checks }));
} finally {
  rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
