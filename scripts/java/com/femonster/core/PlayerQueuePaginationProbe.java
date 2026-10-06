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

            Map<String, Object> beforeRemoval = restored.state();
            long revision = ((Number) beforeRemoval.get("queueRevision")).longValue();
            require(Boolean.FALSE.equals(restored.removeFromQueue(1, "song-1", "qq", revision).get("ok")),
                "a provider mismatch removed a different song");
            require(Boolean.FALSE.equals(restored.removeFromQueue(-1, "song-1", "netease", revision).get("ok")),
                "an invalid queue index was accepted");
            Map<String, Object> removed = restored.removeFromQueue(1, "song-1", "netease", revision);
            require(Boolean.TRUE.equals(removed.get("removed")), "queue entry was not removed");
            require(number(removed.get("queueLength")) == 249, "removal discarded unseen queue entries");
            require(number(removed.get("queueIndex")) == 4, "removal before current song did not shift its index");
            require(number(removed.get("queueRevision")) == revision + 1, "removal did not advance queue revision");
            require(Boolean.FALSE.equals(restored.removeFromQueue(1, "song-2", "netease", revision).get("ok")),
                "a stale request removed the replacement row");
            require(Boolean.FALSE.equals(restored.removeFromQueue(1, "song-1", "netease", revision + 1).get("ok")),
                "song identity was not checked before removal");
            Map<String, Object> removedCurrent = restored.removeFromQueue(4, "song-5", "netease", revision + 1);
            require(number(removedCurrent.get("queueIndex")) == -1, "removed current song still owns a queue index");
            Map<String, Object> afterRemoval = restored.state();
            for (String field : List.of("song", "url", "position", "playing", "paused", "volume")) {
                require(beforeRemoval.get(field).equals(afterRemoval.get(field)), "queue removal changed audio field " + field);
            }
            restored.close();
            restored = new PlayerService(stateFile, null);
            require(number(restored.state().get("queueLength")) == 248, "queue removal was not persisted");
            require(restored.queueSnapshot().stream().noneMatch(song -> "song-1".equals(song.id) || "song-5".equals(song.id)),
                "removed songs returned after restarting");
            Map<String, Object> single = restored.setQueue(songs(1, 0), 0);
            Map<String, Object> empty = restored.removeFromQueue(0, "song-0", "netease", ((Number) single.get("queueRevision")).longValue());
            require(number(empty.get("queueLength")) == 0 && number(empty.get("queueIndex")) == -1,
                "removing the last entry did not produce a valid empty queue");

            Map<String, Object> moveStart = restored.setQueue(songs(6, 0), 2);
            long moveRevision = ((Number) moveStart.get("queueRevision")).longValue();
            Map<String, Object> beforeMove = restored.state();
            require(Boolean.FALSE.equals(restored.moveInQueue(0, 6, "song-0", "netease", moveRevision).get("ok")),
                "invalid reorder destination was accepted");
            require(Boolean.FALSE.equals(restored.moveInQueue(0, 5, "song-0", "qq", moveRevision).get("ok")),
                "reorder ignored provider identity");
            require(Boolean.TRUE.equals(restored.moveInQueue(0, 5, "song-0", "netease", moveRevision).get("moved")),
                "queue reorder failed");
            require(number(restored.state().get("queueIndex")) == 1, "reorder before current did not shift current index");
            require(Boolean.FALSE.equals(restored.moveInQueue(0, 5, "song-1", "netease", moveRevision).get("ok")),
                "stale reorder changed the queue");
            restored.moveInQueue(1, 4, "song-2", "netease", moveRevision + 1);
            require(number(restored.state().get("queueIndex")) == 4, "moving the playing row lost its index");
            restored.moveInQueue(5, 0, "song-0", "netease", moveRevision + 2);
            require(number(restored.state().get("queueIndex")) == 5, "backward move did not shift current index");
            for (String field : List.of("song", "url", "position", "playing", "paused", "volume")) {
                require(beforeMove.get(field).equals(restored.state().get(field)), "reordering changed audio field " + field);
            }
            restored.close();
            restored = new PlayerService(stateFile, null);
            require(restored.queueSnapshot().stream().map(song -> song.id).toList()
                .equals(List.of("song-0", "song-1", "song-3", "song-4", "song-5", "song-2")),
                "reordered queue did not survive restart");
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
