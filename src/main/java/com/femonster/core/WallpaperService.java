package com.femonster.core;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public final class WallpaperService {
    private static final Set<String> IMAGE_EXTENSIONS = Set.of(".jpg", ".jpeg", ".png", ".webp", ".gif");
    private static final Set<String> VIDEO_EXTENSIONS = Set.of(".mp4", ".webm", ".mov");
    private static final Pattern TITLE_PATTERN = Pattern.compile("\"title\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern STEAM_LIBRARY_PATTERN = Pattern.compile("\"(?:path|\\d+)\"\\s+\"([^\"]+)\"");
    private static final Pattern WINDOWS_EXE_PATTERN = Pattern.compile("[A-Za-z]:\\\\[^\"<>|]+?\\.exe", Pattern.CASE_INSENSITIVE);

    private final Path importedDir;

    public WallpaperService(Path dataDir) {
        this.importedDir = dataDir.resolve("wallpapers").toAbsolutePath().normalize();
    }

    public Map<String, Object> payload(boolean scanWallpaperEngine) throws IOException {
        Files.createDirectories(importedDir);
        List<Map<String, Object>> wallpapers = new ArrayList<>();
        collectImported(wallpapers);
        if (scanWallpaperEngine) collectWallpaperEngine(wallpapers);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("wallpapers", wallpapers);
        return body;
    }

    public Map<String, Object> importFile(String originalName, InputStream input) throws IOException {
        Files.createDirectories(importedDir);
        String filename = uniqueFileName(safeFileName(originalName));
        Path target = importedDir.resolve(filename).normalize();
        if (!target.startsWith(importedDir) || !isSupported(target)) {
            throw new IOException("unsupported wallpaper file");
        }

        try {
            copyWallpaper(input, target);
        } catch (IOException e) {
            Files.deleteIfExists(target);
            throw e;
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("wallpaper", item(target, stripExtension(filename), "imported"));
        return body;
    }

    public Path resolveServableFile(String rawPath) throws IOException {
        if (rawPath == null || rawPath.isBlank()) throw new IOException("wallpaper path missing");
        Path file = Path.of(rawPath).toAbsolutePath().normalize();
        if (!Files.isRegularFile(file) || !isSupported(file)) throw new IOException("wallpaper not found");
        if (file.startsWith(importedDir)) return file;
        for (Path root : wallpaperEngineRoots()) {
            if (file.startsWith(root)) return file;
        }
        throw new IOException("wallpaper path is not allowed");
    }

    public static String contentType(Path path) {
        String ext = extension(path);
        return switch (ext) {
            case ".jpg", ".jpeg" -> "image/jpeg";
            case ".png" -> "image/png";
            case ".webp" -> "image/webp";
            case ".gif" -> "image/gif";
            case ".mp4" -> "video/mp4";
            case ".webm" -> "video/webm";
            case ".mov" -> "video/quicktime";
            default -> "application/octet-stream";
        };
    }

    private void collectImported(List<Map<String, Object>> wallpapers) throws IOException {
        if (!Files.exists(importedDir)) return;
        try (Stream<Path> stream = Files.list(importedDir)) {
            stream
                .filter(Files::isRegularFile)
                .filter(WallpaperService::isSupported)
                .sorted(Comparator.comparing(this::lastModified).reversed())
                .limit(160)
                .forEach(path -> wallpapers.add(item(path, stripExtension(path.getFileName().toString()), "imported")));
        }
    }

    private void collectWallpaperEngine(List<Map<String, Object>> wallpapers) throws IOException {
        int count = wallpapers.size();
        for (Path root : wallpaperEngineRoots()) {
            if (!Files.isDirectory(root)) continue;
            try (Stream<Path> projects = Files.list(root)) {
                for (Path project : projects.filter(Files::isDirectory).toList()) {
                    Path media = firstMediaFile(project);
                    if (media == null) continue;
                    wallpapers.add(item(media, projectTitle(project), "wallpaper-engine"));
                    count++;
                    if (count >= 260) return;
                }
            }
        }
    }

    private Path firstMediaFile(Path project) throws IOException {
        try (Stream<Path> stream = Files.walk(project, 4)) {
            return stream
                .filter(Files::isRegularFile)
                .filter(WallpaperService::isSupported)
                .min(Comparator.comparingInt(WallpaperService::mediaRank).thenComparing(Path::toString))
                .orElse(null);
        }
    }

    private String projectTitle(Path project) {
        Path meta = project.resolve("project.json");
        if (Files.isRegularFile(meta)) {
            try {
                String text = Files.readString(meta, StandardCharsets.UTF_8);
                Matcher matcher = TITLE_PATTERN.matcher(text);
                if (matcher.find()) return matcher.group(1);
            } catch (IOException ignored) {
            }
        }
        return project.getFileName().toString();
    }

    private List<Path> wallpaperEngineRoots() {
        List<Path> roots = new ArrayList<>();
        addWallpaperRoot(roots, System.getenv("FE_WALLPAPER_ENGINE_ROOT"));
        addRunningWallpaperEngineRoots(roots);
        addDriveSteamRoots(roots);
        addSteamRoots(roots, System.getenv("ProgramFiles(x86)") + "\\Steam");
        addSteamRoots(roots, System.getenv("ProgramFiles") + "\\Steam");
        addSteamRoots(roots, "C:\\Program Files (x86)\\Steam");
        addSteamRoots(roots, "C:\\Program Files\\Steam");
        return roots.stream().distinct().toList();
    }

    private static void addSteamRoots(List<Path> roots, String rawSteamRoot) {
        if (rawSteamRoot == null || rawSteamRoot.isBlank() || rawSteamRoot.startsWith("null")) return;
        Path steamRoot = Path.of(rawSteamRoot).toAbsolutePath().normalize();
        addWallpaperRoot(roots, steamRoot.resolve("steamapps\\workshop\\content\\431960").toString());
        Path libraryFile = steamRoot.resolve("steamapps\\libraryfolders.vdf");
        if (!Files.isRegularFile(libraryFile)) return;
        try {
            String text = Files.readString(libraryFile, StandardCharsets.UTF_8);
            Matcher matcher = STEAM_LIBRARY_PATTERN.matcher(text);
            while (matcher.find()) {
                String library = matcher.group(1).replace("\\\\", "\\");
                addWallpaperRoot(roots, Path.of(library).resolve("steamapps\\workshop\\content\\431960").toString());
            }
        } catch (IOException ignored) {
        }
    }

    private static void addWallpaperRoot(List<Path> roots, String raw) {
        if (raw == null || raw.isBlank() || raw.startsWith("null")) return;
        Path root = Path.of(raw).toAbsolutePath().normalize();
        if (Files.isDirectory(root)) roots.add(root);
    }

    private static void addRunningWallpaperEngineRoots(List<Path> roots) {
        ProcessHandle.allProcesses().forEach(process -> {
            ProcessHandle.Info info = process.info();
            info.command().ifPresent(command -> addWallpaperRootsFromProcessText(roots, command));
            info.commandLine().ifPresent(commandLine -> addWallpaperRootsFromProcessText(roots, commandLine));
        });
    }

    private static void addWallpaperRootsFromProcessText(List<Path> roots, String text) {
        if (text == null) return;
        String normalized = text.toLowerCase(Locale.ROOT);
        if (!normalized.contains("wallpaper_engine") && !normalized.contains("wallpaper32")
            && !normalized.contains("wallpaper64") && !normalized.contains("webwallpaper")) return;

        Matcher matcher = WINDOWS_EXE_PATTERN.matcher(text);
        boolean matched = false;
        while (matcher.find()) {
            matched = true;
            addSteamLibraryFromWallpaperEnginePath(roots, matcher.group());
        }
        if (!matched) addSteamLibraryFromWallpaperEnginePath(roots, text);
    }

    private static void addSteamLibraryFromWallpaperEnginePath(List<Path> roots, String rawPath) {
        try {
            Path path = Path.of(rawPath.replace("\"", "")).toAbsolutePath().normalize();
            String lower = path.toString().toLowerCase(Locale.ROOT);
            String marker = "\\steamapps\\common\\wallpaper_engine";
            int index = lower.indexOf(marker);
            if (index < 0) return;
            Path library = Path.of(path.toString().substring(0, index)).toAbsolutePath().normalize();
            addWallpaperRoot(roots, library.resolve("steamapps\\workshop\\content\\431960").toString());
        } catch (RuntimeException ignored) {
        }
    }

    private static void addDriveSteamRoots(List<Path> roots) {
        for (Path root : FileSystems.getDefault().getRootDirectories()) {
            addSteamRoots(roots, root.resolve("Steam").toString());
            addSteamRoots(roots, root.resolve("SteamLibrary").toString());
            addWallpaperRoot(roots, root.resolve("SteamLibrary\\steamapps\\workshop\\content\\431960").toString());
        }
    }

    private static void copyWallpaper(InputStream input, Path target) throws IOException {
        byte[] buffer = new byte[1024 * 1024];
        try (OutputStream output = Files.newOutputStream(target)) {
            int read;
            while ((read = input.read(buffer)) >= 0) {
                output.write(buffer, 0, read);
            }
        }
    }

    private Map<String, Object> item(Path path, String title, String source) {
        Map<String, Object> map = new LinkedHashMap<>();
        String encoded = URLEncoder.encode(path.toAbsolutePath().normalize().toString(), StandardCharsets.UTF_8);
        map.put("id", source + ":" + path.toAbsolutePath().normalize());
        map.put("name", title == null || title.isBlank() ? path.getFileName().toString() : title);
        map.put("source", source);
        map.put("kind", isVideo(path) ? "video" : "image");
        map.put("url", "/api/wallpapers/file?path=" + encoded);
        return map;
    }

    private String uniqueFileName(String filename) {
        String base = stripExtension(filename);
        String ext = extension(filename);
        String candidate = base + ext;
        int index = 2;
        while (Files.exists(importedDir.resolve(candidate))) {
            candidate = base + "-" + index + ext;
            index++;
        }
        return candidate;
    }

    private static String safeFileName(String value) {
        String name = value == null || value.isBlank() ? "wallpaper" : Path.of(value).getFileName().toString();
        name = name.replaceAll("[<>:\"/\\\\|?*\\x00-\\x1F]", "_").trim();
        return name.isBlank() ? "wallpaper" : name;
    }

    private long lastModified(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (IOException ignored) {
            return 0;
        }
    }

    private static int mediaRank(Path path) {
        String ext = extension(path);
        if (VIDEO_EXTENSIONS.contains(ext)) return 0;
        if (".gif".equals(ext)) return 1;
        return 2;
    }

    private static boolean isSupported(Path path) {
        String ext = extension(path);
        return IMAGE_EXTENSIONS.contains(ext) || VIDEO_EXTENSIONS.contains(ext);
    }

    private static boolean isVideo(Path path) {
        return VIDEO_EXTENSIONS.contains(extension(path));
    }

    private static String stripExtension(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    private static String extension(Path path) {
        return extension(path.getFileName().toString());
    }

    private static String extension(String name) {
        int dot = name.lastIndexOf('.');
        return dot >= 0 ? name.substring(dot).toLowerCase(Locale.ROOT) : "";
    }
}
