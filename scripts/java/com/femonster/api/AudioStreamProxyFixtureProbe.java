package com.femonster.api;

import com.femonster.http.HttpUtil;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Predicate;

public final class AudioStreamProxyFixtureProbe {
    private static final byte[] AUDIO = fixtureAudio();

    private AudioStreamProxyFixtureProbe() {
    }

    public static void main(String[] args) throws Exception {
        Map<String, Boolean> checks = new LinkedHashMap<>();
        HttpServer upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        HttpServer proxyServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicReference<String> observedRange = new AtomicReference<>("");
        AtomicReference<String> observedIfRange = new AtomicReference<>("");
        AtomicReference<String> observedUserAgent = new AtomicReference<>("");
        AtomicReference<String> observedResumeRange = new AtomicReference<>("");
        AtomicReference<String> observedResumeIfRange = new AtomicReference<>("");
        AtomicInteger interruptedRequests = new AtomicInteger();
        AtomicInteger validationCount = new AtomicInteger();
        AtomicInteger blockedEndpointHits = new AtomicInteger();

        upstream.createContext("/audio", exchange -> serveAudio(
            exchange,
            observedRange,
            observedIfRange,
            observedUserAgent
        ));
        upstream.createContext("/redirect", exchange -> redirect(exchange, "/audio"));
        upstream.createContext("/disconnect-once", exchange -> serveInterruptedAudio(
            exchange,
            interruptedRequests,
            observedResumeRange,
            observedResumeIfRange
        ));
        upstream.createContext("/wrong-type.flac", AudioStreamProxyFixtureProbe::serveMislabelledFlac);
        upstream.createContext("/redirect-blocked", exchange -> redirect(exchange, "/blocked"));
        upstream.createContext("/blocked", exchange -> {
            blockedEndpointHits.incrementAndGet();
            serveBytes(exchange, 200, AUDIO, 0, AUDIO.length);
        });

        HttpClient fixtureClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
        Predicate<URI> allowFixture = uri -> {
            validationCount.incrementAndGet();
            return !"blocked".equals(lastPathSegment(uri));
        };
        AudioStreamProxy fixtureProxy = new AudioStreamProxy(fixtureClient, allowFixture);
        AudioStreamProxy strictProxy = new AudioStreamProxy();
        proxyServer.createContext("/api/audio/stream", exchange ->
            fixtureProxy.handle(exchange, HttpUtil.query(exchange)));
        proxyServer.createContext("/api/audio/strict", exchange ->
            strictProxy.handle(exchange, HttpUtil.query(exchange)));

        upstream.start();
        proxyServer.start();
        try {
            String upstreamBase = "http://127.0.0.1:" + upstream.getAddress().getPort();
            String proxyBase = "http://127.0.0.1:" + proxyServer.getAddress().getPort();

            HttpResponse<byte[]> full = send(proxyBase, "/api/audio/stream", upstreamBase + "/audio", null, null);
            checks.put("streamsFullBody", full.statusCode() == 200 && Arrays.equals(full.body(), AUDIO));
            checks.put("forwardsFullHeaders",
                "audio/flac".equals(full.headers().firstValue("Content-Type").orElse(""))
                    && String.valueOf(AUDIO.length).equals(full.headers().firstValue("Content-Length").orElse(""))
                    && "bytes".equals(full.headers().firstValue("Accept-Ranges").orElse(""))
                    && "\"fixture-v1\"".equals(full.headers().firstValue("ETag").orElse(""))
                    && full.headers().firstValue("Last-Modified").orElse("").contains("2015"));

            HttpResponse<byte[]> partial = send(
                proxyBase,
                "/api/audio/stream",
                upstreamBase + "/audio",
                "bytes=4096-8191",
                "\"fixture-v1\""
            );
            byte[] expectedRange = Arrays.copyOfRange(AUDIO, 4096, 8192);
            checks.put("streamsRangeBody",
                partial.statusCode() == 206 && Arrays.equals(partial.body(), expectedRange));
            checks.put("forwardsRangeHeaders",
                "bytes=4096-8191".equals(observedRange.get())
                    && "\"fixture-v1\"".equals(observedIfRange.get())
                    && "FE-Monster-OBR-Fixture/1.0".equals(observedUserAgent.get())
                    && ("bytes 4096-8191/" + AUDIO.length).equals(
                        partial.headers().firstValue("Content-Range").orElse("")
                    )
                    && "4096".equals(partial.headers().firstValue("Content-Length").orElse("")));

            boolean resumedInterruptedStream = false;
            try {
                HttpResponse<byte[]> resumed = send(
                    proxyBase,
                    "/api/audio/stream",
                    upstreamBase + "/disconnect-once",
                    "bytes=0-",
                    null
                );
                resumedInterruptedStream = resumed.statusCode() == 206
                    && Arrays.equals(resumed.body(), AUDIO)
                    && interruptedRequests.get() == 2
                    && "bytes=32768-".equals(observedResumeRange.get())
                    && "\"fixture-v1\"".equals(observedResumeIfRange.get());
            } catch (IOException ignored) {
            }
            checks.put("resumesInterruptedBodyWithValidatedRange", resumedInterruptedStream);

            HttpResponse<byte[]> correctedFlac = send(
                proxyBase,
                "/api/audio/stream",
                upstreamBase + "/wrong-type.flac?token=fixture",
                "bytes=0-63",
                null
            );
            checks.put("sanitizesBinaryAudioHeaders",
                correctedFlac.statusCode() == 206
                    && correctedFlac.body().length == 64
                    && "audio/flac".equals(correctedFlac.headers().firstValue("Content-Type").orElse(""))
                    && "bytes".equals(correctedFlac.headers().firstValue("Accept-Ranges").orElse(""))
                    && !correctedFlac.headers().firstValue("Content-Type").orElse("")
                        .toLowerCase().contains("charset="));

            HttpRequest headRequest = HttpRequest.newBuilder(proxyUri(
                    proxyBase,
                    "/api/audio/stream",
                    upstreamBase + "/audio"
                ))
                .method("HEAD", HttpRequest.BodyPublishers.noBody())
                .build();
            HttpResponse<Void> head = fixtureClient.send(headRequest, HttpResponse.BodyHandlers.discarding());
            checks.put("supportsHead",
                head.statusCode() == 200
                    && String.valueOf(AUDIO.length).equals(
                        head.headers().firstValue("Content-Length").orElse("")
                    ));

            int validationBeforeRedirect = validationCount.get();
            HttpResponse<byte[]> redirected = send(
                proxyBase,
                "/api/audio/stream",
                upstreamBase + "/redirect",
                null,
                null
            );
            checks.put("validatesAndFollowsRedirect",
                redirected.statusCode() == 200
                    && Arrays.equals(redirected.body(), AUDIO)
                    && validationCount.get() >= validationBeforeRedirect + 2);

            HttpResponse<byte[]> blockedRedirect = send(
                proxyBase,
                "/api/audio/stream",
                upstreamBase + "/redirect-blocked",
                null,
                null
            );
            checks.put("rejectsRedirectTarget",
                blockedRedirect.statusCode() == 403 && blockedEndpointHits.get() == 0);

            HttpResponse<byte[]> invalidScheme = send(
                proxyBase,
                "/api/audio/strict",
                "file:///etc/passwd",
                null,
                null
            );
            HttpResponse<byte[]> privateAddress = send(
                proxyBase,
                "/api/audio/strict",
                upstreamBase + "/audio",
                null,
                null
            );
            checks.put("rejectsInvalidScheme", invalidScheme.statusCode() == 400);
            checks.put("rejectsPrivateAddress", privateAddress.statusCode() == 403);
            checks.put("publicAddressPolicy",
                AudioStreamProxy.isPublicHttpUri(URI.create("https://8.8.8.8/audio"))
                    && !AudioStreamProxy.isPublicHttpUri(URI.create("http://127.0.0.1/audio"))
                    && !AudioStreamProxy.isPublicHttpUri(URI.create("http://2130706433/audio"))
                    && !AudioStreamProxy.isPublicHttpUri(
                        URI.create("http://[::ffff:127.0.0.1]/audio")
                    )
                    && !AudioStreamProxy.isPublicHttpUri(
                        URI.create("http://169.254.169.254/latest/meta-data")
                    ));

            boolean pass = checks.values().stream().allMatch(Boolean::booleanValue);
            System.out.println(report(pass, checks));
            if (!pass) System.exit(1);
        } finally {
            proxyServer.stop(0);
            upstream.stop(0);
        }
    }

    private static HttpResponse<byte[]> send(
        String proxyBase,
        String path,
        String target,
        String range,
        String ifRange
    ) throws IOException, InterruptedException {
        HttpRequest.Builder request = HttpRequest.newBuilder(proxyUri(proxyBase, path, target))
            .header("User-Agent", "FE-Monster-OBR-Fixture/1.0")
            .timeout(Duration.ofSeconds(5))
            .GET();
        if (range != null) request.header("Range", range);
        if (ifRange != null) request.header("If-Range", ifRange);
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofByteArray());
    }

    private static URI proxyUri(String proxyBase, String path, String target) {
        return URI.create(proxyBase + path + "?url=" + URLEncoder.encode(target, StandardCharsets.UTF_8));
    }

    private static void serveAudio(
        HttpExchange exchange,
        AtomicReference<String> observedRange,
        AtomicReference<String> observedIfRange,
        AtomicReference<String> observedUserAgent
    ) throws IOException {
        String range = exchange.getRequestHeaders().getFirst("Range");
        observedRange.set(range == null ? "" : range);
        observedIfRange.set(value(exchange, "If-Range"));
        observedUserAgent.set(value(exchange, "User-Agent"));

        if (range != null && range.startsWith("bytes=")) {
            String[] bounds = range.substring("bytes=".length()).split("-", 2);
            int start = Integer.parseInt(bounds[0]);
            int end = Math.min(Integer.parseInt(bounds[1]), AUDIO.length - 1);
            exchange.getResponseHeaders().set(
                "Content-Range",
                "bytes " + start + "-" + end + "/" + AUDIO.length
            );
            serveBytes(exchange, 206, AUDIO, start, end - start + 1);
            return;
        }
        serveBytes(exchange, 200, AUDIO, 0, AUDIO.length);
    }

    private static void serveBytes(
        HttpExchange exchange,
        int status,
        byte[] source,
        int offset,
        int length
    ) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "audio/flac");
        exchange.getResponseHeaders().set("Accept-Ranges", "bytes");
        exchange.getResponseHeaders().set("ETag", "\"fixture-v1\"");
        exchange.getResponseHeaders().set("Last-Modified", "Wed, 21 Oct 2015 07:28:00 GMT");
        if ("HEAD".equalsIgnoreCase(exchange.getRequestMethod())) {
            exchange.getResponseHeaders().set("Content-Length", String.valueOf(length));
            exchange.sendResponseHeaders(status, -1);
            exchange.close();
            return;
        }
        exchange.sendResponseHeaders(status, length);
        try (var output = exchange.getResponseBody()) {
            output.write(source, offset, length);
        }
    }

    private static void serveInterruptedAudio(
        HttpExchange exchange,
        AtomicInteger requests,
        AtomicReference<String> observedResumeRange,
        AtomicReference<String> observedResumeIfRange
    ) throws IOException {
        int request = requests.incrementAndGet();
        String range = value(exchange, "Range");
        if (request == 1 && "bytes=0-".equals(range)) {
            exchange.getResponseHeaders().set("Content-Type", "audio/flac");
            exchange.getResponseHeaders().set("Accept-Ranges", "bytes");
            exchange.getResponseHeaders().set("ETag", "\"fixture-v1\"");
            exchange.getResponseHeaders().set(
                "Content-Range",
                "bytes 0-" + (AUDIO.length - 1) + "/" + AUDIO.length
            );
            exchange.sendResponseHeaders(206, 0);
            try {
                exchange.getResponseBody().write(AUDIO, 0, 32768);
                exchange.getResponseBody().flush();
            } finally {
                exchange.close();
            }
            return;
        }

        observedResumeRange.set(range);
        observedResumeIfRange.set(value(exchange, "If-Range"));
        if (!"bytes=32768-".equals(range)) {
            exchange.sendResponseHeaders(416, -1);
            exchange.close();
            return;
        }
        exchange.getResponseHeaders().set(
            "Content-Range",
            "bytes 32768-" + (AUDIO.length - 1) + "/" + AUDIO.length
        );
        serveBytes(exchange, 206, AUDIO, 32768, AUDIO.length - 32768);
    }

    private static void serveMislabelledFlac(HttpExchange exchange) throws IOException {
        String range = exchange.getRequestHeaders().getFirst("Range");
        int start = 0;
        int end = AUDIO.length - 1;
        int status = 200;
        if (range != null && range.startsWith("bytes=")) {
            String[] bounds = range.substring("bytes=".length()).split("-", 2);
            start = Integer.parseInt(bounds[0]);
            if (bounds.length > 1 && !bounds[1].isBlank()) {
                end = Math.min(Integer.parseInt(bounds[1]), AUDIO.length - 1);
            }
            status = 206;
            exchange.getResponseHeaders().set(
                "Content-Range",
                "bytes " + start + "-" + end + "/" + AUDIO.length
            );
        }
        int length = end - start + 1;
        exchange.getResponseHeaders().set("Content-Type", "audio/mpeg; charset=UTF-8");
        exchange.sendResponseHeaders(status, length);
        try (var output = exchange.getResponseBody()) {
            output.write(AUDIO, start, length);
        }
    }

    private static void redirect(HttpExchange exchange, String location) throws IOException {
        exchange.getResponseHeaders().set("Location", location);
        exchange.sendResponseHeaders(302, -1);
        exchange.close();
    }

    private static String value(HttpExchange exchange, String header) {
        String value = exchange.getRequestHeaders().getFirst(header);
        return value == null ? "" : value;
    }

    private static String lastPathSegment(URI uri) {
        String path = uri.getPath();
        int slash = path == null ? -1 : path.lastIndexOf('/');
        return slash >= 0 ? path.substring(slash + 1) : "";
    }

    private static byte[] fixtureAudio() {
        byte[] bytes = new byte[256 * 1024];
        for (int index = 0; index < bytes.length; index++) {
            bytes[index] = (byte) ((index * 31 + 17) & 0xff);
        }
        return bytes;
    }

    private static String report(boolean pass, Map<String, Boolean> checks) {
        StringBuilder json = new StringBuilder("{\"pass\":").append(pass).append(",\"checks\":{");
        boolean first = true;
        for (Map.Entry<String, Boolean> entry : checks.entrySet()) {
            if (!first) json.append(',');
            first = false;
            json.append('"').append(entry.getKey()).append("\":").append(entry.getValue());
        }
        return json.append("}}").toString();
    }
}
