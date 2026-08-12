package com.femonster.core;

import com.femonster.json.SimpleJson;
import com.femonster.model.Song;
import com.femonster.music.MusicProviderRegistry;
import com.femonster.music.PlaybackSource;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public final class PlayerService {
    private static final long SAVE_DEBOUNCE_MILLIS = 180;
    private static final long SAVE_FLUSH_TIMEOUT_MILLIS = 2000;
    private static final int MAX_QUEUE_SIZE = 2_000;
    private static final int MAX_QUEUE_PAGE_SIZE = 200;

    private final Path stateFile;
    private final MusicProviderRegistry music;
    private final List<Song> queue = new ArrayList<>();
    private final ScheduledExecutorService persistenceExecutor = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "fe-player-state-writer");
        thread.setDaemon(true);
        return thread;
    });
    private ScheduledFuture<?> pendingSave;
    private long stateRevision = 0;
    private long queueRevision = 0;
    private long loadRevision = 0;
    private boolean closed = false;
    private Song currentSong = Song.empty();
    private int queueIndex = -1;
    private boolean playing = false;
    private boolean audioLoaded = false;
    private int position = 0;
    private int duration = 0;
    private double volume = 0.8;
    private String url = "";
    private String quality = "standard";
    private String error = "";
    private Map<String, Object> playbackRestriction = Map.of();
    private long clockStartedAt = System.currentTimeMillis();
    private int positionAtClockStart = 0;

    public PlayerService(Path stateFile, MusicProviderRegistry music) {
        this.stateFile = stateFile;
        this.music = music;
        restore();
    }

    public synchronized Map<String, Object> state() {
        refreshClock();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("playing", playing);
        body.put("paused", !playing);
        body.put("mode", audioLoaded ? "java-url" : "idle");
        body.put("position", position);
        body.put("duration", duration);
        body.put("song", currentSong.toMap());
        body.put("queueLength", queue.size());
        body.put("queueIndex", queueIndex);
        body.put("queueRevision", queueRevision);
        body.put("url", url);
        body.put("quality", quality);
        body.put("volume", volume);
        body.put("playable", audioLoaded && error.isBlank());
        body.put("error", error);
        if (!playbackRestriction.isEmpty()) {
            body.put("restriction", new LinkedHashMap<>(playbackRestriction));
        }
        return body;
    }

    public synchronized Map<String, Object> setVolume(double value) {
        volume = Math.max(0.0, Math.min(1.0, value));
        save();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("volume", volume);
        body.put("playing", playing);
        return body;
    }

    public synchronized Map<String, Object> seek(int nextPosition) {
        position = Math.max(0, Math.min(nextPosition, Math.max(duration, 86400)));
        positionAtClockStart = position;
        clockStartedAt = System.currentTimeMillis();
        save();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("playing", playing);
        body.put("position", position);
        body.put("duration", duration);
        return body;
    }

    public Map<String, Object> toggle() {
        boolean pause;
        synchronized (this) {
            pause = playing;
        }
        return pause ? pause() : play();
    }

    public Map<String, Object> play() {
        Song songToResolve;
        String requestedQuality;
        synchronized (this) {
            if (!audioLoaded && currentSong.hasIdentity()) {
                songToResolve = currentSong;
                requestedQuality = quality;
            } else {
                playing = audioLoaded && error.isBlank();
                positionAtClockStart = position;
                clockStartedAt = System.currentTimeMillis();
                save();
                Map<String, Object> body = transportBody(true);
                body.put("playable", audioLoaded && error.isBlank());
                return body;
            }
        }
        return load(songToResolve, requestedQuality);
    }

    public synchronized Map<String, Object> pause() {
        loadRevision += 1;
        refreshClock();
        playing = false;
        save();
        return transportBody(true);
    }

    public Map<String, Object> previous() {
        return playQueueOffset(-1);
    }

    public Map<String, Object> next() {
        return playQueueOffset(1);
    }

    public Map<String, Object> load(Song song, String quality) {
        if (song == null || !song.hasIdentity()) {
            synchronized (this) {
                loadRevision += 1;
                playing = false;
                audioLoaded = false;
                error = "no song id";
                playbackRestriction = Map.of();
                return transportBody(false);
            }
        }
        String requestedQuality = normalizeQuality(quality);
        long revision;
        synchronized (this) {
            if (closed) return supersededLoadBody();
            revision = ++loadRevision;
        }
        PlaybackSource source = music.resolvePlayback(
            MusicProviderRegistry.providerFromSong(song),
            song,
            requestedQuality
        );
        synchronized (this) {
            if (closed || revision != loadRevision) return supersededLoadBody();
            currentSong = song;
            duration = song.duration > 0 ? song.duration : 271;
            position = 0;
            positionAtClockStart = 0;
            this.quality = source.quality().isBlank() ? requestedQuality : source.quality();
            url = source.url();
            playbackRestriction = source.restriction();
            audioLoaded = source.playable();
            playing = audioLoaded;
            // URL resolution may take seconds. Start the server clock afterwards so
            // its zero point matches the browser's actual playback start.
            clockStartedAt = System.currentTimeMillis();
            error = audioLoaded ? "" : source.errorMessage();
            syncQueueIndexToCurrentSong();
            save();

            Map<String, Object> body = transportBody(true);
            body.put("song", currentSong.toMap());
            body.put("url", url);
            body.put("quality", this.quality);
            body.put("playable", audioLoaded && error.isBlank());
            if (!playbackRestriction.isEmpty()) {
                body.put("restriction", new LinkedHashMap<>(playbackRestriction));
            }
            return body;
        }
    }

    public synchronized Map<String, Object> setQueue(List<Song> songs, int currentIndex) {
        List<Song> nextQueue = new ArrayList<>();
        if (songs != null) {
            for (Song song : songs) {
                if (song != null && song.hasIdentity()) nextQueue.add(song);
                if (nextQueue.size() >= MAX_QUEUE_SIZE) break;
            }
        }
        boolean membershipChanged = !sameQueue(queue, nextQueue);
        queue.clear();
        queue.addAll(nextQueue);
        if (membershipChanged) queueRevision += 1;
        boolean explicitSelection = currentIndex >= 0 && currentIndex < queue.size();
        queueIndex = explicitSelection ? currentIndex : -1;
        if (!explicitSelection) syncQueueIndexToCurrentSong();
        save();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("length", queue.size());
        body.put("queueLength", queue.size());
        body.put("queueIndex", queueIndex);
        body.put("queueRevision", queueRevision);
        return body;
    }

    public synchronized Map<String, Object> mergeQueue(List<Song> incoming, String mode) {
        int added = 0;
        Set<String> queuedIds = new HashSet<>();
        for (Song song : queue) {
            if (song != null && song.id != null) queuedIds.add(song.id);
        }
        if ("next".equalsIgnoreCase(mode)) {
            List<Song> toInsert = new ArrayList<>();
            for (Song song : incoming) {
                if (queue.size() + toInsert.size() >= MAX_QUEUE_SIZE) break;
                if (song != null && song.hasIdentity() && queuedIds.add(song.id)) {
                    toInsert.add(song);
                }
            }
            int insertAt = Math.max(0, Math.min(queueIndex >= 0 ? queueIndex + 1 : 0, queue.size()));
            queue.addAll(insertAt, toInsert);
            added = toInsert.size();
        } else {
            for (Song song : incoming) {
                if (queue.size() >= MAX_QUEUE_SIZE) break;
                if (song != null && song.hasIdentity() && queuedIds.add(song.id)) {
                    queue.add(song);
                    added++;
                }
            }
        }
        if (added > 0) queueRevision += 1;
        if (queueIndex >= queue.size()) queueIndex = -1;
        save();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("mode", mode == null || mode.isBlank() ? "append" : mode);
        body.put("length", queue.size());
        body.put("queueLength", queue.size());
        body.put("queueIndex", queueIndex);
        body.put("queueRevision", queueRevision);
        body.put("added", added);
        return body;
    }

    public synchronized Map<String, Object> queuePage(int requestedCursor, int requestedLimit) {
        int cursor = Math.max(0, Math.min(requestedCursor, queue.size()));
        int limit = Math.max(1, Math.min(requestedLimit, MAX_QUEUE_PAGE_SIZE));
        int end = Math.min(queue.size(), cursor + limit);
        List<Map<String, Object>> items = new ArrayList<>();
        for (int index = cursor; index < end; index++) {
            items.add(queue.get(index).toQueueMap(index, index == queueIndex));
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("items", items);
        body.put("total", queue.size());
        body.put("cursor", cursor);
        body.put("limit", limit);
        body.put("nextCursor", end < queue.size() ? end : null);
        body.put("queueIndex", queueIndex);
        body.put("queueRevision", queueRevision);
        return body;
    }

    public synchronized List<Song> queueSnapshot() {
        return new ArrayList<>(queue);
    }

    public void flush() {
        flushInternal(false);
    }

    public void close() {
        if (!flushInternal(true)) return;
        persistenceExecutor.shutdown();
        try {
            if (!persistenceExecutor.awaitTermination(SAVE_FLUSH_TIMEOUT_MILLIS, TimeUnit.MILLISECONDS)) {
                persistenceExecutor.shutdownNow();
            }
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
            persistenceExecutor.shutdownNow();
        }
    }

    private Map<String, Object> playQueueOffset(int offset) {
        List<Song> queueSnapshot;
        int startIndex;
        String requestedQuality;
        synchronized (this) {
            if (queue.isEmpty()) {
                playing = false;
                error = "queue empty";
                save();
                Map<String, Object> body = transportBody(false);
                body.put("action", offset < 0 ? "previous" : "next");
                return body;
            }
            queueSnapshot = List.copyOf(queue);
            startIndex = queueIndex;
            requestedQuality = quality;
        }
        Map<String, Object> body = null;
        if (startIndex < 0 || startIndex >= queueSnapshot.size()) {
            startIndex = offset > 0 ? -1 : queueSnapshot.size();
        }
        for (int attempt = 0; attempt < queueSnapshot.size(); attempt++) {
            int candidateIndex = Math.floorMod(startIndex + (offset * (attempt + 1)), queueSnapshot.size());
            body = load(queueSnapshot.get(candidateIndex), requestedQuality);
            if (Boolean.TRUE.equals(body.get("playable")) && !String.valueOf(body.getOrDefault("url", "")).isBlank()) {
                body.put("action", offset < 0 ? "previous" : "next");
                body.put("skipped", attempt);
                return body;
            }
        }
        if (body == null) {
            synchronized (this) {
                body = transportBody(false);
            }
        }
        body.put("action", offset < 0 ? "previous" : "next");
        body.put("skipped", queueSnapshot.size());
        body.put("error", "no playable songs in queue");
        return body;
    }

    private Map<String, Object> supersededLoadBody() {
        Map<String, Object> body = transportBody(false);
        body.put("playable", false);
        body.put("superseded", true);
        return body;
    }

    private Map<String, Object> transportBody(boolean ok) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", ok);
        body.put("playing", playing);
        body.put("queueIndex", queueIndex);
        body.put("queueLength", queue.size());
        body.put("queueRevision", queueRevision);
        body.put("song", currentSong.toMap());
        body.put("url", url);
        body.put("quality", quality);
        body.put("playable", audioLoaded && error.isBlank());
        body.put("error", error);
        if (!playbackRestriction.isEmpty()) {
            body.put("restriction", new LinkedHashMap<>(playbackRestriction));
        }
        return body;
    }

    private static String normalizeQuality(String value) {
        return value == null || value.isBlank() ? "standard" : value.trim();
    }

    private List<Map<String, Object>> queueMaps() {
        List<Map<String, Object>> items = new ArrayList<>();
        for (int i = 0; i < queue.size(); i++) {
            items.add(queue.get(i).toQueueMap(i, i == queueIndex));
        }
        return items;
    }

    private static boolean sameQueue(List<Song> left, List<Song> right) {
        if (left.size() != right.size()) return false;
        for (int index = 0; index < left.size(); index++) {
            Song leftSong = left.get(index);
            Song rightSong = right.get(index);
            if (leftSong == rightSong) continue;
            if (leftSong == null || rightSong == null || !leftSong.toMap().equals(rightSong.toMap())) return false;
        }
        return true;
    }

    private void syncQueueIndexToCurrentSong() {
        if (!currentSong.hasIdentity()) return;
        for (int i = 0; i < queue.size(); i++) {
            if (currentSong.id.equals(queue.get(i).id)) {
                queueIndex = i;
                return;
            }
        }
    }

    private void refreshClock() {
        if (!playing || !audioLoaded) return;
        int elapsed = (int) ((System.currentTimeMillis() - clockStartedAt) / 1000L);
        position = Math.max(0, positionAtClockStart + elapsed);
        if (duration > 0 && position >= duration) {
            position = duration;
            playing = false;
        }
    }

    private void restore() {
        try {
            if (!Files.exists(stateFile)) return;
            Map<String, Object> root = SimpleJson.parseObject(Files.readString(stateFile, StandardCharsets.UTF_8));
            currentSong = Song.fromMap(SimpleJson.asMap(root.get("song")));
            position = SimpleJson.asInt(root.get("position"), 0);
            duration = SimpleJson.asInt(root.get("duration"), currentSong.duration);
            volume = SimpleJson.asDouble(root.get("volume"), 0.8);
            quality = normalizeQuality(SimpleJson.asString(root.get("quality"), "standard"));
            queueIndex = SimpleJson.asInt(root.get("queueIndex"), -1);
            queueRevision = Math.max(0L, SimpleJson.asLong(root.get("queueRevision"), 0L));
            url = SimpleJson.asString(root.get("url"), "");
            audioLoaded = !url.isBlank();
            playing = false;
            queue.clear();
            for (Object item : SimpleJson.asList(root.get("queue"))) {
                Song song = Song.fromMap(SimpleJson.asMap(item));
                if (song.hasIdentity()) queue.add(song);
                if (queue.size() >= MAX_QUEUE_SIZE) break;
            }
            if (!queue.isEmpty() && queueRevision == 0) queueRevision = 1;
        } catch (IOException ignored) {
        }
    }

    private synchronized void save() {
        if (closed) return;
        long revision = ++stateRevision;
        if (pendingSave != null) pendingSave.cancel(false);
        pendingSave = persistenceExecutor.schedule(
            () -> persistRevision(revision),
            SAVE_DEBOUNCE_MILLIS,
            TimeUnit.MILLISECONDS
        );
    }

    private void persistRevision(long revision) {
        String json;
        synchronized (this) {
            if (closed || revision != stateRevision) return;
            pendingSave = null;
            json = persistentStateJson();
        }
        writeState(json);
    }

    private boolean flushInternal(boolean closing) {
        String json;
        synchronized (this) {
            if (closed) return false;
            if (closing) closed = true;
            stateRevision += 1;
            if (pendingSave != null) pendingSave.cancel(false);
            pendingSave = null;
            json = persistentStateJson();
        }

        Future<?> write;
        try {
            write = persistenceExecutor.submit(() -> writeState(json));
        } catch (RejectedExecutionException ignored) {
            writeState(json);
            return true;
        }
        try {
            write.get(SAVE_FLUSH_TIMEOUT_MILLIS, TimeUnit.MILLISECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        } catch (ExecutionException | TimeoutException ignored) {
        }
        return true;
    }

    private String persistentStateJson() {
        Map<String, Object> root = new LinkedHashMap<>(state());
        root.put("queue", queueMaps());
        root.put("playing", false);
        return SimpleJson.stringify(root);
    }

    private void writeState(String json) {
        try {
            Path parent = stateFile.getParent();
            if (parent != null) Files.createDirectories(parent);
            Path temp = stateFile.resolveSibling(stateFile.getFileName().toString() + ".tmp");
            Files.writeString(temp, json, StandardCharsets.UTF_8);
            try {
                Files.move(temp, stateFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException ignored) {
                Files.move(temp, stateFile, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException ignored) {
        }
    }
}
