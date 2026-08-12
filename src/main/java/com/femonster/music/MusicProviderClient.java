package com.femonster.music;

import com.femonster.model.Song;

import java.util.Map;

public interface MusicProviderClient {
    String id();

    String label();

    String baseUrl();

    Map<String, Object> serviceStatus();

    Map<String, Object> accountPayload();

    default Map<String, Object> configureLogin(Map<String, String> credentials) {
        throw new IllegalArgumentException("provider does not support direct login configuration: " + id());
    }

    default Map<String, Object> localClientStatus() {
        throw new IllegalArgumentException("provider does not support local client detection: " + id());
    }

    default Map<String, Object> importLibraryMetadata(Map<String, Object> library) {
        throw new IllegalArgumentException("provider does not support library metadata import: " + id());
    }

    void rememberBrowserSession(Map<String, String> cookies);

    default Map<String, Object> beginProviderLogin() {
        return Map.of();
    }

    default Map<String, Object> pollProviderLogin(String key) {
        return Map.of("authenticated", false, "status", 0);
    }

    default void clearBrowserSession() {
        // Providers without a persisted browser session have nothing to clear.
    }

    Map<String, Object> search(String keyword, int page, int limit);

    String songUrl(String id, String quality);

    Map<String, Object> songUrlPayload(String id, String quality);

    default PlaybackSource resolvePlayback(Song song, String quality) {
        if (song == null || !song.hasIdentity()) {
            return PlaybackSource.unavailable(id(), quality, "song id is missing");
        }
        return PlaybackSource.fromPayload(id(), quality, songUrlPayload(song.id, quality));
    }

    Map<String, Object> lyricPayload(String songId);

    default Map<String, Object> lyricPayload(
        String songId,
        String title,
        String artist,
        int durationSeconds
    ) {
        return lyricPayload(songId);
    }

    Map<String, Object> userPlaylistsPayload();

    Map<String, Object> recommendedPlaylistsPayload(int limit);

    Map<String, Object> playlistTracksPayload(String playlistId, int limit);

    Map<String, Object> addSongToPlaylistPayload(String playlistId, Song song);

    Map<String, Object> commentsPayload(String songId, int limit);
}
