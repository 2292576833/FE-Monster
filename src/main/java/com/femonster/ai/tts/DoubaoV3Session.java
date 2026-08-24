package com.femonster.ai.tts;

import com.femonster.ai.AiProviderCatalog;
import com.femonster.json.SimpleJson;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** One upstream Doubao connection/session pair. All transitions are serialized on this object. */
final class DoubaoV3Session implements AutoCloseable {
    interface Listener {
        void onAudio(byte[] audio);
        void onComplete();
        void onFailure(String errorCode);
    }

    private static final URI ENDPOINT = URI.create(AiProviderCatalog.DOUBAO_TTS_V3_ENDPOINT);
    private static final int MAX_TEXT_CHARS = 32_000;
    private static final int MAX_TOTAL_TEXT_CHARS = 1_000_000;

    private final DoubaoV3Config config;
    private final DoubaoV3Transport.Factory transportFactory;
    private final Listener listener;
    private final List<TextDelta> submitted = new ArrayList<>();

    private DoubaoV3Transport.Connection connection;
    private State state = State.NEW;
    private String connectId = "";
    private String upstreamSessionId = "";
    private long lastSequence;
    private boolean finishRequested;
    private boolean firstAudio;
    private int totalTextChars;
    private int connectionAttempts;
    private int transportGeneration;

    DoubaoV3Session(
        DoubaoV3Config config,
        DoubaoV3Transport.Factory transportFactory,
        Listener listener
    ) {
        this.config = config;
        this.transportFactory = transportFactory;
        this.listener = listener;
    }

    synchronized void start() {
        if (state != State.NEW) throw new IllegalStateException("TTS session has already started");
        state = State.CONNECTING;
        openConnectionAttempt();
    }

    private void openConnectionAttempt() {
        connectionAttempts++;
        int generation = ++transportGeneration;
        connectId = UUID.randomUUID().toString();
        upstreamSessionId = UUID.randomUUID().toString();
        try {
            connection = transportFactory.connect(
                ENDPOINT,
                config.connectionHeaders(connectId),
                new TransportListener(generation)
            );
            send(DoubaoV3Protocol.Event.START_CONNECTION, "", "{}");
        } catch (IOException | RuntimeException error) {
            handleTransportLoss(generation, "TTS_CONNECT_FAILED");
        }
    }

    synchronized void appendText(long sequence, String text) {
        if (finishRequested || terminal()) throw new IllegalStateException("TTS session no longer accepts text");
        if (sequence <= lastSequence) throw new IllegalArgumentException("TTS text sequence must increase");
        String value = text == null ? "" : text;
        if (value.isEmpty()) throw new IllegalArgumentException("TTS text is required");
        if (value.length() > MAX_TEXT_CHARS) throw new IllegalArgumentException("TTS text delta is too long");
        if (value.length() > MAX_TOTAL_TEXT_CHARS - totalTextChars) {
            throw new IllegalArgumentException("TTS session text is too large");
        }
        for (int index = 0; index < value.length(); index++) {
            char c = value.charAt(index);
            if (c == 0 || (c < 0x20 && c != '\n' && c != '\r' && c != '\t')) {
                throw new IllegalArgumentException("TTS text contains unsupported control characters");
            }
        }
        TextDelta delta = new TextDelta(sequence, value);
        submitted.add(delta);
        totalTextChars += value.length();
        lastSequence = sequence;
        if (state == State.ACTIVE) sendTask(delta);
    }

    synchronized void finish() {
        if (terminal()) return;
        if (finishRequested) return;
        finishRequested = true;
        if (state == State.ACTIVE) sendFinish();
    }

    synchronized void cancel() {
        if (terminal()) {
            if (connection != null) connection.close();
            return;
        }
        if (connection != null && (state == State.ACTIVE || state == State.FINISHING)) {
            try {
                send(DoubaoV3Protocol.Event.CANCEL_SESSION, upstreamSessionId, "{}");
            } catch (RuntimeException ignored) {
            }
        }
        state = State.CANCELED;
        if (connection != null) connection.close();
    }

    synchronized String stateName() {
        return switch (state) {
            case NEW, CONNECTING, STARTING_SESSION -> "connecting";
            case ACTIVE -> firstAudio ? "streaming" : "active";
            case FINISHING -> firstAudio ? "streaming" : "finishing";
            case COMPLETED -> "completed";
            case CANCELED -> "canceled";
            case FAILED -> "failed";
        };
    }

    synchronized boolean firstAudio() {
        return firstAudio;
    }

    @Override
    public synchronized void close() {
        cancel();
    }

    private synchronized void handle(int generation, byte[] raw) {
        if (generation != transportGeneration || terminal()) return;
        DoubaoV3Protocol.Message message;
        try {
            message = DoubaoV3Protocol.decode(raw);
        } catch (RuntimeException error) {
            fail("TTS_PROTOCOL_ERROR");
            return;
        }
        if (!message.connectId().isEmpty() && !connectId.equals(message.connectId())) {
            fail("TTS_PROTOCOL_ERROR");
            return;
        }
        if (!message.sessionId().isEmpty() && !upstreamSessionId.equals(message.sessionId())) {
            fail("TTS_PROTOCOL_ERROR");
            return;
        }
        if (message.type() == DoubaoV3Protocol.MessageType.ERROR ||
            message.event() == DoubaoV3Protocol.Event.CONNECTION_FAILED ||
            message.event() == DoubaoV3Protocol.Event.SESSION_FAILED) {
            fail("TTS_UPSTREAM_REJECTED");
            return;
        }
        switch (message.event()) {
            case CONNECTION_STARTED -> {
                if (state != State.CONNECTING) {
                    fail("TTS_PROTOCOL_ERROR");
                    return;
                }
                state = State.STARTING_SESSION;
                send(DoubaoV3Protocol.Event.START_SESSION, upstreamSessionId,
                    SimpleJson.stringify(sessionPayload(DoubaoV3Protocol.Event.START_SESSION, "")));
            }
            case SESSION_STARTED -> {
                if (state != State.STARTING_SESSION) {
                    fail("TTS_PROTOCOL_ERROR");
                    return;
                }
                state = State.ACTIVE;
                for (TextDelta delta : submitted) sendTask(delta);
                if (finishRequested) sendFinish();
            }
            case TTS_RESPONSE -> {
                if (message.type() != DoubaoV3Protocol.MessageType.AUDIO_ONLY_SERVER ||
                    (state != State.ACTIVE && state != State.FINISHING)) {
                    fail("TTS_PROTOCOL_ERROR");
                    return;
                }
                if (message.payload().length > 0) {
                    firstAudio = true;
                    submitted.clear();
                    listener.onAudio(message.payload());
                }
            }
            case SESSION_FINISHED -> {
                if (state != State.ACTIVE && state != State.FINISHING) {
                    fail("TTS_PROTOCOL_ERROR");
                    return;
                }
                state = State.COMPLETED;
                listener.onComplete();
                try {
                    send(DoubaoV3Protocol.Event.FINISH_CONNECTION, "", "{}");
                } catch (RuntimeException ignored) {
                    if (connection != null) connection.close();
                }
            }
            case SESSION_CANCELED -> {
                state = State.CANCELED;
                if (connection != null) connection.close();
            }
            case CONNECTION_FINISHED -> {
                if (connection != null) connection.close();
            }
            case TTS_SENTENCE_START, TTS_SENTENCE_END, TTS_SUBTITLE, USAGE_RESPONSE, TTS_ENDED -> {
                // Informational downstream events do not change the transport lifecycle.
            }
            default -> {
                fail("TTS_PROTOCOL_ERROR");
            }
        }
    }

    private Map<String, Object> sessionPayload(DoubaoV3Protocol.Event event, String text) {
        LinkedHashMap<String, Object> audio = new LinkedHashMap<>();
        audio.put("format", config.output().format().wireName());
        audio.put("sample_rate", config.output().sampleRate());
        if (config.output().format() == DoubaoV3Config.AudioFormat.MP3) {
            audio.put("bit_rate", config.output().bitRate());
        }
        audio.put("speech_rate", config.prosody().speechRate());
        audio.put("loudness_rate", config.prosody().loudnessRate());
        if (!config.prosody().emotion().isBlank()) {
            audio.put("emotion_scale", config.prosody().emotionScale());
        }

        LinkedHashMap<String, Object> params = new LinkedHashMap<>();
        params.put("speaker", config.speaker());
        params.put("audio_params", audio);
        if ("seed-icl-2.0".equals(config.resourceId())) params.put("model", config.modelVariant());
        if (!config.prosody().emotion().isBlank() && "seed-tts-2.0".equals(config.resourceId())) {
            params.put("context_texts", List.of(config.prosody().emotion()));
        }
        if (!text.isEmpty()) params.put("text", text);
        return Map.of("event", event.code(), "req_params", params);
    }

    private void sendTask(TextDelta delta) {
        send(DoubaoV3Protocol.Event.TASK_REQUEST, upstreamSessionId,
            SimpleJson.stringify(sessionPayload(DoubaoV3Protocol.Event.TASK_REQUEST, delta.text())));
    }

    private void sendFinish() {
        if (state != State.ACTIVE) return;
        state = State.FINISHING;
        send(DoubaoV3Protocol.Event.FINISH_SESSION, upstreamSessionId, "{}");
    }

    private void send(DoubaoV3Protocol.Event event, String sessionId, String json) {
        try {
            if (connection == null) throw new IOException("transport is unavailable");
            connection.send(DoubaoV3Protocol.clientEvent(event, sessionId, json.getBytes(StandardCharsets.UTF_8)));
        } catch (IOException error) {
            handleTransportLoss(transportGeneration, "TTS_TRANSPORT_FAILED");
        }
    }

    private synchronized void transportClosed(int generation) {
        if (!terminal()) handleTransportLoss(generation, "TTS_TRANSPORT_FAILED");
    }

    private synchronized void transportFailed(int generation) {
        if (!terminal()) handleTransportLoss(generation, "TTS_TRANSPORT_FAILED");
    }

    private void handleTransportLoss(int generation, String finalErrorCode) {
        if (generation != transportGeneration || terminal()) return;
        DoubaoV3Transport.Connection previous = connection;
        connection = null;
        if (previous != null) previous.close();
        if (!firstAudio && connectionAttempts < 2) {
            state = State.CONNECTING;
            openConnectionAttempt();
            return;
        }
        fail(finalErrorCode);
    }

    private void fail(String errorCode) {
        if (terminal()) return;
        state = State.FAILED;
        if (connection != null) connection.close();
        listener.onFailure(errorCode);
    }

    private boolean terminal() {
        return state == State.COMPLETED || state == State.CANCELED || state == State.FAILED;
    }

    private final class TransportListener implements DoubaoV3Transport.Listener {
        private final int generation;

        private TransportListener(int generation) {
            this.generation = generation;
        }

        @Override public void onBinary(byte[] frame) { handle(generation, frame); }
        @Override public void onClosed(int statusCode, String reason) { transportClosed(generation); }
        @Override public void onFailure(Throwable error) { transportFailed(generation); }
    }

    private record TextDelta(long sequence, String text) {}

    private enum State {
        NEW,
        CONNECTING,
        STARTING_SESSION,
        ACTIVE,
        FINISHING,
        COMPLETED,
        CANCELED,
        FAILED
    }
}
