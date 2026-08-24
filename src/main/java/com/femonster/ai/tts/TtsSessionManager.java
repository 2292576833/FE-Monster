package com.femonster.ai.tts;

import java.io.InputStream;
import java.time.Clock;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;

/**
 * Local two-channel bridge: callers submit text through mutation methods while
 * a separate HTTP response consumes the blocking audio stream.
 */
public final class TtsSessionManager implements AutoCloseable {
    private static final Set<String> DOUBAO_AFFECT_EMOTIONS = Set.of(
        "", "happy", "angry", "sad", "fear", "affectionate", "disgusted", "excited"
    );
    private static final Map<String, String> DOUBAO_EMOTION_INSTRUCTIONS = Map.of(
        "", "",
        "happy", "以明亮、轻快但自然的语气表达",
        "angry", "以坚定、克制且清晰的语气表达",
        "sad", "以温柔、低缓且有陪伴感的语气表达",
        "fear", "以沉稳、安抚且清晰的语气表达",
        "affectionate", "以温暖、亲近但不过度煽情的语气表达",
        "disgusted", "以冷静、疏离且克制的语气表达",
        "excited", "以好奇、期待且有活力的语气表达"
    );
    private final Supplier<DoubaoV3Config> configSupplier;
    private final DoubaoV3Transport.Factory transportFactory;
    private final Duration sessionTtl;
    private final long maxBufferedAudioBytes;
    private final Clock clock;
    private final ScheduledExecutorService sweeper;
    private final Map<String, SessionRecord> sessions = new ConcurrentHashMap<>();
    private final Map<String, String> sessionIdsByRequestId = new ConcurrentHashMap<>();
    private final AtomicBoolean closed = new AtomicBoolean(false);

    public TtsSessionManager(
        Supplier<DoubaoV3Config> configSupplier,
        DoubaoV3Transport.Factory transportFactory,
        Duration sessionTtl,
        long maxBufferedAudioBytes
    ) {
        this(configSupplier, transportFactory, sessionTtl, maxBufferedAudioBytes, Clock.systemUTC());
    }

    public TtsSessionManager(
        Supplier<DoubaoV3Config> configSupplier,
        DoubaoV3Transport.Factory transportFactory,
        Duration sessionTtl,
        long maxBufferedAudioBytes,
        Clock clock
    ) {
        if (configSupplier == null || transportFactory == null) throw new IllegalArgumentException("TTS dependencies are required");
        if (sessionTtl == null || sessionTtl.isNegative() || sessionTtl.isZero()) {
            throw new IllegalArgumentException("TTS session TTL must be positive");
        }
        if (maxBufferedAudioBytes < 1) throw new IllegalArgumentException("TTS audio buffer limit must be positive");
        if (clock == null) throw new IllegalArgumentException("TTS clock is required");
        this.configSupplier = configSupplier;
        this.transportFactory = transportFactory;
        this.sessionTtl = sessionTtl;
        this.maxBufferedAudioBytes = maxBufferedAudioBytes;
        this.clock = clock;
        this.sweeper = Executors.newSingleThreadScheduledExecutor(task -> {
            Thread thread = new Thread(task, "fe-doubao-tts-ttl");
            thread.setDaemon(true);
            return thread;
        });
        long interval = Math.max(1_000L, Math.min(30_000L, sessionTtl.toMillis() / 2L));
        this.sweeper.scheduleWithFixedDelay(this::sweepExpiredQuietly, interval, interval, TimeUnit.MILLISECONDS);
    }

    public SessionSnapshot create(String requestId) {
        return create(requestId, null);
    }

    /** Creates one session with a bounded, non-persistent utterance override. */
    public SessionSnapshot create(String requestId, ProsodyOverride prosodyOverride) {
        ensureOpen();
        validateRequestId(requestId);
        String normalizedRequestId = requestId.trim();
        DoubaoV3Config persistedConfig = configSupplier.get();
        if (persistedConfig == null) throw new IllegalStateException("Doubao TTS is not configured");
        DoubaoV3Config config = prosodyOverride == null
            ? persistedConfig
            : prosodyOverride.applyTo(persistedConfig);
        Map<String, Object> appliedProsody = prosodyOverride == null
            ? Map.of()
            : prosodyOverride.toMap();
        String id = UUID.randomUUID().toString();
        String existingSessionId = sessionIdsByRequestId.putIfAbsent(normalizedRequestId, id);
        if (existingSessionId != null) {
            throw new IllegalArgumentException("duplicate TTS requestId");
        }
        try {
            return createReservedSession(id, normalizedRequestId, config, appliedProsody);
        } catch (RuntimeException | Error error) {
            sessions.remove(id);
            sessionIdsByRequestId.remove(normalizedRequestId, id);
            throw error;
        }
    }

    private SessionSnapshot createReservedSession(
        String id,
        String requestId,
        DoubaoV3Config config,
        Map<String, Object> appliedProsody
    ) {
        BoundedAudioPipe pipe = new BoundedAudioPipe(maxBufferedAudioBytes);
        SessionRecord[] holder = new SessionRecord[1];
        DoubaoV3Session upstream = new DoubaoV3Session(config, transportFactory, new DoubaoV3Session.Listener() {
            @Override
            public void onAudio(byte[] audio) {
                SessionRecord record = holder[0];
                record.touch();
                if (!record.pipe.offer(audio)) {
                    record.errorCode = "TTS_BACKPRESSURE_LIMIT";
                    record.pipe.fail("TTS audio consumer is too slow");
                    record.upstream.cancel();
                }
            }

            @Override
            public void onComplete() {
                SessionRecord record = holder[0];
                record.touch();
                record.pipe.complete();
            }

            @Override
            public void onFailure(String errorCode) {
                SessionRecord record = holder[0];
                record.errorCode = errorCode;
                record.touch();
                record.pipe.fail("TTS provider session failed");
            }
        });
        SessionRecord record = new SessionRecord(
            id,
            requestId,
            config.output().format().contentType(),
            appliedProsody,
            pipe,
            upstream
        );
        holder[0] = record;
        sessions.put(id, record);
        upstream.start();
        return record.snapshot();
    }

    public SessionSnapshot appendText(String sessionId, long sequence, String text) {
        SessionRecord record = requireRecord(sessionId);
        record.upstream.appendText(sequence, text);
        record.touch();
        return record.snapshot();
    }

    public SessionSnapshot finish(String sessionId) {
        SessionRecord record = requireRecord(sessionId);
        record.upstream.finish();
        record.touch();
        return record.snapshot();
    }

    public AudioStream openAudio(String sessionId) {
        SessionRecord record = requireRecord(sessionId);
        record.touch();
        return new AudioStream(record.contentType, record.pipe.open());
    }

    public SessionSnapshot status(String sessionId) {
        return requireRecord(sessionId).snapshot();
    }

    public boolean delete(String sessionId) {
        if (sessionId == null) return false;
        SessionRecord record = sessions.remove(sessionId.trim());
        if (record == null) return false;
        sessionIdsByRequestId.remove(record.requestId, record.id);
        record.errorCode = "TTS_SESSION_CANCELED";
        record.upstream.cancel();
        record.pipe.fail("TTS session was canceled");
        return true;
    }

    /** Removes sessions that have had no bridge activity for the configured TTL. */
    public int sweepExpired() {
        ensureOpen();
        long cutoff = clock.millis() - sessionTtl.toMillis();
        int removed = 0;
        for (Map.Entry<String, SessionRecord> entry : sessions.entrySet()) {
            SessionRecord record = entry.getValue();
            if (record.lastTouched > cutoff || !sessions.remove(entry.getKey(), record)) continue;
            sessionIdsByRequestId.remove(record.requestId, record.id);
            record.errorCode = "TTS_SESSION_EXPIRED";
            record.upstream.cancel();
            record.pipe.fail("TTS session expired");
            removed++;
        }
        return removed;
    }

    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) return;
        sweeper.shutdownNow();
        for (SessionRecord record : sessions.values()) {
            record.upstream.cancel();
            record.pipe.fail("TTS session manager closed");
        }
        sessions.clear();
        sessionIdsByRequestId.clear();
    }

    private SessionRecord requireRecord(String sessionId) {
        ensureOpen();
        String id = sessionId == null ? "" : sessionId.trim();
        SessionRecord record = sessions.get(id);
        if (record == null) throw new IllegalArgumentException("unknown TTS session");
        return record;
    }

    private void ensureOpen() {
        if (closed.get()) throw new IllegalStateException("TTS session manager is closed");
    }

    private static void validateRequestId(String requestId) {
        String value = requestId == null ? "" : requestId.trim();
        if (value.isEmpty() || value.length() > 128 || !value.matches("[A-Za-z0-9._:-]+")) {
            throw new IllegalArgumentException("invalid TTS requestId");
        }
    }

    private void sweepExpiredQuietly() {
        if (closed.get()) return;
        try {
            sweepExpired();
        } catch (RuntimeException ignored) {
        }
    }

    public record ProsodyOverride(String emotion, int emotionScale, int speechRate, int loudnessRate) {
        public ProsodyOverride {
            emotion = emotion == null ? "" : emotion.trim().toLowerCase();
            if (!DOUBAO_AFFECT_EMOTIONS.contains(emotion)) {
                throw new IllegalArgumentException("unsupported AffectPlan emotion");
            }
            if (emotionScale < 1 || emotionScale > 5) {
                throw new IllegalArgumentException("emotionScale must be 1..5");
            }
            if (speechRate < -50 || speechRate > 100) {
                throw new IllegalArgumentException("speechRate must be -50..100");
            }
            if (loudnessRate < -50 || loudnessRate > 100) {
                throw new IllegalArgumentException("loudnessRate must be -50..100");
            }
        }

        private DoubaoV3Config applyTo(DoubaoV3Config base) {
            return new DoubaoV3Config(
                base.resourceId(),
                base.modelVariant(),
                base.speaker(),
                base.output(),
                new DoubaoV3Config.Prosody(
                    DOUBAO_EMOTION_INSTRUCTIONS.get(emotion),
                    emotionScale,
                    speechRate,
                    loudnessRate
                ),
                base.credential()
            );
        }

        public Map<String, Object> toMap() {
            return Map.of(
                "emotion", emotion,
                "emotionScale", emotionScale,
                "speechRate", speechRate,
                "loudnessRate", loudnessRate
            );
        }
    }

    public record SessionSnapshot(
        String sessionId,
        String requestId,
        String state,
        String contentType,
        boolean hasAudio,
        long bufferedAudioBytes,
        String errorCode,
        Map<String, Object> prosodyOverride,
        long expiresAt
    ) {
        public SessionSnapshot {
            prosodyOverride = prosodyOverride == null ? Map.of() : Map.copyOf(prosodyOverride);
        }

        public Map<String, Object> toMap() {
            LinkedHashMap<String, Object> result = new LinkedHashMap<>();
            result.put("ok", errorCode == null || errorCode.isBlank());
            result.put("sessionId", sessionId);
            result.put("requestId", requestId);
            result.put("state", state);
            result.put("contentType", contentType);
            result.put("hasAudio", hasAudio);
            result.put("bufferedAudioBytes", bufferedAudioBytes);
            result.put("errorCode", errorCode == null ? "" : errorCode);
            result.put("prosodyOverride", prosodyOverride);
            result.put("expiresAt", expiresAt);
            return result;
        }
    }

    public record AudioStream(String contentType, InputStream stream) {}

    private final class SessionRecord {
        private final String id;
        private final String requestId;
        private final String contentType;
        private final Map<String, Object> prosodyOverride;
        private final BoundedAudioPipe pipe;
        private final DoubaoV3Session upstream;
        private volatile String errorCode = "";
        private volatile long lastTouched = clock.millis();

        private SessionRecord(
            String id,
            String requestId,
            String contentType,
            Map<String, Object> prosodyOverride,
            BoundedAudioPipe pipe,
            DoubaoV3Session upstream
        ) {
            this.id = id;
            this.requestId = requestId;
            this.contentType = contentType;
            this.prosodyOverride = prosodyOverride == null ? Map.of() : Map.copyOf(prosodyOverride);
            this.pipe = pipe;
            this.upstream = upstream;
        }

        private void touch() {
            lastTouched = clock.millis();
        }

        private SessionSnapshot snapshot() {
            String state = errorCode.isBlank() ? upstream.stateName() :
                "TTS_SESSION_CANCELED".equals(errorCode) ? "canceled" : "failed";
            return new SessionSnapshot(
                id,
                requestId,
                state,
                contentType,
                upstream.firstAudio(),
                pipe.bufferedBytes(),
                errorCode,
                prosodyOverride,
                lastTouched + sessionTtl.toMillis()
            );
        }
    }
}
