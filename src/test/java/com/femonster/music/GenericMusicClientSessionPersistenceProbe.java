package com.femonster.music;

import com.femonster.json.SimpleJson;
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
            Map<String, String> session = Map.of("uin", "o123456", "p_skey", "stable-token");
            client.rememberBrowserSession(session);
            require(Files.isRegularFile(sessionFile), "session file was not written");
            FileTime first = Files.getLastModifiedTime(sessionFile);

            Thread.sleep(40);
            client.rememberBrowserSession(session);
            FileTime repeated = Files.getLastModifiedTime(sessionFile);
            require(first.equals(repeated), "unchanged session rewrote the session file");

            Thread.sleep(40);
            client.rememberBrowserSession(Map.of("uin", "o123456", "p_skey", "new-token"));
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
            Map<String, Object> persistedKugou = SimpleJson.parseObject(Files.readString(kugouSessionFile));
            require("42".equals(String.valueOf(persistedKugou.get("userid"))), "Kugou user id was not extracted");
            require(
                "current-account-token".equals(String.valueOf(persistedKugou.get("token"))),
                "Kugou current nested t token was not extracted"
            );
            System.out.println("GenericMusicClientSessionPersistenceProbe passed: duplicateWrites=0, totalWrites=3");
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

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
