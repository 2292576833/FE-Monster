package com.femonster.core;

import com.femonster.community.CommunityClient;
import com.femonster.json.SimpleJson;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import javax.net.ssl.SSLEngine;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509ExtendedTrustManager;
import javax.net.ssl.X509TrustManager;

public final class CommunityService implements CommunityClient {
    private static final Duration TIMEOUT = Duration.ofSeconds(3);
    private static final Duration CREATIVE_MARKET_TIMEOUT = Duration.ofSeconds(20);
    private static final Duration CREATIVE_UPLOAD_TIMEOUT = Duration.ofMinutes(30);
    private static final long MAX_CREATIVE_UPLOAD_BYTES = 512L * 1024 * 1024;
    private static final Set<String> CREATIVE_MARKET_ACTIONS = Set.of(
        "uploads/init",
        "works/publish",
        "works/like",
        "works/comment",
        "works/share",
        "works/use"
    );
    private static final Map<String, Set<String>> CREATIVE_MARKET_FIELDS = Map.of(
        "uploads/init", Set.of("type", "role", "fileName", "name", "mimeType", "size"),
        "works/publish", Set.of(
            "type", "title", "description", "tags", "assetUploadId", "previewUploadId", "uploadId", "metadata"
        ),
        "works/like", Set.of("id", "workId"),
        "works/comment", Set.of("id", "workId", "text"),
        "works/share", Set.of("id", "workId", "targetId"),
        "works/use", Set.of("id", "workId", "download")
    );
    private static final Set<String> CREATIVE_MARKET_TYPES = Set.of(
        "",
        "all",
        "preset",
        "component",
        "wallpaper",
        "character",
        "cursor",
        "cursor-trail",
        "music"
    );
    private static final Set<String> PET_LIVE_STT_ACTIONS = Set.of("open", "frames", "finalize", "cancel", "status");
    private static final Pattern PET_LIVE_STT_ID_PATTERN = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._:-]{0,127}");
    private static final Pattern PET_LIVE_STT_BASE64_PATTERN = Pattern.compile(
        "(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?"
    );
    private static final Map<String, Set<String>> PET_ACTION_FIELDS = Map.ofEntries(
        Map.entry("sessions", Set.of("title")),
        Map.entry("chat", Set.of("sessionId", "requestId", "text", "voice", "voiceId", "proactiveContext", "replyWithVoice", "voiceReply", "realtimeVoice", "clientContext", "clientRole")),
        Map.entry("narrate", Set.of("requestId", "text", "voiceId")),
        Map.entry("narrate/cancel", Set.of("requestId")),
        Map.entry("voice", Set.of("voiceId")),
        Map.entry("voice/transcript", Set.of(
            "sessionId", "requestId", "text", "transcript", "final", "sequence",
            "autoSend", "audio", "title", "voiceId", "replyWithVoice", "voiceReply", "realtimeVoice", "clientContext", "clientRole"
        )),
        Map.entry("voice/chunk", Set.of(
            "sessionId", "requestId", "audioBase64", "base64", "mimeType", "sequence",
            "final", "durationMs", "sampleRate", "channels", "transcript", "autoSend", "title", "voiceId",
            "replyWithVoice", "voiceReply", "realtimeVoice", "clientContext", "clientRole"
        )),
        Map.entry("habits", Set.of("enabled", "clear")),
        Map.entry("cancel", Set.of(
            "sessionId", "requestId", "playedAudioSequences", "maxPlayedAudioSequence",
            "activeAudioSequence", "playedMs"
        )),
        Map.entry("live-stt", Set.of("action", "sessionId", "streamId", "itemId", "sequence", "audioBase64", "clientRole")),
        Map.entry("action-claim", Set.of("sessionId", "actionId", "confirmed", "cancelled", "clientRole")),
        Map.entry("action-result", Set.of("sessionId", "actionId", "ok", "result", "error", "clientRole"))
    );
    private static final Set<String> PET_MEMORY_FORGET_FIELDS = Set.of("memoryId");
    private static final Set<String> EVENT_STREAM_ROLES = Set.of("browser", "embedded", "desktop-pet");
    private static final long HEALTH_CACHE_MILLIS = 1800L;
    private static final long DISCOVERY_RETRY_MILLIS = 3000L;
    private static final long REGISTRATION_CACHE_MILLIS = 3000L;
    private static final long SERVER_CLOCK_OFFSET_TTL_MILLIS = Duration.ofMinutes(10).toMillis();
    private static final long MAX_SERVER_CLOCK_OFFSET_MILLIS = Duration.ofHours(24).toMillis();
    private static final long MAX_CLOCK_SYNC_ROUND_TRIP_MILLIS = Duration.ofSeconds(5).toMillis();
    private volatile HttpClient http;
    private volatile String baseUrl;
    private final Path configPath;
    private final Path httpPinPath;
    private final boolean lanRediscoveryEnabled;
    private final int discoveryPort;
    private final MachineIdentityService machine;
    private final CommunityModuleBridge communityModule;
    private final CommunityDeviceCredentials deviceCredentials;
    private final TogetherListeningReportStore togetherListeningReports;
    private final CommunityAccountProfileStore accountProfiles;
    private final Object healthCheckLock = new Object();
    private final Object discoveryLock = new Object();
    private final Object endpointLock = new Object();
    private final Object deviceEnrollmentLock = new Object();
    private final Object listenSessionLock = new Object();
    private final Map<String, List<Map<String, Object>>> activeListenSessions = new LinkedHashMap<>();
    private final ConcurrentMap<String, Long> registeredAtByAccount = new ConcurrentHashMap<>();
    private final ConcurrentMap<String, Object> registrationLocksByAccount = new ConcurrentHashMap<>();
    private volatile long lastHealthCheckAt = 0L;
    private volatile long lastDiscoveryAt = 0L;
    private volatile boolean lastHealthCheckOk = false;
    private volatile boolean avatarOrnamentUnsupported = false;
    private volatile String enrolledDeviceEndpoint = "";
    private volatile long serverClockOffsetMillis = 0L;
    private volatile long serverClockOffsetObservedAtMillis = 0L;
    private volatile String serverClockOffsetEndpoint = "";

    public CommunityService() {
        this(null, null);
    }

    public CommunityService(Path configPath) {
        this(configPath, null);
    }

    public CommunityService(Path configPath, MachineIdentityService machine) {
        this(configPath, machine, null);
    }

    public CommunityService(Path configPath, MachineIdentityService machine, CommunityModuleBridge communityModule) {
        this.configPath = configPath == null ? null : configPath.toAbsolutePath().normalize();
        String requestedBaseUrl = requestedBaseUrl(this.configPath);
        this.lanRediscoveryEnabled = isDiscoverableLoopback(requestedBaseUrl);
        this.discoveryPort = communityPort(requestedBaseUrl);
        this.baseUrl = normalizeBase(resolveBaseUrl(this.configPath));
        this.httpPinPath = tlsPinPath(this.configPath);
        this.machine = machine;
        this.communityModule = communityModule;
        this.deviceCredentials = machine == null
            ? null
            : new CommunityDeviceCredentials(
                communityDeviceCredentialPath(configPath),
                machine.computerId(),
                machine.computerIdSource()
            );
        this.accountProfiles = new CommunityAccountProfileStore(
            communityAccountProfilePath(configPath)
        );
        this.togetherListeningReports = new TogetherListeningReportStore(
            togetherListeningReportPath(configPath)
        );
    }

    public Map<String, Object> state(String provider, String providerLabel, Map<String, Object> accountPayload) {
        String accountKey = accountKey(provider, accountPayload);
        Map<String, Object> body = basePayload(provider, accountPayload);
        boolean serverOnline = isOnline();
        String endpoint = baseUrl;
        body.put("serverUrl", endpoint);
        body.put("serverOnline", serverOnline);

        if (!serverOnline) {
            body.put("ok", false);
            body.put("profile", new LinkedHashMap<>());
            body.put("friends", List.of());
            body.put("friendRequests", Map.of("incoming", List.of(), "outgoing", List.of()));
            body.put("error", "社区服务器连接失败: " + endpoint);
            return body;
        }

        if (!SimpleJson.asBoolean(accountPayload.get("loggedIn"), false)) {
            body.put("profile", new LinkedHashMap<>());
            body.put("friends", List.of());
            body.put("friendRequests", Map.of("incoming", List.of(), "outgoing", List.of()));
            return body;
        }

        Map<String, Object> registered = register(provider, providerLabel, accountPayload);
        if (SimpleJson.asBoolean(registered.get("ok"), false)) {
            Map<String, Object> profile = accountProfiles.merge(
                accountKey,
                SimpleJson.asMap(registered.get("profile"))
            );
            body.put("ok", true);
            body.put("serverOnline", true);
            body.put("profile", profile);
            body.put("isNewRegistration", SimpleJson.asBoolean(registered.get("isNewRegistration"), false));
            body.put("friends", SimpleJson.asList(registered.get("friends")));
            body.put("friendRequests", SimpleJson.asMap(registered.get("friendRequests")));
            rememberRegistration(accountKey, profile);
            return body;
        }

        String rawRegistrationError = SimpleJson.asString(registered.get("error"), "");
        String registrationError = rawRegistrationError.isBlank()
            ? "community server unavailable"
            : rawRegistrationError;
        if (!rawRegistrationError.isBlank() && isCommunityTransportFailure(rawRegistrationError)) {
            body.put("serverOnline", false);
            lastHealthCheckOk = false;
            lastHealthCheckAt = 0L;
        }
        body.put("ok", false);
        body.put("profile", accountProfiles.profile(accountKey));
        body.put("friends", List.of());
        body.put("friendRequests", Map.of("incoming", List.of(), "outgoing", List.of()));
        body.put("error", registrationError);
        return body;
    }

    public Map<String, Object> addFriend(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("targetId", targetId);
        Map<String, Object> added = post("/api/community/friends/add", request);
        if (SimpleJson.asBoolean(added.get("ok"), false)) {
            return added;
        }

        Map<String, Object> error = new LinkedHashMap<>();
        error.put("ok", false);
        String message = SimpleJson.asString(added.get("error"), "could not add friend");
        if (message.contains("friend id was not found")) {
            message = "当前社区服务器没有这个 FE ID。请让对方重启新版客户端，并连接同一服务器：" + baseUrl;
        }
        error.put("error", message);
        return error;
    }

    @Override
    public Map<String, Object> respondFriendRequest(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String requestId,
        boolean accepted
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("requestId", requestId);
        request.put("accepted", accepted);
        return post("/api/community/friends/respond", request);
    }

    @Override
    public Map<String, Object> mailbox(String provider, String providerLabel, Map<String, Object> accountPayload) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        StringBuilder path = new StringBuilder("/api/community/mailbox");
        appendQuery(path, "feId", requireFeId(feId));
        if (machine != null) {
            appendQuery(path, "computerId", machine.computerId());
            appendQuery(path, "computerIdSource", machine.computerIdSource());
        }
        return get(path.toString());
    }

    @Override
    public Map<String, Object> identityCards(String provider, String providerLabel, Map<String, Object> accountPayload) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        StringBuilder path = new StringBuilder("/api/community/identity-cards");
        appendQuery(path, "feId", requireFeId(feId));
        if (machine != null) {
            appendQuery(path, "computerId", machine.computerId());
            appendQuery(path, "computerIdSource", machine.computerIdSource());
        }
        return get(path.toString());
    }

    @Override
    public Map<String, Object> friendIdentityCard(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String targetId
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        StringBuilder path = new StringBuilder("/api/community/friends/identity-card");
        appendQuery(path, "feId", requireFeId(feId));
        appendQuery(path, "targetId", requireFeId(targetId));
        if (machine != null) {
            appendQuery(path, "computerId", machine.computerId());
            appendQuery(path, "computerIdSource", machine.computerIdSource());
        }
        return get(path.toString());
    }

    @Override
    public Map<String, Object> equipIdentityCard(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String cardId
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("cardId", boundedToken(cardId, 96, "identity card id"));
        return post("/api/community/identity-cards/equip", request);
    }

    @Override
    public Map<String, Object> markMailboxRead(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String mailId
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("mailId", boundedToken(mailId, 120, "mail id"));
        return post("/api/community/mailbox/read", request);
    }

    @Override
    public Map<String, Object> claimMailboxReward(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String mailId,
        String attachmentId
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("mailId", boundedToken(mailId, 120, "mail id"));
        String attachment = boundedToken(attachmentId, 120, "attachment id");
        if (!attachment.isBlank()) request.put("attachmentId", attachment);
        return post("/api/community/mailbox/claim", request);
    }

    @Override
    public Map<String, Object> achievementState(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        StringBuilder path = new StringBuilder("/api/community/achievements");
        appendQuery(path, "feId", requireFeId(feId));
        if (machine != null) {
            appendQuery(path, "computerId", machine.computerId());
            appendQuery(path, "computerIdSource", machine.computerIdSource());
        }
        return get(path.toString());
    }

    @Override
    public Map<String, Object> updateAchievementState(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        Map<String, Object> state
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("state", state == null ? Map.of() : new LinkedHashMap<>(state));
        return post("/api/community/achievements", request);
    }

    @Override
    public Map<String, Object> claimAchievementReward(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String achievementId
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("achievementId", boundedToken(achievementId, 80, "achievement id"));
        return post("/api/community/achievements/claim", request);
    }

    @Override
    public Map<String, Object> submitAchievementEvidence(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        Map<String, Object> event
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("event", event == null ? Map.of() : new LinkedHashMap<>(event));
        return post("/api/community/achievements/evidence", withDeviceBinding(request));
    }

    public Map<String, Object> recordListening(String provider, String providerLabel, Map<String, Object> accountPayload, long listenMsDelta, Map<String, Object> song) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("listenMsDelta", Math.max(0, listenMsDelta));
        request.put("song", song == null ? new LinkedHashMap<>() : song);
        Map<String, Object> response = post("/api/community/listening", request);
        List<Map<String, Object>> sessions = observeListenSessions(feId, response);
        long reportDelta = Math.min(60_000L, Math.max(0L, listenMsDelta));
        if (reportDelta > 0L) {
            for (Map<String, Object> session : sessions) {
                togetherListeningReports.recordSession(
                    feId,
                    sessionId(session),
                    reportDelta,
                    sessionMembers(session)
                );
            }
        }
        response.put("togetherListeningReport", togetherListeningReports.report(feId));
        return response;
    }

    public Map<String, Object> messages(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        return get("/api/community/messages?feId=" + encode(feId) + "&targetId=" + encode(targetId));
    }

    public Map<String, Object> sendMessage(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId, String text) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("targetId", targetId);
        request.put("text", text);
        return post("/api/community/messages/send", request);
    }

    public Map<String, Object> updateProfile(String provider, String providerLabel, Map<String, Object> accountPayload, String bio) {
        return updateProfile(provider, providerLabel, accountPayload, bio, null);
    }

    @Override
    public Map<String, Object> updateProfile(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String bio,
        Map<String, Object> avatarOrnament
    ) {
        String accountKey = accountKey(provider, accountPayload);
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("bio", bio == null ? "" : bio);
        Map<String, Object> response = avatarOrnament == null
            ? post("/api/community/profile", request)
            : postWithOptionalAvatarOrnament("/api/community/profile", request, avatarOrnament);
        if (SimpleJson.asBoolean(response.get("ok"), false)) {
            Map<String, Object> profile = SimpleJson.asMap(response.get("profile"));
            if (!profile.isEmpty()) {
                Map<String, Object> storedProfile = accountProfiles.merge(accountKey, profile);
                response = new LinkedHashMap<>(response);
                response.put("profile", storedProfile);
            }
        }
        return response;
    }

    public Map<String, Object> nearby(String provider, String providerLabel, Map<String, Object> accountPayload, int radiusKm) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        int radius = Math.max(5, Math.min(10, radiusKm));
        return get("/api/community/nearby?feId=" + encode(feId) + "&radiusKm=" + radius);
    }

    @Override
    public Map<String, Object> userProfile(String feId) {
        String id = requireFeId(feId);
        return getWithTimeout("/api/community/users/" + encode(id), CREATIVE_MARKET_TIMEOUT);
    }

    @Override
    public Map<String, Object> creativeMarket(String type, String query, String feId) {
        String normalizedType = type == null ? "" : type.trim().toLowerCase();
        if (!CREATIVE_MARKET_TYPES.contains(normalizedType)) {
            throw new IllegalArgumentException("unsupported creative market type");
        }
        String search = boundedValue(query, 120, "creative market query");
        String viewerId = feId == null || feId.isBlank() ? "" : requireFeId(feId);
        StringBuilder path = new StringBuilder("/api/creative-market");
        appendQuery(path, "type", normalizedType);
        appendQuery(path, "q", search);
        appendQuery(path, "feId", viewerId);
        return getWithTimeout(path.toString(), CREATIVE_MARKET_TIMEOUT);
    }

    @Override
    public Map<String, Object> creativeMarketWork(String workId) {
        String id = requireCreativeId(workId, "work-");
        return getWithTimeout("/api/creative-market/works/" + encode(id), CREATIVE_MARKET_TIMEOUT);
    }

    @Override
    public Map<String, Object> creativeMarketComments(String workId) {
        String id = requireCreativeId(workId, "work-");
        return getWithTimeout("/api/creative-market/comments?id=" + encode(id), CREATIVE_MARKET_TIMEOUT);
    }

    @Override
    public Map<String, Object> squareMessages(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String after,
        int limit
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        String cursor = boundedToken(after, 120, "square cursor");
        int boundedLimit = Math.max(1, Math.min(100, limit));
        StringBuilder path = new StringBuilder("/api/community/square/messages");
        appendQuery(path, "feId", feId);
        appendQuery(path, "after", cursor);
        appendQuery(path, "limit", String.valueOf(boundedLimit));
        return getWithTimeout(path.toString(), CREATIVE_MARKET_TIMEOUT);
    }

    @Override
    public Map<String, Object> creativeMarketMutation(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String action,
        Map<String, Object> payload
    ) {
        String normalizedAction = action == null ? "" : action.trim().toLowerCase();
        if (!CREATIVE_MARKET_ACTIONS.contains(normalizedAction)) {
            throw new IllegalArgumentException("unsupported creative market action");
        }
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        return postWithTimeout(
            "/api/community/creative-market/" + normalizedAction,
            withAuthenticatedFeId(payload, feId, CREATIVE_MARKET_FIELDS.get(normalizedAction)),
            CREATIVE_MARKET_TIMEOUT
        );
    }

    @Override
    public Map<String, Object> sendSquareMessage(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        Map<String, Object> payload
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        return postWithTimeout(
            "/api/community/square/messages",
            withAuthenticatedFeId(payload, feId, Set.of("text", "clientId")),
            CREATIVE_MARKET_TIMEOUT
        );
    }

    public Map<String, Object> likeFriend(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("targetId", targetId);
        return post("/api/community/likes/add", request);
    }

    public Map<String, Object> listenState(String provider, String providerLabel, Map<String, Object> accountPayload) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        Map<String, Object> response = get("/api/community/listen/state?feId=" + encode(feId));
        observeListenSessions(feId, response);
        response.put("togetherListeningReport", togetherListeningReports.report(feId));
        return response;
    }

    @Override
    public Map<String, Object> updateProfile(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String username,
        String bio,
        Map<String, Object> avatarOrnament
    ) {
        String accountKey = accountKey(provider, accountPayload);
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        if (username != null) request.put("username", boundedValue(username, 48, "username"));
        if (bio != null) request.put("bio", bio);
        Map<String, Object> response = avatarOrnament == null
            ? post("/api/community/profile", request)
            : postWithOptionalAvatarOrnament("/api/community/profile", request, avatarOrnament);
        if (SimpleJson.asBoolean(response.get("ok"), false)) {
            Map<String, Object> profile = SimpleJson.asMap(response.get("profile"));
            if (!profile.isEmpty()) {
                Map<String, Object> storedProfile = accountProfiles.merge(accountKey, profile);
                response = new LinkedHashMap<>(response);
                response.put("profile", storedProfile);
            }
        }
        return response;
    }

    @Override
    public Map<String, Object> listenReport(String provider, String providerLabel, Map<String, Object> accountPayload) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("ok", true);
        Map<String, Object> report = togetherListeningReports.reportAndFlush(feId);
        response.put("report", report);
        response.put("togetherListeningReport", report);
        return response;
    }

    public Map<String, Object> inviteListen(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId, Map<String, Object> song) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("targetId", targetId);
        request.put("song", song == null ? new LinkedHashMap<>() : song);
        return post("/api/community/listen/invite", request);
    }

    public Map<String, Object> respondListen(String provider, String providerLabel, Map<String, Object> accountPayload, String inviteId, boolean accepted) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("inviteId", inviteId);
        request.put("accepted", accepted);
        Map<String, Object> response = post("/api/community/listen/respond", request);
        observeListenSessions(feId, response);
        response.put("togetherListeningReport", togetherListeningReports.report(feId));
        return response;
    }

    public Map<String, Object> leaveListen(String provider, String providerLabel, Map<String, Object> accountPayload, String sessionId) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("sessionId", sessionId);
        Map<String, Object> response = post("/api/community/listen/leave", request);
        observeListenSessions(feId, response);
        removeListenSession(feId, sessionId);
        response.put("togetherListeningReport", togetherListeningReports.report(feId));
        return response;
    }

    public Map<String, Object> sendCallSignal(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId, String sessionId, String type, Object payload) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("targetId", targetId);
        request.put("sessionId", sessionId);
        request.put("type", type);
        request.put("payload", payload);
        return post("/api/community/call/signal", request);
    }

    public Map<String, Object> relay(String provider, String providerLabel, Map<String, Object> accountPayload, String targetId, String type, Object payload) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("targetId", targetId);
        request.put("type", type);
        request.put("payload", payload);
        return post("/api/community/relay", request);
    }

    public Map<String, Object> callSignals(String provider, String providerLabel, Map<String, Object> accountPayload, String sessionId, String after) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        return get("/api/community/call/signals?feId=" + encode(feId) + "&sessionId=" + encode(sessionId) + "&after=" + encode(after));
    }

    @Override
    public Map<String, Object> petStatus(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        StringBuilder path = new StringBuilder("/api/community/pet/status");
        appendQuery(path, "feId", requireFeId(feId));
        if (machine != null) appendQuery(path, "computerId", machine.computerId());
        return getWithAccountScope(path.toString(), feId);
    }

    @Override
    public Map<String, Object> petHistory(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String sessionId
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        StringBuilder path = new StringBuilder("/api/community/pet/history");
        appendQuery(path, "feId", requireFeId(feId));
        if (machine != null) appendQuery(path, "computerId", machine.computerId());
        String safeSessionId = boundedToken(sessionId, 160, "pet session id");
        if (!safeSessionId.isBlank()) appendQuery(path, "sessionId", safeSessionId);
        return getWithAccountScope(path.toString(), feId);
    }

    @Override
    public Map<String, Object> petMemories(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        StringBuilder path = new StringBuilder("/api/community/pet/memories");
        appendQuery(path, "feId", requireFeId(feId));
        if (machine != null) {
            appendQuery(path, "computerId", machine.computerId());
            appendQuery(path, "computerIdSource", machine.computerIdSource());
        }
        return getWithAccountScope(path.toString(), feId);
    }

    @Override
    public Map<String, Object> petHabits(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        StringBuilder path = new StringBuilder("/api/community/pet/habits");
        appendQuery(path, "feId", requireFeId(feId));
        if (machine != null) {
            appendQuery(path, "computerId", machine.computerId());
            appendQuery(path, "computerIdSource", machine.computerIdSource());
        }
        return getWithAccountScope(path.toString(), feId);
    }

    @Override
    public String petPersonalizationScope(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload
    ) {
        if (!SimpleJson.asBoolean(accountPayload.get("loggedIn"), false)) return "";
        String accountKey = accountKey(provider, accountPayload);
        String feId = SimpleJson.asString(accountProfiles.profile(accountKey).get("feId"), "");
        if (feId.isBlank()) feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return "";
        return baseUrl + "\n" + requireFeId(feId);
    }

    @Override
    public Map<String, Object> forgetPetMemory(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        Map<String, Object> selector
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        Map<String, Object> request = withAuthenticatedFeId(selector, feId, PET_MEMORY_FORGET_FIELDS);
        validatePetMemorySelector(request);
        return post("/api/community/pet/memory/forget", request);
    }

    @Override
    public Map<String, Object> clientPreferences(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        StringBuilder path = new StringBuilder("/api/community/client-preferences");
        appendQuery(path, "feId", requireFeId(feId));
        appendQuery(path, "namespace", "account");
        if (machine != null) {
            appendQuery(path, "computerId", machine.computerId());
            appendQuery(path, "computerIdSource", machine.computerIdSource());
        }
        return getWithAccountScope(path.toString(), feId);
    }

    @Override
    public Map<String, Object> syncClientPreferences(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        Map<String, Object> payload
    ) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", requireFeId(feId));
        request.put("namespace", "account");
        request.put("schemaVersion", 2);
        request.put("baseRevision", Math.max(0L, SimpleJson.asLong(payload.get("baseRevision"), 0L)));
        request.put("generation", Math.max(1, SimpleJson.asInt(payload.get("generation"), 1)));
        Object changes = payload.get("changes");
        request.put("changes", changes instanceof List<?> ? changes : List.of());
        if (machine != null) {
            request.put("computerId", machine.computerId());
            request.put("computerIdSource", machine.computerIdSource());
        }
        return post("/api/community/client-preferences/sync", request);
    }

    @Override
    public Map<String, Object> petMutation(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String action,
        Map<String, Object> payload
    ) {
        String normalizedAction = action == null ? "" : action.trim().toLowerCase();
        Set<String> allowedFields = PET_ACTION_FIELDS.get(normalizedAction);
        if (allowedFields == null) throw new IllegalArgumentException("unsupported pet action");
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        Map<String, Object> request = withAuthenticatedFeId(payload, feId, allowedFields);
        validatePetMutation(normalizedAction, request);
        return postWithTimeout(
            "/api/community/pet/" + normalizedAction,
            request,
            "narrate".equals(normalizedAction) ? Duration.ofSeconds(120) : Duration.ofSeconds(30)
        );
    }

    @Override
    public HttpResponse<InputStream> petAudio(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload,
        String audioId
    ) throws IOException, InterruptedException {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) throw new IllegalArgumentException("community login required");
        String id = boundedToken(audioId, 160, "pet audio id");
        if (!id.matches("[A-Za-z0-9_-]{8,160}")) {
            throw new IllegalArgumentException("invalid pet audio id");
        }
        String signaturePath = "/api/community/pet/audio/" + encode(id);
        StringBuilder path = new StringBuilder(signaturePath);
        appendQuery(path, "feId", requireFeId(feId));
        if (machine != null) appendQuery(path, "computerId", machine.computerId());
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(baseUrl + path))
            .timeout(Duration.ofSeconds(30))
            .header("Accept", "audio/wav,audio/*;q=0.9,application/octet-stream;q=0.5")
            .GET();
        communitySignatureHeaders("GET", signaturePath, petAccountSignatureScope(feId)).forEach(builder::header);
        return sendWithRetry(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
    }

    public Map<String, Object> sandboxGet(String path) {
        return getWithTimeout(path, Duration.ofSeconds(20));
    }

    public Map<String, Object> sandboxPost(String path, Map<String, Object> payload) {
        Duration timeout = path != null && (path.endsWith("/generate") || path.endsWith("/rework"))
            ? Duration.ofMinutes(7)
            : Duration.ofSeconds(20);
        return postWithTimeout(path, payload, timeout);
    }

    public HttpResponse<java.io.InputStream> sandboxAsset(String path) throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(baseUrl + path))
            .timeout(Duration.ofMinutes(5))
            .header("Accept", "model/gltf-binary,image/png,application/octet-stream")
            .GET();
        addSandboxApiKey(builder, path);
        return sendWithRetry(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
    }

    @Override
    public HttpResponse<InputStream> creativeMarketAsset(
        String assetId,
        String range,
        String ifNoneMatch,
        String ifRange
    ) throws IOException, InterruptedException {
        String id = requireCreativeId(assetId, "asset-");
        String path = "/api/creative-market/assets/" + encode(id);
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(baseUrl + path))
            .timeout(Duration.ofMinutes(5))
            .header("Accept", "*/*")
            .GET();
        String safeRange = safeRangeHeader(range);
        if (!safeRange.isBlank()) builder.header("Range", safeRange);
        addOptionalHeader(builder, "If-None-Match", ifNoneMatch);
        addOptionalHeader(builder, "If-Range", ifRange);
        addSandboxApiKey(builder, path);
        return sendWithRetry(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
    }

    @Override
    public HttpResponse<InputStream> uploadCreativeMarketContent(
        String uploadId,
        String token,
        String contentType,
        long contentLength,
        InputStream content
    ) throws IOException, InterruptedException {
        String id = requireCreativeId(uploadId, "upload-");
        String safeToken = boundedToken(token, 512, "creative upload token");
        if (safeToken.isBlank() || !safeToken.matches("[A-Za-z0-9_-]{24,512}")) {
            throw new IllegalArgumentException("invalid creative upload token");
        }
        if (content == null) throw new IllegalArgumentException("creative upload content is required");
        if (contentLength > MAX_CREATIVE_UPLOAD_BYTES) {
            throw new IllegalArgumentException("creative upload exceeds 512 MiB limit");
        }

        String path = "/api/creative-market/uploads/" + encode(id) + "/content?token=" + encode(safeToken);
        InputStream bounded = new BoundedInputStream(content, MAX_CREATIVE_UPLOAD_BYTES);
        HttpRequest.BodyPublisher publisher = HttpRequest.BodyPublishers.ofInputStream(() -> bounded);
        if (contentLength >= 0) {
            publisher = HttpRequest.BodyPublishers.fromPublisher(publisher, contentLength);
        }
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(baseUrl + path))
            .timeout(CREATIVE_UPLOAD_TIMEOUT)
            .header("Content-Type", safeContentType(contentType))
            .POST(publisher);
        addSandboxApiKey(builder, path);
        return httpClient().send(builder.build(), HttpResponse.BodyHandlers.ofInputStream());
    }

    public HttpResponse<java.io.InputStream> eventStream(
        String feId,
        String after,
        String streamRole
    ) throws IOException, InterruptedException {
        String id = feId == null ? "" : feId.trim();
        StringBuilder path = new StringBuilder("/api/community/events?feId=").append(encode(id));
        if (machine != null) {
            path.append("&computerId=").append(encode(machine.computerId()));
        }
        path.append("&streamRole=").append(encode(normalizeEventStreamRole(streamRole)));
        if (after != null && !after.isBlank()) {
            path.append("&after=").append(encode(after));
        }
        String requestPath = path.toString();
        try {
            return httpClient().send(
                buildEventStreamRequest(requestPath),
                HttpResponse.BodyHandlers.ofInputStream()
            );
        } catch (IOException first) {
            sleepBeforeRetry();
            return httpClient().send(
                buildEventStreamRequest(requestPath),
                HttpResponse.BodyHandlers.ofInputStream()
            );
        }
    }

    private HttpRequest buildEventStreamRequest(String requestPath) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(baseUrl + requestPath))
            .header("Accept", "text/event-stream")
            .GET();
        communitySignatureHeaders("GET", "/api/community/events", "").forEach(builder::header);
        return builder.build();
    }

    private Map<String, Object> basePayload(String provider, Map<String, Object> accountPayload) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("provider", provider);
        body.put("loggedIn", SimpleJson.asBoolean(accountPayload.get("loggedIn"), false));
        body.put("account", SimpleJson.asMap(accountPayload.get("account")));
        String providerError = SimpleJson.asString(accountPayload.get("error"), "");
        if (!providerError.isBlank()) body.put("error", providerError);
        return body;
    }

    private Map<String, Object> register(String provider, String providerLabel, Map<String, Object> accountPayload) {
        Map<String, Object> account = SimpleJson.asMap(accountPayload.get("account"));
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("provider", provider);
        request.put("platformLabel", providerLabel);
        request.put("platformUserId", SimpleJson.asString(account.get("userId"), ""));
        request.put("username", firstNonBlank(
            SimpleJson.asString(account.get("nickname"), ""),
            SimpleJson.asString(account.get("userId"), "")
        ));
        request.put("avatarUrl", firstNonBlank(
            SimpleJson.asString(account.get("avatarUrl"), ""),
            SimpleJson.asString(account.get("avatar"), ""),
            SimpleJson.asString(account.get("headimg"), ""),
            SimpleJson.asString(account.get("pic"), "")
        ));
        Object avatarOrnament = account.containsKey("avatarOrnament")
            ? account.get("avatarOrnament")
            : accountPayload.get("avatarOrnament");
        Map<String, Object> cachedProfile = accountProfiles.profile(accountKey(provider, accountPayload));
        if (!(avatarOrnament instanceof Map<?, ?>) && cachedProfile.containsKey("avatarOrnament")) {
            avatarOrnament = cachedProfile.get("avatarOrnament");
        }
        Map<String, Object> normalizedAvatarOrnament = avatarOrnament instanceof Map<?, ?>
            ? new LinkedHashMap<>(SimpleJson.asMap(avatarOrnament))
            : null;
        if (machine != null) {
            request.put("computerId", machine.computerId());
            request.put("computerIdSource", machine.computerIdSource());
            request.put("computerName", machine.computerName());
            request.put("appVersion", machine.appVersion());
            request.put("installRoot", machine.installRoot());
        }
        return normalizedAvatarOrnament == null
            ? post("/api/community/register", request)
            : postWithOptionalAvatarOrnament("/api/community/register", request, normalizedAvatarOrnament);
    }

    private Map<String, Object> postWithOptionalAvatarOrnament(
        String path,
        Map<String, Object> payload,
        Map<String, Object> avatarOrnament
    ) {
        Map<String, Object> request = new LinkedHashMap<>(payload);
        boolean sentAvatarOrnament = !avatarOrnamentUnsupported;
        if (sentAvatarOrnament) {
            request.put("avatarOrnament", new LinkedHashMap<>(avatarOrnament));
        }

        Map<String, Object> response = post(path, request);
        if (sentAvatarOrnament && rejectsAvatarOrnament(response)) {
            avatarOrnamentUnsupported = true;
            request.remove("avatarOrnament");
            response = post(path, request);
        }
        return preserveLocalAvatarOrnament(response, avatarOrnament);
    }

    private static boolean rejectsAvatarOrnament(Map<String, Object> response) {
        if (SimpleJson.asBoolean(response.get("ok"), false)) return false;
        String error = SimpleJson.asString(response.get("error"), "").toLowerCase();
        return error.contains("unexpected parameter") && error.contains("avatarornament");
    }

    private static boolean isCommunityTransportFailure(String message) {
        String error = message == null ? "" : message.toLowerCase(java.util.Locale.ROOT);
        return error.contains("unavailable") ||
            error.contains("connection refused") ||
            error.contains("connect timed out") ||
            error.contains("connection reset") ||
            error.contains("closedchannel") ||
            error.contains("unreachable") ||
            error.contains("no route to host");
    }

    private static Map<String, Object> preserveLocalAvatarOrnament(
        Map<String, Object> response,
        Map<String, Object> avatarOrnament
    ) {
        if (!SimpleJson.asBoolean(response.get("ok"), false)) return response;
        Map<String, Object> profile = SimpleJson.asMap(response.get("profile"));
        if (profile.isEmpty()) return response;
        Map<String, Object> preservedProfile = new LinkedHashMap<>(profile);
        preservedProfile.put("avatarOrnament", new LinkedHashMap<>(avatarOrnament));
        Map<String, Object> preservedResponse = new LinkedHashMap<>(response);
        preservedResponse.put("profile", preservedProfile);
        return preservedResponse;
    }

    private List<Map<String, Object>> observeListenSessions(
        String feId,
        Map<String, Object> response
    ) {
        ListenSessionSnapshot snapshot = listenSessionSnapshot(response);
        synchronized (listenSessionLock) {
            if (snapshot.present()) {
                if (snapshot.sessions().isEmpty()) {
                    activeListenSessions.remove(feId);
                } else {
                    activeListenSessions.put(feId, copySessions(snapshot.sessions()));
                }
            }
            return copySessions(activeListenSessions.getOrDefault(feId, List.of()));
        }
    }

    private void removeListenSession(String feId, String sessionId) {
        String targetSessionId = sessionId == null ? "" : sessionId.trim();
        synchronized (listenSessionLock) {
            List<Map<String, Object>> sessions = activeListenSessions.get(feId);
            if (sessions == null || sessions.isEmpty()) return;
            sessions.removeIf(session -> targetSessionId.isBlank() || targetSessionId.equals(sessionId(session)));
            if (sessions.isEmpty()) activeListenSessions.remove(feId);
        }
    }

    private static ListenSessionSnapshot listenSessionSnapshot(Map<String, Object> response) {
        if (response == null || response.isEmpty()) {
            return new ListenSessionSnapshot(false, List.of());
        }
        if (response.containsKey("syncedSessions")) {
            return new ListenSessionSnapshot(true, sessionMaps(response.get("syncedSessions")));
        }
        if (response.containsKey("sessions")) {
            return new ListenSessionSnapshot(true, sessionMaps(response.get("sessions")));
        }
        Map<String, Object> state = SimpleJson.asMap(response.get("state"));
        if (state.containsKey("sessions")) {
            return new ListenSessionSnapshot(true, sessionMaps(state.get("sessions")));
        }
        Map<String, Object> session = SimpleJson.asMap(response.get("session"));
        if (!session.isEmpty()) {
            return new ListenSessionSnapshot(true, List.of(new LinkedHashMap<>(session)));
        }
        return new ListenSessionSnapshot(false, List.of());
    }

    private static List<Map<String, Object>> sessionMaps(Object value) {
        List<Map<String, Object>> sessions = new ArrayList<>();
        for (Object item : SimpleJson.asList(value)) {
            Map<String, Object> session = SimpleJson.asMap(item);
            if (!session.isEmpty()) sessions.add(new LinkedHashMap<>(session));
        }
        return sessions;
    }

    private static List<Map<String, Object>> copySessions(List<Map<String, Object>> sessions) {
        List<Map<String, Object>> copy = new ArrayList<>();
        if (sessions == null) return copy;
        for (Map<String, Object> session : sessions) {
            if (session != null && !session.isEmpty()) copy.add(new LinkedHashMap<>(session));
        }
        return copy;
    }

    private static String sessionId(Map<String, Object> session) {
        return firstNonBlank(
            SimpleJson.asString(session.get("id"), ""),
            SimpleJson.asString(session.get("sessionId"), "")
        );
    }

    private static List<Map<String, Object>> sessionMembers(Map<String, Object> session) {
        List<Map<String, Object>> members = new ArrayList<>();
        Object membersValue = session.containsKey("members")
            ? session.get("members")
            : session.get("participants");
        for (Object memberValue : SimpleJson.asList(membersValue)) {
            if (memberValue instanceof Map<?, ?>) {
                Map<String, Object> member = new LinkedHashMap<>(
                    SimpleJson.asMap(memberValue)
                );
                Map<String, Object> profile = SimpleJson.asMap(member.get("profile"));
                if (!profile.isEmpty()) {
                    Map<String, Object> merged = new LinkedHashMap<>(profile);
                    merged.putAll(member);
                    member = merged;
                }
                members.add(member);
            } else if (memberValue != null) {
                members.add(new LinkedHashMap<>(Map.of("feId", String.valueOf(memberValue))));
            }
        }
        if (members.isEmpty()) {
            for (String key : List.of("fromUser", "toUser", "host", "guest", "owner", "target")) {
                Map<String, Object> member = SimpleJson.asMap(session.get(key));
                if (!member.isEmpty()) members.add(new LinkedHashMap<>(member));
            }
        }
        if (members.isEmpty()) {
            for (Object memberId : SimpleJson.asList(session.get("memberIds"))) {
                if (memberId != null) {
                    members.add(new LinkedHashMap<>(Map.of("feId", String.valueOf(memberId))));
                }
            }
        }
        return members;
    }

    private String currentFeId(String provider, String providerLabel, Map<String, Object> accountPayload) {
        if (!SimpleJson.asBoolean(accountPayload.get("loggedIn"), false)) return "";
        String key = accountKey(provider, accountPayload);
        String cachedFeId = recentlyRegisteredFeId(key);
        if (!cachedFeId.isBlank()) return cachedFeId;
        if (key.isBlank()) return fetchCurrentFeId(provider, providerLabel, accountPayload);

        Object registrationLock = registrationLocksByAccount.computeIfAbsent(key, ignored -> new Object());
        synchronized (registrationLock) {
            cachedFeId = recentlyRegisteredFeId(key);
            if (!cachedFeId.isBlank()) return cachedFeId;
            return fetchCurrentFeId(provider, providerLabel, accountPayload);
        }
    }

    private String fetchCurrentFeId(
        String provider,
        String providerLabel,
        Map<String, Object> accountPayload
    ) {
        Map<String, Object> current = state(provider, providerLabel, accountPayload);
        if (!SimpleJson.asBoolean(current.get("ok"), false)) return "";
        Map<String, Object> profile = SimpleJson.asMap(current.get("profile"));
        return SimpleJson.asString(profile.get("feId"), "");
    }

    private String recentlyRegisteredFeId(String accountKey) {
        if (accountKey.isBlank()) return "";
        Long registeredAt = registeredAtByAccount.get(accountKey);
        if (registeredAt == null || System.currentTimeMillis() - registeredAt >= REGISTRATION_CACHE_MILLIS) {
            if (registeredAt != null) registeredAtByAccount.remove(accountKey, registeredAt);
            return "";
        }
        return SimpleJson.asString(accountProfiles.profile(accountKey).get("feId"), "");
    }

    private void rememberRegistration(String accountKey, Map<String, Object> profile) {
        if (accountKey.isBlank() || SimpleJson.asString(profile.get("feId"), "").isBlank()) return;
        registeredAtByAccount.put(accountKey, System.currentTimeMillis());
    }

    private String accountKey(String provider, Map<String, Object> accountPayload) {
        Map<String, Object> account = SimpleJson.asMap(accountPayload.get("account"));
        String platformUserId = SimpleJson.asString(account.get("userId"), "").trim();
        if (platformUserId.isBlank()) return "";
        String providerId = provider == null ? "" : provider.trim().toLowerCase(java.util.Locale.ROOT);
        if (providerId.isBlank()) return "";
        return baseUrl + "\n" + providerId + "\n" + platformUserId;
    }

    private record ListenSessionSnapshot(
        boolean present,
        List<Map<String, Object>> sessions
    ) {
    }

    private Map<String, Object> loginRequired() {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("ok", false);
        error.put("error", "login required");
        return error;
    }

    private boolean isOnline() {
        long now = System.currentTimeMillis();
        if (now - lastHealthCheckAt < HEALTH_CACHE_MILLIS) return lastHealthCheckOk;
        synchronized (healthCheckLock) {
            now = System.currentTimeMillis();
            if (now - lastHealthCheckAt < HEALTH_CACHE_MILLIS) return lastHealthCheckOk;
            boolean online = isOnlineOnce();
            if (!online && recoverLegacyGatewayPrefix()) {
                online = isOnlineOnce();
            }
            if (!online && rediscoverCommunityServer()) {
                online = isOnlineOnce();
            }
            if (!online) {
                try {
                    sleepBeforeRetry();
                    online = isOnlineOnce();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            lastHealthCheckAt = System.currentTimeMillis();
            lastHealthCheckOk = online;
            return online;
        }
    }

    private boolean isOnlineOnce() {
        try {
            String endpoint = baseUrl;
            HttpRequest request = HttpRequest.newBuilder(URI.create(endpoint + "/health"))
                .timeout(Duration.ofSeconds(2))
                .GET()
                .build();
            long requestStartedAt = System.currentTimeMillis();
            HttpResponse<String> response = httpClient().send(request, HttpResponse.BodyHandlers.ofString());
            long responseReceivedAt = System.currentTimeMillis();
            if (response.statusCode() < 200 || response.statusCode() >= 300) return false;
            Map<String, Object> body = SimpleJson.parseObject(response.body());
            boolean expectedServer = SimpleJson.asBoolean(body.get("ok"), false) &&
                "fe-monster-community".equals(SimpleJson.asString(body.get("service"), ""));
            if (expectedServer) {
                observeServerClock(endpoint, response, requestStartedAt, responseReceivedAt);
            }
            return expectedServer;
        } catch (IOException | InterruptedException | IllegalArgumentException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            return false;
        }
    }

    private void observeServerClock(
        String endpoint,
        HttpResponse<?> response,
        long requestStartedAt,
        long responseReceivedAt
    ) {
        String dateHeader = response.headers().firstValue("Date").orElse("").trim();
        long roundTripMillis = responseReceivedAt - requestStartedAt;
        if (dateHeader.isBlank() || roundTripMillis < 0L || roundTripMillis > MAX_CLOCK_SYNC_ROUND_TRIP_MILLIS) {
            clearServerClockOffset(endpoint);
            return;
        }

        try {
            long serverTimeMillis = Instant.from(
                DateTimeFormatter.RFC_1123_DATE_TIME.parse(dateHeader)
            ).toEpochMilli();
            long localMidpointMillis = requestStartedAt + roundTripMillis / 2L;
            long offsetMillis = Math.subtractExact(serverTimeMillis, localMidpointMillis);
            if (offsetMillis < -MAX_SERVER_CLOCK_OFFSET_MILLIS ||
                offsetMillis > MAX_SERVER_CLOCK_OFFSET_MILLIS) {
                clearServerClockOffset(endpoint);
                return;
            }
            serverClockOffsetMillis = offsetMillis;
            serverClockOffsetEndpoint = endpoint;
            serverClockOffsetObservedAtMillis = responseReceivedAt;
        } catch (RuntimeException ignored) {
            clearServerClockOffset(endpoint);
        }
    }

    private void clearServerClockOffset(String endpoint) {
        if (!endpoint.equals(serverClockOffsetEndpoint) && !serverClockOffsetEndpoint.isBlank()) return;
        serverClockOffsetObservedAtMillis = 0L;
        serverClockOffsetMillis = 0L;
        serverClockOffsetEndpoint = "";
    }

    private boolean hasFreshServerClockObservation(String endpoint, long localNowMillis) {
        long observedAt = serverClockOffsetObservedAtMillis;
        long ageMillis = localNowMillis - observedAt;
        return endpoint.equals(serverClockOffsetEndpoint) &&
            observedAt > 0L &&
            ageMillis >= 0L &&
            ageMillis <= SERVER_CLOCK_OFFSET_TTL_MILLIS;
    }

    private long deviceSignatureTimestampMillis() {
        long localNowMillis = System.currentTimeMillis();
        if (!hasFreshServerClockObservation(baseUrl, localNowMillis)) return localNowMillis;
        try {
            return Math.addExact(localNowMillis, serverClockOffsetMillis);
        } catch (ArithmeticException ignored) {
            return localNowMillis;
        }
    }

    private void ensureServerClockObservation() {
        long localNowMillis = System.currentTimeMillis();
        if (hasFreshServerClockObservation(baseUrl, localNowMillis)) return;
        synchronized (healthCheckLock) {
            localNowMillis = System.currentTimeMillis();
            if (hasFreshServerClockObservation(baseUrl, localNowMillis)) return;
            // Bypass the short health-result cache: a user may have corrected
            // their system clock after that cache was populated. Health is
            // anonymous and verifies service identity before Date is trusted.
            isOnlineOnce();
        }
    }

    private boolean rediscoverCommunityServer() {
        if (!lanRediscoveryEnabled) return false;
        long now = System.currentTimeMillis();
        if (now - lastDiscoveryAt < DISCOVERY_RETRY_MILLIS) return false;
        synchronized (discoveryLock) {
            now = System.currentTimeMillis();
            if (now - lastDiscoveryAt < DISCOVERY_RETRY_MILLIS) return false;
            String discovered = discoverCommunityServer(discoveryPort);
            lastDiscoveryAt = System.currentTimeMillis();
            if (discovered.isBlank()) return false;
            String endpoint = normalizeBase(discovered);
            HttpClient replacement = createHttpClient(endpoint, httpPinPath);
            synchronized (endpointLock) {
                http = replacement;
                baseUrl = endpoint;
            }
            return true;
        }
    }

    private boolean recoverLegacyGatewayPrefix() {
        String previousEndpoint = baseUrl;
        String candidate = legacyGatewayCommunityEndpoint(previousEndpoint);
        if (candidate.isBlank()) return false;
        if (!isLegacyPublicGateway(httpClient(), previousEndpoint, 2000)) return false;

        HttpClient replacement = createHttpClient(candidate, httpPinPath);
        if (!isCommunityServer(replacement, candidate, 2000)) return false;

        synchronized (endpointLock) {
            if (!baseUrl.equals(previousEndpoint)) return true;
            http = replacement;
            baseUrl = candidate;
            enrolledDeviceEndpoint = "";
        }
        persistRecoveredEndpoint(previousEndpoint, candidate);
        return true;
    }

    private void persistRecoveredEndpoint(String previousEndpoint, String recoveredEndpoint) {
        if (configPath == null || !cleanUrlValue(System.getenv("FE_MONSTER_COMMUNITY_URL")).isBlank()) return;
        try {
            if (!Files.isRegularFile(configPath)) return;
            String configured = normalizeBase(Files.readString(configPath));
            if (!configured.equals(previousEndpoint)) return;

            Path parent = configPath.getParent();
            if (parent == null) return;
            Path temporary = Files.createTempFile(parent, "community-server-url-", ".tmp");
            try {
                Files.writeString(temporary, recoveredEndpoint);
                try {
                    Files.move(
                        temporary,
                        configPath,
                        StandardCopyOption.ATOMIC_MOVE,
                        StandardCopyOption.REPLACE_EXISTING
                    );
                } catch (java.nio.file.AtomicMoveNotSupportedException ignored) {
                    Files.move(temporary, configPath, StandardCopyOption.REPLACE_EXISTING);
                }
            } finally {
                Files.deleteIfExists(temporary);
            }
        } catch (IOException ignored) {
            // Endpoint recovery remains active for this process even if an old
            // read-only installation cannot persist the migrated URL.
        }
    }

    private Map<String, Object> post(String path, Map<String, Object> payload) {
        return postWithTimeout(path, payload, TIMEOUT);
    }

    private Map<String, Object> postWithTimeout(String path, Map<String, Object> payload, Duration timeout) {
        try {
            Map<String, Object> requestPayload = withDeviceBinding(payload);
            String requestBody = SimpleJson.stringify(requestPayload);
            String idempotencyKey = UUID.randomUUID().toString();
            HttpResponse<String> response;
            try {
                response = httpClient().send(
                    buildPostRequest(path, requestBody, timeout, idempotencyKey),
                    HttpResponse.BodyHandlers.ofString()
                );
            } catch (IOException first) {
                sleepBeforeRetry();
                response = httpClient().send(
                    buildPostRequest(path, requestBody, timeout, idempotencyKey),
                    HttpResponse.BodyHandlers.ofString()
                );
            }
            Map<String, Object> body = SimpleJson.parseObject(response.body());
            if (deviceCredentialRejected(response.statusCode(), body)) {
                enrolledDeviceEndpoint = "";
                response = httpClient().send(
                    buildPostRequest(path, requestBody, timeout, idempotencyKey),
                    HttpResponse.BodyHandlers.ofString()
                );
                body = SimpleJson.parseObject(response.body());
            }
            if ("/api/community/achievements/evidence".equals(path)) {
                body.put("upstreamStatus", response.statusCode());
            }
            if (isPetMutationPath(path)) {
                decoratePetProxyFailure(body, response.statusCode());
            }
            if (response.statusCode() >= 200 && response.statusCode() < 500) return body;
            if (!body.containsKey("ok")) body.put("ok", false);
            return body;
        } catch (IOException | InterruptedException | IllegalArgumentException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("ok", false);
            body.put("error", e.getMessage() == null ? "community server unavailable" : e.getMessage());
            if (isPetMutationPath(path)) {
                body.put("upstreamStatus", 0);
                body.put("retryable", e instanceof IOException);
                body.put("errorClass", e instanceof IOException ? "transport" : "local-failure");
            }
            return body;
        }
    }

    private static boolean isPetMutationPath(String path) {
        return path != null && path.startsWith("/api/community/pet/");
    }

    private static boolean retryablePetUpstreamStatus(int status) {
        return status == 408 || status == 425 || status == 429 || status >= 500;
    }

    private static void decoratePetProxyFailure(Map<String, Object> body, int upstreamStatus) {
        boolean failed = upstreamStatus < 200
            || upstreamStatus >= 300
            || !SimpleJson.asBoolean(body.get("ok"), false);
        if (!failed) return;
        boolean retryable = retryablePetUpstreamStatus(upstreamStatus);
        body.put("upstreamStatus", upstreamStatus);
        body.put("retryable", retryable);
        body.put("errorClass", retryable ? "upstream-transient" : "upstream-business");
    }

    private Map<String, Object> withDeviceBinding(Map<String, Object> payload) {
        Map<String, Object> body = new LinkedHashMap<>();
        if (payload != null) body.putAll(payload);
        if (machine != null) {
            body.putIfAbsent("computerId", machine.computerId());
            body.putIfAbsent("computerIdSource", machine.computerIdSource());
        }
        return body;
    }

    private static void validatePetMutation(String action, Map<String, Object> payload) {
        if (payload.containsKey("clientContext")) {
            payload.put("clientContext", sanitizePetClientContext(payload.get("clientContext")));
        }
        if (payload.containsKey("clientRole")) {
            String clientRole = SimpleJson.asString(payload.get("clientRole"), "")
                .trim()
                .toLowerCase(java.util.Locale.ROOT);
            if (!EVENT_STREAM_ROLES.contains(clientRole)) {
                throw new IllegalArgumentException("pet client role is invalid");
            }
            payload.put("clientRole", clientRole);
        }
        String sessionId = SimpleJson.asString(payload.get("sessionId"), "");
        if (sessionId.length() > 160) throw new IllegalArgumentException("pet session id is too long");
        String requestId = SimpleJson.asString(payload.get("requestId"), "");
        if (requestId.length() > 160) throw new IllegalArgumentException("pet request id is too long");
        String actionId = SimpleJson.asString(payload.get("actionId"), "");
        if (actionId.length() > 160) throw new IllegalArgumentException("pet action id is too long");

        String text = SimpleJson.asString(payload.get("text"), "");
        int textLimit = "narrate".equals(action) ? 1_200 : "chat".equals(action) ? 2_000 : 4_000;
        if (text.length() > textLimit) throw new IllegalArgumentException("pet message is too long");
        String transcript = SimpleJson.asString(payload.get("transcript"), "");
        if (transcript.length() > 4_000) throw new IllegalArgumentException("pet transcript is too long");
        String title = SimpleJson.asString(payload.get("title"), "");
        if (title.length() > 160) throw new IllegalArgumentException("pet session title is too long");
        String voiceId = SimpleJson.asString(payload.get("voiceId"), "");
        if (voiceId.length() > 180) throw new IllegalArgumentException("pet voice id is too long");

        if ("narrate".equals(action) || "narrate/cancel".equals(action)) {
            if (!requestId.matches("[A-Za-z0-9][A-Za-z0-9._:-]{0,119}")) {
                throw new IllegalArgumentException("tour narration request id is invalid");
            }
            if ("narrate".equals(action) && text.isBlank()) {
                throw new IllegalArgumentException("tour narration text is required");
            }
        }

        if ("chat".equals(action) && !requestId.isBlank()
            && !requestId.matches("[A-Za-z0-9][A-Za-z0-9._:-]{0,119}")) {
            throw new IllegalArgumentException("pet request id is invalid");
        }

        if ("voice/chunk".equals(action)) {
            String mimeType = SimpleJson.asString(payload.get("mimeType"), "").toLowerCase();
            if (!mimeType.matches("audio/(?:webm|ogg|mp4|wav)(?:;[ ]*codecs=[a-z0-9.,_-]+)?")) {
                throw new IllegalArgumentException("unsupported pet audio type");
            }
            String encoded = SimpleJson.asString(payload.get("audioBase64"), "");
            if (encoded.isBlank() || encoded.length() > 2_796_204 || !encoded.matches("[A-Za-z0-9+/]*={0,2}")) {
                throw new IllegalArgumentException("invalid pet audio chunk");
            }
            int sequence = SimpleJson.asInt(payload.get("sequence"), -1);
            if (sequence < 0 || sequence > 1_000_000) throw new IllegalArgumentException("invalid pet audio sequence");
            int sampleRate = SimpleJson.asInt(payload.get("sampleRate"), 0);
            if (sampleRate < 0 || sampleRate > 384_000) throw new IllegalArgumentException("invalid pet audio sample rate");
            int channels = SimpleJson.asInt(payload.get("channels"), 1);
            if (channels < 1 || channels > 2) throw new IllegalArgumentException("invalid pet audio channels");
        }

        if ("voice/transcript".equals(action)) {
            int sequence = SimpleJson.asInt(payload.get("sequence"), -1);
            if (sequence < 0 || sequence > 1_000_000) throw new IllegalArgumentException("invalid pet transcript sequence");
        }

        if ("cancel".equals(action)) {
            if (sessionId.isBlank() || requestId.isBlank()) {
                throw new IllegalArgumentException("pet session id and request id are required");
            }
            if (sessionId.length() > 120) throw new IllegalArgumentException("pet session id is too long");
            if (requestId.length() > 120) throw new IllegalArgumentException("pet request id is too long");
            if (payload.containsKey("playedAudioSequences") && !(payload.get("playedAudioSequences") instanceof List<?>)) {
                throw new IllegalArgumentException("playedAudioSequences must be an array");
            }
            List<Object> playedAudioSequences = SimpleJson.asList(payload.get("playedAudioSequences"));
            if (playedAudioSequences.size() > 64) {
                throw new IllegalArgumentException("playedAudioSequences must contain at most 64 entries");
            }
            for (Object value : playedAudioSequences) {
                if (!(value instanceof Number number)
                    || !Double.isFinite(number.doubleValue())
                    || number.doubleValue() != Math.rint(number.doubleValue())
                    || number.longValue() < 0L
                    || number.longValue() > 1_000_000L) {
                    throw new IllegalArgumentException(
                        "playedAudioSequences entries must be integers from 0 to 1000000"
                    );
                }
            }
            validateOptionalPetInteger(payload, "maxPlayedAudioSequence", 1_000_000);
            validateOptionalPetInteger(payload, "activeAudioSequence", 1_000_000);
            validateOptionalPetInteger(payload, "playedMs", 600_000);
        }

        if ("live-stt".equals(action)) {
            String liveSttAction = SimpleJson.asString(payload.get("action"), "")
                .trim()
                .toLowerCase(java.util.Locale.ROOT);
            if (!PET_LIVE_STT_ACTIONS.contains(liveSttAction)) {
                throw new IllegalArgumentException("streaming STT action is invalid");
            }
            if (sessionId.isBlank()) throw new IllegalArgumentException("pet session id is required");
            if (sessionId.length() > 120) throw new IllegalArgumentException("pet session id is too long");
            String streamId = SimpleJson.asString(payload.get("streamId"), "").trim();
            if (!PET_LIVE_STT_ID_PATTERN.matcher(streamId).matches()) {
                throw new IllegalArgumentException("streaming STT stream id is invalid");
            }
            String itemId = SimpleJson.asString(payload.get("itemId"), "").trim();
            if (!itemId.isBlank() && !PET_LIVE_STT_ID_PATTERN.matcher(itemId).matches()) {
                throw new IllegalArgumentException("streaming STT item id is invalid");
            }
            if ("open".equals(liveSttAction) && itemId.isBlank()) {
                throw new IllegalArgumentException("streaming STT item id is required");
            }
            if ("frames".equals(liveSttAction)) {
                if (!payload.containsKey("sequence")) {
                    throw new IllegalArgumentException("streaming STT frame sequence is required");
                }
                validateOptionalPetInteger(payload, "sequence", 1_000_000);
                validatePetLiveSttAudioBase64(payload.get("audioBase64"));
            } else if (payload.containsKey("sequence")) {
                throw new IllegalArgumentException("streaming STT sequence is only valid for frames");
            }
            if (!"frames".equals(liveSttAction) && payload.containsKey("audioBase64")) {
                throw new IllegalArgumentException("streaming STT audio is only valid for frames");
            }
            payload.put("action", liveSttAction);
        }

        if ("action-result".equals(action) || "action-claim".equals(action)) {
            if (actionId.isBlank()) throw new IllegalArgumentException("pet action id is required");
        }
        if ("action-result".equals(action)) {
            String error = SimpleJson.asString(payload.get("error"), "");
            if (error.length() > 1_000) throw new IllegalArgumentException("pet action error is too long");
        }
    }

    private static void validatePetMemorySelector(Map<String, Object> payload) {
        String memoryId = SimpleJson.asString(payload.get("memoryId"), "").trim();
        if (!memoryId.matches("[A-Za-z0-9][A-Za-z0-9._:-]{0,159}")) {
            throw new IllegalArgumentException("invalid pet memory id");
        }
    }

    private static Map<String, Object> sanitizePetClientContext(Object value) {
        if (!(value instanceof Map<?, ?>)) {
            throw new IllegalArgumentException("pet client context must be an object");
        }
        Object sanitized = sanitizePetClientContextValue(value, 0);
        Map<String, Object> context = SimpleJson.asMap(sanitized);
        if (SimpleJson.stringify(context).length() > 20_000) {
            throw new IllegalArgumentException("pet client context is too large");
        }
        return context;
    }

    private static void validateOptionalPetInteger(Map<String, Object> payload, String field, int maximum) {
        if (!payload.containsKey(field)) return;
        Object value = payload.get(field);
        if (!(value instanceof Number number)
            || !Double.isFinite(number.doubleValue())
            || number.doubleValue() != Math.rint(number.doubleValue())
            || number.longValue() < 0L
            || number.longValue() > maximum) {
            throw new IllegalArgumentException(field + " must be an integer from 0 to " + maximum);
        }
    }

    private static byte[] validatePetLiveSttAudioBase64(Object value) {
        if (!(value instanceof String encoded)
            || encoded.isBlank()
            || encoded.length() > 24_000
            || encoded.length() % 4 != 0
            || !PET_LIVE_STT_BASE64_PATTERN.matcher(encoded).matches()) {
            throw new IllegalArgumentException("streaming STT audio must be canonical base64");
        }
        byte[] audio;
        try {
            audio = Base64.getDecoder().decode(encoded);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("streaming STT audio must be canonical base64");
        }
        if (audio.length == 0 || !Base64.getEncoder().encodeToString(audio).equals(encoded)) {
            throw new IllegalArgumentException("streaming STT audio must be canonical base64");
        }
        if (audio.length % 640 != 0) {
            throw new IllegalArgumentException(
                "streaming STT audio must contain complete 20 ms PCM16LE frames of 640 bytes"
            );
        }
        int frames = audio.length / 640;
        if (frames < 1 || frames > 25) {
            throw new IllegalArgumentException("streaming STT batches must contain 1 to 25 frames");
        }
        return audio;
    }

    private static Object sanitizePetClientContextValue(Object value, int depth) {
        if (value == null) return null;
        if (value instanceof Boolean || value instanceof Number) return value;
        if (value instanceof String text) {
            String bounded = text.length() > 1_000 ? text.substring(0, 1_000) : text;
            return sensitivePetContextValue(bounded) ? "[redacted]" : bounded;
        }
        if (depth >= 7) return null;
        if (value instanceof List<?> list) {
            List<Object> output = new ArrayList<>();
            for (Object item : list) {
                if (output.size() >= 64) break;
                output.add(sanitizePetClientContextValue(item, depth + 1));
            }
            return output;
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> output = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (output.size() >= 80) break;
                String key = entry.getKey() instanceof String text ? text : "";
                if (!key.matches("[A-Za-z0-9_.-]{1,96}") || sensitivePetContextKey(key)) continue;
                output.put(key, sanitizePetClientContextValue(entry.getValue(), depth + 1));
            }
            return output;
        }
        return String.valueOf(value).substring(0, Math.min(1_000, String.valueOf(value).length()));
    }

    private static boolean sensitivePetContextKey(String value) {
        String key = value.replaceAll("[^A-Za-z0-9]", "").toLowerCase(java.util.Locale.ROOT);
        return key.contains("password")
            || key.contains("passwd")
            || key.contains("secret")
            || key.contains("credential")
            || key.contains("token")
            || key.contains("cookie")
            || key.contains("authorization")
            || key.contains("apikey")
            || key.contains("privatekey")
            || key.contains("devicekey")
            || key.contains("accesskey")
            || key.contains("refreshkey")
            || key.contains("sessionkey");
    }

    private static boolean sensitivePetContextValue(String value) {
        String text = value == null ? "" : value;
        String lower = text.toLowerCase(java.util.Locale.ROOT);
        return lower.contains("bearer ")
            || lower.contains("cookie:")
            || lower.contains("cookie=")
            || lower.matches(".*api[_ -]?key\\s*[:=].*")
            || lower.matches(".*[?&](?:access_?token|refresh_?token|token|api_?key|secret|password|device_?key)=[^&#\\s]+.*")
            || text.matches(".*\\bsk-[A-Za-z0-9_-]{12,}.*")
            || text.matches(".*\\beyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}.*");
    }

    private static Map<String, Object> withAuthenticatedFeId(
        Map<String, Object> payload,
        String feId,
        Set<String> allowedFields
    ) {
        Map<String, Object> body = new LinkedHashMap<>();
        if (payload != null && allowedFields != null) {
            for (String field : allowedFields) {
                if (payload.containsKey(field)) body.put(field, payload.get(field));
            }
        }
        body.put("feId", requireFeId(feId));
        return body;
    }

    private static String requireFeId(String value) {
        String id = value == null ? "" : value.trim();
        if (!id.matches("\\d{8}")) throw new IllegalArgumentException("invalid community user id");
        return id;
    }

    private static String petAccountSignatureScope(String feId) {
        return "feId=" + requireFeId(feId);
    }

    private static String requireCreativeId(String value, String prefix) {
        String id = value == null ? "" : value.trim();
        String expectedPrefix = prefix == null ? "" : prefix;
        String suffix = id.startsWith(expectedPrefix) ? id.substring(expectedPrefix.length()) : "";
        if (suffix.length() < 12 || suffix.length() > 120 || !suffix.matches("[A-Za-z0-9_-]+")) {
            throw new IllegalArgumentException("invalid creative market id");
        }
        return id;
    }

    private static String boundedValue(String value, int maximumLength, String label) {
        String text = value == null ? "" : value.trim();
        if (text.length() > maximumLength) throw new IllegalArgumentException(label + " is too long");
        return text;
    }

    private static String boundedToken(String value, int maximumLength, String label) {
        String token = boundedValue(value, maximumLength, label);
        if (!token.isBlank() && !token.matches("[A-Za-z0-9._:-]+")) {
            throw new IllegalArgumentException("invalid " + label);
        }
        return token;
    }

    private static void appendQuery(StringBuilder target, String name, String value) {
        if (value == null || value.isBlank()) return;
        target.append(target.indexOf("?") >= 0 ? '&' : '?');
        target.append(encode(name)).append('=').append(encode(value));
    }

    private static String safeRangeHeader(String value) {
        String range = boundedValue(value, 96, "range header");
        if (range.isBlank()) return "";
        if (!range.matches("bytes=(?:\\d+-\\d*|-\\d+)")) {
            throw new IllegalArgumentException("invalid asset range");
        }
        return range;
    }

    private static void addOptionalHeader(HttpRequest.Builder builder, String name, String value) {
        String header = boundedValue(value, 512, name);
        if (header.isBlank()) return;
        for (int index = 0; index < header.length(); index += 1) {
            char ch = header.charAt(index);
            if (Character.isISOControl(ch) && ch != '\t') {
                throw new IllegalArgumentException("invalid " + name);
            }
        }
        builder.header(name, header);
    }

    private static String safeContentType(String value) {
        String contentType = boundedValue(value, 120, "creative upload content type").toLowerCase();
        int separator = contentType.indexOf(';');
        if (separator >= 0) contentType = contentType.substring(0, separator).trim();
        if (contentType.isBlank()) return "application/octet-stream";
        if (!contentType.matches("[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+")) {
            throw new IllegalArgumentException("invalid creative upload content type");
        }
        return contentType;
    }

    private Map<String, Object> get(String path) {
        return getWithTimeout(path, TIMEOUT);
    }

    private Map<String, Object> getWithAccountScope(String path, String feId) {
        return getWithTimeout(path, TIMEOUT, petAccountSignatureScope(feId));
    }

    private Map<String, Object> getWithTimeout(String path, Duration timeout) {
        return getWithTimeout(path, timeout, "");
    }

    private Map<String, Object> getWithTimeout(String path, Duration timeout, String signedContent) {
        try {
            HttpResponse<String> response;
            try {
                response = httpClient().send(buildGetRequest(path, timeout, signedContent), HttpResponse.BodyHandlers.ofString());
            } catch (IOException first) {
                sleepBeforeRetry();
                response = httpClient().send(buildGetRequest(path, timeout, signedContent), HttpResponse.BodyHandlers.ofString());
            }
            Map<String, Object> body = SimpleJson.parseObject(response.body());
            if (deviceCredentialRejected(response.statusCode(), body)) {
                enrolledDeviceEndpoint = "";
                response = httpClient().send(buildGetRequest(path, timeout, signedContent), HttpResponse.BodyHandlers.ofString());
                body = SimpleJson.parseObject(response.body());
            }
            if (response.statusCode() >= 200 && response.statusCode() < 500) return body;
            if (!body.containsKey("ok")) body.put("ok", false);
            return body;
        } catch (IOException | InterruptedException | IllegalArgumentException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("ok", false);
            body.put("error", e.getMessage() == null ? "community server unavailable" : e.getMessage());
            return body;
        }
    }

    private <T> HttpResponse<T> sendWithRetry(HttpRequest request, HttpResponse.BodyHandler<T> handler) throws IOException, InterruptedException {
        try {
            return httpClient().send(request, handler);
        } catch (IOException first) {
            sleepBeforeRetry();
            return httpClient().send(request, handler);
        }
    }

    private HttpRequest buildPostRequest(
        String path,
        String requestBody,
        Duration timeout,
        String idempotencyKey
    ) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(baseUrl + path))
            .timeout(timeout)
            .header("Content-Type", "application/json")
            .header("Idempotency-Key", idempotencyKey)
            .POST(HttpRequest.BodyPublishers.ofString(requestBody));
        addSandboxApiKey(builder, path);
        // A retry keeps the same idempotency key but gets a fresh signature
        // nonce, so replay protection and at-most-once mutation both hold.
        communitySignatureHeaders("POST", path, requestBody).forEach(builder::header);
        return builder.build();
    }

    private HttpRequest buildGetRequest(String path, Duration timeout, String signedContent) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(baseUrl + path))
            .timeout(timeout)
            .GET();
        addSandboxApiKey(builder, path);
        String signaturePath = path.contains("?") ? path.substring(0, path.indexOf('?')) : path;
        communitySignatureHeaders("GET", signaturePath, signedContent).forEach(builder::header);
        return builder.build();
    }

    private boolean deviceCredentialRejected(int statusCode, Map<String, Object> body) {
        if (statusCode != 401 || deviceCredentials == null) return false;
        String error = SimpleJson.asString(body == null ? null : body.get("error"), "").toLowerCase();
        return error.contains("device credential") || error.contains("device signature");
    }

    private Map<String, String> communitySignatureHeaders(String method, String path, String body) {
        if (communityModule != null) {
            Map<String, String> official = communityModule.signatureHeaders(method, path, body);
            if (official != null && !official.isEmpty()) return official;
        }
        if (deviceCredentials == null || path == null || !path.startsWith("/api/")) return Map.of();
        ensureServerClockObservation();
        ensureDeviceEnrolled();
        return deviceCredentials.signatureHeaders(method, path, body, deviceSignatureTimestampMillis());
    }

    private void ensureDeviceEnrolled() {
        String endpoint = baseUrl;
        if (endpoint.equals(enrolledDeviceEndpoint)) return;
        synchronized (deviceEnrollmentLock) {
            endpoint = baseUrl;
            if (endpoint.equals(enrolledDeviceEndpoint)) return;
            if (!secureOrPrivateCommunityEndpoint(endpoint)) {
                throw new IllegalArgumentException("public community server requires HTTPS");
            }

            String path = "/api/community/device/enroll";
            String body = SimpleJson.stringify(deviceCredentials.enrollmentPayload());
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(endpoint + path))
                .timeout(Duration.ofSeconds(5))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body));
            deviceCredentials.signatureHeaders(
                "POST",
                path,
                body,
                deviceSignatureTimestampMillis()
            ).forEach(builder::header);

            try {
                HttpResponse<String> response = httpClient().send(builder.build(), HttpResponse.BodyHandlers.ofString());
                Map<String, Object> result = SimpleJson.parseObject(response.body());
                if (response.statusCode() >= 200 && response.statusCode() < 300 &&
                    SimpleJson.asBoolean(result.get("ok"), false)) {
                    enrolledDeviceEndpoint = endpoint;
                    return;
                }

                // Older private/LAN servers do not expose device enrollment. They
                // remain compatible because private requests are still protected by
                // FE ID/computer ID binding and the server's local trust boundary.
                if (privateCommunityEndpoint(endpoint) && response.statusCode() == 404) {
                    enrolledDeviceEndpoint = endpoint;
                    return;
                }
                String error = SimpleJson.asString(result.get("error"), "device enrollment failed");
                throw new IllegalArgumentException(error);
            } catch (IOException e) {
                throw new IllegalArgumentException("could not enroll community device", e);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IllegalArgumentException("community device enrollment was interrupted", e);
            }
        }
    }

    private HttpClient httpClient() {
        HttpClient current = http;
        if (current != null) return current;
        synchronized (endpointLock) {
            current = http;
            if (current == null) {
                current = createHttpClient(baseUrl, httpPinPath);
                http = current;
            }
        }
        return current;
    }

    private static void sleepBeforeRetry() throws InterruptedException {
        Thread.sleep(180);
    }

    private static String normalizeBase(String value) {
        String cleaned = cleanUrlValue(value);
        String base = cleaned.isBlank() ? "http://127.0.0.1:3020" : cleaned;
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base;
    }

    private static String resolveBaseUrl(Path configPath) {
        String env = cleanUrlValue(System.getenv("FE_MONSTER_COMMUNITY_URL"));
        if (!env.isBlank()) return resolveConfiguredBaseUrl(env);
        if (configPath != null && Files.isRegularFile(configPath)) {
            try {
                String configured = cleanUrlValue(Files.readString(configPath));
                if (!configured.isBlank()) return resolveConfiguredBaseUrl(configured);
            } catch (IOException ignored) {
            }
        }
        String local = "http://127.0.0.1:3020";
        if (isCommunityServer(local, 250)) return local;
        String discovered = discoverCommunityServer();
        if (!discovered.isBlank()) return discovered;
        return local;
    }

    private static String requestedBaseUrl(Path configPath) {
        String env = cleanUrlValue(System.getenv("FE_MONSTER_COMMUNITY_URL"));
        if (!env.isBlank()) return normalizeBase(env);
        if (configPath != null && Files.isRegularFile(configPath)) {
            try {
                String configured = cleanUrlValue(Files.readString(configPath));
                if (!configured.isBlank()) return normalizeBase(configured);
            } catch (IOException ignored) {
            }
        }
        return "http://127.0.0.1:3020";
    }

    private static String resolveConfiguredBaseUrl(String configured) {
        String endpoint = normalizeBase(configured);
        if (!isDiscoverableLoopback(endpoint) || isCommunityServer(endpoint, 250)) return endpoint;
        String discovered = discoverCommunityServer(communityPort(endpoint));
        return discovered.isBlank() ? endpoint : discovered;
    }

    private static boolean isDiscoverableLoopback(String baseUrl) {
        try {
            URI uri = URI.create(normalizeBase(baseUrl));
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(java.util.Locale.ROOT);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(java.util.Locale.ROOT);
            return "http".equals(scheme)
                && ("localhost".equals(host) || "::1".equals(host) || host.startsWith("127."));
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    private static boolean secureOrPrivateCommunityEndpoint(String baseUrl) {
        try {
            URI uri = URI.create(normalizeBase(baseUrl));
            return "https".equalsIgnoreCase(uri.getScheme()) || privateCommunityEndpoint(baseUrl);
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    private static boolean privateCommunityEndpoint(String baseUrl) {
        try {
            URI uri = URI.create(normalizeBase(baseUrl));
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(java.util.Locale.ROOT);
            if ("localhost".equals(host) || "::1".equals(host) || host.startsWith("127.")) return true;
            if (host.startsWith("10.") || host.startsWith("192.168.")) return true;
            if (host.startsWith("fc") || host.startsWith("fd")) return true;
            if (host.startsWith("172.")) {
                String[] parts = host.split("\\.");
                if (parts.length > 1) {
                    int second = Integer.parseInt(parts[1]);
                    return second >= 16 && second <= 31;
                }
            }
        } catch (IllegalArgumentException ignored) {
        }
        return false;
    }

    private static int communityPort(String baseUrl) {
        try {
            URI uri = URI.create(normalizeBase(baseUrl));
            if (uri.getPort() > 0) return uri.getPort();
            return "https".equalsIgnoreCase(uri.getScheme()) ? 443 : 80;
        } catch (IllegalArgumentException ignored) {
            return 3020;
        }
    }

    private static String cleanUrlValue(String value) {
        if (value == null) return "";
        int start = 0;
        int end = value.length();
        while (start < end && isUrlPadding(value.charAt(start))) start++;
        while (end > start && isUrlPadding(value.charAt(end - 1))) end--;
        return value.substring(start, end).trim();
    }

    private static boolean isUrlPadding(char ch) {
        return Character.isWhitespace(ch) || Character.isISOControl(ch) || Character.getType(ch) == Character.FORMAT;
    }

    private static boolean isCommunityServer(String baseUrl, int timeoutMs) {
        HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(timeoutMs))
            .build();
        return isCommunityServer(client, baseUrl, timeoutMs);
    }

    private static boolean isCommunityServer(HttpClient client, String baseUrl, int timeoutMs) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(normalizeBase(baseUrl) + "/health"))
                .timeout(Duration.ofMillis(Math.max(timeoutMs, 200)))
                .GET()
                .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) return false;
            Map<String, Object> body = SimpleJson.parseObject(response.body());
            return SimpleJson.asBoolean(body.get("ok"), false) &&
                "fe-monster-community".equals(SimpleJson.asString(body.get("service"), ""));
        } catch (IOException | InterruptedException | IllegalArgumentException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            return false;
        }
    }

    private static String discoverCommunityServer() {
        return discoverCommunityServer(3020);
    }

    private static String discoverCommunityServer(int port) {
        List<String> candidates = discoveryCandidates(port);
        if (candidates.isEmpty()) return "";

        HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(180))
            .build();
        List<CompletableFuture<String>> probes = new ArrayList<>();
        for (String candidate : candidates) {
            probes.add(probeCommunityServer(client, candidate));
        }

        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(1200);
        while (System.nanoTime() < deadline) {
            for (CompletableFuture<String> probe : probes) {
                String value = completedProbeValue(probe);
                if (!value.isBlank()) {
                    probes.forEach((future) -> future.cancel(true));
                    return value;
                }
            }
            try {
                Thread.sleep(20);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return "";
            }
        }

        probes.forEach((future) -> future.cancel(true));
        return "";
    }

    private static CompletableFuture<String> probeCommunityServer(HttpClient client, String baseUrl) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(normalizeBase(baseUrl) + "/health"))
                .timeout(Duration.ofMillis(420))
                .GET()
                .build();
            return client.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .completeOnTimeout(null, 520, TimeUnit.MILLISECONDS)
                .thenApply((response) -> {
                    if (response == null || response.statusCode() < 200 || response.statusCode() >= 300) return "";
                    Map<String, Object> body = SimpleJson.parseObject(response.body());
                    boolean ok = SimpleJson.asBoolean(body.get("ok"), false) &&
                        "fe-monster-community".equals(SimpleJson.asString(body.get("service"), ""));
                    return ok ? normalizeBase(baseUrl) : "";
                })
                .exceptionally((error) -> "");
        } catch (IllegalArgumentException e) {
            return CompletableFuture.completedFuture("");
        }
    }

    private static String completedProbeValue(CompletableFuture<String> probe) {
        if (!probe.isDone()) return "";
        try {
            String value = probe.getNow("");
            return value == null ? "" : value;
        } catch (RuntimeException e) {
            return "";
        }
    }

    private static List<String> discoveryCandidates(int port) {
        int targetPort = port > 0 && port <= 65535 ? port : 3020;
        Set<String> candidates = new LinkedHashSet<>();
        try {
            for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!network.isUp() || network.isLoopback() || network.isVirtual() || isLikelyVirtualNetwork(network)) continue;
                for (InetAddress address : Collections.list(network.getInetAddresses())) {
                    if (!(address instanceof Inet4Address) || address.isLoopbackAddress() || address.isLinkLocalAddress() || !address.isSiteLocalAddress()) {
                        continue;
                    }

                    byte[] raw = address.getAddress();
                    int first = raw[0] & 0xff;
                    int second = raw[1] & 0xff;
                    int third = raw[2] & 0xff;
                    for (int host = 1; host <= 254; host += 1) {
                        String candidateHost = first + "." + second + "." + third + "." + host;
                        candidates.add("http://" + candidateHost + ":" + targetPort);
                    }
                }
            }
        } catch (IOException ignored) {
        }
        return new ArrayList<>(candidates);
    }

    private static boolean isLikelyVirtualNetwork(NetworkInterface network) {
        String text = ((network.getName() == null ? "" : network.getName()) + " " +
            (network.getDisplayName() == null ? "" : network.getDisplayName())).toLowerCase();
        return text.contains("virtual") ||
            text.contains("vmware") ||
            text.contains("virtualbox") ||
            text.contains("hyper-v") ||
            text.contains("loopback") ||
            text.contains("wsl") ||
            text.contains("tun") ||
            text.contains("tap") ||
            text.contains("vpn") ||
            text.contains("singbox");
    }

    private static Path tlsPinPath(Path configPath) {
        if (configPath == null) return null;
        Path parent = configPath.getParent();
        if (parent == null) return null;
        return parent.resolve("community-server-tls-pin.txt");
    }

    private static Path communityDeviceCredentialPath(Path configPath) {
        if (configPath == null) return null;
        Path parent = configPath.toAbsolutePath().normalize().getParent();
        if (parent == null) return null;
        return parent.resolve("community-device-credentials.json");
    }

    private static Path togetherListeningReportPath(Path configPath) {
        if (configPath == null) return null;
        Path normalized = configPath.toAbsolutePath().normalize();
        Path parent = normalized.getParent();
        if (parent == null) return null;
        return parent.resolve("community-together-listening-report.json");
    }

    private static Path communityAccountProfilePath(Path configPath) {
        if (configPath == null) return null;
        Path normalized = configPath.toAbsolutePath().normalize();
        Path parent = normalized.getParent();
        if (parent == null) return null;
        return parent.resolve("community-account-profiles.json");
    }

    private static HttpClient createHttpClient(String baseUrl, Path pinPath) {
        HttpClient.Builder builder = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2));
        Set<String> pins = readTlsPins(pinPath);
        if (!pins.isEmpty()) {
            try {
                SSLContext context = SSLContext.getInstance("TLS");
                context.init(null, new TrustManager[] { new PinnedTrustManager(defaultTrustManager(), pins) }, null);
                builder.sslContext(context);
            } catch (GeneralSecurityException ignored) {
            }
        }
        return builder.build();
    }

    private static Set<String> readTlsPins(Path pinPath) {
        Set<String> pins = new LinkedHashSet<>();
        if (pinPath == null || !Files.isRegularFile(pinPath)) return pins;
        try {
            for (String line : Files.readAllLines(pinPath)) {
                String value = line.trim();
                if (value.isBlank() || value.startsWith("#")) continue;
                if (value.regionMatches(true, 0, "sha256:", 0, "sha256:".length())) {
                    value = value.substring("sha256:".length());
                }
                value = value.replaceAll("[^A-Fa-f0-9]", "").toUpperCase();
                if (value.length() == 64) pins.add(value);
            }
        } catch (IOException ignored) {
        }
        return pins;
    }

    private static X509ExtendedTrustManager defaultTrustManager() throws GeneralSecurityException {
        TrustManagerFactory factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        factory.init((KeyStore) null);
        for (TrustManager manager : factory.getTrustManagers()) {
            if (manager instanceof X509ExtendedTrustManager extended) return extended;
            if (manager instanceof X509TrustManager basic) return new BasicTrustManagerAdapter(basic);
        }
        throw new GeneralSecurityException("no default X509 trust manager");
    }

    private static String sha256Fingerprint(X509Certificate certificate) throws CertificateException, NoSuchAlgorithmException {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded());
        StringBuilder text = new StringBuilder(digest.length * 2);
        for (byte item : digest) {
            text.append(String.format("%02X", item));
        }
        return text.toString();
    }

    private static final class PinnedTrustManager extends X509ExtendedTrustManager {
        private final X509ExtendedTrustManager delegate;
        private final Set<String> pins;

        private PinnedTrustManager(X509ExtendedTrustManager delegate, Set<String> pins) {
            this.delegate = delegate;
            this.pins = new LinkedHashSet<>(pins);
        }

        public void checkClientTrusted(X509Certificate[] chain, String authType, Socket socket) throws CertificateException {
            delegate.checkClientTrusted(chain, authType, socket);
        }

        public void checkServerTrusted(X509Certificate[] chain, String authType, Socket socket) throws CertificateException {
            CertificateException trustError = null;
            try {
                delegate.checkServerTrusted(chain, authType, socket);
            } catch (CertificateException error) {
                trustError = error;
            }
            requirePinned(chain, trustError);
        }

        public void checkClientTrusted(X509Certificate[] chain, String authType, SSLEngine engine) throws CertificateException {
            delegate.checkClientTrusted(chain, authType, engine);
        }

        public void checkServerTrusted(X509Certificate[] chain, String authType, SSLEngine engine) throws CertificateException {
            CertificateException trustError = null;
            try {
                delegate.checkServerTrusted(chain, authType, engine);
            } catch (CertificateException error) {
                trustError = error;
            }
            requirePinned(chain, trustError);
        }

        public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            delegate.checkClientTrusted(chain, authType);
        }

        public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            CertificateException trustError = null;
            try {
                delegate.checkServerTrusted(chain, authType);
            } catch (CertificateException error) {
                trustError = error;
            }
            requirePinned(chain, trustError);
        }

        public X509Certificate[] getAcceptedIssuers() {
            return delegate.getAcceptedIssuers();
        }

        private void requirePinned(X509Certificate[] chain, CertificateException trustError) throws CertificateException {
            if (chain != null && chain.length > 0) {
                try {
                    if (pins.contains(sha256Fingerprint(chain[0]))) {
                        chain[0].checkValidity();
                        return;
                    }
                } catch (GeneralSecurityException ignored) {
                }
            }
            if (trustError != null) throw trustError;
            throw new CertificateException("community server TLS certificate pin mismatch");
        }
    }

    private static final class BasicTrustManagerAdapter extends X509ExtendedTrustManager {
        private final X509TrustManager delegate;

        private BasicTrustManagerAdapter(X509TrustManager delegate) {
            this.delegate = delegate;
        }

        public void checkClientTrusted(X509Certificate[] chain, String authType, Socket socket) throws CertificateException {
            delegate.checkClientTrusted(chain, authType);
        }

        public void checkServerTrusted(X509Certificate[] chain, String authType, Socket socket) throws CertificateException {
            delegate.checkServerTrusted(chain, authType);
        }

        public void checkClientTrusted(X509Certificate[] chain, String authType, SSLEngine engine) throws CertificateException {
            delegate.checkClientTrusted(chain, authType);
        }

        public void checkServerTrusted(X509Certificate[] chain, String authType, SSLEngine engine) throws CertificateException {
            delegate.checkServerTrusted(chain, authType);
        }

        public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            delegate.checkClientTrusted(chain, authType);
        }

        public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            delegate.checkServerTrusted(chain, authType);
        }

        public X509Certificate[] getAcceptedIssuers() {
            return delegate.getAcceptedIssuers();
        }
    }

    private static final class BoundedInputStream extends FilterInputStream {
        private final long maximumBytes;
        private long bytesRead;

        private BoundedInputStream(InputStream input, long maximumBytes) {
            super(input);
            this.maximumBytes = maximumBytes;
        }

        @Override
        public int read() throws IOException {
            int value = super.read();
            if (value < 0) return -1;
            bytesRead += 1;
            assertWithinLimit();
            return value;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            if (length == 0) return 0;
            long remainingWithProbe = maximumBytes - bytesRead + 1;
            int boundedLength = (int) Math.min(length, Math.max(1L, remainingWithProbe));
            int count = super.read(buffer, offset, boundedLength);
            if (count < 0) return -1;
            bytesRead += count;
            assertWithinLimit();
            return count;
        }

        private void assertWithinLimit() throws IOException {
            if (bytesRead > maximumBytes) {
                throw new IOException("creative upload exceeds 512 MiB limit");
            }
        }
    }

    private static boolean isLegacyPublicGateway(HttpClient client, String baseUrl, int timeoutMs) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(normalizeBase(baseUrl) + "/health"))
                .timeout(Duration.ofMillis(Math.max(timeoutMs, 200)))
                .GET()
                .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) return false;
            Map<String, Object> body = SimpleJson.parseObject(response.body());
            return SimpleJson.asBoolean(body.get("ok"), false) &&
                "fe-monster-public-mobile-proxy".equals(SimpleJson.asString(body.get("service"), ""));
        } catch (IOException | InterruptedException | IllegalArgumentException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            return false;
        }
    }

    private static String legacyGatewayCommunityEndpoint(String baseUrl) {
        try {
            String normalized = normalizeBase(baseUrl);
            URI uri = URI.create(normalized);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(java.util.Locale.ROOT);
            String path = uri.getRawPath();
            if (!("http".equals(scheme) || "https".equals(scheme)) || uri.getHost() == null ||
                uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null ||
                !(path == null || path.isBlank() || "/".equals(path))) {
                return "";
            }
            return normalized + "/community";
        } catch (IllegalArgumentException ignored) {
            return "";
        }
    }

    private static String encode(String value) {
        return java.net.URLEncoder.encode(value == null ? "" : value, java.nio.charset.StandardCharsets.UTF_8);
    }

    private static String normalizeEventStreamRole(String value) {
        String role = value == null ? "" : value.trim().toLowerCase(java.util.Locale.ROOT);
        return EVENT_STREAM_ROLES.contains(role) ? role : "browser";
    }

    private static void addSandboxApiKey(HttpRequest.Builder builder, String path) {
        if (path == null || !path.startsWith("/api/sandbox") && !path.startsWith("/api/preset-market") &&
            !path.startsWith("/api/component-market") && !path.startsWith("/api/creative-market")) {
            return;
        }
        String key = System.getenv().getOrDefault("FE_SANDBOX_API_KEY", "").trim();
        if (!key.isBlank()) builder.header("X-FE-Sandbox-Key", key);
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "";
    }
}
