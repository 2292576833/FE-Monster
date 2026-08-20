#include <stddef.h>
#include "fe_rust_mixer.h"

_Static_assert(FE_RUST_MIXER_ABI_VERSION == 1u, "ABI version");
_Static_assert(sizeof(FeRustMixerConfig) == 32u, "config size");
_Static_assert(offsetof(FeRustMixerConfig, reserved) == 16u, "config layout");
_Static_assert(sizeof(FeRustMixerParams) == 180u, "params size");
_Static_assert(offsetof(FeRustMixerParams, eq_db) == 36u, "EQ layout");
_Static_assert(offsetof(FeRustMixerParams, stereo_width) == 76u, "spatial layout");
_Static_assert(offsetof(FeRustMixerParams, compressor_threshold_db) == 92u,
               "compressor layout");
_Static_assert(offsetof(FeRustMixerParams, limiter_ceiling_db) == 116u,
               "limiter layout");
_Static_assert(offsetof(FeRustMixerParams, reverb_room_size) == 124u,
               "reverb layout");
_Static_assert(offsetof(FeRustMixerParams, reserved) == 148u, "params tail");
_Static_assert(sizeof(FeRustMixerStatus) == 64u, "status size");
_Static_assert(offsetof(FeRustMixerStatus, active_revision) == 8u, "status layout");
_Static_assert(offsetof(FeRustMixerStatus, reserved) == 36u, "status tail");

static FeRustMixerAbiVersionFn abi_version_fn = fe_rust_mixer_abi_version;
static FeRustMixerCreateFn create_fn = fe_rust_mixer_create;
static FeRustMixerStageParamsFn stage_fn = fe_rust_mixer_stage_params;
static FeRustMixerCommitFn commit_fn = fe_rust_mixer_commit;
static FeRustMixerProcessFn process_fn = fe_rust_mixer_process;
static FeRustMixerGetStatusFn status_fn = fe_rust_mixer_get_status;
static FeRustMixerResetFn reset_fn = fe_rust_mixer_reset;
static FeRustMixerDestroyFn destroy_fn = fe_rust_mixer_destroy;

int fe_rust_mixer_header_probe(void) {
    return abi_version_fn != NULL && create_fn != NULL && stage_fn != NULL &&
           commit_fn != NULL && process_fn != NULL && status_fn != NULL &&
           reset_fn != NULL && destroy_fn != NULL;
}
