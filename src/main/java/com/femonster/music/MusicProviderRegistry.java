package com.femonster.music;

import com.femonster.model.Song;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class MusicProviderRegistry {
    private volatile Map<String, MusicProviderClient> providers = Map.of();

    public MusicProviderRegistry(MusicProviderClient... clients) {
        replace(clients);
    }

    public MusicProviderClient get(String provider) {
        String id = normalize(provider);
        MusicProviderClient client = providers.get(id);
        if (client == null) throw new IllegalArgumentException("music API plugin is not configured: " + id);
        return client;
    }

    public synchronized void replace(MusicProviderClient... clients) {
        Map<String, MusicProviderClient> next = new LinkedHashMap<>();
        if (clients != null) {
            for (MusicProviderClient client : clients) {
                if (client != null) next.put(normalize(client.id()), client);
            }
        }
        providers = Collections.unmodifiableMap(next);
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
