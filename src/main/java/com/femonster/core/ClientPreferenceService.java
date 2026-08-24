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
import java.util.Set;
import java.util.regex.Pattern;

public final class ClientPreferenceService {
    private static final int PUBLIC_VERSION = 1;
    private static final int STORAGE_VERSION = 2;
    private static final int CLOUD_SCHEMA_VERSION = 2;
    private static final int MAX_KEYS = 160;
    private static final int MAX_KEY_LENGTH = 160;
    private static final int MAX_VALUE_BYTES = 1024 * 1024;
    private static final int MAX_TOTAL_BYTES = 4 * 1024 * 1024;
    private static final String KEY_PREFIX = "fe-monster-";
    private static final String REVISION_KEY = "fe-monster-client-preferences-revision";
    private static final Set<String> CLOUD_BACKUP_KEYS = Set.of(
        "fe-monster-active-provider-v1",
        "fe-monster-playback-quality-prefs-v1",
        "fe-monster-render-clarity-v1",
        "fe-monster-preset-fsr-v1",
        "fe-monster-playback-lyric-palette-v1",
        "fe-monster-bilingual-lyrics-v1",
        "fe-monster-multi-row-lyrics-v1",
        "fe-monster-lyric-clock-offset-v1",
        "fe-monster-sonic-settings-v1",
        "fe-monster-soundscape-workshop-settings-v3",
        "fe-monster-cover-particle-v1",
        "fe-monster-google-obr-spatial-audio-v1",
        "fe-monster-visual-settings-v1",
        "fe-monster-identity-card-muted-v1",
        "fe-monster-community-message-dnd-v1",
        "fe-monster-community-card-collapsed-v1"
    );
    private static final Pattern CLOUD_SECRET_PATTERN = Pattern.compile(
        "(?i)(?:\\b(?:authorization|cookie|password|passwd|secret|session|token|api[_ .-]?key)\\b|"
            + "\\bBearer\\s+[A-Za-z0-9._~+/=-]{8,}|\\bsk-[A-Za-z0-9_-]{8,}|"
            + "https?://|(?:^|[\\\"'\\s])[A-Za-z]:[\\\\/]|\\\\\\\\Users\\\\)"
    );

    private final Path file;
    private long updatedAt;
    private long serverRevision;
    private long localSequence;
    private int generation = 1;
    private String localState = "missing";
    private LinkedHashMap<String, String> values = new LinkedHashMap<>();
    private LinkedHashMap<String, Long> sequences = new LinkedHashMap<>();
    private LinkedHashMap<String, Long> tombstones = new LinkedHashMap<>();

    public ClientPreferenceService(Path file) {
        this.file = file.toAbsolutePath().normalize();
        restore();
    }

    public synchronized Map<String, Object> snapshot() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("version", PUBLIC_VERSION);
        body.put("updatedAt", updatedAt);
        body.put("values", new LinkedHashMap<>(values));
        body.put("localState", localState);
        body.put("serverRevision", serverRevision);
        return body;
    }

    public synchronized Map<String, Object> update(Map<String, Object> root) throws IOException {
        int version = SimpleJson.asInt(root.get("version"), 0);
        if (version != PUBLIC_VERSION) throw new IllegalArgumentException("client preference version must be 1");
        Object rawValues = root.get("values");
        if (!(rawValues instanceof Map<?, ?>)) {
            throw new IllegalArgumentException("client preference values must be an object");
        }

        LinkedHashMap<String, String> next = validateValues(SimpleJson.asMap(rawValues));
        long requestedUpdatedAt = SimpleJson.asLong(root.get("updatedAt"), 0L);
        long nextUpdatedAt = requestedUpdatedAt > 0L ? requestedUpdatedAt : System.currentTimeMillis();
        if (nextUpdatedAt < updatedAt) return snapshot();

        for (String key : values.keySet()) {
            if (!next.containsKey(key)) {
                localSequence += 1;
                tombstones.put(key, localSequence);
                sequences.remove(key);
            }
        }
        for (Map.Entry<String, String> entry : next.entrySet()) {
            if (!entry.getValue().equals(values.get(entry.getKey()))) {
                localSequence += 1;
                sequences.put(entry.getKey(), localSequence);
            } else if (!sequences.containsKey(entry.getKey())) {
                sequences.put(entry.getKey(), Math.max(1L, localSequence));
            }
            tombstones.remove(entry.getKey());
        }
        updatedAt = nextUpdatedAt;
        values = next;
        localState = "present";
        write();
        return snapshot();
    }

    public synchronized String localState() {
        return localState;
    }

    /**
     * Returns only the small, explicit cloud-backup allowlist. The browser's
     * localStorage namespace is intentionally not a security boundary: chat,
     * paths, credentials and arbitrary new keys remain local even when their
     * names use the FE Monster prefix.
     */
    public synchronized Map<String, Object> cloudSnapshot() {
        Map<String, Object> entries = new LinkedHashMap<>();
        for (String key : CLOUD_BACKUP_KEYS) {
            String value = values.get(key);
            if (value == null || !cloudSafeValue(value)) continue;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("value", value);
            item.put("localSeq", Math.max(0L, sequences.getOrDefault(key, 0L)));
            entries.put(key, item);
        }
        Map<String, Object> cloudTombstones = new LinkedHashMap<>();
        for (String key : CLOUD_BACKUP_KEYS) {
            Long sequence = tombstones.get(key);
            if (sequence != null) cloudTombstones.put(key, sequence);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("schemaVersion", CLOUD_SCHEMA_VERSION);
        body.put("baseRevision", serverRevision);
        body.put("generation", generation);
        body.put("localState", localState);
        body.put("entries", entries);
        body.put("tombstones", cloudTombstones);
        return body;
    }

    /**
     * Merge rule: a valid local value or deletion marker is authoritative.
     * Remote data only fills keys which have never existed on this device.
     */
    public synchronized Map<String, Object> mergeRemoteMissing(Map<String, Object> remote) throws IOException {
        if (SimpleJson.asInt(remote.get("schemaVersion"), 0) != CLOUD_SCHEMA_VERSION) {
            throw new IllegalArgumentException("unsupported cloud preference schema");
        }
        long nextServerRevision = Math.max(0L, SimpleJson.asLong(remote.get("serverRevision"), 0L));
        int remoteGeneration = Math.max(1, SimpleJson.asInt(remote.get("generation"), 1));
        boolean changed = false;

        Object rawEntries = remote.get("entries");
        if (rawEntries instanceof Map<?, ?>) {
            for (Map.Entry<String, Object> entry : SimpleJson.asMap(rawEntries).entrySet()) {
                String key = entry.getKey();
                if (!CLOUD_BACKUP_KEYS.contains(key) || values.containsKey(key) || tombstones.containsKey(key)) continue;
                Map<String, Object> item = entry.getValue() instanceof Map<?, ?>
                    ? SimpleJson.asMap(entry.getValue())
                    : Map.of();
                String value = item.get("value") instanceof String text ? text : "";
                if (!cloudSafeValue(value)) continue;
                values.put(key, value);
                sequences.put(key, 0L);
                changed = true;
            }
        }

        Object rawTombstones = remote.get("tombstones");
        if (rawTombstones instanceof Map<?, ?>) {
            for (Map.Entry<String, Object> entry : SimpleJson.asMap(rawTombstones).entrySet()) {
                String key = entry.getKey();
                if (!CLOUD_BACKUP_KEYS.contains(key) || values.containsKey(key) || tombstones.containsKey(key)) continue;
                tombstones.put(key, 0L);
                changed = true;
            }
        }

        if (nextServerRevision != serverRevision || remoteGeneration > generation) changed = true;
        serverRevision = nextServerRevision;
        generation = Math.max(generation, remoteGeneration);
        if (changed) {
            updatedAt = Math.max(updatedAt + 1L, System.currentTimeMillis());
            localState = "present";
            write();
        }
        return snapshot();
    }

    public synchronized String bootstrapScript() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("version", PUBLIC_VERSION);
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
        if (!Files.isRegularFile(file)) {
            localState = "missing";
            return;
        }
        try {
            Map<String, Object> root = SimpleJson.parseObjectStrict(
                Files.readString(file, StandardCharsets.UTF_8)
            );
            int version = SimpleJson.asInt(root.get("version"), 0);
            if (version != PUBLIC_VERSION && version != STORAGE_VERSION) {
                localState = "corrupt";
                return;
            }
            Object rawValues = root.get("values");
            if (!(rawValues instanceof Map<?, ?>)) {
                localState = "corrupt";
                return;
            }
            values = validateValues(SimpleJson.asMap(rawValues));
            updatedAt = Math.max(0L, SimpleJson.asLong(root.get("updatedAt"), 0L));
            if (version == STORAGE_VERSION) {
                serverRevision = Math.max(0L, SimpleJson.asLong(root.get("serverRevision"), 0L));
                localSequence = Math.max(0L, SimpleJson.asLong(root.get("localSequence"), 0L));
                generation = Math.max(1, SimpleJson.asInt(root.get("generation"), 1));
                sequences = validateSequenceMap(root.get("sequences"));
                tombstones = validateSequenceMap(root.get("tombstones"));
                tombstones.keySet().removeAll(values.keySet());
            } else {
                for (String key : values.keySet()) sequences.put(key, 1L);
                localSequence = values.isEmpty() ? 0L : 1L;
            }
            localState = "present";
        } catch (IOException | RuntimeException ignored) {
            values = new LinkedHashMap<>();
            sequences = new LinkedHashMap<>();
            tombstones = new LinkedHashMap<>();
            localState = "corrupt";
        }
    }

    private static LinkedHashMap<String, Long> validateSequenceMap(Object source) {
        LinkedHashMap<String, Long> validated = new LinkedHashMap<>();
        if (!(source instanceof Map<?, ?>)) return validated;
        for (Map.Entry<String, Object> entry : SimpleJson.asMap(source).entrySet()) {
            String key = entry.getKey();
            if (key == null || !key.startsWith(KEY_PREFIX) || key.length() > MAX_KEY_LENGTH) continue;
            validated.put(key, Math.max(0L, SimpleJson.asLong(entry.getValue(), 0L)));
        }
        return validated;
    }

    private static boolean cloudSafeValue(String value) {
        if (value == null) return false;
        int bytes = value.getBytes(StandardCharsets.UTF_8).length;
        return bytes <= 128 * 1024 && !CLOUD_SECRET_PATTERN.matcher(value).find();
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

    private void write() throws IOException {
        Path parent = file.getParent();
        if (parent != null) Files.createDirectories(parent);
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("version", STORAGE_VERSION);
        root.put("updatedAt", updatedAt);
        root.put("serverRevision", serverRevision);
        root.put("generation", generation);
        root.put("localSequence", localSequence);
        root.put("values", values);
        root.put("sequences", sequences);
        root.put("tombstones", tombstones);
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
