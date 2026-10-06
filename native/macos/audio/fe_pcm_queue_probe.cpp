#ifdef NDEBUG
#undef NDEBUG
#endif
#include "fe_pcm_queue.h"
#include <cassert>
#include <chrono>
#include <iostream>
#include <limits>
#include <thread>
#include <vector>

using fe::mac_audio::PcmQueue;
int main() {
    PcmQueue q;
    std::vector<float> pcm(4096 * 2, .25f), out(4096 * 2);
    q.reset(1, 48000);
    assert(q.submit(pcm.data(), 4096, 1, 0) == 4096);
    assert(q.submit(pcm.data(), 512, 1, 0) == PcmQueue::kStale);
    assert(q.submit(pcm.data(), 512, 2, 1) == PcmQueue::kStale);
    q.render(out.data(), 512, 1000000);
    for (auto f : out) assert(f == 0); // fail-closed without the handoff lease
    assert(q.setGain(1, 1, 1, 1000000, 1000, 3001) == PcmQueue::kInvalid);
    assert(q.setGain(1, 1, 1, 1000000, 1000, 1100) == 0);
    q.mute(false);
    q.render(out.data(), 512, 1000001);
    assert(out[1022] > .24f);
    assert(q.setGain(1, 1, .5f, 1000001, 1001, 1100) == PcmQueue::kStale);
    assert(q.renewGain(1, 1, 1000001, 1001, 1110) == 0);
    q.render(out.data(), 2048, 1200000);
    assert(out[4094] == 0); // lease expiry fades the tail rather than resurrecting
    assert(q.renewGain(1, 1, 1200000, 1200, 1400) == PcmQueue::kStale);
    q.reset(2, 48000);
    assert(q.queued() == 0 && q.consumed() == 0 && !q.started());
    assert(q.submit(pcm.data(), 4096, 1, 10) == PcmQueue::kStale);
    pcm[10] = std::numeric_limits<float>::quiet_NaN();
    assert(q.submit(pcm.data(), 4096, 2, 0) == PcmQueue::kInvalid);
    assert(q.queued() == 0);
    pcm[10] = .25f;
    for (int i = 0; i < 8; ++i) assert(q.submit(pcm.data(), 4096, 2, i) == 4096);
    assert(q.submit(pcm.data(), 1, 2, 8) == PcmQueue::kFull);
    assert(q.queued() == PcmQueue::kCapacity);
    q.render(out.data(), 4096, 1500000);
    assert(q.submit(pcm.data(), 4096, 2, 8) == 4096);

    // Stress the actual producer/consumer memory ordering through ring wraps.
    q.reset(3, 48000);
    constexpr uint64_t target = 512 * 2000;
    std::atomic<bool> done{false};
    std::thread consumer([&] {
        std::array<float, 512 * 2> buffer{};
        while (!done.load() || q.queued()) {
            q.render(buffer.data(), 512, 2000000);
            std::this_thread::yield();
        }
    });
    for (uint64_t sequence = 0; sequence < 2000; ++sequence) {
        while (q.submit(pcm.data(), 512, 3, sequence) == PcmQueue::kFull)
            std::this_thread::yield();
    }
    done.store(true); consumer.join();
    assert(q.consumed() == target && q.queued() == 0);
    const auto started = std::chrono::steady_clock::now();
    for (int i = 0; i < 10000; ++i) q.render(out.data(), 256, 2000000);
    const auto us = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - started).count();
    std::cout << "PCM queue generation/backpressure/lease/SPSC PASS; 10000 callbacks " << us << "us\n";
}
