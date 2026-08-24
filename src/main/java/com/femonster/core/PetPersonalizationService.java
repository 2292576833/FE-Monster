package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.nio.file.Path;
import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Account-aware facade for the sanitized pet-personalization cache.
 *
 * <p>The browser supplies only a music provider. {@link AccountSource} resolves that provider
 * against the currently authenticated account and returns an internal scope which is hashed by
 * {@link PetPersonalizationSnapshot}. Raw FE IDs and provider account identifiers are never part
 * of this module's public response.</p>
 */
public final class PetPersonalizationService {
    private static final long REFRESH_INTERVAL_MILLIS = 60_000L;

    /** Narrow authenticated adapter implemented by the application composition root. */
    public interface AccountSource {
        String scope(String provider, String providerLabel, Map<String, Object> accountPayload);

        Map<String, Object> memories(
            String provider,
            String providerLabel,
            Map<String, Object> accountPayload
        ) throws Exception;

        Map<String, Object> habits(
            String provider,
            String providerLabel,
            Map<String, Object> accountPayload
        ) throws Exception;
    }

    private final Path storeDirectory;
    private final AccountSource source;
    private final Clock clock;
    private final Map<String, Long> refreshedAt = new ConcurrentHashMap<>();
    private final Map<String, Object> scopeLocks = new ConcurrentHashMap<>();

    public PetPersonalizationService(Path storeDirectory, AccountSource source, Clock clock) {
        this.storeDirectory = Objects.requireNonNull(storeDirectory, "storeDirectory")
            .toAbsolutePath()
            .normalize();
        this.source = Objects.requireNonNull(source, "source");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    /** Refreshes online when needed, otherwise returns only the previously sanitized cache. */
    public Map<String, Object> projection(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload
    ) {
        String scope = resolveScope(provider, providerLabel, accountPayload);
        if (scope.isBlank()) return response("none", true, emptyProjection());

        Object lock = scopeLocks.computeIfAbsent(scope, ignored -> new Object());
        synchronized (lock) {
            PetPersonalizationSnapshot snapshot = snapshotFor(
                scope,
                provider,
                providerLabel,
                accountPayload
            );
            long now = clock.millis();
            Map<String, Object> cached = snapshot.snapshot(scope);
            Long lastRefresh = refreshedAt.get(scope);
            if (lastRefresh != null && now - lastRefresh < REFRESH_INTERVAL_MILLIS && available(cached)) {
                return response("server", false, cached);
            }
            try {
                Map<String, Object> fresh = snapshot.refresh(scope);
                refreshedAt.put(scope, now);
                return response("server", false, fresh);
            } catch (Exception ignored) {
                Map<String, Object> offline = snapshot.snapshot(scope);
                return response(available(offline) ? "cache" : "none", true, offline);
            }
        }
    }

    /** Drops the current authenticated account's cached projection after a forget operation. */
    public void invalidate(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload
    ) {
        String scope = resolveScope(provider, providerLabel, accountPayload);
        if (scope.isBlank()) return;
        Object lock = scopeLocks.computeIfAbsent(scope, ignored -> new Object());
        synchronized (lock) {
            snapshotFor(scope, provider, providerLabel, accountPayload).invalidate(scope);
            refreshedAt.remove(scope);
        }
    }

    private PetPersonalizationSnapshot snapshotFor(
        String scope,
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload
    ) {
        Map<String, Object> account = accountPayload == null
            ? Map.of()
            : SimpleJson.parseObjectStrict(SimpleJson.stringify(accountPayload));
        return new PetPersonalizationSnapshot(storeDirectory, new PetPersonalizationSnapshot.Source() {
            @Override
            public Map<String, Object> fetchMemories(String requestedScope) throws Exception {
                requireSameScope(scope, requestedScope);
                return requireSuccessful(source.memories(provider, providerLabel, account), "memories");
            }

            @Override
            public Map<String, Object> fetchHabits(String requestedScope) throws Exception {
                requireSameScope(scope, requestedScope);
                return requireSuccessful(source.habits(provider, providerLabel, account), "habits");
            }
        }, clock);
    }

    private String resolveScope(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload
    ) {
        if (accountPayload == null || !SimpleJson.asBoolean(accountPayload.get("loggedIn"), false)) return "";
        try {
            String value = source.scope(provider, providerLabel, accountPayload);
            return value == null || value.length() > 512 ? "" : value.trim();
        } catch (RuntimeException ignored) {
            return "";
        }
    }

    private Map<String, Object> requireSuccessful(Map<String, Object> value, String kind) throws Exception {
        if (value == null || !SimpleJson.asBoolean(value.get("ok"), false)) {
            throw new java.io.IOException("pet personalization " + kind + " source is unavailable");
        }
        return value;
    }

    private void requireSameScope(String expected, String actual) {
        if (!expected.equals(actual)) throw new SecurityException("pet personalization scope changed during refresh");
    }

    private Map<String, Object> response(String sourceName, boolean stale, Map<String, Object> projection) {
        Map<String, Object> safe = projection == null ? emptyProjection() : projection;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("ok", true);
        result.put("available", available(safe));
        result.put("source", sourceName);
        result.put("stale", stale);
        result.put("personalization", safe);
        return result;
    }

    private boolean available(Map<String, Object> projection) {
        return !SimpleJson.asList(projection.get("memories")).isEmpty()
            || !SimpleJson.asMap(projection.get("habits")).isEmpty();
    }

    private Map<String, Object> emptyProjection() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("schemaVersion", 1);
        result.put("capturedAt", 0);
        result.put("memories", java.util.List.of());
        result.put("habits", Map.of());
        return result;
    }
}
