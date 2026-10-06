package com.femonster.memory;

import com.femonster.api.LocalMemoryHttpModule;
import com.femonster.community.CommunityClient;
import com.femonster.music.MusicProviderClient;
import com.femonster.music.MusicProviderRegistry;
import com.sun.net.httpserver.HttpServer;
import java.lang.reflect.Proxy;
import java.net.InetSocketAddress;
import java.nio.file.Path;
import java.util.Map;

/** Loopback-only real DPAPI/SQLite HTTP fixture; never opens user data. */
public final class LocalMemoryRoundtripFixture {
    public static void main(String[] args) throws Exception {
        MusicProviderRegistry registry = new MusicProviderRegistry(client("netease"), client("qq"));
        CommunityClient community = (CommunityClient) Proxy.newProxyInstance(CommunityClient.class.getClassLoader(),
            new Class<?>[]{CommunityClient.class}, (p, m, a) -> m.getName().equals("localMemorySubject")
                ? "fixture-account-" + a[0] : Map.of());
        try (LocalAiMemoryService memory = new LocalAiMemoryService(Path.of(args[0]), registry, community,
                Path.of("native/windows/build/fe-monster-wincrypto.dll"))) {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            LocalMemoryHttpModule routes = new LocalMemoryHttpModule(memory);
            server.createContext("/api/local-memory/", exchange -> routes.tryHandle(exchange));
            server.start();
            System.out.println("PORT=" + server.getAddress().getPort());
            try { System.in.read(); } finally { server.stop(0); }
        }
    }
    private static MusicProviderClient client(String id) {
        return (MusicProviderClient) Proxy.newProxyInstance(MusicProviderClient.class.getClassLoader(),
            new Class<?>[]{MusicProviderClient.class}, (p, m, a) -> switch (m.getName()) {
                case "id", "label" -> id;
                case "accountPayload" -> Map.of("loggedIn", true, "account", Map.of("userId", "fixture-" + id));
                default -> Map.of();
            });
    }
}
