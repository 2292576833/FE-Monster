package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Black-box contract for the local, server-authoritative pet-personalization projection.
 *
 * <p>The production module deliberately does not share ClientPreference storage. Its source
 * represents signed server adapters; this probe supplies server-shaped memories and habits
 * without network or application bootstrap dependencies.</p>
 */
public final class PetPersonalizationSnapshotProbe {
    private static final Clock CLOCK = Clock.fixed(
        Instant.parse("2026-08-18T12:00:00Z"),
        ZoneOffset.UTC
    );
    private static final long NOW = CLOCK.millis();
    private static final String SCOPE_A = "feid:10000001@fixture-server";
    private static final String SCOPE_B = "feid:20000002@fixture-server";
    private static final Set<String> ALLOWED_CATEGORIES = Set.of(
        "music_preference",
        "music_dislike",
        "response_style",
        "volume_preference",
        "wallpaper_preference",
        "interaction_boundary",
        "care_preference"
    );

    private PetPersonalizationSnapshotProbe() {}

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-monster-pet-personalization-");
        try {
            safeProjectionIsAllowlistedAndBounded(root.resolve("projection"));
            persistedSnapshotsRestartAndStayScopeIsolated(root.resolve("restart"));
            corruptPersistenceFailsClosed(root.resolve("corrupt"));
            forgetInvalidationCannotResurrectPersistedMemory(root.resolve("forget"));
            System.out.println("PetPersonalizationSnapshotProbe passed");
        } finally {
            deleteTree(root);
        }
    }

    private static void safeProjectionIsAllowlistedAndBounded(Path store) throws Exception {
        FakeSource source = new FakeSource();
        List<Object> memories = new ArrayList<>();
        memories.add(memory("safe-1", "music_preference", "喜欢轻爵士", NOW + 10_000));
        memories.add(memory("safe-2", "music_dislike", "不喜欢刺耳高频", NOW + 10_000));
        memories.add(memory("safe-3", "response_style", "回答简洁温柔", NOW + 10_000));
        memories.add(memory("safe-4", "volume_preference", "夜间音量 18%", NOW + 10_000));
        memories.add(memory("safe-5", "wallpaper_preference", "喜欢深色星空壁纸", NOW + 10_000));
        memories.add(memory("safe-6", "interaction_boundary", "先询问再改变系统设置", NOW + 10_000));
        memories.add(memory("safe-7", "care_preference", "难过时可以播放舒缓音乐", NOW + 10_000));
        memories.add(memory("expired-id", "music_preference", "EXPIRED-MARKER", NOW - 1));
        memories.add(memory("other-id", "other_preference", "OTHER-MARKER", NOW + 10_000));
        memories.add(memory("secret-id", "response_style", "apiKey=sk-fixture-secret", NOW + 10_000));
        memories.add(memory("path-id", "wallpaper_preference", "C:\\Users\\Alice\\private.mp4", NOW + 10_000));
        memories.add(memory("chat-id", "chat", "PRIVATE-DM-MARKER", NOW + 10_000));
        source.put(SCOPE_A, memoryResponse(SCOPE_A, memories), habitResponse(SCOPE_A));

        PetPersonalizationSnapshot module = new PetPersonalizationSnapshot(store, source, CLOCK);
        Map<String, Object> refreshed = module.refresh(SCOPE_A);
        require(source.memoryCalls.get() == 1 && source.habitCalls.get() == 1,
            "refresh must pull both signed memory and habit projections from Source");
        require(refreshed.equals(module.snapshot(SCOPE_A)),
            "refresh result and current snapshot diverged");

        List<Object> projectedMemories = SimpleJson.asList(refreshed.get("memories"));
        require(projectedMemories.size() == ALLOWED_CATEGORIES.size(),
            "unsafe or expired memories survived the allowlist: " + projectedMemories);
        Set<String> categories = projectedMemories.stream()
            .map(SimpleJson::asMap)
            .map(entry -> SimpleJson.asString(entry.get("category"), ""))
            .collect(java.util.stream.Collectors.toSet());
        require(categories.equals(ALLOWED_CATEGORIES),
            "an allowed personalization category was lost: " + categories);
        for (Object item : projectedMemories) {
            Map<String, Object> entry = SimpleJson.asMap(item);
            require(entry.keySet().equals(Set.of("category", "value", "source", "confidence", "expiresAt")),
                "memory projection exposed server identity/audit fields: " + entry.keySet());
        }

        String json = SimpleJson.stringify(refreshed);
        assertNoPrivateMaterial(json, "returned snapshot");
        Map<String, Object> habits = SimpleJson.asMap(refreshed.get("habits"));
        for (String key : List.of("topArtists", "topTracks", "topPlaylists", "topProviders", "preferredTimes")) {
            require(SimpleJson.asList(habits.get(key)).size() <= 3,
                key + " was not bounded to Top3: " + habits.get(key));
        }
        require(!json.contains("artist-four") && !json.contains("track-four"),
            "habit projection retained metrics beyond Top3");

        FakeSource overflow = new FakeSource();
        List<Object> fifteenSafe = new ArrayList<>();
        for (int index = 0; index < 15; index++) {
            fifteenSafe.add(memory(
                "overflow-" + index,
                "music_preference",
                "安全音乐偏好 " + index,
                NOW + 10_000
            ));
        }
        String overflowScope = "feid:30000003@fixture-server";
        overflow.put(overflowScope, memoryResponse(overflowScope, fifteenSafe), emptyHabitResponse());
        PetPersonalizationSnapshot overflowModule = new PetPersonalizationSnapshot(
            store.resolve("overflow"),
            overflow,
            CLOCK
        );
        require(SimpleJson.asList(overflowModule.refresh(overflowScope).get("memories")).size() == 12,
            "memory projection was not capped at 12 entries");

        List<Path> persisted = regularFiles(store);
        require(!persisted.isEmpty(), "refresh did not persist an independent local snapshot");
        for (Path file : persisted) {
            assertNoPrivateMaterial(Files.readString(file, StandardCharsets.UTF_8), "persisted snapshot");
        }
    }

    private static void persistedSnapshotsRestartAndStayScopeIsolated(Path store) throws Exception {
        FakeSource source = new FakeSource();
        source.put(
            SCOPE_A,
            memoryResponse(SCOPE_A, List.of(memory("scope-a-id", "music_preference", "SCOPE-A-SAFE", NOW + 10_000))),
            emptyHabitResponse()
        );
        source.put(
            SCOPE_B,
            memoryResponse(SCOPE_B, List.of(memory("scope-b-id", "music_preference", "SCOPE-B-SAFE", NOW + 10_000))),
            emptyHabitResponse()
        );
        PetPersonalizationSnapshot module = new PetPersonalizationSnapshot(store, source, CLOCK);
        module.refresh(SCOPE_A);
        module.refresh(SCOPE_B);
        require(snapshotJson(module, SCOPE_A).contains("SCOPE-A-SAFE"), "scope A snapshot was missing");
        require(!snapshotJson(module, SCOPE_A).contains("SCOPE-B-SAFE"), "scope B leaked into scope A");
        require(snapshotJson(module, SCOPE_B).contains("SCOPE-B-SAFE"), "scope B snapshot was missing");
        require(!snapshotJson(module, SCOPE_B).contains("SCOPE-A-SAFE"), "scope A leaked into scope B");

        PetPersonalizationSnapshot restarted = new PetPersonalizationSnapshot(store, new FailingSource(), CLOCK);
        require(snapshotJson(restarted, SCOPE_A).contains("SCOPE-A-SAFE"),
            "scope A sanitized snapshot did not survive restart");
        require(snapshotJson(restarted, SCOPE_B).contains("SCOPE-B-SAFE"),
            "scope B sanitized snapshot did not survive restart");

        for (Path file : regularFiles(store)) {
            String relative = store.relativize(file).toString();
            String contents = Files.readString(file, StandardCharsets.UTF_8);
            require(!relative.contains("10000001") && !relative.contains("20000002"),
                "raw FEID was used as a persistence filename: " + relative);
            require(!contents.contains(SCOPE_A) && !contents.contains(SCOPE_B),
                "raw FEID/account scope was persisted inside the snapshot");
        }

        restarted.clear(SCOPE_A);
        require(isEmptySnapshot(restarted.snapshot(SCOPE_A)), "clear did not remove only scope A");
        require(snapshotJson(restarted, SCOPE_B).contains("SCOPE-B-SAFE"),
            "clearing scope A damaged scope B");
    }

    private static void corruptPersistenceFailsClosed(Path store) throws Exception {
        FakeSource source = new FakeSource();
        source.put(
            SCOPE_A,
            memoryResponse(SCOPE_A, List.of(memory("corrupt-id", "care_preference", "CORRUPT-SAFE", NOW + 10_000))),
            emptyHabitResponse()
        );
        PetPersonalizationSnapshot module = new PetPersonalizationSnapshot(store, source, CLOCK);
        module.refresh(SCOPE_A);
        List<Path> files = regularFiles(store);
        require(!files.isEmpty(), "corruption scenario had no durable snapshot");
        for (Path file : files) Files.writeString(file, "{not-json", StandardCharsets.UTF_8);

        PetPersonalizationSnapshot restarted = new PetPersonalizationSnapshot(store, new FailingSource(), CLOCK);
        require(isEmptySnapshot(restarted.snapshot(SCOPE_A)),
            "corrupt personalization persistence was treated as trusted data");
    }

    private static void forgetInvalidationCannotResurrectPersistedMemory(Path store) throws Exception {
        FakeSource source = new FakeSource();
        source.put(
            SCOPE_A,
            memoryResponse(SCOPE_A, List.of(memory("forgotten-id", "music_dislike", "FORGOTTEN-MARKER", NOW + 10_000))),
            emptyHabitResponse()
        );
        PetPersonalizationSnapshot module = new PetPersonalizationSnapshot(store, source, CLOCK);
        module.refresh(SCOPE_A);
        require(snapshotJson(module, SCOPE_A).contains("FORGOTTEN-MARKER"), "forget fixture was not cached");

        module.invalidate(SCOPE_A);
        require(isEmptySnapshot(module.snapshot(SCOPE_A)),
            "forget invalidation left the old memory available to the local model");
        PetPersonalizationSnapshot restarted = new PetPersonalizationSnapshot(store, new FailingSource(), CLOCK);
        require(isEmptySnapshot(restarted.snapshot(SCOPE_A)),
            "invalidated memory resurrected from persistence after restart");
    }

    private static Map<String, Object> memory(String id, String category, String value, long expiresAt) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("id", id);
        entry.put("feId", SCOPE_A);
        entry.put("category", category);
        entry.put("value", value);
        entry.put("source", "explicit");
        entry.put("confidence", 1.0);
        entry.put("createdAt", NOW - 1_000);
        entry.put("updatedAt", NOW - 500);
        entry.put("expiresAt", expiresAt);
        entry.put("chat", "PRIVATE-DM-MARKER");
        return entry;
    }

    private static Map<String, Object> memoryResponse(String scope, List<Object> memories) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ok", true);
        response.put("feId", scope);
        response.put("computerId", "PRIVATE-COMPUTER-ID");
        response.put("chat", List.of("PRIVATE-DM-MARKER"));
        response.put("apiKey", "sk-response-secret");
        response.put("memories", memories);
        return response;
    }

    private static Map<String, Object> habitResponse(String scope) {
        Map<String, Object> habits = new LinkedHashMap<>();
        habits.put("enabled", true);
        habits.put("totalListenMs", 120_000);
        habits.put("observations", 9);
        habits.put("updatedAt", NOW - 100);
        habits.put("topArtists", metrics("artist", 5));
        habits.put("topTracks", metrics("track", 5));
        habits.put("topPlaylists", metrics("playlist", 5));
        habits.put("topProviders", metrics("provider", 5));
        habits.put("preferredTimes", metrics("time", 5));
        habits.put("history", List.of(Map.of("chat", "PRIVATE-DM-MARKER")));
        habits.put("feId", scope);
        habits.put("localPath", "C:\\Users\\Alice\\music.db");
        habits.put("accessToken", "habit-token-secret");
        return Map.of("ok", true, "habits", habits);
    }

    private static Map<String, Object> emptyHabitResponse() {
        return Map.of("ok", true, "habits", Map.of(
            "enabled", true,
            "topArtists", List.of(),
            "topTracks", List.of(),
            "topPlaylists", List.of(),
            "topProviders", List.of(),
            "preferredTimes", List.of()
        ));
    }

    private static List<Object> metrics(String prefix, int count) {
        List<Object> values = new ArrayList<>();
        for (int index = 1; index <= count; index++) {
            values.add(Map.of(
                "id", prefix + "-private-id-" + index,
                "name", prefix + "-" + numberWord(index),
                "title", prefix + "-" + numberWord(index),
                "artist", "artist-safe-" + index,
                "listenMs", 10_000 - index,
                "lastAt", NOW - index,
                "chat", "PRIVATE-DM-MARKER"
            ));
        }
        return values;
    }

    private static String numberWord(int number) {
        return switch (number) {
            case 1 -> "one";
            case 2 -> "two";
            case 3 -> "three";
            case 4 -> "four";
            default -> "five";
        };
    }

    private static void assertNoPrivateMaterial(String text, String location) {
        for (String forbidden : List.of(
            SCOPE_A,
            SCOPE_B,
            "10000001",
            "20000002",
            "PRIVATE-DM-MARKER",
            "PRIVATE-COMPUTER-ID",
            "sk-fixture-secret",
            "sk-response-secret",
            "habit-token-secret",
            "Alice",
            "EXPIRED-MARKER",
            "OTHER-MARKER",
            "expired-id",
            "safe-1"
        )) {
            require(!text.contains(forbidden), location + " leaked forbidden value: " + forbidden);
        }
        String lower = text.toLowerCase(java.util.Locale.ROOT);
        require(!lower.contains("\"id\"") && !lower.contains("\"feid\"")
                && !lower.contains("\"chat\"") && !lower.contains("apikey")
                && !lower.contains("accesstoken") && !lower.contains("localpath"),
            location + " exposed an identity/chat/secret/path field: " + text);
    }

    private static String snapshotJson(PetPersonalizationSnapshot module, String scope) {
        return SimpleJson.stringify(module.snapshot(scope));
    }

    private static boolean isEmptySnapshot(Map<String, Object> snapshot) {
        return SimpleJson.asList(snapshot.get("memories")).isEmpty()
            && SimpleJson.asMap(snapshot.get("habits")).isEmpty();
    }

    private static List<Path> regularFiles(Path root) throws Exception {
        if (!Files.exists(root)) return List.of();
        try (var paths = Files.walk(root)) {
            return paths.filter(Files::isRegularFile).sorted().toList();
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void deleteTree(Path root) throws Exception {
        if (!Files.exists(root)) return;
        try (var paths = Files.walk(root)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
        }
    }

    private static class FakeSource implements PetPersonalizationSnapshot.Source {
        private final Map<String, Map<String, Object>> memories = new LinkedHashMap<>();
        private final Map<String, Map<String, Object>> habits = new LinkedHashMap<>();
        private final AtomicInteger memoryCalls = new AtomicInteger();
        private final AtomicInteger habitCalls = new AtomicInteger();

        void put(String scope, Map<String, Object> memoryResponse, Map<String, Object> habitResponse) {
            memories.put(scope, memoryResponse);
            habits.put(scope, habitResponse);
        }

        @Override
        public Map<String, Object> fetchMemories(String scope) throws Exception {
            memoryCalls.incrementAndGet();
            return memories.getOrDefault(scope, Map.of("ok", false));
        }

        @Override
        public Map<String, Object> fetchHabits(String scope) throws Exception {
            habitCalls.incrementAndGet();
            return habits.getOrDefault(scope, Map.of("ok", false));
        }
    }

    private static final class FailingSource extends FakeSource {
        @Override
        public Map<String, Object> fetchMemories(String scope) {
            throw new AssertionError("snapshot unexpectedly fetched memories during offline restore");
        }

        @Override
        public Map<String, Object> fetchHabits(String scope) {
            throw new AssertionError("snapshot unexpectedly fetched habits during offline restore");
        }
    }
}
