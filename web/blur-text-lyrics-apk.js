const controllers = new WeakMap();

function animatedCopy(text, className, delay, duration) {
  const copy = document.createElement('p');
  copy.className = className;
  copy.dataset.blurDirection = 'top';
  copy.style.setProperty('--blur-step-duration', `${duration}s`);
  copy.style.display = 'flex';
  copy.style.flexWrap = 'nowrap';
  Array.from(text).forEach((character, index) => {
    const segment = document.createElement('span');
    segment.className = 'blur-text-segment';
    segment.style.setProperty('--blur-index', String(index));
    segment.style.setProperty('--blur-delay', `${index * delay}ms`);
    segment.textContent = /^\s$/.test(character) ? '\u00a0' : character;
    copy.appendChild(segment);
  });
  return copy;
}

function renderFlowLyric(mount, text, revision) {
  const stack = document.createElement('div');
  stack.className = 'blur-lyric-stack';
  stack.dataset.lyricRevision = String(revision);
  const base = document.createElement('div');
  base.className = 'blur-lyric-copy blur-lyric-copy--base';
  base.textContent = text;
  stack.appendChild(base);
  stack.appendChild(animatedCopy(text, 'blur-lyric-copy blur-lyric-copy--ghost', 14, 0.46));
  const progressWindow = document.createElement('div');
  progressWindow.className = 'blur-lyric-progress-window';
  progressWindow.appendChild(animatedCopy(text, 'blur-lyric-copy blur-lyric-copy--hot', 16, 0.38));
  stack.appendChild(progressWindow);
  mount.replaceChildren(stack);
}

function controllerFor(mount) {
  let controller = controllers.get(mount);
  if (controller) return controller;
  controller = {
    text: '',
    revision: 0,
    render() { renderFlowLyric(mount, this.text, this.revision); },
    setText(text) {
      const next = String(text || '');
      if (next === this.text) return;
      this.text = next;
      this.revision += 1;
      this.render();
    }
  };
  controllers.set(mount, controller);
  controller.render();
  return controller;
}

window.FEBlurLyrics = {
  mount(mount) { return mount ? controllerFor(mount) : null; },
  setText(text, mount = document.getElementById('blurLyricMount')) {
    if (mount) controllerFor(mount).setText(text);
  }
};

window.dispatchEvent(new CustomEvent('fe-blur-lyrics-ready'));
