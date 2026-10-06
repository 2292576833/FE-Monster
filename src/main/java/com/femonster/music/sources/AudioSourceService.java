package com.femonster.music.sources;

import com.femonster.core.ProjectPaths;
import com.femonster.json.SimpleJson;
import com.femonster.model.Song;
import com.femonster.music.MusicApiConfigService;
import com.femonster.music.PlaybackSource;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/** Local-only LX imports. Accounts and platform catalog clients are never exposed to scripts. */
public final class AudioSourceService implements AutoCloseable {
    public static final int MAX_SCRIPT_BYTES = 512 * 1024;
    private static final int MAX_SCRIPTS = 20;
    private static final long MAX_STORE_BYTES = 64L * 1024 * 1024; // JSON escaping can expand script bytes sixfold.
    private static final Map<String,String> SOURCES = Map.of("netease", "wy", "qq", "tx", "kugou", "kg");
    private static final Set<String> QUALITIES = Set.of("128k", "192k", "320k", "flac", "flac24bit", "wav", "ape");
    // Lossless formats share a rank; exact formats win, otherwise prefer FLAC, then WAV, then APE.
    private static final List<String> QUALITY_PREFERENCE = List.of("128k", "192k", "320k", "flac", "wav", "ape", "flac24bit");
    private final Path directory;
    private final Path settings;
    private final Supplier<?> builtins;
    private final Runner runner;
    private AudioSourceMediaRelay media;
    private final Map<String,Entry> entries = new LinkedHashMap<>();
    private final Map<String,Preview> previews = new LinkedHashMap<>();
    private static final long PREVIEW_LIFETIME_MS = 10 * 60 * 1000;
    private String selected = "builtin";
    private volatile boolean closed;

    interface Runner extends AutoCloseable {
        boolean ready();
        Map<String,Object> run(Map<String,Object> input);
        void close();
    }

    public AudioSourceService(ProjectPaths paths, MusicApiConfigService musicApis) throws IOException {
        this(paths.dataDir, () -> musicApis.redactedPayload().get("providers"), new LxProcessRunner(paths));
        this.media = new AudioSourceMediaRelay(paths.root);
    }

    AudioSourceService(Path dataDir, Supplier<?> builtins, Runner runner) throws IOException {
        this.directory = dataDir.toAbsolutePath().normalize().resolve("audio-sources");
        this.settings = directory.resolve("sources.json");
        this.builtins = builtins;
        this.runner = runner;
        this.media = new AudioSourceMediaRelay(null);
        if (Files.isSymbolicLink(directory)) throw failure("AUDIO_SOURCE_STORAGE");
        Files.createDirectories(directory);
        load();
    }

    public synchronized Map<String,Object> payload() {
        List<Map<String,Object>> custom = new ArrayList<>();
        for (Entry entry : entries.values()) custom.add(entry.publicMap());
        return Map.of("ok", true, "selected", selected, "runtimeReady", !closed && runner.ready(),
            "builtins", builtins.get(), "custom", custom, "selectedSource", selectedSource());
    }

    public synchronized Map<String,Object> selectedSource() {
        if ("builtin".equals(selected)) return Map.of("id", "builtin", "name", "内置音源", "builtin", true,
            "supportedProviders", List.of("netease", "qq", "kugou", "qishui"), "capabilities", Map.of());
        Map<String,Object> result = new LinkedHashMap<>(requireEntry(selected).publicMap());
        result.put("builtin", false);
        return result;
    }

    public synchronized Map<String,Object> previewUrl(Map<String,Object> input) {
        ensureOpen();
        requireOnly(input, Set.of("url"));
        URI uri = scriptUri(input.get("url"));
        if (!runner.ready()) throw failure("AUDIO_SOURCE_RUNTIME_UNAVAILABLE");
        Map<String,Object> downloaded = runner.run(Map.of("op", "download", "url", uri.toASCIIString()));
        if (!Boolean.TRUE.equals(downloaded.get("ok"))) throw failure(safeRunnerCode(downloaded));
        String script = validateScript(downloaded.get("script"));
        // Before consent the guest has no network allowlist, accounts, file or browser capabilities.
        Map<String,Object> inspection = runner.run(Map.of("op", "inspect", "script", script, "allowedHosts", List.of()));
        List<String> requiredHosts = List.of();
        Entry inspected;
        if (!Boolean.TRUE.equals(inspection.get("ok")) && "AUDIO_SOURCE_INIT_NETWORK_REQUIRED".equals(inspection.get("code"))) {
            requiredHosts = initializationHosts(inspection.get("requiredHosts"));
            inspected = entry(script, List.of(), Map.of());
        } else inspected = inspectedEntry(script, List.of(), inspection);
        long now = System.currentTimeMillis();
        previews.values().removeIf(preview -> preview.expiresAt <= now);
        while (previews.size() >= 3) previews.remove(previews.keySet().iterator().next());
        String token = UUID.randomUUID().toString();
        long expiresAt = now + PREVIEW_LIFETIME_MS;
        previews.put(token, new Preview(inspected, expiresAt, requiredHosts));
        Map<String,Object> summary = new LinkedHashMap<>(inspected.publicMap());
        summary.remove("id");
        summary.put("token", token);
        summary.put("sourceHost", uri.getHost().toLowerCase(Locale.ROOT));
        summary.put("bytes", script.getBytes(StandardCharsets.UTF_8).length);
        summary.put("expiresAt", expiresAt);
        if (!requiredHosts.isEmpty()) {
            summary.put("initializationRequired", true);
            summary.put("requiredHosts", requiredHosts);
            summary.put("status", "awaiting-network-consent");
        }
        return Map.of("ok", true, "preview", summary);
    }

    public synchronized Map<String,Object> importPreview(Map<String,Object> input) {
        ensureOpen();
        requireOnly(input, Set.of("token", "allowedHosts", "consent", "apply"));
        requireConsent(input);
        boolean apply = applyRequested(input);
        List<String> hosts = hosts(input.get("allowedHosts"));
        String token = text(input.get("token"));
        Preview preview = previews.get(token);
        if (preview == null || preview.expiresAt <= System.currentTimeMillis()) {
            previews.remove(token);
            throw failure("AUDIO_SOURCE_PREVIEW_EXPIRED");
        }
        Entry entry = preview.entry;
        if (!preview.requiredHosts.isEmpty()) {
            if (!hosts.containsAll(preview.requiredHosts)) throw failure("AUDIO_SOURCE_HOST_NOT_ALLOWED");
            entry = inspectEntry(entry.script, hosts);
        }
        Map<String,Object> result = saveEntry(new Entry(entry.id, entry.name, entry.version, entry.author,
            entry.script, hosts, entry.capabilities), apply);
        previews.remove(token);
        return result;
    }

    public synchronized Map<String,Object> importScript(Map<String,Object> input) {
        ensureOpen();
        requireOnly(input, Set.of("script", "allowedHosts", "consent", "apply"));
        requireConsent(input);
        boolean apply = applyRequested(input);
        String script = validateScript(input.get("script"));
        List<String> hosts = hosts(input.get("allowedHosts"));
        return saveEntry(inspectEntry(script, hosts), apply);
    }

    private Entry inspectEntry(String script, List<String> hosts) {
        if (!runner.ready()) throw failure("AUDIO_SOURCE_RUNTIME_UNAVAILABLE");
        Map<String,Object> inspected = runner.run(Map.of("op", "inspect", "script", script, "allowedHosts", hosts));
        return inspectedEntry(script, hosts, inspected);
    }

    private static Entry inspectedEntry(String script, List<String> hosts, Map<String,Object> inspected) {
        if (!Boolean.TRUE.equals(inspected.get("ok"))) throw failure(safeRunnerCode(inspected));
        Map<String,Object> capabilities = capabilities(inspected.get("sources"));
        if (capabilities.isEmpty()) throw failure("AUDIO_SOURCE_UNSUPPORTED");
        return entry(script, hosts, capabilities);
    }

    private static Entry entry(String script, List<String> hosts, Map<String,Object> capabilities) {
        String id = UUID.randomUUID().toString();
        return new Entry(id, metadata(script, "name", "Imported LX source"), metadata(script, "version", ""),
            metadata(script, "author", ""), script, hosts, capabilities);
    }

    private Map<String,Object> saveEntry(Entry entry, boolean apply) {
        if (!runner.ready()) throw failure("AUDIO_SOURCE_RUNTIME_UNAVAILABLE");
        if (entries.size() >= MAX_SCRIPTS) throw failure("AUDIO_SOURCE_LIMIT");
        Map<String,Entry> next = new LinkedHashMap<>(entries);
        next.put(entry.id, entry);
        String nextSelected = apply ? entry.id : selected;
        persist(next, nextSelected);
        entries.put(entry.id, entry);
        selected = nextSelected;
        return payload();
    }

    private static boolean applyRequested(Map<String,Object> input) {
        if (input.containsKey("apply") && !(input.get("apply") instanceof Boolean)) throw failure("AUDIO_SOURCE_FIELDS_INVALID");
        return Boolean.TRUE.equals(input.get("apply"));
    }

    private static void requireConsent(Map<String,Object> input) {
        if (!Boolean.TRUE.equals(input.get("consent"))) throw failure("AUDIO_SOURCE_CONSENT_REQUIRED");
    }

    private static URI scriptUri(Object value) {
        try {
            if (!(value instanceof String url) || url.isBlank() || url.length() > 8192 || url.matches("(?s).*[\\x00-\\x20\\x7f\\\\].*")) throw new IllegalArgumentException();
            URI uri = URI.create(url);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null
                || uri.getRawFragment() != null || uri.getPort() != -1 && uri.getPort() != 443
                || uri.getRawPath() == null || !uri.getRawPath().toLowerCase(Locale.ROOT).endsWith(".js")) throw new IllegalArgumentException();
            hosts(List.of(uri.getHost()));
            return uri;
        } catch (RuntimeException error) { throw failure("AUDIO_SOURCE_DOWNLOAD_URL_INVALID"); }
    }

    public synchronized Map<String,Object> select(String id) {
        ensureOpen();
        if (!"builtin".equals(id)) requireEntry(id);
        persist(entries, id);
        selected = id;
        return payload();
    }

    public synchronized Map<String,Object> remove(String id) {
        ensureOpen();
        requireEntry(id);
        Map<String,Entry> next = new LinkedHashMap<>(entries);
        next.remove(id);
        String nextSelected = selected.equals(id) ? "builtin" : selected;
        persist(next, nextSelected);
        entries.remove(id);
        selected = nextSelected;
        return payload();
    }

    public synchronized Map<String,Object> updateHosts(String id, Map<String,Object> input) {
        ensureOpen();
        requireOnly(input, Set.of("allowedHosts", "consent"));
        requireConsent(input);
        List<String> allowedHosts = hosts(input.get("allowedHosts"));
        Entry entry = requireEntry(id);
        Entry updated = new Entry(entry.id, entry.name, entry.version, entry.author, entry.script, allowedHosts, entry.capabilities);
        Map<String,Entry> next = new LinkedHashMap<>(entries);
        next.put(id, updated);
        persist(next, selected);
        entries.put(id, updated);
        return payload();
    }

    public PlaybackSource resolve(String provider, Song song, String quality, Supplier<PlaybackSource> builtin) {
        String id;
        synchronized (this) { id = selected; }
        return resolveId(id, provider, song, quality, builtin, true).source;
    }

    public Map<String,Object> test(String id, String provider, Song song, String quality, Supplier<PlaybackSource> builtin) {
        synchronized (this) { if (!"builtin".equals(id)) requireEntry(id); }
        Resolution resolution;
        boolean ok = true;
        try { resolution = resolveId(id, provider, song, quality, builtin, false); }
        catch (RuntimeException failure) { ok = false; resolution = unavailable(provider, quality, "AUDIO_SOURCE_RESOLVE_FAILED"); }
        PlaybackSource result = resolution.source;
        boolean resolved = result != null && result.playable() && !result.url().isBlank();
        String error = resolved ? "" : safeResolutionError(result);
        String requestedQuality = text(quality).isEmpty() ? "standard" : text(quality);
        String effectiveQuality = result == null || result.quality().isBlank() ? requestedQuality : result.quality();
        Map<String,Object> diagnostic = new LinkedHashMap<>();
        diagnostic.put("ok", ok);
        diagnostic.put("resolved", resolved);
        diagnostic.put("playable", false);
        diagnostic.put("error", error);
        diagnostic.put("requestedQuality", requestedQuality);
        diagnostic.put("effectiveQuality", effectiveQuality);
        diagnostic.put("qualityFallback", !Objects.equals(qualityType(requestedQuality), qualityType(effectiveQuality)));
        if (!resolved && !resolution.requiredHosts.isEmpty()) diagnostic.put("requiredHosts", resolution.requiredHosts);
        if (!resolved && resolution.httpStatus != 0) diagnostic.put("httpStatus", resolution.httpStatus);
        return diagnostic;
    }

    private Resolution resolveId(String id, String provider, Song song, String quality, Supplier<PlaybackSource> builtin, boolean ticket) {
        if (closed) return unavailable(provider, quality, "AUDIO_SOURCE_CLOSED");
        if (!SOURCES.containsKey(provider) && !"qishui".equals(provider)) return unavailable(provider, quality, "AUDIO_SOURCE_UNSUPPORTED_PROVIDER");
        if ("builtin".equals(id) || "qishui".equals(provider)) return new Resolution(builtin.get(), List.of());
        String effectiveQuality = quality;
        try {
            Entry entry;
            synchronized (this) { entry = requireEntry(id); }
            String source = SOURCES.get(provider);
            Map<String,Object> capability = SimpleJson.asMap(entry.capabilities.get(source));
            String type = negotiateQuality(qualityType(quality), list(capability.get("qualitys")));
            if (!list(capability.get("actions")).contains("musicUrl") || type.isEmpty())
                return unavailable(provider, quality, "AUDIO_SOURCE_UNSUPPORTED_QUALITY_OR_PROVIDER");
            effectiveQuality = providerQuality(provider, type);
            Map<String,Object> musicInfo = musicInfo(provider, song);
            Map<String,Object> result = runner.run(Map.of("op", "resolve", "script", entry.script, "allowedHosts", entry.hosts,
                "request", Map.of("source", source, "action", "musicUrl", "info", Map.of("type", type, "musicInfo", musicInfo))));
            if (!Boolean.TRUE.equals(result.get("ok"))) {
                String code = safeRunnerCode(result);
                return new Resolution(PlaybackSource.unavailable(provider, effectiveQuality, code), resolutionHosts(code, result.get("requiredHosts")),
                    "AUDIO_SOURCE_HTTP_ERROR".equals(code) ? safeHttpStatus(result.get("httpStatus")) : 0);
            }
            String url = text(result.get("url"));
            URI uri = URI.create(url);
            if (url.length() > 8192 || !"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null)
                return unavailable(provider, effectiveQuality, "AUDIO_SOURCE_INVALID_URL");
            if (!entry.hosts.contains(uri.getHost().toLowerCase(Locale.ROOT)))
                return new Resolution(PlaybackSource.unavailable(provider, effectiveQuality, "AUDIO_SOURCE_MEDIA_HOST_NOT_ALLOWED"),
                    resolutionHosts("AUDIO_SOURCE_MEDIA_HOST_NOT_ALLOWED", List.of(uri.getHost().toLowerCase(Locale.ROOT))));
            return new Resolution(PlaybackSource.fromUrl(provider, effectiveQuality, ticket ? media.issue(url, entry.hosts) : url), List.of());
        } catch (RuntimeException failure) {
            // Never forward script, subprocess, URL, parser, or filesystem exception text.
            return unavailable(provider, effectiveQuality, "AUDIO_SOURCE_RESOLVE_FAILED");
        }
    }

    private static Resolution unavailable(String provider, String quality, String code) {
        return new Resolution(PlaybackSource.unavailable(provider, quality, code), List.of());
    }

    private static List<String> resolutionHosts(String code, Object value) {
        if (!Set.of("AUDIO_SOURCE_HOST_NOT_ALLOWED", "AUDIO_SOURCE_MEDIA_HOST_NOT_ALLOWED").contains(code) || value == null) return List.of();
        try { return initializationHosts(value); }
        catch (IllegalArgumentException invalid) { return List.of(); }
    }

    static int safeHttpStatus(Object value) {
        if (!(value instanceof Number number)) return 0;
        double status = number.doubleValue();
        return Double.isFinite(status) && status >= 400 && status <= 599 && status == Math.floor(status) ? (int)status : 0;
    }

    private record Resolution(PlaybackSource source, List<String> requiredHosts, int httpStatus) {
        private Resolution(PlaybackSource source, List<String> requiredHosts) { this(source, requiredHosts, 0); }
    }

    static Map<String,Object> musicInfo(String provider, Song song) {
        if (song == null || !song.hasIdentity()) throw failure("AUDIO_SOURCE_SONG_REQUIRED");
        Map<String,Object> ref = song.sourceRef == null ? Map.of() : song.sourceRef;
        Map<String,Object> out = new LinkedHashMap<>();
        out.put("name", bounded(song.title, 512));
        out.put("singer", bounded(song.artist, 512));
        out.put("albumName", bounded(song.album, 512));
        out.put("interval", Math.max(0, song.duration));
        out.put("source", SOURCES.get(provider));
        String identity = first(ref, "providerSongId", "songId", "id");
        if (identity.isEmpty()) identity = bounded(song.id, 256);
        out.put("songmid", identity);
        if ("qq".equals(provider)) {
            String mid = first(ref, "songmid", "mid");
            if (mid.isEmpty()) mid = bounded(song.id, 256);
            String mediaMid = first(ref, "mediaMid", "media_mid");
            if (mediaMid.isEmpty()) mediaMid = mid;
            out.put("songmid", mid);
            out.put("strMediaMid", mediaMid);
            out.put("songId", first(ref, "qqId", "songId"));
            out.put("albumId", first(ref, "albumId", "album_id"));
        } else if ("kugou".equals(provider)) {
            String hash = first(ref, "hash");
            String audio = first(ref, "album_audio_id", "albumAudioId", "mixsongid", "audio_id");
            String album = first(ref, "album_id", "albumId");
            if (song.id.startsWith("kg|")) {
                String[] parts = song.id.split("\\|", -1);
                if (parts.length >= 4) { if (!parts[1].isBlank()) hash = bounded(parts[1],256); if (!parts[2].isBlank()) audio = bounded(parts[2],256); if (!parts[3].isBlank()) album = bounded(parts[3],256); }
            } else if (hash.isEmpty() && song.id.matches("(?i)[a-f0-9]{32}")) hash = song.id;
            if (hash.isBlank()) throw failure("AUDIO_SOURCE_SONG_ID_UNSUPPORTED");
            out.put("hash", hash);
            out.put("songmid", hash);
            out.put("albumAudioId", audio);
            out.put("albumId", album);
        }
        // Imported quality metadata is a whitelist, never arbitrary backup data.
        Map<String,Object> importedTypes = SimpleJson.asMap(ref.get("lxTypes"));
        Map<String,Object> typesByQuality = new LinkedHashMap<>();
        List<Map<String,Object>> types = new ArrayList<>();
        for (String quality : QUALITY_PREFERENCE) {
            Map<String,Object> item = SimpleJson.asMap(importedTypes.get(quality));
            String hash = first(item, "hash");
            String size = bounded(first(item, "size"), 32);
            Map<String,Object> detail = new LinkedHashMap<>();
            if (hash.matches("(?i)[a-f0-9]{32}")) detail.put("hash", hash);
            if (!size.isEmpty()) detail.put("size", size);
            if (detail.isEmpty()) continue;
            typesByQuality.put(quality, detail);
            Map<String,Object> type = new LinkedHashMap<>();
            type.put("type", quality);
            if (!size.isEmpty()) type.put("size", size);
            types.add(type);
        }
        if (!typesByQuality.isEmpty()) {
            out.put("_types", typesByQuality);
            out.put("types", types);
        }
        return out;
    }

    private static String qualityType(String quality) {
        String value = text(quality).toLowerCase(Locale.ROOT);
        return switch (value) {
            case "", "default", "standard", "normal", "128", "128k" -> "128k";
            case "higher", "192", "192k" -> "192k";
            case "exhigh", "high", "320", "320k" -> "320k";
            case "lossless", "flac" -> "flac";
            case "hires", "flac24bit" -> "flac24bit";
            default -> value;
        };
    }

    private static String negotiateQuality(String requested, List<?> declared) {
        if (!QUALITIES.contains(requested)) return "";
        if (declared.contains(requested)) return requested;
        int requestedRank = qualityRank(requested);
        String best = "", lowest = "";
        for (String candidate : QUALITY_PREFERENCE) {
            if (!declared.contains(candidate)) continue;
            int rank = qualityRank(candidate);
            if (lowest.isEmpty() || rank < qualityRank(lowest)) lowest = candidate;
            if (rank <= requestedRank && (best.isEmpty() || rank > qualityRank(best))) best = candidate;
        }
        return best.isEmpty() ? lowest : best;
    }

    private static int qualityRank(String type) {
        return switch (type) {
            case "128k" -> 0;
            case "192k" -> 1;
            case "320k" -> 2;
            case "flac", "wav", "ape" -> 3;
            case "flac24bit" -> 4;
            default -> -1;
        };
    }

    private static String providerQuality(String provider, String type) {
        if ("netease".equals(provider)) return switch (type) {
            case "128k" -> "standard";
            case "192k" -> "higher";
            case "320k" -> "exhigh";
            case "flac" -> "lossless";
            case "flac24bit" -> "hires";
            default -> type;
        };
        return switch (type) {
            case "128k" -> "128";
            case "192k" -> "192";
            case "320k" -> "320";
            case "flac24bit" -> "hires";
            default -> type;
        };
    }

    private synchronized Entry requireEntry(String id) {
        Entry entry = entries.get(id);
        if (entry == null) throw failure("AUDIO_SOURCE_NOT_FOUND");
        return entry;
    }

    private void load() throws IOException {
        if (!Files.exists(settings, LinkOption.NOFOLLOW_LINKS)) return;
        if (!Files.isRegularFile(settings, LinkOption.NOFOLLOW_LINKS) || Files.size(settings) > MAX_STORE_BYTES) throw failure("AUDIO_SOURCE_STORAGE");
        try {
            Map<String,Object> root = SimpleJson.parseObjectStrict(Files.readString(settings, StandardCharsets.UTF_8));
            if (!"fe.audio-sources/v1".equals(root.get("schema"))) throw failure("AUDIO_SOURCE_STORAGE");
            List<?> stored = list(root.get("custom"));
            if (stored.size() > MAX_SCRIPTS) throw failure("AUDIO_SOURCE_STORAGE");
            for (Object value : stored) {
                Map<String,Object> item = SimpleJson.asMap(value);
                String id = text(item.get("id"));
                if (!id.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}") || entries.containsKey(id)) throw failure("AUDIO_SOURCE_STORAGE");
                String script = validateScript(item.get("script"));
                entries.put(id, new Entry(id, metadata(script, "name", "Imported LX source"), metadata(script, "version", ""), metadata(script, "author", ""), script, hosts(item.get("allowedHosts")), capabilities(item.get("capabilities"))));
            }
            String requested = text(root.get("selected"));
            selected = entries.containsKey(requested) ? requested : "builtin";
        } catch (RuntimeException error) { throw failure("AUDIO_SOURCE_STORAGE_INVALID"); }
    }

    private void persist(Map<String,Entry> next, String selection) {
        Path temporary = null;
        try {
            if (Files.isSymbolicLink(directory) || Files.isSymbolicLink(settings)) throw failure("AUDIO_SOURCE_STORAGE");
            List<Map<String,Object>> items = new ArrayList<>();
            for (Entry entry : next.values()) { Map<String,Object> item = new LinkedHashMap<>(entry.publicMap()); item.put("script", entry.script); items.add(item); }
            temporary = Files.createTempFile(directory, "sources-", ".tmp");
            byte[] bytes = SimpleJson.stringify(Map.of("schema", "fe.audio-sources/v1", "selected", selection, "custom", items)).getBytes(StandardCharsets.UTF_8);
            Files.write(temporary, bytes);
            try (var channel = java.nio.channels.FileChannel.open(temporary, StandardOpenOption.WRITE)) { channel.force(true); }
            Files.move(temporary, settings, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException error) { throw failure("AUDIO_SOURCE_STORAGE"); }
        finally { if (temporary != null) try { Files.deleteIfExists(temporary); } catch (IOException ignored) {} }
    }

    static List<String> hosts(Object value) {
        if (!(value instanceof List<?> values) || values.size() > 32) throw failure("AUDIO_SOURCE_HOSTS_INVALID");
        Set<String> hosts = new LinkedHashSet<>();
        for (Object raw : values) {
            if (!(raw instanceof String)) throw failure("AUDIO_SOURCE_HOSTS_INVALID");
            String host = ((String)raw).toLowerCase(Locale.ROOT);
            if (host.length() > 253 || !host.matches("(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?")
                || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home") || host.endsWith(".home.arpa") || host.endsWith(".lan") || !hosts.add(host)) throw failure("AUDIO_SOURCE_HOSTS_INVALID");
        }
        return List.copyOf(hosts);
    }

    static List<String> initializationHosts(Object value) {
        try {
            List<String> required = hosts(value);
            if (required.isEmpty()) throw failure("AUDIO_SOURCE_SCRIPT_FAILED");
            return required;
        } catch (IllegalArgumentException invalid) { throw failure("AUDIO_SOURCE_SCRIPT_FAILED"); }
    }

    private static Map<String,Object> capabilities(Object value) {
        Map<String,Object> out = new LinkedHashMap<>();
        Map<String,Object> declared = SimpleJson.asMap(value);
        for (String source : List.of("wy", "tx", "kg")) {
            Map<String,Object> item = SimpleJson.asMap(declared.get(source));
            if (!list(item.get("actions")).contains("musicUrl")) continue;
            List<String> types = new ArrayList<>();
            for (Object quality : list(item.get("qualitys"))) if (quality instanceof String type && QUALITIES.contains(type) && !types.contains(type)) types.add(type);
            if (!types.isEmpty()) out.put(source, Map.of("actions", List.of("musicUrl"), "qualitys", List.copyOf(types)));
        }
        return Collections.unmodifiableMap(out);
    }

    private static String validateScript(Object value) {
        if (!(value instanceof String script) || script.isBlank() || script.getBytes(StandardCharsets.UTF_8).length > MAX_SCRIPT_BYTES) throw failure("AUDIO_SOURCE_SCRIPT_INVALID");
        for (int i=0;i<script.length();i++) if (Character.isSurrogate(script.charAt(i))) { if (!Character.isHighSurrogate(script.charAt(i)) || i+1 == script.length() || !Character.isLowSurrogate(script.charAt(++i))) throw failure("AUDIO_SOURCE_SCRIPT_INVALID"); }
        return script;
    }

    public static void requireOnly(Map<String,?> input, Set<String> fields) {
        if (input == null || !fields.containsAll(input.keySet())) throw failure("AUDIO_SOURCE_FIELDS_INVALID");
    }
    private static String metadata(String script, String name, String fallback) {
        var matcher = Pattern.compile("(?m)^\\s*(?:/\\*+|\\*|//)?\\s*@" + name + "[ \\t]+([^\\r\\n*]{1,120})").matcher(script.substring(0, Math.min(script.length(), 4096)));
        return matcher.find() ? matcher.group(1).trim() : fallback;
    }
    private static List<?> list(Object value) { return value instanceof List<?> items ? items : List.of(); }
    private static String safeRunnerCode(Map<String,Object> result) {
        String code = text(result.get("code"));
        return Set.of("AUDIO_SOURCE_TIMEOUT", "AUDIO_SOURCE_RUNTIME_UNAVAILABLE", "AUDIO_SOURCE_BUSY", "AUDIO_SOURCE_CLOSED", "AUDIO_SOURCE_HOST_NOT_ALLOWED", "AUDIO_SOURCE_MEDIA_HOST_NOT_ALLOWED", "AUDIO_SOURCE_ADDRESS_BLOCKED", "AUDIO_SOURCE_UNSUPPORTED", "AUDIO_SOURCE_DOWNLOAD_TIMEOUT", "AUDIO_SOURCE_DOWNLOAD_URL_INVALID", "AUDIO_SOURCE_DOWNLOAD_REDIRECT", "AUDIO_SOURCE_DOWNLOAD_FAILED", "AUDIO_SOURCE_SCRIPT_INVALID", "AUDIO_SOURCE_INVALID_UTF8", "AUDIO_SOURCE_INIT_NETWORK_REQUIRED", "AUDIO_SOURCE_NETWORK_TIMEOUT", "AUDIO_SOURCE_NETWORK_FAILED", "AUDIO_SOURCE_HTTP_ERROR", "AUDIO_SOURCE_REQUEST_UNSUPPORTED", "AUDIO_SOURCE_RESPONSE_UNSUPPORTED", "AUDIO_SOURCE_REDIRECT_BLOCKED", "AUDIO_SOURCE_INVALID_URL", "AUDIO_SOURCE_REJECTED").contains(code) ? code : "AUDIO_SOURCE_SCRIPT_FAILED";
    }
    private static String safeResolutionError(PlaybackSource result) {
        String code = result == null ? "" : result.error();
        return Set.of("AUDIO_SOURCE_TIMEOUT", "AUDIO_SOURCE_RUNTIME_UNAVAILABLE", "AUDIO_SOURCE_BUSY", "AUDIO_SOURCE_CLOSED", "AUDIO_SOURCE_HOST_NOT_ALLOWED", "AUDIO_SOURCE_MEDIA_HOST_NOT_ALLOWED", "AUDIO_SOURCE_ADDRESS_BLOCKED", "AUDIO_SOURCE_UNSUPPORTED", "AUDIO_SOURCE_UNSUPPORTED_PROVIDER", "AUDIO_SOURCE_UNSUPPORTED_QUALITY_OR_PROVIDER", "AUDIO_SOURCE_INVALID_URL", "AUDIO_SOURCE_SCRIPT_FAILED", "AUDIO_SOURCE_INIT_NETWORK_REQUIRED", "AUDIO_SOURCE_NETWORK_TIMEOUT", "AUDIO_SOURCE_NETWORK_FAILED", "AUDIO_SOURCE_HTTP_ERROR", "AUDIO_SOURCE_REQUEST_UNSUPPORTED", "AUDIO_SOURCE_RESPONSE_UNSUPPORTED", "AUDIO_SOURCE_REDIRECT_BLOCKED", "AUDIO_SOURCE_REJECTED").contains(code) ? code : "AUDIO_SOURCE_RESOLVE_FAILED";
    }
    private static String text(Object value) { return value instanceof String text ? text : ""; }
    private static String bounded(String value, int limit) { if (value == null) return ""; if (value.length() > limit) throw failure("AUDIO_SOURCE_SONG_INVALID"); return value; }
    private static String first(Map<String,Object> ref, String... names) { for (String name : names) { Object raw = ref.get(name); String value = raw instanceof String || raw instanceof Number ? String.valueOf(raw) : ""; if (!value.isBlank()) return bounded(value,256); } return ""; }
    private void ensureOpen() { if (closed) throw failure("AUDIO_SOURCE_CLOSED"); }
    static IllegalArgumentException failure(String code) { return new IllegalArgumentException(code); }
    public void setLocalPort(int port) { media.setLocalPort(port); }
    public void serveMedia(com.sun.net.httpserver.HttpExchange exchange) throws IOException { media.serve(exchange); }
    @Override public void close() { closed = true; runner.close(); media.close(); synchronized (this) { previews.clear(); } }

    private record Preview(Entry entry, long expiresAt, List<String> requiredHosts) {}

    private record Entry(String id, String name, String version, String author, String script, List<String> hosts, Map<String,Object> capabilities) {
        Map<String,Object> publicMap() {
            List<String> providers = new ArrayList<>();
            for (String provider : List.of("netease", "qq", "kugou")) if (capabilities.containsKey(SOURCES.get(provider))) providers.add(provider);
            return Map.of("id", id, "name", name, "version", version, "author", author, "allowedHosts", hosts,
                "supportedProviders", providers, "capabilities", capabilities, "status", "initialized-unverified");
        }
    }
}
