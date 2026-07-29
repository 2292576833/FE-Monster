package com.femonster.json;

import java.util.List;
import java.util.Map;

public final class SimpleJsonPrimitiveArrayProbe {
    private SimpleJsonPrimitiveArrayProbe() {
    }

    public static void main(String[] args) {
        String json = SimpleJson.stringify(Map.of(
            "bands",
            new float[] {0.0f, 0.25f, Float.NaN, 1.0f}
        ));
        List<Object> bands = SimpleJson.asList(SimpleJson.parseObjectStrict(json).get("bands"));
        boolean pass = bands.size() == 4
            && Math.abs(SimpleJson.asDouble(bands.get(1), -1.0) - 0.25) < 0.0001
            && SimpleJson.asDouble(bands.get(2), -1.0) == 0.0
            && SimpleJson.asDouble(bands.get(3), -1.0) == 1.0;
        if (!pass) throw new IllegalStateException("primitive float JSON serialization failed: " + json);
        System.out.println("SimpleJsonPrimitiveArrayProbe passed");
    }
}
