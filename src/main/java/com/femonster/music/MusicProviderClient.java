package com.femonster.music;

import com.femonster.model.Song;

import java.util.Map;

public interface MusicProviderClient {
    String id();

    String label();

    String baseUrl();

    Map<String, Object> serviceStatus();

    Map<String, Object> accountPayload();

    String loginQrKeyPayload();

    String loginQrCreatePayload(String key, boolean qrimg);

    String loginQrCheckPayload(String key);

    default Map<String, Object> loginPhoneSendPayload(String phone) {
        return Map.of(
            "ok", false,
            "provider", id(),
            "code", "PHONE_LOGIN_UNSUPPORTED",
            "error", label() + " does not support phone verification login"
        );
    }

    default Map<String, Object> loginPhoneVerifyPayload(String phone, String code) {
        return Map.of(
            "ok", false,
            "provider", id(),
            "code", "PHONE_LOGIN_UNSUPPORTED",
            "error", label() + " does not support phone verification login"
        );
    }

    Map<String, Object> search(String keyword, int page, int limit);

    String songUrl(String id, String quality);

    Map<String, Object> songUrlPayload(String id, String quality);

    Map<String, Object> userPlaylistsPayload();

    Map<String, Object> playlistTracksPayload(String playlistId, int limit);

    Map<String, Object> addSongToPlaylistPayload(String playlistId, Song song);

    Map<String, Object> commentsPayload(String songId, int limit);
}
