package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

public final class ClientPreferenceService {
    private static final int VERSION = 1;
    private static final int MAX_KEYS = 160;
    private static final int MAX_KEY_LENGTH = 160;
    private static final int MAX_VALUE_BYTES = 1024 * 1024;
    private static final int MAX_TOTAL_BYTES = 4 * 1024 * 1024;
    private static final String KEY_PREFIX = "fe-monster-";
    private static final String REVISION_KEY = "fe-monster-client-preferences-revision";

    private final Path file;
    private long updatedAt;
    private LinkedHashMap<String, String> values = new LinkedHashMap<>();

    public ClientPreferenceService(Path file) {
        this.file = file.toAbsolutePath().normalize();
        restore();
    }

    public synchronized Map<String, Object> snapshot() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("version", VERSION);
        body.put("updatedAt", updatedAt);
        body.put("values", new LinkedHashMap<>(values));
        return body;
    }

    public synchronized Map<String, Object> update(Map<String, Object> root) throws IOException {
        int version = SimpleJson.asInt(root.get("version"), 0);
        if (version != VERSION) throw new IllegalArgumentException("client preference version must be 1");
        Object rawValues = root.get("values");
        if (!(rawValues instanceof Map<?, ?>)) {
            throw new IllegalArgumentException("client preference values must be an object");
        }

        LinkedHashMap<String, String> next = validateValues(SimpleJson.asMap(rawValues));
        long requestedUpdatedAt = SimpleJson.asLong(root.get("updatedAt"), 0L);
        long nextUpdatedAt = requestedUpdatedAt > 0L ? requestedUpdatedAt : System.currentTimeMillis();
        if (nextUpdatedAt < updatedAt) return snapshot();
        write(nextUpdatedAt, next);
        updatedAt = nextUpdatedAt;
        values = next;
        return snapshot();
    }

    public synchronized String bootstrapScript() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("version", VERSION);
        payload.put("updatedAt", updatedAt);
        payload.put("values", new LinkedHashMap<>(values));
        String encoded = Base64.getEncoder().encodeToString(
            SimpleJson.stringify(payload).getBytes(StandardCharsets.UTF_8)
        );
        return "(function(){try{"
            + "var bytes=Uint8Array.from(atob('" + encoded + "'),function(c){return c.charCodeAt(0);});"
            + "var payload=JSON.parse(new TextDecoder().decode(bytes));"
            + "var localRevision=Number(localStorage.getItem('" + REVISION_KEY + "'))||0;"
            + "if(Number(payload.updatedAt||0)<localRevision)return;"
            + "Object.keys(payload.values||{}).forEach(function(key){localStorage.setItem(key,payload.values[key]);});"
            + "if(Number(payload.updatedAt||0)>0)localStorage.setItem('" + REVISION_KEY + "',String(payload.updatedAt));"
            + "}catch(ignore){}})();";
    }

    private void restore() {
        if (!Files.isRegularFile(file)) return;
        try {
            Map<String, Object> root = SimpleJson.parseObjectStrict(
                Files.readString(file, StandardCharsets.UTF_8)
            );
            if (SimpleJson.asInt(root.get("version"), 0) != VERSION) return;
            Object rawValues = root.get("values");
            if (!(rawValues instanceof Map<?, ?>)) return;
            values = validateValues(SimpleJson.asMap(rawValues));
            updatedAt = Math.max(0L, SimpleJson.asLong(root.get("updatedAt"), 0L));
        } catch (IOException | RuntimeException ignored) {
        }
    }

    private static LinkedHashMap<String, String> validateValues(Map<String, Object> source) {
        if (source.size() > MAX_KEYS) {
            throw new IllegalArgumentException("too many client preference keys");
        }
        LinkedHashMap<String, String> validated = new LinkedHashMap<>();
        int totalBytes = 0;
        for (Map.Entry<String, Object> entry : source.entrySet()) {
            String key = entry.getKey();
            if (
                key == null
                    || !key.startsWith(KEY_PREFIX)
                    || REVISION_KEY.equals(key)
                    || key.length() > MAX_KEY_LENGTH
            ) {
                throw new IllegalArgumentException("invalid client preference key");
            }
            if (!(entry.getValue() instanceof String value)) {
                throw new IllegalArgumentException("client preference values must be strings");
            }
            int valueBytes = value.getBytes(StandardCharsets.UTF_8).length;
            if (valueBytes > MAX_VALUE_BYTES) {
                throw new IllegalArgumentException("client preference value is too large");
            }
            totalBytes += key.getBytes(StandardCharsets.UTF_8).length + valueBytes;
            if (totalBytes > MAX_TOTAL_BYTES) {
                throw new IllegalArgumentException("client preference payload is too large");
            }
            validated.put(key, value);
        }
        return validated;
    }

    private void write(long nextUpdatedAt, LinkedHashMap<String, String> next) throws IOException {
        Path parent = file.getParent();
        if (parent != null) Files.createDirectories(parent);
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("version", VERSION);
        root.put("updatedAt", nextUpdatedAt);
        root.put("values", next);
        Path temporary = file.resolveSibling(file.getFileName() + ".tmp");
        Files.writeString(
            temporary,
            SimpleJson.stringify(root),
            StandardCharsets.UTF_8,
            StandardOpenOption.CREATE,
            StandardOpenOption.TRUNCATE_EXISTING,
            StandardOpenOption.WRITE
        );
        try {
            Files.move(
                temporary,
                file,
                StandardCopyOption.ATOMIC_MOVE,
                StandardCopyOption.REPLACE_EXISTING
            );
        } catch (AtomicMoveNotSupportedException ignored) {
            Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
