import com.femonster.core.OfficialBrowserLoginService;
import com.femonster.music.GenericMusicClient;
import com.femonster.music.MusicProviderRegistry;
import com.femonster.netease.NeteaseClient;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.Map;

public final class OfficialBrowserAccountSwitchProbe {
    private OfficialBrowserAccountSwitchProbe() {}

    public static void main(String[] args) throws Exception {
        Path sandbox = Files.createTempDirectory("fe-monster-account-switch-");
        OfficialBrowserLoginService service = null;
        try {
            Path dataDir = sandbox.resolve("data");
            Path sessionDir = sandbox.resolve("sessions");
            Path neteaseSession = sessionDir.resolve("netease.json");
            Path qqSession = sessionDir.resolve("qq.json");

            NeteaseClient netease = new NeteaseClient("http://127.0.0.1:3010", neteaseSession);
            GenericMusicClient qq = new GenericMusicClient("qq", "QQ Music", "http://127.0.0.1:3300", qqSession);
            netease.rememberBrowserSession(Map.of("MUSIC_U", "probe-session"));
            qq.rememberBrowserSession(Map.of("uin", "10001", "qm_keyst", "probe-session"));
            require(Files.isRegularFile(neteaseSession), "NetEase fixture session was not persisted");
            require(Files.isRegularFile(qqSession), "QQ fixture session was not persisted");

            Path profileRoot = dataDir.resolve("official-browser-login");
            Path neteaseMarker = marker(profileRoot, "netease");
            Path qqMarker = marker(profileRoot, "qq");
            Path kugouMarker = marker(profileRoot, "kugou");
            Path unrelatedMarker = marker(profileRoot, "unsupported");
            Path rootMarker = Files.writeString(profileRoot.resolve("keep-root.marker"), "keep");

            MusicProviderRegistry registry = new MusicProviderRegistry(netease, qq);
            service = new OfficialBrowserLoginService(dataDir, registry);
            Method clearProfile = OfficialBrowserLoginService.class
                .getDeclaredMethod("clearProviderProfile", String.class);
            clearProfile.setAccessible(true);

            require(registry.clearBrowserSession("netease"), "configured NetEase session was not cleared");
            invokeClearProfile(clearProfile, service, "netease");
            require(!Files.exists(neteaseSession), "NetEase persisted session remains");
            require(!Files.exists(neteaseMarker), "NetEase browser profile remains");
            require(Files.exists(qqSession), "clearing NetEase removed the QQ session");
            require(Files.exists(qqMarker), "clearing NetEase removed the QQ profile");
            require(Files.exists(rootMarker), "provider cleanup escaped into the profile root");

            require(registry.clearBrowserSession("qq"), "configured QQ session was not cleared");
            invokeClearProfile(clearProfile, service, "qq");
            require(!Files.exists(qqSession), "QQ persisted session remains");
            require(!Files.exists(qqMarker), "QQ browser profile remains");
            require(Files.exists(kugouMarker), "clearing QQ removed the Kugou profile");
            require(Files.exists(unrelatedMarker), "clearing QQ removed an unrelated profile");

            require(!registry.clearBrowserSession("kugou"), "unconfigured Kugou reported a cleared session");
            invokeClearProfile(clearProfile, service, "kugou");
            require(!Files.exists(kugouMarker), "unconfigured Kugou profile was not safely cleared");
            require(Files.exists(unrelatedMarker), "unconfigured cleanup removed another provider profile");

            boolean unsupportedRejected = false;
            try {
                service.switchAccount("unsupported");
            } catch (IllegalArgumentException expected) {
                unsupportedRejected = expected.getMessage().contains("unsupported browser login provider");
            }
            require(unsupportedRejected, "unsupported account switching was not rejected");
            require(Files.exists(unrelatedMarker), "rejected account switch changed its profile");

            System.out.println("Official browser account-switch isolation PASS");
        } finally {
            if (service != null) service.close();
            deleteTree(sandbox);
        }
    }

    private static Path marker(Path profileRoot, String provider) throws Exception {
        Path directory = profileRoot.resolve(provider);
        Files.createDirectories(directory);
        return Files.writeString(directory.resolve("profile.marker"), provider);
    }

    private static void invokeClearProfile(
        Method method,
        OfficialBrowserLoginService service,
        String provider
    ) throws Exception {
        try {
            method.invoke(service, provider);
        } catch (InvocationTargetException error) {
            Throwable cause = error.getCause();
            if (cause instanceof Exception exception) throw exception;
            throw error;
        }
    }

    private static void deleteTree(Path root) throws Exception {
        if (!Files.exists(root)) return;
        try (var paths = Files.walk(root)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}
