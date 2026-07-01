package com.femonster.desktop;

import com.femonster.core.ProjectPaths;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

public final class LocalClientLauncher {
    private LocalClientLauncher() {
    }

    public static boolean open(String url, ProjectPaths paths) {
        Path profileDir = paths.dataDir.resolve("local-client-profile").toAbsolutePath().normalize();
        try {
            Files.createDirectories(profileDir);
        } catch (IOException ignored) {
        }

        Path fallbackProfile = paths.dataDir.resolve("local-client-profile-runtime-" + System.currentTimeMillis())
            .toAbsolutePath()
            .normalize();
        for (String browser : browserCandidates()) {
            if (launch(browser, url, profileDir)) return true;
            if (launch(browser, url, fallbackProfile)) return true;
        }
        return false;
    }

    private static boolean launch(String browser, String url, Path profileDir) {
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
        command.add("--no-first-run");
        command.add("--disable-extensions");
        command.add("--window-size=1280,820");
        try {
            Process process = new ProcessBuilder(command).start();
            if (process.waitFor(650, TimeUnit.MILLISECONDS) && process.exitValue() != 0) {
                return false;
            }
            System.out.println("Local client: " + executable);
            return true;
        } catch (IOException ignored) {
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
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
}
