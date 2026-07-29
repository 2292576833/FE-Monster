package com.femonster.core;

import java.util.Map;

public final class NativeSpatialAudioBridgeProbe {
    private NativeSpatialAudioBridgeProbe() {
    }

    public static void main(String[] args) throws Exception {
        NativeAudioEngine engine = new NativeAudioEngine(ProjectPaths.detect());
        Map<String, Object> start = engine.startSpatialStream(48000, 2, 6, 2);
        long session = ((Number) start.getOrDefault("session", 0)).longValue();
        if (!Boolean.TRUE.equals(start.get("ok")) || session <= 0) {
            throw new IllegalStateException("start failed: " + start);
        }

        double phase = 0.0;
        for (int block = 0; block < 18; block += 1) {
            float[] pcm = new float[1024 * 2];
            for (int frame = 0; frame < 1024; frame += 1) {
                float left = (float) (Math.sin(phase) * 0.11);
                float right = (float) (Math.sin(phase * 1.013 + 0.27) * 0.09);
                pcm[frame * 2] = left;
                pcm[frame * 2 + 1] = right;
                phase += Math.PI * 2.0 * 73.0 / 48000.0;
            }
            int result = engine.submitSpatialPcm(session, pcm);
            if (result < 0) throw new IllegalStateException("submit failed: " + result);
            Thread.sleep(18);
        }
        Thread.sleep(140);

        Map<String, Object> status = engine.spatialPayload();
        boolean pass = Boolean.TRUE.equals(status.get("active"))
            && Boolean.TRUE.equals(status.get("rendererReady"))
            && Boolean.TRUE.equals(status.get("rustUpmixActive"))
            && ((Number) status.getOrDefault("rustUpmixProcessCalls", 0)).longValue() == 18L
            && ((Number) status.getOrDefault("obrProcessCalls", 0)).longValue() == 18 * 4L
            && ((Number) status.getOrDefault("x3dCalculateCalls", 0)).longValue() == 6L
            && ((Number) status.getOrDefault("droppedBuffers", 1)).longValue() == 0
            && ((Number) status.getOrDefault("bufferPoolExhaustions", 1)).longValue() == 0
            && Boolean.TRUE.equals(status.get("voiceStarted"))
            && ((Number) status.getOrDefault("outputEnergy", 0.0)).doubleValue() > 0.0;
        engine.stopSpatialStream(session);
        boolean stopped = !Boolean.TRUE.equals(engine.spatialPayload().get("active"));
        engine.close();

        System.out.println("{"
            + "\"pass\":" + (pass && stopped)
            + ",\"chain\":\"PCM -> OxiMedia/Rust -> X3DAudio -> Google OBR -> XAudio2\""
            + ",\"rustCalls\":" + status.get("rustUpmixProcessCalls")
            + ",\"obrCalls\":" + status.get("obrProcessCalls")
            + ",\"x3dCalls\":" + status.get("x3dCalculateCalls")
            + ",\"dropped\":" + status.get("droppedBuffers")
            + ",\"queueUnderruns\":" + status.get("queueUnderruns")
            + ",\"poolExhaustions\":" + status.get("bufferPoolExhaustions")
            + ",\"voiceStarted\":" + status.get("voiceStarted")
            + ",\"outputEnergy\":" + status.get("outputEnergy")
            + ",\"stopped\":" + stopped
            + "}");
        if (!pass || !stopped) System.exit(1);
    }
}
