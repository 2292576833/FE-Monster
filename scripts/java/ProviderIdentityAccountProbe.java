import com.femonster.json.SimpleJson;
import com.femonster.model.Song;
import com.femonster.music.MusicProviderRegistry;
import com.femonster.music.ProviderProtocolClient;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class ProviderIdentityAccountProbe {
    private ProviderIdentityAccountProbe() {}

    public static void main(String[] args) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicInteger kugouProfileRequests = new AtomicInteger();
        AtomicInteger kugouVipRequests = new AtomicInteger();
        AtomicInteger kugouLocalPlaylistRequests = new AtomicInteger();
        AtomicInteger kugouBrowserRefreshRequests = new AtomicInteger();
        AtomicInteger qqAvatarRequests = new AtomicInteger();
        AtomicReference<Map<String, String>> playbackQuery = new AtomicReference<>(Map.of());
        AtomicReference<Map<String, String>> lyricQuery = new AtomicReference<>(Map.of());
        AtomicReference<Map<String, String>> switchedLoginQuery = new AtomicReference<>(Map.of());

        server.createContext("/user/getUserDetail", exchange -> json(exchange, 200, """
            {"response":{"code":0,"data":{"creator":{
              "uin":0,"nick":"QQ Runtime User","vip":1,"svip":0
            }}}}
            """));
        server.createContext("/user/getUserAvatar", exchange -> {
            qqAvatarRequests.incrementAndGet();
            json(exchange, 200, """
                {"response":{"code":0,"data":{"avatarUrl":"https://example.test/qq.png"}}}
                """);
        });
        server.createContext("/login/status", exchange -> json(exchange, 200, """
            {"code":200,"status":1,"data":{
              "status":1,"vipType":"0","vipStatus":"inactive","isVip":false
            }}
            """));
        server.createContext("/user/detail", exchange -> {
            kugouProfileRequests.incrementAndGet();
            json(exchange, 200, """
                {"status":1,"data":{
                  "userid":"42","nickname":"Kugou Runtime User",
                  "pic_url":"https://example.test/kugou-current.png",
                  "vip_type":5,"m_type":0,"y_type":0
                }}
                """);
        });
        server.createContext("/user/vip/detail", exchange -> {
            kugouVipRequests.incrementAndGet();
            json(exchange, 200, """
                {"status":1,"data":{
                  "userid":"42","vip_type":5,"m_type":0,"y_type":0,
                  "busi_vip":[{
                    "busi_type":"concept","product_type":"svip",
                    "is_vip":1,"vip_end_time":"2099-12-31"
                  }]
                }}
                """);
        });
        server.createContext("/user/playlist", exchange -> json(exchange, 200, """
            {"status":1,"data":{"info":[
              {"global_collection_id":"collection_wrong_for_system_liked",
               "list_id":"2","list_name":"","is_def":2,"count":17,
               "pic_url":"https://example.test/kugou-liked.png","type":0},
              {"global_collection_id":"collection_runtime","list_id":"98",
               "list_name":"Runtime List","count":3,"type":0}
            ]}}
            """));
        server.createContext("/inactive/login/status", exchange -> json(exchange, 200, """
            {"code":200,"status":1,"data":{
              "status":1,"userid":"43","vipType":"0","vipStatus":"inactive","isVip":false
            }}
            """));
        server.createContext("/inactive/user/detail", exchange -> json(exchange, 200, """
            {"status":1,"data":{"userid":"43","nickname":"Kugou Free User","vip_type":5}}
            """));
        server.createContext("/inactive/user/vip/detail", exchange -> json(exchange, 200, """
            {"status":1,"data":{"userid":"43","vip_type":5,"m_type":0,"y_type":0,"busi_vip":[]}}
            """));
        server.createContext("/unknown/login/status", exchange -> json(exchange, 200, """
            {"code":200,"status":1,"data":{"status":1,"userid":"44"}}
            """));
        server.createContext("/unknown/user/detail", exchange -> json(exchange, 200, """
            {"status":1,"data":{"userid":"44","nickname":"Kugou Unknown User"}}
            """));
        server.createContext("/unknown/user/vip/detail", exchange -> json(exchange, 200, """
            {"status":1,"data":{"userid":"44"}}
            """));
        server.createContext("/rejected/login/status", exchange -> json(exchange, 200, """
            {"code":200,"status":1,"data":{"status":1,"userid":"45"}}
            """));
        server.createContext("/rejected/user/detail", exchange -> json(exchange, 422, """
            {"status":0,"code":20018,"error":"credential rejected"}
            """));
        server.createContext("/rejected/user/vip/detail", exchange -> json(exchange, 422, """
            {"status":0,"code":20017,"error":"credential rejected"}
            """));
        server.createContext("/switch/login/status", exchange -> {
            switchedLoginQuery.set(query(exchange.getRequestURI().getRawQuery()));
            json(exchange, 200, """
                {"code":200,"status":1,"data":{"status":1,"userid":"43"}}
                """);
        });
        server.createContext("/switch/user/detail", exchange -> json(exchange, 200, """
            {"status":1,"data":{
              "userid":"43","nickname":"Kugou Switched User",
              "pic_url":"https://example.test/kugou-switched.png","vip_type":5
            }}
            """));
        server.createContext("/switch/user/vip/detail", exchange -> json(exchange, 200, """
            {"status":1,"data":{"userid":"43","vip_type":5,"m_type":0,"y_type":0,"busi_vip":[]}}
            """));
        server.createContext("/playlist/track/all", exchange -> json(exchange, 200, """
            {"status":1,"data":{"songs":[
              {"FileHash":"11111111111111111111111111111111","audio_id":"0","MixSongID":"101","AlbumID":"201",
               "SongName":"First Runtime Song","SingerName":"FE"},
              {"FileHash":"22222222222222222222222222222222","audio_id":"999","MixSongID":"102","AlbumID":"202",
               "SongName":"Second Runtime Song","SingerName":"FE"},
              {"FileHash":"44444444444444444444444444444444","audio_id":"104","AlbumID":"204",
               "SongName":"Audio Id Fallback Song","SingerName":"FE"},
              {"FileHash":"55555555555555555555555555555555","audio_id":"0","AlbumID":"205",
               "SongName":"Zero Audio Id Song","SingerName":"FE"}
            ]}}
            """));
        server.createContext("/playlist/track/all/new", exchange -> {
            kugouLocalPlaylistRequests.incrementAndGet();
            json(exchange, 200, """
                {"status":1,"data":{"songs":[
                  {"FileHash":"33333333333333333333333333333333","MixSongID":"103","AlbumID":"203",
                   "SongName":"Liked Runtime Song","SingerName":"FE"}
                ]}}
                """);
        });
        server.createContext("/song/url", exchange -> {
            playbackQuery.set(query(exchange.getRequestURI().getRawQuery()));
            json(exchange, 200, "{\"url\":\"https://audio.example/runtime.mp3\"}");
        });
        server.createContext("/lyric", exchange -> {
            lyricQuery.set(query(exchange.getRequestURI().getRawQuery()));
            json(exchange, 200, "{\"lyric\":\"[00:00.00]Runtime lyric\"}");
        });
        server.createContext("/browser-refresh/login/token", exchange -> {
            kugouBrowserRefreshRequests.incrementAndGet();
            exchange.getResponseHeaders().add("Set-Cookie", "token=refreshed-mobile-token; Path=/; SameSite=Lax");
            exchange.getResponseHeaders().add("Set-Cookie", "userid=42; Path=/; SameSite=Lax");
            exchange.getResponseHeaders().add("Set-Cookie", "vip_type=1; Path=/; SameSite=Lax");
            json(exchange, 200, """
                {"status":1,"data":{"status":1,"userid":"42",
                 "token":"refreshed-mobile-token","vip_type":1}}
                """);
        });
        server.createContext("/browser-refresh/login/status", exchange -> json(exchange, 200, """
            {"code":200,"status":1,"data":{"status":1,"userid":"42"}}
            """));
        server.createContext("/browser-refresh/user/detail", exchange -> {
            if (!"refreshed-mobile-token".equals(query(exchange.getRequestURI().getRawQuery()).get("token"))) {
                json(exchange, 422, "{\"status\":0,\"code\":20018,\"error\":\"stale browser token\"}");
                return;
            }
            json(exchange, 200, """
                {"status":1,"data":{"userid":"42","nickname":"Refreshed Kugou User",
                 "pic_url":"https://example.test/kugou-refreshed.png"}}
                """);
        });
        server.createContext("/browser-refresh/user/vip/detail", exchange -> {
            if (!"refreshed-mobile-token".equals(query(exchange.getRequestURI().getRawQuery()).get("token"))) {
                json(exchange, 422, "{\"status\":0,\"code\":20017,\"error\":\"stale browser token\"}");
                return;
            }
            json(exchange, 200, """
                {"status":1,"data":{"userid":"42","busi_vip":[{"is_vip":1,
                 "product_type":"svip","vip_end_time":"2099-12-31"}]}}
                """);
        });
        server.createContext("/browser-refresh/user/playlist", exchange -> {
            if (!"refreshed-mobile-token".equals(query(exchange.getRequestURI().getRawQuery()).get("token"))) {
                json(exchange, 422, "{\"status\":0,\"code\":20017,\"error\":\"stale browser token\"}");
                return;
            }
            json(exchange, 200, """
                {"status":1,"data":{"info":[{"list_id":"2","is_def":2,
                 "list_name":"","count":9}]}}
                """);
        });
        server.start();

        try {
            String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
            ProviderProtocolClient qq = new ProviderProtocolClient("qq", "QQ", baseUrl);
            qq.rememberBrowserSession(Map.of("uin", "10001", "qm_keyst", "account-a-key"));
            Map<String, Object> qqAccount = SimpleJson.asMap(qq.accountPayload().get("account"));
            require("10001".equals(SimpleJson.asString(qqAccount.get("userId"), "")),
                "QQ placeholder uin=0 replaced the authenticated session identity");
            require("QQ Runtime User".equals(SimpleJson.asString(qqAccount.get("nickname"), "")),
                "QQ response wrapper lost the account name");
            require("https://example.test/qq.png".equals(SimpleJson.asString(qqAccount.get("avatarUrl"), "")),
                "QQ avatar endpoint was not merged");
            require("active".equals(SimpleJson.asString(qqAccount.get("vipStatus"), "")),
                "QQ VIP status was not normalized to active");
            qq.clearBrowserSession();
            qq.rememberBrowserSession(Map.of("uin", "20002", "qm_keyst", "account-b-key"));
            Map<String, Object> switchedQqAccount = SimpleJson.asMap(qq.accountPayload().get("account"));
            require("20002".equals(SimpleJson.asString(switchedQqAccount.get("userId"), "")),
                "QQ account switch retained the previous community identity");
            require(qqAvatarRequests.get() == 2, "QQ avatar endpoint was not requested exactly once per account");

            ProviderProtocolClient kugou = new ProviderProtocolClient("kugou", "Kugou", baseUrl);
            Map<String, Object> kugouAccount = SimpleJson.asMap(kugou.accountPayload().get("account"));
            require("Kugou Runtime User".equals(SimpleJson.asString(kugouAccount.get("nickname"), "")),
                "Kugou profile endpoint was not merged");
            require("https://example.test/kugou-current.png".equals(SimpleJson.asString(kugouAccount.get("avatarUrl"), "")),
                "Kugou profile avatar was not merged");
            require("active".equals(SimpleJson.asString(kugouAccount.get("vipStatus"), "")),
                "Kugou verified profile VIP status did not override stale login status");
            require(kugouProfileRequests.get() == 1, "Kugou profile endpoint was not requested exactly once");
            require(kugouVipRequests.get() == 1, "Kugou union VIP endpoint was not requested exactly once");

            List<Object> kugouPlaylists = SimpleJson.asList(kugou.userPlaylistsPayload().get("playlists"));
            require(kugouPlaylists.size() == 2, "Kugou system liked playlist was dropped");
            Map<String, Object> liked = SimpleJson.asMap(kugouPlaylists.get(0));
            require("2".equals(SimpleJson.asString(liked.get("id"), "")),
                "Kugou system liked playlist lost its per-user list_id");
            require("我喜欢".equals(SimpleJson.asString(liked.get("name"), "")),
                "Kugou is_def=2 playlist was not labelled 我喜欢");
            require("https://example.test/kugou-liked.png".equals(SimpleJson.asString(liked.get("cover"), "")),
                "Kugou system liked playlist lost its pic_url cover");
            require(SimpleJson.asInt(liked.get("trackCount"), 0) == 17,
                "Kugou system liked playlist lost its track count");
            List<Object> likedTracks = SimpleJson.asList(
                kugou.playlistTracksPayload(SimpleJson.asString(liked.get("id"), ""), 20).get("songs")
            );
            require(likedTracks.size() == 1, "Kugou system liked playlist did not load its local tracks");
            require(kugouLocalPlaylistRequests.get() == 1,
                "Kugou numeric list_id did not use the local playlist track endpoint");

            ProviderProtocolClient inactiveKugou = new ProviderProtocolClient(
                "kugou", "Kugou", baseUrl + "/inactive"
            );
            Map<String, Object> inactiveAccount = SimpleJson.asMap(inactiveKugou.accountPayload().get("account"));
            require("inactive".equals(SimpleJson.asString(inactiveAccount.get("vipStatus"), "")),
                "A verified free/expired credential was incorrectly promoted to VIP");

            ProviderProtocolClient unknownKugou = new ProviderProtocolClient(
                "kugou", "Kugou", baseUrl + "/unknown"
            );
            Map<String, Object> unknownAccount = SimpleJson.asMap(unknownKugou.accountPayload().get("account"));
            require("unknown".equals(SimpleJson.asString(unknownAccount.get("vipStatus"), "")),
                "A credential without an entitlement signal was incorrectly promoted to VIP");

            ProviderProtocolClient rejectedKugou = new ProviderProtocolClient(
                "kugou", "Kugou", baseUrl + "/rejected"
            );
            Map<String, Object> rejectedAccountStatus = rejectedKugou.accountPayload();
            require(!SimpleJson.asBoolean(rejectedAccountStatus.get("loggedIn"), false),
                "Kugou rejected credentials were reported as logged in from local token presence alone");

            ProviderProtocolClient switchedKugou = new ProviderProtocolClient(
                "kugou", "Kugou", baseUrl + "/switch"
            );
            switchedKugou.rememberBrowserSession(Map.of(
                "userid", "42", "token", "old-token", "vip_type", "1", "vip_token", "old-vip-token"
            ));
            switchedKugou.rememberBrowserSession(Map.of("userid", "43", "token", "new-token"));
            Map<String, Object> switchedAccount = SimpleJson.asMap(switchedKugou.accountPayload().get("account"));
            require("43".equals(SimpleJson.asString(switchedAccount.get("userId"), "")),
                "Kugou account switch did not use the new user id");
            require("inactive".equals(SimpleJson.asString(switchedAccount.get("vipStatus"), "")),
                "Kugou account switch retained the previous user's VIP status");
            require(!switchedLoginQuery.get().containsKey("vip_type"),
                "Kugou account switch sent the previous user's vip_type");
            require(!switchedLoginQuery.get().containsKey("vip_token"),
                "Kugou account switch sent the previous user's vip_token");

            Path refreshedSession = Files.createTempFile("fe-kugou-browser-refresh-", ".json");
            Files.deleteIfExists(refreshedSession);
            try {
                ProviderProtocolClient browserRefreshedKugou = new ProviderProtocolClient(
                    "kugou", "Kugou", baseUrl + "/browser-refresh", refreshedSession
                );
                MusicProviderRegistry refreshRegistry = new MusicProviderRegistry(browserRefreshedKugou);
                Map<String, Object> rejectedBrowserSession = refreshRegistry.synchronizeBrowserSession(
                    "kugou",
                    Map.of("KuGoo", "KugooID%3D42%26t%3Dstale-web-token")
                );
                require(!Boolean.TRUE.equals(rejectedBrowserSession.get("ready")),
                    "Kugou website cookies were incorrectly trusted as an App API session");
                require(kugouBrowserRefreshRequests.get() == 0,
                    "Kugou website credentials were sent to the incompatible token exchange endpoint");
            } finally {
                Files.deleteIfExists(refreshedSession);
            }

            List<Object> tracks = SimpleJson.asList(kugou.playlistTracksPayload("runtime-list", 20).get("songs"));
            require(tracks.size() == 4, "Kugou runtime playlist did not return all identity fixtures");
            Map<String, Object> selected = SimpleJson.asMap(tracks.get(1));
            require("kg|22222222222222222222222222222222|102|202".equals(
                    SimpleJson.asString(selected.get("id"), "")),
                "Kugou mixsongid did not override a conflicting audio_id");
            Map<String, Object> selectedSourceRef = SimpleJson.asMap(selected.get("sourceRef"));
            require("102".equals(SimpleJson.asString(selectedSourceRef.get("album_audio_id"), "")),
                "Kugou sourceRef retained the conflicting audio_id");

            Map<String, Object> fallbackTrack = SimpleJson.asMap(tracks.get(2));
            require("kg|44444444444444444444444444444444|104|204".equals(
                    SimpleJson.asString(fallbackTrack.get("id"), "")),
                "Kugou positive audio_id fallback was dropped when mixsongid was absent");

            Map<String, Object> zeroAudioTrack = SimpleJson.asMap(tracks.get(3));
            require("kg|55555555555555555555555555555555||205".equals(
                    SimpleJson.asString(zeroAudioTrack.get("id"), "")),
                "Kugou audio_id=0 was incorrectly retained as a playable identity");
            require(!SimpleJson.asMap(zeroAudioTrack.get("sourceRef")).containsKey("album_audio_id"),
                "Kugou audio_id=0 leaked into sourceRef");

            kugou.songUrl(SimpleJson.asString(selected.get("id"), ""), "standard");
            Map<String, String> requested = playbackQuery.get();
            require("22222222222222222222222222222222".equals(requested.get("hash")),
                "clicking the second row requested another row hash");
            require("102".equals(requested.get("album_audio_id")),
                "clicking the second row requested another row audio id");
            require("202".equals(requested.get("album_id")),
                "clicking the second row requested another row album id");

            Song staleSourceRefSong = Song.fromMap(selected);
            staleSourceRefSong.setSourceRef(Map.of(
                "hash", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "album_audio_id", "999",
                "album_id", "999"
            ));
            kugou.resolvePlayback(staleSourceRefSong, "standard");
            Map<String, String> staleSourceRequest = playbackQuery.get();
            require("22222222222222222222222222222222".equals(staleSourceRequest.get("hash")),
                "stale Kugou sourceRef overrode the compound song hash");
            require("102".equals(staleSourceRequest.get("album_audio_id")),
                "stale Kugou sourceRef overrode the compound mixsongid");
            require("202".equals(staleSourceRequest.get("album_id")),
                "stale Kugou sourceRef overrode the compound album id");

            Map<String, Object> lyric = kugou.lyricPayload(
                SimpleJson.asString(selected.get("id"), ""),
                SimpleJson.asString(selected.get("title"), ""),
                SimpleJson.asString(selected.get("artist"), ""),
                SimpleJson.asInt(selected.get("duration"), 0)
            );
            Map<String, String> requestedLyric = lyricQuery.get();
            require("102".equals(requestedLyric.get("album_audio_id")),
                "Kugou lyric lookup used audio_id instead of mixsongid");
            require("22222222222222222222222222222222".equals(requestedLyric.get("hash")),
                "Kugou lyric lookup lost the selected row hash");
            require(!SimpleJson.asString(SimpleJson.asMap(lyric.get("lrc")).get("lyric"), "").isBlank(),
                "Kugou lyric response was not normalized to the LRC contract");

            Map<String, Object> evidence = new LinkedHashMap<>();
            evidence.put("qq", publicAccount(qqAccount));
            evidence.put("kugou", publicAccount(kugouAccount));
            evidence.put("invalidOrFreeVipStatus", inactiveAccount.get("vipStatus"));
            evidence.put("missingVipSignalStatus", unknownAccount.get("vipStatus"));
            evidence.put("selectedIdentity", Map.of(
                "hash", requested.get("hash"),
                "albumAudioId", requested.get("album_audio_id"),
                "albumId", requested.get("album_id")
            ));
            System.out.println("Provider identity/account runtime PASS " + SimpleJson.stringify(evidence));
        } finally {
            server.stop(0);
        }
    }

    private static Map<String, String> query(String raw) {
        Map<String, String> values = new LinkedHashMap<>();
        if (raw == null || raw.isBlank()) return values;
        for (String part : raw.split("&")) {
            String[] pair = part.split("=", 2);
            String key = URLDecoder.decode(pair[0], StandardCharsets.UTF_8);
            String value = pair.length > 1 ? URLDecoder.decode(pair[1], StandardCharsets.UTF_8) : "";
            values.put(key, value);
        }
        return values;
    }

    private static Map<String, Object> publicAccount(Map<String, Object> account) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("userId", account.get("userId"));
        result.put("nickname", account.get("nickname"));
        result.put("avatarUrl", account.get("avatarUrl"));
        result.put("vipType", account.get("vipType"));
        result.put("vipStatus", account.get("vipStatus"));
        result.put("isVip", account.get("isVip"));
        return result;
    }

    private static void json(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}
