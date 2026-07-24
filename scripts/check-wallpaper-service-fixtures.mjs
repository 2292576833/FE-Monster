import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const jar = path.join(root, 'out', 'fe-monster-java.jar');
const fixtureRoot = path.join(root, 'scripts', 'fixtures', 'wallpaper-engine');
const probeSource = path.join(root, 'scripts', 'java', 'com', 'femonster', 'core', 'WallpaperServiceFixtureProbe.java');
const routesSource = path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'api', 'ApiRoutes.java');
const tempRoot = mkdtempSync(path.join(tmpdir(), 'fe-monster-wallpaper-fixture-'));
const classes = path.join(tempRoot, 'classes');
const dataDir = path.join(tempRoot, 'data');

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
  run(executable('javac'), ['-encoding', 'UTF-8', '-cp', jar, '-d', classes, probeSource]);
  const classPath = `${classes}${path.delimiter}${jar}`;
  const result = run(
    executable('java'),
    ['-cp', classPath, 'com.femonster.core.WallpaperServiceFixtureProbe', fixtureRoot, dataDir],
    {
      allowFailure: true,
      env: {
        ...process.env,
        FE_WALLPAPER_ENGINE_ROOT: fixtureRoot
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
