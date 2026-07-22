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
#include <thread>
#include <vector>

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

IXAudio2* g_engine = nullptr;
IXAudio2MasteringVoice* g_master_voice = nullptr;
X3DAUDIO_HANDLE g_x3d = {};
UINT32 g_output_channels = 0;
bool g_ready = false;

std::atomic<bool> g_capture_started{ false };
std::atomic<bool> g_capture_active{ false };
std::atomic<float> g_low_frequency{ 0.0f };
std::atomic<float> g_energy{ 0.0f };
std::atomic<float> g_beat{ 0.0f };
std::atomic<float> g_sample_rate{ 0.0f };
std::array<std::atomic<float>, kLowBandCount> g_low_frequency_bands{};

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

void analyze_window(const std::vector<float>& samples, UINT32 sample_rate) {
    if (samples.size() < kAnalysisWindow || sample_rate == 0) return;

    double rms_sum = 0.0;
    double low_sum = 0.0;
    int low_count = 0;
    std::array<float, kLowProbeCount> low_probes{};

    for (size_t index = 0; index < kAnalysisWindow; index += 1) {
        const double sample = samples[index];
        rms_sum += sample * sample;
    }

    for (size_t probe_index = 0; probe_index < kLowProbeCount; probe_index += 1) {
        const int hz = kLowMinHz + static_cast<int>(probe_index) * kLowStepHz;
        double real = 0.0;
        double imag = 0.0;
        const double angle_step = 2.0 * kPi * static_cast<double>(hz) / static_cast<double>(sample_rate);
        for (size_t index = 0; index < kAnalysisWindow; index += 1) {
            const double window = 0.5 - 0.5 * std::cos((2.0 * kPi * index) / static_cast<double>(kAnalysisWindow - 1));
            const double sample = samples[index] * window;
            const double angle = angle_step * static_cast<double>(index);
            real += sample * std::cos(angle);
            imag -= sample * std::sin(angle);
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

bool run_capture_session() {
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

    g_sample_rate.store(static_cast<float>(mix_format->nSamplesPerSec), std::memory_order_relaxed);
    constexpr REFERENCE_TIME buffer_duration = 10000000;
    hr = audio_client->Initialize(
        AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK,
        buffer_duration,
        0,
        mix_format,
        nullptr
    );
    if (FAILED(hr)) {
        CoTaskMemFree(mix_format);
        return false;
    }

    ComPtr<IAudioCaptureClient> capture_client;
    hr = audio_client->GetService(IID_PPV_ARGS(&capture_client));
    if (FAILED(hr) || !capture_client) {
        CoTaskMemFree(mix_format);
        return false;
    }

    hr = audio_client->Start();
    if (FAILED(hr)) {
        CoTaskMemFree(mix_format);
        return false;
    }

    std::vector<float> pending;
    pending.reserve(kAnalysisWindow * 2);
    UINT32 empty_ticks = 0;

    while (true) {
        Sleep(10);

        UINT32 packet_frames = 0;
        hr = capture_client->GetNextPacketSize(&packet_frames);
        if (FAILED(hr)) break;

        if (packet_frames == 0) {
            empty_ticks += 1;
            if (empty_ticks > 16) {
                decay_sample();
                g_capture_active.store(false, std::memory_order_relaxed);
                empty_ticks = 0;
            }
            continue;
        }

        empty_ticks = 0;
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
    CoTaskMemFree(mix_format);
    g_capture_active.store(false, std::memory_order_relaxed);
    return false;
}

void capture_thread_main() {
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    const bool com_ready = SUCCEEDED(hr) || hr == RPC_E_CHANGED_MODE;
    if (!com_ready) return;

    while (true) {
        run_capture_session();
        decay_sample();
        Sleep(1000);
    }
}

void start_capture_once() {
    bool expected = false;
    if (!g_capture_started.compare_exchange_strong(expected, true)) return;
    std::thread(capture_thread_main).detach();
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
    if (ready) start_capture_once();
    return ready ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jfloatArray JNICALL Java_com_femonster_core_NativeAudioEngine_nativeSampleState(
    JNIEnv* env,
    jclass
) {
    std::array<jfloat, 5 + kLowBandCount> values{};
    values[0] = g_low_frequency.load(std::memory_order_relaxed);
    values[1] = g_energy.load(std::memory_order_relaxed);
    values[2] = g_beat.load(std::memory_order_relaxed);
    values[3] = g_sample_rate.load(std::memory_order_relaxed);
    values[4] = g_capture_active.load(std::memory_order_relaxed) ? 1.0f : 0.0f;
    for (size_t index = 0; index < kLowBandCount; index += 1) {
        values[5 + index] = g_low_frequency_bands[index].load(std::memory_order_relaxed);
    }
    jfloatArray result = env->NewFloatArray(static_cast<jsize>(values.size()));
    if (!result) return nullptr;
    env->SetFloatArrayRegion(result, 0, static_cast<jsize>(values.size()), values.data());
    return result;
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
