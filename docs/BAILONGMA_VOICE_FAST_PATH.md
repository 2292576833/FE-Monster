# Bailongma voice audit and FE Monster live fast path

## Decision

FE Monster keeps its existing DeepSeek, Chatterbox, RVC, sherpa-onnx and client
barge-in architecture. It does not vendor Bailongma's Whisper worker or voice
process manager. The upstream ideas we retain are provider-neutral: publish the
first playable audio as soon as it is ready, make output interruptible, and
degrade cleanly when a provider is unavailable.

The continuous-conversation fast path is explicit:

- `realtimeVoice=true` + server `realtimeTtsMode=fast` routes content phrases to
  the bundled `sherpa:melo-*` runtime.
- `calm` / `warm` / `thoughtful` delivery uses `sherpa:melo-soft`;
  `energetic` / `playful` uses `sherpa:melo-bright`; other delivery uses
  `sherpa:melo-natural`. The style still comes from FE's per-turn seven-emotion
  analysis.
- Thinking cues remain cache-only Chatterbox audio. Ordinary voice replies and
  high-quality mode continue to use the user's selected Chatterbox/RVC/Kokoro
  voice.
- If the fast provider fails, that phrase is synthesized with the selected
  voice. The audio event reports the actual `provider` and `voiceId`; a Sherpa
  segment is never described as Chatterbox or a cloned voice.
- The bundled Sherpa model warms asynchronously after server startup. Startup is
  never blocked by model loading.

## Measured local baseline

Phrase: `你好，我是小 Fe。`; Windows 11, Node 24.17.0, CPU execution.

| Provider | Cold | Warm | Decision |
| --- | ---: | ---: | --- |
| Chatterbox Chinese CPU worker | 10,741 ms | approximately the same whole-utterance path | Keep for selected high-quality/non-live output |
| Kokoro local | 1,768 ms | 295 ms | Keep selectable; not the packaged live default because native ONNX availability can vary with the Node ABI |
| Sherpa Melo local | 2,181 ms | 398 ms | Bundled, predictable live default; prewarm removes the cold turn |
| Windows System.Speech child process | 260 ms | 235 ms | Fallback only; voice/language inventory differs between computers and has weaker emotion control |
| Edge TTS | unavailable | unavailable | Not advertised; no executable was present |

DeepSeek's measured first response segment is about 1.7 seconds. With the warm
Sherpa route, expected first playable content is therefore around 2.1 seconds,
instead of waiting another roughly 10.7 seconds for CPU Chatterbox. Chatterbox
does not expose incremental audio in this deployment, so FE does not label its
whole-WAV response as streaming.

## Bailongma components intentionally not imported

- Its Whisper worker buffers roughly two seconds of silence and runs
  whole-utterance Whisper jobs. FE's existing adaptive endpoint and local Sherpa
  STT are lower latency.
- Its process manager infers readiness from stdout and restarts after a fixed
  delay. FE retains health probes, watchdogs and bounded retry.
- Cloud speech providers would add credentials, cost and privacy paths.
- Linear character-ratio history truncation after interruption is inaccurate.
  FE keeps request-scoped cancellation and only publishes audio for the active
  generation.

Upstream design reference: [chengjiaxi/Bailongma](https://github.com/chengjiaxi/Bailongma),
MIT license. The implementation here is an independent adaptation to FE Monster's
existing CommonJS server and event protocol.
