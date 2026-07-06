package com.femonster.community;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

public final class CommunityDeviceRequest {
    private final Map<String, String> rawSignals;

    public CommunityDeviceRequest(Map<String, String> rawSignals) {
        this.rawSignals = sanitize(rawSignals);
    }

    public Map<String, String> rawSignals() {
        return Collections.unmodifiableMap(rawSignals);
    }

    public String signal(String key) {
        return rawSignals.getOrDefault(key, "");
    }

    private static Map<String, String> sanitize(Map<String, String> input) {
        Map<String, String> out = new LinkedHashMap<>();
        if (input == null) return out;
        for (Map.Entry<String, String> entry : input.entrySet()) {
            String key = entry.getKey() == null ? "" : entry.getKey().trim();
            String value = entry.getValue() == null ? "" : entry.getValue().trim();
            if (!key.isBlank()) out.put(key, value);
        }
        return out;
    }
}
