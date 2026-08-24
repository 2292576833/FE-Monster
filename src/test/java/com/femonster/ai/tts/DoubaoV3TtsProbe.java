package com.femonster.ai.tts;

import com.femonster.json.SimpleJson;

import java.io.InputStream;
import java.io.IOException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.HexFormat;

public final class DoubaoV3TtsProbe {
    private DoubaoV3TtsProbe() {}

    public static void main(String[] args) throws Exception {
        apiKeyAuthenticationIsExactAndRedacted();
        legacyAuthenticationIsExactAndMutuallyExclusive();
        protocolUsesOfficialBigEndianGoldenFrames();
        realtimeSessionStreamsAudioBeforeCompletion();
        perUtteranceAffectOverridesProsodyWithoutMutatingConfiguration();
        reconnectsAtMostOnceBeforeFirstAudioAndReplaysText();
        expiresAbandonedSessionsAndCancelsTheirTransport();
        productionTransportRejectsEveryNonOfficialEndpointBeforeConnecting();
        slowAudioConsumerTriggersHardBackpressureCancellation();
        System.out.println("DoubaoV3TtsProbe passed");
    }

    private static void perUtteranceAffectOverridesProsodyWithoutMutatingConfiguration() throws Exception {
        DoubaoV3Config config = new DoubaoV3Config(
            "seed-tts-2.0",
            "seed-tts-2.0-standard",
            "zh_female_gaolengyujie_uranus_bigtts",
            new DoubaoV3Config.AudioOutput(DoubaoV3Config.AudioFormat.MP3, 24000, 128000),
            new DoubaoV3Config.Prosody("持久配置保持不变", 2, 8, 6),
            new DoubaoV3Config.ApiKeyCredential("fixture-key")
        );
        FakeTransportFactory transport = new FakeTransportFactory();
        try (TtsSessionManager manager = new TtsSessionManager(
            () -> config, transport, Duration.ofMinutes(2), 1024
        )) {
            TtsSessionManager.ProsodyOverride override = new TtsSessionManager.ProsodyOverride(
                "sad", 5, -22, -10
            );
            TtsSessionManager.SessionSnapshot created = manager.create("affect-turn-1", override);
            require(created.prosodyOverride().equals(Map.of(
                "emotion", "sad",
                "emotionScale", 5,
                "speechRate", -22,
                "loudnessRate", -10
            )), "session snapshot does not echo the bounded applied override");

            String connectId = transport.headers.get(0).get("X-Api-Connect-Id");
            transport.server(fullServer(DoubaoV3Protocol.Event.CONNECTION_STARTED, "", connectId, json("{}")));
            DoubaoV3Protocol.Message startSession = DoubaoV3Protocol.decode(transport.lastSent());
            Map<String, Object> startJson = SimpleJson.parseObjectStrict(
                new String(startSession.payload(), StandardCharsets.UTF_8));
            Map<String, Object> requestParameters = SimpleJson.asMap(startJson.get("req_params"));
            Map<String, Object> audio = SimpleJson.asMap(requestParameters.get("audio_params"));
            require(((Number) audio.get("emotion_scale")).intValue() == 5,
                "per-utterance emotion scale did not reach Doubao");
            require(((Number) audio.get("speech_rate")).intValue() == -22,
                "per-utterance speech rate did not reach Doubao");
            require(((Number) audio.get("loudness_rate")).intValue() == -10,
                "per-utterance loudness did not reach Doubao");
            require(List.of("以温柔、低缓且有陪伴感的语气表达").equals(requestParameters.get("context_texts")),
                "the seven-emotion key was not mapped to a fixed safe Doubao instruction");
            require("持久配置保持不变".equals(config.prosody().emotion())
                    && config.prosody().emotionScale() == 2
                    && config.prosody().speechRate() == 8
                    && config.prosody().loudnessRate() == 6,
                "utterance override mutated persisted TTS configuration");
        }
        requireThrows(() -> new TtsSessionManager.ProsodyOverride(
            "https://attacker.invalid/", 4, 0, 0
        ), "AffectPlan emotion accepted arbitrary endpoint text");
    }

    private static void slowAudioConsumerTriggersHardBackpressureCancellation() throws Exception {
        DoubaoV3Config config = DoubaoV3Config.defaults(
            "zh_female_gaolengyujie_uranus_bigtts",
            new DoubaoV3Config.ApiKeyCredential("fixture-key")
        );
        FakeTransportFactory transport = new FakeTransportFactory();
        try (TtsSessionManager manager = new TtsSessionManager(
            () -> config, transport, Duration.ofMinutes(2), 4
        )) {
            String localSessionId = manager.create("slow-consumer").sessionId();
            String connectId = transport.headers.get(0).get("X-Api-Connect-Id");
            transport.server(fullServer(DoubaoV3Protocol.Event.CONNECTION_STARTED, "", connectId, json("{}")));
            String upstreamSessionId = DoubaoV3Protocol.decode(transport.lastSent()).sessionId();
            transport.server(fullServer(DoubaoV3Protocol.Event.SESSION_STARTED, upstreamSessionId, "", json("{}")));

            transport.server(audioServer(upstreamSessionId, new byte[] { 1, 2, 3 }));
            transport.server(audioServer(upstreamSessionId, new byte[] { 4, 5, 6 }));
            TtsSessionManager.SessionSnapshot status = manager.status(localSessionId);
            require("failed".equals(status.state()), "buffer overflow fails the local session");
            require("TTS_BACKPRESSURE_LIMIT".equals(status.errorCode()), "backpressure has a stable safe error code");
            require(eventOf(transport.lastSent()) == DoubaoV3Protocol.Event.CANCEL_SESSION,
                "backpressure explicitly cancels the provider session");
            require(transport.endpoints.size() == 1, "backpressure never reconnects after audio was emitted");
            require(transport.closedConnections == 1, "backpressure closes the upstream connection");
            try (InputStream failedAudio = manager.openAudio(localSessionId).stream()) {
                requireThrowsChecked(failedAudio::read, IOException.class,
                    "failed audio stream unblocks with a safe local error");
            }
        }
    }

    private static void productionTransportRejectsEveryNonOfficialEndpointBeforeConnecting() {
        JavaNetDoubaoV3TransportFactory factory = new JavaNetDoubaoV3TransportFactory();
        requireThrowsChecked(() -> factory.connect(
            URI.create("wss://example.com/api/v3/tts/bidirection"),
            Map.of(
                "X-Api-Key", "fixture-only",
                "X-Api-Resource-Id", "seed-tts-2.0",
                "X-Api-Connect-Id", "fixture-connect"
            ),
            new DoubaoV3Transport.Listener() {
                @Override public void onBinary(byte[] frame) {}
                @Override public void onClosed(int statusCode, String reason) {}
                @Override public void onFailure(Throwable error) {}
            }
        ), IOException.class, "non-official Doubao endpoint must fail before any handshake");
    }

    private static void expiresAbandonedSessionsAndCancelsTheirTransport() {
        DoubaoV3Config config = DoubaoV3Config.defaults(
            "zh_female_gaolengyujie_uranus_bigtts",
            new DoubaoV3Config.ApiKeyCredential("fixture-key")
        );
        FakeTransportFactory transport = new FakeTransportFactory();
        MutableClock clock = new MutableClock(1_000L);
        try (TtsSessionManager manager = new TtsSessionManager(
            () -> config, transport, Duration.ofSeconds(5), 1024, clock
        )) {
            String sessionId = manager.create("ttl-session").sessionId();
            clock.advance(Duration.ofSeconds(6));
            require(manager.sweepExpired() == 1, "TTL sweep removes one abandoned session");
            require(transport.closedConnections == 1, "TTL expiry closes the upstream transport");
            requireThrows(() -> manager.status(sessionId), "expired session is no longer addressable");
        }
    }

    private static void reconnectsAtMostOnceBeforeFirstAudioAndReplaysText() throws Exception {
        DoubaoV3Config config = DoubaoV3Config.defaults(
            "zh_female_gaolengyujie_uranus_bigtts",
            new DoubaoV3Config.ApiKeyCredential("fixture-key")
        );
        FakeTransportFactory transport = new FakeTransportFactory();
        try (TtsSessionManager manager = new TtsSessionManager(
            () -> config, transport, Duration.ofMinutes(2), 1024
        )) {
            String localSessionId = manager.create("retry-before-audio").sessionId();
            manager.appendText(localSessionId, 1, "需要重放的文本");
            transport.fail(new IOException("fixture disconnect"));

            require(transport.endpoints.size() == 2, "one replacement connection is opened before first audio");
            String firstConnectId = transport.headers.get(0).get("X-Api-Connect-Id");
            String secondConnectId = transport.headers.get(1).get("X-Api-Connect-Id");
            require(!firstConnectId.equals(secondConnectId), "reconnect never reuses X-Api-Connect-Id");
            require(eventOf(transport.lastSent()) == DoubaoV3Protocol.Event.START_CONNECTION,
                "replacement connection restarts the V3 state machine");

            transport.server(fullServer(DoubaoV3Protocol.Event.CONNECTION_STARTED, "", secondConnectId, json("{}")));
            String secondUpstreamSessionId = DoubaoV3Protocol.decode(transport.lastSent()).sessionId();
            transport.server(fullServer(DoubaoV3Protocol.Event.SESSION_STARTED, secondUpstreamSessionId, "", json("{}")));
            DoubaoV3Protocol.Message replay = DoubaoV3Protocol.decode(transport.lastSent());
            require(replay.event() == DoubaoV3Protocol.Event.TASK_REQUEST, "queued text is replayed on replacement session");
            Map<String, Object> replayJson = SimpleJson.parseObjectStrict(new String(replay.payload(), StandardCharsets.UTF_8));
            require("需要重放的文本".equals(SimpleJson.asMap(replayJson.get("req_params")).get("text")),
                "reconnect preserves the submitted text exactly");

            transport.fail(new IOException("second fixture disconnect"));
            require(transport.endpoints.size() == 2, "retry budget is capped at one replacement connection");
            require("failed".equals(manager.status(localSessionId).state()), "second transport loss fails safely");
        }
    }

    private static void realtimeSessionStreamsAudioBeforeCompletion() throws Exception {
        DoubaoV3Config config = new DoubaoV3Config(
            "seed-tts-2.0",
            "seed-tts-2.0-standard",
            "zh_female_gaolengyujie_uranus_bigtts",
            new DoubaoV3Config.AudioOutput(DoubaoV3Config.AudioFormat.MP3, 24000, 128000),
            new DoubaoV3Config.Prosody("用悲伤但温柔的语气演绎", 5, -5, 10),
            new DoubaoV3Config.ApiKeyCredential("fixture-key")
        );
        FakeTransportFactory transport = new FakeTransportFactory();
        try (TtsSessionManager manager = new TtsSessionManager(
            () -> config, transport, Duration.ofMinutes(2), 1024
        )) {
            TtsSessionManager.SessionSnapshot created = manager.create("request-1");
            require("connecting".equals(created.state()), "new session starts in connecting state");
            require(SimpleJson.stringify(created.toMap()).contains("\"sessionId\":\"" + created.sessionId() + "\""),
                "session snapshots expose an HTTP-safe JSON map");
            requireThrows(() -> manager.create("request-1"),
                "duplicate requestId is rejected instead of opening a second billable session");
            require(transport.endpoints.size() == 1, "duplicate requestId never reaches the provider");
            require(transport.endpoints.equals(List.of(
                URI.create("wss://openspeech.bytedance.com/api/v3/tts/bidirection")
            )), "the transport can only connect to the fixed official endpoint");
            require(eventOf(transport.lastSent()) == DoubaoV3Protocol.Event.START_CONNECTION,
                "connection starts before a session");

            String connectId = transport.headers.get(0).get("X-Api-Connect-Id");
            transport.server(fullServer(DoubaoV3Protocol.Event.CONNECTION_STARTED, "", connectId, json("{}")));
            DoubaoV3Protocol.Message startSession = DoubaoV3Protocol.decode(transport.lastSent());
            require(startSession.event() == DoubaoV3Protocol.Event.START_SESSION, "session starts after connection ack");
            Map<String, Object> startJson = SimpleJson.parseObjectStrict(
                new String(startSession.payload(), StandardCharsets.UTF_8));
            Map<String, Object> startParams = SimpleJson.asMap(startJson.get("req_params"));
            Map<String, Object> audioParams = SimpleJson.asMap(startParams.get("audio_params"));
            require("mp3".equals(audioParams.get("format")), "configured audio format reaches StartSession");
            require(((Number) audioParams.get("sample_rate")).intValue() == 24000,
                "configured sample rate reaches StartSession");
            require(((Number) audioParams.get("bit_rate")).intValue() == 128000,
                "configured bitrate reaches StartSession");
            require(((Number) audioParams.get("speech_rate")).intValue() == -5,
                "configured speech rate reaches StartSession");
            require(((Number) audioParams.get("loudness_rate")).intValue() == 10,
                "configured loudness reaches StartSession");
            require(audioParams.get("emotion_scale") instanceof Number,
                "configured emotion scale is missing from StartSession audio_params");
            require(((Number) audioParams.get("emotion_scale")).intValue() == 5,
                "configured emotion scale must not be a no-op");
            require(List.of("用悲伤但温柔的语气演绎").equals(startParams.get("context_texts")),
                "natural-language emotion context reaches StartSession");
            String upstreamSessionId = startSession.sessionId();
            transport.server(fullServer(DoubaoV3Protocol.Event.SESSION_STARTED, upstreamSessionId, "", json("{}")));

            manager.appendText(created.sessionId(), 1, "你 好");
            DoubaoV3Protocol.Message task = DoubaoV3Protocol.decode(transport.lastSent());
            require(task.event() == DoubaoV3Protocol.Event.TASK_REQUEST, "text delta uses TaskRequest");
            Map<String, Object> taskJson = SimpleJson.parseObjectStrict(new String(task.payload(), StandardCharsets.UTF_8));
            require("你 好".equals(SimpleJson.asMap(taskJson.get("req_params")).get("text")),
                "text whitespace and order are preserved");

            manager.finish(created.sessionId());
            require(eventOf(transport.lastSent()) == DoubaoV3Protocol.Event.FINISH_SESSION,
                "finish is an explicit V3 event");

            transport.server(audioServer(upstreamSessionId, new byte[] { 1, 2, 3 }));
            try (InputStream audio = manager.openAudio(created.sessionId()).stream()) {
                require(Arrays.equals(new byte[] { 1, 2, 3 }, audio.readNBytes(3)),
                    "the first audio chunk is readable before SessionFinished");
                require("streaming".equals(manager.status(created.sessionId()).state()),
                    "status exposes first-audio progress");
                transport.server(fullServer(DoubaoV3Protocol.Event.SESSION_FINISHED, upstreamSessionId, "", json("{}")));
                require(audio.read() == -1, "audio stream ends after SessionFinished");
            }
            require("completed".equals(manager.status(created.sessionId()).state()), "session completes cleanly");
            require(eventOf(transport.lastSent()) == DoubaoV3Protocol.Event.FINISH_CONNECTION,
                "provider connection is explicitly finished");
        }
        require(transport.closedConnections == 1,
            "closing the manager releases a completed connection even if ConnectionFinished never arrives");
    }

    private static DoubaoV3Protocol.Event eventOf(byte[] frame) {
        return DoubaoV3Protocol.decode(frame).event();
    }

    private static byte[] json(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }

    private static byte[] fullServer(
        DoubaoV3Protocol.Event event,
        String sessionId,
        String connectId,
        byte[] payload
    ) {
        return serverFrame(0b1001, 0b0001, event, sessionId, connectId, payload);
    }

    private static byte[] audioServer(String sessionId, byte[] payload) {
        return serverFrame(0b1011, 0b0000, DoubaoV3Protocol.Event.TTS_RESPONSE, sessionId, "", payload);
    }

    private static byte[] serverFrame(
        int messageType,
        int serialization,
        DoubaoV3Protocol.Event event,
        String sessionId,
        String connectId,
        byte[] payload
    ) {
        byte[] session = sessionId.getBytes(StandardCharsets.UTF_8);
        byte[] connect = connectId.getBytes(StandardCharsets.UTF_8);
        boolean connectionEvent = event == DoubaoV3Protocol.Event.CONNECTION_STARTED ||
            event == DoubaoV3Protocol.Event.CONNECTION_FAILED ||
            event == DoubaoV3Protocol.Event.CONNECTION_FINISHED;
        int idBytes = connectionEvent ? 4 + connect.length : 4 + session.length;
        ByteBuffer frame = ByteBuffer.allocate(4 + 4 + idBytes + 4 + payload.length).order(ByteOrder.BIG_ENDIAN);
        frame.put((byte) 0x11);
        frame.put((byte) ((messageType << 4) | 0b0100));
        frame.put((byte) (serialization << 4));
        frame.put((byte) 0);
        frame.putInt(event.code());
        byte[] id = connectionEvent ? connect : session;
        frame.putInt(id.length).put(id);
        frame.putInt(payload.length).put(payload);
        return frame.array();
    }

    private static final class FakeTransportFactory implements DoubaoV3Transport.Factory {
        private final List<URI> endpoints = new ArrayList<>();
        private final List<Map<String, String>> headers = new ArrayList<>();
        private final List<byte[]> sent = new ArrayList<>();
        private DoubaoV3Transport.Listener listener;
        private int closedConnections;

        @Override
        public DoubaoV3Transport.Connection connect(
            URI endpoint,
            Map<String, String> connectionHeaders,
            DoubaoV3Transport.Listener connectionListener
        ) {
            endpoints.add(endpoint);
            headers.add(Map.copyOf(connectionHeaders));
            listener = connectionListener;
            return new DoubaoV3Transport.Connection() {
                private boolean closed;
                @Override public void send(byte[] frame) { sent.add(frame.clone()); }
                @Override public void close() {
                    if (closed) return;
                    closed = true;
                    closedConnections++;
                }
            };
        }

        byte[] lastSent() {
            require(!sent.isEmpty(), "expected an outgoing fixture frame");
            return sent.get(sent.size() - 1);
        }

        void server(byte[] frame) {
            listener.onBinary(frame);
        }

        void fail(Throwable error) {
            listener.onFailure(error);
        }
    }

    private static final class MutableClock extends Clock {
        private long millis;

        private MutableClock(long millis) {
            this.millis = millis;
        }

        void advance(Duration duration) {
            millis += duration.toMillis();
        }

        @Override public ZoneId getZone() { return ZoneId.of("UTC"); }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(millis); }
        @Override public long millis() { return millis; }
    }

    private static void protocolUsesOfficialBigEndianGoldenFrames() {
        byte[] startConnection = DoubaoV3Protocol.clientEvent(
            DoubaoV3Protocol.Event.START_CONNECTION, "", "{}".getBytes()
        );
        require("1114100000000001000000027b7d".equals(HexFormat.of().formatHex(startConnection)),
            "StartConnection must match the official big-endian frame layout");

        byte[] startSession = DoubaoV3Protocol.clientEvent(
            DoubaoV3Protocol.Event.START_SESSION, "s", "{}".getBytes()
        );
        require("11141000000000640000000173000000027b7d".equals(HexFormat.of().formatHex(startSession)),
            "StartSession must prefix the UTF-8 session ID with a big-endian uint32 length");

        DoubaoV3Protocol.Message audio = DoubaoV3Protocol.decode(HexFormat.of().parseHex(
            "11b4000000000160000000017300000003010203"
        ));
        require(audio.type() == DoubaoV3Protocol.MessageType.AUDIO_ONLY_SERVER, "audio frame type");
        require(audio.event() == DoubaoV3Protocol.Event.TTS_RESPONSE, "TTS response event 352");
        require("s".equals(audio.sessionId()), "audio frame session ID");
        require(HexFormat.of().formatHex(audio.payload()).equals("010203"), "raw audio payload is unchanged");

        DoubaoV3Protocol.Message connected = DoubaoV3Protocol.decode(HexFormat.of().parseHex(
            "11941000000000320000000163000000027b7d"
        ));
        require(connected.event() == DoubaoV3Protocol.Event.CONNECTION_STARTED, "connection event 50");
        require("c".equals(connected.connectId()), "connection response carries its connect ID");

        DoubaoV3Protocol.Message error = DoubaoV3Protocol.decode(HexFormat.of().parseHex(
            "11f41000000004d2000000990000000173000000027b7d"
        ));
        require(error.type() == DoubaoV3Protocol.MessageType.ERROR && error.errorCode() == 1234,
            "error code precedes its event in the official frame layout");
        require(error.event() == DoubaoV3Protocol.Event.SESSION_FAILED && "s".equals(error.sessionId()),
            "event-scoped error retains its session ID");
    }

    private static void legacyAuthenticationIsExactAndMutuallyExclusive() {
        DoubaoV3Config config = DoubaoV3Config.defaults(
            "zh_female_gaolengyujie_uranus_bigtts",
            new DoubaoV3Config.LegacyCredential("legacy-app-id", "legacy-access-secret")
        );
        Map<String, String> headers = config.connectionHeaders("connect-legacy");
        require(headers.equals(Map.of(
            "X-Api-App-Key", "legacy-app-id",
            "X-Api-Access-Key", "legacy-access-secret",
            "X-Api-Resource-Id", "seed-tts-2.0",
            "X-Api-Connect-Id", "connect-legacy"
        )), "legacy authentication headers must be exact");
        require(!headers.containsKey("X-Api-Key") && !headers.containsKey("Authorization"),
            "legacy authentication must not mix API-key or Bearer headers");
        String snapshot = config.publicSnapshot().toString();
        require(!snapshot.contains("legacy-app-id") && !snapshot.contains("legacy-access-secret"),
            "public config snapshot must redact both legacy values");
        require("legacy-app-access".equals(config.publicSnapshot().get("authMode")),
            "snapshot identifies legacy auth without exposing its values");
    }

    private static void apiKeyAuthenticationIsExactAndRedacted() {
        DoubaoV3Config config = DoubaoV3Config.defaults(
            "zh_female_gaolengyujie_uranus_bigtts",
            new DoubaoV3Config.ApiKeyCredential("api-key-super-secret")
        );
        Map<String, String> headers = config.connectionHeaders("connect-123");
        require(headers.equals(Map.of(
            "X-Api-Key", "api-key-super-secret",
            "X-Api-Resource-Id", "seed-tts-2.0",
            "X-Api-Connect-Id", "connect-123"
        )), "API-key authentication headers must be exact");
        require(!headers.containsKey("Authorization"), "Doubao V3 must not use Bearer authentication");

        String snapshot = config.publicSnapshot().toString();
        require(!snapshot.contains("api-key-super-secret"), "public config snapshot must redact the API key");
        require(Boolean.TRUE.equals(config.publicSnapshot().get("hasCredential")), "snapshot reports credential presence");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void requireThrows(Runnable action, String message) {
        try {
            action.run();
        } catch (IllegalArgumentException expected) {
            return;
        }
        throw new AssertionError(message);
    }

    private static void requireThrowsChecked(
        CheckedRunnable action,
        Class<? extends Throwable> expected,
        String message
    ) {
        try {
            action.run();
        } catch (Throwable error) {
            if (expected.isInstance(error)) return;
            throw new AssertionError(message + ": wrong exception " + error.getClass().getName());
        }
        throw new AssertionError(message);
    }

    @FunctionalInterface
    private interface CheckedRunnable {
        void run() throws Exception;
    }
}
