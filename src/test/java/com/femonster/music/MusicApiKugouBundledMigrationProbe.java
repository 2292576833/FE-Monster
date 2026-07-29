package com.femonster.music;

import com.femonster.core.ProjectPaths;
import com.femonster.json.SimpleJson;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Black-box restart probe for the bundled Kugou package migration.
 */
public final class MusicApiKugouBundledMigrationProbe {
    private MusicApiKugouBundledMigrationProbe() {
    }

    public static void main(String[] args) throws Exception {
        Map<String, Object> firstStatus;
        Map<String, Object> firstProviders;
        try (MusicApiConfigService service = new MusicApiConfigService(ProjectPaths.detect())) {
            service.ensureStarted("kugou");
            firstStatus = waitForTerminalStatus(service);
            firstProviders = service.redactedPayload();
        }

        Map<String, Object> restartedStatus;
        Map<String, Object> restartedProviders;
        Map<String, Object> health;
        try (MusicApiConfigService restarted = new MusicApiConfigService(ProjectPaths.detect())) {
            restarted.ensureStarted("kugou");
            restartedStatus = waitForTerminalStatus(restarted);
            MusicApiConfigService.ProviderConfig config = restarted.provider("kugou");
            health = readHealth(config.baseUrl() + config.healthPath());
            restartedProviders = restarted.redactedPayload();
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("firstStatus", firstStatus);
        result.put("firstProviders", firstProviders);
        result.put("restartedStatus", restartedStatus);
        result.put("restartedProviders", restartedProviders);
        result.put("health", health);
        System.out.println(SimpleJson.stringify(result));
    }

    private static Map<String, Object> waitForTerminalStatus(MusicApiConfigService service) throws Exception {
        Map<String, Object> status = Map.of();
        long deadline = System.nanoTime() + Duration.ofSeconds(16).toNanos();
        while (System.nanoTime() < deadline) {
            status = service.refreshStatus("kugou");
            String lifecycle = SimpleJson.asString(status.get("status"), "");
            if ("ready".equals(lifecycle) || lifecycle.startsWith("port-conflict")) return status;
            Thread.sleep(100);
        }
        return status;
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
