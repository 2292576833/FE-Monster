package com.femonster.core;

import com.femonster.json.SimpleJson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.AclFileAttributeView;
import java.nio.file.attribute.PosixFilePermission;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class ClientAiGatewayProbe {
    private ClientAiGatewayProbe() {}

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-client-ai-gateway-");
        ExecutorService httpExecutor = Executors.newCachedThreadPool();
        ExecutorService probeExecutor = Executors.newSingleThreadExecutor();
        HttpServer trusted = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        HttpServer hostile = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        trusted.setExecutor(httpExecutor);
        hostile.setExecutor(httpExecutor);

        AtomicInteger trustedHits = new AtomicInteger();
        AtomicInteger hostileHits = new AtomicInteger();
        AtomicReference<String> authorization = new AtomicReference<>("");
        AtomicReference<Map<String, Object>> lastBody = new AtomicReference<>(Map.of());
        CountDownLatch slowStarted = new CountDownLatch(1);
        CountDownLatch slowBodyStarted = new CountDownLatch(1);

        hostile.createContext("/", exchange -> {
            hostileHits.incrementAndGet();
            sendJson(exchange, 200, Map.of("unexpected", true));
        });
        trusted.createContext("/v1/chat/completions", exchange -> {
            trustedHits.incrementAndGet();
            authorization.set(header(exchange, "Authorization"));
            Map<String, Object> body = SimpleJson.parseObjectStrict(readBody(exchange));
            lastBody.set(body);
            String scenario = SimpleJson.asString(body.get("scenario"), "");
            if ("redirect".equals(scenario)) {
                exchange.getResponseHeaders().set(
                    "Location",
                    "http://127.0.0.1:" + hostile.getAddress().getPort() + "/steal"
                );
                exchange.sendResponseHeaders(307, -1);
                exchange.close();
                return;
            }
            if ("secret-error".equals(scenario)) {
                sendJson(exchange, 401, Map.of("error", "Bearer sk-fixture must never escape"));
                return;
            }
            if ("slow".equals(scenario)) {
                slowStarted.countDown();
                try { Thread.sleep(5_000); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            }
            if ("slow-body".equals(scenario)) {
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, 0);
                exchange.getResponseBody().write('{');
                exchange.getResponseBody().flush();
                slowBodyStarted.countDown();
                try { Thread.sleep(5_000); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
                try {
                    exchange.getResponseBody().write("\"choices\":[]}".getBytes(StandardCharsets.UTF_8));
                    exchange.close();
                } catch (IOException ignored) {}
                return;
            }
            if (SimpleJson.asBoolean(body.get("stream"), false)) {
                byte[] sse = (
                    "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n" +
                    "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n" +
                    "data: {\"choices\":[{\"delta\":{\"content\":\"\\n  code\"}}]}\n\n" +
                    "data: [DONE]\n\n"
                ).getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
                exchange.sendResponseHeaders(200, sse.length);
                exchange.getResponseBody().write(sse);
                exchange.close();
                return;
            }
            sendJson(exchange, 200, Map.of(
                "choices", List.of(Map.of("message", Map.of("role", "assistant", "content", "OK")))
            ));
        });
        trusted.createContext("/v1/audio/speech", exchange -> {
            trustedHits.incrementAndGet();
            authorization.set(header(exchange, "Authorization"));
            Map<String, Object> body = SimpleJson.parseObjectStrict(readBody(exchange));
            lastBody.set(body);
            if (SimpleJson.asBoolean(body.get("wrongMime"), false)) {
                sendJson(exchange, 200, Map.of("error", "not audio"));
                return;
            }
            byte[] audio = new byte[]{0x49, 0x44, 0x33, 1, 2, 3};
            exchange.getResponseHeaders().set("Content-Type", "audio/mpeg");
            exchange.sendResponseHeaders(200, audio.length);
            exchange.getResponseBody().write(audio);
            exchange.close();
        });

        trusted.start();
        hostile.start();
        ClientAiGateway gateway = null;
        try {
            String base = "http://127.0.0.1:" + trusted.getAddress().getPort() + "/v1";
            Path dataDir = root.resolve("data").resolve("client-ai");
            gateway = new ClientAiGateway(dataDir);

            Map<String, Object> fresh = gateway.snapshot();
            require("missing".equals(fresh.get("configState")), "fresh state must be reported as missing");
            require(!SimpleJson.stringify(fresh).contains("\"apiKey\":"), "fresh snapshot exposes apiKey");

            gateway.configure(configPatch(
                "custom", "custom",
                provider("custom", base, "local-model", null, null, null),
                cloudTtsDraft()
            ));
            require(Boolean.FALSE.equals(map(gateway.snapshot(), "model").get("hasApiKey")),
                "keyless loopback was not accepted");
            int beforeEarlyCancel = trustedHits.get();
            require(gateway.cancel("cancel-before-execute"), "early cancellation was not accepted");
            ClientAiGateway earlyCancelGateway = gateway;
            expectCode(() -> earlyCancelGateway.execute(
                ClientAiGateway.Kind.CHAT,
                Map.of("stream", false, "messages", List.of()),
                "cancel-before-execute"
            ), "client_ai_cancelled");
            require(trustedHits.get() == beforeEarlyCancel,
                "an already cancelled request reached the upstream service");
            int beforeChat = trustedHits.get();
            try (ClientAiGateway.UpstreamResponse response = gateway.execute(
                ClientAiGateway.Kind.CHAT,
                Map.of("stream", false, "messages", List.of(Map.of("role", "user", "content", "hi"))),
                "probe-chat"
            )) {
                require(response.status() == 200 && !response.streaming(), "keyless chat failed");
            }
            require(trustedHits.get() == beforeChat + 1, "trusted endpoint did not receive keyless chat");
            require(authorization.get().isEmpty(), "keyless loopback sent Authorization");
            require("local-model".equals(lastBody.get().get("model")), "stored model did not own request");

            ClientAiGateway firstGateway = gateway;
            int beforeProtected = trustedHits.get();
            expectCode(() -> firstGateway.execute(
                ClientAiGateway.Kind.CHAT,
                Map.of("baseUrl", "http://127.0.0.1:" + hostile.getAddress().getPort(), "messages", List.of()),
                "protected-field"
            ), "client_ai_bad_request");
            require(trustedHits.get() == beforeProtected && hostileHits.get() == 0,
                "browser-supplied routing field reached a server");

            try (ClientAiGateway.UpstreamResponse response = gateway.execute(
                ClientAiGateway.Kind.CHAT,
                Map.of("stream", true, "model", "evil-model", "messages", List.of()),
                "probe-stream"
            )) {
                require(response.streaming(), "SSE response was buffered");
                String sse = new String(response.stream().readAllBytes(), StandardCharsets.UTF_8);
                require(sse.contains("\"content\":\" world\""), "leading space was altered");
                require(sse.contains("\"content\":\"\\n  code\""), "newline/indentation was altered");
                require(sse.endsWith("data: [DONE]\n\n"), "SSE terminal event was altered");
            }
            require("local-model".equals(lastBody.get().get("model")), "payload model overrode stored model");

            // The browser deliberately sends a best-effort cancel after it has
            // consumed [DONE], so every physical tool round uses its own ID.
            // Cleanup of r1 must not poison the distinct r2 continuation.
            int beforePetToolRound = trustedHits.get();
            try (ClientAiGateway.UpstreamResponse response = gateway.execute(
                ClientAiGateway.Kind.CHAT,
                Map.of("stream", true, "messages", List.of()),
                "pet-tool-round:r1"
            )) {
                require(response.stream().readAllBytes().length > 0, "pet tool round returned no SSE bytes");
            }
            require(gateway.cancel("pet-tool-round:r1"), "completed pet tool round cleanup was rejected");
            try (ClientAiGateway.UpstreamResponse response = gateway.execute(
                ClientAiGateway.Kind.CHAT,
                Map.of("stream", true, "messages", List.of(
                    Map.of("role", "tool", "tool_call_id", "fixture-call", "content", "{}")
                )),
                "pet-tool-round:r2"
            )) {
                require(response.stream().readAllBytes().length > 0,
                    "pet tool follow-up returned no SSE bytes");
            }
            require(trustedHits.get() == beforePetToolRound + 2,
                "completed request cleanup cancelled the pet tool follow-up");

            gateway.configure(configPatch(
                "custom", "custom",
                provider("custom", base, "local-model", "sk-fixture", null, null),
                cloudTtsDraft()
            ));
            Map<String, Object> keyed = gateway.snapshot();
            require(Boolean.TRUE.equals(map(keyed, "model").get("hasApiKey")), "key was not stored");
            require("ture".equals(map(keyed, "model").get("keyLast4")), "last4 is wrong");
            require(!SimpleJson.stringify(keyed).contains("sk-fixture"), "snapshot leaked the key");
            Path stateFile = dataDir.resolve(ClientAiGateway.STATE_FILE_NAME);
            require(Files.readString(stateFile).contains("sk-fixture"), "state did not persist key");
            assertOwnerOnly(stateFile);

            gateway.close();
            gateway = new ClientAiGateway(dataDir);
            ClientAiGateway activeGateway = gateway;
            gateway.configure(Map.of("model", Map.of("model", "local-model-v2")));
            try (ClientAiGateway.UpstreamResponse ignored = gateway.execute(
                ClientAiGateway.Kind.CHAT,
                Map.of("stream", false, "messages", List.of()),
                "probe-restart"
            )) {}
            require("Bearer sk-fixture".equals(authorization.get()), "restart/model edit lost key");
            require("local-model-v2".equals(lastBody.get().get("model")), "model edit was not persisted");

            long revisionBeforeInvalidKey = ((Number) gateway.snapshot().get("revision")).longValue();
            expectCode(() -> activeGateway.configure(Map.of("model", Map.of("apiKey", "bad\nkey"))),
                "client_ai_bad_request");
            require(((Number) gateway.snapshot().get("revision")).longValue() == revisionBeforeInvalidKey,
                "invalid key mutated state");

            gateway.configure(Map.of("model", Map.of(
                "provider", "other",
                "baseUrl", "http://127.0.0.1:" + hostile.getAddress().getPort() + "/v1",
                "model", "other-model"
            )));
            require(Boolean.FALSE.equals(map(gateway.snapshot(), "model").get("hasApiKey")),
                "origin/provider change reused old key");
            gateway.configure(configPatch(
                "custom", "custom",
                provider("custom", base, "local-model", "sk-fixture", null, null),
                cloudTtsDraft()
            ));

            expectCode(() -> activeGateway.configure(Map.of("model", Map.of(
                "baseUrl", "http://remote.example/v1"))), "client_ai_bad_request");
            expectCode(() -> activeGateway.configure(Map.of("model", Map.of(
                "baseUrl", "http://rebind.test:11434/v1"))), "client_ai_bad_request");
            expectCode(() -> activeGateway.configure(Map.of("model", Map.of(
                "baseUrl", "http://127.0.0.1/v1"))), "client_ai_bad_request");
            expectCode(() -> activeGateway.configure(Map.of("model", Map.of(
                "baseUrl", "https://user:pass@example.com/v1"))), "client_ai_bad_request");
            expectCode(() -> activeGateway.configure(Map.of("model", Map.of(
                "baseUrl", "https://example.com/v1?x=1"))), "client_ai_bad_request");
            expectCode(() -> activeGateway.configure(Map.of("model", Map.of(
                "baseUrl", "https://0.0.0.0/v1"))), "client_ai_bad_request");
            expectCode(() -> activeGateway.configure(Map.of("model", Map.of(
                "baseUrl", "https://100.64.0.1/v1"))), "client_ai_bad_request");
            expectCode(() -> activeGateway.configure(Map.of("model", Map.of(
                "baseUrl", "https://[fc00::1]/v1"))), "client_ai_bad_request");

            gateway.configure(Map.of("model", Map.of(
                "provider", "remote",
                "baseUrl", "https://example.com/v1",
                "model", "remote-model",
                "clearApiKey", true
            )));
            require(Boolean.FALSE.equals(map(gateway.snapshot(), "model").get("ready")),
                "remote keyless draft was incorrectly ready");
            expectCode(() -> activeGateway.execute(
                ClientAiGateway.Kind.CHAT, Map.of("messages", List.of()), "remote-keyless"),
                "client_ai_not_ready");

            gateway.configure(configPatch(
                "custom", "custom",
                provider("custom", base, "local-model", "sk-fixture", null, null),
                cloudTtsDraft()
            ));
            int hostileBeforeRedirect = hostileHits.get();
            expectCode(() -> activeGateway.execute(
                ClientAiGateway.Kind.CHAT,
                Map.of("messages", List.of(), "scenario", "redirect"),
                "redirect"
            ), "client_ai_upstream_error");
            require(hostileHits.get() == hostileBeforeRedirect, "redirect forwarded Authorization to target");

            try {
                gateway.execute(
                    ClientAiGateway.Kind.CHAT,
                    Map.of("messages", List.of(), "scenario", "secret-error"),
                    "secret-error"
                );
                throw new AssertionError("secret error should fail");
            } catch (ClientAiException error) {
                require("client_ai_auth_failed".equals(error.errorCode()), "wrong auth error code");
                require(!error.getMessage().contains("sk-fixture"), "raw secret escaped in error");
            }

            String huge = "x".repeat(2 * 1024 * 1024 + 1);
            expectCode(() -> activeGateway.execute(
                ClientAiGateway.Kind.CHAT,
                Map.of("messages", List.of(Map.of("role", "user", "content", huge))),
                "too-large"
            ), "client_ai_too_large");

            ClientAiGateway cancelGateway = gateway;
            Future<String> cancelled = probeExecutor.submit(() -> {
                try {
                    cancelGateway.execute(
                        ClientAiGateway.Kind.CHAT,
                        Map.of("messages", List.of(), "scenario", "slow"),
                        "cancel-me"
                    );
                    return "unexpected-success";
                } catch (ClientAiException error) {
                    return error.errorCode();
                }
            });
            require(slowStarted.await(2, TimeUnit.SECONDS), "slow upstream did not start");
            require(gateway.cancel("cancel-me"), "active request was not cancelled");
            require("client_ai_cancelled".equals(cancelled.get(2, TimeUnit.SECONDS)),
                "cancel did not terminate the waiting request");

            Future<String> cancelledBody = probeExecutor.submit(() -> {
                try {
                    cancelGateway.execute(
                        ClientAiGateway.Kind.CHAT,
                        Map.of("messages", List.of(), "scenario", "slow-body"),
                        "cancel-body"
                    );
                    return "unexpected-success";
                } catch (ClientAiException error) {
                    return error.errorCode();
                }
            });
            require(slowBodyStarted.await(2, TimeUnit.SECONDS), "slow response body did not start");
            Thread.sleep(150);
            require(gateway.cancel("cancel-body"), "response body was not cancellable after headers");
            require("client_ai_cancelled".equals(cancelledBody.get(2, TimeUnit.SECONDS)),
                "closing a slow response body did not report cancellation");

            try (var files = Files.list(dataDir)) {
                require(files.noneMatch(path -> path.getFileName().toString().contains(".tmp-")),
                    "atomic state temp file was left behind");
            }

            gateway.close();
            gateway = null;
            Files.writeString(stateFile, "{broken", StandardCharsets.UTF_8);
            try (ClientAiGateway corrupt = new ClientAiGateway(dataDir)) {
                require("invalid".equals(corrupt.snapshot().get("configState")),
                    "corrupt state was silently treated as defaults");
                expectCode(() -> corrupt.execute(
                    ClientAiGateway.Kind.CHAT, Map.of("messages", List.of()), "corrupt"),
                    "client_ai_config_invalid");
            }

            System.out.println("ClientAiGatewayProbe passed");
        } finally {
            if (gateway != null) gateway.close();
            trusted.stop(0);
            hostile.stop(0);
            httpExecutor.shutdownNow();
            probeExecutor.shutdownNow();
            httpExecutor.awaitTermination(2, TimeUnit.SECONDS);
            probeExecutor.awaitTermination(2, TimeUnit.SECONDS);
            try (var paths = Files.walk(root)) {
                paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                    try { Files.deleteIfExists(path); } catch (IOException ignored) {}
                });
            }
        }
    }

    private static Map<String, Object> configPatch(
        String modelMode,
        String ttsMode,
        Map<String, Object> model,
        Map<String, Object> tts
    ) {
        LinkedHashMap<String, Object> root = new LinkedHashMap<>();
        root.put("modelMode", modelMode);
        root.put("ttsMode", ttsMode);
        root.put("model", model);
        root.put("tts", tts);
        return root;
    }

    private static Map<String, Object> provider(
        String provider,
        String baseUrl,
        String model,
        String apiKey,
        Boolean clearApiKey,
        String voice
    ) {
        LinkedHashMap<String, Object> root = new LinkedHashMap<>();
        root.put("provider", provider);
        root.put("baseUrl", baseUrl);
        root.put("model", model);
        if (apiKey != null) root.put("apiKey", apiKey);
        if (clearApiKey != null) root.put("clearApiKey", clearApiKey);
        if (voice != null) root.put("voice", voice);
        return root;
    }

    private static Map<String, Object> cloudTtsDraft() {
        return provider(
            "openai-tts",
            "https://api.openai.com/v1",
            "gpt-4o-mini-tts",
            null,
            null,
            "alloy"
        );
    }

    private static void assertOwnerOnly(Path file) throws IOException {
        if (FileSystems.getDefault().supportedFileAttributeViews().contains("posix")) {
            Set<PosixFilePermission> permissions = Files.getPosixFilePermissions(file);
            require(!permissions.contains(PosixFilePermission.GROUP_READ)
                    && !permissions.contains(PosixFilePermission.OTHERS_READ),
                "state file is readable by group/others");
            return;
        }
        AclFileAttributeView view = Files.getFileAttributeView(file, AclFileAttributeView.class);
        require(view != null && !view.getAcl().isEmpty(), "state file has no inspectable ACL");
        String owner = Files.getOwner(file).getName();
        require(view.getAcl().stream().allMatch(entry -> entry.principal().getName().equalsIgnoreCase(owner)),
            "state ACL grants access to a non-owner principal: " + view.getAcl());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Map<String, Object> root, String key) {
        return (Map<String, Object>) root.get(key);
    }

    private static String header(HttpExchange exchange, String name) {
        String value = exchange.getRequestHeaders().getFirst(name);
        return value == null ? "" : value;
    }

    private static String readBody(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }

    private static void sendJson(HttpExchange exchange, int status, Object body) throws IOException {
        byte[] bytes = SimpleJson.stringify(body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static void expectCode(Runnable action, String code) {
        try {
            action.run();
            throw new AssertionError("expected failure " + code);
        } catch (ClientAiException error) {
            require(code.equals(error.errorCode()),
                "expected " + code + " but got " + error.errorCode() + ": " + error.getMessage());
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
