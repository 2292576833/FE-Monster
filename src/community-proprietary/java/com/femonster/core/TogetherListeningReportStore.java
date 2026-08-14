package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

final class TogetherListeningReportStore {
    private static final int VERSION = 1;
    private static final long WRITE_INTERVAL_MILLIS = 15_000L;

    private final Path file;
    private final LinkedHashMap<String, LinkedHashMap<String, FriendStats>> users = new LinkedHashMap<>();
    private boolean dirty;
    private long lastWriteAt;

    TogetherListeningReportStore(Path file) {
        this.file = file == null ? null : file.toAbsolutePath().normalize();
        restore();
    }

    synchronized void recordSession(
        String ownerFeId,
        String sessionId,
        long listenMsDelta,
        List<Map<String, Object>> members
    ) {
        String owner = clean(ownerFeId);
        String session = clean(sessionId);
        long delta = Math.max(0L, listenMsDelta);
        if (owner.isBlank() || session.isBlank() || delta <= 0L || members == null || members.isEmpty()) {
            return;
        }

        long now = System.currentTimeMillis();
        LinkedHashMap<String, FriendStats> friends =
            users.computeIfAbsent(owner, ignored -> new LinkedHashMap<>());
        boolean addedSession = false;
        LinkedHashSet<String> recordedFriendIds = new LinkedHashSet<>();
        for (Map<String, Object> member : members) {
            String friendId = memberId(member);
            if (friendId.isBlank() || friendId.equals(owner) || !recordedFriendIds.add(friendId)) continue;

            FriendStats stats = friends.computeIfAbsent(friendId, FriendStats::new);
            stats.username = firstNonBlank(
                SimpleJson.asString(member.get("username"), ""),
                SimpleJson.asString(member.get("nickname"), ""),
                SimpleJson.asString(member.get("name"), ""),
                stats.username
            );
            stats.avatarUrl = firstNonBlank(
                SimpleJson.asString(member.get("avatarUrl"), ""),
                SimpleJson.asString(member.get("avatar"), ""),
                SimpleJson.asString(member.get("headimg"), ""),
                stats.avatarUrl
            );
            stats.totalListenMs = safeAdd(stats.totalListenMs, delta);
            stats.lastListenedAt = Math.max(stats.lastListenedAt, now);
            addedSession |= stats.sessionIds.add(session);
            dirty = true;
        }

        if (dirty) persistIfDue(addedSession);
    }

    synchronized Map<String, Object> report(String ownerFeId) {
        return reportPayload(clean(ownerFeId));
    }

    synchronized Map<String, Object> reportAndFlush(String ownerFeId) {
        persistIfDue(true);
        return reportPayload(clean(ownerFeId));
    }

    private Map<String, Object> reportPayload(String ownerFeId) {
        LinkedHashMap<String, FriendStats> stored =
            users.getOrDefault(ownerFeId, new LinkedHashMap<>());
        List<FriendStats> sorted = new ArrayList<>(stored.values());
        sorted.sort(
            Comparator.comparingLong((FriendStats item) -> item.totalListenMs)
                .reversed()
                .thenComparing(Comparator.comparingLong((FriendStats item) -> item.lastListenedAt).reversed())
                .thenComparing(item -> item.feId)
        );

        List<Map<String, Object>> friends = new ArrayList<>();
        long totalListenMs = 0L;
        long totalSessions = 0L;
        for (FriendStats stats : sorted) {
            Map<String, Object> item = friendPayload(stats);
            friends.add(item);
            totalListenMs = safeAdd(totalListenMs, stats.totalListenMs);
            totalSessions = safeAdd(totalSessions, stats.sessionIds.size());
        }

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("version", VERSION);
        report.put("ownerFeId", ownerFeId);
        report.put("hasHistory", !friends.isEmpty());
        report.put("friendCount", friends.size());
        report.put("totalListenMs", totalListenMs);
        report.put("totalSessions", totalSessions);
        report.put("friends", friends);
        report.put("longestFriend", friends.isEmpty() ? new LinkedHashMap<>() : new LinkedHashMap<>(friends.get(0)));
        return report;
    }

    private static Map<String, Object> friendPayload(FriendStats stats) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("feId", stats.feId);
        item.put("username", stats.username);
        item.put("avatarUrl", stats.avatarUrl);
        item.put("totalListenMs", stats.totalListenMs);
        item.put("sessionCount", stats.sessionIds.size());
        item.put("lastListenedAt", stats.lastListenedAt);
        return item;
    }

    private void restore() {
        if (file == null || !Files.isRegularFile(file)) return;
        try {
            Map<String, Object> root = SimpleJson.parseObjectStrict(
                Files.readString(file, StandardCharsets.UTF_8)
            );
            if (SimpleJson.asInt(root.get("version"), 0) != VERSION) return;
            Map<String, Object> storedUsers = SimpleJson.asMap(root.get("users"));
            for (Map.Entry<String, Object> userEntry : storedUsers.entrySet()) {
                String ownerFeId = clean(userEntry.getKey());
                if (ownerFeId.isBlank()) continue;
                LinkedHashMap<String, FriendStats> friends = new LinkedHashMap<>();
                Map<String, Object> storedFriends =
                    SimpleJson.asMap(SimpleJson.asMap(userEntry.getValue()).get("friends"));
                for (Map.Entry<String, Object> friendEntry : storedFriends.entrySet()) {
                    String friendId = clean(friendEntry.getKey());
                    if (friendId.isBlank() || friendId.equals(ownerFeId)) continue;
                    Map<String, Object> raw = SimpleJson.asMap(friendEntry.getValue());
                    FriendStats stats = new FriendStats(friendId);
                    stats.username = clean(SimpleJson.asString(raw.get("username"), ""));
                    stats.avatarUrl = clean(SimpleJson.asString(raw.get("avatarUrl"), ""));
                    stats.totalListenMs = Math.max(0L, SimpleJson.asLong(raw.get("totalListenMs"), 0L));
                    stats.lastListenedAt = Math.max(0L, SimpleJson.asLong(raw.get("lastListenedAt"), 0L));
                    for (Object sessionValue : SimpleJson.asList(raw.get("sessionIds"))) {
                        String sessionId = clean(String.valueOf(sessionValue));
                        if (!sessionId.isBlank()) stats.sessionIds.add(sessionId);
                    }
                    if (stats.totalListenMs > 0L && !stats.sessionIds.isEmpty()) {
                        friends.put(friendId, stats);
                    }
                }
                if (!friends.isEmpty()) users.put(ownerFeId, friends);
            }
        } catch (IOException | RuntimeException ignored) {
            users.clear();
        }
    }

    private void persistIfDue(boolean force) {
        if (!dirty || file == null) return;
        long now = System.currentTimeMillis();
        if (!force && now - lastWriteAt < WRITE_INTERVAL_MILLIS) return;

        Path temporary = file.resolveSibling(file.getFileName() + ".tmp");
        try {
            Path parent = file.getParent();
            if (parent != null) Files.createDirectories(parent);
            Files.writeString(
                temporary,
                SimpleJson.stringify(storagePayload()),
                StandardCharsets.UTF_8,
                StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING
            );
            try {
                Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException ignored) {
                Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING);
            }
            dirty = false;
            lastWriteAt = now;
        } catch (IOException ignored) {
        } finally {
            try {
                Files.deleteIfExists(temporary);
            } catch (IOException ignored) {
            }
        }
    }

    private Map<String, Object> storagePayload() {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("version", VERSION);
        Map<String, Object> storedUsers = new LinkedHashMap<>();
        for (Map.Entry<String, LinkedHashMap<String, FriendStats>> userEntry : users.entrySet()) {
            Map<String, Object> user = new LinkedHashMap<>();
            Map<String, Object> friends = new LinkedHashMap<>();
            for (FriendStats stats : userEntry.getValue().values()) {
                Map<String, Object> item = new LinkedHashMap<>(friendPayload(stats));
                item.put("sessionIds", new ArrayList<>(stats.sessionIds));
                friends.put(stats.feId, item);
            }
            user.put("friends", friends);
            storedUsers.put(userEntry.getKey(), user);
        }
        root.put("users", storedUsers);
        return root;
    }

    private static String memberId(Map<String, Object> member) {
        if (member == null || member.isEmpty()) return "";
        return clean(firstNonBlank(
            SimpleJson.asString(member.get("feId"), ""),
            SimpleJson.asString(member.get("id"), ""),
            SimpleJson.asString(member.get("userId"), "")
        ));
    }

    private static long safeAdd(long left, long right) {
        if (right <= 0L) return Math.max(0L, left);
        if (left >= Long.MAX_VALUE - right) return Long.MAX_VALUE;
        return Math.max(0L, left) + right;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private static final class FriendStats {
        private final String feId;
        private final LinkedHashSet<String> sessionIds = new LinkedHashSet<>();
        private String username = "";
        private String avatarUrl = "";
        private long totalListenMs;
        private long lastListenedAt;

        private FriendStats(String feId) {
            this.feId = feId;
        }
    }
}
