package com.femonster.core;

import com.femonster.json.SimpleJson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public final class CommunityAvatarOrnamentCompatibilityProbe {
    private CommunityAvatarOrnamentCompatibilityProbe() {
    }

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-community-ornament-compat-");
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        List<String> registerBodies = new CopyOnWriteArrayList<>();
        List<String> profileBodies = new CopyOnWriteArrayList<>();
        List<String> postIdempotencyKeys = new CopyOnWriteArrayList<>();
        server.createContext("/health", exchange -> send(exchange, 200,
            Map.of("ok", true, "service", "fe-monster-community")));
        server.createContext("/api/community/register", exchange -> {
            postIdempotencyKeys.add(header(exchange, "Idempotency-Key"));
            String body = readBody(exchange);
            registerBodies.add(body);
            if (body.contains("\"avatarOrnament\"")) {
                send(exchange, 400, Map.of("ok", false, "error", "unexpected parameter: avatarOrnament"));
                return;
            }
            send(exchange, 200, profilePayload("compat-user"));
        });
        server.createContext("/api/community/profile", exchange -> {
            postIdempotencyKeys.add(header(exchange, "Idempotency-Key"));
            String body = readBody(exchange);
            profileBodies.add(body);
            if (body.contains("\"avatarOrnament\"")) {
                send(exchange, 400, Map.of("ok", false, "error", "unexpected parameter: avatarOrnament"));
                return;
            }
            send(exchange, 200, profilePayload("compat-user"));
        });
        server.setExecutor(executor);
        server.start();

        try {
            Path config = root.resolve("community-server-url.txt");
            Files.writeString(config, "http://127.0.0.1:" + server.getAddress().getPort(), StandardCharsets.UTF_8);
            Map<String, Object> account = Map.of(
                "loggedIn", true,
                "account", Map.of("userId", "compat-account", "nickname", "Compatibility")
            );
            Map<String, Object> ornament = Map.of(
                "id", "achievement-ornament-gap-runner",
                "achievementId", "gap-runner",
                "name", "Gap Runner Ornament",
                "accent", "#f1c965",
                "equippedAt", 1712345678000L
            );

            CommunityService service = new CommunityService(config);
            require(SimpleJson.asBoolean(service.state("netease", "NetEase", account).get("ok"), false),
                "baseline community registration failed");

            Map<String, Object> updated = service.updateProfile(
                "netease", "NetEase", account, "compatibility probe", ornament
            );
            require(SimpleJson.asBoolean(updated.get("ok"), false),
                "legacy-server profile fallback did not succeed: " + updated);
            require(profileBodies.size() == 2,
                "profile fallback performed " + profileBodies.size() + " requests instead of two");
            require(profileBodies.get(0).contains("\"avatarOrnament\""),
                "first profile request did not carry the optional ornament");
            require(!profileBodies.get(1).contains("\"avatarOrnament\""),
                "fallback profile request still carried the unsupported ornament");
            require("gap-runner".equals(ornamentId(updated)),
                "fallback response discarded the locally equipped ornament");
            require(postIdempotencyKeys.stream().allMatch(key -> !key.isBlank()),
                "community POST requests did not carry an Idempotency-Key: " + postIdempotencyKeys);
            require(postIdempotencyKeys.stream().distinct().count() == postIdempotencyKeys.size(),
                "separate community POST operations reused an Idempotency-Key: " + postIdempotencyKeys);

            int registerCountBeforeRefresh = registerBodies.size();
            Map<String, Object> refreshed = service.state("netease", "NetEase", account);
            require(SimpleJson.asBoolean(refreshed.get("ok"), false),
                "community state failed after learning the legacy schema");
            require("gap-runner".equals(ornamentId(refreshed)),
                "community refresh discarded the locally equipped ornament");
            require(registerBodies.size() == registerCountBeforeRefresh + 1,
                "known legacy schema retried register unexpectedly: " + registerBodies.size());
            require(!registerBodies.get(registerBodies.size() - 1).contains("\"avatarOrnament\""),
                "known legacy schema sent the unsupported ornament again");

            Map<String, Object> bioOnlyUpdated = service.updateProfile(
                "netease", "NetEase", account, "bio-only update after fallback"
            );
            require(SimpleJson.asBoolean(bioOnlyUpdated.get("ok"), false),
                "legacy-server bio-only profile update failed: " + bioOnlyUpdated);
            Map<String, Object> stateAfterBioOnlyUpdate = service.state("netease", "NetEase", account);
            require("gap-runner".equals(ornamentId(stateAfterBioOnlyUpdate)),
                "bio-only update discarded the locally equipped ornament: " + stateAfterBioOnlyUpdate);

            CommunityService recreatedService = new CommunityService(config);
            Map<String, Object> recreatedState = recreatedService.state("netease", "NetEase", account);
            require(SimpleJson.asBoolean(recreatedState.get("ok"), false),
                "recreated service failed to restore account state: " + recreatedState);
            require("gap-runner".equals(ornamentId(recreatedState)),
                "recreated service did not restore the durable local ornament: " + recreatedState);

            Map<String, Object> otherAccount = Map.of(
                "loggedIn", true,
                "account", Map.of("userId", "compat-account-other", "nickname", "Compatibility Other")
            );
            Map<String, Object> otherState = service.state("netease", "NetEase", otherAccount);
            require(SimpleJson.asBoolean(otherState.get("ok"), false),
                "second account community registration failed: " + otherState);
            require(ornamentId(otherState).isBlank(),
                "account A ornament leaked into account B state: " + otherState);
            Map<String, Object> otherProviderState = service.state("qishui", "Qishui", account);
            require(SimpleJson.asBoolean(otherProviderState.get("ok"), false),
                "same platform id on another provider failed registration: " + otherProviderState);
            require(ornamentId(otherProviderState).isBlank(),
                "NetEase ornament leaked into the same platform id on Qishui: " + otherProviderState);
            Map<String, Object> restoredAccountState = service.state("netease", "NetEase", account);
            require("gap-runner".equals(ornamentId(restoredAccountState)),
                "account A lost its own ornament after visiting another account");

            CommunityService concurrentService = new CommunityService(config);
            Map<String, Object> concurrentAccount = Map.of(
                "loggedIn", true,
                "account", Map.of("userId", "compat-account-concurrent", "nickname", "Concurrent")
            );
            int registerCountBeforeConcurrentCalls = registerBodies.size();
            ExecutorService callers = Executors.newFixedThreadPool(8);
            try {
                CountDownLatch ready = new CountDownLatch(8);
                CountDownLatch start = new CountDownLatch(1);
                List<Future<Map<String, Object>>> calls = new ArrayList<>();
                for (int index = 0; index < 8; index += 1) {
                    int callIndex = index;
                    calls.add(callers.submit(() -> {
                        ready.countDown();
                        start.await();
                        return concurrentService.updateProfile(
                            "netease", "NetEase", concurrentAccount, "concurrent bio " + callIndex
                        );
                    }));
                }
                ready.await();
                start.countDown();
                for (Future<Map<String, Object>> call : calls) {
                    Map<String, Object> response = call.get();
                    require(SimpleJson.asBoolean(response.get("ok"), false),
                        "concurrent profile update failed: " + response);
                }
            } finally {
                callers.shutdownNow();
            }
            require(registerBodies.size() == registerCountBeforeConcurrentCalls + 1,
                "same-account concurrent operations repeated registration: "
                    + (registerBodies.size() - registerCountBeforeConcurrentCalls));
            int registerCountBeforeCachedCall = registerBodies.size();
            Map<String, Object> cachedAccountUpdate = concurrentService.updateProfile(
                "netease", "NetEase", concurrentAccount, "cached registration bio"
            );
            require(SimpleJson.asBoolean(cachedAccountUpdate.get("ok"), false),
                "cached same-account profile update failed: " + cachedAccountUpdate);
            require(registerBodies.size() == registerCountBeforeCachedCall,
                "same-account short TTL did not reuse the registered profile");
            int profileCountBeforeLoggedOutCall = profileBodies.size();
            Map<String, Object> loggedOutCachedAccount = Map.of(
                "loggedIn", false,
                "account", Map.of("userId", "compat-account-concurrent", "nickname", "Concurrent")
            );
            Map<String, Object> loggedOutUpdate = concurrentService.updateProfile(
                "netease", "NetEase", loggedOutCachedAccount, "must not update"
            );
            require(!SimpleJson.asBoolean(loggedOutUpdate.get("ok"), false),
                "registration TTL bypassed the logged-out account boundary");
            require(profileBodies.size() == profileCountBeforeLoggedOutCall,
                "logged-out cached account still reached the profile endpoint");

            CommunityService freshService = new CommunityService(config);
            Map<String, Object> accountWithOrnament = Map.of(
                "loggedIn", true,
                "account", Map.of(
                    "userId", "compat-account-two",
                    "nickname", "Compatibility Two",
                    "avatarOrnament", ornament
                )
            );
            int registerCountBeforeFreshService = registerBodies.size();
            Map<String, Object> registered = freshService.state("netease", "NetEase", accountWithOrnament);
            require(SimpleJson.asBoolean(registered.get("ok"), false),
                "legacy-server register fallback did not succeed: " + registered);
            require(registerBodies.size() == registerCountBeforeFreshService + 2,
                "register fallback performed an unexpected number of requests: " + registerBodies.size());
            require(registerBodies.get(registerCountBeforeFreshService).contains("\"avatarOrnament\""),
                "first register request did not carry the optional ornament");
            require(!registerBodies.get(registerCountBeforeFreshService + 1).contains("\"avatarOrnament\""),
                "fallback register request still carried the unsupported ornament");
            require("gap-runner".equals(ornamentId(registered)),
                "register fallback discarded the locally equipped ornament");

            System.out.println("CommunityAvatarOrnamentCompatibilityProbe passed");
        } finally {
            server.stop(0);
            executor.shutdownNow();
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

    private static Map<String, Object> profilePayload(String username) {
        return Map.of(
            "ok", true,
            "profile", Map.of(
                "feId", "12345678",
                "username", username,
                "bio", "compatibility probe"
            ),
            "friends", List.of()
        );
    }

    private static String ornamentId(Map<String, Object> response) {
        Map<String, Object> profile = SimpleJson.asMap(response.get("profile"));
        Map<String, Object> ornament = SimpleJson.asMap(profile.get("avatarOrnament"));
        return SimpleJson.asString(ornament.get("achievementId"), "");
    }

    private static String readBody(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }

    private static String header(HttpExchange exchange, String name) {
        String value = exchange.getRequestHeaders().getFirst(name);
        return value == null ? "" : value.trim();
    }

    private static void send(HttpExchange exchange, int status, Map<String, Object> payload) throws IOException {
        byte[] body = SimpleJson.stringify(payload).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
