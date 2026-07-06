package com.femonster.community;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public final class CommunityRequest {
    private final String method;
    private final String path;
    private final String body;
    private final String timestamp;
    private final String nonce;

    public CommunityRequest(String method, String path, String body) {
        this(method, path, body, "", "");
    }

    public CommunityRequest(String method, String path, String body, String timestamp, String nonce) {
        this.method = clean(method).toUpperCase();
        this.path = clean(path);
        this.body = body == null ? "" : body;
        this.timestamp = clean(timestamp);
        this.nonce = clean(nonce);
    }

    public String method() {
        return method;
    }

    public String path() {
        return path;
    }

    public String body() {
        return body;
    }

    public String timestamp() {
        return timestamp;
    }

    public String nonce() {
        return nonce;
    }

    public String bodySha256Hex() {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(body.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder(hash.length * 2);
            for (byte value : hash) {
                out.append(String.format("%02x", value & 0xff));
            }
            return out.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }

    public String signatureBase() {
        return String.join("\n", method, path, timestamp, nonce, bodySha256Hex());
    }

    public String signatureBase(String timestamp, String nonce) {
        return String.join("\n", method, path, clean(timestamp), clean(nonce), bodySha256Hex());
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }
}
