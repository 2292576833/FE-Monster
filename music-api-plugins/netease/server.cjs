'use strict';

require('./safe-log.cjs').installSafeLogging();

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const pluginRoot = __dirname;
const runtimeArchive = path.join(pluginRoot, 'runtime.tgz');
const runtimeMetadataPath = path.join(pluginRoot, 'plugin-runtime.json');
const runtimeDirectory = path.join(pluginRoot, '.runtime');
const readyMarker = path.join(runtimeDirectory, '.fe-runtime-sha256');

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').toUpperCase();
}

function expectedArchiveSha256() {
  const metadata = JSON.parse(fs.readFileSync(runtimeMetadataPath, 'utf8').replace(/^\uFEFF/, ''));
  const value = String(metadata.archiveSha256 || '').trim().toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(value)) throw new Error('Netease API runtime metadata is invalid.');
  return value;
}

function runtimeReady(archiveSha256) {
  try {
    return fs.readFileSync(readyMarker, 'utf8').trim() === archiveSha256
      && fs.existsSync(path.join(runtimeDirectory, 'node_modules', 'NeteaseCloudMusicApi', 'package.json'));
  } catch {
    return false;
  }
}

function prepareRuntime() {
  const expected = expectedArchiveSha256();
  const actual = fileSha256(runtimeArchive);
  if (actual !== expected) throw new Error('Netease API runtime archive failed its SHA-256 integrity check.');
  if (runtimeReady(actual)) return;

  const stagingDirectory = path.join(pluginRoot, `.runtime-installing-${process.pid}`);
  const backupDirectory = path.join(pluginRoot, `.runtime-replaced-${process.pid}`);
  fs.rmSync(stagingDirectory, { recursive: true, force: true });
  fs.rmSync(backupDirectory, { recursive: true, force: true });
  fs.mkdirSync(stagingDirectory, { recursive: true });

  const windowsTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  const tar = process.platform === 'win32' && fs.existsSync(windowsTar) ? windowsTar : 'tar';
  const extracted = spawnSync(tar, ['-xzf', runtimeArchive, '-C', stagingDirectory], {
    cwd: pluginRoot,
    encoding: 'utf8',
    windowsHide: true
  });
  if (extracted.status !== 0) {
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
    throw new Error(`Netease API runtime extraction failed: ${(extracted.stderr || extracted.stdout || '').trim()}`);
  }

  const stagedPackage = path.join(stagingDirectory, 'node_modules', 'NeteaseCloudMusicApi', 'package.json');
  if (!fs.existsSync(stagedPackage)) {
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
    throw new Error('Netease API runtime archive does not contain the expected package.');
  }
  fs.writeFileSync(path.join(stagingDirectory, '.fe-runtime-sha256'), actual, 'ascii');

  if (fs.existsSync(runtimeDirectory)) fs.renameSync(runtimeDirectory, backupDirectory);
  try {
    fs.renameSync(stagingDirectory, runtimeDirectory);
    fs.rmSync(backupDirectory, { recursive: true, force: true });
  } catch (error) {
    fs.rmSync(stagingDirectory, { recursive: true, force: true });
    if (fs.existsSync(backupDirectory) && !fs.existsSync(runtimeDirectory)) {
      fs.renameSync(backupDirectory, runtimeDirectory);
    }
    throw error;
  }
}

async function main() {
  prepareRuntime();
  const apiRoot = fs.realpathSync(path.join(runtimeDirectory, 'node_modules', 'NeteaseCloudMusicApi'));
  const generateConfig = require(path.join(apiRoot, 'generateConfig.js'));
  const { serveNcmApi } = require(path.join(apiRoot, 'server.js'));
  const { generateRandomChineseIP } = require(path.join(apiRoot, 'util', 'index.js'));
  const anonymousToken = path.join(os.tmpdir(), 'anonymous_token');

  if (!fs.existsSync(anonymousToken)) fs.writeFileSync(anonymousToken, '', 'utf8');
  global.cnIp = generateRandomChineseIP();
  const app = await serveNcmApi({
    port: Number(process.env.PORT || '3010'),
    host: process.env.HOST || '127.0.0.1',
    checkVersion: false
  });
  app.get('/health', (_request, response) => {
    response.status(200).json({
      ok: true,
      provider: 'netease',
      version: '4.32.0'
    });
  });
  void generateConfig();
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
