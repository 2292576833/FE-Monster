package com.femonster.music;

import com.femonster.json.SimpleJson;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Backend-only playback resolution result. Provider request headers stay on the
 * backend; {@link #toMap()} exposes only whether a local proxy is required.
 */
public final class PlaybackSource {
    private final String provider;
    private final String quality;
    private final String url;
    private final boolean playable;
    private final Map<String, String> headers;
    private final Map<String, Object> restriction;
    private final String error;

    private PlaybackSource(
        String provider,
        String quality,
        String url,
        boolean playable,
        Map<String, String> headers,
        Map<String, Object> restriction,
        String error
    ) {
        this.provider = text(provider);
        this.quality = text(quality);
        this.url = text(url);
        this.playable = playable && !this.url.isBlank();
        this.headers = headers == null ? Map.of() : Map.copyOf(headers);
        this.restriction = restriction == null ? Map.of() : Map.copyOf(restriction);
        this.error = text(error);
    }

    public static PlaybackSource fromUrl(String provider, String quality, String url) {
        String value = text(url);
        return new PlaybackSource(
            provider,
            quality,
            value,
            !value.isBlank(),
            Map.of(),
            Map.of(),
            value.isBlank() ? "song url unavailable" : ""
        );
    }

    public static PlaybackSource unavailable(String provider, String quality, String error) {
        return new PlaybackSource(provider, quality, "", false, Map.of(), Map.of(), error);
    }

    public static PlaybackSource fromPayload(
        String provider,
        String quality,
        Map<String, Object> payload
    ) {
        Map<String, Object> body = payload == null ? Map.of() : payload;
        String url = firstString(body, "url", "playUrl", "play_url", "src", "audio", "location", "purl");
        boolean playable = body.containsKey("playable")
            ? SimpleJson.asBoolean(body.get("playable"), !url.isBlank())
            : !url.isBlank();
        Map<String, Object> restriction = firstMap(body, "restriction", "playbackRestriction");
        String error = firstNonBlank(
            SimpleJson.asString(body.get("error"), ""),
            SimpleJson.asString(restriction.get("message"), ""),
            playable ? "" : SimpleJson.asString(body.get("message"), ""),
            playable ? "" : SimpleJson.asString(body.get("msg"), ""),
            playable ? "" : "song url unavailable"
        );
        return new PlaybackSource(
            provider,
            firstNonBlank(SimpleJson.asString(body.get("quality"), ""), quality),
            url,
            playable,
            stringMap(firstMap(body, "headers", "playbackHeaders")),
            restriction,
            error
        );
    }

    public String provider() {
        return provider;
    }

    public String quality() {
        return quality;
    }

    public String url() {
        return url;
    }

    public boolean playable() {
        return playable;
    }

    public Map<String, String> headers() {
        return headers;
    }

    public Map<String, Object> restriction() {
        return restriction;
    }

    public String error() {
        return error;
    }

    public String errorMessage() {
        if (playable) return "";
        return firstNonBlank(error, SimpleJson.asString(restriction.get("message"), ""), "song url unavailable");
    }

    public Map<String, Object> toMap() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("provider", provider);
        body.put("quality", quality);
        body.put("url", url);
        body.put("playable", playable);
        body.put("requiresProxy", !headers.isEmpty());
        if (!restriction.isEmpty()) body.put("restriction", new LinkedHashMap<>(restriction));
        if (!error.isBlank()) body.put("error", error);
        return body;
    }

    private static Map<String, String> stringMap(Map<String, Object> value) {
        if (value.isEmpty()) return Map.of();
        Map<String, String> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : value.entrySet()) {
            String key = text(entry.getKey());
            String item = SimpleJson.asString(entry.getValue(), "");
            if (!key.isBlank() && !item.isBlank()) out.put(key, item);
        }
        return out;
    }

    private static Map<String, Object> firstMap(Object root, String... names) {
        for (String name : names) {
            Object value = findNamedValue(root, name, 0);
            Map<String, Object> map = SimpleJson.asMap(value);
            if (!map.isEmpty()) return map;
        }
        return Map.of();
    }

    private static String firstString(Object root, String... names) {
        for (String name : names) {
            Object value = findNamedValue(root, name, 0);
            String text = SimpleJson.asString(value, "");
            if (!text.isBlank()) return text;
        }
        return "";
    }

    private static Object findNamedValue(Object root, String name, int depth) {
        if (root == null || name == null || depth > 8) return null;
        if (root instanceof Iterable<?>) {
            for (Object item : (Iterable<?>) root) {
                Object value = findNamedValue(item, name, depth + 1);
                if (value != null) return value;
            }
            return null;
        }
        if (!(root instanceof Map<?, ?>)) return null;
        Map<String, Object> map = SimpleJson.asMap(root);
        if (map.containsKey(name)) return map.get(name);
        for (Object value : map.values()) {
            if (!(value instanceof Map<?, ?>) && !(value instanceof Iterable<?>)) continue;
            Object nested = findNamedValue(value, name, depth + 1);
            if (nested != null) return nested;
        }
        return null;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}
