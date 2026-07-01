package com.femonster.core;

import com.femonster.json.SimpleJson;
import com.femonster.model.Song;
import com.femonster.netease.NeteaseClient;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class PlayerService {
    private final Path stateFile;
    private final NeteaseClient netease;
    private final List<Song> queue = new ArrayList<>();
    private Song currentSong = Song.empty();
    private int queueIndex = -1;
    private boolean playing = false;
    private boolean audioLoaded = false;
    private int position = 0;
    private int duration = 0;
    private double volume = 0.8;
    private String url = "";
    private String error = "";
    private long clockStartedAt = System.currentTimeMillis();
    private int positionAtClockStart = 0;

    public PlayerService(Path stateFile, NeteaseClient netease) {
        this.stateFile = stateFile;
        this.netease = netease;
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
        body.put("queue", queueMaps());
        body.put("queueIndex", queueIndex);
        body.put("url", url);
        body.put("volume", volume);
        body.put("playable", audioLoaded && error.isBlank());
        body.put("error", error);
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

    public synchronized Map<String, Object> toggle() {
        if (playing) return pause();
        return play();
    }

    public synchronized Map<String, Object> play() {
        if (!audioLoaded && currentSong.hasIdentity()) {
            return load(currentSong, "standard");
        }
        playing = audioLoaded && error.isBlank();
        positionAtClockStart = position;
        clockStartedAt = System.currentTimeMillis();
        save();
        Map<String, Object> body = transportBody(true);
        body.put("playable", audioLoaded && error.isBlank());
        return body;
    }

    public synchronized Map<String, Object> pause() {
        refreshClock();
        playing = false;
        save();
        return transportBody(true);
    }

    public synchronized Map<String, Object> previous() {
        return playQueueOffset(-1);
    }

    public synchronized Map<String, Object> next() {
        return playQueueOffset(1);
    }

    public synchronized Map<String, Object> load(Song song, String quality) {
        if (song == null || !song.hasIdentity()) {
            playing = false;
            audioLoaded = false;
            error = "no song id";
            return transportBody(false);
        }

        currentSong = song;
        duration = song.duration > 0 ? song.duration : 271;
        position = 0;
        positionAtClockStart = 0;
        clockStartedAt = System.currentTimeMillis();
        url = netease.songUrl(song.id, quality);
        audioLoaded = !url.isBlank();
        playing = audioLoaded;
        error = audioLoaded ? "" : "song url unavailable";
        syncQueueIndexToCurrentSong();
        save();

        Map<String, Object> body = transportBody(true);
        body.put("song", currentSong.toMap());
        body.put("url", url);
        body.put("playable", audioLoaded && error.isBlank());
        return body;
    }

    public synchronized Map<String, Object> setQueue(List<Song> songs, int currentIndex) {
        queue.clear();
        for (Song song : songs) {
            if (song.hasIdentity()) queue.add(song);
            if (queue.size() >= 100) break;
        }
        queueIndex = currentIndex >= -1 && currentIndex < queue.size() ? currentIndex : -1;
        syncQueueIndexToCurrentSong();
        save();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("length", queue.size());
        body.put("queueIndex", queueIndex);
        return body;
    }

    public synchronized Map<String, Object> mergeQueue(List<Song> incoming, String mode) {
        int added = 0;
        if ("next".equalsIgnoreCase(mode)) {
            List<Song> toInsert = new ArrayList<>();
            for (Song song : incoming) {
                if (song.hasIdentity() && !hasQueuedSong(song.id) && toInsert.stream().noneMatch(s -> s.id.equals(song.id))) {
                    toInsert.add(song);
                }
            }
            int insertAt = Math.max(0, Math.min(queueIndex >= 0 ? queueIndex + 1 : 0, queue.size()));
            queue.addAll(insertAt, toInsert);
            added = toInsert.size();
        } else {
            for (Song song : incoming) {
                if (song.hasIdentity() && !hasQueuedSong(song.id)) {
                    queue.add(song);
                    added++;
                }
            }
        }
        if (queueIndex >= queue.size()) queueIndex = -1;
        save();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("mode", mode == null || mode.isBlank() ? "append" : mode);
        body.put("length", queue.size());
        body.put("queueIndex", queueIndex);
        body.put("added", added);
        return body;
    }

    public synchronized List<Song> queueSnapshot() {
        return new ArrayList<>(queue);
    }

    private Map<String, Object> playQueueOffset(int offset) {
        if (queue.isEmpty()) {
            playing = false;
            error = "queue empty";
            save();
            Map<String, Object> body = transportBody(false);
            body.put("action", offset < 0 ? "previous" : "next");
            return body;
        }
        if (queueIndex < 0 || queueIndex >= queue.size()) {
            queueIndex = offset > 0 ? -1 : queue.size();
        }
        queueIndex = (queueIndex + offset + queue.size()) % queue.size();
        Map<String, Object> body = load(queue.get(queueIndex), "standard");
        body.put("action", offset < 0 ? "previous" : "next");
        return body;
    }

    private Map<String, Object> transportBody(boolean ok) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", ok);
        body.put("playing", playing);
        body.put("queueIndex", queueIndex);
        body.put("song", currentSong.toMap());
        body.put("url", url);
        body.put("playable", audioLoaded && error.isBlank());
        body.put("error", error);
        return body;
    }

    private List<Map<String, Object>> queueMaps() {
        List<Map<String, Object>> items = new ArrayList<>();
        for (int i = 0; i < queue.size(); i++) {
            items.add(queue.get(i).toQueueMap(i, i == queueIndex));
        }
        return items;
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

    private boolean hasQueuedSong(String id) {
        for (Song song : queue) {
            if (song.id.equals(id)) return true;
        }
        return false;
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
            queueIndex = SimpleJson.asInt(root.get("queueIndex"), -1);
            url = SimpleJson.asString(root.get("url"), "");
            audioLoaded = !url.isBlank();
            playing = false;
            queue.clear();
            for (Object item : SimpleJson.asList(root.get("queue"))) {
                Song song = Song.fromMap(SimpleJson.asMap(item));
                if (song.hasIdentity()) queue.add(song);
            }
        } catch (IOException ignored) {
        }
    }

    private void save() {
        try {
            Files.createDirectories(stateFile.getParent());
            Map<String, Object> root = new LinkedHashMap<>(state());
            root.put("playing", false);
            Files.writeString(stateFile, SimpleJson.stringify(root), StandardCharsets.UTF_8);
        } catch (IOException ignored) {
        }
    }
}
