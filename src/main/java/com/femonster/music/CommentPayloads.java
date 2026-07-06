package com.femonster.music;

import com.femonster.json.SimpleJson;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class CommentPayloads {
    private CommentPayloads() {
    }

    public static Map<String, Object> fromRoot(String provider, String label, Object root, int limit) {
        Map<String, Object> rootMap = SimpleJson.asMap(root);
        List<Object> source = firstList(root, "comments", "commentlist", "hotComments", "list", "items");
        List<Map<String, Object>> comments = new ArrayList<>();
        int max = limit > 0 ? limit : 20;
        for (Object item : source) {
            Map<String, Object> comment = normalizeComment(item);
            if (!SimpleJson.asString(comment.get("content"), "").isBlank()) comments.add(comment);
            if (comments.size() >= max) break;
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", !rootMap.containsKey("error"));
        body.put("provider", provider);
        body.put("label", label);
        body.put("comments", comments);
        body.put("total", firstLong(root, "total", "commenttotal", "commentTotal", "totalCount"));
        if (rootMap.containsKey("error")) body.put("error", rootMap.get("error"));
        return body;
    }

    public static Map<String, Object> error(String provider, String label, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", false);
        body.put("provider", provider);
        body.put("label", label);
        body.put("comments", List.of());
        body.put("total", 0);
        body.put("error", message);
        return body;
    }

    private static Map<String, Object> normalizeComment(Object value) {
        Map<String, Object> map = SimpleJson.asMap(value);
        Map<String, Object> user = firstMap(map, "user", "simpleUser", "userinfo", "userInfo", "creator", "owner");

        String nickname = firstNonBlank(
            firstString(user, "nickname", "nick", "name", "username", "uin"),
            firstString(map, "nick", "nickname", "userName", "uin")
        );
        String avatarUrl = firstNonBlank(
            firstString(user, "avatarUrl", "avatar", "avatarurl", "headimgurl", "headurl", "middlepic"),
            firstString(map, "avatarUrl", "avatar", "avatarurl", "headimgurl", "headurl", "middlepic")
        );

        Map<String, Object> normalizedUser = new LinkedHashMap<>();
        normalizedUser.put("nickname", nickname);
        normalizedUser.put("avatarUrl", avatarUrl);

        Map<String, Object> comment = new LinkedHashMap<>();
        comment.put("id", firstString(map, "commentId", "commentid", "rootcommentid", "id"));
        comment.put("content", firstString(map, "content", "text", "msg", "message", "rootcommentcontent"));
        comment.put("likedCount", firstLong(map, "likedCount", "likedcount", "praisenum", "praiseNum", "likeCount"));
        comment.put("time", normalizeTime(firstLong(map, "time", "timeMills", "timestamp", "commenttime", "commentTime")));
        comment.put("user", normalizedUser);
        return comment;
    }

    private static long normalizeTime(long value) {
        if (value > 0 && value < 10_000_000_000L) return value * 1000L;
        return value;
    }

    private static Map<String, Object> firstMap(Object root, String... keys) {
        Map<String, Object> map = SimpleJson.asMap(root);
        for (String key : keys) {
            Map<String, Object> child = SimpleJson.asMap(map.get(key));
            if (!child.isEmpty()) return child;
        }
        return new LinkedHashMap<>();
    }

    private static List<Object> firstList(Object root, String... keys) {
        return firstList(root, 0, keys);
    }

    private static List<Object> firstList(Object root, int depth, String... keys) {
        if (depth > 8) return List.of();
        if (root instanceof List<?>) return SimpleJson.asList(root);

        Map<String, Object> map = SimpleJson.asMap(root);
        for (String key : keys) {
            List<Object> list = SimpleJson.asList(map.get(key));
            if (!list.isEmpty()) return list;
        }
        for (String key : keys) {
            Map<String, Object> child = SimpleJson.asMap(map.get(key));
            if (!child.isEmpty()) {
                List<Object> list = firstList(child, depth + 1, keys);
                if (!list.isEmpty()) return list;
            }
        }
        for (Object value : map.values()) {
            if (!(value instanceof Map<?, ?>) && !(value instanceof List<?>)) continue;
            List<Object> list = firstList(value, depth + 1, keys);
            if (!list.isEmpty()) return list;
        }
        return List.of();
    }

    private static String firstString(Object root, String... keys) {
        return firstString(root, 0, keys);
    }

    private static String firstString(Object root, int depth, String... keys) {
        if (depth > 8) return "";
        if (root instanceof String s) return s;
        if (root instanceof List<?>) {
            for (Object item : SimpleJson.asList(root)) {
                String nested = firstString(item, depth + 1, keys);
                if (!nested.isBlank()) return nested;
            }
            return "";
        }
        Map<String, Object> map = SimpleJson.asMap(root);
        for (String key : keys) {
            String value = SimpleJson.asString(map.get(key), "");
            if (!value.isBlank()) return value;
        }
        for (Object value : map.values()) {
            if (!(value instanceof Map<?, ?>) && !(value instanceof List<?>)) continue;
            String nested = firstString(value, depth + 1, keys);
            if (!nested.isBlank()) return nested;
        }
        return "";
    }

    private static long firstLong(Object root, String... keys) {
        return firstLong(root, 0, keys);
    }

    private static long firstLong(Object root, int depth, String... keys) {
        if (depth > 8) return 0;
        Map<String, Object> map = SimpleJson.asMap(root);
        for (String key : keys) {
            long value = SimpleJson.asLong(map.get(key), 0);
            if (value != 0) return value;
        }
        for (Object value : map.values()) {
            if (!(value instanceof Map<?, ?>) && !(value instanceof List<?>)) continue;
            long nested = firstLong(value, depth + 1, keys);
            if (nested != 0) return nested;
        }
        return 0;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "";
    }
}
