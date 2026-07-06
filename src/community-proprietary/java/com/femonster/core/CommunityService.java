package com.femonster.core;

import com.femonster.community.CommunityClient;
import com.femonster.json.SimpleJson;

import java.io.IOException;
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
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
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
    private final HttpClient http;
    private final String baseUrl;
    private final MachineIdentityService machine;
    private final CommunityModuleBridge communityModule;
    private Map<String, Object> lastProfile = new LinkedHashMap<>();
    private volatile long lastHealthCheckAt = 0L;
    private volatile long lastHealthSuccessAt = 0L;
    private volatile boolean lastHealthCheckOk = false;

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
        this.baseUrl = normalizeBase(resolveBaseUrl(configPath));
        this.http = createHttpClient(this.baseUrl, tlsPinPath(configPath));
        this.machine = machine;
        this.communityModule = communityModule;
    }

    public Map<String, Object> state(String provider, String providerLabel, Map<String, Object> accountPayload) {
        Map<String, Object> body = basePayload(provider, accountPayload);
        body.put("serverUrl", baseUrl);
        boolean serverOnline = isOnline();
        body.put("serverOnline", serverOnline);

        if (!serverOnline) {
            body.put("ok", false);
            body.put("profile", new LinkedHashMap<>());
            body.put("friends", List.of());
            body.put("error", "社区服务器连接失败: " + baseUrl);
            return body;
        }

        if (!SimpleJson.asBoolean(accountPayload.get("loggedIn"), false)) {
            body.put("profile", new LinkedHashMap<>());
            body.put("friends", List.of());
            return body;
        }

        Map<String, Object> registered = register(provider, providerLabel, accountPayload);
        if (SimpleJson.asBoolean(registered.get("ok"), false)) {
            lastProfile = SimpleJson.asMap(registered.get("profile"));
            body.put("ok", true);
            body.put("serverOnline", true);
            body.put("profile", lastProfile);
            body.put("friends", SimpleJson.asList(registered.get("friends")));
            return body;
        }

        body.put("ok", false);
        body.put("profile", lastProfile);
        body.put("friends", List.of());
        body.put("error", SimpleJson.asString(registered.get("error"), "community server unavailable"));
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

    public Map<String, Object> recordListening(String provider, String providerLabel, Map<String, Object> accountPayload, long listenMsDelta, Map<String, Object> song) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("listenMsDelta", Math.max(0, listenMsDelta));
        request.put("song", song == null ? new LinkedHashMap<>() : song);
        return post("/api/community/listening", request);
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
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("bio", bio == null ? "" : bio);
        return post("/api/community/profile", request);
    }

    public Map<String, Object> nearby(String provider, String providerLabel, Map<String, Object> accountPayload, int radiusKm) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();
        int radius = Math.max(5, Math.min(10, radiusKm));
        return get("/api/community/nearby?feId=" + encode(feId) + "&radiusKm=" + radius);
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
        return get("/api/community/listen/state?feId=" + encode(feId));
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
        return post("/api/community/listen/respond", request);
    }

    public Map<String, Object> leaveListen(String provider, String providerLabel, Map<String, Object> accountPayload, String sessionId) {
        String feId = currentFeId(provider, providerLabel, accountPayload);
        if (feId.isBlank()) return loginRequired();

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("feId", feId);
        request.put("sessionId", sessionId);
        return post("/api/community/listen/leave", request);
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

    public HttpResponse<java.io.InputStream> eventStream(String feId, String after) throws IOException, InterruptedException {
        String id = feId == null ? "" : feId.trim();
        StringBuilder path = new StringBuilder("/api/community/events?feId=").append(encode(id));
        if (after != null && !after.isBlank()) {
            path.append("&after=").append(encode(after));
        }
        HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + path))
            .header("Accept", "text/event-stream")
            .GET()
            .build();
        return sendWithRetry(request, HttpResponse.BodyHandlers.ofInputStream());
    }

    private Map<String, Object> basePayload(String provider, Map<String, Object> accountPayload) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("provider", provider);
        body.put("loggedIn", SimpleJson.asBoolean(accountPayload.get("loggedIn"), false));
        body.put("account", SimpleJson.asMap(accountPayload.get("account")));
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
        if (machine != null) {
            request.put("computerId", machine.computerId());
            request.put("computerIdSource", machine.computerIdSource());
            request.put("computerName", machine.computerName());
            request.put("appVersion", machine.appVersion());
            request.put("installRoot", machine.installRoot());
        }
        return post("/api/community/register", request);
    }

    private String currentFeId(String provider, String providerLabel, Map<String, Object> accountPayload) {
        Map<String, Object> current = state(provider, providerLabel, accountPayload);
        if (!SimpleJson.asBoolean(current.get("ok"), false)) return "";
        Map<String, Object> profile = SimpleJson.asMap(current.get("profile"));
        return SimpleJson.asString(profile.get("feId"), "");
    }

    private Map<String, Object> loginRequired() {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("ok", false);
        error.put("error", "login required");
        return error;
    }

    private boolean isOnline() {
        long now = System.currentTimeMillis();
        if (now - lastHealthCheckAt < 1800) return lastHealthCheckOk;
        boolean online = isOnlineOnce();
        if (!online) {
            try {
                sleepBeforeRetry();
                online = isOnlineOnce();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        if (online) {
            lastHealthSuccessAt = now;
            lastHealthCheckAt = now;
            lastHealthCheckOk = true;
            return true;
        }

        if (lastHealthSuccessAt > 0 && now - lastHealthSuccessAt < 12000) {
            lastHealthCheckAt = now;
            lastHealthCheckOk = true;
            return true;
        }

        lastHealthCheckAt = now;
        lastHealthCheckOk = false;
        return false;
    }

    private boolean isOnlineOnce() {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/health"))
                .timeout(Duration.ofSeconds(2))
                .GET()
                .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) return false;
            Map<String, Object> body = SimpleJson.parseObject(response.body());
            return SimpleJson.asBoolean(body.get("ok"), false) &&
                "fe-monster-community".equals(SimpleJson.asString(body.get("service"), ""));
        } catch (IOException | InterruptedException | IllegalArgumentException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            return false;
        }
    }

    private Map<String, Object> post(String path, Map<String, Object> payload) {
        try {
            Map<String, Object> requestPayload = withDeviceBinding(payload);
            String requestBody = SimpleJson.stringify(requestPayload);
            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .timeout(TIMEOUT)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody));
            if (communityModule != null) {
                communityModule.signatureHeaders("POST", path, requestBody).forEach(builder::header);
            }
            HttpRequest request = builder.build();
            HttpResponse<String> response = sendWithRetry(request, HttpResponse.BodyHandlers.ofString());
            Map<String, Object> body = SimpleJson.parseObject(response.body());
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

    private Map<String, Object> withDeviceBinding(Map<String, Object> payload) {
        Map<String, Object> body = new LinkedHashMap<>();
        if (payload != null) body.putAll(payload);
        if (machine != null) {
            body.putIfAbsent("computerId", machine.computerId());
            body.putIfAbsent("computerIdSource", machine.computerIdSource());
        }
        return body;
    }

    private Map<String, Object> get(String path) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .timeout(TIMEOUT)
                .GET()
                .build();
            HttpResponse<String> response = sendWithRetry(request, HttpResponse.BodyHandlers.ofString());
            Map<String, Object> body = SimpleJson.parseObject(response.body());
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
            return http.send(request, handler);
        } catch (IOException first) {
            sleepBeforeRetry();
            return http.send(request, handler);
        }
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
        if (!env.isBlank()) return env;
        if (configPath != null && Files.isRegularFile(configPath)) {
            try {
                String configured = cleanUrlValue(Files.readString(configPath));
                if (!configured.isBlank()) return configured;
            } catch (IOException ignored) {
            }
        }
        String local = "http://127.0.0.1:3020";
        String discovered = discoverCommunityServer();
        if (!discovered.isBlank()) return discovered;
        if (isCommunityServer(local, 250)) return local;
        return local;
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
        try {
            HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(timeoutMs))
                .build();
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
        List<String> candidates = discoveryCandidates();
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

    private static List<String> discoveryCandidates() {
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
                        candidates.add("http://" + candidateHost + ":3020");
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

    private static HttpClient createHttpClient(String baseUrl, Path pinPath) {
        maybePinSakuraFrpCertificate(baseUrl, pinPath);
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

    private static void maybePinSakuraFrpCertificate(String baseUrl, Path pinPath) {
        if (pinPath == null || !isHttpsUrl(baseUrl) || Files.isRegularFile(pinPath)) return;
        try {
            URI uri = URI.create(baseUrl);
            String host = uri.getHost();
            if (host == null || host.isBlank()) return;
            int port = uri.getPort() > 0 ? uri.getPort() : 443;

            SSLContext context = SSLContext.getInstance("TLS");
            context.init(null, new TrustManager[] { TrustAllManager.INSTANCE }, null);
            try (SSLSocket socket = (SSLSocket) context.getSocketFactory().createSocket(host, port)) {
                socket.setSoTimeout(2500);
                socket.startHandshake();
                SSLSession session = socket.getSession();
                java.security.cert.Certificate[] chain = session.getPeerCertificates();
                if (chain.length == 0 || !(chain[0] instanceof X509Certificate certificate)) return;
                if (!isSakuraFrpAutomaticTls(certificate)) return;

                if (pinPath.getParent() != null) Files.createDirectories(pinPath.getParent());
                Files.writeString(pinPath, "sha256:" + sha256Fingerprint(certificate) + System.lineSeparator());
            }
        } catch (Exception ignored) {
        }
    }

    private static boolean isHttpsUrl(String value) {
        try {
            return "https".equalsIgnoreCase(URI.create(value).getScheme());
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static boolean isSakuraFrpAutomaticTls(X509Certificate certificate) {
        String subject = certificate.getSubjectX500Principal().getName();
        String issuer = certificate.getIssuerX500Principal().getName();
        return subject.contains("SakuraFrp Automatic TLS") && subject.equals(issuer);
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
            try {
                delegate.checkServerTrusted(chain, authType, socket);
            } catch (CertificateException error) {
                acceptPinned(chain, error);
            }
        }

        public void checkClientTrusted(X509Certificate[] chain, String authType, SSLEngine engine) throws CertificateException {
            delegate.checkClientTrusted(chain, authType, engine);
        }

        public void checkServerTrusted(X509Certificate[] chain, String authType, SSLEngine engine) throws CertificateException {
            try {
                delegate.checkServerTrusted(chain, authType, engine);
            } catch (CertificateException error) {
                acceptPinned(chain, error);
            }
        }

        public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            delegate.checkClientTrusted(chain, authType);
        }

        public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
            try {
                delegate.checkServerTrusted(chain, authType);
            } catch (CertificateException error) {
                acceptPinned(chain, error);
            }
        }

        public X509Certificate[] getAcceptedIssuers() {
            return delegate.getAcceptedIssuers();
        }

        private void acceptPinned(X509Certificate[] chain, CertificateException original) throws CertificateException {
            if (chain != null && chain.length > 0) {
                try {
                    if (pins.contains(sha256Fingerprint(chain[0]))) return;
                } catch (GeneralSecurityException ignored) {
                }
            }
            throw original;
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

    private static final class TrustAllManager extends X509ExtendedTrustManager {
        private static final TrustAllManager INSTANCE = new TrustAllManager();

        public void checkClientTrusted(X509Certificate[] chain, String authType, Socket socket) {
        }

        public void checkServerTrusted(X509Certificate[] chain, String authType, Socket socket) {
        }

        public void checkClientTrusted(X509Certificate[] chain, String authType, SSLEngine engine) {
        }

        public void checkServerTrusted(X509Certificate[] chain, String authType, SSLEngine engine) {
        }

        public void checkClientTrusted(X509Certificate[] chain, String authType) {
        }

        public void checkServerTrusted(X509Certificate[] chain, String authType) {
        }

        public X509Certificate[] getAcceptedIssuers() {
            return new X509Certificate[0];
        }
    }

    private static String encode(String value) {
        return java.net.URLEncoder.encode(value == null ? "" : value, java.nio.charset.StandardCharsets.UTF_8);
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "";
    }
}
