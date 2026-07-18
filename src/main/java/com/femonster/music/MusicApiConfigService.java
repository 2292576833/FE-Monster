package com.femonster.music;

import com.femonster.core.ProjectPaths;
import com.femonster.json.SimpleJson;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public final class MusicApiConfigService implements AutoCloseable {
    public static final String CONFIG_SCHEMA = "fe-monster.music-apis/v1";
    public static final String PACKAGE_SCHEMA = "fe-monster.music-api-package/v1";

    private static final int MAX_JSON_BYTES = 64 * 1024;
    private static final long MAX_ZIP_BYTES = 25L * 1024 * 1024;
    private static final long MAX_EXTRACTED_BYTES = 100L * 1024 * 1024;
    private static final long MAX_ENTRY_BYTES = 16L * 1024 * 1024;
    private static final int MAX_ZIP_ENTRIES = 256;
    private static final Set<String> SUPPORTED_IDS = Set.of("netease", "qq", "kugou", "qishui");
    private static final Set<String> PACKAGE_MANIFESTS = Set.of("music-api-package.json", "fe-music-api.json");
    private static final Set<String> WINDOWS_RESERVED = Set.of(
        "con", "prn", "aux", "nul", "clock$",
        "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
        "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9"
    );

    private final ProjectPaths paths;
    private final Path apiDir;
    private final Path configFile;
    private final Path packagesDir;
    private final Path stagingDir;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build();
    private final ExecutorService starter = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "fe-music-api-starter");
        thread.setDaemon(true);
        return thread;
    });
    private final Map<String, Process> processes = new ConcurrentHashMap<>();
    private final Map<String, ProviderConfig> starting = new ConcurrentHashMap<>();
    private final Map<String, String> statuses = new ConcurrentHashMap<>();
    private volatile Map<String, ProviderConfig> providers = Map.of();
    private volatile boolean closed;

    public MusicApiConfigService(ProjectPaths paths) throws IOException {
        this.paths = paths;
        this.apiDir = paths.dataDir.resolve("music-api").toAbsolutePath().normalize();
        this.configFile = apiDir.resolve("providers.json");
        this.packagesDir = apiDir.resolve("packages");
        this.stagingDir = apiDir.resolve("staging");
        Files.createDirectories(packagesDir);
        Files.createDirectories(stagingDir);
        load();
    }

    public List<ProviderConfig> providers() {
        return List.copyOf(providers.values());
    }

    public ProviderConfig provider(String provider) {
        String id = normalizeId(provider);
        ProviderConfig config = providers.get(id);
        if (config == null) throw new IllegalArgumentException("unknown music provider: " + id);
        String environment = baseUrlEnvironment(id);
        String override = environment.isBlank() ? "" : System.getenv().getOrDefault(environment, "").trim();
        if (override.isBlank()) return config;
        return config.withBaseUrl(validateBaseUrl(override));
    }

    public synchronized ImportResult importJson(InputStream input) throws IOException {
        String json = readJson(input, MAX_JSON_BYTES);
        Map<String, Object> root = parseConfigObject(json);
        List<Map<String, Object>> items = providerMaps(root);
        if (items.isEmpty()) throw new IllegalArgumentException("music API config has no providers");

        Map<String, ProviderConfig> previous = providers;
        Map<String, ProviderConfig> next = new LinkedHashMap<>(previous);
        List<ProviderConfig> imported = new ArrayList<>();
        for (Map<String, Object> item : items) {
            String id = normalizeSupportedId(SimpleJson.asString(item.get("id"), ""));
            ProviderConfig fallback = next.get(id);
            ProviderConfig parsed = parseProvider(item, fallback, "imported-json", "", null, true, false);
            next.put(id, parsed);
            imported.add(parsed);
        }
        activate(next);
        for (ProviderConfig config : imported) {
            stop(config.id());
            cleanupReplacedPackage(previous.get(config.id()), config);
        }
        return new ImportResult(imported, false);
    }

    public synchronized ImportResult importTrustedZip(InputStream input, boolean trusted) throws IOException {
        if (!trusted) throw new IllegalArgumentException("ZIP API package requires explicit local-code trust");
        Path staging = stagingDir.resolve("import-" + UUID.randomUUID()).normalize();
        Files.createDirectories(staging);
        try {
            List<Path> manifests = extractZip(input, staging);
            if (manifests.size() != 1) {
                throw new IllegalArgumentException("ZIP API package must contain exactly one music-api-package.json manifest");
            }
            Path manifest = manifests.get(0);
            Map<String, Object> root = parseConfigObject(Files.readString(manifest, StandardCharsets.UTF_8));
            String schema = SimpleJson.asString(root.get("schema"), PACKAGE_SCHEMA);
            if (!PACKAGE_SCHEMA.equals(schema)) throw new IllegalArgumentException("unsupported music API package schema");

            String id = normalizeSupportedId(SimpleJson.asString(root.get("id"), SimpleJson.asString(root.get("provider"), "")));
            ProviderConfig fallback = providers.get(id);
            Path packageRootInStaging = manifest.getParent().toAbsolutePath().normalize();
            Launcher launcher = parseLauncher(root, packageRootInStaging);

            String finalName = id + "-" + System.currentTimeMillis();
            Path finalDirectory = packagesDir.resolve(finalName).normalize();
            Files.move(staging, finalDirectory);
            Path packageRoot = finalDirectory.resolve(staging.relativize(packageRootInStaging)).normalize();
            String packageDirectory = packagesDir.relativize(packageRoot).toString().replace('\\', '/');

            ProviderConfig parsed;
            try {
                parsed = parseProvider(root, fallback, "imported-zip", packageDirectory, launcher, true, true);
                validateLauncher(parsed);
                Map<String, ProviderConfig> next = new LinkedHashMap<>(providers);
                next.put(id, parsed);
                activate(next);
            } catch (RuntimeException | IOException error) {
                deleteTree(finalDirectory);
                throw error;
            }
            stop(id);
            cleanupReplacedPackage(fallback, parsed);
            return new ImportResult(List.of(parsed), true);
        } catch (IOException | RuntimeException error) {
            deleteTree(staging);
            throw error;
        }
    }

    public Map<String, Object> redactedPayload() {
        List<Map<String, Object>> items = new ArrayList<>();
        for (ProviderConfig stored : providers.values()) {
            ProviderConfig config = provider(stored.id());
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", config.id());
            item.put("label", config.label());
            item.put("appName", config.appName());
            item.put("baseUrl", config.baseUrl());
            item.put("healthPath", config.healthPath());
            item.put("enabled", config.enabled());
            item.put("configured", config.configured());
            item.put("autostart", config.autostart());
            item.put("loginQr", config.loginQr());
            item.put("source", config.source());
            item.put("package", config.packageDirectory().isBlank() ? null : config.packageDirectory());
            item.put("status", statuses.getOrDefault(config.id(), config.configured() ? "configured" : "not-configured"));
            items.add(item);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("schema", CONFIG_SCHEMA);
        body.put("configFile", "data/music-api/providers.json");
        body.put("providers", items);
        return body;
    }

    public void startAutostart() {
        if (disabled("FE_MUSIC_API_AUTOSTART")) return;
        for (ProviderConfig config : providers()) {
            if (config.enabled() && config.configured() && config.autostart()) ensureStarted(config.id());
        }
    }

    public void ensureStarted(String provider) {
        if (closed) return;
        ProviderConfig config = provider(provider);
        if (!config.enabled() || !config.configured()) {
            statuses.put(config.id(), "not-configured");
            return;
        }
        if (disabled(autostartEnvironment(config.id()))) {
            statuses.put(config.id(), "autostart-disabled");
            return;
        }
        ProviderConfig previous = starting.put(config.id(), config);
        if (config.equals(previous)) return;
        statuses.put(config.id(), "checking");
        try {
            starter.submit(() -> startNow(config));
        } catch (RejectedExecutionException error) {
            starting.remove(config.id(), config);
            statuses.put(config.id(), "stopped");
        }
    }

    public Map<String, Object> refreshStatus(String provider) {
        ProviderConfig config = provider(provider);
        boolean reachable = isReachable(config);
        statuses.put(config.id(), reachable ? "ready" : statuses.getOrDefault(config.id(), "unavailable"));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("provider", config.id());
        body.put("reachable", reachable);
        body.put("status", statuses.get(config.id()));
        return body;
    }

    public void stop(String provider) {
        Process process = processes.remove(normalizeId(provider));
        if (process == null) return;
        destroyProcessTree(process);
    }

    @Override
    public void close() {
        closed = true;
        starter.shutdownNow();
        for (String id : List.copyOf(processes.keySet())) stop(id);
        try {
            starter.awaitTermination(2, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        for (String id : List.copyOf(processes.keySet())) stop(id);
    }

    private void load() throws IOException {
        Map<String, ProviderConfig> next = defaults();
        if (Files.isRegularFile(configFile)) {
            try {
                if (Files.size(configFile) > MAX_JSON_BYTES) throw new IllegalArgumentException("music API config exceeds 64 KB");
                Map<String, Object> root = parseConfigObject(Files.readString(configFile, StandardCharsets.UTF_8));
                for (Map<String, Object> item : providerMaps(root)) {
                    String id = normalizeSupportedId(SimpleJson.asString(item.get("id"), ""));
                    ProviderConfig fallback = next.get(id);
                    String source = SimpleJson.asString(item.get("source"), fallback.source());
                    Launcher launcher = "builtin".equals(source) ? fallback.launcher() : parseStoredLauncher(item);
                    ProviderConfig parsed = parseProvider(
                        item,
                        fallback,
                        source,
                        SimpleJson.asString(item.get("package"), ""),
                        launcher,
                        SimpleJson.asBoolean(item.get("configured"), fallback.configured()),
                        true
                    );
                    if (parsed.launcher() != null && "imported-zip".equals(parsed.source())) validateLauncher(parsed);
                    next.put(id, parsed);
                }
            } catch (RuntimeException error) {
                Path invalid = apiDir.resolve("providers.invalid-" + System.currentTimeMillis() + ".json");
                Files.move(configFile, invalid, StandardCopyOption.REPLACE_EXISTING);
            }
        }
        activate(next);
    }

    private synchronized void activate(Map<String, ProviderConfig> next) throws IOException {
        LinkedHashMap<String, ProviderConfig> ordered = new LinkedHashMap<>();
        for (String id : List.of("netease", "qq", "kugou", "qishui")) ordered.put(id, next.getOrDefault(id, defaults().get(id)));
        save(ordered);
        providers = Collections.unmodifiableMap(ordered);
    }

    private void save(Map<String, ProviderConfig> candidate) throws IOException {
        Files.createDirectories(configFile.getParent());
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("schema", CONFIG_SCHEMA);
        root.put("version", 1);
        List<Map<String, Object>> items = new ArrayList<>();
        for (ProviderConfig config : candidate.values()) items.add(config.toMap());
        root.put("providers", items);
        Path temporary = configFile.resolveSibling(configFile.getFileName() + ".tmp");
        Files.writeString(temporary, SimpleJson.stringify(root), StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        try {
            Files.move(temporary, configFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException ignored) {
            Files.move(temporary, configFile, StandardCopyOption.REPLACE_EXISTING);
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private void startNow(ProviderConfig config) {
        Process process = null;
        try {
            if (closed || !isCurrent(config)) return;
            if (isReachable(config)) {
                if (isCurrent(config)) statuses.put(config.id(), "ready");
                return;
            }
            if (!isCurrent(config)) return;
            if (config.launcher() == null) {
                statuses.put(config.id(), "external-service-unavailable");
                return;
            }
            statuses.put(config.id(), "starting");
            ProcessBuilder builder = processBuilder(config);
            builder.redirectOutput(ProcessBuilder.Redirect.DISCARD);
            builder.redirectError(ProcessBuilder.Redirect.DISCARD);
            process = builder.start();
            if (closed || !isCurrent(config)) {
                destroyProcessTree(process);
                if (closed) statuses.put(config.id(), "stopped");
                return;
            }
            processes.put(config.id(), process);
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(12);
            while (System.nanoTime() < deadline && process.isAlive()) {
                if (isReachable(config)) {
                    statuses.put(config.id(), "ready");
                    return;
                }
                Thread.sleep(300);
            }
            if (isReachable(config)) {
                statuses.put(config.id(), "ready");
            } else {
                statuses.put(config.id(), process.isAlive() ? "startup-timeout" : "startup-failed");
                if (process.isAlive()) destroyProcessTree(process);
                processes.remove(config.id(), process);
            }
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
            statuses.put(config.id(), "interrupted");
            if (process != null) {
                processes.remove(config.id(), process);
                destroyProcessTree(process);
            }
        } catch (IOException | RuntimeException error) {
            statuses.put(config.id(), "startup-failed");
        } finally {
            if (closed && process != null) {
                processes.remove(config.id(), process);
                destroyProcessTree(process);
            }
            starting.remove(config.id(), config);
        }
    }

    private boolean isCurrent(ProviderConfig config) {
        return config != null && config.equals(providers.get(config.id()));
    }

    private ProcessBuilder processBuilder(ProviderConfig config) throws IOException {
        validateLauncher(config);
        Launcher launcher = config.launcher();
        Path working = packageRoot(config);
        Path entry = launcher.runtime().equals("npm") ? working.resolve("package.json") : working.resolve(launcher.entry()).normalize();
        List<String> command = new ArrayList<>();
        switch (launcher.runtime()) {
            case "node" -> {
                command.add(nodeExecutable());
                command.add("--max-old-space-size=256");
                command.add(entry.toString());
            }
            case "java" -> {
                command.add(javaExecutable());
                command.add("-Xms16m");
                command.add("-Xmx256m");
                command.add("-jar");
                command.add(entry.toString());
            }
            case "powershell" -> {
                command.add("powershell.exe");
                command.addAll(List.of("-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", entry.toString()));
            }
            case "npm" -> {
                command.add("npm.cmd");
                command.add("run");
                command.add(launcher.entry().isBlank() ? "start" : launcher.entry());
                command.add("--silent");
            }
            default -> throw new IllegalArgumentException("unsupported API launcher runtime");
        }
        for (String argument : launcher.args()) command.add(expandArgument(argument, config, working));
        ProcessBuilder builder = new ProcessBuilder(command);
        builder.directory(working.toFile());
        builder.environment().put("HOST", "127.0.0.1");
        builder.environment().put("PORT", String.valueOf(URI.create(config.baseUrl()).getPort()));
        builder.environment().put("FE_MUSIC_PROVIDER", config.id());
        builder.environment().put("NODE_OPTIONS", "--max-old-space-size=256");
        return builder;
    }

    private Launcher parseLauncher(Map<String, Object> root, Path packageRoot) {
        Map<String, Object> map = SimpleJson.asMap(root.get("launcher"));
        String runtime = SimpleJson.asString(map.get("runtime"), SimpleJson.asString(root.get("runtime"), "")).trim().toLowerCase(Locale.ROOT);
        String entry = SimpleJson.asString(map.get("entry"), SimpleJson.asString(root.get("entry"), "")).trim();
        Object argsValue = map.containsKey("args") ? map.get("args") : root.get("args");
        List<String> args = stringList(argsValue);
        if (runtime.isBlank() && entry.isBlank()) return null;
        Launcher launcher = validateLauncherValue(new Launcher(runtime, entry, args));
        if (!"npm".equals(runtime)) {
            Path target = packageRoot.resolve(entry).normalize();
            if (!target.startsWith(packageRoot) || !Files.isRegularFile(target)) throw new IllegalArgumentException("API package entry is missing or outside the package");
        } else if (!Files.isRegularFile(packageRoot.resolve("package.json"))) {
            throw new IllegalArgumentException("npm API package is missing package.json");
        }
        return launcher;
    }

    private Launcher parseStoredLauncher(Map<String, Object> item) {
        Map<String, Object> map = SimpleJson.asMap(item.get("launcher"));
        if (map.isEmpty()) return null;
        return validateLauncherValue(new Launcher(
            SimpleJson.asString(map.get("runtime"), ""),
            SimpleJson.asString(map.get("entry"), ""),
            stringList(map.get("args"))
        ));
    }

    private void validateLauncher(ProviderConfig config) throws IOException {
        Launcher launcher = config.launcher();
        if (launcher == null) return;
        validateLauncherValue(launcher);
        Path working = packageRoot(config);
        if (!Files.isDirectory(working)) throw new IllegalArgumentException("music API package directory is missing");
        if (!"npm".equals(launcher.runtime())) {
            Path entry = working.resolve(launcher.entry()).normalize();
            if (!entry.startsWith(working) || !Files.isRegularFile(entry)) throw new IllegalArgumentException("music API package entry is missing");
        }
    }

    private Launcher validateLauncherValue(Launcher launcher) {
        String runtime = launcher.runtime() == null ? "" : launcher.runtime().trim().toLowerCase(Locale.ROOT);
        if (!Set.of("node", "java", "powershell", "npm").contains(runtime)) throw new IllegalArgumentException("unsupported API launcher runtime: " + runtime);
        String entry = launcher.entry() == null ? "" : launcher.entry().trim().replace('\\', '/');
        if (entry.isBlank() || unsafeRelativePath(entry)) throw new IllegalArgumentException("invalid API launcher entry");
        List<String> args = new ArrayList<>();
        for (String argument : launcher.args() == null ? List.<String>of() : launcher.args()) {
            String value = argument == null ? "" : argument.trim();
            if (value.length() > 256 || value.contains("\u0000") || value.contains("\n") || value.contains("\r")
                || value.contains("|") || value.contains(">") || value.contains("<") || value.contains("&")
                || value.contains("`") || value.contains("$(")) {
                throw new IllegalArgumentException("unsafe API launcher argument");
            }
            args.add(value);
        }
        return new Launcher(runtime, entry, List.copyOf(args));
    }

    private ProviderConfig parseProvider(
        Map<String, Object> map,
        ProviderConfig fallback,
        String source,
        String packageDirectory,
        Launcher launcher,
        boolean configured,
        boolean allowStoredLauncher
    ) {
        if (fallback == null) throw new IllegalArgumentException("unsupported music provider");
        String id = normalizeSupportedId(SimpleJson.asString(map.get("id"), fallback.id()));
        String label = boundedText(map.get("label"), fallback.label(), 40);
        String appName = boundedText(map.get("appName"), fallback.appName(), 60);
        String baseUrl = validateBaseUrl(SimpleJson.asString(map.get("baseUrl"), fallback.baseUrl()));
        String healthPath = validateHealthPath(SimpleJson.asString(map.get("healthPath"), fallback.healthPath()));
        boolean enabled = SimpleJson.asBoolean(map.get("enabled"), fallback.enabled());
        boolean autostart = SimpleJson.asBoolean(map.get("autostart"), launcher != null && fallback.autostart());
        boolean loginQr = SimpleJson.asBoolean(map.get("loginQr"), fallback.loginQr());
        if ("netease".equals(id)) {
            enabled = true;
            configured = true;
        }
        String safePackage = normalizePackageDirectory(packageDirectory);
        Launcher safeLauncher = allowStoredLauncher ? launcher : null;
        return new ProviderConfig(id, label, appName, baseUrl, healthPath, enabled, configured, autostart, loginQr, source, safePackage, safeLauncher);
    }

    private Map<String, ProviderConfig> defaults() {
        LinkedHashMap<String, ProviderConfig> map = new LinkedHashMap<>();
        map.put("netease", builtin("netease", "网易云", "网易云音乐 App", "http://127.0.0.1:3010", "/login/status", "scripts/netease-api-server.cjs", List.of()));
        map.put("qq", builtin("qq", "QQ音乐", "QQ音乐 App", "http://127.0.0.1:3011", "/getHotkey", "node_modules/@sansenjian/qq-music-api/dist/cli.js", List.of("serve", "--port", "${port}", "--json")));
        map.put("kugou", builtin("kugou", "酷狗音乐", "酷狗音乐 App", "http://127.0.0.1:3012", "/search/hot", "scripts/kugou-api-server.cjs", List.of("--port=${port}")));
        map.put("qishui", new ProviderConfig("qishui", "汽水音乐", "汽水音乐 App", "http://127.0.0.1:3013", "/health", true, false, false, false, "builtin-slot", "", null));
        return map;
    }

    private ProviderConfig builtin(String id, String label, String appName, String baseUrl, String healthPath, String entry, List<String> args) {
        Launcher launcher = new Launcher("node", entry, args);
        return new ProviderConfig(id, label, appName, baseUrl, healthPath, true, true, true, true, "builtin", "", launcher);
    }

    private List<Path> extractZip(InputStream input, Path staging) throws IOException {
        List<Path> manifests = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        long total = 0;
        int count = 0;
        try (ZipInputStream zip = new ZipInputStream(new BoundedInputStream(input, MAX_ZIP_BYTES), StandardCharsets.UTF_8)) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                count++;
                if (count > MAX_ZIP_ENTRIES) throw new IllegalArgumentException("ZIP API package has too many entries");
                String name = validateZipName(entry.getName(), seen);
                Path target = staging.resolve(name).normalize();
                if (!target.startsWith(staging)) throw new IllegalArgumentException("ZIP API package contains an unsafe path");
                if (entry.isDirectory()) {
                    Files.createDirectories(target);
                    zip.closeEntry();
                    continue;
                }
                String fileName = target.getFileName().toString().toLowerCase(Locale.ROOT);
                boolean manifestFile = PACKAGE_MANIFESTS.contains(fileName);
                long entryLimit = manifestFile ? MAX_JSON_BYTES : MAX_ENTRY_BYTES;
                if (entry.getSize() > entryLimit) throw new IllegalArgumentException(manifestFile
                    ? "music API package manifest exceeds 64 KB"
                    : "ZIP API package entry is too large");
                if (entry.getCompressedSize() > 0 && entry.getSize() > entry.getCompressedSize() * 100L) {
                    throw new IllegalArgumentException("ZIP API package compression ratio is unsafe");
                }
                Files.createDirectories(target.getParent());
                long entryBytes = 0;
                byte[] buffer = new byte[64 * 1024];
                try (var output = Files.newOutputStream(target, StandardOpenOption.CREATE_NEW)) {
                    int read;
                    while ((read = zip.read(buffer)) >= 0) {
                        entryBytes += read;
                        total += read;
                        if (entryBytes > entryLimit || total > MAX_EXTRACTED_BYTES) {
                            throw new IllegalArgumentException("ZIP API package expands beyond the safety limit");
                        }
                        output.write(buffer, 0, read);
                    }
                }
                if (manifestFile) manifests.add(target);
                zip.closeEntry();
            }
        }
        return manifests;
    }

    private static String validateZipName(String raw, Set<String> seen) {
        if (raw == null || raw.isBlank()) throw new IllegalArgumentException("ZIP API package contains an empty path");
        String name = raw.replace('\\', '/');
        if (name.startsWith("/") || name.startsWith("//") || name.matches("^[A-Za-z]:.*") || name.contains(":")) {
            throw new IllegalArgumentException("ZIP API package contains an absolute or device path");
        }
        for (String part : name.split("/")) {
            if (part.isBlank() || ".".equals(part) || "..".equals(part) || part.endsWith(" ") || part.endsWith(".")) {
                throw new IllegalArgumentException("ZIP API package contains an unsafe path segment");
            }
            String stem = part.toLowerCase(Locale.ROOT).split("\\.", 2)[0];
            if (WINDOWS_RESERVED.contains(stem)) throw new IllegalArgumentException("ZIP API package contains a reserved Windows path");
        }
        String key = name.toLowerCase(Locale.ROOT);
        if (!seen.add(key)) throw new IllegalArgumentException("ZIP API package contains duplicate paths");
        return name;
    }

    private boolean isReachable(ProviderConfig config) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(config.baseUrl() + config.healthPath()))
                .timeout(Duration.ofSeconds(2))
                .GET()
                .build();
            HttpResponse<Void> response = http.send(request, HttpResponse.BodyHandlers.discarding());
            return response.statusCode() >= 200 && response.statusCode() < 300;
        } catch (IOException | InterruptedException | IllegalArgumentException error) {
            if (error instanceof InterruptedException) Thread.currentThread().interrupt();
            return false;
        }
    }

    private Path packageRoot(ProviderConfig config) {
        if (config.packageDirectory().isBlank()) return paths.root.toAbsolutePath().normalize();
        Path root = packagesDir.resolve(config.packageDirectory()).normalize();
        if (!root.startsWith(packagesDir)) throw new IllegalArgumentException("music API package path escapes the package directory");
        return root;
    }

    private String expandArgument(String argument, ProviderConfig config, Path working) {
        return argument
            .replace("${port}", String.valueOf(URI.create(config.baseUrl()).getPort()))
            .replace("${root}", paths.root.toString())
            .replace("${package}", working.toString());
    }

    private static String javaExecutable() {
        String home = System.getProperty("java.home", "");
        Path java = Path.of(home, "bin", System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win") ? "java.exe" : "java");
        return Files.isRegularFile(java) ? java.toString() : "java";
    }

    private String nodeExecutable() {
        List<Path> candidates = new ArrayList<>();
        candidates.add(paths.root.resolve("runtime").resolve("node").resolve("node.exe"));
        String programFiles = System.getenv().getOrDefault("ProgramFiles", "");
        String programFilesX86 = System.getenv().getOrDefault("ProgramFiles(x86)", "");
        if (!programFiles.isBlank()) candidates.add(Path.of(programFiles, "nodejs", "node.exe"));
        if (!programFilesX86.isBlank()) candidates.add(Path.of(programFilesX86, "nodejs", "node.exe"));
        for (Path candidate : candidates) if (Files.isRegularFile(candidate)) return candidate.toString();
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win") ? "node.exe" : "node";
    }

    private static void destroyProcessTree(Process process) {
        List<ProcessHandle> descendants = process.descendants()
            .sorted(Comparator.comparingLong(ProcessHandle::pid).reversed())
            .toList();
        descendants.forEach(handle -> {
            try { handle.destroy(); } catch (RuntimeException ignored) {}
        });
        try { process.destroy(); } catch (RuntimeException ignored) {}
        try {
            if (!process.waitFor(1, TimeUnit.SECONDS)) process.destroyForcibly();
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
        }
        descendants.forEach(handle -> {
            try {
                if (handle.isAlive()) handle.destroyForcibly();
            } catch (RuntimeException ignored) {
            }
        });
    }

    private static List<Map<String, Object>> providerMaps(Map<String, Object> root) {
        List<Map<String, Object>> items = new ArrayList<>();
        List<Object> providers = SimpleJson.asList(root.get("providers"));
        if (providers.isEmpty() && root.containsKey("id")) providers = List.of(root);
        for (Object item : providers) {
            Map<String, Object> map = SimpleJson.asMap(item);
            if (!map.isEmpty()) items.add(map);
        }
        return items;
    }

    private static Map<String, Object> parseConfigObject(String json) {
        String text = json == null ? "" : json.trim();
        if (!text.startsWith("{") || !text.endsWith("}")) throw new IllegalArgumentException("music API config must be a complete JSON object");
        Map<String, Object> root = SimpleJson.parseObjectStrict(text);
        if (root.isEmpty()) throw new IllegalArgumentException("music API config is empty or invalid");
        return root;
    }

    private void cleanupReplacedPackage(ProviderConfig previous, ProviderConfig replacement) {
        if (previous == null || previous.packageDirectory().isBlank()
            || previous.packageDirectory().equals(replacement.packageDirectory())) return;
        String rootName = previous.packageDirectory().replace('\\', '/').split("/", 2)[0];
        if (rootName.isBlank()) return;
        Path root = packagesDir.resolve(rootName).normalize();
        if (root.startsWith(packagesDir) && !root.equals(packagesDir)) deleteTree(root);
    }

    private static String readJson(InputStream input, int maximum) throws IOException {
        byte[] bytes = input.readNBytes(maximum + 1);
        if (bytes.length > maximum) throw new IllegalArgumentException("music API config exceeds 64 KB");
        return new String(bytes, StandardCharsets.UTF_8);
    }

    private static List<String> stringList(Object value) {
        List<String> values = new ArrayList<>();
        for (Object item : SimpleJson.asList(value)) values.add(SimpleJson.asString(item, ""));
        return values;
    }

    private static String validateBaseUrl(String value) {
        try {
            URI uri = URI.create(value == null ? "" : value.trim());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            if (!"http".equals(scheme) || !("127.0.0.1".equals(host) || "localhost".equals(host) || "::1".equals(host))
                || uri.getPort() < 1024 || uri.getPort() > 65535 || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null || (uri.getPath() != null && !uri.getPath().isBlank() && !"/".equals(uri.getPath()))) {
                throw new IllegalArgumentException("music API baseUrl must be an explicit local http port");
            }
            return "http://127.0.0.1:" + uri.getPort();
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("invalid music API baseUrl: " + value);
        }
    }

    private static String validateHealthPath(String value) {
        String path = value == null || value.isBlank() ? "/" : value.trim();
        if (!path.startsWith("/") || path.length() > 128 || path.contains("..") || path.contains("://") || path.contains("?") || path.contains("#")) {
            throw new IllegalArgumentException("invalid music API healthPath");
        }
        return path;
    }

    private static String normalizePackageDirectory(String value) {
        String path = value == null ? "" : value.trim().replace('\\', '/');
        if (path.isBlank()) return "";
        if (unsafeRelativePath(path)) throw new IllegalArgumentException("invalid music API package path");
        return path;
    }

    private static boolean unsafeRelativePath(String path) {
        String value = path == null ? "" : path.replace('\\', '/');
        if (value.isBlank() || value.startsWith("/") || value.matches("^[A-Za-z]:.*") || value.contains(":")) return true;
        for (String part : value.split("/")) if (part.isBlank() || ".".equals(part) || "..".equals(part)) return true;
        return false;
    }

    private static String normalizeId(String value) {
        return value == null || value.isBlank() ? "netease" : MusicProviderRegistry.normalize(value);
    }

    private static String normalizeSupportedId(String value) {
        String id = normalizeId(value);
        if (!SUPPORTED_IDS.contains(id)) throw new IllegalArgumentException("unsupported music provider: " + id);
        return id;
    }

    private static String boundedText(Object value, String fallback, int maximum) {
        String text = SimpleJson.asString(value, fallback).trim();
        if (text.isBlank()) text = fallback;
        if (text.length() > maximum) throw new IllegalArgumentException("music API label is too long");
        return text;
    }

    private static String baseUrlEnvironment(String id) {
        return switch (id) {
            case "netease" -> "FE_NETEASE_BASE_URL";
            case "qq" -> "FE_QQ_BASE_URL";
            case "kugou" -> "FE_KUGOU_BASE_URL";
            case "qishui" -> "FE_QISHUI_BASE_URL";
            default -> "";
        };
    }

    private static String autostartEnvironment(String id) {
        return "FE_" + id.toUpperCase(Locale.ROOT) + "_AUTOSTART";
    }

    private static boolean disabled(String environment) {
        String value = System.getenv().getOrDefault(environment, "");
        return "0".equals(value) || "false".equalsIgnoreCase(value) || "no".equalsIgnoreCase(value);
    }

    private static void deleteTree(Path root) {
        if (root == null || !Files.exists(root)) return;
        try (var paths = Files.walk(root)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try { Files.deleteIfExists(path); } catch (IOException ignored) {}
            });
        } catch (IOException ignored) {
        }
    }

    public record Launcher(String runtime, String entry, List<String> args) {
        public Map<String, Object> toMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("runtime", runtime);
            map.put("entry", entry);
            map.put("args", args);
            return map;
        }
    }

    public record ProviderConfig(
        String id,
        String label,
        String appName,
        String baseUrl,
        String healthPath,
        boolean enabled,
        boolean configured,
        boolean autostart,
        boolean loginQr,
        String source,
        String packageDirectory,
        Launcher launcher
    ) {
        public ProviderConfig withBaseUrl(String value) {
            return new ProviderConfig(id, label, appName, value, healthPath, enabled, configured, autostart, loginQr, source, packageDirectory, launcher);
        }

        public Map<String, Object> toMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("id", id);
            map.put("label", label);
            map.put("appName", appName);
            map.put("baseUrl", baseUrl);
            map.put("healthPath", healthPath);
            map.put("enabled", enabled);
            map.put("configured", configured);
            map.put("autostart", autostart);
            map.put("loginQr", loginQr);
            map.put("source", source);
            if (!packageDirectory.isBlank()) map.put("package", packageDirectory);
            if (launcher != null) map.put("launcher", launcher.toMap());
            return map;
        }
    }

    public record ImportResult(List<ProviderConfig> providers, boolean packageImport) {
        public List<Map<String, Object>> payloadProviders() {
            List<Map<String, Object>> items = new ArrayList<>();
            for (ProviderConfig config : providers) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("id", config.id());
                item.put("label", config.label());
                items.add(item);
            }
            return items;
        }
    }

    private static final class BoundedInputStream extends FilterInputStream {
        private final long maximum;
        private long read;

        private BoundedInputStream(InputStream input, long maximum) {
            super(input);
            this.maximum = maximum;
        }

        @Override
        public int read() throws IOException {
            int value = super.read();
            if (value >= 0) add(1);
            return value;
        }

        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            int count = super.read(buffer, offset, length);
            if (count > 0) add(count);
            return count;
        }

        private void add(long count) {
            read += count;
            if (read > maximum) throw new IllegalArgumentException("ZIP API package exceeds 25 MB");
        }
    }
}
