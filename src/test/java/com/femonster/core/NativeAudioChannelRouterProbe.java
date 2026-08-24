package com.femonster.core;

import java.util.List;
import java.util.Map;

public final class NativeAudioChannelRouterProbe {
    private NativeAudioChannelRouterProbe() {
    }

    public static void main(String[] args) {
        NativeAudioEngine engine = new NativeAudioEngine(ProjectPaths.detect());
        require(!engine.available(), "probe root must not contain a native DLL");

        float[] values = validValues();
        Map<String, Object> cached = engine.setChannelRouterParameters(7L, 6, 2, values);
        require(Boolean.FALSE.equals(cached.get("available")), "inactive native route is unavailable");
        require(Boolean.FALSE.equals(cached.get("active")), "inactive native route is not active");
        require(Boolean.FALSE.equals(cached.get("actual")), "cached controls are not actual audio");
        require(((Number) cached.get("desiredRevision")).longValue() == 7L,
            "cached revision must survive while the pipeline is absent");
        require(((Number) cached.get("outputChannels")).intValue() == 6,
            "cached 5.1 layout must remain visible");
        require(((Number) cached.get("algorithm")).intValue() == 2,
            "cached ambient algorithm must remain visible");
        require(Boolean.TRUE.equals(cached.get("transitionPending")),
            "cached controls must remain pending until a block-boundary commit");
        require(exactList(cached.get("channelPeak")).size() == 8,
            "peak telemetry seam must remain fixed at eight channels");
        require(exactList(cached.get("channelRms")).size() == 8,
            "RMS telemetry seam must remain fixed at eight channels");
        require(exactList(cached.get("channelAzimuthDeg")).size() == 8,
            "azimuth telemetry seam must remain fixed at eight channels");

        boolean accepted = engine.playChannelTestSignal(6, 4, 0, 250, 997.0f, -18.0f);
        require(!accepted, "an unqueued in-memory test tone must never be reported audible");
        Map<String, Object> test = exactMap(engine.channelRouterPayload().get("testSignal"));
        require(Boolean.FALSE.equals(test.get("generated")), "no pipeline means no generated signal");
        require(Boolean.FALSE.equals(test.get("queued")), "generator output is not queued");
        require(Boolean.FALSE.equals(test.get("audible")), "generator output is not audible");

        expectIllegal(() -> engine.setChannelRouterParameters(8L, 6, 2, new float[40]));
        float[] nonFinite = validValues();
        nonFinite[25] = Float.NaN;
        expectIllegal(() -> engine.setChannelRouterParameters(8L, 6, 3, nonFinite));
        expectIllegal(() -> engine.setChannelRouterParameters(8L, 7, 1, validValues()));
        expectIllegal(() -> engine.setChannelRouterParameters(8L, 6, 100, validValues()));
        engine.close();
        System.out.println("NativeAudioChannelRouterProbe passed");
    }

    private static float[] validValues() {
        float[] values = new float[41];
        values[0] = 120.0f;
        float[] azimuth = { 30.0f, -30.0f, 0.0f, 0.0f, 135.0f, -135.0f, 90.0f, -90.0f };
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

    private static void expectIllegal(Runnable action) {
        boolean rejected = false;
        try {
            action.run();
        } catch (IllegalArgumentException expected) {
            rejected = true;
        }
        require(rejected, "invalid channel-router input must be rejected");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}
