(function attachRhythmGame(global) {
  'use strict';

  const VERSION = '2026.07.16-rhythm-game-manual-step-4';
  const TAU = Math.PI * 2;
  const $ = (selector) => document.querySelector(selector);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (from, to, progress) => from + (to - from) * progress;
  const nextFrame = () => new Promise((resolve) => global.requestAnimationFrame(resolve));
  const difficultySettings = Object.freeze({
    relaxed: Object.freeze({ beatStep: 2, window: 0.24, label: '轻松' }),
    normal: Object.freeze({ beatStep: 1, window: 0.2, label: '标准' }),
    intense: Object.freeze({ beatStep: 0.5, window: 0.17, label: '密集' })
  });

  const els = {
    shell: $('.app-shell'),
    diyButton: $('#diyButton'),
    entry: $('#diyRhythmGameButton'),
    scene: $('#rhythmGameScene'),
    canvas: $('#rhythmGameCanvas'),
    exit: $('#rhythmGameExitButton'),
    pause: $('#rhythmGamePauseButton'),
    score: $('#rhythmGameScore'),
    accuracy: $('#rhythmGameAccuracy'),
    combo: $('#rhythmGameCombo'),
    progress: $('#rhythmGameProgressBar'),
    feedback: $('#rhythmGameFeedback'),
    countdown: $('#rhythmGameCountdown'),
    setup: $('#rhythmGameSetup'),
    result: $('#rhythmGameResult'),
    resultRank: $('#rhythmGameResultRank'),
    resultScore: $('#rhythmGameResultScore'),
    resultMeta: $('#rhythmGameResultMeta'),
    restart: $('#rhythmGameRestartButton'),
    changeTrack: $('#rhythmGameChangeTrackButton'),
    choose: $('#rhythmGameChooseButton'),
    current: $('#rhythmGameCurrentButton'),
    fileInput: $('#rhythmGameAudioInput'),
    audio: $('#rhythmGameAudio'),
    mainAudio: $('#audio'),
    trackName: $('#rhythmGameTrackName'),
    trackMeta: $('#rhythmGameTrackMeta'),
    analysis: $('#rhythmGameAnalysis'),
    start: $('#rhythmGameStartButton'),
    hit: $('#rhythmGameHitButton'),
    backgroundImage: $('#rhythmGameBackgroundImage'),
    backgroundVideo: $('#rhythmGameBackgroundVideo'),
    wallpaperImage: $('#wallpaperImage'),
    wallpaperVideo: $('#wallpaperVideo'),
    dockTitle: $('#dockTitle')
  };

  if (!els.entry || !els.scene || !els.canvas || !els.audio) return;

  const context = els.canvas.getContext('2d', { alpha: true });
  const game = {
    active: false,
    mode: 'setup',
    difficulty: 'normal',
    audioContext: null,
    audioBuffer: null,
    sourceUrl: '',
    objectUrl: '',
    trackName: '',
    chart: null,
    judgements: [],
    pathGrades: [],
    pathStep: 0,
    lastAdvanceBeat: -1,
    stats: null,
    missCursor: 0,
    frame: 0,
    feedbackTimer: 0,
    analysisToken: 0,
    pulses: [],
    mainAudioSnapshot: null,
    mainPausedByGame: false,
    wallpaperVideoWasPlaying: false,
    canvasWidth: 0,
    canvasHeight: 0,
    dpr: 1
  };

  function setAnalysis(message, kind = '') {
    els.analysis.textContent = message;
    els.analysis.classList.toggle('is-ready', kind === 'ready');
    els.analysis.classList.toggle('is-error', kind === 'error');
  }

  function setMode(mode) {
    game.mode = mode;
    els.scene.dataset.state = mode === 'ready' || mode === 'analyzing' ? 'setup' : mode;
    els.setup.hidden = !['setup', 'ready', 'analyzing'].includes(mode);
    els.result.hidden = mode !== 'result';
    els.pause.disabled = !['playing', 'paused'].includes(mode);
    els.pause.textContent = mode === 'paused' ? '继续' : '暂停';
    els.pause.setAttribute('aria-label', mode === 'paused' ? '继续音游' : '暂停音游');
    els.hit.disabled = mode !== 'playing';
    els.start.disabled = mode !== 'ready' || !game.chart;
    if (mode !== 'playing') els.hit.classList.remove('is-pressed');
  }

  function resetStats() {
    game.stats = {
      score: 0,
      combo: 0,
      maxCombo: 0,
      judged: 0,
      accuracyWeight: 0,
      perfect: 0,
      great: 0,
      good: 0,
      miss: 0
    };
    game.judgements = new Array(game.chart?.beats.length || 0).fill(null);
    game.pathGrades = new Array(Math.max(0, (game.chart?.points.length || 1) - 1)).fill(null);
    game.pathStep = 0;
    game.lastAdvanceBeat = -1;
    game.missCursor = 0;
    game.pulses.length = 0;
    updateHud(0);
  }

  function accuracyPercent() {
    if (!game.stats || !game.stats.judged) return 100;
    return clamp((game.stats.accuracyWeight / game.stats.judged) * 100, 0, 100);
  }

  function updateHud(time = els.audio.currentTime || 0) {
    const stats = game.stats || { score: 0, combo: 0 };
    const duration = Math.max(0.001, Number(els.audio.duration) || game.audioBuffer?.duration || 1);
    els.score.textContent = String(Math.round(stats.score || 0)).padStart(7, '0');
    els.accuracy.textContent = `${accuracyPercent().toFixed(2)}%`;
    els.combo.textContent = `${stats.combo || 0}x`;
    els.progress.style.transform = `scaleX(${clamp(time / duration, 0, 1).toFixed(4)})`;
  }

  function quantile(values, position) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * position)))] || 0;
  }

  function estimateTempo(peaks) {
    if (peaks.length < 3) return 120;
    const histogram = new Float32Array(141);
    const usable = peaks.slice(0, 900);
    for (let index = 0; index < usable.length; index += 1) {
      for (let next = index + 1; next < Math.min(usable.length, index + 12); next += 1) {
        const difference = usable[next].time - usable[index].time;
        if (difference > 2.2) break;
        if (difference < 0.18) continue;
        let bpm = 60 / difference;
        while (bpm < 60) bpm *= 2;
        while (bpm > 200) bpm /= 2;
        if (bpm < 60 || bpm > 200) continue;
        const bin = Math.round(bpm) - 60;
        const weight = Math.sqrt(usable[index].strength * usable[next].strength) / Math.sqrt(next - index);
        histogram[bin] += weight;
        if (bin > 0) histogram[bin - 1] += weight * 0.45;
        if (bin < histogram.length - 1) histogram[bin + 1] += weight * 0.45;
      }
    }
    let bestBin = 60;
    let bestScore = -1;
    histogram.forEach((score, index) => {
      const bpm = index + 60;
      const preference = bpm >= 78 && bpm <= 176 ? 1.06 : 1;
      if (score * preference > bestScore) {
        bestScore = score * preference;
        bestBin = bpm;
      }
    });
    if (!Number.isFinite(bestBin) || bestScore <= 0) return 120;
    if (bestBin > 176) {
      const half = Math.round(bestBin / 2);
      if ((histogram[half - 60] || 0) >= bestScore * 0.5) bestBin = half;
    }
    if (bestBin < 74) {
      const double = bestBin * 2;
      if (double <= 200 && (histogram[double - 60] || 0) >= bestScore * 0.58) bestBin = double;
    }
    return clamp(bestBin, 60, 200);
  }

  function bestBeatOffset(peaks, interval) {
    if (!peaks.length || !interval) return 0;
    const candidates = peaks.slice(0, 48).map((peak) => peak.time % interval);
    candidates.push(0);
    let bestOffset = candidates[0];
    let bestScore = -1;
    candidates.forEach((candidate) => {
      let score = 0;
      peaks.slice(0, 700).forEach((peak) => {
        const relative = Math.abs(((peak.time - candidate + interval * 0.5) % interval) - interval * 0.5);
        const closeness = Math.exp(-(relative * relative) / Math.max(0.0008, interval * interval * 0.018));
        score += closeness * peak.strength;
      });
      if (score > bestScore) {
        bestScore = score;
        bestOffset = candidate;
      }
    });
    return bestOffset;
  }

  function createPath(beats) {
    const directions = [
      [1, 0], [1, 0], [0, -1], [1, 0], [1, 0], [0, 1],
      [1, 0], [1, 0], [0, 1], [1, 0], [1, 0], [0, -1]
    ];
    const spacing = 88;
    const points = [{ x: 0, y: 0 }];
    beats.forEach((beat, index) => {
      let direction = directions[index % directions.length];
      if (beat.energy > 0.78 && index % 9 === 4) direction = index % 18 < 9 ? [0, -1] : [0, 1];
      const previous = points[points.length - 1];
      points.push({ x: previous.x + direction[0] * spacing, y: previous.y + direction[1] * spacing });
    });
    return points;
  }

  async function analyzeAudioBuffer(audioBuffer, difficulty = game.difficulty) {
    const settings = difficultySettings[difficulty] || difficultySettings.normal;
    const sampleRate = audioBuffer.sampleRate;
    const channels = Math.max(1, audioBuffer.numberOfChannels);
    const channelData = Array.from({ length: Math.min(channels, 2) }, (_, index) => audioBuffer.getChannelData(index));
    const hopSeconds = 0.02;
    const hop = Math.max(256, Math.round(sampleRate * hopSeconds));
    const windowSize = Math.max(hop, Math.round(sampleRate * 0.046));
    const stride = Math.max(1, Math.floor(sampleRate / 11025));
    const frameCount = Math.max(1, Math.floor((audioBuffer.length - windowSize) / hop));
    const energy = new Float32Array(frameCount);

    for (let frame = 0; frame < frameCount; frame += 1) {
      const start = frame * hop;
      const end = Math.min(audioBuffer.length, start + windowSize);
      let power = 0;
      let transient = 0;
      let count = 0;
      for (let sample = start + stride; sample < end; sample += stride) {
        let value = 0;
        let previous = 0;
        for (let channel = 0; channel < channelData.length; channel += 1) {
          value += channelData[channel][sample] || 0;
          previous += channelData[channel][sample - stride] || 0;
        }
        value /= channelData.length;
        previous /= channelData.length;
        power += value * value;
        const difference = value - previous;
        transient += difference * difference;
        count += 1;
      }
      const rms = Math.sqrt(power / Math.max(1, count));
      const edge = Math.sqrt(transient / Math.max(1, count));
      energy[frame] = rms * 0.78 + edge * 0.22;
      if (frame > 0 && frame % 900 === 0) await nextFrame();
    }

    const prefix = new Float64Array(frameCount + 1);
    for (let index = 0; index < frameCount; index += 1) prefix[index + 1] = prefix[index] + energy[index];
    const onset = new Float32Array(frameCount);
    const meanRadius = Math.max(8, Math.round(0.5 / hopSeconds));
    for (let index = 0; index < frameCount; index += 1) {
      const from = Math.max(0, index - meanRadius);
      const to = Math.min(frameCount, index + Math.round(meanRadius * 0.35));
      const localMean = (prefix[to] - prefix[from]) / Math.max(1, to - from);
      const rise = Math.max(0, energy[index] - (energy[index - 1] || energy[index]));
      onset[index] = Math.max(0, energy[index] - localMean * 0.94) + rise * 1.65;
    }

    const positiveOnsets = Array.from(onset).filter((value) => value > 0);
    const threshold = quantile(positiveOnsets, 0.72);
    const minimumPeakFrames = Math.max(2, Math.round(0.2 / hopSeconds));
    const peaks = [];
    for (let index = 2; index < frameCount - 2; index += 1) {
      const value = onset[index];
      if (value < threshold || value < onset[index - 1] || value < onset[index + 1] || value < onset[index - 2] || value < onset[index + 2]) continue;
      const peak = { time: index * hopSeconds, strength: value };
      const previousPeak = peaks[peaks.length - 1];
      if (previousPeak && index - previousPeak.frame < minimumPeakFrames) {
        if (value > previousPeak.strength) Object.assign(previousPeak, peak, { frame: index });
      } else {
        peaks.push({ ...peak, frame: index });
      }
    }

    const strengthCeiling = Math.max(0.0001, quantile(peaks.map((peak) => peak.strength), 0.92));
    peaks.forEach((peak) => { peak.strength = clamp(peak.strength / strengthCeiling, 0.08, 1); });
    const bpm = estimateTempo(peaks);
    const interval = 60 / bpm;
    const step = interval * settings.beatStep;
    const offset = bestBeatOffset(peaks, interval);
    let beatTime = offset;
    while (beatTime < 1.2) beatTime += step;
    const duration = audioBuffer.duration;
    const beats = [];
    let peakCursor = 0;
    while (beatTime < duration - 0.18 && beats.length < 1800) {
      while (peakCursor < peaks.length && peaks[peakCursor].time < beatTime) peakCursor += 1;
      const nearby = [peaks[peakCursor - 1], peaks[peakCursor]].filter(Boolean).sort((a, b) => Math.abs(a.time - beatTime) - Math.abs(b.time - beatTime))[0];
      const snapLimit = Math.min(0.065, step * 0.13);
      const snappedTime = nearby && Math.abs(nearby.time - beatTime) <= snapLimit ? nearby.time : beatTime;
      const frame = clamp(Math.round(snappedTime / hopSeconds), 0, frameCount - 1);
      beats.push({ time: snappedTime, energy: clamp(energy[frame] / Math.max(0.0001, strengthCeiling), 0.12, 1) });
      beatTime += step;
    }

    if (beats.length < 8) {
      beats.length = 0;
      const fallbackStep = Math.max(0.3, step || 0.5);
      for (let time = Math.min(1.2, Math.max(0.35, duration * 0.12)); time < duration - 0.1; time += fallbackStep) {
        beats.push({ time, energy: 0.5 });
      }
    }

    return {
      bpm: Math.round(bpm),
      duration,
      difficulty,
      hitWindow: settings.window,
      beats,
      points: createPath(beats)
    };
  }

  async function audioContextReady() {
    const AudioContextCtor = global.AudioContext || global.webkitAudioContext;
    if (!AudioContextCtor) throw new Error('当前环境不支持本地音频分析');
    if (!game.audioContext) game.audioContext = new AudioContextCtor();
    if (game.audioContext.state === 'suspended') await game.audioContext.resume();
    return game.audioContext;
  }

  async function decodeAndBuild(arrayBuffer, trackName, sourceUrl) {
    const token = ++game.analysisToken;
    setMode('analyzing');
    setAnalysis('正在解析音频波形…');
    els.trackName.textContent = trackName;
    els.trackMeta.textContent = '读取音频并检测节拍中';
    try {
      const audioContext = await audioContextReady();
      const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      if (token !== game.analysisToken) return;
      setAnalysis('正在定位强拍并生成方块轨道…');
      const chart = await analyzeAudioBuffer(decoded, game.difficulty);
      if (token !== game.analysisToken) return;
      if (!chart.beats.length) throw new Error('没有检测到可用节拍');
      game.audioBuffer = decoded;
      game.chart = chart;
      game.trackName = trackName;
      game.sourceUrl = sourceUrl;
      els.audio.src = sourceUrl;
      els.audio.load();
      els.trackName.textContent = trackName;
      els.trackMeta.textContent = `${chart.bpm} BPM · ${chart.beats.length} 个节拍 · ${difficultySettings[game.difficulty].label}关卡`;
      setAnalysis('关卡已生成，可以开始', 'ready');
      resetStats();
      setMode('ready');
    } catch (error) {
      if (token !== game.analysisToken) return;
      game.chart = null;
      game.audioBuffer = null;
      setMode('setup');
      setAnalysis(error?.message || '音乐分析失败，请更换音频文件', 'error');
      els.trackMeta.textContent = '无法读取该音频，请尝试本地 MP3、FLAC 或 WAV';
    }
  }

  function releaseObjectUrl() {
    if (!game.objectUrl) return;
    URL.revokeObjectURL(game.objectUrl);
    game.objectUrl = '';
  }

  async function chooseLocalFile(file) {
    if (!file) return;
    if (!String(file.type || '').startsWith('audio/') && !/\.(mp3|flac|wav|wave|m4a|aac|ogg|oga|opus|webm|mp4|wma|ape|alac|aif|aiff)$/i.test(file.name || '')) {
      setAnalysis('请选择可播放的音频文件', 'error');
      return;
    }
    els.audio.pause();
    releaseObjectUrl();
    game.objectUrl = URL.createObjectURL(file);
    const name = String(file.name || '本地音乐').replace(/\.[^.]+$/, '');
    await decodeAndBuild(await file.arrayBuffer(), name, game.objectUrl);
  }

  async function useCurrentSong() {
    const source = els.mainAudio?.currentSrc || els.mainAudio?.src || '';
    if (!source) {
      setAnalysis('当前没有可用歌曲，请选择本地音乐', 'error');
      return;
    }
    els.audio.pause();
    releaseObjectUrl();
    const title = els.dockTitle?.textContent?.trim();
    const name = title && !/^(FE|Waiting|未选择)/i.test(title) ? title : '当前歌曲';
    try {
      setMode('analyzing');
      setAnalysis('正在读取当前歌曲…');
      const response = await fetch(source, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await decodeAndBuild(await response.arrayBuffer(), name, source);
    } catch (error) {
      setMode('setup');
      setAnalysis('当前歌曲受音源权限限制，请选择本地音乐文件', 'error');
    }
  }

  async function rebuildDifficulty(difficulty) {
    if (!difficultySettings[difficulty]) return;
    game.difficulty = difficulty;
    if (!game.audioBuffer) return;
    const token = ++game.analysisToken;
    setMode('analyzing');
    setAnalysis(`正在生成${difficultySettings[difficulty].label}关卡…`);
    const chart = await analyzeAudioBuffer(game.audioBuffer, difficulty);
    if (token !== game.analysisToken) return;
    game.chart = chart;
    els.trackMeta.textContent = `${chart.bpm} BPM · ${chart.beats.length} 个节拍 · ${difficultySettings[difficulty].label}关卡`;
    setAnalysis('关卡已生成，可以开始', 'ready');
    resetStats();
    setMode('ready');
  }

  function snapshotMainAudio() {
    if (!els.mainAudio || game.mainAudioSnapshot) return;
    game.mainAudioSnapshot = {
      wasPlaying: !els.mainAudio.paused && !els.mainAudio.ended,
      currentTime: Number(els.mainAudio.currentTime) || 0
    };
  }

  function pauseMainAudioForGame() {
    snapshotMainAudio();
    if (!els.mainAudio || els.mainAudio.paused) return;
    els.mainAudio.pause();
    game.mainPausedByGame = true;
  }

  function resumeMainAudioAfterGame() {
    if (!game.mainPausedByGame || !game.mainAudioSnapshot?.wasPlaying || !els.mainAudio) return;
    els.mainAudio.play().catch(() => {});
    game.mainPausedByGame = false;
  }

  async function startGame() {
    if (!game.chart || !game.sourceUrl) return;
    snapshotMainAudio();
    pauseMainAudioForGame();
    els.audio.pause();
    els.audio.currentTime = 0;
    resetStats();
    setMode('playing');
    try {
      await audioContextReady();
      await els.audio.play();
      if (!game.active) els.audio.pause();
    } catch (error) {
      setMode('ready');
      setAnalysis('无法开始播放，请再次点击开始或更换音乐', 'error');
      resumeMainAudioAfterGame();
    }
  }

  function togglePause() {
    if (game.mode === 'playing') {
      els.audio.pause();
      setMode('paused');
      els.countdown.hidden = false;
      els.countdown.textContent = '已暂停';
    } else if (game.mode === 'paused') {
      els.countdown.hidden = true;
      els.audio.play().then(() => setMode('playing')).catch(() => {});
    }
  }

  function showFeedback(text, grade) {
    global.clearTimeout(game.feedbackTimer);
    els.feedback.textContent = text;
    els.feedback.dataset.grade = grade;
    els.feedback.classList.add('is-visible');
    game.feedbackTimer = global.setTimeout(() => els.feedback.classList.remove('is-visible'), grade === 'miss' ? 230 : 320);
  }

  function lowerBoundBeat(time) {
    const beats = game.chart?.beats || [];
    let low = 0;
    let high = beats.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (beats[middle].time < time) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function recordJudgement(index, grade, weight, baseScore) {
    if (!game.stats || game.judgements[index]) return;
    game.judgements[index] = grade;
    game.stats.judged += 1;
    game.stats.accuracyWeight += weight;
    game.stats[grade] += 1;
    if (grade === 'miss') {
      game.stats.combo = 0;
    } else {
      game.stats.combo += 1;
      game.stats.maxCombo = Math.max(game.stats.maxCombo, game.stats.combo);
      const comboMultiplier = 1 + Math.min(50, game.stats.combo) * 0.01;
      game.stats.score += Math.round(baseScore * comboMultiplier);
      game.pathStep = Math.min(game.pathStep + 1, Math.max(0, game.chart.points.length - 1));
      game.pathGrades[game.pathStep - 1] = grade;
      game.lastAdvanceBeat = index;
    }
    const pulseStep = grade === 'miss'
      ? Math.min(game.pathStep + 1, game.chart.points.length - 1)
      : game.pathStep;
    const point = game.chart.points[pulseStep];
    if (point) game.pulses.push({ x: point.x, y: point.y, bornAt: performance.now(), grade });
    updateHud();
  }

  function judgeHit() {
    if (game.mode !== 'playing' || !game.chart) return;
    const time = els.audio.currentTime;
    const windowSize = game.chart.hitWindow;
    const insertion = lowerBoundBeat(time);
    let candidate = -1;
    let difference = Number.POSITIVE_INFINITY;
    for (let index = Math.max(0, insertion - 2); index <= Math.min(game.chart.beats.length - 1, insertion + 1); index += 1) {
      if (game.judgements[index]) continue;
      const nextDifference = Math.abs(game.chart.beats[index].time - time);
      if (nextDifference < difference) {
        difference = nextDifference;
        candidate = index;
      }
    }
    els.hit.classList.add('is-pressed');
    global.setTimeout(() => els.hit.classList.remove('is-pressed'), 80);
    if (candidate < 0 || difference > windowSize) {
      showFeedback(insertion < game.chart.beats.length && game.chart.beats[insertion].time > time ? 'EARLY' : 'LATE', 'miss');
      if (game.stats) game.stats.combo = 0;
      updateHud();
      return;
    }
    if (difference <= 0.065) {
      recordJudgement(candidate, 'perfect', 1, 1000);
      showFeedback('PERFECT', 'perfect');
    } else if (difference <= 0.125) {
      recordJudgement(candidate, 'great', 0.82, 720);
      showFeedback('GREAT', 'great');
    } else {
      recordJudgement(candidate, 'good', 0.55, 420);
      showFeedback('GOOD', 'good');
    }
  }

  function markMisses(time) {
    if (!game.chart || !game.stats) return;
    let missed = false;
    while (game.missCursor < game.chart.beats.length && game.chart.beats[game.missCursor].time < time - game.chart.hitWindow) {
      if (!game.judgements[game.missCursor]) {
        recordJudgement(game.missCursor, 'miss', 0, 0);
        missed = true;
      }
      game.missCursor += 1;
    }
    if (missed) showFeedback('MISS', 'miss');
  }

  function finalRank(accuracy, misses) {
    if (accuracy >= 98.5 && misses === 0) return 'S';
    if (accuracy >= 92) return 'A';
    if (accuracy >= 82) return 'B';
    if (accuracy >= 70) return 'C';
    return 'D';
  }

  function endGame() {
    if (!game.chart || game.mode === 'result') return;
    game.chart.beats.forEach((beat, index) => {
      if (!game.judgements[index]) recordJudgement(index, 'miss', 0, 0);
    });
    els.audio.pause();
    const accuracy = accuracyPercent();
    els.resultRank.textContent = finalRank(accuracy, game.stats.miss);
    els.resultScore.textContent = String(Math.round(game.stats.score)).padStart(7, '0');
    els.resultMeta.textContent = `${accuracy.toFixed(2)}% 准确率 · ${game.stats.maxCombo}x 最大连击 · ${game.stats.miss} 次失误`;
    els.countdown.hidden = true;
    setMode('result');
  }

  function resizeCanvas() {
    const rect = els.canvas.getBoundingClientRect();
    const dpr = Math.min(2, Math.max(1, Number(global.devicePixelRatio) || 1));
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (els.canvas.width !== width || els.canvas.height !== height) {
      els.canvas.width = width;
      els.canvas.height = height;
    }
    game.canvasWidth = rect.width;
    game.canvasHeight = rect.height;
    game.dpr = dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawOrb(x, y, radius, color, softColor) {
    const glow = context.createRadialGradient(x, y, 1, x, y, radius * 2.8);
    glow.addColorStop(0, softColor);
    glow.addColorStop(0.38, softColor.replace(/0\.[0-9]+\)/, '0.24)'));
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, radius * 2.8, 0, TAU);
    context.fill();
    const core = context.createRadialGradient(x - radius * 0.32, y - radius * 0.36, 1, x, y, radius);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.28, color);
    core.addColorStop(1, softColor.replace(/0\.[0-9]+\)/, '0.92)'));
    context.fillStyle = core;
    context.beginPath();
    context.arc(x, y, radius, 0, TAU);
    context.fill();
  }

  function drawIdle(time) {
    const width = game.canvasWidth;
    const height = game.canvasHeight;
    const centerX = width * 0.5;
    const centerY = height * 0.48;
    const radius = Math.min(width, height) * 0.095;
    context.strokeStyle = 'rgba(207, 238, 248, 0.15)';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, TAU);
    context.stroke();
    const angle = time * 0.00045;
    drawOrb(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, 12, '#8ceaff', 'rgba(66, 204, 255, 0.72)');
    drawOrb(centerX - Math.cos(angle) * radius, centerY - Math.sin(angle) * radius, 12, '#ffe1a0', 'rgba(255, 187, 83, 0.68)');
  }

  function drawGame(time, frameTime) {
    resizeCanvas();
    const width = game.canvasWidth;
    const height = game.canvasHeight;
    context.clearRect(0, 0, width, height);
    if (!game.chart?.beats.length) {
      drawIdle(frameTime);
      return;
    }

    const beats = game.chart.beats;
    const points = game.chart.points;
    const timingIndex = clamp(Math.max(lowerBoundBeat(time), game.lastAdvanceBeat + 1), 0, beats.length - 1);
    const pathStep = clamp(game.pathStep, 0, points.length - 1);
    const current = points[pathStep];
    const next = points[pathStep + 1] || current;
    const previous = pathStep > 0
      ? points[pathStep - 1]
      : { x: current.x - (next.x - current.x), y: current.y - (next.y - current.y) };
    const previousBeat = timingIndex > 0 ? beats[timingIndex - 1].time : Math.max(0, beats[timingIndex].time - 60 / game.chart.bpm);
    const segmentDuration = Math.max(0.08, beats[timingIndex].time - previousBeat);
    const progress = clamp((time - previousBeat) / segmentDuration, 0, 1);
    const scale = clamp(width / 1280, 0.72, 1.05);
    const cameraX = lerp(current.x, next.x, 0.28);
    const cameraY = lerp(current.y, next.y, 0.28);
    const screenPoint = (point) => ({
      x: width * 0.5 + (point.x - cameraX) * scale,
      y: height * 0.53 + (point.y - cameraY) * scale
    });
    const from = Math.max(0, pathStep - 5);
    const to = Math.min(points.length - 1, pathStep + 17);

    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    for (let index = from; index <= to; index += 1) {
      const point = screenPoint(points[index]);
      if (index === from) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    context.strokeStyle = 'rgba(168, 226, 244, 0.1)';
    context.lineWidth = 22 * scale;
    context.stroke();
    context.strokeStyle = 'rgba(218, 241, 249, 0.28)';
    context.lineWidth = 2 * scale;
    context.stroke();

    for (let index = from; index <= to; index += 1) {
      const point = screenPoint(points[index]);
      const judgement = index > 0 ? game.pathGrades[index - 1] : null;
      const isTarget = index === pathStep + 1;
      const size = (isTarget ? 42 : 36) * scale;
      context.fillStyle = judgement === 'miss'
        ? 'rgba(255, 117, 117, 0.2)'
        : judgement
          ? 'rgba(184, 255, 226, 0.23)'
          : isTarget
            ? 'rgba(241, 249, 242, 0.78)'
            : 'rgba(223, 238, 244, 0.28)';
      context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
      context.strokeStyle = isTarget ? 'rgba(255, 231, 164, 0.88)' : 'rgba(235, 246, 250, 0.24)';
      context.lineWidth = isTarget ? 2 : 1;
      context.strokeRect(point.x - size / 2, point.y - size / 2, size, size);
    }

    const currentScreen = screenPoint(current);
    const startAngle = Math.atan2(previous.y - current.y, previous.x - current.x);
    const endAngle = Math.atan2(next.y - current.y, next.x - current.x);
    let angleDistance = (endAngle - startAngle + TAU) % TAU;
    if (angleDistance < 0.12) angleDistance = TAU;
    const movingAngle = timingIndex === game.lastAdvanceBeat + 1
      ? startAngle + angleDistance * progress
      : endAngle - TAU * (1 - progress);
    const orbitRadius = Math.hypot(next.x - current.x, next.y - current.y) * scale;
    const movingX = currentScreen.x + Math.cos(movingAngle) * orbitRadius;
    const movingY = currentScreen.y + Math.sin(movingAngle) * orbitRadius;
    const firstColor = pathStep % 2 === 0;

    context.strokeStyle = 'rgba(226, 244, 250, 0.42)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(currentScreen.x, currentScreen.y);
    context.lineTo(movingX, movingY);
    context.stroke();
    drawOrb(currentScreen.x, currentScreen.y, 12 * scale, firstColor ? '#8ceaff' : '#ffe1a0', firstColor ? 'rgba(66, 204, 255, 0.72)' : 'rgba(255, 187, 83, 0.68)');
    drawOrb(movingX, movingY, 12 * scale, firstColor ? '#ffe1a0' : '#8ceaff', firstColor ? 'rgba(255, 187, 83, 0.68)' : 'rgba(66, 204, 255, 0.72)');

    const now = performance.now();
    game.pulses = game.pulses.filter((pulse) => now - pulse.bornAt < 520);
    game.pulses.forEach((pulse) => {
      const point = screenPoint(pulse);
      const age = clamp((now - pulse.bornAt) / 520, 0, 1);
      context.strokeStyle = pulse.grade === 'miss' ? `rgba(255, 125, 125, ${1 - age})` : `rgba(144, 235, 255, ${1 - age})`;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(point.x, point.y, lerp(16, 52, age) * scale, 0, TAU);
      context.stroke();
    });
    context.restore();
  }

  function renderFrame(frameTime) {
    if (!game.active) return;
    const time = Number(els.audio.currentTime) || 0;
    if (game.mode === 'playing') {
      markMisses(time);
      updateHud(time);
      const firstBeat = game.chart?.beats[0]?.time || 0;
      const remaining = firstBeat - time;
      if (remaining > 0.15) {
        els.countdown.hidden = false;
        els.countdown.textContent = remaining > 1 ? String(Math.ceil(remaining)) : 'GO';
      } else {
        els.countdown.hidden = true;
      }
      const lastBeat = game.chart?.beats[game.chart.beats.length - 1]?.time || 0;
      if (time > lastBeat + 0.65 || els.audio.ended) endGame();
    }
    drawGame(time, frameTime);
    game.frame = global.requestAnimationFrame(renderFrame);
  }

  function setBackgroundMedia(wallpaper) {
    els.backgroundImage.classList.remove('is-active');
    els.backgroundVideo.classList.remove('is-active');
    els.backgroundVideo.pause();
    els.backgroundVideo.removeAttribute('src');
    els.backgroundImage.removeAttribute('src');
    if (!wallpaper?.url) return;
    if (wallpaper.kind === 'video') {
      els.backgroundVideo.src = wallpaper.url;
      els.backgroundVideo.classList.add('is-active');
      els.backgroundVideo.load();
      els.backgroundVideo.play().catch(() => {});
    } else {
      els.backgroundImage.src = wallpaper.url;
      els.backgroundImage.classList.add('is-active');
    }
  }

  async function syncWallpaperBackground() {
    let prefs = {};
    try { prefs = JSON.parse(global.localStorage.getItem('fe-monster-wallpaper-prefs') || '{}'); } catch (error) {}
    const brightness = clamp((Number(prefs.brightness) || 1) * 0.72, 0.42, 0.92);
    els.scene.style.setProperty('--rhythm-wallpaper-brightness', brightness.toFixed(2));
    const currentVideo = els.wallpaperVideo?.getAttribute('src');
    const currentImage = els.wallpaperImage?.getAttribute('src');
    if (currentVideo) {
      setBackgroundMedia({ kind: 'video', url: currentVideo });
      return;
    }
    if (currentImage) {
      setBackgroundMedia({ kind: 'image', url: currentImage });
      return;
    }
    try {
      const response = await fetch('/api/wallpapers?scan=false');
      if (!response.ok) return;
      const payload = await response.json();
      const wallpapers = Array.isArray(payload.wallpapers) ? payload.wallpapers : [];
      const source = prefs.source === 'live' ? 'wallpaper-engine' : 'imported';
      const activeIds = prefs.activeWallpaperIds && typeof prefs.activeWallpaperIds === 'object' ? prefs.activeWallpaperIds : {};
      const activeId = activeIds[prefs.source === 'live' ? 'live' : 'imported'] || prefs.activeWallpaperId || '';
      const candidates = wallpapers.filter((wallpaper) => wallpaper?.source === source);
      setBackgroundMedia(candidates.find((wallpaper) => String(wallpaper.id) === String(activeId)) || candidates[0]);
    } catch (error) {
      // The game remains usable with its neutral fallback background.
    }
  }

  function openGame() {
    if (game.active) return;
    game.active = true;
    snapshotMainAudio();
    if (els.diyButton?.getAttribute('aria-expanded') === 'true') els.diyButton.click();
    game.wallpaperVideoWasPlaying = !!els.wallpaperVideo && !els.wallpaperVideo.paused;
    if (game.wallpaperVideoWasPlaying) els.wallpaperVideo.pause();
    els.scene.hidden = false;
    els.shell?.classList.add('has-rhythm-game');
    els.entry.classList.add('is-active');
    els.entry.setAttribute('aria-pressed', 'true');
    setMode(game.chart ? 'ready' : 'setup');
    syncWallpaperBackground();
    global.cancelAnimationFrame(game.frame);
    game.frame = global.requestAnimationFrame(renderFrame);
    global.setTimeout(() => (game.chart ? els.start : els.choose).focus(), 0);
  }

  function closeGame() {
    if (!game.active) return;
    game.analysisToken += 1;
    els.audio.pause();
    els.backgroundVideo.pause();
    global.cancelAnimationFrame(game.frame);
    global.clearTimeout(game.feedbackTimer);
    game.active = false;
    game.frame = 0;
    setMode(game.chart ? 'ready' : 'setup');
    els.scene.hidden = true;
    els.shell?.classList.remove('has-rhythm-game');
    els.entry.classList.remove('is-active');
    els.entry.setAttribute('aria-pressed', 'false');
    els.countdown.hidden = true;
    els.feedback.classList.remove('is-visible');
    if (game.wallpaperVideoWasPlaying) els.wallpaperVideo?.play().catch(() => {});
    game.wallpaperVideoWasPlaying = false;
    resumeMainAudioAfterGame();
    game.mainAudioSnapshot = null;
    els.diyButton?.focus();
  }

  function showSetup() {
    els.audio.pause();
    els.audio.currentTime = 0;
    setMode(game.chart ? 'ready' : 'setup');
  }

  function onKeyDown(event) {
    if (!game.active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeGame();
      return;
    }
    if (event.code === 'KeyP' && ['playing', 'paused'].includes(game.mode)) {
      event.preventDefault();
      event.stopPropagation();
      togglePause();
      return;
    }
    if (game.mode === 'result' && event.code === 'KeyR') {
      event.preventDefault();
      startGame();
      return;
    }
    if (!['Space', 'Enter', 'KeyF', 'KeyJ'].includes(event.code) || game.mode !== 'playing') return;
    event.preventDefault();
    event.stopPropagation();
    judgeHit();
  }

  els.entry.addEventListener('click', openGame);
  els.scene.addEventListener('pointerdown', (event) => event.stopPropagation());
  els.exit.addEventListener('click', closeGame);
  els.pause.addEventListener('click', togglePause);
  els.choose.addEventListener('click', () => els.fileInput.click());
  els.current.addEventListener('click', useCurrentSong);
  els.start.addEventListener('click', startGame);
  els.restart.addEventListener('click', startGame);
  els.changeTrack.addEventListener('click', showSetup);
  els.hit.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    judgeHit();
  });
  els.canvas.addEventListener('pointerdown', (event) => {
    if (game.mode !== 'playing') return;
    event.preventDefault();
    judgeHit();
  });
  els.fileInput.addEventListener('change', () => {
    chooseLocalFile(els.fileInput.files?.[0]).finally(() => { els.fileInput.value = ''; });
  });
  document.querySelectorAll('input[name="rhythmDifficulty"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (input.checked) rebuildDifficulty(input.value);
    });
  });
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.mode === 'playing') togglePause();
  });
  global.addEventListener('beforeunload', releaseObjectUrl);
  els.audio.addEventListener('ended', endGame);
  setMode('setup');

  global.FeRhythmGame = Object.freeze({
    VERSION,
    open: openGame,
    close: closeGame,
    start: startGame,
    analyzeAudioBuffer,
    getState: () => ({
      active: game.active,
      mode: game.mode,
      difficulty: game.difficulty,
      bpm: game.chart?.bpm || 0,
      beatCount: game.chart?.beats.length || 0,
      pathStep: game.pathStep,
      score: game.stats?.score || 0,
      combo: game.stats?.combo || 0
    })
  });
})(window);
