package com.femonster.api;

import com.femonster.core.AppContext;
import com.femonster.core.AudioMixerService;
import com.femonster.core.ClientAiException;
import com.femonster.core.WallpaperService;
import com.femonster.desktop.LocalClientLauncher;
import com.femonster.http.HttpUtil;
import com.femonster.json.SimpleJson;
import com.femonster.model.Song;
import com.femonster.music.MusicProviderRegistry;
import com.femonster.netease.NeteaseClient;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.Channels;
import java.nio.channels.ReadableByteChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

public final class ApiRoutes {
    private static final String WALLPAPER_WEB_ENTRY_PREFIX = "/api/wallpapers/web-entry/";
    private static final String WALLPAPER_WEB_FILE_PREFIX = "/api/wallpapers/web/";
    private static final String WALLPAPER_WEB_HOST = "wallpaper.localhost";
    private static final String CREATIVE_MARKET_WORK_PREFIX = "/api/creative-market/works/";
    private static final String CREATIVE_MARKET_ASSET_PREFIX = "/api/creative-market/assets/";
    private static final String COMMUNITY_PET_AUDIO_PREFIX = "/api/community/pet/audio/";
    private static final long MAX_CREATIVE_MARKET_UPLOAD_BYTES = 512L * 1024 * 1024;
    private static final Duration COMMUNITY_SSE_IDLE_TIMEOUT = Duration.ofSeconds(75);
    private static final String COVER_CACHE_CONTROL = "private, max-age=86400, stale-while-revalidate=604800";
    private static final int MAX_QISHUI_LIBRARY_METADATA_BYTES = 2 * 1024 * 1024;
    private static final int MAX_AUDIO_MIXER_JSON_BYTES = 64 * 1024;
    private static final int NATIVE_SPATIAL_TRANSPORT_FRAMES = 4096;
    private static final ThreadLocal<ByteBuffer> NATIVE_SPATIAL_BLOCK_BUFFER =
        ThreadLocal.withInitial(() -> ByteBuffer.allocateDirect(
            NATIVE_SPATIAL_TRANSPORT_FRAMES * 2 * Float.BYTES
        ).order(ByteOrder.LITTLE_ENDIAN));
    private static final String WALLPAPER_WEB_CSP = String.join(" ",
        "sandbox allow-scripts allow-same-origin allow-forms allow-pointer-lock;",
        "default-src 'self' data: blob: https:;",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:;",
        "style-src 'self' 'unsafe-inline' data: blob: https:;",
        "img-src 'self' data: blob: https:;",
        "media-src 'self' data: blob: https:;",
        "font-src 'self' data: blob: https:;",
        "connect-src 'self' https: wss:;",
        "worker-src 'self' data: blob:;",
        "object-src 'none';",
        "base-uri 'self';",
        "form-action 'none';",
        "frame-ancestors http://127.0.0.1:* http://localhost:* http://[::1]:*;"
    );
    private final AppContext context;
    private final ClientAiHttpModule clientAiHttpModule;
    private final AudioStreamProxy audioStreamProxy = new AudioStreamProxy();
    private final AtomicBoolean quitRequested = new AtomicBoolean(false);

    private static final class CoverHttpClientHolder {
        private static final HttpClient INSTANCE = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(4))
            .build();
    }

    private static final class AudioMixerPersistenceException extends RuntimeException {
    }

    private ApiRoutes(AppContext context) {
        this.context = context;
        this.clientAiHttpModule = new ClientAiHttpModule(context.clientAi, context.clientTtsSessions);
    }

    public static void register(HttpServer server, AppContext context) {
        ApiRoutes routes = new ApiRoutes(context);
        server.createContext("/api/", routes::handle);
    }

    private void handle(HttpExchange exchange) throws IOException {
        try {
            String path = exchange.getRequestURI().getPath();
            String method = exchange.getRequestMethod().toUpperCase();
            if (isWallpaperWebHost(exchange)
                && (!"GET".equals(method) || !path.startsWith(WALLPAPER_WEB_FILE_PREFIX))) {
                HttpUtil.sendJson(exchange, 403, HttpUtil.error("isolated wallpaper origin"));
                return;
            }
            if (path.startsWith("/api/community/pet/") || "/api/community/events".equals(path)) {
                LocalPetAssistantGuard.require(exchange);
            }
            if (path.startsWith("/api/audio/mixer")) {
                LocalPetAssistantGuard.require(exchange);
            }
            if (HttpUtil.handleOptions(exchange)) return;
            Map<String, String> query = HttpUtil.query(exchange);
            if (clientAiHttpModule.tryHandle(exchange)) return;

            if ("/api/audio/stream".equals(path)) {
                audioStreamProxy.handle(exchange, query);
                return;
            }

            if ("GET".equals(method)) {
                handleGet(exchange, path, query);
                return;
            }

            if ("POST".equals(method)) {
                handlePost(exchange, path, query);
                return;
            }

            if ("PATCH".equals(method)) {
                handlePatch(exchange, path);
                return;
            }

            HttpUtil.sendJson(exchange, 405, HttpUtil.error("method not allowed"));
        } catch (AudioMixerService.RevisionConflictException e) {
            Map<String, Object> body = HttpUtil.error("audio mixer revision conflict");
            body.put("ok", false);
            body.put("errorCode", "audio_mixer_revision_conflict");
            body.put("currentRevision", e.currentRevision());
            HttpUtil.sendJson(exchange, 409, body);
        } catch (AudioMixerPersistenceException e) {
            Map<String, Object> body = HttpUtil.error("audio mixer state is unavailable");
            body.put("ok", false);
            body.put("errorCode", "audio_mixer_persistence_failed");
            HttpUtil.sendJson(exchange, 500, body);
        } catch (ClientAiException e) {
            Map<String, Object> body = HttpUtil.error(e.getMessage());
            body.put("errorCode", e.errorCode());
            HttpUtil.sendJson(exchange, e.status(), body);
        } catch (SecurityException e) {
            HttpUtil.sendJson(exchange, 403, HttpUtil.error(e.getMessage() == null ? "forbidden" : e.getMessage()));
        } catch (IllegalArgumentException e) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error(e.getMessage() == null ? "invalid request" : e.getMessage()));
        } catch (Exception e) {
            Map<String, Object> body = HttpUtil.error(e.getMessage() == null ? "internal error" : e.getMessage());
            HttpUtil.sendJson(exchange, 500, body);
        }
    }

    private void handleGet(HttpExchange exchange, String path, Map<String, String> query) throws IOException {
        if ("/api/app/preferences/bootstrap.js".equals(path)) {
            requireSameOriginClientPreferences(exchange);
            exchange.getResponseHeaders().set("Cache-Control", "no-store, max-age=0");
            HttpUtil.sendBytes(
                exchange,
                200,
                "text/javascript; charset=utf-8",
                context.clientPreferences.bootstrapScript().getBytes(StandardCharsets.UTF_8)
            );
            return;
        }
        if (path.startsWith(WALLPAPER_WEB_ENTRY_PREFIX)) {
            handleWallpaperWebEntry(exchange, path);
            return;
        }
        if (path.startsWith(WALLPAPER_WEB_FILE_PREFIX)) {
            if (!isWallpaperWebHost(exchange)) {
                HttpUtil.sendJson(exchange, 403, HttpUtil.error("web wallpaper resources require isolated origin"));
                return;
            }
            handleWallpaperWebFile(exchange, path);
            return;
        }
        if (path.startsWith(CREATIVE_MARKET_WORK_PREFIX)) {
            String workId = requireCreativePathId(path, CREATIVE_MARKET_WORK_PREFIX, "work-");
            HttpUtil.sendJson(exchange, context.community.creativeMarketWork(workId));
            return;
        }
        if (path.startsWith(CREATIVE_MARKET_ASSET_PREFIX)) {
            String assetId = requireCreativePathId(path, CREATIVE_MARKET_ASSET_PREFIX, "asset-");
            handleCreativeMarketAsset(exchange, assetId);
            return;
        }
        if (path.startsWith(COMMUNITY_PET_AUDIO_PREFIX)) {
            handleCommunityPetAudio(exchange, query, path.substring(COMMUNITY_PET_AUDIO_PREFIX.length()));
            return;
        }
        switch (path) {
            case "/api/app/version" -> HttpUtil.sendJson(exchange, appVersion());
            case "/api/app/machine" -> HttpUtil.sendJson(exchange, context.machine.payload());
            case "/api/app/runtime" -> HttpUtil.sendJson(exchange, LocalClientLauncher.runtimePayload(
                context.audioEngine.runtimePayload(),
                context.runtimeSettings.snapshot()
            ));
            case "/api/app/runtime/settings" -> HttpUtil.sendJson(exchange, context.runtimeSettings.snapshot());
            case "/api/app/preferences" -> {
                requireSameOriginClientPreferences(exchange);
                HttpUtil.sendJson(exchange, context.clientPreferences.snapshot());
            }
            case "/api/app/achievements" -> {
                requireSameOriginClientPreferences(exchange);
                HttpUtil.sendJson(exchange, achievementSnapshot(path, query));
            }
            case "/api/community/achievements" -> {
                requireSameOriginClientPreferences(exchange);
                HttpUtil.sendJson(exchange, achievementSnapshot(path, query));
            }
            case "/api/sandbox/assets" -> handleSandboxAsset(exchange, query);
            case "/api/sandbox/capabilities", "/api/sandbox/presets", "/api/sandbox/components",
                "/api/preset-market", "/api/component-market" ->
                HttpUtil.sendJson(exchange, context.community.sandboxGet(sandboxPath(path, query)));
            case "/api/creative-market" -> handleCreativeMarket(exchange, query);
            case "/api/creative-market/comments" -> HttpUtil.sendJson(
                exchange,
                context.community.creativeMarketComments(requireCreativeId(HttpUtil.param(query, "id", ""), "work-"))
            );
            case "/api/audio/runtime" -> HttpUtil.sendJson(exchange, context.audioEngine.runtimePayload());
            case "/api/audio/sample" -> HttpUtil.sendJson(exchange, context.audioEngine.samplePayload());
            case "/api/audio/mixer" -> HttpUtil.sendJson(exchange, context.audioMixer.snapshot());
            case "/api/audio/mixer/presets" -> HttpUtil.sendJson(exchange, context.audioMixer.presets());
            case "/api/audio/mixer/channels" -> HttpUtil.sendJson(
                exchange,
                context.audioMixer.channelSnapshot()
            );
            case "/api/audio/stream/status" -> HttpUtil.sendJson(exchange, audioStreamProxy.status());
            case "/api/audio/spatial/status" -> HttpUtil.sendJson(exchange, context.audioEngine.spatialPayload());
            case "/api/app/window/fullscreen" -> HttpUtil.sendJson(exchange, LocalClientLauncher.controlPayload("fullscreen"));
            case "/api/app/window/normal" -> HttpUtil.sendJson(exchange, LocalClientLauncher.controlPayload("normal"));
            case "/api/app/window/minimize" -> HttpUtil.sendJson(exchange, LocalClientLauncher.controlPayload("minimize"));
            case "/api/app/window/close" -> handleQuit(exchange, false);
            case "/api/app/quit", "/api/app/window/quit" -> handleQuit(exchange, true);
            case "/api/visual-bridge/health" -> HttpUtil.sendJson(exchange, context.visualBridge.health());
            case "/api/visual-bridge/state" -> HttpUtil.sendJson(exchange, context.visualBridge.state());
            case "/api/wallpapers" -> {
                requireLocalWallpaperControl(exchange);
                HttpUtil.sendJson(
                    exchange,
                    context.wallpapers.payload(Boolean.parseBoolean(HttpUtil.param(query, "scan", "true")))
                );
            }
            case "/api/wallpapers/scene" -> {
                requireLocalWallpaperControl(exchange);
                HttpUtil.sendJson(
                    exchange,
                    context.wallpapers.sceneInventory(
                        HttpUtil.param(query, "id", ""),
                        Boolean.parseBoolean(HttpUtil.param(query, "refresh", "false")),
                        HttpUtil.intParam(query, "offset", 0, 0, 16_384),
                        HttpUtil.intParam(query, "limit", 512, 0, 1_024)
                    )
                );
            }
            case "/api/wallpapers/file" -> {
                requireLocalWallpaperControl(exchange);
                handleWallpaperFile(exchange, query);
            }
            case "/api/user-cursors" -> HttpUtil.sendJson(exchange, context.userCursors.payload());
            case "/api/user-cursors/file" -> handleUserCursorFile(exchange, query);
            case "/api/providers" -> HttpUtil.sendJson(exchange, context.music.providersPayload());
            case "/api/music-apis" -> HttpUtil.sendJson(exchange, context.musicApis.redactedPayload());
            case "/api/music-apis/status" -> HttpUtil.sendJson(exchange, context.musicApis.refreshStatus(
                HttpUtil.param(query, "provider", "netease")
            ));
            case "/api/community/state" -> handleCommunityState(exchange, query);
            case "/api/community/messages" -> handleCommunityMessages(exchange, query);
            case "/api/community/nearby" -> handleCommunityNearby(exchange, query);
            case "/api/community/user" -> HttpUtil.sendJson(
                exchange,
                context.community.userProfile(requireFeId(HttpUtil.param(query, "id", "")))
            );
            case "/api/community/square/messages" -> handleCommunitySquareMessages(exchange, query);
            case "/api/community/listen/state" -> handleCommunityListenState(exchange, query);
            case "/api/community/listen/report" -> handleCommunityListenReport(exchange, query);
            case "/api/community/mailbox" -> handleCommunityMailbox(exchange, query);
            case "/api/community/identity-cards" -> handleCommunityIdentityCards(exchange, query);
            case "/api/community/friends/identity-card" -> handleCommunityFriendIdentityCard(exchange, query);
            case "/api/community/pet/status" -> handleCommunityPetStatus(exchange, query);
            case "/api/community/pet/history" -> handleCommunityPetHistory(exchange, query);
            case "/api/community/pet/memories" -> handleCommunityPetMemories(exchange, query);
            case "/api/community/pet/personalization" -> handleCommunityPetPersonalization(exchange, query);
            case "/api/community/call/signals" -> handleCommunityCallSignals(exchange, query);
            case "/api/community/events" -> handleCommunityEvents(exchange, query);
            case "/api/search", "/api/netease/search", "/api/qq/search", "/api/kugou/search", "/api/qishui/search" -> HttpUtil.sendJson(exchange, context.music.search(
                providerFrom(path, query),
                HttpUtil.param(query, "keyword", HttpUtil.param(query, "q", "")),
                HttpUtil.intParam(query, "page", 1, 1, 10000),
                HttpUtil.intParam(query, "limit", 20, 1, 50)
            ));
            case "/api/song/url", "/api/netease/song/url", "/api/qq/song/url", "/api/kugou/song/url", "/api/qishui/song/url" -> HttpUtil.sendJson(exchange, context.music.songUrlPayload(
                providerFrom(path, query),
                songFromQuery(query),
                HttpUtil.param(query, "quality", HttpUtil.param(query, "level", "standard"))
            ));
            case "/api/song/comments", "/api/netease/song/comments", "/api/qq/song/comments", "/api/kugou/song/comments" -> HttpUtil.sendJson(exchange, context.music.commentsPayload(
                providerFrom(path, query),
                songCommentId(query),
                HttpUtil.intParam(query, "limit", 20, 1, 80)
            ));
            case "/api/lyric", "/api/netease/lyric", "/api/qq/lyric", "/api/kugou/lyric" -> HttpUtil.sendJson(
                exchange,
                context.music.lyricPayload(
                    providerFrom(path, query),
                    HttpUtil.param(query, "id", ""),
                    HttpUtil.param(query, "title", ""),
                    HttpUtil.param(query, "artist", ""),
                    HttpUtil.intParam(query, "duration", 0, 0, 86400)
                )
            );
            case "/api/cover" -> handleCover(exchange, query);
            case "/api/login/status" -> HttpUtil.sendJson(exchange, context.music.accountPayload(providerFrom(path, query)));
            case "/api/netease/login/browser/status", "/api/qq/login/browser/status", "/api/kugou/login/browser/status" -> HttpUtil.sendJson(
                exchange,
                context.browserLogin.status(
                    providerFrom(path, query),
                    HttpUtil.param(query, "session", ""),
                    HttpUtil.longParam(query, "after", -1L, -1L, Long.MAX_VALUE),
                    HttpUtil.intParam(query, "waitMs", 0, 0, 15000)
                )
            );
            case "/api/netease/service/status", "/api/qq/service/status", "/api/kugou/service/status", "/api/qishui/service/status" -> HttpUtil.sendJson(exchange, context.music.serviceStatus(providerFrom(path, query)));
            case "/api/netease/login/status" -> HttpUtil.sendRawJson(exchange, 200, requireNetease().rawGet("/login/status"));
            case "/api/qq/login/status", "/api/kugou/login/status", "/api/qishui/login/status" -> HttpUtil.sendJson(exchange, context.music.accountPayload(providerFrom(path, query)));
            case "/api/qishui/local/status" -> HttpUtil.sendJson(exchange, context.music.localClientStatus("qishui"));
            case "/api/netease/user/playlists", "/api/qq/user/playlists", "/api/kugou/user/playlists", "/api/qishui/user/playlists" -> HttpUtil.sendJson(exchange, context.music.userPlaylistsPayload(providerFrom(path, query)));
            case "/api/user/playlists" -> HttpUtil.sendJson(exchange, SimpleJson.asList(context.music.userPlaylistsPayload(providerFrom(path, query)).get("playlists")));
            case "/api/recommend/playlists" -> HttpUtil.sendJson(exchange, context.music.recommendedPlaylistsPayload(
                providerFrom(path, query),
                HttpUtil.intParam(query, "limit", 12, 1, 30)
            ));
            case "/api/playlist/tracks", "/api/netease/playlist/tracks", "/api/qq/playlist/tracks", "/api/kugou/playlist/tracks", "/api/qishui/playlist/tracks" -> HttpUtil.sendJson(exchange, context.music.playlistTracksPayload(
                providerFrom(path, query),
                HttpUtil.param(query, "id", ""),
                HttpUtil.intParam(query, "limit", 0, 0, Integer.MAX_VALUE)
            ));
            case "/api/netease/daily/recommend" -> HttpUtil.sendJson(exchange, requireNetease().dailyRecommendPayload(
                HttpUtil.intParam(query, "limit", 30, 1, 50)
            ));
            case "/api/netease/recent/songs" -> HttpUtil.sendJson(exchange, requireNetease().recentSongsPayload(
                HttpUtil.intParam(query, "limit", 30, 1, 50)
            ));
            case "/api/netease/liked/songs" -> HttpUtil.sendJson(exchange, requireNetease().likedSongsPayload(
                HttpUtil.intParam(query, "limit", 30, 1, 50)
            ));
            case "/api/player/state" -> HttpUtil.sendJson(exchange, context.player.state());
            case "/api/player/queue" -> HttpUtil.sendJson(exchange, context.player.queuePage(
                HttpUtil.intParam(query, "cursor", 0, 0, Integer.MAX_VALUE),
                HttpUtil.intParam(query, "limit", 12, 1, 200)
            ));
            case "/api/player/volume" -> HttpUtil.sendJson(exchange, context.player.setVolume(
                HttpUtil.doubleParam(query, "value", 0.8, 0.0, 1.0)
            ));
            case "/api/player/seek" -> HttpUtil.sendJson(exchange, context.player.seek(
                HttpUtil.intParam(query, "position", 0, 0, 86400)
            ));
            case "/api/player/toggle" -> HttpUtil.sendJson(exchange, context.player.toggle());
            case "/api/player/pause" -> HttpUtil.sendJson(exchange, context.player.pause());
            case "/api/player/play" -> HttpUtil.sendJson(exchange, context.player.play());
            case "/api/player/previous" -> HttpUtil.sendJson(exchange, context.player.previous());
            case "/api/player/next" -> HttpUtil.sendJson(exchange, context.player.next());
            case "/api/player/load" -> HttpUtil.sendJson(exchange, context.player.load(songFromQuery(query), HttpUtil.param(query, "quality", "standard")));
            case "/api/podcast/hot" -> HttpUtil.sendJson(exchange, emptySongs("podcast"));
            case "/api/weather/radio" -> HttpUtil.sendJson(exchange, weatherPayload(HttpUtil.param(query, "code", "")));
            case "/api/update/latest" -> HttpUtil.sendJson(exchange, updatePayload());
            case "/api/update/progress" -> HttpUtil.sendJson(exchange, context.updates.progress(HttpUtil.param(query, "id", "")));
            default -> HttpUtil.notFound(exchange);
        }
    }

    private void handleQuit(HttpExchange exchange, boolean quitServer) throws IOException {
        if (!quitServer) context.player.flush();
        HttpUtil.sendJson(exchange, LocalClientLauncher.controlPayload(quitServer ? "quit" : "close"));
        if (quitServer && quitRequested.compareAndSet(false, true)) {
            Thread shutdown = new Thread(() -> {
                try {
                    Thread.sleep(180);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
                try {
                    context.close();
                } finally {
                    System.exit(0);
                }
            }, "fe-monster-shutdown");
            shutdown.setDaemon(false);
            shutdown.start();
        }
    }

    private void handlePatch(HttpExchange exchange, String path) throws IOException {
        if ("/api/audio/mixer/channels".equals(path)) {
            Map<String, Object> root = readStrictAudioMixerBody(exchange);
            validateAudioMixerMutationRoot(root, Set.of("expectedRevision", "parameters"));
            Object parameters = root.get("parameters");
            if (!(parameters instanceof Map<?, ?>)) {
                throw new IllegalArgumentException("channel router parameters must be an object");
            }
            Map<String, Object> payload;
            try {
                payload = context.audioMixer.patchChannels(
                    root.get("expectedRevision"),
                    SimpleJson.asMap(parameters)
                );
            } catch (IOException persistenceFailure) {
                throw new AudioMixerPersistenceException();
            }
            HttpUtil.sendJson(exchange, payload);
            return;
        }
        if (!"/api/audio/mixer".equals(path)) {
            HttpUtil.notFound(exchange);
            return;
        }
        Map<String, Object> root = readStrictAudioMixerBody(exchange);
        validateAudioMixerMutationRoot(root, Set.of("expectedRevision", "parameters"));
        Object parameters = root.get("parameters");
        if (!(parameters instanceof Map<?, ?>)) {
            throw new IllegalArgumentException("audio mixer parameters must be an object");
        }
        Map<String, Object> payload;
        try {
            payload = context.audioMixer.patch(
                root.get("expectedRevision"),
                SimpleJson.asMap(parameters)
            );
        } catch (IOException persistenceFailure) {
            throw new AudioMixerPersistenceException();
        }
        HttpUtil.sendJson(exchange, payload);
    }

    private static Map<String, Object> readStrictAudioMixerBody(HttpExchange exchange)
        throws IOException {
        String contentType = exchange.getRequestHeaders().getFirst("Content-Type");
        if (contentType == null
            || !contentType.toLowerCase().startsWith("application/json")) {
            throw new IllegalArgumentException("audio mixer mutation requires application/json");
        }
        byte[] bytes = exchange.getRequestBody().readNBytes(MAX_AUDIO_MIXER_JSON_BYTES + 1);
        if (bytes.length > MAX_AUDIO_MIXER_JSON_BYTES) {
            throw new IllegalArgumentException("audio mixer request is too large");
        }
        return SimpleJson.parseObjectStrict(new String(bytes, StandardCharsets.UTF_8));
    }

    private static void validateAudioMixerMutationRoot(
        Map<String, Object> root,
        Set<String> expectedKeys
    ) {
        if (!root.keySet().equals(expectedKeys)) {
            throw new IllegalArgumentException("audio mixer request contains unknown or missing fields");
        }
    }

    private void handlePost(HttpExchange exchange, String path, Map<String, String> query) throws IOException {
        if ("/api/audio/mixer/channels/test".equals(path)) {
            Map<String, Object> root = readStrictAudioMixerBody(exchange);
            HttpUtil.sendJson(exchange, context.audioMixer.playChannelTestSignal(root));
            return;
        }
        if (path.startsWith("/api/audio/mixer/presets/") && path.endsWith("/apply")) {
            String prefix = "/api/audio/mixer/presets/";
            String id = path.substring(prefix.length(), path.length() - "/apply".length());
            if (id.isBlank() || id.indexOf('/') >= 0) {
                throw new IllegalArgumentException("invalid audio mixer preset id");
            }
            Map<String, Object> root = readStrictAudioMixerBody(exchange);
            validateAudioMixerMutationRoot(root, Set.of("expectedRevision"));
            Map<String, Object> payload;
            try {
                payload = context.audioMixer.applyPreset(
                    id,
                    root.get("expectedRevision")
                );
            } catch (IOException persistenceFailure) {
                throw new AudioMixerPersistenceException();
            }
            HttpUtil.sendJson(exchange, payload);
            return;
        }
        if ("/api/creative-market/uploads/content".equals(path)) {
            requireLocalCreativeMarketUpload(exchange);
            handleCreativeMarketUpload(exchange, query);
            return;
        }
        if ("/api/audio/spatial/start".equals(path)) {
            requireLocalNativeAudio(exchange);
            HttpUtil.sendJson(exchange, context.audioEngine.startSpatialStream(
                HttpUtil.intParam(query, "sampleRate", 48000, 16000, 192000),
                HttpUtil.intParam(query, "inputChannels", 2, 1, 2),
                HttpUtil.intParam(query, "layoutChannels", 6, 6, 8),
                HttpUtil.intParam(query, "algorithm", 2, 0, 3)
            ));
            return;
        }
        if ("/api/audio/spatial/activate".equals(path)) {
            requireLocalNativeAudio(exchange);
            HttpUtil.sendJson(exchange, context.audioEngine.setSpatialStreamMuted(
                longParam(query, "session", 0),
                longParam(query, "generation", 0),
                false
            ));
            return;
        }
        if ("/api/audio/spatial/timeline".equals(path)) {
            requireLocalNativeAudio(exchange);
            HttpUtil.sendJson(exchange, context.audioEngine.resetSpatialTimeline(
                longParam(query, "session", 0),
                longParam(query, "generation", 0)
            ));
            return;
        }
        if ("/api/audio/spatial/pause".equals(path)) {
            requireLocalNativeAudio(exchange);
            HttpUtil.sendJson(exchange, context.audioEngine.pauseSpatialStream(
                longParam(query, "session", 0),
                longParam(query, "generation", 0)
            ));
            return;
        }
        if ("/api/audio/spatial/stop".equals(path)) {
            requireLocalNativeAudio(exchange);
            HttpUtil.sendJson(exchange, context.audioEngine.stopSpatialStream(
                longParam(query, "session", 0),
                longParam(query, "generation", 0)
            ));
            return;
        }
        if ("/api/audio/spatial/stream".equals(path)) {
            requireLocalNativeAudio(exchange);
            handleNativeSpatialStream(exchange, query);
            return;
        }
        if ("/api/audio/spatial/block".equals(path)) {
            requireLocalNativeAudio(exchange);
            handleNativeSpatialBlock(exchange, query);
            return;
        }
        if (path.equals("/api/netease/login/browser/start") || path.equals("/api/qq/login/browser/start")
            || path.equals("/api/kugou/login/browser/start")) {
            requireLocalBrowserLogin(exchange);
            HttpUtil.sendJson(exchange, context.browserLogin.start(providerFrom(path, query)));
            return;
        }
        if (path.equals("/api/netease/login/browser/cancel") || path.equals("/api/qq/login/browser/cancel")
            || path.equals("/api/kugou/login/browser/cancel")) {
            requireLocalBrowserLogin(exchange);
            HttpUtil.sendJson(exchange, context.browserLogin.cancel(
                providerFrom(path, query),
                HttpUtil.param(query, "session", "")
            ));
            return;
        }
        if (path.equals("/api/netease/login/browser/switch") || path.equals("/api/qq/login/browser/switch")
            || path.equals("/api/kugou/login/browser/switch")) {
            requireLocalBrowserLogin(exchange);
            HttpUtil.sendJson(exchange, context.browserLogin.switchAccount(providerFrom(path, query)));
            return;
        }
        if ("/api/music-apis/import".equals(path)) {
            handleMusicApiImport(exchange, query);
            return;
        }
        if ("/api/qishui/local/library/import".equals(path)) {
            requireLocalBrowserLogin(exchange);
            byte[] bytes = exchange.getRequestBody().readNBytes(MAX_QISHUI_LIBRARY_METADATA_BYTES + 1);
            if (bytes.length > MAX_QISHUI_LIBRARY_METADATA_BYTES) {
                throw new IllegalArgumentException("Qishui library metadata exceeds 2 MiB");
            }
            Map<String, Object> library = SimpleJson.parseObjectStrict(
                new String(bytes, StandardCharsets.UTF_8)
            );
            HttpUtil.sendJson(exchange, context.music.importLibraryMetadata("qishui", library));
            return;
        }
        if ("/api/wallpapers/import".equals(path)) {
            requireLocalWallpaperControl(exchange);
            long contentLength = parseContentLength(exchange);
            if (contentLength > WallpaperService.MAX_IMPORT_BYTES) {
                throw new IllegalArgumentException("wallpaper exceeds 512 MiB import limit");
            }
            HttpUtil.sendJson(exchange, context.wallpapers.importFile(
                HttpUtil.param(query, "name", "wallpaper"),
                exchange.getRequestBody()
            ));
            return;
        }
        if ("/api/user-cursors/import".equals(path)) {
            requireLocalUserCursorImport(exchange);
            String contentType = SimpleJson.asString(exchange.getRequestHeaders().getFirst("Content-Type"), "");
            if (!contentType.toLowerCase().startsWith("image/png")) {
                throw new IllegalArgumentException("user cursor upload must be a normalized PNG");
            }
            HttpUtil.sendJson(exchange, context.userCursors.importPng(
                HttpUtil.param(query, "name", "cursor.png"),
                exchange.getRequestBody()
            ));
            return;
        }
        if ("/api/app/recording/save".equals(path)) {
            handleRecordingSave(exchange, query);
            return;
        }

        String body = HttpUtil.readBody(exchange);
        Map<String, Object> root = SimpleJson.parseObject(body);
        switch (path) {
            case "/api/app/achievements" -> {
                requireSameOriginClientPreferences(exchange);
                HttpUtil.sendJson(exchange, achievementUpdate(path, query, root));
            }
            case "/api/community/achievements/claim" -> {
                requireSameOriginClientPreferences(exchange);
                handleCommunityAchievementRewardClaim(exchange, query, root);
            }
            case "/api/community/achievements/evidence" -> {
                requireSameOriginClientPreferences(exchange);
                handleCommunityAchievementEvidence(exchange, query, root);
            }
            case "/api/app/preferences" -> {
                requireSameOriginClientPreferences(exchange);
                HttpUtil.sendJson(exchange, context.clientPreferences.update(root));
            }
            case "/api/app/preferences/cloud-sync" -> {
                requireSameOriginClientPreferences(exchange);
                String provider = MusicProviderRegistry.normalize(SimpleJson.asString(root.get("provider"), "netease"));
                HttpUtil.sendJson(exchange, context.clientPreferenceSync.sync(
                    provider,
                    providerLabel(provider),
                    context.music.accountPayload(provider)
                ));
            }
            case "/api/app/runtime/settings" -> HttpUtil.sendJson(exchange, context.runtimeSettings.update(root));
            case "/api/app/interactive/activate" -> {
                String provider = SimpleJson.asString(root.get("provider"), "netease");
                HttpUtil.sendJson(exchange, context.activateInteractiveServices(provider));
            }
            case "/api/wallpapers/activate" -> {
                requireLocalWallpaperControl(exchange);
                HttpUtil.sendJson(
                    exchange,
                    context.wallpapers.activate(SimpleJson.asString(root.get("id"), ""))
                );
            }
            case "/api/qishui/login/token" -> {
                requireLocalBrowserLogin(exchange);
                HttpUtil.sendJson(exchange, context.music.configureLogin("qishui", qishuiLoginCredentials(root)));
            }
            case "/api/sandbox/generate", "/api/sandbox/codex/commit", "/api/sandbox/codex/rework",
                "/api/sandbox/presets", "/api/sandbox/presets/delete",
                "/api/sandbox/components", "/api/sandbox/components/delete",
                "/api/preset-market/upload", "/api/preset-market/download",
                "/api/component-market/upload", "/api/component-market/download" ->
                HttpUtil.sendJson(exchange, context.community.sandboxPost(path, root));
            case "/api/playlist/add", "/api/netease/playlist/add", "/api/qq/playlist/add", "/api/kugou/playlist/add" -> handlePlaylistAdd(exchange, path, query, root);
            case "/api/community/friends/add" -> handleCommunityAddFriend(exchange, query, root);
            case "/api/community/friends/respond" -> handleCommunityFriendRequestResponse(exchange, query, root);
            case "/api/community/mailbox/read" -> handleCommunityMailboxRead(exchange, query, root);
            case "/api/community/mailbox/claim" -> handleCommunityMailboxClaim(exchange, query, root);
            case "/api/community/identity-cards/equip" -> handleCommunityIdentityCardEquip(exchange, query, root);
            case "/api/community/profile" -> handleCommunityProfile(exchange, query, root);
            case "/api/community/listening" -> handleCommunityListening(exchange, query, root);
            case "/api/community/messages/send" -> handleCommunitySendMessage(exchange, query, root);
            case "/api/community/likes/add" -> handleCommunityLikeFriend(exchange, query, root);
            case "/api/community/creative-market/uploads/init",
                "/api/community/creative-market/works/publish",
                "/api/community/creative-market/works/like",
                "/api/community/creative-market/works/comment",
                "/api/community/creative-market/works/share",
                "/api/community/creative-market/works/use" ->
                handleCommunityCreativeMarketMutation(exchange, path, query, root);
            case "/api/community/square/messages" -> handleCommunitySquareMessage(exchange, query, root);
            case "/api/community/listen/invite" -> handleCommunityListenInvite(exchange, query, root);
            case "/api/community/listen/respond" -> handleCommunityListenRespond(exchange, query, root);
            case "/api/community/listen/leave" -> handleCommunityListenLeave(exchange, query, root);
            case "/api/community/call/signal" -> handleCommunityCallSignal(exchange, query, root);
            case "/api/community/relay" -> handleCommunityRelay(exchange, query, root);
            case "/api/community/pet/memory/forget" -> handleCommunityPetMemoryForget(exchange, query, root);
            case "/api/community/pet/sessions",
                "/api/community/pet/voice",
                "/api/community/pet/habits",
                "/api/community/pet/chat",
                "/api/community/pet/narrate",
                "/api/community/pet/narrate/cancel",
                "/api/community/pet/cancel",
                "/api/community/pet/voice/transcript",
                "/api/community/pet/voice/chunk",
                "/api/community/pet/live-stt",
                "/api/community/pet/action-claim",
                "/api/community/pet/action-result" ->
                handleCommunityPetMutation(exchange, path, query, root);
            case "/api/update/install" -> HttpUtil.sendJson(exchange, context.updates.startInstall(SimpleJson.asMap(root.get("release"))));
            case "/api/player/queue" -> HttpUtil.sendJson(exchange, context.player.setQueue(
                songsFromPayload(root),
                SimpleJson.asInt(root.get("currentIndex"), -1)
            ));
            case "/api/player/queue/merge" -> HttpUtil.sendJson(exchange, context.player.mergeQueue(
                songsFromPayload(root),
                SimpleJson.asString(root.get("mode"), "append")
            ));
            default -> HttpUtil.notFound(exchange);
        }
    }

    private void handleMusicApiImport(HttpExchange exchange, Map<String, String> query) throws IOException {
        requireLocalMusicApiImport(exchange);
        long contentLength = parseContentLength(exchange);
        if (contentLength > 25L * 1024 * 1024) {
            throw new IllegalArgumentException("music API import exceeds 25 MB");
        }

        String name = HttpUtil.param(query, "name", "music-api.json").trim();
        if (name.length() > 160) throw new IllegalArgumentException("music API import filename is too long");
        String lowerName = name.toLowerCase();
        String contentType = exchange.getRequestHeaders().getFirst("Content-Type");
        String normalizedType = contentType == null ? "" : contentType.toLowerCase();
        boolean zip = lowerName.endsWith(".zip") || normalizedType.contains("zip");
        boolean json = lowerName.endsWith(".json") || lowerName.endsWith(".feapi") || normalizedType.contains("json");
        if (!zip && !json) throw new IllegalArgumentException("music API import must be a JSON/FEAPI config or ZIP package");

        boolean trusted = Boolean.parseBoolean(HttpUtil.param(query, "trusted", "false"));
        var result = zip
            ? context.musicApis.importTrustedZip(exchange.getRequestBody(), trusted)
            : context.musicApis.importJson(exchange.getRequestBody());
        context.reloadMusicProviders();
        for (var provider : result.providers()) context.musicApis.ensureStarted(provider.id());

        Map<String, Object> payload = new LinkedHashMap<>(context.musicApis.redactedPayload());
        payload.put("importedProviders", result.payloadProviders());
        payload.put("packageImport", result.packageImport());
        HttpUtil.sendJson(exchange, payload);
    }

    private static void requireLocalMusicApiImport(HttpExchange exchange) {
        if (!"1".equals(exchange.getRequestHeaders().getFirst("X-FE-Monster-Import"))) {
            throw new IllegalArgumentException("music API import must be confirmed by the local application");
        }
        var remote = exchange.getRemoteAddress();
        if (remote == null || remote.getAddress() == null || !remote.getAddress().isLoopbackAddress()) {
            throw new IllegalArgumentException("music API import is only available from this device");
        }

        String origin = exchange.getRequestHeaders().getFirst("Origin");
        if (origin == null || origin.isBlank()) return;
        try {
            URI uri = URI.create(origin);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
            int originPort = uri.getPort() >= 0 ? uri.getPort() : ("https".equals(scheme) ? 443 : 80);
            int servicePort = exchange.getLocalAddress().getPort();
            if (!("http".equals(scheme) || "https".equals(scheme))
                || !("127.0.0.1".equals(host) || "localhost".equals(host) || "::1".equals(host))
                || originPort != servicePort) {
                throw new IllegalArgumentException("music API import requires a local application origin");
            }
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("music API import requires a local application origin");
        }
    }

    private static void requireSameOriginClientPreferences(HttpExchange exchange) {
        String fetchSite = exchange.getRequestHeaders().getFirst("Sec-Fetch-Site");
        if (
            fetchSite != null
                && !fetchSite.isBlank()
                && !"same-origin".equalsIgnoreCase(fetchSite)
                && !"same-site".equalsIgnoreCase(fetchSite)
                && !"none".equalsIgnoreCase(fetchSite)
        ) {
            throw new IllegalArgumentException("client preferences require the application origin");
        }
        String source = exchange.getRequestHeaders().getFirst("Origin");
        if (source == null || source.isBlank()) {
            source = exchange.getRequestHeaders().getFirst("Referer");
        }
        if (source == null || source.isBlank()) return;
        try {
            URI sourceUri = URI.create(source);
            URI requestUri = URI.create("http://" + exchange.getRequestHeaders().getFirst("Host"));
            int sourcePort = sourceUri.getPort() >= 0 ? sourceUri.getPort() : defaultPort(sourceUri.getScheme());
            int requestPort = requestUri.getPort() >= 0 ? requestUri.getPort() : exchange.getLocalAddress().getPort();
            if (
                sourceUri.getHost() == null
                    || requestUri.getHost() == null
                    || !sourceUri.getHost().equalsIgnoreCase(requestUri.getHost())
                    || sourcePort != requestPort
            ) {
                throw new IllegalArgumentException("client preferences require the application origin");
            }
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("client preferences require the application origin");
        }
    }

    private static void requireLocalCreativeMarketUpload(HttpExchange exchange) {
        var remote = exchange.getRemoteAddress();
        if (remote == null || remote.getAddress() == null || !remote.getAddress().isLoopbackAddress()) {
            throw new IllegalArgumentException("creative market uploads are only available from this device");
        }
        int servicePort = exchange.getLocalAddress().getPort();
        String requestHost = exchange.getRequestHeaders().getFirst("Host");
        try {
            if (requestHost == null || requestHost.isBlank()) throw new IllegalArgumentException();
            URI requestUri = URI.create("http://" + requestHost);
            int requestPort = requestUri.getPort() >= 0 ? requestUri.getPort() : servicePort;
            if (!isApplicationLoopbackHost(requestUri.getHost()) || requestPort != servicePort) {
                throw new IllegalArgumentException();
            }
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("creative market uploads require the local application host");
        }
        requireSameOriginClientPreferences(exchange);
    }

    private static void requireLocalWallpaperControl(HttpExchange exchange) {
        var remote = exchange.getRemoteAddress();
        if (remote == null || remote.getAddress() == null || !remote.getAddress().isLoopbackAddress()) {
            throw new IllegalArgumentException("wallpaper control is only available from this device");
        }
        int servicePort = exchange.getLocalAddress().getPort();
        String requestHost = exchange.getRequestHeaders().getFirst("Host");
        URI requestUri;
        try {
            if (requestHost == null || requestHost.isBlank()) throw new IllegalArgumentException();
            requestUri = URI.create("http://" + requestHost);
            int requestPort = requestUri.getPort() >= 0 ? requestUri.getPort() : servicePort;
            if (!isApplicationLoopbackHost(requestUri.getHost()) || requestPort != servicePort) {
                throw new IllegalArgumentException();
            }
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("wallpaper control requires the local application host");
        }
        String fetchSite = exchange.getRequestHeaders().getFirst("Sec-Fetch-Site");
        if (
            fetchSite != null
                && !fetchSite.isBlank()
                && !"same-origin".equalsIgnoreCase(fetchSite)
                && !"same-site".equalsIgnoreCase(fetchSite)
                && !"none".equalsIgnoreCase(fetchSite)
        ) {
            throw new IllegalArgumentException("wallpaper control requires the application origin");
        }
        String source = exchange.getRequestHeaders().getFirst("Origin");
        if (source == null || source.isBlank()) {
            source = exchange.getRequestHeaders().getFirst("Referer");
        }
        if (source == null || source.isBlank()) return;
        try {
            URI sourceUri = URI.create(source);
            int sourcePort = sourceUri.getPort() >= 0 ? sourceUri.getPort() : defaultPort(sourceUri.getScheme());
            if (
                !"http".equalsIgnoreCase(sourceUri.getScheme())
                    || !isApplicationLoopbackHost(sourceUri.getHost())
                    || !sourceUri.getHost().equalsIgnoreCase(requestUri.getHost())
                    || sourcePort != servicePort
            ) {
                throw new IllegalArgumentException("wallpaper control requires the application origin");
            }
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("wallpaper control requires the application origin");
        }
    }

    private static boolean isApplicationLoopbackHost(String host) {
        if (host == null) return false;
        String normalized = host.toLowerCase();
        return "127.0.0.1".equals(normalized)
            || "localhost".equals(normalized)
            || "::1".equals(normalized);
    }

    private static int defaultPort(String scheme) {
        return "https".equalsIgnoreCase(scheme) ? 443 : 80;
    }

    private static void requireLocalBrowserLogin(HttpExchange exchange) {
        if (!"1".equals(exchange.getRequestHeaders().getFirst("X-FE-Monster-Login"))) {
            throw new IllegalArgumentException("official browser login must be started by the local application");
        }
        var remote = exchange.getRemoteAddress();
        if (remote == null || remote.getAddress() == null || !remote.getAddress().isLoopbackAddress()) {
            throw new IllegalArgumentException("official browser login is only available from this device");
        }
        String origin = exchange.getRequestHeaders().getFirst("Origin");
        if (origin == null || origin.isBlank()) return;
        try {
            URI uri = URI.create(origin);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
            int originPort = uri.getPort() >= 0 ? uri.getPort() : 80;
            int servicePort = exchange.getLocalAddress().getPort();
            if (!("127.0.0.1".equals(host) || "localhost".equals(host) || "::1".equals(host)) || originPort != servicePort) {
                throw new IllegalArgumentException("official browser login requires a local application origin");
            }
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("official browser login requires a local application origin");
        }
    }

    private static void requireLocalUserCursorImport(HttpExchange exchange) {
        if (!"1".equals(exchange.getRequestHeaders().getFirst("X-FE-Monster-Cursor"))) {
            throw new IllegalArgumentException("user cursor import must be confirmed by the local application");
        }
        var remote = exchange.getRemoteAddress();
        if (remote == null || remote.getAddress() == null || !remote.getAddress().isLoopbackAddress()) {
            throw new IllegalArgumentException("user cursor import is only available from this device");
        }
        String origin = exchange.getRequestHeaders().getFirst("Origin");
        if (origin == null || origin.isBlank()) return;
        try {
            URI uri = URI.create(origin);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
            int originPort = uri.getPort() >= 0 ? uri.getPort() : 80;
            int servicePort = exchange.getLocalAddress().getPort();
            if (!("127.0.0.1".equals(host) || "localhost".equals(host) || "::1".equals(host))
                || originPort != servicePort) {
                throw new IllegalArgumentException("user cursor import requires a local application origin");
            }
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("user cursor import requires a local application origin");
        }
    }

    private static Map<String, String> qishuiLoginCredentials(Map<String, Object> root) {
        Map<String, String> credentials = new LinkedHashMap<>();
        String accessToken = boundedLoginCredential(root.get("accessToken"), "accessToken", 4096, true);
        credentials.put("accessToken", accessToken);
        putLoginCredential(credentials, "openId", root.get("openId"), 256);
        putLoginCredential(credentials, "refreshToken", root.get("refreshToken"), 4096);
        putLoginCredential(credentials, "clientKey", root.get("clientKey"), 256);
        return credentials;
    }

    private static void putLoginCredential(
        Map<String, String> target,
        String name,
        Object value,
        int maximumLength
    ) {
        String credential = boundedLoginCredential(value, name, maximumLength, false);
        if (!credential.isBlank()) target.put(name, credential);
    }

    private static String boundedLoginCredential(
        Object value,
        String name,
        int maximumLength,
        boolean required
    ) {
        String credential = SimpleJson.asString(value, "").trim();
        if (required && credential.isBlank()) throw new IllegalArgumentException(name + " is required");
        if (credential.length() > maximumLength) throw new IllegalArgumentException(name + " is too long");
        return credential;
    }

    private static void requireLocalNativeAudio(HttpExchange exchange) {
        if (!"1".equals(exchange.getRequestHeaders().getFirst("X-FE-Monster-Audio"))) {
            throw new IllegalArgumentException("native audio stream must be started by the local application");
        }
        if (exchange.getRemoteAddress() == null
            || exchange.getRemoteAddress().getAddress() == null
            || !exchange.getRemoteAddress().getAddress().isLoopbackAddress()) {
            throw new IllegalArgumentException("native audio streaming is only available on this device");
        }
    }

    private void handleNativeSpatialStream(
        HttpExchange exchange,
        Map<String, String> query
    ) throws IOException {
        long session = longParam(query, "session", 0);
        long generation = longParam(query, "generation", 0);
        int inputChannels = HttpUtil.intParam(query, "inputChannels", 2, 1, 2);
        if (session <= 0) throw new IllegalArgumentException("native spatial session is required");
        if (generation <= 0) throw new IllegalArgumentException("native spatial generation is required");

        int framesPerTransportBlock = 4096;
        int samplesPerBlock = framesPerTransportBlock * inputChannels;
        ByteBuffer encodedBlock = ByteBuffer
            .allocateDirect(samplesPerBlock * Float.BYTES)
            .order(ByteOrder.LITTLE_ENDIAN);
        int blocks = 0;
        int lastResult = 0;
        try (InputStream input = exchange.getRequestBody();
             ReadableByteChannel channel = Channels.newChannel(input)) {
            while (true) {
                int read = channel.read(encodedBlock);
                if (read < 0) break;
                if (encodedBlock.hasRemaining()) continue;

                encodedBlock.flip();
                lastResult = context.audioEngine.submitSpatialPcm(
                    session,
                    generation,
                    encodedBlock,
                    framesPerTransportBlock
                );
                if (lastResult < 0) {
                    throw new IOException("native spatial PCM submit failed: " + lastResult);
                }
                encodedBlock.clear();
                blocks += 1;
            }
        } finally {
            context.audioEngine.stopSpatialStream(session, generation);
        }

        Map<String, Object> body = HttpUtil.ok();
        body.put("blocks", blocks);
        body.put("lastResult", lastResult);
        HttpUtil.sendJson(exchange, body);
    }

    private void handleNativeSpatialBlock(
        HttpExchange exchange,
        Map<String, String> query
    ) throws IOException {
        long session = longParam(query, "session", 0);
        long generation = longParam(query, "generation", 0);
        long sequence = longParam(query, "sequence", -1);
        int inputChannels = HttpUtil.intParam(query, "inputChannels", 2, 1, 2);
        if (session <= 0) throw new IllegalArgumentException("native spatial session is required");
        if (generation <= 0) throw new IllegalArgumentException("native spatial generation is required");
        if (sequence < 0) throw new IllegalArgumentException("native spatial block sequence is required");

        int expectedBytes = Math.multiplyExact(
            Math.multiplyExact(NATIVE_SPATIAL_TRANSPORT_FRAMES, inputChannels),
            Float.BYTES
        );
        long contentLength = parseContentLength(exchange);
        if (contentLength != expectedBytes) {
            throw new IllegalArgumentException("native spatial PCM block has an invalid byte length");
        }

        ByteBuffer encodedBlock = NATIVE_SPATIAL_BLOCK_BUFFER.get();
        encodedBlock.clear();
        encodedBlock.limit(expectedBytes);
        try (InputStream input = exchange.getRequestBody();
             ReadableByteChannel channel = Channels.newChannel(input)) {
            while (encodedBlock.hasRemaining()) {
                int read = channel.read(encodedBlock);
                if (read < 0) break;
            }
        }
        if (encodedBlock.hasRemaining()) {
            throw new IllegalArgumentException("native spatial PCM block ended early");
        }
        encodedBlock.flip();
        int result = context.audioEngine.submitSpatialPcm(
            session,
            generation,
            sequence,
            encodedBlock,
            NATIVE_SPATIAL_TRANSPORT_FRAMES
        );
        if (result < 0) {
            throw new IllegalArgumentException("native spatial PCM block was rejected: " + result);
        }

        Map<String, Object> body = HttpUtil.ok();
        body.put("blocks", 1);
        body.put("sequence", sequence);
        body.put("lastResult", result);
        HttpUtil.sendJson(exchange, body);
    }

    private static long parseContentLength(HttpExchange exchange) {
        String value = exchange.getRequestHeaders().getFirst("Content-Length");
        if (value == null || value.isBlank()) return -1;
        try {
            long length = Long.parseLong(value);
            if (length < 0) throw new NumberFormatException();
            return length;
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException("invalid request content length");
        }
    }

    private static String requireCreativePathId(String path, String pathPrefix, String idPrefix) {
        if (path == null || !path.startsWith(pathPrefix)) {
            throw new IllegalArgumentException("invalid creative market path");
        }
        String id = path.substring(pathPrefix.length());
        if (id.isBlank() || id.indexOf('/') >= 0) {
            throw new IllegalArgumentException("invalid creative market id");
        }
        return requireCreativeId(id, idPrefix);
    }

    private static String requireCreativeId(String value, String prefix) {
        String id = value == null ? "" : value.trim();
        if (!id.startsWith(prefix)) throw new IllegalArgumentException("invalid creative market id");
        String suffix = id.substring(prefix.length());
        if (suffix.length() < 12 || suffix.length() > 120 || !suffix.matches("[A-Za-z0-9_-]+")) {
            throw new IllegalArgumentException("invalid creative market id");
        }
        return id;
    }

    private static String requireFeId(String value) {
        String feId = value == null ? "" : value.trim();
        if (!feId.matches("\\d{8}")) throw new IllegalArgumentException("invalid FE ID");
        return feId;
    }

    private static long longParam(Map<String, String> query, String name, long fallback) {
        try {
            return Long.parseLong(HttpUtil.param(query, name, String.valueOf(fallback)));
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private void handlePlaylistAdd(HttpExchange exchange, String path, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = providerFrom(path, query);
        String playlistId = firstNonBlank(
            SimpleJson.asString(root.get("playlistId"), ""),
            SimpleJson.asString(root.get("pid"), ""),
            SimpleJson.asString(root.get("id"), ""),
            HttpUtil.param(query, "playlistId", ""),
            HttpUtil.param(query, "id", "")
        );
        Map<String, Object> songMap = new LinkedHashMap<>(SimpleJson.asMap(root.get("song")));
        if (songMap.isEmpty()) {
            songMap.put("id", firstNonBlank(
                SimpleJson.asString(root.get("songId"), ""),
                SimpleJson.asString(root.get("songid"), ""),
                SimpleJson.asString(root.get("songmid"), ""),
                SimpleJson.asString(root.get("mid"), ""),
                SimpleJson.asString(root.get("hash"), "")
            ));
            songMap.put("title", SimpleJson.asString(root.get("title"), ""));
            songMap.put("artist", SimpleJson.asString(root.get("artist"), ""));
            songMap.put("album", SimpleJson.asString(root.get("album"), ""));
            songMap.put("cover", SimpleJson.asString(root.get("cover"), ""));
            songMap.put("duration", root.get("duration"));
        }
        Song song = Song.fromMap(songMap);
        song.provider = provider;
        HttpUtil.sendJson(exchange, context.music.addSongToPlaylistPayload(provider, playlistId, song));
    }

    private void handleCommunityState(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = MusicProviderRegistry.normalize(HttpUtil.param(query, "provider", "netease"));
        String label = providerLabel(provider);
        HttpUtil.sendJson(exchange, context.community.state(provider, label, context.music.accountPayload(provider)));
    }

    private void handleCommunityMessages(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.messages(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            HttpUtil.param(query, "targetId", HttpUtil.param(query, "id", ""))
        ));
    }

    private void handleCommunityNearby(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.nearby(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            HttpUtil.intParam(query, "radiusKm", 10, 5, 10)
        ));
    }

    private void handleCreativeMarket(HttpExchange exchange, Map<String, String> query) throws IOException {
        HttpUtil.sendJson(exchange, context.community.creativeMarket(
            HttpUtil.param(query, "type", ""),
            HttpUtil.param(query, "q", ""),
            HttpUtil.param(query, "feId", "")
        ));
    }

    private void handleCommunitySquareMessages(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.squareMessages(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            HttpUtil.param(query, "after", ""),
            HttpUtil.intParam(query, "limit", 60, 1, 100)
        ));
    }

    private void handleCommunityListenState(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.listenState(provider, providerLabel(provider), context.music.accountPayload(provider)));
    }

    private void handleCommunityListenReport(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.listenReport(provider, providerLabel(provider), context.music.accountPayload(provider)));
    }

    private void handleCommunityCallSignals(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.callSignals(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            HttpUtil.param(query, "sessionId", ""),
            HttpUtil.param(query, "after", "")
        ));
    }

    private void handleCommunityEvents(HttpExchange exchange, Map<String, String> query) throws IOException {
        try {
            HttpResponse<InputStream> response = context.community.eventStream(
                HttpUtil.param(query, "feId", ""),
                HttpUtil.param(query, "after", ""),
                HttpUtil.param(query, "streamRole", "browser")
            );
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                String type = response.headers().firstValue("content-type").orElse("application/json; charset=utf-8");
                byte[] body;
                try (InputStream input = response.body()) {
                    body = input.readAllBytes();
                }
                HttpUtil.sendBytes(exchange, response.statusCode(), type, body);
                return;
            }

            HttpUtil.addCors(exchange);
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
            exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-transform");
            exchange.getResponseHeaders().set("Connection", "keep-alive");
            exchange.getResponseHeaders().set("X-Accel-Buffering", "no");
            exchange.getResponseHeaders().set(
                "X-FE-SSE-Idle-Timeout-Ms",
                String.valueOf(COMMUNITY_SSE_IDLE_TIMEOUT.toMillis())
            );
            exchange.sendResponseHeaders(200, 0);
            try (InputStream input = response.body(); OutputStream output = exchange.getResponseBody()) {
                SseProxyPump.copy(input, output, COMMUNITY_SSE_IDLE_TIMEOUT);
            } catch (IOException ignored) {
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            HttpUtil.sendJson(exchange, 502, HttpUtil.error("community event stream interrupted"));
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            HttpUtil.sendJson(exchange, 502, HttpUtil.error("community event stream unavailable"));
        }
    }

    private void handleSandboxAsset(HttpExchange exchange, Map<String, String> query) throws IOException {
        try {
            HttpResponse<InputStream> response = context.community.sandboxAsset(sandboxPath("/api/sandbox/assets", query));
            String contentType = response.headers().firstValue("content-type").orElse("application/octet-stream");
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                byte[] body;
                try (InputStream input = response.body()) {
                    body = input.readAllBytes();
                }
                HttpUtil.sendBytes(exchange, response.statusCode(), contentType, body);
                return;
            }

            HttpUtil.addCors(exchange);
            exchange.getResponseHeaders().set("Content-Type", contentType);
            response.headers().firstValue("cache-control").ifPresent(value -> exchange.getResponseHeaders().set("Cache-Control", value));
            long contentLength = response.headers().firstValueAsLong("content-length").orElse(0L);
            exchange.sendResponseHeaders(response.statusCode(), contentLength);
            try (InputStream input = response.body(); OutputStream output = exchange.getResponseBody()) {
                input.transferTo(output);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            HttpUtil.sendJson(exchange, 502, HttpUtil.error("sandbox asset transfer interrupted"));
        }
    }

    private void handleCommunityAddFriend(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        String targetId = SimpleJson.asString(root.get("targetId"), SimpleJson.asString(root.get("id"), HttpUtil.param(query, "id", "")));
        HttpUtil.sendJson(exchange, context.community.addFriend(provider, providerLabel(provider), context.music.accountPayload(provider), targetId));
    }

    private void handleCommunityProfile(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.updateProfile(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            root.containsKey("username") ? SimpleJson.asString(root.get("username"), "") : null,
            root.containsKey("bio") ? SimpleJson.asString(root.get("bio"), "") : null,
            root.containsKey("avatarOrnament")
                ? SimpleJson.asMap(root.get("avatarOrnament"))
                : null
        ));
    }

    private void handleCommunityListening(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.recordListening(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asLong(root.get("listenMsDelta"), 0L),
            SimpleJson.asMap(root.get("song"))
        ));
    }

    private void handleCommunitySendMessage(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.sendMessage(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("targetId"), ""),
            SimpleJson.asString(root.get("text"), "")
        ));
    }

    private void handleCommunityLikeFriend(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.likeFriend(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("targetId"), "")
        ));
    }

    private void handleCommunityIdentityCards(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.identityCards(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider)
        ));
    }

    private void handleCommunityFriendIdentityCard(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.friendIdentityCard(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            HttpUtil.param(query, "targetId", "")
        ));
    }

    private void handleCommunityIdentityCardEquip(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.equipIdentityCard(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("cardId"), "")
        ));
    }

    private void handleCommunityAchievementRewardClaim(
        HttpExchange exchange,
        Map<String, String> query,
        Map<String, Object> root
    ) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.claimAchievementReward(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("achievementId"), "")
        ));
    }

    private void handleCommunityAchievementEvidence(
        HttpExchange exchange,
        Map<String, String> query,
        Map<String, Object> root
    ) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.submitAchievementEvidence(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asMap(root.get("event"))
        ));
    }

    private void handleCommunityPetStatus(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.petStatus(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider)
        ));
    }

    private void handleCommunityPetHistory(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.petHistory(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            HttpUtil.param(query, "sessionId", "")
        ));
    }

    private void handleCommunityPetMemories(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.petMemories(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider)
        ));
    }

    private void handleCommunityPetPersonalization(
        HttpExchange exchange,
        Map<String, String> query
    ) throws IOException {
        String provider = communityProvider(query);
        exchange.getResponseHeaders().set("Cache-Control", "private, no-store, max-age=0");
        HttpUtil.sendJson(exchange, context.petPersonalization.projection(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider)
        ));
    }

    private void handleCommunityPetMemoryForget(
        HttpExchange exchange,
        Map<String, String> query,
        Map<String, Object> root
    ) throws IOException {
        String provider = communityProvider(query);
        Map<String, Object> result = context.community.forgetPetMemory(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            root
        );
        if (SimpleJson.asBoolean(result.get("ok"), false)) {
            context.petPersonalization.invalidate(
                provider,
                providerLabel(provider),
                context.music.accountPayload(provider)
            );
        }
        HttpUtil.sendJson(exchange, result);
    }

    private void handleCommunityPetMutation(
        HttpExchange exchange,
        String path,
        Map<String, String> query,
        Map<String, Object> root
    ) throws IOException {
        String prefix = "/api/community/pet/";
        String action = path.startsWith(prefix) ? path.substring(prefix.length()) : "";
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.petMutation(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            action,
            root
        ));
    }

    private void handleCommunityPetAudio(
        HttpExchange exchange,
        Map<String, String> query,
        String audioId
    ) throws IOException {
        String provider = communityProvider(query);
        try {
            HttpResponse<InputStream> response = context.community.petAudio(
                provider,
                providerLabel(provider),
                context.music.accountPayload(provider),
                audioId
            );
            proxyCommunityStream(exchange, response, false);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            HttpUtil.sendJson(exchange, 502, HttpUtil.error("pet audio transfer interrupted"));
        }
    }

    private void handleCommunityFriendRequestResponse(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.respondFriendRequest(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("requestId"), ""),
            SimpleJson.asBoolean(root.get("accepted"), false)
        ));
    }

    private void handleCommunityMailbox(HttpExchange exchange, Map<String, String> query) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.mailbox(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider)
        ));
    }

    private void handleCommunityMailboxRead(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.markMailboxRead(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("mailId"), "")
        ));
    }

    private void handleCommunityMailboxClaim(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.claimMailboxReward(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("mailId"), ""),
            SimpleJson.asString(root.get("attachmentId"), "")
        ));
    }

    private void handleCommunityCreativeMarketMutation(
        HttpExchange exchange,
        String path,
        Map<String, String> query,
        Map<String, Object> root
    ) throws IOException {
        String prefix = "/api/community/creative-market/";
        if (!path.startsWith(prefix)) throw new IllegalArgumentException("invalid creative market action");
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.creativeMarketMutation(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            path.substring(prefix.length()),
            root
        ));
    }

    private void handleCommunitySquareMessage(
        HttpExchange exchange,
        Map<String, String> query,
        Map<String, Object> root
    ) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.sendSquareMessage(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            root
        ));
    }

    private void handleCommunityListenInvite(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.inviteListen(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("targetId"), ""),
            SimpleJson.asMap(root.get("song"))
        ));
    }

    private void handleCommunityListenRespond(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.respondListen(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("inviteId"), ""),
            SimpleJson.asBoolean(root.get("accepted"), false)
        ));
    }

    private void handleCommunityListenLeave(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.leaveListen(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("sessionId"), "")
        ));
    }

    private void handleCommunityCallSignal(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.sendCallSignal(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("targetId"), ""),
            SimpleJson.asString(root.get("sessionId"), ""),
            SimpleJson.asString(root.get("type"), ""),
            root.get("payload")
        ));
    }

    private void handleCommunityRelay(HttpExchange exchange, Map<String, String> query, Map<String, Object> root) throws IOException {
        String provider = communityProvider(query);
        HttpUtil.sendJson(exchange, context.community.relay(
            provider,
            providerLabel(provider),
            context.music.accountPayload(provider),
            SimpleJson.asString(root.get("targetId"), SimpleJson.asString(root.get("to"), "")),
            SimpleJson.asString(root.get("type"), "message"),
            root.get("payload")
        ));
    }

    private void handleRecordingSave(HttpExchange exchange, Map<String, String> query) throws IOException {
        Path root = context.paths.root.toAbsolutePath().normalize();
        Files.createDirectories(root);
        String fileName = sanitizeRecordingFileName(HttpUtil.param(query, "name", "recording.mp4"));
        Path target = root.resolve(fileName).normalize();
        if (!target.startsWith(root)) throw new IOException("invalid recording file path");

        long size;
        try (InputStream in = exchange.getRequestBody(); OutputStream out = Files.newOutputStream(target)) {
            size = in.transferTo(out);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("fileName", fileName);
        body.put("path", target.toString());
        body.put("size", size);
        HttpUtil.sendJson(exchange, body);
    }

    private static String sanitizeRecordingFileName(String requested) {
        String fileName = requested == null ? "" : requested.replace('\\', '/');
        int slash = fileName.lastIndexOf('/');
        if (slash >= 0) fileName = fileName.substring(slash + 1);
        fileName = fileName.replaceAll("[^A-Za-z0-9._-]", "_");
        if (fileName.isBlank() || ".".equals(fileName) || "..".equals(fileName)) fileName = "recording.mp4";
        String lower = fileName.toLowerCase();
        if (!lower.endsWith(".mp4") && !lower.endsWith(".webm")) fileName += ".mp4";
        return fileName;
    }

    private void handleWallpaperFile(HttpExchange exchange, Map<String, String> query) throws IOException {
        Path file = context.wallpapers.resolveServableFile(HttpUtil.param(query, "path", ""));
        sendWallpaperFile(exchange, file, false);
    }

    private void handleUserCursorFile(HttpExchange exchange, Map<String, String> query) throws IOException {
        Path file = context.userCursors.resolve(HttpUtil.param(query, "id", ""));
        byte[] png = Files.readAllBytes(file);
        HttpUtil.addCors(exchange);
        exchange.getResponseHeaders().set("Content-Type", "image/png");
        exchange.getResponseHeaders().set("Cache-Control", "private, max-age=31536000, immutable");
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.sendResponseHeaders(200, png.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(png);
        }
    }

    private void handleCreativeMarketAsset(HttpExchange exchange, String assetId) throws IOException {
        try {
            HttpResponse<InputStream> response = context.community.creativeMarketAsset(
                assetId,
                exchange.getRequestHeaders().getFirst("Range"),
                exchange.getRequestHeaders().getFirst("If-None-Match"),
                exchange.getRequestHeaders().getFirst("If-Range")
            );
            proxyCommunityStream(exchange, response, true);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            HttpUtil.sendJson(exchange, 502, HttpUtil.error("creative market asset transfer interrupted"));
        }
    }

    private void handleCreativeMarketUpload(HttpExchange exchange, Map<String, String> query) throws IOException {
        String uploadId = requireCreativeId(HttpUtil.param(query, "id", ""), "upload-");
        String token = HttpUtil.param(query, "token", "");
        long contentLength = parseContentLength(exchange);
        if (contentLength > MAX_CREATIVE_MARKET_UPLOAD_BYTES) {
            throw new IllegalArgumentException("creative upload exceeds 512 MiB limit");
        }
        try {
            HttpResponse<InputStream> response = context.community.uploadCreativeMarketContent(
                uploadId,
                token,
                exchange.getRequestHeaders().getFirst("Content-Type"),
                contentLength,
                exchange.getRequestBody()
            );
            proxyCommunityStream(exchange, response, false);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            HttpUtil.sendJson(exchange, 502, HttpUtil.error("creative market upload interrupted"));
        }
    }

    private static void proxyCommunityStream(
        HttpExchange exchange,
        HttpResponse<InputStream> response,
        boolean exposeRangeHeaders
    ) throws IOException {
        HttpUtil.addCors(exchange);
        copyResponseHeader(response, exchange, "Content-Type");
        copyResponseHeader(response, exchange, "Cache-Control");
        copyResponseHeader(response, exchange, "ETag");
        copyResponseHeader(response, exchange, "Last-Modified");
        copyResponseHeader(response, exchange, "Content-Disposition");
        if (exposeRangeHeaders) {
            copyResponseHeader(response, exchange, "Accept-Ranges");
            copyResponseHeader(response, exchange, "Content-Range");
            exchange.getResponseHeaders().set(
                "Access-Control-Expose-Headers",
                "Accept-Ranges, Content-Range, Content-Length, ETag, Last-Modified"
            );
        }

        int status = response.statusCode();
        if (status == 204 || status == 304) {
            try (InputStream input = response.body()) {
                exchange.sendResponseHeaders(status, -1);
            } finally {
                exchange.close();
            }
            return;
        }

        long contentLength = response.headers().firstValueAsLong("content-length").orElse(-1L);
        exchange.sendResponseHeaders(status, contentLength >= 0 ? contentLength : 0);
        try (InputStream input = response.body(); OutputStream output = exchange.getResponseBody()) {
            input.transferTo(output);
        }
    }

    private static void copyResponseHeader(
        HttpResponse<?> response,
        HttpExchange exchange,
        String header
    ) {
        response.headers().firstValue(header).ifPresent(value -> exchange.getResponseHeaders().set(header, value));
    }

    private void handleWallpaperWebEntry(HttpExchange exchange, String path) throws IOException {
        WallpaperWebRoute route = parseWallpaperWebRoute(path, WALLPAPER_WEB_ENTRY_PREFIX);
        context.wallpapers.resolveWebFile(route.projectKey(), route.relativePath());

        String location = "http://" + WALLPAPER_WEB_HOST + ":" + exchange.getLocalAddress().getPort()
            + WALLPAPER_WEB_FILE_PREFIX + encodePathSegment(route.projectKey())
            + "/" + encodeRelativePath(route.relativePath());
        exchange.getResponseHeaders().set("Location", location);
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.getResponseHeaders().set("Referrer-Policy", "no-referrer");
        exchange.sendResponseHeaders(302, -1);
        exchange.close();
    }

    private void handleWallpaperWebFile(HttpExchange exchange, String path) throws IOException {
        WallpaperWebRoute route = parseWallpaperWebRoute(path, WALLPAPER_WEB_FILE_PREFIX);
        Path file = context.wallpapers.resolveWebFile(route.projectKey(), route.relativePath());
        sendWallpaperFile(exchange, file, true);
    }

    private void sendWallpaperFile(HttpExchange exchange, Path file, boolean isolatedWebResource) throws IOException {
        long size = Files.size(file);
        if (isolatedWebResource) {
            addWallpaperWebSecurityHeaders(exchange);
        } else {
            HttpUtil.addCors(exchange);
        }
        exchange.getResponseHeaders().set("Content-Type", context.wallpapers.contentType(file));
        exchange.getResponseHeaders().set("Accept-Ranges", "bytes");
        exchange.getResponseHeaders().set(
            "Cache-Control",
            isolatedWebResource && isHtml(file) ? "no-cache" : "private, max-age=300"
        );

        String range = exchange.getRequestHeaders().getFirst("Range");
        if (range != null && range.startsWith("bytes=")) {
            long[] parsed = parseByteRange(range, size);
            if (parsed == null) {
                exchange.getResponseHeaders().set("Content-Range", "bytes */" + size);
                exchange.sendResponseHeaders(416, -1);
                exchange.close();
                return;
            }

            long start = parsed[0];
            long end = parsed[1];
            long length = end - start + 1;
            exchange.getResponseHeaders().set("Content-Range", "bytes " + start + "-" + end + "/" + size);
            exchange.sendResponseHeaders(206, length);
            try (var out = exchange.getResponseBody()) {
                copyRange(file, out, start, length);
            }
            return;
        }

        exchange.sendResponseHeaders(200, size);
        try (var out = exchange.getResponseBody()) {
            Files.copy(file, out);
        }
    }

    private static WallpaperWebRoute parseWallpaperWebRoute(String path, String prefix) throws IOException {
        String suffix = path.substring(prefix.length());
        int slash = suffix.indexOf('/');
        if (slash <= 0 || slash == suffix.length() - 1) {
            throw new IOException("invalid web wallpaper route");
        }
        String projectKey = suffix.substring(0, slash).trim();
        String relativePath = suffix.substring(slash + 1);
        if (!projectKey.matches("[A-Za-z0-9_-]{8,80}") || relativePath.isBlank()) {
            throw new IOException("invalid web wallpaper route");
        }
        return new WallpaperWebRoute(projectKey, relativePath);
    }

    private static void addWallpaperWebSecurityHeaders(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Content-Security-Policy", WALLPAPER_WEB_CSP);
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.getResponseHeaders().set("Referrer-Policy", "no-referrer");
        exchange.getResponseHeaders().set("Cross-Origin-Resource-Policy", "same-origin");
        exchange.getResponseHeaders().set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    }

    private static boolean isWallpaperWebHost(HttpExchange exchange) {
        String host = exchange.getRequestHeaders().getFirst("Host");
        if (host == null) return false;
        String normalized = host.trim().toLowerCase();
        return normalized.equals(WALLPAPER_WEB_HOST) || normalized.startsWith(WALLPAPER_WEB_HOST + ":");
    }

    private static boolean isHtml(Path file) {
        String lower = file.getFileName().toString().toLowerCase();
        return lower.endsWith(".html") || lower.endsWith(".htm");
    }

    private static String encodeRelativePath(String value) {
        StringBuilder encoded = new StringBuilder();
        for (String segment : value.replace('\\', '/').split("/")) {
            if (segment.isBlank()) continue;
            if (!encoded.isEmpty()) encoded.append('/');
            encoded.append(encodePathSegment(segment));
        }
        return encoded.toString();
    }

    private static String encodePathSegment(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private record WallpaperWebRoute(String projectKey, String relativePath) {
    }

    private static long[] parseByteRange(String header, long size) {
        if (size <= 0) return null;
        try {
            String value = header.substring("bytes=".length()).split(",", 2)[0].trim();
            int dash = value.indexOf('-');
            if (dash < 0) return null;

            String startText = value.substring(0, dash).trim();
            String endText = value.substring(dash + 1).trim();
            long start;
            long end;
            if (startText.isEmpty()) {
                long suffix = Long.parseLong(endText);
                if (suffix <= 0) return null;
                start = Math.max(0, size - suffix);
                end = size - 1;
            } else {
                start = Long.parseLong(startText);
                end = endText.isEmpty() ? size - 1 : Math.min(Long.parseLong(endText), size - 1);
            }
            if (start < 0 || start >= size || end < start) return null;
            return new long[] { start, end };
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static void copyRange(Path file, OutputStream output, long start, long length) throws IOException {
        byte[] buffer = new byte[256 * 1024];
        long remaining = length;
        try (InputStream input = Files.newInputStream(file)) {
            input.skipNBytes(start);
            while (remaining > 0) {
                int read = input.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                if (read < 0) return;
                output.write(buffer, 0, read);
                remaining -= read;
            }
        }
    }

    private void handleCover(HttpExchange exchange, Map<String, String> query) throws IOException {
        String url = HttpUtil.param(query, "url", "");
        if (url.isBlank()) {
            HttpUtil.sendJson(exchange, 404, HttpUtil.error("cover url missing"));
            return;
        }
        try {
            HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(10))
                .GET();
            copyCoverConditionalHeader(exchange, request, "If-None-Match");
            copyCoverConditionalHeader(exchange, request, "If-Modified-Since");
            HttpResponse<byte[]> response = CoverHttpClientHolder.INSTANCE.send(
                request.build(),
                HttpResponse.BodyHandlers.ofByteArray()
            );
            String type = response.headers().firstValue("content-type").orElse("image/jpeg");
            if (response.statusCode() == 304) {
                applyCoverCacheHeaders(
                    exchange,
                    type,
                    response.headers().firstValue("etag").orElse(""),
                    response.headers().firstValue("last-modified").orElse("")
                );
                sendCoverNotModified(exchange);
                return;
            }
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                byte[] body = response.body();
                String etag = response.headers().firstValue("etag")
                    .filter(value -> !value.isBlank())
                    .orElseGet(() -> coverEntityTag(body));
                applyCoverCacheHeaders(
                    exchange,
                    type,
                    etag,
                    response.headers().firstValue("last-modified").orElse("")
                );
                if (coverEntityTagMatches(exchange.getRequestHeaders().getFirst("If-None-Match"), etag)) {
                    sendCoverNotModified(exchange);
                    return;
                }
            } else {
                exchange.getResponseHeaders().set("Cache-Control", "no-store");
            }
            HttpUtil.sendBytes(exchange, response.statusCode(), type, response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            HttpUtil.sendJson(exchange, 502, HttpUtil.error("cover proxy interrupted"));
        } catch (Exception e) {
            HttpUtil.sendJson(exchange, 502, HttpUtil.error("cover proxy failed: " + e.getMessage()));
        }
    }

    private static void copyCoverConditionalHeader(
        HttpExchange exchange,
        HttpRequest.Builder request,
        String name
    ) {
        String value = exchange.getRequestHeaders().getFirst(name);
        if (value == null || value.isBlank() || value.length() > 1024) return;
        request.header(name, value);
    }

    private static void applyCoverCacheHeaders(
        HttpExchange exchange,
        String contentType,
        String etag,
        String lastModified
    ) {
        HttpUtil.addCors(exchange);
        exchange.getResponseHeaders().set("Cache-Control", COVER_CACHE_CONTROL);
        exchange.getResponseHeaders().set("Content-Type", contentType == null || contentType.isBlank() ? "image/jpeg" : contentType);
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        if (etag != null && !etag.isBlank()) exchange.getResponseHeaders().set("ETag", etag);
        if (lastModified != null && !lastModified.isBlank()) {
            exchange.getResponseHeaders().set("Last-Modified", lastModified);
        }
    }

    private static void sendCoverNotModified(HttpExchange exchange) throws IOException {
        exchange.sendResponseHeaders(304, -1);
        exchange.close();
    }

    static String coverEntityTag(byte[] body) {
        byte[] bytes = body == null ? new byte[0] : body;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            return '"' + HexFormat.of().formatHex(digest) + '"';
        } catch (NoSuchAlgorithmException ignored) {
            return "W/\"fe-" + bytes.length + '-' + Integer.toHexString(java.util.Arrays.hashCode(bytes)) + "\"";
        }
    }

    static boolean coverEntityTagMatches(String requestValue, String currentValue) {
        if (requestValue == null || requestValue.isBlank() || currentValue == null || currentValue.isBlank()) {
            return false;
        }
        if ("*".equals(requestValue.trim())) return true;
        String current = weakEntityTagValue(currentValue);
        for (String candidate : requestValue.split(",")) {
            if (weakEntityTagValue(candidate).equals(current)) return true;
        }
        return false;
    }

    private static String weakEntityTagValue(String value) {
        String normalized = value == null ? "" : value.trim();
        return normalized.regionMatches(true, 0, "W/", 0, 2)
            ? normalized.substring(2).trim()
            : normalized;
    }

    private static Map<String, Object> appVersion() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "FE Monster Java");
        body.put("version", "2.1.1");
        body.put("runtime", System.getProperty("java.version"));
        body.put("ok", true);
        return body;
    }

    private NeteaseClient requireNetease() {
        var config = context.musicApis.provider("netease");
        NeteaseClient client = context.netease;
        if (!config.enabled() || !config.configured() || client == null) {
            throw new IllegalArgumentException("music API plugin is not configured: netease");
        }
        return client;
    }

    private static Song songFromQuery(Map<String, String> query) {
        Song song = new Song();
        song.id = HttpUtil.param(query, "id", "");
        song.title = HttpUtil.param(query, "title", "");
        song.artist = HttpUtil.param(query, "artist", "");
        song.album = HttpUtil.param(query, "album", "");
        song.cover = HttpUtil.param(query, "cover", "");
        song.provider = MusicProviderRegistry.normalize(HttpUtil.param(query, "provider", "netease"));
        song.duration = HttpUtil.intParam(query, "duration", 0, 0, 86400);
        String sourceRef = HttpUtil.param(query, "sourceRef", "");
        if (!sourceRef.isBlank()) {
            try {
                song.setSourceRef(SimpleJson.asMap(SimpleJson.parse(sourceRef)));
            } catch (RuntimeException ignored) {
                song.setSourceRef(Map.of());
            }
        }
        return song;
    }

    private Map<String, Object> achievementSnapshot(
        String path,
        Map<String, String> query
    ) throws IOException {
        String provider = providerFrom(path, query);
        Map<String, Object> accountPayload = context.music.accountPayload(provider);
        AchievementAccount account = achievementAccount(provider, accountPayload);
        Map<String, Object> state = context.achievements.snapshot(account.scope());
        boolean serverSynced = !account.remoteRequired();
        if (account.remoteRequired()) {
            Map<String, Object> remote = context.community.achievementState(
                provider,
                providerLabel(provider),
                accountPayload
            );
            if (SimpleJson.asBoolean(remote.get("ok"), false)) {
                Map<String, Object> remoteState = SimpleJson.asMap(remote.get("state"));
                if (!remoteState.isEmpty()) {
                    state = context.achievements.mergeRemote(account.scope(), remoteState);
                    serverSynced = true;
                }
                return achievementResponse(state, account, serverSynced, remote);
            }
        }
        return achievementResponse(state, account, serverSynced);
    }

    private Map<String, Object> achievementUpdate(
        String path,
        Map<String, String> query,
        Map<String, Object> incoming
    ) throws IOException {
        String provider = providerFrom(path, query);
        Map<String, Object> accountPayload = context.music.accountPayload(provider);
        AchievementAccount account = achievementAccount(provider, accountPayload);
        Map<String, Object> state = context.achievements.update(account.scope(), incoming);
        boolean serverSynced = !account.remoteRequired();
        if (account.remoteRequired()) {
            Map<String, Object> remote = context.community.updateAchievementState(
                provider,
                providerLabel(provider),
                accountPayload,
                state
            );
            if (SimpleJson.asBoolean(remote.get("ok"), false)) {
                Map<String, Object> remoteState = SimpleJson.asMap(remote.get("state"));
                if (!remoteState.isEmpty()) {
                    state = context.achievements.mergeRemote(account.scope(), remoteState);
                    serverSynced = true;
                }
            }
        }
        return achievementResponse(state, account, serverSynced);
    }

    private static AchievementAccount achievementAccount(
        String provider,
        Map<String, Object> accountPayload
    ) {
        Map<String, Object> account = SimpleJson.asMap(accountPayload.get("account"));
        String accountId = SimpleJson.asString(account.get("userId"), "").trim();
        boolean loggedIn = SimpleJson.asBoolean(accountPayload.get("loggedIn"), false)
            && !accountId.isBlank();
        String normalizedProvider = MusicProviderRegistry.normalize(provider);
        return new AchievementAccount(
            loggedIn ? normalizedProvider + ":" + accountId : "anonymous",
            normalizedProvider,
            loggedIn ? accountId : "",
            loggedIn
        );
    }

    private static Map<String, Object> achievementResponse(
        Map<String, Object> state,
        AchievementAccount account,
        boolean serverSynced
    ) {
        Map<String, Object> response = new LinkedHashMap<>(state);
        Map<String, Object> sync = new LinkedHashMap<>();
        sync.put("scope", account.scope());
        sync.put("provider", account.provider());
        sync.put("accountId", account.accountId());
        sync.put("remoteRequired", account.remoteRequired());
        sync.put("serverSynced", serverSynced);
        response.put("_sync", sync);
        return response;
    }

    private static Map<String, Object> achievementResponse(
        Map<String, Object> state,
        AchievementAccount account,
        boolean serverSynced,
        Map<String, Object> remote
    ) {
        Map<String, Object> response = achievementResponse(state, account, serverSynced);
        for (String field : java.util.List.of("challenges", "identityCardRewards")) {
            if (remote.containsKey(field)) response.put(field, remote.get(field));
        }
        return response;
    }

    private record AchievementAccount(
        String scope,
        String provider,
        String accountId,
        boolean remoteRequired
    ) {
    }

    private static String providerFrom(String path, Map<String, String> query) {
        if (path.contains("/qq/")) return "qq";
        if (path.contains("/kugou/")) return "kugou";
        if (path.contains("/qishui/")) return "qishui";
        if (path.contains("/netease/")) return "netease";
        return MusicProviderRegistry.normalize(HttpUtil.param(query, "provider", "netease"));
    }

    private static String songCommentId(Map<String, String> query) {
        return firstNonBlank(
            HttpUtil.param(query, "id", ""),
            HttpUtil.param(query, "mid", ""),
            HttpUtil.param(query, "songid", ""),
            HttpUtil.param(query, "songmid", "")
        );
    }

    private static String providerLabel(String provider) {
        return switch (MusicProviderRegistry.normalize(provider)) {
            case "qq" -> "QQ音乐";
            case "kugou" -> "酷狗音乐";
            case "qishui" -> "汽水音乐";
            default -> "网易云";
        };
    }

    private static String communityProvider(Map<String, String> query) {
        return MusicProviderRegistry.normalize(HttpUtil.param(query, "provider", "netease"));
    }

    private static String sandboxPath(String path, Map<String, String> query) {
        if (query == null || query.isEmpty()) return path;
        StringBuilder remote = new StringBuilder(path).append('?');
        boolean first = true;
        for (Map.Entry<String, String> entry : query.entrySet()) {
            if (!first) remote.append('&');
            first = false;
            remote.append(URLEncoder.encode(entry.getKey(), StandardCharsets.UTF_8));
            remote.append('=');
            remote.append(URLEncoder.encode(entry.getValue(), StandardCharsets.UTF_8));
        }
        return remote.toString();
    }

    private static List<Song> songsFromPayload(Map<String, Object> root) {
        List<Song> songs = new ArrayList<>();
        for (Object item : SimpleJson.asList(root.get("songs"))) {
            Song song = Song.fromMap(SimpleJson.asMap(item));
            if (song.hasIdentity()) songs.add(song);
        }
        return songs;
    }

    private static Map<String, Object> emptySongs(String provider) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("provider", provider);
        body.put("songs", List.of());
        return body;
    }

    private static Map<String, Object> weatherPayload(String code) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("provider", "weather");
        body.put("code", code);
        body.put("songs", List.of());
        body.put("ok", true);
        return body;
    }

    private static Map<String, Object> updatePayload() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("version", "2.1.1");
        body.put("downloadUrl", "");
        body.put("releaseNotes", "New translucent playback page, clearer lyrics, independent lyric colors, rhythm mode, and adaptive preset performance.");
        body.put("fileSize", 0);
        return body;
    }

    private static Map<String, String> mapOf(String key, String value) {
        Map<String, String> map = new LinkedHashMap<>();
        map.put(key, value);
        return map;
    }

    private static Map<String, String> mapOf(String keyA, String valueA, String keyB, String valueB) {
        Map<String, String> map = new LinkedHashMap<>();
        map.put(keyA, valueA);
        map.put(keyB, valueB);
        return map;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "";
    }
}
