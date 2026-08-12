(() => {
  'use strict';

  const bridge = window.FeMonsterCreativeBridge;
  if (!bridge) return;

  const WORK_TYPES = Object.freeze({
    wallpaper: Object.freeze({ label: '壁纸', accept: 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm', maxBytes: 512 * 1024 * 1024 }),
    character: Object.freeze({ label: '登录角色', accept: 'application/json,.json,.fecharacter', maxBytes: 32 * 1024 }),
    cursor: Object.freeze({ label: '鼠标光标', accept: 'image/png,image/jpeg,image/webp,image/gif', maxBytes: 4 * 1024 * 1024 }),
    'cursor-trail': Object.freeze({ label: '鼠标尾迹', accept: 'application/json,.json,.fetrail', maxBytes: 32 * 1024 }),
    music: Object.freeze({ label: '音乐', accept: 'audio/mpeg,audio/flac,audio/wav,audio/x-wav,audio/mp4,audio/ogg,.mp3,.flac,.wav,.m4a,.ogg', maxBytes: 256 * 1024 * 1024 })
  });
  const TYPE_ALIASES = Object.freeze({ role: 'character', trail: 'cursor-trail', mouse: 'cursor' });
  const state = {
    kind: 'all',
    view: 'browse',
    query: '',
    loading: false,
    publishing: false,
    items: [],
    commentsByWork: new Map(),
    commentsOpenId: '',
    commentsLoadingId: '',
    shareOpenId: '',
    squareLoading: false,
    squareSending: false,
    squareMessages: [],
    viewerId: '',
    viewer: null,
    viewerLoading: false,
    viewerReturnPage: 'market',
    publishPreviewObjectUrl: '',
    refreshTimer: 0
  };

  const $ = (selector) => document.querySelector(selector);
  const els = {};

  function bindDom() {
    Object.assign(els, {
      marketMeta: $('#communityMarketMeta'),
      marketRefresh: $('#communityMarketRefresh'),
      marketSearch: $('#communityMarketSearch'),
      marketList: $('#communityMarketList'),
      marketTabs: $('#communityMarketCategoryTabs'),
      marketPublishOpen: $('#communityMarketPublishOpen'),
      marketBrowseView: $('#communityMarketBrowseView'),
      marketPublishView: $('#communityMarketPublishView'),
      marketPublishForm: $('#communityMarketPublishForm'),
      marketPublishType: $('#communityMarketPublishType'),
      marketPublishTitle: $('#communityMarketPublishTitle'),
      marketPublishDescription: $('#communityMarketPublishDescription'),
      marketPublishTags: $('#communityMarketPublishTags'),
      marketPublishAsset: $('#communityMarketPublishAsset'),
      marketPublishAssetName: $('#communityMarketPublishAssetName'),
      marketPublishPreview: $('#communityMarketPublishPreview'),
      marketPublishPreviewName: $('#communityMarketPublishPreviewName'),
      marketPublishPreviewImage: $('#communityMarketPublishPreviewImage'),
      marketPublishPreviewPlaceholder: $('#communityMarketPublishPreviewPlaceholder'),
      marketPublishSubmit: $('#communityMarketPublishSubmit'),
      marketPublishCancel: $('#communityMarketPublishCancel'),
      marketPublishClose: $('#communityMarketPublishClose'),
      marketPublishStatus: $('#communityMarketPublishStatus'),
      marketPublishProgress: $('#communityMarketPublishProgress'),
      squarePage: $('#communityProfileSquarePage'),
      squareMeta: $('#communitySquareMeta'),
      squareRefresh: $('#communitySquareRefresh'),
      squareList: $('#communitySquareList'),
      squareForm: $('#communitySquareForm'),
      squareInput: $('#communitySquareInput'),
      squareSend: $('#communitySquareSend'),
      profileDialog: $('#communityProfileDialog'),
      viewerPage: $('#communityProfileViewerPage'),
      viewerAvatar: $('#communityViewerAvatar'),
      viewerName: $('#communityViewerName'),
      viewerId: $('#communityViewerId'),
      viewerBio: $('#communityViewerBio'),
      viewerMeta: $('#communityViewerMeta'),
      viewerStats: $('#communityViewerStats'),
      viewerWorksCount: $('#communityProfileViewerWorksCount'),
      viewerFriendsCount: $('#communityProfileViewerFriendsCount'),
      viewerLikesCount: $('#communityProfileViewerLikesCount'),
      viewerWorksMeta: $('#communityProfileViewerWorksMeta'),
      viewerWorks: $('#communityProfileViewerWorks'),
      viewerAddFriend: $('#communityViewerAddFriend'),
      viewerMessage: $('#communityViewerMessage'),
      viewerIdentityCard: $('#communityViewerIdentityCard'),
      viewerBack: $('#communityViewerBack')
    });
  }

  function text(value, fallback = '') {
    const result = String(value ?? '').trim();
    return result || fallback;
  }

  function workflowError(message, code = 'community_action_failed') {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function workType(item = {}) {
    const raw = text(item.type || item.kind, 'preset').toLowerCase();
    return TYPE_ALIASES[raw] || raw;
  }

  function typeLabel(type) {
    if (type === 'preset') return '场景预设';
    if (type === 'component') return '场景组件';
    return WORK_TYPES[type]?.label || '作品';
  }

  function currentContext() {
    return bridge.getContext?.() || { provider: 'netease', profile: null, friends: [] };
  }

  function signedPath(path) {
    const provider = text(currentContext().provider, 'netease');
    return `${path}${path.includes('?') ? '&' : '?'}provider=${encodeURIComponent(provider)}`;
  }

  function trustedAssetUrl(value) {
    const url = text(value, '');
    if (/^\/api\/creative-market\/assets\/[A-Za-z0-9._~-]+(?:\?.*)?$/.test(url)) return url;
    if (/^\/api\/sandbox\/assets\?/.test(url)) return url;
    if (/^assets\/[A-Za-z0-9_./-]+$/.test(url)) {
      const segments = url.split('/');
      if (!segments.some((segment) => segment === '.' || segment === '..')) return url;
    }
    return '';
  }

  function trustedAvatarUrl(value) {
    const url = text(value, '');
    if (/^https?:\/\//i.test(url) || /^\/api\//.test(url) || /^data:image\/(?:png|jpeg|webp);base64,/i.test(url)) return url;
    return '';
  }

  function workPreviewUrl(item = {}) {
    return trustedAssetUrl(
      item.previewUrl
      || item.preview?.url
      || item.previewAsset?.url
      || item.coverUrl
      || item.component?.asset?.previewUrl
    );
  }

  function workAssetUrl(item = {}) {
    return trustedAssetUrl(item.assetUrl || item.asset?.url || item.primaryAsset?.url);
  }

  function workAuthor(item = {}) {
    const author = item.author && typeof item.author === 'object' ? item.author : {};
    return {
      id: text(author.feId || author.id || item.authorId, ''),
      name: text(author.username || author.name, 'FE 创作者'),
      avatarUrl: trustedAvatarUrl(author.avatarUrl || author.avatar)
    };
  }

  function make(tag, className = '', content = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content !== '') element.textContent = content;
    return element;
  }

  function button(label, action, workId = '') {
    const element = make('button', '', label);
    element.type = 'button';
    element.dataset.marketAction = action;
    if (workId) element.dataset.workId = workId;
    return element;
  }

  function humanCount(value) {
    const amount = Math.max(0, Number(value) || 0);
    if (amount >= 10000) return `${(amount / 10000).toFixed(amount >= 100000 ? 0 : 1)}万`;
    return String(Math.round(amount));
  }

  function formatTime(value) {
    const timestamp = Number(value) || 0;
    if (!timestamp) return '刚刚';
    try {
      return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
    } catch (error) {
      return '刚刚';
    }
  }

  function setPublishStatus(message, progress = null, isError = false) {
    if (els.marketPublishStatus) {
      els.marketPublishStatus.textContent = message;
      els.marketPublishStatus.classList.toggle('is-error', isError);
    }
    if (els.marketPublishProgress) {
      const percent = progress === null ? 0 : Math.max(0, Math.min(100, Number(progress) || 0));
      els.marketPublishProgress.value = percent;
      els.marketPublishProgress.textContent = `${Math.round(percent)}%`;
      els.marketPublishProgress.style.setProperty('--market-publish-progress', `${percent}%`);
      els.marketPublishProgress.setAttribute('aria-valuenow', String(Math.round(percent)));
      els.marketPublishProgress.hidden = progress === null;
    }
  }

  function setMarketView(view) {
    state.view = view === 'publish' ? 'publish' : 'browse';
    if (els.marketBrowseView) els.marketBrowseView.hidden = state.view !== 'browse';
    if (els.marketPublishView) els.marketPublishView.hidden = state.view !== 'publish';
    if (state.view === 'publish') {
      updatePublishAccept();
      window.setTimeout(() => els.marketPublishTitle?.focus({ preventScroll: true }), 0);
    }
  }

  function updatePublishAccept() {
    const type = workType({ type: els.marketPublishType?.value || 'wallpaper' });
    const config = WORK_TYPES[type] || WORK_TYPES.wallpaper;
    if (els.marketPublishAsset) {
      els.marketPublishAsset.accept = config.accept;
      els.marketPublishAsset.required = !['character', 'cursor-trail'].includes(type);
    }
    setPublishStatus(`${config.label}主文件上限 ${Math.round(config.maxBytes / 1024 / 1024 * 10) / 10} MB；预览图上限 8 MB。`, null, false);
  }

  function syncPublishFilePreview() {
    const asset = els.marketPublishAsset?.files?.[0] || null;
    const preview = els.marketPublishPreview?.files?.[0] || null;
    if (els.marketPublishAssetName) els.marketPublishAssetName.textContent = asset ? `${asset.name} · ${Math.max(1, Math.round(asset.size / 1024))} KB` : '尚未选择文件';
    if (els.marketPublishPreviewName) els.marketPublishPreviewName.textContent = preview ? `${preview.name} · ${Math.max(1, Math.round(preview.size / 1024))} KB` : '未选择时会自动生成安全预览图';
    if (state.publishPreviewObjectUrl) URL.revokeObjectURL(state.publishPreviewObjectUrl);
    state.publishPreviewObjectUrl = '';
    if (els.marketPublishPreviewImage) {
      els.marketPublishPreviewImage.hidden = true;
      els.marketPublishPreviewImage.removeAttribute('src');
    }
    if (preview && preview.type.startsWith('image/')) {
      state.publishPreviewObjectUrl = URL.createObjectURL(preview);
      if (els.marketPublishPreviewImage) {
        els.marketPublishPreviewImage.src = state.publishPreviewObjectUrl;
        els.marketPublishPreviewImage.hidden = false;
      }
      if (els.marketPublishPreviewPlaceholder) els.marketPublishPreviewPlaceholder.hidden = true;
    } else if (els.marketPublishPreviewPlaceholder) {
      els.marketPublishPreviewPlaceholder.hidden = false;
    }
  }

  function renderMarket() {
    if (!els.marketList) return;
    els.marketList.replaceChildren();
    els.marketList.setAttribute('aria-busy', String(state.loading));
    if (els.marketMeta) {
      els.marketMeta.textContent = state.loading
        ? '正在同步创作市场'
        : `${state.items.length} 个作品 · 可预览、互动并直接应用`;
    }
    els.marketTabs?.querySelectorAll('[data-market-kind]').forEach((tab) => {
      const rawKind = text(tab.dataset.marketKind, 'all');
      const tabKind = rawKind === 'all' ? 'all' : workType({ type: rawKind });
      const selected = tabKind === state.kind;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
    if (state.loading) {
      for (let index = 0; index < 6; index += 1) els.marketList.appendChild(make('span', 'community-market-skeleton'));
      return;
    }
    if (!state.items.length) {
      els.marketList.appendChild(make('span', 'community-empty', '暂时没有匹配作品，成为第一个发布者吧。'));
      return;
    }
    const fragment = document.createDocumentFragment();
    state.items.forEach((item) => fragment.appendChild(renderWorkCard(item)));
    els.marketList.appendChild(fragment);
  }

  function renderWorkCard(item) {
    const id = text(item.id || item.workId, '');
    const type = workType(item);
    const legacy = type === 'preset' || type === 'component';
    const author = workAuthor(item);
    const card = make('article', 'community-market-item community-market-work');
    card.dataset.workId = id;
    card.dataset.workType = type;

    const visual = make('span', 'community-market-visual');
    const previewUrl = workPreviewUrl(item);
    if (previewUrl) {
      const image = document.createElement('img');
      image.alt = `${text(item.title, typeLabel(type))} 预览`;
      image.loading = 'lazy';
      image.decoding = 'async';
      image.src = previewUrl;
      visual.classList.add('has-image');
      visual.appendChild(image);
    } else {
      visual.appendChild(make('span', 'community-market-visual-fallback', typeLabel(type)));
    }
    const kind = make('small', 'community-market-kind-badge', typeLabel(type));
    visual.appendChild(kind);

    const copy = make('span', 'community-market-copy');
    copy.appendChild(make('strong', '', text(item.title, `未命名${typeLabel(type)}`)));
    const authorButton = make('button', 'community-market-author');
    authorButton.type = 'button';
    authorButton.dataset.communityProfileId = author.id;
    if (!author.id) authorButton.disabled = true;
    const avatar = make('span', 'community-market-author-avatar', author.avatarUrl ? '' : 'FE');
    if (author.avatarUrl) {
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.src = author.avatarUrl;
      avatar.appendChild(image);
    }
    authorButton.appendChild(avatar);
    authorButton.appendChild(make('span', '', author.name));
    copy.appendChild(authorButton);
    copy.appendChild(make('p', '', text(item.description, '创作者还没有填写说明。')));
    const tags = make('span', 'community-market-tags');
    (Array.isArray(item.tags) ? item.tags : []).slice(0, 5).forEach((tag) => tags.appendChild(make('small', '', `#${text(tag, '')}`)));
    copy.appendChild(tags);

    const social = make('span', 'community-market-social-actions');
    const like = button(`${item.likedByMe ? '已赞' : '点赞'} ${humanCount(item.likes)}`, 'like', id);
    like.classList.toggle('is-liked', item.likedByMe === true);
    like.setAttribute('aria-pressed', String(item.likedByMe === true));
    social.appendChild(like);
    social.appendChild(button(`评论 ${humanCount(item.commentCount)}`, 'comments', id));
    social.appendChild(button(`分享 ${humanCount(item.shares)}`, 'share', id));

    const actions = make('span', 'community-market-actions');
    if (legacy) {
      const preview = button('预览', 'legacy-preview', id);
      preview.dataset.previewMarketItem = id;
      const download = button(type === 'component' ? '下载组件' : '下载预设', 'legacy-download', id);
      download.dataset.downloadMarketItem = id;
      actions.append(preview, download);
    } else {
      const apply = button(type === 'music' ? '加入歌单' : '立即应用', 'install', id);
      apply.className = 'community-market-apply';
      apply.dataset.applyMarketItem = id;
      actions.appendChild(apply);
    }
    actions.appendChild(make('small', 'community-market-use-count', `${humanCount(item.uses || item.downloads)} 次使用`));

    card.append(visual, copy);
    if (!legacy) card.appendChild(social);
    card.appendChild(actions);
    if (!legacy && state.shareOpenId === id) card.appendChild(renderSharePanel(item));
    if (!legacy && state.commentsOpenId === id) card.appendChild(renderCommentsPanel(item));
    return card;
  }

  function renderSharePanel(item) {
    const id = text(item.id || item.workId, '');
    const panel = make('span', 'community-market-share-panel');
    const select = document.createElement('select');
    select.dataset.marketShareSelect = id;
    select.setAttribute('aria-label', '选择要分享的好友');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '选择社区好友';
    select.appendChild(placeholder);
    const friends = currentContext().friends || [];
    friends.forEach((friend) => {
      const option = document.createElement('option');
      option.value = text(friend.feId || friend.id, '');
      option.textContent = `${text(friend.username || friend.name, 'FE 好友')} · ${option.value}`;
      if (option.value) select.appendChild(option);
    });
    panel.append(select, button('发送分享', 'share-send', id));
    if (!friends.length) panel.appendChild(make('small', '', '先添加好友后即可定向分享。'));
    return panel;
  }

  function renderCommentsPanel(item) {
    const id = text(item.id || item.workId, '');
    const panel = make('section', 'community-market-comments');
    const list = make('div', 'community-market-comment-list');
    if (state.commentsLoadingId === id) {
      list.appendChild(make('span', 'community-empty', '正在读取评论…'));
    } else {
      const comments = state.commentsByWork.get(id) || [];
      if (!comments.length) list.appendChild(make('span', 'community-empty', '还没有评论，说说你的感受。'));
      comments.forEach((comment) => {
        const row = make('article', 'community-market-comment');
        const author = comment.author || {};
        const profile = make('button', 'community-market-comment-avatar glass-button-native', 'FE');
        profile.type = 'button';
        profile.dataset.communityProfileId = text(author.id || author.feId || comment.authorId, '');
        const copy = make('span', 'community-market-comment-copy');
        const head = make('header');
        const timestamp = make('time', '', formatTime(comment.createdAt));
        timestamp.dateTime = new Date(Number(comment.createdAt) || Date.now()).toISOString();
        head.append(make('strong', '', text(author.name || author.username, 'FE 用户')), timestamp);
        copy.append(head, make('p', '', text(comment.text, '')));
        row.append(profile, copy);
        list.appendChild(row);
      });
    }
    const form = make('form', 'community-market-comment-form');
    form.dataset.marketCommentForm = id;
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 500;
    input.required = true;
    input.placeholder = '写一条评论（最多 500 字）';
    input.setAttribute('aria-label', '评论内容');
    const submit = make('button', '', '发布');
    submit.type = 'submit';
    form.append(input, submit);
    panel.append(list, form);
    return panel;
  }

  async function refreshMarket() {
    if (!els.marketList || state.loading) return state.items;
    state.loading = true;
    renderMarket();
    const context = currentContext();
    const params = new URLSearchParams();
    if (state.query) params.set('q', state.query);
    if (state.kind !== 'all') params.set('type', state.kind);
    if (context.profile?.feId) params.set('feId', context.profile.feId);
    try {
      const payload = await bridge.request(`/api/creative-market?${params.toString()}`);
      state.items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.works) ? payload.works : [];
      return state.items;
    } catch (error) {
      state.items = [];
      if (els.marketMeta) els.marketMeta.textContent = error.message || '创作市场读取失败';
      return [];
    } finally {
      state.loading = false;
      renderMarket();
    }
  }

  function scheduleMarketRefresh() {
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => refreshMarket().catch(() => {}), 180);
  }

  function updateItem(item) {
    if (!item) return;
    const id = text(item.id || item.workId, '');
    const index = state.items.findIndex((entry) => text(entry.id || entry.workId, '') === id);
    if (index >= 0) state.items.splice(index, 1, { ...state.items[index], ...item });
    else if (id) state.items.unshift(item);
    renderMarket();
  }

  function itemById(id) {
    return state.items.find((item) => text(item.id || item.workId, '') === text(id, '')) || null;
  }

  async function toggleLike(id) {
    id = text(id, '');
    if (!/^[A-Za-z0-9._~-]{1,120}$/.test(id)) throw workflowError('作品标识无效', 'invalid_work_id');
    const payload = await bridge.request(signedPath('/api/community/creative-market/works/like'), {
      method: 'POST',
      body: JSON.stringify({ id, workId: id })
    });
    updateItem(payload.item || payload.work);
    return payload.item || payload.work || { id };
  }

  async function loadComments(id) {
    state.commentsLoadingId = id;
    renderMarket();
    try {
      const payload = await bridge.request(`/api/creative-market/comments?id=${encodeURIComponent(id)}`);
      state.commentsByWork.set(id, Array.isArray(payload.comments) ? payload.comments : []);
    } finally {
      state.commentsLoadingId = '';
      renderMarket();
    }
  }

  async function postComment(id, value) {
    id = text(id, '');
    if (!/^[A-Za-z0-9._~-]{1,120}$/.test(id)) throw workflowError('作品标识无效', 'invalid_work_id');
    const commentText = text(value, '').slice(0, 500);
    if (!commentText) throw workflowError('评论内容不能为空', 'invalid_comment');
    const payload = await bridge.request(signedPath('/api/community/creative-market/works/comment'), {
      method: 'POST',
      body: JSON.stringify({ id, workId: id, text: commentText })
    });
    if (Array.isArray(payload.comments)) state.commentsByWork.set(id, payload.comments);
    else if (payload.comment) state.commentsByWork.set(id, [...(state.commentsByWork.get(id) || []), payload.comment]);
    updateItem(payload.item || payload.work || { id, commentCount: (state.commentsByWork.get(id) || []).length });
    return payload.comment || payload.item || payload.work || { id, text: commentText };
  }

  async function shareWork(id, targetId) {
    id = text(id, '');
    targetId = text(targetId, '');
    if (!/^[A-Za-z0-9._~-]{1,120}$/.test(id)) throw workflowError('作品标识无效', 'invalid_work_id');
    if (!/^\d{8}$/.test(targetId)) throw workflowError('请选择一位社区好友', 'invalid_friend_id');
    const confirmedFriend = (currentContext().friends || []).some((friend) => (
      text(friend.feId || friend.id, '') === targetId
    ));
    if (!confirmedFriend) throw workflowError('只能分享给已确认的社区好友', 'friend_required');
    const payload = await bridge.request(signedPath('/api/community/creative-market/works/share'), {
      method: 'POST',
      body: JSON.stringify({ id, workId: id, targetId })
    });
    updateItem(payload.item || payload.work);
    state.shareOpenId = '';
    renderMarket();
    bridge.toast('作品已分享给好友');
    return payload.item || payload.work || { id, targetId };
  }

  function namedFile(blob, fileName, mimeType = '') {
    const safeName = text(fileName, 'creative-work.bin').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 160);
    return new File([blob], safeName, { type: text(mimeType || blob.type, 'application/octet-stream'), lastModified: Date.now() });
  }

  async function fetchWorkFile(item) {
    const url = workAssetUrl(item);
    if (!url) throw new Error('作品没有可下载的资源');
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`作品资源读取失败（${response.status}）`);
    const blob = await response.blob();
    const fileName = text(item.asset?.fileName || item.metadata?.fileName || item.fileName, `${text(item.id, 'work')}.bin`);
    return namedFile(blob, fileName, item.asset?.mimeType || item.mimeType || blob.type);
  }

  async function recordUse(id) {
    try {
      const payload = await bridge.request(signedPath('/api/community/creative-market/works/use'), {
        method: 'POST',
        body: JSON.stringify({ id, workId: id })
      });
      updateItem(payload.item || payload.work);
    } catch (error) {}
  }

  async function installWork(id) {
    const item = itemById(id);
    if (!item) throw workflowError('作品未在创作市场中找到', 'work_not_found');
    const type = workType(item);
    const action = els.marketList?.querySelector(`[data-market-action="install"][data-work-id="${CSS.escape(id)}"]`);
    if (action) action.disabled = true;
    try {
      if (type === 'music') {
        bridge.installMusic(item);
      } else if (type === 'wallpaper') {
        await bridge.installWallpaper(await fetchWorkFile(item));
      } else if (type === 'cursor') {
        await bridge.installCursor(await fetchWorkFile(item));
      } else if (type === 'character') {
        const file = await fetchWorkFile(item);
        const model = JSON.parse(await file.text());
        if (!window.fePixelLogin?.installCharacter?.(model)) throw new Error('角色文件格式无效');
      } else if (type === 'cursor-trail') {
        const file = await fetchWorkFile(item);
        bridge.installTrail(JSON.parse(await file.text()));
      } else {
        throw new Error('该作品类型暂时不能直接应用');
      }
      recordUse(id);
      bridge.toast(type === 'music' ? '音乐已加入本地歌单' : `${typeLabel(type)}已应用`);
      return { id, type, applied: true };
    } finally {
      if (action?.isConnected) action.disabled = false;
    }
  }

  async function installWorkById(value) {
    const id = text(value, '');
    if (!/^[A-Za-z0-9._~-]{1,120}$/.test(id)) throw new Error('作品标识无效');
    if (!itemById(id)) await refreshMarket();
    if (!itemById(id)) throw new Error('奖励作品未在创作市场中找到');
    return installWork(id);
  }

  function parseTags(value) {
    return [...new Set(text(value, '').split(/[,，\s#]+/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 5);
  }

  function dataUrlBlob(dataUrl) {
    const match = /^data:([^;,]+);base64,(.+)$/.exec(text(dataUrl, ''));
    if (!match) return null;
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: match[1] });
  }

  async function generatedPreview(type, title) {
    if (type === 'character') {
      const blob = dataUrlBlob(window.fePixelLogin?.characterPreviewDataUrl?.(12));
      if (blob) return namedFile(blob, 'character-preview.png', 'image/png');
    }
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const context = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' });
    if (!context) throw new Error('无法生成作品预览图');
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, type === 'music' ? '#11102c' : '#071a20');
    gradient.addColorStop(0.55, type === 'cursor-trail' ? '#472f79' : '#12384a');
    gradient.addColorStop(1, '#06080c');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(156,229,255,.48)';
    context.lineWidth = 5;
    context.beginPath();
    for (let x = -20; x <= canvas.width + 20; x += 12) {
      const y = canvas.height * 0.52 + Math.sin(x * 0.022) * 45 + Math.sin(x * 0.007) * 72;
      if (x < 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.stroke();
    context.fillStyle = '#f5fbff';
    context.font = '700 54px system-ui, sans-serif';
    context.fillText(text(title, typeLabel(type)).slice(0, 22), 64, 400);
    context.fillStyle = 'rgba(255,255,255,.62)';
    context.font = '600 26px system-ui, sans-serif';
    context.fillText(`FE MONSTER · ${typeLabel(type)}`, 66, 450);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.92));
    if (!blob) throw new Error('无法生成作品预览图');
    return namedFile(blob, `${type}-preview.png`, 'image/png');
  }

  function defaultTrailAsset(title) {
    const current = document.documentElement.dataset.feCursorTrail || 'comet';
    return {
      schema: 'fe-monster.cursor-trail/v1',
      name: text(title, '自定义尾迹'),
      style: ['glow', 'comet', 'stardust', 'ribbon', 'prism'].includes(current) ? current : 'comet',
      primary: '#9ce5ff',
      secondary: '#ff9ffc',
      lifetime: 520,
      points: 36,
      width: 2.4,
      glow: 12,
      particles: true
    };
  }

  async function resolvePublishFiles(type, title) {
    let asset = els.marketPublishAsset?.files?.[0] || null;
    if (!asset && type === 'character') {
      const model = window.fePixelLogin?.exportCharacter?.();
      if (!model) throw new Error('还没有可发布的登录角色，请先在登录页绘制角色');
      asset = namedFile(new Blob([JSON.stringify(model)], { type: 'application/json' }), `${title || 'character'}.json`, 'application/json');
    }
    if (!asset && type === 'cursor-trail') {
      asset = namedFile(new Blob([JSON.stringify(defaultTrailAsset(title))], { type: 'application/json' }), `${title || 'cursor-trail'}.json`, 'application/json');
    }
    if (!asset) throw new Error('请选择要发布的主文件');
    if (type === 'cursor') asset = await bridge.prepareCursor(asset);
    if (type === 'character' || type === 'cursor-trail') {
      const declaration = await asset.text();
      JSON.parse(declaration);
      asset = namedFile(new Blob([declaration], { type: 'application/json' }), `${title || type}.json`, 'application/json');
    }
    const config = WORK_TYPES[type];
    if (!config || asset.size <= 0 || asset.size > config.maxBytes) throw new Error(`${typeLabel(type)}主文件大小不符合要求`);
    let preview = els.marketPublishPreview?.files?.[0] || null;
    if (preview && (!/^image\/(?:png|jpeg|webp)$/i.test(preview.type) || preview.size > 8 * 1024 * 1024)) {
      throw new Error('预览图仅支持 PNG/JPG/WebP，且不能超过 8 MB');
    }
    if (!preview && /^image\/(?:png|jpeg|webp)$/i.test(asset.type)) preview = asset;
    if (!preview) preview = await generatedPreview(type, title);
    return { asset, preview };
  }

  async function initialiseUpload(type, role, file) {
    const payload = await bridge.request(signedPath('/api/community/creative-market/uploads/init'), {
      method: 'POST',
      body: JSON.stringify({
        type,
        role,
        fileName: text(file.name, `${role}.bin`),
        mimeType: text(file.type, 'application/octet-stream'),
        size: Number(file.size) || 0
      })
    });
    const upload = payload.upload || payload;
    const id = text(upload.id || upload.uploadId || payload.uploadId, '');
    const token = text(upload.token || payload.token, '');
    if (!id || !token) throw new Error('服务器没有返回有效的上传凭证');
    return { id, token };
  }

  async function uploadContent(upload, file) {
    const url = `/api/creative-market/uploads/content?id=${encodeURIComponent(upload.id)}&token=${encodeURIComponent(upload.token)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': text(file.type, 'application/octet-stream') },
      body: file
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.error || `资源上传失败（${response.status}）`);
    return payload;
  }

  async function publishWork(eventOrOptions = {}) {
    const interactiveEvent = eventOrOptions && typeof eventOrOptions.preventDefault === 'function'
      ? eventOrOptions
      : null;
    interactiveEvent?.preventDefault();
    const options = interactiveEvent
      ? {}
      : eventOrOptions && typeof eventOrOptions === 'object' && !Array.isArray(eventOrOptions)
        ? eventOrOptions
        : {};
    if (state.publishing) throw workflowError('已有作品正在发布，请稍候', 'publish_in_progress');
    if (['assetUploadId', 'previewUploadId', 'path', 'url', 'code'].some((key) => options[key] !== undefined)) {
      throw workflowError('桌宠发布不接受上传凭证、路径、网址或代码；请使用当前发布页已选择的本地文件', 'unsafe_publish_input');
    }
    const context = currentContext();
    if (!context.profile?.feId) {
      const error = workflowError('请先登录音乐账号后再发布作品', 'login_required');
      if (interactiveEvent) {
        bridge.toast(error.message);
        return null;
      }
      throw error;
    }
    const type = workType({ type: options.type ?? els.marketPublishType?.value ?? 'wallpaper' });
    if (!WORK_TYPES[type]) throw workflowError('不支持该作品类型', 'invalid_work_type');
    const title = text(options.title ?? els.marketPublishTitle?.value, '').slice(0, 80);
    if (els.marketPublishType) els.marketPublishType.value = type;
    if (els.marketPublishTitle) els.marketPublishTitle.value = title;
    if (options.description !== undefined && els.marketPublishDescription) {
      els.marketPublishDescription.value = text(options.description, '').slice(0, 500);
    }
    if (options.tags !== undefined && els.marketPublishTags) {
      els.marketPublishTags.value = Array.isArray(options.tags)
        ? options.tags.map((tag) => text(tag, '')).filter(Boolean).join(', ')
        : text(options.tags, '');
    }
    setMarketView('publish');
    if (!title) {
      els.marketPublishTitle?.focus();
      const error = workflowError('作品标题不能为空', 'invalid_title');
      if (interactiveEvent) return null;
      throw error;
    }
    state.publishing = true;
    if (els.marketPublishSubmit) els.marketPublishSubmit.disabled = true;
    try {
      setPublishStatus('正在准备安全预览…', 8);
      const { asset, preview } = await resolvePublishFiles(type, title);
      setPublishStatus('正在创建主文件上传通道…', 18);
      const assetUpload = await initialiseUpload(type, 'primary', asset);
      await uploadContent(assetUpload, asset);
      setPublishStatus('主文件上传完成，正在上传预览图…', 58);
      let previewUpload = null;
      if (preview !== asset) {
        previewUpload = await initialiseUpload(type, 'preview', preview);
        await uploadContent(previewUpload, preview);
      }
      setPublishStatus('正在发布作品并通知社区…', 88);
      const metadata = {
        fileName: asset.name,
        mimeType: asset.type,
        size: asset.size
      };
      if (type === 'music') Object.assign(metadata, { title, artist: context.profile.username || context.profile.name || 'FE 创作者' });
      const payload = await bridge.request(signedPath('/api/community/creative-market/works/publish'), {
        method: 'POST',
        body: JSON.stringify({
          type,
          title,
          description: text(els.marketPublishDescription?.value, '').slice(0, 500),
          tags: parseTags(els.marketPublishTags?.value),
          assetUploadId: assetUpload.id,
          previewUploadId: previewUpload?.id || '',
          metadata
        })
      });
      updateItem(payload.item || payload.work);
      setPublishStatus('发布成功，作品已进入创作市场。', 100);
      els.marketPublishForm?.reset();
      syncPublishFilePreview();
      window.setTimeout(() => {
        setMarketView('browse');
        setPublishStatus('选择作品类型并上传主文件。', null);
      }, 420);
      state.kind = 'all';
      await refreshMarket();
      bridge.toast('作品发布成功');
      return {
        ok: true,
        work: payload.item || payload.work || null,
        type,
        title
      };
    } catch (error) {
      if (error?.message === '请选择要发布的主文件') {
        error.code = 'file_required';
        setMarketView('publish');
      }
      setPublishStatus(error.message || '作品发布失败', null, true);
      bridge.toast(error.message || '作品发布失败');
      if (!interactiveEvent) throw error;
      return null;
    } finally {
      state.publishing = false;
      if (els.marketPublishSubmit) els.marketPublishSubmit.disabled = false;
    }
  }

  function renderSquare() {
    if (!els.squareList) return;
    els.squareList.replaceChildren();
    els.squareList.setAttribute('aria-busy', String(state.squareLoading));
    if (els.squareMeta) els.squareMeta.textContent = state.squareLoading ? '正在连接社交广场' : `${state.squareMessages.length} 条公开交流`;
    if (els.squareSend) els.squareSend.disabled = state.squareSending || !currentContext().profile?.feId;
    if (state.squareLoading) {
      els.squareList.appendChild(make('span', 'community-empty', '正在读取广场消息…'));
      return;
    }
    if (!state.squareMessages.length) {
      els.squareList.appendChild(make('span', 'community-empty', '广场还很安静，发出第一条消息吧。'));
      return;
    }
    const fragment = document.createDocumentFragment();
    state.squareMessages.forEach((message) => {
      const author = message.author || {};
      const row = make('article', 'community-square-message');
      row.dataset.squareMessageId = text(message.id, '');
      const authorId = text(author.feId || author.id || message.authorId, '');
      row.classList.toggle('is-own', authorId === text(currentContext().profile?.feId, ''));
      const profile = make('button', 'community-square-message-avatar glass-button-native', trustedAvatarUrl(author.avatarUrl) ? '' : 'FE');
      profile.type = 'button';
      profile.dataset.communityProfileId = authorId;
      const avatarUrl = trustedAvatarUrl(author.avatarUrl);
      if (avatarUrl) {
        const image = document.createElement('img');
        image.alt = '';
        image.loading = 'lazy';
        image.src = avatarUrl;
        profile.appendChild(image);
      }
      const copy = make('span', 'community-square-message-copy');
      const head = make('header');
      const timestamp = make('time', '', formatTime(message.createdAt));
      timestamp.dateTime = new Date(Number(message.createdAt) || Date.now()).toISOString();
      head.append(make('strong', '', text(author.name || author.username, 'FE 用户')), timestamp);
      copy.append(head, make('p', '', text(message.text, '')));
      row.append(profile, copy);
      fragment.appendChild(row);
    });
    els.squareList.appendChild(fragment);
    els.squareList.scrollTop = els.squareList.scrollHeight;
  }

  function mergeSquareMessage(message) {
    if (!message?.id) return;
    const index = state.squareMessages.findIndex((entry) => text(entry.id, '') === text(message.id, ''));
    if (index >= 0) state.squareMessages.splice(index, 1, { ...state.squareMessages[index], ...message });
    else state.squareMessages.push(message);
    state.squareMessages = state.squareMessages.slice(-300);
    renderSquare();
  }

  async function refreshSquare() {
    if (!els.squareList || state.squareLoading) return state.squareMessages;
    state.squareLoading = true;
    renderSquare();
    const feId = text(currentContext().profile?.feId, '');
    try {
      const payload = await bridge.request(`/api/community/square/messages?feId=${encodeURIComponent(feId)}&limit=200`);
      state.squareMessages = Array.isArray(payload.messages) ? payload.messages : [];
      return state.squareMessages;
    } catch (error) {
      if (els.squareMeta) els.squareMeta.textContent = error.message || '社交广场暂时不可用';
      return [];
    } finally {
      state.squareLoading = false;
      renderSquare();
    }
  }

  async function sendSquareMessage(eventOrOptions = {}) {
    const interactiveEvent = eventOrOptions && typeof eventOrOptions.preventDefault === 'function'
      ? eventOrOptions
      : null;
    interactiveEvent?.preventDefault();
    const options = interactiveEvent
      ? {}
      : eventOrOptions && typeof eventOrOptions === 'object' && !Array.isArray(eventOrOptions)
        ? eventOrOptions
        : { text: eventOrOptions };
    if (state.squareSending || !els.squareInput) {
      if (!interactiveEvent) throw workflowError('社交广场正在发送上一条消息', 'square_send_in_progress');
      return null;
    }
    const messageText = text(options.text ?? els.squareInput.value, '').slice(0, 500);
    if (!messageText) {
      if (!interactiveEvent) throw workflowError('广场发言不能为空', 'invalid_square_message');
      return null;
    }
    if (!currentContext().profile?.feId) {
      const error = workflowError('请先登录后再参与广场交流', 'login_required');
      if (interactiveEvent) {
        bridge.toast(error.message);
        return null;
      }
      throw error;
    }
    state.squareSending = true;
    renderSquare();
    try {
      const payload = await bridge.request(signedPath('/api/community/square/messages'), {
        method: 'POST',
        body: JSON.stringify({ text: messageText, clientId: `web-${Date.now()}` })
      });
      els.squareInput.value = '';
      mergeSquareMessage(payload.message);
      return payload.message || { text: messageText };
    } catch (error) {
      bridge.toast(error.message || '广场消息发送失败');
      if (!interactiveEvent) throw error;
      return null;
    } finally {
      state.squareSending = false;
      renderSquare();
    }
  }

  function setViewerAvatar(user = {}) {
    if (!els.viewerAvatar) return;
    els.viewerAvatar.replaceChildren();
    const url = trustedAvatarUrl(user.avatarUrl || user.avatar);
    if (url) {
      const image = document.createElement('img');
      image.alt = '';
      image.src = url;
      els.viewerAvatar.appendChild(image);
    } else {
      els.viewerAvatar.textContent = 'FE';
    }
  }

  function renderViewer() {
    const user = state.viewer || {};
    const context = currentContext();
    const targetId = text(user.feId || state.viewerId, '');
    const isMe = targetId && targetId === text(context.profile?.feId, '');
    const isFriend = (context.friends || []).some((friend) => text(friend.feId || friend.id, '') === targetId);
    const outgoingRequest = (context.friendRequests?.outgoing || []).find((request) => text(request.to || request.targetId, '') === targetId);
    const incomingRequest = (context.friendRequests?.incoming || []).find((request) => text(request.from || request.sourceId, '') === targetId);
    if (els.viewerName) els.viewerName.textContent = state.viewerLoading ? '正在读取个人主页…' : text(user.username || user.name, 'FE 用户');
    if (els.viewerId) els.viewerId.textContent = targetId ? `FE ID ${targetId}` : 'FE ID --------';
    if (els.viewerBio) els.viewerBio.textContent = text(user.bio, '这个人还没有留下个人描述。');
    if (els.viewerMeta) els.viewerMeta.textContent = user.online ? '当前在线' : '当前离线';
    const creatorWorks = state.items.filter((item) => workAuthor(item).id === targetId);
    const works = Math.max(creatorWorks.length, Number(user.workCount ?? user.works) || 0);
    const likes = Number(user.likes) || 0;
    const friends = Number(user.friendCount) || 0;
    if (els.viewerWorksCount) els.viewerWorksCount.textContent = String(works);
    if (els.viewerFriendsCount) els.viewerFriendsCount.textContent = String(friends);
    if (els.viewerLikesCount) els.viewerLikesCount.textContent = String(likes);
    if (els.viewerWorksMeta) els.viewerWorksMeta.textContent = `${works} 个公开作品`;
    if (els.viewerWorks) {
      els.viewerWorks.replaceChildren();
      if (!creatorWorks.length) {
        els.viewerWorks.appendChild(make('span', 'community-empty', '这位用户还没有公开作品，或作品尚未加载。'));
      } else {
        creatorWorks.slice(0, 6).forEach((item) => {
          const entry = make('button', 'community-profile-viewer-work', text(item.title, typeLabel(workType(item))));
          entry.type = 'button';
          entry.addEventListener('click', () => {
            state.viewerReturnPage = 'viewer';
            bridge.openProfilePage('market');
            window.setTimeout(() => document.querySelector(`[data-work-id="${CSS.escape(text(item.id, ''))}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 80);
          });
          els.viewerWorks.appendChild(entry);
        });
      }
    }
    if (els.viewerAddFriend) {
      els.viewerAddFriend.disabled = state.viewerLoading || isMe || isFriend || !!outgoingRequest || !!incomingRequest || !targetId;
      els.viewerAddFriend.textContent = isMe
        ? '这是你自己'
        : isFriend
          ? '已经是好友'
          : outgoingRequest
            ? '申请已发送'
            : incomingRequest
              ? '请在好友栏确认'
              : '申请好友';
    }
    if (els.viewerMessage) els.viewerMessage.disabled = !targetId || isMe;
    if (els.viewerIdentityCard) {
      els.viewerIdentityCard.disabled = state.viewerLoading || isMe || !isFriend || !targetId;
      els.viewerIdentityCard.hidden = !isFriend;
      els.viewerIdentityCard.title = isFriend
        ? `展示 ${text(user.username || user.name, targetId)} 的身份卡`
        : '成为好友后可以查看身份卡';
    }
    setViewerAvatar(user);
  }

  async function openUserProfile(id) {
    const targetId = text(id, '');
    if (!/^\d{8}$/.test(targetId)) return;
    state.viewerId = targetId;
    state.viewerReturnPage = ['self', 'nearby', 'square', 'market'].includes(currentContext().profilePage)
      ? currentContext().profilePage
      : 'market';
    state.viewer = null;
    state.viewerLoading = true;
    bridge.openProfilePage('viewer');
    renderViewer();
    try {
      const payload = await bridge.request(`/api/community/user?${new URLSearchParams({ provider: currentContext().provider || 'netease', id: targetId })}`);
      state.viewer = payload.user || payload.profile || null;
    } catch (error) {
      bridge.toast(error.message || '个人主页读取失败');
    } finally {
      state.viewerLoading = false;
      renderViewer();
    }
  }

  function handleMarketClick(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const action = target.closest('[data-market-action]');
    if (!action) return;
    const id = text(action.dataset.workId, '');
    const kind = text(action.dataset.marketAction, '');
    if (kind.startsWith('legacy-')) return;
    event.preventDefault();
    event.stopPropagation();
    if (kind === 'install') installWork(id).catch((error) => bridge.toast(error.message || '作品应用失败'));
    else if (kind === 'like') toggleLike(id).catch((error) => bridge.toast(error.message || '点赞失败'));
    else if (kind === 'comments') {
      state.commentsOpenId = state.commentsOpenId === id ? '' : id;
      state.shareOpenId = '';
      renderMarket();
      if (state.commentsOpenId && !state.commentsByWork.has(id)) loadComments(id).catch((error) => bridge.toast(error.message || '评论读取失败'));
    } else if (kind === 'share') {
      state.shareOpenId = state.shareOpenId === id ? '' : id;
      state.commentsOpenId = '';
      renderMarket();
    } else if (kind === 'share-send') {
      const select = els.marketList?.querySelector(`[data-market-share-select="${CSS.escape(id)}"]`);
      shareWork(id, select?.value || '').catch((error) => bridge.toast(error.message || '分享失败'));
    }
  }

  function handleMarketSubmit(event) {
    const form = event.target instanceof Element ? event.target.closest('[data-market-comment-form]') : null;
    if (!form) return;
    event.preventDefault();
    event.stopPropagation();
    const input = form.querySelector('input');
    const value = input?.value || '';
    if (input) input.value = '';
    postComment(form.dataset.marketCommentForm, value).catch((error) => bridge.toast(error.message || '评论发布失败'));
  }

  function handleProfileDelegation(event) {
    const trigger = event.target instanceof Element ? event.target.closest('[data-community-profile-id]') : null;
    if (!trigger || trigger.disabled) return;
    const id = text(trigger.dataset.communityProfileId, '');
    if (!id) return;
    event.preventDefault();
    event.stopPropagation();
    openUserProfile(id);
  }

  function handleProfileKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const trigger = event.target instanceof Element ? event.target.closest('[data-community-profile-id]') : null;
    if (!trigger) return;
    event.preventDefault();
    trigger.click();
  }

  function handleCommunityEvent(event) {
    const envelope = event.detail || {};
    const type = text(envelope.type, '');
    const payload = envelope.payload || {};
    if (type === 'square.message' || type === 'plaza.message') mergeSquareMessage(payload.message);
    if (type.startsWith('creative-market.') || type.startsWith('work.') || type.startsWith('market.work.')) {
      if (payload.item || payload.work) updateItem(payload.item || payload.work);
      else scheduleMarketRefresh();
    }
  }

  function bindEvents() {
    els.marketTabs?.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-market-kind]');
      if (!tab) return;
      const rawKind = text(tab.dataset.marketKind, 'all');
      state.kind = rawKind === 'all' ? 'all' : workType({ type: rawKind });
      refreshMarket().catch(() => {});
    });
    els.marketPublishOpen?.addEventListener('click', () => setMarketView('publish'));
    els.marketPublishCancel?.addEventListener('click', () => setMarketView('browse'));
    els.marketPublishClose?.addEventListener('click', () => setMarketView('browse'));
    els.marketPublishType?.addEventListener('change', updatePublishAccept);
    els.marketPublishAsset?.addEventListener('change', syncPublishFilePreview);
    els.marketPublishPreview?.addEventListener('change', syncPublishFilePreview);
    els.marketPublishForm?.addEventListener('submit', publishWork);
    els.marketList?.addEventListener('click', handleMarketClick);
    els.marketList?.addEventListener('submit', handleMarketSubmit);
    els.squareRefresh?.addEventListener('click', () => refreshSquare());
    els.squareForm?.addEventListener('submit', sendSquareMessage);
    els.viewerBack?.addEventListener('click', () => bridge.openProfilePage(state.viewerReturnPage || 'market'));
    els.viewerAddFriend?.addEventListener('click', async () => {
      try {
        await bridge.addFriend(state.viewerId);
        bridge.toast('好友申请已发送，等待对方确认');
        renderViewer();
      } catch (error) {
        bridge.toast(error.message || '添加好友失败');
      }
    });
    els.viewerMessage?.addEventListener('click', () => {
      const peer = { ...(state.viewer || {}), feId: state.viewerId };
      bridge.closeProfile();
      bridge.openMessages(state.viewerId, peer);
    });
    els.viewerIdentityCard?.addEventListener('click', async () => {
      try {
        await bridge.openFriendIdentityCard(state.viewerId, { throwOnError: true });
      } catch (error) {
        bridge.toast(error.message || '好友身份卡读取失败');
      }
    });
    els.profileDialog?.addEventListener('click', handleProfileDelegation);
    document.addEventListener('click', handleProfileDelegation);
    document.addEventListener('keydown', handleProfileKeydown);
    window.addEventListener('fe-creative-community-event', handleCommunityEvent);
  }

  function openMarket() {
    setMarketView('browse');
    refreshMarket().catch(() => {});
  }

  function openSquare() {
    refreshSquare().catch(() => {});
  }

  function handleSearch(value) {
    state.query = text(value, '').slice(0, 64);
    scheduleMarketRefresh();
  }

  async function searchMarket(options = {}) {
    const source = options && typeof options === 'object' ? options : { query: options };
    state.query = text(source.query ?? source.q, '').slice(0, 64);
    const requestedKind = text(source.type ?? source.kind, 'all');
    state.kind = requestedKind === 'all' ? 'all' : workType({ type: requestedKind });
    const items = await refreshMarket();
    return items.map((item) => ({
      id: text(item.id || item.workId, ''),
      type: workType(item),
      title: text(item.title, typeLabel(workType(item))),
      description: text(item.description, '').slice(0, 240),
      author: workAuthor(item),
      likes: Number(item.likes) || 0,
      comments: Number(item.commentCount) || 0,
      shares: Number(item.shares) || 0,
      likedByMe: item.likedByMe === true
    }));
  }

  function initialise() {
    bindDom();
    bindEvents();
    updatePublishAccept();
    renderMarket();
    renderSquare();
  }

  window.FeCreativeCommunity = Object.freeze({
    refreshMarket,
    renderMarket,
    scheduleMarketRefresh,
    handleSearch,
    openMarket,
    refreshSquare,
    openSquare,
    openUserProfile,
    renderViewer,
    installWorkById,
    searchMarket,
    publishWork,
    postSquareMessage: (options) => sendSquareMessage(options),
    likeWork: toggleLike,
    commentWork: postComment,
    shareWork,
    getState() {
      return {
        kind: state.kind,
        view: state.view,
        itemCount: state.items.length,
        squareMessageCount: state.squareMessages.length,
        viewerId: state.viewerId
      };
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise, { once: true });
  else initialise();
})();
