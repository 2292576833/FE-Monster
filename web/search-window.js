(function () {
  'use strict';

  const section = document.getElementById('searchSuggestions');
  const input = document.getElementById('topSearchInput');
  const windowEl = document.getElementById('searchResultsWindow');
  const listEl = document.getElementById('searchResultsWindowList');
  const titleEl = document.getElementById('searchResultsWindowTitle');
  const metaEl = document.getElementById('searchResultsWindowMeta');
  const statusEl = document.getElementById('searchResultsWindowStatus');
  const closeEl = document.getElementById('searchResultsWindowClose');
  const refreshEl = document.getElementById('searchResultsWindowRefresh');
  if (!section || !input || !windowEl || !listEl) return;

  const cache = new Map();
  let requestId = 0;
  let abortController = null;
  let inputTimer = 0;
  let currentSongs = [];
  let currentKeyword = '';

  function context() {
    return window.FeMonsterSearchContext || null;
  }

  function text(value, fallback = '') {
    const ctx = context();
    return ctx?.safeText ? ctx.safeText(value, fallback) : (String(value ?? '').trim() || fallback);
  }

  function formatDuration(value) {
    const ctx = context();
    return ctx?.formatTime ? ctx.formatTime(Number(value) || 0) : '--:--';
  }

  function setWindowOpen(open) {
    windowEl.hidden = !open;
    windowEl.setAttribute('aria-hidden', String(!open));
    document.documentElement.classList.toggle('is-search-results-window-open', !!open);
  }

  function ensureExpandControl() {
    const old = section.querySelector('.search-suggestion-expand');
    const hasItems = section.querySelector('.search-suggestion-item');
    if (!hasItems) {
      old?.remove();
      return;
    }
    if (old) {
      const count = section.querySelectorAll('.search-suggestion-item').length;
      const countEl = old.querySelector('span:last-child');
      const countText = `${count} 首 · 查看全部`;
      // textContent replaces child nodes even when the text is unchanged.
      // This subtree is observed below, so an unconditional write schedules
      // another observer microtask forever and starves the renderer/UI thread.
      if (countEl && countEl.textContent !== countText) countEl.textContent = countText;
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-suggestion-expand';
    button.setAttribute('aria-label', '展开当前平台全部搜索结果');
    button.innerHTML = '<span>展开当前平台搜索结果</span><span>查看全部</span>';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openWindow();
    });
    section.prepend(button);
  }

  function renderState(message, kind = 'loading') {
    listEl.replaceChildren();
    const node = document.createElement('div');
    node.className = `search-results-window-${kind}`;
    node.textContent = message;
    listEl.appendChild(node);
  }

  function renderResults(songs) {
    listEl.replaceChildren();
    if (!songs.length) {
      renderState(`没有找到「${currentKeyword}」`, 'empty');
      return;
    }
    const ctx = context();
    const fragment = document.createDocumentFragment();
    songs.forEach((song, index) => {
      const item = document.createElement('article');
      item.className = 'search-results-window-item';
      item.setAttribute('role', 'option');

      const number = document.createElement('span');
      number.className = 'search-results-window-index';
      number.textContent = String(index + 1).padStart(2, '0');

      const cover = document.createElement('span');
      cover.className = 'search-results-window-cover';
      cover.textContent = 'FE';
      const coverUrl = ctx?.proxiedImageUrl?.(song.cover || '');
      if (coverUrl) {
        const image = document.createElement('img');
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.src = coverUrl;
        image.addEventListener('error', () => image.remove());
        cover.appendChild(image);
      }

      const copy = document.createElement('span');
      copy.className = 'search-results-window-copy';
      const title = document.createElement('strong');
      title.textContent = text(song.title, '未命名歌曲');
      const meta = document.createElement('small');
      const artist = text(song.artist, '未知歌手');
      const album = text(song.album, '');
      meta.textContent = album ? `${artist} · ${album}` : artist;
      copy.append(title, meta);

      const duration = document.createElement('span');
      duration.className = 'search-results-window-duration';
      duration.textContent = song.duration ? formatDuration(song.duration) : '--:--';

      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'search-results-window-play';
      play.setAttribute('aria-label', `播放：${text(song.title, '歌曲')}`);
      play.append(number, cover, copy, duration);
      play.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (ctx?.playSearchSuggestion) await ctx.playSearchSuggestion(song);
      });

      const favorite = document.createElement('button');
      favorite.type = 'button';
      favorite.className = 'search-results-window-favorite glass-button-native';
      favorite.setAttribute('aria-label', '收藏歌曲');
      if (ctx?.isSongFavorite?.(song)) favorite.classList.add('is-active');
      favorite.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!ctx?.toggleFavoriteSong) return;
        const active = ctx.toggleFavoriteSong(song, { forceAdd: !ctx.isSongFavorite?.(song) });
        favorite.classList.toggle('is-active', !!active || !!ctx.isSongFavorite?.(song));
      });

      item.append(play, favorite);
      fragment.appendChild(item);
    });
    listEl.appendChild(fragment);
  }

  async function loadResults({ force = false } = {}) {
    const ctx = context();
    const keyword = text(input.value, '').trim();
    currentKeyword = keyword;
    if (!keyword || !ctx?.searchCurrentPlatformSongs) {
      renderState('输入关键词后即可展开当前平台歌曲', 'empty');
      return;
    }
    const provider = ctx.activeProvider?.() || '';
    const key = `${provider}:${keyword.toLocaleLowerCase()}`;
    const cached = !force && cache.get(key);
    if (cached) {
      currentSongs = cached;
      renderResults(cached);
      metaEl.textContent = `${ctx.providerLabel?.() || '当前平台'} · ${cached.length} 首结果`;
      statusEl.textContent = '可直接选择歌曲播放';
      return;
    }
    abortController?.abort();
    abortController = new AbortController();
    const id = ++requestId;
    renderState(`正在搜索「${keyword}」`, 'loading');
    metaEl.textContent = `${ctx.providerLabel?.() || '当前平台'} · 正在读取更多结果`;
    statusEl.textContent = '正在同步当前平台歌曲';
    try {
      const result = await ctx.searchCurrentPlatformSongs(keyword, {
        signal: abortController.signal,
        pageSize: 50,
        maxPages: 4
      });
      if (id !== requestId) return;
      currentSongs = Array.isArray(result?.songs) ? result.songs : [];
      cache.set(key, currentSongs);
      renderResults(currentSongs);
      metaEl.textContent = `${ctx.providerLabel?.() || '当前平台'} · ${currentSongs.length} 首结果`;
      statusEl.textContent = currentSongs.length ? '可直接选择歌曲播放' : '换个关键词试试';
    } catch (error) {
      if (error?.name === 'AbortError' || id !== requestId) return;
      renderState(error?.message || '搜索失败，请稍后重试', 'empty');
      metaEl.textContent = `${ctx.providerLabel?.() || '当前平台'} · 搜索失败`;
      statusEl.textContent = '请检查音源配置';
    }
  }

  function openWindow() {
    setWindowOpen(true);
    void loadResults();
  }

  function closeWindow() {
    setWindowOpen(false);
  }

  closeEl?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeWindow();
  });
  refreshEl?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void loadResults({ force: true });
  });
  windowEl.addEventListener('pointerdown', (event) => event.stopPropagation());
  document.addEventListener('pointerdown', (event) => {
    if (windowEl.hidden || event.target.closest('#searchResultsWindow, #topSearchForm, #searchSuggestions')) return;
    closeWindow();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || windowEl.hidden) return;
    closeWindow();
  }, true);
  input.addEventListener('input', () => {
    if (windowEl.hidden) return;
    window.clearTimeout(inputTimer);
    inputTimer = window.setTimeout(() => void loadResults(), 220);
  });

  const observer = new MutationObserver(() => ensureExpandControl());
  observer.observe(section, { childList: true, subtree: true });
  ensureExpandControl();
})();
