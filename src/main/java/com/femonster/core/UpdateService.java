package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.Locale;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

public final class UpdateService {
    private final ProjectPaths paths;
    private final Path progressDir;
    private volatile Process activeInstaller;
    private volatile String macProgressId = "";

    public UpdateService(ProjectPaths paths) {
        this.paths = paths;
        this.progressDir = paths.dataDir.resolve("update-progress");
    }

    public synchronized Map<String, Object> startInstall(Map<String, Object> release) {
        String osName = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        boolean mac = osName.startsWith("mac") || osName.startsWith("darwin");
        if (!mac && !osName.startsWith("windows")) return error("automatic updates are unavailable on this operating system");
        if (activeInstaller != null && activeInstaller.isAlive()) return error("an update is already in progress");
        String downloadUrl = SimpleJson.asString(release.get("downloadUrl"), "");
        String version = SimpleJson.asString(release.get("version"), "");
        String sha256 = SimpleJson.asString(release.get("sha256"), "").trim().toLowerCase();
        if (sha256.startsWith("sha256:")) sha256 = sha256.substring("sha256:".length());
        if (!isOfficialGitHubReleaseAsset(downloadUrl)) {
            return error("update download url is not an official FE Monster GitHub release asset");
        }
        if (sha256.isBlank()) return error("update sha256 is required");
        if (!sha256.matches("[0-9a-f]{64}")) return error("update sha256 is invalid");
        if (mac) return startMacInstall(downloadUrl, version, sha256);
        if (!isOfficialWindowsReleaseAsset(downloadUrl)) return error("Windows updates require a Windows installer");
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
            activeInstaller = builder.start();
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

    private Map<String, Object> startMacInstall(String downloadUrl, String version, String sha256) {
        String architecture = macArchitecture(System.getProperty("os.arch", ""));
        if (architecture.isEmpty()) return error("unsupported macOS update architecture");
        if (!isOfficialMacReleaseAsset(downloadUrl, version, architecture)) {
            return error("macOS updates require an official DMG for this version and processor architecture");
        }
        Path progressFile = null;
        try {
            String bundleValue = System.getenv("FE_MONSTER_BUNDLE_PATH");
            if (bundleValue == null || bundleValue.isBlank()) return error("automatic updates require the installed macOS app");
            Path supplied = Path.of(bundleValue).normalize();
            if (!supplied.isAbsolute() || Files.isSymbolicLink(supplied) || !supplied.toString().endsWith(".app")) {
                return error("invalid installed macOS app path");
            }
            Path bundle = supplied.toRealPath();
            Path root = paths.root.toRealPath();
            if (!root.equals(bundle.resolve("Contents/Resources/App").toRealPath())) {
                return error("updates can only replace the app that owns this backend");
            }
            Path data = paths.dataDir.toRealPath();
            if (data.startsWith(bundle)) return error("macOS update data must be outside the app bundle");
            if (bundle.startsWith(Path.of("/Volumes")) || bundle.toString().contains("/AppTranslocation/")) {
                return error("copy FE Monster out of the disk image before updating");
            }
            if (!Files.isWritable(bundle.getParent())) return error("the installed app directory is not writable");
            String bundleId = readMacPlist(bundle.resolve("Contents/Info.plist"), "CFBundleIdentifier");
            if (!"com.femonster.desktop".equals(bundleId)) return error("installed app bundle identifier does not match FE Monster");
            String executable = readMacPlist(bundle.resolve("Contents/Info.plist"), "CFBundleExecutable");
            if (executable.isBlank() || executable.contains("/") || executable.equals(".") || executable.equals("..")) {
                return error("invalid macOS app executable");
            }
            Path mainExecutable = bundle.resolve("Contents/MacOS").resolve(executable).toRealPath();
            if (!mainExecutable.startsWith(bundle)) return error("macOS app executable is outside its bundle");
            long mainPid = Long.parseLong(System.getenv("FE_MONSTER_MAIN_PID"));
            ProcessHandle current = ProcessHandle.current();
            ProcessHandle owner = ProcessHandle.of(mainPid).orElseThrow(() -> new IOException("macOS app process is not running"));
            if (current.parent().map(ProcessHandle::pid).orElse(-1L) != mainPid
                || !Path.of(owner.info().command().orElse("")).toRealPath().equals(mainExecutable)) {
                return error("macOS update process ownership could not be verified");
            }
            Path javaExecutable = Path.of(current.info().command().orElseThrow(() -> new IOException("Java executable is unavailable"))).toRealPath();
            // Darwin ps escapes non-ASCII/control bytes in comm. Preserve its
            // rendering after independently validating the real executable paths.
            String mainCommand = readMacProcessCommand(mainPid);
            String javaCommand = readMacProcessCommand(current.pid());
            Path script = root.resolve("scripts/apply-client-update-macos.sh");
            if (!Files.isRegularFile(script) || Files.isSymbolicLink(script)) return error("macOS update helper is missing");
            String id = UUID.randomUUID().toString().replace("-", "");
            Path work = data.resolve("updates").resolve("mac-" + id);
            Files.createDirectories(work);
            if (!work.equals(work.toRealPath())) return error("macOS update work directory must be canonical");
            Files.setPosixFilePermissions(work, PosixFilePermissions.fromString("rwx------"));
            // The helper must continue after the original signed bundle is renamed.
            Path helper = work.resolve("apply-client-update-macos.sh");
            Files.copy(script, helper);
            Files.setPosixFilePermissions(helper, PosixFilePermissions.fromString("rwx------"));
            Path macProgressDir = data.resolve("update-progress");
            Files.createDirectories(macProgressDir);
            if (!macProgressDir.equals(macProgressDir.toRealPath())) return error("macOS update progress directory must be canonical");
            progressFile = macProgressDir.resolve(id + ".json");
            writeProgress(progressFile, "queued", 0, "macOS update queued");
            ProcessBuilder builder = new ProcessBuilder("/bin/bash", helper.toString(),
                "--bundle", bundle.toString(), "--data", data.toString(), "--work", work.toString(),
                "--update-id", id, "--download-url", downloadUrl, "--version", version,
                "--sha256", sha256, "--arch", architecture, "--progress-file", progressFile.toString(),
                "--main-pid", Long.toString(mainPid), "--java-pid", Long.toString(current.pid()),
                "--main-executable", mainExecutable.toString(), "--java-executable", javaExecutable.toString(),
                "--main-command", mainCommand, "--java-command", javaCommand);
            builder.directory(work.toFile());
            builder.redirectOutput(work.resolve("helper.log").toFile());
            builder.redirectErrorStream(true);
            activeInstaller = builder.start();
            macProgressId = id;
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("ok", true); body.put("progressId", id); body.put("version", version);
            return body;
        } catch (Exception failure) {
            if (progressFile != null) writeProgressQuietly(progressFile, "failed", 0, failure.getMessage());
            return error(failure.getMessage());
        }
    }

    private static String readMacPlist(Path file, String key) throws IOException, InterruptedException {
        Process reader = new ProcessBuilder("/usr/libexec/PlistBuddy", "-c", "Print :" + key, file.toString()).start();
        if (!reader.waitFor(10, TimeUnit.SECONDS)) { reader.destroyForcibly(); throw new IOException("macOS app metadata read timed out"); }
        if (reader.exitValue() != 0) throw new IOException("macOS app metadata is invalid");
        return new String(reader.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
    }

    private static String readMacProcessCommand(long pid) throws IOException, InterruptedException {
        Process reader = new ProcessBuilder("/bin/ps", "-ww", "-p", Long.toString(pid), "-o", "comm=").start();
        if (!reader.waitFor(10, TimeUnit.SECONDS)) { reader.destroyForcibly(); throw new IOException("macOS process lookup timed out"); }
        String command = new String(reader.getInputStream().readAllBytes(), StandardCharsets.UTF_8).strip();
        if (reader.exitValue() != 0 || command.isEmpty() || command.contains("\n")) throw new IOException("macOS process lookup failed");
        return command;
    }

    static String macArchitecture(String architecture) {
        return switch (architecture.toLowerCase(Locale.ROOT)) {
            case "aarch64", "arm64" -> "arm64";
            case "amd64", "x86_64" -> "x86_64";
            default -> "";
        };
    }

    static boolean isOfficialMacReleaseAsset(String url, String version, String architecture) {
        if (version == null || !version.matches("[0-9][A-Za-z0-9._-]{0,63}")
            || !(architecture.equals("arm64") || architecture.equals("x86_64"))) return false;
        URI uri = officialAssetUri(url);
        if (uri == null) return false;
        return uri.getRawPath().matches("^/2292576833/FE-Monster/releases/download/(?!\\.{1,2}/)[A-Za-z0-9._-]+/"
            + Pattern.quote("FE-Monster-" + version + "-" + architecture + ".dmg") + "$");
    }

    public Map<String, Object> progress(String id) {
        String safeId = id == null ? "" : id.replaceAll("[^A-Za-z0-9_-]", "");
        if (safeId.isBlank()) return error("progress id is required");
        Path progressFile = progressDir.resolve(safeId + ".json").toAbsolutePath().normalize();
        if (!progressFile.startsWith(progressDir.toAbsolutePath().normalize())) return error("invalid progress id");
        try {
            if (!Files.isRegularFile(progressFile)) return error("progress was not found");
            Map<String, Object> body = SimpleJson.parseObject(Files.readString(progressFile, StandardCharsets.UTF_8));
            if (safeId.equals(macProgressId) && activeInstaller != null && !activeInstaller.isAlive()
                && !java.util.Set.of("completed", "ready", "failed").contains(SimpleJson.asString(body.get("status"), ""))) {
                writeProgress(progressFile, "failed", 0, "macOS update helper exited before completing the update; see the update helper log");
                body = SimpleJson.parseObject(Files.readString(progressFile, StandardCharsets.UTF_8));
            }
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
        URI uri = officialAssetUri(downloadUrl);
        return uri != null && uri.getPath().matches("(?i)^/2292576833/FE-Monster/releases/download/[^/]+/FE[-_. ]?Monster[^/]*\\.(?:exe|dmg)$");
    }

    private static boolean isOfficialWindowsReleaseAsset(String downloadUrl) {
        URI uri = officialAssetUri(downloadUrl);
        return uri != null && uri.getPath().matches("(?i)^/2292576833/FE-Monster/releases/download/[^/]+/FE[-_. ]?Monster[^/]*\\.exe$");
    }

    private static URI officialAssetUri(String downloadUrl) {
        if (downloadUrl == null || downloadUrl.isBlank()) return null;
        try {
            URI uri = URI.create(downloadUrl);
            boolean official = "https".equalsIgnoreCase(uri.getScheme())
                && "github.com".equalsIgnoreCase(uri.getHost())
                && uri.getRawUserInfo() == null && uri.getPort() == -1
                && uri.getRawQuery() == null && uri.getRawFragment() == null
                && uri.getRawPath() != null;
            return official ? uri : null;
        } catch (IllegalArgumentException error) {
            return null;
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
