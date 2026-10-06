package com.femonster.core;

import java.lang.reflect.Method;
import java.nio.ByteBuffer;
import java.nio.file.Path;

/** Exercises the actual JNI signatures without initializing any audio device. */
public final class NativeSpatialGenerationAbiProbe {
    private static final int E_HANDLE = (int) 0x80070006L;
    private static final int E_INVALIDARG = (int) 0x80070057L;

    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("isolated DLL path required");
        System.load(Path.of(args[0]).toAbsolutePath().toString());
        check("nativeInitializeSpatialGeneration", new Class<?>[] {long.class}, E_HANDLE, 1L);
        check("nativeInitializeSpatialGeneration", new Class<?>[] {long.class}, E_INVALIDARG, 0L);
        check("nativeSubmitSpatialPcmGeneration",
            new Class<?>[] {float[].class, int.class, long.class}, E_HANDLE, new float[2], 1, 1L);
        check("nativeSubmitSpatialPcmDirectGeneration",
            new Class<?>[] {ByteBuffer.class, int.class, long.class, long.class},
            E_HANDLE, ByteBuffer.allocateDirect(8), 1, 1L, 0L);
        check("nativeResetSpatialTimelineGeneration",
            new Class<?>[] {long.class, long.class}, E_HANDLE, 1L, 2L);
        check("nativeResetSpatialTimelineGeneration",
            new Class<?>[] {long.class, long.class}, E_INVALIDARG, 1L, 1L);
        check("nativeSetSpatialOutputGain",
            new Class<?>[] {long.class, long.class, float.class, long.class},
            E_HANDLE, 1L, 1L, 0.5f, System.currentTimeMillis() + 1_000);
        check("nativeSetSpatialOutputGain",
            new Class<?>[] {long.class, long.class, float.class, long.class},
            E_INVALIDARG, 1L, 1L, Float.NaN, System.currentTimeMillis() + 1_000);
        check("nativeRenewSpatialOutputGainLease",
            new Class<?>[] {long.class, long.class, long.class},
            E_HANDLE, 1L, 1L, System.currentTimeMillis() + 1_000);
        check("nativeRenewSpatialOutputGainLease",
            new Class<?>[] {long.class, long.class, long.class},
            E_INVALIDARG, 1L, 0L, System.currentTimeMillis() + 1_000);
        System.out.println("Native generation/gain-lease JNI ABI PASS: current Java + isolated DLL; no audio device initialized");
    }

    private static void check(String name, Class<?>[] parameterTypes, int expected, Object... args)
        throws Exception {
        Method method = NativeAudioEngine.class.getDeclaredMethod(name, parameterTypes);
        method.setAccessible(true);
        int actual = (Integer) method.invoke(null, args);
        if (actual != expected) {
            throw new AssertionError(name + " returned " + actual + ", expected " + expected);
        }
    }
}
