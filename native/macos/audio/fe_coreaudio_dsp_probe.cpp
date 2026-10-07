#ifdef NDEBUG
#undef NDEBUG
#endif
#include "fe_coreaudio_dsp.h"
#include <iostream>
#include <sstream>

namespace {
std::string probe_stage = "startup";
void require(bool passed, const char* expression, int line) {
    if (!passed) {
        std::ostringstream message;
        message << "DSP probe failed at line " << line << ": " << expression << "; stage=" << probe_stage;
        throw std::runtime_error(message.str());
    }
}
}
#define REQUIRE(expression) require((expression), #expression, __LINE__)

using fe::mac_audio::DspGraph;
FeAudioSpatialControlParams controls(uint32_t channels, uint32_t algorithm, bool upmix, bool obr) {
    FeAudioSpatialControlParams p{};
    p.struct_size = sizeof(p); p.abi_version = FE_AUDIO_PIPELINE_ABI_VERSION;
    p.upmix_output_channels = channels; p.upmix_algorithm = algorithm; p.upmix_enabled = upmix;
    p.upmix_center_width_hz = 700; p.upmix_lfe_crossover_hz = 120;
    p.upmix_center_gain = p.upmix_surround_gain = p.upmix_lfe_gain = 1;
    p.upmix_decorrelation_amount = .35f; p.obr_enabled = obr; p.obr_wet = 1;
    p.obr_spatial_width = 1;
    return p;
}
FeRustMixerParams cleanMixer() {
    FeRustMixerParams p{};
    p.struct_size = sizeof(p); p.abi_version = FE_RUST_MIXER_ABI_VERSION;
    p.enabled = 1; p.stereo_width = p.center_gain = p.surround_gain = p.lfe_gain = 1;
    p.compressor_threshold_db = -18; p.compressor_ratio = 2; p.compressor_attack_ms = 10;
    p.compressor_release_ms = 150; p.compressor_knee_db = 6;
    p.limiter_ceiling_db = -.3f; p.limiter_release_ms = 100;
    p.reverb_room_size = .35f; p.reverb_decay_ms = 800; p.reverb_damping = .5f;
    p.reverb_pre_delay_ms = 12; p.reverb_dry = 1;
    p.chorus_rate_hz = .3f; p.chorus_depth = .35f; p.chorus_center_delay_ms = 18;
    p.flanger_rate_hz = .18f; p.flanger_depth = .5f; p.flanger_center_delay_ms = 1.5f; p.flanger_feedback = .35f;
    p.phaser_rate_hz = .2f; p.phaser_depth = .5f; p.phaser_center_frequency_hz = 900; p.phaser_feedback = .2f;
    p.delay_ms = 320; p.delay_feedback = .3f; p.delay_ping_pong = .75f; p.delay_damping_hz = 8000;
    p.early_reflections_room_size = .35f; p.early_reflections_diffusion = .55f; p.early_reflections_damping = .45f;
    return p;
}
int main() {
    std::cerr << std::unitbuf;
    try {
    probe_stage = "8192 FFT / 256-frame round trip";
    std::cerr << "[DSP] " << probe_stage << '\n';
    obr::FftManager fft(DspGraph::kQuantum);
    REQUIRE(fft.GetFftSize() == FE_AUDIO_OBR_SAMPLE_POINTS);
    obr::AudioBuffer fft_input(1, DspGraph::kQuantum), fft_frequency(1, fft.GetFftSize()), fft_output(1, DspGraph::kQuantum);
    fft_input.Clear(); fft_input[0][0] = .25f;
    fft.FreqFromTimeDomain(fft_input[0], &fft_frequency[0]);
    fft.TimeFromFreqDomain(fft_frequency[0], &fft_output[0]);
    fft.ApplyReverseFftScaling(&fft_output[0]);
    REQUIRE(std::abs(fft_output[0][0] - .25f) < 1e-6f);
    for (uint32_t f = 1; f < DspGraph::kQuantum; ++f) REQUIRE(std::abs(fft_output[0][f]) < 1e-6f);
    probe_stage = "FFT magnitude bins and partitioned convolution / direct FIR reference";
    std::cerr << "[DSP] " << probe_stage << '\n';
    obr::AudioBuffer canonical(1, fft.GetFftSize()), magnitudes(1, fft.GetFftSize() / 2 + 1);
    fft.GetCanonicalFormatFreqBuffer(fft_frequency[0], &canonical[0]);
    fft.MagnitudeFromCanonicalFreqBuffer(canonical[0], &magnitudes[0]);
    // OBR deliberately uses one Newton iteration for its scalar magnitude
    // remainder, whose relative error can approach 0.2 percent.
    for (uint32_t bin = 0; bin < magnitudes.num_frames(); ++bin)
        REQUIRE(std::abs(magnitudes[0][bin] - .25f) < .0006f);
    constexpr uint32_t filter_length = 768, signal_length = 256 * 8;
    obr::AudioBuffer kernel(1, filter_length);
    kernel.Clear(); kernel[0][0] = .5f; kernel[0][255] = .125f; kernel[0][256] = -.25f;
    kernel[0][511] = .2f; kernel[0][512] = .0625f; kernel[0][700] = .1f;
    obr::PartitionedFftFilter filter(filter_length, DspGraph::kQuantum, &fft);
    filter.SetTimeDomainKernel(kernel[0]);
    std::array<float, signal_length> signal{}, reference{};
    signal[0] = .5f; signal[255] = -.25f; signal[256] = .125f; signal[511] = .75f;
    for (uint32_t f = 0; f < signal_length; ++f)
        for (uint32_t tap = 0; tap < filter_length && tap <= f; ++tap)
            reference[f] += signal[f - tap] * kernel[0][tap];
    for (uint32_t offset = 0; offset < signal_length; offset += DspGraph::kQuantum) {
        for (uint32_t f = 0; f < DspGraph::kQuantum; ++f) fft_input[0][f] = signal[offset + f];
        fft.FreqFromTimeDomain(fft_input[0], &fft_frequency[0]);
        filter.Filter(fft_frequency[0]); filter.GetFilteredSignal(&fft_output[0]);
        for (uint32_t f = 0; f < DspGraph::kQuantum; ++f)
            REQUIRE(std::abs(fft_output[0][f] - reference[offset + f]) < 1e-5f);
    }
    std::array<float, 4096 * 2> input{}, output{};
    for (uint32_t f = 0; f < 4096; ++f) {
        input[f * 2] = .15f * std::sin(6.283185307179586 * 440 * f / 48000);
        input[f * 2 + 1] = .1f * std::sin(6.283185307179586 * 660 * f / 48000);
    }
    // All four signal routes and all actual portable upmix algorithms.
    for (auto channels : {6u, 8u}) for (auto algorithm : {0u, 1u, 2u, 4u})
        for (bool upmix : {false, true}) for (bool obr : {false, true}) {
            probe_stage = "layout=" + std::to_string(channels) + " algorithm=" + std::to_string(algorithm)
                + " upmix=" + std::to_string(upmix) + " obr=" + std::to_string(obr);
            std::cerr << "[DSP] constructing " << probe_stage << '\n';
            DspGraph graph(48000, controls(channels, algorithm, upmix, obr));
            std::cerr << "[DSP] staging controls " << probe_stage << '\n';
            REQUIRE(graph.stageMixer(7, cleanMixer(), 0) == 0);
            REQUIRE(graph.stageMixer(6, cleanMixer(), 0) == -2);
            for (int block = 0; block < 4; ++block) {
                std::cerr << "[DSP] process block=" << block << ' ' << probe_stage << '\n';
                REQUIRE(graph.process(input.data(), 4096, 2, output.data()) == 0);
            }
            float peak = 0;
            for (float value : output) { REQUIRE(std::isfinite(value)); peak = std::max(peak, std::abs(value)); }
            REQUIRE(peak > 1e-5f && peak <= .9441f);
            REQUIRE(graph.mixer_calls > 0);
            REQUIRE((graph.upmix_calls > 0) == upmix);
            REQUIRE((graph.obr_calls > 0) == obr);
            if (upmix) REQUIRE(graph.last_upmix_order < graph.last_mixer_order);
            if (obr) REQUIRE(graph.last_mixer_order < graph.last_obr_order);
        }
    // Every canonical bed channel must reach stereo output in a channel test.
    probe_stage = "PCM fragmentation invariance";
    std::cerr << "[DSP] " << probe_stage << '\n';
    DspGraph whole(48000, controls(6, 1, true, true));
    DspGraph fragmented(48000, controls(6, 1, true, true));
    std::array<float, 4096 * 2> fragment_output{}, whole_output{};
    REQUIRE(whole.process(input.data(), 4096, 2, whole_output.data()) == 0);
    for (uint32_t offset = 0; offset < 4096; offset += 128)
        REQUIRE(fragmented.process(input.data() + offset * 2, 128, 2, fragment_output.data() + offset * 2) == 0);
    for (uint32_t i = 0; i < 4096 * 2; ++i) REQUIRE(std::abs(fragment_output[i] - whole_output[i]) < 1e-6f);
    probe_stage = "live control state inheritance";
    std::cerr << "[DSP] " << probe_stage << '\n';
    DspGraph control_candidate(48000, controls(6, 1, true, true), false);
    control_candidate.inheritState(whole, 128);
    REQUIRE(control_candidate.process(input.data(), 4096, 2, whole_output.data()) == 0);
    REQUIRE(std::any_of(whole_output.begin(), whole_output.end(), [](float value) { return std::abs(value) > 1e-5f; }));
    DspGraph graph(48000, controls(8, 1, true, false));
    std::array<float, 4096 * 8> bed{};
    for (uint32_t channel = 0; channel < 8; ++channel) {
        probe_stage = "channel signal=" + std::to_string(channel);
        std::cerr << "[DSP] " << probe_stage << '\n';
        bed.fill(0);
        for (uint32_t f = 0; f < 4096; ++f) bed[f * 8 + channel] = .1f;
        REQUIRE(graph.process(input.data(), 4096, 2, output.data(), bed.data()) == 0);
        REQUIRE(std::any_of(output.begin(), output.end(), [](float value) { return std::abs(value) > 1e-5f; }));
    }
    std::cout << "Mac portable DSP: 32 routes, gain safety, revision/order, 7.1 channel tests PASS\n";
    return 0;
    } catch (const std::exception& failure) {
        std::cerr << "[DSP] " << failure.what() << "; stage=" << probe_stage << '\n';
        return 1;
    }
}
