import com.femonster.core.PlayerService;
import com.femonster.model.Song;
import com.femonster.music.MusicProviderClient;
import com.femonster.music.MusicProviderRegistry;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

public final class PlayerAutoSkipProbe {
    private PlayerAutoSkipProbe() {}

    public static void main(String[] args) throws Exception {
        Path stateFile = Files.createTempFile("fe-monster-player-auto-skip-", ".json");
        try {
            PlayerService player = new PlayerService(
                stateFile,
                new MusicProviderRegistry(new StubProvider())
            );
            player.setQueue(List.of(song("vip"), song("missing"), song("playable")), -1);
            Map<String, Object> recovered = player.next();
            require(Boolean.TRUE.equals(recovered.get("playable")), "playable song was not recovered");
            require("https://audio.example/playable.mp3".equals(recovered.get("url")), "wrong recovered URL");
            require(Integer.valueOf(2).equals(recovered.get("skipped")), "wrong skipped count");
            require("playable".equals(((Map<?, ?>) recovered.get("song")).get("id")), "wrong recovered song");

            PlayerService unavailable = new PlayerService(
                stateFile.resolveSibling(stateFile.getFileName() + "-all-bad"),
                new MusicProviderRegistry(new StubProvider())
            );
            unavailable.setQueue(List.of(song("vip"), song("missing")), -1);
            Map<String, Object> exhausted = unavailable.next();
            require(Boolean.FALSE.equals(exhausted.get("playable")), "all-bad queue must remain unplayable");
            require(Integer.valueOf(2).equals(exhausted.get("skipped")), "all-bad queue was not fully scanned");
            require("no playable songs in queue".equals(exhausted.get("error")), "missing terminal error");
            System.out.println("Player auto-skip PASS " + recovered);
        } finally {
            Files.deleteIfExists(stateFile);
            Files.deleteIfExists(stateFile.resolveSibling(stateFile.getFileName() + "-all-bad"));
        }
    }

    private static Song song(String id) {
        Song song = new Song();
        song.id = id;
        song.title = id;
        song.provider = "netease";
        song.duration = 180;
        return song;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }

    private static final class StubProvider implements MusicProviderClient {
        @Override public String id() { return "netease"; }
        @Override public String label() { return "Stub"; }
        @Override public String baseUrl() { return "https://audio.example"; }
        @Override public String songUrl(String id, String quality) {
            return "playable".equals(id) ? "https://audio.example/playable.mp3" : "";
        }
        @Override public Map<String, Object> serviceStatus() { return Map.of("ok", true); }
        @Override public Map<String, Object> accountPayload() { return Map.of(); }
        @Override public Map<String, Object> search(String keyword, int page, int limit) { return Map.of(); }
        @Override public Map<String, Object> songUrlPayload(String id, String quality) {
            String url = songUrl(id, quality);
            return Map.of("playable", !url.isBlank(), "url", url);
        }
        @Override public Map<String, Object> lyricPayload(String songId) { return Map.of(); }
        @Override public Map<String, Object> userPlaylistsPayload() { return Map.of(); }
        @Override public Map<String, Object> recommendedPlaylistsPayload(int limit) { return Map.of(); }
        @Override public Map<String, Object> playlistTracksPayload(String playlistId, int limit) { return Map.of(); }
        @Override public Map<String, Object> addSongToPlaylistPayload(String playlistId, Song song) { return Map.of(); }
        @Override public Map<String, Object> commentsPayload(String songId, int limit) { return Map.of(); }
    }
}
