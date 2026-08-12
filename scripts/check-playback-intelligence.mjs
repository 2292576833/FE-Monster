import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(root, 'web', 'playback-intelligence.js'), 'utf8');

const storageValues = new Map();
const playlistPlays = [];
const automatedCommands = [];
let currentIdentity = 'netease:fixture-user';
const window = {};
vm.runInNewContext(source, { window }, { filename: 'playback-intelligence.js' });

const intelligence = window.FeMonsterPlaybackIntelligence.create({
  player: {
    snapshot() {
      return {
        song: { id: 'song-1', name: 'Signal', artist: 'FE' },
        playing: true,
        positionSeconds: 37.25,
        durationSeconds: 100,
        queueIndex: 2,
        queueLength: 9
      };
    },
    queuePage(cursor, limit) {
      const songs = Array.from({ length: 9 }, (_, index) => ({ id: `song-${index + 1}`, name: `Track ${index + 1}` }));
      return {
        items: songs.slice(cursor, cursor + limit),
        total: songs.length,
        queueIndex: 2,
        queueRevision: 7
      };
    }
  },
  playlists: {
    async list() {
      return [
        { id: 'pl-1', name: 'Focus', provider: 'netease' },
        { id: 'pl-2', name: 'Night', provider: 'qq' },
        { id: 'pl-3', name: 'Night', provider: 'kugou' }
      ];
    },
    async tracks(playlist) {
      return Array.from({ length: 4 }, (_, index) => ({
        id: `${playlist.id}-track-${index + 1}`,
        name: `${playlist.name} ${index + 1}`,
        provider: playlist.provider
      }));
    },
    async play(playlist, tracks, index) {
      playlistPlays.push({ playlist, tracks, index });
      return { started: tracks[index], index };
    }
  },
  storage: {
    getItem(key) { return storageValues.get(key) ?? null; },
    setItem(key, value) { storageValues.set(key, String(value)); }
  },
  commandBus: {
    async execute(command, parameters, context) {
      automatedCommands.push({ command, parameters, context });
      return { ok: true };
    }
  },
  identity: () => currentIdentity
});

assert.deepEqual(
  JSON.parse(JSON.stringify(intelligence.snapshot())),
  {
    song: { id: 'song-1', name: 'Signal', artist: 'FE' },
    playing: true,
    positionSeconds: 37.25,
    durationSeconds: 100,
    remainingSeconds: 62.75,
    progress: 0.3725,
    queueIndex: 2,
    queueLength: 9
  },
  'snapshot should use the live player clock instead of a delayed backend poll'
);

assert.deepEqual(
  JSON.parse(JSON.stringify(await intelligence.execute('queue.query', { cursor: 3, limit: 2 }))),
  {
    items: [
      { id: 'song-4', name: 'Track 4' },
      { id: 'song-5', name: 'Track 5' }
    ],
    total: 9,
    cursor: 3,
    limit: 2,
    nextCursor: '5',
    queueIndex: 2,
    queueRevision: 7
  },
  'queue queries should return a compact deterministic page'
);

const playlistPage = await intelligence.execute('playlist.query', { query: 'focus', cursor: 0, limit: 5 });
assert.equal(playlistPage.total, 1);
assert.equal(playlistPage.items[0].id, 'pl-1');
assert.equal(playlistPage.nextCursor, null);

const compatiblePlaylistPage = await intelligence.execute('music.playlist.query', { query: 'focus', limit: 5 });
assert.equal(compatiblePlaylistPage.total, 1, 'server-facing playlist query alias should execute');
assert.equal(compatiblePlaylistPage.items[0].id, 'pl-1');

const playlistPlay = await intelligence.execute('playlist.play', { playlist: 'pl-1', index: 1 });
assert.equal(playlistPlay.started.id, 'pl-1-track-2');
assert.equal(playlistPlays.length, 1);
assert.equal(playlistPlays[0].tracks.length, 4);
assert.equal(playlistPlays[0].index, 1);

const compatiblePlaylistPlay = await intelligence.execute('music.playlist.play', { playlist: 'pl-1', index: 2 });
assert.equal(compatiblePlaylistPlay.started.id, 'pl-1-track-3', 'server-facing playlist play alias should execute');
assert.equal(playlistPlays.length, 2);

await assert.rejects(
  () => intelligence.execute('playlist.play', { playlist: 'Night', index: 0 }),
  (error) => error?.code === 'ambiguous_playlist',
  'duplicate playlist names must not be guessed'
);

await assert.rejects(
  () => intelligence.execute('automation.rule.create', {
    title: 'Pause at forty seconds',
    trigger: { type: 'progress', atSeconds: 40 },
    action: { command: 'playback.pause', parameters: {} }
  }),
  (error) => error?.code === 'confirmation_required',
  'persistent automation must require local confirmation'
);

const createdRule = await intelligence.execute('automation.rule.create', {
  title: 'Pause at forty seconds',
  trigger: { type: 'progress', atSeconds: 40 },
  action: { command: 'playback.pause', parameters: {} }
}, { confirmed: true });
assert.ok(createdRule.id);

await intelligence.notify('progress', { songId: 'song-1', positionSeconds: 39.1, durationSeconds: 100 });
await intelligence.notify('progress', { songId: 'song-1', positionSeconds: 39.8, durationSeconds: 100 });
await intelligence.notify('progress', { songId: 'song-1', positionSeconds: 40.2, durationSeconds: 100 });
await intelligence.notify('progress', { songId: 'song-1', positionSeconds: 40.8, durationSeconds: 100 });
await intelligence.notify('progress', { songId: 'song-1', positionSeconds: 41.1, durationSeconds: 100 });
assert.equal(automatedCommands.length, 1, 'progress event spam must execute the rule only once');
assert.equal(automatedCommands[0].command, 'playback.pause');
assert.equal(automatedCommands[0].context.source, 'playback-automation');

const rulesPage = await intelligence.execute('automation.rule.query', { cursor: 0, limit: 10 });
assert.equal(rulesPage.total, 1);
assert.equal(rulesPage.items[0].status, 'completed');
assert.ok([...storageValues.keys()].some((key) => key.startsWith('fe-monster-playback-intelligence:')));

const managedRule = await intelligence.execute('automation.rule.create', {
  title: 'Pause at seventy seconds',
  trigger: { type: 'progress', atSeconds: 70 },
  action: { command: 'playback.pause', parameters: {} }
}, { confirmed: true });
await assert.rejects(
  () => intelligence.execute('automation.rule.disable', { id: managedRule.id }),
  (error) => error?.code === 'confirmation_required'
);
assert.equal(
  (await intelligence.execute('automation.rule.disable', { id: managedRule.id }, { confirmed: true })).status,
  'disabled'
);
await intelligence.notify('progress', { songId: 'song-1', positionSeconds: 69.1, durationSeconds: 100 });
await intelligence.notify('progress', { songId: 'song-1', positionSeconds: 70.1, durationSeconds: 100 });
assert.equal(automatedCommands.length, 1, 'disabled automation must not execute');
assert.equal(
  (await intelligence.execute('automation.rule.enable', { id: managedRule.id }, { confirmed: true })).status,
  'active'
);
await intelligence.notify('progress', { songId: 'song-1', positionSeconds: 69.2, durationSeconds: 100 });
await intelligence.notify('progress', { songId: 'song-1', positionSeconds: 70.2, durationSeconds: 100 });
assert.equal(automatedCommands.length, 2, 're-enabled automation should execute through the command bus');
assert.equal(
  (await intelligence.execute('automation.rule.archive', { id: managedRule.id }, { confirmed: true })).status,
  'archived'
);
assert.equal((await intelligence.execute('automation.rule.query', { limit: 10 })).total, 1);
assert.equal((await intelligence.execute('automation.rule.query', { limit: 10, includeArchived: true })).total, 2);

const progressWatch = await intelligence.execute('playback.progress.watch.start');
assert.equal(progressWatch.status, 'watching');
assert.ok(progressWatch.watchId);
assert.equal(progressWatch.positionSeconds, 37.25);
await intelligence.notify('progress', { songId: 'song-1', positionSeconds: 44.5, durationSeconds: 100 });
const stoppedWatch = await intelligence.execute('playback.progress.watch.stop', { watchId: progressWatch.watchId });
assert.equal(stoppedWatch.status, 'stopped');
assert.equal(stoppedWatch.positionSeconds, 44.5, 'a transient progress watch should retain the latest event snapshot');
await assert.rejects(
  () => intelligence.execute('playback.progress.watch.stop', { watchId: progressWatch.watchId }),
  (error) => error?.code === 'progress_watch_not_found',
  'stopped progress watches must not remain active'
);

await intelligence.execute('automation.rule.create', {
  title: 'Start focus playlist when a track ends',
  trigger: { type: 'event', event: 'track-complete' },
  action: { command: 'playlist.play', parameters: { playlist: 'pl-1', index: 0 } }
}, { confirmed: true });
await intelligence.notify('track-complete', {
  song: { id: 'event-song', name: 'Done', artist: 'Fixture', provider: 'netease' }
});
assert.equal(automatedCommands.length, 3, 'track events should drive automation without polling');
assert.equal(automatedCommands[2].command, 'playlist.play');

for (let index = 0; index < 3; index += 1) {
  await intelligence.notify('track-start', {
    song: { id: 'habit-song', name: 'Aurora', artist: 'Nova', provider: 'netease' },
    playlist: { id: 'daily-1', name: 'Daily Mix' }
  });
  await intelligence.notify('track-complete', {
    song: { id: 'habit-song', name: 'Aurora', artist: 'Nova', provider: 'netease' }
  });
}
const habitSummary = await intelligence.execute('habit.summary');
assert.equal(habitSummary.topSongs[0].name, 'Aurora');
assert.equal(habitSummary.topSongs[0].starts, 3);
assert.equal(habitSummary.topSongs[0].completes, 3);
assert.equal(habitSummary.topArtists[0].name, 'Nova');
assert.ok(habitSummary.topSongs[0].confidence >= 0.5);

currentIdentity = 'qq:another-user';
const isolatedSummary = await intelligence.execute('habit.summary');
assert.deepEqual(JSON.parse(JSON.stringify(isolatedSummary.topSongs)), [], 'habit summaries must be isolated by account');
const tamperedStorageKey = `fe-monster-playback-intelligence:${encodeURIComponent(currentIdentity)}`;
storageValues.set(tamperedStorageKey, JSON.stringify({
  version: 1,
  rules: [{
    id: 'tampered-rule',
    title: 'unsafe',
    status: 'active',
    once: true,
    trigger: { type: 'event', event: 'track-complete' },
    action: { command: 'community.message.send', parameters: { text: 'must not run' } }
  }],
  habits: { version: 1, events: 0, songs: {}, artists: {}, playlists: {}, providers: {} }
}));
const commandCountBeforeTamper = automatedCommands.length;
await intelligence.notify('track-complete', {
  song: { id: 'tampered-song', name: 'Unsafe', artist: 'Fixture', provider: 'qq' }
});
assert.equal(automatedCommands.length, commandCountBeforeTamper, 'tampered stored rules must remain playback-only');

currentIdentity = 'netease:compatibility-user';
await assert.rejects(
  () => intelligence.execute('automation.create', {
    title: 'Play focus after completion',
    trigger: { type: 'event', event: 'track-complete' },
    action: { command: 'music.playlist.play', parameters: { playlist: 'pl-1' } }
  }),
  (error) => error?.code === 'confirmation_required',
  'automation aliases must preserve persistent-mutation confirmation'
);
const compatibleRule = await intelligence.execute('automation.create', {
  title: 'Play focus after completion',
  trigger: { type: 'event', event: 'track-complete' },
  action: { command: 'music.playlist.play', parameters: { playlist: 'pl-1' } }
}, { confirmed: true });
assert.equal(compatibleRule.action.command, 'playlist.play', 'safe action aliases should be stored canonically');
assert.equal((await intelligence.execute('automation.query')).total, 1);
assert.equal(
  (await intelligence.execute('automation.disable', { id: compatibleRule.id }, { confirmed: true })).status,
  'disabled'
);

const appSource = readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const htmlSource = readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
assert.ok(
  htmlSource.indexOf('playback-intelligence.js') < htmlSource.indexOf('app.js?v='),
  'playback intelligence must load before app command registration'
);
for (const command of [
  'player.queue.query',
  'playlist.query',
  'playlist.play',
  'playback.progress.watch.start',
  'playback.progress.watch.stop',
  'playback.automation.rule.create',
  'pet.habits.query'
]) {
  assert.ok(appSource.includes(`command: '${command}'`), `missing client command ${command}`);
}
for (const alias of [
  'music.playlist.query',
  'music.playlist.play',
  'automation.query',
  'automation.create'
]) {
  assert.ok(appSource.includes(`'${alias}'`), `missing server-facing command alias ${alias}`);
}
assert.ok(appSource.includes("...['enable', 'disable', 'archive'].map"), 'automation management commands were not registered');
assert.ok(
  appSource.includes('aliases: [`automation.${operation}`, `automation.rule.${operation}`]'),
  'automation management compatibility aliases were not registered'
);
const listeningReportStart = appSource.indexOf('async function reportCommunityListening');
const listeningReportEnd = appSource.indexOf('\nfunction ', listeningReportStart + 1);
const listeningReportSource = appSource.slice(listeningReportStart, listeningReportEnd);
assert.match(
  listeningReportSource,
  /\(!playing\s*&&\s*!activeSession\s*&&\s*!force\)/,
  'a forced paused listening report must bypass the ordinary idle-report early return'
);
assert.match(
  listeningReportSource,
  /body:\s*JSON\.stringify\(\{\s*listenMsDelta:\s*Math\.round\(playing\s*\?\s*delta\s*:\s*0\),\s*song:\s*currentCommunitySongPayload\(\)/,
  'paused forced listening reports must send listenMsDelta: 0 with the current song snapshot'
);
const communitySongPayloadStart = appSource.indexOf('function currentCommunitySongPayload');
const communitySongPayloadEnd = appSource.indexOf('\nfunction ', communitySongPayloadStart + 1);
assert.match(
  appSource.slice(communitySongPayloadStart, communitySongPayloadEnd),
  /playing:\s*!els\.audio\.paused\s*&&\s*!!els\.audio\.src/,
  'the forced paused listening report song snapshot must carry playing: false'
);
assert.match(appSource, /addEventListener\('timeupdate',[\s\S]*notifyPlaybackIntelligence\('progress'/);
assert.doesNotMatch(source, /setInterval\s*\(/, 'playback automation must be driven by events, not polling');

console.log('playback intelligence checks passed');
