#include <algorithm>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <iostream>
#include <limits>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <vector>

// PRODUCTION_HAS_GENERATION
using HRESULT = int32_t;
constexpr HRESULT S_OK = 0, E_INVALIDARG = -1, E_HANDLE = -2, E_ABORT = -3, E_PENDING = -4;
constexpr int ERROR_TIMEOUT = 10, ERROR_RETRY = 11;
#define HRESULT_FROM_WIN32(value) (-static_cast<HRESULT>(value))
#define FAILED(value) ((value) < 0)
constexpr uint32_t kFramesPerRenderBlock = 256, kFramesPerTransportBatch = 4096;
constexpr int FE_AUDIO_MODE_OBR_BINAURAL = 2, FE_AUDIO_MODE_X3D_SPEAKER = 1;
constexpr uint64_t kUnsequencedSubmission = std::numeric_limits<uint64_t>::max();

class TrackedMutex {
public:
    void lock() { mutex_.lock(); owner_ = std::this_thread::get_id(); }
    void unlock() { owner_ = {}; mutex_.unlock(); }
    bool HeldHere() const { return owner_ == std::this_thread::get_id(); }
private:
    std::mutex mutex_;
    std::thread::id owner_;
};

class ControlledQueueWait {
public:
    template<class Lock, class Duration, class Predicate>
    bool wait_for(Lock& lock, Duration timeout, Predicate predicate) {
        {
            std::lock_guard guard(entered_mutex_);
            entered_++;
        }
        entered_cv_.notify_all();
        return cv_.wait_for(lock, timeout, predicate);
    }
    void AwaitWait(int count = 1) {
        std::unique_lock lock(entered_mutex_);
        if (!entered_cv_.wait_for(lock, std::chrono::seconds(2), [&] { return entered_ >= count; })) {
            throw std::runtime_error("submit did not reach queue wait");
        }
    }
    void notify_all() { cv_.notify_all(); }
private:
    std::condition_variable_any cv_;
    std::mutex entered_mutex_;
    std::condition_variable entered_cv_;
    int entered_ = 0;
};

struct QueuedAudioBuffer { std::vector<float> samples; bool in_use = false; };

class AudioPipeline {
public:
    // PRODUCTION_SUBMIT_BODY

    void ResetForTest() {
        std::lock_guard guard(spatial_control_mutex_);
        timeline_generation_.fetch_add(1);
        last_submission_sequence_ = kUnsequencedSubmission;
        last_submission_result_ = S_OK;
        buffers_queued_ = 0;
        buffer_available_cv_.notify_all();
    }
    HRESULT Send(uint64_t generation, uint64_t sequence = kUnsequencedSubmission, uint32_t frames = kFramesPerRenderBlock) {
        const std::vector<float> pcm(frames * 2, 0.0f);
#if HAS_GENERATION
        return Submit(pcm.data(), frames, generation, sequence);
#else
        return Submit(pcm.data(), frames);
#endif
    }
    bool SpatialUpmixEnabled() const { return false; }
    bool TryRustUpmixBlock(const float*, uint32_t) { return false; }
    QueuedAudioBuffer* AcquireBuffer() { acquired_++; buffer_.in_use = true; return &buffer_; }
    void ReleaseBuffer(QueuedAudioBuffer* value) { value->in_use = false; }
    HRESULT RenderDryBlock(const float*, uint32_t, std::vector<float>*) { rendered_++; return S_OK; }
    HRESULT RenderSpatialBlock(const float*, uint32_t, uint32_t, bool, std::vector<float>*) { return E_HANDLE; }
    HRESULT RenderX3dSpeakerBlock(const float*, uint32_t, std::vector<float>*) { return E_HANDLE; }
    HRESULT QueueRenderedBlock(QueuedAudioBuffer* value) {
        enqueue_held_reset_boundary_ = spatial_control_mutex_.HeldHere();
        queued_++;
        if (fill_after_queue_) buffers_queued_ = max_queued_buffers_;
        ReleaseBuffer(value);
        return queue_result_;
    }
    HRESULT RememberFailure(HRESULT value) { return value; }

    TrackedMutex submit_mutex_, spatial_control_mutex_, queue_wait_mutex_;
    ControlledQueueWait buffer_available_cv_;
    std::atomic<bool> running_{true};
    void* source_voice_ = this;
    std::atomic<uint64_t> timeline_generation_{1};
    uint64_t last_submission_sequence_ = kUnsequencedSubmission;
    HRESULT last_submission_result_ = S_OK;
    uint64_t upmix_generation_ = 0;
    std::atomic<uint32_t> buffers_queued_{0};
    std::atomic<uint64_t> dropped_buffers_{0}, frames_processed_{0};
    uint32_t max_queued_buffers_ = 3, input_channels_ = 2;
    int mode_ = 0;
    int acquired_ = 0, rendered_ = 0, queued_ = 0;
    bool enqueue_held_reset_boundary_ = false;
    bool fill_after_queue_ = false;
    HRESULT queue_result_ = S_OK;
    QueuedAudioBuffer buffer_;
};

void Require(bool value, const char* message) {
    if (!value) throw std::runtime_error(message);
}

int main() {
    try {
        AudioPipeline waiting;
        waiting.buffers_queued_ = waiting.max_queued_buffers_;
        HRESULT obsolete_result = S_OK;
        std::thread obsolete([&] { obsolete_result = waiting.Send(1); });
        waiting.buffer_available_cv_.AwaitWait();
        waiting.ResetForTest();
        obsolete.join();
        Require(obsolete_result == E_ABORT && waiting.queued_ == 0 && waiting.acquired_ == 0,
            "old PCM waiting for queue space crossed the timeline reset");

        AudioPipeline current;
        Require(current.Send(1, 7) == S_OK && current.queued_ == 1,
            "current timeline failed to enqueue");
        Require(current.enqueue_held_reset_boundary_, "render/enqueue is not atomic with voice reset");
        Require(current.Send(1, 7) == S_OK && current.queued_ == 1,
            "same sequence replay enqueued duplicate audio");
        current.queue_result_ = E_HANDLE;
        Require(current.Send(1, 8) == E_HANDLE && current.Send(1, 8) == E_HANDLE && current.queued_ == 2,
            "failed sequence replay re-enqueued potentially consumed audio");
        current.ResetForTest();
        Require(current.Send(1, 9) == E_ABORT && current.queued_ == 2,
            "delayed JNI submission accepted an obsolete generation");
        current.queue_result_ = S_OK;
        Require(current.Send(2, 0) == S_OK && current.queued_ == 3,
            "new timeline did not reset sequence receipt");

        AudioPipeline partial;
        partial.fill_after_queue_ = true;
        std::thread partial_sender([&] { obsolete_result = partial.Send(1, 0, kFramesPerRenderBlock * 2); });
        partial.buffer_available_cv_.AwaitWait(2);
        partial.ResetForTest();
        partial_sender.join();
        Require(obsolete_result == E_ABORT && partial.queued_ == 1,
            "remaining old transport quanta crossed the reset");

        AudioPipeline simultaneous;
        std::vector<HRESULT> results(8, E_PENDING);
        std::vector<std::thread> senders;
        for (size_t i = 0; i < results.size(); ++i) {
            senders.emplace_back([&, i] { results[i] = simultaneous.Send(1, 4); });
        }
        for (auto& sender : senders) sender.join();
        Require(simultaneous.queued_ == 1
            && std::all_of(results.begin(), results.end(), [](HRESULT value) { return value == S_OK; }),
            "overlapping HTTP retries duplicated the same native transaction");
        std::cout << "Native submit concurrency PASS: queue/reset cancellation, atomic enqueue, replay, failure receipt, generation restart, mid-batch reset, eight concurrent retries\n";
        return 0;
    } catch (const std::exception& failure) {
        std::cerr << failure.what() << '\n';
        return 1;
    }
}
