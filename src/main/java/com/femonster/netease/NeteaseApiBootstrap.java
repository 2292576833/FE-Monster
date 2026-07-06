package com.femonster.netease;

import com.femonster.core.ProjectPaths;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

public final class NeteaseApiBootstrap {
    private static final String DEFAULT_BASE_URL = "http://127.0.0.1:3010";

    private NeteaseApiBootstrap() {
    }

    public static void ensureAvailable(ProjectPaths paths) {
        if (isDisabled()) return;

        String baseUrl = normalizeBase(System.getenv().getOrDefault("FE_NETEASE_BASE_URL", DEFAULT_BASE_URL));
        URI baseUri = safeUri(baseUrl);
        if (baseUri == null || !isLocalHost(baseUri.getHost())) return;
        if (isReachable(baseUrl)) return;

        Path script = paths.root.resolve("scripts").resolve("start-ncm-api.ps1");
        Path apiScript = paths.root.resolve("scripts").resolve("netease-api-server.cjs");
        Path apiPackage = paths.root.resolve("node_modules").resolve("NeteaseCloudMusicApi");
        if (!Files.exists(script) || !Files.exists(apiScript) || !Files.isDirectory(apiPackage)) return;

        int port = baseUri.getPort() > 0 ? baseUri.getPort() : 3010;
        ProcessBuilder builder = new ProcessBuilder(
            "powershell.exe",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
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
            if (!process.waitFor(12, TimeUnit.SECONDS)) {
                process.destroy();
            }
        } catch (IOException | InterruptedException ignored) {
            if (ignored instanceof InterruptedException) Thread.currentThread().interrupt();
        }
    }

    private static boolean isDisabled() {
        String value = System.getenv().getOrDefault("FE_NETEASE_AUTOSTART", "");
        return "0".equals(value) || "false".equalsIgnoreCase(value) || "no".equalsIgnoreCase(value);
    }

    private static boolean isReachable(String baseUrl) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(baseUrl + "/login/status"))
                .timeout(Duration.ofSeconds(2))
                .GET()
                .build();
            HttpResponse<String> response = HttpClient.newHttpClient()
                .send(request, HttpResponse.BodyHandlers.ofString());
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
        String base = value == null || value.isBlank() ? DEFAULT_BASE_URL : value.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        return base;
    }
}
