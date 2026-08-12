package com.femonster.music;

import com.femonster.core.ProjectPaths;
import com.femonster.json.SimpleJson;

import java.util.LinkedHashMap;
import java.util.Map;

/** Verifies that a clean installation bootstraps every bundled music provider exactly once. */
public final class MusicApiBundledBootstrapProbe {
    private MusicApiBundledBootstrapProbe() {
    }

    public static void main(String[] args) throws Exception {
        Map<String, Object> first;
        try (MusicApiConfigService service = new MusicApiConfigService(ProjectPaths.detect())) {
            first = service.redactedPayload();
        }

        Map<String, Object> restarted;
        try (MusicApiConfigService service = new MusicApiConfigService(ProjectPaths.detect())) {
            restarted = service.redactedPayload();
        }

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("first", first);
        report.put("restarted", restarted);
        System.out.println(SimpleJson.stringify(report));
    }
}
