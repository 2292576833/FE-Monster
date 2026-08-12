package com.femonster.core;

import com.femonster.model.Song;
import com.femonster.music.MusicProviderClient;
import com.femonster.music.MusicProviderRegistry;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/** Regression probe for QR login completing only after account and playlists are ready. */
public final class BrowserLoginSynchronizationProbe {
    private BrowserLoginSynchronizationProbe() {
    }

    public static void main(String[] args) throws Exception {
        StubProvider provider = new StubProvider();
        MusicProviderRegistry registry = new MusicProviderRegistry(provider);

        Map<String, Object> pending = registry.synchronizeBrowserSession(
            "qq",
            Map.of("uin", "10001", "qm_keyst", "secret")
        );
        require(provider.remembered, "browser cookies were not persisted before synchronization");
        require(!Boolean.TRUE.equals(pending.get("ready")), "login completed before playlists were ready");
        require(provider.clearCalls == 0, "a retryable synchronization prematurely discarded its session");

        Map<String, Object> ready = registry.synchronizeBrowserSession(
            "qq",
            Map.of("uin", "10001", "qm_keyst", "secret")
        );
        require(Boolean.TRUE.equals(ready.get("ready")), "ready account and playlists did not complete login");
        require(Boolean.TRUE.equals(ready.get("loggedIn")), "synchronized account was not exposed as logged in");
        require(Boolean.TRUE.equals(ready.get("playlistsReady")), "playlist readiness was not exposed");
        require(provider.playlistCalls == 2, "playlist readiness was not rechecked after the first pending response");
        require(provider.clearCalls == 0, "successful synchronization cleared the authenticated session");
        require(!ready.toString().contains("secret"), "raw browser credentials leaked into the synchronization payload");

        verifyPublicFallbackCannotCompleteLogin();
        verifyAuthenticatedEmptyLibraryCompletesLogin();
        verifyManagedKugouQrCompletesWithoutBrowserCookies();

        long wakeLatencyNanos = verifyLongPollWakeup(registry);
        verifySlowSynchronizationCompletesInsideBudget();
        verifyBoundedSlowSynchronization();
        verifyBoundedPermanentPlaylistFailure();
        verifyTerminalSessionRetention();

        System.out.printf(
            Locale.ROOT,
            "Browser login long-poll wake latency: %.3f ms%n",
            wakeLatencyNanos / 1_000_000.0
        );
        System.out.println("Browser login synchronization probe: OK");
    }

    private static void verifyPublicFallbackCannotCompleteLogin() {
        PublicFallbackProvider provider = new PublicFallbackProvider();
        Map<String, Object> result = new MusicProviderRegistry(provider).synchronizeBrowserSession(
            "qq",
            Map.of("uin", "10001", "qm_keyst", "secret")
        );
        require(!Boolean.TRUE.equals(result.get("ready")),
            "public/recommended playlists were accepted as the authenticated user library");
        require(!Boolean.TRUE.equals(result.get("playlistsReady")),
            "public/recommended playlists exposed authenticated library readiness");
        require(provider.clearCalls == 0, "registry prematurely cleared a retryable public-fallback result");
    }

    private static void verifyAuthenticatedEmptyLibraryCompletesLogin() {
        EmptyLibraryProvider provider = new EmptyLibraryProvider();
        Map<String, Object> result = new MusicProviderRegistry(provider).synchronizeBrowserSession(
            "qq",
            Map.of("uin", "10001", "qm_keyst", "secret")
        );
        require(Boolean.TRUE.equals(result.get("ready")),
            "a verified authenticated account with a legitimate empty library was rejected");
        require(Boolean.TRUE.equals(result.get("playlistsReady")),
            "authenticated empty-library readiness was not exposed");
        require(provider.clearCalls == 0, "verified empty library unexpectedly cleared its session");
    }

    @SuppressWarnings("unchecked")
    private static void verifyManagedKugouQrCompletesWithoutBrowserCookies() throws Exception {
        ManagedKugouProvider provider = new ManagedKugouProvider();
        MusicProviderRegistry registry = new MusicProviderRegistry(provider);
        Path dataDir = Files.createTempDirectory("fe-monster-kugou-managed-qr-");
        try (OfficialBrowserLoginService service = new OfficialBrowserLoginService(dataDir, registry)) {
            Field providersField = OfficialBrowserLoginService.class.getDeclaredField("PROVIDERS");
            providersField.setAccessible(true);
            Object spec = ((Map<String, Object>) providersField.get(null)).get("kugou");
            Class<?> sessionClass = Class.forName("com.femonster.core.OfficialBrowserLoginService$LoginSession");
            Constructor<?> constructor = sessionClass.getDeclaredConstructor(
                String.class,
                String.class,
                spec.getClass(),
                String.class,
                int.class,
                Process.class
            );
            constructor.setAccessible(true);
            Object session = constructor.newInstance(
                "managed-kugou-session",
                "kugou",
                spec,
                "probe-browser.exe",
                0,
                null
            );
            for (Map.Entry<String, Object> value : Map.<String, Object>of(
                "providerManagedLogin", true,
                "providerLoginKey", "fixture-qr-key",
                "importPrepared", true
            ).entrySet()) {
                Field field = sessionClass.getDeclaredField(value.getKey());
                field.setAccessible(true);
                field.set(session, value.getValue());
            }
            Field sessionsField = OfficialBrowserLoginService.class.getDeclaredField("sessions");
            sessionsField.setAccessible(true);
            ((Map<String, Object>) sessionsField.get(service)).put("managed-kugou-session", session);

            invokeMonitor(service, session);
            Map<String, Object> status = service.status("kugou", "managed-kugou-session");
            require("success".equals(status.get("phase")), "managed Kugou QR did not complete: " + status);
            require(Boolean.TRUE.equals(status.get("accountReady")), "managed Kugou account was not ready");
            require(Boolean.TRUE.equals(status.get("playlistsReady")), "managed Kugou playlists were not ready");
            require(provider.pollCalls == 1, "managed Kugou QR status was not polled exactly once");
            require(provider.browserCookieImports == 0,
                "managed Kugou QR incorrectly imported incompatible browser cookies");
        } finally {
            Files.deleteIfExists(dataDir);
        }
    }

    private static void verifySlowSynchronizationCompletesInsideBudget() throws Exception {
        SlowSuccessfulProvider provider = new SlowSuccessfulProvider();
        MusicProviderRegistry registry = new MusicProviderRegistry(provider);
        Path dataDir = Files.createTempDirectory("fe-monster-login-slow-success-");
        try (OfficialBrowserLoginService service = new OfficialBrowserLoginService(
            dataDir,
            registry,
            Duration.ofMillis(250),
            Duration.ofMillis(600)
        )) {
            Object session = installAuthenticatedSession(service, "slow-success-session");
            invokeMonitor(service, session);
            Map<String, Object> status = service.status("qq", "slow-success-session");
            require(Boolean.TRUE.equals(status.get("terminal")), "slow in-budget synchronization did not finish");
            require("success".equals(status.get("phase")), "slow in-budget synchronization failed: " + status);
            require(Boolean.TRUE.equals(status.get("loggedIn")), "slow in-budget synchronization was not logged in");
            require(Boolean.TRUE.equals(status.get("accountReady")), "slow account did not become ready");
            require(Boolean.TRUE.equals(status.get("playlistsReady")), "slow playlists did not become ready");
            require(((Number) status.get("syncAttempts")).intValue() == 1, "slow success used unexpected retries");
        } finally {
            Files.deleteIfExists(dataDir);
        }
    }

    private static void verifyBoundedSlowSynchronization() throws Exception {
        SlowProvider provider = new SlowProvider();
        MusicProviderRegistry registry = new MusicProviderRegistry(provider);
        Path dataDir = Files.createTempDirectory("fe-monster-login-slow-sync-");
        long started = System.nanoTime();
        try (OfficialBrowserLoginService service = new OfficialBrowserLoginService(
            dataDir,
            registry,
            Duration.ofMillis(45),
            Duration.ofMillis(170)
        )) {
            Object session = installAuthenticatedSession(service, "slow-sync-session");
            Map<String, Object> status = driveUntilTerminal(service, session, "slow-sync-session", 12, 20L);
            long elapsedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
            require(Boolean.TRUE.equals(status.get("terminal")), "slow provider synchronization never became terminal");
            require(Boolean.TRUE.equals(status.get("retryable")), "slow provider failure was not retryable");
            require("sync-failed".equals(status.get("phase")), "slow provider ended in the wrong phase: " + status);
            require(!Boolean.TRUE.equals(status.get("loggedIn")), "slow provider was reported logged in before synchronization finished");
            require(!Boolean.TRUE.equals(status.get("syncing")), "slow provider remained indefinitely in syncing");
            require(elapsedMillis < 1_000L, "slow provider exceeded the bounded synchronization test budget: " + elapsedMillis + " ms");
            require(provider.interrupted, "timed-out provider synchronization was not cancelled");
            require(provider.clearCalls >= 2,
                "timed-out synchronization did not clear both the previous and failed imported session");
        } finally {
            Files.deleteIfExists(dataDir);
        }
    }

    @SuppressWarnings("unchecked")
    private static void verifyTerminalSessionRetention() throws Exception {
        EmptyLibraryProvider provider = new EmptyLibraryProvider();
        MusicProviderRegistry registry = new MusicProviderRegistry(provider);
        Path dataDir = Files.createTempDirectory("fe-monster-login-terminal-retention-");
        try (OfficialBrowserLoginService service = new OfficialBrowserLoginService(
            dataDir,
            registry,
            Duration.ofMillis(120),
            Duration.ofMillis(400),
            Duration.ofMillis(45)
        )) {
            Object session = installAuthenticatedSession(service, "terminal-retention-session");
            invokeMonitor(service, session);
            Map<String, Object> status = service.status("qq", "terminal-retention-session");
            require("success".equals(status.get("phase")), "terminal success was not retained for the UI");

            Field cookiesField = session.getClass().getDeclaredField("authenticatedCookies");
            cookiesField.setAccessible(true);
            require(((Map<?, ?>) cookiesField.get(session)).isEmpty(),
                "terminal session retained its authenticated browser cookie snapshot");

            Field sessionsField = OfficialBrowserLoginService.class.getDeclaredField("sessions");
            sessionsField.setAccessible(true);
            Map<String, Object> sessions = (Map<String, Object>) sessionsField.get(service);
            require(sessions.containsKey("terminal-retention-session"),
                "terminal result was removed before the UI could read it");
            long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(800L);
            while (sessions.containsKey("terminal-retention-session") && System.nanoTime() < deadline) {
                Thread.sleep(10L);
            }
            require(!sessions.containsKey("terminal-retention-session"),
                "terminal browser-login session was retained without a bound");
        } finally {
            Files.deleteIfExists(dataDir);
        }
    }

    private static void verifyBoundedPermanentPlaylistFailure() throws Exception {
        PermanentPlaylistFailureProvider provider = new PermanentPlaylistFailureProvider();
        MusicProviderRegistry registry = new MusicProviderRegistry(provider);
        Path dataDir = Files.createTempDirectory("fe-monster-login-playlist-failure-");
        try (OfficialBrowserLoginService service = new OfficialBrowserLoginService(
            dataDir,
            registry,
            Duration.ofMillis(80),
            Duration.ofMillis(180)
        )) {
            Object session = installAuthenticatedSession(service, "playlist-failure-session");
            Map<String, Object> status = driveUntilTerminal(service, session, "playlist-failure-session", 16, 25L);
            require(Boolean.TRUE.equals(status.get("terminal")), "permanent playlist failure never became terminal");
            require(Boolean.TRUE.equals(status.get("retryable")), "permanent playlist failure was not retryable");
            require("sync-failed".equals(status.get("phase")), "permanent playlist failure ended in the wrong phase: " + status);
            require(Boolean.TRUE.equals(status.get("accountReady")), "authenticated account readiness was lost during playlist retries");
            require(!Boolean.TRUE.equals(status.get("playlistsReady")), "failed playlists were incorrectly marked ready");
            require(provider.playlistCalls > 1, "permanent playlist failure was not retried inside the total budget");
            require(provider.clearCalls >= 2,
                "permanent synchronization failure did not clear both the previous and failed imported session");
        } finally {
            Files.deleteIfExists(dataDir);
        }
    }

    @SuppressWarnings("unchecked")
    private static Object installAuthenticatedSession(OfficialBrowserLoginService service, String sessionId) throws Exception {
        Field providersField = OfficialBrowserLoginService.class.getDeclaredField("PROVIDERS");
        providersField.setAccessible(true);
        Object spec = ((Map<String, Object>) providersField.get(null)).get("qq");
        Class<?> sessionClass = Class.forName("com.femonster.core.OfficialBrowserLoginService$LoginSession");
        Constructor<?> constructor = sessionClass.getDeclaredConstructor(
            String.class,
            String.class,
            spec.getClass(),
            String.class,
            int.class,
            Process.class
        );
        constructor.setAccessible(true);
        Object session = constructor.newInstance(sessionId, "qq", spec, "probe-browser.exe", 0, null);
        Field cookies = sessionClass.getDeclaredField("authenticatedCookies");
        cookies.setAccessible(true);
        cookies.set(session, Map.of("uin", "10001", "qm_keyst", "secret"));
        Field sessionsField = OfficialBrowserLoginService.class.getDeclaredField("sessions");
        sessionsField.setAccessible(true);
        ((Map<String, Object>) sessionsField.get(service)).put(sessionId, session);
        return session;
    }

    private static Map<String, Object> driveUntilTerminal(
        OfficialBrowserLoginService service,
        Object session,
        String sessionId,
        int maximumAttempts,
        long retryDelayMillis
    ) throws Exception {
        Map<String, Object> status = service.status("qq", sessionId);
        boolean observedRetrying = false;
        boolean observedCookieInvalidation = false;
        Field cookiesField = session.getClass().getDeclaredField("authenticatedCookies");
        cookiesField.setAccessible(true);
        for (int attempt = 0; attempt < maximumAttempts && !Boolean.TRUE.equals(status.get("terminal")); attempt++) {
            Map<?, ?> currentCookies = (Map<?, ?>) cookiesField.get(session);
            if (currentCookies.isEmpty()) {
                cookiesField.set(session, Map.of("uin", "10001", "qm_keyst", "secret"));
            }
            invokeMonitor(service, session);
            status = service.status("qq", sessionId);
            observedRetrying |= "sync-retrying".equals(status.get("phase"));
            observedCookieInvalidation |= "sync-retrying".equals(status.get("phase"))
                && ((Map<?, ?>) cookiesField.get(session)).isEmpty();
            if (!Boolean.TRUE.equals(status.get("terminal"))) Thread.sleep(retryDelayMillis);
        }
        require(observedRetrying, "provider failure skipped the visible retrying state");
        require(observedCookieInvalidation,
            "provider failure froze the first browser-cookie snapshot instead of observing a new scan");
        return status;
    }

    private static void invokeMonitor(OfficialBrowserLoginService service, Object session) throws Exception {
        Method monitor = OfficialBrowserLoginService.class.getDeclaredMethod("monitorSession", session.getClass());
        monitor.setAccessible(true);
        monitor.invoke(service, session);
    }

    @SuppressWarnings("unchecked")
    private static long verifyLongPollWakeup(MusicProviderRegistry registry) throws Exception {
        Path dataDir = Files.createTempDirectory("fe-monster-login-long-poll-");
        ExecutorService executor = Executors.newSingleThreadExecutor();
        try (OfficialBrowserLoginService service = new OfficialBrowserLoginService(dataDir, registry)) {
            Field providersField = OfficialBrowserLoginService.class.getDeclaredField("PROVIDERS");
            providersField.setAccessible(true);
            Object spec = ((Map<String, Object>) providersField.get(null)).get("qq");

            Class<?> sessionClass = Class.forName(
                "com.femonster.core.OfficialBrowserLoginService$LoginSession"
            );
            Constructor<?> constructor = sessionClass.getDeclaredConstructor(
                String.class,
                String.class,
                spec.getClass(),
                String.class,
                int.class,
                Process.class
            );
            constructor.setAccessible(true);
            Object session = constructor.newInstance(
                "probe-session",
                "qq",
                spec,
                "probe-browser.exe",
                0,
                null
            );

            Field sessionsField = OfficialBrowserLoginService.class.getDeclaredField("sessions");
            sessionsField.setAccessible(true);
            ((Map<String, Object>) sessionsField.get(service)).put("probe-session", session);

            Future<Map<String, Object>> waiting = executor.submit(
                () -> service.status("qq", "probe-session", 0L, 15_000)
            );
            Thread.sleep(80L);
            require(!waiting.isDone(), "long poll returned before the session revision changed");

            Method transition = OfficialBrowserLoginService.class.getDeclaredMethod(
                "transition",
                sessionClass,
                String.class,
                String.class
            );
            transition.setAccessible(true);
            long releasedNanos = System.nanoTime();
            synchronized (session) {
                transition.invoke(null, session, "waiting", "probe revision changed");
            }
            Map<String, Object> result = waiting.get(2, TimeUnit.SECONDS);
            long wakeLatencyNanos = System.nanoTime() - releasedNanos;
            long wakeLatencyMillis = TimeUnit.NANOSECONDS.toMillis(wakeLatencyNanos);

            require(((Number) result.get("revision")).longValue() == 1L,
                "long poll did not return the changed revision");
            require(wakeLatencyMillis < 500L,
                "long-poll wake latency was too high: " + wakeLatencyMillis + " ms");
            return wakeLatencyNanos;
        } finally {
            executor.shutdownNow();
            Files.deleteIfExists(dataDir);
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }

    private static final class StubProvider implements MusicProviderClient {
        private boolean remembered;
        private int playlistCalls;
        int clearCalls;

        @Override public String id() { return "qq"; }
        @Override public String label() { return "QQ Music"; }
        @Override public String baseUrl() { return "http://127.0.0.1:3011"; }
        @Override public Map<String, Object> serviceStatus() { return Map.of("ok", true); }
        @Override public Map<String, Object> accountPayload() {
            require(remembered, "account was read before browser cookies were persisted");
            return Map.of("ok", true, "loggedIn", true, "account", Map.of("userId", "10001"));
        }
        @Override public void rememberBrowserSession(Map<String, String> cookies) { remembered = true; }
        @Override public void clearBrowserSession() { clearCalls += 1; remembered = false; }
        @Override public Map<String, Object> userPlaylistsPayload() {
            playlistCalls += 1;
            return playlistCalls == 1
                ? Map.of("ok", false, "loggedIn", true, "userLibrary", false, "error", "still syncing", "playlists", List.of())
                : Map.of("ok", true, "loggedIn", true, "userLibrary", true, "playlists", List.of(Map.of("id", "liked")));
        }
        @Override public Map<String, Object> search(String keyword, int page, int limit) { return Map.of(); }
        @Override public String songUrl(String id, String quality) { return ""; }
        @Override public Map<String, Object> songUrlPayload(String id, String quality) { return Map.of(); }
        @Override public Map<String, Object> lyricPayload(String songId) { return Map.of(); }
        @Override public Map<String, Object> recommendedPlaylistsPayload(int limit) { return Map.of(); }
        @Override public Map<String, Object> playlistTracksPayload(String playlistId, int limit) { return Map.of(); }
        @Override public Map<String, Object> addSongToPlaylistPayload(String playlistId, Song song) { return Map.of(); }
        @Override public Map<String, Object> commentsPayload(String songId, int limit) { return Map.of(); }
    }

    private static final class SlowProvider implements MusicProviderClient {
        private volatile boolean interrupted;
        private int clearCalls;

        @Override public String id() { return "qq"; }
        @Override public String label() { return "QQ Music"; }
        @Override public String baseUrl() { return "http://127.0.0.1:3011"; }
        @Override public Map<String, Object> serviceStatus() { return Map.of("ok", true); }
        @Override public Map<String, Object> accountPayload() {
            try {
                Thread.sleep(5_000L);
            } catch (InterruptedException error) {
                interrupted = true;
                Thread.currentThread().interrupt();
            }
            return Map.of("ok", true, "loggedIn", true, "account", Map.of("userId", "10001"));
        }
        @Override public void rememberBrowserSession(Map<String, String> cookies) { }
        @Override public void clearBrowserSession() { clearCalls += 1; }
        @Override public Map<String, Object> userPlaylistsPayload() { return Map.of("ok", true, "playlists", List.of(Map.of("id", "liked"))); }
        @Override public Map<String, Object> search(String keyword, int page, int limit) { return Map.of(); }
        @Override public String songUrl(String id, String quality) { return ""; }
        @Override public Map<String, Object> songUrlPayload(String id, String quality) { return Map.of(); }
        @Override public Map<String, Object> lyricPayload(String songId) { return Map.of(); }
        @Override public Map<String, Object> recommendedPlaylistsPayload(int limit) { return Map.of(); }
        @Override public Map<String, Object> playlistTracksPayload(String playlistId, int limit) { return Map.of(); }
        @Override public Map<String, Object> addSongToPlaylistPayload(String playlistId, Song song) { return Map.of(); }
        @Override public Map<String, Object> commentsPayload(String songId, int limit) { return Map.of(); }
    }

    private static final class ManagedKugouProvider implements MusicProviderClient {
        private int pollCalls;
        private int browserCookieImports;

        @Override public String id() { return "kugou"; }
        @Override public String label() { return "Kugou Music"; }
        @Override public String baseUrl() { return "http://127.0.0.1:3012"; }
        @Override public Map<String, Object> serviceStatus() { return Map.of("ok", true); }
        @Override public Map<String, Object> accountPayload() {
            return Map.of("ok", true, "loggedIn", true, "account", Map.of(
                "userId", "42",
                "nickname", "Fixture Listener",
                "avatarUrl", "https://fixture.invalid/avatar.jpg",
                "vipStatus", "active"
            ));
        }
        @Override public Map<String, Object> pollProviderLogin(String key) {
            pollCalls += 1;
            require("fixture-qr-key".equals(key), "managed Kugou QR key changed");
            return Map.of("authenticated", true, "status", 4);
        }
        @Override public void rememberBrowserSession(Map<String, String> cookies) { browserCookieImports += 1; }
        @Override public Map<String, Object> userPlaylistsPayload() {
            return Map.of(
                "ok", true,
                "loggedIn", true,
                "userLibrary", true,
                "playlists", List.of(
                    Map.of("id", "100", "name", "我喜欢"),
                    Map.of("id", "101", "name", "通勤歌单")
                )
            );
        }
        @Override public Map<String, Object> search(String keyword, int page, int limit) { return Map.of(); }
        @Override public String songUrl(String id, String quality) { return ""; }
        @Override public Map<String, Object> songUrlPayload(String id, String quality) { return Map.of(); }
        @Override public Map<String, Object> lyricPayload(String songId) { return Map.of(); }
        @Override public Map<String, Object> recommendedPlaylistsPayload(int limit) { return Map.of(); }
        @Override public Map<String, Object> playlistTracksPayload(String playlistId, int limit) { return Map.of(); }
        @Override public Map<String, Object> addSongToPlaylistPayload(String playlistId, Song song) { return Map.of(); }
        @Override public Map<String, Object> commentsPayload(String songId, int limit) { return Map.of(); }
    }

    private abstract static class ContractProvider implements MusicProviderClient {
        int clearCalls;

        @Override public String id() { return "qq"; }
        @Override public String label() { return "QQ Music"; }
        @Override public String baseUrl() { return "http://127.0.0.1:3011"; }
        @Override public Map<String, Object> serviceStatus() { return Map.of("ok", true); }
        @Override public Map<String, Object> accountPayload() {
            return Map.of("ok", true, "loggedIn", true, "account", Map.of("userId", "10001"));
        }
        @Override public void rememberBrowserSession(Map<String, String> cookies) { }
        @Override public void clearBrowserSession() { clearCalls += 1; }
        @Override public Map<String, Object> search(String keyword, int page, int limit) { return Map.of(); }
        @Override public String songUrl(String id, String quality) { return ""; }
        @Override public Map<String, Object> songUrlPayload(String id, String quality) { return Map.of(); }
        @Override public Map<String, Object> lyricPayload(String songId) { return Map.of(); }
        @Override public Map<String, Object> recommendedPlaylistsPayload(int limit) { return Map.of(); }
        @Override public Map<String, Object> playlistTracksPayload(String playlistId, int limit) { return Map.of(); }
        @Override public Map<String, Object> addSongToPlaylistPayload(String playlistId, Song song) { return Map.of(); }
        @Override public Map<String, Object> commentsPayload(String songId, int limit) { return Map.of(); }
    }

    private static final class PublicFallbackProvider extends ContractProvider {
        @Override public Map<String, Object> userPlaylistsPayload() {
            return Map.of(
                "ok", true,
                "loggedIn", false,
                "userLibrary", false,
                "source", "public-fallback",
                "playlists", List.of(Map.of("id", "public-chart"))
            );
        }
    }

    private static final class EmptyLibraryProvider extends ContractProvider {
        @Override public Map<String, Object> userPlaylistsPayload() {
            return Map.of("ok", true, "loggedIn", true, "userLibrary", true, "playlists", List.of());
        }
    }

    private static final class SlowSuccessfulProvider implements MusicProviderClient {
        @Override public String id() { return "qq"; }
        @Override public String label() { return "QQ Music"; }
        @Override public String baseUrl() { return "http://127.0.0.1:3011"; }
        @Override public Map<String, Object> serviceStatus() { return Map.of("ok", true); }
        @Override public Map<String, Object> accountPayload() {
            try {
                Thread.sleep(40L);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                return Map.of("ok", false, "loggedIn", false);
            }
            return Map.of("ok", true, "loggedIn", true, "account", Map.of("userId", "10001"));
        }
        @Override public void rememberBrowserSession(Map<String, String> cookies) { }
        @Override public Map<String, Object> userPlaylistsPayload() {
            return Map.of("ok", true, "loggedIn", true, "userLibrary", true, "playlists", List.of(Map.of("id", "liked")));
        }
        @Override public Map<String, Object> search(String keyword, int page, int limit) { return Map.of(); }
        @Override public String songUrl(String id, String quality) { return ""; }
        @Override public Map<String, Object> songUrlPayload(String id, String quality) { return Map.of(); }
        @Override public Map<String, Object> lyricPayload(String songId) { return Map.of(); }
        @Override public Map<String, Object> recommendedPlaylistsPayload(int limit) { return Map.of(); }
        @Override public Map<String, Object> playlistTracksPayload(String playlistId, int limit) { return Map.of(); }
        @Override public Map<String, Object> addSongToPlaylistPayload(String playlistId, Song song) { return Map.of(); }
        @Override public Map<String, Object> commentsPayload(String songId, int limit) { return Map.of(); }
    }

    private static final class PermanentPlaylistFailureProvider implements MusicProviderClient {
        private int playlistCalls;
        private int clearCalls;

        @Override public String id() { return "qq"; }
        @Override public String label() { return "QQ Music"; }
        @Override public String baseUrl() { return "http://127.0.0.1:3011"; }
        @Override public Map<String, Object> serviceStatus() { return Map.of("ok", true); }
        @Override public Map<String, Object> accountPayload() {
            return Map.of("ok", true, "loggedIn", true, "account", Map.of("userId", "10001"));
        }
        @Override public void rememberBrowserSession(Map<String, String> cookies) { }
        @Override public void clearBrowserSession() { clearCalls += 1; }
        @Override public Map<String, Object> userPlaylistsPayload() {
            playlistCalls += 1;
            return Map.of("ok", false, "loggedIn", true, "userLibrary", false, "error", "playlist upstream unavailable", "playlists", List.of());
        }
        @Override public Map<String, Object> search(String keyword, int page, int limit) { return Map.of(); }
        @Override public String songUrl(String id, String quality) { return ""; }
        @Override public Map<String, Object> songUrlPayload(String id, String quality) { return Map.of(); }
        @Override public Map<String, Object> lyricPayload(String songId) { return Map.of(); }
        @Override public Map<String, Object> recommendedPlaylistsPayload(int limit) { return Map.of(); }
        @Override public Map<String, Object> playlistTracksPayload(String playlistId, int limit) { return Map.of(); }
        @Override public Map<String, Object> addSongToPlaylistPayload(String playlistId, Song song) { return Map.of(); }
        @Override public Map<String, Object> commentsPayload(String songId, int limit) { return Map.of(); }
    }
}
