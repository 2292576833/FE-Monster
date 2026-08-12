import com.femonster.json.SimpleJson;
import com.femonster.music.MusicProviderRegistry;
import com.femonster.music.ProviderProtocolClient;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class QqHostContractProbe {
    public static void main(String[] args) throws Exception {
        AtomicInteger collectedRequests = new AtomicInteger();
        AtomicInteger recommendedRequests = new AtomicInteger();
        AtomicReference<String> scenario = new AtomicReference<>("normal");
        AtomicReference<String> accountResponse = new AtomicReference<>("""
            {"code":0,"data":{"creator":{
              "uin":"10001","nick":"QQ 测试用户","headpic":"https://example.test/qq.png",
              "vip":1,"svip":0
            }}}
            """);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/user/getUserPlaylists", exchange -> {
            if ("private-library".equals(scenario.get())) {
                send(exchange, 200, "{\"code\":0,\"data\":{\"playlists\":[]}}");
                return;
            }
            if (!"normal".equals(scenario.get())) {
                send(exchange, 502, "{\"error\":\"upstream playlist failure\"}");
                return;
            }
            send(exchange, 200, """
                {"code":0,"data":{"playlists":[
                  {"dissid":"liked-10001","diss_name":"\u6211\u559c\u6b22","song_cnt":9},
                  {"dissid":"created-10001","diss_name":"我的歌单","song_cnt":3}
                ]}}
                """);
        });
        server.createContext("/user/getUserCollectedSongLists", exchange -> {
            collectedRequests.incrementAndGet();
            if ("private-library".equals(scenario.get())) {
                send(exchange, 200, "{\"code\":0,\"data\":{\"cdlist\":[]}}");
                return;
            }
            if ("stale-sso".equals(scenario.get())) {
                send(exchange, 200, "{\"response\":{\"code\":4000,\"subcode\":4000,\"msg\":\"privacy\",\"data\":{}}}");
                return;
            }
            send(exchange, 200, """
                {"code":0,"data":{"cdlist":[
                  {"dissid":"favorite-10001","diss_name":"收藏","song_cnt":2}
                ]}}
                """);
        });
        server.createContext("/user/getUserDetail", exchange -> send(
            exchange,
            200,
            "stale-sso".equals(scenario.get())
                ? "{\"response\":{\"code\":1000,\"subcode\":1000,\"msg\":\"\",\"data\":{}}}"
                : "private-library".equals(scenario.get())
                    ? """
                      {"code":0,"data":{
                        "creator":{"uin":"10001","nick":"QQ fixture","userInfoUI":{"iconlist":[
                          {"desc":"{\\"string10\\":\\"xufei\\"}"},
                          {"desc":"{\\"string10\\":\\"vip\\",\\"string11\\":\\"vip\\",\\"int10\\":1}"}
                        ]}},
                        "mymusic":[
                          {"dissid":"liked-private","diss_name":"Liked songs","song_cnt":12}
                        ],
                        "mydiss":{"list":[
                          {"dissid":"created-private","diss_name":"Private created","song_cnt":4}
                        ]}
                      }}
                      """
                : accountResponse.get()
        ));
        server.createContext("/getRecommendPlaylist", exchange -> {
            recommendedRequests.incrementAndGet();
            send(exchange, 200, "{\"code\":0,\"data\":{\"list\":[{\"dissid\":\"public-recommendation\",\"diss_name\":\"Public\"}]}}");
        });
        server.start();

        try {
            String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
            MusicProviderRegistry registry = new MusicProviderRegistry(
                new ProviderProtocolClient("qq", "QQ 音乐", baseUrl)
            );

            Map<String, Object> library = registry.userPlaylistsPayload("qq");
            List<Object> playlists = SimpleJson.asList(library.get("playlists"));
            require(collectedRequests.get() == 1, "QQ 收藏歌单端点没有被读取一次");
            require(playlists.size() == 3, "QQ 收藏歌单没有与自建歌单合并");
            Map<String, Object> liked = playlists.stream()
                .map(SimpleJson::asMap)
                .filter(item -> "liked-10001".equals(SimpleJson.asString(item.get("id"), "")))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("QQ liked playlist stable ID was lost"));
            require("\u6211\u559c\u6b22".equals(SimpleJson.asString(liked.get("name"), "")),
                "QQ liked playlist display name was lost");
            require(SimpleJson.asInt(liked.get("trackCount"), 0) == 9,
                "QQ liked playlist track count was lost");
            Map<String, Object> favorite = playlists.stream()
                .map(SimpleJson::asMap)
                .filter(item -> "favorite-10001".equals(SimpleJson.asString(item.get("id"), "")))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("QQ 收藏歌单稳定 ID 丢失"));
            require("收藏".equals(SimpleJson.asString(favorite.get("name"), "")), "QQ 收藏歌单名称丢失");
            require(SimpleJson.asInt(favorite.get("trackCount"), 0) == 2, "QQ 收藏歌单曲目数丢失");
            Map<String, Object> status = registry.accountPayload("qq");
            Map<String, Object> account = SimpleJson.asMap(status.get("account"));
            require(SimpleJson.asBoolean(status.get("loggedIn"), false), "QQ 账号状态没有识别嵌套 creator");
            require("10001".equals(SimpleJson.asString(account.get("userId"), "")), "QQ 用户 ID 丢失");
            require("QQ 测试用户".equals(SimpleJson.asString(account.get("nickname"), "")), "QQ 昵称丢失");
            require("1".equals(SimpleJson.asString(account.get("vipType"), "")), "QQ VIP 原始类型丢失");
            require(SimpleJson.asBoolean(account.get("isVip"), false), "QQ VIP 有效状态没有暴露");
            require("active".equals(SimpleJson.asString(account.get("vipStatus"), "")), "QQ VIP 状态不是 active");

            accountResponse.set("""
                {"code":0,"data":{"creator":{"uin":"10001","nick":"QQ 测试用户","vip":0,"svip":0}}}
                """);
            Map<String, Object> inactiveAccount = SimpleJson.asMap(registry.accountPayload("qq").get("account"));
            require(!SimpleJson.asBoolean(inactiveAccount.get("isVip"), true), "QQ 非 VIP 被误报为 VIP");
            require("inactive".equals(SimpleJson.asString(inactiveAccount.get("vipStatus"), "")), "QQ 非 VIP 状态不是 inactive");

            accountResponse.set("""
                {"code":0,"data":{"creator":{"uin":"10001","nick":"QQ 测试用户"}}}
                """);
            Map<String, Object> unknownAccount = SimpleJson.asMap(registry.accountPayload("qq").get("account"));
            require(!unknownAccount.containsKey("isVip"), "QQ 未知 VIP 状态不应伪装成非 VIP");
            require("unknown".equals(SimpleJson.asString(unknownAccount.get("vipStatus"), "")), "QQ 未知 VIP 状态没有保留");

            accountResponse.set("""
                {"code":0,"data":{"creator":{"uin":"10001","nick":"QQ fixture","userInfoUI":{"iconlist":[
                  {"desc":"{\\"string10\\":\\"xufei\\",\\"string11\\":\\"xufei\\",\\"int10\\":1}"}
                ]}}}}
                """);
            Map<String, Object> renewalOnlyAccount = SimpleJson.asMap(registry.accountPayload("qq").get("account"));
            require(!renewalOnlyAccount.containsKey("isVip"), "QQ xufei-only badge must not imply active VIP");
            require("unknown".equals(SimpleJson.asString(renewalOnlyAccount.get("vipStatus"), "")),
                "QQ xufei-only badge must preserve unknown VIP status");

            Path validSession = Files.createTempFile("fe-qq-valid-session-", ".json");
            Path staleSession = Files.createTempFile("fe-qq-stale-session-", ".json");
            try {
                Files.writeString(validSession, """
                    {"uin":"10001","cookie":"uin=o10001; qm_keyst=valid-music-session"}
                    """, StandardCharsets.UTF_8);
                Files.writeString(staleSession, """
                    {"uin":"10001","cookie":"p_uin=o10001; p_skey=qq-sso-only"}
                    """, StandardCharsets.UTF_8);

                scenario.set("primary-failure");
                MusicProviderRegistry fallbackRegistry = new MusicProviderRegistry(
                    new ProviderProtocolClient("qq", "QQ Music", baseUrl, validSession)
                );
                Map<String, Object> fallbackLibrary = fallbackRegistry.userPlaylistsPayload("qq");
                require(SimpleJson.asBoolean(fallbackLibrary.get("ok"), false),
                    "a working QQ collection source was masked by the failed primary playlist source");
                require(SimpleJson.asList(fallbackLibrary.get("playlists")).size() == 1,
                    "the QQ collection fallback playlist was not retained");

                scenario.set("private-library");
                MusicProviderRegistry privateLibraryRegistry = new MusicProviderRegistry(
                    new ProviderProtocolClient("qq", "QQ Music", baseUrl, validSession)
                );
                Map<String, Object> privateLibrary = privateLibraryRegistry.userPlaylistsPayload("qq");
                List<Object> privatePlaylists = SimpleJson.asList(privateLibrary.get("playlists"));
                require(SimpleJson.asBoolean(privateLibrary.get("ok"), false),
                    "QQ private detail fallback did not preserve a successful user-library response");
                require(SimpleJson.asBoolean(privateLibrary.get("userLibrary"), false),
                    "QQ private detail fallback was not identified as an authenticated user library");
                require(privatePlaylists.size() == 2,
                    "QQ private detail fallback did not merge mymusic and mydiss.list");
                require(privatePlaylists.stream().map(SimpleJson::asMap)
                        .anyMatch(item -> "liked-private".equals(SimpleJson.asString(item.get("id"), ""))),
                    "QQ mymusic playlist was lost by the formal protocol client");
                require(privatePlaylists.stream().map(SimpleJson::asMap)
                        .anyMatch(item -> "created-private".equals(SimpleJson.asString(item.get("id"), ""))),
                    "QQ mydiss.list playlist was lost by the formal protocol client");
                require(recommendedRequests.get() == 0,
                    "QQ user-library fallback must never call public recommendation routes");

                Map<String, Object> badgeAccount = SimpleJson.asMap(privateLibraryRegistry.accountPayload("qq").get("account"));
                require(SimpleJson.asBoolean(badgeAccount.get("isVip"), false),
                    "QQ vip badge JSON was not recognized as active VIP");
                require("active".equals(SimpleJson.asString(badgeAccount.get("vipStatus"), "")),
                    "QQ vip badge JSON did not produce active VIP status");

                scenario.set("stale-sso");
                MusicProviderRegistry staleRegistry = new MusicProviderRegistry(
                    new ProviderProtocolClient("qq", "QQ Music", baseUrl, staleSession)
                );
                Map<String, Object> staleStatus = staleRegistry.accountPayload("qq");
                Map<String, Object> staleLibrary = staleRegistry.userPlaylistsPayload("qq");
                require(!SimpleJson.asBoolean(staleStatus.get("loggedIn"), true),
                    "QQ SSO-only cookies were incorrectly reported as a QQ Music login");
                require(!SimpleJson.asBoolean(staleLibrary.get("ok"), true),
                    "QQ business errors were incorrectly treated as a readable library");
                require(SimpleJson.asList(staleLibrary.get("playlists")).isEmpty(),
                    "a stale QQ session fabricated playlists");
            } finally {
                Files.deleteIfExists(validSession);
                Files.deleteIfExists(staleSession);
                scenario.set("normal");
            }

            System.out.println("QQ host contract PASS");
        } finally {
            server.stop(0);
        }
    }

    private static void send(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static void require(boolean value, String message) {
        if (!value) throw new IllegalStateException(message);
    }
}
