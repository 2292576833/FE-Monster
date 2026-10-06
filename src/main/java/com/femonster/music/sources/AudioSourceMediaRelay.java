package com.femonster.music.sources;

import com.femonster.http.HttpUtil;
import com.femonster.json.SimpleJson;
import com.sun.net.httpserver.HttpExchange;
import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.LongSupplier;

/** Opaque local tickets prevent downstream decoders from re-resolving untrusted DNS. */
final class AudioSourceMediaRelay implements AutoCloseable {
    private static final long TTL_NANOS = TimeUnit.MINUTES.toNanos(30);
    private final Path node;
    private final Path entry;
    private final LongSupplier clock;
    private final Map<String,Ticket> tickets = new LinkedHashMap<>();
    private final Set<Process> processes = ConcurrentHashMap.newKeySet();
    private final Semaphore slots = new Semaphore(4);
    private final SecureRandom random = new SecureRandom();
    private final ScheduledExecutorService deadline = Executors.newScheduledThreadPool(1, action -> daemon(action, "fe-source-media-deadline"));
    private final ExecutorService headerReaders = Executors.newFixedThreadPool(4, action -> daemon(action, "fe-source-media-header"));
    private volatile int localPort;
    private volatile boolean closed;

    AudioSourceMediaRelay(Path root) {
        this(root == null ? null : LxProcessRunner.findNode(root), root == null ? null : root.resolve("native/audio-sources/media-relay.mjs").toAbsolutePath().normalize(), System::nanoTime);
    }
    // Package-private fixture constructor. HTTP/import/settings never select a launcher or clock.
    AudioSourceMediaRelay(Path node,Path entry,LongSupplier clock) {
        this.node=node; this.entry=entry; this.clock=clock;
    }
    private static Thread daemon(Runnable action,String name) { Thread thread = new Thread(action,name); thread.setDaemon(true); return thread; }
    void setLocalPort(int port) { if (port < 1 || port > 65535) throw new IllegalArgumentException("AUDIO_SOURCE_PORT_INVALID"); localPort = port; }

    synchronized String issue(String url, List<String> allowedHosts) {
        if (closed || localPort == 0) throw new IllegalArgumentException("AUDIO_SOURCE_MEDIA_UNAVAILABLE");
        expire();
        while (tickets.size() >= 128) tickets.remove(tickets.keySet().iterator().next());
        byte[] secret = new byte[32]; random.nextBytes(secret);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(secret);
        tickets.put(token, new Ticket(url, List.copyOf(allowedHosts), clock.getAsLong() + TTL_NANOS));
        return "http://127.0.0.1:" + localPort + "/api/audio-sources/media?ticket=" + token;
    }
    private synchronized Ticket lookup(String query) {
        expire();
        if (query == null || !query.matches("ticket=[A-Za-z0-9_-]{43}")) return null;
        return tickets.get(query.substring(7));
    }
    private void expire() { long now = clock.getAsLong(); tickets.values().removeIf(ticket -> now >= ticket.expires); }

    void serve(HttpExchange exchange) throws IOException {
        String method = exchange.getRequestMethod();
        if (!method.equals("GET") && !method.equals("HEAD")) { fail(exchange,405); return; }
        Ticket ticket = lookup(exchange.getRequestURI().getRawQuery());
        if (closed || ticket == null) { fail(exchange,404); return; }
        String range = exchange.getRequestHeaders().getFirst("Range");
        if (range != null && (!range.matches("bytes=(?:[0-9]{1,15}-[0-9]{0,15}|-[0-9]{1,15})") || range.length() > 40)) { fail(exchange,416); return; }
        if (node == null || entry == null || !Files.isRegularFile(entry)) { fail(exchange,503); return; }
        if (!slots.tryAcquire()) { fail(exchange,503); return; }
        Process process = null;
        ScheduledFuture<?> timeout = null;
        Future<Map<String,Object>> header = null;
        boolean headersSent = false;
        try {
            ProcessBuilder builder = new ProcessBuilder(node.toString(), "--max-old-space-size=96", entry.toString());
            builder.directory(entry.getParent().toFile());
            builder.redirectError(ProcessBuilder.Redirect.DISCARD);
            String systemRoot = System.getenv("SystemRoot");
            builder.environment().clear();
            if (systemRoot != null) builder.environment().put("SystemRoot", systemRoot);
            builder.environment().put("LANG", "C.UTF-8");
            process = builder.start();
            processes.add(process);
            Process child = process;
            if (closed) throw new IOException();
            timeout = deadline.schedule(() -> kill(child), 1, TimeUnit.HOURS);
            Map<String,Object> request = new LinkedHashMap<>();
            request.put("url",ticket.url); request.put("allowedHosts",ticket.hosts); request.put("method",method);
            if (range != null) request.put("range",range);
            try (OutputStream stdin = process.getOutputStream()) { stdin.write(SimpleJson.stringify(request).getBytes(StandardCharsets.UTF_8)); }
            InputStream stdout = process.getInputStream();
            header = headerReaders.submit(() -> {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                for (int i=0;i<16384;i++) { int b = stdout.read(); if (b == '\n') return SimpleJson.parseObjectStrict(bytes.toString(StandardCharsets.UTF_8)); if (b < 0) throw new IOException(); bytes.write(b); }
                throw new IOException();
            });
            Map<String,Object> result = header.get(20,TimeUnit.SECONDS);
            if (!Boolean.TRUE.equals(result.get("ok"))) throw new IOException();
            int status = SimpleJson.asInt(result.get("status"), 502);
            if (!Set.of(200,206,416).contains(status)) throw new IOException();
            Map<String,Object> headers = SimpleJson.asMap(result.get("headers"));
            for (String key : List.of("content-type","content-length","content-range","accept-ranges")) {
                Object value = headers.get(key);
                if (value instanceof String text && text.length() < 1024 && !text.contains("\r") && !text.contains("\n")) exchange.getResponseHeaders().set(key,text);
            }
            String type = exchange.getResponseHeaders().getFirst("content-type");
            if (status != 416 && (type == null || (!type.toLowerCase(Locale.ROOT).startsWith("audio/") && !type.toLowerCase(Locale.ROOT).startsWith("application/octet-stream")))) throw new IOException();
            exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
            String lengthHeader = exchange.getResponseHeaders().getFirst("content-length");
            long length = lengthHeader != null && lengthHeader.matches("[0-9]{1,12}") ? Long.parseLong(lengthHeader) : 0;
            if (length > 512L * 1024 * 1024) throw new IOException();
            exchange.sendResponseHeaders(status, method.equals("HEAD") || status == 416 ? -1 : length);
            headersSent = true;
            if (!method.equals("HEAD") && status != 416) {
                long count = 0;
                byte[] buffer = new byte[32*1024];
                try (OutputStream output = exchange.getResponseBody()) {
                    int n;
                    while ((n = stdout.read(buffer)) != -1) { count += n; if (count > 512L*1024*1024) throw new IOException(); output.write(buffer,0,n); }
                }
            }
        } catch (InterruptedException error) { Thread.currentThread().interrupt(); if (!headersSent) fail(exchange,502); }
        catch (Exception error) { if (!headersSent) fail(exchange,502); }
        finally {
            if (process != null) { kill(process); processes.remove(process); }
            if (header != null) header.cancel(true);
            if (timeout != null) timeout.cancel(false);
            slots.release(); exchange.close();
        }
    }
    private static void fail(HttpExchange exchange,int status) throws IOException {
        // Headers from a rejected upstream envelope must not survive into the error response.
        for (String name : List.of("Content-Type","Content-Length","Content-Range","Accept-Ranges")) exchange.getResponseHeaders().remove(name);
        if (exchange.getRequestMethod().equals("HEAD")) { exchange.sendResponseHeaders(status,-1); exchange.close(); }
        else HttpUtil.sendJson(exchange,status,Map.of("ok",false,"error","AUDIO_SOURCE_MEDIA_UNAVAILABLE"));
    }
    private static void kill(Process process) {
        process.descendants().forEach(child -> { try { child.destroyForcibly(); } catch (RuntimeException ignored) {} });
        process.destroyForcibly();
        try { process.waitFor(500,TimeUnit.MILLISECONDS); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
        try { process.getInputStream().close(); } catch (IOException ignored) {}
    }
    @Override public synchronized void close() { closed=true; tickets.clear(); for (Process child:processes) kill(child); deadline.shutdownNow(); headerReaders.shutdownNow(); }
    private record Ticket(String url,List<String> hosts,long expires) {}
}
