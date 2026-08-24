#pragma once

#include <stdint.h>

#define FE_RUST_CHANNEL_ROUTER_ABI_VERSION 1u
#define FE_RUST_CHANNEL_ROUTER_MAX_CHANNELS 8u
#define FE_RUST_CHANNEL_ROUTER_MATRIX_COEFFICIENTS 16u

#define FE_RUST_CHANNEL_ROUTER_OK 0
#define FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT -1
#define FE_RUST_CHANNEL_ROUTER_INVALID_REVISION -2
#define FE_RUST_CHANNEL_ROUTER_UNSUPPORTED -3
#define FE_RUST_CHANNEL_ROUTER_PANIC -4
#define FE_RUST_CHANNEL_ROUTER_BUSY -5

#define FE_RUST_UPMIX_FRONT_ONLY 0u
#define FE_RUST_UPMIX_MATRIX_DECODE 1u
#define FE_RUST_UPMIX_AMBIENT_EXTRACT 2u
#define FE_RUST_UPMIX_CUSTOM_MATRIX 3u
#define FE_RUST_UPMIX_DOLBY_PRO_LOGIC_II 100u
#define FE_RUST_UPMIX_DOLBY_PRO_LOGIC_IIX 101u
#define FE_RUST_UPMIX_DTS_NEURAL_X 200u

#define FE_RUST_ALGORITHM_UNAVAILABLE 0u
#define FE_RUST_ALGORITHM_AVAILABLE 1u
#define FE_RUST_ALGORITHM_LICENSE_REQUIRED 2u

#define FE_RUST_TEST_SIGNAL_TONE 0u
#define FE_RUST_TEST_SIGNAL_IMPULSE 1u

#if defined(_WIN32)
#define FE_RUST_CHANNEL_ROUTER_CALL __cdecl
#else
#define FE_RUST_CHANNEL_ROUTER_CALL
#endif

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Canonical interleaved sample order:
 * 5.1 = FL, FR, FC, LFE, SL, SR
 * 7.1 = FL, FR, FC, LFE, BL, BR, SL, SR
 * Source: FFmpeg channel layouts and the OBS surround guide.
 */
typedef struct FeRustChannelRouterConfig {
    uint32_t struct_size;
    uint32_t abi_version;
    uint32_t sample_rate;
    uint32_t max_frames_per_call;
    uint32_t output_channels;
    float max_delay_ms;
    uint32_t reserved[4];
} FeRustChannelRouterConfig;

typedef struct FeRustChannelRouterParams {
    uint32_t struct_size;
    uint32_t abi_version;
    uint32_t output_channels;
    uint32_t algorithm;
    float lfe_crossover_hz;
    float channel_gain_db[FE_RUST_CHANNEL_ROUTER_MAX_CHANNELS];
    float channel_delay_ms[FE_RUST_CHANNEL_ROUTER_MAX_CHANNELS];
    float channel_azimuth_deg[FE_RUST_CHANNEL_ROUTER_MAX_CHANNELS];
    /* Row-major [output channel][stereo input L/R]. */
    float custom_matrix[FE_RUST_CHANNEL_ROUTER_MATRIX_COEFFICIENTS];
    uint32_t reserved[8];
} FeRustChannelRouterParams;

typedef struct FeRustChannelRouterStatus {
    uint32_t struct_size;
    uint32_t abi_version;
    uint32_t available;
    uint32_t active;
    uint32_t actual;
    uint32_t output_channels;
    uint32_t algorithm;
    int32_t last_result;
    uint64_t active_revision;
    uint64_t staged_revision;
    uint64_t process_calls;
    float channel_peak[FE_RUST_CHANNEL_ROUTER_MAX_CHANNELS];
    float channel_rms[FE_RUST_CHANNEL_ROUTER_MAX_CHANNELS];
    float channel_azimuth_deg[FE_RUST_CHANNEL_ROUTER_MAX_CHANNELS];
    uint32_t reserved[8];
} FeRustChannelRouterStatus;

typedef struct FeRustTestSignalConfig {
    uint32_t struct_size;
    uint32_t abi_version;
    uint32_t sample_rate;
    uint32_t output_channels;
    uint32_t channel_index;
    uint32_t kind;
    float frequency_hz;
    float gain_db;
    uint32_t reserved[4];
} FeRustTestSignalConfig;

typedef struct FeRustTestSignalState {
    float phase;
    uint32_t impulse_emitted;
    uint32_t reserved[6];
} FeRustTestSignalState;

typedef uint32_t(FE_RUST_CHANNEL_ROUTER_CALL* FeRustChannelRouterAbiVersionFn)(void);
typedef uint32_t(FE_RUST_CHANNEL_ROUTER_CALL* FeRustChannelRouterAlgorithmAvailabilityFn)(
    uint32_t algorithm
);
typedef void*(FE_RUST_CHANNEL_ROUTER_CALL* FeRustChannelRouterCreateFn)(
    const FeRustChannelRouterConfig* config
);
typedef int32_t(FE_RUST_CHANNEL_ROUTER_CALL* FeRustChannelRouterStageFn)(
    void* handle,
    uint64_t revision,
    const FeRustChannelRouterParams* params
);
typedef int32_t(FE_RUST_CHANNEL_ROUTER_CALL* FeRustChannelRouterCommitFn)(
    void* handle,
    uint64_t revision,
    uint32_t ramp_frames
);
typedef int32_t(FE_RUST_CHANNEL_ROUTER_CALL* FeRustChannelRouterProcessFn)(
    void* handle,
    const float* interleaved_stereo,
    uint32_t frame_count,
    float* interleaved_output,
    uint32_t output_capacity_samples
);
typedef int32_t(FE_RUST_CHANNEL_ROUTER_CALL* FeRustChannelRouterGetStatusFn)(
    void* handle,
    FeRustChannelRouterStatus* status
);
typedef int32_t(FE_RUST_CHANNEL_ROUTER_CALL* FeRustChannelRouterResetFn)(void* handle);
typedef void(FE_RUST_CHANNEL_ROUTER_CALL* FeRustChannelRouterDestroyFn)(void* handle);
typedef int32_t(FE_RUST_CHANNEL_ROUTER_CALL* FeRustGenerateTestSignalFn)(
    const FeRustTestSignalConfig* config,
    FeRustTestSignalState* state,
    uint32_t frame_count,
    float* interleaved_output,
    uint32_t output_capacity_samples
);

uint32_t FE_RUST_CHANNEL_ROUTER_CALL fe_rust_channel_router_abi_version(void);
uint32_t FE_RUST_CHANNEL_ROUTER_CALL fe_rust_channel_router_algorithm_availability(
    uint32_t algorithm
);
void* FE_RUST_CHANNEL_ROUTER_CALL fe_rust_channel_router_create(
    const FeRustChannelRouterConfig* config
);
int32_t FE_RUST_CHANNEL_ROUTER_CALL fe_rust_channel_router_stage(
    void* handle,
    uint64_t revision,
    const FeRustChannelRouterParams* params
);
int32_t FE_RUST_CHANNEL_ROUTER_CALL fe_rust_channel_router_commit(
    void* handle,
    uint64_t revision,
    uint32_t ramp_frames
);
int32_t FE_RUST_CHANNEL_ROUTER_CALL fe_rust_channel_router_process(
    void* handle,
    const float* interleaved_stereo,
    uint32_t frame_count,
    float* interleaved_output,
    uint32_t output_capacity_samples
);
int32_t FE_RUST_CHANNEL_ROUTER_CALL fe_rust_channel_router_get_status(
    void* handle,
    FeRustChannelRouterStatus* status
);
int32_t FE_RUST_CHANNEL_ROUTER_CALL fe_rust_channel_router_reset(void* handle);
void FE_RUST_CHANNEL_ROUTER_CALL fe_rust_channel_router_destroy(void* handle);
int32_t FE_RUST_CHANNEL_ROUTER_CALL fe_rust_channel_router_generate_test_signal(
    const FeRustTestSignalConfig* config,
    FeRustTestSignalState* state,
    uint32_t frame_count,
    float* interleaved_output,
    uint32_t output_capacity_samples
);

#ifdef __cplusplus
}
#endif
