package com.femonster.core;

import java.util.Map;
import java.nio.file.Files;
import java.nio.file.Path;
import java.io.InputStream;
import java.io.OutputStream;

public final class MacUpdateServiceProbe {
    public static void main(String[] args) throws Exception {
        String prefix = "https://github.com/2292576833/FE-Monster/releases/download/v2.2.4/";
        check(UpdateService.macArchitecture("aarch64").equals("arm64"), "Apple Silicon JVM");
        check(UpdateService.macArchitecture("amd64").equals("x86_64"), "Intel/Rosetta JVM");
        check(UpdateService.macArchitecture("x86").isEmpty(), "unsupported CPU");
        check(UpdateService.isOfficialMacReleaseAsset(prefix + "FE-Monster-2.2.4-arm64.dmg", "2.2.4", "arm64"), "official arm64 DMG");
        check(UpdateService.isOfficialMacReleaseAsset(prefix + "FE-Monster-2.2.4-x86_64.dmg", "2.2.4", "x86_64"), "official Intel DMG");
        check(!UpdateService.isOfficialMacReleaseAsset(prefix + "FE-Monster-2.2.4-arm64.dmg", "2.2.4", "x86_64"), "wrong CPU");
        check(!UpdateService.isOfficialMacReleaseAsset(prefix + "FE-Monster-2.2.4-arm64.dmg", "2.2.5", "arm64"), "wrong version");
        for (String url : new String[] {
            prefix + "FE-Monster-Setup-2.2.4.exe", prefix + "FE-Monster-2.2.4-arm64.dmg?redirect=evil",
            prefix + "FE-Monster-2.2.4-arm64.dmg#fragment", prefix + "FE-Monster-%32.2.4-arm64.dmg",
            prefix.replace("https:", "http:") + "FE-Monster-2.2.4-arm64.dmg",
            prefix.replace("github.com/", "github.com.evil.invalid/") + "FE-Monster-2.2.4-arm64.dmg",
            prefix.replace("github.com/", "user@github.com/") + "FE-Monster-2.2.4-arm64.dmg",
            prefix.replace("github.com/", "github.com:443/") + "FE-Monster-2.2.4-arm64.dmg",
            prefix.replace("2292576833", "another-owner") + "FE-Monster-2.2.4-arm64.dmg",
            prefix.replace("v2.2.4/", "../") + "FE-Monster-2.2.4-arm64.dmg"
        }) check(!UpdateService.isOfficialMacReleaseAsset(url, "2.2.4", "arm64"), "unsafe or non-Mac asset");
        check(!UpdateService.isOfficialMacReleaseAsset(prefix + "FE-Monster-2.2.4-arm64.dmg", "../2.2.4", "arm64"), "version traversal");
        System.setProperty("os.name", "Mac OS X");
        System.setProperty("os.arch", "aarch64");
        UpdateService service = new UpdateService(ProjectPaths.detect());
        Map<String, Object> rejected = service.startInstall(Map.of("downloadUrl", prefix + "FE-Monster-2.2.4-arm64.dmg", "version", "2.2.4", "sha256", "a".repeat(64)));
        check(Boolean.FALSE.equals(rejected.get("ok")), "a source checkout must never install an update");
        Map<String, Object> noDigest = service.startInstall(Map.of("downloadUrl", prefix + "FE-Monster-2.2.4-arm64.dmg", "version", "2.2.4"));
        check(Boolean.FALSE.equals(noDigest.get("ok")) && String.valueOf(noDigest.get("error")).contains("sha256 is required"), "required digest");
        String id = "b".repeat(32);
        Path progressDirectory = ProjectPaths.detect().dataDir.resolve("update-progress");
        Files.createDirectories(progressDirectory);
        Path progressFile = progressDirectory.resolve(id + ".json");
        var processField = UpdateService.class.getDeclaredField("activeInstaller");
        processField.setAccessible(true);
        processField.set(service, new Process() {
            public OutputStream getOutputStream() { return OutputStream.nullOutputStream(); }
            public InputStream getInputStream() { return InputStream.nullInputStream(); }
            public InputStream getErrorStream() { return InputStream.nullInputStream(); }
            public int waitFor() { return 1; }
            public int exitValue() { return 1; }
            public void destroy() { }
            public boolean isAlive() { return false; }
        });
        var idField = UpdateService.class.getDeclaredField("macProgressId");
        idField.setAccessible(true); idField.set(service, id);
        Files.writeString(progressFile, "{\"status\":\"queued\",\"percent\":0}");
        check("failed".equals(service.progress(id).get("status")), "dead helper must not leave update queued indefinitely");
        Files.writeString(progressFile, "{\"status\":\"completed\",\"percent\":100}");
        check("completed".equals(service.progress(id).get("status")), "completed helper progress is retained");
        System.out.println("PASS macOS update asset, architecture, SHA-256 and installed-app guards");
    }
    private static void check(boolean value, String description) {
        if (!value) throw new AssertionError(description);
    }
}
