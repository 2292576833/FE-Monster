package com.femonster.core;

import com.femonster.json.SimpleJson;
import com.femonster.music.MusicProviderRegistry;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Map;

public final class PlayerServicePersistenceProbe {
    private PlayerServicePersistenceProbe() {
    }

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-player-persistence-");
        try {
            Path stateFile = root.resolve("player-state.json");
            PlayerService player = new PlayerService(stateFile, new MusicProviderRegistry());
            for (int index = 0; index < 80; index += 1) {
                player.setVolume(index / 100.0);
            }

            Thread.sleep(80);
            require(!Files.exists(stateFile), "rapid volume updates must be deferred");
            waitForFile(stateFile, 1500);
            requireClose(readVolume(stateFile), 0.79, "debounced write must keep the latest volume");

            player.setVolume(0.37);
            player.flush();
            requireClose(readVolume(stateFile), 0.37, "flush must persist immediately");

            player.setVolume(0.61);
            player.close();
            requireClose(readVolume(stateFile), 0.61, "close must flush the latest state");
            require(!Files.exists(stateFile.resolveSibling("player-state.json.tmp")), "atomic temp file must be consumed");

            System.out.println("PlayerServicePersistenceProbe passed");
        } finally {
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

    private static void waitForFile(Path path, long timeoutMillis) throws Exception {
        long deadline = System.nanoTime() + timeoutMillis * 1_000_000L;
        while (!Files.isRegularFile(path) && System.nanoTime() < deadline) Thread.sleep(20);
        require(Files.isRegularFile(path), "debounced state file was not written");
    }

    private static double readVolume(Path path) throws Exception {
        Map<String, Object> root = SimpleJson.parseObject(Files.readString(path, StandardCharsets.UTF_8));
        return SimpleJson.asDouble(root.get("volume"), -1);
    }

    private static void requireClose(double actual, double expected, String message) {
        require(Math.abs(actual - expected) < 0.0001, message + ": expected " + expected + ", got " + actual);
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
