package com.femonster.core;

import java.nio.file.Path;

public final class ProjectPaths {
    public final Path root;
    public final Path webRoot;
    public final Path dataDir;

    private ProjectPaths(Path root, Path webRoot, Path dataDir) {
        this.root = root;
        this.webRoot = webRoot;
        this.dataDir = dataDir;
    }

    public static ProjectPaths detect() {
        Path root = Path.of("").toAbsolutePath().normalize();
        String webOverride = System.getenv("FE_MONSTER_WEB_ROOT");
        Path webRoot = webOverride == null || webOverride.isBlank()
            ? root.resolve("web")
            : Path.of(webOverride).toAbsolutePath().normalize();
        Path dataDir = root.resolve("data");
        return new ProjectPaths(root, webRoot, dataDir);
    }
}
