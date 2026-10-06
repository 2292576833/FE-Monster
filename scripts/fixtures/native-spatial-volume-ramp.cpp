#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <mutex>
#include <new>
#include <string>
#include <vector>

using HRESULT = int32_t;
using DWORD = uint32_t;
using LONGLONG = long long;
using HANDLE = void*;
struct LARGE_INTEGER { LONGLONG QuadPart; };
constexpr HRESULT S_OK = 0, E_HANDLE = -1, E_FAIL = -2;
constexpr bool FALSE = false;
constexpr DWORD TIMER_ALL_ACCESS = 0, WAIT_OBJECT_0 = 0, WAIT_FAILED = ~0u;
#define FAILED(value) ((value) < 0)
#define SUCCEEDED(value) ((value) >= 0)
// PRODUCTION_CONSTANTS

bool deny_allocations = false;
void* operator new(std::size_t size) {
    if (deny_allocations) throw std::bad_alloc();
    if (void* result = std::malloc(size)) return result;
    throw std::bad_alloc();
}
void operator delete(void* value) noexcept { std::free(value); }
void operator delete(void* value, std::size_t) noexcept { std::free(value); }

struct Clock {
    double milliseconds = 0;
    int created = 0, closed = 0, sleeps = 0, waits = 0;
    bool create_fails = false, arm_fails = false, wait_fails = false;
    double due_ms = 0;
} clock_state;
HANDLE CreateWaitableTimerExW(void*, void*, DWORD, DWORD) {
    if (clock_state.create_fails) return nullptr;
    clock_state.created++;
    return &clock_state;
}
HANDLE CreateWaitableTimerW(void*, bool, void*) {
    return CreateWaitableTimerExW(nullptr, nullptr, 0, 0);
}
bool SetWaitableTimer(HANDLE, LARGE_INTEGER* due, int, void*, void*, bool) {
    clock_state.due_ms = -due->QuadPart / 10000.0;
    return !clock_state.arm_fails;
}
DWORD WaitForSingleObject(HANDLE, DWORD) {
    clock_state.waits++;
    if (clock_state.wait_fails) return WAIT_FAILED;
    clock_state.milliseconds += clock_state.due_ms;
    return WAIT_OBJECT_0;
}
void Sleep(DWORD milliseconds) { clock_state.sleeps++; clock_state.milliseconds += milliseconds; }
bool CloseHandle(HANDLE) { clock_state.closed++; return true; }
int mta_releases = 0;
void CoDecrementMTAUsage(void*) { mta_releases++; }

struct Voice {
    float volume = 1;
    int calls = 0, fail_at_call = 0, stops = 0, flushes = 0, destroyed = 0;
    float stop_volume = -1;
    double stop_time = -1;
    std::array<float, 128> gains{};
    std::array<double, 128> times{};
    void GetVolume(float* result) noexcept { *result = volume; }
    HRESULT SetVolume(float gain) noexcept {
        gains[calls] = gain;
        times[calls++] = clock_state.milliseconds;
        if (calls == fail_at_call) return E_FAIL;
        volume = gain;
        return S_OK;
    }
    HRESULT Stop(int) noexcept {
        stops++; stop_volume = volume; stop_time = clock_state.milliseconds;
        return E_FAIL; // Cleanup must continue even if stopping reports failure.
    }
    HRESULT FlushSourceBuffers() noexcept { flushes++; return E_FAIL; }
    void DestroyVoice() noexcept { destroyed++; }
};
struct Engine { int releases = 0; void Release() noexcept { releases++; } };
struct Bridge { int shutdowns = 0; void Shutdown() noexcept { shutdowns++; } };
struct Buffer { bool in_use = true; };
struct Pipeline {
    Voice* source_voice_ = nullptr;
    Voice* mastering_voice_ = nullptr;
    Engine* engine_ = nullptr;
    std::atomic<bool> muted_{false}, running_{true}, renderer_ready_{true}, voice_started_{true};
    std::atomic<bool> mixer_active_{true}, mixer_available_{true}, rust_upmix_active_{true};
    std::atomic<int> buffers_queued_{1};
    std::mutex spatial_control_mutex_, buffer_mutex_;
    std::condition_variable buffer_available_cv_;
    std::vector<Buffer*> free_buffers_;
    std::vector<std::unique_ptr<Buffer>> buffer_pool_;
    std::unique_ptr<int> obr_output_, obr_input_, obr_renderer_;
    Bridge rust_mixer_, rust_upmixer_, rust_channel_router_;
    std::vector<float> mixer_original_scratch_, mixer_work_scratch_, rust_stereo_scratch_, rust_upmix_scratch_, spatial_cache_;
    bool channel_router_active_ = true, spatial_cache_uses_explicit_router_ = true, mta_usage_active_ = true;
    uint64_t spatial_cache_revision_ = 1, spatial_cache_router_revision_ = 1, spatial_cache_generation_ = 1, obr_position_revision_ = 1;
    void* mta_usage_cookie_ = this;
    HRESULT last_error = S_OK;
    HRESULT RememberFailure(HRESULT result) noexcept { last_error = result; return result; }
    // PRODUCTION_METHODS
};

std::vector<std::string> failures;
void check(bool passed, const char* message) { if (!passed) failures.emplace_back(message); }
double max_step(const Voice& voice, float initial) {
    double result = 0;
    for (int i = 0; i < voice.calls; ++i) {
        result = std::max(result, std::abs(static_cast<double>(voice.gains[i] - initial)));
        initial = voice.gains[i];
    }
    return result;
}
double quantum_step(const Voice& voice, float initial, int phase) {
    double result = 0;
    float applied = initial;
    int cursor = 0;
    for (int tick = phase; tick < 80; tick += 10) {
        float next = applied;
        while (cursor < voice.calls && voice.times[cursor] <= tick) next = voice.gains[cursor++];
        result = std::max(result, std::abs(static_cast<double>(next - applied)));
        applied = next;
    }
    return result;
}
int main() {
    double down_step = 0, up_step = 0, duration = 0, quantum_worst = 0, shutdown_start = -1;
    {
        clock_state = {};
        Voice voice; Pipeline p; p.source_voice_ = &voice;
        check(p.SetMuted(true) == S_OK, "mute failed");
        down_step = max_step(voice, 1); duration = clock_state.milliseconds;
        for (int phase = 0; phase < 10; ++phase) quantum_worst = std::max(quantum_worst, quantum_step(voice, 1, phase));
        check(voice.calls >= 8 && down_step <= .126, "mute still has a full-scale gain step");
        check(duration >= 28 && duration <= 48, "mute envelope has no bounded timed fade");
        check(voice.volume == 0 && p.muted_.load(), "mute target not reached");
        int calls = voice.calls; double time = clock_state.milliseconds;
        check(p.SetMuted(true) == S_OK && voice.calls == calls && clock_state.milliseconds == time,
            "repeated muted target should have no commands or wait");
        check(clock_state.created == clock_state.closed, "mute leaked timer");
    }
    {
        clock_state = {};
        Voice voice; voice.volume = 0; Pipeline p; p.source_voice_ = &voice; p.muted_ = true;
        check(p.SetMuted(false) == S_OK, "unmute failed"); up_step = max_step(voice, 0);
        check(voice.calls >= 8 && up_step <= .126 && voice.volume == 1, "unmute still has a full-scale gain step");
        int calls = voice.calls;
        check(p.SetMuted(false) == S_OK && voice.calls == calls, "repeated unmuted target sends volume again");
    }
    {
        clock_state = {};
        Voice voice; voice.volume = 0; Pipeline p; p.source_voice_ = &voice; p.voice_started_ = false; p.muted_ = true;
        check(p.SetMuted(true) == S_OK && voice.calls == 0, "initially muted voice must remain silent without a ramp");
        check(p.SetMuted(false) == S_OK && voice.volume == 1 && clock_state.milliseconds == 0,
            "a voice that has never started should not spend time fading");
    }
    {
        clock_state = {};
        Voice voice; voice.volume = .35f; Pipeline p; p.source_voice_ = &voice;
        check(p.SetMuted(false) == S_OK && max_step(voice, .35f) <= .083, "fade must start at current voice gain");
        voice.calls = 0; voice.fail_at_call = 3;
        check(p.SetMuted(true) == E_FAIL && p.last_error == E_FAIL, "volume failure is not returned");
        check(clock_state.created == clock_state.closed, "failed fade leaked timer");
        voice.fail_at_call = 0;
        check(p.SetMuted(true) == S_OK && voice.volume == 0, "repeated mute must retry a failed partial fade");
    }
    for (int failure = 0; failure < 3; ++failure) {
        clock_state = {};
        clock_state.create_fails = failure == 0;
        clock_state.arm_fails = failure == 1;
        clock_state.wait_fails = failure == 2;
        Voice voice; Pipeline p; p.source_voice_ = &voice;
        check(p.SetMuted(true) == S_OK && voice.volume == 0 && clock_state.milliseconds >= 28,
            "timer failure must preserve fade duration with a control-thread fallback");
        check(clock_state.created == clock_state.closed, "fallback fade leaked timer");
    }
    check(noexcept(std::declval<Pipeline&>().Shutdown()), "destructor cleanup must be noexcept");
    for (int failure = 0; failure < 2; ++failure) {
        clock_state = {};
        Voice voice, master; Engine engine;
        voice.fail_at_call = failure ? 3 : 0;
        Pipeline p; p.source_voice_ = &voice; p.mastering_voice_ = &master; p.engine_ = &engine;
        p.buffer_pool_.push_back(std::make_unique<Buffer>());
        p.obr_output_ = std::make_unique<int>(1);
        if constexpr (noexcept(std::declval<Pipeline&>().Shutdown())) deny_allocations = true;
        p.Shutdown();
        deny_allocations = false;
        if (!failure) {
            shutdown_start = voice.stop_volume;
            check(voice.stop_volume == 0 && voice.stop_time >= 28, "Shutdown stops an audible voice before fading");
        }
        check(voice.stops == 1 && voice.flushes == 1 && voice.destroyed == 1 && master.destroyed == 1 && engine.releases == 1,
            "shutdown failure skipped a voice or engine release");
        check(!p.source_voice_ && !p.mastering_voice_ && !p.engine_ && !p.obr_output_ && p.buffer_pool_.empty(),
            "shutdown retains audio resources");
        check(p.rust_mixer_.shutdowns == 1 && p.rust_upmixer_.shutdowns == 1 && p.rust_channel_router_.shutdowns == 1,
            "shutdown skips DSP bridge cleanup");
        check(clock_state.created == clock_state.closed, "shutdown leaked fade timer");
        p.Shutdown();
        check(voice.destroyed == 1 && engine.releases == 1, "shutdown is not idempotent");
    }
    { Pipeline p; check(p.SetMuted(true) == E_HANDLE, "missing source voice must return E_HANDLE"); p.Shutdown(); }
    std::cout << "{\"pass\":" << (failures.empty() ? "true" : "false")
        << ",\"deviceInitialized\":false,\"muteMaxCommandStep\":" << down_step
        << ",\"unmuteMaxCommandStep\":" << up_step
        << ",\"muteDurationMs\":" << duration
        << ",\"constantPcmAmplitude\":0.8,\"maxPcmCommandBoundaryJump\":" << .8 * down_step
        << ",\"simulated10msQuantumWorstStep\":" << quantum_worst
        << ",\"shutdownStopGain\":" << shutdown_start << ",\"failures\":[";
    for (size_t i = 0; i < failures.size(); ++i) std::cout << (i ? "," : "") << '"' << failures[i] << '"';
    std::cout << "]}\n";
}
