import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const jar = path.join(root, 'out', 'fe-monster-java.jar');
const fixtureRoot = path.join(root, 'scripts', 'fixtures', 'wallpaper-engine');
const dataDir = mkdtempSync(path.join(tmpdir(), 'fe-monster-wallpaper-http-'));
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const javaHomes = [
  'E:\\java26',
  'D:\\java26',
  'C:\\java26',
  process.env.FE_JAVA26_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME
].filter(Boolean);

function javaExecutable() {
  for (const home of javaHomes) {
    const candidate = path.join(home, 'bin', 'java.exe');
    if (existsSync(candidate)) return candidate;
  }
  return 'java.exe';
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function request(port, requestPath, host = `127.0.0.1:${port}`) {
  return new Promise((resolve, reject) => {
    const requestHandle = http.request({
      hostname: '127.0.0.1',
      port,
      path: requestPath,
      headers: { Host: host }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    });
    requestHandle.on('error', reject);
    requestHandle.end();
  });
}

async function waitForCatalog(port, child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited with code ${child.exitCode}`);
    try {
      const response = await request(port, '/api/wallpapers?scan=true');
      if (response.status === 200) return JSON.parse(response.body.toString('utf8'));
    } catch {
      // Server is still starting.
    }
    await delay(100);
  }
  throw new Error('wallpaper fixture server did not start');
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(700)
  ]);
  if (child.exitCode === null && process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
  }
}

if (!existsSync(jar)) throw new Error(`Build output is missing: ${jar}`);

const port = await freePort();
const child = spawn(javaExecutable(), ['-jar', jar, '--no-client'], {
  cwd: root,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    FE_MONSTER_PORT: String(port),
    FE_MONSTER_BIND: '127.0.0.1',
    FE_MONSTER_ROOT: root,
    FE_MONSTER_WEB_ROOT: path.join(root, 'web'),
    FE_MONSTER_DATA_DIR: dataDir,
    FE_WALLPAPER_ENGINE_ROOT: fixtureRoot
  }
});

let serverOutput = '';
child.stdout.on('data', (chunk) => {
  if (serverOutput.length < 8000) serverOutput += chunk;
});
child.stderr.on('data', (chunk) => {
  if (serverOutput.length < 8000) serverOutput += chunk;
});

try {
  const payload = await waitForCatalog(port, child);
  const wallpapers = Array.isArray(payload.wallpapers) ? payload.wallpapers : [];
  const web = wallpapers.find((item) => item.name === 'Fixture Web Wallpaper');
  const video = wallpapers.find((item) => item.name === 'Fixture Manifest Video');
  const scene = wallpapers.find((item) => item.name === 'Fixture Native Scene');
  if (!web || !video || !scene) throw new Error('fixture catalog is incomplete');

  const entry = await request(port, web.entryUrl);
  const location = String(entry.headers.location || '');
  const isolatedUrl = new URL(location);
  const isolatedHost = `wallpaper.localhost:${port}`;
  const html = await request(port, isolatedUrl.pathname, isolatedHost);
  const css = await request(
    port,
    isolatedUrl.pathname.replace('/index.html', '/assets/theme.css'),
    isolatedHost
  );
  const isolatedApi = await request(port, '/api/app/version', isolatedHost);
  const normalOriginResource = await request(port, isolatedUrl.pathname);
  const traversal = await request(
    port,
    `/api/wallpapers/web/${web.projectKey}/%2e%2e/project.json`,
    isolatedHost
  );
  const videoUrl = new URL(video.entryUrl, `http://127.0.0.1:${port}`);
  const videoPath = String(videoUrl.searchParams.get('path') || '').replaceAll('\\', '/');
  const videoResponse = await request(port, videoUrl.pathname + videoUrl.search);

  const checks = {
    entryRedirectsToIsolatedOrigin:
      entry.status === 302
        && isolatedUrl.hostname === 'wallpaper.localhost'
        && Number(isolatedUrl.port) === port,
    htmlAndRelativeCssAreServed:
      html.status === 200
        && String(html.headers['content-type']).startsWith('text/html')
        && html.body.toString('utf8').includes('Fixture web wallpaper')
        && css.status === 200
        && String(css.headers['content-type']).startsWith('text/css'),
    isolatedOriginIsSandboxed:
      Boolean(html.headers['content-security-policy'])
        && html.headers['x-content-type-options'] === 'nosniff'
        && !html.headers['access-control-allow-origin'],
    isolatedOriginCannotCallAppApi: isolatedApi.status === 403,
    webResourcesRejectWrongOriginAndTraversal:
      normalOriginResource.status === 403 && traversal.status !== 200,
    videoUsesManifestMedia:
      videoResponse.status === 200
        && String(videoResponse.headers['content-type']).startsWith('video/mp4')
        && videoPath.endsWith('/media/manifest-video.mp4'),
    sceneStaysNative:
      scene.kind === 'scene'
        && scene.requiresNativeEngine === true
        && scene.engineLaunch?.webViewRenderable === false
        && String(scene.engineLaunch?.entryFile || '').endsWith('scene.pkg')
  };
  const pass = Object.values(checks).every(Boolean);
  process.stdout.write(`${JSON.stringify({ pass, checks })}\n`);
  if (!pass) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.stack || error}\n${serverOutput}\n`);
  process.exitCode = 1;
} finally {
  await stopServer(child);
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
