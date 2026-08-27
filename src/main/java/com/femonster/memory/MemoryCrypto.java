package com.femonster.memory;

import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;

public final class MemoryCrypto implements AutoCloseable {
    private static final int KEY_BYTES = 32;
    private static final int NONCE_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;
    private static final int MAX_PLAINTEXT_BYTES = 1_048_576;
    private static final int MAX_AAD_BYTES = 16_384;
    private static final int MAX_MAC_INPUT_BYTES = 1_048_576;
    private static final int MAX_TOKEN_CODE_POINTS = 64;
    private static final String AES_TRANSFORMATION = "AES/GCM/NoPadding";
    private static final String HMAC_ALGORITHM = "HmacSHA256";
    private static final byte[] HKDF_SALT =
        "FE Monster Local AI Memory HKDF-SHA-256 v1".getBytes(StandardCharsets.UTF_8);

    private final SecureRandom random;
    private byte[] recordKey;
    private byte[] blindSearchKey;
    private byte[] backupAuthenticationKey;
    private byte[] syncEncryptionKey;

    public MemoryCrypto(byte[] masterKey) {
        this(masterKey, new SecureRandom());
    }

    MemoryCrypto(byte[] masterKey, SecureRandom random) {
        if (masterKey == null || masterKey.length != KEY_BYTES || random == null) {
            throw invalidInput();
        }
        this.random = random;
        byte[] inputKey = masterKey.clone();
        byte[] pseudorandomKey = null;
        try {
            pseudorandomKey = hkdfExtract(HKDF_SALT, inputKey);
            recordKey = hkdfExpand(pseudorandomKey, "record-encryption/v1", KEY_BYTES);
            blindSearchKey = hkdfExpand(pseudorandomKey, "blind-search/v1", KEY_BYTES);
            backupAuthenticationKey = hkdfExpand(pseudorandomKey, "backup-authentication/v1", KEY_BYTES);
            syncEncryptionKey = hkdfExpand(pseudorandomKey, "future-sync-encryption/v1", KEY_BYTES);
        } catch (GeneralSecurityException failure) {
            clearKeys();
            throw new IllegalStateException("MEMORY_CRYPTO_UNAVAILABLE");
        } finally {
            clear(inputKey);
            clear(pseudorandomKey);
        }
    }

    public synchronized Sealed seal(byte[] plaintext, byte[] aad) {
        ensureOpen();
        validateBytes(plaintext, MAX_PLAINTEXT_BYTES);
        validateBytes(aad, MAX_AAD_BYTES);
        byte[] plaintextCopy = plaintext.clone();
        byte[] aadCopy = aad.clone();
        byte[] nonce = new byte[NONCE_BYTES];
        try {
            random.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance(AES_TRANSFORMATION);
            cipher.init(
                Cipher.ENCRYPT_MODE,
                new SecretKeySpec(recordKey, "AES"),
                new GCMParameterSpec(128, nonce)
            );
            cipher.updateAAD(aadCopy);
            byte[] ciphertext = cipher.doFinal(plaintextCopy);
            return new Sealed(nonce, ciphertext);
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("MEMORY_ENCRYPTION_FAILED");
        } finally {
            clear(plaintextCopy);
            clear(aadCopy);
            clear(nonce);
        }
    }

    public synchronized byte[] open(Sealed sealed, byte[] aad) {
        ensureOpen();
        if (sealed == null) throw invalidInput();
        validateBytes(aad, MAX_AAD_BYTES);
        byte[] nonce = sealed.nonce();
        byte[] ciphertext = sealed.ciphertext();
        byte[] aadCopy = aad.clone();
        if (nonce.length != NONCE_BYTES
            || ciphertext.length < GCM_TAG_BITS / Byte.SIZE + 1
            || ciphertext.length > MAX_PLAINTEXT_BYTES + GCM_TAG_BITS / Byte.SIZE) {
            clear(nonce);
            clear(ciphertext);
            clear(aadCopy);
            throw invalidInput();
        }
        try {
            Cipher cipher = Cipher.getInstance(AES_TRANSFORMATION);
            cipher.init(
                Cipher.DECRYPT_MODE,
                new SecretKeySpec(recordKey, "AES"),
                new GCMParameterSpec(128, nonce)
            );
            cipher.updateAAD(aadCopy);
            return cipher.doFinal(ciphertext);
        } catch (AEADBadTagException failure) {
            throw new IllegalStateException("MEMORY_INTEGRITY_FAILED");
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("MEMORY_DECRYPTION_FAILED");
        } finally {
            clear(nonce);
            clear(ciphertext);
            clear(aadCopy);
        }
    }

    public synchronized byte[] blindToken(String normalizedToken) {
        ensureOpen();
        if (normalizedToken == null
            || normalizedToken.isEmpty()
            || normalizedToken.codePointCount(0, normalizedToken.length()) > MAX_TOKEN_CODE_POINTS) {
            throw invalidInput();
        }
        byte[] input = normalizedToken.getBytes(StandardCharsets.UTF_8);
        try {
            return hmac(blindSearchKey, input);
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("MEMORY_CRYPTO_UNAVAILABLE");
        } finally {
            clear(input);
        }
    }

    public synchronized byte[] backupMac(byte[] value) {
        ensureOpen();
        return macValue(backupAuthenticationKey, value);
    }

    public synchronized boolean verifyBackupMac(byte[] value, byte[] expected) {
        ensureOpen();
        if (expected == null || expected.length != KEY_BYTES) return false;
        byte[] actual = backupMac(value);
        try {
            return MessageDigest.isEqual(actual, expected);
        } finally {
            clear(actual);
        }
    }

    private static byte[] macValue(byte[] key, byte[] value) {
        validateBytes(value, MAX_MAC_INPUT_BYTES);
        byte[] copy = value.clone();
        try {
            return hmac(key, copy);
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("MEMORY_CRYPTO_UNAVAILABLE");
        } finally {
            clear(copy);
        }
    }

    private static byte[] hkdfExtract(byte[] salt, byte[] inputKeyMaterial)
        throws GeneralSecurityException {
        return hmac(salt, inputKeyMaterial);
    }

    private static byte[] hkdfExpand(byte[] pseudorandomKey, String label, int length)
        throws GeneralSecurityException {
        if (length <= 0 || length > 255 * KEY_BYTES) throw new GeneralSecurityException();
        byte[] info = ("fe-monster/local-ai-memory/" + label).getBytes(StandardCharsets.UTF_8);
        byte[] output = new byte[length];
        byte[] previous = new byte[0];
        int written = 0;
        int counter = 1;
        try {
            while (written < length) {
                Mac mac = Mac.getInstance(HMAC_ALGORITHM);
                mac.init(new SecretKeySpec(pseudorandomKey, HMAC_ALGORITHM));
                mac.update(previous);
                mac.update(info);
                mac.update((byte) counter);
                byte[] block = mac.doFinal();
                int copied = Math.min(block.length, length - written);
                System.arraycopy(block, 0, output, written, copied);
                written += copied;
                clear(previous);
                previous = block;
                counter += 1;
            }
            return output;
        } catch (GeneralSecurityException failure) {
            clear(output);
            throw failure;
        } finally {
            clear(info);
            clear(previous);
        }
    }

    private static byte[] hmac(byte[] key, byte[] value) throws GeneralSecurityException {
        Mac mac = Mac.getInstance(HMAC_ALGORITHM);
        mac.init(new SecretKeySpec(key, HMAC_ALGORITHM));
        return mac.doFinal(value);
    }

    private static void validateBytes(byte[] value, int maximum) {
        if (value == null || value.length == 0 || value.length > maximum) throw invalidInput();
    }

    private void ensureOpen() {
        if (recordKey == null
            || blindSearchKey == null
            || backupAuthenticationKey == null
            || syncEncryptionKey == null) {
            throw new IllegalStateException("MEMORY_CRYPTO_CLOSED");
        }
    }

    @Override
    public synchronized void close() {
        clearKeys();
    }

    private void clearKeys() {
        clear(recordKey);
        clear(blindSearchKey);
        clear(backupAuthenticationKey);
        clear(syncEncryptionKey);
        recordKey = null;
        blindSearchKey = null;
        backupAuthenticationKey = null;
        syncEncryptionKey = null;
    }

    private static IllegalArgumentException invalidInput() {
        return new IllegalArgumentException("MEMORY_CRYPTO_INVALID_INPUT");
    }

    private static void clear(byte[] value) {
        if (value != null) Arrays.fill(value, (byte) 0);
    }

    public static final class Sealed {
        private final byte[] nonce;
        private final byte[] ciphertext;

        public Sealed(byte[] nonce, byte[] ciphertext) {
            if (nonce == null || ciphertext == null) throw invalidInput();
            this.nonce = nonce.clone();
            this.ciphertext = ciphertext.clone();
        }

        public byte[] nonce() {
            return nonce.clone();
        }

        public byte[] ciphertext() {
            return ciphertext.clone();
        }
    }
}
