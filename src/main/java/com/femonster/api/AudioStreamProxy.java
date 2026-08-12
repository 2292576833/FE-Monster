package com.femonster.api;

import com.femonster.http.HttpUtil;
import com.sun.net.httpserver.HttpExchange;

import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class AudioStreamProxy {
    private static final int MAX_REDIRECTS = 5;
    private static final int MAX_RESUME_ATTEMPTS = 2;
    private static final int COPY_BUFFER_BYTES = 64 * 1024;
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(20);
    private static final Duration BODY_IDLE_TIMEOUT = Duration.ofSeconds(2);
    private static final Pattern CONTENT_RANGE = Pattern.compile(
        "^bytes\\s+(\\d+)-(\\d+)/(\\d+|\\*)$",
        Pattern.CASE_INSENSITIVE
    );
    private static final List<String> REQUEST_HEADERS = List.of("Range", "If-Range", "User-Agent");
    private static final List<String> RESPONSE_HEADERS = List.of(
        "Content-Type",
        "Content-Range",
        "Accept-Ranges",
        "ETag",
        "Last-Modified"
    );
    private static final ExecutorService BODY_READERS = Executors.newCachedThreadPool(task -> {
        Thread thread = new Thread(task, "fe-audio-proxy-reader");
        thread.setDaemon(true);
        return thread;
    });

    private volatile HttpClient client;
    private final Predicate<URI> uriPolicy;
    private final AtomicLong streams = new AtomicLong();
    private final AtomicLong bytesForwarded = new AtomicLong();
    private final AtomicLong resumeAttempts = new AtomicLong();
    private final AtomicLong resumedStreams = new AtomicLong();
    private final AtomicLong resumeFailures = new AtomicLong();
    private final AtomicLong bodyIdleTimeouts = new AtomicLong();

    AudioStreamProxy() {
        this.client = null;
        this.uriPolicy = AudioStreamProxy::isPublicHttpUri;
    }

    AudioStreamProxy(HttpClient client, Predicate<URI> uriPolicy) {
        this.client = Objects.requireNonNull(client, "client");
        this.uriPolicy = Objects.requireNonNull(uriPolicy, "uriPolicy");
    }

    Map<String, Object> status() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("streams", streams.get());
        body.put("bytesForwarded", bytesForwarded.get());
        body.put("resumeAttempts", resumeAttempts.get());
        body.put("resumedStreams", resumedStreams.get());
        body.put("resumeFailures", resumeFailures.get());
        body.put("bodyIdleTimeouts", bodyIdleTimeouts.get());
        body.put("maxResumeAttempts", MAX_RESUME_ATTEMPTS);
        body.put("bodyIdleTimeoutMs", BODY_IDLE_TIMEOUT.toMillis());
        return body;
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
            try {
                int status = upstream.statusCode();
                copyResponseHeaders(upstream, exchange);
                normalizeAudioResponseHeaders(upstream, exchange, status);
                StreamPlan plan = StreamPlan.from(upstream);
                long responseLength = plan.expectedBytes();
                if (responseLength >= 0) {
                    exchange.getResponseHeaders().set("Content-Length", String.valueOf(responseLength));
                }
                HttpUtil.addCors(exchange);

                if ("HEAD".equals(method) || bodyless(status) || responseLength == 0) {
                    upstream.body().close();
                    exchange.sendResponseHeaders(status, -1);
                    responseStarted = true;
                    return;
                }

                exchange.sendResponseHeaders(status, responseLength >= 0 ? responseLength : 0);
                responseStarted = true;
                streams.incrementAndGet();
                try (OutputStream output = exchange.getResponseBody()) {
                    copyWithSafeResume(exchange, upstream, output, plan);
                }
            } finally {
                upstream.body().close();
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
        return sendFollowingRedirects(exchange, initialTarget, method, null, null);
    }

    private HttpResponse<InputStream> sendFollowingRedirects(
        HttpExchange exchange,
        URI initialTarget,
        String method,
        String range,
        String ifRange
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
            if (range == null) {
                copyRequestHeaders(exchange, request);
            } else {
                copyRequestHeader(exchange, request, "User-Agent");
                request.header("Range", range);
                request.header("If-Range", ifRange);
            }

            HttpResponse<InputStream> response = httpClient().send(
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

    private HttpClient httpClient() {
        HttpClient current = client;
        if (current != null) return current;
        synchronized (this) {
            current = client;
            if (current == null) {
                current = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(8))
                    .followRedirects(HttpClient.Redirect.NEVER)
                    .build();
                client = current;
            }
        }
        return current;
    }

    private void copyWithSafeResume(
        HttpExchange exchange,
        HttpResponse<InputStream> initial,
        OutputStream output,
        StreamPlan plan
    ) throws IOException, InterruptedException {
        HttpResponse<InputStream> response = initial;
        long written = 0;
        int attempts = 0;
        IOException lastFailure = null;
        boolean resumed = false;

        while (true) {
            long remaining = plan.expectedBytes() < 0
                ? Long.MAX_VALUE
                : plan.expectedBytes() - written;
            try (InputStream input = response.body()) {
                written += copyObservable(input, output, remaining);
                lastFailure = null;
            } catch (SocketTimeoutException timeout) {
                bodyIdleTimeouts.incrementAndGet();
                lastFailure = timeout;
            } catch (IOException failure) {
                lastFailure = failure;
            }

            if (plan.expectedBytes() < 0 || written == plan.expectedBytes()) {
                if (resumed) resumedStreams.incrementAndGet();
                return;
            }
            if (written > plan.expectedBytes()) {
                throw new IOException("audio stream exceeded its declared range");
            }
            if (!plan.resumable() || attempts >= MAX_RESUME_ATTEMPTS) {
                if (attempts > 0) resumeFailures.incrementAndGet();
                if (lastFailure != null) throw lastFailure;
                throw new IOException("audio stream ended before its declared range");
            }

            attempts += 1;
            resumeAttempts.incrementAndGet();
            long nextOffset = Math.addExact(plan.startOffset(), written);
            HttpResponse<InputStream> resumedResponse;
            try {
                resumedResponse = sendFollowingRedirects(
                    exchange,
                    response.uri(),
                    "GET",
                    "bytes=" + nextOffset + "-",
                    plan.validator()
                );
                validateResumeResponse(resumedResponse, plan, nextOffset);
            } catch (IOException | InterruptedException failure) {
                resumeFailures.incrementAndGet();
                throw failure;
            }
            response = resumedResponse;
            resumed = true;
        }
    }

    private long copyObservable(
        InputStream input,
        OutputStream output,
        long maximumBytes
    ) throws IOException {
        ArrayBlockingQueue<BodyChunk> chunks = new ArrayBlockingQueue<>(3);
        var reader = BODY_READERS.submit(() -> readBody(input, chunks));
        long written = 0;
        boolean complete = false;
        try {
            while (true) {
                BodyChunk chunk;
                try {
                    chunk = chunks.poll(BODY_IDLE_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new InterruptedIOException("audio stream copy interrupted");
                }
                if (chunk == null) {
                    throw new SocketTimeoutException(
                        "audio upstream produced no bytes for " + BODY_IDLE_TIMEOUT.toMillis() + " ms"
                    );
                }
                if (chunk.failure() != null) throw chunk.failure();
                if (chunk.end()) {
                    complete = true;
                    return written;
                }
                if (chunk.bytes().length > maximumBytes - written) {
                    throw new IOException("audio upstream returned bytes beyond the declared range");
                }
                output.write(chunk.bytes());
                written += chunk.bytes().length;
                bytesForwarded.addAndGet(chunk.bytes().length);
                if (written == maximumBytes) {
                    complete = true;
                    return written;
                }
            }
        } finally {
            if (!complete) {
                try {
                    input.close();
                } catch (IOException ignored) {
                }
            }
            reader.cancel(true);
        }
    }

    private static void readBody(InputStream input, ArrayBlockingQueue<BodyChunk> chunks) {
        byte[] buffer = new byte[COPY_BUFFER_BYTES];
        try {
            while (true) {
                int read = input.read(buffer);
                if (read < 0) {
                    putChunk(chunks, BodyChunk.END);
                    return;
                }
                if (read == 0) continue;
                putChunk(chunks, new BodyChunk(Arrays.copyOf(buffer, read), null, false));
            }
        } catch (IOException failure) {
            putChunk(chunks, new BodyChunk(null, failure, false));
        }
    }

    private static void putChunk(ArrayBlockingQueue<BodyChunk> chunks, BodyChunk chunk) {
        try {
            chunks.put(chunk);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private static void validateResumeResponse(
        HttpResponse<InputStream> response,
        StreamPlan plan,
        long expectedStart
    ) throws IOException {
        ContentRange range = ContentRange.parse(response);
        boolean validatorMatches = plan.validatorHeader().isBlank()
            || plan.validator().equals(
                response.headers().firstValue(plan.validatorHeader()).orElse("")
            );
        if (response.statusCode() != 206
            || range == null
            || range.start() != expectedStart
            || (plan.totalBytes() >= 0 && range.total() != plan.totalBytes())
            || !validatorMatches) {
            response.body().close();
            throw new IOException("audio range resume response did not match the original stream");
        }
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
            copyRequestHeader(exchange, request, name);
        }
    }

    private static void copyRequestHeader(
        HttpExchange exchange,
        HttpRequest.Builder request,
        String name
    ) {
        String value = exchange.getRequestHeaders().getFirst(name);
        if (value != null && !value.isBlank()) request.header(name, value);
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

    private static void normalizeAudioResponseHeaders(
        HttpResponse<?> response,
        HttpExchange exchange,
        int status
    ) {
        String contentType = inferredAudioContentType(response.uri());
        if (contentType.isBlank()) {
            contentType = response.headers().firstValue("Content-Type")
                .map(AudioStreamProxy::baseMediaType)
                .orElse("");
        }
        if (!contentType.isBlank()) {
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        }

        boolean partialResponse = status == 206
            || response.headers().firstValue("Content-Range").filter(value -> !value.isBlank()).isPresent();
        if (partialResponse) {
            exchange.getResponseHeaders().set("Accept-Ranges", "bytes");
        }
        exchange.getResponseHeaders().set("Cache-Control", "no-transform");
    }

    private static String inferredAudioContentType(URI uri) {
        String path = uri == null || uri.getPath() == null ? "" : uri.getPath().toLowerCase();
        if (path.endsWith(".flac")) return "audio/flac";
        if (path.endsWith(".mp3")) return "audio/mpeg";
        if (path.endsWith(".m4a") || path.endsWith(".mp4")) return "audio/mp4";
        if (path.endsWith(".aac")) return "audio/aac";
        if (path.endsWith(".ogg") || path.endsWith(".oga")) return "audio/ogg";
        if (path.endsWith(".opus")) return "audio/opus";
        if (path.endsWith(".wav") || path.endsWith(".wave")) return "audio/wav";
        return "";
    }

    private static String baseMediaType(String value) {
        if (value == null) return "";
        int separator = value.indexOf(';');
        String type = (separator >= 0 ? value.substring(0, separator) : value).trim().toLowerCase();
        return type.startsWith("audio/") || "application/ogg".equals(type)
            ? type
            : "";
    }

    private static long contentLength(HttpResponse<?> response) {
        try {
            return response.headers().firstValueAsLong("Content-Length").orElse(-1);
        } catch (NumberFormatException ignored) {
            return -1;
        }
    }

    private record StreamPlan(
        long startOffset,
        long expectedBytes,
        long totalBytes,
        String validatorHeader,
        String validator,
        boolean resumable
    ) {
        private static StreamPlan from(HttpResponse<?> response) throws IOException {
            ContentRange range = ContentRange.parse(response);
            long declaredLength = contentLength(response);
            long expected = range == null ? declaredLength : range.length();
            if (range != null && declaredLength >= 0 && declaredLength != expected) {
                throw new IOException("audio Content-Length does not match Content-Range");
            }

            String etag = response.headers().firstValue("ETag").orElse("").trim();
            String lastModified = response.headers().firstValue("Last-Modified").orElse("").trim();
            String validatorHeader = "";
            String validator = "";
            if (!etag.isBlank() && !etag.regionMatches(true, 0, "W/", 0, 2)) {
                validatorHeader = "ETag";
                validator = etag;
            } else if (!lastModified.isBlank()) {
                validatorHeader = "Last-Modified";
                validator = lastModified;
            }

            boolean acceptsRanges = response.statusCode() == 206
                || response.headers().allValues("Accept-Ranges").stream()
                    .anyMatch(value -> "bytes".equalsIgnoreCase(value.trim()));
            long start = range == null ? 0 : range.start();
            long total = range == null ? declaredLength : range.total();
            return new StreamPlan(
                start,
                expected,
                total,
                validatorHeader,
                validator,
                expected >= 0 && acceptsRanges && !validator.isBlank()
            );
        }
    }

    private record ContentRange(long start, long end, long total) {
        private long length() {
            return end - start + 1;
        }

        private static ContentRange parse(HttpResponse<?> response) throws IOException {
            String value = response.headers().firstValue("Content-Range").orElse("").trim();
            if (value.isBlank()) return null;
            Matcher matcher = CONTENT_RANGE.matcher(value);
            if (!matcher.matches()) throw new IOException("invalid audio Content-Range");
            try {
                long start = Long.parseLong(matcher.group(1));
                long end = Long.parseLong(matcher.group(2));
                long total = "*".equals(matcher.group(3))
                    ? -1
                    : Long.parseLong(matcher.group(3));
                if (end < start || total == 0 || total > 0 && end >= total) {
                    throw new IOException("invalid audio Content-Range bounds");
                }
                return new ContentRange(start, end, total);
            } catch (NumberFormatException failure) {
                throw new IOException("invalid audio Content-Range number", failure);
            }
        }
    }

    private record BodyChunk(byte[] bytes, IOException failure, boolean end) {
        private static final BodyChunk END = new BodyChunk(null, null, true);
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
