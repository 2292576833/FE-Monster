package com.femonster.core;

import com.femonster.model.Song;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class PlayerQueuePaginationProbe {
    private PlayerQueuePaginationProbe() {
    }

    public static void main(String[] args) throws Exception {
        Path directory = Files.createTempDirectory("fe-player-queue-page-");
        Path stateFile = directory.resolve("player.json");
        try {
            Files.writeString(stateFile, """
                {"song":{"id":"song-5","title":"Previously playing","provider":"kugou"},
                 "queueIndex":5,"queue":[]}
                """);
            PlayerService player = new PlayerService(stateFile, null);
            List<Song> songs = songs(250, 0);
            Map<String, Object> set = player.setQueue(songs, 123);
            require(number(set.get("queueLength")) == 250, "setQueue still truncates a normal large playlist");
            require(number(set.get("queueIndex")) == 123,
                "an explicit clicked row was overwritten by the previously playing song");
            require(number(set.get("queueRevision")) == 1, "first membership change did not increment revision");

            Map<String, Object> state = player.state();
            require(!state.containsKey("queue"), "player/state still serializes the full queue");
            require(number(state.get("queueLength")) == 250, "player/state did not expose compact queue length");
            require(number(state.get("queueRevision")) == 1, "player/state did not expose queue revision");

            Map<String, Object> page = player.queuePage(100, 25);
            List<?> items = (List<?>) page.get("items");
            require(items.size() == 25, "queue page size was not honored");
            require(number(page.get("total")) == 250, "queue page total is wrong");
            require(number(page.get("cursor")) == 100, "queue page cursor is wrong");
            require(number(page.get("nextCursor")) == 125, "queue page next cursor is wrong");
            Map<?, ?> first = (Map<?, ?>) items.get(0);
            require("song-100".equals(first.get("id")), "queue page returned the wrong slice");
            require(number(first.get("queueIndex")) == 100, "queue item lost its global index");

            player.setQueue(songs, 5);
            require(number(player.state().get("queueRevision")) == 1, "index-only changes invalidated queue membership cache");
            player.close();

            PlayerService restored = new PlayerService(stateFile, null);
            require(number(restored.state().get("queueLength")) == 250, "full queue was not persisted separately from player/state");
            require(((List<?>) restored.queuePage(240, 50).get("items")).size() == 10, "restored tail page is wrong");

            restored.setQueue(songs(1_900, 0), 0);
            Map<String, Object> merged = restored.mergeQueue(songs(500, 1_900), "append");
            require(number(merged.get("queueLength")) == 2_000, "merged queue did not use the bounded 2000-song capacity");
            require(number(merged.get("added")) == 100, "merge reported entries beyond capacity");
            restored.close();

            System.out.println("PlayerQueuePaginationProbe passed");
        } finally {
            Files.deleteIfExists(stateFile);
            Files.deleteIfExists(directory);
        }
    }

    private static List<Song> songs(int count, int offset) {
        List<Song> songs = new ArrayList<>();
        for (int index = 0; index < count; index++) {
            Song song = new Song();
            song.id = "song-" + (offset + index);
            song.title = "Track " + (offset + index);
            song.artist = "Fixture";
            songs.add(song);
        }
        return songs;
    }

    private static int number(Object value) {
        return value instanceof Number number ? number.intValue() : -1;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
