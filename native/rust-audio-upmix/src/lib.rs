use oximedia_audiopost::surround_upmix::{
    SurroundUpmixer, UpmixAlgorithm, UpmixConfig,
};
use std::panic::{AssertUnwindSafe, catch_unwind};

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
                sample.clamp(-1.0, 1.0)
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
        let output_slice =
            unsafe { std::slice::from_raw_parts_mut(output, required_output) };
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
                let mut one_call =
                    create_handle(&upmix_config).expect("one-call handle");
                let mut one_call_output = vec![0.0_f32; total_frames * channels];
                assert_eq!(
                    process_block(
                        &mut one_call,
                        &input,
                        total_frames,
                        &mut one_call_output,
                    ),
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
                        (one_call_output[lfe_index] - split_output[lfe_index]).abs()
                            < 1.0e-6,
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
}
