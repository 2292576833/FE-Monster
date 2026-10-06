package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

final class CommunityAccountProfileStore {
    private static final int VERSION = 3;
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final String SERVER_MEMORY_SUBJECT_PREFIX = "membind_v1_";
    private static final String LOCAL_MEMORY_SUBJECT_PREFIX = "memlocal_v1_";

    private final Path file;
    private final LinkedHashMap<String, Map<String, Object>> profiles = new LinkedHashMap<>();
    private final LinkedHashMap<String, String> memorySubjects = new LinkedHashMap<>();
    private final LinkedHashMap<String, String> serverMemorySubjects = new LinkedHashMap<>();

    CommunityAccountProfileStore(Path file) {
        this.file = file == null ? null : file.toAbsolutePath().normalize();
        restore();
    }

    synchronized Map<String, Object> profile(String accountKey) {
        return copyMap(profiles.get(accountKey));
    }

    synchronized String memorySubject(String accountKey) {
        return accountKey == null ? "" : memorySubjects.getOrDefault(accountKey, "");
    }

    synchronized String serverMemorySubject(String accountKey) {
        return accountKey == null ? "" : serverMemorySubjects.getOrDefault(accountKey, "");
    }

    synchronized String openOrCreateLocalMemorySubject(String accountKey) {
        if (accountKey == null || accountKey.isBlank()) return "";
        String existing = memorySubjects.getOrDefault(accountKey, "");
        if (validMemorySubject(existing)) return existing;
        byte[] random = new byte[32];
        RANDOM.nextBytes(random);
        String generated = LOCAL_MEMORY_SUBJECT_PREFIX
            + Base64.getUrlEncoder().withoutPadding().encodeToString(random);
        java.util.Arrays.fill(random, (byte) 0);
        memorySubjects.put(accountKey, generated);
        if (persist()) return generated;
        memorySubjects.remove(accountKey);
        return "";
    }

    synchronized boolean rememberMemorySubject(String accountKey, String binding) {
        if (accountKey == null || accountKey.isBlank() || binding == null
            || !binding.matches("membind_v1_[0-9a-f]{64}")) return false;
        String previous = memorySubjects.get(accountKey);
        String previousServer = serverMemorySubjects.get(accountKey);
        if (previous != null && !binding.equals(previous)
            && !previous.startsWith(LOCAL_MEMORY_SUBJECT_PREFIX)) return false;
        if (previousServer != null && !binding.equals(previousServer)) return false;
        if (previous == null) memorySubjects.put(accountKey, binding);
        serverMemorySubjects.put(accountKey, binding);
        if (binding.equals(previousServer) || persist()) return true;
        if (previous == null) memorySubjects.remove(accountKey); else memorySubjects.put(accountKey, previous);
        if (previousServer == null) serverMemorySubjects.remove(accountKey);
        else serverMemorySubjects.put(accountKey, previousServer);
        return false;
    }

    synchronized Map<String, Object> merge(String accountKey, Map<String, Object> profile) {
        if (accountKey == null || accountKey.isBlank() || profile == null || profile.isEmpty()) {
            return new LinkedHashMap<>();
        }
        Map<String, Object> stored = copyMap(profiles.get(accountKey));
        stored.putAll(copyProfile(profile));
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
            int version = SimpleJson.asInt(root.get("version"), 0);
            if (version < 1 || version > VERSION) return;
            for (Map.Entry<String, Object> entry : SimpleJson.asMap(root.get("profiles")).entrySet()) {
                Map<String, Object> profile = copyProfile(SimpleJson.asMap(entry.getValue()));
                if (!entry.getKey().isBlank() && !profile.isEmpty()) {
                    profiles.put(entry.getKey(), copyMap(profile));
                }
            }
            if (version >= 2) {
                for (Map.Entry<String, Object> entry : SimpleJson.asMap(root.get("memorySubjects")).entrySet()) {
                    String binding = entry.getValue() instanceof String text ? text : "";
                    if (!entry.getKey().isBlank() && validMemorySubject(binding)) {
                        memorySubjects.put(entry.getKey(), binding);
                    }
                }
            }
            if (version >= 3) {
                for (Map.Entry<String, Object> entry : SimpleJson.asMap(root.get("serverMemorySubjects")).entrySet()) {
                    String binding = entry.getValue() instanceof String text ? text : "";
                    if (!entry.getKey().isBlank() && binding.matches("membind_v1_[0-9a-f]{64}")) {
                        serverMemorySubjects.put(entry.getKey(), binding);
                    }
                }
            } else {
                memorySubjects.forEach((key, binding) -> {
                    if (binding.startsWith(SERVER_MEMORY_SUBJECT_PREFIX)) serverMemorySubjects.put(key, binding);
                });
            }
        } catch (IOException | RuntimeException ignored) {
            profiles.clear();
            memorySubjects.clear();
            serverMemorySubjects.clear();
        }
    }

    private boolean persist() {
        if (file == null) return true;
        Path temporary = file.resolveSibling(file.getFileName() + ".tmp");
        try {
            Path parent = file.getParent();
            if (parent != null) Files.createDirectories(parent);
            Map<String, Object> root = new LinkedHashMap<>();
            root.put("version", VERSION);
            root.put("profiles", copyValue(profiles));
            root.put("memorySubjects", copyValue(memorySubjects));
            root.put("serverMemorySubjects", copyValue(serverMemorySubjects));
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
            return true;
        } catch (IOException ignored) {
            return false;
        } finally {
            try {
                Files.deleteIfExists(temporary);
            } catch (IOException ignored) {
            }
        }
    }

    private static boolean validMemorySubject(String value) {
        return value != null && (value.matches("membind_v1_[0-9a-f]{64}")
            || value.matches("memlocal_v1_[A-Za-z0-9_-]{43}"));
    }

    private static Map<String, Object> copyProfile(Map<String, Object> source) {
        Map<String, Object> copy = copyMap(source);
        // This is a public profile cache. The server subject is accepted only
        // in the private binding map and is never copied into this object.
        copy.remove("memorySubjectId");
        return copy;
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
