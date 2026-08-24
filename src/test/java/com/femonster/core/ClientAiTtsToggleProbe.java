package com.femonster.core;

import java.nio.file.Path;
import java.util.Map;

/** Behavioral probe for the persisted, source-safe client TTS switch. */
public final class ClientAiTtsToggleProbe {
    private ClientAiTtsToggleProbe() {}

    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("data directory is required");
        Path dataDir = Path.of(args[0]);

        try (ClientAiGateway gateway = new ClientAiGateway(dataDir)) {
            require(Boolean.TRUE.equals(gateway.snapshot().get("ttsEnabled")),
                "client TTS must default to enabled");

            Map<String, Object> configured = gateway.configure(Map.of(
                "modelMode", "custom",
                "model", Map.of(
                    "provider", "custom",
                    "baseUrl", "http://127.0.0.1:11434/v1",
                    "model", "qwen-fixture"
                ),
                "tts", Map.of(
                    "provider", "openai-tts",
                    "baseUrl", "https://api.openai.com/v1",
                    "model", "gpt-4o-mini-tts",
                    "voice", "alloy",
                    "apiKey", "sk-toggle-fixture"
                )
            ));
            require(Boolean.TRUE.equals(configured.get("ttsEnabled")),
                "saving providers unexpectedly disabled client TTS");

            Map<String, Object> disabled = gateway.configure(Map.of("ttsEnabled", false));
            require(Boolean.FALSE.equals(disabled.get("ttsEnabled")),
                "client TTS disable patch was ignored");
            require(Boolean.TRUE.equals(provider(disabled, "model").get("ready")),
                "disabling speech disabled text inference");
            require(Boolean.TRUE.equals(provider(disabled, "tts").get("ready")),
                "disabling speech erased the configured TTS readiness");
            require("alloy".equals(provider(disabled, "tts").get("voice")),
                "disabling speech erased the selected voice");
            require(Boolean.TRUE.equals(provider(disabled, "tts").get("hasApiKey")),
                "disabling speech erased the TTS credential");

            expectCode(() -> gateway.execute(
                ClientAiGateway.Kind.TTS,
                Map.of("input", "must not synthesize"),
                "tts-disabled-probe"
            ), "client_ai_not_ready");
        }

        try (ClientAiGateway restarted = new ClientAiGateway(dataDir)) {
            Map<String, Object> persisted = restarted.snapshot();
            require(Boolean.FALSE.equals(persisted.get("ttsEnabled")),
                "client TTS disable state did not survive restart");
            require("alloy".equals(provider(persisted, "tts").get("voice")),
                "restart lost the selected voice while TTS was disabled");
            require(Boolean.TRUE.equals(provider(persisted, "tts").get("hasApiKey")),
                "restart lost the TTS credential while TTS was disabled");

            Map<String, Object> enabled = restarted.configure(Map.of("ttsEnabled", true));
            require(Boolean.TRUE.equals(enabled.get("ttsEnabled")),
                "client TTS could not be re-enabled");
            require("alloy".equals(provider(enabled, "tts").get("voice")),
                "re-enabling client TTS changed the selected voice");
            require(Boolean.TRUE.equals(provider(enabled, "tts").get("hasApiKey")),
                "re-enabling client TTS lost the credential");
        }

        System.out.println("ClientAiTtsToggleProbe passed");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> provider(Map<String, Object> snapshot, String key) {
        return (Map<String, Object>) snapshot.get(key);
    }

    private static void expectCode(Runnable action, String code) {
        try {
            action.run();
            throw new AssertionError("expected failure " + code);
        } catch (ClientAiException error) {
            require(code.equals(error.errorCode()),
                "expected " + code + " but got " + error.errorCode());
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
