package com.femonster.core;

import java.lang.reflect.Method;
import java.util.Map;

public final class OfficialBrowserLoginServiceKugouSessionProbe {
    private OfficialBrowserLoginServiceKugouSessionProbe() {
    }

    public static void main(String[] args) throws Exception {
        Method authenticated = OfficialBrowserLoginService.class.getDeclaredMethod(
            "hasAuthenticatedSession",
            String.class,
            Map.class
        );
        authenticated.setAccessible(true);

        require(
            !invoke(authenticated, Map.of("KuGoo", "KugooID=42")),
            "Kugou login completed before the nested token was available"
        );
        require(
            invoke(authenticated, Map.of("KuGoo", "KugooID=42&t=current-account-token")),
            "Kugou login did not recognize the current nested t token"
        );
        require(
            invoke(authenticated, Map.of("userid", "42", "token", "current-account-token")),
            "Kugou login did not recognize explicit account fields"
        );
        require(
            !invoke(authenticated, "qq", Map.of("p_uin", "o10001", "p_skey", "generic-sso-key")),
            "QQ generic SSO cookies were incorrectly accepted as a QQ Music session"
        );
        require(
            invoke(authenticated, "qq", Map.of("uin", "10001", "qm_keyst", "music-session-key")),
            "QQ Music session cookies were not recognized"
        );
        System.out.println("OfficialBrowserLoginServiceKugouSessionProbe passed");
    }

    private static boolean invoke(Method authenticated, Map<String, String> cookies) throws Exception {
        return invoke(authenticated, "kugou", cookies);
    }

    private static boolean invoke(Method authenticated, String provider, Map<String, String> cookies) throws Exception {
        return (boolean) authenticated.invoke(null, provider, cookies);
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
