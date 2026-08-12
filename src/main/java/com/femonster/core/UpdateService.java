package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

public final class UpdateService {
    private final ProjectPaths paths;
    private final Path progressDir;

    public UpdateService(ProjectPaths paths) {
        this.paths = paths;
        this.progressDir = paths.dataDir.resolve("update-progress");
    }

    public Map<String, Object> startInstall(Map<String, Object> release) {
        String osName = System.getProperty("os.name", "").toLowerCase();
        if (!osName.contains("win")) {
            return error("Automatic updates are not available on macOS yet. Install a signed FE Monster app update manually.");
        }
        String downloadUrl = SimpleJson.asString(release.get("downloadUrl"), "");
        String version = SimpleJson.asString(release.get("version"), "");
        String sha256 = SimpleJson.asString(release.get("sha256"), "").trim().toLowerCase();
        if (sha256.startsWith("sha256:")) sha256 = sha256.substring("sha256:".length());
        if (!isOfficialGitHubReleaseAsset(downloadUrl)) {
            return error("update download url is not an official FE Monster GitHub release asset");
        }
        if (sha256.isBlank()) return error("update sha256 is required");
        if (!sha256.matches("[0-9a-f]{64}")) return error("update sha256 is invalid");
        if (version.isBlank()) version = "unknown";

        String id = UUID.randomUUID().toString().replace("-", "");
        Path progressFile = progressDir.resolve(id + ".json").toAbsolutePath().normalize();
        try {
            Files.createDirectories(progressDir);
            writeProgress(progressFile, "queued", 0, "Update queued");
        } catch (IOException e) {
            return error(e.getMessage());
        }

        Path script = paths.root.resolve("scripts").resolve("apply-client-update.ps1");
        if (!Files.isRegularFile(script)) return error("update script was not found: " + script);

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
            "-DownloadUrl",
            downloadUrl,
            "-Version",
            version,
            "-Sha256",
            sha256,
            "-ProgressFile",
            progressFile.toString()
        );
        builder.directory(paths.root.toFile());
        builder.redirectOutput(ProcessBuilder.Redirect.DISCARD);
        builder.redirectError(ProcessBuilder.Redirect.DISCARD);

        try {
            builder.start();
        } catch (IOException e) {
            writeProgressQuietly(progressFile, "failed", 0, e.getMessage());
            return error(e.getMessage());
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("progressId", id);
        body.put("version", version);
        return body;
    }

    public Map<String, Object> progress(String id) {
        String safeId = id == null ? "" : id.replaceAll("[^A-Za-z0-9_-]", "");
        if (safeId.isBlank()) return error("progress id is required");
        Path progressFile = progressDir.resolve(safeId + ".json").toAbsolutePath().normalize();
        if (!progressFile.startsWith(progressDir.toAbsolutePath().normalize())) return error("invalid progress id");
        try {
            if (!Files.isRegularFile(progressFile)) return error("progress was not found");
            Map<String, Object> body = SimpleJson.parseObject(Files.readString(progressFile, StandardCharsets.UTF_8));
            body.put("ok", true);
            return body;
        } catch (IOException e) {
            return error(e.getMessage());
        }
    }

    private static void writeProgress(Path file, String status, int percent, String message) throws IOException {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("status", status);
        body.put("percent", Math.max(0, Math.min(100, percent)));
        body.put("message", message == null ? "" : message);
        body.put("updatedAt", System.currentTimeMillis());
        Files.writeString(file, SimpleJson.stringify(body), StandardCharsets.UTF_8);
    }

    private static boolean isOfficialGitHubReleaseAsset(String downloadUrl) {
        if (downloadUrl == null || downloadUrl.isBlank()) return false;
        try {
            URI uri = URI.create(downloadUrl);
            String path = uri.getPath() == null ? "" : uri.getPath();
            return "https".equalsIgnoreCase(uri.getScheme())
                && "github.com".equalsIgnoreCase(uri.getHost())
                && path.matches("(?i)^/2292576833/FE-Monster/releases/download/[^/]+/FE[-_. ]?Monster[^/]*\\.exe$");
        } catch (IllegalArgumentException error) {
            return false;
        }
    }

    private static void writeProgressQuietly(Path file, String status, int percent, String message) {
        try {
            writeProgress(file, status, percent, message);
        } catch (IOException ignored) {
        }
    }

    private static Map<String, Object> error(String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", false);
        body.put("error", message == null || message.isBlank() ? "update failed" : message);
        return body;
    }
}
