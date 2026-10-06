(function createPlaybackQueue(global) {
  'use strict';

  const context = global.FeMonsterPlaybackContext;
  if (!context || !context.els) return;
  const { els, state } = context;
  const $ = (id) => document.getElementById(id);
  const button = $('qishuiPlaybackQueueButton');
  const panel = $('qishuiPlaybackQueuePanel');
  const closeButton = $('qishuiPlaybackQueueClose');
  const list = $('qishuiPlaybackQueueList');
  const count = $('qishuiPlaybackQueueCount');
  const meta = $('qishuiPlaybackQueuePanelMeta');
  if (!button || !panel || !list) return;

  let open = false;
  let lastSignature = '';
  let observer = null;
  let renderTimer = 0;
  let removalPending = false;
  let reorderPending = false;
  let additionPending = false;
  let queueRefreshPromise = null;
  let lastQueueRefreshAt = 0;
  let queueDrag = null;
  let suppressClickUntil = 0;
  let selectedEntry = null;
  const QUEUE_HOLD_MS = 360;

  function text(value, fallback = '') {
    const result = String(value ?? '').trim();
    return result || fallback;
  }

  function queueSongAt(index) {
    return Array.isArray(state.queue) ? state.queue[index] : null;
  }

  function captureQueueEntry(index) {
    const song = queueSongAt(index);
    return song ? { song, index, snapshot: state.queue.slice() } : null;
  }

  function findQueueEntry(entry, queue) {
    if (!entry) return -1;
    const sameSong = (song) => String(song?.id || '') === String(entry.song.id || '')
      && String(song?.provider || '') === String(entry.song.provider || '');
    if (sameQueueSnapshot(queue, entry.snapshot) && sameSong(queue[entry.index])) return entry.index;
    const references = queue.reduce((indices, song, index) => {
      if (song === entry.song) indices.push(index);
      return indices;
    }, []);
    if (references.length === 1) return references[0];
    const matches = queue.reduce((indices, song, index) => {
      if (sameSong(song)) indices.push(index);
      return indices;
    }, []);
    return matches.length === 1 ? matches[0] : -1;
  }

  function selectQueueIndex(index, focus = false) {
    const numeric = Number(index);
    if (!Number.isInteger(numeric) || !queueSongAt(numeric)) return;
    selectedEntry = captureQueueEntry(numeric);
    for (const item of list.querySelectorAll('[data-queue-index]')) {
      item.setAttribute('aria-selected', String(Number(item.dataset.queueIndex) === numeric));
    }
    if (focus) {
      const item = list.querySelector(`[data-queue-index="${numeric}"]`);
      item?.focus({ preventScroll: true });
      item?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function setOpen(next) {
    if (!next) finishQueueDrag(false);
    open = !!next;
    panel.hidden = !open;
    panel.inert = !open;
    panel.setAttribute('aria-hidden', open ? 'false' : 'true');
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.classList.toggle('is-open', open);
    button.classList.toggle('is-active', open);
    if (open) {
      render(true);
      if (!state.localQueueActive) void refreshQueue().catch((error) => {
        if (open) meta.textContent = text(error?.message, '队列同步失败，请稍后重试');
      });
    }
  }

  function cover(song) {
    const url = context.coverUrl?.(song) || song?.cover || song?.coverUrl || '';
    return String(url || '');
  }

  function render(force = false) {
    if (queueDrag) return;
    const queue = Array.isArray(state.queue) ? state.queue : [];
    const signature = `${state.queueIndex}|${removalPending}|${reorderPending}|${additionPending}|${queue.map((song) => `${song?.provider || ''}:${song?.id || ''}:${song?.title || ''}`).join('|')}`;
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    count.textContent = String(queue.length);
    const currentIndex = Number(state.queueIndex);
    meta.textContent = queue.length
      ? `${queue.length} 首 · ${currentIndex >= 0 ? `当前第 ${currentIndex + 1} 首` : '当前播放的歌曲不在队列中'}`
      : '暂无排队歌曲';
    const scrollTop = list.scrollTop;
    const focused = list.contains(document.activeElement) ? document.activeElement : null;
    const focusedItem = focused?.closest('[data-queue-index]');
    const focusedIndex = focusedItem ? Number(focusedItem.dataset.queueIndex) : -1;
    const focusedEntry = focusedItem?._queueEntry;
    const focusedAction = focused?.dataset.queueAction;
    const selectedIndex = findQueueEntry(selectedEntry, queue);
    selectedEntry = selectedIndex >= 0 ? captureQueueEntry(selectedIndex) : null;
    const renderedSnapshot = queue.slice();
    list.replaceChildren();
    if (!queue.length) {
      const empty = document.createElement('li');
      empty.className = 'qishui-playback-queue-empty';
      empty.textContent = '播放歌曲后，排队内容会显示在这里';
      list.appendChild(empty);
      return;
    }
    queue.forEach((song, index) => {
      const item = document.createElement('li');
      item.className = 'qishui-playback-queue-item';
      item.dataset.queueIndex = String(index);
      item._queueEntry = { song, index, snapshot: renderedSnapshot };
      item.setAttribute('role', 'option');
      item.tabIndex = 0;
      item.setAttribute('aria-selected', String(index === selectedIndex));
      if (index === currentIndex) item.setAttribute('aria-current', 'true');
      item.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown Home End Alt+ArrowUp Alt+ArrowDown');
      item.title = '单击仅选中，点击播放按钮播放；长按拖动或 Alt + ↑ / ↓ 调整顺序';
      const coverWrap = document.createElement('span');
      coverWrap.className = 'qishui-playback-queue-item__cover';
      const imageUrl = cover(song);
      if (imageUrl) {
        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = '';
        image.loading = 'lazy';
        image.draggable = false;
        coverWrap.appendChild(image);
      } else {
        coverWrap.textContent = 'FE';
      }
      const copy = document.createElement('span');
      copy.className = 'qishui-playback-queue-item__copy';
      const title = document.createElement('strong');
      title.textContent = text(song?.title, '未命名歌曲');
      const artist = document.createElement('small');
      artist.textContent = text(song?.artist || song?.album, text(song?.provider, '音乐'));
      copy.append(title, artist);
      const stateMark = document.createElement('span');
      stateMark.className = 'qishui-playback-queue-item__state';
      stateMark.textContent = index === Number(state.queueIndex) ? '正在播放' : `${index + 1}`;
      const playButton = document.createElement('button');
      playButton.type = 'button';
      playButton.className = 'qishui-playback-queue-item__play glass-button-native';
      playButton.dataset.queueAction = 'play';
      playButton.disabled = removalPending || reorderPending || additionPending;
      playButton.title = '播放这首歌';
      playButton.setAttribute('aria-label', `播放：${text(song?.title, '未命名歌曲')}`);
      playButton.textContent = '▶';
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'qishui-playback-queue-item__remove glass-button-native';
      removeButton.dataset.queueAction = 'remove';
      removeButton.disabled = removalPending || reorderPending || additionPending;
      removeButton.title = '踢出队列';
      removeButton.setAttribute('aria-label', `踢出队列：${text(song?.title, '未命名歌曲')}`);
      removeButton.textContent = '×';
      item.append(coverWrap, copy, stateMark, playButton, removeButton);
      list.appendChild(item);
    });
    if (focusedIndex >= 0) {
      const nextFocusIndex = findQueueEntry(focusedEntry, queue);
      const row = list.querySelector(`[data-queue-index="${nextFocusIndex}"]`);
      const target = focusedAction ? row?.querySelector(`[data-queue-action="${focusedAction}"]`) : row;
      target?.focus({ preventScroll: true });
    }
    list.scrollTop = scrollTop;
  }

  async function playQueueIndex(index) {
    if (removalPending || reorderPending || additionPending || queueDrag?.active) return;
    const numeric = Number(index);
    if (!Number.isInteger(numeric) || !queueSongAt(numeric)) return;
    setOpen(false);
    if (typeof context.playQueueIndex === 'function') {
      await context.playQueueIndex(numeric);
      render(true);
    }
  }

  function isLocalSong(song) {
    return String(song?.provider || '').toLowerCase() === 'local'
      || String(song?.sourceRef?.kind || '').toLowerCase() === 'local';
  }

  function isSameSong(left, right) {
    return !!left?.id && !!right?.id
      && String(left.id) === String(right.id)
      && String(left.provider || '') === String(right.provider || '');
  }

  function sameQueueSnapshot(left, right) {
    return Array.isArray(left) && left.length === right.length
      && left.every((song, index) => isSameSong(song, right[index]));
  }

  // /player/state intentionally omits queue entries. Never pair its newer
  // revision with old rows: read all pages from one consistent queue snapshot.
  function refreshQueue() {
    if (state.localQueueActive) return Promise.resolve(false);
    if (queueRefreshPromise) return queueRefreshPromise;
    lastQueueRefreshAt = performance.now();
    queueRefreshPromise = (async () => {
      const startingRevision = state.queueRevision;
      const controller = new AbortController();
      const timeout = global.setTimeout(() => controller.abort(), 12_000);
      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const songs = [];
          let cursor = 0;
          let revision = null;
          let total = 0;
          let queueIndex = -1;
          let changed = false;
          do {
            const response = await fetch(`/api/player/queue?cursor=${cursor}&limit=200`, { signal: controller.signal, cache: 'no-store' });
            if (!response.ok) throw new Error('队列同步失败，请稍后重试');
            const page = await response.json();
            if (!Array.isArray(page.items) || !Number.isInteger(page.queueRevision)
              || !Number.isInteger(page.total) || page.total < 0) throw new Error('队列数据暂不可用，请稍后重试');
            if (revision !== null && (revision !== page.queueRevision || total !== page.total)) { changed = true; break; }
            revision = page.queueRevision;
            total = page.total;
            queueIndex = Number.isInteger(page.queueIndex) ? page.queueIndex : -1;
            songs.push(...page.items);
            const next = page.nextCursor;
            if (next == null) { cursor = null; break; }
            if (!Number.isInteger(next) || next <= cursor || next !== songs.length || next >= total) {
              throw new Error('队列分页无效，请稍后重试');
            }
            cursor = next;
          } while (cursor !== null);
          if (changed) continue;
          if (songs.length !== total) throw new Error('队列尚未同步完整，请稍后重试');
          if (state.localQueueActive) return false;
          // A read opened during a mutation can finish after its ACK. Retry
          // rather than roll the committed membership/revision backwards.
          if (state.queueRevision !== startingRevision && revision < state.queueRevision) continue;
          state.queue = songs;
          state.queueLength = total;
          state.queueIndex = queueIndex;
          state.queueRevision = revision;
          state.queueServerRevision = revision;
          if (state.playbackSelection?.kind === 'queue') state.playbackSelection.index = queueIndex;
          if (state.playerStateSync) state.playerStateSync.requestId += 1;
          return true;
        }
        throw new Error('队列正在更新，请稍后重试');
      } catch (error) {
        if (error?.name === 'AbortError') throw new Error('队列同步超时，请稍后重试');
        throw error;
      } finally {
        global.clearTimeout(timeout);
      }
    })().finally(() => { queueRefreshPromise = null; render(); });
    return queueRefreshPromise;
  }

  function refreshedSongIndex(song, originalIndex, original) {
    const originallyRepeated = original.filter((candidate) => isSameSong(candidate, song)).length > 1;
    if (originallyRepeated && !sameQueueSnapshot(state.queue, original)) {
      throw new Error('队列中有重复歌曲，已同步列表，请重新选择');
    }
    const matches = state.queue.reduce((indices, candidate, index) => {
      if (String(candidate?.id || '') === String(song?.id || '')
        && (!song.provider || String(candidate?.provider || '') === String(song.provider))) indices.push(index);
      return indices;
    }, []);
    if (matches.length <= 1) return matches[0] ?? -1;
    if (sameQueueSnapshot(state.queue, original) && matches.includes(originalIndex)) return originalIndex;
    throw new Error('队列中有重复歌曲，已同步列表，请重新选择');
  }

  async function mutateRemoteQueue(action, makeBody) {
    if (!await refreshQueue()) throw new Error('队列已切换，请重新选择歌曲');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (state.localQueueActive) throw new Error('队列已切换，请重新选择歌曲');
      const body = makeBody();
      if (!body) return null; // The selected entry already left the queue.
      const before = state.queue.slice();
      const controller = new AbortController();
      const timeout = global.setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch(`/api/player/queue/${action}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ ...body, expectedRevision: state.queueRevision })
        });
        if ([404, 405, 501].includes(response.status)) {
          throw new Error(`当前后台尚未启用队列${action === 'remove' ? '移除' : '排序'}，请关闭并重新打开客户端后重试`);
        }
        const payload = await response.json();
        if (response.ok && payload?.ok === true && payload[action === 'remove' ? 'removed' : 'moved'] === true) {
          return { payload, before, body };
        }
        if (payload?.code !== 'queue_changed') throw new Error('队列操作失败，请稍后重试');
        await refreshQueue();
        if (attempt > 0) throw new Error('队列已自动同步，请重新选择歌曲操作');
      } finally { global.clearTimeout(timeout); }
    }
  }

  function movedQueueIndex(index, from, to) {
    if (index === from) return to;
    if (from < index && to >= index) return index - 1;
    if (from > index && to <= index) return index + 1;
    return index;
  }

  async function moveInQueue(fromIndex, toIndex) {
    let from = Number(fromIndex);
    let to = Number(toIndex);
    const song = queueSongAt(from);
    const targetSong = queueSongAt(to);
    if (removalPending || reorderPending || additionPending || queueDrag || !Number.isInteger(from)
      || !Number.isInteger(to) || !song || !queueSongAt(to) || from === to) return false;
    const selectedQueue = state.queue.slice();
    let original = selectedQueue;
    const local = state.localQueueActive || isLocalSong(song);
    reorderPending = true;
    render(true);
    meta.textContent = '正在保存播放顺序…';
    let message = '';
    try {
      let payload = null;
      if (!local) {
        const result = await mutateRemoteQueue('move', () => {
          const currentFrom = refreshedSongIndex(song, Number(fromIndex), selectedQueue);
          const currentTo = refreshedSongIndex(targetSong, Number(toIndex), selectedQueue);
          if (currentFrom < 0 || currentTo < 0) throw new Error('目标歌曲已离开队列，列表已自动同步');
          const entry = state.queue[currentFrom];
          return { fromIndex: currentFrom, toIndex: currentTo, songId: String(entry.id), provider: String(entry.provider || '') };
        });
        ({ payload, before: original } = result);
        from = result.body.fromIndex;
        to = result.body.toIndex;
      }
      const reordered = original.slice();
      reordered.splice(to, 0, reordered.splice(from, 1)[0]);
      // A poll may have already applied the new order. Never move it twice or
      // overwrite a different queue that arrived while this request was pending.
      if ((local || !state.localQueueActive) && sameQueueSnapshot(state.queue, original)
        && (local || Number(state.queueRevision) <= Number(payload.queueRevision))) {
        state.queue = reordered;
        state.queueIndex = movedQueueIndex(Number(state.queueIndex), from, to);
        state.queueLength = payload && Number.isInteger(payload.queueLength) ? payload.queueLength : reordered.length;
        if (payload && Number.isInteger(payload.queueRevision)) state.queueRevision = payload.queueRevision;
      } else if (!sameQueueSnapshot(state.queue, reordered)) {
        await refreshQueue();
      }
      if (!local) {
        state.queueServerRevision = Math.max(Number(state.queueServerRevision) || 0, payload.queueRevision);
        await refreshQueue().catch(() => {});
      }
      if (state.playbackSelection?.kind === 'queue') state.playbackSelection.index = state.queueIndex;
      if (state.playerStateSync) state.playerStateSync.requestId += 1;
      return true;
    } catch (error) {
      message = error?.name === 'AbortError' ? '保存播放顺序超时，请稍后重试'
        : text(error?.message, '保存播放顺序失败，请稍后重试');
      return false;
    } finally {
      reorderPending = false;
      render(true);
      if (message) meta.textContent = message;
    }
  }

  function previewQueueDrag() {
    const drag = queueDrag;
    if (!drag?.active) return;
    const siblings = Array.from(list.querySelectorAll('.qishui-playback-queue-item'))
      .filter((item) => item !== drag.item);
    let target = 0;
    for (const item of siblings) {
      const rect = item.getBoundingClientRect();
      if (drag.y < rect.top + rect.height / 2) break;
      target += 1;
    }
    const before = siblings[target] || null;
    if (drag.item.nextElementSibling !== before) list.insertBefore(drag.item, before);
    drag.to = target;
  }

  function autoScrollQueueDrag() {
    const drag = queueDrag;
    if (!drag?.active) return;
    drag.frame = 0;
    const rect = list.getBoundingClientRect();
    const delta = drag.y < rect.top + 30 ? -10 : drag.y > rect.bottom - 30 ? 10 : 0;
    const previous = list.scrollTop;
    if (delta) list.scrollTop += delta;
    if (list.scrollTop !== previous) {
      previewQueueDrag();
      drag.frame = global.requestAnimationFrame(autoScrollQueueDrag);
    }
  }

  function finishQueueDrag(commit) {
    const drag = queueDrag;
    if (!drag) return;
    queueDrag = null;
    global.clearTimeout(drag.timer);
    global.cancelAnimationFrame(drag.frame || 0);
    try { if (list.hasPointerCapture(drag.pointerId)) list.releasePointerCapture(drag.pointerId); } catch {}
    list.classList.remove('is-reordering');
    // A normal tap must keep its original row until the subsequent click fires.
    if (!drag.active && !drag.scrolling) return;
    if (drag.active || drag.scrolling) suppressClickUntil = performance.now() + 600;
    if (commit && drag.active && drag.from !== drag.to) {
      if (state.queueRevision !== drag.revision || !sameQueueSnapshot(state.queue, drag.snapshot)) {
        render(true);
        meta.textContent = '队列已变化，请重新打开队列后再拖动';
      } else {
        void moveInQueue(drag.from, drag.to);
      }
    } else {
      render(true);
    }
  }

  list.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.isPrimary === false || removalPending || reorderPending || additionPending || queueDrag) return;
    const item = event.target.closest('.qishui-playback-queue-item');
    if (!item || event.target.closest('[data-queue-action]')) return;
    const from = Number(item.dataset.queueIndex);
    const drag = { item, from, to: from, pointerId: event.pointerId, pointerType: event.pointerType,
      x: event.clientX, y: event.clientY, startY: event.clientY, previousY: event.clientY,
      snapshot: state.queue.slice(), revision: state.queueRevision, active: false, scrolling: false, frame: 0 };
    queueDrag = drag;
    drag.timer = global.setTimeout(() => {
      if (queueDrag !== drag || drag.scrolling) return;
      drag.active = true;
      item.classList.add('is-dragging');
      list.classList.add('is-reordering');
      try { list.setPointerCapture(drag.pointerId); } catch {}
      meta.textContent = '拖动调整顺序，松手保存 · Esc 取消';
    }, QUEUE_HOLD_MS);
  });
  global.addEventListener('pointermove', (event) => {
    const drag = queueDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.y = event.clientY;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.startY) > 8) {
        global.clearTimeout(drag.timer);
        if (drag.pointerType !== 'touch') { drag.scrolling = true; finishQueueDrag(false); return; }
        drag.scrolling = true;
        try { list.setPointerCapture(drag.pointerId); } catch {}
      }
      if (drag.scrolling) {
        event.preventDefault();
        list.scrollTop += drag.previousY - event.clientY;
      }
      drag.previousY = event.clientY;
      return;
    }
    event.preventDefault();
    previewQueueDrag();
    if (!drag.frame) drag.frame = global.requestAnimationFrame(autoScrollQueueDrag);
  }, { passive: false });
  global.addEventListener('pointerup', (event) => {
    if (queueDrag?.pointerId === event.pointerId) finishQueueDrag(true);
  });
  global.addEventListener('pointercancel', (event) => {
    if (queueDrag?.pointerId === event.pointerId) finishQueueDrag(false);
  });
  list.addEventListener('lostpointercapture', (event) => {
    if (queueDrag?.pointerId === event.pointerId) finishQueueDrag(false);
  });
  list.addEventListener('contextmenu', (event) => { if (queueDrag) event.preventDefault(); });
  global.addEventListener('blur', () => finishQueueDrag(false));

  async function removeFromQueue(index) {
    const numeric = Number(index);
    const song = queueSongAt(numeric);
    if (removalPending || reorderPending || additionPending || queueDrag || !Number.isInteger(numeric) || !song) return false;
    const original = state.queue.slice();
    const local = isLocalSong(song) || state.localQueueActive;
    const focusWasInside = list.contains(document.activeElement);
    removalPending = true;
    render(true);
    let payload = null;
    let before = original;
    let removalIndex = numeric;
    let errorMessage = '';
    try {
      if (!local) {
        const result = await mutateRemoteQueue('remove', () => {
          const currentIndex = refreshedSongIndex(song, numeric, original);
          if (currentIndex < 0) return null;
          const entry = state.queue[currentIndex];
          return { index: currentIndex, songId: String(entry.id), provider: String(entry.provider || '') };
        });
        if (!result) return true;
        ({ payload, before } = result);
        removalIndex = result.body.index;
      }
      // A poll/refresh may already contain the result. Only edit the exact
      // request snapshot, never remove a second duplicate from a newer queue.
      const queue = Array.isArray(state.queue) ? state.queue : [];
      if ((local || !state.localQueueActive) && sameQueueSnapshot(queue, before)
        && (local || Number(state.queueRevision) <= payload.queueRevision)) {
        const currentIndex = Number(state.queueIndex);
        state.queue = queue.filter((_item, itemIndex) => itemIndex !== removalIndex);
        state.queueIndex = currentIndex === removalIndex ? -1
          : currentIndex > removalIndex ? currentIndex - 1 : currentIndex;
        state.queueLength = payload ? payload.queueLength : state.queue.length;
        if (payload) state.queueRevision = payload.queueRevision;
      }
      if (!local) {
        state.queueServerRevision = Math.max(Number(state.queueServerRevision) || 0, payload.queueRevision);
        await refreshQueue().catch(() => {});
      }
      if (state.playbackSelection?.kind === 'queue') state.playbackSelection.index = state.queueIndex;
      if (state.playerStateSync) state.playerStateSync.requestId += 1;
      // Removing the playing row only changes membership. Its audio source,
      // timestamp and play/pause state must remain untouched.
      return true;
    } catch (error) {
      errorMessage = error?.name === 'AbortError' ? '移出队列超时，请稍后重试'
        : text(error?.message, '移出队列失败，请稍后重试');
      return false;
    } finally {
      removalPending = false;
      render(true);
      if (errorMessage) meta.textContent = errorMessage;
      if (focusWasInside && open) {
        const remaining = list.querySelectorAll('.qishui-playback-queue-item__remove');
        (remaining[Math.min(numeric, remaining.length - 1)] || closeButton)?.focus({ preventScroll: true });
      }
    }
  }

  async function addToQueue(song) {
    if (!song || !song.id || additionPending || removalPending || reorderPending || queueDrag) return;
    const queue = Array.isArray(state.queue) ? state.queue : (state.queue = []);
    if (isLocalSong(song) || state.localQueueActive) {
      if (queue.some((item) => isSameSong(item, song))) { setOpen(true); return; }
      queue.push(song);
      state.queueLength = queue.length;
      if (isSameSong(state.currentSong, song)) state.queueIndex = queue.length - 1;
      setOpen(true);
      render(true);
      return;
    }
    additionPending = true;
    setOpen(true);
    let message = '';
    const controller = new AbortController();
    const timeout = global.setTimeout(() => controller.abort(), 12_000);
    try {
      await refreshQueue();
      if (state.localQueueActive) throw new Error('队列已切换，请重新选择歌曲');
      const response = await fetch('/api/player/queue/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ songs: [song], mode: 'append' })
      });
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true) throw new Error('加入队列失败，请稍后重试');
      state.queueServerRevision = payload.queueRevision;
      await refreshQueue();
      return true;
    } catch (error) {
      // Only authoritative entries can be safely removed or reordered later.
      message = error?.name === 'AbortError' ? '加入队列超时，请稍后重试'
        : text(error?.message, '加入队列失败，请稍后重试');
      return false;
    } finally {
      global.clearTimeout(timeout);
      additionPending = false;
      render(true);
      if (message) meta.textContent = message;
    }
  }

  function ensureShelfQueueButtons() {
    document.querySelectorAll('.shelf-song-button').forEach((songButton) => {
      if (songButton.querySelector('.shelf-song-queue-button')) return;
      const queueButton = document.createElement('span');
      queueButton.className = 'shelf-song-queue-button';
      queueButton.dataset.queueAction = 'append';
      queueButton.setAttribute('role', 'button');
      queueButton.setAttribute('tabindex', '-1');
      queueButton.setAttribute('aria-label', '加入歌曲队列');
      queueButton.title = '加入歌曲队列';
      queueButton.innerHTML = '<span aria-hidden="true">＋</span>';
      songButton.appendChild(queueButton);
    });
  }

  button.addEventListener('click', () => setOpen(!open));
  closeButton?.addEventListener('click', () => setOpen(false));
  // Let the browser scroll the list, not the parent card's wheel-to-skip
  // or the scene's wheel-to-zoom handler (including at either list edge).
  panel.addEventListener('wheel', (event) => {
    event.stopPropagation();
    if (!list.contains(event.target)) event.preventDefault();
    if (queueDrag) finishQueueDrag(false);
  }, { passive: false });
  list.addEventListener('click', (event) => {
    if (performance.now() < suppressClickUntil || reorderPending) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const item = event.target.closest('.qishui-playback-queue-item');
    if (event.target.closest('[data-queue-action="remove"]')) {
      event.preventDefault();
      event.stopPropagation();
      if (item) void removeFromQueue(item.dataset.queueIndex);
      return;
    }
    if (item) {
      event.preventDefault();
      event.stopPropagation();
      selectQueueIndex(item.dataset.queueIndex);
      if (event.target.closest('[data-queue-action="play"]')) void playQueueIndex(item.dataset.queueIndex);
    }
  });
  list.addEventListener('keydown', (event) => {
    if (event.target.closest('[data-queue-action]')) return;
    const item = event.target.closest('.qishui-playback-queue-item');
    if (item && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const from = Number(item.dataset.queueIndex);
      const to = from + (event.key === 'ArrowUp' ? -1 : 1);
      void moveInQueue(from, to).then((moved) => {
        if (moved && open) list.querySelector(`[data-queue-index="${to}"]`)?.focus({ preventScroll: true });
      });
      return;
    }
    if (!item || event.altKey || event.ctrlKey || event.metaKey) return;
    const index = Number(item.dataset.queueIndex);
    const last = state.queue.length - 1;
    const destination = { ArrowUp: Math.max(0, index - 1), ArrowDown: Math.min(last, index + 1),
      Home: 0, End: last, Enter: index, ' ': index }[event.key];
    if (!Number.isInteger(destination)) return;
    event.preventDefault();
    event.stopPropagation();
    selectQueueIndex(destination, true);
  });
  document.addEventListener('click', (event) => {
    const queueButton = event.target.closest('.shelf-song-queue-button');
    if (!queueButton) return;
    event.preventDefault();
    event.stopPropagation();
    const songButton = queueButton.closest('.shelf-song-button');
    const index = Number(songButton?.dataset.songIndex);
    const song = Array.isArray(state.activePlaylistSongs) ? state.activePlaylistSongs[index] : null;
    addToQueue(song);
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && queueDrag) {
      event.preventDefault();
      finishQueueDrag(false);
      return;
    }
    if (event.key === 'Escape' && open) setOpen(false);
  });
  observer = new MutationObserver(ensureShelfQueueButtons);
  observer.observe(document.body, { childList: true, subtree: true });
  ensureShelfQueueButtons();
  render(true);
  renderTimer = global.setInterval(() => {
    if (open && !state.localQueueActive && !queueDrag && !removalPending && !reorderPending && !additionPending
      && Number.isInteger(state.queueServerRevision) && state.queueServerRevision !== state.queueRevision
      && performance.now() - lastQueueRefreshAt > 2000) {
      void refreshQueue().catch((error) => { if (open) meta.textContent = error.message; });
    }
    render();
    ensureShelfQueueButtons();
  }, 420);
  global.addEventListener('beforeunload', () => {
    observer?.disconnect();
    global.clearInterval(renderTimer);
  }, { once: true });

  global.FEPlaybackQueue = Object.freeze({ open: () => setOpen(true), close: () => setOpen(false), render,
    refresh: refreshQueue, add: addToQueue, remove: removeFromQueue, move: moveInQueue });
})(window);
