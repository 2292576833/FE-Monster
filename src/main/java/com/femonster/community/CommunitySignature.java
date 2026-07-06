package com.femonster.community;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

public final class CommunitySignature {
    public static final String APP_KEY_HEADER = "X-FE-App-Key";
    public static final String TIMESTAMP_HEADER = "X-FE-Timestamp";
    public static final String NONCE_HEADER = "X-FE-Nonce";
    public static final String SIGNATURE_HEADER = "X-FE-Signature";

    private final Map<String, String> headers;

    public CommunitySignature(Map<String, String> headers) {
        this.headers = sanitize(headers);
    }

    public static CommunitySignature of(String appKey, String timestamp, String nonce, String signature) {
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put(APP_KEY_HEADER, appKey);
        headers.put(TIMESTAMP_HEADER, timestamp);
        headers.put(NONCE_HEADER, nonce);
        headers.put(SIGNATURE_HEADER, signature);
        return new CommunitySignature(headers);
    }

    public Map<String, String> headers() {
        return Collections.unmodifiableMap(headers);
    }

    private static Map<String, String> sanitize(Map<String, String> input) {
        Map<String, String> out = new LinkedHashMap<>();
        if (input == null) return out;
        for (Map.Entry<String, String> entry : input.entrySet()) {
            String key = entry.getKey() == null ? "" : entry.getKey().trim();
            String value = entry.getValue() == null ? "" : entry.getValue().trim();
            if (!key.isBlank() && !value.isBlank()) out.put(key, value);
        }
        return out;
    }
}
