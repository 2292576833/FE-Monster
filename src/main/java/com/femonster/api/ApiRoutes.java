package com.femonster.api;

import com.femonster.core.AppContext;
import com.femonster.desktop.LocalClientLauncher;
import com.femonster.http.HttpUtil;
import com.femonster.json.SimpleJson;
import com.femonster.model.Song;
import com.femonster.music.MusicProviderRegistry;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

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
                handlePost(exchange, path, query);
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
            case "/api/app/machine" -> HttpUtil.sendJson(exchange, context.machine.payload());
            case "/api/app/runtime" -> HttpUtil.sendJson(exchange, LocalClientLauncher.runtimePayload(
                context.audioEngine.runtimePayload(),
                context.runtimeSettings.snapshot()
            ));
            case "/api/app/runtime/settings" -> HttpUtil.sendJson(exchange, context.runtimeSettings.snapshot());
            case "/api/app/gesture" -> HttpUtil.sendJson(exchange, context.gestureControl.status(
                context.runtimeSettings.gestureControlEnabled(),
                context.runtimeSettings.gestureCameraSource()
            ));
            case "/api/audio/runtime" -> HttpUtil.sendJson(exchange, context.audioEngine.runtimePayload());
            case "/api/audio/sample" -> HttpUtil.sendJson(exchange, context.audioEngine.samplePayload());
            case "/api/app/window/fullscreen" -> HttpUtil.sendJson(exchange, LocalClientLauncher.controlPayload("fullscreen"));
            case "/api/app/window/normal" -> HttpUtil.sendJson(exchange, LocalClientLauncher.controlPayload("normal"));
            case "/api/app/window/minimize" -> HttpUtil.sendJson(exchange, LocalClientLauncher.controlPayload("minimize"));
            case "/api/app/window/close" -> handleQuit(exchange, false);
            case "/api/app/quit", "/api/app/window/quit" -> handleQuit(exchange, true);
            case "/api/visual-bridge/health" -> HttpUtil.sendJson(exchange, context.visualBridge.health());
            case "/api/visual-bridge/state" -> HttpUtil.sendJson(exchange, context.visualBridge.state());
            case "/api/wallpapers" -> HttpUtil.sendJson(exchange, context.wallpapers.payload(Boolean.parseBoolean(HttpUtil.param(query, "scan", "true"))));
            case "/api/wallpapers/file" -> handleWallpaperFile(exchange, query);
            case "/api/providers" -> HttpUtil.sendJson(exchange, context.music.providersPayload());
            case "/api/community/state" -> handleCommunityState(exchange, query);
            case "/api/community/messages" -> handleCommunityMessages(exchange, query);
            case "/api/community/nearby" -> handleCommunityNearby(exchange, query);
            case "/api/community/listen/state" -> handleCommunityListenState(exchange, query);
            case "/api/community/call/signals" -> handleCommunityCallSignals(exchange, query);
            case "/api/community/events" -> handleCommunityEvents(exchange, query);
            case "/api/search", "/api/netease/search", "/api/qq/search", "/api/kugou/search" -> HttpUtil.sendJson(exchange, context.music.search(
                providerFrom(path, query),
                HttpUtil.param(query, "keyword", HttpUtil.param(query, "q", "")),
                HttpUtil.intParam(query, "page", 1, 1, 10000),
                HttpUtil.intParam(query, "limit", 20, 1, 50)
            ));
            case "/api/song/url", "/api/netease/song/url", "/api/qq/song/url", "/api/kugou/song/url" -> HttpUtil.sendJson(exchange, context.music.songUrlPayload(
                providerFrom(path, query),
                HttpUtil.param(query, "id", ""),
                HttpUtil.param(query, "quality", HttpUtil.param(query, "level", "standard"))
            ));
            case "/api/song/comments", "/api/netease/song/comments", "/api/qq/song/comments", "/api/kugou/song/comments" -> HttpUtil.sendJson(exchange, context.music.commentsPayload(
                providerFrom(path, query),
                songCommentId(query),
                HttpUtil.intParam(query, "limit", 20, 1, 80)
            ));
            case "/api/lyric", "/api/netease/lyric" -> HttpUtil.sendRawJson(exchange, 200, context.netease.rawGet(
                "/lyric",
                mapOf("id", HttpUtil.param(query, "id", ""))
            ));
            case "/api/cover" -> handleCover(exchange, query);
            case "/api/login/status" -> HttpUtil.sendJson(exchange, context.music.accountPayload(providerFrom(path, query)));
            case "/api/login/qr/key", "/api/netease/login/qr/key", "/api/qq/login/qr/key", "/api/kugou/login/qr/key" -> HttpUtil.sendRawJson(exchange, 200, context.music.loginQrKeyPayload(providerFrom(path, query)));
            case "/api/netease/service/status", "/api/qq/service/status", "/api/kugou/service/status" -> HttpUtil.sendJson(exchange, context.music.serviceStatus(providerFrom(path, query)));
            case "/api/netease/login/status" -> HttpUtil.sendRawJson(exchange, 200, context.netease.rawGet("/login/status"));
            case "/api/qq/login/status", "/api/kugou/login/status" -> HttpUtil.sendJson(exchange, context.music.accountPayload(providerFrom(path, query)));
            case "/api/netease/login/qr/create", "/api/qq/login/qr/create", "/api/kugou/login/qr/create" -> HttpUtil.sendRawJson(exchange, 200, context.music.loginQrCreatePayload(
                providerFrom(path, query),
                HttpUtil.param(query, "key", ""),
                Boolean.parseBoolean(HttpUtil.param(query, "qrimg", "true"))
            ));
            case "/api/netease/login/qr/check", "/api/qq/login/qr/check", "/api/kugou/login/qr/check" -> HttpUtil.sendRawJson(exchange, 200, context.music.loginQrCheckPayload(
                providerFrom(path, query),
                HttpUtil.param(query, "key", "")
            ));
            case "/api/netease/user/playlists", "/api/qq/user/playlists", "/api/kugou/user/playlists" -> HttpUtil.sendJson(exchange, context.music.userPlaylistsPayload(providerFrom(path, query)));
            case "/api/user/playlists" -> HttpUtil.sendJson(exchange, SimpleJson.asList(context.music.userPlaylistsPayload(providerFrom(path, query)).get("playlists")));
            case "/api/playlist/tracks", "/api/netease/playlist/tracks", "/api/qq/playlist/tracks", "/api/kugou/playlist/tracks" -> HttpUtil.sendJson(exchange, context.music.playlistTracksPayload(
                providerFrom(path, query),
                HttpUtil.param(query, "id", ""),
                HttpUtil.intParam(query, "limit", 0, 0, Integer.MAX_VALUE)
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
            case "/api/update/progress" -> HttpUtil.sendJson(exchange, context.updates.progress(HttpUtil.param(query, "id", "")));
            default -> HttpUtil.notFound(exchange);
        }
    }

    private void handleQuit(HttpExchange exchange, boolean quitServer) throws IOException {
        HttpUtil.sendJson(exchange, LocalClientLauncher.controlPayload(quitServer ? "quit" : "close"));
        if (quitServer) {
            Thread shutdown = new Thread(() -> {
                try {
                    Thread.sleep(180);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
                cleanupBackgroundServices();
                context.gestureControl.stop();
                System.exit(0);
            }, "fe-monster-shutdown");
            shutdown.setDaemon(false);
            shutdown.start();
        }
    }

    private void cleanupBackgroundServices() {
        Path script = context.paths.root.resolve("scripts").resolve("stop-stale-fe-monster.ps1");
        if (!Files.isRegularFile(script)) return;

        ProcessBuilder builder = new ProcessBuilder(
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-File",
            script.toString(),
            "-Root",
            context.paths.root.toString(),
            "-SkipJava"
        );
        builder.directory(context.paths.root.toFile());
        builder.redirectOutput(ProcessBuilder.Redirect.DISCARD);
        builder.redirectError(ProcessBuilder.Redirect.DISCARD);

        try {
            Process process = builder.start();
            if (!process.waitFor(2, TimeUnit.SECONDS)) {
                process.destroy();
            }
        } catch (IOException ignored) {
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    private void handlePost(HttpExchange exchange, String path, Map<String, String> query) throws IOException {
        if ("/api/wallpapers/import".equals(path)) {
            HttpUtil.sendJson(exchange, context.wallpapers.importFile(HttpUtil.param(query, "name", "wallpaper"), exchange.getRequestBody()));
            return;
        }
        if ("/api/app/recording/save".equals(path)) {
            handleRecordingSave(exchange, query);
            return;
        }

        String body = HttpUtil.readBody(exchange);
        Map<String, Object> root = SimpleJson.parseObject(body);
        switch (path) {
            case "/api/app/runtime/settings" -> {
                Map<String, Object> saved = context.runtimeSettings.update(root);
                saved.put("gestureStatus", context.gestureControl.applyEnabled(
                    context.runtimeSettings.gestureControlEnabled(),
                    context.runtimeSettings.gestureCameraSource()
                ));
                HttpUtil.sendJson(exchange, saved);
            }
            case "/api/playlist/add", "/api/netease/playlist/add", "/api/qq/playlist/add", "/api/kugou/playlist/add" -> handlePlaylistAdd(exchange, path, query, root);
            case "/api/community/friends/add" -> handleCommunityAddFriend(exchange, query, root);
            case "/api/community/profile" -> handleCommunityProfile(exchange, query, root);
            case "/api/community/listening" -> handleCommunityListening(exchange, query, root);
            case "/api/community/messages/send" -> handleCommunitySendMessage(exchange, query, root);
            case "/api/community/likes/add" -> handleCommunityLikeFriend(exchange, query, root);
            case "/api/community/listen/invite" -> handleCommunityListenInvite(exchange, query, root);
            case "/api/community/listen/respond" -> handleCommunityListenRespond(exchange, query, root);
            case "/api/community/listen/leave" -> handleCommunityListenLeave(exchange, query, root);
            case "/api/community/call/signal" -> handleCommunityCallSignal(exchange, query, root);
            case "/api/community/relay" -> handleCommunityRelay(exchange, query, root);
            case "/api/update/install" -> HttpUtil.sendJson(exchange, context.updates.startInstall(SimpleJson.asMap(root.get("release"))));
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

    private void handlePlaylistAdd(HttpExchange exchange, String path, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = providerFrom(path, query);
        String playlistId = firstNonBlank(
            SimpleJson.asString(root.get("playlistId"), ""),
            SimpleJson.asString(root.get("pid"), ""),
            SimpleJson.asString(root.get("id"), ""),
            HttpUtil.param(query, "playlistId", ""),
            HttpUtil.param(query, "id", "")
        );
        Map<String, Object> songMap = new LinkedHashMap<>(SimpleJson.asMap(root.get("song")));
        if (songMap.isEmpty()) {
            songMap.put("id", firstNonBlank(
                SimpleJson.asString(root.get("songId"), ""),
                SimpleJson.asString(root.get("songid"), ""),
                SimpleJson.asString(root.get("songmid"), ""),
                SimpleJson.asString(root.get("mid"), ""),
                SimpleJson.asString(root.get("hash"), "")
            ));
            songMap.put("title", SimpleJson.asString(root.get("title"), ""));
            songMap.put("artist", SimpleJson.asString(root.get("artist"), ""));
            songMap.put("album", SimpleJson.asString(root.get("album"), ""));
            songMap.put("cover", SimpleJson.asString(root.get("cover"), ""));
            songMap.put("duration", root.get("duration"));
        }
        Song song = Song.fromMap(songMap);
        song.provider = provider;
        HttpUtil.sendJson(exchange, context.music.addSongToPlaylistPayload(provider, playlistId, song));
    }

    private void handleCommunityState(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = MusicProviderRegistry.normalize(HttpUtil.param(query, "provider", "netease"));
        String label = providerLabel(provider);
        HttpUtil.sendJson(exchange, context.community.state(provider, label, context.music.accountPayload(provider)));
    }

    private void handleCommunityMessages(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.messages(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            HttpUtil.param(query, "targetId", HttpUtil.param(query, "id", ""))
        ));
    }

    private void handleCommunityNearby(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.nearby(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            HttpUtil.intParam(query, "radiusKm", 10, 5, 10)
        ));
    }

    private void handleCommunityListenState(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.listenState(provider, providerLabel(provider), context.music.accountPayload(provider)));
    }

    private void handleCommunityCallSignals(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.callSignals(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            HttpUtil.param(query, "sessionId", ""),
            HttpUtil.param(query, "after", "")
        ));
    }

    private void handleCommunityEvents(HttpExchange exchange, Map<String, String> query) throws IOException {
        try {
            HttpResponse<InputStream> response = context.community.eventStream(
                HttpUtil.param(query, "feId", ""),
                HttpUtil.param(query, "after", "")
            );
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String type = response.headers().firstValue("content-type").orElse("application/json; charset=utf-8");
                byte[] body;
                try (InputStream input = response.body()) {
                    body = input.readAllBytes();
                }
                HttpUtil.sendBytes(exchange, response.statusCode(), type, body);
                return;
            }

            HttpUtil.addCors(exchange);
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
            exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-transform");
            exchange.getResponseHeaders().set("Connection", "keep-alive");
            exchange.getResponseHeaders().set("X-Accel-Buffering", "no");
            exchange.sendResponseHeaders(200, 0);
            try (InputStream input = response.body(); OutputStream output = exchange.getResponseBody()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) >= 0) {
                    output.write(buffer, 0, read);
                    output.flush();
                }
            } catch (IOException ignored) {
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            HttpUtil.sendJson(exchange, 502, HttpUtil.error("community event stream interrupted"));
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            HttpUtil.sendJson(exchange, 502, HttpUtil.error("community event stream unavailable"));
        }
    }

    private void handleCommunityAddFriend(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        String targetId = SimpleJson.asString(root.get("targetId"), SimpleJson.asString(root.get("id"), HttpUtil.param(query, "id", "")));
        HttpUtil.sendJson(exchange, context.community.addFriend(provider, providerLabel(provider), context.music.accountPayload(provider), targetId));
    }

    private void handleCommunityProfile(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.updateProfile(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("bio"), "")
        ));
    }

    private void handleCommunityListening(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.recordListening(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asLong(root.get("listenMsDelta"), 0L),
            SimpleJson.asMap(root.get("song"))
        ));
    }

    private void handleCommunitySendMessage(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.sendMessage(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("targetId"), ""),
            SimpleJson.asString(root.get("text"), "")
        ));
    }

    private void handleCommunityLikeFriend(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.likeFriend(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("targetId"), "")
        ));
    }

    private void handleCommunityListenInvite(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.inviteListen(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("targetId"), ""),
            SimpleJson.asMap(root.get("song"))
        ));
    }

    private void handleCommunityListenRespond(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.respondListen(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("inviteId"), ""),
            SimpleJson.asBoolean(root.get("accepted"), false)
        ));
    }

    private void handleCommunityListenLeave(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.leaveListen(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("sessionId"), "")
        ));
    }

    private void handleCommunityCallSignal(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.sendCallSignal(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("targetId"), ""),
            SimpleJson.asString(root.get("sessionId"), ""),
            SimpleJson.asString(root.get("type"), ""),
            root.get("payload")
        ));
    }

    private void handleCommunityRelay(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.relay(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("targetId"), SimpleJson.asString(root.get("to"), "")),
            SimpleJson.asString(root.get("type"), "message"),
            root.get("payload")
        ));
    }

    private void handleRecordingSave(HttpExchange exchange, Map<String, String> query) throws IOException {
        Path root = context.paths.root.toAbsolutePath().normalize();
        Files.createDirectories(root);
        String fileName = sanitizeRecordingFileName(HttpUtil.param(query, "name", "recording.mp4"));
        Path target = root.resolve(fileName).normalize();
        if (!target.startsWith(root)) throw new IOException("invalid recording file path");

        long size;
        try (InputStream in = exchange.getRequestBody(); OutputStream out = Files.newOutputStream(target)) {
            size = in.transferTo(out);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("fileName", fileName);
        body.put("path", target.toString());
        body.put("size", size);
        HttpUtil.sendJson(exchange, body);
    }

    private static String sanitizeRecordingFileName(String requested) {
        String fileName = requested == null ? "" : requested.replace('\\', '/');
        int slash = fileName.lastIndexOf('/');
        if (slash >= 0) fileName = fileName.substring(slash + 1);
        fileName = fileName.replaceAll("[^A-Za-z0-9._-]", "_");
        if (fileName.isBlank() || ".".equals(fileName) || "..".equals(fileName)) fileName = "recording.mp4";
        String lower = fileName.toLowerCase();
        if (!lower.endsWith(".mp4") && !lower.endsWith(".webm")) fileName += ".mp4";
        return fileName;
    }

    private void handleWallpaperFile(HttpExchange exchange, Map<String, String> query) throws IOException {
        Path file = context.wallpapers.resolveServableFile(HttpUtil.param(query, "path", ""));
        long size = Files.size(file);
        HttpUtil.addCors(exchange);
        exchange.getResponseHeaders().set("Content-Type", context.wallpapers.contentType(file));
        exchange.getResponseHeaders().set("Accept-Ranges", "bytes");

        String range = exchange.getRequestHeaders().getFirst("Range");
        if (range != null && range.startsWith("bytes=")) {
            long[] parsed = parseByteRange(range, size);
            if (parsed == null) {
                exchange.getResponseHeaders().set("Content-Range", "bytes */" + size);
                exchange.sendResponseHeaders(416, -1);
                exchange.close();
                return;
            }

            long start = parsed[0];
            long end = parsed[1];
            long length = end - start + 1;
            exchange.getResponseHeaders().set("Content-Range", "bytes " + start + "-" + end + "/" + size);
            exchange.sendResponseHeaders(206, length);
            try (var out = exchange.getResponseBody()) {
                copyRange(file, out, start, length);
            }
            return;
        }

        exchange.sendResponseHeaders(200, size);
        try (var out = exchange.getResponseBody()) {
            Files.copy(file, out);
        }
    }

    private static long[] parseByteRange(String header, long size) {
        if (size <= 0) return null;
        try {
            String value = header.substring("bytes=".length()).split(",", 2)[0].trim();
            int dash = value.indexOf('-');
            if (dash < 0) return null;

            String startText = value.substring(0, dash).trim();
            String endText = value.substring(dash + 1).trim();
            long start;
            long end;
            if (startText.isEmpty()) {
                long suffix = Long.parseLong(endText);
                if (suffix <= 0) return null;
                start = Math.max(0, size - suffix);
                end = size - 1;
            } else {
                start = Long.parseLong(startText);
                end = endText.isEmpty() ? size - 1 : Math.min(Long.parseLong(endText), size - 1);
            }
            if (start < 0 || start >= size || end < start) return null;
            return new long[] { start, end };
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static void copyRange(Path file, OutputStream output, long start, long length) throws IOException {
        byte[] buffer = new byte[256 * 1024];
        long remaining = length;
        try (InputStream input = Files.newInputStream(file)) {
            input.skipNBytes(start);
            while (remaining > 0) {
                int read = input.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                if (read < 0) return;
                output.write(buffer, 0, read);
                remaining -= read;
            }
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
        body.put("version", "1.0.1-java26");
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
        song.provider = MusicProviderRegistry.normalize(HttpUtil.param(query, "provider", "netease"));
        song.duration = HttpUtil.intParam(query, "duration", 0, 0, 86400);
        return song;
    }

    private static String providerFrom(String path, Map<String, String> query) {
        if (path.contains("/qq/")) return "qq";
        if (path.contains("/kugou/")) return "kugou";
        if (path.contains("/netease/")) return "netease";
        return MusicProviderRegistry.normalize(HttpUtil.param(query, "provider", "netease"));
    }

    private static String songCommentId(Map<String, String> query) {
        return firstNonBlank(
            HttpUtil.param(query, "id", ""),
            HttpUtil.param(query, "mid", ""),
            HttpUtil.param(query, "songid", ""),
            HttpUtil.param(query, "songmid", "")
        );
    }

    private static String providerLabel(String provider) {
        return switch (MusicProviderRegistry.normalize(provider)) {
            case "qq" -> "QQ音乐";
            case "kugou" -> "酷狗音乐";
            default -> "网易云";
        };
    }

    private static String communityProvider(Map<String, String> query) {
        return MusicProviderRegistry.normalize(HttpUtil.param(query, "provider", "netease"));
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
        body.put("version", "1.0.1-java26");
        body.put("downloadUrl", "");
        body.put("releaseNotes", "Java26 installer runtime check, book lyric scene preset, and smoother lyric sync.");
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

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "";
    }
}
