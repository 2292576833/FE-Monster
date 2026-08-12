import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');

assert.match(
  app,
  /function accountVipStatusLabel\(payload = \{\}\)[\s\S]*?vipStatus[\s\S]*?VIP (?:\u72b6\u6001\u672a\u77e5|\\u72b6\\u6001\\u672a\\u77e5)/,
  'QQ and Kugou accounts need an explicit active/inactive/unknown VIP label'
);
assert.match(
  app,
  /const showVipStatus = loggedIn && \['qq', 'kugou'\]\.includes\(provider\.id\)/,
  'the QQ and Kugou login identity must display VIP status while logged in'
);
assert.match(
  app,
  /els\.loginVipBadge\.textContent = accountVipStatusLabel\(payload\)/,
  'the login VIP badge must render the normalized provider status'
);
assert.match(
  app,
  /els\.loginVipBadge\.dataset\.vipStatus = accountVipStatus\(payload\)/,
  'the VIP badge needs a stable state for active/inactive/unknown styling'
);

console.log('Provider VIP status display contract PASS');
