#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <limits>
#include <mutex>
#include <string>
#include <vector>

using HRESULT = int32_t;
using DWORD = uint32_t;
using LONGLONG = long long;
using HANDLE = void*;
struct LARGE_INTEGER { LONGLONG QuadPart; };
struct FILETIME { DWORD dwLowDateTime, dwHighDateTime; };
constexpr HRESULT S_OK = 0, E_HANDLE = -1, E_FAIL = -2, E_ABORT = -3, E_INVALIDARG = -4;
constexpr int ERROR_TIMEOUT = 5;
#define HRESULT_FROM_WIN32(value) (-static_cast<HRESULT>(value))
constexpr bool FALSE = false;
constexpr DWORD TIMER_ALL_ACCESS = 0, WAIT_OBJECT_0 = 0;
constexpr int FE_AUDIO_MODE_X3D_SPEAKER = 1;
constexpr uint32_t XAUDIO2_VOICE_NOSAMPLESPLAYED = 1;
constexpr uint64_t kUnsequencedSubmission = UINT64_MAX;
#define FAILED(value) ((value) < 0)
// PRODUCTION_CONSTANTS
int64_t wall_ms = 100000, tick_ms = 100000;
void advance(int64_t milliseconds) { wall_ms += milliseconds; tick_ms += milliseconds; }
void GetSystemTimePreciseAsFileTime(FILETIME* value) {
    const uint64_t ticks = static_cast<uint64_t>(wall_ms + 11'644'473'600'000LL) * 10000u;
    value->dwLowDateTime = static_cast<DWORD>(ticks); value->dwHighDateTime = static_cast<DWORD>(ticks >> 32u);
}
uint64_t GetTickCount64() { return static_cast<uint64_t>(tick_ms); }
int due_ms = 0;
HANDLE CreateWaitableTimerExW(void*, void*, DWORD, DWORD) { return &due_ms; }
HANDLE CreateWaitableTimerW(void*, bool, void*) { return &due_ms; }
bool SetWaitableTimer(HANDLE, LARGE_INTEGER* due, int, void*, void*, bool) { due_ms = static_cast<int>(-due->QuadPart / 10000); return true; }
DWORD WaitForSingleObject(HANDLE, DWORD) { advance(due_ms); return WAIT_OBJECT_0; }
void Sleep(DWORD milliseconds) { advance(milliseconds); }
bool CloseHandle(HANDLE) { return true; }
struct XAUDIO2_VOICE_STATE { uint32_t BuffersQueued = 2; };
struct XAUDIO2_VOICE_DETAILS { uint32_t InputSampleRate = 48000; };
struct XAUDIO2_PERFORMANCE_DATA { uint32_t CurrentLatencyInSamples = 480; };
struct Voice {
    float volume = 0;
    uint32_t queued = 2, mix_rate = 48000;
    int calls = 0, fail_at = -1;
    std::array<float, 512> commands{};
    void GetVolume(float* result) { *result = volume; }
    HRESULT SetVolume(float gain) {
        commands[calls++] = gain;
        if (calls == fail_at) return E_FAIL;
        volume = gain; return S_OK;
    }
    void GetState(XAUDIO2_VOICE_STATE* state, uint32_t) { state->BuffersQueued = queued; }
    void GetVoiceDetails(XAUDIO2_VOICE_DETAILS* details) { details->InputSampleRate = mix_rate; }
};
struct Engine {
    uint32_t latency_samples = 480;
    void GetPerformanceData(XAUDIO2_PERFORMANCE_DATA* data) { data->CurrentLatencyInSamples = latency_samples; }
};
struct QueuedAudioBuffer { std::vector<float> samples; bool in_use = true; };
struct Pipeline {
    Voice voice, master;
    Engine engine;
    Voice* source_voice_ = &voice;
    Voice* mastering_voice_ = &master;
    Engine* engine_ = &engine;
    std::mutex spatial_control_mutex_;
    std::atomic<bool> running_{true}, voice_started_{true}, muted_{true}, timeline_resetting_{false};
    std::atomic<uint64_t> timeline_generation_{1};
    uint32_t sample_rate_ = 48000;
    int mode_ = 0;
    uint32_t underrun_fade_in_frame_ = kUnderrunFadeInactive;
    std::atomic<int64_t> output_gain_lease_deadline_ms_{0}, output_gain_lease_deadline_tick_ms_{0};
    uint64_t output_gain_lease_sequence_ = 0;
    float output_gain_lease_target_ = 0, output_gain_lease_envelope_ = 1;
    int64_t output_gain_lease_expired_at_tick_ms_ = 0;
    int64_t output_gain_clock_anchor_wall_ms_ = wall_ms;
    int64_t output_gain_clock_anchor_tick_ms_ = tick_ms;
    HRESULT RememberFailure(HRESULT value) { return value; }
    // PRODUCTION_METHODS
};
std::vector<std::string> failures;
void check(bool passed, const char* message) {
    if (!passed && std::find(failures.begin(), failures.end(), message) == failures.end()) failures.emplace_back(message);
}
bool silent(const QueuedAudioBuffer& buffer) {
    return std::all_of(buffer.samples.begin(), buffer.samples.end(), [](float value) { return value == 0; });
}
int main() {
    Pipeline p;
    const int64_t initial_tick = tick_ms;
    check(p.SetOutputGain(.5f, 1, 1, wall_ms + 1000) == S_OK && p.voice.volume == .5f,
        "half-gain handoff was not acknowledged");
    const int64_t ack_ms = tick_ms - initial_tick;
    check(ack_ms >= 64 && ack_ms < 128, "gain ACK lacks a bounded processing/output settle interval");
    const int commands = p.voice.calls;
    check(p.SetOutputGain(.5f, 1, 1, wall_ms + 1000) == S_OK && p.voice.calls == commands,
        "same-sequence same-gain retry repeats the voice fade");
    check(p.SetOutputGain(1, 1, 1, wall_ms + 1000) == E_ABORT, "conflicting same-sequence gain was accepted");
    check(p.SetOutputGain(1, 2, 2, wall_ms + 1000) == E_ABORT, "obsolete generation gained authority");
    check(p.SetOutputGain(1, 1, 0, wall_ms + 1000) == E_INVALIDARG, "zero gain sequence was accepted");
    check(p.SetOutputGain(std::numeric_limits<float>::quiet_NaN(), 1, 2, wall_ms + 1000) == E_INVALIDARG,
        "nonfinite gain was accepted");
    check(p.SetOutputGain(1, 1, 2, wall_ms - 1) == E_ABORT, "late expired gain request raised output");
    check(p.SetOutputGain(1, 1, 2, wall_ms + 5000) == E_ABORT, "unbounded lease was accepted");
    check(p.RenewOutputGainLease(1, 1, wall_ms + 1000) == S_OK, "valid lease renewal failed");
    check(p.RenewOutputGainLease(1, 2, wall_ms + 1000) == E_ABORT, "renewal of a different sequence was accepted");
    QueuedAudioBuffer live{std::vector<float>(512, .8f)};
    p.OnBufferStart(&live);
    check(std::all_of(live.samples.begin(), live.samples.end(), [](float value) { return value == .8f; }),
        "valid lease changed steady PCM");
    wall_ms = p.output_gain_lease_deadline_ms_.load();
    tick_ms = p.output_gain_lease_deadline_tick_ms_.load();
    QueuedAudioBuffer first_expired{std::vector<float>(512, .8f)};
    p.OnBufferStart(&first_expired);
    check(first_expired.samples.front() < .8f && first_expired.samples.back() > 0,
        "expiry did not begin a bounded sample-domain fade");
    for (int i = 0; i < 3; ++i) {
        advance(6); live.samples.assign(512, .8f); p.OnBufferStart(&live);
    }
    check(silent(live) && p.output_gain_lease_deadline_tick_ms_.load() < 0,
        "expired lease did not latch silent output");
    check(p.RenewOutputGainLease(1, 1, wall_ms + 1000) == E_ABORT, "renewal resurrected an expired sequence");
    check(p.SetOutputGain(.5f, 1, 1, wall_ms + 1000) == E_ABORT, "same-sequence gain retry resurrected expiry");
    check(p.SetOutputGain(.5f, 1, 2, wall_ms + 1000) == S_OK, "new valid sequence cannot authorize output again");
    advance(1500);
    live.samples.assign(512, .8f); p.OnBufferStart(&live);
    check(silent(live), "PCM arriving long after expiry played an audible recovery burst");
    check(p.SetOutputGain(.5f, 1, 1, wall_ms + 1000) == E_ABORT, "older sequence regained authority");
    p.ResetOutputGainLease();
    check(p.output_gain_lease_deadline_tick_ms_.load() == 0 && p.output_gain_lease_sequence_ == 0
        && p.output_gain_lease_envelope_ == 1, "timeline reset retains a stale lease");
    p.timeline_generation_ = 2;
    check(p.SetOutputGain(.5f, 1, 3, wall_ms + 1000) == E_ABORT, "old generation can authorize reset voice");
    check(p.SetOutputGain(.5f, 2, 1, wall_ms + 1000) == S_OK, "new timeline cannot establish its own lease");
    // A wall-clock rollback cannot extend output past the monotonic deadline.
    wall_ms -= 60000;
    tick_ms += 1200;
    live.samples.assign(512, .8f); p.OnBufferStart(&live);
    check(silent(live), "wall-clock rollback extended an expired lease");
    check(p.RenewOutputGainLease(2, 1, wall_ms + 1000) == E_ABORT,
        "wall-clock rollback lets renewal revive an expired sequence");
    // A forward jump is also an expiry, even before the monotonic deadline.
    p.ResetOutputGainLease();
    p.timeline_generation_ = 3;
    check(p.SetOutputGain(.5f, 3, 1, wall_ms + 1000) == S_OK, "fresh generation after clock shift failed");
    wall_ms += 2000;
    live.samples.assign(512, .8f); p.OnBufferStart(&live);
    check(silent(live), "forward wall-clock expiry did not silence output");
    Pipeline delayed;
    check(delayed.SetOutputGain(.5f, 1, 1, wall_ms + 1000) == S_OK, "initial delayed-request fixture failed");
    const int64_t delayed_request_deadline = wall_ms + 1000;
    const int before_delayed_calls = delayed.voice.calls;
    wall_ms -= 500;
    advance(1200);
    check(delayed.SetOutputGain(1, 1, 2, delayed_request_deadline) == E_ABORT
        && delayed.voice.calls == before_delayed_calls,
        "wall rollback allowed a new-sequence request delayed beyond its original lease to raise output");
    Pipeline mismatched_rate;
    mismatched_rate.sample_rate_ = 8000;
    mismatched_rate.master.mix_rate = 48000;
    mismatched_rate.engine.latency_samples = 480;
    DWORD settle = 0;
    check(mismatched_rate.SourceGainSettleMilliseconds(&settle) == S_OK && settle == 32,
        "output latency was divided by source rate instead of mastering rate");
    mismatched_rate.engine.latency_samples = 48000;
    check(mismatched_rate.SetOutputGain(1, 1, 1, wall_ms + 1000) < 0 && mismatched_rate.voice.calls == 0,
        "unsupported output latency raised volume before refusing the handoff");
    Pipeline too_short;
    check(too_short.SetOutputGain(1, 1, 1, wall_ms + 20) == E_ABORT && too_short.voice.volume == 0,
        "lease expiry during the gain operation returned success or left volume raised");
    Pipeline failing;
    failing.voice.fail_at = 3;
    check(failing.SetOutputGain(1, 1, 1, wall_ms + 1000) == E_FAIL,
        "device volume failure returned a successful handoff");
    std::cout << "{\"pass\":" << (failures.empty() ? "true" : "false")
        << ",\"deviceInitialized\":false,\"halfGainAckMs\":" << ack_ms
        << ",\"expiredFirstSample\":" << first_expired.samples.front()
        << ",\"expiredEndOfFirstBlock\":" << first_expired.samples.back()
        << ",\"silenceAfterExpiry\":" << (silent(live) ? "true" : "false") << ",\"failures\":[";
    for (size_t i = 0; i < failures.size(); ++i) std::cout << (i ? "," : "") << '"' << failures[i] << '"';
    std::cout << "]}\n";
}
