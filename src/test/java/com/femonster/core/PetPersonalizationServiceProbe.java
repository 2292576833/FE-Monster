package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

public final class PetPersonalizationServiceProbe {
    private static final Clock CLOCK = Clock.fixed(
        Instant.parse("2026-08-18T12:00:00Z"),
        ZoneOffset.UTC
    );
    private static final long NOW = CLOCK.millis();

    private PetPersonalizationServiceProbe() {
    }

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-pet-personalization-service-");
        try {
            FakeAccountSource online = new FakeAccountSource(false);
            PetPersonalizationService service = new PetPersonalizationService(root, online, CLOCK);
            Map<String, Object> account = Map.of(
                "loggedIn", true,
                "account", Map.of("userId", "provider-private-user")
            );

            Map<String, Object> fresh = service.projection("netease", "网易云", account);
            require(SimpleJson.asBoolean(fresh.get("ok"), false), "fresh projection failed");
            require("server".equals(SimpleJson.asString(fresh.get("source"), "")),
                "online projection was not marked server-authoritative: " + fresh);
            require(!SimpleJson.asBoolean(fresh.get("stale"), true), "fresh projection was marked stale");
            String freshJson = SimpleJson.stringify(fresh);
            require(freshJson.contains("SAFE-PERSONALIZATION-MARKER"), "safe memory was not projected");
            require(!freshJson.contains("87654321") && !freshJson.contains("provider-private-user"),
                "route projection leaked an FEID/provider account ID: " + freshJson);

            FakeAccountSource offline = new FakeAccountSource(true);
            PetPersonalizationService restarted = new PetPersonalizationService(root, offline, CLOCK);
            Map<String, Object> cached = restarted.projection("netease", "网易云", account);
            require("cache".equals(SimpleJson.asString(cached.get("source"), "")),
                "offline projection did not use the sanitized cache: " + cached);
            require(SimpleJson.asBoolean(cached.get("stale"), false), "offline cache was not marked stale");
            require(SimpleJson.stringify(cached).contains("SAFE-PERSONALIZATION-MARKER"),
                "offline cache lost the sanitized projection");

            restarted.invalidate("netease", "网易云", account);
            Map<String, Object> forgotten = restarted.projection("netease", "网易云", account);
            require(!SimpleJson.stringify(forgotten).contains("SAFE-PERSONALIZATION-MARKER"),
                "invalidated memory resurrected while offline");

            Map<String, Object> loggedOut = service.projection(
                "netease", "网易云", Map.of("loggedIn", false, "account", Map.of())
            );
            require(!SimpleJson.asBoolean(loggedOut.get("available"), true),
                "logged-out account received personalization");
            require("none".equals(SimpleJson.asString(loggedOut.get("source"), "")),
                "logged-out projection did not fail closed");
            System.out.println("PetPersonalizationServiceProbe passed");
        } finally {
            try (var paths = Files.walk(root)) {
                for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
            }
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static final class FakeAccountSource implements PetPersonalizationService.AccountSource {
        private final boolean offline;

        private FakeAccountSource(boolean offline) {
            this.offline = offline;
        }

        @Override
        public String scope(String provider, String providerLabel, Map<String, Object> accountPayload) {
            if (!SimpleJson.asBoolean(accountPayload.get("loggedIn"), false)) return "";
            return "fixture-server\n87654321";
        }

        @Override
        public Map<String, Object> memories(
            String provider,
            String providerLabel,
            Map<String, Object> accountPayload
        ) throws Exception {
            if (offline) throw new java.io.IOException("offline");
            return Map.of(
                "ok", true,
                "feId", "87654321",
                "memories", List.of(Map.of(
                    "id", "private-memory-id",
                    "category", "care_preference",
                    "value", "SAFE-PERSONALIZATION-MARKER",
                    "source", "explicit",
                    "confidence", 1,
                    "expiresAt", NOW + 60_000
                ))
            );
        }

        @Override
        public Map<String, Object> habits(
            String provider,
            String providerLabel,
            Map<String, Object> accountPayload
        ) throws Exception {
            if (offline) throw new java.io.IOException("offline");
            return Map.of("ok", true, "habits", Map.of(
                "enabled", true,
                "topArtists", List.of(Map.of("name", "safe artist", "listenMs", 3000))
            ));
        }
    }
}
