package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Maintains a small, privacy-filtered local projection of server-owned pet personalization.
 *
 * <p>The source remains authoritative. This module deliberately stores neither an FE ID nor a
 * server response: it stores only the fields that a local model may use for wording and
 * recommendations. Account scopes are mapped to opaque, deterministic filenames so cached
 * projections remain isolated without persisting their identity.</p>
 */
public final class PetPersonalizationSnapshot {
    private static final int SCHEMA_VERSION = 1;
    private static final int MAX_MEMORIES = 12;
    private static final int MAX_HABIT_METRICS = 3;

    private static final Set<String> ALLOWED_MEMORY_CATEGORIES = Set.of(
        "music_preference",
        "music_dislike",
        "response_style",
        "volume_preference",
        "wallpaper_preference",
        "interaction_boundary",
        "care_preference"
    );
    private static final Set<String> ALLOWED_MEMORY_SOURCES = Set.of("explicit", "inferred");
    private static final List<String> HABIT_LIST_KEYS = List.of(
        "topArtists",
        "topTracks",
        "topPlaylists",
        "topProviders",
        "preferredTimes"
    );
    private static final Map<String, Integer> HABIT_TEXT_FIELDS = Map.of(
        "name", 160,
        "title", 160,
        "provider", 40
    );

    private static final Pattern CONTROL_CHARACTERS = Pattern.compile(
        "[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]"
    );
    private static final Pattern SECRET_WORDS = Pattern.compile(
        "(?:password|passwd|secret|credential|token|cookie|authorization|"
            + "api[\\s_-]*key|access[\\s_-]*key|refresh[\\s_-]*key|private[\\s_-]*key|"
            + "密码|口令|验证码|密钥|令牌|银行卡|身份证)",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern SECRET_VALUES = Pattern.compile(
        "(?:\\b(?:sk-|AKIA|ghp_|github_pat_|AIza)[A-Za-z0-9_-]{8,}\\b|"
            + "\\beyJ[A-Za-z0-9_-]{12,}\\.[A-Za-z0-9_-]{12,}\\.[A-Za-z0-9_-]{8,}\\b|"
            + "-----BEGIN [A-Z ]+PRIVATE KEY-----)"
    );
    private static final Pattern CONTACT_OR_IDENTITY = Pattern.compile(
        "(?:[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}|"
            + "(?:\\+?86[- ]?)?1[3-9]\\d{9}|"
            + "\\b\\d{15}(?:\\d{2}[0-9Xx])?\\b|"
            + "(?:住址|家庭地址|详细地址|病史|疾病|诊断|用药|处方|宗教信仰|政治倾向|性取向))",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern PATH_OR_URL = Pattern.compile(
        "(?:https?://|www\\.|(?:^|[\\s\"'])[A-Za-z]:[\\\\/]|"
            + "(?:^|[\\s\"'])(?:/home/|/Users/|/root/|\\\\\\\\))",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern PROMPT_OR_CODE = Pattern.compile(
        "(?:```|<script|\\b(?:system|assistant|developer)\\s*:|"
            + "忽略.{0,12}(?:提示|指令|规则)|系统提示|调用.{0,8}工具|"
            + "执行.{0,8}(?:命令|代码|脚本))",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    /** Supplies signed, server-authoritative public projections for one account scope. */
    public interface Source {
        Map<String, Object> fetchMemories(String scope) throws Exception;

        Map<String, Object> fetchHabits(String scope) throws Exception;
    }

    private final Path storeDirectory;
    private final Source source;
    private final Clock clock;
    private final Map<String, Map<String, Object>> loaded = new ConcurrentHashMap<>();

    public PetPersonalizationSnapshot(Path storeDirectory, Source source, Clock clock) {
        this.storeDirectory = Objects.requireNonNull(storeDirectory, "storeDirectory").toAbsolutePath().normalize();
        this.source = Objects.requireNonNull(source, "source");
        this.clock = Objects.requireNonNull(clock, "clock");
    }

    /** Pulls both server projections, filters them, and atomically replaces this scope's cache. */
    public synchronized Map<String, Object> refresh(String scope) throws Exception {
        String accountScope = requireScope(scope);
        Map<String, Object> memoryResponse = source.fetchMemories(accountScope);
        Map<String, Object> habitResponse = source.fetchHabits(accountScope);
        long now = clock.millis();
        Map<String, Object> projection = projection(memoryResponse, habitResponse, now);
        persist(accountScope, projection);
        loaded.put(accountScope, projection);
        return copy(projection);
    }

    /** Returns only a previously refreshed snapshot; it never performs an implicit network read. */
    public synchronized Map<String, Object> snapshot(String scope) {
        String accountScope = normalizedScope(scope);
        if (accountScope.isEmpty()) return emptyProjection();

        Map<String, Object> cached = loaded.get(accountScope);
        if (cached == null) {
            cached = load(accountScope);
            if (cached == null) return emptyProjection();
            loaded.put(accountScope, cached);
        }

        Map<String, Object> current = sanitizePersistedProjection(cached, clock.millis());
        if (isEmpty(current)) {
            loaded.remove(accountScope);
            deleteQuietly(fileFor(accountScope));
            return emptyProjection();
        }
        if (!current.equals(cached)) {
            loaded.put(accountScope, current);
            persistQuietly(accountScope, current);
        }
        return copy(current);
    }

    /** Invalidates a scope after a forget or privacy change, including its durable copy. */
    public synchronized void invalidate(String scope) {
        String accountScope = normalizedScope(scope);
        if (accountScope.isEmpty()) return;
        loaded.remove(accountScope);
        // Overwrite before deleting so a temporarily locked file cannot resurrect forgotten data.
        persistQuietly(accountScope, emptyProjection());
        deleteQuietly(fileFor(accountScope));
    }

    /** Removes one account's projection without affecting any other cached account. */
    public synchronized void clear(String scope) {
        invalidate(scope);
    }

    private Map<String, Object> projection(
        Map<String, Object> memoryResponse,
        Map<String, Object> habitResponse,
        long now
    ) {
        List<Object> memories = List.of();
        if (isSuccessful(memoryResponse)) {
            memories = sanitizeMemories(SimpleJson.asList(memoryResponse.get("memories")), now);
        }

        Map<String, Object> habits = Map.of();
        if (isSuccessful(habitResponse)) {
            habits = sanitizeHabits(SimpleJson.asMap(habitResponse.get("habits")));
        }
        return buildProjection(now, memories, habits);
    }

    private Map<String, Object> sanitizePersistedProjection(Map<String, Object> value, long now) {
        if (SimpleJson.asInt(value.get("schemaVersion"), -1) != SCHEMA_VERSION) {
            return emptyProjection();
        }
        long capturedAt = SimpleJson.asLong(value.get("capturedAt"), 0);
        if (capturedAt <= 0 || capturedAt > now + 5 * 60_000L) return emptyProjection();
        List<Object> memories = sanitizeMemories(SimpleJson.asList(value.get("memories")), now);
        Map<String, Object> habits = sanitizeHabits(SimpleJson.asMap(value.get("habits")));
        return buildProjection(capturedAt, memories, habits);
    }

    private List<Object> sanitizeMemories(List<Object> values, long now) {
        List<Object> result = new ArrayList<>();
        for (Object item : values) {
            if (result.size() >= MAX_MEMORIES) break;
            Map<String, Object> sourceValue = SimpleJson.asMap(item);
            String category = boundedText(sourceValue.get("category"), 40);
            if (!ALLOWED_MEMORY_CATEGORIES.contains(category)) continue;

            String memoryValue = boundedText(sourceValue.get("value"), 240);
            if (!isSafeText(memoryValue)) continue;
            long expiresAt = SimpleJson.asLong(sourceValue.get("expiresAt"), 0);
            if (expiresAt <= now) continue;

            String memorySource = boundedText(sourceValue.get("source"), 20).toLowerCase(Locale.ROOT);
            if (!ALLOWED_MEMORY_SOURCES.contains(memorySource)) continue;
            double fallback = memorySource.equals("inferred") ? 0.6 : 1.0;
            double confidence = finiteDouble(sourceValue.get("confidence"), fallback);

            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("category", category);
            entry.put("value", memoryValue);
            entry.put("source", memorySource);
            entry.put("confidence", Math.max(0.0, Math.min(1.0, confidence)));
            entry.put("expiresAt", expiresAt);
            result.add(entry);
        }
        return result;
    }

    private Map<String, Object> sanitizeHabits(Map<String, Object> sourceValue) {
        if (sourceValue.isEmpty()) return Map.of();

        Map<String, Object> result = new LinkedHashMap<>();
        boolean enabled = SimpleJson.asBoolean(sourceValue.get("enabled"), true);
        result.put("enabled", enabled);
        result.put("totalListenMs", nonNegativeLong(sourceValue.get("totalListenMs")));
        result.put("observations", nonNegativeLong(sourceValue.get("observations")));
        result.put("updatedAt", nonNegativeLong(sourceValue.get("updatedAt")));
        for (String key : HABIT_LIST_KEYS) {
            result.put(key, enabled ? sanitizeHabitMetrics(SimpleJson.asList(sourceValue.get(key))) : List.of());
        }
        return result;
    }

    private List<Object> sanitizeHabitMetrics(List<Object> values) {
        List<Map<String, Object>> candidates = new ArrayList<>();
        for (Object item : values) {
            Map<String, Object> sourceValue = SimpleJson.asMap(item);
            Map<String, Object> metric = new LinkedHashMap<>();
            for (Map.Entry<String, Integer> field : HABIT_TEXT_FIELDS.entrySet()) {
                String text = boundedText(sourceValue.get(field.getKey()), field.getValue());
                if (!text.isEmpty() && isSafeText(text)) metric.put(field.getKey(), text);
            }
            metric.put("listenMs", nonNegativeLong(sourceValue.get("listenMs")));
            metric.put("plays", nonNegativeLong(sourceValue.get("plays")));
            metric.put("lastAt", nonNegativeLong(sourceValue.get("lastAt")));
            boolean hasLabel = HABIT_TEXT_FIELDS.keySet().stream().anyMatch(metric::containsKey);
            if (hasLabel) candidates.add(metric);
        }
        candidates.sort(
            Comparator.<Map<String, Object>>comparingLong(value -> SimpleJson.asLong(value.get("listenMs"), 0))
                .reversed()
                .thenComparing(
                    Comparator.comparingLong(
                        (Map<String, Object> value) -> SimpleJson.asLong(value.get("lastAt"), 0)
                    ).reversed()
                )
        );
        return new ArrayList<>(candidates.subList(0, Math.min(MAX_HABIT_METRICS, candidates.size())));
    }

    private Map<String, Object> buildProjection(long capturedAt, List<Object> memories, Map<String, Object> habits) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("schemaVersion", SCHEMA_VERSION);
        result.put("capturedAt", capturedAt);
        result.put("memories", new ArrayList<>(memories));
        result.put("habits", new LinkedHashMap<>(habits));
        return result;
    }

    private Map<String, Object> emptyProjection() {
        return buildProjection(0, List.of(), Map.of());
    }

    private boolean isEmpty(Map<String, Object> projection) {
        return SimpleJson.asList(projection.get("memories")).isEmpty()
            && SimpleJson.asMap(projection.get("habits")).isEmpty();
    }

    private Map<String, Object> load(String scope) {
        Path file = fileFor(scope);
        if (!Files.isRegularFile(file)) return null;
        try {
            String json = Files.readString(file, StandardCharsets.UTF_8);
            Map<String, Object> parsed = SimpleJson.parseObjectStrict(json);
            Map<String, Object> projection = sanitizePersistedProjection(parsed, clock.millis());
            if (isEmpty(projection)) {
                deleteQuietly(file);
                return null;
            }
            return projection;
        } catch (RuntimeException | IOException exception) {
            deleteQuietly(file);
            return null;
        }
    }

    private void persist(String scope, Map<String, Object> projection) throws IOException {
        Files.createDirectories(storeDirectory);
        Path destination = fileFor(scope);
        Path temporary = storeDirectory.resolve("." + UUID.randomUUID() + ".tmp");
        try {
            Files.writeString(
                temporary,
                SimpleJson.stringify(projection),
                StandardCharsets.UTF_8,
                StandardOpenOption.CREATE_NEW,
                StandardOpenOption.WRITE
            );
            try {
                Files.move(
                    temporary,
                    destination,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING
                );
            } catch (AtomicMoveNotSupportedException exception) {
                Files.move(temporary, destination, StandardCopyOption.REPLACE_EXISTING);
            }
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private void persistQuietly(String scope, Map<String, Object> projection) {
        try {
            persist(scope, projection);
        } catch (IOException ignored) {
            // The in-memory sanitized projection remains usable; a later refresh can retry storage.
        }
    }

    private Path fileFor(String scope) {
        return storeDirectory.resolve(scopeHash(scope) + ".json");
    }

    private String scopeHash(String scope) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(scope.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // Invalidated data is removed from memory even if the filesystem is temporarily unavailable.
        }
    }

    private boolean isSuccessful(Map<String, Object> response) {
        return response != null && SimpleJson.asBoolean(response.get("ok"), false);
    }

    private String requireScope(String value) {
        String scope = normalizedScope(value);
        if (scope.isEmpty()) throw new IllegalArgumentException("account scope is required");
        return scope;
    }

    private String normalizedScope(String value) {
        if (value == null) return "";
        String scope = CONTROL_CHARACTERS.matcher(value).replaceAll("").trim();
        if (scope.length() > 512) return "";
        return scope;
    }

    private String boundedText(Object value, int maximum) {
        String text = SimpleJson.asString(value, "");
        text = CONTROL_CHARACTERS.matcher(text).replaceAll("").replaceAll("\\s+", " ").trim();
        return text.length() <= maximum ? text : text.substring(0, maximum);
    }

    private boolean isSafeText(String value) {
        if (value.isEmpty()) return false;
        return !SECRET_WORDS.matcher(value).find()
            && !SECRET_VALUES.matcher(value).find()
            && !CONTACT_OR_IDENTITY.matcher(value).find()
            && !PATH_OR_URL.matcher(value).find()
            && !PROMPT_OR_CODE.matcher(value).find();
    }

    private long nonNegativeLong(Object value) {
        return Math.max(0, SimpleJson.asLong(value, 0));
    }

    private double finiteDouble(Object value, double fallback) {
        double number = SimpleJson.asDouble(value, fallback);
        return Double.isFinite(number) ? number : fallback;
    }

    private Map<String, Object> copy(Map<String, Object> value) {
        return SimpleJson.parseObjectStrict(SimpleJson.stringify(value));
    }
}
