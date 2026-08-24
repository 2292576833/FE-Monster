package com.femonster.ai.tts;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/** Strongly typed local configuration for the fixed Doubao V3 TTS adapter. */
public record DoubaoV3Config(
    String resourceId,
    String modelVariant,
    String speaker,
    AudioOutput output,
    Prosody prosody,
    Credential credential
) {
    private static final Set<String> RESOURCE_IDS = Set.of("seed-tts-2.0", "seed-icl-2.0");
    private static final Set<Integer> SAMPLE_RATES = Set.of(8000, 16000, 22050, 24000, 32000, 44100, 48000);

    public DoubaoV3Config {
        resourceId = strict(resourceId, "resourceId", 64);
        if (!RESOURCE_IDS.contains(resourceId)) throw new IllegalArgumentException("unsupported Doubao resourceId");
        modelVariant = strict(modelVariant, "modelVariant", 96);
        speaker = strict(speaker, "speaker", 240);
        if (output == null) throw new IllegalArgumentException("audio output is required");
        if (prosody == null) throw new IllegalArgumentException("prosody is required");
        if (credential == null) throw new IllegalArgumentException("Doubao credential is required");
    }

    public static DoubaoV3Config defaults(String speaker, Credential credential) {
        return new DoubaoV3Config(
            "seed-tts-2.0",
            "seed-tts-2.0-standard",
            speaker,
            new AudioOutput(AudioFormat.MP3, 24000, 128000),
            new Prosody("", 4, 0, 0),
            credential
        );
    }

    /** Creates the exact WebSocket handshake headers without exposing them publicly. */
    public Map<String, String> connectionHeaders(String connectId) {
        String id = strict(connectId, "connectId", 128);
        LinkedHashMap<String, String> headers = new LinkedHashMap<>();
        credential.addHeaders(headers);
        headers.put("X-Api-Resource-Id", resourceId);
        headers.put("X-Api-Connect-Id", id);
        return Map.copyOf(headers);
    }

    /** Secret-free representation safe for the WebView and diagnostics. */
    public Map<String, Object> publicSnapshot() {
        LinkedHashMap<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("providerId", "volcengine-doubao-tts-v3");
        snapshot.put("authMode", credential.authMode());
        snapshot.put("resourceId", resourceId);
        snapshot.put("modelVariant", modelVariant);
        snapshot.put("voiceId", "doubao:" + speaker);
        snapshot.put("output", output.toMap());
        snapshot.put("prosody", prosody.toMap());
        snapshot.put("hasCredential", true);
        return Map.copyOf(snapshot);
    }

    public sealed interface Credential permits ApiKeyCredential, LegacyCredential {
        String authMode();
        void addHeaders(Map<String, String> headers);
    }

    public record ApiKeyCredential(String apiKey) implements Credential {
        public ApiKeyCredential {
            apiKey = secret(apiKey, "apiKey");
        }

        @Override public String authMode() { return "api-key"; }

        @Override
        public void addHeaders(Map<String, String> headers) {
            headers.put("X-Api-Key", apiKey);
        }

        @Override public String toString() { return "ApiKeyCredential[REDACTED]"; }
    }

    public record LegacyCredential(String appId, String accessKey) implements Credential {
        public LegacyCredential {
            appId = secret(appId, "appId");
            accessKey = secret(accessKey, "accessKey");
        }

        @Override public String authMode() { return "legacy-app-access"; }

        @Override
        public void addHeaders(Map<String, String> headers) {
            headers.put("X-Api-App-Key", appId);
            headers.put("X-Api-Access-Key", accessKey);
        }

        @Override public String toString() { return "LegacyCredential[REDACTED]"; }
    }

    public enum AudioFormat {
        MP3("mp3", "audio/mpeg"),
        PCM("pcm", "audio/L16"),
        OGG_OPUS("ogg_opus", "audio/ogg");

        private final String wireName;
        private final String contentType;

        AudioFormat(String wireName, String contentType) {
            this.wireName = wireName;
            this.contentType = contentType;
        }

        public String wireName() { return wireName; }
        public String contentType() { return contentType; }
    }

    public record AudioOutput(AudioFormat format, int sampleRate, int bitRate) {
        public AudioOutput {
            if (format == null) throw new IllegalArgumentException("audio format is required");
            if (!SAMPLE_RATES.contains(sampleRate)) throw new IllegalArgumentException("unsupported sampleRate");
            if (format == AudioFormat.MP3 && (bitRate < 64000 || bitRate > 160000)) {
                throw new IllegalArgumentException("MP3 bitRate must be between 64000 and 160000");
            }
            if (format != AudioFormat.MP3 && bitRate != 0) {
                throw new IllegalArgumentException("bitRate is only valid for MP3");
            }
        }

        Map<String, Object> toMap() {
            return Map.of("format", format.wireName(), "sampleRate", sampleRate, "bitRate", bitRate);
        }
    }

    public record Prosody(String emotion, int emotionScale, int speechRate, int loudnessRate) {
        public Prosody {
            emotion = optionalText(emotion, "emotion", 64);
            if (emotionScale < 1 || emotionScale > 5) throw new IllegalArgumentException("emotionScale must be 1..5");
            if (speechRate < -50 || speechRate > 100) throw new IllegalArgumentException("speechRate must be -50..100");
            if (loudnessRate < -50 || loudnessRate > 100) throw new IllegalArgumentException("loudnessRate must be -50..100");
        }

        Map<String, Object> toMap() {
            return Map.of(
                "emotion", emotion,
                "emotionScale", emotionScale,
                "speechRate", speechRate,
                "loudnessRate", loudnessRate
            );
        }
    }

    private static String strict(String raw, String label, int max) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) throw new IllegalArgumentException(label + " is required");
        if (value.length() > max) throw new IllegalArgumentException(label + " is too long");
        for (int index = 0; index < value.length(); index++) {
            char c = value.charAt(index);
            if (c < 0x20 || c == 0x7f) throw new IllegalArgumentException(label + " contains control characters");
        }
        return value;
    }

    private static String optionalText(String raw, String label, int max) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) return "";
        return strict(value, label, max);
    }

    private static String secret(String raw, String label) {
        String value = strict(raw, label, 4096);
        return value;
    }
}
