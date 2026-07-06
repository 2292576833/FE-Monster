package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.io.IOException;
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
        String downloadUrl = SimpleJson.asString(release.get("downloadUrl"), "");
        String version = SimpleJson.asString(release.get("version"), "");
        if (downloadUrl.isBlank() || !downloadUrl.matches("(?i)^https?://.+")) {
            return error("update download url is missing");
        }
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
