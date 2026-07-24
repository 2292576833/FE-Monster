package com.femonster.core;

import com.femonster.json.SimpleJson;

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
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public final class WallpaperService {
    private static final Set<String> IMAGE_EXTENSIONS = Set.of(
        ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg", ".ico"
    );
    private static final Set<String> VIDEO_EXTENSIONS = Set.of(".mp4", ".webm", ".mov");
    private static final Set<String> WEB_ENTRY_EXTENSIONS = Set.of(".html", ".htm");
    private static final Set<String> SCENE_MANIFEST_ENTRY_EXTENSIONS = Set.of(".json", ".pkg");
    private static final Set<String> SCENE_PACKAGE_EXTENSIONS = Set.of(".pkg", ".json");
    private static final List<String> DEFAULT_PREVIEW_FILES = List.of(
        "preview.jpg", "preview.jpeg", "preview.png", "preview.webp", "preview.gif", "preview.avif"
    );
    private static final Pattern STEAM_LIBRARY_PATTERN = Pattern.compile("\"(?:path|\\d+)\"\\s+\"([^\"]+)\"");
    private static final Pattern WINDOWS_EXE_PATTERN = Pattern.compile(
        "[A-Za-z]:\\\\[^\"<>|]+?\\.exe",
        Pattern.CASE_INSENSITIVE
    );

    private final Path importedDir;
    private final Object cacheLock = new Object();
    private volatile List<Path> cachedWallpaperEngineRoots = List.of();
    private volatile Map<String, WallpaperProject> cachedWallpaperEngineProjects = Map.of();
    private volatile List<Map<String, Object>> cachedWallpaperEngineCatalog = List.of();
    private long rootScanCount;
    private long catalogScanCount;

    public WallpaperService(Path dataDir) {
        this.importedDir = dataDir.resolve("wallpapers").toAbsolutePath().normalize();
    }

    public Map<String, Object> payload(boolean scanWallpaperEngine) throws IOException {
        Files.createDirectories(importedDir);
        List<Map<String, Object>> wallpapers = new ArrayList<>();
        collectImported(wallpapers);
        if (scanWallpaperEngine) {
            synchronized (cacheLock) {
                refreshWallpaperEngineCache();
                wallpapers.addAll(cachedWallpaperEngineCatalog);
            }
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("wallpapers", wallpapers);
        return body;
    }

    public Map<String, Object> importFile(String originalName, InputStream input) throws IOException {
        Files.createDirectories(importedDir);
        String filename = uniqueFileName(safeFileName(originalName));
        Path target = importedDir.resolve(filename).normalize();
        if (!target.startsWith(importedDir) || !isSupportedMedia(target)) {
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
        body.put("wallpaper", importedItem(target, stripExtension(filename)));
        return body;
    }

    public Path resolveServableFile(String rawPath) throws IOException {
        Path file = realRegularFile(rawPath);
        if (file == null || !isSupportedMedia(file)) throw new IOException("wallpaper not found");

        Path importedRoot = realDirectory(importedDir);
        if (importedRoot != null && file.startsWith(importedRoot)) return file;

        for (WallpaperProject project : cachedWallpaperEngineProjects.values()) {
            if (file.equals(project.entry()) && "video".equals(project.type())) return file;
            if (project.preview() != null && file.equals(project.preview())) return file;
        }
        throw new IOException("wallpaper path is not allowed");
    }

    public Path resolveWebFile(String projectKey, String relativePath) throws IOException {
        WallpaperProject project = cachedWallpaperEngineProjects.get(projectKey);
        if (project == null || !"web".equals(project.type())) throw new IOException("web wallpaper project not found");
        String requested = relativePath == null || relativePath.isBlank()
            ? project.root().relativize(project.entry()).toString()
            : relativePath;
        Path candidate;
        try {
            candidate = project.root().resolve(requested.replace('/', java.io.File.separatorChar)).normalize();
        } catch (RuntimeException e) {
            throw new IOException("invalid web wallpaper path", e);
        }
        if (!candidate.startsWith(project.root())) throw new IOException("web wallpaper path is not allowed");
        Path file = realRegularFile(candidate);
        if (file == null || !file.startsWith(project.root())) {
            throw new IOException("web wallpaper resource not found");
        }
        return file;
    }

    public Map<String, Object> activate(String rawId) throws IOException {
        String id = rawId == null ? "" : rawId.trim();
        String prefix = "wallpaper-engine:";
        if (!id.startsWith(prefix)) throw new IOException("wallpaper project not found");
        WallpaperProject project = cachedWallpaperEngineProjects.get(id.substring(prefix.length()));
        if (project == null || !"scene".equals(project.type())) {
            throw new IOException("Wallpaper Engine scene project not found");
        }

        Path executable = findWallpaperEngineExecutable();
        if (executable == null) {
            throw new IOException("Wallpaper Engine is not installed or running");
        }

        ProcessBuilder builder = new ProcessBuilder(
            executable.toString(),
            "-control",
            "openWallpaper",
            "-file",
            project.projectJson().toString()
        );
        builder.directory(executable.getParent().toFile());
        builder.redirectOutput(ProcessBuilder.Redirect.DISCARD);
        builder.redirectError(ProcessBuilder.Redirect.DISCARD);
        builder.start();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("id", id);
        body.put("kind", project.type());
        body.put("message", "场景壁纸已通过 Wallpaper Engine 应用到桌面");
        return body;
    }

    public Map<String, Object> cacheDiagnostics() {
        synchronized (cacheLock) {
            Map<String, Object> diagnostics = new LinkedHashMap<>();
            diagnostics.put("rootScanCount", rootScanCount);
            diagnostics.put("catalogScanCount", catalogScanCount);
            diagnostics.put("rootCount", cachedWallpaperEngineRoots.size());
            diagnostics.put("projectCount", cachedWallpaperEngineProjects.size());
            return diagnostics;
        }
    }

    private Path findWallpaperEngineExecutable() {
        Path configured = existingWallpaperEngineExecutable(System.getenv("FE_WALLPAPER_ENGINE_EXE"));
        if (configured != null) return configured;

        for (ProcessHandle process : ProcessHandle.allProcesses().toList()) {
            Path running = existingWallpaperEngineExecutable(process.info().command().orElse(""));
            if (running != null) return running;
        }

        for (Path root : cachedWallpaperEngineRoots) {
            Path steamApps = root;
            while (steamApps != null && (
                steamApps.getFileName() == null
                    || !"steamapps".equalsIgnoreCase(steamApps.getFileName().toString())
            )) {
                steamApps = steamApps.getParent();
            }
            if (steamApps == null) continue;
            Path install = steamApps.resolve("common").resolve("wallpaper_engine");
            Path executable = existingWallpaperEngineExecutable(install.resolve("wallpaper64.exe").toString());
            if (executable != null) return executable;
            executable = existingWallpaperEngineExecutable(install.resolve("wallpaper32.exe").toString());
            if (executable != null) return executable;
        }
        return null;
    }

    private static Path existingWallpaperEngineExecutable(String rawPath) {
        if (rawPath == null || rawPath.isBlank()) return null;
        try {
            Path path = Path.of(rawPath).toAbsolutePath().normalize();
            if (!Files.isRegularFile(path)) return null;
            String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
            if (!name.equals("wallpaper32.exe") && !name.equals("wallpaper64.exe")) return null;
            return path.toRealPath();
        } catch (IOException | RuntimeException ignored) {
            return null;
        }
    }

    public static String contentType(Path path) {
        String ext = extension(path);
        return switch (ext) {
            case ".html", ".htm" -> "text/html; charset=utf-8";
            case ".css" -> "text/css; charset=utf-8";
            case ".js", ".mjs" -> "text/javascript; charset=utf-8";
            case ".json", ".gltf" -> "application/json; charset=utf-8";
            case ".xml" -> "application/xml; charset=utf-8";
            case ".txt" -> "text/plain; charset=utf-8";
            case ".jpg", ".jpeg" -> "image/jpeg";
            case ".png" -> "image/png";
            case ".webp" -> "image/webp";
            case ".gif" -> "image/gif";
            case ".avif" -> "image/avif";
            case ".svg" -> "image/svg+xml";
            case ".ico" -> "image/x-icon";
            case ".mp4" -> "video/mp4";
            case ".webm" -> "video/webm";
            case ".mov" -> "video/quicktime";
            case ".mp3" -> "audio/mpeg";
            case ".wav" -> "audio/wav";
            case ".ogg", ".oga" -> "audio/ogg";
            case ".woff" -> "font/woff";
            case ".woff2" -> "font/woff2";
            case ".ttf" -> "font/ttf";
            case ".otf" -> "font/otf";
            case ".wasm" -> "application/wasm";
            case ".glb" -> "model/gltf-binary";
            default -> {
                String detected = null;
                try {
                    detected = Files.probeContentType(path);
                } catch (IOException ignored) {
                }
                yield detected == null || detected.isBlank() ? "application/octet-stream" : detected;
            }
        };
    }

    private void collectImported(List<Map<String, Object>> wallpapers) throws IOException {
        if (!Files.exists(importedDir)) return;
        try (Stream<Path> stream = Files.list(importedDir)) {
            stream
                .filter(Files::isRegularFile)
                .filter(WallpaperService::isSupportedMedia)
                .sorted(Comparator.comparing(this::lastModified).reversed())
                .limit(160)
                .forEach(path -> wallpapers.add(importedItem(path, stripExtension(path.getFileName().toString()))));
        }
    }

    private void refreshWallpaperEngineCache() {
        rootScanCount++;
        List<Path> roots = discoverWallpaperEngineRoots();
        catalogScanCount++;

        Map<String, WallpaperProject> projects = new LinkedHashMap<>();
        List<Map<String, Object>> catalog = new ArrayList<>();
        for (Path root : roots) {
            if (!Files.isDirectory(root)) continue;
            try (Stream<Path> directories = Files.list(root)) {
                for (Path directory : directories.filter(Files::isDirectory).sorted().toList()) {
                    WallpaperProject project = readWallpaperEngineProject(directory);
                    if (project == null || projects.containsKey(project.key())) continue;
                    projects.put(project.key(), project);
                    catalog.add(projectItem(project));
                    if (catalog.size() >= 260) break;
                }
            } catch (IOException ignored) {
            }
            if (catalog.size() >= 260) break;
        }

        cachedWallpaperEngineRoots = List.copyOf(roots);
        cachedWallpaperEngineProjects = Map.copyOf(projects);
        cachedWallpaperEngineCatalog = List.copyOf(catalog);
    }

    private WallpaperProject readWallpaperEngineProject(Path directory) {
        try {
            Path root = directory.toRealPath();
            Path projectJson = root.resolve("project.json");
            if (!Files.isRegularFile(projectJson)) return null;
            projectJson = projectJson.toRealPath();
            if (!projectJson.startsWith(root)) return null;

            Map<String, Object> manifest = SimpleJson.parseObjectStrict(
                Files.readString(projectJson, StandardCharsets.UTF_8)
            );
            String type = SimpleJson.asString(manifest.get("type"), "").trim().toLowerCase(Locale.ROOT);
            if (!Set.of("video", "web", "scene").contains(type)) return null;
            String rawEntry = SimpleJson.asString(manifest.get("file"), "").trim();
            Path declaredEntry = resolveProjectPath(root, rawEntry);
            if (declaredEntry == null || !validManifestEntryType(type, declaredEntry)) return null;
            Path entry = resolveProjectFile(root, rawEntry);
            if ("scene".equals(type)) {
                Path packageFile = resolveProjectFile(root, "scene.pkg");
                if (packageFile != null) entry = packageFile;
            }
            if (entry == null || !validResolvedEntryType(type, entry)) return null;

            String rawPreview = SimpleJson.asString(manifest.get("preview"), "").trim();
            Path preview = rawPreview.isBlank() ? null : resolveProjectFile(root, rawPreview);
            if (preview != null && !isSupportedImage(preview)) preview = null;
            if (preview == null) preview = defaultPreview(root);

            String title = SimpleJson.asString(manifest.get("title"), "").trim();
            if (title.isBlank()) title = directory.getFileName().toString();
            String key = projectKey(root);
            return new WallpaperProject(key, root, projectJson, entry, preview, type, title, rawEntry);
        } catch (IOException | IllegalArgumentException ignored) {
            return null;
        }
    }

    private static Path resolveProjectFile(Path root, String rawPath) throws IOException {
        Path candidate = resolveProjectPath(root, rawPath);
        if (candidate == null || !Files.isRegularFile(candidate)) return null;
        Path real = candidate.toRealPath();
        return real.startsWith(root) ? real : null;
    }

    private static Path resolveProjectPath(Path root, String rawPath) throws IOException {
        if (rawPath == null || rawPath.isBlank()) return null;
        Path candidate;
        try {
            candidate = root.resolve(rawPath.replace('/', java.io.File.separatorChar)).normalize();
        } catch (RuntimeException e) {
            return null;
        }
        if (!candidate.startsWith(root)) return null;

        Path existingAncestor = candidate;
        while (existingAncestor != null && !Files.exists(existingAncestor)) {
            existingAncestor = existingAncestor.getParent();
        }
        if (existingAncestor == null || !existingAncestor.toRealPath().startsWith(root)) return null;
        return candidate;
    }

    private static Path defaultPreview(Path root) {
        for (String name : DEFAULT_PREVIEW_FILES) {
            try {
                Path preview = resolveProjectFile(root, name);
                if (preview != null && isSupportedImage(preview)) return preview;
            } catch (IOException ignored) {
            }
        }
        return null;
    }

    private static boolean validManifestEntryType(String type, Path entry) {
        String ext = extension(entry);
        return switch (type) {
            case "video" -> VIDEO_EXTENSIONS.contains(ext);
            case "web" -> WEB_ENTRY_EXTENSIONS.contains(ext);
            case "scene" -> SCENE_MANIFEST_ENTRY_EXTENSIONS.contains(ext);
            default -> false;
        };
    }

    private static boolean validResolvedEntryType(String type, Path entry) {
        String ext = extension(entry);
        return switch (type) {
            case "video" -> VIDEO_EXTENSIONS.contains(ext);
            case "web" -> WEB_ENTRY_EXTENSIONS.contains(ext);
            case "scene" -> SCENE_PACKAGE_EXTENSIONS.contains(ext);
            default -> false;
        };
    }

    private Map<String, Object> projectItem(WallpaperProject project) {
        Map<String, Object> map = new LinkedHashMap<>();
        String previewUrl = project.preview() == null ? "" : fileUrl(project.preview());
        map.put("id", "wallpaper-engine:" + project.key());
        map.put("name", project.title());
        map.put("source", "wallpaper-engine");
        map.put("kind", project.type());
        map.put("projectType", project.type());
        map.put("projectKey", project.key());
        map.put("manifestFile", project.manifestFile());
        if (!previewUrl.isBlank()) map.put("previewUrl", previewUrl);

        switch (project.type()) {
            case "video" -> {
                String entryUrl = fileUrl(project.entry());
                map.put("url", entryUrl);
                map.put("entryUrl", entryUrl);
            }
            case "web" -> {
                String entryUrl = webEntryUrl(project);
                map.put("url", previewUrl);
                map.put("entryUrl", entryUrl);
                map.put("isolatedOriginRequired", true);
            }
            case "scene" -> {
                map.put("url", previewUrl);
                map.put("projectJson", project.projectJson().toString());
                map.put("entryPath", project.entry().toString());
                map.put("requiresNativeEngine", true);
                Map<String, Object> engine = new LinkedHashMap<>();
                engine.put("provider", "wallpaper-engine");
                engine.put("projectType", "scene");
                engine.put("projectDirectory", project.root().toString());
                engine.put("projectJson", project.projectJson().toString());
                engine.put("manifestFile", project.manifestFile());
                engine.put("entryFile", project.entry().toString());
                engine.put("webViewRenderable", false);
                map.put("engineLaunch", engine);
            }
            default -> {
            }
        }
        return map;
    }

    private Map<String, Object> importedItem(Path path, String title) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", "imported:" + path.toAbsolutePath().normalize());
        map.put("name", title == null || title.isBlank() ? path.getFileName().toString() : title);
        map.put("source", "imported");
        map.put("kind", isVideo(path) ? "video" : "image");
        map.put("url", fileUrl(path));
        return map;
    }

    private static String fileUrl(Path path) {
        String encoded = URLEncoder.encode(path.toAbsolutePath().normalize().toString(), StandardCharsets.UTF_8);
        return "/api/wallpapers/file?path=" + encoded;
    }

    private static String webEntryUrl(WallpaperProject project) {
        String relative = project.root().relativize(project.entry()).toString();
        return "/api/wallpapers/web-entry/" + encodePathSegment(project.key()) + "/" + encodeRelativePath(relative);
    }

    private static String encodeRelativePath(String value) {
        String normalized = value.replace('\\', '/');
        StringBuilder encoded = new StringBuilder();
        for (String segment : normalized.split("/")) {
            if (segment.isBlank()) continue;
            if (!encoded.isEmpty()) encoded.append('/');
            encoded.append(encodePathSegment(segment));
        }
        return encoded.toString();
    }

    private static String encodePathSegment(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String projectKey(Path root) {
        String id = UUID.nameUUIDFromBytes(
            root.toString().toLowerCase(Locale.ROOT).getBytes(StandardCharsets.UTF_8)
        ).toString().replace("-", "");
        return id.substring(0, 20);
    }

    private List<Path> discoverWallpaperEngineRoots() {
        List<Path> roots = new ArrayList<>();
        String configuredRoot = System.getenv("FE_WALLPAPER_ENGINE_ROOT");
        if (configuredRoot != null && !configuredRoot.isBlank()) {
            addWallpaperRoot(roots, configuredRoot);
            return roots.stream().distinct().toList();
        }
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
        Path steamRoot;
        try {
            steamRoot = Path.of(rawSteamRoot).toAbsolutePath().normalize();
        } catch (RuntimeException ignored) {
            return;
        }
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
        } catch (IOException | RuntimeException ignored) {
        }
    }

    private static void addWallpaperRoot(List<Path> roots, String raw) {
        if (raw == null || raw.isBlank() || raw.startsWith("null")) return;
        try {
            Path root = Path.of(raw).toAbsolutePath().normalize();
            if (Files.isDirectory(root)) roots.add(root.toRealPath());
        } catch (IOException | RuntimeException ignored) {
        }
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

    private static Path realRegularFile(String rawPath) throws IOException {
        if (rawPath == null || rawPath.isBlank()) return null;
        try {
            return realRegularFile(Path.of(rawPath));
        } catch (RuntimeException e) {
            throw new IOException("invalid wallpaper path", e);
        }
    }

    private static Path realRegularFile(Path path) throws IOException {
        if (path == null || !Files.isRegularFile(path)) return null;
        return path.toRealPath();
    }

    private static Path realDirectory(Path path) {
        try {
            return Files.isDirectory(path) ? path.toRealPath() : null;
        } catch (IOException ignored) {
            return null;
        }
    }

    private static boolean isSupportedMedia(Path path) {
        String ext = extension(path);
        return IMAGE_EXTENSIONS.contains(ext) || VIDEO_EXTENSIONS.contains(ext);
    }

    private static boolean isSupportedImage(Path path) {
        return IMAGE_EXTENSIONS.contains(extension(path));
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

    private record WallpaperProject(
        String key,
        Path root,
        Path projectJson,
        Path entry,
        Path preview,
        String type,
        String title,
        String manifestFile
    ) {
    }
}
