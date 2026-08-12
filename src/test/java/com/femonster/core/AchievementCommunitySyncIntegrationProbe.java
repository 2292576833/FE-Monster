package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

public final class AchievementCommunitySyncIntegrationProbe {
    private AchievementCommunitySyncIntegrationProbe() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("usage: <config-path> <server-url>");
        Path config = Path.of(args[0]).toAbsolutePath().normalize();
        Files.createDirectories(config.getParent());
        Files.writeString(config, args[1], StandardCharsets.UTF_8);

        MachineIdentityService machine = new MachineIdentityService(ProjectPaths.detect());
        CommunityService service = new CommunityService(config, machine, null);
        Map<String, Object> alphaAccount = account("achievement-java-alpha");
        Map<String, Object> betaAccount = account("achievement-java-beta");

        require(SimpleJson.asBoolean(service.state("fixture", "Fixture", alphaAccount).get("ok"), false),
            "alpha registration failed");
        require(SimpleJson.asBoolean(service.state("fixture", "Fixture", betaAccount).get("ok"), false),
            "beta registration failed");

        Map<String, Object> alphaSaved = service.updateAchievementState(
            "fixture", "Fixture", alphaAccount, achievementState(9, "first-block")
        );
        require(SimpleJson.asBoolean(alphaSaved.get("ok"), false), "alpha save failed: " + alphaSaved);

        Map<String, Object> betaSaved = service.updateAchievementState(
            "fixture", "Fixture", betaAccount, achievementState(2, "world-peace")
        );
        require(SimpleJson.asBoolean(betaSaved.get("ok"), false), "beta save failed: " + betaSaved);

        CommunityService restored = new CommunityService(config, machine, null);
        Map<String, Object> alphaLoaded = restored.achievementState("fixture", "Fixture", alphaAccount);
        Map<String, Object> betaLoaded = restored.achievementState("fixture", "Fixture", betaAccount);
        require(progress(alphaLoaded) == 9, "alpha progress was not restored through the signed client");
        require(progress(betaLoaded) == 2, "beta progress was not restored through the signed client");
        require(unlocked(alphaLoaded).containsKey("first-block"), "alpha unlock was not restored");
        require(!unlocked(betaLoaded).containsKey("first-block"), "beta received alpha's unlock");

        System.out.println("AchievementCommunitySyncIntegrationProbe passed");
    }

    private static Map<String, Object> account(String userId) {
        Map<String, Object> account = new LinkedHashMap<>();
        account.put("userId", userId);
        account.put("nickname", userId);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("loggedIn", true);
        payload.put("account", account);
        return payload;
    }

    private static Map<String, Object> achievementState(long progress, String unlockedId) {
        Map<String, Object> equipped = new LinkedHashMap<>();
        equipped.put("achievementId", null);
        equipped.put("changedAt", 0);
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("version", 2);
        state.put("progress", Map.of("gap-runner", progress));
        state.put("unlocked", Map.of(unlockedId, Map.of("unlockedAt", 1_712_345_678_000L + progress)));
        state.put("themes", Map.of("page", "classic", "toast", "classic"));
        state.put("settings", Map.of("soundEnabled", true));
        state.put("ornaments", Map.of("claimed", Map.of(), "equipped", equipped));
        return state;
    }

    private static long progress(Map<String, Object> response) {
        Map<String, Object> state = SimpleJson.asMap(response.get("state"));
        return SimpleJson.asLong(SimpleJson.asMap(state.get("progress")).get("gap-runner"), -1L);
    }

    private static Map<String, Object> unlocked(Map<String, Object> response) {
        return SimpleJson.asMap(SimpleJson.asMap(response.get("state")).get("unlocked"));
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}
