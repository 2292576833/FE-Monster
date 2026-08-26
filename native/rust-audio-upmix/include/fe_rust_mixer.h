#pragma once

#include <stdint.h>

#define FE_RUST_MIXER_ABI_VERSION 2u
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
    FE_RUST_MIXER_PRESET_NIGHT = 7,
    FE_RUST_MIXER_PRESET_WIDE_CHORUS = 8,
    FE_RUST_MIXER_PRESET_CLASSIC_FLANGER = 9,
    FE_RUST_MIXER_PRESET_FLOWING_PHASER = 10,
    FE_RUST_MIXER_PRESET_PING_PONG_DELAY = 11,
    FE_RUST_MIXER_PRESET_NEARFIELD_STUDIO = 12,
    FE_RUST_MIXER_PRESET_IMMERSIVE_LIVE = 13
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
 * Chorus: rate 0.05..5 Hz, depth 0..1, centre delay 4..30 ms,
 * feedback -0.95..0.95, mix 0..1. Flanger: rate 0.02..5 Hz, depth 0..1,
 * centre delay 0.2..10 ms, feedback -0.95..0.95, mix 0..1. Phaser: rate
 * 0.02..10 Hz, depth 0..1, centre frequency 100..4000 Hz, feedback
 * -0.95..0.95, mix 0..1. Delay: time 1..1000 ms, feedback 0..0.90,
 * ping-pong 0..1, damping 500..20000 Hz, mix 0..1. Early reflections:
 * room/diffusion/damping 0..1, mix 0..0.5.
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
    uint32_t chorus_enabled;
    float chorus_rate_hz;
    float chorus_depth;
    float chorus_center_delay_ms;
    float chorus_feedback;
    float chorus_mix;
    uint32_t flanger_enabled;
    float flanger_rate_hz;
    float flanger_depth;
    float flanger_center_delay_ms;
    float flanger_feedback;
    float flanger_mix;
    uint32_t phaser_enabled;
    float phaser_rate_hz;
    float phaser_depth;
    float phaser_center_frequency_hz;
    float phaser_feedback;
    float phaser_mix;
    uint32_t delay_enabled;
    float delay_ms;
    float delay_feedback;
    float delay_ping_pong;
    float delay_damping_hz;
    float delay_mix;
    uint32_t early_reflections_enabled;
    float early_reflections_room_size;
    float early_reflections_diffusion;
    float early_reflections_damping;
    float early_reflections_mix;
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
