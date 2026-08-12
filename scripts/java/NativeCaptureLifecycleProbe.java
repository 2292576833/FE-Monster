package com.femonster.core;

import java.util.Map;

/** Verifies that loopback analysis is demand-driven and stops after inactivity. */
public final class NativeCaptureLifecycleProbe {
    private NativeCaptureLifecycleProbe() {
    }

    public static void main(String[] args) throws Exception {
        NativeAudioEngine engine = new NativeAudioEngine(ProjectPaths.detect());
        Map<String, Object> idle = engine.runtimePayload();
        boolean idleStopped = !Boolean.TRUE.equals(idle.get("captureRunning"));

        Map<String, Object> requested = engine.samplePayload();
        boolean demandStarted = Boolean.TRUE.equals(requested.get("captureRunning"));

        Thread.sleep(1_350L);
        Map<String, Object> expired = engine.runtimePayload();
        boolean idleExpired = !Boolean.TRUE.equals(expired.get("captureRunning"));

        Map<String, Object> restarted = engine.samplePayload();
        boolean demandRestarted = Boolean.TRUE.equals(restarted.get("captureRunning"));
        engine.close();
        boolean stoppedOnClose = !Boolean.TRUE.equals(engine.runtimePayload().get("captureRunning"));

        boolean pass = Boolean.TRUE.equals(idle.get("active"))
            && idleStopped
            && demandStarted
            && idleExpired
            && demandRestarted
            && stoppedOnClose;
        System.out.println("{"
            + "\"pass\":" + pass
            + ",\"idleStopped\":" + idleStopped
            + ",\"demandStarted\":" + demandStarted
            + ",\"idleExpired\":" + idleExpired
            + ",\"demandRestarted\":" + demandRestarted
            + ",\"stoppedOnClose\":" + stoppedOnClose
            + "}");
        if (!pass) System.exit(1);
    }
}
