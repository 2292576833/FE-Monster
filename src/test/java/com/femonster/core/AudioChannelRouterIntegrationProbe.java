package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class AudioChannelRouterIntegrationProbe {
    private AudioChannelRouterIntegrationProbe() {
    }

    public static void main(String[] args) throws Exception {
        Path root = Path.of(args.length > 0 ? args[0] : "tmp/audio-channel-router-integration")
            .toAbsolutePath()
            .normalize();
        Files.createDirectories(root);
        Path mixerState = root.resolve("audio-mixer-state.json");
        ConnectedNative nativeBridge = new ConnectedNative();
        AudioMixerService service = new AudioMixerService(mixerState, nativeBridge);

        Map<String, Object> initial = service.channelSnapshot();
        require(((Number) initial.get("revision")).longValue() == 0L, "initial revision");
        require("5.1".equals(initial.get("layout")), "initial layout");
        require(Boolean.TRUE.equals(initial.get("available")), "native router must be available");
        require(Boolean.TRUE.equals(initial.get("actual")), "native router must be actual");
        require(SimpleJson.asList(initial.get("channelOrder")).equals(
            List.of("FL", "FR", "FC", "LFE", "SL", "SR")), "5.1 order");

        List<Object> gains = new ArrayList<>(SimpleJson.asList(initial.get("channelGainDb")));
        gains.set(4, -3.5);
        List<Object> delays = new ArrayList<>(SimpleJson.asList(initial.get("channelDelayMs")));
        delays.set(5, 8.25);
        List<Object> azimuths = new ArrayList<>(SimpleJson.asList(initial.get("channelAzimuthDeg")));
        azimuths.set(4, 118.0);
        Map<String, Object> fivePatch = new LinkedHashMap<>();
        fivePatch.put("algorithm", "ambient-extract");
        fivePatch.put("lfeCrossoverHz", 95.0);
        fivePatch.put("channelGainDb", gains);
        fivePatch.put("channelDelayMs", delays);
        fivePatch.put("channelAzimuthDeg", azimuths);
        Map<String, Object> five = service.patchChannels(initial.get("revision"), fivePatch);
        require(((Number) five.get("revision")).longValue() == 1L, "5.1 revision");
        require("ambient-extract".equals(five.get("algorithm")), "5.1 algorithm");
        require(Math.abs(((Number) SimpleJson.asList(five.get("channelGainDb")).get(4)).doubleValue() + 3.5) < 1e-9,
            "5.1 gain persisted");

        Map<String, Object> seven = service.patchChannels(five.get("revision"), Map.of(
            "layout", "7.1",
            "algorithm", "matrix-decode"
        ));
        require(SimpleJson.asList(seven.get("channelOrder")).equals(
            List.of("FL", "FR", "FC", "LFE", "BL", "BR", "SL", "SR")), "7.1 order");
        List<Object> sevenGains = new ArrayList<>(SimpleJson.asList(seven.get("channelGainDb")));
        sevenGains.set(4, -7.0);
        Map<String, Object> sevenEdited = service.patchChannels(seven.get("revision"), Map.of(
            "channelGainDb", sevenGains
        ));
        Map<String, Object> backToFive = service.patchChannels(sevenEdited.get("revision"), Map.of(
            "layout", "5.1"
        ));
        require(Math.abs(((Number) SimpleJson.asList(backToFive.get("channelGainDb")).get(4)).doubleValue() + 3.5) < 1e-9,
            "5.1 and 7.1 controls must be independent");

        ConnectedNative restoredNative = new ConnectedNative();
        AudioMixerService restored = new AudioMixerService(mixerState, restoredNative);
        Map<String, Object> restoredState = restored.channelSnapshot();
        require("5.1".equals(restoredState.get("layout")), "selected layout restored");
        require("ambient-extract".equals(restoredState.get("algorithm")), "algorithm restored");
        require(Math.abs(((Number) SimpleJson.asList(restoredState.get("channelDelayMs")).get(5)).doubleValue() - 8.25) < 1e-9,
            "delay restored");

        boolean conflict = false;
        try {
            restored.patchChannels(0L, Map.of("lfeCrossoverHz", 80.0));
        } catch (AudioMixerService.RevisionConflictException expected) {
            conflict = true;
        }
        require(conflict, "stale channel mutation must conflict");

        Map<String, Object> test = restored.playChannelTestSignal(Map.of(
            "layout", "5.1",
            "channel", "SL",
            "kind", "tone",
            "durationMs", 500,
            "frequencyHz", 997.0,
            "gainDb", -18.0
        ));
        require(Boolean.TRUE.equals(test.get("ok")) && Boolean.TRUE.equals(test.get("accepted")),
            "bounded channel test signal must reach native");
        require(restoredNative.testCalls == 1, "test signal submitted exactly once");
        require(restoredNative.lastValues.length == 41, "channel JNI value vector must remain 41 floats");

        require(Files.isRegularFile(root.resolve("audio-channel-router-state.json")),
            "channel controls require independent durable state");
        String persisted = Files.readString(root.resolve("audio-channel-router-state.json"));
        require(!persisted.contains("NaN") && persisted.length() < 64 * 1024,
            "persisted router state must be finite and bounded");
        System.out.println("AudioChannelRouterIntegrationProbe passed");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }

    private static final class ConnectedNative implements AudioMixerService.NativeBridge {
        int testCalls;
        float[] lastValues = new float[0];

        @Override
        public Map<String, Object> submit(long revision, int flags, float[] values) {
            return status();
        }

        @Override
        public Map<String, Object> submitCombined(
            long mixerRevision,
            int flags,
            float[] mixerValues,
            long channelRevision,
            int outputChannels,
            int algorithm,
            float[] channelValues
        ) {
            return Map.of(
                "mixer", submit(mixerRevision, flags, mixerValues),
                "channels", submitChannels(
                    channelRevision,
                    outputChannels,
                    algorithm,
                    channelValues
                )
            );
        }

        @Override
        public Map<String, Object> status() {
            return Map.of(
                "nativeBackendAvailable", true,
                "nativeChainActive", true,
                "mixerAvailable", true,
                "mixerActive", true
            );
        }

        @Override
        public Map<String, Object> submitChannels(
            long revision,
            int outputChannels,
            int algorithm,
            float[] values
        ) {
            lastValues = values.clone();
            List<Double> peak = List.of(0.40, 0.38, 0.30, 0.12, 0.24, 0.23, 0.18, 0.17);
            List<Double> rms = List.of(0.20, 0.19, 0.15, 0.06, 0.12, 0.11, 0.09, 0.08);
            List<Double> azimuth = List.of(30.0, -30.0, 0.0, 0.0, 135.0, -135.0, 90.0, -90.0);
            return Map.ofEntries(
                Map.entry("available", true),
                Map.entry("active", true),
                Map.entry("actual", true),
                Map.entry("outputChannels", outputChannels),
                Map.entry("algorithm", algorithm),
                Map.entry("lastResult", 0),
                Map.entry("activeRevision", revision),
                Map.entry("stagedRevision", revision),
                Map.entry("processCalls", 12L),
                Map.entry("channelPeak", peak),
                Map.entry("channelRms", rms),
                Map.entry("channelAzimuthDeg", azimuth),
                Map.entry("physicalMultichannel", false)
            );
        }

        @Override
        public Map<String, Object> channelStatus() {
            return submitChannels(0, 6, 1, new float[41]);
        }

        @Override
        public boolean playChannelTestSignal(
            int outputChannels,
            int channelIndex,
            int kind,
            int durationMs,
            float frequencyHz,
            float gainDb
        ) {
            testCalls += 1;
            return true;
        }
    }
}
