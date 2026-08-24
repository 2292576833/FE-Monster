use oximedia_audiopost::surround_upmix::{SurroundUpmixer, UpmixAlgorithm, UpmixConfig};
use std::cell::UnsafeCell;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};

pub mod channel_router;

const ABI_VERSION: u32 = 1;
const RESULT_OK: i32 = 0;
const RESULT_INVALID_ARGUMENT: i32 = -1;
const RESULT_UNSUPPORTED: i32 = -2;
const RESULT_PROCESS_FAILED: i32 = -3;
const RESULT_PANIC: i32 = -4;
const MAX_FRAMES_PER_CALL: usize = 65_536;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct FeRustUpmixConfig {
    pub struct_size: u32,
    pub abi_version: u32,
    pub sample_rate: u32,
    pub output_channels: u32,
    pub algorithm: u32,
    pub center_width_hz: f32,
    pub lfe_crossover_hz: f32,
    pub lfe_gain: f32,
    pub center_gain: f32,
    pub surround_gain: f32,
    pub decorrelation_amount: f32,
}

struct UpmixHandle {
    upmixer: SurroundUpmixer,
    output_channels: usize,
    left_scratch: Vec<f32>,
    right_scratch: Vec<f32>,
    persistent_lfe: bool,
    lfe_alpha: f32,
    lfe_gain: f32,
    lfe_state: f32,
}

fn finite_in_range(value: f32, minimum: f32, maximum: f32) -> bool {
    value.is_finite() && value >= minimum && value <= maximum
}

fn validate_config(config: &FeRustUpmixConfig) -> bool {
    config.struct_size as usize >= size_of::<FeRustUpmixConfig>()
        && config.abi_version == ABI_VERSION
        && (16_000..=192_000).contains(&config.sample_rate)
        && matches!(config.output_channels, 6 | 8)
        && config.algorithm <= 2
        && finite_in_range(config.center_width_hz, 20.0, 20_000.0)
        && finite_in_range(config.lfe_crossover_hz, 20.0, 500.0)
        && finite_in_range(config.lfe_gain, 0.0, 2.0)
        && finite_in_range(config.center_gain, 0.0, 2.0)
        && finite_in_range(config.surround_gain, 0.0, 2.0)
        && finite_in_range(config.decorrelation_amount, 0.0, 1.0)
}

fn algorithm_from_id(value: u32) -> Option<UpmixAlgorithm> {
    match value {
        0 => Some(UpmixAlgorithm::Passive),
        1 => Some(UpmixAlgorithm::MatrixDecode),
        2 => Some(UpmixAlgorithm::AmbientExtract),
        _ => None,
    }
}

fn low_pass_alpha(cutoff_hz: f32, sample_rate: u32) -> f32 {
    let sample_period = 1.0 / sample_rate as f32;
    let time_constant = 1.0 / (std::f32::consts::TAU * cutoff_hz);
    sample_period / (time_constant + sample_period)
}

fn reset_handle(handle: &mut UpmixHandle) {
    handle.upmixer.reset();
    handle.lfe_state = 0.0;
}

fn create_handle(config: &FeRustUpmixConfig) -> Option<Box<UpmixHandle>> {
    if !validate_config(config) {
        return None;
    }
    let upmix_config = UpmixConfig {
        center_width_hz: config.center_width_hz,
        lfe_crossover_hz: config.lfe_crossover_hz,
        lfe_gain: config.lfe_gain,
        center_gain: config.center_gain,
        surround_gain: config.surround_gain,
        decorrelation_amount: config.decorrelation_amount,
    };
    let algorithm = algorithm_from_id(config.algorithm)?;
    let upmixer = SurroundUpmixer::new(config.sample_rate, algorithm, upmix_config).ok()?;
    Some(Box::new(UpmixHandle {
        upmixer,
        output_channels: config.output_channels as usize,
        left_scratch: vec![0.0; 4096],
        right_scratch: vec![0.0; 4096],
        persistent_lfe: matches!(config.algorithm, 1 | 2),
        lfe_alpha: low_pass_alpha(config.lfe_crossover_hz, config.sample_rate),
        lfe_gain: config.lfe_gain,
        lfe_state: 0.0,
    }))
}

fn process_block(
    handle: &mut UpmixHandle,
    input: &[f32],
    frame_count: usize,
    output: &mut [f32],
) -> i32 {
    if frame_count == 0
        || frame_count > MAX_FRAMES_PER_CALL
        || input.len() != frame_count * 2
        || output.len() != frame_count * handle.output_channels
    {
        return RESULT_INVALID_ARGUMENT;
    }

    if handle.left_scratch.len() < frame_count {
        handle.left_scratch.resize(frame_count, 0.0);
        handle.right_scratch.resize(frame_count, 0.0);
    }
    for (index, frame) in input.chunks_exact(2).enumerate() {
        handle.left_scratch[index] = if frame[0].is_finite() { frame[0] } else { 0.0 };
        handle.right_scratch[index] = if frame[1].is_finite() { frame[1] } else { 0.0 };
    }

    let mut channels_51 = match handle.upmixer.upmix_stereo_to_51(
        &handle.left_scratch[..frame_count],
        &handle.right_scratch[..frame_count],
    ) {
        Ok(channels) => channels,
        Err(_) => return RESULT_PROCESS_FAILED,
    };
    // OxiMedia 0.2.0 keeps decorrelation state but initializes its 1-pole
    // LFE filter to zero inside every MatrixDecode/AmbientExtract call. Replace
    // only that channel with the equivalent streaming filter so a transport
    // batch boundary cannot create a periodic low-frequency discontinuity.
    if handle.persistent_lfe {
        let lfe = &mut channels_51[3];
        for frame in 0..frame_count {
            let mono = (handle.left_scratch[frame] + handle.right_scratch[frame]) * 0.5;
            handle.lfe_state += handle.lfe_alpha * (mono - handle.lfe_state);
            lfe[frame] = handle.lfe_state * handle.lfe_gain;
        }
    }
    let channels = if handle.output_channels == 8 {
        match handle.upmixer.upmix_51_to_71(&channels_51) {
            Ok(channels) => channels,
            Err(_) => return RESULT_PROCESS_FAILED,
        }
    } else {
        channels_51
    };
    if channels.len() != handle.output_channels
        || channels.iter().any(|channel| channel.len() != frame_count)
    {
        return RESULT_PROCESS_FAILED;
    }

    for frame in 0..frame_count {
        for channel in 0..handle.output_channels {
            let sample = channels[channel][frame];
            output[frame * handle.output_channels + channel] = if sample.is_finite() {
                sample
            } else {
                0.0
            };
        }
    }
    RESULT_OK
}

#[unsafe(no_mangle)]
pub extern "C" fn fe_rust_upmix_abi_version() -> u32 {
    ABI_VERSION
}

/// Creates an opaque upmixer handle.
///
/// # Safety
///
/// `config` must point to a readable `FeRustUpmixConfig` for the duration of
/// this call.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_upmix_create(
    config: *const FeRustUpmixConfig,
) -> *mut std::ffi::c_void {
    if config.is_null() {
        return std::ptr::null_mut();
    }
    let result = catch_unwind(AssertUnwindSafe(|| {
        // SAFETY: The caller contract requires a valid config pointer and the
        // null case was rejected above. The value is copied immediately.
        let copied = unsafe { *config };
        create_handle(&copied)
            .map(Box::into_raw)
            .map(|pointer| pointer.cast::<std::ffi::c_void>())
            .unwrap_or(std::ptr::null_mut())
    }));
    result.unwrap_or(std::ptr::null_mut())
}

/// Processes interleaved stereo float PCM into interleaved 5.1 or 7.1 PCM.
///
/// # Safety
///
/// `handle` must come from `fe_rust_upmix_create`; `input` must contain
/// `frame_count * 2` readable floats and `output` must contain
/// `frame_count * output_channels` writable floats. Calls for one handle must
/// be serialized by the host.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_upmix_process(
    handle: *mut std::ffi::c_void,
    input: *const f32,
    frame_count: u32,
    output: *mut f32,
    output_capacity_samples: u32,
) -> i32 {
    if handle.is_null() || input.is_null() || output.is_null() {
        return RESULT_INVALID_ARGUMENT;
    }
    let frames = frame_count as usize;
    if frames == 0 || frames > MAX_FRAMES_PER_CALL {
        return RESULT_INVALID_ARGUMENT;
    }
    let result = catch_unwind(AssertUnwindSafe(|| {
        // SAFETY: Pointer sizes and lifetime requirements are documented in
        // the public FFI contract and validated before slices are created.
        let upmixer = unsafe { &mut *handle.cast::<UpmixHandle>() };
        let required_output = match frames.checked_mul(upmixer.output_channels) {
            Some(value) => value,
            None => return RESULT_INVALID_ARGUMENT,
        };
        if output_capacity_samples as usize != required_output {
            return RESULT_INVALID_ARGUMENT;
        }
        let input_len = match frames.checked_mul(2) {
            Some(value) => value,
            None => return RESULT_INVALID_ARGUMENT,
        };
        // SAFETY: The caller guarantees both buffers have the stated lengths.
        let input_slice = unsafe { std::slice::from_raw_parts(input, input_len) };
        let output_slice = unsafe { std::slice::from_raw_parts_mut(output, required_output) };
        process_block(upmixer, input_slice, frames, output_slice)
    }));
    result.unwrap_or(RESULT_PANIC)
}

/// Resets the algorithm's temporal filter/decorrelation state.
///
/// # Safety
///
/// `handle` must be a live handle returned by `fe_rust_upmix_create`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_upmix_reset(handle: *mut std::ffi::c_void) -> i32 {
    if handle.is_null() {
        return RESULT_INVALID_ARGUMENT;
    }
    let result = catch_unwind(AssertUnwindSafe(|| {
        // SAFETY: The caller contract requires a live handle.
        let upmixer = unsafe { &mut *handle.cast::<UpmixHandle>() };
        reset_handle(upmixer);
        RESULT_OK
    }));
    result.unwrap_or(RESULT_PANIC)
}

/// Destroys an opaque upmixer handle.
///
/// # Safety
///
/// `handle` must be null or a handle returned by `fe_rust_upmix_create`, and
/// must not be used after this call.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_upmix_destroy(handle: *mut std::ffi::c_void) {
    if handle.is_null() {
        return;
    }
    let _ = catch_unwind(AssertUnwindSafe(|| {
        // SAFETY: Ownership is transferred back exactly once by contract.
        drop(unsafe { Box::from_raw(handle.cast::<UpmixHandle>()) });
    }));
}

#[unsafe(no_mangle)]
pub extern "C" fn fe_rust_upmix_result_ok() -> i32 {
    RESULT_OK
}

#[unsafe(no_mangle)]
pub extern "C" fn fe_rust_upmix_result_unsupported() -> i32 {
    RESULT_UNSUPPORTED
}

// Mixer ABI v1 is deliberately independent from the legacy upmix ABI above.
pub const FE_RUST_MIXER_ABI_VERSION: u32 = 1;
pub const FE_RUST_MIXER_EQ_BANDS: usize = 10;
pub const FE_RUST_MIXER_OK: i32 = 0;
pub const FE_RUST_MIXER_INVALID_ARGUMENT: i32 = -1;
pub const FE_RUST_MIXER_INVALID_REVISION: i32 = -2;
pub const FE_RUST_MIXER_UNSUPPORTED: i32 = -3;
pub const FE_RUST_MIXER_PANIC: i32 = -4;
pub const FE_RUST_MIXER_BUSY: i32 = -5;
const MIXER_MAX_CHANNELS: usize = 8;
const REVERB_FDN_LINES: usize = 4;
const MIXER_SNAPSHOT_SLOTS: usize = 3;
const SLOT_FREE: u32 = 0;
const SLOT_READING: u32 = 1;
const SLOT_WRITING: u32 = 2;
const COMPRESSOR_LUT_SIZE: usize = 8_193;
const COMPRESSOR_LUT_MAX_AMPLITUDE: f32 = 8.0;
const EQ_FREQUENCIES: [f32; FE_RUST_MIXER_EQ_BANDS] = [
    31.0, 62.0, 125.0, 250.0, 500.0, 1_000.0, 2_000.0, 4_000.0, 8_000.0, 16_000.0,
];

#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct FeRustMixerConfig {
    pub struct_size: u32,
    pub abi_version: u32,
    pub sample_rate: u32,
    pub max_frames_per_call: u32,
    pub reserved: [u32; 4],
}

impl Default for FeRustMixerConfig {
    fn default() -> Self {
        Self {
            struct_size: size_of::<Self>() as u32,
            abi_version: FE_RUST_MIXER_ABI_VERSION,
            sample_rate: 48_000,
            max_frames_per_call: 4_096,
            reserved: [0; 4],
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FeRustMixerParams {
    pub struct_size: u32,
    pub abi_version: u32,
    pub enabled: u32,
    pub compressor_enabled: u32,
    pub limiter_enabled: u32,
    pub reverb_enabled: u32,
    pub input_gain_db: f32,
    pub output_gain_db: f32,
    pub balance: f32,
    pub eq_db: [f32; FE_RUST_MIXER_EQ_BANDS],
    pub stereo_width: f32,
    pub center_gain: f32,
    pub surround_gain: f32,
    pub lfe_gain: f32,
    pub compressor_threshold_db: f32,
    pub compressor_ratio: f32,
    pub compressor_attack_ms: f32,
    pub compressor_release_ms: f32,
    pub compressor_knee_db: f32,
    pub compressor_makeup_db: f32,
    pub limiter_ceiling_db: f32,
    pub limiter_release_ms: f32,
    pub reverb_room_size: f32,
    pub reverb_decay_ms: f32,
    pub reverb_damping: f32,
    pub reverb_pre_delay_ms: f32,
    pub reverb_wet: f32,
    pub reverb_dry: f32,
    pub reserved: [u32; 8],
}

impl Default for FeRustMixerParams {
    fn default() -> Self {
        mixer_preset_params(0).expect("clean preset exists")
    }
}

#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct FeRustMixerStatus {
    pub struct_size: u32,
    pub abi_version: u32,
    pub active_revision: u64,
    pub staged_revision: u64,
    pub process_failures: u64,
    pub enabled: u32,
    pub reserved: [u32; 7],
}

impl Default for FeRustMixerStatus {
    fn default() -> Self {
        Self {
            struct_size: size_of::<Self>() as u32,
            abi_version: FE_RUST_MIXER_ABI_VERSION,
            active_revision: 0,
            staged_revision: 0,
            process_failures: 0,
            enabled: 1,
            reserved: [0; 7],
        }
    }
}

fn clean_params() -> FeRustMixerParams {
    FeRustMixerParams {
        struct_size: size_of::<FeRustMixerParams>() as u32,
        abi_version: FE_RUST_MIXER_ABI_VERSION,
        enabled: 1,
        compressor_enabled: 0,
        limiter_enabled: 1,
        reverb_enabled: 0,
        input_gain_db: 0.0,
        output_gain_db: 0.0,
        balance: 0.0,
        eq_db: [0.0; FE_RUST_MIXER_EQ_BANDS],
        stereo_width: 1.0,
        center_gain: 1.0,
        surround_gain: 1.0,
        lfe_gain: 1.0,
        compressor_threshold_db: -18.0,
        compressor_ratio: 2.0,
        compressor_attack_ms: 10.0,
        compressor_release_ms: 150.0,
        compressor_knee_db: 6.0,
        compressor_makeup_db: 0.0,
        limiter_ceiling_db: -0.3,
        limiter_release_ms: 100.0,
        reverb_room_size: 0.35,
        reverb_decay_ms: 800.0,
        reverb_damping: 0.5,
        reverb_pre_delay_ms: 12.0,
        reverb_wet: 0.0,
        reverb_dry: 1.0,
        reserved: [0; 8],
    }
}

/// Returns a complete deterministic snapshot for a stable preset id:
/// clean, bathroom, hall, surround-3d, cinema, vocal-clear, bass-boost, night.
pub fn mixer_preset_params(id: u32) -> Option<FeRustMixerParams> {
    let mut p = clean_params();
    match id {
        0 => {}
        1 => {
            p.reverb_enabled = 1;
            p.reverb_room_size = 0.22;
            p.reverb_decay_ms = 650.0;
            p.reverb_damping = 0.35;
            p.reverb_pre_delay_ms = 8.0;
            p.reverb_wet = 0.32;
            p.reverb_dry = 0.82;
            p.eq_db[7] = 1.5;
        }
        2 => {
            p.reverb_enabled = 1;
            p.reverb_room_size = 0.82;
            p.reverb_decay_ms = 2_800.0;
            p.reverb_damping = 0.62;
            p.reverb_pre_delay_ms = 28.0;
            p.reverb_wet = 0.36;
            p.reverb_dry = 0.88;
        }
        3 => {
            // Conservative headroom for MatrixDecode -> Mixer -> OBR. Spatial
            // extent now comes from real 5.1/7.1 object geometry, not boosted
            // channel gain or an over-wide stereo stage.
            p.input_gain_db = -6.0;
            p.stereo_width = 1.2;
        }
        4 => {
            p.input_gain_db = -1.5;
            p.eq_db[1] = 2.0;
            p.eq_db[2] = 1.5;
            p.eq_db[6] = 1.0;
            p.center_gain = 1.12;
            p.surround_gain = 1.18;
            p.lfe_gain = 1.22;
            p.compressor_enabled = 1;
            p.compressor_threshold_db = -16.0;
            p.compressor_ratio = 2.2;
            p.compressor_makeup_db = 1.0;
        }
        5 => {
            p.eq_db[0] = -2.0;
            p.eq_db[1] = -1.5;
            p.eq_db[5] = 2.0;
            p.eq_db[6] = 3.0;
            p.eq_db[7] = 1.5;
            p.center_gain = 1.15;
            p.compressor_enabled = 1;
            p.compressor_threshold_db = -20.0;
            p.compressor_ratio = 2.0;
            p.compressor_makeup_db = 1.0;
        }
        6 => {
            p.input_gain_db = -1.0;
            p.eq_db[0] = 4.0;
            p.eq_db[1] = 4.5;
            p.eq_db[2] = 3.0;
            p.lfe_gain = 1.3;
            p.limiter_ceiling_db = -0.8;
        }
        7 => {
            p.input_gain_db = -3.0;
            p.output_gain_db = -2.0;
            p.compressor_enabled = 1;
            p.compressor_threshold_db = -28.0;
            p.compressor_ratio = 6.0;
            p.compressor_attack_ms = 5.0;
            p.compressor_release_ms = 350.0;
            p.compressor_knee_db = 10.0;
            p.compressor_makeup_db = 3.0;
            p.limiter_ceiling_db = -3.0;
        }
        _ => return None,
    }
    Some(p)
}

fn bool_field(value: u32) -> bool {
    value <= 1
}

fn validate_mixer_config(config: &FeRustMixerConfig) -> bool {
    config.struct_size as usize >= size_of::<FeRustMixerConfig>()
        && config.abi_version == FE_RUST_MIXER_ABI_VERSION
        && (16_000..=192_000).contains(&config.sample_rate)
        && (1..=MAX_FRAMES_PER_CALL as u32).contains(&config.max_frames_per_call)
        && config.reserved == [0; 4]
}

fn validate_mixer_params(p: &FeRustMixerParams) -> bool {
    p.struct_size as usize >= size_of::<FeRustMixerParams>()
        && p.abi_version == FE_RUST_MIXER_ABI_VERSION
        && bool_field(p.enabled)
        && bool_field(p.compressor_enabled)
        && bool_field(p.limiter_enabled)
        && bool_field(p.reverb_enabled)
        && finite_in_range(p.input_gain_db, -24.0, 24.0)
        && finite_in_range(p.output_gain_db, -24.0, 24.0)
        && finite_in_range(p.balance, -1.0, 1.0)
        && p.eq_db.iter().all(|v| finite_in_range(*v, -12.0, 12.0))
        && finite_in_range(p.stereo_width, 0.0, 2.0)
        && finite_in_range(p.center_gain, 0.0, 2.0)
        && finite_in_range(p.surround_gain, 0.0, 2.0)
        && finite_in_range(p.lfe_gain, 0.0, 2.0)
        && finite_in_range(p.compressor_threshold_db, -60.0, 0.0)
        && finite_in_range(p.compressor_ratio, 1.0, 20.0)
        && finite_in_range(p.compressor_attack_ms, 0.1, 200.0)
        && finite_in_range(p.compressor_release_ms, 10.0, 2_000.0)
        && finite_in_range(p.compressor_knee_db, 0.0, 24.0)
        && finite_in_range(p.compressor_makeup_db, 0.0, 24.0)
        && finite_in_range(p.limiter_ceiling_db, -12.0, 0.0)
        && finite_in_range(p.limiter_release_ms, 10.0, 1_000.0)
        && finite_in_range(p.reverb_room_size, 0.0, 1.0)
        && finite_in_range(p.reverb_decay_ms, 50.0, 5_000.0)
        && finite_in_range(p.reverb_damping, 0.0, 1.0)
        && finite_in_range(p.reverb_pre_delay_ms, 0.0, 200.0)
        && finite_in_range(p.reverb_wet, 0.0, 1.0)
        && finite_in_range(p.reverb_dry, 0.0, 1.0)
        && p.reserved == [0; 8]
}

#[derive(Clone, Copy, Default)]
struct BiquadState {
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

#[derive(Clone, Copy, Default)]
struct BiquadCoefficients {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

fn peaking_coefficients(sample_rate: f32, frequency: f32, gain_db: f32) -> BiquadCoefficients {
    let frequency = frequency.min(sample_rate * 0.45);
    let a = 10.0_f32.powf(gain_db / 40.0);
    let omega = std::f32::consts::TAU * frequency / sample_rate;
    let alpha = omega.sin() / 2.0_f32.sqrt();
    let a0 = 1.0 + alpha / a;
    BiquadCoefficients {
        b0: (1.0 + alpha * a) / a0,
        b1: -2.0 * omega.cos() / a0,
        b2: (1.0 - alpha * a) / a0,
        a1: -2.0 * omega.cos() / a0,
        a2: (1.0 - alpha / a) / a0,
    }
}

fn run_biquad(state: &mut BiquadState, c: BiquadCoefficients, x: f32) -> f32 {
    let y = c.b0 * x + c.b1 * state.x1 + c.b2 * state.x2 - c.a1 * state.y1 - c.a2 * state.y2;
    state.x2 = state.x1;
    state.x1 = x;
    state.y2 = state.y1;
    state.y1 = if y.is_finite() { y } else { 0.0 };
    state.y1
}

/// Exact compressor transfer used to prepare the bounded process-time lookup table.
/// Returns linear gain (including makeup) for a detector level expressed in dBFS.
pub fn mixer_compressor_gain_for_db(p: &FeRustMixerParams, detector_db: f32) -> Option<f32> {
    if !validate_mixer_params(p) || !detector_db.is_finite() {
        return None;
    }
    Some(compressor_gain_for_db_unchecked(p, detector_db))
}

fn compressor_gain_for_db_unchecked(p: &FeRustMixerParams, detector_db: f32) -> f32 {
    let knee = p.compressor_knee_db;
    let lower = p.compressor_threshold_db - knee * 0.5;
    let upper = p.compressor_threshold_db + knee * 0.5;
    let slope = 1.0 - 1.0 / p.compressor_ratio;
    let reduction_db = if p.compressor_ratio == 1.0 || detector_db <= lower {
        0.0
    } else if knee > 0.0 && detector_db < upper {
        let distance = detector_db - lower;
        slope * distance * distance / (2.0 * knee)
    } else {
        slope * (detector_db - p.compressor_threshold_db)
    };
    10.0_f32.powf((p.compressor_makeup_db - reduction_db) / 20.0)
}

#[derive(Clone, Copy)]
struct DerivedParameters {
    input_gain: f32,
    output_gain: f32,
    eq: [BiquadCoefficients; FE_RUST_MIXER_EQ_BANDS],
    compressor_attack: f32,
    compressor_release: f32,
    compressor_lut: [f32; COMPRESSOR_LUT_SIZE],
    limiter_ceiling: f32,
    limiter_release: f32,
    reverb_feedback: [f32; REVERB_FDN_LINES],
    reverb_delays: [usize; REVERB_FDN_LINES],
}

fn is_prime(value: usize) -> bool {
    if value < 2 {
        return false;
    }
    if value % 2 == 0 {
        return value == 2;
    }
    let mut divisor = 3;
    while divisor <= value / divisor {
        if value % divisor == 0 {
            return false;
        }
        divisor += 2;
    }
    true
}

fn prime_delay_near(target: usize, maximum: usize) -> usize {
    let target = target.clamp(2, maximum);
    for candidate in target..=maximum {
        if is_prime(candidate) {
            return candidate;
        }
    }
    for candidate in (2..target).rev() {
        if is_prime(candidate) {
            return candidate;
        }
    }
    1
}

impl DerivedParameters {
    fn from_params(p: &FeRustMixerParams, sample_rate: f32, reverb_stride: usize) -> Self {
        let db_gain = |db: f32| 10.0_f32.powf(db / 20.0);
        let time_coefficient =
            |milliseconds: f32| (-1.0 / (milliseconds * 0.001 * sample_rate)).exp();
        let pre = (p.reverb_pre_delay_ms * 0.001 * sample_rate) as usize;
        let room = ((0.02 + p.reverb_room_size * 0.10) * sample_rate) as usize;
        let total_reverb_delay = (pre + room).clamp(2, reverb_stride - 1);
        // Four distinct prime lengths prevent the periodic ringing and same-
        // phase echoes of the former single feedback delay.  Preparation runs
        // on the control path, never in the audio callback.
        const DELAY_RATIOS: [f32; REVERB_FDN_LINES] = [0.73, 0.83, 0.91, 1.0];
        let reverb_delays = std::array::from_fn(|line| {
            prime_delay_near(
                (total_reverb_delay as f32 * DELAY_RATIOS[line]).round() as usize,
                reverb_stride - 1,
            )
        });
        let decay_samples = (p.reverb_decay_ms * 0.001 * sample_rate).max(1.0);
        let compressor_lut = std::array::from_fn(|index| {
            let amplitude =
                index as f32 * COMPRESSOR_LUT_MAX_AMPLITUDE / (COMPRESSOR_LUT_SIZE - 1) as f32;
            let detector_db = if amplitude > 0.0 {
                20.0 * amplitude.log10()
            } else {
                -160.0
            };
            compressor_gain_for_db_unchecked(p, detector_db)
        });
        Self {
            input_gain: db_gain(p.input_gain_db),
            output_gain: db_gain(p.output_gain_db),
            eq: std::array::from_fn(|band| {
                peaking_coefficients(sample_rate, EQ_FREQUENCIES[band], p.eq_db[band])
            }),
            compressor_attack: time_coefficient(p.compressor_attack_ms),
            compressor_release: time_coefficient(p.compressor_release_ms),
            compressor_lut,
            limiter_ceiling: db_gain(p.limiter_ceiling_db),
            limiter_release: time_coefficient(p.limiter_release_ms),
            reverb_feedback: std::array::from_fn(|line| {
                10.0_f32.powf(-3.0 * reverb_delays[line] as f32 / decay_samples)
            }),
            reverb_delays,
        }
    }

    fn approach(&mut self, target: Self, fraction: f32) {
        macro_rules! field {
            ($name:ident) => {
                self.$name += (target.$name - self.$name) * fraction;
            };
        }
        field!(input_gain);
        field!(output_gain);
        field!(compressor_attack);
        field!(compressor_release);
        field!(limiter_ceiling);
        field!(limiter_release);
        for line in 0..REVERB_FDN_LINES {
            self.reverb_feedback[line] +=
                (target.reverb_feedback[line] - self.reverb_feedback[line]) * fraction;
        }
        for band in 0..FE_RUST_MIXER_EQ_BANDS {
            macro_rules! coefficient {
                ($name:ident) => {
                    self.eq[band].$name += (target.eq[band].$name - self.eq[band].$name) * fraction;
                };
            }
            coefficient!(b0);
            coefficient!(b1);
            coefficient!(b2);
            coefficient!(a1);
            coefficient!(a2);
        }
        self.reverb_delays = target.reverb_delays;
    }
}

#[derive(Clone, Copy)]
struct PreparedSnapshot {
    revision: u64,
    ramp_frames: u32,
    params: FeRustMixerParams,
    derived: DerivedParameters,
}

struct SnapshotSlot {
    value: UnsafeCell<PreparedSnapshot>,
    state: AtomicU32,
}

struct SnapshotPublication {
    slots: [SnapshotSlot; MIXER_SNAPSHOT_SLOTS],
    active_token: AtomicU64,
}

// SAFETY: writers are serialized by MixerHandle::control. Every non-atomic
// slot access is preceded by exclusive CAS ownership: FREE->WRITING for the
// publisher or FREE->READING for the single serialized audio reader. The
// publisher also excludes the active slot. A reader rechecks the generation
// token after claiming and abandons stale claims. No read can overlap WRITING,
// and no write can overlap READING.
unsafe impl Sync for SnapshotPublication {}

impl SnapshotPublication {
    fn new(initial: PreparedSnapshot) -> Self {
        Self {
            slots: std::array::from_fn(|_| SnapshotSlot {
                value: UnsafeCell::new(initial),
                state: AtomicU32::new(SLOT_FREE),
            }),
            active_token: AtomicU64::new(1 << 2),
        }
    }

    fn publish(&self, snapshot: PreparedSnapshot) -> bool {
        let active = self.active_token.load(Ordering::Acquire);
        let active_slot = (active & 0x3) as usize;
        for slot in 0..MIXER_SNAPSHOT_SLOTS {
            if slot == active_slot
                || self.slots[slot]
                    .state
                    .compare_exchange(SLOT_FREE, SLOT_WRITING, Ordering::AcqRel, Ordering::Acquire)
                    .is_err()
            {
                continue;
            }
            // SAFETY: FREE->WRITING is exclusive, and the active slot was
            // excluded. Readers can only access slots held as READING.
            unsafe { self.slots[slot].value.get().write(snapshot) };
            let generation = (active >> 2).wrapping_add(1).max(1);
            self.active_token
                .store((generation << 2) | slot as u64, Ordering::Release);
            self.slots[slot].state.store(SLOT_FREE, Ordering::Release);
            return true;
        }
        false
    }

    fn try_claim_active(&self) -> Option<(u64, usize)> {
        let token = self.active_token.load(Ordering::Acquire);
        let slot = (token & 0x3) as usize;
        if self.slots[slot]
            .state
            .compare_exchange(SLOT_FREE, SLOT_READING, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return None;
        }
        if self.active_token.load(Ordering::Acquire) != token {
            self.release_read(slot);
            return None;
        }
        Some((token, slot))
    }

    fn copy_claimed(&self, slot: usize) -> PreparedSnapshot {
        debug_assert_eq!(self.slots[slot].state.load(Ordering::Relaxed), SLOT_READING);
        // SAFETY: caller owns the slot as READING. A publisher must acquire
        // WRITING with CAS and therefore cannot touch this value concurrently.
        unsafe { *self.slots[slot].value.get() }
    }

    fn release_read(&self, slot: usize) {
        self.slots[slot].state.store(SLOT_FREE, Ordering::Release);
    }

    fn try_load(&self) -> Option<PreparedSnapshot> {
        let (_, slot) = self.try_claim_active()?;
        let snapshot = self.copy_claimed(slot);
        self.release_read(slot);
        Some(snapshot)
    }
}

struct MixerDsp {
    max_frames: usize,
    seen_revision: u64,
    current: FeRustMixerParams,
    target: FeRustMixerParams,
    derived: DerivedParameters,
    derived_target: DerivedParameters,
    compressor_lut_mix: f32,
    ramp_remaining: u32,
    eq: [[BiquadState; FE_RUST_MIXER_EQ_BANDS]; MIXER_MAX_CHANNELS],
    compressor_envelope: f32,
    limiter_gain: f32,
    reverb: Vec<f32>,
    reverb_stride: usize,
    reverb_position: usize,
    reverb_damping: [f32; MIXER_MAX_CHANNELS * REVERB_FDN_LINES],
}

impl MixerDsp {
    fn new(config: &FeRustMixerConfig, initial: PreparedSnapshot) -> Self {
        let stride = ((config.sample_rate as f32 * 0.321).ceil() as usize).max(2);
        Self {
            max_frames: config.max_frames_per_call as usize,
            seen_revision: initial.revision,
            current: initial.params,
            target: initial.params,
            derived: initial.derived,
            derived_target: initial.derived,
            compressor_lut_mix: 1.0,
            ramp_remaining: 0,
            eq: [[BiquadState::default(); FE_RUST_MIXER_EQ_BANDS]; MIXER_MAX_CHANNELS],
            compressor_envelope: 0.0,
            limiter_gain: 1.0,
            reverb: vec![0.0; stride * MIXER_MAX_CHANNELS * REVERB_FDN_LINES],
            reverb_stride: stride,
            reverb_position: 0,
            reverb_damping: [0.0; MIXER_MAX_CHANNELS * REVERB_FDN_LINES],
        }
    }

    fn reset_temporal(&mut self) {
        self.eq = [[BiquadState::default(); FE_RUST_MIXER_EQ_BANDS]; MIXER_MAX_CHANNELS];
        self.compressor_envelope = 0.0;
        self.limiter_gain = 1.0;
        self.reverb.fill(0.0);
        self.reverb_position = 0;
        self.reverb_damping = [0.0; MIXER_MAX_CHANNELS * REVERB_FDN_LINES];
    }

    fn reset_to_snapshot(&mut self, snapshot: PreparedSnapshot) {
        self.seen_revision = snapshot.revision;
        self.current = snapshot.params;
        self.target = snapshot.params;
        self.derived = snapshot.derived;
        self.derived_target = snapshot.derived;
        self.compressor_lut_mix = 1.0;
        self.ramp_remaining = 0;
        self.reset_temporal();
    }

    fn accept_snapshot(&mut self, snapshot: PreparedSnapshot) {
        if snapshot.revision != self.seen_revision {
            for index in 0..COMPRESSOR_LUT_SIZE {
                self.derived.compressor_lut[index] += (self.derived_target.compressor_lut[index]
                    - self.derived.compressor_lut[index])
                    * self.compressor_lut_mix;
            }
            self.seen_revision = snapshot.revision;
            self.target = snapshot.params;
            self.derived_target = snapshot.derived;
            if snapshot.ramp_frames == 0 {
                self.current = snapshot.params;
                self.derived = snapshot.derived;
                self.compressor_lut_mix = 1.0;
            } else {
                self.compressor_lut_mix = 0.0;
            }
            self.ramp_remaining = snapshot.ramp_frames;
        }
    }

    fn ramp_one(&mut self) {
        if self.ramp_remaining == 0 {
            return;
        }
        let fraction = 1.0 / self.ramp_remaining as f32;
        macro_rules! approach {
            ($field:ident) => {
                self.current.$field += (self.target.$field - self.current.$field) * fraction;
            };
        }
        approach!(input_gain_db);
        approach!(output_gain_db);
        approach!(balance);
        for i in 0..FE_RUST_MIXER_EQ_BANDS {
            self.current.eq_db[i] += (self.target.eq_db[i] - self.current.eq_db[i]) * fraction;
        }
        approach!(stereo_width);
        approach!(center_gain);
        approach!(surround_gain);
        approach!(lfe_gain);
        approach!(compressor_threshold_db);
        approach!(compressor_ratio);
        approach!(compressor_attack_ms);
        approach!(compressor_release_ms);
        approach!(compressor_knee_db);
        approach!(compressor_makeup_db);
        approach!(limiter_ceiling_db);
        approach!(limiter_release_ms);
        approach!(reverb_room_size);
        approach!(reverb_decay_ms);
        approach!(reverb_damping);
        approach!(reverb_pre_delay_ms);
        approach!(reverb_wet);
        approach!(reverb_dry);
        self.derived.approach(self.derived_target, fraction);
        self.compressor_lut_mix += (1.0 - self.compressor_lut_mix) * fraction;
        self.current.enabled = self.target.enabled;
        self.current.compressor_enabled = self.target.compressor_enabled;
        self.current.limiter_enabled = self.target.limiter_enabled;
        self.current.reverb_enabled = self.target.reverb_enabled;
        self.ramp_remaining -= 1;
    }

    fn compressor_gain(&self, amplitude: f32) -> f32 {
        let position = amplitude.clamp(0.0, COMPRESSOR_LUT_MAX_AMPLITUDE)
            * (COMPRESSOR_LUT_SIZE - 1) as f32
            / COMPRESSOR_LUT_MAX_AMPLITUDE;
        let lower = position as usize;
        let upper = (lower + 1).min(COMPRESSOR_LUT_SIZE - 1);
        let fraction = position - lower as f32;
        let lookup = |table: &[f32; COMPRESSOR_LUT_SIZE]| {
            table[lower] + (table[upper] - table[lower]) * fraction
        };
        let current = lookup(&self.derived.compressor_lut);
        let target = lookup(&self.derived_target.compressor_lut);
        current + (target - current) * self.compressor_lut_mix
    }

    fn process(&mut self, pcm: &mut [f32], frames: usize, channels: usize) {
        for frame in 0..frames {
            self.ramp_one();
            let p = self.current;
            let d = self.derived;
            let base = frame * channels;
            for channel in 0..channels {
                let sample = pcm[base + channel];
                pcm[base + channel] = if sample.is_finite() { sample } else { 0.0 };
            }
            if p.enabled == 0 {
                continue;
            }

            // 1. Input gain and balance.
            for channel in 0..channels {
                pcm[base + channel] *= d.input_gain;
            }
            pcm[base] *= if p.balance > 0.0 {
                1.0 - p.balance
            } else {
                1.0
            };
            pcm[base + 1] *= if p.balance < 0.0 {
                1.0 + p.balance
            } else {
                1.0
            };

            // 2. Ten fixed-frequency peaking EQ bands.
            for band in 0..FE_RUST_MIXER_EQ_BANDS {
                // The clean snapshot is a true wire path. Running nominal
                // 0 dB biquads adds avoidable floating-point residue and keeps
                // off/off from being sample-transparent.
                if p.eq_db[band].abs() <= 1.0e-6 {
                    continue;
                }
                let c = d.eq[band];
                for channel in 0..channels {
                    pcm[base + channel] =
                        run_biquad(&mut self.eq[channel][band], c, pcm[base + channel]);
                }
            }

            // 3. Stereo width and multichannel spatial gains.
            let mid = (pcm[base] + pcm[base + 1]) * 0.5;
            let side = (pcm[base] - pcm[base + 1]) * 0.5 * p.stereo_width;
            pcm[base] = mid + side;
            pcm[base + 1] = mid - side;
            if channels >= 6 {
                pcm[base + 2] *= p.center_gain;
                pcm[base + 3] *= p.lfe_gain;
                for channel in 4..channels {
                    pcm[base + channel] *= p.surround_gain;
                }
            }

            // 4. Linked soft-knee compressor.
            if p.compressor_enabled != 0 {
                let peak = pcm[base..base + channels]
                    .iter()
                    .fold(0.0_f32, |m, value| m.max(value.abs()));
                let coefficient = if peak > self.compressor_envelope {
                    d.compressor_attack
                } else {
                    d.compressor_release
                };
                self.compressor_envelope =
                    coefficient * self.compressor_envelope + (1.0 - coefficient) * peak;
                let gain = self.compressor_gain(self.compressor_envelope);
                for channel in 0..channels {
                    pcm[base + channel] *= gain;
                }
            }

            // 5. Four-line feedback delay network. All delay and damping
            // memory is allocated by create; the normalized Hadamard matrix
            // is energy-preserving and the per-line T60 gains remain < 1.
            if p.reverb_enabled != 0 {
                const OUTPUT_SIGNS: [[f32; REVERB_FDN_LINES]; REVERB_FDN_LINES] = [
                    [1.0, 1.0, 1.0, 1.0],
                    [1.0, -1.0, 1.0, -1.0],
                    [1.0, 1.0, -1.0, -1.0],
                    [1.0, -1.0, -1.0, 1.0],
                ];
                let blend_norm = p.reverb_wet.hypot(p.reverb_dry);
                let (wet_gain, dry_gain) = if blend_norm > 1.0e-6 {
                    (p.reverb_wet / blend_norm, p.reverb_dry / blend_norm)
                } else {
                    (0.0, 1.0)
                };
                let damping_alpha = (1.0 - p.reverb_damping).clamp(0.02, 1.0);
                for channel in 0..channels {
                    let input = pcm[base + channel];
                    let mut delayed = [0.0_f32; REVERB_FDN_LINES];
                    for line in 0..REVERB_FDN_LINES {
                        let read = (self.reverb_position + self.reverb_stride
                            - d.reverb_delays[line])
                            % self.reverb_stride;
                        let state_index = channel * REVERB_FDN_LINES + line;
                        let delay_index = state_index * self.reverb_stride + read;
                        self.reverb_damping[state_index] += damping_alpha
                            * (self.reverb[delay_index]
                                - self.reverb_damping[state_index]);
                        delayed[line] = self.reverb_damping[state_index];
                    }

                    let feedback = [
                        (delayed[0] + delayed[1] + delayed[2] + delayed[3]) * 0.5,
                        (delayed[0] - delayed[1] + delayed[2] - delayed[3]) * 0.5,
                        (delayed[0] + delayed[1] - delayed[2] - delayed[3]) * 0.5,
                        (delayed[0] - delayed[1] - delayed[2] + delayed[3]) * 0.5,
                    ];
                    for line in 0..REVERB_FDN_LINES {
                        const INPUT_NORMALIZATION: f32 = 0.5;
                        let write = input * INPUT_NORMALIZATION
                            + feedback[line] * d.reverb_feedback[line];
                        let state_index = channel * REVERB_FDN_LINES + line;
                        let write_index = state_index * self.reverb_stride
                            + self.reverb_position;
                        self.reverb[write_index] = if write.is_finite() { write } else { 0.0 };
                    }

                    let signs = OUTPUT_SIGNS[channel % REVERB_FDN_LINES];
                    let wet = delayed
                        .iter()
                        .zip(signs)
                        .map(|(sample, sign)| sample * sign)
                        .sum::<f32>()
                        * 0.5;
                    pcm[base + channel] = input * dry_gain + wet * wet_gain;
                }
                self.reverb_position = (self.reverb_position + 1) % self.reverb_stride;
            }

            // 6. Output gain and linked peak limiter.
            for channel in 0..channels {
                pcm[base + channel] *= d.output_gain;
            }
            if p.limiter_enabled != 0 {
                let ceiling = d.limiter_ceiling;
                let peak = pcm[base..base + channels]
                    .iter()
                    .fold(0.0_f32, |m, value| m.max(value.abs()));
                let desired = if peak > ceiling { ceiling / peak } else { 1.0 };
                if desired < self.limiter_gain {
                    self.limiter_gain = desired;
                } else {
                    self.limiter_gain = (d.limiter_release * self.limiter_gain
                        + (1.0 - d.limiter_release) * desired)
                        .min(desired);
                }
                for channel in 0..channels {
                    pcm[base + channel] *= self.limiter_gain;
                }
            } else {
                self.limiter_gain = 1.0;
            }

            // 7. Final finite sanitation. The linked limiter above (when
            // enabled) and the native pipeline's final safety limiter own
            // output protection; an extra hard clamp here would add avoidable
            // flat-top distortion and break disabled-mode transparency.
            for channel in 0..channels {
                let sample = pcm[base + channel];
                pcm[base + channel] = if sample.is_finite() { sample } else { 0.0 };
            }
        }
    }
}

struct MixerControl {
    active_revision: u64,
    active_snapshot: PreparedSnapshot,
    staged: Option<PreparedSnapshot>,
}

struct MixerHandle {
    publication: SnapshotPublication,
    control: Mutex<MixerControl>,
    process_failures: AtomicU64,
    sample_rate: f32,
    reverb_stride: usize,
    dsp: UnsafeCell<MixerDsp>,
}

// SAFETY: all cross-thread fields are atomic or mutex-protected. `dsp` is
// touched only by process/reset, and the C contract requires those two calls
// to be serialized for a handle. Control calls never dereference `dsp`.
unsafe impl Sync for MixerHandle {}

#[unsafe(no_mangle)]
pub extern "C" fn fe_rust_mixer_abi_version() -> u32 {
    FE_RUST_MIXER_ABI_VERSION
}

/// # Safety
/// `config` must point to a readable `FeRustMixerConfig` for this call.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_mixer_create(
    config: *const FeRustMixerConfig,
) -> *mut std::ffi::c_void {
    if config.is_null() {
        return std::ptr::null_mut();
    }
    catch_unwind(AssertUnwindSafe(|| {
        let config = unsafe { *config };
        if !validate_mixer_config(&config) {
            return std::ptr::null_mut();
        }
        let params = clean_params();
        let reverb_stride = ((config.sample_rate as f32 * 0.321).ceil() as usize).max(2);
        let initial = PreparedSnapshot {
            revision: 0,
            ramp_frames: 0,
            params,
            derived: DerivedParameters::from_params(
                &params,
                config.sample_rate as f32,
                reverb_stride,
            ),
        };
        Box::into_raw(Box::new(MixerHandle {
            publication: SnapshotPublication::new(initial),
            control: Mutex::new(MixerControl {
                active_revision: 0,
                active_snapshot: initial,
                staged: None,
            }),
            process_failures: AtomicU64::new(0),
            sample_rate: config.sample_rate as f32,
            reverb_stride,
            dsp: UnsafeCell::new(MixerDsp::new(&config, initial)),
        }))
        .cast()
    }))
    .unwrap_or(std::ptr::null_mut())
}

/// # Safety
/// `handle` must be live and `params` must point to a readable full v1 structure.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_mixer_stage_params(
    handle: *mut std::ffi::c_void,
    revision: u64,
    params: *const FeRustMixerParams,
) -> i32 {
    if handle.is_null() || params.is_null() || revision == 0 {
        return FE_RUST_MIXER_INVALID_ARGUMENT;
    }
    catch_unwind(AssertUnwindSafe(|| {
        let mixer = unsafe { &*handle.cast::<MixerHandle>() };
        let params = unsafe { *params };
        if !validate_mixer_params(&params) {
            return FE_RUST_MIXER_INVALID_ARGUMENT;
        }
        let mut control = match mixer.control.lock() {
            Ok(value) => value,
            Err(_) => return FE_RUST_MIXER_PANIC,
        };
        if revision <= control.active_revision
            || control
                .staged
                .as_ref()
                .is_some_and(|existing| revision <= existing.revision)
        {
            return FE_RUST_MIXER_INVALID_REVISION;
        }
        control.staged = Some(PreparedSnapshot {
            revision,
            ramp_frames: 0,
            params,
            derived: DerivedParameters::from_params(
                &params,
                mixer.sample_rate,
                mixer.reverb_stride,
            ),
        });
        FE_RUST_MIXER_OK
    }))
    .unwrap_or(FE_RUST_MIXER_PANIC)
}

/// # Safety
/// `handle` must be a live mixer handle. This control-thread call may lock.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_mixer_commit(
    handle: *mut std::ffi::c_void,
    revision: u64,
    ramp_frames: u32,
) -> i32 {
    if handle.is_null() {
        return FE_RUST_MIXER_INVALID_ARGUMENT;
    }
    catch_unwind(AssertUnwindSafe(|| {
        let mixer = unsafe { &*handle.cast::<MixerHandle>() };
        let mut control = match mixer.control.lock() {
            Ok(value) => value,
            Err(_) => return FE_RUST_MIXER_PANIC,
        };
        let Some(mut snapshot) = control.staged else {
            return FE_RUST_MIXER_INVALID_REVISION;
        };
        if revision != snapshot.revision || revision <= control.active_revision {
            return FE_RUST_MIXER_INVALID_REVISION;
        }
        snapshot.ramp_frames = ramp_frames;
        if !mixer.publication.publish(snapshot) {
            return FE_RUST_MIXER_BUSY;
        }
        control.active_revision = revision;
        control.active_snapshot = snapshot;
        control.staged = None;
        FE_RUST_MIXER_OK
    }))
    .unwrap_or(FE_RUST_MIXER_PANIC)
}

/// # Safety
/// `handle` must be live; `pcm` must contain `frames * channels` writable floats.
/// Process calls for one handle must be serialized by the host.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_mixer_process(
    handle: *mut std::ffi::c_void,
    pcm: *mut f32,
    frames: u32,
    channels: u32,
) -> i32 {
    if handle.is_null() || pcm.is_null() || frames == 0 || !matches!(channels, 2 | 6 | 8) {
        return FE_RUST_MIXER_INVALID_ARGUMENT;
    }
    catch_unwind(AssertUnwindSafe(|| {
        let mixer = unsafe { &*handle.cast::<MixerHandle>() };
        // SAFETY: the public contract serializes process/reset for one handle;
        // all concurrent control calls remain on shared references and never
        // access the audio-owned UnsafeCell.
        let dsp = unsafe { &mut *mixer.dsp.get() };
        if frames as usize > dsp.max_frames {
            mixer.process_failures.fetch_add(1, Ordering::Relaxed);
            return FE_RUST_MIXER_INVALID_ARGUMENT;
        }
        let samples = match (frames as usize).checked_mul(channels as usize) {
            Some(value) => value,
            None => return FE_RUST_MIXER_INVALID_ARGUMENT,
        };
        if let Some(snapshot) = mixer.publication.try_load() {
            dsp.accept_snapshot(snapshot);
        }
        let pcm = unsafe { std::slice::from_raw_parts_mut(pcm, samples) };
        dsp.process(pcm, frames as usize, channels as usize);
        FE_RUST_MIXER_OK
    }))
    .unwrap_or_else(|_| {
        if !handle.is_null() {
            unsafe { &*handle.cast::<MixerHandle>() }
                .process_failures
                .fetch_add(1, Ordering::Relaxed);
        }
        FE_RUST_MIXER_PANIC
    })
}

/// # Safety
/// Both pointers must be valid; status must advertise a writable full v1 structure.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_mixer_get_status(
    handle: *const std::ffi::c_void,
    status: *mut FeRustMixerStatus,
) -> i32 {
    if handle.is_null() || status.is_null() {
        return FE_RUST_MIXER_INVALID_ARGUMENT;
    }
    catch_unwind(AssertUnwindSafe(|| {
        let requested_size = unsafe { std::ptr::addr_of!((*status).struct_size).read() };
        let requested_version = unsafe { std::ptr::addr_of!((*status).abi_version).read() };
        if (requested_size as usize) < size_of::<FeRustMixerStatus>()
            || requested_version != FE_RUST_MIXER_ABI_VERSION
        {
            return FE_RUST_MIXER_INVALID_ARGUMENT;
        }
        let mixer = unsafe { &*handle.cast::<MixerHandle>() };
        let control = match mixer.control.lock() {
            Ok(value) => value,
            Err(_) => return FE_RUST_MIXER_PANIC,
        };
        unsafe {
            *status = FeRustMixerStatus {
                active_revision: control.active_revision,
                staged_revision: control.staged.as_ref().map_or(0, |value| value.revision),
                process_failures: mixer.process_failures.load(Ordering::Relaxed),
                enabled: control.active_snapshot.params.enabled,
                ..FeRustMixerStatus::default()
            }
        };
        FE_RUST_MIXER_OK
    }))
    .unwrap_or(FE_RUST_MIXER_PANIC)
}

/// # Safety
/// `handle` must be a live mixer handle and serialized with process calls.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_mixer_reset(handle: *mut std::ffi::c_void) -> i32 {
    if handle.is_null() {
        return FE_RUST_MIXER_INVALID_ARGUMENT;
    }
    catch_unwind(AssertUnwindSafe(|| {
        let mixer = unsafe { &*handle.cast::<MixerHandle>() };
        let snapshot = match mixer.control.lock() {
            Ok(value) => value.active_snapshot,
            Err(_) => return FE_RUST_MIXER_PANIC,
        };
        // SAFETY: reset is required to be serialized with process.
        let dsp = unsafe { &mut *mixer.dsp.get() };
        dsp.reset_to_snapshot(snapshot);
        FE_RUST_MIXER_OK
    }))
    .unwrap_or(FE_RUST_MIXER_PANIC)
}

/// # Safety
/// `handle` must be null or a live mixer handle transferred exactly once.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_mixer_destroy(handle: *mut std::ffi::c_void) {
    if !handle.is_null() {
        let _ = catch_unwind(AssertUnwindSafe(|| {
            drop(unsafe { Box::from_raw(handle.cast::<MixerHandle>()) })
        }));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(output_channels: u32) -> FeRustUpmixConfig {
        FeRustUpmixConfig {
            struct_size: size_of::<FeRustUpmixConfig>() as u32,
            abi_version: ABI_VERSION,
            sample_rate: 48_000,
            output_channels,
            algorithm: 1,
            center_width_hz: 300.0,
            lfe_crossover_hz: 120.0,
            lfe_gain: 0.707,
            center_gain: 0.707,
            surround_gain: 0.5,
            decorrelation_amount: 0.7,
        }
    }

    #[test]
    fn stereo_expands_to_supported_layouts() {
        for channels in [6_u32, 8_u32] {
            let mut handle = create_handle(&config(channels)).expect("create upmixer");
            let frames = 1024;
            let mut input = vec![0.0_f32; frames * 2];
            for frame in 0..frames {
                let phase = frame as f32 * 440.0 * std::f32::consts::TAU / 48_000.0;
                input[frame * 2] = phase.sin() * 0.25;
                input[frame * 2 + 1] = (phase + 0.4).sin() * 0.20;
            }
            let mut output = vec![0.0_f32; frames * channels as usize];
            assert_eq!(
                process_block(&mut handle, &input, frames, &mut output),
                RESULT_OK
            );
            assert!(output.iter().all(|sample| sample.is_finite()));
            assert!(output.iter().any(|sample| sample.abs() > 0.001));
            let surround_energy: f32 = output
                .chunks_exact(channels as usize)
                .map(|frame| frame[4].abs() + frame[5].abs())
                .sum();
            assert!(surround_energy > 0.01);
        }
    }

    #[test]
    fn rejects_invalid_config_and_buffer_size() {
        let mut invalid = config(2);
        assert!(create_handle(&invalid).is_none());
        invalid.output_channels = 6;
        let mut handle = create_handle(&invalid).expect("valid upmixer");
        assert_eq!(
            process_block(&mut handle, &[0.0, 0.0], 1, &mut [0.0; 5]),
            RESULT_INVALID_ARGUMENT
        );
    }

    #[test]
    fn upmix_preserves_finite_headroom_without_internal_hard_clip() {
        let mut upmix_config = config(6);
        upmix_config.center_gain = 2.0;
        upmix_config.surround_gain = 2.0;
        upmix_config.lfe_gain = 2.0;
        let mut handle = create_handle(&upmix_config).expect("upmix handle");
        let frames = 256;
        let input = vec![1.0_f32; frames * 2];
        let mut output = vec![0.0_f32; frames * 6];
        assert_eq!(
            process_block(&mut handle, &input, frames, &mut output),
            RESULT_OK
        );
        assert!(output.iter().all(|sample| sample.is_finite()));
        assert!(
            output.iter().any(|sample| sample.abs() > 1.0),
            "upmix unexpectedly hard-clipped all internal headroom"
        );
    }

    #[test]
    fn lfe_is_continuous_across_transport_batches() {
        let batch_frames = 4096_usize;
        let total_frames = batch_frames * 2;
        let mut input = vec![0.0_f32; total_frames * 2];
        for (frame, stereo) in input.chunks_exact_mut(2).enumerate() {
            let phase = frame as f32 * 61.0 * std::f32::consts::TAU / 48_000.0;
            stereo[0] = phase.sin() * 0.3;
            stereo[1] = (phase + 0.21).sin() * 0.27;
        }

        for algorithm in [1_u32, 2_u32] {
            for channels in [6_usize, 8_usize] {
                let mut upmix_config = config(channels as u32);
                upmix_config.algorithm = algorithm;
                let mut one_call = create_handle(&upmix_config).expect("one-call handle");
                let mut one_call_output = vec![0.0_f32; total_frames * channels];
                assert_eq!(
                    process_block(&mut one_call, &input, total_frames, &mut one_call_output,),
                    RESULT_OK
                );

                let mut split = create_handle(&upmix_config).expect("split handle");
                let mut split_output = vec![0.0_f32; total_frames * channels];
                assert_eq!(
                    process_block(
                        &mut split,
                        &input[..batch_frames * 2],
                        batch_frames,
                        &mut split_output[..batch_frames * channels],
                    ),
                    RESULT_OK
                );
                assert_eq!(
                    process_block(
                        &mut split,
                        &input[batch_frames * 2..],
                        batch_frames,
                        &mut split_output[batch_frames * channels..],
                    ),
                    RESULT_OK
                );

                for frame in 0..total_frames {
                    let lfe_index = frame * channels + 3;
                    assert!(
                        (one_call_output[lfe_index] - split_output[lfe_index]).abs() < 1.0e-6,
                        "LFE diverged at frame {frame} for algorithm {algorithm}, {channels}ch"
                    );
                }
            }
        }
    }

    #[test]
    fn reset_restores_lfe_initial_state() {
        let frames = 4096_usize;
        let channels = 6_usize;
        let input = vec![0.25_f32; frames * 2];
        let mut handle = create_handle(&config(channels as u32)).expect("handle");
        let mut first = vec![0.0_f32; frames * channels];
        let mut continued = vec![0.0_f32; frames * channels];
        let mut reset = vec![0.0_f32; frames * channels];

        assert_eq!(
            process_block(&mut handle, &input, frames, &mut first),
            RESULT_OK
        );
        assert_eq!(
            process_block(&mut handle, &input, frames, &mut continued),
            RESULT_OK
        );
        reset_handle(&mut handle);
        assert_eq!(
            process_block(&mut handle, &input, frames, &mut reset),
            RESULT_OK
        );

        let first_lfe = first[3];
        let continued_lfe = continued[3];
        let reset_lfe = reset[3];
        assert!(continued_lfe > first_lfe * 10.0);
        assert!((reset_lfe - first_lfe).abs() < 1.0e-7);
    }

    #[test]
    fn slot_ownership_excludes_two_publishers_while_stale_reader_holds_slot() {
        fn snapshot(revision: u64) -> PreparedSnapshot {
            let mut params = clean_params();
            params.input_gain_db = revision as f32;
            PreparedSnapshot {
                revision,
                ramp_frames: 0,
                params,
                derived: DerivedParameters::from_params(&params, 48_000.0, 15_409),
            }
        }

        let publication = SnapshotPublication::new(snapshot(0));
        // Force the reviewed ordering: reader observes and owns old active A;
        // two publications advance to B then would otherwise reuse A.
        let (observed_token, reader_slot) = publication
            .try_claim_active()
            .expect("reader claims the old active slot");
        assert_eq!(observed_token & 0x3, reader_slot as u64);
        assert!(publication.publish(snapshot(1)));
        assert!(publication.publish(snapshot(2)));
        assert_eq!(publication.copy_claimed(reader_slot).revision, 0);
        publication.release_read(reader_slot);
    }

    #[test]
    fn writer_owned_slot_rejects_reader_claim_before_publication() {
        let publication = SnapshotPublication::new({
            let params = clean_params();
            PreparedSnapshot {
                revision: 0,
                ramp_frames: 0,
                params,
                derived: DerivedParameters::from_params(&params, 48_000.0, 15_409),
            }
        });
        let writer_slot = 1;
        assert!(
            publication.slots[writer_slot]
                .state
                .compare_exchange(SLOT_FREE, SLOT_WRITING, Ordering::AcqRel, Ordering::Acquire,)
                .is_ok()
        );
        assert!(
            publication.slots[writer_slot]
                .state
                .compare_exchange(SLOT_FREE, SLOT_READING, Ordering::AcqRel, Ordering::Acquire,)
                .is_err()
        );
        publication.slots[writer_slot]
            .state
            .store(SLOT_FREE, Ordering::Release);
    }

    fn mixer_dsp_for(params: FeRustMixerParams) -> MixerDsp {
        let config = FeRustMixerConfig {
            max_frames_per_call: 256,
            ..FeRustMixerConfig::default()
        };
        let stride = ((config.sample_rate as f32 * 0.321).ceil() as usize).max(2);
        let snapshot = PreparedSnapshot {
            revision: 1,
            ramp_frames: 0,
            params,
            derived: DerivedParameters::from_params(
                &params,
                config.sample_rate as f32,
                stride,
            ),
        };
        MixerDsp::new(&config, snapshot)
    }

    fn render_reverb_impulse(params: FeRustMixerParams, frames: usize) -> Vec<[f32; 2]> {
        let mut dsp = mixer_dsp_for(params);
        let mut rendered = Vec::with_capacity(frames);
        let mut processed = 0;
        while processed < frames {
            let block_frames = (frames - processed).min(256);
            let mut block = vec![0.0_f32; block_frames * 2];
            if processed == 0 {
                block[0] = 0.5;
                block[1] = 0.5;
            }
            dsp.process(&mut block, block_frames, 2);
            rendered.extend(block.chunks_exact(2).map(|frame| [frame[0], frame[1]]));
            processed += block_frames;
        }
        rendered
    }

    #[test]
    fn reverb_uses_four_line_decorrelated_stable_fdn() {
        let mut params = mixer_preset_params(2).expect("hall preset");
        params.limiter_enabled = 0;
        params.reverb_wet = 1.0;
        params.reverb_dry = 0.0;
        let frames = 48_000 * 3;
        let rendered = render_reverb_impulse(params, frames);
        assert!(rendered.iter().flatten().all(|sample| sample.is_finite()));
        assert!(rendered.iter().flatten().all(|sample| sample.abs() < 2.0));

        let tail = &rendered[9_600..];
        let mut dot = 0.0_f64;
        let mut left_square = 0.0_f64;
        let mut right_square = 0.0_f64;
        let mut dense_frames = 0_usize;
        for frame in tail {
            dot += frame[0] as f64 * frame[1] as f64;
            left_square += frame[0] as f64 * frame[0] as f64;
            right_square += frame[1] as f64 * frame[1] as f64;
            if frame[0].abs() + frame[1].abs() > 1.0e-7 {
                dense_frames += 1;
            }
        }
        let correlation = dot / (left_square * right_square).sqrt().max(1.0e-20);
        assert!(correlation.abs() < 0.85, "stereo tail correlation={correlation}");
        assert!(
            dense_frames * 5 > tail.len(),
            "tail is too sparse: {dense_frames}/{}",
            tail.len()
        );

        let window_energy = |start: usize, end: usize| -> f64 {
            rendered[start..end]
                .iter()
                .map(|frame| frame[0] as f64 * frame[0] as f64
                    + frame[1] as f64 * frame[1] as f64)
                .sum::<f64>()
                / (2 * (end - start)) as f64
        };
        let early = window_energy(9_600, 38_400);
        let late = window_energy(96_000, 134_400);
        println!(
            "fdn_quality correlation={correlation:.6} dense_ratio={:.6} early_energy={early:.9} late_energy={late:.9}",
            dense_frames as f64 / tail.len() as f64,
        );
        assert!(early > 1.0e-10, "missing audible early tail");
        assert!(late > 1.0e-14, "tail ended discontinuously");
        assert!(late < early, "unstable decay: early={early}, late={late}");
    }

    #[test]
    fn reverb_process_keeps_preallocated_storage_and_realtime_budget() {
        let mut params = mixer_preset_params(1).expect("bathroom preset");
        params.limiter_enabled = 0;
        let mut dsp = mixer_dsp_for(params);
        let pointer = dsp.reverb.as_ptr();
        let capacity = dsp.reverb.capacity();
        assert_eq!(dsp.reverb.len(), dsp.reverb_stride * MIXER_MAX_CHANNELS * 4);
        let mut block = vec![0.01_f32; 256 * 8];
        let started = std::time::Instant::now();
        for _ in 0..375 {
            dsp.process(&mut block, 256, 8);
        }
        let elapsed = started.elapsed();
        println!(
            "fdn_performance rendered_seconds=2.0 elapsed_ms={:.3}",
            elapsed.as_secs_f64() * 1_000.0,
        );
        assert_eq!(dsp.reverb.as_ptr(), pointer);
        assert_eq!(dsp.reverb.capacity(), capacity);
        assert!(elapsed.as_secs_f64() < 0.5, "2 s render took {elapsed:?}");
    }

    #[test]
    fn mixer_has_no_internal_hard_clip_and_zero_blend_is_dry_through() {
        let mut disabled = clean_params();
        disabled.enabled = 0;
        disabled.limiter_enabled = 0;
        let mut disabled_dsp = mixer_dsp_for(disabled);
        let mut disabled_pcm = [1.25_f32, -1.25_f32];
        disabled_dsp.process(&mut disabled_pcm, 1, 2);
        assert_eq!(disabled_pcm, [1.25, -1.25]);

        let mut boosted = clean_params();
        boosted.limiter_enabled = 0;
        boosted.output_gain_db = 6.0;
        let mut boosted_dsp = mixer_dsp_for(boosted);
        let mut boosted_pcm = [0.8_f32, -0.8_f32];
        boosted_dsp.process(&mut boosted_pcm, 1, 2);
        assert!(boosted_pcm[0] > 1.5 && boosted_pcm[1] < -1.5);

        let mut zero_blend = clean_params();
        zero_blend.reverb_enabled = 1;
        zero_blend.limiter_enabled = 0;
        zero_blend.reverb_wet = 0.0;
        zero_blend.reverb_dry = 0.0;
        let mut zero_dsp = mixer_dsp_for(zero_blend);
        let mut zero_pcm = [0.25_f32, -0.25_f32];
        zero_dsp.process(&mut zero_pcm, 1, 2);
        assert!((zero_pcm[0] - 0.25).abs() < 1.0e-6);
        assert!((zero_pcm[1] + 0.25).abs() < 1.0e-6);
    }

    #[test]
    fn surround_preset_does_not_double_attenuate_upmix_stage() {
        let params = mixer_preset_params(3).expect("surround preset");
        assert_eq!(params.input_gain_db, -6.0);
        assert_eq!(params.stereo_width, 1.2);
        assert_eq!(params.center_gain, 1.0);
        assert_eq!(params.surround_gain, 1.0);
        assert_eq!(params.lfe_gain, 1.0);
    }

    #[test]
    fn busy_commit_preserves_staged_and_active_state_for_same_revision_retry() {
        let config = FeRustMixerConfig::default();
        let handle = unsafe { fe_rust_mixer_create(&config) };
        assert!(!handle.is_null());
        let mixer = unsafe { &*handle.cast::<MixerHandle>() };
        let active_slot = (mixer.publication.active_token.load(Ordering::Acquire) & 0x3) as usize;
        for slot in 0..MIXER_SNAPSHOT_SLOTS {
            if slot != active_slot {
                mixer.publication.slots[slot]
                    .state
                    .store(SLOT_READING, Ordering::Release);
            }
        }
        let params = clean_params();
        assert_eq!(unsafe { fe_rust_mixer_stage_params(handle, 1, &params) }, 0);
        assert_eq!(
            unsafe { fe_rust_mixer_commit(handle, 1, 0) },
            FE_RUST_MIXER_BUSY
        );
        let mut status = FeRustMixerStatus::default();
        assert_eq!(unsafe { fe_rust_mixer_get_status(handle, &mut status) }, 0);
        assert_eq!((status.active_revision, status.staged_revision), (0, 1));
        for slot in 0..MIXER_SNAPSHOT_SLOTS {
            if slot != active_slot {
                mixer.publication.slots[slot]
                    .state
                    .store(SLOT_FREE, Ordering::Release);
            }
        }
        assert_eq!(unsafe { fe_rust_mixer_commit(handle, 1, 0) }, 0);
        assert_eq!(unsafe { fe_rust_mixer_get_status(handle, &mut status) }, 0);
        assert_eq!((status.active_revision, status.staged_revision), (1, 0));
        unsafe { fe_rust_mixer_destroy(handle) };
    }
}
