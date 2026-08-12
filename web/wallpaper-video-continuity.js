(function installWallpaperVideoContinuity(global) {
  'use strict';

  const records = new WeakMap();

  function swallowPlay(video) {
    try {
      const result = video?.play?.();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      // Autoplay policy or a source teardown may race the loop boundary.
    }
  }

  function removeNativeLoop(video) {
    if (!video) return;
    video.loop = false;
    try {
      video.removeAttribute?.('loop');
    } catch {
      // Synthetic/test media nodes need only the property assignment above.
    }
  }

  function prepare(video, options = {}) {
    if (!video || typeof video.addEventListener !== 'function') return null;
    const existing = records.get(video);
    if (existing) {
      existing.options = options && typeof options === 'object' ? options : {};
      existing.enabled = true;
      removeNativeLoop(video);
      return existing.api;
    }

    const record = {
      enabled: true,
      restarting: false,
      options: options && typeof options === 'object' ? options : {},
      lastPresentedTime: 0,
      frameRequest: 0,
      api: null
    };

    const notePresentedFrame = (_now, metadata = {}) => {
      const mediaTime = Number(metadata.mediaTime);
      if (Number.isFinite(mediaTime)) record.lastPresentedTime = mediaTime;
      if (!record.enabled || typeof video.requestVideoFrameCallback !== 'function') return;
      record.frameRequest = video.requestVideoFrameCallback(notePresentedFrame);
    };

    const restart = () => {
      if (!record.enabled || record.restarting) return false;
      if (typeof record.options.shouldLoop === 'function' && record.options.shouldLoop(video) === false) return false;
      record.restarting = true;
      if (video.dataset) video.dataset.feLoopBoundary = 'holding-last-frame';
      removeNativeLoop(video);
      try {
        // Do not call load() and do not replace src: Chromium then keeps the last
        // decoded compositor frame visible while the decoder seeks to frame 0.
        video.currentTime = 0;
      } catch {
        record.restarting = false;
        if (video.dataset) delete video.dataset.feLoopBoundary;
        return false;
      }
      swallowPlay(video);
      const finish = () => {
        record.restarting = false;
        if (video.dataset) delete video.dataset.feLoopBoundary;
      };
      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(finish);
      } else if (typeof global.requestAnimationFrame === 'function') {
        global.requestAnimationFrame(finish);
      } else {
        finish();
      }
      return true;
    };

    const onEnded = () => restart();
    video.addEventListener('ended', onEnded);
    removeNativeLoop(video);
    if (typeof video.requestVideoFrameCallback === 'function') {
      record.frameRequest = video.requestVideoFrameCallback(notePresentedFrame);
    }

    const release = () => {
      if (!record.enabled) return;
      record.enabled = false;
      video.removeEventListener?.('ended', onEnded);
      if (record.frameRequest && typeof video.cancelVideoFrameCallback === 'function') {
        try {
          video.cancelVideoFrameCallback(record.frameRequest);
        } catch {
          // The browser may already have retired the callback during teardown.
        }
      }
      if (video.dataset) delete video.dataset.feLoopBoundary;
      records.delete(video);
    };

    record.api = Object.freeze({ restart, release });
    records.set(video, record);
    return record.api;
  }

  function release(video) {
    const record = video ? records.get(video) : null;
    record?.api?.release?.();
  }

  global.FeWallpaperVideoContinuity = Object.freeze({ prepare, release });
}(typeof window !== 'undefined' ? window : globalThis));
