package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

/** Executable acceptance contract for the client-owned TTS provider boundary. */
public final class ClientAiTtsProviderPolicyProbe {
    private ClientAiTtsProviderPolicyProbe() {}

    public static void main(String[] args) throws Exception {
        require(args.length == 1, "policy probe data directory is required");
        Path dataDir = Path.of(args[0]).toAbsolutePath().normalize();
        Files.createDirectories(dataDir);

        try (ClientAiGateway gateway = new ClientAiGateway(dataDir)) {
            // Local chat inference remains supported. The cloud-only boundary applies to TTS,
            // not to Ollama or LM Studio model endpoints.
            gateway.configure(Map.of(
                "modelMode", "custom",
                "model", provider("ollama", "http://127.0.0.1:11434/v1", "llama3.2", "", "")
            ));
            require(Boolean.TRUE.equals(section(gateway.snapshot(), "model").get("ready")),
                "Ollama loopback chat model was rejected by the TTS policy");

            rejectTts(gateway, provider(
                "openai-tts", "http://127.0.0.1:8123/v1", "local-python-tts", "", "local-voice"),
                "an implemented cloud provider ID must not disguise a loopback Python TTS");
            rejectTts(gateway, provider(
                "custom-openai-compatible-tts", "http://127.0.0.1:8125/v1", "local-custom-tts", "", "local-voice"),
                "custom OpenAI-compatible TTS must still reject loopback workers");
            rejectTts(gateway, provider(
                "custom-openai-compatible-tts", "https://192.168.1.8/v1", "private-custom-tts", "sk-private-fixture", "voice"),
                "custom OpenAI-compatible TTS must reject private-network workers");
            rejectTts(gateway, provider(
                "chatterbox", "https://example.com/v1", "chatterbox", "sk-chatterbox-fixture", "server-voice"),
                "server Chatterbox must not be selectable from client-owned TTS");
            rejectTts(gateway, provider(
                "python-local-tts", "http://127.0.0.1:8124/v1", "python-worker", "", "local-voice"),
                "local Python TTS must not be selectable from client-owned TTS");
            rejectTts(gateway, provider(
                "unknown-cloud-tts", "https://example.com/v1", "unknown", "sk-unknown-fixture", "voice"),
                "unknown TTS providers must fail closed");
            rejectTts(gateway, provider(
                "azure-speech", "https://example.com/v1", "planned", "sk-planned-fixture", "voice"),
                "planned TTS providers must not execute before implementation");
            rejectTts(gateway, Map.of("serverVoiceId", "chatterbox:server-selected-speaker"),
                "server voice configuration must not be accepted by the client TTS gateway");

            gateway.configure(Map.of("tts", provider(
                "openai-tts", "https://api.openai.com/v1", "gpt-4o-mini-tts", "sk-cloud-fixture", "alloy")));
            Map<String, Object> cloudTts = section(gateway.snapshot(), "tts");
            require("openai-tts".equals(cloudTts.get("provider")),
                "implemented OpenAI cloud TTS was not accepted");
            require(Boolean.TRUE.equals(cloudTts.get("ready")),
                "implemented OpenAI cloud TTS is not ready after valid configuration");

            gateway.configure(Map.of("tts", provider(
                "custom-openai-compatible-tts", "https://example.com/v1", "remote-cloud-tts",
                "sk-remote-cloud-fixture", "cloud-voice")));
            Map<String, Object> customCloudTts = section(gateway.snapshot(), "tts");
            require("custom-openai-compatible-tts".equals(customCloudTts.get("provider"))
                    && Boolean.TRUE.equals(customCloudTts.get("ready")),
                "credentialed remote HTTPS custom TTS was incorrectly rejected");

            gateway.configure(Map.of("model", provider(
                "lm-studio", "http://127.0.0.1:1234/v1", "local-chat-model", "", "")));
            Map<String, Object> lmStudio = section(gateway.snapshot(), "model");
            require("lm-studio".equals(lmStudio.get("provider"))
                    && Boolean.TRUE.equals(lmStudio.get("ready")),
                "LM Studio loopback chat model was rejected by the TTS policy");
            require("custom-openai-compatible-tts".equals(section(gateway.snapshot(), "tts").get("provider")),
                "switching the loopback chat model changed the remote cloud TTS owner");
        }

        System.out.println("ClientAiTtsProviderPolicyProbe passed");
    }

    private static void rejectTts(ClientAiGateway gateway, Map<String, Object> tts, String message) {
        long revision = SimpleJson.asLong(gateway.snapshot().get("revision"), -1);
        try {
            gateway.configure(Map.of("tts", tts));
        } catch (ClientAiException expected) {
            require("client_ai_bad_request".equals(expected.errorCode()),
                message + " (wrong error code: " + expected.errorCode() + ")");
            require(SimpleJson.asLong(gateway.snapshot().get("revision"), -1) == revision,
                message + " (rejected patch mutated the revision)");
            return;
        }
        throw new AssertionError(message);
    }

    private static Map<String, Object> provider(
        String provider,
        String baseUrl,
        String model,
        String apiKey,
        String voice
    ) {
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("provider", provider);
        result.put("baseUrl", baseUrl);
        result.put("model", model);
        result.put("voice", voice);
        if (!apiKey.isBlank()) result.put("apiKey", apiKey);
        return result;
    }

    private static Map<String, Object> section(Map<String, Object> root, String key) {
        return SimpleJson.asMap(root.get(key));
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
