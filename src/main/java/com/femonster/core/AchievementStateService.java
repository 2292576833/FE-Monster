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
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

public final class AchievementStateService {
    private static final int VERSION = 2;
    private static final Set<String> ACHIEVEMENT_IDS = Set.of(
        "first-block",
        "gap-runner",
        "monster-stomp",
        "all-platforms",
        "secret-left",
        "world-peace",
        "first-play",
        "track-finished",
        "first-favorite",
        "local-import",
        "lyric-council",
        "manual-sync",
        "visual-first",
        "scene-smith",
        "bio-written",
        "first-friend",
        "listen-together",
        "first-danmaku",
        "completionist"
    );
    private static final Set<String> THEMES = Set.of("classic", "forge", "void", "frost");

    private final Path file;
    private final Map<String, AchievementStateService> scopedServices = new LinkedHashMap<>();
    private LinkedHashMap<String, Long> progress = new LinkedHashMap<>();
    private LinkedHashMap<String, Long> unlocked = new LinkedHashMap<>();
    private String pageTheme = "classic";
    private String toastTheme = "classic";
    private boolean soundEnabled = true;
    private LinkedHashMap<String, Long> claimedOrnaments = new LinkedHashMap<>();
    private String equippedAchievementId;
    private long equipmentChangedAt;
    private boolean restoredFromDisk;

    public AchievementStateService(Path file) {
        this.file = file.toAbsolutePath().normalize();
        restore();
    }

    public synchronized Map<String, Object> snapshot() {
        return payload(currentState());
    }

    public synchronized Map<String, Object> snapshot(String scope) {
        return scopedService(scope).snapshot();
    }

    public synchronized Map<String, Object> update(String scope, Map<String, Object> root) throws IOException {
        return scopedService(scope).update(root);
    }

    public synchronized Map<String, Object> mergeRemote(String scope, Map<String, Object> root) throws IOException {
        return scopedService(scope).mergeRemote(root);
    }

    private State currentState() {
        return new State(
            new LinkedHashMap<>(progress),
            new LinkedHashMap<>(unlocked),
            pageTheme,
            toastTheme,
            soundEnabled,
            new LinkedHashMap<>(claimedOrnaments),
            equippedAchievementId,
            equipmentChangedAt,
            true,
            true
        );
    }

    public synchronized Map<String, Object> update(Map<String, Object> root) throws IOException {
        State incoming = validate(root);
        State next = mergeStates(
            currentState(),
            incoming,
            incoming.themesPresent(),
            incoming.soundPreferencePresent()
        );
        write(next);
        apply(next);
        return snapshot();
    }

    private synchronized Map<String, Object> mergeRemote(Map<String, Object> root) throws IOException {
        State incoming = validate(root);
        State next = mergeStates(
            currentState(),
            incoming,
            !restoredFromDisk && incoming.themesPresent(),
            !restoredFromDisk && incoming.soundPreferencePresent()
        );
        write(next);
        apply(next);
        return snapshot();
    }

    private void apply(State next) {
        progress = next.progress();
        unlocked = next.unlocked();
        pageTheme = next.pageTheme();
        toastTheme = next.toastTheme();
        soundEnabled = next.soundEnabled();
        claimedOrnaments = next.claimedOrnaments();
        equippedAchievementId = next.equippedAchievementId();
        equipmentChangedAt = next.equipmentChangedAt();
    }

    private AchievementStateService scopedService(String scope) {
        String normalized = scope == null ? "" : scope.trim();
        if (normalized.isBlank() || "anonymous".equals(normalized)) return this;
        return scopedServices.computeIfAbsent(normalized, ignored ->
            new AchievementStateService(scopedStateFile(normalized))
        );
    }

    private Path scopedStateFile(String scope) {
        Path parent = file.getParent();
        Path directory = (parent == null ? Path.of(".") : parent).resolve("achievement-states");
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(scope.getBytes(StandardCharsets.UTF_8));
            return directory.resolve(HexFormat.of().formatHex(digest) + ".json");
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is unavailable", error);
        }
    }

    private void restore() {
        if (!Files.isRegularFile(file)) return;
        try {
            State restored = validate(SimpleJson.parseObjectStrict(Files.readString(file, StandardCharsets.UTF_8)));
            apply(restored);
            restoredFromDisk = true;
        } catch (IOException | RuntimeException ignored) {
        }
    }

    private static State validate(Map<String, Object> root) {
        long version = root.containsKey("version")
            ? requirePositiveInteger(root.get("version"), "version")
            : 1L;
        if (version != 1L && version != VERSION) {
            throw new IllegalArgumentException("achievement state version must be 1 or 2");
        }

        LinkedHashMap<String, Long> progress = new LinkedHashMap<>();
        Object progressValue = root.get("progress");
        if (progressValue != null) {
            if (!(progressValue instanceof Map<?, ?>)) {
                throw new IllegalArgumentException("achievement state progress must be an object");
            }
            for (Map.Entry<String, Object> entry : SimpleJson.asMap(progressValue).entrySet()) {
                String id = entry.getKey();
                if (!ACHIEVEMENT_IDS.contains(id)) {
                    throw new IllegalArgumentException("invalid achievement progress id: " + id);
                }
                progress.put(id, requireNonNegativeInteger(entry.getValue(), "progress for " + id));
            }
        }

        Object unlockedValue = root.get("unlocked");
        if (unlockedValue != null && !(unlockedValue instanceof Map<?, ?>)) {
            throw new IllegalArgumentException("achievement state unlocked must be an object");
        }
        LinkedHashMap<String, Long> unlocked = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : SimpleJson.asMap(unlockedValue).entrySet()) {
            String id = entry.getKey();
            if (!ACHIEVEMENT_IDS.contains(id)) {
                throw new IllegalArgumentException("invalid achievement id: " + id);
            }
            if (!(entry.getValue() instanceof Map<?, ?>)) {
                throw new IllegalArgumentException("achievement record must be an object: " + id);
            }
            Map<String, Object> record = SimpleJson.asMap(entry.getValue());
            unlocked.put(id, requirePositiveInteger(record.get("unlockedAt"), "unlockedAt for " + id));
        }

        Object themesValue = root.get("themes");
        boolean themesPresent = themesValue != null;
        if (themesPresent && !(themesValue instanceof Map<?, ?>)) {
            throw new IllegalArgumentException("achievement state themes must be an object");
        }
        Map<String, Object> themes = SimpleJson.asMap(themesValue);
        String pageTheme = themesPresent ? requireTheme(themes.get("page"), "page") : "classic";
        String toastTheme = themesPresent ? requireTheme(themes.get("toast"), "toast") : "classic";
        boolean soundEnabled = true;
        Object settingsValue = root.get("settings");
        boolean soundPreferencePresent = false;
        if (settingsValue != null) {
            if (!(settingsValue instanceof Map<?, ?>)) {
                throw new IllegalArgumentException("achievement state settings must be an object");
            }
            Object soundEnabledValue = SimpleJson.asMap(settingsValue).get("soundEnabled");
            if (soundEnabledValue != null) {
                if (!(soundEnabledValue instanceof Boolean enabled)) {
                    throw new IllegalArgumentException("achievement soundEnabled must be a boolean");
                }
                soundEnabled = enabled;
                soundPreferencePresent = true;
            }
        }

        LinkedHashMap<String, Long> claimedOrnaments = new LinkedHashMap<>();
        String equippedAchievementId = null;
        long equipmentChangedAt = 0;
        Object ornamentsValue = root.get("ornaments");
        if (ornamentsValue != null) {
            if (!(ornamentsValue instanceof Map<?, ?>)) {
                throw new IllegalArgumentException("achievement ornaments must be an object");
            }
            Map<String, Object> ornaments = SimpleJson.asMap(ornamentsValue);
            Object claimedValue = ornaments.get("claimed");
            if (claimedValue != null) {
                if (!(claimedValue instanceof Map<?, ?>)) {
                    throw new IllegalArgumentException("achievement claimed ornaments must be an object");
                }
                for (Map.Entry<String, Object> entry : SimpleJson.asMap(claimedValue).entrySet()) {
                    String id = entry.getKey();
                    if (!ACHIEVEMENT_IDS.contains(id)) {
                        throw new IllegalArgumentException("invalid achievement ornament id: " + id);
                    }
                    if (!unlocked.containsKey(id)) {
                        throw new IllegalArgumentException(
                            "claimed ornament requires an unlocked achievement: " + id
                        );
                    }
                    if (!(entry.getValue() instanceof Map<?, ?>)) {
                        throw new IllegalArgumentException("achievement ornament claim must be an object: " + id);
                    }
                    Map<String, Object> claim = SimpleJson.asMap(entry.getValue());
                    claimedOrnaments.put(
                        id,
                        requirePositiveInteger(claim.get("claimedAt"), "claimedAt for " + id)
                    );
                }
            }

            Object equippedValue = ornaments.get("equipped");
            if (equippedValue != null) {
                if (!(equippedValue instanceof Map<?, ?>)) {
                    throw new IllegalArgumentException("achievement equipped ornament must be an object");
                }
                Map<String, Object> equipped = SimpleJson.asMap(equippedValue);
                Object equippedIdValue = equipped.get("achievementId");
                if (equippedIdValue != null) {
                    if (!(equippedIdValue instanceof String id) || !ACHIEVEMENT_IDS.contains(id)) {
                        throw new IllegalArgumentException("invalid equipped achievement ornament");
                    }
                    if (!claimedOrnaments.containsKey(id)) {
                        throw new IllegalArgumentException("equipped ornament must be claimed: " + id);
                    }
                    equippedAchievementId = id;
                }
                Object changedAtValue = equipped.get("changedAt");
                if (changedAtValue != null) {
                    equipmentChangedAt = requireNonNegativeInteger(changedAtValue, "equipment changedAt");
                }
                if (equippedAchievementId != null && equipmentChangedAt == 0) {
                    throw new IllegalArgumentException("equipped ornament changedAt must be positive");
                }
            }
        }
        return new State(
            progress,
            unlocked,
            pageTheme,
            toastTheme,
            soundEnabled,
            claimedOrnaments,
            equippedAchievementId,
            equipmentChangedAt,
            themesPresent,
            soundPreferencePresent
        );
    }

    private static long requirePositiveInteger(Object value, String field) {
        if (!(value instanceof Number number)) {
            throw new IllegalArgumentException(field + " must be a positive integer");
        }
        double numeric = number.doubleValue();
        if (!Double.isFinite(numeric) || numeric <= 0 || numeric != Math.rint(numeric)) {
            throw new IllegalArgumentException(field + " must be a positive integer");
        }
        long result = number.longValue();
        if (result <= 0 || (double) result != numeric) {
            throw new IllegalArgumentException(field + " must be a positive integer");
        }
        return result;
    }

    private static long requireNonNegativeInteger(Object value, String field) {
        if (!(value instanceof Number number)) {
            throw new IllegalArgumentException(field + " must be a non-negative integer");
        }
        double numeric = number.doubleValue();
        if (!Double.isFinite(numeric) || numeric < 0 || numeric != Math.rint(numeric)) {
            throw new IllegalArgumentException(field + " must be a non-negative integer");
        }
        long result = number.longValue();
        if (result < 0 || (double) result != numeric) {
            throw new IllegalArgumentException(field + " must be a non-negative integer");
        }
        return result;
    }

    private static String requireTheme(Object value, String target) {
        if (!(value instanceof String theme) || !THEMES.contains(theme)) {
            throw new IllegalArgumentException("invalid achievement " + target + " theme");
        }
        return theme;
    }

    private static State mergeStates(
        State current,
        State incoming,
        boolean useIncomingThemes,
        boolean useIncomingSoundPreference
    ) {
        LinkedHashMap<String, Long> mergedProgress = new LinkedHashMap<>(current.progress());
        incoming.progress().forEach((id, value) -> mergedProgress.merge(id, value, Math::max));

        LinkedHashMap<String, Long> mergedUnlocked = new LinkedHashMap<>(current.unlocked());
        incoming.unlocked().forEach((id, unlockedAt) ->
            mergedUnlocked.merge(id, unlockedAt, Math::min)
        );

        LinkedHashMap<String, Long> mergedClaims = new LinkedHashMap<>(current.claimedOrnaments());
        incoming.claimedOrnaments().forEach((id, claimedAt) -> {
            if (mergedUnlocked.containsKey(id)) mergedClaims.merge(id, claimedAt, Math::min);
        });
        mergedClaims.keySet().removeIf(id -> !mergedUnlocked.containsKey(id));

        State equipmentSource = incomingEquipmentWins(current, incoming)
            ? incoming
            : current;
        String equippedId = equipmentSource.equippedAchievementId();
        if (equippedId != null && !mergedClaims.containsKey(equippedId)) equippedId = null;

        return new State(
            mergedProgress,
            mergedUnlocked,
            useIncomingThemes ? incoming.pageTheme() : current.pageTheme(),
            useIncomingThemes ? incoming.toastTheme() : current.toastTheme(),
            useIncomingSoundPreference ? incoming.soundEnabled() : current.soundEnabled(),
            mergedClaims,
            equippedId,
            Math.max(current.equipmentChangedAt(), incoming.equipmentChangedAt()),
            true,
            true
        );
    }

    private static boolean incomingEquipmentWins(State current, State incoming) {
        if (incoming.equipmentChangedAt() != current.equipmentChangedAt()) {
            return incoming.equipmentChangedAt() > current.equipmentChangedAt();
        }
        return equipmentOrderKey(incoming.equippedAchievementId())
            .compareTo(equipmentOrderKey(current.equippedAchievementId())) > 0;
    }

    private static String equipmentOrderKey(String achievementId) {
        return achievementId == null || achievementId.isBlank() ? "\uffff" : achievementId;
    }

    private static Map<String, Object> payload(State state) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("version", VERSION);

        root.put("progress", new LinkedHashMap<>(state.progress()));

        Map<String, Object> unlocked = new LinkedHashMap<>();
        state.unlocked().forEach((id, unlockedAt) -> unlocked.put(id, Map.of("unlockedAt", unlockedAt)));
        root.put("unlocked", unlocked);

        Map<String, Object> themes = new LinkedHashMap<>();
        themes.put("page", state.pageTheme());
        themes.put("toast", state.toastTheme());
        root.put("themes", themes);
        root.put("settings", Map.of("soundEnabled", state.soundEnabled()));

        Map<String, Object> claimed = new LinkedHashMap<>();
        state.claimedOrnaments().forEach((id, claimedAt) ->
            claimed.put(id, Map.of("claimedAt", claimedAt))
        );
        Map<String, Object> equipped = new LinkedHashMap<>();
        equipped.put("achievementId", state.equippedAchievementId());
        equipped.put("changedAt", state.equipmentChangedAt());
        Map<String, Object> ornaments = new LinkedHashMap<>();
        ornaments.put("claimed", claimed);
        ornaments.put("equipped", equipped);
        root.put("ornaments", ornaments);
        return root;
    }

    private void write(State state) throws IOException {
        Path parent = file.getParent();
        if (parent != null) Files.createDirectories(parent);
        Path temporary = file.resolveSibling(file.getFileName() + ".tmp");
        try {
            Files.writeString(
                temporary,
                SimpleJson.stringify(payload(state)),
                StandardCharsets.UTF_8,
                StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING
            );
            try {
                Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException ignored) {
                Files.move(temporary, file, StandardCopyOption.REPLACE_EXISTING);
            }
            restoredFromDisk = true;
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private record State(
        LinkedHashMap<String, Long> progress,
        LinkedHashMap<String, Long> unlocked,
        String pageTheme,
        String toastTheme,
        boolean soundEnabled,
        LinkedHashMap<String, Long> claimedOrnaments,
        String equippedAchievementId,
        long equipmentChangedAt,
        boolean themesPresent,
        boolean soundPreferencePresent
    ) {
    }
}
