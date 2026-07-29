#include "fe_audio_pipeline.h"
#include "../../rust-audio-upmix/include/fe_rust_upmix.h"

#include <windows.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <iostream>
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

bool ProbeDry(FeAudioPipelineStatus* result_status) {
    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = kSampleRate;
    config.input_channels = 2;
    config.virtual_layout_channels = 2;
    config.mode = FE_AUDIO_MODE_DRY;
    config.muted = 1;
    config.max_queued_buffers = 10;
    PipelineGuard pipeline{fe_audio_pipeline_create(&config)};
    if (pipeline.handle == nullptr) return false;
    if (!SubmitBlocks(pipeline.handle, 10, result_status)) return false;
    return result_status->renderer_ready == 1
        && result_status->buffers_consumed >= 10
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
    const bool rust_state_ok = layout_channels == 2
        ? result_status->rust_upmix_active == 0
            && result_status->rust_upmix_process_calls == 0
        : result_status->rust_upmix_active == 1
            && result_status->rust_upmix_process_calls >= 16
            && result_status->rust_upmix_fallback_blocks == 0
            && result_status->rust_upmix_last_result == FE_RUST_UPMIX_OK;
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
        && std::isfinite(result_status->output_energy)
        && result_status->output_energy > 0.000001f;
}

}  // namespace

int main() {
    FeAudioPipelineStatus dry{};
    FeAudioPipelineStatus x3d_left{};
    FeAudioPipelineStatus x3d_right{};
    FeAudioPipelineStatus obr_stereo{};
    FeAudioPipelineStatus obr_5_1{};
    FeAudioPipelineStatus obr_7_1{};

    const bool dry_ok = ProbeDry(&dry);
    const bool x3d_ok = ProbeX3d(&x3d_left, &x3d_right);
    const bool obr_stereo_ok = ProbeObr(2, &obr_stereo);
    const bool obr_5_1_ok = ProbeObr(6, &obr_5_1);
    const bool obr_7_1_ok = ProbeObr(8, &obr_7_1);
    const bool pass = dry_ok && x3d_ok && obr_stereo_ok && obr_5_1_ok && obr_7_1_ok;

    std::cout
        << "{\n"
        << "  \"pass\": " << (pass ? "true" : "false") << ",\n"
        << "  \"dry_bypasses_obr\": " << (dry.obr_process_calls == 0 ? "true" : "false") << ",\n"
        << "  \"dry_bypasses_rust_upmix\": "
        << (dry.rust_upmix_process_calls == 0 ? "true" : "false") << ",\n"
        << "  \"rust_upmix\": {\n"
        << "    \"obr_5_1_active\": " << obr_5_1.rust_upmix_active << ",\n"
        << "    \"obr_5_1_calls\": " << obr_5_1.rust_upmix_process_calls << ",\n"
        << "    \"obr_7_1_active\": " << obr_7_1.rust_upmix_active << ",\n"
        << "    \"obr_7_1_calls\": " << obr_7_1.rust_upmix_process_calls << "\n"
        << "  },\n"
        << "  \"left_matrix\": [" << x3d_left.x3d_matrix_left << ", "
        << x3d_left.x3d_matrix_right << "],\n"
        << "  \"right_matrix\": [" << x3d_right.x3d_matrix_left << ", "
        << x3d_right.x3d_matrix_right << "],\n"
        << "  \"output_energy\": {\n"
        << "    \"dry\": " << dry.output_energy << ",\n"
        << "    \"obr_stereo\": " << obr_stereo.output_energy << ",\n"
        << "    \"obr_5_1\": " << obr_5_1.output_energy << ",\n"
        << "    \"obr_7_1\": " << obr_7_1.output_energy << "\n"
        << "  },\n"
        << "  \"buffers_consumed\": {\n"
        << "    \"dry\": " << dry.buffers_consumed << ",\n"
        << "    \"x3d\": " << x3d_right.buffers_consumed << ",\n"
        << "    \"obr_7_1\": " << obr_7_1.buffers_consumed << "\n"
        << "  }\n"
        << "}\n";
    return pass ? 0 : 1;
}
