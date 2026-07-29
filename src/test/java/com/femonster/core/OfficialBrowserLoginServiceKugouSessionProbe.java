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
        System.out.println("OfficialBrowserLoginServiceKugouSessionProbe passed");
    }

    private static boolean invoke(Method authenticated, Map<String, String> cookies) throws Exception {
        return (boolean) authenticated.invoke(null, "kugou", cookies);
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
