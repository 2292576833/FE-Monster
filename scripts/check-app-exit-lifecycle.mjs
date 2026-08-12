import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

const program = read('native/windows/winforms/Program.cs');
const form = read('native/windows/winforms/FeMonsterForm.cs');
const app = read('src/main/java/com/femonster/FeMonsterJavaApp.java');
const routes = read('src/main/java/com/femonster/api/ApiRoutes.java');
const context = read('src/main/java/com/femonster/core/AppContext.java');

assert.match(
  program,
  /new\(ClientOptions\.Parse\(clientArgs\),\s*backend is not null\)/,
  'the native form must know when the backend process is owned by Program',
);
assert.match(
  form,
  /if \(!ownsBackendProcess\)\s*\{[\s\S]{0,180}RequestServerQuitAsync/,
  'an owned backend must receive its single quit request from BackendHost.Dispose',
);
assert.match(
  form,
  /RunShutdownStep\([\s\S]{0,1000}desktopPetHost\.Dispose[\s\S]{0,1000}desktopSceneHost\.Dispose/,
  'native auxiliary windows must be closed with best-effort exception isolation',
);

assert.match(
  app,
  /newCachedThreadPool\([\s\S]{0,260}setDaemon\(true\)/,
  'HTTP request workers must not keep the JVM alive after backend lifetime closes',
);
assert.match(
  routes,
  /AtomicBoolean\s+quitRequested/,
  'the Java quit endpoint must keep an atomic single-flight guard',
);
assert.match(
  routes,
  /quitRequested\.compareAndSet\(false, true\)/,
  'the Java quit endpoint must claim its shutdown exactly once',
);
assert.doesNotMatch(
  routes,
  /cleanupBackgroundServices|stop-stale-fe-monster\.ps1/,
  'normal app shutdown must not launch the broad stale-process/update killer',
);
assert.match(
  routes,
  /try\s*\{[\s\S]{0,300}context\.close\(\)[\s\S]{0,300}finally\s*\{[\s\S]{0,120}System\.exit\(0\)/,
  'Java shutdown must always reach System.exit even when a service close fails',
);

assert.match(
  context,
  /closeService\("player"[\s\S]{0,500}closeService\("audio"[\s\S]{0,500}closeService\("browserLogin"[\s\S]{0,500}closeService\("musicApis"/,
  'AppContext must attempt every owned service cleanup independently',
);

console.log(JSON.stringify({
  pass: true,
  nativeQuitOwner: 'single',
  javaQuit: 'single-flight',
  serviceCleanup: 'best-effort-all',
  broadShutdownScript: 'removed',
  httpWorkers: 'daemon',
}, null, 2));
