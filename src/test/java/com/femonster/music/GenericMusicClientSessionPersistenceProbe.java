package com.femonster.music;

import com.femonster.json.SimpleJson;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.Comparator;
import java.util.Map;

public final class GenericMusicClientSessionPersistenceProbe {
    private GenericMusicClientSessionPersistenceProbe() {
    }

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-music-session-");
        try {
            Path sessionFile = root.resolve("qq-session.json");
            GenericMusicClient client = new GenericMusicClient("qq", "QQ", "http://127.0.0.1:1", sessionFile);
            Map<String, String> session = Map.of("uin", "o123456", "qm_keyst", "stable-token");
            client.rememberBrowserSession(session);
            require(Files.isRegularFile(sessionFile), "session file was not written");
            FileTime first = Files.getLastModifiedTime(sessionFile);

            Thread.sleep(40);
            client.rememberBrowserSession(session);
            FileTime repeated = Files.getLastModifiedTime(sessionFile);
            require(first.equals(repeated), "unchanged session rewrote the session file");

            Thread.sleep(40);
            client.rememberBrowserSession(Map.of("uin", "o123456", "qm_keyst", "new-token"));
            FileTime changed = Files.getLastModifiedTime(sessionFile);
            require(changed.compareTo(repeated) > 0, "changed session was not persisted");

            Path kugouSessionFile = root.resolve("kugou-session.json");
            GenericMusicClient kugou = new GenericMusicClient(
                "kugou",
                "KuGou",
                "http://127.0.0.1:1",
                kugouSessionFile
            );
            kugou.rememberBrowserSession(Map.of(
                "KuGoo",
                "KugooID=42&t=current-account-token&NickName=FE%20Monster"
            ));
            require(!Files.exists(kugouSessionFile), "incompatible Kugou website credentials were persisted for the App API");
            require(!Files.exists(sessionFile.resolveSibling("qq-session.json.tmp")), "successful save left a partial session file");
            verifyRestoredSession(sessionFile);
            verifyPersistenceFailureRetries(root);
            System.out.println("GenericMusicClientSessionPersistenceProbe passed: duplicateWrites=0, atomicSave=true, restart=true, failedWriteRetry=true");
        } finally {
            try (var paths = Files.walk(root)) {
                paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                    try {
                        Files.deleteIfExists(path);
                    } catch (Exception ignored) {
                    }
                });
            }
        }
    }

    private static void verifyRestoredSession(Path sessionFile) throws Exception {
        HttpServer api = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        api.createContext("/", exchange -> {
            String query = URLDecoder.decode(exchange.getRequestURI().getRawQuery(), StandardCharsets.UTF_8);
            boolean authenticated = query.contains("uin=123456") && query.contains("qm_keyst=new-token");
            byte[] body = SimpleJson.stringify(authenticated
                ? Map.of("code", 0, "data", Map.of("creator", Map.of("uin", "123456", "nick", "Fixture User")))
                : Map.of("ok", false, "error", "missing persisted authentication")).getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        api.start();
        try {
            GenericMusicClient restored = new GenericMusicClient("qq", "QQ",
                "http://127.0.0.1:" + api.getAddress().getPort(), sessionFile);
            Map<String, Object> account = restored.accountPayload();
            require(Boolean.TRUE.equals(account.get("loggedIn")), "restarted client failed to authenticate with its saved session");
            require("123456".equals(SimpleJson.asMap(account.get("account")).get("userId")), "restarted client changed provider identity");
        } finally {
            api.stop(0);
        }
    }

    private static void verifyPersistenceFailureRetries(Path root) throws Exception {
        Path blocked = root.resolve("blocked-session.json");
        Files.createDirectory(blocked);
        GenericMusicClient client = new GenericMusicClient("qq", "QQ", "http://127.0.0.1:1", blocked);
        Map<String, String> cookies = Map.of("uin", "10001", "qm_keyst", "fixture-token");
        boolean failed = false;
        try {
            client.rememberBrowserSession(cookies);
        } catch (IllegalStateException expected) {
            failed = true;
        }
        require(failed, "write failure was swallowed and could falsely report a durable login");
        Files.delete(blocked);
        client.rememberBrowserSession(cookies);
        require(Files.isRegularFile(blocked), "unchanged credentials were not persisted after a failed write was repaired");
        require(!Files.exists(root.resolve("blocked-session.json.tmp")), "repaired save left a temporary session");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
