package com.femonster.http;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.zip.GZIPOutputStream;

public final class StaticFileHandler implements HttpHandler {
    private static final int MIN_GZIP_BYTES = 1024;
    private static final ConcurrentMap<Path, CachedGzip> GZIP_CACHE = new ConcurrentHashMap<>();
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
        String method = exchange.getRequestMethod().toUpperCase();
        if (!"GET".equals(method) && !"HEAD".equals(method)) {
            HttpUtil.sendJson(exchange, 405, HttpUtil.error("method not allowed"));
            return;
        }

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

        String type = contentType(target);
        long size = Files.size(target);
        long modified = Files.getLastModifiedTime(target).toMillis();
        String etag = '"' + Long.toHexString(modified) + '-' + Long.toHexString(size) + '"';
        HttpUtil.addCors(exchange);
        exchange.getResponseHeaders().set("Content-Type", type);
        exchange.getResponseHeaders().set("ETag", etag);
        if (type.startsWith("text/html")) {
            exchange.getResponseHeaders().set("Cache-Control", "no-store, max-age=0");
            exchange.getResponseHeaders().set("Pragma", "no-cache");
        } else if (hasVersionToken(exchange)) {
            exchange.getResponseHeaders().set("Cache-Control", "public, max-age=31536000, immutable");
        } else {
            exchange.getResponseHeaders().set("Cache-Control", "public, max-age=86400");
        }
        if (etag.equals(exchange.getRequestHeaders().getFirst("If-None-Match"))) {
            exchange.sendResponseHeaders(304, -1);
            exchange.close();
            return;
        }

        boolean gzip = size >= MIN_GZIP_BYTES && isCompressible(type) && acceptsGzip(exchange);
        byte[] gzipBytes = gzip ? gzip(target, modified, size) : null;
        long responseLength = gzipBytes == null ? size : gzipBytes.length;
        if (gzipBytes != null) {
            exchange.getResponseHeaders().set("Content-Encoding", "gzip");
            exchange.getResponseHeaders().set("Vary", "Accept-Encoding");
        }
        if ("HEAD".equals(method)) {
            exchange.getResponseHeaders().set("Content-Length", String.valueOf(responseLength));
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
            return;
        }

        exchange.sendResponseHeaders(200, responseLength);
        try (OutputStream output = exchange.getResponseBody()) {
            if (gzipBytes != null) output.write(gzipBytes);
            else Files.copy(target, output);
        }
    }

    private static boolean hasVersionToken(HttpExchange exchange) {
        String query = exchange.getRequestURI().getRawQuery();
        return query != null && query.matches("(?:^|.*&)v=[^&]+(?:&.*|$)");
    }

    private static boolean acceptsGzip(HttpExchange exchange) {
        String value = exchange.getRequestHeaders().getFirst("Accept-Encoding");
        return value != null && value.toLowerCase().contains("gzip");
    }

    private static boolean isCompressible(String contentType) {
        return contentType.startsWith("text/")
            || contentType.startsWith("application/json")
            || contentType.startsWith("image/svg+xml");
    }

    private static byte[] gzip(Path target, long modified, long size) throws IOException {
        CachedGzip cached = GZIP_CACHE.get(target);
        if (cached != null && cached.modified == modified && cached.size == size) return cached.bytes;
        ByteArrayOutputStream buffer = new ByteArrayOutputStream((int) Math.min(Integer.MAX_VALUE, Math.max(1024, size / 3)));
        try (GZIPOutputStream gzip = new GZIPOutputStream(buffer)) {
            Files.copy(target, gzip);
        }
        byte[] bytes = buffer.toByteArray();
        GZIP_CACHE.put(target, new CachedGzip(modified, size, bytes));
        return bytes;
    }

    private static String contentType(Path path) {
        String name = path.getFileName().toString().toLowerCase();
        for (Map.Entry<String, String> entry : CONTENT_TYPES.entrySet()) {
            if (name.endsWith(entry.getKey())) return entry.getValue();
        }
        return "application/octet-stream";
    }

    private record CachedGzip(long modified, long size, byte[] bytes) {
    }
}
