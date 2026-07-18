package com.femonster.music;

/**
 * Compatibility entry point for older launchers. The provider definitions and
 * lifecycle now live exclusively in {@link MusicApiConfigService}.
 */
@Deprecated
public final class MusicApiBootstrap {
    private MusicApiBootstrap() {
    }

    public static void ensureAvailable(MusicApiConfigService service) {
        if (service != null) service.startAutostart();
    }
}
