package com.femonster.core;

import com.femonster.community.CommunityClient;
import com.femonster.json.SimpleJson;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Reconciles the local preference journal with the signed FE-ID backup.
 * The browser chooses only an already configured local music account; FE ID,
 * device identity and request signatures are derived by CommunityService.
 */
public final class ClientPreferenceSyncService {
    private final ClientPreferenceService local;
    private final CommunityClient community;
    private final String deviceId;

    public ClientPreferenceSyncService(
        ClientPreferenceService local,
        CommunityClient community,
        String deviceId
    ) {
        this.local = local;
        this.community = community;
        this.deviceId = deviceId == null || deviceId.isBlank() ? "local-device" : deviceId;
    }

    public synchronized Map<String, Object> sync(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload
    ) {
        Map<String, Object> first = send(provider, providerLabel, accountPayload, local.cloudSnapshot());
        if (!SimpleJson.asBoolean(first.get("ok"), false) && !SimpleJson.asBoolean(first.get("conflict"), false)) {
            return offlineResult(first);
        }
        try {
            local.mergeRemoteMissing(first);
            if (SimpleJson.asBoolean(first.get("conflict"), false)) {
                Map<String, Object> retry = send(provider, providerLabel, accountPayload, local.cloudSnapshot());
                if (!SimpleJson.asBoolean(retry.get("ok"), false) && !SimpleJson.asBoolean(retry.get("conflict"), false)) {
                    return offlineResult(retry);
                }
                local.mergeRemoteMissing(retry);
                return result(retry, true);
            }
            return result(first, false);
        } catch (Exception error) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("ok", false);
            body.put("offline", false);
            body.put("error", "client preference merge failed");
            return body;
        }
    }

    private Map<String, Object> send(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        Map<String, Object> cloud
    ) {
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("schemaVersion", 2);
        request.put("namespace", "account");
        request.put("baseRevision", SimpleJson.asLong(cloud.get("baseRevision"), 0L));
        request.put("generation", Math.max(1, SimpleJson.asInt(cloud.get("generation"), 1)));
        request.put("localState", SimpleJson.asString(cloud.get("localState"), "missing"));
        request.put("changes", changes(cloud));
        return community.syncClientPreferences(provider, providerLabel, accountPayload, request);
    }

    private List<Map<String, Object>> changes(Map<String, Object> cloud) {
        List<Map<String, Object>> output = new ArrayList<>();
        Map<String, Object> entries = SimpleJson.asMap(cloud.get("entries"));
        for (Map.Entry<String, Object> entry : entries.entrySet()) {
            Map<String, Object> item = SimpleJson.asMap(entry.getValue());
            String value = SimpleJson.asString(item.get("value"), "");
            long sequence = Math.max(0L, SimpleJson.asLong(item.get("localSeq"), 0L));
            if (sequence == 0L) continue;
            output.add(change(entry.getKey(), value, false, sequence));
        }
        Map<String, Object> tombstones = SimpleJson.asMap(cloud.get("tombstones"));
        for (Map.Entry<String, Object> entry : tombstones.entrySet()) {
            long sequence = Math.max(0L, SimpleJson.asLong(entry.getValue(), 0L));
            if (sequence == 0L) continue;
            output.add(change(entry.getKey(), "", true, sequence));
        }
        if (output.size() > 64) return output.subList(0, 64);
        return output;
    }

    private Map<String, Object> change(String key, String value, boolean deleted, long sequence) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("key", key);
        if (!deleted) item.put("value", value);
        item.put("deleted", deleted);
        item.put("localSeq", sequence);
        item.put("clientMutationId", mutationId(key, value, deleted, sequence));
        return item;
    }

    private String mutationId(String key, String value, boolean deleted, long sequence) {
        String source = deviceId + "\n" + key + "\n" + sequence + "\n" + deleted + "\n" + value;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8));
            return "pref-" + HexFormat.of().formatHex(digest, 0, 16);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }

    private Map<String, Object> result(Map<String, Object> remote, boolean retried) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("offline", false);
        body.put("retried", retried);
        body.put("serverRevision", SimpleJson.asLong(remote.get("serverRevision"), 0L));
        body.put("preferences", local.snapshot());
        return body;
    }

    private Map<String, Object> offlineResult(Map<String, Object> remote) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", false);
        body.put("offline", true);
        body.put("queued", true);
        body.put("preferences", local.snapshot());
        String error = SimpleJson.asString(remote.get("error"), "community server unavailable");
        body.put("error", error.length() > 240 ? error.substring(0, 240) : error);
        return body;
    }
}
