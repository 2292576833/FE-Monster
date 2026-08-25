# Spatial Audio DSP Rack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five real, independently switchable DSP effects and canonical 5.1/7.1 virtual-speaker rendering while preserving old settings, transparent bypass, real-time safety, seek stability, and production audio quality.

**Architecture:** Keep one audio owner: the existing Rust Mixer gains a preallocated built-in effects rack between its compressor and FDN reverb, while the Windows pipeline remains the sole X3DAudio/OBR renderer. Upgrade the append-only Mixer ABI to v2, preserve the first 44 Java/native values, append effect values at indices 44–67, migrate v1 documents additively, and expose the complete server-authoritative state through the existing mixer UI.

**Tech Stack:** Rust 2024 (`fe-monster-upmix`, OxiMedia AudioPost 0.2.0), C ABI, C++20, XAudio2/X3DAudio, pinned Google OBR `478dc7c752d5eccae534635139ff0253eee3a14a`, Java 17, vanilla JavaScript/CSS, Node.js contract probes, Microsoft Edge browser probe.

**Spec:** `docs/superpowers/specs/2026-08-25-spatial-audio-dsp-rack-design.md`

## Global Constraints

- Support 2.0, 5.1, and 7.1 at 16–192 kHz; canonical channel order is `FL, FR, FC, LFE, SL, SR` for 5.1 and `FL, FR, FC, LFE, BL, BR, SL, SR` for 7.1.
- Main virtual speakers use distance `1.0 m` and elevation `0°`; LFE uses distance `1.0 m`, azimuth `0°`, and elevation `-30°`.
- `obrSpatialWidth = 1.0` must reproduce the official angles exactly; width expansion caps front at `60°`, side at `120°`, and rear at `150°`.
- OBR Direct remains the default; Ambient and Reverberant are opt-in. OBR is the only binaural renderer.
- Do not add JUCE, VST/AU hosting, another effects DLL, Dolby/DTS proprietary code, head tracking without real orientation input, or physical Windows speaker reconfiguration.
- The audio callback performs no allocation, resize, mutex acquisition, file access, logging, or exception propagation.
- All delay/filter memory is allocated at Mixer creation. Continuous parameters and bypass transitions are smoothed; reset clears every temporal state without rebuilding the graph.
- Preserve floating-point headroom internally. Never add a hard sample clamp inside the router or Mixer; the linked Mixer limiter, adaptive pre-OBR headroom, and final native linked limiter own output safety.
- LFE bypasses Chorus, Flanger, Phaser, Delay feedback, and Early Reflections. Centre remains a mono self path and is never cross-fed into left/right modulation pairs.
- Every new module defaults disabled with mix `0.0`; with all new modules disabled, the v2 Mixer must remain sample-transparent relative to the current v1 clean path.
- Keep `STATE_VERSION = 1` and `PRESET_VERSION = 1`; migration is an additive parameter-shape migration, not a document/protocol reset.
- Preserve the existing first 44 Java/native float indices and existing flag bits. New effect flags use `0x40`, `0x80`, `0x100`, `0x200`, and `0x400`.
- Keep the current adaptive OBR headroom and final limiter fixes already present in the dirty worktree; do not overwrite unrelated user changes.
- On this machine set `TEMP` and `TMP` to `E:\FE_audio_tmp` for every shell/test invocation because `C:` has no free space.

## File Responsibility Map

- Create `native/rust-audio-upmix/src/mixer_effects.rs`: fractional delay storage, modulation oscillators, six-stage phaser, ping-pong delay, early-reflection network, rack bypass smoothing, reset, and private DSP tests.
- Modify `native/rust-audio-upmix/src/lib.rs`: ABI v2 Rust layout, validation/defaults/presets, prepared effect coefficients, Mixer rack ownership, signal-chain insertion, and FFI behavior tests.
- Modify `native/rust-audio-upmix/include/fe_rust_mixer.h`: append-only public ABI v2 fields and stable preset IDs.
- Modify `native/rust-audio-upmix/tests/mixer.rs` and `native/rust-audio-upmix/tests/mixer_header_probe.c`: public ABI, bounds, bypass, multichannel, reset, ramp, and C/Rust layout contracts.
- Modify `native/windows/audio/fe_audio_spatial_layout.h`: canonical speaker poses, bounded role-aware width mapping, and shared spatial-quality constants.
- Modify `native/windows/audio/fe_audio_pipeline.cpp`: use bounded geometry, remove the extra OBR-bed distance low-pass, validate ABI v2, and keep point-source X3DAudio filtering intact.
- Modify `native/windows/fe_monster_xaudio2.cpp`: JNI flag/value mapping from 44 to 68 values without changing indices 0–43.
- Modify `scripts/fixtures/native-audio-quality/fe_audio_quality_probe.cpp`: canonical geometry, presence, high-frequency preservation, loudness, clipping, and DSP-quality acceptance gates.
- Modify `src/main/java/com/femonster/core/AudioMixerService.java`: v2 keys/defaults/bounds, additive migration, exact presets, flags, and 68-value serialization.
- Modify `src/main/java/com/femonster/core/NativeAudioEngine.java`: 68-value validation/cache while retaining existing status-vector contracts.
- Modify `src/test/java/com/femonster/core/AudioMixerServiceProbe.java` and `scripts/check-audio-mixer-service.mjs`: migration, persistence, preset parity, and native-vector contracts.
- Modify `web/audio-mixer-ui.js` and `web/styles.css`: five understandable collapsible effect cards, numeric inputs, help, reset actions, and six new preset buttons.
- Modify `scripts/check-audio-mixer-ui-module.mjs`, `scripts/check-audio-mixer-ui-browser.mjs`, and `scripts/check-audio-mixer-visuals-module.mjs`: complete payload validation and browser interaction coverage.

Implementation source anchors:

- Google OBR loudspeaker geometry: <https://github.com/google/obr/blob/478dc7c752d5eccae534635139ff0253eee3a14a/obr/renderer/loudspeaker_layouts.h>
- ITU-R BS.2051 middle-layer sectors and unit-sphere/time-alignment model: <https://www.itu.int/dms_pubrec/itu-r/rec/bs/R-REC-BS.2051-0-201402-S!!PDF-E.pdf>
- Microsoft X3DAudio emitter/filter semantics: <https://learn.microsoft.com/en-us/windows/win32/api/x3daudio/ns-x3daudio-x3daudio_emitter>
- Microsoft X3DAudio/XAudio2 integration responsibilities: <https://learn.microsoft.com/en-us/windows/win32/xaudio2/how-to--integrate-x3daudio-with-xaudio2>
- JUCE reference topology for Chorus, six-stage Phaser, and smoothed DelayLine changes (reference only; no JUCE dependency): <https://docs.juce.com/master/namespacejuce_1_1dsp.html>

## Stable ABI v2 Mapping

The existing `FeRustMixerParams` bytes `0..179`, including `reserved[8]` at offset `148`, stay unchanged. Append these fields:

| Offset | C/Rust field | Java key | JNI float/flag |
| ---: | --- | --- | --- |
| 180 | `chorus_enabled` | `chorusEnabled` | flag `0x40` |
| 184–200 | `chorus_rate_hz`, `chorus_depth`, `chorus_center_delay_ms`, `chorus_feedback`, `chorus_mix` | matching camelCase keys | floats `44..48` |
| 204 | `flanger_enabled` | `flangerEnabled` | flag `0x80` |
| 208–224 | `flanger_rate_hz`, `flanger_depth`, `flanger_center_delay_ms`, `flanger_feedback`, `flanger_mix` | matching camelCase keys | floats `49..53` |
| 228 | `phaser_enabled` | `phaserEnabled` | flag `0x100` |
| 232–248 | `phaser_rate_hz`, `phaser_depth`, `phaser_center_frequency_hz`, `phaser_feedback`, `phaser_mix` | matching camelCase keys | floats `54..58` |
| 252 | `delay_enabled` | `delayEnabled` | flag `0x200` |
| 256–272 | `delay_ms`, `delay_feedback`, `delay_ping_pong`, `delay_damping_hz`, `delay_mix` | matching camelCase keys | floats `59..63` |
| 276 | `early_reflections_enabled` | `earlyReflectionsEnabled` | flag `0x400` |
| 280–292 | `early_reflections_room_size`, `early_reflections_diffusion`, `early_reflections_damping`, `early_reflections_mix` | matching camelCase keys | floats `64..67` |

`sizeof(FeRustMixerParams)` is therefore exactly `296` bytes and `FE_RUST_MIXER_ABI_VERSION` is exactly `2`.

---

### Task 1: Canonical Virtual-Speaker Geometry and OBR-Bed Clarity

**Files:**
- Modify: `scripts/fixtures/native-audio-quality/fe_audio_quality_probe.cpp:344-370, 982-1035`
- Modify: `scripts/check-native-spatial-audio-pipeline.mjs`
- Modify: `native/windows/audio/fe_audio_spatial_layout.h:10-125`
- Modify: `native/windows/audio/fe_audio_pipeline.cpp:2227-2320, 2950-2972`

**Interfaces:**
- Consumes: current `DefaultSpatialBedObjectPose(uint32_t, uint32_t)` and `SpatialObrBlockInputHeadroom(const float*, uint32_t, uint32_t) -> float`.
- Produces: `SpatialBedObjectPose DefaultSpatialBedObjectPose(uint32_t channels, uint32_t channel) noexcept` and `float SpatialBedAzimuthForWidth(uint32_t channels, uint32_t channel, float base_azimuth, float width) noexcept`.

- [ ] **Step 1: Replace the obsolete depth-tier gate with failing canonical-layout and width gates**

In the quality probe, remove expectations for four distance tiers and a `>= 1.7` distance ratio. Add exact checks for both layouts and role-aware width bounds:

```cpp
void Require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

void RequirePose(
    uint32_t channels,
    uint32_t channel,
    float azimuth,
    float elevation
) {
    const auto pose = fe::audio::DefaultSpatialBedObjectPose(channels, channel);
    Require(std::abs(pose.azimuth - azimuth) <= 1.0e-6f, "canonical azimuth");
    Require(std::abs(pose.elevation - elevation) <= 1.0e-6f, "canonical elevation");
    Require(std::abs(pose.distance - 1.0f) <= 1.0e-6f, "canonical distance");
}

void VerifyCanonicalSpatialBed() {
    constexpr float k51Azimuth[6] = {30, -30, 0, 0, 110, -110};
    constexpr float k51Elevation[6] = {0, 0, 0, -30, 0, 0};
    constexpr float k71Azimuth[8] = {30, -30, 0, 0, 135, -135, 90, -90};
    constexpr float k71Elevation[8] = {0, 0, 0, -30, 0, 0, 0, 0};
    for (uint32_t channel = 0; channel < 6; ++channel) {
        RequirePose(6, channel, k51Azimuth[channel], k51Elevation[channel]);
        Require(std::abs(fe::audio::SpatialBedAzimuthForWidth(
            6, channel, k51Azimuth[channel], 1.0f) - k51Azimuth[channel]) <= 1.0e-6f,
            "5.1 width 1 exact");
    }
    for (uint32_t channel = 0; channel < 8; ++channel) {
        RequirePose(8, channel, k71Azimuth[channel], k71Elevation[channel]);
        Require(std::abs(fe::audio::SpatialBedAzimuthForWidth(
            8, channel, k71Azimuth[channel], 1.0f) - k71Azimuth[channel]) <= 1.0e-6f,
            "7.1 width 1 exact");
    }
    Require(std::abs(fe::audio::SpatialBedAzimuthForWidth(8, 0, 30, 2) - 60) < 1e-6f,
        "front expansion cap");
    Require(std::abs(fe::audio::SpatialBedAzimuthForWidth(8, 6, 90, 2) - 120) < 1e-6f,
        "side expansion cap");
    Require(std::abs(fe::audio::SpatialBedAzimuthForWidth(8, 4, 135, 2) - 150) < 1e-6f,
        "rear expansion cap");
    Require(std::abs(fe::audio::SpatialBedAzimuthForWidth(6, 4, 110, 2) - 120) < 1e-6f,
        "5.1 surround uses side sector");
}
```

Add `#include <stdexcept>` with the other standard headers. The quality script already treats a nonzero probe exit as failure; successful runs still reach the existing JSON output.

Call `VerifyCanonicalSpatialBed()` at the beginning of the quality probe's `main`. In `check-native-spatial-audio-pipeline.mjs`, isolate the OBR object-fill block and assert:

```js
const obrFillStart = pipeline.indexOf('auto output_channel = (*obr_input_)[channel]');
const obrFillEnd = pipeline.indexOf('if (positions_changed) obr_position_revision_', obrFillStart);
assert.ok(obrFillStart >= 0 && obrFillEnd > obrFillStart, 'OBR object-fill block missing');
const obrFill = pipeline.slice(obrFillStart, obrFillEnd);
assert.match(obrFill, /sample\s*\*\s*obr_headroom/);
assert.doesNotMatch(obrFill, /X3dDirectLpfOnePoleAlpha|distance_filter_state/);
```

Keep the separate X3D speaker-mode filter assertion.

- [ ] **Step 2: Run the focused quality probe and verify the new gate fails**

Run:

```powershell
$env:TEMP='E:\FE_audio_tmp'; $env:TMP='E:\FE_audio_tmp'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-native-audio-quality.ps1 -ObrSourceDir 'E:\FE moster\.tmp\google-obr-native-478dc7c752d5'
```

Expected: FAIL because centre/rear/side elevations and distances are non-canonical, `SpatialBedAzimuthForWidth` is absent, and the OBR object feed still applies the approximate one-pole filter.

- [ ] **Step 3: Implement canonical poses and bounded role-aware width**

Replace the pose tables and add this helper to `fe_audio_spatial_layout.h`:

```cpp
inline float SpatialBedAzimuthForWidth(
    uint32_t channels,
    uint32_t channel,
    float base_azimuth,
    float width
) noexcept {
    const float safe_width = std::clamp(width, 0.0f, 2.0f);
    if (!std::isfinite(base_azimuth)) return 0.0f;
    if (safe_width <= 1.0f) return base_azimuth * safe_width;
    float sector_limit = 0.0f;
    if (channel <= 1) sector_limit = 60.0f;
    else if (channels == 8 && channel >= 4 && channel <= 5) sector_limit = 150.0f;
    else if ((channels == 6 && channel >= 4) || (channels == 8 && channel >= 6)) {
        sector_limit = 120.0f;
    }
    if (sector_limit == 0.0f || std::abs(base_azimuth) <= 1.0e-6f) return 0.0f;
    const float signed_limit = std::copysign(sector_limit, base_azimuth);
    return base_azimuth + (signed_limit - base_azimuth) * (safe_width - 1.0f);
}
```

Use exact 5.1 and 7.1 tables from the spec, with every distance `1.0f` and only LFE at `-30.0f` elevation.

- [ ] **Step 4: Apply bounded width and remove only the OBR-bed low-pass**

In `CalculateSpatialSample`, replace raw multiplication with:

```cpp
const float target_azimuth = std::remainder(
    fe::audio::SpatialBedAzimuthForWidth(
        layout_channels,
        channel,
        layout_azimuth,
        spatial_controls_.obr_spatial_width
    ),
    360.0f
);
```

In the OBR object-input loop, replace the one-pole state update with:

```cpp
output_channel[frame] = std::isfinite(sample) ? sample * obr_headroom : 0.0f;
```

Remove the now-unused `obr_distance_lpf_state_` member and its two `.fill(0.0f)` reset calls. Do not remove the XAudio2/X3DAudio point-source filter at the separate speaker-output path.

In the quality probe, delete `distance_tiers`, `near_object_rms`, `far_object_rms`, and `far_to_near_rms`. Replace the old geometry gate with:

```cpp
const bool spatial_geometry_ok = angular_span >= 180.0
    && maximum_target_azimuth_error <= 1.0e-6
    && std::abs(minimum_distance - 1.0f) <= 1.0e-6f
    && std::abs(maximum_distance - 1.0f) <= 1.0e-6f;
```

Update the JSON geometry object to report `canonicalDistanceMeters: 1.0` and remove `distanceTierCount`/`farToNearRms`.

- [ ] **Step 5: Run the quality probe and native spatial contract probes**

Run:

```powershell
$env:TEMP='E:\FE_audio_tmp'; $env:TMP='E:\FE_audio_tmp'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-native-audio-quality.ps1 -ObrSourceDir 'E:\FE moster\.tmp\google-obr-native-478dc7c752d5'
node scripts/check-native-spatial-audio-pipeline.mjs
node scripts/check-audio-spatial-controls-contract.mjs
```

Expected: all PASS; width `1.0` equals official OBR positions and the OBR bed retains high-frequency content.

- [ ] **Step 6: Commit the geometry correction**

```powershell
git add native/windows/audio/fe_audio_spatial_layout.h native/windows/audio/fe_audio_pipeline.cpp scripts/fixtures/native-audio-quality/fe_audio_quality_probe.cpp scripts/check-native-spatial-audio-pipeline.mjs
git commit -m "fix: standardize virtual surround geometry"
```

### Task 2: Mixer ABI v2 and Parameter Validation Contract

**Files:**
- Modify: `native/rust-audio-upmix/include/fe_rust_mixer.h:1-85`
- Modify: `native/rust-audio-upmix/src/lib.rs:1-570`
- Modify: `native/rust-audio-upmix/tests/mixer.rs:1-260`
- Modify: `native/rust-audio-upmix/tests/mixer_header_probe.c`

**Interfaces:**
- Consumes: the existing append-only `FeRustMixerParams` bytes `0..179`.
- Produces: ABI `2`, 296-byte `FeRustMixerParams`, and effect fields/validation/disabled defaults. New preset IDs remain absent until the real rack is integrated in Task 8.

- [ ] **Step 1: Write failing Rust and C layout tests**

Rename the public Rust test to `mixer_v2_layout_and_legacy_upmix_v1_are_stable` and assert:

```rust
assert_eq!(fe_rust_mixer_abi_version(), 2);
assert_eq!(size_of::<FeRustMixerParams>(), 296);
assert_eq!(std::mem::offset_of!(FeRustMixerParams, reserved), 148);
assert_eq!(std::mem::offset_of!(FeRustMixerParams, chorus_enabled), 180);
assert_eq!(std::mem::offset_of!(FeRustMixerParams, flanger_enabled), 204);
assert_eq!(std::mem::offset_of!(FeRustMixerParams, phaser_enabled), 228);
assert_eq!(std::mem::offset_of!(FeRustMixerParams, delay_enabled), 252);
assert_eq!(std::mem::offset_of!(FeRustMixerParams, early_reflections_enabled), 276);
assert_eq!(std::mem::offset_of!(FeRustMixerParams, early_reflections_mix), 292);
```

Add equivalent C assertions:

```c
_Static_assert(FE_RUST_MIXER_ABI_VERSION == 2u, "Mixer ABI v2");
_Static_assert(sizeof(FeRustMixerParams) == 296u, "Mixer params size");
_Static_assert(offsetof(FeRustMixerParams, reserved) == 148u, "v1 prefix moved");
_Static_assert(offsetof(FeRustMixerParams, chorus_enabled) == 180u, "chorus offset");
_Static_assert(offsetof(FeRustMixerParams, flanger_enabled) == 204u, "flanger offset");
_Static_assert(offsetof(FeRustMixerParams, phaser_enabled) == 228u, "phaser offset");
_Static_assert(offsetof(FeRustMixerParams, delay_enabled) == 252u, "delay offset");
_Static_assert(offsetof(FeRustMixerParams, early_reflections_enabled) == 276u,
    "early reflections offset");
_Static_assert(offsetof(FeRustMixerParams, early_reflections_mix) == 292u,
    "early reflections mix offset");
```

- [ ] **Step 2: Run the Rust test and verify it fails on ABI v1**

Run:

```powershell
$env:TEMP='E:\FE_audio_tmp'; $env:TMP='E:\FE_audio_tmp'
$env:CARGO_HOME='E:\FE moster\.tools\cargo'; $env:RUSTUP_HOME='E:\FE moster\.tools\rustup'
$env:CARGO_TARGET_DIR='E:\FE moster\native\rust-audio-upmix\target'
& 'E:\FE moster\.tools\cargo\bin\cargo.exe' test --manifest-path native/rust-audio-upmix/Cargo.toml --release --locked --offline mixer_v2_layout_and_legacy_upmix_v1_are_stable
```

Expected: FAIL because the ABI is `1`, the struct is `180` bytes, and effect fields do not exist.

- [ ] **Step 3: Append the v2 fields without moving the v1 prefix**

Set `FE_RUST_MIXER_ABI_VERSION` to `2` in C and Rust. Append the exact fields shown in the stable mapping table after `reserved[8]` in both languages. Keep preset IDs `0..7` unchanged in this task and preserve the existing `mixer_preset_params(8).is_none()` assertion.

Extend the public C range comment with every exact bound listed in Step 4 so hosts do not need to infer the v2 contract from Rust source.

Initialize every effect flag to `0` and every mix to `0.0`. Use these clean control values for the remaining disabled parameters:

```rust
chorus_rate_hz: 0.30,
chorus_depth: 0.35,
chorus_center_delay_ms: 18.0,
chorus_feedback: 0.0,
flanger_rate_hz: 0.18,
flanger_depth: 0.50,
flanger_center_delay_ms: 1.5,
flanger_feedback: 0.35,
phaser_rate_hz: 0.20,
phaser_depth: 0.50,
phaser_center_frequency_hz: 900.0,
phaser_feedback: 0.20,
delay_ms: 320.0,
delay_feedback: 0.30,
delay_ping_pong: 0.75,
delay_damping_hz: 8_000.0,
early_reflections_room_size: 0.35,
early_reflections_diffusion: 0.55,
early_reflections_damping: 0.45,
```

- [ ] **Step 4: Add endpoint and rejection coverage for every new parameter**

Extend `validate_mixer_params` and the existing `bad!` test with these exact bounds:

```text
chorus: rate 0.05..5, depth 0..1, centre delay 4..30 ms, feedback -0.95..0.95, mix 0..1
flanger: rate 0.02..5, depth 0..1, centre delay 0.2..10 ms, feedback -0.95..0.95, mix 0..1
phaser: rate 0.02..10, depth 0..1, centre frequency 100..4000 Hz, feedback -0.95..0.95, mix 0..1
delay: time 1..1000 ms, feedback 0..0.90, ping-pong 0..1, damping 500..20000 Hz, mix 0..1
early reflections: room/diffusion/damping 0..1, mix 0..0.5
```

For each bound, test both endpoints and one neighbor outside the range; separately reject `NaN`, `+infinity`, and `-infinity`. Test all five enable flags reject `2`.

- [ ] **Step 5: Run the full Rust suite and C header probe**

Run:

```powershell
$env:TEMP='E:\FE_audio_tmp'; $env:TMP='E:\FE_audio_tmp'
$env:CARGO_HOME='E:\FE moster\.tools\cargo'; $env:RUSTUP_HOME='E:\FE moster\.tools\rustup'
$env:CARGO_TARGET_DIR='E:\FE moster\native\rust-audio-upmix\target'
& 'E:\FE moster\.tools\cargo\bin\cargo.exe' test --manifest-path native/rust-audio-upmix/Cargo.toml --release --locked --offline
```

Expected: all Rust and C layout tests PASS; legacy upmix ABI remains `1`.

- [ ] **Step 6: Commit the ABI contract**

```powershell
git add native/rust-audio-upmix/include/fe_rust_mixer.h native/rust-audio-upmix/src/lib.rs native/rust-audio-upmix/tests/mixer.rs native/rust-audio-upmix/tests/mixer_header_probe.c
git commit -m "feat: define mixer dsp rack abi v2"
```

### Task 3: Fractional Delay Core, Chorus, and Flanger

**Files:**
- Create: `native/rust-audio-upmix/src/mixer_effects.rs`
- Modify: `native/rust-audio-upmix/src/lib.rs:1-20`

**Interfaces:**
- Produces: `EffectFrameParameters`, `EffectsDerivedParameters::prepare(EffectControlParameters, f32)`, `EffectsDerivedParameters::approach(&mut self, Self, f32)`, `EffectsDerivedParameters::frame_parameters(&self)`, `EffectsRack::new(f32)`, `EffectsRack::begin_block()`, `EffectsRack::reset()`, and `EffectsRack::process_frame(&mut self, &mut [f32], EffectFrameParameters) -> bool`.
- Task 3's rack owns independent Chorus and Flanger `FractionalDelayBank` instances. Task 4 appends Delay's bank and Task 5 appends Early Reflections' bank; no module ever shares delay storage.

Define the cross-task types exactly once in `mixer_effects.rs`:

```rust
#[derive(Clone, Copy, Default)]
pub(crate) struct ModulationControl {
    pub enabled: bool, pub rate_hz: f32, pub depth: f32,
    pub center_delay_ms: f32, pub feedback: f32, pub mix: f32,
}
#[derive(Clone, Copy, Default)]
pub(crate) struct PhaserControl {
    pub enabled: bool, pub rate_hz: f32, pub depth: f32,
    pub center_frequency_hz: f32, pub feedback: f32, pub mix: f32,
}
#[derive(Clone, Copy, Default)]
pub(crate) struct DelayControl {
    pub enabled: bool, pub delay_ms: f32, pub feedback: f32,
    pub ping_pong: f32, pub damping_hz: f32, pub mix: f32,
}
#[derive(Clone, Copy, Default)]
pub(crate) struct EarlyReflectionsControl {
    pub enabled: bool, pub room_size: f32, pub diffusion: f32,
    pub damping: f32, pub mix: f32,
}
#[derive(Clone, Copy, Default)]
pub(crate) struct EffectControlParameters {
    pub chorus: ModulationControl,
    pub flanger: ModulationControl,
    pub phaser: PhaserControl,
    pub delay: DelayControl,
    pub early_reflections: EarlyReflectionsControl,
}
```

Define the prepared types with these exact names:

```rust
#[derive(Clone, Copy, Default)]
pub(crate) struct ModulationFrameParameters {
    pub enabled: bool, pub phase_increment: f32, pub depth: f32,
    pub center_delay_samples: f32, pub feedback: f32, pub mix: f32,
}
#[derive(Clone, Copy, Default)]
pub(crate) struct PhaserFrameParameters {
    pub enabled: bool, pub phase_increment: f32, pub depth: f32,
    pub center_log2_hz: f32, pub feedback: f32, pub mix: f32,
}
#[derive(Clone, Copy, Default)]
pub(crate) struct DelayFrameParameters {
    pub enabled: bool, pub target_delay_samples: f32, pub feedback: f32,
    pub ping_pong: f32, pub damping_alpha: f32, pub mix: f32,
}
#[derive(Clone, Copy, Default)]
pub(crate) struct EarlyReflectionsFrameParameters {
    pub enabled: bool, pub tap_samples: [f32; 7], pub tap_weights: [f32; 7],
    pub diffusion: f32, pub damping_alpha: f32, pub mix: f32,
}
#[derive(Clone, Copy, Default)]
pub(crate) struct EffectFrameParameters {
    pub chorus: ModulationFrameParameters,
    pub flanger: ModulationFrameParameters,
    pub phaser: PhaserFrameParameters,
    pub delay: DelayFrameParameters,
    pub early_reflections: EarlyReflectionsFrameParameters,
}
#[derive(Clone, Copy, Default)]
pub(crate) struct EffectsDerivedParameters {
    frame: EffectFrameParameters,
}
```

`EffectsDerivedParameters::prepare` computes modulation `TAU * rate_hz / sample_rate`, Phaser centre as `center_frequency_hz.min(sample_rate * 0.45).log2()`, millisecond delays as `ms * 0.001 * sample_rate`, Delay damping as `1 - exp(-TAU * damping_hz.min(sample_rate * 0.45) / sample_rate)`, and reflection samples from the seven Task 5 base delays times `(0.75 + 0.25 * room_size) * 0.001 * sample_rate`. It computes the normalized reflection weights once. `approach` linearly approaches every float/array member except `delay.target_delay_samples`, which copies the new target once and is smoothed by the Delay's dual-read transition; booleans also copy from the target. `frame_parameters` returns `self.frame` by value. No trigonometric, exponential, allocation, or resize work from this preparation is repeated in the audio callback.

The compilable Task 3 rack state is:

```rust
pub(crate) struct EffectsRack {
    chorus: Chorus,
    flanger: Flanger,
    sine_table: SineTable,
}
```

Its `process_frame` executes Chorus then Flanger and ignores the disabled future parameter groups. Task 4 appends `phaser`, `delay`, and `phaser_coefficients`; Task 5 appends `early_reflections`, producing the final five-module order before Task 6 connects it to production.

Use these channel-role helpers throughout all five modules:

```rust
fn is_lfe(channels: usize, channel: usize) -> bool {
    channels >= 6 && channel == 3
}

fn pair_for_channel(channels: usize, channel: usize) -> Option<(usize, usize)> {
    match (channels, channel) {
        (_, 0 | 1) => Some((0, 1)),
        (6, 4 | 5) => Some((4, 5)),
        (8, 4 | 5) => Some((4, 5)),
        (8, 6 | 7) => Some((6, 7)),
        _ => None,
    }
}

fn pair_phase_offset(channels: usize, channel: usize) -> f32 {
    match pair_for_channel(channels, channel) {
        Some((_, right)) if channel == right => std::f32::consts::PI,
        _ => 0.0,
    }
}

fn adjacent_non_lfe_channel(channels: usize, channel: usize, tap: usize) -> usize {
    const RING_20: [usize; 2] = [0, 1];
    const RING_51: [usize; 5] = [2, 0, 4, 5, 1];
    const RING_71: [usize; 7] = [2, 0, 6, 4, 5, 7, 1];
    const OFFSETS: [isize; 7] = [0, 1, -1, 2, -2, 3, -3];
    let ring: &[usize] = match channels {
        2 => &RING_20,
        6 => &RING_51,
        8 => &RING_71,
        _ => return channel,
    };
    let position = ring.iter().position(|candidate| *candidate == channel)
        .unwrap_or(0) as isize;
    let source = (position + OFFSETS[tap]).rem_euclid(ring.len() as isize) as usize;
    ring[source]
}
```

Provide the four constructors below with the field order shown above.

The constructor signatures are:

```rust
impl ModulationControl {
    pub(crate) fn new(
        enabled: bool, rate_hz: f32, depth: f32, center_delay_ms: f32,
        feedback: f32, mix: f32,
    ) -> Self {
        Self { enabled, rate_hz, depth, center_delay_ms, feedback, mix }
    }
}
impl PhaserControl {
    pub(crate) fn new(
        enabled: bool, rate_hz: f32, depth: f32, center_frequency_hz: f32,
        feedback: f32, mix: f32,
    ) -> Self {
        Self { enabled, rate_hz, depth, center_frequency_hz, feedback, mix }
    }
}
impl DelayControl {
    pub(crate) fn new(
        enabled: bool, delay_ms: f32, feedback: f32, ping_pong: f32,
        damping_hz: f32, mix: f32,
    ) -> Self {
        Self { enabled, delay_ms, feedback, ping_pong, damping_hz, mix }
    }
}
impl EarlyReflectionsControl {
    pub(crate) fn new(
        enabled: bool, room_size: f32, diffusion: f32, damping: f32, mix: f32,
    ) -> Self {
        Self { enabled, room_size, diffusion, damping, mix }
    }
}
```

These constructors perform no validation because public ABI validation has already completed before preparation.

- [ ] **Step 1: Declare the module and add failing private DSP tests**

Add `mod mixer_effects;` to `lib.rs`. Add these test-only helpers in `mixer_effects.rs`; every later module test uses these exact names/signatures:

```rust
fn render(
    rack: &mut EffectsRack,
    mut pcm: Vec<f32>,
    channels: usize,
    parameters: EffectFrameParameters,
) -> Vec<f32> {
    rack.begin_block();
    for frame in pcm.chunks_exact_mut(channels) {
        assert!(rack.process_frame(frame, parameters));
    }
    pcm
}

fn impulse(frames: usize, channels: usize, active_channel: usize) -> Vec<f32> {
    let mut pcm = vec![0.0; frames * channels];
    pcm[active_channel] = 1.0;
    if channels >= 6 && active_channel != 3 { pcm[3] = 0.25; }
    pcm
}

fn sine_input(frames: usize, channels: usize, sample_rate: f32) -> Vec<f32> {
    let mut pcm = vec![0.0; frames * channels];
    for frame in 0..frames {
        let sample = (frame as f32 * 997.0 * std::f32::consts::TAU / sample_rate).sin() * 0.2;
        pcm[frame * channels..(frame + 1) * channels].fill(sample);
    }
    pcm
}

fn channel_samples(pcm: &[f32], channels: usize, channel: usize) -> Vec<f32> {
    pcm.chunks_exact(channels).map(|frame| frame[channel]).collect()
}

fn frame_peak(pcm: &[f32], channels: usize, frame: usize) -> f32 {
    pcm[frame * channels..(frame + 1) * channels]
        .iter().fold(0.0_f32, |peak, sample| peak.max(sample.abs()))
}

fn energy(pcm: &[f32]) -> f64 {
    pcm.iter().map(|sample| (*sample as f64).powi(2)).sum()
}

fn prepared(control: EffectControlParameters, sample_rate: f32) -> EffectFrameParameters {
    EffectsDerivedParameters::prepare(control, sample_rate).frame_parameters()
}
```

Then add failing tests with these assertions:

```rust
#[test]
fn fractional_delay_interpolates_without_moving_storage() {
    let mut delay = FractionalDelayBank::new(8, 64);
    let pointer = delay.samples.as_ptr();
    let capacity = delay.samples.capacity();
    delay.write(0, 1.0);
    delay.advance();
    assert!((delay.read_linear(0, 0.5) - 0.5).abs() < 1.0e-6);
    for _ in 0..256 { delay.write(0, 0.0); delay.advance(); }
    assert_eq!(delay.samples.as_ptr(), pointer);
    assert_eq!(delay.samples.capacity(), capacity);
}

#[test]
fn chorus_and_flanger_are_distinct_finite_and_keep_lfe_dry() {
    let mut rack = EffectsRack::new(48_000.0);
    let input = impulse(96_000, 8, 0);
    let baseline_lfe = channel_samples(&input, 8, 3);
    let mut chorus_control = EffectControlParameters::default();
    chorus_control.chorus = ModulationControl::new(true, 0.32, 0.42, 18.0, 0.08, 0.30);
    let chorus = render(&mut rack, input.clone(), 8, prepared(chorus_control, 48_000.0));
    rack.reset();
    let mut flanger_control = EffectControlParameters::default();
    flanger_control.flanger = ModulationControl::new(true, 0.18, 0.65, 1.6, 0.55, 0.32);
    let flanger = render(&mut rack, input, 8, prepared(flanger_control, 48_000.0));
    assert_ne!(chorus, flanger);
    assert!(chorus.iter().chain(&flanger).all(|sample| sample.is_finite()));
    assert_eq!(channel_samples(&chorus, 8, 3), baseline_lfe);
    assert_eq!(channel_samples(&flanger, 8, 3), baseline_lfe);
}
```

- [ ] **Step 2: Run the module tests and verify they fail to compile**

Run the Cargo command from Task 2 with filter `mixer_effects::tests`.

Expected: FAIL because `FractionalDelayBank`, `EffectsRack`, and parameter helpers are not defined.

- [ ] **Step 3: Implement preallocated fractional-delay storage**

Implement all control/prepared types, constructors, role helpers, `SineTable`, and the compilable Task 3 rack shape exactly as declared above. Use one flat `Vec<f32>` per delay bank allocated in `new`, fixed `channels = 8`, and a power-independent ring stride. Linear interpolation is:

```rust
fn read_linear(&self, channel: usize, delay_samples: f32) -> f32 {
    let delay = delay_samples.clamp(0.0, (self.stride - 2) as f32);
    let whole = delay.floor() as usize;
    let fraction = delay - whole as f32;
    let newer = (self.write_position + self.stride - whole) % self.stride;
    let older = (newer + self.stride - 1) % self.stride;
    let base = channel * self.stride;
    self.samples[base + newer]
        + (self.samples[base + older] - self.samples[base + newer]) * fraction
}
```

Allocate Chorus for `45 ms`, Flanger for `20 ms`, Delay for `1005 ms`, and Early Reflections for `40 ms` at the configured sample rate. `advance()` runs once per processed audio frame, not once per channel.

- [ ] **Step 4: Implement Chorus and Flanger with opposing pair phase**

Use canonical pairs `FL/FR`, `BL/BR`, and `SL/SR`; in 5.1 only `FL/FR` and `SL/SR` exist. Centre uses its own line at the module's base phase and is never cross-fed. Return dry LFE unchanged. The Chorus read delay is:

```rust
center_samples * (1.0 + 0.45 * depth * lfo)
```

The Flanger read delay is:

```rust
(center_samples * (1.0 + 0.90 * depth * lfo)).max(0.05 * sample_rate / 1000.0)
```

At rack creation, fill `SineTable { values: [f32; 2048] }` with `sin(TAU * index / 2048)`. Its audio-time lookup linearly interpolates the two wrapped neighboring indices. For the right member of each pair add `PI` to the LFO phase. Advance one shared phase per module once per frame and wrap it with `if phase >= TAU { phase -= TAU; }`. Chorus wet is the delayed sample; Flanger wet is `(dry + delayed) * 0.5`. Write `dry + delayed * feedback` into the corresponding module line, sanitize non-finite feedback state to zero, and mix with the unity-correlated linear crossfade:

```rust
fn lookup(&self, phase: f32) -> f32 {
    let position = phase.rem_euclid(std::f32::consts::TAU)
        / std::f32::consts::TAU * self.values.len() as f32;
    let lower = position.floor() as usize % self.values.len();
    let upper = (lower + 1) % self.values.len();
    let fraction = position - position.floor();
    self.values[lower] + (self.values[upper] - self.values[lower]) * fraction
}

fn dry_wet(dry: f32, wet: f32, mix: f32) -> f32 {
    dry + (wet - dry) * mix.clamp(0.0, 1.0)
}
```

- [ ] **Step 5: Run module tests at 16, 48, and 192 kHz**

Extend the test loop to construct the rack at `16_000.0`, `48_000.0`, and `192_000.0`, render two seconds with maximum feedback, and assert all output is finite and its tail peak decreases over the final half-second.

Run the Cargo command from Task 2 with filter `mixer_effects::tests`.

Expected: all fractional-delay, Chorus, and Flanger tests PASS.

- [ ] **Step 6: Commit the modulation core**

```powershell
git add native/rust-audio-upmix/src/mixer_effects.rs native/rust-audio-upmix/src/lib.rs
git commit -m "feat: add chorus and flanger dsp"
```

### Task 4: Six-Stage Phaser and Stereo/Ping-Pong Delay

**Files:**
- Modify: `native/rust-audio-upmix/src/mixer_effects.rs`

**Interfaces:**
- Consumes: `FractionalDelayBank`, `dry_wet`, canonical pair helpers, and `EffectFrameParameters` from Task 3.
- Produces: six all-pass states per non-LFE channel and pair-aware cross-feedback delay with smoothed delay reads; appends `phaser: Phaser`, `delay: StereoDelay`, and `phaser_coefficients: PhaserCoefficientTable` to `EffectsRack`.

- [ ] **Step 1: Add failing phaser and delay response tests**

```rust
#[test]
fn phaser_has_six_stable_allpass_stages_per_non_lfe_channel() {
    let mut rack = EffectsRack::new(48_000.0);
    let input = sine_input(48_000 * 3, 8, 48_000.0);
    let baseline_lfe = channel_samples(&input, 8, 3);
    let mut control = EffectControlParameters::default();
    control.phaser = PhaserControl::new(true, 0.22, 0.55, 900.0, 0.25, 0.34);
    let rendered = render(&mut rack, input.clone(), 8, prepared(control, 48_000.0));
    assert_eq!(rack.phaser_stage_count(), 6);
    assert!(rendered.iter().all(|sample| sample.is_finite()));
    assert_ne!(channel_samples(&rendered, 8, 0), channel_samples(&input, 8, 0));
    assert_eq!(channel_samples(&rendered, 8, 3), baseline_lfe);
}

#[test]
fn ping_pong_delay_crosses_pairs_but_never_lfe() {
    for (left, right) in [(0, 1), (4, 5), (6, 7)] {
        let mut rack = EffectsRack::new(48_000.0);
        let input = impulse(24_000, 8, left);
        let baseline_lfe = channel_samples(&input, 8, 3);
        let mut control = EffectControlParameters::default();
        control.delay = DelayControl::new(true, 100.0, 0.50, 1.0, 8_000.0, 1.0);
        let rendered = render(&mut rack, input, 8, prepared(control, 48_000.0));
        assert!(channel_samples(&rendered, 8, right)[4_800..]
            .iter().any(|sample| sample.abs() > 0.1));
        assert_eq!(channel_samples(&rendered, 8, 3), baseline_lfe);
    }
}
```

- [ ] **Step 2: Run the two tests and verify they fail**

Run the Cargo command from Task 2 with filters `phaser_has_six` and `ping_pong_delay_crosses`.

Expected: FAIL because Phaser and Delay state/processing are absent.

- [ ] **Step 3: Implement the six-stage first-order all-pass phaser**

Use six `[AllPassState; 6]` entries per channel. At rack creation, fill `PhaserCoefficientTable { values: [f32; 2048], minimum_log2_hz, maximum_log2_hz }` across logarithmic frequencies `20 Hz..sample_rate * 0.45`; each table value is prepared with `tan(PI * frequency / sample_rate)` and `(1 - tangent) / (1 + tangent)`, clamped to `-0.999..0.999`. The audio callback performs only a clamped linear table lookup:

```rust
let log_frequency = (parameters.center_log2_hz + lfo * parameters.depth * 2.0)
    .clamp(table.minimum_log2_hz, table.maximum_log2_hz);
let coefficient = table.lookup_log2(log_frequency);
```

Implement the lookup as:

```rust
fn lookup_log2(&self, log_frequency: f32) -> f32 {
    let position = (log_frequency - self.minimum_log2_hz)
        / (self.maximum_log2_hz - self.minimum_log2_hz)
        * (self.values.len() - 1) as f32;
    let lower = position.floor() as usize;
    let upper = (lower + 1).min(self.values.len() - 1);
    let fraction = position - lower as f32;
    self.values[lower] + (self.values[upper] - self.values[lower]) * fraction
}
```

Each stage uses `y = -a * x + x1 + a * y1`. Use the canonical pair helper so right members sweep at `phase + PI`; centre uses the base phase. Feed the previous wet output back at the requested coefficient, process centre as mono, skip LFE, and use the same linear dry/wet crossfade.

Store Phaser state as:

```rust
struct Phaser {
    stages: [[AllPassState; 6]; 8],
    feedback: [f32; 8],
    phase: f32,
    active_mix: f32,
}
```

Add this private test accessor so the topology assertion above is concrete:

```rust
#[cfg(test)]
fn phaser_stage_count(&self) -> usize {
    self.phaser.stages[0].len()
}
```

- [ ] **Step 4: Implement pair-aware Stereo/Ping-Pong Delay**

For each canonical pair, calculate feedback inputs before writing either side:

```rust
let left_feedback = left_delayed * (1.0 - ping_pong) + right_delayed * ping_pong;
let right_feedback = right_delayed * (1.0 - ping_pong) + left_delayed * ping_pong;
```

Apply a one-pole low-pass to each feedback sample using the control-path-prepared coefficient `1.0 - exp(-TAU * cutoff / sample_rate)`. Centre feeds itself. LFE is copied dry and never written into the feedback network.

For delay-time automation, store `from_delay_samples`, `to_delay_samples`, `transition_remaining`, and `transition_total = round(sample_rate * 0.020)`. On a new target, preserve the current interpolated delay as `from`, set the requested delay as `to`, and restart the 20 ms transition. During the transition, read both fractional taps and blend their samples with `smoothstep = t * t * (3 - 2 * t)`; after the transition, read only `to`. This makes a large change responsive in 20 ms without jumping a read head or allocating.

- [ ] **Step 5: Prove decay, smoothing, and no storage growth**

Add tests that automate `1 ms -> 1000 ms -> 1 ms` every 64 frames, assert adjacent-sample jumps remain below `0.25` for a `0.2`-amplitude sine, assert a stable target finishes its transition in exactly `round(sample_rate * 0.020)` frames, and assert all delay pointers/capacities remain unchanged after ten seconds at each supported channel count.

Run all `mixer_effects::tests` with the Cargo command from Task 2.

Expected: PASS at 2, 6, and 8 channels and at 16, 48, and 192 kHz.

- [ ] **Step 6: Commit Phaser and Delay**

```powershell
git add native/rust-audio-upmix/src/mixer_effects.rs
git commit -m "feat: add phaser and ping pong delay"
```

### Task 5: Early Reflections and Complete Effects Rack

**Files:**
- Modify: `native/rust-audio-upmix/src/mixer_effects.rs`

**Interfaces:**
- Consumes: the independent 40 ms reflection delay bank and canonical role helpers.
- Produces: an energy-normalized non-LFE reflection matrix, appends `early_reflections: EarlyReflections` to `EffectsRack`, and completes rack order `Chorus -> Flanger -> Phaser -> Delay -> Early Reflections`.

- [ ] **Step 1: Add failing reflection timing, energy, and routing tests**

```rust
#[test]
fn early_reflections_use_distinct_bounded_taps_and_protect_lfe() {
    let mut rack = EffectsRack::new(48_000.0);
    let input = impulse(4_096, 8, 0);
    let input_energy = energy(&input);
    let baseline_lfe = channel_samples(&input, 8, 3);
    let mut control = EffectControlParameters::default();
    control.early_reflections = EarlyReflectionsControl::new(true, 1.0, 0.55, 0.0, 0.5);
    let rendered = render(&mut rack, input, 8, prepared(control, 48_000.0));
    for tap_ms in [7.0_f32, 11.0, 13.7, 17.3, 22.1, 27.7, 34.9] {
        let frame = (tap_ms * 48.0).round() as usize;
        assert!((frame.saturating_sub(2)..=frame + 2)
            .any(|candidate| frame_peak(&rendered, 8, candidate) > 1.0e-5));
    }
    assert_eq!(channel_samples(&rendered, 8, 3), baseline_lfe);
    assert!(energy(&rendered) <= input_energy * 2.25);
}

#[test]
fn rack_reset_clears_every_tail() {
    let mut rack = EffectsRack::new(48_000.0);
    let mut control = EffectControlParameters::default();
    control.chorus = ModulationControl::new(true, 0.32, 0.42, 18.0, 0.08, 0.30);
    control.flanger = ModulationControl::new(true, 0.18, 0.65, 1.6, 0.55, 0.32);
    control.phaser = PhaserControl::new(true, 0.22, 0.55, 900.0, 0.25, 0.34);
    control.delay = DelayControl::new(true, 320.0, 0.38, 0.85, 8_000.0, 0.28);
    control.early_reflections = EarlyReflectionsControl::new(true, 0.72, 0.75, 0.55, 0.22);
    let parameters = prepared(control, 48_000.0);
    let rendered = render(&mut rack, impulse(96_000, 2, 0), 2, parameters);
    assert!(energy(&rendered) > 0.0);
    rack.reset();
    let silence = render(&mut rack, vec![0.0; 4_096], 2, parameters);
    assert_eq!(silence, vec![0.0; 4_096]);
}

#[test]
fn non_finite_module_isolated_for_rest_of_block() {
    let mut failed = EffectsRack::new(48_000.0);
    let mut reference = EffectsRack::new(48_000.0);
    let mut both = EffectControlParameters::default();
    both.chorus = ModulationControl::new(true, 0.32, 0.42, 18.0, 0.08, 0.30);
    both.flanger = ModulationControl::new(true, 0.18, 0.65, 1.6, 0.55, 0.32);
    let mut flanger_only = both;
    flanger_only.chorus.enabled = false;
    let failed_parameters = prepared(both, 48_000.0);
    let reference_parameters = prepared(flanger_only, 48_000.0);
    failed.begin_block();
    reference.begin_block();
    failed.inject_non_finite_for_test(EffectModule::Chorus);
    for frame_index in 0..64 {
        let mut actual = [0.1_f32, -0.1];
        let mut expected = actual;
        let result = failed.process_frame(&mut actual, failed_parameters);
        assert!(reference.process_frame(&mut expected, reference_parameters));
        assert!(actual.iter().all(|sample| sample.is_finite()));
        assert_eq!(actual, expected);
        if frame_index == 0 { assert!(!result); }
        else { assert!(result); }
        assert!(failed.chorus_failed_this_block);
    }
}
```

- [ ] **Step 2: Run the reflection/rack tests and verify they fail**

Run the Cargo command from Task 2 with filters `early_reflections` and `rack_reset_clears`.

Expected: FAIL because reflection taps and the complete rack order are absent.

- [ ] **Step 3: Implement the bounded multi-tap reflection network**

Use normalized base delays `[7.0, 11.0, 13.7, 17.3, 22.1, 27.7, 34.9] ms`. Map room size to a scale `0.75 + 0.25 * room_size`; this keeps all taps within `5.25..34.9 ms`. For each tap:

```rust
let tap_gain = parameters.tap_weights[tap];
let diffusion_sign = if (tap + channel) % 2 == 0 { 1.0 } else { -1.0 };
let adjacent = adjacent_non_lfe_channel(channels, channel, tap);
wet[channel] += filtered_tap[adjacent]
    * tap_gain
    * (0.65 + 0.35 * diffusion)
    * diffusion_sign;
```

In `prepare`, normalize base weights `[0.36, 0.31, 0.27, 0.23, 0.20, 0.17, 0.14]` by `1 / sqrt(sum(weight²))`, then apply `early_reflections_mix <= 0.5` through `dry_wet`. Read the prepared one-pole `damping_alpha = 0.05 + 0.90 * (1.0 - damping)`. Never route to or from channel index `3` in 6/8-channel frames.

- [ ] **Step 4: Implement module-local bypass smoothing and failure isolation**

Each module owns `active_mix` and approaches `requested_mix` by at most `1 / (sample_rate * 0.005)` per sample. When disabled and `active_mix == 0`, skip all reads and writes for that module. `begin_block()` clears five failure latches. If a module produces non-finite state, reset only that module, restore that module's dry input for the current frame, latch it bypassed for the remaining frames of the host block, and return `false`; the rack continues with the other modules and the outer Mixer stays live.

Before and after each active module call, check its phase, feedback/filter scalars, the delay samples read/written for the current channels, and produced frame values with `is_finite()`. This is a bounded 2/6/8-channel check and never scans an entire delay buffer in the callback.

Use a stack `[f32; 8]` to snapshot the current frame before each module and copy back only `0..frame.len()` on failure; do not create a `Vec` or clone a delay buffer in `process_frame`.

For the private failure test, define `#[cfg(test)] enum EffectModule { Chorus, Flanger, Phaser, Delay, EarlyReflections }` and `inject_non_finite_for_test(&mut self, EffectModule)`. The match arms write `f32::NAN` respectively to Chorus phase, Flanger phase, Phaser phase, Delay feedback-filter state 0, and Early Reflections damping state 0. Expose `chorus_failed_this_block` only under `cfg(test)`. In production these state fields remain private.

- [ ] **Step 5: Run all module tests and a release benchmark loop**

Run:

```powershell
$env:TEMP='E:\FE_audio_tmp'; $env:TMP='E:\FE_audio_tmp'
$env:CARGO_HOME='E:\FE moster\.tools\cargo'; $env:RUSTUP_HOME='E:\FE moster\.tools\rustup'
$env:CARGO_TARGET_DIR='E:\FE moster\native\rust-audio-upmix\target'
& 'E:\FE moster\.tools\cargo\bin\cargo.exe' test --manifest-path native/rust-audio-upmix/Cargo.toml --release --locked --offline mixer_effects::tests
```

Expected: all tests PASS, all pointers/capacities stay fixed, and reset leaves exact silence.

- [ ] **Step 6: Commit the complete rack**

```powershell
git add native/rust-audio-upmix/src/mixer_effects.rs
git commit -m "feat: add early reflections dsp rack"
```

### Task 6: Insert the Rack into the Rust Mixer Signal Path

**Files:**
- Modify: `native/rust-audio-upmix/src/lib.rs:620-1140, 1180-1410`
- Modify: `native/rust-audio-upmix/tests/mixer.rs:240-380, 500-620`

**Interfaces:**
- Consumes: `EffectsDerivedParameters` and `EffectsRack` from Tasks 3–5, plus ABI v2 fields from Task 2.
- Produces: production order `compressor -> Chorus -> Flanger -> Phaser -> Delay -> Early Reflections -> FDN reverb -> output/limiter` and reset/snapshot semantics for all effects.

- [ ] **Step 1: Add failing public-FFI behavior tests**

Add this helper to `tests/mixer.rs`, then use one baseline handle and one effect handle so the assertion measures only the new rack:

```rust
fn channel_samples(pcm: &[f32], channels: usize, channel: usize) -> Vec<f32> {
    pcm.chunks_exact(channels).map(|frame| frame[channel]).collect()
}

fn process_in_blocks(
    handle: &Handle,
    pcm: &mut [f32],
    channels: usize,
    max_frames: usize,
) {
    for block in pcm.chunks_mut(max_frames * channels) {
        assert_eq!(handle.process(block, channels as u32), FE_RUST_MIXER_OK);
    }
}
```

```rust
#[test]
fn disabled_effect_rack_matches_clean_mixer_and_enabled_modules_are_real() {
    let clean = Handle::new(512);
    let effected = Handle::new(512);
    let input = sine(48_000, 8, 997.0, 0.15);
    let mut baseline = input.clone();
    let mut disabled = input.clone();
    process_in_blocks(&clean, &mut baseline, 8, 512);
    process_in_blocks(&effected, &mut disabled, 8, 512);
    assert_eq!(disabled, baseline);

    let mut chorus = FeRustMixerParams::default();
    chorus.chorus_enabled = 1;
    chorus.chorus_mix = 0.35;
    effected.apply(1, &chorus, 240);
    let mut wet = input.clone();
    process_in_blocks(&effected, &mut wet, 8, 512);
    assert_ne!(wet, baseline);
    assert_eq!(channel_samples(&wet, 8, 3), channel_samples(&baseline, 8, 3));
}

#[test]
fn effect_tails_reset_and_rapid_automation_remains_continuous() {
    let handle = Handle::new(64);
    let mut params = FeRustMixerParams::default();
    params.delay_enabled = 1;
    params.delay_feedback = 0.38;
    params.delay_ping_pong = 0.85;
    params.delay_damping_hz = 8_000.0;
    params.delay_mix = 0.28;
    handle.apply(1, &params, 240);
    let mut previous = 0.0_f32;
    let mut maximum_jump = 0.0_f32;
    let mut absolute_frame = 0_usize;
    for revision in 2_u64..514 {
        params.delay_ms = if revision % 2 == 0 { 1.0 } else { 1_000.0 };
        handle.apply(revision, &params, 64);
        let mut input = vec![0.0_f32; 64 * 2];
        for frame in 0..64 {
            let sample = ((absolute_frame + frame) as f32 * 440.0
                * std::f32::consts::TAU / 48_000.0).sin() * 0.2;
            input[frame * 2] = sample;
            input[frame * 2 + 1] = sample;
        }
        absolute_frame += 64;
        assert_eq!(handle.process(&mut input, 2), FE_RUST_MIXER_OK);
        for sample in &input {
            maximum_jump = maximum_jump.max((*sample - previous).abs());
            previous = *sample;
        }
    }
    assert!(maximum_jump < 0.25, "automation jump={maximum_jump}");
    assert_eq!(unsafe { fe_rust_mixer_reset(handle.0) }, FE_RUST_MIXER_OK);
    let mut silence = vec![0.0; 8_192];
    process_in_blocks(&handle, &mut silence, 2, 64);
    assert_eq!(silence, vec![0.0; 8_192]);
}
```

Add a 2/6/8-channel loop covering each of the five modules independently and in combination. Assert finite output, distinct checksums, dry LFE, and tail decay at maximum legal feedback.

- [ ] **Step 2: Run the FFI tests and verify they fail**

Run the Cargo command from Task 2 with filters `disabled_effect_rack` and `effect_tails_reset`.

Expected: FAIL because the Mixer does not own or call `EffectsRack` yet.

- [ ] **Step 3: Prepare all effect coefficients on the control path**

Add `effects: EffectsDerivedParameters` to `DerivedParameters`. Construct it in `DerivedParameters::from_params` from this exact raw projection:

```rust
EffectControlParameters {
    chorus: ModulationControl::new(
        p.chorus_enabled != 0, p.chorus_rate_hz, p.chorus_depth,
        p.chorus_center_delay_ms, p.chorus_feedback, p.chorus_mix,
    ),
    flanger: ModulationControl::new(
        p.flanger_enabled != 0, p.flanger_rate_hz, p.flanger_depth,
        p.flanger_center_delay_ms, p.flanger_feedback, p.flanger_mix,
    ),
    phaser: PhaserControl::new(
        p.phaser_enabled != 0, p.phaser_rate_hz, p.phaser_depth,
        p.phaser_center_frequency_hz, p.phaser_feedback, p.phaser_mix,
    ),
    delay: DelayControl::new(
        p.delay_enabled != 0, p.delay_ms, p.delay_feedback,
        p.delay_ping_pong, p.delay_damping_hz, p.delay_mix,
    ),
    early_reflections: EarlyReflectionsControl::new(
        p.early_reflections_enabled != 0, p.early_reflections_room_size,
        p.early_reflections_diffusion, p.early_reflections_damping,
        p.early_reflections_mix,
    ),
}
```

`EffectsDerivedParameters::prepare` converts Hz to phase increments, milliseconds to sample counts, and delay damping Hz to a one-pole coefficient. Its `approach` method ramps every continuous scalar with the same `fraction` used by the current Mixer snapshot.

- [ ] **Step 4: Own and reset one preallocated rack in `MixerDsp`**

Add:

```rust
effects: EffectsRack,
```

Initialize it with `EffectsRack::new(config.sample_rate as f32)`. Call `self.effects.reset()` in `reset_temporal`. Do not allocate in `accept_snapshot`, `ramp_one`, `process`, or reset.

- [ ] **Step 5: Insert rack processing after the linked compressor**

Call `self.effects.begin_block()` once before the Mixer's frame loop. Immediately before the existing FDN reverb block, process exactly one interleaved frame slice:

```rust
let effects_ok = self.effects.process_frame(
    &mut pcm[base..base + channels],
    self.derived.effects.frame_parameters(),
);
if !effects_ok {
    // Rack already restored the affected module's dry input and reset only its state.
    // The outer process remains successful so playback does not drop a block.
}
```

Extend `ramp_one` to approach all new continuous ABI fields and copy all five enable flags from the target snapshot. Preserve the current reverb and limiter order.

- [ ] **Step 6: Run all Rust release tests and the symbol/panic contract**

Run:

```powershell
$env:TEMP='E:\FE_audio_tmp'; $env:TMP='E:\FE_audio_tmp'
$env:CARGO_HOME='E:\FE moster\.tools\cargo'; $env:RUSTUP_HOME='E:\FE moster\.tools\rustup'
$env:CARGO_TARGET_DIR='E:\FE moster\native\rust-audio-upmix\target'
& 'E:\FE moster\.tools\cargo\bin\cargo.exe' test --manifest-path native/rust-audio-upmix/Cargo.toml --release --locked --offline
```

Expected: all tests PASS; the FFI still catches panics, and every disabled effect matches the clean path.

- [ ] **Step 7: Commit Mixer integration**

```powershell
git add native/rust-audio-upmix/src/lib.rs native/rust-audio-upmix/src/mixer_effects.rs native/rust-audio-upmix/tests/mixer.rs
git commit -m "feat: connect dsp rack to rust mixer"
```

### Task 7: Windows ABI v2 Loader and 68-Value JNI Bridge

**Files:**
- Modify: `native/windows/fe_monster_xaudio2.cpp:35-55, 480-555`
- Modify: `native/windows/audio/fe_audio_pipeline.cpp:130-245`
- Test: `native/rust-audio-upmix/tests/mixer_header_probe.c`
- Test: `scripts/check-native-audio-chain-mode-contract.mjs`

**Interfaces:**
- Consumes: 296-byte v2 C header and Java float indices `0..67`.
- Produces: the native half of atomic v2 validation/staging while an ABI mismatch still fails open to dry playback. This half is deliberately not committed until Java accepts the same 68-value/`0x7ff` contract in Task 8.

- [ ] **Step 1: Add failing native source contracts for the new vector and flags**

Extend the native-chain contract probe with exact assertions:

```js
assert.match(bridge, /constexpr\s+jsize\s+kMixerValueCount\s*=\s*68/);
assert.match(bridge, /\(flags\s*&\s*~0x7ff\)\s*!=\s*0/);
assert.match(bridge, /mixer->chorus_enabled\s*=\s*\(flags\s*&\s*0x40\)/);
assert.match(bridge, /mixer->flanger_enabled\s*=\s*\(flags\s*&\s*0x80\)/);
assert.match(bridge, /mixer->phaser_enabled\s*=\s*\(flags\s*&\s*0x100\)/);
assert.match(bridge, /mixer->delay_enabled\s*=\s*\(flags\s*&\s*0x200\)/);
assert.match(bridge, /mixer->early_reflections_enabled\s*=\s*\(flags\s*&\s*0x400\)/);
```

Also assert that `raw[31]` through `raw[43]` retain their current upmix/OBR assignments.

- [ ] **Step 2: Run the source contract and verify it fails on 44 values**

Run:

```powershell
$env:TEMP='E:\FE_audio_tmp'; $env:TMP='E:\FE_audio_tmp'
node scripts/check-native-audio-chain-mode-contract.mjs
```

Expected: FAIL because `kMixerValueCount` is `44` and the effect flags/mapping are absent.

- [ ] **Step 3: Extend native validation for ABI v2**

In `ValidateMixerParameters`, validate all five flags as `0/1` and apply the exact Task 2 numeric bounds. Keep full-snapshot rejection: one invalid effect value rejects the revision before the audio thread sees any part of it.

- [ ] **Step 4: Preserve indices 0–43 and append indices 44–67**

Set `kMixerValueCount = 68`, change the allowed mask to `0x7ff`, and map the values exactly as follows:

```cpp
mixer->chorus_enabled = (flags & 0x40) != 0 ? 1u : 0u;
mixer->chorus_rate_hz = raw[44];
mixer->chorus_depth = raw[45];
mixer->chorus_center_delay_ms = raw[46];
mixer->chorus_feedback = raw[47];
mixer->chorus_mix = raw[48];
mixer->flanger_enabled = (flags & 0x80) != 0 ? 1u : 0u;
mixer->flanger_rate_hz = raw[49];
mixer->flanger_depth = raw[50];
mixer->flanger_center_delay_ms = raw[51];
mixer->flanger_feedback = raw[52];
mixer->flanger_mix = raw[53];
mixer->phaser_enabled = (flags & 0x100) != 0 ? 1u : 0u;
mixer->phaser_rate_hz = raw[54];
mixer->phaser_depth = raw[55];
mixer->phaser_center_frequency_hz = raw[56];
mixer->phaser_feedback = raw[57];
mixer->phaser_mix = raw[58];
mixer->delay_enabled = (flags & 0x200) != 0 ? 1u : 0u;
mixer->delay_ms = raw[59];
mixer->delay_feedback = raw[60];
mixer->delay_ping_pong = raw[61];
mixer->delay_damping_hz = raw[62];
mixer->delay_mix = raw[63];
mixer->early_reflections_enabled = (flags & 0x400) != 0 ? 1u : 0u;
mixer->early_reflections_room_size = raw[64];
mixer->early_reflections_diffusion = raw[65];
mixer->early_reflections_damping = raw[66];
mixer->early_reflections_mix = raw[67];
```

- [ ] **Step 5: Build the production DLL and run native contracts**

Run:

```powershell
$env:TEMP='E:\FE_audio_tmp'; $env:TMP='E:\FE_audio_tmp'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-xaudio2.ps1 -ObrSourceDir 'E:\FE moster\.tmp\google-obr-native-478dc7c752d5'
node scripts/check-native-audio-chain-mode-contract.mjs
node scripts/check-native-spatial-audio-pipeline.mjs
```

Expected: build PASS, bridge reports Mixer ABI `2`, and all four upmix/OBR modes include the Mixer exactly once.

- [ ] **Step 6: Inspect the native half and carry it directly into Task 8 without committing**

```powershell
git diff --check -- native/windows/fe_monster_xaudio2.cpp native/windows/audio/fe_audio_pipeline.cpp scripts/check-native-audio-chain-mode-contract.mjs
git status --short -- native/windows/fe_monster_xaudio2.cpp native/windows/audio/fe_audio_pipeline.cpp scripts/check-native-audio-chain-mode-contract.mjs
```

Expected: only the three intended native bridge/contract files are changed and the diff is clean. Do **not** commit, launch Java, or persist mixer state at this checkpoint: a native 68-value consumer paired with the still-44-value Java producer is not a valid permanent revision. Continue immediately to Task 8 and commit both sides together.

### Task 8: Java Schema Migration, Presets, and Native Serialization

**Files:**
- Modify: `src/main/java/com/femonster/core/AudioMixerService.java:35-125, 500-545, 1150-1235, 1600-1910`
- Modify: `src/main/java/com/femonster/core/NativeAudioEngine.java:15-125`
- Modify: `src/test/java/com/femonster/core/AudioMixerServiceProbe.java`
- Modify: `scripts/check-audio-mixer-service.mjs`
- Modify: `native/rust-audio-upmix/include/fe_rust_mixer.h`
- Modify: `native/rust-audio-upmix/src/lib.rs:390-520`
- Modify: `native/rust-audio-upmix/tests/mixer.rs`
- Modify: `native/rust-audio-upmix/examples/mixer_preset_dump.rs`

**Interfaces:**
- Consumes: effect keys/bounds, flag bits, float mapping, and preset enum IDs from Tasks 2 and 7.
- Produces: an atomic native/Java ABI v2 slice, complete v2 server snapshots, additive legacy/v1 migration, 14 stable presets, and Java/Rust preset parity.

- [ ] **Step 1: Add failing migration, serialization, and preset tests**

In `AudioMixerServiceProbe`, write a complete current 41-key `surround-3d` state document using the old shipped `-6 dB`/width `1.2` snapshot, load it, and assert:

```java
Map<String, Object> migrated = service.snapshot();
Map<String, Object> p = SimpleJson.asMap(migrated.get("parameters"));
require(p.size() == 70, "complete v2 parameter count");
require(Boolean.FALSE.equals(p.get("chorusEnabled")), "chorus disabled default");
require(((Number) p.get("delayMs")).doubleValue() == 320.0, "delay default");
require(((Number) p.get("earlyReflectionsMix")).doubleValue() == 0.0,
    "early reflections disabled mix");
require("custom".equals(migrated.get("selectedPreset")),
    "retuned built-in snapshot must be preserved as custom");
require(Files.readString(stateFile).contains("\"earlyReflectionsMix\""),
    "validated migration must be atomically rewritten");
```

The exact total is `41` current parameter keys plus `29` new effect keys = `70`; the native float vector has 44 current slots because `eqDb` expands to ten floats. Add a native submission assertion for `values.length == 68`, indices `0..43` unchanged, and exact new flag bits. Exercise `NativeAudioEngine.setMixerParameters` with each new flag bit (`0x40`, `0x80`, `0x100`, `0x200`, `0x400`) and require acceptance; pass `0x800` and require `IllegalArgumentException` before any cache or native call changes.

Add preset assertions for IDs:

```text
wide-chorus（宽阔合唱）, classic-flanger（经典镶边）,
flowing-phaser（流动移相）, ping-pong-delay（乒乓回声）,
nearfield-studio（近场工作室）, immersive-live（沉浸现场）
```

- [ ] **Step 2: Run the service probe and verify it fails**

Run:

```powershell
$env:TEMP='E:\FE_audio_tmp'; $env:TMP='E:\FE_audio_tmp'
node scripts/check-audio-mixer-service.mjs
```

Expected: FAIL because v1 parameter documents are rejected as incomplete, the native array is 44 values, and the six presets are absent.

- [ ] **Step 3: Add the 29 effect keys, bounds, and clean defaults**

Freeze the current `PARAMETER_KEYS` as `V1_PARAMETER_KEYS`, then append the exact keys from the stable mapping table to the new `PARAMETER_KEYS`. Add all five enable keys to `BOOLEAN_PARAMETERS`, all Task 2 numeric bounds to `NUMERIC_BOUNDS`, and use the Task 2 clean control values with all enable flags false and all effect mixes `0.0`.

Set `NativeAudioEngine.NATIVE_MIXER_VALUE_COUNT = 68` and resize both cached arrays. In `NativeAudioEngine.validateMixerParameters`, replace the old allowed mask `0x3f` with `0x7ff` and change the length error to `"mixer values must contain exactly 68 floats"`. Do not loosen finite-value or nonnegative-revision validation. Keep all mixer/spatial status-vector sizes unchanged. The probe from Step 1 must prove all five new bits are accepted individually and the first unknown bit `0x800` is rejected.

- [ ] **Step 4: Implement additive legacy/v1/v2 migration**

Recognize exactly three complete shapes: the existing `LEGACY_PARAMETER_KEYS`, the frozen `V1_PARAMETER_KEYS`, and the new `PARAMETER_KEYS`. Migrate by starting from `cleanParameters()`, validating and overlaying only keys in the recognized old shape, then running `validateCompleteParameters`.

Use this explicit discriminator in both startup load and disk refresh:

```java
private enum ParameterShape { LEGACY, V1, V2 }

private static ParameterShape parameterShape(Map<String, Object> root) {
    Object value = root.get("parameters");
    if (!(value instanceof Map<?, ?> raw)) {
        throw new IllegalArgumentException("parameters must be an object");
    }
    if (raw.keySet().equals(PARAMETER_KEY_SET)) return ParameterShape.V2;
    if (raw.keySet().equals(V1_PARAMETER_KEY_SET)) return ParameterShape.V1;
    if (raw.keySet().equals(LEGACY_PARAMETER_KEY_SET)) return ParameterShape.LEGACY;
    throw new IllegalArgumentException("unsupported audio mixer parameter shape");
}
```

`stateFromRoot` switches on this enum: V2 calls `validateCompleteParameters`; V1 and LEGACY call this helper:

```java
private static Map<String, Object> migrateCompleteParameters(
    Map<String, Object> raw,
    List<String> orderedKeys
) {
    if (!raw.keySet().equals(Set.copyOf(orderedKeys))) {
        throw new IllegalArgumentException("legacy audio mixer parameters must be complete");
    }
    Map<String, Object> migrated = cleanParameters();
    for (String key : orderedKeys) {
        migrated.put(key, validateParameter(key, raw.get(key)));
    }
    return validateCompleteParameters(migrated);
}
```

Change preset mismatch handling to:

```java
if (!"custom".equals(restoredPreset)
    && !PRESETS.get(restoredPreset).parameters().equals(parameters)) {
    restoredPreset = "custom";
}
```

After `stateFromRoot` validates an old shape, set `configState = "ready"` and evidence-preserved state, then atomically call the existing `persist(state)` before setting migration complete. Set `spatialMigrationNeeded = false` only after this write succeeds. If atomic replacement fails, propagate the `IOException` and keep the original file untouched. Never persist temporal DSP buffers.

- [ ] **Step 5: Serialize exact flags and values**

Append to `private static int flags(Map<String, Object> parameters)`:

```java
if (booleanValue(parameters.get("chorusEnabled"), false)) flags |= 0x40;
if (booleanValue(parameters.get("flangerEnabled"), false)) flags |= 0x80;
if (booleanValue(parameters.get("phaserEnabled"), false)) flags |= 0x100;
if (booleanValue(parameters.get("delayEnabled"), false)) flags |= 0x200;
if (booleanValue(parameters.get("earlyReflectionsEnabled"), false)) flags |= 0x400;
```

Allocate `float[68]`, leave indices `0..43` byte-for-byte equivalent to the current function, and append the Task 7 mapping at `44..67`.

- [ ] **Step 6: Add exact Java and Rust preset snapshots**

Retune `surround-3d` to `inputGainDb=0.0`, `stereoWidth=1.0`, `upmixAlgorithm=music-detail`, 7.1, Direct OBR, and `obrSpatialWidth=1.0`; preserve adaptive native headroom instead of a fixed `-6 dB` cut.

Append these C enum IDs now that every corresponding DSP module is connected, update the Rust preset loop to `0..=13`, and change the unsupported assertion to `mixer_preset_params(14).is_none()`:

```c
FE_RUST_MIXER_PRESET_WIDE_CHORUS = 8,
FE_RUST_MIXER_PRESET_CLASSIC_FLANGER = 9,
FE_RUST_MIXER_PRESET_FLOWING_PHASER = 10,
FE_RUST_MIXER_PRESET_PING_PONG_DELAY = 11,
FE_RUST_MIXER_PRESET_NEARFIELD_STUDIO = 12,
FE_RUST_MIXER_PRESET_IMMERSIVE_LIVE = 13
```

Use these exact new mixer-stage values in both Java and Rust:

| ID | Enabled module values |
| --- | --- |
| `wide-chorus` | Chorus rate `0.32`, depth `0.42`, centre `18 ms`, feedback `0.08`, mix `0.30`; stereo width `1.15` |
| `classic-flanger` | Flanger rate `0.18`, depth `0.65`, centre `1.6 ms`, feedback `0.55`, mix `0.32` |
| `flowing-phaser` | Phaser rate `0.22`, depth `0.55`, centre `900 Hz`, feedback `0.25`, mix `0.34` |
| `ping-pong-delay` | Delay `320 ms`, feedback `0.38`, ping-pong `0.85`, damping `8000 Hz`, mix `0.28` |
| `nearfield-studio` | Early Reflections room `0.28`, diffusion `0.48`, damping `0.42`, mix `0.16` |
| `immersive-live` | Early Reflections room `0.72`, diffusion `0.75`, damping `0.55`, mix `0.22`; FDN reverb room `0.75`, decay `2200 ms`, damping `0.60`, pre-delay `25 ms`, wet `0.20`, dry `1.0` |

For Java `immersive-live`, also enable 7.1 `music-detail`, Direct OBR, and spatial width `1.15`; these spatial-only fields are intentionally excluded by the existing Java/Rust Mixer-stage parity normalizer.

- [ ] **Step 7: Build and test the now-complete atomic native/Java slice**

Run:

```powershell
$env:TEMP='E:\FE_audio_tmp'; $env:TMP='E:\FE_audio_tmp'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-xaudio2.ps1 -ObrSourceDir 'E:\FE moster\.tmp\google-obr-native-478dc7c752d5'
node scripts/check-native-audio-chain-mode-contract.mjs
node scripts/check-native-spatial-audio-pipeline.mjs
node scripts/check-audio-mixer-service.mjs
```

Expected: production DLL build PASS; both native contracts PASS; service probe PASS with 14 presets, Rust/Java Mixer-stage parity, acceptance of every defined flag and rejection of `0x800`, a 68-value native snapshot, and atomically rewritten old settings that retain every recognized user value.

- [ ] **Step 8: Commit the native bridge and Java producer atomically**

```powershell
git add native/windows/fe_monster_xaudio2.cpp native/windows/audio/fe_audio_pipeline.cpp scripts/check-native-audio-chain-mode-contract.mjs src/main/java/com/femonster/core/AudioMixerService.java src/main/java/com/femonster/core/NativeAudioEngine.java src/test/java/com/femonster/core/AudioMixerServiceProbe.java scripts/check-audio-mixer-service.mjs native/rust-audio-upmix/include/fe_rust_mixer.h native/rust-audio-upmix/src/lib.rs native/rust-audio-upmix/tests/mixer.rs native/rust-audio-upmix/examples/mixer_preset_dump.rs
git diff --cached --check
git commit -m "feat: expose dsp rack abi settings and presets"
```

### Task 9: Understandable DSP Module Cards and Browser Contracts

**Files:**
- Modify: `web/audio-mixer-ui.js:60-275, 900-1120, 1870-2050, 2290-2490`
- Modify: `web/audio-mixer-visuals.js`
- Modify: `web/styles.css`
- Modify: `scripts/check-audio-mixer-ui-module.mjs`
- Modify: `scripts/check-audio-mixer-ui-browser.mjs`
- Modify: `scripts/check-audio-mixer-visuals-module.mjs`

**Interfaces:**
- Consumes: the server's complete 70-key snapshots and 14 stable preset payloads.
- Produces: five modular effect cards with switches, slider/number pairs, help text, reset actions, and protected-LFE copy.

- [ ] **Step 1: Extend test fixtures and add failing UI assertions**

Append all clean effect defaults to every JS fixture. Extend `PRESET_IDENTITIES` to 14 entries. In the module/browser probes assert:

```js
for (const id of ['chorus', 'flanger', 'phaser', 'delay', 'early-reflections']) {
  assert.ok(findByDataset(root, 'mixerFamily', id), `missing ${id} card`);
  assert.ok(findByDataset(root, 'mixerFamilyReset', id), `missing ${id} reset`);
  assert.ok(findByDataset(root, 'mixerFamilyCollapse', id), `missing ${id} collapse`);
}
assert.equal(findByDataset(root, 'mixerParam', 'chorusEnabled').type, 'checkbox');
assert.equal(findByDataset(root, 'mixerNumericInput', 'delayMs').max, '1000');
assert.match(findByDataset(root, 'mixerControlHelp', 'earlyReflectionsMix').textContent, /LFE/);
```

Click the Chorus reset after changing all six Chorus fields, flush the pending mutation, and assert one PATCH contains exactly the six Chorus defaults and retries safely after a simulated `409`.

- [ ] **Step 2: Run module and browser probes and verify they fail**

Run:

```powershell
$env:TEMP='E:\FE_audio_tmp'; $env:TMP='E:\FE_audio_tmp'
node scripts/check-audio-mixer-ui-module.mjs
node scripts/check-audio-mixer-ui-browser.mjs
```

Expected: FAIL because the payload normalizer rejects/ignores the new keys and the cards/presets/reset actions do not exist.

- [ ] **Step 3: Add complete parameter metadata and plain-language help**

Add all five booleans and 24 numeric keys to `BOOLEAN_PARAMETERS`, `NUMERIC_PARAMETERS`, and `CONTROL_HELP` with the exact Task 2 ranges. Use these card labels/descriptions:

```text
合唱（Chorus） — 轻微复制并摆动声音，让左右更宽；LFE 保持原声。
镶边（Flanger） — 短延迟形成扫动梳状音色；反馈过高会更金属。
移相（Phaser） — 六级全通滤波形成流动凹口；LFE 保持原声。
立体声回声（Delay） — 可在左右声道之间往返；中置自反馈，LFE 不进入反馈。
早期反射 — 模拟墙面最先到达的反射，增加距离和房间边界；LFE 保持原声。
```

Add one `FAMILIES` entry per effect. The existing family layout system supplies drag, collapse, density, show/hide, and persistence.

- [ ] **Step 4: Add one atomic reset action per effect card**

Define these immutable module defaults and add a reset button to each effect family's tool group:

```js
const MODULE_DEFAULTS = Object.freeze({
  chorus: Object.freeze({
    chorusEnabled: false, chorusRateHz: 0.30, chorusDepth: 0.35,
    chorusCenterDelayMs: 18.0, chorusFeedback: 0.0, chorusMix: 0.0
  }),
  flanger: Object.freeze({
    flangerEnabled: false, flangerRateHz: 0.18, flangerDepth: 0.50,
    flangerCenterDelayMs: 1.5, flangerFeedback: 0.35, flangerMix: 0.0
  }),
  phaser: Object.freeze({
    phaserEnabled: false, phaserRateHz: 0.20, phaserDepth: 0.50,
    phaserCenterFrequencyHz: 900.0, phaserFeedback: 0.20, phaserMix: 0.0
  }),
  delay: Object.freeze({
    delayEnabled: false, delayMs: 320.0, delayFeedback: 0.30,
    delayPingPong: 0.75, delayDampingHz: 8000.0, delayMix: 0.0
  }),
  'early-reflections': Object.freeze({
    earlyReflectionsEnabled: false, earlyReflectionsRoomSize: 0.35,
    earlyReflectionsDiffusion: 0.55, earlyReflectionsDamping: 0.45,
    earlyReflectionsMix: 0.0
  })
});

function resetEffectFamily(id) {
  const defaults = MODULE_DEFAULTS[id];
  if (!defaults || !serverState || destroyed) return false;
  Object.assign(localParameters, defaults);
  Object.assign(pendingPatch, defaults);
  renderParameters(localParameters);
  renderPresetState('custom');
  automaticPatchRetryBudget = 1;
  setStatus(`正在恢复${FAMILIES.find((family) => family.id === id).label}默认值…`);
  schedulePatch();
  return true;
}
```

Give each reset button `data-mixer-family-reset`, an explicit Chinese `aria-label`, and keyboard focus. Do not create client-only preset data: validate that the server returns all 14 complete presets before enabling buttons.

- [ ] **Step 5: Update visuals normalization without duplicating DSP state**

Allow the visuals controller to receive and freeze all new scalar keys, but derive meters/spectrum only from existing telemetry/audio samples. Display enabled effect names in the chain summary; do not synthesize fake effect telemetry or perform DSP in the UI worker.

- [ ] **Step 6: Style the cards without adding selected green square borders**

In `web/styles.css`, reuse the existing translucent dark-green surface tokens, maintain system font rendering, give reset/collapse controls a visible focus ring, and use a neutral 1 px border. Do not add a solid green selected rectangle around cards or icons. At 1280×720 and 1920×1080, the effect grid must not overlap numeric inputs or the family toolbar.

- [ ] **Step 7: Run UI module, real-browser, and visuals probes**

Run:

```powershell
$env:TEMP='E:\FE_audio_tmp'; $env:TMP='E:\FE_audio_tmp'
node scripts/check-audio-mixer-ui-module.mjs
node scripts/check-audio-mixer-ui-browser.mjs
node scripts/check-audio-mixer-visuals-module.mjs
```

Expected: all PASS; every slider has a numeric input/help label, reset is one conflict-safe PATCH, and opening/using the panel never performs DSP on the UI thread.

- [ ] **Step 8: Commit the UI**

```powershell
git add web/audio-mixer-ui.js web/audio-mixer-visuals.js web/styles.css scripts/check-audio-mixer-ui-module.mjs scripts/check-audio-mixer-ui-browser.mjs scripts/check-audio-mixer-visuals-module.mjs
git commit -m "feat: add understandable dsp rack controls"
```

### Task 10: Spatial Presence, Distortion Safety, Seek Stress, and Production Verification

**Files:**
- Modify: `scripts/fixtures/native-audio-quality/fe_audio_quality_probe.cpp:620-1070`
- Modify: `native/rust-audio-upmix/tests/mixer.rs`
- Verify: `native/windows/build/fe-monster-xaudio2.dll`

**Interfaces:**
- Consumes: the completed ABI v2 chain, canonical geometry, adaptive OBR headroom, new presets, and final native limiter.
- Produces: measured 5.1/7.1 presence and quality gates against the exact production DLL.

- [ ] **Step 1: Add failing end-to-end spatial quality gates before final tuning**

Extend `RenderObjectRms` with a `bool broadband` argument. When true, generate frequencies `{125, 250, 500, 1000, 2000, 4000, 8000}` Hz with weights `{1.0, 0.70710678, 0.5, 0.35355339, 0.25, 0.17677670, 0.125}`, scale their sum by `0.04`, and advance phase continuously across blocks; when false, retain the 997 Hz path. Add `minimum_gain_` tracking plus `float MinimumGain() const` to `LinkedSafetyLimiter`, and add `double minimum_limiter_gain = 1.0` to `RenderResult`.

Then render the broadband signal through every non-LFE official 5.1 and 7.1 object and add these exact calculations/assertions in `main`:

```cpp
std::vector<double> object_rms;
for (uint32_t channels : {6u, 8u}) {
    const auto layout = OfficialObrPositions(channels);
    for (uint32_t channel = 0; channel < channels; ++channel) {
        if (channel == 3) continue;
        object_rms.push_back(RenderObjectRms(layout[channel], true));
    }
}
const auto [minimum_rms, maximum_rms] = std::minmax_element(
    object_rms.begin(), object_rms.end()
);
Require(*minimum_rms > 1.0e-12, "OBR object RMS must be nonzero");
const double spread_db = 20.0 * std::log10(*maximum_rms / *minimum_rms);
const double obr_loudness_delta_db = 20.0 * std::log10(obr_to_dry_rms);
Require(spread_db <= 2.0, "front/side/rear broadband RMS spread must be <= 2 dB");
Require(obr_loudness_delta_db >= -1.5, "OBR route too quiet");
Require(obr_loudness_delta_db <= 1.5, "OBR route too loud");
Require(std::abs(front_rear_signature_correlation) < 0.95,
    "front and rear binaural signatures are not directionally distinct");
Require(coherent_51_full_scale.hard_clip_samples == 0, "5.1 coherent hard clips");
Require(coherent_full_scale.hard_clip_samples == 0, "7.1 coherent hard clips");
Require(mastered_programme.minimum_limiter_gain >= std::pow(10.0, -0.10 / 20.0),
    "surround preset drives the emergency limiter on ordinary material");
```

Add the measured values to the probe JSON. LFE is excluded from the 2 dB HRTF spread but included in coherent-peak safety. The Task 1 source contract remains the high-frequency gate: no `X3dDirectLpfOnePoleAlpha(spatial.lpf_direct)` call may exist in the OBR object-input loop.

- [ ] **Step 2: Run the quality probe and record the first failing metric**

Run the quality command from Task 1.

Expected: FAIL to compile until the new `RenderObjectRms(position, broadband)` signature and limiter minimum-gain telemetry are implemented. After compilation, any threshold failure prints its metric so calibration targets the first nonlinear or attenuated node.

- [ ] **Step 3: Apply only bounded route calibration**

First implement the measurement additions without changing the audio path:

```cpp
void LinkedSafetyLimiter::Process(float* left, float* right) {
    const float peak = std::max(std::abs(*left), std::abs(*right));
    const float desired = peak > kObrCeiling ? kObrCeiling / peak : 1.0f;
    if (desired < gain_) gain_ = desired;
    else {
        const float release = std::exp(-3.0f / (kSampleRate * 0.050f));
        gain_ = release * gain_ + (1.0f - release) * desired;
    }
    minimum_gain_ = std::min(minimum_gain_, gain_);
    *left *= gain_;
    *right *= gain_;
}

float LinkedSafetyLimiter::MinimumGain() const { return minimum_gain_; }
```

Declare `float minimum_gain_ = 1.0f;`, and set `result.minimum_limiter_gain = safety_limiter.MinimumGain()` before each `RenderTone` return. The broadband branch in `RenderObjectRms` uses the seven frequencies/weights from Step 1 and accumulates both OBR output ears after the existing warmup.

Keep `surround-3d` at standard geometry/width and zero fixed input cut. Retain `SpatialObrBlockInputHeadroom` with instantaneous attack and `0.25 s` release for coherent overloads. Use the existing constants:

```cpp
kSpatialUpmixStereoFoldCalibration = 1.25f;
kSpatialMatrixDecodeStereoFoldCalibration = 1.75f;
kSpatialObrUpmixRouteCalibration = 0.90f;
kSpatialObrStereoRouteCalibration = 0.99f;
kSpatialObrMatrixDecodeMakeup = 1.33f;
kSpatialObrAggregateInputCeiling = 0.80f;
```

Do not increase rear-channel gain beyond `1.0`, do not restore artificial distance tiers, and do not hard-clamp router/Mixer samples. If the printed first-overload telemetry is already above `1.0` before OBR, preserve its floating headroom and let adaptive OBR/final linked safety manage the aggregate; a non-finite value instead fails the test and requires resetting the responsible module state.

- [ ] **Step 4: Add final DSP quality and fail-open cases**

Add this helper to `tests/mixer.rs`:

```rust
fn rms(values: &[f32]) -> f32 {
    (values.iter().map(|value| value * value).sum::<f32>()
        / values.len().max(1) as f32).sqrt()
}
```

For every shipped effect preset ID `8..=13`, obtain its exact `FeRustMixerParams` twice. Stage the shipped snapshot unchanged on the effect handle. For the comparison handle, preserve every pre-existing Mixer field—including compressor, FDN reverb, output gain, limiter, and all routing values—but set only the five new `*_enabled` fields to `0` and their five mix fields to `0.0`. This control-equivalent baseline is essential for `immersive-live`, whose old FDN reverb is intentionally enabled; a generic clean handle is not a valid LFE baseline.

Using fresh effect and control-equivalent handles for each case, render identical copies of two seconds of silence, a `0.1` impulse, a `0.1` sine, and deterministic pink-weighted multitone with peak no greater than `0.1`, in blocks no larger than `max_frames_per_call`, and repeat for 2/6/8 channels. Assert through status/telemetry that downstream linked limiting remained inactive on both paths before making exact protected-LFE comparisons. Define `lfe_baseline` from the comparison handle's rendered output, not from the unprocessed input. For the impulse tail, define `first_tail` as samples in seconds `0.5..1.0` and `last_tail` as samples in seconds `1.5..2.0`. Assert:

```rust
assert!(output.iter().all(|sample| sample.is_finite()));
assert!(peak(&output) <= 1.0 + 1.0e-6);
assert!(rms(last_tail) <= rms(first_tail) + 1.0e-7);
if channels >= 6 {
    assert_eq!(channel_samples(&output, channels, 3), lfe_baseline);
}
```

Inject `NaN` through staged parameters and verify the whole revision is rejected while the previous active revision continues. Inject non-finite PCM and verify boundary sanitation plus uninterrupted processing.

- [ ] **Step 5: Rebuild and run the complete production verification matrix**

Run in this order:

```powershell
$env:TEMP='E:\FE_audio_tmp'; $env:TMP='E:\FE_audio_tmp'
$env:CARGO_HOME='E:\FE moster\.tools\cargo'; $env:RUSTUP_HOME='E:\FE moster\.tools\rustup'
$env:CARGO_TARGET_DIR='E:\FE moster\native\rust-audio-upmix\target'
& 'E:\FE moster\.tools\cargo\bin\cargo.exe' test --manifest-path native/rust-audio-upmix/Cargo.toml --release --locked --offline
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-xaudio2.ps1 -ObrSourceDir 'E:\FE moster\.tmp\google-obr-native-478dc7c752d5'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-native-audio-quality.ps1 -ObrSourceDir 'E:\FE moster\.tmp\google-obr-native-478dc7c752d5'
node scripts/check-audio-mixer-service.mjs
node scripts/check-audio-mixer-ui-module.mjs
node scripts/check-audio-mixer-ui-browser.mjs
node scripts/check-audio-mixer-visuals-module.mjs
node scripts/check-audio-channel-controls.mjs
node scripts/check-audio-spatial-controls-contract.mjs
node scripts/check-native-audio-chain-mode-contract.mjs
node scripts/check-native-spatial-audio-pipeline.mjs
node scripts/check-native-spatial-seek-continuity.mjs
node scripts/check-native-spatial-seek-stress.mjs
node scripts/check-native-spatial-buffer-recycle.mjs
node scripts/check-audio-realtime-performance.mjs
node scripts/check-deep-realtime-performance.mjs
```

Expected: every command PASS against the newly built production DLL; rapid forward/backward seek has zero dropout, click, non-finite sample, buffer exhaustion, or audio/UI deadlock.

- [ ] **Step 6: Inspect the production binary and persisted compatibility one final time**

Verify the production DLL is newer than its Rust static dependency, reports Mixer ABI `2`, rejects a v1 DLL through the host check, and fails open to dry playback. Launch the Java probe with a copied real v1 state, confirm all old values survive, then reopen and confirm the rewritten v2 document is stable and not rewritten again.

- [ ] **Step 7: Commit final quality gates and calibration**

```powershell
git add scripts/fixtures/native-audio-quality/fe_audio_quality_probe.cpp native/rust-audio-upmix/tests/mixer.rs native/windows/audio/fe_audio_spatial_layout.h native/windows/audio/fe_audio_pipeline.cpp
git commit -m "test: lock spatial dsp production quality"
```

## Self-Review Record

- Spec sections 1–4 are covered by Global Constraints and Tasks 1, 6, 7, and 10.
- All five real DSP algorithms, their exact bounds, LFE/centre/pair routing, smoothing, reset, and failure isolation are covered by Tasks 2–6.
- Canonical 5.1/7.1 geometry, bounded width, OBR Direct defaults, removed OBR-bed low-pass, presence, loudness, direction, and coherent safety are covered by Tasks 1, 8, and 10.
- ABI versioning, exact size/offsets, host mismatch behavior, JNI mapping, persisted v1 migration, server-authoritative presets, and UI completeness are covered by Tasks 2 and 7–9.
- Allocation/lock/file/log restrictions, seek reset, high-rate/multichannel coverage, production build, and full stress validation are covered by Tasks 3–7 and 10.
- Out-of-scope mobile, plugin hosting, proprietary decoders, fake head tracking, IR marketplace, and physical speaker configuration remain excluded.
- Type/name audit: `EffectControlParameters -> EffectsDerivedParameters -> EffectFrameParameters -> EffectsRack::process_frame` is consistent across Tasks 3–6; C snake_case fields map once to Java camelCase keys and fixed indices in Tasks 2, 7, and 8.
