import com.femonster.music.GenericMusicClient;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class KugouHostContractProbe {
    private KugouHostContractProbe() {}

    public static void main(String[] args) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicInteger rootRequests = new AtomicInteger();
        AtomicInteger healthRequests = new AtomicInteger();
        AtomicReference<Map<String, String>> songUrlQuery = new AtomicReference<>(Map.of());
        AtomicReference<Map<String, String>> playlistTracksQuery = new AtomicReference<>(Map.of());

        server.createContext("/", exchange -> {
            if ("/health".equals(exchange.getRequestURI().getPath())) {
                healthRequests.incrementAndGet();
                json(exchange, 200, "{\"ok\":true,\"provider\":\"kugou\"}");
                return;
            }
            rootRequests.incrementAndGet();
            json(exchange, 404, "{\"ok\":false,\"error\":\"not found\"}");
        });
        server.createContext("/search", exchange ->
            json(exchange, 200, "{\"status\":0,\"error_code\":41001,\"message\":\"legacy endpoint rejected\"}"));
        server.createContext("/search/complex", exchange -> json(exchange, 200,
            "{\"status\":1,\"songs\":[{\"FileHash\":\"0123456789ABCDEF0123456789ABCDEF\","
                + "\"MixSongID\":\"24680\",\"AlbumID\":\"13579\","
                + "\"songname\":\"Contract Song\",\"singername\":\"FE\"}]}"));
        server.createContext("/song/url", exchange -> {
            songUrlQuery.set(query(exchange.getRequestURI().getRawQuery()));
            json(exchange, 200, "{\"url\":\"https://audio.example/free.mp3\"}");
        });
        server.createContext("/playlist/track/all", exchange -> {
            Map<String, String> values = query(exchange.getRequestURI().getRawQuery());
            playlistTracksQuery.set(values);
            int limit = Integer.parseInt(values.getOrDefault("limit", "0"));
            if (limit > 100) {
                json(exchange, 422, "{\"ok\":false,\"error\":\"playlist limit exceeds provider contract\"}");
                return;
            }
            json(exchange, 200,
                "{\"status\":1,\"data\":{\"songs\":[{\"FileHash\":\"FEDCBA9876543210FEDCBA9876543210\","
                    + "\"songname\":\"Playlist Contract Song\",\"singername\":\"FE\"}]}}");
        });
        server.start();

        try {
            String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
            GenericMusicClient client = new GenericMusicClient("kugou", "Kugou", baseUrl);
            var songs = (java.util.List<?>) client.search("contract", 1, 10).get("songs");
            require(songs != null && songs.size() == 1, "business-error endpoint did not fall through");
            Map<?, ?> song = (Map<?, ?>) songs.get(0);
            String identity = String.valueOf(song.get("id"));
            require(identity.contains("0123456789ABCDEF0123456789ABCDEF"), "hash missing from song identity");
            require(!identity.equals("0123456789ABCDEF0123456789ABCDEF"), "compound Kugou identity was collapsed to hash");

            String playbackUrl = client.songUrl(identity, "standard");
            require("https://audio.example/free.mp3".equals(playbackUrl), "playback URL was not returned");
            Map<String, String> playbackQuery = songUrlQuery.get();
            require("0123456789ABCDEF0123456789ABCDEF".equals(playbackQuery.get("hash")), "hash was not restored for playback");
            require("24680".equals(playbackQuery.get("album_audio_id")), "album_audio_id was not restored for playback");
            require("13579".equals(playbackQuery.get("album_id")), "album_id was not restored for playback");

            var playlistSongs = (java.util.List<?>) client.playlistTracksPayload("contract-playlist", 0).get("songs");
            require(playlistSongs != null && playlistSongs.size() == 1,
                "default playlist request did not return the provider result");
            Map<String, String> playlistQuery = playlistTracksQuery.get();
            require("100".equals(playlistQuery.get("limit")),
                "default playlist request exceeded the provider-safe limit");
            require("100".equals(playlistQuery.get("pagesize")),
                "default playlist request did not align pagesize with limit");

            Map<String, Object> status = client.serviceStatus();
            require(Boolean.TRUE.equals(status.get("reachable")), "health endpoint was not considered reachable");
            require(healthRequests.get() == 1, "service status did not request /health exactly once");
            require(rootRequests.get() == 0, "service status still probes / instead of /health");
            System.out.println("Kugou host contract PASS " + identity);
        } finally {
            server.stop(0);
        }
    }

    private static Map<String, String> query(String raw) {
        Map<String, String> values = new LinkedHashMap<>();
        if (raw == null || raw.isBlank()) return values;
        for (String part : raw.split("&")) {
            String[] pair = part.split("=", 2);
            String key = URLDecoder.decode(pair[0], StandardCharsets.UTF_8);
            String value = pair.length > 1 ? URLDecoder.decode(pair[1], StandardCharsets.UTF_8) : "";
            values.put(key, value);
        }
        return values;
    }

    private static void json(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}
