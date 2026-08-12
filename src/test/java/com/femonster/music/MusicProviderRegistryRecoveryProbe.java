package com.femonster.music;

import com.femonster.netease.NeteaseClient;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Exercises the provider-access seam used by /api/community/state. A managed
 * provider that disappears after its first successful request must be offered
 * another lazy-start opportunity on a later request without flooding starts.
 */
public final class MusicProviderRegistryRecoveryProbe {
    private MusicProviderRegistryRecoveryProbe() {
    }

    public static void main(String[] args) throws Exception {
        AtomicReference<HttpServer> server = new AtomicReference<>(startLoginServer(0));
        int port = server.get().getAddress().getPort();
        AtomicInteger starts = new AtomicInteger();

        MusicProviderRegistry registry = new MusicProviderRegistry(provider -> {
            int attempt = starts.incrementAndGet();
            if (attempt < 2 || server.get() != null) return;
            try {
                server.set(startLoginServer(port));
            } catch (IOException error) {
                throw new IllegalStateException(error);
            }
        }, new NeteaseClient("http://127.0.0.1:" + port));

        try {
            Map<String, Object> initial = registry.accountPayload("netease");
            require(Boolean.TRUE.equals(initial.get("loggedIn")), "initial provider login was not reachable");
            require(starts.get() == 1, "initial access did not request exactly one lazy start");

            server.getAndSet(null).stop(0);
            Map<String, Object> unavailable = registry.accountPayload("netease");
            require(Boolean.FALSE.equals(unavailable.get("loggedIn")), "stopped provider unexpectedly remained reachable");
            require(starts.get() == 1, "immediate retry flooded the lazy starter");

            Thread.sleep(1_150L);
            Map<String, Object> recovered = registry.accountPayload("netease");
            require(Boolean.TRUE.equals(recovered.get("loggedIn")), "later access did not recover the stopped provider");
            require(starts.get() == 2, "provider starter was not re-armed after the recovery interval");

            System.out.println("MusicProviderRegistryRecoveryProbe passed: starts=" + starts.get());
        } finally {
            HttpServer active = server.getAndSet(null);
            if (active != null) active.stop(0);
        }
    }

    private static HttpServer startLoginServer(int port) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/login/status", MusicProviderRegistryRecoveryProbe::sendLogin);
        server.start();
        return server;
    }

    private static void sendLogin(HttpExchange exchange) throws IOException {
        byte[] body = ("{\"data\":{\"code\":200,\"profile\":{"
            + "\"userId\":\"community-recovery-user\","
            + "\"nickname\":\"Recovery User\","
            + "\"avatarUrl\":\"\",\"vipType\":0}}}")
            .getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
