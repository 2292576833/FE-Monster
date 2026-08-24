#include "fe_rust_mixer.h"
#include "fe_rust_upmix.h"

#include <windows.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <limits>
#include <memory>
#include <numeric>
#include <string>
#include <utility>
#include <vector>

#include "obr/audio_buffer/audio_buffer.h"
#include "obr/renderer/audio_element_config.h"
#include "obr/renderer/audio_element_type.h"
#include "obr/renderer/obr_impl.h"

namespace {

constexpr uint32_t kSampleRate = 48'000;
constexpr uint32_t kFramesPerBlock = 256;
constexpr uint32_t kVirtualChannels = 8;
constexpr float kPi = 3.14159265358979323846f;
constexpr float kToneHz = 937.5f;  // Exactly five cycles per 256-frame block.
constexpr float kObrCeiling = 0.94406088f;  // Official OBR limiter: -0.5 dBFS.

using Clock = std::chrono::steady_clock;

struct StereoMetrics {
    double rms = 0.0;
    double rms_left = 0.0;
    double rms_right = 0.0;
    double peak = 0.0;
    double dc_left = 0.0;
    double dc_right = 0.0;
    double interaural_difference_ratio = 0.0;
    double ild_db = 0.0;
    double left_right_correlation = 0.0;
    double thd_ratio = 0.0;
    uint64_t near_ceiling_samples = 0;
    uint64_t hard_clip_samples = 0;
    uint64_t non_finite_samples = 0;
    uint64_t sample_count = 0;
};

struct StereoAccumulator {
    double square_left = 0.0;
    double square_right = 0.0;
    double square_difference = 0.0;
    double square_mid = 0.0;
    double cross_left_right = 0.0;
    double sum_left = 0.0;
    double sum_right = 0.0;
    double peak = 0.0;
    uint64_t near_ceiling = 0;
    uint64_t hard_clip = 0;
    uint64_t non_finite = 0;
    uint64_t frames = 0;
    std::array<double, 6> harmonic_sine{};
    std::array<double, 6> harmonic_cosine{};

    void Add(float left, float right, uint64_t absolute_frame) {
        if (!std::isfinite(left) || !std::isfinite(right)) {
            non_finite += (!std::isfinite(left) ? 1u : 0u)
                + (!std::isfinite(right) ? 1u : 0u);
            left = std::isfinite(left) ? left : 0.0f;
            right = std::isfinite(right) ? right : 0.0f;
        }
        const double l = left;
        const double r = right;
        const double mid = (l + r) * 0.5;
        const double difference = l - r;
        square_left += l * l;
        square_right += r * r;
        square_difference += difference * difference;
        square_mid += mid * mid;
        cross_left_right += l * r;
        sum_left += l;
        sum_right += r;
        peak = std::max({peak, std::abs(l), std::abs(r)});
        if (std::abs(l) >= kObrCeiling * 0.999
            || std::abs(r) >= kObrCeiling * 0.999) {
            near_ceiling += 1;
        }
        if (std::abs(l) >= 0.999999 || std::abs(r) >= 0.999999) {
            hard_clip += 1;
        }
        for (size_t harmonic = 1; harmonic < harmonic_sine.size(); ++harmonic) {
            const double phase = 2.0 * static_cast<double>(kPi)
                * static_cast<double>(kToneHz) * static_cast<double>(harmonic)
                * static_cast<double>(absolute_frame) / kSampleRate;
            harmonic_sine[harmonic] += mid * std::sin(phase);
            harmonic_cosine[harmonic] += mid * std::cos(phase);
        }
        frames += 1;
    }

    StereoMetrics Finish() const {
        StereoMetrics metrics{};
        if (frames == 0) return metrics;
        const double denominator = static_cast<double>(frames);
        metrics.rms_left = std::sqrt(square_left / denominator);
        metrics.rms_right = std::sqrt(square_right / denominator);
        metrics.rms = std::sqrt((square_left + square_right) / (2.0 * denominator));
        metrics.peak = peak;
        metrics.dc_left = sum_left / denominator;
        metrics.dc_right = sum_right / denominator;
        metrics.interaural_difference_ratio = std::sqrt(square_difference / denominator)
            / std::max(1.0e-12, std::sqrt(square_mid / denominator));
        metrics.ild_db = 20.0 * std::log10(
            std::max(1.0e-12, metrics.rms_left)
            / std::max(1.0e-12, metrics.rms_right)
        );
        metrics.left_right_correlation = cross_left_right / std::max(
            1.0e-12,
            std::sqrt(square_left * square_right)
        );
        std::array<double, 6> amplitude{};
        for (size_t harmonic = 1; harmonic < amplitude.size(); ++harmonic) {
            amplitude[harmonic] = 2.0 / denominator * std::hypot(
                harmonic_sine[harmonic],
                harmonic_cosine[harmonic]
            );
        }
        double harmonic_square_sum = 0.0;
        for (size_t harmonic = 2; harmonic < amplitude.size(); ++harmonic) {
            harmonic_square_sum += amplitude[harmonic] * amplitude[harmonic];
        }
        metrics.thd_ratio = std::sqrt(harmonic_square_sum)
            / std::max(1.0e-12, amplitude[1]);
        metrics.near_ceiling_samples = near_ceiling;
        metrics.hard_clip_samples = hard_clip;
        metrics.non_finite_samples = non_finite;
        metrics.sample_count = frames * 2;
        return metrics;
    }
};

struct MultichannelMetrics {
    double rms = 0.0;
    double peak = 0.0;
    uint64_t near_full_scale_samples = 0;
    uint64_t non_finite_samples = 0;
};

class LinkedSafetyLimiter final {
public:
    void Process(float* left, float* right) {
        const float peak = std::max(std::abs(*left), std::abs(*right));
        const float desired = peak > kObrCeiling ? kObrCeiling / peak : 1.0f;
        if (desired < gain_) {
            gain_ = desired;
        } else {
            const float release = std::exp(-3.0f / (kSampleRate * 0.050f));
            gain_ = release * gain_ + (1.0f - release) * desired;
        }
        *left *= gain_;
        *right *= gain_;
    }

private:
    float gain_ = 1.0f;
};

class RustChain final {
public:
    ~RustChain() {
        if (mixer_ != nullptr && mixer_destroy_ != nullptr) mixer_destroy_(mixer_);
        if (upmix_ != nullptr && upmix_destroy_ != nullptr) upmix_destroy_(upmix_);
        if (module_ != nullptr) FreeLibrary(module_);
    }

    bool Initialize(float mixer_output_gain_db = 0.0f, bool limiter_enabled = true) {
        std::array<wchar_t, 32768> path{};
        const DWORD length = GetEnvironmentVariableW(
            L"FE_MONSTER_RUST_UPMIX_DLL",
            path.data(),
            static_cast<DWORD>(path.size())
        );
        if (length == 0 || length >= path.size()) return false;
        module_ = LoadLibraryW(path.data());
        if (module_ == nullptr) return false;

        upmix_create_ = Symbol<FeRustUpmixCreateFn>("fe_rust_upmix_create");
        upmix_process_ = Symbol<FeRustUpmixProcessFn>("fe_rust_upmix_process");
        upmix_destroy_ = Symbol<FeRustUpmixDestroyFn>("fe_rust_upmix_destroy");
        mixer_create_ = Symbol<FeRustMixerCreateFn>("fe_rust_mixer_create");
        mixer_stage_ = Symbol<FeRustMixerStageParamsFn>("fe_rust_mixer_stage_params");
        mixer_commit_ = Symbol<FeRustMixerCommitFn>("fe_rust_mixer_commit");
        mixer_process_ = Symbol<FeRustMixerProcessFn>("fe_rust_mixer_process");
        mixer_destroy_ = Symbol<FeRustMixerDestroyFn>("fe_rust_mixer_destroy");
        if (!upmix_create_ || !upmix_process_ || !upmix_destroy_
            || !mixer_create_ || !mixer_stage_ || !mixer_commit_
            || !mixer_process_ || !mixer_destroy_) {
            return false;
        }

        FeRustUpmixConfig upmix_config{};
        upmix_config.struct_size = sizeof(upmix_config);
        upmix_config.abi_version = FE_RUST_UPMIX_ABI_VERSION;
        upmix_config.sample_rate = kSampleRate;
        upmix_config.output_channels = kVirtualChannels;
        upmix_config.algorithm = 1;  // Product default: OxiMedia MatrixDecode.
        upmix_config.center_width_hz = 300.0f;
        upmix_config.lfe_crossover_hz = 120.0f;
        upmix_config.lfe_gain = 0.707f;
        upmix_config.center_gain = 0.707f;
        upmix_config.surround_gain = 0.5f;
        upmix_config.decorrelation_amount = 0.7f;
        upmix_ = upmix_create_(&upmix_config);
        if (upmix_ == nullptr) return false;

        FeRustMixerConfig mixer_config{};
        mixer_config.struct_size = sizeof(mixer_config);
        mixer_config.abi_version = FE_RUST_MIXER_ABI_VERSION;
        mixer_config.sample_rate = kSampleRate;
        mixer_config.max_frames_per_call = kFramesPerBlock;
        mixer_ = mixer_create_(&mixer_config);
        if (mixer_ == nullptr) return false;

        FeRustMixerParams params{};
        params.struct_size = sizeof(params);
        params.abi_version = FE_RUST_MIXER_ABI_VERSION;
        params.enabled = 1;
        params.limiter_enabled = limiter_enabled ? 1u : 0u;
        params.output_gain_db = mixer_output_gain_db;
        params.stereo_width = 1.0f;
        params.center_gain = 1.0f;
        params.surround_gain = 1.0f;
        params.lfe_gain = 1.0f;
        params.compressor_threshold_db = -18.0f;
        params.compressor_ratio = 2.0f;
        params.compressor_attack_ms = 10.0f;
        params.compressor_release_ms = 150.0f;
        params.compressor_knee_db = 6.0f;
        params.limiter_ceiling_db = -0.3f;
        params.limiter_release_ms = 100.0f;
        params.reverb_room_size = 0.35f;
        params.reverb_decay_ms = 800.0f;
        params.reverb_damping = 0.5f;
        params.reverb_pre_delay_ms = 12.0f;
        params.reverb_dry = 1.0f;
        if (mixer_stage_(mixer_, 1, &params) != FE_RUST_MIXER_OK) return false;
        return mixer_commit_(mixer_, 1, 0) == FE_RUST_MIXER_OK;
    }

    bool Process(const std::vector<float>& stereo, std::vector<float>* output) {
        output->assign(static_cast<size_t>(kFramesPerBlock) * kVirtualChannels, 0.0f);
        const int32_t upmix_result = upmix_process_(
            upmix_, stereo.data(), kFramesPerBlock, output->data(),
            static_cast<uint32_t>(output->size())
        );
        if (upmix_result != FE_RUST_UPMIX_OK) return false;
        upmix_process_calls_ += 1;
        if (!ProcessMixer(output, kVirtualChannels)) return false;
        return true;
    }

    bool ProcessStereo(const std::vector<float>& stereo, std::vector<float>* output) {
        if (stereo.size() != static_cast<size_t>(kFramesPerBlock) * 2) return false;
        *output = stereo;
        return ProcessMixer(output, 2);
    }

    uint64_t UpmixProcessCalls() const { return upmix_process_calls_; }
    uint64_t MixerProcessCalls() const { return mixer_process_calls_; }

private:
    bool ProcessMixer(std::vector<float>* samples, uint32_t channels) {
        const int32_t result = mixer_process_(
            mixer_, samples->data(), kFramesPerBlock, channels
        );
        if (result != FE_RUST_MIXER_OK) return false;
        mixer_process_calls_ += 1;
        return true;
    }

    template <typename T>
    T Symbol(const char* name) const {
        return reinterpret_cast<T>(GetProcAddress(module_, name));
    }

    HMODULE module_ = nullptr;
    void* upmix_ = nullptr;
    void* mixer_ = nullptr;
    FeRustUpmixCreateFn upmix_create_ = nullptr;
    FeRustUpmixProcessFn upmix_process_ = nullptr;
    FeRustUpmixDestroyFn upmix_destroy_ = nullptr;
    FeRustMixerCreateFn mixer_create_ = nullptr;
    FeRustMixerStageParamsFn mixer_stage_ = nullptr;
    FeRustMixerCommitFn mixer_commit_ = nullptr;
    FeRustMixerProcessFn mixer_process_ = nullptr;
    FeRustMixerDestroyFn mixer_destroy_ = nullptr;
    uint64_t upmix_process_calls_ = 0;
    uint64_t mixer_process_calls_ = 0;
};

struct ObjectPosition {
    float azimuth = 0.0f;
    float elevation = 0.0f;
    float distance = 1.0f;
};

std::array<ObjectPosition, 8> CurrentProductPositions() {
    return {{{30.0f, 0.0f, 1.0f}, {-30.0f, 0.0f, 1.0f},
        {0.0f, 0.0f, 1.0f}, {0.0f, -30.0f, 1.0f},
        {90.0f, 0.0f, 1.0f}, {-90.0f, 0.0f, 1.0f},
        {135.0f, 0.0f, 1.0f}, {-135.0f, 0.0f, 1.0f}}};
}

std::vector<ObjectPosition> OfficialObrPositions(uint32_t channels) {
    if (channels == 2) {
        return {{30.0f, 0.0f, 1.0f}, {-30.0f, 0.0f, 1.0f}};
    }
    // Mirrors Google OBR kLayout7_1_0_ch channel order and sign convention:
    // positive azimuth is left, rear channels are +/-135 degrees.
    return {
        {30.0f, 0.0f, 1.0f}, {-30.0f, 0.0f, 1.0f},
        {0.0f, 0.0f, 1.0f}, {0.0f, -30.0f, 1.0f},
        {90.0f, 0.0f, 1.0f}, {-90.0f, 0.0f, 1.0f},
        {135.0f, 0.0f, 1.0f}, {-135.0f, 0.0f, 1.0f}
    };
}

class FlexibleObrRenderer final {
public:
    explicit FlexibleObrRenderer(
        const std::vector<ObjectPosition>& positions,
        obr::BinauralFilterProfile profile = obr::BinauralFilterProfile::kDirect
    )
        : renderer_(kFramesPerBlock, kSampleRate),
          input_(positions.size(), kFramesPerBlock),
          output_(2, kFramesPerBlock),
          channels_(static_cast<uint32_t>(positions.size())) {
        if (channels_ != 1 && channels_ != 2 && channels_ != 8) return;
        for (uint32_t channel = 0; channel < channels_; ++channel) {
            if (!renderer_.AddAudioElement(
                    obr::AudioElementType::kObjectMono,
                    profile
                ).ok()) {
                return;
            }
        }
        for (uint32_t channel = 0; channel < channels_; ++channel) {
            const auto& position = positions[channel];
            if (!renderer_.UpdateObjectPosition(
                    channel, position.azimuth, position.elevation, position.distance
                ).ok()) {
                return;
            }
        }
        ready_ = true;
    }

    bool Ready() const { return ready_; }

    obr::AudioBuffer* Process(const std::vector<float>& interleaved) {
        if (!ready_ || interleaved.size() != static_cast<size_t>(channels_) * kFramesPerBlock) {
            return nullptr;
        }
        for (uint32_t channel = 0; channel < channels_; ++channel) {
            auto planar = input_[channel];
            for (uint32_t frame = 0; frame < kFramesPerBlock; ++frame) {
                planar[frame] = interleaved[static_cast<size_t>(frame) * channels_ + channel];
            }
        }
        renderer_.Process(input_, &output_);
        return &output_;
    }

private:
    obr::ObrImpl renderer_;
    obr::AudioBuffer input_;
    obr::AudioBuffer output_;
    uint32_t channels_ = 0;
    bool ready_ = false;
};

class ObrObjectRenderer final {
public:
    explicit ObrObjectRenderer(const std::array<ObjectPosition, 8>& positions)
        : renderer_(kFramesPerBlock, kSampleRate),
          input_(kVirtualChannels, kFramesPerBlock),
          output_(2, kFramesPerBlock) {
        for (uint32_t channel = 0; channel < kVirtualChannels; ++channel) {
            const auto added = renderer_.AddAudioElement(
                obr::AudioElementType::kObjectMono,
                obr::BinauralFilterProfile::kDirect
            );
            if (!added.ok()) {
                ready_ = false;
                return;
            }
        }
        for (uint32_t channel = 0; channel < kVirtualChannels; ++channel) {
            const auto& position = positions[channel];
            const auto updated = renderer_.UpdateObjectPosition(
                channel, position.azimuth, position.elevation, position.distance
            );
            if (!updated.ok()) {
                ready_ = false;
                return;
            }
        }
        ready_ = true;
    }

    bool Ready() const { return ready_; }

    std::pair<obr::AudioBuffer*, double> Process(const std::vector<float>& interleaved) {
        for (uint32_t channel = 0; channel < kVirtualChannels; ++channel) {
            auto planar = input_[channel];
            for (uint32_t frame = 0; frame < kFramesPerBlock; ++frame) {
                planar[frame] = interleaved[static_cast<size_t>(frame) * kVirtualChannels + channel];
            }
        }
        const auto started = Clock::now();
        renderer_.Process(input_, &output_);
        const auto finished = Clock::now();
        return {
            &output_,
            std::chrono::duration<double, std::milli>(finished - started).count()
        };
    }

private:
    obr::ObrImpl renderer_;
    obr::AudioBuffer input_;
    obr::AudioBuffer output_;
    bool ready_ = false;
};

struct ImpulseLatencyMetrics {
    uint32_t onset_left = 0;
    uint32_t onset_right = 0;
    uint32_t peak_left = 0;
    uint32_t peak_right = 0;
    float peak_value_left = 0.0f;
    float peak_value_right = 0.0f;
};

ImpulseLatencyMetrics MeasureObrImpulseLatency(obr::BinauralFilterProfile profile) {
    FlexibleObrRenderer renderer({{30.0f, 0.0f, 1.0f}}, profile);
    ImpulseLatencyMetrics metrics{};
    if (!renderer.Ready()) return metrics;
    constexpr uint32_t kBlocks = 12;
    std::vector<float> left_samples;
    std::vector<float> right_samples;
    left_samples.reserve(kBlocks * kFramesPerBlock);
    right_samples.reserve(kBlocks * kFramesPerBlock);
    for (uint32_t block = 0; block < kBlocks; ++block) {
        std::vector<float> input(kFramesPerBlock, 0.0f);
        if (block == 0) input[0] = 0.1f;
        obr::AudioBuffer* output = renderer.Process(input);
        if (output == nullptr) return {};
        const auto left = (*output)[0];
        const auto right = (*output)[1];
        left_samples.insert(left_samples.end(), left.begin(), left.end());
        right_samples.insert(right_samples.end(), right.begin(), right.end());
    }
    for (uint32_t frame = 0; frame < left_samples.size(); ++frame) {
        const float left = std::abs(left_samples[frame]);
        const float right = std::abs(right_samples[frame]);
        if (left > metrics.peak_value_left) {
            metrics.peak_value_left = left;
            metrics.peak_left = frame;
        }
        if (right > metrics.peak_value_right) {
            metrics.peak_value_right = right;
            metrics.peak_right = frame;
        }
    }
    const float left_threshold = metrics.peak_value_left * 0.01f;
    const float right_threshold = metrics.peak_value_right * 0.01f;
    for (uint32_t frame = 0; frame < left_samples.size(); ++frame) {
        if (metrics.onset_left == 0 && frame > 0
            && std::abs(left_samples[frame]) >= left_threshold) {
            metrics.onset_left = frame;
        }
        if (metrics.onset_right == 0 && frame > 0
            && std::abs(right_samples[frame]) >= right_threshold) {
            metrics.onset_right = frame;
        }
    }
    return metrics;
}

struct RenderResult {
    StereoMetrics output;
    MultichannelMetrics pre_obr;
    double process_p99_ms = 0.0;
};

RenderResult RenderTone(float amplitude, uint32_t warmup_blocks, uint32_t measured_blocks) {
    RustChain rust;
    const auto positions = CurrentProductPositions();
    ObrObjectRenderer obr(positions);
    RenderResult result{};
    if (!rust.Initialize() || !obr.Ready()) {
        result.output.non_finite_samples = std::numeric_limits<uint64_t>::max();
        return result;
    }

    StereoAccumulator output_accumulator;
    double pre_square_sum = 0.0;
    double pre_peak = 0.0;
    uint64_t pre_samples = 0;
    uint64_t pre_near_full_scale = 0;
    uint64_t pre_non_finite = 0;
    std::vector<double> timings;
    timings.reserve(measured_blocks);
    uint64_t absolute_frame = 0;
    LinkedSafetyLimiter safety_limiter;
    for (uint32_t block = 0; block < warmup_blocks + measured_blocks; ++block) {
        std::vector<float> stereo(static_cast<size_t>(kFramesPerBlock) * 2, 0.0f);
        for (uint32_t frame = 0; frame < kFramesPerBlock; ++frame) {
            const double phase = 2.0 * static_cast<double>(kPi) * kToneHz
                * static_cast<double>(absolute_frame + frame) / kSampleRate;
            stereo[static_cast<size_t>(frame) * 2] = amplitude * std::sin(phase);
            stereo[static_cast<size_t>(frame) * 2 + 1] =
                amplitude * std::sin(phase + 0.41);
        }
        std::vector<float> upmixed;
        if (!rust.Process(stereo, &upmixed)) {
            result.output.non_finite_samples = std::numeric_limits<uint64_t>::max();
            return result;
        }
        const float obr_headroom = 1.0f / std::sqrt(static_cast<float>(kVirtualChannels));
        for (float& sample : upmixed) sample *= obr_headroom;
        const auto [rendered, elapsed_ms] = obr.Process(upmixed);
        if (block >= warmup_blocks) {
            timings.push_back(elapsed_ms);
            for (float sample : upmixed) {
                if (!std::isfinite(sample)) {
                    pre_non_finite += 1;
                    continue;
                }
                pre_square_sum += static_cast<double>(sample) * sample;
                pre_peak = std::max(pre_peak, static_cast<double>(std::abs(sample)));
                if (std::abs(sample) >= 0.999f) pre_near_full_scale += 1;
                pre_samples += 1;
            }
            const auto left = (*rendered)[0];
            const auto right = (*rendered)[1];
            for (uint32_t frame = 0; frame < kFramesPerBlock; ++frame) {
                float output_left = left[frame]
                    * std::sqrt(static_cast<float>(kVirtualChannels)) * 0.90f;
                float output_right = right[frame]
                    * std::sqrt(static_cast<float>(kVirtualChannels)) * 0.90f;
                safety_limiter.Process(&output_left, &output_right);
                output_accumulator.Add(
                    output_left, output_right,
                    absolute_frame + frame - static_cast<uint64_t>(warmup_blocks) * kFramesPerBlock
                );
            }
        }
        absolute_frame += kFramesPerBlock;
    }
    result.output = output_accumulator.Finish();
    result.pre_obr.rms = std::sqrt(pre_square_sum / std::max<uint64_t>(1, pre_samples));
    result.pre_obr.peak = pre_peak;
    result.pre_obr.near_full_scale_samples = pre_near_full_scale;
    result.pre_obr.non_finite_samples = pre_non_finite;
    std::sort(timings.begin(), timings.end());
    if (!timings.empty()) {
        result.process_p99_ms = timings[std::min(
            timings.size() - 1,
            static_cast<size_t>(std::ceil(timings.size() * 0.99) - 1)
        )];
    }
    return result;
}

StereoMetrics RenderCoherentObrStress(
    float amplitude,
    uint32_t warmup_blocks,
    uint32_t measured_blocks
) {
    FlexibleObrRenderer obr(OfficialObrPositions(kVirtualChannels));
    StereoAccumulator accumulator;
    if (!obr.Ready()) {
        StereoMetrics failed{};
        failed.non_finite_samples = std::numeric_limits<uint64_t>::max();
        return failed;
    }

    uint64_t absolute_frame = 0;
    LinkedSafetyLimiter safety_limiter;
    for (uint32_t block = 0; block < warmup_blocks + measured_blocks; ++block) {
        std::vector<float> input(
            static_cast<size_t>(kFramesPerBlock) * kVirtualChannels,
            0.0f
        );
        for (uint32_t frame = 0; frame < kFramesPerBlock; ++frame) {
            const double phase = 2.0 * static_cast<double>(kPi) * kToneHz
                * static_cast<double>(absolute_frame + frame) / kSampleRate;
            const float sample = amplitude * std::sin(phase);
            for (uint32_t channel = 0; channel < kVirtualChannels; ++channel) {
                input[static_cast<size_t>(frame) * kVirtualChannels + channel] =
                    sample / std::sqrt(static_cast<float>(kVirtualChannels));
            }
        }
        obr::AudioBuffer* rendered = obr.Process(input);
        if (rendered == nullptr) {
            StereoMetrics failed{};
            failed.non_finite_samples = std::numeric_limits<uint64_t>::max();
            return failed;
        }
        if (block >= warmup_blocks) {
            const auto left = (*rendered)[0];
            const auto right = (*rendered)[1];
            for (uint32_t frame = 0; frame < kFramesPerBlock; ++frame) {
                float output_left = left[frame]
                    * std::sqrt(static_cast<float>(kVirtualChannels)) * 0.90f;
                float output_right = right[frame]
                    * std::sqrt(static_cast<float>(kVirtualChannels)) * 0.90f;
                safety_limiter.Process(&output_left, &output_right);
                accumulator.Add(
                    output_left,
                    output_right,
                    absolute_frame + frame
                        - static_cast<uint64_t>(warmup_blocks) * kFramesPerBlock
                );
            }
        }
        absolute_frame += kFramesPerBlock;
    }
    return accumulator.Finish();
}

std::vector<float> RenderDirectionalSignature(uint32_t active_channel) {
    ObrObjectRenderer obr(CurrentProductPositions());
    std::vector<float> signature;
    if (!obr.Ready()) return signature;
    uint32_t noise_state = 0x91e10da5u;
    constexpr uint32_t kWarmupBlocks = 12;
    constexpr uint32_t kMeasuredBlocks = 48;
    signature.reserve(static_cast<size_t>(kMeasuredBlocks) * kFramesPerBlock * 2);
    for (uint32_t block = 0; block < kWarmupBlocks + kMeasuredBlocks; ++block) {
        std::vector<float> input(static_cast<size_t>(kFramesPerBlock) * kVirtualChannels, 0.0f);
        for (uint32_t frame = 0; frame < kFramesPerBlock; ++frame) {
            noise_state = noise_state * 1664525u + 1013904223u;
            const float noise = (static_cast<float>((noise_state >> 8) & 0xffffu) / 32767.5f - 1.0f)
                * 0.025f;
            input[static_cast<size_t>(frame) * kVirtualChannels + active_channel] = noise;
        }
        const auto [rendered, ignored] = obr.Process(input);
        (void)ignored;
        if (block < kWarmupBlocks) continue;
        const auto left = (*rendered)[0];
        const auto right = (*rendered)[1];
        for (uint32_t frame = 0; frame < kFramesPerBlock; ++frame) {
            signature.push_back(left[frame]);
            signature.push_back(right[frame]);
        }
    }
    return signature;
}

double NormalizedCorrelation(const std::vector<float>& a, const std::vector<float>& b) {
    if (a.empty() || a.size() != b.size()) return 1.0;
    double dot = 0.0;
    double square_a = 0.0;
    double square_b = 0.0;
    for (size_t index = 0; index < a.size(); ++index) {
        dot += static_cast<double>(a[index]) * b[index];
        square_a += static_cast<double>(a[index]) * a[index];
        square_b += static_cast<double>(b[index]) * b[index];
    }
    return dot / std::max(1.0e-12, std::sqrt(square_a * square_b));
}

struct FourStateQualityResult {
    StereoMetrics output;
    double maximum_transparency_error = 0.0;
    uint64_t upmix_process_calls = 0;
    uint64_t mixer_process_calls = 0;
};

FourStateQualityResult RenderFourState(
    bool upmix_enabled,
    bool obr_enabled,
    bool broadband = false
) {
    constexpr uint32_t kWarmupBlocks = 32;
    constexpr uint32_t kMeasuredBlocks = 160;
    RustChain rust;
    FourStateQualityResult result{};
    if (!rust.Initialize()) {
        result.output.non_finite_samples = std::numeric_limits<uint64_t>::max();
        return result;
    }
    const uint32_t bed_channels = upmix_enabled ? kVirtualChannels : 2u;
    std::unique_ptr<FlexibleObrRenderer> renderer;
    if (obr_enabled) {
        renderer = std::make_unique<FlexibleObrRenderer>(
            OfficialObrPositions(bed_channels),
            obr::BinauralFilterProfile::kDirect
        );
        if (!renderer->Ready()) {
            result.output.non_finite_samples = std::numeric_limits<uint64_t>::max();
            return result;
        }
    }

    StereoAccumulator accumulator;
    LinkedSafetyLimiter limiter;
    uint64_t absolute_frame = 0;
    for (uint32_t block = 0; block < kWarmupBlocks + kMeasuredBlocks; ++block) {
        std::vector<float> stereo(static_cast<size_t>(kFramesPerBlock) * 2u, 0.0f);
        for (uint32_t frame = 0; frame < kFramesPerBlock; ++frame) {
            if (broadband) {
                constexpr std::array<float, 7> frequencies = {
                    125.0f, 250.0f, 500.0f, 1'000.0f,
                    2'000.0f, 4'000.0f, 8'000.0f
                };
                constexpr std::array<float, 7> pink_weights = {
                    1.0f, 0.70710678f, 0.5f, 0.35355339f,
                    0.25f, 0.17677670f, 0.125f
                };
                float left = 0.0f;
                float right = 0.0f;
                for (size_t tone = 0; tone < frequencies.size(); ++tone) {
                    const float phase = 2.0f * kPi * frequencies[tone]
                        * static_cast<float>(absolute_frame + frame)
                        / static_cast<float>(kSampleRate);
                    left += pink_weights[tone] * std::sin(phase + tone * 0.17f);
                    right += pink_weights[tone]
                        * std::sin(phase + 0.41f + tone * 0.23f);
                }
                stereo[static_cast<size_t>(frame) * 2u] = left * 0.04f;
                stereo[static_cast<size_t>(frame) * 2u + 1u] = right * 0.04f;
            } else {
                const double phase = 2.0 * static_cast<double>(kPi) * kToneHz
                    * static_cast<double>(absolute_frame + frame) / kSampleRate;
                stereo[static_cast<size_t>(frame) * 2u] = 0.12f * std::sin(phase);
                stereo[static_cast<size_t>(frame) * 2u + 1u] =
                    0.10f * std::sin(phase + 0.41);
            }
        }

        std::vector<float> bed;
        const bool processed = upmix_enabled
            ? rust.Process(stereo, &bed)
            : rust.ProcessStereo(stereo, &bed);
        if (!processed) {
            result.output.non_finite_samples = std::numeric_limits<uint64_t>::max();
            return result;
        }

        std::vector<float> output(static_cast<size_t>(kFramesPerBlock) * 2u, 0.0f);
        if (obr_enabled) {
            const float headroom = 1.0f / std::sqrt(static_cast<float>(bed_channels));
            for (float& sample : bed) sample *= headroom;
            obr::AudioBuffer* binaural = renderer->Process(bed);
            if (binaural == nullptr) {
                result.output.non_finite_samples = std::numeric_limits<uint64_t>::max();
                return result;
            }
            const auto left = (*binaural)[0];
            const auto right = (*binaural)[1];
            const float calibration = upmix_enabled ? 0.90f : 0.99f;
            const float compensation = std::sqrt(static_cast<float>(bed_channels));
            for (uint32_t frame = 0; frame < kFramesPerBlock; ++frame) {
                output[static_cast<size_t>(frame) * 2u] =
                    left[frame] * compensation * calibration;
                output[static_cast<size_t>(frame) * 2u + 1u] =
                    right[frame] * compensation * calibration;
            }
        } else if (!upmix_enabled) {
            output = bed;
        } else {
            for (uint32_t frame = 0; frame < kFramesPerBlock; ++frame) {
                const size_t source = static_cast<size_t>(frame) * kVirtualChannels;
                const size_t destination = static_cast<size_t>(frame) * 2u;
                const float left = bed[source]
                    + 0.70710678f * bed[source + 2]
                    + 0.5f * bed[source + 3]
                    + 0.5f * bed[source + 4]
                    + 0.5f * bed[source + 6];
                const float right = bed[source + 1]
                    + 0.70710678f * bed[source + 2]
                    + 0.5f * bed[source + 3]
                    + 0.5f * bed[source + 5]
                    + 0.5f * bed[source + 7];
                output[destination] = left / 1.5f * 1.25f;
                output[destination + 1] = right / 1.5f * 1.25f;
            }
        }

        for (uint32_t frame = 0; frame < kFramesPerBlock; ++frame) {
            const size_t base = static_cast<size_t>(frame) * 2u;
            limiter.Process(&output[base], &output[base + 1]);
            if (block >= kWarmupBlocks) {
                accumulator.Add(
                    output[base],
                    output[base + 1],
                    absolute_frame + frame
                        - static_cast<uint64_t>(kWarmupBlocks) * kFramesPerBlock
                );
                if (!upmix_enabled && !obr_enabled) {
                    result.maximum_transparency_error = std::max({
                        result.maximum_transparency_error,
                        static_cast<double>(std::abs(output[base] - stereo[base])),
                        static_cast<double>(std::abs(output[base + 1] - stereo[base + 1]))
                    });
                }
            }
        }
        absolute_frame += kFramesPerBlock;
    }
    result.output = accumulator.Finish();
    result.upmix_process_calls = rust.UpmixProcessCalls();
    result.mixer_process_calls = rust.MixerProcessCalls();
    return result;
}

double DryStereoRms(float amplitude) {
    constexpr uint32_t kFrames = 32 * kFramesPerBlock;
    double square_sum = 0.0;
    for (uint32_t frame = 0; frame < kFrames; ++frame) {
        const double phase = 2.0 * static_cast<double>(kPi) * kToneHz * frame / kSampleRate;
        const double left = amplitude * std::sin(phase);
        const double right = amplitude * std::sin(phase + 0.41);
        square_sum += left * left + right * right;
    }
    return std::sqrt(square_sum / (2.0 * kFrames));
}

void PrintStereoMetrics(const char* name, const StereoMetrics& metrics) {
    std::cout << "    \"" << name << "\": {"
        << "\"rms\":" << metrics.rms
        << ",\"rmsLeft\":" << metrics.rms_left
        << ",\"rmsRight\":" << metrics.rms_right
        << ",\"peak\":" << metrics.peak
        << ",\"dcLeft\":" << metrics.dc_left
        << ",\"dcRight\":" << metrics.dc_right
        << ",\"earDifferenceRatio\":" << metrics.interaural_difference_ratio
        << ",\"ildDb\":" << metrics.ild_db
        << ",\"leftRightCorrelation\":" << metrics.left_right_correlation
        << ",\"thdRatio\":" << metrics.thd_ratio
        << ",\"nearCeilingSamples\":" << metrics.near_ceiling_samples
        << ",\"hardClipSamples\":" << metrics.hard_clip_samples
        << ",\"nonFiniteSamples\":" << metrics.non_finite_samples
        << "}";
}

}  // namespace

int main() {
    std::cout << std::fixed << std::setprecision(8);
    const auto positions = CurrentProductPositions();
    float minimum_azimuth = positions.front().azimuth;
    float maximum_azimuth = positions.front().azimuth;
    for (const auto& position : positions) {
        minimum_azimuth = std::min(minimum_azimuth, position.azimuth);
        maximum_azimuth = std::max(maximum_azimuth, position.azimuth);
    }
    const double angular_span = maximum_azimuth - minimum_azimuth;
    const auto official_positions = OfficialObrPositions(kVirtualChannels);
    double maximum_target_azimuth_error = 0.0;
    for (size_t channel = 0; channel < positions.size(); ++channel) {
        if (channel == 3) continue;  // LFE has no audible directional target.
        double difference = std::remainder(
            static_cast<double>(positions[channel].azimuth)
                - official_positions[channel].azimuth,
            360.0
        );
        maximum_target_azimuth_error = std::max(
            maximum_target_azimuth_error,
            std::abs(difference)
        );
    }

    // -6.2 dBFS is representative of ordinary mastered programme peaks.  A
    // separate coherent full-scale case below verifies emergency safety.
    const RenderResult low = RenderTone(0.0245f, 32, 160);
    const RenderResult high = RenderTone(0.49f, 32, 160);
    const double expected_level_ratio = 20.0;
    const double measured_level_ratio = high.output.rms / std::max(1.0e-12, low.output.rms);
    const double dry_high_rms = DryStereoRms(0.49f);
    const double obr_to_dry_rms = high.output.rms / std::max(1.0e-12, dry_high_rms);
    const StereoMetrics coherent_low = RenderCoherentObrStress(0.01f, 32, 160);
    const StereoMetrics coherent_high = RenderCoherentObrStress(0.20f, 32, 160);
    const StereoMetrics coherent_full_scale = RenderCoherentObrStress(0.98f, 32, 160);
    const double coherent_level_ratio = coherent_high.rms
        / std::max(1.0e-12, coherent_low.rms);

    const std::vector<float> front_left = RenderDirectionalSignature(0);
    const std::vector<float> rear_left = RenderDirectionalSignature(6);
    const double front_rear_signature_correlation = NormalizedCorrelation(front_left, rear_left);
    const ImpulseLatencyMetrics direct_latency = MeasureObrImpulseLatency(
        obr::BinauralFilterProfile::kDirect
    );
    const ImpulseLatencyMetrics ambient_latency = MeasureObrImpulseLatency(
        obr::BinauralFilterProfile::kAmbient
    );
    const ImpulseLatencyMetrics reverberant_latency = MeasureObrImpulseLatency(
        obr::BinauralFilterProfile::kReverberant
    );
    const std::array<FourStateQualityResult, 4> four_state = {
        RenderFourState(false, false),
        RenderFourState(true, false),
        RenderFourState(false, true),
        RenderFourState(true, true)
    };
    const std::array<FourStateQualityResult, 4> four_state_broadband = {
        RenderFourState(false, false, true),
        RenderFourState(true, false, true),
        RenderFourState(false, true, true),
        RenderFourState(true, true, true)
    };
    double minimum_route_rms = std::numeric_limits<double>::max();
    double maximum_route_rms = 0.0;
    bool four_state_signal_ok = true;
    for (size_t state = 0; state < four_state.size(); ++state) {
        const auto& route = four_state[state];
        minimum_route_rms = std::min(minimum_route_rms, route.output.rms);
        maximum_route_rms = std::max(maximum_route_rms, route.output.rms);
        const bool expects_upmix = state == 1 || state == 3;
        four_state_signal_ok = four_state_signal_ok
            && route.output.non_finite_samples == 0
            && route.output.hard_clip_samples == 0
            && route.output.thd_ratio < 0.001
            && route.mixer_process_calls == 192
            && route.upmix_process_calls == (expects_upmix ? 192u : 0u);
    }
    const double four_state_gain_jump_db = 20.0 * std::log10(
        maximum_route_rms / std::max(1.0e-12, minimum_route_rms)
    );
    double minimum_broadband_rms = std::numeric_limits<double>::max();
    double maximum_broadband_rms = 0.0;
    bool broadband_routes_finite = true;
    for (const auto& route : four_state_broadband) {
        minimum_broadband_rms = std::min(minimum_broadband_rms, route.output.rms);
        maximum_broadband_rms = std::max(maximum_broadband_rms, route.output.rms);
        broadband_routes_finite = broadband_routes_finite
            && route.output.non_finite_samples == 0
            && route.output.hard_clip_samples == 0;
    }
    const double four_state_broadband_gain_jump_db = 20.0 * std::log10(
        maximum_broadband_rms / std::max(1.0e-12, minimum_broadband_rms)
    );
    // The native transition probe owns the <= 1 dB route-switch invariant.
    // This independent multitone fixture intentionally spans the HRTF's full
    // passband, so its spread also includes expected profile coloration.
    constexpr double kMaximumBroadbandSpectralSpreadDb = 1.25;
    const bool four_state_quality_ok = four_state_signal_ok
        && four_state[0].maximum_transparency_error <= 1.0e-5
        && four_state_gain_jump_db <= 2.0
        && broadband_routes_finite
        && four_state_broadband_gain_jump_db <= kMaximumBroadbandSpectralSpreadDb
        && std::abs(
            four_state[2].output.left_right_correlation
                - four_state[0].output.left_right_correlation
        ) >= 0.005;

    const bool finite_and_dc_ok = low.output.non_finite_samples == 0
        && high.output.non_finite_samples == 0
        && low.pre_obr.non_finite_samples == 0
        && high.pre_obr.non_finite_samples == 0
        && std::abs(high.output.dc_left) < 0.001
        && std::abs(high.output.dc_right) < 0.001;
    const bool spatial_geometry_ok = angular_span >= 180.0
        && maximum_target_azimuth_error <= 2.0;
    const bool channel_distinction_ok = std::abs(front_rear_signature_correlation) <= 0.92;
    const bool transfer_linearity_ok = measured_level_ratio >= expected_level_ratio * 0.88;
    const bool distortion_ok = high.output.thd_ratio <= 0.01
        && high.output.hard_clip_samples == 0
        && high.output.near_ceiling_samples == 0
        && coherent_high.thd_ratio <= 0.01
        && coherent_high.hard_clip_samples == 0
        && coherent_high.near_ceiling_samples == 0
        && coherent_level_ratio >= expected_level_ratio * 0.88
        && coherent_full_scale.non_finite_samples == 0
        && coherent_full_scale.peak <= kObrCeiling * 1.0001
        && coherent_full_scale.thd_ratio <= 0.05;
    const bool loudness_ok = obr_to_dry_rms >= 0.70 && obr_to_dry_rms <= 1.30;
    const bool realtime_ok = high.process_p99_ms <
        (1000.0 * kFramesPerBlock / kSampleRate) * 0.75;
    const bool pass = finite_and_dc_ok
        && spatial_geometry_ok
        && channel_distinction_ok
        && transfer_linearity_ok
        && distortion_ok
        && loudness_ok
        && four_state_quality_ok
        && realtime_ok;

    std::cout << "{\n"
        << "  \"pass\": " << (pass ? "true" : "false") << ",\n"
        << "  \"qualityGates\": {"
        << "\"finiteAndDc\":" << (finite_and_dc_ok ? "true" : "false")
        << ",\"spatialGeometry\":" << (spatial_geometry_ok ? "true" : "false")
        << ",\"channelDistinction\":" << (channel_distinction_ok ? "true" : "false")
        << ",\"transferLinearity\":" << (transfer_linearity_ok ? "true" : "false")
        << ",\"distortion\":" << (distortion_ok ? "true" : "false")
        << ",\"loudness\":" << (loudness_ok ? "true" : "false")
        << ",\"fourState\":" << (four_state_quality_ok ? "true" : "false")
        << ",\"realtime\":" << (realtime_ok ? "true" : "false")
        << "},\n"
        << "  \"geometry\": {\"minimumAzimuth\":" << minimum_azimuth
        << ",\"maximumAzimuth\":" << maximum_azimuth
        << ",\"angularSpanDegrees\":" << angular_span
        << ",\"requiredSpanDegrees\":180.0"
        << ",\"maximumOfficialTargetErrorDegrees\":" << maximum_target_azimuth_error
        << ",\"maximumAllowedTargetErrorDegrees\":2.0},\n"
        << "  \"directionalIdentity\": {\"frontLeftVsRearLeftCorrelation\":"
        << front_rear_signature_correlation << ",\"maximumAllowed\":0.92},\n"
        << "  \"impulseLatency\": {"
        << "\"direct\":{\"onsetLeft\":" << direct_latency.onset_left
        << ",\"onsetRight\":" << direct_latency.onset_right
        << ",\"peakLeft\":" << direct_latency.peak_left
        << ",\"peakRight\":" << direct_latency.peak_right << "},"
        << "\"ambient\":{\"onsetLeft\":" << ambient_latency.onset_left
        << ",\"onsetRight\":" << ambient_latency.onset_right
        << ",\"peakLeft\":" << ambient_latency.peak_left
        << ",\"peakRight\":" << ambient_latency.peak_right << "},"
        << "\"reverberant\":{\"onsetLeft\":" << reverberant_latency.onset_left
        << ",\"onsetRight\":" << reverberant_latency.onset_right
        << ",\"peakLeft\":" << reverberant_latency.peak_left
        << ",\"peakRight\":" << reverberant_latency.peak_right << "}},\n"
        << "  \"fourStateQuality\": {\"pass\":"
        << (four_state_quality_ok ? "true" : "false")
        << ",\"singleToneSpectralSpreadDb\":" << four_state_gain_jump_db
        << ",\"broadbandGainJumpDb\":" << four_state_broadband_gain_jump_db
        << ",\"broadbandSpectralSpreadLimitDb\":"
        << kMaximumBroadbandSpectralSpreadDb
        << ",\"broadbandRms\":[" << four_state_broadband[0].output.rms
        << "," << four_state_broadband[1].output.rms
        << "," << four_state_broadband[2].output.rms
        << "," << four_state_broadband[3].output.rms << "]"
        << ",\"offOffTransparencyMaxError\":"
        << four_state[0].maximum_transparency_error << ",\n";
    PrintStereoMetrics("offOff", four_state[0].output);
    std::cout << ",\n";
    PrintStereoMetrics("onOff", four_state[1].output);
    std::cout << ",\n";
    PrintStereoMetrics("offOn", four_state[2].output);
    std::cout << ",\n";
    PrintStereoMetrics("onOn", four_state[3].output);
    std::cout << "\n  },\n"
        << "  \"levelTransfer\": {\"expectedRatio\":" << expected_level_ratio
        << ",\"measuredRatio\":" << measured_level_ratio
        << ",\"obrToDryHighRms\":" << obr_to_dry_rms << "},\n"
        << "  \"preObr\": {\"lowRms\":" << low.pre_obr.rms
        << ",\"lowPeak\":" << low.pre_obr.peak
        << ",\"highRms\":" << high.pre_obr.rms
        << ",\"highPeak\":" << high.pre_obr.peak
        << ",\"highNearFullScaleSamples\":" << high.pre_obr.near_full_scale_samples
        << "},\n"
        << "  \"output\": {\n";
    PrintStereoMetrics("low", low.output);
    std::cout << ",\n";
    PrintStereoMetrics("high", high.output);
    std::cout << "\n  },\n"
        << "  \"coherentEightChannelStress\": {\n";
    PrintStereoMetrics("low", coherent_low);
    std::cout << ",\n";
    PrintStereoMetrics("high", coherent_high);
    std::cout << ",\n";
    PrintStereoMetrics("fullScaleSafety", coherent_full_scale);
    std::cout << ",\n    \"expectedLevelRatio\":" << expected_level_ratio
        << ",\"measuredLevelRatio\":" << coherent_level_ratio
        << "\n  },\n"
        << "  \"performance\": {\"obrProcessP99Ms\":" << high.process_p99_ms
        << ",\"blockBudgetMs\":" << (1000.0 * kFramesPerBlock / kSampleRate)
        << "}\n"
        << "}\n";
    return pass ? 0 : 1;
}
