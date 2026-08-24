package com.femonster.core;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Regression probe for the atomic spatial -> router -> Mixer transaction.
 *
 * <p>The service intentionally pauses after the combined native submit
 * returns, then sends PCM. The observed target graph must already contain the
 * desired custom router snapshot; no split-submit window may exist.</p>
 */
public final class NativeAudioChannelRouterTransactionProbe {
    private NativeAudioChannelRouterTransactionProbe() {
    }

    public static void main(String[] args) throws Exception {
        boolean expectStartupReplayFailure = args.length > 1
            && "startup-replay-failure".equals(args[1]);
        Path root = Path.of(args.length > 0
                ? args[0]
                : "E:/FE_audio_tmp/native-channel-router-transaction")
            .toAbsolutePath()
            .normalize();
        Files.createDirectories(root);
        NativeAudioEngine engine = new NativeAudioEngine(ProjectPaths.detect());
        require(engine.available(), "compiled JNI bridge must load");
        PausingBridge bridge = new PausingBridge(engine);
        AudioMixerService service = new AudioMixerService(
            root.resolve("audio-mixer-state.json"),
            bridge
        );

        Map<String, Object> enabled = service.patch(
            service.snapshot().get("revision"),
            Map.of(
                "upmixEnabled", true,
                "upmixAlgorithm", "matrix-decode",
                "upmixOutputLayout", "5.1"
            )
        );
        if (expectStartupReplayFailure) {
            // Deliberately cache a valid 7.1 router beside the desired 5.1
            // spatial/Mixer snapshot while no graph exists. Native replay
            // stages spatial first, then rejects this mismatched router. The
            // Java startup path must destroy that unpublished graph.
            engine.setChannelRouterParameters(999L, 8, 3, validSevenOneRouterValues());
        }
        Map<String, Object> started = engine.startSpatialStream(48_000, 2, 6, 1);
        if (expectStartupReplayFailure) {
            require(!Boolean.TRUE.equals(started.get("ok")),
                "injected atomic startup replay failure must reject the session");
            require(!String.valueOf(started.get("error")).isBlank(),
                "startup error must preserve the native failure result");
            Map<String, Object> stopped = engine.spatialPayload();
            require(!Boolean.TRUE.equals(stopped.get("active")),
                "failed startup replay must destroy the unpublished native graph");
            require(((Number) stopped.get("session")).longValue() == 0L,
                "failed startup replay must not publish a Java session");
            engine.close();
            System.out.println("NativeAudioChannelRouterTransactionProbe startup failure passed");
            return;
        }
        require(Boolean.TRUE.equals(started.get("ok")), "5.1 stream must start");
        long session = ((Number) started.get("session")).longValue();
        long generation = ((Number) started.get("generation")).longValue();
        submitTransitionBlocks(engine, session, generation, "warm-up");

        int combinedBeforeChannelPatch = bridge.combinedSubmitCount();
        int standaloneBeforeChannelPatch = bridge.standaloneChannelSubmitCount();
        Map<String, Object> seven = service.patchChannels(
            service.channelSnapshot().get("revision"),
            Map.of("layout", "7.1", "algorithm", "custom-matrix")
        );
        require("custom-matrix".equals(seven.get("algorithm")),
            "target 7.1 custom router must be persisted before the switch");
        require(bridge.combinedSubmitCount() == combinedBeforeChannelPatch + 1
                && bridge.standaloneChannelSubmitCount() == standaloneBeforeChannelPatch,
            "RED_CHANNEL_PATCH_CANCELS_COMBINED_RETRY: channel PATCH must replace the "
                + "whole Mixer/router transaction instead of invalidating it with a standalone submit");

        bridge.arm();
        AtomicReference<Throwable> patchFailure = new AtomicReference<>();
        Thread patchThread = new Thread(() -> {
            try {
                service.patch(
                    enabled.get("revision"),
                    Map.of("upmixOutputLayout", "7.1")
                );
            } catch (Throwable failure) {
                patchFailure.set(failure);
            }
        }, "channel-router-transaction-patch");
        patchThread.start();

        Map<String, Object> interstitial;
        Map<String, Object> finalStatus;
        try {
            require(bridge.awaitSpatialMixerApplied(),
                "service did not expose the split-submit window");
            // This call can acquire NativeAudioEngine and the native mutex
            // because setMixerParameters already returned while the service
            // has not yet called setChannelRouterParameters.
            submitTransitionBlocks(engine, session, generation, "interstitial");
            interstitial = engine.channelRouterPayload();
        } finally {
            bridge.allowRouterSubmit();
            patchThread.join(10_000L);
        }
        require(!patchThread.isAlive(), "layout patch thread did not finish");
        if (patchFailure.get() != null) {
            throw new IllegalStateException("layout patch failed", patchFailure.get());
        }
        submitTransitionBlocks(engine, session, generation, "post-router");
        finalStatus = engine.channelRouterPayload();
        engine.stopSpatialStream(session, generation);
        engine.close();

        int interstitialLayout = ((Number) interstitial.get("outputChannels")).intValue();
        int interstitialAlgorithm = ((Number) interstitial.get("algorithm")).intValue();
        long interstitialRevision = ((Number) interstitial.get("activeRevision")).longValue();
        int finalAlgorithm = ((Number) finalStatus.get("algorithm")).intValue();
        boolean targetRouterWasAtomic = interstitialLayout == 8
            && interstitialAlgorithm == 3;
        if (!targetRouterWasAtomic) {
            throw new IllegalStateException(
                "RED_INTERSTITIAL_DEFAULT_ROUTER: target=7.1/custom-matrix, "
                    + "interstitialLayout=" + interstitialLayout
                    + ", interstitialAlgorithm=" + interstitialAlgorithm
                    + ", interstitialRevision=" + interstitialRevision
                    + ", finalAlgorithm=" + finalAlgorithm
                    + "; spatial/router/mixer must be one native transaction"
            );
        }
        System.out.println("NativeAudioChannelRouterTransactionProbe passed");
    }

    private static float[] stereoImpulse() {
        float[] pcm = new float[512];
        pcm[0] = 0.25f;
        pcm[1] = -0.20f;
        return pcm;
    }

    private static float[] validSevenOneRouterValues() {
        float[] values = new float[41];
        values[0] = 80.0f;
        float[] azimuths = {30.0f, -30.0f, 0.0f, 0.0f, 135.0f, -135.0f, 90.0f, -90.0f};
        float[] matrix = {
            1.0f, 0.0f, 0.0f, 1.0f, 0.5f, 0.5f, 0.18f, 0.18f,
            0.38f, -0.38f, -0.38f, 0.38f, 0.52f, -0.52f, -0.52f, 0.52f
        };
        System.arraycopy(azimuths, 0, values, 17, azimuths.length);
        System.arraycopy(matrix, 0, values, 25, matrix.length);
        return values;
    }

    private static void submitTransitionBlocks(
        NativeAudioEngine engine,
        long session,
        long generation,
        String phase
    ) {
        // The production route uses a 20 ms (960 frame at 48 kHz) bounded
        // fade/rebuild. Eight 256-frame blocks cross that boundary while the
        // control thread is deliberately paused.
        for (int index = 0; index < 8; index += 1) {
            require(engine.submitSpatialPcm(session, generation, stereoImpulse()) >= 0,
                phase + " PCM block " + index + " was not accepted");
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }

    private static final class PausingBridge implements AudioMixerService.NativeBridge {
        private final NativeAudioEngine engine;
        private volatile boolean armed;
        private int combinedSubmits;
        private int standaloneChannelSubmits;
        private final CountDownLatch spatialMixerApplied = new CountDownLatch(1);
        private final CountDownLatch routerMaySubmit = new CountDownLatch(1);

        private PausingBridge(NativeAudioEngine engine) {
            this.engine = engine;
        }

        void arm() {
            armed = true;
        }

        boolean awaitSpatialMixerApplied() throws InterruptedException {
            return spatialMixerApplied.await(10, TimeUnit.SECONDS);
        }

        void allowRouterSubmit() {
            routerMaySubmit.countDown();
        }

        synchronized int combinedSubmitCount() {
            return combinedSubmits;
        }

        synchronized int standaloneChannelSubmitCount() {
            return standaloneChannelSubmits;
        }

        @Override
        public Map<String, Object> submit(long revision, int flags, float[] values) {
            Map<String, Object> result = engine.setMixerParameters(revision, flags, values);
            pauseAfterControlTransaction();
            return result;
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
            synchronized (this) {
                combinedSubmits += 1;
            }
            Map<String, Object> result = engine.setMixerAndChannelParameters(
                mixerRevision,
                flags,
                mixerValues,
                channelRevision,
                outputChannels,
                algorithm,
                channelValues
            );
            pauseAfterControlTransaction();
            return result;
        }

        private void pauseAfterControlTransaction() {
            if (armed) {
                armed = false;
                spatialMixerApplied.countDown();
                try {
                    if (!routerMaySubmit.await(10, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("router-submit pause timed out");
                    }
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("router-submit pause interrupted", interrupted);
                }
            }
        }

        @Override
        public Map<String, Object> status() {
            return engine.mixerPayload();
        }

        @Override
        public Map<String, Object> submitChannels(
            long revision,
            int outputChannels,
            int algorithm,
            float[] values
        ) {
            synchronized (this) {
                standaloneChannelSubmits += 1;
            }
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
    }
}
