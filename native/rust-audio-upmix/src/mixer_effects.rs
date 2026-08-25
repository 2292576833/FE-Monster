use std::f32::consts::{PI, TAU};

const MAX_CHANNELS: usize = 8;
const SINE_TABLE_SIZE: usize = 2_048;
const REFLECTION_BASE_DELAYS_MS: [f32; 7] = [7.0, 11.0, 13.7, 17.3, 22.1, 27.7, 34.9];
const REFLECTION_BASE_WEIGHTS: [f32; 7] = [0.36, 0.31, 0.27, 0.23, 0.20, 0.17, 0.14];

#[derive(Clone, Copy, Default)]
pub(crate) struct ModulationControl {
    pub enabled: bool,
    pub rate_hz: f32,
    pub depth: f32,
    pub center_delay_ms: f32,
    pub feedback: f32,
    pub mix: f32,
}

#[derive(Clone, Copy, Default)]
pub(crate) struct PhaserControl {
    pub enabled: bool,
    pub rate_hz: f32,
    pub depth: f32,
    pub center_frequency_hz: f32,
    pub feedback: f32,
    pub mix: f32,
}

#[derive(Clone, Copy, Default)]
pub(crate) struct DelayControl {
    pub enabled: bool,
    pub delay_ms: f32,
    pub feedback: f32,
    pub ping_pong: f32,
    pub damping_hz: f32,
    pub mix: f32,
}

#[derive(Clone, Copy, Default)]
pub(crate) struct EarlyReflectionsControl {
    pub enabled: bool,
    pub room_size: f32,
    pub diffusion: f32,
    pub damping: f32,
    pub mix: f32,
}

#[derive(Clone, Copy, Default)]
pub(crate) struct EffectControlParameters {
    pub chorus: ModulationControl,
    pub flanger: ModulationControl,
    pub phaser: PhaserControl,
    pub delay: DelayControl,
    pub early_reflections: EarlyReflectionsControl,
}

#[derive(Clone, Copy, Default)]
pub(crate) struct ModulationFrameParameters {
    pub enabled: bool,
    pub phase_increment: f32,
    pub depth: f32,
    pub center_delay_samples: f32,
    pub feedback: f32,
    pub mix: f32,
}

#[derive(Clone, Copy, Default)]
pub(crate) struct PhaserFrameParameters {
    pub enabled: bool,
    pub phase_increment: f32,
    pub depth: f32,
    pub center_log2_hz: f32,
    pub feedback: f32,
    pub mix: f32,
}

#[derive(Clone, Copy, Default)]
pub(crate) struct DelayFrameParameters {
    pub enabled: bool,
    pub target_delay_samples: f32,
    pub feedback: f32,
    pub ping_pong: f32,
    pub damping_alpha: f32,
    pub mix: f32,
}

#[derive(Clone, Copy, Default)]
pub(crate) struct EarlyReflectionsFrameParameters {
    pub enabled: bool,
    pub tap_samples: [f32; 7],
    pub tap_weights: [f32; 7],
    pub diffusion: f32,
    pub damping_alpha: f32,
    pub mix: f32,
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

impl ModulationControl {
    pub(crate) fn new(
        enabled: bool,
        rate_hz: f32,
        depth: f32,
        center_delay_ms: f32,
        feedback: f32,
        mix: f32,
    ) -> Self {
        Self {
            enabled,
            rate_hz,
            depth,
            center_delay_ms,
            feedback,
            mix,
        }
    }
}

impl PhaserControl {
    pub(crate) fn new(
        enabled: bool,
        rate_hz: f32,
        depth: f32,
        center_frequency_hz: f32,
        feedback: f32,
        mix: f32,
    ) -> Self {
        Self {
            enabled,
            rate_hz,
            depth,
            center_frequency_hz,
            feedback,
            mix,
        }
    }
}

impl DelayControl {
    pub(crate) fn new(
        enabled: bool,
        delay_ms: f32,
        feedback: f32,
        ping_pong: f32,
        damping_hz: f32,
        mix: f32,
    ) -> Self {
        Self {
            enabled,
            delay_ms,
            feedback,
            ping_pong,
            damping_hz,
            mix,
        }
    }
}

impl EarlyReflectionsControl {
    pub(crate) fn new(
        enabled: bool,
        room_size: f32,
        diffusion: f32,
        damping: f32,
        mix: f32,
    ) -> Self {
        Self {
            enabled,
            room_size,
            diffusion,
            damping,
            mix,
        }
    }
}

impl EffectsDerivedParameters {
    pub(crate) fn prepare(control: EffectControlParameters, sample_rate: f32) -> Self {
        let modulation = |control: ModulationControl| ModulationFrameParameters {
            enabled: control.enabled,
            phase_increment: TAU * control.rate_hz / sample_rate,
            depth: control.depth,
            center_delay_samples: control.center_delay_ms * 0.001 * sample_rate,
            feedback: control.feedback,
            mix: control.mix,
        };
        let reflection_scale =
            0.75 + 0.25 * finite_or_zero(control.early_reflections.room_size).clamp(0.0, 1.0);
        let weight_square_sum: f32 = REFLECTION_BASE_WEIGHTS
            .iter()
            .map(|weight| weight * weight)
            .sum();
        let normalized_weights =
            REFLECTION_BASE_WEIGHTS.map(|weight| weight / weight_square_sum.sqrt());
        Self {
            frame: EffectFrameParameters {
                chorus: modulation(control.chorus),
                flanger: modulation(control.flanger),
                phaser: PhaserFrameParameters {
                    enabled: control.phaser.enabled,
                    phase_increment: TAU * control.phaser.rate_hz / sample_rate,
                    depth: control.phaser.depth,
                    center_log2_hz: control
                        .phaser
                        .center_frequency_hz
                        .max(20.0)
                        .min(sample_rate * 0.45)
                        .log2(),
                    feedback: control.phaser.feedback,
                    mix: control.phaser.mix,
                },
                delay: DelayFrameParameters {
                    enabled: control.delay.enabled,
                    target_delay_samples: control.delay.delay_ms * 0.001 * sample_rate,
                    feedback: control.delay.feedback,
                    ping_pong: control.delay.ping_pong,
                    damping_alpha: 1.0
                        - (-TAU * control.delay.damping_hz.min(sample_rate * 0.45) / sample_rate)
                            .exp(),
                    mix: control.delay.mix,
                },
                early_reflections: EarlyReflectionsFrameParameters {
                    enabled: control.early_reflections.enabled,
                    tap_samples: REFLECTION_BASE_DELAYS_MS
                        .map(|delay_ms| delay_ms * reflection_scale * 0.001 * sample_rate),
                    tap_weights: normalized_weights,
                    diffusion: control.early_reflections.diffusion,
                    damping_alpha: 0.05 + 0.90 * (1.0 - control.early_reflections.damping),
                    mix: finite_or_zero(control.early_reflections.mix).clamp(0.0, 0.5),
                },
            },
        }
    }

    pub(crate) fn approach(&mut self, target: Self, amount: f32) {
        let approach = |current: &mut f32, target: f32| *current += (target - *current) * amount;
        let approach_modulation =
            |current: &mut ModulationFrameParameters, target: ModulationFrameParameters| {
                current.enabled = target.enabled;
                approach(&mut current.phase_increment, target.phase_increment);
                approach(&mut current.depth, target.depth);
                approach(
                    &mut current.center_delay_samples,
                    target.center_delay_samples,
                );
                approach(&mut current.feedback, target.feedback);
                approach(&mut current.mix, target.mix);
            };
        approach_modulation(&mut self.frame.chorus, target.frame.chorus);
        approach_modulation(&mut self.frame.flanger, target.frame.flanger);

        self.frame.phaser.enabled = target.frame.phaser.enabled;
        approach(
            &mut self.frame.phaser.phase_increment,
            target.frame.phaser.phase_increment,
        );
        approach(&mut self.frame.phaser.depth, target.frame.phaser.depth);
        approach(
            &mut self.frame.phaser.center_log2_hz,
            target.frame.phaser.center_log2_hz,
        );
        approach(
            &mut self.frame.phaser.feedback,
            target.frame.phaser.feedback,
        );
        approach(&mut self.frame.phaser.mix, target.frame.phaser.mix);

        self.frame.delay.enabled = target.frame.delay.enabled;
        self.frame.delay.target_delay_samples = target.frame.delay.target_delay_samples;
        approach(&mut self.frame.delay.feedback, target.frame.delay.feedback);
        approach(
            &mut self.frame.delay.ping_pong,
            target.frame.delay.ping_pong,
        );
        approach(
            &mut self.frame.delay.damping_alpha,
            target.frame.delay.damping_alpha,
        );
        approach(&mut self.frame.delay.mix, target.frame.delay.mix);

        self.frame.early_reflections.enabled = target.frame.early_reflections.enabled;
        for index in 0..7 {
            approach(
                &mut self.frame.early_reflections.tap_samples[index],
                target.frame.early_reflections.tap_samples[index],
            );
            approach(
                &mut self.frame.early_reflections.tap_weights[index],
                target.frame.early_reflections.tap_weights[index],
            );
        }
        approach(
            &mut self.frame.early_reflections.diffusion,
            target.frame.early_reflections.diffusion,
        );
        approach(
            &mut self.frame.early_reflections.damping_alpha,
            target.frame.early_reflections.damping_alpha,
        );
        approach(
            &mut self.frame.early_reflections.mix,
            target.frame.early_reflections.mix,
        );
    }

    pub(crate) fn frame_parameters(&self) -> EffectFrameParameters {
        self.frame
    }
}

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
        Some((_, right)) if channel == right => PI,
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
    let position = ring
        .iter()
        .position(|candidate| *candidate == channel)
        .unwrap_or(0) as isize;
    let source = (position + OFFSETS[tap]).rem_euclid(ring.len() as isize) as usize;
    ring[source]
}

struct SineTable {
    values: [f32; SINE_TABLE_SIZE],
}

impl SineTable {
    fn new() -> Self {
        Self {
            values: std::array::from_fn(|index| {
                (TAU * index as f32 / SINE_TABLE_SIZE as f32).sin()
            }),
        }
    }

    fn lookup(&self, phase: f32) -> f32 {
        let position = phase.rem_euclid(TAU) / TAU * self.values.len() as f32;
        let lower = position.floor() as usize % self.values.len();
        let upper = (lower + 1) % self.values.len();
        let fraction = position - position.floor();
        self.values[lower] + (self.values[upper] - self.values[lower]) * fraction
    }
}

struct FractionalDelayBank {
    samples: Vec<f32>,
    stride: usize,
    write_position: usize,
}

impl FractionalDelayBank {
    fn new(channels: usize, stride: usize) -> Self {
        assert_eq!(channels, MAX_CHANNELS);
        assert!(stride >= 2);
        Self {
            samples: vec![0.0; channels * stride],
            stride,
            write_position: 0,
        }
    }

    fn write(&mut self, channel: usize, sample: f32) {
        self.samples[channel * self.stride + self.write_position] = sample;
    }

    fn write_checked(&mut self, channel: usize, sample: f32) -> bool {
        if !sample.is_finite() {
            return false;
        }
        self.write(channel, sample);
        true
    }

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

    fn read_linear_checked(&self, channel: usize, delay_samples: f32) -> Option<f32> {
        let delay = delay_samples.clamp(0.0, (self.stride - 2) as f32);
        let whole = delay.floor() as usize;
        let fraction = delay - whole as f32;
        let newer = (self.write_position + self.stride - whole) % self.stride;
        let older = (newer + self.stride - 1) % self.stride;
        let base = channel * self.stride;
        let newer_sample = self.samples[base + newer];
        let older_sample = self.samples[base + older];
        let interpolated = newer_sample + (older_sample - newer_sample) * fraction;
        (newer_sample.is_finite() && older_sample.is_finite() && interpolated.is_finite())
            .then_some(interpolated)
    }

    fn advance(&mut self) {
        self.write_position = (self.write_position + 1) % self.stride;
    }

    fn reset(&mut self) {
        self.samples.fill(0.0);
        self.write_position = 0;
    }

    fn current_samples_are_finite(&self, channels: usize) -> bool {
        (0..channels)
            .all(|channel| self.samples[channel * self.stride + self.write_position].is_finite())
    }

    #[cfg(test)]
    fn inject_non_finite_read_for_test(&mut self, channel: usize, delay_samples: f32) {
        let delay = delay_samples.clamp(0.0, (self.stride - 2) as f32);
        let whole = delay.floor() as usize;
        let read_position = (self.write_position + self.stride - whole) % self.stride;
        self.samples[channel * self.stride + read_position] = f32::NAN;
    }
}

struct Chorus {
    delay: FractionalDelayBank,
    phase: f32,
    active_mix: f32,
    bypass_step: f32,
}

struct Flanger {
    delay: FractionalDelayBank,
    phase: f32,
    sample_rate: f32,
    active_mix: f32,
    bypass_step: f32,
}

#[derive(Clone, Copy, Default)]
struct AllPassState {
    x1: f32,
    y1: f32,
}

struct PhaserCoefficientTable {
    values: [f32; SINE_TABLE_SIZE],
    minimum_log2_hz: f32,
    maximum_log2_hz: f32,
}

impl PhaserCoefficientTable {
    fn new(sample_rate: f32) -> Self {
        let minimum_log2_hz = 20.0_f32.log2();
        let maximum_log2_hz = (sample_rate * 0.45).max(20.0).log2();
        let values = std::array::from_fn(|index| {
            let position = index as f32 / (SINE_TABLE_SIZE - 1) as f32;
            let log_frequency = minimum_log2_hz + (maximum_log2_hz - minimum_log2_hz) * position;
            let frequency = 2.0_f32.powf(log_frequency);
            let tangent = (PI * frequency / sample_rate).tan();
            ((1.0 - tangent) / (1.0 + tangent)).clamp(-0.999, 0.999)
        });
        Self {
            values,
            minimum_log2_hz,
            maximum_log2_hz,
        }
    }

    fn lookup_log2(&self, log_frequency: f32) -> f32 {
        let position = (log_frequency - self.minimum_log2_hz)
            / (self.maximum_log2_hz - self.minimum_log2_hz)
            * (self.values.len() - 1) as f32;
        let lower = position.floor() as usize;
        let upper = (lower + 1).min(self.values.len() - 1);
        let fraction = position - lower as f32;
        self.values[lower] + (self.values[upper] - self.values[lower]) * fraction
    }
}

struct Phaser {
    stages: [[AllPassState; 6]; MAX_CHANNELS],
    feedback: [f32; MAX_CHANNELS],
    phase: f32,
    active_mix: f32,
    bypass_step: f32,
}

impl Phaser {
    fn is_finite(&self, channels: usize) -> bool {
        self.phase.is_finite()
            && self.active_mix.is_finite()
            && (0..channels).all(|channel| {
                self.feedback[channel].is_finite()
                    && self.stages[channel]
                        .iter()
                        .all(|state| state.x1.is_finite() && state.y1.is_finite())
            })
    }

    fn new(sample_rate: f32) -> Self {
        Self {
            stages: [[AllPassState::default(); 6]; MAX_CHANNELS],
            feedback: [0.0; MAX_CHANNELS],
            phase: 0.0,
            active_mix: 0.0,
            bypass_step: bypass_step(sample_rate),
        }
    }

    fn process(
        &mut self,
        frame: &mut [f32],
        parameters: PhaserFrameParameters,
        sine_table: &SineTable,
        coefficients: &PhaserCoefficientTable,
    ) -> bool {
        let channels = frame.len();
        approach_bypass_mix(
            &mut self.active_mix,
            parameters.enabled,
            parameters.mix,
            self.bypass_step,
        );
        if !parameters.enabled && self.active_mix == 0.0 {
            return true;
        }
        {
            let feedback = finite_or_zero(parameters.feedback).clamp(-0.98, 0.98);
            for channel in 0..channels {
                if is_lfe(channels, channel) {
                    continue;
                }
                let dry = frame[channel];
                if !dry.is_finite() {
                    return false;
                }
                let lfo = sine_table.lookup(self.phase + pair_phase_offset(channels, channel));
                let log_frequency = (parameters.center_log2_hz
                    + lfo * finite_or_zero(parameters.depth) * 2.0)
                    .clamp(coefficients.minimum_log2_hz, coefficients.maximum_log2_hz);
                let coefficient = coefficients.lookup_log2(log_frequency);
                let mut wet = dry + self.feedback[channel] * feedback;
                if !wet.is_finite() {
                    return false;
                }
                for state in &mut self.stages[channel] {
                    let output = -coefficient * wet + state.x1 + coefficient * state.y1;
                    if !output.is_finite() {
                        return false;
                    }
                    state.x1 = wet;
                    state.y1 = output;
                    wet = state.y1;
                }
                self.feedback[channel] = wet;
                let output = dry_wet(dry, wet, self.active_mix);
                if !output.is_finite() {
                    return false;
                }
                frame[channel] = output;
            }
        }
        let next_phase = (self.phase + finite_or_zero(parameters.phase_increment)).rem_euclid(TAU);
        if !next_phase.is_finite() {
            return false;
        }
        self.phase = next_phase;
        true
    }

    fn reset(&mut self) {
        self.stages = [[AllPassState::default(); 6]; MAX_CHANNELS];
        self.feedback = [0.0; MAX_CHANNELS];
        self.phase = 0.0;
        self.active_mix = 0.0;
    }
}

struct StereoDelay {
    delay: FractionalDelayBank,
    feedback_lowpass: [f32; MAX_CHANNELS],
    transition_handoff: [f32; MAX_CHANNELS],
    last_wet: [f32; MAX_CHANNELS],
    from_delay_samples: f32,
    to_delay_samples: f32,
    transition_remaining: usize,
    transition_total: usize,
    active_mix: f32,
    bypass_step: f32,
}

impl StereoDelay {
    fn is_finite(&self, channels: usize) -> bool {
        self.from_delay_samples.is_finite()
            && self.to_delay_samples.is_finite()
            && self.active_mix.is_finite()
            && self.delay.current_samples_are_finite(channels)
            && (0..channels).all(|channel| {
                self.feedback_lowpass[channel].is_finite()
                    && self.transition_handoff[channel].is_finite()
                    && self.last_wet[channel].is_finite()
            })
    }

    fn new(sample_rate: f32) -> Self {
        Self {
            delay: FractionalDelayBank::new(MAX_CHANNELS, delay_stride(sample_rate, 1_000.0)),
            feedback_lowpass: [0.0; MAX_CHANNELS],
            transition_handoff: [0.0; MAX_CHANNELS],
            last_wet: [0.0; MAX_CHANNELS],
            from_delay_samples: 0.0,
            to_delay_samples: 0.0,
            transition_remaining: 0,
            transition_total: (sample_rate * 0.020).round() as usize,
            active_mix: 0.0,
            bypass_step: bypass_step(sample_rate),
        }
    }

    fn current_delay_samples(&self) -> f32 {
        if self.transition_remaining == 0 {
            return self.to_delay_samples;
        }
        let t = 1.0 - self.transition_remaining as f32 / self.transition_total as f32;
        let smoothstep = t * t * (3.0 - 2.0 * t);
        self.from_delay_samples + (self.to_delay_samples - self.from_delay_samples) * smoothstep
    }

    fn update_target(&mut self, target_delay_samples: f32) {
        let target =
            finite_or_zero(target_delay_samples).clamp(0.0, (self.delay.stride - 2) as f32);
        if (target - self.to_delay_samples).abs() <= f32::EPSILON {
            return;
        }
        self.from_delay_samples = self.current_delay_samples();
        self.to_delay_samples = target;
        self.transition_remaining = self.transition_total;
        self.transition_handoff = self.last_wet;
    }

    fn read_smoothed(&self, channel: usize) -> Option<f32> {
        if self.transition_remaining == 0 {
            return self
                .delay
                .read_linear_checked(channel, self.to_delay_samples);
        }
        let t = 1.0 - self.transition_remaining as f32 / self.transition_total as f32;
        let smoothstep = t * t * (3.0 - 2.0 * t);
        let from = self
            .delay
            .read_linear_checked(channel, self.from_delay_samples)?;
        let to = self
            .delay
            .read_linear_checked(channel, self.to_delay_samples)?;
        let taps = from + (to - from) * smoothstep;
        let output = self.transition_handoff[channel]
            + (taps - self.transition_handoff[channel]) * smoothstep;
        (taps.is_finite() && output.is_finite()).then_some(output)
    }

    fn process(&mut self, frame: &mut [f32], parameters: DelayFrameParameters) -> bool {
        approach_bypass_mix(
            &mut self.active_mix,
            parameters.enabled,
            parameters.mix,
            self.bypass_step,
        );
        if !parameters.enabled && self.active_mix == 0.0 {
            return true;
        }
        self.update_target(parameters.target_delay_samples);
        let channels = frame.len();
        {
            let mut dry = [0.0; MAX_CHANNELS];
            let mut delayed = [0.0; MAX_CHANNELS];
            let mut feedback_input = [0.0; MAX_CHANNELS];
            for channel in 0..channels {
                if is_lfe(channels, channel) {
                    continue;
                }
                dry[channel] = frame[channel];
                if !dry[channel].is_finite() {
                    return false;
                }
                let Some(read) = self.read_smoothed(channel) else {
                    return false;
                };
                delayed[channel] = read;
                self.last_wet[channel] = delayed[channel];
            }

            let ping_pong = finite_or_zero(parameters.ping_pong).clamp(0.0, 1.0);
            for channel in 0..channels {
                if is_lfe(channels, channel) {
                    continue;
                }
                match pair_for_channel(channels, channel) {
                    Some((left, right)) if channel == left => {
                        feedback_input[left] =
                            delayed[left] * (1.0 - ping_pong) + delayed[right] * ping_pong;
                        feedback_input[right] =
                            delayed[right] * (1.0 - ping_pong) + delayed[left] * ping_pong;
                    }
                    Some(_) => {}
                    None => feedback_input[channel] = delayed[channel],
                }
            }

            let damping_alpha = finite_or_zero(parameters.damping_alpha).clamp(0.0, 1.0);
            let feedback = finite_or_zero(parameters.feedback).clamp(-0.98, 0.98);
            for channel in 0..channels {
                if is_lfe(channels, channel) {
                    continue;
                }
                self.feedback_lowpass[channel] +=
                    (feedback_input[channel] - self.feedback_lowpass[channel]) * damping_alpha;
                if !self.feedback_lowpass[channel].is_finite()
                    || !self.delay.write_checked(
                        channel,
                        dry[channel] + self.feedback_lowpass[channel] * feedback,
                    )
                {
                    return false;
                }
                let output = dry_wet(dry[channel], delayed[channel], self.active_mix);
                if !output.is_finite() {
                    return false;
                }
                frame[channel] = output;
            }
        }
        if self.transition_remaining > 0 {
            self.transition_remaining -= 1;
        }
        self.delay.advance();
        true
    }

    fn reset(&mut self) {
        self.delay.reset();
        self.feedback_lowpass = [0.0; MAX_CHANNELS];
        self.transition_handoff = [0.0; MAX_CHANNELS];
        self.last_wet = [0.0; MAX_CHANNELS];
        self.from_delay_samples = 0.0;
        self.to_delay_samples = 0.0;
        self.transition_remaining = 0;
        self.active_mix = 0.0;
    }
}

fn delay_stride(sample_rate: f32, maximum_delay_ms: f32) -> usize {
    (sample_rate * maximum_delay_ms * 0.001).ceil() as usize + 2
}

fn finite_or_zero(value: f32) -> f32 {
    if value.is_finite() { value } else { 0.0 }
}

fn dry_wet(dry: f32, wet: f32, mix: f32) -> f32 {
    dry + (wet - dry) * mix.clamp(0.0, 1.0)
}

fn bypass_step(sample_rate: f32) -> f32 {
    1.0 / (sample_rate * 0.005).max(1.0)
}

fn approach_bypass_mix(active_mix: &mut f32, enabled: bool, mix: f32, step: f32) {
    let requested_mix = if enabled {
        finite_or_zero(mix).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let difference = requested_mix - *active_mix;
    if difference.abs() <= step {
        *active_mix = requested_mix;
    } else {
        *active_mix += difference.signum() * step;
    }
}

impl Chorus {
    fn is_finite(&self, channels: usize) -> bool {
        self.phase.is_finite() && self.delay.current_samples_are_finite(channels)
    }

    fn new(sample_rate: f32) -> Self {
        Self {
            delay: FractionalDelayBank::new(MAX_CHANNELS, delay_stride(sample_rate, 45.0)),
            phase: 0.0,
            active_mix: 0.0,
            bypass_step: bypass_step(sample_rate),
        }
    }

    fn process(
        &mut self,
        frame: &mut [f32],
        parameters: ModulationFrameParameters,
        sine_table: &SineTable,
    ) -> bool {
        let channels = frame.len();
        approach_bypass_mix(
            &mut self.active_mix,
            parameters.enabled,
            parameters.mix,
            self.bypass_step,
        );
        if !parameters.enabled && self.active_mix == 0.0 {
            return true;
        }
        {
            for channel in 0..channels {
                if is_lfe(channels, channel) {
                    continue;
                }
                let dry = frame[channel];
                if !dry.is_finite() {
                    return false;
                }
                let lfo = sine_table.lookup(self.phase + pair_phase_offset(channels, channel));
                let delay = parameters.center_delay_samples * (1.0 + 0.45 * parameters.depth * lfo);
                let Some(delayed) = self.delay.read_linear_checked(channel, delay) else {
                    return false;
                };
                let feedback = finite_or_zero(parameters.feedback).clamp(-0.98, 0.98);
                if !self.delay.write_checked(channel, dry + delayed * feedback) {
                    return false;
                }
                let output = dry_wet(dry, delayed, self.active_mix);
                if !output.is_finite() {
                    return false;
                }
                frame[channel] = output;
            }
        }
        self.delay.advance();
        let mut next_phase = self.phase + finite_or_zero(parameters.phase_increment);
        if next_phase >= TAU {
            next_phase -= TAU;
        }
        if !next_phase.is_finite() {
            return false;
        }
        self.phase = next_phase;
        true
    }

    fn reset(&mut self) {
        self.delay.reset();
        self.phase = 0.0;
        self.active_mix = 0.0;
    }
}

impl Flanger {
    fn is_finite(&self, channels: usize) -> bool {
        self.phase.is_finite()
            && self.sample_rate.is_finite()
            && self.delay.current_samples_are_finite(channels)
    }

    fn new(sample_rate: f32) -> Self {
        Self {
            delay: FractionalDelayBank::new(MAX_CHANNELS, delay_stride(sample_rate, 20.0)),
            phase: 0.0,
            sample_rate,
            active_mix: 0.0,
            bypass_step: bypass_step(sample_rate),
        }
    }

    fn process(
        &mut self,
        frame: &mut [f32],
        parameters: ModulationFrameParameters,
        sine_table: &SineTable,
    ) -> bool {
        let channels = frame.len();
        approach_bypass_mix(
            &mut self.active_mix,
            parameters.enabled,
            parameters.mix,
            self.bypass_step,
        );
        if !parameters.enabled && self.active_mix == 0.0 {
            return true;
        }
        {
            for channel in 0..channels {
                if is_lfe(channels, channel) {
                    continue;
                }
                let dry = frame[channel];
                if !dry.is_finite() {
                    return false;
                }
                let lfo = sine_table.lookup(self.phase + pair_phase_offset(channels, channel));
                let delay = (parameters.center_delay_samples
                    * (1.0 + 0.90 * parameters.depth * lfo))
                    .max(0.05 * self.sample_rate / 1_000.0);
                let Some(delayed) = self.delay.read_linear_checked(channel, delay) else {
                    return false;
                };
                let feedback = finite_or_zero(parameters.feedback).clamp(-0.98, 0.98);
                if !self.delay.write_checked(channel, dry + delayed * feedback) {
                    return false;
                }
                let wet = (dry + delayed) * 0.5;
                let output = dry_wet(dry, wet, self.active_mix);
                if !wet.is_finite() || !output.is_finite() {
                    return false;
                }
                frame[channel] = output;
            }
        }
        self.delay.advance();
        let mut next_phase = self.phase + finite_or_zero(parameters.phase_increment);
        if next_phase >= TAU {
            next_phase -= TAU;
        }
        if !next_phase.is_finite() {
            return false;
        }
        self.phase = next_phase;
        true
    }

    fn reset(&mut self) {
        self.delay.reset();
        self.phase = 0.0;
        self.active_mix = 0.0;
    }
}

struct EarlyReflections {
    delay: FractionalDelayBank,
    damping_state: [[f32; MAX_CHANNELS]; 7],
    active_mix: f32,
    bypass_step: f32,
}

impl EarlyReflections {
    fn is_finite(&self, channels: usize) -> bool {
        self.active_mix.is_finite()
            && self.delay.current_samples_are_finite(channels)
            && self
                .damping_state
                .iter()
                .all(|tap| (0..channels).all(|channel| tap[channel].is_finite()))
    }

    fn new(sample_rate: f32) -> Self {
        Self {
            delay: FractionalDelayBank::new(MAX_CHANNELS, delay_stride(sample_rate, 40.0)),
            damping_state: [[0.0; MAX_CHANNELS]; 7],
            active_mix: 0.0,
            bypass_step: bypass_step(sample_rate),
        }
    }

    fn process(&mut self, frame: &mut [f32], parameters: EarlyReflectionsFrameParameters) -> bool {
        approach_bypass_mix(
            &mut self.active_mix,
            parameters.enabled,
            finite_or_zero(parameters.mix).clamp(0.0, 0.5),
            self.bypass_step,
        );
        if !parameters.enabled && self.active_mix == 0.0 {
            return true;
        }

        let channels = frame.len();
        let mut dry = [0.0; MAX_CHANNELS];
        let mut wet = [0.0; MAX_CHANNELS];
        let mut filtered_tap = [0.0; MAX_CHANNELS];
        for channel in 0..channels {
            if !is_lfe(channels, channel) {
                dry[channel] = frame[channel];
                if !dry[channel].is_finite() {
                    return false;
                }
            }
        }

        let damping_alpha = finite_or_zero(parameters.damping_alpha).clamp(0.0, 1.0);
        let diffusion = finite_or_zero(parameters.diffusion).clamp(0.0, 1.0);
        for tap in 0..REFLECTION_BASE_DELAYS_MS.len() {
            for channel in 0..channels {
                if is_lfe(channels, channel) {
                    continue;
                }
                let Some(delayed) = self
                    .delay
                    .read_linear_checked(channel, parameters.tap_samples[tap])
                else {
                    return false;
                };
                self.damping_state[tap][channel] +=
                    (delayed - self.damping_state[tap][channel]) * damping_alpha;
                if !self.damping_state[tap][channel].is_finite() {
                    return false;
                }
                filtered_tap[channel] = self.damping_state[tap][channel];
            }
            for channel in 0..channels {
                if is_lfe(channels, channel) {
                    continue;
                }
                let diffusion_sign = if (tap + channel) % 2 == 0 { 1.0 } else { -1.0 };
                let adjacent = adjacent_non_lfe_channel(channels, channel, tap);
                let reflected = filtered_tap[adjacent]
                    * finite_or_zero(parameters.tap_weights[tap])
                    * (0.65 + 0.35 * diffusion)
                    * diffusion_sign;
                wet[channel] += reflected;
                if !reflected.is_finite() || !wet[channel].is_finite() {
                    return false;
                }
            }
        }

        for channel in 0..channels {
            if is_lfe(channels, channel) {
                continue;
            }
            if !self.delay.write_checked(channel, dry[channel]) {
                return false;
            }
            let output = dry_wet(dry[channel], wet[channel], self.active_mix);
            if !output.is_finite() {
                return false;
            }
            frame[channel] = output;
        }
        self.delay.advance();
        true
    }

    fn reset(&mut self) {
        self.delay.reset();
        self.damping_state = [[0.0; MAX_CHANNELS]; 7];
        self.active_mix = 0.0;
    }
}

pub(crate) struct EffectsRack {
    chorus: Chorus,
    flanger: Flanger,
    phaser: Phaser,
    delay: StereoDelay,
    early_reflections: EarlyReflections,
    sine_table: SineTable,
    phaser_coefficients: PhaserCoefficientTable,
    chorus_failed: bool,
    flanger_failed: bool,
    phaser_failed: bool,
    delay_failed: bool,
    early_reflections_failed: bool,
    #[cfg(test)]
    chorus_failed_this_block: bool,
}

#[cfg(test)]
#[derive(Clone, Copy)]
enum EffectModule {
    Chorus,
    Flanger,
    Phaser,
    Delay,
    EarlyReflections,
}

impl EffectsRack {
    pub(crate) fn new(sample_rate: f32) -> Self {
        Self {
            chorus: Chorus::new(sample_rate),
            flanger: Flanger::new(sample_rate),
            phaser: Phaser::new(sample_rate),
            delay: StereoDelay::new(sample_rate),
            early_reflections: EarlyReflections::new(sample_rate),
            sine_table: SineTable::new(),
            phaser_coefficients: PhaserCoefficientTable::new(sample_rate),
            chorus_failed: false,
            flanger_failed: false,
            phaser_failed: false,
            delay_failed: false,
            early_reflections_failed: false,
            #[cfg(test)]
            chorus_failed_this_block: false,
        }
    }

    pub(crate) fn begin_block(&mut self) {
        self.chorus_failed = false;
        self.flanger_failed = false;
        self.phaser_failed = false;
        self.delay_failed = false;
        self.early_reflections_failed = false;
        #[cfg(test)]
        {
            self.chorus_failed_this_block = false;
        }
    }

    pub(crate) fn reset(&mut self) {
        self.chorus.reset();
        self.flanger.reset();
        self.phaser.reset();
        self.delay.reset();
        self.early_reflections.reset();
    }

    fn module_is_finite(&self, module: usize, channels: usize) -> bool {
        match module {
            0 => self.chorus.is_finite(channels),
            1 => self.flanger.is_finite(channels),
            2 => self.phaser.is_finite(channels),
            3 => self.delay.is_finite(channels),
            4 => self.early_reflections.is_finite(channels),
            _ => false,
        }
    }

    fn module_failed(&self, module: usize) -> bool {
        match module {
            0 => self.chorus_failed,
            1 => self.flanger_failed,
            2 => self.phaser_failed,
            3 => self.delay_failed,
            4 => self.early_reflections_failed,
            _ => true,
        }
    }

    fn module_active_mix_is_zero(&self, module: usize) -> bool {
        match module {
            0 => self.chorus.active_mix == 0.0,
            1 => self.flanger.active_mix == 0.0,
            2 => self.phaser.active_mix == 0.0,
            3 => self.delay.active_mix == 0.0,
            4 => self.early_reflections.active_mix == 0.0,
            _ => true,
        }
    }

    fn reset_module(&mut self, module: usize) {
        match module {
            0 => self.chorus.reset(),
            1 => self.flanger.reset(),
            2 => self.phaser.reset(),
            3 => self.delay.reset(),
            4 => self.early_reflections.reset(),
            _ => {}
        }
    }

    fn latch_module_failure(&mut self, module: usize) {
        match module {
            0 => {
                self.chorus_failed = true;
                #[cfg(test)]
                {
                    self.chorus_failed_this_block = true;
                }
            }
            1 => self.flanger_failed = true,
            2 => self.phaser_failed = true,
            3 => self.delay_failed = true,
            4 => self.early_reflections_failed = true,
            _ => {}
        }
    }

    fn restore_frame(frame: &mut [f32], dry: &[f32; MAX_CHANNELS]) {
        frame.copy_from_slice(&dry[..frame.len()]);
    }

    pub(crate) fn process_frame(
        &mut self,
        frame: &mut [f32],
        parameters: EffectFrameParameters,
    ) -> bool {
        if !matches!(frame.len(), 2 | 6 | 8) {
            return false;
        }
        let mut succeeded = true;
        macro_rules! process_module {
            ($index:expr, $enabled:expr, $call:expr) => {{
                if !self.module_failed($index)
                    && ($enabled || !self.module_active_mix_is_zero($index))
                {
                    let mut dry = [0.0; MAX_CHANNELS];
                    dry[..frame.len()].copy_from_slice(frame);
                    if !self.module_is_finite($index, frame.len()) {
                        self.reset_module($index);
                        Self::restore_frame(frame, &dry);
                        self.latch_module_failure($index);
                        succeeded = false;
                    } else {
                        let module_succeeded = $call;
                        if !module_succeeded
                            || !self.module_is_finite($index, frame.len())
                            || !frame.iter().all(|sample| sample.is_finite())
                        {
                            self.reset_module($index);
                            Self::restore_frame(frame, &dry);
                            self.latch_module_failure($index);
                            succeeded = false;
                        }
                    }
                }
            }};
        }
        process_module!(
            0,
            parameters.chorus.enabled,
            self.chorus
                .process(frame, parameters.chorus, &self.sine_table)
        );
        process_module!(
            1,
            parameters.flanger.enabled,
            self.flanger
                .process(frame, parameters.flanger, &self.sine_table)
        );
        process_module!(
            2,
            parameters.phaser.enabled,
            self.phaser.process(
                frame,
                parameters.phaser,
                &self.sine_table,
                &self.phaser_coefficients,
            )
        );
        process_module!(
            3,
            parameters.delay.enabled,
            self.delay.process(frame, parameters.delay)
        );
        process_module!(
            4,
            parameters.early_reflections.enabled,
            self.early_reflections
                .process(frame, parameters.early_reflections)
        );
        succeeded
    }

    #[cfg(test)]
    fn inject_non_finite_for_test(&mut self, module: EffectModule) {
        match module {
            EffectModule::Chorus => self.chorus.phase = f32::NAN,
            EffectModule::Flanger => self.flanger.phase = f32::NAN,
            EffectModule::Phaser => self.phaser.phase = f32::NAN,
            EffectModule::Delay => self.delay.feedback_lowpass[0] = f32::NAN,
            EffectModule::EarlyReflections => self.early_reflections.damping_state[0][0] = f32::NAN,
        }
    }

    #[cfg(test)]
    fn inject_non_finite_delay_read_for_test(
        &mut self,
        module: EffectModule,
        parameters: EffectFrameParameters,
    ) {
        match module {
            EffectModule::Chorus => self
                .chorus
                .delay
                .inject_non_finite_read_for_test(0, parameters.chorus.center_delay_samples),
            EffectModule::Flanger => self
                .flanger
                .delay
                .inject_non_finite_read_for_test(0, parameters.flanger.center_delay_samples),
            EffectModule::Delay => self.delay.delay.inject_non_finite_read_for_test(0, 0.0),
            EffectModule::EarlyReflections => self
                .early_reflections
                .delay
                .inject_non_finite_read_for_test(0, parameters.early_reflections.tap_samples[0]),
            EffectModule::Phaser => {}
        }
    }

    #[cfg(test)]
    fn phaser_stage_count(&self) -> usize {
        self.phaser.stages[0].len()
    }

    #[cfg(test)]
    fn delay_transition_remaining(&self) -> usize {
        self.delay.transition_remaining
    }

    #[cfg(test)]
    fn delay_storage_identity(&self) -> (*const f32, usize, usize) {
        (
            self.delay.delay.samples.as_ptr(),
            self.delay.delay.samples.capacity(),
            self.delay.delay.write_position,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
        if channels >= 6 && active_channel != 3 {
            pcm[3] = 0.25;
        }
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
        pcm.chunks_exact(channels)
            .map(|frame| frame[channel])
            .collect()
    }

    fn frame_peak(pcm: &[f32], channels: usize, frame: usize) -> f32 {
        pcm[frame * channels..(frame + 1) * channels]
            .iter()
            .fold(0.0_f32, |peak, sample| peak.max(sample.abs()))
    }

    fn energy(pcm: &[f32]) -> f64 {
        pcm.iter().map(|sample| (*sample as f64).powi(2)).sum()
    }

    fn prepared(control: EffectControlParameters, sample_rate: f32) -> EffectFrameParameters {
        EffectsDerivedParameters::prepare(control, sample_rate).frame_parameters()
    }

    #[test]
    fn fractional_delay_interpolates_without_moving_storage() {
        let mut delay = FractionalDelayBank::new(8, 64);
        let pointer = delay.samples.as_ptr();
        let capacity = delay.samples.capacity();
        delay.write(0, 1.0);
        delay.advance();
        assert!((delay.read_linear(0, 0.5) - 0.5).abs() < 1.0e-6);
        for _ in 0..256 {
            delay.write(0, 0.0);
            delay.advance();
        }
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
        let chorus = render(
            &mut rack,
            input.clone(),
            8,
            prepared(chorus_control, 48_000.0),
        );
        rack.reset();
        let mut flanger_control = EffectControlParameters::default();
        flanger_control.flanger = ModulationControl::new(true, 0.18, 0.65, 1.6, 0.55, 0.32);
        let flanger = render(&mut rack, input, 8, prepared(flanger_control, 48_000.0));
        assert_ne!(chorus, flanger);
        assert!(
            chorus
                .iter()
                .chain(&flanger)
                .all(|sample| sample.is_finite())
        );
        assert_eq!(channel_samples(&chorus, 8, 3), baseline_lfe);
        assert_eq!(channel_samples(&flanger, 8, 3), baseline_lfe);
    }

    #[test]
    fn maximum_feedback_tail_is_finite_and_decreases_at_supported_sample_rates() {
        for sample_rate in [16_000.0, 48_000.0, 192_000.0] {
            let frames = (sample_rate * 2.0) as usize;
            let mut rack = EffectsRack::new(sample_rate);
            let mut control = EffectControlParameters::default();
            control.chorus = ModulationControl::new(true, 0.32, 0.42, 18.0, 0.98, 0.50);
            control.flanger = ModulationControl::new(true, 0.18, 0.65, 1.6, 0.98, 0.50);
            let rendered = render(
                &mut rack,
                impulse(frames, 2, 0),
                2,
                prepared(control, sample_rate),
            );
            assert!(rendered.iter().all(|sample| sample.is_finite()));
            let half_second = (sample_rate * 0.5) as usize;
            let early_peak = ((frames - half_second)..(frames - half_second / 2))
                .map(|frame| frame_peak(&rendered, 2, frame))
                .fold(0.0_f32, f32::max);
            let late_peak = ((frames - half_second / 2)..frames)
                .map(|frame| frame_peak(&rendered, 2, frame))
                .fold(0.0_f32, f32::max);
            assert!(
                early_peak > late_peak,
                "tail did not decay at {sample_rate} Hz: {early_peak} <= {late_peak}"
            );
        }
    }

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
        assert_ne!(
            channel_samples(&rendered, 8, 0),
            channel_samples(&input, 8, 0)
        );
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
            assert!(
                channel_samples(&rendered, 8, right)[4_800..]
                    .iter()
                    .any(|sample| sample.abs() > 0.1)
            );
            assert_eq!(channel_samples(&rendered, 8, 3), baseline_lfe);
        }
    }

    #[test]
    fn delay_automation_is_smooth_and_a_stable_target_uses_a_twenty_ms_transition() {
        let sample_rate = 48_000.0;
        let mut rack = EffectsRack::new(sample_rate);
        let mut control = EffectControlParameters::default();
        control.delay = DelayControl::new(true, 1.0, 0.45, 0.5, 8_000.0, 1.0);
        let mut parameters = prepared(control, sample_rate);
        let mut rendered = Vec::with_capacity(48_000 * 2);

        for frame_index in 0..48_000 {
            if frame_index % 64 == 0 {
                control.delay.delay_ms = if (frame_index / 64) % 2 == 0 {
                    1.0
                } else {
                    1_000.0
                };
                parameters = prepared(control, sample_rate);
            }
            let sample = (frame_index as f32 * 997.0 * TAU / sample_rate).sin() * 0.2;
            let mut frame = [sample, sample];
            assert!(rack.process_frame(&mut frame, parameters));
            rendered.push(frame[0]);
        }
        let maximum_jump = rendered
            .windows(2)
            .map(|samples| (samples[1] - samples[0]).abs())
            .fold(0.0_f32, f32::max);
        assert!(maximum_jump < 0.25, "maximum jump was {maximum_jump}");

        control.delay.delay_ms = 250.0;
        parameters = prepared(control, sample_rate);
        let transition_frames = (sample_rate * 0.020).round() as usize;
        for _ in 0..transition_frames {
            assert!(rack.process_frame(&mut [0.0, 0.0], parameters));
        }
        assert_eq!(rack.delay_transition_remaining(), 0);
    }

    #[test]
    fn delay_storage_remains_fixed_for_every_supported_layout() {
        for (sample_rate, channels) in [16_000.0, 48_000.0, 192_000.0]
            .into_iter()
            .flat_map(|sample_rate| [2, 6, 8].map(move |channels| (sample_rate, channels)))
        {
            let mut rack = EffectsRack::new(sample_rate);
            let (pointer, capacity, write_position) = rack.delay_storage_identity();
            let mut control = EffectControlParameters::default();
            control.delay = DelayControl::new(true, 1_000.0, 0.75, 0.5, 8_000.0, 0.5);
            let parameters = prepared(control, sample_rate);
            let mut frame = vec![0.0; channels];
            for _ in 0..(sample_rate * 10.0) as usize {
                assert!(rack.process_frame(&mut frame, parameters));
            }
            assert_eq!(rack.delay_storage_identity().0, pointer);
            assert_eq!(rack.delay_storage_identity().1, capacity);
            assert_ne!(rack.delay_storage_identity().2, write_position);
        }
    }

    #[test]
    fn phaser_and_delay_tails_are_finite_and_decay_for_supported_rates_and_layouts() {
        for (sample_rate, channels) in [16_000.0, 48_000.0, 192_000.0]
            .into_iter()
            .flat_map(|sample_rate| [2, 6, 8].map(move |channels| (sample_rate, channels)))
        {
            let frames = (sample_rate * 2.0) as usize;
            let input = impulse(frames, channels, 0);
            let baseline_lfe = if channels >= 6 {
                Some(channel_samples(&input, channels, 3))
            } else {
                None
            };
            let mut rack = EffectsRack::new(sample_rate);
            let mut control = EffectControlParameters::default();
            control.phaser = PhaserControl::new(true, 0.22, 0.55, 900.0, 0.25, 0.34);
            control.delay = DelayControl::new(true, 100.0, 0.75, 0.5, 8_000.0, 1.0);
            let rendered = render(&mut rack, input, channels, prepared(control, sample_rate));
            assert!(rendered.iter().all(|sample| sample.is_finite()));
            if let Some(baseline_lfe) = baseline_lfe {
                assert_eq!(channel_samples(&rendered, channels, 3), baseline_lfe);
            }
            let early_peak = ((sample_rate * 0.75) as usize..(sample_rate * 1.25) as usize)
                .map(|frame| frame_peak(&rendered, channels, frame))
                .fold(0.0_f32, f32::max);
            let late_peak = ((sample_rate * 1.50) as usize..frames)
                .map(|frame| frame_peak(&rendered, channels, frame))
                .fold(0.0_f32, f32::max);
            assert!(
                early_peak > late_peak,
                "tail did not decay at {sample_rate} Hz with {channels} channels: {early_peak} <= {late_peak}"
            );
        }
    }

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
            assert!(
                (frame.saturating_sub(2)..=frame + 2)
                    .any(|candidate| frame_peak(&rendered, 8, candidate) > 1.0e-5)
            );
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
            if frame_index == 0 {
                assert!(!result);
            } else {
                assert!(result);
            }
            assert!(failed.chorus_failed_this_block);
        }
    }

    #[test]
    fn early_reflection_taps_keep_independent_damping_routes() {
        let mut rack = EffectsRack::new(48_000.0);
        let mut control = EffectControlParameters::default();
        control.early_reflections = EarlyReflectionsControl::new(true, 1.0, 0.0, 1.0, 0.5);
        let rendered = render(
            &mut rack,
            impulse(2_048, 8, 0),
            8,
            prepared(control, 48_000.0),
        );
        let destinations: [usize; 7] = std::array::from_fn(|tap| {
            (0..8)
                .find(|channel| adjacent_non_lfe_channel(8, *channel, tap) == 0)
                .unwrap()
        });
        for tap in 0..REFLECTION_BASE_DELAYS_MS.len() {
            let frame_index = (REFLECTION_BASE_DELAYS_MS[tap] * 48.0).round() as usize;
            let frame = &rendered[frame_index * 8..(frame_index + 1) * 8];
            assert!(frame[destinations[tap]].abs() > 1.0e-5);
            for later_tap in tap + 1..REFLECTION_BASE_DELAYS_MS.len() {
                assert!(frame[destinations[later_tap]].abs() < 1.0e-7);
            }
        }
    }

    #[test]
    fn non_finite_module_state_isolated_for_every_module() {
        for module in [
            EffectModule::Chorus,
            EffectModule::Flanger,
            EffectModule::Phaser,
            EffectModule::Delay,
            EffectModule::EarlyReflections,
        ] {
            let mut rack = EffectsRack::new(48_000.0);
            let mut control = EffectControlParameters::default();
            match module {
                EffectModule::Chorus => {
                    control.chorus = ModulationControl::new(true, 0.32, 0.42, 18.0, 0.08, 0.30)
                }
                EffectModule::Flanger => {
                    control.flanger = ModulationControl::new(true, 0.18, 0.65, 1.6, 0.55, 0.32)
                }
                EffectModule::Phaser => {
                    control.phaser = PhaserControl::new(true, 0.22, 0.55, 900.0, 0.25, 0.34)
                }
                EffectModule::Delay => {
                    control.delay = DelayControl::new(true, 320.0, 0.38, 0.85, 8_000.0, 0.28)
                }
                EffectModule::EarlyReflections => {
                    control.early_reflections =
                        EarlyReflectionsControl::new(true, 0.72, 0.75, 0.55, 0.22)
                }
            }
            let parameters = prepared(control, 48_000.0);
            rack.begin_block();
            rack.inject_non_finite_for_test(module);
            let dry = [0.1_f32, -0.1];
            let mut actual = dry;
            assert!(!rack.process_frame(&mut actual, parameters));
            assert_eq!(actual, dry);
            assert!(rack.process_frame(&mut actual, parameters));
        }
    }

    #[test]
    fn non_finite_delay_history_is_latched_before_sanitization() {
        for (module, control) in [
            (
                EffectModule::Chorus,
                EffectControlParameters {
                    chorus: ModulationControl::new(true, 0.0, 0.0, 1.0, 0.0, 1.0),
                    ..EffectControlParameters::default()
                },
            ),
            (
                EffectModule::Flanger,
                EffectControlParameters {
                    flanger: ModulationControl::new(true, 0.0, 0.0, 1.0, 0.0, 1.0),
                    ..EffectControlParameters::default()
                },
            ),
            (
                EffectModule::Delay,
                EffectControlParameters {
                    delay: DelayControl::new(true, 1.0, 0.0, 0.0, 8_000.0, 1.0),
                    ..EffectControlParameters::default()
                },
            ),
            (
                EffectModule::EarlyReflections,
                EffectControlParameters {
                    early_reflections: EarlyReflectionsControl::new(true, 1.0, 0.0, 1.0, 0.5),
                    ..EffectControlParameters::default()
                },
            ),
        ] {
            let mut rack = EffectsRack::new(48_000.0);
            let parameters = prepared(control, 48_000.0);
            rack.begin_block();
            rack.inject_non_finite_delay_read_for_test(module, parameters);
            let dry = [0.1_f32, -0.1];
            let mut actual = dry;
            assert!(!rack.process_frame(&mut actual, parameters));
            assert_eq!(actual, dry);
            assert!(rack.process_frame(&mut actual, parameters));
        }
    }
}
