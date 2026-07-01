package com.femonster.api;

import com.femonster.core.AppContext;
import com.femonster.http.HttpUtil;
import com.femonster.json.SimpleJson;
import com.femonster.model.Song;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class ApiRoutes {
    private final AppContext context;
    private final HttpClient coverClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();

    private ApiRoutes(AppContext context) {
        this.context = context;
    }

    public static void register(HttpServer server, AppContext context) {
        ApiRoutes routes = new ApiRoutes(context);
        server.createContext("/api/", routes::handle);
    }

    private void handle(HttpExchange exchange) throws IOException {
        if (HttpUtil.handleOptions(exchange)) return;
        try {
            String path = exchange.getRequestURI().getPath();
            String method = exchange.getRequestMethod().toUpperCase();
            Map<String, String> query = HttpUtil.query(exchange);

            if ("GET".equals(method)) {
                handleGet(exchange, path, query);
                return;
            }

            if ("POST".equals(method)) {
                handlePost(exchange, path);
                return;
            }

            HttpUtil.sendJson(exchange, 405, HttpUtil.error("method not allowed"));
        } catch (Exception e) {
            Map<String, Object> body = HttpUtil.error(e.getMessage() == null ? "internal error" : e.getMessage());
            HttpUtil.sendJson(exchange, 500, body);
        }
    }

    private void handleGet(HttpExchange exchange, String path, Map<String, String> query) throws IOException {
        switch (path) {
            case "/api/app/version" -> HttpUtil.sendJson(exchange, appVersion());
            case "/api/visual-bridge/health" -> HttpUtil.sendJson(exchange, context.visualBridge.health());
            case "/api/visual-bridge/state" -> HttpUtil.sendJson(exchange, context.visualBridge.state());
            case "/api/search", "/api/netease/search" -> HttpUtil.sendJson(exchange, context.netease.search(
                HttpUtil.param(query, "keyword", HttpUtil.param(query, "q", "")),
                HttpUtil.intParam(query, "page", 1, 1, 10000),
                HttpUtil.intParam(query, "limit", 20, 1, 50)
            ));
            case "/api/song/url", "/api/netease/song/url" -> HttpUtil.sendJson(exchange, context.netease.songUrlPayload(
                HttpUtil.param(query, "id", ""),
                HttpUtil.param(query, "quality", HttpUtil.param(query, "level", "standard"))
            ));
            case "/api/lyric", "/api/netease/lyric" -> HttpUtil.sendRawJson(exchange, 200, context.netease.rawGet(
                "/lyric",
                mapOf("id", HttpUtil.param(query, "id", ""))
            ));
            case "/api/cover" -> handleCover(exchange, query);
            case "/api/login/status" -> HttpUtil.sendJson(exchange, context.netease.accountPayload());
            case "/api/login/qr/key", "/api/netease/login/qr/key" -> HttpUtil.sendRawJson(exchange, 200, context.netease.loginQrKeyPayload());
            case "/api/netease/service/status" -> HttpUtil.sendJson(exchange, context.netease.serviceStatus());
            case "/api/netease/login/status" -> HttpUtil.sendRawJson(exchange, 200, context.netease.rawGet("/login/status"));
            case "/api/netease/login/qr/create" -> HttpUtil.sendRawJson(exchange, 200, context.netease.loginQrCreatePayload(
                HttpUtil.param(query, "key", ""),
                Boolean.parseBoolean(HttpUtil.param(query, "qrimg", "true"))
            ));
            case "/api/netease/login/qr/check" -> HttpUtil.sendRawJson(exchange, 200, context.netease.loginQrCheckPayload(
                HttpUtil.param(query, "key", "")
            ));
            case "/api/netease/user/playlists" -> HttpUtil.sendJson(exchange, context.netease.userPlaylistsPayload());
            case "/api/user/playlists" -> HttpUtil.sendJson(exchange, SimpleJson.asList(context.netease.userPlaylistsPayload().get("playlists")));
            case "/api/playlist/tracks", "/api/netease/playlist/tracks" -> HttpUtil.sendJson(exchange, context.netease.playlistTracksPayload(
                HttpUtil.param(query, "id", ""),
                HttpUtil.intParam(query, "limit", 50, 1, 100)
            ));
            case "/api/netease/daily/recommend" -> HttpUtil.sendJson(exchange, context.netease.dailyRecommendPayload(
                HttpUtil.intParam(query, "limit", 30, 1, 50)
            ));
            case "/api/netease/recent/songs" -> HttpUtil.sendJson(exchange, context.netease.recentSongsPayload(
                HttpUtil.intParam(query, "limit", 30, 1, 50)
            ));
            case "/api/netease/liked/songs" -> HttpUtil.sendJson(exchange, context.netease.likedSongsPayload(
                HttpUtil.intParam(query, "limit", 30, 1, 50)
            ));
            case "/api/player/state" -> HttpUtil.sendJson(exchange, context.player.state());
            case "/api/player/volume" -> HttpUtil.sendJson(exchange, context.player.setVolume(
                HttpUtil.doubleParam(query, "value", 0.8, 0.0, 1.0)
            ));
            case "/api/player/seek" -> HttpUtil.sendJson(exchange, context.player.seek(
                HttpUtil.intParam(query, "position", 0, 0, 86400)
            ));
            case "/api/player/toggle" -> HttpUtil.sendJson(exchange, context.player.toggle());
            case "/api/player/pause" -> HttpUtil.sendJson(exchange, context.player.pause());
            case "/api/player/play" -> HttpUtil.sendJson(exchange, context.player.play());
            case "/api/player/previous" -> HttpUtil.sendJson(exchange, context.player.previous());
            case "/api/player/next" -> HttpUtil.sendJson(exchange, context.player.next());
            case "/api/player/load" -> HttpUtil.sendJson(exchange, context.player.load(songFromQuery(query), HttpUtil.param(query, "quality", "standard")));
            case "/api/podcast/hot" -> HttpUtil.sendJson(exchange, emptySongs("podcast"));
            case "/api/weather/radio" -> HttpUtil.sendJson(exchange, weatherPayload(HttpUtil.param(query, "code", "")));
            case "/api/update/latest" -> HttpUtil.sendJson(exchange, updatePayload());
            default -> HttpUtil.notFound(exchange);
        }
    }

    private void handlePost(HttpExchange exchange, String path) throws IOException {
        String body = HttpUtil.readBody(exchange);
        Map<String, Object> root = SimpleJson.parseObject(body);
        switch (path) {
            case "/api/player/queue" -> HttpUtil.sendJson(exchange, context.player.setQueue(
                songsFromPayload(root),
                SimpleJson.asInt(root.get("currentIndex"), -1)
            ));
            case "/api/player/queue/merge" -> HttpUtil.sendJson(exchange, context.player.mergeQueue(
                songsFromPayload(root),
                SimpleJson.asString(root.get("mode"), "append")
            ));
            default -> HttpUtil.notFound(exchange);
        }
    }

    private void handleCover(HttpExchange exchange, Map<String, String> query) throws IOException {
        String url = HttpUtil.param(query, "url", "");
        if (url.isBlank()) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("cover url missing"));
            return;
        }
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(10))
                .GET()
                .build();
            HttpResponse<byte[]> response = coverClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            String type = response.headers().firstValue("content-type").orElse("image/jpeg");
            HttpUtil.sendBytes(exchange, response.statusCode(), type, response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            HttpUtil.sendJson(exchange, 502, HttpUtil.error("cover proxy interrupted"));
        } catch (Exception e) {
            HttpUtil.sendJson(exchange, 502, HttpUtil.error("cover proxy failed: " + e.getMessage()));
        }
    }

    private static Map<String, Object> appVersion() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "FE Monster Java");
        body.put("version", "1.0.0-java");
        body.put("runtime", System.getProperty("java.version"));
        body.put("ok", true);
        return body;
    }

    private static Song songFromQuery(Map<String, String> query) {
        Song song = new Song();
        song.id = HttpUtil.param(query, "id", "");
        song.title = HttpUtil.param(query, "title", "");
        song.artist = HttpUtil.param(query, "artist", "");
        song.album = HttpUtil.param(query, "album", "");
        song.cover = HttpUtil.param(query, "cover", "");
        song.provider = HttpUtil.param(query, "provider", "netease");
        song.duration = HttpUtil.intParam(query, "duration", 0, 0, 86400);
        return song;
    }

    private static List<Song> songsFromPayload(Map<String, Object> root) {
        List<Song> songs = new ArrayList<>();
        for (Object item : SimpleJson.asList(root.get("songs"))) {
            Song song = Song.fromMap(SimpleJson.asMap(item));
            if (song.hasIdentity()) songs.add(song);
        }
        return songs;
    }

    private static Map<String, Object> emptySongs(String provider) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("provider", provider);
        body.put("songs", List.of());
        return body;
    }

    private static Map<String, Object> weatherPayload(String code) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("provider", "weather");
        body.put("code", code);
        body.put("songs", List.of());
        body.put("ok", true);
        return body;
    }

    private static Map<String, Object> updatePayload() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("version", "1.0.0-java");
        body.put("downloadUrl", "");
        body.put("releaseNotes", "Java rewrite preview build");
        body.put("fileSize", 0);
        return body;
    }

    private static Map<String, String> mapOf(String key, String value) {
        Map<String, String> map = new LinkedHashMap<>();
        map.put(key, value);
        return map;
    }

    private static Map<String, String> mapOf(String keyA, String valueA, String keyB, String valueB) {
        Map<String, String> map = new LinkedHashMap<>();
        map.put(keyA, valueA);
        map.put(keyB, valueB);
        return map;
    }
}
