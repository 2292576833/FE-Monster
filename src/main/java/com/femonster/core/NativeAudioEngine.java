package com.femonster.core;

import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

public final class NativeAudioEngine {
    private static final int NATIVE_SAMPLE_HEADER_SIZE = 5;
    private static final int NATIVE_SPATIAL_STATUS_SIZE = 26;
    private static final int LOW_FREQUENCY_BAND_COUNT = 512;
    private static final float[] EMPTY_LOW_FREQUENCY_BANDS = new float[LOW_FREQUENCY_BAND_COUNT];

    private final Path dllPath;
    private final boolean windows;
    private boolean available;
    private String status = "not-loaded";
    private String error = "";
    private long spatialSessionCounter = 0;
    private long activeSpatialSession = 0;
    private int spatialInputChannels = 0;

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
        body.put("spatialBackend", windows ? "x3daudio" : "web-audio-panner");
        body.put("decoder", windows ? "media-foundation" : "webkit-media");
        body.put("sampleSource", sample.active ? "xaudio2-native-loopback" : "inactive");
        body.put("sampleRate", sample.sampleRate);
        body.put("lowFrequencyAmplitude", sample.lowFrequencyAmplitude);
        body.put("lowFrequencyBands", sample.lowFrequencyBands);
        body.put("dll", windows ? dllPath.toString() : "");
        body.put("status", status);
        body.put("error", error);
        body.put("windows", windows);
        body.put("spatialStreaming", available);
        body.put("spatialPipeline", spatialPayload());
        return body;
    }

    public synchronized boolean available() {
        return available;
    }

    public synchronized Map<String, Object> startSpatialStream(
        int sampleRate,
        int inputChannels,
        int virtualLayoutChannels,
        int upmixAlgorithm
    ) {
        if (!available) return spatialError("native XAudio2 bridge is unavailable");
        if (sampleRate < 16000 || sampleRate > 192000) return spatialError("invalid PCM sample rate");
        if (inputChannels != 1 && inputChannels != 2) return spatialError("native spatial input must be mono or stereo");
        if (virtualLayoutChannels != 6 && virtualLayoutChannels != 8) {
            return spatialError("native spatial layout must be 5.1 or 7.1");
        }

        stopSpatialStreamInternal();
        boolean configured;
        try {
            configured = nativeConfigureSpatial(
                sampleRate,
                inputChannels,
                virtualLayoutChannels,
                Math.max(0, Math.min(3, upmixAlgorithm)),
                true
            );
        } catch (UnsatisfiedLinkError | SecurityException failure) {
            return spatialError(failure.getMessage());
        }
        if (!configured) return spatialError("unable to initialize Rust/X3DAudio/OBR pipeline");

        activeSpatialSession = ++spatialSessionCounter;
        spatialInputChannels = inputChannels;
        Map<String, Object> body = spatialPayload();
        body.put("ok", true);
        body.put("session", activeSpatialSession);
        body.put("muted", true);
        return body;
    }

    public synchronized int submitSpatialPcm(long session, float[] pcm) {
        if (session <= 0 || session != activeSpatialSession || pcm == null || pcm.length == 0) {
            return -1;
        }
        int frames = pcm.length / Math.max(1, spatialInputChannels);
        if (frames <= 0 || frames * spatialInputChannels != pcm.length) return -2;
        try {
            return nativeSubmitSpatialPcm(pcm, frames);
        } catch (UnsatisfiedLinkError | SecurityException failure) {
            return -3;
        }
    }

    public synchronized int submitSpatialPcm(long session, ByteBuffer pcm, int frames) {
        if (session <= 0 || session != activeSpatialSession || pcm == null || frames <= 0) {
            return -1;
        }
        int requiredBytes = Math.multiplyExact(
            Math.multiplyExact(frames, Math.max(1, spatialInputChannels)),
            Float.BYTES
        );
        if (!pcm.isDirect() || pcm.position() != 0 || pcm.remaining() < requiredBytes) return -2;
        try {
            return nativeSubmitSpatialPcmDirect(pcm, frames);
        } catch (UnsatisfiedLinkError | SecurityException failure) {
            return -3;
        }
    }

    public synchronized Map<String, Object> setSpatialStreamMuted(long session, boolean muted) {
        if (session <= 0 || session != activeSpatialSession) return spatialError("stale native spatial session");
        int result;
        try {
            result = nativeSetSpatialMuted(muted);
        } catch (UnsatisfiedLinkError | SecurityException failure) {
            return spatialError(failure.getMessage());
        }
        Map<String, Object> body = spatialPayload();
        body.put("ok", result >= 0);
        body.put("session", activeSpatialSession);
        body.put("muted", muted);
        body.put("result", result);
        if (result < 0) body.put("error", "native spatial mute failed: " + result);
        return body;
    }

    public synchronized Map<String, Object> stopSpatialStream(long session) {
        if (session > 0 && session != activeSpatialSession) {
            Map<String, Object> body = spatialPayload();
            body.put("ok", true);
            body.put("ignored", true);
            return body;
        }
        stopSpatialStreamInternal();
        Map<String, Object> body = spatialPayload();
        body.put("ok", true);
        return body;
    }

    public synchronized Map<String, Object> spatialPayload() {
        Map<String, Object> body = new LinkedHashMap<>();
        double[] values = null;
        if (available) {
            try {
                values = nativeSpatialStatus();
            } catch (UnsatisfiedLinkError | SecurityException ignored) {
            }
        }
        boolean active = values != null
            && values.length >= NATIVE_SPATIAL_STATUS_SIZE
            && values[0] > 0.5;
        body.put("active", active);
        body.put("session", active ? activeSpatialSession : 0);
        body.put("running", active && values[1] > 0.5);
        body.put("rendererReady", active && values[2] > 0.5);
        body.put("sampleRate", active ? Math.round(values[3]) : 0);
        body.put("inputChannels", active ? Math.round(values[4]) : 0);
        body.put("rendererInputChannels", active ? Math.round(values[5]) : 0);
        body.put("outputChannels", active ? Math.round(values[6]) : 0);
        body.put("buffersQueued", active ? Math.round(values[7]) : 0);
        body.put("buffersSubmitted", active ? Math.round(values[8]) : 0);
        body.put("buffersConsumed", active ? Math.round(values[9]) : 0);
        body.put("framesProcessed", active ? Math.round(values[10]) : 0);
        body.put("droppedBuffers", active ? Math.round(values[11]) : 0);
        body.put("obrProcessCalls", active ? Math.round(values[12]) : 0);
        body.put("x3dCalculateCalls", active ? Math.round(values[13]) : 0);
        body.put("rustUpmixProcessCalls", active ? Math.round(values[14]) : 0);
        body.put("rustUpmixFallbackBlocks", active ? Math.round(values[15]) : 0);
        body.put("rustUpmixActive", active && values[16] > 0.5);
        body.put("rustUpmixLastResult", active ? Math.round(values[17]) : 0);
        body.put("outputEnergy", active ? values[18] : 0.0);
        body.put("x3dMatrixLeft", active ? values[19] : 0.0);
        body.put("x3dMatrixRight", active ? values[20] : 0.0);
        body.put("lastResult", active ? Math.round(values[21]) : 0);
        body.put("queueUnderruns", active ? Math.round(values[22]) : 0);
        body.put("bufferPoolExhaustions", active ? Math.round(values[23]) : 0);
        body.put("voiceStarted", active && values[24] > 0.5);
        body.put("prerollTargetBuffers", active ? Math.round(values[25]) : 0);
        body.put("chain", active
            ? "PCM → OxiMedia/Rust → X3DAudio → Google OBR → XAudio2"
            : "inactive");
        return body;
    }

    public synchronized void close() {
        stopSpatialStreamInternal();
    }

    public synchronized Map<String, Object> samplePayload() {
        NativeSample sample = sample();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("active", available && sample.active);
        body.put("backend", available ? "xaudio2" : "html-audio-fallback");
        body.put("source", sample.active ? "xaudio2-native-loopback" : (windows ? "inactive" : "web-audio"));
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

    private void stopSpatialStreamInternal() {
        if (activeSpatialSession == 0 && spatialInputChannels == 0) return;
        try {
            nativeStopSpatial();
        } catch (UnsatisfiedLinkError | SecurityException ignored) {
        }
        activeSpatialSession = 0;
        spatialInputChannels = 0;
    }

    private static Map<String, Object> spatialError(String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", false);
        body.put("error", message == null || message.isBlank() ? "native spatial pipeline failed" : message);
        return body;
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

    private static float[] lowFrequencyBands(float[] values, float fallback) {
        float[] bands = new float[LOW_FREQUENCY_BAND_COUNT];
        for (int index = 0; index < LOW_FREQUENCY_BAND_COUNT; index += 1) {
            int nativeIndex = NATIVE_SAMPLE_HEADER_SIZE + index;
            bands[index] = nativeIndex < values.length ? clamp01(values[nativeIndex]) : fallback;
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

    private static native boolean nativeConfigureSpatial(
        int sampleRate,
        int inputChannels,
        int virtualLayoutChannels,
        int upmixAlgorithm,
        boolean muted
    );

    private static native int nativeSubmitSpatialPcm(float[] pcm, int frameCount);

    private static native int nativeSubmitSpatialPcmDirect(ByteBuffer pcm, int frameCount);

    private static native int nativeSetSpatialMuted(boolean muted);

    private static native void nativeStopSpatial();

    private static native double[] nativeSpatialStatus();

    private record NativeSample(
        float lowFrequencyAmplitude,
        float energy,
        float beat,
        int sampleRate,
        boolean active,
        float[] lowFrequencyBands
    ) {
        static NativeSample empty() {
            return new NativeSample(0.0f, 0.0f, 0.0f, 0, false, EMPTY_LOW_FREQUENCY_BANDS);
        }
    }
}
