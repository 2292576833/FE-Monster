import com.femonster.model.Song;
import com.femonster.music.PlaybackSource;
import com.femonster.music.ProviderProtocolClient;
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

public final class ProviderProtocolContractProbe {
    private ProviderProtocolContractProbe() {}

    public static void main(String[] args) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicInteger searchRequests = new AtomicInteger();
        AtomicInteger legacySearchRequests = new AtomicInteger();
        AtomicInteger playbackRequests = new AtomicInteger();
        AtomicInteger legacyPlaybackRequests = new AtomicInteger();
        AtomicReference<Map<String, String>> playbackQuery = new AtomicReference<>(Map.of());

        server.createContext("/search", exchange -> {
            searchRequests.incrementAndGet();
            json(exchange, 200, "{\"ok\":false,\"error\":\"contract error\"}");
        });
        server.createContext("/search/complex", exchange -> {
            legacySearchRequests.incrementAndGet();
            json(exchange, 200, "{\"songs\":[{\"id\":\"legacy\"}]}");
        });
        server.createContext("/song/url", exchange -> {
            playbackRequests.incrementAndGet();
            Map<String, String> requestQuery = query(exchange.getRequestURI().getRawQuery());
            playbackQuery.set(requestQuery);
            json(
                exchange,
                200,
                "{\"url\":\"https://audio.example/contract.mp3\",\"quality\":\"128\","
                    + "\"headers\":{\"Referer\":\"https://www.kugou.com/\"}}"
            );
        });
        server.createContext("/song/url/new", exchange -> {
            legacyPlaybackRequests.incrementAndGet();
            json(exchange, 200, "{\"url\":\"https://audio.example/legacy.mp3\"}");
        });
        server.start();

        try {
            String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
            ProviderProtocolClient client = new ProviderProtocolClient("kugou", "Kugou", baseUrl);

            var search = (java.util.List<?>) client.search("contract", 1, 10).get("songs");
            require(search != null && search.isEmpty(), "explicit protocol unexpectedly accepted a fallback route");
            require(searchRequests.get() == 1, "explicit search route was not requested exactly once");
            require(legacySearchRequests.get() == 0, "explicit protocol guessed a legacy search route");

            Song song = new Song();
            song.id = "public-song-id";
            song.provider = "kugou";
            song.setSourceRef(Map.of(
                "hash", "0123456789ABCDEF0123456789ABCDEF",
                "album_audio_id", "24680",
                "album_id", "13579"
            ));

            PlaybackSource source = client.resolvePlayback(song, "standard");
            require(source.playable(), "structured playback source was not playable");
            require("https://audio.example/contract.mp3".equals(source.url()), "wrong playback URL");
            require("128".equals(source.quality()), "Kugou quality was not normalized");
            require("https://www.kugou.com/".equals(source.headers().get("Referer")), "backend headers were lost");
            require(Boolean.TRUE.equals(source.toMap().get("requiresProxy")), "proxy requirement was not exposed");
            require(!source.toMap().containsKey("headers"), "backend headers leaked to the frontend");

            Map<String, String> query = playbackQuery.get();
            require(
                "0123456789ABCDEF0123456789ABCDEF".equals(query.get("hash")),
                "sourceRef hash did not reach the provider"
            );
            require("24680".equals(query.get("album_audio_id")), "sourceRef album_audio_id was lost");
            require("13579".equals(query.get("album_id")), "sourceRef album_id was lost");
            require(playbackRequests.get() == 1, "playback was resolved more than once");
            require(legacyPlaybackRequests.get() == 0, "explicit protocol guessed a legacy playback route");

            System.out.println("Provider protocol contract PASS");
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
