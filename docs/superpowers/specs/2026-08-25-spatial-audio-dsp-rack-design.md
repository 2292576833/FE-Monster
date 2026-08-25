# Spatial Audio and DSP Rack Design

Date: 2026-08-25  
Status: approved for implementation planning

## 1. Objective

Improve headphone spatial clarity and surround presence without reintroducing clipping, pumping, or timbral damage, and add real DSP effects rather than presets that only rename existing EQ/reverb combinations.

The implementation must:

- preserve a transparent path when every new effect is disabled;
- keep the Rust audio callback allocation-free, lock-free, file-free, and log-free;
- preserve existing mixer, upmix, OBR, seek, and persistence behavior;
- use canonical 5.1 and 7.1 virtual-speaker geometry;
- retain old users' saved settings while adding defaults for new parameters;
- expose each new effect as an independently switchable module with understandable controls;
- remain safe for 2.0, 5.1, and 7.1 processing at 16–192 kHz.

## 2. Evidence and Design Basis

The current product uses:

- Rust `fe-monster-upmix` 2.0.0, edition 2024;
- OxiMedia AudioPost 0.2.0;
- XAudio2/X3DAudio on Windows;
- pinned Google Open Binaural Renderer revision `478dc7c752d5eccae534635139ff0253eee3a14a`;
- Google OBR object inputs encoded to third-order Ambisonics and decoded with asymmetric left/right HRTF/BRIR filters.

Primary references:

- Google OBR supports channel-based and object-based content, encodes those inputs to an Ambisonic bed, and provides Direct, Ambient, and Reverberant binaural filter profiles: <https://github.com/google/obr>
- Google OBR's own 5.1 and 7.1 layouts place main-layer speakers on a 1 m sphere at the canonical angles used below: <https://github.com/google/obr/blob/478dc7c752d5eccae534635139ff0253eee3a14a/obr/renderer/loudspeaker_layouts.h>
- ITU-R BS.2051 defines the relevant middle-layer azimuth sectors and assumes loudspeakers on a sphere or time-aligned at the listener: <https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.2051-0-201402-S!!PDF-E.pdf>
- Microsoft documents X3DAudio's distance, direct-path LPF, reverb and matrix outputs, and requires applications to apply those outputs explicitly to their graph: <https://learn.microsoft.com/en-us/windows/win32/api/x3daudio/ns-x3daudio-x3daudio_emitter> and <https://learn.microsoft.com/en-us/windows/win32/xaudio2/how-to--integrate-x3daudio-with-xaudio2>
- JUCE's reference implementations describe Chorus as a modulated delay, Phaser as six modulated first-order all-pass stages, and recommend smoothing delay changes made in real time: <https://docs.juce.com/master/namespacejuce_1_1dsp.html>, <https://docs.juce.com/master/classjuce_1_1dsp_1_1Phaser.html>, and <https://docs.juce.com/master/classdsp_1_1DelayLine.html>

These references guide behavior and test expectations. The implementation remains project-owned Rust DSP and does not add JUCE or another runtime dependency.

## 3. Chosen Architecture

Extend the existing Rust Mixer as a versioned, built-in DSP rack. Do not host VST plugins and do not place independent audio engines beside the current graph.

Reasons:

- the existing Mixer already owns immutable staged parameter snapshots, sample ramps, reset semantics, and preallocated temporal state;
- one DSP owner avoids extra copies and clock domains;
- the application can ship and test every effect on other computers without plugin discovery, licensing, or binary compatibility failures;
- all effects remain available when upmix and OBR are independently disabled.

Rejected alternatives:

1. External VST3 hosting: broad ecosystem, but introduces plugin scanning, third-party crashes, licensing, UI embedding, and installer complexity.
2. Presets-only expansion: low risk, but does not satisfy the request for new DSP modules.
3. A second native effects DLL: isolates code but duplicates the Mixer's snapshot, buffer, reset, telemetry, and failure handling contracts.

## 4. Signal Flow

The logical signal flow becomes:

```text
decoded PCM
  -> optional upmix/channel router
  -> Rust Mixer input gain, balance, EQ, width and channel gains
  -> linked compressor
  -> modulation rack: Chorus -> Flanger -> Phaser
  -> Stereo/Ping-Pong Delay
  -> Early Reflections
  -> existing FDN Reverb
  -> output gain and linked limiter
  -> OBR input headroom management
  -> OBR binaural rendering
  -> final linked safety limiter
  -> XAudio2
```

The new modules live inside the invariant Mixer position. Therefore they still work when upmix or OBR is off. OBR remains the only binaural renderer; no effect may apply a second HRTF.

Compression remains before time-domain tails so delay/reverb tails do not repeatedly drive the compressor. The limiter remains last inside the Mixer. The existing pre-OBR adaptive headroom remains responsible for coherent multi-object summation.

## 5. New DSP Modules

Every module has an `enabled` flag and a dry/wet control. A disabled module must not read or write its delay/filter state into the signal path. Enable/disable transitions and all continuous parameters use the existing revision ramp or a module-local bounded smoothing ramp.

### 5.1 Chorus

Algorithm: fractional modulated delay with a sinusoidal LFO and linear interpolation. Symmetric channel pairs receive opposing LFO phase so the effect widens without moving every virtual speaker in the same direction.

Controls:

- rate: 0.05–5 Hz;
- depth: 0–1;
- centre delay: 4–30 ms;
- feedback: -0.95–0.95;
- mix: 0–1.

### 5.2 Flanger

Algorithm: short fractional modulated delay with feedback. It uses a separate state block from Chorus so either effect can be bypassed or reset independently.

Controls:

- rate: 0.02–5 Hz;
- depth: 0–1;
- centre delay: 0.2–10 ms;
- feedback: -0.95–0.95;
- mix: 0–1.

### 5.3 Phaser

Algorithm: six first-order all-pass stages per processed channel with an LFO-modulated centre frequency. This matches the established six-stage topology described by the JUCE DSP reference without importing JUCE code.

Controls:

- rate: 0.02–10 Hz;
- depth: 0–1;
- centre frequency: 100–4,000 Hz;
- feedback: -0.95–0.95;
- mix: 0–1.

### 5.4 Stereo/Ping-Pong Delay

Algorithm: fractional delay with smoothed delay-time changes, feedback damping, and controllable cross-channel feedback.

Controls:

- delay: 1–1,000 ms;
- feedback: 0–0.90;
- ping-pong amount: 0–1;
- damping cutoff: 500–20,000 Hz;
- mix: 0–1.

Pair routing:

- stereo: L/R;
- 5.1: FL/FR and SL/SR;
- 7.1: FL/FR, BL/BR, and SL/SR;
- centre feeds itself;
- LFE remains dry by default.

### 5.5 Early Reflections

Algorithm: a bounded multi-tap reflection network using non-coincident 7–35 ms taps. Reflected energy is distributed only between symmetric/adjacent non-LFE virtual channels through an energy-normalized matrix. This supplies externalization and room-size cues before the late FDN reverb without replacing OBR's HRTF.

Controls:

- room size: 0–1;
- diffusion: 0–1;
- damping: 0–1;
- mix: 0–0.5.

The default mix is zero. Spatial presets use subtle values because excessive reflected energy reduces directional precision.

## 6. Multichannel Rules

- New modulation and time effects preserve channel count and canonical channel order.
- LFE bypasses Chorus, Flanger, Phaser, Delay feedback, and Early Reflections to prevent low-frequency smearing and feedback accumulation.
- Centre is never cross-fed into left/right by modulation effects. Ping-pong Delay treats centre as a mono self-feedback path.
- Dry/wet mixing is bounded so a fully correlated wet signal cannot create an uncontrolled +6 dB sum. Any effect feedback coefficient remains strictly below unity.
- Non-finite input is sanitized once at the Mixer boundary. Effects do not hard-clamp normal floating-point headroom.
- Reset clears every LFO phase, delay line, filter state, feedback sample, reflection line, compressor envelope, limiter gain, and reverb tail.

## 7. Canonical 5.1 and 7.1 Geometry

Use the Google OBR/ITU-aligned virtual loudspeaker geometry below. Main speakers are one metre from the listener and lie on the horizontal plane. LFE remains at the renderer's conventional -30° elevation but also uses 1 m distance.

| Layout | Channel order | Azimuth | Elevation | Distance |
| --- | --- | ---: | ---: | ---: |
| 5.1 | FL, FR, FC, LFE, SL, SR | +30, -30, 0, 0, +110, -110 | 0, 0, 0, -30, 0, 0 | 1 m |
| 7.1 | FL, FR, FC, LFE, BL, BR, SL, SR | +30, -30, 0, 0, +135, -135, +90, -90 | 0, 0, 0, -30, 0, 0, 0, 0 | 1 m |

Consequences:

- remove the current artificial 0.82–1.55 m depth tiers that attenuate rear/side channels inside OBR;
- remove non-standard +/-5° and -7° elevations from horizontal bed channels;
- do not run the virtual speaker bed through the approximate X3DAudio distance one-pole before OBR; X3DAudio point-source mode retains its documented filter path;
- use OBR Direct as the default clarity profile; Ambient and Reverberant remain deliberate user/preset choices.

`obrSpatialWidth = 1.0` maps exactly to the standard angles. Width values above 1 use a bounded sector expansion instead of raw angle multiplication:

- front channels move from 30° toward at most 60°;
- side channels move from 90° toward at most 120°;
- rear channels move from 135° toward at most 150°.

This prevents the current 135° x 1.3 = 175.5° collapse, where left-back and right-back approach the same directly-behind binaural cue. Width below 1 continues to move channels toward the front centre.

## 8. Surround Presence Retuning

Do not increase presence through unbounded rear-channel gain. Presence comes from correcting geometry, retaining high-frequency HRTF cues, preserving channel separation, and then applying conservative level tuning.

The `3D surround` preset will be retuned under measured headroom rather than retaining the fixed -6 dB input cut. Target behavior:

- front/rear single-channel rendered RMS spread no greater than 2 dB for identical broadband inputs;
- all non-LFE virtual speakers remain audibly distinct;
- standard width 1.0 is the default; expanded presets stay within the bounded sectors above;
- OBR-on versus dry broadband loudness remains within +/-1.5 dB after route calibration;
- ordinary mastered material produces no final limiter reduction attributable to the preset;
- 5.1 and 7.1 coherent full-scale safety tests retain zero hard clips.

## 9. ABI, Persistence, and UI

### Rust/native ABI

- bump `FE_RUST_MIXER_ABI_VERSION` from 1 to 2;
- append new fields to `FeRustMixerParams`; do not reorder existing fields;
- update Rust and C layout probes with explicit `sizeof` and `offsetof` assertions;
- update the Windows bridge's validation, staging and raw Java/native parameter conversion atomically;
- keep the old bundled v1 DLL from being loaded by a v2 host through the existing ABI check and fail-open dry path.

### Persistence migration

- add new parameter keys with clean disabled defaults;
- accept persisted v1 mixer documents, retain every existing recognized value, and fill only missing v2 keys;
- preserve a user's selected preset when its identifier still exists;
- if built-in preset parameters changed, preserve the user's saved parameter snapshot as Custom rather than overwriting it;
- write the migrated document atomically only after validation succeeds;
- never persist DSP delay buffers or temporal state.

### UI

Add one collapsible module card per effect. Each card contains:

- an independent enable switch;
- plain-language Chinese labels;
- a slider plus direct numeric input for every continuous parameter;
- a concise hover description;
- a reset-to-module-default action;
- an indication that LFE is protected/bypassed where applicable.

Add effect-oriented presets only after the real modules exist. Initial additions:

- 宽阔合唱;
- 经典镶边;
- 流动移相;
- 乒乓回声;
- 近场工作室;
- 沉浸现场.

Preset IDs become part of the stable API and tests. The preset grid remains server-authoritative and the client rejects incomplete or duplicate payloads.

## 10. Real-Time and Failure Contracts

- allocate all delay lines, reflection taps, per-channel all-pass states, and scratch at Mixer creation;
- no resize, heap allocation, mutex, filesystem call, logging, or exception across the audio callback;
- compute coefficients and bounds on the control path in `DerivedParameters`;
- publish complete immutable snapshots and adopt them only at an audio block boundary;
- smooth delay reads; never jump a fractional read head after a parameter update;
- on invalid parameters, reject the whole staged revision and keep the active snapshot unchanged;
- on native effect failure or non-finite internal state, clear the affected module state and bypass that module for the block while the outer Mixer/pipeline fail-open contract keeps playback alive;
- seek/timeline reset clears temporal states without rebuilding or reallocating the graph.

## 11. Test-First Acceptance Plan

Tests are added before production implementation and must fail against the current code for the intended reason.

### Rust unit/contract tests

- ABI v2 size and offsets match the C header;
- all new parameter bounds accept endpoints and reject NaN, infinity, and out-of-range values;
- every disabled module is sample-transparent;
- each enabled module produces a deterministic response distinct from dry input and from the other modules;
- feedback paths remain finite and decay for maximum supported settings;
- modulation has no discontinuity above the click threshold during rapid staged changes;
- reset removes all previous tails and feedback;
- 2/6/8-channel processing preserves channel count/order and protected LFE dry content;
- process performs no allocation or lock acquisition.

### Native integration tests

- v2 Mixer loads, stages, commits, ramps, resets, and fails open correctly;
- all four upmix/OBR states continue to include the Mixer exactly once;
- rapid seek and parameter automation create no drop, underrun, pool exhaustion, or non-finite sample;
- final peak, THD, wet/dry phase alignment, and loudness gates remain green.

### Spatial quality tests

- width 1.0 matches official OBR positions exactly;
- 5.1 and 7.1 main speakers use 1 m distance and standard elevation;
- width 2.0 never puts a side/rear object beyond its bounded sector or collapses left/right rear cues;
- identical broadband inputs rendered from front, side, and rear stay within the 2 dB presence target;
- front/rear signatures remain sufficiently decorrelated to prove distinct direction;
- high-frequency spatial content is not attenuated by the removed approximate OBR-bed LPF;
- coherent 5.1/7.1 full-scale inputs retain zero hard clips and low THD.

### Persistence and browser tests

- migrate a real v1 document without losing existing values;
- save and restore every new effect parameter;
- preset payloads contain the new stable IDs and complete parameter snapshots;
- module switches, numeric inputs, reset buttons, accessibility labels, and conflict retries work;
- opening the mixer while music plays does not block the audio thread.

## 12. Delivery Sequence

1. Add failing canonical-layout and surround-presence quality tests.
2. Correct spatial geometry, bounded width mapping, and OBR-bed filtering.
3. Add ABI v2 failing layout/validation tests.
4. Implement new Rust DSP state and algorithms behind disabled defaults.
5. Add native bridge mapping and production probes.
6. Add migration, API keys, presets, and UI cards.
7. Run focused Rust/native/browser tests, then the full audio regression and production build.
8. Re-run real-time stress against the final production DLL and report any unrelated remaining repository failures separately.

## 13. Out of Scope

- mobile implementation;
- VST/AU plugin hosting;
- licensed Dolby/DTS proprietary decoders;
- head tracking without a real orientation input source;
- convolution IR download/marketplace;
- changing the user's physical Windows speaker configuration.
