package com.femonster.api;

import com.femonster.http.HttpUtil;
import com.femonster.json.SimpleJson;
import com.femonster.memory.LocalAiMemoryService;
import com.femonster.memory.LocalMemoryException;
import com.femonster.memory.LocalMemoryStore;
import com.femonster.memory.MemorySanitizer;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Strict same-origin HTTP adapter for the local encrypted-memory vault. */
public final class LocalMemoryHttpModule {
    private static final String PREFIX = "/api/local-memory/";
    private static final int MAX_JSON_BYTES = 1024 * 1024;
    private static final long MAX_RESTORE_BYTES = 64L * 1024 * 1024;
    private final LocalAiMemoryService service;

    public LocalMemoryHttpModule(LocalAiMemoryService service) {
        this.service = service;
    }

    public boolean tryHandle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if (!path.startsWith(PREFIX)) return false;
        noStore(exchange);
        try {
            LocalPetAssistantGuard.requireLocalMemory(exchange);
            String method = exchange.getRequestMethod().toUpperCase();
            if ("OPTIONS".equals(method)) { HttpUtil.sendNoContent(exchange); return true; }
            if (!allows(path, method)) { methodNotAllowed(exchange); return true; }
            if ("/api/local-memory/health".equals(path)) {
                Map<String, String> query = HttpUtil.query(exchange);
                requireOnly(query, Set.of("provider"));
                send(exchange, 200, health(provider(query)));
                return true;
            }
            if ("GET".equals(method)) handleGet(exchange, path, HttpUtil.query(exchange));
            else if ("POST".equals(method)) handlePost(exchange, path);
            else methodNotAllowed(exchange);
        } catch (SecurityException failure) {
            send(exchange, 403, error("LOCAL_MEMORY_FORBIDDEN"));
        } catch (LocalMemoryException failure) {
            send(exchange, status(failure.code()), error(failure.code().value()));
        } catch (IllegalArgumentException failure) {
            send(exchange, 400, error(LocalMemoryException.Code.INVALID_ARGUMENT.value()));
        } catch (Exception failure) {
            // Never serialize exception messages from the vault or filesystem.
            send(exchange, 500, error(LocalMemoryException.Code.INTERNAL.value()));
        }
        return true;
    }

    private void handleGet(HttpExchange exchange, String path, Map<String, String> query) throws IOException {
        switch (path) {
            case "/api/local-memory/chats" -> {
                requireOnly(query, Set.of("provider", "conversation", "limit", "before", "q", "types"));
                Set<String> types = types(query, MemorySanitizer.Stream.CHAT);
                LocalMemoryStore.Page page = service.chats(provider(query), types, limit(query), cursor(query), query.get("q"), query.get("conversation"));
                send(exchange, 200, page(page.records().stream().map(LocalMemoryHttpModule::event).toList(), page.next()));
            }
            case "/api/local-memory/operations" -> {
                requireOnly(query, Set.of("provider", "traceId", "operationId", "types", "limit", "before", "q"));
                LocalMemoryStore.Page page = service.operations(provider(query), types(query, MemorySanitizer.Stream.OPERATION), limit(query), cursor(query), query.get("q"), query.get("traceId"), query.get("operationId"));
                send(exchange, 200, page(page.records().stream().map(LocalMemoryHttpModule::event).toList(), page.next()));
            }
            case "/api/local-memory/trace" -> {
                requireOnly(query, Set.of("provider", "traceId", "limit"));
                String traceId = required(query, "traceId");
                LocalMemoryStore.TraceResult trace = service.trace(provider(query), traceId, limit(query));
                Map<String, Object> body = ok();
                body.put("chats", trace.chats().stream().map(LocalMemoryHttpModule::event).toList());
                body.put("operations", trace.operations().stream().map(LocalMemoryHttpModule::event).toList());
                send(exchange, 200, body);
            }
            case "/api/local-memory/context" -> {
                requireOnly(query, Set.of("provider", "types", "limit", "before", "q"));
                LocalAiMemoryService.ContextResult result = service.context(provider(query), allTypes(query), limit(query), cursor(query), query.get("q"));
                Map<String, Object> body = ok();
                body.put("chats", result.chats().stream().map(LocalMemoryHttpModule::event).toList());
                body.put("operations", result.operations().stream().map(LocalMemoryHttpModule::event).toList());
                body.put("knowledge", result.knowledge().stream().map(LocalMemoryHttpModule::event).toList());
                send(exchange, 200, body);
            }
            default -> send(exchange, 404, error("LOCAL_MEMORY_NOT_FOUND"));
        }
    }

    private void handlePost(HttpExchange exchange, String path) throws IOException {
        if ("/api/local-memory/restore".equals(path)) { restore(exchange, HttpUtil.query(exchange)); return; }
        Map<String, Object> root = json(exchange);
        switch (path) {
            case "/api/local-memory/events" -> append(exchange, root);
            case "/api/local-memory/forget" -> forget(exchange, root);
            case "/api/local-memory/backup" -> backup(exchange, root);
            default -> send(exchange, 404, error("LOCAL_MEMORY_NOT_FOUND"));
        }
    }

    private void append(HttpExchange exchange, Map<String, Object> root) throws IOException {
        requireOnly(root, Set.of("provider", "event", "events"));
        boolean one = root.containsKey("event"), many = root.containsKey("events");
        if (one == many) invalid();
        List<Object> raw = one ? List.of(root.get("event")) : SimpleJson.asList(root.get("events"));
        if (raw.isEmpty() || raw.size() > LocalMemoryStore.MAX_BATCH) invalid();
        List<LocalAiMemoryService.EventInput> events = new ArrayList<>();
        for (Object item : raw) {
            Map<String, Object> input = strictMap(item);
            requireOnly(input, Set.of("eventId", "stream", "type", "occurredAt", "sourceSequence", "payload"));
            Map<String, Object> payload = strictMap(input.get("payload"));
            if (payload.containsKey("producerProof")) invalid();
            events.add(new LocalAiMemoryService.EventInput(
                string(input, "eventId"), string(input, "stream"), string(input, "type"), nullableEventTimestamp(input, "occurredAt"),
                longValue(input.get("sourceSequence")), payload
            ));
        }
        List<LocalMemoryStore.AppendResult> results = service.append(provider(root), events);
        Map<String, Object> body = ok();
        body.put("results", results.stream().map(result -> Map.of("eventId", result.eventId(), "duplicate", result.duplicate(), "recordedAt", result.recordedAt().toString())).toList());
        send(exchange, 200, body);
    }

    private void forget(HttpExchange exchange, Map<String, Object> root) throws IOException {
        requireOnly(root, Set.of("provider", "stream", "eventIds", "conversationId", "operationId", "types", "occurredBefore", "entireScope"));
        MemorySanitizer.Stream stream = MemorySanitizer.Stream.valueOf(string(root, "stream").toUpperCase(java.util.Locale.ROOT));
        Set<String> ids = new LinkedHashSet<>();
        for (Object id : SimpleJson.asList(root.get("eventIds"))) ids.add(String.valueOf(id));
        Set<String> selectedTypes = fieldTypes(root.get("types"));
        Instant before = root.containsKey("occurredBefore") ? Instant.parse(string(root, "occurredBefore")) : null;
        LocalMemoryStore.ForgetRequest request = new LocalMemoryStore.ForgetRequest(
            service.scopeFor(provider(root)), ids, nullableString(root, "conversationId"), nullableString(root, "operationId"),
            selectedTypes, before, SimpleJson.asBoolean(root.get("entireScope"), false)
        );
        request.requireStream(stream);
        LocalMemoryStore.ForgetResult result = service.forget(provider(root), stream, request);
        Map<String, Object> body = ok(); body.put("count", result.count()); send(exchange, 200, body);
    }

    private void backup(HttpExchange exchange, Map<String, Object> root) throws IOException {
        requireOnly(root, Set.of("provider"));
        service.scopeFor(provider(root)); // authenticate account/provider without accepting an identity selector
        Path archive = service.backup(provider(root));
        try (InputStream input = Files.newInputStream(archive)) {
            exchange.getResponseHeaders().set("Content-Type", "application/octet-stream");
            exchange.getResponseHeaders().set("Content-Disposition", "attachment; filename=local-memory.fememory");
            exchange.getResponseHeaders().set("Cache-Control", "no-store");
            exchange.sendResponseHeaders(200, Files.size(archive));
            input.transferTo(exchange.getResponseBody());
            exchange.close();
        } finally { Files.deleteIfExists(archive); }
    }

    private void restore(HttpExchange exchange, Map<String, String> query) throws IOException {
        Path upload = null;
        try {
            requireOnly(query, Set.of("provider"));
            String provider = provider(query);
            service.scopeFor(provider);
            upload = service.newRestoreUpload(provider);
            copyBounded(exchange.getRequestBody(), upload, MAX_RESTORE_BYTES);
            LocalMemoryStore.RestoreResult result = service.restore(provider, upload);
            Map<String, Object> body = ok(); body.put("records", result.records()); send(exchange, 200, body);
        } finally { if (upload != null) Files.deleteIfExists(upload); }
    }

    private static Map<String, Object> json(HttpExchange exchange) throws IOException {
        return SimpleJson.parseObjectStrict(new String(readBounded(exchange.getRequestBody(), MAX_JSON_BYTES), StandardCharsets.UTF_8));
    }

    private static byte[] readBounded(InputStream input, int maximum) throws IOException {
        byte[] value = input.readNBytes(maximum + 1);
        if (value.length > maximum || input.read() != -1) throw new LocalMemoryException(LocalMemoryException.Code.TOO_LARGE);
        return value;
    }

    private static void copyBounded(InputStream input, Path target, long maximum) throws IOException {
        long count = 0; byte[] buffer = new byte[8192];
        try (OutputStream output = Files.newOutputStream(target, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
            for (int read; (read = input.read(buffer)) >= 0;) {
                count += read; if (count > maximum) throw new LocalMemoryException(LocalMemoryException.Code.TOO_LARGE);
                output.write(buffer, 0, read);
            }
        }
    }

    private Map<String, Object> health(String provider) {
        LocalMemoryStore.Health state = service.health(provider); Map<String, Object> body = ok();
        body.put("available", state.available()); body.put("locked", state.locked()); body.put("schemaVersion", state.schemaVersion()); body.put("code", state.code()); return body;
    }
    private static Map<String, Object> page(List<Map<String, Object>> records, LocalMemoryStore.Cursor next) { Map<String, Object> body = ok(); body.put("records", records); if (next != null) body.put("next", cursor(next)); return body; }
    private static Map<String, Object> event(LocalMemoryStore.StoredEvent stored) { Map<String, Object> body = new LinkedHashMap<>(); body.put("eventId", stored.event().eventId()); body.put("stream", stored.event().stream().name().toLowerCase()); body.put("type", stored.event().type()); body.put("occurredAt", stored.event().occurredAt() == null ? null : stored.event().occurredAt().toString()); body.put("recordedAt", stored.recordedAt().toString()); body.put("sourceSequence", stored.event().sourceSequence()); body.put("payload", stored.event().payload()); return body; }
    private static Map<String, Object> cursor(LocalMemoryStore.Cursor value) { Map<String, Object> body = new LinkedHashMap<>(); body.put("occurredAtMillis", value.occurredAtMillis()); body.put("recordedAtMillis", value.recordedAtMillis()); body.put("sourceSequence", value.sourceSequence()); body.put("eventId", value.eventId()); return body; }
    private static Map<String, Object> ok() { return HttpUtil.ok(); }
    private static Map<String, Object> error(String code) { Map<String, Object> body = HttpUtil.error(code); body.put("errorCode", code); return body; }
    private static void send(HttpExchange exchange, int status, Map<String, Object> value) throws IOException { noStore(exchange); HttpUtil.sendJson(exchange, status, value); }
    private static void noStore(HttpExchange exchange) { exchange.getResponseHeaders().set("Cache-Control", "no-store"); }
    private static void methodNotAllowed(HttpExchange exchange) throws IOException { send(exchange, 405, error("LOCAL_MEMORY_METHOD_NOT_ALLOWED")); }
    private static boolean allows(String path, String method) {
        return switch (path) {
            case "/api/local-memory/health", "/api/local-memory/chats", "/api/local-memory/operations", "/api/local-memory/trace", "/api/local-memory/context" -> "GET".equals(method);
            case "/api/local-memory/events", "/api/local-memory/forget", "/api/local-memory/backup", "/api/local-memory/restore" -> "POST".equals(method);
            default -> false;
        };
    }
    private static int status(LocalMemoryException.Code code) { return switch (code) { case CONFLICT -> 409; case LOCKED -> 423; case FULL, TOO_LARGE -> 507; case BUSY, UNAVAILABLE -> 503; case INTEGRITY, RESTORE_INVALID -> 422; case INVALID_ARGUMENT, EVENT_INVALID -> 400; default -> 500; }; }
    private static void requireOnly(Map<?, ?> value, Set<String> fields) { for (Object key : value.keySet()) if (!(key instanceof String text) || !fields.contains(text)) invalid(); }
    private static Map<String, Object> strictMap(Object value) { if (!(value instanceof Map<?, ?>)) invalid(); return SimpleJson.asMap(value); }
    private static String provider(Map<String, ?> value) { return value.containsKey("provider") ? string(value, "provider") : "netease"; }
    private static String required(Map<String, String> value, String key) { String result = value.get(key); if (result == null || result.isBlank()) invalid(); return result; }
    private static String string(Map<String, ?> value, String key) { Object raw = value.get(key); if (!(raw instanceof String)) invalid(); String text = (String) raw; if (text.isBlank()) invalid(); return text; }
    private static String nullableString(Map<String, ?> value, String key) { if (!value.containsKey(key)) return null; Object raw = value.get(key); if (!(raw instanceof String)) invalid(); String text = (String) raw; if (text.isBlank()) invalid(); return text; }
    private static String nullableEventTimestamp(Map<String, ?> value, String key) { if (!value.containsKey(key) || value.get(key) == null) return null; return nullableString(value, key); }
    private static long longValue(Object raw) { if (!(raw instanceof Number)) invalid(); Number number = (Number) raw; if (number.doubleValue() != Math.rint(number.doubleValue())) invalid(); return number.longValue(); }
    private static int limit(Map<String, String> query) { if (!query.containsKey("limit")) return 100; try { int value = Integer.parseInt(query.get("limit")); if (value < 1 || value > 100) invalid(); return value; } catch (NumberFormatException failure) { invalid(); return 0; } }
    private static LocalMemoryStore.Cursor cursor(Map<String, String> query) { if (!query.containsKey("before")) return null; String[] p = query.get("before").split(",", -1); if (p.length != 4) invalid(); try { return new LocalMemoryStore.Cursor("null".equals(p[0]) ? null : Long.parseLong(p[0]), Long.parseLong(p[1]), Long.parseLong(p[2]), p[3]); } catch (RuntimeException e) { invalid(); return null; } }
    private static Set<String> types(Map<String, String> query, MemorySanitizer.Stream stream) { Set<String> result = allTypes(query); if (result.isEmpty()) return MemorySanitizer.allowedTypes(stream); if (!MemorySanitizer.allowedTypes(stream).containsAll(result)) invalid(); return result; }
    private static Set<String> allTypes(Map<String, String> query) { if (!query.containsKey("types")) return Set.of(); return fieldTypes(query.get("types")); }
    private static Set<String> fieldTypes(Object raw) { if (raw == null) return Set.of(); LinkedHashSet<String> values = new LinkedHashSet<>(); if (raw instanceof String text) { for (String value : text.split(",", -1)) { if (value.isBlank()) invalid(); values.add(value); } } else if (raw instanceof List<?> list) { for (Object value : list) { if (!(value instanceof String)) invalid(); String text = (String) value; if (text.isBlank()) invalid(); values.add(text); } } else invalid(); if (values.size() > 64) invalid(); return Set.copyOf(values); }
    private static void invalid() { throw new LocalMemoryException(LocalMemoryException.Code.INVALID_ARGUMENT); }
}
