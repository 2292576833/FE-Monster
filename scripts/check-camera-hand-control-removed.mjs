import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.cwd());
const payloadFlag = process.argv.indexOf('--payload-root');
const payloadRoot = payloadFlag >= 0 && process.argv[payloadFlag + 1]
  ? path.resolve(process.argv[payloadFlag + 1])
  : '';

const forbiddenFiles = [
  'scripts/gesture_control.py',
  'scripts/gesture-requirements.txt',
  'scripts/check-gesture-runtime-packaging.ps1',
  'src/main/java/com/femonster/core/GestureControlService.java'
];

const forbiddenSourcePatterns = [
  ['gestureControl setting', /\bgestureControl\b/i],
  ['gesture camera setting', /\bgestureCamera(?:Source)?\b/i],
  ['gesture service status', /\bgestureStatus\b/i],
  ['gesture service class', /GestureControlService/],
  ['gesture API route', /\/api\/app\/gesture/i],
  ['gesture process environment', /FE_GESTURE_/i],
  ['gesture Python controller', /gesture_control\.py/i],
  ['gesture dependency manifest', /gesture-requirements/i],
  ['MediaPipe dependency', /\bmediapipe\b/i],
  ['PyAutoGUI dependency', /\bpyautogui\b/i],
  ['PyGrabber dependency', /\bpygrabber\b/i],
  ['OpenCV gesture dependency', /opencv-(?:contrib-)?python/i],
  ['gesture Python staging', /(?:Stage|Test|Ensure|Sync)-GesturePython/i],
  ['bundled gesture site-packages', /runtime[\\/]+python-site-packages/i],
  ['bundled gesture Python executable', /runtime[\\/]+python[\\/]+python\.exe/i]
];

const ignoredDirectories = new Set([
  '.git', '.venv-gesture', 'dist', 'node_modules', 'out', 'target'
]);
const ignoredFiles = new Set([
  path.normalize('scripts/check-camera-hand-control-removed.mjs')
]);
const scannedExtensions = new Set([
  '.css', '.html', '.java', '.js', '.json', '.md', '.mjs', '.plist',
  '.ps1', '.py', '.sh', '.txt', '.xml'
]);

function sourceFiles(directory, relative = '') {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const nextRelative = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(absolute, nextRelative));
      continue;
    }
    if (!entry.isFile() || ignoredFiles.has(nextRelative)) continue;
    if (scannedExtensions.has(path.extname(entry.name).toLowerCase())) files.push([absolute, nextRelative]);
  }
  return files;
}

const failures = [];
for (const relative of forbiddenFiles) {
  if (fs.existsSync(path.join(root, relative))) failures.push(`forbidden feature file remains: ${relative}`);
}

const scanRoots = [
  'web', 'src', 'scripts', 'native/windows'
];
const sourceEntries = scanRoots.flatMap((relative) => {
  const absolute = path.join(root, relative);
  return fs.existsSync(absolute) ? sourceFiles(absolute, relative) : [];
});
for (const relative of ['.gitignore', 'README.md', 'PRODUCT.md', 'PROJECT_STATUS.md', 'UPDATE.md', '功能介绍.md', '更新日志.md']) {
  const absolute = path.join(root, relative);
  if (fs.existsSync(absolute)) sourceEntries.push([absolute, relative]);
}

for (const [absolute, relative] of sourceEntries) {
  const source = fs.readFileSync(absolute, 'utf8');
  for (const [label, pattern] of forbiddenSourcePatterns) {
    if (pattern.test(source)) failures.push(`${label} remains in ${relative}`);
  }
}

if (payloadRoot) {
  for (const relative of ['runtime/python', 'runtime/python-site-packages']) {
    if (fs.existsSync(path.join(payloadRoot, relative))) {
      failures.push(`staged payload retains removed dependency tree: ${relative}`);
    }
  }
}

if (failures.length) {
  console.error('Camera hand-control removal: FAILED');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log('Camera hand-control removal: OK');
