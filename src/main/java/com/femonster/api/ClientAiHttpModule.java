package com.femonster.api;

import com.femonster.ai.AiProviderCatalog;
import com.femonster.ai.tts.TtsSessionManager;
import com.femonster.core.ClientAiException;
import com.femonster.core.ClientAiGateway;
import com.femonster.http.HttpUtil;
import com.femonster.json.SimpleJson;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Owns the complete local Client-AI HTTP namespace.
 *
 * <p>The caller handles global OPTIONS and error mapping. The sole instance
 * interface reports whether this module claimed the current route.</p>
 */
final class ClientAiHttpModule {
    private static final int MAX_REQUEST_BYTES = 2 * 1024 * 1024 + 64 * 1024;
    private static final long MAX_TTS_STREAM_BYTES = 64L * 1024 * 1024;
    private static final String TTS_SESSION_PREFIX = "/api/client-ai/tts/sessions/";
    private static final Set<String> TTS_CREATE_FIELDS = Set.of("requestId", "prosodyOverride");
    private static final Set<String> TTS_PROSODY_FIELDS = Set.of(
        "emotion", "emotionScale", "speechRate", "loudnessRate"
    );

    private final ClientAiGateway gateway;
    private final TtsSessionManager ttsSessions;

    ClientAiHttpModule(ClientAiGateway gateway, TtsSessionManager ttsSessions) {
        this.gateway = gateway;
        this.ttsSessions = ttsSessions;
    }

    boolean tryHandle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        String method = exchange.getRequestMethod().toUpperCase();
        if (!path.startsWith("/api/client-ai/") || "OPTIONS".equals(method)) return false;
        LocalPetAssistantGuard.require(exchange);

        if ("GET".equals(method)) {
            if ("/api/client-ai/config".equals(path)) {
                noStore(exchange);
                HttpUtil.sendJson(exchange, gateway.snapshot());
                return true;
            }
            if ("/api/client-ai/providers".equals(path)) {
                noStore(exchange);
                HttpUtil.sendJson(exchange, AiProviderCatalog.snapshot());
                return true;
            }
            if (path.startsWith(TTS_SESSION_PREFIX)) {
                noStore(exchange);
                if (path.endsWith("/audio")) {
                    handleTtsAudio(exchange, ttsSessionId(path, "audio"));
                } else {
                    HttpUtil.sendJson(exchange, sessionPayload(
                        ttsSessions.status(ttsSessionId(path, ""))
                    ));
                }
                return true;
            }
            HttpUtil.notFound(exchange);
            return true;
        }

        if ("POST".equals(method)) {
            handlePost(exchange, path);
            return true;
        }

        if ("DELETE".equals(method) && path.startsWith(TTS_SESSION_PREFIX)) {
            String sessionId = ttsSessionId(path, "");
            HttpUtil.sendJson(exchange, Map.of(
                "ok", true,
                "sessionId", sessionId,
                "deleted", ttsSessions.delete(sessionId)
            ));
            return true;
        }

        HttpUtil.sendJson(exchange, 405, HttpUtil.error("method not allowed"));
        return true;
    }

    private void handlePost(HttpExchange exchange, String path) throws IOException {
        byte[] requestBytes = exchange.getRequestBody().readNBytes(MAX_REQUEST_BYTES + 1);
        if (requestBytes.length > MAX_REQUEST_BYTES) {
            throw ClientAiException.tooLarge("client AI request");
        }
        Map<String, Object> root = SimpleJson.parseObjectStrict(
            new String(requestBytes, StandardCharsets.UTF_8)
        );
        noStore(exchange);

        if ("/api/client-ai/tts/sessions".equals(path)) {
            if (!TTS_CREATE_FIELDS.containsAll(root.keySet())) {
                throw ClientAiException.bad("client TTS session contains unsupported fields");
            }
            String requestId = SimpleJson.asString(root.get("requestId"), "");
            TtsSessionManager.ProsodyOverride prosodyOverride = ttsProsodyOverride(
                root.get("prosodyOverride")
            );
            HttpUtil.sendJson(exchange, sessionPayload(
                ttsSessions.create(requestId, prosodyOverride)
            ));
            return;
        }
        if (path.startsWith(TTS_SESSION_PREFIX)) {
            if (path.endsWith("/text")) {
                String sessionId = ttsSessionId(path, "text");
                long sequence = SimpleJson.asLong(root.get("sequence"), -1);
                String text = SimpleJson.asString(root.get("text"), "");
                HttpUtil.sendJson(exchange, sessionPayload(
                    ttsSessions.appendText(sessionId, sequence, text)
                ));
                return;
            }
            if (path.endsWith("/finish")) {
                HttpUtil.sendJson(exchange, sessionPayload(
                    ttsSessions.finish(ttsSessionId(path, "finish"))
                ));
                return;
            }
        }
        switch (path) {
            case "/api/client-ai/config" -> HttpUtil.sendJson(exchange, gateway.configure(root));
            case "/api/client-ai/cancel" -> {
                String requestId = SimpleJson.asString(root.get("requestId"), "");
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("ok", true);
                body.put("cancelled", gateway.cancel(requestId));
                body.put("requestId", requestId);
                HttpUtil.sendJson(exchange, body);
            }
            case "/api/client-ai/chat", "/api/client-ai/tts" -> {
                if (root.containsKey("baseUrl") || root.containsKey("apiKey") || root.containsKey("config")) {
                    throw ClientAiException.bad(
                        "client AI endpoint and credential are owned by the installed client"
                    );
                }
                ClientAiGateway.Kind kind = path.endsWith("/tts")
                    ? ClientAiGateway.Kind.TTS
                    : ClientAiGateway.Kind.CHAT;
                String requestId = SimpleJson.asString(root.get("requestId"), "");
                handleUpstream(exchange, kind, SimpleJson.asMap(root.get("payload")), requestId);
            }
            default -> HttpUtil.notFound(exchange);
        }
    }

    private void handleTtsAudio(HttpExchange exchange, String sessionId) throws IOException {
        TtsSessionManager.AudioStream audio = ttsSessions.openAudio(sessionId);
        String contentType = audio.contentType();
        if (contentType == null || !contentType.toLowerCase().startsWith("audio/")) {
            ttsSessions.delete(sessionId);
            throw ClientAiException.transientError("豆包实时语音返回了无效的音频类型");
        }
        HttpUtil.addCors(exchange);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        noStore(exchange);
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.sendResponseHeaders(200, 0);
        try (InputStream input = audio.stream(); OutputStream output = exchange.getResponseBody()) {
            byte[] buffer = new byte[8192];
            long total = 0;
            int read;
            while ((read = input.read(buffer)) >= 0) {
                total += read;
                if (total > MAX_TTS_STREAM_BYTES) {
                    ttsSessions.delete(sessionId);
                    throw ClientAiException.tooLarge("client TTS stream");
                }
                output.write(buffer, 0, read);
                output.flush();
            }
        } catch (IOException error) {
            ttsSessions.delete(sessionId);
            throw error;
        }
    }

    private static Map<String, Object> sessionPayload(TtsSessionManager.SessionSnapshot snapshot) {
        LinkedHashMap<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("sessionId", snapshot.sessionId());
        body.put("requestId", snapshot.requestId());
        body.put("state", snapshot.state());
        body.put("contentType", snapshot.contentType());
        body.put("hasAudio", snapshot.hasAudio());
        body.put("bufferedAudioBytes", snapshot.bufferedAudioBytes());
        body.put("errorCode", snapshot.errorCode());
        body.put("prosodyOverride", snapshot.prosodyOverride());
        body.put("expiresAt", snapshot.expiresAt());
        return body;
    }

    private static TtsSessionManager.ProsodyOverride ttsProsodyOverride(Object raw) {
        if (raw == null) return null;
        if (!(raw instanceof Map<?, ?>)) {
            throw ClientAiException.bad("client TTS prosodyOverride must be an object");
        }
        Map<String, Object> override = SimpleJson.asMap(raw);
        if (!TTS_PROSODY_FIELDS.equals(override.keySet())) {
            throw ClientAiException.bad("client TTS prosodyOverride fields are invalid");
        }
        String emotion = SimpleJson.asString(override.get("emotion"), "");
        int emotionScale = ttsOverrideInteger(override.get("emotionScale"), "emotionScale");
        int speechRate = ttsOverrideInteger(override.get("speechRate"), "speechRate");
        int loudnessRate = ttsOverrideInteger(override.get("loudnessRate"), "loudnessRate");
        try {
            return new TtsSessionManager.ProsodyOverride(
                emotion, emotionScale, speechRate, loudnessRate
            );
        } catch (IllegalArgumentException error) {
            throw ClientAiException.bad("client TTS prosodyOverride is out of range");
        }
    }

    private static int ttsOverrideInteger(Object raw, String label) {
        if (!(raw instanceof Number number)) {
            throw ClientAiException.bad("client TTS " + label + " must be an integer");
        }
        double value = number.doubleValue();
        if (!Double.isFinite(value) || value != Math.rint(value)
            || value < Integer.MIN_VALUE || value > Integer.MAX_VALUE) {
            throw ClientAiException.bad("client TTS " + label + " must be an integer");
        }
        return (int) value;
    }

    private static String ttsSessionId(String path, String action) {
        if (path == null || !path.startsWith(TTS_SESSION_PREFIX)) {
            throw ClientAiException.bad("invalid TTS session path");
        }
        String rest = path.substring(TTS_SESSION_PREFIX.length());
        if (action != null && !action.isBlank()) {
            String suffix = "/" + action;
            if (!rest.endsWith(suffix)) throw ClientAiException.bad("invalid TTS session action");
            rest = rest.substring(0, rest.length() - suffix.length());
        }
        if (!rest.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
            throw ClientAiException.bad("invalid TTS session id");
        }
        return rest.toLowerCase();
    }

    private void handleUpstream(
        HttpExchange exchange,
        ClientAiGateway.Kind kind,
        Map<String, Object> payload,
        String requestId
    ) throws IOException {
        try (ClientAiGateway.UpstreamResponse response = gateway.execute(kind, payload, requestId)) {
            if (!response.streaming()) {
                HttpUtil.sendBytes(exchange, response.status(), response.contentType(), response.body());
                return;
            }
            HttpUtil.addCors(exchange);
            exchange.getResponseHeaders().set("Content-Type", response.contentType());
            exchange.sendResponseHeaders(response.status(), 0);
            try (OutputStream output = exchange.getResponseBody()) {
                byte[] buffer = new byte[8192];
                long total = 0;
                int read;
                while ((read = response.stream().read(buffer)) >= 0) {
                    total += read;
                    if (total > ClientAiGateway.MAX_STREAM_BYTES) {
                        throw ClientAiException.tooLarge("client AI stream");
                    }
                    output.write(buffer, 0, read);
                    output.flush();
                }
            } catch (IOException disconnected) {
                gateway.cancel(requestId);
            }
        }
    }

    private static void noStore(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
    }
}
