package com.femonster.ai;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Secret-free provider capabilities consumed by both the local settings UI and
 * the server implementation. Provider IDs and capability strings are public
 * compatibility contracts; credentials and arbitrary request templates never
 * belong in this catalog.
 */
public final class AiProviderCatalog {
    public static final String SCHEMA = "fe-monster.ai-provider-catalog/v1";
    public static final long REVISION = 1;
    public static final String DOUBAO_TTS_V3_ID = "volcengine-doubao-tts-v3";
    public static final String DOUBAO_TTS_V3_ENDPOINT =
        "wss://openspeech.bytedance.com/api/v3/tts/bidirection";

    private static final Set<String> OFFICIAL_LINK_HOSTS = Set.of(
        "platform.openai.com", "console.volcengine.com", "www.volcengine.com",
        "platform.deepseek.com", "bailian.console.aliyun.com", "help.aliyun.com",
        "platform.moonshot.cn", "open.bigmodel.cn", "cloud.siliconflow.cn",
        "openrouter.ai", "ollama.com", "lmstudio.ai", "ai.azure.com",
        "platform.minimaxi.com", "cloud.tencent.com", "ai.baidu.com", "www.xfyun.cn"
    );

    private static final List<Map<String, Object>> PROVIDERS = buildProviders();
    private static final Map<String, Map<String, Object>> BY_ID = index(PROVIDERS);
    private static final Map<String, Object> SNAPSHOT = Map.of(
        "schema", SCHEMA,
        "revision", REVISION,
        "providers", PROVIDERS
    );

    private AiProviderCatalog() {}

    /** Returns the immutable, secret-free catalog snapshot. */
    public static Map<String, Object> snapshot() {
        return SNAPSHOT;
    }

    /** Returns a descriptor or fails closed for an unknown provider ID. */
    public static Map<String, Object> require(String providerId) {
        String id = providerId == null ? "" : providerId.trim().toLowerCase(Locale.ROOT);
        Map<String, Object> provider = BY_ID.get(id);
        if (provider == null) throw new IllegalArgumentException("unknown AI provider");
        return provider;
    }

    public static List<Map<String, Object>> forKind(String kind) {
        String expected = kind == null ? "" : kind.trim().toLowerCase(Locale.ROOT);
        if (!Set.of("chat", "tts").contains(expected)) {
            throw new IllegalArgumentException("unknown AI provider kind");
        }
        return PROVIDERS.stream().filter(provider -> expected.equals(provider.get("kind"))).toList();
    }

    private static List<Map<String, Object>> buildProviders() {
        List<Map<String, Object>> providers = new ArrayList<>();

        providers.add(provider("openai", "chat", "OpenAI", "openai-compatible", "ready",
            List.of("chat.stream", "chat.tools"), List.of("api-key"), "",
            links("https://platform.openai.com/api-keys", "https://platform.openai.com/docs/api-reference")));
        providers.add(provider("deepseek", "chat", "DeepSeek", "openai-compatible", "ready",
            List.of("chat.stream", "chat.tools"), List.of("api-key"), "",
            links("https://platform.deepseek.com/api_keys", "https://platform.deepseek.com/api-docs")));
        providers.add(provider("qwen-dashscope", "chat", "通义千问", "openai-compatible", "ready",
            List.of("chat.stream", "chat.tools"), List.of("api-key"), "",
            links("https://bailian.console.aliyun.com/", "https://help.aliyun.com/zh/model-studio/")));
        providers.add(provider("moonshot-kimi", "chat", "Kimi / Moonshot", "openai-compatible", "ready",
            List.of("chat.stream", "chat.tools"), List.of("api-key"), "",
            links("https://platform.moonshot.cn/console/api-keys", "https://platform.moonshot.cn/docs")));
        providers.add(provider("zhipu-glm", "chat", "智谱 GLM", "openai-compatible", "ready",
            List.of("chat.stream", "chat.tools"), List.of("api-key"), "",
            links("https://open.bigmodel.cn/usercenter/apikeys", "https://open.bigmodel.cn/dev/api")));
        providers.add(provider("volcengine-ark", "chat", "豆包大模型 / Ark", "openai-compatible", "ready",
            List.of("chat.stream", "chat.tools"), List.of("api-key"), "",
            links("https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey", "https://www.volcengine.com/docs/82379")));
        providers.add(provider("siliconflow", "chat", "硅基流动", "openai-compatible", "ready",
            List.of("chat.stream", "chat.tools"), List.of("api-key"), "",
            links("https://cloud.siliconflow.cn/account/ak", "https://cloud.siliconflow.cn/me/models")));
        providers.add(provider("openrouter", "chat", "OpenRouter", "openai-compatible", "ready",
            List.of("chat.stream", "chat.tools"), List.of("api-key"), "",
            links("https://openrouter.ai/settings/keys", "https://openrouter.ai/docs")));
        providers.add(provider("ollama", "chat", "Ollama", "openai-compatible", "ready",
            List.of("chat.stream", "chat.local"), List.of("none"), "",
            links("https://ollama.com/", "https://ollama.com/search")));
        providers.add(provider("lm-studio", "chat", "LM Studio", "openai-compatible", "ready",
            List.of("chat.stream", "chat.local"), List.of("none"), "",
            links("https://lmstudio.ai/", "https://lmstudio.ai/docs")));
        providers.add(provider("custom-openai-compatible", "chat", "自定义 OpenAI 兼容", "openai-compatible", "ready",
            List.of("chat.stream", "chat.tools", "endpoint.user-configurable"), List.of("api-key", "none"), "",
            Map.of()));

        providers.add(provider(DOUBAO_TTS_V3_ID, "tts", "豆包实时语音", "volcengine-tts-v3", "ready",
            List.of("tts.one-shot", "tts.stream-output", "tts.duplex-text", "tts.emotion", "tts.voice-catalog"),
            List.of("api-key", "legacy-app-access"), DOUBAO_TTS_V3_ENDPOINT,
            links(
                "https://console.volcengine.com/speech/new/setting/apikeys?projectName=default",
                "https://www.volcengine.com/docs/6561/2532486?lang=zh"
            )));
        providers.add(provider("openai-tts", "tts", "OpenAI TTS", "openai-compatible", "ready",
            List.of("tts.one-shot"), List.of("api-key"), "",
            links("https://platform.openai.com/api-keys", "https://platform.openai.com/docs/guides/text-to-speech")));
        providers.add(provider("siliconflow-cosyvoice", "tts", "硅基流动 CosyVoice", "openai-compatible", "ready",
            List.of("tts.one-shot"), List.of("api-key"), "",
            links("https://cloud.siliconflow.cn/account/ak", "https://cloud.siliconflow.cn/me/models")));
        providers.add(plannedTts("dashscope-cosyvoice", "阿里云 CosyVoice", "dashscope-tts",
            "https://bailian.console.aliyun.com/", "https://help.aliyun.com/zh/model-studio/"));
        providers.add(plannedTts("azure-speech", "Azure AI Speech", "azure-speech",
            "https://ai.azure.com/", "https://ai.azure.com/"));
        providers.add(plannedTts("minimax-tts", "MiniMax 语音", "minimax-tts",
            "https://platform.minimaxi.com/", "https://platform.minimaxi.com/document/"));
        providers.add(plannedTts("tencent-cloud-tts", "腾讯云语音合成", "tencent-tts",
            "https://cloud.tencent.com/product/tts", "https://cloud.tencent.com/document/product/1073"));
        providers.add(plannedTts("baidu-cloud-tts", "百度智能云语音合成", "baidu-tts",
            "https://ai.baidu.com/tech/speech/tts", "https://ai.baidu.com/ai-doc/SPEECH/"));
        providers.add(plannedTts("iflytek-tts", "讯飞开放平台语音合成", "iflytek-tts",
            "https://www.xfyun.cn/services/online_tts", "https://www.xfyun.cn/doc/tts/online_tts/API.html"));
        providers.add(provider("custom-openai-compatible-tts", "tts", "自定义 OpenAI 兼容 TTS",
            "openai-compatible", "ready", List.of("tts.one-shot", "endpoint.user-configurable"),
            List.of("api-key", "none"), "", Map.of()));

        return List.copyOf(providers);
    }

    private static Map<String, Object> plannedTts(
        String id,
        String label,
        String protocol,
        String console,
        String docs
    ) {
        return provider(id, "tts", label, protocol, "planned", List.of("tts.one-shot"),
            List.of("provider-specific"), "", links(console, docs));
    }

    private static Map<String, Object> provider(
        String id,
        String kind,
        String displayName,
        String protocol,
        String implementationStatus,
        List<String> capabilities,
        List<String> authModes,
        String endpoint,
        Map<String, Object> links
    ) {
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("id", id);
        result.put("kind", kind);
        result.put("displayName", displayName);
        result.put("protocol", protocol);
        result.put("implementationStatus", implementationStatus);
        result.put("capabilities", List.copyOf(capabilities));
        result.put("authModes", List.copyOf(authModes));
        if (!endpoint.isBlank()) result.put("endpoint", endpoint);
        if (!links.isEmpty()) result.put("links", links);
        return Map.copyOf(result);
    }

    private static Map<String, Object> links(String console, String docs) {
        validateOfficialHttpsLink(console);
        validateOfficialHttpsLink(docs);
        return Map.of("console", console, "docs", docs);
    }

    private static void validateOfficialHttpsLink(String raw) {
        URI uri = URI.create(raw);
        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null ||
            uri.getFragment() != null || !OFFICIAL_LINK_HOSTS.contains(host)) {
            throw new IllegalStateException("provider catalog contains a non-official link");
        }
    }

    private static Map<String, Map<String, Object>> index(List<Map<String, Object>> providers) {
        LinkedHashMap<String, Map<String, Object>> result = new LinkedHashMap<>();
        for (Map<String, Object> provider : providers) {
            String id = String.valueOf(provider.get("id"));
            if (result.put(id, provider) != null) throw new IllegalStateException("duplicate AI provider ID");
        }
        return Map.copyOf(result);
    }
}
