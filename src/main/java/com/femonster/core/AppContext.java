package com.femonster.core;

import com.femonster.community.CommunityClient;
import com.femonster.music.MusicApiConfigService;
import com.femonster.music.MusicProviderClient;
import com.femonster.music.MusicProviderRegistry;
import com.femonster.music.ProviderProtocolClient;
import com.femonster.netease.NeteaseClient;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

public final class AppContext implements AutoCloseable {
    public final ProjectPaths paths;
    public volatile NeteaseClient netease;
    public final MusicProviderRegistry music;
    public final OfficialBrowserLoginService browserLogin;
    public final MusicApiConfigService musicApis;
    public final AchievementStateService achievements;
    public final ClientPreferenceService clientPreferences;
    public final RuntimeSettingsService runtimeSettings;
    public final NativeAudioEngine audioEngine;
    public final PlayerService player;
    public final VisualBridgeService visualBridge;
    public final WallpaperService wallpapers;
    public final UserCursorService userCursors;
    public final CommunityClient community;
    public final CommunityModuleBridge communityModule;
    public final MachineIdentityService machine;
    public final UpdateService updates;
    private final AtomicBoolean interactiveServicesEnabled = new AtomicBoolean(false);
    private final AtomicBoolean closed = new AtomicBoolean(false);

    public AppContext(ProjectPaths paths) throws IOException {
        this.paths = paths;
        this.musicApis = new MusicApiConfigService(paths);
        this.achievements = new AchievementStateService(paths.dataDir.resolve("achievement-state.json"));
        this.clientPreferences = new ClientPreferenceService(paths.dataDir.resolve("client-preferences.json"));
        this.runtimeSettings = new RuntimeSettingsService(paths.dataDir.resolve("runtime-settings.json"));
        this.audioEngine = new NativeAudioEngine(paths);
        this.netease = createNeteaseClient();
        this.music = new MusicProviderRegistry(provider -> {
            if (interactiveServicesEnabled.get()) {
                musicApis.awaitReady(provider, Duration.ofSeconds(7));
            }
        }, providerClients(netease));
        this.browserLogin = new OfficialBrowserLoginService(paths.dataDir, music);
        this.communityModule = new CommunityModuleBridge(paths.root.resolve("plugins").resolve("community"));
        this.machine = new MachineIdentityService(paths, communityModule);
        this.updates = new UpdateService(paths);
        this.community = new CommunityService(paths.dataDir.resolve("community-server-url.txt"), machine, communityModule);
        this.player = new PlayerService(paths.dataDir.resolve("player-state.json"), music);
        this.visualBridge = new VisualBridgeService(player, audioEngine);
        this.wallpapers = new WallpaperService(paths.dataDir);
        this.userCursors = new UserCursorService(paths.dataDir);
        Runtime.getRuntime().addShutdownHook(new Thread(this::close, "fe-monster-local-services-shutdown"));
    }

    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) return;
        closeService("player", this.player::close);
        closeService("audio", this.audioEngine::close);
        closeService("browserLogin", this.browserLogin::close);
        closeService("musicApis", this.musicApis::close);
    }

    private static void closeService(String name, Runnable closeAction) {
        try {
            closeAction.run();
        } catch (Throwable error) {
            System.err.println("FE Monster could not close " + name + " cleanly: " + error.getMessage());
            error.printStackTrace(System.err);
        }
    }

    public synchronized void reloadMusicProviders() {
        NeteaseClient nextNetease = createNeteaseClient();
        this.netease = nextNetease;
        this.music.replace(providerClients(nextNetease));
    }

    public Map<String, Object> activateInteractiveServices() {
        return activateInteractiveServices("netease");
    }

    public Map<String, Object> activateInteractiveServices(String provider) {
        boolean firstActivation = interactiveServicesEnabled.compareAndSet(false, true);
        if (firstActivation) music.resetProviderAccess();
        String identityProvider = MusicProviderRegistry.normalize(provider);
        boolean musicProviderReady = musicApis.awaitReady(identityProvider, Duration.ofSeconds(7));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("active", true);
        body.put("firstActivation", firstActivation);
        body.put("provider", identityProvider);
        body.put("musicProviderReady", musicProviderReady);
        return body;
    }

    private NeteaseClient createNeteaseClient() {
        MusicApiConfigService.ProviderConfig config = musicApis.provider("netease");
        if (!config.enabled() || !config.configured()) return null;
        return new NeteaseClient(config.baseUrl(), paths.dataDir.resolve("netease-auth.json"));
    }

    private MusicProviderClient[] providerClients(NeteaseClient neteaseClient) {
        List<MusicProviderClient> clients = new ArrayList<>();
        if (neteaseClient != null) clients.add(neteaseClient);
        for (String id : List.of("qq", "kugou", "qishui")) {
            MusicApiConfigService.ProviderConfig config = musicApis.provider(id);
            if (!config.enabled() || !config.configured()) continue;
            clients.add(new ProviderProtocolClient(
                config.id(),
                config.label(),
                config.baseUrl(),
                paths.dataDir.resolve(config.id() + "-auth.json")
            ));
        }
        return clients.toArray(MusicProviderClient[]::new);
    }
}
