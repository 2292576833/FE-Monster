package com.femonster.core;

import com.femonster.json.SimpleJson;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpContext;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpPrincipal;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

public final class AudioMixerServiceProbe {
    private static final Set<String> PARAMETER_KEYS = Set.of(
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
        "reverbDry",
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
        "obrSpatialWidth",
        "chorusEnabled",
        "chorusRateHz",
        "chorusDepth",
        "chorusCenterDelayMs",
        "chorusFeedback",
        "chorusMix",
        "flangerEnabled",
        "flangerRateHz",
        "flangerDepth",
        "flangerCenterDelayMs",
        "flangerFeedback",
        "flangerMix",
        "phaserEnabled",
        "phaserRateHz",
        "phaserDepth",
        "phaserCenterFrequencyHz",
        "phaserFeedback",
        "phaserMix",
        "delayEnabled",
        "delayMs",
        "delayFeedback",
        "delayPingPong",
        "delayDampingHz",
        "delayMix",
        "earlyReflectionsEnabled",
        "earlyReflectionsRoomSize",
        "earlyReflectionsDiffusion",
        "earlyReflectionsDamping",
        "earlyReflectionsMix"
    );

    private AudioMixerServiceProbe() {
    }

    public static void main(String[] args) throws Exception {
        Path root = Path.of(args.length > 0 ? args[0] : "tmp/audio-mixer-service-probe")
            .toAbsolutePath()
            .normalize();
        Files.createDirectories(root);
        if (args.length > 1 && "--dump-presets".equals(args[1])) {
            AudioMixerService service = new AudioMixerService(
                root.resolve("preset-dump-state.json"),
                new FakeNative(true, true, false)
            );
            System.out.println(SimpleJson.stringify(service.presets()));
            return;
        }
        if (args.length > 1 && "--native-reapply".equals(args[1])) {
            nativeDesiredStateReapplies(root);
            System.out.println("AudioMixerService native reapply passed");
            return;
        }

        missingDefaultsAndPresets(root.resolve("missing"));
        migratesCompleteV1SurroundAtomically(root.resolve("v1-migration"));
        effectAndSpatialSnapshotsAreIndependent(root.resolve("independence"));
        effectPresetsPreserveCustomSpatialState(root.resolve("effect-preset-independence"));
        nativeMixerFlagValidationPrecedesMutation(root.resolve("native-flags"));
        validatesEveryFieldAndRevision(root.resolve("validation"));
        optimisticConflictAcrossWriters(root.resolve("conflict"));
        restartPresetCustomAndNoOp(root.resolve("restart"));
        busyCommitRetriesOnControlThread();
        mixerDesiredPendingUsesCommitState();
        corruptEvidenceIsPreserved(root.resolve("corrupt"));
        oversizedCorruptEvidenceIsMovedExactly(root.resolve("oversized-corrupt"));
        corruptEvidenceFailureStaysFailClosed(root.resolve("corrupt-move-failure"));
        nativeFailurePersistsDesiredState(root.resolve("native-failure"));
        localGuardMatrix();
        System.out.println("AudioMixerServiceProbe passed");
    }

    private static void nativeDesiredStateReapplies(Path directory) throws Exception {
        Files.createDirectories(directory);
        Path stateFile = directory.resolve("audio-mixer-state.json");
        AudioMixerService template = new AudioMixerService(
            stateFile,
            new FakeNative(false, false, false)
        );
        Map<String, Object> revisionZeroParameters = parameters(template.snapshot());
        revisionZeroParameters.put("inputGainDb", 3.0);
        Map<String, Object> revisionZeroState = new LinkedHashMap<>();
        revisionZeroState.put("version", 1);
        revisionZeroState.put("presetVersion", 1);
        revisionZeroState.put("revision", 0);
        revisionZeroState.put("selectedPreset", "custom");
        revisionZeroState.put("parameters", revisionZeroParameters);
        Files.writeString(
            stateFile,
            SimpleJson.stringify(revisionZeroState),
            StandardCharsets.UTF_8
        );

        NativeAudioEngine engine = new NativeAudioEngine(ProjectPaths.detect());
        require(engine.available(), "native mixer reapply probe requires XAudio2");
        Map<String, Object> idleCapabilities = engine.mixerPayload();
        Map<String, Object> idleUpmix = SimpleJson.asMap(idleCapabilities.get("upmix"));
        Map<String, Object> idleObr = SimpleJson.asMap(idleCapabilities.get("obr"));
        require(Boolean.TRUE.equals(idleUpmix.get("available"))
                && !Boolean.TRUE.equals(idleUpmix.get("active")),
            "an installed upmix path must report available-but-idle before PCM starts");
        require(Boolean.TRUE.equals(idleObr.get("available"))
                && !Boolean.TRUE.equals(idleObr.get("rendererReady")),
            "an installed OBR renderer must report available-but-idle before PCM starts");
        AudioMixerService service = new AudioMixerService(
            stateFile,
            engine
        );
        Map<String, Object> restoredZero = service.snapshot();
        require(number(restoredZero, "revision").longValue() == 0
                && "custom".equals(restoredZero.get("selectedPreset")),
            "custom logical revision zero was not restored");

        Map<String, Object> started = engine.startSpatialStream(48000, 2, 6, 2);
        long session = number(started, "session").longValue();
        long generation = number(started, "generation").longValue();
        require(Boolean.TRUE.equals(started.get("ok")) && session > 0 && generation > 0,
            "native reapply pipeline did not start");
        Map<String, Object> pendingZero = service.snapshot();
        require(number(pendingZero, "activeRevision").longValue() == 0,
            "logical revision zero was not preserved while pending");
        require(Boolean.FALSE.equals(pendingZero.get("activeRevisionCommitted"))
                && Boolean.FALSE.equals(pendingZero.get("spatialRevisionCommitted"))
                && Boolean.TRUE.equals(pendingZero.get("transitionPending")),
            "uncommitted logical revision zero was reported as active");
        require(number(pendingZero, "lastResult").longValue() == 0
                && "transition-pending".equals(pendingZero.get("bypassReason")),
            "accepted revision-zero staging was reported as a failure");

        if ("1".equals(System.getenv("FE_MONSTER_AUDIO_PROBE_DELAY_PCM_AFTER_RETRY_BUDGET"))) {
            Thread.sleep(2_600L);
        }

        float[] pcm = new float[4096 * 2];
        for (int frame = 0; frame < 4096; frame += 1) {
            pcm[frame * 2] = (float) Math.sin(frame * 0.07) * 0.05f;
            pcm[frame * 2 + 1] = (float) Math.sin(frame * 0.071 + 0.3) * 0.04f;
        }
        require(engine.submitSpatialPcm(session, generation, pcm) >= 0,
            "native reapply PCM was rejected");
        Map<String, Object> committed = awaitCommittedSnapshot(service, 2_000L);
        require(Boolean.TRUE.equals(committed.get("activeRevisionCommitted"))
                && Boolean.TRUE.equals(committed.get("spatialRevisionCommitted"))
                && Boolean.FALSE.equals(committed.get("transitionPending")),
            "reapplied desired state did not commit atomically: " + SimpleJson.stringify(committed));
        // The zero-crossing can land on the final 256-frame block of the first
        // transport. Send one steady transport so mixerActive proves that the
        // newly committed snapshot, rather than only the fading old snapshot,
        // processed PCM.
        require(engine.submitSpatialPcm(session, generation, pcm) >= 0,
            "steady native reapply PCM was rejected");
        Map<String, Object> processed = service.snapshot();
        require(Boolean.TRUE.equals(processed.get("mixerActive")),
            "reapplied desired state did not reach Mixer processing: " + SimpleJson.stringify(processed));
        require(number(processed, "activeRevision").longValue() == 0,
            "committed native revision did not translate back to logical zero");
        require(number(processed, "processCalls").longValue() >= 1,
            "valid PCM did not reach the Mixer after the atomic transition");

        engine.pauseSpatialStream(session, generation);
        Map<String, Object> desired = service.patch(0L, map("surroundGain", 1.2));
        require(number(desired, "revision").longValue() == 1,
            "native reapply desired revision was not persisted");
        // The transport graph is created for the service-owned desired
        // layout. Passing a different bootstrap bed used to appear to work
        // only because the standalone router replay failure was ignored.
        Map<String, Object> restarted = engine.startSpatialStream(48000, 2, 6, 2);
        require(Boolean.TRUE.equals(restarted.get("ok")),
            "native mixer pipeline restart was rejected: " + SimpleJson.stringify(restarted));
        long nextSession = number(restarted, "session").longValue();
        long nextGeneration = number(restarted, "generation").longValue();
        require(nextSession > session
                && nextGeneration > generation,
            "native mixer pipeline did not restart");
        Map<String, Object> restartPending = service.snapshot();
        require(Boolean.TRUE.equals(restartPending.get("transitionPending"))
                && Boolean.FALSE.equals(restartPending.get("spatialRevisionCommitted")),
            "restart exposed the desired revision before the new route committed");
        require(engine.submitSpatialPcm(nextSession, nextGeneration, pcm) >= 0,
            "restart PCM was rejected");
        Map<String, Object> restartCommitted = awaitCommittedSnapshot(service, 2_000L);
        require(number(restartCommitted, "activeRevision").longValue() == 1
                && Boolean.TRUE.equals(restartCommitted.get("spatialRevisionCommitted"))
                && Boolean.FALSE.equals(restartCommitted.get("transitionPending")),
            "restart did not atomically reapply the cached desired revision");
        engine.stopSpatialStream(nextSession, nextGeneration);
        engine.close();
    }

    private static Map<String, Object> awaitCommittedSnapshot(
        AudioMixerService service,
        long timeoutMillis
    ) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMillis);
        Map<String, Object> snapshot = service.snapshot();
        while (System.nanoTime() < deadline
            && (!Boolean.TRUE.equals(snapshot.get("activeRevisionCommitted"))
                || !Boolean.TRUE.equals(snapshot.get("spatialRevisionCommitted"))
                || Boolean.TRUE.equals(snapshot.get("transitionPending")))) {
            Thread.sleep(20L);
            snapshot = service.snapshot();
        }
        return snapshot;
    }

    private static void missingDefaultsAndPresets(Path directory) throws Exception {
        Files.createDirectories(directory);
        Path stateFile = directory.resolve("audio-mixer-state.json");
        FakeNative bridge = new FakeNative(false, false, false);
        AudioMixerService service = new AudioMixerService(stateFile, bridge);
        Map<String, Object> snapshot = service.snapshot();
        require(number(snapshot, "revision").longValue() == 0, "missing state revision must be zero");
        require("clean".equals(snapshot.get("selectedPreset")), "missing state must select clean");
        require("missing".equals(snapshot.get("configState")), "missing configState is required");
        require("browser-compatible".equals(snapshot.get("playbackState")),
            "unavailable native backend must report browser-compatible playback");
        require(!Files.exists(stateFile), "read-only missing snapshot must not write state");
        require(bridge.submits == 1 && bridge.lastRevision == 0,
            "missing clean snapshot must still seed the NativeAudioEngine cache");

        Map<String, Object> clean = parameters(snapshot);
        require(clean.keySet().equals(PARAMETER_KEYS), "clean snapshot is not complete");
        require(Boolean.TRUE.equals(clean.get("enabled")), "clean mixer must be enabled");
        require(Boolean.FALSE.equals(clean.get("compressorEnabled")), "clean compressor must be off");
        require(Boolean.TRUE.equals(clean.get("limiterEnabled")), "clean limiter must be on");
        require(Boolean.FALSE.equals(clean.get("reverbEnabled")), "clean reverb must be off");
        require(number(clean, "stereoWidth").doubleValue() == 1.0, "clean width must be 1");
        require(number(clean, "limiterCeilingDb").doubleValue() == -0.3, "clean limiter ceiling mismatch");
        require(SimpleJson.asList(clean.get("eqDb")).size() == 10, "clean EQ must have ten bands");

        Map<String, Object> presetPayload = service.presets();
        require(number(presetPayload, "presetVersion").longValue() == 1, "preset version mismatch");
        List<Object> presets = SimpleJson.asList(presetPayload.get("presets"));
        require(presets.size() == 15, "all fifteen presets must be present");
        List<String> ids = new ArrayList<>();
        List<String> labels = new ArrayList<>();
        Map<String, Map<String, Object>> parametersById = new LinkedHashMap<>();
        for (Object value : presets) {
            Map<String, Object> preset = SimpleJson.asMap(value);
            ids.add(SimpleJson.asString(preset.get("id"), ""));
            labels.add(SimpleJson.asString(preset.get("label"), ""));
            parametersById.put(SimpleJson.asString(preset.get("id"), ""), parameters(preset));
            require(parameters(preset).keySet().equals(PARAMETER_KEYS),
                "preset must be a complete snapshot: " + preset.get("id"));
            require(SimpleJson.asList(parameters(preset).get("eqDb")).size() == 10,
                "preset EQ must have ten bands: " + preset.get("id"));
        }
        require(ids.equals(List.of(
            "clean", "bathroom", "hall", "surround-3d",
            "cinema", "vocal-clear", "bass-boost", "night",
            "wide-chorus", "classic-flanger", "flowing-phaser",
            "ping-pong-delay", "nearfield-studio", "immersive-live", "clear-spatial"
        )), "preset IDs/order changed");
        require(labels.equals(List.of(
            "纯净", "浴室", "大厅", "3D环绕", "影院", "人声清晰", "低频增强", "夜间",
            "宽阔合唱", "经典镶边", "流动移相", "乒乓回声", "近场工作室", "沉浸现场", "清晰空间"
        )), "preset labels changed");
        require(Boolean.TRUE.equals(parametersById.get("wide-chorus").get("chorusEnabled"))
                && number(parametersById.get("wide-chorus"), "chorusMix").doubleValue() == 0.30,
            "wide chorus snapshot mismatch");
        require(Boolean.TRUE.equals(parametersById.get("classic-flanger").get("flangerEnabled"))
                && number(parametersById.get("classic-flanger"), "flangerMix").doubleValue() == 0.32,
            "classic flanger snapshot mismatch");
        require(Boolean.TRUE.equals(parametersById.get("flowing-phaser").get("phaserEnabled"))
                && number(parametersById.get("flowing-phaser"), "phaserMix").doubleValue() == 0.34,
            "flowing phaser snapshot mismatch");
        require(Boolean.TRUE.equals(parametersById.get("ping-pong-delay").get("delayEnabled"))
                && number(parametersById.get("ping-pong-delay"), "delayPingPong").doubleValue() == 0.85,
            "ping-pong delay snapshot mismatch");
        require(Boolean.TRUE.equals(parametersById.get("nearfield-studio").get("earlyReflectionsEnabled"))
                && number(parametersById.get("nearfield-studio"), "earlyReflectionsMix").doubleValue() == 0.16,
            "nearfield studio snapshot mismatch");
        Map<String, Object> live = parametersById.get("immersive-live");
        require(Boolean.TRUE.equals(live.get("earlyReflectionsEnabled"))
                && Boolean.TRUE.equals(live.get("reverbEnabled"))
                && Boolean.TRUE.equals(live.get("upmixEnabled"))
                && Boolean.TRUE.equals(live.get("obrEnabled"))
                && "7.1".equals(live.get("upmixOutputLayout"))
                && "music-detail".equals(live.get("upmixAlgorithm"))
                && number(live, "obrSpatialWidth").doubleValue() == 1.15,
            "immersive live snapshot mismatch");
        Map<String, Object> clearSpatial = parametersById.get("clear-spatial");
        Map<String, Object> expectedSpatial = new LinkedHashMap<>(clean);
        expectedSpatial.put("upmixEnabled", true);
        expectedSpatial.put("obrEnabled", true);
        expectedSpatial.put("obrSpatialWidth", 1.10);
        require(expectedSpatial.equals(clearSpatial),
            "clear spatial must only enable Matrix Decode/Direct and bounded width, with neutral Mixer gains");
        require("clean".equals(service.snapshot().get("selectedPreset")) && !Files.exists(stateFile),
            "listing clear spatial must not select it or write the user's configuration");
        Map<String, Object> applied = service.applyPreset("clear-spatial", 0L);
        require("clear-spatial".equals(applied.get("selectedPreset"))
                && expectedSpatial.equals(parameters(applied)), "clear spatial snapshot was not applied");
        AudioMixerService restored = new AudioMixerService(stateFile, new FakeNative(false, false, false));
        require("clear-spatial".equals(restored.snapshot().get("selectedPreset"))
                && expectedSpatial.equals(parameters(restored.snapshot())), "clear spatial did not round-trip");
    }

    private static void migratesCompleteV1SurroundAtomically(Path directory) throws Exception {
        Files.createDirectories(directory);
        Path stateFile = directory.resolve("audio-mixer-state.json");
        AudioMixerService template = new AudioMixerService(
            directory.resolve("template.json"), new FakeNative(true, true, false)
        );
        Map<String, Object> oldParameters = new LinkedHashMap<>(parameters(template.snapshot()));
        for (String key : List.of(
            "chorusEnabled", "chorusRateHz", "chorusDepth", "chorusCenterDelayMs",
            "chorusFeedback", "chorusMix", "flangerEnabled", "flangerRateHz",
            "flangerDepth", "flangerCenterDelayMs", "flangerFeedback", "flangerMix",
            "phaserEnabled", "phaserRateHz", "phaserDepth", "phaserCenterFrequencyHz",
            "phaserFeedback", "phaserMix", "delayEnabled", "delayMs", "delayFeedback",
            "delayPingPong", "delayDampingHz", "delayMix", "earlyReflectionsEnabled",
            "earlyReflectionsRoomSize", "earlyReflectionsDiffusion",
            "earlyReflectionsDamping", "earlyReflectionsMix"
        )) oldParameters.remove(key);
        oldParameters.put("inputGainDb", -6.0);
        oldParameters.put("stereoWidth", 1.2);
        oldParameters.put("upmixEnabled", true);
        oldParameters.put("upmixAlgorithm", "music-detail");
        oldParameters.put("upmixOutputLayout", "7.1");
        oldParameters.put("upmixCenterGain", 0.68);
        oldParameters.put("upmixSurroundGain", 0.52);
        oldParameters.put("upmixLfeGain", 0.48);
        oldParameters.put("obrEnabled", true);
        oldParameters.put("obrFilterProfile", "direct");
        oldParameters.put("obrSpatialWidth", 1.3);
        require(oldParameters.size() == 41, "v1 fixture parameter count");
        Map<String, Object> oldRoot = new LinkedHashMap<>();
        oldRoot.put("version", 1);
        oldRoot.put("presetVersion", 1);
        oldRoot.put("revision", 7);
        oldRoot.put("selectedPreset", "surround-3d");
        oldRoot.put("parameters", oldParameters);
        byte[] v1Bytes = SimpleJson.stringify(oldRoot).getBytes(StandardCharsets.UTF_8);
        Files.write(stateFile, v1Bytes);

        AudioMixerService service = new AudioMixerService(
            stateFile, new FakeNative(true, true, false)
        );
        Map<String, Object> migrated = service.snapshot();
        Map<String, Object> p = parameters(migrated);
        require(p.size() == 70, "complete v2 parameter count");
        require(Boolean.FALSE.equals(p.get("chorusEnabled")), "chorus disabled default");
        require(number(p, "delayMs").doubleValue() == 320.0, "delay default");
        require(number(p, "earlyReflectionsMix").doubleValue() == 0.0,
            "early reflections disabled mix");
        require("custom".equals(migrated.get("selectedPreset")),
            "retuned built-in snapshot must be preserved as custom");
        require(Files.readString(stateFile).contains("\"earlyReflectionsMix\""),
            "validated migration must be atomically rewritten");
        require(number(p, "inputGainDb").doubleValue() == -6.0
                && number(p, "obrSpatialWidth").doubleValue() == 1.3,
            "v1 migration changed recognized user values");

        Path failureFile = directory.resolve("replacement-failure.json");
        Files.write(failureFile, v1Bytes);
        expectIOException(() -> new AudioMixerService(
            failureFile,
            new FakeNative(true, true, false),
            (source, evidence) -> {
                throw new AssertionError("valid migration invoked corrupt evidence move");
            },
            (temporary, destination) -> {
                throw new IOException("injected atomic replacement failure");
            }
        ), "migration replacement failure was swallowed");
        require(java.util.Arrays.equals(v1Bytes, Files.readAllBytes(failureFile)),
            "migration replacement failure changed the original v1 document");
    }

    private static void effectAndSpatialSnapshotsAreIndependent(Path directory) throws Exception {
        Files.createDirectories(directory);
        FakeNative bridge = new FakeNative(true, true, false);
        AudioMixerService service = new AudioMixerService(
            directory.resolve("audio-mixer-state.json"), bridge
        );
        Map<String, Object> both = new LinkedHashMap<>();
        both.put("upmixEnabled", true);
        both.put("upmixAlgorithm", "music-detail");
        both.put("upmixOutputLayout", "7.1");
        both.put("obrEnabled", true);
        both.put("obrFilterProfile", "reverberant");
        both.put("obrWet", 0.72);
        both.put("obrDry", 0.28);
        both.put("obrSpatialWidth", 1.37);
        both.put("chorusEnabled", true);
        both.put("chorusRateHz", 0.44);
        both.put("delayEnabled", true);
        both.put("delayMix", 0.31);
        service.patch(0L, both);
        Map<String, Object> beforeEffects = service.snapshot();
        float[] bothValues = bridge.lastValues.clone();
        int bothFlags = bridge.lastFlags;
        require(bothValues.length == 68 && (bothFlags & 0x670) == 0x270,
            "both snapshot flags/vector mismatch");
        require(bothValues[31] == 4.0f && bothValues[32] == 8.0f
                && bothValues[39] == 2.0f && bothValues[40] == 0.72f
                && bothValues[41] == 0.28f && bothValues[43] == 1.37f,
            "spatial fields 31..43 were serialized at the wrong indices");
        require(bothValues[44] == 0.44f && bothValues[45] == 0.35f
                && bothValues[59] == 320.0f && bothValues[63] == 0.31f
                && bothValues[67] == 0.0f,
            "effect fields 44..67 were serialized at the wrong indices");

        Map<String, Object> effectOnlyChange = new LinkedHashMap<>();
        effectOnlyChange.put("chorusEnabled", false);
        effectOnlyChange.put("chorusDepth", 0.77);
        effectOnlyChange.put("delayEnabled", false);
        effectOnlyChange.put("delayMs", 640.0);
        service.patch(number(beforeEffects, "revision").longValue(), effectOnlyChange);
        Map<String, Object> afterEffects = service.snapshot();
        assertFieldsEqual(parameters(beforeEffects), parameters(afterEffects), List.of(
            "upmixEnabled", "upmixAlgorithm", "upmixOutputLayout", "upmixCenterWidthHz",
            "upmixLfeCrossoverHz", "upmixCenterGain", "upmixSurroundGain", "upmixLfeGain",
            "upmixDecorrelation", "obrEnabled", "obrFilterProfile", "obrWet", "obrDry",
            "obrOutputGainDb", "obrSpatialWidth"
        ), "effect change mutated spatial fields");
        require(java.util.Arrays.equals(
            java.util.Arrays.copyOfRange(bothValues, 31, 44),
            java.util.Arrays.copyOfRange(bridge.lastValues, 31, 44)
        ), "effect change mutated native indices 31..43");

        Map<String, Object> beforeSpatial = service.snapshot();
        float[] beforeSpatialValues = bridge.lastValues.clone();
        service.patch(number(beforeSpatial, "revision").longValue(), Map.of(
            "obrSpatialWidth", 0.83,
            "upmixCenterGain", 1.21
        ));
        Map<String, Object> afterSpatial = service.snapshot();
        assertFieldsEqual(parameters(beforeSpatial), parameters(afterSpatial), List.of(
            "chorusEnabled", "chorusRateHz", "chorusDepth", "chorusCenterDelayMs",
            "chorusFeedback", "chorusMix", "flangerEnabled", "flangerRateHz",
            "flangerDepth", "flangerCenterDelayMs", "flangerFeedback", "flangerMix",
            "phaserEnabled", "phaserRateHz", "phaserDepth", "phaserCenterFrequencyHz",
            "phaserFeedback", "phaserMix", "delayEnabled", "delayMs", "delayFeedback",
            "delayPingPong", "delayDampingHz", "delayMix", "earlyReflectionsEnabled",
            "earlyReflectionsRoomSize", "earlyReflectionsDiffusion",
            "earlyReflectionsDamping", "earlyReflectionsMix"
        ), "spatial change mutated effect fields");
        require(java.util.Arrays.equals(
            java.util.Arrays.copyOfRange(beforeSpatialValues, 44, 68),
            java.util.Arrays.copyOfRange(bridge.lastValues, 44, 68)
        ), "spatial change mutated native indices 44..67");
        require((bridge.lastFlags & 0x7f0) == 0x30,
            "spatial-only snapshot carried effect flags");

        long revision = number(afterSpatial, "revision").longValue();
        Map<String, Object> effectsOnly = new LinkedHashMap<>();
        effectsOnly.put("upmixEnabled", false);
        effectsOnly.put("obrEnabled", false);
        effectsOnly.put("flangerEnabled", true);
        service.patch(revision, effectsOnly);
        require((bridge.lastFlags & 0x7f0) == 0x80,
            "effects-only snapshot carried spatial flags");
        revision = number(service.snapshot(), "revision").longValue();
        service.patch(revision, Map.of("flangerEnabled", false));
        require((bridge.lastFlags & 0x30) == 0 && (bridge.lastFlags & 0x7c0) == 0,
            "both-off snapshot carried effect or spatial flags");
    }

    private static void nativeMixerFlagValidationPrecedesMutation(Path directory) throws Exception {
        Files.createDirectories(directory);
        NativeAudioEngine engine = new NativeAudioEngine(ProjectPaths.detect());
        float[] values = new float[68];
        for (int bit : List.of(0x40, 0x80, 0x100, 0x200, 0x400)) {
            engine.setMixerParameters(bit, bit, values.clone());
        }
        var flagsField = NativeAudioEngine.class.getDeclaredField("cachedMixerFlags");
        var revisionField = NativeAudioEngine.class.getDeclaredField("cachedMixerRevision");
        var valuesField = NativeAudioEngine.class.getDeclaredField("cachedMixerValues");
        flagsField.setAccessible(true);
        revisionField.setAccessible(true);
        valuesField.setAccessible(true);
        int before = flagsField.getInt(engine);
        long beforeRevision = revisionField.getLong(engine);
        float[] beforeValues = ((float[]) valuesField.get(engine)).clone();
        expectIllegal(() -> engine.setMixerParameters(999L, 0x800, values.clone()),
            "unknown mixer flag was accepted");
        require(flagsField.getInt(engine) == before
                && revisionField.getLong(engine) == beforeRevision
                && java.util.Arrays.equals(beforeValues, (float[]) valuesField.get(engine)),
            "unknown flag mutated NativeAudioEngine cache before rejection");
    }

    private static void effectPresetsPreserveCustomSpatialState(Path directory) throws Exception {
        Files.createDirectories(directory);
        Path stateFile = directory.resolve("audio-mixer-state.json");
        FakeNative bridge = new FakeNative(true, true, false);
        AudioMixerService service = new AudioMixerService(stateFile, bridge);
        Map<String, Object> customSpatial = new LinkedHashMap<>();
        customSpatial.put("upmixEnabled", true);
        customSpatial.put("upmixAlgorithm", "music-detail");
        customSpatial.put("upmixOutputLayout", "7.1");
        customSpatial.put("upmixCenterWidthHz", 840.0);
        customSpatial.put("upmixLfeCrossoverHz", 96.0);
        customSpatial.put("upmixCenterGain", 1.18);
        customSpatial.put("upmixSurroundGain", 0.82);
        customSpatial.put("upmixLfeGain", 0.63);
        customSpatial.put("upmixDecorrelation", 0.44);
        customSpatial.put("obrEnabled", true);
        customSpatial.put("obrFilterProfile", "reverberant");
        customSpatial.put("obrWet", 0.73);
        customSpatial.put("obrDry", 0.27);
        customSpatial.put("obrOutputGainDb", -2.25);
        customSpatial.put("obrSpatialWidth", 1.46);
        service.patch(0L, customSpatial);

        List<String> spatialFields = List.of(
            "upmixEnabled", "upmixAlgorithm", "upmixOutputLayout", "upmixCenterWidthHz",
            "upmixLfeCrossoverHz", "upmixCenterGain", "upmixSurroundGain", "upmixLfeGain",
            "upmixDecorrelation", "obrEnabled", "obrFilterProfile", "obrWet", "obrDry",
            "obrOutputGainDb", "obrSpatialWidth"
        );
        Map<String, Map<String, Object>> expectedEffects = Map.of(
            "wide-chorus", Map.of(
                "chorusEnabled", true, "chorusRateHz", 0.32, "chorusDepth", 0.42,
                "chorusCenterDelayMs", 18.0, "chorusFeedback", 0.08, "chorusMix", 0.30
            ),
            "classic-flanger", Map.of(
                "flangerEnabled", true, "flangerRateHz", 0.18, "flangerDepth", 0.65,
                "flangerCenterDelayMs", 1.6, "flangerFeedback", 0.55, "flangerMix", 0.32
            ),
            "flowing-phaser", Map.of(
                "phaserEnabled", true, "phaserRateHz", 0.22, "phaserDepth", 0.55,
                "phaserCenterFrequencyHz", 900.0, "phaserFeedback", 0.25,
                "phaserMix", 0.34
            ),
            "ping-pong-delay", Map.of(
                "delayEnabled", true, "delayMs", 320.0, "delayFeedback", 0.38,
                "delayPingPong", 0.85, "delayDampingHz", 8000.0, "delayMix", 0.28
            ),
            "nearfield-studio", Map.of(
                "earlyReflectionsEnabled", true, "earlyReflectionsRoomSize", 0.28,
                "earlyReflectionsDiffusion", 0.48, "earlyReflectionsDamping", 0.42,
                "earlyReflectionsMix", 0.16
            )
        );
        Map<String, Integer> expectedBits = Map.of(
            "wide-chorus", 0x40,
            "classic-flanger", 0x80,
            "flowing-phaser", 0x100,
            "ping-pong-delay", 0x200,
            "nearfield-studio", 0x400
        );

        for (String id : List.of(
            "wide-chorus", "classic-flanger", "flowing-phaser",
            "ping-pong-delay", "nearfield-studio"
        )) {
            Map<String, Object> before = service.snapshot();
            Map<String, Object> beforeChannels = service.channelSnapshot();
            float[] beforeValues = bridge.lastValues.clone();
            long revision = number(before, "revision").longValue();

            Map<String, Object> applied = service.applyPreset(id, revision);
            assertFieldsEqual(parameters(before), parameters(applied), spatialFields,
                id + " changed custom spatial fields");
            require((bridge.lastFlags & 0x30) == 0x30,
                id + " cleared native upmix/OBR flags");
            require((bridge.lastFlags & 0x7c0) == expectedBits.get(id),
                id + " serialized the wrong effect enable bits");
            require(java.util.Arrays.equals(
                java.util.Arrays.copyOfRange(beforeValues, 31, 44),
                java.util.Arrays.copyOfRange(bridge.lastValues, 31, 44)
            ), id + " changed native spatial values 31..43");
            for (Map.Entry<String, Object> expected : expectedEffects.get(id).entrySet()) {
                require(java.util.Objects.equals(parameters(applied).get(expected.getKey()), expected.getValue()),
                    id + " did not apply " + expected.getKey());
            }
            Map<String, Object> afterChannels = service.channelSnapshot();
            assertFieldsEqual(beforeChannels, afterChannels, List.of(
                "revision", "layout", "algorithm"
            ), id + " rewrote channel-router state");
            require(id.equals(applied.get("selectedPreset")),
                id + " did not become selected");

            bridge = new FakeNative(true, true, false);
            service = new AudioMixerService(stateFile, bridge);
            Map<String, Object> reloaded = service.snapshot();
            require(id.equals(reloaded.get("selectedPreset")),
                id + " identity was lost after reload");
            assertFieldsEqual(parameters(applied), parameters(reloaded), spatialFields,
                id + " reload changed custom spatial fields");
        }

        Map<String, Object> beforeHolistic = service.snapshot();
        Map<String, Object> immersive = service.applyPreset(
            "immersive-live",
            number(beforeHolistic, "revision").longValue()
        );
        Map<String, Object> immersiveParameters = parameters(immersive);
        require("immersive-live".equals(immersive.get("selectedPreset"))
                && Boolean.TRUE.equals(immersiveParameters.get("upmixEnabled"))
                && "music-detail".equals(immersiveParameters.get("upmixAlgorithm"))
                && "7.1".equals(immersiveParameters.get("upmixOutputLayout"))
                && number(immersiveParameters, "upmixCenterWidthHz").doubleValue() == 300.0
                && Boolean.TRUE.equals(immersiveParameters.get("obrEnabled"))
                && "direct".equals(immersiveParameters.get("obrFilterProfile"))
                && number(immersiveParameters, "obrSpatialWidth").doubleValue() == 1.15,
            "immersive-live stopped applying its holistic spatial snapshot");
    }

    private static void assertFieldsEqual(
        Map<String, Object> before,
        Map<String, Object> after,
        List<String> fields,
        String message
    ) {
        for (String field : fields) {
            require(java.util.Objects.equals(before.get(field), after.get(field)),
                message + ": " + field);
        }
    }

    private static void validatesEveryFieldAndRevision(Path directory) throws Exception {
        Files.createDirectories(directory);
        Path stateFile = directory.resolve("audio-mixer-state.json");
        AudioMixerService service = new AudioMixerService(
            stateFile,
            new FakeNative(true, true, false)
        );
        long revision = 0;
        for (Bounds bounds : List.of(
            new Bounds("inputGainDb", -24.0, 24.0),
            new Bounds("outputGainDb", -24.0, 24.0),
            new Bounds("balance", -1.0, 1.0),
            new Bounds("stereoWidth", 0.0, 2.0),
            new Bounds("centerGain", 0.0, 2.0),
            new Bounds("surroundGain", 0.0, 2.0),
            new Bounds("lfeGain", 0.0, 2.0),
            new Bounds("compressorThresholdDb", -60.0, 0.0),
            new Bounds("compressorRatio", 1.0, 20.0),
            new Bounds("compressorAttackMs", 0.1, 200.0),
            new Bounds("compressorReleaseMs", 10.0, 2000.0),
            new Bounds("compressorKneeDb", 0.0, 24.0),
            new Bounds("compressorMakeupDb", 0.0, 24.0),
            new Bounds("limiterCeilingDb", -12.0, 0.0),
            new Bounds("limiterReleaseMs", 10.0, 1000.0),
            new Bounds("reverbRoomSize", 0.0, 1.0),
            new Bounds("reverbDecayMs", 50.0, 5000.0),
            new Bounds("reverbDamping", 0.0, 1.0),
            new Bounds("reverbPreDelayMs", 0.0, 200.0),
            new Bounds("reverbWet", 0.0, 1.0),
            new Bounds("reverbDry", 0.0, 1.0),
            new Bounds("chorusRateHz", 0.05, 5.0),
            new Bounds("chorusDepth", 0.0, 1.0),
            new Bounds("chorusCenterDelayMs", 4.0, 30.0),
            new Bounds("chorusFeedback", -0.95, 0.95),
            new Bounds("chorusMix", 0.0, 1.0),
            new Bounds("flangerRateHz", 0.02, 5.0),
            new Bounds("flangerDepth", 0.0, 1.0),
            new Bounds("flangerCenterDelayMs", 0.2, 10.0),
            new Bounds("flangerFeedback", -0.95, 0.95),
            new Bounds("flangerMix", 0.0, 1.0),
            new Bounds("phaserRateHz", 0.02, 10.0),
            new Bounds("phaserDepth", 0.0, 1.0),
            new Bounds("phaserCenterFrequencyHz", 100.0, 4000.0),
            new Bounds("phaserFeedback", -0.95, 0.95),
            new Bounds("phaserMix", 0.0, 1.0),
            new Bounds("delayMs", 1.0, 1000.0),
            new Bounds("delayFeedback", 0.0, 0.90),
            new Bounds("delayPingPong", 0.0, 1.0),
            new Bounds("delayDampingHz", 500.0, 20_000.0),
            new Bounds("delayMix", 0.0, 1.0),
            new Bounds("earlyReflectionsRoomSize", 0.0, 1.0),
            new Bounds("earlyReflectionsDiffusion", 0.0, 1.0),
            new Bounds("earlyReflectionsDamping", 0.0, 1.0),
            new Bounds("earlyReflectionsMix", 0.0, 0.5)
        )) {
            revision = accepted(service, revision, map(bounds.field(), bounds.minimum()));
            revision = accepted(service, revision, map(bounds.field(), bounds.maximum()));
            rejectedNoMutation(service, revision, map(
                bounds.field(), Math.nextDown(bounds.minimum())
            ));
            rejectedNoMutation(service, revision, map(
                bounds.field(), Math.nextUp(bounds.maximum())
            ));
        }

        List<Object> minimumEq = new ArrayList<>();
        List<Object> maximumEq = new ArrayList<>();
        for (int index = 0; index < 10; index += 1) {
            minimumEq.add(-12.0);
            maximumEq.add(12.0);
        }
        revision = accepted(service, revision, map("eqDb", minimumEq));
        revision = accepted(service, revision, map("eqDb", maximumEq));
        List<Object> belowEq = new ArrayList<>(minimumEq);
        belowEq.set(4, Math.nextDown(-12.0));
        rejectedNoMutation(service, revision, map("eqDb", belowEq));
        rejectedNoMutation(service, revision, map("eqDb", minimumEq.subList(0, 9)));
        List<Object> longEq = new ArrayList<>(minimumEq);
        longEq.add(0.0);
        rejectedNoMutation(service, revision, map("eqDb", longEq));

        for (String field : List.of(
            "enabled", "compressorEnabled", "limiterEnabled", "reverbEnabled",
            "chorusEnabled", "flangerEnabled", "phaserEnabled", "delayEnabled",
            "earlyReflectionsEnabled"
        )) {
            revision = accepted(service, revision, map(field, false));
            revision = accepted(service, revision, map(field, true));
            rejectedNoMutation(service, revision, map(field, 1));
            rejectedNoMutation(service, revision, map(field, "true"));
        }

        rejectedNoMutation(service, revision, map("inputGainDb", "0"));
        rejectedNoMutation(service, revision, map("inputGainDb", Double.NaN));
        rejectedNoMutation(service, revision, map("inputGainDb", Double.POSITIVE_INFINITY));
        rejectedNoMutation(service, revision, map("unknownParameter", 1.0));
        rejectedNoMutation(service, revision, map("dllPath", "C:\\evil.dll"));
        rejectedNoMutation(service, revision, map("module", "free-form-dsp"));
        rejectedNoMutation(service, revision, map("nativeBuffer", List.of(1, 2, 3)));

        expectIllegal(() -> service.patch("0", Map.of()), "string expectedRevision must fail");
        expectIllegal(() -> service.patch(-1L, Map.of()), "negative expectedRevision must fail");
        expectIllegal(() -> service.patch(0.5, Map.of()), "fractional expectedRevision must fail");
        expectIllegal(() -> service.patch(Double.NaN, Map.of()), "nonfinite expectedRevision must fail");
        require(number(service.snapshot(), "revision").longValue() == revision,
            "invalid expectedRevision changed service state");
        require(Files.isRegularFile(stateFile), "accepted bounds were not persisted");
    }

    private static void optimisticConflictAcrossWriters(Path directory) throws Exception {
        Files.createDirectories(directory);
        Path stateFile = directory.resolve("audio-mixer-state.json");
        AudioMixerService writerA = new AudioMixerService(
            stateFile,
            new FakeNative(true, true, false)
        );
        AudioMixerService writerB = new AudioMixerService(
            stateFile,
            new FakeNative(true, true, false)
        );
        Map<String, Object> first = writerA.patch(0L, map("inputGainDb", 1.0));
        require(number(first, "revision").longValue() == 1, "first writer did not advance revision");
        try {
            writerB.patch(0L, map("outputGainDb", 2.0));
            throw new AssertionError("stale writer was accepted");
        } catch (AudioMixerService.RevisionConflictException conflict) {
            require(conflict.currentRevision() == 1, "conflict did not expose current revision");
        }
        Map<String, Object> persisted = SimpleJson.parseObjectStrict(
            Files.readString(stateFile, StandardCharsets.UTF_8)
        );
        require(SimpleJson.asLong(persisted.get("revision"), -1) == 1,
            "stale writer mutated persisted revision");
        require(number(parameters(persisted), "inputGainDb").doubleValue() == 1.0,
            "stale writer replaced first writer state");
    }

    private static void restartPresetCustomAndNoOp(Path directory) throws Exception {
        Files.createDirectories(directory);
        Path stateFile = directory.resolve("audio-mixer-state.json");
        FakeNative firstBridge = new FakeNative(true, true, false);
        AudioMixerService first = new AudioMixerService(stateFile, firstBridge);

        Map<String, Object> noOp = first.patch(0L, map("inputGainDb", 0.0));
        require(number(noOp, "revision").longValue() == 0, "no-op patch advanced revision");
        require("clean".equals(noOp.get("selectedPreset")), "no-op patch cleared preset");
        require(!Files.exists(stateFile), "no-op patch wrote missing state");

        int submitsBeforeExplicitRetry = firstBridge.submits;
        Map<String, Object> explicitRetry = first.patch(0L, Map.of());
        require(number(explicitRetry, "revision").longValue() == 0,
            "empty patch retry advanced revision");
        require("clean".equals(explicitRetry.get("selectedPreset")),
            "empty patch retry cleared preset");
        require(!Files.exists(stateFile), "empty patch retry wrote missing state");
        require(firstBridge.submits == submitsBeforeExplicitRetry + 1
                && firstBridge.lastRevision == 0,
            "empty patch did not resubmit the current desired revision");

        Map<String, Object> changed = first.patch(0L, map("inputGainDb", 2.0));
        require(number(changed, "revision").longValue() == 1, "manual patch did not advance revision");
        require("custom".equals(changed.get("selectedPreset")), "manual patch must select custom");

        byte[] persistedBeforeRestart = Files.readAllBytes(stateFile);
        FakeNative restoredBridge = new FakeNative(true, true, false);
        AudioMixerService restored = new AudioMixerService(stateFile, restoredBridge);
        Map<String, Object> restoredSnapshot = restored.snapshot();
        require(number(restoredSnapshot, "revision").longValue() == 1, "restart lost revision");
        require(number(parameters(restoredSnapshot), "inputGainDb").doubleValue() == 2.0,
            "restart lost desired parameters");
        require(restoredBridge.submits == 1 && restoredBridge.lastRevision == 1,
            "restored desired state was not seeded for new spatial pipelines");
        require(java.util.Arrays.equals(persistedBeforeRestart, Files.readAllBytes(stateFile)),
            "read-only restart rewrote state");

        Map<String, Object> hall = restored.applyPreset("hall", 1L);
        require(number(hall, "revision").longValue() == 2, "preset apply did not advance revision");
        require("hall".equals(hall.get("selectedPreset")), "hall was not selected");
        require(Boolean.TRUE.equals(parameters(hall).get("reverbEnabled")), "hall snapshot incomplete");
        require(number(parameters(hall), "reverbDecayMs").doubleValue() == 2800.0, "hall decay mismatch");

        Map<String, Object> repeated = restored.applyPreset("hall", 2L);
        require(number(repeated, "revision").longValue() == 2, "same preset no-op advanced revision");
        Map<String, Object> sameValue = restored.patch(2L, map("reverbDecayMs", 2800.0));
        require(number(sameValue, "revision").longValue() == 2, "same-value patch advanced revision");
        require("hall".equals(sameValue.get("selectedPreset")), "same-value patch cleared preset");

        Map<String, Object> custom = restored.patch(2L, map("reverbWet", 0.4));
        require(number(custom, "revision").longValue() == 3, "manual edit after preset did not advance revision");
        require("custom".equals(custom.get("selectedPreset")), "manual edit did not select custom");
        Map<String, Object> persisted = SimpleJson.parseObjectStrict(
            Files.readString(stateFile, StandardCharsets.UTF_8)
        );
        require(new LinkedHashSet<>(persisted.keySet()).equals(Set.of(
            "version", "presetVersion", "revision", "selectedPreset", "parameters"
        )), "persisted root is not strict and complete");
    }

    private static void busyCommitRetriesOnControlThread() throws Exception {
        AtomicInteger retryCalls = new AtomicInteger();
        AtomicInteger lastResult = new AtomicInteger(-5);
        AtomicReference<String> retryThread = new AtomicReference<>("");
        CountDownLatch committed = new CountDownLatch(1);
        long desiredRevision = 41L;
        List<Long> attemptedRevisions = java.util.Collections.synchronizedList(new ArrayList<>());
        try (NativeAudioEngine.MixerBusyRetryController retries =
                 new NativeAudioEngine.MixerBusyRetryController(
                     "audio-mixer-retry-probe",
                     1L,
                     2L,
                     4L
                 )) {
            retries.update(
                -5,
                () -> {
                    retryThread.set(Thread.currentThread().getName());
                    attemptedRevisions.add(desiredRevision);
                    return retryCalls.incrementAndGet() < 2 ? -5 : 0;
                },
                result -> {
                    lastResult.set(result);
                    if (result == 0) committed.countDown();
                }
            );
            require(committed.await(2, TimeUnit.SECONDS),
                "BUSY commit did not retry to completion");
        }
        require(retryCalls.get() == 2, "BUSY commit retry count was not bounded by success");
        require(lastResult.get() == 0, "BUSY commit did not publish the successful retry result");
        require("audio-mixer-retry-probe".equals(retryThread.get()),
            "BUSY commit retry did not run on the dedicated control thread");
        require(attemptedRevisions.equals(List.of(desiredRevision, desiredRevision)),
            "BUSY commit retry did not retain the exact desired revision");
    }

    private static void mixerDesiredPendingUsesCommitState() {
        require(NativeAudioEngine.isMixerDesiredPending(true, false, 0L, 0L),
            "a failed logical revision-zero submit was hidden as active");
        require(NativeAudioEngine.isMixerDesiredPending(true, true, 0L, -1L),
            "an uncommitted native revision sentinel was hidden as logical revision zero");
        require(!NativeAudioEngine.isMixerDesiredPending(true, true, 0L, 0L),
            "a committed logical revision-zero snapshot was reported pending");
        require(NativeAudioEngine.isMixerDesiredPending(true, true, 2L, 1L),
            "a native status revision behind desired was not reported pending");
    }

    private static void corruptEvidenceIsPreserved(Path directory) throws Exception {
        Files.createDirectories(directory);
        Path stateFile = directory.resolve("audio-mixer-state.json");
        byte[] corruptBytes = new byte[] {0x00, (byte) 0xff, '{', 'b', 'a', 'd'};
        Files.write(stateFile, corruptBytes);
        AudioMixerService service = new AudioMixerService(
            stateFile,
            new FakeNative(true, true, false)
        );
        Map<String, Object> snapshot = service.snapshot();
        require("corrupt".equals(snapshot.get("configState")), "corrupt state not reported");
        require(number(snapshot, "revision").longValue() == 0, "corrupt state did not fail closed to revision zero");
        require("clean".equals(snapshot.get("selectedPreset")), "corrupt state did not fail closed to clean");
        require(number(parameters(snapshot), "inputGainDb").doubleValue() == 0.0,
            "corrupt state retained untrusted parameters");

        List<Path> evidence;
        try (var stream = Files.list(directory)) {
            evidence = stream
                .filter(path -> path.getFileName().toString().startsWith(
                    "audio-mixer-state.json.corrupt-"
                ))
                .toList();
        }
        require(evidence.size() == 1, "corrupt state did not create unique evidence");
        require(java.util.Arrays.equals(corruptBytes, Files.readAllBytes(evidence.get(0))),
            "corrupt evidence bytes changed");
        require(!Files.exists(stateFile),
            "corrupt original was copied instead of atomically moved to evidence");

        service.patch(0L, map("outputGainDb", -1.0));
        require(java.util.Arrays.equals(corruptBytes, Files.readAllBytes(evidence.get(0))),
            "successful recovery overwrote corrupt evidence");
        require("ready".equals(service.snapshot().get("configState")),
            "successful recovery did not transition configState to ready");

        Path unsupportedFile = directory.resolve("unsupported.json");
        Files.writeString(unsupportedFile, "{\"version\":2}", StandardCharsets.UTF_8);
        AudioMixerService unsupported = new AudioMixerService(
            unsupportedFile,
            new FakeNative(true, true, false)
        );
        require("corrupt".equals(unsupported.snapshot().get("configState")),
            "unsupported version did not fail closed");
    }

    private static void oversizedCorruptEvidenceIsMovedExactly(Path directory) throws Exception {
        Files.createDirectories(directory);
        Path stateFile = directory.resolve("audio-mixer-state.json");
        byte[] oversized = new byte[256 * 1024 + 17];
        for (int index = 0; index < oversized.length; index += 1) {
            oversized[index] = (byte) (index * 31 + 7);
        }
        Files.write(stateFile, oversized);
        AudioMixerService service = new AudioMixerService(
            stateFile,
            new FakeNative(true, true, false)
        );
        require("corrupt".equals(service.snapshot().get("configState")),
            "oversized state was not rejected as corrupt");
        require(!Files.exists(stateFile),
            "oversized corrupt original was left in place after evidence move");
        List<Path> evidence;
        try (var stream = Files.list(directory)) {
            evidence = stream
                .filter(path -> path.getFileName().toString().startsWith(
                    "audio-mixer-state.json.corrupt-"
                ))
                .toList();
        }
        require(evidence.size() == 1, "oversized corrupt evidence is not unique");
        require(Files.size(evidence.get(0)) == oversized.length,
            "oversized corrupt evidence length changed");
        require(java.util.Arrays.equals(oversized, Files.readAllBytes(evidence.get(0))),
            "oversized corrupt evidence bytes changed");
    }

    private static void corruptEvidenceFailureStaysFailClosed(Path directory) throws Exception {
        Files.createDirectories(directory);
        Path stateFile = directory.resolve("audio-mixer-state.json");
        byte[] corrupt = "{broken".getBytes(StandardCharsets.UTF_8);
        Files.write(stateFile, corrupt);
        AudioMixerService service = new AudioMixerService(
            stateFile,
            new FakeNative(true, true, false),
            (source, evidence) -> {
                throw new IOException("injected evidence move failure");
            }
        );
        require("corrupt".equals(service.snapshot().get("configState")),
            "injected evidence failure did not load fail-closed Clean state");
        require(Files.exists(stateFile)
                && java.util.Arrays.equals(corrupt, Files.readAllBytes(stateFile)),
            "injected evidence failure changed the unreadable original");
        expectIOException(
            () -> service.patch(0L, map("outputGainDb", -1.0)),
            "mutation overwrote corrupt state without exact durable evidence");
        require(java.util.Arrays.equals(corrupt, Files.readAllBytes(stateFile)),
            "failed mutation changed the unpreserved corrupt original");
    }

    private static void nativeFailurePersistsDesiredState(Path directory) throws Exception {
        Files.createDirectories(directory);
        Path stateFile = directory.resolve("audio-mixer-state.json");
        FakeNative failing = new FakeNative(true, true, true);
        AudioMixerService service = new AudioMixerService(stateFile, failing);
        Map<String, Object> result = service.patch(0L, map("surroundGain", 1.2));
        require(number(result, "revision").longValue() == 1, "native failure rolled back desired revision");
        require(number(parameters(result), "surroundGain").doubleValue() == 1.2,
            "native failure rolled back desired parameter");
        require(Files.isRegularFile(stateFile), "native failure prevented persistence");
        Map<String, Object> persisted = SimpleJson.parseObjectStrict(
            Files.readString(stateFile, StandardCharsets.UTF_8)
        );
        require(number(persisted, "revision").longValue() == 1, "native failure did not persist revision first");
        require("native-mixer-bypassed".equals(result.get("playbackState")),
            "native failure did not report bypass");
        require(number(result, "lastResult").longValue() == -77, "native failure result was hidden");

        FakeNative unavailable = new FakeNative(false, false, true);
        AudioMixerService unavailableService = new AudioMixerService(
            directory.resolve("unavailable.json"),
            unavailable
        );
        Map<String, Object> unavailableResult = unavailableService.patch(
            0L,
            map("centerGain", 1.1)
        );
        require("browser-compatible".equals(unavailableResult.get("playbackState")),
            "native unavailable state was overstated");
        require(Boolean.FALSE.equals(unavailableResult.get("nativeBackendAvailable")),
            "native backend availability was overstated");
    }

    private static void localGuardMatrix() throws Exception {
        Method requireGuard = Class.forName("com.femonster.api.LocalPetAssistantGuard")
            .getDeclaredMethod("require", HttpExchange.class);
        requireGuard.setAccessible(true);

        FakeExchange accepted = exchange(
            "127.0.0.1:34127",
            "http://127.0.0.1:34127",
            "same-origin",
            "127.0.0.1"
        );
        invokeGuard(requireGuard, accepted, true);
        require(Boolean.TRUE.equals(accepted.getAttribute("fe.cors.same-origin")),
            "guard did not freeze same-origin CORS");
        invokeGuard(requireGuard, exchange(
            "localhost:34127", "http://localhost:34127", "none", "::1"
        ), true);
        invokeGuard(requireGuard, exchange(
            "127.0.0.1:34127", "http://127.0.0.1:34127", "same-origin", "192.0.2.8"
        ), false);
        invokeGuard(requireGuard, exchange(
            "example.com:34127", "http://example.com:34127", "same-origin", "127.0.0.1"
        ), false);
        invokeGuard(requireGuard, exchange(
            "127.0.0.1:34127", "http://localhost:34127", "same-origin", "127.0.0.1"
        ), false);
        invokeGuard(requireGuard, exchange(
            "127.0.0.1:34127", "http://127.0.0.1:34127", "cross-site", "127.0.0.1"
        ), false);
        invokeGuard(requireGuard, exchange(
            "127.0.0.1:34127", "null", "same-origin", "127.0.0.1"
        ), false);
        invokeGuard(requireGuard, exchange(
            "127.0.0.1:34127", "", "", "127.0.0.1"
        ), false);
    }

    private static FakeExchange exchange(
        String host,
        String origin,
        String fetchSite,
        String remoteHost
    ) throws Exception {
        FakeExchange exchange = new FakeExchange(
            new InetSocketAddress(InetAddress.getByName(remoteHost), 51234),
            new InetSocketAddress(InetAddress.getByName("127.0.0.1"), 34127)
        );
        if (!host.isBlank()) exchange.getRequestHeaders().set("Host", host);
        if (!origin.isBlank()) exchange.getRequestHeaders().set("Origin", origin);
        if (!fetchSite.isBlank()) exchange.getRequestHeaders().set("Sec-Fetch-Site", fetchSite);
        return exchange;
    }

    private static void invokeGuard(Method method, HttpExchange exchange, boolean accepted)
        throws Exception {
        try {
            method.invoke(null, exchange);
            if (!accepted) throw new AssertionError("guard accepted an unsafe request");
        } catch (InvocationTargetException error) {
            if (accepted) throw error;
            require(error.getCause() instanceof SecurityException,
                "guard rejection did not use SecurityException");
        }
    }

    private static long accepted(
        AudioMixerService service,
        long revision,
        Map<String, Object> patch
    ) throws Exception {
        Map<String, Object> result = service.patch(revision, patch);
        long next = number(result, "revision").longValue();
        require(next == revision + 1 || next == revision,
            "accepted patch produced an invalid revision");
        return next;
    }

    private static void rejectedNoMutation(
        AudioMixerService service,
        long revision,
        Map<String, Object> patch
    ) throws Exception {
        Map<String, Object> before = service.snapshot();
        expectIllegal(() -> service.patch(revision, patch), "invalid parameter patch was accepted");
        Map<String, Object> after = service.snapshot();
        require(SimpleJson.stringify(before).equals(SimpleJson.stringify(after)),
            "invalid patch mutated state or native status");
    }

    private static Map<String, Object> parameters(Map<String, Object> payload) {
        return SimpleJson.asMap(payload.get("parameters"));
    }

    private static Number number(Map<String, Object> payload, String field) {
        Object value = payload.get(field);
        if (!(value instanceof Number number)) {
            throw new AssertionError(field + " is not numeric: " + value);
        }
        return number;
    }

    private static Map<String, Object> map(String key, Object value) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put(key, value);
        return result;
    }

    private static void expectIllegal(ThrowingRunnable action, String message) throws Exception {
        try {
            action.run();
        } catch (IllegalArgumentException expected) {
            return;
        }
        throw new AssertionError(message);
    }

    private static void expectIOException(ThrowingRunnable action, String message) throws Exception {
        try {
            action.run();
        } catch (IOException expected) {
            return;
        }
        throw new AssertionError(message);
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private record Bounds(String field, double minimum, double maximum) {
    }

    @FunctionalInterface
    private interface ThrowingRunnable {
        void run() throws Exception;
    }

    private static final class FakeNative implements AudioMixerService.NativeBridge {
        private final boolean backendAvailable;
        private final boolean mixerAvailable;
        private final boolean failSubmits;
        private int submits;
        private long lastRevision;
        private int lastFlags;
        private float[] lastValues = new float[0];
        private int lastResult;

        private FakeNative(boolean backendAvailable, boolean mixerAvailable, boolean failSubmits) {
            this.backendAvailable = backendAvailable;
            this.mixerAvailable = mixerAvailable;
            this.failSubmits = failSubmits;
        }

        @Override
        public Map<String, Object> submit(long revision, int flags, float[] values) {
            submits += 1;
            lastRevision = revision;
            lastFlags = flags;
            lastValues = values.clone();
            lastResult = failSubmits ? -77 : 0;
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
            Map<String, Object> status = new LinkedHashMap<>();
            status.put("nativeBackendAvailable", backendAvailable);
            status.put("nativeChainActive", backendAvailable && mixerAvailable);
            status.put("mixerAvailable", mixerAvailable);
            status.put("mixerActive", mixerAvailable && !failSubmits);
            status.put("mixerEnabled", (lastFlags & 1) != 0 || submits == 0);
            status.put("mixerFailureDisabled", false);
            status.put("bypassReason", !backendAvailable
                ? "native-backend-unavailable"
                : (failSubmits ? "process-failed" : "none"));
            status.put("lastResult", lastResult);
            status.put("processCalls", failSubmits ? 1L : 0L);
            status.put("bypassedBlocks", failSubmits ? 1L : 0L);
            status.put("processFailures", failSubmits ? 1L : 0L);
            status.put("consecutiveFailures", failSubmits ? 1L : 0L);
            status.put("activeRevision", failSubmits ? 0L : lastRevision);
            status.put("stagedRevision", lastRevision);
            status.put("upmix", Map.of(
                "active", false,
                "processCalls", 0L,
                "fallbackBlocks", 0L,
                "lastResult", 0
            ));
            status.put("obr", Map.of("processCalls", 0L, "rendererReady", mixerAvailable));
            status.put("order", Map.of("upmix", 0L, "mixer", 0L, "obr", 0L));
            return status;
        }
    }

    private static final class FakeExchange extends HttpExchange {
        private final Headers requestHeaders = new Headers();
        private final Headers responseHeaders = new Headers();
        private final Map<String, Object> attributes = new LinkedHashMap<>();
        private final InetSocketAddress remote;
        private final InetSocketAddress local;
        private InputStream requestBody = new ByteArrayInputStream(new byte[0]);
        private OutputStream responseBody = new ByteArrayOutputStream();

        private FakeExchange(InetSocketAddress remote, InetSocketAddress local) {
            this.remote = remote;
            this.local = local;
        }

        @Override public Headers getRequestHeaders() { return requestHeaders; }
        @Override public Headers getResponseHeaders() { return responseHeaders; }
        @Override public URI getRequestURI() { return URI.create("/api/audio/mixer"); }
        @Override public String getRequestMethod() { return "GET"; }
        @Override public HttpContext getHttpContext() { return null; }
        @Override public void close() { }
        @Override public InputStream getRequestBody() { return requestBody; }
        @Override public OutputStream getResponseBody() { return responseBody; }
        @Override public void sendResponseHeaders(int responseCode, long responseLength) { }
        @Override public InetSocketAddress getRemoteAddress() { return remote; }
        @Override public int getResponseCode() { return -1; }
        @Override public InetSocketAddress getLocalAddress() { return local; }
        @Override public String getProtocol() { return "HTTP/1.1"; }
        @Override public Object getAttribute(String name) { return attributes.get(name); }
        @Override public void setAttribute(String name, Object value) { attributes.put(name, value); }
        @Override public void setStreams(InputStream input, OutputStream output) {
            requestBody = input;
            responseBody = output;
        }
        @Override public HttpPrincipal getPrincipal() { return null; }
    }
}
