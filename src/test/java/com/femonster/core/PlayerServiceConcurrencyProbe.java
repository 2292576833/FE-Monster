package com.femonster.core;

import com.femonster.model.Song;
import com.femonster.music.MusicProviderClient;
import com.femonster.music.MusicProviderRegistry;
import com.femonster.music.PlaybackSource;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class PlayerServiceConcurrencyProbe {
    private PlayerServiceConcurrencyProbe() {
    }

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-player-concurrency-");
        PlayerService player = null;
        try {
            BlockingProvider provider = new BlockingProvider();
            player = new PlayerService(root.resolve("player-state.json"), new MusicProviderRegistry(provider));
            Song song = song("slow-song");
            PlayerService target = player;
            Thread loader = new Thread(() -> target.load(song, "standard"), "player-load-probe");
            loader.start();
            require(provider.entered.await(2, TimeUnit.SECONDS), "playback resolution did not start");

            long started = System.nanoTime();
            Map<String, Object> snapshot = player.state();
            long stateLatencyMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
            provider.release.countDown();
            loader.join(2_000);

            require(!loader.isAlive(), "playback resolution did not finish");
            require(stateLatencyMillis < 120,
                "state polling waited on provider network I/O for " + stateLatencyMillis + " ms");
            require(snapshot != null, "state snapshot is missing");
            System.out.println("PlayerServiceConcurrencyProbe passed: stateLatencyMs=" + stateLatencyMillis);
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
        song.duration = 180;
        return song;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static final class BlockingProvider implements MusicProviderClient {
        private final CountDownLatch entered = new CountDownLatch(1);
        private final CountDownLatch release = new CountDownLatch(1);

        @Override
        public String id() {
            return "probe";
        }

        @Override
        public String label() {
            return "Probe";
        }

        @Override
        public String baseUrl() {
            return "http://127.0.0.1";
        }

        @Override
        public PlaybackSource resolvePlayback(Song song, String quality) {
            entered.countDown();
            try {
                release.await(650, TimeUnit.MILLISECONDS);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
            }
            return PlaybackSource.fromUrl(id(), quality, "https://example.invalid/audio.mp3");
        }

        @Override public Map<String, Object> serviceStatus() { return Map.of(); }
        @Override public Map<String, Object> accountPayload() { return Map.of(); }
        @Override public void rememberBrowserSession(Map<String, String> cookies) { }
        @Override public Map<String, Object> search(String keyword, int page, int limit) { return Map.of(); }
        @Override public String songUrl(String id, String quality) { return ""; }
        @Override public Map<String, Object> songUrlPayload(String id, String quality) { return Map.of(); }
        @Override public Map<String, Object> lyricPayload(String songId) { return Map.of(); }
        @Override public Map<String, Object> userPlaylistsPayload() { return Map.of(); }
        @Override public Map<String, Object> recommendedPlaylistsPayload(int limit) { return Map.of(); }
        @Override public Map<String, Object> playlistTracksPayload(String playlistId, int limit) { return Map.of(); }
        @Override public Map<String, Object> addSongToPlaylistPayload(String playlistId, Song song) { return Map.of(); }
        @Override public Map<String, Object> commentsPayload(String songId, int limit) { return Map.of(); }
    }
}
