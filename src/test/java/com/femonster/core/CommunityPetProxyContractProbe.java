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
import java.util.concurrent.atomic.AtomicInteger;

public final class CommunityPetProxyContractProbe {
    private CommunityPetProxyContractProbe() {
    }

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-community-pet-proxy-");
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        ExecutorService executor = Executors.newSingleThreadExecutor();
        AtomicReference<Map<String, Object>> chatBody = new AtomicReference<>(Map.of());
        AtomicInteger chatStatus = new AtomicInteger(200);
        AtomicReference<Map<String, Object>> narrationBody = new AtomicReference<>(Map.of());
        AtomicReference<Map<String, Object>> narrationCancelBody = new AtomicReference<>(Map.of());
        AtomicReference<String> narrationAudioQuery = new AtomicReference<>("");
        AtomicReference<Map<String, Object>> transcriptBody = new AtomicReference<>(Map.of());
        AtomicReference<Map<String, Object>> voiceChunkBody = new AtomicReference<>(Map.of());
        AtomicReference<Map<String, Object>> habitsBody = new AtomicReference<>(Map.of());
        AtomicReference<String> habitsQuery = new AtomicReference<>("");
        AtomicReference<Map<String, Object>> cancelBody = new AtomicReference<>(Map.of());
        AtomicReference<Map<String, Object>> liveSttBody = new AtomicReference<>(Map.of());
        AtomicReference<String> memoriesQuery = new AtomicReference<>("");
        AtomicReference<Map<String, Object>> memoryForgetBody = new AtomicReference<>(Map.of());
        server.createContext("/health", exchange -> send(exchange, Map.of(
            "ok", true,
            "service", "fe-monster-community"
        )));
        server.createContext("/api/community/register", exchange -> send(exchange, Map.of(
            "ok", true,
            "profile", Map.of("feId", "12345678", "username", "proxy-probe"),
            "friends", List.of()
        )));
        server.createContext("/api/community/device/enroll", exchange -> send(exchange, Map.of("ok", true)));
        server.createContext("/api/community/pet/memories", exchange -> {
            memoriesQuery.set(exchange.getRequestURI().getRawQuery());
            send(exchange, Map.of(
                "ok", true,
                "feId", "12345678",
                "memories", List.of(Map.of(
                    "id", "memory-safe-1",
                    "category", "care_preference",
                    "value", "comfort",
                    "source", "explicit",
                    "confidence", 1
                ))
            ));
        });
        server.createContext("/api/community/pet/memory/forget", exchange -> {
            memoryForgetBody.set(SimpleJson.parseObject(readBody(exchange)));
            send(exchange, Map.of("ok", true, "removed", 1, "memories", List.of()));
        });
        server.createContext("/api/community/pet/chat", exchange -> {
            chatBody.set(SimpleJson.parseObject(readBody(exchange)));
            int status = chatStatus.get();
            if (status >= 400) {
                send(exchange, status, Map.of("ok", false, "error", "chat upstream " + status));
            } else {
                send(exchange, Map.of("ok", true));
            }
        });
        server.createContext("/api/community/pet/narrate", exchange -> {
            narrationBody.set(SimpleJson.parseObject(readBody(exchange)));
            send(exchange, Map.of(
                "ok", true,
                "requestId", "tour-request",
                "audioId", "pet-audio-00000000-0000-4000-8000-000000000001",
                "mimeType", "audio/mpeg"
            ));
        });
        server.createContext("/api/community/pet/audio/pet-audio-00000000-0000-4000-8000-000000000001", exchange -> {
            narrationAudioQuery.set(exchange.getRequestURI().getRawQuery());
            byte[] audio = "ID3-java-proxy-audio".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "audio/mpeg");
            exchange.getResponseHeaders().set("Cache-Control", "private, no-store");
            exchange.sendResponseHeaders(200, audio.length);
            exchange.getResponseBody().write(audio);
            exchange.close();
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
            if ("GET".equalsIgnoreCase(exchange.getRequestMethod())) {
                habitsQuery.set(exchange.getRequestURI().getRawQuery());
                send(exchange, Map.of(
                    "ok", true,
                    "habits", Map.of(
                        "enabled", true,
                        "topArtists", List.of(Map.of("name", "fixture artist", "listenMs", 1200))
                    )
                ));
            } else {
                habitsBody.set(SimpleJson.parseObject(readBody(exchange)));
                send(exchange, Map.of("ok", true));
            }
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
            MachineIdentityService machine = new MachineIdentityService(ProjectPaths.detect());
            CommunityService service = new CommunityService(config, machine, null);
            Map<String, Object> account = Map.of(
                "loggedIn", true,
                "account", Map.of("userId", "proxy-account", "nickname", "Proxy Probe")
            );
            Map<String, Object> response = service.petMemories("netease", "NetEase", account);
            require(SimpleJson.asBoolean(response.get("ok"), false), "memory query proxy failed: " + response);
            String forwardedMemoryQuery = memoriesQuery.get();
            require(forwardedMemoryQuery.contains("feId=12345678"),
                "memory query did not bind the authenticated FE ID: " + forwardedMemoryQuery);
            require(forwardedMemoryQuery.contains("computerId="),
                "memory query did not bind this computer: " + forwardedMemoryQuery);
            require(forwardedMemoryQuery.contains("computerIdSource="),
                "memory query did not bind the computer ID source: " + forwardedMemoryQuery);

            response = service.petHabits("netease", "NetEase", account);
            require(SimpleJson.asBoolean(response.get("ok"), false), "habit query proxy failed: " + response);
            String forwardedHabitQuery = habitsQuery.get();
            require(forwardedHabitQuery.contains("feId=12345678"),
                "habit query did not bind the authenticated FE ID: " + forwardedHabitQuery);
            require(forwardedHabitQuery.contains("computerId="),
                "habit query did not bind this computer: " + forwardedHabitQuery);
            require(forwardedHabitQuery.contains("computerIdSource="),
                "habit query did not bind the computer ID source: " + forwardedHabitQuery);
            String personalizationScope = service.petPersonalizationScope("netease", "NetEase", account);
            require(personalizationScope.contains("12345678"),
                "personalization cache scope was not derived from the authenticated FE ID");

            response = service.forgetPetMemory(
                "netease",
                "NetEase",
                account,
                Map.of(
                    "memoryId", "memory-safe-1",
                    "feId", "87654321",
                    "computerId", "attacker-computer",
                    "category", "care_preference"
                )
            );
            require(SimpleJson.asBoolean(response.get("ok"), false), "memory forget proxy failed: " + response);
            Map<String, Object> forwardedMemoryForget = memoryForgetBody.get();
            require("memory-safe-1".equals(SimpleJson.asString(forwardedMemoryForget.get("memoryId"), "")),
                "exact memory ID was not forwarded: " + forwardedMemoryForget);
            require("12345678".equals(SimpleJson.asString(forwardedMemoryForget.get("feId"), "")),
                "caller FE ID escaped authenticated binding: " + forwardedMemoryForget);
            require(!"attacker-computer".equals(SimpleJson.asString(forwardedMemoryForget.get("computerId"), "")),
                "caller computer ID escaped device binding: " + forwardedMemoryForget);
            require(!forwardedMemoryForget.containsKey("category"),
                "broad memory selector escaped the exact-ID allowlist: " + forwardedMemoryForget);
            expectRejected(
                () -> service.forgetPetMemory(
                    "netease",
                    "NetEase",
                    account,
                    Map.of("category", "care_preference")
                ),
                "memory id"
            );
            expectRejected(
                () -> service.forgetPetMemory(
                    "netease",
                    "NetEase",
                    account,
                    Map.of("memoryId", "../other-account")
                ),
                "memory id"
            );

            response = service.petMutation(
                "netease",
                "NetEase",
                account,
                "chat",
                Map.of(
                    "sessionId", "session-chat",
                    "requestId", "remote-chat-request",
                    "text", "hello",
                    "clientRole", "embedded",
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
            require("embedded".equals(SimpleJson.asString(forwarded.get("clientRole"), "")),
                "chat client role was not forwarded: " + forwarded);
            require(!forwarded.containsKey("unexpected"), "unknown chat field escaped the allowlist: " + forwarded);
            require("12345678".equals(SimpleJson.asString(forwarded.get("feId"), "")),
                "authenticated FE ID was not attached: " + forwarded);

            chatStatus.set(503);
            response = service.petMutation(
                "netease", "NetEase", account, "chat",
                Map.of("sessionId", "session-chat", "requestId", "proxy-503", "text", "retry me")
            );
            require(SimpleJson.asInt(response.get("upstreamStatus"), -1) == 503,
                "pet proxy dropped the upstream 503 status: " + response);
            require(SimpleJson.asBoolean(response.get("retryable"), false),
                "pet proxy did not mark upstream 503 retryable: " + response);
            require("upstream-transient".equals(SimpleJson.asString(response.get("errorClass"), "")),
                "pet proxy did not classify upstream 503: " + response);

            chatStatus.set(400);
            response = service.petMutation(
                "netease", "NetEase", account, "chat",
                Map.of("sessionId", "session-chat", "requestId", "proxy-400", "text", "do not retry")
            );
            require(SimpleJson.asInt(response.get("upstreamStatus"), -1) == 400,
                "pet proxy dropped the upstream 400 status: " + response);
            require(!SimpleJson.asBoolean(response.get("retryable"), true),
                "pet proxy incorrectly marked upstream 400 retryable: " + response);
            require("upstream-business".equals(SimpleJson.asString(response.get("errorClass"), "")),
                "pet proxy did not classify upstream 400: " + response);
            chatStatus.set(200);

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

            String narrationAudioId = SimpleJson.asString(response.get("audioId"), "");
            require("pet-audio-00000000-0000-4000-8000-000000000001".equals(narrationAudioId),
                "narration audio ID was not returned intact: " + response);
            var audioResponse = service.petAudio("netease", "NetEase", account, narrationAudioId);
            require(audioResponse.statusCode() == 200, "narration audio proxy failed: " + audioResponse.statusCode());
            require(audioResponse.headers().firstValue("content-type").orElse("").startsWith("audio/mpeg"),
                "narration audio proxy lost the upstream MIME type: " + audioResponse.headers().map());
            byte[] proxiedAudio;
            try (var audioInput = audioResponse.body()) {
                proxiedAudio = audioInput.readAllBytes();
            }
            require(java.util.Arrays.equals(
                proxiedAudio,
                "ID3-java-proxy-audio".getBytes(StandardCharsets.UTF_8)
            ), "narration audio proxy returned empty or corrupted bytes");
            require(narrationAudioQuery.get().contains("feId=12345678"),
                "narration audio proxy did not bind the authenticated FE ID: " + narrationAudioQuery.get());
            require(narrationAudioQuery.get().contains("computerId="),
                "narration audio proxy did not bind this computer: " + narrationAudioQuery.get());

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
        send(exchange, 200, payload);
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
