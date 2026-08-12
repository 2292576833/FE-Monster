package com.femonster.core;

import com.femonster.music.MusicProviderRegistry;
import com.femonster.netease.NeteaseClient;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/** Verifies that an empty authenticated NetEase library is distinct from a public fallback. */
public final class NeteaseUserLibraryContractProbe {
    private NeteaseUserLibraryContractProbe() {
    }

    public static void main(String[] args) throws Exception {
        AtomicBoolean authenticatedLibrary = new AtomicBoolean(true);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/login/status", exchange -> send(exchange,
            "{\"data\":{\"code\":200,\"profile\":{\"userId\":\"16301\",\"nickname\":\"Empty Library User\"}}}"
        ));
        server.createContext("/user/playlist", exchange -> send(exchange,
            authenticatedLibrary.get()
                ? "{\"code\":200,\"playlist\":[]}"
                : "{\"ok\":true,\"result\":[{\"id\":\"public-chart\"}]}"
        ));
        server.start();

        Path directory = Files.createTempDirectory("fe-monster-netease-library-contract-");
        try {
            NeteaseClient client = new NeteaseClient(
                "http://127.0.0.1:" + server.getAddress().getPort(),
                directory.resolve("netease-auth.json")
            );
            MusicProviderRegistry registry = new MusicProviderRegistry(client);
            Map<String, Object> emptyLibrary = registry.synchronizeBrowserSession(
                "netease",
                Map.of("MUSIC_U", "verified-cookie")
            );
            require(Boolean.TRUE.equals(emptyLibrary.get("ready")),
                "verified NetEase account with an empty library did not complete login");

            authenticatedLibrary.set(false);
            Map<String, Object> publicFallback = registry.synchronizeBrowserSession(
                "netease",
                Map.of("MUSIC_U", "verified-cookie")
            );
            require(!Boolean.TRUE.equals(publicFallback.get("ready")),
                "public NetEase fallback was accepted as an authenticated user library");
            require(!Boolean.TRUE.equals(publicFallback.get("playlistsReady")),
                "public NetEase fallback exposed playlist readiness");
            System.out.println("NeteaseUserLibraryContractProbe passed");
        } finally {
            server.stop(0);
            Files.deleteIfExists(directory.resolve("netease-auth.json.tmp"));
            Files.deleteIfExists(directory.resolve("netease-auth.json"));
            Files.deleteIfExists(directory);
        }
    }

    private static void send(HttpExchange exchange, String json) throws IOException {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}
