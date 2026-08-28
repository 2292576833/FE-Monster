package com.femonster.memory;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

public final class MemorySanitizer {
    public enum Stream {
        CHAT,
        OPERATION,
        KNOWLEDGE
    }

    private static final int MAX_TEXT_BYTES = 32_768;
    private static final int MAX_DEPTH = 12;
    private static final int MAX_COLLECTION_SIZE = 1_000;
    private static final double MAX_SCENE_COORDINATE = 1_000_000.0;
    private static final double MAX_SCENE_SCALE = 10_000.0;
    private static final long MAX_PLAYBACK_MILLIS = 604_800_000L;
    private static final long MAX_SOURCE_SEQUENCE = 9_007_199_254_740_991L;
    private static final Pattern CORRELATION_ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._:-]{0,127}");
    private static final Pattern URL_VALUE = Pattern.compile(
        "(?i)(?:(?:https?|wss?|file|ftp)://|(?:blob|data|mailto|magnet|ipfs|ipns):|"
            + "(?<!:)//[a-z0-9]|(?<![\\p{L}\\p{N}_])www\\.|"
            + "(?<![\\p{L}\\p{N}_@])(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\\.)+"
            + "[a-z]{2,63}(?::\\d{1,5})?[/?:#]\\S*|"
            + "(?<![\\p{L}\\p{N}_])(?:\\d{1,3}\\.){3}\\d{1,3}(?::\\d{1,5})?/\\S+|"
            + "(?<![\\p{L}\\p{N}_])localhost(?::\\d{1,5})?/\\S+)"
    );
    private static final Pattern AUTHORIZATION_VALUE = Pattern.compile("(?i)(?:^|[\\s:=])(?:bearer|basic)\\s+\\S+");
    private static final Pattern SECRET_ASSIGNMENT_VALUE = Pattern.compile(
        "(?i)(?<![\\p{L}\\p{N}_])(?:api[_-]?key|(?:access[_-]?|refresh[_-]?)?token|password|"
            + "passwd|client[_-]?secret|authorization|cookie|session(?:id)?)(?![\\p{L}\\p{N}_])"
            + "\\s*[\\\"']?\\s*[:=]\\s*[\\\"']?\\S+"
    );
    private static final Pattern EMBEDDED_WINDOWS_PATH = Pattern.compile("(?i)(?:[a-z]:[\\\\/]|\\\\\\\\)\\S+");
    private static final Pattern EMBEDDED_UNIX_PATH = Pattern.compile("(?:^|[\\s\\\"'(:=])/(?!/)\\S+");
    private static final Pattern JWT_VALUE = Pattern.compile("[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}");
    private static final Pattern PROVIDER_KEY_VALUE = Pattern.compile(
        "(?i)(?:(?:sk|ak)-[A-Za-z0-9_-]{12,}|(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}|"
            + "xox[baprs]-[A-Za-z0-9-]{12,}|glpat-[A-Za-z0-9_-]{12,}|"
            + "(?:AKIA|ASIA)[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,}|"
            + "AIza[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{20,}|ya29\\.[A-Za-z0-9_-]{20,})"
    );
    private static final Pattern RAW_HTTP_VALUE = Pattern.compile(
        "(?im)^(?:(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\\s+\\S+\\s+HTTP/\\d(?:\\.\\d)?|"
            + "HTTP/\\d(?:\\.\\d)?\\s+\\d{3})"
    );
    private static final Pattern PRIVATE_KEY_VALUE = Pattern.compile(
        "(?i)-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----"
    );

    private static final Set<String> CHAT_TYPES = Set.of(
        "chat.message",
        "legacy.chat_snapshot"
    );
    private static final Set<String> OPERATION_TYPES = Set.of(
        "command.requested",
        "command.confirmed",
        "command.started",
        "command.succeeded",
        "command.failed",
        "command.cancelled",
        "command.reverted",
        "playback.started",
        "playback.completed",
        "playback.skipped",
        "playback.replayed",
        "playback.duration_summary",
        "library.favorite_changed",
        "scene.preset_saved",
        "scene.preset_applied"
    );
    private static final Set<String> KNOWLEDGE_TYPES = Set.of(
        "library.playlist_snapshot",
        "user.fact"
    );

    private static final Set<String> CHAT_FIELDS = Set.of(
        "messageId",
        "conversationId",
        "traceId",
        "turnId",
        "role",
        "text",
        "source",
        "modelOrigin",
        "timeAccuracy",
        "occurredAt",
        "sourceSequence"
    );
    private static final Set<String> OPERATION_FIELDS = Set.of(
        "operationId",
        "traceId",
        "turnId",
        "causedByMessageId",
        "actor",
        "modelOrigin",
        "phase",
        "status",
        "commandId",
        "commandManifestRevision",
        "arguments",
        "outcome",
        "before",
        "after",
        "receipt",
        "undo",
        "failureCode",
        "providerId",
        "songId",
        "playlistId",
        "presetId",
        "componentId",
        "title",
        "artist",
        "action",
        "positionMs",
        "durationMs",
        "position",
        "rotation",
        "scale",
        "occurredAt",
        "sourceSequence"
    );
    private static final Set<String> KNOWLEDGE_FIELDS = Set.of(
        "occurredAt",
        "sourceSequence",
        "source",
        "entityId",
        "title",
        "value",
        "timeAccuracy",
        "traceId"
    );

    private static final Set<String> CHAT_REQUIRED = Set.of(
        "messageId",
        "conversationId",
        "traceId",
        "turnId",
        "role",
        "text",
        "source",
        "modelOrigin",
        "timeAccuracy",
        "occurredAt",
        "sourceSequence"
    );
    private static final Set<String> OPERATION_REQUIRED = Set.of(
        "operationId",
        "traceId",
        "actor",
        "phase",
        "status",
        "occurredAt",
        "sourceSequence"
    );
    private static final Set<String> KNOWLEDGE_REQUIRED = Set.of(
        "occurredAt",
        "sourceSequence",
        "source",
        "entityId",
        "title",
        "value"
    );
    private static final Set<String> CORRELATION_FIELDS = Set.of(
        "messageId",
        "conversationId",
        "traceId",
        "turnId",
        "operationId",
        "causedByMessageId",
        "entityId",
        "providerId",
        "songId",
        "playlistId",
        "presetId",
        "componentId"
    );
    private static final Set<String> SHORT_IDENTIFIER_FIELDS = Set.of(
        "role",
        "source",
        "modelOrigin",
        "actor",
        "phase",
        "status",
        "commandId",
        "commandManifestRevision",
        "timeAccuracy",
        "action"
    );
    private static final Set<String> SECRET_KEYS = Set.of(
        "apikey",
        "accesskey",
        "accesstoken",
        "refreshtoken",
        "authorization",
        "authorizationheader",
        "cookie",
        "cookies",
        "password",
        "passwd",
        "credential",
        "credentials",
        "session",
        "sessionid",
        "privatekey",
        "clientsecret",
        "secret",
        "payment",
        "paymentdata",
        "cardnumber",
        "rawheaders",
        "headers",
        "rawhttprequest",
        "rawhttpresponse",
        "requestbody",
        "responsebody",
        "authjson",
        "browserloginprofile",
        "clientaistate",
        "filehandle",
        "playbackurl",
        "baseurl",
        "serverurl",
        "modelurl",
        "signedurl",
        "url",
        "uri",
        "path",
        "absolutepath"
    );

    private MemorySanitizer() {
    }

    public static Set<String> allowedTypes(Stream stream) {
        if (stream == null) throw failure("MEMORY_STREAM_INVALID");
        return switch (stream) {
            case CHAT -> CHAT_TYPES;
            case OPERATION -> OPERATION_TYPES;
            case KNOWLEDGE -> KNOWLEDGE_TYPES;
        };
    }

    public static boolean isTypeAllowed(Stream stream, String type) {
        return type != null && allowedTypes(stream).contains(type);
    }

    public static Map<String, Object> sanitize(Stream stream, String type, Map<String, Object> payload) {
        if (stream == null) throw failure("MEMORY_STREAM_INVALID");
        if (type == null || type.isBlank()) throw failure("MEMORY_TYPE_NOT_ALLOWED");
        if (payload == null) throw failure("MEMORY_PAYLOAD_INVALID");

        Set<String> types = allowedTypes(stream);
        if (!types.contains(type)) throw failure("MEMORY_TYPE_NOT_ALLOWED");

        Set<String> allowed = switch (stream) {
            case CHAT -> CHAT_FIELDS;
            case OPERATION -> OPERATION_FIELDS;
            case KNOWLEDGE -> KNOWLEDGE_FIELDS;
        };
        Set<String> required = switch (stream) {
            case CHAT -> CHAT_REQUIRED;
            case OPERATION -> OPERATION_REQUIRED;
            case KNOWLEDGE -> KNOWLEDGE_REQUIRED;
        };
        if (payload.size() > MAX_COLLECTION_SIZE) throw failure("MEMORY_COLLECTION_TOO_LARGE");
        for (Object key : payload.keySet()) {
            if (!(key instanceof String name) || !allowed.contains(name)) {
                throw failure("MEMORY_FIELD_NOT_ALLOWED");
            }
        }
        for (String name : required) {
            if (!payload.containsKey(name)) throw failure("MEMORY_REQUIRED_FIELD_MISSING");
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> copied = (Map<String, Object>) copyValue(payload, 0);
        validateTopLevel(stream, type, copied);
        return copied;
    }

    private static void validateTopLevel(Stream stream, String type, Map<String, Object> payload) {
        for (String field : CORRELATION_FIELDS) {
            if (payload.containsKey(field)) validateCorrelation(payload.get(field));
        }
        for (String field : SHORT_IDENTIFIER_FIELDS) {
            if (payload.containsKey(field)) validateShortIdentifier(payload.get(field));
        }
        validateSequence(payload.get("sourceSequence"));

        boolean legacyUnknown = stream == Stream.CHAT
            && "legacy.chat_snapshot".equals(type)
            && "unknown".equals(payload.get("timeAccuracy"))
            && payload.get("occurredAt") == null;
        if (!legacyUnknown) {
            validateTimestamp(payload.get("occurredAt"));
            if (stream == Stream.CHAT && !"exact".equals(payload.get("timeAccuracy"))) {
                throw failure("MEMORY_TIMESTAMP_INVALID");
            }
        }

        if (stream == Stream.CHAT) {
            String role = string(payload.get("role"));
            if (!Set.of("user", "assistant", "system", "tool").contains(role)) {
                throw failure("MEMORY_FIELD_INVALID");
            }
            if (!(payload.get("text") instanceof String text) || text.isBlank()) {
                throw failure("MEMORY_FIELD_INVALID");
            }
        } else if (stream == Stream.OPERATION) {
            validateOperation(type, payload);
        } else if (!("library.playlist_snapshot".equals(type) || "user.fact".equals(type))) {
            throw failure("MEMORY_TYPE_NOT_ALLOWED");
        }
    }

    private static void validateOperation(String type, Map<String, Object> payload) {
        String actor = string(payload.get("actor"));
        if (!Set.of("user", "local-ai", "server-ai", "app", "system").contains(actor)) {
            throw failure("MEMORY_FIELD_INVALID");
        }
        if (type.startsWith("command.")) {
            requireFields(payload, Set.of("commandId", "commandManifestRevision"));
            if ("command.failed".equals(type)) requireFields(payload, Set.of("failureCode"));
            ensureOnlyFields(payload, Set.of(
                "operationId", "traceId", "turnId", "causedByMessageId", "actor", "modelOrigin",
                "phase", "status", "commandId", "commandManifestRevision", "arguments", "outcome",
                "before", "after", "receipt", "undo", "failureCode", "occurredAt", "sourceSequence"
            ));
            return;
        }
        if (type.startsWith("playback.")) {
            requireFields(payload, Set.of("providerId", "songId", "action"));
            ensureOnlyFields(payload, Set.of(
                "operationId", "traceId", "turnId", "causedByMessageId", "actor", "modelOrigin",
                "phase", "status", "providerId", "songId", "title", "artist", "action",
                "positionMs", "durationMs", "outcome", "before", "after", "failureCode",
                "occurredAt", "sourceSequence"
            ));
            validateOptionalNonnegativeInteger(payload, "positionMs");
            validateOptionalNonnegativeInteger(payload, "durationMs");
            return;
        }
        if ("library.favorite_changed".equals(type)) {
            requireFields(payload, Set.of("providerId", "songId", "action"));
            ensureOnlyFields(payload, Set.of(
                "operationId", "traceId", "turnId", "causedByMessageId", "actor", "modelOrigin",
                "phase", "status", "providerId", "songId", "playlistId", "title", "artist",
                "action", "outcome", "before", "after", "failureCode", "occurredAt", "sourceSequence"
            ));
            return;
        }
        if (type.startsWith("scene.")) {
            requireFields(payload, Set.of("presetId", "action"));
            ensureOnlyFields(payload, Set.of(
                "operationId", "traceId", "turnId", "causedByMessageId", "actor", "modelOrigin",
                "phase", "status", "presetId", "componentId", "title", "action", "position",
                "rotation", "scale", "outcome", "before", "after", "failureCode",
                "occurredAt", "sourceSequence"
            ));
            validateOptionalVector(payload, "position", -MAX_SCENE_COORDINATE, MAX_SCENE_COORDINATE);
            validateOptionalVector(payload, "rotation", -MAX_SCENE_COORDINATE, MAX_SCENE_COORDINATE);
            validateOptionalVector(payload, "scale", 0.000_001, MAX_SCENE_SCALE);
            return;
        }
        throw failure("MEMORY_TYPE_NOT_ALLOWED");
    }

    private static void requireFields(Map<String, Object> payload, Set<String> fields) {
        for (String field : fields) {
            if (!payload.containsKey(field)) throw failure("MEMORY_REQUIRED_FIELD_MISSING");
        }
    }

    private static void ensureOnlyFields(Map<String, Object> payload, Set<String> fields) {
        for (String field : payload.keySet()) {
            if (!fields.contains(field)) throw failure("MEMORY_FIELD_NOT_ALLOWED");
        }
    }

    private static void validateOptionalNonnegativeInteger(Map<String, Object> payload, String field) {
        if (!payload.containsKey(field)) return;
        Object value = payload.get(field);
        if (!(value instanceof Number number)) throw failure("MEMORY_FIELD_INVALID");
        double numeric = number.doubleValue();
        if (!Double.isFinite(numeric)
            || numeric < 0
            || numeric > MAX_PLAYBACK_MILLIS
            || numeric != Math.rint(numeric)) {
            throw failure("MEMORY_FIELD_INVALID");
        }
    }

    private static void validateOptionalVector(
        Map<String, Object> payload,
        String field,
        double minimum,
        double maximum
    ) {
        if (!payload.containsKey(field)) return;
        Object value = payload.get(field);
        if (!(value instanceof List<?> vector) || vector.size() != 3) {
            throw failure("MEMORY_FIELD_INVALID");
        }
        for (Object component : vector) {
            if (!(component instanceof Number number)) throw failure("MEMORY_FIELD_INVALID");
            double numeric = number.doubleValue();
            if (!Double.isFinite(numeric) || numeric < minimum || numeric > maximum) {
                throw failure("MEMORY_FIELD_INVALID");
            }
        }
    }

    private static Object copyValue(Object value, int depth) {
        if (depth > MAX_DEPTH) throw failure("MEMORY_NESTING_TOO_DEEP");
        if (value == null || value instanceof Boolean) return value;
        if (value instanceof Number number) {
            if (!(number instanceof Byte)
                && !(number instanceof Short)
                && !(number instanceof Integer)
                && !(number instanceof Long)
                && !(number instanceof Float)
                && !(number instanceof Double)) {
                // The strict JSON reader reconstructs integers as Long and
                // decimals as Double. Reject wider Java-only number classes so
                // accepted canonical payloads are guaranteed to round-trip.
                throw failure("MEMORY_FIELD_INVALID");
            }
            double numeric = number.doubleValue();
            if (!Double.isFinite(numeric)) throw failure("MEMORY_NON_FINITE_NUMBER");
            return number;
        }
        if (value instanceof String text) {
            validateStringValue(text);
            return text;
        }
        if (value instanceof Map<?, ?> map) {
            if (map.size() > MAX_COLLECTION_SIZE) throw failure("MEMORY_COLLECTION_TOO_LARGE");
            LinkedHashMap<String, Object> copied = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!(entry.getKey() instanceof String key) || key.isEmpty()) {
                    throw failure("MEMORY_FIELD_INVALID");
                }
                validateKey(key);
                copied.put(key, copyValue(entry.getValue(), depth + 1));
            }
            return copied;
        }
        if (value instanceof List<?> list) {
            if (list.size() > MAX_COLLECTION_SIZE) throw failure("MEMORY_COLLECTION_TOO_LARGE");
            ArrayList<Object> copied = new ArrayList<>(list.size());
            for (Object item : list) copied.add(copyValue(item, depth + 1));
            return copied;
        }
        throw failure("MEMORY_FIELD_INVALID");
    }

    private static void validateKey(String key) {
        String normalized = secretKeySkeleton(key);
        if (SECRET_KEYS.contains(normalized)
            || normalized.contains("authorization")
            || normalized.contains("credential")
            || normalized.contains("privatekey")
            || normalized.contains("apikey")
            || normalized.contains("accesskey")
            || normalized.contains("accesstoken")
            || normalized.contains("refreshtoken")
            || normalized.contains("clientsecret")
            || normalized.contains("password")
            || normalized.contains("token")
            || normalized.contains("secret")
            || normalized.contains("session")
            || normalized.endsWith("token")
            || normalized.endsWith("tokens")
            || normalized.endsWith("password")
            || normalized.endsWith("apikey")
            || normalized.contains("密码")
            || normalized.contains("口令")
            || normalized.contains("令牌")
            || normalized.contains("凭证")
            || normalized.contains("密钥")
            || normalized.contains("授权")
            || normalized.contains("会话")) {
            throw failure("MEMORY_SECRET_REJECTED");
        }
    }

    private static String secretKeySkeleton(String key) {
        String normalized = Normalizer.normalize(key, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT);
        StringBuilder skeleton = new StringBuilder(normalized.length());
        normalized.codePoints().forEach(codePoint -> {
            int mapped = switch (codePoint) {
                case 0x0430, 0x03B1 -> 'a';
                case 0x0432 -> 'b';
                case 0x0441 -> 'c';
                case 0x0501 -> 'd';
                case 0x0435, 0x03B5 -> 'e';
                case 0x043D -> 'h';
                case 0x0456, 0x03B9 -> 'i';
                case 0x0458 -> 'j';
                case 0x043A, 0x03BA -> 'k';
                case 0x043C -> 'm';
                case 0x043E, 0x03BF -> 'o';
                case 0x0440, 0x03C1 -> 'p';
                case 0x0455, 0x03C3 -> 's';
                case 0x0442, 0x03C4 -> 't';
                case 0x0443 -> 'y';
                case 0x0445, 0x03C7 -> 'x';
                default -> codePoint;
            };
            if (Character.isLetterOrDigit(mapped)) skeleton.appendCodePoint(mapped);
        });
        return skeleton.toString();
    }

    private static void validateStringValue(String text) {
        if (text.getBytes(StandardCharsets.UTF_8).length > MAX_TEXT_BYTES) {
            throw failure("MEMORY_TEXT_TOO_LARGE");
        }
        String normalized = Normalizer.normalize(text, Normalizer.Form.NFKC);
        if (AUTHORIZATION_VALUE.matcher(normalized).find()
            || SECRET_ASSIGNMENT_VALUE.matcher(normalized).find()
            || JWT_VALUE.matcher(normalized).find()
            || PROVIDER_KEY_VALUE.matcher(normalized).find()
            || PRIVATE_KEY_VALUE.matcher(normalized).find()
            || RAW_HTTP_VALUE.matcher(normalized.trim()).find()) {
            throw failure("MEMORY_SECRET_REJECTED");
        }
        if (URL_VALUE.matcher(normalized).find()) throw failure("MEMORY_URL_REJECTED");
        String trimmed = normalized.trim();
        if (isAbsoluteWindowsPath(trimmed)
            || isAbsoluteUnixPath(trimmed)
            || EMBEDDED_WINDOWS_PATH.matcher(normalized).find()
            || EMBEDDED_UNIX_PATH.matcher(normalized).find()) {
            throw failure("MEMORY_PATH_REJECTED");
        }
    }

    private static boolean isAbsoluteWindowsPath(String value) {
        return value.startsWith("\\\\")
            || (value.length() >= 3
                && Character.isLetter(value.charAt(0))
                && value.charAt(1) == ':'
                && (value.charAt(2) == '\\' || value.charAt(2) == '/'));
    }

    private static boolean isAbsoluteUnixPath(String value) {
        return value.startsWith("/") && !value.startsWith("//");
    }

    private static void validateTimestamp(Object value) {
        if (!(value instanceof String timestamp) || !timestamp.endsWith("Z")) {
            throw failure("MEMORY_TIMESTAMP_INVALID");
        }
        try {
            Instant.parse(timestamp);
        } catch (DateTimeParseException failure) {
            throw failure("MEMORY_TIMESTAMP_INVALID");
        }
    }

    private static void validateCorrelation(Object value) {
        if (!(value instanceof String id) || !CORRELATION_ID.matcher(id).matches()) {
            throw failure("MEMORY_CORRELATION_INVALID");
        }
    }

    private static void validateShortIdentifier(Object value) {
        if (!(value instanceof String text)
            || text.isBlank()
            || text.length() > 160
            || text.chars().anyMatch(Character::isWhitespace)) {
            throw failure("MEMORY_FIELD_INVALID");
        }
    }

    private static void validateSequence(Object value) {
        if (!(value instanceof Number number)) throw failure("MEMORY_SEQUENCE_INVALID");
        double numeric = number.doubleValue();
        long integral = number.longValue();
        if (!Double.isFinite(numeric)
            || numeric != Math.rint(numeric)
            || integral < 0
            || integral > MAX_SOURCE_SEQUENCE
            || numeric != (double) integral) {
            throw failure("MEMORY_SEQUENCE_INVALID");
        }
    }

    private static String string(Object value) {
        return value instanceof String text ? text : "";
    }

    private static IllegalArgumentException failure(String code) {
        return new IllegalArgumentException(code);
    }
}
