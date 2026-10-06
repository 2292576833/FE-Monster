#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <new>
#include <string>
#include <vector>

constexpr int FE_AUDIO_MODE_X3D_SPEAKER = 1;
constexpr uint32_t XAUDIO2_VOICE_NOSAMPLESPLAYED = 1;
constexpr uint32_t kUnderrunFadeInactive = UINT32_MAX;
bool deny_allocations = false;
void* operator new(std::size_t size) {
    if (deny_allocations) throw std::bad_alloc();
    if (void* result = std::malloc(size)) return result;
    throw std::bad_alloc();
}
void operator delete(void* value) noexcept { std::free(value); }
void operator delete(void* value, std::size_t) noexcept { std::free(value); }
struct XAUDIO2_VOICE_STATE { uint32_t BuffersQueued = 0; };
struct Voice {
    uint32_t queued = 2;
    void GetState(XAUDIO2_VOICE_STATE* state, uint32_t) noexcept { state->BuffersQueued = queued; }
};
struct QueuedAudioBuffer { std::vector<float> samples; bool in_use = true; };
struct Pipeline {
    Voice voice;
    Voice* source_voice_ = &voice;
    std::atomic<bool> running_{true}, timeline_resetting_{false};
    uint32_t sample_rate_ = 48000;
    int mode_ = 0;
    uint32_t underrun_fade_in_frame_ = kUnderrunFadeInactive;
    std::atomic<int64_t> output_gain_lease_deadline_ms_{0};
    std::atomic<int64_t> output_gain_lease_deadline_tick_ms_{0};
    float output_gain_lease_envelope_ = 1;
    int64_t output_gain_lease_expired_at_tick_ms_ = 0;
    static int64_t CurrentUnixMilliseconds() { return 0; }
    static int64_t CurrentMonotonicMilliseconds() { return 0; }
    // PRODUCTION_METHODS
    void Begin(QueuedAudioBuffer& buffer, uint32_t queued) {
        voice.queued = queued;
        deny_allocations = true;
        OnBufferStart(&buffer);
        deny_allocations = false;
    }
};
std::vector<std::string> failures;
void check(bool passed, const char* message) { if (!passed) failures.emplace_back(message); }
double adjacent_step(const std::vector<float>& samples, size_t channels) {
    double result = 0;
    for (size_t i = channels; i < samples.size(); ++i) result = std::max(result, std::abs(double(samples[i] - samples[i - channels])));
    return result;
}
int main() {
    Pipeline p;
    QueuedAudioBuffer tail{std::vector<float>(512, .8f)};
    p.Begin(tail, 1);
    const double tail_max_step = adjacent_step(tail.samples, 2);
    check(tail.samples.front() == .8f && tail.samples.back() == 0, "last queued PCM does not reach zero before starvation");
    check(adjacent_step(tail.samples, 2) <= .004, "tail envelope is not sample-continuous");
    QueuedAudioBuffer resume{std::vector<float>(512, -.6f)};
    p.Begin(resume, 3);
    check(resume.samples.front() == 0 && resume.samples.back() < -.2f && resume.samples.back() > -.6f,
        "resumed PCM jumps from silence into nonzero audio");
    QueuedAudioBuffer continued{std::vector<float>(512, -.6f)};
    p.Begin(continued, 2);
    check(continued.samples.back() == -.6f && std::abs(continued.samples.front() - resume.samples.back()) <= .002,
        "fade-in does not carry the sample cursor across buffers");
    check(adjacent_step(resume.samples, 2) <= .002 && adjacent_step(continued.samples, 2) <= .002,
        "resume envelope has an excessive sample-to-sample step");
    // Buffer ordering/length and every post-recovery sample stay exact.
    QueuedAudioBuffer steady{std::vector<float>(512)};
    for (size_t i = 0; i < steady.samples.size(); ++i) steady.samples[i] = std::sin(float(i) * .023f) * .7f;
    const auto original = steady.samples;
    p.Begin(steady, 2);
    check(steady.samples == original, "normal PCM differs after recovery completes");
    Pipeline fresh;
    fresh.Begin(steady, 24);
    check(steady.samples == original, "normal preroll/steady PCM is modified");
    // Late successor arrives after tail attenuation was chosen: crossfade still
    // begins at zero even though the queue never actually became empty.
    p.Begin(tail, 1);
    resume.samples.assign(512, -.6f);
    p.Begin(resume, 24);
    check(resume.samples.front() == 0, "late refill bypasses the committed tail envelope");
    p.ResetUnderrunEnvelope();
    steady.samples = original;
    p.Begin(steady, 24);
    check(steady.samples == original, "timeline reset leaves a stale recovery envelope");
    for (uint32_t rate : {8000u, 44100u, 48000u, 96000u}) {
        for (int channels : {1, 2}) {
            for (uint32_t frames : {1u, 2u, 7u, 255u, 256u}) {
                Pipeline q; q.sample_rate_ = rate; q.mode_ = channels == 1 ? FE_AUDIO_MODE_X3D_SPEAKER : 0;
                QueuedAudioBuffer short_tail{std::vector<float>(frames * channels, .7f)};
                q.Begin(short_tail, 1);
                check(short_tail.samples.size() == frames * channels && short_tail.samples.back() == 0,
                    "short/mono/rate-varied terminal buffer has a nonzero end or changed length");
                QueuedAudioBuffer next{std::vector<float>(256 * channels, -.7f)};
                q.Begin(next, 3);
                check(next.samples.front() == 0, "short terminal block fails to arm recovery");
                for (float sample : next.samples) check(std::isfinite(sample) && sample <= 0 && sample >= -.7f,
                    "envelope has a nonfinite, sign change or amplified sample");
            }
        }
    }
    Pipeline invalid;
    invalid.OnBufferStart(nullptr);
    QueuedAudioBuffer empty;
    invalid.Begin(empty, 0);
    invalid.timeline_resetting_ = true;
    steady.samples = original;
    invalid.Begin(steady, 1);
    check(steady.samples == original, "seek-time callback should not modify obsolete PCM");
    const auto begin = std::chrono::steady_clock::now();
    constexpr int iterations = 200000;
    for (int i = 0; i < iterations; ++i) fresh.Begin(steady, 24);
    const auto elapsed = std::chrono::duration<double, std::micro>(std::chrono::steady_clock::now() - begin).count();
    std::cout << "{\"pass\":" << (failures.empty() ? "true" : "false")
        << ",\"deviceInitialized\":false,\"tailToSilenceJump\":" << std::abs(tail.samples.back())
        << ",\"silenceToResumeJump\":" << std::abs(resume.samples.front())
        << ",\"tailMaxSampleStep\":" << tail_max_step
        << ",\"resumeMaxSampleStep\":" << adjacent_step(resume.samples, 2)
        << ",\"steadyCallbackMeanUs\":" << elapsed / iterations << ",\"failures\":[";
    for (size_t i = 0; i < failures.size(); ++i) std::cout << (i ? "," : "") << '"' << failures[i] << '"';
    std::cout << "]}\n";
}
