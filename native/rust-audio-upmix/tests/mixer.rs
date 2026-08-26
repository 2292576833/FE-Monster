use fe_monster_upmix::*;
use std::sync::{Arc, Barrier};
use std::thread;

struct Handle(*mut std::ffi::c_void);

impl Handle {
    fn new(max_frames: u32) -> Self {
        let config = FeRustMixerConfig {
            max_frames_per_call: max_frames,
            ..Default::default()
        };
        let raw = unsafe { fe_rust_mixer_create(&config) };
        assert!(!raw.is_null());
        Self(raw)
    }
    fn apply(&self, revision: u64, params: &FeRustMixerParams, ramp: u32) {
        assert_eq!(
            unsafe { fe_rust_mixer_stage_params(self.0, revision, params) },
            FE_RUST_MIXER_OK
        );
        assert_eq!(
            unsafe { fe_rust_mixer_commit(self.0, revision, ramp) },
            FE_RUST_MIXER_OK
        );
    }
    fn process(&self, pcm: &mut [f32], channels: u32) -> i32 {
        unsafe {
            fe_rust_mixer_process(
                self.0,
                pcm.as_mut_ptr(),
                (pcm.len() / channels as usize) as u32,
                channels,
            )
        }
    }
}

impl Drop for Handle {
    fn drop(&mut self) {
        unsafe { fe_rust_mixer_destroy(self.0) }
    }
}

fn peak(values: &[f32]) -> f32 {
    values.iter().fold(0.0_f32, |m, x| m.max(x.abs()))
}

fn sine(frames: usize, channels: usize, frequency: f32, amplitude: f32) -> Vec<f32> {
    let mut result = vec![0.0; frames * channels];
    for frame in 0..frames {
        let sample =
            (frame as f32 * frequency * std::f32::consts::TAU / 48_000.0).sin() * amplitude;
        result[frame * channels..(frame + 1) * channels].fill(sample);
    }
    result
}

fn channel_samples(pcm: &[f32], channels: usize, channel: usize) -> Vec<f32> {
    pcm.chunks_exact(channels)
        .map(|frame| frame[channel])
        .collect()
}

fn process_in_blocks(handle: &Handle, pcm: &mut [f32], channels: usize, max_frames: usize) {
    for block in pcm.chunks_mut(max_frames * channels) {
        assert_eq!(handle.process(block, channels as u32), FE_RUST_MIXER_OK);
    }
}

#[test]
fn mixer_v2_layout_and_legacy_upmix_v1_are_stable() {
    assert_eq!(fe_rust_mixer_abi_version(), 2);
    assert_eq!(FE_RUST_MIXER_BUSY, -5);
    assert_eq!(fe_rust_upmix_abi_version(), 1);
    assert_eq!(size_of::<FeRustMixerConfig>(), 32);
    assert_eq!(size_of::<FeRustMixerParams>(), 296);
    assert_eq!(std::mem::offset_of!(FeRustMixerParams, reserved), 148);
    assert_eq!(std::mem::offset_of!(FeRustMixerParams, chorus_enabled), 180);
    assert_eq!(
        std::mem::offset_of!(FeRustMixerParams, flanger_enabled),
        204
    );
    assert_eq!(std::mem::offset_of!(FeRustMixerParams, phaser_enabled), 228);
    assert_eq!(std::mem::offset_of!(FeRustMixerParams, delay_enabled), 252);
    assert_eq!(
        std::mem::offset_of!(FeRustMixerParams, early_reflections_enabled),
        276
    );
    assert_eq!(
        std::mem::offset_of!(FeRustMixerParams, early_reflections_mix),
        292
    );
    assert_eq!(size_of::<FeRustMixerStatus>(), 64);
    let mut config = FeRustMixerConfig::default();
    config.struct_size -= 1;
    assert!(unsafe { fe_rust_mixer_create(&config) }.is_null());
    config = FeRustMixerConfig::default();
    config.abi_version += 1;
    assert!(unsafe { fe_rust_mixer_create(&config) }.is_null());
    config = FeRustMixerConfig::default();
    config.reserved[0] = 1;
    assert!(unsafe { fe_rust_mixer_create(&config) }.is_null());

    let upmix = FeRustUpmixConfig {
        struct_size: size_of::<FeRustUpmixConfig>() as u32,
        abi_version: 1,
        sample_rate: 48_000,
        output_channels: 6,
        algorithm: 1,
        center_width_hz: 300.0,
        lfe_crossover_hz: 120.0,
        lfe_gain: 0.707,
        center_gain: 0.707,
        surround_gain: 0.5,
        decorrelation_amount: 0.7,
    };
    let upmix_handle = unsafe { fe_rust_upmix_create(&upmix) };
    assert!(!upmix_handle.is_null());
    let input = [0.25_f32, -0.2, 0.1, 0.15];
    let mut output = [0.0_f32; 12];
    assert_eq!(
        unsafe { fe_rust_upmix_process(upmix_handle, input.as_ptr(), 2, output.as_mut_ptr(), 12) },
        0
    );
    assert!(output.iter().all(|sample| sample.is_finite()));
    assert_eq!(unsafe { fe_rust_upmix_reset(upmix_handle) }, 0);
    unsafe { fe_rust_upmix_destroy(upmix_handle) };
}

#[test]
fn config_bounds_accept_endpoints_and_reject_neighbors() {
    for sample_rate in [16_000, 192_000] {
        for max_frames_per_call in [1, 65_536] {
            let config = FeRustMixerConfig {
                sample_rate,
                max_frames_per_call,
                ..Default::default()
            };
            let handle = unsafe { fe_rust_mixer_create(&config) };
            assert!(!handle.is_null());
            unsafe { fe_rust_mixer_destroy(handle) };
        }
    }
    for sample_rate in [15_999, 192_001] {
        let config = FeRustMixerConfig {
            sample_rate,
            ..Default::default()
        };
        assert!(unsafe { fe_rust_mixer_create(&config) }.is_null());
    }
    for max_frames_per_call in [0, 65_537] {
        let config = FeRustMixerConfig {
            max_frames_per_call,
            ..Default::default()
        };
        assert!(unsafe { fe_rust_mixer_create(&config) }.is_null());
    }
}

#[test]
fn supports_two_six_eight_channels_and_rejects_other_counts() {
    let handle = Handle::new(128);
    for channels in [2, 6, 8] {
        let mut pcm = sine(128, channels, 440.0, 0.2);
        assert_eq!(handle.process(&mut pcm, channels as u32), 0);
        assert!(pcm.iter().all(|x| x.is_finite()));
    }
    for channels in [1, 3, 4, 5, 7, 9] {
        let mut pcm = vec![0.0; 128 * channels];
        assert_eq!(
            handle.process(&mut pcm, channels as u32),
            FE_RUST_MIXER_INVALID_ARGUMENT
        );
    }
    assert_eq!(
        unsafe { fe_rust_mixer_process(handle.0, std::ptr::null_mut(), 1, 2) },
        FE_RUST_MIXER_INVALID_ARGUMENT
    );
}

#[test]
fn silence_impulse_sine_and_non_finite_samples_are_safe() {
    let handle = Handle::new(512);
    let mut silence = vec![0.0; 1024];
    assert_eq!(handle.process(&mut silence, 2), 0);
    assert_eq!(peak(&silence), 0.0);
    let mut impulse = vec![0.0; 1024];
    impulse[0] = 0.5;
    impulse[1] = -0.5;
    assert_eq!(handle.process(&mut impulse, 2), 0);
    assert!(peak(&impulse) > 0.1);
    let mut tone = sine(512, 2, 997.0, 0.25);
    tone[3] = f32::NAN;
    tone[7] = f32::INFINITY;
    tone[11] = f32::NEG_INFINITY;
    assert_eq!(handle.process(&mut tone, 2), 0);
    assert!(
        tone.iter()
            .all(|x| x.is_finite() && (-1.0..=1.0).contains(x))
    );
}

#[test]
fn every_parameter_family_rejects_out_of_range_without_commit() {
    let handle = Handle::new(64);
    let valid = FeRustMixerParams::default();
    handle.apply(1, &valid, 0);
    let mut revision = 2;
    let mut rejects = |p: FeRustMixerParams| {
        assert_eq!(
            unsafe { fe_rust_mixer_stage_params(handle.0, revision, &p) },
            FE_RUST_MIXER_INVALID_ARGUMENT
        );
        revision += 1;
    };
    macro_rules! bad {
        ($field:ident, $value:expr) => {{
            let mut p = valid;
            p.$field = $value;
            rejects(p);
        }};
    }
    macro_rules! bad_range_and_non_finite {
        ($field:ident, $below:expr, $above:expr) => {{
            bad!($field, $below);
            bad!($field, $above);
            bad!($field, f32::NAN);
            bad!($field, f32::INFINITY);
            bad!($field, f32::NEG_INFINITY);
        }};
    }
    bad!(enabled, 2);
    bad!(compressor_enabled, 2);
    bad!(limiter_enabled, 2);
    bad!(reverb_enabled, 2);
    bad!(chorus_enabled, 2);
    bad!(flanger_enabled, 2);
    bad!(phaser_enabled, 2);
    bad!(delay_enabled, 2);
    bad!(early_reflections_enabled, 2);
    bad!(input_gain_db, -24.01);
    bad!(output_gain_db, 24.01);
    bad!(balance, 1.01);
    let mut p = valid;
    p.eq_db[0] = -12.01;
    rejects(p);
    let mut p = valid;
    p.eq_db[9] = 12.01;
    rejects(p);
    bad!(stereo_width, 2.01);
    bad!(center_gain, -0.01);
    bad!(surround_gain, 2.01);
    bad!(lfe_gain, f32::NAN);
    bad!(compressor_threshold_db, -60.01);
    bad!(compressor_ratio, 20.01);
    bad!(compressor_attack_ms, 0.09);
    bad!(compressor_release_ms, 2000.1);
    bad!(compressor_knee_db, 24.01);
    bad!(compressor_makeup_db, -0.01);
    bad!(limiter_ceiling_db, 0.01);
    bad!(limiter_release_ms, 1000.1);
    bad!(reverb_room_size, 1.01);
    bad!(reverb_decay_ms, 49.9);
    bad!(reverb_damping, -0.01);
    bad!(reverb_pre_delay_ms, 200.1);
    bad!(reverb_wet, 1.01);
    bad!(reverb_dry, f32::INFINITY);
    bad_range_and_non_finite!(chorus_rate_hz, 0.049, 5.001);
    bad_range_and_non_finite!(chorus_depth, -0.01, 1.01);
    bad_range_and_non_finite!(chorus_center_delay_ms, 3.99, 30.01);
    bad_range_and_non_finite!(chorus_feedback, -0.96, 0.96);
    bad_range_and_non_finite!(chorus_mix, -0.01, 1.01);
    bad_range_and_non_finite!(flanger_rate_hz, 0.019, 5.001);
    bad_range_and_non_finite!(flanger_depth, -0.01, 1.01);
    bad_range_and_non_finite!(flanger_center_delay_ms, 0.19, 10.01);
    bad_range_and_non_finite!(flanger_feedback, -0.96, 0.96);
    bad_range_and_non_finite!(flanger_mix, -0.01, 1.01);
    bad_range_and_non_finite!(phaser_rate_hz, 0.019, 10.01);
    bad_range_and_non_finite!(phaser_depth, -0.01, 1.01);
    bad_range_and_non_finite!(phaser_center_frequency_hz, 99.9, 4_000.1);
    bad_range_and_non_finite!(phaser_feedback, -0.96, 0.96);
    bad_range_and_non_finite!(phaser_mix, -0.01, 1.01);
    bad_range_and_non_finite!(delay_ms, 0.99, 1_000.1);
    bad_range_and_non_finite!(delay_feedback, -0.01, 0.91);
    bad_range_and_non_finite!(delay_ping_pong, -0.01, 1.01);
    bad_range_and_non_finite!(delay_damping_hz, 499.9, 20_000.1);
    bad_range_and_non_finite!(delay_mix, -0.01, 1.01);
    bad_range_and_non_finite!(early_reflections_room_size, -0.01, 1.01);
    bad_range_and_non_finite!(early_reflections_diffusion, -0.01, 1.01);
    bad_range_and_non_finite!(early_reflections_damping, -0.01, 1.01);
    bad_range_and_non_finite!(early_reflections_mix, -0.01, 0.51);
    let mut p = valid;
    p.struct_size -= 1;
    rejects(p);
    let mut p = valid;
    p.abi_version += 1;
    rejects(p);
    let mut p = valid;
    p.reserved[0] = 1;
    rejects(p);
    let mut status = FeRustMixerStatus::default();
    assert_eq!(
        unsafe { fe_rust_mixer_get_status(handle.0, &mut status) },
        0
    );
    assert_eq!(status.active_revision, 1);
    assert_eq!(status.staged_revision, 0);
}

#[test]
fn v2_effect_defaults_and_parameter_endpoints_are_stable() {
    let defaults = FeRustMixerParams::default();
    assert_eq!(defaults.chorus_enabled, 0);
    assert_eq!(defaults.chorus_rate_hz, 0.30);
    assert_eq!(defaults.chorus_depth, 0.35);
    assert_eq!(defaults.chorus_center_delay_ms, 18.0);
    assert_eq!(defaults.chorus_feedback, 0.0);
    assert_eq!(defaults.chorus_mix, 0.0);
    assert_eq!(defaults.flanger_enabled, 0);
    assert_eq!(defaults.flanger_rate_hz, 0.18);
    assert_eq!(defaults.flanger_depth, 0.50);
    assert_eq!(defaults.flanger_center_delay_ms, 1.5);
    assert_eq!(defaults.flanger_feedback, 0.35);
    assert_eq!(defaults.flanger_mix, 0.0);
    assert_eq!(defaults.phaser_enabled, 0);
    assert_eq!(defaults.phaser_rate_hz, 0.20);
    assert_eq!(defaults.phaser_depth, 0.50);
    assert_eq!(defaults.phaser_center_frequency_hz, 900.0);
    assert_eq!(defaults.phaser_feedback, 0.20);
    assert_eq!(defaults.phaser_mix, 0.0);
    assert_eq!(defaults.delay_enabled, 0);
    assert_eq!(defaults.delay_ms, 320.0);
    assert_eq!(defaults.delay_feedback, 0.30);
    assert_eq!(defaults.delay_ping_pong, 0.75);
    assert_eq!(defaults.delay_damping_hz, 8_000.0);
    assert_eq!(defaults.delay_mix, 0.0);
    assert_eq!(defaults.early_reflections_enabled, 0);
    assert_eq!(defaults.early_reflections_room_size, 0.35);
    assert_eq!(defaults.early_reflections_diffusion, 0.55);
    assert_eq!(defaults.early_reflections_damping, 0.45);
    assert_eq!(defaults.early_reflections_mix, 0.0);

    macro_rules! accepts_endpoints {
        ($field:ident, $minimum:expr, $maximum:expr) => {{
            for value in [$minimum, $maximum] {
                let handle = Handle::new(1);
                let mut params = defaults;
                params.$field = value;
                assert_eq!(
                    unsafe { fe_rust_mixer_stage_params(handle.0, 1, &params) },
                    FE_RUST_MIXER_OK,
                    "{} endpoint {value} should be accepted",
                    stringify!($field)
                );
            }
        }};
    }
    accepts_endpoints!(chorus_rate_hz, 0.05, 5.0);
    accepts_endpoints!(chorus_depth, 0.0, 1.0);
    accepts_endpoints!(chorus_center_delay_ms, 4.0, 30.0);
    accepts_endpoints!(chorus_feedback, -0.95, 0.95);
    accepts_endpoints!(chorus_mix, 0.0, 1.0);
    accepts_endpoints!(flanger_rate_hz, 0.02, 5.0);
    accepts_endpoints!(flanger_depth, 0.0, 1.0);
    accepts_endpoints!(flanger_center_delay_ms, 0.2, 10.0);
    accepts_endpoints!(flanger_feedback, -0.95, 0.95);
    accepts_endpoints!(flanger_mix, 0.0, 1.0);
    accepts_endpoints!(phaser_rate_hz, 0.02, 10.0);
    accepts_endpoints!(phaser_depth, 0.0, 1.0);
    accepts_endpoints!(phaser_center_frequency_hz, 100.0, 4_000.0);
    accepts_endpoints!(phaser_feedback, -0.95, 0.95);
    accepts_endpoints!(phaser_mix, 0.0, 1.0);
    accepts_endpoints!(delay_ms, 1.0, 1_000.0);
    accepts_endpoints!(delay_feedback, 0.0, 0.90);
    accepts_endpoints!(delay_ping_pong, 0.0, 1.0);
    accepts_endpoints!(delay_damping_hz, 500.0, 20_000.0);
    accepts_endpoints!(delay_mix, 0.0, 1.0);
    accepts_endpoints!(early_reflections_room_size, 0.0, 1.0);
    accepts_endpoints!(early_reflections_diffusion, 0.0, 1.0);
    accepts_endpoints!(early_reflections_damping, 0.0, 1.0);
    accepts_endpoints!(early_reflections_mix, 0.0, 0.5);
}

#[test]
fn staging_requires_matching_monotonic_commit_and_ramps_smoothly() {
    let handle = Handle::new(32);
    let mut low = FeRustMixerParams::default();
    low.limiter_enabled = 0;
    low.input_gain_db = -24.0;
    handle.apply(1, &low, 0);
    let mut high = low;
    high.input_gain_db = 12.0;
    assert_eq!(unsafe { fe_rust_mixer_stage_params(handle.0, 2, &high) }, 0);
    assert_eq!(
        unsafe { fe_rust_mixer_commit(handle.0, 3, 16) },
        FE_RUST_MIXER_INVALID_REVISION
    );
    let mut before = vec![0.25; 64];
    assert_eq!(handle.process(&mut before, 2), 0);
    assert!(peak(&before) < 0.04);
    assert_eq!(unsafe { fe_rust_mixer_commit(handle.0, 2, 16) }, 0);
    let mut ramp = vec![0.25; 64];
    assert_eq!(handle.process(&mut ramp, 2), 0);
    let left: Vec<_> = ramp.chunks_exact(2).map(|f| f[0]).collect();
    assert!(left.windows(2).all(|w| w[1] >= w[0] - 1.0e-5));
    assert!(left[0] < left[15] && left[15] < 1.0);
    assert_eq!(
        unsafe { fe_rust_mixer_stage_params(handle.0, 2, &low) },
        FE_RUST_MIXER_INVALID_REVISION
    );
}

#[test]
fn eq_compressor_limiter_and_reverb_are_observable() {
    let clean = Handle::new(4096);
    let mut reference = sine(4096, 2, 1_000.0, 0.08);
    assert_eq!(clean.process(&mut reference, 2), 0);
    let eq = Handle::new(4096);
    let mut boosted = FeRustMixerParams::default();
    boosted.eq_db[5] = 12.0;
    eq.apply(1, &boosted, 0);
    let mut eq_tone = sine(4096, 2, 1_000.0, 0.08);
    assert_eq!(eq.process(&mut eq_tone, 2), 0);
    assert!(peak(&eq_tone[2048..]) > peak(&reference[2048..]) * 2.0);

    let dynamics = Handle::new(4096);
    let mut p = FeRustMixerParams::default();
    p.limiter_enabled = 0;
    p.compressor_enabled = 1;
    p.compressor_threshold_db = -30.0;
    p.compressor_ratio = 20.0;
    p.compressor_attack_ms = 0.1;
    dynamics.apply(1, &p, 0);
    let mut loud = vec![0.8; 8192];
    assert_eq!(dynamics.process(&mut loud, 2), 0);
    assert!(peak(&loud[4096..]) < 0.2);

    let limiter = Handle::new(64);
    let mut p = FeRustMixerParams::default();
    p.input_gain_db = 24.0;
    p.limiter_ceiling_db = -6.0;
    limiter.apply(1, &p, 0);
    let mut hot = vec![0.9; 128];
    assert_eq!(limiter.process(&mut hot, 2), 0);
    assert!(peak(&hot) <= 10.0_f32.powf(-6.0 / 20.0) + 1.0e-5);

    let reverb = Handle::new(4096);
    let mut p = mixer_preset_params(2).unwrap();
    p.reverb_pre_delay_ms = 0.0;
    p.reverb_room_size = 0.0;
    reverb.apply(1, &p, 0);
    let mut impulse = vec![0.0; 8192];
    impulse[0] = 0.5;
    impulse[1] = 0.5;
    assert_eq!(reverb.process(&mut impulse, 2), 0);
    assert!(impulse[2000..].iter().any(|x| x.abs() > 1.0e-5));
}

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
    assert_eq!(
        channel_samples(&wet, 8, 3),
        channel_samples(&baseline, 8, 3)
    );
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
            let sample =
                ((absolute_frame + frame) as f32 * 440.0 * std::f32::consts::TAU / 48_000.0).sin()
                    * 0.2;
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

#[test]
fn effects_are_finite_distinct_and_keep_lfe_dry_at_every_supported_layout() {
    for channels in [2, 6, 8] {
        let input = sine(32_768, channels, 613.0, 0.18);
        let mut checksums = Vec::new();
        for module in 0..6 {
            let handle = Handle::new(256);
            let mut params = FeRustMixerParams::default();
            match module {
                0 => {
                    params.chorus_enabled = 1;
                    params.chorus_mix = 0.42;
                    params.chorus_feedback = 0.5;
                }
                1 => {
                    params.flanger_enabled = 1;
                    params.flanger_mix = 0.42;
                    params.flanger_feedback = 0.5;
                }
                2 => {
                    params.phaser_enabled = 1;
                    params.phaser_mix = 0.42;
                    params.phaser_feedback = 0.5;
                }
                3 => {
                    params.delay_enabled = 1;
                    params.delay_mix = 0.42;
                    params.delay_feedback = 0.9;
                }
                4 => {
                    params.early_reflections_enabled = 1;
                    params.early_reflections_mix = 0.5;
                }
                _ => {
                    params.chorus_enabled = 1;
                    params.chorus_mix = 0.42;
                    params.flanger_enabled = 1;
                    params.flanger_mix = 0.42;
                    params.phaser_enabled = 1;
                    params.phaser_mix = 0.42;
                    params.delay_enabled = 1;
                    params.delay_mix = 0.42;
                    params.delay_feedback = 0.9;
                    params.early_reflections_enabled = 1;
                    params.early_reflections_mix = 0.5;
                }
            }
            handle.apply(1, &params, 0);
            let mut output = input.clone();
            process_in_blocks(&handle, &mut output, channels, 256);
            assert!(output.iter().all(|sample| sample.is_finite()));
            if channels >= 6 {
                assert_eq!(
                    channel_samples(&output, channels, 3),
                    channel_samples(&input, channels, 3)
                );
            }
            checksums.push(output.iter().map(|sample| *sample as f64).sum::<f64>());
        }
        for (index, left) in checksums.iter().enumerate() {
            for right in &checksums[index + 1..] {
                assert!(
                    (left - right).abs() > 1.0e-4,
                    "channels={channels}, checksum collision"
                );
            }
        }

        let handle = Handle::new(256);
        let mut params = FeRustMixerParams::default();
        params.delay_enabled = 1;
        params.delay_ms = 1.0;
        params.delay_feedback = 0.9;
        params.delay_mix = 1.0;
        handle.apply(1, &params, 0);
        let mut impulse = vec![0.0; 256 * channels];
        impulse[0] = 0.5;
        impulse[1] = 0.5;
        process_in_blocks(&handle, &mut impulse, channels, 256);
        let mut tail = vec![0.0; 48_000 * channels];
        process_in_blocks(&handle, &mut tail, channels, 256);
        let early_peak = peak(&tail[..tail.len() / 2]);
        let late_peak = peak(&tail[tail.len() / 2..]);
        assert!(late_peak < early_peak.max(1.0e-6));
    }
}

fn maximum_feedback_effect_params(configuration: usize) -> FeRustMixerParams {
    let mut params = FeRustMixerParams::default();
    match configuration {
        0 => {
            params.chorus_enabled = 1;
            params.chorus_mix = 0.75;
            params.chorus_feedback = 0.95;
        }
        1 => {
            params.flanger_enabled = 1;
            params.flanger_mix = 0.75;
            params.flanger_feedback = 0.95;
        }
        2 => {
            params.phaser_enabled = 1;
            params.phaser_mix = 0.75;
            params.phaser_feedback = 0.95;
        }
        3 => {
            params.delay_enabled = 1;
            params.delay_ms = 1.0;
            params.delay_mix = 1.0;
            params.delay_feedback = 0.90;
        }
        4 => {
            params.early_reflections_enabled = 1;
            params.early_reflections_mix = 0.5;
        }
        5 => {
            params.chorus_enabled = 1;
            params.chorus_mix = 0.75;
            params.chorus_feedback = 0.95;
            params.flanger_enabled = 1;
            params.flanger_mix = 0.75;
            params.flanger_feedback = 0.95;
            params.phaser_enabled = 1;
            params.phaser_mix = 0.75;
            params.phaser_feedback = 0.95;
            params.delay_enabled = 1;
            params.delay_ms = 1.0;
            params.delay_mix = 1.0;
            params.delay_feedback = 0.90;
            params.early_reflections_enabled = 1;
            params.early_reflections_mix = 0.5;
        }
        _ => unreachable!("invalid effect configuration"),
    }
    params
}

#[test]
fn maximum_feedback_effect_tails_decay_through_mixer_ffi() {
    for channels in [2, 6, 8] {
        for configuration in 0..6 {
            let handle = Handle::new(256);
            handle.apply(1, &maximum_feedback_effect_params(configuration), 0);

            // Let the delay's click-free target transition settle before the
            // impulse, so each configuration is measured at its ABI value.
            let mut warmup = vec![0.0_f32; 1_024 * channels];
            process_in_blocks(&handle, &mut warmup, channels, 256);

            let mut excitation = vec![0.0_f32; 256 * channels];
            excitation[0] = 0.5;
            excitation[1] = -0.5;
            if channels >= 6 {
                excitation[3] = 0.1875;
            }
            let dry_lfe = if channels >= 6 {
                Some(channel_samples(&excitation, channels, 3))
            } else {
                None
            };
            process_in_blocks(&handle, &mut excitation, channels, 256);
            assert!(excitation.iter().all(|sample| sample.is_finite()));
            if let Some(dry_lfe) = dry_lfe {
                assert_eq!(channel_samples(&excitation, channels, 3), dry_lfe);
            }

            let mut tail = vec![0.0_f32; 48_000 * channels];
            process_in_blocks(&handle, &mut tail, channels, 256);
            assert!(tail.iter().all(|sample| sample.is_finite()));
            if channels >= 6 {
                assert_eq!(channel_samples(&tail, channels, 3), vec![0.0; 48_000]);
            }
            let early_peak = peak(&tail[..tail.len() / 2]);
            let late_peak = peak(&tail[tail.len() / 2..]);
            assert!(
                early_peak > 1.0e-5,
                "channels={channels}, configuration={configuration} has no tail"
            );
            assert!(
                late_peak < early_peak * 0.5,
                "channels={channels}, configuration={configuration}, early={early_peak}, late={late_peak}"
            );
        }
    }
}

#[test]
fn all_presets_are_complete_deterministic_valid_snapshots() {
    let handle = Handle::new(8);
    let mut snapshots = Vec::new();
    for id in 0..=13 {
        let first = mixer_preset_params(id).expect("preset");
        assert_eq!(first, mixer_preset_params(id).unwrap());
        assert_eq!(first.struct_size as usize, size_of::<FeRustMixerParams>());
        assert_eq!(first.abi_version, 2);
        assert_eq!(
            unsafe { fe_rust_mixer_stage_params(handle.0, id as u64 + 1, &first) },
            0
        );
        assert_eq!(
            unsafe { fe_rust_mixer_commit(handle.0, id as u64 + 1, 0) },
            0
        );
        snapshots.push(format!("{first:?}"));
    }
    snapshots.sort();
    snapshots.dedup();
    // surround-3d differs from clean only in Java-owned spatial fields; its
    // Mixer-stage Rust snapshot is intentionally the same unity control state.
    assert_eq!(snapshots.len(), 13);
    assert!(mixer_preset_params(14).is_none());
}

#[test]
fn reset_status_and_null_calls_are_safe() {
    assert_eq!(
        unsafe { fe_rust_mixer_reset(std::ptr::null_mut()) },
        FE_RUST_MIXER_INVALID_ARGUMENT
    );
    assert_eq!(
        unsafe { fe_rust_mixer_get_status(std::ptr::null(), std::ptr::null_mut()) },
        FE_RUST_MIXER_INVALID_ARGUMENT
    );
    unsafe { fe_rust_mixer_destroy(std::ptr::null_mut()) };
    let handle = Handle::new(64);
    let mut p = mixer_preset_params(2).unwrap();
    p.reverb_pre_delay_ms = 0.0;
    p.reverb_room_size = 0.0;
    handle.apply(1, &p, 0);
    let mut impulse = vec![0.0; 128];
    impulse[0] = 1.0;
    impulse[1] = 1.0;
    assert_eq!(handle.process(&mut impulse, 2), 0);
    assert_eq!(unsafe { fe_rust_mixer_reset(handle.0) }, 0);
    let mut status = FeRustMixerStatus::default();
    assert_eq!(
        unsafe { fe_rust_mixer_get_status(handle.0, &mut status) },
        0
    );
    assert_eq!(status.active_revision, 1);
    status.struct_size = 0;
    assert_eq!(
        unsafe { fe_rust_mixer_get_status(handle.0, &mut status) },
        FE_RUST_MIXER_INVALID_ARGUMENT
    );
}

#[test]
fn forward_compatible_larger_structs_are_accepted() {
    #[repr(C)]
    struct ExtendedConfig {
        base: FeRustMixerConfig,
        tail: [u8; 16],
    }
    #[repr(C)]
    struct ExtendedParams {
        base: FeRustMixerParams,
        tail: [u8; 16],
    }
    #[repr(C)]
    struct ExtendedStatus {
        base: FeRustMixerStatus,
        tail: [u8; 16],
    }
    let mut config = ExtendedConfig {
        base: FeRustMixerConfig::default(),
        tail: [0xA5; 16],
    };
    config.base.struct_size = size_of::<ExtendedConfig>() as u32;
    let raw = unsafe { fe_rust_mixer_create(&config.base) };
    assert!(!raw.is_null());
    let mut params = ExtendedParams {
        base: FeRustMixerParams::default(),
        tail: [0x5A; 16],
    };
    params.base.struct_size = size_of::<ExtendedParams>() as u32;
    assert_eq!(
        unsafe { fe_rust_mixer_stage_params(raw, 1, &params.base) },
        0
    );
    assert_eq!(unsafe { fe_rust_mixer_commit(raw, 1, 0) }, 0);
    let mut status = ExtendedStatus {
        base: FeRustMixerStatus::default(),
        tail: [0x3C; 16],
    };
    status.base.struct_size = size_of::<ExtendedStatus>() as u32;
    assert_eq!(
        unsafe { fe_rust_mixer_get_status(raw, &mut status.base) },
        0
    );
    assert_eq!(status.base.active_revision, 1);
    assert_eq!(status.tail, [0x3C; 16]);
    unsafe { fe_rust_mixer_destroy(raw) };
}

#[test]
fn all_numeric_bounds_accept_endpoints_and_reject_neighbors_and_nonfinite() {
    let handle = Handle::new(8);
    let base = FeRustMixerParams::default();
    let mut revision = 1_u64;
    macro_rules! float_bound {
        ($field:ident,$min:expr,$max:expr,$epsilon:expr) => {{
            for value in [$min, $max] {
                let mut p = base;
                p.$field = value;
                handle.apply(revision, &p, 0);
                revision += 1;
            }
            for value in [
                $min - $epsilon,
                $max + $epsilon,
                f32::NAN,
                f32::INFINITY,
                f32::NEG_INFINITY,
            ] {
                let mut p = base;
                p.$field = value;
                assert_eq!(
                    unsafe { fe_rust_mixer_stage_params(handle.0, revision, &p) },
                    FE_RUST_MIXER_INVALID_ARGUMENT,
                    stringify!($field)
                );
            }
        }};
    }
    for field in 0..4 {
        for value in [0_u32, 1_u32] {
            let mut p = base;
            match field {
                0 => p.enabled = value,
                1 => p.compressor_enabled = value,
                2 => p.limiter_enabled = value,
                _ => p.reverb_enabled = value,
            };
            handle.apply(revision, &p, 0);
            revision += 1;
        }
        for value in [2_u32, u32::MAX] {
            let mut p = base;
            match field {
                0 => p.enabled = value,
                1 => p.compressor_enabled = value,
                2 => p.limiter_enabled = value,
                _ => p.reverb_enabled = value,
            };
            assert_eq!(
                unsafe { fe_rust_mixer_stage_params(handle.0, revision, &p) },
                FE_RUST_MIXER_INVALID_ARGUMENT
            );
        }
    }
    float_bound!(input_gain_db, -24.0, 24.0, 0.01);
    float_bound!(output_gain_db, -24.0, 24.0, 0.01);
    float_bound!(balance, -1.0, 1.0, 0.01);
    for band in 0..10 {
        for value in [-12.0, 12.0] {
            let mut p = base;
            p.eq_db[band] = value;
            handle.apply(revision, &p, 0);
            revision += 1;
        }
        for value in [-12.01, 12.01, f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
            let mut p = base;
            p.eq_db[band] = value;
            assert_eq!(
                unsafe { fe_rust_mixer_stage_params(handle.0, revision, &p) },
                FE_RUST_MIXER_INVALID_ARGUMENT
            );
        }
    }
    float_bound!(stereo_width, 0.0, 2.0, 0.01);
    float_bound!(center_gain, 0.0, 2.0, 0.01);
    float_bound!(surround_gain, 0.0, 2.0, 0.01);
    float_bound!(lfe_gain, 0.0, 2.0, 0.01);
    float_bound!(compressor_threshold_db, -60.0, 0.0, 0.01);
    float_bound!(compressor_ratio, 1.0, 20.0, 0.01);
    float_bound!(compressor_attack_ms, 0.1, 200.0, 0.01);
    float_bound!(compressor_release_ms, 10.0, 2000.0, 0.1);
    float_bound!(compressor_knee_db, 0.0, 24.0, 0.01);
    float_bound!(compressor_makeup_db, 0.0, 24.0, 0.01);
    float_bound!(limiter_ceiling_db, -12.0, 0.0, 0.01);
    float_bound!(limiter_release_ms, 10.0, 1000.0, 0.1);
    float_bound!(reverb_room_size, 0.0, 1.0, 0.01);
    float_bound!(reverb_decay_ms, 50.0, 5000.0, 0.1);
    float_bound!(reverb_damping, 0.0, 1.0, 0.01);
    float_bound!(reverb_pre_delay_ms, 0.0, 200.0, 0.01);
    float_bound!(reverb_wet, 0.0, 1.0, 0.01);
    float_bound!(reverb_dry, 0.0, 1.0, 0.01);
}

#[test]
fn invalid_stage_preserves_active_output_and_status() {
    let handle = Handle::new(64);
    let mut active = FeRustMixerParams::default();
    active.limiter_enabled = 0;
    active.input_gain_db = -12.0;
    handle.apply(1, &active, 0);
    let input = vec![0.2; 128];
    let mut before = input.clone();
    assert_eq!(handle.process(&mut before, 2), 0);
    assert_eq!(unsafe { fe_rust_mixer_reset(handle.0) }, 0);
    let mut invalid = active;
    invalid.input_gain_db = f32::NAN;
    assert_eq!(
        unsafe { fe_rust_mixer_stage_params(handle.0, 2, &invalid) },
        FE_RUST_MIXER_INVALID_ARGUMENT
    );
    let mut after = input;
    assert_eq!(handle.process(&mut after, 2), 0);
    assert_eq!(before, after);
    let mut status = FeRustMixerStatus::default();
    assert_eq!(
        unsafe { fe_rust_mixer_get_status(handle.0, &mut status) },
        0
    );
    assert_eq!((status.active_revision, status.staged_revision), (1, 0));
}

#[test]
fn compressor_uses_standard_symmetric_soft_knee_transfer() {
    let mut p = FeRustMixerParams::default();
    p.compressor_ratio = 4.0;
    p.compressor_threshold_db = -20.0;
    p.compressor_knee_db = 10.0;
    let levels = [-30.0, -25.0, -22.5, -20.0, -17.5, -15.0, -10.0];
    let gains: Vec<_> = levels
        .into_iter()
        .map(|level| mixer_compressor_gain_for_db(&p, level).unwrap())
        .collect();
    assert!((gains[0] - 1.0).abs() < 1.0e-6 && (gains[1] - 1.0).abs() < 1.0e-6);
    assert!(gains[2] < 1.0);
    assert!(gains.windows(2).all(|w| w[1] <= w[0] + 1.0e-6));
    let expected_upper = 10.0_f32.powf(-3.75 / 20.0);
    assert!((gains[5] - expected_upper).abs() < 1.0e-6);
    p.compressor_ratio = 1.0;
    for level in [-80.0, -25.0, -20.0, -15.0, 6.0] {
        assert!((mixer_compressor_gain_for_db(&p, level).unwrap() - 1.0).abs() < 1.0e-6);
    }
}

#[test]
fn consecutive_compressor_ramps_start_from_the_previous_effective_curve() {
    let handle = Handle::new(64);
    let mut unity = FeRustMixerParams::default();
    unity.limiter_enabled = 0;
    unity.compressor_enabled = 1;
    unity.compressor_ratio = 1.0;
    unity.compressor_threshold_db = -30.0;
    unity.compressor_attack_ms = 0.1;
    handle.apply(1, &unity, 0);
    let mut warm = vec![0.8; 128];
    assert_eq!(handle.process(&mut warm, 2), 0);
    let mut strong = unity;
    strong.compressor_ratio = 20.0;
    handle.apply(2, &strong, 64);
    let mut compressed = vec![0.8; 128];
    assert_eq!(handle.process(&mut compressed, 2), 0);
    handle.apply(3, &unity, 64);
    let mut recovery = vec![0.8; 128];
    assert_eq!(handle.process(&mut recovery, 2), 0);
    let compressed_last = compressed[126];
    let recovery_first = recovery[0];
    let recovery_last = recovery[126];
    assert!(
        recovery_first <= compressed_last * 2.0,
        "{recovery_first} vs {compressed_last}"
    );
    assert!(
        recovery_last > recovery_first * 2.0,
        "{recovery_first} -> {recovery_last}"
    );
}

fn limiter_recovery(release_ms: f32) -> Vec<f32> {
    let handle = Handle::new(512);
    let mut p = FeRustMixerParams::default();
    p.limiter_ceiling_db = -6.0;
    p.limiter_release_ms = release_ms;
    handle.apply(1, &p, 0);
    let mut attack = vec![2.0; 128];
    assert_eq!(handle.process(&mut attack, 2), 0);
    let mut recovery = vec![1.0; 1024];
    assert_eq!(handle.process(&mut recovery, 2), 0);
    recovery.chunks_exact(2).map(|frame| frame[0]).collect()
}

#[test]
fn limiter_releases_toward_higher_desired_gain_while_still_over_ceiling() {
    let fast = limiter_recovery(10.0);
    let slow = limiter_recovery(1000.0);
    let ceiling = 10.0_f32.powf(-6.0 / 20.0);
    assert!(fast.last().unwrap() > &fast[0]);
    assert!(fast.last().unwrap() > slow.last().unwrap());
    assert!(
        fast.iter()
            .chain(&slow)
            .all(|sample| *sample <= ceiling + 1.0e-5)
    );
}

#[test]
fn barrier_serializes_duplicate_stage_against_commit() {
    let handle = Handle::new(8);
    let p = FeRustMixerParams::default();
    assert_eq!(unsafe { fe_rust_mixer_stage_params(handle.0, 1, &p) }, 0);
    let barrier = Arc::new(Barrier::new(3));
    let address = handle.0 as usize;
    let b = barrier.clone();
    let commit = thread::spawn(move || {
        b.wait();
        unsafe { fe_rust_mixer_commit(address as *mut _, 1, 0) }
    });
    let b = barrier.clone();
    let duplicate = thread::spawn(move || {
        b.wait();
        unsafe { fe_rust_mixer_stage_params(address as *mut _, 1, &p) }
    });
    barrier.wait();
    assert_eq!(commit.join().unwrap(), 0);
    assert_eq!(duplicate.join().unwrap(), FE_RUST_MIXER_INVALID_REVISION);
    let mut status = FeRustMixerStatus::default();
    assert_eq!(
        unsafe { fe_rust_mixer_get_status(handle.0, &mut status) },
        0
    );
    assert_eq!((status.active_revision, status.staged_revision), (1, 0));
}

#[test]
fn process_remains_bounded_during_concurrent_publication_stress() {
    let handle = Handle::new(64);
    let address = handle.0 as usize;
    let audio = thread::spawn(move || {
        let mut pcm = vec![0.1; 128];
        for _ in 0..2000 {
            assert_eq!(
                unsafe { fe_rust_mixer_process(address as *mut _, pcm.as_mut_ptr(), 64, 2) },
                0
            );
        }
    });
    for revision in 1..=200_u64 {
        let mut p = FeRustMixerParams::default();
        p.input_gain_db = (revision % 25) as f32 - 12.0;
        assert_eq!(
            unsafe { fe_rust_mixer_stage_params(handle.0, revision, &p) },
            0
        );
        assert_eq!(unsafe { fe_rust_mixer_commit(handle.0, revision, 64) }, 0);
    }
    audio.join().unwrap();
    let mut status = FeRustMixerStatus::default();
    assert_eq!(
        unsafe { fe_rust_mixer_get_status(handle.0, &mut status) },
        0
    );
    assert_eq!(status.active_revision, 200);
}

#[cfg(windows)]
#[test]
fn c_header_layout_probe_compiles_with_msvc() {
    use std::path::Path;
    use std::process::Command;
    let candidates = [
        r"E:\vsd\Common7\Tools\VsDevCmd.bat",
        r"C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat",
        r"C:\Program Files\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat",
    ];
    let devcmd = candidates
        .iter()
        .find(|path| Path::new(path).is_file())
        .expect("Visual Studio developer command script");
    let object = std::env::temp_dir().join("fe_rust_mixer_header_probe.obj");
    let command = format!(
        "call {devcmd} -arch=x64 >nul && cl /nologo /std:c11 /W4 /WX /TC /c tests\\mixer_header_probe.c /Iinclude /Fo{}",
        object.display()
    );
    let output = Command::new("cmd.exe")
        .args(["/D", "/C", &command])
        .output()
        .expect("run cl");
    assert!(
        output.status.success(),
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let _ = std::fs::remove_file(object);
}

#[cfg(windows)]
#[test]
fn cdylib_exports_mixer_and_legacy_upmix_symbols() {
    use std::ffi::CString;
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn LoadLibraryW(name: *const u16) -> *mut std::ffi::c_void;
        fn GetProcAddress(module: *mut std::ffi::c_void, name: *const u8) -> *mut std::ffi::c_void;
        fn FreeLibrary(module: *mut std::ffi::c_void) -> i32;
    }
    let deps = std::env::current_exe()
        .unwrap()
        .parent()
        .unwrap()
        .to_path_buf();
    let dll = deps.join("fe_monster_upmix.dll");
    assert!(dll.is_file(), "missing {}", dll.display());
    let wide: Vec<u16> = dll.as_os_str().encode_wide().chain(Some(0)).collect();
    let module = unsafe { LoadLibraryW(wide.as_ptr()) };
    assert!(!module.is_null());
    for name in [
        "fe_rust_upmix_abi_version",
        "fe_rust_upmix_create",
        "fe_rust_upmix_process",
        "fe_rust_upmix_reset",
        "fe_rust_upmix_destroy",
        "fe_rust_mixer_abi_version",
        "fe_rust_mixer_create",
        "fe_rust_mixer_stage_params",
        "fe_rust_mixer_commit",
        "fe_rust_mixer_process",
        "fe_rust_mixer_get_status",
        "fe_rust_mixer_reset",
        "fe_rust_mixer_destroy",
    ] {
        let name = CString::new(name).unwrap();
        assert!(
            !unsafe { GetProcAddress(module, name.as_ptr().cast()) }.is_null(),
            "missing {name:?}"
        );
    }
    unsafe { FreeLibrary(module) };
}
