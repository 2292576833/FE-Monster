package com.femonster.core;

import com.femonster.community.CommunityClient;
import com.femonster.music.GenericMusicClient;
import com.femonster.music.MusicProviderRegistry;
import com.femonster.netease.NeteaseClient;

public final class AppContext {
    public final ProjectPaths paths;
    public final NeteaseClient netease;
    public final MusicProviderRegistry music;
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

    public AppContext(ProjectPaths paths) {
        this.paths = paths;
        this.runtimeSettings = new RuntimeSettingsService(paths.dataDir.resolve("runtime-settings.json"));
        this.gestureControl = new GestureControlService(paths);
        this.audioEngine = new NativeAudioEngine(paths);
        this.netease = new NeteaseClient(
            System.getenv().getOrDefault("FE_NETEASE_BASE_URL", "http://127.0.0.1:3010"),
            paths.dataDir.resolve("netease-auth.json")
        );
        this.music = new MusicProviderRegistry(
            netease,
            new GenericMusicClient("qq", "QQ\u97f3\u4e50", System.getenv().getOrDefault("FE_QQ_BASE_URL", "http://127.0.0.1:3011"), paths.dataDir.resolve("qq-auth.json")),
            new GenericMusicClient("kugou", "\u9177\u72d7\u97f3\u4e50", System.getenv().getOrDefault("FE_KUGOU_BASE_URL", "http://127.0.0.1:3012"), paths.dataDir.resolve("kugou-auth.json"))
        );
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
        Runtime.getRuntime().addShutdownHook(new Thread(this.gestureControl::stop, "fe-monster-gesture-shutdown"));
    }
}
