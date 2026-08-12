package com.femonster.core;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.Map;
import java.util.concurrent.locks.LockSupport;

/**
 * Real-time JNI smoke/stress probe. It deliberately reuses one direct transport
 * buffer and submits at the 4096-frame/48 kHz cadence for roughly six seconds.
 */
public final class RealtimeAudioPerformanceProbe {
    private static final int SAMPLE_RATE = 48_000;
    private static final int INPUT_CHANNELS = 2;
    private static final int LAYOUT_CHANNELS = 8;
    private static final int TRANSPORT_FRAMES = 4_096;
    private static final int RENDER_FRAMES = 256;
    private static final int BATCH_COUNT = 68;
    private static final int PREROLL_BATCHES = 2;
    private static final long TRANSPORT_NANOS = Math.round(
        TRANSPORT_FRAMES * 1_000_000_000.0 / SAMPLE_RATE
    );

    private RealtimeAudioPerformanceProbe() {
    }

    public static void main(String[] args) {
        Thread submitThread = Thread.currentThread();
        try {
            submitThread.setPriority(Math.max(Thread.MIN_PRIORITY, Thread.NORM_PRIORITY - 1));
        } catch (SecurityException ignored) {
        }

        NativeAudioEngine engine = new NativeAudioEngine(ProjectPaths.detect());
        Map<String, Object> start = engine.startSpatialStream(
            SAMPLE_RATE,
            INPUT_CHANNELS,
            LAYOUT_CHANNELS,
            2
        );
        long session = number(start, "session").longValue();
        long generation = number(start, "generation").longValue();
        require(Boolean.TRUE.equals(start.get("ok")) && session > 0 && generation > 0, "native start failed: " + start);

        ByteBuffer directPcm = ByteBuffer.allocateDirect(
            TRANSPORT_FRAMES * INPUT_CHANNELS * Float.BYTES
        ).order(ByteOrder.nativeOrder());
        FloatBuffer samples = directPcm.asFloatBuffer();
        double leftPhase = 0.0;
        double rightPhase = 0.31;
        long paceEpoch = 0L;
        long startedAt = System.nanoTime();
        long maxQueued = 0L;
        long maxUnderruns = 0L;
        long maxPoolExhaustions = 0L;
        int voiceStartedAtBatch = -1;
        Map<String, Object> status = Map.of();

        for (int batch = 0; batch < BATCH_COUNT; batch += 1) {
            samples.clear();
            for (int frame = 0; frame < TRANSPORT_FRAMES; frame += 1) {
                float left = (float) (Math.sin(leftPhase) * 0.10);
                float right = (float) (Math.sin(rightPhase) * 0.085);
                samples.put(left);
                samples.put(right);
                leftPhase += Math.PI * 2.0 * 73.0 / SAMPLE_RATE;
                rightPhase += Math.PI * 2.0 * 91.0 / SAMPLE_RATE;
            }
            directPcm.position(0);
            directPcm.limit(directPcm.capacity());

            if (batch >= PREROLL_BATCHES) {
                long deadline = paceEpoch + (long) (batch - PREROLL_BATCHES + 1) * TRANSPORT_NANOS;
                parkUntil(deadline);
            }

            int result = engine.submitSpatialPcm(session, generation, directPcm, TRANSPORT_FRAMES);
            require(result >= 0, "direct PCM submit failed at batch " + batch + ": " + result);
            if (batch == PREROLL_BATCHES - 1) paceEpoch = System.nanoTime();

            if (batch == PREROLL_BATCHES - 1 || batch % 4 == 3 || batch == BATCH_COUNT - 1) {
                status = engine.spatialPayload();
                maxQueued = Math.max(maxQueued, number(status, "buffersQueued").longValue());
                maxUnderruns = Math.max(maxUnderruns, number(status, "queueUnderruns").longValue());
                maxPoolExhaustions = Math.max(
                    maxPoolExhaustions,
                    number(status, "bufferPoolExhaustions").longValue()
                );
                if (voiceStartedAtBatch < 0 && Boolean.TRUE.equals(status.get("voiceStarted"))) {
                    voiceStartedAtBatch = batch + 1;
                }
            }
        }

        status = engine.spatialPayload();
        maxQueued = Math.max(maxQueued, number(status, "buffersQueued").longValue());
        maxUnderruns = Math.max(maxUnderruns, number(status, "queueUnderruns").longValue());
        maxPoolExhaustions = Math.max(
            maxPoolExhaustions,
            number(status, "bufferPoolExhaustions").longValue()
        );

        long expectedRustCalls = BATCH_COUNT;
        long expectedObrCalls = (long) BATCH_COUNT * TRANSPORT_FRAMES / RENDER_FRAMES;
        boolean pass = Boolean.TRUE.equals(status.get("active"))
            && Boolean.TRUE.equals(status.get("rendererReady"))
            && Boolean.TRUE.equals(status.get("rustUpmixActive"))
            && number(status, "rustUpmixProcessCalls").longValue() == expectedRustCalls
            && number(status, "obrProcessCalls").longValue() == expectedObrCalls
            && number(status, "x3dCalculateCalls").longValue() == LAYOUT_CHANNELS
            && number(status, "droppedBuffers").longValue() == 0L
            && maxUnderruns <= 1L
            && maxPoolExhaustions == 0L
            && Boolean.TRUE.equals(status.get("voiceStarted"))
            && number(status, "prerollTargetBuffers").longValue() == 24L
            && Double.isFinite(number(status, "outputEnergy").doubleValue())
            && number(status, "outputEnergy").doubleValue() > 1.0e-6;

        engine.stopSpatialStream(session, generation);
        boolean stopped = !Boolean.TRUE.equals(engine.spatialPayload().get("active"));
        engine.close();
        long elapsedMillis = Math.round((System.nanoTime() - startedAt) / 1_000_000.0);

        System.out.println("{"
            + "\"pass\":" + (pass && stopped)
            + ",\"elapsedMs\":" + elapsedMillis
            + ",\"transportFrames\":" + TRANSPORT_FRAMES
            + ",\"renderFrames\":" + RENDER_FRAMES
            + ",\"batches\":" + BATCH_COUNT
            + ",\"directBuffersAllocated\":1"
            + ",\"directBufferReuses\":" + BATCH_COUNT
            + ",\"submitThreadPriority\":" + submitThread.getPriority()
            + ",\"rustCalls\":" + status.get("rustUpmixProcessCalls")
            + ",\"obrCalls\":" + status.get("obrProcessCalls")
            + ",\"x3dCalls\":" + status.get("x3dCalculateCalls")
            + ",\"dropped\":" + status.get("droppedBuffers")
            + ",\"queueUnderruns\":" + maxUnderruns
            + ",\"poolExhaustions\":" + maxPoolExhaustions
            + ",\"maxBuffersQueued\":" + maxQueued
            + ",\"voiceStarted\":" + status.get("voiceStarted")
            + ",\"voiceStartedAtBatch\":" + voiceStartedAtBatch
            + ",\"prerollTargetBuffers\":" + status.get("prerollTargetBuffers")
            + ",\"outputEnergy\":" + status.get("outputEnergy")
            + ",\"stopped\":" + stopped
            + "}");
        if (!pass || !stopped) System.exit(1);
    }

    private static Number number(Map<String, Object> source, String key) {
        Object value = source.get(key);
        return value instanceof Number number ? number : 0;
    }

    private static void parkUntil(long deadline) {
        while (true) {
            long remaining = deadline - System.nanoTime();
            if (remaining <= 0L) return;
            LockSupport.parkNanos(Math.min(remaining, 2_000_000L));
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}
