package com.femonster.netease;

import com.femonster.json.SimpleJson;
import com.femonster.music.CommentPayloads;
import com.femonster.music.MusicProviderClient;
import com.femonster.model.Playlist;
import com.femonster.model.Song;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

public final class NeteaseClient implements MusicProviderClient {
    private final String baseUrl;
    private final HttpClient client;
    private final Path authFile;
    private volatile String cookie = "";

    public NeteaseClient(String baseUrl) {
        this(baseUrl, null);
    }

    public NeteaseClient(String baseUrl, Path authFile) {
        this.baseUrl = normalizeBase(baseUrl);
        this.authFile = authFile == null ? null : authFile.toAbsolutePath().normalize();
        this.client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
        restoreAuth();
    }

    @Override
    public String id() {
        return "netease";
    }

    @Override
    public String label() {
        return "网易云";
    }

    @Override
    public String baseUrl() {
        return baseUrl;
    }

    public String rawGet(String path) {
        return rawGet(path, Map.of());
    }

    public String rawGet(String path, Map<String, String> params) {
        return rawGet(path, params, true);
    }

    private String rawGet(String path, Map<String, String> params, boolean useCookie) {
        try {
            HttpRequest request = HttpRequest.newBuilder(buildUri(path, requestParams(params, useCookie)))
                .timeout(Duration.ofSeconds(12))
                .GET()
                .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            return response.body();
        } catch (IOException | InterruptedException | IllegalArgumentException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("ok", false);
            error.put("provider", "netease");
            error.put("label", label());
            error.put("baseUrl", baseUrl);
            error.put("error", label() + " API unavailable at " + baseUrl + ": " + exceptionDetail(e));
            return SimpleJson.stringify(error);
        }
    }

    @Override
    public String loginQrKeyPayload() {
        return rawGet("/login/qr/key", timestampParams(), false);
    }

    @Override
    public String loginQrCreatePayload(String key, boolean qrimg) {
        Map<String, String> params = timestampParams();
        params.put("key", key == null ? "" : key);
        params.put("qrimg", String.valueOf(qrimg));
        return rawGet("/login/qr/create", params, false);
    }

    @Override
    public String loginQrCheckPayload(String key) {
        Map<String, String> params = timestampParams();
        params.put("key", key == null ? "" : key);
        String json = rawGet("/login/qr/check", params, false);
        try {
            Map<String, Object> root = SimpleJson.asMap(SimpleJson.parse(json));
            String nextCookie = SimpleJson.asString(root.get("cookie"), "");
            if (SimpleJson.asInt(root.get("code"), 0) == 803 && !nextCookie.isBlank()) {
                rememberCookie(nextCookie);
            }
        } catch (RuntimeException ignored) {
            // Keep the original upstream payload so the browser can show the API error.
        }
        return json;
    }

    public Object jsonGet(String path, Map<String, String> params) {
        return SimpleJson.parse(rawGet(path, params));
    }

    public Map<String, Object> accountPayload() {
        Map<String, Object> login = SimpleJson.asMap(jsonGet("/login/status", Map.of()));
        Map<String, Object> profile = profileFromLogin(login);
        Map<String, Object> account = new LinkedHashMap<>();
        String uid = idString(profile.get("userId"));
        account.put("userId", uid);
        account.put("nickname", SimpleJson.asString(profile.get("nickname"), ""));
        account.put("avatarUrl", SimpleJson.asString(profile.get("avatarUrl"), ""));
        account.put("vipType", SimpleJson.asInt(profile.get("vipType"), 0));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("loggedIn", !uid.isBlank() || !SimpleJson.asString(account.get("nickname"), "").isBlank());
        body.put("provider", "netease");
        body.put("label", label());
        body.put("account", account);
        body.put("status", SimpleJson.asInt(login.get("_httpStatus"), 0));
        if (login.containsKey("error")) body.put("error", login.get("error"));
        return body;
    }

    @Override
    public Map<String, Object> serviceStatus() {
        Map<String, Object> body = new LinkedHashMap<>();
        Object login = jsonGet("/login/status", Map.of());
        body.put("ok", true);
        body.put("provider", "netease");
        body.put("label", label());
        body.put("baseUrl", baseUrl);
        body.put("reachable", !SimpleJson.asMap(login).containsKey("error"));
        body.put("login", login);
        return body;
    }

    @Override
    public Map<String, Object> search(String keyword, int page, int limit) {
        int offset = Math.max(0, page - 1) * limit;
        Map<String, String> params = new LinkedHashMap<>();
        params.put("keywords", keyword == null ? "" : keyword);
        params.put("limit", String.valueOf(limit));
        params.put("offset", String.valueOf(offset));
        Object root = jsonGet("/search", params);
        List<Song> songs = new ArrayList<>();
        Map<String, Object> result = SimpleJson.asMap(SimpleJson.asMap(root).get("result"));
        for (Object item : SimpleJson.asList(result.get("songs"))) {
            Song song = songFromNetease(item);
            if (song.hasIdentity()) songs.add(song);
        }
        enrichSongDetails(songs);
        return songsPayload(songs, "search");
    }

    private void enrichSongDetails(List<Song> songs) {
        List<String> missingCoverIds = songs.stream()
            .filter((song) -> song != null && song.hasIdentity() && (song.cover == null || song.cover.isBlank()))
            .map((song) -> song.id)
            .distinct()
            .toList();
        if (missingCoverIds.isEmpty()) return;

        try {
            Object detailRoot = jsonGet("/song/detail", Map.of("ids", String.join(",", missingCoverIds)));
            Map<String, Song> details = new LinkedHashMap<>();
            for (Object item : SimpleJson.asList(SimpleJson.asMap(detailRoot).get("songs"))) {
                Song detail = songFromNetease(item);
                if (detail.hasIdentity()) details.put(detail.id, detail);
            }
            for (Song song : songs) {
                Song detail = details.get(song.id);
                if (detail == null) continue;
                if ((song.cover == null || song.cover.isBlank()) && detail.cover != null) song.cover = detail.cover;
                if ((song.album == null || song.album.isBlank()) && detail.album != null) song.album = detail.album;
                if ((song.artist == null || song.artist.isBlank()) && detail.artist != null) song.artist = detail.artist;
                if (song.duration <= 0) song.duration = detail.duration;
            }
        } catch (RuntimeException ignored) {
        }
    }

    public String songUrl(String id, String quality) {
        if (id == null || id.isBlank()) return "";
        Map<String, String> params = new LinkedHashMap<>();
        params.put("id", id);
        if (quality != null && !quality.isBlank()) params.put("level", quality);
        Object root = jsonGet("/song/url", params);
        List<Object> data = SimpleJson.asList(SimpleJson.asMap(root).get("data"));
        if (data.isEmpty()) return "";
        return SimpleJson.asString(SimpleJson.asMap(data.get(0)).get("url"), "");
    }

    public Map<String, Object> songUrlPayload(String id, String quality) {
        String url = songUrl(id, quality);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("provider", "netease");
        body.put("url", url);
        body.put("playable", !url.isBlank());
        return body;
    }

    @Override
    public Map<String, Object> userPlaylistsPayload() {
        String uid = currentUid();
        Map<String, Object> body = new LinkedHashMap<>();
        if (uid.isBlank()) {
            body.put("ok", false);
            body.put("loggedIn", false);
            body.put("playlists", List.of());
            body.put("error", "netease login required");
            body.put("provider", "netease");
            body.put("label", label());
            return body;
        }
        List<Map<String, Object>> playlists = new ArrayList<>();
        for (Playlist playlist : userPlaylists(uid)) playlists.add(playlist.toMap());
        body.put("ok", true);
        body.put("loggedIn", true);
        body.put("uid", uid);
        body.put("provider", "netease");
        body.put("label", label());
        body.put("playlists", playlists);
        return body;
    }

    public List<Playlist> userPlaylists(String uid) {
        Object root = jsonGet("/user/playlist", Map.of("uid", uid));
        List<Playlist> playlists = new ArrayList<>();
        for (Object item : SimpleJson.asList(SimpleJson.asMap(root).get("playlist"))) {
            Map<String, Object> map = SimpleJson.asMap(item);
            Playlist playlist = new Playlist();
            playlist.id = idString(map.get("id"));
            playlist.name = SimpleJson.asString(map.get("name"), "");
            playlist.cover = SimpleJson.asString(map.get("coverImgUrl"), "");
            playlist.trackCount = SimpleJson.asInt(map.get("trackCount"), 0);
            playlist.playCount = SimpleJson.asLong(map.get("playCount"), 0);
            playlist.creator = SimpleJson.asString(SimpleJson.asMap(map.get("creator")).get("nickname"), "");
            playlists.add(playlist);
        }
        return playlists;
    }

    public Map<String, Object> playlistTracksPayload(String playlistId, int limit) {
        int requestLimit = limit > 0 ? limit : 100000;
        Object root = jsonGet("/playlist/track/all", Map.of("id", playlistId, "limit", String.valueOf(requestLimit)));
        List<Song> songs = new ArrayList<>();
        for (Object item : SimpleJson.asList(SimpleJson.asMap(root).get("songs"))) {
            Song song = songFromNetease(item);
            if (song.hasIdentity()) songs.add(song);
            if (limit > 0 && songs.size() >= limit) break;
        }
        Map<String, Object> payload = songsPayload(songs, "playlist");
        payload.put("ok", true);
        return payload;
    }

    @Override
    public Map<String, Object> addSongToPlaylistPayload(String playlistId, Song song) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("provider", "netease");
        body.put("label", label());
        body.put("playlistId", playlistId == null ? "" : playlistId);
        body.put("song", song == null ? Song.empty().toMap() : song.toMap());

        if (playlistId == null || playlistId.isBlank()) {
            body.put("ok", false);
            body.put("error", "playlist id is missing");
            return body;
        }
        if (song == null || !song.hasIdentity()) {
            body.put("ok", false);
            body.put("error", "song id is missing");
            return body;
        }

        Map<String, String> params = new LinkedHashMap<>();
        params.put("op", "add");
        params.put("pid", playlistId);
        params.put("tracks", song.id);
        params.put("timestamp", String.valueOf(System.currentTimeMillis()));
        Object root = jsonGet("/playlist/tracks", params);
        Map<String, Object> map = SimpleJson.asMap(root);
        boolean ok = SimpleJson.asInt(map.get("code"), 0) == 200 ||
            SimpleJson.asBoolean(map.get("ok"), false) ||
            SimpleJson.asBoolean(SimpleJson.asMap(map.get("body")).get("success"), false);
        body.put("ok", ok);
        if (!ok) {
            body.put("error", firstNonBlank(
                SimpleJson.asString(map.get("message"), ""),
                SimpleJson.asString(map.get("msg"), ""),
                "failed to add song to playlist"
            ));
        }
        return body;
    }

    @Override
    public Map<String, Object> commentsPayload(String songId, int limit) {
        if (songId == null || songId.isBlank()) return CommentPayloads.error("netease", label(), "song id is missing");
        Map<String, String> params = new LinkedHashMap<>();
        params.put("id", songId);
        params.put("limit", String.valueOf(limit > 0 ? limit : 20));
        params.put("offset", "0");
        Object root = jsonGet("/comment/music", params);
        return CommentPayloads.fromRoot("netease", label(), root, limit);
    }

    public Map<String, Object> dailyRecommendPayload(int limit) {
        Object root = jsonGet("/recommend/songs", Map.of());
        List<Song> songs = new ArrayList<>();
        Object list = SimpleJson.asMap(SimpleJson.asMap(root).get("data")).get("dailySongs");
        for (Object item : SimpleJson.asList(list)) {
            Song song = songFromNetease(item);
            if (song.hasIdentity()) songs.add(song);
            if (songs.size() >= limit) break;
        }
        return songsPayload(songs, "daily");
    }

    public Map<String, Object> recentSongsPayload(int limit) {
        Object root = jsonGet("/record/recent/song", Map.of("limit", String.valueOf(limit)));
        List<Song> songs = new ArrayList<>();
        for (Object item : SimpleJson.asList(SimpleJson.asMap(SimpleJson.asMap(root).get("data")).get("list"))) {
            Map<String, Object> wrapper = SimpleJson.asMap(item);
            Song song = songFromNetease(wrapper.containsKey("song") ? wrapper.get("song") : item);
            if (song.hasIdentity()) songs.add(song);
            if (songs.size() >= limit) break;
        }
        return songsPayload(songs, "recent");
    }

    public Map<String, Object> likedSongsPayload(int limit) {
        String uid = currentUid();
        if (uid.isBlank()) return songsPayload(List.of(), "liked");
        Object likedRoot = jsonGet("/likelist", Map.of("uid", uid));
        List<String> ids = new ArrayList<>();
        for (Object item : SimpleJson.asList(SimpleJson.asMap(likedRoot).get("ids"))) {
            ids.add(idString(item));
            if (ids.size() >= limit) break;
        }
        if (ids.isEmpty()) return songsPayload(List.of(), "liked");
        Object detailRoot = jsonGet("/song/detail", Map.of("ids", String.join(",", ids)));
        List<Song> songs = new ArrayList<>();
        for (Object item : SimpleJson.asList(SimpleJson.asMap(detailRoot).get("songs"))) {
            Song song = songFromNetease(item);
            if (song.hasIdentity()) songs.add(song);
        }
        return songsPayload(songs, "liked");
    }

    public String currentUid() {
        Map<String, Object> login = SimpleJson.asMap(jsonGet("/login/status", Map.of()));
        return idString(profileFromLogin(login).get("userId"));
    }

    public static Song songFromNetease(Object value) {
        Map<String, Object> map = SimpleJson.asMap(value);
        if (map.containsKey("data")) map = SimpleJson.asMap(map.get("data"));
        Song song = new Song();
        song.id = idString(map.get("id"));
        song.title = SimpleJson.asString(map.get("name"), SimpleJson.asString(map.get("title"), ""));
        song.artist = firstArtist(map);
        song.album = albumName(map);
        song.cover = albumCover(map);
        int durationMs = SimpleJson.asInt(map.get("dt"), SimpleJson.asInt(map.get("duration"), 0));
        song.duration = durationMs > 1000 ? durationMs / 1000 : durationMs;
        song.provider = "netease";
        return song;
    }

    public static Map<String, Object> songsPayload(List<Song> songs, String source) {
        List<Map<String, Object>> arr = new ArrayList<>();
        for (Song song : songs) arr.add(song.toMap());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("provider", "netease");
        body.put("source", source);
        body.put("songs", arr);
        return body;
    }

    private static String firstArtist(Map<String, Object> song) {
        List<Object> ar = SimpleJson.asList(song.get("ar"));
        if (ar.isEmpty()) ar = SimpleJson.asList(song.get("artists"));
        if (ar.isEmpty()) return "";
        return SimpleJson.asString(SimpleJson.asMap(ar.get(0)).get("name"), "");
    }

    private static String albumName(Map<String, Object> song) {
        Map<String, Object> album = SimpleJson.asMap(song.containsKey("al") ? song.get("al") : song.get("album"));
        return SimpleJson.asString(album.get("name"), "");
    }

    private static String albumCover(Map<String, Object> song) {
        Map<String, Object> album = SimpleJson.asMap(song.containsKey("al") ? song.get("al") : song.get("album"));
        return SimpleJson.asString(album.get("picUrl"), "");
    }

    private static Map<String, Object> profileFromLogin(Map<String, Object> login) {
        Map<String, Object> data = SimpleJson.asMap(login.get("data"));
        Map<String, Object> profile = SimpleJson.asMap(data.get("profile"));
        if (profile.isEmpty()) profile = SimpleJson.asMap(login.get("profile"));
        return profile;
    }

    private static String idString(Object value) {
        return SimpleJson.asString(value, "");
    }

    private URI buildUri(String path, Map<String, String> params) {
        String normalizedPath = path.startsWith("/") ? path : "/" + path;
        StringBuilder uri = new StringBuilder(baseUrl).append(normalizedPath);
        if (!params.isEmpty()) {
            StringJoiner joiner = new StringJoiner("&");
            for (Map.Entry<String, String> entry : params.entrySet()) {
                joiner.add(encode(entry.getKey()) + "=" + encode(entry.getValue()));
            }
            uri.append('?').append(joiner);
        }
        return URI.create(uri.toString());
    }

    private Map<String, String> requestParams(Map<String, String> params, boolean useCookie) {
        Map<String, String> next = new LinkedHashMap<>(params == null ? Map.of() : params);
        if (useCookie && !cookie.isBlank() && !next.containsKey("cookie")) {
            next.put("cookie", cookie);
        }
        return next;
    }

    private void restoreAuth() {
        if (authFile == null || !Files.exists(authFile)) return;
        try {
            Map<String, Object> root = SimpleJson.parseObject(Files.readString(authFile, StandardCharsets.UTF_8));
            cookie = SimpleJson.asString(root.get("cookie"), "");
        } catch (IOException | RuntimeException ignored) {
            cookie = "";
        }
    }

    private synchronized void rememberCookie(String nextCookie) {
        cookie = nextCookie;
        if (authFile == null) return;
        try {
            Path parent = authFile.getParent();
            if (parent != null) Files.createDirectories(parent);
            Map<String, Object> root = new LinkedHashMap<>();
            root.put("provider", "netease");
            root.put("cookie", nextCookie);
            root.put("updatedAt", System.currentTimeMillis());
            Path temp = authFile.resolveSibling(authFile.getFileName().toString() + ".tmp");
            Files.writeString(temp, SimpleJson.stringify(root), StandardCharsets.UTF_8);
            try {
                Files.move(temp, authFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException ignored) {
                Files.move(temp, authFile, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException ignored) {
            // Keep the in-memory cookie for this session even if persistence fails.
        }
    }

    private static Map<String, String> timestampParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("timestamp", String.valueOf(System.currentTimeMillis()));
        return params;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    private static String exceptionDetail(Exception error) {
        Throwable current = error;
        while (current.getCause() != null) current = current.getCause();
        String message = current.getMessage();
        if (message == null || message.isBlank()) return current.getClass().getSimpleName();
        return message;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "";
    }

    private static String normalizeBase(String value) {
        String base = value == null || value.isBlank() ? "http://127.0.0.1:3010" : value.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base;
    }
}
