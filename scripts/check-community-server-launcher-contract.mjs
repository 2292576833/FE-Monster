import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('scripts/start-community-server.ps1', 'utf8');

assert.match(source, /\[Environment\]::GetEnvironmentVariable\('Path',\s*'Process'\)/,
  'launcher must snapshot the effective process PATH');
assert.match(source, /SetEnvironmentVariable\('PATH',\s*\$null,\s*'Process'\)/,
  'launcher must remove duplicate PATH casing before Start-Process');
assert.match(source, /SetEnvironmentVariable\('Path',\s*\$processPath,\s*'Process'\)/,
  'launcher must restore one canonical Path value');
assert.match(source, /Start-Process[\s\S]{0,420}?-WindowStyle Hidden/,
  'community service must start without flashing a command window');

console.log('Community server launcher contract PASS');
