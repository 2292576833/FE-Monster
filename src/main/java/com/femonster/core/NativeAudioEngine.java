package com.femonster.core;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class NativeAudioEngine {
    private static final int NATIVE_SAMPLE_HEADER_SIZE = 5;
    private static final int LOW_FREQUENCY_BAND_COUNT = 512;
    private static final List<Float> EMPTY_LOW_FREQUENCY_BANDS =
        Collections.nCopies(LOW_FREQUENCY_BAND_COUNT, 0.0f);

    private final Path dllPath;
    private final boolean windows;
    private boolean available;
    private String status = "not-loaded";
    private String error = "";

    public NativeAudioEngine(ProjectPaths paths) {
        this.windows = System.getProperty("os.name", "").toLowerCase().contains("win");
        this.dllPath = resolveDll(paths);
        load();
    }

    public synchronized Map<String, Object> runtimePayload() {
        Map<String, Object> body = new LinkedHashMap<>();
        NativeSample sample = sample();
        body.put("requested", true);
        body.put("active", available);
        body.put("backend", available ? "xaudio2" : "html-audio-fallback");
        body.put("spatialBackend", "x3daudio");
        body.put("decoder", "media-foundation");
        body.put("sampleSource", sample.active ? "xaudio2-native-loopback" : "inactive");
        body.put("sampleRate", sample.sampleRate);
        body.put("lowFrequencyAmplitude", sample.lowFrequencyAmplitude);
        body.put("lowFrequencyBands", sample.lowFrequencyBands);
        body.put("dll", dllPath.toString());
        body.put("status", status);
        body.put("error", error);
        body.put("windows", windows);
        return body;
    }

    public synchronized boolean available() {
        return available;
    }

    public synchronized Map<String, Object> samplePayload() {
        NativeSample sample = sample();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("active", available && sample.active);
        body.put("backend", available ? "xaudio2" : "html-audio-fallback");
        body.put("source", sample.active ? "xaudio2-native-loopback" : "inactive");
        body.put("lowFrequencyAmplitude", sample.lowFrequencyAmplitude);
        body.put("lowFrequencyBands", sample.lowFrequencyBands);
        body.put("energy", sample.energy);
        body.put("bass", sample.lowFrequencyAmplitude);
        body.put("beat", sample.beat);
        body.put("sampleRate", sample.sampleRate);
        body.put("status", status);
        body.put("error", error);
        return body;
    }

    private void load() {
        if (!windows) {
            status = "unsupported-os";
            error = "XAudio2/X3DAudio is only available on Windows";
            return;
        }
        if (!Files.isRegularFile(dllPath)) {
            status = "dll-missing";
            error = "Build native/windows/fe-monster-xaudio2.dll to enable XAudio2";
            return;
        }
        try {
            System.load(dllPath.toAbsolutePath().normalize().toString());
            available = nativeInit();
            status = available ? "ready" : "init-failed";
            error = available ? "" : "nativeInit returned false";
        } catch (UnsatisfiedLinkError | SecurityException e) {
            available = false;
            status = "load-failed";
            error = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        }
    }

    private static Path resolveDll(ProjectPaths paths) {
        String override = System.getenv("FE_MONSTER_XAUDIO2_DLL");
        if (override != null && !override.isBlank()) return Path.of(override);
        return paths.root.resolve("native").resolve("windows").resolve("build").resolve("fe-monster-xaudio2.dll");
    }

    private NativeSample sample() {
        if (!available) return NativeSample.empty();
        try {
            float[] values = nativeSampleState();
            if (values == null || values.length < NATIVE_SAMPLE_HEADER_SIZE) return NativeSample.empty();
            float lowFrequencyAmplitude = clamp01(values[0]);
            return new NativeSample(
                lowFrequencyAmplitude,
                clamp01(values[1]),
                clamp01(values[2]),
                Math.max(0, Math.round(values[3])),
                values[4] > 0.5f,
                lowFrequencyBands(values, lowFrequencyAmplitude)
            );
        } catch (UnsatisfiedLinkError | SecurityException e) {
            return NativeSample.empty();
        }
    }

    private static float clamp01(float value) {
        if (!Float.isFinite(value)) return 0.0f;
        if (value < 0.0f) return 0.0f;
        return Math.min(value, 1.0f);
    }

    private static List<Float> lowFrequencyBands(float[] values, float fallback) {
        List<Float> bands = new ArrayList<>(LOW_FREQUENCY_BAND_COUNT);
        for (int index = 0; index < LOW_FREQUENCY_BAND_COUNT; index += 1) {
            int nativeIndex = NATIVE_SAMPLE_HEADER_SIZE + index;
            bands.add(nativeIndex < values.length ? clamp01(values[nativeIndex]) : fallback);
        }
        return bands;
    }

    private static native boolean nativeInit();

    private static native float[] nativeSampleState();

    @SuppressWarnings("unused")
    private static native float[] nativeSpatialMatrix(
        float emitterX,
        float emitterY,
        float emitterZ,
        float listenerX,
        float listenerY,
        float listenerZ
    );

    private record NativeSample(
        float lowFrequencyAmplitude,
        float energy,
        float beat,
        int sampleRate,
        boolean active,
        List<Float> lowFrequencyBands
    ) {
        static NativeSample empty() {
            return new NativeSample(0.0f, 0.0f, 0.0f, 0, false, EMPTY_LOW_FREQUENCY_BANDS);
        }
    }
}
