package com.femonster.api;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import com.sun.net.httpserver.HttpServer;

public final class SseProxyPumpProbe {
    private SseProxyPumpProbe() {
    }

    public static void main(String[] args) throws Exception {
        copiesActiveHeartbeatStream();
        streamsLocalhostChunksBeforeUpstreamCompletes();
        retiresHalfOpenUpstream();
        System.out.println("SseProxyPumpProbe passed");
    }

    private static void copiesActiveHeartbeatStream() throws Exception {
        byte[] fixture = (
            "event: community-heartbeat\n" +
            "data: {\"serverTime\":1700000000000}\n\n"
        ).getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        SseProxyPump.CopyResult result = SseProxyPump.copy(
            new PulsedInputStream(fixture, 18L),
            output,
            Duration.ofMillis(80)
        );
        require(result.bytesCopied() == fixture.length, "active stream byte count changed");
        require(output.toString(StandardCharsets.UTF_8).equals(new String(fixture, StandardCharsets.UTF_8)),
            "active heartbeat stream was not copied exactly");
    }

    private static void streamsLocalhostChunksBeforeUpstreamCompletes() throws Exception {
        byte[] first = (
            "event: community\n" +
            "data: {\"type\":\"pet.ai.delta\",\"payload\":{\"delta\":\"first\"}}\n\n"
        ).getBytes(StandardCharsets.UTF_8);
        byte[] second = (
            "id: 2\n" +
            "event: community\n" +
            "data: {\"seq\":2,\"type\":\"pet.ai.complete\"}\n\n"
        ).getBytes(StandardCharsets.UTF_8);
        CountDownLatch firstUpstreamWrite = new CountDownLatch(1);
        CountDownLatch allowUpstreamFinish = new CountDownLatch(1);
        CountDownLatch upstreamFinished = new CountDownLatch(1);
        HttpServer upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        ExecutorService upstreamExecutor = Executors.newSingleThreadExecutor();
        ExecutorService pumpExecutor = Executors.newSingleThreadExecutor();
        upstream.createContext("/events", exchange -> {
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
            exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-transform");
            exchange.sendResponseHeaders(200, 0);
            try (OutputStream body = exchange.getResponseBody()) {
                body.write(first);
                body.flush();
                firstUpstreamWrite.countDown();
                if (!allowUpstreamFinish.await(2, TimeUnit.SECONDS)) {
                    throw new IOException("fixture was not released");
                }
                body.write(second);
                body.flush();
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new IOException("fixture interrupted", error);
            } finally {
                upstreamFinished.countDown();
                exchange.close();
            }
        });
        upstream.setExecutor(upstreamExecutor);
        upstream.start();

        try {
            HttpResponse<InputStream> response = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(2))
                .build()
                .send(
                    HttpRequest.newBuilder(URI.create(
                        "http://127.0.0.1:" + upstream.getAddress().getPort() + "/events"
                    )).GET().build(),
                    HttpResponse.BodyHandlers.ofInputStream()
                );
            require(response.statusCode() == 200, "localhost SSE fixture did not open");
            require(firstUpstreamWrite.await(500, TimeUnit.MILLISECONDS), "localhost fixture did not write its first token");

            ObservingOutputStream downstream = new ObservingOutputStream();
            CompletableFuture<SseProxyPump.CopyResult> copy = CompletableFuture.supplyAsync(() -> {
                try (InputStream input = response.body()) {
                    return SseProxyPump.copy(input, downstream, Duration.ofSeconds(2));
                } catch (IOException error) {
                    throw new RuntimeException(error);
                }
            }, pumpExecutor);

            require(downstream.firstWrite.await(500, TimeUnit.MILLISECONDS),
                "the Java community proxy buffered the first model token until completion");
            require(upstreamFinished.getCount() == 1,
                "the first downstream chunk was not observable while the upstream stream remained open");
            require(downstream.toString(StandardCharsets.UTF_8).contains("pet.ai.delta"),
                "the first downstream chunk did not contain the model delta");

            allowUpstreamFinish.countDown();
            SseProxyPump.CopyResult result = copy.get(2, TimeUnit.SECONDS);
            byte[] expected = new byte[first.length + second.length];
            System.arraycopy(first, 0, expected, 0, first.length);
            System.arraycopy(second, 0, expected, first.length, second.length);
            require(result.bytesCopied() == expected.length, "localhost SSE byte count changed");
            require(downstream.toString(StandardCharsets.UTF_8).equals(new String(expected, StandardCharsets.UTF_8)),
                "localhost SSE chunks were not copied exactly");
        } finally {
            allowUpstreamFinish.countDown();
            upstream.stop(0);
            upstreamExecutor.shutdownNow();
            pumpExecutor.shutdownNow();
        }
    }

    private static void retiresHalfOpenUpstream() throws Exception {
        BlockingInputStream input = new BlockingInputStream();
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        long startedAt = System.nanoTime();
        boolean timedOut = false;
        try {
            SseProxyPump.copy(input, output, Duration.ofMillis(60));
        } catch (SseProxyPump.IdleTimeoutException expected) {
            timedOut = true;
        }
        long elapsedMs = (System.nanoTime() - startedAt) / 1_000_000L;
        require(timedOut, "a half-open upstream must fail with an observable idle timeout");
        require(input.closed, "idle timeout must close the upstream response body");
        require(elapsedMs >= 40L && elapsedMs < 500L,
            "half-open detection exceeded its deterministic bound: " + elapsedMs + " ms");
        require(output.size() == 0, "a stalled upstream must not invent SSE bytes");
    }

    private static final class PulsedInputStream extends InputStream {
        private final byte[] data;
        private final long delayMs;
        private int offset;

        private PulsedInputStream(byte[] data, long delayMs) {
            this.data = data;
            this.delayMs = delayMs;
        }

        @Override
        public int read(byte[] target, int targetOffset, int length) throws IOException {
            if (offset >= data.length) return -1;
            try {
                Thread.sleep(delayMs);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                throw new IOException("fixture interrupted", error);
            }
            int count = Math.min(Math.min(length, 9), data.length - offset);
            System.arraycopy(data, offset, target, targetOffset, count);
            offset += count;
            return count;
        }

        @Override
        public int read() throws IOException {
            byte[] single = new byte[1];
            int read = read(single, 0, 1);
            return read < 0 ? -1 : single[0] & 0xff;
        }
    }

    private static final class BlockingInputStream extends InputStream {
        private boolean closed;

        @Override
        public synchronized int read(byte[] target, int offset, int length) throws IOException {
            while (!closed) {
                try {
                    wait();
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                    throw new IOException("fixture interrupted", error);
                }
            }
            throw new IOException("fixture closed");
        }

        @Override
        public int read() throws IOException {
            byte[] single = new byte[1];
            return read(single, 0, 1) < 0 ? -1 : single[0] & 0xff;
        }

        @Override
        public synchronized void close() {
            closed = true;
            notifyAll();
        }
    }

    private static final class ObservingOutputStream extends ByteArrayOutputStream {
        private final CountDownLatch firstWrite = new CountDownLatch(1);

        @Override
        public synchronized void write(byte[] value, int offset, int length) {
            super.write(value, offset, length);
            if (length > 0) firstWrite.countDown();
        }

        @Override
        public synchronized void write(int value) {
            super.write(value);
            firstWrite.countDown();
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
