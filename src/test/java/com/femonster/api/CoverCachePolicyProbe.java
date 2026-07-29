package com.femonster.api;

import java.nio.charset.StandardCharsets;

public final class CoverCachePolicyProbe {
    private CoverCachePolicyProbe() {
    }

    public static void main(String[] args) {
        String first = ApiRoutes.coverEntityTag("cover-a".getBytes(StandardCharsets.UTF_8));
        String same = ApiRoutes.coverEntityTag("cover-a".getBytes(StandardCharsets.UTF_8));
        String different = ApiRoutes.coverEntityTag("cover-b".getBytes(StandardCharsets.UTF_8));

        require(first.equals(same), "entity tag must be stable");
        require(!first.equals(different), "different cover bytes must not share an entity tag");
        require(ApiRoutes.coverEntityTagMatches(first, first), "strong entity tag must match");
        require(ApiRoutes.coverEntityTagMatches("W/" + first, first), "weak entity tag must match for GET");
        require(ApiRoutes.coverEntityTagMatches("\"other\", " + first, first), "entity tag list must match");
        require(ApiRoutes.coverEntityTagMatches("*", first), "wildcard entity tag must match");
        require(!ApiRoutes.coverEntityTagMatches(different, first), "different entity tag must not match");

        System.out.println("CoverCachePolicyProbe passed");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
