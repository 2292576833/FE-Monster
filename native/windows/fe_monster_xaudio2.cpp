#ifndef NOMINMAX
#define NOMINMAX
#endif

#include <jni.h>
#include <windows.h>
#include <audioclient.h>
#include <ksmedia.h>
#include <mmdeviceapi.h>
#include <xaudio2.h>
#include <x3daudio.h>
#include <wrl/client.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>

#include "audio/fe_audio_pipeline.h"

#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "uuid.lib")
#pragma comment(lib, "xaudio2.lib")

namespace {
using Microsoft::WRL::ComPtr;

constexpr double kPi = 3.14159265358979323846;
constexpr int kLowMinHz = 20;
constexpr int kLowMaxHz = 150;
constexpr int kLowStepHz = 10;
constexpr size_t kLowProbeCount = (kLowMaxHz - kLowMinHz) / kLowStepHz + 1;
constexpr size_t kLowBandCount = 512;
constexpr size_t kAnalysisWindow = 2048;
constexpr size_t kAnalysisHop = 1024;
constexpr ULONGLONG kCaptureIdleTimeoutMs = 900;
constexpr DWORD kCaptureWaitTimeoutMs = 180;
constexpr jsize kMixerValueCount = 44;
constexpr jsize kChannelRouterValueCount = 41;
constexpr size_t kChannelRouterStatusValueCount = 34;

IXAudio2* g_engine = nullptr;
IXAudio2MasteringVoice* g_master_voice = nullptr;
X3DAUDIO_HANDLE g_x3d = {};
UINT32 g_output_channels = 0;
bool g_ready = false;

std::atomic<bool> g_capture_started{ false };
std::atomic<bool> g_capture_active{ false };
std::atomic<bool> g_capture_shutdown{ false };
std::atomic<ULONGLONG> g_capture_last_request_tick{ 0 };
std::mutex g_capture_thread_mutex;
std::thread g_capture_thread;
HANDLE g_capture_stop_event = nullptr;
std::atomic<float> g_low_frequency{ 0.0f };
std::atomic<float> g_energy{ 0.0f };
std::atomic<float> g_beat{ 0.0f };
std::atomic<float> g_sample_rate{ 0.0f };
std::array<std::atomic<float>, kLowBandCount> g_low_frequency_bands{};
struct LowFrequencyAnalysisKernel {
    UINT32 sample_rate = 0;
    std::array<std::array<float, kAnalysisWindow>, kLowProbeCount> real_weights{};
    std::array<std::array<float, kAnalysisWindow>, kLowProbeCount> imag_weights{};
};
std::unique_ptr<LowFrequencyAnalysisKernel> g_low_frequency_kernel;
std::mutex g_spatial_pipeline_mutex;
FeAudioPipelineHandle g_spatial_pipeline = nullptr;
uint32_t g_spatial_input_channels = 0;

float clamp01(float value) {
    if (!std::isfinite(value)) return 0.0f;
    return std::max(0.0f, std::min(1.0f, value));
}

bool init_engine() {
    if (g_ready) return true;

    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(hr) && hr != RPC_E_CHANGED_MODE) return false;

    hr = XAudio2Create(&g_engine, 0, XAUDIO2_DEFAULT_PROCESSOR);
    if (FAILED(hr) || !g_engine) return false;

    hr = g_engine->CreateMasteringVoice(&g_master_voice);
    if (FAILED(hr) || !g_master_voice) return false;

    XAUDIO2_VOICE_DETAILS details = {};
    g_master_voice->GetVoiceDetails(&details);
    g_output_channels = details.InputChannels;
    if (g_output_channels == 0) g_output_channels = 2;

    DWORD channel_mask = 0;
    hr = g_master_voice->GetChannelMask(&channel_mask);
    if (FAILED(hr) || channel_mask == 0) channel_mask = SPEAKER_STEREO;

    X3DAudioInitialize(channel_mask, X3DAUDIO_SPEED_OF_SOUND, g_x3d);
    g_ready = true;
    return true;
}

bool is_float_format(const WAVEFORMATEX* format) {
    if (!format) return false;
    if (format->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) return true;
    if (format->wFormatTag != WAVE_FORMAT_EXTENSIBLE) return false;
    const auto* ext = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(format);
    return IsEqualGUID(ext->SubFormat, KSDATAFORMAT_SUBTYPE_IEEE_FLOAT);
}

bool is_pcm_format(const WAVEFORMATEX* format) {
    if (!format) return false;
    if (format->wFormatTag == WAVE_FORMAT_PCM) return true;
    if (format->wFormatTag != WAVE_FORMAT_EXTENSIBLE) return false;
    const auto* ext = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(format);
    return IsEqualGUID(ext->SubFormat, KSDATAFORMAT_SUBTYPE_PCM);
}

float read_pcm_sample(const BYTE* frame, WORD bits_per_sample, UINT32 channel) {
    const UINT32 bytes = bits_per_sample / 8;
    const BYTE* sample = frame + channel * bytes;
    if (bits_per_sample == 16) {
        int16_t value = static_cast<int16_t>(sample[0] | (sample[1] << 8));
        return static_cast<float>(value) / 32768.0f;
    }
    if (bits_per_sample == 24) {
        int32_t value = sample[0] | (sample[1] << 8) | (sample[2] << 16);
        if (value & 0x00800000) value |= 0xFF000000;
        return static_cast<float>(value) / 8388608.0f;
    }
    if (bits_per_sample == 32) {
        int32_t value = static_cast<int32_t>(
            sample[0] |
            (sample[1] << 8) |
            (sample[2] << 16) |
            (sample[3] << 24)
        );
        return static_cast<float>(value) / 2147483648.0f;
    }
    return 0.0f;
}

float read_mono_frame(const BYTE* frame, const WAVEFORMATEX* format, bool float_format, bool pcm_format) {
    const UINT32 channels = std::max<UINT32>(1, format->nChannels);
    float sum = 0.0f;
    for (UINT32 channel = 0; channel < channels; channel += 1) {
        if (float_format && format->wBitsPerSample == 32) {
            sum += reinterpret_cast<const float*>(frame)[channel];
        } else if (pcm_format) {
            sum += read_pcm_sample(frame, format->wBitsPerSample, channel);
        }
    }
    return clamp01((sum / static_cast<float>(channels) + 1.0f) * 0.5f) * 2.0f - 1.0f;
}

void publish_sample(
    float low_raw,
    float energy_raw,
    const std::array<float, kLowBandCount>* low_bands = nullptr
) {
    const float low = clamp01(low_raw);
    const float previous_low = g_low_frequency.load(std::memory_order_relaxed);
    const float low_rate = low > previous_low ? 0.38f : 0.085f;
    const float smoothed_low = previous_low + (low - previous_low) * low_rate;
    g_low_frequency.store(clamp01(smoothed_low), std::memory_order_relaxed);

    const float energy = clamp01(energy_raw);
    const float previous_energy = g_energy.load(std::memory_order_relaxed);
    const float energy_rate = energy > previous_energy ? 0.30f : 0.075f;
    g_energy.store(clamp01(previous_energy + (energy - previous_energy) * energy_rate), std::memory_order_relaxed);

    const float beat_raw = clamp01((low - previous_low) * 5.2f + low * 0.18f);
    const float previous_beat = g_beat.load(std::memory_order_relaxed);
    g_beat.store(clamp01(previous_beat + (beat_raw - previous_beat) * 0.42f), std::memory_order_relaxed);

    for (size_t index = 0; index < kLowBandCount; index += 1) {
        const float band = low_bands ? clamp01((*low_bands)[index]) : 0.0f;
        const float previous_band = g_low_frequency_bands[index].load(std::memory_order_relaxed);
        const float band_rate = band > previous_band ? 0.38f : 0.085f;
        g_low_frequency_bands[index].store(
            clamp01(previous_band + (band - previous_band) * band_rate),
            std::memory_order_relaxed
        );
    }
}

void decay_sample() {
    publish_sample(0.0f, 0.0f);
}

const LowFrequencyAnalysisKernel& low_frequency_kernel(UINT32 sample_rate) {
    if (g_low_frequency_kernel && g_low_frequency_kernel->sample_rate == sample_rate) {
        return *g_low_frequency_kernel;
    }
    auto kernel = std::make_unique<LowFrequencyAnalysisKernel>();
    kernel->sample_rate = sample_rate;
    for (size_t probe_index = 0; probe_index < kLowProbeCount; probe_index += 1) {
        const int hz = kLowMinHz + static_cast<int>(probe_index) * kLowStepHz;
        const double angle_step = 2.0 * kPi * static_cast<double>(hz)
            / static_cast<double>(sample_rate);
        for (size_t index = 0; index < kAnalysisWindow; index += 1) {
            const double window = 0.5 - 0.5 * std::cos(
                (2.0 * kPi * index) / static_cast<double>(kAnalysisWindow - 1)
            );
            const double angle = angle_step * static_cast<double>(index);
            kernel->real_weights[probe_index][index] = static_cast<float>(
                window * std::cos(angle)
            );
            kernel->imag_weights[probe_index][index] = static_cast<float>(
                -window * std::sin(angle)
            );
        }
    }
    g_low_frequency_kernel = std::move(kernel);
    return *g_low_frequency_kernel;
}

void analyze_window(const std::vector<float>& samples, UINT32 sample_rate) {
    if (samples.size() < kAnalysisWindow || sample_rate == 0) return;

    double rms_sum = 0.0;
    double low_sum = 0.0;
    int low_count = 0;
    std::array<float, kLowProbeCount> low_probes{};
    const LowFrequencyAnalysisKernel& kernel = low_frequency_kernel(sample_rate);

    for (size_t index = 0; index < kAnalysisWindow; index += 1) {
        const double sample = samples[index];
        rms_sum += sample * sample;
    }

    for (size_t probe_index = 0; probe_index < kLowProbeCount; probe_index += 1) {
        double real = 0.0;
        double imag = 0.0;
        for (size_t index = 0; index < kAnalysisWindow; index += 1) {
            const double sample = samples[index];
            real += sample * kernel.real_weights[probe_index][index];
            imag += sample * kernel.imag_weights[probe_index][index];
        }
        const double amplitude = std::sqrt(real * real + imag * imag) * 4.0 / static_cast<double>(kAnalysisWindow);
        low_probes[probe_index] = static_cast<float>(amplitude);
        low_sum += amplitude;
        low_count += 1;
    }

    std::array<float, kLowBandCount> low_bands{};
    for (size_t band_index = 0; band_index < kLowBandCount; band_index += 1) {
        const double probe_position = static_cast<double>(band_index)
            * static_cast<double>(kLowProbeCount - 1)
            / static_cast<double>(kLowBandCount - 1);
        const size_t lower_probe = static_cast<size_t>(probe_position);
        const size_t upper_probe = std::min(lower_probe + 1, kLowProbeCount - 1);
        const float blend = static_cast<float>(probe_position - static_cast<double>(lower_probe));
        const float interpolated = low_probes[lower_probe]
            + (low_probes[upper_probe] - low_probes[lower_probe]) * blend;
        low_bands[band_index] = clamp01(interpolated * 3.6f);
    }

    const float low = clamp01(static_cast<float>((low_sum / std::max(1, low_count)) * 3.6));
    const float energy = clamp01(static_cast<float>(std::sqrt(rms_sum / static_cast<double>(kAnalysisWindow)) * 1.9));
    publish_sample(low, energy, &low_bands);
    g_capture_active.store(true, std::memory_order_relaxed);
}

void append_frames(
    std::vector<float>& pending,
    const BYTE* data,
    UINT32 frames,
    DWORD flags,
    const WAVEFORMATEX* format,
    bool float_format,
    bool pcm_format
) {
    const UINT32 block_align = format->nBlockAlign;
    for (UINT32 frame_index = 0; frame_index < frames; frame_index += 1) {
        if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
            pending.push_back(0.0f);
        } else {
            const BYTE* frame = data + frame_index * block_align;
            pending.push_back(read_mono_frame(frame, format, float_format, pcm_format));
        }
    }
}

bool capture_requested() {
    const ULONGLONG last_request = g_capture_last_request_tick.load(std::memory_order_relaxed);
    return last_request != 0
        && GetTickCount64() - last_request <= kCaptureIdleTimeoutMs
        && !g_capture_shutdown.load(std::memory_order_relaxed);
}

bool run_capture_session(HANDLE stop_event) {
    ComPtr<IMMDeviceEnumerator> enumerator;
    HRESULT hr = CoCreateInstance(
        __uuidof(MMDeviceEnumerator),
        nullptr,
        CLSCTX_ALL,
        IID_PPV_ARGS(&enumerator)
    );
    if (FAILED(hr) || !enumerator) return false;

    ComPtr<IMMDevice> device;
    hr = enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &device);
    if (FAILED(hr) || !device) return false;

    ComPtr<IAudioClient> audio_client;
    hr = device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, &audio_client);
    if (FAILED(hr) || !audio_client) return false;

    WAVEFORMATEX* mix_format = nullptr;
    hr = audio_client->GetMixFormat(&mix_format);
    if (FAILED(hr) || !mix_format) return false;

    const bool float_format = is_float_format(mix_format);
    const bool pcm_format = is_pcm_format(mix_format);
    if (!float_format && !pcm_format) {
        CoTaskMemFree(mix_format);
        return false;
    }

    HANDLE capture_event = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    if (!capture_event) {
        CoTaskMemFree(mix_format);
        return false;
    }

    g_sample_rate.store(static_cast<float>(mix_format->nSamplesPerSec), std::memory_order_relaxed);
    hr = audio_client->Initialize(
        AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
        0,
        0,
        mix_format,
        nullptr
    );
    if (FAILED(hr)) {
        CloseHandle(capture_event);
        CoTaskMemFree(mix_format);
        return false;
    }

    hr = audio_client->SetEventHandle(capture_event);
    if (FAILED(hr)) {
        CloseHandle(capture_event);
        CoTaskMemFree(mix_format);
        return false;
    }

    ComPtr<IAudioCaptureClient> capture_client;
    hr = audio_client->GetService(IID_PPV_ARGS(&capture_client));
    if (FAILED(hr) || !capture_client) {
        CloseHandle(capture_event);
        CoTaskMemFree(mix_format);
        return false;
    }

    hr = audio_client->Start();
    if (FAILED(hr)) {
        CloseHandle(capture_event);
        CoTaskMemFree(mix_format);
        return false;
    }

    std::vector<float> pending;
    pending.reserve(kAnalysisWindow * 2);
    ULONGLONG last_packet_tick = GetTickCount64();
    bool silence_published = false;

    while (capture_requested()) {
        const HANDLE wait_handles[] = { stop_event, capture_event };
        const DWORD wait_result = WaitForMultipleObjects(
            static_cast<DWORD>(std::size(wait_handles)),
            wait_handles,
            FALSE,
            kCaptureWaitTimeoutMs
        );
        if (wait_result == WAIT_OBJECT_0) break;
        if (wait_result == WAIT_TIMEOUT) {
            if (!silence_published && GetTickCount64() - last_packet_tick >= kCaptureWaitTimeoutMs) {
                decay_sample();
                g_capture_active.store(false, std::memory_order_relaxed);
                silence_published = true;
            }
            continue;
        }
        if (wait_result != WAIT_OBJECT_0 + 1) break;

        UINT32 packet_frames = 0;
        hr = capture_client->GetNextPacketSize(&packet_frames);
        if (FAILED(hr)) break;

        if (packet_frames == 0) {
            continue;
        }

        last_packet_tick = GetTickCount64();
        silence_published = false;
        while (packet_frames > 0) {
            BYTE* data = nullptr;
            UINT32 frames_available = 0;
            DWORD flags = 0;
            hr = capture_client->GetBuffer(&data, &frames_available, &flags, nullptr, nullptr);
            if (FAILED(hr)) break;

            append_frames(pending, data, frames_available, flags, mix_format, float_format, pcm_format);
            capture_client->ReleaseBuffer(frames_available);

            while (pending.size() >= kAnalysisWindow) {
                analyze_window(pending, mix_format->nSamplesPerSec);
                pending.erase(pending.begin(), pending.begin() + std::min(kAnalysisHop, pending.size()));
            }

            hr = capture_client->GetNextPacketSize(&packet_frames);
            if (FAILED(hr)) break;
        }

        if (FAILED(hr)) break;
    }

    audio_client->Stop();
    CloseHandle(capture_event);
    CoTaskMemFree(mix_format);
    g_capture_active.store(false, std::memory_order_relaxed);
    return true;
}

void capture_thread_main(HANDLE stop_event) {
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    const bool com_ready = SUCCEEDED(hr) || hr == RPC_E_CHANGED_MODE;
    if (com_ready) {
        while (capture_requested()
            && WaitForSingleObject(stop_event, 0) != WAIT_OBJECT_0) {
            run_capture_session(stop_event);
            if (!capture_requested()
                || WaitForSingleObject(stop_event, kCaptureWaitTimeoutMs) == WAIT_OBJECT_0) {
                break;
            }
        }
        decay_sample();
        g_capture_active.store(false, std::memory_order_relaxed);
        if (SUCCEEDED(hr)) CoUninitialize();
    }
    g_capture_started.store(false, std::memory_order_release);
}

void start_capture_once() {
    if (!capture_requested()) return;
    std::scoped_lock lock(g_capture_thread_mutex);
    if (g_capture_shutdown.load(std::memory_order_relaxed)
        || g_capture_started.load(std::memory_order_acquire)) {
        return;
    }
    if (g_capture_thread.joinable()) g_capture_thread.join();
    if (!g_capture_stop_event) {
        g_capture_stop_event = CreateEventW(nullptr, TRUE, FALSE, nullptr);
        if (!g_capture_stop_event) return;
    } else {
        ResetEvent(g_capture_stop_event);
    }
    g_capture_started.store(true, std::memory_order_release);
    try {
        g_capture_thread = std::thread(capture_thread_main, g_capture_stop_event);
    } catch (...) {
        g_capture_started.store(false, std::memory_order_release);
    }
}

void stop_capture() {
    g_capture_shutdown.store(true, std::memory_order_release);
    std::scoped_lock lock(g_capture_thread_mutex);
    if (g_capture_stop_event) SetEvent(g_capture_stop_event);
    if (g_capture_thread.joinable()) g_capture_thread.join();
    if (g_capture_stop_event) {
        CloseHandle(g_capture_stop_event);
        g_capture_stop_event = nullptr;
    }
    g_capture_started.store(false, std::memory_order_release);
    g_capture_active.store(false, std::memory_order_relaxed);
    g_capture_last_request_tick.store(0, std::memory_order_relaxed);
    decay_sample();
}

int32_t read_mixer_and_spatial_parameters(
    JNIEnv* env,
    jint flags,
    jfloatArray values,
    FeRustMixerParams* mixer,
    FeAudioSpatialControlParams* spatial
) {
    if (env == nullptr
        || mixer == nullptr
        || spatial == nullptr
        || values == nullptr
        || env->GetArrayLength(values) != kMixerValueCount
        || flags < 0
        || (flags & ~0x3f) != 0) {
        return FE_RUST_MIXER_INVALID_ARGUMENT;
    }

    std::array<jfloat, kMixerValueCount> raw{};
    env->GetFloatArrayRegion(values, 0, kMixerValueCount, raw.data());
    if (env->ExceptionCheck()) return FE_RUST_MIXER_INVALID_ARGUMENT;
    for (const jfloat value : raw) {
        if (!std::isfinite(value)) return FE_RUST_MIXER_INVALID_ARGUMENT;
    }

    *mixer = {};
    mixer->struct_size = sizeof(*mixer);
    mixer->abi_version = FE_RUST_MIXER_ABI_VERSION;
    mixer->enabled = (flags & 0x01) != 0 ? 1u : 0u;
    mixer->compressor_enabled = (flags & 0x02) != 0 ? 1u : 0u;
    mixer->limiter_enabled = (flags & 0x04) != 0 ? 1u : 0u;
    mixer->reverb_enabled = (flags & 0x08) != 0 ? 1u : 0u;
    mixer->input_gain_db = raw[0];
    mixer->output_gain_db = raw[1];
    mixer->balance = raw[2];
    for (size_t index = 0; index < FE_RUST_MIXER_EQ_BANDS; ++index) {
        mixer->eq_db[index] = raw[3 + index];
    }
    mixer->stereo_width = raw[13];
    mixer->center_gain = raw[14];
    mixer->surround_gain = raw[15];
    mixer->lfe_gain = raw[16];
    mixer->compressor_threshold_db = raw[17];
    mixer->compressor_ratio = raw[18];
    mixer->compressor_attack_ms = raw[19];
    mixer->compressor_release_ms = raw[20];
    mixer->compressor_knee_db = raw[21];
    mixer->compressor_makeup_db = raw[22];
    mixer->limiter_ceiling_db = raw[23];
    mixer->limiter_release_ms = raw[24];
    mixer->reverb_room_size = raw[25];
    mixer->reverb_decay_ms = raw[26];
    mixer->reverb_damping = raw[27];
    mixer->reverb_pre_delay_ms = raw[28];
    mixer->reverb_wet = raw[29];
    mixer->reverb_dry = raw[30];

    *spatial = {};
    spatial->struct_size = sizeof(*spatial);
    spatial->abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    spatial->upmix_enabled = (flags & 0x10) != 0 ? 1u : 0u;
    spatial->upmix_algorithm = static_cast<uint32_t>(std::lround(raw[31]));
    spatial->upmix_output_channels = static_cast<uint32_t>(std::lround(raw[32]));
    spatial->upmix_center_width_hz = raw[33];
    spatial->upmix_lfe_crossover_hz = raw[34];
    spatial->upmix_lfe_gain = raw[35];
    spatial->upmix_center_gain = raw[36];
    spatial->upmix_surround_gain = raw[37];
    spatial->upmix_decorrelation_amount = raw[38];
    spatial->obr_enabled = (flags & 0x20) != 0 ? 1u : 0u;
    spatial->obr_filter_profile = static_cast<uint32_t>(std::lround(raw[39]));
    spatial->obr_wet = raw[40];
    spatial->obr_dry = raw[41];
    spatial->obr_output_gain_db = raw[42];
    spatial->obr_spatial_width = raw[43];
    return FE_RUST_MIXER_OK;
}

int32_t read_channel_router_parameters(
    JNIEnv* env,
    jint output_channels,
    jint algorithm,
    jfloatArray values,
    FeRustChannelRouterParams* params
) {
    if (env == nullptr
        || params == nullptr
        || (output_channels != 6 && output_channels != 8)
        || algorithm < static_cast<jint>(FE_RUST_UPMIX_FRONT_ONLY)
        || algorithm > static_cast<jint>(FE_RUST_UPMIX_CUSTOM_MATRIX)
        || values == nullptr
        || env->GetArrayLength(values) != kChannelRouterValueCount) {
        return FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
    }

    std::array<jfloat, kChannelRouterValueCount> raw{};
    env->GetFloatArrayRegion(values, 0, kChannelRouterValueCount, raw.data());
    if (env->ExceptionCheck()) return FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
    for (const jfloat value : raw) {
        if (!std::isfinite(value)) return FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
    }

    *params = {};
    params->struct_size = sizeof(*params);
    params->abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
    params->output_channels = static_cast<uint32_t>(output_channels);
    params->algorithm = static_cast<uint32_t>(algorithm);
    params->lfe_crossover_hz = raw[0];
    for (size_t channel = 0; channel < FE_RUST_CHANNEL_ROUTER_MAX_CHANNELS; ++channel) {
        params->channel_gain_db[channel] = raw[1 + channel];
        params->channel_delay_ms[channel] = raw[9 + channel];
        params->channel_azimuth_deg[channel] = raw[17 + channel];
    }
    for (size_t coefficient = 0;
         coefficient < FE_RUST_CHANNEL_ROUTER_MATRIX_COEFFICIENTS;
         ++coefficient) {
        params->custom_matrix[coefficient] = raw[25 + coefficient];
    }
    return FE_RUST_CHANNEL_ROUTER_OK;
}

X3DAUDIO_VECTOR vector3(float x, float y, float z) {
    X3DAUDIO_VECTOR value = {};
    value.x = x;
    value.y = y;
    value.z = z;
    return value;
}
}

extern "C" JNIEXPORT jboolean JNICALL Java_com_femonster_core_NativeAudioEngine_nativeInit(
    JNIEnv*,
    jclass
) {
    const bool ready = init_engine();
    if (ready) g_capture_shutdown.store(false, std::memory_order_release);
    return ready ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jfloatArray JNICALL Java_com_femonster_core_NativeAudioEngine_nativeSampleState(
    JNIEnv* env,
    jclass,
    jboolean request_capture
) {
    if (request_capture == JNI_TRUE && g_ready
        && !g_capture_shutdown.load(std::memory_order_relaxed)) {
        g_capture_last_request_tick.store(GetTickCount64(), std::memory_order_relaxed);
        start_capture_once();
    }
    std::array<jfloat, 6 + kLowBandCount> values{};
    values[0] = g_low_frequency.load(std::memory_order_relaxed);
    values[1] = g_energy.load(std::memory_order_relaxed);
    values[2] = g_beat.load(std::memory_order_relaxed);
    values[3] = g_sample_rate.load(std::memory_order_relaxed);
    values[4] = g_capture_active.load(std::memory_order_relaxed) ? 1.0f : 0.0f;
    for (size_t index = 0; index < kLowBandCount; index += 1) {
        values[5 + index] = g_low_frequency_bands[index].load(std::memory_order_relaxed);
    }
    values[5 + kLowBandCount] = g_capture_started.load(std::memory_order_acquire) ? 1.0f : 0.0f;
    jfloatArray result = env->NewFloatArray(static_cast<jsize>(values.size()));
    if (!result) return nullptr;
    env->SetFloatArrayRegion(result, 0, static_cast<jsize>(values.size()), values.data());
    return result;
}

extern "C" JNIEXPORT void JNICALL Java_com_femonster_core_NativeAudioEngine_nativeShutdown(
    JNIEnv*,
    jclass
) {
    stop_capture();
    {
        std::scoped_lock lock(g_spatial_pipeline_mutex);
        if (g_spatial_pipeline != nullptr) {
            fe_audio_pipeline_destroy(g_spatial_pipeline);
            g_spatial_pipeline = nullptr;
        }
        g_spatial_input_channels = 0;
    }
    if (g_master_voice != nullptr) {
        g_master_voice->DestroyVoice();
        g_master_voice = nullptr;
    }
    if (g_engine != nullptr) {
        g_engine->Release();
        g_engine = nullptr;
    }
    g_low_frequency_kernel.reset();
    g_output_channels = 0;
    g_ready = false;
}

extern "C" JNIEXPORT jfloatArray JNICALL Java_com_femonster_core_NativeAudioEngine_nativeSpatialMatrix(
    JNIEnv* env,
    jclass,
    jfloat emitter_x,
    jfloat emitter_y,
    jfloat emitter_z,
    jfloat listener_x,
    jfloat listener_y,
    jfloat listener_z
) {
    if (!init_engine()) return env->NewFloatArray(0);

    X3DAUDIO_LISTENER listener = {};
    listener.OrientFront = vector3(0.0f, 0.0f, 1.0f);
    listener.OrientTop = vector3(0.0f, 1.0f, 0.0f);
    listener.Position = vector3(listener_x, listener_y, listener_z);

    X3DAUDIO_EMITTER emitter = {};
    emitter.OrientFront = vector3(0.0f, 0.0f, 1.0f);
    emitter.OrientTop = vector3(0.0f, 1.0f, 0.0f);
    emitter.Position = vector3(emitter_x, emitter_y, emitter_z);
    emitter.ChannelCount = 1;
    emitter.CurveDistanceScaler = 1.0f;

    std::vector<FLOAT32> matrix(g_output_channels, 0.0f);
    X3DAUDIO_DSP_SETTINGS dsp = {};
    dsp.SrcChannelCount = 1;
    dsp.DstChannelCount = g_output_channels;
    dsp.pMatrixCoefficients = matrix.data();

    X3DAudioCalculate(g_x3d, &listener, &emitter, X3DAUDIO_CALCULATE_MATRIX, &dsp);

    jfloatArray result = env->NewFloatArray(static_cast<jsize>(matrix.size()));
    if (!result) return nullptr;
    env->SetFloatArrayRegion(result, 0, static_cast<jsize>(matrix.size()), matrix.data());
    return result;
}

extern "C" JNIEXPORT jboolean JNICALL Java_com_femonster_core_NativeAudioEngine_nativeConfigureSpatial(
    JNIEnv*,
    jclass,
    jint sample_rate,
    jint input_channels,
    jint virtual_layout_channels,
    jint upmix_algorithm,
    jboolean muted
) {
    if (sample_rate < 16000 || sample_rate > 192000) return JNI_FALSE;
    if (input_channels != 1 && input_channels != 2) return JNI_FALSE;
    if (virtual_layout_channels != 6 && virtual_layout_channels != 8) return JNI_FALSE;

    std::scoped_lock lock(g_spatial_pipeline_mutex);
    if (g_spatial_pipeline != nullptr) {
        fe_audio_pipeline_destroy(g_spatial_pipeline);
        g_spatial_pipeline = nullptr;
    }

    FeAudioPipelineConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    config.sample_rate = static_cast<uint32_t>(sample_rate);
    config.input_channels = static_cast<uint32_t>(input_channels);
    config.virtual_layout_channels = static_cast<uint32_t>(virtual_layout_channels);
    config.mode = FE_AUDIO_MODE_OBR_BINAURAL;
    config.muted = muted == JNI_TRUE ? 1u : 0u;
    config.max_queued_buffers = 24;
    config.upmix_algorithm = static_cast<uint32_t>(
        std::clamp(static_cast<int>(upmix_algorithm), 0, 3)
    );

    g_spatial_pipeline = fe_audio_pipeline_create(&config);
    if (g_spatial_pipeline == nullptr) {
        g_spatial_input_channels = 0;
        return JNI_FALSE;
    }
    g_spatial_input_channels = static_cast<uint32_t>(input_channels);
    return JNI_TRUE;
}

extern "C" JNIEXPORT jint JNICALL Java_com_femonster_core_NativeAudioEngine_nativeSubmitSpatialPcm(
    JNIEnv* env,
    jclass,
    jfloatArray pcm,
    jint frame_count
) {
    if (pcm == nullptr || frame_count <= 0) return static_cast<jint>(E_INVALIDARG);
    std::scoped_lock lock(g_spatial_pipeline_mutex);
    if (g_spatial_pipeline == nullptr || g_spatial_input_channels == 0) {
        return static_cast<jint>(E_HANDLE);
    }
    const jsize sample_count = env->GetArrayLength(pcm);
    const uint64_t required_samples = static_cast<uint64_t>(frame_count)
        * g_spatial_input_channels;
    if (required_samples > static_cast<uint64_t>(sample_count)) {
        return static_cast<jint>(E_INVALIDARG);
    }

    jboolean copied = JNI_FALSE;
    jfloat* samples = env->GetFloatArrayElements(pcm, &copied);
    if (samples == nullptr) return static_cast<jint>(E_OUTOFMEMORY);
    const int32_t result = fe_audio_pipeline_submit(
        g_spatial_pipeline,
        samples,
        static_cast<uint32_t>(frame_count)
    );
    env->ReleaseFloatArrayElements(pcm, samples, JNI_ABORT);
    return static_cast<jint>(result);
}

extern "C" JNIEXPORT jint JNICALL Java_com_femonster_core_NativeAudioEngine_nativeSubmitSpatialPcmDirect(
    JNIEnv* env,
    jclass,
    jobject pcm,
    jint frame_count
) {
    if (pcm == nullptr || frame_count <= 0) return static_cast<jint>(E_INVALIDARG);
    std::scoped_lock lock(g_spatial_pipeline_mutex);
    if (g_spatial_pipeline == nullptr || g_spatial_input_channels == 0) {
        return static_cast<jint>(E_HANDLE);
    }

    void* address = env->GetDirectBufferAddress(pcm);
    const jlong capacity = env->GetDirectBufferCapacity(pcm);
    const uint64_t required_bytes = static_cast<uint64_t>(frame_count)
        * g_spatial_input_channels
        * sizeof(float);
    if (address == nullptr || capacity < 0 || required_bytes > static_cast<uint64_t>(capacity)) {
        return static_cast<jint>(E_INVALIDARG);
    }

    return static_cast<jint>(fe_audio_pipeline_submit(
        g_spatial_pipeline,
        static_cast<const float*>(address),
        static_cast<uint32_t>(frame_count)
    ));
}

extern "C" JNIEXPORT jint JNICALL Java_com_femonster_core_NativeAudioEngine_nativeSetSpatialMuted(
    JNIEnv*,
    jclass,
    jboolean muted
) {
    std::scoped_lock lock(g_spatial_pipeline_mutex);
    if (g_spatial_pipeline == nullptr) return static_cast<jint>(E_HANDLE);
    return static_cast<jint>(fe_audio_pipeline_set_muted(
        g_spatial_pipeline,
        muted == JNI_TRUE ? 1u : 0u
    ));
}

extern "C" JNIEXPORT jint JNICALL Java_com_femonster_core_NativeAudioEngine_nativeResetSpatialTimeline(
    JNIEnv*,
    jclass
) {
    std::scoped_lock lock(g_spatial_pipeline_mutex);
    if (g_spatial_pipeline == nullptr) return static_cast<jint>(E_HANDLE);
    return static_cast<jint>(fe_audio_pipeline_reset_timeline(g_spatial_pipeline));
}

extern "C" JNIEXPORT jint JNICALL Java_com_femonster_core_NativeAudioEngine_nativeSetMixerParameters(
    JNIEnv* env,
    jclass,
    jlong revision,
    jint flags,
    jfloatArray values,
    jint ramp_frames
) {
    if (revision < 0 || ramp_frames < 0 || ramp_frames > 4096) {
        return FE_RUST_MIXER_INVALID_ARGUMENT;
    }
    FeRustMixerParams params{};
    FeAudioSpatialControlParams spatial{};
    const int32_t parse_result = read_mixer_and_spatial_parameters(
        env,
        flags,
        values,
        &params,
        &spatial
    );
    if (parse_result != FE_RUST_MIXER_OK) return static_cast<jint>(parse_result);

    std::scoped_lock lock(g_spatial_pipeline_mutex);
    if (g_spatial_pipeline == nullptr) return static_cast<jint>(E_HANDLE);
    const uint64_t native_revision = static_cast<uint64_t>(revision) + 1u;
    const int32_t spatial_result = fe_audio_pipeline_set_spatial_controls(
        g_spatial_pipeline,
        native_revision,
        &spatial,
        static_cast<uint32_t>(ramp_frames)
    );
    if (spatial_result != 0) return static_cast<jint>(spatial_result);
    return static_cast<jint>(fe_audio_pipeline_set_mixer_params(
        g_spatial_pipeline,
        native_revision,
        &params,
        static_cast<uint32_t>(ramp_frames)
    ));
}

extern "C" JNIEXPORT jint JNICALL Java_com_femonster_core_NativeAudioEngine_nativeSetMixerAndChannelRouterParameters(
    JNIEnv* env,
    jclass,
    jlong mixer_revision,
    jint flags,
    jfloatArray mixer_values,
    jlong channel_revision,
    jint output_channels,
    jint algorithm,
    jfloatArray channel_values,
    jint ramp_frames
) {
    if (mixer_revision < 0
        || channel_revision < 0
        || ramp_frames < 0
        || ramp_frames > 4096) {
        return FE_RUST_MIXER_INVALID_ARGUMENT;
    }

    FeRustMixerParams mixer{};
    FeAudioSpatialControlParams spatial{};
    const int32_t mixer_parse_result = read_mixer_and_spatial_parameters(
        env,
        flags,
        mixer_values,
        &mixer,
        &spatial
    );
    if (mixer_parse_result != FE_RUST_MIXER_OK) {
        return static_cast<jint>(mixer_parse_result);
    }
    FeRustChannelRouterParams router{};
    const int32_t router_parse_result = read_channel_router_parameters(
        env,
        output_channels,
        algorithm,
        channel_values,
        &router
    );
    if (router_parse_result != FE_RUST_CHANNEL_ROUTER_OK) {
        return static_cast<jint>(router_parse_result);
    }

    std::scoped_lock lock(g_spatial_pipeline_mutex);
    if (g_spatial_pipeline == nullptr) return static_cast<jint>(E_HANDLE);
    const uint64_t native_mixer_revision = static_cast<uint64_t>(mixer_revision) + 1u;
    const uint64_t native_router_revision = static_cast<uint64_t>(channel_revision) + 2u;
    const int32_t spatial_result = fe_audio_pipeline_set_spatial_controls(
        g_spatial_pipeline,
        native_mixer_revision,
        &spatial,
        static_cast<uint32_t>(ramp_frames)
    );
    if (spatial_result != 0) return static_cast<jint>(spatial_result);
    const int32_t router_result = fe_audio_pipeline_set_channel_router_params(
        g_spatial_pipeline,
        native_router_revision,
        &router,
        static_cast<uint32_t>(ramp_frames)
    );
    // router_result gates Mixer publication; a failed router snapshot must
    // never expose the target spatial layout with default channel controls.
    if (router_result != 0) return static_cast<jint>(router_result);
    return static_cast<jint>(fe_audio_pipeline_set_mixer_params(
        g_spatial_pipeline,
        native_mixer_revision,
        &mixer,
        static_cast<uint32_t>(ramp_frames)
    ));
}

extern "C" JNIEXPORT jdoubleArray JNICALL Java_com_femonster_core_NativeAudioEngine_nativeMixerStatus(
    JNIEnv* env,
    jclass
) {
    constexpr size_t kMixerStatusValueCount = 29;
    std::array<jdouble, kMixerStatusValueCount> values{};
    std::scoped_lock lock(g_spatial_pipeline_mutex);
    if (g_spatial_pipeline != nullptr) {
        FeAudioMixerPipelineStatus status{};
        status.struct_size = sizeof(status);
        status.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
        if (SUCCEEDED(fe_audio_pipeline_get_mixer_status(g_spatial_pipeline, &status))) {
            values[0] = 1.0;
            values[1] = status.available;
            values[2] = status.enabled;
            values[3] = status.active;
            values[4] = status.failure_disabled;
            values[5] = status.bypass_reason;
            values[6] = status.last_result;
            values[7] = static_cast<jdouble>(status.mixer_process_calls);
            values[8] = static_cast<jdouble>(status.mixer_bypassed_blocks);
            values[9] = static_cast<jdouble>(status.mixer_process_failures);
            values[10] = static_cast<jdouble>(status.mixer_consecutive_failures);
            values[11] = static_cast<jdouble>(status.mixer_partial_failure_bypasses);
            values[12] = status.active_revision > 0
                ? static_cast<jdouble>(status.active_revision - 1)
                : -1.0;
            values[13] = status.staged_revision > 0
                ? static_cast<jdouble>(status.staged_revision - 1)
                : -1.0;
            values[14] = static_cast<jdouble>(status.rust_upmix_process_calls);
            values[15] = static_cast<jdouble>(status.rust_upmix_fallback_blocks);
            values[16] = static_cast<jdouble>(status.obr_process_calls);
            values[17] = static_cast<jdouble>(status.last_upmix_ordinal);
            values[18] = static_cast<jdouble>(status.last_mixer_ordinal);
            values[19] = static_cast<jdouble>(status.last_obr_ordinal);
            values[20] = status.rust_upmix_active;
            values[21] = status.rust_upmix_last_result;
            values[22] = status.renderer_ready;
            values[23] = status.pipeline_last_result;
            values[24] = status.upmix_enabled;
            values[25] = status.obr_enabled;
            values[26] = status.obr_filter_profile;
            values[27] = status.spatial_renderer_input_channels;
            values[28] = status.spatial_active_revision > 0
                ? static_cast<jdouble>(status.spatial_active_revision - 1)
                : -1.0;
        }
    }
    jdoubleArray result = env->NewDoubleArray(static_cast<jsize>(values.size()));
    if (!result) return nullptr;
    env->SetDoubleArrayRegion(result, 0, static_cast<jsize>(values.size()), values.data());
    return result;
}

extern "C" JNIEXPORT jint JNICALL Java_com_femonster_core_NativeAudioEngine_nativeSetChannelRouterParameters(
    JNIEnv* env,
    jclass,
    jlong revision,
    jint output_channels,
    jint algorithm,
    jfloatArray values,
    jint ramp_frames
) {
    if (revision < 0 || ramp_frames < 0 || ramp_frames > 4096) {
        return FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
    }
    FeRustChannelRouterParams params{};
    const int32_t parse_result = read_channel_router_parameters(
        env,
        output_channels,
        algorithm,
        values,
        &params
    );
    if (parse_result != FE_RUST_CHANNEL_ROUTER_OK) return static_cast<jint>(parse_result);

    std::scoped_lock lock(g_spatial_pipeline_mutex);
    if (g_spatial_pipeline == nullptr) return static_cast<jint>(E_HANDLE);
    // Native revision 1 is reserved for the router created from the existing
    // spatial-control ABI. Explicit Java snapshots start at native revision 2.
    const uint64_t native_revision = static_cast<uint64_t>(revision) + 2u;
    return static_cast<jint>(fe_audio_pipeline_set_channel_router_params(
        g_spatial_pipeline,
        native_revision,
        &params,
        static_cast<uint32_t>(ramp_frames)
    ));
}

extern "C" JNIEXPORT jdoubleArray JNICALL Java_com_femonster_core_NativeAudioEngine_nativeChannelRouterStatus(
    JNIEnv* env,
    jclass
) {
    std::array<jdouble, kChannelRouterStatusValueCount> values{};
    std::scoped_lock lock(g_spatial_pipeline_mutex);
    if (g_spatial_pipeline != nullptr) {
        values[0] = 1.0;
        FeRustChannelRouterStatus status{};
        status.struct_size = sizeof(status);
        status.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
        const int32_t status_result = fe_audio_pipeline_get_channel_router_status(
            g_spatial_pipeline,
            &status
        );
        values[1] = status.available;
        values[2] = status.active;
        values[3] = status.actual;
        values[4] = status.output_channels;
        values[5] = status.algorithm;
        values[6] = status_result == FE_RUST_CHANNEL_ROUTER_OK
            ? status.last_result
            : status_result;
        values[7] = status.active_revision >= 2
            ? static_cast<jdouble>(status.active_revision - 2)
            : -1.0;
        values[8] = status.staged_revision >= 2
            ? static_cast<jdouble>(status.staged_revision - 2)
            : -1.0;
        values[9] = static_cast<jdouble>(status.process_calls);
        for (size_t channel = 0; channel < FE_RUST_CHANNEL_ROUTER_MAX_CHANNELS; ++channel) {
            values[10 + channel] = status.channel_peak[channel];
            values[18 + channel] = status.channel_rms[channel];
            values[26 + channel] = status.channel_azimuth_deg[channel];
        }
    }
    jdoubleArray result = env->NewDoubleArray(static_cast<jsize>(values.size()));
    if (!result) return nullptr;
    env->SetDoubleArrayRegion(result, 0, static_cast<jsize>(values.size()), values.data());
    return result;
}

extern "C" JNIEXPORT jint JNICALL Java_com_femonster_core_NativeAudioEngine_nativeGenerateChannelTestSignal(
    JNIEnv*,
    jclass,
    jint output_channels,
    jint channel_index,
    jint kind,
    jint duration_ms,
    jfloat frequency_hz,
    jfloat gain_db
) {
    if ((output_channels != 6 && output_channels != 8)
        || channel_index < 0
        || channel_index >= output_channels
        || (kind != static_cast<jint>(FE_RUST_TEST_SIGNAL_TONE)
            && kind != static_cast<jint>(FE_RUST_TEST_SIGNAL_IMPULSE))
        || duration_ms < 50
        || duration_ms > 2000
        || !std::isfinite(frequency_hz)
        || frequency_hz < 20.0f
        || frequency_hz > 20000.0f
        || !std::isfinite(gain_db)
        || gain_db < -60.0f
        || gain_db > 0.0f) {
        return FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
    }

    std::scoped_lock lock(g_spatial_pipeline_mutex);
    if (g_spatial_pipeline == nullptr) return static_cast<jint>(E_HANDLE);

    FeAudioPipelineStatus pipeline_status{};
    pipeline_status.struct_size = sizeof(pipeline_status);
    pipeline_status.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    if (FAILED(fe_audio_pipeline_get_status(g_spatial_pipeline, &pipeline_status))
        || pipeline_status.sample_rate < 16000
        || pipeline_status.sample_rate > 192000) {
        return FE_RUST_CHANNEL_ROUTER_UNSUPPORTED;
    }
    FeRustChannelRouterStatus router_status{};
    router_status.struct_size = sizeof(router_status);
    router_status.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
    if (fe_audio_pipeline_get_channel_router_status(g_spatial_pipeline, &router_status)
            != FE_RUST_CHANNEL_ROUTER_OK
        || router_status.output_channels != static_cast<uint32_t>(output_channels)) {
        return FE_RUST_CHANNEL_ROUTER_UNSUPPORTED;
    }

    FeRustTestSignalConfig config{};
    config.struct_size = sizeof(config);
    config.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
    config.sample_rate = pipeline_status.sample_rate;
    config.output_channels = static_cast<uint32_t>(output_channels);
    config.channel_index = static_cast<uint32_t>(channel_index);
    config.kind = static_cast<uint32_t>(kind);
    config.frequency_hz = frequency_hz;
    config.gain_db = gain_db;

    const uint64_t total_frames = (
        static_cast<uint64_t>(pipeline_status.sample_rate)
            * static_cast<uint64_t>(duration_ms)
        + 999u
    ) / 1000u;
    if (total_frames == 0 || total_frames > UINT32_MAX) {
        return FE_RUST_CHANNEL_ROUTER_INVALID_ARGUMENT;
    }
    return static_cast<jint>(fe_audio_pipeline_queue_channel_test_signal(
        g_spatial_pipeline,
        &config,
        static_cast<uint32_t>(total_frames)
    ));
}

extern "C" JNIEXPORT void JNICALL Java_com_femonster_core_NativeAudioEngine_nativeStopSpatial(
    JNIEnv*,
    jclass
) {
    std::scoped_lock lock(g_spatial_pipeline_mutex);
    if (g_spatial_pipeline != nullptr) {
        fe_audio_pipeline_destroy(g_spatial_pipeline);
        g_spatial_pipeline = nullptr;
    }
    g_spatial_input_channels = 0;
}

extern "C" JNIEXPORT jdoubleArray JNICALL Java_com_femonster_core_NativeAudioEngine_nativeSpatialStatus(
    JNIEnv* env,
    jclass
) {
    constexpr size_t kStatusValueCount = 32;
    std::array<jdouble, kStatusValueCount> values{};
    std::scoped_lock lock(g_spatial_pipeline_mutex);
    if (g_spatial_pipeline != nullptr) {
        FeAudioPipelineStatus status{};
        status.struct_size = sizeof(status);
        status.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
        if (SUCCEEDED(fe_audio_pipeline_get_status(g_spatial_pipeline, &status))) {
            values[0] = 1.0;
            values[1] = status.running;
            values[2] = status.renderer_ready;
            values[3] = status.sample_rate;
            values[4] = status.input_channels;
            values[5] = status.renderer_input_channels;
            values[6] = status.output_channels;
            values[7] = status.buffers_queued;
            values[8] = static_cast<jdouble>(status.buffers_submitted);
            values[9] = static_cast<jdouble>(status.buffers_consumed);
            values[10] = static_cast<jdouble>(status.frames_processed);
            values[11] = static_cast<jdouble>(status.dropped_buffers);
            values[12] = static_cast<jdouble>(status.obr_process_calls);
            values[13] = static_cast<jdouble>(status.x3d_calculate_calls);
            values[14] = static_cast<jdouble>(status.rust_upmix_process_calls);
            values[15] = static_cast<jdouble>(status.rust_upmix_fallback_blocks);
            values[16] = status.rust_upmix_active;
            values[17] = status.rust_upmix_last_result;
            values[18] = status.output_energy;
            values[19] = status.x3d_matrix_left;
            values[20] = status.x3d_matrix_right;
            values[21] = status.last_hresult;
            values[22] = static_cast<jdouble>(status.queue_underruns);
            values[23] = static_cast<jdouble>(status.buffer_pool_exhaustions);
            values[24] = status.voice_started;
            values[25] = status.preroll_target_buffers;
            values[26] = status.upmix_enabled;
            values[27] = status.obr_enabled;
            values[28] = status.obr_filter_profile;
            values[29] = status.spatial_renderer_input_channels;
            values[30] = status.spatial_active_revision > 0
                ? static_cast<jdouble>(status.spatial_active_revision - 1)
                : -1.0;
            FeAudioMixerPipelineStatus mixer_status{};
            mixer_status.struct_size = sizeof(mixer_status);
            mixer_status.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
            if (SUCCEEDED(fe_audio_pipeline_get_mixer_status(g_spatial_pipeline, &mixer_status))) {
                values[31] = static_cast<jdouble>(mixer_status.mixer_process_calls);
            }
        }
    }
    jdoubleArray result = env->NewDoubleArray(static_cast<jsize>(values.size()));
    if (!result) return nullptr;
    env->SetDoubleArrayRegion(result, 0, static_cast<jsize>(values.size()), values.data());
    return result;
}
