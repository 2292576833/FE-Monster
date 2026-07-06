package com.femonster.music;

import com.femonster.json.SimpleJson;
import com.femonster.model.Playlist;
import com.femonster.model.Song;

import java.io.IOException;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.ConnectException;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

public final class GenericMusicClient implements MusicProviderClient {
    private final String id;
    private final String label;
    private final String baseUrl;
    private final HttpClient client;
    private final Path sessionFile;
    private final Map<String, String> session;

    public GenericMusicClient(String id, String label, String baseUrl) {
        this(id, label, baseUrl, null);
    }

    public GenericMusicClient(String id, String label, String baseUrl, Path sessionFile) {
        this.id = id == null || id.isBlank() ? "music" : id.trim();
        this.label = label == null || label.isBlank() ? this.id : label.trim();
        this.baseUrl = normalizeBase(baseUrl);
        this.sessionFile = sessionFile;
        this.session = loadSession(sessionFile);
        this.client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
            .build();
    }

    @Override
    public String id() {
        return id;
    }

    @Override
    public String label() {
        return label;
    }

    @Override
    public String baseUrl() {
        return baseUrl;
    }

    @Override
    public Map<String, Object> serviceStatus() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("provider", id);
        body.put("label", label);
        body.put("baseUrl", baseUrl);
        body.put("reachable", !SimpleJson.asMap(SimpleJson.parse(rawGet("/", Map.of()))).containsKey("error"));
        body.put("note", label + " uses a configurable third-party API service.");
        return body;
    }

    @Override
    public Map<String, Object> accountPayload() {
        Map<String, String> params = authParams();
        String raw = switch (id) {
            case "qq" -> rawGetAny(params, "/user/getUserDetail", "/user/getUserAvatar", "/user/getCookie", "/login/status");
            case "kugou" -> rawGetAny(params, "/login/token", "/user/detail", "/user/playlist", "/login/status");
            default -> rawGetAny(
                params,
                "/login/status",
                "/user/account",
                "/user/info",
                "/user/profile",
                "/account/status"
            );
        };
        Map<String, Object> login = SimpleJson.asMap(SimpleJson.parse(raw));
        Map<String, Object> account = extractAccount(login);
        applySessionAccountFallback(account);
        boolean loggedIn = !SimpleJson.asString(account.get("userId"), "").isBlank()
            || !SimpleJson.asString(account.get("nickname"), "").isBlank()
            || hasAuthSession();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", !login.containsKey("error") || loggedIn);
        body.put("provider", id);
        body.put("label", label);
        body.put("loggedIn", loggedIn);
        body.put("account", account);
        if (login.containsKey("error")) body.put("error", login.get("error"));
        return body;
    }

    @Override
    public String loginQrKeyPayload() {
        if ("qq".equals(id)) {
            return rawGetAny(timestampParams(), "/getQQLoginQr", "/user/getQQLoginQr", "/login/qr/key");
        }
        return rawGetAny(
            timestampParams(),
            "/login/qr/key",
            "/login/qr",
            "/user/qr/key",
            "/user/qr",
            "/qr/key"
        );
    }

    @Override
    public String loginQrCreatePayload(String key, boolean qrimg) {
        if ("qq".equals(id)) {
            return loginQrKeyPayload();
        }
        Map<String, String> params = timestampParams();
        params.put("key", key == null ? "" : key);
        params.put("unikey", key == null ? "" : key);
        params.put("qrimg", String.valueOf(qrimg));
        return rawGetAny(
            params,
            "/login/qr/create",
            "/login/qr",
            "/user/qr/create",
            "/user/qr",
            "/qr/create",
            "/qr"
        );
    }

    @Override
    public String loginQrCheckPayload(String key) {
        Map<String, String> params = timestampParams();
        String raw;
        if ("qq".equals(id)) {
            params.putAll(qqQrCheckParams(key));
            raw = rawRequestAny(
                "POST",
                params,
                "/checkQQLoginQr",
                "/user/checkQQLoginQr",
                "/login/qr/check"
            );
            rememberLoginSession(raw);
            return raw;
        }
        params.put("key", key == null ? "" : key);
        params.put("unikey", key == null ? "" : key);
        raw = rawGetAny(
            params,
            "/login/qr/check",
            "/login/qr/status",
            "/login/qr/poll",
            "/user/qr/check",
            "/user/qr/status",
            "/qr/check",
            "/qr/status"
        );
        rememberLoginSession(raw);
        return raw;
    }

    @Override
    public Map<String, Object> search(String keyword, int page, int limit) {
        Map<String, String> params = new LinkedHashMap<>();
        String key = keyword == null ? "" : keyword;
        params.put("q", key);
        params.put("key", key);
        params.put("keyword", key);
        params.put("keywords", key);
        params.put("type", "song");
        params.put("page", String.valueOf(page));
        params.put("pageNo", String.valueOf(page));
        params.put("limit", String.valueOf(limit));
        params.put("pageSize", String.valueOf(limit));
        params.put("pagesize", String.valueOf(limit));
        String raw = switch (id) {
            case "qq" -> rawGetAny(params, "/getSearchByKey", "/search", "/song/search");
            case "kugou" -> rawGetAny(params, "/search", "/search/complex", "/song/search");
            default -> rawGetAny(
                params,
                "/search",
                "/song/search",
                "/search/song",
                "/cloudsearch",
                "/music/search"
            );
        };
        Object root = SimpleJson.parse(raw);
        List<Song> songs = extractSongs(root, limit);
        if (songs.isEmpty() && "kugou".equals(id)) {
            songs = extractSongs(SimpleJson.parse(kugouSearchFallback(key, page, limit)), limit);
        }
        return songsPayload(songs, "search");
    }

    @Override
    public String songUrl(String songId, String quality) {
        if (songId == null || songId.isBlank()) return "";
        Map<String, String> params = authParams();
        String effectiveQuality = normalizeSongQuality(id, quality);
        params.put("id", songId);
        params.put("mid", songId);
        params.put("songmid", songId);
        params.put("songid", songId);
        params.put("hash", songId);
        params.put("quality", effectiveQuality);
        params.put("level", effectiveQuality);
        String raw = switch (id) {
            case "qq" -> rawGetAny(params, "/getMusicPlay", "/song/url", "/song/play");
            case "kugou" -> rawGetAny(params, "/song/url", "/song/url/new", "/music/url");
            default -> rawGetAny(
                params,
                "/song/url",
                "/song/play-url",
                "/song/play",
                "/music/url",
                "/music/play",
                "/song"
            );
        };
        Object root = SimpleJson.parse(raw);
        String url = firstString(root, "url", "playUrl", "play_url", "src", "audio", "location", "purl");
        if ("kugou".equals(id) && isKugouNativeAudio(url) && !"128".equals(effectiveQuality)) {
            Map<String, String> fallbackParams = new LinkedHashMap<>(params);
            fallbackParams.put("quality", "128");
            fallbackParams.put("level", "128");
            Object fallbackRoot = SimpleJson.parse(rawGetAny(fallbackParams, "/song/url", "/song/url/new", "/music/url"));
            String fallbackUrl = firstString(fallbackRoot, "url", "playUrl", "play_url", "src", "audio", "location", "purl");
            if (!isKugouNativeAudio(fallbackUrl)) return fallbackUrl;
        }
        return url;
    }

    @Override
    public Map<String, Object> songUrlPayload(String songId, String quality) {
        String url = songUrl(songId, quality);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("provider", id);
        body.put("url", url);
        body.put("playable", !url.isBlank());
        if (url.isBlank()) body.put("error", label + " song url unavailable");
        return body;
    }

    @Override
    public Map<String, Object> userPlaylistsPayload() {
        Map<String, String> params = authParams();
        String raw = switch (id) {
            case "qq" -> rawGetAny(params, "/user/getUserPlaylists", "/user/getUserCollectedSongLists", "/user/playlists");
            case "kugou" -> rawGetAny(params, "/user/playlist", "/top/playlist", "/user/listen", "/user/playlists");
            default -> rawGetAny(
                params,
                "/user/playlist",
                "/user/playlists",
                "/playlist/user",
                "/favorite/playlist",
                "/user/favorites",
                "/playlist"
            );
        };
        Object root = SimpleJson.parse(raw);
        List<Playlist> extracted = extractPlaylists(root);
        if (extracted.isEmpty() && "qq".equals(id)) {
            root = SimpleJson.parse(rawGetAny(params, "/user/getUserDetail"));
            extracted = extractPlaylists(root);
        }
        if (extracted.isEmpty() && "kugou".equals(id)) {
            root = SimpleJson.parse(rawGetAny(params, "/top/playlist"));
            extracted = extractPlaylists(root);
        }
        List<Map<String, Object>> playlists = new ArrayList<>();
        for (Playlist playlist : extracted) playlists.add(playlist.toMap());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", !SimpleJson.asMap(root).containsKey("error"));
        body.put("provider", id);
        body.put("label", label);
        body.put("loggedIn", !playlists.isEmpty() || hasAuthSession());
        body.put("playlists", playlists);
        if (SimpleJson.asMap(root).containsKey("error")) body.put("error", SimpleJson.asMap(root).get("error"));
        return body;
    }

    @Override
    public Map<String, Object> playlistTracksPayload(String playlistId, int limit) {
        Map<String, String> params = authParams();
        int requestLimit = limit > 0 ? limit : 100000;
        params.put("id", playlistId == null ? "" : playlistId);
        params.put("ids", playlistId == null ? "" : playlistId);
        params.put("disstid", playlistId == null ? "" : playlistId);
        params.put("tid", playlistId == null ? "" : playlistId);
        params.put("listid", playlistId == null ? "" : playlistId);
        params.put("global_collection_id", playlistId == null ? "" : playlistId);
        params.put("page", "1");
        params.put("pageNo", "1");
        params.put("limit", String.valueOf(requestLimit));
        params.put("pagesize", String.valueOf(requestLimit));
        params.put("pageSize", String.valueOf(requestLimit));
        String raw = switch (id) {
            case "qq" -> rawGetAny(params, "/getSongListDetail", "/playlist/detail", "/playlist/tracks");
            case "kugou" -> rawGetAny(params, "/playlist/track/all", "/playlist/track/all/new", "/playlist/detail", "/playlist/tracks");
            default -> rawGetAny(
                params,
                "/playlist/tracks",
                "/playlist/track/all",
                "/playlist/detail",
                "/playlist/song",
                "/playlist/songs",
                "/songlist"
            );
        };
        Object root = SimpleJson.parse(raw);
        Map<String, Object> body = songsPayload(extractSongs(root, limit), "playlist");
        body.put("ok", !SimpleJson.asMap(root).containsKey("error"));
        return body;
    }

    @Override
    public Map<String, Object> addSongToPlaylistPayload(String playlistId, Song song) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("provider", id);
        body.put("label", label);
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

        Map<String, String> params = authParams();
        params.put("id", playlistId);
        params.put("ids", playlistId);
        params.put("playlistId", playlistId);
        params.put("pid", playlistId);
        params.put("tid", playlistId);
        params.put("disstid", playlistId);
        params.put("listid", playlistId);
        params.put("global_collection_id", playlistId);
        params.put("songId", song.id);
        params.put("songid", song.id);
        params.put("songmid", song.id);
        params.put("mid", song.id);
        params.put("hash", song.id);
        params.put("tracks", song.id);
        params.put("op", "add");
        params.put("timestamp", String.valueOf(System.currentTimeMillis()));

        String raw = switch (id) {
            case "qq" -> rawRequestAny(
                "POST",
                params,
                "/user/addSongToPlaylist",
                "/user/playlist/add",
                "/playlist/addSong",
                "/songlist/add",
                "/addSongToPlaylist"
            );
            case "kugou" -> rawRequestAny(
                "POST",
                params,
                "/playlist/add",
                "/user/playlist/add",
                "/song/addToPlaylist",
                "/favorite/add"
            );
            default -> rawRequestAny(
                "POST",
                params,
                "/playlist/tracks",
                "/playlist/add",
                "/playlist/addSong",
                "/favorite/add"
            );
        };
        Map<String, Object> map = SimpleJson.asMap(SimpleJson.parse(raw));
        boolean ok = isAddPlaylistSuccess(map);
        body.put("ok", ok);
        if (!ok) {
            body.put("error", firstNonBlank(
                SimpleJson.asString(map.get("error"), ""),
                SimpleJson.asString(map.get("message"), ""),
                SimpleJson.asString(map.get("msg"), ""),
                label + " API does not expose add-to-playlist capability"
            ));
        }
        return body;
    }

    @Override
    public Map<String, Object> commentsPayload(String songId, int limit) {
        if (songId == null || songId.isBlank()) return CommentPayloads.error(id, label, "song id is missing");
        Map<String, String> params = authParams();
        int requestLimit = limit > 0 ? limit : 20;
        params.put("id", songId);
        params.put("mid", songId);
        params.put("songid", songId);
        params.put("songmid", songId);
        params.put("pagesize", String.valueOf(requestLimit));
        params.put("limit", String.valueOf(requestLimit));
        params.put("biztype", "1");
        params.put("reqtype", "2");
        String raw = "qq".equals(id)
            ? rawGetAny(params, "/getComments")
            : rawGetAny(params, "/comments", "/song/comments", "/comment/music");
        Object root = SimpleJson.parse(raw);
        return CommentPayloads.fromRoot(id, label, root, limit);
    }

    private String rawGetAny(Map<String, String> params, String... paths) {
        return rawRequestAny("GET", params, paths);
    }

    private String rawRequestAny(String method, Map<String, String> params, String... paths) {
        String last = "";
        for (String path : paths) {
            String next = rawRequest(method, path, params);
            last = next;
            if (!isErrorPayload(next)) return next;
        }
        return last.isBlank() ? errorPayload(label + " API has no compatible endpoint") : last;
    }

    private static boolean isErrorPayload(String json) {
        Map<String, Object> map = SimpleJson.asMap(SimpleJson.parse(json));
        if (map.containsKey("error")) return true;
        Object ok = map.get("ok");
        return ok instanceof Boolean b && !b;
    }

    private static boolean isAddPlaylistSuccess(Map<String, Object> map) {
        if (map == null || map.isEmpty() || map.containsKey("error")) return false;
        if (SimpleJson.asBoolean(map.get("ok"), false) || SimpleJson.asBoolean(map.get("success"), false)) return true;
        Map<String, Object> data = SimpleJson.asMap(map.get("data"));
        Map<String, Object> body = SimpleJson.asMap(map.get("body"));
        if (SimpleJson.asBoolean(data.get("success"), false) || SimpleJson.asBoolean(body.get("success"), false)) return true;
        int code = SimpleJson.asInt(map.get("code"), Integer.MIN_VALUE);
        int status = SimpleJson.asInt(map.get("status"), Integer.MIN_VALUE);
        int result = SimpleJson.asInt(map.get("result"), Integer.MIN_VALUE);
        return code == 0 || code == 1 || code == 200 || status == 0 || status == 1 || status == 200 || result == 0 || result == 1;
    }

    private String rawGet(String path, Map<String, String> params) {
        return rawRequest("GET", path, params);
    }

    private String rawRequest(String method, String path, Map<String, String> params) {
        try {
            HttpRequest.Builder builder = HttpRequest.newBuilder(buildUri(path, params))
                .timeout(Duration.ofSeconds(12))
                .header("Accept", "application/json, text/plain, */*");
            if ("POST".equalsIgnoreCase(method)) {
                builder.POST(HttpRequest.BodyPublishers.noBody());
            } else {
                builder.GET();
            }
            HttpRequest request = builder.build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            rememberCookieHeaders(response.headers().allValues("Set-Cookie"));
            if (response.statusCode() >= 400) return errorPayload(label + " API HTTP " + response.statusCode());
            String body = cleanJsonBody(response.body());
            return body == null || body.isBlank() ? errorPayload(label + " API returned empty body") : body;
        } catch (IOException | InterruptedException | IllegalArgumentException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            return errorPayload(label + " API unavailable at " + baseUrl + ": " + exceptionDetail(e));
        }
    }

    private Map<String, String> authParams() {
        Map<String, String> params = new LinkedHashMap<>();
        synchronized (session) {
            String cookie = sessionCookieStringLocked();
            if (!cookie.isBlank()) params.put("cookie", cookie);

            if ("qq".equals(id)) {
                String uin = normalizeQqUin(firstNonBlank(session.get("uin"), session.get("loginUin"), cookieValue(cookie, "uin")));
                if (!uin.isBlank()) params.put("uin", uin);
            } else if ("kugou".equals(id)) {
                putIfPresent(params, "token", session.get("token"));
                putIfPresent(params, "userid", session.get("userid"));
                putIfPresent(params, "vip_token", session.get("vip_token"));
                putIfPresent(params, "vip_type", session.get("vip_type"));
            }
        }
        return params;
    }

    private boolean hasAuthSession() {
        synchronized (session) {
            if ("qq".equals(id)) {
                String cookie = sessionCookieStringLocked();
                return !cookie.isBlank() && !normalizeQqUin(firstNonBlank(session.get("uin"), session.get("loginUin"), cookieValue(cookie, "uin"))).isBlank();
            }
            if ("kugou".equals(id)) {
                return !firstNonBlank(session.get("token"), cookieValue(sessionCookieStringLocked(), "token")).isBlank()
                    && !firstNonBlank(session.get("userid"), cookieValue(sessionCookieStringLocked(), "userid")).isBlank();
            }
            return false;
        }
    }

    private void applySessionAccountFallback(Map<String, Object> account) {
        synchronized (session) {
            if ("qq".equals(id)) {
                String cookie = sessionCookieStringLocked();
                String uin = normalizeQqUin(firstNonBlank(session.get("uin"), session.get("loginUin"), cookieValue(cookie, "uin")));
                if (SimpleJson.asString(account.get("userId"), "").isBlank() && !uin.isBlank()) account.put("userId", uin);
                if (SimpleJson.asString(account.get("nickname"), "").isBlank() && !uin.isBlank()) account.put("nickname", "QQ " + uin);
            } else if ("kugou".equals(id)) {
                String userid = firstNonBlank(session.get("userid"), cookieValue(sessionCookieStringLocked(), "userid"));
                if (SimpleJson.asString(account.get("userId"), "").isBlank() && !userid.isBlank()) account.put("userId", userid);
                if (SimpleJson.asString(account.get("nickname"), "").isBlank()) putIfNotBlank(account, "nickname", session.get("nickname"));
                if (SimpleJson.asString(account.get("avatarUrl"), "").isBlank()) putIfNotBlank(account, "avatarUrl", session.get("avatarUrl"));
            }
        }
    }

    private void rememberLoginSession(String raw) {
        Object root = SimpleJson.parse(raw);
        if ("qq".equals(id)) {
            rememberQqSession(root);
        } else if ("kugou".equals(id)) {
            rememberKugouSession(root);
        }
    }

    private void rememberQqSession(Object root) {
        Map<String, Object> rootMap = SimpleJson.asMap(root);
        boolean ok = SimpleJson.asBoolean(rootMap.get("isOk"), false)
            || SimpleJson.asBoolean(rootMap.get("success"), false)
            || SimpleJson.asBoolean(SimpleJson.asMap(rootMap.get("data")).get("isOk"), false);
        Map<String, Object> sessionMap = SimpleJson.asMap(rootMap.get("session"));
        if (sessionMap.isEmpty()) sessionMap = SimpleJson.asMap(SimpleJson.asMap(rootMap.get("data")).get("session"));

        String cookie = SimpleJson.asString(sessionMap.get("cookie"), "");
        Map<String, Object> cookieObject = SimpleJson.asMap(sessionMap.get("cookieObject"));
        String uin = normalizeQqUin(firstNonBlank(
            SimpleJson.asString(sessionMap.get("uin"), ""),
            SimpleJson.asString(sessionMap.get("loginUin"), ""),
            SimpleJson.asString(cookieObject.get("uin"), ""),
            cookieValue(cookie, "uin")
        ));
        if (!ok && (cookie.isBlank() || uin.isBlank())) return;

        Map<String, String> updates = new LinkedHashMap<>();
        putIfPresent(updates, "cookie", cookie);
        putIfPresent(updates, "uin", uin);
        rememberSession(updates);
    }

    private void rememberKugouSession(Object root) {
        Map<String, Object> rootMap = SimpleJson.asMap(root);
        Map<String, Object> data = SimpleJson.asMap(rootMap.get("data"));
        int status = SimpleJson.asInt(data.get("status"), SimpleJson.asInt(rootMap.get("status"), 0));
        String token = firstNonBlank(SimpleJson.asString(data.get("token"), ""), SimpleJson.asString(rootMap.get("token"), ""));
        String userid = firstNonBlank(SimpleJson.asString(data.get("userid"), ""), SimpleJson.asString(rootMap.get("userid"), ""));
        if (status != 4 && (token.isBlank() || userid.isBlank())) return;

        Map<String, String> updates = new LinkedHashMap<>();
        putIfPresent(updates, "token", token);
        putIfPresent(updates, "userid", userid);
        putIfPresent(updates, "vip_token", firstNonBlank(SimpleJson.asString(data.get("vip_token"), ""), SimpleJson.asString(rootMap.get("vip_token"), "")));
        putIfPresent(updates, "vip_type", firstNonBlank(SimpleJson.asString(data.get("vip_type"), ""), SimpleJson.asString(rootMap.get("vip_type"), "")));
        putIfPresent(updates, "nickname", firstNonBlank(SimpleJson.asString(data.get("nickname"), ""), SimpleJson.asString(data.get("nick_name"), "")));
        putIfPresent(updates, "avatarUrl", firstNonBlank(SimpleJson.asString(data.get("pic"), ""), SimpleJson.asString(data.get("avatar"), "")));
        rememberSession(updates);
    }

    private void rememberCookieHeaders(List<String> headers) {
        if (headers == null || headers.isEmpty()) return;
        Map<String, String> updates = new LinkedHashMap<>();
        for (String header : headers) {
            for (String cookie : header.split(",(?=\\s*[A-Za-z_][A-Za-z0-9_]*=)")) {
                int semi = cookie.indexOf(';');
                String pair = (semi >= 0 ? cookie.substring(0, semi) : cookie).trim();
                int eq = pair.indexOf('=');
                if (eq <= 0 || eq == pair.length() - 1) continue;
                String name = pair.substring(0, eq).trim();
                String value = pair.substring(eq + 1).trim();
                if (isSessionCookieName(name)) updates.put(name, value);
            }
        }
        if (!updates.isEmpty()) rememberSession(updates);
    }

    private boolean isSessionCookieName(String name) {
        if (name == null || name.isBlank()) return false;
        if ("qq".equals(id)) {
            return "uin".equals(name) || "skey".equals(name) || "p_skey".equals(name) || "qqmusic_key".equals(name);
        }
        if ("kugou".equals(id)) {
            return "token".equals(name) || "userid".equals(name) || "vip_token".equals(name) || "vip_type".equals(name)
                || "dfid".equals(name) || name.startsWith("KUGOU_API_") || "t1".equals(name);
        }
        return false;
    }

    private void rememberSession(Map<String, String> updates) {
        if (updates.isEmpty()) return;
        synchronized (session) {
            for (Map.Entry<String, String> entry : updates.entrySet()) {
                if (entry.getValue() == null || entry.getValue().isBlank()) continue;
                session.put(entry.getKey(), entry.getValue());
            }
            saveSessionLocked();
        }
    }

    private void saveSessionLocked() {
        if (sessionFile == null) return;
        try {
            Files.createDirectories(sessionFile.getParent());
            Files.writeString(sessionFile, SimpleJson.stringify(session), StandardCharsets.UTF_8);
        } catch (IOException ignored) {
        }
    }

    private static Map<String, String> loadSession(Path sessionFile) {
        Map<String, String> loaded = new LinkedHashMap<>();
        if (sessionFile == null || !Files.exists(sessionFile)) return loaded;
        try {
            Map<String, Object> raw = SimpleJson.parseObject(Files.readString(sessionFile, StandardCharsets.UTF_8));
            for (Map.Entry<String, Object> entry : raw.entrySet()) {
                String value = SimpleJson.asString(entry.getValue(), "");
                if (!value.isBlank()) loaded.put(entry.getKey(), value);
            }
        } catch (IOException ignored) {
        }
        return loaded;
    }

    private String sessionCookieStringLocked() {
        String cookie = session.getOrDefault("cookie", "");
        if (!cookie.isBlank()) return cookie;
        StringJoiner joiner = new StringJoiner("; ");
        for (Map.Entry<String, String> entry : session.entrySet()) {
            if (entry.getValue() == null || entry.getValue().isBlank()) continue;
            if ("nickname".equals(entry.getKey()) || "avatarUrl".equals(entry.getKey()) || "uin".equals(entry.getKey())) continue;
            joiner.add(entry.getKey() + "=" + entry.getValue());
        }
        return joiner.toString();
    }

    private static void putIfPresent(Map<String, String> map, String key, String value) {
        if (value != null && !value.isBlank()) map.put(key, value);
    }

    private static void putIfNotBlank(Map<String, Object> map, String key, String value) {
        if (value != null && !value.isBlank()) map.put(key, value);
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }

    private static String directString(Map<String, Object> map, String key) {
        if (map == null || key == null) return "";
        return SimpleJson.asString(map.get(key), "");
    }

    private static String normalizeSongQuality(String provider, String quality) {
        String value = quality == null ? "" : quality.trim();
        if ("kugou".equals(provider)) {
            if (value.isBlank()) return "128";
            String lower = value.toLowerCase();
            if ("standard".equals(lower) || "normal".equals(lower) || "default".equals(lower)) return "128";
        }
        return value.isBlank() ? "standard" : value;
    }

    private static boolean isKugouNativeAudio(String url) {
        if (url == null || url.isBlank()) return false;
        String lower = url.toLowerCase();
        return lower.contains(".mgg") || lower.contains(".kgm");
    }

    private static String cookieValue(String cookie, String name) {
        if (cookie == null || cookie.isBlank() || name == null || name.isBlank()) return "";
        for (String item : cookie.split(";")) {
            String part = item.trim();
            int eq = part.indexOf('=');
            if (eq <= 0) continue;
            if (name.equals(part.substring(0, eq).trim())) return part.substring(eq + 1).trim();
        }
        return "";
    }

    private static String normalizeQqUin(String value) {
        if (value == null || value.isBlank()) return "";
        return value.trim().replaceFirst("^[oO]+", "").replaceAll("[^0-9]", "");
    }

    private Map<String, Object> songsPayload(List<Song> songs, String source) {
        List<Map<String, Object>> arr = new ArrayList<>();
        for (Song song : songs) arr.add(song.toMap());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("provider", id);
        body.put("label", label);
        body.put("source", source);
        body.put("songs", arr);
        return body;
    }

    private List<Song> extractSongs(Object root, int limit) {
        List<Object> items = firstList(root, "songlist", "songs", "song", "list", "lists", "info", "data", "items", "tracks", "music", "audio", "audios", "files", "result", "response", "body");
        List<Song> songs = new ArrayList<>();
        for (Object item : items) {
            Song song = songFromGeneric(item);
            if (song.hasIdentity()) songs.add(song);
            if (limit > 0 && songs.size() >= limit) break;
        }
        return songs;
    }

    private List<Playlist> extractPlaylists(Object root) {
        List<Object> items = firstList(root, "playlists", "playlist", "mymusic", "mydiss", "createdDissList", "createdList", "cdlist", "special_list", "specialList", "special", "list", "lists", "info", "data", "items", "songlists", "disslist", "body", "response");
        List<Playlist> playlists = new ArrayList<>();
        for (Object item : items) {
            Map<String, Object> map = SimpleJson.asMap(item);
            Playlist playlist = new Playlist();
            playlist.id = "kugou".equals(id)
                ? firstString(map, "global_collection_id", "specialid", "specialId", "id", "tid", "dissid", "dissId", "playlistId", "listid", "listId", "special_id")
                : firstString(map, "id", "tid", "dissid", "dissId", "specialid", "specialId", "playlistId", "global_collection_id", "listid", "listId");
            playlist.name = firstString(map, "name", "title", "dissname", "dissName", "specialname", "specialName", "listname", "listName");
            playlist.cover = firstString(map, "cover", "pic", "img", "image", "coverImgUrl", "logo", "picurl", "picUrl", "imgurl", "imgUrl", "flexible_cover", "sizable_cover", "list_pic");
            if (playlist.cover.contains("{size}")) playlist.cover = playlist.cover.replace("{size}", "400");
            int count = SimpleJson.asInt(map.get("num0"), 0);
            count = SimpleJson.asInt(map.get("m_count"), count);
            count = SimpleJson.asInt(map.get("count"), count);
            count = SimpleJson.asInt(map.get("songcount"), count);
            count = SimpleJson.asInt(map.get("song_count"), count);
            count = SimpleJson.asInt(map.get("songnum"), count);
            playlist.trackCount = SimpleJson.asInt(map.get("trackCount"), count);
            playlist.playCount = SimpleJson.asLong(map.get("playCount"), SimpleJson.asLong(map.get("listennum"), SimpleJson.asLong(map.get("play_count"), 0)));
            playlist.creator = firstString(map, "creator", "nick", "nickname", "username", "userName", "uname");
            playlist.provider = id;
            if (!playlist.id.isBlank() && !("qq".equals(id) && "0".equals(playlist.id))) playlists.add(playlist);
        }
        return playlists;
    }

    private Song songFromGeneric(Object value) {
        Map<String, Object> map = SimpleJson.asMap(value);
        if (map.containsKey("data")) map = SimpleJson.asMap(map.get("data"));
        Song song = new Song();
        if ("qq".equals(id)) {
            Map<String, Object> file = SimpleJson.asMap(map.get("file"));
            song.id = firstNonBlank(
                directString(map, "mid"),
                directString(map, "songmid"),
                directString(map, "songMid"),
                directString(file, "media_mid"),
                directString(map, "media_mid"),
                directString(map, "id"),
                directString(map, "songId"),
                directString(map, "songid")
            );
        } else if ("kugou".equals(id)) {
            song.id = kugouSongId(map);
        } else {
            song.id = firstString(map, "id", "mid", "songmid", "songMid", "songId", "songid", "hash", "Hash", "HASH", "fileHash", "FileHash", "filehash", "rid", "album_audio_id", "mixsongid");
        }
        song.title = firstString(map, "title", "name", "songname", "songName", "SongName", "filename", "FileName", "audio_name");
        song.artist = artistName(map.get("artist"));
        if (song.artist.isBlank()) song.artist = artistName(map.get("singer"));
        if (song.artist.isBlank()) song.artist = artistName(map.get("singerinfo"));
        if (song.artist.isBlank()) song.artist = firstString(map, "singername", "singerName", "SingerName", "author_name", "author", "Singer");
        song.album = firstString(map, "album", "albumname", "albumName", "AlbumName");
        if (song.album.isBlank()) song.album = firstString(map.get("albuminfo"), "name", "title");
        song.cover = "qq".equals(id)
            ? qqAlbumCover(map)
            : firstString(map, "cover", "pic", "img", "image", "albumPic", "picUrl", "albumpic", "picurl", "Image", "Auxiliary", "union_cover");
        if (song.cover.contains("{size}")) song.cover = song.cover.replace("{size}", "400");
        if (song.cover.isBlank() && "qq".equals(id)) {
            String albumMid = firstString(map, "albummid", "albumMid");
            if (!albumMid.isBlank()) song.cover = "https://y.qq.com/music/photo_new/T002R300x300M000" + albumMid + ".jpg";
        }
        int duration = SimpleJson.asInt(map.get("duration"), SimpleJson.asInt(map.get("interval"), SimpleJson.asInt(map.get("Duration"), SimpleJson.asInt(map.get("timelen"), 0))));
        song.duration = duration > 1000 ? duration / 1000 : duration;
        song.provider = id;
        return song;
    }

    private static String qqAlbumCover(Map<String, Object> map) {
        Map<String, Object> album = SimpleJson.asMap(map.get("album"));
        String albumMid = firstNonBlank(
            directString(album, "mid"),
            directString(album, "pmid"),
            directString(map, "albummid"),
            directString(map, "albumMid"),
            directString(map, "album_mid"),
            directString(map, "pic_mid"),
            directString(map, "album_pic_mid")
        );
        int suffix = albumMid.indexOf('_');
        if (suffix > 0) albumMid = albumMid.substring(0, suffix);
        if (albumMid.isBlank()) return "";
        return "https://y.qq.com/music/photo_new/T002R300x300M000" + albumMid + ".jpg";
    }

    private static String kugouSongId(Map<String, Object> map) {
        String hash = firstNonBlank(
            directString(map, "hash"),
            directString(map, "Hash"),
            directString(map, "HASH"),
            directString(map, "fileHash"),
            directString(map, "FileHash"),
            directString(map, "filehash")
        );
        if (!hash.isBlank()) return hash;

        hash = firstString(map, "hash", "Hash", "HASH", "fileHash", "FileHash", "filehash");
        if (!hash.isBlank()) return hash;

        return firstString(map, "album_audio_id", "audio_id", "mixsongid", "songId", "songid", "id", "rid");
    }

    private static Map<String, Object> extractAccount(Map<String, Object> root) {
        Map<String, Object> profile = SimpleJson.asMap(root.get("profile"));
        if (profile.isEmpty()) profile = SimpleJson.asMap(SimpleJson.asMap(root.get("data")).get("profile"));
        if (profile.isEmpty()) profile = SimpleJson.asMap(root.get("account"));
        if (profile.isEmpty()) profile = SimpleJson.asMap(root.get("user"));
        if (profile.isEmpty()) profile = SimpleJson.asMap(SimpleJson.asMap(root.get("data")).get("user"));
        if (profile.isEmpty()) profile = SimpleJson.asMap(root.get("body"));
        if (profile.isEmpty()) profile = SimpleJson.asMap(root.get("data"));
        if (profile.isEmpty()) profile = root;
        Map<String, Object> account = new LinkedHashMap<>();
        account.put("userId", firstString(profile, "userId", "uid", "uin", "id", "userid", "loginUin"));
        account.put("nickname", firstString(profile, "nickname", "nick", "name", "username", "userName", "nickName"));
        account.put("avatarUrl", firstString(profile, "avatarUrl", "avatar", "headimg", "headimgurl", "head", "pic", "photo", "avatarUrl100", "avatarUrl150"));
        return account;
    }

    private static List<Object> firstList(Object root, String... keys) {
        return firstList(root, 0, keys);
    }

    private static List<Object> firstList(Object root, int depth, String... keys) {
        if (depth > 8) return List.of();
        if (root instanceof List<?>) {
            List<Object> list = SimpleJson.asList(root);
            for (Object item : list) {
                Map<String, Object> map = SimpleJson.asMap(item);
                if (map.isEmpty()) continue;
                for (String key : keys) {
                    List<Object> nested = SimpleJson.asList(map.get(key));
                    if (!nested.isEmpty()) return nested;
                }
            }
            for (Object item : list) {
                Map<String, Object> map = SimpleJson.asMap(item);
                if (map.isEmpty()) continue;
                for (String key : keys) {
                    Map<String, Object> child = SimpleJson.asMap(map.get(key));
                    if (!child.isEmpty()) {
                        List<Object> nested = firstList(child, depth + 1, keys);
                        if (!nested.isEmpty()) return nested;
                    }
                }
            }
            return list;
        }
        Map<String, Object> map = SimpleJson.asMap(root);
        for (String key : keys) {
            List<Object> list = SimpleJson.asList(map.get(key));
            if (!list.isEmpty()) return list;
        }
        for (String key : keys) {
            Map<String, Object> child = SimpleJson.asMap(map.get(key));
            if (!child.isEmpty()) {
                List<Object> nested = firstList(child, depth + 1, keys);
                if (!nested.isEmpty()) return nested;
            }
        }
        for (Object value : map.values()) {
            List<Object> nested = firstList(value, depth + 1, keys);
            if (!nested.isEmpty()) return nested;
        }
        return List.of();
    }

    private static String firstString(Object root, String... keys) {
        return firstString(root, 0, keys);
    }

    private static String firstString(Object root, int depth, String... keys) {
        if (depth > 8) return "";
        if (root instanceof String s) return s;
        if (root instanceof List<?>) {
            for (Object item : SimpleJson.asList(root)) {
                String nested = firstString(item, depth + 1, keys);
                if (!nested.isBlank()) return nested;
            }
            return "";
        }
        Map<String, Object> map = SimpleJson.asMap(root);
        for (String key : keys) {
            String value = SimpleJson.asString(map.get(key), "");
            if (!value.isBlank()) return value;
        }
        for (String key : keys) {
            Map<String, Object> child = SimpleJson.asMap(map.get(key));
            if (!child.isEmpty()) {
                String nested = firstString(child, depth + 1, keys);
                if (!nested.isBlank()) return nested;
            }
        }
        for (Object value : map.values()) {
            if (!(value instanceof Map<?, ?>) && !(value instanceof List<?>)) continue;
            String nested = firstString(value, depth + 1, keys);
            if (!nested.isBlank()) return nested;
        }
        return "";
    }

    private static String artistName(Object value) {
        if (value instanceof String s) return s;
        List<Object> list = SimpleJson.asList(value);
        if (!list.isEmpty()) {
            List<String> names = new ArrayList<>();
            for (Object item : list) {
                String name = firstString(item, "name", "title");
                if (!name.isBlank()) names.add(name);
            }
            return String.join(" / ", names);
        }
        return firstString(value, "name", "title");
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

    private String kugouSearchFallback(String keyword, int page, int limit) {
        String url = "https://songsearch.kugou.com/song_search_v2?keyword=" + encode(keyword)
            + "&page=" + Math.max(1, page)
            + "&pagesize=" + Math.max(1, limit)
            + "&platform=WebFilter";
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(12))
                .header("Accept", "application/json, text/plain, */*")
                .GET()
                .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() >= 400) return errorPayload(label + " fallback search HTTP " + response.statusCode());
            return cleanJsonBody(response.body());
        } catch (IOException | InterruptedException | IllegalArgumentException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            return errorPayload(label + " fallback search unavailable: " + exceptionDetail(e));
        }
    }

    private static String cleanJsonBody(String body) {
        if (body == null) return "";
        return body
            .replace("<!--KG_TAG_RES_START-->", "")
            .replace("<!--KG_TAG_RES_END-->", "")
            .trim();
    }

    private String errorPayload(String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("ok", false);
        error.put("provider", id);
        error.put("label", label);
        error.put("baseUrl", baseUrl);
        error.put("error", message);
        return SimpleJson.stringify(error);
    }

    private static Map<String, String> timestampParams() {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("timestamp", String.valueOf(System.currentTimeMillis()));
        return params;
    }

    private static Map<String, String> qqQrCheckParams(String key) {
        Map<String, String> params = new LinkedHashMap<>();
        String raw = key == null ? "" : key.trim();
        String[] parts = raw.split("\\|", 3);
        if (parts.length == 3 && "qq".equalsIgnoreCase(parts[0])) {
            params.put("ptqrtoken", parts[1]);
            params.put("qrsig", decode(parts[2]));
            return params;
        }
        if (parts.length == 2) {
            params.put("ptqrtoken", parts[0]);
            params.put("qrsig", decode(parts[1]));
            return params;
        }
        params.put("qrsig", raw);
        return params;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    private static String decode(String value) {
        return URLDecoder.decode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    private static String normalizeBase(String value) {
        String base = value == null ? "" : value.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base;
    }

    private static String exceptionDetail(Exception error) {
        Throwable current = error;
        while (current.getCause() != null) current = current.getCause();
        String message = current.getMessage();
        if (message == null || message.isBlank()) {
            if (current instanceof ConnectException) return "connection refused";
            return current.getClass().getSimpleName();
        }
        return message;
    }
}
