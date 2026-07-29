package com.femonster.music;

import com.femonster.core.ProjectPaths;
import com.femonster.json.SimpleJson;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Black-box probe for the imported music API package lifecycle. The JavaScript
 * integration check supplies an isolated data directory, package ZIP and port.
 */
public final class MusicApiConfigServiceLifecycleProbe {
    private MusicApiConfigServiceLifecycleProbe() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("expected package ZIP path");
        Path packageZip = Path.of(args[0]).toAbsolutePath().normalize();
        Map<String, Object> status = Map.of();
        Map<String, Object> health = Map.of();
        Map<String, Object> providers = Map.of();

        try (MusicApiConfigService service = new MusicApiConfigService(ProjectPaths.detect());
            InputStream input = Files.newInputStream(packageZip)) {
            service.importTrustedZip(input, true);
            service.ensureStarted("kugou");

            long deadline = System.nanoTime() + Duration.ofSeconds(16).toNanos();
            while (System.nanoTime() < deadline) {
                status = service.refreshStatus("kugou");
                String lifecycle = SimpleJson.asString(status.get("status"), "");
                if ("ready".equals(lifecycle) || lifecycle.startsWith("port-conflict")) break;
                Thread.sleep(100);
            }

            MusicApiConfigService.ProviderConfig config = service.provider("kugou");
            health = readHealth(config.baseUrl() + config.healthPath());
            providers = service.redactedPayload();
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", status);
        result.put("health", health);
        result.put("providers", providers);
        System.out.println(SimpleJson.stringify(result));
    }

    private static Map<String, Object> readHealth(String url) {
        try {
            HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build();
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(2))
                .GET()
                .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            return SimpleJson.parseObjectStrict(response.body());
        } catch (Exception error) {
            return Map.of("error", error.getClass().getSimpleName());
        }
    }
}
