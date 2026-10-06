package com.femonster.music.sources;

import com.femonster.core.ProjectPaths;
import com.femonster.json.SimpleJson;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;

/** Trusted fixed CLI only. No user-selected executable, arguments, working directory, or environment. */
final class LxProcessRunner implements AudioSourceService.Runner {
    private static final int MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
    private final Path node;
    private final Path entry;
    private final long timeoutMillis;
    private final boolean fixture;
    private final Semaphore slots = new Semaphore(2);
    private final Set<Process> processes = ConcurrentHashMap.newKeySet();
    private final ExecutorService io = Executors.newFixedThreadPool(4, action -> {
        Thread thread = new Thread(action, "fe-audio-source-io"); thread.setDaemon(true); return thread;
    });
    private volatile boolean closed;

    LxProcessRunner(ProjectPaths paths) {
        this(findNode(paths.root), paths.root.resolve("native/audio-sources/lx-runner.mjs").toAbsolutePath().normalize(), 18_000, false);
    }

    // Package-private subprocess fixture hook; never reachable from HTTP or settings.
    LxProcessRunner(Path node, Path entry, long timeoutMillis, boolean fixture) {
        this.node = node; this.entry = entry; this.timeoutMillis = timeoutMillis; this.fixture = fixture;
    }

    public boolean ready() {
        return !closed && node != null && Files.isRegularFile(node) && Files.isRegularFile(entry)
            && (fixture || (Files.isRegularFile(entry.getParent().resolve("node_modules/quickjs-emscripten/package.json"))
                && Files.isRegularFile(entry.getParent().resolve("node_modules/ipaddr.js/package.json"))
                && Files.isRegularFile(entry.getParent().resolve("node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm"))));
    }

    public Map<String,Object> run(Map<String,Object> input) {
        if (!ready()) return error("AUDIO_SOURCE_RUNTIME_UNAVAILABLE");
        if (!slots.tryAcquire()) return error("AUDIO_SOURCE_BUSY");
        Process process = null;
        Future<?> writer = null;
        Future<byte[]> reader = null;
        try {
            ProcessBuilder builder = new ProcessBuilder(node.toString(), "--max-old-space-size=96", entry.toString());
            builder.directory(entry.getParent().toFile());
            builder.redirectError(ProcessBuilder.Redirect.DISCARD);
            Map<String,String> environment = builder.environment();
            // Node preload hooks, proxy settings, FE tokens, cookies, and all other inherited secrets are absent.
            String systemRoot = System.getenv("SystemRoot");
            environment.clear();
            if (systemRoot != null) environment.put("SystemRoot", systemRoot);
            environment.put("LANG", "C.UTF-8");
            process = builder.start();
            processes.add(process);
            if (closed) return error("AUDIO_SOURCE_CLOSED");
            final Process child = process;
            final long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMillis);
            reader = io.submit(() -> {
                try (InputStream stream = child.getInputStream()) {
                    byte[] bytes = stream.readNBytes(MAX_OUTPUT_BYTES + 1);
                    if (bytes.length > MAX_OUTPUT_BYTES) { kill(child); throw new IOException("output limit"); }
                    return bytes;
                }
            });
            writer = io.submit(() -> {
                try (OutputStream stream = child.getOutputStream()) { stream.write(SimpleJson.stringify(input).getBytes(StandardCharsets.UTF_8)); }
                catch (IOException error) { throw new UncheckedIOException(error); }
            });
            writer.get(remaining(deadline), TimeUnit.NANOSECONDS);
            byte[] output = reader.get(remaining(deadline), TimeUnit.NANOSECONDS);
            if (!process.waitFor(remaining(deadline), TimeUnit.NANOSECONDS) || process.exitValue() != 0) return error("AUDIO_SOURCE_SCRIPT_FAILED");
            Map<String,Object> result = SimpleJson.parseObjectStrict(new String(output, StandardCharsets.UTF_8));
            if (!Boolean.TRUE.equals(result.get("ok")) && "inspect".equals(input.get("op")) && "INIT_NETWORK_REQUIRED".equals(result.get("code"))) {
                List<String> requiredHosts = AudioSourceService.initializationHosts(result.get("requiredHosts"));
                return Map.of("ok", false, "code", "AUDIO_SOURCE_INIT_NETWORK_REQUIRED", "error", "AUDIO_SOURCE_INIT_NETWORK_REQUIRED", "requiredHosts", requiredHosts);
            }
            if (!Boolean.TRUE.equals(result.get("ok"))) {
                boolean download = "download".equals(input.get("op"));
                String code = switch (String.valueOf(result.get("code"))) {
                    case "HOST_BLOCKED" -> "AUDIO_SOURCE_HOST_NOT_ALLOWED";
                    case "MEDIA_HOST_BLOCKED" -> "AUDIO_SOURCE_MEDIA_HOST_NOT_ALLOWED";
                    case "ADDRESS_BLOCKED" -> "AUDIO_SOURCE_ADDRESS_BLOCKED";
                    case "TIMEOUT" -> "AUDIO_SOURCE_TIMEOUT";
                    case "NETWORK_TIMEOUT", "DNS_FAILED" -> download ? "AUDIO_SOURCE_DOWNLOAD_TIMEOUT" : "AUDIO_SOURCE_NETWORK_TIMEOUT";
                    case "URL_BLOCKED" -> download ? "AUDIO_SOURCE_DOWNLOAD_URL_INVALID" : "AUDIO_SOURCE_INVALID_URL";
                    case "RESPONSE_SIZE" -> download ? "AUDIO_SOURCE_SCRIPT_INVALID" : "AUDIO_SOURCE_RESPONSE_UNSUPPORTED";
                    case "INVALID_UTF8" -> "AUDIO_SOURCE_INVALID_UTF8";
                    case "REDIRECT_BLOCKED" -> download ? "AUDIO_SOURCE_DOWNLOAD_REDIRECT" : "AUDIO_SOURCE_REDIRECT_BLOCKED";
                    case "ENCODING_UNSUPPORTED" -> download ? "AUDIO_SOURCE_DOWNLOAD_FAILED" : "AUDIO_SOURCE_RESPONSE_UNSUPPORTED";
                    case "NETWORK_FAILED" -> download ? "AUDIO_SOURCE_DOWNLOAD_FAILED" : "AUDIO_SOURCE_NETWORK_FAILED";
                    case "HTTP_STATUS" -> download ? "AUDIO_SOURCE_DOWNLOAD_FAILED" : "AUDIO_SOURCE_HTTP_ERROR";
                    case "DOWNLOAD_FAILED" -> "AUDIO_SOURCE_DOWNLOAD_FAILED";
                    case "REQUEST_UNSUPPORTED", "REQUEST_INVALID", "HEADER_BLOCKED", "REQUEST_SIZE", "REQUEST_LIMIT" -> "AUDIO_SOURCE_REQUEST_UNSUPPORTED";
                    case "UNSUPPORTED" -> "AUDIO_SOURCE_UNSUPPORTED";
                    case "SOURCE_REJECTED" -> "AUDIO_SOURCE_REJECTED";
                    default -> "AUDIO_SOURCE_SCRIPT_FAILED";
                };
                if (!download && Set.of("AUDIO_SOURCE_HOST_NOT_ALLOWED", "AUDIO_SOURCE_MEDIA_HOST_NOT_ALLOWED").contains(code) && result.containsKey("requiredHosts")) {
                    List<String> requiredHosts = AudioSourceService.initializationHosts(result.get("requiredHosts"));
                    return Map.of("ok", false, "code", code, "error", code, "requiredHosts", requiredHosts);
                }
                int httpStatus = "AUDIO_SOURCE_HTTP_ERROR".equals(code) ? AudioSourceService.safeHttpStatus(result.get("httpStatus")) : 0;
                if (httpStatus != 0) return Map.of("ok", false, "code", code, "error", code, "httpStatus", httpStatus);
                return error(code);
            }
            // Rebuild the response so no runner diagnostic text can reach API callers.
            if ("inspect".equals(input.get("op"))) return Map.of("ok", true, "sources", SimpleJson.asMap(result.get("sources")));
            if ("download".equals(input.get("op"))) {
                if (!(result.get("script") instanceof String script) || script.isBlank() || script.getBytes(StandardCharsets.UTF_8).length > AudioSourceService.MAX_SCRIPT_BYTES)
                    return error("AUDIO_SOURCE_SCRIPT_INVALID");
                return Map.of("ok", true, "script", script);
            }
            if (!(result.get("url") instanceof String url)) return error("AUDIO_SOURCE_SCRIPT_FAILED");
            return Map.of("ok", true, "url", url);
        } catch (TimeoutException error) { return error("AUDIO_SOURCE_TIMEOUT"); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); return error("AUDIO_SOURCE_INTERRUPTED"); }
        catch (Exception error) { return error("AUDIO_SOURCE_SCRIPT_FAILED"); }
        finally {
            if (process != null) { kill(process); processes.remove(process); }
            if (writer != null) writer.cancel(true);
            if (reader != null) reader.cancel(true);
            slots.release();
        }
    }

    private static long remaining(long deadline) throws TimeoutException { long left = deadline - System.nanoTime(); if (left <= 0) throw new TimeoutException(); return left; }
    private static Map<String,Object> error(String code) { return Map.of("ok", false, "code", code, "error", code); }
    private static void kill(Process process) {
        process.descendants().forEach(handle -> { try { handle.destroyForcibly(); } catch (RuntimeException ignored) {} });
        process.destroyForcibly();
        try { process.waitFor(500, TimeUnit.MILLISECONDS); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
        try { process.getInputStream().close(); } catch (IOException ignored) {}
        try { process.getOutputStream().close(); } catch (IOException ignored) {}
    }
    @Override public void close() { closed = true; for (Process process : processes) kill(process); io.shutdownNow(); }

    static Path findNode(Path root) {
        String executable = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).startsWith("windows") ? "node.exe" : "node";
        List<Path> candidates = new ArrayList<>();
        String override = System.getenv("FE_MONSTER_NODE");
        if (override != null && !override.isBlank()) candidates.add(Path.of(override));
        candidates.add(root.resolve("runtime/node").resolve(executable));
        candidates.add(root.resolve("runtime/node/bin").resolve(executable));
        String searchPath = System.getenv("PATH");
        for (String folder : (searchPath == null ? "" : searchPath).split(java.util.regex.Pattern.quote(File.pathSeparator))) {
            if (!folder.isBlank()) try { Path path = Path.of(folder); if (path.isAbsolute()) candidates.add(path.resolve(executable)); } catch (InvalidPathException ignored) {}
        }
        for (Path candidate : candidates) if (candidate.isAbsolute() && Files.isRegularFile(candidate)) return candidate.toAbsolutePath().normalize();
        return null;
    }
}
