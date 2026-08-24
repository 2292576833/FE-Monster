#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <windows.h>

#include "fe_audio_pipeline.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <vector>

namespace {

constexpr uint32_t kSampleRate = 48'000;
constexpr uint32_t kFrames = 4'096;

static_assert(sizeof(FeRustChannelRouterConfig) == 40);
static_assert(sizeof(FeRustChannelRouterParams) == 212);
static_assert(sizeof(FeRustChannelRouterStatus) == 184);
static_assert(sizeof(FeRustTestSignalConfig) == 48);
static_assert(sizeof(FeRustTestSignalState) == 32);

struct PipelineGuard {
    FeAudioPipelineHandle handle = nullptr;
    ~PipelineGuard() {
        if (handle != nullptr) fe_audio_pipeline_destroy(handle);
    }
};

float Energy(const std::vector<float>& pcm, uint32_t channels, uint32_t channel) {
    float energy = 0.0f;
    for (size_t frame = 0; frame < pcm.size() / channels; ++frame) {
        const float sample = pcm[frame * channels + channel];
        energy += sample * sample;
    }
    return energy;
}

float Correlation(
    const std::vector<float>& pcm,
    uint32_t channels,
    uint32_t left,
    uint32_t right
) {
    float dot = 0.0f;
    float left_energy = 0.0f;
    float right_energy = 0.0f;
    for (size_t frame = 0; frame < pcm.size() / channels; ++frame) {
        const float a = pcm[frame * channels + left];
        const float b = pcm[frame * channels + right];
        dot += a * b;
        left_energy += a * a;
        right_energy += b * b;
    }
    return dot / std::max(1.0e-12f, std::sqrt(left_energy * right_energy));
}

FeRustChannelRouterParams MatrixParams(uint32_t channels) {
    FeRustChannelRouterParams params{};
    params.struct_size = sizeof(params);
    params.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
    params.output_channels = channels;
    params.algorithm = FE_RUST_UPMIX_MATRIX_DECODE;
    params.lfe_crossover_hz = 120.0f;
    const std::array<float, 8> azimuths = channels == 8
        ? std::array<float, 8>{30.0f, -30.0f, 0.0f, 0.0f, 135.0f, -135.0f, 90.0f, -90.0f}
        : std::array<float, 8>{30.0f, -30.0f, 0.0f, 0.0f, 110.0f, -110.0f, 0.0f, 0.0f};
    std::copy(azimuths.begin(), azimuths.end(), params.channel_azimuth_deg);
    return params;
}

FeRustMixerParams CleanMixerParams() {
    FeRustMixerParams params{};
    params.struct_size = sizeof(params);
    params.abi_version = FE_RUST_MIXER_ABI_VERSION;
    params.enabled = 1;
    params.limiter_enabled = 1;
    params.stereo_width = 1.0f;
    params.center_gain = 1.0f;
    params.surround_gain = 1.0f;
    params.lfe_gain = 1.0f;
    params.compressor_threshold_db = -18.0f;
    params.compressor_ratio = 2.0f;
    params.compressor_attack_ms = 10.0f;
    params.compressor_release_ms = 150.0f;
    params.compressor_knee_db = 6.0f;
    params.limiter_ceiling_db = -0.3f;
    params.limiter_release_ms = 100.0f;
    params.reverb_room_size = 0.35f;
    params.reverb_decay_ms = 800.0f;
    params.reverb_damping = 0.5f;
    params.reverb_pre_delay_ms = 12.0f;
    params.reverb_dry = 1.0f;
    return params;
}

FeAudioSpatialControlParams SpatialParams(uint32_t channels, uint32_t algorithm) {
    FeAudioSpatialControlParams params{};
    params.struct_size = sizeof(params);
    params.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    params.upmix_enabled = 1;
    params.upmix_algorithm = algorithm;
    params.upmix_output_channels = channels;
    params.upmix_center_width_hz = 300.0f;
    params.upmix_lfe_crossover_hz = 120.0f;
    params.upmix_center_gain = 0.707f;
    params.upmix_surround_gain = 0.5f;
    params.upmix_lfe_gain = 0.707f;
    params.upmix_decorrelation_amount = 0.7f;
    params.obr_enabled = 1;
    params.obr_filter_profile = FE_AUDIO_OBR_FILTER_DIRECT;
    params.obr_wet = 1.0f;
    params.obr_dry = 0.0f;
    params.obr_output_gain_db = 0.0f;
    params.obr_spatial_width = 1.0f;
    return params;
}

std::vector<float> StereoProgram() {
    std::vector<float> input(static_cast<size_t>(kFrames) * 2u);
    for (uint32_t frame = 0; frame < kFrames; ++frame) {
        const float time = static_cast<float>(frame) / kSampleRate;
        const float low = std::sin(2.0f * 3.14159265358979323846f * 53.0f * time) * 0.18f;
        input[static_cast<size_t>(frame) * 2u] = low
            + std::sin(2.0f * 3.14159265358979323846f * 223.0f * time) * 0.21f
            + std::sin(2.0f * 3.14159265358979323846f * 881.0f * time) * 0.11f;
        input[static_cast<size_t>(frame) * 2u + 1u] = low * 0.77f
            + std::sin(2.0f * 3.14159265358979323846f * 331.0f * time + 0.37f) * 0.19f
            + std::sin(2.0f * 3.14159265358979323846f * 1273.0f * time + 0.19f) * 0.09f;
    }
    return input;
}

struct LayoutResult {
    bool pass = false;
    uint32_t channels = 0;
    float front_side_correlation = 1.0f;
    float side_back_correlation = 0.0f;
    float minimum_energy = 0.0f;
    float lfe_rms = 0.0f;
    uint64_t process_calls = 0;
    uint32_t physical_output_channels = 0;
    uint32_t binaural_output = 0;
    uint32_t physical_multichannel = 0;
};

LayoutResult ProbeLayout(uint32_t channels) {
    LayoutResult result{};
    result.channels = channels;
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = channels;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 64;
    config.upmix_algorithm = 2;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return result;

    // Exercise the actual production control path first. Existing Java/UI
    // controls publish the spatial snapshot and the matching Mixer revision;
    // Matrix/Ambient must not require a hidden router call to become active.
    const FeAudioSpatialControlParams spatial = SpatialParams(
        channels,
        FE_RUST_UPMIX_MATRIX_DECODE
    );
    const FeRustMixerParams mixer = CleanMixerParams();
    if (fe_audio_pipeline_set_spatial_controls(pipeline.handle, 1, &spatial, 960)
            != FE_RUST_MIXER_OK
        || fe_audio_pipeline_set_mixer_params(pipeline.handle, 1, &mixer, 960)
            != FE_RUST_MIXER_OK) {
        return result;
    }
    const std::vector<float> input = StereoProgram();
    if (FAILED(fe_audio_pipeline_submit(pipeline.handle, input.data(), kFrames))) return result;

    std::vector<float> bed(static_cast<size_t>(kFrames) * channels);
    if (fe_audio_pipeline_process_channel_router(
            pipeline.handle,
            input.data(),
            kFrames,
            bed.data(),
            static_cast<uint32_t>(bed.size())
        ) != FE_RUST_CHANNEL_ROUTER_OK) {
        return result;
    }

    result.minimum_energy = Energy(bed, channels, 0);
    for (uint32_t channel = 1; channel < channels; ++channel) {
        result.minimum_energy = std::min(result.minimum_energy, Energy(bed, channels, channel));
    }
    const uint32_t side_left = channels == 8 ? 6u : 4u;
    result.front_side_correlation = std::abs(Correlation(bed, channels, 0, side_left));
    result.side_back_correlation = channels == 8
        ? std::abs(Correlation(bed, channels, side_left, 4))
        : 0.0f;

    FeRustChannelRouterStatus router_status{};
    router_status.struct_size = sizeof(router_status);
    router_status.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
    if (fe_audio_pipeline_get_channel_router_status(pipeline.handle, &router_status)
        != FE_RUST_CHANNEL_ROUTER_OK) {
        return result;
    }
    result.lfe_rms = router_status.channel_rms[3];
    result.process_calls = router_status.process_calls;

    // Every target channel must have a one-hot in-memory test signal in both
    // tone and impulse modes; no file or URL participates.
    for (uint32_t kind : {FE_RUST_TEST_SIGNAL_TONE, FE_RUST_TEST_SIGNAL_IMPULSE}) {
        for (uint32_t target = 0; target < channels; ++target) {
            FeRustTestSignalConfig signal{};
            signal.struct_size = sizeof(signal);
            signal.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
            signal.sample_rate = kSampleRate;
            signal.output_channels = channels;
            signal.channel_index = target;
            signal.kind = kind;
            signal.frequency_hz = 997.0f;
            signal.gain_db = -12.0f;
            FeRustTestSignalState state{};
            std::vector<float> generated(static_cast<size_t>(128) * channels);
            if (fe_audio_pipeline_generate_channel_test_signal(
                    pipeline.handle,
                    &signal,
                    &state,
                    128,
                    generated.data(),
                    static_cast<uint32_t>(generated.size())
                ) != FE_RUST_CHANNEL_ROUTER_OK) {
                return result;
            }
            for (uint32_t channel = 0; channel < channels; ++channel) {
                const float energy = Energy(generated, channels, channel);
                if ((channel == target && energy <= 0.0f)
                    || (channel != target && energy != 0.0f)) {
                    return result;
                }
            }
        }
    }

    // Explicit custom matrix also has to operate on both canonical layouts.
    FeRustChannelRouterParams params = MatrixParams(channels);
    params.algorithm = FE_RUST_UPMIX_CUSTOM_MATRIX;
    for (uint32_t channel = 0; channel < channels; ++channel) {
        params.custom_matrix[channel * 2] = 0.08f * static_cast<float>(channel + 1);
        params.custom_matrix[channel * 2 + 1] = -0.03f * static_cast<float>(channel + 1);
    }
    if (fe_audio_pipeline_set_channel_router_params(pipeline.handle, 2, &params, 0)
        != FE_RUST_CHANNEL_ROUTER_OK) {
        return result;
    }
    std::fill(bed.begin(), bed.end(), 0.0f);
    if (fe_audio_pipeline_process_channel_router(
            pipeline.handle,
            input.data(),
            kFrames,
            bed.data(),
            static_cast<uint32_t>(bed.size())
        ) != FE_RUST_CHANNEL_ROUTER_OK) {
        return result;
    }
    for (uint32_t channel = 0; channel < channels; ++channel) {
        if (Energy(bed, channels, channel) <= 0.0f) return result;
    }

    // The production route still owns Mixer -> OBR and must report physical
    // binaural stereo rather than claiming the virtual bed is hardware output.
    if (FAILED(fe_audio_pipeline_submit(pipeline.handle, input.data(), kFrames))) return result;
    FeAudioPipelineStatus pipeline_status{};
    pipeline_status.struct_size = sizeof(pipeline_status);
    if (FAILED(fe_audio_pipeline_get_status(pipeline.handle, &pipeline_status))) return result;
    result.physical_output_channels = pipeline_status.physical_output_channels;
    result.binaural_output = pipeline_status.binaural_output;
    result.physical_multichannel = pipeline_status.physical_multichannel;
    result.pass = result.minimum_energy > 1.0e-4f
        && result.front_side_correlation < 0.985f
        && (channels != 8 || result.side_back_correlation < 0.985f)
        && result.lfe_rms > 0.0f
        && router_status.actual == 1
        && result.process_calls >= 1
        && pipeline_status.virtual_bed_channels == channels
        && result.physical_output_channels == 2
        && result.binaural_output == 1
        && result.physical_multichannel == 0
        && pipeline_status.obr_effective == 1;
    return result;
}

bool ProbePassiveRemainsLegacy() {
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 6;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 64;
    config.upmix_algorithm = 1;  // Existing config ABI: Passive FFT.
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return false;

    const FeAudioSpatialControlParams spatial = SpatialParams(6, 0);  // Existing UI passive.
    const FeRustMixerParams mixer = CleanMixerParams();
    if (fe_audio_pipeline_set_spatial_controls(pipeline.handle, 1, &spatial, 960)
            != FE_RUST_MIXER_OK
        || fe_audio_pipeline_set_mixer_params(pipeline.handle, 1, &mixer, 960)
            != FE_RUST_MIXER_OK) {
        return false;
    }
    const std::vector<float> input = StereoProgram();
    if (FAILED(fe_audio_pipeline_submit(pipeline.handle, input.data(), kFrames))) return false;

    FeRustChannelRouterStatus router{};
    router.struct_size = sizeof(router);
    router.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
    const int32_t router_result = fe_audio_pipeline_get_channel_router_status(
        pipeline.handle,
        &router
    );
    FeAudioPipelineStatus status{};
    status.struct_size = sizeof(status);
    return router_result == FE_RUST_CHANNEL_ROUTER_UNSUPPORTED
        && SUCCEEDED(fe_audio_pipeline_get_status(pipeline.handle, &status))
        && status.rust_upmix_active == 1
        && status.rust_upmix_process_calls >= 1;
}

bool ProbeExplicitRevisionSurvivesRouteRebuild() {
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 6;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 64;
    config.upmix_algorithm = 2;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return false;

    FeRustChannelRouterParams explicit_params = MatrixParams(6);
    explicit_params.algorithm = FE_RUST_UPMIX_CUSTOM_MATRIX;
    for (uint32_t channel = 0; channel < 6; ++channel) {
        explicit_params.custom_matrix[channel * 2] = 0.07f * static_cast<float>(channel + 1);
        explicit_params.custom_matrix[channel * 2 + 1] = 0.02f * static_cast<float>(channel + 1);
    }
    if (fe_audio_pipeline_set_channel_router_params(
            pipeline.handle,
            5,
            &explicit_params,
            0
        ) != FE_RUST_CHANNEL_ROUTER_OK) {
        return false;
    }
    const std::vector<float> input = StereoProgram();
    std::vector<float> bed(static_cast<size_t>(kFrames) * 6u);
    if (fe_audio_pipeline_process_channel_router(
            pipeline.handle,
            input.data(),
            kFrames,
            bed.data(),
            static_cast<uint32_t>(bed.size())
        ) != FE_RUST_CHANNEL_ROUTER_OK) {
        return false;
    }

    FeRustChannelRouterStatus before{};
    before.struct_size = sizeof(before);
    before.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
    if (fe_audio_pipeline_get_channel_router_status(pipeline.handle, &before)
            != FE_RUST_CHANNEL_ROUTER_OK
        || before.active_revision != 5) {
        return false;
    }

    FeAudioSpatialControlParams spatial = SpatialParams(6, FE_RUST_UPMIX_MATRIX_DECODE);
    spatial.obr_filter_profile = FE_AUDIO_OBR_FILTER_AMBIENT;
    const FeRustMixerParams mixer = CleanMixerParams();
    if (fe_audio_pipeline_set_spatial_controls(pipeline.handle, 1, &spatial, 960)
            != FE_RUST_MIXER_OK
        || fe_audio_pipeline_set_mixer_params(pipeline.handle, 1, &mixer, 960)
            != FE_RUST_MIXER_OK
        || FAILED(fe_audio_pipeline_submit(pipeline.handle, input.data(), kFrames))
        || FAILED(fe_audio_pipeline_submit(pipeline.handle, input.data(), kFrames))) {
        return false;
    }

    FeRustChannelRouterStatus after{};
    after.struct_size = sizeof(after);
    after.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
    return fe_audio_pipeline_get_channel_router_status(pipeline.handle, &after)
            == FE_RUST_CHANNEL_ROUTER_OK
        && after.active_revision == 5
        && after.algorithm == FE_RUST_UPMIX_CUSTOM_MATRIX;
}

bool ProbePendingLayoutSwitchPreservesExplicitParams() {
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 6;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 64;
    config.upmix_algorithm = 2;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return false;

    FeRustChannelRouterParams initial = MatrixParams(6);
    initial.algorithm = FE_RUST_UPMIX_CUSTOM_MATRIX;
    for (uint32_t channel = 0; channel < 6; ++channel) {
        initial.custom_matrix[channel * 2] = 0.05f * static_cast<float>(channel + 1);
        initial.custom_matrix[channel * 2 + 1] = 0.01f * static_cast<float>(channel + 1);
    }
    if (fe_audio_pipeline_set_channel_router_params(pipeline.handle, 5, &initial, 0)
        != FE_RUST_CHANNEL_ROUTER_OK) {
        return false;
    }
    const std::vector<float> input = StereoProgram();
    std::vector<float> initial_bed(static_cast<size_t>(kFrames) * 6u);
    if (fe_audio_pipeline_process_channel_router(
            pipeline.handle,
            input.data(),
            kFrames,
            initial_bed.data(),
            static_cast<uint32_t>(initial_bed.size())
        ) != FE_RUST_CHANNEL_ROUTER_OK) {
        return false;
    }

    // The UI publishes the desired spatial layout before the matching
    // per-channel snapshot. At this point the effective graph is still 5.1;
    // the 7.1 custom snapshot must be staged for the pending graph instead of
    // being rejected against the old six-channel handle.
    FeAudioSpatialControlParams pending_spatial = SpatialParams(
        8,
        FE_RUST_UPMIX_MATRIX_DECODE
    );
    const FeRustMixerParams mixer = CleanMixerParams();
    FeRustChannelRouterParams pending_router = MatrixParams(8);
    pending_router.algorithm = FE_RUST_UPMIX_CUSTOM_MATRIX;
    for (uint32_t channel = 0; channel < 8; ++channel) {
        pending_router.custom_matrix[channel * 2] = 0.035f * static_cast<float>(channel + 1);
        pending_router.custom_matrix[channel * 2 + 1] = -0.012f * static_cast<float>(channel + 1);
        pending_router.channel_gain_db[channel] = -0.25f * static_cast<float>(channel);
        pending_router.channel_delay_ms[channel] = 0.35f * static_cast<float>(channel);
    }
    if (fe_audio_pipeline_set_spatial_controls(
            pipeline.handle,
            2,
            &pending_spatial,
            960
        ) != FE_RUST_MIXER_OK
        || fe_audio_pipeline_set_channel_router_params(
            pipeline.handle,
            5,
            &pending_router,
            960
        ) != FE_RUST_CHANNEL_ROUTER_OK
        || fe_audio_pipeline_set_mixer_params(pipeline.handle, 2, &mixer, 960)
            != FE_RUST_MIXER_OK) {
        return false;
    }

    FeRustChannelRouterStatus before_commit{};
    before_commit.struct_size = sizeof(before_commit);
    before_commit.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
    if (fe_audio_pipeline_get_channel_router_status(pipeline.handle, &before_commit)
            != FE_RUST_CHANNEL_ROUTER_OK
        || before_commit.output_channels != 6
        || before_commit.active_revision != 5) {
        // Staging a desired 7.1 snapshot must not make telemetry claim that
        // the still-audible 5.1 graph has already switched.
        std::cerr << "pending-layout-before output=" << before_commit.output_channels
                  << " revision=" << before_commit.active_revision
                  << " actual=" << before_commit.actual << "\n";
        return false;
    }

    if (FAILED(fe_audio_pipeline_submit(pipeline.handle, input.data(), kFrames))
        || FAILED(fe_audio_pipeline_submit(pipeline.handle, input.data(), kFrames))) {
        return false;
    }

    FeRustChannelRouterStatus status{};
    status.struct_size = sizeof(status);
    status.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
    if (fe_audio_pipeline_get_channel_router_status(pipeline.handle, &status)
            != FE_RUST_CHANNEL_ROUTER_OK
        || status.actual != 1
        || status.output_channels != 8
        || status.algorithm != FE_RUST_UPMIX_CUSTOM_MATRIX
        || status.active_revision != 5) {
        std::cerr << "pending-layout-after output=" << status.output_channels
                  << " revision=" << status.active_revision
                  << " algorithm=" << status.algorithm
                  << " actual=" << status.actual << "\n";
        return false;
    }
    for (uint32_t channel = 0; channel < 8; ++channel) {
        if (!(status.channel_rms[channel] > 0.0f)) return false;
    }
    return true;
}

bool ProbeBuiltInProductionRoute(uint32_t channels, uint32_t algorithm) {
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = channels;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 64;
    config.upmix_algorithm = algorithm == FE_RUST_UPMIX_AMBIENT_EXTRACT ? 3u : 2u;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return false;

    const FeAudioSpatialControlParams spatial = SpatialParams(channels, algorithm);
    const FeRustMixerParams mixer = CleanMixerParams();
    const std::vector<float> input = StereoProgram();
    if (fe_audio_pipeline_set_spatial_controls(pipeline.handle, 1, &spatial, 960)
            != FE_RUST_MIXER_OK
        || fe_audio_pipeline_set_mixer_params(pipeline.handle, 1, &mixer, 960)
            != FE_RUST_MIXER_OK
        || FAILED(fe_audio_pipeline_submit(pipeline.handle, input.data(), kFrames))
        || FAILED(fe_audio_pipeline_submit(pipeline.handle, input.data(), kFrames))) {
        return false;
    }
    FeRustChannelRouterStatus router{};
    router.struct_size = sizeof(router);
    router.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
    if (fe_audio_pipeline_get_channel_router_status(pipeline.handle, &router)
            != FE_RUST_CHANNEL_ROUTER_OK
        || router.actual != 1
        || router.algorithm != algorithm
        || router.output_channels != channels
        || router.process_calls < 1) {
        return false;
    }
    for (uint32_t channel = 0; channel < channels; ++channel) {
        if (!(router.channel_rms[channel] > 0.0f)) return false;
    }
    return true;
}

bool ProbeCustomAzimuthReachesObr(uint32_t channels) {
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = channels;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 64;
    config.upmix_algorithm = 2;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return false;

    const FeAudioSpatialControlParams spatial = SpatialParams(
        channels,
        FE_RUST_UPMIX_MATRIX_DECODE
    );
    const FeRustMixerParams mixer = CleanMixerParams();
    const std::vector<float> input = StereoProgram();
    if (fe_audio_pipeline_set_spatial_controls(pipeline.handle, 1, &spatial, 960)
            != FE_RUST_MIXER_OK
        || fe_audio_pipeline_set_mixer_params(pipeline.handle, 1, &mixer, 960)
            != FE_RUST_MIXER_OK
        || FAILED(fe_audio_pipeline_submit(pipeline.handle, input.data(), kFrames))
        || FAILED(fe_audio_pipeline_submit(pipeline.handle, input.data(), kFrames))) {
        return false;
    }

    FeRustChannelRouterParams initial = MatrixParams(channels);
    if (fe_audio_pipeline_set_channel_router_params(pipeline.handle, 5, &initial, 0)
            != FE_RUST_CHANNEL_ROUTER_OK
        || FAILED(fe_audio_pipeline_submit(pipeline.handle, input.data(), kFrames))) {
        return false;
    }
    FeAudioPipelineStatus before{};
    before.struct_size = sizeof(before);
    if (FAILED(fe_audio_pipeline_get_status(pipeline.handle, &before))) return false;

    // Advance one revision without changing the sound field. This establishes
    // the steady repeated-program baseline so the next assertion proves that
    // the OBR output changed because of the azimuth, not merely because a
    // control revision was published.
    if (fe_audio_pipeline_set_channel_router_params(pipeline.handle, 6, &initial, 0)
            != FE_RUST_CHANNEL_ROUTER_OK
        || FAILED(fe_audio_pipeline_submit(pipeline.handle, input.data(), kFrames))) {
        return false;
    }
    FeAudioPipelineStatus control{};
    control.struct_size = sizeof(control);
    if (FAILED(fe_audio_pipeline_get_status(pipeline.handle, &control))) return false;

    FeRustChannelRouterParams moved = initial;
    const uint32_t moved_channel = 4u;
    const float moved_azimuth = channels == 8 ? 165.0f : 155.0f;
    moved.channel_azimuth_deg[moved_channel] = moved_azimuth;
    if (fe_audio_pipeline_set_channel_router_params(pipeline.handle, 7, &moved, 0)
            != FE_RUST_CHANNEL_ROUTER_OK
        || FAILED(fe_audio_pipeline_submit(pipeline.handle, input.data(), kFrames))) {
        return false;
    }

    FeAudioPipelineStatus after{};
    after.struct_size = sizeof(after);
    if (FAILED(fe_audio_pipeline_get_status(pipeline.handle, &after))) return false;
    return control.object_position_updates >= before.object_position_updates + channels
        && after.object_position_updates >= control.object_position_updates + channels
        && std::abs(after.maximum_object_azimuth - moved_azimuth) <= 0.05f
        && after.maximum_object_target_error <= 0.05f
        && std::abs(after.output_energy - control.output_energy) > 5.0e-4f
        && after.obr_effective == 1
        && after.virtual_bed_channels == channels
        && after.physical_output_channels == 2;
}

}  // namespace

int main() {
    const LayoutResult layout_51 = ProbeLayout(6);
    const LayoutResult layout_71 = ProbeLayout(8);
    const bool passive_legacy = ProbePassiveRemainsLegacy();
    const bool revision_survives_rebuild = ProbeExplicitRevisionSurvivesRouteRebuild();
    const bool pending_layout_preserves_explicit =
        ProbePendingLayoutSwitchPreservesExplicitParams();
    const bool ambient_51 = ProbeBuiltInProductionRoute(6, FE_RUST_UPMIX_AMBIENT_EXTRACT);
    const bool ambient_71 = ProbeBuiltInProductionRoute(8, FE_RUST_UPMIX_AMBIENT_EXTRACT);
    const bool custom_azimuth_51 = ProbeCustomAzimuthReachesObr(6);
    const bool custom_azimuth_71 = ProbeCustomAzimuthReachesObr(8);
    const bool pass = layout_51.pass
        && layout_71.pass
        && passive_legacy
        && revision_survives_rebuild
        && pending_layout_preserves_explicit
        && ambient_51
        && ambient_71
        && custom_azimuth_51
        && custom_azimuth_71;
    std::cout
        << "{\"pass\":" << (pass ? "true" : "false")
        << ",\"layout51\":{\"pass\":" << (layout_51.pass ? "true" : "false")
        << ",\"minimumEnergy\":" << layout_51.minimum_energy
        << ",\"frontSideCorrelation\":" << layout_51.front_side_correlation
        << ",\"lfeRms\":" << layout_51.lfe_rms
        << ",\"physicalOutputChannels\":" << layout_51.physical_output_channels
        << ",\"binauralOutput\":" << layout_51.binaural_output
        << ",\"physicalMultichannel\":" << layout_51.physical_multichannel << "}"
        << ",\"layout71\":{\"pass\":" << (layout_71.pass ? "true" : "false")
        << ",\"minimumEnergy\":" << layout_71.minimum_energy
        << ",\"frontSideCorrelation\":" << layout_71.front_side_correlation
        << ",\"sideBackCorrelation\":" << layout_71.side_back_correlation
        << ",\"lfeRms\":" << layout_71.lfe_rms
        << ",\"physicalOutputChannels\":" << layout_71.physical_output_channels
        << ",\"binauralOutput\":" << layout_71.binaural_output
        << ",\"physicalMultichannel\":" << layout_71.physical_multichannel << "}"
        << ",\"passiveLegacy\":" << (passive_legacy ? "true" : "false")
        << ",\"revisionSurvivesRebuild\":"
        << (revision_survives_rebuild ? "true" : "false")
        << ",\"pendingLayoutPreservesExplicit\":"
        << (pending_layout_preserves_explicit ? "true" : "false")
        << ",\"ambient51Production\":" << (ambient_51 ? "true" : "false")
        << ",\"ambient71Production\":" << (ambient_71 ? "true" : "false")
        << ",\"customAzimuth51ReachesObr\":"
        << (custom_azimuth_51 ? "true" : "false")
        << ",\"customAzimuth71ReachesObr\":"
        << (custom_azimuth_71 ? "true" : "false") << "}\n";
    return pass ? 0 : 1;
}
