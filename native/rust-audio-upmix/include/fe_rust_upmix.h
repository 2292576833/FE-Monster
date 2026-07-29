#pragma once

#include <stdint.h>

#define FE_RUST_UPMIX_ABI_VERSION 1u
#define FE_RUST_UPMIX_OK 0

#if defined(_WIN32)
#define FE_RUST_UPMIX_CALL __cdecl
#else
#define FE_RUST_UPMIX_CALL
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef struct FeRustUpmixConfig {
    uint32_t struct_size;
    uint32_t abi_version;
    uint32_t sample_rate;
    uint32_t output_channels;
    uint32_t algorithm;
    float center_width_hz;
    float lfe_crossover_hz;
    float lfe_gain;
    float center_gain;
    float surround_gain;
    float decorrelation_amount;
} FeRustUpmixConfig;

typedef uint32_t(FE_RUST_UPMIX_CALL* FeRustUpmixAbiVersionFn)(void);
typedef void*(FE_RUST_UPMIX_CALL* FeRustUpmixCreateFn)(const FeRustUpmixConfig* config);
typedef int32_t(FE_RUST_UPMIX_CALL* FeRustUpmixProcessFn)(
    void* handle,
    const float* interleaved_stereo,
    uint32_t frame_count,
    float* interleaved_output,
    uint32_t output_capacity_samples
);
typedef int32_t(FE_RUST_UPMIX_CALL* FeRustUpmixResetFn)(void* handle);
typedef void(FE_RUST_UPMIX_CALL* FeRustUpmixDestroyFn)(void* handle);

#ifdef __cplusplus
}
#endif
