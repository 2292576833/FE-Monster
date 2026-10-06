package com.femonster.core;

import java.util.Map;

/** Exercises the shipped JNI gain exports with exclusively zero PCM. */
public final class NativeAudioGainLeaseLiveProbe {
    public static void main(String[] args) throws Exception {
        NativeAudioEngine engine = new NativeAudioEngine(ProjectPaths.detect());
        require(engine.available(), "native pair did not load");
        Map<String, Object> start = engine.startSpatialStream(48000, 2, 6, 2);
        require(Boolean.TRUE.equals(start.get("ok")), "zero-PCM stream could not start");
        long session = ((Number) start.get("session")).longValue();
        long generation = ((Number) start.get("generation")).longValue();
        long sequence = ((Number) start.get("gainSequence")).longValue() + 1;
        try {
            // Only silence is ever submitted. Gain changes cannot emit a tone.
            require(engine.submitSpatialPcm(session, generation, new float[8192]) >= 0, "silent preroll failed");
            require(engine.submitSpatialPcm(session, generation, new float[4096]) >= 0, "silent start failed");
            long begin = System.nanoTime();
            Map<String, Object> half = engine.setSpatialOutputGain(session, generation, sequence, .5,
                System.currentTimeMillis() + 1000);
            require(Boolean.TRUE.equals(half.get("ok")), "half-gain JNI export failed: " + half);
            double halfGainAckMs = (System.nanoTime() - begin) / 1_000_000.0;
            require(engine.renewSpatialOutputGainLease(session, generation, sequence, System.currentTimeMillis() + 1000) >= 0,
                "lease-renew JNI export failed");
            sequence++;
            require(Boolean.TRUE.equals(engine.setSpatialOutputGain(session, generation, sequence, 1,
                System.currentTimeMillis() + 1000).get("ok")), "full-gain JNI export failed");
            require(Boolean.FALSE.equals(engine.setSpatialOutputGain(session, generation, sequence, .5,
                System.currentTimeMillis() + 1000).get("ok")), "conflicting gain replay was accepted");
            Thread.sleep(1100);
            require(engine.renewSpatialOutputGainLease(session, generation, sequence, System.currentTimeMillis() + 1000) < 0,
                "real expired lease was revived by renewal");
            require(Boolean.FALSE.equals(engine.setSpatialOutputGain(session, generation, sequence, 1,
                System.currentTimeMillis() + 1000).get("ok")), "real expired sequence was revived by replay");
            Map<String, Object> reset = engine.resetSpatialTimeline(session, generation);
            require(Boolean.TRUE.equals(reset.get("ok")), "timeline reset failed");
            generation = ((Number) reset.get("generation")).longValue();
            require(Boolean.TRUE.equals(engine.setSpatialOutputGain(session, generation, sequence + 1, 0,
                System.currentTimeMillis() + 1000).get("ok")), "new generation did not clear gain lease state");
            System.out.println("{\"pass\":true,\"deviceInitialized\":true,\"allPcmZero\":true,"
                + "\"gainExportsVerified\":true,\"renewExportVerified\":true,\"expiredReplayRejected\":true,"
                + "\"newGenerationLeaseAccepted\":true,\"halfGainAckMs\":" + halfGainAckMs + "}");
        } finally {
            engine.stopSpatialStream(session, generation);
            engine.close();
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}
