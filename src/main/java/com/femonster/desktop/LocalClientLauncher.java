package com.femonster.desktop;

import com.femonster.core.ProjectPaths;
import com.femonster.json.SimpleJson;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public final class LocalClientLauncher {
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    private static final int DEFAULT_WINDOW_WIDTH = 1280;
    private static final int DEFAULT_WINDOW_HEIGHT = 720;
    private static volatile ClientSession currentSession;

    private LocalClientLauncher() {
    }

    public static boolean open(String url, ProjectPaths paths, Map<String, Object> settings) {
        Path profileDir = paths.dataDir.resolve("local-client-profile").toAbsolutePath().normalize();
        String clientUrl = embeddedClientUrl(url, settings);
        try {
            Files.createDirectories(profileDir);
        } catch (IOException ignored) {
        }

        Path runtimeProfile = paths.dataDir.resolve("local-client-profile-runtime-" + System.currentTimeMillis())
            .toAbsolutePath()
            .normalize();
        if (launchNativeClient(clientUrl, paths.root, settings)) return true;
        for (String browser : browserCandidates()) {
            if (launch(browser, clientUrl, runtimeProfile, paths.root, settings)) return true;
            if (launch(browser, clientUrl, profileDir, paths.root, settings)) return true;
        }
        return false;
    }

    public static Map<String, Object> runtimePayload(Map<String, Object> nativeAudio, Map<String, Object> settings) {
        boolean nativeAudioActive = Boolean.TRUE.equals(nativeAudio.get("active"));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("clientMode", "embedded");
        body.put("renderPreset", "directx11");
        body.put("renderBackend", "chromium-angle-d3d11");
        body.put("audioBackend", nativeAudioActive ? "xaudio2" : "html-audio-fallback");
        body.put("audioSpatialBackend", "x3daudio");
        body.put("audioDecoder", "media-foundation");
        body.put("settings", settings);
        body.put("nativeAudio", nativeAudio);
        body.put("launchFlags", launchFlags(settings));
        body.put("note", nativeAudioActive
            ? "DirectX 11 is used through Chromium ANGLE; audio is routed through the native XAudio2/X3DAudio bridge."
            : "DirectX 11 is used through Chromium ANGLE; build native/windows/fe-monster-xaudio2.dll to enable XAudio2/X3DAudio audio.");
        return body;
    }

    public static Map<String, Object> controlPayload(String action) {
        String command = action == null ? "" : action.trim().toLowerCase();
        try {
            return switch (command) {
                case "fullscreen" -> setWindowState("fullscreen");
                case "normal", "restore" -> setWindowState("normal");
                case "minimize", "minimise" -> setWindowState("minimized");
                case "close" -> closeLocalClient(false);
                case "quit", "exit" -> closeLocalClient(true);
                default -> error("unknown window action: " + action);
            };
        } catch (Exception e) {
            return error(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
        }
    }

    private static boolean launch(String browser, String url, Path profileDir, Path root, Map<String, Object> settings) {
        String executable = cleanCandidate(browser);
        if (executable.isBlank()) return false;
        try {
            Files.createDirectories(profileDir);
        } catch (IOException ignored) {
        }

        List<String> command = new ArrayList<>();
        command.add(executable);
        command.add("--app=" + url);
        command.add("--user-data-dir=" + profileDir);
        command.add("--remote-debugging-port=0");
        command.add("--no-first-run");
        command.add("--disable-extensions");
        command.add("--disable-features=TranslateUI");
        command.addAll(launchFlags(settings));
        command.add("--window-size=" + DEFAULT_WINDOW_WIDTH + "," + DEFAULT_WINDOW_HEIGHT);
        command.add("--window-position=120,80");
        try {
            Process process = new ProcessBuilder(command).start();
            if (process.waitFor(650, TimeUnit.MILLISECONDS) && process.exitValue() != 0) {
                return false;
            }
            int debugPort = waitForDebugPort(profileDir);
            currentSession = new ClientSession(process, profileDir, debugPort);
            applyBorderlessWindow(root, process.pid());
            System.out.println("Local client: " + executable + (debugPort > 0 ? " (debug port " + debugPort + ")" : ""));
            return true;
        } catch (IOException ignored) {
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private static boolean launchNativeClient(String url, Path root, Map<String, Object> settings) {
        for (String candidate : nativeClientCandidates(root)) {
            String executable = cleanCandidate(candidate);
            if (executable.isBlank() || !Files.isRegularFile(Path.of(executable))) continue;
            List<String> command = List.of(
                executable,
                "--url", url,
                "--width", String.valueOf(DEFAULT_WINDOW_WIDTH),
                "--height", String.valueOf(DEFAULT_WINDOW_HEIGHT),
                "--gpu", String.valueOf(setting(settings, "gpuAcceleration", true)),
                "--dx11", String.valueOf(setting(settings, "directX11", true)),
                "--xaudio2", String.valueOf(setting(settings, "xAudio2", true)),
                "--x3daudio", String.valueOf(setting(settings, "x3DAudio", true))
            );
            try {
                Process process = new ProcessBuilder(command).start();
                if (process.waitFor(650, TimeUnit.MILLISECONDS) && process.exitValue() != 0) {
                    continue;
                }
                currentSession = new ClientSession(process, Path.of(executable).getParent(), -1);
                System.out.println("Native embedded client: " + executable);
                return true;
            } catch (IOException ignored) {
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return false;
    }

    private static List<String> nativeClientCandidates(Path root) {
        List<String> candidates = new ArrayList<>();
        addEnv(candidates, "FE_MONSTER_NATIVE_CLIENT_EXE");
        candidates.add(root.resolve("native").resolve("windows").resolve("build").resolve("winforms").resolve("fe-monster-client.exe").toString());
        candidates.add(root.resolve("native").resolve("windows").resolve("build").resolve("fe-monster-client.exe").toString());
        candidates.add(root.resolve("out").resolve("fe-monster-client.exe").toString());
        return candidates;
    }

    private static String embeddedClientUrl(String url, Map<String, Object> settings) {
        String separator = url.contains("?") ? "&" : "?";
        String render = setting(settings, "directX11", true) ? "directx11" : "default";
        String audio = setting(settings, "xAudio2", true) ? "xaudio2" : "html-audio";
        return url + separator + "client=embedded&render=" + render + "&audio=" + audio;
    }

    private static List<String> launchFlags(Map<String, Object> settings) {
        if (!setting(settings, "gpuAcceleration", true)) return List.of("--disable-gpu");
        List<String> flags = new ArrayList<>();
        if (setting(settings, "directX11", true)) flags.add("--use-angle=d3d11");
        flags.add("--enable-gpu-rasterization");
        flags.add("--enable-accelerated-2d-canvas");
        flags.add("--force-high-performance-gpu");
        flags.add("--ignore-gpu-blocklist");
        flags.add("--autoplay-policy=no-user-gesture-required");
        return flags;
    }

    private static boolean setting(Map<String, Object> settings, String key, boolean fallback) {
        return SimpleJson.asBoolean(settings == null ? null : settings.get(key), fallback);
    }

    private static void applyBorderlessWindow(Path root, long processId) {
        String os = System.getProperty("os.name", "").toLowerCase();
        if (!os.contains("win")) return;
        Path script = root.resolve("scripts").resolve("make-window-borderless.ps1").toAbsolutePath().normalize();
        if (!Files.isRegularFile(script)) return;
        List<String> command = List.of(
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-File",
            script.toString(),
            "-TargetProcessId",
            String.valueOf(processId),
            "-Width",
            String.valueOf(DEFAULT_WINDOW_WIDTH),
            "-Height",
            String.valueOf(DEFAULT_WINDOW_HEIGHT)
        );
        try {
            new ProcessBuilder(command).start();
        } catch (IOException ignored) {
        }
    }

    private static List<String> browserCandidates() {
        List<String> candidates = new ArrayList<>();
        addEnv(candidates, "FE_MONSTER_CLIENT_EXE");
        addKnownWindowsBrowsers(candidates);
        candidates.add("msedge.exe");
        candidates.add("chrome.exe");
        return candidates;
    }

    private static void addEnv(List<String> candidates, String name) {
        String value = System.getenv(name);
        if (value != null && !value.isBlank()) candidates.add(cleanCandidate(value));
    }

    private static void addKnownWindowsBrowsers(List<String> candidates) {
        addBrowser(candidates, System.getenv("ProgramFiles(x86)"), "Microsoft\\Edge\\Application\\msedge.exe");
        addBrowser(candidates, System.getenv("ProgramFiles"), "Microsoft\\Edge\\Application\\msedge.exe");
        addBrowser(candidates, System.getenv("LOCALAPPDATA"), "Microsoft\\Edge\\Application\\msedge.exe");
        addBrowser(candidates, System.getenv("ProgramFiles"), "Google\\Chrome\\Application\\chrome.exe");
        addBrowser(candidates, System.getenv("ProgramFiles(x86)"), "Google\\Chrome\\Application\\chrome.exe");
        addBrowser(candidates, System.getenv("LOCALAPPDATA"), "Google\\Chrome\\Application\\chrome.exe");
    }

    private static void addBrowser(List<String> candidates, String root, String suffix) {
        if (root == null || root.isBlank()) return;
        Path path = Path.of(root, suffix.split("\\\\"));
        if (Files.isRegularFile(path)) candidates.add(path.toString());
    }

    private static String cleanCandidate(String value) {
        if (value == null) return "";
        String next = value.trim();
        while (next.length() >= 2 && next.startsWith("\"") && next.endsWith("\"")) {
            next = next.substring(1, next.length() - 1).trim();
        }
        return next;
    }

    private static Map<String, Object> setWindowState(String state) throws Exception {
        ClientSession session = currentSession;
        if (session == null || session.debugPort <= 0) {
            return error("local client control is unavailable");
        }

        String targetId = firstPageTargetId(session.debugPort);
        if (targetId.isBlank()) return error("local client page target was not found");

        Map<String, Object> window = cdpCommand(session.debugPort, "Browser.getWindowForTarget", Map.of("targetId", targetId));
        int windowId = SimpleJson.asInt(window.get("windowId"), -1);
        if (windowId < 0) return error("local client window id was not found");

        Map<String, Object> bounds = new LinkedHashMap<>();
        bounds.put("windowState", state);
        cdpCommand(session.debugPort, "Browser.setWindowBounds", Map.of("windowId", windowId, "bounds", bounds));
        Map<String, Object> body = ok();
        body.put("action", state);
        return body;
    }

    private static Map<String, Object> closeLocalClient(boolean quitServer) {
        ClientSession session = currentSession;
        currentSession = null;
        if (session != null && session.process.isAlive()) {
            session.process.destroy();
            try {
                if (!session.process.waitFor(900, TimeUnit.MILLISECONDS)) session.process.destroyForcibly();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                session.process.destroyForcibly();
            }
        }
        Map<String, Object> body = ok();
        body.put("action", quitServer ? "quit" : "close");
        return body;
    }

    private static int waitForDebugPort(Path profileDir) throws InterruptedException {
        Path portFile = profileDir.resolve("DevToolsActivePort");
        for (int i = 0; i < 24; i += 1) {
            try {
                if (Files.isRegularFile(portFile)) {
                    List<String> lines = Files.readAllLines(portFile);
                    if (!lines.isEmpty()) return Integer.parseInt(lines.get(0).trim());
                }
            } catch (IOException | NumberFormatException ignored) {
            }
            Thread.sleep(120);
        }
        return -1;
    }

    private static String firstPageTargetId(int port) throws IOException, InterruptedException {
        Object root = SimpleJson.parse(httpGet("http://127.0.0.1:" + port + "/json/list"));
        for (Object item : SimpleJson.asList(root)) {
            Map<String, Object> target = SimpleJson.asMap(item);
            String type = SimpleJson.asString(target.get("type"), "");
            String id = SimpleJson.asString(target.get("id"), "");
            if ("page".equals(type) && !id.isBlank()) return id;
        }
        return "";
    }

    private static Map<String, Object> cdpCommand(int port, String method, Map<String, Object> params) throws Exception {
        String version = httpGet("http://127.0.0.1:" + port + "/json/version");
        String wsUrl = SimpleJson.asString(SimpleJson.asMap(SimpleJson.parse(version)).get("webSocketDebuggerUrl"), "");
        if (wsUrl.isBlank()) throw new IOException("local client websocket endpoint was not found");

        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> responseText = new AtomicReference<>("");
        WebSocket socket = HTTP.newWebSocketBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .buildAsync(URI.create(wsUrl), new WebSocket.Listener() {
                @Override
                public void onOpen(WebSocket webSocket) {
                    webSocket.request(1);
                }

                @Override
                public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
                    responseText.updateAndGet(previous -> previous + data);
                    if (last) latch.countDown();
                    webSocket.request(1);
                    return null;
                }
            })
            .join();

        Map<String, Object> command = new LinkedHashMap<>();
        command.put("id", 1);
        command.put("method", method);
        command.put("params", params == null ? Map.of() : params);
        socket.sendText(SimpleJson.stringify(command), true).join();
        if (!latch.await(3, TimeUnit.SECONDS)) {
            socket.abort();
            throw new IOException("local client did not answer window command");
        }
        socket.sendClose(WebSocket.NORMAL_CLOSURE, "").join();

        Map<String, Object> response = SimpleJson.asMap(SimpleJson.parse(responseText.get()));
        Map<String, Object> error = SimpleJson.asMap(response.get("error"));
        if (!error.isEmpty()) {
            throw new IOException(SimpleJson.asString(error.get("message"), "window command failed"));
        }
        return SimpleJson.asMap(response.get("result"));
    }

    private static String httpGet(String url) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
            .timeout(Duration.ofSeconds(3))
            .GET()
            .build();
        HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 400) throw new IOException("HTTP " + response.statusCode() + " from " + url);
        return response.body();
    }

    private static Map<String, Object> ok() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("localClient", true);
        return body;
    }

    private static Map<String, Object> error(String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", false);
        body.put("localClient", currentSession != null);
        body.put("error", message);
        return body;
    }

    private record ClientSession(Process process, Path profileDir, int debugPort) {
    }
}
