package com.femonster.memory;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Locale;

public final class WindowsDpapiKeyProtector implements KeyProtector {
    private static final String DLL_NAME = "fe-monster-wincrypto.dll";
    private static final int MAX_PLAINTEXT_BYTES = 4_096;
    private static final int MAX_ENTROPY_BYTES = 4_096;
    private static final int MAX_PROTECTED_BYTES = 65_536;
    private static final Object LOAD_LOCK = new Object();
    private static volatile boolean loaded;

    public WindowsDpapiKeyProtector(Path dllPath) {
        load(dllPath);
    }

    @Override
    public byte[] protect(byte[] plaintext, byte[] entropy) {
        validate(plaintext, MAX_PLAINTEXT_BYTES);
        validate(entropy, MAX_ENTROPY_BYTES);
        byte[] plaintextCopy = plaintext.clone();
        byte[] entropyCopy = entropy.clone();
        try {
            byte[] protectedBytes = nativeProtect(plaintextCopy, entropyCopy);
            if (protectedBytes == null || protectedBytes.length == 0 || protectedBytes.length > MAX_PROTECTED_BYTES) {
                clear(protectedBytes);
                throw new IllegalStateException("DPAPI_PROTECT_FAILED");
            }
            return protectedBytes;
        } catch (UnsatisfiedLinkError | SecurityException failure) {
            throw new IllegalStateException("DPAPI_UNAVAILABLE");
        } finally {
            clear(plaintextCopy);
            clear(entropyCopy);
        }
    }

    @Override
    public byte[] unprotect(byte[] protectedBytes, byte[] entropy) {
        validate(protectedBytes, MAX_PROTECTED_BYTES);
        validate(entropy, MAX_ENTROPY_BYTES);
        byte[] protectedCopy = protectedBytes.clone();
        byte[] entropyCopy = entropy.clone();
        try {
            byte[] plaintext = nativeUnprotect(protectedCopy, entropyCopy);
            if (plaintext == null || plaintext.length == 0 || plaintext.length > MAX_PLAINTEXT_BYTES) {
                clear(plaintext);
                throw new IllegalStateException("DPAPI_INTEGRITY_FAILED");
            }
            return plaintext;
        } catch (UnsatisfiedLinkError | SecurityException failure) {
            throw new IllegalStateException("DPAPI_UNAVAILABLE");
        } finally {
            clear(protectedCopy);
            clear(entropyCopy);
        }
    }

    private static void load(Path dllPath) {
        boolean loadable;
        try {
            loadable = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("windows")
                && dllPath != null
                && dllPath.getFileName() != null
                && DLL_NAME.equalsIgnoreCase(dllPath.getFileName().toString())
                && Files.isRegularFile(dllPath);
        } catch (SecurityException failure) {
            loadable = false;
        }
        if (!loadable) {
            throw new IllegalStateException("DPAPI_UNAVAILABLE");
        }
        if (loaded) return;
        synchronized (LOAD_LOCK) {
            if (loaded) return;
            try {
                System.load(dllPath.toAbsolutePath().normalize().toString());
                loaded = true;
            } catch (UnsatisfiedLinkError | SecurityException failure) {
                throw new IllegalStateException("DPAPI_UNAVAILABLE");
            }
        }
    }

    private static void validate(byte[] value, int maximumLength) {
        if (value == null || value.length == 0 || value.length > maximumLength) {
            throw new IllegalArgumentException("DPAPI_INVALID_INPUT");
        }
    }

    private static void clear(byte[] value) {
        if (value != null) Arrays.fill(value, (byte) 0);
    }

    private static native byte[] nativeProtect(byte[] plaintext, byte[] entropy);

    private static native byte[] nativeUnprotect(byte[] protectedBytes, byte[] entropy);
}
