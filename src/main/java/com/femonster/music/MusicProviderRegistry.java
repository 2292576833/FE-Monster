package com.femonster.music;

import com.femonster.model.Song;
import com.femonster.netease.NeteaseClient;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class MusicProviderRegistry {
    private final Map<String, MusicProviderClient> providers = new LinkedHashMap<>();

    public MusicProviderRegistry(NeteaseClient netease, MusicProviderClient qq, MusicProviderClient kugou) {
        register(netease);
        register(qq);
        register(kugou);
    }

    public MusicProviderClient get(String provider) {
        MusicProviderClient client = providers.get(normalize(provider));
        return client == null ? providers.get("netease") : client;
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

    public String loginQrKeyPayload(String provider) {
        return get(provider).loginQrKeyPayload();
    }

    public String loginQrCreatePayload(String provider, String key, boolean qrimg) {
        return get(provider).loginQrCreatePayload(key, qrimg);
    }

    public String loginQrCheckPayload(String provider, String key) {
        return get(provider).loginQrCheckPayload(key);
    }

    public Map<String, Object> search(String provider, String keyword, int page, int limit) {
        return get(provider).search(keyword, page, limit);
    }

    public String songUrl(String provider, String id, String quality) {
        return get(provider).songUrl(id, quality);
    }

    public Map<String, Object> songUrlPayload(String provider, String id, String quality) {
        return get(provider).songUrlPayload(id, quality);
    }

    public Map<String, Object> userPlaylistsPayload(String provider) {
        return get(provider).userPlaylistsPayload();
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

    private void register(MusicProviderClient client) {
        providers.put(normalize(client.id()), client);
    }
}
