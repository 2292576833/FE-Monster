#include "fe_audio_pipeline.h"
#include "../../rust-audio-upmix/include/fe_rust_mixer.h"
#include "../../rust-audio-upmix/include/fe_rust_upmix.h"

#include <windows.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <limits>
#include <string>
#include <thread>
#include <vector>

namespace {

constexpr uint32_t kSampleRate = 48000;
constexpr uint32_t kFrames = 256;
constexpr float kPi = 3.14159265358979323846f;

struct PipelineGuard {
    FeAudioPipelineHandle handle = nullptr;
    ~PipelineGuard() {
        if (handle != nullptr) fe_audio_pipeline_destroy(handle);
    }
};

struct ScopedEnvironment final {
    explicit ScopedEnvironment(const wchar_t* name, const wchar_t* value) : name_(name) {
        const DWORD required = GetEnvironmentVariableW(name, nullptr, 0);
        if (required > 0) {
            previous_.resize(required);
            const DWORD copied = GetEnvironmentVariableW(
                name,
                previous_.data(),
                static_cast<DWORD>(previous_.size())
            );
            had_previous_ = copied > 0 && copied < previous_.size();
            if (had_previous_) previous_.resize(copied);
        }
        SetEnvironmentVariableW(name, value);
    }

    ~ScopedEnvironment() {
        SetEnvironmentVariableW(name_.c_str(), had_previous_ ? previous_.c_str() : nullptr);
    }

private:
    std::wstring name_;
    std::wstring previous_;
    bool had_previous_ = false;
};

std::vector<float> MakeStereoTone(float phase_offset = 0.0f) {
    std::vector<float> pcm(static_cast<size_t>(kFrames) * 2);
    for (uint32_t frame = 0; frame < kFrames; ++frame) {
        const float phase = phase_offset
            + 2.0f * kPi * 330.0f * static_cast<float>(frame) / kSampleRate;
        pcm[static_cast<size_t>(frame) * 2] = std::sin(phase) * 0.12f;
        pcm[static_cast<size_t>(frame) * 2 + 1] = std::sin(phase + 0.41f) * 0.1f;
    }
    return pcm;
}

std::vector<float> MakeToneFrames(
    uint32_t channels,
    uint32_t frames,
    float phase_offset = 0.0f
) {
    std::vector<float> pcm(static_cast<size_t>(frames) * channels);
    for (uint32_t frame = 0; frame < frames; ++frame) {
        const float phase = phase_offset
            + 2.0f * kPi * 330.0f * static_cast<float>(frame) / kSampleRate;
        for (uint32_t channel = 0; channel < channels; ++channel) {
            pcm[static_cast<size_t>(frame) * channels + channel] =
                std::sin(phase + static_cast<float>(channel) * 0.19f)
                    * (0.12f - std::min(channel, 5u) * 0.008f);
        }
    }
    return pcm;
}

std::vector<float> MakeTone(uint32_t channels, float phase_offset = 0.0f) {
    return MakeToneFrames(channels, kFrames, phase_offset);
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

FeAudioPose Pose(float x) {
    FeAudioPose pose{};
    pose.emitter_x = x;
    pose.emitter_z = 1.2f;
    pose.listener_front_z = 1.0f;
    pose.listener_up_y = 1.0f;
    return pose;
}

bool ReadStatus(FeAudioPipelineHandle handle, FeAudioPipelineStatus* status) {
    *status = {};
    status->struct_size = sizeof(*status);
    return SUCCEEDED(fe_audio_pipeline_get_status(handle, status));
}

bool ReadMixerStatus(
    FeAudioPipelineHandle handle,
    FeAudioMixerPipelineStatus* status
) {
    *status = {};
    status->struct_size = sizeof(*status);
    return SUCCEEDED(fe_audio_pipeline_get_mixer_status(handle, status));
}

bool CommitCleanMixer(FeAudioPipelineHandle handle, uint64_t revision) {
    FeRustMixerParams params = CleanMixerParams();
    return fe_audio_pipeline_set_mixer_params(handle, revision, &params, 960)
        == FE_RUST_MIXER_OK;
}

bool WaitForConsumed(
    FeAudioPipelineHandle handle,
    uint64_t minimum,
    FeAudioPipelineStatus* status
) {
    for (int attempt = 0; attempt < 250; ++attempt) {
        if (!ReadStatus(handle, status)) return false;
        if (status->buffers_consumed >= minimum) return true;
        Sleep(20);
    }
    return false;
}

bool SubmitBlocks(
    FeAudioPipelineHandle handle,
    int count,
    FeAudioPipelineStatus* status
) {
    FeAudioPipelineStatus before{};
    if (!ReadStatus(handle, &before)) return false;
    for (int index = 0; index < count; ++index) {
        const std::vector<float> pcm = MakeStereoTone(static_cast<float>(index) * 0.17f);
        const HRESULT result = fe_audio_pipeline_submit(handle, pcm.data(), kFrames);
        if (FAILED(result)) return false;
    }
    return WaitForConsumed(
        handle,
        before.buffers_consumed + static_cast<uint64_t>(count),
        status
    );
}

bool SubmitBlocksWithChannels(
    FeAudioPipelineHandle handle,
    uint32_t input_channels,
    int count,
    FeAudioPipelineStatus* status
) {
    FeAudioPipelineStatus before{};
    if (!ReadStatus(handle, &before)) return false;
    for (int index = 0; index < count; ++index) {
        const std::vector<float> pcm = MakeTone(
            input_channels,
            static_cast<float>(index) * 0.17f
        );
        const HRESULT result = fe_audio_pipeline_submit(handle, pcm.data(), kFrames);
        if (FAILED(result)) return false;
    }
    return WaitForConsumed(
        handle,
        before.buffers_consumed + static_cast<uint64_t>(count),
        status
    );
}

bool ProbeDry(FeAudioPipelineStatus* result_status) {
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 2;
    config.mode = FE_AUDIO_MODE_DRY;
    config.muted = 1;
    config.max_queued_buffers = 16;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return false;
    if (!SubmitBlocks(pipeline.handle, 16, result_status)) return false;
    return result_status->renderer_ready == 1
        && result_status->buffers_consumed >= 16
        && result_status->obr_process_calls == 0
        && result_status->x3d_calculate_calls == 0
        && result_status->rust_upmix_active == 0
        && result_status->rust_upmix_process_calls == 0
        && std::isfinite(result_status->output_energy)
        && result_status->output_energy > 0.001f;
}

bool ProbeX3d(
    FeAudioPipelineStatus* left_status,
    FeAudioPipelineStatus* right_status
) {
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 2;
    config.mode = FE_AUDIO_MODE_X3D_SPEAKER;
    config.muted = 1;
    config.max_queued_buffers = 10;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return false;

    FeAudioPose left = Pose(-1.1f);
    if (FAILED(fe_audio_pipeline_set_pose(pipeline.handle, &left))) return false;
    if (!SubmitBlocks(pipeline.handle, 10, left_status)) return false;

    FeAudioPose right = Pose(1.1f);
    if (FAILED(fe_audio_pipeline_set_pose(pipeline.handle, &right))) return false;
    if (!SubmitBlocks(pipeline.handle, 10, right_status)) return false;

    const bool finite_matrix = std::isfinite(left_status->x3d_matrix_left)
        && std::isfinite(left_status->x3d_matrix_right)
        && std::isfinite(right_status->x3d_matrix_left)
        && std::isfinite(right_status->x3d_matrix_right);
    const float matrix_delta =
        std::abs(left_status->x3d_matrix_left - right_status->x3d_matrix_left)
        + std::abs(left_status->x3d_matrix_right - right_status->x3d_matrix_right);
    return finite_matrix
        && matrix_delta > 0.02f
        && right_status->x3d_calculate_calls >= 2
        && right_status->x3d_calculate_calls <= 3
        && right_status->obr_process_calls == 0
        && right_status->buffers_consumed >= 20
        && right_status->buffer_pool_exhaustions == 0;
}

bool ProbeObr(uint32_t layout_channels, FeAudioPipelineStatus* result_status) {
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = layout_channels;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 16;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return false;
    FeAudioPose pose = Pose(0.45f);
    if (FAILED(fe_audio_pipeline_set_pose(pipeline.handle, &pose))) return false;
    if (!SubmitBlocks(pipeline.handle, 16, result_status)) return false;
    FeAudioMixerPipelineStatus mixer{};
    if (!ReadMixerStatus(pipeline.handle, &mixer)) return false;
    const bool rust_state_ok = layout_channels == 2
        ? result_status->rust_upmix_active == 0
            && result_status->rust_upmix_process_calls == 0
        : result_status->rust_upmix_active == 1
            && result_status->rust_upmix_process_calls >= 16
            && result_status->rust_upmix_fallback_blocks == 0
            && result_status->rust_upmix_last_result == FE_RUST_UPMIX_OK;
    const float expected_extent = layout_channels == 8
        ? 135.0f
        : (layout_channels == 6 ? 110.0f : 30.0f);
    const bool official_geometry =
        result_status->minimum_object_azimuth <= -expected_extent + 0.01f
        && result_status->maximum_object_azimuth >= expected_extent - 0.01f
        && result_status->maximum_object_target_error <= 0.01f
        && result_status->object_position_updates >= layout_channels;
    return result_status->renderer_ready == 1
        && result_status->renderer_input_channels == layout_channels
        && result_status->output_channels == 2
        && result_status->buffers_consumed >= 16
        && result_status->obr_process_calls >= 16
        && result_status->x3d_calculate_calls >= layout_channels
        && result_status->x3d_calculate_calls <= 2 * layout_channels
        && rust_state_ok
        && result_status->buffer_pool_exhaustions == 0
        && result_status->voice_started == 1
        && mixer.available == 1
        && mixer.enabled == 1
        && mixer.active == 1
        && mixer.mixer_process_calls >= 16
        && mixer.mixer_process_failures == 0
        && mixer.last_upmix_ordinal < mixer.last_mixer_ordinal
        && mixer.last_mixer_ordinal < mixer.last_obr_ordinal
        && official_geometry
        && std::isfinite(result_status->output_energy)
        && result_status->output_energy > 0.000001f;
}

bool ProbeMixerDirect(
    uint32_t input_channels,
    uint32_t layout_channels,
    FeAudioMixerPipelineStatus* mixer_status
) {
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = input_channels;
    config.virtual_layout_channels = layout_channels;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 4;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr || !CommitCleanMixer(pipeline.handle, 1)) return false;

    FeAudioPipelineStatus spatial{};
    const bool submitted = SubmitBlocksWithChannels(
        pipeline.handle,
        input_channels,
        4,
        &spatial
    );
    if (!ReadMixerStatus(pipeline.handle, mixer_status)) return false;
    return submitted
        && spatial.obr_process_calls >= 4
        && spatial.buffers_consumed >= 4
        && mixer_status->available == 1
        && mixer_status->enabled == 1
        && mixer_status->active == 1
        && mixer_status->mixer_process_calls == 4
        && mixer_status->mixer_bypassed_blocks == 0
        && mixer_status->active_revision == 1
        && mixer_status->staged_revision == 0
        && mixer_status->last_upmix_ordinal < mixer_status->last_mixer_ordinal
        && mixer_status->last_mixer_ordinal < mixer_status->last_obr_ordinal;
}

bool ProbeMixerTransportBatch(
    FeAudioPipelineStatus* spatial_status,
    FeAudioMixerPipelineStatus* mixer_status
) {
    constexpr uint32_t kTransportFrames = kFrames * 16;
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 6;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 16;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr || !CommitCleanMixer(pipeline.handle, 1)) return false;

    const std::vector<float> pcm = MakeToneFrames(2, kTransportFrames);
    if (FAILED(fe_audio_pipeline_submit(pipeline.handle, pcm.data(), kTransportFrames))) {
        return false;
    }
    if (!WaitForConsumed(pipeline.handle, 16, spatial_status)
        || !ReadMixerStatus(pipeline.handle, mixer_status)) {
        return false;
    }
    return spatial_status->rust_upmix_process_calls == 1
        && spatial_status->rust_upmix_fallback_blocks == 0
        && mixer_status->mixer_process_calls == 16
        && spatial_status->obr_process_calls == 16
        && mixer_status->mixer_bypassed_blocks == 0
        && mixer_status->last_upmix_ordinal < mixer_status->last_mixer_ordinal
        && mixer_status->last_mixer_ordinal < mixer_status->last_obr_ordinal;
}

bool ProbeTimelineReset(
    FeAudioPipelineStatus* reset_status,
    FeAudioPipelineStatus* resumed_status,
    FeAudioMixerPipelineStatus* resumed_mixer,
    uint64_t* reset_elapsed_ms
) {
    constexpr uint32_t kTransportFrames = kFrames * 16;
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 6;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 0;
    config.max_queued_buffers = 24;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr || !CommitCleanMixer(pipeline.handle, 1)) return false;

    // Arm an active, inaudible voice so ResetTimeline exercises its real
    // XAudio2 fade/flush path without emitting probe audio to the device.
    const std::vector<float> before_seek(
        static_cast<size_t>(kTransportFrames) * 2u,
        0.0f
    );
    if (FAILED(fe_audio_pipeline_submit(pipeline.handle, before_seek.data(), kTransportFrames))) {
        return false;
    }
    if (FAILED(fe_audio_pipeline_submit(pipeline.handle, before_seek.data(), kTransportFrames))) {
        return false;
    }
    FeAudioPipelineStatus armed_status{};
    if (!ReadStatus(pipeline.handle, &armed_status) || armed_status.voice_started != 1) {
        return false;
    }
    const ULONGLONG reset_started_at = GetTickCount64();
    if (FAILED(fe_audio_pipeline_reset_timeline(pipeline.handle))) return false;
    *reset_elapsed_ms = static_cast<uint64_t>(GetTickCount64() - reset_started_at);
    if (!ReadStatus(pipeline.handle, reset_status)) return false;
    if (
        reset_status->buffers_queued != 0
        || reset_status->voice_started != 0
        || reset_status->dropped_buffers != 0
        || reset_status->queue_underruns != 0
        || reset_status->buffer_pool_exhaustions != 0
        || reset_status->renderer_ready != 1
        || reset_status->last_hresult != S_OK
    ) {
        return false;
    }

    // A browser transport block contains sixteen 256-frame render quanta.
    // Submit the same shape here so the post-seek assertion exercises the
    // production preroll boundary instead of stalling below it with four
    // isolated quanta.
    const std::vector<float> after_seek = MakeToneFrames(2, kTransportFrames, 1.7f);
    if (FAILED(fe_audio_pipeline_submit(pipeline.handle, after_seek.data(), kTransportFrames))) {
        return false;
    }
    const std::vector<float> after_seek_followup = MakeToneFrames(2, kTransportFrames, 2.3f);
    if (FAILED(fe_audio_pipeline_submit(
        pipeline.handle,
        after_seek_followup.data(),
        kTransportFrames
    ))) {
        return false;
    }
    if (!WaitForConsumed(
        pipeline.handle,
        reset_status->buffers_consumed + 16,
        resumed_status
    )) {
        return false;
    }
    if (!ReadMixerStatus(pipeline.handle, resumed_mixer)) return false;
    return resumed_status->voice_started == 1
        && resumed_status->buffers_consumed >= reset_status->buffers_consumed + 16
        && resumed_status->buffers_queued > 0
        && resumed_status->dropped_buffers == 0
        && resumed_status->queue_underruns == 0
        && resumed_status->buffer_pool_exhaustions == 0
        && resumed_mixer->available == 1
        && resumed_mixer->enabled == 1
        && resumed_mixer->active == 1
        && resumed_mixer->active_revision == 1
        && *reset_elapsed_ms <= 100;
}

bool ProbeMixerCppFallback(FeAudioMixerPipelineStatus* mixer_status) {
    ScopedEnvironment force_fallback(
        L"FE_MONSTER_AUDIO_PROBE_FORCE_CPP_UPMIX",
        L"1"
    );
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 6;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 4;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr || !CommitCleanMixer(pipeline.handle, 1)) return false;

    FeAudioPipelineStatus spatial{};
    if (!SubmitBlocks(pipeline.handle, 4, &spatial)) return false;
    if (!ReadMixerStatus(pipeline.handle, mixer_status)) return false;
    return spatial.rust_upmix_active == 0
        && spatial.rust_upmix_process_calls == 0
        && spatial.rust_upmix_fallback_blocks >= 4
        && spatial.obr_process_calls >= 4
        && mixer_status->mixer_process_calls == 4
        && mixer_status->active == 1
        && mixer_status->last_upmix_ordinal < mixer_status->last_mixer_ordinal
        && mixer_status->last_mixer_ordinal < mixer_status->last_obr_ordinal;
}

bool ProbeMixerInitFailure(
    const wchar_t* failure,
    uint32_t expected_bypass_reason
) {
    ScopedEnvironment init_failure(
        L"FE_MONSTER_AUDIO_PROBE_MIXER_INIT_FAILURE",
        failure
    );
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 2;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 3;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return false;

    FeAudioPipelineStatus spatial{};
    FeAudioMixerPipelineStatus mixer{};
    if (!SubmitBlocks(pipeline.handle, 3, &spatial)) return false;
    if (!ReadMixerStatus(pipeline.handle, &mixer)) return false;
    return spatial.obr_process_calls >= 3
        && spatial.buffers_consumed >= 3
        && spatial.voice_started == 1
        && mixer.available == 0
        && mixer.active == 0
        && mixer.bypass_reason == expected_bypass_reason
        && mixer.mixer_process_calls == 0
        && mixer.mixer_bypassed_blocks == 3
        && mixer.last_mixer_ordinal < mixer.last_obr_ordinal;
}

bool ProbeMixerSingleBlockOutput(
    bool inject_partial_failure,
    float* output_energy,
    FeAudioMixerPipelineStatus* mixer_status
) {
    ScopedEnvironment process_failures(
        L"FE_MONSTER_AUDIO_PROBE_MIXER_PROCESS_FAILURES",
        inject_partial_failure ? L"1" : L"0"
    );
    ScopedEnvironment process_failure_skip(
        L"FE_MONSTER_AUDIO_PROBE_MIXER_PROCESS_FAILURE_SKIP",
        inject_partial_failure ? L"3" : L"0"
    );
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 2;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 3;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return false;
    FeRustMixerParams params = CleanMixerParams();
    params.enabled = inject_partial_failure ? 1u : 0u;
    if (fe_audio_pipeline_set_mixer_params(pipeline.handle, 1, &params, 0)
        != FE_RUST_MIXER_OK) {
        return false;
    }

    FeAudioPipelineStatus spatial{};
    if (!SubmitBlocks(pipeline.handle, 4, &spatial)) return false;
    if (!ReadMixerStatus(pipeline.handle, mixer_status)) return false;
    *output_energy = spatial.output_energy;
    if (!std::isfinite(*output_energy) || *output_energy <= 0.0f) return false;
    if (!inject_partial_failure) {
        return spatial.obr_process_calls == 4
            && mixer_status->mixer_process_calls == 0
            && mixer_status->mixer_process_failures == 0;
    }
    return spatial.obr_process_calls == 4
        && spatial.buffers_consumed == 4
        && mixer_status->mixer_process_calls == 4
        && mixer_status->mixer_process_failures == 1
        && mixer_status->mixer_partial_failure_bypasses == 1
        && mixer_status->mixer_consecutive_failures == 1
        && mixer_status->failure_disabled == 0
        && mixer_status->active == 0;
}

bool ProbeMixerPartialFailure(
    FeAudioMixerPipelineStatus* mixer_status,
    float* failure_energy,
    float* control_energy
) {
    FeAudioMixerPipelineStatus control{};
    if (!ProbeMixerSingleBlockOutput(true, failure_energy, mixer_status)
        || !ProbeMixerSingleBlockOutput(false, control_energy, &control)) {
        return false;
    }
    const float tolerance = std::max(0.0000001f, std::abs(*control_energy) * 0.0001f);
    const bool partial_failure_output_matches_control =
        std::abs(*failure_energy - *control_energy) <= tolerance;
    return partial_failure_output_matches_control;
}

bool ProbeMixerFailureDisableAndRetry(FeAudioMixerPipelineStatus* mixer_status) {
    ScopedEnvironment process_failures(
        L"FE_MONSTER_AUDIO_PROBE_MIXER_PROCESS_FAILURES",
        L"3"
    );
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 2;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 3;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr || !CommitCleanMixer(pipeline.handle, 1)) return false;

    FeAudioPipelineStatus spatial{};
    FeAudioMixerPipelineStatus disabled{};
    if (!SubmitBlocks(pipeline.handle, 3, &spatial)) return false;
    if (!ReadMixerStatus(pipeline.handle, &disabled)) return false;
    if (disabled.failure_disabled != 1
        || disabled.mixer_process_calls != 3
        || disabled.mixer_process_failures != 3
        || disabled.mixer_consecutive_failures != 3) {
        return false;
    }

    FeRustMixerParams retry = CleanMixerParams();
    if (fe_audio_pipeline_set_mixer_params(pipeline.handle, 1, &retry, 960)
        != FE_RUST_MIXER_OK) {
        return false;
    }
    FeAudioMixerPipelineStatus committed{};
    if (!ReadMixerStatus(pipeline.handle, &committed)
        || committed.failure_disabled != 0
        || committed.mixer_consecutive_failures != 0
        || committed.active_revision != 1) {
        return false;
    }

    if (!SubmitBlocks(pipeline.handle, 3, &spatial)) return false;
    if (!ReadMixerStatus(pipeline.handle, mixer_status)) return false;
    if (mixer_status->active != 1
        || mixer_status->mixer_process_calls != 6
        || mixer_status->mixer_process_failures != 3
        || mixer_status->mixer_consecutive_failures != 0) {
        return false;
    }

    retry.output_gain_db = 1.0f;
    if (fe_audio_pipeline_set_mixer_params(pipeline.handle, 2, &retry, 960)
        != FE_RUST_MIXER_OK) {
        return false;
    }
    if (!ReadMixerStatus(pipeline.handle, mixer_status)
        || mixer_status->active_revision != 2
        || mixer_status->failure_disabled != 0) {
        return false;
    }

    const uint64_t active_revision = mixer_status->active_revision;
    const uint64_t staged_revision = mixer_status->staged_revision;
    const uint64_t process_calls = mixer_status->mixer_process_calls;
    FeRustMixerParams invalid = retry;
    invalid.eq_db[0] = 12.01f;
    if (fe_audio_pipeline_set_mixer_params(pipeline.handle, 3, &invalid, 960)
        != FE_RUST_MIXER_INVALID_ARGUMENT) {
        return false;
    }
    FeAudioMixerPipelineStatus after_invalid{};
    if (!ReadMixerStatus(pipeline.handle, &after_invalid)) return false;
    return after_invalid.active_revision == active_revision
        && after_invalid.staged_revision == staged_revision
        && after_invalid.mixer_process_calls == process_calls
        && after_invalid.failure_disabled == 0;
}

bool ProbeMixerBusyRetry(FeAudioMixerPipelineStatus* mixer_status) {
    ScopedEnvironment commit_busy(
        L"FE_MONSTER_AUDIO_PROBE_MIXER_COMMIT_BUSY_ONCE",
        L"1"
    );
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 2;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 3;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return false;

    FeRustMixerParams params = CleanMixerParams();
    const int32_t busy = fe_audio_pipeline_set_mixer_params(
        pipeline.handle,
        1,
        &params,
        960
    );
    FeAudioMixerPipelineStatus staged{};
    if (busy != FE_RUST_MIXER_BUSY
        || !ReadMixerStatus(pipeline.handle, &staged)
        || staged.active_revision != 0
        || staged.staged_revision != 1) {
        return false;
    }
    const int32_t retried = fe_audio_pipeline_set_mixer_params(
        pipeline.handle,
        1,
        &params,
        960
    );
    if (retried != FE_RUST_MIXER_OK
        || !ReadMixerStatus(pipeline.handle, mixer_status)
        || mixer_status->active_revision != 1
        || mixer_status->staged_revision != 0) {
        return false;
    }
    FeAudioPipelineStatus spatial{};
    return SubmitBlocks(pipeline.handle, 3, &spatial)
        && ReadMixerStatus(pipeline.handle, mixer_status)
        && mixer_status->mixer_process_calls == 3
        && mixer_status->mixer_process_failures == 0
        && mixer_status->active == 1;
}

FeAudioSpatialControlParams SpatialParams(bool upmix_enabled, bool obr_enabled);

bool ProbeSpatialMixerAtomicBusy(
    FeAudioPipelineStatus* waiting_status,
    FeAudioPipelineStatus* committed_status
) {
    ScopedEnvironment commit_busy(
        L"FE_MONSTER_AUDIO_PROBE_MIXER_BOUNDARY_COMMIT_BUSY_ONCE",
        L"1"
    );
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 8;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 8;
    config.upmix_algorithm = 2;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return false;

    const FeAudioSpatialControlParams controls = SpatialParams(false, false);
    if (fe_audio_pipeline_set_spatial_controls(
            pipeline.handle,
            1,
            &controls,
            960
        ) != FE_RUST_MIXER_OK) {
        return false;
    }
    FeRustMixerParams params = CleanMixerParams();
    if (fe_audio_pipeline_set_mixer_params(
            pipeline.handle,
            1,
            &params,
            960
        ) != FE_RUST_MIXER_OK) {
        return false;
    }

    FeAudioMixerPipelineStatus staged{};
    if (!SubmitBlocks(pipeline.handle, 8, waiting_status)
        || !ReadMixerStatus(pipeline.handle, &staged)
        || waiting_status->spatial_active_revision != 0
        || waiting_status->spatial_route != FE_AUDIO_ROUTE_UPMIX_MIXER_X3D_OBR
        || waiting_status->transition_pending != 1
        || waiting_status->transition_reason
            != FE_AUDIO_SPATIAL_TRANSITION_WAITING_FOR_MIXER
        || staged.active_revision != 0
        || staged.staged_revision != 1) {
        return false;
    }

    if (fe_audio_pipeline_set_mixer_params(
            pipeline.handle,
            1,
            &params,
            960
        ) != FE_RUST_MIXER_OK) {
        return false;
    }
    // The matching Mixer snapshot must remain staged while the old spatial
    // route fades out.  Committing it in the control setter would render an
    // observable old-route/new-Mixer hybrid before the zero crossing.
    FeAudioMixerPipelineStatus before_zero{};
    FeAudioPipelineStatus first_fade_block{};
    if (!ReadMixerStatus(pipeline.handle, &before_zero)
        || before_zero.active_revision != 0
        || before_zero.staged_revision != 1
        || !SubmitBlocks(pipeline.handle, 1, &first_fade_block)
        || !ReadMixerStatus(pipeline.handle, &before_zero)
        || before_zero.active_revision != 0
        || before_zero.staged_revision != 1
        || first_fade_block.spatial_active_revision != 0
        || first_fade_block.transition_pending != 1) {
        return false;
    }
    FeAudioMixerPipelineStatus committed{};
    return SubmitBlocks(pipeline.handle, 7, committed_status)
        && ReadMixerStatus(pipeline.handle, &committed)
        && committed.active_revision == 1
        && committed.staged_revision == 0
        && committed_status->spatial_active_revision == 1
        && committed_status->spatial_route == FE_AUDIO_ROUTE_STEREO_MIXER_OUT
        && committed_status->transition_pending == 0;
}

bool ProbeSpatialMixerLatestWins(FeAudioPipelineStatus* committed_status) {
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 8;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 8;
    config.upmix_algorithm = 2;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return false;

    const FeAudioSpatialControlParams first = SpatialParams(false, true);
    const FeAudioSpatialControlParams latest = SpatialParams(true, false);
    FeRustMixerParams first_mixer = CleanMixerParams();
    FeRustMixerParams latest_mixer = CleanMixerParams();
    latest_mixer.output_gain_db = -1.0f;
    if (fe_audio_pipeline_set_spatial_controls(
            pipeline.handle, 1, &first, 960
        ) != FE_RUST_MIXER_OK
        || fe_audio_pipeline_set_mixer_params(
            pipeline.handle, 1, &first_mixer, 960
        ) != FE_RUST_MIXER_OK
        || fe_audio_pipeline_set_spatial_controls(
            pipeline.handle, 2, &latest, 960
        ) != FE_RUST_MIXER_OK
        || fe_audio_pipeline_set_mixer_params(
            pipeline.handle, 1, &first_mixer, 960
        ) != FE_RUST_MIXER_INVALID_REVISION
        || fe_audio_pipeline_set_mixer_params(
            pipeline.handle, 2, &latest_mixer, 960
        ) != FE_RUST_MIXER_OK) {
        return false;
    }

    FeAudioMixerPipelineStatus staged{};
    FeAudioMixerPipelineStatus committed{};
    return ReadMixerStatus(pipeline.handle, &staged)
        && staged.active_revision == 0
        && staged.staged_revision == 2
        && SubmitBlocks(pipeline.handle, 8, committed_status)
        && ReadMixerStatus(pipeline.handle, &committed)
        && committed.active_revision == 2
        && committed.staged_revision == 0
        && committed_status->spatial_active_revision == 2
        && committed_status->spatial_route
            == FE_AUDIO_ROUTE_UPMIX_MIXER_NON_OBR_OUT
        && committed_status->transition_pending == 0;
}

bool ProbeMixerConcurrentControlRender(FeAudioMixerPipelineStatus* mixer_status) {
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 2;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 8;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr || !CommitCleanMixer(pipeline.handle, 1)) return false;

    std::atomic<bool> control_ready{false};
    std::atomic<bool> render_started{false};
    std::atomic<bool> render_done{false};
    std::atomic<int> control_failures{0};
    std::atomic<int> commits_while_rendering{0};
    std::thread control([&]() {
        control_ready.store(true);
        while (!render_started.load()) std::this_thread::yield();
        for (uint64_t revision = 2; revision <= 65; ++revision) {
            FeRustMixerParams params = CleanMixerParams();
            params.output_gain_db = static_cast<float>(revision % 5) * 0.25f;
            int32_t result = FE_RUST_MIXER_BUSY;
            for (int attempt = 0; attempt < 10000 && result == FE_RUST_MIXER_BUSY; ++attempt) {
                result = fe_audio_pipeline_set_mixer_params(
                    pipeline.handle,
                    revision,
                    &params,
                    32
                );
                if (result == FE_RUST_MIXER_BUSY) std::this_thread::yield();
            }
            if (result != FE_RUST_MIXER_OK) {
                control_failures.fetch_add(1);
                return;
            }
            if (!render_done.load()) commits_while_rendering.fetch_add(1);
        }
    });

    while (!control_ready.load()) std::this_thread::yield();
    render_started.store(true);
    FeAudioPipelineStatus spatial{};
    const bool rendered = SubmitBlocks(pipeline.handle, 96, &spatial);
    render_done.store(true);
    control.join();
    if (!rendered || !ReadMixerStatus(pipeline.handle, mixer_status)) return false;
    return control_failures.load() == 0
        && commits_while_rendering.load() > 0
        && mixer_status->active_revision == 65
        && mixer_status->mixer_process_calls == 96
        && mixer_status->mixer_process_failures == 0
        && spatial.obr_process_calls == 96;
}

FeAudioSpatialControlParams SpatialParams(bool upmix_enabled, bool obr_enabled) {
    FeAudioSpatialControlParams params{};
    params.struct_size = sizeof(params);
    params.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    params.upmix_enabled = upmix_enabled ? 1u : 0u;
    params.upmix_algorithm = 1;  // MatrixDecode.
    params.upmix_output_channels = 8;
    params.upmix_center_width_hz = 300.0f;
    params.upmix_lfe_crossover_hz = 120.0f;
    params.upmix_center_gain = 0.707f;
    params.upmix_surround_gain = 0.5f;
    params.upmix_lfe_gain = 0.707f;
    params.upmix_decorrelation_amount = 0.7f;
    params.obr_enabled = obr_enabled ? 1u : 0u;
    params.obr_filter_profile = FE_AUDIO_OBR_FILTER_DIRECT;
    params.obr_wet = 1.0f;
    params.obr_dry = 0.0f;
    params.obr_output_gain_db = 0.0f;
    params.obr_spatial_width = 1.0f;
    return params;
}

bool ProbeTransportBoundarySpatialTransitions(FeAudioPipelineStatus* final_status) {
    constexpr uint32_t kTransportFrames = kFrames * 16;
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 8;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 16;
    config.upmix_algorithm = 2;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return false;

    const std::vector<float> pcm = MakeToneFrames(2, kTransportFrames);
    FeRustMixerParams mixer = CleanMixerParams();
    auto transition = [&](uint64_t revision, bool upmix, bool obr, uint32_t layout) {
        FeAudioSpatialControlParams controls = SpatialParams(upmix, obr);
        controls.upmix_output_channels = layout;
        if (fe_audio_pipeline_set_spatial_controls(
                pipeline.handle, revision, &controls, 960
            ) != FE_RUST_MIXER_OK
            || fe_audio_pipeline_set_mixer_params(
                pipeline.handle, revision, &mixer, 960
            ) != FE_RUST_MIXER_OK) {
            return false;
        }
        FeAudioPipelineStatus before{};
        if (!ReadStatus(pipeline.handle, &before)
            || FAILED(fe_audio_pipeline_submit(
                pipeline.handle, pcm.data(), kTransportFrames
            ))) {
            return false;
        }
        return WaitForConsumed(
            pipeline.handle,
            before.buffers_consumed + 16,
            final_status
        )
            && final_status->frames_processed >= before.frames_processed + kTransportFrames
            && final_status->transition_pending == 0
            && final_status->spatial_active_revision == revision
            && final_status->spatial_route == (obr
                ? (upmix
                    ? FE_AUDIO_ROUTE_UPMIX_MIXER_X3D_OBR
                    : FE_AUDIO_ROUTE_STEREO_MIXER_OBR)
                : (upmix
                    ? FE_AUDIO_ROUTE_UPMIX_MIXER_NON_OBR_OUT
                    : FE_AUDIO_ROUTE_STEREO_MIXER_OUT))
            && final_status->virtual_bed_channels == (upmix ? layout : 2u);
    };

    // Every transition commits inside one 4096-frame Submit. This exercises
    // scratch invalidation after ON->OFF, fallback until the next transport
    // after OFF->ON, and both layout resize directions.
    return transition(1, false, false, 8)
        && transition(2, true, true, 8)
        && transition(3, true, true, 6)
        && transition(4, true, true, 8);
}

bool SubmitContinuousTone(
    FeAudioPipelineHandle handle,
    float frequency_hz,
    int block_count,
    FeAudioPipelineStatus* status
) {
    FeAudioPipelineStatus before{};
    if (!ReadStatus(handle, &before)) return false;
    uint64_t absolute_frame = 0;
    for (int block = 0; block < block_count; ++block) {
        std::vector<float> pcm(static_cast<size_t>(kFrames) * 2u, 0.0f);
        for (uint32_t frame = 0; frame < kFrames; ++frame) {
            const float phase = 2.0f * kPi * frequency_hz
                * static_cast<float>(absolute_frame + frame)
                / static_cast<float>(kSampleRate);
            const float sample = std::sin(phase) * 0.08f;
            pcm[static_cast<size_t>(frame) * 2u] = sample;
            pcm[static_cast<size_t>(frame) * 2u + 1u] = sample;
        }
        if (FAILED(fe_audio_pipeline_submit(handle, pcm.data(), kFrames))) return false;
        absolute_frame += kFrames;
    }
    return WaitForConsumed(
        handle,
        before.buffers_consumed + static_cast<uint64_t>(block_count),
        status
    );
}

float MeasurePartialObrBlendEnergy(float frequency_hz, bool disable_alignment) {
    ScopedEnvironment dry_alignment(
        L"FE_MONSTER_AUDIO_PROBE_DISABLE_DRY_ALIGNMENT",
        disable_alignment ? L"1" : L"0"
    );
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 2;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 8;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr || !CommitCleanMixer(pipeline.handle, 1)) return 0.0f;

    FeAudioSpatialControlParams controls = SpatialParams(false, true);
    controls.obr_wet = 1.0f;
    controls.obr_dry = 1.0f;
    if (fe_audio_pipeline_set_spatial_controls(
            pipeline.handle,
            1,
            &controls,
            960
        ) != FE_RUST_MIXER_OK) {
        return 0.0f;
    }
    FeAudioPipelineStatus status{};
    return SubmitContinuousTone(pipeline.handle, frequency_hz, 20, &status)
        ? status.output_energy
        : 0.0f;
}

struct WetDryPhaseProbeResult {
    bool pass = false;
    float minimum_aligned_energy = 0.0f;
    float minimum_unaligned_energy = 0.0f;
    float worst_improvement_db = 0.0f;
};

WetDryPhaseProbeResult ProbeObrWetDryPhaseAlignment() {
    // Odd multiples of fs/(2*104) are the cancellation troughs produced by
    // mixing the pinned OBR filters with an undelayed dry copy.
    constexpr std::array<float, 7> frequencies = {
        230.76923f, 692.30769f, 1153.84615f, 1615.38462f,
        2076.92308f, 2538.46154f, 3000.0f
    };
    WetDryPhaseProbeResult result{};
    result.minimum_aligned_energy = 1.0f;
    result.minimum_unaligned_energy = 1.0f;
    float minimum_improvement_db = 100.0f;
    for (const float frequency : frequencies) {
        const float aligned = MeasurePartialObrBlendEnergy(frequency, false);
        const float unaligned = MeasurePartialObrBlendEnergy(frequency, true);
        if (!std::isfinite(aligned) || !std::isfinite(unaligned)
            || aligned <= 0.0f || unaligned <= 0.0f) {
            return result;
        }
        result.minimum_aligned_energy = std::min(result.minimum_aligned_energy, aligned);
        result.minimum_unaligned_energy = std::min(result.minimum_unaligned_energy, unaligned);
        minimum_improvement_db = std::min(
            minimum_improvement_db,
            20.0f * std::log10(aligned / unaligned)
        );
    }
    result.worst_improvement_db = minimum_improvement_db;
    result.pass = result.minimum_aligned_energy > result.minimum_unaligned_energy
        && result.worst_improvement_db > 0.0f;
    return result;
}

struct SpatialRouteProbeResult {
    bool pass = false;
    uint32_t failure_stage = 0;
    FeAudioPipelineStatus status{};
    FeAudioMixerPipelineStatus mixer{};
    uint64_t upmix_process_delta = 0;
    uint64_t mixer_process_delta = 0;
    uint64_t obr_process_delta = 0;
};

SpatialRouteProbeResult ProbeSpatialRouteState(
    bool upmix_enabled,
    bool obr_enabled,
    uint32_t expected_route
) {
    SpatialRouteProbeResult result{};
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 8;
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = 1;
    config.max_queued_buffers = 8;
    config.upmix_algorithm = 2;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr || !CommitCleanMixer(pipeline.handle, 1)) {
        result.failure_stage = 1;
        return result;
    }

    const FeAudioSpatialControlParams controls = SpatialParams(
        upmix_enabled,
        obr_enabled
    );
    if (fe_audio_pipeline_set_spatial_controls(
            pipeline.handle,
            1,
            &controls,
            960
        ) != FE_RUST_MIXER_OK) {
        result.failure_stage = 2;
        return result;
    }

    FeAudioPipelineStatus transitioned{};
    FeAudioMixerPipelineStatus before{};
    if (!SubmitBlocks(pipeline.handle, 8, &transitioned)) {
        (void)ReadStatus(pipeline.handle, &result.status);
        result.failure_stage = 3;
        return result;
    }
    result.status = transitioned;
    if (!ReadMixerStatus(pipeline.handle, &before)
        || transitioned.transition_pending != 0
        || transitioned.spatial_active_revision != 1) {
        result.mixer = before;
        result.failure_stage = 4;
        return result;
    }
    if (!SubmitBlocks(pipeline.handle, 8, &result.status)
        || !ReadMixerStatus(pipeline.handle, &result.mixer)) {
        result.failure_stage = 5;
        return result;
    }

    result.upmix_process_delta = result.status.rust_upmix_process_calls
        - transitioned.rust_upmix_process_calls;
    result.mixer_process_delta = result.mixer.mixer_process_calls
        - before.mixer_process_calls;
    result.obr_process_delta = result.status.obr_process_calls
        - transitioned.obr_process_calls;
    result.pass = result.mixer_process_delta == 8
        && result.mixer.active == 1
        && result.status.mixer_process_calls >= result.mixer.mixer_process_calls
        && result.status.output_channels == 2
        && result.status.physical_output_channels == 2
        && result.status.physical_multichannel == 0
        && result.status.virtual_bed_channels == (upmix_enabled ? 8u : 2u)
        && result.status.spatial_route == expected_route
        && result.upmix_process_delta == (upmix_enabled ? 8u : 0u)
        && result.obr_process_delta == (obr_enabled ? 8u : 0u)
        && result.status.obr_effective == (obr_enabled ? 1u : 0u)
        && result.status.upmix_effective == (upmix_enabled ? 1u : 0u)
        && std::isfinite(result.status.output_energy)
        && result.status.output_energy > 0.001f;
    return result;
}

bool ProbeSpatialControlFourStateMatrix(
    std::array<SpatialRouteProbeResult, 4>* states,
    float* spatial_toggle_gain_jump_db
) {
    auto& off_off = (*states)[0];
    auto& on_off = (*states)[1];
    auto& off_on = (*states)[2];
    auto& on_on = (*states)[3];
    off_off = ProbeSpatialRouteState(false, false, FE_AUDIO_ROUTE_STEREO_MIXER_OUT);
    on_off = ProbeSpatialRouteState(true, false, FE_AUDIO_ROUTE_UPMIX_MIXER_NON_OBR_OUT);
    off_on = ProbeSpatialRouteState(false, true, FE_AUDIO_ROUTE_STEREO_MIXER_OBR);
    on_on = ProbeSpatialRouteState(true, true, FE_AUDIO_ROUTE_UPMIX_MIXER_X3D_OBR);

    // Explicit names are part of the diagnostics contract exposed to Java.
    const bool stereo_mixer_out = off_off.pass && off_off.mixer.mixer_process_calls > 0;
    const bool upmix_mixer_non_obr_out = on_off.pass && on_off.mixer.mixer_process_calls > 0;
    const bool stereo_mixer_obr = off_on.pass && off_on.mixer.mixer_process_calls > 0;
    const bool upmix_mixer_x3d_obr = on_on.pass && on_on.mixer.mixer_process_calls > 0;
    const float minimum_energy = std::min({
        off_off.status.output_energy,
        on_off.status.output_energy,
        off_on.status.output_energy,
        on_on.status.output_energy
    });
    const float maximum_energy = std::max({
        off_off.status.output_energy,
        on_off.status.output_energy,
        off_on.status.output_energy,
        on_on.status.output_energy
    });
    *spatial_toggle_gain_jump_db = 20.0f * std::log10(
        std::max(1.0e-9f, maximum_energy)
            / std::max(1.0e-9f, minimum_energy)
    );
    return stereo_mixer_out
        && upmix_mixer_non_obr_out
        && stereo_mixer_obr
        && upmix_mixer_x3d_obr
        && *spatial_toggle_gain_jump_db <= 1.0f;
}

bool ProbeFiniteInputHeadroom(float* measured_energy) {
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 2;
    config.mode = FE_AUDIO_MODE_DRY;
    config.muted = 1;
    config.max_queued_buffers = 3;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return false;

    std::vector<float> pcm(static_cast<size_t>(kFrames) * 2u, 2.0f);
    // Non-finite input must still be sanitized without reducing neighboring
    // finite samples to the former +/-1.5 internal ceiling.
    pcm[0] = std::numeric_limits<float>::quiet_NaN();
    if (FAILED(fe_audio_pipeline_submit(pipeline.handle, pcm.data(), kFrames))) {
        return false;
    }
    FeAudioPipelineStatus status{};
    if (!ReadStatus(pipeline.handle, &status)) return false;
    *measured_energy = status.output_energy;
    return std::isfinite(*measured_energy)
        && *measured_energy > 1.95f
        && *measured_energy <= 2.0f;
}

}  // namespace

int main() {
    FeAudioPipelineStatus dry{};
    FeAudioPipelineStatus x3d_left{};
    FeAudioPipelineStatus x3d_right{};
    FeAudioPipelineStatus obr_stereo{};
    FeAudioPipelineStatus obr_5_1{};
    FeAudioPipelineStatus obr_7_1{};
    FeAudioMixerPipelineStatus direct_2{};
    FeAudioMixerPipelineStatus direct_6{};
    FeAudioMixerPipelineStatus direct_8{};
    FeAudioPipelineStatus transport_spatial{};
    FeAudioMixerPipelineStatus transport_mixer{};
    FeAudioMixerPipelineStatus cpp_fallback{};
    FeAudioMixerPipelineStatus partial_failure{};
    FeAudioMixerPipelineStatus failure_retry{};
    FeAudioMixerPipelineStatus busy_retry{};
    FeAudioPipelineStatus atomic_busy_waiting{};
    FeAudioPipelineStatus atomic_busy_committed{};
    FeAudioPipelineStatus atomic_latest_committed{};
    FeAudioPipelineStatus transport_transition_committed{};
    FeAudioPipelineStatus timeline_reset{};
    FeAudioPipelineStatus timeline_resumed{};
    FeAudioMixerPipelineStatus timeline_resumed_mixer{};
    uint64_t timeline_reset_elapsed_ms = 0;
    FeAudioMixerPipelineStatus concurrent_control_render{};
    float partial_failure_energy = 0.0f;
    float partial_control_energy = 0.0f;
    std::array<SpatialRouteProbeResult, 4> spatial_routes{};
    float spatial_toggle_gain_jump_db = 0.0f;
    float finite_input_headroom_energy = 0.0f;
    WetDryPhaseProbeResult wet_dry_phase{};

    const bool dry_ok = ProbeDry(&dry);
    const bool x3d_ok = ProbeX3d(&x3d_left, &x3d_right);
    const bool obr_stereo_ok = ProbeObr(2, &obr_stereo);
    const bool obr_5_1_ok = ProbeObr(6, &obr_5_1);
    const bool obr_7_1_ok = ProbeObr(8, &obr_7_1);
    const bool direct_2_ok = ProbeMixerDirect(2, 2, &direct_2);
    const bool direct_6_ok = ProbeMixerDirect(6, 6, &direct_6);
    const bool direct_8_ok = ProbeMixerDirect(8, 8, &direct_8);
    const bool transport_batch_ok = ProbeMixerTransportBatch(
        &transport_spatial,
        &transport_mixer
    );
    const bool cpp_fallback_ok = ProbeMixerCppFallback(&cpp_fallback);
    const bool missing_symbol_ok = ProbeMixerInitFailure(
        L"missing-symbol",
        FE_AUDIO_MIXER_BYPASS_SYMBOL_MISSING
    );
    const bool abi_failure_ok = ProbeMixerInitFailure(
        L"abi",
        FE_AUDIO_MIXER_BYPASS_ABI_MISMATCH
    );
    const bool create_failure_ok = ProbeMixerInitFailure(
        L"create",
        FE_AUDIO_MIXER_BYPASS_CREATE_FAILED
    );
    const bool partial_failure_ok = ProbeMixerPartialFailure(
        &partial_failure,
        &partial_failure_energy,
        &partial_control_energy
    );
    const bool failure_retry_ok = ProbeMixerFailureDisableAndRetry(&failure_retry);
    const bool busy_retry_ok = ProbeMixerBusyRetry(&busy_retry);
    const bool spatial_mixer_atomic_busy_ok = ProbeSpatialMixerAtomicBusy(
        &atomic_busy_waiting,
        &atomic_busy_committed
    );
    const bool spatial_mixer_latest_wins_ok = ProbeSpatialMixerLatestWins(
        &atomic_latest_committed
    );
    const bool transport_boundary_transition_ok =
        ProbeTransportBoundarySpatialTransitions(&transport_transition_committed);
    const bool timeline_reset_ok = ProbeTimelineReset(
        &timeline_reset,
        &timeline_resumed,
        &timeline_resumed_mixer,
        &timeline_reset_elapsed_ms
    );
    const bool concurrent_control_render_ok = ProbeMixerConcurrentControlRender(
        &concurrent_control_render
    );
    const bool four_state_matrix_ok = ProbeSpatialControlFourStateMatrix(
        &spatial_routes,
        &spatial_toggle_gain_jump_db
    );
    wet_dry_phase = ProbeObrWetDryPhaseAlignment();
    const bool spatial_toggle_gain_ok = spatial_toggle_gain_jump_db <= 1.0f;
    const bool finite_input_headroom_ok = ProbeFiniteInputHeadroom(
        &finite_input_headroom_energy
    );
    // Enabling the clean native spatial chain must not make ordinary music
    // audibly collapse in level compared with the bit-identical dry path.
    // A -3 dB tolerance leaves room for binaural filtering without accepting
    // the previous ~-17 dB regression.
    const float minimum_spatial_energy = dry.output_energy * 0.70710678f;
    const float maximum_spatial_energy = dry.output_energy * 1.41421356f;
    const bool spatial_loudness_parity_ok =
        obr_stereo.output_energy >= minimum_spatial_energy
        && obr_5_1.output_energy >= minimum_spatial_energy
        && obr_7_1.output_energy >= minimum_spatial_energy
        && obr_stereo.output_energy <= maximum_spatial_energy
        && obr_5_1.output_energy <= maximum_spatial_energy
        && obr_7_1.output_energy <= maximum_spatial_energy;
    const bool pass = dry_ok
        && x3d_ok
        && obr_stereo_ok
        && obr_5_1_ok
        && obr_7_1_ok
        && spatial_loudness_parity_ok
        && direct_2_ok
        && direct_6_ok
        && direct_8_ok
        && transport_batch_ok
        && cpp_fallback_ok
        && missing_symbol_ok
        && abi_failure_ok
        && create_failure_ok
        && partial_failure_ok
        && failure_retry_ok
        && busy_retry_ok
        && spatial_mixer_atomic_busy_ok
        && spatial_mixer_latest_wins_ok
        && transport_boundary_transition_ok
        && timeline_reset_ok
        && concurrent_control_render_ok
        && four_state_matrix_ok
        && wet_dry_phase.pass
        && finite_input_headroom_ok
        && spatial_toggle_gain_ok;

    std::cout
        << "{\n"
        << "  \"pass\": " << (pass ? "true" : "false") << ",\n"
        << "  \"component_pass\": {\"dry\":" << (dry_ok ? "true" : "false")
        << ",\"x3d\":" << (x3d_ok ? "true" : "false")
        << ",\"obr2\":" << (obr_stereo_ok ? "true" : "false")
        << ",\"obr6\":" << (obr_5_1_ok ? "true" : "false")
        << ",\"obr8\":" << (obr_7_1_ok ? "true" : "false")
        << ",\"transport\":" << (transport_batch_ok ? "true" : "false")
        << ",\"cppFallback\":" << (cpp_fallback_ok ? "true" : "false")
        << ",\"partial\":" << (partial_failure_ok ? "true" : "false")
        << ",\"failureRetry\":" << (failure_retry_ok ? "true" : "false")
        << ",\"busyRetry\":" << (busy_retry_ok ? "true" : "false")
        << ",\"atomicBusy\":" << (spatial_mixer_atomic_busy_ok ? "true" : "false")
        << ",\"atomicLatestWins\":"
        << (spatial_mixer_latest_wins_ok ? "true" : "false")
        << ",\"transportBoundaryTransition\":"
        << (transport_boundary_transition_ok ? "true" : "false")
        << ",\"timelineReset\":" << (timeline_reset_ok ? "true" : "false")
        << ",\"concurrent\":" << (concurrent_control_render_ok ? "true" : "false")
        << ",\"fourState\":" << (four_state_matrix_ok ? "true" : "false")
        << ",\"wetDryPhase\":" << (wet_dry_phase.pass ? "true" : "false")
        << ",\"finiteInputHeadroom\":"
        << (finite_input_headroom_ok ? "true" : "false")
        << "},\n"
        << "  \"finite_input_headroom_energy\": "
        << finite_input_headroom_energy << ",\n"
        << "  \"timeline_reset\": {\"elapsedMs\":" << timeline_reset_elapsed_ms
        << ",\"maximumMs\":100,\"reset\":{\"queued\":"
        << timeline_reset.buffers_queued << ",\"voice\":" << timeline_reset.voice_started
        << ",\"consumed\":" << timeline_reset.buffers_consumed
        << ",\"dropped\":" << timeline_reset.dropped_buffers
        << ",\"underruns\":" << timeline_reset.queue_underruns
        << ",\"poolExhaustions\":" << timeline_reset.buffer_pool_exhaustions
        << ",\"rendererReady\":" << timeline_reset.renderer_ready
        << ",\"lastResult\":" << timeline_reset.last_hresult
        << "},\"resumed\":{\"queued\":" << timeline_resumed.buffers_queued
        << ",\"voice\":" << timeline_resumed.voice_started
        << ",\"consumed\":" << timeline_resumed.buffers_consumed
        << ",\"dropped\":" << timeline_resumed.dropped_buffers
        << ",\"underruns\":" << timeline_resumed.queue_underruns
        << ",\"poolExhaustions\":" << timeline_resumed.buffer_pool_exhaustions
        << ",\"lastResult\":" << timeline_resumed.last_hresult
        << "},\"mixer\":{\"available\":" << timeline_resumed_mixer.available
        << ",\"enabled\":" << timeline_resumed_mixer.enabled
        << ",\"active\":" << timeline_resumed_mixer.active
        << ",\"revision\":" << timeline_resumed_mixer.active_revision << "}},\n"
        << "  \"dry_bypasses_obr\": " << (dry.obr_process_calls == 0 ? "true" : "false") << ",\n"
        << "  \"dry_bypasses_rust_upmix\": "
        << (dry.rust_upmix_process_calls == 0 ? "true" : "false") << ",\n"
        << "  \"rust_upmix\": {\n"
        << "    \"obr_2_status\": {\"ready\":" << obr_stereo.renderer_ready
        << ",\"rendererInputs\":" << obr_stereo.renderer_input_channels
        << ",\"outputChannels\":" << obr_stereo.output_channels
        << ",\"consumed\":" << obr_stereo.buffers_consumed
        << ",\"obrCalls\":" << obr_stereo.obr_process_calls
        << ",\"x3dCalls\":" << obr_stereo.x3d_calculate_calls
        << ",\"upmixActive\":" << obr_stereo.rust_upmix_active
        << ",\"upmixCalls\":" << obr_stereo.rust_upmix_process_calls
        << ",\"fallback\":" << obr_stereo.rust_upmix_fallback_blocks
        << ",\"upmixResult\":" << obr_stereo.rust_upmix_last_result
        << ",\"voice\":" << obr_stereo.voice_started
        << ",\"energy\":" << obr_stereo.output_energy << "},\n"
        << "    \"obr_5_1_active\": " << obr_5_1.rust_upmix_active << ",\n"
        << "    \"obr_5_1_calls\": " << obr_5_1.rust_upmix_process_calls << ",\n"
        << "    \"obr_7_1_active\": " << obr_7_1.rust_upmix_active << ",\n"
        << "    \"obr_7_1_calls\": " << obr_7_1.rust_upmix_process_calls << "\n"
        << "  },\n"
        << "  \"mixer\": {\n"
        << "    \"direct_2\": " << (direct_2_ok ? "true" : "false") << ",\n"
        << "    \"direct_6\": " << (direct_6_ok ? "true" : "false") << ",\n"
        << "    \"direct_8\": " << (direct_8_ok ? "true" : "false") << ",\n"
        << "    \"transport_batch_counts\": {\"upmix\": "
        << transport_spatial.rust_upmix_process_calls << ", \"mixer\": "
        << transport_mixer.mixer_process_calls << ", \"obr\": "
        << transport_spatial.obr_process_calls << "},\n"
        << "    \"cpp_fallback\": " << (cpp_fallback_ok ? "true" : "false") << ",\n"
        << "    \"init_fail_open\": "
        << ((missing_symbol_ok && abi_failure_ok && create_failure_ok) ? "true" : "false")
        << ",\n"
        << "    \"partial_failure_original_bypass\": "
        << (partial_failure_ok ? "true" : "false") << ",\n"
        << "    \"partial_failure_output_matches_control\": "
        << (partial_failure_ok ? "true" : "false") << ",\n"
        << "    \"partial_failure_energy\": " << partial_failure_energy << ",\n"
        << "    \"partial_control_energy\": " << partial_control_energy << ",\n"
        << "    \"three_failures_disable_and_commit_retries\": "
        << (failure_retry_ok ? "true" : "false") << ",\n"
        << "    \"busy_preserves_staged_and_same_revision_retries\": "
        << (busy_retry_ok ? "true" : "false") << ",\n"
        << "    \"spatial_waits_for_same_revision_mixer\": "
        << (spatial_mixer_atomic_busy_ok ? "true" : "false") << ",\n"
        << "    \"latest_spatial_mixer_revision_wins\": "
        << (spatial_mixer_latest_wins_ok ? "true" : "false") << ",\n"
        << "    \"atomic_busy_waiting\": {\"active_revision\":"
        << atomic_busy_waiting.spatial_active_revision << ",\"route\":"
        << atomic_busy_waiting.spatial_route << ",\"pending\":"
        << atomic_busy_waiting.transition_pending << ",\"reason\":"
        << atomic_busy_waiting.transition_reason << "},\n"
        << "    \"atomic_busy_committed\": {\"active_revision\":"
        << atomic_busy_committed.spatial_active_revision << ",\"route\":"
        << atomic_busy_committed.spatial_route << ",\"pending\":"
        << atomic_busy_committed.transition_pending << "},\n"
        << "    \"atomic_latest_committed\": {\"active_revision\":"
        << atomic_latest_committed.spatial_active_revision << ",\"route\":"
        << atomic_latest_committed.spatial_route << ",\"pending\":"
        << atomic_latest_committed.transition_pending << "},\n"
        << "    \"transport_boundary_transition\": {\"active_revision\":"
        << transport_transition_committed.spatial_active_revision
        << ",\"route\":" << transport_transition_committed.spatial_route
        << ",\"pending\":" << transport_transition_committed.transition_pending
        << ",\"frames\":" << transport_transition_committed.frames_processed
        << "},\n"
        << "    \"concurrent_control_render_stress\": "
        << (concurrent_control_render_ok ? "true" : "false") << ",\n"
        << "    \"last_upmix_ordinal\": " << failure_retry.last_upmix_ordinal << ",\n"
        << "    \"last_mixer_ordinal\": " << failure_retry.last_mixer_ordinal << ",\n"
        << "    \"last_obr_ordinal\": " << failure_retry.last_obr_ordinal << "\n"
        << "  },\n"
        << "  \"spatial_four_state\": {\n"
        << "    \"pass\": " << (four_state_matrix_ok ? "true" : "false") << ",\n"
        << "    \"off_off\": {\"failure_stage\":" << spatial_routes[0].failure_stage
        << ",\"pending\":" << spatial_routes[0].status.transition_pending
        << ",\"active_revision\":" << spatial_routes[0].status.spatial_active_revision
        << ",\"last_hresult\":" << spatial_routes[0].status.last_hresult
        << ",\"submitted\":" << spatial_routes[0].status.buffers_submitted
        << ",\"consumed\":" << spatial_routes[0].status.buffers_consumed
        << ",\"mixer_process_calls\":"
        << spatial_routes[0].mixer_process_delta << ",\"upmix_process_calls\":"
        << spatial_routes[0].upmix_process_delta << ",\"obr_process_calls\":"
        << spatial_routes[0].obr_process_delta << ",\"energy\":"
        << spatial_routes[0].status.output_energy << "},\n"
        << "    \"on_off\": {\"failure_stage\":" << spatial_routes[1].failure_stage
        << ",\"pending\":" << spatial_routes[1].status.transition_pending
        << ",\"active_revision\":" << spatial_routes[1].status.spatial_active_revision
        << ",\"last_hresult\":" << spatial_routes[1].status.last_hresult
        << ",\"submitted\":" << spatial_routes[1].status.buffers_submitted
        << ",\"consumed\":" << spatial_routes[1].status.buffers_consumed
        << ",\"mixer_process_calls\":"
        << spatial_routes[1].mixer_process_delta << ",\"upmix_process_calls\":"
        << spatial_routes[1].upmix_process_delta << ",\"obr_process_calls\":"
        << spatial_routes[1].obr_process_delta << ",\"energy\":"
        << spatial_routes[1].status.output_energy << "},\n"
        << "    \"off_on\": {\"failure_stage\":" << spatial_routes[2].failure_stage
        << ",\"pending\":" << spatial_routes[2].status.transition_pending
        << ",\"active_revision\":" << spatial_routes[2].status.spatial_active_revision
        << ",\"last_hresult\":" << spatial_routes[2].status.last_hresult
        << ",\"submitted\":" << spatial_routes[2].status.buffers_submitted
        << ",\"consumed\":" << spatial_routes[2].status.buffers_consumed
        << ",\"mixer_process_calls\":"
        << spatial_routes[2].mixer_process_delta << ",\"upmix_process_calls\":"
        << spatial_routes[2].upmix_process_delta << ",\"obr_process_calls\":"
        << spatial_routes[2].obr_process_delta << ",\"energy\":"
        << spatial_routes[2].status.output_energy << "},\n"
        << "    \"on_on\": {\"failure_stage\":" << spatial_routes[3].failure_stage
        << ",\"pending\":" << spatial_routes[3].status.transition_pending
        << ",\"active_revision\":" << spatial_routes[3].status.spatial_active_revision
        << ",\"last_hresult\":" << spatial_routes[3].status.last_hresult
        << ",\"submitted\":" << spatial_routes[3].status.buffers_submitted
        << ",\"consumed\":" << spatial_routes[3].status.buffers_consumed
        << ",\"mixer_process_calls\":"
        << spatial_routes[3].mixer_process_delta << ",\"upmix_process_calls\":"
        << spatial_routes[3].upmix_process_delta << ",\"obr_process_calls\":"
        << spatial_routes[3].obr_process_delta << ",\"energy\":"
        << spatial_routes[3].status.output_energy << "},\n"
        << "    \"spatial_toggle_gain_jump_db\":" << spatial_toggle_gain_jump_db << "\n"
        << "  },\n"
        << "  \"obr_wet_dry_phase\": {\"pass\":"
        << (wet_dry_phase.pass ? "true" : "false")
        << ",\"minimumAlignedEnergy\":" << wet_dry_phase.minimum_aligned_energy
        << ",\"minimumUnalignedEnergy\":" << wet_dry_phase.minimum_unaligned_energy
        << ",\"worstImprovementDb\":" << wet_dry_phase.worst_improvement_db
        << "},\n"
        << "  \"left_matrix\": [" << x3d_left.x3d_matrix_left << ", "
        << x3d_left.x3d_matrix_right << "],\n"
        << "  \"right_matrix\": [" << x3d_right.x3d_matrix_left << ", "
        << x3d_right.x3d_matrix_right << "],\n"
        << "  \"output_energy\": {\n"
        << "    \"dry\": " << dry.output_energy << ",\n"
        << "    \"obr_stereo\": " << obr_stereo.output_energy << ",\n"
        << "    \"obr_5_1\": " << obr_5_1.output_energy << ",\n"
        << "    \"obr_7_1\": " << obr_7_1.output_energy << ",\n"
        << "    \"minimum_spatial\": " << minimum_spatial_energy << ",\n"
        << "    \"maximum_spatial\": " << maximum_spatial_energy << ",\n"
        << "    \"loudness_parity\": "
        << (spatial_loudness_parity_ok ? "true" : "false") << "\n"
        << "  },\n"
        << "  \"buffers_consumed\": {\n"
        << "    \"dry\": " << dry.buffers_consumed << ",\n"
        << "    \"x3d\": " << x3d_right.buffers_consumed << ",\n"
        << "    \"obr_7_1\": " << obr_7_1.buffers_consumed << "\n"
        << "  }\n"
        << "}\n";
    return pass ? 0 : 1;
}
