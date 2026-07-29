package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.lang.reflect.Method;
import java.util.Map;

public final class VisualBridgeSpectrumProbe {
    private static final int BAND_COUNT = 512;

    private VisualBridgeSpectrumProbe() {
    }

    public static void main(String[] args) throws Exception {
        Method normalize = VisualBridgeService.class.getDeclaredMethod(
            "lowFrequencyBands",
            Object.class,
            double.class
        );
        normalize.setAccessible(true);

        float[] nativeBands = new float[BAND_COUNT];
        nativeBands[0] = 0.125f;
        nativeBands[BAND_COUNT - 1] = 0.875f;
        Object nativeResult = normalize.invoke(null, nativeBands, 0.5);
        require(nativeResult == nativeBands, "native float[512] must pass through without cloning or boxing");

        Object fallbackResult = normalize.invoke(null, null, 0.25);
        require(fallbackResult instanceof float[], "fallback spectrum must remain a primitive float[]");
        float[] fallbackBands = (float[]) fallbackResult;
        require(fallbackBands.length == BAND_COUNT, "fallback spectrum must contain 512 bands");
        require(Math.abs(fallbackBands[0] - 0.25f) < 0.0001f, "fallback band value is incorrect");

        String json = SimpleJson.stringify(Map.of("bands", nativeResult));
        require(json.startsWith("{\"bands\":[0.125"), "primitive spectrum must serialize directly: " + json);
        System.out.println("VisualBridgeSpectrumProbe passed: nativeSameReference=true, boxedBands=0");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
