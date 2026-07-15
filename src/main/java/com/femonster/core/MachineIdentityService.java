package com.femonster.core;

import java.io.IOException;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

public final class MachineIdentityService {
    private static final String COMPUTER_ID_PATTERN = "[A-Za-z0-9_-]{16,128}";
    private final ProjectPaths paths;
    private final Path cacheFile;
    private final Path installIdFile;
    private final CommunityModuleBridge communityModule;
    private String cachedId = "";
    private String cachedIdSource = "";

    public MachineIdentityService(ProjectPaths paths) {
        this(paths, null);
    }

    public MachineIdentityService(ProjectPaths paths, CommunityModuleBridge communityModule) {
        this.paths = paths;
        this.communityModule = communityModule;
        this.cacheFile = paths.dataDir.resolve("machine-id.txt");
        this.installIdFile = paths.dataDir.resolve("client-install-id.txt");
    }

    public synchronized String computerId() {
        if (!cachedId.isBlank()) return cachedId;
        if (communityModule != null) {
            cachedId = communityModule.deviceFingerprint(rawIdentitySignals());
            if (!cachedId.isBlank()) {
                cachedIdSource = "official";
                writeCachedId(cachedId);
                return cachedId;
            }
        }

        cachedId = readCachedId();
        if (!cachedId.isBlank()) {
            cachedIdSource = "cached";
            return cachedId;
        }

        cachedId = windowsComputerId();
        if (!cachedId.isBlank()) {
            cachedIdSource = "windows-machine-guid";
            writeCachedId(cachedId);
            return cachedId;
        }

        cachedId = installId();
        cachedIdSource = "install";
        return cachedId;
    }

    public synchronized String computerIdSource() {
        if (cachedId.isBlank()) computerId();
        return cachedIdSource;
    }

    public Map<String, Object> payload() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("computerId", computerId());
        body.put("computerIdSource", computerIdSource());
        body.put("computerName", computerName());
        body.put("installRoot", paths.root.toString());
        body.put("appVersion", appVersion());
        return body;
    }

    public String computerName() {
        String env = System.getenv("COMPUTERNAME");
        if (env != null && !env.isBlank()) return env;
        try {
            return InetAddress.getLocalHost().getHostName();
        } catch (Exception ignored) {
            return "unknown";
        }
    }

    public String installRoot() {
        return paths.root.toString();
    }

    public String appVersion() {
        return "1.0.6-java26";
    }

    private String readCachedId() {
        try {
            if (!Files.isRegularFile(cacheFile)) return "";
            String value = Files.readString(cacheFile, StandardCharsets.UTF_8).trim();
            return isValidComputerId(value) ? value : "";
        } catch (IOException ignored) {
            return "";
        }
    }

    private void writeCachedId(String value) {
        try {
            Files.createDirectories(paths.dataDir);
            Files.writeString(cacheFile, value, StandardCharsets.UTF_8);
        } catch (IOException ignored) {
        }
    }

    private String installId() {
        String existing = readInstallId();
        if (!existing.isBlank()) return existing;
        String value = "install-" + UUID.randomUUID().toString().replace("-", "");
        try {
            Files.createDirectories(paths.dataDir);
            Files.writeString(installIdFile, value, StandardCharsets.UTF_8);
        } catch (IOException ignored) {
        }
        return value;
    }

    private String readInstallId() {
        try {
            if (!Files.isRegularFile(installIdFile)) return "";
            String value = Files.readString(installIdFile, StandardCharsets.UTF_8).trim();
            return value.matches("install-[a-f0-9]{32}") ? value : "";
        } catch (IOException ignored) {
            return "";
        }
    }

    private Map<String, String> rawIdentitySignals() {
        Map<String, String> signals = new LinkedHashMap<>();
        signals.put("windowsMachineGuid", windowsMachineGuid());
        signals.put("computerName", computerName());
        signals.put("userName", System.getProperty("user.name", ""));
        signals.put("osName", System.getProperty("os.name", ""));
        signals.put("osVersion", System.getProperty("os.version", ""));
        signals.put("osArch", System.getProperty("os.arch", ""));
        signals.put("installRoot", paths.root.toAbsolutePath().normalize().toString());
        signals.put("appVersion", appVersion());
        return signals;
    }

    private String windowsMachineGuid() {
        Process process = null;
        try {
            process = new ProcessBuilder(
                "reg",
                "query",
                "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
                "/v",
                "MachineGuid"
            ).redirectErrorStream(true).start();
            if (!process.waitFor(1200, TimeUnit.MILLISECONDS)) {
                process.destroyForcibly();
                return "";
            }
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            for (String line : output.split("\\R")) {
                String trimmed = line.trim();
                if (trimmed.toLowerCase().startsWith("machineguid")) {
                    String[] parts = trimmed.split("\\s+");
                    return parts.length == 0 ? "" : parts[parts.length - 1].trim();
                }
            }
        } catch (IOException | InterruptedException ignored) {
            if (ignored instanceof InterruptedException) Thread.currentThread().interrupt();
        } finally {
            if (process != null) process.destroy();
        }
        return "";
    }

    private String windowsComputerId() {
        String guid = windowsMachineGuid().trim().toLowerCase(Locale.ROOT);
        if (!guid.matches("[a-f0-9-]{16,64}")) return "";
        String hash = sha256Hex(guid);
        return hash.isBlank() ? "" : "win-" + hash.substring(0, 32);
    }

    private static boolean isValidComputerId(String value) {
        return value != null && value.matches(COMPUTER_ID_PATTERN);
    }

    private static String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder text = new StringBuilder(digest.length * 2);
            for (byte item : digest) {
                text.append(String.format("%02x", item));
            }
            return text.toString();
        } catch (Exception ignored) {
            return "";
        }
    }
}
