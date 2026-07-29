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
import java.util.regex.Pattern;

public class GenericMusicClient implements MusicProviderClient {
    private static final Pattern SET_COOKIE_SEPARATOR = Pattern.compile(",(?=\\s*[A-Za-z_][A-Za-z0-9_]*=)");
    private static final Pattern KUGOU_ID_SEPARATOR = Pattern.compile("\\|");
    private static final Pattern KUGOU_HASH = Pattern.compile("(?i)[a-f0-9]{32}");
    private static final Pattern DECIMAL_ID = Pattern.compile("[0-9]+");

    private final String id;
    private final String label;
    private final String baseUrl;
    private final HttpClient client;
    private final CookieManager cookieManager;
    private final Path sessionFile;
    private final Map<String, String> session;
    private final ProviderProtocol protocol;
    private final boolean explicitProtocol;

    public GenericMusicClient(String id, String label, String baseUrl) {
        this(id, label, baseUrl, null);
    }

    public GenericMusicClient(String id, String label, String baseUrl, Path sessionFile) {
        this(id, label, baseUrl, sessionFile, protocolOrNull(id), false);
    }

    protected GenericMusicClient(
        String id,
        String label,
        String baseUrl,
        Path sessionFile,
        ProviderProtocol protocol,
        boolean explicitProtocol
    ) {
        this.id = id == null || id.isBlank() ? "music" : id.trim();
        this.label = label == null || label.isBlank() ? this.id : label.trim();
        this.baseUrl = normalizeBase(baseUrl);
        this.sessionFile = sessionFile;
        this.session = loadSession(sessionFile);
        this.protocol = protocol;
        this.explicitProtocol = explicitProtocol;
        this.cookieManager = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        this.client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .cookieHandler(cookieManager)
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
        body.put("reachable", !isErrorPayload(rawGet(protocolPath(ProviderProtocol.Operation.HEALTH, "/health"), Map.of())));
        body.put("note", label + " uses a configurable third-party API service.");
        return body;
    }

    @Override
    public Map<String, Object> accountPayload() {
        Map<String, String> params = authParams();
        String raw = switch (id) {
            case "qq" -> protocolGet(
                ProviderProtocol.Operation.ACCOUNT,
                params,
                "/user/getUserDetail",
                "/user/getUserAvatar",
                "/user/getCookie",
                "/login/status"
            );
            case "kugou" -> protocolGet(
                ProviderProtocol.Operation.ACCOUNT,
                params,
                "/login/status",
                "/user/detail",
                "/user/playlist"
            );
            default -> protocolGet(
                ProviderProtocol.Operation.ACCOUNT,
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
        boolean providerReportedLogin = SimpleJson.asBoolean(login.get("loggedIn"), false);
        boolean loggedIn = providerReportedLogin
            || !SimpleJson.asString(account.get("userId"), "").isBlank()
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
    public Map<String, Object> configureLogin(Map<String, String> credentials) {
        if (!"qishui".equals(id)) {
            throw new IllegalArgumentException("provider does not support direct login configuration: " + id);
        }
        String raw = rawJsonPost(
            protocolPath(ProviderProtocol.Operation.SESSION_LOGIN, "/session/token"),
            credentials == null ? Map.of() : credentials
        );
        Map<String, Object> body = new LinkedHashMap<>(SimpleJson.asMap(SimpleJson.parse(raw)));
        body.putIfAbsent("ok", !isErrorPayload(raw));
        body.put("provider", id);
        return body;
    }

    @Override
    public Map<String, Object> localClientStatus() {
        if (!"qishui".equals(id)) {
            throw new IllegalArgumentException("provider does not support local client detection: " + id);
        }
        String raw = rawGet("/local/status", Map.of());
        Map<String, Object> body = new LinkedHashMap<>(SimpleJson.asMap(SimpleJson.parse(raw)));
        body.putIfAbsent("ok", !isErrorPayload(raw));
        body.put("provider", id);
        return body;
    }

    @Override
    public Map<String, Object> importLibraryMetadata(Map<String, Object> library) {
        if (!"qishui".equals(id)) {
            throw new IllegalArgumentException("provider does not support library metadata import: " + id);
        }
        String raw = rawJsonPost("/local/library/import", library == null ? Map.of() : library);
        Map<String, Object> body = new LinkedHashMap<>(SimpleJson.asMap(SimpleJson.parse(raw)));
        body.putIfAbsent("ok", !isErrorPayload(raw));
        body.put("provider", id);
        return body;
    }

    @Override
    public void rememberBrowserSession(Map<String, String> cookies) {
        if (cookies == null || cookies.isEmpty()) return;
        Map<String, String> updates = new LinkedHashMap<>();
        StringJoiner joined = new StringJoiner("; ");
        for (Map.Entry<String, String> entry : cookies.entrySet()) {
            String name = entry.getKey() == null ? "" : entry.getKey().trim();
            String value = entry.getValue() == null ? "" : entry.getValue().trim();
            if (name.isBlank() || value.isBlank()) continue;
            joined.add(name + "=" + value);
            if (isSessionCookieName(name)) updates.put(name, value);
        }
        String cookie = joined.toString();
        putIfPresent(updates, "cookie", cookie);
        if ("qq".equals(id)) {
            putIfPresent(updates, "uin", normalizeQqUin(firstCookieValue(cookies, "uin", "p_uin", "wxuin")));
        } else if ("kugou".equals(id)) {
            String kugoo = firstCookieValue(cookies, "KuGoo");
            putIfPresent(updates, "userid", firstNonBlank(
                firstCookieValue(cookies, "userid", "KugooID", "kugooid"),
                nestedCookieValue(kugoo, "KugooID", "userid")
            ));
            putIfPresent(updates, "token", firstNonBlank(
                firstCookieValue(cookies, "token", "t", "KugooToken", "kugootoken", "KugooPwd"),
                nestedCookieValue(kugoo, "t", "KugooPwd", "token")
            ));
        }
        rememberSession(updates);
    }

    @Override
    public void clearBrowserSession() {
        synchronized (session) {
            session.clear();
            cookieManager.getCookieStore().removeAll();
            if (sessionFile == null) return;
            try {
                Files.deleteIfExists(sessionFile);
            } catch (IOException error) {
                throw new IllegalStateException("unable to clear " + id + " browser session", error);
            }
        }
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
            case "qq" -> protocolGet(
                ProviderProtocol.Operation.SEARCH,
                params,
                "/getSearchByKey",
                "/search",
                "/song/search"
            );
            case "kugou" -> protocolGet(
                ProviderProtocol.Operation.SEARCH,
                params,
                "/search",
                "/search/complex",
                "/song/search"
            );
            default -> protocolGet(
                ProviderProtocol.Operation.SEARCH,
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
        Map<String, Object> body = songsPayload(songs, "search");
        Map<String, Object> rootMap = SimpleJson.asMap(root);
        boolean ok = !rootMap.containsKey("error");
        body.put("ok", ok);
        if (!ok) body.put("error", rootMap.get("error"));
        return body;
    }

    @Override
    public String songUrl(String songId, String quality) {
        Song song = new Song();
        song.id = songId == null ? "" : songId;
        song.provider = id;
        return resolvePlayback(song, quality).url();
    }

    @Override
    public Map<String, Object> songUrlPayload(String songId, String quality) {
        Song song = new Song();
        song.id = songId == null ? "" : songId;
        song.provider = id;
        return resolvePlayback(song, quality).toMap();
    }

    @Override
    public PlaybackSource resolvePlayback(Song song, String quality) {
        if (song == null || !song.hasIdentity()) {
            return PlaybackSource.unavailable(id, quality, "song id is missing");
        }
        Map<String, String> params = authParams();
        String effectiveQuality = normalizeSongQuality(id, quality);
        putSongRequestParams(params, song);
        params.put("quality", effectiveQuality);
        params.put("level", effectiveQuality);
        String raw = switch (id) {
            case "qq" -> protocolGet(
                ProviderProtocol.Operation.SONG_URL,
                params,
                "/getMusicPlay",
                "/song/url",
                "/song/play"
            );
            case "kugou" -> protocolGet(
                ProviderProtocol.Operation.SONG_URL,
                params,
                "/song/url",
                "/song/url/new",
                "/music/url"
            );
            default -> protocolGet(
                ProviderProtocol.Operation.SONG_URL,
                params,
                "/song/url",
                "/song/play-url",
                "/song/play",
                "/music/url",
                "/music/play",
                "/song"
            );
        };
        Map<String, Object> root = SimpleJson.asMap(SimpleJson.parse(raw));
        PlaybackSource source = PlaybackSource.fromPayload(id, effectiveQuality, root);
        if ("kugou".equals(id) && !isPlayableWebAudio(source.url()) && !"128".equals(effectiveQuality)) {
            Map<String, String> fallbackParams = new LinkedHashMap<>(params);
            fallbackParams.put("quality", "128");
            fallbackParams.put("level", "128");
            Map<String, Object> fallbackRoot = SimpleJson.asMap(SimpleJson.parse(protocolGet(
                ProviderProtocol.Operation.SONG_URL,
                fallbackParams,
                "/song/url",
                "/song/url/new",
                "/music/url"
            )));
            PlaybackSource fallback = PlaybackSource.fromPayload(id, "128", fallbackRoot);
            if (isPlayableWebAudio(fallback.url())) source = fallback;
        }
        if ("kugou".equals(id) && !isPlayableWebAudio(source.url())) {
            return PlaybackSource.unavailable(id, effectiveQuality, source.errorMessage());
        }
        return source;
    }

    @Override
    public Map<String, Object> lyricPayload(String songId) {
        return lyricPayload(songId, "", "", 0);
    }

    @Override
    public Map<String, Object> lyricPayload(
        String songId,
        String title,
        String artist,
        int durationSeconds
    ) {
        if (songId == null || songId.isBlank()) {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("ok", false);
            body.put("provider", id);
            body.put("error", "song id is missing");
            return body;
        }

        Map<String, String> params = authParams();
        KugouSongIdentity kugouIdentity = "kugou".equals(id) ? parseKugouSongIdentity(songId) : null;
        String requestId = kugouIdentity == null ? songId : kugouIdentity.primaryId();
        params.put("id", requestId);
        params.put("mid", requestId);
        params.put("songid", requestId);
        params.put("songmid", requestId);
        if (kugouIdentity != null) {
            if (!kugouIdentity.hash().isBlank()) params.put("hash", kugouIdentity.hash());
            if (!kugouIdentity.albumAudioId().isBlank()) {
                params.put("album_audio_id", kugouIdentity.albumAudioId());
                params.put("audio_id", kugouIdentity.albumAudioId());
                params.put("mixsongid", kugouIdentity.albumAudioId());
            }
            if (!kugouIdentity.albumId().isBlank()) params.put("album_id", kugouIdentity.albumId());
            String keyword = firstNonBlank(title, artist);
            if (!keyword.isBlank()) {
                params.put("keyword", keyword);
                params.put("keywords", keyword);
            }
            if (artist != null && !artist.isBlank()) {
                params.put("artist", artist.trim());
                params.put("singer", artist.trim());
            }
            if (durationSeconds > 0) {
                long durationMillis = Math.min(Integer.MAX_VALUE, (long) durationSeconds * 1000L);
                params.put("duration", String.valueOf(durationMillis));
            }
        }

        String raw = switch (id) {
            case "qq" -> protocolGet(
                ProviderProtocol.Operation.LYRIC,
                params,
                "/getLyric",
                "/lyric",
                "/song/lyric"
            );
            case "kugou" -> protocolGet(
                ProviderProtocol.Operation.LYRIC,
                params,
                "/lyric",
                "/lyrics",
                "/song/lyric"
            );
            default -> protocolGet(
                ProviderProtocol.Operation.LYRIC,
                params,
                "/lyric",
                "/lyrics",
                "/song/lyric"
            );
        };
        Map<String, Object> body = new LinkedHashMap<>(SimpleJson.asMap(SimpleJson.parse(raw)));
        body.putIfAbsent("ok", !isErrorPayload(raw));
        body.put("provider", id);
        putLyricTrack(body, "lrc", namedLyricText(body, "lrc", "lyric", "lyrics"));
        putLyricTrack(body, "tlyric", namedLyricText(body, "tlyric", "translation", "translatedLyric"));
        putLyricTrack(body, "romalrc", namedLyricText(body, "romalrc", "romanization", "romanizedLyric"));
        putLyricTrack(body, "klyric", namedLyricText(body, "klyric", "krc"));
        putLyricTrack(body, "yrc", namedLyricText(body, "yrc"));
        return body;
    }

    @Override
    public Map<String, Object> userPlaylistsPayload() {
        Map<String, String> params = authParams();
        String raw = switch (id) {
            case "qq" -> protocolGet(
                ProviderProtocol.Operation.USER_PLAYLISTS,
                params,
                "/user/getUserPlaylists",
                "/user/getUserCollectedSongLists",
                "/user/playlists"
            );
            case "kugou" -> protocolGet(
                ProviderProtocol.Operation.USER_PLAYLISTS,
                params,
                "/user/playlist",
                "/top/playlist",
                "/user/listen",
                "/user/playlists"
            );
            default -> protocolGet(
                ProviderProtocol.Operation.USER_PLAYLISTS,
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
        if (!explicitProtocol && extracted.isEmpty() && "qq".equals(id)) {
            root = SimpleJson.parse(rawGetAny(params, "/user/getUserDetail"));
            extracted = extractPlaylists(root);
        }
        if (!explicitProtocol && extracted.isEmpty() && "kugou".equals(id)) {
            root = SimpleJson.parse(rawGetAny(params, "/top/playlist"));
            extracted = extractPlaylists(root);
        }
        List<Map<String, Object>> playlists = new ArrayList<>();
        for (Playlist playlist : extracted) playlists.add(playlist.toMap());
        Map<String, Object> body = new LinkedHashMap<>();
        Map<String, Object> rootMap = SimpleJson.asMap(root);
        boolean metadataOnly = "qishui".equals(id) && SimpleJson.asBoolean(rootMap.get("metadataOnly"), false);
        body.put("ok", !rootMap.containsKey("error"));
        body.put("provider", id);
        body.put("label", label);
        body.put("loggedIn", !metadataOnly && (!playlists.isEmpty() || hasAuthSession()));
        if (metadataOnly) body.put("libraryAvailable", !playlists.isEmpty());
        body.put("playlists", playlists);
        if (rootMap.containsKey("error")) body.put("error", rootMap.get("error"));
        return body;
    }

    @Override
    public Map<String, Object> recommendedPlaylistsPayload(int limit) {
        int requestLimit = Math.max(1, Math.min(30, limit));
        Map<String, String> params = authParams();
        params.put("page", "1");
        params.put("pageNo", "1");
        params.put("limit", String.valueOf(requestLimit));
        params.put("pageSize", String.valueOf(requestLimit));
        params.put("pagesize", String.valueOf(requestLimit));
        String[] legacyCandidates = switch (id) {
            case "qq" -> new String[] {
                "/getRecommendPlaylist",
                "/getSongLists",
                "/recommend/playlist",
                "/top/playlist"
            };
            case "kugou" -> new String[] {
                "/recommend/playlist",
                "/top/playlist",
                "/playlist/recommend"
            };
            default -> new String[] {
                "/recommend/playlist",
                "/top/playlist",
                "/playlist"
            };
        };
        String[] candidates = protocolPaths(
            ProviderProtocol.Operation.RECOMMENDED_PLAYLISTS,
            legacyCandidates
        );

        List<Playlist> playlists = List.of();
        String source = "plugin";
        for (String path : candidates) {
            Object root = SimpleJson.parse(rawGet(path, params));
            List<Playlist> extracted = extractPlaylists(root);
            if (extracted.isEmpty()) continue;
            playlists = extracted;
            source = path.contains("/top/") ? "top" : "daily";
            break;
        }

        if (playlists.isEmpty()) {
            playlists = extractPlaylists(userPlaylistsPayload());
            source = "library";
        }

        List<Map<String, Object>> items = new ArrayList<>();
        for (Playlist playlist : playlists) {
            if (items.size() >= requestLimit) break;
            Map<String, Object> item = playlist.toMap();
            item.put("recommended", true);
            item.put("recommendationSource", source);
            items.add(item);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("provider", id);
        body.put("label", label);
        body.put("source", source);
        body.put("playlists", items);
        return body;
    }

    @Override
    public Map<String, Object> playlistTracksPayload(String playlistId, int limit) {
        Map<String, String> params = authParams();
        int requestLimit = limit > 0 ? limit : 100;
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
        Object root;
        List<Song> songs;
        if ("kugou".equals(id)) {
            root = Map.of();
            songs = List.of();
            for (String path : protocolPaths(
                ProviderProtocol.Operation.PLAYLIST_TRACKS,
                "/playlist/track/all",
                "/playlist/track/all/new",
                "/playlist/detail",
                "/playlist/tracks"
            )) {
                Object candidate = SimpleJson.parse(rawGet(path, params));
                List<Song> extracted = extractSongs(candidate, limit);
                root = candidate;
                if (!extracted.isEmpty()) {
                    songs = extracted;
                    break;
                }
            }
        } else {
            String raw = switch (id) {
                case "qq" -> protocolGet(
                    ProviderProtocol.Operation.PLAYLIST_TRACKS,
                    params,
                    "/getSongListDetail",
                    "/playlist/detail",
                    "/playlist/tracks"
                );
                default -> protocolGet(
                    ProviderProtocol.Operation.PLAYLIST_TRACKS,
                    params,
                    "/playlist/tracks",
                    "/playlist/track/all",
                    "/playlist/detail",
                    "/playlist/song",
                    "/playlist/songs",
                    "/songlist"
                );
            };
            root = SimpleJson.parse(raw);
            songs = extractSongs(root, limit);
        }
        Map<String, Object> body = songsPayload(songs, "playlist");
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
            case "qq" -> protocolRequest(
                ProviderProtocol.Operation.PLAYLIST_ADD,
                "POST",
                params,
                "/user/addSongToPlaylist",
                "/user/playlist/add",
                "/playlist/addSong",
                "/songlist/add",
                "/addSongToPlaylist"
            );
            case "kugou" -> protocolRequest(
                ProviderProtocol.Operation.PLAYLIST_ADD,
                "POST",
                params,
                "/playlist/add",
                "/user/playlist/add",
                "/song/addToPlaylist",
                "/favorite/add"
            );
            default -> protocolRequest(
                ProviderProtocol.Operation.PLAYLIST_ADD,
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
            ? protocolGet(ProviderProtocol.Operation.COMMENTS, params, "/getComments")
            : protocolGet(
                ProviderProtocol.Operation.COMMENTS,
                params,
                "/comments",
                "/song/comments",
                "/comment/music"
            );
        Object root = SimpleJson.parse(raw);
        return CommentPayloads.fromRoot(id, label, root, limit);
    }

    private static ProviderProtocol protocolOrNull(String provider) {
        try {
            return ProviderProtocol.forProvider(provider);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private String protocolPath(ProviderProtocol.Operation operation, String fallback) {
        if (protocol == null) return fallback;
        try {
            return protocol.route(operation).path();
        } catch (IllegalArgumentException ignored) {
            return fallback;
        }
    }

    private String[] protocolPaths(ProviderProtocol.Operation operation, String... legacyPaths) {
        LinkedHashMap<String, Boolean> paths = new LinkedHashMap<>();
        String configured = protocolPath(operation, "");
        if (!configured.isBlank()) paths.put(configured, Boolean.TRUE);
        if (!explicitProtocol && legacyPaths != null) {
            for (String path : legacyPaths) {
                if (path != null && !path.isBlank()) paths.put(path, Boolean.TRUE);
            }
        }
        return paths.keySet().toArray(String[]::new);
    }

    private String protocolGet(
        ProviderProtocol.Operation operation,
        Map<String, String> params,
        String... legacyPaths
    ) {
        return protocolRequest(operation, "GET", params, legacyPaths);
    }

    private String protocolRequest(
        ProviderProtocol.Operation operation,
        String fallbackMethod,
        Map<String, String> params,
        String... legacyPaths
    ) {
        String configuredPath = "";
        if (protocol != null) {
            try {
                ProviderProtocol.Route route = protocol.route(operation);
                configuredPath = route.path();
                String response = rawRequest(route.method(), route.path(), params);
                if (explicitProtocol || !isErrorPayload(response)) return response;
            } catch (IllegalArgumentException ignored) {
            }
        }
        if (explicitProtocol) {
            return errorPayload(label + " API operation is not configured: " + operation);
        }
        List<String> fallbackPaths = new ArrayList<>();
        if (legacyPaths != null) {
            for (String path : legacyPaths) {
                if (path == null || path.isBlank() || path.equals(configuredPath)) continue;
                if (!fallbackPaths.contains(path)) fallbackPaths.add(path);
            }
        }
        return rawRequestAny(fallbackMethod, params, fallbackPaths.toArray(String[]::new));
    }

    private void putSongRequestParams(Map<String, String> params, Song song) {
        String songId = song == null || song.id == null ? "" : song.id.trim();
        Map<String, Object> sourceRef = song == null || song.sourceRef == null
            ? Map.of()
            : song.sourceRef;
        String providerSongId = firstNonBlank(
            sourceText(sourceRef, "providerSongId"),
            sourceText(sourceRef, "songId"),
            sourceText(sourceRef, "id"),
            songId
        );
        params.put("id", providerSongId);
        params.put("songid", providerSongId);

        if ("qq".equals(id)) {
            String mediaMid = firstNonBlank(
                sourceText(sourceRef, "mediaMid"),
                sourceText(sourceRef, "media_mid"),
                sourceText(sourceRef, "songmid"),
                sourceText(sourceRef, "mid"),
                songId
            );
            params.put("mid", mediaMid);
            params.put("songmid", mediaMid);
            putIfPresent(params, "qqId", firstNonBlank(
                sourceText(sourceRef, "qqId"),
                sourceText(sourceRef, "songId")
            ));
            return;
        }

        if ("kugou".equals(id)) {
            KugouSongIdentity encoded = parseKugouSongIdentity(songId);
            String hash = firstNonBlank(sourceText(sourceRef, "hash"), encoded.hash());
            String albumAudioId = firstNonBlank(
                sourceText(sourceRef, "album_audio_id"),
                sourceText(sourceRef, "albumAudioId"),
                sourceText(sourceRef, "audio_id"),
                encoded.albumAudioId()
            );
            String albumId = firstNonBlank(
                sourceText(sourceRef, "album_id"),
                sourceText(sourceRef, "albumId"),
                encoded.albumId()
            );
            putIfPresent(params, "hash", hash);
            putIfPresent(params, "album_audio_id", albumAudioId);
            putIfPresent(params, "audio_id", albumAudioId);
            putIfPresent(params, "mixsongid", albumAudioId);
            putIfPresent(params, "album_id", albumId);
            if (!hash.isBlank()) params.put("id", hash);
            else if (!albumAudioId.isBlank()) params.put("id", albumAudioId);
            return;
        }

        if ("qishui".equals(id)) {
            String officialId = firstNonBlank(
                sourceText(sourceRef, "providerSongId"),
                sourceText(sourceRef, "officialId")
            );
            params.put("id", songId);
            putIfPresent(params, "providerSongId", officialId);
            putIfPresent(params, "title", firstNonBlank(sourceText(sourceRef, "matchTitle"), song == null ? "" : song.title));
            putIfPresent(params, "artist", firstNonBlank(sourceText(sourceRef, "matchArtist"), song == null ? "" : song.artist));
            putIfPresent(params, "duration", firstNonBlank(
                sourceText(sourceRef, "matchDuration"),
                song != null && song.duration > 0 ? String.valueOf(song.duration) : ""
            ));
            return;
        }

        params.put("mid", providerSongId);
        params.put("songmid", providerSongId);
        params.put("hash", providerSongId);
    }

    private static String sourceText(Map<String, Object> sourceRef, String key) {
        return sourceRef == null ? "" : SimpleJson.asString(sourceRef.get(key), "");
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
        if (ok instanceof Boolean b && !b) return true;
        Object success = map.get("success");
        if (success instanceof Boolean b && !b) return true;
        int errorCode = SimpleJson.asInt(map.get("error_code"), SimpleJson.asInt(map.get("errorCode"), 0));
        if (errorCode != 0) return true;
        String type = SimpleJson.asString(map.get("type"), "");
        return "api".equalsIgnoreCase(type) || "network".equalsIgnoreCase(type);
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

    private String rawJsonPost(String path, Map<String, ?> body) {
        try {
            HttpRequest request = HttpRequest.newBuilder(buildUri(path, Map.of()))
                .timeout(Duration.ofSeconds(12))
                .header("Accept", "application/json, text/plain, */*")
                .header("Content-Type", "application/json; charset=utf-8")
                .POST(HttpRequest.BodyPublishers.ofString(
                    SimpleJson.stringify(body == null ? Map.of() : body),
                    StandardCharsets.UTF_8
                ))
                .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            rememberCookieHeaders(response.headers().allValues("Set-Cookie"));
            String payload = cleanJsonBody(response.body());
            if (response.statusCode() >= 400) {
                Map<String, Object> error = new LinkedHashMap<>(SimpleJson.asMap(SimpleJson.parse(payload)));
                error.putIfAbsent("error", label + " API HTTP " + response.statusCode());
                error.put("ok", false);
                return SimpleJson.stringify(error);
            }
            return payload == null || payload.isBlank()
                ? errorPayload(label + " API returned empty body")
                : payload;
        } catch (IOException | InterruptedException | IllegalArgumentException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            return errorPayload(label + " API unavailable at " + baseUrl + ": " + exceptionDetail(e));
        }
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
            String body = cleanJsonBody(response.body());
            if (response.statusCode() >= 400) {
                return errorPayload(label + " API HTTP " + response.statusCode());
            }
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
            if (SimpleJson.asString(account.get("vipType"), "").isBlank()) putIfNotBlank(account, "vipType", session.get("vip_type"));
            if (SimpleJson.asString(account.get("vipToken"), "").isBlank()) putIfNotBlank(account, "vipToken", session.get("vip_token"));
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
            for (String cookie : SET_COOKIE_SEPARATOR.split(header)) {
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
        String lower = name.toLowerCase();
        if ("qq".equals(id)) {
            return "uin".equals(lower) || "p_uin".equals(lower) || "wxuin".equals(lower)
                || "skey".equals(lower) || "p_skey".equals(lower)
                || "qqmusic_key".equals(lower) || "qm_keyst".equals(lower);
        }
        if ("kugou".equals(id)) {
            return "token".equals(lower) || "kugootoken".equals(lower)
                || "userid".equals(lower) || "kugooid".equals(lower) || "kugoo".equals(lower)
                || "vip_token".equals(lower) || "vip_type".equals(lower)
                || "dfid".equals(lower) || lower.startsWith("kugou_api_") || "t1".equals(lower);
        }
        return false;
    }

    private static String firstCookieValue(Map<String, String> cookies, String... names) {
        if (cookies == null || names == null) return "";
        for (String wanted : names) {
            for (Map.Entry<String, String> entry : cookies.entrySet()) {
                if (entry.getKey() != null && entry.getKey().equalsIgnoreCase(wanted)) {
                    String value = entry.getValue();
                    if (value != null && !value.isBlank()) return value.trim();
                }
            }
        }
        return "";
    }

    private static String nestedCookieValue(String raw, String... names) {
        if (raw == null || raw.isBlank() || names == null) return "";
        String decoded;
        try {
            decoded = URLDecoder.decode(raw, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ignored) {
            decoded = raw;
        }
        for (String part : decoded.split("[&;]")) {
            int separator = part.indexOf('=');
            if (separator <= 0) continue;
            String key = part.substring(0, separator).trim();
            String value = part.substring(separator + 1).trim();
            for (String name : names) {
                if (key.equalsIgnoreCase(name) && !value.isBlank()) return value;
            }
        }
        return "";
    }

    private void rememberSession(Map<String, String> updates) {
        if (updates.isEmpty()) return;
        synchronized (session) {
            boolean changed = false;
            for (Map.Entry<String, String> entry : updates.entrySet()) {
                if (entry.getValue() == null || entry.getValue().isBlank()) continue;
                String previous = session.get(entry.getKey());
                if (entry.getValue().equals(previous)) continue;
                session.put(entry.getKey(), entry.getValue());
                changed = true;
            }
            if (changed) saveSessionLocked();
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

    private static String namedLyricText(Object root, String... names) {
        if (names == null) return "";
        for (String name : names) {
            Object value = findNamedValue(root, name, 0);
            String direct = SimpleJson.asString(value, "");
            if (!direct.isBlank()) return direct;
            String nested = firstString(value, "lyric", "lrc", "lyrics", "content", "text");
            if (!nested.isBlank()) return nested;
        }
        return "";
    }

    private static Object findNamedValue(Object root, String name, int depth) {
        if (depth > 8 || root == null || name == null) return null;
        if (root instanceof List<?>) {
            for (Object item : SimpleJson.asList(root)) {
                Object nested = findNamedValue(item, name, depth + 1);
                if (nested != null) return nested;
            }
            return null;
        }
        Map<String, Object> map = SimpleJson.asMap(root);
        if (map.containsKey(name)) return map.get(name);
        for (Object value : map.values()) {
            if (!(value instanceof Map<?, ?>) && !(value instanceof List<?>)) continue;
            Object nested = findNamedValue(value, name, depth + 1);
            if (nested != null) return nested;
        }
        return null;
    }

    private static void putLyricTrack(Map<String, Object> body, String key, String text) {
        if (body == null || key == null || text == null || text.isBlank()) return;
        body.put(key, Map.of("lyric", text));
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

    private static boolean isPlayableWebAudio(String url) {
        if (url == null || url.isBlank() || isKugouNativeAudio(url)) return false;
        try {
            String scheme = URI.create(url.trim()).getScheme();
            return "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme);
        } catch (IllegalArgumentException ignored) {
            return false;
        }
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
        } else if ("qishui".equals(id)) {
            song.id = firstNonBlank(
                directString(map, "id"),
                directString(map, "providerSongId"),
                directString(map, "trackId")
            );
        } else {
            song.id = firstString(
                map,
                "providerSongId",
                "trackId",
                "id",
                "mid",
                "songmid",
                "songMid",
                "songId",
                "songid",
                "hash",
                "Hash",
                "HASH",
                "fileHash",
                "FileHash",
                "filehash",
                "rid",
                "album_audio_id",
                "mixsongid"
            );
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
        Map<String, Object> sourceRef = new LinkedHashMap<>();
        if ("qq".equals(id)) {
            Map<String, Object> file = SimpleJson.asMap(map.get("file"));
            putSourceRef(sourceRef, "mediaMid", firstNonBlank(
                directString(file, "media_mid"),
                directString(map, "media_mid"),
                directString(map, "songmid"),
                directString(map, "mid")
            ));
            putSourceRef(sourceRef, "qqId", firstString(map, "id", "songId", "songid"));
        } else if ("kugou".equals(id)) {
            KugouSongIdentity identity = parseKugouSongIdentity(song.id);
            putSourceRef(sourceRef, "hash", identity.hash());
            putSourceRef(sourceRef, "album_audio_id", identity.albumAudioId());
            putSourceRef(sourceRef, "album_id", identity.albumId());
        } else if ("qishui".equals(id)) {
            Map<String, Object> supplied = SimpleJson.asMap(map.get("sourceRef"));
            putSourceRef(sourceRef, "providerSongId", firstNonBlank(
                directString(supplied, "providerSongId"),
                directString(map, "providerSongId")
            ));
            putSourceRef(sourceRef, "matchTitle", firstNonBlank(
                directString(supplied, "matchTitle"),
                song.title
            ));
            putSourceRef(sourceRef, "matchArtist", firstNonBlank(
                directString(supplied, "matchArtist"),
                song.artist
            ));
            putSourceRef(sourceRef, "matchDuration", firstNonBlank(
                directString(supplied, "matchDuration"),
                song.duration > 0 ? String.valueOf(song.duration) : ""
            ));
            if (SimpleJson.asBoolean(supplied.get("metadataOnly"), false)) {
                sourceRef.put("metadataOnly", true);
            }
        }
        song.setSourceRef(sourceRef);
        return song;
    }

    private static void putSourceRef(Map<String, Object> target, String key, String value) {
        if (target == null || key == null || value == null || value.isBlank()) return;
        target.put(key, value.trim());
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
        if (hash.isBlank()) hash = firstString(map, "hash", "Hash", "HASH", "fileHash", "FileHash", "filehash");
        String albumAudioId = firstString(
            map,
            "album_audio_id",
            "albumAudioId",
            "audio_id",
            "audioId",
            "Audioid",
            "AudioID",
            "mixsongid",
            "mixSongId",
            "MixSongID"
        );
        String albumId = firstString(map, "album_id", "albumId", "albumid", "albumID", "AlbumID");
        String fallbackId = firstString(map, "songId", "songid", "id", "rid");
        if (albumAudioId.isBlank() && hash.isBlank()) albumAudioId = fallbackId;
        KugouSongIdentity identity = new KugouSongIdentity(hash, albumAudioId, albumId);
        return identity.compound() ? identity.encoded() : identity.primaryId();
    }

    private static KugouSongIdentity parseKugouSongIdentity(String value) {
        String raw = value == null ? "" : value.trim();
        if (raw.startsWith("kg|")) {
            String[] parts = KUGOU_ID_SEPARATOR.split(raw, -1);
            if (parts.length == 4) return new KugouSongIdentity(parts[1], parts[2], parts[3]);
        }
        if (KUGOU_HASH.matcher(raw).matches()) return new KugouSongIdentity(raw, "", "");
        if (DECIMAL_ID.matcher(raw).matches()) return new KugouSongIdentity("", raw, "");
        return new KugouSongIdentity(raw, "", "");
    }

    private record KugouSongIdentity(String hash, String albumAudioId, String albumId) {
        private KugouSongIdentity {
            hash = hash == null ? "" : hash.trim();
            albumAudioId = albumAudioId == null ? "" : albumAudioId.trim();
            albumId = albumId == null ? "" : albumId.trim();
        }

        private String primaryId() {
            return !hash.isBlank() ? hash : albumAudioId;
        }

        private boolean compound() {
            int populated = (hash.isBlank() ? 0 : 1) + (albumAudioId.isBlank() ? 0 : 1) + (albumId.isBlank() ? 0 : 1);
            return populated > 1;
        }

        private String encoded() {
            return "kg|" + hash + "|" + albumAudioId + "|" + albumId;
        }
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
        account.put("vipType", firstString(profile, "vipType", "vip_type", "viptype", "vip", "isVip", "isVIP", "isVipUser", "vipLevel", "vip_level", "svip", "superVip", "musicPackage"));
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
