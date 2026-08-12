import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const serverFile = path.resolve(root, '..', 'FE moster server', 'server.js');
const source = readFileSync(serverFile, 'utf8');

const registerFields = source.match(/"\/api\/community\/register"\s*:\s*\[([\s\S]*?)\]/)?.[1] || '';
const profileFields = source.match(/"\/api\/community\/profile"\s*:\s*\[([\s\S]*?)\]/)?.[1] || '';

assert.match(registerFields, /"avatarOrnament"/, 'register must accept avatarOrnament');
assert.match(profileFields, /"avatarOrnament"/, 'profile update must accept avatarOrnament');
assert.match(source, /function\s+normalizeAvatarOrnament\s*\(/,
  'server must normalize avatar ornaments instead of storing arbitrary JSON');
assert.match(source, /assertPayloadSize\(input\.avatarOrnament,\s*1024,\s*"avatar ornament"\)/,
  'avatar ornament payload must have a bounded size');
assert.match(source, /avatarOrnament:\s*normalizeAvatarOrnament\(user\.avatarOrnament\)/,
  'public community profiles must expose the stored avatar ornament');
assert.match(source, /avatarOrnament:\s*Object\.prototype\.hasOwnProperty\.call\(input,\s*"avatarOrnament"\)/,
  'registration must preserve an existing ornament when the field is absent');
assert.match(source, /if\s*\(Object\.prototype\.hasOwnProperty\.call\(input,\s*"avatarOrnament"\)\)\s*\{[\s\S]*?user\.avatarOrnament\s*=\s*normalizeAvatarOrnament\(input\.avatarOrnament\)/,
  'profile updates must persist equip and unequip operations');

console.log('Community server avatar ornament schema contract PASS');
