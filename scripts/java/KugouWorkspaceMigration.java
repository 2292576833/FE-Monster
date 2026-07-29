package com.femonster.music;

import com.femonster.core.ProjectPaths;

public final class KugouWorkspaceMigration {
    private KugouWorkspaceMigration() {
    }

    public static void main(String[] args) throws Exception {
        try (MusicApiConfigService service = new MusicApiConfigService(ProjectPaths.detect())) {
            MusicApiConfigService.ProviderConfig kugou = service.provider("kugou");
            boolean pass = "2.0.1".equals(kugou.manifestVersion())
                && "imported-zip".equals(kugou.source())
                && !kugou.packageDirectory().isBlank();
            System.out.println("{"
                + "\"pass\":" + pass
                + ",\"version\":\"" + kugou.manifestVersion() + "\""
                + ",\"package\":\"" + kugou.packageDirectory() + "\""
                + ",\"source\":\"" + kugou.source() + "\""
                + "}");
            if (!pass) System.exit(1);
        }
    }
}
