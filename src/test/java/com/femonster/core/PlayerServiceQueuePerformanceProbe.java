package com.femonster.core;

import com.femonster.model.Song;
import com.femonster.music.MusicProviderRegistry;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public final class PlayerServiceQueuePerformanceProbe {
    private static final int SONG_COUNT = 8_000;

    private PlayerServiceQueuePerformanceProbe() {
    }

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-player-queue-");
        PlayerService player = null;
        try {
            player = new PlayerService(root.resolve("player-state.json"), new MusicProviderRegistry());
            List<Song> songs = new ArrayList<>(SONG_COUNT);
            for (int index = 0; index < SONG_COUNT; index += 1) songs.add(song("song-" + index));
            songs.add(song("song-42"));

            long started = System.nanoTime();
            Map<String, Object> result = player.mergeQueue(songs, "append");
            long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);

            require(((Number) result.get("added")).intValue() == SONG_COUNT, "duplicate queue item was not filtered");
            require(((Number) result.get("length")).intValue() == SONG_COUNT, "queue length changed");
            System.out.println("PlayerServiceQueuePerformanceProbe passed: songs=" + SONG_COUNT
                + ", elapsedMs=" + elapsedMillis);
        } finally {
            if (player != null) player.close();
            try (var paths = Files.walk(root)) {
                paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                    try {
                        Files.deleteIfExists(path);
                    } catch (Exception ignored) {
                    }
                });
            }
        }
    }

    private static Song song(String id) {
        Song song = new Song();
        song.id = id;
        song.title = id;
        song.provider = "probe";
        return song;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
