package com.femonster.music;

import com.femonster.model.Song;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

public final class MusicProviderRegistry {
    private static final long PROVIDER_ACCESS_RECHECK_NANOS = TimeUnit.SECONDS.toNanos(1);
    private static final Consumer<String> NO_PROVIDER_ACCESS = provider -> {
    };

    private final Consumer<String> providerAccess;
    private final Map<String, Long> providerAccessAt = new ConcurrentHashMap<>();
    private volatile Map<String, MusicProviderClient> providers = Map.of();

    public MusicProviderRegistry(MusicProviderClient... clients) {
        this(NO_PROVIDER_ACCESS, clients);
    }

    public MusicProviderRegistry(Consumer<String> providerAccess, MusicProviderClient... clients) {
        this.providerAccess = providerAccess == null ? NO_PROVIDER_ACCESS : providerAccess;
        replace(clients);
    }

    public MusicProviderClient get(String provider) {
        String id = normalize(provider);
        MusicProviderClient client = providers.get(id);
        if (client == null) throw new IllegalArgumentException("music API plugin is not configured: " + id);
        signalProviderAccess(id);
        return client;
    }

    private void signalProviderAccess(String id) {
        long now = System.nanoTime();
        while (true) {
            Long previous = providerAccessAt.get(id);
            if (previous != null && now - previous < PROVIDER_ACCESS_RECHECK_NANOS) return;
            boolean acquired = previous == null
                ? providerAccessAt.putIfAbsent(id, now) == null
                : providerAccessAt.replace(id, previous, now);
            if (!acquired) continue;
            try {
                providerAccess.accept(id);
            } catch (RuntimeException error) {
                providerAccessAt.remove(id, now);
                throw error;
            }
            return;
        }
    }

    public synchronized void replace(MusicProviderClient... clients) {
        Map<String, MusicProviderClient> next = new LinkedHashMap<>();
        if (clients != null) {
            for (MusicProviderClient client : clients) {
                if (client != null) next.put(normalize(client.id()), client);
            }
        }
        providers = Collections.unmodifiableMap(next);
        providerAccessAt.clear();
    }

    public void resetProviderAccess() {
        providerAccessAt.clear();
    }

    public Map<String, Object> providersPayload() {
        List<Map<String, Object>> items = providers.values().stream()
            .map(client -> {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", client.id());
                item.put("label", client.label());
                item.put("baseUrl", client.baseUrl());
                return item;
            })
            .toList();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("providers", items);
        return body;
    }

    public Map<String, Object> serviceStatus(String provider) {
        return get(provider).serviceStatus();
    }

    public Map<String, Object> accountPayload(String provider) {
        return get(provider).accountPayload();
    }

    public Map<String, Object> configureLogin(String provider, Map<String, String> credentials) {
        return get(provider).configureLogin(credentials);
    }

    public Map<String, Object> localClientStatus(String provider) {
        return get(provider).localClientStatus();
    }

    public Map<String, Object> importLibraryMetadata(String provider, Map<String, Object> library) {
        return get(provider).importLibraryMetadata(library);
    }

    public void rememberBrowserSession(String provider, Map<String, String> cookies) {
        get(provider).rememberBrowserSession(cookies);
    }

    public Map<String, Object> beginProviderLogin(String provider) {
        return get(provider).beginProviderLogin();
    }

    public Map<String, Object> pollProviderLogin(String provider, String key) {
        return get(provider).pollProviderLogin(key);
    }

    /**
     * Persists an official-browser session and verifies that both the account
     * and its playlist library are readable before login is reported complete.
     */
    public Map<String, Object> synchronizeBrowserSession(String provider, Map<String, String> cookies) {
        MusicProviderClient client = get(provider);
        if (!"kugou".equals(normalize(provider))) {
            client.rememberBrowserSession(cookies);
        }
        return synchronizeCurrentSession(provider, client);
    }

    public Map<String, Object> synchronizeCurrentSession(String provider) {
        return synchronizeCurrentSession(provider, get(provider));
    }

    private Map<String, Object> synchronizeCurrentSession(String provider, MusicProviderClient client) {
        Map<String, Object> account = client.accountPayload();
        boolean loggedIn = Boolean.TRUE.equals(account.get("ok"))
            && Boolean.TRUE.equals(account.get("loggedIn"));
        Map<String, Object> playlists = loggedIn
            ? client.userPlaylistsPayload()
            : Map.of("ok", false, "loggedIn", false, "playlists", List.of());
        boolean playlistsReady = loggedIn
            && Boolean.TRUE.equals(playlists.get("ok"))
            && Boolean.TRUE.equals(playlists.get("loggedIn"))
            && Boolean.TRUE.equals(playlists.get("userLibrary"));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("provider", normalize(provider));
        body.put("loggedIn", loggedIn);
        body.put("playlistsReady", playlistsReady);
        body.put("ready", loggedIn && playlistsReady);
        body.put("account", account);
        body.put("playlists", playlists);
        return body;
    }

    public boolean clearBrowserSession(String provider) {
        MusicProviderClient client = providers.get(normalize(provider));
        if (client == null) return false;
        client.clearBrowserSession();
        return true;
    }

    public Map<String, Object> search(String provider, String keyword, int page, int limit) {
        return get(provider).search(keyword, page, limit);
    }

    public String songUrl(String provider, String id, String quality) {
        return get(provider).songUrl(id, quality);
    }

    public PlaybackSource resolvePlayback(String provider, Song song, String quality) {
        return get(provider).resolvePlayback(song, quality);
    }

    public Map<String, Object> songUrlPayload(String provider, String id, String quality) {
        return get(provider).songUrlPayload(id, quality);
    }

    public Map<String, Object> songUrlPayload(String provider, Song song, String quality) {
        return get(provider).resolvePlayback(song, quality).toMap();
    }

    public Map<String, Object> lyricPayload(String provider, String songId) {
        return get(provider).lyricPayload(songId);
    }

    public Map<String, Object> lyricPayload(
        String provider,
        String songId,
        String title,
        String artist,
        int durationSeconds
    ) {
        return get(provider).lyricPayload(songId, title, artist, durationSeconds);
    }

    public Map<String, Object> userPlaylistsPayload(String provider) {
        return get(provider).userPlaylistsPayload();
    }

    public Map<String, Object> recommendedPlaylistsPayload(String provider, int limit) {
        return get(provider).recommendedPlaylistsPayload(limit);
    }

    public Map<String, Object> playlistTracksPayload(String provider, String playlistId, int limit) {
        return get(provider).playlistTracksPayload(playlistId, limit);
    }

    public Map<String, Object> addSongToPlaylistPayload(String provider, String playlistId, Song song) {
        return get(provider).addSongToPlaylistPayload(playlistId, song);
    }

    public Map<String, Object> commentsPayload(String provider, String songId, int limit) {
        return get(provider).commentsPayload(songId, limit);
    }

    public static String normalize(String provider) {
        if (provider == null || provider.isBlank()) return "netease";
        String value = provider.trim().toLowerCase();
        if ("163".equals(value) || "wangyiyun".equals(value)) return "netease";
        if ("qqmusic".equals(value) || "tencent".equals(value)) return "qq";
        if ("kg".equals(value) || "kugoumusic".equals(value)) return "kugou";
        return value;
    }

    public static String providerFromSong(Song song) {
        return song == null ? "netease" : normalize(song.provider);
    }
}
