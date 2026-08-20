#pragma once

#include <stdint.h>

#define FE_RUST_MIXER_ABI_VERSION 1u
#define FE_RUST_MIXER_EQ_BANDS 10u
#define FE_RUST_MIXER_OK 0
#define FE_RUST_MIXER_INVALID_ARGUMENT (-1)
#define FE_RUST_MIXER_INVALID_REVISION (-2)
#define FE_RUST_MIXER_UNSUPPORTED (-3)
#define FE_RUST_MIXER_PANIC (-4)
#define FE_RUST_MIXER_BUSY (-5)

#if defined(_WIN32)
#define FE_RUST_MIXER_CALL __cdecl
#else
#define FE_RUST_MIXER_CALL
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef enum FeRustMixerPresetId {
    FE_RUST_MIXER_PRESET_CLEAN = 0,
    FE_RUST_MIXER_PRESET_BATHROOM = 1,
    FE_RUST_MIXER_PRESET_HALL = 2,
    FE_RUST_MIXER_PRESET_SURROUND_3D = 3,
    FE_RUST_MIXER_PRESET_CINEMA = 4,
    FE_RUST_MIXER_PRESET_VOCAL_CLEAR = 5,
    FE_RUST_MIXER_PRESET_BASS_BOOST = 6,
    FE_RUST_MIXER_PRESET_NIGHT = 7
} FeRustMixerPresetId;

typedef struct FeRustMixerConfig {
    uint32_t struct_size;
    uint32_t abi_version;
    uint32_t sample_rate;
    uint32_t max_frames_per_call;
    uint32_t reserved[4];
} FeRustMixerConfig;

/*
 * Ranges: gains -24..24 dB; balance -1..1; EQ -12..12 dB;
 * width 0..2; channel gains 0..2; compressor threshold -60..0 dB,
 * ratio 1..20, attack .1..200 ms, release 10..2000 ms, knee 0..24 dB,
 * makeup 0..24 dB; limiter ceiling -12..0 dB and release 10..1000 ms;
 * reverb room/damping/wet/dry 0..1, decay 50..5000 ms, pre-delay 0..200 ms.
 */
typedef struct FeRustMixerParams {
    uint32_t struct_size;
    uint32_t abi_version;
    uint32_t enabled;
    uint32_t compressor_enabled;
    uint32_t limiter_enabled;
    uint32_t reverb_enabled;
    float input_gain_db;
    float output_gain_db;
    float balance;
    float eq_db[FE_RUST_MIXER_EQ_BANDS];
    float stereo_width;
    float center_gain;
    float surround_gain;
    float lfe_gain;
    float compressor_threshold_db;
    float compressor_ratio;
    float compressor_attack_ms;
    float compressor_release_ms;
    float compressor_knee_db;
    float compressor_makeup_db;
    float limiter_ceiling_db;
    float limiter_release_ms;
    float reverb_room_size;
    float reverb_decay_ms;
    float reverb_damping;
    float reverb_pre_delay_ms;
    float reverb_wet;
    float reverb_dry;
    uint32_t reserved[8];
} FeRustMixerParams;

typedef struct FeRustMixerStatus {
    uint32_t struct_size;
    uint32_t abi_version;
    uint64_t active_revision;
    uint64_t staged_revision;
    uint64_t process_failures;
    uint32_t enabled;
    uint32_t reserved[7];
} FeRustMixerStatus;

/*
 * Threading contract: stage/commit/get_status may run concurrently with one
 * serialized audio owner calling process. reset must be serialized with
 * process. destroy requires all other calls to have stopped. Control calls
 * publish prepared immutable snapshots through per-slot CAS ownership;
 * process never locks, waits, allocates, accesses files, or logs. A transient
 * FE_RUST_MIXER_BUSY commit leaves staged and active state unchanged and may be
 * retried with the same revision.
 */

typedef uint32_t(FE_RUST_MIXER_CALL* FeRustMixerAbiVersionFn)(void);
typedef void*(FE_RUST_MIXER_CALL* FeRustMixerCreateFn)(const FeRustMixerConfig* config);
typedef int32_t(FE_RUST_MIXER_CALL* FeRustMixerStageParamsFn)(
    void* handle, uint64_t revision, const FeRustMixerParams* params);
typedef int32_t(FE_RUST_MIXER_CALL* FeRustMixerCommitFn)(
    void* handle, uint64_t revision, uint32_t ramp_frames);
typedef int32_t(FE_RUST_MIXER_CALL* FeRustMixerProcessFn)(
    void* handle, float* interleaved_pcm, uint32_t frame_count, uint32_t channels);
typedef int32_t(FE_RUST_MIXER_CALL* FeRustMixerGetStatusFn)(
    const void* handle, FeRustMixerStatus* status);
typedef int32_t(FE_RUST_MIXER_CALL* FeRustMixerResetFn)(void* handle);
typedef void(FE_RUST_MIXER_CALL* FeRustMixerDestroyFn)(void* handle);

uint32_t FE_RUST_MIXER_CALL fe_rust_mixer_abi_version(void);
void* FE_RUST_MIXER_CALL fe_rust_mixer_create(const FeRustMixerConfig* config);
int32_t FE_RUST_MIXER_CALL fe_rust_mixer_stage_params(
    void* handle, uint64_t revision, const FeRustMixerParams* params);
int32_t FE_RUST_MIXER_CALL fe_rust_mixer_commit(
    void* handle, uint64_t revision, uint32_t ramp_frames);
int32_t FE_RUST_MIXER_CALL fe_rust_mixer_process(
    void* handle, float* interleaved_pcm, uint32_t frame_count, uint32_t channels);
int32_t FE_RUST_MIXER_CALL fe_rust_mixer_get_status(
    const void* handle, FeRustMixerStatus* status);
int32_t FE_RUST_MIXER_CALL fe_rust_mixer_reset(void* handle);
void FE_RUST_MIXER_CALL fe_rust_mixer_destroy(void* handle);

#ifdef __cplusplus
}
#endif
