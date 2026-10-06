package com.femonster.music.sources;

import com.femonster.json.SimpleJson;
import java.nio.file.*;
import java.util.*;

public final class LxProcessRunnerProbe {
    public static void main(String[] args) throws Exception {
        Path node = Path.of(args[0]), fixture = Path.of(args[1]), temp = Path.of(args[2]);
        try (var runner = new LxProcessRunner(node, fixture, 700, true)) {
            if (!runner.ready()) throw new AssertionError("fixture runtime not ready");
            var clean = runner.run(Map.of("op", "resolve"));
            if (!Boolean.TRUE.equals(clean.get("ok"))) throw new AssertionError("inherited preload/secret environment or no output");
            Path pidFile = temp.resolve("hung-process.pid");
            long start = System.nanoTime();
            var timeout = runner.run(Map.of("mode", "hang", "pidFile", pidFile.toString()));
            if (!"AUDIO_SOURCE_TIMEOUT".equals(timeout.get("code"))) throw new AssertionError("timeout not reported");
            if ((System.nanoTime()-start)/1_000_000 > 2500) throw new AssertionError("timeout did not bound process");
            long pid = Long.parseLong(Files.readString(pidFile));
            if (ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false)) throw new AssertionError("timed out process still alive");
            if (Boolean.TRUE.equals(runner.run(Map.of("mode", "overflow")).get("ok"))) throw new AssertionError("stdout limit not enforced");
            if (SimpleJson.stringify(runner.run(Map.of("mode", "failure", "script", "SECRET_SCRIPT ?token=SECRET"))).contains("SECRET")) throw new AssertionError("diagnostic leaked");
            var pending = runner.run(Map.of("op", "inspect", "mode", "init-network", "requiredHosts", List.of("Init.Example.org")));
            if (!"AUDIO_SOURCE_INIT_NETWORK_REQUIRED".equals(pending.get("code")) || !List.of("init.example.org").equals(pending.get("requiredHosts"))) throw new AssertionError("initialization host requirement lost");
            if (SimpleJson.stringify(pending).contains("PRIVATE")) throw new AssertionError("initialization output leaked diagnostic or URL");
            for (Object hosts : List.of(List.of(), "init.example.org", List.of(7), List.of("127.0.0.1"), List.of("localhost"), List.of("host.local"), List.of("*.example.org"), List.of("init.example.org/path?PRIVATE_QUERY"), List.of("https://init.example.org"), List.of("init.example.org", "INIT.EXAMPLE.ORG"), Collections.nCopies(33,"init.example.org"))) {
                var invalid = runner.run(Map.of("op", "inspect", "mode", "init-network", "requiredHosts", hosts));
                if (!"AUDIO_SOURCE_SCRIPT_FAILED".equals(invalid.get("code")) || invalid.containsKey("requiredHosts") || SimpleJson.stringify(invalid).contains("PRIVATE")) throw new AssertionError("invalid initialization host output accepted");
            }
            if (runner.run(Map.of("op", "resolve", "mode", "init-network", "requiredHosts", List.of("init.example.org"))).containsKey("requiredHosts")) throw new AssertionError("non-inspect operation exposed initialization host data");
            for (String code : List.of("HOST_BLOCKED", "MEDIA_HOST_BLOCKED")) {
                var missing = runner.run(Map.of("op", "resolve", "mode", "coded-failure", "code", code, "requiredHosts", List.of("CDN.Example.org")));
                String expected = code.equals("HOST_BLOCKED") ? "AUDIO_SOURCE_HOST_NOT_ALLOWED" : "AUDIO_SOURCE_MEDIA_HOST_NOT_ALLOWED";
                if (!expected.equals(missing.get("code")) || !List.of("cdn.example.org").equals(missing.get("requiredHosts")) || SimpleJson.stringify(missing).contains("PRIVATE")) throw new AssertionError("missing-host diagnostic not classified and sanitized");
                for (Object hosts : List.of(List.of(), List.of("127.0.0.1"), List.of("localhost"), List.of("*.example.org"), List.of("https://cdn.example.org/PRIVATE?key=PRIVATE"), List.of("host.home.arpa"), "cdn.example.org")) {
                    var invalid = runner.run(Map.of("op", "resolve", "mode", "coded-failure", "code", code, "requiredHosts", hosts));
                    if (invalid.containsKey("requiredHosts") || SimpleJson.stringify(invalid).contains("PRIVATE")) throw new AssertionError("invalid missing-host detail accepted");
                }
            }
            var codes = Map.of("NETWORK_TIMEOUT", "NETWORK_TIMEOUT", "DNS_FAILED", "NETWORK_TIMEOUT", "NETWORK_FAILED", "NETWORK_FAILED", "HTTP_STATUS", "HTTP_ERROR", "REQUEST_UNSUPPORTED", "REQUEST_UNSUPPORTED", "HEADER_BLOCKED", "REQUEST_UNSUPPORTED", "ENCODING_UNSUPPORTED", "RESPONSE_UNSUPPORTED", "RESPONSE_SIZE", "RESPONSE_UNSUPPORTED", "REDIRECT_BLOCKED", "REDIRECT_BLOCKED");
            for (var item : codes.entrySet()) {
                var result = runner.run(Map.of("op", "resolve", "mode", "coded-failure", "code", item.getKey(), "requiredHosts", List.of("private.example.org")));
                if (!("AUDIO_SOURCE_" + item.getValue()).equals(result.get("code")) || result.containsKey("requiredHosts") || SimpleJson.stringify(result).contains("PRIVATE")) throw new AssertionError("resolve network classification lost: " + item.getKey());
            }
            var download = runner.run(Map.of("op", "download", "mode", "coded-failure", "code", "DNS_FAILED"));
            if (!"AUDIO_SOURCE_DOWNLOAD_TIMEOUT".equals(download.get("code"))) throw new AssertionError("download-specific error changed");
            var http = runner.run(Map.of("op", "resolve", "mode", "coded-failure", "code", "HTTP_STATUS", "httpStatus", 502));
            if (!"AUDIO_SOURCE_HTTP_ERROR".equals(http.get("code")) || !Integer.valueOf(502).equals(http.get("httpStatus")) || SimpleJson.stringify(http).contains("PRIVATE")) throw new AssertionError("safe HTTP status lost or diagnostics leaked");
            for (Object status : List.of("502", "PRIVATE", 399, 600, 502.5, true, Map.of("status", 502))) {
                var invalid = runner.run(Map.of("op", "resolve", "mode", "coded-failure", "code", "HTTP_STATUS", "httpStatus", status));
                if (invalid.containsKey("httpStatus") || SimpleJson.stringify(invalid).contains("PRIVATE")) throw new AssertionError("invalid HTTP status exposed");
            }
            var unrelated = runner.run(Map.of("op", "resolve", "mode", "coded-failure", "code", "NETWORK_FAILED", "httpStatus", 502));
            if (unrelated.containsKey("httpStatus")) throw new AssertionError("HTTP status attached to unrelated error");
            var httpDownload = runner.run(Map.of("op", "download", "mode", "coded-failure", "code", "HTTP_STATUS", "httpStatus", 502));
            if (!"AUDIO_SOURCE_DOWNLOAD_FAILED".equals(httpDownload.get("code")) || httpDownload.containsKey("httpStatus")) throw new AssertionError("download HTTP contract changed");
            var rejected = runner.run(Map.of("op", "resolve", "mode", "coded-failure", "code", "SOURCE_REJECTED", "requiredHosts", List.of("private.example.org")));
            if (!Map.of("ok", false, "code", "AUDIO_SOURCE_REJECTED", "error", "AUDIO_SOURCE_REJECTED").equals(rejected)) throw new AssertionError("source rejection must preserve only its fixed code");
        }
        System.out.println("LxProcessRunnerProbe: environment, timeout, process disposal, stdout limit, redaction passed");
    }
}
