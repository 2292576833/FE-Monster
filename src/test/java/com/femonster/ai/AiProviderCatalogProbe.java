package com.femonster.ai;

import com.femonster.json.SimpleJson;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class AiProviderCatalogProbe {
    private AiProviderCatalogProbe() {}

    public static void main(String[] args) {
        Map<String, Object> catalog = AiProviderCatalog.snapshot();
        require("fe-monster.ai-provider-catalog/v1".equals(catalog.get("schema")), "stable schema");
        require(Long.valueOf(1).equals(catalog.get("revision")), "stable revision");

        List<Object> providers = SimpleJson.asList(catalog.get("providers"));
        require(providers.size() >= 15, "major chat and TTS providers are discoverable");
        Set<String> ids = new HashSet<>();
        int implementedCloudTtsProviders = 0;
        for (Object item : providers) {
            Map<String, Object> provider = SimpleJson.asMap(item);
            String id = SimpleJson.asString(provider.get("id"), "");
            require(!id.isBlank() && ids.add(id), "provider IDs are non-empty and unique");
            if ("tts".equals(provider.get("kind"))) {
                String descriptor = SimpleJson.stringify(provider).toLowerCase();
                require(!descriptor.matches(".*(?:chatterbox|python[-_ ]?tts|server[-_ ]?voice).*"),
                    "client TTS catalog exposes a server/local-worker provider: " + id);
                if ("ready".equals(provider.get("implementationStatus"))) {
                    if ("custom-openai-compatible-tts".equals(id)) {
                        require(SimpleJson.asList(provider.get("capabilities"))
                                .contains("endpoint.user-configurable"),
                            "custom cloud TTS must explicitly declare its remote endpoint contract");
                    } else {
                        require(!SimpleJson.asMap(provider.get("links")).isEmpty(),
                            "implemented client TTS must identify its official cloud vendor: " + id);
                    }
                    implementedCloudTtsProviders += 1;
                }
            }
        }
        require(implementedCloudTtsProviders >= 3,
            "implemented cloud TTS providers remain discoverable");

        Map<String, Object> doubao = AiProviderCatalog.require("volcengine-doubao-tts-v3");
        require("tts".equals(doubao.get("kind")), "Doubao is a TTS provider");
        require("volcengine-tts-v3".equals(doubao.get("protocol")), "Doubao uses its native V3 protocol");
        require("wss://openspeech.bytedance.com/api/v3/tts/bidirection".equals(doubao.get("endpoint")),
            "Doubao endpoint is the fixed official V3 host");
        require(SimpleJson.asList(doubao.get("authModes")).equals(List.of("api-key", "legacy-app-access")),
            "both official authentication modes are explicit");
        require(SimpleJson.asList(doubao.get("capabilities")).containsAll(List.of(
            "tts.stream-output", "tts.duplex-text", "tts.emotion"
        )), "Doubao realtime capabilities are advertised");

        Map<String, Object> links = SimpleJson.asMap(doubao.get("links"));
        require("https://console.volcengine.com/speech/new/setting/apikeys?projectName=default".equals(links.get("console")),
            "console link is the official HTTPS destination");
        require("https://www.volcengine.com/docs/6561/2532486?lang=zh".equals(links.get("docs")),
            "docs link targets the current V3 contract");

        requireNoSecretKeys(catalog);
        requireThrows(() -> AiProviderCatalog.require("unknown-provider"), "unknown providers fail closed");
        System.out.println("AiProviderCatalogProbe passed");
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

    private static void requireNoSecretKeys(Object value) {
        if (value instanceof Map<?, ?> map) {
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                String key = String.valueOf(entry.getKey()).toLowerCase();
                require(!Set.of("apikey", "accesskey", "authorization", "secret", "credential").contains(key),
                    "public catalog contains no secret field named " + key);
                requireNoSecretKeys(entry.getValue());
            }
        } else if (value instanceof Iterable<?> iterable) {
            for (Object item : iterable) requireNoSecretKeys(item);
        }
    }
}
