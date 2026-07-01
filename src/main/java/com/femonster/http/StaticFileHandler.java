package com.femonster.http;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

public final class StaticFileHandler implements HttpHandler {
    private static final Map<String, String> CONTENT_TYPES = Map.ofEntries(
        Map.entry(".html", "text/html; charset=utf-8"),
        Map.entry(".css", "text/css; charset=utf-8"),
        Map.entry(".js", "text/javascript; charset=utf-8"),
        Map.entry(".json", "application/json; charset=utf-8"),
        Map.entry(".png", "image/png"),
        Map.entry(".jpg", "image/jpeg"),
        Map.entry(".jpeg", "image/jpeg"),
        Map.entry(".svg", "image/svg+xml"),
        Map.entry(".ico", "image/x-icon"),
        Map.entry(".bin", "application/octet-stream"),
        Map.entry(".mp3", "audio/mpeg"),
        Map.entry(".wav", "audio/wav")
    );

    private final Path webRoot;

    public StaticFileHandler(Path webRoot) {
        this.webRoot = webRoot.toAbsolutePath().normalize();
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        if (HttpUtil.handleOptions(exchange)) return;

        String requestPath = exchange.getRequestURI().getPath();
        if (requestPath == null || requestPath.equals("/") || requestPath.isBlank()) {
            requestPath = "/index.html";
        }

        Path target = webRoot.resolve(requestPath.substring(1).replace('/', java.io.File.separatorChar)).normalize();
        if (!target.startsWith(webRoot) || !Files.exists(target) || Files.isDirectory(target)) {
            Path fallback = webRoot.resolve("index.html");
            if (Files.exists(fallback)) target = fallback;
            else {
                HttpUtil.sendText(exchange, 404, "FE Monster Java web root is empty.");
                return;
            }
        }

        byte[] bytes = Files.readAllBytes(target);
        String type = contentType(target);
        if (shouldDisableCache(type)) {
            exchange.getResponseHeaders().set("Cache-Control", "no-store, max-age=0");
            exchange.getResponseHeaders().set("Pragma", "no-cache");
        }
        HttpUtil.sendBytes(exchange, 200, type, bytes);
    }

    private static boolean shouldDisableCache(String contentType) {
        return contentType.startsWith("text/html")
            || contentType.startsWith("text/css")
            || contentType.startsWith("text/javascript");
    }

    private static String contentType(Path path) {
        String name = path.getFileName().toString().toLowerCase();
        for (Map.Entry<String, String> entry : CONTENT_TYPES.entrySet()) {
            if (name.endsWith(entry.getKey())) return entry.getValue();
        }
        return "application/octet-stream";
    }
}
