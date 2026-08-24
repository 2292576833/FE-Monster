#pragma once

#include <stdint.h>

#include "../../rust-audio-upmix/include/fe_rust_mixer.h"
#include "../../rust-audio-upmix/include/fe_rust_channel_router.h"

#define FE_AUDIO_PIPELINE_ABI_VERSION 4u

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

typedef enum FeAudioObrFilterProfile {
    FE_AUDIO_OBR_FILTER_DIRECT = 0,
    FE_AUDIO_OBR_FILTER_AMBIENT = 1,
    FE_AUDIO_OBR_FILTER_REVERBERANT = 2
} FeAudioObrFilterProfile;

typedef enum FeAudioSpatialRoute {
    FE_AUDIO_ROUTE_STEREO_MIXER_OUT = 0,
    FE_AUDIO_ROUTE_UPMIX_MIXER_NON_OBR_OUT = 1,
    FE_AUDIO_ROUTE_STEREO_MIXER_OBR = 2,
    FE_AUDIO_ROUTE_UPMIX_MIXER_X3D_OBR = 3
} FeAudioSpatialRoute;

typedef enum FeAudioSpatialTransitionReason {
    FE_AUDIO_SPATIAL_TRANSITION_NONE = 0,
    FE_AUDIO_SPATIAL_TRANSITION_USER_CONTROL = 1,
    FE_AUDIO_SPATIAL_TRANSITION_REBUILD_FAILED = 2,
    FE_AUDIO_SPATIAL_TRANSITION_WAITING_FOR_MIXER = 3
} FeAudioSpatialTransitionReason;

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

/*
 * One revision-safe spatial control snapshot. Upmix and OBR are deliberately
 * independent; the Rust Mixer remains in the signal path for every state.
 * OBR wet/dry use constant-power normalization in the native renderer.
 */
typedef struct FeAudioSpatialControlParams {
    uint32_t struct_size;
    uint32_t abi_version;
    uint32_t upmix_enabled;
    /* Existing ABI: 0=Passive FFT, 1=MatrixDecode, 2=AmbientExtract. */
    uint32_t upmix_algorithm;
    uint32_t upmix_output_channels;
    float upmix_center_width_hz;
    float upmix_lfe_crossover_hz;
    float upmix_center_gain;
    float upmix_surround_gain;
    float upmix_lfe_gain;
    float upmix_decorrelation_amount;
    uint32_t obr_enabled;
    uint32_t obr_filter_profile;
    float obr_wet;
    float obr_dry;
    float obr_output_gain_db;
    float obr_spatial_width;
    uint32_t reserved[8];
} FeAudioSpatialControlParams;

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
    uint32_t upmix_enabled;
    uint32_t obr_enabled;
    uint32_t obr_filter_profile;
    uint32_t spatial_renderer_input_channels;
    uint64_t spatial_active_revision;
    uint32_t virtual_bed_channels;
    uint32_t physical_output_channels;
    uint32_t binaural_output;
    uint32_t physical_multichannel;
    uint32_t spatial_route;
    uint32_t transition_pending;
    uint32_t transition_reason;
    uint64_t spatial_pending_revision;
    uint64_t mixer_process_calls;
    uint32_t upmix_effective;
    uint32_t obr_effective;
    float minimum_object_azimuth;
    float maximum_object_azimuth;
    float maximum_object_target_error;
    uint64_t object_position_updates;
} FeAudioPipelineStatus;

typedef enum FeAudioMixerBypassReason {
    FE_AUDIO_MIXER_BYPASS_NONE = 0,
    FE_AUDIO_MIXER_BYPASS_DISABLED = 1,
    FE_AUDIO_MIXER_BYPASS_DLL_UNAVAILABLE = 2,
    FE_AUDIO_MIXER_BYPASS_ABI_MISMATCH = 3,
    FE_AUDIO_MIXER_BYPASS_SYMBOL_MISSING = 4,
    FE_AUDIO_MIXER_BYPASS_CREATE_FAILED = 5,
    FE_AUDIO_MIXER_BYPASS_SCRATCH_UNAVAILABLE = 6,
    FE_AUDIO_MIXER_BYPASS_PROCESS_FAILED = 7,
    FE_AUDIO_MIXER_BYPASS_FAILURE_DISABLED = 8
} FeAudioMixerBypassReason;

typedef struct FeAudioMixerPipelineStatus {
    uint32_t struct_size;
    uint32_t abi_version;
    uint32_t available;
    uint32_t enabled;
    uint32_t active;
    uint32_t failure_disabled;
    uint32_t bypass_reason;
    int32_t last_result;
    uint64_t mixer_process_calls;
    uint64_t mixer_bypassed_blocks;
    uint64_t mixer_process_failures;
    uint64_t mixer_consecutive_failures;
    uint64_t mixer_partial_failure_bypasses;
    uint64_t active_revision;
    uint64_t staged_revision;
    uint64_t rust_upmix_process_calls;
    uint64_t rust_upmix_fallback_blocks;
    uint64_t obr_process_calls;
    uint64_t last_upmix_ordinal;
    uint64_t last_mixer_ordinal;
    uint64_t last_obr_ordinal;
    uint32_t rust_upmix_active;
    int32_t rust_upmix_last_result;
    uint32_t renderer_ready;
    int32_t pipeline_last_result;
    uint32_t upmix_enabled;
    uint32_t obr_enabled;
    uint32_t obr_filter_profile;
    uint32_t spatial_renderer_input_channels;
    uint64_t spatial_active_revision;
    uint32_t virtual_bed_channels;
    uint32_t physical_output_channels;
    uint32_t binaural_output;
    uint32_t physical_multichannel;
    uint32_t spatial_route;
    uint32_t transition_pending;
    uint32_t transition_reason;
    uint64_t spatial_pending_revision;
    uint32_t upmix_effective;
    uint32_t obr_effective;
} FeAudioMixerPipelineStatus;

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

// Starts a new media timeline without rebuilding the Mixer/spatial graph.
// The current XAudio2 source queue is stopped and flushed, temporal DSP state
// is cleared, and the source voice is re-armed muted for a fresh preroll.
FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_reset_timeline(
    FeAudioPipelineHandle handle
);

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_get_status(
    FeAudioPipelineHandle handle,
    FeAudioPipelineStatus* status
);

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_set_mixer_params(
    FeAudioPipelineHandle handle,
    uint64_t revision,
    const FeRustMixerParams* params,
    uint32_t ramp_frames
);

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_get_mixer_status(
    FeAudioPipelineHandle handle,
    FeAudioMixerPipelineStatus* status
);

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_set_spatial_controls(
    FeAudioPipelineHandle handle,
    uint64_t revision,
    const FeAudioSpatialControlParams* params,
    uint32_t ramp_frames
);

/*
 * Additive channel-router seam. It does not resize or reinterpret the legacy
 * FeAudioPipelineStatus / FeAudioMixerPipelineStatus contracts. Controls are
 * prepared by Rust on the caller/control thread and become visible only at a
 * process block boundary.
 */
FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_set_channel_router_params(
    FeAudioPipelineHandle handle,
    uint64_t revision,
    const FeRustChannelRouterParams* params,
    uint32_t ramp_frames
);

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_process_channel_router(
    FeAudioPipelineHandle handle,
    const float* interleaved_stereo,
    uint32_t frame_count,
    float* interleaved_output,
    uint32_t output_capacity_samples
);

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_get_channel_router_status(
    FeAudioPipelineHandle handle,
    FeRustChannelRouterStatus* status
);

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_generate_channel_test_signal(
    FeAudioPipelineHandle handle,
    const FeRustTestSignalConfig* config,
    FeRustTestSignalState* state,
    uint32_t frame_count,
    float* interleaved_output,
    uint32_t output_capacity_samples
);

/*
 * Generates a bounded one-hot virtual-bed signal and queues it through the
 * same Mixer -> optional OBR -> XAudio2 route as program audio. This is a
 * control-thread diagnostic operation; it never runs from the render callback.
 */
FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_queue_channel_test_signal(
    FeAudioPipelineHandle handle,
    const FeRustTestSignalConfig* config,
    uint32_t frame_count
);

FE_AUDIO_PIPELINE_API void fe_audio_pipeline_destroy(
    FeAudioPipelineHandle handle
);

#ifdef __cplusplus
}
#endif
