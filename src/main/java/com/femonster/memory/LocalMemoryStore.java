package com.femonster.memory;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/** Replaceable storage boundary for the encrypted local-memory vault. */
public interface LocalMemoryStore extends AutoCloseable {
    int MAX_BATCH = 100;
    int MAX_RESULTS = 100;

    List<AppendResult> appendBatch(List<LocalMemoryEvent> events);

    List<AppendResult> appendChats(List<LocalMemoryEvent> events);

    List<AppendResult> appendOperations(List<LocalMemoryEvent> events);

    List<AppendResult> appendKnowledge(List<LocalMemoryEvent> events);

    /** Internal-only trusted personalization path; browser event ingress cannot select it. */
    boolean appendTrustedPersonalization(String scope, java.util.Map<String, Object> projection);

    /** Returns only a producer-authenticated internal personalization snapshot. */
    java.util.Map<String, Object> trustedPersonalization(String scope);

    /** Internal-only tombstone for the fixed trusted personalization record. */
    boolean forgetTrustedPersonalization(String scope);

    Page queryChats(Query query);

    Page queryOperations(Query query);

    Page queryKnowledge(Query query);

    TraceResult queryTrace(TraceQuery query);

    ForgetResult forgetChats(ForgetRequest request);

    ForgetResult forgetOperations(ForgetRequest request);

    ForgetResult forgetKnowledge(ForgetRequest request);

    BackupResult backup(Path target);

    RestoreResult restore(Path source);

    Health health();

    @Override
    void close();

    record AppendResult(String eventId, boolean duplicate, Instant recordedAt) {
        public AppendResult {
            eventId = Bounds.uuid(eventId);
            Bounds.instant(recordedAt);
        }
    }

    record StoredEvent(LocalMemoryEvent event, Instant recordedAt) {
        public StoredEvent {
            if (event == null) throw Bounds.invalid();
            Bounds.instant(recordedAt);
        }

        public Cursor cursor() {
            return new Cursor(
                event.occurredAtEpochMillis(),
                recordedAt.toEpochMilli(),
                event.sourceSequence(),
                event.eventId()
            );
        }
    }

    record Cursor(Long occurredAtMillis, long recordedAtMillis, long sourceSequence, String eventId) {
        public Cursor {
            if (recordedAtMillis < 0 || sourceSequence < 0 || sourceSequence > Bounds.MAX_SEQUENCE) {
                throw Bounds.invalid();
            }
            eventId = Bounds.uuid(eventId);
        }
    }

    record Query(
        String scope,
        Set<String> types,
        int limit,
        Cursor before,
        String text,
        String conversationId,
        String traceId,
        String operationId
    ) {
        public Query(String scope, Set<String> types, int limit, Cursor before, String text) {
            this(scope, types, limit, before, text, null, null, null);
        }
        public Query {
            scope = Bounds.scope(scope);
            types = Bounds.types(types, true);
            if (limit < 1 || limit > MAX_RESULTS) throw Bounds.invalid();
            if (text != null) {
                Bounds.text(text, 32_768, false);
                if (text.isBlank()) text = null;
            }
            conversationId = conversationId == null ? null : Bounds.identifier(conversationId);
            traceId = traceId == null ? null : Bounds.identifier(traceId);
            operationId = operationId == null ? null : Bounds.identifier(operationId);
        }

        public void requireStream(MemorySanitizer.Stream stream) {
            Bounds.requireTypesForStream(types, stream);
            if (conversationId != null && stream != MemorySanitizer.Stream.CHAT) throw Bounds.invalid();
            if ((operationId != null) && stream != MemorySanitizer.Stream.OPERATION) throw Bounds.invalid();
            if (traceId != null && stream == MemorySanitizer.Stream.KNOWLEDGE) throw Bounds.invalid();
        }
    }

    record Page(List<StoredEvent> records, Cursor next) {
        public Page {
            if (records == null || records.size() > MAX_RESULTS) throw Bounds.invalid();
            for (StoredEvent record : records) if (record == null) throw Bounds.invalid();
            records = List.copyOf(records);
            if (records.isEmpty() && next != null) throw Bounds.invalid();
            if (!records.isEmpty() && next != null && !next.equals(records.get(records.size() - 1).cursor())) {
                throw Bounds.invalid();
            }
        }
    }

    record TraceQuery(String scope, String traceId, int limit) {
        public TraceQuery {
            scope = Bounds.scope(scope);
            traceId = Bounds.identifier(traceId);
            if (limit < 1 || limit > MAX_RESULTS) throw Bounds.invalid();
        }
    }

    record TraceResult(List<StoredEvent> chats, List<StoredEvent> operations) {
        public TraceResult {
            chats = Bounds.storedEvents(chats, MemorySanitizer.Stream.CHAT);
            operations = Bounds.storedEvents(operations, MemorySanitizer.Stream.OPERATION);
        }
    }

    record ForgetRequest(
        String scope,
        Set<String> eventIds,
        String conversationId,
        String operationId,
        Set<String> types,
        Instant occurredBefore,
        boolean entireScope
    ) {
        public ForgetRequest {
            scope = Bounds.scope(scope);
            eventIds = Bounds.eventIds(eventIds);
            conversationId = Bounds.optionalIdentifier(conversationId);
            operationId = Bounds.optionalIdentifier(operationId);
            types = Bounds.types(types, false);
            if (occurredBefore != null) Bounds.instant(occurredBefore);

            boolean idsSelector = !eventIds.isEmpty();
            boolean conversationSelector = conversationId != null;
            boolean operationRangeSelector = operationId != null || !types.isEmpty() || occurredBefore != null;
            int selectors = (idsSelector ? 1 : 0)
                + (conversationSelector ? 1 : 0)
                + (operationRangeSelector ? 1 : 0)
                + (entireScope ? 1 : 0);
            if (selectors != 1) throw Bounds.invalid();
        }

        public void requireStream(MemorySanitizer.Stream stream) {
            if (conversationId != null && stream != MemorySanitizer.Stream.CHAT) throw Bounds.invalid();
            if ((operationId != null || occurredBefore != null) && stream != MemorySanitizer.Stream.OPERATION) {
                throw Bounds.invalid();
            }
            Bounds.requireTypesForStream(types, stream);
        }
    }

    record ForgetResult(long count) {
        public ForgetResult {
            if (count < 0) throw Bounds.invalid();
        }
    }

    record BackupResult(long bytes, String sha256) {
        private static final Pattern SHA256 = Pattern.compile("[0-9a-f]{64}");

        public BackupResult {
            if (bytes <= 0 || sha256 == null || !SHA256.matcher(sha256).matches()) throw Bounds.invalid();
        }
    }

    record RestoreResult(long records) {
        public RestoreResult {
            if (records < 0) throw Bounds.invalid();
        }
    }

    record Health(boolean available, boolean locked, int schemaVersion, String code) {
        private static final Pattern CODE = Pattern.compile("[A-Z][A-Z0-9_]{0,63}");

        public Health {
            if ((available && locked)
                || schemaVersion < 0
                || code == null
                || !CODE.matcher(code).matches()) {
                throw Bounds.invalid();
            }
        }
    }

    /** Shared contract checks used by implementations before starting a transaction. */
    final class Bounds {
        private static final long MAX_SEQUENCE = 9_007_199_254_740_991L;
        private static final int MAX_SCOPE_BYTES = 512;
        private static final int MAX_SCOPE_CODE_POINTS = 256;
        private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._:-]{0,127}");

        private Bounds() {
        }

        public static List<LocalMemoryEvent> batch(
            List<LocalMemoryEvent> events,
            MemorySanitizer.Stream requiredStream
        ) {
            if (events == null || events.isEmpty() || events.size() > MAX_BATCH) throw invalid();
            ArrayList<LocalMemoryEvent> copy = new ArrayList<>(events.size());
            for (LocalMemoryEvent event : events) {
                if (event == null || (requiredStream != null && event.stream() != requiredStream)) throw invalid();
                copy.add(event);
            }
            return List.copyOf(copy);
        }

        public static Path path(Path path) {
            if (path == null) throw invalid();
            Path absolute = path.toAbsolutePath().normalize();
            if (!absolute.isAbsolute() || absolute.toString().length() > 4_096) throw invalid();
            return absolute;
        }

        private static List<StoredEvent> storedEvents(
            List<StoredEvent> events,
            MemorySanitizer.Stream stream
        ) {
            if (events == null || events.size() > MAX_RESULTS) throw invalid();
            ArrayList<StoredEvent> copy = new ArrayList<>(events.size());
            for (StoredEvent event : events) {
                if (event == null || event.event().stream() != stream) throw invalid();
                copy.add(event);
            }
            return List.copyOf(copy);
        }

        private static Set<String> eventIds(Set<String> values) {
            if (values == null || values.size() > MAX_BATCH) throw invalid();
            ArrayList<String> sorted = new ArrayList<>(values.size());
            for (String value : values) sorted.add(uuid(value));
            sorted.sort(Comparator.naturalOrder());
            return Collections.unmodifiableSet(new LinkedHashSet<>(sorted));
        }

        private static Set<String> types(Set<String> values, boolean requireNonEmpty) {
            if (values == null || values.size() > 64 || (requireNonEmpty && values.isEmpty())) throw invalid();
            LinkedHashSet<String> allowed = new LinkedHashSet<>();
            for (MemorySanitizer.Stream stream : MemorySanitizer.Stream.values()) {
                allowed.addAll(MemorySanitizer.allowedTypes(stream));
            }
            ArrayList<String> sorted = new ArrayList<>(values.size());
            for (String value : values) {
                if (value == null || !allowed.contains(value)) throw invalid();
                sorted.add(value);
            }
            sorted.sort(Comparator.naturalOrder());
            return Collections.unmodifiableSet(new LinkedHashSet<>(sorted));
        }

        private static void requireTypesForStream(Set<String> types, MemorySanitizer.Stream stream) {
            if (stream == null || !MemorySanitizer.allowedTypes(stream).containsAll(types)) throw invalid();
        }

        private static String scope(String value) {
            if (value == null
                || value.isBlank()
                || value.getBytes(StandardCharsets.UTF_8).length > MAX_SCOPE_BYTES
                || value.codePointCount(0, value.length()) > MAX_SCOPE_CODE_POINTS
                || value.codePoints().anyMatch(Character::isISOControl)
                || hasUnpairedSurrogate(value)) {
                throw invalid();
            }
            return value;
        }

        private static void instant(Instant value) {
            if (value == null) throw invalid();
            try {
                value.toEpochMilli();
            } catch (ArithmeticException failure) {
                throw invalid();
            }
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

        private static String optionalIdentifier(String value) {
            return value == null ? null : identifier(value);
        }

        private static String identifier(String value) {
            if (value == null || !IDENTIFIER.matcher(value).matches()) throw invalid();
            return value;
        }

        private static String uuid(String value) {
            if (value == null) throw invalid();
            try {
                String canonical = UUID.fromString(value).toString();
                if (!canonical.equals(value)) throw invalid();
                return canonical;
            } catch (IllegalArgumentException failure) {
                throw invalid();
            }
        }

        private static void text(String value, int maximumBytes, boolean allowBlank) {
            if ((!allowBlank && value.isBlank())
                || value.getBytes(StandardCharsets.UTF_8).length > maximumBytes
                || value.codePoints().anyMatch(codePoint -> codePoint == 0)) {
                throw invalid();
            }
        }

        private static LocalMemoryException invalid() {
            return new LocalMemoryException(LocalMemoryException.Code.INVALID_ARGUMENT);
        }
    }
}
