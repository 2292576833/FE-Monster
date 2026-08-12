import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');

function functionBody(name) {
  const signature = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const match = signature.exec(app);
  if (!match) return '';
  const parameters = app.indexOf('(', match.index);
  if (parameters < 0) return '';
  let parameterDepth = 0;
  let opening = -1;
  let parameterQuote = '';
  let parameterEscaped = false;
  for (let index = parameters; index < app.length; index += 1) {
    const char = app[index];
    if (parameterQuote) {
      if (parameterEscaped) parameterEscaped = false;
      else if (char === '\\') parameterEscaped = true;
      else if (char === parameterQuote) parameterQuote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      parameterQuote = char;
      continue;
    }
    if (char === '(') parameterDepth += 1;
    else if (char === ')' && --parameterDepth === 0) {
      opening = app.indexOf('{', index + 1);
      break;
    }
  }
  if (opening < 0) return '';
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = opening; index < app.length; index += 1) {
    const char = app[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}' && --depth === 0) return app.slice(match.index, index + 1);
  }
  return '';
}

const transitionSource = functionBody('setAudioAnalysisContextRunning');
const resumeSource = functionBody('resumeAudioAnalysis');
const suspendSource = functionBody('suspendAudioAnalysis');
const playbackActiveSource = functionBody('audioAnalysisPlaybackActive');
const ensureSource = functionBody('ensureAudioAnalysis');
const obrToggleSource = functionBody('setGoogleObrSpatialAudioEnabled');
const obrLayoutSource = functionBody('setGoogleObrChannelLayout');

async function flushUntil(predicate, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return true;
    await Promise.resolve();
  }
  return predicate();
}

async function exerciseTransitions() {
  if (!transitionSource || !resumeSource || !suspendSource) {
    return { available: false };
  }
  const state = {
    audioAnalysis: {
      context: null,
      contextShouldRun: true,
      contextTransition: null
    }
  };
  const runtime = new Function(
    'state',
    `${transitionSource}\n${resumeSource}\n${suspendSource}\n`
      + 'return { resumeAudioAnalysis, suspendAudioAnalysis };'
  )(state);

  const calls = [];
  let resolveSuspend;
  let resolveResume;
  const context = {
    state: 'running',
    suspend() {
      calls.push('suspend');
      return new Promise((resolve) => {
        resolveSuspend = () => {
          context.state = 'suspended';
          resolve();
        };
      });
    },
    resume() {
      calls.push('resume');
      return new Promise((resolve) => {
        resolveResume = () => {
          context.state = 'running';
          resolve();
        };
      });
    }
  };
  state.audioAnalysis.context = context;

  const suspend = runtime.suspendAudioAnalysis();
  const suspendStarted = await flushUntil(() => typeof resolveSuspend === 'function');
  const resume = runtime.resumeAudioAnalysis();
  resolveSuspend?.();
  const resumeStarted = await flushUntil(() => typeof resolveResume === 'function');
  resolveResume?.();
  await Promise.all([suspend, resume]);
  const pauseThenPlay = {
    suspendStarted,
    resumeStarted,
    state: context.state,
    calls: [...calls]
  };

  calls.length = 0;
  resolveSuspend = undefined;
  resolveResume = undefined;
  context.state = 'suspended';
  const resuming = runtime.resumeAudioAnalysis();
  const secondResumeStarted = await flushUntil(() => typeof resolveResume === 'function');
  const suspending = runtime.suspendAudioAnalysis();
  resolveResume?.();
  const secondSuspendStarted = await flushUntil(() => typeof resolveSuspend === 'function');
  resolveSuspend?.();
  await Promise.all([resuming, suspending]);
  const playThenPause = {
    resumeStarted: secondResumeStarted,
    suspendStarted: secondSuspendStarted,
    state: context.state,
    calls: [...calls]
  };

  return { available: true, pauseThenPlay, playThenPause };
}

const transitions = await exerciseTransitions();
const contextConstruction = ensureSource.indexOf('new AudioContextCtor');
const inactiveGuard = ensureSource.indexOf('audioAnalysisPlaybackActive()');
const checks = {
  transitionsAreSerialized:
    /contextTransition/.test(transitionSource)
    && /\.then\s*\(/.test(transitionSource),
  rapidPauseThenPlayEndsRunning:
    transitions.available
    && transitions.pauseThenPlay.suspendStarted
    && transitions.pauseThenPlay.resumeStarted
    && transitions.pauseThenPlay.state === 'running'
    && transitions.pauseThenPlay.calls.join(',') === 'suspend,resume',
  rapidPlayThenPauseEndsSuspended:
    transitions.available
    && transitions.playThenPause.resumeStarted
    && transitions.playThenPause.suspendStarted
    && transitions.playThenPause.state === 'suspended'
    && transitions.playThenPause.calls.join(',') === 'resume,suspend',
  inactiveEnsureDoesNotConstructOrResumeContext:
    /audioAnalysisPlaybackActive/.test(playbackActiveSource)
    && inactiveGuard >= 0
    && contextConstruction > inactiveGuard,
  inactiveEnsureDoesNotActivateObr:
    /audioAnalysisPlaybackActive\s*\(\)/.test(ensureSource)
    && /activateOfficialGoogleObr/.test(ensureSource),
  pausedObrToggleWaitsForPlayback:
    /audioAnalysisPlaybackActive\s*\(\)/.test(obrToggleSource)
    && obrToggleSource.indexOf('audioAnalysisPlaybackActive()')
      < obrToggleSource.indexOf('ensureAudioAnalysis('),
  pausedObrLayoutWaitsForPlayback:
    /audioAnalysisPlaybackActive\s*\(\)/.test(obrLayoutSource)
    && obrLayoutSource.indexOf('audioAnalysisPlaybackActive()')
      < obrLayoutSource.indexOf('ensureAudioAnalysis(')
};

const failures = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

console.log(JSON.stringify({
  pass: failures.length === 0,
  checks,
  transitions,
  failures
}, null, 2));

if (failures.length) process.exitCode = 1;
