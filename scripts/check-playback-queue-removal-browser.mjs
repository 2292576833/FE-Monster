import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
let chromium;
for (const candidate of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright',
  path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch {}
}
assert.ok(chromium, 'Playwright is required');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(edge) ? { executablePath: edge } : {}) });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.setContent(`<main id="queueFixtureStage"><div id="qishuiPlaybackCard">
    <button id="qishuiPlaybackQueueButton">队列 <b id="qishuiPlaybackQueueCount"></b></button>
    <aside class="qishui-playback-queue-panel" id="qishuiPlaybackQueuePanel" hidden>
    <header class="qishui-playback-queue-panel__header"><div><strong>歌曲队列</strong>
    <small id="qishuiPlaybackQueuePanelMeta"></small></div>
    <button id="qishuiPlaybackQueueClose">关闭</button></header>
    <ol class="qishui-playback-queue-list" id="qishuiPlaybackQueueList" role="listbox"></ol></aside>
    </div></main>`);
  await page.addStyleTag({ content: readFileSync(path.join(root, 'web/playback-bar-enhancements.css'), 'utf8')
    + '\n#qishuiPlaybackQueuePanel {position:fixed;left:20px;top:60px;right:auto;bottom:auto;} body {background:#172028;color:white;min-height:2000px;}' });
  await page.evaluate(() => {
    window.queueProbe = { requests: [], plays: [], mode: 'ok' };
    const state = { queue: [], queueIndex: -1, queueLength: 0, queueRevision: 4,
      playbackSelection: { kind: 'queue', index: -1 }, playerStateSync: { requestId: 0 } };
    window.FeMonsterPlaybackContext = { state,
      els: { audio: { currentTime: 23.4, paused: false, src: 'fixture-song' } },
      playQueueIndex: async (index) => { window.queueProbe.plays.push(index); } };
    window.fetch = async (url, options) => {
      const server = queueProbe.server;
      if (url.startsWith('/api/player/queue?')) {
        queueProbe.reads += 1;
        if (queueProbe.mode === 'refresh-fail') return new Response('{}', { status: 503 });
        const cursor = Number(new URL(url, 'http://fixture').searchParams.get('cursor'));
        const end = Math.min(cursor + 200, server.queue.length);
        return new Response(JSON.stringify({ items: server.queue.slice(cursor, end), cursor,
          total: server.queue.length, queueIndex: server.index, queueRevision: server.revision,
          nextCursor: end < server.queue.length ? end : null }));
      }
      if (!['/api/player/queue/remove', '/api/player/queue/move', '/api/player/queue/merge'].includes(url)) throw new Error(`Unexpected request: ${url}`);
      const body = JSON.parse(options.body);
      window.queueProbe.requests.push(body);
      if (window.queueProbe.mode === 'delay') await new Promise((resolve) => { window.queueProbe.release = resolve; });
      if (window.queueProbe.mode === 'fail') return new Response(JSON.stringify({ ok: false }), { status: 503 });
      if (window.queueProbe.mode === 'legacy') return new Response(JSON.stringify({ ok: false, error: 'not found' }), { status: 404 });
      if (window.queueProbe.mode === 'stale') return new Response(JSON.stringify({ ok: false, code: 'queue_changed' }));
      if (window.queueProbe.mode === 'conflict-once' && queueProbe.requests.length === 1) {
        server.queue.unshift({ id: 'external-song', title: '另一客户端加入的歌', provider: 'netease' });
        server.revision += 1; server.index += 1;
        return new Response(JSON.stringify({ ok: false, code: 'queue_changed', queueRevision: server.revision }));
      }
      if (url === '/api/player/queue/merge') {
        for (const song of body.songs) if (!server.queue.some(entry => entry.id === song.id)) server.queue.push(song);
        server.revision += 1;
        return new Response(JSON.stringify({ ok: true, queueLength: server.queue.length, queueRevision: server.revision }));
      }
      if (url === '/api/player/queue/move') {
        if (body.songId !== server.queue[body.fromIndex]?.id || body.provider !== server.queue[body.fromIndex]?.provider
          || body.expectedRevision !== server.revision) throw new Error('Incorrect reorder identity');
        server.queue.splice(body.toIndex, 0, server.queue.splice(body.fromIndex, 1)[0]);
        if (server.index === body.fromIndex) server.index = body.toIndex;
        else if (body.fromIndex < server.index && body.toIndex >= server.index) server.index -= 1;
        else if (body.fromIndex > server.index && body.toIndex <= server.index) server.index += 1;
        server.revision += 1;
        return new Response(JSON.stringify({ ok: true, moved: true, queueLength: server.queue.length,
          queueRevision: server.revision, queueIndex: server.index }));
      }
      if (body.songId !== server.queue[body.index]?.id || body.provider !== server.queue[body.index]?.provider
        || body.expectedRevision !== server.revision) throw new Error('Incorrect removal identity');
      server.queue.splice(body.index, 1);
      server.index = server.index === body.index ? -1 : server.index > body.index ? server.index - 1 : server.index;
      server.revision += 1;
      return new Response(JSON.stringify({ ok: true, removed: true, queueLength: server.queue.length,
        queueRevision: server.revision, queueIndex: server.index }));
    };
    window.seedQueue = (local = false) => {
      state.queue = Array.from({ length: 3 }, (_, index) => ({ id: `song-${index}`, title: `歌曲 ${index}`,
        provider: local ? 'local' : 'netease' }));
      state.queueIndex = 2; state.queueLength = 3; state.queueRevision = 4; state.localQueueActive = local;
      state.currentSong = { ...state.queue[2], position: 23.4, playing: true };
      state.playbackSelection = { kind: 'queue', index: 2 };
      queueProbe.requests = []; queueProbe.plays = []; queueProbe.mode = 'ok';
      queueProbe.reads = 0;
      queueProbe.server = { queue: state.queue.map(song => ({ ...song })), index: state.queueIndex, revision: state.queueRevision };
      state.queueServerRevision = state.queueRevision;
      window.FEPlaybackQueue?.open(); window.FEPlaybackQueue?.render(true);
    };
    seedQueue();
  });
  await page.addScriptTag({ content: readFileSync(path.join(root, 'web/playback-queue.js'), 'utf8') });
  const appSource = readFileSync(path.join(root, 'web/app.js'), 'utf8');
  const parentWheelHandler = appSource.slice(appSource.indexOf('function handleQishuiPlaybackWheel(event)'),
    appSource.indexOf('function updatePlaybackPageClass()', appSource.indexOf('function handleQishuiPlaybackWheel(event)')));
  assert.match(parentWheelHandler, /switchQishuiPlaybackTrack/);
  await page.evaluate((handler) => {
    queueProbe.wheelSkips = []; queueProbe.stageWheels = 0;
    const state = FeMonsterPlaybackContext.state;
    state.qishuiPlaybackCard = { hiddenByUser: false, wheelDelta: 0 };
    const onWheel = new Function('state', 'playbackCardVisible', 'switchQishuiPlaybackTrack', `return (${handler});`)(
      state, () => true, (direction) => queueProbe.wheelSkips.push(direction));
    document.getElementById('qishuiPlaybackCard').addEventListener('wheel', onWheel, { passive: false });
    document.getElementById('queueFixtureStage').addEventListener('wheel', (event) => {
      queueProbe.stageWheels += 1; event.preventDefault();
    }, { passive: false });
  }, parentWheelHandler);
  await page.locator('#qishuiPlaybackQueueButton').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('[data-queue-action="remove"]').count(), 3);
  const snapshot = () => page.evaluate(() => ({
    ids: FeMonsterPlaybackContext.state.queue.map((song) => song.id),
    currentIndex: FeMonsterPlaybackContext.state.queueIndex,
    selectionIndex: FeMonsterPlaybackContext.state.playbackSelection.index,
    currentSong: FeMonsterPlaybackContext.state.currentSong,
    audio: FeMonsterPlaybackContext.els.audio,
    length: FeMonsterPlaybackContext.state.queueLength,
    count: document.getElementById('qishuiPlaybackQueueCount').textContent,
    open: !document.getElementById('qishuiPlaybackQueuePanel').hidden,
    plays: queueProbe.plays, requests: queueProbe.requests
  }));
  const initial = await snapshot();
  await page.getByRole('button', { name: '踢出队列：歌曲 0', exact: true }).click();
  await page.waitForFunction(() => FeMonsterPlaybackContext.state.queue.length === 2);
  let result = await snapshot();
  assert.deepEqual(result.ids, ['song-1', 'song-2']);
  assert.equal(result.currentIndex, 1); assert.equal(result.selectionIndex, 1);
  assert.equal(result.open, true); assert.equal(result.count, '2');
  assert.deepEqual(result.currentSong, initial.currentSong); assert.deepEqual(result.audio, initial.audio);
  assert.deepEqual(result.plays, [], 'remove click also started playback');

  await page.getByRole('button', { name: '踢出队列：歌曲 2', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => FeMonsterPlaybackContext.state.queue.length === 1);
  result = await snapshot();
  assert.equal(result.currentIndex, -1); assert.equal(result.selectionIndex, -1);
  assert.deepEqual(result.currentSong, initial.currentSong, 'removing current row replaced the playing song');
  assert.deepEqual(result.audio, initial.audio);
  assert.deepEqual(result.plays, [], 'Enter on remove activated the row');
  await page.getByRole('button', { name: '踢出队列：歌曲 1', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => FeMonsterPlaybackContext.state.queue.length === 0);
  assert.equal(await page.locator('.qishui-playback-queue-empty').count(), 1);
  assert.equal((await snapshot()).count, '0');

  for (const mode of ['fail', 'stale']) {
    await page.evaluate((value) => { seedQueue(); queueProbe.mode = value; }, mode);
    const removed = await page.evaluate(() => FEPlaybackQueue.remove(1));
    assert.equal(removed, false);
    result = await snapshot();
    assert.equal(result.length, 3); assert.equal(result.currentIndex, 2);
    assert.deepEqual(result.ids, initial.ids, `${mode}: failed request changed local membership`);
    assert.equal(await page.locator('[data-queue-action="remove"]:disabled').count(), 0);
  }
  await page.evaluate(() => { seedQueue(); queueProbe.mode = 'delay'; });
  await page.getByRole('button', { name: '踢出队列：歌曲 0', exact: true }).click();
  assert.equal(await page.locator('[data-queue-action="remove"]:disabled').count(), 3);
  assert.equal(await page.evaluate(() => FEPlaybackQueue.remove(0)), false, 'duplicate removal was not suppressed');
  await page.evaluate(() => queueProbe.release());
  await page.waitForFunction(() => FeMonsterPlaybackContext.state.queue.length === 2);
  assert.equal((await snapshot()).requests.length, 1);

  await page.evaluate(() => { seedQueue(); queueProbe.mode = 'legacy'; });
  assert.equal(await page.evaluate(() => FEPlaybackQueue.remove(0)), false);
  result = await snapshot();
  assert.deepEqual(result.ids, ['song-0', 'song-1', 'song-2'], 'outdated backend must not silently change the queue');
  assert.match(await page.locator('#qishuiPlaybackQueuePanelMeta').innerText(), /关闭并重新打开客户端/);

  await page.evaluate(() => seedQueue(true));
  await page.getByRole('button', { name: '踢出队列：歌曲 1', exact: true }).click();
  result = await snapshot();
  assert.deepEqual(result.ids, ['song-0', 'song-2']);
  assert.equal(result.requests.length, 0, 'local queue removal contacted the remote player');
  assert.equal(result.currentIndex, 1);
  assert.equal(await page.evaluate(() => FEPlaybackQueue.remove(-1)), false);
  const dragRow = async (from, to, options = {}) => {
    const row = page.locator(`[data-queue-index="${from}"]`);
    const target = page.locator(`[data-queue-index="${to}"]`);
    const start = await row.boundingBox();
    const end = await target.boundingBox();
    await page.mouse.move(start.x + 24, start.y + start.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(420);
    await page.mouse.move(end.x + 24, end.y + end.height * (to > from ? 0.8 : 0.2), { steps: 6 });
    if (options.cancel) await page.keyboard.press('Escape');
    if (options.stale) await page.evaluate(() => { FeMonsterPlaybackContext.state.queueRevision += 1; });
    await page.mouse.up();
    await page.waitForTimeout(60);
  };
  await page.evaluate(() => seedQueue());
  const beforeMove = await snapshot();
  await dragRow(0, 2);
  result = await snapshot();
  assert.deepEqual(result.ids, ['song-1', 'song-2', 'song-0']);
  assert.equal(result.currentIndex, 1);
  assert.equal(result.selectionIndex, 1);
  assert.equal(result.requests.length, 1);
  assert.deepEqual(result.currentSong, beforeMove.currentSong);
  assert.deepEqual(result.audio, beforeMove.audio);
  assert.deepEqual(result.plays, []);
  assert.equal(result.open, true);

  await page.evaluate(() => seedQueue());
  await dragRow(2, 0);
  result = await snapshot();
  assert.deepEqual(result.ids, ['song-2', 'song-0', 'song-1']);
  assert.equal(result.currentIndex, 0, 'moving the current song must move its index without playback');

  for (const mode of ['cancel', 'stale', 'fail', 'legacy']) {
    await page.evaluate((mode) => { seedQueue(); queueProbe.mode = mode; }, mode);
    await dragRow(0, 2, { cancel: mode === 'cancel', stale: mode === 'stale' });
    result = await snapshot();
    assert.deepEqual(result.ids, ['song-0', 'song-1', 'song-2'], mode);
    assert.deepEqual(result.plays, [], `${mode}: drag must not play a song`);
    assert.equal(result.open, true);
    if (mode === 'cancel' || mode === 'stale') assert.equal(result.requests.length, 0);
  }

  await page.evaluate(() => seedQueue(true));
  await page.locator('[data-queue-index="2"]').focus();
  await page.keyboard.press('Alt+ArrowUp');
  result = await snapshot();
  assert.deepEqual(result.ids, ['song-0', 'song-2', 'song-1']);
  assert.equal(result.currentIndex, 1);
  assert.equal(result.requests.length, 0, 'local reorder must not call the server');
  assert.equal(await page.evaluate(() => FEPlaybackQueue.move(1, 1)), false);
  assert.equal(await page.evaluate(() => FEPlaybackQueue.move(1, 99)), false);
  await page.evaluate(() => { seedQueue(); queueProbe.mode = 'delay'; window.pendingMove = FEPlaybackQueue.move(0, 2); });
  assert.equal(await page.evaluate(() => FEPlaybackQueue.move(1, 2)), false);
  await page.evaluate(() => queueProbe.release());
  await page.evaluate(() => pendingMove);
  assert.equal((await snapshot()).requests.length, 1);

  await page.evaluate(() => seedQueue());
  await page.waitForTimeout(650);
  const beforeSelect = await snapshot();
  await page.locator('[data-queue-index="0"] strong').click();
  assert.deepEqual(await snapshot(), beforeSelect, 'selecting must not play, close, reorder or change the audio clock');
  assert.equal(await page.locator('[data-queue-index="0"]').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('[data-queue-index="2"]').getAttribute('aria-current'), 'true');
  await page.locator('[data-queue-index="0"]').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  assert.equal(await page.locator('[data-queue-index="1"]').getAttribute('aria-selected'), 'true');
  assert.deepEqual((await snapshot()).plays, [], 'keyboard selection must not play');
  await page.getByRole('button', { name: '播放：歌曲 1', exact: true }).click();
  assert.deepEqual((await snapshot()).plays, [1], 'only explicit play controls should start playback');

  await page.evaluate(async () => {
    seedQueue(); await FEPlaybackQueue.refresh();
    queueProbe.server.queue.unshift({ id: 'external-song', title: '外部加入', provider: 'netease' });
    queueProbe.server.index += 1; queueProbe.server.revision += 1;
    FeMonsterPlaybackContext.state.queueServerRevision = queueProbe.server.revision;
  });
  assert.equal(await page.evaluate(() => FEPlaybackQueue.remove(1)), true);
  result = await snapshot();
  assert.deepEqual(result.ids, ['external-song', 'song-0', 'song-2'], 'refresh must rebase the selected song, not delete its old index');
  assert.equal(result.requests[0].index, 2);
  assert.equal(result.requests[0].expectedRevision, 5);
  assert.deepEqual(result.audio, initial.audio);

  for (const action of ['remove', 'move']) {
    await page.evaluate(async () => { seedQueue(); await FEPlaybackQueue.refresh(); queueProbe.mode = 'conflict-once'; });
    assert.equal(await page.evaluate(action => action === 'remove' ? FEPlaybackQueue.remove(1) : FEPlaybackQueue.move(0, 2), action), true);
    result = await snapshot();
    assert.equal(result.requests.length, 2, `${action}: retry exactly once after a real backend conflict`);
    assert.equal(result.requests[0].expectedRevision, 4);
    assert.equal(result.requests[1].expectedRevision, 5);
    assert.deepEqual(result.ids, action === 'remove'
      ? ['external-song', 'song-0', 'song-2'] : ['external-song', 'song-1', 'song-2', 'song-0']);
    assert.deepEqual(result.currentSong, initial.currentSong);
    assert.deepEqual(result.audio, initial.audio);
    assert.deepEqual(result.plays, []);
  }

  await page.evaluate(async () => { seedQueue(); await FEPlaybackQueue.refresh(); queueProbe.mode = 'stale'; });
  assert.equal(await page.evaluate(() => FEPlaybackQueue.remove(1)), false);
  assert.equal((await snapshot()).requests.length, 2, 'repeated conflicts must not create an infinite retry loop');
  assert.match(await page.locator('#qishuiPlaybackQueuePanelMeta').innerText(), /自动同步/);

  await page.evaluate(async () => {
    seedQueue(); await FEPlaybackQueue.refresh();
    queueProbe.server.queue.splice(1, 1); queueProbe.server.index -= 1; queueProbe.server.revision += 1;
  });
  assert.equal(await page.evaluate(() => FEPlaybackQueue.remove(1)), true);
  result = await snapshot();
  assert.deepEqual(result.ids, ['song-0', 'song-2']);
  assert.equal(result.requests.length, 0, 'an already removed row must never remove its replacement');

  await page.evaluate(async () => {
    seedQueue(); await FEPlaybackQueue.refresh();
    queueProbe.server.queue = Array.from({ length: 205 }, (_, index) => ({ id: `song-${index}`, title: `歌曲 ${index}`, provider: 'netease' }));
    queueProbe.server.revision += 1;
  });
  assert.equal(await page.evaluate(() => FEPlaybackQueue.remove(1)), true);
  result = await snapshot();
  assert.equal(result.length, 204); assert.equal(result.ids.at(-1), 'song-204');
  assert.equal(result.ids.includes('song-1'), false, 'paged refresh must retain songs beyond the first page');

  await page.evaluate(async () => {
    seedQueue(); await FEPlaybackQueue.refresh();
    queueProbe.server.queue.unshift({ id: 'song-1', title: '同 ID 不同来源', provider: 'qq' });
    queueProbe.server.index += 1; queueProbe.server.revision += 1;
  });
  assert.equal(await page.evaluate(() => FEPlaybackQueue.remove(1)), true);
  assert.equal(await page.evaluate(() => FeMonsterPlaybackContext.state.queue[0].provider), 'qq');

  await page.evaluate(async () => {
    seedQueue(); await FEPlaybackQueue.refresh();
    FeMonsterPlaybackContext.state.queue.splice(2, 0, { ...FeMonsterPlaybackContext.state.queue[1] });
  });
  assert.equal(await page.evaluate(() => FEPlaybackQueue.remove(2)), false);
  assert.equal((await snapshot()).requests.length, 0, 'ambiguous duplicate rows must not be deleted by guessing');

  await page.evaluate(async () => { seedQueue(); await FEPlaybackQueue.refresh(); queueProbe.mode = 'fail'; });
  assert.equal(await page.evaluate(() => FEPlaybackQueue.add({ id: 'not-added', provider: 'netease', title: '失败入队' })), false);
  assert.deepEqual((await snapshot()).ids, initial.ids, 'failed adds must not create unremovable phantom rows');

  await page.evaluate(async () => { seedQueue(); await FEPlaybackQueue.refresh(); });
  const readCount = await page.evaluate(async () => {
    const before = queueProbe.reads;
    await Promise.all([FEPlaybackQueue.refresh(), FEPlaybackQueue.refresh(), FEPlaybackQueue.refresh()]);
    return queueProbe.reads - before;
  });
  assert.equal(readCount, 1, 'concurrent queue refreshes must share one request');

  // Use the production panel/list flex hierarchy, without imposing a list
  // height: the panel's viewport limit must create a native scroll container.
  await page.evaluate(() => {
    seedQueue(true);
    const state = FeMonsterPlaybackContext.state;
    state.queue = Array.from({ length: 80 }, (_, index) => ({ id: `song-${index}`,
      title: `歌曲 ${index}`, provider: 'local' }));
    state.queueLength = state.queue.length;
    FEPlaybackQueue.render(true);
    document.getElementById('qishuiPlaybackQueueList').scrollTop = 0;
  });
  const longQueueBefore = await snapshot();
  const queueList = page.locator('#qishuiPlaybackQueueList');
  const queueRect = await queueList.boundingBox();
  assert.ok(await queueList.evaluate((list) => list.scrollHeight > list.clientHeight + 1000));
  await page.mouse.move(queueRect.x + queueRect.width / 2, queueRect.y + queueRect.height / 2);
  await page.mouse.wheel(0, 560);
  await page.waitForFunction(() => document.getElementById('qishuiPlaybackQueueList').scrollTop > 300);
  const scrolled = await queueList.evaluate((list) => list.scrollTop);
  assert.deepEqual(await snapshot(), longQueueBefore, 'wheel browsing must not play or mutate the queue');
  const offscreenIndex = await queueList.evaluate((list) => {
    const viewport = list.getBoundingClientRect();
    return Array.from(list.querySelectorAll('[data-queue-index]')).find((item) => {
      const rect = item.getBoundingClientRect();
      return rect.top > viewport.top + 10 && rect.bottom < viewport.bottom - 10;
    })?.dataset.queueIndex;
  });
  assert.ok(Number(offscreenIndex) > 3, 'wheel should reveal previously off-screen songs');
  await page.locator(`[data-queue-index="${offscreenIndex}"] strong`).click();
  assert.equal(await page.locator(`[data-queue-index="${offscreenIndex}"]`).getAttribute('aria-selected'), 'true');
  assert.deepEqual(await snapshot(), longQueueBefore, 'selecting a scrolled-to song must not start playback');
  await page.evaluate(() => FEPlaybackQueue.render(true));
  assert.equal(await queueList.evaluate((list) => list.scrollTop), scrolled, 'render must preserve scroll position');
  assert.equal(await page.locator(`[data-queue-index="${offscreenIndex}"]`).getAttribute('aria-selected'), 'true');
  await page.mouse.wheel(0, -560);
  await page.waitForFunction(() => document.getElementById('qishuiPlaybackQueueList').scrollTop < 5);
  await page.mouse.wheel(0, -500);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.scrollY), 0, 'top-edge wheel must not scroll the page');
  await page.mouse.wheel(0, 20000);
  await page.waitForFunction(() => {
    const list = document.getElementById('qishuiPlaybackQueueList');
    return list.scrollHeight - list.clientHeight - list.scrollTop < 2;
  });
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.scrollY), 0, 'bottom-edge wheel must not scroll the page');
  await page.locator('.qishui-playback-queue-panel__header').hover();
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.scrollY), 0, 'header wheel must stay inside the queue');
  assert.deepEqual(await page.evaluate(() => ({ skips: queueProbe.wheelSkips, stage: queueProbe.stageWheels })),
    { skips: [], stage: 0 }, 'queue wheel must not reach the real card skip or parent scene handler');
  assert.deepEqual(await snapshot(), longQueueBefore);

  // A refreshed server snapshot can insert songs before the selection; keep
  // the selected identity (not the old index), focus and scroll offset.
  const beforeResyncScroll = await queueList.evaluate((list) => list.scrollTop);
  await page.evaluate(async () => {
    const state = FeMonsterPlaybackContext.state;
    state.localQueueActive = false;
    queueProbe.server = { queue: [{ id: 'inserted', provider: 'netease', title: '新加入' },
      ...state.queue.map((song) => ({ ...song }))], index: state.queueIndex + 1, revision: state.queueRevision + 1 };
    await FEPlaybackQueue.refresh();
  });
  const movedSelection = Number(offscreenIndex) + 1;
  assert.equal(await page.locator(`[data-queue-index="${movedSelection}"]`).getAttribute('aria-selected'), 'true');
  assert.equal(await queueList.evaluate((list) => list.scrollTop), beforeResyncScroll);
  await page.evaluate((index) => FEPlaybackQueue.remove(index), movedSelection);
  assert.equal(await page.locator('[data-queue-index][aria-selected="true"]').count(), 0,
    'removing the selected song must not select its replacement');
  assert.deepEqual((await snapshot()).plays, []);

  // Cancelling an armed long press with the wheel must not reorder a row.
  await page.evaluate(() => document.getElementById('qishuiPlaybackQueueList').scrollTop = 0);
  const firstRow = await page.locator('[data-queue-index="0"]').boundingBox();
  const mutationsBeforeWheel = (await snapshot()).requests.length;
  await page.mouse.move(firstRow.x + 20, firstRow.y + firstRow.height / 2);
  await page.mouse.down();
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(450);
  await page.mouse.up();
  assert.equal(await page.locator('.is-reordering').count(), 0);
  assert.equal((await snapshot()).requests.length, mutationsBeforeWheel);
  assert.deepEqual((await snapshot()).plays, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, perSongButtons: true, keyboardRemoval: true,
    currentSongUninterrupted: true, remoteAndLocalQueues: true, lastSongRemoval: true,
    failedRequestsPreserveQueue: true, outdatedBackendExplained: true,
    repeatedClicksDeduplicated: true, panelStaysOpen: true, longPressReorder: true,
    reorderCancellationAndFailureSafe: true, keyboardReorder: true, clickSelectsWithoutPlaying: true,
    explicitPlayback: true,
    conflictRebasedByIdentity: true, paginatedSnapshotPreserved: true, boundedConflictRetry: true,
    providerIdentityPreserved: true, duplicateRemovalSafe: true, failedAddCreatesNoRows: true,
    queueRefreshSingleFlight: true, nativeWheelScrolling: true, scrollEdgesContained: true,
    selectionAndScrollSurviveRefresh: true, wheelCancelsLongPress: true }));
} finally {
  await browser.close();
}
