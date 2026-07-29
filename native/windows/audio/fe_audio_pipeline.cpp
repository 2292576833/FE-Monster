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
constexpr float kPi = 3.14159265358979323846f;
int kRustUpmixModuleAnchor = 0;

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

class RustUpmixBridge final {
public:
    RustUpmixBridge() = default;
    RustUpmixBridge(const RustUpmixBridge&) = delete;
    RustUpmixBridge& operator=(const RustUpmixBridge&) = delete;

    ~RustUpmixBridge() {
        Shutdown();
    }

    bool Initialize(uint32_t sample_rate, uint32_t output_channels, uint32_t requested_algorithm) {
        Shutdown();
        if (output_channels != 6 && output_channels != 8) {
            last_result_ = -2;
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

        uint32_t algorithm = 1;  // OxiMedia MatrixDecode by default.
        if (requested_algorithm == 1) algorithm = 0;       // Passive
        else if (requested_algorithm == 3) algorithm = 2;  // AmbientExtract

        FeRustUpmixConfig config{};
        config.struct_size = sizeof(config);
        config.abi_version = FE_RUST_UPMIX_ABI_VERSION;
        config.sample_rate = sample_rate;
        config.output_channels = output_channels;
        config.algorithm = algorithm;
        config.center_width_hz = 300.0f;
        config.lfe_crossover_hz = 120.0f;
        config.lfe_gain = 0.707f;
        config.center_gain = 0.707f;
        config.surround_gain = 0.5f;
        config.decorrelation_amount = 0.7f;
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
          sample_rate_(config.sample_rate),
          input_channels_(config.input_channels),
          virtual_channels_(NormalizeVirtualChannels(config.virtual_layout_channels)),
          max_queued_buffers_(config.max_queued_buffers == 0
              ? kDefaultQueuedBuffers
              : std::clamp(config.max_queued_buffers, 3u, 64u)),
          preroll_target_buffers_(std::min(kPrerollQueuedBuffers, max_queued_buffers_)),
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

        if (mode_ == FE_AUDIO_MODE_OBR_BINAURAL) {
            try {
                obr_renderer_ = std::make_unique<obr::ObrImpl>(
                    static_cast<int>(kFramesPerRenderBlock),
                    static_cast<int>(sample_rate_)
                );
                for (uint32_t channel = 0; channel < virtual_channels_; ++channel) {
                    const absl::Status status = obr_renderer_->AddAudioElement(
                        obr::AudioElementType::kObjectMono,
                        obr::BinauralFilterProfile::kAmbient
                    );
                    if (!status.ok()) return RememberFailure(E_FAIL);
                }
                obr_input_ = std::make_unique<obr::AudioBuffer>(
                    virtual_channels_,
                    kFramesPerRenderBlock
                );
                obr_output_ = std::make_unique<obr::AudioBuffer>(
                    2,
                    kFramesPerRenderBlock
                );
            } catch (...) {
                return RememberFailure(E_FAIL);
            }
            if ((virtual_channels_ == 6 || virtual_channels_ == 8)
                && (input_channels_ == 1 || input_channels_ == 2)) {
                const bool rust_ready = rust_upmixer_.Initialize(
                    sample_rate_,
                    virtual_channels_,
                    config_.upmix_algorithm
                );
                rust_upmix_active_.store(rust_ready);
                rust_upmix_last_result_.store(rust_upmixer_.LastResult());
                if (rust_ready) {
                    rust_stereo_scratch_.assign(
                        static_cast<size_t>(kFramesPerTransportBatch) * 2,
                        0.0f
                    );
                    rust_upmix_scratch_.assign(
                        static_cast<size_t>(kFramesPerTransportBatch) * virtual_channels_,
                        0.0f
                    );
                }
            }
        }

        if (mode_ != FE_AUDIO_MODE_DRY) {
            result = RefreshSpatialCacheIfNeeded();
            if (FAILED(result)) return RememberFailure(result);
        }

        running_.store(true);
        renderer_ready_.store(
            mode_ != FE_AUDIO_MODE_OBR_BINAURAL
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

    HRESULT Submit(const float* interleaved_pcm, uint32_t frame_count) {
        if (interleaved_pcm == nullptr || frame_count == 0) return E_INVALIDARG;
        if (!running_.load() || source_voice_ == nullptr) return E_HANDLE;

        const bool submission_rust_upmixed = mode_ == FE_AUDIO_MODE_OBR_BINAURAL
            && frame_count <= kFramesPerTransportBatch
            && TryRustUpmixBlock(interleaved_pcm, frame_count);
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
            HRESULT result = S_OK;
            if (mode_ == FE_AUDIO_MODE_OBR_BINAURAL) {
                result = RenderObrBlock(
                    block,
                    frames_this_block,
                    source_offset,
                    submission_rust_upmixed,
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
        status->struct_size = sizeof(*status);
        status->abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
        status->mode = static_cast<uint32_t>(mode_);
        status->running = running_.load() ? 1u : 0u;
        status->renderer_ready = renderer_ready_.load() ? 1u : 0u;
        status->sample_rate = sample_rate_;
        status->input_channels = input_channels_;
        status->renderer_input_channels = mode_ == FE_AUDIO_MODE_OBR_BINAURAL
            ? virtual_channels_
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
    }

    void OnBufferEnd(QueuedAudioBuffer* buffer) {
        if (!ReleaseBuffer(buffer)) return;
        const uint32_t queued_before = buffers_queued_.fetch_sub(1);
        if (queued_before == 0) {
            buffers_queued_.store(0);
        } else if (queued_before == 1 && running_.load() && voice_started_.load()) {
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
            ? virtual_channels_
            : 1u;
        if (spatial_cache_revision_ == snapshot.revision
            && spatial_cache_.size() == sample_count) {
            return S_OK;
        }
        try {
            std::vector<SpatialSample> refreshed;
            refreshed.reserve(sample_count);
            const auto azimuths = LayoutAzimuths(sample_count);
            for (uint32_t channel = 0; channel < sample_count; ++channel) {
                refreshed.push_back(CalculateSpatialSample(snapshot.pose, azimuths[channel]));
            }
            spatial_cache_ = std::move(refreshed);
            spatial_cache_revision_ = snapshot.revision;
            return S_OK;
        } catch (...) {
            return E_OUTOFMEMORY;
        }
    }

    static std::array<float, 8> LayoutAzimuths(uint32_t channels) {
        if (channels == 6) return {-30.0f, 30.0f, 0.0f, 0.0f, -110.0f, 110.0f, 0.0f, 0.0f};
        if (channels == 8) return {-30.0f, 30.0f, 0.0f, 0.0f, -90.0f, 90.0f, -150.0f, 150.0f};
        return {-30.0f, 30.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f};
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

        const float angle = layout_azimuth * kPi / 180.0f;
        X3DAUDIO_EMITTER emitter{};
        emitter.Position = {
            pose.emitter_x + std::sin(angle) * 0.28f,
            pose.emitter_y,
            pose.emitter_z + std::cos(angle) * 0.28f
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

        const float dx = emitter.Position.x - listener.Position.x;
        const float dy = emitter.Position.y - listener.Position.y;
        const float dz = emitter.Position.z - listener.Position.z;
        result.distance = std::max(0.05f, std::sqrt(dx * dx + dy * dy + dz * dz));
        result.azimuth = std::atan2(dx, dz) * 180.0f / kPi;
        result.elevation = std::atan2(dy, std::sqrt(dx * dx + dz * dz)) * 180.0f / kPi;
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
            return std::isfinite(sample) ? std::clamp(sample, -1.5f, 1.5f) : 0.0f;
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
            case 4: return left * 0.52f;
            case 5: return right * 0.52f;
            case 6: return left * 0.38f;
            case 7: return right * 0.38f;
            default: return 0.0f;
        }
    }

    bool TryRustUpmixBlock(const float* interleaved_pcm, uint32_t frames) {
        if ((virtual_channels_ != 6 && virtual_channels_ != 8)
            || (input_channels_ != 1 && input_channels_ != 2)) {
            return false;
        }
        if (!rust_upmix_active_.load() || !rust_upmixer_.Ready()) {
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
        const bool processed = rust_upmixer_.Process(
            rust_stereo_scratch_.data(),
            frames,
            rust_upmix_scratch_.data(),
            frames * virtual_channels_
        );
        rust_upmix_last_result_.store(rust_upmixer_.LastResult());
        if (!processed) {
            rust_upmix_fallback_blocks_.fetch_add(1);
            return false;
        }
        rust_upmix_process_calls_.fetch_add(1);
        return true;
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

    HRESULT RenderObrBlock(
        const float* interleaved_pcm,
        uint32_t frames,
        uint32_t source_frame_offset,
        bool rust_upmixed,
        std::vector<float>* rendered
    ) {
        if (!obr_renderer_ || !obr_input_ || !obr_output_) return E_HANDLE;
        const HRESULT cache_result = RefreshSpatialCacheIfNeeded();
        if (FAILED(cache_result) || spatial_cache_.size() < virtual_channels_) {
            return FAILED(cache_result) ? cache_result : E_FAIL;
        }
        const bool positions_changed = obr_position_revision_ != spatial_cache_revision_;
        for (uint32_t channel = 0; channel < virtual_channels_; ++channel) {
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
            }

            auto output_channel = (*obr_input_)[channel];
            for (uint32_t frame = 0; frame < kFramesPerRenderBlock; ++frame) {
                if (frame >= frames) {
                    output_channel[frame] = 0.0f;
                    continue;
                }
                const float sample = rust_upmixed
                    ? rust_upmix_scratch_[
                        static_cast<size_t>(source_frame_offset + frame)
                            * virtual_channels_
                            + channel
                    ]
                    : VirtualChannelSample(interleaved_pcm, frame, channel);
                output_channel[frame] = sample * spatial.gain;
            }
        }
        if (positions_changed) obr_position_revision_ = spatial_cache_revision_;

        // X3DAudio above supplies scene-relative position, distance and gain
        // metadata. OBR is the sole binaural renderer in this mode; its stereo
        // result is queued directly to XAudio2 and is not spatialized twice.
        if (mode_ == FE_AUDIO_MODE_OBR_BINAURAL) {
            obr::ObrImpl& renderer = *obr_renderer_;
            renderer.Process(*obr_input_, obr_output_.get());
            obr_process_calls_.fetch_add(1);
        }

        rendered->assign(static_cast<size_t>(kFramesPerRenderBlock) * 2, 0.0f);
        const auto left = (*obr_output_)[0];
        const auto right = (*obr_output_)[1];
        for (uint32_t frame = 0; frame < kFramesPerRenderBlock; ++frame) {
            (*rendered)[static_cast<size_t>(frame) * 2] = left[frame];
            (*rendered)[static_cast<size_t>(frame) * 2 + 1] = right[frame];
        }
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
        rust_upmix_active_.store(false);
        rust_upmixer_.Shutdown();
        rust_stereo_scratch_.clear();
        rust_upmix_scratch_.clear();
        spatial_cache_.clear();
        spatial_cache_revision_ = 0;
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
    std::vector<float> rust_stereo_scratch_;
    std::vector<float> rust_upmix_scratch_;
    mutable std::mutex pose_mutex_;
    FeAudioPose pose_{};
    uint64_t pose_revision_ = 1;
    uint64_t spatial_cache_revision_ = 0;
    uint64_t obr_position_revision_ = 0;
    std::vector<SpatialSample> spatial_cache_;
    std::mutex buffer_mutex_;
    std::mutex queue_wait_mutex_;
    std::condition_variable buffer_available_cv_;
    std::vector<std::unique_ptr<QueuedAudioBuffer>> buffer_pool_;
    std::vector<QueuedAudioBuffer*> free_buffers_;
    std::atomic<bool> running_{false};
    std::atomic<bool> renderer_ready_{false};
    std::atomic<bool> muted_{false};
    std::atomic<uint32_t> buffers_queued_{0};
    std::atomic<uint64_t> buffers_submitted_{0};
    std::atomic<uint64_t> buffers_consumed_{0};
    std::atomic<uint64_t> frames_processed_{0};
    std::atomic<uint64_t> dropped_buffers_{0};
    std::atomic<uint64_t> queue_underruns_{0};
    std::atomic<uint64_t> buffer_pool_exhaustions_{0};
    std::atomic<bool> voice_started_{false};
    std::atomic<uint64_t> obr_process_calls_{0};
    std::atomic<uint64_t> x3d_calculate_calls_{0};
    std::atomic<uint64_t> rust_upmix_process_calls_{0};
    std::atomic<uint64_t> rust_upmix_fallback_blocks_{0};
    std::atomic<bool> rust_upmix_active_{false};
    std::atomic<int32_t> rust_upmix_last_result_{-2};
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

FE_AUDIO_PIPELINE_API int32_t fe_audio_pipeline_get_status(
    FeAudioPipelineHandle handle,
    FeAudioPipelineStatus* status
) {
    if (handle == nullptr || status == nullptr) return E_INVALIDARG;
    if (status->struct_size < sizeof(FeAudioPipelineStatus)) return E_INVALIDARG;
    FromHandle(handle)->GetStatus(status);
    return S_OK;
}

FE_AUDIO_PIPELINE_API void fe_audio_pipeline_destroy(
    FeAudioPipelineHandle handle
) {
    delete FromHandle(handle);
}

}  // extern "C"
