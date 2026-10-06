package com.femonster.memory;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Locale;

/** Stores the vault envelope in the current user's macOS login Keychain.
 * The on-disk protected-key file contains only an opaque Keychain reference. */
public final class MacKeychainKeyProtector implements KeyProtector {
    private static boolean loaded;

    public MacKeychainKeyProtector(Path library) {
        load(library);
    }

    private static synchronized void load(Path library) {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (!(os.contains("mac") || os.contains("darwin")) || library == null
            || !"libfe-monster-keychain.dylib".equals(library.getFileName().toString())
            || !Files.isRegularFile(library)) {
            throw new IllegalArgumentException("KEYCHAIN_UNAVAILABLE");
        }
        if (loaded) return;
        try {
            System.load(library.toAbsolutePath().normalize().toString());
            loaded = true;
        } catch (UnsatisfiedLinkError | SecurityException failure) {
            throw new IllegalArgumentException("KEYCHAIN_UNAVAILABLE");
        }
    }

    @Override public byte[] protect(byte[] plaintext, byte[] entropy) {
        return invoke(plaintext, entropy, true);
    }

    @Override public byte[] unprotect(byte[] reference, byte[] entropy) {
        return invoke(reference, entropy, false);
    }

    private byte[] invoke(byte[] input, byte[] entropy, boolean writing) {
        if (input == null || input.length == 0 || input.length > 4096
            || entropy == null || entropy.length == 0 || entropy.length > 4096) {
            throw new IllegalArgumentException("KEYCHAIN_INVALID_INPUT");
        }
        byte[] copy = input.clone(), context = entropy.clone();
        try {
            byte[] result = writing ? nativeProtect(copy, context) : nativeUnprotect(copy, context);
            if (result == null || result.length == 0 || result.length > 4096) {
                throw new IllegalStateException(writing ? "KEYCHAIN_PROTECT_FAILED" : "KEYCHAIN_INTEGRITY_FAILED");
            }
            return result;
        } catch (UnsatisfiedLinkError | SecurityException failure) {
            throw new IllegalStateException("KEYCHAIN_UNAVAILABLE");
        } finally {
            Arrays.fill(copy, (byte) 0);
            Arrays.fill(context, (byte) 0);
        }
    }

    private static native byte[] nativeProtect(byte[] plaintext, byte[] entropy);
    private static native byte[] nativeUnprotect(byte[] reference, byte[] entropy);
}
