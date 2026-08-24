use fe_monster_upmix::channel_router::{
    ALGORITHM_AMBIENT_EXTRACT, ALGORITHM_AVAILABLE, ALGORITHM_CUSTOM_MATRIX,
    ALGORITHM_DOLBY_PRO_LOGIC_II, ALGORITHM_DOLBY_PRO_LOGIC_IIX, ALGORITHM_DTS_NEURAL_X,
    ALGORITHM_FRONT_ONLY, ALGORITHM_LICENSE_REQUIRED, ALGORITHM_MATRIX_DECODE, CHANNEL_BACK_LEFT,
    CHANNEL_BACK_RIGHT, CHANNEL_FRONT_CENTER, CHANNEL_FRONT_LEFT, CHANNEL_FRONT_RIGHT, CHANNEL_LFE,
    CHANNEL_SIDE_LEFT, CHANNEL_SIDE_RIGHT, ChannelRouter, RESULT_INVALID_ARGUMENT, RESULT_OK,
    RouterConfig, RouterParams, TEST_SIGNAL_IMPULSE, TEST_SIGNAL_TONE, TestSignalConfig,
    TestSignalState, algorithm_availability, canonical_channel_role, generate_test_signal,
};

fn config(channels: u32) -> RouterConfig {
    RouterConfig {
        sample_rate: 48_000,
        max_frames_per_call: 512,
        output_channels: channels,
        max_delay_ms: 100.0,
        ..RouterConfig::default()
    }
}

fn channel_energy(pcm: &[f32], channels: usize, channel: usize) -> f32 {
    pcm.chunks_exact(channels)
        .map(|frame| frame[channel] * frame[channel])
        .sum()
}

fn channel_samples(pcm: &[f32], channels: usize, channel: usize) -> Vec<f32> {
    pcm.chunks_exact(channels)
        .map(|frame| frame[channel])
        .collect()
}

fn normalized_correlation(left: &[f32], right: &[f32]) -> f32 {
    let dot: f32 = left.iter().zip(right).map(|(a, b)| a * b).sum();
    let left_energy: f32 = left.iter().map(|sample| sample * sample).sum();
    let right_energy: f32 = right.iter().map(|sample| sample * sample).sum();
    dot / (left_energy * right_energy).sqrt().max(1.0e-12)
}

fn route_with_algorithm(channels: u32, algorithm: u32, input: &[f32]) -> Vec<f32> {
    let frames = input.len() / 2;
    let mut cfg = config(channels);
    cfg.max_frames_per_call = frames as u32;
    let mut router = ChannelRouter::new(&cfg).expect("router");
    let mut params = RouterParams::front_only(channels);
    params.algorithm = algorithm;
    assert_eq!(router.stage(1, &params), RESULT_OK);
    assert_eq!(router.commit(1, 0), RESULT_OK);
    let mut output = vec![0.0; frames * channels as usize];
    assert_eq!(router.process(input, frames, &mut output), RESULT_OK);
    output
}

#[test]
fn catalog_is_honest_about_builtin_and_licensed_algorithms() {
    for id in [
        ALGORITHM_FRONT_ONLY,
        ALGORITHM_MATRIX_DECODE,
        ALGORITHM_AMBIENT_EXTRACT,
        ALGORITHM_CUSTOM_MATRIX,
    ] {
        assert_eq!(algorithm_availability(id), ALGORITHM_AVAILABLE);
    }
    for id in [
        ALGORITHM_DOLBY_PRO_LOGIC_II,
        ALGORITHM_DOLBY_PRO_LOGIC_IIX,
        ALGORITHM_DTS_NEURAL_X,
    ] {
        assert_eq!(algorithm_availability(id), ALGORITHM_LICENSE_REQUIRED);
    }
}

#[test]
fn layouts_follow_canonical_ffmpeg_obs_channel_order() {
    assert_eq!(
        (0..6)
            .map(|index| canonical_channel_role(6, index).unwrap())
            .collect::<Vec<_>>(),
        vec![
            CHANNEL_FRONT_LEFT,
            CHANNEL_FRONT_RIGHT,
            CHANNEL_FRONT_CENTER,
            CHANNEL_LFE,
            CHANNEL_SIDE_LEFT,
            CHANNEL_SIDE_RIGHT,
        ]
    );
    assert_eq!(
        (0..8)
            .map(|index| canonical_channel_role(8, index).unwrap())
            .collect::<Vec<_>>(),
        vec![
            CHANNEL_FRONT_LEFT,
            CHANNEL_FRONT_RIGHT,
            CHANNEL_FRONT_CENTER,
            CHANNEL_LFE,
            CHANNEL_BACK_LEFT,
            CHANNEL_BACK_RIGHT,
            CHANNEL_SIDE_LEFT,
            CHANNEL_SIDE_RIGHT,
        ]
    );
}

#[test]
fn front_only_is_a_true_passthrough_and_does_not_invent_surround_content() {
    let mut router = ChannelRouter::new(&config(8)).expect("router");
    let frames = 64;
    let input: Vec<f32> = (0..frames)
        .flat_map(|frame| {
            [
                frame as f32 / frames as f32,
                -(frame as f32) / frames as f32,
            ]
        })
        .collect();
    let mut output = vec![0.0; frames * 8];

    assert_eq!(router.process(&input, frames, &mut output), RESULT_OK);
    for frame in 0..frames {
        assert_eq!(output[frame * 8], input[frame * 2]);
        assert_eq!(output[frame * 8 + 1], input[frame * 2 + 1]);
        assert!(
            output[frame * 8 + 2..frame * 8 + 8]
                .iter()
                .all(|sample| *sample == 0.0)
        );
    }
}

#[test]
fn custom_matrix_gain_and_delay_are_applied_without_cross_channel_leakage() {
    let mut router = ChannelRouter::new(&config(6)).expect("router");
    let mut params = RouterParams::front_only(6);
    params.algorithm = ALGORITHM_CUSTOM_MATRIX;
    params.custom_matrix = [0.0; 16];
    params.custom_matrix[CHANNEL_FRONT_CENTER as usize * 2] = 0.5;
    params.custom_matrix[CHANNEL_FRONT_CENTER as usize * 2 + 1] = 0.5;
    params.channel_gain_db[2] = 6.020_600_3;
    params.channel_delay_ms[2] = 1.0; // exactly 48 samples at 48 kHz

    assert_eq!(router.stage(1, &params), RESULT_OK);
    assert_eq!(router.commit(1, 0), RESULT_OK);
    let frames = 64;
    let input = vec![1.0; frames * 2];
    let mut output = vec![0.0; frames * 6];
    assert_eq!(router.process(&input, frames, &mut output), RESULT_OK);

    for frame in 0..48 {
        assert_eq!(output[frame * 6 + 2], 0.0);
    }
    assert!((output[48 * 6 + 2] - 2.0).abs() < 1.0e-4);
    for channel in [0, 1, 3, 4, 5] {
        assert_eq!(channel_energy(&output, 6, channel), 0.0);
    }
}

#[test]
fn controls_are_staged_then_committed_at_a_process_block_boundary() {
    let mut router = ChannelRouter::new(&config(6)).expect("router");
    let input = vec![0.25; 16 * 2];
    let mut before = vec![0.0; 16 * 6];
    let mut after = vec![0.0; 16 * 6];
    let mut staged = RouterParams::front_only(6);
    staged.channel_gain_db[0] = -6.020_600_3;

    assert_eq!(router.stage(7, &staged), RESULT_OK);
    assert_eq!(router.process(&input, 16, &mut before), RESULT_OK);
    assert!((before[0] - 0.25).abs() < 1.0e-7);
    assert_eq!(router.status().active_revision, 0);
    assert_eq!(router.status().staged_revision, 7);

    assert_eq!(router.commit(7, 8), RESULT_OK);
    assert_eq!(router.process(&input, 16, &mut after), RESULT_OK);
    assert!(after[0] < 0.25 && after[0] > 0.125);
    assert!((after[15 * 6] - 0.125).abs() < 1.0e-5);
    let status = router.status();
    assert_eq!(status.active_revision, 7);
    assert_eq!(status.process_calls, 2);
    assert_eq!(status.actual, 1);
    assert!(status.channel_peak[0] > 0.0 && status.channel_rms[0] > 0.0);
}

#[test]
fn test_signals_target_exact_channels_without_files_or_urls() {
    for kind in [TEST_SIGNAL_TONE, TEST_SIGNAL_IMPULSE] {
        let signal = TestSignalConfig {
            sample_rate: 48_000,
            output_channels: 8,
            channel_index: 5,
            kind,
            frequency_hz: 997.0,
            gain_db: -12.0,
            ..TestSignalConfig::default()
        };
        let mut state = TestSignalState::default();
        let mut output = vec![0.0; 128 * 8];
        assert_eq!(
            generate_test_signal(&signal, &mut state, 128, &mut output),
            RESULT_OK
        );
        assert!(channel_energy(&output, 8, 5) > 0.0);
        for channel in [0, 1, 2, 3, 4, 6, 7] {
            assert_eq!(channel_energy(&output, 8, channel), 0.0);
        }
    }

    let mut invalid = TestSignalConfig::default();
    invalid.output_channels = 6;
    invalid.channel_index = 7;
    let mut state = TestSignalState::default();
    assert_eq!(
        generate_test_signal(&invalid, &mut state, 16, &mut [0.0; 96]),
        RESULT_INVALID_ARGUMENT
    );
}

#[test]
fn matrix_and_ambient_create_nonzero_distinct_51_and_71_beds() {
    let frames = 4096;
    let input: Vec<f32> = (0..frames)
        .flat_map(|frame| {
            let time = frame as f32 / 48_000.0;
            let low = (std::f32::consts::TAU * 53.0 * time).sin() * 0.18;
            let left = low
                + (std::f32::consts::TAU * 223.0 * time).sin() * 0.21
                + (std::f32::consts::TAU * 881.0 * time).sin() * 0.11;
            let right = low * 0.77
                + (std::f32::consts::TAU * 331.0 * time + 0.37).sin() * 0.19
                + (std::f32::consts::TAU * 1273.0 * time + 0.19).sin() * 0.09;
            [left, right]
        })
        .collect();

    for algorithm in [ALGORITHM_MATRIX_DECODE, ALGORITHM_AMBIENT_EXTRACT] {
        for channels in [6_usize, 8_usize] {
            let output = route_with_algorithm(channels as u32, algorithm, &input);
            let energies: Vec<f32> = (0..channels)
                .map(|channel| channel_energy(&output, channels, channel))
                .collect();
            assert!(
                energies.iter().all(|energy| *energy > 1.0e-4),
                "algorithm {algorithm} did not energize every {channels}-channel role: {energies:?}"
            );

            let front = channel_samples(&output, channels, 0);
            let side_index = if channels == 8 { 6 } else { 4 };
            let side = channel_samples(&output, channels, side_index);
            assert!(
                normalized_correlation(&front, &side).abs() < 0.985,
                "front and side fingerprints collapsed for algorithm {algorithm}, {channels}ch"
            );
            if channels == 8 {
                let back = channel_samples(&output, channels, 4);
                assert!(
                    normalized_correlation(&side, &back).abs() < 0.985,
                    "side and back fingerprints collapsed for algorithm {algorithm}"
                );
            }
        }
    }
}

#[test]
fn builtin_layouts_are_left_right_mirrored_and_center_balanced() {
    let frames = 2048;
    let mut original = vec![0.0_f32; frames * 2];
    original[0] = 0.8;
    original[1] = 0.2;
    original[80] = -0.35;
    original[81] = 0.1;
    let mut swapped = original.clone();
    for stereo in swapped.chunks_exact_mut(2) {
        stereo.swap(0, 1);
    }

    for channels in [6_usize, 8_usize] {
        let left = route_with_algorithm(channels as u32, ALGORITHM_MATRIX_DECODE, &original);
        let right = route_with_algorithm(channels as u32, ALGORITHM_MATRIX_DECODE, &swapped);
        let pairs: &[(usize, usize)] = if channels == 8 {
            &[(0, 1), (4, 5), (6, 7)]
        } else {
            &[(0, 1), (4, 5)]
        };
        for (left_channel, right_channel) in pairs {
            for frame in 0..frames {
                assert!(
                    (left[frame * channels + left_channel]
                        - right[frame * channels + right_channel])
                        .abs()
                        < 1.0e-6
                );
                assert!(
                    (left[frame * channels + right_channel]
                        - right[frame * channels + left_channel])
                        .abs()
                        < 1.0e-6
                );
            }
        }
        let center_left = channel_samples(&left, channels, 2);
        let center_right = channel_samples(&right, channels, 2);
        assert!(normalized_correlation(&center_left, &center_right) > 0.999_99);
        assert!(
            (channel_energy(&left, channels, 2) - channel_energy(&right, channels, 2)).abs()
                < 1.0e-5
        );
    }
}

#[test]
fn lfe_low_pass_attenuates_content_above_the_crossover() {
    fn mono_tone(frequency: f32, frames: usize) -> Vec<f32> {
        (0..frames)
            .flat_map(|frame| {
                let sample =
                    (std::f32::consts::TAU * frequency * frame as f32 / 48_000.0).sin() * 0.25;
                [sample, sample]
            })
            .collect()
    }
    let frames = 8192;
    for channels in [6_usize, 8_usize] {
        let low = route_with_algorithm(
            channels as u32,
            ALGORITHM_MATRIX_DECODE,
            &mono_tone(53.0, frames),
        );
        let high = route_with_algorithm(
            channels as u32,
            ALGORITHM_MATRIX_DECODE,
            &mono_tone(2_000.0, frames),
        );
        let low_tail = &low[2048 * channels..];
        let high_tail = &high[2048 * channels..];
        let low_energy = channel_energy(low_tail, channels, 3);
        let high_energy = channel_energy(high_tail, channels, 3);
        assert!(
            high_energy / low_energy < 0.02,
            "{channels}ch LFE did not reject high frequency: low={low_energy}, high={high_energy}"
        );
    }
}

#[test]
fn custom_matrix_operates_on_both_layouts_with_canonical_rows() {
    for channels in [6_usize, 8_usize] {
        let mut cfg = config(channels as u32);
        cfg.max_frames_per_call = 64;
        let mut router = ChannelRouter::new(&cfg).expect("router");
        let mut params = RouterParams::front_only(channels as u32);
        params.algorithm = ALGORITHM_CUSTOM_MATRIX;
        params.custom_matrix = [0.0; 16];
        for channel in 0..channels {
            params.custom_matrix[channel * 2] = 0.08 * (channel + 1) as f32;
            params.custom_matrix[channel * 2 + 1] = -0.03 * (channel + 1) as f32;
        }
        assert_eq!(router.stage(1, &params), RESULT_OK);
        assert_eq!(router.commit(1, 0), RESULT_OK);
        let input = vec![0.75, -0.25].repeat(64);
        let mut output = vec![0.0; 64 * channels];
        assert_eq!(router.process(&input, 64, &mut output), RESULT_OK);
        assert!((0..channels).all(|channel| channel_energy(&output, channels, channel) > 0.0));
        for channel in [0_usize, 1, 2] {
            let expected = 0.75 * params.custom_matrix[channel * 2]
                - 0.25 * params.custom_matrix[channel * 2 + 1];
            assert!((output[channel] - expected).abs() < 1.0e-6);
        }
    }
}

#[test]
fn every_layout_channel_has_an_independent_tone_and_impulse_fingerprint() {
    for channels in [6_u32, 8_u32] {
        for kind in [TEST_SIGNAL_TONE, TEST_SIGNAL_IMPULSE] {
            for target in 0..channels {
                let signal = TestSignalConfig {
                    output_channels: channels,
                    channel_index: target,
                    kind,
                    frequency_hz: 997.0,
                    gain_db: -12.0,
                    ..TestSignalConfig::default()
                };
                let mut state = TestSignalState::default();
                let mut output = vec![0.0; 128 * channels as usize];
                assert_eq!(
                    generate_test_signal(&signal, &mut state, 128, &mut output),
                    RESULT_OK
                );
                for channel in 0..channels as usize {
                    let energy = channel_energy(&output, channels as usize, channel);
                    if channel == target as usize {
                        assert!(energy > 0.0);
                    } else {
                        assert_eq!(energy, 0.0);
                    }
                }
            }
        }
    }
}

#[test]
fn ambient_extract_keeps_mono_ambience_low_controlled_and_decorrelated() {
    let frames = 8192;
    let input: Vec<f32> = (0..frames)
        .flat_map(|frame| {
            let time = frame as f32 / 48_000.0;
            let mono = (std::f32::consts::TAU * 53.0 * time).sin() * 0.13
                + (std::f32::consts::TAU * 223.0 * time).sin() * 0.16
                + (std::f32::consts::TAU * 881.0 * time).sin() * 0.07;
            [mono, mono]
        })
        .collect();

    for channels in [6_usize, 8_usize] {
        let output = route_with_algorithm(channels as u32, ALGORITHM_AMBIENT_EXTRACT, &input);
        let front_energy =
            channel_energy(&output, channels, 0) + channel_energy(&output, channels, 1);
        let pairs: &[(usize, usize)] = if channels == 8 {
            &[(4, 5), (6, 7)]
        } else {
            &[(4, 5)]
        };
        for (left, right) in pairs {
            let left_energy = channel_energy(&output, channels, *left);
            let right_energy = channel_energy(&output, channels, *right);
            let pair_energy = left_energy + right_energy;
            assert!(
                pair_energy > 1.0e-5,
                "mono ambience vanished for {channels}ch pair"
            );
            assert!(
                pair_energy / front_energy < 0.03,
                "mono ambience overpowered the front/vocal bed: {pair_energy}/{front_energy}"
            );
            let energy_ratio = left_energy / right_energy.max(1.0e-12);
            assert!(
                (0.99..=1.01).contains(&energy_ratio),
                "mono ambience is not left/right energy-mirrored: {energy_ratio}"
            );
            let left_samples = channel_samples(&output, channels, *left);
            let right_samples = channel_samples(&output, channels, *right);
            assert!(
                normalized_correlation(&left_samples, &right_samples).abs() < 0.99,
                "mono ambience was copied instead of decorrelated"
            );
        }
    }
}

#[test]
fn ambient_mono_pairs_do_not_create_a_fixed_precedence_side_bias() {
    let frames = 4096;
    let mut input = vec![0.0_f32; frames * 2];
    input[0] = 1.0;
    input[1] = 1.0;
    for channels in [6_usize, 8_usize] {
        let output = route_with_algorithm(channels as u32, ALGORITHM_AMBIENT_EXTRACT, &input);
        let pairs: &[(usize, usize)] = if channels == 8 {
            &[(4, 5), (6, 7)]
        } else {
            &[(4, 5)]
        };
        for (left, right) in pairs {
            let first = |channel: usize| {
                (0..frames)
                    .find(|frame| output[frame * channels + channel].abs() > 1.0e-6)
                    .expect("ambient impulse vanished")
            };
            let arrival_skew_frames = first(*left).abs_diff(first(*right));
            assert!(
                arrival_skew_frames <= 9,
                "ambient pair has {arrival_skew_frames} frames of fixed precedence skew"
            );
        }
    }
}
