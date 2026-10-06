package com.femonster.core;

import java.lang.reflect.Field;
import java.util.LinkedHashMap;
import java.util.Map;
import com.femonster.json.SimpleJson;

/** Exercises production Java fencing with JNI-only substitutes; no audio device is opened. */
public final class NativeSpatialOutputGainLeaseProbe {
    private static int gainCalls, renewCalls, resetCalls, stopCalls, nativeResult;
    private static boolean active = true, unavailable;
    private static long receivedGeneration, receivedSequence, receivedExpiresAt;
    private static float receivedGain;
    private static final Map<String, Boolean> checks = new LinkedHashMap<>();

    static int nativeGain(long generation, long sequence, float gain, long expiresAt) {
        gainCalls++;
        receivedGeneration = generation;
        receivedSequence = sequence;
        receivedGain = gain;
        receivedExpiresAt = expiresAt;
        if (unavailable) throw new UnsatisfiedLinkError("fixture unavailable JNI");
        return nativeResult;
    }

    static int nativeRenew(long generation, long sequence, long expiresAt) {
        renewCalls++;
        receivedGeneration = generation;
        receivedSequence = sequence;
        receivedExpiresAt = expiresAt;
        if (unavailable) throw new UnsatisfiedLinkError("fixture unavailable JNI");
        return nativeResult;
    }

    static int nativeReset(long generation, long nextGeneration) {
        resetCalls++;
        return nativeResult;
    }

    static double[] nativeStatus() {
        double[] values = new double[32];
        values[0] = active ? 1 : 0;
        values[1] = values[2] = 1;
        values[3] = 48000;
        values[4] = values[5] = values[6] = 2;
        return values;
    }

    static void nativeStop() { stopCalls++; active = false; }

    private static void set(NativeAudioEngine engine, String name, Object value) throws Exception {
        Field field = NativeAudioEngine.class.getDeclaredField(name);
        field.setAccessible(true);
        field.set(engine, value);
    }

    private static long number(Map<String, Object> status, String key) {
        return ((Number) status.get(key)).longValue();
    }

    private static double gain(NativeAudioEngine engine) {
        return ((Number) engine.spatialPayload().get("outputGain")).doubleValue();
    }

    private static void check(String name, boolean pass) {
        checks.put(name, pass);
        if (!pass) throw new AssertionError(name + " failed; completed checks: " + checks);
    }

    private static void rejected(NativeAudioEngine engine, long session, long generation,
                                 long sequence, double gain, long expiresAt) {
        int before = gainCalls;
        Map<String, Object> result = engine.setSpatialOutputGain(session, generation, sequence, gain, expiresAt);
        if (Boolean.TRUE.equals(result.get("ok")) || gainCalls != before) {
            throw new AssertionError("invalid gain command reached JNI: " + result);
        }
    }

    private static void ignored(NativeAudioEngine engine, long session, long generation, long sequence) {
        int before = gainCalls;
        Map<String, Object> result = engine.setSpatialOutputGain(session, generation, sequence, .5,
            System.currentTimeMillis() + 1500);
        if (!Boolean.TRUE.equals(result.get("ignored")) || gainCalls != before) {
            throw new AssertionError("stale command was not fenced: " + result);
        }
    }

    public static void main(String[] arguments) throws Exception {
        String originalOs = System.getProperty("os.name");
        System.setProperty("os.name", "fixture-no-native-audio");
        NativeAudioEngine engine;
        try { engine = new NativeAudioEngine(ProjectPaths.detect()); }
        finally { System.setProperty("os.name", originalOs); }
        set(engine, "available", true);
        set(engine, "activeSpatialSession", 7L);
        set(engine, "activeSpatialGeneration", 11L);
        set(engine, "spatialGenerationCounter", 11L);
        set(engine, "spatialSampleRate", 48000);
        set(engine, "spatialInputChannels", 2);
        try {
            long expires = System.currentTimeMillis() + 1500;
            Map<String, Object> first = engine.setSpatialOutputGain(7, 11, 1, .5, expires);
            check("acceptedGainAcknowledged", Boolean.TRUE.equals(first.get("ok")) && gainCalls == 1
                && receivedGeneration == 11 && receivedSequence == 1 && receivedGain == .5f
                && receivedExpiresAt == expires && gain(engine) == .5
                && number(first, "gainSequence") == 1 && number(first, "gainLeaseExpiresAt") == expires);

            for (double value : new double[] {Double.NaN, Double.POSITIVE_INFINITY,
                Double.NEGATIVE_INFINITY, -.01, 1.01}) {
                rejected(engine, 7, 11, 2, value, System.currentTimeMillis() + 1500);
            }
            rejected(engine, 7, 11, 0, .5, System.currentTimeMillis() + 1500);
            rejected(engine, 7, 11, -1, .5, System.currentTimeMillis() + 1500);
            rejected(engine, 7, 11, 2, .5, System.currentTimeMillis() - 1);
            rejected(engine, 7, 11, 2, .5, System.currentTimeMillis() + 3000);
            check("invalidInputsCannotReachNative", gainCalls == 1 && gain(engine) == .5);
            ignored(engine, 6, 11, 2);
            ignored(engine, 7, 10, 2);
            check("sessionAndGenerationFence", gainCalls == 1);

            Map<String, Object> advance = engine.setSpatialOutputGain(7, 11, 5, 1,
                System.currentTimeMillis() + 1500);
            check("newSequenceChangesGain", Boolean.TRUE.equals(advance.get("ok")) && gain(engine) == 1);
            ignored(engine, 7, 11, 4);
            rejected(engine, 7, 11, 5, .5, System.currentTimeMillis() + 1500);
            check("reorderedAndConflictingCommandsFenced", gainCalls == 2 && gain(engine) == 1);

            long renewed = System.currentTimeMillis() + 1700;
            check("currentPcmLeaseCanRenew", engine.renewSpatialOutputGainLease(7, 11, 5, renewed) >= 0
                && renewCalls == 1 && receivedGeneration == 11 && receivedSequence == 5
                && number(engine.spatialPayload(), "gainLeaseExpiresAt") == renewed);
            long[][] staleRenewals = {{6, 11, 5}, {7, 10, 5}, {7, 11, 4}, {7, 11, 6}, {7, 11, 0}};
            for (long[] values : staleRenewals) {
                if (engine.renewSpatialOutputGainLease(values[0], values[1], values[2], renewed) >= 0) {
                    throw new AssertionError("stale PCM renewed the output lease");
                }
            }
            check("onlyExactCurrentPcmSequenceRenews", renewCalls == 1 && gain(engine) == 1
                && number(engine.spatialPayload(), "gainLeaseExpiresAt") == renewed);
            check("invalidRenewalDeadlineRejected",
                engine.renewSpatialOutputGainLease(7, 11, 5, System.currentTimeMillis() - 1) < 0
                && engine.renewSpatialOutputGainLease(7, 11, 5, System.currentTimeMillis() + 3000) < 0
                && renewCalls == 1);
            engine.renewSpatialOutputGainLease(7, 11, 5, System.currentTimeMillis() + 500);
            check("olderRenewalCannotShortenLease", number(engine.spatialPayload(), "gainLeaseExpiresAt") == renewed);

            Map<String, Object> reset = engine.resetSpatialTimeline(7, 11);
            check("resetMutesClearsLeaseAndRetainsSequence", Boolean.TRUE.equals(reset.get("ok"))
                && resetCalls == 1 && number(reset, "generation") == 12
                && number(reset, "gainSequence") == 5 && number(reset, "gainLeaseExpiresAt") == 0
                && gain(engine) == 0);
            ignored(engine, 7, 11, 6);
            ignored(engine, 7, 12, 4);
            check("resetRejectsOldGenerationAndOldSequence",
                engine.renewSpatialOutputGainLease(7, 11, 5, System.currentTimeMillis() + 1500) < 0);
            int beforePrerollRenew = renewCalls;
            nativeResult = -31; // A reset must not ask native to renew its absent lease.
            check("resetPrerollRenewalIsIgnoredWithoutNativeCall",
                engine.renewSpatialOutputGainLease(7, 12, 5, System.currentTimeMillis() + 1500) == -1
                && renewCalls == beforePrerollRenew && gain(engine) == 0
                && number(engine.spatialPayload(), "gainLeaseExpiresAt") == 0
                && number(engine.spatialPayload(), "gainSequence") == 5);

            nativeResult = -23;
            Map<String, Object> failed = engine.setSpatialOutputGain(7, 12, 6, .5,
                System.currentTimeMillis() + 1500);
            check("deviceFailureDoesNotClaimAudibleGain", !Boolean.TRUE.equals(failed.get("ok"))
                && number(engine.spatialPayload(), "gainSequence") == 6 && gain(engine) == 0
                && number(engine.spatialPayload(), "gainLeaseExpiresAt") == 0);
            ignored(engine, 7, 12, 5);
            nativeResult = 0;
            check("newerSequenceRecoversAfterFailure", Boolean.TRUE.equals(engine.setSpatialOutputGain(7, 12, 7, .5,
                System.currentTimeMillis() + 1500).get("ok")) && gain(engine) == .5);
            long beforeFailure = number(engine.spatialPayload(), "gainLeaseExpiresAt");
            nativeResult = -31;
            int beforeStaleRenew = renewCalls;
            check("staleRenewalCannotInvalidateHealthyCurrentOwner",
                engine.renewSpatialOutputGainLease(6, 12, 7, System.currentTimeMillis() + 1500) == -1
                && engine.renewSpatialOutputGainLease(7, 11, 7, System.currentTimeMillis() + 1500) == -1
                && engine.renewSpatialOutputGainLease(7, 12, 6, System.currentTimeMillis() + 1500) == -1
                && renewCalls == beforeStaleRenew && gain(engine) == .5
                && number(engine.spatialPayload(), "gainLeaseExpiresAt") == beforeFailure);
            check("failedCurrentRenewalClearsNativeOwner", engine.renewSpatialOutputGainLease(7, 12, 7,
                System.currentTimeMillis() + 1800) == -31 && renewCalls == beforeStaleRenew + 1
                && number(engine.spatialPayload(), "gainLeaseExpiresAt") == 0 && gain(engine) == 0
                && number(engine.spatialPayload(), "gainSequence") == 7);
            check("lostLeaseDoesNotRepeatedlyTriggerRecovery",
                engine.renewSpatialOutputGainLease(7, 12, 7, System.currentTimeMillis() + 1500) == -1
                && renewCalls == beforeStaleRenew + 1);
            nativeResult = 0;
            check("newSequenceReestablishesLeaseAfterRenewalLoss", Boolean.TRUE.equals(
                engine.setSpatialOutputGain(7, 12, 8, .5, System.currentTimeMillis() + 1500).get("ok"))
                && gain(engine) == .5 && number(engine.spatialPayload(), "gainLeaseExpiresAt") > 0);
            unavailable = true;
            check("missingGainJniReturnsFailure", !Boolean.TRUE.equals(engine.setSpatialOutputGain(7, 12, 9, 1,
                System.currentTimeMillis() + 1500).get("ok")) && gain(engine) == .5);
            int beforeMissingJni = renewCalls;
            check("missingRenewJniClearsExistingLease", engine.renewSpatialOutputGainLease(7, 12, 8,
                System.currentTimeMillis() + 1500) == -3 && renewCalls == beforeMissingJni + 1
                && number(engine.spatialPayload(), "gainLeaseExpiresAt") == 0 && gain(engine) == 0);
            unavailable = false;

            check("recoveryAfterMissingJniCanReestablishOutput", Boolean.TRUE.equals(
                engine.setSpatialOutputGain(7, 12, 9, .5, System.currentTimeMillis() + 1500).get("ok"))
                && gain(engine) == .5);
            set(engine, "spatialGainLeaseExpiresAt", System.currentTimeMillis() - 1);
            check("expiredLeaseCannotReportAudibleOutput", gain(engine) == 0);
            Map<String, Object> paused = engine.pauseSpatialStream(7, 12);
            check("pauseClearsGainAndLease", Boolean.TRUE.equals(paused.get("paused")) && stopCalls == 1
                && gain(engine) == 0 && number(engine.spatialPayload(), "gainLeaseExpiresAt") == 0);
            ignored(engine, 7, 12, 99);
            check("disposedSessionCannotRenew", engine.renewSpatialOutputGainLease(7, 12, 9,
                System.currentTimeMillis() + 1500) < 0);
            System.out.println(SimpleJson.stringify(Map.of("pass", true, "checks", checks,
                "productionJavaCompiled", true, "jniOnlySubstitution", true, "audioDeviceOpened", false)));
        } finally { engine.close(); }
    }
}
