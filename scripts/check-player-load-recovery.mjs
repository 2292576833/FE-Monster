import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(path.join(tmpdir(), 'fe-player-recovery-'));
const classes = path.join(scratch, 'classes'); mkdirSync(classes);
const jdk = ['C:/Program Files/Eclipse Adoptium/jdk-17.0.19.10-hotspot', 'E:/java26', process.env.JAVA_HOME].find(p => p && existsSync(path.join(p, 'bin/javac.exe')));
assert.ok(jdk, 'JDK required');
try {
  const sources = ['json/SimpleJson', 'model/Song', 'model/Playlist', 'music/CommentPayloads', 'music/MusicProviderClient', 'music/PlaybackSource', 'music/MusicProviderRegistry', 'core/PlayerService', 'netease/NeteaseClient'].map(p => path.join(root, 'src/main/java/com/femonster', p + '.java'));
  const probes = ['core/PlayerLoadRecoveryProbe', 'music/NeteasePlaybackRecoveryProbe'];
  const compile = spawnSync(path.join(jdk, 'bin/javac.exe'), ['-encoding','UTF-8','--release','17','-d',classes,...sources,...probes.map(p => path.join(root,'src/test/java/com/femonster',p+'.java'))], { encoding: 'utf8', windowsHide: true });
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);
  for (const probe of probes) {
    const run = spawnSync(path.join(jdk, 'bin/java.exe'), ['-cp',classes,'com.femonster.'+probe.replaceAll('/','.'),path.join(scratch,'data')], { encoding:'utf8',windowsHide:true,timeout:20000 });
    process.stdout.write(run.stdout || ''); process.stderr.write(run.stderr || '');
    assert.equal(run.status, 0, run.error?.message || 'player recovery failed');
  }
} finally {
  assert.ok(path.resolve(scratch).startsWith(path.resolve(tmpdir()) + path.sep));
  rmSync(scratch, { recursive:true, force:true });
}
