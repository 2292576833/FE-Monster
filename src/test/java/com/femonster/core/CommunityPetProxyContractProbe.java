package com.femonster.core;

import com.femonster.json.SimpleJson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

public final class CommunityPetProxyContractProbe {
    private CommunityPetProxyContractProbe() {
    }

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-community-pet-proxy-");
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        AtomicReference<Map<String, Object>> chatBody = new AtomicReference<>(Map.of());
        AtomicReference<Map<String, Object>> narrationBody = new AtomicReference<>(Map.of());
        AtomicReference<Map<String, Object>> narrationCancelBody = new AtomicReference<>(Map.of());
        AtomicReference<Map<String, Object>> transcriptBody = new AtomicReference<>(Map.of());
        AtomicReference<Map<String, Object>> voiceChunkBody = new AtomicReference<>(Map.of());
        AtomicReference<Map<String, Object>> habitsBody = new AtomicReference<>(Map.of());
        AtomicReference<Map<String, Object>> cancelBody = new AtomicReference<>(Map.of());
        AtomicReference<Map<String, Object>> liveSttBody = new AtomicReference<>(Map.of());
        server.createContext("/health", exchange -> send(exchange, Map.of(
            "ok", true,
            "service", "fe-monster-community"
        )));
        server.createContext("/api/community/register", exchange -> send(exchange, Map.of(
            "ok", true,
            "profile", Map.of("feId", "12345678", "username", "proxy-probe"),
            "friends", List.of()
        )));
        server.createContext("/api/community/pet/chat", exchange -> {
            chatBody.set(SimpleJson.parseObject(readBody(exchange)));
            send(exchange, Map.of("ok", true));
        });
        server.createContext("/api/community/pet/narrate", exchange -> {
            narrationBody.set(SimpleJson.parseObject(readBody(exchange)));
            send(exchange, Map.of("ok", true, "requestId", "tour-request", "audioId", "pet-audio-tour"));
        });
        server.createContext("/api/community/pet/narrate/cancel", exchange -> {
            narrationCancelBody.set(SimpleJson.parseObject(readBody(exchange)));
            send(exchange, Map.of("ok", true, "requestId", "tour-request", "cancelled", true));
        });
        server.createContext("/api/community/pet/voice/transcript", exchange -> {
            transcriptBody.set(SimpleJson.parseObject(readBody(exchange)));
            send(exchange, Map.of("ok", true));
        });
        server.createContext("/api/community/pet/voice/chunk", exchange -> {
            voiceChunkBody.set(SimpleJson.parseObject(readBody(exchange)));
            send(exchange, Map.of("ok", true));
        });
        server.createContext("/api/community/pet/habits", exchange -> {
            habitsBody.set(SimpleJson.parseObject(readBody(exchange)));
            send(exchange, Map.of("ok", true));
        });
        server.createContext("/api/community/pet/cancel", exchange -> {
            cancelBody.set(SimpleJson.parseObject(readBody(exchange)));
            send(exchange, Map.of("ok", true));
        });
        server.createContext("/api/community/pet/live-stt", exchange -> {
            liveSttBody.set(SimpleJson.parseObject(readBody(exchange)));
            send(exchange, Map.of("ok", true, "acceptedBatchFrames", 1));
        });
        server.setExecutor(executor);
        server.start();

        try {
            Path config = root.resolve("community-server-url.txt");
            Files.writeString(config, "http://127.0.0.1:" + server.getAddress().getPort(), StandardCharsets.UTF_8);
            CommunityService service = new CommunityService(config);
            Map<String, Object> account = Map.of(
                "loggedIn", true,
                "account", Map.of("userId", "proxy-account", "nickname", "Proxy Probe")
            );
            Map<String, Object> response = service.petMutation(
                "netease",
                "NetEase",
                account,
                "chat",
                Map.of(
                    "sessionId", "session-chat",
                    "requestId", "remote-chat-request",
                    "text", "hello",
                    "proactiveContext", Map.of("reason", "returned"),
                    "realtimeVoice", true,
                    "unexpected", "must-not-pass"
                )
            );

            require(SimpleJson.asBoolean(response.get("ok"), false), "chat proxy request failed: " + response);
            Map<String, Object> forwarded = chatBody.get();
            require(SimpleJson.asMap(forwarded.get("proactiveContext")).containsKey("reason"),
                "chat proactiveContext was not forwarded: " + forwarded);
            require(SimpleJson.asBoolean(forwarded.get("realtimeVoice"), false),
                "chat realtimeVoice was not forwarded: " + forwarded);
            require("remote-chat-request".equals(SimpleJson.asString(forwarded.get("requestId"), "")),
                "chat requestId was not forwarded: " + forwarded);
            require(!forwarded.containsKey("unexpected"), "unknown chat field escaped the allowlist: " + forwarded);
            require("12345678".equals(SimpleJson.asString(forwarded.get("feId"), "")),
                "authenticated FE ID was not attached: " + forwarded);

            response = service.petMutation(
                "netease",
                "NetEase",
                account,
                "narrate",
                Map.of(
                    "requestId", "tour-request",
                    "text", "欢迎使用 FE Monster。",
                    "voiceId", "chatterbox:multilingual",
                    "unexpected", "must-not-pass"
                )
            );
            require(SimpleJson.asBoolean(response.get("ok"), false), "narration proxy request failed: " + response);
            forwarded = narrationBody.get();
            require("tour-request".equals(SimpleJson.asString(forwarded.get("requestId"), "")),
                "narration request id was not forwarded: " + forwarded);
            require("chatterbox:multilingual".equals(SimpleJson.asString(forwarded.get("voiceId"), "")),
                "selected narration voice was not forwarded: " + forwarded);
            require(!forwarded.containsKey("unexpected"), "unknown narration field escaped the allowlist: " + forwarded);
            require("12345678".equals(SimpleJson.asString(forwarded.get("feId"), "")),
                "authenticated narration FE ID was not attached: " + forwarded);

            response = service.petMutation(
                "netease",
                "NetEase",
                account,
                "narrate/cancel",
                Map.of("requestId", "tour-request", "text", "must-not-pass")
            );
            require(SimpleJson.asBoolean(response.get("cancelled"), false), "narration cancellation proxy failed: " + response);
            forwarded = narrationCancelBody.get();
            require("tour-request".equals(SimpleJson.asString(forwarded.get("requestId"), "")),
                "narration cancellation request id was not forwarded: " + forwarded);
            require(!forwarded.containsKey("text"), "narration cancellation text escaped the allowlist: " + forwarded);

            response = service.petMutation(
                "netease",
                "NetEase",
                account,
                "voice/transcript",
                Map.of(
                    "sessionId", "session-transcript",
                    "requestId", "request-transcript",
                    "text", "hello",
                    "sequence", 0,
                    "realtimeVoice", true,
                    "unexpected", "must-not-pass"
                )
            );
            require(SimpleJson.asBoolean(response.get("ok"), false),
                "voice transcript proxy request failed: " + response);
            forwarded = transcriptBody.get();
            require(SimpleJson.asBoolean(forwarded.get("realtimeVoice"), false),
                "voice transcript realtimeVoice was not forwarded: " + forwarded);
            require(!forwarded.containsKey("unexpected"),
                "unknown voice transcript field escaped the allowlist: " + forwarded);

            response = service.petMutation(
                "netease",
                "NetEase",
                account,
                "voice/chunk",
                Map.of(
                    "sessionId", "session-chunk",
                    "requestId", "request-chunk",
                    "mimeType", "audio/wav",
                    "audioBase64", "AAAA",
                    "sequence", 0,
                    "realtimeVoice", true,
                    "unexpected", "must-not-pass"
                )
            );
            require(SimpleJson.asBoolean(response.get("ok"), false),
                "voice chunk proxy request failed: " + response);
            forwarded = voiceChunkBody.get();
            require(SimpleJson.asBoolean(forwarded.get("realtimeVoice"), false),
                "voice chunk realtimeVoice was not forwarded: " + forwarded);
            require(!forwarded.containsKey("unexpected"),
                "unknown voice chunk field escaped the allowlist: " + forwarded);

            response = service.petMutation(
                "netease",
                "NetEase",
                account,
                "habits",
                Map.of("enabled", true, "clear", false, "unexpected", "must-not-pass")
            );
            require(SimpleJson.asBoolean(response.get("ok"), false), "habits proxy request failed: " + response);
            forwarded = habitsBody.get();
            require(SimpleJson.asBoolean(forwarded.get("enabled"), false),
                "habits enabled flag was not forwarded: " + forwarded);
            require(forwarded.containsKey("clear") && !SimpleJson.asBoolean(forwarded.get("clear"), true),
                "habits clear flag was not forwarded: " + forwarded);
            require(!forwarded.containsKey("unexpected"), "unknown habits field escaped the allowlist: " + forwarded);

            response = service.petMutation(
                "netease",
                "NetEase",
                account,
                "cancel",
                Map.of(
                    "sessionId", "session-cancel",
                    "requestId", "request-cancel",
                    "playedAudioSequences", List.of(0, 1),
                    "maxPlayedAudioSequence", 1,
                    "activeAudioSequence", 2,
                    "playedMs", 137,
                    "text", "client-authored text must not pass"
                )
            );
            require(SimpleJson.asBoolean(response.get("ok"), false), "cancel proxy request failed: " + response);
            forwarded = cancelBody.get();
            require(SimpleJson.asList(forwarded.get("playedAudioSequences")).size() == 2,
                "cancel played sequences were not forwarded: " + forwarded);
            require(SimpleJson.asInt(forwarded.get("maxPlayedAudioSequence"), -1) == 1,
                "cancel maximum played sequence was not forwarded: " + forwarded);
            require(SimpleJson.asInt(forwarded.get("activeAudioSequence"), -1) == 2,
                "cancel active audio sequence was not forwarded: " + forwarded);
            require(SimpleJson.asInt(forwarded.get("playedMs"), -1) == 137,
                "cancel played duration was not forwarded: " + forwarded);
            require(!forwarded.containsKey("text"), "client-authored cancel text escaped the allowlist: " + forwarded);
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "cancel",
                    Map.of(
                        "sessionId", "session-cancel",
                        "requestId", "request-cancel",
                        "playedAudioSequences", java.util.stream.IntStream.range(0, 65).boxed().toList()
                    )
                ),
                "playedAudioSequences"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "cancel",
                    Map.of(
                        "sessionId", "session-cancel",
                        "requestId", "request-cancel",
                        "maxPlayedAudioSequence", 1_000_001
                    )
                ),
                "maxPlayedAudioSequence"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "cancel",
                    Map.of(
                        "sessionId", "session-cancel",
                        "requestId", "request-cancel",
                        "activeAudioSequence", -1
                    )
                ),
                "activeAudioSequence"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "cancel",
                    Map.of(
                        "sessionId", "session-cancel",
                        "requestId", "request-cancel",
                        "playedMs", 600_001
                    )
                ),
                "playedMs"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "cancel",
                    Map.of("sessionId", "", "requestId", "request-cancel")
                ),
                "session id and request id"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "cancel",
                    Map.of("sessionId", "s".repeat(121), "requestId", "request-cancel")
                ),
                "session id"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "cancel",
                    Map.of(
                        "sessionId", "session-cancel",
                        "requestId", "request-cancel",
                        "playedAudioSequences", List.of(1_000_001)
                    )
                ),
                "playedAudioSequences"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "cancel",
                    Map.of(
                        "sessionId", "session-cancel",
                        "requestId", "request-cancel",
                        "playedAudioSequences", "not-an-array"
                    )
                ),
                "playedAudioSequences"
            );

            String pcmFrame = java.util.Base64.getEncoder().encodeToString(new byte[640]);
            response = service.petMutation(
                "netease",
                "NetEase",
                account,
                "live-stt",
                Map.of(
                    "action", "frames",
                    "sessionId", "session-live",
                    "streamId", "stream-live:1",
                    "itemId", "item-live:1",
                    "sequence", 0,
                    "audioBase64", pcmFrame,
                    "unexpected", "must-not-pass"
                )
            );
            require(SimpleJson.asBoolean(response.get("ok"), false), "live STT proxy request failed: " + response);
            forwarded = liveSttBody.get();
            require("frames".equals(SimpleJson.asString(forwarded.get("action"), "")),
                "live STT action was not forwarded: " + forwarded);
            require("stream-live:1".equals(SimpleJson.asString(forwarded.get("streamId"), "")),
                "live STT stream id was not forwarded: " + forwarded);
            require("item-live:1".equals(SimpleJson.asString(forwarded.get("itemId"), "")),
                "live STT item id was not forwarded: " + forwarded);
            require(SimpleJson.asInt(forwarded.get("sequence"), -1) == 0,
                "live STT sequence was not forwarded: " + forwarded);
            require(pcmFrame.equals(SimpleJson.asString(forwarded.get("audioBase64"), "")),
                "live STT PCM batch was not forwarded intact");
            require(!forwarded.containsKey("unexpected"), "unknown live STT field escaped the allowlist: " + forwarded);
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "live-stt",
                    Map.of(
                        "action", "download",
                        "sessionId", "session-live",
                        "streamId", "stream-live:1"
                    )
                ),
                "action"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "live-stt",
                    Map.of("action", "status", "streamId", "stream-live:1")
                ),
                "session id"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "live-stt",
                    Map.of(
                        "action", "status",
                        "sessionId", "s".repeat(121),
                        "streamId", "stream-live:1"
                    )
                ),
                "session id"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "live-stt",
                    Map.of(
                        "action", "status",
                        "sessionId", "session-live",
                        "streamId", "../stream"
                    )
                ),
                "stream id"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "live-stt",
                    Map.of(
                        "action", "open",
                        "sessionId", "session-live",
                        "streamId", "stream-live:1"
                    )
                ),
                "item id"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "live-stt",
                    Map.of(
                        "action", "frames",
                        "sessionId", "session-live",
                        "streamId", "stream-live:1",
                        "sequence", 1_000_001,
                        "audioBase64", pcmFrame
                    )
                ),
                "sequence"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "live-stt",
                    Map.of(
                        "action", "frames",
                        "sessionId", "session-live",
                        "streamId", "stream-live:1",
                        "audioBase64", pcmFrame
                    )
                ),
                "sequence"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "live-stt",
                    Map.of(
                        "action", "status",
                        "sessionId", "session-live",
                        "streamId", "stream-live:1",
                        "sequence", 0
                    )
                ),
                "sequence"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "live-stt",
                    Map.of(
                        "action", "frames",
                        "sessionId", "session-live",
                        "streamId", "stream-live:1",
                        "sequence", 0,
                        "audioBase64", "not-base64"
                    )
                ),
                "audio"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "live-stt",
                    Map.of(
                        "action", "frames",
                        "sessionId", "session-live",
                        "streamId", "stream-live:1",
                        "sequence", 0,
                        "audioBase64", java.util.Base64.getEncoder().encodeToString(new byte[639])
                    )
                ),
                "PCM16LE"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "live-stt",
                    Map.of(
                        "action", "frames",
                        "sessionId", "session-live",
                        "streamId", "stream-live:1",
                        "sequence", 0,
                        "audioBase64", java.util.Base64.getEncoder().encodeToString(new byte[26 * 640])
                    )
                ),
                "1 to 25 frames"
            );
            expectRejected(
                () -> service.petMutation(
                    "netease",
                    "NetEase",
                    account,
                    "live-stt",
                    Map.of(
                        "action", "status",
                        "sessionId", "session-live",
                        "streamId", "stream-live:1",
                        "audioBase64", pcmFrame
                    )
                ),
                "audio"
            );

            System.out.println("CommunityPetProxyContractProbe passed");
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

    private static String readBody(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }

    private static void send(HttpExchange exchange, Map<String, Object> payload) throws IOException {
        byte[] body = SimpleJson.stringify(payload).getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void expectRejected(Runnable action, String messageFragment) {
        try {
            action.run();
            throw new AssertionError("expected request rejection containing: " + messageFragment);
        } catch (IllegalArgumentException error) {
            require(error.getMessage() != null && error.getMessage().contains(messageFragment),
                "unexpected rejection message: " + error.getMessage());
        }
    }
}
