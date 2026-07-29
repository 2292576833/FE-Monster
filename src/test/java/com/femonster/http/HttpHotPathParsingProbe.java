package com.femonster.http;

import java.util.Map;

public final class HttpHotPathParsingProbe {
    private HttpHotPathParsingProbe() {
    }

    public static void main(String[] args) {
        require(HttpUtil.parseQuery(null).isEmpty(), "null query must be empty");
        require(HttpUtil.parseQuery("").isEmpty(), "blank query must be empty");
        Map<String, String> parsed = HttpUtil.parseQuery("provider=qq&keyword=Fever+Pitch&empty=&provider=kugou&&flag");
        require("kugou".equals(parsed.get("provider")), "duplicate parameter must keep the last value");
        require("Fever Pitch".equals(parsed.get("keyword")), "encoded query value was not decoded");
        require(parsed.containsKey("empty") && parsed.get("empty").isEmpty(), "empty value was lost");
        require(parsed.containsKey("flag") && parsed.get("flag").isEmpty(), "flag parameter was lost");
        require(HttpUtil.hasNonEmptyRawParameter("x=1&v=20260728&y=2", "v"), "version token was not found");
        require(!HttpUtil.hasNonEmptyRawParameter("x=1&preview=2", "v"), "partial key matched version token");
        require(!HttpUtil.hasNonEmptyRawParameter("v=&x=1", "v"), "empty version token matched");
        System.out.println("HttpHotPathParsingProbe passed");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
