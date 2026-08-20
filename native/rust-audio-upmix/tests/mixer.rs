use fe_monster_upmix::*;

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

#[test]
fn abi_layout_and_legacy_upmix_v1_are_stable() {
    assert_eq!(fe_rust_mixer_abi_version(), 1);
    assert_eq!(fe_rust_upmix_abi_version(), 1);
    assert_eq!(size_of::<FeRustMixerConfig>(), 32);
    assert_eq!(size_of::<FeRustMixerParams>(), 180);
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
    bad!(enabled, 2);
    bad!(compressor_enabled, 2);
    bad!(limiter_enabled, 2);
    bad!(reverb_enabled, 2);
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
fn all_presets_are_complete_deterministic_valid_snapshots() {
    let handle = Handle::new(8);
    let mut snapshots = Vec::new();
    for id in 0..8 {
        let first = mixer_preset_params(id).expect("preset");
        assert_eq!(first, mixer_preset_params(id).unwrap());
        assert_eq!(first.struct_size as usize, size_of::<FeRustMixerParams>());
        assert_eq!(first.abi_version, 1);
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
    assert_eq!(snapshots.len(), 8);
    assert!(mixer_preset_params(8).is_none());
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
