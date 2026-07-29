#pragma once

#include <stdint.h>

#define FE_AUDIO_PIPELINE_ABI_VERSION 3u

#if defined(_WIN32)
#define FE_AUDIO_PIPELINE_API __declspec(dllexport)
#else
#define FE_AUDIO_PIPELINE_API
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef enum FeAudioPipelineMode {
    FE_AUDIO_MODE_DRY = 0,
    FE_AUDIO_MODE_X3D_SPEAKER = 1,
    FE_AUDIO_MODE_OBR_BINAURAL = 2
} FeAudioPipelineMode;

typedef struct FeAudioPipelineConfig {
    uint32_t struct_size;
    uint32_t abi_version;
    uint32_t sample_rate;
    uint32_t input_channels;
    uint32_t virtual_layout_channels;
    uint32_t mode;
    uint32_t muted;
    uint32_t max_queued_buffers;
    // 0 = default (OxiMedia MatrixDecode), 1 = Passive,
    // 2 = MatrixDecode, 3 = AmbientExtract.
    uint32_t upmix_algorithm;
} FeAudioPipelineConfig;

typedef struct FeAudioPose {
    float emitter_x;
    float emitter_y;
    float emitter_z;
    float emitter_velocity_x;
    float emitter_velocity_y;
    float emitter_velocity_z;
    float listener_x;
    float listener_y;
    float listener_z;
    float listener_velocity_x;
    float listener_velocity_y;
    float listener_velocity_z;
    float listener_front_x;
    float listener_front_y;
    float listener_front_z;
    float listener_up_x;
    float listener_up_y;
    float listener_up_z;
} FeAudioPose;

typedef struct FeAudioPipelineStatus {
    uint32_t struct_size;
    uint32_t abi_version;
    uint32_t mode;
    uint32_t running;
    uint32_t renderer_ready;
    uint32_t sample_rate;
    uint32_t input_channels;
    uint32_t renderer_input_channels;
    uint32_t output_channels;
    uint32_t buffers_queued;
    uint64_t buffers_submitted;
    uint64_t buffers_consumed;
    uint64_t frames_processed;
    uint64_t dropped_buffers;
    uint64_t obr_process_calls;
    uint64_t x3d_calculate_calls;
    uint64_t rust_upmix_process_calls;
    uint64_t rust_upmix_fallback_blocks;
    uint32_t rust_upmix_active;
    int32_t rust_upmix_last_result;
    float output_energy;
    float x3d_matrix_left;
    float x3d_matrix_right;
    int32_t last_hresult;
    uint64_t queue_underruns;
    uint64_t buffer_pool_exhaustions;
    uint32_t voice_started;
    uint32_t preroll_target_buffers;
} FeAudioPipelineStatus;

typedef void* FeAudioPipelineHandle;

FE_AUDIO_PIPELINE_API FeAudioPipelineHandle fe_audio_pipeline_create(
    const FeAudioPipelineConfig* config
);

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_set_pose(
    FeAudioPipelineHandle handle,
    const FeAudioPose* pose
);

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_submit(
    FeAudioPipelineHandle handle,
    const float* interleaved_pcm,
    uint32_t frame_count
);

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_set_muted(
    FeAudioPipelineHandle handle,
    uint32_t muted
);

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_get_status(
    FeAudioPipelineHandle handle,
    FeAudioPipelineStatus* status
);

FE_AUDIO_PIPELINE_API void fe_audio_pipeline_destroy(
    FeAudioPipelineHandle handle
);

#ifdef __cplusplus
}
#endif
