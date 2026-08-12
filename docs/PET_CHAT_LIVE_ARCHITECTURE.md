# FE Monster Chat Live architecture

## Goal

Keep DeepSeek as the text reasoning and tool engine while making the desktop pet feel continuously conversational. The system stays a chained speech pipeline:

`microphone -> streaming STT -> DeepSeek token stream -> phrase TTS -> continuous playout`

This is intentionally not described as native speech-to-speech. DeepSeek still receives authoritative text so memories, tools, safety checks, and audit records remain deterministic.

## Deep modules and interfaces

- `LiveCapture`: owns one microphone stream for the whole live session and emits 16 kHz mono PCM in 20 ms frames. It hides AudioWorklet setup, resampling, RMS, pre-roll, and ScriptProcessor fallback.
- `OnlineSttSession`: accepts ordered PCM frames and emits revisioned partial transcripts, endpoints, and one authoritative final transcript. Offline recognition is only a final correction adapter, never a fake incremental decoder.
- `PlayoutTimeline`: accepts ordered audio segments, fetches and decodes current/next segments, schedules an AudioContext timeline, reports the played cursor, and interrupts immediately.
- `PlaybackLedger`: stores only server-authored content segments that were actually published. A client interruption supplies numeric audio cursors; the server never accepts client-authored assistant text.
- `SessionTelemetry`: records bounded monotonic stage timings without recording transcript text, credentials, local paths, or user/session identifiers as metric labels.

## State and ordering rules

1. Capture frames carry a monotonically increasing `epoch` and `sequence`.
2. Partial STT is speculative UI state. Only authoritative final STT may invoke tools or enter persistent history.
3. Audio segments are ordered by `audioSequence`; the global event `sequence` is not an audio index.
4. Matching reply text becomes visible only when the corresponding audio is actually playing. A completion event is not proof that playback finished.
5. On barge-in, local audio is ducked/stopped first. The server then cancels work and truncates history to fully played content segments.
6. Each queue is bounded. Control and interruption outrank audio; audio outranks replaceable partial transcript updates.

## Rollout phases

- Phase 0 — implemented: bounded monotonic stage telemetry (256 events / 64 KiB per flush), without transcript text or identity-bearing metric labels.
- Phase 1 — implemented: one microphone stream per live session, AudioWorklet capture at 16 kHz mono in 20 ms / 320-sample frames, with the existing whole-turn WAV path retained as a kill switch.
- Phase 2 — implemented: the official bilingual Sherpa online recognizer, revisioned partials, authoritative final transcript, endpoint detection, ordered batches, and deterministic offline fallback. The installed model is auto-enabled only after its encoder, decoder, and token files pass validation, then prewarmed in the background after the HTTP listener starts; a failed prewarm does not block startup and the next session retries. `FE_LOCAL_STREAMING_STT_ENABLED=0` remains the kill switch.
- Phase 3 — implemented: played-audio cursor, server-authored playback ledger, idempotent completed-response truncation, and immediate local barge-in.
- Phase 4 — implemented: AudioContext predecode and ordered scheduling, 120 ms startup buffer, bounded look-ahead, semantic-pause-aware 15 ms joins, per-segment text reveal on the real `playing` boundary, and cursor reporting.
- Phase 5a — implemented: authenticated same-origin HTTP streaming bridge with 200 ms batches (10 × 20 ms frames), monotonic sequence checks, ownership binding, bounded queues, replay idempotency, and Windows Java proxy validation.
- Phase 5b — deferred: binary WSS transport and a single-owner actor per live session. It should be added only if deployed telemetry proves that HTTP batching or request scheduling is a material latency source.
- Phase 6 — in progress: installed-client validation is covered by Java proxy and installer contracts; sustained 10/50/100-session public-server canaries remain a deployment exercise rather than a local-code claim.

## Measured local baseline

- AudioWorklet capture at 48 kHz input: 19.95 ms mean frame interval, 20.1 ms p95, 52.3 ms first frame.
- Sherpa first cold session: 3.62 seconds of audio decoded at RTF 0.3016; the model added about 249.61 MiB RSS.
- Sherpa warm load: two sessions at aggregate RTF 0.0331 and four sessions at 0.0316, with isolated streams, partial revisions, endpoint, and final transcripts.
- Mocked end-to-end speech scheduling regression: first audio about 98 ms, four-session p95 about 93 ms, with global synthesis concurrency capped at two.

These numbers describe this Windows development machine and deterministic fixtures; they are regression baselines, not public-network latency promises.

WebRTC is deferred until telemetry shows that public-network jitter, NAT traversal, or WebSocket head-of-line blocking is a material bottleneck. The current Windows/Java proxy and distribution path must be accounted for before adding it.

## Primary references

- OpenAI Realtime conversations and truncation semantics: https://developers.openai.com/api/docs/guides/realtime-conversations
- OpenAI voice-agent architecture choices: https://developers.openai.com/api/docs/guides/voice-agents
- GPT Live engineering: https://openai.com/index/continuous-voice-interaction-with-gpt-live/
- Sherpa ONNX streaming JavaScript interface: https://k2-fsa.github.io/sherpa/onnx/javascript-api/examples/api_streaming_asr.html
- Sherpa online Paraformer models: https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-paraformer/index.html
- Web Audio / AudioWorklet: https://www.w3.org/TR/webaudio-1.1/
- Media capture constraints: https://www.w3.org/TR/mediacapture-streams/
- WebRTC statistics and data-channel backpressure: https://www.w3.org/TR/webrtc/

OpenAI's model weights, native audio reasoning, learned turn-taking, global media infrastructure, and internal handoff systems are not copied or represented as FE Monster capabilities.
