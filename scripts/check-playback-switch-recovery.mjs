import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const block = (name) => {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  assert.ok(start >= 0, `Missing ${name}`);
  const remaining = source.slice(start);
  const end = remaining.slice(1).search(/^(?:async )?function \w+\(/m);
  return end < 0 ? remaining : remaining.slice(0, end + 1);
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const result = {};

function harness(extra = {}) {
  const events = new Map();
  const requests = [];
  const toasts = [];
  const seeks = [];
  const timers = new Map();
  let timerId = 0;
  const audio = {
    src: 'old.mp3', paused: false, ended: false, readyState: 4, duration: 120,
    currentTime: 0, volume: 1, buffered: { length: 1, start: () => 0, end: () => 30 },
    addEventListener(name, fn) { const list = events.get(name) || []; list.push(fn); events.set(name, list); },
    removeEventListener(name, fn) { events.set(name, (events.get(name) || []).filter(item => item !== fn)); },
    pause() { this.paused = true; },
    play: async () => { audio.paused = false; },
    load() {},
    removeAttribute(name) { if (name === 'src') this.src = ''; }
  };
  const state = {
    currentSong: { id: 'old', provider: 'netease' }, queueIndex: 0,
    queue: Array.from({ length: 5 }, (_, i) => ({ id: String(i), provider: 'netease' })),
    playbackSelection: { kind: 'queue', index: 0, songs: [] },
    activeProvider: 'netease', playbackQuality: 'standard',
    audioPlaybackContinuity: { sourceGeneration: 0, pendingLoadGeneration: 0 },
    community: {}, qishuiPlaybackCard: { switchId: 0, seekRequestId: 0 }
  };
  const context = vm.createContext({
    state, els: { audio, volumeRange: { value: 80 }, qishuiPlaybackPhone: null },
    console, AbortController, DOMException, Promise, performance: { now: () => 1000 },
    window: {
      matchMedia: () => ({ matches: true }),
      setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; },
      clearTimeout: id => timers.delete(id), requestAnimationFrame: fn => fn(),
      HTMLMediaElement: { NETWORK_NO_SOURCE: 3 }
    },
    AUDIO_PLAYBACK_START_BUFFER_SECONDS: 1,
    AUDIO_PLAYBACK_START_BUFFER_TIMEOUT_MS: 350,
    AUDIO_PLAYBACK_LOAD_TIMEOUT_MS: 20000,
    AUDIO_PLAYBACK_START_TIMEOUT_MS: 10000,
    safeText: (text, fallback = '') => text || fallback,
    isLocalSong: song => Boolean(song?.localUrl),
    isQishuiMetadataSong: song => song?.provider === 'qishui',
    ensureQualityLoginStatus: async () => ({ playbackAuthorized: true }),
    resolveQishuiMetadataViaGuestSearch: async song => song,
    providerInfo: () => ({ label: 'provider' }),
    playbackQualityProvider: () => 'netease', normalizePlaybackQuality: (_p, q) => q,
    preferredPlaybackQuality: () => 'standard',
    songParams: song => `id=${song.id}`, query: data => new URLSearchParams(data),
    apiJson: async (url, options = {}) => {
      requests.push({ url, options });
      const id = new URL(url, 'http://local').searchParams.get('id');
      return { playable: true, url: `${id}.mp3`, song: { id } };
    },
    browserAudioUrl: value => value,
    invalidateNativeGoogleObrTimeline: async () => {},
    setAudioPlaybackPosition: position => seeks.push(position),
    resetSpectrumForSong() {}, renderCurrent() {}, updateProgress() {}, updatePlayState() {},
    ensureAudioAnalysis: async () => {}, reportCommunityListening: async () => {},
    toast: message => toasts.push(message),
    playbackCardSong: () => state.currentSong,
    clearQishuiPlaybackSwitchClasses() {}, updateShelfCurrentSong() {}, refreshPlayerState: async () => {},
    audioSourceLibraryAllows: () => true, clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    petAssistantSongSummary: song => ({ ...song }), setSongFocus() {}, closePlaylistShelf() {},
    transport: async () => {},
    ...extra
  });
  const names = [
    'resetAudioPlaybackContinuity', 'cancelStalledAudioPlaybackRecovery', 'prepareAudioPlaybackSource',
    'audioBufferedSecondsAhead', 'waitForAudioPlaybackStartBuffer',
    'loadLocalSong', 'loadSong', 'playQueueIndex', 'nextPlaybackQueueIndex',
    'setPlaybackQueueSelection', 'setPlaybackPlaylistSelection', 'playbackSelectionIsPlaylist',
    'advancePlaybackSelection', 'syncPlaybackQueueIndexToCurrentSong',
    'finishQishuiPlaybackSwitch', 'switchQishuiPlaybackTrack', 'togglePlay', 'playPlaylistTracks'
  ];
  for (const optional of ['applyAudioPlaybackSourcePosition', 'audioPlaybackLoadIsCurrent', 'playAudioPlaybackSource', 'audioPlaybackSourceCanRenew', 'audioPlaybackFailure']) {
    if (source.includes(`function ${optional}(`)) names.push(optional);
  }
  vm.runInContext(names.map(block).join('\n'), context);
  return { context, state, audio, requests, toasts, seeks, events, timers };
}

async function check(name, test) {
  try { await test(); result[name] = true; }
  catch (error) { result[name] = error.message; }
}

await check('wheel_keeps_latest_intent_during_network_load', async () => {
  const h = harness(); const indices = [];
  h.context.playQueueIndex = index => { indices.push(index); h.state.queueIndex = index; return new Promise(() => {}); };
  h.context.switchQishuiPlaybackTrack(1);
  h.context.switchQishuiPlaybackTrack(1);
  h.context.switchQishuiPlaybackTrack(-1);
  assert.deepEqual(indices, [1, 2, 1]);
  await tick();
  assert.equal(h.state.qishuiPlaybackCard.switching, false, 'animation cannot wait for URL/network');
});

await check('obsolete_native_invalidation_cannot_replace_new_source', async () => {
  const gate = deferred(); let calls = 0;
  const h = harness({ invalidateNativeGoogleObrTimeline: () => ++calls === 1 ? gate.promise : Promise.resolve() });
  const old = h.context.loadSong({ id: 'a' }); await tick();
  assert.equal(await h.context.loadSong({ id: 'b' }), true);
  gate.resolve(); assert.equal(await old, false);
  assert.equal(h.audio.src, 'b.mp3'); assert.equal(h.state.currentSong.id, 'b');
});

await check('obsolete_load_aborted_without_error_or_community_skip', async () => {
  const gate = deferred(); const h = harness();
  h.context.apiJson = (url, options) => {
    h.requests.push({ url, options });
    return url.includes('id=a') ? gate.promise : Promise.resolve({ playable: true, url: 'b.mp3', song: { id: 'b' } });
  };
  const old = h.context.loadSong({ id: 'a' }); await tick();
  await h.context.loadSong({ id: 'b' });
  gate.reject(new Error('old network failed')); assert.equal(await old, false);
  assert.deepEqual(h.toasts, []);
  assert.equal(h.requests[0].options.signal?.aborted, true);
  assert.equal(h.requests[0].options.timeoutMs, 20000);
});

await check('old_metadata_listener_cannot_seek_new_song', async () => {
  const h = harness(); h.audio.readyState = 0;
  await h.context.loadSong({ id: 'a' }, { position: 80, autoplay: false });
  await h.context.loadSong({ id: 'b' }, { autoplay: false });
  h.seeks.length = 0;
  for (const fn of h.events.get('loadedmetadata') || []) fn();
  assert.deepEqual(h.seeks, []);
});

await check('slow_authorization_cannot_supersede_new_song', async () => {
  const gate = deferred(); const h = harness({ ensureQualityLoginStatus: () => gate.promise });
  const old = h.context.loadSong({ id: 'a', provider: 'qishui' });
  await h.context.loadSong({ id: 'b' });
  gate.resolve({ playbackAuthorized: true }); assert.equal(await old, false);
  assert.equal(h.audio.src, 'b.mp3');
});

await check('local_song_has_same_async_source_ownership', async () => {
  const gate = deferred(); let calls = 0;
  const h = harness({ invalidateNativeGoogleObrTimeline: () => ++calls === 1 ? gate.promise : Promise.resolve() });
  const old = h.context.loadSong({ id: 'a', localUrl: 'blob:a' }); await tick();
  await h.context.loadSong({ id: 'b', localUrl: 'blob:b' });
  gate.resolve(); assert.equal(await old, false);
  assert.equal(h.audio.src, 'blob:b'); assert.equal(h.state.currentSong.id, 'b');
});

await check('playback_starts_without_waiting_for_native_analysis', async () => {
  const h = harness({ ensureAudioAnalysis: () => new Promise(() => {}) });
  let finished = false; h.context.loadSong({ id: 'b' }).then(() => { finished = true; });
  await tick(); assert.equal(finished, true);
});

await check('buffer_wait_ends_promptly_on_playable_or_failed_media', async () => {
  const h = harness(); h.audio.buffered.end = () => 0.3; h.audio.readyState = 3;
  let finished = false;
  h.context.waitForAudioPlaybackStartBuffer().then(() => { finished = true; });
  await tick(); assert.equal(finished, true, 'HAVE_FUTURE_DATA can play immediately');
  h.audio.readyState = 0; h.audio.buffered.end = () => 0;
  finished = false; h.context.waitForAudioPlaybackStartBuffer().then(() => { finished = true; });
  for (const fn of h.events.get('error') || []) fn({ type: 'error' });
  await tick(); assert.equal(finished, true, 'media error cannot wait for entire startup timeout');
});

await check('startup_media_failure_renews_once_and_stops', async () => {
  const h = harness();
  h.audio.play = async () => { h.audio.error = { code: 4 }; throw new Error('expired media source'); };
  assert.equal(await h.context.loadSong({ id: 'a' }), false);
  assert.equal(h.requests.filter(item => item.url.startsWith('/api/player/load')).length, 2);
  assert.equal(h.toasts.length, 1);
});

await check('autoplay_permission_is_not_retried', async () => {
  const h = harness();
  h.audio.play = async () => { h.audio.error = { code: 4 }; throw new DOMException('user gesture required', 'NotAllowedError'); };
  assert.equal(await h.context.loadSong({ id: 'a' }), false);
  assert.equal(h.requests.filter(item => item.url.startsWith('/api/player/load')).length, 1);
});

await check('hanging_media_start_is_cancellable_and_has_deadline', async () => {
  const h = harness(); h.audio.play = () => new Promise(() => {});
  let oldFinished = false;
  const old = h.context.loadSong({ id: 'a' }).then(value => { oldFinished = true; return value; });
  await tick();
  assert.ok([...h.timers.values()].some(timer => timer.ms === 10000));
  h.audio.play = async () => {};
  await h.context.loadSong({ id: 'b' }); await tick();
  assert.equal(oldFinished, true); assert.equal(await old, false);
  assert.deepEqual(h.toasts, []);
  assert.equal(h.audio.src, 'b.mp3');
});

await check('server_superseded_load_is_silent', async () => {
  const h = harness({ apiJson: async () => ({ playable: false, superseded: true }) });
  assert.equal(await h.context.loadSong({ id: 'a' }), false);
  assert.deepEqual(h.toasts, []);
  assert.equal(h.audio.src, 'old.mp3');
});

await check('old_track_ended_does_not_cancel_pending_selection', async () => {
  const gate = deferred(); const h = harness({ apiJson: () => gate.promise });
  const advances = [];
  Object.assign(h.context, {
    syncPlaybackLyricMediaClockEdge() {}, resetSyncedAudioPlaybackRate() {},
    flushCommunityListeningStats() {}, flushHighDifficultyListenInterval() {},
    suspendAudioAnalysis() {}, syncRealtimePolling() {}, unlockAppAchievement() {},
    currentAchievementTrackId: () => '', notifyPlaybackIntelligence() {},
    playbackIntelligenceSongPayload: () => ({}),
    playbackIntelligenceTrackSignature: '', transport: (...args) => advances.push(args)
  });
  const endedHandler = source.match(/els\.audio\.addEventListener\('ended', \(\) => \{[\s\S]*?\n  \}\);/)?.[0];
  assert.ok(endedHandler, 'production ended handler exists');
  vm.runInContext(endedHandler, h.context);
  const selecting = h.context.loadSong({ id: 'b' }); await tick();
  for (const fn of h.events.get('ended') || []) fn();
  assert.equal(advances.length, 0, 'ending the old audio must not auto-advance over a pending explicit selection');
  gate.resolve({ playable: true, url: 'b.mp3', song: { id: 'b' } });
  assert.equal(await selecting, true);
  assert.equal(h.audio.src, 'b.mp3');
  for (const fn of h.events.get('ended') || []) fn();
  assert.equal(advances.length, 1, 'ordinary track completion still advances');
});

for (const local of [false, true]) await check(`old_${local ? 'local' : 'remote'}_pause_cannot_pause_new_song`, async () => {
  const gate = deferred(); let invalidations = 0;
  const h = harness({ invalidateNativeGoogleObrTimeline: () => ++invalidations === 1 ? gate.promise : Promise.resolve() });
  if (local) { h.state.localQueueActive = true; h.state.currentSong.localUrl = 'old.mp3'; }
  const pausing = h.context.togglePlay(); await tick();
  await h.context.loadSong({ id: 'b', ...(local ? { localUrl: 'blob:b' } : {}) });
  gate.resolve(); await pausing;
  assert.equal(h.audio.paused, false);
  assert.equal(h.requests.some(item => item.url === '/api/player/pause'), false);
});

await check('old_resume_cannot_play_or_report_over_new_song', async () => {
  const gate = deferred(); const h = harness(); let playCalls = 0;
  h.audio.paused = true; h.audio.play = async () => { playCalls++; h.audio.paused = false; };
  h.context.apiJson = url => url === '/api/player/play' ? gate.promise : Promise.resolve({ playable: true, url: 'b.mp3', song: { id: 'b' } });
  const resuming = h.context.togglePlay(); await tick();
  await h.context.loadSong({ id: 'b' });
  gate.reject(new Error('obsolete resume failed')); await resuming;
  assert.equal(playCalls, 1); assert.equal(h.audio.paused, false);
  assert.deepEqual(h.toasts, []); assert.equal(h.state.audioPlaybackContinuity.playingIntent, true);
});

await check('transport_autoplay_denial_does_not_skip_queue', async () => {
  const h = harness(); vm.runInContext(block('transport'), h.context);
  h.audio.play = async () => { throw new DOMException('user gesture required', 'NotAllowedError'); };
  assert.equal(await h.context.transport('/api/player/next', { completed: true }), false);
  assert.equal(h.requests.filter(item => item.url === '/api/player/next').length, 1);
  assert.notEqual(h.audio.src, '', 'the selected source is retained for a user play gesture');
  assert.equal(h.toasts.length, 1);
});

await check('old_community_pause_cannot_pause_new_selection', async () => {
  const gate = deferred(); let invalidations = 0;
  const h = harness({ invalidateNativeGoogleObrTimeline: () => ++invalidations === 1 ? gate.promise : Promise.resolve() });
  Object.assign(h.context, {
    communitySongPlaybackPosition: () => 0, communitySongDuration: () => 120,
    smoothlySyncAudioPlaybackPosition() {}
  });
  vm.runInContext(block('applyCommunityPlaybackControls'), h.context);
  const pausing = h.context.applyCommunityPlaybackControls({ playing: false }); await tick();
  await h.context.loadSong({ id: 'b' });
  gate.resolve(); await pausing;
  assert.equal(h.audio.paused, false);
  assert.equal(h.requests.some(item => item.url === '/api/player/pause'), false);
});

await check('deferred_community_error_cannot_skip_new_selection', async () => {
  const h = harness(); const skipped = [];
  h.state.community.activeSession = {};
  Object.assign(h.context, {
    resetSyncedAudioPlaybackRate() {}, suspendAudioAnalysis() {}, syncRealtimePolling() {},
    skipUnavailableCommunitySong: async reason => skipped.push(reason), localAudioExtension: () => ''
  });
  const errorHandler = source.match(/els\.audio\.addEventListener\('error', \(\) => \{[\s\S]*?\n  \}\);/)?.[0];
  assert.ok(errorHandler, 'production media error handler exists');
  vm.runInContext(errorHandler, h.context);
  for (const fn of h.events.get('error') || []) fn();
  const staleError = [...h.timers.values()].find(timer => timer.ms === 0);
  assert.ok(staleError);
  await h.context.loadSong({ id: 'b' });
  staleError.fn(); await tick();
  assert.deepEqual(skipped, []);
});

await check('playlist_preserves_actual_error_without_inventing_vip_denial', async () => {
  const failure = new Error('音源服务器暂时不可用'); failure.code = 'UPSTREAM_UNAVAILABLE';
  const h = harness({ apiJson: async url => {
    if (url === '/api/player/queue') return {};
    throw failure;
  } });
  await assert.rejects(h.context.playPlaylistTracks({ id: 'list' }, [{ id: 'a' }]), error => error === failure);
  assert.deepEqual(h.toasts, [], 'the shelf caller displays exactly one actual error');
});

await check('superseded_playlist_selection_is_not_reported_as_vip_failure', async () => {
  const gate = deferred(); const h = harness();
  h.context.apiJson = async url => {
    if (url === '/api/player/queue') return {};
    if (url.includes('id=a')) return gate.promise;
    return { playable: true, url: 'b.mp3', song: { id: 'b' } };
  };
  const selecting = h.context.playPlaylistTracks({ id: 'list' }, [{ id: 'a' }]); await tick();
  await h.context.loadSong({ id: 'b' });
  gate.reject(new Error('obsolete unavailable source'));
  assert.equal(await selecting, null);
  assert.equal(h.state.currentSong.id, 'b'); assert.deepEqual(h.toasts, []);
});

await check('not_supported_play_rejection_renews_without_mediaerror_object', async () => {
  const h = harness(); let attempts = 0;
  h.audio.play = async () => {
    if (++attempts === 1) throw new DOMException('The element has no supported sources.', 'NotSupportedError');
    h.audio.paused = false;
  };
  assert.equal(await h.context.loadSong({ id: 'a' }), true);
  assert.equal(attempts, 2); assert.equal(h.requests.length, 2); assert.deepEqual(h.toasts, []);
});

await check('transport_renews_current_track_before_skipping_queue', async () => {
  const h = harness(); vm.runInContext(block('transport'), h.context); let attempts = 0;
  h.context.apiJson = async url => {
    h.requests.push({ url });
    return { playable: true, url: attempts ? 'renewed.mp3' : 'expired.mp3', song: { id: 'a' } };
  };
  h.audio.play = async () => {
    if (++attempts === 1) throw new DOMException('The element has no supported sources.', 'NotSupportedError');
    h.audio.paused = false;
  };
  assert.equal(await h.context.transport('/api/player/next', { completed: true }), true);
  assert.equal(h.requests.filter(item => item.url === '/api/player/next').length, 1);
  assert.equal(h.requests.filter(item => item.url.startsWith('/api/player/load')).length, 1);
  assert.equal(h.audio.src, 'renewed.mp3'); assert.equal(h.state.currentSong.id, 'a');
  assert.deepEqual(h.toasts, []);
});

await check('play_button_reloads_failed_source_instead_of_replaying_it', async () => {
  const h = harness(); h.audio.error = { code: 4 }; h.audio.paused = true;
  h.audio.play = async () => {
    if (h.audio.src === 'old.mp3') throw new DOMException('The element has no supported sources.', 'NotSupportedError');
    h.audio.error = null; h.audio.paused = false;
  };
  h.context.apiJson = async url => {
    h.requests.push({ url });
    return { playable: true, url: 'fresh.mp3', song: h.state.currentSong };
  };
  await h.context.togglePlay();
  assert.equal(h.audio.src, 'fresh.mp3'); assert.equal(h.audio.paused, false);
  assert.equal(h.requests.filter(item => item.url.startsWith('/api/player/load')).length, 1);
  assert.deepEqual(h.toasts, []);
});

await check('renewal_permission_response_is_preserved_without_another_retry', async () => {
  const h = harness(); let attempts = 0;
  h.audio.play = async () => { h.audio.error = { code: 4 }; throw new DOMException('Unsupported', 'NotSupportedError'); };
  h.context.apiJson = async url => {
    h.requests.push({ url });
    if (++attempts > 1) return { playable: false, error: '此歌曲需要单独购买' };
    return { playable: true, url: 'expired.mp3', song: { id: 'a' } };
  };
  await assert.rejects(h.context.loadSong({ id: 'a' }, { silent: true, throwOnError: true }), /此歌曲需要单独购买/);
  assert.equal(attempts, 2); assert.deepEqual(h.toasts, []);
});

await check('cancelled_media_renewal_cannot_replace_new_selection', async () => {
  const gate = deferred(); const h = harness(); let oldAttempts = 0;
  h.audio.play = async () => {
    if (h.audio.src === 'expired.mp3') throw new DOMException('Unsupported', 'NotSupportedError');
    h.audio.paused = false;
  };
  h.context.apiJson = async url => {
    if (url.includes('id=a') && ++oldAttempts > 1) return gate.promise;
    return { playable: true, url: url.includes('id=a') ? 'expired.mp3' : 'b.mp3', song: { id: url.includes('id=a') ? 'a' : 'b' } };
  };
  const old = h.context.loadSong({ id: 'a' }); await tick();
  assert.equal(oldAttempts, 2);
  assert.equal(await h.context.loadSong({ id: 'b' }), true);
  gate.resolve({ playable: true, url: 'obsolete-renewed.mp3', song: { id: 'a' } });
  assert.equal(await old, false); assert.equal(h.audio.src, 'b.mp3');
  assert.deepEqual(h.toasts, []);
});

await check('resume_respects_explicit_unplayable_response', async () => {
  const h = harness(); h.audio.paused = true; let playCalls = 0;
  h.audio.play = async () => { playCalls++; };
  h.context.apiJson = async () => ({ playable: false, error: '登录已过期，请重新登录' });
  await h.context.togglePlay();
  assert.equal(playCalls, 0); assert.deepEqual(h.toasts, ['登录已过期，请重新登录']);
});

console.log(JSON.stringify({ ok: Object.values(result).every(value => value === true), checks: result }, null, 2));
if (Object.values(result).some(value => value !== true)) process.exitCode = 1;
