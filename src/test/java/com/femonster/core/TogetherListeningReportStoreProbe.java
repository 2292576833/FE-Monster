package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

public final class TogetherListeningReportStoreProbe {
    private TogetherListeningReportStoreProbe() {
    }

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-together-listening-report-");
        Path file = root.resolve("community-together-listening-report.json");
        try {
            TogetherListeningReportStore store = new TogetherListeningReportStore(file);
            List<Map<String, Object>> firstMembers = List.of(
                Map.of("feId", "1001", "username", "Me"),
                Map.of("feId", "2002", "username", "Aster", "avatarUrl", "a.png")
            );
            store.recordSession("1001", "session-one", 5_000L, firstMembers);
            store.recordSession("1001", "session-one", 2_500L, firstMembers);

            List<Map<String, Object>> secondMembers = List.of(
                Map.of("feId", "1001", "username", "Me"),
                Map.of("feId", "2002", "username", "Aster Updated", "avatarUrl", "a2.png"),
                Map.of("feId", "3003", "username", "Beryl")
            );
            store.recordSession("1001", "session-two", 3_000L, secondMembers);

            Map<String, Object> report = store.reportAndFlush("1001");
            require(SimpleJson.asBoolean(report.get("hasHistory"), false), "history flag was not set");
            require(SimpleJson.asInt(report.get("friendCount"), 0) == 2, "friend count was not aggregated");
            List<Object> friends = SimpleJson.asList(report.get("friends"));
            Map<String, Object> longest = SimpleJson.asMap(report.get("longestFriend"));
            require("2002".equals(SimpleJson.asString(longest.get("feId"), "")), "longest friend was not selected");
            require(SimpleJson.asLong(longest.get("totalListenMs"), 0L) == 10_500L, "duration was not accumulated");
            require(SimpleJson.asLong(longest.get("sessionCount"), 0L) == 2L, "session IDs were not deduplicated");
            require(SimpleJson.asLong(longest.get("lastListenedAt"), 0L) > 0L, "last-listened time was not recorded");
            require("Aster Updated".equals(SimpleJson.asString(longest.get("username"), "")), "friend metadata was not refreshed");
            require(friends.size() == 2, "friend report list was incomplete");

            TogetherListeningReportStore restored = new TogetherListeningReportStore(file);
            restored.recordSession("1001", "session-two", 1_000L, secondMembers);
            Map<String, Object> restoredReport = restored.reportAndFlush("1001");
            Map<String, Object> restoredLongest = SimpleJson.asMap(restoredReport.get("longestFriend"));
            require(SimpleJson.asLong(restoredLongest.get("totalListenMs"), 0L) == 11_500L, "persisted duration was not restored");
            require(SimpleJson.asLong(restoredLongest.get("sessionCount"), 0L) == 2L, "restored session count was not idempotent");
            require(
                SimpleJson.asInt(restored.report("different-owner").get("friendCount"), -1) == 0,
                "reports leaked across FE IDs"
            );

            Map<String, Object> storedRoot = SimpleJson.parseObjectStrict(
                Files.readString(file, StandardCharsets.UTF_8)
            );
            require(SimpleJson.asInt(storedRoot.get("version"), 0) == 1, "persisted report version is missing");
            require(SimpleJson.asMap(storedRoot.get("users")).containsKey("1001"), "owner report was not persisted");
            System.out.println("TogetherListeningReportStoreProbe passed.");
        } finally {
            try (var paths = Files.walk(root)) {
                paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                    try {
                        Files.deleteIfExists(path);
                    } catch (Exception ignored) {
                    }
                });
            }
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
