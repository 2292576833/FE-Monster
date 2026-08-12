# Bailongma desktop-pet audit and attribution

## Upstream

- Project: [chengjiaxi/Bailongma](https://github.com/chengjiaxi/Bailongma)
- Audited revision: `48282ce15c02724f0b60bdd28e45f31d87437fb3`
- Upstream package version at that revision: `2.1.300`
- License: MIT
- Copyright notice: `Copyright (c) 2026 xiaoyuanda666-ship-it`

FE Monster does not vendor Bailongma's runtime or copy its modules. The small algorithms described below were independently rewritten for FE Monster's CommonJS + bounded JSON persistence model. This document preserves attribution for the upstream design inspiration.

## Capability-by-capability decision

| Bailongma area | FE Monster status before this audit | Decision |
| --- | --- | --- |
| `src/ticker.js` adaptive TICK with TTL | FE already has idle/return/late-night/spontaneous proactive triggers, randomized heartbeat, cooldown, quiet mode and per-day controls in `web/pet-emotion-runtime.js`. | Not imported. Giving the model control of the polling cadence would duplicate the client scheduler and increase background work. |
| `src/queue.js` priority and interruption | FE already has request IDs, cancellation, strict per-session ownership, action leases, continuous voice barge-in and stale-response watchdogs. | The global queue was not imported. FE keeps request-scoped cancellation rather than a second in-memory queue. |
| `src/memory/focus.js` focus stack | FE had bounded recent turns but no explicit branch/return representation. | Adopted as a bounded four-frame, keyword-derived topic stack in `pet-continuity.js`. It is JSON-persisted per session, requires no LLM call and resumes an older matching frame. |
| memory relevance/refresh modules | FE had explicit, sensitive-data-filtered per-FE-ID memories, but insertion order did not express importance or age. | Adopted as category importance + current relevance + 120-day half-life ranking. Decay only changes injection order; it never silently deletes a user's explicit memory. |
| Electron shell, `better-sqlite3`, scanners and marketplace tools | FE has a native Windows host, its own JSON/community storage, fixed client command bus and explicit safety policy. | Explicitly rejected: no Electron, SQLite native binding, full-disk/software scan, arbitrary shell/exec, social bridge or tool marketplace was added. |

## Voice audit

### VAD and ASR

The upstream Whisper worker collects roughly 250 ms chunks and waits eight silent chunks before flushing (about two seconds). It repeatedly grows NumPy buffers and runs whole-utterance Whisper jobs with a two-thread pool. FE Monster already uses sherpa-based local recognition, pre-roll/post-roll, a 100 ms speech gate, a 650 ms adaptive endpoint and persisted/idempotent voice turns. Importing the upstream worker would add a duplicate Whisper runtime and increase endpoint latency, memory copying and installer size, so it was rejected.

### TTS scheduling and interruption

The upstream provider layer has a useful generic idea: audio output should be interruptible before a full reply completes. FE already goes further with phrase-level synthesis, fair two-lane scheduling, request-scoped abort signals, strictly ordered `audioSequence` publication, `playing`-before-text gating, Chatterbox/RVC fallback and media-error recovery.

One non-duplicated behavior was adopted from the upstream `duckTTS`/`unduckTTS` concept:

- at 45 ms of credible speech-candidate energy, the currently playing reply eases down to 18% volume over 110 ms;
- if the candidate decays below the gate, volume eases back to 100%;
- at FE's existing 180 ms confirmed barge-in threshold, the current request is still cancelled and its media source is released exactly as before.

This reduces echo/noise without weakening FE's existing confirmed interruption boundary. It is provider-neutral and introduces no service, model or credential.

The upstream `/tts/interrupted` history rewrite was not imported. It estimates heard text by a linear character ratio and mutates the last assistant message globally. That is unsafe for multi-session ownership and inaccurate for variable-duration speech. FE retains complete audit output and request-scoped cancellation; cancelled live replies are discarded from the visible client conversation instead of guessing which characters were heard.

### Process health and fallback

Upstream `src/voice/manager.js` starts a process, infers readiness from stdout text and restarts after a fixed 500 ms delay. It has no health endpoint, exponential backoff or watchdog. FE's local STT prewarm/recovery, finalized-turn retry, Chatterbox health probe and managed worker watchdog are stronger, so the process manager was not imported.

Upstream cloud ASR/TTS providers (OpenAI, ElevenLabs, Doubao, Volcano and others) were not enabled. They would add credentials, cost and privacy paths while duplicating FE's sherpa/Chatterbox/RVC pipeline. Its WHATWG-to-Node stream adapter was also not needed by the current persisted-WAV segment protocol.

## Safety and storage invariants

- Topic frames contain bounded normalized keywords, never raw external pages, credentials or tool output.
- The focus stack is limited to four frames and sixteen terms per frame.
- Memory salience metadata remains under the existing FE-ID-isolated JSON record.
- Existing memory sensitivity checks and the hard 40-memory limit remain authoritative.
- Salience affects prompt order only; it cannot authorize an action or erase memory.
- Proactive turns remain tool-disabled.
- No new network endpoint, download path, native dependency or background process was added.

## MIT license text

MIT License

Copyright (c) 2026 xiaoyuanda666-ship-it

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
