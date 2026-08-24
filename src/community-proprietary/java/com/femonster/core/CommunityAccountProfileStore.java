package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class CommunityAccountProfileStore {
    private static final int VERSION = 1;

    private final Path file;
    private final LinkedHashMap<String, Map<String, Object>> profiles = new LinkedHashMap<>();

    CommunityAccountProfileStore(Path file) {
        this.file = file == null ? null : file.toAbsolutePath().normalize();
        restore();
    }

    synchronized Map<String, Object> profile(String accountKey) {
        return copyMap(profiles.get(accountKey));
    }

    synchronized Map<String, Object> merge(String accountKey, Map<String, Object> profile) {
        if (accountKey == null || accountKey.isBlank() || profile == null || profile.isEmpty()) {
            return new LinkedHashMap<>();
        }
        Map<String, Object> stored = copyMap(profiles.get(accountKey));
        stored.putAll(copyMap(profile));
        if (stored.equals(profiles.get(accountKey))) return copyMap(stored);
        profiles.put(accountKey, stored);
        persist();
        return copyMap(stored);
    }

    private void restore() {
        if (file == null || !Files.isRegularFile(file)) return;
        try {
            Map<String, Object> root = SimpleJson.parseObjectStrict(
                Files.readString(file, StandardCharsets.UTF_8)
            );
            if (SimpleJson.asInt(root.get("version"), 0) != VERSION) return;
            for (Map.Entry<String, Object> entry : SimpleJson.asMap(root.get("profiles")).entrySet()) {
                Map<String, Object> profile = SimpleJson.asMap(entry.getValue());
                if (!entry.getKey().isBlank() && !profile.isEmpty()) {
                    profiles.put(entry.getKey(), copyMap(profile));
                }
            }
        } catch (IOException | RuntimeException ignored) {
            profiles.clear();
        }
    }

    private void persist() {
        if (file == null) return;
        Path temporary = file.resolveSibling(file.getFileName() + ".tmp");
        try {
            Path parent = file.getParent();
            if (parent != null) Files.createDirectories(parent);
            Map<String, Object> root = new LinkedHashMap<>();
            root.put("version", VERSION);
            root.put("profiles", copyValue(profiles));
            Files.writeString(
                temporary,
                SimpleJson.stringify(root),
                StandardCharsets.UTF_8,
                StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING
            );
            try {
                Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException ignored) {
                Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException ignored) {
        } finally {
            try {
                Files.deleteIfExists(temporary);
            } catch (IOException ignored) {
            }
        }
    }

    private static Map<String, Object> copyMap(Map<String, Object> source) {
        Map<String, Object> copy = new LinkedHashMap<>();
        if (source == null) return copy;
        for (Map.Entry<String, Object> entry : source.entrySet()) {
            copy.put(entry.getKey(), copyValue(entry.getValue()));
        }
        return copy;
    }

    private static Object copyValue(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> copy = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                copy.put(String.valueOf(entry.getKey()), copyValue(entry.getValue()));
            }
            return copy;
        }
        if (value instanceof List<?> list) {
            List<Object> copy = new ArrayList<>();
            for (Object item : list) copy.add(copyValue(item));
            return copy;
        }
        return value;
    }
}
