package com.femonster.core;

import com.femonster.netease.NeteaseClient;

public final class AppContext {
    public final ProjectPaths paths;
    public final NeteaseClient netease;
    public final PlayerService player;
    public final VisualBridgeService visualBridge;

    public AppContext(ProjectPaths paths) {
        this.paths = paths;
        this.netease = new NeteaseClient(
            System.getenv().getOrDefault("FE_NETEASE_BASE_URL", "http://127.0.0.1:3010"),
            paths.dataDir.resolve("netease-auth.json")
        );
        this.player = new PlayerService(paths.dataDir.resolve("player-state.json"), netease);
        this.visualBridge = new VisualBridgeService(player);
    }
}
