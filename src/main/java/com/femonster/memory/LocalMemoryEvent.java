package com.femonster.memory;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Map;
import java.util.UUID;

/** Validated, immutable input accepted by the durable local-memory store. */
public final class LocalMemoryEvent {
    private static final int MAX_SCOPE_BYTES = 512;
    private static final int MAX_SCOPE_CODE_POINTS = 256;

    private final String eventId;
    private final MemorySanitizer.Stream stream;
    private final String scope;
    private final String type;
    private final Instant occurredAt;
    private final long sourceSequence;
    private final Map<String, Object> payload;
    private final String conversationId;
    private final String messageId;
    private final String traceId;
    private final String turnId;
    private final String operationId;
    private final String causedByMessageId;

    public LocalMemoryEvent(
        UUID eventId,
        MemorySanitizer.Stream stream,
        String scope,
        String type,
        Instant occurredAt,
        long sourceSequence,
        Map<String, Object> payload
    ) {
        this(eventId == null ? null : eventId.toString(), stream, scope, type, occurredAt, sourceSequence, payload);
    }

    public LocalMemoryEvent(
        String eventId,
        MemorySanitizer.Stream stream,
        String scope,
        String type,
        Instant occurredAt,
        long sourceSequence,
        Map<String, Object> payload
    ) {
        this.eventId = canonicalUuid(eventId);
        if (stream == null) throw invalid();
        this.stream = stream;
        this.scope = validateScope(scope);
        this.type = validateType(stream, type);
        if (sourceSequence < 0 || sourceSequence > 9_007_199_254_740_991L) throw invalid();
        this.sourceSequence = sourceSequence;

        Map<String, Object> sanitized;
        try {
            sanitized = MemorySanitizer.sanitize(stream, type, payload);
        } catch (RuntimeException failure) {
            throw new LocalMemoryException(LocalMemoryException.Code.EVENT_INVALID, failure);
        }
        this.payload = CanonicalMemoryJson.immutableObject(sanitized);
        this.occurredAt = validateOccurredAt(occurredAt, this.payload.get("occurredAt"));
        validateSequence(sourceSequence, this.payload.get("sourceSequence"));

        this.conversationId = optionalString(this.payload, "conversationId");
        this.messageId = optionalString(this.payload, "messageId");
        this.traceId = optionalString(this.payload, "traceId");
        this.turnId = optionalString(this.payload, "turnId");
        this.operationId = optionalString(this.payload, "operationId");
        this.causedByMessageId = optionalString(this.payload, "causedByMessageId");
        validateAssociations();
    }

    public String eventId() {
        return eventId;
    }

    public UUID eventUuid() {
        return UUID.fromString(eventId);
    }

    public MemorySanitizer.Stream stream() {
        return stream;
    }

    public String scope() {
        return scope;
    }

    public String type() {
        return type;
    }

    public Instant occurredAt() {
        return occurredAt;
    }

    public Long occurredAtEpochMillis() {
        return occurredAt == null ? null : occurredAt.toEpochMilli();
    }

    public long sourceSequence() {
        return sourceSequence;
    }

    public Map<String, Object> payload() {
        return payload;
    }

    public byte[] canonicalPayloadBytes() {
        return CanonicalMemoryJson.encode(payload);
    }

    public String conversationId() {
        return conversationId;
    }

    public String messageId() {
        return messageId;
    }

    public String traceId() {
        return traceId;
    }

    public String turnId() {
        return turnId;
    }

    public String operationId() {
        return operationId;
    }

    public String causedByMessageId() {
        return causedByMessageId;
    }

    private void validateAssociations() {
        if (stream == MemorySanitizer.Stream.CHAT) {
            if (!eventId.equals(canonicalUuid(messageId)) || conversationId == null || traceId == null) throw invalid();
        } else if (stream == MemorySanitizer.Stream.OPERATION) {
            if (operationId == null || traceId == null) throw invalid();
            if (causedByMessageId != null) canonicalUuid(causedByMessageId);
        }
    }

    private static Instant validateOccurredAt(Instant declared, Object payloadValue) {
        if (payloadValue == null) {
            if (declared != null) throw invalid();
            return null;
        }
        if (!(payloadValue instanceof String text)) throw invalid();
        Instant parsed;
        try {
            parsed = Instant.parse(text);
            parsed.toEpochMilli();
        } catch (DateTimeParseException failure) {
            throw invalid();
        } catch (ArithmeticException failure) {
            throw invalid();
        }
        if (declared == null || !declared.equals(parsed)) throw invalid();
        return declared;
    }

    private static void validateSequence(long declared, Object payloadValue) {
        if (!(payloadValue instanceof Number number)
            || number.longValue() != declared
            || number.doubleValue() != (double) declared) {
            throw invalid();
        }
    }

    private static String validateScope(String scope) {
        if (scope == null
            || scope.isBlank()
            || scope.getBytes(StandardCharsets.UTF_8).length > MAX_SCOPE_BYTES
            || scope.codePointCount(0, scope.length()) > MAX_SCOPE_CODE_POINTS
            || scope.codePoints().anyMatch(codePoint -> Character.isISOControl(codePoint)
                || codePoint == 0xFFFD)
            || hasUnpairedSurrogate(scope)) {
            throw invalid();
        }
        return scope;
    }

    private static boolean hasUnpairedSurrogate(String value) {
        for (int index = 0; index < value.length(); index++) {
            char current = value.charAt(index);
            if (Character.isHighSurrogate(current)) {
                if (index + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(index + 1))) return true;
                index++;
            } else if (Character.isLowSurrogate(current)) {
                return true;
            }
        }
        return false;
    }

    private static String validateType(MemorySanitizer.Stream stream, String type) {
        if (!MemorySanitizer.allowedTypes(stream).contains(type)) throw invalid();
        return type;
    }

    private static String optionalString(Map<String, Object> payload, String field) {
        Object value = payload.get(field);
        return value instanceof String text ? text : null;
    }

    private static String canonicalUuid(String value) {
        if (value == null) throw invalid();
        try {
            UUID uuid = UUID.fromString(value);
            String canonical = uuid.toString();
            if (!canonical.equals(value)) throw invalid();
            return canonical;
        } catch (IllegalArgumentException failure) {
            throw invalid();
        }
    }

    private static LocalMemoryException invalid() {
        return new LocalMemoryException(LocalMemoryException.Code.EVENT_INVALID);
    }
}
