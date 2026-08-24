package com.femonster.core;

import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.IntConsumer;
import java.util.function.IntSupplier;

public final class NativeAudioEngine {
    private static final int NATIVE_SAMPLE_HEADER_SIZE = 5;
    private static final int NATIVE_SPATIAL_STATUS_SIZE = 32;
    private static final int NATIVE_MIXER_STATUS_SIZE = 29;
    private static final int NATIVE_MIXER_VALUE_COUNT = 44;
    private static final int NATIVE_CHANNEL_ROUTER_STATUS_SIZE = 34;
    private static final int NATIVE_CHANNEL_ROUTER_VALUE_COUNT = 41;
    private static final int NATIVE_CHANNEL_ROUTER_CHANNEL_COUNT = 8;
    private static final int NATIVE_MIXER_COMMIT_BUSY = -5;
    private static final int LOW_FREQUENCY_BAND_COUNT = 512;
    private static final int NATIVE_CAPTURE_RUNNING_INDEX = NATIVE_SAMPLE_HEADER_SIZE
        + LOW_FREQUENCY_BAND_COUNT;
    private static final float[] EMPTY_LOW_FREQUENCY_BANDS = new float[LOW_FREQUENCY_BAND_COUNT];

    private final Path dllPath;
    private final boolean windows;
    private boolean nativeLibraryLoaded;
    private boolean available;
    private String status = "not-loaded";
    private String error = "";
    private long spatialSessionCounter = 0;
    private long activeSpatialSession = 0;
    private long spatialGenerationCounter = 0;
    private long activeSpatialGeneration = 0;
    private int spatialInputChannels = 0;
    private int spatialSampleRate = 0;
    private long activeSpatialLastSequence = -1;
    private long cachedMixerRevision = 0;
    private int cachedMixerFlags = 0;
    private float[] cachedMixerValues = new float[NATIVE_MIXER_VALUE_COUNT];
    private boolean cachedMixerPresent = false;
    private boolean cachedMixerCommitted = false;
    private int cachedMixerLastResult = 0;
    private long cachedChannelRouterRevision = 0;
    private int cachedChannelRouterOutputChannels = 6;
    private int cachedChannelRouterAlgorithm = 1;
    private float[] cachedChannelRouterValues = new float[NATIVE_CHANNEL_ROUTER_VALUE_COUNT];
    private boolean cachedChannelRouterPresent = false;
    private boolean cachedChannelRouterCommitted = false;
    private int cachedChannelRouterLastResult = 0;
    private boolean lastChannelTestRequested = false;
    private boolean lastChannelTestGenerated = false;
    private int lastChannelTestResult = -3;
    private int lastChannelTestOutputChannels = 0;
    private int lastChannelTestChannelIndex = -1;
    private int lastChannelTestKind = -1;
    private int lastChannelTestDurationMs = 0;
    private float lastChannelTestFrequencyHz = 0.0f;
    private float lastChannelTestGainDb = 0.0f;
    private final MixerBusyRetryController mixerBusyRetries = new MixerBusyRetryController(
        "fe-monster-audio-mixer-control",
        40L,
        80L,
        160L,
        320L,
        640L,
        1000L
    );

    public NativeAudioEngine(ProjectPaths paths) {
        this.windows = System.getProperty("os.name", "").toLowerCase().contains("win");
        this.dllPath = resolveDll(paths);
        load();
    }

    public synchronized Map<String, Object> runtimePayload() {
        Map<String, Object> body = new LinkedHashMap<>();
        // Runtime/status probes must not wake the WASAPI loopback capture
        // thread. Capture starts only when the playback UI requests samples.
        NativeSample sample = sample(false);
        body.put("requested", true);
        body.put("active", available);
        body.put("backend", available ? "xaudio2" : "html-audio-fallback");
        body.put("spatialBackend", windows ? "x3daudio" : "web-audio-panner");
        body.put("decoder", windows ? "media-foundation" : "webkit-media");
        body.put("sampleSource", sample.active ? "xaudio2-native-loopback" : "inactive");
        body.put("captureRunning", sample.captureRunning);
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

    private static void validateMixerParameters(long revision, int flags, float[] values) {
        if (revision < 0) throw new IllegalArgumentException("mixer revision must be nonnegative");
        if (flags < 0 || (flags & ~0x3f) != 0) {
            throw new IllegalArgumentException("invalid mixer flags");
        }
        if (values == null || values.length != NATIVE_MIXER_VALUE_COUNT) {
            throw new IllegalArgumentException("mixer values must contain exactly 44 floats");
        }
        for (float value : values) {
            if (!Float.isFinite(value)) {
                throw new IllegalArgumentException("mixer values must be finite");
            }
        }
    }

    private static void validateChannelRouterParameters(
        long revision,
        int outputChannels,
        int algorithm,
        float[] values
    ) {
        if (revision < 0) {
            throw new IllegalArgumentException("channel router revision must be nonnegative");
        }
        if (outputChannels != 6 && outputChannels != 8) {
            throw new IllegalArgumentException("channel router output must be 5.1 or 7.1");
        }
        if (algorithm < 0 || algorithm > 3) {
            throw new IllegalArgumentException("unsupported channel router algorithm");
        }
        if (values == null || values.length != NATIVE_CHANNEL_ROUTER_VALUE_COUNT) {
            throw new IllegalArgumentException("channel router values must contain exactly 41 floats");
        }
        for (float value : values) {
            if (!Float.isFinite(value)) {
                throw new IllegalArgumentException("channel router values must be finite");
            }
        }
    }

    private void cacheMixerParameters(long revision, int flags, float[] values) {
        cachedMixerRevision = revision;
        cachedMixerFlags = flags;
        cachedMixerValues = values.clone();
        cachedMixerPresent = true;
        cachedMixerCommitted = false;
    }

    private void cacheChannelRouterParameters(
        long revision,
        int outputChannels,
        int algorithm,
        float[] values
    ) {
        cachedChannelRouterRevision = revision;
        cachedChannelRouterOutputChannels = outputChannels;
        cachedChannelRouterAlgorithm = algorithm;
        cachedChannelRouterValues = values.clone();
        cachedChannelRouterPresent = true;
        cachedChannelRouterCommitted = false;
    }

    private Map<String, Object> combinedMixerChannelPayload() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("mixer", mixerPayload());
        body.put("channels", channelRouterPayload());
        return body;
    }

    synchronized Map<String, Object> setMixerParameters(
        long revision,
        int flags,
        float[] values
    ) {
        validateMixerParameters(revision, flags, values);
        cacheMixerParameters(revision, flags, values);

        if (!available || activeSpatialSession == 0 || spatialSampleRate <= 0) {
            mixerBusyRetries.cancel();
            cachedMixerLastResult = -1;
            return mixerPayload();
        }
        int rampFrames = Math.max(1, Math.min(4096, (int) Math.round(spatialSampleRate * 0.020)));
        cachedMixerLastResult = applyCachedMixer(rampFrames);
        return mixerPayload();
    }

    synchronized Map<String, Object> setMixerAndChannelParameters(
        long mixerRevision,
        int flags,
        float[] mixerValues,
        long channelRevision,
        int outputChannels,
        int algorithm,
        float[] channelValues
    ) {
        validateMixerParameters(mixerRevision, flags, mixerValues);
        validateChannelRouterParameters(
            channelRevision,
            outputChannels,
            algorithm,
            channelValues
        );
        cacheMixerParameters(mixerRevision, flags, mixerValues);
        cacheChannelRouterParameters(
            channelRevision,
            outputChannels,
            algorithm,
            channelValues
        );

        if (!available || activeSpatialSession == 0 || spatialSampleRate <= 0) {
            mixerBusyRetries.cancel();
            cachedMixerLastResult = -1;
            cachedChannelRouterLastResult = -3;
            return combinedMixerChannelPayload();
        }
        int rampFrames = Math.max(1, Math.min(4096, (int) Math.round(spatialSampleRate * 0.020)));
        int result = applyCachedMixerAndChannel(rampFrames);
        cachedMixerLastResult = result;
        cachedChannelRouterLastResult = result;
        return combinedMixerChannelPayload();
    }

    public synchronized Map<String, Object> mixerPayload() {
        double[] values = null;
        if (available) {
            try {
                values = nativeMixerStatus();
            } catch (UnsatisfiedLinkError | SecurityException ignored) {
            }
        }
        boolean pipelinePresent = values != null
            && values.length >= NATIVE_MIXER_STATUS_SIZE
            && values[0] > 0.5;
        boolean mixerAvailable = pipelinePresent && values[1] > 0.5;
        boolean nativeEnabled = pipelinePresent && values[2] > 0.5;
        boolean nativeActive = pipelinePresent && values[3] > 0.5;
        boolean failureDisabled = pipelinePresent && values[4] > 0.5;
        int nativeBypassReason = pipelinePresent ? (int) Math.round(values[5]) : 0;
        int nativeLastResult = pipelinePresent ? (int) Math.round(values[6]) : 0;
        long nativeActiveRevision = pipelinePresent ? Math.round(values[12]) : -1;
        long nativeStagedRevision = pipelinePresent ? Math.round(values[13]) : -1;
        boolean activeRevisionCommitted = pipelinePresent && nativeActiveRevision >= 0;
        boolean nativeUpmixEnabled = pipelinePresent
            ? values[24] > 0.5
            : (cachedMixerFlags & 0x10) != 0;
        boolean nativeObrEnabled = pipelinePresent
            ? values[25] > 0.5
            : (cachedMixerFlags & 0x20) != 0;
        int nativeObrProfile = pipelinePresent ? (int) Math.round(values[26]) : cachedObrProfile();
        int rendererInputChannels = pipelinePresent ? (int) Math.round(values[27]) : 0;
        long nativeSpatialActiveRevision = pipelinePresent ? Math.round(values[28]) : -1;
        boolean spatialRevisionCommitted = pipelinePresent && nativeSpatialActiveRevision >= 0;
        reconcileCachedMixerCommit(nativeActiveRevision, nativeSpatialActiveRevision);
        boolean desiredPending = isMixerDesiredPending(
            cachedMixerPresent,
            cachedMixerCommitted,
            cachedMixerRevision,
            nativeActiveRevision
        ) || (cachedMixerPresent && (
            !spatialRevisionCommitted || cachedMixerRevision != nativeSpatialActiveRevision
        ));
        int effectiveLastResult = desiredPending ? cachedMixerLastResult : nativeLastResult;
        boolean mixerActive = nativeActive && !desiredPending;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("nativeBackendAvailable", available);
        body.put("nativeChainActive", pipelinePresent);
        body.put("mixerAvailable", mixerAvailable);
        body.put("mixerActive", mixerActive);
        body.put("mixerEnabled", pipelinePresent ? nativeEnabled : (cachedMixerFlags & 1) != 0);
        body.put("mixerFailureDisabled", failureDisabled);
        body.put("bypassReason", mixerBypassReason(
            pipelinePresent,
            nativeBypassReason,
            desiredPending,
            effectiveLastResult
        ));
        body.put("lastResult", effectiveLastResult);
        body.put("processCalls", pipelinePresent ? Math.round(values[7]) : 0L);
        body.put("bypassedBlocks", pipelinePresent ? Math.round(values[8]) : 0L);
        body.put("processFailures", pipelinePresent ? Math.round(values[9]) : 0L);
        body.put("consecutiveFailures", pipelinePresent ? Math.round(values[10]) : 0L);
        body.put("partialFailureBypasses", pipelinePresent ? Math.round(values[11]) : 0L);
        body.put("activeRevision", Math.max(0L, nativeActiveRevision));
        body.put("stagedRevision", Math.max(0L, nativeStagedRevision));
        body.put("activeRevisionCommitted", activeRevisionCommitted);
        body.put("desiredRevision", cachedMixerPresent ? cachedMixerRevision : 0L);

        Map<String, Object> upmix = new LinkedHashMap<>();
        upmix.put("available", available);
        upmix.put("enabled", nativeUpmixEnabled);
        upmix.put("algorithm", cachedUpmixAlgorithm());
        upmix.put("backend", pipelinePresent
            ? (values[20] > 0.5 ? "rust-upmix-v1" : "cpp-fallback")
            : "rust-plus-cpp-fallback");
        upmix.put("outputLayout", cachedUpmixLayoutChannels() == 8 ? "7.1" : "5.1");
        upmix.put("outputChannels", 2);
        upmix.put("processCalls", pipelinePresent ? Math.round(values[14]) : 0L);
        upmix.put("fallbackBlocks", pipelinePresent ? Math.round(values[15]) : 0L);
        upmix.put("active", pipelinePresent && nativeUpmixEnabled && values[20] > 0.5 && !desiredPending);
        upmix.put("bypassReason", nativeUpmixEnabled ? (desiredPending ? "transition-pending" : "") : "disabled");
        upmix.put("lastResult", pipelinePresent ? Math.round(values[21]) : 0);
        body.put("upmix", upmix);

        Map<String, Object> obr = new LinkedHashMap<>();
        obr.put("available", available);
        obr.put("enabled", nativeObrEnabled);
        obr.put("backend", "google-obr");
        obr.put("filterProfile", switch (nativeObrProfile) {
            case 1 -> "ambient";
            case 2 -> "reverberant";
            default -> "direct";
        });
        obr.put("active", pipelinePresent && nativeObrEnabled && values[22] > 0.5 && !desiredPending);
        obr.put("processCalls", pipelinePresent ? Math.round(values[16]) : 0L);
        obr.put("rendererReady", pipelinePresent && values[22] > 0.5);
        obr.put("rendererInputChannels", rendererInputChannels);
        obr.put("outputChannels", 2);
        obr.put("bypassReason", nativeObrEnabled ? (desiredPending ? "transition-pending" : "") : "dry-through");
        obr.put("lastResult", pipelinePresent ? Math.round(values[23]) : 0);
        body.put("obr", obr);

        Map<String, Object> order = new LinkedHashMap<>();
        order.put("upmix", pipelinePresent ? Math.round(values[17]) : 0L);
        order.put("mixer", pipelinePresent ? Math.round(values[18]) : 0L);
        order.put("obr", pipelinePresent ? Math.round(values[19]) : 0L);
        body.put("order", order);
        body.put("spatialActiveRevision", Math.max(0L, nativeSpatialActiveRevision));
        body.put("spatialRevisionCommitted", spatialRevisionCommitted);
        body.put("transitionPending", desiredPending);
        body.put("spatialRoute", spatialRoute(nativeUpmixEnabled, nativeObrEnabled));
        return body;
    }

    synchronized Map<String, Object> setChannelRouterParameters(
        long revision,
        int outputChannels,
        int algorithm,
        float[] values
    ) {
        validateChannelRouterParameters(revision, outputChannels, algorithm, values);
        cacheChannelRouterParameters(revision, outputChannels, algorithm, values);

        if (!available || activeSpatialSession == 0 || spatialSampleRate <= 0) {
            cachedChannelRouterLastResult = -3;
            return channelRouterPayload();
        }
        int rampFrames = Math.max(1, Math.min(4096, (int) Math.round(spatialSampleRate * 0.020)));
        cachedChannelRouterLastResult = applyCachedChannelRouter(rampFrames);
        return channelRouterPayload();
    }

    public synchronized Map<String, Object> channelRouterPayload() {
        double[] values = null;
        if (available) {
            try {
                values = nativeChannelRouterStatus();
            } catch (UnsatisfiedLinkError | SecurityException ignored) {
            }
        }
        boolean pipelinePresent = values != null
            && values.length >= NATIVE_CHANNEL_ROUTER_STATUS_SIZE
            && values[0] > 0.5;
        boolean nativeAvailable = pipelinePresent && values[1] > 0.5;
        boolean nativeActive = pipelinePresent && values[2] > 0.5;
        boolean nativeActual = pipelinePresent && values[3] > 0.5;
        int nativeOutputChannels = nativeAvailable
            ? (int) Math.round(values[4])
            : (cachedChannelRouterPresent ? cachedChannelRouterOutputChannels : 0);
        int nativeAlgorithm = nativeAvailable
            ? (int) Math.round(values[5])
            : (cachedChannelRouterPresent ? cachedChannelRouterAlgorithm : 0);
        int nativeLastResult = pipelinePresent ? (int) Math.round(values[6]) : -3;
        long nativeActiveRevision = pipelinePresent ? Math.round(values[7]) : -1;
        long nativeStagedRevision = pipelinePresent ? Math.round(values[8]) : -1;
        long processCalls = pipelinePresent ? Math.max(0L, Math.round(values[9])) : 0L;

        reconcileCachedChannelRouterCommit(nativeActiveRevision);
        boolean transitionPending = cachedChannelRouterPresent && (
            !cachedChannelRouterCommitted
                || nativeActiveRevision != cachedChannelRouterRevision
        );
        int effectiveLastResult = transitionPending
            ? cachedChannelRouterLastResult
            : nativeLastResult;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("nativeBackendAvailable", available);
        body.put("nativeChainActive", pipelinePresent);
        body.put("available", nativeAvailable);
        body.put("active", nativeActive && !transitionPending);
        body.put("actual", nativeActual && !transitionPending);
        body.put("availability", channelRouterAvailability(
            pipelinePresent,
            nativeAvailable,
            nativeActual,
            transitionPending,
            effectiveLastResult
        ));
        body.put("outputChannels", nativeOutputChannels);
        body.put("algorithm", nativeAlgorithm);
        body.put("lastResult", effectiveLastResult);
        body.put("activeRevision", Math.max(0L, nativeActiveRevision));
        body.put("stagedRevision", Math.max(0L, nativeStagedRevision));
        body.put("desiredRevision", cachedChannelRouterPresent ? cachedChannelRouterRevision : 0L);
        body.put("activeRevisionCommitted", pipelinePresent && nativeActiveRevision >= 0);
        body.put("transitionPending", transitionPending);
        body.put("processCalls", processCalls);
        body.put("channelPeak", channelRouterTelemetry(values, pipelinePresent, 10));
        body.put("channelRms", channelRouterTelemetry(values, pipelinePresent, 18));
        body.put("channelAzimuthDeg", channelRouterTelemetry(values, pipelinePresent, 26));
        body.put("physicalMultichannel", false);
        body.put("physicalOutputChannels", 2);
        body.put("output", "virtual-bed-to-binaural-2ch");
        body.put("testSignal", channelTestSignalPayload());
        return body;
    }

    synchronized boolean playChannelTestSignal(
        int outputChannels,
        int channelIndex,
        int kind,
        int durationMs,
        float frequencyHz,
        float gainDb
    ) {
        if (outputChannels != 6 && outputChannels != 8) {
            throw new IllegalArgumentException("channel test output must be 5.1 or 7.1");
        }
        if (channelIndex < 0 || channelIndex >= outputChannels) {
            throw new IllegalArgumentException("channel test target is outside the layout");
        }
        if (kind != 0 && kind != 1) {
            throw new IllegalArgumentException("unsupported channel test signal");
        }
        if (durationMs < 50 || durationMs > 2_000) {
            throw new IllegalArgumentException("channel test duration must be 50..2000 ms");
        }
        if (!Float.isFinite(frequencyHz) || frequencyHz < 20.0f || frequencyHz > 20_000.0f) {
            throw new IllegalArgumentException("channel test frequency must be 20..20000 Hz");
        }
        if (!Float.isFinite(gainDb) || gainDb < -60.0f || gainDb > 0.0f) {
            throw new IllegalArgumentException("channel test gain must be -60..0 dB");
        }

        lastChannelTestRequested = true;
        lastChannelTestGenerated = false;
        lastChannelTestResult = -3;
        lastChannelTestOutputChannels = outputChannels;
        lastChannelTestChannelIndex = channelIndex;
        lastChannelTestKind = kind;
        lastChannelTestDurationMs = durationMs;
        lastChannelTestFrequencyHz = frequencyHz;
        lastChannelTestGainDb = gainDb;
        if (available && activeSpatialSession != 0 && spatialSampleRate > 0) {
            try {
                lastChannelTestResult = nativeGenerateChannelTestSignal(
                    outputChannels,
                    channelIndex,
                    kind,
                    durationMs,
                    frequencyHz,
                    gainDb
                );
            } catch (UnsatisfiedLinkError | SecurityException ignored) {
                lastChannelTestResult = -3;
            }
        }
        lastChannelTestGenerated = lastChannelTestResult == 0;
        return lastChannelTestGenerated;
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

        spatialSampleRate = sampleRate;
        // Desired mixer state is service-owned and cached even while no
        // pipeline exists. When both halves are present, replay them through
        // the same atomic JNI transaction used for live edits. A failed replay
        // must tear down this unpublished native graph: publishing a session
        // here would allow PCM to run with a partially restored snapshot.
        cachedMixerCommitted = false;
        cachedChannelRouterCommitted = false;
        int cachedStateResult = reapplyCachedStartupState();
        if (cachedStateResult != 0) {
            stopSpatialStreamInternal();
            return spatialError(
                "unable to atomically restore cached audio state: " + cachedStateResult
            );
        }

        activeSpatialSession = ++spatialSessionCounter;
        activeSpatialGeneration = ++spatialGenerationCounter;
        spatialInputChannels = inputChannels;
        activeSpatialLastSequence = -1;
        Map<String, Object> body = spatialPayload();
        body.put("ok", true);
        body.put("session", activeSpatialSession);
        body.put("generation", activeSpatialGeneration);
        body.put("muted", true);
        return body;
    }

    public synchronized int submitSpatialPcm(long session, long generation, float[] pcm) {
        if (!isActiveSpatialGeneration(session, generation) || pcm == null || pcm.length == 0) {
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

    public synchronized int submitSpatialPcm(long session, long generation, ByteBuffer pcm, int frames) {
        if (!isActiveSpatialGeneration(session, generation) || pcm == null || frames <= 0) {
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

    public synchronized int submitSpatialPcm(
        long session,
        long generation,
        long sequence,
        ByteBuffer pcm,
        int frames
    ) {
        if (sequence < 0) return -2;
        if (!isActiveSpatialGeneration(session, generation)) return -1;
        // A lost HTTP response may cause the browser to retry the same finite
        // PCM body. Treat it as acknowledged without submitting duplicate
        // audio into XAudio2. The main-thread pump is ordered, so lower values
        // are obsolete retries as well.
        if (sequence <= activeSpatialLastSequence) return 0;
        int result = submitSpatialPcm(session, generation, pcm, frames);
        if (result >= 0) activeSpatialLastSequence = sequence;
        return result;
    }

    public synchronized Map<String, Object> setSpatialStreamMuted(long session, long generation, boolean muted) {
        if (!isActiveSpatialGeneration(session, generation)) return spatialError("stale native spatial generation");
        int result;
        try {
            result = nativeSetSpatialMuted(muted);
        } catch (UnsatisfiedLinkError | SecurityException failure) {
            return spatialError(failure.getMessage());
        }
        Map<String, Object> body = spatialPayload();
        body.put("ok", result >= 0);
        body.put("session", activeSpatialSession);
        body.put("generation", activeSpatialGeneration);
        body.put("muted", muted);
        body.put("result", result);
        if (result < 0) body.put("error", "native spatial mute failed: " + result);
        return body;
    }

    public synchronized Map<String, Object> resetSpatialTimeline(long session, long generation) {
        if (!isActiveSpatialGeneration(session, generation)) {
            Map<String, Object> body = spatialPayload();
            body.put("ok", true);
            body.put("ignored", true);
            body.put("stale", true);
            body.put("requestedGeneration", generation);
            return body;
        }
        int result;
        long resetStartedAt = System.nanoTime();
        try {
            result = nativeResetSpatialTimeline();
        } catch (UnsatisfiedLinkError | SecurityException failure) {
            return spatialError(failure.getMessage());
        }
        double resetElapsedMs = Math.max(0L, System.nanoTime() - resetStartedAt) / 1_000_000.0;
        if (result < 0) {
            Map<String, Object> body = spatialPayload();
            body.put("ok", false);
            body.put("session", activeSpatialSession);
            body.put("generation", activeSpatialGeneration);
            body.put("result", result);
            body.put("resetElapsedMs", resetElapsedMs);
            body.put("error", "native spatial timeline reset failed: " + result);
            return body;
        }
        long previousGeneration = activeSpatialGeneration;
        activeSpatialGeneration = ++spatialGenerationCounter;
        activeSpatialLastSequence = -1;
        Map<String, Object> body = spatialPayload();
        body.put("ok", true);
        body.put("session", activeSpatialSession);
        body.put("generation", activeSpatialGeneration);
        body.put("previousGeneration", previousGeneration);
        body.put("muted", true);
        body.put("flushed", true);
        body.put("rearmed", true);
        body.put("result", result);
        body.put("resetElapsedMs", resetElapsedMs);
        return body;
    }

    public synchronized Map<String, Object> pauseSpatialStream(long session, long generation) {
        if (!isActiveSpatialGeneration(session, generation)) {
            Map<String, Object> body = spatialPayload();
            body.put("ok", true);
            body.put("ignored", true);
            body.put("stale", true);
            return body;
        }
        long stoppedGeneration = activeSpatialGeneration;
        stopSpatialStreamInternal();
        Map<String, Object> body = spatialPayload();
        body.put("ok", true);
        body.put("paused", true);
        body.put("flushed", true);
        body.put("generation", stoppedGeneration);
        return body;
    }

    public synchronized Map<String, Object> stopSpatialStream(long session, long generation) {
        if (session > 0 && !isActiveSpatialGeneration(session, generation)) {
            Map<String, Object> body = spatialPayload();
            body.put("ok", true);
            body.put("ignored", true);
            body.put("stale", true);
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
        body.put("generation", active ? activeSpatialGeneration : 0);
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
        boolean upmixEnabled = active ? values[26] > 0.5 : (cachedMixerFlags & 0x10) != 0;
        boolean obrEnabled = active ? values[27] > 0.5 : (cachedMixerFlags & 0x20) != 0;
        body.put("upmixEnabled", upmixEnabled);
        body.put("obrEnabled", obrEnabled);
        body.put("obrFilterProfile", active ? Math.round(values[28]) : cachedObrProfile());
        body.put("virtualBedChannels", active
            ? Math.round(values[29])
            : (upmixEnabled ? cachedUpmixLayoutChannels() : 2));
        body.put("outputChannels", active ? Math.round(values[6]) : 0);
        body.put("physicalMultichannel", false);
        body.put("binaural", obrEnabled);
        long nativeSpatialActiveRevision = active ? Math.round(values[30]) : -1;
        boolean spatialRevisionCommitted = active && nativeSpatialActiveRevision >= 0;
        if (cachedMixerPresent
            && !cachedMixerCommitted
            && spatialRevisionCommitted
            && nativeSpatialActiveRevision == cachedMixerRevision
            && nativeMixerRevisionCommitted(cachedMixerRevision)) {
            reconcileCachedMixerCommit(cachedMixerRevision, nativeSpatialActiveRevision);
        }
        boolean transitionPending = cachedMixerPresent && (
            !cachedMixerCommitted
                || !spatialRevisionCommitted
                || cachedMixerRevision != nativeSpatialActiveRevision
        );
        body.put("spatialActiveRevision", Math.max(0L, nativeSpatialActiveRevision));
        body.put("spatialRevisionCommitted", spatialRevisionCommitted);
        body.put("spatialDesiredRevision", cachedMixerPresent ? cachedMixerRevision : 0L);
        body.put("transitionPending", transitionPending);
        body.put("mixerProcessCalls", active ? Math.round(values[31]) : 0);
        body.put("lastBlockSequence", active ? activeSpatialLastSequence : -1L);
        body.put("spatialRoute", spatialRoute(upmixEnabled, obrEnabled));
        body.put("chain", active ? switch (spatialRoute(upmixEnabled, obrEnabled)) {
            case "upmix-mixer-x3d-obr" -> "PCM → OxiMedia/Rust virtual bed → Rust Mixer → Google OBR → XAudio2 stereo";
            case "upmix-mixer-non-obr-out" -> "PCM → OxiMedia/Rust virtual bed → Rust Mixer → energy-matched stereo fold-down → XAudio2";
            case "stereo-mixer-obr" -> "PCM stereo → Rust Mixer → Google OBR → XAudio2 stereo";
            default -> "PCM stereo → Rust Mixer → XAudio2 stereo";
        } : "inactive");
        return body;
    }

    public synchronized void close() {
        stopSpatialStreamInternal();
        mixerBusyRetries.close();
        if (nativeLibraryLoaded) {
            try {
                nativeShutdown();
            } catch (UnsatisfiedLinkError | SecurityException ignored) {
            }
        }
        available = false;
        cachedMixerCommitted = false;
        cachedChannelRouterCommitted = false;
        status = "closed";
    }

    public synchronized Map<String, Object> samplePayload() {
        NativeSample sample = sample(true);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("active", available && sample.active);
        body.put("backend", available ? "xaudio2" : "html-audio-fallback");
        body.put("source", sample.active ? "xaudio2-native-loopback" : (windows ? "inactive" : "web-audio"));
        body.put("captureRunning", sample.captureRunning);
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
            nativeLibraryLoaded = true;
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
        mixerBusyRetries.cancel();
        cachedMixerCommitted = false;
        cachedChannelRouterCommitted = false;
        // A graph exists between nativeConfigureSpatial() succeeding and the
        // Java session being published. Include spatialSampleRate so a failed
        // startup-state replay tears that unpublished graph down as well.
        if (activeSpatialSession == 0
            && spatialInputChannels == 0
            && spatialSampleRate == 0) return;
        try {
            nativeStopSpatial();
        } catch (UnsatisfiedLinkError | SecurityException ignored) {
        }
        activeSpatialSession = 0;
        activeSpatialGeneration = 0;
        spatialInputChannels = 0;
        spatialSampleRate = 0;
        activeSpatialLastSequence = -1;
    }

    private int reapplyCachedMixer(int rampFrames) {
        if (!cachedMixerPresent) return 0;
        cachedMixerLastResult = applyCachedMixer(rampFrames);
        return cachedMixerLastResult;
    }

    private int reapplyCachedStartupState() {
        if (cachedMixerPresent && cachedChannelRouterPresent) {
            int result = applyCachedMixerAndChannel(0);
            cachedMixerLastResult = result;
            cachedChannelRouterLastResult = result;
            return result;
        }
        int mixerResult = reapplyCachedMixer(0);
        if (mixerResult != 0) return mixerResult;
        return reapplyCachedChannelRouter(0);
    }

    private int applyCachedMixerAndChannel(int rampFrames) {
        if (!available
            || !cachedMixerPresent
            || !cachedChannelRouterPresent
            || spatialSampleRate <= 0) {
            mixerBusyRetries.cancel();
            cachedMixerCommitted = false;
            cachedChannelRouterCommitted = false;
            return -3;
        }
        long mixerRevision = cachedMixerRevision;
        int flags = cachedMixerFlags;
        float[] mixerValues = cachedMixerValues;
        long channelRevision = cachedChannelRouterRevision;
        int outputChannels = cachedChannelRouterOutputChannels;
        int algorithm = cachedChannelRouterAlgorithm;
        float[] channelValues = cachedChannelRouterValues;
        int boundedRampFrames = Math.max(0, Math.min(4096, rampFrames));
        int result = invokeNativeMixerAndChannel(
            mixerRevision,
            flags,
            mixerValues,
            channelRevision,
            outputChannels,
            algorithm,
            channelValues,
            boundedRampFrames
        );
        cachedMixerCommitted = result == 0 && nativeMixerRevisionCommitted(mixerRevision);
        cachedChannelRouterCommitted = result == 0
            && nativeChannelRouterRevisionCommitted(channelRevision);
        int retryState = result == 0
            && (!cachedMixerCommitted || !cachedChannelRouterCommitted)
                ? NATIVE_MIXER_COMMIT_BUSY
                : result;
        mixerBusyRetries.update(
            retryState,
            () -> retryCachedMixerAndChannel(
                mixerRevision,
                flags,
                mixerValues,
                channelRevision,
                outputChannels,
                algorithm,
                channelValues,
                boundedRampFrames
            ),
            retryResult -> observeMixerAndChannelRetry(
                mixerRevision,
                mixerValues,
                channelRevision,
                channelValues,
                retryResult
            )
        );
        return result;
    }

    private int invokeNativeMixerAndChannel(
        long mixerRevision,
        int flags,
        float[] mixerValues,
        long channelRevision,
        int outputChannels,
        int algorithm,
        float[] channelValues,
        int rampFrames
    ) {
        try {
            return nativeSetMixerAndChannelRouterParameters(
                mixerRevision,
                flags,
                mixerValues,
                channelRevision,
                outputChannels,
                algorithm,
                channelValues,
                rampFrames
            );
        } catch (UnsatisfiedLinkError | SecurityException failure) {
            return -3;
        }
    }

    private synchronized int retryCachedMixerAndChannel(
        long mixerRevision,
        int flags,
        float[] mixerValues,
        long channelRevision,
        int outputChannels,
        int algorithm,
        float[] channelValues,
        int rampFrames
    ) {
        if (!available
            || spatialSampleRate <= 0
            || !cachedMixerPresent
            || !cachedChannelRouterPresent
            || cachedMixerRevision != mixerRevision
            || cachedMixerFlags != flags
            || cachedMixerValues != mixerValues
            || cachedChannelRouterRevision != channelRevision
            || cachedChannelRouterOutputChannels != outputChannels
            || cachedChannelRouterAlgorithm != algorithm
            || cachedChannelRouterValues != channelValues) {
            return -3;
        }
        int result = invokeNativeMixerAndChannel(
            mixerRevision,
            flags,
            mixerValues,
            channelRevision,
            outputChannels,
            algorithm,
            channelValues,
            rampFrames
        );
        return result == 0
            && (!nativeMixerRevisionCommitted(mixerRevision)
                || !nativeChannelRouterRevisionCommitted(channelRevision))
                    ? NATIVE_MIXER_COMMIT_BUSY
                    : result;
    }

    private synchronized void observeMixerAndChannelRetry(
        long mixerRevision,
        float[] mixerValues,
        long channelRevision,
        float[] channelValues,
        int result
    ) {
        if (cachedMixerPresent
            && cachedChannelRouterPresent
            && cachedMixerRevision == mixerRevision
            && cachedMixerValues == mixerValues
            && cachedChannelRouterRevision == channelRevision
            && cachedChannelRouterValues == channelValues) {
            cachedMixerLastResult = result;
            cachedChannelRouterLastResult = result;
            cachedMixerCommitted = result == 0;
            cachedChannelRouterCommitted = result == 0;
        }
    }

    private int applyCachedMixer(int rampFrames) {
        if (!available || !cachedMixerPresent) {
            mixerBusyRetries.cancel();
            cachedMixerCommitted = false;
            return -1;
        }
        long revision = cachedMixerRevision;
        int flags = cachedMixerFlags;
        float[] values = cachedMixerValues;
        int boundedRampFrames = Math.max(0, Math.min(4096, rampFrames));
        int result = invokeNativeMixer(revision, flags, values, boundedRampFrames);
        cachedMixerCommitted = result == 0 && nativeMixerRevisionCommitted(revision);
        int retryState = result == 0 && !cachedMixerCommitted
            ? NATIVE_MIXER_COMMIT_BUSY
            : result;
        mixerBusyRetries.update(
            retryState,
            () -> retryCachedMixer(revision, flags, values, boundedRampFrames),
            retryResult -> observeMixerRetry(revision, values, retryResult)
        );
        return result;
    }

    private int invokeNativeMixer(long revision, int flags, float[] values, int rampFrames) {
        try {
            return nativeSetMixerParameters(
                revision,
                flags,
                values,
                rampFrames
            );
        } catch (UnsatisfiedLinkError | SecurityException failure) {
            return -3;
        }
    }

    private synchronized int retryCachedMixer(
        long revision,
        int flags,
        float[] values,
        int rampFrames
    ) {
        if (!available
            || spatialSampleRate <= 0
            || !cachedMixerPresent
            || cachedMixerRevision != revision
            || cachedMixerFlags != flags
            || cachedMixerValues != values) {
            return -3;
        }
        int result = invokeNativeMixer(revision, flags, values, rampFrames);
        return result == 0 && !nativeMixerRevisionCommitted(revision)
            ? NATIVE_MIXER_COMMIT_BUSY
            : result;
    }

    private synchronized void observeMixerRetry(long revision, float[] values, int result) {
        if (cachedMixerPresent
            && cachedMixerRevision == revision
            && cachedMixerValues == values) {
            cachedMixerLastResult = result;
            cachedMixerCommitted = result == 0;
        }
    }

    private boolean nativeMixerRevisionCommitted(long revision) {
        try {
            double[] values = nativeMixerStatus();
            if (values == null || values.length < NATIVE_MIXER_STATUS_SIZE) return false;
            long activeRevision = Math.round(values[12]);
            long spatialRevision = Math.round(values[28]);
            return activeRevision >= 0
                && spatialRevision >= 0
                && activeRevision == revision
                && spatialRevision == revision;
        } catch (UnsatisfiedLinkError | SecurityException failure) {
            return false;
        }
    }

    private int reapplyCachedChannelRouter(int rampFrames) {
        if (!cachedChannelRouterPresent) return 0;
        cachedChannelRouterLastResult = applyCachedChannelRouter(rampFrames);
        return cachedChannelRouterLastResult;
    }

    private int applyCachedChannelRouter(int rampFrames) {
        if (!available || !cachedChannelRouterPresent || spatialSampleRate <= 0) {
            cachedChannelRouterCommitted = false;
            return -3;
        }
        int result;
        try {
            result = nativeSetChannelRouterParameters(
                cachedChannelRouterRevision,
                cachedChannelRouterOutputChannels,
                cachedChannelRouterAlgorithm,
                cachedChannelRouterValues,
                Math.max(0, Math.min(4096, rampFrames))
            );
        } catch (UnsatisfiedLinkError | SecurityException failure) {
            result = -3;
        }
        cachedChannelRouterCommitted = result == 0
            && nativeChannelRouterRevisionCommitted(cachedChannelRouterRevision);
        return result;
    }

    private boolean nativeChannelRouterRevisionCommitted(long revision) {
        try {
            double[] values = nativeChannelRouterStatus();
            if (values == null || values.length < NATIVE_CHANNEL_ROUTER_STATUS_SIZE) return false;
            return values[0] > 0.5
                && Math.round(values[7]) == revision;
        } catch (UnsatisfiedLinkError | SecurityException failure) {
            return false;
        }
    }

    private void reconcileCachedChannelRouterCommit(long nativeActiveRevision) {
        if (!cachedChannelRouterPresent
            || cachedChannelRouterCommitted
            || nativeActiveRevision < 0
            || cachedChannelRouterRevision != nativeActiveRevision) {
            return;
        }
        cachedChannelRouterCommitted = true;
        cachedChannelRouterLastResult = 0;
    }

    private String channelRouterAvailability(
        boolean pipelinePresent,
        boolean nativeAvailable,
        boolean nativeActual,
        boolean transitionPending,
        int lastResult
    ) {
        if (!available || !pipelinePresent) return "native-route-not-connected";
        if (!nativeAvailable) return "router-unavailable";
        if (transitionPending) {
            return lastResult < 0 ? "parameter-submit-failed" : "transition-pending";
        }
        return nativeActual ? "available" : "router-inactive";
    }

    private static List<Double> channelRouterTelemetry(
        double[] values,
        boolean pipelinePresent,
        int offset
    ) {
        List<Double> telemetry = new ArrayList<>(NATIVE_CHANNEL_ROUTER_CHANNEL_COUNT);
        for (int channel = 0; channel < NATIVE_CHANNEL_ROUTER_CHANNEL_COUNT; channel += 1) {
            double value = pipelinePresent && values != null && offset + channel < values.length
                ? values[offset + channel]
                : 0.0;
            telemetry.add(Double.isFinite(value) ? value : 0.0);
        }
        return List.copyOf(telemetry);
    }

    private Map<String, Object> channelTestSignalPayload() {
        Map<String, Object> test = new LinkedHashMap<>();
        test.put("requested", lastChannelTestRequested);
        test.put("generated", lastChannelTestGenerated);
        test.put("queued", lastChannelTestGenerated);
        test.put("audible", lastChannelTestGenerated);
        test.put("result", lastChannelTestResult);
        test.put("outputChannels", lastChannelTestOutputChannels);
        test.put("channelIndex", lastChannelTestChannelIndex);
        test.put("kind", lastChannelTestKind);
        test.put("durationMs", lastChannelTestDurationMs);
        test.put("frequencyHz", (double) lastChannelTestFrequencyHz);
        test.put("gainDb", (double) lastChannelTestGainDb);
        test.put(
            "transport",
            lastChannelTestGenerated
                ? "virtual-bed-to-mixer-obr-queue"
                : "not-queued"
        );
        return test;
    }

    private void reconcileCachedMixerCommit(
        long nativeMixerActiveRevision,
        long nativeSpatialActiveRevision
    ) {
        if (!cachedMixerPresent
            || cachedMixerCommitted
            || nativeMixerActiveRevision < 0
            || nativeSpatialActiveRevision < 0
            || cachedMixerRevision != nativeMixerActiveRevision
            || cachedMixerRevision != nativeSpatialActiveRevision) {
            return;
        }
        cachedMixerCommitted = true;
        cachedMixerLastResult = 0;
        mixerBusyRetries.cancel();
    }

    static boolean isMixerDesiredPending(
        boolean cachedPresent,
        boolean cachedCommitted,
        long cachedRevision,
        long activeRevision
    ) {
        return cachedPresent && (!cachedCommitted || cachedRevision != activeRevision);
    }

    private String mixerBypassReason(
        boolean pipelinePresent,
        int nativeReason,
        boolean desiredPending,
        int lastResult
    ) {
        if (!available) return "native-backend-unavailable";
        if (!pipelinePresent) return "pipeline-inactive";
        if (desiredPending) {
            if (lastResult == NATIVE_MIXER_COMMIT_BUSY) return "commit-busy";
            return lastResult < 0 ? "parameter-submit-failed" : "transition-pending";
        }
        return switch (nativeReason) {
            case 0 -> "none";
            case 1 -> "disabled";
            case 2 -> "dll-unavailable";
            case 3 -> "abi-mismatch";
            case 4 -> "symbol-missing";
            case 5 -> "create-failed";
            case 6 -> "scratch-unavailable";
            case 7 -> "process-failed";
            case 8 -> "failure-disabled";
            default -> "unknown";
        };
    }

    private String cachedUpmixAlgorithm() {
        int value = cachedMixerValues.length > 31 ? Math.round(cachedMixerValues[31]) : 1;
        return switch (value) {
            case 0 -> "passive";
            case 2 -> "ambient-extract";
            default -> "matrix-decode";
        };
    }

    private int cachedUpmixLayoutChannels() {
        return cachedMixerValues.length > 32 && Math.round(cachedMixerValues[32]) == 8 ? 8 : 6;
    }

    private int cachedObrProfile() {
        if (cachedMixerValues.length <= 39) return 0;
        return Math.max(0, Math.min(2, Math.round(cachedMixerValues[39])));
    }

    private static String spatialRoute(boolean upmixEnabled, boolean obrEnabled) {
        if (upmixEnabled && obrEnabled) return "upmix-mixer-x3d-obr";
        if (upmixEnabled) return "upmix-mixer-non-obr-out";
        if (obrEnabled) return "stereo-mixer-obr";
        return "stereo-mixer-out";
    }

    private boolean isActiveSpatialGeneration(long session, long generation) {
        return session > 0
            && generation > 0
            && session == activeSpatialSession
            && generation == activeSpatialGeneration;
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
        Path installed = paths.root.resolve("native").resolve("windows")
            .resolve("build").resolve("fe-monster-xaudio2.dll");
        Path nextLaunch = paths.root.resolve("native").resolve("windows")
            .resolve("build-next").resolve("fe-monster-xaudio2.dll");
        if (!Files.isRegularFile(nextLaunch)) return installed;
        if (!Files.isRegularFile(installed)) return nextLaunch;
        try {
            return Files.getLastModifiedTime(nextLaunch).compareTo(Files.getLastModifiedTime(installed)) > 0
                ? nextLaunch
                : installed;
        } catch (Exception ignored) {
            return installed;
        }
    }

    private NativeSample sample(boolean requestCapture) {
        if (!available) return NativeSample.empty();
        try {
            float[] values = nativeSampleState(requestCapture);
            if (values == null || values.length < NATIVE_SAMPLE_HEADER_SIZE) return NativeSample.empty();
            float lowFrequencyAmplitude = clamp01(values[0]);
            return new NativeSample(
                lowFrequencyAmplitude,
                clamp01(values[1]),
                clamp01(values[2]),
                Math.max(0, Math.round(values[3])),
                values[4] > 0.5f,
                lowFrequencyBands(values, lowFrequencyAmplitude),
                values.length > NATIVE_CAPTURE_RUNNING_INDEX
                    && values[NATIVE_CAPTURE_RUNNING_INDEX] > 0.5f
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

    static final class MixerBusyRetryController implements AutoCloseable {
        private final ScheduledExecutorService executor;
        private final long[] delayMillis;
        private long generation;
        private ScheduledFuture<?> scheduled;
        private boolean closed;

        MixerBusyRetryController(String threadName, long... delayMillis) {
            if (threadName == null || threadName.isBlank()) {
                throw new IllegalArgumentException("mixer retry thread name is required");
            }
            if (delayMillis == null || delayMillis.length == 0) {
                throw new IllegalArgumentException("mixer retry delays are required");
            }
            this.delayMillis = delayMillis.clone();
            for (long delay : this.delayMillis) {
                if (delay < 0) throw new IllegalArgumentException("mixer retry delay must be nonnegative");
            }
            this.executor = Executors.newSingleThreadScheduledExecutor(command -> {
                Thread thread = new Thread(command, threadName);
                thread.setDaemon(true);
                return thread;
            });
        }

        synchronized void update(
            int initialResult,
            IntSupplier retryAttempt,
            IntConsumer resultObserver
        ) {
            if (retryAttempt == null || resultObserver == null) {
                throw new IllegalArgumentException("mixer retry callbacks are required");
            }
            generation += 1;
            if (scheduled != null) scheduled.cancel(false);
            scheduled = null;
            if (closed || initialResult != NATIVE_MIXER_COMMIT_BUSY) return;
            schedule(generation, 0, retryAttempt, resultObserver);
        }

        synchronized void cancel() {
            generation += 1;
            if (scheduled != null) scheduled.cancel(false);
            scheduled = null;
        }

        private synchronized void schedule(
            long expectedGeneration,
            int attemptIndex,
            IntSupplier retryAttempt,
            IntConsumer resultObserver
        ) {
            if (closed || expectedGeneration != generation) return;
            scheduled = executor.schedule(
                () -> runRetry(expectedGeneration, attemptIndex, retryAttempt, resultObserver),
                delayMillis[attemptIndex],
                TimeUnit.MILLISECONDS
            );
        }

        private void runRetry(
            long expectedGeneration,
            int attemptIndex,
            IntSupplier retryAttempt,
            IntConsumer resultObserver
        ) {
            synchronized (this) {
                if (closed || expectedGeneration != generation) return;
                scheduled = null;
            }
            int result;
            try {
                result = retryAttempt.getAsInt();
            } catch (RuntimeException failure) {
                result = -3;
            }
            try {
                resultObserver.accept(result);
            } catch (RuntimeException ignored) {
            }
            synchronized (this) {
                if (closed || expectedGeneration != generation) return;
                if (result == NATIVE_MIXER_COMMIT_BUSY
                    && attemptIndex + 1 < delayMillis.length) {
                    schedule(expectedGeneration, attemptIndex + 1, retryAttempt, resultObserver);
                }
            }
        }

        @Override
        public synchronized void close() {
            if (closed) return;
            closed = true;
            generation += 1;
            if (scheduled != null) scheduled.cancel(false);
            scheduled = null;
            executor.shutdownNow();
        }
    }

    private static native boolean nativeInit();

    private static native float[] nativeSampleState(boolean requestCapture);

    private static native void nativeShutdown();

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

    private static native int nativeResetSpatialTimeline();

    private static native int nativeSetMixerParameters(
        long revision,
        int flags,
        float[] values,
        int rampFrames
    );

    private static native int nativeSetMixerAndChannelRouterParameters(
        long mixerRevision,
        int flags,
        float[] mixerValues,
        long channelRevision,
        int outputChannels,
        int algorithm,
        float[] channelValues,
        int rampFrames
    );

    private static native double[] nativeMixerStatus();

    private static native int nativeSetChannelRouterParameters(
        long revision,
        int outputChannels,
        int algorithm,
        float[] values,
        int rampFrames
    );

    private static native double[] nativeChannelRouterStatus();

    private static native int nativeGenerateChannelTestSignal(
        int outputChannels,
        int channelIndex,
        int kind,
        int durationMs,
        float frequencyHz,
        float gainDb
    );

    private static native void nativeStopSpatial();

    private static native double[] nativeSpatialStatus();

    private record NativeSample(
        float lowFrequencyAmplitude,
        float energy,
        float beat,
        int sampleRate,
        boolean active,
        float[] lowFrequencyBands,
        boolean captureRunning
    ) {
        static NativeSample empty() {
            return new NativeSample(
                0.0f,
                0.0f,
                0.0f,
                0,
                false,
                EMPTY_LOW_FREQUENCY_BANDS,
                false
            );
        }
    }
}
