package com.femonster.http;

import com.femonster.json.SimpleJson;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

public final class HttpUtil {
    private HttpUtil() {
    }

    public static Map<String, String> query(HttpExchange exchange) {
        Map<String, String> params = new LinkedHashMap<>();
        String raw = exchange.getRequestURI().getRawQuery();
        if (raw == null || raw.isBlank()) return params;
        for (String pair : raw.split("&")) {
            if (pair.isEmpty()) continue;
            int eq = pair.indexOf('=');
            String key = eq >= 0 ? pair.substring(0, eq) : pair;
            String value = eq >= 0 ? pair.substring(eq + 1) : "";
            params.put(decode(key), decode(value));
        }
        return params;
    }

    public static String readBody(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }

    public static void sendJson(HttpExchange exchange, Object value) throws IOException {
        sendJson(exchange, 200, value);
    }

    public static void sendJson(HttpExchange exchange, int status, Object value) throws IOException {
        send(exchange, status, "application/json; charset=utf-8", SimpleJson.stringify(value).getBytes(StandardCharsets.UTF_8));
    }

    public static void sendRawJson(HttpExchange exchange, int status, String json) throws IOException {
        send(exchange, status, "application/json; charset=utf-8", (json == null ? "null" : json).getBytes(StandardCharsets.UTF_8));
    }

    public static void sendText(HttpExchange exchange, int status, String text) throws IOException {
        send(exchange, status, "text/plain; charset=utf-8", text.getBytes(StandardCharsets.UTF_8));
    }

    public static void sendBytes(HttpExchange exchange, int status, String contentType, byte[] bytes) throws IOException {
        send(exchange, status, contentType, bytes);
    }

    public static void sendNoContent(HttpExchange exchange) throws IOException {
        addCors(exchange);
        exchange.sendResponseHeaders(204, -1);
        exchange.close();
    }

    public static void notFound(HttpExchange exchange) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", false);
        body.put("error", "not found");
        sendJson(exchange, 404, body);
    }

    public static boolean handleOptions(HttpExchange exchange) throws IOException {
        if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendNoContent(exchange);
            return true;
        }
        return false;
    }

    public static String param(Map<String, String> params, String name, String fallback) {
        String value = params.get(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    public static int intParam(Map<String, String> params, String name, int fallback, int min, int max) {
        try {
            int parsed = Integer.parseInt(param(params, name, String.valueOf(fallback)));
            return Math.max(min, Math.min(max, parsed));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    public static double doubleParam(Map<String, String> params, String name, double fallback, double min, double max) {
        try {
            double parsed = Double.parseDouble(param(params, name, String.valueOf(fallback)));
            return Math.max(min, Math.min(max, parsed));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    public static Map<String, Object> ok() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        return body;
    }

    public static Map<String, Object> error(String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", false);
        body.put("error", message);
        return body;
    }

    public static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    public static void addCors(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
    }

    private static void send(HttpExchange exchange, int status, String contentType, byte[] bytes) throws IOException {
        addCors(exchange);
        exchange.getResponseHeaders().set("Content-Type", contentType);
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
