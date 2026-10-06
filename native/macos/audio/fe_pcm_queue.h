#pragma once

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>

namespace fe::mac_audio {
// One serialized producer (JNI control mutex), one AudioUnit consumer. No
// memory allocation, locks, file/network access, or JNI calls in render().
class PcmQueue final {
public:
    static constexpr uint32_t kCapacity = 32768;
    static constexpr uint32_t kMaxSubmission = 4096;
    static constexpr int kInvalid = -1, kStale = -2, kFull = -5;
    static_assert(std::atomic<uint64_t>::is_always_lock_free);
    static_assert(std::atomic<float>::is_always_lock_free);

    uint32_t queued() const noexcept {
        return static_cast<uint32_t>(write_.load(std::memory_order_acquire)
            - read_.load(std::memory_order_acquire));
    }
    bool canSubmit(uint32_t frames) const noexcept {
        return frames && frames <= kMaxSubmission && frames <= kCapacity - queued();
    }
    bool accepts(uint64_t generation, int64_t sequence) const noexcept {
        return generation && generation == generation_
            && (sequence < 0 || sequence > last_sequence_);
    }
    int submit(const float* pcm, uint32_t frames, uint64_t generation,
               int64_t sequence = -1) noexcept {
        if (!pcm || !frames || frames > kMaxSubmission) return kInvalid;
        if (!accepts(generation, sequence)) return kStale;
        if (!canSubmit(frames)) return kFull;
        for (uint32_t i = 0; i < frames * 2; ++i)
            if (!std::isfinite(pcm[i])) return kInvalid;
        const uint64_t offset = write_.load(std::memory_order_relaxed);
        for (uint32_t i = 0; i < frames; ++i) {
            const uint32_t slot = static_cast<uint32_t>((offset + i) % kCapacity) * 2;
            samples_[slot] = pcm[i * 2];
            samples_[slot + 1] = pcm[i * 2 + 1];
        }
        write_.store(offset + frames, std::memory_order_release);
        if (sequence >= 0) last_sequence_ = sequence;
        submitted_.fetch_add(1, std::memory_order_relaxed);
        return static_cast<int>(frames);
    }
    // Only while AudioOutputUnitStop has joined the render callback.
    void reset(uint64_t generation, uint32_t sample_rate) noexcept {
        generation_ = generation;
        sample_rate_ = sample_rate;
        last_sequence_ = -1;
        gain_sequence_ = 0;
        read_.store(0); write_.store(0); consumed_.store(0); submitted_.store(0);
        underruns_.store(0); requested_gain_.store(0); lease_deadline_.store(0);
        muted_.store(true); current_gain_ = 0; started_ = false; started_atomic_.store(false);
    }
    int setGain(uint64_t generation, uint64_t sequence, float gain,
                uint64_t monotonic_now_us, int64_t wall_now_ms,
                int64_t expires_at_ms) noexcept {
        if (!std::isfinite(gain) || gain < 0 || gain > 1
            || expires_at_ms <= wall_now_ms || expires_at_ms - wall_now_ms > 2000)
            return kInvalid;
        if (generation != generation_ || !generation || sequence < gain_sequence_
            || (sequence == gain_sequence_ && gain != requested_gain_.load()))
            return kStale;
        gain_sequence_ = sequence;
        // Establish deadline before publishing an audible target.
        lease_deadline_.store(std::max(lease_deadline_.load(), monotonic_now_us
            + static_cast<uint64_t>(expires_at_ms - wall_now_ms) * 1000),
            std::memory_order_release);
        requested_gain_.store(gain, std::memory_order_release);
        return 0;
    }
    int renewGain(uint64_t generation, uint64_t sequence, uint64_t now_us,
                  int64_t wall_now_ms, int64_t expires_at_ms) noexcept {
        // A renewal never resurrects an expired lease or changes its gain.
        if (!generation || generation != generation_ || sequence != gain_sequence_
            || lease_deadline_.load(std::memory_order_acquire) <= now_us) return kStale;
        return setGain(generation, sequence, requested_gain_.load(), now_us,
                       wall_now_ms, expires_at_ms);
    }
    void mute(bool muted) noexcept { muted_.store(muted, std::memory_order_release); }
    uint64_t generation() const noexcept { return generation_; }
    uint64_t consumed() const noexcept { return consumed_.load(); }
    uint64_t submitted() const noexcept { return submitted_.load(); }
    uint64_t underruns() const noexcept { return underruns_.load(); }
    bool started() const noexcept { return started_atomic_.load(); }

    void render(float* output, uint32_t frames, uint64_t now_us) noexcept {
        if (!output) return;
        std::fill_n(output, static_cast<size_t>(frames) * 2, 0.0f);
        const uint64_t offset = read_.load(std::memory_order_relaxed);
        const uint32_t ready = static_cast<uint32_t>(write_.load(std::memory_order_acquire) - offset);
        if (!started_ && ready < 512) return;
        started_ = true; started_atomic_.store(true);
        const uint32_t take = std::min(frames, ready);
        const bool expired = now_us >= lease_deadline_.load(std::memory_order_acquire);
        const float target = muted_.load(std::memory_order_acquire) || expired
            ? 0.0f : requested_gain_.load(std::memory_order_acquire);
        const float step = 1.0f / std::max(1.0f, sample_rate_ * (target < current_gain_ ? 0.02f : 0.01f));
        for (uint32_t i = 0; i < frames; ++i) {
            current_gain_ += std::clamp(target - current_gain_, -step, step);
            if (i >= take) continue;
            const uint32_t slot = static_cast<uint32_t>((offset + i) % kCapacity) * 2;
            output[i * 2] = samples_[slot] * current_gain_;
            output[i * 2 + 1] = samples_[slot + 1] * current_gain_;
        }
        read_.store(offset + take, std::memory_order_release);
        consumed_.fetch_add(take, std::memory_order_relaxed);
        if (take < frames) underruns_.fetch_add(1, std::memory_order_relaxed);
    }
private:
    std::array<float, kCapacity * 2> samples_{};
    alignas(64) std::atomic<uint64_t> read_{0};
    alignas(64) std::atomic<uint64_t> write_{0};
    std::atomic<uint64_t> consumed_{0}, submitted_{0}, underruns_{0};
    std::atomic<uint64_t> lease_deadline_{0};
    std::atomic<float> requested_gain_{0};
    std::atomic<bool> muted_{true}, started_atomic_{false};
    uint64_t generation_ = 0, gain_sequence_ = 0;
    int64_t last_sequence_ = -1;
    uint32_t sample_rate_ = 48000;
    float current_gain_ = 0;
    bool started_ = false;
};
}
