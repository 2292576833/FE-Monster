package com.femonster.core;

import com.femonster.ai.AiProviderCatalog;
import com.femonster.json.SimpleJson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Process fixture for the browser-side pet -> client service -> Java gateway
 * regression.  It intentionally behaves like a small OpenAI-compatible model
 * and keeps all traffic on random loopback ports.
 */
public final class ClientAiPetIntegrationFixture {
    private ClientAiPetIntegrationFixture() {}

    public static void main(String[] args) throws Exception {
        Path dataDir = args.length > 0
            ? Path.of(args[0]).toAbsolutePath().normalize()
            : Files.createTempDirectory("fe-client-ai-pet-");
        Files.createDirectories(dataDir);

        ExecutorService executor = Executors.newCachedThreadPool();
        HttpServer upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        HttpServer bridge = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        upstream.setExecutor(executor);
        bridge.setExecutor(executor);

        ConcurrentHashMap<String, AtomicInteger> upstreamHits = new ConcurrentHashMap<>();
        List<String> bridgeRequestIds = java.util.Collections.synchronizedList(new ArrayList<>());

        upstream.createContext("/v1/chat/completions", exchange -> {
            try {
                Map<String, Object> body = SimpleJson.parseObjectStrict(readBody(exchange));
                String prompt = lastUserMessage(body);
                int attempt = upstreamHits.computeIfAbsent(prompt, ignored -> new AtomicInteger()).incrementAndGet();
                int transientStatus = prompt.contains("状态408") ? 408
                    : prompt.contains("状态425") ? 425
                    : prompt.contains("状态429") ? 429
                    : prompt.contains("瞬时重试") ? 503
                    : 0;
                if (transientStatus > 0 && attempt == 1) {
                    sendJson(exchange, transientStatus, Map.of("error", Map.of("message", "fixture transient")));
                    return;
                }
                if (transientStatus > 0) {
                    sendSse(exchange,
                        "data: {\"choices\":[{\"delta\":{\"content\":\"瞬时重试成功\"}}]}\n\n" +
                        "data: [DONE]\n\n");
                    return;
                }
                if (prompt.contains("网络断开") && attempt == 1) {
                    exchange.close();
                    return;
                }
                if (prompt.contains("网络断开")) {
                    sendSse(exchange,
                        "data: {\"choices\":[{\"delta\":{\"content\":\"网络重试成功\"}}]}\n\n" +
                        "data: [DONE]\n\n");
                    return;
                }
                if (prompt.contains("首包断流") && attempt == 1) {
                    // Headers arrive, but the upstream closes before the first token or [DONE].
                    // The browser will notify the Java gateway to cancel this physical request ID.
                    sendSse(exchange, "");
                    return;
                }
                if (prompt.contains("首包断流")) {
                    sendSse(exchange,
                        "data: {\"choices\":[{\"delta\":{\"content\":\"断流重试成功\"}}]}\n\n" +
                        "data: [DONE]\n\n");
                    return;
                }
                if (prompt.contains("鉴权失败")) {
                    sendJson(exchange, 401, Map.of("error", Map.of("message", "fixture auth")));
                    return;
                }
                if (prompt.contains("禁止访问")) {
                    sendJson(exchange, 403, Map.of("error", Map.of("message", "fixture forbidden")));
                    return;
                }
                int rejectedStatus = prompt.contains("请求400") ? 400 : prompt.contains("请求422") ? 422 : 0;
                if (rejectedStatus > 0 && body.get("tools") instanceof List<?> tools && !tools.isEmpty()) {
                    sendJson(exchange, rejectedStatus, Map.of("error", Map.of("message", "fixture tools rejected")));
                    return;
                }
                if (rejectedStatus > 0) {
                    sendSse(exchange,
                        "data: {\"choices\":[{\"delta\":{\"content\":\"参数回退成功\"}}]}\n\n" +
                        "data: [DONE]\n\n");
                    return;
                }
                if (prompt.contains("部分输出")) {
                    sendSse(exchange,
                        "data: {\"choices\":[{\"delta\":{\"content\":\"已经收到一部分\"}}]}\n\n");
                    return;
                }
                if (prompt.contains("跨轮复用工具ID测试")) {
                    int toolResults = roleCount(body, "tool");
                    if (toolResults == 0) {
                        sendJson(exchange, 200, Map.of(
                            "choices", List.of(Map.of(
                                "message", Map.of(
                                    "content", "",
                                    "tool_calls", List.of(Map.of(
                                        "id", "reused-call-0",
                                        "type", "function",
                                        "function", Map.of(
                                            "name", "query_app_capabilities",
                                            "arguments", "{\"query\":\"playback.mode.set\"}"
                                        )
                                    ))
                                ),
                                "finish_reason", "tool_calls"
                            ))
                        ));
                        return;
                    }
                    if (toolResults == 1) {
                        sendJson(exchange, 200, Map.of(
                            "choices", List.of(Map.of(
                                "message", Map.of(
                                    "content", "",
                                    "tool_calls", List.of(Map.of(
                                        // Tool-call IDs are scoped to one assistant message. Some
                                        // OpenAI-compatible local runtimes restart numbering on every
                                        // completion, so this deliberately reuses the previous ID.
                                        "id", "reused-call-0",
                                        "type", "function",
                                        "function", Map.of(
                                            "name", "control_app",
                                            "arguments", "{\"command\":\"playback.mode.set\",\"arguments\":{\"mode\":\"reused-id-mode\"}}"
                                        )
                                    ))
                                ),
                                "finish_reason", "tool_calls"
                            ))
                        ));
                        return;
                    }
                    sendJson(exchange, 200, Map.of(
                        "choices", List.of(Map.of(
                            "message", Map.of("content", "跨轮复用ID续轮成功"),
                            "finish_reason", "stop"
                        ))
                    ));
                    return;
                }
                if (prompt.contains("特殊字符工具ID测试")) {
                    if (hasRole(body, "tool")) {
                        sendJson(exchange, 200, Map.of(
                            "choices", List.of(Map.of(
                                "message", Map.of("content", "特殊字符ID续轮成功"),
                                "finish_reason", "stop"
                            ))
                        ));
                        return;
                    }
                    sendJson(exchange, 200, Map.of(
                        "choices", List.of(Map.of(
                            "message", Map.of(
                                "content", "",
                                "tool_calls", List.of(Map.of(
                                    "id", "call/with space/中文",
                                    "type", "function",
                                    "function", Map.of(
                                        "name", "control_app",
                                        "arguments", "{\"command\":\"playback.mode.set\",\"arguments\":{\"mode\":\"special-id-mode\"}}"
                                    )
                                ))
                            ),
                            "finish_reason", "tool_calls"
                        ))
                    ));
                    return;
                }
                if (prompt.contains("大型批量参数测试")) {
                    if (hasRole(body, "tool")) {
                        sendJson(exchange, 200, Map.of(
                            "choices", List.of(Map.of(
                                "message", Map.of("content", "大型批量参数续轮成功"),
                                "finish_reason", "stop"
                            ))
                        ));
                        return;
                    }
                    List<Map<String, Object>> changes = new ArrayList<>();
                    for (int index = 0; index < 32; index += 1) {
                        changes.add(Map.of(
                            "key", "scene.fixture.parameter." + String.format("%02d", index) + "." + "x".repeat(76),
                            "value", (index + 1) / 100.0
                        ));
                    }
                    String argumentsJson = SimpleJson.stringify(Map.of(
                        "command", "app.parameters.batch.apply",
                        "arguments", Map.of("changes", changes)
                    ));
                    int argumentBytes = argumentsJson.getBytes(StandardCharsets.UTF_8).length;
                    if (argumentBytes <= 4_096 || argumentBytes > 12 * 1_024) {
                        throw new IllegalStateException("large batch fixture must stay inside the 4-12 KiB contract");
                    }
                    sendJson(exchange, 200, Map.of(
                        "choices", List.of(Map.of(
                            "message", Map.of(
                                "content", "",
                                "tool_calls", List.of(Map.of(
                                    "id", "large-batch-call",
                                    "type", "function",
                                    "function", Map.of(
                                        "name", "control_app",
                                        "arguments", argumentsJson
                                    )
                                ))
                            ),
                            "finish_reason", "tool_calls"
                        ))
                    ));
                    return;
                }
                if (prompt.contains("JSON命令执行测试")) {
                    if (hasRole(body, "tool")) {
                        sendJson(exchange, 200, Map.of(
                            "choices", List.of(Map.of(
                                "message", Map.of("content", "JSON命令执行完成"),
                                "finish_reason", "stop"
                            ))
                        ));
                        return;
                    }
                    sendJson(exchange, 200, Map.of(
                        "choices", List.of(Map.of(
                            "message", Map.of(
                                "content", "",
                                "tool_calls", List.of(Map.of(
                                    "id", "json-command-call",
                                    "type", "function",
                                    "function", Map.of(
                                        "name", "control_app",
                                        "arguments", "{\"command\":\"playback.mode.set\",\"arguments\":{\"mode\":\"spectrum\"}}"
                                    )
                                ))
                            ),
                            "finish_reason", "tool_calls"
                        ))
                    ));
                    return;
                }
                if (hasRole(body, "tool")) {
                    sendSse(exchange,
                        "data: {\"choices\":[{\"delta\":{\"content\":\"工具续轮成功\"}}]}\n\n" +
                        "data: [DONE]\n\n");
                    return;
                }
                if (body.get("tools") instanceof List<?> tools && !tools.isEmpty()) {
                    sendSse(exchange,
                        "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0," +
                        "\"id\":\"fixture-call\",\"function\":{\"name\":\"ai_providers_query\"," +
                        "\"arguments\":\"{}\"}}]}}]}\n\n" +
                        "data: [DONE]\n\n");
                    return;
                }
                sendSse(exchange,
                    "data: {\"choices\":[{\"delta\":{\"content\":\"瞬时重试成功\"}}]}\n\n" +
                    "data: [DONE]\n\n");
            } catch (Throwable error) {
                sendJson(exchange, 500, Map.of("error", "fixture failure"));
            }
        });
        upstream.start();

        ClientAiGateway gateway = new ClientAiGateway(dataDir);
        String upstreamBase = "http://127.0.0.1:" + upstream.getAddress().getPort() + "/v1";
        gateway.configure(Map.of(
            "modelMode", "custom",
            "ttsMode", "server",
            "model", Map.of(
                "provider", "custom-openai-compatible",
                "baseUrl", upstreamBase,
                "model", "fixture-model"
            )
        ));

        bridge.createContext("/", exchange -> {
            try {
                String path = exchange.getRequestURI().getPath();
                if ("/api/client-ai/config".equals(path) && "GET".equals(exchange.getRequestMethod())) {
                    sendJson(exchange, 200, gateway.snapshot());
                    return;
                }
                if ("/api/client-ai/providers".equals(path) && "GET".equals(exchange.getRequestMethod())) {
                    sendJson(exchange, 200, AiProviderCatalog.snapshot());
                    return;
                }
                if ("/api/client-ai/cancel".equals(path) && "POST".equals(exchange.getRequestMethod())) {
                    Map<String, Object> root = SimpleJson.parseObjectStrict(readBody(exchange));
                    String requestId = SimpleJson.asString(root.get("requestId"), "");
                    sendJson(exchange, 200, Map.of(
                        "ok", true,
                        "cancelled", gateway.cancel(requestId),
                        "requestId", requestId
                    ));
                    return;
                }
                if ("/api/client-ai/chat".equals(path) && "POST".equals(exchange.getRequestMethod())) {
                    Map<String, Object> root = SimpleJson.parseObjectStrict(readBody(exchange));
                    String requestId = SimpleJson.asString(root.get("requestId"), "");
                    bridgeRequestIds.add(requestId);
                    try (ClientAiGateway.UpstreamResponse response = gateway.execute(
                        ClientAiGateway.Kind.CHAT,
                        SimpleJson.asMap(root.get("payload")),
                        requestId
                    )) {
                        exchange.getResponseHeaders().set("Content-Type", response.contentType());
                        if (!response.streaming()) {
                            byte[] bytes = response.body();
                            exchange.sendResponseHeaders(response.status(), bytes.length);
                            exchange.getResponseBody().write(bytes);
                            exchange.close();
                            return;
                        }
                        exchange.sendResponseHeaders(response.status(), 0);
                        try (OutputStream output = exchange.getResponseBody()) {
                            response.stream().transferTo(output);
                        }
                    }
                    return;
                }
                if ("/stats".equals(path)) {
                    LinkedHashMap<String, Object> hits = new LinkedHashMap<>();
                    upstreamHits.forEach((key, value) -> hits.put(key, value.get()));
                    sendJson(exchange, 200, Map.of(
                        "upstreamHits", hits,
                        "requestIds", List.copyOf(bridgeRequestIds)
                    ));
                    return;
                }
                sendJson(exchange, 404, Map.of("error", "not found"));
            } catch (ClientAiException error) {
                sendJson(exchange, error.status(), Map.of(
                    "error", error.getMessage(),
                    "errorCode", error.errorCode()
                ));
            } catch (Throwable error) {
                sendJson(exchange, 500, Map.of("error", "bridge fixture failure"));
            }
        });
        bridge.start();

        try {
            System.out.println("READY:" + bridge.getAddress().getPort());
            System.out.flush();
            new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8)).readLine();
        } finally {
            gateway.close();
            bridge.stop(0);
            upstream.stop(0);
            executor.shutdownNow();
        }
    }

    private static boolean hasRole(Map<String, Object> body, String expected) {
        return roleCount(body, expected) > 0;
    }

    private static int roleCount(Map<String, Object> body, String expected) {
        Object raw = body.get("messages");
        if (!(raw instanceof List<?> messages)) return 0;
        int count = 0;
        for (Object item : messages) {
            if (item instanceof Map<?, ?> message && expected.equals(String.valueOf(message.get("role")))) count += 1;
        }
        return count;
    }

    private static String lastUserMessage(Map<String, Object> body) {
        Object raw = body.get("messages");
        if (!(raw instanceof List<?> messages)) return "";
        String result = "";
        for (Object item : messages) {
            if (!(item instanceof Map<?, ?> message)) continue;
            if ("user".equals(String.valueOf(message.get("role")))) {
                Object content = message.get("content");
                result = content == null ? "" : String.valueOf(content);
            }
        }
        return result;
    }

    private static String readBody(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }

    private static void sendSse(HttpExchange exchange, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static void sendJson(HttpExchange exchange, int status, Object body) throws IOException {
        byte[] bytes = SimpleJson.stringify(body).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
