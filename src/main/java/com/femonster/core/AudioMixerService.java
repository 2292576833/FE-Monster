package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.AclEntry;
import java.nio.file.attribute.AclEntryPermission;
import java.nio.file.attribute.AclEntryType;
import java.nio.file.attribute.AclFileAttributeView;
import java.nio.file.attribute.PosixFilePermission;
import java.nio.file.attribute.PosixFilePermissions;
import java.nio.file.attribute.UserPrincipal;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

public final class AudioMixerService {
    static final int STATE_VERSION = 1;
    static final int PRESET_VERSION = 1;
    private static final int MAX_STATE_BYTES = 256 * 1024;
    private static final int MAX_CHANNEL_STATE_BYTES = 64 * 1024;
    private static final int EQ_BANDS = 10;
    private static final Set<String> STATE_KEYS = Set.of(
        "version", "presetVersion", "revision", "selectedPreset", "parameters"
    );
    private static final List<String> LEGACY_PARAMETER_KEYS = List.of(
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
    private static final List<String> PARAMETER_KEYS = List.of(
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
        "obrSpatialWidth"
    );
    private static final Set<String> LEGACY_PARAMETER_KEY_SET = Set.copyOf(LEGACY_PARAMETER_KEYS);
    private static final Set<String> PARAMETER_KEY_SET = Set.copyOf(PARAMETER_KEYS);
    private static final Map<String, Bounds> NUMERIC_BOUNDS = numericBounds();
    private static final Set<String> BOOLEAN_PARAMETERS = Set.of(
        "enabled", "compressorEnabled", "limiterEnabled", "reverbEnabled",
        "upmixEnabled", "obrEnabled"
    );
    private static final Map<String, Set<String>> ENUM_PARAMETERS = Map.of(
        "upmixAlgorithm", Set.of("passive", "matrix-decode", "ambient-extract"),
        "upmixOutputLayout", Set.of("5.1", "7.1"),
        "obrFilterProfile", Set.of("direct", "ambient", "reverberant")
    );
    private static final LinkedHashMap<String, Preset> PRESETS = presetsV1();
    private static final ConcurrentHashMap<Path, Object> STATE_LOCKS = new ConcurrentHashMap<>();

    interface NativeBridge {
        Map<String, Object> submit(long revision, int flags, float[] values);

        Map<String, Object> status();

        Map<String, Object> submitCombined(
            long mixerRevision,
            int flags,
            float[] mixerValues,
            long channelRevision,
            int outputChannels,
            int algorithm,
            float[] channelValues
        );

        default Map<String, Object> submitChannels(
            long revision,
            int outputChannels,
            int algorithm,
            float[] values
        ) {
            return channelStatus();
        }

        default Map<String, Object> channelStatus() {
            return Map.of(
                "available", false,
                "active", false,
                "actual", false,
                "lastResult", -3,
                "availability", "native-route-not-connected"
            );
        }

        default boolean playChannelTestSignal(
            int outputChannels,
            int channelIndex,
            int kind,
            int durationMs,
            float frequencyHz,
            float gainDb
        ) {
            return false;
        }
    }

    @FunctionalInterface
    interface CorruptEvidenceMove {
        void move(Path source, Path evidence) throws IOException;
    }

    private final Path stateFile;
    private final Path channelStateFile;
    private final Path dataDirectory;
    private final NativeBridge nativeBridge;
    private final CorruptEvidenceMove corruptEvidenceMove;
    private final Object stateLock;
    private final Object channelStateLock;
    private MixerState state;
    private ChannelRouterState channelState;
    private String configState;
    private boolean corruptEvidencePreserved = true;
    private boolean channelCorruptEvidencePreserved = true;
    private String channelConfigState = "missing";
    private boolean spatialMigrationNeeded;
    private Map<String, Object> lastNativeStatus = Map.of();
    private Map<String, Object> lastChannelStatus = Map.of();

    public AudioMixerService(Path stateFile, NativeAudioEngine engine) throws IOException {
        this(stateFile, new NativeBridge() {
            @Override
            public Map<String, Object> submit(long revision, int flags, float[] values) {
                return engine.setMixerParameters(revision, flags, values);
            }

            @Override
            public Map<String, Object> status() {
                return engine.mixerPayload();
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
                return engine.setMixerAndChannelParameters(
                    mixerRevision,
                    flags,
                    mixerValues,
                    channelRevision,
                    outputChannels,
                    algorithm,
                    channelValues
                );
            }

            @Override
            public Map<String, Object> submitChannels(
                long revision,
                int outputChannels,
                int algorithm,
                float[] values
            ) {
                return engine.setChannelRouterParameters(
                    revision,
                    outputChannels,
                    algorithm,
                    values
                );
            }

            @Override
            public Map<String, Object> channelStatus() {
                return engine.channelRouterPayload();
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
                return engine.playChannelTestSignal(
                    outputChannels,
                    channelIndex,
                    kind,
                    durationMs,
                    frequencyHz,
                    gainDb
                );
            }
        });
    }

    AudioMixerService(Path stateFile, NativeBridge nativeBridge) throws IOException {
        this(stateFile, nativeBridge, AudioMixerService::atomicMoveCorruptEvidence);
    }

    AudioMixerService(
        Path stateFile,
        NativeBridge nativeBridge,
        CorruptEvidenceMove corruptEvidenceMove
    ) throws IOException {
        if (stateFile == null) throw new IllegalArgumentException("audio mixer state file is required");
        if (nativeBridge == null) throw new IllegalArgumentException("audio mixer native bridge is required");
        if (corruptEvidenceMove == null) {
            throw new IllegalArgumentException("audio mixer corrupt evidence move is required");
        }
        this.stateFile = stateFile.toAbsolutePath().normalize();
        this.dataDirectory = this.stateFile.getParent();
        if (dataDirectory == null) throw new IllegalArgumentException("audio mixer state directory is required");
        this.channelStateFile = dataDirectory.resolve("audio-channel-router-state.json");
        this.nativeBridge = nativeBridge;
        this.corruptEvidenceMove = corruptEvidenceMove;
        this.stateLock = STATE_LOCKS.computeIfAbsent(this.stateFile, ignored -> new Object());
        this.channelStateLock = STATE_LOCKS.computeIfAbsent(this.channelStateFile, ignored -> new Object());
        loadInitialState();
        loadInitialChannelState();
        submitDesiredState();
    }

    public synchronized Map<String, Object> snapshot() {
        return snapshotPayload();
    }

    public synchronized Map<String, Object> presets() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("presetVersion", PRESET_VERSION);
        List<Object> values = new ArrayList<>();
        for (Preset preset : PRESETS.values()) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", preset.id());
            item.put("label", preset.label());
            item.put("parameters", copyParameters(preset.parameters()));
            values.add(item);
        }
        body.put("presets", values);
        return body;
    }

    public synchronized Map<String, Object> channelSnapshot() {
        return channelSnapshotPayload();
    }

    public synchronized Map<String, Object> patchChannels(
        Object expectedRevision,
        Map<String, Object> patch
    ) throws IOException {
        long expected = exactRevision(expectedRevision, "expectedRevision");
        if (patch == null) throw new IllegalArgumentException("channel parameters patch is required");
        Set<String> allowed = Set.of(
            "layout",
            "algorithm",
            "lfeCrossoverHz",
            "channelGainDb",
            "channelDelayMs",
            "channelAzimuthDeg",
            "customMatrix"
        );
        if (!allowed.containsAll(patch.keySet())) {
            throw new IllegalArgumentException("unknown channel router parameter");
        }
        synchronized (channelStateLock) {
            refreshChannelStateFromDisk();
            if ("corrupt".equals(channelConfigState) && !channelCorruptEvidencePreserved) {
                throw new IOException("corrupt audio channel state evidence was not preserved");
            }
            if (expected != channelState.revision()) {
                throw new RevisionConflictException(channelState.revision());
            }
            String requestedLayout = patch.containsKey("layout")
                ? validateChannelLayout(patch.get("layout"))
                : channelState.selectedLayout();
            ChannelLayoutState current = channelState.layouts().get(requestedLayout);
            ChannelLayoutState nextLayout = patchChannelLayout(current, patch);
            Map<String, ChannelLayoutState> layouts = new LinkedHashMap<>(channelState.layouts());
            layouts.put(requestedLayout, nextLayout);
            if (requestedLayout.equals(channelState.selectedLayout())
                && nextLayout.equals(current)) {
                return channelSnapshotPayload();
            }
            if (channelState.revision() == Long.MAX_VALUE) {
                throw new IllegalArgumentException("channel router revision is exhausted");
            }
            ChannelRouterState next = new ChannelRouterState(
                channelState.revision() + 1,
                requestedLayout,
                Map.copyOf(layouts)
            );
            persistChannelState(next);
            channelState = next;
            channelConfigState = "ready";
            channelCorruptEvidencePreserved = true;
            // A channel edit replaces the router portion of the same native
            // control transaction. Re-submit spatial -> latest router ->
            // Mixer together so it cannot cancel a pending BUSY retry or
            // expose a partially updated 5.1/7.1 graph.
            submitDesiredState();
            return channelSnapshotPayload();
        }
    }

    public synchronized Map<String, Object> playChannelTestSignal(Map<String, Object> request) {
        if (request == null) throw new IllegalArgumentException("channel test request is required");
        if (!request.keySet().equals(Set.of(
            "layout", "channel", "kind", "durationMs", "frequencyHz", "gainDb"
        ))) {
            throw new IllegalArgumentException("channel test request contains unknown or missing fields");
        }
        String layout = validateChannelLayout(request.get("layout"));
        List<String> order = channelOrder(layout);
        if (!(request.get("channel") instanceof String channel) || !order.contains(channel)) {
            throw new IllegalArgumentException("unknown channel test target");
        }
        String kindValue = request.get("kind") instanceof String string ? string : "";
        int kind = switch (kindValue) {
            case "tone" -> 0;
            case "impulse" -> 1;
            default -> throw new IllegalArgumentException("unsupported channel test signal");
        };
        int durationMs = exactInt(request.get("durationMs"), "durationMs", 50, 2_000);
        float frequencyHz = (float) exactNumber(
            request.get("frequencyHz"), "frequencyHz", 20.0, 20_000.0
        );
        float gainDb = (float) exactNumber(request.get("gainDb"), "gainDb", -60.0, -6.0);
        boolean accepted = nativeBridge.playChannelTestSignal(
            order.size(),
            order.indexOf(channel),
            kind,
            durationMs,
            frequencyHz,
            gainDb
        );
        Map<String, Object> testStatus = copyMapValue(
            nativeBridge.channelStatus().get("testSignal")
        );
        boolean generated = booleanValue(testStatus.get("generated"), accepted);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", accepted || generated);
        body.put("accepted", accepted);
        body.put("generated", generated);
        body.put("queued", booleanValue(testStatus.get("queued"), accepted));
        body.put("layout", layout);
        body.put("channel", channel);
        body.put("kind", kindValue);
        body.put("durationMs", durationMs);
        body.put("frequencyHz", (double) frequencyHz);
        body.put("gainDb", (double) gainDb);
        body.put("physicalMultichannel", false);
        body.put("output", "virtual-bed-to-binaural-2ch");
        if (!accepted) {
            body.put("notice", generated
                ? "test bed generated, but no safe audible OBR queue is connected"
                : "native channel test route is unavailable");
        }
        return body;
    }

    public synchronized Map<String, Object> patch(
        Object expectedRevision,
        Map<String, Object> patch
    ) throws IOException {
        long expected = exactRevision(expectedRevision, "expectedRevision");
        Map<String, Object> normalizedPatch = validatePatch(patch);
        synchronized (stateLock) {
            refreshFromDiskForMutation();
            requireExpectedRevision(expected);
            if (normalizedPatch.isEmpty()) {
                // An empty PATCH is the explicit retry control: keep the exact
                // desired revision/preset/file and resubmit it to clear a
                // transient BUSY or failure-disabled native bypass.
                submitDesiredState();
                return snapshotPayload();
            }
            Map<String, Object> nextParameters = copyParameters(state.parameters());
            nextParameters.putAll(normalizedPatch);
            boolean valueChanged = !nextParameters.equals(state.parameters());
            if (!valueChanged && !spatialMigrationNeeded) return snapshotPayload();
            if (state.revision() == Long.MAX_VALUE) {
                throw new IllegalArgumentException("audio mixer revision is exhausted");
            }
            MixerState next = new MixerState(
                state.revision() + 1,
                valueChanged ? "custom" : state.selectedPreset(),
                immutableParameters(nextParameters)
            );
            persist(next);
            state = next;
            configState = "ready";
            spatialMigrationNeeded = false;
            // persist(next) is durable before submitDesiredState reaches nativeBridge.submit.
            submitDesiredState();
            return snapshotPayload();
        }
    }

    public synchronized Map<String, Object> applyPreset(
        String id,
        Object expectedRevision
    ) throws IOException {
        long expected = exactRevision(expectedRevision, "expectedRevision");
        String normalizedId = id == null ? "" : id.trim();
        Preset preset = PRESETS.get(normalizedId);
        if (preset == null) throw new IllegalArgumentException("unknown audio mixer preset");
        synchronized (stateLock) {
            refreshFromDiskForMutation();
            requireExpectedRevision(expected);
            if (normalizedId.equals(state.selectedPreset())
                && preset.parameters().equals(state.parameters())) {
                return snapshotPayload();
            }
            if (state.revision() == Long.MAX_VALUE) {
                throw new IllegalArgumentException("audio mixer revision is exhausted");
            }
            MixerState next = new MixerState(
                state.revision() + 1,
                normalizedId,
                preset.parameters()
            );
            persist(next);
            state = next;
            configState = "ready";
            spatialMigrationNeeded = false;
            // persist(next) is durable before submitDesiredState reaches nativeBridge.submit.
            submitDesiredState();
            return snapshotPayload();
        }
    }

    private void loadInitialState() throws IOException {
        synchronized (stateLock) {
            if (!Files.isRegularFile(stateFile)) {
                state = cleanState();
                configState = "missing";
                corruptEvidencePreserved = true;
                spatialMigrationNeeded = false;
                return;
            }
            try {
                byte[] bytes = readBoundedState();
                Map<String, Object> root = SimpleJson.parseObjectStrict(
                    new String(bytes, StandardCharsets.UTF_8)
                );
                state = stateFromRoot(root);
                configState = "ready";
                corruptEvidencePreserved = true;
                spatialMigrationNeeded = hasLegacyParameterShape(root);
                restrictOwnerOnly(stateFile);
            } catch (Exception invalid) {
                corruptEvidencePreserved = preserveCorruptEvidence();
                state = cleanState();
                configState = "corrupt";
                spatialMigrationNeeded = false;
            }
        }
    }

    private void loadInitialChannelState() throws IOException {
        synchronized (channelStateLock) {
            if (!Files.isRegularFile(channelStateFile)) {
                channelState = cleanChannelState();
                channelConfigState = "missing";
                channelCorruptEvidencePreserved = true;
                return;
            }
            try {
                byte[] bytes;
                try (InputStream input = Files.newInputStream(
                    channelStateFile,
                    StandardOpenOption.READ
                )) {
                    bytes = input.readNBytes(MAX_CHANNEL_STATE_BYTES + 1);
                }
                if (bytes.length <= 0 || bytes.length > MAX_CHANNEL_STATE_BYTES) {
                    throw new IOException("audio channel router state size is invalid");
                }
                channelState = channelStateFromRoot(SimpleJson.parseObjectStrict(
                    new String(bytes, StandardCharsets.UTF_8)
                ));
                restrictOwnerOnly(channelStateFile);
                channelConfigState = "ready";
                channelCorruptEvidencePreserved = true;
            } catch (Exception invalid) {
                Path evidence = dataDirectory.resolve(
                    channelStateFile.getFileName() + ".corrupt-" + UUID.randomUUID()
                );
                try {
                    long expectedSize = Files.size(channelStateFile);
                    Files.move(channelStateFile, evidence, StandardCopyOption.ATOMIC_MOVE);
                    restrictOwnerOnly(evidence);
                    channelCorruptEvidencePreserved = Files.isRegularFile(evidence)
                        && Files.size(evidence) == expectedSize;
                } catch (IOException ignored) {
                    // Fail closed in memory. Never parse the invalid state again.
                    channelCorruptEvidencePreserved = false;
                }
                channelState = cleanChannelState();
                channelConfigState = "corrupt";
            }
        }
    }

    private void refreshChannelStateFromDisk() {
        if (!Files.isRegularFile(channelStateFile)) return;
        try {
            byte[] bytes;
            try (InputStream input = Files.newInputStream(
                channelStateFile,
                StandardOpenOption.READ
            )) {
                bytes = input.readNBytes(MAX_CHANNEL_STATE_BYTES + 1);
            }
            if (bytes.length <= 0 || bytes.length > MAX_CHANNEL_STATE_BYTES) return;
            channelState = channelStateFromRoot(SimpleJson.parseObjectStrict(
                new String(bytes, StandardCharsets.UTF_8)
            ));
            channelConfigState = "ready";
            channelCorruptEvidencePreserved = true;
        } catch (Exception invalid) {
            Path evidence = dataDirectory.resolve(
                channelStateFile.getFileName() + ".corrupt-" + UUID.randomUUID()
            );
            try {
                long expectedSize = Files.size(channelStateFile);
                Files.move(channelStateFile, evidence, StandardCopyOption.ATOMIC_MOVE);
                restrictOwnerOnly(evidence);
                channelCorruptEvidencePreserved = Files.isRegularFile(evidence)
                    && Files.size(evidence) == expectedSize;
            } catch (IOException ignored) {
                channelCorruptEvidencePreserved = false;
            }
            channelConfigState = "corrupt";
        }
    }

    private ChannelNativeSubmission desiredChannelSubmission() {
        if (channelState == null) return null;
        String activeLayout = stringValue(
            state.parameters().get("upmixOutputLayout"),
            channelState.selectedLayout()
        );
        ChannelLayoutState desired = channelState.layouts().get(activeLayout);
        if (desired == null) desired = channelState.layouts().get(channelState.selectedLayout());
        if (desired == null) return null;
        return new ChannelNativeSubmission(
            channelState.revision(),
            "7.1".equals(activeLayout) ? 8 : 6,
            channelAlgorithmValue(desired.algorithm()),
            channelNativeValues(desired)
        );
    }

    private static Map<String, Object> failedChannelStatus() {
        return Map.of(
            "available", false,
            "active", false,
            "actual", false,
            "lastResult", -1,
            "availability", "parameter-submit-failed"
        );
    }

    private Map<String, Object> channelSnapshotPayload() {
        Map<String, Object> status = currentChannelStatus();
        ChannelLayoutState selected = channelState.layouts().get(channelState.selectedLayout());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("version", 1);
        body.put("revision", channelState.revision());
        body.put("configState", channelConfigState);
        body.put("layout", channelState.selectedLayout());
        String effectiveLayout = longValue(status.get("outputChannels"), 0) == 8 ? "7.1"
            : (longValue(status.get("outputChannels"), 0) == 6 ? "5.1" : "");
        body.put("effectiveLayout", effectiveLayout);
        body.put("layoutPending", !effectiveLayout.isEmpty()
            && !effectiveLayout.equals(channelState.selectedLayout()));
        body.put("algorithm", selected.algorithm());
        body.put("lfeCrossoverHz", selected.lfeCrossoverHz());
        body.put("channelOrder", channelOrder(channelState.selectedLayout()));
        body.put("channelGainDb", selected.channelGainDb());
        body.put("channelDelayMs", selected.channelDelayMs());
        body.put("channelAzimuthDeg", selected.channelAzimuthDeg());
        body.put("customMatrix", selected.customMatrix());
        body.put("available", booleanValue(status.get("available"), false));
        body.put("active", booleanValue(status.get("active"), false));
        body.put("actual", booleanValue(status.get("actual"), false));
        body.put("availability", stringValue(
            status.get("availability"),
            booleanValue(status.get("actual"), false)
                ? "available"
                : "native-route-not-connected"
        ));
        body.put("outputChannels", longValue(status.get("outputChannels"), 0));
        body.put("activeRevision", longValue(status.get("activeRevision"), 0));
        body.put("stagedRevision", longValue(status.get("stagedRevision"), 0));
        body.put("processCalls", longValue(status.get("processCalls"), 0));
        body.put("lastResult", longValue(status.get("lastResult"), 0));
        body.put("channelPeak", exactTelemetryList(status.get("channelPeak")));
        body.put("channelRms", exactTelemetryList(status.get("channelRms")));
        body.put("channelTelemetryAzimuthDeg", exactTelemetryList(
            status.get("channelAzimuthDeg")
        ));
        body.put("physicalMultichannel", false);
        body.put("output", booleanValue(state.parameters().get("obrEnabled"), false)
            ? "binaural-2ch-headphones"
            : "energy-matched-stereo-fold-down");
        body.put("layouts", channelLayoutsPayload(channelState.layouts()));
        return body;
    }

    private Map<String, Object> currentChannelStatus() {
        try {
            Map<String, Object> status = nativeBridge.channelStatus();
            if (status != null && !status.isEmpty()) lastChannelStatus = copyMap(status);
        } catch (RuntimeException ignored) {
        }
        return lastChannelStatus;
    }

    private void refreshFromDiskForMutation() {
        if ("corrupt".equals(configState)) return;
        if (!Files.isRegularFile(stateFile)) {
            if (state.revision() != 0 || "ready".equals(configState)) {
                state = cleanState();
                configState = "missing";
                corruptEvidencePreserved = true;
                spatialMigrationNeeded = false;
            }
            return;
        }
        try {
            Map<String, Object> root = SimpleJson.parseObjectStrict(
                new String(readBoundedState(), StandardCharsets.UTF_8)
            );
            MixerState disk = stateFromRoot(root);
            if (!disk.equals(state)) state = disk;
            configState = "ready";
            corruptEvidencePreserved = true;
            spatialMigrationNeeded = hasLegacyParameterShape(root);
        } catch (Exception invalid) {
            corruptEvidencePreserved = preserveCorruptEvidence();
            state = cleanState();
            configState = "corrupt";
            spatialMigrationNeeded = false;
        }
    }

    private byte[] readBoundedState() throws IOException {
        byte[] bytes;
        try (InputStream input = Files.newInputStream(stateFile, StandardOpenOption.READ)) {
            bytes = input.readNBytes(MAX_STATE_BYTES + 1);
        }
        if (bytes.length <= 0 || bytes.length > MAX_STATE_BYTES) {
            throw new IOException("audio mixer state size is invalid");
        }
        return bytes;
    }

    private void requireExpectedRevision(long expected) {
        if (expected != state.revision()) {
            throw new RevisionConflictException(state.revision());
        }
    }

    private void submitDesiredState() {
        ChannelNativeSubmission desiredChannels = desiredChannelSubmission();
        try {
            if (desiredChannels == null) {
                Map<String, Object> submitted = nativeBridge.submit(
                    state.revision(),
                    flags(state.parameters()),
                    nativeValues(state.parameters())
                );
                lastNativeStatus = submitted == null ? Map.of() : copyMap(submitted);
            } else {
                Map<String, Object> submitted = nativeBridge.submitCombined(
                    state.revision(),
                    flags(state.parameters()),
                    nativeValues(state.parameters()),
                    desiredChannels.revision(),
                    desiredChannels.outputChannels(),
                    desiredChannels.algorithm(),
                    desiredChannels.values()
                );
                Map<String, Object> mixer = copyMapValue(
                    submitted == null ? null : submitted.get("mixer")
                );
                Map<String, Object> channels = copyMapValue(
                    submitted == null ? null : submitted.get("channels")
                );
                lastNativeStatus = mixer;
                lastChannelStatus = channels;
            }
        } catch (RuntimeException failure) {
            Map<String, Object> failed = new LinkedHashMap<>();
            failed.put("nativeBackendAvailable", false);
            failed.put("nativeChainActive", false);
            failed.put("mixerAvailable", false);
            failed.put("mixerActive", false);
            failed.put("mixerEnabled", booleanValue(state.parameters().get("enabled"), true));
            failed.put("mixerFailureDisabled", false);
            failed.put("bypassReason", "parameter-submit-failed");
            failed.put("lastResult", -1);
            lastNativeStatus = failed;
            lastChannelStatus = failedChannelStatus();
        }
    }

    private Map<String, Object> snapshotPayload() {
        Map<String, Object> nativeStatus = currentNativeStatus();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("version", STATE_VERSION);
        body.put("presetVersion", PRESET_VERSION);
        body.put("revision", state.revision());
        body.put("selectedPreset", state.selectedPreset());
        body.put("configState", configState);
        body.put("spatialMigrationNeeded", spatialMigrationNeeded);
        body.put("parameters", copyParameters(state.parameters()));

        boolean backendAvailable = booleanValue(
            nativeStatus.get("nativeBackendAvailable"),
            false
        );
        boolean chainActive = booleanValue(nativeStatus.get("nativeChainActive"), false);
        boolean mixerAvailable = booleanValue(nativeStatus.get("mixerAvailable"), false);
        boolean mixerActive = booleanValue(nativeStatus.get("mixerActive"), false);
        body.put("nativeBackendAvailable", backendAvailable);
        body.put("nativeChainActive", chainActive);
        body.put("mixerAvailable", mixerAvailable);
        body.put("mixerActive", mixerActive);
        body.put("mixerEnabled", booleanValue(
            nativeStatus.get("mixerEnabled"),
            booleanValue(state.parameters().get("enabled"), true)
        ));
        body.put("mixerFailureDisabled", booleanValue(
            nativeStatus.get("mixerFailureDisabled"),
            false
        ));
        body.put("bypassReason", stringValue(
            nativeStatus.get("bypassReason"),
            backendAvailable ? "pipeline-inactive" : "native-backend-unavailable"
        ));
        body.put("lastResult", longValue(nativeStatus.get("lastResult"), 0));
        body.put("processCalls", longValue(nativeStatus.get("processCalls"), 0));
        body.put("bypassedBlocks", longValue(nativeStatus.get("bypassedBlocks"), 0));
        body.put("processFailures", longValue(nativeStatus.get("processFailures"), 0));
        body.put("consecutiveFailures", longValue(nativeStatus.get("consecutiveFailures"), 0));
        body.put("partialFailureBypasses", longValue(
            nativeStatus.get("partialFailureBypasses"),
            0
        ));
        body.put("activeRevision", longValue(nativeStatus.get("activeRevision"), 0));
        body.put("stagedRevision", longValue(nativeStatus.get("stagedRevision"), 0));
        body.put("activeRevisionCommitted", booleanValue(
            nativeStatus.get("activeRevisionCommitted"),
            false
        ));
        body.put("spatialActiveRevision", longValue(
            nativeStatus.get("spatialActiveRevision"),
            0
        ));
        body.put("spatialRevisionCommitted", booleanValue(
            nativeStatus.get("spatialRevisionCommitted"),
            false
        ));
        body.put("transitionPending", booleanValue(
            nativeStatus.get("transitionPending"),
            false
        ));
        body.put("spatialRoute", spatialRoute(nativeStatus, state.parameters()));
        body.put("upmix", upmixDiagnostic(nativeStatus, state.parameters()));
        body.put("obr", obrDiagnostic(nativeStatus, state.parameters()));
        body.put("channelRouter", channelSnapshotPayload());
        body.put("order", copyMapValue(nativeStatus.get("order")));
        body.put("playbackState", !backendAvailable
            ? "browser-compatible"
            : (chainActive && mixerAvailable && mixerActive
                ? "native-mixer"
                : "native-mixer-bypassed"));
        return body;
    }

    /**
     * Stable control-plane schema for the additive Rust channel-router ABI.
     * Proprietary algorithm names are capability adapters only: without a
     * licensed SDK they are deliberately not selectable.  The custom matrix
     * DSP is connected through an additive Windows/JNI contract; the legacy
     * Mixer29 and Spatial32 status vectors stay unchanged.
     *
     * Channel order sources:
     * https://ffmpeg.org/ffmpeg-all.html#Channel-Layout
     * https://obsproject.com/kb/surround-sound-guide
     */
    public synchronized Map<String, Object> channelControlSchema() {
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("version", 1);
        schema.put("routerAbi", 1);
        schema.put("algorithms", channelAlgorithmCatalog());
        Map<String, Object> layouts = new LinkedHashMap<>();
        layouts.put("5.1", List.of("FL", "FR", "FC", "LFE", "SL", "SR"));
        layouts.put("7.1", List.of("FL", "FR", "FC", "LFE", "BL", "BR", "SL", "SR"));
        schema.put("layouts", layouts);
        Map<String, Object> perChannel = new LinkedHashMap<>();
        perChannel.put("gainDb", List.of(-60.0, 12.0));
        perChannel.put("delayMs", List.of(0.0, 250.0));
        perChannel.put("azimuthDeg", List.of(-180.0, 180.0));
        schema.put("perChannel", perChannel);
        Map<String, Object> customMatrix = new LinkedHashMap<>();
        customMatrix.put("inputChannels", List.of("L", "R"));
        customMatrix.put("coefficient", List.of(-2.0, 2.0));
        customMatrix.put("storage", "row-major-output-by-input");
        schema.put("customMatrix", customMatrix);
        schema.put("lfeCrossoverHz", List.of(20.0, 500.0));
        schema.put("testSignals", List.of("tone", "impulse"));
        schema.put("testSignalTransport", "memory-pcm");
        schema.put("testSignalRouteConnected", booleanValue(
            currentChannelStatus().get("available"),
            false
        ));
        return schema;
    }

    private static List<Object> channelAlgorithmCatalog() {
        List<Object> catalog = new ArrayList<>();
        catalog.add(channelAlgorithm(
            "front-only", "Front only / pass-through", "available", true,
            "production-channel-router-v1"
        ));
        catalog.add(channelAlgorithm(
            "matrix-decode", "Matrix", "available", true,
            "production-channel-router-v1"
        ));
        catalog.add(channelAlgorithm(
            "ambient-extract", "Ambient extract", "available", true,
            "production-channel-router-v1"
        ));
        catalog.add(channelAlgorithm(
            "custom-matrix", "Custom matrix", "available", true,
            "production-channel-router-v1"
        ));
        catalog.add(channelAlgorithm(
            "dolby-pro-logic-ii", "Dolby Pro Logic II", "license-required", false,
            "licensed-sdk-adapter"
        ));
        catalog.add(channelAlgorithm(
            "dolby-pro-logic-iix", "Dolby Pro Logic IIx", "license-required", false,
            "licensed-sdk-adapter"
        ));
        catalog.add(channelAlgorithm(
            "dts-neural-x", "DTS Neural:X", "license-required", false,
            "licensed-sdk-adapter"
        ));
        return List.copyOf(catalog);
    }

    private static Map<String, Object> channelAlgorithm(
        String id,
        String label,
        String availability,
        boolean selectable,
        String implementation
    ) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", id);
        item.put("label", label);
        item.put("availability", availability);
        item.put("selectable", selectable);
        item.put("implementation", implementation);
        return item;
    }

    static float[] generateChannelTestSignal(
        String layout,
        String channelRole,
        String kind,
        int frames,
        int sampleRate,
        double frequencyHz,
        double gainDb
    ) {
        List<String> order = switch (layout) {
            case "5.1" -> List.of("FL", "FR", "FC", "LFE", "SL", "SR");
            case "7.1" -> List.of("FL", "FR", "FC", "LFE", "BL", "BR", "SL", "SR");
            default -> throw new IllegalArgumentException("unsupported test signal layout");
        };
        int target = order.indexOf(channelRole);
        if (target < 0) throw new IllegalArgumentException("unknown test signal channel");
        if (frames < 1 || frames > 65_536) {
            throw new IllegalArgumentException("test signal frame count is out of range");
        }
        if (sampleRate < 16_000 || sampleRate > 192_000) {
            throw new IllegalArgumentException("test signal sample rate is out of range");
        }
        if (!Set.of("tone", "impulse").contains(kind)) {
            throw new IllegalArgumentException("unsupported test signal kind");
        }
        if (!Double.isFinite(frequencyHz)
            || frequencyHz < 20.0
            || frequencyHz > Math.min(20_000.0, sampleRate * 0.45)) {
            throw new IllegalArgumentException("test signal frequency is out of range");
        }
        if (!Double.isFinite(gainDb) || gainDb < -60.0 || gainDb > 0.0) {
            throw new IllegalArgumentException("test signal gain is out of range");
        }
        int channels = order.size();
        float[] pcm = new float[Math.multiplyExact(frames, channels)];
        double amplitude = Math.pow(10.0, gainDb / 20.0);
        if ("impulse".equals(kind)) {
            pcm[target] = (float) amplitude;
            return pcm;
        }
        double phaseStep = Math.PI * 2.0 * frequencyHz / sampleRate;
        for (int frame = 0; frame < frames; frame += 1) {
            pcm[frame * channels + target] = (float) (Math.sin(frame * phaseStep) * amplitude);
        }
        return pcm;
    }

    private static String spatialRoute(
        Map<String, Object> nativeStatus,
        Map<String, Object> parameters
    ) {
        String reported = stringValue(nativeStatus.get("spatialRoute"), "");
        if (Set.of(
            "stereo-mixer-out",
            "upmix-mixer-non-obr-out",
            "stereo-mixer-obr",
            "upmix-mixer-x3d-obr"
        ).contains(reported)) {
            return reported;
        }
        boolean upmix = booleanValue(parameters.get("upmixEnabled"), false);
        boolean obr = booleanValue(parameters.get("obrEnabled"), false);
        if (upmix && obr) return "upmix-mixer-x3d-obr";
        if (upmix) return "upmix-mixer-non-obr-out";
        if (obr) return "stereo-mixer-obr";
        return "stereo-mixer-out";
    }

    private static Map<String, Object> upmixDiagnostic(
        Map<String, Object> nativeStatus,
        Map<String, Object> parameters
    ) {
        Map<String, Object> diagnostic = copyMapValue(nativeStatus.get("upmix"));
        boolean enabled = booleanValue(parameters.get("upmixEnabled"), false);
        diagnostic.put("enabled", enabled);
        diagnostic.put("active", enabled && booleanValue(diagnostic.get("active"), false));
        diagnostic.put("algorithm", parameters.get("upmixAlgorithm"));
        // This is the requested virtual bed. The native-reported outputChannels,
        // when present, remains the authority for the physical/final output.
        diagnostic.put("outputLayout", parameters.get("upmixOutputLayout"));
        diagnostic.putIfAbsent("available", false);
        diagnostic.putIfAbsent("processCalls", 0L);
        diagnostic.putIfAbsent("fallbackBlocks", 0L);
        diagnostic.putIfAbsent("lastResult", 0);
        if (!enabled) diagnostic.put("bypassReason", "disabled");
        else diagnostic.putIfAbsent("bypassReason", "");
        return diagnostic;
    }

    private static Map<String, Object> obrDiagnostic(
        Map<String, Object> nativeStatus,
        Map<String, Object> parameters
    ) {
        Map<String, Object> diagnostic = copyMapValue(nativeStatus.get("obr"));
        boolean enabled = booleanValue(parameters.get("obrEnabled"), false);
        diagnostic.put("enabled", enabled);
        diagnostic.put("active", enabled && booleanValue(
            diagnostic.get("active"),
            booleanValue(diagnostic.get("rendererReady"), false)
        ));
        diagnostic.put("filterProfile", parameters.get("obrFilterProfile"));
        diagnostic.put("wet", parameters.get("obrWet"));
        diagnostic.put("dry", parameters.get("obrDry"));
        diagnostic.put("outputGainDb", parameters.get("obrOutputGainDb"));
        diagnostic.put("spatialWidth", parameters.get("obrSpatialWidth"));
        diagnostic.putIfAbsent("available", false);
        diagnostic.putIfAbsent("rendererReady", false);
        diagnostic.putIfAbsent("processCalls", 0L);
        diagnostic.putIfAbsent("lastResult", 0);
        if (!enabled) diagnostic.put("bypassReason", "dry-through");
        else diagnostic.putIfAbsent("bypassReason", "");
        return diagnostic;
    }

    private Map<String, Object> currentNativeStatus() {
        try {
            Map<String, Object> status = nativeBridge.status();
            if (status != null && !status.isEmpty()) {
                lastNativeStatus = copyMap(status);
            }
        } catch (RuntimeException ignored) {
        }
        return lastNativeStatus;
    }

    private static boolean hasLegacyParameterShape(Map<String, Object> root) {
        Object parameterValue = root.get("parameters");
        return parameterValue instanceof Map<?, ?> map
            && map.keySet().equals(LEGACY_PARAMETER_KEY_SET);
    }

    private MixerState stateFromRoot(Map<String, Object> root) {
        if (!root.keySet().equals(STATE_KEYS)) throw new IllegalArgumentException("invalid state keys");
        if (exactRevision(root.get("version"), "version") != STATE_VERSION
            || exactRevision(root.get("presetVersion"), "presetVersion") != PRESET_VERSION) {
            throw new IllegalArgumentException("unsupported audio mixer state version");
        }
        long revision = exactRevision(root.get("revision"), "revision");
        Object selectedValue = root.get("selectedPreset");
        if (!(selectedValue instanceof String selectedPreset)) {
            throw new IllegalArgumentException("selectedPreset must be a string");
        }
        if (!"custom".equals(selectedPreset) && !PRESETS.containsKey(selectedPreset)) {
            throw new IllegalArgumentException("unknown selectedPreset");
        }
        Object parameterValue = root.get("parameters");
        if (!(parameterValue instanceof Map<?, ?>)) {
            throw new IllegalArgumentException("parameters must be an object");
        }
        Map<String, Object> rawParameters = SimpleJson.asMap(parameterValue);
        boolean legacy = rawParameters.keySet().equals(LEGACY_PARAMETER_KEY_SET);
        Map<String, Object> parameters = legacy
            ? migrateLegacyParameters(rawParameters)
            : validateCompleteParameters(rawParameters);
        String restoredPreset = selectedPreset;
        if (!"custom".equals(restoredPreset)
            && !PRESETS.get(restoredPreset).parameters().equals(parameters)) {
            if (!legacy) {
                throw new IllegalArgumentException("selected preset parameters do not match");
            }
            // Additive migration never rewrites old user values merely because a
            // built-in preset was tuned in a newer build. Preserve those values
            // and truthfully relabel the restored state as custom.
            restoredPreset = "custom";
        }
        return new MixerState(revision, restoredPreset, immutableParameters(parameters));
    }

    private static Map<String, Object> validatePatch(Map<String, Object> patch) {
        if (patch == null) throw new IllegalArgumentException("parameters patch is required");
        if (!PARAMETER_KEY_SET.containsAll(patch.keySet())) {
            throw new IllegalArgumentException("unknown audio mixer parameter");
        }
        Map<String, Object> normalized = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : patch.entrySet()) {
            normalized.put(entry.getKey(), validateParameter(entry.getKey(), entry.getValue()));
        }
        return normalized;
    }

    private static Map<String, Object> validateCompleteParameters(Map<String, Object> parameters) {
        if (!parameters.keySet().equals(PARAMETER_KEY_SET)) {
            throw new IllegalArgumentException("audio mixer parameters must be complete");
        }
        Map<String, Object> normalized = new LinkedHashMap<>();
        for (String key : PARAMETER_KEYS) {
            normalized.put(key, validateParameter(key, parameters.get(key)));
        }
        return normalized;
    }

    private static Map<String, Object> migrateLegacyParameters(Map<String, Object> legacy) {
        if (!legacy.keySet().equals(LEGACY_PARAMETER_KEY_SET)) {
            throw new IllegalArgumentException("legacy audio mixer parameters must be complete");
        }
        Map<String, Object> migrated = cleanParameters();
        for (String key : LEGACY_PARAMETER_KEYS) {
            migrated.put(key, validateParameter(key, legacy.get(key)));
        }
        return validateCompleteParameters(migrated);
    }

    private static Object validateParameter(String key, Object value) {
        if (BOOLEAN_PARAMETERS.contains(key)) {
            if (!(value instanceof Boolean)) {
                throw new IllegalArgumentException(key + " must be boolean");
            }
            return value;
        }
        if ("eqDb".equals(key)) {
            if (!(value instanceof List<?> list) || list.size() != EQ_BANDS) {
                throw new IllegalArgumentException("eqDb must contain exactly 10 numbers");
            }
            List<Object> normalized = new ArrayList<>(EQ_BANDS);
            for (Object item : list) normalized.add(exactNumber(item, "eqDb", -12.0, 12.0));
            return List.copyOf(normalized);
        }
        Set<String> acceptedValues = ENUM_PARAMETERS.get(key);
        if (acceptedValues != null) {
            if (!(value instanceof String string) || !acceptedValues.contains(string)) {
                throw new IllegalArgumentException(key + " is not a supported value");
            }
            return string;
        }
        Bounds bounds = NUMERIC_BOUNDS.get(key);
        if (bounds == null) throw new IllegalArgumentException("unknown audio mixer parameter");
        return exactNumber(value, key, bounds.minimum(), bounds.maximum());
    }

    private static double exactNumber(
        Object value,
        String name,
        double minimum,
        double maximum
    ) {
        if (!(value instanceof Number number)) {
            throw new IllegalArgumentException(name + " must be numeric");
        }
        double result = number.doubleValue();
        if (!Double.isFinite(result) || result < minimum || result > maximum) {
            throw new IllegalArgumentException(name + " is outside the supported range");
        }
        return result;
    }

    private static long exactRevision(Object value, String name) {
        if (!(value instanceof Number number)) {
            throw new IllegalArgumentException(name + " must be an integral nonnegative number");
        }
        double doubleValue = number.doubleValue();
        if (!Double.isFinite(doubleValue)
            || doubleValue < 0
            || doubleValue > Long.MAX_VALUE
            || Math.rint(doubleValue) != doubleValue) {
            throw new IllegalArgumentException(name + " must be an integral nonnegative number");
        }
        long result = number.longValue();
        if (result < 0 || (double) result != doubleValue) {
            throw new IllegalArgumentException(name + " must be an exact integral nonnegative number");
        }
        return result;
    }

    private static int exactInt(Object value, String name, int minimum, int maximum) {
        long result = exactRevision(value, name);
        if (result < minimum || result > maximum) {
            throw new IllegalArgumentException(name + " is outside the supported range");
        }
        return (int) result;
    }

    private static String validateChannelLayout(Object value) {
        if (!(value instanceof String string) || !("5.1".equals(string) || "7.1".equals(string))) {
            throw new IllegalArgumentException("channel layout must be 5.1 or 7.1");
        }
        return string;
    }

    private static String validateChannelAlgorithm(Object value) {
        if (!(value instanceof String string) || !Set.of(
            "front-only", "matrix-decode", "ambient-extract", "custom-matrix"
        ).contains(string)) {
            throw new IllegalArgumentException("unsupported channel router algorithm");
        }
        return string;
    }

    private static List<Object> validateNumberList(
        Object value,
        String name,
        int expectedSize,
        double minimum,
        double maximum
    ) {
        if (!(value instanceof List<?> list) || list.size() != expectedSize) {
            throw new IllegalArgumentException(name + " must contain exactly " + expectedSize + " numbers");
        }
        List<Object> normalized = new ArrayList<>(expectedSize);
        for (Object item : list) normalized.add(exactNumber(item, name, minimum, maximum));
        return List.copyOf(normalized);
    }

    private static ChannelLayoutState patchChannelLayout(
        ChannelLayoutState current,
        Map<String, Object> patch
    ) {
        String algorithm = patch.containsKey("algorithm")
            ? validateChannelAlgorithm(patch.get("algorithm"))
            : current.algorithm();
        double lfe = patch.containsKey("lfeCrossoverHz")
            ? exactNumber(patch.get("lfeCrossoverHz"), "lfeCrossoverHz", 20.0, 500.0)
            : current.lfeCrossoverHz();
        List<Object> gains = patch.containsKey("channelGainDb")
            ? validateNumberList(patch.get("channelGainDb"), "channelGainDb", 8, -60.0, 12.0)
            : current.channelGainDb();
        List<Object> delays = patch.containsKey("channelDelayMs")
            ? validateNumberList(patch.get("channelDelayMs"), "channelDelayMs", 8, 0.0, 250.0)
            : current.channelDelayMs();
        List<Object> azimuths = patch.containsKey("channelAzimuthDeg")
            ? validateNumberList(
                patch.get("channelAzimuthDeg"), "channelAzimuthDeg", 8, -180.0, 180.0
            )
            : current.channelAzimuthDeg();
        List<Object> matrix = patch.containsKey("customMatrix")
            ? validateNumberList(patch.get("customMatrix"), "customMatrix", 16, -2.0, 2.0)
            : current.customMatrix();
        return new ChannelLayoutState(algorithm, lfe, gains, delays, azimuths, matrix);
    }

    private static int channelAlgorithmValue(String algorithm) {
        return switch (algorithm) {
            case "front-only" -> 0;
            case "ambient-extract" -> 2;
            case "custom-matrix" -> 3;
            default -> 1;
        };
    }

    private static float[] channelNativeValues(ChannelLayoutState state) {
        float[] values = new float[41];
        values[0] = (float) state.lfeCrossoverHz();
        for (int index = 0; index < 8; index += 1) {
            values[1 + index] = floatValue(state.channelGainDb().get(index));
            values[9 + index] = floatValue(state.channelDelayMs().get(index));
            values[17 + index] = floatValue(state.channelAzimuthDeg().get(index));
        }
        for (int index = 0; index < 16; index += 1) {
            values[25 + index] = floatValue(state.customMatrix().get(index));
        }
        return values;
    }

    private static List<String> channelOrder(String layout) {
        return "7.1".equals(layout)
            ? List.of("FL", "FR", "FC", "LFE", "BL", "BR", "SL", "SR")
            : List.of("FL", "FR", "FC", "LFE", "SL", "SR");
    }

    private static List<Object> exactTelemetryList(Object value) {
        if (!(value instanceof List<?> list)) return List.of();
        List<Object> output = new ArrayList<>(Math.min(8, list.size()));
        for (Object item : list) {
            if (output.size() == 8) break;
            if (!(item instanceof Number number) || !Double.isFinite(number.doubleValue())) {
                return List.of();
            }
            output.add(number.doubleValue());
        }
        return List.copyOf(output);
    }

    private void persist(MixerState next) throws IOException {
        if ("corrupt".equals(configState) && !corruptEvidencePreserved) {
            throw new IOException("corrupt audio mixer state evidence was not preserved");
        }
        Files.createDirectories(dataDirectory);
        restrictOwnerOnly(dataDirectory);
        byte[] bytes = SimpleJson.stringify(stateMap(next)).getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_STATE_BYTES) throw new IOException("audio mixer state is too large");
        Path temporary = dataDirectory.resolve(
            stateFile.getFileName() + ".tmp-" + UUID.randomUUID()
        );
        boolean posix = FileSystems.getDefault().supportedFileAttributeViews().contains("posix");
        try {
            if (posix) {
                Files.createFile(temporary, PosixFilePermissions.asFileAttribute(
                    EnumSet.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE)
                ));
            } else {
                Files.createFile(temporary);
                restrictOwnerOnly(temporary);
            }
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.WRITE)) {
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) channel.write(buffer);
                channel.force(true);
            }
            try {
                Files.move(
                    temporary,
                    stateFile,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING
                );
            } catch (AtomicMoveNotSupportedException unavailable) {
                throw new IOException("atomic audio mixer state replacement is unavailable", unavailable);
            }
            restrictOwnerOnly(stateFile);
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private void persistChannelState(ChannelRouterState next) throws IOException {
        Files.createDirectories(dataDirectory);
        restrictOwnerOnly(dataDirectory);
        byte[] bytes = SimpleJson.stringify(channelStateMap(next)).getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_CHANNEL_STATE_BYTES) {
            throw new IOException("audio channel router state is too large");
        }
        Path temporary = dataDirectory.resolve(
            channelStateFile.getFileName() + ".tmp-" + UUID.randomUUID()
        );
        boolean posix = FileSystems.getDefault().supportedFileAttributeViews().contains("posix");
        try {
            if (posix) {
                Files.createFile(temporary, PosixFilePermissions.asFileAttribute(
                    EnumSet.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE)
                ));
            } else {
                Files.createFile(temporary);
                restrictOwnerOnly(temporary);
            }
            try (FileChannel channel = FileChannel.open(temporary, StandardOpenOption.WRITE)) {
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                while (buffer.hasRemaining()) channel.write(buffer);
                channel.force(true);
            }
            try {
                Files.move(
                    temporary,
                    channelStateFile,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING
                );
            } catch (AtomicMoveNotSupportedException unavailable) {
                throw new IOException("atomic audio channel state replacement is unavailable", unavailable);
            }
            restrictOwnerOnly(channelStateFile);
        } finally {
            Files.deleteIfExists(temporary);
        }
    }

    private boolean preserveCorruptEvidence() {
        try {
            Files.createDirectories(dataDirectory);
            restrictOwnerOnly(dataDirectory);
            long expectedSize = Files.size(stateFile);
            Path evidence = dataDirectory.resolve(
                stateFile.getFileName() + ".corrupt-" + UUID.randomUUID()
            );
            corruptEvidenceMove.move(stateFile, evidence);
            if (Files.exists(stateFile)
                || !Files.isRegularFile(evidence)
                || Files.size(evidence) != expectedSize) {
                return false;
            }
            try (FileChannel channel = FileChannel.open(evidence, StandardOpenOption.WRITE)) {
                channel.force(true);
            }
            restrictOwnerOnly(evidence);
            return true;
        } catch (IOException | SecurityException ignored) {
            // Fail closed in memory even when the host filesystem cannot make
            // evidence durable. The untrusted original is never parsed again
            // by this service instance and is not overwritten by a read.
            return false;
        }
    }

    private static void atomicMoveCorruptEvidence(Path source, Path evidence) throws IOException {
        Files.move(source, evidence, StandardCopyOption.ATOMIC_MOVE);
    }

    private static Map<String, Object> stateMap(MixerState state) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("version", STATE_VERSION);
        root.put("presetVersion", PRESET_VERSION);
        root.put("revision", state.revision());
        root.put("selectedPreset", state.selectedPreset());
        root.put("parameters", copyParameters(state.parameters()));
        return root;
    }

    private static Map<String, Object> channelStateMap(ChannelRouterState state) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("version", 1);
        root.put("revision", state.revision());
        root.put("selectedLayout", state.selectedLayout());
        root.put("layouts", channelLayoutsPayload(state.layouts()));
        return root;
    }

    private static Map<String, Object> channelLayoutsPayload(
        Map<String, ChannelLayoutState> layouts
    ) {
        Map<String, Object> output = new LinkedHashMap<>();
        for (String layout : List.of("5.1", "7.1")) {
            ChannelLayoutState state = layouts.get(layout);
            if (state == null) continue;
            Map<String, Object> value = new LinkedHashMap<>();
            value.put("algorithm", state.algorithm());
            value.put("lfeCrossoverHz", state.lfeCrossoverHz());
            value.put("channelGainDb", state.channelGainDb());
            value.put("channelDelayMs", state.channelDelayMs());
            value.put("channelAzimuthDeg", state.channelAzimuthDeg());
            value.put("customMatrix", state.customMatrix());
            output.put(layout, value);
        }
        return output;
    }

    private static ChannelRouterState channelStateFromRoot(Map<String, Object> root) {
        if (!root.keySet().equals(Set.of("version", "revision", "selectedLayout", "layouts"))) {
            throw new IllegalArgumentException("invalid channel router state keys");
        }
        if (exactRevision(root.get("version"), "version") != 1) {
            throw new IllegalArgumentException("unsupported channel router state version");
        }
        long revision = exactRevision(root.get("revision"), "revision");
        String selected = validateChannelLayout(root.get("selectedLayout"));
        if (!(root.get("layouts") instanceof Map<?, ?> layoutsValue)) {
            throw new IllegalArgumentException("channel router layouts must be an object");
        }
        Map<String, Object> rawLayouts = SimpleJson.asMap(layoutsValue);
        if (!rawLayouts.keySet().equals(Set.of("5.1", "7.1"))) {
            throw new IllegalArgumentException("channel router layouts must contain 5.1 and 7.1");
        }
        Map<String, ChannelLayoutState> layouts = new LinkedHashMap<>();
        for (String layout : List.of("5.1", "7.1")) {
            if (!(rawLayouts.get(layout) instanceof Map<?, ?> rawValue)) {
                throw new IllegalArgumentException("channel layout state must be an object");
            }
            Map<String, Object> raw = SimpleJson.asMap(rawValue);
            if (!raw.keySet().equals(Set.of(
                "algorithm", "lfeCrossoverHz", "channelGainDb", "channelDelayMs",
                "channelAzimuthDeg", "customMatrix"
            ))) {
                throw new IllegalArgumentException("channel layout state is incomplete");
            }
            layouts.put(layout, patchChannelLayout(defaultChannelLayout(layout), raw));
        }
        return new ChannelRouterState(revision, selected, Map.copyOf(layouts));
    }

    private static MixerState cleanState() {
        return new MixerState(0, "clean", PRESETS.get("clean").parameters());
    }

    private static ChannelRouterState cleanChannelState() {
        return new ChannelRouterState(
            0,
            "5.1",
            Map.of(
                "5.1", defaultChannelLayout("5.1"),
                "7.1", defaultChannelLayout("7.1")
            )
        );
    }

    private static ChannelLayoutState defaultChannelLayout(String layout) {
        List<Object> gains = List.of(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        List<Object> delays = List.of(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        List<Object> azimuths = "7.1".equals(layout)
            ? List.of(30.0, -30.0, 0.0, 0.0, 135.0, -135.0, 90.0, -90.0)
            : List.of(30.0, -30.0, 0.0, 0.0, 110.0, -110.0, 0.0, 0.0);
        List<Object> matrix = "7.1".equals(layout)
            ? List.of(
                1.0, 0.0, 0.0, 1.0, 0.5, 0.5, 0.18, 0.18,
                0.38, -0.38, -0.38, 0.38, 0.52, -0.52, -0.52, 0.52
            )
            : List.of(
                1.0, 0.0, 0.0, 1.0, 0.5, 0.5, 0.18, 0.18,
                0.52, -0.52, -0.52, 0.52, 0.0, 0.0, 0.0, 0.0
            );
        return new ChannelLayoutState(
            "matrix-decode",
            80.0,
            gains,
            delays,
            azimuths,
            matrix
        );
    }

    private static int flags(Map<String, Object> parameters) {
        int flags = booleanValue(parameters.get("enabled"), false) ? 1 : 0;
        if (booleanValue(parameters.get("compressorEnabled"), false)) flags |= 2;
        if (booleanValue(parameters.get("limiterEnabled"), false)) flags |= 4;
        if (booleanValue(parameters.get("reverbEnabled"), false)) flags |= 8;
        if (booleanValue(parameters.get("upmixEnabled"), false)) flags |= 0x10;
        if (booleanValue(parameters.get("obrEnabled"), false)) flags |= 0x20;
        return flags;
    }

    private static float[] nativeValues(Map<String, Object> p) {
        float[] values = new float[44];
        values[0] = floatValue(p.get("inputGainDb"));
        values[1] = floatValue(p.get("outputGainDb"));
        values[2] = floatValue(p.get("balance"));
        List<Object> eq = SimpleJson.asList(p.get("eqDb"));
        for (int index = 0; index < EQ_BANDS; index += 1) {
            values[3 + index] = floatValue(eq.get(index));
        }
        values[13] = floatValue(p.get("stereoWidth"));
        values[14] = floatValue(p.get("centerGain"));
        values[15] = floatValue(p.get("surroundGain"));
        values[16] = floatValue(p.get("lfeGain"));
        values[17] = floatValue(p.get("compressorThresholdDb"));
        values[18] = floatValue(p.get("compressorRatio"));
        values[19] = floatValue(p.get("compressorAttackMs"));
        values[20] = floatValue(p.get("compressorReleaseMs"));
        values[21] = floatValue(p.get("compressorKneeDb"));
        values[22] = floatValue(p.get("compressorMakeupDb"));
        values[23] = floatValue(p.get("limiterCeilingDb"));
        values[24] = floatValue(p.get("limiterReleaseMs"));
        values[25] = floatValue(p.get("reverbRoomSize"));
        values[26] = floatValue(p.get("reverbDecayMs"));
        values[27] = floatValue(p.get("reverbDamping"));
        values[28] = floatValue(p.get("reverbPreDelayMs"));
        values[29] = floatValue(p.get("reverbWet"));
        values[30] = floatValue(p.get("reverbDry"));
        values[31] = switch (stringValue(p.get("upmixAlgorithm"), "matrix-decode")) {
            case "passive" -> 0.0f;
            case "ambient-extract" -> 2.0f;
            default -> 1.0f;
        };
        values[32] = "7.1".equals(p.get("upmixOutputLayout")) ? 8.0f : 6.0f;
        values[33] = floatValue(p.get("upmixCenterWidthHz"));
        values[34] = floatValue(p.get("upmixLfeCrossoverHz"));
        values[35] = floatValue(p.get("upmixLfeGain"));
        values[36] = floatValue(p.get("upmixCenterGain"));
        values[37] = floatValue(p.get("upmixSurroundGain"));
        values[38] = floatValue(p.get("upmixDecorrelation"));
        values[39] = switch (stringValue(p.get("obrFilterProfile"), "direct")) {
            case "ambient" -> 1.0f;
            case "reverberant" -> 2.0f;
            default -> 0.0f;
        };
        values[40] = floatValue(p.get("obrWet"));
        values[41] = floatValue(p.get("obrDry"));
        values[42] = floatValue(p.get("obrOutputGainDb"));
        values[43] = floatValue(p.get("obrSpatialWidth"));
        return values;
    }

    private static float floatValue(Object value) {
        return ((Number) value).floatValue();
    }

    private static Map<String, Object> immutableParameters(Map<String, Object> source) {
        return Map.copyOf(copyParameters(source));
    }

    private static Map<String, Object> copyParameters(Map<String, Object> source) {
        Map<String, Object> copy = new LinkedHashMap<>();
        for (String key : PARAMETER_KEYS) {
            Object value = source.get(key);
            copy.put(key, value instanceof List<?> list ? List.copyOf(list) : value);
        }
        return copy;
    }

    private static Map<String, Object> copyMap(Map<String, Object> source) {
        Map<String, Object> copy = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : source.entrySet()) {
            Object value = entry.getValue();
            if (value instanceof Map<?, ?> map) {
                copy.put(entry.getKey(), copyMap(SimpleJson.asMap(map)));
            } else if (value instanceof List<?> list) {
                copy.put(entry.getKey(), List.copyOf(list));
            } else {
                copy.put(entry.getKey(), value);
            }
        }
        return copy;
    }

    private static Map<String, Object> copyMapValue(Object value) {
        return value instanceof Map<?, ?> ? copyMap(SimpleJson.asMap(value)) : new LinkedHashMap<>();
    }

    private static boolean booleanValue(Object value, boolean fallback) {
        return value instanceof Boolean bool ? bool : fallback;
    }

    private static long longValue(Object value, long fallback) {
        return value instanceof Number number ? number.longValue() : fallback;
    }

    private static String stringValue(Object value, String fallback) {
        return value instanceof String string && !string.isBlank() ? string : fallback;
    }

    private static Map<String, Bounds> numericBounds() {
        Map<String, Bounds> bounds = new LinkedHashMap<>();
        bounds.put("inputGainDb", new Bounds(-24.0, 24.0));
        bounds.put("outputGainDb", new Bounds(-24.0, 24.0));
        bounds.put("balance", new Bounds(-1.0, 1.0));
        bounds.put("stereoWidth", new Bounds(0.0, 2.0));
        bounds.put("centerGain", new Bounds(0.0, 2.0));
        bounds.put("surroundGain", new Bounds(0.0, 2.0));
        bounds.put("lfeGain", new Bounds(0.0, 2.0));
        bounds.put("compressorThresholdDb", new Bounds(-60.0, 0.0));
        bounds.put("compressorRatio", new Bounds(1.0, 20.0));
        bounds.put("compressorAttackMs", new Bounds(0.1, 200.0));
        bounds.put("compressorReleaseMs", new Bounds(10.0, 2000.0));
        bounds.put("compressorKneeDb", new Bounds(0.0, 24.0));
        bounds.put("compressorMakeupDb", new Bounds(0.0, 24.0));
        bounds.put("limiterCeilingDb", new Bounds(-12.0, 0.0));
        bounds.put("limiterReleaseMs", new Bounds(10.0, 1000.0));
        bounds.put("reverbRoomSize", new Bounds(0.0, 1.0));
        bounds.put("reverbDecayMs", new Bounds(50.0, 5000.0));
        bounds.put("reverbDamping", new Bounds(0.0, 1.0));
        bounds.put("reverbPreDelayMs", new Bounds(0.0, 200.0));
        bounds.put("reverbWet", new Bounds(0.0, 1.0));
        bounds.put("reverbDry", new Bounds(0.0, 1.0));
        bounds.put("upmixCenterWidthHz", new Bounds(20.0, 20_000.0));
        bounds.put("upmixLfeCrossoverHz", new Bounds(20.0, 500.0));
        bounds.put("upmixCenterGain", new Bounds(0.0, 2.0));
        bounds.put("upmixSurroundGain", new Bounds(0.0, 2.0));
        bounds.put("upmixLfeGain", new Bounds(0.0, 2.0));
        bounds.put("upmixDecorrelation", new Bounds(0.0, 1.0));
        bounds.put("obrWet", new Bounds(0.0, 1.0));
        bounds.put("obrDry", new Bounds(0.0, 1.0));
        bounds.put("obrOutputGainDb", new Bounds(-12.0, 0.0));
        bounds.put("obrSpatialWidth", new Bounds(0.0, 2.0));
        return Map.copyOf(bounds);
    }

    private static LinkedHashMap<String, Preset> presetsV1() {
        LinkedHashMap<String, Preset> presets = new LinkedHashMap<>();
        Map<String, Object> clean = cleanParameters();
        putPreset(presets, "clean", "纯净", clean);

        Map<String, Object> bathroom = copyParameters(clean);
        bathroom.put("reverbEnabled", true);
        bathroom.put("reverbRoomSize", 0.22);
        bathroom.put("reverbDecayMs", 650.0);
        bathroom.put("reverbDamping", 0.35);
        bathroom.put("reverbPreDelayMs", 8.0);
        bathroom.put("reverbWet", 0.32);
        bathroom.put("reverbDry", 0.82);
        setEq(bathroom, 7, 1.5);
        putPreset(presets, "bathroom", "浴室", bathroom);

        Map<String, Object> hall = copyParameters(clean);
        hall.put("reverbEnabled", true);
        hall.put("reverbRoomSize", 0.82);
        hall.put("reverbDecayMs", 2800.0);
        hall.put("reverbDamping", 0.62);
        hall.put("reverbPreDelayMs", 28.0);
        hall.put("reverbWet", 0.36);
        hall.put("reverbDry", 0.88);
        putPreset(presets, "hall", "大厅", hall);

        Map<String, Object> surround = copyParameters(clean);
        surround.put("inputGainDb", -6.0);
        surround.put("stereoWidth", 1.2);
        surround.put("upmixEnabled", true);
        surround.put("upmixAlgorithm", "matrix-decode");
        surround.put("upmixOutputLayout", "7.1");
        surround.put("upmixCenterGain", 0.68);
        surround.put("upmixSurroundGain", 0.52);
        surround.put("upmixLfeGain", 0.48);
        surround.put("obrEnabled", true);
        surround.put("obrFilterProfile", "direct");
        surround.put("obrSpatialWidth", 1.3);
        putPreset(presets, "surround-3d", "3D环绕", surround);

        Map<String, Object> cinema = copyParameters(clean);
        cinema.put("inputGainDb", -1.5);
        setEq(cinema, 1, 2.0);
        setEq(cinema, 2, 1.5);
        setEq(cinema, 6, 1.0);
        cinema.put("centerGain", 1.12);
        cinema.put("surroundGain", 1.18);
        cinema.put("lfeGain", 1.22);
        cinema.put("compressorEnabled", true);
        cinema.put("compressorThresholdDb", -16.0);
        cinema.put("compressorRatio", 2.2);
        cinema.put("compressorMakeupDb", 1.0);
        putPreset(presets, "cinema", "影院", cinema);

        Map<String, Object> vocal = copyParameters(clean);
        setEq(vocal, 0, -2.0);
        setEq(vocal, 1, -1.5);
        setEq(vocal, 5, 2.0);
        setEq(vocal, 6, 3.0);
        setEq(vocal, 7, 1.5);
        vocal.put("centerGain", 1.15);
        vocal.put("compressorEnabled", true);
        vocal.put("compressorThresholdDb", -20.0);
        vocal.put("compressorRatio", 2.0);
        vocal.put("compressorMakeupDb", 1.0);
        putPreset(presets, "vocal-clear", "人声清晰", vocal);

        Map<String, Object> bass = copyParameters(clean);
        bass.put("inputGainDb", -1.0);
        setEq(bass, 0, 4.0);
        setEq(bass, 1, 4.5);
        setEq(bass, 2, 3.0);
        bass.put("lfeGain", 1.3);
        bass.put("limiterCeilingDb", -0.8);
        putPreset(presets, "bass-boost", "低频增强", bass);

        Map<String, Object> night = copyParameters(clean);
        night.put("inputGainDb", -3.0);
        night.put("outputGainDb", -2.0);
        night.put("compressorEnabled", true);
        night.put("compressorThresholdDb", -28.0);
        night.put("compressorRatio", 6.0);
        night.put("compressorAttackMs", 5.0);
        night.put("compressorReleaseMs", 350.0);
        night.put("compressorKneeDb", 10.0);
        night.put("compressorMakeupDb", 3.0);
        night.put("limiterCeilingDb", -3.0);
        putPreset(presets, "night", "夜间", night);
        return presets;
    }

    private static Map<String, Object> cleanParameters() {
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
        p.put("upmixEnabled", false);
        p.put("upmixAlgorithm", "matrix-decode");
        p.put("upmixOutputLayout", "5.1");
        p.put("upmixCenterWidthHz", 300.0);
        p.put("upmixLfeCrossoverHz", 120.0);
        p.put("upmixCenterGain", 0.707);
        p.put("upmixSurroundGain", 0.5);
        p.put("upmixLfeGain", 0.707);
        p.put("upmixDecorrelation", 0.7);
        p.put("obrEnabled", false);
        p.put("obrFilterProfile", "direct");
        p.put("obrWet", 1.0);
        p.put("obrDry", 0.0);
        p.put("obrOutputGainDb", 0.0);
        p.put("obrSpatialWidth", 1.0);
        return p;
    }

    private static void setEq(Map<String, Object> parameters, int index, double value) {
        List<Object> eq = new ArrayList<>(SimpleJson.asList(parameters.get("eqDb")));
        eq.set(index, value);
        parameters.put("eqDb", List.copyOf(eq));
    }

    private static void putPreset(
        LinkedHashMap<String, Preset> presets,
        String id,
        String label,
        Map<String, Object> parameters
    ) {
        presets.put(id, new Preset(id, label, immutableParameters(parameters)));
    }

    private static void restrictOwnerOnly(Path path) throws IOException {
        if (!Files.exists(path)) return;
        if (FileSystems.getDefault().supportedFileAttributeViews().contains("posix")) {
            EnumSet<PosixFilePermission> permissions = EnumSet.of(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE
            );
            if (Files.isDirectory(path)) permissions.add(PosixFilePermission.OWNER_EXECUTE);
            Files.setPosixFilePermissions(path, permissions);
            return;
        }
        AclFileAttributeView view = Files.getFileAttributeView(path, AclFileAttributeView.class);
        if (view == null) throw new IOException("owner-only ACLs are unavailable");
        UserPrincipal owner = Files.getOwner(path);
        AclEntry ownerEntry = AclEntry.newBuilder()
            .setType(AclEntryType.ALLOW)
            .setPrincipal(owner)
            .setPermissions(EnumSet.allOf(AclEntryPermission.class))
            .build();
        view.setAcl(List.of(ownerEntry));
    }

    public static final class RevisionConflictException extends IllegalArgumentException {
        private final long currentRevision;

        RevisionConflictException(long currentRevision) {
            super("audio mixer revision conflict");
            this.currentRevision = currentRevision;
        }

        public long currentRevision() {
            return currentRevision;
        }
    }

    private record Bounds(double minimum, double maximum) {
    }

    private record Preset(String id, String label, Map<String, Object> parameters) {
    }

    private record MixerState(long revision, String selectedPreset, Map<String, Object> parameters) {
    }

    private record ChannelNativeSubmission(
        long revision,
        int outputChannels,
        int algorithm,
        float[] values
    ) {
    }

    private record ChannelRouterState(
        long revision,
        String selectedLayout,
        Map<String, ChannelLayoutState> layouts
    ) {
    }

    private record ChannelLayoutState(
        String algorithm,
        double lfeCrossoverHz,
        List<Object> channelGainDb,
        List<Object> channelDelayMs,
        List<Object> channelAzimuthDeg,
        List<Object> customMatrix
    ) {
        private ChannelLayoutState {
            channelGainDb = List.copyOf(channelGainDb);
            channelDelayMs = List.copyOf(channelDelayMs);
            channelAzimuthDeg = List.copyOf(channelAzimuthDeg);
            customMatrix = List.copyOf(customMatrix);
        }
    }
}
