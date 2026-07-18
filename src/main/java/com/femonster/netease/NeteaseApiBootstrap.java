package com.femonster.netease;

import com.femonster.music.MusicApiConfigService;

/** @deprecated Use MusicApiConfigService as the single provider lifecycle source. */
@Deprecated
public final class NeteaseApiBootstrap {
    private NeteaseApiBootstrap() {
    }

    public static void ensureAvailable(MusicApiConfigService service) {
        if (service != null) service.ensureStarted("netease");
    }
}
