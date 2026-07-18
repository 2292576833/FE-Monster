package com.femonster.core;

import com.femonster.community.CommunityClient;
import com.femonster.music.GenericMusicClient;
import com.femonster.music.MusicApiConfigService;
import com.femonster.music.MusicProviderClient;
import com.femonster.music.MusicProviderRegistry;
import com.femonster.netease.NeteaseClient;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

public final class AppContext {
    public final ProjectPaths paths;
    public volatile NeteaseClient netease;
    public final MusicProviderRegistry music;
    public final MusicApiConfigService musicApis;
    public final RuntimeSettingsService runtimeSettings;
    public final GestureControlService gestureControl;
    public final NativeAudioEngine audioEngine;
    public final PlayerService player;
    public final VisualBridgeService visualBridge;
    public final WallpaperService wallpapers;
    public final CommunityClient community;
    public final CommunityModuleBridge communityModule;
    public final MachineIdentityService machine;
    public final UpdateService updates;

    public AppContext(ProjectPaths paths) throws IOException {
        this.paths = paths;
        this.musicApis = new MusicApiConfigService(paths);
        this.runtimeSettings = new RuntimeSettingsService(paths.dataDir.resolve("runtime-settings.json"));
        this.gestureControl = new GestureControlService(paths);
        this.audioEngine = new NativeAudioEngine(paths);
        this.netease = createNeteaseClient();
        this.music = new MusicProviderRegistry(providerClients(netease));
        this.communityModule = new CommunityModuleBridge(paths.root.resolve("plugins").resolve("community"));
        this.machine = new MachineIdentityService(paths, communityModule);
        this.updates = new UpdateService(paths);
        this.community = new CommunityService(paths.dataDir.resolve("community-server-url.txt"), machine, communityModule);
        this.player = new PlayerService(paths.dataDir.resolve("player-state.json"), music);
        this.visualBridge = new VisualBridgeService(player, audioEngine);
        this.wallpapers = new WallpaperService(paths.dataDir);
        if (runtimeSettings.gestureControlEnabled()) {
            this.gestureControl.applyEnabled(true, runtimeSettings.gestureCameraSource());
        }
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            this.gestureControl.stop();
            this.musicApis.close();
        }, "fe-monster-local-services-shutdown"));
    }

    public synchronized void reloadMusicProviders() {
        NeteaseClient nextNetease = createNeteaseClient();
        this.netease = nextNetease;
        this.music.replace(providerClients(nextNetease));
    }

    private NeteaseClient createNeteaseClient() {
        return new NeteaseClient(musicApis.provider("netease").baseUrl(), paths.dataDir.resolve("netease-auth.json"));
    }

    private MusicProviderClient[] providerClients(NeteaseClient neteaseClient) {
        List<MusicProviderClient> clients = new ArrayList<>();
        clients.add(neteaseClient);
        for (String id : List.of("qq", "kugou", "qishui")) {
            MusicApiConfigService.ProviderConfig config = musicApis.provider(id);
            if (!config.enabled() || !config.configured()) continue;
            clients.add(new GenericMusicClient(
                config.id(),
                config.label(),
                config.baseUrl(),
                paths.dataDir.resolve(config.id() + "-auth.json")
            ));
        }
        return clients.toArray(MusicProviderClient[]::new);
    }
}
