package com.femonster.api;

import com.femonster.http.HttpUtil;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Predicate;

final class AudioStreamProxy {
    private static final int MAX_REDIRECTS = 5;
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(20);
    private static final List<String> REQUEST_HEADERS = List.of("Range", "If-Range", "User-Agent");
    private static final List<String> RESPONSE_HEADERS = List.of(
        "Content-Type",
        "Content-Range",
        "Accept-Ranges",
        "ETag",
        "Last-Modified"
    );

    private final HttpClient client;
    private final Predicate<URI> uriPolicy;

    AudioStreamProxy() {
        this(
            HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(8))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build(),
            AudioStreamProxy::isPublicHttpUri
        );
    }

    AudioStreamProxy(HttpClient client, Predicate<URI> uriPolicy) {
        this.client = Objects.requireNonNull(client, "client");
        this.uriPolicy = Objects.requireNonNull(uriPolicy, "uriPolicy");
    }

    void handle(HttpExchange exchange, Map<String, String> query) throws IOException {
        boolean responseStarted = false;
        try {
            String method = exchange.getRequestMethod().toUpperCase();
            if (!"GET".equals(method) && !"HEAD".equals(method)) {
                HttpUtil.sendJson(exchange, 405, HttpUtil.error("audio stream only supports GET and HEAD"));
                return;
            }

            URI target = parseTarget(HttpUtil.param(query, "url", ""));
            HttpResponse<InputStream> upstream = sendFollowingRedirects(exchange, target, method);
            try (InputStream input = upstream.body()) {
                int status = upstream.statusCode();
                copyResponseHeaders(upstream, exchange);
                long contentLength = contentLength(upstream);
                if (contentLength >= 0) {
                    exchange.getResponseHeaders().set("Content-Length", String.valueOf(contentLength));
                }
                HttpUtil.addCors(exchange);

                if ("HEAD".equals(method) || bodyless(status) || contentLength == 0) {
                    exchange.sendResponseHeaders(status, -1);
                    responseStarted = true;
                    return;
                }

                exchange.sendResponseHeaders(status, contentLength >= 0 ? contentLength : 0);
                responseStarted = true;
                try (OutputStream output = exchange.getResponseBody()) {
                    input.transferTo(output);
                }
            }
        } catch (IllegalArgumentException e) {
            if (!responseStarted) {
                HttpUtil.sendJson(exchange, 400, HttpUtil.error(message(e, "invalid audio stream URL")));
            }
        } catch (SecurityException e) {
            if (!responseStarted) {
                HttpUtil.sendJson(exchange, 403, HttpUtil.error(message(e, "audio stream URL is blocked")));
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            if (!responseStarted) {
                HttpUtil.sendJson(exchange, 502, HttpUtil.error("audio stream proxy interrupted"));
            }
        } catch (IOException e) {
            if (!responseStarted) {
                HttpUtil.sendJson(exchange, 502, HttpUtil.error("audio stream proxy failed"));
            }
        } finally {
            exchange.close();
        }
    }

    private HttpResponse<InputStream> sendFollowingRedirects(
        HttpExchange exchange,
        URI initialTarget,
        String method
    ) throws IOException, InterruptedException {
        URI target = initialTarget;
        for (int redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
            requireAllowed(target);
            HttpRequest.Builder request = HttpRequest.newBuilder(target).timeout(REQUEST_TIMEOUT);
            if ("HEAD".equals(method)) {
                request.method("HEAD", HttpRequest.BodyPublishers.noBody());
            } else {
                request.GET();
            }
            copyRequestHeaders(exchange, request);

            HttpResponse<InputStream> response = client.send(
                request.build(),
                HttpResponse.BodyHandlers.ofInputStream()
            );
            if (!isRedirect(response.statusCode())) return response;

            try (InputStream ignored = response.body()) {
                if (redirectCount == MAX_REDIRECTS) {
                    throw new IOException("too many audio stream redirects");
                }
                String location = response.headers().firstValue("Location")
                    .orElseThrow(() -> new IOException("audio stream redirect has no location"));
                target = parseTarget(target.resolve(location).toString());
            }
        }
        throw new IOException("too many audio stream redirects");
    }

    private void requireAllowed(URI target) {
        if (!uriPolicy.test(target)) {
            throw new SecurityException("audio stream URL is not a public internet address");
        }
    }

    private static URI parseTarget(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("audio stream url is required");
        }
        URI uri = URI.create(value.trim()).normalize();
        String scheme = uri.getScheme();
        if (scheme == null
            || (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme))) {
            throw new IllegalArgumentException("audio stream url must use http or https");
        }
        if (!uri.isAbsolute() || uri.getHost() == null || uri.getHost().isBlank()) {
            throw new IllegalArgumentException("audio stream url must include a valid host");
        }
        if (uri.getUserInfo() != null || uri.getFragment() != null) {
            throw new IllegalArgumentException("audio stream url contains unsupported credentials or fragment");
        }
        return uri;
    }

    static boolean isPublicHttpUri(URI uri) {
        try {
            URI target = parseTarget(uri == null ? "" : uri.toString());
            String host = target.getHost().toLowerCase();
            if (host.equals("localhost")
                || host.endsWith(".localhost")
                || host.equals("metadata")
                || host.equals("metadata.google.internal")
                || host.endsWith(".internal")
                || host.endsWith(".local")) {
                return false;
            }
            InetAddress[] addresses = InetAddress.getAllByName(host);
            if (addresses.length == 0) return false;
            for (InetAddress address : addresses) {
                if (!isPublicAddress(address)) return false;
            }
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private static boolean isPublicAddress(InetAddress address) {
        if (address.isAnyLocalAddress()
            || address.isLoopbackAddress()
            || address.isLinkLocalAddress()
            || address.isSiteLocalAddress()
            || address.isMulticastAddress()) {
            return false;
        }

        byte[] bytes = address.getAddress();
        if (bytes.length == 4) return isPublicIpv4(bytes, 0);
        if (bytes.length != 16) return false;

        int first = unsigned(bytes[0]);
        int second = unsigned(bytes[1]);
        if ((first & 0xfe) == 0xfc) return false;
        if (first == 0x20 && second == 0x01
            && unsigned(bytes[2]) == 0x0d && unsigned(bytes[3]) == 0xb8) {
            return false;
        }
        if (isIpv4Mapped(bytes) || isIpv4Compatible(bytes)) return isPublicIpv4(bytes, 12);
        if (first == 0x00 && second == 0x64 && unsigned(bytes[2]) == 0xff
            && unsigned(bytes[3]) == 0x9b) {
            return false;
        }
        if (first == 0x20 && second == 0x02) {
            return isPublicIpv4(bytes, 2);
        }
        return true;
    }

    private static boolean isPublicIpv4(byte[] bytes, int offset) {
        int a = unsigned(bytes[offset]);
        int b = unsigned(bytes[offset + 1]);
        int c = unsigned(bytes[offset + 2]);
        if (a == 0 || a == 10 || a == 127 || a >= 224) return false;
        if (a == 100 && b >= 64 && b <= 127) return false;
        if (a == 169 && b == 254) return false;
        if (a == 172 && b >= 16 && b <= 31) return false;
        if (a == 192 && b == 168) return false;
        if (a == 192 && b == 0 && c == 0) return false;
        if (a == 192 && b == 88 && c == 99) return false;
        if (a == 192 && b == 0 && c == 2) return false;
        if (a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100))) return false;
        return !(a == 203 && b == 0 && c == 113);
    }

    private static boolean isIpv4Mapped(byte[] bytes) {
        for (int index = 0; index < 10; index++) {
            if (bytes[index] != 0) return false;
        }
        return unsigned(bytes[10]) == 0xff && unsigned(bytes[11]) == 0xff;
    }

    private static boolean isIpv4Compatible(byte[] bytes) {
        for (int index = 0; index < 12; index++) {
            if (bytes[index] != 0) return false;
        }
        return true;
    }

    private static int unsigned(byte value) {
        return value & 0xff;
    }

    private static void copyRequestHeaders(HttpExchange exchange, HttpRequest.Builder request) {
        for (String name : REQUEST_HEADERS) {
            String value = exchange.getRequestHeaders().getFirst(name);
            if (value != null && !value.isBlank()) request.header(name, value);
        }
    }

    private static void copyResponseHeaders(
        HttpResponse<InputStream> response,
        HttpExchange exchange
    ) {
        for (String name : RESPONSE_HEADERS) {
            List<String> values = response.headers().allValues(name);
            if (!values.isEmpty()) {
                exchange.getResponseHeaders().put(name, new ArrayList<>(values));
            }
        }
    }

    private static long contentLength(HttpResponse<?> response) {
        try {
            return response.headers().firstValueAsLong("Content-Length").orElse(-1);
        } catch (NumberFormatException ignored) {
            return -1;
        }
    }

    private static boolean isRedirect(int status) {
        return status == 301 || status == 302 || status == 303 || status == 307 || status == 308;
    }

    private static boolean bodyless(int status) {
        return status >= 100 && status < 200 || status == 204 || status == 304;
    }

    private static String message(Exception error, String fallback) {
        String message = error.getMessage();
        return message == null || message.isBlank() ? fallback : message;
    }
}
