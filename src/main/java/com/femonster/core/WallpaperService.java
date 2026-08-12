package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public final class WallpaperService {
    public static final long MAX_IMPORT_BYTES = 512L * 1024L * 1024L;
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
    private static final long WALLPAPER_ROOT_DISCOVERY_TTL_MS = 30_000L;
    private static final int MAX_SCENE_PROJECT_FILES = 4_096;
    private static final int MAX_SCENE_WALK_NODES = 16_384;
    private static final int MAX_CACHED_SCENE_INVENTORIES = 8;
    private static final long SCENE_INVENTORY_CACHE_TTL_MS = 15_000L;

    private final Path importedDir;
    private final Object cacheLock = new Object();
    private final Object sceneInventoryCacheLock = new Object();
    private final LinkedHashMap<String, CachedSceneInventory> sceneInventoryCache =
        new LinkedHashMap<>(MAX_CACHED_SCENE_INVENTORIES, 0.75f, true);
    private final Map<String, SceneInventoryFlight> sceneInventoryFlights = new HashMap<>();
    private volatile List<Path> cachedWallpaperEngineRoots = List.of();
    private volatile Map<String, WallpaperProject> cachedWallpaperEngineProjects = Map.of();
    private volatile List<Map<String, Object>> cachedWallpaperEngineCatalog = List.of();
    private volatile String cachedWallpaperEngineFingerprint = "";
    private volatile long catalogRevision;
    private long lastRootDiscoveryAt;
    private long rootScanCount;
    private long catalogScanCount;
    private long catalogParseCount;
    private long sceneInventoryParseCount;
    private long sceneInventoryCacheHitCount;

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
        body.put("catalogRevision", catalogRevision == 0L ? "" : Long.toUnsignedString(catalogRevision));
        List<String> activeWallpaperIds = cachedWallpaperEngineCatalog.stream()
            .filter(item -> Boolean.TRUE.equals(item.get("active")))
            .map(item -> SimpleJson.asString(item.get("id"), ""))
            .filter(id -> !id.isBlank())
            .toList();
        body.put("activeWallpaperIds", activeWallpaperIds);
        body.put("activeWallpaperId", activeWallpaperIds.isEmpty() ? "" : activeWallpaperIds.get(0));
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

    public Map<String, Object> sceneInventory(String rawId) throws IOException {
        WallpaperProject project = requireSceneProject(rawId);
        return sceneInventoryPayload(project, loadSceneInventory(project, false), true);
    }

    public Map<String, Object> sceneInventory(
        String rawId,
        boolean refresh,
        int offset,
        int limit
    ) throws IOException {
        WallpaperProject project = requireSceneProject(rawId);
        SceneInventory inventory = loadSceneInventory(project, refresh);
        return sceneInventoryPayload(project, inventory, true, offset, limit);
    }

    public Map<String, Object> activate(String rawId) throws IOException {
        String id = rawId == null ? "" : rawId.trim();
        WallpaperProject project = requireSceneProject(id);

        Path executable = findWallpaperEngineExecutable();
        if (executable == null) {
            throw new IOException("Wallpaper Engine is not installed or running");
        }

        ProcessBuilder builder = new ProcessBuilder(
            executable.toString(),
            "-control",
            "openWallpaper",
            "-file",
            project.launchFile().toString()
        );
        builder.directory(executable.getParent().toFile());
        builder.redirectOutput(ProcessBuilder.Redirect.DISCARD);
        builder.redirectError(ProcessBuilder.Redirect.DISCARD);
        builder.start();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("id", id);
        body.put("kind", project.type());
        Map<String, Object> inventory = sceneInventoryPayload(
            project,
            loadSceneInventory(project, false),
            false
        );
        body.put("inventory", inventory);
        long projectFileCount = SimpleJson.asLong(inventory.get("projectFileCount"), 0L);
        long packageEntryCount = SimpleJson.asLong(inventory.get("packageEntryCount"), 0L);
        boolean completeIndex = Boolean.TRUE.equals(inventory.get("allRuntimeFileNamesIndexed"));
        body.put("status", "accepted");
        body.put("appliedConfirmed", false);
        body.put("message", completeIndex
            ? "已索引 " + projectFileCount + " 个项目文件和 " + packageEntryCount
                + " 个包内运行资源，已提交给 Wallpaper Engine 原生运行时读取并应用"
            : "场景已提交给 Wallpaper Engine 原生运行时读取并应用（该包仅使用原生兼容路径）");
        return body;
    }

    private WallpaperProject requireSceneProject(String rawId) throws IOException {
        String id = rawId == null ? "" : rawId.trim();
        String prefix = "wallpaper-engine:";
        if (!id.startsWith(prefix)) throw new IOException("wallpaper project not found");
        WallpaperProject project = cachedWallpaperEngineProjects.get(id.substring(prefix.length()));
        if (project == null || !"scene".equals(project.type())) {
            throw new IOException("Wallpaper Engine scene project not found");
        }
        return project;
    }

    public Map<String, Object> cacheDiagnostics() {
        synchronized (cacheLock) {
            Map<String, Object> diagnostics = new LinkedHashMap<>();
            diagnostics.put("rootScanCount", rootScanCount);
            diagnostics.put("catalogScanCount", catalogScanCount);
            diagnostics.put("rootCount", cachedWallpaperEngineRoots.size());
            diagnostics.put("projectCount", cachedWallpaperEngineProjects.size());
            diagnostics.put("catalogParseCount", catalogParseCount);
            diagnostics.put("catalogRevision", catalogRevision);
            diagnostics.put("catalogFingerprint", cachedWallpaperEngineFingerprint);
            synchronized (sceneInventoryCacheLock) {
                diagnostics.put("sceneInventoryParseCount", sceneInventoryParseCount);
                diagnostics.put("sceneInventoryCacheHitCount", sceneInventoryCacheHitCount);
                diagnostics.put("sceneInventoryCacheSize", sceneInventoryCache.size());
            }
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
        long now = System.currentTimeMillis();
        List<Path> roots = cachedWallpaperEngineRoots;
        if (roots.isEmpty() || now - lastRootDiscoveryAt >= WALLPAPER_ROOT_DISCOVERY_TTL_MS) {
            roots = discoverWallpaperEngineRoots();
            lastRootDiscoveryAt = now;
        }
        catalogScanCount++;
        String fingerprint = catalogFingerprint(roots);
        if (fingerprint.equals(cachedWallpaperEngineFingerprint)) return;
        catalogParseCount++;

        Map<String, WallpaperProject> projects = new LinkedHashMap<>();
        List<Map<String, Object>> catalog = new ArrayList<>();
        Map<String, WorkshopMetadata> workshopMetadata = wallpaperEngineWorkshopMetadata(roots);
        for (Path root : roots) {
            if (!Files.isDirectory(root)) continue;
            try (Stream<Path> directories = Files.list(root)) {
                for (Path directory : directories.filter(Files::isDirectory).sorted().toList()) {
                    WallpaperProject project = readWallpaperEngineProject(
                        directory,
                        workshopMetadata.get(pathKey(directory))
                    );
                    if (project == null || projects.containsKey(project.key())) continue;
                    projects.put(project.key(), project);
                    catalog.add(projectItem(project));
                    if (catalog.size() >= 260) break;
                }
            } catch (IOException ignored) {
            }
            if (catalog.size() >= 260) break;
        }

        Map<String, List<String>> activeProjects = activeWallpaperEngineProjects(roots, projects);
        for (Map<String, Object> item : catalog) {
            String projectKey = SimpleJson.asString(item.get("projectKey"), "");
            List<String> monitors = activeProjects.get(projectKey);
            if (monitors == null || monitors.isEmpty()) continue;
            item.put("active", true);
            item.put("activeMonitors", monitors);
        }

        cachedWallpaperEngineRoots = List.copyOf(roots);
        cachedWallpaperEngineProjects = Map.copyOf(projects);
        cachedWallpaperEngineCatalog = List.copyOf(catalog);
        cachedWallpaperEngineFingerprint = fingerprint;
        catalogRevision = Math.max(catalogRevision + 1L, now);
    }

    private String catalogFingerprint(List<Path> roots) {
        long hash = 0xcbf29ce484222325L;
        for (Path root : roots) {
            hash = fingerprintValue(hash, root.toString());
            if (!Files.isDirectory(root)) continue;
            try (Stream<Path> directories = Files.list(root)) {
                for (Path directory : directories.filter(Files::isDirectory).sorted().limit(320).toList()) {
                    Path projectJson = directory.resolve("project.json");
                    Path scenePackage = directory.resolve("scene.pkg");
                    if (!Files.isRegularFile(projectJson) && !Files.isRegularFile(scenePackage)) continue;
                    hash = fingerprintValue(hash, directory.getFileName().toString());
                    for (Path descriptor : List.of(projectJson, scenePackage)) {
                        if (!Files.isRegularFile(descriptor)) continue;
                        hash = fingerprintValue(hash, descriptor.getFileName().toString());
                        hash = fingerprintValue(hash, String.valueOf(Files.size(descriptor)));
                        hash = fingerprintValue(
                            hash,
                            String.valueOf(Files.getLastModifiedTime(descriptor).toMillis())
                        );
                    }
                    hash = fingerprintValue(hash, String.valueOf(Files.getLastModifiedTime(directory).toMillis()));
                }
            } catch (IOException ignored) {
                hash = fingerprintValue(hash, "unreadable");
            }
        }
        for (Path config : wallpaperEngineConfigFiles(roots)) {
            hash = fingerprintValue(hash, config.toString());
            try {
                hash = fingerprintValue(hash, String.valueOf(Files.size(config)));
                hash = fingerprintValue(hash, String.valueOf(Files.getLastModifiedTime(config).toMillis()));
            } catch (IOException ignored) {
                hash = fingerprintValue(hash, "unreadable-config");
            }
        }
        for (Path cache : wallpaperEngineWorkshopCacheFiles(roots)) {
            hash = fingerprintValue(hash, cache.toString());
            try {
                hash = fingerprintValue(hash, String.valueOf(Files.size(cache)));
                hash = fingerprintValue(hash, String.valueOf(Files.getLastModifiedTime(cache).toMillis()));
            } catch (IOException ignored) {
                hash = fingerprintValue(hash, "unreadable-workshop-cache");
            }
        }
        return Long.toUnsignedString(hash, 16);
    }

    private static long fingerprintValue(long hash, String value) {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        long next = hash;
        for (byte item : bytes) {
            next ^= item & 0xffL;
            next *= 0x100000001b3L;
        }
        return next;
    }

    private Map<String, List<String>> activeWallpaperEngineProjects(
        List<Path> roots,
        Map<String, WallpaperProject> projects
    ) {
        Map<String, List<String>> active = new LinkedHashMap<>();
        for (Path config : wallpaperEngineConfigFiles(roots)) {
            try {
                Map<String, Object> root = SimpleJson.parseObjectStrict(
                    Files.readString(config, StandardCharsets.UTF_8)
                );
                for (Object accountValue : root.values()) {
                    if (!(accountValue instanceof Map<?, ?>)) continue;
                    Map<String, Object> account = SimpleJson.asMap(accountValue);
                    Map<String, Object> general = SimpleJson.asMap(account.get("general"));
                    Map<String, Object> wallpaperConfig = SimpleJson.asMap(general.get("wallpaperconfig"));
                    Map<String, Object> selected = SimpleJson.asMap(wallpaperConfig.get("selectedwallpapers"));
                    for (Map.Entry<String, Object> monitor : selected.entrySet()) {
                        Map<String, Object> selection = SimpleJson.asMap(monitor.getValue());
                        Path selectedFile = normalizedPath(
                            SimpleJson.asString(selection.get("file"), "")
                        );
                        if (selectedFile == null) continue;
                        for (WallpaperProject project : projects.values()) {
                            if (!selectedFile.startsWith(project.root())) continue;
                            active.computeIfAbsent(project.key(), ignored -> new ArrayList<>())
                                .add(monitor.getKey());
                            break;
                        }
                    }
                }
            } catch (IOException | IllegalArgumentException ignored) {
            }
        }
        return active;
    }

    private List<Path> wallpaperEngineConfigFiles(List<Path> roots) {
        List<Path> configs = new ArrayList<>();
        Path configured = normalizedPath(System.getenv("FE_WALLPAPER_ENGINE_CONFIG"));
        if (configured != null && Files.isRegularFile(configured)) configs.add(configured);
        for (Path root : roots) {
            Path steamApps = root;
            while (steamApps != null && (
                steamApps.getFileName() == null
                    || !"steamapps".equalsIgnoreCase(steamApps.getFileName().toString())
            )) {
                steamApps = steamApps.getParent();
            }
            if (steamApps == null) continue;
            Path config = steamApps.resolve("common").resolve("wallpaper_engine").resolve("config.json");
            if (Files.isRegularFile(config)) configs.add(config.toAbsolutePath().normalize());
        }
        return configs.stream().distinct().toList();
    }

    private Map<String, WorkshopMetadata> wallpaperEngineWorkshopMetadata(List<Path> roots) {
        Map<String, WorkshopMetadata> metadata = new LinkedHashMap<>();
        for (Path cache : wallpaperEngineWorkshopCacheFiles(roots)) {
            try {
                if (Files.size(cache) > 32L * 1024L * 1024L) continue;
                Map<String, Object> root = SimpleJson.parseObjectStrict(
                    Files.readString(cache, StandardCharsets.UTF_8)
                );
                for (Object rawItem : SimpleJson.asList(root.get("wallpapers"))) {
                    Map<String, Object> item = SimpleJson.asMap(rawItem);
                    Path projectFile = normalizedPath(SimpleJson.asString(item.get("project"), ""));
                    Path entryFile = normalizedPath(SimpleJson.asString(item.get("file"), ""));
                    Path directory = projectFile == null ? null : projectFile.getParent();
                    if (directory == null && entryFile != null) directory = entryFile.getParent();
                    Path realDirectory = realDirectory(directory);
                    if (realDirectory == null || roots.stream().noneMatch(realDirectory::startsWith)) continue;

                    String title = SimpleJson.asString(item.get("title"), "").trim();
                    String type = SimpleJson.asString(item.get("type"), "").trim().toLowerCase(Locale.ROOT);
                    String workshopId = SimpleJson.asString(item.get("workshopid"), "").trim();
                    metadata.putIfAbsent(
                        pathKey(realDirectory),
                        new WorkshopMetadata(title, type, workshopId)
                    );
                }
            } catch (IOException | IllegalArgumentException ignored) {
            }
        }
        return metadata;
    }

    private List<Path> wallpaperEngineWorkshopCacheFiles(List<Path> roots) {
        List<Path> caches = new ArrayList<>();
        for (Path root : roots) {
            Path steamApps = root;
            while (steamApps != null && (
                steamApps.getFileName() == null
                    || !"steamapps".equalsIgnoreCase(steamApps.getFileName().toString())
            )) {
                steamApps = steamApps.getParent();
            }
            if (steamApps == null) continue;
            Path cache = steamApps.resolve("common")
                .resolve("wallpaper_engine")
                .resolve("bin")
                .resolve("workshopcache.json");
            if (Files.isRegularFile(cache)) caches.add(cache.toAbsolutePath().normalize());
        }
        return caches.stream().distinct().toList();
    }

    private static Path normalizedPath(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            return Path.of(raw.replace('/', java.io.File.separatorChar)).toAbsolutePath().normalize();
        } catch (RuntimeException ignored) {
            return null;
        }
    }

    private static String pathKey(Path path) {
        if (path == null) return "";
        try {
            return path.toAbsolutePath().normalize().toString().toLowerCase(Locale.ROOT);
        } catch (RuntimeException ignored) {
            return "";
        }
    }

    private WallpaperProject readWallpaperEngineProject(Path directory, WorkshopMetadata workshopMetadata) {
        try {
            Path root = directory.toRealPath();
            boolean projectManifestPresent = Files.exists(
                root.resolve("project.json"),
                LinkOption.NOFOLLOW_LINKS
            );
            Path projectJson = resolveProjectFile(root, "project.json");
            Path packageFile = resolveProjectFile(root, "scene.pkg");
            Map<String, Object> manifest = null;
            if (projectManifestPresent) {
                if (projectJson == null || Files.size(projectJson) > 4L * 1024L * 1024L) return null;
                try {
                    manifest = SimpleJson.parseObjectStrict(
                        Files.readString(projectJson, StandardCharsets.UTF_8)
                    );
                } catch (IOException | IllegalArgumentException ignored) {
                    return null;
                }
            }

            String type = manifest == null
                ? ""
                : SimpleJson.asString(manifest.get("type"), "").trim().toLowerCase(Locale.ROOT);
            String rawEntry = manifest == null
                ? ""
                : SimpleJson.asString(manifest.get("file"), "").trim();
            Path entry = null;

            if (manifest != null) {
                if (!Set.of("video", "web", "scene").contains(type)) return null;
                Path declaredEntry = resolveProjectPath(root, rawEntry);
                if (declaredEntry == null || !validManifestEntryType(type, declaredEntry)) return null;
                entry = resolveProjectFile(root, rawEntry);
                if ("scene".equals(type) && packageFile != null) entry = packageFile;
            } else if (packageFile != null) {
                type = "scene";
                rawEntry = "scene.pkg";
                entry = packageFile;
            }

            if (entry == null || !validResolvedEntryType(type, entry)) return null;

            String rawPreview = manifest == null
                ? ""
                : SimpleJson.asString(manifest.get("preview"), "").trim();
            Path preview = rawPreview.isBlank() ? null : resolveProjectFile(root, rawPreview);
            if (preview != null && !isSupportedImage(preview)) preview = null;
            if (preview == null) preview = defaultPreview(root);

            String title = manifest == null
                ? ""
                : SimpleJson.asString(manifest.get("title"), "").trim();
            if (title.isBlank() && workshopMetadata != null) title = workshopMetadata.title();
            if (title.isBlank()) title = directory.getFileName().toString();
            String key = projectKey(root);
            String workshopId = workshopMetadata == null
                ? directory.getFileName().toString()
                : workshopMetadata.workshopId();
            return new WallpaperProject(
                key,
                root,
                projectJson,
                entry,
                preview,
                type,
                title,
                rawEntry,
                workshopId
            );
        } catch (IOException | IllegalArgumentException ignored) {
            return null;
        }
    }

    private SceneInventory loadSceneInventory(WallpaperProject project, boolean refresh) {
        long requestStartedAtNanos = System.nanoTime();
        while (true) {
            String generation = sceneInventoryGeneration(project);
            long now = System.currentTimeMillis();
            SceneInventoryFlight flight;
            boolean ownsFlight = false;
            synchronized (sceneInventoryCacheLock) {
                CachedSceneInventory cached = sceneInventoryCache.get(project.key());
                if (
                    !refresh
                        && cached != null
                        && generation.equals(cached.generation())
                        && now - cached.loadedAtMillis() <= SCENE_INVENTORY_CACHE_TTL_MS
                ) {
                    sceneInventoryCacheHitCount++;
                    return cached.inventory();
                }
                if (
                    refresh
                        && cached != null
                        && generation.equals(cached.generation())
                        && cached.completedAtNanos() >= requestStartedAtNanos
                ) {
                    sceneInventoryCacheHitCount++;
                    return cached.inventory();
                }

                flight = sceneInventoryFlights.get(project.key());
                if (flight == null) {
                    flight = new SceneInventoryFlight(generation, new CompletableFuture<>());
                    sceneInventoryFlights.put(project.key(), flight);
                    ownsFlight = true;
                } else {
                    sceneInventoryCacheHitCount++;
                }
            }

            if (!ownsFlight) {
                SceneInventory shared = flight.future().join();
                if (generation.equals(flight.generation())) return shared;
                continue;
            }

            try {
                SceneInventory loaded = readSceneInventory(project.root(), project.entry());
                synchronized (sceneInventoryCacheLock) {
                    sceneInventoryParseCount++;
                    sceneInventoryCache.put(
                        project.key(),
                        new CachedSceneInventory(
                            generation,
                            System.currentTimeMillis(),
                            System.nanoTime(),
                            loaded
                        )
                    );
                    while (sceneInventoryCache.size() > MAX_CACHED_SCENE_INVENTORIES) {
                        String eldest = sceneInventoryCache.keySet().iterator().next();
                        sceneInventoryCache.remove(eldest);
                    }
                    sceneInventoryFlights.remove(project.key(), flight);
                    flight.future().complete(loaded);
                }
                return loaded;
            } catch (RuntimeException | Error error) {
                synchronized (sceneInventoryCacheLock) {
                    sceneInventoryFlights.remove(project.key(), flight);
                    flight.future().completeExceptionally(error);
                }
                throw error;
            }
        }
    }

    private String sceneInventoryGeneration(WallpaperProject project) {
        long hash = 0xcbf29ce484222325L;
        hash = fingerprintValue(hash, project.root().toString());
        for (Path file : List.of(project.entry())) {
            try {
                hash = fingerprintValue(hash, String.valueOf(Files.size(file)));
                hash = fingerprintValue(hash, String.valueOf(Files.getLastModifiedTime(file).toMillis()));
            } catch (IOException ignored) {
                hash = fingerprintValue(hash, "unreadable-entry");
            }
        }
        if (project.projectJson() != null) {
            try {
                hash = fingerprintValue(hash, String.valueOf(Files.size(project.projectJson())));
                hash = fingerprintValue(
                    hash,
                    String.valueOf(Files.getLastModifiedTime(project.projectJson()).toMillis())
                );
            } catch (IOException ignored) {
                hash = fingerprintValue(hash, "unreadable-project-json");
            }
        }
        try {
            hash = fingerprintValue(hash, String.valueOf(Files.getLastModifiedTime(project.root()).toMillis()));
        } catch (IOException ignored) {
            hash = fingerprintValue(hash, "unreadable-project-root");
        }
        return Long.toUnsignedString(hash, 16);
    }

    private SceneInventory readSceneInventory(Path root, Path entry) {
        List<SceneFile> projectFiles = new ArrayList<>();
        boolean projectFilesTruncated = false;
        try (Stream<Path> stream = Files.walk(root)) {
            var iterator = stream.iterator();
            int visitedNodes = 0;
            while (iterator.hasNext()) {
                Path candidate = iterator.next();
                visitedNodes++;
                if (visitedNodes > MAX_SCENE_WALK_NODES
                    || projectFiles.size() >= MAX_SCENE_PROJECT_FILES) {
                    projectFilesTruncated = true;
                    break;
                }
                if (Files.isSymbolicLink(candidate) || !Files.isRegularFile(candidate)) continue;
                Path file;
                try {
                    file = candidate.toRealPath();
                } catch (IOException ignored) {
                    projectFilesTruncated = true;
                    continue;
                }
                if (!file.startsWith(root)) continue;
                String relative = root.relativize(file).toString().replace('\\', '/');
                try {
                    projectFiles.add(new SceneFile(
                        relative,
                        Files.size(file),
                        WallpaperScenePackageReader.resourceCategory(relative),
                        WallpaperScenePackageReader.isSourceCode(relative)
                    ));
                } catch (IOException ignored) {
                    projectFilesTruncated = true;
                }
            }
        } catch (IOException ignored) {
            projectFilesTruncated = true;
        }
        projectFiles.sort(Comparator.comparing(SceneFile::path));

        WallpaperScenePackageReader.PackageIndex packageIndex = null;
        String packageError = "";
        if (entry != null && ".pkg".equals(extension(entry))) {
            try {
                packageIndex = WallpaperScenePackageReader.inspect(entry);
            } catch (IOException error) {
                packageError = error.getMessage() == null ? "package index unavailable" : error.getMessage();
            }
        }
        return new SceneInventory(projectFiles, projectFilesTruncated, packageIndex, packageError);
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
        String id = "wallpaper-engine:" + project.key();
        map.put("id", id);
        map.put("name", project.title());
        map.put("source", "wallpaper-engine");
        map.put("kind", project.type());
        map.put("projectType", project.type());
        map.put("projectKey", project.key());
        map.put("manifestFile", project.manifestFile());
        if (!project.workshopId().isBlank()) map.put("workshopId", project.workshopId());
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
                if (project.projectJson() != null) map.put("projectJson", project.projectJson().toString());
                map.put("entryPath", project.entry().toString());
                map.put("requiresNativeEngine", true);
                map.put("sceneInventoryUrl", "/api/wallpapers/scene?id=" + URLEncoder.encode(id, StandardCharsets.UTF_8));
                map.put("sceneInventoryMode", "on-demand");
                Map<String, Object> engine = new LinkedHashMap<>();
                engine.put("provider", "wallpaper-engine");
                engine.put("projectType", "scene");
                engine.put("projectDirectory", project.root().toString());
                if (project.projectJson() != null) engine.put("projectJson", project.projectJson().toString());
                engine.put("manifestFile", project.manifestFile());
                engine.put("entryFile", project.entry().toString());
                engine.put("launchFile", project.launchFile().toString());
                engine.put("resourceInventory", "on-demand");
                engine.put("nativePackageExecution", true);
                engine.put("webViewRenderable", false);
                map.put("engineLaunch", engine);
            }
            default -> {
            }
        }
        return map;
    }

    private Map<String, Object> sceneInventoryPayload(
        WallpaperProject project,
        SceneInventory inventory,
        boolean includeEntries
    ) {
        return sceneInventoryPayload(project, inventory, includeEntries, 0, Integer.MAX_VALUE);
    }

    private Map<String, Object> sceneInventoryPayload(
        WallpaperProject project,
        SceneInventory inventory,
        boolean includeEntries,
        int offset,
        int limit
    ) {
        List<SceneFile> projectFiles = inventory.projectFiles();
        WallpaperScenePackageReader.PackageIndex packageIndex = inventory.packageIndex();
        boolean packagePresent = ".pkg".equals(extension(project.entry()));
        boolean packageSupported = packageIndex != null && packageIndex.formatSupported();
        long packageEntryCount = packageSupported ? packageIndex.entries().size() : 0L;
        long declaredPackageEntryCount = packageIndex == null ? 0L : packageIndex.declaredEntryCount();
        long sourceCodeEntryCount = packageSupported ? packageIndex.sourceCodeEntryCount() : 0L;
        long projectSourceCodeCount = projectFiles.stream().filter(SceneFile::sourceCode).count();
        long shaderSourceCount = packageSupported ? packageIndex.categoryCount("shader-source") : 0L;
        long compiledShaderCount = packageSupported ? packageIndex.categoryCount("compiled-shader") : 0L;
        long sceneDataCount = packageSupported ? packageIndex.categoryCount("scene-data") : 0L;
        shaderSourceCount += projectFiles.stream()
            .filter(file -> "shader-source".equals(file.category()))
            .count();
        compiledShaderCount += projectFiles.stream()
            .filter(file -> "compiled-shader".equals(file.category()))
            .count();
        sceneDataCount += projectFiles.stream()
            .filter(file -> "scene-data".equals(file.category()))
            .count();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("id", "wallpaper-engine:" + project.key());
        body.put("name", project.title());
        body.put("kind", "scene");
        body.put("projectFileCount", projectFiles.size());
        body.put("projectFilesTruncated", inventory.projectFilesTruncated());
        body.put("projectFileNamesIndexed", !inventory.projectFilesTruncated());
        body.put("packagePresent", packagePresent);
        body.put("packageIndexReadable", packageIndex != null);
        body.put("packageFormatSupported", packageSupported);
        body.put("packageIndexComplete", !packagePresent || packageSupported);
        body.put("packageVersion", packageIndex == null ? "" : packageIndex.version());
        body.put("packageEntryCount", packageEntryCount);
        body.put("declaredPackageEntryCount", declaredPackageEntryCount);
        body.put("packageBytes", packageIndex == null ? 0L : packageIndex.packageSize());
        body.put("packagePayloadBytes", packageSupported ? packageIndex.payloadBytes() : 0L);
        body.put("sceneDataEntryCount", sceneDataCount);
        body.put("shaderSourceEntryCount", shaderSourceCount);
        body.put("compiledShaderEntryCount", compiledShaderCount);
        body.put("sourceCodeEntryCount", sourceCodeEntryCount + projectSourceCodeCount);
        body.put("embeddedSceneScript", packageSupported && packageIndex.embeddedSceneScript());
        body.put("embeddedSceneScriptHeuristic", packageSupported);
        body.put("embeddedSceneScriptScanComplete", packageSupported && packageIndex.scriptScanComplete());
        body.put("allRuntimeFileNamesIndexed", !inventory.projectFilesTruncated()
            && (!packagePresent || packageSupported));
        body.put("nativeRuntime", "wallpaper-engine");
        body.put("nativeRuntimeOwnsExecution", true);
        body.put("runtimeFileContentsOwnedByNativeEngine", true);
        body.put("scriptsExecutedInApplicationOrigin", false);
        body.put("launchFile", project.root().relativize(project.launchFile()).toString().replace('\\', '/'));
        if (!inventory.packageError().isBlank()) {
            body.put("packageIndexError", inventory.packageError());
        }

        if (includeEntries) {
            int safeOffset = Math.max(0, offset);
            int safeLimit = Math.max(0, limit);
            int projectFrom = Math.min(safeOffset, projectFiles.size());
            int projectTo = (int) Math.min(projectFiles.size(), (long) projectFrom + safeLimit);
            List<Map<String, Object>> projectFileItems = new ArrayList<>(projectTo - projectFrom);
            for (SceneFile file : projectFiles.subList(projectFrom, projectTo)) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("path", file.path());
                item.put("size", file.size());
                item.put("category", file.category());
                item.put("sourceCode", file.sourceCode());
                projectFileItems.add(item);
            }
            body.put("projectFiles", projectFileItems);

            List<Map<String, Object>> packageEntries = new ArrayList<>();
            if (packageSupported) {
                int returnedProjectFiles = projectTo - projectFrom;
                int remainingLimit = Math.max(0, safeLimit - returnedProjectFiles);
                int packageFrom = (int) Math.min(
                    Math.max(0L, (long) safeOffset - projectFiles.size()),
                    packageIndex.entries().size()
                );
                int packageTo = (int) Math.min(
                    packageIndex.entries().size(),
                    (long) packageFrom + remainingLimit
                );
                for (WallpaperScenePackageReader.Entry entry
                    : packageIndex.entries().subList(packageFrom, packageTo)) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("path", entry.name());
                    item.put("size", entry.size());
                    item.put("category", entry.category());
                    item.put("sourceCode", entry.sourceCode());
                    packageEntries.add(item);
                }
            }
            body.put("packageEntries", packageEntries);
            long totalEntries = projectFiles.size() + packageEntryCount;
            long pageEnd = Math.min(totalEntries, (long) safeOffset + safeLimit);
            boolean hasMore = safeLimit > 0 && pageEnd < totalEntries;
            body.put("entryOffset", safeOffset);
            body.put("entryLimit", safeLimit);
            body.put("entriesHaveMore", hasMore);
            body.put("nextEntryOffset", hasMore ? pageEnd : -1L);
        }
        return body;
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
        long total = 0L;
        try (OutputStream output = Files.newOutputStream(target)) {
            int read;
            while ((read = input.read(buffer)) >= 0) {
                if (read == 0) continue;
                if (read > MAX_IMPORT_BYTES - total) {
                    throw new IOException("wallpaper exceeds 512 MiB import limit");
                }
                output.write(buffer, 0, read);
                total += read;
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
        String manifestFile,
        String workshopId
    ) {
        private Path launchFile() {
            return projectJson == null ? entry : projectJson;
        }
    }

    private record SceneInventory(
        List<SceneFile> projectFiles,
        boolean projectFilesTruncated,
        WallpaperScenePackageReader.PackageIndex packageIndex,
        String packageError
    ) {
        private SceneInventory {
            projectFiles = List.copyOf(projectFiles);
            packageError = packageError == null ? "" : packageError;
        }
    }

    private record SceneFile(String path, long size, String category, boolean sourceCode) {
    }

    private record CachedSceneInventory(
        String generation,
        long loadedAtMillis,
        long completedAtNanos,
        SceneInventory inventory
    ) {
    }

    private record SceneInventoryFlight(
        String generation,
        CompletableFuture<SceneInventory> future
    ) {
    }

    private record WorkshopMetadata(String title, String type, String workshopId) {
        private WorkshopMetadata {
            title = title == null ? "" : title;
            type = type == null ? "" : type;
            workshopId = workshopId == null ? "" : workshopId;
        }
    }
}
