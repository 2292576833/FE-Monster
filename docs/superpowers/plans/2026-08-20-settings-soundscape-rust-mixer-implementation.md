# Settings Center, Soundscape, and Rust Mixer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved settings-center redesign, reliable “音域回响” interactions and persistence, and a production Rust mixer inserted between upmix and Google OBR without breaking browser fallback playback.

**Architecture:** Existing DOM controls and player state remain authoritative. A narrow settings-center controller changes only presentation and focus; the soundscape host extends its nonce-validated sandbox bridge; the existing Rust upmix DLL gains a separate Mixer ABI whose validated snapshots are owned by a Java `AudioMixerService` and processed by the C++ audio pipeline before OBR.

**Tech Stack:** HTML/CSS/vanilla JavaScript, Edge/CDP browser probes, Java 17/JDK HttpServer, JNI/C++20/XAudio2/Google OBR/X3DAudio, Rust cdylib/OxiMedia, PowerShell packaging.

**Spec:** `docs/superpowers/specs/2026-08-20-settings-soundscape-rust-mixer-design.md`

## Global Constraints

- Do not rewrite the player or create a second settings state store.
- Keep browser dry audio as the failure fallback and report when the native mixer is bypassed.
- Do not modify minified Wallpaper Engine source assets; extensions live in the host runtime and sandbox bridge.
- Preserve Rust upmix ABI v1; Mixer uses new versioned exports and bounded, allocation-free processing after construction.
- Visual animation uses `requestAnimationFrame`/display cadence with `framePacing: "vrr-driver-managed"` and no fixed FPS cap; never claim the app enables FreeSync/G-SYNC.
- Preserve all unrelated dirty-worktree changes; stage or commit only explicitly owned files if a commit is made.
- Use behavior-level RED→GREEN tests and keep cache/install manifests fail-closed.

---

### Task 1: Settings center, playback-surface controls, and text parameter readiness

**Files:**
- Create: `web/settings-center.js`
- Modify: `web/index.html`
- Modify: `web/styles.css`
- Modify: `web/app.js`
- Test: `scripts/check-settings-center-browser.mjs`
- Test: `scripts/check-text-preset-parameters-browser.mjs`
- Test: `scripts/check-playback-tool-auto-straighten.mjs`

**Interfaces:**
- Produces `window.FeSettingsCenter.{registerPage,open,select,close,snapshot}`.
- Keeps `runtimeSettingsButton`, `runtimeSettingsPanel`, existing control IDs, and existing persistence/event handlers compatible.

- [ ] Add a real-browser RED that clicks the playback-bar settings icon, verifies the old top-bar entry is absent, dialog semantics/focus/Escape work, seven navigation pages switch correctly, and 390×844/1280×800/1920×1080 layouts do not overflow.
- [ ] Add a real-browser RED that enters “文字” through `#qishuiPlaybackTools`, starts from a persisted non-book-scene `textPreset=book`, and verifies the text fieldset becomes visible and editable after font/control synchronization.
- [ ] Implement the focused settings controller with no ownership of business values; move existing control DOM into registered pages without changing IDs or listeners.
- [ ] Move `runtimeSettingsButton` to the playback surface as a white icon-only button; remove visible button/tool tray containers while retaining at least 40×40 hit targets, keyboard focus, ARIA labels, active state, and the existing 10°→0° straighten behavior.
- [ ] Implement the approved dark emerald-to-black dialog styling with stable system-font rendering and no text transforms/blur.
- [ ] Run the two new probes plus `check-playback-tool-auto-straighten`, `check-cursor-slider-settings`, `check-client-ai-vendor-ui`, and `node --check` on modified scripts.

### Task 2: Soundscape runtime recovery, gestures, controller interaction, and VRR pacing

**Files:**
- Modify: `web/soundscape-runtime.js`
- Modify: `web/assets/soundscape-workshop/bridge.js`
- Modify: `web/app.js`
- Modify: `web/styles.css`
- Test: `scripts/check-soundscape-workshop-runtime.mjs`
- Test: `scripts/check-sonic-topography-wallpaper-engine-preset.mjs`
- Test: `scripts/check-soundscape-interactions-browser.mjs`

**Interfaces:**
- Extends `fe-soundscape:v1` with nonce-validated `gesture`, `player-intent`, health, and recovery messages.
- Browser app remains the sole authority for text transforms and playback commands.

- [ ] Add a RED for version-2 requested/effective parameters, safe startup at the last-known-safe grid, staged recovery of 640/1080/4096 only after ready/first-frame/heartbeat, and explained rollback on health failure.
- [ ] Add an OOPIF browser RED for pointer drag/rotate/scale, blank-space double-click recenter, 360ms controller drag, progress seek, and throttled wheel previous/next while excluding interactive child elements.
- [ ] Implement versioned persistence without losing the requested high-impact grid; keep all 26 ordinary parameters exact across reload.
- [ ] Add strictly validated/normalized iframe input messages and coalesce pointer motion to one rAF; route them into existing text and player command state machines.
- [ ] Remove the global 16ms `setInterval` clamp and replace only visible high-frequency work with rAF/delta-time scheduling; retain bounded nonvisual polling.
- [ ] Ensure the runtime cannot remain indefinitely “加载中”: expose bounded retry/failure state and restore the prior usable scene on terminal failure.
- [ ] Run both existing soundscape suites and the new interaction probe in a real browser, including canvas non-black/ready and AMD/NVIDIA-neutral `fps:0` diagnostics.

### Task 3: Rust Mixer ABI and DSP core

**Files:**
- Create: `native/rust-audio-upmix/include/fe_rust_mixer.h`
- Modify: `native/rust-audio-upmix/src/lib.rs`
- Modify: `native/rust-audio-upmix/Cargo.toml`
- Create: `native/rust-audio-upmix/tests/mixer.rs`
- Create: `native/rust-audio-upmix/examples/mixer_allocation_probe.rs`

**Interfaces:**
- Produces versioned `fe_rust_mixer_*` exports specified in the design while preserving every `fe_rust_upmix_*` v1 export.
- Consumes interleaved finite PCM with 2, 6, or 8 channels and processes in place.

- [ ] Add RED tests for ABI version/struct sizes, 2/6/8 channels, invalid ranges, NaN/Infinity, revision staging/commit, ramped transitions, all eight complete presets, and reset/destroy safety.
- [ ] Implement immutable validated parameter snapshots, control-thread staging/commit, and an audio-thread state that performs no allocation or locking in `process`.
- [ ] Implement input/output gain, balance, ten-band EQ, width/channel gains, compressor, limiter, and bounded reverb in the approved order; sanitize non-finite samples and enforce the limiter ceiling.
- [ ] Add response/impulse tests proving EQ, dynamics, and reverb have observable effects without relying on implementation-private values.
- [ ] Run `cargo fmt --check`, `cargo test`, release build, existing allocation probe, and the new repeated-processing allocation probe.

### Task 4: Native pipeline insertion and Java mixer authority

**Files:**
- Modify: `native/windows/audio/fe_audio_pipeline.cpp`
- Modify: `native/windows/audio/fe_audio_pipeline.h`
- Modify: `native/windows/audio/fe_audio_probe.cpp`
- Modify: `native/windows/fe_monster_xaudio2.cpp`
- Modify: `src/main/java/com/femonster/core/NativeAudioEngine.java`
- Create: `src/main/java/com/femonster/core/AudioMixerService.java`
- Modify: `src/main/java/com/femonster/core/AppContext.java`
- Modify: `src/main/java/com/femonster/api/ApiRoutes.java`
- Create: `src/test/java/com/femonster/core/AudioMixerServiceProbe.java`
- Test: `scripts/check-native-spatial-audio-pipeline.mjs`
- Test: `scripts/check-audio-mixer-service.mjs`

**Interfaces:**
- Consumes the Task 3 Mixer ABI.
- Produces local-only `GET/PATCH /api/audio/mixer`, `GET /api/audio/mixer/presets`, and `POST /api/audio/mixer/presets/{id}/apply` with revision conflict handling.

- [ ] Add a native RED that records `upmix < mixer < OBR`, verifies C++ virtual-upmix fallback still reaches Mixer, and verifies Mixer failure bypasses only Mixer while audio reaches OBR/XAudio2.
- [ ] Load and validate the Mixer ABI separately from upmix v1; create/reset/destroy it with the pipeline and process every valid OBR block between upmix and OBR input.
- [ ] Add counters/status for active, bypass reason, process failures, revisions, upmix and OBR; never expose a native path supplied by the browser.
- [ ] Add a Java RED for default “纯净”, all eight presets, field validation, optimistic revision conflict, atomic restart restore, corrupt-state fail-closed evidence, and native-unavailable reporting.
- [ ] Implement `AudioMixerService` as the only persisted parameter authority and add same-origin/loopback guarded routes with stable errors.
- [ ] Run native probes/build, Java build, new service probe, existing spatial HTTP/realtime performance checks, and syntax/diff checks.

### Task 5: Mixer settings page, release resources, and end-to-end verification

**Files:**
- Modify: `web/settings-center.js`
- Modify: `web/index.html`
- Modify: `web/styles.css`
- Modify: `web/app.js`
- Modify: `web/cache-fingerprints.json`
- Modify: `scripts/build-installer.ps1`
- Modify: `scripts/install-fe-monster.ps1`
- Modify: `scripts/check-windows-installer-contract.ps1`
- Modify: `scripts/check-final-installer-isolated-install.ps1`
- Test: `scripts/check-audio-mixer-ui-browser.mjs`

**Interfaces:**
- Consumes Task 4 mixer endpoints and Task 1 settings-page registration.
- Produces a complete “调音台” settings page with honest native-chain status and accessible controls.

- [ ] Add a browser RED for the eight presets, every parameter family, preset→custom transition, revision conflict refresh, native bypass state, keyboard operation, and responsive layout.
- [ ] Bind controls to the existing endpoint authority with bounded debounced PATCH, latest-revision ordering, and visible errors; do not run DSP in JavaScript.
- [ ] Add all new scripts/assets to cache and installer critical-resource contracts, bump every changed resource token, run fingerprint `--write`, then run the normal check.
- [ ] Run fresh full verification: Rust tests/release build, native probes/build, Java build, settings/text/soundscape/mixer browser probes, existing playback/client-AI/pet/browser regressions, Windows installer source contract, and `git diff --check`.
- [ ] Record any environmental-only limitation separately; do not call the feature complete if a product or required test remains red.
