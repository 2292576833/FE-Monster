package com.femonster.music;

public final class MusicApiManagedLogRedactionProbe {
    private MusicApiManagedLogRedactionProbe() {
    }

    public static void main(String[] args) {
        String cookie = "FE_JAVA_LOG_COOKIE_942a55";
        String bearer = "FE_JAVA_LOG_BEARER_65db31";
        String token = "FE_JAVA_LOG_TOKEN_7e1610";
        String input = "GET /login/status?cookie=" + cookie + "&safe=value\n"
            + "{ authorization: 'Bearer " + bearer + "', accessToken: '" + token + "', page: 1 }\n"
            + "Cookie: MUSIC_U=" + cookie;
        String output = MusicApiConfigService.sanitizeManagedLogLine(input);

        require(!output.contains(cookie), "cookie leaked from managed plugin log");
        require(!output.contains(bearer), "bearer token leaked from managed plugin log");
        require(!output.contains(token), "access token leaked from managed plugin log");
        require(output.contains("[REDACTED]"), "redaction marker is missing");
        require(output.contains("safe=value"), "safe query field was removed");
        require(output.contains("page: 1"), "safe structured field was removed");
        System.out.println("MusicApiManagedLogRedactionProbe passed");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
