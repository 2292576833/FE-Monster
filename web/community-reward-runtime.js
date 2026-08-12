(function communityRewardRuntime(global) {
  'use strict';

  if (!global || global.FeMonsterRewardRuntime) return;

  const PHASES = Object.freeze([
    Object.freeze({ name: 'mail', key: 'mailAnimation', scopes: new Set(['mail-claim']) }),
    Object.freeze({ name: 'claim', key: 'claimAnimation', scopes: new Set(['item-claim', 'identity-card-claim']) }),
    Object.freeze({ name: 'display', key: 'displayAnimation', scopes: new Set(['item-display', 'identity-card-display']) })
  ]);
  const STAGE_KINDS = new Set([
    'high-drop', 'corner-lift', 'spin', 'fall-flat', 'float-front', 'slow-showcase',
    'gold-sweep', 'light-burst', 'mail-open', 'item-rise', 'settle'
  ]);
  const SOUND_CUES = new Set([
    'none', 'crisp-metal', 'soft-metal', 'noble-metal', 'royal-chime', 'platinum-ring',
    'mail-chime', 'item-reveal'
  ]);
  const EASINGS = Object.freeze({
    linear: 'linear',
    'ease-in': 'cubic-bezier(.42,0,1,1)',
    'ease-out': 'cubic-bezier(0,0,.2,1)',
    'ease-in-out': 'cubic-bezier(.4,0,.2,1)',
    spring: 'cubic-bezier(.18,.88,.24,1.18)'
  });
  const DEFAULTS = Object.freeze({
    mail: Object.freeze({ id: 'fe-mail-open', scope: 'mail-claim', soundCue: 'mail-chime', stages: [Object.freeze({ kind: 'mail-open', durationMs: 520, easing: 'ease-out', intensity: 0.62 })] }),
    claim: Object.freeze({ id: 'fe-item-claim', scope: 'item-claim', soundCue: 'item-reveal', stages: [Object.freeze({ kind: 'item-rise', durationMs: 540, easing: 'spring', intensity: 0.6 })] }),
    display: Object.freeze({ id: 'fe-item-display', scope: 'item-display', soundCue: 'none', stages: [Object.freeze({ kind: 'slow-showcase', durationMs: 1200, easing: 'ease-in-out', intensity: 0.3 })] })
  });
  const CUE_PARTIALS = Object.freeze({
    'crisp-metal': [[1320, 0], [1980, 0.035], [2640, 0.075]],
    'soft-metal': [[880, 0], [1320, 0.05], [1760, 0.1]],
    'noble-metal': [[1046.5, 0], [1568, 0.055], [2093, 0.11]],
    'royal-chime': [[783.99, 0], [1174.66, 0.07], [1567.98, 0.14], [2349.32, 0.22]],
    'platinum-ring': [[1396.91, 0], [2093, 0.045], [2793.83, 0.1]],
    'mail-chime': [[659.25, 0], [987.77, 0.08], [1318.51, 0.16]],
    'item-reveal': [[523.25, 0], [783.99, 0.06], [1046.5, 0.12]]
  });

  let stage = null;
  let audioContext = null;
  let activeTask = null;
  let serial = 0;

  function boundedText(value, fallback = '', maximum = 120) {
    const text = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return (text || fallback).slice(0, maximum);
  }

  function boundedNumber(value, fallback, minimum, maximum) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
  }

  function normalizeStage(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const kind = STAGE_KINDS.has(source.kind) ? source.kind : 'settle';
    const easing = Object.prototype.hasOwnProperty.call(EASINGS, source.easing) ? source.easing : 'ease-out';
    return Object.freeze({
      kind,
      durationMs: Math.round(boundedNumber(source.durationMs, 360, 1, 6000)),
      easing,
      intensity: boundedNumber(source.intensity, 0.5, 0, 1)
    });
  }

  function normalizeAnimation(value, phase) {
    const fallback = DEFAULTS[phase.name];
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
    const scope = phase.scopes.has(source.scope) ? source.scope : fallback.scope;
    const stages = Array.isArray(source.stages) && source.stages.length
      ? source.stages.slice(0, 16).map(normalizeStage)
      : fallback.stages;
    return Object.freeze({
      id: boundedText(source.id, fallback.id, 120),
      scope,
      soundCue: SOUND_CUES.has(source.soundCue) ? source.soundCue : fallback.soundCue,
      stages: Object.freeze(stages)
    });
  }

  function normalizeRequest(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const animations = {};
    PHASES.forEach((phase) => { animations[phase.name] = normalizeAnimation(source[phase.key], phase); });
    return Object.freeze({
      attachmentId: boundedText(source.attachmentId, `reward-${Date.now()}`, 120),
      itemType: boundedText(source.itemType, 'item', 60),
      itemId: boundedText(source.itemId, '', 120),
      label: boundedText(source.label, 'FE MOSTER 专属物品', 80),
      animations: Object.freeze(animations)
    });
  }

  function ensureStage() {
    if (stage?.root?.isConnected) return stage;
    const root = document.createElement('section');
    root.className = 'community-reward-stage';
    root.hidden = true;
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-atomic', 'true');
    root.innerHTML = '<span class="community-reward-stage__backdrop" aria-hidden="true"></span>'
      + '<div class="community-reward-stage__surface">'
      + '<span class="community-reward-stage__aura" aria-hidden="true"></span>'
      + '<span class="community-reward-stage__glyph" aria-hidden="true">✦</span>'
      + '<span class="community-reward-stage__sweep" aria-hidden="true"></span>'
      + '<small class="community-reward-stage__phase"></small>'
      + '<strong class="community-reward-stage__label"></strong>'
      + '<span class="community-reward-stage__particles" aria-hidden="true"></span>'
      + '</div>';
    const particles = root.querySelector('.community-reward-stage__particles');
    for (let index = 0; index < 12; index += 1) {
      const particle = document.createElement('i');
      particle.style.setProperty('--reward-particle-index', String(index));
      particles.appendChild(particle);
    }
    document.body.appendChild(root);
    stage = {
      root,
      surface: root.querySelector('.community-reward-stage__surface'),
      glyph: root.querySelector('.community-reward-stage__glyph'),
      phase: root.querySelector('.community-reward-stage__phase'),
      label: root.querySelector('.community-reward-stage__label')
    };
    return stage;
  }

  function dispatch(name, detail) {
    global.dispatchEvent(new CustomEvent(name, { detail: Object.freeze({ ...detail }) }));
  }

  function phaseGlyph(name) {
    return name === 'mail' ? '✉' : name === 'claim' ? '◆' : '✦';
  }

  function phaseLabel(name) {
    return name === 'mail' ? '专属邮件已开启' : name === 'claim' ? '物品已领取' : '专属物品展示';
  }

  function openAudioContext() {
    if (audioContext && audioContext.state !== 'closed') return audioContext;
    const AudioContextClass = global.AudioContext || global.webkitAudioContext;
    if (!AudioContextClass) return null;
    try {
      audioContext = new AudioContextClass({ latencyHint: 'interactive' });
      audioContext.resume?.().catch?.(() => {});
      return audioContext;
    } catch {
      return null;
    }
  }

  function playCue(cue, task) {
    if (cue === 'none') return;
    const partials = CUE_PARTIALS[cue];
    const context = partials && openAudioContext();
    if (!context) return;
    const now = context.currentTime + 0.006;
    partials.forEach(([frequency, offset], index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index === 0 ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.012, 0.055 - index * 0.009), now + offset + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.52 + index * 0.08);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.7 + index * 0.08);
      task.audioNodes.add(oscillator);
      oscillator.addEventListener('ended', () => task.audioNodes.delete(oscillator), { once: true });
    });
  }

  function stageFrames(kind, intensity) {
    const lift = 18 + intensity * 22;
    const scale = 0.78 + intensity * 0.12;
    if (kind === 'mail-open') return [{ opacity: 0, transform: 'translate3d(0,22px,0) rotateX(-18deg) scale(.86)' }, { opacity: 1, transform: 'translate3d(0,0,0) rotateX(0deg) scale(1)' }];
    if (kind === 'light-burst') return [{ opacity: .65, filter: 'brightness(1)' }, { opacity: 1, filter: `brightness(${1.2 + intensity * .8})` }, { opacity: 1, filter: 'brightness(1)' }];
    if (kind === 'item-rise' || kind === 'float-front') return [{ opacity: .35, transform: `translate3d(0,${lift}px,0) scale(${scale})` }, { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }];
    if (kind === 'spin') return [{ transform: 'rotateY(0deg) scale(.92)' }, { transform: 'rotateY(-360deg) scale(1)' }];
    if (kind === 'gold-sweep') return [{ filter: 'brightness(.9)' }, { filter: `brightness(${1.35 + intensity * .55})` }, { filter: 'brightness(1)' }];
    if (kind === 'slow-showcase') return [{ transform: 'rotateY(0deg) translateY(0)' }, { transform: 'rotateY(-18deg) translateY(-4px)' }, { transform: 'rotateY(0deg) translateY(0)' }];
    if (kind === 'high-drop' || kind === 'fall-flat') return [{ opacity: .5, transform: 'translate3d(0,-34px,0) rotateX(18deg)' }, { opacity: 1, transform: 'translate3d(0,0,0) rotateX(0)' }];
    if (kind === 'corner-lift') return [{ transform: 'rotateZ(-8deg) translateY(8px)' }, { transform: 'rotateZ(0deg) translateY(0)' }];
    return [{ opacity: .86, transform: 'scale(.98)' }, { opacity: 1, transform: 'scale(1)' }];
  }

  function waitForAnimation(element, frames, options, task) {
    if (task.controller.signal.aborted) return Promise.reject(task.controller.signal.reason || new DOMException('Aborted', 'AbortError'));
    const reduceMotion = global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const duration = reduceMotion ? 1 : options.duration;
    if (!element.animate) {
      return new Promise((resolve, reject) => {
        const timeout = global.setTimeout(resolve, duration);
        task.timers.add(timeout);
        task.controller.signal.addEventListener('abort', () => {
          global.clearTimeout(timeout);
          task.timers.delete(timeout);
          reject(task.controller.signal.reason || new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    }
    const animation = element.animate(frames, { duration, easing: options.easing, fill: 'both' });
    task.animations.add(animation);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        global.clearTimeout(timeout);
        task.timers.delete(timeout);
        task.animations.delete(animation);
        resolve();
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        global.clearTimeout(timeout);
        task.timers.delete(timeout);
        task.animations.delete(animation);
        reject(error);
      };
      const timeout = global.setTimeout(finish, duration + 120);
      task.timers.add(timeout);
      animation.finished.then(finish, (error) => {
        if (task.controller.signal.aborted) fail(error);
        else finish();
      });
      task.controller.signal.addEventListener('abort', () => {
        try { animation.cancel(); } catch {}
        fail(task.controller.signal.reason || new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }

  function hideStage() {
    if (!stage?.root) return;
    stage.root.classList.remove('is-running');
    stage.root.hidden = true;
    delete stage.root.dataset.phase;
    delete stage.root.dataset.stageKind;
  }

  async function runPhase(phase, animation, request, task) {
    const view = ensureStage();
    const delegatedIdentityDisplay = request.itemType === 'identity-card' && phase.name === 'display';
    view.root.hidden = delegatedIdentityDisplay;
    view.root.classList.add('is-running');
    view.root.dataset.phase = phase.name;
    view.glyph.textContent = phaseGlyph(phase.name);
    view.phase.textContent = phaseLabel(phase.name);
    view.label.textContent = request.label;
    const detail = {
      taskId: task.id,
      phase: 'started',
      name: phase.name,
      attachmentId: request.attachmentId,
      itemType: request.itemType,
      itemId: request.itemId,
      label: request.label,
      animationId: animation.id,
      scope: animation.scope,
      soundCue: animation.soundCue,
      animation
    };
    dispatch('fe-monster-reward-phase', detail);
    dispatch('fe-monster-reward-animation', { ...detail, phase: phase.name, sequenceManaged: true });
    playCue(animation.soundCue, task);
    if (!task.startedSettled) {
      task.startedSettled = true;
      task.resolveStarted(Object.freeze({ status: 'started', taskId: task.id, phase: phase.name }));
    }
    for (const animationStage of animation.stages) {
      if (task.controller.signal.aborted) throw task.controller.signal.reason || new DOMException('Aborted', 'AbortError');
      view.root.dataset.stageKind = animationStage.kind;
      view.root.style.setProperty('--reward-intensity', String(animationStage.intensity));
      dispatch('fe-monster-reward-stage', {
        taskId: task.id,
        phase: phase.name,
        animationId: animation.id,
        stage: animationStage
      });
      await waitForAnimation(view.surface, stageFrames(animationStage.kind, animationStage.intensity), {
        duration: animationStage.durationMs,
        easing: EASINGS[animationStage.easing]
      }, task);
    }
    dispatch('fe-monster-reward-phase', { ...detail, phase: 'completed' });
  }

  function createTask(request) {
    const controller = new AbortController();
    let resolveStarted;
    let resolveFinished;
    const started = new Promise((resolve) => { resolveStarted = resolve; });
    const finished = new Promise((resolve) => { resolveFinished = resolve; });
    const task = {
      id: `reward-${++serial}`,
      request,
      controller,
      animations: new Set(),
      audioNodes: new Set(),
      timers: new Set(),
      started,
      finished,
      resolveStarted,
      resolveFinished,
      startedSettled: false,
      finishedSettled: false,
      cancel(reason = 'cancelled') {
        if (task.finishedSettled || controller.signal.aborted) return false;
        controller.abort(boundedText(reason, 'cancelled', 80));
        task.animations.forEach((animation) => animation.cancel());
        task.animations.clear();
        task.timers.forEach((timer) => global.clearTimeout(timer));
        task.timers.clear();
        task.audioNodes.forEach((node) => { try { node.stop(); } catch {} });
        task.audioNodes.clear();
        hideStage();
        if (!task.startedSettled) {
          task.startedSettled = true;
          task.resolveStarted(Object.freeze({ status: 'cancelled', reason: boundedText(reason, 'cancelled', 80), taskId: task.id }));
        }
        settleTask(task, { status: 'cancelled', reason: boundedText(reason, 'cancelled', 80), taskId: task.id });
        dispatch('fe-monster-reward-phase', { taskId: task.id, phase: 'cancelled', reason: boundedText(reason, 'cancelled', 80), attachmentId: request.attachmentId });
        return true;
      }
    };
    return task;
  }

  function settleTask(task, result) {
    if (task.finishedSettled) return;
    task.finishedSettled = true;
    if (activeTask === task) activeTask = null;
    task.resolveFinished(Object.freeze(result));
  }

  async function runTask(task) {
    try {
      for (const phase of PHASES) {
        await runPhase(phase, task.request.animations[phase.name], task.request, task);
      }
      hideStage();
      settleTask(task, { status: 'completed', taskId: task.id });
    } catch (error) {
      if (task.controller.signal.aborted) return;
      hideStage();
      if (!task.startedSettled) {
        task.startedSettled = true;
        task.resolveStarted(Object.freeze({ status: 'failed', reason: 'animation-error', taskId: task.id }));
      }
      settleTask(task, { status: 'failed', reason: 'animation-error', taskId: task.id });
      dispatch('fe-monster-reward-phase', { taskId: task.id, phase: 'failed', attachmentId: task.request.attachmentId });
    }
  }

  function play(value) {
    activeTask?.cancel('replaced');
    const request = normalizeRequest(value);
    const task = createTask(request);
    activeTask = task;
    Promise.resolve().then(() => runTask(task));
    return Object.freeze({
      taskId: task.id,
      started: task.started,
      finished: task.finished,
      cancel: task.cancel
    });
  }

  function snapshot() {
    return Object.freeze({
      active: !!activeTask,
      taskId: activeTask?.id || '',
      attachmentId: activeTask?.request?.attachmentId || '',
      phase: stage?.root?.dataset?.phase || '',
      stageKind: stage?.root?.dataset?.stageKind || ''
    });
  }

  global.addEventListener('pagehide', () => activeTask?.cancel('pagehide'));
  global.FeMonsterRewardRuntime = Object.freeze({ play, snapshot, cancel: (reason) => activeTask?.cancel(reason) || false });
})(window);
