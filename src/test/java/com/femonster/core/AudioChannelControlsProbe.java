package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

public final class AudioChannelControlsProbe {
    private AudioChannelControlsProbe() {
    }

    public static void main(String[] args) throws Exception {
        Path root = Path.of(args.length > 0 ? args[0] : "tmp/audio-channel-controls-probe")
            .toAbsolutePath()
            .normalize();
        Files.createDirectories(root);
        AudioMixerService service = new AudioMixerService(
            root.resolve("audio-mixer-state.json"),
            new StaticNativeBridge()
        );

        Map<String, Object> schema = service.channelControlSchema();
        List<Object> algorithms = SimpleJson.asList(schema.get("algorithms"));
        require(algorithms.size() == 7, "algorithm catalog must be complete");
        require(Boolean.TRUE.equals(algorithm(algorithms, "front-only").get("selectable"))
                && "available".equals(
                    algorithm(algorithms, "front-only").get("availability")
                ),
            "front-only must be an explicit router pass-through, not legacy Passive FFT");
        require(Boolean.TRUE.equals(algorithm(algorithms, "custom-matrix").get("selectable"))
                && "available".equals(
                    algorithm(algorithms, "custom-matrix").get("availability")
                ),
            "custom matrix must be exposed only after JNI/native routing is connected");
        for (String licensed : List.of("dolby-pro-logic-ii", "dolby-pro-logic-iix", "dts-neural-x")) {
            Map<String, Object> item = algorithm(algorithms, licensed);
            require("license-required".equals(item.get("availability"))
                    && Boolean.FALSE.equals(item.get("selectable")),
                licensed + " must remain a disabled licensed adapter");
        }

        Map<String, Object> layouts = SimpleJson.asMap(schema.get("layouts"));
        require(SimpleJson.asList(layouts.get("5.1")).equals(
                List.of("FL", "FR", "FC", "LFE", "SL", "SR")),
            "5.1 channel order drifted");
        require(SimpleJson.asList(layouts.get("7.1")).equals(
                List.of("FL", "FR", "FC", "LFE", "BL", "BR", "SL", "SR")),
            "7.1 channel order drifted");
        Map<String, Object> perChannel = SimpleJson.asMap(schema.get("perChannel"));
        require(SimpleJson.asList(perChannel.get("gainDb")).equals(List.of(-60.0, 12.0))
                && SimpleJson.asList(perChannel.get("delayMs")).equals(List.of(0.0, 250.0))
                && SimpleJson.asList(perChannel.get("azimuthDeg")).equals(List.of(-180.0, 180.0)),
            "per-channel range schema drifted");
        require(SimpleJson.asList(schema.get("testSignals")).equals(List.of("tone", "impulse"))
                && "memory-pcm".equals(schema.get("testSignalTransport")),
            "test signal catalog must be in-memory PCM only");

        float[] tone = AudioMixerService.generateChannelTestSignal(
            "7.1", "BR", "tone", 128, 48_000, 997.0, -12.0
        );
        require(tone.length == 128 * 8, "7.1 tone sample count is wrong");
        require(channelEnergy(tone, 8, 5) > 0.0, "BR tone has no energy");
        for (int channel : List.of(0, 1, 2, 3, 4, 6, 7)) {
            require(channelEnergy(tone, 8, channel) == 0.0,
                "test tone leaked into channel " + channel);
        }
        float[] impulse = AudioMixerService.generateChannelTestSignal(
            "5.1", "LFE", "impulse", 32, 48_000, 997.0, -18.0
        );
        require(impulse[3] > 0.0 && channelEnergy(impulse, 6, 3) > 0.0,
            "LFE impulse missing");

        Map<String, Object> snapshot = service.snapshot();
        Map<String, Object> router = SimpleJson.asMap(snapshot.get("channelRouter"));
        require(Boolean.FALSE.equals(router.get("actual"))
                && "native-route-not-connected".equals(router.get("availability")),
            "unconnected channel telemetry must be explicit, not fabricated");

        Map<String, Object> passiveSnapshot = service.patch(
            snapshot.get("revision"),
            Map.of("upmixAlgorithm", "passive")
        );
        Map<String, Object> passiveRouter = SimpleJson.asMap(
            passiveSnapshot.get("channelRouter")
        );
        require("passive".equals(SimpleJson.asMap(passiveSnapshot.get("parameters")).get("upmixAlgorithm"))
                && !"front-only".equals(passiveRouter.get("algorithm"))
                && Boolean.FALSE.equals(passiveRouter.get("actual")),
            "legacy Passive FFT must stay outside the explicit router front-only algorithm");
        System.out.println("AudioChannelControlsProbe passed");
    }

    private static Map<String, Object> algorithm(List<Object> catalog, String id) {
        for (Object value : catalog) {
            Map<String, Object> item = SimpleJson.asMap(value);
            if (id.equals(item.get("id"))) return item;
        }
        throw new IllegalStateException("missing algorithm " + id);
    }

    private static double channelEnergy(float[] pcm, int channels, int channel) {
        double energy = 0.0;
        for (int frame = 0; frame < pcm.length / channels; frame += 1) {
            double sample = pcm[frame * channels + channel];
            energy += sample * sample;
        }
        return energy;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }

    private static final class StaticNativeBridge implements AudioMixerService.NativeBridge {
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
                "channels", channelStatus()
            );
        }

        @Override
        public Map<String, Object> status() {
            return Map.of(
                "nativeBackendAvailable", false,
                "nativeChainActive", false,
                "mixerAvailable", false,
                "mixerActive", false
            );
        }
    }
}
