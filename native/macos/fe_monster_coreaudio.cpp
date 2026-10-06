#include <jni.h>
#include <AudioUnit/AudioUnit.h>
#include <AudioToolbox/AudioToolbox.h>
#include "audio/fe_pcm_queue.h"
#include "audio/fe_coreaudio_dsp.h"
#include <chrono>
#include <cstring>
#include <mutex>
#include <thread>

namespace {
using fe::mac_audio::DspGraph;
using fe::mac_audio::PcmQueue;
constexpr int kMixerValueCount = 68, kChannelRouterValueCount = 41;
uint64_t nowUs() noexcept {
    return static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::microseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count());
}
int64_t wallMs() noexcept {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()).count();
}
std::mutex control;
struct Engine {
    AudioUnit unit = nullptr;
    std::atomic<uint32_t> callbacks_inflight{0};
    PcmQueue queue;
    std::unique_ptr<DspGraph> graph;
    uint32_t rate = 48000, input_channels = 2;
    bool running = false;
    uint64_t frames_processed = 0, dropped = 0;
    int last_result = 0;
    std::array<float, 4096 * 2> render_scratch{}, input_scratch{}, processed{};
    std::array<float, 4096 * 8> test_bed{};
    std::array<float, 518> sample{};
    uint64_t sample_at = 0, capture_at = 0;
    ~Engine() { stop(); if (unit) AudioComponentInstanceDispose(unit); }
    void stop() noexcept {
        if (unit) {
            AudioOutputUnitStop(unit);
            // The stop call prevents future device renders. Finish any render
            // already inside our callback before resetting the SPSC indices or
            // freeing its buffers. Only this control thread waits.
            while (callbacks_inflight.load(std::memory_order_acquire))
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
            AudioUnitUninitialize(unit);
        }
        running = false;
    }
    static OSStatus render(void* context, AudioUnitRenderActionFlags* flags,
                           const AudioTimeStamp*, UInt32, UInt32 frames,
                           AudioBufferList* buffers) noexcept {
        auto* self = static_cast<Engine*>(context);
        if (!self || !buffers) return kAudio_ParamError;
        self->callbacks_inflight.fetch_add(1, std::memory_order_acq_rel);
        struct Completion {
            Engine* engine;
            ~Completion() { engine->callbacks_inflight.fetch_sub(1, std::memory_order_release); }
        } completion{self};
        if (frames > 4096) {
            for (UInt32 i = 0; i < buffers->mNumberBuffers; ++i)
                if (buffers->mBuffers[i].mData) std::memset(buffers->mBuffers[i].mData, 0, buffers->mBuffers[i].mDataByteSize);
            *flags |= kAudioUnitRenderAction_OutputIsSilence;
            return noErr;
        }
        self->queue.render(self->render_scratch.data(), frames, nowUs());
        if (buffers->mNumberBuffers == 1 && buffers->mBuffers[0].mNumberChannels == 2) {
            auto& buffer = buffers->mBuffers[0];
            if (!buffer.mData || buffer.mDataByteSize < frames * 2 * sizeof(float)) return kAudio_ParamError;
            std::memcpy(buffer.mData, self->render_scratch.data(), frames * 2 * sizeof(float));
            buffer.mDataByteSize = frames * 2 * sizeof(float);
        } else if (buffers->mNumberBuffers == 2) {
            for (uint32_t c = 0; c < 2; ++c) {
                auto& buffer = buffers->mBuffers[c];
                if (!buffer.mData || buffer.mDataByteSize < frames * sizeof(float)) return kAudio_ParamError;
                auto* out = static_cast<float*>(buffer.mData);
                for (uint32_t f = 0; f < frames; ++f) out[f] = self->render_scratch[f * 2 + c];
                buffer.mDataByteSize = frames * sizeof(float);
            }
        } else return kAudio_ParamError;
        return noErr;
    }
    bool configure(uint32_t sample_rate, uint32_t channels,
                   const FeAudioSpatialControlParams& params, bool muted) {
        auto next = std::make_unique<DspGraph>(sample_rate, params);
        stop();
        AudioStreamBasicDescription format{};
        format.mSampleRate = sample_rate;
        format.mFormatID = kAudioFormatLinearPCM;
        format.mFormatFlags = kAudioFormatFlagIsFloat | kAudioFormatFlagIsPacked | kAudioFormatFlagsNativeEndian;
        format.mBytesPerPacket = format.mBytesPerFrame = 2 * sizeof(float);
        format.mFramesPerPacket = 1; format.mChannelsPerFrame = 2; format.mBitsPerChannel = 32;
        OSStatus result = AudioUnitSetProperty(unit, kAudioUnitProperty_StreamFormat,
            kAudioUnitScope_Input, 0, &format, sizeof(format));
        UInt32 max_frames = 4096;
        if (!result) result = AudioUnitSetProperty(unit, kAudioUnitProperty_MaximumFramesPerSlice,
            kAudioUnitScope_Global, 0, &max_frames, sizeof(max_frames));
        AURenderCallbackStruct callback{render, this};
        if (!result) result = AudioUnitSetProperty(unit, kAudioUnitProperty_SetRenderCallback,
            kAudioUnitScope_Input, 0, &callback, sizeof(callback));
        if (!result) result = AudioUnitInitialize(unit);
        if (result) { last_result = result; return false; }
        rate = sample_rate; input_channels = channels; graph = std::move(next);
        queue.reset(0, rate); queue.mute(muted); frames_processed = dropped = 0;
        result = AudioOutputUnitStart(unit);
        running = !result; last_result = result;
        return running;
    }
    int reset(uint64_t generation) {
        if (!graph || !running || !generation) return -1;
        const OSStatus stopped = AudioOutputUnitStop(unit);
        if (stopped) { last_result = stopped; return -3; }
        while (callbacks_inflight.load(std::memory_order_acquire))
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        queue.reset(generation, rate);
        // Rebuilding OBR clears convolution tails from the previous song too.
        auto next = replacement(graph->spatial, nullptr, graph->mixer_revision,
                                nullptr, graph->router_revision, 0);
        if (!next) return -3;
        graph = std::move(next); frames_processed = 0;
        last_result = AudioOutputUnitStart(unit);
        running = !last_result;
        return last_result ? -3 : 0;
    }
    std::unique_ptr<DspGraph> replacement(const FeAudioSpatialControlParams& p,
        const FeRustMixerParams* mixer, uint64_t mixer_revision,
        const FeRustChannelRouterParams* router, uint64_t router_revision, uint32_t ramp, bool preserve_renderer = false) {
        try {
            const uint32_t channels = p.upmix_enabled ? p.upmix_output_channels : 2;
            const bool reuse = preserve_renderer && graph && graph->channels() == channels
                && graph->spatial.obr_filter_profile == p.obr_filter_profile;
            auto next = std::make_unique<DspGraph>(rate, p, !reuse);
            const FeRustMixerParams* mp = mixer ? mixer : (graph && graph->mixer_present ? &graph->mixer_params : nullptr);
            const FeRustChannelRouterParams* rp = router ? router : (graph && graph->router_present ? &graph->router_params : nullptr);
            if (mp) { const int r = next->stageMixer(mixer ? mixer_revision : graph->mixer_revision, *mp, ramp); if (r) { last_result = r; return {}; } }
            if (rp) { auto value = *rp; value.output_channels = p.upmix_output_channels;
                const int r = next->stageRouter(router ? router_revision : graph->router_revision, value, ramp);
                if (r) { last_result = r; return {}; } }
            return next;
        } catch (...) { last_result = -3; return {}; }
    }
    void analyze(const float* pcm, uint32_t frames, uint32_t channels, uint32_t sample_rate, bool capture) {
        double square = 0;
        for (uint32_t i = 0; i < frames * channels; ++i) square += static_cast<double>(pcm[i]) * pcm[i];
        const float rms = static_cast<float>(std::sqrt(square / (frames * channels)));
        std::array<float, 32> low{};
        for (uint32_t band = 0; band < low.size(); ++band) {
            const double frequency = 20 * std::pow(7.5, band / 31.0);
            const double coefficient = 2 * std::cos(6.283185307179586 * frequency / sample_rate);
            double previous = 0, previous2 = 0;
            for (uint32_t f = 0; f < frames; ++f) {
                double mono = pcm[f * channels];
                if (channels == 2) mono = (mono + pcm[f * channels + 1]) * .5;
                const double window = .5 - .5 * std::cos(6.283185307179586 * f / std::max(1u, frames - 1));
                const double current = mono * window + coefficient * previous - previous2;
                previous2 = previous; previous = current;
            }
            low[band] = std::clamp(static_cast<float>(4 * std::sqrt(std::max(0.0,
                previous * previous + previous2 * previous2 - coefficient * previous * previous2)) / frames), 0.0f, 1.0f);
        }
        const float bass = *std::max_element(low.begin(), low.end());
        const float old_energy = sample[1];
        sample[0] = bass; sample[1] = std::clamp(rms * 2, 0.0f, 1.0f);
        sample[2] = std::clamp((sample[1] - old_energy) * 8, 0.0f, 1.0f);
        sample[3] = static_cast<float>(sample_rate); sample[4] = 1;
        for (uint32_t i = 0; i < 512; ++i) {
            const float at = i * 31.0f / 511; const uint32_t index = static_cast<uint32_t>(at);
            sample[5 + i] = low[index] + (low[std::min(31u, index + 1)] - low[index]) * (at - index);
        }
        sample_at = nowUs(); if (capture) capture_at = sample_at;
    }
    int submit(const float* pcm, uint32_t frames, uint64_t generation, int64_t sequence) {
        if (!graph || !running) return -3;
        if (!queue.accepts(generation, sequence)) return -2;
        if (!pcm || !frames || frames > 4096) return -1;
        if (!queue.canSubmit(frames)) { ++dropped; return -5; }
        for (uint32_t i = 0; i < frames * input_channels; ++i) if (!std::isfinite(pcm[i])) return -1;
        int result;
        try { result = graph->process(pcm, frames, input_channels, processed.data()); }
        catch (...) { return last_result = -3; }
        if (result) return last_result = result;
        result = queue.submit(processed.data(), frames, generation, sequence);
        if (result >= 0) {
            frames_processed += frames;
            // Recent ScreenCaptureKit analysis takes precedence over input PCM.
            if (nowUs() - capture_at > 500000) analyze(processed.data(), frames, 2, rate, false);
        }
        return result;
    }
};
std::unique_ptr<Engine> engine;
struct TestWorker {
    std::thread thread;
    std::atomic<bool> active{false};
    std::atomic<uint64_t> epoch{0};
    ~TestWorker() { epoch.fetch_add(1); if (thread.joinable()) thread.join(); }
} test_worker;

// The parsers below share the established Windows JNI value order and Rust
// parameter ABI. They do not contain any Windows device APIs.
int32_t read_mixer_and_spatial_parameters(JNIEnv*, jint, jfloatArray, FeRustMixerParams*, FeAudioSpatialControlParams*);
int32_t read_channel_router_parameters(JNIEnv*, jint, jint, jfloatArray, FeRustChannelRouterParams*);

template<size_t N> jdoubleArray doubles(JNIEnv* env, const std::array<jdouble, N>& values) {
    auto result = env->NewDoubleArray(static_cast<jsize>(N));
    if (result) env->SetDoubleArrayRegion(result, 0, static_cast<jsize>(N), values.data());
    return result;
}
bool validSpatial(const FeAudioSpatialControlParams& p) {
    return (p.upmix_output_channels == 6 || p.upmix_output_channels == 8)
        && (p.upmix_algorithm <= 2 || p.upmix_algorithm == 4) && p.obr_filter_profile <= 2
        && p.obr_wet >= 0 && p.obr_wet <= 1 && p.obr_dry >= 0 && p.obr_dry <= 1
        && p.obr_output_gain_db >= -24 && p.obr_output_gain_db <= 24
        && p.obr_spatial_width >= 0 && p.obr_spatial_width <= 2;
}
int setParameters(JNIEnv* env, jlong revision, jint flags, jfloatArray values,
                  jlong router_revision, jint channels, jint algorithm,
                  jfloatArray router_values, jint ramp) {
    if (!engine || !engine->graph) return -3;
    if (revision < 0 || router_revision < 0 || ramp < 0 || ramp > 192000) return -1;
    FeRustMixerParams mixer{}; FeAudioSpatialControlParams spatial{}; FeRustChannelRouterParams router{};
    int result = read_mixer_and_spatial_parameters(env, flags, values, &mixer, &spatial);
    if (result || !validSpatial(spatial)) return -1;
    if (engine->graph->mixer_present && static_cast<uint64_t>(revision) < engine->graph->mixer_revision) return -2;
    if (router_values) {
        result = read_channel_router_parameters(env, channels, algorithm, router_values, &router);
        if (result || static_cast<uint32_t>(channels) != spatial.upmix_output_channels) return -1;
        if (engine->graph->router_present && static_cast<uint64_t>(router_revision) < engine->graph->router_revision) return -2;
    }
    // Prepare all allocations and validate both snapshots before publishing
    // either control revision. A failed combined commit leaves the live graph.
    auto next = engine->replacement(spatial, &mixer, revision,
        router_values ? &router : nullptr, router_revision, ramp, true);
    if (!next) return engine->last_result;
    try { next->inheritState(*engine->graph, ramp); }
    catch (...) { return engine->last_result = -3; }
    engine->graph = std::move(next);
    return engine->last_result = 0;
}
int submitDirect(JNIEnv* env, jobject buffer, jint frames, jlong generation, jlong sequence) {
    std::lock_guard lock(control);
    if (!engine || frames < 1 || frames > 4096 || !buffer) return -1;
    auto* pcm = static_cast<float*>(env->GetDirectBufferAddress(buffer));
    const jlong capacity = env->GetDirectBufferCapacity(buffer);
    if (!pcm || capacity < static_cast<jlong>(frames) * engine->input_channels * sizeof(float)) return -1;
    return engine->submit(pcm, frames, generation >= 0 ? generation : engine->queue.generation(), sequence);
}
int submitArray(JNIEnv* env, jfloatArray values, jint frames, jlong generation) {
    std::lock_guard lock(control);
    if (!engine || !values || frames < 1 || frames > 4096
        || env->GetArrayLength(values) != frames * static_cast<jint>(engine->input_channels)) return -1;
    env->GetFloatArrayRegion(values, 0, frames * engine->input_channels, engine->input_scratch.data());
    if (env->ExceptionCheck()) return -1;
    return engine->submit(engine->input_scratch.data(), frames,
        generation >= 0 ? generation : engine->queue.generation(), -1);
}
}

#define JNI_AUDIO(name) extern "C" JNIEXPORT name JNICALL
JNI_AUDIO(jboolean) Java_com_femonster_core_NativeAudioEngine_nativeInit(JNIEnv*, jclass) {
    std::lock_guard lock(control);
    if (engine) return JNI_TRUE;
    try {
        auto next = std::make_unique<Engine>();
        AudioComponentDescription desc{};
        desc.componentType = kAudioUnitType_Output; desc.componentSubType = kAudioUnitSubType_DefaultOutput;
        desc.componentManufacturer = kAudioUnitManufacturer_Apple;
        const auto component = AudioComponentFindNext(nullptr, &desc);
        if (!component || AudioComponentInstanceNew(component, &next->unit)) return JNI_FALSE;
        if (fe_rust_mixer_abi_version() != FE_RUST_MIXER_ABI_VERSION
            || fe_rust_channel_router_abi_version() != FE_RUST_CHANNEL_ROUTER_ABI_VERSION
            || fe_rust_upmix_abi_version() != FE_RUST_UPMIX_ABI_VERSION) return JNI_FALSE;
        engine = std::move(next); return JNI_TRUE;
    } catch (...) { return JNI_FALSE; }
}
JNI_AUDIO(void) Java_com_femonster_core_NativeAudioEngine_nativeShutdown(JNIEnv*, jclass) {
    std::lock_guard lock(control); test_worker.epoch.fetch_add(1); engine.reset();
}
JNI_AUDIO(void) Java_com_femonster_core_NativeAudioEngine_nativeStopSpatial(JNIEnv*, jclass) {
    std::lock_guard lock(control);
    test_worker.epoch.fetch_add(1);
    if (engine) { engine->stop(); engine->graph.reset(); engine->queue.reset(0, engine->rate); }
}
JNI_AUDIO(jboolean) Java_com_femonster_core_NativeAudioEngine_nativeConfigureSpatial(
    JNIEnv*, jclass, jint rate, jint input_channels, jint layout, jint algorithm, jboolean muted) {
    std::lock_guard lock(control);
    if (!engine || rate < 8000 || rate > 192000 || (input_channels != 1 && input_channels != 2)
        || (layout != 6 && layout != 8) || algorithm < 0 || algorithm > 4) return JNI_FALSE;
    FeAudioSpatialControlParams params{};
    params.struct_size = sizeof(params); params.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    params.upmix_enabled = 1; params.upmix_output_channels = layout;
    params.upmix_algorithm = algorithm == 0 ? 1 : algorithm == 1 ? 0 : algorithm == 2 ? 1 : algorithm == 3 ? 2 : 4;
    params.upmix_center_width_hz = 700; params.upmix_lfe_crossover_hz = 120;
    params.upmix_lfe_gain = params.upmix_center_gain = params.upmix_surround_gain = 1;
    params.upmix_decorrelation_amount = .35f; params.obr_enabled = 1;
    params.obr_wet = 1; params.obr_dry = 0; params.obr_spatial_width = 1;
    test_worker.epoch.fetch_add(1);
    try { return engine->configure(rate, input_channels, params, muted == JNI_TRUE) ? JNI_TRUE : JNI_FALSE; }
    catch (...) { engine->last_result = -3; return JNI_FALSE; }
}
JNI_AUDIO(jint) Java_com_femonster_core_NativeAudioEngine_nativeInitializeSpatialGeneration(JNIEnv*, jclass, jlong generation) {
    std::lock_guard lock(control);
    if (!engine || generation <= 0) return -1;
    test_worker.epoch.fetch_add(1);
    try { return engine->reset(generation); } catch (...) { return -3; }
}
JNI_AUDIO(jint) Java_com_femonster_core_NativeAudioEngine_nativeResetSpatialTimelineGeneration(JNIEnv*, jclass, jlong generation, jlong next) {
    std::lock_guard lock(control);
    if (!engine || generation <= 0 || static_cast<uint64_t>(generation) != engine->queue.generation() || next <= generation) return -2;
    test_worker.epoch.fetch_add(1);
    try { return engine->reset(next); } catch (...) { return -3; }
}
JNI_AUDIO(jint) Java_com_femonster_core_NativeAudioEngine_nativeResetSpatialTimeline(JNIEnv*, jclass) {
    std::lock_guard lock(control);
    if (!engine) return -3;
    test_worker.epoch.fetch_add(1);
    try { return engine->reset(engine->queue.generation() + 1); } catch (...) { return -3; }
}
JNI_AUDIO(jint) Java_com_femonster_core_NativeAudioEngine_nativeSubmitSpatialPcm(JNIEnv* env, jclass, jfloatArray pcm, jint frames) { return submitArray(env, pcm, frames, -1); }
JNI_AUDIO(jint) Java_com_femonster_core_NativeAudioEngine_nativeSubmitSpatialPcmGeneration(JNIEnv* env, jclass, jfloatArray pcm, jint frames, jlong generation) { return submitArray(env, pcm, frames, generation); }
JNI_AUDIO(jint) Java_com_femonster_core_NativeAudioEngine_nativeSubmitSpatialPcmDirect(JNIEnv* env, jclass, jobject pcm, jint frames) { return submitDirect(env, pcm, frames, -1, -1); }
JNI_AUDIO(jint) Java_com_femonster_core_NativeAudioEngine_nativeSubmitSpatialPcmDirectGeneration(JNIEnv* env, jclass, jobject pcm, jint frames, jlong generation, jlong sequence) { return submitDirect(env, pcm, frames, generation, sequence); }
JNI_AUDIO(jint) Java_com_femonster_core_NativeAudioEngine_nativeSetSpatialMuted(JNIEnv*, jclass, jboolean muted) {
    std::lock_guard lock(control); if (!engine || !engine->graph) return -3;
    engine->queue.mute(muted == JNI_TRUE); return 0;
}
JNI_AUDIO(jint) Java_com_femonster_core_NativeAudioEngine_nativeSetSpatialOutputGain(JNIEnv*, jclass, jlong generation, jlong sequence, jfloat gain, jlong expires) {
    std::lock_guard lock(control); if (!engine || generation <= 0 || sequence <= 0) return -1;
    return engine->queue.setGain(generation, sequence, gain, nowUs(), wallMs(), expires);
}
JNI_AUDIO(jint) Java_com_femonster_core_NativeAudioEngine_nativeRenewSpatialOutputGainLease(JNIEnv*, jclass, jlong generation, jlong sequence, jlong expires) {
    std::lock_guard lock(control); if (!engine || generation <= 0 || sequence <= 0) return -1;
    return engine->queue.renewGain(generation, sequence, nowUs(), wallMs(), expires);
}
JNI_AUDIO(jint) Java_com_femonster_core_NativeAudioEngine_nativeSubmitCapturePcm(JNIEnv* env, jclass, jobject buffer, jint frames, jint channels, jint rate) {
    std::lock_guard lock(control);
    if (!engine) return -3;
    if (!buffer || frames < 1 || frames > 4096 || channels < 1 || channels > 2 || rate < 8000 || rate > 192000) return -1;
    auto* pcm = static_cast<float*>(env->GetDirectBufferAddress(buffer));
    if (!pcm || env->GetDirectBufferCapacity(buffer) < static_cast<jlong>(frames) * channels * sizeof(float)) return -1;
    for (int i = 0; i < frames * channels; ++i) if (!std::isfinite(pcm[i])) return -1;
    engine->analyze(pcm, frames, channels, rate, true); return 0;
}
JNI_AUDIO(jfloatArray) Java_com_femonster_core_NativeAudioEngine_nativeSampleState(JNIEnv* env, jclass, jboolean) {
    std::lock_guard lock(control);
    std::array<float, 518> values{};
    if (engine && nowUs() - engine->sample_at < 500000) {
        values = engine->sample;
        values[517] = nowUs() - engine->capture_at < 500000 ? 1.0f : 0.0f;
    }
    auto result = env->NewFloatArray(values.size());
    if (result) env->SetFloatArrayRegion(result, 0, values.size(), values.data());
    return result;
}
JNI_AUDIO(jfloatArray) Java_com_femonster_core_NativeAudioEngine_nativeSpatialMatrix(JNIEnv* env, jclass,
    jfloat ex, jfloat ey, jfloat ez, jfloat lx, jfloat ly, jfloat lz) {
    std::array<float, 2> values{};
    if (std::isfinite(ex) && std::isfinite(ey) && std::isfinite(ez)
        && std::isfinite(lx) && std::isfinite(ly) && std::isfinite(lz)) {
        const double x = static_cast<double>(ex) - lx, y = static_cast<double>(ey) - ly, z = static_cast<double>(ez) - lz;
        const double distance = std::sqrt(x * x + y * y + z * z);
        const float pan = distance > 1e-6 ? static_cast<float>(std::clamp(x / distance, -1.0, 1.0)) : 0;
        const float gain = static_cast<float>(1 / std::max(1.0, distance));
        values = {std::sqrt((1 - pan) * .5f) * gain, std::sqrt((1 + pan) * .5f) * gain};
    }
    auto result = env->NewFloatArray(values.size()); if (result) env->SetFloatArrayRegion(result, 0, values.size(), values.data()); return result;
}
JNI_AUDIO(jint) Java_com_femonster_core_NativeAudioEngine_nativeSetMixerParameters(JNIEnv* env, jclass,
    jlong revision, jint flags, jfloatArray values, jint ramp) {
    std::lock_guard lock(control); return setParameters(env, revision, flags, values, 0, 0, 0, nullptr, ramp);
}
JNI_AUDIO(jint) Java_com_femonster_core_NativeAudioEngine_nativeSetMixerAndChannelRouterParameters(JNIEnv* env, jclass,
    jlong revision, jint flags, jfloatArray values, jlong router_revision,
    jint channels, jint algorithm, jfloatArray router_values, jint ramp) {
    std::lock_guard lock(control); return setParameters(env, revision, flags, values, router_revision, channels, algorithm, router_values, ramp);
}
JNI_AUDIO(jint) Java_com_femonster_core_NativeAudioEngine_nativeSetChannelRouterParameters(JNIEnv* env, jclass,
    jlong revision, jint channels, jint algorithm, jfloatArray values, jint ramp) {
    std::lock_guard lock(control); if (!engine || !engine->graph) return -3;
    if (revision < 0 || ramp < 0 || ramp > 192000) return -1;
    FeRustChannelRouterParams params{};
    int result = read_channel_router_parameters(env, channels, algorithm, values, &params);
    if (result) return result;
    return engine->graph->stageRouter(revision, params, ramp);
}
JNI_AUDIO(jdoubleArray) Java_com_femonster_core_NativeAudioEngine_nativeSpatialStatus(JNIEnv* env, jclass) {
    std::lock_guard lock(control); std::array<double, 32> v{};
    if (engine && engine->graph) {
        auto& e = *engine; auto& g = *e.graph;
        v[0] = 1; v[1] = e.running; v[2] = 1; v[3] = e.rate; v[4] = e.input_channels;
        v[5] = g.channels(); v[6] = 2; v[7] = (e.queue.queued() + 255) / 256;
        v[8] = e.frames_processed / 256; v[9] = e.queue.consumed() / 256;
        v[10] = e.frames_processed; v[11] = e.dropped; v[12] = g.obr_calls;
        v[13] = g.position_updates; v[14] = g.upmix_calls; v[16] = g.spatial.upmix_enabled;
        v[17] = g.last_result; v[18] = g.energy; v[19] = v[20] = .70710678;
        v[21] = e.last_result; v[22] = e.queue.underruns(); v[23] = e.dropped;
        v[24] = e.queue.started(); v[25] = 2; v[26] = g.spatial.upmix_enabled;
        v[27] = g.spatial.obr_enabled; v[28] = g.spatial.obr_filter_profile;
        v[29] = g.channels(); v[30] = g.mixer_present ? static_cast<double>(g.mixer_revision) : -1;
        v[31] = g.mixer_calls;
    }
    return doubles(env, v);
}
JNI_AUDIO(jdoubleArray) Java_com_femonster_core_NativeAudioEngine_nativeMixerStatus(JNIEnv* env, jclass) {
    std::lock_guard lock(control); std::array<double, 29> v{};
    if (engine && engine->graph) {
        auto& g = *engine->graph;
        v[0] = v[1] = 1; v[2] = g.mixer_params.enabled;
        v[3] = g.mixer_present && g.mixer_params.enabled; v[5] = g.mixer_params.enabled ? 0 : 1;
        v[6] = g.last_result; v[7] = g.mixer_calls; v[9] = g.mixer_failures;
        v[11] = g.mixer_failures; v[12] = v[13] = g.mixer_present ? static_cast<double>(g.mixer_revision) : -1;
        v[14] = g.upmix_calls; v[16] = g.obr_calls; v[17] = g.last_upmix_order;
        v[18] = g.last_mixer_order; v[19] = g.last_obr_order; v[20] = g.spatial.upmix_enabled;
        v[21] = g.last_result; v[22] = 1; v[23] = engine->last_result;
        v[24] = g.spatial.upmix_enabled; v[25] = g.spatial.obr_enabled;
        v[26] = g.spatial.obr_filter_profile; v[27] = g.channels(); v[28] = v[12];
    }
    return doubles(env, v);
}
JNI_AUDIO(jdoubleArray) Java_com_femonster_core_NativeAudioEngine_nativeChannelRouterStatus(JNIEnv* env, jclass) {
    std::lock_guard lock(control); std::array<double, 34> v{};
    if (engine && engine->graph) {
        auto& g = *engine->graph; const auto s = g.routerStatus();
        v[0] = v[1] = 1; v[2] = g.spatial.upmix_enabled; v[3] = g.router_present;
        v[4] = g.spatial.upmix_output_channels; v[5] = g.router_params.algorithm;
        v[6] = s.last_result; v[7] = v[8] = g.router_present ? static_cast<double>(g.router_revision) : -1;
        v[9] = s.process_calls;
        for (uint32_t c = 0; c < 8; ++c) { v[10 + c] = s.channel_peak[c]; v[18 + c] = s.channel_rms[c]; v[26 + c] = g.router_params.channel_azimuth_deg[c]; }
    }
    return doubles(env, v);
}
JNI_AUDIO(jint) Java_com_femonster_core_NativeAudioEngine_nativeGenerateChannelTestSignal(JNIEnv*, jclass,
    jint channels, jint channel, jint kind, jint duration_ms, jfloat frequency, jfloat gain) {
    std::lock_guard lock(control);
    if (!engine || !engine->graph || !engine->running) return -3;
    if (channels != static_cast<int>(engine->graph->spatial.upmix_output_channels) || channel < 0 || channel >= channels
        || kind < 0 || kind > 1 || duration_ms < 50 || duration_ms > 2000
        || !std::isfinite(frequency) || frequency < 20 || frequency > 20000
        || !std::isfinite(gain) || gain < -60 || gain > 0) return -1;
    if (test_worker.active.load()) return -5;
    FeRustTestSignalConfig c{}; c.struct_size = sizeof(c); c.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
    c.sample_rate = engine->rate; c.output_channels = channels; c.channel_index = channel;
    c.kind = kind; c.frequency_hz = frequency; c.gain_db = gain;
    const uint32_t frames = static_cast<uint32_t>((static_cast<uint64_t>(engine->rate) * duration_ms + 999) / 1000);
    auto spatial = engine->graph->spatial;
    spatial.upmix_enabled = 1; // Channel diagnostics remain usable with upmix disabled.
    auto graph = engine->replacement(spatial, nullptr, engine->graph->mixer_revision,
        nullptr, engine->graph->router_revision, 0);
    if (!graph) return -3;
    const uint64_t generation = engine->queue.generation();
    if (!generation) return -2;
    // The previous thread has already released the control mutex before it
    // publishes active=false, so joining it here cannot wait on this lock.
    if (test_worker.thread.joinable()) test_worker.thread.join();
    const uint64_t epoch = test_worker.epoch.fetch_add(1) + 1;
    test_worker.active.store(true);
    try {
        test_worker.thread = std::thread([c, frames, generation, epoch, graph = std::move(graph)]() mutable {
            FeRustTestSignalState state{};
            uint32_t offset = 0;
            try {
                while (offset < frames && test_worker.epoch.load() == epoch) {
                    bool submitted = false;
                    {
                        std::lock_guard lock(control);
                        if (!engine || !engine->running || engine->queue.generation() != generation
                            || test_worker.epoch.load() != epoch) break;
                        const uint32_t count = std::min(PcmQueue::kMaxSubmission, frames - offset);
                        if (engine->queue.canSubmit(count)) {
                            engine->input_scratch.fill(0);
                            int result = fe_rust_channel_router_generate_test_signal(&c, &state, count,
                                engine->test_bed.data(), count * c.output_channels);
                            if (result < 0) { engine->last_result = result; break; }
                            result = graph->process(engine->input_scratch.data(), count, 2,
                                engine->processed.data(), engine->test_bed.data());
                            if (result < 0) { engine->last_result = result; break; }
                            result = engine->queue.submit(engine->processed.data(), count, generation);
                            if (result < 0) { engine->last_result = result; break; }
                            engine->frames_processed += count; offset += count; submitted = true;
                        }
                    }
                    if (!submitted) std::this_thread::sleep_for(std::chrono::milliseconds(8));
                }
            } catch (...) { /* Device teardown cancels the generation safely. */ }
            test_worker.active.store(false);
        });
        return 0;
    } catch (...) { test_worker.active.store(false); return -3; }
}

namespace {
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
        || (flags & ~0x7ff) != 0) {
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

    mixer->chorus_enabled = (flags & 0x40) != 0 ? 1u : 0u;
    mixer->chorus_rate_hz = raw[44];
    mixer->chorus_depth = raw[45];
    mixer->chorus_center_delay_ms = raw[46];
    mixer->chorus_feedback = raw[47];
    mixer->chorus_mix = raw[48];
    mixer->flanger_enabled = (flags & 0x80) != 0 ? 1u : 0u;
    mixer->flanger_rate_hz = raw[49];
    mixer->flanger_depth = raw[50];
    mixer->flanger_center_delay_ms = raw[51];
    mixer->flanger_feedback = raw[52];
    mixer->flanger_mix = raw[53];
    mixer->phaser_enabled = (flags & 0x100) != 0 ? 1u : 0u;
    mixer->phaser_rate_hz = raw[54];
    mixer->phaser_depth = raw[55];
    mixer->phaser_center_frequency_hz = raw[56];
    mixer->phaser_feedback = raw[57];
    mixer->phaser_mix = raw[58];
    mixer->delay_enabled = (flags & 0x200) != 0 ? 1u : 0u;
    mixer->delay_ms = raw[59];
    mixer->delay_feedback = raw[60];
    mixer->delay_ping_pong = raw[61];
    mixer->delay_damping_hz = raw[62];
    mixer->delay_mix = raw[63];
    mixer->early_reflections_enabled = (flags & 0x400) != 0 ? 1u : 0u;
    mixer->early_reflections_room_size = raw[64];
    mixer->early_reflections_diffusion = raw[65];
    mixer->early_reflections_damping = raw[66];
    mixer->early_reflections_mix = raw[67];

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
        || algorithm > static_cast<jint>(FE_RUST_UPMIX_MUSIC_DETAIL)
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


}
