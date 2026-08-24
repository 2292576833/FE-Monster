package com.femonster.core;

import java.util.List;
import java.util.Map;

public final class NativeAudioChannelRouterLiveProbe {
    private NativeAudioChannelRouterLiveProbe() {
    }

    public static void main(String[] args) {
        NativeAudioEngine engine = new NativeAudioEngine(ProjectPaths.detect());
        require(engine.available(), "compiled JNI bridge must load");
        float[] controls = controls();
        Map<String, Object> cached = engine.setChannelRouterParameters(5L, 6, 2, controls);
        require(Boolean.TRUE.equals(cached.get("transitionPending")),
            "controls submitted before stream creation must remain cached");

        Map<String, Object> started = engine.startSpatialStream(48_000, 2, 6, 2);
        require(Boolean.TRUE.equals(started.get("ok")), "native spatial stream must start");
        long session = ((Number) started.get("session")).longValue();
        long generation = ((Number) started.get("generation")).longValue();
        float[] stereo = new float[512];
        stereo[0] = 0.25f;
        stereo[1] = -0.25f;
        require(engine.submitSpatialPcm(session, generation, stereo) >= 0,
            "one block must reach the production Submit path");

        Map<String, Object> status = engine.channelRouterPayload();
        require(Boolean.TRUE.equals(status.get("available")), "router must be available");
        require(Boolean.TRUE.equals(status.get("active")), "router must be active");
        require(Boolean.TRUE.equals(status.get("actual")), "router telemetry must come from processed PCM");
        require(((Number) status.get("outputChannels")).intValue() == 6, "5.1 replay drifted");
        require(((Number) status.get("algorithm")).intValue() == 2, "ambient replay drifted");
        require(((Number) status.get("activeRevision")).longValue() == 5L,
            "cached Java revision must survive native +2 bootstrap offset");
        require(((Number) status.get("processCalls")).longValue() > 0L,
            "router process counter must advance");
        require(exactList(status.get("channelPeak")).size() == 8, "peak telemetry width");

        boolean accepted = engine.playChannelTestSignal(6, 4, 0, 250, 997.0f, -18.0f);
        require(accepted, "the bounded one-hot test tone must enter the audible native queue");
        Map<String, Object> test = exactMap(engine.channelRouterPayload().get("testSignal"));
        require(Boolean.TRUE.equals(test.get("generated")), "native test bed must be generated");
        require(Boolean.TRUE.equals(test.get("queued")), "native test bed must be queued");
        require(Boolean.TRUE.equals(test.get("audible")), "queued native test bed must be reported audible");
        require("virtual-bed-to-mixer-obr-queue".equals(test.get("transport")),
            "test tone must traverse the same Mixer/OBR output queue");
        engine.stopSpatialStream(session, generation);
        engine.close();
        System.out.println("NativeAudioChannelRouterLiveProbe passed");
    }

    private static float[] controls() {
        float[] values = new float[41];
        values[0] = 120.0f;
        float[] azimuth = { 30.0f, -30.0f, 0.0f, 0.0f, 110.0f, -110.0f, 90.0f, -90.0f };
        System.arraycopy(azimuth, 0, values, 17, azimuth.length);
        values[25] = 1.0f;
        values[28] = 1.0f;
        values[29] = 0.7071f;
        values[30] = 0.7071f;
        values[31] = 0.5f;
        values[32] = 0.5f;
        return values;
    }

    @SuppressWarnings("unchecked")
    private static List<Object> exactList(Object value) {
        if (!(value instanceof List<?> list)) throw new IllegalStateException("expected list");
        return (List<Object>) list;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> exactMap(Object value) {
        if (!(value instanceof Map<?, ?> map)) throw new IllegalStateException("expected map");
        return (Map<String, Object>) map;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}
