package com.femonster.core;

import com.femonster.json.SimpleJson;
import com.femonster.model.Song;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class VisualBridgeService {
    private static final int LOW_FREQUENCY_BAND_COUNT = 512;

    private final PlayerService player;
    private final NativeAudioEngine audioEngine;

    public VisualBridgeService(PlayerService player, NativeAudioEngine audioEngine) {
        this.player = player;
        this.audioEngine = audioEngine;
    }

    public Map<String, Object> health() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("ready", true);
        body.put("schema", "fe.visual-state.v1");
        body.put("runtime", "java" + Runtime.version().feature());
        body.put("javaVersion", System.getProperty("java.version", ""));
        return body;
    }

    public Map<String, Object> state() {
        Map<String, Object> playerState = player.state();
        Map<String, Object> song = SimpleJson.asMap(playerState.get("song"));
        double position = SimpleJson.asDouble(playerState.get("position"), 0);
        double duration = SimpleJson.asDouble(playerState.get("duration"), 0);
        boolean playing = SimpleJson.asBoolean(playerState.get("playing"), false);

        Map<String, Object> root = new LinkedHashMap<>();
        root.put("schema", "fe.visual-state.v1");
        root.put("updatedAt", System.currentTimeMillis());
        root.put("song", songState(song, SimpleJson.asInt(playerState.get("queueIndex"), -1)));
        root.put("playback", playbackState(playing, position, duration));
        root.put("lyric", lyricState(position, duration));
        root.put("audio", audioState(position, playing, audioEngine.samplePayload()));
        root.put("colors", colors());
        root.put("fx", fx());
        root.put("shelf", shelf());
        root.put("queue", queueState(playerState));
        root.put("beatMap", beatMap(duration));
        root.put("window", windowState());
        return root;
    }

    private static Map<String, Object> songState(Map<String, Object> song, int queueIndex) {
        Map<String, Object> map = new LinkedHashMap<>(song);
        map.put("queueIndex", queueIndex);
        map.put("current", queueIndex >= 0);
        return map;
    }

    private static Map<String, Object> playbackState(boolean playing, double position, double duration) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("playing", playing);
        map.put("paused", !playing);
        map.put("time", position);
        map.put("duration", duration);
        map.put("rate", 1.0);
        return map;
    }

    private static Map<String, Object> lyricState(double position, double duration) {
        Map<String, Object> map = new LinkedHashMap<>();
        double progress = duration <= 0 ? 0 : Math.max(0, Math.min(1, position / duration));
        map.put("text", "FE Monster Java");
        map.put("progress", progress);
        map.put("progressSpan", 0.08);
        map.put("lines", List.of());
        return map;
    }

    private static Map<String, Object> audioState(double position, boolean playing, Map<String, Object> nativeSample) {
        boolean nativeActive = SimpleJson.asBoolean(nativeSample.get("active"), false);
        double nativeLow = clamp01(SimpleJson.asDouble(nativeSample.get("lowFrequencyAmplitude"), 0));
        double nativeEnergy = clamp01(SimpleJson.asDouble(nativeSample.get("energy"), 0));
        double nativeBeat = clamp01(SimpleJson.asDouble(nativeSample.get("beat"), 0));
        List<Double> nativeLowBands = lowFrequencyBands(nativeSample.get("lowFrequencyBands"), nativeLow);
        if (nativeActive) {
            Map<String, Object> map = new LinkedHashMap<>();
            double energy = clamp01(Math.max(nativeEnergy, nativeLow * 0.72));
            map.put("energy", energy);
            map.put("bass", nativeLow);
            map.put("lowFrequencyAmplitude", nativeLow);
            map.put("lowFrequencyBands", nativeLowBands);
            map.put("lowFrequencyMinHz", 20);
            map.put("lowFrequencyMaxHz", 150);
            map.put("mid", clamp01(energy * 0.48));
            map.put("treble", clamp01(energy * 0.28));
            map.put("beat", nativeBeat);
            map.put("onset", nativeBeat > 0.58);
            map.put("sampleRate", SimpleJson.asInt(nativeSample.get("sampleRate"), 0));
            map.put("source", SimpleJson.asString(nativeSample.get("source"), "xaudio2-native-loopback"));
            return map;
        }

        double t = playing ? position : System.currentTimeMillis() / 1000.0;
        double bass = 0.50 + 0.30 * wave(t * 1.7);
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("energy", 0.46 + 0.18 * wave(t * 2.2));
        map.put("bass", bass);
        map.put("lowFrequencyAmplitude", bass);
        map.put("lowFrequencyBands", lowFrequencyBands(null, bass));
        map.put("lowFrequencyMinHz", 20);
        map.put("lowFrequencyMaxHz", 150);
        map.put("mid", 0.38 + 0.22 * wave(t * 3.3));
        map.put("treble", 0.32 + 0.28 * wave(t * 7.1));
        map.put("beat", wave(t * 2.0));
        map.put("onset", wave(t * 2.0) > 0.92);
        map.put("sampleRate", 0);
        map.put("source", "java-fallback");
        return map;
    }

    private static List<Double> lowFrequencyBands(Object value, double fallback) {
        List<Object> source = SimpleJson.asList(value);
        List<Double> bands = new ArrayList<>(LOW_FREQUENCY_BAND_COUNT);
        for (int index = 0; index < LOW_FREQUENCY_BAND_COUNT; index += 1) {
            double band = index < source.size()
                ? SimpleJson.asDouble(source.get(index), fallback)
                : fallback;
            bands.add(clamp01(band));
        }
        return bands;
    }

    private static double clamp01(double value) {
        if (!Double.isFinite(value)) return 0;
        return Math.max(0, Math.min(1, value));
    }

    private static double wave(double t) {
        return 0.5 + 0.5 * Math.sin(t);
    }

    private static Map<String, Object> colors() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("primaryR", 0.84);
        map.put("primaryG", 0.97);
        map.put("primaryB", 1.0);
        map.put("secondaryR", 0.61);
        map.put("secondaryG", 1.0);
        map.put("secondaryB", 0.87);
        map.put("highlightR", 1.0);
        map.put("highlightG", 0.94);
        map.put("highlightB", 0.72);
        return map;
    }

    private static Map<String, Object> fx() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("preset", 1);
        map.put("intensity", 1.0);
        map.put("speed", 1.0);
        map.put("tintMode", "cover");
        map.put("tintColor", "#7fd8ff");
        map.put("wallpaperMode", false);
        return map;
    }

    private static Map<String, Object> shelf() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("mode", "sphere");
        map.put("cameraMode", "orbit");
        map.put("presence", "local");
        map.put("size", 1.0);
        map.put("offsetX", 0.0);
        map.put("offsetY", 0.0);
        map.put("offsetZ", 0.0);
        map.put("angleY", -15.0);
        map.put("opacity", 1.0);
        map.put("bgOpacity", 0.75);
        map.put("accentColor", "#7fd8ff");
        return map;
    }

    private static Map<String, Object> queueState(Map<String, Object> playerState) {
        List<Object> queue = SimpleJson.asList(playerState.get("queue"));
        List<Object> items = new ArrayList<>(queue);
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("length", items.size());
        map.put("currentIndex", SimpleJson.asInt(playerState.get("queueIndex"), -1));
        map.put("items", items);
        return map;
    }

    private static Map<String, Object> beatMap(double duration) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("key", "java-simulated");
        map.put("source", "java");
        map.put("duration", duration);
        map.put("visualBeatCount", 0);
        map.put("cameraBeatCount", 0);
        return map;
    }

    private static Map<String, Object> windowState() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("width", 0);
        map.put("height", 0);
        map.put("dpr", 1.0);
        map.put("fullscreen", false);
        return map;
    }
}
