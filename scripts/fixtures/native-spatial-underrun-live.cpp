#define NOMINMAX
#include <windows.h>
#include <xaudio2.h>
#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <vector>

constexpr int FE_AUDIO_MODE_X3D_SPEAKER = 1;
constexpr uint32_t kUnderrunFadeInactive = UINT32_MAX;
struct QueuedAudioBuffer { std::vector<float> samples; bool in_use = true; };
struct Pipeline {
    IXAudio2SourceVoice* source_voice_ = nullptr;
    std::atomic<bool> running_{true}, timeline_resetting_{false};
    uint32_t sample_rate_ = 48000;
    int mode_ = 0;
    uint32_t underrun_fade_in_frame_ = kUnderrunFadeInactive;
    std::atomic<int64_t> output_gain_lease_deadline_ms_{0}, output_gain_lease_deadline_tick_ms_{0};
    float output_gain_lease_envelope_ = 1;
    int64_t output_gain_lease_expired_at_tick_ms_ = 0;
    // PRODUCTION_METHODS
};
struct Callback final : IXAudio2VoiceCallback {
    Pipeline* pipeline;
    HANDLE completed = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    std::atomic<int> started{0}, ended{0};
    std::atomic<HRESULT> error{S_OK};
    std::array<uint32_t, 12> actual_queue_counts{};
    std::array<LONGLONG, 12> callback_ticks{};
    explicit Callback(Pipeline* value) : pipeline(value) {}
    ~Callback() { CloseHandle(completed); }
    void STDMETHODCALLTYPE OnVoiceProcessingPassStart(UINT32) override {}
    void STDMETHODCALLTYPE OnVoiceProcessingPassEnd() override {}
    void STDMETHODCALLTYPE OnStreamEnd() override {}
    void STDMETHODCALLTYPE OnBufferStart(void* context) override {
        const int index = started.load();
        XAUDIO2_VOICE_STATE state{};
        pipeline->source_voice_->GetState(&state, XAUDIO2_VOICE_NOSAMPLESPLAYED);
        LARGE_INTEGER begin{}, end{};
        QueryPerformanceCounter(&begin);
        pipeline->OnBufferStart(static_cast<QueuedAudioBuffer*>(context));
        QueryPerformanceCounter(&end);
        if (index < actual_queue_counts.size()) {
            actual_queue_counts[index] = state.BuffersQueued;
            callback_ticks[index] = end.QuadPart - begin.QuadPart;
        }
        started.fetch_add(1);
    }
    void STDMETHODCALLTYPE OnBufferEnd(void*) override { ended.fetch_add(1); SetEvent(completed); }
    void STDMETHODCALLTYPE OnLoopEnd(void*) override {}
    void STDMETHODCALLTYPE OnVoiceError(void*, HRESULT value) override { error.store(value); SetEvent(completed); }
    bool Wait(int count) {
        const uint64_t deadline = GetTickCount64() + 2000;
        while (ended.load() < count && SUCCEEDED(error.load()) && GetTickCount64() < deadline) {
            WaitForSingleObject(completed, 20);
        }
        return ended.load() >= count && SUCCEEDED(error.load());
    }
};
int main() {
    const HRESULT com = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    IXAudio2* engine = nullptr;
    IXAudio2MasteringVoice* master = nullptr;
    Pipeline pipeline;
    Callback callback(&pipeline);
    bool pass = SUCCEEDED(XAudio2Create(&engine));
    if (pass) pass = SUCCEEDED(engine->CreateMasteringVoice(&master, 2, 48000));
    // Mute the mastering voice before any source is created or started.
    if (pass) pass = SUCCEEDED(master->SetVolume(0));
    WAVEFORMATEX format{};
    format.wFormatTag = WAVE_FORMAT_IEEE_FLOAT; format.nChannels = 2;
    format.nSamplesPerSec = 48000; format.wBitsPerSample = 32;
    format.nBlockAlign = 8; format.nAvgBytesPerSec = 384000;
    if (pass) pass = SUCCEEDED(engine->CreateSourceVoice(&pipeline.source_voice_, &format, 0, 1, &callback));
    std::array<QueuedAudioBuffer, 9> buffers;
    for (size_t i = 0; i < buffers.size(); ++i) buffers[i].samples.assign(512, i >= 3 && i < 6 ? -.6f : .8f);
    auto submit = [&](int first, int last) {
        for (int i = first; i < last && pass; ++i) {
            XAUDIO2_BUFFER packet{};
            packet.pAudioData = reinterpret_cast<const BYTE*>(buffers[i].samples.data());
            packet.AudioBytes = static_cast<UINT32>(buffers[i].samples.size() * sizeof(float));
            packet.pContext = &buffers[i];
            pass = SUCCEEDED(pipeline.source_voice_->SubmitSourceBuffer(&packet));
        }
    };
    if (pass) submit(0, 3);
    if (pass) pass = SUCCEEDED(pipeline.source_voice_->Start());
    if (pass) pass = callback.Wait(3);
    // Leave a genuine empty source queue while the voice stays started.
    if (pass) Sleep(35);
    if (pass) submit(3, 6);
    if (pass) pass = callback.Wait(6);
    if (pass) {
        pipeline.output_gain_lease_deadline_ms_ = Pipeline::CurrentUnixMilliseconds() - 40;
        pipeline.output_gain_lease_deadline_tick_ms_ = Pipeline::CurrentMonotonicMilliseconds() - 40;
        submit(6, 9);
    }
    if (pass) pass = callback.Wait(9);
    if (pipeline.source_voice_) { pipeline.source_voice_->DestroyVoice(); pipeline.source_voice_ = nullptr; }
    if (master) master->DestroyVoice();
    if (engine) engine->Release();
    if (SUCCEEDED(com)) CoUninitialize();
    const bool steady_exact = std::all_of(buffers[0].samples.begin(), buffers[0].samples.end(), [](float value) { return value == .8f; })
        && std::all_of(buffers[1].samples.begin(), buffers[1].samples.end(), [](float value) { return value == .8f; });
    bool expired_silent = true;
    for (int i = 6; i < 9; ++i) for (float value : buffers[i].samples) expired_silent &= value == 0;
    pass &= callback.actual_queue_counts[0] == 3 && callback.actual_queue_counts[1] == 2 && callback.actual_queue_counts[2] == 1;
    pass &= steady_exact && buffers[2].samples.back() == 0 && buffers[3].samples.front() == 0 && expired_silent;
    LARGE_INTEGER frequency{};
    QueryPerformanceFrequency(&frequency);
    const double maximum_us = *std::max_element(callback.callback_ticks.begin(), callback.callback_ticks.end())
        * 1000000.0 / frequency.QuadPart;
    std::cout << "{\"pass\":" << (pass ? "true" : "false")
        << ",\"deviceInitialized\":true,\"masterGain\":0,\"sourceBuffersConsumed\":" << callback.ended.load()
        << ",\"tailToSilenceJump\":" << std::abs(buffers[2].samples.back())
        << ",\"silenceToResumeJump\":" << std::abs(buffers[3].samples.front())
        << ",\"steadyPcmExact\":" << (steady_exact ? "true" : "false")
        << ",\"expiredPcmSilent\":" << (expired_silent ? "true" : "false")
        << ",\"maxProductionCallbackUs\":" << maximum_us << ",\"actualQueueCounts\":[";
    for (int i = 0; i < 9; ++i) std::cout << (i ? "," : "") << callback.actual_queue_counts[i];
    std::cout << "]}\n";
    return pass ? 0 : 1;
}
