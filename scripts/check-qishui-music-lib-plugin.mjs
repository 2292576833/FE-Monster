import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const main = read('music-api-plugins/qishui/main.go');
const goMod = read('music-api-plugins/qishui/go.mod');
const manifest = JSON.parse(read('music-api-plugins/qishui/music-api-package.json'));
const build = read('music-api-plugins/qishui/build.ps1');
const notices = read('music-api-plugins/qishui/THIRD-PARTY-NOTICES.md');
const zipPath = 'dist/plugins/FE-Monster-Qishui-API-Plugin-1.0.0.zip';

assert.equal(manifest.id, 'qishui');
assert.equal(manifest.loginQr, true);
assert.equal(manifest.baseUrl, 'http://127.0.0.1:3013');
assert.equal(manifest.launcher.runtime, 'powershell');
assert.equal(manifest.launcher.entry, 'start.ps1');
assert.match(goMod, /github\.com\/SolitudeKing\/music-lib v0\.0\.0-20260528094804-7a864570e1ca/);
assert.match(main, /soda\.New\(/);
assert.match(main, /soda\.DecryptAudio\(/);
assert.match(main, /http\.ServeContent\(/);
assert.match(main, /extension == "mp4" \|\| extension == "m4a" \|\| extension == "m4s"/);
assert.match(main, /contentType = "audio\/mp4"/);
assert.match(main, /"\/login\/qr\/key"/);
assert.match(main, /"\/login\/qr\/create"/);
assert.match(main, /"\/login\/qr\/check"/);
assert.match(main, /qrcode\.Encode\(/);
assert.match(main, /Status == model\.QRLoginStatusSuccess/);
assert.match(main, /w\.Header\(\)\.Add\("Set-Cookie"/);
assert.doesNotMatch(main, /"cookie"\s*:\s*result\.Cookie/, 'QR login must not expose raw cookie JSON');
assert.match(main, /playlist-search-fallback/);
assert.match(main, /http\.StatusNotImplemented/);
assert.match(build, /7a864570e1ca8ccdb9d44bb57def626b53c33621/);
assert.match(build, /SOURCE\.zip/);
assert.match(notices, /GNU Affero General Public License v3\.0/i);

assert.ok(existsSync(zipPath), 'built Qishui plugin ZIP is missing');
assert.ok(statSync(zipPath).size > 1_000_000, 'built Qishui plugin ZIP is unexpectedly small');
const sha256 = createHash('sha256').update(readFileSync(zipPath)).digest('hex').toUpperCase();
assert.match(sha256, /^[A-F0-9]{64}$/, 'built Qishui plugin SHA-256 is invalid');

console.log(`Qishui music-lib plugin contract PASS ${JSON.stringify({ sha256, bytes: statSync(zipPath).size })}`);
