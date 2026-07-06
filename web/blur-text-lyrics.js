import React from 'https://esm.sh/react@19';
import { createRoot } from 'https://esm.sh/react-dom@19/client?deps=react@19';
import BlurText from '/components/BlurText.runtime.js';

const controllers = new WeakMap();

function FlowLyric({ text, revision }) {
  const safeText = text || '';
  return React.createElement(
    'div',
    {
      className: 'blur-lyric-stack',
      'data-lyric-revision': revision
    },
    React.createElement('div', { className: 'blur-lyric-copy blur-lyric-copy--base' }, safeText),
    React.createElement(BlurText, {
      key: `ghost-${revision}`,
      text: safeText,
      animateBy: 'letters',
      delay: 14,
      direction: 'top',
      stepDuration: 0.46,
      className: 'blur-lyric-copy blur-lyric-copy--ghost'
    }),
    React.createElement(
      'div',
      { className: 'blur-lyric-progress-window' },
      React.createElement(BlurText, {
        key: `hot-${revision}`,
        text: safeText,
        animateBy: 'letters',
        delay: 16,
        direction: 'top',
        stepDuration: 0.38,
        className: 'blur-lyric-copy blur-lyric-copy--hot'
      })
    )
  );
}

function controllerFor(mount) {
  let controller = controllers.get(mount);
  if (controller) return controller;

  controller = {
    root: createRoot(mount),
    text: '',
    revision: 0,
    render() {
      this.root.render(React.createElement(FlowLyric, {
        text: this.text,
        revision: this.revision
      }));
    },
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
  mount(mount) {
    if (!mount) return null;
    return controllerFor(mount);
  },
  setText(text, mount = document.getElementById('blurLyricMount')) {
    const controller = this.mount(mount);
    if (controller) controller.setText(text);
  }
};

window.dispatchEvent(new CustomEvent('fe-blur-lyrics-ready'));
