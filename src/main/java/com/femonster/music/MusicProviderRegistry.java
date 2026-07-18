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
        if (client == null) throw new IllegalArgumentException("unknown music provider: " + id);
        return client;
    }

    public synchronized void replace(MusicProviderClient... clients) {
        Map<String, MusicProviderClient> next = new LinkedHashMap<>();
        if (clients != null) {
            for (MusicProviderClient client : clients) {
                if (client != null) next.put(normalize(client.id()), client);
            }
        }
        if (!next.containsKey("netease")) throw new IllegalArgumentException("netease provider is required");
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

    public String loginQrKeyPayload(String provider) {
        return get(provider).loginQrKeyPayload();
    }

    public String loginQrCreatePayload(String provider, String key, boolean qrimg) {
        return get(provider).loginQrCreatePayload(key, qrimg);
    }

    public String loginQrCheckPayload(String provider, String key) {
        return get(provider).loginQrCheckPayload(key);
    }

    public Map<String, Object> loginPhoneSendPayload(String provider, String phone) {
        return get(provider).loginPhoneSendPayload(phone);
    }

    public Map<String, Object> loginPhoneVerifyPayload(String provider, String phone, String code) {
        return get(provider).loginPhoneVerifyPayload(phone, code);
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
        if ("soda".equals(value) || "qishuimusic".equals(value)) return "qishui";
        return value;
    }

    public static String providerFromSong(Song song) {
        return song == null ? "netease" : normalize(song.provider);
    }
}
