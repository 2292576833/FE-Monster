package com.femonster.api;

import com.femonster.ai.tts.TtsSessionManager;
import com.femonster.core.ClientAiException;
import com.femonster.core.ClientAiGateway;
import com.femonster.http.HttpUtil;
import com.femonster.json.SimpleJson;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Behavior probe for the single HTTP seam owned by the client-AI module. */
public final class ClientAiHttpModuleProbe {
    private ClientAiHttpModuleProbe() {
    }

    public static void main(String[] args) throws Exception {
        requireSingleTryHandleSeam();
        Path dataDir = Files.createTempDirectory("fe-client-ai-http-module-");
        ExecutorService executor = Executors.newCachedThreadPool();
        HttpServer server = null;
        try (
            ClientAiGateway gateway = new ClientAiGateway(dataDir.resolve("client-ai"));
            TtsSessionManager sessions = new TtsSessionManager(
                () -> null,
                (endpoint, headers, listener) -> {
                    throw new IOException("the provider transport must not be opened by this probe");
                },
                Duration.ofMinutes(2),
                1024
            )
        ) {
            ClientAiHttpModule module = new ClientAiHttpModule(gateway, sessions);
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.setExecutor(executor);
            server.createContext("/api/", exchange -> dispatch(module, exchange));
            server.start();

            String base = "http://127.0.0.1:" + server.getAddress().getPort();
            HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();

            HttpResponse<String> providers = client.send(
                localGet(base, "/api/client-ai/providers"),
                HttpResponse.BodyHandlers.ofString()
            );
            require(providers.statusCode() == 200, "the module must handle its provider-catalog route over HTTP");
            require(providers.headers().firstValue("Cache-Control").orElse("").contains("no-store"),
                "client-AI metadata must remain non-cacheable");
            Map<String, Object> catalog = SimpleJson.parseObjectStrict(providers.body());
            require("fe-monster.ai-provider-catalog/v1".equals(catalog.get("schema")),
                "the real provider catalog must cross the HTTP seam");

            HttpResponse<String> unrelated = client.send(
                localGet(base, "/api/app/version"),
                HttpResponse.BodyHandlers.ofString()
            );
            require(unrelated.statusCode() == 418,
                "the module must return false instead of claiming another route namespace");

            HttpResponse<String> unknownClientAiRoute = client.send(
                localGet(base, "/api/client-ai/unknown"),
                HttpResponse.BodyHandlers.ofString()
            );
            require(unknownClientAiRoute.statusCode() == 404,
                "the module must own unknown routes inside the client-AI namespace");

            HttpResponse<String> unsupportedClientAiMethod = client.send(
                HttpRequest.newBuilder(URI.create(base + "/api/client-ai/providers"))
                    .header("Origin", base)
                    .header("Referer", base + "/")
                    .header("Sec-Fetch-Site", "same-origin")
                    .PUT(HttpRequest.BodyPublishers.noBody())
                    .build(),
                HttpResponse.BodyHandlers.ofString()
            );
            require(unsupportedClientAiMethod.statusCode() == 405,
                "the module must preserve method-not-allowed inside its namespace");

            HttpResponse<String> crossOrigin = client.send(
                HttpRequest.newBuilder(URI.create(base + "/api/client-ai/providers"))
                    .header("Origin", "http://example.invalid")
                    .header("Referer", "http://example.invalid/")
                    .header("Sec-Fetch-Site", "cross-site")
                    .GET()
                    .build(),
                HttpResponse.BodyHandlers.ofString()
            );
            require(crossOrigin.statusCode() == 403,
                "the module must own the local-application access policy for handled routes");

            HttpResponse<String> crossOriginUnknown = client.send(
                HttpRequest.newBuilder(URI.create(base + "/api/client-ai/unknown"))
                    .header("Origin", "http://example.invalid")
                    .header("Referer", "http://example.invalid/")
                    .header("Sec-Fetch-Site", "cross-site")
                    .GET()
                    .build(),
                HttpResponse.BodyHandlers.ofString()
            );
            require(crossOriginUnknown.statusCode() == 403,
                "unknown client-AI routes must not bypass the namespace access policy");

            System.out.println("ClientAiHttpModuleProbe passed");
        } finally {
            if (server != null) server.stop(0);
            executor.shutdownNow();
            deleteTree(dataDir);
        }
    }

    private static HttpRequest localGet(String base, String path) {
        return HttpRequest.newBuilder(URI.create(base + path))
            .header("Origin", base)
            .header("Referer", base + "/")
            .header("Sec-Fetch-Site", "same-origin")
            .GET()
            .build();
    }

    private static void dispatch(ClientAiHttpModule module, HttpExchange exchange) throws IOException {
        try {
            if (!module.tryHandle(exchange)) {
                HttpUtil.sendJson(exchange, 418, Map.of("handled", false));
            }
        } catch (ClientAiException error) {
            Map<String, Object> body = new LinkedHashMap<>(HttpUtil.error(error.getMessage()));
            body.put("errorCode", error.errorCode());
            HttpUtil.sendJson(exchange, error.status(), body);
        } catch (SecurityException error) {
            HttpUtil.sendJson(exchange, 403, HttpUtil.error(error.getMessage()));
        } catch (IllegalArgumentException error) {
            HttpUtil.sendJson(exchange, 400, HttpUtil.error(error.getMessage()));
        } catch (Exception error) {
            HttpUtil.sendJson(exchange, 500, HttpUtil.error(error.getMessage()));
        } finally {
            exchange.close();
        }
    }

    private static void requireSingleTryHandleSeam() {
        List<Method> seam = Arrays.stream(ClientAiHttpModule.class.getDeclaredMethods())
            .filter(method -> !method.isSynthetic())
            .filter(method -> !Modifier.isPrivate(method.getModifiers()))
            .filter(method -> !Modifier.isStatic(method.getModifiers()))
            .toList();
        require(seam.size() == 1, "ClientAiHttpModule must expose exactly one instance method");
        Method method = seam.get(0);
        require("tryHandle".equals(method.getName()), "the single seam must be named tryHandle");
        require(method.getReturnType() == boolean.class, "tryHandle must report whether it claimed the route");
        require(Arrays.equals(method.getParameterTypes(), new Class<?>[] { HttpExchange.class }),
            "tryHandle must accept only the current HttpExchange");
    }

    private static void deleteTree(Path root) throws IOException {
        if (root == null || !Files.exists(root)) return;
        try (var paths = Files.walk(root)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
