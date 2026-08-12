package com.femonster.core;

import com.femonster.community.CommunityModule;
import com.femonster.community.CommunityRequest;
import com.femonster.community.CommunitySignature;
import com.sun.net.httpserver.HttpServer;

import java.net.InetSocketAddress;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

public final class CommunityEventSignatureProbe {
    private CommunityEventSignatureProbe() {
    }

    public static final class SigningModule implements CommunityModule {
        private static final AtomicInteger SIGNATURES = new AtomicInteger();

        @Override
        public boolean verifyIntegrity() {
            return true;
        }

        @Override
        public CommunitySignature sign(CommunityRequest request) {
            require("GET".equals(request.method()), "event signature used a non-GET method");
            require("/api/community/events".equals(request.path()), "event signature included its query string");
            require(request.body().isEmpty(), "event signature used a non-empty body");
            int sequence = SIGNATURES.incrementAndGet();
            return CommunitySignature.of(
                "fixture-app",
                String.valueOf(System.currentTimeMillis()),
                "fixture-nonce-" + sequence,
                "fixture-signature-" + sequence
            );
        }
    }

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-community-event-signature-");
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var executor = Executors.newCachedThreadPool();
        List<String> nonces = new ArrayList<>();
        server.createContext("/api/community/events", exchange -> {
            synchronized (nonces) {
                nonces.add(exchange.getRequestHeaders().getFirst(CommunitySignature.NONCE_HEADER));
            }
            byte[] body = "event: community-ready\ndata: {\"ok\":true}\n\n".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.setExecutor(executor);
        server.start();
        try {
            Path config = root.resolve("community-server.txt");
            Files.writeString(
                config,
                "http://127.0.0.1:" + server.getAddress().getPort(),
                StandardCharsets.UTF_8
            );
            CommunityModuleBridge bridge = new CommunityModuleBridge(null);
            CommunityService service = new CommunityService(config, null, bridge);
            for (int attempt = 0; attempt < 2; attempt += 1) {
                HttpResponse<java.io.InputStream> response = service.eventStream("FE-fixture", String.valueOf(attempt));
                require(response.statusCode() == 200, "event stream returned " + response.statusCode());
                try (var input = response.body()) {
                    input.readAllBytes();
                }
            }
            require(nonces.size() == 2, "expected two signed event requests, got " + nonces.size());
            require(nonces.get(0) != null && nonces.get(1) != null, "event request was unsigned");
            require(!nonces.get(0).equals(nonces.get(1)), "event reconnect reused its signature nonce");
            require(SigningModule.SIGNATURES.get() == 2, "unexpected signature count");
            System.out.println("CommunityEventSignatureProbe passed: nonces=" + nonces);
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

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
