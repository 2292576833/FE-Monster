package com.femonster.core;

import com.femonster.json.SimpleJson;
import com.femonster.music.MusicProviderRegistry;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Opens an isolated official Chromium window and reads only the selected
 * provider's cookies through a loopback-only DevTools connection. Cookies are
 * handed directly to the provider client and are never returned to the web UI.
 */
public final class OfficialBrowserLoginService implements AutoCloseable {
    private static final Duration SESSION_TTL = Duration.ofMinutes(10);
    private static final Duration DEFAULT_SYNC_ATTEMPT_TIMEOUT = Duration.ofSeconds(18);
    private static final Duration DEFAULT_SYNC_TOTAL_BUDGET = Duration.ofSeconds(45);
    private static final Duration DEFAULT_TERMINAL_RETENTION = Duration.ofMinutes(2);
    private static final long MONITOR_INTERVAL_MILLIS = 150L;
    private static final Map<String, ProviderSpec> PROVIDERS = Map.of(
        "netease", new ProviderSpec(
            "网易云音乐",
            "https://music.163.com/#/login",
            List.of("163.com")
        ),
        "qq", new ProviderSpec(
            "QQ 音乐",
            "https://y.qq.com/n/ryqq/profile/like/song",
            List.of("qq.com")
        ),
        "kugou", new ProviderSpec(
            "酷狗音乐",
            "https://activity.kugou.com/login/v-53b2f120/index.html?appid=1014&redirectUrl=https%3A%2F%2Fwww.kugou.com%2F",
            List.of("kugou.com")
        )
    );

    private final Path profileRoot;
    private final MusicProviderRegistry music;
    private final Duration syncAttemptTimeout;
    private final Duration syncTotalBudget;
    private final Duration terminalRetention;
    private final Map<String, LoginSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, String> activeByProvider = new ConcurrentHashMap<>();
    private final ScheduledExecutorService monitorExecutor = Executors.newScheduledThreadPool(3, runnable -> {
        Thread thread = new Thread(runnable, "fe-monster-browser-session");
        thread.setDaemon(true);
        return thread;
    });
    private final ExecutorService syncExecutor = Executors.newFixedThreadPool(3, runnable -> {
        Thread thread = new Thread(runnable, "fe-monster-browser-sync");
        thread.setDaemon(true);
        return thread;
    });

    public OfficialBrowserLoginService(Path dataDir, MusicProviderRegistry music) {
        this(dataDir, music, DEFAULT_SYNC_ATTEMPT_TIMEOUT, DEFAULT_SYNC_TOTAL_BUDGET, DEFAULT_TERMINAL_RETENTION);
    }

    OfficialBrowserLoginService(
        Path dataDir,
        MusicProviderRegistry music,
        Duration syncAttemptTimeout,
        Duration syncTotalBudget
    ) {
        this(dataDir, music, syncAttemptTimeout, syncTotalBudget, DEFAULT_TERMINAL_RETENTION);
    }

    OfficialBrowserLoginService(
        Path dataDir,
        MusicProviderRegistry music,
        Duration syncAttemptTimeout,
        Duration syncTotalBudget,
        Duration terminalRetention
    ) {
        this.profileRoot = dataDir.toAbsolutePath().normalize().resolve("official-browser-login");
        this.music = music;
        this.syncAttemptTimeout = requirePositive(syncAttemptTimeout, "sync attempt timeout");
        this.syncTotalBudget = requirePositive(syncTotalBudget, "sync total budget");
        this.terminalRetention = requirePositive(terminalRetention, "terminal retention");
    }

    private static Duration requirePositive(Duration value, String label) {
        if (value == null || value.isZero() || value.isNegative()) {
            throw new IllegalArgumentException(label + " must be positive");
        }
        return value;
    }

    public synchronized Map<String, Object> start(String provider) {
        String id = MusicProviderRegistry.normalize(provider);
        ProviderSpec spec = PROVIDERS.get(id);
        if (spec == null) throw new IllegalArgumentException("unsupported browser login provider: " + id);

        String previousId = activeByProvider.remove(id);
        if (previousId != null) closeSession(sessions.get(previousId), "replaced");

        Path browser = findBrowser();
        if (browser == null) {
            throw new IllegalArgumentException("未找到 Microsoft Edge 或 Google Chrome，无法启动官方浏览器登录");
        }

        try {
            Map<String, Object> providerLogin = Map.of();
            String loginUrl = spec.loginUrl();
            if ("kugou".equals(id)) {
                music.clearBrowserSession(id);
                providerLogin = music.beginProviderLogin(id);
                loginUrl = validatedKugouLoginUrl(providerLogin);
            }
            Path profile = profileRoot.resolve(id).normalize();
            if (!profile.startsWith(profileRoot)) throw new IllegalArgumentException("invalid browser profile path");
            // Do not let expired cookies from an earlier isolated login be
            // mistaken for the QR scan the user is performing now.
            clearProviderProfile(id);
            Files.createDirectories(profile);
            int port = freeLoopbackPort();
            List<String> command = new ArrayList<>();
            command.add(browser.toString());
            command.add("--remote-debugging-address=127.0.0.1");
            command.add("--remote-debugging-port=" + port);
            command.add("--remote-allow-origins=http://127.0.0.1:" + port);
            command.add("--user-data-dir=" + profile);
            command.add("--no-first-run");
            command.add("--no-default-browser-check");
            command.add("--disable-sync");
            command.add("--window-size=520,720");
            command.add("--app=" + loginUrl);

            ProcessBuilder builder = new ProcessBuilder(command);
            builder.redirectOutput(ProcessBuilder.Redirect.DISCARD);
            builder.redirectError(ProcessBuilder.Redirect.DISCARD);
            Process process = builder.start();
            String sessionId = UUID.randomUUID().toString();
            LoginSession session = new LoginSession(sessionId, id, spec, browser.getFileName().toString(), port, process);
            if ("kugou".equals(id)) {
                session.providerManagedLogin = true;
                session.providerLoginKey = SimpleJson.asString(providerLogin.get("key"), "").trim();
                session.importPrepared = true;
            }
            sessions.put(sessionId, session);
            activeByProvider.put(id, sessionId);
            process.onExit().thenRun(() -> browserExited(session));
            startMonitor(session);
            return payload(session);
        } catch (IOException error) {
            throw new IllegalArgumentException("启动官方浏览器失败：" + detail(error));
        }
    }

    public Map<String, Object> status(String provider, String sessionId) {
        return status(provider, sessionId, -1L, 0);
    }

    public Map<String, Object> status(String provider, String sessionId, long afterRevision, int waitMillis) {
        String id = MusicProviderRegistry.normalize(provider);
        LoginSession session = requireSession(id, sessionId);
        synchronized (session) {
            int boundedWait = Math.max(0, Math.min(15_000, waitMillis));
            if (boundedWait > 0 && afterRevision >= 0L && session.revision <= afterRevision && !session.done()) {
                try {
                    session.wait(boundedWait);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                }
            }
            if (session.done()) return payload(session);
            if (System.nanoTime() - session.startedNanos > SESSION_TTL.toNanos()) {
                finishSession(session, "expired", "官方浏览器登录已超时，请重新打开");
                stopMonitor(session);
                cancelSync(session);
                closeProcess(session.process);
                activeByProvider.remove(id, session.id);
                return payload(session);
            }
            return payload(session);
        }
    }

    private void startMonitor(LoginSession session) {
        synchronized (session) {
            if (session.done() || session.monitorTask != null) return;
            session.monitorTask = monitorExecutor.scheduleWithFixedDelay(
                () -> monitorSession(session),
                100L,
                MONITOR_INTERVAL_MILLIS,
                TimeUnit.MILLISECONDS
            );
        }
    }

    private void monitorSession(LoginSession session) {
        if (session.providerManagedLogin) {
            monitorManagedProviderLogin(session);
            return;
        }
        Map<String, String> cookies;
        synchronized (session) {
            if (session.done()) {
                stopMonitor(session);
                return;
            }
            if (System.nanoTime() - session.startedNanos > SESSION_TTL.toNanos()) {
                finishSession(session, "expired", "官方浏览器登录已超时，请重新打开");
                activeByProvider.remove(session.provider, session.id);
                stopMonitor(session);
                cancelSync(session);
                closeProcess(session.process);
                return;
            }
            cookies = session.authenticatedCookies;
            if (!cookies.isEmpty()) beginProviderSync(session);
        }

        if (cookies.isEmpty()) {
            try {
                Map<String, String> detected = readProviderCookies(session);
                if (!hasAuthenticatedSession(session.provider, detected)) {
                    synchronized (session) {
                        if (!session.done()) {
                            transition(session, "waiting", "请在打开的" + session.spec.label() + "官方窗口中扫码并确认登录");
                        }
                    }
                    return;
                }
                cookies = Map.copyOf(detected);
                synchronized (session) {
                    if (session.done()) return;
                    session.authenticatedCookies = cookies;
                    beginProviderSync(session);
                }
            } catch (IOException | InterruptedException | RuntimeException error) {
                if (error instanceof InterruptedException) Thread.currentThread().interrupt();
                handleBrowserProbeFailure(session);
                return;
            }
        }

        synchronizeAuthenticatedSession(session, cookies);
    }

    private void monitorManagedProviderLogin(LoginSession session) {
        long now = System.nanoTime();
        synchronized (session) {
            if (session.done()) {
                stopMonitor(session);
                return;
            }
            if (now - session.startedNanos > SESSION_TTL.toNanos()) {
                finishSession(session, "expired", "酷狗扫码登录已超时，请重新打开");
                activeByProvider.remove(session.provider, session.id);
                stopMonitor(session);
                closeProcess(session.process);
                return;
            }
            if (now - session.lastProviderPollNanos < TimeUnit.MILLISECONDS.toNanos(350L)) return;
            session.lastProviderPollNanos = now;
        }

        try {
            Map<String, Object> state = music.pollProviderLogin(session.provider, session.providerLoginKey);
            int status = SimpleJson.asInt(state.get("status"), 0);
            boolean authenticated = SimpleJson.asBoolean(state.get("authenticated"), status == 4);
            if (!authenticated) {
                synchronized (session) {
                    if (session.done()) return;
                    if (status == 0) {
                        finishSession(session, "expired", "酷狗二维码已失效，请重新扫码");
                        activeByProvider.remove(session.provider, session.id);
                        stopMonitor(session);
                        closeProcess(session.process);
                    } else if (status == 2) {
                        transition(session, "waiting", "已扫码，请在酷狗音乐中确认登录");
                    } else {
                        transition(session, "waiting", "请使用酷狗音乐 App 扫码并确认登录");
                    }
                }
                return;
            }
            synchronized (session) {
                if (session.done()) return;
                session.authenticatedCookies = Map.of("provider-session", "ready");
                beginProviderSync(session);
            }
            synchronizeAuthenticatedSession(session, Map.of());
        } catch (RuntimeException error) {
            synchronized (session) {
                if (!session.done()) {
                    transition(session, "opening", "正在连接酷狗登录服务，请稍候");
                }
            }
        }
    }

    private static void beginProviderSync(LoginSession session) {
        if (session.syncStartedNanos == 0L) session.syncStartedNanos = System.nanoTime();
        transition(session, "syncing", session.spec.label() + "登录已确认，正在同步账号与歌单");
    }

    private void synchronizeAuthenticatedSession(LoginSession session, Map<String, String> cookies) {
        long remainingNanos;
        synchronized (session) {
            if (session.done()) return;
            beginProviderSync(session);
            remainingNanos = remainingSyncNanos(session);
            if (remainingNanos <= 0L) {
                failProviderSync(session);
                closeProcess(session.process);
                return;
            }
            session.syncAttempts += 1;
        }

        if (!prepareImportedSession(session)) return;

        Future<Map<String, Object>> task = syncExecutor.submit(
            () -> session.providerManagedLogin
                ? music.synchronizeCurrentSession(session.provider)
                : music.synchronizeBrowserSession(session.provider, cookies)
        );
        synchronized (session) {
            if (session.done()) {
                task.cancel(true);
                return;
            }
            session.syncTask = task;
        }

        try {
            long waitNanos = Math.max(1L, Math.min(syncAttemptTimeout.toNanos(), remainingNanos));
            Map<String, Object> sync = task.get(waitNanos, TimeUnit.NANOSECONDS);
            boolean completed;
            synchronized (session) {
                if (session.done()) return;
                session.accountReady = SimpleJson.asBoolean(sync.get("loggedIn"), false);
                session.playlistsReady = SimpleJson.asBoolean(sync.get("playlistsReady"), false);
                if (!SimpleJson.asBoolean(sync.get("ready"), false)) {
                    completed = false;
                } else {
                    completed = session.accountReady && session.playlistsReady;
                }
                if (completed) {
                    finishSession(session, "success", session.spec.label() + "登录成功，账号与歌单已同步");
                    activeByProvider.remove(session.provider, session.id);
                    stopMonitor(session);
                } else {
                    boolean terminal = retryOrFailProviderSync(session);
                    if (!terminal) session.authenticatedCookies = Map.of();
                }
            }
            if (completed || session.done()) closeProcess(session.process);
        } catch (TimeoutException | ExecutionException | RuntimeException error) {
            task.cancel(true);
            boolean terminal;
            synchronized (session) {
                if (session.done()) return;
                terminal = retryOrFailProviderSync(session);
                if (!terminal) session.authenticatedCookies = Map.of();
            }
            if (terminal) closeProcess(session.process);
        } catch (InterruptedException interrupted) {
            task.cancel(true);
            Thread.currentThread().interrupt();
        } finally {
            synchronized (session) {
                if (session.syncTask == task) session.syncTask = null;
            }
        }
    }

    private boolean prepareImportedSession(LoginSession session) {
        synchronized (session) {
            if (session.importPrepared) return true;
            session.importPrepared = true;
        }
        try {
            // An explicit QR login replaces the provider session. Clear the
            // previous account once so cookies from two users cannot be merged
            // while the new official-browser session is being verified.
            music.clearBrowserSession(session.provider);
            return true;
        } catch (RuntimeException error) {
            boolean terminal;
            synchronized (session) {
                session.importPrepared = false;
                if (session.done()) return false;
                terminal = retryOrFailProviderSync(session);
                if (!terminal) session.authenticatedCookies = Map.of();
            }
            if (terminal) closeProcess(session.process);
            return false;
        }
    }

    private void handleBrowserProbeFailure(LoginSession session) {
        synchronized (session) {
            if (session.done()) return;
            if (session.process == null || !session.process.isAlive()) {
                finishSession(session, "failed", "官方浏览器窗口已关闭，尚未检测到登录会话");
                activeByProvider.remove(session.provider, session.id);
                stopMonitor(session);
            } else {
                transition(session, "opening", "正在等待官方登录页面准备完成");
            }
        }
    }

    private long remainingSyncNanos(LoginSession session) {
        return syncTotalBudget.toNanos() - (System.nanoTime() - session.syncStartedNanos);
    }

    private boolean retryOrFailProviderSync(LoginSession session) {
        if (remainingSyncNanos(session) <= 0L) {
            failProviderSync(session);
            return true;
        }
        transition(session, "sync-retrying", session.spec.label() + "账号或歌单暂未准备好，正在自动重试");
        return false;
    }

    private void failProviderSync(LoginSession session) {
        finishSession(session, "sync-failed", session.spec.label() + "账号与歌单同步超时，请重试登录");
        activeByProvider.remove(session.provider, session.id);
        stopMonitor(session);
        cancelSync(session);
    }

    private void browserExited(LoginSession session) {
        synchronized (session) {
            if (session.providerManagedLogin && !session.done()) return;
            if (session.done() || !session.authenticatedCookies.isEmpty()) return;
            finishSession(session, "failed", "官方浏览器窗口已关闭，尚未检测到登录会话");
            activeByProvider.remove(session.provider, session.id);
            stopMonitor(session);
        }
    }

    private void finishSession(LoginSession session, String phase, String message) {
        if (!"success".equals(phase)) discardImportedSession(session);
        transition(session, phase, message);
        session.authenticatedCookies = Map.of();
        scheduleTerminalCleanup(session);
    }

    private void discardImportedSession(LoginSession session) {
        synchronized (session) {
            if (!session.importPrepared) return;
            session.importPrepared = false;
        }
        try {
            music.clearBrowserSession(session.provider);
        } catch (RuntimeException ignored) {
            // The login remains failed even if an already-corrupt provider
            // workspace cannot be removed. A later explicit login retries the
            // one-time cleanup before importing new browser cookies.
        }
    }

    private void scheduleTerminalCleanup(LoginSession session) {
        synchronized (session) {
            if (!session.done() || session.cleanupTask != null) return;
            try {
                session.cleanupTask = monitorExecutor.schedule(() -> {
                    synchronized (session) {
                        session.authenticatedCookies = Map.of();
                        sessions.remove(session.id, session);
                        activeByProvider.remove(session.provider, session.id);
                        session.cleanupTask = null;
                    }
                }, terminalRetention.toNanos(), TimeUnit.NANOSECONDS);
            } catch (RuntimeException rejected) {
                sessions.remove(session.id, session);
                activeByProvider.remove(session.provider, session.id);
            }
        }
    }

    private static void transition(LoginSession session, String phase, String message) {
        if (phase.equals(session.phase) && message.equals(session.message)) return;
        session.phase = phase;
        session.message = message;
        session.revision += 1L;
        session.notifyAll();
    }

    private static void stopMonitor(LoginSession session) {
        ScheduledFuture<?> task;
        synchronized (session) {
            task = session.monitorTask;
            session.monitorTask = null;
        }
        if (task != null) task.cancel(false);
    }

    private static void cancelSync(LoginSession session) {
        Future<?> task;
        synchronized (session) {
            task = session.syncTask;
            session.syncTask = null;
        }
        if (task != null) task.cancel(true);
    }

    public Map<String, Object> cancel(String provider, String sessionId) {
        String id = MusicProviderRegistry.normalize(provider);
        LoginSession session = requireSession(id, sessionId);
        synchronized (session) {
            if (!session.done()) {
                finishSession(session, "cancelled", "已关闭官方浏览器登录");
            }
            activeByProvider.remove(id, session.id);
            stopMonitor(session);
            cancelSync(session);
            closeProcess(session.process);
            return payload(session);
        }
    }

    public synchronized Map<String, Object> switchAccount(String provider) {
        String id = MusicProviderRegistry.normalize(provider);
        if (!PROVIDERS.containsKey(id)) {
            throw new IllegalArgumentException("unsupported browser login provider: " + id);
        }
        String previousId = activeByProvider.remove(id);
        if (previousId != null) closeSession(sessions.get(previousId), "replaced");
        boolean clearedLocalSession = music.clearBrowserSession(id);
        clearProviderProfile(id);
        Map<String, Object> body = new LinkedHashMap<>(start(id));
        body.put("switchedAccount", true);
        body.put("clearedLocalSession", clearedLocalSession);
        body.put("message", PROVIDERS.get(id).label() + "当前账号已清除，请使用新账号扫码登录");
        return body;
    }

    private LoginSession requireSession(String provider, String sessionId) {
        String id = sessionId == null ? "" : sessionId.trim();
        LoginSession session = sessions.get(id);
        if (session == null || !session.provider.equals(provider)) {
            throw new IllegalArgumentException("official browser login session not found");
        }
        return session;
    }

    private Map<String, String> readProviderCookies(LoginSession session) throws IOException, InterruptedException {
        HttpClient http = HttpClientHolder.INSTANCE;
        HttpRequest versionRequest = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + session.port + "/json/version"))
            .timeout(Duration.ofSeconds(3))
            .GET()
            .build();
        HttpResponse<String> versionResponse = http.send(versionRequest, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (versionResponse.statusCode() != 200) throw new IOException("browser debug endpoint is not ready");
        Map<String, Object> version = SimpleJson.parseObject(versionResponse.body());
        String socketUrl = SimpleJson.asString(version.get("webSocketDebuggerUrl"), "");
        if (socketUrl.isBlank()) throw new IOException("browser debug socket is unavailable");

        CdpListener listener = new CdpListener(1);
        WebSocket socket;
        try {
            socket = http.newWebSocketBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .buildAsync(URI.create(socketUrl), listener)
                .get(4, TimeUnit.SECONDS);
            Map<String, Object> command = new LinkedHashMap<>();
            command.put("id", 1);
            command.put("method", "Storage.getCookies");
            socket.sendText(SimpleJson.stringify(command), true).get(3, TimeUnit.SECONDS);
            String response = listener.response.get(5, TimeUnit.SECONDS);
            socket.sendClose(WebSocket.NORMAL_CLOSURE, "done");
            return filterCookies(session.spec, response);
        } catch (InterruptedException error) {
            throw error;
        } catch (Exception error) {
            throw new IOException("unable to read official browser session", error);
        }
    }

    private static Map<String, String> filterCookies(ProviderSpec spec, String raw) {
        Map<String, Object> root = SimpleJson.parseObject(raw);
        Map<String, Object> result = SimpleJson.asMap(root.get("result"));
        List<Object> items = SimpleJson.asList(result.get("cookies"));
        Map<String, String> found = new LinkedHashMap<>();
        for (Object item : items) {
            Map<String, Object> cookie = SimpleJson.asMap(item);
            String domain = SimpleJson.asString(cookie.get("domain"), "").toLowerCase(Locale.ROOT);
            if (!spec.matchesDomain(domain)) continue;
            String name = SimpleJson.asString(cookie.get("name"), "").trim();
            String value = SimpleJson.asString(cookie.get("value"), "").trim();
            if (name.isBlank() || value.isBlank() || found.size() >= 128) continue;
            found.put(name, value);
        }
        return found.entrySet().stream()
            .sorted(Map.Entry.comparingByKey(String.CASE_INSENSITIVE_ORDER))
            .collect(LinkedHashMap::new, (map, entry) -> map.put(entry.getKey(), entry.getValue()), Map::putAll);
    }

    private static boolean hasAuthenticatedSession(String provider, Map<String, String> cookies) {
        return switch (provider) {
            case "netease" -> hasCookie(cookies, "MUSIC_U", "MUSIC_A");
            case "qq" -> hasCookie(cookies, "uin", "p_uin", "wxuin")
                && hasCookie(cookies, "qm_keyst", "qqmusic_key");
            case "kugou" -> hasKugouAuthenticatedSession(cookies);
            default -> false;
        };
    }

    private static boolean hasKugouAuthenticatedSession(Map<String, String> cookies) {
        String kugoo = cookieValue(cookies, "KuGoo");
        String userid = firstNonBlank(
            cookieValue(cookies, "userid", "KugooID", "kugooid"),
            nestedCookieValue(kugoo, "KugooID", "userid")
        );
        String token = firstNonBlank(
            cookieValue(cookies, "token", "t", "KugooToken", "kugootoken", "KugooPwd"),
            nestedCookieValue(kugoo, "t", "KugooPwd", "token")
        );
        return !userid.isBlank() && !"0".equals(userid) && !token.isBlank();
    }

    private static String cookieValue(Map<String, String> cookies, String... names) {
        if (cookies == null || names == null) return "";
        for (String name : names) {
            for (Map.Entry<String, String> entry : cookies.entrySet()) {
                if (entry.getKey().equalsIgnoreCase(name)
                    && entry.getValue() != null
                    && !entry.getValue().isBlank()) {
                    return entry.getValue().trim();
                }
            }
        }
        return "";
    }

    private static String nestedCookieValue(String raw, String... names) {
        if (raw == null || raw.isBlank()) return "";
        String decoded;
        try {
            decoded = URLDecoder.decode(raw, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ignored) {
            decoded = raw;
        }
        for (String part : decoded.split("[&;]")) {
            int separator = part.indexOf('=');
            if (separator <= 0) continue;
            String key = part.substring(0, separator).trim();
            String value = part.substring(separator + 1).trim();
            for (String name : names) {
                if (key.equalsIgnoreCase(name) && !value.isBlank()) return value;
            }
        }
        return "";
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }

    private static String validatedKugouLoginUrl(Map<String, Object> providerLogin) {
        String key = SimpleJson.asString(providerLogin.get("key"), "").trim();
        String raw = SimpleJson.asString(providerLogin.get("loginUrl"), "").trim();
        if (key.isBlank() || key.length() > 512 || raw.isBlank()) {
            throw new IllegalArgumentException("酷狗二维码登录初始化失败");
        }
        try {
            URI uri = URI.create(raw);
            String queryKey = onlyQueryParameter(uri, "key");
            if (!"http".equalsIgnoreCase(uri.getScheme())
                || !"127.0.0.1".equalsIgnoreCase(uri.getHost())
                || uri.getPort() < 1024
                || uri.getUserInfo() != null
                || uri.getFragment() != null
                || !"/login/qr/view".equals(uri.getPath())
                || !key.equals(queryKey)) {
                throw new IllegalArgumentException("invalid Kugou QR login URL");
            }
            return uri.toASCIIString();
        } catch (RuntimeException error) {
            throw new IllegalArgumentException("酷狗二维码登录地址无效", error);
        }
    }

    private static String onlyQueryParameter(URI uri, String expectedName) {
        String rawQuery = uri.getRawQuery();
        if (rawQuery == null || rawQuery.isBlank()) return "";
        String value = null;
        for (String pair : rawQuery.split("&")) {
            int separator = pair.indexOf('=');
            String rawName = separator < 0 ? pair : pair.substring(0, separator);
            String rawValue = separator < 0 ? "" : pair.substring(separator + 1);
            String name;
            String decoded;
            try {
                name = URLDecoder.decode(rawName, StandardCharsets.UTF_8);
                decoded = URLDecoder.decode(rawValue, StandardCharsets.UTF_8);
            } catch (IllegalArgumentException error) {
                return "";
            }
            if (!expectedName.equals(name) || value != null) return "";
            value = decoded;
        }
        return value == null ? "" : value;
    }

    private static boolean hasCookie(Map<String, String> cookies, String... names) {
        for (Map.Entry<String, String> entry : cookies.entrySet()) {
            for (String name : names) {
                if (entry.getKey().equalsIgnoreCase(name) && entry.getValue() != null && !entry.getValue().isBlank()) return true;
            }
        }
        return false;
    }

    private static Map<String, Object> payload(LoginSession session) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", !"failed".equals(session.phase) && !"sync-failed".equals(session.phase));
        body.put("provider", session.provider);
        body.put("session", session.id);
        body.put("phase", session.phase);
        body.put("loggedIn", "success".equals(session.phase));
        body.put("syncing", "syncing".equals(session.phase) || "sync-retrying".equals(session.phase));
        body.put("retryable", "sync-retrying".equals(session.phase) || "sync-failed".equals(session.phase));
        body.put("syncAttempts", session.syncAttempts);
        body.put("accountReady", session.accountReady);
        body.put("playlistsReady", session.playlistsReady);
        body.put("revision", session.revision);
        body.put("terminal", session.done());
        body.put("message", session.message);
        body.put("browser", session.browserName);
        return body;
    }

    private Path findBrowser() {
        String override = System.getenv("FE_MONSTER_LOGIN_BROWSER");
        if (override != null && !override.isBlank()) {
            try {
                Path path = Path.of(override).toAbsolutePath().normalize();
                if (Files.isRegularFile(path)) return path;
            } catch (RuntimeException ignored) {
            }
        }

        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        List<Path> candidates = new ArrayList<>();
        if (os.contains("win")) {
            addWindowsBrowser(candidates, System.getenv("ProgramFiles(x86)"), "Microsoft/Edge/Application/msedge.exe");
            addWindowsBrowser(candidates, System.getenv("ProgramFiles"), "Microsoft/Edge/Application/msedge.exe");
            addWindowsBrowser(candidates, System.getenv("LOCALAPPDATA"), "Microsoft/Edge/Application/msedge.exe");
            addWindowsBrowser(candidates, System.getenv("ProgramFiles"), "Google/Chrome/Application/chrome.exe");
            addWindowsBrowser(candidates, System.getenv("ProgramFiles(x86)"), "Google/Chrome/Application/chrome.exe");
            addWindowsBrowser(candidates, System.getenv("LOCALAPPDATA"), "Google/Chrome/Application/chrome.exe");
        } else if (os.contains("mac")) {
            candidates.add(Path.of("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"));
            candidates.add(Path.of("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"));
            String home = System.getProperty("user.home", "");
            if (!home.isBlank()) {
                candidates.add(Path.of(home, "Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"));
                candidates.add(Path.of(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"));
            }
        } else {
            for (String command : List.of("/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium")) {
                candidates.add(Path.of(command));
            }
        }
        return candidates.stream().filter(Files::isRegularFile).findFirst().orElse(null);
    }

    private static void addWindowsBrowser(List<Path> candidates, String root, String relative) {
        if (root != null && !root.isBlank()) candidates.add(Path.of(root).resolve(relative));
    }

    private static int freeLoopbackPort() throws IOException {
        try (ServerSocket socket = new ServerSocket(0, 1, java.net.InetAddress.getLoopbackAddress())) {
            return socket.getLocalPort();
        }
    }

    private void clearProviderProfile(String provider) {
        Path normalizedRoot = profileRoot.toAbsolutePath().normalize();
        Path target = normalizedRoot.resolve(provider).normalize();
        if (!target.startsWith(normalizedRoot) || target.equals(normalizedRoot)) {
            throw new IllegalArgumentException("invalid browser profile path");
        }
        IOException lastError = null;
        for (int attempt = 0; attempt < 4; attempt++) {
            try {
                if (!Files.exists(target)) return;
                List<Path> paths;
                try (var stream = Files.walk(target)) {
                    paths = stream.sorted(Comparator.reverseOrder()).toList();
                }
                for (Path path : paths) Files.deleteIfExists(path);
                return;
            } catch (IOException error) {
                lastError = error;
                try {
                    Thread.sleep(120L * (attempt + 1));
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("browser profile cleanup interrupted", interrupted);
                }
            }
        }
        throw new IllegalStateException("unable to clear isolated browser profile for " + provider, lastError);
    }

    private void closeSession(LoginSession session, String phase) {
        if (session == null) return;
        synchronized (session) {
            if (!session.done()) {
                finishSession(session, phase, "官方浏览器登录已结束");
            }
            stopMonitor(session);
            cancelSync(session);
            closeProcess(session.process);
        }
    }

    private static void closeProcess(Process process) {
        if (process == null) return;
        try {
            List<ProcessHandle> descendants = process.descendants()
                .sorted(Comparator.comparingLong(ProcessHandle::pid).reversed())
                .toList();
            descendants.forEach(handle -> {
                if (handle.isAlive()) handle.destroy();
            });
            if (process.isAlive()) process.destroy();
            if (process.isAlive()) process.waitFor(1500, TimeUnit.MILLISECONDS);
            descendants.forEach(handle -> {
                if (handle.isAlive()) handle.destroyForcibly();
            });
            if (process.isAlive()) process.destroyForcibly();
            if (process.isAlive()) process.waitFor(1500, TimeUnit.MILLISECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException ignored) {
        }
    }

    private static String detail(Exception error) {
        Throwable current = error;
        while (current.getCause() != null) current = current.getCause();
        String message = current.getMessage();
        return message == null || message.isBlank() ? current.getClass().getSimpleName() : message;
    }

    @Override
    public void close() {
        sessions.values().forEach(session -> closeSession(session, "cancelled"));
        sessions.clear();
        activeByProvider.clear();
        monitorExecutor.shutdownNow();
        syncExecutor.shutdownNow();
    }

    private record ProviderSpec(String label, String loginUrl, List<String> domains) {
        boolean matchesDomain(String value) {
            String domain = value == null ? "" : value.toLowerCase(Locale.ROOT);
            while (domain.startsWith(".")) domain = domain.substring(1);
            for (String allowed : domains) {
                if (domain.equals(allowed) || domain.endsWith("." + allowed)) return true;
            }
            return false;
        }
    }

    private static final class HttpClientHolder {
        private static final HttpClient INSTANCE = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .build();
    }

    private static final class LoginSession {
        private final String id;
        private final String provider;
        private final ProviderSpec spec;
        private final String browserName;
        private final int port;
        private final Process process;
        private final long startedNanos = System.nanoTime();
        private long syncStartedNanos;
        private long lastProviderPollNanos;
        private Map<String, String> authenticatedCookies = Map.of();
        private ScheduledFuture<?> monitorTask;
        private ScheduledFuture<?> cleanupTask;
        private Future<?> syncTask;
        private boolean importPrepared;
        private boolean providerManagedLogin;
        private String providerLoginKey = "";
        private boolean accountReady;
        private boolean playlistsReady;
        private int syncAttempts;
        private long revision;
        private String phase = "opening";
        private String message = "正在打开官方登录页面";

        private LoginSession(String id, String provider, ProviderSpec spec, String browserName, int port, Process process) {
            this.id = id;
            this.provider = provider;
            this.spec = spec;
            this.browserName = browserName;
            this.port = port;
            this.process = process;
        }

        private boolean done() {
            return "success".equals(phase) || "failed".equals(phase) || "sync-failed".equals(phase) || "expired".equals(phase)
                || "cancelled".equals(phase) || "replaced".equals(phase);
        }
    }

    private static final class CdpListener implements WebSocket.Listener {
        private final int expectedId;
        private final StringBuilder fragments = new StringBuilder();
        private final CompletableFuture<String> response = new CompletableFuture<>();

        private CdpListener(int expectedId) {
            this.expectedId = expectedId;
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            fragments.append(data);
            if (last) {
                String raw = fragments.toString();
                fragments.setLength(0);
                try {
                    Map<String, Object> payload = SimpleJson.parseObject(raw);
                    if (SimpleJson.asInt(payload.get("id"), -1) == expectedId) response.complete(raw);
                } catch (RuntimeException ignored) {
                }
            }
            webSocket.request(1);
            return CompletableFuture.completedFuture(null);
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            response.completeExceptionally(error);
        }

        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            if (!response.isDone()) response.completeExceptionally(new IOException("browser debug socket closed"));
            return CompletableFuture.completedFuture(null);
        }
    }
}
