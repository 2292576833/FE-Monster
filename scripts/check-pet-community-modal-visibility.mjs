#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../web/pet-assistant.js', import.meta.url), 'utf8');

assert.match(source, /communityProfileDialog/);
assert.match(source, /communityMessageDialog/);
assert.match(source, /communityOverlayOpen/);
assert.match(source, /const blockedByPage\s*=\s*desktopScene[\s\S]*communityOverlayOpen\(\)/);
assert.match(source, /root\.hidden\s*=\s*!pet\.mascotVisible\s*\|\|\s*blockedByPage/);
assert.match(source, /attributeFilter:\s*\['hidden'\]/);

console.log(JSON.stringify({
  ok: true,
  contract: 'desktop pet yields to full community workspaces and returns after close'
}, null, 2));
