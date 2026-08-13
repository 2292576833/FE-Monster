import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = path.join(root, 'download-site');
const vinextCli = path.join(siteRoot, 'node_modules', 'vinext', 'dist', 'cli.js');

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function get(port, pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: pathname }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.once('error', reject);
  });
}

const port = await freePort();
const server = spawn(process.execPath, [vinextCli, 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: siteRoot,
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe']
});

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('download site startup timed out')), 10000);
    const probe = async () => {
      try {
        const response = await get(port, '/');
        if (response.status === 200) {
          clearTimeout(timer);
          resolve();
          return;
        }
      } catch {}
      setTimeout(probe, 100);
    };
    probe();
    server.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`download site exited early: ${code}`));
    });
  });

  const home = await get(port, '/');
  assert.equal(home.status, 200);
  assert.match(home.body, /FE Monster/i);
  assert.match(home.body, /FE-Monster-Setup-2\.0\.1\.exe/i);

  const robots = await get(port, '/robots.txt');
  assert.equal(robots.status, 200);
  assert.match(robots.body, /Allow:\s*\//i);
  assert.doesNotMatch(robots.body, /Disallow:\s*\//i);

  console.log(JSON.stringify({ ok: true, localDownloadOrigin: `http://127.0.0.1:${port}` }, null, 2));
} finally {
  server.kill();
}
