package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

public final class AchievementStateServiceSyncProbe {
    private AchievementStateServiceSyncProbe() {
    }

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-achievement-state-sync-");
        try {
            Path file = root.resolve("achievement-state.json");
            Files.writeString(
                file,
                SimpleJson.stringify(Map.of(
                    "version", 1,
                    "unlocked", Map.of("secret-left", Map.of("unlockedAt", 1_712_345_678_000L))
                )),
                StandardCharsets.UTF_8
            );

            AchievementStateService service = new AchievementStateService(file);
            require(
                SimpleJson.asMap(service.snapshot().get("unlocked")).containsKey("secret-left"),
                "version 1 anonymous state was not migrated"
            );

            service.update("netease:account-alpha", state(
                7,
                "forge",
                Map.of("first-block", Map.of("unlockedAt", 1_712_345_678_100L)),
                Map.of("first-block", Map.of("claimedAt", 1_712_345_678_110L)),
                "first-block",
                1_712_345_678_120L
            ));
            service.update("netease:account-beta", state(2, "void", Map.of()));

            AchievementStateService reloaded = new AchievementStateService(file);
            Map<String, Object> alpha = reloaded.snapshot("netease:account-alpha");
            Map<String, Object> beta = reloaded.snapshot("netease:account-beta");
            require(progress(alpha) == 7, "alpha local progress did not survive restart");
            require(progress(beta) == 2, "beta local progress did not survive restart");
            require(
                SimpleJson.asMap(alpha.get("unlocked")).containsKey("first-block"),
                "alpha local unlock did not survive restart"
            );
            require(
                !SimpleJson.asMap(beta.get("unlocked")).containsKey("first-block"),
                "beta local state received alpha's unlock"
            );
            require(
                claimed(alpha).containsKey("first-block"),
                "alpha claimed ornament did not survive restart"
            );
            require(
                !claimed(beta).containsKey("first-block"),
                "beta local state received alpha's claimed ornament"
            );
            require(
                "first-block".equals(equippedId(alpha)),
                "alpha equipped ornament did not survive restart"
            );

            Map<String, Object> merged = reloaded.mergeRemote(
                "netease:account-alpha",
                state(
                    3,
                    "frost",
                    Map.of("world-peace", Map.of("unlockedAt", 1_712_345_678_200L)),
                    Map.of("world-peace", Map.of("claimedAt", 1_712_345_678_210L)),
                    "world-peace",
                    1_712_345_678_120L
                )
            );
            require(progress(merged) == 7, "remote merge regressed local progress");
            require(
                SimpleJson.asMap(merged.get("unlocked")).keySet().containsAll(
                    java.util.Set.of("first-block", "world-peace")
                ),
                "remote merge lost an unlocked achievement"
            );
            require(
                "forge".equals(SimpleJson.asString(SimpleJson.asMap(merged.get("themes")).get("page"), "")),
                "valid local preferences did not remain authoritative"
            );
            require(
                claimed(merged).keySet().containsAll(java.util.Set.of("first-block", "world-peace")),
                "remote merge did not union claimed ornaments"
            );
            require(
                "world-peace".equals(equippedId(merged)),
                "equal-timestamp equipment updates did not converge deterministically"
            );

            Map<String, Object> restored = reloaded.mergeRemote(
                "netease:account-new-device",
                state(
                    11,
                    "frost",
                    Map.of("world-peace", Map.of("unlockedAt", 1_712_345_678_300L)),
                    Map.of("world-peace", Map.of("claimedAt", 1_712_345_678_310L)),
                    "world-peace",
                    1_712_345_678_320L
                )
            );
            require(progress(restored) == 11, "missing local progress was not restored from the server");
            require(
                "frost".equals(SimpleJson.asString(SimpleJson.asMap(restored.get("themes")).get("page"), "")),
                "missing local preferences were not restored from the server"
            );
            require(
                claimed(restored).containsKey("world-peace")
                    && "world-peace".equals(equippedId(restored)),
                "missing local ornament state was not restored from the server"
            );

            String corruptScope = "netease:account-corrupt";
            reloaded.update(corruptScope, state(4, "forge", Map.of()));
            Path corruptFile = root.resolve("achievement-states").resolve(
                HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(
                    corruptScope.getBytes(StandardCharsets.UTF_8)
                )) + ".json"
            );
            Files.writeString(corruptFile, "{broken-json", StandardCharsets.UTF_8);
            AchievementStateService afterCorruption = new AchievementStateService(file);
            Map<String, Object> recoveredCorruption = afterCorruption.mergeRemote(
                corruptScope,
                state(12, "frost", Map.of("world-peace", Map.of("unlockedAt", 1_712_345_678_400L)))
            );
            require(progress(recoveredCorruption) == 12, "corrupt local progress was not restored");
            require(
                "frost".equals(SimpleJson.asString(
                    SimpleJson.asMap(recoveredCorruption.get("themes")).get("page"), ""
                )),
                "corrupt local preferences were not restored"
            );

            System.out.println("AchievementStateServiceSyncProbe passed");
        } finally {
            deleteTree(root);
        }
    }

    private static Map<String, Object> state(
        long gapRunnerProgress,
        String pageTheme,
        Map<String, Object> unlocked
    ) {
        return state(gapRunnerProgress, pageTheme, unlocked, Map.of(), null, 0L);
    }

    private static Map<String, Object> state(
        long gapRunnerProgress,
        String pageTheme,
        Map<String, Object> unlocked,
        Map<String, Object> claimed,
        String equippedAchievementId,
        long equipmentChangedAt
    ) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("version", 2);
        state.put("progress", Map.of("gap-runner", gapRunnerProgress));
        state.put("unlocked", unlocked);
        state.put("themes", Map.of("page", pageTheme, "toast", "classic"));
        state.put("settings", Map.of("soundEnabled", true));
        Map<String, Object> equipped = new LinkedHashMap<>();
        equipped.put("achievementId", equippedAchievementId);
        equipped.put("changedAt", equipmentChangedAt);
        state.put("ornaments", Map.of("claimed", claimed, "equipped", equipped));
        return state;
    }

    private static long progress(Map<String, Object> state) {
        return SimpleJson.asLong(SimpleJson.asMap(state.get("progress")).get("gap-runner"), -1L);
    }

    private static Map<String, Object> claimed(Map<String, Object> state) {
        return SimpleJson.asMap(SimpleJson.asMap(state.get("ornaments")).get("claimed"));
    }

    private static String equippedId(Map<String, Object> state) {
        return SimpleJson.asString(
            SimpleJson.asMap(SimpleJson.asMap(state.get("ornaments")).get("equipped")).get("achievementId"),
            ""
        );
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void deleteTree(Path root) throws Exception {
        if (!Files.exists(root)) return;
        try (var paths = Files.walk(root)) {
            for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }
}
