package com.femonster.music;

import com.femonster.netease.NeteaseClient;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

public final class NeteasePlaybackRecoveryProbe {
    public static void main(String[] args) throws Exception {
        AtomicInteger count = new AtomicInteger();
        AtomicInteger mode = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/song/url/v1", exchange -> {
            int attempt = count.incrementAndGet();
            int status = mode.get() == 1 ? 403 : mode.get() == 3 ? 429 : mode.get() == 4 || (mode.get() == 0 && attempt == 1) ? 503 : 200;
            String body = status != 200 ? "{\"code\":" + status + ",\"message\":\"fixture response\"}"
                : mode.get() == 2 ? "{\"code\":200,\"data\":[{\"url\":null}]}"
                : "{\"code\":200,\"data\":[{\"url\":\"https://audio.example/fresh.mp3\"}]}";
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
        });
        server.start();
        try {
            NeteaseClient client = new NeteaseClient("http://127.0.0.1:" + server.getAddress().getPort());
            Map<String,Object> recovered = client.songUrlPayload("fixture", "hires");
            require(Boolean.TRUE.equals(recovered.get("playable")), "temporary 503 was treated as permanent unavailability");
            require(count.get() == 2, "temporary failure needs exactly one fresh attempt");
            for (int denied : new int[] { 1, 2, 3 }) {
                count.set(0); mode.set(denied);
                require(Boolean.FALSE.equals(client.songUrlPayload("fixture", "hires").get("playable")), "restriction unexpectedly bypassed");
                require(count.get() == 1, "authorization, missing entitlement, and rate limits must not be retried");
            }
            count.set(0); mode.set(4);
            Map<String,Object> failed = client.songUrlPayload("fixture", "hires");
            require(Boolean.FALSE.equals(failed.get("playable")) && count.get() == 2, "persistent outage must stop after two attempts");
            require(!String.valueOf(failed.getOrDefault("error", "")).isBlank(), "network failure needs a useful error instead of song unavailable");
            System.out.println("NeteasePlaybackRecoveryProbe passed: one transient retry, restrictions respected, bounded outage");
        } finally { server.stop(0); }
    }
    static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
}
