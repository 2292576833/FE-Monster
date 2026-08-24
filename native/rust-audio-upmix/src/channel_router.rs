//! Allocation-free stereo-to-surround routing and per-channel control ABI.
//!
//! This module is additive: it does not change the legacy upmix ABI.  Its
//! canonical 7.1 sample order is FFmpeg/OBS order
//! `FL, FR, FC, LFE, BL, BR, SL, SR`; 5.1 is
//! `FL, FR, FC, LFE, SL, SR`.
//!
//! Sources:
//! - https://ffmpeg.org/ffmpeg-all.html#Channel-Layout
//! - https://obsproject.com/kb/surround-sound-guide
//! - https://docs.juce.com/master/classjuce_1_1AbstractFifo.html

use std::cell::UnsafeCell;
use std::mem::size_of;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};

pub const CHANNEL_ROUTER_ABI_VERSION: u32 = 1;
pub const MAX_CHANNELS: usize = 8;
pub const MAX_MATRIX_COEFFICIENTS: usize = MAX_CHANNELS * 2;
const SNAPSHOT_SLOTS: usize = 3;
const BUILTIN_DECORRELATION_MAX_MS: f32 = 15.0;
// Keeps stereo/downmix loudness near bypass while leaving limiter headroom for
// the additional center, LFE and surround energy.
const BUILTIN_UPMIX_HEADROOM: f32 = 0.79;
const SLOT_FREE: u32 = 0;
const SLOT_READING: u32 = 1;
const SLOT_WRITING: u32 = 2;

pub const RESULT_OK: i32 = 0;
pub const RESULT_INVALID_ARGUMENT: i32 = -1;
pub const RESULT_INVALID_REVISION: i32 = -2;
pub const RESULT_UNSUPPORTED: i32 = -3;
pub const RESULT_BUSY: i32 = -5;
pub const RESULT_PANIC: i32 = -4;

pub const ALGORITHM_FRONT_ONLY: u32 = 0;
pub const ALGORITHM_MATRIX_DECODE: u32 = 1;
pub const ALGORITHM_AMBIENT_EXTRACT: u32 = 2;
pub const ALGORITHM_CUSTOM_MATRIX: u32 = 3;
pub const ALGORITHM_DOLBY_PRO_LOGIC_II: u32 = 100;
pub const ALGORITHM_DOLBY_PRO_LOGIC_IIX: u32 = 101;
pub const ALGORITHM_DTS_NEURAL_X: u32 = 200;
pub const ALGORITHM_UNAVAILABLE: u32 = 0;
pub const ALGORITHM_AVAILABLE: u32 = 1;
pub const ALGORITHM_LICENSE_REQUIRED: u32 = 2;

pub const CHANNEL_FRONT_LEFT: u32 = 0;
pub const CHANNEL_FRONT_RIGHT: u32 = 1;
pub const CHANNEL_FRONT_CENTER: u32 = 2;
pub const CHANNEL_LFE: u32 = 3;
pub const CHANNEL_BACK_LEFT: u32 = 4;
pub const CHANNEL_BACK_RIGHT: u32 = 5;
pub const CHANNEL_SIDE_LEFT: u32 = 6;
pub const CHANNEL_SIDE_RIGHT: u32 = 7;

pub const TEST_SIGNAL_TONE: u32 = 0;
pub const TEST_SIGNAL_IMPULSE: u32 = 1;

pub fn algorithm_availability(algorithm: u32) -> u32 {
    match algorithm {
        ALGORITHM_FRONT_ONLY
        | ALGORITHM_MATRIX_DECODE
        | ALGORITHM_AMBIENT_EXTRACT
        | ALGORITHM_CUSTOM_MATRIX => ALGORITHM_AVAILABLE,
        ALGORITHM_DOLBY_PRO_LOGIC_II | ALGORITHM_DOLBY_PRO_LOGIC_IIX | ALGORITHM_DTS_NEURAL_X => {
            ALGORITHM_LICENSE_REQUIRED
        }
        _ => ALGORITHM_UNAVAILABLE,
    }
}

pub fn canonical_channel_role(channels: u32, index: u32) -> Option<u32> {
    const LAYOUT_51: [u32; 6] = [
        CHANNEL_FRONT_LEFT,
        CHANNEL_FRONT_RIGHT,
        CHANNEL_FRONT_CENTER,
        CHANNEL_LFE,
        CHANNEL_SIDE_LEFT,
        CHANNEL_SIDE_RIGHT,
    ];
    const LAYOUT_71: [u32; 8] = [
        CHANNEL_FRONT_LEFT,
        CHANNEL_FRONT_RIGHT,
        CHANNEL_FRONT_CENTER,
        CHANNEL_LFE,
        CHANNEL_BACK_LEFT,
        CHANNEL_BACK_RIGHT,
        CHANNEL_SIDE_LEFT,
        CHANNEL_SIDE_RIGHT,
    ];
    match channels {
        6 => LAYOUT_51.get(index as usize).copied(),
        8 => LAYOUT_71.get(index as usize).copied(),
        _ => None,
    }
}

fn finite_in_range(value: f32, minimum: f32, maximum: f32) -> bool {
    value.is_finite() && value >= minimum && value <= maximum
}

#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct RouterConfig {
    pub struct_size: u32,
    pub abi_version: u32,
    pub sample_rate: u32,
    pub max_frames_per_call: u32,
    pub output_channels: u32,
    pub max_delay_ms: f32,
    pub reserved: [u32; 4],
}

impl Default for RouterConfig {
    fn default() -> Self {
        Self {
            struct_size: size_of::<Self>() as u32,
            abi_version: CHANNEL_ROUTER_ABI_VERSION,
            sample_rate: 48_000,
            max_frames_per_call: 4_096,
            output_channels: 6,
            max_delay_ms: 100.0,
            reserved: [0; 4],
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RouterParams {
    pub struct_size: u32,
    pub abi_version: u32,
    pub output_channels: u32,
    pub algorithm: u32,
    pub lfe_crossover_hz: f32,
    pub channel_gain_db: [f32; MAX_CHANNELS],
    pub channel_delay_ms: [f32; MAX_CHANNELS],
    pub channel_azimuth_deg: [f32; MAX_CHANNELS],
    /// Row-major `[output channel][stereo input L/R]` matrix.
    pub custom_matrix: [f32; MAX_MATRIX_COEFFICIENTS],
    pub reserved: [u32; 8],
}

impl RouterParams {
    pub fn front_only(output_channels: u32) -> Self {
        let mut matrix = [0.0; MAX_MATRIX_COEFFICIENTS];
        matrix[0] = 1.0;
        matrix[3] = 1.0;
        Self {
            struct_size: size_of::<Self>() as u32,
            abi_version: CHANNEL_ROUTER_ABI_VERSION,
            output_channels,
            algorithm: ALGORITHM_FRONT_ONLY,
            lfe_crossover_hz: 120.0,
            channel_gain_db: [0.0; MAX_CHANNELS],
            channel_delay_ms: [0.0; MAX_CHANNELS],
            channel_azimuth_deg: default_azimuths(output_channels),
            custom_matrix: matrix,
            reserved: [0; 8],
        }
    }
}

impl Default for RouterParams {
    fn default() -> Self {
        Self::front_only(6)
    }
}

fn default_azimuths(channels: u32) -> [f32; MAX_CHANNELS] {
    if channels == 8 {
        [30.0, -30.0, 0.0, 0.0, 135.0, -135.0, 90.0, -90.0]
    } else {
        [30.0, -30.0, 0.0, 0.0, 110.0, -110.0, 0.0, 0.0]
    }
}

fn validate_config(config: &RouterConfig) -> bool {
    config.struct_size as usize >= size_of::<RouterConfig>()
        && config.abi_version == CHANNEL_ROUTER_ABI_VERSION
        && (16_000..=192_000).contains(&config.sample_rate)
        && (1..=65_536).contains(&config.max_frames_per_call)
        && matches!(config.output_channels, 6 | 8)
        && finite_in_range(config.max_delay_ms, 0.0, 250.0)
        && config.reserved == [0; 4]
}

fn validate_params(config: &RouterConfig, params: &RouterParams) -> bool {
    params.struct_size as usize >= size_of::<RouterParams>()
        && params.abi_version == CHANNEL_ROUTER_ABI_VERSION
        && params.output_channels == config.output_channels
        && algorithm_availability(params.algorithm) == ALGORITHM_AVAILABLE
        && finite_in_range(params.lfe_crossover_hz, 20.0, 500.0)
        && params
            .channel_gain_db
            .iter()
            .all(|value| finite_in_range(*value, -60.0, 12.0))
        && params
            .channel_delay_ms
            .iter()
            .all(|value| finite_in_range(*value, 0.0, config.max_delay_ms))
        && params
            .channel_azimuth_deg
            .iter()
            .all(|value| finite_in_range(*value, -180.0, 180.0))
        && params
            .custom_matrix
            .iter()
            .all(|value| finite_in_range(*value, -2.0, 2.0))
        && params.reserved == [0; 8]
}

#[derive(Clone, Copy)]
struct DerivedParams {
    matrix: [f32; MAX_MATRIX_COEFFICIENTS],
    gain: [f32; MAX_CHANNELS],
    delay_frames: [usize; MAX_CHANNELS],
    allpass_coefficient: [f32; MAX_CHANNELS],
    azimuth: [f32; MAX_CHANNELS],
    lfe_alpha: f32,
    algorithm: u32,
}

impl DerivedParams {
    fn from_params(config: &RouterConfig, params: &RouterParams) -> Self {
        let matrix = match params.algorithm {
            ALGORITHM_FRONT_ONLY => front_only_matrix(),
            ALGORITHM_MATRIX_DECODE => matrix_decode_matrix(config.output_channels),
            ALGORITHM_AMBIENT_EXTRACT => ambient_extract_matrix(config.output_channels),
            ALGORITHM_CUSTOM_MATRIX => params.custom_matrix,
            _ => [0.0; MAX_MATRIX_COEFFICIENTS],
        };
        let sample_period = 1.0 / config.sample_rate as f32;
        let time_constant = 1.0 / (std::f32::consts::TAU * params.lfe_crossover_hz);
        Self {
            matrix,
            gain: std::array::from_fn(|channel| {
                10.0_f32.powf(params.channel_gain_db[channel] / 20.0)
            }),
            delay_frames: std::array::from_fn(|channel| {
                let topology_delay = builtin_decorrelation_delay_ms(
                    params.algorithm,
                    config.output_channels,
                    channel,
                );
                ((params.channel_delay_ms[channel] + topology_delay)
                    * 0.001
                    * config.sample_rate as f32)
                    .round() as usize
            }),
            allpass_coefficient: std::array::from_fn(|channel| {
                builtin_decorrelation_allpass(params.algorithm, config.output_channels, channel)
            }),
            azimuth: params.channel_azimuth_deg,
            lfe_alpha: sample_period / (time_constant + sample_period),
            algorithm: params.algorithm,
        }
    }

    fn approach(&mut self, target: &Self, fraction: f32) {
        for coefficient in 0..MAX_MATRIX_COEFFICIENTS {
            self.matrix[coefficient] +=
                (target.matrix[coefficient] - self.matrix[coefficient]) * fraction;
        }
        for channel in 0..MAX_CHANNELS {
            self.gain[channel] += (target.gain[channel] - self.gain[channel]) * fraction;
            self.allpass_coefficient[channel] += (target.allpass_coefficient[channel]
                - self.allpass_coefficient[channel])
                * fraction;
            self.azimuth[channel] += (target.azimuth[channel] - self.azimuth[channel]) * fraction;
        }
        self.lfe_alpha += (target.lfe_alpha - self.lfe_alpha) * fraction;
    }
}

fn builtin_decorrelation_delay_ms(algorithm: u32, channels: u32, channel: usize) -> f32 {
    match (algorithm, channels, channel) {
        // Equal delay inside each L/R pair preserves mirror symmetry. Distinct
        // side/back arrival times keep 7.1 from collapsing into scaled copies.
        (ALGORITHM_MATRIX_DECODE, 6, 4 | 5) => 4.0,
        (ALGORITHM_MATRIX_DECODE, 8, 4 | 5) => 11.0,
        (ALGORITHM_MATRIX_DECODE, 8, 6 | 7) => 4.0,
        // Ambient L/R pairs use equal group delay. Pair decorrelation is done
        // by complementary stable all-pass sections below, so a centered
        // mono/vocal source never acquires a fixed Haas/precedence bias.
        (ALGORITHM_AMBIENT_EXTRACT, 6, 4 | 5) => 7.0,
        (ALGORITHM_AMBIENT_EXTRACT, 8, 4 | 5) => 13.0,
        (ALGORITHM_AMBIENT_EXTRACT, 8, 6 | 7) => 5.0,
        _ => 0.0,
    }
}

fn builtin_decorrelation_allpass(algorithm: u32, channels: u32, channel: usize) -> f32 {
    match (algorithm, channels, channel) {
        // Complementary coefficients have identical onset time and unit
        // magnitude response, while their phase responses decorrelate the
        // paired ambience. At 48 kHz their worst low-frequency group-delay
        // difference remains below 0.2 ms.
        (ALGORITHM_AMBIENT_EXTRACT, 6, 4) => 0.65,
        (ALGORITHM_AMBIENT_EXTRACT, 6, 5) => -0.65,
        (ALGORITHM_AMBIENT_EXTRACT, 8, 4) => 0.72,
        (ALGORITHM_AMBIENT_EXTRACT, 8, 5) => -0.72,
        (ALGORITHM_AMBIENT_EXTRACT, 8, 6) => 0.60,
        (ALGORITHM_AMBIENT_EXTRACT, 8, 7) => -0.60,
        _ => 0.0,
    }
}

fn front_only_matrix() -> [f32; MAX_MATRIX_COEFFICIENTS] {
    let mut result = [0.0; MAX_MATRIX_COEFFICIENTS];
    result[0] = 1.0;
    result[3] = 1.0;
    result
}

fn matrix_decode_matrix_unscaled(channels: u32) -> [f32; MAX_MATRIX_COEFFICIENTS] {
    let mut result = front_only_matrix();
    result[4] = 0.5;
    result[5] = 0.5;
    result[6] = 0.5;
    result[7] = 0.5;
    if channels == 6 {
        result[8] = 0.5;
        result[9] = -0.5;
        result[10] = -0.5;
        result[11] = 0.5;
    } else {
        // FFmpeg/OBS 7.1 order: back pair precedes side pair.
        result[8] = 0.30;
        result[9] = -0.30;
        result[10] = -0.30;
        result[11] = 0.30;
        result[12] = 0.40;
        result[13] = -0.40;
        result[14] = -0.40;
        result[15] = 0.40;
    }
    result
}

fn matrix_decode_matrix(channels: u32) -> [f32; MAX_MATRIX_COEFFICIENTS] {
    let mut result = matrix_decode_matrix_unscaled(channels);
    for coefficient in &mut result {
        *coefficient *= BUILTIN_UPMIX_HEADROOM;
    }
    result
}

fn ambient_extract_matrix(channels: u32) -> [f32; MAX_MATRIX_COEFFICIENTS] {
    let mut result = matrix_decode_matrix_unscaled(channels);
    result[0] = 0.9;
    result[3] = 0.9;
    result[4] = 0.35;
    result[5] = 0.35;
    if channels == 6 {
        result[8] = 0.58;
        result[9] = -0.50;
        result[10] = -0.50;
        result[11] = 0.58;
    } else {
        result[8] = 0.42;
        result[9] = -0.36;
        result[10] = -0.36;
        result[11] = 0.42;
        result[12] = 0.48;
        result[13] = -0.42;
        result[14] = -0.42;
        result[15] = 0.48;
    }
    for coefficient in &mut result {
        *coefficient *= BUILTIN_UPMIX_HEADROOM;
    }
    result
}

#[derive(Clone, Copy)]
struct PreparedSnapshot {
    revision: u64,
    ramp_frames: u32,
    params: RouterParams,
    derived: DerivedParams,
}

struct SnapshotSlot {
    value: UnsafeCell<PreparedSnapshot>,
    state: AtomicU32,
}

struct SnapshotPublication {
    slots: [SnapshotSlot; SNAPSHOT_SLOTS],
    active_token: AtomicU64,
}

// SAFETY: writers are serialized by `ChannelRouter::control`.  Each slot is
// exclusively claimed FREE->WRITING or FREE->READING before non-atomic access.
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
        for slot in 0..SNAPSHOT_SLOTS {
            if slot == active_slot
                || self.slots[slot]
                    .state
                    .compare_exchange(SLOT_FREE, SLOT_WRITING, Ordering::AcqRel, Ordering::Acquire)
                    .is_err()
            {
                continue;
            }
            // SAFETY: this writer exclusively owns the non-active slot.
            unsafe { self.slots[slot].value.get().write(snapshot) };
            let generation = (active >> 2).wrapping_add(1).max(1);
            self.active_token
                .store((generation << 2) | slot as u64, Ordering::Release);
            self.slots[slot].state.store(SLOT_FREE, Ordering::Release);
            return true;
        }
        false
    }

    fn try_load(&self) -> Option<PreparedSnapshot> {
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
            self.slots[slot].state.store(SLOT_FREE, Ordering::Release);
            return None;
        }
        // SAFETY: this reader exclusively owns the slot until release below.
        let snapshot = unsafe { *self.slots[slot].value.get() };
        self.slots[slot].state.store(SLOT_FREE, Ordering::Release);
        Some(snapshot)
    }
}

struct ControlState {
    staged: Option<PreparedSnapshot>,
}

struct Telemetry {
    process_calls: AtomicU64,
    actual: AtomicU32,
    last_result: AtomicU32,
    peak: [AtomicU32; MAX_CHANNELS],
    rms: [AtomicU32; MAX_CHANNELS],
}

impl Telemetry {
    fn new() -> Self {
        Self {
            process_calls: AtomicU64::new(0),
            actual: AtomicU32::new(0),
            last_result: AtomicU32::new(RESULT_OK as u32),
            peak: std::array::from_fn(|_| AtomicU32::new(0.0_f32.to_bits())),
            rms: std::array::from_fn(|_| AtomicU32::new(0.0_f32.to_bits())),
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct RouterStatus {
    pub struct_size: u32,
    pub abi_version: u32,
    pub available: u32,
    pub active: u32,
    pub actual: u32,
    pub output_channels: u32,
    pub algorithm: u32,
    pub last_result: i32,
    pub active_revision: u64,
    pub staged_revision: u64,
    pub process_calls: u64,
    pub channel_peak: [f32; MAX_CHANNELS],
    pub channel_rms: [f32; MAX_CHANNELS],
    pub channel_azimuth_deg: [f32; MAX_CHANNELS],
    pub reserved: [u32; 8],
}

impl Default for RouterStatus {
    fn default() -> Self {
        Self {
            struct_size: size_of::<Self>() as u32,
            abi_version: CHANNEL_ROUTER_ABI_VERSION,
            available: 0,
            active: 0,
            actual: 0,
            output_channels: 0,
            algorithm: ALGORITHM_FRONT_ONLY,
            last_result: RESULT_UNSUPPORTED,
            active_revision: 0,
            staged_revision: 0,
            process_calls: 0,
            channel_peak: [0.0; MAX_CHANNELS],
            channel_rms: [0.0; MAX_CHANNELS],
            channel_azimuth_deg: [0.0; MAX_CHANNELS],
            reserved: [0; 8],
        }
    }
}

pub struct ChannelRouter {
    config: RouterConfig,
    publication: SnapshotPublication,
    control: Mutex<ControlState>,
    active_revision: AtomicU64,
    staged_revision: AtomicU64,
    current_params: RouterParams,
    current: DerivedParams,
    target: DerivedParams,
    ramp_remaining: u32,
    delay: Vec<f32>,
    delay_stride: usize,
    delay_position: usize,
    allpass_input_state: [f32; MAX_CHANNELS],
    allpass_output_state: [f32; MAX_CHANNELS],
    lfe_state: f32,
    telemetry: Telemetry,
}

impl ChannelRouter {
    pub fn new(config: &RouterConfig) -> Option<Self> {
        if !validate_config(config) {
            return None;
        }
        let initial_params = RouterParams::front_only(config.output_channels);
        let initial_derived = DerivedParams::from_params(config, &initial_params);
        let initial = PreparedSnapshot {
            revision: 0,
            ramp_frames: 0,
            params: initial_params,
            derived: initial_derived,
        };
        let delay_stride = (config.sample_rate as f32
            * (config.max_delay_ms + BUILTIN_DECORRELATION_MAX_MS)
            * 0.001)
            .ceil() as usize
            + 1;
        Some(Self {
            config: *config,
            publication: SnapshotPublication::new(initial),
            control: Mutex::new(ControlState { staged: None }),
            active_revision: AtomicU64::new(0),
            staged_revision: AtomicU64::new(0),
            current_params: initial_params,
            current: initial_derived,
            target: initial_derived,
            ramp_remaining: 0,
            delay: vec![0.0; delay_stride * MAX_CHANNELS],
            delay_stride,
            delay_position: 0,
            allpass_input_state: [0.0; MAX_CHANNELS],
            allpass_output_state: [0.0; MAX_CHANNELS],
            lfe_state: 0.0,
            telemetry: Telemetry::new(),
        })
    }

    pub fn stage(&self, revision: u64, params: &RouterParams) -> i32 {
        if !validate_params(&self.config, params) {
            return RESULT_INVALID_ARGUMENT;
        }
        if revision <= self.active_revision.load(Ordering::Acquire) {
            return RESULT_INVALID_REVISION;
        }
        let mut control = match self.control.lock() {
            Ok(control) => control,
            Err(_) => return RESULT_PANIC,
        };
        if revision < self.staged_revision.load(Ordering::Acquire) {
            return RESULT_INVALID_REVISION;
        }
        control.staged = Some(PreparedSnapshot {
            revision,
            ramp_frames: 0,
            params: *params,
            derived: DerivedParams::from_params(&self.config, params),
        });
        self.staged_revision.store(revision, Ordering::Release);
        RESULT_OK
    }

    pub fn commit(&self, revision: u64, ramp_frames: u32) -> i32 {
        let mut control = match self.control.lock() {
            Ok(control) => control,
            Err(_) => return RESULT_PANIC,
        };
        let Some(mut staged) = control.staged else {
            return RESULT_INVALID_REVISION;
        };
        if staged.revision != revision {
            return RESULT_INVALID_REVISION;
        }
        staged.ramp_frames = ramp_frames.min(self.config.sample_rate / 2);
        if !self.publication.publish(staged) {
            return RESULT_BUSY;
        }
        control.staged = None;
        RESULT_OK
    }

    fn accept_snapshot(&mut self) {
        let Some(snapshot) = self.publication.try_load() else {
            return;
        };
        if snapshot.revision == self.active_revision.load(Ordering::Relaxed) {
            return;
        }
        self.current_params = snapshot.params;
        self.target = snapshot.derived;
        // Delay topology changes atomically at the block boundary. Gain,
        // matrix, azimuth metadata and LFE coefficient ramp per sample.
        self.current.delay_frames = snapshot.derived.delay_frames;
        self.current.algorithm = snapshot.derived.algorithm;
        self.ramp_remaining = snapshot.ramp_frames;
        if self.ramp_remaining == 0 {
            self.current = snapshot.derived;
        }
        self.active_revision
            .store(snapshot.revision, Ordering::Release);
    }

    fn ramp_one(&mut self) {
        if self.ramp_remaining == 0 {
            return;
        }
        let fraction = 1.0 / self.ramp_remaining as f32;
        self.current.approach(&self.target, fraction);
        self.ramp_remaining -= 1;
        if self.ramp_remaining == 0 {
            self.current = self.target;
        }
    }

    pub fn process(&mut self, input: &[f32], frames: usize, output: &mut [f32]) -> i32 {
        if frames == 0
            || frames > self.config.max_frames_per_call as usize
            || input.len() != frames * 2
            || output.len() != frames * self.config.output_channels as usize
        {
            self.telemetry
                .last_result
                .store(RESULT_INVALID_ARGUMENT as u32, Ordering::Release);
            return RESULT_INVALID_ARGUMENT;
        }
        self.accept_snapshot();
        let channels = self.config.output_channels as usize;
        let mut peak = [0.0_f32; MAX_CHANNELS];
        let mut sum_squares = [0.0_f32; MAX_CHANNELS];
        for frame in 0..frames {
            self.ramp_one();
            let left = if input[frame * 2].is_finite() {
                input[frame * 2]
            } else {
                0.0
            };
            let right = if input[frame * 2 + 1].is_finite() {
                input[frame * 2 + 1]
            } else {
                0.0
            };
            for channel in 0..channels {
                let coefficient = channel * 2;
                let mut sample = left * self.current.matrix[coefficient]
                    + right * self.current.matrix[coefficient + 1];
                if channel == CHANNEL_LFE as usize && self.current.algorithm != ALGORITHM_FRONT_ONLY
                {
                    self.lfe_state += self.current.lfe_alpha * (sample - self.lfe_state);
                    sample = self.lfe_state;
                }
                sample *= self.current.gain[channel];
                if !sample.is_finite() {
                    sample = 0.0;
                }
                let delay_base = channel * self.delay_stride;
                self.delay[delay_base + self.delay_position] = sample;
                let delay_frames = self.current.delay_frames[channel].min(self.delay_stride - 1);
                let read_position =
                    (self.delay_position + self.delay_stride - delay_frames) % self.delay_stride;
                let delayed = self.delay[delay_base + read_position];
                let allpass = self.current.allpass_coefficient[channel];
                let rendered = if allpass.abs() > f32::EPSILON {
                    // First-order all-pass: H(z)=(a+z^-1)/(1+a*z^-1).
                    // This is stable for |a|<1 and uses fixed scalar state.
                    let value = allpass * delayed + self.allpass_input_state[channel]
                        - allpass * self.allpass_output_state[channel];
                    self.allpass_input_state[channel] = delayed;
                    self.allpass_output_state[channel] = value;
                    value
                } else {
                    self.allpass_input_state[channel] = delayed;
                    self.allpass_output_state[channel] = delayed;
                    delayed
                };
                output[frame * channels + channel] = rendered;
                peak[channel] = peak[channel].max(rendered.abs());
                sum_squares[channel] += rendered * rendered;
            }
            self.delay_position += 1;
            if self.delay_position == self.delay_stride {
                self.delay_position = 0;
            }
        }
        for channel in 0..MAX_CHANNELS {
            let rms = if channel < channels {
                (sum_squares[channel] / frames as f32).sqrt()
            } else {
                0.0
            };
            self.telemetry.peak[channel].store(peak[channel].to_bits(), Ordering::Release);
            self.telemetry.rms[channel].store(rms.to_bits(), Ordering::Release);
        }
        self.telemetry.process_calls.fetch_add(1, Ordering::Relaxed);
        self.telemetry.actual.store(1, Ordering::Release);
        self.telemetry
            .last_result
            .store(RESULT_OK as u32, Ordering::Release);
        RESULT_OK
    }

    pub fn reset(&mut self) {
        self.delay.fill(0.0);
        self.delay_position = 0;
        self.allpass_input_state.fill(0.0);
        self.allpass_output_state.fill(0.0);
        self.lfe_state = 0.0;
        self.telemetry.actual.store(0, Ordering::Release);
        for channel in 0..MAX_CHANNELS {
            self.telemetry.peak[channel].store(0.0_f32.to_bits(), Ordering::Release);
            self.telemetry.rms[channel].store(0.0_f32.to_bits(), Ordering::Release);
        }
    }

    pub fn status(&self) -> RouterStatus {
        RouterStatus {
            struct_size: size_of::<RouterStatus>() as u32,
            abi_version: CHANNEL_ROUTER_ABI_VERSION,
            available: 1,
            active: 1,
            actual: self.telemetry.actual.load(Ordering::Acquire),
            output_channels: self.config.output_channels,
            algorithm: self.current.algorithm,
            last_result: self.telemetry.last_result.load(Ordering::Acquire) as i32,
            active_revision: self.active_revision.load(Ordering::Acquire),
            staged_revision: self.staged_revision.load(Ordering::Acquire),
            process_calls: self.telemetry.process_calls.load(Ordering::Acquire),
            channel_peak: std::array::from_fn(|channel| {
                f32::from_bits(self.telemetry.peak[channel].load(Ordering::Acquire))
            }),
            channel_rms: std::array::from_fn(|channel| {
                f32::from_bits(self.telemetry.rms[channel].load(Ordering::Acquire))
            }),
            channel_azimuth_deg: self.current.azimuth,
            reserved: [0; 8],
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct TestSignalConfig {
    pub struct_size: u32,
    pub abi_version: u32,
    pub sample_rate: u32,
    pub output_channels: u32,
    pub channel_index: u32,
    pub kind: u32,
    pub frequency_hz: f32,
    pub gain_db: f32,
    pub reserved: [u32; 4],
}

impl Default for TestSignalConfig {
    fn default() -> Self {
        Self {
            struct_size: size_of::<Self>() as u32,
            abi_version: CHANNEL_ROUTER_ABI_VERSION,
            sample_rate: 48_000,
            output_channels: 6,
            channel_index: 0,
            kind: TEST_SIGNAL_TONE,
            frequency_hz: 997.0,
            gain_db: -18.0,
            reserved: [0; 4],
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, Debug)]
pub struct TestSignalState {
    pub phase: f32,
    pub impulse_emitted: u32,
    pub reserved: [u32; 6],
}

impl Default for TestSignalState {
    fn default() -> Self {
        Self {
            phase: 0.0,
            impulse_emitted: 0,
            reserved: [0; 6],
        }
    }
}

fn validate_test_signal(config: &TestSignalConfig) -> bool {
    config.struct_size as usize >= size_of::<TestSignalConfig>()
        && config.abi_version == CHANNEL_ROUTER_ABI_VERSION
        && (16_000..=192_000).contains(&config.sample_rate)
        && matches!(config.output_channels, 2 | 6 | 8)
        && config.channel_index < config.output_channels
        && matches!(config.kind, TEST_SIGNAL_TONE | TEST_SIGNAL_IMPULSE)
        && finite_in_range(
            config.frequency_hz,
            20.0,
            (config.sample_rate as f32 * 0.45).min(20_000.0),
        )
        && finite_in_range(config.gain_db, -60.0, 0.0)
        && config.reserved == [0; 4]
}

pub fn generate_test_signal(
    config: &TestSignalConfig,
    state: &mut TestSignalState,
    frames: usize,
    output: &mut [f32],
) -> i32 {
    let required = match frames.checked_mul(config.output_channels as usize) {
        Some(value) => value,
        None => return RESULT_INVALID_ARGUMENT,
    };
    if frames == 0
        || frames > 65_536
        || output.len() != required
        || !validate_test_signal(config)
        || !state.phase.is_finite()
        || state.reserved != [0; 6]
    {
        return RESULT_INVALID_ARGUMENT;
    }
    output.fill(0.0);
    let channels = config.output_channels as usize;
    let channel = config.channel_index as usize;
    let amplitude = 10.0_f32.powf(config.gain_db / 20.0);
    if config.kind == TEST_SIGNAL_IMPULSE {
        if state.impulse_emitted == 0 {
            output[channel] = amplitude;
            state.impulse_emitted = 1;
        }
        return RESULT_OK;
    }
    let phase_step = std::f32::consts::TAU * config.frequency_hz / config.sample_rate as f32;
    let mut phase = state.phase;
    for frame in 0..frames {
        output[frame * channels + channel] = phase.sin() * amplitude;
        phase += phase_step;
        if phase >= std::f32::consts::TAU {
            phase -= std::f32::consts::TAU;
        }
    }
    state.phase = phase;
    RESULT_OK
}

#[unsafe(no_mangle)]
pub extern "C" fn fe_rust_channel_router_abi_version() -> u32 {
    CHANNEL_ROUTER_ABI_VERSION
}

#[unsafe(no_mangle)]
pub extern "C" fn fe_rust_channel_router_algorithm_availability(algorithm: u32) -> u32 {
    algorithm_availability(algorithm)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_channel_router_create(
    config: *const RouterConfig,
) -> *mut std::ffi::c_void {
    if config.is_null() {
        return std::ptr::null_mut();
    }
    catch_unwind(AssertUnwindSafe(|| {
        // SAFETY: caller contract requires a readable config for this call.
        let copied = unsafe { *config };
        ChannelRouter::new(&copied)
            .map(Box::new)
            .map(Box::into_raw)
            .map(|pointer| pointer.cast())
            .unwrap_or(std::ptr::null_mut())
    }))
    .unwrap_or(std::ptr::null_mut())
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_channel_router_stage(
    handle: *mut std::ffi::c_void,
    revision: u64,
    params: *const RouterParams,
) -> i32 {
    if handle.is_null() || params.is_null() {
        return RESULT_INVALID_ARGUMENT;
    }
    catch_unwind(AssertUnwindSafe(|| {
        // SAFETY: caller owns a live handle and readable params.
        unsafe { &*handle.cast::<ChannelRouter>() }.stage(revision, unsafe { &*params })
    }))
    .unwrap_or(RESULT_PANIC)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_channel_router_commit(
    handle: *mut std::ffi::c_void,
    revision: u64,
    ramp_frames: u32,
) -> i32 {
    if handle.is_null() {
        return RESULT_INVALID_ARGUMENT;
    }
    catch_unwind(AssertUnwindSafe(|| {
        // SAFETY: caller owns a live handle.
        unsafe { &*handle.cast::<ChannelRouter>() }.commit(revision, ramp_frames)
    }))
    .unwrap_or(RESULT_PANIC)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_channel_router_process(
    handle: *mut std::ffi::c_void,
    input: *const f32,
    frames: u32,
    output: *mut f32,
    output_capacity_samples: u32,
) -> i32 {
    if handle.is_null() || input.is_null() || output.is_null() || frames == 0 {
        return RESULT_INVALID_ARGUMENT;
    }
    catch_unwind(AssertUnwindSafe(|| {
        // SAFETY: buffer lengths are part of the public C contract.
        let router = unsafe { &mut *handle.cast::<ChannelRouter>() };
        let input = unsafe { std::slice::from_raw_parts(input, frames as usize * 2) };
        let output =
            unsafe { std::slice::from_raw_parts_mut(output, output_capacity_samples as usize) };
        router.process(input, frames as usize, output)
    }))
    .unwrap_or(RESULT_PANIC)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_channel_router_get_status(
    handle: *mut std::ffi::c_void,
    status: *mut RouterStatus,
) -> i32 {
    if handle.is_null() || status.is_null() {
        return RESULT_INVALID_ARGUMENT;
    }
    catch_unwind(AssertUnwindSafe(|| {
        // SAFETY: caller owns a live handle and writable status.
        let requested = unsafe { &*status };
        if (requested.struct_size as usize) < size_of::<RouterStatus>()
            || requested.abi_version != CHANNEL_ROUTER_ABI_VERSION
        {
            return RESULT_INVALID_ARGUMENT;
        }
        unsafe { *status = (&*handle.cast::<ChannelRouter>()).status() };
        RESULT_OK
    }))
    .unwrap_or(RESULT_PANIC)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_channel_router_reset(handle: *mut std::ffi::c_void) -> i32 {
    if handle.is_null() {
        return RESULT_INVALID_ARGUMENT;
    }
    catch_unwind(AssertUnwindSafe(|| {
        // SAFETY: caller owns a live handle.
        unsafe { &mut *handle.cast::<ChannelRouter>() }.reset();
        RESULT_OK
    }))
    .unwrap_or(RESULT_PANIC)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_channel_router_destroy(handle: *mut std::ffi::c_void) {
    if handle.is_null() {
        return;
    }
    let _ = catch_unwind(AssertUnwindSafe(|| {
        // SAFETY: ownership transfers exactly once by C contract.
        drop(unsafe { Box::from_raw(handle.cast::<ChannelRouter>()) });
    }));
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn fe_rust_channel_router_generate_test_signal(
    config: *const TestSignalConfig,
    state: *mut TestSignalState,
    frames: u32,
    output: *mut f32,
    output_capacity_samples: u32,
) -> i32 {
    if config.is_null() || state.is_null() || output.is_null() || frames == 0 {
        return RESULT_INVALID_ARGUMENT;
    }
    catch_unwind(AssertUnwindSafe(|| {
        // SAFETY: caller supplies readable config/state and writable output.
        let output =
            unsafe { std::slice::from_raw_parts_mut(output, output_capacity_samples as usize) };
        generate_test_signal(
            unsafe { &*config },
            unsafe { &mut *state },
            frames as usize,
            output,
        )
    }))
    .unwrap_or(RESULT_PANIC)
}
