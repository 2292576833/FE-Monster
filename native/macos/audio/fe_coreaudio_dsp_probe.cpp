#ifdef NDEBUG
#undef NDEBUG
#endif
#include "fe_coreaudio_dsp.h"
#include <cassert>
#include <iostream>

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
    std::array<float, 4096 * 2> input{}, output{};
    for (uint32_t f = 0; f < 4096; ++f) {
        input[f * 2] = .15f * std::sin(6.283185307179586 * 440 * f / 48000);
        input[f * 2 + 1] = .1f * std::sin(6.283185307179586 * 660 * f / 48000);
    }
    // All four signal routes and all actual portable upmix algorithms.
    for (auto channels : {6u, 8u}) for (auto algorithm : {0u, 1u, 2u, 4u})
        for (bool upmix : {false, true}) for (bool obr : {false, true}) {
            DspGraph graph(48000, controls(channels, algorithm, upmix, obr));
            assert(graph.stageMixer(7, cleanMixer(), 0) == 0);
            assert(graph.stageMixer(6, cleanMixer(), 0) == -2);
            for (int block = 0; block < 4; ++block) assert(graph.process(input.data(), 4096, 2, output.data()) == 0);
            float peak = 0;
            for (float value : output) { assert(std::isfinite(value)); peak = std::max(peak, std::abs(value)); }
            assert(peak > 1e-5f && peak <= .9441f);
            assert(graph.mixer_calls > 0);
            assert((graph.upmix_calls > 0) == upmix);
            assert((graph.obr_calls > 0) == obr);
            if (upmix) assert(graph.last_upmix_order < graph.last_mixer_order);
            if (obr) assert(graph.last_mixer_order < graph.last_obr_order);
        }
    // Every canonical bed channel must reach stereo output in a channel test.
    DspGraph whole(48000, controls(6, 1, true, true));
    DspGraph fragmented(48000, controls(6, 1, true, true));
    std::array<float, 4096 * 2> fragment_output{}, whole_output{};
    assert(whole.process(input.data(), 4096, 2, whole_output.data()) == 0);
    for (uint32_t offset = 0; offset < 4096; offset += 128)
        assert(fragmented.process(input.data() + offset * 2, 128, 2, fragment_output.data() + offset * 2) == 0);
    for (uint32_t i = 0; i < 4096 * 2; ++i) assert(std::abs(fragment_output[i] - whole_output[i]) < 1e-6f);
    DspGraph control_candidate(48000, controls(6, 1, true, true), false);
    control_candidate.inheritState(whole, 128);
    assert(control_candidate.process(input.data(), 4096, 2, whole_output.data()) == 0);
    assert(std::any_of(whole_output.begin(), whole_output.end(), [](float value) { return std::abs(value) > 1e-5f; }));
    DspGraph graph(48000, controls(8, 1, true, false));
    std::array<float, 4096 * 8> bed{};
    for (uint32_t channel = 0; channel < 8; ++channel) {
        bed.fill(0);
        for (uint32_t f = 0; f < 4096; ++f) bed[f * 8 + channel] = .1f;
        assert(graph.process(input.data(), 4096, 2, output.data(), bed.data()) == 0);
        assert(std::any_of(output.begin(), output.end(), [](float value) { return std::abs(value) > 1e-5f; }));
    }
    std::cout << "Mac portable DSP: 32 routes, gain safety, revision/order, 7.1 channel tests PASS\n";
}
