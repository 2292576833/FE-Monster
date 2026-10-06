import com.femonster.music.GenericMusicClient;
import com.femonster.music.MusicProviderRegistry;
import com.femonster.netease.NeteaseClient;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

public final class ProviderLyricContractProbe {
    private ProviderLyricContractProbe() {}

    public static void main(String[] args) throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        List<String> paths = new ArrayList<>();
        AtomicReference<Map<String, String>> kugouQuery = new AtomicReference<>(Map.of());

        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            Map<String, String> query = query(exchange.getRequestURI().getRawQuery());
            paths.add(path);
            if ("/getLyric".equals(path)) {
                json(exchange, 200, "{\"ok\":false,\"error\":\"try compatible route\"}");
                return;
            }
            if ("/lyric/new".equals(path) && "netease-song".equals(query.get("id"))) {
                json(exchange, 200, "{"
                    + "\"lrc\":{\"lyric\":\"[00:04.00]Netease line\"},"
                    + "\"yrc\":{\"lyric\":\"{\\\"t\\\":4000,\\\"c\\\":[{\\\"tx\\\":\\\"Netease \\\",\\\"t\\\":4000,\\\"d\\\":500},{\\\"tx\\\":\\\"line\\\",\\\"t\\\":4500,\\\"d\\\":500}]}\"}"
                    + "}");
                return;
            }
            if (!"/lyric".equals(path)) {
                json(exchange, 404, "{\"ok\":false,\"error\":\"not found\"}");
                return;
            }
            String id = query.getOrDefault("id", "");
            if ("qq-song".equals(id)) {
                json(exchange, 200, "{\"data\":{"
                    + "\"lyric\":\"[00:01.00]QQ line\","
                    + "\"qrc\":\"[1000,1000]QQ (1000,500)line(1500,500)\","
                    + "\"trans\":\"[00:01.00]QQ translation\","
                    + "\"roma\":\"[00:01.00]QQ romanization\""
                    + "}}");
                return;
            }
            if ("qishui-song".equals(id)) {
                json(exchange, 200, "{\"data\":{"
                    + "\"lyric\":\"[00:02.00]Qishui line\","
                    + "\"yrc\":\"[2000,1000](2000,1000,0)Qishui line\""
                    + "}}");
                return;
            }
            if ("0123456789ABCDEF0123456789ABCDEF".equals(query.get("hash"))) {
                kugouQuery.set(query);
                if (!"Red Shoe".equals(query.get("keyword"))
                    || !"206000".equals(query.get("duration"))) {
                    json(exchange, 200, "{\"nolyric\":true}");
                    return;
                }
                json(exchange, 200, "{\"data\":{"
                    + "\"lyrics\":\"[00:03.00]Kugou line\","
                    + "\"krc\":\"[3000,1000]<0,500,0>Ku<500,500,0>gou\","
                    + "\"translation\":\"[00:03.00]酷狗译文\""
                    + "}}");
                return;
            }
            if ("netease-song".equals(id)) {
                json(exchange, 200, "{\"lrc\":{\"lyric\":\"[00:04.00]Netease line\"}}");
                return;
            }
            json(exchange, 200, "{\"nolyric\":true}");
        });
        server.start();

        try {
            String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
            GenericMusicClient qq = new GenericMusicClient("qq", "QQ", baseUrl);
            GenericMusicClient kugou = new GenericMusicClient("kugou", "Kugou", baseUrl);
            GenericMusicClient qishui = new GenericMusicClient("qishui", "Qishui", baseUrl);
            NeteaseClient netease = new NeteaseClient(baseUrl);
            MusicProviderRegistry registry = new MusicProviderRegistry(netease, qq, kugou, qishui);

            Map<String, Object> qqPayload = registry.lyricPayload("qq", "qq-song");
            require("[00:01.00]QQ line".equals(track(qqPayload, "lrc")), "QQ lyric was not normalized");
            require(track(qqPayload, "klyric").contains("QQ (1000,500)line(1500,500)"),
                "QQ word-level QRC timing was not normalized");
            require("[00:01.00]QQ translation".equals(track(qqPayload, "tlyric")),
                "QQ trans field was not normalized");
            require("[00:01.00]QQ romanization".equals(track(qqPayload, "romalrc")),
                "QQ roma field was not normalized");
            require(paths.size() >= 2
                && "/getLyric".equals(paths.get(0))
                && "/lyric".equals(paths.get(1)), "QQ compatible endpoint fallback did not run");

            Map<String, Object> qishuiPayload = registry.lyricPayload("qishui", "qishui-song");
            require("[00:02.00]Qishui line".equals(track(qishuiPayload, "lrc")),
                "Qishui lyric was not normalized");
            require(track(qishuiPayload, "yrc").contains("(2000,1000,0)Qishui line"),
                "Qishui word-level timing was not preserved");

            String kugouId = "kg|0123456789ABCDEF0123456789ABCDEF|24680|13579";
            Map<String, Object> kugouPayload = registry.lyricPayload(
                "kugou",
                kugouId,
                "Red Shoe",
                "Fixture Artist",
                206
            );
            require("[00:03.00]Kugou line".equals(track(kugouPayload, "lrc")), "Kugou lyric was not normalized");
            require(track(kugouPayload, "klyric").contains("<0,500,0>Ku"),
                "Kugou word-level KRC timing was not normalized");
            require("[00:03.00]酷狗译文".equals(track(kugouPayload, "tlyric")), "Kugou translation was not normalized");
            Map<String, String> restored = kugouQuery.get();
            require("0123456789ABCDEF0123456789ABCDEF".equals(restored.get("hash")), "Kugou hash was not restored");
            require("24680".equals(restored.get("album_audio_id")), "Kugou album_audio_id was not restored");
            require("24680".equals(restored.get("mixsongid")), "Kugou mixsongid was not restored");
            require("13579".equals(restored.get("album_id")), "Kugou album_id was not restored");
            require("Red Shoe".equals(restored.get("keyword")), "Kugou lyric title metadata was lost");
            require("206000".equals(restored.get("duration")), "Kugou lyric duration was not converted to milliseconds");

            Map<String, Object> noLyricPayload = registry.lyricPayload(
                "kugou",
                "kg|AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA|||",
                "",
                "",
                0
            );
            require(Boolean.TRUE.equals(noLyricPayload.get("nolyric")), "Kugou no-lyric marker was lost");
            require(track(noLyricPayload, "lrc").isBlank(), "Kugou no-lyric payload created fake lyrics");

            int neteaseRequestStart = paths.size();
            Map<String, Object> neteasePayload = registry.lyricPayload("netease", "netease-song");
            require("[00:04.00]Netease line".equals(track(neteasePayload, "lrc")), "Netease lyric was not preserved");
            require(track(neteasePayload, "yrc").contains("\"t\":4000"),
                "Netease word-level YRC timing was not preserved");
            require("/lyric/new".equals(paths.get(neteaseRequestStart)),
                "Netease lyrics did not prefer the word-level endpoint");
            require("netease".equals(neteasePayload.get("provider")), "Netease provider id is missing");
            System.out.println("Provider lyric contract PASS");
        } finally {
            server.stop(0);
        }
    }

    private static String track(Map<String, Object> payload, String key) {
        Object value = payload.get(key);
        if (!(value instanceof Map<?, ?> map)) return "";
        Object lyric = map.get("lyric");
        return lyric == null ? "" : String.valueOf(lyric);
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
