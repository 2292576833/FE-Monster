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
            "\"reverbDamping\":{},\"reverbPreDelayMs\":{},\"reverbWet\":{},\"reverbDry\":{}",
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
        p.reverb_dry
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
