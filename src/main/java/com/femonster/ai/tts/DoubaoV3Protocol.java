package com.femonster.ai.tts;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Set;

/** Codec for the official Doubao V3 event framing (all integers are big-endian). */
public final class DoubaoV3Protocol {
    private static final int VERSION = 1;
    private static final int HEADER_BYTES = 4;
    private static final int FLAG_WITH_EVENT = 0b0100;
    private static final int SERIALIZATION_RAW = 0;
    private static final int SERIALIZATION_JSON = 1;
    private static final int COMPRESSION_NONE = 0;
    private static final int MAX_FRAME_BYTES = 10 * 1024 * 1024;
    private static final int MAX_ID_BYTES = 512;
    private static final Set<Event> CONNECTION_EVENTS_WITHOUT_SESSION = Set.of(
        Event.START_CONNECTION,
        Event.FINISH_CONNECTION,
        Event.CONNECTION_STARTED,
        Event.CONNECTION_FAILED,
        Event.CONNECTION_FINISHED
    );
    private static final Set<Event> CONNECTION_EVENTS_WITH_CONNECT_ID = Set.of(
        Event.CONNECTION_STARTED,
        Event.CONNECTION_FAILED,
        Event.CONNECTION_FINISHED
    );
    private static final Set<Event> CLIENT_EVENTS = Set.of(
        Event.START_CONNECTION,
        Event.FINISH_CONNECTION,
        Event.START_SESSION,
        Event.CANCEL_SESSION,
        Event.FINISH_SESSION,
        Event.TASK_REQUEST
    );

    private DoubaoV3Protocol() {}

    public static byte[] clientEvent(Event event, String sessionId, byte[] jsonPayload) {
        if (event == null || !CLIENT_EVENTS.contains(event)) {
            throw new IllegalArgumentException("unsupported Doubao client event");
        }
        byte[] payload = jsonPayload == null ? new byte[0] : jsonPayload.clone();
        if (payload.length > MAX_FRAME_BYTES) throw new IllegalArgumentException("Doubao payload is too large");
        byte[] session = CONNECTION_EVENTS_WITHOUT_SESSION.contains(event)
            ? new byte[0]
            : utf8Id(sessionId, "sessionId");
        int size = HEADER_BYTES + 4 + (session.length == 0 ? 0 : 4 + session.length) + 4 + payload.length;
        ByteBuffer frame = ByteBuffer.allocate(size).order(ByteOrder.BIG_ENDIAN);
        frame.put((byte) ((VERSION << 4) | 1));
        frame.put((byte) ((MessageType.FULL_CLIENT_REQUEST.code << 4) | FLAG_WITH_EVENT));
        frame.put((byte) ((SERIALIZATION_JSON << 4) | COMPRESSION_NONE));
        frame.put((byte) 0);
        frame.putInt(event.code);
        if (session.length > 0) {
            frame.putInt(session.length);
            frame.put(session);
        }
        frame.putInt(payload.length);
        frame.put(payload);
        return frame.array();
    }

    public static Message decode(byte[] rawFrame) {
        if (rawFrame == null || rawFrame.length < HEADER_BYTES || rawFrame.length > MAX_FRAME_BYTES) {
            throw new IllegalArgumentException("invalid Doubao frame size");
        }
        ByteBuffer frame = ByteBuffer.wrap(rawFrame).order(ByteOrder.BIG_ENDIAN);
        int versionAndHeader = Byte.toUnsignedInt(frame.get());
        int version = versionAndHeader >>> 4;
        int headerWords = versionAndHeader & 0x0f;
        int headerBytes = headerWords * 4;
        if (version != VERSION || headerBytes < HEADER_BYTES || headerBytes > rawFrame.length) {
            throw new IllegalArgumentException("unsupported Doubao frame header");
        }

        int typeAndFlags = Byte.toUnsignedInt(frame.get());
        MessageType type = MessageType.fromCode(typeAndFlags >>> 4);
        int flags = typeAndFlags & 0x0f;
        int serializationAndCompression = Byte.toUnsignedInt(frame.get());
        int serialization = serializationAndCompression >>> 4;
        int compression = serializationAndCompression & 0x0f;
        frame.get();
        frame.position(headerBytes);
        if (compression != COMPRESSION_NONE && compression != 1) {
            throw new IllegalArgumentException("unsupported Doubao frame compression");
        }
        if (serialization != SERIALIZATION_RAW && serialization != SERIALIZATION_JSON) {
            throw new IllegalArgumentException("unsupported Doubao frame serialization");
        }

        int sequence = 0;
        if (flags == 0b0001 || flags == 0b0011) sequence = readInt(frame, "sequence");
        int errorCode = 0;
        if (type == MessageType.ERROR) errorCode = readInt(frame, "errorCode");
        Event event = Event.NONE;
        String sessionId = "";
        String connectId = "";
        if ((flags & FLAG_WITH_EVENT) != 0) {
            event = Event.fromCode(readInt(frame, "event"));
            if (!CONNECTION_EVENTS_WITHOUT_SESSION.contains(event)) {
                sessionId = readUtf8(frame, "sessionId");
            }
            if (CONNECTION_EVENTS_WITH_CONNECT_ID.contains(event)) {
                connectId = readUtf8(frame, "connectId");
            }
        }

        long payloadLength = Integer.toUnsignedLong(readInt(frame, "payloadLength"));
        if (payloadLength > MAX_FRAME_BYTES || payloadLength != frame.remaining()) {
            throw new IllegalArgumentException("invalid Doubao payload length");
        }
        byte[] payload = new byte[(int) payloadLength];
        frame.get(payload);
        return new Message(type, flags, serialization, compression, event, sessionId, connectId,
            sequence, errorCode, payload);
    }

    private static int readInt(ByteBuffer frame, String label) {
        if (frame.remaining() < 4) throw new IllegalArgumentException("truncated Doubao " + label);
        return frame.getInt();
    }

    private static String readUtf8(ByteBuffer frame, String label) {
        long length = Integer.toUnsignedLong(readInt(frame, label + " length"));
        if (length > MAX_ID_BYTES || length > frame.remaining()) {
            throw new IllegalArgumentException("invalid Doubao " + label + " length");
        }
        byte[] bytes = new byte[(int) length];
        frame.get(bytes);
        String value = new String(bytes, StandardCharsets.UTF_8);
        if (!Arrays.equals(bytes, value.getBytes(StandardCharsets.UTF_8))) {
            throw new IllegalArgumentException("invalid UTF-8 Doubao " + label);
        }
        return value;
    }

    private static byte[] utf8Id(String raw, String label) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) throw new IllegalArgumentException(label + " is required");
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_ID_BYTES) throw new IllegalArgumentException(label + " is too long");
        return bytes;
    }

    public enum MessageType {
        FULL_CLIENT_REQUEST(0b0001),
        AUDIO_ONLY_CLIENT(0b0010),
        FULL_SERVER_RESPONSE(0b1001),
        AUDIO_ONLY_SERVER(0b1011),
        FRONTEND_RESULT_SERVER(0b1100),
        ERROR(0b1111);

        private final int code;
        MessageType(int code) { this.code = code; }

        static MessageType fromCode(int code) {
            for (MessageType value : values()) if (value.code == code) return value;
            throw new IllegalArgumentException("unknown Doubao message type");
        }
    }

    public enum Event {
        NONE(0),
        START_CONNECTION(1),
        FINISH_CONNECTION(2),
        CONNECTION_STARTED(50),
        CONNECTION_FAILED(51),
        CONNECTION_FINISHED(52),
        START_SESSION(100),
        CANCEL_SESSION(101),
        FINISH_SESSION(102),
        SESSION_STARTED(150),
        SESSION_CANCELED(151),
        SESSION_FINISHED(152),
        SESSION_FAILED(153),
        USAGE_RESPONSE(154),
        TASK_REQUEST(200),
        UPDATE_CONFIG(201),
        TTS_SENTENCE_START(350),
        TTS_SENTENCE_END(351),
        TTS_RESPONSE(352),
        TTS_ENDED(359),
        TTS_SUBTITLE(364);

        private final int code;
        Event(int code) { this.code = code; }
        public int code() { return code; }

        static Event fromCode(int code) {
            for (Event value : values()) if (value.code == code) return value;
            throw new IllegalArgumentException("unknown Doubao event");
        }
    }

    public record Message(
        MessageType type,
        int flags,
        int serialization,
        int compression,
        Event event,
        String sessionId,
        String connectId,
        int sequence,
        int errorCode,
        byte[] payload
    ) {
        public Message {
            payload = payload == null ? new byte[0] : payload.clone();
        }

        @Override public byte[] payload() { return payload.clone(); }
    }
}
