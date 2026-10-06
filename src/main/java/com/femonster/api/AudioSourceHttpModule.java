package com.femonster.api;

import com.femonster.http.HttpUtil;
import com.femonster.json.SimpleJson;
import com.femonster.model.Song;
import com.femonster.music.MusicProviderRegistry;
import com.femonster.music.sources.AudioSourceService;
import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Same-origin, bounded adapter. Error responses contain fixed codes, never exception diagnostics. */
public final class AudioSourceHttpModule {
    private static final String PREFIX = "/api/audio-sources";
    private static final int MAX_BODY = 768 * 1024;
    private final AudioSourceService sources;
    private final MusicProviderRegistry music;

    public AudioSourceHttpModule(AudioSourceService sources, MusicProviderRegistry music) { this.sources = sources; this.music = music; }

    public boolean tryHandle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if (!path.equals(PREFIX) && !path.startsWith(PREFIX + "/")) return false;
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.getResponseHeaders().set("Pragma", "no-cache");
        try {
            if (path.equals(PREFIX + "/media")) {
                requireMediaOrigin(exchange);
                sources.serveMedia(exchange);
                return true;
            }
            LocalPetAssistantGuard.require(exchange);
            if (exchange.getRequestURI().getRawQuery() != null) throw new IllegalArgumentException();
            String method = exchange.getRequestMethod();
            if (PREFIX.equals(path)) {
                if (!"GET".equals(method)) { sendError(exchange, 405, "AUDIO_SOURCE_METHOD"); return true; }
                HttpUtil.sendJson(exchange, sources.payload()); return true;
            }
            String action = path.substring(PREFIX.length());
            boolean updateHosts = action.matches("/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/hosts");
            if (!updateHosts && !Set.of("/import", "/preview-url", "/import-preview", "/select", "/remove", "/test").contains(action)) { sendError(exchange, 404, "AUDIO_SOURCE_ENDPOINT_NOT_FOUND"); return true; }
            if (!"POST".equals(method)) { sendError(exchange, 405, "AUDIO_SOURCE_METHOD"); return true; }
            String contentType = exchange.getRequestHeaders().getFirst("Content-Type");
            if (contentType == null || !contentType.toLowerCase(Locale.ROOT).matches("application/json(?:\\s*;\\s*charset=utf-8)?")) { sendError(exchange, 415, "AUDIO_SOURCE_JSON_REQUIRED"); return true; }
            String length = exchange.getRequestHeaders().getFirst("Content-Length");
            if (length != null && Long.parseLong(length) > MAX_BODY) { sendError(exchange, 413, "AUDIO_SOURCE_BODY_LIMIT"); return true; }
            byte[] bytes = exchange.getRequestBody().readNBytes(MAX_BODY + 1);
            if (bytes.length > MAX_BODY) { sendError(exchange, 413, "AUDIO_SOURCE_BODY_LIMIT"); return true; }
            String json = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
            rejectDuplicateKeys(json);
            Map<String,Object> body = SimpleJson.parseObjectStrict(json);
            Map<String,Object> response;
            switch (updateHosts ? "/hosts" : action) {
                case "/hosts" -> response = sources.updateHosts(action.substring(1, action.length() - "/hosts".length()), body);
                case "/import" -> response = sources.importScript(body);
                case "/preview-url" -> response = sources.previewUrl(body);
                case "/import-preview" -> response = sources.importPreview(body);
                case "/select" -> { AudioSourceService.requireOnly(body, Set.of("id")); response = sources.select(required(body, "id")); }
                case "/remove" -> { AudioSourceService.requireOnly(body, Set.of("id")); response = sources.remove(required(body, "id")); }
                case "/test" -> {
                    AudioSourceService.requireOnly(body, Set.of("id", "provider", "song", "quality"));
                    String id = required(body, "id");
                    String provider = required(body, "provider");
                    if (!Set.of("netease", "qq", "kugou", "qishui").contains(provider)) throw new IllegalArgumentException();
                    if (!(body.get("song") instanceof Map<?,?>)) throw new IllegalArgumentException();
                    Map<String,Object> songMap = SimpleJson.asMap(body.get("song"));
                    AudioSourceService.requireOnly(songMap, Set.of("id", "title", "name", "artist", "album", "cover", "provider", "duration", "sourceRef"));
                    Song song = Song.fromMap(songMap);
                    if (!song.hasIdentity()) throw new IllegalArgumentException();
                    song.provider = provider;
                    String quality = body.containsKey("quality") ? required(body, "quality") : "standard";
                    response = sources.test(id, provider, song, quality, () -> music.get(provider).resolvePlayback(song, quality));
                }
                default -> throw new IllegalArgumentException();
            }
            HttpUtil.sendJson(exchange, response);
        } catch (SecurityException error) { sendError(exchange, 403, "AUDIO_SOURCE_FORBIDDEN"); }
        catch (IllegalArgumentException error) {
            String message = error.getMessage();
            String code = message != null && message.matches("AUDIO_SOURCE_[A-Z_]{1,50}") ? message : "AUDIO_SOURCE_INVALID_REQUEST";
            sendError(exchange, 400, code);
        } catch (java.nio.charset.CharacterCodingException error) { sendError(exchange, 400, "AUDIO_SOURCE_INVALID_UTF8"); }
        catch (Exception error) { sendError(exchange, 500, "AUDIO_SOURCE_INTERNAL"); }
        return true;
    }
    private static String required(Map<String,Object> body, String field) { Object raw = body.get(field); if (!(raw instanceof String value) || value.isBlank() || value.length() > 256) throw new IllegalArgumentException(); return value; }
    private static void sendError(HttpExchange exchange, int status, String code) throws IOException { HttpUtil.sendJson(exchange, status, Map.of("ok", false, "error", code)); }

    private static void requireMediaOrigin(HttpExchange exchange) {
        exchange.setAttribute("fe.cors.same-origin", Boolean.TRUE);
        var remote = exchange.getRemoteAddress();
        if (remote == null || remote.getAddress() == null || !remote.getAddress().isLoopbackAddress()) throw new SecurityException();
        String host = exchange.getRequestHeaders().getFirst("Host");
        URI hostUri;
        try { hostUri = URI.create("http://" + host); } catch (RuntimeException error) { throw new SecurityException(); }
        if (hostUri.getUserInfo() != null || hostUri.getPath() == null || !hostUri.getPath().isEmpty() || hostUri.getRawQuery() != null || hostUri.getRawFragment() != null
            || hostUri.getHost() == null || !Set.of("127.0.0.1", "localhost", "[::1]", "::1").contains(hostUri.getHost()) || hostUri.getPort() != exchange.getLocalAddress().getPort()) throw new SecurityException();
        if (exchange.getRequestHeaders().getFirst("Origin") != null || exchange.getRequestHeaders().getFirst("Referer") != null || exchange.getRequestHeaders().getFirst("Sec-Fetch-Site") != null) LocalPetAssistantGuard.require(exchange);
    }

    private static void rejectDuplicateKeys(String json) {
        Deque<Set<String>> levels = new ArrayDeque<>();
        for (int i=0;i<json.length();i++) {
            char c=json.charAt(i);
            if (c=='{' || c=='[') { levels.push(new HashSet<>()); if (levels.size()>64) throw new IllegalArgumentException(); }
            else if (c=='}' || c==']') { if (levels.isEmpty()) throw new IllegalArgumentException(); levels.pop(); }
            else if (c=='"') {
                int start=i;
                for (i++;i<json.length();i++) { if (json.charAt(i)=='\\') i++; else if (json.charAt(i)=='"') break; }
                if (i>=json.length()) throw new IllegalArgumentException();
                int next=i+1; while(next<json.length() && Character.isWhitespace(json.charAt(next))) next++;
                if (next<json.length() && json.charAt(next)==':') {
                    String key=(String)SimpleJson.parseStrict(json.substring(start,i+1));
                    if (levels.isEmpty() || !levels.peek().add(key)) throw new IllegalArgumentException();
                }
            }
        }
    }
}
