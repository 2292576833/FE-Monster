package com.femonster.core;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.Comparator;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

public final class CommunityServiceLanDiscoveryProbe {
    private CommunityServiceLanDiscoveryProbe() {
    }

    public static void main(String[] args) throws Exception {
        InetAddress lanAddress = physicalLanAddress();
        Path root = Files.createTempDirectory("fe-community-lan-discovery-");
        try {
            verifyConfiguredLoopbackDiscoversSamePort(root, lanAddress);
            verifyExplicitLanAddressStaysAuthoritative(root, lanAddress);
            verifyRuntimeRediscoveryRebuildsHttpClient(root, lanAddress);
            verifyLegacyGatewayPrefixRecovery(root, lanAddress);
            System.out.println("CommunityServiceLanDiscoveryProbe passed");
        } finally {
            try (var paths = Files.walk(root)) {
                paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                    try {
                        Files.deleteIfExists(path);
                    } catch (IOException ignored) {
                    }
                });
            }
        }
    }

    private static void verifyConfiguredLoopbackDiscoversSamePort(Path root, InetAddress lanAddress) throws Exception {
        AtomicInteger healthRequests = new AtomicInteger();
        HttpServer server = startHealthServer(lanAddress, 0, healthRequests);
        try {
            int port = server.getAddress().getPort();
            Path config = writeConfig(root.resolve("configured-loopback"), "http://127.0.0.1:" + port);
            CommunityService service = new CommunityService(config);
            Map<String, Object> state = loggedOutState(service);
            String expected = "http://" + lanAddress.getHostAddress() + ":" + port;
            require(Boolean.TRUE.equals(state.get("serverOnline")),
                "unreachable configured loopback did not discover the LAN service: " + state);
            require(expected.equals(String.valueOf(state.get("serverUrl"))),
                "LAN discovery changed the configured port or chose the wrong host: " + state);
            require(healthRequests.get() > 0, "the discovered LAN health endpoint was never used");
        } finally {
            server.stop(0);
        }
    }

    private static void verifyExplicitLanAddressStaysAuthoritative(Path root, InetAddress lanAddress) throws Exception {
        int closedPort = reservePort(lanAddress);
        String configured = "http://" + lanAddress.getHostAddress() + ":" + closedPort;
        Path config = writeConfig(root.resolve("explicit-lan"), configured);
        CommunityService service = new CommunityService(config);
        Map<String, Object> state = loggedOutState(service);
        require(configured.equals(String.valueOf(state.get("serverUrl"))),
            "an explicit non-loopback endpoint was replaced by discovery: " + state);
        require(Boolean.FALSE.equals(state.get("serverOnline")),
            "the deliberately closed explicit LAN endpoint unexpectedly reported online");

        String configuredHttps = "https://community.example.invalid:8443";
        Path httpsConfig = writeConfig(root.resolve("explicit-https"), configuredHttps);
        CommunityService httpsService = new CommunityService(httpsConfig);
        require(configuredHttps.equals(String.valueOf(field(httpsService, "baseUrl"))),
            "an explicit non-loopback HTTPS endpoint was replaced by discovery");
        require(Boolean.FALSE.equals(field(httpsService, "lanRediscoveryEnabled")),
            "an explicit non-loopback HTTPS endpoint enabled LAN rediscovery");
    }

    private static void verifyRuntimeRediscoveryRebuildsHttpClient(Path root, InetAddress lanAddress) throws Exception {
        int port = reservePort(lanAddress);
        Path config = writeConfig(root.resolve("runtime-rediscovery"), "http://127.0.0.1:" + port);
        CommunityService service = new CommunityService(config);
        Object initialClient = invokeHttpClient(service);

        AtomicInteger healthRequests = new AtomicInteger();
        HttpServer server = startHealthServer(lanAddress, port, healthRequests);
        try {
            Map<String, Object> recovered = loggedOutState(service);
            String expected = "http://" + lanAddress.getHostAddress() + ":" + port;
            require(Boolean.TRUE.equals(recovered.get("serverOnline")),
                "a LAN service that appeared after startup was not discovered: " + recovered);
            require(expected.equals(String.valueOf(recovered.get("serverUrl"))),
                "runtime discovery did not keep the configured port: " + recovered);
            Object recoveredClient = invokeHttpClient(service);
            require(initialClient != recoveredClient,
                "switching the resolved endpoint reused the old HttpClient");

            server.stop(0);
            setLongField(service, "lastDiscoveryAt", 0L);
            invokeRediscovery(service);
            long firstDiscoveryAt = longField(service, "lastDiscoveryAt");
            require(firstDiscoveryAt > 0L, "a failed runtime health check did not record discovery throttling");

            invokeRediscovery(service);
            require(longField(service, "lastDiscoveryAt") == firstDiscoveryAt,
                "runtime LAN discovery was not rate limited");
        } finally {
            server.stop(0);
        }
    }

    private static void verifyLegacyGatewayPrefixRecovery(Path root, InetAddress lanAddress) throws Exception {
        AtomicInteger gatewayHealthRequests = new AtomicInteger();
        AtomicInteger communityHealthRequests = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress(lanAddress, 0), 0);
        server.createContext("/health", exchange -> {
            gatewayHealthRequests.incrementAndGet();
            byte[] body = "{\"ok\":true,\"service\":\"fe-monster-public-mobile-proxy\"}"
                .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.createContext("/community/health", exchange -> {
            communityHealthRequests.incrementAndGet();
            sendHealth(exchange);
        });
        server.start();
        try {
            String legacyBase = "http://" + lanAddress.getHostAddress() + ":" + server.getAddress().getPort();
            Path config = writeConfig(root.resolve("legacy-gateway-prefix"), legacyBase);
            CommunityService service = new CommunityService(config);
            Map<String, Object> state = loggedOutState(service);
            require(Boolean.TRUE.equals(state.get("serverOnline")),
                "a legacy gateway URL without /community did not recover: " + state);
            require((legacyBase + "/community").equals(String.valueOf(state.get("serverUrl"))),
                "legacy gateway recovery selected the wrong endpoint: " + state);
            require(gatewayHealthRequests.get() > 0,
                "legacy gateway root health was not checked before recovery");
            require(communityHealthRequests.get() > 0,
                "legacy gateway /community health was not checked during recovery");
            require((legacyBase + "/community").equals(Files.readString(config).trim()),
                "recovered legacy gateway endpoint was not persisted");

            Path prefixedConfig = writeConfig(
                root.resolve("already-prefixed-gateway"),
                legacyBase + "/community"
            );
            CommunityService prefixedService = new CommunityService(prefixedConfig);
            Map<String, Object> prefixedState = loggedOutState(prefixedService);
            require(Boolean.TRUE.equals(prefixedState.get("serverOnline")),
                "an already-prefixed gateway endpoint stopped working: " + prefixedState);
            require((legacyBase + "/community").equals(String.valueOf(prefixedState.get("serverUrl"))),
                "an already-prefixed gateway endpoint was duplicated: " + prefixedState);
        } finally {
            server.stop(0);
        }


        HttpServer unrelated = HttpServer.create(new InetSocketAddress(lanAddress, 0), 0);
        unrelated.createContext("/health", exchange -> {
            byte[] body = "{\"ok\":true,\"service\":\"unrelated-service\"}"
                .getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        unrelated.createContext("/community/health", CommunityServiceLanDiscoveryProbe::sendHealth);
        unrelated.start();
        try {
            String unrelatedBase = "http://" + lanAddress.getHostAddress() + ":" + unrelated.getAddress().getPort();
            Path config = writeConfig(root.resolve("unrelated-gateway"), unrelatedBase);
            CommunityService service = new CommunityService(config);
            Map<String, Object> state = loggedOutState(service);
            require(Boolean.FALSE.equals(state.get("serverOnline")),
                "an unrelated root service was incorrectly rewritten to /community: " + state);
            require(unrelatedBase.equals(String.valueOf(state.get("serverUrl"))),
                "an unrelated root service changed endpoint: " + state);
            require(unrelatedBase.equals(Files.readString(config).trim()),
                "an unrelated root service changed the persisted endpoint");
        } finally {
            unrelated.stop(0);
        }
    }

    private static Map<String, Object> loggedOutState(CommunityService service) {
        return service.state(
            "netease",
            "NetEase",
            Map.of("loggedIn", false, "account", Map.of())
        );
    }

    private static Path writeConfig(Path directory, String url) throws IOException {
        Files.createDirectories(directory);
        Path config = directory.resolve("community-server-url.txt");
        Files.writeString(config, url, StandardCharsets.UTF_8);
        return config;
    }

    private static HttpServer startHealthServer(
        InetAddress address,
        int port,
        AtomicInteger healthRequests
    ) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(address, port), 0);
        server.createContext("/health", exchange -> {
            healthRequests.incrementAndGet();
            sendHealth(exchange);
        });
        server.start();
        return server;
    }

    private static void sendHealth(HttpExchange exchange) throws IOException {
        byte[] body = "{\"ok\":true,\"service\":\"fe-monster-community\"}"
            .getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(200, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private static int reservePort(InetAddress address) throws IOException {
        try (ServerSocket socket = new ServerSocket()) {
            socket.bind(new InetSocketAddress(address, 0));
            return socket.getLocalPort();
        }
    }

    private static InetAddress physicalLanAddress() throws Exception {
        for (NetworkInterface network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
            if (!network.isUp() || network.isLoopback() || network.isVirtual() || likelyVirtual(network)) continue;
            for (InetAddress address : Collections.list(network.getInetAddresses())) {
                if (address instanceof Inet4Address
                    && !address.isLoopbackAddress()
                    && !address.isLinkLocalAddress()
                    && address.isSiteLocalAddress()) {
                    return address;
                }
            }
        }
        throw new IllegalStateException("no physical site-local IPv4 address is available for the LAN discovery probe");
    }

    private static boolean likelyVirtual(NetworkInterface network) {
        String text = ((network.getName() == null ? "" : network.getName()) + " "
            + (network.getDisplayName() == null ? "" : network.getDisplayName())).toLowerCase();
        return text.contains("virtual")
            || text.contains("vmware")
            || text.contains("virtualbox")
            || text.contains("hyper-v")
            || text.contains("loopback")
            || text.contains("wsl")
            || text.contains("tun")
            || text.contains("tap")
            || text.contains("vpn")
            || text.contains("singbox");
    }

    private static Object invokeHttpClient(CommunityService service) throws Exception {
        Method method = CommunityService.class.getDeclaredMethod("httpClient");
        method.setAccessible(true);
        return method.invoke(service);
    }

    private static void invokeRediscovery(CommunityService service) throws Exception {
        Method method = CommunityService.class.getDeclaredMethod("rediscoverCommunityServer");
        method.setAccessible(true);
        method.invoke(service);
    }

    private static long longField(CommunityService service, String name) throws Exception {
        return ((Number) field(service, name)).longValue();
    }

    private static void setLongField(CommunityService service, String name, long value) throws Exception {
        Field field = CommunityService.class.getDeclaredField(name);
        field.setAccessible(true);
        field.setLong(service, value);
    }

    private static Object field(CommunityService service, String name) throws Exception {
        Field field = CommunityService.class.getDeclaredField(name);
        field.setAccessible(true);
        return field.get(service);
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}
