#ifndef NOMINMAX
#define NOMINMAX
#endif

#include "fe_audio_pipeline.h"

#include <windows.h>
#include <unknwn.h>
#include <ks.h>
#include <ksmedia.h>
#include <xaudio2.h>
#include <x3daudio.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <chrono>
#include <cstring>
#include <cwchar>
#include <memory>
#include <mutex>
#include <new>
#include <string>
#include <utility>
#include <vector>

#include "../../rust-audio-upmix/include/fe_rust_upmix.h"
#include "obr/audio_buffer/audio_buffer.h"
#include "obr/renderer/audio_element_config.h"
#include "obr/renderer/audio_element_type.h"
#include "obr/renderer/obr_impl.h"

namespace {

constexpr uint32_t kFramesPerRenderBlock = 256;
constexpr uint32_t kFramesPerTransportBatch = 4096;
constexpr uint32_t kDefaultQueuedBuffers = 12;
constexpr uint32_t kPrerollQueuedBuffers = 24;
constexpr uint32_t kMixerConsecutiveFailureLimit = 3;
constexpr uint32_t kTimelineResetFadeSteps = 8;
constexpr LONGLONG kTimelineResetFadeStepHundredNanoseconds = 20'000;
constexpr DWORD kCreateWaitableTimerHighResolution = 0x00000002;
// Measured from the pinned third-order Google OBR Direct/Ambient/Reverberant
// assets at 48 kHz: the main binaural impulse arrives at frame 103/104 for a
// +/-30 degree stereo object.  Aligning dry to frame 104 prevents the wet/dry
// blend from combining a delayed HRIR with a zero-latency copy.
constexpr uint32_t kObrDryCompensationFramesAt48Khz = 104;
constexpr float kPi = 3.14159265358979323846f;
int kRustUpmixModuleAnchor = 0;

enum class SpatialTransitionPhase : uint32_t {
    kSteady = 0,
    kFadeOut = 1,
    kFadeIn = 2
};

float ClampFinite(float value, float minimum, float maximum, float fallback) {
    if (!std::isfinite(value)) return fallback;
    return std::clamp(value, minimum, maximum);
}

struct QueuedAudioBuffer {
    std::vector<float> samples;
    bool in_use = false;
};

struct PoseSnapshot {
    FeAudioPose pose{};
    uint64_t revision = 0;
};

std::wstring RustUpmixDllPath() {
    std::array<wchar_t, 32768> buffer{};
    const DWORD environment_length = GetEnvironmentVariableW(
        L"FE_MONSTER_RUST_UPMIX_DLL",
        buffer.data(),
        static_cast<DWORD>(buffer.size())
    );
    if (environment_length > 0 && environment_length < buffer.size()) {
        return std::wstring(buffer.data(), environment_length);
    }

    HMODULE module = nullptr;
    if (!GetModuleHandleExW(
            GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS
                | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
            reinterpret_cast<LPCWSTR>(&kRustUpmixModuleAnchor),
            &module
        )) {
        return L"fe_monster_upmix.dll";
    }
    const DWORD module_length = GetModuleFileNameW(
        module,
        buffer.data(),
        static_cast<DWORD>(buffer.size())
    );
    if (module_length == 0 || module_length >= buffer.size()) {
        return L"fe_monster_upmix.dll";
    }
    std::wstring path(buffer.data(), module_length);
    const size_t separator = path.find_last_of(L"\\/");
    path.resize(separator == std::wstring::npos ? 0 : separator + 1);
    path.append(L"fe_monster_upmix.dll");
    return path;
}

bool IsAudioProbeProcess() {
    std::array<wchar_t, 32768> path{};
    const DWORD length = GetModuleFileNameW(
        nullptr,
        path.data(),
        static_cast<DWORD>(path.size())
    );
    if (length == 0 || length >= path.size()) return false;
    const wchar_t* slash = std::wcsrchr(path.data(), L'\\');
    const wchar_t* name = slash == nullptr ? path.data() : slash + 1;
    return _wcsicmp(name, L"fe_audio_probe.exe") == 0;
}

std::wstring AudioProbeEnvironment(const wchar_t* name) {
    if (!IsAudioProbeProcess()) return {};
    std::array<wchar_t, 64> value{};
    const DWORD length = GetEnvironmentVariableW(
        name,
        value.data(),
        static_cast<DWORD>(value.size())
    );
    if (length == 0 || length >= value.size()) return {};
    return std::wstring(value.data(), length);
}

bool MixerValueInRange(float value, float minimum, float maximum) {
    return std::isfinite(value) && value >= minimum && value <= maximum;
}

bool IsValidMixerParams(const FeRustMixerParams* params) {
    if (params == nullptr || params->struct_size < sizeof(FeRustMixerParams)) return false;
    if (params->abi_version != FE_RUST_MIXER_ABI_VERSION) return false;
    if (params->enabled > 1
        || params->compressor_enabled > 1
        || params->limiter_enabled > 1
        || params->reverb_enabled > 1) {
        return false;
    }
    if (!MixerValueInRange(params->input_gain_db, -24.0f, 24.0f)
        || !MixerValueInRange(params->output_gain_db, -24.0f, 24.0f)
        || !MixerValueInRange(params->balance, -1.0f, 1.0f)
        || !MixerValueInRange(params->stereo_width, 0.0f, 2.0f)
        || !MixerValueInRange(params->center_gain, 0.0f, 2.0f)
        || !MixerValueInRange(params->surround_gain, 0.0f, 2.0f)
        || !MixerValueInRange(params->lfe_gain, 0.0f, 2.0f)
        || !MixerValueInRange(params->compressor_threshold_db, -60.0f, 0.0f)
        || !MixerValueInRange(params->compressor_ratio, 1.0f, 20.0f)
        || !MixerValueInRange(params->compressor_attack_ms, 0.1f, 200.0f)
        || !MixerValueInRange(params->compressor_release_ms, 10.0f, 2000.0f)
        || !MixerValueInRange(params->compressor_knee_db, 0.0f, 24.0f)
        || !MixerValueInRange(params->compressor_makeup_db, 0.0f, 24.0f)
        || !MixerValueInRange(params->limiter_ceiling_db, -12.0f, 0.0f)
        || !MixerValueInRange(params->limiter_release_ms, 10.0f, 1000.0f)
        || !MixerValueInRange(params->reverb_room_size, 0.0f, 1.0f)
        || !MixerValueInRange(params->reverb_decay_ms, 50.0f, 5000.0f)
        || !MixerValueInRange(params->reverb_damping, 0.0f, 1.0f)
        || !MixerValueInRange(params->reverb_pre_delay_ms, 0.0f, 200.0f)
        || !MixerValueInRange(params->reverb_wet, 0.0f, 1.0f)
        || !MixerValueInRange(params->reverb_dry, 0.0f, 1.0f)) {
        return false;
    }
    for (float value : params->eq_db) {
        if (!MixerValueInRange(value, -12.0f, 12.0f)) return false;
    }
    for (uint32_t value : params->reserved) {
        if (value != 0) return false;
    }
    return true;
}

FeAudioSpatialControlParams DefaultSpatialControls(const FeAudioPipelineConfig& config) {
    FeAudioSpatialControlParams params{};
    params.struct_size = sizeof(params);
    params.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    params.upmix_enabled = config.mode == FE_AUDIO_MODE_OBR_BINAURAL
            && (config.virtual_layout_channels == 6 || config.virtual_layout_channels == 8)
        ? 1u
        : 0u;
    params.upmix_algorithm = config.upmix_algorithm == 1
        ? 0u
        : (config.upmix_algorithm == 3 ? 2u : 1u);
    params.upmix_output_channels = config.virtual_layout_channels == 8
        ? 8u
        : (config.virtual_layout_channels == 6 ? 6u : 2u);
    params.upmix_center_width_hz = 300.0f;
    params.upmix_lfe_crossover_hz = 120.0f;
    params.upmix_center_gain = 0.707f;
    params.upmix_surround_gain = 0.5f;
    params.upmix_lfe_gain = 0.707f;
    params.upmix_decorrelation_amount = 0.7f;
    params.obr_enabled = config.mode == FE_AUDIO_MODE_OBR_BINAURAL ? 1u : 0u;
    params.obr_filter_profile = FE_AUDIO_OBR_FILTER_DIRECT;
    params.obr_wet = 1.0f;
    params.obr_dry = 0.0f;
    params.obr_output_gain_db = 0.0f;
    params.obr_spatial_width = 1.0f;
    return params;
}

bool IsValidSpatialControls(const FeAudioSpatialControlParams* params) {
    if (params == nullptr || params->struct_size < sizeof(*params)) return false;
    if (params->abi_version != FE_AUDIO_PIPELINE_ABI_VERSION) return false;
    if (params->upmix_enabled > 1 || params->obr_enabled > 1) return false;
    if (params->upmix_algorithm > 2) return false;
    if (params->upmix_output_channels != 6 && params->upmix_output_channels != 8) {
        return false;
    }
    if (params->obr_filter_profile > FE_AUDIO_OBR_FILTER_REVERBERANT) return false;
    if (!MixerValueInRange(params->upmix_center_width_hz, 20.0f, 20000.0f)
        || !MixerValueInRange(params->upmix_lfe_crossover_hz, 20.0f, 500.0f)
        || !MixerValueInRange(params->upmix_center_gain, 0.0f, 2.0f)
        || !MixerValueInRange(params->upmix_surround_gain, 0.0f, 2.0f)
        || !MixerValueInRange(params->upmix_lfe_gain, 0.0f, 2.0f)
        || !MixerValueInRange(params->upmix_decorrelation_amount, 0.0f, 1.0f)
        || !MixerValueInRange(params->obr_wet, 0.0f, 1.0f)
        || !MixerValueInRange(params->obr_dry, 0.0f, 1.0f)
        || !MixerValueInRange(params->obr_output_gain_db, -12.0f, 0.0f)
        || !MixerValueInRange(params->obr_spatial_width, 0.0f, 2.0f)) {
        return false;
    }
    for (const uint32_t value : params->reserved) {
        if (value != 0) return false;
    }
    return true;
}

float LinearGainToDb(float gain) {
    if (!std::isfinite(gain) || gain <= 0.001f) return -60.0f;
    return std::clamp(20.0f * std::log10(gain), -60.0f, 12.0f);
}

bool SpatialAlgorithmUsesChannelRouter(const FeAudioSpatialControlParams& spatial) {
    // Preserve the established spatial-control ABI: 0 is OxiMedia Passive
    // FFT, not the additive router's FRONT_ONLY id. Matrix (1) and Ambient
    // (2) intentionally share ids with the new router and can take the new
    // production path without changing the Java/UI contract.
    return spatial.upmix_algorithm == FE_RUST_UPMIX_MATRIX_DECODE
        || spatial.upmix_algorithm == FE_RUST_UPMIX_AMBIENT_EXTRACT;
}

FeRustChannelRouterParams ChannelRouterParamsFromSpatial(
    const FeAudioSpatialControlParams& spatial
) {
    FeRustChannelRouterParams params{};
    params.struct_size = sizeof(params);
    params.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
    params.output_channels = spatial.upmix_output_channels;
    params.algorithm = spatial.upmix_algorithm;
    params.lfe_crossover_hz = spatial.upmix_lfe_crossover_hz;
    params.channel_gain_db[2] = LinearGainToDb(spatial.upmix_center_gain);
    params.channel_gain_db[3] = LinearGainToDb(spatial.upmix_lfe_gain);
    for (uint32_t channel = 4; channel < spatial.upmix_output_channels; ++channel) {
        params.channel_gain_db[channel] = LinearGainToDb(spatial.upmix_surround_gain);
    }
    if (spatial.upmix_output_channels == 8) {
        const std::array<float, 8> azimuths{
            30.0f, -30.0f, 0.0f, 0.0f, 135.0f, -135.0f, 90.0f, -90.0f
        };
        std::copy(azimuths.begin(), azimuths.end(), params.channel_azimuth_deg);
    } else {
        const std::array<float, 8> azimuths{
            30.0f, -30.0f, 0.0f, 0.0f, 110.0f, -110.0f, 0.0f, 0.0f
        };
        std::copy(azimuths.begin(), azimuths.end(), params.channel_azimuth_deg);
    }
    return params;
}

obr::BinauralFilterProfile ToObrFilterProfile(uint32_t profile) {
    switch (profile) {
        case FE_AUDIO_OBR_FILTER_AMBIENT:
            return obr::BinauralFilterProfile::kAmbient;
        case FE_AUDIO_OBR_FILTER_REVERBERANT:
            return obr::BinauralFilterProfile::kReverberant;
        case FE_AUDIO_OBR_FILTER_DIRECT:
        default:
            return obr::BinauralFilterProfile::kDirect;
    }
}

class RustUpmixBridge final {
public:
    RustUpmixBridge() = default;
    RustUpmixBridge(const RustUpmixBridge&) = delete;
    RustUpmixBridge& operator=(const RustUpmixBridge&) = delete;

    ~RustUpmixBridge() {
        Shutdown();
    }

    bool Initialize(
        uint32_t sample_rate,
        const FeAudioSpatialControlParams& params
    ) {
        Shutdown();
        const uint32_t output_channels = params.upmix_output_channels;
        if (output_channels != 6 && output_channels != 8) {
            last_result_ = -2;
            return false;
        }
        if (AudioProbeEnvironment(L"FE_MONSTER_AUDIO_PROBE_FORCE_CPP_UPMIX") == L"1") {
            last_result_ = -3;
            return false;
        }

        const std::wstring path = RustUpmixDllPath();
        module_ = LoadLibraryW(path.c_str());
        if (module_ == nullptr && path != L"fe_monster_upmix.dll") {
            module_ = LoadLibraryW(L"fe_monster_upmix.dll");
        }
        if (module_ == nullptr) {
            last_result_ = HRESULT_FROM_WIN32(GetLastError());
            return false;
        }

        abi_version_ = reinterpret_cast<FeRustUpmixAbiVersionFn>(
            GetProcAddress(module_, "fe_rust_upmix_abi_version")
        );
        create_ = reinterpret_cast<FeRustUpmixCreateFn>(
            GetProcAddress(module_, "fe_rust_upmix_create")
        );
        process_ = reinterpret_cast<FeRustUpmixProcessFn>(
            GetProcAddress(module_, "fe_rust_upmix_process")
        );
        reset_ = reinterpret_cast<FeRustUpmixResetFn>(
            GetProcAddress(module_, "fe_rust_upmix_reset")
        );
        destroy_ = reinterpret_cast<FeRustUpmixDestroyFn>(
            GetProcAddress(module_, "fe_rust_upmix_destroy")
        );
        if (!abi_version_ || !create_ || !process_ || !reset_ || !destroy_
            || abi_version_() != FE_RUST_UPMIX_ABI_VERSION) {
            last_result_ = HRESULT_FROM_WIN32(ERROR_REVISION_MISMATCH);
            Shutdown();
            return false;
        }

        FeRustUpmixConfig config{};
        config.struct_size = sizeof(config);
        config.abi_version = FE_RUST_UPMIX_ABI_VERSION;
        config.sample_rate = sample_rate;
        config.output_channels = output_channels;
        config.algorithm = params.upmix_algorithm;
        config.center_width_hz = params.upmix_center_width_hz;
        config.lfe_crossover_hz = params.upmix_lfe_crossover_hz;
        config.lfe_gain = params.upmix_lfe_gain;
        config.center_gain = params.upmix_center_gain;
        config.surround_gain = params.upmix_surround_gain;
        config.decorrelation_amount = params.upmix_decorrelation_amount;
        handle_ = create_(&config);
        if (handle_ == nullptr) {
            last_result_ = E_FAIL;
            Shutdown();
            return false;
        }
        output_channels_ = output_channels;
        last_result_ = FE_RUST_UPMIX_OK;
        return true;
    }

    bool Process(
        const float* interleaved_stereo,
        uint32_t frame_count,
        float* interleaved_output,
        uint32_t output_capacity_samples
    ) {
        if (!Ready() || interleaved_stereo == nullptr || interleaved_output == nullptr) {
            last_result_ = E_HANDLE;
            return false;
        }
        last_result_ = process_(
            handle_,
            interleaved_stereo,
            frame_count,
            interleaved_output,
            output_capacity_samples
        );
        return last_result_ == FE_RUST_UPMIX_OK;
    }

    bool Ready() const {
        return module_ != nullptr && handle_ != nullptr && process_ != nullptr;
    }

    int32_t LastResult() const {
        return last_result_;
    }

    int32_t Reset() {
        if (!Ready() || reset_ == nullptr) return E_HANDLE;
        last_result_ = reset_(handle_);
        return last_result_;
    }

    void Shutdown() {
        if (handle_ != nullptr && destroy_ != nullptr) {
            destroy_(handle_);
        }
        handle_ = nullptr;
        output_channels_ = 0;
        abi_version_ = nullptr;
        create_ = nullptr;
        process_ = nullptr;
        reset_ = nullptr;
        destroy_ = nullptr;
        if (module_ != nullptr) {
            FreeLibrary(module_);
            module_ = nullptr;
        }
    }

private:
    HMODULE module_ = nullptr;
    void* handle_ = nullptr;
    uint32_t output_channels_ = 0;
    FeRustUpmixAbiVersionFn abi_version_ = nullptr;
    FeRustUpmixCreateFn create_ = nullptr;
    FeRustUpmixProcessFn process_ = nullptr;
    FeRustUpmixResetFn reset_ = nullptr;
    FeRustUpmixDestroyFn destroy_ = nullptr;
    int32_t last_result_ = -2;
};

class RustChannelRouterBridge final {
public:
    RustChannelRouterBridge() = default;
    RustChannelRouterBridge(const RustChannelRouterBridge&) = delete;
    RustChannelRouterBridge& operator=(const RustChannelRouterBridge&) = delete;

    ~RustChannelRouterBridge() {
        Shutdown();
    }

    bool Initialize(uint32_t sample_rate, uint32_t output_channels) {
        Shutdown();
        if (output_channels != 6 && output_channels != 8) {
            last_result_ = FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
            return false;
        }
        if (AudioProbeEnvironment(L"FE_MONSTER_AUDIO_PROBE_FORCE_CPP_UPMIX") == L"1") {
            last_result_ = FE_RUST_CHANNEL_ROUTER_UNSUPPORTED;
            return false;
        }
        const std::wstring path = RustUpmixDllPath();
        module_ = LoadLibraryW(path.c_str());
        if (module_ == nullptr && path != L"fe_monster_upmix.dll") {
            module_ = LoadLibraryW(L"fe_monster_upmix.dll");
        }
        if (module_ == nullptr) {
            last_result_ = HRESULT_FROM_WIN32(GetLastError());
            return false;
        }
        abi_version_ = reinterpret_cast<FeRustChannelRouterAbiVersionFn>(
            GetProcAddress(module_, "fe_rust_channel_router_abi_version")
        );
        create_ = reinterpret_cast<FeRustChannelRouterCreateFn>(
            GetProcAddress(module_, "fe_rust_channel_router_create")
        );
        stage_ = reinterpret_cast<FeRustChannelRouterStageFn>(
            GetProcAddress(module_, "fe_rust_channel_router_stage")
        );
        commit_ = reinterpret_cast<FeRustChannelRouterCommitFn>(
            GetProcAddress(module_, "fe_rust_channel_router_commit")
        );
        process_ = reinterpret_cast<FeRustChannelRouterProcessFn>(
            GetProcAddress(module_, "fe_rust_channel_router_process")
        );
        get_status_ = reinterpret_cast<FeRustChannelRouterGetStatusFn>(
            GetProcAddress(module_, "fe_rust_channel_router_get_status")
        );
        reset_ = reinterpret_cast<FeRustChannelRouterResetFn>(
            GetProcAddress(module_, "fe_rust_channel_router_reset")
        );
        destroy_ = reinterpret_cast<FeRustChannelRouterDestroyFn>(
            GetProcAddress(module_, "fe_rust_channel_router_destroy")
        );
        generate_test_signal_ = reinterpret_cast<FeRustGenerateTestSignalFn>(
            GetProcAddress(module_, "fe_rust_channel_router_generate_test_signal")
        );
        if (!abi_version_
            || !create_
            || !stage_
            || !commit_
            || !process_
            || !get_status_
            || !reset_
            || !destroy_
            || !generate_test_signal_
            || abi_version_() != FE_RUST_CHANNEL_ROUTER_ABI_VERSION) {
            last_result_ = HRESULT_FROM_WIN32(ERROR_REVISION_MISMATCH);
            Shutdown();
            return false;
        }
        FeRustChannelRouterConfig config{};
        config.struct_size = sizeof(config);
        config.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
        config.sample_rate = sample_rate;
        config.max_frames_per_call = kFramesPerTransportBatch;
        config.output_channels = output_channels;
        config.max_delay_ms = 250.0f;
        handle_ = create_(&config);
        if (handle_ == nullptr) {
            last_result_ = E_FAIL;
            Shutdown();
            return false;
        }
        output_channels_ = output_channels;
        last_result_ = FE_RUST_CHANNEL_ROUTER_OK;
        return true;
    }

    int32_t StageAndCommit(
        uint64_t revision,
        const FeRustChannelRouterParams* params,
        uint32_t ramp_frames
    ) {
        if (!Ready() || params == nullptr) {
            last_result_ = FE_RUST_CHANNEL_ROUTER_UNSUPPORTED;
            return last_result_;
        }
        last_result_ = stage_(handle_, revision, params);
        if (last_result_ != FE_RUST_CHANNEL_ROUTER_OK) return last_result_;
        last_result_ = commit_(handle_, revision, ramp_frames);
        return last_result_;
    }

    int32_t Process(
        const float* input,
        uint32_t frames,
        float* output,
        uint32_t output_capacity_samples
    ) {
        if (!Ready()) {
            last_result_ = FE_RUST_CHANNEL_ROUTER_UNSUPPORTED;
            return last_result_;
        }
        last_result_ = process_(handle_, input, frames, output, output_capacity_samples);
        return last_result_;
    }

    int32_t GetStatus(FeRustChannelRouterStatus* status) const {
        if (!Ready() || status == nullptr) return FE_RUST_CHANNEL_ROUTER_UNSUPPORTED;
        return get_status_(handle_, status);
    }

    int32_t GenerateTestSignal(
        const FeRustTestSignalConfig* config,
        FeRustTestSignalState* state,
        uint32_t frames,
        float* output,
        uint32_t output_capacity_samples
    ) const {
        if (!Ready() || config == nullptr || state == nullptr || output == nullptr) {
            return FE_RUST_CHANNEL_ROUTER_UNSUPPORTED;
        }
        return generate_test_signal_(
            config,
            state,
            frames,
            output,
            output_capacity_samples
        );
    }

    int32_t Reset() {
        if (!Ready()) return FE_RUST_CHANNEL_ROUTER_UNSUPPORTED;
        last_result_ = reset_(handle_);
        return last_result_;
    }

    bool Ready() const {
        return module_ != nullptr && handle_ != nullptr && process_ != nullptr;
    }

    uint32_t OutputChannels() const {
        return output_channels_;
    }

    int32_t LastResult() const {
        return last_result_;
    }

    void Shutdown() {
        if (handle_ != nullptr && destroy_ != nullptr) destroy_(handle_);
        handle_ = nullptr;
        output_channels_ = 0;
        abi_version_ = nullptr;
        create_ = nullptr;
        stage_ = nullptr;
        commit_ = nullptr;
        process_ = nullptr;
        get_status_ = nullptr;
        reset_ = nullptr;
        destroy_ = nullptr;
        generate_test_signal_ = nullptr;
        if (module_ != nullptr) {
            FreeLibrary(module_);
            module_ = nullptr;
        }
    }

private:
    HMODULE module_ = nullptr;
    void* handle_ = nullptr;
    uint32_t output_channels_ = 0;
    FeRustChannelRouterAbiVersionFn abi_version_ = nullptr;
    FeRustChannelRouterCreateFn create_ = nullptr;
    FeRustChannelRouterStageFn stage_ = nullptr;
    FeRustChannelRouterCommitFn commit_ = nullptr;
    FeRustChannelRouterProcessFn process_ = nullptr;
    FeRustChannelRouterGetStatusFn get_status_ = nullptr;
    FeRustChannelRouterResetFn reset_ = nullptr;
    FeRustChannelRouterDestroyFn destroy_ = nullptr;
    FeRustGenerateTestSignalFn generate_test_signal_ = nullptr;
    int32_t last_result_ = FE_RUST_CHANNEL_ROUTER_UNSUPPORTED;
};

class RustMixerBridge final {
public:
    RustMixerBridge() = default;
    RustMixerBridge(const RustMixerBridge&) = delete;
    RustMixerBridge& operator=(const RustMixerBridge&) = delete;

    ~RustMixerBridge() {
        Shutdown();
    }

    bool Initialize(uint32_t sample_rate) {
        Shutdown();
        bypass_reason_ = FE_AUDIO_MIXER_BYPASS_DLL_UNAVAILABLE;
        last_result_ = FE_RUST_MIXER_UNSUPPORTED;

        const std::wstring injected_failure = AudioProbeEnvironment(
            L"FE_MONSTER_AUDIO_PROBE_MIXER_INIT_FAILURE"
        );
        if (injected_failure == L"missing-dll") {
            last_result_ = HRESULT_FROM_WIN32(ERROR_MOD_NOT_FOUND);
            return false;
        }
        if (injected_failure == L"missing-symbol") {
            bypass_reason_ = FE_AUDIO_MIXER_BYPASS_SYMBOL_MISSING;
            last_result_ = HRESULT_FROM_WIN32(ERROR_PROC_NOT_FOUND);
            return false;
        }
        if (injected_failure == L"abi") {
            bypass_reason_ = FE_AUDIO_MIXER_BYPASS_ABI_MISMATCH;
            last_result_ = HRESULT_FROM_WIN32(ERROR_REVISION_MISMATCH);
            return false;
        }
        if (injected_failure == L"create") {
            bypass_reason_ = FE_AUDIO_MIXER_BYPASS_CREATE_FAILED;
            last_result_ = E_FAIL;
            return false;
        }

        const std::wstring path = RustUpmixDllPath();
        module_ = LoadLibraryW(path.c_str());
        if (module_ == nullptr && path != L"fe_monster_upmix.dll") {
            module_ = LoadLibraryW(L"fe_monster_upmix.dll");
        }
        if (module_ == nullptr) {
            last_result_ = HRESULT_FROM_WIN32(GetLastError());
            return false;
        }

        abi_version_ = reinterpret_cast<FeRustMixerAbiVersionFn>(
            GetProcAddress(module_, "fe_rust_mixer_abi_version")
        );
        create_ = reinterpret_cast<FeRustMixerCreateFn>(
            GetProcAddress(module_, "fe_rust_mixer_create")
        );
        stage_params_ = reinterpret_cast<FeRustMixerStageParamsFn>(
            GetProcAddress(module_, "fe_rust_mixer_stage_params")
        );
        commit_ = reinterpret_cast<FeRustMixerCommitFn>(
            GetProcAddress(module_, "fe_rust_mixer_commit")
        );
        process_ = reinterpret_cast<FeRustMixerProcessFn>(
            GetProcAddress(module_, "fe_rust_mixer_process")
        );
        get_status_ = reinterpret_cast<FeRustMixerGetStatusFn>(
            GetProcAddress(module_, "fe_rust_mixer_get_status")
        );
        reset_ = reinterpret_cast<FeRustMixerResetFn>(
            GetProcAddress(module_, "fe_rust_mixer_reset")
        );
        destroy_ = reinterpret_cast<FeRustMixerDestroyFn>(
            GetProcAddress(module_, "fe_rust_mixer_destroy")
        );
        if (!abi_version_
            || !create_
            || !stage_params_
            || !commit_
            || !process_
            || !get_status_
            || !reset_
            || !destroy_) {
            bypass_reason_ = FE_AUDIO_MIXER_BYPASS_SYMBOL_MISSING;
            last_result_ = HRESULT_FROM_WIN32(ERROR_PROC_NOT_FOUND);
            Shutdown();
            return false;
        }
        if (abi_version_() != FE_RUST_MIXER_ABI_VERSION) {
            bypass_reason_ = FE_AUDIO_MIXER_BYPASS_ABI_MISMATCH;
            last_result_ = HRESULT_FROM_WIN32(ERROR_REVISION_MISMATCH);
            Shutdown();
            return false;
        }

        FeRustMixerConfig config{};
        config.struct_size = sizeof(config);
        config.abi_version = FE_RUST_MIXER_ABI_VERSION;
        config.sample_rate = sample_rate;
        config.max_frames_per_call = kFramesPerRenderBlock;
        handle_ = create_(&config);
        if (handle_ == nullptr) {
            bypass_reason_ = FE_AUDIO_MIXER_BYPASS_CREATE_FAILED;
            last_result_ = E_FAIL;
            Shutdown();
            return false;
        }

        const std::wstring injected_process_failures = AudioProbeEnvironment(
            L"FE_MONSTER_AUDIO_PROBE_MIXER_PROCESS_FAILURES"
        );
        if (!injected_process_failures.empty()) {
            wchar_t* end = nullptr;
            const unsigned long parsed = std::wcstoul(
                injected_process_failures.c_str(),
                &end,
                10
            );
            if (end != injected_process_failures.c_str()) {
                probe_process_failures_remaining_ = static_cast<uint32_t>(
                    std::min<unsigned long>(parsed, 1000)
                );
            }
        }
        const std::wstring injected_successes_before_failure = AudioProbeEnvironment(
            L"FE_MONSTER_AUDIO_PROBE_MIXER_PROCESS_FAILURE_SKIP"
        );
        if (!injected_successes_before_failure.empty()) {
            wchar_t* end = nullptr;
            const unsigned long parsed = std::wcstoul(
                injected_successes_before_failure.c_str(),
                &end,
                10
            );
            if (end != injected_successes_before_failure.c_str()) {
                probe_process_successes_before_failure_ = static_cast<uint32_t>(
                    std::min<unsigned long>(parsed, 1000)
                );
            }
        }
        if (AudioProbeEnvironment(
                L"FE_MONSTER_AUDIO_PROBE_MIXER_COMMIT_BUSY_ONCE"
            ) == L"1") {
            probe_commit_busy_remaining_ = 1;
        }
        if (AudioProbeEnvironment(
                L"FE_MONSTER_AUDIO_PROBE_MIXER_BOUNDARY_COMMIT_BUSY_ONCE"
            ) == L"1") {
            probe_boundary_commit_busy_remaining_ = 1;
        }
        bypass_reason_ = FE_AUDIO_MIXER_BYPASS_NONE;
        last_result_ = FE_RUST_MIXER_OK;
        return true;
    }

    int32_t StageAndCommit(
        uint64_t revision,
        const FeRustMixerParams* params,
        uint32_t ramp_frames
    ) {
        if (!Ready()) {
            last_result_ = FE_RUST_MIXER_UNSUPPORTED;
            return last_result_;
        }
        FeRustMixerStatus current{};
        if (GetStatus(&current)
            && current.active_revision < revision
            && current.staged_revision == revision) {
            last_result_ = commit_(handle_, revision, ramp_frames);
            return last_result_;
        }
        last_result_ = stage_params_(handle_, revision, params);
        if (last_result_ != FE_RUST_MIXER_OK) return last_result_;
        if (probe_commit_busy_remaining_ > 0) {
            probe_commit_busy_remaining_ -= 1;
            last_result_ = FE_RUST_MIXER_BUSY;
            return last_result_;
        }
        last_result_ = commit_(handle_, revision, ramp_frames);
        return last_result_;
    }

    int32_t Stage(uint64_t revision, const FeRustMixerParams* params) {
        if (!Ready()) {
            last_result_ = FE_RUST_MIXER_UNSUPPORTED;
            return last_result_;
        }
        last_result_ = stage_params_(handle_, revision, params);
        if (last_result_ == FE_RUST_MIXER_OK && probe_commit_busy_remaining_ > 0) {
            // The probe models a publication slot that is unavailable until
            // the control thread retries.  Keep the Rust snapshot staged so
            // the retry does not need to overwrite the same revision.
            probe_commit_busy_remaining_ -= 1;
            last_result_ = FE_RUST_MIXER_BUSY;
        }
        return last_result_;
    }

    int32_t CommitStaged(uint64_t revision, uint32_t ramp_frames) {
        if (!Ready()) {
            last_result_ = FE_RUST_MIXER_UNSUPPORTED;
            return last_result_;
        }
        if (probe_boundary_commit_busy_remaining_ > 0) {
            probe_boundary_commit_busy_remaining_ -= 1;
            last_result_ = FE_RUST_MIXER_BUSY;
            return last_result_;
        }
        last_result_ = commit_(handle_, revision, ramp_frames);
        return last_result_;
    }

    int32_t Process(float* interleaved_pcm, uint32_t frames, uint32_t channels) {
        if (!Ready()) {
            last_result_ = FE_RUST_MIXER_UNSUPPORTED;
            return last_result_;
        }
        if (probe_process_failures_remaining_ > 0) {
            if (probe_process_successes_before_failure_ > 0) {
                probe_process_successes_before_failure_ -= 1;
            } else {
                probe_process_failures_remaining_ -= 1;
                if (interleaved_pcm != nullptr && frames > 0 && channels > 0) {
                    interleaved_pcm[0] += 0.75f;
                }
                last_result_ = FE_RUST_MIXER_PANIC;
                return last_result_;
            }
        }
        last_result_ = process_(handle_, interleaved_pcm, frames, channels);
        return last_result_;
    }

    bool GetStatus(FeRustMixerStatus* status) const {
        if (!Ready() || status == nullptr) return false;
        *status = {};
        status->struct_size = sizeof(*status);
        status->abi_version = FE_RUST_MIXER_ABI_VERSION;
        return get_status_(handle_, status) == FE_RUST_MIXER_OK;
    }

    bool Ready() const {
        return module_ != nullptr && handle_ != nullptr && process_ != nullptr;
    }

    int32_t LastResult() const {
        return last_result_.load();
    }

    uint32_t BypassReason() const {
        return bypass_reason_;
    }

    int32_t Reset() {
        if (!Ready() || reset_ == nullptr) return FE_RUST_MIXER_UNSUPPORTED;
        last_result_ = reset_(handle_);
        return last_result_.load();
    }

    void Shutdown() {
        if (handle_ != nullptr && reset_ != nullptr) reset_(handle_);
        if (handle_ != nullptr && destroy_ != nullptr) destroy_(handle_);
        handle_ = nullptr;
        abi_version_ = nullptr;
        create_ = nullptr;
        stage_params_ = nullptr;
        commit_ = nullptr;
        process_ = nullptr;
        get_status_ = nullptr;
        reset_ = nullptr;
        destroy_ = nullptr;
        if (module_ != nullptr) {
            FreeLibrary(module_);
            module_ = nullptr;
        }
        probe_process_failures_remaining_ = 0;
        probe_process_successes_before_failure_ = 0;
        probe_commit_busy_remaining_ = 0;
        probe_boundary_commit_busy_remaining_ = 0;
    }

private:
    HMODULE module_ = nullptr;
    void* handle_ = nullptr;
    FeRustMixerAbiVersionFn abi_version_ = nullptr;
    FeRustMixerCreateFn create_ = nullptr;
    FeRustMixerStageParamsFn stage_params_ = nullptr;
    FeRustMixerCommitFn commit_ = nullptr;
    FeRustMixerProcessFn process_ = nullptr;
    FeRustMixerGetStatusFn get_status_ = nullptr;
    FeRustMixerResetFn reset_ = nullptr;
    FeRustMixerDestroyFn destroy_ = nullptr;
    std::atomic<int32_t> last_result_{FE_RUST_MIXER_UNSUPPORTED};
    uint32_t bypass_reason_ = FE_AUDIO_MIXER_BYPASS_DLL_UNAVAILABLE;
    uint32_t probe_process_failures_remaining_ = 0;
    uint32_t probe_process_successes_before_failure_ = 0;
    uint32_t probe_commit_busy_remaining_ = 0;
    uint32_t probe_boundary_commit_busy_remaining_ = 0;
};

class AudioPipeline;

class SourceVoiceCallback final : public IXAudio2VoiceCallback {
public:
    explicit SourceVoiceCallback(AudioPipeline* owner) : owner_(owner) {}

    void STDMETHODCALLTYPE OnVoiceProcessingPassStart(UINT32) override {}
    void STDMETHODCALLTYPE OnVoiceProcessingPassEnd() override {}
    void STDMETHODCALLTYPE OnStreamEnd() override {}
    void STDMETHODCALLTYPE OnBufferStart(void*) override {}
    void STDMETHODCALLTYPE OnLoopEnd(void*) override {}
    void STDMETHODCALLTYPE OnVoiceError(void*, HRESULT error) override;
    void STDMETHODCALLTYPE OnBufferEnd(void* context) override;

private:
    AudioPipeline* owner_;
};

struct SpatialSample {
    float azimuth = 0.0f;
    float elevation = 0.0f;
    float distance = 1.0f;
    float gain = 1.0f;
    float matrix_left = 0.0f;
    float matrix_right = 0.0f;
    float doppler = 1.0f;
    float lpf_direct = 1.0f;
    std::vector<float> matrix;
};

class AudioPipeline final {
public:
    explicit AudioPipeline(const FeAudioPipelineConfig& config)
        : config_(config),
          callback_(this),
          mode_(static_cast<FeAudioPipelineMode>(config.mode)),
          spatial_controls_(DefaultSpatialControls(config)),
          sample_rate_(config.sample_rate),
          input_channels_(config.input_channels),
          virtual_channels_(NormalizeVirtualChannels(config.virtual_layout_channels)),
          max_queued_buffers_(config.max_queued_buffers == 0
              ? kDefaultQueuedBuffers
              : std::clamp(config.max_queued_buffers, 3u, 64u)),
          preroll_target_buffers_(std::min(kPrerollQueuedBuffers, max_queued_buffers_)),
          probe_disable_obr_dry_alignment_(
              AudioProbeEnvironment(L"FE_MONSTER_AUDIO_PROBE_DISABLE_DRY_ALIGNMENT") == L"1"
          ),
          muted_(config.muted != 0) {
        pose_.emitter_z = 1.0f;
        pose_.listener_front_z = 1.0f;
        pose_.listener_up_y = 1.0f;
    }

    ~AudioPipeline() {
        Shutdown();
    }

    HRESULT Initialize() {
        const HRESULT com_result = CoIncrementMTAUsage(&mta_usage_cookie_);
        if (FAILED(com_result)) return RememberFailure(com_result);
        mta_usage_active_ = true;

        HRESULT result = XAudio2Create(&engine_, 0, XAUDIO2_DEFAULT_PROCESSOR);
        if (FAILED(result) || engine_ == nullptr) return RememberFailure(result);

        result = engine_->CreateMasteringVoice(
            &mastering_voice_,
            XAUDIO2_DEFAULT_CHANNELS,
            sample_rate_
        );
        if (FAILED(result) || mastering_voice_ == nullptr) return RememberFailure(result);

        XAUDIO2_VOICE_DETAILS mastering_details{};
        mastering_voice_->GetVoiceDetails(&mastering_details);
        output_channels_ = std::max<UINT32>(1, mastering_details.InputChannels);
        DWORD channel_mask = 0;
        result = mastering_voice_->GetChannelMask(&channel_mask);
        if (FAILED(result) || channel_mask == 0) {
            channel_mask = output_channels_ == 1 ? SPEAKER_MONO : SPEAKER_STEREO;
        }
        X3DAudioInitialize(channel_mask, X3DAUDIO_SPEED_OF_SOUND, x3d_handle_);

        const WORD source_channels = mode_ == FE_AUDIO_MODE_X3D_SPEAKER ? 1 : 2;
        WAVEFORMATEX format{};
        format.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
        format.nChannels = source_channels;
        format.nSamplesPerSec = sample_rate_;
        format.wBitsPerSample = 32;
        format.nBlockAlign = static_cast<WORD>(source_channels * sizeof(float));
        format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;

        result = engine_->CreateSourceVoice(
            &source_voice_,
            &format,
            mode_ == FE_AUDIO_MODE_X3D_SPEAKER ? XAUDIO2_VOICE_USEFILTER : 0,
            XAUDIO2_DEFAULT_FREQ_RATIO,
            &callback_
        );
        if (FAILED(result) || source_voice_ == nullptr) return RememberFailure(result);

        result = source_voice_->SetVolume(muted_.load() ? 0.0f : 1.0f);
        if (FAILED(result)) return RememberFailure(result);

        result = InitializeBufferPool(source_channels);
        if (FAILED(result)) return RememberFailure(result);

        try {
            const size_t mixer_samples = static_cast<size_t>(kFramesPerRenderBlock) * 8u;
            mixer_original_scratch_.assign(mixer_samples, 0.0f);
            mixer_work_scratch_.assign(mixer_samples, 0.0f);
            stereo_dry_scratch_.assign(
                static_cast<size_t>(kFramesPerRenderBlock) * 2u,
                0.0f
            );
            stereo_aligned_dry_scratch_.assign(
                static_cast<size_t>(kFramesPerRenderBlock) * 2u,
                0.0f
            );
            const uint32_t dry_delay_frames = ObrDryCompensationFrames();
            obr_dry_delay_line_.assign(
                static_cast<size_t>(dry_delay_frames) * 2u,
                0.0f
            );
        } catch (...) {
            mixer_original_scratch_.clear();
            mixer_work_scratch_.clear();
            stereo_dry_scratch_.clear();
            stereo_aligned_dry_scratch_.clear();
            obr_dry_delay_line_.clear();
            mixer_bypass_reason_.store(FE_AUDIO_MIXER_BYPASS_SCRATCH_UNAVAILABLE);
            mixer_last_result_.store(E_OUTOFMEMORY);
        }
        if (!mixer_work_scratch_.empty()) {
            const bool mixer_ready = rust_mixer_.Initialize(sample_rate_);
            mixer_available_.store(mixer_ready);
            mixer_last_result_.store(rust_mixer_.LastResult());
            mixer_bypass_reason_.store(rust_mixer_.BypassReason());
            if (mixer_ready) {
                FeRustMixerStatus mixer_status{};
                if (rust_mixer_.GetStatus(&mixer_status)) {
                    mixer_enabled_.store(mixer_status.enabled != 0);
                    mixer_active_revision_.store(mixer_status.active_revision);
                    mixer_staged_revision_.store(mixer_status.staged_revision);
                }
            }
        }
        const HRESULT spatial_result = RebuildSpatialModules();
        if (FAILED(spatial_result)) return RememberFailure(spatial_result);

        if (mode_ != FE_AUDIO_MODE_DRY) {
            result = RefreshSpatialCacheIfNeeded();
            if (FAILED(result)) return RememberFailure(result);
        }

        running_.store(true);
        renderer_ready_.store(
            !SpatialObrEnabled()
                || (obr_renderer_ != nullptr && obr_input_ != nullptr && obr_output_ != nullptr)
        );
        last_hresult_.store(S_OK);
        return S_OK;
    }

    HRESULT SetPose(const FeAudioPose& pose) {
        std::scoped_lock lock(pose_mutex_);
        pose_ = pose;
        NormalizePose(&pose_);
        pose_revision_ += 1;
        return S_OK;
    }

    HRESULT SetMuted(bool muted) {
        muted_.store(muted);
        if (source_voice_ == nullptr) return RememberFailure(E_HANDLE);
        const HRESULT result = source_voice_->SetVolume(muted ? 0.0f : 1.0f);
        if (FAILED(result)) return RememberFailure(result);
        return S_OK;
    }

    HRESULT ResetTimeline() {
        std::lock_guard<std::mutex> spatial_guard(spatial_control_mutex_);
        if (!running_.load() || source_voice_ == nullptr || engine_ == nullptr) {
            return RememberFailure(E_HANDLE);
        }

        // The browser crossfades to its direct path before requesting this
        // reset. Mute first, then remove every buffer from the obsolete media
        // timeline. DestroyVoice is deliberately used after FlushSourceBuffers:
        // Microsoft guarantees that it returns only after the audio thread can
        // no longer read the buffers or issue callbacks, allowing the fixed
        // pool to be reclaimed without callback/pool ownership races.
        const bool was_muted = muted_.exchange(true);
        timeline_resetting_.store(true);
        HRESULT result = S_OK;
        if (!was_muted) {
            // XAudio2 has no built-in voice-volume ramp. Apply a short cosine
            // envelope from this control/API thread; the browser dry path uses
            // the complementary sine curve. Neither audio render thread waits.
            HANDLE fade_timer = CreateWaitableTimerExW(
                nullptr,
                nullptr,
                kCreateWaitableTimerHighResolution,
                TIMER_ALL_ACCESS
            );
            if (fade_timer == nullptr) {
                fade_timer = CreateWaitableTimerW(nullptr, FALSE, nullptr);
            }
            for (uint32_t step = 1; step <= kTimelineResetFadeSteps; ++step) {
                const float progress = static_cast<float>(step)
                    / static_cast<float>(kTimelineResetFadeSteps);
                const float gain = std::cos(progress * kPi * 0.5f);
                const HRESULT fade_result = source_voice_->SetVolume(gain);
                if (FAILED(fade_result)) {
                    result = fade_result;
                    break;
                }
                if (step < kTimelineResetFadeSteps && fade_timer != nullptr) {
                    LARGE_INTEGER due_time{};
                    due_time.QuadPart = -kTimelineResetFadeStepHundredNanoseconds;
                    if (SetWaitableTimer(fade_timer, &due_time, 0, nullptr, nullptr, FALSE)) {
                        (void)WaitForSingleObject(fade_timer, 10);
                    }
                }
            }
            if (fade_timer != nullptr) CloseHandle(fade_timer);
        } else {
            result = source_voice_->SetVolume(0.0f);
        }
        const HRESULT stop_result = source_voice_->Stop(0);
        if (FAILED(stop_result) && SUCCEEDED(result)) result = stop_result;
        const HRESULT flush_result = source_voice_->FlushSourceBuffers();
        if (FAILED(flush_result) && SUCCEEDED(result)) result = flush_result;
        source_voice_->DestroyVoice();
        source_voice_ = nullptr;

        {
            std::scoped_lock lock(buffer_mutex_);
            free_buffers_.clear();
            for (const auto& buffer : buffer_pool_) {
                buffer->in_use = false;
                free_buffers_.push_back(buffer.get());
            }
            buffers_queued_.store(0);
        }
        buffer_available_cv_.notify_all();
        voice_started_.store(false);
        queue_underruns_.store(0);
        dropped_buffers_.store(0);
        buffer_pool_exhaustions_.store(0);
        output_energy_.store(0.0f);
        output_limiter_gain_ = 1.0f;
        std::fill(obr_dry_delay_line_.begin(), obr_dry_delay_line_.end(), 0.0f);
        obr_dry_delay_cursor_ = 0;

        if (rust_mixer_.Ready()) {
            const int32_t mixer_reset = rust_mixer_.Reset();
            if (mixer_reset != FE_RUST_MIXER_OK && SUCCEEDED(result)) {
                result = mixer_reset;
            }
        }
        // OBR convolution history belongs to the old media position. Rebuild
        // only the temporal spatial modules; the committed Mixer parameters,
        // route revision, graph and preallocated transport pool stay intact.
        const HRESULT spatial_result = RebuildSpatialModules();
        if (FAILED(spatial_result) && SUCCEEDED(result)) result = spatial_result;

        const WORD source_channels = mode_ == FE_AUDIO_MODE_X3D_SPEAKER ? 1 : 2;
        WAVEFORMATEX format{};
        format.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
        format.nChannels = source_channels;
        format.nSamplesPerSec = sample_rate_;
        format.wBitsPerSample = 32;
        format.nBlockAlign = static_cast<WORD>(source_channels * sizeof(float));
        format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;
        const HRESULT voice_result = engine_->CreateSourceVoice(
            &source_voice_,
            &format,
            mode_ == FE_AUDIO_MODE_X3D_SPEAKER ? XAUDIO2_VOICE_USEFILTER : 0,
            XAUDIO2_DEFAULT_FREQ_RATIO,
            &callback_
        );
        if (FAILED(voice_result) || source_voice_ == nullptr) {
            timeline_resetting_.store(false);
            running_.store(false);
            return RememberFailure(FAILED(voice_result) ? voice_result : E_FAIL);
        }
        const HRESULT mute_result = source_voice_->SetVolume(0.0f);
        timeline_resetting_.store(false);
        if (FAILED(mute_result)) return RememberFailure(mute_result);
        if (FAILED(result)) return RememberFailure(result);
        last_hresult_.store(S_OK);
        return S_OK;
    }

    int32_t SetMixerParams(
        uint64_t revision,
        const FeRustMixerParams* params,
        uint32_t ramp_frames
    ) {
        if (!IsValidMixerParams(params)) return FE_RUST_MIXER_INVALID_ARGUMENT;
        // All control publication follows spatial -> mixer lock order. Submit
        // owns the spatial lock for a render batch, so a staged Mixer cannot
        // race the zero-crossing commit below.
        std::lock_guard<std::mutex> spatial_guard(spatial_control_mutex_);
        std::lock_guard<std::mutex> control_guard(mixer_control_mutex_);
        if (!mixer_available_.load() || !rust_mixer_.Ready()) {
            mixer_last_result_.store(FE_RUST_MIXER_UNSUPPORTED);
            return FE_RUST_MIXER_UNSUPPORTED;
        }

        const bool matching_spatial_snapshot = spatial_transition_pending_
            && revision == spatial_pending_revision_;
        if (spatial_transition_pending_ && !matching_spatial_snapshot) {
            // JNI publishes spatial first. Reject a stale/out-of-order Mixer
            // snapshot instead of pairing it with the wrong route revision.
            mixer_last_result_.store(FE_RUST_MIXER_INVALID_REVISION);
            return FE_RUST_MIXER_INVALID_REVISION;
        }

        if (matching_spatial_snapshot) {
            const bool exact_already_committed = mixer_committed_params_present_
                && revision == mixer_active_revision_.load()
                && std::memcmp(
                    &mixer_committed_params_,
                    params,
                    sizeof(FeRustMixerParams)
                ) == 0;
            if (exact_already_committed) return FE_RUST_MIXER_OK;
            const bool exact_pending_retry = mixer_pending_params_present_
                && revision == mixer_pending_revision_
                && std::memcmp(
                    &mixer_pending_params_,
                    params,
                    sizeof(FeRustMixerParams)
                ) == 0;
            if (exact_pending_retry) {
                // Stage succeeded before a deterministic/publication BUSY, or
                // the render-boundary commit failed. The Rust staged snapshot
                // is normally still intact. If a non-BUSY implementation
                // failure discarded it, reconstruct the same revision before
                // authorizing another zero-crossing attempt.
                FeRustMixerStatus retry_status{};
                int32_t retry_result = FE_RUST_MIXER_OK;
                if (!rust_mixer_.GetStatus(&retry_status)
                    || retry_status.staged_revision != revision) {
                    retry_result = rust_mixer_.Stage(revision, params);
                    (void)rust_mixer_.GetStatus(&retry_status);
                }
                mixer_active_revision_.store(retry_status.active_revision);
                mixer_staged_revision_.store(retry_status.staged_revision);
                mixer_pending_ready_ = retry_result == FE_RUST_MIXER_OK
                    && retry_status.staged_revision == revision;
                if (!mixer_pending_ready_ && retry_result == FE_RUST_MIXER_OK) {
                    retry_result = FE_RUST_MIXER_PANIC;
                }
                mixer_last_result_.store(retry_result);
                if (!mixer_pending_ready_) return retry_result;
                if (spatial_transition_retry_required_) {
                    spatial_transition_retry_requested_ = true;
                    MaybeArmSpatialRetry();
                }
                return retry_result;
            }

            const int32_t result = rust_mixer_.Stage(revision, params);
            mixer_last_result_.store(result);
            FeRustMixerStatus rust_status{};
            const bool have_status = rust_mixer_.GetStatus(&rust_status);
            if (have_status) {
                mixer_enabled_.store(rust_status.enabled != 0);
                mixer_active_revision_.store(rust_status.active_revision);
                mixer_staged_revision_.store(rust_status.staged_revision);
            }
            // A probe BUSY is injected after a successful stage, matching the
            // real Rust commit contract where BUSY preserves staged_revision.
            if ((result == FE_RUST_MIXER_OK || result == FE_RUST_MIXER_BUSY)
                && have_status
                && rust_status.staged_revision == revision) {
                mixer_pending_params_ = *params;
                mixer_pending_revision_ = revision;
                mixer_pending_ramp_frames_ = ramp_frames;
                mixer_pending_params_present_ = true;
                mixer_pending_ready_ = result == FE_RUST_MIXER_OK;
            }
            return result;
        }

        const bool exact_active_retry = mixer_committed_params_present_
            && revision == mixer_active_revision_.load()
            && std::memcmp(
                &mixer_committed_params_,
                params,
                sizeof(FeRustMixerParams)
            ) == 0;
        const int32_t result = exact_active_retry
            ? FE_RUST_MIXER_OK
            : rust_mixer_.StageAndCommit(revision, params, ramp_frames);
        mixer_last_result_.store(result);
        FeRustMixerStatus rust_status{};
        if (rust_mixer_.GetStatus(&rust_status)) {
            mixer_enabled_.store(rust_status.enabled != 0);
            mixer_active_revision_.store(rust_status.active_revision);
            mixer_staged_revision_.store(rust_status.staged_revision);
        }
        if (result == FE_RUST_MIXER_OK) {
            mixer_committed_params_ = *params;
            mixer_committed_params_present_ = true;
            mixer_failure_disabled_.store(false);
            mixer_consecutive_failures_.store(0);
            mixer_active_.store(false);
            mixer_bypass_reason_.store(
                params->enabled != 0
                    ? FE_AUDIO_MIXER_BYPASS_NONE
                    : FE_AUDIO_MIXER_BYPASS_DISABLED
            );
        }
        return result;
    }

    int32_t SetSpatialControls(
        uint64_t revision,
        const FeAudioSpatialControlParams* params,
        uint32_t ramp_frames
    ) {
        if (!IsValidSpatialControls(params)) return FE_RUST_MIXER_INVALID_ARGUMENT;
        std::lock_guard<std::mutex> spatial_guard(spatial_control_mutex_);
        const uint64_t active_revision = spatial_active_revision_.load();
        const bool exact_active_retry = spatial_committed_params_present_
            && !spatial_transition_pending_
            && revision == active_revision
            && std::memcmp(&spatial_controls_, params, sizeof(*params)) == 0;
        const bool exact_pending_retry = spatial_transition_pending_
            && revision == spatial_pending_revision_
            && std::memcmp(&spatial_pending_controls_, params, sizeof(*params)) == 0;
        const bool exact_retry = exact_active_retry || exact_pending_retry;
        if (exact_retry) {
            if (exact_pending_retry && spatial_transition_retry_required_) {
                spatial_transition_retry_requested_ = true;
                MaybeArmSpatialRetry();
            }
            return FE_RUST_MIXER_OK;
        }
        const uint64_t newest_revision = std::max(
            active_revision,
            spatial_transition_pending_ ? spatial_pending_revision_ : 0u
        );
        if (spatial_committed_params_present_ && revision <= newest_revision) {
            return FE_RUST_MIXER_INVALID_REVISION;
        }

        spatial_pending_controls_ = *params;
        spatial_pending_revision_ = revision;
        const uint32_t requested_frames = ramp_frames == 0
            ? sample_rate_ / 50u
            : ramp_frames;
        const uint32_t transition_frames = std::clamp(
            requested_frames,
            sample_rate_ * 15u / 1000u,
            sample_rate_ * 25u / 1000u
        );
        spatial_transition_half_frames_ = std::max(1u, transition_frames / 2u);
        spatial_transition_frame_ = 0;
        spatial_transition_phase_ = SpatialTransitionPhase::kFadeOut;
        spatial_transition_pending_ = true;
        spatial_transition_retry_required_ = false;
        spatial_transition_retry_requested_ = false;
        spatial_transition_reason_.store(
            mixer_active_revision_.load() == revision
                ? FE_AUDIO_SPATIAL_TRANSITION_USER_CONTROL
                : FE_AUDIO_SPATIAL_TRANSITION_WAITING_FOR_MIXER
        );
        spatial_ramp_frames_.store(transition_frames);
        spatial_committed_params_present_ = true;
        return FE_RUST_MIXER_OK;
    }

    int32_t SetChannelRouterParams(
        uint64_t revision,
        const FeRustChannelRouterParams* params,
        uint32_t ramp_frames
    ) {
        if (params == nullptr
            || params->struct_size < sizeof(*params)
            || params->abi_version != FE_RUST_CHANNEL_ROUTER_ABI_VERSION
            || (params->output_channels != 6 && params->output_channels != 8)) {
            return FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
        }
        std::lock_guard<std::mutex> spatial_guard(spatial_control_mutex_);
        const bool targets_effective_layout = SpatialUpmixEnabled()
            && params->output_channels == virtual_channels_;
        const bool targets_pending_layout = spatial_transition_pending_
            && spatial_pending_controls_.upmix_enabled != 0
            && params->output_channels
                == spatial_pending_controls_.upmix_output_channels;
        if (!targets_effective_layout && !targets_pending_layout) {
            return FE_RUST_CHANNEL_ROUTER_UNSUPPORTED;
        }
        const bool exact_pending_retry = channel_router_pending_params_present_
            && revision == channel_router_pending_revision_
            && std::memcmp(
                &channel_router_pending_params_,
                params,
                sizeof(*params)
            ) == 0;
        if (exact_pending_retry) return FE_RUST_CHANNEL_ROUTER_OK;
        const bool exact_retry = channel_router_params_present_
            && revision == channel_router_revision_
            && std::memcmp(&channel_router_params_, params, sizeof(*params)) == 0;
        if (exact_retry) return FE_RUST_CHANNEL_ROUTER_OK;
        const uint64_t newest_revision = std::max(
            channel_router_params_present_ ? channel_router_revision_ : 0u,
            channel_router_pending_params_present_
                ? channel_router_pending_revision_
                : 0u
        );
        const bool same_revision_peer_layout = !targets_effective_layout
            && targets_pending_layout
            && channel_router_params_present_
            && revision == channel_router_revision_
            && params->output_channels != channel_router_params_.output_channels
            && (!channel_router_pending_params_present_
                || channel_router_pending_revision_ < revision);
        if (revision < newest_revision
            || (revision == newest_revision && !same_revision_peer_layout)) {
            return FE_RUST_CHANNEL_ROUTER_INVALID_REVISION;
        }

        if (!targets_effective_layout) {
            // A 5.1 -> 7.1 (or reverse) change fades and rebuilds at an audio
            // block boundary. Preserve the new layout's explicit channel
            // snapshot beside the still-active graph; CommitPendingSpatialControls
            // installs it only when the matching spatial/Mixer pair commits.
            // This prevents the UI-visible 7.1 state from silently falling
            // back to the built-in matrix during the transition.
            channel_router_pending_params_ = *params;
            channel_router_pending_revision_ = revision;
            channel_router_pending_ramp_frames_ = ramp_frames;
            channel_router_pending_params_present_ = true;
            return FE_RUST_CHANNEL_ROUTER_OK;
        }
        if (!rust_channel_router_.Ready()
            || rust_channel_router_.OutputChannels() != params->output_channels) {
            if (!rust_channel_router_.Initialize(sample_rate_, params->output_channels)) {
                return rust_channel_router_.LastResult();
            }
        }
        const int32_t result = rust_channel_router_.StageAndCommit(
            revision,
            params,
            ramp_frames
        );
        if (result != FE_RUST_CHANNEL_ROUTER_OK) return result;
        try {
            const size_t stereo_samples = static_cast<size_t>(kFramesPerTransportBatch) * 2u;
            const size_t bed_samples = static_cast<size_t>(kFramesPerTransportBatch)
                * params->output_channels;
            if (rust_stereo_scratch_.size() < stereo_samples) {
                rust_stereo_scratch_.assign(stereo_samples, 0.0f);
            }
            if (rust_upmix_scratch_.size() < bed_samples) {
                rust_upmix_scratch_.assign(bed_samples, 0.0f);
            }
        } catch (...) {
            return E_OUTOFMEMORY;
        }
        channel_router_params_ = *params;
        channel_router_revision_ = revision;
        channel_router_params_present_ = true;
        channel_router_active_ = true;
        rust_upmix_active_.store(true);
        rust_upmix_last_result_.store(FE_RUST_CHANNEL_ROUTER_OK);
        return FE_RUST_CHANNEL_ROUTER_OK;
    }

    int32_t ProcessChannelRouter(
        const float* input,
        uint32_t frames,
        float* output,
        uint32_t output_capacity_samples
    ) {
        if (input == nullptr || output == nullptr || frames == 0) {
            return FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
        }
        std::lock_guard<std::mutex> spatial_guard(spatial_control_mutex_);
        if (!channel_router_active_ || !rust_channel_router_.Ready()) {
            return FE_RUST_CHANNEL_ROUTER_UNSUPPORTED;
        }
        return rust_channel_router_.Process(
            input,
            frames,
            output,
            output_capacity_samples
        );
    }

    int32_t GetChannelRouterStatus(FeRustChannelRouterStatus* status) const {
        if (status == nullptr
            || status->struct_size < sizeof(*status)
            || status->abi_version != FE_RUST_CHANNEL_ROUTER_ABI_VERSION) {
            return FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
        }
        std::lock_guard<std::mutex> spatial_guard(spatial_control_mutex_);
        if (!channel_router_active_ || !rust_channel_router_.Ready()) {
            *status = {};
            status->struct_size = sizeof(*status);
            status->abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
            status->last_result = FE_RUST_CHANNEL_ROUTER_UNSUPPORTED;
            return FE_RUST_CHANNEL_ROUTER_UNSUPPORTED;
        }
        return rust_channel_router_.GetStatus(status);
    }

    int32_t GenerateChannelTestSignal(
        const FeRustTestSignalConfig* config,
        FeRustTestSignalState* state,
        uint32_t frames,
        float* output,
        uint32_t output_capacity_samples
    ) const {
        if (config == nullptr || state == nullptr || output == nullptr || frames == 0) {
            return FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
        }
        std::lock_guard<std::mutex> spatial_guard(spatial_control_mutex_);
        if (!channel_router_active_ || !rust_channel_router_.Ready()) {
            return FE_RUST_CHANNEL_ROUTER_UNSUPPORTED;
        }
        return rust_channel_router_.GenerateTestSignal(
            config,
            state,
            frames,
            output,
            output_capacity_samples
        );
    }

    int32_t QueueChannelTestSignal(
        const FeRustTestSignalConfig* config,
        uint32_t frame_count
    ) {
        if (config == nullptr
            || config->struct_size < sizeof(*config)
            || config->abi_version != FE_RUST_CHANNEL_ROUTER_ABI_VERSION
            || frame_count == 0
            || frame_count > sample_rate_ * 2u) {
            return FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
        }
        std::lock_guard<std::mutex> spatial_guard(spatial_control_mutex_);
        if (!running_.load()
            || source_voice_ == nullptr
            || mode_ != FE_AUDIO_MODE_OBR_BINAURAL
            || spatial_transition_pending_
            || !channel_router_active_
            || !rust_channel_router_.Ready()
            || config->sample_rate != sample_rate_
            || config->output_channels != virtual_channels_
            || !SpatialUpmixEnabled()) {
            return spatial_transition_pending_
                ? FE_RUST_CHANNEL_ROUTER_BUSY
                : FE_RUST_CHANNEL_ROUTER_UNSUPPORTED;
        }

        std::array<float, kFramesPerRenderBlock * FE_RUST_CHANNEL_ROUTER_MAX_CHANNELS>
            generated{};
        std::array<float, kFramesPerRenderBlock * 2u> silent_stereo{};
        FeRustTestSignalState state{};
        uint32_t offset = 0;
        while (offset < frame_count) {
            const uint32_t frames_this_block = std::min(
                kFramesPerRenderBlock,
                frame_count - offset
            );
            {
                std::unique_lock wait_lock(queue_wait_mutex_);
                const bool queue_ready = buffer_available_cv_.wait_for(
                    wait_lock,
                    std::chrono::milliseconds(250),
                    [this]() {
                        return !running_.load()
                            || buffers_queued_.load() < max_queued_buffers_;
                    }
                );
                if (!queue_ready || !running_.load()) {
                    return FE_RUST_CHANNEL_ROUTER_BUSY;
                }
            }
            QueuedAudioBuffer* rendered = AcquireBuffer();
            if (rendered == nullptr) return FE_RUST_CHANNEL_ROUTER_BUSY;

            const uint32_t generated_samples = frames_this_block * virtual_channels_;
            const int32_t generated_result = rust_channel_router_.GenerateTestSignal(
                config,
                &state,
                frames_this_block,
                generated.data(),
                generated_samples
            );
            if (generated_result != FE_RUST_CHANNEL_ROUTER_OK) {
                ReleaseBuffer(rendered);
                return generated_result;
            }
            if (rust_upmix_scratch_.size() < generated_samples) {
                ReleaseBuffer(rendered);
                return FE_RUST_CHANNEL_ROUTER_UNSUPPORTED;
            }
            std::copy_n(
                generated.data(),
                generated_samples,
                rust_upmix_scratch_.data()
            );
            const HRESULT render_result = RenderSpatialBlock(
                silent_stereo.data(),
                frames_this_block,
                0,
                true,
                &rendered->samples
            );
            if (FAILED(render_result)) {
                ReleaseBuffer(rendered);
                return FE_RUST_CHANNEL_ROUTER_PANIC;
            }
            const HRESULT queue_result = QueueRenderedBlock(rendered);
            if (FAILED(queue_result)) return FE_RUST_CHANNEL_ROUTER_BUSY;
            frames_processed_.fetch_add(frames_this_block);
            offset += frames_this_block;
        }
        return FE_RUST_CHANNEL_ROUTER_OK;
    }

    HRESULT Submit(const float* interleaved_pcm, uint32_t frame_count) {
        if (interleaved_pcm == nullptr || frame_count == 0) return E_INVALIDARG;
        if (!running_.load() || source_voice_ == nullptr) return E_HANDLE;

        std::lock_guard<std::mutex> spatial_guard(spatial_control_mutex_);

        const bool submission_rust_upmixed = SpatialUpmixEnabled()
            && frame_count <= kFramesPerTransportBatch
            && TryRustUpmixBlock(interleaved_pcm, frame_count);
        const uint64_t submission_upmix_generation = upmix_generation_;
        uint32_t source_offset = 0;
        while (source_offset < frame_count) {
            const uint32_t frames_this_block = std::min(
                kFramesPerRenderBlock,
                frame_count - source_offset
            );
            {
                std::unique_lock wait_lock(queue_wait_mutex_);
                const bool queue_ready = buffer_available_cv_.wait_for(
                    wait_lock,
                    std::chrono::milliseconds(250),
                    [this]() {
                        return !running_.load()
                            || buffers_queued_.load() < max_queued_buffers_;
                    }
                );
                if (!queue_ready || !running_.load()) {
                    dropped_buffers_.fetch_add(1);
                    return HRESULT_FROM_WIN32(ERROR_TIMEOUT);
                }
            }
            if (buffers_queued_.load() >= max_queued_buffers_) {
                dropped_buffers_.fetch_add(1);
                return HRESULT_FROM_WIN32(ERROR_RETRY);
            }

            QueuedAudioBuffer* rendered = AcquireBuffer();
            if (rendered == nullptr) {
                dropped_buffers_.fetch_add(1);
                return HRESULT_FROM_WIN32(ERROR_RETRY);
            }
            const float* block = interleaved_pcm
                + static_cast<size_t>(source_offset) * input_channels_;
            // A transition may rebuild/clear the upmix scratch at the end of
            // any 256-frame render block. The generation guard preserves the
            // one-Rust-call-per-transport fast path without carrying stale
            // scratch ownership into the next effective route.
            const bool block_rust_upmixed = submission_rust_upmixed
                && submission_upmix_generation == upmix_generation_
                && SpatialUpmixEnabled();
            HRESULT result = S_OK;
            if (mode_ == FE_AUDIO_MODE_OBR_BINAURAL) {
                result = RenderSpatialBlock(
                    block,
                    frames_this_block,
                    source_offset,
                    block_rust_upmixed,
                    &rendered->samples
                );
            } else if (mode_ == FE_AUDIO_MODE_X3D_SPEAKER) {
                result = RenderX3dSpeakerBlock(block, frames_this_block, &rendered->samples);
            } else {
                result = RenderDryBlock(block, frames_this_block, &rendered->samples);
            }
            if (FAILED(result)) {
                ReleaseBuffer(rendered);
                return RememberFailure(result);
            }

            result = QueueRenderedBlock(rendered);
            if (FAILED(result)) return RememberFailure(result);
            frames_processed_.fetch_add(frames_this_block);
            source_offset += frames_this_block;
        }
        return S_OK;
    }

    void GetStatus(FeAudioPipelineStatus* status) const {
        std::lock_guard<std::mutex> spatial_guard(spatial_control_mutex_);
        status->struct_size = sizeof(*status);
        status->abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
        status->mode = static_cast<uint32_t>(mode_);
        status->running = running_.load() ? 1u : 0u;
        status->renderer_ready = renderer_ready_.load() ? 1u : 0u;
        status->sample_rate = sample_rate_;
        status->input_channels = input_channels_;
        status->renderer_input_channels = mode_ == FE_AUDIO_MODE_OBR_BINAURAL
            ? SpatialBedChannels()
            : (mode_ == FE_AUDIO_MODE_X3D_SPEAKER ? 1u : 2u);
        status->output_channels = mode_ == FE_AUDIO_MODE_X3D_SPEAKER
            ? output_channels_
            : 2u;
        status->buffers_queued = buffers_queued_.load();
        status->buffers_submitted = buffers_submitted_.load();
        status->buffers_consumed = buffers_consumed_.load();
        status->frames_processed = frames_processed_.load();
        status->dropped_buffers = dropped_buffers_.load();
        status->obr_process_calls = obr_process_calls_.load();
        status->x3d_calculate_calls = x3d_calculate_calls_.load();
        status->rust_upmix_process_calls = rust_upmix_process_calls_.load();
        status->rust_upmix_fallback_blocks = rust_upmix_fallback_blocks_.load();
        status->rust_upmix_active = rust_upmix_active_.load() ? 1u : 0u;
        status->rust_upmix_last_result = rust_upmix_last_result_.load();
        status->output_energy = output_energy_.load();
        status->x3d_matrix_left = x3d_matrix_left_.load();
        status->x3d_matrix_right = x3d_matrix_right_.load();
        status->last_hresult = last_hresult_.load();
        status->queue_underruns = queue_underruns_.load();
        status->buffer_pool_exhaustions = buffer_pool_exhaustions_.load();
        status->voice_started = voice_started_.load() ? 1u : 0u;
        status->preroll_target_buffers = preroll_target_buffers_;
        status->upmix_enabled = SpatialUpmixEnabled() ? 1u : 0u;
        status->obr_enabled = SpatialObrEnabled() ? 1u : 0u;
        status->obr_filter_profile = spatial_controls_.obr_filter_profile;
        status->spatial_renderer_input_channels = SpatialBedChannels();
        status->spatial_active_revision = spatial_active_revision_.load();
        status->virtual_bed_channels = mode_ == FE_AUDIO_MODE_OBR_BINAURAL
            ? SpatialBedChannels()
            : status->renderer_input_channels;
        status->physical_output_channels = status->output_channels;
        status->binaural_output = SpatialObrEnabled() ? 1u : 0u;
        status->physical_multichannel = mode_ == FE_AUDIO_MODE_OBR_BINAURAL
            ? 0u
            : (status->output_channels > 2 ? 1u : 0u);
        status->spatial_route = CurrentSpatialRoute();
        status->transition_pending = spatial_transition_pending_ ? 1u : 0u;
        status->transition_reason = spatial_transition_reason_.load();
        status->spatial_pending_revision = spatial_transition_pending_
            ? spatial_pending_revision_
            : spatial_active_revision_.load();
        status->mixer_process_calls = mixer_process_calls_.load();
        status->upmix_effective = SpatialUpmixEnabled() && rust_upmix_active_.load() ? 1u : 0u;
        status->obr_effective = SpatialObrEnabled() && renderer_ready_.load() ? 1u : 0u;
        status->minimum_object_azimuth = 0.0f;
        status->maximum_object_azimuth = 0.0f;
        status->maximum_object_target_error = 0.0f;
        status->object_position_updates = object_position_updates_.load();
        if (obr_applied_position_count_ > 0) {
            const auto expected = EffectiveLayoutAzimuths(obr_applied_position_count_);
            status->minimum_object_azimuth = obr_applied_azimuths_[0];
            status->maximum_object_azimuth = obr_applied_azimuths_[0];
            for (uint32_t channel = 0; channel < obr_applied_position_count_; ++channel) {
                const float actual = obr_applied_azimuths_[channel];
                const float target = std::remainder(
                    expected[channel] * spatial_controls_.obr_spatial_width,
                    360.0f
                );
                status->minimum_object_azimuth = std::min(
                    status->minimum_object_azimuth,
                    actual
                );
                status->maximum_object_azimuth = std::max(
                    status->maximum_object_azimuth,
                    actual
                );
                status->maximum_object_target_error = std::max(
                    status->maximum_object_target_error,
                    std::abs(std::remainder(actual - target, 360.0f))
                );
            }
        }
    }

    void GetMixerStatus(FeAudioMixerPipelineStatus* status) const {
        std::lock_guard<std::mutex> spatial_guard(spatial_control_mutex_);
        status->struct_size = sizeof(*status);
        status->abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
        status->available = mixer_available_.load() ? 1u : 0u;
        status->enabled = mixer_enabled_.load() ? 1u : 0u;
        status->active = mixer_active_.load() ? 1u : 0u;
        status->failure_disabled = mixer_failure_disabled_.load() ? 1u : 0u;
        status->bypass_reason = mixer_bypass_reason_.load();
        status->last_result = mixer_last_result_.load();
        status->mixer_process_calls = mixer_process_calls_.load();
        status->mixer_bypassed_blocks = mixer_bypassed_blocks_.load();
        status->mixer_process_failures = mixer_process_failures_.load();
        status->mixer_consecutive_failures = mixer_consecutive_failures_.load();
        status->mixer_partial_failure_bypasses = mixer_partial_failure_bypasses_.load();
        status->active_revision = mixer_active_revision_.load();
        status->staged_revision = mixer_staged_revision_.load();
        status->rust_upmix_process_calls = rust_upmix_process_calls_.load();
        status->rust_upmix_fallback_blocks = rust_upmix_fallback_blocks_.load();
        status->obr_process_calls = obr_process_calls_.load();
        status->last_upmix_ordinal = last_upmix_ordinal_.load();
        status->last_mixer_ordinal = last_mixer_ordinal_.load();
        status->last_obr_ordinal = last_obr_ordinal_.load();
        status->rust_upmix_active = rust_upmix_active_.load() ? 1u : 0u;
        status->rust_upmix_last_result = rust_upmix_last_result_.load();
        status->renderer_ready = renderer_ready_.load() ? 1u : 0u;
        status->pipeline_last_result = last_hresult_.load();
        status->upmix_enabled = SpatialUpmixEnabled() ? 1u : 0u;
        status->obr_enabled = SpatialObrEnabled() ? 1u : 0u;
        status->obr_filter_profile = spatial_controls_.obr_filter_profile;
        status->spatial_renderer_input_channels = SpatialBedChannels();
        status->spatial_active_revision = spatial_active_revision_.load();
        status->virtual_bed_channels = SpatialBedChannels();
        status->physical_output_channels = mode_ == FE_AUDIO_MODE_X3D_SPEAKER
            ? output_channels_
            : 2u;
        status->binaural_output = SpatialObrEnabled() ? 1u : 0u;
        status->physical_multichannel = mode_ == FE_AUDIO_MODE_OBR_BINAURAL
            ? 0u
            : (status->physical_output_channels > 2 ? 1u : 0u);
        status->spatial_route = CurrentSpatialRoute();
        status->transition_pending = spatial_transition_pending_ ? 1u : 0u;
        status->transition_reason = spatial_transition_reason_.load();
        status->spatial_pending_revision = spatial_transition_pending_
            ? spatial_pending_revision_
            : spatial_active_revision_.load();
        status->upmix_effective = SpatialUpmixEnabled() && rust_upmix_active_.load() ? 1u : 0u;
        status->obr_effective = SpatialObrEnabled() && renderer_ready_.load() ? 1u : 0u;
    }

    void OnBufferEnd(QueuedAudioBuffer* buffer) {
        if (!ReleaseBuffer(buffer)) return;
        const uint32_t queued_before = buffers_queued_.fetch_sub(1);
        if (queued_before == 0) {
            buffers_queued_.store(0);
        } else if (
            queued_before == 1
            && running_.load()
            && voice_started_.load()
            && !timeline_resetting_.load()
        ) {
            queue_underruns_.fetch_add(1);
        }
        buffers_consumed_.fetch_add(1);
        buffer_available_cv_.notify_one();
    }

    void OnVoiceError(HRESULT error) {
        RememberFailure(error);
        running_.store(false);
    }

private:
    static uint32_t NormalizeVirtualChannels(uint32_t channels) {
        if (channels == 6 || channels == 8) return channels;
        return 2;
    }

    bool SpatialUpmixEnabled() const {
        return mode_ == FE_AUDIO_MODE_OBR_BINAURAL
            && spatial_controls_.upmix_enabled != 0;
    }

    bool SpatialObrEnabled() const {
        return mode_ == FE_AUDIO_MODE_OBR_BINAURAL
            && spatial_controls_.obr_enabled != 0;
    }

    uint32_t SpatialBedChannels() const {
        return SpatialUpmixEnabled() ? virtual_channels_ : 2u;
    }

    uint32_t CurrentSpatialRoute() const {
        if (SpatialUpmixEnabled()) {
            return SpatialObrEnabled()
                ? FE_AUDIO_ROUTE_UPMIX_MIXER_X3D_OBR
                : FE_AUDIO_ROUTE_UPMIX_MIXER_NON_OBR_OUT;
        }
        return SpatialObrEnabled()
            ? FE_AUDIO_ROUTE_STEREO_MIXER_OBR
            : FE_AUDIO_ROUTE_STEREO_MIXER_OUT;
    }

    HRESULT RebuildSpatialModules() {
        // Invalidates any transport-batch scratch captured by Submit. This is
        // advanced even when rebuilding later fails because the vectors below
        // are cleared before the failure is known.
        upmix_generation_ += 1;
        virtual_channels_ = spatial_controls_.upmix_output_channels;
        rust_upmix_active_.store(false);
        rust_upmixer_.Shutdown();
        rust_channel_router_.Shutdown();
        channel_router_active_ = false;
        rust_stereo_scratch_.clear();
        rust_upmix_scratch_.clear();

        if (channel_router_params_present_
            && channel_router_params_.output_channels != virtual_channels_) {
            // An explicit per-channel/custom snapshot belongs to one canonical
            // layout. Never reinterpret its rows after a 5.1/7.1 switch.
            channel_router_params_present_ = false;
        }
        bool legacy_upmix_ready = false;
        bool channel_router_ready = false;
        if (SpatialUpmixEnabled() && (input_channels_ == 1 || input_channels_ == 2)) {
            const bool should_initialize_channel_router = channel_router_params_present_
                || SpatialAlgorithmUsesChannelRouter(spatial_controls_);
            if (should_initialize_channel_router
                && rust_channel_router_.Initialize(sample_rate_, virtual_channels_)) {
                const FeRustChannelRouterParams router_params = channel_router_params_present_
                    ? channel_router_params_
                    : ChannelRouterParamsFromSpatial(spatial_controls_);
                // A fresh handle starts at revision zero. Preserve the
                // caller-visible revision when restoring an explicit custom
                // snapshot across an OBR/spatial route rebuild; otherwise an
                // exact retry would report success while status stayed at the
                // internal bootstrap revision.
                const uint64_t bootstrap_revision = channel_router_params_present_
                    ? std::max<uint64_t>(1, channel_router_revision_)
                    : 1;
                channel_router_ready = rust_channel_router_.StageAndCommit(
                    bootstrap_revision,
                    &router_params,
                    0
                ) == FE_RUST_CHANNEL_ROUTER_OK;
            }
            channel_router_active_ = channel_router_ready;
            legacy_upmix_ready = rust_upmixer_.Initialize(sample_rate_, spatial_controls_);
            rust_upmix_active_.store(legacy_upmix_ready || channel_router_ready);
            rust_upmix_last_result_.store(
                channel_router_ready
                    ? rust_channel_router_.LastResult()
                    : rust_upmixer_.LastResult()
            );
            if (legacy_upmix_ready || channel_router_ready) {
                try {
                    rust_stereo_scratch_.assign(
                        static_cast<size_t>(kFramesPerTransportBatch) * 2u,
                        0.0f
                    );
                    rust_upmix_scratch_.assign(
                        static_cast<size_t>(kFramesPerTransportBatch) * virtual_channels_,
                        0.0f
                    );
                } catch (...) {
                    rust_upmixer_.Shutdown();
                    rust_channel_router_.Shutdown();
                    channel_router_active_ = false;
                    rust_upmix_active_.store(false);
                    rust_upmix_last_result_.store(E_OUTOFMEMORY);
                    return E_OUTOFMEMORY;
                }
            }
        } else {
            rust_upmix_last_result_.store(FE_RUST_UPMIX_OK);
        }

        obr_output_.reset();
        obr_input_.reset();
        obr_renderer_.reset();
        obr_applied_position_count_ = 0;
        std::fill(obr_dry_delay_line_.begin(), obr_dry_delay_line_.end(), 0.0f);
        obr_dry_delay_cursor_ = 0;
        if (SpatialObrEnabled()) {
            const uint32_t channels = SpatialBedChannels();
            try {
                auto renderer = std::make_unique<obr::ObrImpl>(
                    static_cast<int>(kFramesPerRenderBlock),
                    static_cast<int>(sample_rate_)
                );
                const auto profile = ToObrFilterProfile(
                    spatial_controls_.obr_filter_profile
                );
                for (uint32_t channel = 0; channel < channels; ++channel) {
                    const absl::Status status = renderer->AddAudioElement(
                        obr::AudioElementType::kObjectMono,
                        profile
                    );
                    if (!status.ok()) return E_FAIL;
                }
                obr_renderer_ = std::move(renderer);
                obr_input_ = std::make_unique<obr::AudioBuffer>(
                    channels,
                    kFramesPerRenderBlock
                );
                obr_output_ = std::make_unique<obr::AudioBuffer>(
                    2,
                    kFramesPerRenderBlock
                );
            } catch (...) {
                obr_output_.reset();
                obr_input_.reset();
                obr_renderer_.reset();
                return E_FAIL;
            }
        }

        spatial_cache_.clear();
        spatial_cache_revision_ = 0;
        spatial_cache_router_revision_ = 0;
        spatial_cache_uses_explicit_router_ = false;
        spatial_cache_generation_ = 0;
        obr_position_revision_ = 0;
        renderer_ready_.store(
            !SpatialObrEnabled()
                || (obr_renderer_ != nullptr && obr_input_ != nullptr && obr_output_ != nullptr)
        );
        return S_OK;
    }

    static void NormalizePose(FeAudioPose* pose) {
        pose->emitter_x = ClampFinite(pose->emitter_x, -1000.0f, 1000.0f, 0.0f);
        pose->emitter_y = ClampFinite(pose->emitter_y, -1000.0f, 1000.0f, 0.0f);
        pose->emitter_z = ClampFinite(pose->emitter_z, -1000.0f, 1000.0f, 1.0f);
        pose->listener_x = ClampFinite(pose->listener_x, -1000.0f, 1000.0f, 0.0f);
        pose->listener_y = ClampFinite(pose->listener_y, -1000.0f, 1000.0f, 0.0f);
        pose->listener_z = ClampFinite(pose->listener_z, -1000.0f, 1000.0f, 0.0f);
        pose->listener_front_x = ClampFinite(pose->listener_front_x, -1.0f, 1.0f, 0.0f);
        pose->listener_front_y = ClampFinite(pose->listener_front_y, -1.0f, 1.0f, 0.0f);
        pose->listener_front_z = ClampFinite(pose->listener_front_z, -1.0f, 1.0f, 1.0f);
        pose->listener_up_x = ClampFinite(pose->listener_up_x, -1.0f, 1.0f, 0.0f);
        pose->listener_up_y = ClampFinite(pose->listener_up_y, -1.0f, 1.0f, 1.0f);
        pose->listener_up_z = ClampFinite(pose->listener_up_z, -1.0f, 1.0f, 0.0f);
    }

    HRESULT InitializeBufferPool(uint32_t output_channels) {
        try {
            std::scoped_lock lock(buffer_mutex_);
            buffer_pool_.clear();
            free_buffers_.clear();
            buffer_pool_.reserve(max_queued_buffers_);
            free_buffers_.reserve(max_queued_buffers_);
            const size_t sample_count = static_cast<size_t>(kFramesPerRenderBlock)
                * std::max<uint32_t>(1, output_channels);
            for (uint32_t index = 0; index < max_queued_buffers_; ++index) {
                auto buffer = std::make_unique<QueuedAudioBuffer>();
                buffer->samples.assign(sample_count, 0.0f);
                free_buffers_.push_back(buffer.get());
                buffer_pool_.push_back(std::move(buffer));
            }
            return S_OK;
        } catch (...) {
            buffer_pool_.clear();
            free_buffers_.clear();
            return E_OUTOFMEMORY;
        }
    }

    QueuedAudioBuffer* AcquireBuffer() {
        std::scoped_lock lock(buffer_mutex_);
        if (free_buffers_.empty()) {
            buffer_pool_exhaustions_.fetch_add(1);
            return nullptr;
        }
        QueuedAudioBuffer* buffer = free_buffers_.back();
        free_buffers_.pop_back();
        buffer->in_use = true;
        return buffer;
    }

    bool ReleaseBuffer(QueuedAudioBuffer* buffer) {
        if (buffer == nullptr) return false;
        std::scoped_lock lock(buffer_mutex_);
        const bool owned = std::any_of(
            buffer_pool_.begin(),
            buffer_pool_.end(),
            [buffer](const std::unique_ptr<QueuedAudioBuffer>& candidate) {
                return candidate.get() == buffer;
            }
        );
        if (!owned || !buffer->in_use) return false;
        buffer->in_use = false;
        free_buffers_.push_back(buffer);
        return true;
    }

    PoseSnapshot CurrentPoseSnapshot() const {
        std::scoped_lock lock(pose_mutex_);
        return {pose_, pose_revision_};
    }

    HRESULT RefreshSpatialCacheIfNeeded() {
        const PoseSnapshot snapshot = CurrentPoseSnapshot();
        const uint32_t sample_count = mode_ == FE_AUDIO_MODE_OBR_BINAURAL
            ? SpatialBedChannels()
            : 1u;
        const bool uses_explicit_router = channel_router_active_
            && channel_router_params_present_
            && channel_router_params_.output_channels == sample_count;
        const uint64_t router_revision = uses_explicit_router
            ? channel_router_revision_
            : 0u;
        if (spatial_cache_revision_ == snapshot.revision
            && spatial_cache_.size() == sample_count
            && spatial_cache_uses_explicit_router_ == uses_explicit_router
            && spatial_cache_router_revision_ == router_revision) {
            return S_OK;
        }
        try {
            std::vector<SpatialSample> refreshed;
            refreshed.reserve(sample_count);
            const auto azimuths = EffectiveLayoutAzimuths(sample_count);
            for (uint32_t channel = 0; channel < sample_count; ++channel) {
                refreshed.push_back(CalculateSpatialSample(snapshot.pose, azimuths[channel]));
            }
            spatial_cache_ = std::move(refreshed);
            spatial_cache_revision_ = snapshot.revision;
            spatial_cache_router_revision_ = router_revision;
            spatial_cache_uses_explicit_router_ = uses_explicit_router;
            spatial_cache_generation_ += 1;
            if (spatial_cache_generation_ == 0) spatial_cache_generation_ = 1;
            return S_OK;
        } catch (...) {
            return E_OUTOFMEMORY;
        }
    }

    static std::array<float, 8> LayoutAzimuths(uint32_t channels) {
        // Google OBR convention: positive azimuth is left. Canonical sample
        // order follows FFmpeg/OBS: 7.1 is FL, FR, C, LFE, BL, BR, SL, SR.
        if (channels == 6) return {30.0f, -30.0f, 0.0f, 0.0f, 110.0f, -110.0f, 0.0f, 0.0f};
        if (channels == 8) return {30.0f, -30.0f, 0.0f, 0.0f, 135.0f, -135.0f, 90.0f, -90.0f};
        return {30.0f, -30.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f};
    }

    std::array<float, 8> EffectiveLayoutAzimuths(uint32_t channels) const {
        std::array<float, 8> azimuths = LayoutAzimuths(channels);
        if (!channel_router_active_
            || !channel_router_params_present_
            || channel_router_params_.output_channels != channels) {
            return azimuths;
        }
        for (uint32_t channel = 0; channel < channels; ++channel) {
            const float requested = channel_router_params_.channel_azimuth_deg[channel];
            if (std::isfinite(requested)) {
                azimuths[channel] = std::remainder(requested, 360.0f);
            }
        }
        return azimuths;
    }

    SpatialSample CalculateSpatialSample(const FeAudioPose& pose, float layout_azimuth) {
        X3DAUDIO_LISTENER listener{};
        listener.Position = {pose.listener_x, pose.listener_y, pose.listener_z};
        listener.Velocity = {
            pose.listener_velocity_x,
            pose.listener_velocity_y,
            pose.listener_velocity_z
        };
        listener.OrientFront = {
            pose.listener_front_x,
            pose.listener_front_y,
            pose.listener_front_z
        };
        listener.OrientTop = {
            pose.listener_up_x,
            pose.listener_up_y,
            pose.listener_up_z
        };

        const float target_azimuth = std::remainder(
            layout_azimuth * spatial_controls_.obr_spatial_width,
            360.0f
        );
        const float angle = target_azimuth * kPi / 180.0f;
        X3DAUDIO_EMITTER emitter{};
        emitter.Position = mode_ == FE_AUDIO_MODE_X3D_SPEAKER
            ? X3DAUDIO_VECTOR{pose.emitter_x, pose.emitter_y, pose.emitter_z}
            : X3DAUDIO_VECTOR{
                listener.Position.x - std::sin(angle),
                listener.Position.y,
                listener.Position.z + std::cos(angle)
            };
        emitter.Velocity = {
            pose.emitter_velocity_x,
            pose.emitter_velocity_y,
            pose.emitter_velocity_z
        };
        emitter.OrientFront = {0.0f, 0.0f, 1.0f};
        emitter.OrientTop = {0.0f, 1.0f, 0.0f};
        emitter.ChannelCount = 1;
        emitter.CurveDistanceScaler = 1.0f;
        emitter.DopplerScaler = 1.0f;

        SpatialSample result{};
        result.matrix.assign(output_channels_, 0.0f);
        X3DAUDIO_DSP_SETTINGS settings{};
        settings.SrcChannelCount = 1;
        settings.DstChannelCount = output_channels_;
        settings.pMatrixCoefficients = result.matrix.data();
        X3DAudioCalculate(
            x3d_handle_,
            &listener,
            &emitter,
            X3DAUDIO_CALCULATE_MATRIX
                | X3DAUDIO_CALCULATE_DOPPLER
                | X3DAUDIO_CALCULATE_LPF_DIRECT,
            &settings
        );
        x3d_calculate_calls_.fetch_add(1);

        if (mode_ == FE_AUDIO_MODE_X3D_SPEAKER) {
            const float dx = emitter.Position.x - listener.Position.x;
            const float dy = emitter.Position.y - listener.Position.y;
            const float dz = emitter.Position.z - listener.Position.z;
            result.distance = std::max(0.05f, std::sqrt(dx * dx + dy * dy + dz * dz));
            result.azimuth = std::atan2(-dx, dz) * 180.0f / kPi;
            result.elevation = std::atan2(
                dy,
                std::sqrt(dx * dx + dz * dz)
            ) * 180.0f / kPi;
        } else {
            result.distance = 1.0f;
            result.azimuth = target_azimuth;
            result.elevation = 0.0f;
        }
        result.doppler = ClampFinite(settings.DopplerFactor, 0.5f, 2.0f, 1.0f);
        result.lpf_direct = ClampFinite(settings.LPFDirectCoefficient, 0.0f, 1.0f, 1.0f);
        float square_sum = 0.0f;
        for (const float coefficient : result.matrix) {
            square_sum += coefficient * coefficient;
        }
        result.gain = ClampFinite(
            std::sqrt(square_sum / std::max<size_t>(1, result.matrix.size())),
            0.08f,
            1.35f,
            1.0f
        );
        result.matrix_left = result.matrix.empty() ? 0.0f : result.matrix[0];
        result.matrix_right = result.matrix.size() < 2 ? result.matrix_left : result.matrix[1];
        return result;
    }

    float ReadInput(
        const float* interleaved_pcm,
        uint32_t frame,
        uint32_t requested_channel
    ) const {
        const size_t base = static_cast<size_t>(frame) * input_channels_;
        if (requested_channel < input_channels_) {
            const float sample = interleaved_pcm[base + requested_channel];
            // Preserve finite internal headroom. The linked final limiter owns
            // the sole output ceiling; an input clamp here creates distortion
            // before upmix, Mixer and OBR have a chance to manage gain.
            return std::isfinite(sample) ? sample : 0.0f;
        }
        return 0.0f;
    }

    std::pair<float, float> ReadStereo(const float* interleaved_pcm, uint32_t frame) const {
        if (input_channels_ == 1) {
            const float mono = ReadInput(interleaved_pcm, frame, 0);
            return {mono, mono};
        }
        return {
            ReadInput(interleaved_pcm, frame, 0),
            ReadInput(interleaved_pcm, frame, 1)
        };
    }

    float VirtualChannelSample(
        const float* interleaved_pcm,
        uint32_t frame,
        uint32_t channel
    ) const {
        if (input_channels_ == virtual_channels_) {
            return ReadInput(interleaved_pcm, frame, channel);
        }
        const auto [left, right] = ReadStereo(interleaved_pcm, frame);
        switch (channel) {
            case 0: return left;
            case 1: return right;
            case 2: return (left + right) * 0.5f;
            case 3: return (left + right) * 0.18f;
            // Canonical 7.1 order is FL,FR,FC,LFE,BL,BR,SL,SR. In 5.1 the
            // same slots 4/5 are SL/SR and therefore retain the side gain.
            case 4: return left * (virtual_channels_ == 8 ? 0.38f : 0.52f);
            case 5: return right * (virtual_channels_ == 8 ? 0.38f : 0.52f);
            case 6: return left * 0.52f;
            case 7: return right * 0.52f;
            default: return 0.0f;
        }
    }

    bool TryRustUpmixBlock(const float* interleaved_pcm, uint32_t frames) {
        if ((virtual_channels_ != 6 && virtual_channels_ != 8)
            || (input_channels_ != 1 && input_channels_ != 2)) {
            return false;
        }
        const bool use_channel_router = channel_router_active_
            && rust_channel_router_.Ready()
            && rust_channel_router_.OutputChannels() == virtual_channels_;
        if (!rust_upmix_active_.load()
            || (!use_channel_router && !rust_upmixer_.Ready())) {
            rust_upmix_fallback_blocks_.fetch_add(1);
            return false;
        }
        if (frames > kFramesPerTransportBatch
            || rust_stereo_scratch_.size() < static_cast<size_t>(frames) * 2
            || rust_upmix_scratch_.size() < static_cast<size_t>(frames) * virtual_channels_) {
            rust_upmix_fallback_blocks_.fetch_add(1);
            return false;
        }

        for (uint32_t frame = 0; frame < frames; ++frame) {
            const auto [left, right] = ReadStereo(interleaved_pcm, frame);
            rust_stereo_scratch_[static_cast<size_t>(frame) * 2] = left;
            rust_stereo_scratch_[static_cast<size_t>(frame) * 2 + 1] = right;
        }
        const int32_t result = use_channel_router
            ? rust_channel_router_.Process(
                rust_stereo_scratch_.data(),
                frames,
                rust_upmix_scratch_.data(),
                frames * virtual_channels_
            )
            : (rust_upmixer_.Process(
                rust_stereo_scratch_.data(),
                frames,
                rust_upmix_scratch_.data(),
                frames * virtual_channels_
            ) ? FE_RUST_UPMIX_OK : rust_upmixer_.LastResult());
        rust_upmix_last_result_.store(result);
        const bool processed = result == FE_RUST_CHANNEL_ROUTER_OK;
        if (!processed) {
            rust_upmix_fallback_blocks_.fetch_add(1);
            return false;
        }
        if (!use_channel_router && virtual_channels_ == 8) {
            // OxiMedia's legacy 7.1 vector is FL,FR,FC,LFE,SL,SR,BL,BR.
            // Normalize it at this boundary to the public FFmpeg/OBS order
            // FL,FR,FC,LFE,BL,BR,SL,SR used by Mixer, X3D and OBR.
            for (uint32_t frame = 0; frame < frames; ++frame) {
                float* row = rust_upmix_scratch_.data()
                    + static_cast<size_t>(frame) * virtual_channels_;
                std::swap(row[4], row[6]);
                std::swap(row[5], row[7]);
            }
        }
        rust_upmix_process_calls_.fetch_add(1);
        return true;
    }

    bool TryMixerBlock(uint32_t frames, uint32_t channels) {
        const size_t sample_count = static_cast<size_t>(frames) * channels;
        if (!mixer_available_.load() || !rust_mixer_.Ready()) {
            mixer_active_.store(false);
            mixer_bypassed_blocks_.fetch_add(1);
            return false;
        }
        if (!mixer_enabled_.load()) {
            mixer_active_.store(false);
            mixer_bypass_reason_.store(FE_AUDIO_MIXER_BYPASS_DISABLED);
            mixer_bypassed_blocks_.fetch_add(1);
            return false;
        }
        if (mixer_failure_disabled_.load()) {
            mixer_active_.store(false);
            mixer_bypass_reason_.store(FE_AUDIO_MIXER_BYPASS_FAILURE_DISABLED);
            mixer_bypassed_blocks_.fetch_add(1);
            return false;
        }

        mixer_process_calls_.fetch_add(1);
        const int32_t result = rust_mixer_.Process(
            mixer_work_scratch_.data(),
            frames,
            channels
        );
        mixer_last_result_.store(result);
        if (result == FE_RUST_MIXER_OK) {
            mixer_consecutive_failures_.store(0);
            mixer_active_.store(true);
            mixer_bypass_reason_.store(FE_AUDIO_MIXER_BYPASS_NONE);
            return true;
        }

        bool partial_write = false;
        for (size_t index = 0; index < sample_count; ++index) {
            if (mixer_work_scratch_[index] != mixer_original_scratch_[index]) {
                partial_write = true;
                break;
            }
        }
        if (partial_write) mixer_partial_failure_bypasses_.fetch_add(1);
        mixer_active_.store(false);
        mixer_process_failures_.fetch_add(1);
        mixer_bypassed_blocks_.fetch_add(1);
        const uint64_t consecutive = mixer_consecutive_failures_.fetch_add(1) + 1;
        if (consecutive >= kMixerConsecutiveFailureLimit) {
            mixer_failure_disabled_.store(true);
            mixer_bypass_reason_.store(FE_AUDIO_MIXER_BYPASS_FAILURE_DISABLED);
        } else {
            mixer_bypass_reason_.store(FE_AUDIO_MIXER_BYPASS_PROCESS_FAILED);
        }
        return false;
    }

    HRESULT RenderDryBlock(
        const float* interleaved_pcm,
        uint32_t frames,
        std::vector<float>* rendered
    ) {
        rendered->assign(static_cast<size_t>(kFramesPerRenderBlock) * 2, 0.0f);
        for (uint32_t frame = 0; frame < frames; ++frame) {
            const auto [left, right] = ReadStereo(interleaved_pcm, frame);
            (*rendered)[static_cast<size_t>(frame) * 2] = left;
            (*rendered)[static_cast<size_t>(frame) * 2 + 1] = right;
        }
        UpdateOutputEnergy(*rendered);
        return S_OK;
    }

    HRESULT RenderX3dSpeakerBlock(
        const float* interleaved_pcm,
        uint32_t frames,
        std::vector<float>* rendered
    ) {
        const HRESULT cache_result = RefreshSpatialCacheIfNeeded();
        if (FAILED(cache_result) || spatial_cache_.empty()) return FAILED(cache_result) ? cache_result : E_FAIL;
        const SpatialSample& spatial = spatial_cache_.front();
        x3d_matrix_left_.store(spatial.matrix_left);
        x3d_matrix_right_.store(spatial.matrix_right);
        HRESULT result = source_voice_->SetOutputMatrix(
            mastering_voice_,
            1,
            output_channels_,
            spatial.matrix.data()
        );
        if (FAILED(result)) return result;
        result = source_voice_->SetFrequencyRatio(spatial.doppler);
        if (FAILED(result)) return result;

        XAUDIO2_FILTER_PARAMETERS filter{};
        filter.Type = LowPassFilter;
        filter.Frequency = 2.0f * std::sin(kPi / 6.0f * spatial.lpf_direct);
        filter.OneOverQ = 1.0f;
        result = source_voice_->SetFilterParameters(&filter);
        if (FAILED(result)) return result;

        rendered->assign(kFramesPerRenderBlock, 0.0f);
        for (uint32_t frame = 0; frame < frames; ++frame) {
            const auto [left, right] = ReadStereo(interleaved_pcm, frame);
            (*rendered)[frame] = (left + right) * 0.5f;
        }
        UpdateOutputEnergy(*rendered);
        return S_OK;
    }

    bool MixerPendingForSpatialRevision() const {
        return mixer_pending_params_present_
            && mixer_pending_ready_
            && mixer_pending_revision_ == spatial_pending_revision_;
    }

    bool MixerRevisionReadyForSpatialTransition() const {
        // The active-revision branch preserves the legacy/native caller order
        // (Mixer then spatial). JNI uses the stronger spatial-then-Mixer path,
        // which remains staged until the zero crossing.
        return mixer_active_revision_.load() == spatial_pending_revision_
            || MixerPendingForSpatialRevision();
    }

    void MaybeArmSpatialRetry() {
        if (!spatial_transition_retry_required_
            || !spatial_transition_retry_requested_
            || !MixerRevisionReadyForSpatialTransition()
            || spatial_transition_phase_ != SpatialTransitionPhase::kSteady) {
            return;
        }
        spatial_transition_retry_required_ = false;
        spatial_transition_retry_requested_ = false;
        spatial_transition_phase_ = SpatialTransitionPhase::kFadeOut;
        spatial_transition_frame_ = 0;
        spatial_transition_reason_.store(FE_AUDIO_SPATIAL_TRANSITION_USER_CONTROL);
    }

    void RetainOldAtomicSnapshot(uint32_t reason) {
        spatial_transition_reason_.store(reason);
        spatial_transition_phase_ = SpatialTransitionPhase::kFadeIn;
        spatial_transition_frame_ = 0;
        spatial_transition_retry_required_ = true;
        spatial_transition_retry_requested_ = false;
        // Require an explicit same-revision control retry. Rust retains the
        // staged snapshot on BUSY, while a rebuild failure has not touched it.
        mixer_pending_ready_ = false;
    }

    void CommitPendingSpatialControls() {
        if (!spatial_transition_pending_ || !MixerRevisionReadyForSpatialTransition()) return;
        const FeAudioSpatialControlParams previous = spatial_controls_;
        const FeRustChannelRouterParams previous_router_params = channel_router_params_;
        const uint64_t previous_router_revision = channel_router_revision_;
        const bool previous_router_present = channel_router_params_present_;
        const bool applies_pending_router = channel_router_pending_params_present_
            && channel_router_pending_params_.output_channels
                == spatial_pending_controls_.upmix_output_channels;
        if (applies_pending_router) {
            channel_router_params_ = channel_router_pending_params_;
            channel_router_revision_ = channel_router_pending_revision_;
            channel_router_params_present_ = true;
        }
        spatial_controls_ = spatial_pending_controls_;
        const HRESULT result = RebuildSpatialModules();
        if (FAILED(result)) {
            spatial_controls_ = previous;
            channel_router_params_ = previous_router_params;
            channel_router_revision_ = previous_router_revision;
            channel_router_params_present_ = previous_router_present;
            (void)RebuildSpatialModules();
            RetainOldAtomicSnapshot(FE_AUDIO_SPATIAL_TRANSITION_REBUILD_FAILED);
            return;
        }

        // The old route and old Mixer reached the zero crossing together.
        // Only now publish the matching Rust snapshot. If publication is BUSY,
        // restore the old renderer before any subsequent block is rendered.
        if (mixer_active_revision_.load() != spatial_pending_revision_) {
            const int32_t mixer_result = rust_mixer_.CommitStaged(
                mixer_pending_revision_,
                mixer_pending_ramp_frames_
            );
            mixer_last_result_.store(mixer_result);
            FeRustMixerStatus rust_status{};
            if (rust_mixer_.GetStatus(&rust_status)) {
                mixer_enabled_.store(rust_status.enabled != 0);
                mixer_active_revision_.store(rust_status.active_revision);
                mixer_staged_revision_.store(rust_status.staged_revision);
            }
            if (mixer_result != FE_RUST_MIXER_OK
                || mixer_active_revision_.load() != spatial_pending_revision_) {
                spatial_controls_ = previous;
                channel_router_params_ = previous_router_params;
                channel_router_revision_ = previous_router_revision;
                channel_router_params_present_ = previous_router_present;
                (void)RebuildSpatialModules();
                RetainOldAtomicSnapshot(FE_AUDIO_SPATIAL_TRANSITION_WAITING_FOR_MIXER);
                return;
            }

            mixer_committed_params_ = mixer_pending_params_;
            mixer_committed_params_present_ = true;
            mixer_pending_params_present_ = false;
            mixer_pending_ready_ = false;
            mixer_pending_revision_ = 0;
            mixer_failure_disabled_.store(false);
            mixer_consecutive_failures_.store(0);
            mixer_active_.store(false);
            mixer_bypass_reason_.store(
                mixer_committed_params_.enabled != 0
                    ? FE_AUDIO_MIXER_BYPASS_NONE
                    : FE_AUDIO_MIXER_BYPASS_DISABLED
            );
        }
        spatial_active_revision_.store(spatial_pending_revision_);
        if (applies_pending_router) {
            channel_router_pending_params_present_ = false;
            channel_router_pending_revision_ = 0;
            channel_router_pending_ramp_frames_ = 0;
        }
        spatial_transition_retry_required_ = false;
        spatial_transition_retry_requested_ = false;
        spatial_transition_reason_.store(FE_AUDIO_SPATIAL_TRANSITION_USER_CONTROL);
        spatial_transition_phase_ = SpatialTransitionPhase::kFadeIn;
        spatial_transition_frame_ = 0;
    }

    void ApplySpatialTransitionGain(std::vector<float>* stereo, uint32_t frames) {
        if (!spatial_transition_pending_ || spatial_transition_half_frames_ == 0) return;
        // JNI stages the spatial snapshot before the Rust Mixer snapshot. Do
        // not begin fading until both halves of the exact revision are staged.
        if (spatial_transition_phase_ == SpatialTransitionPhase::kFadeOut
            && spatial_transition_frame_ == 0
            && !MixerRevisionReadyForSpatialTransition()) {
            spatial_transition_reason_.store(
                FE_AUDIO_SPATIAL_TRANSITION_WAITING_FOR_MIXER
            );
            return;
        }
        if (spatial_transition_phase_ == SpatialTransitionPhase::kFadeOut) {
            spatial_transition_reason_.store(FE_AUDIO_SPATIAL_TRANSITION_USER_CONTROL);
        }
        bool commit_after_block = false;
        bool fade_in_completed = false;
        for (uint32_t frame = 0; frame < frames; ++frame) {
            float gain = 1.0f;
            if (spatial_transition_phase_ == SpatialTransitionPhase::kFadeOut) {
                const float progress = std::min(
                    1.0f,
                    static_cast<float>(spatial_transition_frame_)
                        / static_cast<float>(spatial_transition_half_frames_)
                );
                gain = std::cos(progress * kPi * 0.5f);
                if (spatial_transition_frame_ < spatial_transition_half_frames_) {
                    spatial_transition_frame_ += 1;
                } else {
                    commit_after_block = true;
                }
            } else if (spatial_transition_phase_ == SpatialTransitionPhase::kFadeIn) {
                const float progress = std::min(
                    1.0f,
                    static_cast<float>(spatial_transition_frame_)
                        / static_cast<float>(spatial_transition_half_frames_)
                );
                gain = std::sin(progress * kPi * 0.5f);
                if (spatial_transition_frame_ < spatial_transition_half_frames_) {
                    spatial_transition_frame_ += 1;
                } else {
                    spatial_transition_phase_ = SpatialTransitionPhase::kSteady;
                    fade_in_completed = true;
                    gain = 1.0f;
                }
            }
            const size_t base = static_cast<size_t>(frame) * 2u;
            (*stereo)[base] *= gain;
            (*stereo)[base + 1] *= gain;
        }
        if (commit_after_block
            && spatial_transition_phase_ == SpatialTransitionPhase::kFadeOut) {
            CommitPendingSpatialControls();
        }
        if (fade_in_completed) {
            if (spatial_transition_retry_required_) {
                // Keep the old pair active and the requested pair staged. A
                // control-thread same-revision retry may already be waiting.
                MaybeArmSpatialRetry();
            } else {
                spatial_transition_pending_ = false;
                spatial_transition_reason_.store(FE_AUDIO_SPATIAL_TRANSITION_NONE);
            }
        }
    }

    void FoldBedToStereo(
        const float* interleaved,
        uint32_t frames,
        uint32_t channels,
        std::vector<float>* stereo
    ) const {
        stereo->assign(static_cast<size_t>(kFramesPerRenderBlock) * 2u, 0.0f);
        for (uint32_t frame = 0; frame < frames; ++frame) {
            const size_t source = static_cast<size_t>(frame) * channels;
            const size_t destination = static_cast<size_t>(frame) * 2u;
            if (channels == 2) {
                (*stereo)[destination] = interleaved[source];
                (*stereo)[destination + 1] = interleaved[source + 1];
                continue;
            }

            const float normalization = channels >= 8 ? (1.0f / 1.5f) : (1.0f / std::sqrt(2.0f));
            float left = interleaved[source]
                + 0.70710678f * interleaved[source + 2]
                + 0.5f * interleaved[source + 3]
                + 0.5f * interleaved[source + 4];
            float right = interleaved[source + 1]
                + 0.70710678f * interleaved[source + 2]
                + 0.5f * interleaved[source + 3]
                + 0.5f * interleaved[source + 5];
            if (channels >= 8) {
                left += 0.5f * interleaved[source + 6];
                right += 0.5f * interleaved[source + 7];
            }
            (*stereo)[destination] = std::isfinite(left) ? left * normalization : 0.0f;
            (*stereo)[destination + 1] = std::isfinite(right) ? right * normalization : 0.0f;
        }
    }

    void ApplyOutputSafetyLimiter(std::vector<float>* stereo, uint32_t frames) {
        constexpr float kCeiling = 0.94406088f;  // -0.5 dBFS.
        const float release = std::exp(-3.0f / (sample_rate_ * 0.050f));
        for (uint32_t frame = 0; frame < frames; ++frame) {
            const size_t base = static_cast<size_t>(frame) * 2u;
            float left = std::isfinite((*stereo)[base]) ? (*stereo)[base] : 0.0f;
            float right = std::isfinite((*stereo)[base + 1]) ? (*stereo)[base + 1] : 0.0f;
            const float peak = std::max(std::abs(left), std::abs(right));
            const float desired = peak > kCeiling ? kCeiling / peak : 1.0f;
            if (desired < output_limiter_gain_) {
                output_limiter_gain_ = desired;
            } else {
                output_limiter_gain_ = release * output_limiter_gain_
                    + (1.0f - release) * desired;
            }
            (*stereo)[base] = left * output_limiter_gain_;
            (*stereo)[base + 1] = right * output_limiter_gain_;
        }
    }

    uint32_t ObrDryCompensationFrames() const {
        return std::max(
            1u,
            static_cast<uint32_t>(std::lround(
                static_cast<double>(kObrDryCompensationFramesAt48Khz)
                    * static_cast<double>(sample_rate_) / 48000.0
            ))
        );
    }

    const std::vector<float>& LatencyAlignedObrDry(uint32_t frames) {
        const uint32_t delay_frames = ObrDryCompensationFrames();
        const size_t required_delay_samples = static_cast<size_t>(delay_frames) * 2u;
        const size_t required_output_samples = static_cast<size_t>(kFramesPerRenderBlock) * 2u;
        if (obr_dry_delay_line_.size() != required_delay_samples
            || stereo_aligned_dry_scratch_.size() < required_output_samples) {
            // Scratch is allocated before playback.  A size mismatch is a
            // fail-safe dry-through, never an allocation in the render path.
            return stereo_dry_scratch_;
        }
        std::fill(
            stereo_aligned_dry_scratch_.begin(),
            stereo_aligned_dry_scratch_.end(),
            0.0f
        );
        for (uint32_t frame = 0; frame < frames; ++frame) {
            const size_t delay_base = static_cast<size_t>(obr_dry_delay_cursor_) * 2u;
            const size_t sample_base = static_cast<size_t>(frame) * 2u;
            stereo_aligned_dry_scratch_[sample_base] = obr_dry_delay_line_[delay_base];
            stereo_aligned_dry_scratch_[sample_base + 1] = obr_dry_delay_line_[delay_base + 1];
            obr_dry_delay_line_[delay_base] = stereo_dry_scratch_[sample_base];
            obr_dry_delay_line_[delay_base + 1] = stereo_dry_scratch_[sample_base + 1];
            obr_dry_delay_cursor_ = (obr_dry_delay_cursor_ + 1u) % delay_frames;
        }
        return stereo_aligned_dry_scratch_;
    }

    HRESULT RenderSpatialBlock(
        const float* interleaved_pcm,
        uint32_t frames,
        uint32_t source_frame_offset,
        bool rust_upmixed,
        std::vector<float>* rendered
    ) {
        const uint32_t bed_channels = SpatialUpmixEnabled() ? virtual_channels_ : 2u;
        const size_t required_upmix_samples = static_cast<size_t>(
            source_frame_offset + frames
        ) * virtual_channels_;
        const bool use_rust_upmix = rust_upmixed
            && bed_channels == virtual_channels_
            && rust_upmix_scratch_.size() >= required_upmix_samples;
        const size_t active_samples = static_cast<size_t>(frames) * bed_channels;
        const size_t required_mixer_samples = static_cast<size_t>(kFramesPerRenderBlock)
            * bed_channels;
        const bool mixer_scratch_ready = mixer_original_scratch_.size() >= required_mixer_samples
            && mixer_work_scratch_.size() >= required_mixer_samples;
        bool mixer_processed = false;
        const float* bed_source = nullptr;
        if (mixer_scratch_ready) {
            for (uint32_t frame = 0; frame < frames; ++frame) {
                const auto [stereo_left, stereo_right] = ReadStereo(interleaved_pcm, frame);
                for (uint32_t channel = 0; channel < bed_channels; ++channel) {
                    const size_t index = static_cast<size_t>(frame) * bed_channels + channel;
                    mixer_original_scratch_[index] = use_rust_upmix
                        ? rust_upmix_scratch_[
                            static_cast<size_t>(source_frame_offset + frame)
                                * virtual_channels_
                                + channel
                            ]
                        : (bed_channels == 2
                            ? (channel == 0 ? stereo_left : stereo_right)
                            : VirtualChannelSample(interleaved_pcm, frame, channel));
                }
            }
            std::copy_n(
                mixer_original_scratch_.data(),
                active_samples,
                mixer_work_scratch_.data()
            );
        }
        if (use_rust_upmix) {
            last_upmix_ordinal_.store(order_ordinal_.fetch_add(1) + 1);
        }

        // Every four-state route materializes its bed before the invariant Mixer.
        if (mixer_scratch_ready) {
            mixer_processed = TryMixerBlock(frames, bed_channels);
            bed_source = mixer_processed
                ? mixer_work_scratch_.data()
                : mixer_original_scratch_.data();
        } else {
            mixer_active_.store(false);
            mixer_bypass_reason_.store(FE_AUDIO_MIXER_BYPASS_SCRATCH_UNAVAILABLE);
            mixer_bypassed_blocks_.fetch_add(1);
        }
        last_mixer_ordinal_.store(order_ordinal_.fetch_add(1) + 1);

        if (bed_source == nullptr) return E_OUTOFMEMORY;
        FoldBedToStereo(bed_source, frames, bed_channels, &stereo_dry_scratch_);

        rendered->assign(static_cast<size_t>(kFramesPerRenderBlock) * 2u, 0.0f);
        if (!SpatialObrEnabled()) {
            std::copy_n(
                stereo_dry_scratch_.data(),
                static_cast<size_t>(frames) * 2u,
                rendered->data()
            );
            if (SpatialUpmixEnabled()) {
                // Matrix-decode distributes stereo energy across the virtual
                // bed; restore its measured energy after the normalized fold.
                constexpr float kUpmixFoldCalibration = 1.25f;
                for (uint32_t frame = 0; frame < frames; ++frame) {
                    const size_t base = static_cast<size_t>(frame) * 2u;
                    (*rendered)[base] *= kUpmixFoldCalibration;
                    (*rendered)[base + 1] *= kUpmixFoldCalibration;
                }
            }
            ApplyOutputSafetyLimiter(rendered, frames);
            ApplySpatialTransitionGain(rendered, frames);
            UpdateOutputEnergy(*rendered);
            return S_OK;
        }

        if (!obr_renderer_ || !obr_input_ || !obr_output_) return E_HANDLE;
        const HRESULT cache_result = RefreshSpatialCacheIfNeeded();
        if (FAILED(cache_result) || spatial_cache_.size() < bed_channels) {
            return FAILED(cache_result) ? cache_result : E_FAIL;
        }

        const bool positions_changed = obr_position_revision_ != spatial_cache_generation_;
        const float obr_headroom = 1.0f / std::sqrt(static_cast<float>(bed_channels));
        for (uint32_t channel = 0; channel < bed_channels; ++channel) {
            const SpatialSample& spatial = spatial_cache_[channel];
            if (channel == 0) {
                x3d_matrix_left_.store(spatial.matrix_left);
                x3d_matrix_right_.store(spatial.matrix_right);
            }
            if (positions_changed) {
                const absl::Status position_status = obr_renderer_->UpdateObjectPosition(
                    channel,
                    spatial.azimuth,
                    spatial.elevation,
                    spatial.distance
                );
                if (!position_status.ok()) return E_FAIL;
                obr_applied_azimuths_[channel] = spatial.azimuth;
                obr_applied_position_count_ = std::max(
                    obr_applied_position_count_,
                    channel + 1u
                );
                object_position_updates_.fetch_add(1);
            }

            auto output_channel = (*obr_input_)[channel];
            for (uint32_t frame = 0; frame < kFramesPerRenderBlock; ++frame) {
                if (frame >= frames) {
                    output_channel[frame] = 0.0f;
                    continue;
                }
                const float sample = bed_source[
                    static_cast<size_t>(frame) * bed_channels + channel
                ];
                // Linear pre/post normalization preserves the renderer transfer
                // while preventing coherent object sums from driving OBR's
                // internal emergency limiter on ordinary full-scale material.
                output_channel[frame] = sample * obr_headroom;
            }
        }
        if (positions_changed) obr_position_revision_ = spatial_cache_generation_;

        // X3DAudio above supplies scene-relative position, distance and gain
        // metadata. OBR is the sole binaural renderer in this mode; its stereo
        // result is queued directly to XAudio2 and is not spatialized twice.
        obr::ObrImpl& renderer = *obr_renderer_;
        renderer.Process(*obr_input_, obr_output_.get());
        obr_process_calls_.fetch_add(1);
        last_obr_ordinal_.store(order_ordinal_.fetch_add(1) + 1);

        const auto left = (*obr_output_)[0];
        const auto right = (*obr_output_)[1];
        const float wet_dry_norm = std::hypot(
            spatial_controls_.obr_wet,
            spatial_controls_.obr_dry
        );
        // A 0/0 blend is defined as lossless dry-through rather than silence.
        const float wet_gain = wet_dry_norm > 1.0e-6f
            ? spatial_controls_.obr_wet / wet_dry_norm
            : 0.0f;
        const float dry_gain = wet_dry_norm > 1.0e-6f
            ? spatial_controls_.obr_dry / wet_dry_norm
            : 1.0f;
        const bool mixed_wet_and_dry = wet_gain > 1.0e-6f
            && dry_gain > 1.0e-6f
            && !probe_disable_obr_dry_alignment_;
        const std::vector<float>& dry_for_mix = mixed_wet_and_dry
            ? LatencyAlignedObrDry(frames)
            : stereo_dry_scratch_;
        const float route_calibration = SpatialUpmixEnabled() ? 0.90f : 0.99f;
        const float output_gain = route_calibration * std::pow(
            10.0f,
            spatial_controls_.obr_output_gain_db / 20.0f
        );
        const float obr_compensation = std::sqrt(static_cast<float>(bed_channels));
        for (uint32_t frame = 0; frame < kFramesPerRenderBlock; ++frame) {
            if (frame >= frames) break;
            const size_t base = static_cast<size_t>(frame) * 2u;
            (*rendered)[base] = (
                left[frame] * obr_compensation * wet_gain
                    + dry_for_mix[base] * dry_gain
            ) * output_gain;
            (*rendered)[base + 1] = (
                right[frame] * obr_compensation * wet_gain
                    + dry_for_mix[base + 1] * dry_gain
            ) * output_gain;
        }
        ApplyOutputSafetyLimiter(rendered, frames);
        ApplySpatialTransitionGain(rendered, frames);
        UpdateOutputEnergy(*rendered);
        return S_OK;
    }

    void UpdateOutputEnergy(const std::vector<float>& samples) {
        if (samples.empty()) {
            output_energy_.store(0.0f);
            return;
        }
        double square_sum = 0.0;
        for (const float sample : samples) {
            if (!std::isfinite(sample)) {
                output_energy_.store(0.0f);
                return;
            }
            square_sum += static_cast<double>(sample) * sample;
        }
        output_energy_.store(static_cast<float>(
            std::sqrt(square_sum / static_cast<double>(samples.size()))
        ));
    }

    HRESULT QueueRenderedBlock(QueuedAudioBuffer* queued) {
        if (queued == nullptr || !queued->in_use) return E_INVALIDARG;
        XAUDIO2_BUFFER buffer{};
        buffer.AudioBytes = static_cast<UINT32>(queued->samples.size() * sizeof(float));
        buffer.pAudioData = reinterpret_cast<const BYTE*>(queued->samples.data());
        buffer.pContext = queued;

        buffers_queued_.fetch_add(1);
        const HRESULT result = source_voice_->SubmitSourceBuffer(&buffer);
        if (FAILED(result)) {
            buffers_queued_.fetch_sub(1);
            ReleaseBuffer(queued);
            return result;
        }
        buffers_submitted_.fetch_add(1);
        if (!voice_started_.load()
            && buffers_queued_.load() >= preroll_target_buffers_) {
            bool expected = false;
            if (voice_started_.compare_exchange_strong(expected, true)) {
                const HRESULT start_result = source_voice_->Start(0);
                if (FAILED(start_result)) {
                    voice_started_.store(false);
                    return start_result;
                }
            }
        }
        return S_OK;
    }

    HRESULT RememberFailure(HRESULT result) {
        last_hresult_.store(static_cast<int32_t>(result));
        return result;
    }

    void Shutdown() {
        running_.store(false);
        renderer_ready_.store(false);
        voice_started_.store(false);
        buffer_available_cv_.notify_all();
        if (source_voice_ != nullptr) {
            source_voice_->Stop(0);
            source_voice_->FlushSourceBuffers();
            source_voice_->DestroyVoice();
            source_voice_ = nullptr;
        }
        {
            std::scoped_lock lock(buffer_mutex_);
            free_buffers_.clear();
            for (const auto& buffer : buffer_pool_) {
                buffer->in_use = false;
                free_buffers_.push_back(buffer.get());
            }
            buffers_queued_.store(0);
        }
        obr_output_.reset();
        obr_input_.reset();
        obr_renderer_.reset();
        mixer_active_.store(false);
        mixer_available_.store(false);
        rust_mixer_.Shutdown();
        mixer_original_scratch_.clear();
        mixer_work_scratch_.clear();
        rust_upmix_active_.store(false);
        rust_upmixer_.Shutdown();
        rust_channel_router_.Shutdown();
        channel_router_active_ = false;
        rust_stereo_scratch_.clear();
        rust_upmix_scratch_.clear();
        spatial_cache_.clear();
        spatial_cache_revision_ = 0;
        spatial_cache_router_revision_ = 0;
        spatial_cache_uses_explicit_router_ = false;
        spatial_cache_generation_ = 0;
        obr_position_revision_ = 0;
        if (mastering_voice_ != nullptr) {
            mastering_voice_->DestroyVoice();
            mastering_voice_ = nullptr;
        }
        if (engine_ != nullptr) {
            engine_->Release();
            engine_ = nullptr;
        }
        if (mta_usage_active_) {
            CoDecrementMTAUsage(mta_usage_cookie_);
            mta_usage_active_ = false;
            mta_usage_cookie_ = nullptr;
        }
        {
            std::scoped_lock lock(buffer_mutex_);
            free_buffers_.clear();
            buffer_pool_.clear();
        }
    }

    FeAudioPipelineConfig config_{};
    SourceVoiceCallback callback_;
    FeAudioPipelineMode mode_;
    FeAudioSpatialControlParams spatial_controls_{};
    uint32_t sample_rate_;
    uint32_t input_channels_;
    uint32_t virtual_channels_;
    uint32_t max_queued_buffers_;
    uint32_t preroll_target_buffers_;
    UINT32 output_channels_ = 2;
    IXAudio2* engine_ = nullptr;
    IXAudio2MasteringVoice* mastering_voice_ = nullptr;
    IXAudio2SourceVoice* source_voice_ = nullptr;
    CO_MTA_USAGE_COOKIE mta_usage_cookie_ = nullptr;
    bool mta_usage_active_ = false;
    X3DAUDIO_HANDLE x3d_handle_{};
    std::unique_ptr<obr::ObrImpl> obr_renderer_;
    std::unique_ptr<obr::AudioBuffer> obr_input_;
    std::unique_ptr<obr::AudioBuffer> obr_output_;
    RustUpmixBridge rust_upmixer_;
    RustChannelRouterBridge rust_channel_router_;
    RustMixerBridge rust_mixer_;
    std::vector<float> rust_stereo_scratch_;
    std::vector<float> rust_upmix_scratch_;
    uint64_t upmix_generation_ = 0;
    FeRustChannelRouterParams channel_router_params_{};
    uint64_t channel_router_revision_ = 0;
    bool channel_router_params_present_ = false;
    FeRustChannelRouterParams channel_router_pending_params_{};
    uint64_t channel_router_pending_revision_ = 0;
    uint32_t channel_router_pending_ramp_frames_ = 0;
    bool channel_router_pending_params_present_ = false;
    bool channel_router_active_ = false;
    std::vector<float> mixer_original_scratch_;
    std::vector<float> mixer_work_scratch_;
    std::vector<float> stereo_dry_scratch_;
    std::vector<float> stereo_aligned_dry_scratch_;
    std::vector<float> obr_dry_delay_line_;
    uint32_t obr_dry_delay_cursor_ = 0;
    const bool probe_disable_obr_dry_alignment_ = false;
    std::mutex mixer_control_mutex_;
    FeRustMixerParams mixer_committed_params_{};
    bool mixer_committed_params_present_ = false;
    FeRustMixerParams mixer_pending_params_{};
    uint64_t mixer_pending_revision_ = 0;
    uint32_t mixer_pending_ramp_frames_ = 0;
    bool mixer_pending_params_present_ = false;
    bool mixer_pending_ready_ = false;
    mutable std::mutex spatial_control_mutex_;
    bool spatial_committed_params_present_ = false;
    FeAudioSpatialControlParams spatial_pending_controls_{};
    uint64_t spatial_pending_revision_ = 0;
    bool spatial_transition_pending_ = false;
    SpatialTransitionPhase spatial_transition_phase_ = SpatialTransitionPhase::kSteady;
    uint32_t spatial_transition_half_frames_ = 0;
    uint32_t spatial_transition_frame_ = 0;
    bool spatial_transition_retry_required_ = false;
    bool spatial_transition_retry_requested_ = false;
    float output_limiter_gain_ = 1.0f;
    mutable std::mutex pose_mutex_;
    FeAudioPose pose_{};
    uint64_t pose_revision_ = 1;
    uint64_t spatial_cache_revision_ = 0;
    uint64_t spatial_cache_router_revision_ = 0;
    bool spatial_cache_uses_explicit_router_ = false;
    uint64_t spatial_cache_generation_ = 0;
    uint64_t obr_position_revision_ = 0;
    std::array<float, 8> obr_applied_azimuths_{};
    uint32_t obr_applied_position_count_ = 0;
    std::vector<SpatialSample> spatial_cache_;
    std::mutex buffer_mutex_;
    std::mutex queue_wait_mutex_;
    std::condition_variable buffer_available_cv_;
    std::vector<std::unique_ptr<QueuedAudioBuffer>> buffer_pool_;
    std::vector<QueuedAudioBuffer*> free_buffers_;
    std::atomic<bool> running_{false};
    std::atomic<bool> renderer_ready_{false};
    std::atomic<bool> muted_{false};
    std::atomic<bool> timeline_resetting_{false};
    std::atomic<uint32_t> buffers_queued_{0};
    std::atomic<uint64_t> buffers_submitted_{0};
    std::atomic<uint64_t> buffers_consumed_{0};
    std::atomic<uint64_t> frames_processed_{0};
    std::atomic<uint64_t> dropped_buffers_{0};
    std::atomic<uint64_t> queue_underruns_{0};
    std::atomic<uint64_t> buffer_pool_exhaustions_{0};
    std::atomic<bool> voice_started_{false};
    std::atomic<uint64_t> obr_process_calls_{0};
    std::atomic<uint64_t> object_position_updates_{0};
    std::atomic<uint64_t> x3d_calculate_calls_{0};
    std::atomic<uint64_t> rust_upmix_process_calls_{0};
    std::atomic<uint64_t> rust_upmix_fallback_blocks_{0};
    std::atomic<bool> rust_upmix_active_{false};
    std::atomic<int32_t> rust_upmix_last_result_{-2};
    std::atomic<bool> mixer_available_{false};
    std::atomic<bool> mixer_enabled_{false};
    std::atomic<bool> mixer_active_{false};
    std::atomic<bool> mixer_failure_disabled_{false};
    std::atomic<uint32_t> mixer_bypass_reason_{FE_AUDIO_MIXER_BYPASS_DLL_UNAVAILABLE};
    std::atomic<int32_t> mixer_last_result_{FE_RUST_MIXER_UNSUPPORTED};
    std::atomic<uint64_t> mixer_process_calls_{0};
    std::atomic<uint64_t> mixer_bypassed_blocks_{0};
    std::atomic<uint64_t> mixer_process_failures_{0};
    std::atomic<uint64_t> mixer_consecutive_failures_{0};
    std::atomic<uint64_t> mixer_partial_failure_bypasses_{0};
    std::atomic<uint64_t> mixer_active_revision_{0};
    std::atomic<uint64_t> mixer_staged_revision_{0};
    std::atomic<uint64_t> order_ordinal_{0};
    std::atomic<uint64_t> last_upmix_ordinal_{0};
    std::atomic<uint64_t> last_mixer_ordinal_{0};
    std::atomic<uint64_t> last_obr_ordinal_{0};
    std::atomic<uint64_t> spatial_active_revision_{0};
    std::atomic<uint32_t> spatial_ramp_frames_{0};
    std::atomic<uint32_t> spatial_transition_reason_{0};
    std::atomic<float> output_energy_{0.0f};
    std::atomic<float> x3d_matrix_left_{0.0f};
    std::atomic<float> x3d_matrix_right_{0.0f};
    std::atomic<int32_t> last_hresult_{S_OK};
};

void STDMETHODCALLTYPE SourceVoiceCallback::OnBufferEnd(void* context) {
    if (owner_ != nullptr) {
        owner_->OnBufferEnd(static_cast<QueuedAudioBuffer*>(context));
    }
}

void STDMETHODCALLTYPE SourceVoiceCallback::OnVoiceError(void*, HRESULT error) {
    if (owner_ != nullptr) owner_->OnVoiceError(error);
}

bool IsValidConfig(const FeAudioPipelineConfig* config) {
    if (config == nullptr || config->struct_size < sizeof(FeAudioPipelineConfig)) return false;
    if (config->abi_version != FE_AUDIO_PIPELINE_ABI_VERSION) return false;
    if (config->sample_rate < 16000 || config->sample_rate > 192000) return false;
    if (config->input_channels != 1
        && config->input_channels != 2
        && config->input_channels != 6
        && config->input_channels != 8) {
        return false;
    }
    return config->mode <= FE_AUDIO_MODE_OBR_BINAURAL;
}

AudioPipeline* FromHandle(FeAudioPipelineHandle handle) {
    return static_cast<AudioPipeline*>(handle);
}

}  // namespace

extern "C" {

FE_AUDIO_PIPELINE_API FeAudioPipelineHandle fe_audio_pipeline_create(
    const FeAudioPipelineConfig* config
) {
    if (!IsValidConfig(config)) return nullptr;
    auto pipeline = std::make_unique<AudioPipeline>(*config);
    if (FAILED(pipeline->Initialize())) return nullptr;
    return pipeline.release();
}

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_set_pose(
    FeAudioPipelineHandle handle,
    const FeAudioPose* pose
) {
    if (handle == nullptr || pose == nullptr) return E_INVALIDARG;
    return FromHandle(handle)->SetPose(*pose);
}

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_submit(
    FeAudioPipelineHandle handle,
    const float* interleaved_pcm,
    uint32_t frame_count
) {
    if (handle == nullptr) return E_HANDLE;
    return FromHandle(handle)->Submit(interleaved_pcm, frame_count);
}

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_set_muted(
    FeAudioPipelineHandle handle,
    uint32_t muted
) {
    if (handle == nullptr) return E_HANDLE;
    return FromHandle(handle)->SetMuted(muted != 0);
}

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_reset_timeline(
    FeAudioPipelineHandle handle
) {
    if (handle == nullptr) return E_HANDLE;
    return FromHandle(handle)->ResetTimeline();
}

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_get_status(
    FeAudioPipelineHandle handle,
    FeAudioPipelineStatus* status
) {
    if (handle == nullptr || status == nullptr) return E_INVALIDARG;
    if (status->struct_size < sizeof(FeAudioPipelineStatus)) return E_INVALIDARG;
    FromHandle(handle)->GetStatus(status);
    return S_OK;
}

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_set_mixer_params(
    FeAudioPipelineHandle handle,
    uint64_t revision,
    const FeRustMixerParams* params,
    uint32_t ramp_frames
) {
    if (handle == nullptr) return FE_RUST_MIXER_INVALID_ARGUMENT;
    return FromHandle(handle)->SetMixerParams(revision, params, ramp_frames);
}

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_get_mixer_status(
    FeAudioPipelineHandle handle,
    FeAudioMixerPipelineStatus* status
) {
    if (handle == nullptr || status == nullptr) return E_INVALIDARG;
    if (status->struct_size < sizeof(FeAudioMixerPipelineStatus)) return E_INVALIDARG;
    FromHandle(handle)->GetMixerStatus(status);
    return S_OK;
}

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_set_spatial_controls(
    FeAudioPipelineHandle handle,
    uint64_t revision,
    const FeAudioSpatialControlParams* params,
    uint32_t ramp_frames
) {
    if (handle == nullptr) return FE_RUST_MIXER_INVALID_ARGUMENT;
    return FromHandle(handle)->SetSpatialControls(
        revision,
        params,
        ramp_frames
    );
}

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_set_channel_router_params(
    FeAudioPipelineHandle handle,
    uint64_t revision,
    const FeRustChannelRouterParams* params,
    uint32_t ramp_frames
) {
    if (handle == nullptr) return FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
    return FromHandle(handle)->SetChannelRouterParams(
        revision,
        params,
        ramp_frames
    );
}

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_process_channel_router(
    FeAudioPipelineHandle handle,
    const float* interleaved_stereo,
    uint32_t frame_count,
    float* interleaved_output,
    uint32_t output_capacity_samples
) {
    if (handle == nullptr) return FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
    return FromHandle(handle)->ProcessChannelRouter(
        interleaved_stereo,
        frame_count,
        interleaved_output,
        output_capacity_samples
    );
}

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_get_channel_router_status(
    FeAudioPipelineHandle handle,
    FeRustChannelRouterStatus* status
) {
    if (handle == nullptr) return FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
    return FromHandle(handle)->GetChannelRouterStatus(status);
}

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_generate_channel_test_signal(
    FeAudioPipelineHandle handle,
    const FeRustTestSignalConfig* config,
    FeRustTestSignalState* state,
    uint32_t frame_count,
    float* interleaved_output,
    uint32_t output_capacity_samples
) {
    if (handle == nullptr) return FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
    return FromHandle(handle)->GenerateChannelTestSignal(
        config,
        state,
        frame_count,
        interleaved_output,
        output_capacity_samples
    );
}

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_queue_channel_test_signal(
    FeAudioPipelineHandle handle,
    const FeRustTestSignalConfig* config,
    uint32_t frame_count
) {
    if (handle == nullptr) return FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
    return FromHandle(handle)->QueueChannelTestSignal(config, frame_count);
}

FE_AUDIO_PIPELINE_API void fe_audio_pipeline_destroy(
    FeAudioPipelineHandle handle
) {
    delete FromHandle(handle);
}

}  // extern "C"
