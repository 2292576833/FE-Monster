package com.femonster.core;

import java.lang.reflect.Method;
import java.lang.reflect.Field;
import com.femonster.json.SimpleJson;
import java.util.List;
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
        require(!invoke(authenticated, "netease", Map.of("MUSIC_A", "anonymous-visitor")),
            "NetEase visitor cookie started the authenticated synchronization budget before a QR scan");
        require(invoke(authenticated, "netease", Map.of("MUSIC_U", "verified-user")),
            "NetEase authenticated session was not recognized");
        verifyCookieDomainSelection();
        System.out.println("OfficialBrowserLoginServiceKugouSessionProbe passed");
    }

    @SuppressWarnings("unchecked")
    private static void verifyCookieDomainSelection() throws Exception {
        Field providers = OfficialBrowserLoginService.class.getDeclaredField("PROVIDERS");
        providers.setAccessible(true);
        Object spec = ((Map<?, ?>) providers.get(null)).get("qq");
        Method filter = OfficialBrowserLoginService.class.getDeclaredMethod("filterCookies", spec.getClass(), String.class);
        filter.setAccessible(true);
        String raw = SimpleJson.stringify(Map.of("result", Map.of("cookies", List.of(
            Map.of("domain", ".y.qq.com", "path", "/", "name", "qm_keyst", "value", "official-key"),
            Map.of("domain", ".ptlogin2.qq.com", "path", "/", "name", "qm_keyst", "value", "sso-key"),
            Map.of("domain", ".y.qq.com", "path", "/", "name", "uin", "value", "10001"),
            Map.of("domain", ".example.com", "path", "/", "name", "uin", "value", "unrelated"),
            Map.of("domain", ".y.qq.com", "path", "/", "name", "expired", "value", "old", "expires", 1)
        ))));
        Map<String, String> cookies = (Map<String, String>) filter.invoke(null, spec, raw);
        require("official-key".equals(cookies.get("qm_keyst")),
            "generic SSO domain overwrote the official music cookie with the same name");
        require("10001".equals(cookies.get("uin")), "unrelated domain overwrote the provider identity");
        require(!cookies.containsKey("expired"), "expired browser cookies were imported");
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
