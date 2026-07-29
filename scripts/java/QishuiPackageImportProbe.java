import com.femonster.core.ProjectPaths;
import com.femonster.json.SimpleJson;
import com.femonster.music.MusicApiConfigService;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

public final class QishuiPackageImportProbe {
    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("expected Qishui package ZIP path");
        Path packageZip = Path.of(args[0]).toAbsolutePath().normalize();
        Map<String, Object> status = Map.of();

        try (MusicApiConfigService service = new MusicApiConfigService(ProjectPaths.detect());
             InputStream input = Files.newInputStream(packageZip)) {
            service.importTrustedZip(input, true);
            service.ensureStarted("qishui");
            long deadline = System.nanoTime() + Duration.ofSeconds(12).toNanos();
            while (System.nanoTime() < deadline) {
                status = service.refreshStatus("qishui");
                if ("ready".equals(SimpleJson.asString(status.get("status"), ""))) break;
                Thread.sleep(100);
            }

            MusicApiConfigService.ProviderConfig config = service.provider("qishui");
            if (!"3.1.0".equals(config.manifestVersion())) {
                throw new IllegalStateException("Qishui package version was not imported");
            }
            if (!"ready".equals(SimpleJson.asString(status.get("status"), ""))) {
                throw new IllegalStateException("Qishui package did not become ready: " + SimpleJson.stringify(status));
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("ok", true);
            result.put("provider", config.id());
            result.put("version", config.manifestVersion());
            result.put("status", status.get("status"));
            result.put("configured", config.configured());
            System.out.println(SimpleJson.stringify(result));
        }
    }
}
