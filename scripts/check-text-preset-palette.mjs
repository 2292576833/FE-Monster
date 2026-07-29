import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Compatibility entry point retained for existing developer workflows.
// Text preset cards were intentionally replaced by one parameterized 3D lyric
// composer, so the former per-preset palette assertions are no longer valid.
const checks = [
  'check-text-composer-ui.mjs',
  'check-playback-lyric-palette.mjs',
  'check-lyric-glitch-motion.mjs'
];

for (const script of checks) {
  const result = spawnSync(process.execPath, [path.join('scripts', script)], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`${script} failed with exit code ${result.status}`);
  }
}

console.log('Parameterized lyric palette compatibility PASS');
