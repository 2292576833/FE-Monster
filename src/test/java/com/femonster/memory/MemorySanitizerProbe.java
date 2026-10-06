package com.femonster.memory;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class MemorySanitizerProbe {
    private MemorySanitizerProbe() {
    }

    public static void main(String[] args) {
        validChatAndSeparation();
        validOperationAndSeparation();
        validKnowledge();
        timestampAndCorrelationValidation();
        recursivePrivacyRejection();
        structuralBounds();
        System.out.println("PASS local memory sanitizer");
    }

    private static void validChatAndSeparation() {
        Map<String, Object> chat = validChat();
        Map<String, Object> sanitized = MemorySanitizer.sanitize(
            MemorySanitizer.Stream.CHAT,
            "chat.message",
            chat
        );
        require(sanitized.equals(chat), "CHAT_FIELDS_CHANGED");
        chat.put("text", "mutated");
        require("你好，音乐区".equals(sanitized.get("text")), "SANITIZER_DID_NOT_COPY_INPUT");
        Map<String, Object> mixed = validChat();
        mixed.put("commandId", "player.play");
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.CHAT, "chat.message", mixed),
            "MEMORY_FIELD_NOT_ALLOWED"
        );
        Map<String, Object> recorded = validChat();
        recorded.put("recordedAt", "2026-08-27T10:11:13Z");
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.CHAT, "chat.message", recorded),
            "MEMORY_FIELD_NOT_ALLOWED"
        );
    }

    private static void validOperationAndSeparation() {
        Map<String, Object> operation = validOperation();
        Map<String, Object> sanitized = MemorySanitizer.sanitize(
            MemorySanitizer.Stream.OPERATION,
            "command.succeeded",
            operation
        );
        require(sanitized.equals(operation), "OPERATION_FIELDS_CHANGED");
        Map<String, Object> mixed = validOperation();
        mixed.put("text", "这不应该成为聊天记录");
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.OPERATION, "command.succeeded", mixed),
            "MEMORY_FIELD_NOT_ALLOWED"
        );
        Map<String, Object> nonFinite = validOperation();
        nonFinite.put("arguments", Map.of("position", List.of(1.0, Double.NaN, 2.0)));
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.OPERATION, "command.succeeded", nonFinite),
            "MEMORY_NON_FINITE_NUMBER"
        );
    }

    private static void validKnowledge() {
        Map<String, Object> knowledge = new LinkedHashMap<>();
        knowledge.put("occurredAt", "2026-08-27T10:11:12.345Z");
        knowledge.put("sourceSequence", 13L);
        knowledge.put("source", "client");
        knowledge.put("entityId", "playlist:music-zone-1");
        knowledge.put("title", "音乐区歌单快照");
        knowledge.put("value", Map.of("songIds", List.of("song:1", "song:2")));
        Map<String, Object> sanitized = MemorySanitizer.sanitize(
            MemorySanitizer.Stream.KNOWLEDGE,
            "library.playlist_snapshot",
            knowledge
        );
        require(sanitized.equals(knowledge), "KNOWLEDGE_FIELDS_CHANGED");
        knowledge.put("entityId", "pet.preference.music_affinity.e572c8c4");
        knowledge.put("source", "pet-preference-learning");
        knowledge.put("value", "{\"entityId\":\"pet.preference.music_affinity.e572c8c4\",\"subject\":\"爵士\"}");
        require(MemorySanitizer.sanitize(MemorySanitizer.Stream.KNOWLEDGE, "user.fact", knowledge).equals(knowledge),
            "PREFERENCE_IDENTIFIER_MISCLASSIFIED_AS_JWT");
        assertNestedRejected("note", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.signaturefixture", "MEMORY_SECRET_REJECTED");
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.CHAT, "library.playlist_snapshot", knowledge),
            "MEMORY_TYPE_NOT_ALLOWED"
        );
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.KNOWLEDGE, "knowledge.snapshot", knowledge),
            "MEMORY_TYPE_NOT_ALLOWED"
        );

        Map<String, Object> scene = validSceneOperation();
        require(
            MemorySanitizer.sanitize(MemorySanitizer.Stream.OPERATION, "scene.preset_applied", scene)
                .equals(scene),
            "SCENE_OPERATION_FIELDS_CHANGED"
        );
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.KNOWLEDGE, "scene.preset_applied", scene),
            "MEMORY_TYPE_NOT_ALLOWED"
        );
    }

    private static void timestampAndCorrelationValidation() {
        Map<String, Object> badTime = validChat();
        badTime.put("occurredAt", "2026-08-27 10:11:12");
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.CHAT, "chat.message", badTime),
            "MEMORY_TIMESTAMP_INVALID"
        );
        Map<String, Object> offsetTime = validChat();
        offsetTime.put("occurredAt", "2026-08-27T18:11:12+08:00");
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.CHAT, "chat.message", offsetTime),
            "MEMORY_TIMESTAMP_INVALID"
        );
        Map<String, Object> badConversationStart = validChat();
        badConversationStart.put("conversationStartedAt", "2026-08-27 10:00:00");
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.CHAT, "chat.message", badConversationStart),
            "MEMORY_TIMESTAMP_INVALID"
        );
        Map<String, Object> millisecondZero = validChat();
        millisecondZero.put("occurredAt", "2026-08-27T10:11:12.000Z");
        require(
            MemorySanitizer.sanitize(MemorySanitizer.Stream.CHAT, "chat.message", millisecondZero)
                .get("occurredAt").equals("2026-08-27T10:11:12.000Z"),
            "VALID_UTC_TIMESTAMP_CHANGED"
        );
        Map<String, Object> badId = validChat();
        badId.put("traceId", "trace id with spaces");
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.CHAT, "chat.message", badId),
            "MEMORY_CORRELATION_INVALID"
        );
        Map<String, Object> missingId = validChat();
        missingId.remove("messageId");
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.CHAT, "chat.message", missingId),
            "MEMORY_REQUIRED_FIELD_MISSING"
        );
        Map<String, Object> fractionalSequence = validChat();
        fractionalSequence.put("sourceSequence", 1.5);
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.CHAT, "chat.message", fractionalSequence),
            "MEMORY_SEQUENCE_INVALID"
        );
        Map<String, Object> legacy = validChat();
        legacy.put("occurredAt", null);
        legacy.put("timeAccuracy", "unknown");
        require(
            MemorySanitizer.sanitize(MemorySanitizer.Stream.CHAT, "legacy.chat_snapshot", legacy).get("occurredAt") == null,
            "LEGACY_UNKNOWN_TIME_WAS_FABRICATED"
        );
    }

    private static void recursivePrivacyRejection() {
        assertNestedRejected("api_key", "secret", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("api_token", "secret", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("ＡＰＩ＿ＫＥＹ", "secret", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("访问令牌", "secret", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("passwоrd", "secret", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("accessKeyId", "AKIAIOSFODNN7EXAMPLE", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("clientSecretValue", "secret", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("note", "token=abcdefgh.ijklmnop.qrstuvwx", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("note", "key=sk-abcdefghijklmnop", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("note", "sk_live_abcdefghijklmnop", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("note", "xoxb-abcdefghijklmnop", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("note", "glpat-abcdefghijklmnop", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("note", "AKIAIOSFODNN7EXAMPLE", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("note", "Bearer abc.def.ghi", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("note", "authorization=Bearer abcdefgh", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("note", "password: never-store-this", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("note", "{\"token\":\"never-store-this\"}", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("note", "-----BEGIN PRIVATE KEY-----", "MEMORY_SECRET_REJECTED");
        assertNestedRejected("note", "请访问 https://example.com/song?id=1", "MEMORY_URL_REJECTED");
        assertNestedRejected("note", "blob:https://example.com/123", "MEMORY_URL_REJECTED");
        assertNestedRejected("note", "mailto:user@example.com", "MEMORY_URL_REJECTED");
        assertNestedRejected("note", "magnet:?xt=urn:btih:fixture", "MEMORY_URL_REJECTED");
        assertNestedRejected("note", "//example.com/private", "MEMORY_URL_REJECTED");
        assertNestedRejected("note", "www.example.com/song?signature=secret", "MEMORY_URL_REJECTED");
        assertNestedRejected(
            "note",
            "cdn.example.com/song?X-Amz-Signature=secret",
            "MEMORY_URL_REJECTED"
        );
        assertNestedRejected("note", "C:\\Users\\fixture\\token.json", "MEMORY_PATH_REJECTED");
        assertNestedRejected("note", "/home/fixture/token.json", "MEMORY_PATH_REJECTED");
        assertNestedRejected("note", "saved at C:\\Users\\fixture\\token.json", "MEMORY_PATH_REJECTED");
        assertNestedRejected("note", "saved at /home/fixture/token.json", "MEMORY_PATH_REJECTED");
        assertNestedRejected("note", "saved at /srv/fixture/token.json", "MEMORY_PATH_REJECTED");
        assertNestedRejected("note", "path=C:\\Users\\fixture\\token.json", "MEMORY_PATH_REJECTED");
        assertNestedRejected("note", "path=/home/fixture/token.json", "MEMORY_PATH_REJECTED");
        assertNestedRejected("note", "GET /private HTTP/1.1", "MEMORY_SECRET_REJECTED");
        assertNestedRejected(
            "note",
            "debug dump follows:\nHTTP/1.1 200 OK\nContent-Length: 5",
            "MEMORY_SECRET_REJECTED"
        );
        assertNestedRejected("authorization", Map.of("value", "anything"), "MEMORY_SECRET_REJECTED");

        Map<String, Object> invalidGeometry = validSceneOperation();
        invalidGeometry.put("position", "not-geometry");
        expectCode(
            () -> MemorySanitizer.sanitize(
                MemorySanitizer.Stream.OPERATION,
                "scene.preset_applied",
                invalidGeometry
            ),
            "MEMORY_FIELD_INVALID"
        );

        Map<String, Object> unboundedPlayback = validPlaybackOperation();
        unboundedPlayback.put("durationMs", 604_800_001L);
        expectCode(
            () -> MemorySanitizer.sanitize(
                MemorySanitizer.Stream.OPERATION,
                "playback.completed",
                unboundedPlayback
            ),
            "MEMORY_FIELD_INVALID"
        );
        Map<String, Object> unboundedGeometry = validSceneOperation();
        unboundedGeometry.put("position", List.of(0.0, 1_000_001.0, 0.0));
        expectCode(
            () -> MemorySanitizer.sanitize(
                MemorySanitizer.Stream.OPERATION,
                "scene.preset_applied",
                unboundedGeometry
            ),
            "MEMORY_FIELD_INVALID"
        );
    }

    private static void structuralBounds() {
        Map<String, Object> tooDeep = validOperation();
        Map<String, Object> cursor = new LinkedHashMap<>();
        tooDeep.put("arguments", cursor);
        for (int depth = 0; depth < 13; depth++) {
            Map<String, Object> next = new LinkedHashMap<>();
            cursor.put("value", next);
            cursor = next;
        }
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.OPERATION, "command.succeeded", tooDeep),
            "MEMORY_NESTING_TOO_DEEP"
        );

        Map<String, Object> tooMany = validOperation();
        List<Object> items = new ArrayList<>();
        for (int index = 0; index < 1_001; index++) items.add(index);
        tooMany.put("arguments", Map.of("items", items));
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.OPERATION, "command.succeeded", tooMany),
            "MEMORY_COLLECTION_TOO_LARGE"
        );

        Map<String, Object> tooLong = validChat();
        tooLong.put("text", "x".repeat(32_769));
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.CHAT, "chat.message", tooLong),
            "MEMORY_TEXT_TOO_LARGE"
        );

        expectCode(
            () -> MemorySanitizer.sanitize(null, "chat.message", validChat()),
            "MEMORY_STREAM_INVALID"
        );
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.CHAT, "unknown.type", validChat()),
            "MEMORY_TYPE_NOT_ALLOWED"
        );
    }

    private static void assertNestedRejected(String key, Object value, String code) {
        Map<String, Object> operation = validOperation();
        operation.put("arguments", Map.of("nested", List.of(Map.of(key, value))));
        expectCode(
            () -> MemorySanitizer.sanitize(MemorySanitizer.Stream.OPERATION, "command.succeeded", operation),
            code
        );
    }

    private static Map<String, Object> validChat() {
        Map<String, Object> chat = new LinkedHashMap<>();
        chat.put("messageId", "message:0001");
        chat.put("conversationId", "conversation:0001");
        chat.put("conversationStartedAt", "2026-08-27T10:00:00.000Z");
        chat.put("traceId", "trace:0001");
        chat.put("turnId", "turn:0001");
        chat.put("role", "user");
        chat.put("text", "你好，音乐区");
        chat.put("source", "client");
        chat.put("modelOrigin", "user");
        chat.put("timeAccuracy", "exact");
        chat.put("occurredAt", "2026-08-27T10:11:12.345Z");
        chat.put("sourceSequence", 12L);
        return chat;
    }

    private static Map<String, Object> validOperation() {
        Map<String, Object> operation = new LinkedHashMap<>();
        operation.put("operationId", "operation:0001");
        operation.put("traceId", "trace:0001");
        operation.put("turnId", "turn:0001");
        operation.put("causedByMessageId", "message:0001");
        operation.put("actor", "local-ai");
        operation.put("modelOrigin", "local");
        operation.put("phase", "terminal");
        operation.put("status", "succeeded");
        operation.put("commandId", "card.move");
        operation.put("commandManifestRevision", "sha256:abcdef0123456789");
        operation.put("arguments", Map.of("position", List.of(1.25, 2.5, -3.75), "scale", 1.5));
        operation.put("outcome", Map.of("accepted", true));
        operation.put("before", Map.of("scale", 1.0));
        operation.put("after", Map.of("scale", 1.5));
        operation.put("receipt", Map.of("receiptId", "receipt:0001"));
        operation.put("undo", Map.of("available", true, "commandId", "card.resize"));
        operation.put("occurredAt", "2026-08-27T10:11:12.456Z");
        operation.put("sourceSequence", 14L);
        return operation;
    }

    private static Map<String, Object> validSceneOperation() {
        Map<String, Object> operation = new LinkedHashMap<>();
        operation.put("operationId", "operation:scene:0001");
        operation.put("traceId", "trace:scene:0001");
        operation.put("actor", "app");
        operation.put("phase", "terminal");
        operation.put("status", "succeeded");
        operation.put("presetId", "preset:music-zone-1");
        operation.put("componentId", "card:morning-light");
        operation.put("title", "音乐区晨光预设");
        operation.put("action", "applied");
        operation.put("position", List.of(1.25, 2.5, -3.75));
        operation.put("rotation", List.of(0.0, 45.0, 0.0));
        operation.put("scale", List.of(1.0, 1.0, 1.0));
        operation.put("occurredAt", "2026-08-27T10:11:12.500Z");
        operation.put("sourceSequence", 15L);
        return operation;
    }

    private static Map<String, Object> validPlaybackOperation() {
        Map<String, Object> operation = new LinkedHashMap<>();
        operation.put("operationId", "operation:playback:0001");
        operation.put("traceId", "trace:playback:0001");
        operation.put("actor", "app");
        operation.put("phase", "terminal");
        operation.put("status", "succeeded");
        operation.put("providerId", "provider:fixture");
        operation.put("songId", "song:fixture");
        operation.put("action", "completed");
        operation.put("positionMs", 180_000L);
        operation.put("durationMs", 180_000L);
        operation.put("occurredAt", "2026-08-27T10:11:12.600Z");
        operation.put("sourceSequence", 16L);
        return operation;
    }

    private static void expectCode(ThrowingCall call, String expected) {
        try {
            call.run();
            throw new IllegalStateException("EXPECTED_FAILURE_NOT_THROWN");
        } catch (RuntimeException failure) {
            require(expected.equals(failure.getMessage()), "UNEXPECTED_SANITIZER_ERROR_CODE");
        }
    }

    private static void require(boolean condition, String code) {
        if (!condition) throw new IllegalStateException(code);
    }

    @FunctionalInterface
    private interface ThrowingCall {
        void run();
    }
}
