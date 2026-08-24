package com.femonster.ai;

import com.femonster.ai.tts.DoubaoV3Config;
import com.femonster.core.ClientAiGateway;
import com.femonster.json.SimpleJson;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

public final class ClientAiStateV2MigrationProbe {
    private ClientAiStateV2MigrationProbe() {}

    public static void main(String[] args) throws Exception {
        Path dataDir = Files.createTempDirectory("fe-client-ai-v2-");
        try {
            Files.writeString(dataDir.resolve(ClientAiGateway.STATE_FILE_NAME), """
                {
                  "version":1,
                  "revision":7,
                  "modelMode":"custom",
                  "ttsMode":"custom",
                  "model":{"provider":"deepseek","baseUrl":"https://api.deepseek.com","model":"deepseek-chat","voice":"","apiKey":"old-model-secret"},
                  "tts":{"provider":"openai","baseUrl":"https://api.openai.com/v1","model":"tts-1","voice":"alloy","apiKey":"old-tts-secret"}
                }
                """, StandardCharsets.UTF_8);

            try (ClientAiGateway gateway = new ClientAiGateway(dataDir)) {
                Map<String, Object> snapshot = gateway.snapshot();
                require(Long.valueOf(3).equals(snapshot.get("schemaVersion")), "v1 state is loaded as schema v3");
                require("deepseek".equals(SimpleJson.asMap(snapshot.get("model")).get("provider")),
                    "v1 model settings survive migration");
                require("openai-tts".equals(SimpleJson.asMap(snapshot.get("tts")).get("provider")),
                    "v1 OpenAI-compatible TTS is canonicalized to the cloud provider ID");
                Map<String, Object> persisted = SimpleJson.parseObjectStrict(
                    Files.readString(dataDir.resolve(ClientAiGateway.STATE_FILE_NAME), StandardCharsets.UTF_8)
                );
                require(SimpleJson.asInt(persisted.get("version"), -1) == 3, "migration is atomically persisted");

                gateway.configure(Map.of(
                    "ttsMode", "custom",
                    "tts", Map.of(
                        "provider", "volcengine-doubao-tts-v3",
                        "resourceId", "seed-tts-2.0",
                        "modelVariant", "seed-tts-2.0-standard",
                        "voice", "doubao:zh_female_gaolengyujie_uranus_bigtts",
                        "output", Map.of("format", "mp3", "sampleRate", 24000, "bitRate", 128000),
                        "prosody", Map.of("emotion", "特别温柔地安慰用户", "emotionScale", 4,
                            "speechRate", -5, "loudnessRate", 0),
                        "credentialPatch", Map.of("authMode", "api-key", "apiKey", "doubao-persist-secret")
                    )
                ));
                Map<String, Object> publicTts = SimpleJson.asMap(gateway.snapshot().get("tts"));
                require("volcengine-doubao-tts-v3".equals(publicTts.get("provider")), "Doubao provider is active");
                require(Boolean.TRUE.equals(publicTts.get("hasCredential")), "credential presence is visible");
                require(!gateway.snapshot().toString().contains("doubao-persist-secret"), "snapshot never exposes secret");
                require("doubao-persist-secret".equals(
                    gateway.doubaoTtsConfig().connectionHeaders("fixture").get("X-Api-Key")
                ), "Java owner can resolve the configured credential");
                long revisionBeforeEndpointAttack = ((Number) gateway.snapshot().get("revision")).longValue();
                requireThrows(() -> gateway.configure(Map.of(
                    "tts", Map.of(
                        "provider", "volcengine-doubao-tts-v3",
                        "baseUrl", "wss://attacker.invalid/steal"
                    )
                )), "known Doubao provider rejects any browser-controlled endpoint");
                require(((Number) gateway.snapshot().get("revision")).longValue() == revisionBeforeEndpointAttack,
                    "rejected endpoint patch is not persisted");
            }

            try (ClientAiGateway restarted = new ClientAiGateway(dataDir)) {
                DoubaoV3Config restored = restarted.doubaoTtsConfig();
                require("zh_female_gaolengyujie_uranus_bigtts".equals(restored.speaker()),
                    "Doubao voice survives process restart");
                require("doubao-persist-secret".equals(restored.connectionHeaders("fixture-2").get("X-Api-Key")),
                    "Doubao credential survives process restart inside Java-owned state");
                String persistedText = Files.readString(
                    dataDir.resolve(ClientAiGateway.STATE_FILE_NAME), StandardCharsets.UTF_8
                );
                require(persistedText.contains("doubao-persist-secret"), "credential is present in owner-only state");
            }
            System.out.println("ClientAiStateV2MigrationProbe passed");
        } finally {
            deleteTree(dataDir);
        }
    }

    private static void deleteTree(Path path) throws Exception {
        if (path == null || !Files.exists(path)) return;
        try (var stream = Files.walk(path)) {
            for (Path item : stream.sorted((a, b) -> b.getNameCount() - a.getNameCount()).toList()) {
                Files.deleteIfExists(item);
            }
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void requireThrows(Runnable action, String message) {
        try {
            action.run();
        } catch (RuntimeException expected) {
            return;
        }
        throw new AssertionError(message);
    }
}
