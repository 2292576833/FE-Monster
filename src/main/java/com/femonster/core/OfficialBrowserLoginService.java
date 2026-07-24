package com.femonster.core;

import com.femonster.json.SimpleJson;
import com.femonster.music.MusicProviderRegistry;

import java.io.IOException;
import java.net.ServerSocket;
import java.net.URI;
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
import java.util.concurrent.TimeUnit;

/**
 * Opens an isolated official Chromium window and reads only the selected
 * provider's cookies through a loopback-only DevTools connection. Cookies are
 * handed directly to the provider client and are never returned to the web UI.
 */
public final class OfficialBrowserLoginService implements AutoCloseable {
    private static final Duration SESSION_TTL = Duration.ofMinutes(10);
    private static final Map<String, ProviderSpec> PROVIDERS = Map.of(
        "netease", new ProviderSpec("网易云音乐", List.of("163.com")),
        "qq", new ProviderSpec("QQ 音乐", List.of("qq.com")),
        "kugou", new ProviderSpec("酷狗音乐", List.of("kugou.com")),
        "qishui", new ProviderSpec("汽水音乐", List.of("qishui.com"))
    );

    private final Path profileRoot;
    private final MusicProviderRegistry music;
    private final HttpClient http;
    private final Map<String, LoginSession> sessions = new ConcurrentHashMap<>();
    private final Map<String, String> activeByProvider = new ConcurrentHashMap<>();

    public OfficialBrowserLoginService(Path dataDir, MusicProviderRegistry music) {
        this.profileRoot = dataDir.toAbsolutePath().normalize().resolve("official-browser-login");
        this.music = music;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    }

    public synchronized Map<String, Object> start(String provider, int applicationPort) {
        String id = MusicProviderRegistry.normalize(provider);
        ProviderSpec spec = PROVIDERS.get(id);
        if (spec == null) throw new IllegalArgumentException("unsupported browser login provider: " + id);
        if (applicationPort < 1 || applicationPort > 65535) throw new IllegalArgumentException("invalid local application port");
        music.get(id);

        String previousId = activeByProvider.remove(id);
        if (previousId != null) closeSession(sessions.get(previousId), "replaced");

        Path browser = findBrowser();
        if (browser == null) {
            throw new IllegalArgumentException("未找到 Microsoft Edge 或 Google Chrome，无法启动官方浏览器登录");
        }

        try {
            Path profile = profileRoot.resolve(id).normalize();
            if (!profile.startsWith(profileRoot)) throw new IllegalArgumentException("invalid browser profile path");
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
            command.add("--window-size=440,600");
            command.add("--app=http://127.0.0.1:" + applicationPort + "/?official-login=" + id);

            ProcessBuilder builder = new ProcessBuilder(command);
            builder.redirectOutput(ProcessBuilder.Redirect.DISCARD);
            builder.redirectError(ProcessBuilder.Redirect.DISCARD);
            Process process = builder.start();
            String sessionId = UUID.randomUUID().toString();
            LoginSession session = new LoginSession(sessionId, id, spec, browser.getFileName().toString(), port, process);
            sessions.put(sessionId, session);
            activeByProvider.put(id, sessionId);
            return payload(session);
        } catch (IOException error) {
            throw new IllegalArgumentException("启动官方浏览器失败：" + detail(error));
        }
    }

    public Map<String, Object> status(String provider, String sessionId) {
        String id = MusicProviderRegistry.normalize(provider);
        LoginSession session = requireSession(id, sessionId);
        synchronized (session) {
            if (session.done()) return payload(session);
            if (System.nanoTime() - session.startedNanos > SESSION_TTL.toNanos()) {
                session.phase = "expired";
                session.message = "官方浏览器登录已超时，请重新打开";
                closeProcess(session.process);
                activeByProvider.remove(id, session.id);
                return payload(session);
            }

            try {
                Map<String, Object> account = music.accountPayload(id);
                if (SimpleJson.asBoolean(account.get("loggedIn"), false)) {
                    session.phase = "success";
                    session.message = session.spec.label() + "登录成功，正在同步账号与歌单";
                    activeByProvider.remove(id, session.id);
                    closeProcess(session.process);
                    return payload(session);
                }

                Map<String, String> cookies = readProviderCookies(session);
                if (hasAuthenticatedSession(id, cookies)) {
                    music.rememberBrowserSession(id, cookies);
                    session.phase = "success";
                    session.message = session.spec.label() + "登录成功，已安全保存本机会话";
                    activeByProvider.remove(id, session.id);
                    closeProcess(session.process);
                    return payload(session);
                }
                session.phase = "waiting";
                session.message = "请在打开的" + session.spec.label() + "官方窗口中扫码并确认登录";
            } catch (IOException | InterruptedException | RuntimeException error) {
                if (error instanceof InterruptedException) Thread.currentThread().interrupt();
                if (!session.process.isAlive()) {
                    session.phase = "failed";
                    session.message = "官方浏览器窗口已关闭，尚未检测到登录会话";
                    activeByProvider.remove(id, session.id);
                } else {
                    session.phase = "opening";
                    session.message = "正在等待官方登录页面准备完成";
                }
            }
            return payload(session);
        }
    }

    public Map<String, Object> cancel(String provider, String sessionId) {
        String id = MusicProviderRegistry.normalize(provider);
        LoginSession session = requireSession(id, sessionId);
        synchronized (session) {
            if (!session.done()) {
                session.phase = "cancelled";
                session.message = "已关闭官方浏览器登录";
            }
            activeByProvider.remove(id, session.id);
            closeProcess(session.process);
            return payload(session);
        }
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
                && hasCookie(cookies, "qm_keyst", "qqmusic_key", "p_skey", "skey");
            case "kugou" -> hasCookie(cookies, "KuGoo", "KugooID", "userid")
                || hasCookie(cookies, "token", "KugooToken");
            case "qishui" -> hasCookie(cookies, "sessionid", "sessionid_ss", "sid_tt", "sid_guard");
            default -> false;
        };
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
        body.put("ok", !"failed".equals(session.phase));
        body.put("provider", session.provider);
        body.put("session", session.id);
        body.put("phase", session.phase);
        body.put("loggedIn", "success".equals(session.phase));
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

    private void closeSession(LoginSession session, String phase) {
        if (session == null) return;
        synchronized (session) {
            if (!session.done()) {
                session.phase = phase;
                session.message = "官方浏览器登录已结束";
            }
            closeProcess(session.process);
        }
    }

    private static void closeProcess(Process process) {
        if (process == null) return;
        try {
            process.descendants().sorted(Comparator.comparingLong(ProcessHandle::pid).reversed()).forEach(handle -> {
                if (handle.isAlive()) handle.destroy();
            });
            if (process.isAlive()) process.destroy();
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
        activeByProvider.clear();
    }

    private record ProviderSpec(String label, List<String> domains) {
        boolean matchesDomain(String value) {
            String domain = value == null ? "" : value.toLowerCase(Locale.ROOT);
            while (domain.startsWith(".")) domain = domain.substring(1);
            for (String allowed : domains) {
                if (domain.equals(allowed) || domain.endsWith("." + allowed)) return true;
            }
            return false;
        }
    }

    private static final class LoginSession {
        private final String id;
        private final String provider;
        private final ProviderSpec spec;
        private final String browserName;
        private final int port;
        private final Process process;
        private final long startedNanos = System.nanoTime();
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
            return "success".equals(phase) || "failed".equals(phase) || "expired".equals(phase)
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
