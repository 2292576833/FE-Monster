package com.femonster.music;

import java.util.EnumMap;
import java.util.Map;

/**
 * Fixed routes implemented by the FE Monster provider sidecars.
 */
public final class ProviderProtocol {
    public enum Operation {
        HEALTH,
        ACCOUNT,
        SESSION_LOGIN,
        SEARCH,
        SONG_URL,
        LYRIC,
        USER_PLAYLISTS,
        RECOMMENDED_PLAYLISTS,
        PLAYLIST_TRACKS,
        PLAYLIST_ADD,
        COMMENTS
    }

    public record Route(String method, String path) {
        public Route {
            method = method == null || method.isBlank() ? "GET" : method.trim().toUpperCase();
            path = normalizePath(path);
        }
    }

    private final String provider;
    private final Map<Operation, Route> routes;

    private ProviderProtocol(String provider, Map<Operation, Route> routes) {
        this.provider = MusicProviderRegistry.normalize(provider);
        this.routes = Map.copyOf(routes);
    }

    public static ProviderProtocol forProvider(String provider) {
        String id = MusicProviderRegistry.normalize(provider);
        EnumMap<Operation, Route> routes = commonRoutes();
        switch (id) {
            case "qq" -> {
                routes.put(Operation.ACCOUNT, get("/user/getUserDetail"));
                routes.put(Operation.SEARCH, get("/getSearchByKey"));
                routes.put(Operation.SONG_URL, get("/getMusicPlay"));
                routes.put(Operation.LYRIC, get("/getLyric"));
                routes.put(Operation.USER_PLAYLISTS, get("/user/getUserPlaylists"));
                routes.put(Operation.RECOMMENDED_PLAYLISTS, get("/getRecommendPlaylist"));
                routes.put(Operation.PLAYLIST_TRACKS, get("/getSongListDetail"));
                routes.put(Operation.PLAYLIST_ADD, post("/user/addSongToPlaylist"));
                routes.put(Operation.COMMENTS, get("/getComments"));
            }
            case "kugou" -> {
                routes.put(Operation.ACCOUNT, get("/login/status"));
                routes.put(Operation.SEARCH, get("/search"));
                routes.put(Operation.SONG_URL, get("/song/url"));
                routes.put(Operation.LYRIC, get("/lyric"));
                routes.put(Operation.USER_PLAYLISTS, get("/user/playlist"));
                routes.put(Operation.RECOMMENDED_PLAYLISTS, get("/top/playlist"));
                routes.put(Operation.PLAYLIST_TRACKS, get("/playlist/track/all"));
                routes.put(Operation.PLAYLIST_ADD, post("/playlist/add"));
                routes.put(Operation.COMMENTS, get("/comments"));
            }
            case "qishui" -> {
                routes.put(Operation.ACCOUNT, get("/login/status"));
                routes.put(Operation.SESSION_LOGIN, post("/session/token"));
                routes.put(Operation.SEARCH, get("/search"));
                routes.put(Operation.SONG_URL, get("/song/url"));
                routes.put(Operation.USER_PLAYLISTS, get("/user/playlist"));
                routes.put(Operation.PLAYLIST_TRACKS, get("/playlist/track/all"));
            }
            default -> throw new IllegalArgumentException("unsupported explicit provider protocol: " + id);
        }
        return new ProviderProtocol(id, routes);
    }

    public String provider() {
        return provider;
    }

    public Route route(Operation operation) {
        Route route = routes.get(operation);
        if (route == null) throw new IllegalArgumentException("provider operation is not configured: " + operation);
        return route;
    }

    private static EnumMap<Operation, Route> commonRoutes() {
        EnumMap<Operation, Route> routes = new EnumMap<>(Operation.class);
        routes.put(Operation.HEALTH, get("/health"));
        return routes;
    }

    private static Route get(String path) {
        return new Route("GET", path);
    }

    private static Route post(String path) {
        return new Route("POST", path);
    }

    private static String normalizePath(String value) {
        String path = value == null ? "" : value.trim();
        if (path.isBlank()) return "/";
        return path.startsWith("/") ? path : "/" + path;
    }
}
