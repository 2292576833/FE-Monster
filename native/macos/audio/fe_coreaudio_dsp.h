#pragma once

#include "../../windows/audio/fe_audio_pipeline.h"
#include "../../windows/audio/fe_audio_spatial_layout.h"
#include "../../rust-audio-upmix/include/fe_rust_upmix.h"
#include "obr/audio_buffer/audio_buffer.h"
#include "obr/renderer/obr_impl.h"
#include <array>
#include <cstring>
#include <memory>
#include <stdexcept>
#include <vector>

extern "C" {
uint32_t fe_rust_upmix_abi_version();
void* fe_rust_upmix_create(const FeRustUpmixConfig*);
int32_t fe_rust_upmix_update(void*, const FeRustUpmixConfig*);
int32_t fe_rust_upmix_process(void*, const float*, uint32_t, float*, uint32_t);
int32_t fe_rust_upmix_reset(void*);
void fe_rust_upmix_destroy(void*);
}

namespace fe::mac_audio {
// DSP runs on the serialized PCM submission thread. The device callback only
// consumes already rendered stereo samples, independent of the window state.
class DspGraph final {
public:
    static constexpr uint32_t kQuantum = 256;
    const uint32_t rate;
    FeAudioSpatialControlParams spatial{};
    FeRustMixerParams mixer_params{};
    FeRustChannelRouterParams router_params{};
    uint64_t mixer_revision = 0, router_revision = 0;
    bool mixer_present = false, router_present = false;
    uint64_t mixer_calls = 0, upmix_calls = 0, obr_calls = 0, order = 0;
    uint64_t position_updates = 0;
    uint64_t last_upmix_order = 0, last_mixer_order = 0, last_obr_order = 0;
    uint64_t mixer_failures = 0;
    int last_result = 0;
    float energy = 0;

    DspGraph(uint32_t sample_rate, const FeAudioSpatialControlParams& controls, bool create_renderer = true)
        : rate(sample_rate), spatial(controls) {
        if (fe_rust_mixer_abi_version() != FE_RUST_MIXER_ABI_VERSION
            || fe_rust_channel_router_abi_version() != FE_RUST_CHANNEL_ROUTER_ABI_VERSION
            || fe_rust_upmix_abi_version() != FE_RUST_UPMIX_ABI_VERSION)
            throw std::runtime_error("Rust audio ABI mismatch");
        FeRustMixerConfig mc{};
        mc.struct_size = sizeof(mc); mc.abi_version = FE_RUST_MIXER_ABI_VERSION;
        mc.sample_rate = rate; mc.max_frames_per_call = kQuantum;
        mixer_ = fe_rust_mixer_create(&mc);
        if (!mixer_) throw std::runtime_error("Rust mixer allocation failed");
        try { buildSpatial(create_renderer); } catch (...) {
            fe_rust_mixer_destroy(mixer_); mixer_ = nullptr;
            if (router_) fe_rust_channel_router_destroy(router_);
            if (upmix_) fe_rust_upmix_destroy(upmix_);
            throw;
        }
    }
    ~DspGraph() {
        if (mixer_) fe_rust_mixer_destroy(mixer_);
        if (router_) fe_rust_channel_router_destroy(router_);
        if (upmix_) fe_rust_upmix_destroy(upmix_);
    }
    DspGraph(const DspGraph&) = delete;
    DspGraph& operator=(const DspGraph&) = delete;
    uint32_t channels() const noexcept { return spatial.upmix_enabled ? spatial.upmix_output_channels : 2; }

    // A complete replacement validates the transaction first. Once accepted,
    // retain compatible live DSP state so sliders do not repeatedly restart
    // STFT windows, compressor envelopes, or OBR convolution tails.
    void inheritState(DspGraph& previous, uint32_t ramp) {
        if (mixer_present && previous.mixer_present) {
            const bool same = mixer_revision == previous.mixer_revision
                && std::memcmp(&mixer_params, &previous.mixer_params, sizeof(mixer_params)) == 0;
            if (same || previous.stageMixer(mixer_revision, mixer_params, ramp) == 0)
                std::swap(mixer_, previous.mixer_);
        }
        if (spatial.upmix_output_channels == previous.spatial.upmix_output_channels) {
            const auto config = upmixConfig(spatial);
            if (fe_rust_upmix_update(previous.upmix_, &config) == 0)
                std::swap(upmix_, previous.upmix_);
            const bool same = router_revision == previous.router_revision
                && std::memcmp(&router_params, &previous.router_params, sizeof(router_params)) == 0;
            if (same || previous.stageRouter(router_revision, router_params, ramp) == 0)
                std::swap(router_, previous.router_);
        }
        if (channels() == previous.channels()
            && spatial.obr_filter_profile == previous.spatial.obr_filter_profile) {
            std::swap(renderer_, previous.renderer_);
            std::swap(obr_input_, previous.obr_input_);
            std::swap(obr_output_, previous.obr_output_);
            dry_delay_.swap(previous.dry_delay_);
            delay_cursor_ = previous.delay_cursor_; headroom_ = previous.headroom_;
        }
        limiter_ = previous.limiter_; energy = previous.energy;
        if (spatial.upmix_output_channels == previous.spatial.upmix_output_channels) {
            passive_delay_.swap(previous.passive_delay_);
            passive_delay_cursor_ = previous.passive_delay_cursor_;
            passive_gain_ = previous.passive_gain_;
        }
        pending_stereo_ = previous.pending_stereo_;
        pending_output_ = previous.pending_output_;
        pending_frames_ = previous.pending_frames_;
        mixer_calls = previous.mixer_calls; upmix_calls = previous.upmix_calls;
        obr_calls = previous.obr_calls; order = previous.order;
        position_updates = previous.position_updates;
        last_upmix_order = previous.last_upmix_order; last_mixer_order = previous.last_mixer_order;
        last_obr_order = previous.last_obr_order; mixer_failures = previous.mixer_failures;
        updatePositions();
    }

    int stageMixer(uint64_t revision, const FeRustMixerParams& params, uint32_t ramp) {
        if (mixer_present && revision < mixer_revision) return -2;
        const int result = fe_rust_mixer_stage_params(mixer_, revision + 1, &params);
        if (result) return result;
        const int commit = fe_rust_mixer_commit(mixer_, revision + 1, ramp);
        if (commit) return commit;
        mixer_params = params; mixer_revision = revision; mixer_present = true;
        return 0;
    }
    int stageRouter(uint64_t revision, const FeRustChannelRouterParams& params, uint32_t ramp) {
        if (params.output_channels != spatial.upmix_output_channels) return -1;
        if (router_present && revision < router_revision) return -2;
        const int result = fe_rust_channel_router_stage(router_, revision + 2, &params);
        if (result) return result;
        const int commit = fe_rust_channel_router_commit(router_, revision + 2, ramp);
        if (commit) return commit;
        router_params = params; router_revision = revision; router_present = true;
        if (renderer_) updatePositions();
        return 0;
    }
    void reset() {
        fe_rust_mixer_reset(mixer_); fe_rust_channel_router_reset(router_);
        fe_rust_upmix_reset(upmix_);
        std::fill(dry_delay_.begin(), dry_delay_.end(), 0); delay_cursor_ = 0;
        headroom_ = 1.0f / std::sqrt(static_cast<float>(channels()));
    }
    FeRustChannelRouterStatus routerStatus() const {
        FeRustChannelRouterStatus status{};
        status.struct_size = sizeof(status); status.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
        fe_rust_channel_router_get_status(router_, &status);
        if (spatial.upmix_algorithm == 0) {
            status.process_calls = upmix_calls;
            for (uint32_t c = 0; c < 8; ++c) {
                status.channel_peak[c] = peaks_[c]; status.channel_rms[c] = rms_[c];
            }
        }
        return status;
    }
    // Controls which do not change renderer allocation are updated in-place.
    // The caller prepares a replacement graph before changing bed/profile.
    int updateSpatial(const FeAudioSpatialControlParams& next) {
        auto config = upmixConfig(next);
        const int result = fe_rust_upmix_update(upmix_, &config);
        if (result) return result;
        spatial = next;
        updatePositions();
        return 0;
    }
    int process(const float* input, uint32_t frames, uint32_t input_channels,
                float* output, const float* test_bed = nullptr) {
        if (!input || !output || !frames || frames > 4096
            || (input_channels != 1 && input_channels != 2)) return -1;
        if (test_bed) return renderQuantum(input, frames, input_channels, output, test_bed);
        // Transport batch boundaries must not change the fixed OBR render
        // cadence. One quantum of initial latency permits arbitrary finite PCM
        // batches without inserting padding in the middle of the music.
        for (uint32_t frame = 0; frame < frames; ++frame) {
            for (uint32_t c = 0; c < 2; ++c) {
                output[frame * 2 + c] = pending_output_[pending_frames_ * 2 + c];
                pending_stereo_[pending_frames_ * 2 + c] = input[frame * input_channels
                    + (input_channels == 1 ? 0 : c)];
            }
            if (++pending_frames_ == kQuantum) {
                const int result = renderQuantum(pending_stereo_.data(), kQuantum, 2, pending_output_.data());
                pending_frames_ = 0;
                if (result) return result;
            }
        }
        return 0;
    }
private:
    int renderQuantum(const float* input, uint32_t frames, uint32_t input_channels,
                float* output, const float* test_bed = nullptr) {
        if (!input || !output || frames == 0 || frames > 4096) return -1;
        for (uint32_t offset = 0; offset < frames; offset += kQuantum) {
            const uint32_t count = std::min(kQuantum, frames - offset);
            // OBR is a streaming fixed-quantum renderer. Pad only the final
            // partial block; accepted web PCM is normally 4096/256 aligned.
            stereo_.fill(0); bed_.fill(0); dry_.fill(0);
            for (uint32_t f = 0; f < count; ++f) {
                const float left = input[(offset + f) * input_channels];
                stereo_[f * 2] = left;
                stereo_[f * 2 + 1] = input_channels == 1 ? left : input[(offset + f) * input_channels + 1];
            }
            const uint32_t ch = channels();
            if (test_bed) {
                for (uint32_t f = 0; f < count; ++f)
                    std::copy_n(test_bed + (offset + f) * ch, ch, bed_.data() + f * ch);
            } else if (spatial.upmix_enabled) {
                const int result = spatial.upmix_algorithm == 0
                    ? fe_rust_upmix_process(upmix_, stereo_.data(), kQuantum, bed_.data(), kQuantum * ch)
                    : fe_rust_channel_router_process(router_, stereo_.data(), kQuantum, bed_.data(), kQuantum * ch);
                if (result < 0) return last_result = result;
                if (spatial.upmix_algorithm == 0) applyPassiveChannelControls(ch);
                ++upmix_calls; last_upmix_order = ++order;
            } else std::copy(stereo_.begin(), stereo_.end(), bed_.begin());

            backup_ = bed_;
            if (mixer_present) {
                const int result = fe_rust_mixer_process(mixer_, bed_.data(), kQuantum, ch);
                ++mixer_calls; last_mixer_order = ++order;
                if (result < 0) { bed_ = backup_; ++mixer_failures; last_result = result; }
            }
            fold(ch);
            if (spatial.obr_enabled) {
                const float candidate = fe::audio::SpatialObrBlockInputHeadroom(bed_.data(), kQuantum, ch);
                headroom_ = fe::audio::SmoothSpatialObrInputHeadroom(headroom_, candidate, kQuantum, rate);
                for (uint32_t c = 0; c < ch; ++c) {
                    auto planar = (*obr_input_)[c];
                    for (uint32_t f = 0; f < kQuantum; ++f) planar[f] = bed_[f * ch + c] * headroom_;
                }
                renderer_->Process(*obr_input_, obr_output_.get());
                ++obr_calls; last_obr_order = ++order;
                const float norm = std::hypot(spatial.obr_wet, spatial.obr_dry);
                const float wet = norm > 1e-6f ? spatial.obr_wet / norm : 0;
                const float dry = norm > 1e-6f ? spatial.obr_dry / norm : 1;
                const float gain = std::pow(10.0f, spatial.obr_output_gain_db / 20)
                    * (spatial.upmix_enabled ? fe::audio::kSpatialObrUpmixRouteCalibration
                                            : fe::audio::kSpatialObrStereoRouteCalibration);
                const float compensation = std::sqrt(static_cast<float>(ch))
                    * (spatial.upmix_enabled && spatial.upmix_algorithm == 1
                        ? fe::audio::kSpatialObrMatrixDecodeMakeup : 1);
                for (uint32_t f = 0; f < count; ++f) {
                    for (uint32_t c = 0; c < 2; ++c) {
                        float aligned = dry_[f * 2 + c];
                        if (wet > 1e-6f && dry > 1e-6f) {
                            const size_t slot = delay_cursor_ * 2 + c;
                            aligned = dry_delay_[slot]; dry_delay_[slot] = dry_[f * 2 + c];
                        }
                        dry_[f * 2 + c] = ((*obr_output_)[c][f] * compensation * wet + aligned * dry) * gain;
                    }
                    if (wet > 1e-6f && dry > 1e-6f) delay_cursor_ = (delay_cursor_ + 1) % (dry_delay_.size() / 2);
                }
            }
            for (uint32_t f = 0; f < count; ++f) {
                const float peak = std::max(std::abs(dry_[f * 2]), std::abs(dry_[f * 2 + 1]));
                const float wanted = peak > 0.94406088f ? 0.94406088f / peak : 1.0f;
                limiter_ = wanted < limiter_ ? wanted : limiter_ + (wanted - limiter_) * (1 - std::exp(-1.0f / (rate * .05f)));
                for (uint32_t c = 0; c < 2; ++c) {
                    const float value = dry_[f * 2 + c] * limiter_;
                    if (!std::isfinite(value)) return last_result = -1;
                    output[(offset + f) * 2 + c] = value;
                }
            }
        }
        double square = 0;
        for (uint32_t i = 0; i < frames * 2; ++i) square += output[i] * output[i];
        energy = static_cast<float>(std::sqrt(square / (frames * 2)));
        return 0;
    }
    void* mixer_ = nullptr;
    void* router_ = nullptr;
    void* upmix_ = nullptr;
    std::unique_ptr<obr::ObrImpl> renderer_;
    std::unique_ptr<obr::AudioBuffer> obr_input_, obr_output_;
    std::array<float, kQuantum * 2> stereo_{}, dry_{};
    std::array<float, kQuantum * 2> pending_stereo_{}, pending_output_{};
    uint32_t pending_frames_ = 0;
    std::array<float, kQuantum * 8> bed_{}, backup_{};
    std::vector<float> dry_delay_;
    std::vector<float> passive_delay_;
    uint32_t passive_delay_stride_ = 0, passive_delay_cursor_ = 0;
    std::array<float, 8> passive_gain_{1, 1, 1, 1, 1, 1, 1, 1}, peaks_{}, rms_{};
    size_t delay_cursor_ = 0;
    float headroom_ = 1, limiter_ = 1;

    FeRustUpmixConfig upmixConfig(const FeAudioSpatialControlParams& p) const {
        FeRustUpmixConfig c{};
        c.struct_size = sizeof(c); c.abi_version = FE_RUST_UPMIX_ABI_VERSION;
        c.sample_rate = rate; c.output_channels = p.upmix_output_channels;
        c.algorithm = 0; c.center_width_hz = p.upmix_center_width_hz;
        c.lfe_crossover_hz = p.upmix_lfe_crossover_hz; c.lfe_gain = p.upmix_lfe_gain;
        c.center_gain = p.upmix_center_gain; c.surround_gain = p.upmix_surround_gain;
        c.decorrelation_amount = p.upmix_decorrelation_amount;
        return c;
    }
    void buildSpatial(bool create_renderer) {
        FeRustChannelRouterConfig rc{};
        rc.struct_size = sizeof(rc); rc.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
        rc.sample_rate = rate; rc.max_frames_per_call = kQuantum;
        rc.output_channels = spatial.upmix_output_channels; rc.max_delay_ms = 200;
        router_ = fe_rust_channel_router_create(&rc);
        const auto uc = upmixConfig(spatial);
        upmix_ = fe_rust_upmix_create(&uc);
        if (!router_ || !upmix_) throw std::runtime_error("Rust spatial allocation failed");
        router_params.struct_size = sizeof(router_params);
        router_params.abi_version = FE_RUST_CHANNEL_ROUTER_ABI_VERSION;
        router_params.output_channels = spatial.upmix_output_channels;
        router_params.algorithm = spatial.upmix_algorithm == 0 ? 1 : spatial.upmix_algorithm;
        router_params.lfe_crossover_hz = spatial.upmix_lfe_crossover_hz;
        if (spatial.upmix_algorithm != 0) {
            const auto decibels = [](float gain) { return gain <= .001f ? -60.0f : 20 * std::log10(gain); };
            router_params.channel_gain_db[2] = decibels(spatial.upmix_center_gain);
            router_params.channel_gain_db[3] = decibels(spatial.upmix_lfe_gain);
            for (uint32_t c = 4; c < spatial.upmix_output_channels; ++c)
                router_params.channel_gain_db[c] = decibels(spatial.upmix_surround_gain);
        }
        for (uint32_t c = 0; c < 8; ++c) router_params.channel_azimuth_deg[c]
            = fe::audio::DefaultSpatialBedObjectPose(spatial.upmix_output_channels, c).azimuth;
        if (stageRouter(0, router_params, 0)) throw std::runtime_error("Rust router defaults rejected");
        router_present = false;
        dry_delay_.resize(std::max(1u, static_cast<uint32_t>(std::lround(rate * 104.0 / 48000))) * 2);
        passive_delay_stride_ = static_cast<uint32_t>(rate * .2f) + 1;
        passive_delay_.resize(passive_delay_stride_ * spatial.upmix_output_channels);
        // For live controls with unchanged bed/profile the validated candidate
        // takes the existing renderer in inheritState(), avoiding a costly OBR
        // rebuild while the PCM producer is servicing the playback queue.
        if (!create_renderer) return;
        renderer_ = std::make_unique<obr::ObrImpl>(kQuantum, rate);
        const auto profile = spatial.obr_filter_profile == 1 ? obr::BinauralFilterProfile::kAmbient
            : spatial.obr_filter_profile == 2 ? obr::BinauralFilterProfile::kReverberant
            : obr::BinauralFilterProfile::kDirect;
        for (uint32_t c = 0; c < channels(); ++c)
            if (!renderer_->AddAudioElement(obr::AudioElementType::kObjectMono, profile).ok())
                throw std::runtime_error("OBR audio element rejected");
        obr_input_ = std::make_unique<obr::AudioBuffer>(channels(), kQuantum);
        obr_output_ = std::make_unique<obr::AudioBuffer>(2, kQuantum);
        updatePositions();
    }
    void applyPassiveChannelControls(uint32_t ch) {
        peaks_.fill(0); rms_.fill(0);
        for (uint32_t f = 0; f < kQuantum; ++f) {
            for (uint32_t c = 0; c < ch; ++c) {
                const float desired = std::pow(10.0f, router_params.channel_gain_db[c] / 20);
                passive_gain_[c] += (desired - passive_gain_[c]) * (1 - std::exp(-1.0f / (rate * .01f)));
                const uint32_t delay = std::min(passive_delay_stride_ - 1,
                    static_cast<uint32_t>(std::lround(router_params.channel_delay_ms[c] * rate / 1000)));
                const uint32_t position = passive_delay_cursor_ * ch + c;
                passive_delay_[position] = bed_[f * ch + c];
                const uint32_t read = (passive_delay_cursor_ + passive_delay_stride_ - delay) % passive_delay_stride_;
                const float value = passive_delay_[read * ch + c] * passive_gain_[c];
                bed_[f * ch + c] = value;
                peaks_[c] = std::max(peaks_[c], std::abs(value)); rms_[c] += value * value;
            }
            passive_delay_cursor_ = (passive_delay_cursor_ + 1) % passive_delay_stride_;
        }
        for (uint32_t c = 0; c < ch; ++c) rms_[c] = std::sqrt(rms_[c] / kQuantum);
    }
    void updatePositions() {
        for (uint32_t c = 0; c < channels(); ++c) {
            const auto pose = fe::audio::DefaultSpatialBedObjectPose(channels(), c);
            const float base = router_present && spatial.upmix_enabled ? router_params.channel_azimuth_deg[c] : pose.azimuth;
            const auto status = renderer_->UpdateObjectPosition(c,
                fe::audio::SpatialBedAzimuthForWidth(channels(), c, base, spatial.obr_spatial_width), pose.elevation, pose.distance);
            if (!status.ok()) throw std::runtime_error("OBR object position rejected");
            ++position_updates;
        }
    }
    void fold(uint32_t ch) {
        const float calibration = spatial.upmix_enabled
            ? (spatial.upmix_algorithm == 1 ? fe::audio::kSpatialMatrixDecodeStereoFoldCalibration
                                          : fe::audio::kSpatialUpmixStereoFoldCalibration) : 1;
        for (uint32_t f = 0; f < kQuantum; ++f) {
            const float* b = bed_.data() + f * ch;
            float l = b[0], r = b[1];
            if (ch >= 6) {
                l += .70710678f * b[2] + .5f * b[3] + .5f * b[4];
                r += .70710678f * b[2] + .5f * b[3] + .5f * b[5];
                if (ch == 8) { l += .5f * b[6]; r += .5f * b[7]; }
                l /= ch == 8 ? 1.5f : std::sqrt(2.0f); r /= ch == 8 ? 1.5f : std::sqrt(2.0f);
            }
            dry_[f * 2] = l * calibration; dry_[f * 2 + 1] = r * calibration;
        }
    }
};
}
