import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { VALID_SCENE_PACKAGE_ENTRIES, writeScenePackage } from './wallpaper-scene-fixture-utils.mjs';

const root = path.resolve(import.meta.dirname, '..');
const jar = path.join(root, 'out', 'fe-monster-java.jar');
const fixtureRoot = path.join(root, 'scripts', 'fixtures', 'wallpaper-engine');
const probeSource = path.join(root, 'scripts', 'java', 'com', 'femonster', 'core', 'WallpaperServiceFixtureProbe.java');
const routesSource = path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'api', 'ApiRoutes.java');
const tempRoot = mkdtempSync(path.join(tmpdir(), 'fe-monster-wallpaper-fixture-'));
const classes = path.join(tempRoot, 'classes');
const dataDir = path.join(tempRoot, 'data');
const wallpaperEngineConfig = path.join(tempRoot, 'wallpaper-engine-config.json');
const runtimeFixtureRoot = path.join(tempRoot, 'wallpaper-engine');
const packageSecurityRoot = path.join(tempRoot, 'package-security');
const fakeWallpaperEngineExecutable = path.join(tempRoot, 'wallpaper64.exe');

const javaHomes = [
  'E:\\java26',
  'D:\\java26',
  'C:\\java26',
  process.env.FE_JAVA26_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME
].filter(Boolean);

function executable(name) {
  for (const home of javaHomes) {
    const candidate = path.join(home, 'bin', `${name}.exe`);
    if (existsSync(candidate)) return candidate;
  }
  return `${name}.exe`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    ...options
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

try {
  if (!existsSync(jar)) throw new Error(`Build output is missing: ${jar}`);
  mkdirSync(classes, { recursive: true });
  if (process.platform === 'win32') {
    copyFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'where.exe'), fakeWallpaperEngineExecutable);
  } else {
    writeFileSync(fakeWallpaperEngineExecutable, '#!/bin/sh\nexit 0\n', 'utf8');
    chmodSync(fakeWallpaperEngineExecutable, 0o755);
  }
  cpSync(fixtureRoot, runtimeFixtureRoot, { recursive: true });
  writeScenePackage(
    path.join(runtimeFixtureRoot, 'scene-project', 'scene.pkg'),
    VALID_SCENE_PACKAGE_ENTRIES
  );
  const concurrencyFixtureRoot = path.join(runtimeFixtureRoot, 'scene-project', 'concurrency-fixture');
  mkdirSync(concurrencyFixtureRoot, { recursive: true });
  for (let index = 0; index < 2048; index += 1) {
    writeFileSync(path.join(concurrencyFixtureRoot, `${index}.json`), '{}', 'utf8');
  }
  const packageOnlyRoot = path.join(runtimeFixtureRoot, 'zz-pkg-only-scene');
  mkdirSync(packageOnlyRoot, { recursive: true });
  writeFileSync(path.join(packageOnlyRoot, 'preview.jpg'), Buffer.from('fixture-preview', 'ascii'));
  writeFileSync(path.join(packageOnlyRoot, 'compiled-effect.dxs'), Buffer.from('SHDV0069fixture', 'ascii'));
  writeScenePackage(path.join(packageOnlyRoot, 'scene.pkg'), VALID_SCENE_PACKAGE_ENTRIES, {
    version: 'PKGV0015'
  });
  const invalidSceneManifestRoot = path.join(runtimeFixtureRoot, 'invalid-scene-manifest');
  mkdirSync(invalidSceneManifestRoot, { recursive: true });
  writeFileSync(path.join(invalidSceneManifestRoot, 'project.json'), JSON.stringify({
    title: 'Invalid Scene Manifest With Package',
    type: 'Scene',
    file: '../outside/scene.json'
  }), 'utf8');
  writeScenePackage(
    path.join(invalidSceneManifestRoot, 'scene.pkg'),
    VALID_SCENE_PACKAGE_ENTRIES
  );

  mkdirSync(packageSecurityRoot, { recursive: true });
  writeScenePackage(path.join(packageSecurityRoot, 'traversal.pkg'), [
    { name: '../escape.json', data: '{}' }
  ]);
  writeScenePackage(path.join(packageSecurityRoot, 'duplicate.pkg'), [
    { name: 'scene.json', data: '{}' },
    { name: 'SCENE.JSON', data: '{}' }
  ]);
  writeScenePackage(path.join(packageSecurityRoot, 'out-of-bounds.pkg'), [
    { name: 'scene.json', data: '{}', offset: 0xfffffff0 }
  ]);
  writeScenePackage(path.join(packageSecurityRoot, 'overlap.pkg'), [
    { name: 'first.json', data: '1234', offset: 0 },
    { name: 'second.json', data: '5678', offset: 2 }
  ]);
  writeScenePackage(path.join(packageSecurityRoot, 'invalid-utf8.pkg'), [
    { nameBytes: Buffer.from([0xc3, 0x28]), data: '{}' }
  ]);
  writeScenePackage(path.join(packageSecurityRoot, 'excessive-count.pkg'), [], {
    declaredCount: 8193
  });
  writeScenePackage(path.join(packageSecurityRoot, 'unknown-version.pkg'), [], {
    version: 'PKGV9999'
  });
  writeFileSync(path.join(packageSecurityRoot, 'truncated.pkg'), Buffer.from('PKGV', 'ascii'));

  writeFileSync(wallpaperEngineConfig, JSON.stringify({
    fixtureAccount: {
      general: {
        wallpaperconfig: {
          selectedwallpapers: {
            Monitor0: {
              file: path.join(runtimeFixtureRoot, 'video-project', 'media', 'manifest-video.mp4')
            },
            Monitor1: {
              file: path.join(runtimeFixtureRoot, 'zz-pkg-only-scene', 'scene.pkg')
            }
          }
        }
      }
    }
  }), 'utf8');
  run(executable('javac'), ['-encoding', 'UTF-8', '-cp', jar, '-d', classes, probeSource]);
  const classPath = `${classes}${path.delimiter}${jar}`;
  const result = run(
    executable('java'),
    [
      '-cp', classPath,
      'com.femonster.core.WallpaperServiceFixtureProbe',
      runtimeFixtureRoot,
      dataDir,
      packageSecurityRoot
    ],
    {
      allowFailure: true,
      env: {
        ...process.env,
        FE_WALLPAPER_ENGINE_ROOT: runtimeFixtureRoot,
        FE_WALLPAPER_ENGINE_CONFIG: wallpaperEngineConfig,
        FE_WALLPAPER_ENGINE_EXE: fakeWallpaperEngineExecutable
      }
    }
  );
  if (result.stderr) process.stderr.write(result.stderr);

  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  const report = JSON.parse(lines.at(-1) || '{}');
  const routes = readFileSync(routesSource, 'utf8');
  const routeChecks = {
    webRoutesUseResolvedProjectFiles:
      routes.includes('WALLPAPER_WEB_ENTRY_PREFIX')
        && routes.includes('WALLPAPER_WEB_FILE_PREFIX')
        && routes.includes('resolveWebFile(route.projectKey(), route.relativePath())'),
    webWallpaperUsesIsolatedOrigin:
      routes.includes('wallpaper.localhost')
        && routes.includes('isWallpaperWebHost(exchange)')
        && routes.includes('isolated wallpaper origin'),
    webWallpaperSendsSecurityHeaders:
      routes.includes('Content-Security-Policy')
        && routes.includes('X-Content-Type-Options')
        && routes.includes('Cross-Origin-Resource-Policy')
  };
  Object.assign(report.checks ??= {}, routeChecks);
  report.pass = Boolean(report.pass)
    && (result.status ?? 1) === 0
    && Object.values(routeChecks).every(Boolean);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.pass ? 0 : 1;
} finally {
  rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
