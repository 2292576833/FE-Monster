use fe_monster_upmix::{FeRustMixerParams, mixer_preset_params};

fn boolean(value: u32) -> &'static str {
    if value == 0 { "false" } else { "true" }
}

fn parameters(p: &FeRustMixerParams) -> String {
    let eq = p
        .eq_db
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>()
        .join(",");
    format!(
        concat!(
            "{{",
            "\"enabled\":{},",
            "\"inputGainDb\":{},\"outputGainDb\":{},\"balance\":{},",
            "\"eqDb\":[{}],",
            "\"stereoWidth\":{},\"centerGain\":{},\"surroundGain\":{},\"lfeGain\":{},",
            "\"compressorEnabled\":{},",
            "\"compressorThresholdDb\":{},\"compressorRatio\":{},",
            "\"compressorAttackMs\":{},\"compressorReleaseMs\":{},",
            "\"compressorKneeDb\":{},\"compressorMakeupDb\":{},",
            "\"limiterEnabled\":{},\"limiterCeilingDb\":{},\"limiterReleaseMs\":{},",
            "\"reverbEnabled\":{},\"reverbRoomSize\":{},\"reverbDecayMs\":{},",
            "\"reverbDamping\":{},\"reverbPreDelayMs\":{},\"reverbWet\":{},\"reverbDry\":{},",
            "\"chorusEnabled\":{},\"chorusRateHz\":{},\"chorusDepth\":{},",
            "\"chorusCenterDelayMs\":{},\"chorusFeedback\":{},\"chorusMix\":{},",
            "\"flangerEnabled\":{},\"flangerRateHz\":{},\"flangerDepth\":{},",
            "\"flangerCenterDelayMs\":{},\"flangerFeedback\":{},\"flangerMix\":{},",
            "\"phaserEnabled\":{},\"phaserRateHz\":{},\"phaserDepth\":{},",
            "\"phaserCenterFrequencyHz\":{},\"phaserFeedback\":{},\"phaserMix\":{},",
            "\"delayEnabled\":{},\"delayMs\":{},\"delayFeedback\":{},",
            "\"delayPingPong\":{},\"delayDampingHz\":{},\"delayMix\":{},",
            "\"earlyReflectionsEnabled\":{},\"earlyReflectionsRoomSize\":{},",
            "\"earlyReflectionsDiffusion\":{},\"earlyReflectionsDamping\":{},",
            "\"earlyReflectionsMix\":{}",
            "}}"
        ),
        boolean(p.enabled),
        p.input_gain_db,
        p.output_gain_db,
        p.balance,
        eq,
        p.stereo_width,
        p.center_gain,
        p.surround_gain,
        p.lfe_gain,
        boolean(p.compressor_enabled),
        p.compressor_threshold_db,
        p.compressor_ratio,
        p.compressor_attack_ms,
        p.compressor_release_ms,
        p.compressor_knee_db,
        p.compressor_makeup_db,
        boolean(p.limiter_enabled),
        p.limiter_ceiling_db,
        p.limiter_release_ms,
        boolean(p.reverb_enabled),
        p.reverb_room_size,
        p.reverb_decay_ms,
        p.reverb_damping,
        p.reverb_pre_delay_ms,
        p.reverb_wet,
        p.reverb_dry,
        boolean(p.chorus_enabled),
        p.chorus_rate_hz,
        p.chorus_depth,
        p.chorus_center_delay_ms,
        p.chorus_feedback,
        p.chorus_mix,
        boolean(p.flanger_enabled),
        p.flanger_rate_hz,
        p.flanger_depth,
        p.flanger_center_delay_ms,
        p.flanger_feedback,
        p.flanger_mix,
        boolean(p.phaser_enabled),
        p.phaser_rate_hz,
        p.phaser_depth,
        p.phaser_center_frequency_hz,
        p.phaser_feedback,
        p.phaser_mix,
        boolean(p.delay_enabled),
        p.delay_ms,
        p.delay_feedback,
        p.delay_ping_pong,
        p.delay_damping_hz,
        p.delay_mix,
        boolean(p.early_reflections_enabled),
        p.early_reflections_room_size,
        p.early_reflections_diffusion,
        p.early_reflections_damping,
        p.early_reflections_mix
    )
}

fn main() {
    let ids = [
        "clean",
        "bathroom",
        "hall",
        "surround-3d",
        "cinema",
        "vocal-clear",
        "bass-boost",
        "night",
        "wide-chorus",
        "classic-flanger",
        "flowing-phaser",
        "ping-pong-delay",
        "nearfield-studio",
        "immersive-live",
        "clear-spatial",
    ];
    print!("{{\"presetVersion\":1,\"presets\":[");
    for (index, id) in ids.iter().enumerate() {
        if index > 0 {
            print!(",");
        }
        let preset = mixer_preset_params(index as u32).expect("stable preset id");
        print!(
            "{{\"id\":\"{}\",\"parameters\":{}}}",
            id,
            parameters(&preset)
        );
    }
    println!("]}}");
}
