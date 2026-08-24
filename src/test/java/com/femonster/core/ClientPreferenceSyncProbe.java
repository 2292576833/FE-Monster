package com.femonster.core;

import com.femonster.community.CommunityClient;
import com.femonster.json.SimpleJson;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.lang.reflect.Proxy;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

public final class ClientPreferenceSyncProbe {
    private static final String SAFE_VISUAL = "fe-monster-visual-settings-v1";
    private static final String SAFE_QUALITY = "fe-monster-playback-quality-prefs-v1";
    private static final String SAFE_SOUNDSCAPE = "fe-monster-soundscape-workshop-settings-v3";
    private static final String PRIVATE_WALLPAPER = "fe-monster-wallpaper-prefs";
    private static final String PRIVATE_AI = "fe-monster-client-ai-service-v1";

    private ClientPreferenceSyncProbe() {}

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-monster-preference-sync-");
        try {
            localValuesWinAndCloudOnlyFillsMissing(root.resolve("local-wins.json"));
            tombstonesPreventRemoteResurrection(root.resolve("tombstones.json"));
            cloudPayloadIsAnExplicitPrivacyAllowlist(root.resolve("privacy.json"));
            soundscapeParametersSurviveBackendRestartAndBootstrap(root.resolve("soundscape.json"));
            versionOneFilesMigrateWithoutLosingValues(root.resolve("migration.json"));
            corruptStateIsNotMistakenForAnIntentionalReset(root.resolve("corrupt.json"));
            conflictRebaseKeepsLocalAndRestoresRemoteMissing(root.resolve("rebase.json"));
            System.out.println("ClientPreferenceSyncProbe passed");
        } finally {
            deleteTree(root);
        }
    }

    private static void localValuesWinAndCloudOnlyFillsMissing(Path file) throws Exception {
        ClientPreferenceService service = new ClientPreferenceService(file);
        service.update(update(10, Map.of(SAFE_VISUAL, "local-B")));

        Map<String, Object> remote = new LinkedHashMap<>();
        remote.put("schemaVersion", 2);
        remote.put("serverRevision", 7);
        remote.put("generation", 1);
        remote.put("entries", Map.of(
            SAFE_VISUAL, Map.of("value", "remote-A", "serverRevision", 6),
            SAFE_QUALITY, Map.of("value", "remote-quality", "serverRevision", 7)
        ));
        remote.put("tombstones", Map.of());

        Map<String, Object> merged = service.mergeRemoteMissing(remote);
        Map<String, Object> values = SimpleJson.asMap(merged.get("values"));
        require("local-B".equals(values.get(SAFE_VISUAL)), "remote overwrote a valid local value");
        require("remote-quality".equals(values.get(SAFE_QUALITY)), "remote missing key was not restored");
        require(SimpleJson.asLong(service.cloudSnapshot().get("baseRevision"), -1) == 7,
            "server revision was not acknowledged");

        ClientPreferenceService restarted = new ClientPreferenceService(file);
        Map<String, Object> restartedValues = SimpleJson.asMap(restarted.snapshot().get("values"));
        require("local-B".equals(restartedValues.get(SAFE_VISUAL)), "local winner was not durable");
        require("remote-quality".equals(restartedValues.get(SAFE_QUALITY)), "remote fill was not durable");
    }

    private static void tombstonesPreventRemoteResurrection(Path file) throws Exception {
        ClientPreferenceService service = new ClientPreferenceService(file);
        service.update(update(20, Map.of(SAFE_VISUAL, "present", SAFE_QUALITY, "quality")));
        service.update(update(21, Map.of(SAFE_QUALITY, "quality")));

        Map<String, Object> remote = new LinkedHashMap<>();
        remote.put("schemaVersion", 2);
        remote.put("serverRevision", 9);
        remote.put("generation", 1);
        remote.put("entries", Map.of(SAFE_VISUAL, Map.of("value", "stale-remote")));
        remote.put("tombstones", Map.of());
        service.mergeRemoteMissing(remote);

        require(!SimpleJson.asMap(service.snapshot().get("values")).containsKey(SAFE_VISUAL),
            "remote resurrected a locally deleted preference");
        require(SimpleJson.asMap(service.cloudSnapshot().get("tombstones")).containsKey(SAFE_VISUAL),
            "local deletion was not represented by a tombstone");
    }

    private static void cloudPayloadIsAnExplicitPrivacyAllowlist(Path file) throws Exception {
        ClientPreferenceService service = new ClientPreferenceService(file);
        service.update(update(30, Map.of(
            SAFE_VISUAL, "{\"scenePreset\":\"heart\"}",
            PRIVATE_WALLPAPER, "{\"path\":\"C:/Users/Alice/private.mp4\"}",
            "fe-monster-pet-assistant-v1", "{\"history\":[\"private chat\"]}",
            "fe-monster-community-history-ledger-v1", "session-secret",
            PRIVATE_AI, "{\"apiKey\":\"sk-fixture-secret\"}"
        )));

        String cloudJson = SimpleJson.stringify(service.cloudSnapshot());
        require(cloudJson.contains(SAFE_VISUAL), "safe visual preference was omitted");
        require(!cloudJson.contains("Alice"), "local path leaked into cloud payload");
        require(!cloudJson.contains("private chat"), "chat history leaked into cloud payload");
        require(!cloudJson.contains("session-secret"), "session data leaked into cloud payload");
        require(!cloudJson.contains("sk-fixture-secret"), "API key leaked into cloud payload");
        require(!cloudJson.contains(PRIVATE_WALLPAPER), "wallpaper path preference was cloud eligible");
        require(!cloudJson.contains(PRIVATE_AI), "legacy AI secret preference was cloud eligible");
    }

    private static void soundscapeParametersSurviveBackendRestartAndBootstrap(Path file) throws Exception {
        String parameters = "{\"version\":2,\"requestedParameters\":{\"cameraDistance\":65}}";
        ClientPreferenceService service = new ClientPreferenceService(file);
        service.update(update(35, Map.of(SAFE_SOUNDSCAPE, parameters)));

        ClientPreferenceService restarted = new ClientPreferenceService(file);
        Map<String, Object> restored = SimpleJson.asMap(restarted.snapshot().get("values"));
        require(parameters.equals(restored.get(SAFE_SOUNDSCAPE)),
            "soundscape parameters were not durable across backend restart");
        String bootstrap = restarted.bootstrapScript();
        int encodedStart = bootstrap.indexOf("atob('");
        int encodedEnd = encodedStart < 0 ? -1 : bootstrap.indexOf("')", encodedStart + 6);
        require(encodedStart >= 0 && encodedEnd > encodedStart, "preference bootstrap payload was missing");
        String encoded = bootstrap.substring(encodedStart + 6, encodedEnd);
        Map<String, Object> bootstrapPayload = SimpleJson.parseObjectStrict(new String(
            Base64.getDecoder().decode(encoded), StandardCharsets.UTF_8
        ));
        require(parameters.equals(SimpleJson.asMap(bootstrapPayload.get("values")).get(SAFE_SOUNDSCAPE)),
            "soundscape parameters were omitted from the next-origin bootstrap");
        require(SimpleJson.stringify(restarted.cloudSnapshot()).contains(SAFE_SOUNDSCAPE),
            "soundscape parameters were omitted from the explicit cloud backup allowlist");
    }

    private static void versionOneFilesMigrateWithoutLosingValues(Path file) throws Exception {
        Files.writeString(file, SimpleJson.stringify(Map.of(
            "version", 1,
            "updatedAt", 40,
            "values", Map.of(SAFE_VISUAL, "legacy")
        )), StandardCharsets.UTF_8);
        ClientPreferenceService service = new ClientPreferenceService(file);
        require("legacy".equals(SimpleJson.asMap(service.snapshot().get("values")).get(SAFE_VISUAL)),
            "version 1 preference was not restored");
        require(SimpleJson.asInt(service.cloudSnapshot().get("schemaVersion"), 0) == 2,
            "cloud protocol was not upgraded to version 2");
    }

    private static void corruptStateIsNotMistakenForAnIntentionalReset(Path file) throws Exception {
        Files.writeString(file, "{not-json", StandardCharsets.UTF_8);
        ClientPreferenceService service = new ClientPreferenceService(file);
        require("corrupt".equals(service.localState()), "corrupt preference file was treated as missing/reset");
        require("corrupt".equals(service.cloudSnapshot().get("localState")),
            "cloud sync cannot distinguish corruption from a user reset");
    }

    private static void conflictRebaseKeepsLocalAndRestoresRemoteMissing(Path file) throws Exception {
        ClientPreferenceService preferences = new ClientPreferenceService(file);
        preferences.update(update(50, Map.of(SAFE_VISUAL, "local-authoritative")));
        AtomicInteger calls = new AtomicInteger();
        CommunityClient remote = (CommunityClient) Proxy.newProxyInstance(
            CommunityClient.class.getClassLoader(),
            new Class<?>[] { CommunityClient.class },
            (proxy, method, args) -> {
                if (!"syncClientPreferences".equals(method.getName())) {
                    if (Map.class.isAssignableFrom(method.getReturnType())) return Map.of("ok", false);
                    return null;
                }
                @SuppressWarnings("unchecked")
                Map<String, Object> request = (Map<String, Object>) args[3];
                require(!request.containsKey("feId") && !request.containsKey("computerId"),
                    "browser-facing sync payload tried to choose FE ID/device identity");
                int call = calls.incrementAndGet();
                if (call == 1) {
                    return remoteSnapshot(true, 5, "remote-stale", "remote-only");
                }
                require(SimpleJson.asLong(request.get("baseRevision"), 0) == 5,
                    "conflict retry did not rebase to the server revision");
                var changes = SimpleJson.asList(request.get("changes"));
                require(changes.size() == 1, "remote-filled key was incorrectly echoed as a local mutation");
                require(SAFE_VISUAL.equals(SimpleJson.asString(SimpleJson.asMap(changes.get(0)).get("key"), "")),
                    "local winner was missing from the conflict retry");
                return remoteSnapshot(false, 6, "local-authoritative", "remote-only");
            }
        );
        ClientPreferenceSyncService sync = new ClientPreferenceSyncService(
            preferences, remote, "fixture-device"
        );
        Map<String, Object> result = sync.sync("qq", "QQ", Map.of("loggedIn", true));
        require(SimpleJson.asBoolean(result.get("ok"), false), "conflict sync did not recover");
        require(calls.get() == 2, "conflict sync must retry exactly once");
        Map<String, Object> values = SimpleJson.asMap(preferences.snapshot().get("values"));
        require("local-authoritative".equals(values.get(SAFE_VISUAL)), "remote conflict overwrote local state");
        require("remote-only".equals(values.get(SAFE_QUALITY)), "remote-only key was not restored");
    }

    private static Map<String, Object> remoteSnapshot(
        boolean conflict,
        long revision,
        String visual,
        String quality
    ) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("conflict", conflict);
        body.put("schemaVersion", 2);
        body.put("serverRevision", revision);
        body.put("generation", 1);
        body.put("entries", Map.of(
            SAFE_VISUAL, Map.of("value", visual),
            SAFE_QUALITY, Map.of("value", quality)
        ));
        body.put("tombstones", Map.of());
        return body;
    }

    private static Map<String, Object> update(long updatedAt, Map<String, String> values) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("version", 1);
        body.put("updatedAt", updatedAt);
        body.put("values", values);
        return body;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void deleteTree(Path root) throws Exception {
        if (!Files.exists(root)) return;
        try (var paths = Files.walk(root)) {
            for (Path path : paths.sorted((left, right) -> right.getNameCount() - left.getNameCount()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }
}
