package com.femonster.core;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/** Behavioral probe: the TTS source is owned by the model source and survives restart. */
public final class ClientAiSourceCouplingProbe {
    private ClientAiSourceCouplingProbe() {}

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-client-ai-source-coupling-");
        try {
            try (ClientAiGateway gateway = new ClientAiGateway(root)) {
                assertModes(gateway.snapshot(), "server", "server", "fresh state");
                Map<String, Object> local = gateway.configure(Map.of(
                    "modelMode", "custom",
                    "ttsMode", "server"
                ));
                assertModes(local, "custom", "custom", "local model must force local TTS");

                Map<String, Object> mismatchedTtsPatch = gateway.configure(Map.of("ttsMode", "server"));
                assertModes(mismatchedTtsPatch, "custom", "custom", "TTS-only patch must not escape local model mode");
            }

            try (ClientAiGateway restarted = new ClientAiGateway(root)) {
                assertModes(restarted.snapshot(), "custom", "custom", "local source coupling after restart");
                Map<String, Object> server = restarted.configure(Map.of(
                    "modelMode", "server",
                    "ttsMode", "custom"
                ));
                assertModes(server, "server", "server", "server model must force server TTS");
            }

            try (ClientAiGateway restartedAgain = new ClientAiGateway(root)) {
                assertModes(restartedAgain.snapshot(), "server", "server", "server source coupling after restart");
            }
            System.out.println("ClientAiSourceCouplingProbe passed");
        } finally {
            deleteTree(root);
        }
    }

    private static void assertModes(Map<String, Object> snapshot, String model, String tts, String label) {
        if (!model.equals(String.valueOf(snapshot.get("modelMode")))
            || !tts.equals(String.valueOf(snapshot.get("ttsMode")))) {
            throw new AssertionError(label + ": " + snapshot);
        }
    }

    private static void deleteTree(Path root) throws Exception {
        if (!Files.exists(root)) return;
        try (var paths = Files.walk(root)) {
            for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }
}
