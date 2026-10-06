package com.femonster.music.sources;

import com.femonster.json.SimpleJson;
import com.femonster.model.Song;
import com.femonster.music.GenericMusicClient;
import com.femonster.music.PlaybackSource;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

/** Independent fixture probe: no external provider, account, or client data. */
public final class AudioSourceServiceProbe {
    private static int checks;
    private static void check(boolean pass, String reason) { checks++; if (!pass) throw new AssertionError(reason); }
    private static void rejected(Runnable action) { boolean rejected = false; try { action.run(); } catch (IllegalArgumentException expected) { rejected = true; } check(rejected, "expected bounded input rejection"); }
    private static void rejectedCode(Runnable action, String code) {
        try { action.run(); throw new AssertionError("expected " + code); }
        catch (IllegalArgumentException expected) { check(code.equals(expected.getMessage()), "expected fixed error " + code); }
    }
    public static void main(String[] args) throws Exception {
        Path data = Path.of(args[0]);
        java.util.concurrent.atomic.AtomicBoolean runtimeReady = new java.util.concurrent.atomic.AtomicBoolean(true);
        final Map<String,Object>[] request = new Map[]{Map.of()};
        AudioSourceService.Runner runner = new AudioSourceService.Runner() {
            public boolean ready() { return runtimeReady.get(); }
            public Map<String,Object> run(Map<String,Object> input) {
                request[0] = input;
                if ("download".equals(input.get("op"))) return Map.of("ok", true, "script", "/** @name URL fixture */\n// URL_SECRET_SCRIPT");
                if ("inspect".equals(input.get("op"))) return Map.of("ok", true, "sources", Map.of(
                    "wy", Map.of("actions", List.of("musicUrl"), "qualitys", List.of("128k", "320k", "flac")),
                    "tx", Map.of("actions", List.of("musicUrl"), "qualitys", List.of("128k")),
                    "kg", Map.of("actions", List.of("musicUrl"), "qualitys", List.of("128k"))));
                return Map.of("ok", true, "url", "https://audio.example.org/song.mp3");
            }
            public void close() {}
        };
        AtomicInteger builtins = new AtomicInteger();
        var builtin = (java.util.function.Supplier<PlaybackSource>) () -> { builtins.incrementAndGet(); return PlaybackSource.fromUrl("netease", "standard", "https://builtin.example.org/a"); };
        Song song = Song.fromMap(Map.of("id", "row-id", "sourceRef", Map.of("providerSongId", "456", "authorization", "ACCOUNT_SECRET")));
        String script = "/** @name Fixture */\n// SECRET_SCRIPT_CONTENT";
        var input = Map.<String,Object>of("script", script, "allowedHosts", List.of("music.example.org", "audio.example.org"), "consent", true);
        String id;
        try (var service = new AudioSourceService(data, () -> List.of(), runner)) {
            service.setLocalPort(17999);
            check("builtin".equals(service.payload().get("selected")), "default built-in");
            check(service.resolve("netease", song, "standard", builtin).playable() && builtins.get() == 1, "default supplier");
            rejected(() -> service.importScript(Map.of("script", script, "allowedHosts", List.of())));
            rejected(() -> service.importScript(Map.of("script", "x".repeat(512 * 1024 + 1), "allowedHosts", List.of(), "consent", true)));
            rejected(() -> service.importScript(Map.of("script", script, "allowedHosts", List.of("*.example.org"), "consent", true)));
            rejected(() -> service.importScript(Map.of("script", script, "allowedHosts", List.of("https://example.org"), "consent", true)));
            rejected(() -> service.importScript(Map.of("script", script, "allowedHosts", List.of("127.0.0.1"), "consent", true)));
            rejected(() -> service.importScript(Map.of("script", script, "allowedHosts", List.of(), "consent", true, "path", "elsewhere")));
            var payload = service.importScript(input);
            check(!SimpleJson.stringify(payload).contains("SECRET_SCRIPT_CONTENT"), "script not in payload");
            id = (String) SimpleJson.asMap(((List<?>)payload.get("custom")).get(0)).get("id");
            check("builtin".equals(payload.get("selected")), "import does not select");
            var result = service.test(id, "netease", song, "standard", builtin);
            check(Boolean.TRUE.equals(result.get("resolved")) && Boolean.FALSE.equals(result.get("playable")), "test checks resolution only");
            check(builtins.get() == 1 && "builtin".equals(service.payload().get("selected")), "explicit test without selecting");
            String json = SimpleJson.stringify(request[0]);
            check(json.contains("456") && !json.contains("ACCOUNT_SECRET") && !json.contains("authorization"), "identity whitelist");
            service.select(id);
            check(service.resolve("netease", song, "standard", builtin).playable(), "selected resolves");
            check(service.resolve("netease", song, "standard", builtin).url().startsWith("http://127.0.0.1:17999/api/audio-sources/media?ticket="), "custom URL is opaque local relay");
            var downgraded = service.resolve("netease", song, "hires", builtin);
            check(downgraded.playable() && "lossless".equals(downgraded.quality()), "higher requested quality uses best declared lower quality");
            check(service.resolve("qishui", song, "standard", builtin).playable() && builtins.get() == 2, "qishui stays builtin");
            check(!service.resolve("kuwo", song, "standard", builtin).playable(), "unsupported provider fails");
            song.sourceRef = Map.of("mediaMid", "QQMID", "qqId", "777", "cookie", "ACCOUNT_SECRET");
            check(service.resolve("qq", song, "128", builtin).playable(), "qq UI quality resolves");
            check(SimpleJson.stringify(request[0]).contains("QQMID") && !SimpleJson.stringify(request[0]).contains("ACCOUNT_SECRET"), "qq media identity");
            var catalogMapper = GenericMusicClient.class.getDeclaredMethod("songFromGeneric", Object.class);
            catalogMapper.setAccessible(true);
            Song qqCatalogSong = (Song) catalogMapper.invoke(new GenericMusicClient("qq", "QQ fixture", "https://catalog.example.org"),
                Map.of("mid", "TRACK_MID", "id", "777", "file", Map.of("media_mid", "MEDIA_MID")));
            check("TRACK_MID".equals(qqCatalogSong.id) && "MEDIA_MID".equals(qqCatalogSong.sourceRef.get("mediaMid")), "QQ catalog preserves distinct track and media identities");
            check(service.resolve("qq", qqCatalogSong, "standard", builtin).playable(), "QQ catalog row resolves through LX adapter");
            Map<String,Object> qqInfo = SimpleJson.asMap(SimpleJson.asMap(SimpleJson.asMap(request[0].get("request")).get("info")).get("musicInfo"));
            check("TRACK_MID".equals(qqInfo.get("songmid")), "LX songmid must retain QQ track MID rather than file media MID");
            check("MEDIA_MID".equals(qqInfo.get("strMediaMid")) && "777".equals(qqInfo.get("songId")), "LX media MID and numeric song ID remain separate");
            Song qqLegacySong = Song.fromMap(Map.of("id", "TRACK_ONLY"));
            check("TRACK_ONLY".equals(AudioSourceService.musicInfo("qq", qqLegacySong).get("songmid"))
                && "TRACK_ONLY".equals(AudioSourceService.musicInfo("qq", qqLegacySong).get("strMediaMid")), "QQ rows without file identity use track MID for both fields");
            Song qqExplicitSong = Song.fromMap(Map.of("id", "row-id", "sourceRef", Map.of("songmid", "EXPLICIT_TRACK", "mediaMid", "EXPLICIT_MEDIA")));
            check("EXPLICIT_TRACK".equals(AudioSourceService.musicInfo("qq", qqExplicitSong).get("songmid")), "explicit QQ track metadata takes precedence over local row ID");
            song.sourceRef = Map.of("hash", "0123456789ABCDEF0123456789ABCDEF", "album_audio_id", "888", "album_id", "999");
            check(service.resolve("kugou", song, "standard", builtin).playable(), "kugou resolves");
            check(SimpleJson.stringify(request[0]).contains("0123456789ABCDEF0123456789ABCDEF"), "kugou hash identity");
            song.sourceRef = Map.of("hash", "0123456789ABCDEF0123456789ABCDEF", "lxTypes", Map.of(
                "flac", Map.of("hash", "FEDCBA9876543210FEDCBA9876543210", "size", "24 MB", "url", "IMPORT_SECRET"),
                "unsupported", Map.of("size", "IMPORT_SECRET")));
            Map<String,Object> importedInfo = AudioSourceService.musicInfo("kugou", song);
            check("FEDCBA9876543210FEDCBA9876543210".equals(SimpleJson.asMap(SimpleJson.asMap(importedInfo.get("_types")).get("flac")).get("hash")), "LX imported quality hash reaches source adapter");
            check(SimpleJson.asList(importedInfo.get("types")).size() == 1, "only supported LX qualities are forwarded");
            check(!SimpleJson.stringify(importedInfo).contains("IMPORT_SECRET"), "LX backup URLs and arbitrary fields stay excluded");
        }
        try (var service = new AudioSourceService(data, () -> List.of(), runner)) {
            check(id.equals(service.payload().get("selected")), "selection survives reload");
            service.remove(id);
            check("builtin".equals(service.payload().get("selected")), "removal restores builtin");
            rejected(() -> service.remove("../../original.js"));
            for (int i = 0; i < 20; i++) service.importScript(input);
            rejected(() -> service.importScript(input));
        }
        Path urlData = data.resolve("url-import");
        String applied;
        try (var service = new AudioSourceService(urlData, () -> List.of(), runner)) {
            for (String url : List.of("http://example.org/a.js", "https://localhost/a.js", "https://127.0.0.1/a.js", "https://example.org/a.txt", "https://user:pass@example.org/a.js", "https://example.org:444/a.js", "https://example.org/a.js#fragment"))
                rejected(() -> service.previewUrl(Map.of("url", url)));
            var preview = service.previewUrl(Map.of("url", "https://scripts.example.org/a.js?secret=QUERY_SECRET"));
            check(!SimpleJson.stringify(preview).contains("SECRET"), "preview excludes source and URL query");
            check(((List<?>)service.payload().get("custom")).isEmpty() && "builtin".equals(service.payload().get("selected")), "preview does not import or select");
            check(List.of().equals(request[0].get("allowedHosts")), "preview inspect cannot use network");
            String token = (String)SimpleJson.asMap(preview.get("preview")).get("token");
            runtimeReady.set(false);
            rejected(() -> service.importPreview(Map.of("token", token, "allowedHosts", List.of("audio.example.org"), "consent", true, "apply", true)));
            check(((List<?>)service.payload().get("custom")).isEmpty() && "builtin".equals(service.payload().get("selected")), "runtime failure cannot partially import or select");
            runtimeReady.set(true);
            rejected(() -> service.importPreview(Map.of("token", token, "allowedHosts", List.of("audio.example.org"), "consent", false, "apply", true)));
            rejected(() -> service.importPreview(Map.of("token", token, "allowedHosts", List.of("audio.example.org"), "consent", true, "apply", "yes")));
            Path store = urlData.resolve("audio-sources/sources.json");
            Files.createDirectory(store);
            rejected(() -> service.importPreview(Map.of("token", token, "allowedHosts", List.of("audio.example.org"), "consent", true, "apply", true)));
            check(((List<?>)service.payload().get("custom")).isEmpty() && "builtin".equals(service.payload().get("selected")), "failed atomic persist keeps old list and selection");
            Files.delete(store);
            var imported = service.importPreview(Map.of("token", token, "allowedHosts", List.of("audio.example.org"), "consent", true, "apply", true));
            applied = (String)imported.get("selected");
            check(!"builtin".equals(applied) && ((List<?>)imported.get("custom")).size() == 1, "import and apply succeeds together");
            rejected(() -> service.importPreview(Map.of("token", token, "allowedHosts", List.of("audio.example.org"), "consent", true, "apply", true)));
            check(((List<?>)imported.get("custom")).size() == 1, "consumed token cannot duplicate import");
        }
        try (var service = new AudioSourceService(urlData, () -> List.of(), runner)) {
            check(applied.equals(service.payload().get("selected")), "URL import selection survives restart");
            check(((List<?>)service.selectedSource().get("supportedProviders")).contains("netease"), "selected capability getter");
            String oldest = (String)SimpleJson.asMap(service.previewUrl(Map.of("url", "https://scripts.example.org/old.js")).get("preview")).get("token");
            for (int i = 0; i < 3; i++) service.previewUrl(Map.of("url", "https://scripts.example.org/new" + i + ".js"));
            rejected(() -> service.importPreview(Map.of("token", oldest, "allowedHosts", List.of(), "consent", true)));
            check(applied.equals(service.payload().get("selected")), "evicted preview cannot change source");
            var localApplied = service.importScript(Map.of("script", script, "allowedHosts", List.of(), "consent", true, "apply", true));
            check(!applied.equals(localApplied.get("selected")) && !"builtin".equals(localApplied.get("selected")), "local import retains optional atomic apply");
        }
        networkInitializationPreview(data.resolve("network-initialization"));
        resolutionDiagnostics(data.resolve("resolution-diagnostics"));
        qualityNegotiation(data.resolve("quality-negotiation"));
        System.out.println("AudioSourceServiceProbe: " + checks + " checks passed");
    }

    private static void resolutionDiagnostics(Path data) throws Exception {
        var failure = new java.util.concurrent.atomic.AtomicReference<Map<String,Object>>(Map.of());
        AtomicInteger resolves = new AtomicInteger();
        var runner = new AudioSourceService.Runner() {
            public boolean ready() { return true; }
            public Map<String,Object> run(Map<String,Object> input) {
                if ("inspect".equals(input.get("op"))) return Map.of("ok", true, "sources", Map.of("wy", Map.of("actions", List.of("musicUrl"), "qualitys", List.of("128k"))));
                resolves.incrementAndGet(); return failure.get();
            }
            public void close() {}
        };
        try (var service = new AudioSourceService(data, () -> List.of(), runner)) {
            String id = (String)service.importScript(Map.of("script", "// diagnostic fixture", "allowedHosts", List.of("audio.example.org"), "consent", true, "apply", true)).get("selected");
            var song = Song.fromMap(Map.of("id", "1"));
            for (String code : List.of("AUDIO_SOURCE_HOST_NOT_ALLOWED", "AUDIO_SOURCE_MEDIA_HOST_NOT_ALLOWED")) {
                failure.set(Map.of("ok", false, "code", code, "requiredHosts", List.of("API.Example.org"), "error", "PRIVATE_URL?token=PRIVATE_SECRET"));
                var result = service.test(id, "netease", song, "standard", () -> { throw new AssertionError("builtin fallback"); });
                check(code.equals(result.get("error")), "missing-host classification survives service test");
                check(List.of("api.example.org").equals(result.get("requiredHosts")), "test returns only validated missing hostname");
                check(!SimpleJson.stringify(result).contains("PRIVATE") && Boolean.FALSE.equals(result.get("resolved")) && Boolean.FALSE.equals(result.get("playable")), "diagnostic response is private and unresolved");
            }
            check(resolves.get() == 2, "test does not execute source twice for diagnostics");
            failure.set(Map.of("ok", false, "code", "AUDIO_SOURCE_REJECTED", "requiredHosts", List.of("private.example.org"), "error", "PRIVATE_URL?token=PRIVATE_SECRET"));
            var rejected = service.test(id, "netease", song, "standard", () -> null);
            check(Map.of("ok", true, "resolved", false, "playable", false, "error", "AUDIO_SOURCE_REJECTED",
                "requestedQuality", "standard", "effectiveQuality", "standard", "qualityFallback", false).equals(rejected), "source rejection survives test without raw text or unrelated host details");
            check("AUDIO_SOURCE_REJECTED".equals(service.resolve("netease", song, "standard", () -> null).error()), "source rejection survives selected playback resolution");
            failure.set(Map.of("ok", false, "code", "AUDIO_SOURCE_HTTP_ERROR", "httpStatus", 502, "error", "PRIVATE_BODY", "url", "https://private.example.org/?token=PRIVATE"));
            var http = service.test(id, "netease", song, "standard", () -> null);
            check("AUDIO_SOURCE_HTTP_ERROR".equals(http.get("error")) && Integer.valueOf(502).equals(http.get("httpStatus")) && !SimpleJson.stringify(http).contains("PRIVATE"), "HTTP service failure preserves only fixed code and numeric status");
            check("AUDIO_SOURCE_HTTP_ERROR".equals(service.resolve("netease", song, "standard", () -> null).error()), "HTTP failure classification survives selected playback");
            for (Object status : List.of("502", "PRIVATE", 399, 600, 502.5, true, Map.of("status", 502))) {
                failure.set(Map.of("ok", false, "code", "AUDIO_SOURCE_HTTP_ERROR", "httpStatus", status));
                check(!service.test(id, "netease", song, "standard", () -> null).containsKey("httpStatus"), "invalid HTTP status rejected at service boundary");
            }
            failure.set(Map.of("ok", false, "code", "AUDIO_SOURCE_REJECTED", "httpStatus", 502));
            check(!service.test(id, "netease", song, "standard", () -> null).containsKey("httpStatus"), "unrelated error does not expose a status");
            for (String code : List.of("AUDIO_SOURCE_NETWORK_TIMEOUT", "AUDIO_SOURCE_NETWORK_FAILED", "AUDIO_SOURCE_REQUEST_UNSUPPORTED", "AUDIO_SOURCE_RESPONSE_UNSUPPORTED", "AUDIO_SOURCE_REDIRECT_BLOCKED")) {
                failure.set(Map.of("ok", false, "code", code, "requiredHosts", List.of("private.example.org"), "error", "PRIVATE_SECRET"));
                var result = service.test(id, "netease", song, "standard", () -> null);
                check(code.equals(result.get("error")) && !result.containsKey("requiredHosts"), "classified network failure survives without unrelated host details");
            }
            failure.set(Map.of("ok", false, "code", "AUDIO_SOURCE_HOST_NOT_ALLOWED", "requiredHosts", List.of("https://private.example.org/PRIVATE_PATH?secret=PRIVATE_QUERY")));
            var invalid = service.test(id, "netease", song, "standard", () -> null);
            check(!invalid.containsKey("requiredHosts") && !SimpleJson.stringify(invalid).contains("PRIVATE"), "invalid host detail cannot escape to callers");
            failure.set(Map.of("ok", true, "url", "https://cdn.example.org/PRIVATE_PATH?key=PRIVATE_QUERY"));
            var media = service.test(id, "netease", song, "standard", () -> null);
            check("AUDIO_SOURCE_MEDIA_HOST_NOT_ALLOWED".equals(media.get("error")) && List.of("cdn.example.org").equals(media.get("requiredHosts")), "Java media validation identifies its missing hostname");
            check(!SimpleJson.stringify(media).contains("PRIVATE"), "media diagnostics strip paths and queries");
        }
    }

    private static void qualityNegotiation(Path data) throws Exception {
        var declarations = new java.util.concurrent.atomic.AtomicReference<Map<String,Object>>();
        var lastRequest = new java.util.concurrent.atomic.AtomicReference<Map<String,Object>>();
        var response = new java.util.concurrent.atomic.AtomicReference<Map<String,Object>>(Map.of("ok", true, "url", "https://audio.example.org/song.mp3"));
        AtomicInteger resolves = new AtomicInteger();
        var runner = new AudioSourceService.Runner() {
            public boolean ready() { return true; }
            public Map<String,Object> run(Map<String,Object> input) {
                if ("inspect".equals(input.get("op"))) return Map.of("ok", true, "sources", declarations.get());
                lastRequest.set(input); resolves.incrementAndGet(); return response.get();
            }
            public void close() {}
        };
        var builtin = (java.util.function.Supplier<PlaybackSource>) () -> { throw new AssertionError("custom quality negotiation must never fall back to builtins"); };
        var song = Song.fromMap(Map.of("id", "1", "sourceRef", Map.of("hash", "0123456789ABCDEF0123456789ABCDEF")));
        try (var service = new AudioSourceService(data, () -> List.of(), runner)) {
            service.setLocalPort(17999);
            declarations.set(Map.of("wy", Map.of("actions", List.of("musicUrl"), "qualitys", List.of("128k")),
                "tx", Map.of("actions", List.of("musicUrl"), "qualitys", List.of("128k")),
                "kg", Map.of("actions", List.of("musicUrl"), "qualitys", List.of("128k"))));
            String id = (String)service.importScript(Map.of("script", "// 128k fixture", "allowedHosts", List.of("audio.example.org"), "consent", true, "apply", true)).get("selected");
            for (String provider : List.of("netease", "qq", "kugou")) {
                String expected = provider.equals("netease") ? "standard" : "128";
                for (String requested : List.of("lossless", "exhigh", "hires", "320", "flac24bit")) {
                    var source = service.resolve(provider, song, requested, builtin);
                    check(source.playable() && expected.equals(source.quality()), "128k-only source resolves " + provider + " " + requested + " with truthful playback quality");
                    check("128k".equals(SimpleJson.asMap(SimpleJson.asMap(lastRequest.get().get("request")).get("info")).get("type")), "script receives only its declared quality");
                }
                var result = service.test(id, provider, song, "lossless", builtin);
                check(Boolean.TRUE.equals(result.get("resolved")) && Boolean.TRUE.equals(result.get("qualityFallback"))
                    && "lossless".equals(result.get("requestedQuality")) && expected.equals(result.get("effectiveQuality")), "diagnostic explains actual negotiated quality without claiming playback");
                check(!SimpleJson.stringify(result).contains("https://") && Boolean.FALSE.equals(result.get("playable")), "quality diagnostics contain no media URL or playback guarantee");
                var alias = service.test(id, provider, song, "128k", builtin);
                check(Boolean.FALSE.equals(alias.get("qualityFallback")) && expected.equals(alias.get("effectiveQuality")), "quality alias normalization is not a downgrade");
            }
            int before = resolves.get();
            check(!service.resolve("netease", song, "unsupported-format", builtin).playable() && resolves.get() == before, "unknown quality cannot enter the script");
            response.set(Map.of("ok", false, "code", "AUDIO_SOURCE_HOST_NOT_ALLOWED", "requiredHosts", List.of("api.example.org")));
            var blocked = service.test(id, "netease", song, "lossless", builtin);
            check("AUDIO_SOURCE_HOST_NOT_ALLOWED".equals(blocked.get("error")) && List.of("api.example.org").equals(blocked.get("requiredHosts"))
                && Boolean.TRUE.equals(blocked.get("qualityFallback")) && "standard".equals(blocked.get("effectiveQuality")), "negotiation does not bypass host consent and reports effective quality on failure");
            response.set(Map.of("ok", true, "url", "http://audio.example.org/song.mp3"));
            check("AUDIO_SOURCE_INVALID_URL".equals(service.resolve("netease", song, "lossless", builtin).error()), "negotiation cannot allow HTTP media");
            response.set(Map.of("ok", true, "url", "https://audio.example.org/song.mp3"));
            String[][] cases = {
                {"128k,320k,flac", "higher", "128k", "standard"},
                {"128k,320k,flac", "hires", "flac", "lossless"},
                {"flac,320k", "standard", "320k", "exhigh"},
                {"ape,wav,flac24bit,flac", "wav", "wav", "wav"},
                {"ape,wav,flac24bit", "lossless", "wav", "wav"},
                {"ape,wav,flac", "hires", "flac", "lossless"},
                {"flac24bit,flac", "hires", "flac24bit", "hires"}
            };
            for (String[] row : cases) {
                declarations.set(Map.of("wy", Map.of("actions", List.of("musicUrl"), "qualitys", List.of(row[0].split(",")))));
                String onlyWy = (String)service.importScript(Map.of("script", "// quality fixture " + row[0], "allowedHosts", List.of("audio.example.org"), "consent", true, "apply", true)).get("selected");
                var source = service.resolve("netease", song, row[1], builtin);
                check(source.playable() && row[3].equals(source.quality()), "quality negotiation respects bitrate order and exact lossless formats");
                check(row[2].equals(SimpleJson.asMap(SimpleJson.asMap(lastRequest.get().get("request")).get("info")).get("type")), "quality ordering is independent of declaration order");
                before = resolves.get();
                var unsupported = service.test(onlyWy, "qq", song, "flac", builtin);
                check("AUDIO_SOURCE_UNSUPPORTED_QUALITY_OR_PROVIDER".equals(unsupported.get("error")) && resolves.get() == before, "supported quality cannot bypass unsupported provider");
            }
        }
    }

    private static void networkInitializationPreview(Path data) throws Exception {
        String pendingScript = "// @name Network initialization fixture\n// PRIVATE_STAGED_SCRIPT";
        AtomicInteger downloads = new AtomicInteger(), inspections = new AtomicInteger();
        var failInitialization = new java.util.concurrent.atomic.AtomicBoolean(true);
        var required = new java.util.concurrent.atomic.AtomicReference<Object>(List.of("init.example.org"));
        var runner = new AudioSourceService.Runner() {
            public boolean ready() { return true; }
            public Map<String,Object> run(Map<String,Object> input) {
                if ("download".equals(input.get("op"))) { downloads.incrementAndGet(); return Map.of("ok", true, "script", pendingScript); }
                if ("inspect".equals(input.get("op"))) {
                    inspections.incrementAndGet();
                    if (pendingScript.equals(input.get("script"))) {
                        if (List.of().equals(input.get("allowedHosts"))) return Map.of("ok", false, "code", "AUDIO_SOURCE_INIT_NETWORK_REQUIRED", "requiredHosts", required.get());
                        check(List.of("init.example.org", "audio.example.org").equals(input.get("allowedHosts")), "only consented hosts reach initialization");
                        if (failInitialization.get()) return Map.of("ok", false, "code", "AUDIO_SOURCE_TIMEOUT");
                    }
                    return Map.of("ok", true, "sources", Map.of("wy", Map.of("actions", List.of("musicUrl"), "qualitys", List.of("128k"))));
                }
                throw new AssertionError("unexpected runtime operation");
            }
            public void close() {}
        };
        try (var service = new AudioSourceService(data, () -> List.of(), runner)) {
            String originalId = (String)service.importScript(Map.of("script", "// existing source", "allowedHosts", List.of(), "consent", true, "apply", true)).get("selected");
            Path store = data.resolve("audio-sources/sources.json");
            String saved = Files.readString(store);
            var preview = SimpleJson.asMap(service.previewUrl(Map.of("url", "https://scripts.example.org/own.js?PRIVATE_QUERY")).get("preview"));
            check(Boolean.TRUE.equals(preview.get("initializationRequired")), "pending preview explicitly requires initialization");
            check("awaiting-network-consent".equals(preview.get("status")), "pending preview does not claim initialized status");
            check(List.of("init.example.org").equals(preview.get("requiredHosts")), "preview reports exact required domain");
            check(SimpleJson.asMap(preview.get("capabilities")).isEmpty() && ((List<?>)preview.get("supportedProviders")).isEmpty(), "pending capabilities are unknown");
            check(!SimpleJson.stringify(preview).contains("PRIVATE") && saved.equals(Files.readString(store)), "pending preview is private and never persists");
            String token = (String)preview.get("token");
            int inspectedBefore = inspections.get();
            rejectedCode(() -> service.importPreview(Map.of("token", token, "allowedHosts", List.of("init.example.org"), "consent", false)), "AUDIO_SOURCE_CONSENT_REQUIRED");
            rejectedCode(() -> service.importPreview(Map.of("token", token, "allowedHosts", List.of("audio.example.org"), "consent", true, "apply", true)), "AUDIO_SOURCE_HOST_NOT_ALLOWED");
            check(inspections.get() == inspectedBefore, "missing consent or required host cannot execute staged source");
            var consent = Map.<String,Object>of("token", token, "allowedHosts", List.of("init.example.org", "audio.example.org"), "consent", true, "apply", true);
            rejectedCode(() -> service.importPreview(consent), "AUDIO_SOURCE_TIMEOUT");
            check(saved.equals(Files.readString(store)) && originalId.equals(service.payload().get("selected")), "failed initialization preserves disk and previous selection");
            failInitialization.set(false);
            Path preserved = store.resolveSibling("previous-sources.json");
            Files.move(store, preserved); Files.createDirectory(store);
            rejectedCode(() -> service.importPreview(consent), "AUDIO_SOURCE_STORAGE");
            check(originalId.equals(service.payload().get("selected")) && ((List<?>)service.payload().get("custom")).size() == 1, "failed pending persistence leaves in-memory state intact");
            Files.delete(store); Files.move(preserved, store);
            var imported = service.importPreview(consent);
            check(!originalId.equals(imported.get("selected")) && ((List<?>)imported.get("custom")).size() == 2, "successful retry atomically imports and applies");
            check(downloads.get() == 1 && inspections.get() == inspectedBefore + 3, "retries inspect identical staged bytes without redownload");
            check(!SimpleJson.asMap(service.selectedSource().get("capabilities")).isEmpty(), "only initialized capabilities are saved");
            rejectedCode(() -> service.importPreview(consent), "AUDIO_SOURCE_PREVIEW_EXPIRED");
            required.set(List.of("https://init.example.org/PRIVATE_PATH?secret=PRIVATE_QUERY"));
            rejected(() -> service.previewUrl(Map.of("url", "https://scripts.example.org/invalid.js")));
            check(((List<?>)service.payload().get("custom")).size() == 2, "invalid required-host output cannot create an entry");
        }
    }
}
