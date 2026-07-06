package com.femonster.music;

import com.femonster.core.ProjectPaths;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

public final class MusicApiBootstrap {
    private static final HttpClient HTTP = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(2))
        .build();
    private static final List<ApiService> SERVICES = List.of(
        new ApiService("netease", "FE_NETEASE_BASE_URL", "FE_NETEASE_AUTOSTART", "http://127.0.0.1:3010", "start-ncm-api.ps1", "/login/status"),
        new ApiService("qq", "FE_QQ_BASE_URL", "FE_QQ_AUTOSTART", "http://127.0.0.1:3011", "start-qq-api.ps1", "/getHotkey"),
        new ApiService("kugou", "FE_KUGOU_BASE_URL", "FE_KUGOU_AUTOSTART", "http://127.0.0.1:3012", "start-kugou-api.ps1", "/search/hot")
    );

    private MusicApiBootstrap() {
    }

    public static void ensureAvailable(ProjectPaths paths) {
        if (isDisabled("FE_MUSIC_API_AUTOSTART")) return;
        for (ApiService service : SERVICES) {
            ensureAvailable(paths, service);
        }
    }

    private static void ensureAvailable(ProjectPaths paths, ApiService service) {
        if (isDisabled(service.autostartEnv)) return;

        String baseUrl = normalizeBase(System.getenv().getOrDefault(service.baseUrlEnv, service.defaultBaseUrl));
        URI baseUri = safeUri(baseUrl);
        if (baseUri == null || !isLocalHost(baseUri.getHost())) return;
        if (isReachable(baseUrl + service.probePath)) return;

        Path script = paths.root.resolve("scripts").resolve(service.scriptName);
        if (!Files.exists(script)) return;

        int port = baseUri.getPort() > 0 ? baseUri.getPort() : URI.create(service.defaultBaseUrl).getPort();
        ProcessBuilder builder = new ProcessBuilder(
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-File",
            script.toString(),
            "-Root",
            paths.root.toString(),
            "-Port",
            String.valueOf(port)
        );
        builder.directory(paths.root.toFile());
        builder.redirectOutput(ProcessBuilder.Redirect.DISCARD);
        builder.redirectError(ProcessBuilder.Redirect.DISCARD);

        try {
            Process process = builder.start();
            if (!process.waitFor(30, TimeUnit.SECONDS)) {
                process.destroy();
            }
        } catch (IOException ignored) {
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    private static boolean isDisabled(String envName) {
        String value = System.getenv().getOrDefault(envName, "");
        return "0".equals(value) || "false".equalsIgnoreCase(value) || "no".equalsIgnoreCase(value);
    }

    private static boolean isReachable(String url) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(2))
                .GET()
                .build();
            HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
            return response.statusCode() >= 200 && response.statusCode() < 500;
        } catch (IOException | InterruptedException | IllegalArgumentException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            return false;
        }
    }

    private static URI safeUri(String value) {
        try {
            return URI.create(value);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private static boolean isLocalHost(String host) {
        if (host == null || host.isBlank()) return false;
        String value = host.toLowerCase(Locale.ROOT);
        return "127.0.0.1".equals(value) || "localhost".equals(value) || "::1".equals(value);
    }

    private static String normalizeBase(String value) {
        String base = value == null || value.isBlank() ? "" : value.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base;
    }

    private record ApiService(
        String id,
        String baseUrlEnv,
        String autostartEnv,
        String defaultBaseUrl,
        String scriptName,
        String probePath
    ) {
    }
}
