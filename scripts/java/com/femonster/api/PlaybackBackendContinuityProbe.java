package com.femonster.api;

import com.femonster.core.PlayerService;
import com.femonster.http.HttpUtil;
import com.femonster.json.SimpleJson;
import com.femonster.model.Song;
import com.femonster.music.MusicProviderClient;
import com.femonster.music.MusicProviderRegistry;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Exercises the production backend seam used during normal browser playback:
 *
 * <ol>
 *   <li>PlayerService resolves a URL once.</li>
 *   <li>AudioStreamProxy continuously relays the audio response.</li>
 *   <li>PlayerService.state() is polled concurrently at a much higher rate than production.</li>
 * </ol>
 *
 * The optional --inject-stall control deliberately starves the upstream stream.
 * That mode must fail with the same observable symptom: stream bytes and the
 * derived playback progress both stop advancing for longer than the threshold.
 */
public final class PlaybackBackendContinuityProbe {
    private static final int CHUNK_COUNT = 60;
    private static final int CHUNK_SIZE = 32 * 1024;
    private static final int NORMAL_CHUNK_DELAY_MS = 25;
    private static final int INJECTED_STALL_MS = 480;
    private static final double MAX_CONTINUOUS_GAP_MS = 220.0;

    private PlaybackBackendContinuityProbe() {
    }

    public static void main(String[] args) throws Exception {
        boolean injectStall = args.length > 0 && "--inject-stall".equals(args[0]);
        Path tempRoot = Files.createTempDirectory("fe-monster-backend-continuity-");
        HttpServer upstream = null;
        HttpServer backend = null;
        ExecutorService upstreamExecutor = Executors.newCachedThreadPool();
        ExecutorService backendExecutor = Executors.newCachedThreadPool();
        ExecutorService pollExecutor = Executors.newSingleThreadExecutor();
        boolean probePassed = false;

        try {
            upstream = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            upstream.setExecutor(upstreamExecutor);
            upstream.createContext("/audio", exchange -> serveTimedAudio(exchange, injectStall));
            upstream.start();

            String upstreamAudioUrl = "http://127.0.0.1:"
                + upstream.getAddress().getPort()
                + "/audio";
            CountingProvider provider = new CountingProvider(upstreamAudioUrl);
            PlayerService player = new PlayerService(
                tempRoot.resolve("player-state.json"),
                new MusicProviderRegistry(provider)
            );
            Song song = fixtureSong();
            Map<String, Object> loaded = player.load(song, "standard");

            HttpClient fixtureClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(2))
                .build();
            AudioStreamProxy streamProxy = new AudioStreamProxy(fixtureClient, ignored -> true);
            backend = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            backend.setExecutor(backendExecutor);
            backend.createContext("/api/audio/stream", exchange ->
                streamProxy.handle(exchange, HttpUtil.query(exchange)));
            backend.createContext("/api/player/state", exchange ->
                HttpUtil.sendJson(exchange, player.state()));
            backend.start();

            String backendBase = "http://127.0.0.1:" + backend.getAddress().getPort();
            AtomicBoolean streamFinished = new AtomicBoolean(false);
            AtomicInteger stateSamples = new AtomicInteger();
            AtomicInteger minimumPosition = new AtomicInteger(Integer.MAX_VALUE);
            AtomicInteger maximumPosition = new AtomicInteger(Integer.MIN_VALUE);
            AtomicBoolean monotonicState = new AtomicBoolean(true);
            AtomicBoolean stableStateUrl = new AtomicBoolean(true);
            AtomicLong maximumStateLatencyNanos = new AtomicLong();

            Future<?> poller = pollExecutor.submit(() -> pollPlayerState(
                fixtureClient,
                backendBase,
                upstreamAudioUrl,
                streamFinished,
                stateSamples,
                minimumPosition,
                maximumPosition,
                monotonicState,
                stableStateUrl,
                maximumStateLatencyNanos
            ));

            StreamObservation observation;
            try {
                observation = consumeAudioStream(fixtureClient, backendBase, upstreamAudioUrl);
            } finally {
                streamFinished.set(true);
            }
            poller.get();

            int expectedBytes = CHUNK_COUNT * CHUNK_SIZE;
            boolean streamComplete = observation.bytesRead() == expectedBytes;
            boolean continuousStream = observation.maximumReadGapMs() <= MAX_CONTINUOUS_GAP_MS;
            boolean statePollingHealthy = stateSamples.get() >= 10
                && monotonicState.get()
                && stableStateUrl.get()
                && maximumPosition.get() > minimumPosition.get();
            boolean urlResolvedOnlyOnce = provider.songUrlCalls.get() == 1;
            boolean playerRemainedPlayable = Boolean.TRUE.equals(loaded.get("playable"));
            boolean pass = streamComplete
                && continuousStream
                && statePollingHealthy
                && urlResolvedOnlyOnce
                && playerRemainedPlayable;
            probePassed = pass;

            Map<String, Object> report = new LinkedHashMap<>();
            report.put("pass", pass);
            report.put("injectedStall", injectStall);
            report.put("symptom", "audio bytes and derived progress freeze together");
            report.put("streamBytes", observation.bytesRead());
            report.put("expectedBytes", expectedBytes);
            report.put("streamReadSamples", observation.readSamples());
            report.put("maximumStreamGapMs", roundMillis(observation.maximumReadGapMs()));
            report.put("continuityThresholdMs", MAX_CONTINUOUS_GAP_MS);
            report.put("stateSamples", stateSamples.get());
            report.put("statePositionMin", minimumPosition.get());
            report.put("statePositionMax", maximumPosition.get());
            report.put(
                "maximumStateLatencyMs",
                roundMillis(maximumStateLatencyNanos.get() / 1_000_000.0)
            );
            report.put("stateMonotonic", monotonicState.get());
            report.put("stateUrlStable", stableStateUrl.get());
            report.put("songUrlResolutionCalls", provider.songUrlCalls.get());
            report.put("checks", Map.of(
                "streamComplete", streamComplete,
                "continuousStream", continuousStream,
                "statePollingHealthy", statePollingHealthy,
                "urlResolvedOnlyOnce", urlResolvedOnlyOnce,
                "playerRemainedPlayable", playerRemainedPlayable
            ));
            System.out.println(SimpleJson.stringify(report));
        } finally {
            if (backend != null) backend.stop(0);
            if (upstream != null) upstream.stop(0);
            pollExecutor.shutdownNow();
            backendExecutor.shutdownNow();
            upstreamExecutor.shutdownNow();
            deleteTree(tempRoot);
        }
        if (!probePassed) System.exit(1);
    }

    private static void pollPlayerState(
        HttpClient client,
        String backendBase,
        String expectedUrl,
        AtomicBoolean streamFinished,
        AtomicInteger samples,
        AtomicInteger minimumPosition,
        AtomicInteger maximumPosition,
        AtomicBoolean monotonic,
        AtomicBoolean stableUrl,
        AtomicLong maximumLatency
    ) {
        int previousPosition = -1;
        while (!streamFinished.get() || samples.get() < 10) {
            try {
                long startedAt = System.nanoTime();
                HttpResponse<String> response = client.send(
                    HttpRequest.newBuilder(URI.create(backendBase + "/api/player/state"))
                        .timeout(Duration.ofSeconds(2))
                        .GET()
                        .build(),
                    HttpResponse.BodyHandlers.ofString()
                );
                maximumLatency.accumulateAndGet(
                    System.nanoTime() - startedAt,
                    Math::max
                );
                Map<String, Object> state = SimpleJson.parseObject(response.body());
                int position = SimpleJson.asInt(state.get("position"), -1);
                String url = SimpleJson.asString(state.get("url"), "");
                if (previousPosition > position) monotonic.set(false);
                previousPosition = position;
                minimumPosition.accumulateAndGet(position, Math::min);
                maximumPosition.accumulateAndGet(position, Math::max);
                if (!expectedUrl.equals(url)) stableUrl.set(false);
                samples.incrementAndGet();
                Thread.sleep(10);
            } catch (Exception error) {
                monotonic.set(false);
                return;
            }
        }
    }

    private static StreamObservation consumeAudioStream(
        HttpClient client,
        String backendBase,
        String upstreamAudioUrl
    ) throws IOException, InterruptedException {
        URI uri = URI.create(
            backendBase
                + "/api/audio/stream?url="
                + URLEncoder.encode(upstreamAudioUrl, StandardCharsets.UTF_8)
        );
        HttpResponse<InputStream> response = client.send(
            HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(5)).GET().build(),
            HttpResponse.BodyHandlers.ofInputStream()
        );
        if (response.statusCode() != 200) {
            throw new IOException("audio proxy returned HTTP " + response.statusCode());
        }

        byte[] buffer = new byte[8 * 1024];
        int bytesRead = 0;
        int samples = 0;
        long previousReadAt = 0;
        double maximumGapMs = 0;
        try (InputStream input = response.body()) {
            int read;
            while ((read = input.read(buffer)) >= 0) {
                if (read == 0) continue;
                long readAt = System.nanoTime();
                if (previousReadAt > 0) {
                    maximumGapMs = Math.max(
                        maximumGapMs,
                        (readAt - previousReadAt) / 1_000_000.0
                    );
                }
                previousReadAt = readAt;
                bytesRead += read;
                samples++;
            }
        }
        return new StreamObservation(bytesRead, samples, maximumGapMs);
    }

    private static void serveTimedAudio(HttpExchange exchange, boolean injectStall) throws IOException {
        int totalBytes = CHUNK_COUNT * CHUNK_SIZE;
        exchange.getResponseHeaders().set("Content-Type", "audio/mpeg");
        exchange.getResponseHeaders().set("Accept-Ranges", "bytes");
        exchange.sendResponseHeaders(200, totalBytes);
        byte[] chunk = new byte[CHUNK_SIZE];
        for (int index = 0; index < chunk.length; index++) {
            chunk[index] = (byte) ((index * 31 + 17) & 0xff);
        }
        try (var output = exchange.getResponseBody()) {
            for (int chunkIndex = 0; chunkIndex < CHUNK_COUNT; chunkIndex++) {
                if (injectStall && chunkIndex == CHUNK_COUNT / 2) {
                    sleep(INJECTED_STALL_MS);
                }
                output.write(chunk);
                output.flush();
                sleep(NORMAL_CHUNK_DELAY_MS);
            }
        }
    }

    private static Song fixtureSong() {
        Song song = new Song();
        song.id = "backend-continuity-fixture";
        song.title = "Backend continuity fixture";
        song.provider = "fixture";
        song.duration = 180;
        return song;
    }

    private static void sleep(long milliseconds) throws IOException {
        try {
            Thread.sleep(milliseconds);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new IOException("fixture stream interrupted", error);
        }
    }

    private static double roundMillis(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private static void deleteTree(Path root) {
        if (root == null || !Files.exists(root)) return;
        try (var paths = Files.walk(root)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException ignored) {
                }
            });
        } catch (IOException ignored) {
        }
    }

    private record StreamObservation(int bytesRead, int readSamples, double maximumReadGapMs) {
    }

    private static final class CountingProvider implements MusicProviderClient {
        private final String audioUrl;
        private final AtomicInteger songUrlCalls = new AtomicInteger();

        private CountingProvider(String audioUrl) {
            this.audioUrl = audioUrl;
        }

        @Override
        public String id() {
            return "fixture";
        }

        @Override
        public String label() {
            return "Fixture";
        }

        @Override
        public String baseUrl() {
            return audioUrl;
        }

        @Override
        public Map<String, Object> serviceStatus() {
            return Map.of("ok", true);
        }

        @Override
        public Map<String, Object> accountPayload() {
            return Map.of();
        }

        @Override
        public void rememberBrowserSession(Map<String, String> cookies) {
        }

        @Override
        public Map<String, Object> search(String keyword, int page, int limit) {
            return Map.of();
        }

        @Override
        public String songUrl(String id, String quality) {
            songUrlCalls.incrementAndGet();
            return audioUrl;
        }

        @Override
        public Map<String, Object> songUrlPayload(String id, String quality) {
            songUrlCalls.incrementAndGet();
            return Map.of("playable", true, "url", audioUrl);
        }

        @Override
        public Map<String, Object> lyricPayload(String songId) {
            return Map.of();
        }

        @Override
        public Map<String, Object> userPlaylistsPayload() {
            return Map.of();
        }

        @Override
        public Map<String, Object> recommendedPlaylistsPayload(int limit) {
            return Map.of();
        }

        @Override
        public Map<String, Object> playlistTracksPayload(String playlistId, int limit) {
            return Map.of();
        }

        @Override
        public Map<String, Object> addSongToPlaylistPayload(String playlistId, Song song) {
            return Map.of();
        }

        @Override
        public Map<String, Object> commentsPayload(String songId, int limit) {
            return Map.of();
        }
    }
}
