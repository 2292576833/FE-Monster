package com.femonster.core;

import com.sun.net.httpserver.HttpServer;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

public final class CommunityHealthCacheProbe {
    private CommunityHealthCacheProbe() {
    }

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-community-health-");
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        ExecutorService serverExecutor = Executors.newSingleThreadExecutor();
        AtomicInteger healthRequests = new AtomicInteger();
        server.createContext("/health", exchange -> {
            healthRequests.incrementAndGet();
            byte[] body = "{\"ok\":true,\"service\":\"fe-monster-community\"}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.setExecutor(serverExecutor);
        server.start();
        try {
            Path config = root.resolve("community-server.txt");
            Files.writeString(config, "http://127.0.0.1:" + server.getAddress().getPort(), StandardCharsets.UTF_8);
            CommunityService service = new CommunityService(config);
            Map<String, Object> loggedOut = Map.of("loggedIn", false);
            service.state("netease", "NetEase", loggedOut);
            service.state("netease", "NetEase", loggedOut);
            require(healthRequests.get() == 1,
                "back-to-back community state requests performed " + healthRequests.get() + " health checks");
            System.out.println("CommunityHealthCacheProbe passed: healthRequests=" + healthRequests.get());
        } finally {
            server.stop(0);
            serverExecutor.shutdownNow();
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
