import com.femonster.json.SimpleJson;
import com.femonster.model.Song;
import com.femonster.music.MusicProviderRegistry;
import com.femonster.music.ProviderProtocolClient;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

public final class QishuiHostContractProbe {
    public static void main(String[] args) throws Exception {
        AtomicReference<String> loginQuery = new AtomicReference<>("");
        AtomicReference<Map<String, Object>> loginBody = new AtomicReference<>(Map.of());
        AtomicReference<Map<String, String>> playbackQuery = new AtomicReference<>(Map.of());
        AtomicReference<Map<String, Object>> libraryBody = new AtomicReference<>(Map.of());
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/health", exchange -> send(exchange, 200, """
            {"ok":true,"provider":"qishui","loggedIn":false}
            """));
        server.createContext("/login/status", exchange -> send(exchange, 200, """
            {"ok":true,"provider":"qishui","loggedIn":true,"account":{"userId":"official-user"}}
            """));
        server.createContext("/session/token", exchange -> {
            loginQuery.set(exchange.getRequestURI().getRawQuery() == null ? "" : exchange.getRequestURI().getRawQuery());
            loginBody.set(SimpleJson.parseObject(new String(
                exchange.getRequestBody().readAllBytes(),
                StandardCharsets.UTF_8
            )));
            send(exchange, 200, """
                {"ok":true,"provider":"qishui","loggedIn":true}
                """);
        });
        server.createContext("/local/status", exchange -> send(exchange, 200, """
            {"ok":true,"provider":"qishui","installed":true,"loginState":"unknown","credentialsRead":false}
            """));
        server.createContext("/local/library/import", exchange -> {
            libraryBody.set(SimpleJson.parseObject(new String(
                exchange.getRequestBody().readAllBytes(),
                StandardCharsets.UTF_8
            )));
            send(exchange, 200, """
                {"ok":true,"provider":"qishui","playlists":1,"tracks":1,"credentialsRead":false}
                """);
        });
        server.createContext("/user/playlist", exchange -> send(exchange, 200, """
            {"ok":true,"provider":"qishui","metadataOnly":true,"playlists":[
              {"id":"local-queue-cache","name":"本地播放队列","provider":"qishui","trackCount":1}
            ]}
            """));
        server.createContext("/playlist/track/all", exchange -> send(exchange, 200, """
            {"ok":true,"provider":"qishui","metadataOnly":true,"songs":[
              {"id":"official-local-queue-1","title":"Local Queue Track","artist":"Local Artist",
               "provider":"qishui","duration":180,
               "sourceRef":{"metadataOnly":true,"providerSongId":"official-local-queue-1",
                            "matchTitle":"Local Queue Track","matchArtist":"Local Artist",
                            "matchDuration":180,"localQueueCache":true}}
            ]}
            """));
        server.createContext("/search", exchange -> send(exchange, 200, """
            {"ok":true,"provider":"qishui","songs":[
              {"id":"local-visible-track","title":"Official Track","artist":"Official Artist","provider":"qishui","duration":180,
               "sourceRef":{"metadataOnly":true,"providerSongId":"official-track","matchTitle":"Official Track",
                            "matchArtist":"Official Artist","matchDuration":180}}
            ]}
            """));
        server.createContext("/song/url", exchange -> {
            playbackQuery.set(parseQuery(exchange.getRequestURI().getRawQuery()));
            send(exchange, 200, """
                {"ok":true,"provider":"qishui","quality":"full","playable":true,"url":"https://audio.example.test/full.m4a"}
                """);
        });
        server.start();

        try {
            String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
            ProviderProtocolClient client = new ProviderProtocolClient("qishui", "汽水音乐", baseUrl);
            MusicProviderRegistry registry = new MusicProviderRegistry(client);

            Map<String, Object> login = registry.configureLogin("qishui", Map.of(
                "accessToken", "act.host-contract-secret",
                "openId", "official-user"
            ));
            require(Boolean.TRUE.equals(login.get("loggedIn")), "Qishui token login did not succeed");
            require(loginQuery.get().isBlank(), "Qishui access token leaked into the sidecar URL");
            require(
                "act.host-contract-secret".equals(SimpleJson.asString(loginBody.get().get("accessToken"), "")),
                "Qishui sidecar did not receive the JSON access token"
            );
            Map<String, Object> localStatus = registry.localClientStatus("qishui");
            require("unknown".equals(SimpleJson.asString(localStatus.get("loginState"), "")), "local login state was overstated");
            require(!SimpleJson.asBoolean(localStatus.get("credentialsRead"), true), "local status claimed credentials were read");
            Map<String, Object> libraryImport = registry.importLibraryMetadata("qishui", Map.of(
                "schema", "fe-monster.qishui-library/v1",
                "playlists", java.util.List.of(Map.of("id", "visible", "name", "Visible", "tracks", java.util.List.of()))
            ));
            require(SimpleJson.asInt(libraryImport.get("playlists"), 0) == 1, "Qishui metadata import failed");
            require(
                "fe-monster.qishui-library/v1".equals(SimpleJson.asString(libraryBody.get().get("schema"), "")),
                "Qishui library JSON was not forwarded"
            );
            Map<String, Object> playlists = registry.userPlaylistsPayload("qishui");
            require(SimpleJson.asBoolean(playlists.get("libraryAvailable"), false),
                "Qishui local queue was not exposed as a metadata library");
            require(SimpleJson.asList(playlists.get("playlists")).size() == 1,
                "Qishui local queue playlist was not normalized");
            Map<String, Object> playlistTracks = registry.playlistTracksPayload(
                "qishui",
                "local-queue-cache",
                0
            );
            require(SimpleJson.asList(playlistTracks.get("songs")).size() == 1,
                "Qishui local queue tracks were not normalized");
            Map<String, Object> localQueueSong = SimpleJson.asMap(
                SimpleJson.asList(playlistTracks.get("songs")).get(0)
            );
            require(
                "official-local-queue-1".equals(
                    SimpleJson.asString(
                        SimpleJson.asMap(localQueueSong.get("sourceRef")).get("providerSongId"),
                        ""
                    )
                ),
                "Qishui local queue official id was not preserved"
            );

            Map<String, Object> search = registry.search("qishui", "Official", 1, 20);
            require(SimpleJson.asList(search.get("songs")).size() == 1, "Qishui search was not normalized");
            Map<String, Object> songMap = SimpleJson.asMap(SimpleJson.asList(search.get("songs")).get(0));
            Song song = Song.fromMap(songMap);
            Map<String, Object> playback = registry.songUrlPayload("qishui", song, "full");
            require(Boolean.TRUE.equals(playback.get("playable")), "Qishui authorized playback was rejected");
            require(
                "https://audio.example.test/full.m4a".equals(SimpleJson.asString(playback.get("url"), "")),
                "Qishui full playback URL was not preserved"
            );
            require("official-track".equals(playbackQuery.get().get("providerSongId")), "Qishui official id was not forwarded");
            require("Official Track".equals(playbackQuery.get().get("title")), "Qishui match title was not forwarded");
            require("Official Artist".equals(playbackQuery.get().get("artist")), "Qishui match artist was not forwarded");
            require("180".equals(playbackQuery.get().get("duration")), "Qishui match duration was not forwarded");
            System.out.println("Qishui host contract PASS");
        } finally {
            server.stop(0);
        }
    }

    private static void send(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static void require(boolean value, String message) {
        if (!value) throw new IllegalStateException(message);
    }

    private static Map<String, String> parseQuery(String raw) {
        Map<String, String> result = new LinkedHashMap<>();
        if (raw == null || raw.isBlank()) return result;
        for (String part : raw.split("&")) {
            int separator = part.indexOf('=');
            String key = separator < 0 ? part : part.substring(0, separator);
            String value = separator < 0 ? "" : part.substring(separator + 1);
            result.put(
                URLDecoder.decode(key, StandardCharsets.UTF_8),
                URLDecoder.decode(value, StandardCharsets.UTF_8)
            );
        }
        return result;
    }
}
