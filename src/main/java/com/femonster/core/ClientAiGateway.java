package com.femonster.core;

import com.femonster.ai.AiProviderCatalog;
import com.femonster.ai.tts.DoubaoV3Config;
import com.femonster.json.SimpleJson;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.AclEntry;
import java.nio.file.attribute.AclEntryPermission;
import java.nio.file.attribute.AclEntryType;
import java.nio.file.attribute.AclFileAttributeView;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.nio.file.attribute.UserPrincipal;
import java.time.Duration;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Owns the installed client's user-supplied OpenAI-compatible model and TTS
 * connection. The browser receives only a redacted snapshot; configuration and
 * secrets are committed together in one owner-only state file.
 *
 * <p>The file is protected by the current OS user's ACL, but is not encrypted.
 * The narrow public interface deliberately permits a future OS credential-vault
 * backend without exposing raw credentials to the web layer.</p>
 */
public final class ClientAiGateway implements AutoCloseable {
    public enum Kind {
        CHAT("/chat/completions"),
        TTS("/audio/speech");

        private final String suffix;
        Kind(String suffix) { this.suffix = suffix; }
    }

    public static final String STATE_FILE_NAME = "client-ai-state.json";
    private static final int STATE_VERSION = 3;
    private static final int MAX_STATE_BYTES = 64 * 1024;
    private static final int MAX_BASE_URL_LENGTH = 800;
    private static final int MAX_PROVIDER_LENGTH = 48;
    private static final int MAX_MODEL_LENGTH = 240;
    private static final int MAX_VOICE_LENGTH = 240;
    private static final int MAX_KEY_LENGTH = 4096;
    private static final int MAX_REQUEST_BYTES = 2 * 1024 * 1024;
    private static final int MAX_ERROR_BYTES = 32 * 1024;
    public static final long MAX_CHAT_BODY_BYTES = 8L * 1024 * 1024;
    public static final long MAX_STREAM_BYTES = 16L * 1024 * 1024;
    public static final long MAX_TTS_BODY_BYTES = 32L * 1024 * 1024;
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(8);
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(150);
    private static final Set<String> BLOCKED_PAYLOAD_KEYS = Set.of(
        "baseurl", "apikey", "config", "headers", "authorization", "proxyurl"
    );

    private final Path dataDir;
    private final Path stateFile;
    private final HttpClient http;
    private final Object stateLock = new Object();
    private final ConcurrentHashMap<String, CompletableFuture<HttpResponse<InputStream>>> activeRequests =
        new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, InputStream> activeStreams = new ConcurrentHashMap<>();
    private final Set<String> activeIds = ConcurrentHashMap.newKeySet();
    private final Set<String> cancellationSignals = ConcurrentHashMap.newKeySet();
    private final ConcurrentHashMap<String, Long> earlyCancellations = new ConcurrentHashMap<>();
    private static final long EARLY_CANCELLATION_TTL_MS = 10_000L;
    private final AtomicBoolean closed = new AtomicBoolean(false);
    private volatile StoredState state;
    private volatile ClientAiException stateError;
    private volatile boolean statePresent;

    public ClientAiGateway(Path dataDir) {
        this(dataDir, HttpClient.newBuilder()
            .connectTimeout(CONNECT_TIMEOUT)
            .followRedirects(HttpClient.Redirect.NEVER)
            .build());
    }

    ClientAiGateway(Path dataDir, HttpClient http) {
        this.dataDir = dataDir.toAbsolutePath().normalize();
        this.stateFile = this.dataDir.resolve(STATE_FILE_NAME);
        this.http = http;
        loadInitialState();
    }

    /** Returns a complete but secret-free snapshot for the settings UI. */
    public Map<String, Object> snapshot() {
        StoredState current = state;
        ClientAiException error = stateError;
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("ok", error == null);
        result.put("configState", error == null ? (statePresent ? "ready" : "missing") : "invalid");
        if (error != null) result.put("errorCode", error.errorCode());
        result.put("revision", current.revision());
        result.put("schemaVersion", (long) STATE_VERSION);
        result.put("modelMode", current.modelMode());
        result.put("ttsMode", current.ttsMode());
        result.put("ttsEnabled", current.ttsEnabled());
        result.put("model", publicProvider(current.model(), current.modelMode(), false));
        result.put("tts", AiProviderCatalog.DOUBAO_TTS_V3_ID.equals(current.tts().provider())
            ? publicDoubao(current.doubaoTts(), current.ttsMode())
            : publicProvider(current.tts(), current.ttsMode(), true));
        return result;
    }

    /** Applies a partial patch and atomically commits config plus secrets. */
    public Map<String, Object> configure(Map<String, Object> patch) {
        if (patch == null) throw ClientAiException.bad("configuration patch is required");
        synchronized (stateLock) {
            ensureOpen();
            StoredState previous = stateError == null ? state : emptyState();
            String modelMode = patch.containsKey("modelMode")
                ? normalizeMode(SimpleJson.asString(patch.get("modelMode"), "server"))
                : previous.modelMode();
            // One source switch owns both inference and speech. This prevents a
            // local model reply from silently escaping to server TTS (or vice
            // versa) and makes the persisted state deterministic after restart.
            String ttsMode = modelMode;
            boolean ttsEnabled = patch.containsKey("ttsEnabled")
                ? SimpleJson.asBoolean(patch.get("ttsEnabled"), previous.ttsEnabled())
                : previous.ttsEnabled();
            Provider model = patch.containsKey("model")
                ? patchProvider(previous.model(), SimpleJson.asMap(patch.get("model")), false)
                : previous.model();
            Map<String, Object> ttsPatch = patch.containsKey("tts")
                ? SimpleJson.asMap(patch.get("tts"))
                : Map.of();
            Provider tts = patch.containsKey("tts")
                ? patchTtsProvider(previous.tts(), ttsPatch)
                : previous.tts();
            DoubaoTtsState doubaoTts = previous.doubaoTts();
            if (patch.containsKey("tts")) {
                if (AiProviderCatalog.DOUBAO_TTS_V3_ID.equals(tts.provider())) {
                    doubaoTts = patchDoubao(previous.doubaoTts(), ttsPatch);
                } else if (AiProviderCatalog.DOUBAO_TTS_V3_ID.equals(previous.tts().provider())) {
                    doubaoTts = emptyDoubaoState();
                }
            }
            StoredState next = new StoredState(
                STATE_VERSION,
                Math.max(0, previous.revision()) + 1,
                modelMode,
                ttsMode,
                ttsEnabled,
                model,
                tts,
                doubaoTts
            );
            validateState(next);
            try {
                persist(next);
            } catch (IOException error) {
                throw ClientAiException.transientError("无法安全保存本地自备模型配置");
            }
            state = next;
            stateError = null;
            statePresent = true;
            return snapshot();
        }
    }

    /** Resolves the Java-owned Doubao credential and typed settings for a local realtime session. */
    public DoubaoV3Config doubaoTtsConfig() {
        ensureOpen();
        if (stateError != null) throw ClientAiException.configInvalid();
        StoredState current = state;
        if (!current.ttsEnabled()) {
            throw ClientAiException.notReady("客户端 TTS 已关闭");
        }
        if (!"custom".equals(current.ttsMode()) ||
            !AiProviderCatalog.DOUBAO_TTS_V3_ID.equals(current.tts().provider())) {
            throw ClientAiException.notReady("当前未启用豆包实时语音");
        }
        try {
            return toDoubaoConfig(current.doubaoTts());
        } catch (IllegalArgumentException error) {
            throw ClientAiException.notReady("请先完整配置豆包实时语音和鉴权");
        }
    }

    /** Executes using only the persisted endpoint, model, voice and credential. */
    public UpstreamResponse execute(Kind kind, Map<String, Object> payload, String requestId) {
        ensureOpen();
        if (kind == null) throw ClientAiException.bad("client AI kind is required");
        if (stateError != null) throw ClientAiException.configInvalid();
        StoredState current = state;
        if (kind == Kind.TTS && !current.ttsEnabled()) {
            throw ClientAiException.notReady("客户端 TTS 已关闭");
        }
        Provider provider = kind == Kind.TTS ? current.tts() : current.model();
        String mode = kind == Kind.TTS ? current.ttsMode() : current.modelMode();
        if (kind == Kind.TTS && AiProviderCatalog.DOUBAO_TTS_V3_ID.equals(provider.provider())) {
            throw ClientAiException.bad("豆包实时语音必须使用本地流式会话接口");
        }
        ensureReady(kind, mode, provider);
        validateResolvedDestination(provider.baseUrl());

        LinkedHashMap<String, Object> upstreamPayload = safePayload(payload);
        upstreamPayload.put("model", provider.model());
        if (kind == Kind.TTS) upstreamPayload.put("voice", provider.voice());
        byte[] requestBody = SimpleJson.stringify(upstreamPayload).getBytes(StandardCharsets.UTF_8);
        if (requestBody.length > MAX_REQUEST_BYTES) throw ClientAiException.tooLarge("client AI request");

        URI upstream = buildUpstream(provider.baseUrl(), kind.suffix);
        HttpRequest.Builder builder = HttpRequest.newBuilder(upstream)
            .timeout(REQUEST_TIMEOUT)
            .header("Content-Type", "application/json")
            .header("Accept", kind == Kind.TTS ? "audio/*" : "application/json, text/event-stream")
            .POST(HttpRequest.BodyPublishers.ofByteArray(requestBody));
        if (!provider.apiKey().isBlank()) builder.header("Authorization", "Bearer " + provider.apiKey());

        String correlationId = normalizeRequestId(requestId);
        if (consumeEarlyCancellation(correlationId)) throw ClientAiException.cancelled();
        if (!activeIds.add(correlationId)) {
            throw ClientAiException.bad("client AI requestId is already active");
        }
        if (consumeEarlyCancellation(correlationId)) {
            activeIds.remove(correlationId);
            throw ClientAiException.cancelled();
        }
        CompletableFuture<HttpResponse<InputStream>> future;
        try {
            future = http.sendAsync(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
        } catch (RuntimeException error) {
            cancellationSignals.remove(correlationId);
            activeIds.remove(correlationId);
            throw ClientAiException.transientError("无法连接本地自备模型服务");
        }
        activeRequests.put(correlationId, future);
        if (cancellationSignals.contains(correlationId)) {
            activeRequests.remove(correlationId, future);
            future.cancel(true);
        }

        HttpResponse<InputStream> response;
        try {
            response = future.get();
        } catch (CancellationException error) {
            cancellationSignals.remove(correlationId);
            activeIds.remove(correlationId);
            throw ClientAiException.cancelled();
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            future.cancel(true);
            activeIds.remove(correlationId);
            throw ClientAiException.cancelled();
        } catch (ExecutionException error) {
            if (future.isCancelled() || cancellationSignals.remove(correlationId)) {
                activeIds.remove(correlationId);
                throw ClientAiException.cancelled();
            }
            activeIds.remove(correlationId);
            throw ClientAiException.transientError("无法连接本地自备模型服务");
        } finally {
            activeRequests.remove(correlationId, future);
        }

        InputStream body = response.body();
        activeStreams.put(correlationId, body);
        if (cancellationSignals.contains(correlationId)) {
            finishBody(correlationId, body);
            throw ClientAiException.cancelled();
        }
        int status = response.statusCode();
        if (status < 200 || status >= 300) {
            try {
                discardBounded(body, MAX_ERROR_BYTES);
                if (cancellationSignals.contains(correlationId)) throw ClientAiException.cancelled();
                throw ClientAiException.upstream(status);
            } finally {
                finishBody(correlationId, body);
            }
        }
        if (status == 204) {
            finishBody(correlationId, body);
            throw ClientAiException.upstream(502);
        }
        String contentType = response.headers().firstValue("content-type").orElse("").toLowerCase(Locale.ROOT);
        if (kind == Kind.CHAT && contentType.startsWith("text/event-stream")) {
            return UpstreamResponse.streaming(
                status,
                "text/event-stream; charset=utf-8",
                body,
                () -> finishBody(correlationId, body)
            );
        }
        if (kind == Kind.CHAT) {
            if (!contentType.startsWith("application/json")) {
                finishBody(correlationId, body);
                throw ClientAiException.transientError("自备模型返回了不支持的文本格式");
            }
            try {
                byte[] bytes = readBounded(body, MAX_CHAT_BODY_BYTES, "chat response");
                if (cancellationSignals.contains(correlationId)) throw ClientAiException.cancelled();
                return UpstreamResponse.buffered(status, "application/json; charset=utf-8", bytes);
            } catch (ClientAiException error) {
                if (cancellationSignals.contains(correlationId)) throw ClientAiException.cancelled();
                throw error;
            } finally {
                finishBody(correlationId, body);
            }
        }
        if (!contentType.startsWith("audio/")) {
            finishBody(correlationId, body);
            throw ClientAiException.transientError("自备语音服务没有返回音频");
        }
        try {
            byte[] bytes = readBounded(body, MAX_TTS_BODY_BYTES, "tts response");
            if (cancellationSignals.contains(correlationId)) throw ClientAiException.cancelled();
            return UpstreamResponse.buffered(status, contentType, bytes);
        } catch (ClientAiException error) {
            if (cancellationSignals.contains(correlationId)) throw ClientAiException.cancelled();
            throw error;
        } finally {
            finishBody(correlationId, body);
        }
    }

    /** Cancels a request waiting for headers or closes its active response stream. */
    public boolean cancel(String requestId) {
        if (requestId == null || requestId.isBlank()) return false;
        String id = normalizeRequestId(requestId);
        if (!activeIds.contains(id)) {
            pruneEarlyCancellations();
            earlyCancellations.put(id, System.currentTimeMillis());
            return true;
        }
        cancellationSignals.add(id);
        CompletableFuture<HttpResponse<InputStream>> future = activeRequests.remove(id);
        if (future != null) future.cancel(true);
        InputStream stream = activeStreams.remove(id);
        if (stream != null) closeQuietly(stream);
        return true;
    }

    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) return;
        for (CompletableFuture<?> future : activeRequests.values()) future.cancel(true);
        activeRequests.clear();
        cancellationSignals.clear();
        earlyCancellations.clear();
        for (InputStream stream : activeStreams.values()) closeQuietly(stream);
        activeStreams.clear();
        activeIds.clear();
    }

    public static final class UpstreamResponse implements AutoCloseable {
        private final int status;
        private final String contentType;
        private final byte[] body;
        private final InputStream stream;
        private final Runnable onClose;
        private final AtomicBoolean closed = new AtomicBoolean(false);

        private UpstreamResponse(int status, String contentType, byte[] body, InputStream stream, Runnable onClose) {
            this.status = status;
            this.contentType = contentType;
            this.body = body;
            this.stream = stream;
            this.onClose = onClose;
        }

        static UpstreamResponse buffered(int status, String contentType, byte[] body) {
            return new UpstreamResponse(status, contentType, body, null, () -> {});
        }

        static UpstreamResponse streaming(int status, String contentType, InputStream stream, Runnable onClose) {
            return new UpstreamResponse(status, contentType, null, stream, onClose);
        }

        public int status() { return status; }
        public String contentType() { return contentType; }
        public boolean streaming() { return stream != null; }
        public byte[] body() { return body; }
        public InputStream stream() { return stream; }

        @Override
        public void close() {
            if (!closed.compareAndSet(false, true)) return;
            if (stream != null) closeQuietly(stream);
            onClose.run();
        }
    }

    private static Provider patchProvider(Provider previous, Map<String, Object> patch, boolean tts) {
        String provider = patch.containsKey("provider")
            ? strictText(patch.get("provider"), "provider", MAX_PROVIDER_LENGTH, true)
            : previous.provider();
        String baseUrl = patch.containsKey("baseUrl")
            ? strictText(patch.get("baseUrl"), "baseUrl", MAX_BASE_URL_LENGTH, true)
            : previous.baseUrl();
        baseUrl = trimTrailingSlash(baseUrl);
        String model = patch.containsKey("model")
            ? strictText(patch.get("model"), "model", MAX_MODEL_LENGTH, true)
            : previous.model();
        String voice = tts && patch.containsKey("voice")
            ? strictText(patch.get("voice"), "voice", MAX_VOICE_LENGTH, true)
            : previous.voice();
        String key = previous.apiKey();
        boolean endpointSame = previous.provider().equals(provider)
            && normalizedOrigin(previous.baseUrl()).equals(normalizedOrigin(baseUrl));
        if (SimpleJson.asBoolean(patch.get("clearApiKey"), false)) {
            key = "";
        } else if (patch.containsKey("apiKey")) {
            String supplied = SimpleJson.asString(patch.get("apiKey"), "");
            if (supplied.isBlank()) {
                if (!endpointSame) key = "";
            } else {
                key = validateKey(supplied);
            }
        } else if (!endpointSame) {
            key = "";
        }
        Provider result = new Provider(provider, baseUrl, model, tts ? voice : "", key);
        if (!result.baseUrl().isBlank()) validateBaseUrl(result.baseUrl());
        return result;
    }

    private static Provider patchTtsProvider(Provider previous, Map<String, Object> patch) {
        String requestedProvider = patch.containsKey("provider")
            ? strictText(patch.get("provider"), "provider", MAX_PROVIDER_LENGTH, true)
            : previous.provider();
        validateTtsPatchFields(requestedProvider, patch);
        if (!AiProviderCatalog.DOUBAO_TTS_V3_ID.equals(requestedProvider)) {
            return patchProvider(previous, patch, true);
        }
        for (String protectedField : List.of("baseUrl", "endpoint", "headers", "authorization", "apiKey")) {
            if (patch.containsKey(protectedField)) {
                throw ClientAiException.bad("Doubao endpoint and credential are owned by the installed client");
            }
        }
        String modelVariant = patch.containsKey("modelVariant")
            ? strictText(patch.get("modelVariant"), "modelVariant", MAX_MODEL_LENGTH, false)
            : previous.model().isBlank() ? "seed-tts-2.0-standard" : previous.model();
        String voice = patch.containsKey("voice")
            ? normalizeDoubaoVoiceDraft(SimpleJson.asString(patch.get("voice"), ""))
            : normalizeDoubaoVoiceDraft(previous.voice());
        return new Provider(requestedProvider, "", modelVariant, voice, "");
    }

    private static DoubaoTtsState patchDoubao(DoubaoTtsState previous, Map<String, Object> patch) {
        String resourceId = patch.containsKey("resourceId")
            ? strictText(patch.get("resourceId"), "resourceId", 64, false)
            : previous.resourceId().isBlank() ? "seed-tts-2.0" : previous.resourceId();
        String modelVariant = patch.containsKey("modelVariant")
            ? strictText(patch.get("modelVariant"), "modelVariant", MAX_MODEL_LENGTH, false)
            : previous.modelVariant().isBlank() ? "seed-tts-2.0-standard" : previous.modelVariant();
        String voice = patch.containsKey("voice")
            ? normalizeDoubaoVoiceDraft(SimpleJson.asString(patch.get("voice"), ""))
            : normalizeDoubaoVoiceDraft(previous.speaker());
        String speaker = voice.isBlank() ? "" : voice.substring("doubao:".length());

        Map<String, Object> output = patch.containsKey("output")
            ? SimpleJson.asMap(patch.get("output"))
            : Map.of();
        String format = output.containsKey("format")
            ? strictText(output.get("format"), "format", 24, false).toLowerCase(Locale.ROOT)
            : previous.format().isBlank() ? "mp3" : previous.format();
        int sampleRate = output.containsKey("sampleRate")
            ? SimpleJson.asInt(output.get("sampleRate"), -1)
            : previous.sampleRate() <= 0 ? 24000 : previous.sampleRate();
        int bitRate = output.containsKey("bitRate")
            ? SimpleJson.asInt(output.get("bitRate"), -1)
            : previous.bitRate() <= 0 && "mp3".equals(format) ? 128000 : previous.bitRate();

        Map<String, Object> prosody = patch.containsKey("prosody")
            ? SimpleJson.asMap(patch.get("prosody"))
            : Map.of();
        String emotion = prosody.containsKey("emotion")
            ? strictText(prosody.get("emotion"), "emotion", 240, true)
            : previous.emotion();
        int emotionScale = prosody.containsKey("emotionScale")
            ? SimpleJson.asInt(prosody.get("emotionScale"), -1)
            : previous.emotionScale() <= 0 ? 4 : previous.emotionScale();
        int speechRate = prosody.containsKey("speechRate")
            ? SimpleJson.asInt(prosody.get("speechRate"), Integer.MIN_VALUE)
            : previous.speechRate();
        int loudnessRate = prosody.containsKey("loudnessRate")
            ? SimpleJson.asInt(prosody.get("loudnessRate"), Integer.MIN_VALUE)
            : previous.loudnessRate();

        String authMode = previous.authMode();
        String apiKey = previous.apiKey();
        String appId = previous.appId();
        String accessKey = previous.accessKey();
        Map<String, Object> credentials = patch.containsKey("credentialPatch")
            ? SimpleJson.asMap(patch.get("credentialPatch"))
            : Map.of();
        if (SimpleJson.asBoolean(patch.get("clearCredential"), false)) {
            authMode = "";
            apiKey = "";
            appId = "";
            accessKey = "";
        } else if (!credentials.isEmpty()) {
            String requestedMode = credentials.containsKey("authMode")
                ? strictText(credentials.get("authMode"), "authMode", 32, false)
                : authMode;
            if ("api-key".equals(requestedMode)) {
                String supplied = SimpleJson.asString(credentials.get("apiKey"), "");
                if (!supplied.isBlank()) apiKey = validateKey(supplied);
                else if (!"api-key".equals(authMode)) apiKey = "";
                authMode = "api-key";
                appId = "";
                accessKey = "";
            } else if ("legacy-app-access".equals(requestedMode)) {
                String suppliedApp = SimpleJson.asString(credentials.get("appId"), "");
                String suppliedAccess = SimpleJson.asString(credentials.get("accessKey"), "");
                if (!suppliedApp.isBlank()) appId = validateKey(suppliedApp);
                else if (!"legacy-app-access".equals(authMode)) appId = "";
                if (!suppliedAccess.isBlank()) accessKey = validateKey(suppliedAccess);
                else if (!"legacy-app-access".equals(authMode)) accessKey = "";
                authMode = "legacy-app-access";
                apiKey = "";
            } else {
                throw ClientAiException.bad("unsupported Doubao authentication mode");
            }
        }
        DoubaoTtsState next = new DoubaoTtsState(
            resourceId,
            modelVariant,
            speaker,
            format,
            sampleRate,
            bitRate,
            emotion,
            emotionScale,
            speechRate,
            loudnessRate,
            authMode,
            apiKey,
            appId,
            accessKey
        );
        validateDoubaoState(next, true);
        return next;
    }

    private static void validateState(StoredState state) {
        if (state.version() != STATE_VERSION) throw ClientAiException.bad("unsupported client AI state version");
        if (state.revision() < 0) throw ClientAiException.bad("invalid client AI state revision");
        if (!state.modelMode().equals(state.ttsMode())) {
            throw ClientAiException.bad("model and TTS sources must match");
        }
        validateProvider(state.model(), false);
        validateProvider(state.tts(), true);
        validateDoubaoState(state.doubaoTts(), AiProviderCatalog.DOUBAO_TTS_V3_ID.equals(state.tts().provider()));
    }

    private static void validateProvider(Provider provider, boolean tts) {
        strictText(provider.provider(), "provider", MAX_PROVIDER_LENGTH, true);
        strictText(provider.baseUrl(), "baseUrl", MAX_BASE_URL_LENGTH, true);
        strictText(provider.model(), "model", MAX_MODEL_LENGTH, true);
        if (tts) strictText(provider.voice(), "voice", MAX_VOICE_LENGTH, true);
        if (!provider.baseUrl().isBlank()) validateBaseUrl(provider.baseUrl());
        if (!provider.apiKey().isBlank()) validateKey(provider.apiKey());
        if (tts) validateClientCloudTtsProvider(provider);
    }

    /**
     * The installed client owns cloud TTS credentials only.  Local/loopback
     * inference remains valid for chat, but speech must never be routed to a
     * server-side Chatterbox/Python worker or another private-network process.
     */
    private static void validateClientCloudTtsProvider(Provider provider) {
        if (provider.provider().isBlank() && provider.baseUrl().isBlank()
            && provider.model().isBlank() && provider.voice().isBlank()
            && provider.apiKey().isBlank()) {
            return;
        }

        Map<String, Object> descriptor;
        try {
            descriptor = AiProviderCatalog.require(provider.provider());
        } catch (IllegalArgumentException error) {
            throw ClientAiException.bad("unsupported client cloud TTS provider");
        }
        if (!"tts".equals(descriptor.get("kind"))
            || !"ready".equals(descriptor.get("implementationStatus"))) {
            throw ClientAiException.bad("client TTS provider is not implemented");
        }
        if (AiProviderCatalog.DOUBAO_TTS_V3_ID.equals(provider.provider())) return;

        if (provider.baseUrl().isBlank()) return; // UI may persist an incomplete cloud draft.
        URI endpoint = parseBaseUrl(provider.baseUrl());
        if (!"https".equalsIgnoreCase(endpoint.getScheme()) || isLoopbackHost(endpoint.getHost())) {
            throw ClientAiException.bad("client TTS must use a remote HTTPS cloud endpoint");
        }
        if (isBlockedLiteral(endpoint.getHost())) {
            throw ClientAiException.bad("client TTS must not use a private-network endpoint");
        }
    }

    private static void validateTtsPatchFields(String providerId, Map<String, Object> patch) {
        Set<String> allowed = AiProviderCatalog.DOUBAO_TTS_V3_ID.equals(providerId)
            ? Set.of(
                "provider", "resourceId", "modelVariant", "voice", "output", "prosody",
                "credentialPatch", "clearCredential"
            )
            : Set.of("provider", "baseUrl", "model", "voice", "apiKey", "clearApiKey");
        for (String key : patch.keySet()) {
            if (key == null || !allowed.contains(key)) {
                throw ClientAiException.bad("client TTS configuration contains an unsupported field");
            }
        }
    }

    private static void validateDoubaoState(DoubaoTtsState state, boolean active) {
        if (!active && state.equals(emptyDoubaoState())) return;
        try {
            DoubaoV3Config.Credential placeholder = new DoubaoV3Config.ApiKeyCredential("validation-only");
            new DoubaoV3Config(
                state.resourceId(),
                state.modelVariant(),
                state.speaker().isBlank() ? "draft-speaker" : state.speaker(),
                new DoubaoV3Config.AudioOutput(parseDoubaoFormat(state.format()), state.sampleRate(), state.bitRate()),
                new DoubaoV3Config.Prosody(
                    state.emotion(), state.emotionScale(), state.speechRate(), state.loudnessRate()),
                placeholder
            );
        } catch (IllegalArgumentException error) {
            throw ClientAiException.bad("invalid Doubao TTS configuration");
        }
        if (!state.apiKey().isBlank()) validateKey(state.apiKey());
        if (!state.appId().isBlank()) validateKey(state.appId());
        if (!state.accessKey().isBlank()) validateKey(state.accessKey());
        if (!Set.of("", "api-key", "legacy-app-access").contains(state.authMode())) {
            throw ClientAiException.bad("invalid Doubao authentication mode");
        }
    }

    private static DoubaoV3Config toDoubaoConfig(DoubaoTtsState state) {
        DoubaoV3Config.Credential credential;
        if ("api-key".equals(state.authMode()) && !state.apiKey().isBlank()) {
            credential = new DoubaoV3Config.ApiKeyCredential(state.apiKey());
        } else if ("legacy-app-access".equals(state.authMode()) &&
            !state.appId().isBlank() && !state.accessKey().isBlank()) {
            credential = new DoubaoV3Config.LegacyCredential(state.appId(), state.accessKey());
        } else {
            throw new IllegalArgumentException("Doubao credential is incomplete");
        }
        return new DoubaoV3Config(
            state.resourceId(),
            state.modelVariant(),
            state.speaker(),
            new DoubaoV3Config.AudioOutput(parseDoubaoFormat(state.format()), state.sampleRate(), state.bitRate()),
            new DoubaoV3Config.Prosody(state.emotion(), state.emotionScale(), state.speechRate(), state.loudnessRate()),
            credential
        );
    }

    private static DoubaoV3Config.AudioFormat parseDoubaoFormat(String raw) {
        return switch (raw == null ? "" : raw.toLowerCase(Locale.ROOT)) {
            case "mp3" -> DoubaoV3Config.AudioFormat.MP3;
            case "pcm" -> DoubaoV3Config.AudioFormat.PCM;
            case "ogg_opus" -> DoubaoV3Config.AudioFormat.OGG_OPUS;
            default -> throw new IllegalArgumentException("unsupported Doubao audio format");
        };
    }

    private static String normalizeDoubaoVoice(String raw) {
        String value = strictText(raw, "voice", MAX_VOICE_LENGTH, false);
        if (!value.startsWith("doubao:")) value = "doubao:" + value;
        if (value.length() <= "doubao:".length()) throw ClientAiException.bad("Doubao voice is required");
        return value;
    }

    private static String normalizeDoubaoVoiceDraft(String raw) {
        String value = strictText(raw, "voice", MAX_VOICE_LENGTH, true);
        return value.isBlank() ? "" : normalizeDoubaoVoice(value);
    }

    private static LinkedHashMap<String, Object> safePayload(Map<String, Object> payload) {
        if (payload == null || payload.isEmpty()) throw ClientAiException.bad("client AI payload is required");
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : payload.entrySet()) {
            String key = entry.getKey() == null ? "" : entry.getKey();
            if (BLOCKED_PAYLOAD_KEYS.contains(key.toLowerCase(Locale.ROOT))) {
                throw ClientAiException.bad("client AI payload contains a protected field");
            }
            result.put(key, entry.getValue());
        }
        return result;
    }

    private static void ensureReady(Kind kind, String mode, Provider provider) {
        if (!"custom".equals(mode)) throw ClientAiException.notReady("当前未启用本地自备模型服务");
        if (provider.baseUrl().isBlank() || provider.model().isBlank()) {
            throw ClientAiException.notReady("请先填写自备模型地址和模型名称");
        }
        if (kind == Kind.TTS && provider.voice().isBlank()) {
            throw ClientAiException.notReady("请先填写自备语音音色");
        }
        if (provider.apiKey().isBlank() && !isLoopback(provider.baseUrl())) {
            throw ClientAiException.notReady("远程自备模型需要 API Key");
        }
    }

    private static Map<String, Object> publicProvider(Provider provider, String mode, boolean tts) {
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("provider", provider.provider());
        result.put("baseUrl", provider.baseUrl());
        result.put("model", provider.model());
        result.put("voice", provider.voice());
        result.put("hasApiKey", !provider.apiKey().isBlank());
        result.put("keyLast4", provider.apiKey().isBlank() ? "" : last4(provider.apiKey()));
        boolean cloudTts = !tts || isConfiguredCloudTts(provider);
        boolean ready = "custom".equals(mode)
            && !provider.baseUrl().isBlank()
            && !provider.model().isBlank()
            && (!tts || !provider.voice().isBlank())
            && cloudTts
            && (!provider.apiKey().isBlank() || (!tts && isLoopback(provider.baseUrl())));
        result.put("ready", ready);
        result.put("keylessLoopback", !tts && provider.apiKey().isBlank() && isLoopback(provider.baseUrl()));
        return result;
    }

    private static boolean isConfiguredCloudTts(Provider provider) {
        try {
            validateClientCloudTtsProvider(provider);
            return !provider.provider().isBlank() && !provider.baseUrl().isBlank();
        } catch (ClientAiException error) {
            return false;
        }
    }

    private static Map<String, Object> publicDoubao(DoubaoTtsState state, String mode) {
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("provider", AiProviderCatalog.DOUBAO_TTS_V3_ID);
        result.put("providerId", AiProviderCatalog.DOUBAO_TTS_V3_ID);
        result.put("protocol", "volcengine-tts-v3");
        result.put("resourceId", state.resourceId());
        result.put("modelVariant", state.modelVariant());
        result.put("model", state.modelVariant());
        result.put("voice", state.speaker().isBlank() ? "" : "doubao:" + state.speaker());
        result.put("authMode", state.authMode());
        boolean hasCredential = "api-key".equals(state.authMode())
            ? !state.apiKey().isBlank()
            : "legacy-app-access".equals(state.authMode())
                && !state.appId().isBlank() && !state.accessKey().isBlank();
        result.put("hasCredential", hasCredential);
        result.put("hasApiKey", hasCredential);
        result.put("keyLast4", "");
        result.put("output", Map.of(
            "format", state.format(),
            "sampleRate", state.sampleRate(),
            "bitRate", state.bitRate()
        ));
        result.put("prosody", Map.of(
            "emotion", state.emotion(),
            "emotionScale", state.emotionScale(),
            "speechRate", state.speechRate(),
            "loudnessRate", state.loudnessRate()
        ));
        boolean ready = "custom".equals(mode) && hasCredential && !state.resourceId().isBlank()
            && !state.modelVariant().isBlank() && !state.speaker().isBlank();
        result.put("ready", ready);
        result.put("keylessLoopback", false);
        return result;
    }

    private void loadInitialState() {
        if (!Files.isRegularFile(stateFile)) {
            state = emptyState();
            statePresent = false;
            return;
        }
        try {
            long size = Files.size(stateFile);
            if (size <= 0 || size > MAX_STATE_BYTES) throw new IllegalArgumentException("invalid state size");
            Map<String, Object> root = SimpleJson.parseObjectStrict(
                Files.readString(stateFile, StandardCharsets.UTF_8));
            int sourceVersion = SimpleJson.asInt(root.get("version"), -1);
            StoredState loaded = stateFromMap(root);
            validateState(loaded);
            String persistedTtsMode = normalizeMode(SimpleJson.asString(root.get("ttsMode"), "server"));
            String persistedTtsProvider = SimpleJson.asString(
                SimpleJson.asMap(root.get("tts")).get("provider"), "");
            if (sourceVersion < STATE_VERSION || !loaded.ttsMode().equals(persistedTtsMode)
                || !loaded.tts().provider().equals(persistedTtsProvider)) {
                persist(loaded);
            }
            state = loaded;
            statePresent = true;
            restrictOwnerOnly(stateFile);
        } catch (Exception error) {
            state = emptyState();
            statePresent = true;
            stateError = ClientAiException.configInvalid();
        }
    }

    private static StoredState stateFromMap(Map<String, Object> root) {
        int sourceVersion = SimpleJson.asInt(root.get("version"), -1);
        String modelMode = normalizeMode(SimpleJson.asString(root.get("modelMode"), "server"));
        return new StoredState(
            sourceVersion == 1 || sourceVersion == 2 ? STATE_VERSION : sourceVersion,
            SimpleJson.asLong(root.get("revision"), -1),
            modelMode,
            modelMode,
            sourceVersion < STATE_VERSION
                ? true
                : SimpleJson.asBoolean(root.get("ttsEnabled"), true),
            providerFromMap(SimpleJson.asMap(root.get("model")), false),
            providerFromMap(SimpleJson.asMap(root.get("tts")), true),
            sourceVersion == 1
                ? emptyDoubaoState()
                : doubaoStateFromMap(SimpleJson.asMap(root.get("doubaoTts")))
        );
    }

    private static Provider providerFromMap(Map<String, Object> root, boolean tts) {
        Provider loaded = new Provider(
            SimpleJson.asString(root.get("provider"), ""),
            SimpleJson.asString(root.get("baseUrl"), ""),
            SimpleJson.asString(root.get("model"), ""),
            tts ? SimpleJson.asString(root.get("voice"), "") : "",
            SimpleJson.asString(root.get("apiKey"), "")
        );
        return tts ? migrateLegacyTtsProvider(loaded) : loaded;
    }

    private static Provider migrateLegacyTtsProvider(Provider loaded) {
        if (loaded.provider().isBlank()) return loaded;
        String providerId = loaded.provider();
        if ("openai".equals(providerId)) providerId = "openai-tts";
        if (Set.of("custom", "custom-openai-compatible").contains(providerId)) {
            providerId = "custom-openai-compatible-tts";
        }
        Provider candidate = new Provider(
            providerId, loaded.baseUrl(), loaded.model(), loaded.voice(), loaded.apiKey());
        try {
            validateClientCloudTtsProvider(candidate);
            return candidate;
        } catch (ClientAiException error) {
            // Older builds allowed a loopback Python worker in this slot.  Keep
            // the chat model intact, but clear only the incompatible speech
            // draft so it cannot silently reappear after an upgrade.
            return new Provider("", "", "", "", "");
        }
    }

    private static DoubaoTtsState doubaoStateFromMap(Map<String, Object> root) {
        if (root.isEmpty()) return emptyDoubaoState();
        Map<String, Object> output = SimpleJson.asMap(root.get("output"));
        Map<String, Object> prosody = SimpleJson.asMap(root.get("prosody"));
        Map<String, Object> credential = SimpleJson.asMap(root.get("credential"));
        return new DoubaoTtsState(
            SimpleJson.asString(root.get("resourceId"), ""),
            SimpleJson.asString(root.get("modelVariant"), ""),
            SimpleJson.asString(root.get("speaker"), ""),
            SimpleJson.asString(output.get("format"), ""),
            SimpleJson.asInt(output.get("sampleRate"), 0),
            SimpleJson.asInt(output.get("bitRate"), 0),
            SimpleJson.asString(prosody.get("emotion"), ""),
            SimpleJson.asInt(prosody.get("emotionScale"), 0),
            SimpleJson.asInt(prosody.get("speechRate"), 0),
            SimpleJson.asInt(prosody.get("loudnessRate"), 0),
            SimpleJson.asString(credential.get("authMode"), ""),
            SimpleJson.asString(credential.get("apiKey"), ""),
            SimpleJson.asString(credential.get("appId"), ""),
            SimpleJson.asString(credential.get("accessKey"), "")
        );
    }

    private void persist(StoredState next) throws IOException {
        Files.createDirectories(dataDir);
        restrictOwnerOnly(dataDir);
        byte[] bytes = SimpleJson.stringify(stateMap(next)).getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_STATE_BYTES) throw new IOException("state is too large");
        Path temporary = dataDir.resolve(STATE_FILE_NAME + ".tmp-" + UUID.randomUUID());
        boolean posix = FileSystems.getDefault().supportedFileAttributeViews().contains("posix");
        try {
            if (posix) {
                Files.createFile(temporary, PosixFilePermissions.asFileAttribute(
                    EnumSet.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE)));
            } else {
                Files.createFile(temporary);
                restrictOwnerOnly(temporary);
            }
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.WRITE)) {
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) channel.write(buffer);
                channel.force(true);
            }
            try {
                Files.move(
                    temporary,
                    stateFile,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING
                );
            } catch (AtomicMoveNotSupportedException error) {
                throw new IOException("atomic state replacement is unavailable", error);
            }
            restrictOwnerOnly(stateFile);
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private static Map<String, Object> stateMap(StoredState state) {
        LinkedHashMap<String, Object> root = new LinkedHashMap<>();
        root.put("version", state.version());
        root.put("revision", state.revision());
        root.put("modelMode", state.modelMode());
        root.put("ttsMode", state.ttsMode());
        root.put("ttsEnabled", state.ttsEnabled());
        root.put("model", persistedProvider(state.model()));
        root.put("tts", persistedProvider(state.tts()));
        root.put("doubaoTts", persistedDoubao(state.doubaoTts()));
        return root;
    }

    private static Map<String, Object> persistedProvider(Provider provider) {
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("provider", provider.provider());
        result.put("baseUrl", provider.baseUrl());
        result.put("model", provider.model());
        result.put("voice", provider.voice());
        result.put("apiKey", provider.apiKey().isBlank() ? null : provider.apiKey());
        return result;
    }

    private static Map<String, Object> persistedDoubao(DoubaoTtsState state) {
        LinkedHashMap<String, Object> result = new LinkedHashMap<>();
        result.put("resourceId", state.resourceId());
        result.put("modelVariant", state.modelVariant());
        result.put("speaker", state.speaker());
        result.put("output", Map.of(
            "format", state.format(),
            "sampleRate", state.sampleRate(),
            "bitRate", state.bitRate()
        ));
        result.put("prosody", Map.of(
            "emotion", state.emotion(),
            "emotionScale", state.emotionScale(),
            "speechRate", state.speechRate(),
            "loudnessRate", state.loudnessRate()
        ));
        LinkedHashMap<String, Object> credential = new LinkedHashMap<>();
        credential.put("authMode", state.authMode());
        credential.put("apiKey", state.apiKey().isBlank() ? null : state.apiKey());
        credential.put("appId", state.appId().isBlank() ? null : state.appId());
        credential.put("accessKey", state.accessKey().isBlank() ? null : state.accessKey());
        result.put("credential", credential);
        return result;
    }

    private static void restrictOwnerOnly(Path path) throws IOException {
        if (!Files.exists(path)) return;
        if (FileSystems.getDefault().supportedFileAttributeViews().contains("posix")) {
            boolean directory = Files.isDirectory(path);
            EnumSet<PosixFilePermission> permissions = EnumSet.of(
                PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE);
            if (directory) permissions.add(PosixFilePermission.OWNER_EXECUTE);
            Files.setPosixFilePermissions(path, permissions);
            return;
        }
        AclFileAttributeView view = Files.getFileAttributeView(path, AclFileAttributeView.class);
        if (view == null) throw new IOException("owner-only ACLs are unavailable");
        UserPrincipal owner = Files.getOwner(path);
        AclEntry entry = AclEntry.newBuilder()
            .setType(AclEntryType.ALLOW)
            .setPrincipal(owner)
            .setPermissions(EnumSet.allOf(AclEntryPermission.class))
            .build();
        view.setAcl(List.of(entry));
    }

    static void validateBaseUrl(String raw) {
        URI uri = parseBaseUrl(raw);
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        String host = uri.getHost();
        if (uri.getRawUserInfo() != null) throw ClientAiException.bad("baseUrl must not embed credentials");
        if (uri.getRawQuery() != null) throw ClientAiException.bad("baseUrl must not embed a query string");
        if (uri.getRawFragment() != null) throw ClientAiException.bad("baseUrl must not embed a fragment");
        if (host == null || host.isBlank()) throw ClientAiException.bad("baseUrl must have a host");
        if ("http".equals(scheme)) {
            if (!isLoopbackHost(host)) throw ClientAiException.bad("non-loopback endpoints require https");
            if (uri.getPort() < 1) throw ClientAiException.bad("loopback http endpoints require an explicit port");
        }
        if (isBlockedLiteral(host)) throw ClientAiException.bad("baseUrl host is not allowed");
    }

    private static URI parseBaseUrl(String raw) {
        if (raw == null || raw.isBlank()) throw ClientAiException.bad("baseUrl is required");
        try {
            URI uri = new URI(raw);
            String scheme = uri.getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
                throw ClientAiException.bad("baseUrl must use http or https");
            }
            return uri;
        } catch (URISyntaxException error) {
            throw ClientAiException.bad("baseUrl is not a valid URL");
        }
    }

    private static void validateResolvedDestination(String raw) {
        URI uri = parseBaseUrl(raw);
        String host = uri.getHost();
        if (isLoopbackHost(host)) return;
        try {
            for (InetAddress address : InetAddress.getAllByName(host)) {
                if (isProhibitedAddress(address)) {
                    throw ClientAiException.forbidden("自备模型域名解析到了不允许的网络地址");
                }
            }
        } catch (IOException error) {
            throw ClientAiException.transientError("无法解析自备模型服务地址");
        }
    }

    private static boolean isProhibitedAddress(InetAddress address) {
        byte[] raw = address.getAddress();
        boolean carrierGradeNat = raw.length == 4
            && (raw[0] & 0xff) == 100
            && ((raw[1] & 0xff) >= 64 && (raw[1] & 0xff) <= 127);
        boolean uniqueLocalIpv6 = raw.length == 16 && (raw[0] & 0xfe) == 0xfc;
        return carrierGradeNat
            || uniqueLocalIpv6
            || address.isAnyLocalAddress()
            || address.isLoopbackAddress()
            || address.isLinkLocalAddress()
            || address.isSiteLocalAddress()
            || address.isMulticastAddress();
    }

    private static boolean isBlockedLiteral(String host) {
        try {
            if (!(host.contains(":") || host.matches("[0-9.]+"))) return false;
            InetAddress address = InetAddress.getByName(host);
            return isProhibitedAddress(address) && !address.isLoopbackAddress();
        } catch (IOException error) {
            return true;
        }
    }

    private static boolean isLoopback(String raw) {
        try {
            return isLoopbackHost(parseBaseUrl(raw).getHost());
        } catch (ClientAiException error) {
            return false;
        }
    }

    private static boolean isLoopbackHost(String host) {
        if (host == null) return false;
        String normalized = host.toLowerCase(Locale.ROOT);
        if (normalized.startsWith("[") && normalized.endsWith("]")) {
            normalized = normalized.substring(1, normalized.length() - 1);
        }
        if ("localhost".equals(normalized) || "::1".equals(normalized)) return true;
        String[] octets = normalized.split("\\.", -1);
        if (octets.length != 4 || !"127".equals(octets[0])) return false;
        for (String octet : octets) {
            if (octet.isEmpty() || !octet.chars().allMatch(Character::isDigit)) return false;
            try {
                int value = Integer.parseInt(octet);
                if (value < 0 || value > 255) return false;
            } catch (NumberFormatException error) {
                return false;
            }
        }
        return true;
    }

    private static URI buildUpstream(String baseUrl, String suffix) {
        String normalized = trimTrailingSlash(baseUrl);
        return normalized.endsWith(suffix) ? URI.create(normalized) : URI.create(normalized + suffix);
    }

    private static String normalizedOrigin(String raw) {
        if (raw == null || raw.isBlank()) return "";
        try {
            URI uri = new URI(raw);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            int port = uri.getPort();
            if (port < 0) port = "https".equals(scheme) ? 443 : 80;
            return scheme + "://" + host + ":" + port;
        } catch (URISyntaxException error) {
            return "";
        }
    }

    private static String normalizeRequestId(String requestId) {
        String value = requestId == null ? "" : requestId.trim();
        if (value.isEmpty()) return UUID.randomUUID().toString();
        if (value.length() > 128 || !value.matches("[A-Za-z0-9._:-]+")) {
            throw ClientAiException.bad("invalid client AI requestId");
        }
        return value;
    }

    private static String validateKey(String raw) {
        if (raw == null || raw.isBlank()) return "";
        if (raw.length() > MAX_KEY_LENGTH) throw ClientAiException.bad("apiKey is too long");
        for (int index = 0; index < raw.length(); index++) {
            char value = raw.charAt(index);
            if (value < 0x20 || value == 0x7f) throw ClientAiException.bad("apiKey contains unsupported characters");
        }
        return raw;
    }

    private static String strictText(Object raw, String label, int max, boolean allowBlank) {
        String value = SimpleJson.asString(raw, "").trim();
        if (!allowBlank && value.isEmpty()) throw ClientAiException.bad(label + " is required");
        if (value.length() > max) throw ClientAiException.bad(label + " is too long");
        for (int index = 0; index < value.length(); index++) {
            char item = value.charAt(index);
            if (item < 0x20 || item == 0x7f) throw ClientAiException.bad(label + " contains unsupported characters");
        }
        return value;
    }

    private static String normalizeMode(String value) {
        return "custom".equalsIgnoreCase(value) ? "custom" : "server";
    }

    private static String trimTrailingSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/") && result.length() > 1) result = result.substring(0, result.length() - 1);
        return result;
    }

    private static String last4(String value) {
        return value.length() <= 4 ? value : value.substring(value.length() - 4);
    }

    private static byte[] readBounded(InputStream input, long max, String label) {
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            long total = 0;
            int read;
            while ((read = stream.read(buffer)) >= 0) {
                total += read;
                if (total > max) throw ClientAiException.tooLarge(label);
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        } catch (ClientAiException error) {
            throw error;
        } catch (IOException error) {
            throw ClientAiException.transientError("failed to read upstream response");
        }
    }

    private static void discardBounded(InputStream input, long max) {
        try (InputStream stream = input) {
            byte[] buffer = new byte[4096];
            long total = 0;
            int read;
            while ((read = stream.read(buffer)) >= 0 && total <= max) total += read;
        } catch (IOException ignored) {
        }
    }

    private static void closeQuietly(InputStream stream) {
        if (stream == null) return;
        try { stream.close(); } catch (IOException ignored) {}
    }

    private void finishBody(String requestId, InputStream stream) {
        activeStreams.remove(requestId, stream);
        closeQuietly(stream);
        cancellationSignals.remove(requestId);
        activeIds.remove(requestId);
    }

    private boolean consumeEarlyCancellation(String requestId) {
        Long createdAt = earlyCancellations.remove(requestId);
        return createdAt != null && System.currentTimeMillis() - createdAt <= EARLY_CANCELLATION_TTL_MS;
    }

    private void pruneEarlyCancellations() {
        long cutoff = System.currentTimeMillis() - EARLY_CANCELLATION_TTL_MS;
        earlyCancellations.entrySet().removeIf(entry -> entry.getValue() < cutoff);
    }

    private void ensureOpen() {
        if (closed.get()) throw ClientAiException.transientError("client AI gateway is closed");
    }

    private static StoredState emptyState() {
        Provider empty = new Provider("", "", "", "", "");
        return new StoredState(STATE_VERSION, 0, "server", "server", true, empty, empty, emptyDoubaoState());
    }

    private static DoubaoTtsState emptyDoubaoState() {
        return new DoubaoTtsState("", "", "", "", 0, 0, "", 0, 0, 0, "", "", "", "");
    }

    private record StoredState(
        int version,
        long revision,
        String modelMode,
        String ttsMode,
        boolean ttsEnabled,
        Provider model,
        Provider tts,
        DoubaoTtsState doubaoTts
    ) {}

    private record Provider(String provider, String baseUrl, String model, String voice, String apiKey) {}

    private record DoubaoTtsState(
        String resourceId,
        String modelVariant,
        String speaker,
        String format,
        int sampleRate,
        int bitRate,
        String emotion,
        int emotionScale,
        int speechRate,
        int loudnessRate,
        String authMode,
        String apiKey,
        String appId,
        String accessKey
    ) {}
}
