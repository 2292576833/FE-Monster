package com.femonster.memory;

import com.femonster.community.CommunityClient;
import com.femonster.json.SimpleJson;
import com.femonster.music.MusicProviderRegistry;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.HexFormat;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Application-facing, serialized boundary for encrypted local AI memory.
 * Browser callers may select a provider only; this class derives the storage
 * scope from the current provider account and the community subject.
 */
public final class LocalAiMemoryService implements AutoCloseable {
    private static final String ANONYMOUS_SCOPE = "local-ai-memory:anonymous-device:v1";
    private static final int SCHEMA_VERSION = 1;

    private final Path vaultDirectory;
    private final MusicProviderRegistry music;
    private final CommunityClient community;
    private final Path dpapiDll;
    private final LocalMemoryStore testStore;
    private final Map<String, LocalMemoryStore> stores = new ConcurrentHashMap<>();
    private volatile LocalMemoryStore.Health unavailableHealth;
    private final AtomicBoolean closed = new AtomicBoolean();

    public LocalAiMemoryService(Path vaultDirectory, MusicProviderRegistry music, CommunityClient community, Path dpapiDll) {
        this.vaultDirectory = vaultDirectory.toAbsolutePath().normalize();
        this.music = music;
        this.community = community;
        this.dpapiDll = dpapiDll;
        this.testStore = null;
        this.unavailableHealth = existingRootVault(this.vaultDirectory)
            ? new LocalMemoryStore.Health(false, true, SCHEMA_VERSION, "LOCAL_MEMORY_LOCKED")
            : new LocalMemoryStore.Health(false, false, SCHEMA_VERSION, "LOCAL_MEMORY_UNAVAILABLE");
    }

    /** Test-only composition path for a deterministic encrypted-store fixture. */
    public LocalAiMemoryService(Path vaultDirectory, MusicProviderRegistry music, CommunityClient community, LocalMemoryStore store) {
        this.vaultDirectory = vaultDirectory.toAbsolutePath().normalize();
        this.music = music;
        this.community = community;
        this.dpapiDll = null;
        this.testStore = store;
        this.unavailableHealth = new LocalMemoryStore.Health(false, false, SCHEMA_VERSION, "LOCAL_MEMORY_UNAVAILABLE");
    }

    public LocalMemoryStore.Health health() {
        if (closed.get()) return new LocalMemoryStore.Health(false, false, SCHEMA_VERSION, "LOCAL_MEMORY_CLOSED");
        if (testStore != null) return testStore.health();
        for (LocalMemoryStore value : stores.values()) return value.health();
        return unavailableHealth;
    }

    public boolean available() {
        return health().available();
    }

    /** Probe the selected account, not the presence of files or another open account. */
    public LocalMemoryStore.Health health(String provider) {
        if (closed.get()) return new LocalMemoryStore.Health(false, false, SCHEMA_VERSION, "LOCAL_MEMORY_CLOSED");
        try {
            return storeForScope(scopeFor(provider)).health();
        } catch (LocalMemoryException failure) {
            return new LocalMemoryStore.Health(false, failure.code() == LocalMemoryException.Code.LOCKED,
                SCHEMA_VERSION, failure.code().value());
        } catch (IllegalArgumentException unavailable) {
            return new LocalMemoryStore.Health(false, false, SCHEMA_VERSION, "LOCAL_MEMORY_UNAVAILABLE");
        }
    }

    public List<LocalMemoryStore.AppendResult> append(String provider, List<EventInput> inputs) {
        if (inputs == null || inputs.isEmpty() || inputs.size() > LocalMemoryStore.MAX_BATCH) invalid();
        String scope = scopeFor(provider);
        LocalMemoryStore local = storeForScope(scope);
        List<LocalMemoryEvent> events = new ArrayList<>(inputs.size());
        for (EventInput input : inputs) events.add(input.toEvent(scope));
        return local.appendBatch(events);
    }

    public LocalMemoryStore.Page chats(String provider, Set<String> types, int limit, LocalMemoryStore.Cursor before, String text) {
        return chats(provider, types, limit, before, text, null);
    }

    public LocalMemoryStore.Page chats(String provider, Set<String> types, int limit, LocalMemoryStore.Cursor before, String text, String conversationId) {
        String scope = scopeFor(provider);
        return storeForScope(scope).queryChats(query(scope, types, limit, before, text, MemorySanitizer.Stream.CHAT, conversationId, null, null));
    }

    public LocalMemoryStore.Page operations(String provider, Set<String> types, int limit, LocalMemoryStore.Cursor before, String text) {
        return operations(provider, types, limit, before, text, null, null);
    }

    public LocalMemoryStore.Page operations(String provider, Set<String> types, int limit, LocalMemoryStore.Cursor before, String text, String traceId, String operationId) {
        String scope = scopeFor(provider);
        return storeForScope(scope).queryOperations(query(scope, types, limit, before, text, MemorySanitizer.Stream.OPERATION, null, traceId, operationId));
    }

    public LocalMemoryStore.TraceResult trace(String provider, String traceId, int limit) {
        String scope = scopeFor(provider);
        return storeForScope(scope).queryTrace(new LocalMemoryStore.TraceQuery(scope, traceId, limit));
    }

    public ContextResult context(String provider, Set<String> types, int limit, LocalMemoryStore.Cursor before, String text) {
        Set<String> requested = types == null || types.isEmpty() ? allAllowedTypes() : types;
        List<LocalMemoryStore.StoredEvent> chats = MemorySanitizer.allowedTypes(MemorySanitizer.Stream.CHAT).stream().anyMatch(requested::contains)
            ? chats(provider, intersection(requested, MemorySanitizer.Stream.CHAT), limit, before, text).records() : List.of();
        List<LocalMemoryStore.StoredEvent> operations = MemorySanitizer.allowedTypes(MemorySanitizer.Stream.OPERATION).stream().anyMatch(requested::contains)
            ? operations(provider, intersection(requested, MemorySanitizer.Stream.OPERATION), limit, before, text).records() : List.of();
        String scope = scopeFor(provider);
        List<LocalMemoryStore.StoredEvent> knowledge = MemorySanitizer.allowedTypes(MemorySanitizer.Stream.KNOWLEDGE).stream().anyMatch(requested::contains)
            ? storeForScope(scope).queryKnowledge(query(scope, intersection(requested, MemorySanitizer.Stream.KNOWLEDGE), limit, before, text, MemorySanitizer.Stream.KNOWLEDGE)).records() : List.of();
        return ContextResult.bounded(chats, operations, knowledge, limit);
    }

    public LocalMemoryStore.ForgetResult forget(String provider, MemorySanitizer.Stream stream, LocalMemoryStore.ForgetRequest request) {
        if (stream == null || request == null) invalid();
        String scope = scopeFor(provider);
        if (!scope.equals(request.scope())) invalid();
        LocalMemoryStore local = storeForScope(scope);
        return switch (stream) {
            case CHAT -> local.forgetChats(request);
            case OPERATION -> local.forgetOperations(request);
            case KNOWLEDGE -> local.forgetKnowledge(request);
        };
    }

    public Path backup(String provider) {
        String scope = scopeFor(provider);
        LocalMemoryStore local = storeForScope(scope);
        try {
            Path backups = storeDirectory(scope).resolve("backups");
            Files.createDirectories(backups);
            Path archive = backups.resolve("memory-" + UUID.randomUUID() + ".fememory");
            local.backup(archive);
            return archive;
        } catch (IOException failure) {
            throw new LocalMemoryException(LocalMemoryException.Code.IO_FAILED, failure);
        }
    }

    public LocalMemoryStore.RestoreResult restore(String provider, Path upload) {
        String scope = scopeFor(provider);
        Path root = storeDirectory(scope);
        Path normalized = upload == null ? null : upload.toAbsolutePath().normalize();
        if (normalized == null || !normalized.getParent().equals(root.resolve("backups"))) invalid();
        return storeForScope(scope).restore(normalized);
    }

    /** Creates a fixed vault-owned staging path for a streamed restore body. */
    public Path newRestoreUpload(String provider) {
        String scope = scopeFor(provider);
        storeForScope(scope);
        try {
            Path backups = storeDirectory(scope).resolve("backups");
            Files.createDirectories(backups);
            return backups.resolve(".memory-restore-http-" + UUID.randomUUID() + ".fememory");
        } catch (IOException failure) {
            throw new LocalMemoryException(LocalMemoryException.Code.IO_FAILED, failure);
        }
    }

    /** Commits a sanitized projection through the store-only trusted producer path. */
    public boolean rememberPersonalization(String provider, Map<String, Object> projection) {
        if (projection == null || projection.isEmpty()) return false;
        String scope = scopeFor(provider);
        return storeForScope(scope).appendTrustedPersonalization(scope, projection);
    }

    public boolean migratePersonalization(String provider, Map<String, Object> projection) {
        return rememberPersonalization(provider, projection);
    }

    /** Returns only the authenticated internal encrypted snapshot for offline pet use. */
    public Map<String, Object> personalization(String provider) {
        String scope = scopeFor(provider);
        return storeForScope(scope).trustedPersonalization(scope);
    }

    /** Tombstones the provider's trusted snapshot before local personalization caches are cleared. */
    public boolean forgetPersonalization(String provider) {
        String scope = scopeFor(provider);
        return storeForScope(scope).forgetTrustedPersonalization(scope);
    }

    public String scopeFor(String providerHint) {
        String provider = MusicProviderRegistry.normalize(providerHint);
        Map<String, Object> account = music.accountPayload(provider);
        if (!SimpleJson.asBoolean(account.get("loggedIn"), false)) return scopedHash(ANONYMOUS_SCOPE, false);
        String subject = community.localMemorySubject(provider, music.get(provider).label(), account);
        if (subject == null || subject.isBlank() || subject.length() > 512) {
            throw new LocalMemoryException(LocalMemoryException.Code.LOCKED);
        }
        return scopedHash(subject, true);
    }

    private LocalMemoryStore.Query query(String scope, Set<String> types, int limit, LocalMemoryStore.Cursor before, String text, MemorySanitizer.Stream stream) {
        return query(scope, types, limit, before, text, stream, null, null, null);
    }

    private LocalMemoryStore.Query query(String scope, Set<String> types, int limit, LocalMemoryStore.Cursor before, String text, MemorySanitizer.Stream stream, String conversationId, String traceId, String operationId) {
        Set<String> selected = types == null || types.isEmpty() ? MemorySanitizer.allowedTypes(stream) : types;
        LocalMemoryStore.Query query = new LocalMemoryStore.Query(scope, selected, limit, before, text, conversationId, traceId, operationId);
        query.requireStream(stream);
        return query;
    }

    private Set<String> intersection(Set<String> types, MemorySanitizer.Stream stream) {
        java.util.LinkedHashSet<String> result = new java.util.LinkedHashSet<>(types);
        result.retainAll(MemorySanitizer.allowedTypes(stream));
        return Set.copyOf(result);
    }

    private Set<String> allAllowedTypes() {
        java.util.LinkedHashSet<String> result = new java.util.LinkedHashSet<>();
        for (MemorySanitizer.Stream stream : MemorySanitizer.Stream.values()) result.addAll(MemorySanitizer.allowedTypes(stream));
        return Set.copyOf(result);
    }

    private LocalMemoryStore storeForScope(String scope) {
        if (closed.get()) throw new LocalMemoryException(LocalMemoryException.Code.CLOSED);
        if (testStore != null) return testStore;
        return stores.computeIfAbsent(scope, this::openStore);
    }

    private LocalMemoryStore openStore(String scope) {
        Path directory = storeDirectory(scope);
        try {
            MemoryVaultKeyManager manager = new MemoryVaultKeyManager(
                directory,
                platformKeyProtector(),
                new java.security.SecureRandom()
            );
            try (MemoryVaultKeyManager.KeyLease lease = manager.openOrCreate()) {
                LocalMemoryStore opened = SqliteEncryptedMemoryStore.open(directory, lease);
                unavailableHealth = opened.health();
                return opened;
            }
        } catch (RuntimeException failure) {
            if (failure instanceof LocalMemoryException memory && memory.code() == LocalMemoryException.Code.LOCKED) {
                unavailableHealth = new LocalMemoryStore.Health(false, true, SCHEMA_VERSION, "LOCAL_MEMORY_LOCKED");
            }
            throw failure;
        }
    }

    private Path storeDirectory(String scope) {
        String prefix = scope.startsWith("local-ai-memory:account:v1:") ? "accounts" : "anonymous";
        String hash = scope.substring(scope.lastIndexOf(':') + 1);
        if (!hash.matches("[0-9a-f]{64}")) invalid();
        return vaultDirectory.resolve(prefix).resolve(hash);
    }

    private static String scopedHash(String value, boolean account) {
        byte[] input = ("fe-monster/local-memory-scope/v1\0" + value).getBytes(StandardCharsets.UTF_8);
        byte[] digest;
        try {
            digest = MessageDigest.getInstance("SHA-256").digest(input);
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 unavailable");
        }
        String hash = HexFormat.of().formatHex(digest);
        String prefix = account ? "local-ai-memory:account:v1:" : "local-ai-memory:anonymous-device:v1:";
        return prefix + hash;
    }

    private static boolean existingRootVault(Path root) {
        if (Files.isRegularFile(root.resolve("vault-meta.json"))
            || Files.isRegularFile(root.resolve("vault-key.dpapi"))
            || Files.isRegularFile(root.resolve("memory.db"))) return true;
        for (String bucket : List.of("accounts", "anonymous")) {
            Path parent = root.resolve(bucket);
            if (!Files.isDirectory(parent)) continue;
            try (var children = Files.newDirectoryStream(parent)) {
                for (Path child : children) {
                    if (Files.isRegularFile(child.resolve("vault-meta.json"))
                        || Files.isRegularFile(child.resolve("vault-key.dpapi"))
                        || Files.isRegularFile(child.resolve("memory.db"))) return true;
                }
            } catch (IOException ignored) {
                // A present but unreadable nested vault is not falsely reported as available.
                return true;
            }
        }
        return false;
    }

    private KeyProtector platformKeyProtector() {
        String os = System.getProperty("os.name", "").toLowerCase(java.util.Locale.ROOT);
        if (os.contains("mac") || os.contains("darwin")) {
            return new MacKeychainKeyProtector(dpapiDll);
        }
        return new WindowsDpapiKeyProtector(resolveDpapiDll(dpapiDll));
    }

    private static Path resolveDpapiDll(Path requested) {
        if (requested == null) throw new IllegalArgumentException("DPAPI_UNAVAILABLE");
        Path normalized = requested.toAbsolutePath().normalize();
        if (Files.isRegularFile(normalized)) return normalized;
        Path parent = normalized.getParent();
        Path sourceOrInstalled = parent == null ? normalized : parent.resolve("native").resolve("windows").resolve("build").resolve("fe-monster-wincrypto.dll");
        if (Files.isRegularFile(sourceOrInstalled)) return sourceOrInstalled;
        throw new IllegalArgumentException("DPAPI_UNAVAILABLE");
    }

    private static void invalid() { throw new LocalMemoryException(LocalMemoryException.Code.INVALID_ARGUMENT); }

    @Override public void close() {
        if (!closed.compareAndSet(false, true)) return;
        if (testStore != null) {
            testStore.close();
            return;
        }
        for (LocalMemoryStore value : stores.values()) {
            try { value.close(); } catch (RuntimeException ignored) { }
        }
        stores.clear();
    }

    public record EventInput(String eventId, String stream, String type, String occurredAt, long sourceSequence, Map<String, Object> payload) {
        LocalMemoryEvent toEvent(String scope) {
            try {
                MemorySanitizer.Stream selected = MemorySanitizer.Stream.valueOf(stream.toUpperCase(java.util.Locale.ROOT));
                Instant occurred = occurredAt == null ? null : Instant.parse(occurredAt);
                return new LocalMemoryEvent(eventId, selected, scope, type, occurred, sourceSequence, payload);
            } catch (RuntimeException failure) {
                throw failure instanceof LocalMemoryException memory ? memory
                    : new LocalMemoryException(LocalMemoryException.Code.EVENT_INVALID, failure);
            }
        }
    }

    public record ContextResult(List<LocalMemoryStore.StoredEvent> chats, List<LocalMemoryStore.StoredEvent> operations, List<LocalMemoryStore.StoredEvent> knowledge) {
        public ContextResult { chats = List.copyOf(chats); operations = List.copyOf(operations); knowledge = List.copyOf(knowledge); }
        static ContextResult bounded(List<LocalMemoryStore.StoredEvent> chats, List<LocalMemoryStore.StoredEvent> operations, List<LocalMemoryStore.StoredEvent> knowledge, int limit) {
            record Tagged(int stream, LocalMemoryStore.StoredEvent value) {}
            List<Tagged> ordered = new ArrayList<>();
            chats.forEach(value -> ordered.add(new Tagged(0, value)));
            operations.forEach(value -> ordered.add(new Tagged(1, value)));
            knowledge.forEach(value -> ordered.add(new Tagged(2, value)));
            ordered.sort((left, right) -> right.value().cursor().eventId().compareTo(left.value().cursor().eventId()));
            ordered.sort((left, right) -> compareCursor(right.value().cursor(), left.value().cursor()));
            List<LocalMemoryStore.StoredEvent> selectedChats = new ArrayList<>(), selectedOperations = new ArrayList<>(), selectedKnowledge = new ArrayList<>();
            for (Tagged tagged : ordered.subList(0, Math.min(limit, ordered.size()))) {
                if (tagged.stream == 0) selectedChats.add(tagged.value); else if (tagged.stream == 1) selectedOperations.add(tagged.value); else selectedKnowledge.add(tagged.value);
            }
            return new ContextResult(selectedChats, selectedOperations, selectedKnowledge);
        }
        private static int compareCursor(LocalMemoryStore.Cursor left, LocalMemoryStore.Cursor right) {
            long lo = left.occurredAtMillis() == null ? Long.MIN_VALUE : left.occurredAtMillis(); long ro = right.occurredAtMillis() == null ? Long.MIN_VALUE : right.occurredAtMillis();
            int compared = Long.compare(lo, ro); if (compared != 0) return compared;
            compared = Long.compare(left.recordedAtMillis(), right.recordedAtMillis()); if (compared != 0) return compared;
            compared = Long.compare(left.sourceSequence(), right.sourceSequence()); if (compared != 0) return compared;
            return left.eventId().compareTo(right.eventId());
        }
    }
}
