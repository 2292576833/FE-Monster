package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * RED contract for user-owned upmix and Google OBR controls.
 *
 * <p>The contract is deliberately additive: the original mixer parameter names and
 * eight preset identities remain valid, while a v1 state file that predates the
 * spatial controls is migrated in memory with safe defaults.</p>
 */
public final class AudioSpatialControlsContractProbe {
    private static final Set<String> ORIGINAL_PARAMETER_KEYS = Set.of(
        "enabled",
        "inputGainDb",
        "outputGainDb",
        "balance",
        "eqDb",
        "stereoWidth",
        "centerGain",
        "surroundGain",
        "lfeGain",
        "compressorEnabled",
        "compressorThresholdDb",
        "compressorRatio",
        "compressorAttackMs",
        "compressorReleaseMs",
        "compressorKneeDb",
        "compressorMakeupDb",
        "limiterEnabled",
        "limiterCeilingDb",
        "limiterReleaseMs",
        "reverbEnabled",
        "reverbRoomSize",
        "reverbDecayMs",
        "reverbDamping",
        "reverbPreDelayMs",
        "reverbWet",
        "reverbDry"
    );

    private static final Set<String> SPATIAL_PARAMETER_KEYS = Set.of(
        "upmixEnabled",
        "upmixAlgorithm",
        "upmixOutputLayout",
        "upmixCenterWidthHz",
        "upmixLfeCrossoverHz",
        "upmixCenterGain",
        "upmixSurroundGain",
        "upmixLfeGain",
        "upmixDecorrelation",
        "obrEnabled",
        "obrFilterProfile",
        "obrWet",
        "obrDry",
        "obrOutputGainDb",
        "obrSpatialWidth"
    );

    private static final Set<String> ALL_PARAMETER_KEYS;

    static {
        LinkedHashSet<String> keys = new LinkedHashSet<>(ORIGINAL_PARAMETER_KEYS);
        keys.addAll(SPATIAL_PARAMETER_KEYS);
        ALL_PARAMETER_KEYS = Set.copyOf(keys);
    }

    private AudioSpatialControlsContractProbe() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("probe data directory is required");
        Path root = Path.of(args[0]).toAbsolutePath().normalize();
        Files.createDirectories(root);

        defaultsAndEightPresetsRemainStable(root.resolve("defaults"));
        patchMapsEveryControlToTheNativeBoundary(root.resolve("mapping"));
        extendedStatePersistsAndConflictsRemainRevisionSafe(root.resolve("persistence"));
        legacyV1StateMigratesWithoutDataLoss(root.resolve("legacy"));
        enumAndNumericBoundariesRejectInvalidInput(root.resolve("validation"));
        fourIndependentModuleStatesKeepTheMixerActive(root.resolve("bypass"));

        System.out.println("AudioSpatialControlsContractProbe passed");
    }

    private static void defaultsAndEightPresetsRemainStable(Path directory) throws Exception {
        Files.createDirectories(directory);
        FakeNative bridge = new FakeNative();
        AudioMixerService service = new AudioMixerService(directory.resolve("mixer.json"), bridge);

        Map<String, Object> clean = parameters(service.snapshot());
        require(Boolean.FALSE.equals(service.snapshot().get("spatialMigrationNeeded")),
            "a new missing-state install must not impersonate a legacy migration");
        require(clean.keySet().equals(ALL_PARAMETER_KEYS),
            "the additive spatial parameters are missing from the complete snapshot");
        require(Boolean.FALSE.equals(clean.get("upmixEnabled")),
            "a new mixer state must not force-enable the user's spatial chain");
        require("matrix-decode".equals(clean.get("upmixAlgorithm")),
            "the default must match the current OxiMedia MatrixDecode path");
        require("5.1".equals(clean.get("upmixOutputLayout")),
            "the default must preserve the current native 5.1 startup layout");
        require(equalNumber(clean.get("upmixCenterWidthHz"), 300.0),
            "the current 300 Hz center width default changed");
        require(equalNumber(clean.get("upmixLfeCrossoverHz"), 120.0),
            "the current 120 Hz LFE crossover default changed");
        require(equalNumber(clean.get("upmixCenterGain"), 0.707),
            "the current upmix center gain default changed");
        require(equalNumber(clean.get("upmixSurroundGain"), 0.5),
            "the current upmix surround gain default changed");
        require(equalNumber(clean.get("upmixLfeGain"), 0.707),
            "the current upmix LFE gain default changed");
        require(equalNumber(clean.get("upmixDecorrelation"), 0.7),
            "the current decorrelation default changed");
        require(Boolean.FALSE.equals(clean.get("obrEnabled")),
            "a new mixer state must not force-enable the user's OBR preference");
        require("direct".equals(clean.get("obrFilterProfile")),
            "the fidelity default must use the official OBR direct filter profile");
        require(equalNumber(clean.get("obrWet"), 1.0), "OBR wet default must preserve the current path");
        require(equalNumber(clean.get("obrDry"), 0.0), "OBR dry default must preserve the current path");
        require(equalNumber(clean.get("obrOutputGainDb"), 0.0),
            "OBR output gain must be neutral by default");
        require(equalNumber(clean.get("obrSpatialWidth"), 1.0),
            "OBR position spread must be neutral by default");

        Map<String, Object> presetPayload = service.presets();
        List<Object> presets = SimpleJson.asList(presetPayload.get("presets"));
        require(presets.size() == 8, "the existing eight effect presets must remain");
        List<String> ids = new ArrayList<>();
        Map<String, Object> surround = Map.of();
        for (Object value : presets) {
            Map<String, Object> preset = SimpleJson.asMap(value);
            String id = SimpleJson.asString(preset.get("id"), "");
            ids.add(id);
            Map<String, Object> presetParameters = parameters(preset);
            require(presetParameters.keySet().equals(ALL_PARAMETER_KEYS),
                "preset is not a complete additive snapshot: " + id);
            if ("surround-3d".equals(id)) surround = presetParameters;
        }
        require(ids.equals(List.of(
            "clean", "bathroom", "hall", "surround-3d",
            "cinema", "vocal-clear", "bass-boost", "night"
        )), "preset identities or order changed");
        require(Boolean.TRUE.equals(surround.get("upmixEnabled")),
            "3D surround must use the real upmixer");
        require("matrix-decode".equals(surround.get("upmixAlgorithm")),
            "3D surround must stay on the verified OxiMedia MatrixDecode path");
        require("7.1".equals(surround.get("upmixOutputLayout")),
            "3D surround must request a real 7.1 virtual bed");
        require(Boolean.TRUE.equals(surround.get("obrEnabled")),
            "3D surround must use the official binaural renderer");
        require(number(surround.get("stereoWidth")) >= 1.1
                && number(surround.get("stereoWidth")) <= 1.3,
            "3D surround stereo width must preserve center image and headroom");
        require(equalNumber(surround.get("inputGainDb"), -6.0),
            "3D surround needs 6 dB input headroom before multichannel summing");
        require(number(surround.get("upmixCenterGain")) >= 0.65
                && number(surround.get("upmixCenterGain")) <= 0.707,
            "3D surround center gain exceeds the verified fidelity window");
        require(number(surround.get("upmixSurroundGain")) >= 0.45
                && number(surround.get("upmixSurroundGain")) <= 0.60,
            "3D surround surround gain exceeds the verified fidelity window");
        require(number(surround.get("upmixLfeGain")) >= 0.35
                && number(surround.get("upmixLfeGain")) <= 0.60,
            "3D surround LFE gain exceeds the verified fidelity window");
        require(number(surround.get("obrSpatialWidth")) >= 1.25,
            "3D surround needs a wider object-position spread than the clean preset");
    }

    private static void patchMapsEveryControlToTheNativeBoundary(Path directory) throws Exception {
        Files.createDirectories(directory);
        FakeNative bridge = new FakeNative();
        AudioMixerService service = new AudioMixerService(directory.resolve("mixer.json"), bridge);
        Map<String, Object> controls = spatialPatch(
            true,
            "ambient-extract",
            "7.1",
            520.0,
            95.0,
            0.82,
            0.74,
            0.61,
            0.88,
            true,
            "reverberant",
            0.76,
            0.24,
            -3.5,
            1.35
        );

        Map<String, Object> snapshot = service.patch(0L, controls);
        require(number(snapshot.get("revision")) == 1.0, "one atomic patch must advance once");
        require(parameters(snapshot).entrySet().containsAll(controls.entrySet()),
            "the accepted spatial controls were not echoed in the complete snapshot");
        require(bridge.lastValues != null && bridge.lastValues.length == 44,
            "the Java/JNI control vector must add 13 values without moving the original 31");
        require((bridge.lastFlags & 0x30) == 0x30,
            "upmix and OBR requested-enable bits were not sent to native");
        require(equalFloat(bridge.lastValues[31], 2.0f), "AmbientExtract enum mapping changed");
        require(equalFloat(bridge.lastValues[32], 8.0f), "7.1 layout mapping changed");
        require(equalFloat(bridge.lastValues[33], 520.0f), "center width mapping changed");
        require(equalFloat(bridge.lastValues[34], 95.0f), "LFE crossover mapping changed");
        require(equalFloat(bridge.lastValues[35], 0.61f), "upmix LFE gain mapping changed");
        require(equalFloat(bridge.lastValues[36], 0.82f), "upmix center gain mapping changed");
        require(equalFloat(bridge.lastValues[37], 0.74f), "upmix surround gain mapping changed");
        require(equalFloat(bridge.lastValues[38], 0.88f), "decorrelation mapping changed");
        require(equalFloat(bridge.lastValues[39], 2.0f), "reverberant profile enum mapping changed");
        require(equalFloat(bridge.lastValues[40], 0.76f), "OBR wet mapping changed");
        require(equalFloat(bridge.lastValues[41], 0.24f), "OBR dry mapping changed");
        require(equalFloat(bridge.lastValues[42], -3.5f), "OBR output gain mapping changed");
        require(equalFloat(bridge.lastValues[43], 1.35f), "OBR spatial width mapping changed");
    }

    private static void extendedStatePersistsAndConflictsRemainRevisionSafe(Path directory)
        throws Exception {
        Files.createDirectories(directory);
        Path stateFile = directory.resolve("mixer.json");
        AudioMixerService writer = new AudioMixerService(stateFile, new FakeNative());
        Map<String, Object> changed = writer.patch(0L, spatialPatch(
            true, "passive", "7.1", 440.0, 80.0, 0.9, 0.8, 0.6, 0.4,
            true, "direct", 0.65, 0.35, -2.0, 1.2
        ));
        require(number(changed.get("revision")) == 1.0, "spatial patch did not advance revision");

        Map<String, Object> persisted = SimpleJson.parseObjectStrict(
            Files.readString(stateFile, StandardCharsets.UTF_8)
        );
        require(parameters(persisted).keySet().equals(ALL_PARAMETER_KEYS),
            "durable state omitted additive spatial controls");
        require("direct".equals(parameters(persisted).get("obrFilterProfile")),
            "durable state lost the OBR profile");

        AudioMixerService restored = new AudioMixerService(stateFile, new FakeNative());
        Map<String, Object> restoredSnapshot = restored.snapshot();
        require(Boolean.FALSE.equals(restoredSnapshot.get("spatialMigrationNeeded")),
            "a complete additive state must not request legacy preference import");
        require(number(restoredSnapshot.get("revision")) == 1.0, "restart lost spatial revision");
        require("7.1".equals(parameters(restoredSnapshot).get("upmixOutputLayout")),
            "restart lost the user-selected upmix layout");
        require(equalNumber(parameters(restoredSnapshot).get("obrSpatialWidth"), 1.2),
            "restart lost OBR spatial width");

        boolean conflicted = false;
        try {
            restored.patch(0L, Map.of("obrWet", 0.5));
        } catch (AudioMixerService.RevisionConflictException conflict) {
            conflicted = conflict.currentRevision() == 1L;
        }
        require(conflicted, "spatial controls bypassed the existing 409 revision contract");
        require(equalNumber(parameters(restored.snapshot()).get("obrWet"), 0.65),
            "a stale writer mutated the OBR configuration");
    }

    private static void legacyV1StateMigratesWithoutDataLoss(Path directory) throws Exception {
        Files.createDirectories(directory);
        Path stateFile = directory.resolve("mixer.json");
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("version", 1);
        root.put("presetVersion", 1);
        root.put("revision", 7);
        root.put("selectedPreset", "custom");
        Map<String, Object> legacy = legacyParameters();
        legacy.put("inputGainDb", -2.5);
        legacy.put("surroundGain", 1.24);
        root.put("parameters", legacy);
        Files.writeString(stateFile, SimpleJson.stringify(root), StandardCharsets.UTF_8);

        AudioMixerService restored = new AudioMixerService(stateFile, new FakeNative());
        Map<String, Object> snapshot = restored.snapshot();
        require("ready".equals(snapshot.get("configState")),
            "a valid pre-spatial v1 state must not be quarantined as corrupt");
        require(Boolean.TRUE.equals(snapshot.get("spatialMigrationNeeded")),
            "a restored 27-key v1 state must expose the one-time migration signal");
        require(number(snapshot.get("revision")) == 7.0, "legacy revision was reset");
        Map<String, Object> migrated = parameters(snapshot);
        require(migrated.keySet().equals(ALL_PARAMETER_KEYS),
            "legacy parameters were not completed with additive defaults");
        require(equalNumber(migrated.get("inputGainDb"), -2.5),
            "migration changed an existing user mixer preference");
        require(equalNumber(migrated.get("surroundGain"), 1.24),
            "migration changed an existing channel gain");
        require("matrix-decode".equals(migrated.get("upmixAlgorithm")),
            "migration did not apply the current real upmix default");
        require("direct".equals(migrated.get("obrFilterProfile")),
            "migration did not apply the fidelity-safe official OBR profile");
        require(Boolean.FALSE.equals(migrated.get("upmixEnabled"))
                && Boolean.FALSE.equals(migrated.get("obrEnabled")),
            "migration force-enabled a spatial chain whose old preference is unknown");

        Map<String, Object> retry = restored.patch(7L, Map.of());
        require(number(retry.get("revision")) == 7.0
                && Boolean.TRUE.equals(retry.get("spatialMigrationNeeded")),
            "an empty native retry must not pretend that legacy state was persisted");
        Map<String, Object> upgraded = restored.patch(7L, Map.of(
            "upmixEnabled", false,
            "obrEnabled", false
        ));
        require(number(upgraded.get("revision")) == 8.0,
            "an explicit same-value migration PATCH must create a durable revision receipt");
        require(Boolean.FALSE.equals(upgraded.get("spatialMigrationNeeded")),
            "the first durable additive PATCH did not clear the migration signal");
        Map<String, Object> persisted = SimpleJson.parseObjectStrict(
            Files.readString(stateFile, StandardCharsets.UTF_8)
        );
        require(parameters(persisted).keySet().equals(ALL_PARAMETER_KEYS),
            "the first post-migration edit did not durably upgrade the complete state");
        require(number(persisted.get("revision")) == 8.0,
            "same-value migration did not persist its new revision");
    }

    private static void enumAndNumericBoundariesRejectInvalidInput(Path directory) throws Exception {
        Files.createDirectories(directory);
        AudioMixerService service = new AudioMixerService(
            directory.resolve("mixer.json"),
            new FakeNative()
        );
        long revision = 0;
        revision = accepted(service, revision, Map.of("upmixCenterWidthHz", 20.0));
        revision = accepted(service, revision, Map.of("upmixCenterWidthHz", 20_000.0));
        revision = accepted(service, revision, Map.of("upmixLfeCrossoverHz", 20.0));
        revision = accepted(service, revision, Map.of("upmixLfeCrossoverHz", 500.0));
        revision = accepted(service, revision, Map.of("upmixDecorrelation", 0.0));
        revision = accepted(service, revision, Map.of("upmixDecorrelation", 1.0));
        revision = accepted(service, revision, Map.of("obrOutputGainDb", -12.0));
        revision = accepted(service, revision, Map.of("obrOutputGainDb", 0.0));
        revision = accepted(service, revision, Map.of("obrSpatialWidth", 0.0));
        revision = accepted(service, revision, Map.of("obrSpatialWidth", 2.0));
        revision = accepted(service, revision, Map.of("upmixAlgorithm", "passive"));
        revision = accepted(service, revision, Map.of("upmixAlgorithm", "matrix-decode"));
        revision = accepted(service, revision, Map.of("upmixAlgorithm", "ambient-extract"));
        revision = accepted(service, revision, Map.of("upmixOutputLayout", "7.1"));
        revision = accepted(service, revision, Map.of("upmixOutputLayout", "5.1"));
        revision = accepted(service, revision, Map.of("obrFilterProfile", "direct"));
        revision = accepted(service, revision, Map.of("obrFilterProfile", "reverberant"));
        revision = accepted(service, revision, Map.of("obrFilterProfile", "ambient"));

        rejected(service, revision, Map.of("upmixEnabled", 1));
        rejected(service, revision, Map.of("obrEnabled", "true"));
        rejected(service, revision, Map.of("upmixAlgorithm", "wide"));
        rejected(service, revision, Map.of("upmixOutputLayout", "stereo"));
        rejected(service, revision, Map.of("obrFilterProfile", "room-0.7"));
        rejected(service, revision, Map.of("upmixCenterWidthHz", 19.99));
        rejected(service, revision, Map.of("upmixLfeCrossoverHz", 500.01));
        rejected(service, revision, Map.of("upmixCenterGain", 2.01));
        rejected(service, revision, Map.of("upmixSurroundGain", -0.01));
        rejected(service, revision, Map.of("upmixLfeGain", Double.NaN));
        rejected(service, revision, Map.of("upmixDecorrelation", Double.POSITIVE_INFINITY));
        rejected(service, revision, Map.of("obrWet", 1.01));
        rejected(service, revision, Map.of("obrDry", -0.01));
        rejected(service, revision, Map.of("obrOutputGainDb", -12.01));
        rejected(service, revision, Map.of("obrOutputGainDb", 0.01));
        rejected(service, revision, Map.of("obrSpatialWidth", 2.01));
    }

    private static void fourIndependentModuleStatesKeepTheMixerActive(Path directory) throws Exception {
        Files.createDirectories(directory);
        FakeNative bridge = new FakeNative();
        AudioMixerService service = new AudioMixerService(directory.resolve("mixer.json"), bridge);

        Map<String, Object> offOff = service.patch(0L, Map.of(
            "upmixEnabled", false,
            "obrEnabled", false,
            // Keep the service's established same-value no-op semantics while
            // obtaining a committed receipt for the first route in the matrix.
            "obrOutputGainDb", -0.1
        ));
        assertRoute(
            offOff,
            false,
            false,
            "stereo-mixer-out",
            "off/off must be stereo -> mixer -> fidelity output"
        );
        require((bridge.lastFlags & 0x30) == 0, "off/off enable bits were not cleared");

        Map<String, Object> onOff = service.patch(1L, Map.of("upmixEnabled", true));
        assertRoute(
            onOff,
            true,
            false,
            "upmix-mixer-non-obr-out",
            "on/off must be upmix -> mixer -> non-OBR output"
        );
        require((bridge.lastFlags & 0x30) == 0x10, "on/off enable bits are ambiguous");

        Map<String, Object> offOn = service.patch(2L, Map.of(
            "upmixEnabled", false,
            "obrEnabled", true
        ));
        assertRoute(
            offOn,
            false,
            true,
            "stereo-mixer-obr",
            "off/on must be stereo -> mixer -> OBR"
        );
        require((bridge.lastFlags & 0x30) == 0x20, "off/on enable bits are ambiguous");

        Map<String, Object> onOn = service.patch(3L, Map.of("upmixEnabled", true));
        assertRoute(
            onOn,
            true,
            true,
            "upmix-mixer-x3d-obr",
            "on/on must be upmix -> mixer -> X3D metadata -> OBR"
        );
        require((bridge.lastFlags & 0x30) == 0x30, "on/on enable bits are ambiguous");

        require(number(onOn.get("revision")) == 4.0,
            "four-state switching must retain the shared mixer revision contract");
        AudioMixerService restored = new AudioMixerService(
            directory.resolve("mixer.json"),
            new FakeNative()
        );
        require(Boolean.TRUE.equals(parameters(restored.snapshot()).get("upmixEnabled"))
                && Boolean.TRUE.equals(parameters(restored.snapshot()).get("obrEnabled")),
            "the independently selected module state was not restored after restart");
    }

    private static void assertRoute(
        Map<String, Object> snapshot,
        boolean expectedUpmix,
        boolean expectedObr,
        String expectedRoute,
        String message
    ) {
        require(Boolean.TRUE.equals(snapshot.get("nativeChainActive")),
            message + ": native chain was torn down");
        require(Boolean.TRUE.equals(snapshot.get("mixerAvailable"))
                && Boolean.TRUE.equals(snapshot.get("mixerActive")),
            message + ": Mixer stopped processing");
        require("native-mixer".equals(snapshot.get("playbackState")),
            message + ": module bypass was reported as whole-chain failure");
        require(expectedRoute.equals(snapshot.get("spatialRoute")),
            message + ": public route diagnostic is wrong");
        require(number(snapshot.get("processCalls")) > 0,
            message + ": Mixer process counter did not advance");
        require(number(snapshot.get("activeRevision")) == number(snapshot.get("revision")),
            message + ": Mixer did not receive the same active revision");

        Map<String, Object> upmix = SimpleJson.asMap(snapshot.get("upmix"));
        Map<String, Object> obr = SimpleJson.asMap(snapshot.get("obr"));
        require(Boolean.valueOf(expectedUpmix).equals(upmix.get("enabled"))
                && Boolean.valueOf(expectedUpmix).equals(upmix.get("active")),
            message + ": upmix requested/active diagnostics disagree");
        require(Boolean.valueOf(expectedObr).equals(obr.get("enabled"))
                && Boolean.valueOf(expectedObr).equals(obr.get("active")),
            message + ": OBR requested/active diagnostics disagree");
        if (!expectedUpmix) {
            require("disabled".equals(upmix.get("bypassReason")),
                message + ": upmix-off reason is not explicit");
        }
        if (!expectedObr) {
            require("dry-through".equals(obr.get("bypassReason")),
                message + ": OBR-off path does not promise audible non-OBR output");
        }
    }

    private static Map<String, Object> spatialPatch(
        boolean upmixEnabled,
        String algorithm,
        String layout,
        double centerWidthHz,
        double lfeCrossoverHz,
        double upmixCenterGain,
        double upmixSurroundGain,
        double upmixLfeGain,
        double decorrelation,
        boolean obrEnabled,
        String filterProfile,
        double wet,
        double dry,
        double outputGainDb,
        double spatialWidth
    ) {
        Map<String, Object> patch = new LinkedHashMap<>();
        patch.put("upmixEnabled", upmixEnabled);
        patch.put("upmixAlgorithm", algorithm);
        patch.put("upmixOutputLayout", layout);
        patch.put("upmixCenterWidthHz", centerWidthHz);
        patch.put("upmixLfeCrossoverHz", lfeCrossoverHz);
        patch.put("upmixCenterGain", upmixCenterGain);
        patch.put("upmixSurroundGain", upmixSurroundGain);
        patch.put("upmixLfeGain", upmixLfeGain);
        patch.put("upmixDecorrelation", decorrelation);
        patch.put("obrEnabled", obrEnabled);
        patch.put("obrFilterProfile", filterProfile);
        patch.put("obrWet", wet);
        patch.put("obrDry", dry);
        patch.put("obrOutputGainDb", outputGainDb);
        patch.put("obrSpatialWidth", spatialWidth);
        return patch;
    }

    private static Map<String, Object> legacyParameters() {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("enabled", true);
        p.put("inputGainDb", 0.0);
        p.put("outputGainDb", 0.0);
        p.put("balance", 0.0);
        p.put("eqDb", List.of(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0));
        p.put("stereoWidth", 1.0);
        p.put("centerGain", 1.0);
        p.put("surroundGain", 1.0);
        p.put("lfeGain", 1.0);
        p.put("compressorEnabled", false);
        p.put("compressorThresholdDb", -18.0);
        p.put("compressorRatio", 2.0);
        p.put("compressorAttackMs", 10.0);
        p.put("compressorReleaseMs", 150.0);
        p.put("compressorKneeDb", 6.0);
        p.put("compressorMakeupDb", 0.0);
        p.put("limiterEnabled", true);
        p.put("limiterCeilingDb", -0.3);
        p.put("limiterReleaseMs", 100.0);
        p.put("reverbEnabled", false);
        p.put("reverbRoomSize", 0.35);
        p.put("reverbDecayMs", 800.0);
        p.put("reverbDamping", 0.5);
        p.put("reverbPreDelayMs", 12.0);
        p.put("reverbWet", 0.0);
        p.put("reverbDry", 1.0);
        require(p.keySet().equals(ORIGINAL_PARAMETER_KEYS), "legacy fixture drifted");
        return p;
    }

    private static long accepted(
        AudioMixerService service,
        long revision,
        Map<String, Object> patch
    ) throws Exception {
        Map<String, Object> snapshot = service.patch(revision, patch);
        long next = Math.round(number(snapshot.get("revision")));
        require(next == revision || next == revision + 1,
            "accepted control produced an invalid revision");
        return next;
    }

    private static void rejected(
        AudioMixerService service,
        long revision,
        Map<String, Object> patch
    ) throws Exception {
        String before = SimpleJson.stringify(service.snapshot());
        boolean rejected = false;
        try {
            service.patch(revision, patch);
        } catch (IllegalArgumentException expected) {
            rejected = true;
        }
        require(rejected, "invalid spatial control was accepted: " + patch.keySet());
        require(before.equals(SimpleJson.stringify(service.snapshot())),
            "invalid spatial control mutated service or diagnostics");
    }

    private static Map<String, Object> parameters(Map<String, Object> payload) {
        return SimpleJson.asMap(payload.get("parameters"));
    }

    private static double number(Object value) {
        if (!(value instanceof Number number)) throw new IllegalStateException("expected number");
        return number.doubleValue();
    }

    private static boolean equalNumber(Object value, double expected) {
        return Math.abs(number(value) - expected) <= 0.000_001;
    }

    private static boolean equalFloat(float value, float expected) {
        return Math.abs(value - expected) <= 0.000_01f;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }

    private static final class FakeNative implements AudioMixerService.NativeBridge {
        int lastFlags;
        float[] lastValues;
        long lastRevision;

        @Override
        public Map<String, Object> submit(long revision, int flags, float[] values) {
            lastRevision = revision;
            lastFlags = flags;
            lastValues = values == null ? null : values.clone();
            return status(revision);
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
            return status(lastRevision);
        }

        private Map<String, Object> status(long revision) {
            boolean upmixEnabled = (lastFlags & 0x10) != 0;
            boolean obrEnabled = (lastFlags & 0x20) != 0;
            String algorithm = value(31, 1.0f) == 0.0f
                ? "passive"
                : value(31, 1.0f) == 2.0f ? "ambient-extract" : "matrix-decode";
            String layout = value(32, 6.0f) == 8.0f ? "7.1" : "5.1";
            String profile = value(39, 1.0f) == 0.0f
                ? "direct"
                : value(39, 1.0f) == 2.0f ? "reverberant" : "ambient";

            Map<String, Object> upmix = new LinkedHashMap<>();
            upmix.put("available", true);
            upmix.put("enabled", upmixEnabled);
            upmix.put("active", upmixEnabled);
            upmix.put("algorithm", algorithm);
            upmix.put("outputLayout", layout);
            upmix.put("bypassReason", upmixEnabled ? "" : "disabled");
            upmix.put("processCalls", 17L);
            upmix.put("fallbackBlocks", 0L);
            upmix.put("lastResult", 0);

            Map<String, Object> obr = new LinkedHashMap<>();
            obr.put("available", true);
            obr.put("enabled", obrEnabled);
            obr.put("active", obrEnabled);
            obr.put("rendererReady", obrEnabled);
            obr.put("backend", "google-obr");
            obr.put("filterProfile", profile);
            obr.put("wet", value(40, 1.0f));
            obr.put("dry", value(41, 0.0f));
            obr.put("outputGainDb", value(42, 0.0f));
            obr.put("spatialWidth", value(43, 1.0f));
            obr.put("bypassReason", obrEnabled ? "" : "dry-through");
            obr.put("processCalls", 19L);
            obr.put("lastResult", 0);

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("nativeBackendAvailable", true);
            body.put("nativeChainActive", true);
            body.put("mixerAvailable", true);
            body.put("mixerActive", true);
            body.put("mixerEnabled", (lastFlags & 0x01) != 0);
            body.put("mixerFailureDisabled", false);
            body.put("bypassReason", "");
            body.put("lastResult", 0);
            body.put("processCalls", 31L);
            body.put("activeRevision", revision);
            body.put("stagedRevision", revision);
            body.put("upmix", upmix);
            body.put("obr", obr);
            body.put("spatialRoute", route(upmixEnabled, obrEnabled));
            Map<String, Object> order = new LinkedHashMap<>();
            order.put("upmix", upmixEnabled ? 1L : 0L);
            order.put("mixer", upmixEnabled ? 2L : 1L);
            order.put("obr", obrEnabled ? (upmixEnabled ? 4L : 3L) : 0L);
            body.put("order", order);
            return body;
        }

        private static String route(boolean upmixEnabled, boolean obrEnabled) {
            if (upmixEnabled && obrEnabled) return "upmix-mixer-x3d-obr";
            if (upmixEnabled) return "upmix-mixer-non-obr-out";
            if (obrEnabled) return "stereo-mixer-obr";
            return "stereo-mixer-out";
        }

        private float value(int index, float fallback) {
            return lastValues != null && index >= 0 && index < lastValues.length
                ? lastValues[index]
                : fallback;
        }
    }
}
