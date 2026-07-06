const fs = require('fs');
const os = require('os');
const path = require('path');

async function main() {
  const apiRoot = fs.realpathSync(path.resolve(__dirname, '..', 'node_modules', 'NeteaseCloudMusicApi'));
  ensureExpressRouterDependency(apiRoot);
  const generateConfig = require(path.join(apiRoot, 'generateConfig'));
  const { serveNcmApi } = require(path.join(apiRoot, 'server'));
  const tokenPath = path.resolve(os.tmpdir(), 'anonymous_token');

  if (!fs.existsSync(tokenPath)) fs.writeFileSync(tokenPath, '', 'utf8');
  await generateConfig();
  await serveNcmApi({
    port: Number(process.env.PORT || '3010'),
    host: process.env.HOST || '127.0.0.1',
    checkVersion: false
  });
}

function ensureExpressRouterDependency(apiRoot) {
  const expressRoot = path.dirname(require.resolve('express/package.json', { paths: [apiRoot] }));
  if (pathToRegexpIsCompatible(expressRoot)) return;

  const dependencyRoot = findPnpmDependency('path-to-regexp@0.1');
  if (!dependencyRoot) return;

  const localNodeModules = path.join(expressRoot, 'node_modules');
  const localDependency = path.join(localNodeModules, 'path-to-regexp');
  fs.mkdirSync(localNodeModules, { recursive: true });
  if (!fs.existsSync(localDependency)) {
    fs.symlinkSync(dependencyRoot, localDependency, 'junction');
  }
}

function pathToRegexpIsCompatible(expressRoot) {
  try {
    const resolved = require.resolve('path-to-regexp', { paths: [expressRoot] });
    return typeof require(resolved) === 'function';
  } catch (error) {
    return false;
  }
}

function findPnpmDependency(prefix) {
  const pnpmRoot = path.resolve(__dirname, '..', 'node_modules', '.pnpm');
  if (!fs.existsSync(pnpmRoot)) return '';
  const match = fs.readdirSync(pnpmRoot).find((name) => name.startsWith(prefix));
  if (!match) return '';
  const dependencyRoot = path.join(pnpmRoot, match, 'node_modules', prefix.split('@').slice(0, -1).join('@'));
  return fs.existsSync(dependencyRoot) ? dependencyRoot : '';
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
