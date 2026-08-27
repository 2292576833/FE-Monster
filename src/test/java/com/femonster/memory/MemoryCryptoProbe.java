package com.femonster.memory;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

public final class MemoryCryptoProbe {
    private static final byte[] MASTER_KEY = Arrays.copyOf(
        "FE_MEMORY_MASTER_KEY_CANARY_6B21".getBytes(StandardCharsets.UTF_8),
        32
    );
    private static final byte[] PLAINTEXT = "FE_MEMORY_PLAINTEXT_CANARY_9D34".getBytes(StandardCharsets.UTF_8);
    private static final byte[] AAD = "schema=1|vault=fixture|stream=chat".getBytes(StandardCharsets.UTF_8);

    private MemoryCryptoProbe() {
    }

    public static void main(String[] args) throws Exception {
        cryptoContract();
        tokenizerContract();
        vaultKeyContract();
        System.out.println("PASS local memory crypto core");
    }

    private static void cryptoContract() {
        byte[] master = MASTER_KEY.clone();
        byte[] masterBefore = master.clone();
        byte[] plaintext = PLAINTEXT.clone();
        byte[] plaintextBefore = plaintext.clone();
        byte[] aad = AAD.clone();
        byte[] aadBefore = aad.clone();
        MemoryCrypto crypto = new MemoryCrypto(master);
        require(Arrays.equals(master, masterBefore), "CALLER_MASTER_KEY_CHANGED");

        MemoryCrypto.Sealed first = crypto.seal(plaintext, aad);
        MemoryCrypto.Sealed second = crypto.seal(plaintext, aad);
        require(first.nonce().length == 12, "NONCE_LENGTH_INVALID");
        require(first.ciphertext().length == plaintext.length + 16, "GCM_TAG_LENGTH_INVALID");
        require(!Arrays.equals(first.nonce(), second.nonce()), "NONCE_REUSE");
        require(!Arrays.equals(first.ciphertext(), second.ciphertext()), "CIPHERTEXT_NOT_RANDOMIZED");
        require(!contains(first.ciphertext(), plaintext), "PLAINTEXT_VISIBLE_IN_CIPHERTEXT");
        require(Arrays.equals(plaintext, plaintextBefore), "CALLER_PLAINTEXT_CHANGED");
        require(Arrays.equals(aad, aadBefore), "CALLER_AAD_CHANGED");
        require(Arrays.equals(crypto.open(first, aad), plaintext), "GCM_ROUND_TRIP_FAILED");

        byte[] nonceView = first.nonce();
        nonceView[0] ^= 1;
        require(!Arrays.equals(nonceView, first.nonce()), "SEALED_NONCE_ACCESSOR_NOT_DEFENSIVE");
        byte[] ciphertextView = first.ciphertext();
        ciphertextView[0] ^= 1;
        require(!Arrays.equals(ciphertextView, first.ciphertext()), "SEALED_CIPHERTEXT_ACCESSOR_NOT_DEFENSIVE");

        byte[] badAad = aad.clone();
        badAad[0] ^= 1;
        expectCode(() -> crypto.open(first, badAad), "MEMORY_INTEGRITY_FAILED");
        for (int position : new int[]{0, first.ciphertext().length / 2, first.ciphertext().length - 1}) {
            byte[] changed = first.ciphertext();
            changed[position] ^= 1;
            expectCode(
                () -> crypto.open(new MemoryCrypto.Sealed(first.nonce(), changed), aad),
                "MEMORY_INTEGRITY_FAILED"
            );
        }
        byte[] changedNonce = first.nonce();
        changedNonce[0] ^= 1;
        expectCode(
            () -> crypto.open(new MemoryCrypto.Sealed(changedNonce, first.ciphertext()), aad),
            "MEMORY_INTEGRITY_FAILED"
        );

        byte[] blind = crypto.blindToken("音乐区");
        byte[] blindAgain = crypto.blindToken("音乐区");
        byte[] backup = crypto.backupMac("音乐区".getBytes(StandardCharsets.UTF_8));
        require(blind.length == 32 && Arrays.equals(blind, blindAgain), "BLIND_TOKEN_NOT_STABLE");
        require(!Arrays.equals(blind, backup), "BLIND_AND_BACKUP_KEYS_NOT_INDEPENDENT");
        require(crypto.verifyBackupMac("音乐区".getBytes(StandardCharsets.UTF_8), backup), "BACKUP_MAC_VERIFY_FAILED");
        backup[0] ^= 1;
        require(!crypto.verifyBackupMac("音乐区".getBytes(StandardCharsets.UTF_8), backup), "BACKUP_MAC_TAMPER_ACCEPTED");

        expectCode(() -> new MemoryCrypto(new byte[31]), "MEMORY_CRYPTO_INVALID_INPUT");
        expectCode(() -> crypto.seal(new byte[0], aad), "MEMORY_CRYPTO_INVALID_INPUT");
        expectCode(() -> crypto.open(null, aad), "MEMORY_CRYPTO_INVALID_INPUT");
        expectCode(() -> crypto.blindToken(""), "MEMORY_CRYPTO_INVALID_INPUT");
        expectCode(() -> crypto.blindToken("x".repeat(65)), "MEMORY_CRYPTO_INVALID_INPUT");
        crypto.close();
        expectCode(() -> crypto.seal(plaintext, aad), "MEMORY_CRYPTO_CLOSED");
        require(Arrays.equals(master, masterBefore), "CALLER_MASTER_KEY_CHANGED_AFTER_CLOSE");
    }

    private static void tokenizerContract() {
        Set<String> normalized = MemoryTokenizer.tokens("ＦＥ Monster MUSIC music");
        require(normalized.contains("fe"), "NFKC_NORMALIZATION_MISSING");
        require(normalized.contains("monster"), "LOWERCASE_WORD_MISSING");
        require(normalized.contains("music"), "WORD_TOKEN_MISSING");
        require(normalized.contains("mu") && normalized.contains("musi"), "WORD_PREFIX_MISSING");

        Set<String> chinese = MemoryTokenizer.tokens("音乐区");
        for (String expected : Set.of("音", "乐", "区", "音乐", "乐区", "音乐区")) {
            require(chinese.contains(expected), "CJK_TOKEN_MISSING");
        }
        require(MemoryTokenizer.tokens("音").contains("音"), "CJK_UNIGRAM_MISSING");
        require(MemoryTokenizer.tokens("音乐").contains("音乐"), "CJK_BIGRAM_MISSING");
        require(MemoryTokenizer.tokens("音乐区").contains("音乐区"), "CJK_TRIGRAM_MISSING");

        StringBuilder manyCjk = new StringBuilder();
        for (int index = 0; index < 3_000; index++) manyCjk.appendCodePoint(0x4E00 + index);
        Set<String> bounded = MemoryTokenizer.tokens(manyCjk.toString());
        require(bounded.size() <= 2_048, "TOKEN_COUNT_UNBOUNDED");
        for (String token : bounded) {
            require(token.codePointCount(0, token.length()) <= 64, "TOKEN_LENGTH_UNBOUNDED");
        }
        expectCode(() -> MemoryTokenizer.tokens("x".repeat(32_769)), "MEMORY_TEXT_TOO_LARGE");
    }

    private static void vaultKeyContract() throws Exception {
        Path root = Files.createTempDirectory("fe-memory-key-manager-");
        Path tamperRoot = Files.createTempDirectory("fe-memory-key-manager-tamper-");
        Path recoveryRoot = Files.createTempDirectory("fe-memory-key-manager-recovery-");
        Path concurrentRoot = Files.createTempDirectory("fe-memory-key-manager-concurrent-");
        Path zeroRandomRoot = Files.createTempDirectory("fe-memory-key-manager-zero-random-");
        try {
            FakeProtector protector = new FakeProtector();
            MemoryVaultKeyManager manager = new MemoryVaultKeyManager(root, protector, new SecureRandom());
            byte[] firstKey;
            String vaultId;
            try (MemoryVaultKeyManager.KeyLease lease = manager.openOrCreate()) {
                firstKey = lease.key();
                vaultId = lease.vaultId();
                require(firstKey.length == 32, "VAULT_KEY_LENGTH_INVALID");
                require(vaultId.matches("[0-9a-f-]{36}"), "VAULT_ID_INVALID");
                require(lease.createdAt() != null, "VAULT_CREATED_AT_MISSING");
            }
            require(Files.isRegularFile(root.resolve("vault-meta.json")), "VAULT_METADATA_MISSING");
            require(Files.isRegularFile(root.resolve("vault-key.dpapi")), "VAULT_KEY_BLOB_MISSING");
            require(MemoryFileSecurity.isOwnerOnly(root, true), "VAULT_DIRECTORY_NOT_OWNER_ONLY");
            require(
                MemoryFileSecurity.isOwnerOnly(root.resolve("vault-meta.json"), false),
                "VAULT_METADATA_NOT_OWNER_ONLY"
            );
            require(
                MemoryFileSecurity.isOwnerOnly(root.resolve("vault-key.dpapi"), false),
                "VAULT_KEY_BLOB_NOT_OWNER_ONLY"
            );
            require(!contains(Files.readAllBytes(root.resolve("vault-key.dpapi")), firstKey), "VAULT_KEY_WRITTEN_IN_PLAINTEXT");

            MemoryVaultKeyManager reopenedManager = new MemoryVaultKeyManager(
                root,
                new FakeProtector(),
                new SecureRandom()
            );
            try (MemoryVaultKeyManager.KeyLease reopened = reopenedManager.openOrCreate()) {
                require(vaultId.equals(reopened.vaultId()), "VAULT_ID_CHANGED_ON_REOPEN");
                require(Arrays.equals(firstKey, reopened.key()), "VAULT_KEY_CHANGED_ON_REOPEN");
            }
            byte[] metadataBefore = Files.readAllBytes(root.resolve("vault-meta.json"));
            Files.delete(root.resolve("vault-key.dpapi"));
            expectCode(manager::openOrCreate, "MEMORY_VAULT_LOCKED");
            require(Arrays.equals(metadataBefore, Files.readAllBytes(root.resolve("vault-meta.json"))), "LOCKED_VAULT_WAS_OVERWRITTEN");
            require(!Files.exists(root.resolve("vault-key.dpapi")), "LOCKED_VAULT_KEY_WAS_REGENERATED");

            FakeProtector tamperProtector = new FakeProtector();
            MemoryVaultKeyManager tamperManager = new MemoryVaultKeyManager(tamperRoot, tamperProtector, new SecureRandom());
            try (MemoryVaultKeyManager.KeyLease ignored = tamperManager.openOrCreate()) {
            }
            Path blob = tamperRoot.resolve("vault-key.dpapi");
            byte[] changed = Files.readAllBytes(blob);
            changed[changed.length / 2] ^= 1;
            Files.write(blob, changed);
            byte[] changedBefore = Files.readAllBytes(blob);
            expectCode(tamperManager::openOrCreate, "MEMORY_VAULT_LOCKED");
            require(Arrays.equals(changedBefore, Files.readAllBytes(blob)), "TAMPERED_KEY_BLOB_WAS_OVERWRITTEN");

            FakeProtector recoveryProtector = new FakeProtector();
            MemoryVaultKeyManager recoveryManager = new MemoryVaultKeyManager(
                recoveryRoot,
                recoveryProtector,
                new SecureRandom()
            );
            VaultObservation recoveryBefore;
            try (MemoryVaultKeyManager.KeyLease lease = recoveryManager.openOrCreate()) {
                recoveryBefore = new VaultObservation(lease.vaultId(), lease.key());
            }
            Files.delete(recoveryRoot.resolve("vault-meta.json"));
            MemoryVaultKeyManager recoveryReopener = new MemoryVaultKeyManager(
                recoveryRoot,
                new FakeProtector(),
                new SecureRandom()
            );
            try (MemoryVaultKeyManager.KeyLease recovered = recoveryReopener.openOrCreate()) {
                require(recoveryBefore.vaultId().equals(recovered.vaultId()), "RECOVERED_VAULT_ID_CHANGED");
                require(Arrays.equals(recoveryBefore.key(), recovered.key()), "RECOVERED_VAULT_KEY_CHANGED");
            }
            require(Files.isRegularFile(recoveryRoot.resolve("vault-meta.json")), "VAULT_METADATA_NOT_RECOVERED");

            MemoryVaultKeyManager concurrentFirst = new MemoryVaultKeyManager(
                concurrentRoot,
                new FakeProtector(),
                new SecureRandom()
            );
            MemoryVaultKeyManager concurrentSecond = new MemoryVaultKeyManager(
                concurrentRoot,
                new FakeProtector(),
                new SecureRandom()
            );
            CountDownLatch ready = new CountDownLatch(2);
            CountDownLatch start = new CountDownLatch(1);
            AtomicReference<VaultObservation> firstObservation = new AtomicReference<>();
            AtomicReference<VaultObservation> secondObservation = new AtomicReference<>();
            AtomicReference<Throwable> concurrentFailure = new AtomicReference<>();
            Thread firstThread = new Thread(
                () -> observeVault(concurrentFirst, ready, start, firstObservation, concurrentFailure),
                "memory-vault-probe-1"
            );
            Thread secondThread = new Thread(
                () -> observeVault(concurrentSecond, ready, start, secondObservation, concurrentFailure),
                "memory-vault-probe-2"
            );
            firstThread.start();
            secondThread.start();
            ready.await();
            start.countDown();
            firstThread.join(10_000L);
            secondThread.join(10_000L);
            require(!firstThread.isAlive() && !secondThread.isAlive(), "VAULT_CONCURRENT_OPEN_HUNG");
            require(concurrentFailure.get() == null, "VAULT_CONCURRENT_OPEN_FAILED");
            VaultObservation observedFirst = firstObservation.get();
            VaultObservation observedSecond = secondObservation.get();
            require(observedFirst != null && observedSecond != null, "VAULT_CONCURRENT_RESULT_MISSING");
            require(observedFirst.vaultId().equals(observedSecond.vaultId()), "VAULT_CONCURRENT_ID_DIVERGED");
            require(Arrays.equals(observedFirst.key(), observedSecond.key()), "VAULT_CONCURRENT_KEY_DIVERGED");

            MemoryVaultKeyManager zeroRandomManager = new MemoryVaultKeyManager(
                zeroRandomRoot,
                new FakeProtector(),
                new ZeroSecureRandom()
            );
            expectCode(zeroRandomManager::openOrCreate, "MEMORY_VAULT_UNAVAILABLE");
            require(!Files.exists(zeroRandomRoot.resolve("vault-key.dpapi")), "ZERO_KEY_WAS_PUBLISHED");
            require(!Files.exists(zeroRandomRoot.resolve("vault-meta.json")), "ZERO_KEY_METADATA_WAS_PUBLISHED");

            Arrays.fill(firstKey, (byte) 0);
            Arrays.fill(recoveryBefore.key(), (byte) 0);
            Arrays.fill(observedFirst.key(), (byte) 0);
            Arrays.fill(observedSecond.key(), (byte) 0);
        } finally {
            deleteTree(root);
            deleteTree(tamperRoot);
            deleteTree(recoveryRoot);
            deleteTree(concurrentRoot);
            deleteTree(zeroRandomRoot);
        }
    }

    private static void observeVault(
        MemoryVaultKeyManager manager,
        CountDownLatch ready,
        CountDownLatch start,
        AtomicReference<VaultObservation> observation,
        AtomicReference<Throwable> failure
    ) {
        ready.countDown();
        try {
            start.await();
            try (MemoryVaultKeyManager.KeyLease lease = manager.openOrCreate()) {
                observation.set(new VaultObservation(lease.vaultId(), lease.key()));
            }
        } catch (Throwable thrown) {
            failure.compareAndSet(null, thrown);
        }
    }

    private static boolean contains(byte[] haystack, byte[] needle) {
        outer:
        for (int start = 0; start + needle.length <= haystack.length; start++) {
            for (int index = 0; index < needle.length; index++) {
                if (haystack[start + index] != needle[index]) continue outer;
            }
            return true;
        }
        return false;
    }

    private static void expectCode(ThrowingCall call, String expected) {
        try {
            call.run();
            throw new IllegalStateException("EXPECTED_FAILURE_NOT_THROWN");
        } catch (RuntimeException failure) {
            require(expected.equals(failure.getMessage()), "UNEXPECTED_MEMORY_ERROR_CODE");
            require(!String.valueOf(failure.getMessage()).contains("CANARY"), "SECRET_LEAKED_IN_ERROR");
        } catch (Exception failure) {
            throw new IllegalStateException("UNEXPECTED_CHECKED_EXCEPTION");
        }
    }

    private static void deleteTree(Path root) throws IOException {
        if (!Files.exists(root)) return;
        try (var paths = Files.walk(root)) {
            for (Path path : paths.sorted((left, right) -> right.getNameCount() - left.getNameCount()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    private static void require(boolean condition, String code) {
        if (!condition) throw new IllegalStateException(code);
    }

    @FunctionalInterface
    private interface ThrowingCall {
        void run() throws Exception;
    }

    private static final class FakeProtector implements KeyProtector {
        private static final int NONCE_BYTES = 12;
        private static final byte[] AAD = "FE Monster test key protector v1".getBytes(StandardCharsets.UTF_8);
        private final SecureRandom random = new SecureRandom();

        @Override
        public byte[] protect(byte[] plaintext, byte[] entropy) {
            byte[] key = digest(entropy);
            byte[] nonce = new byte[NONCE_BYTES];
            try {
                random.nextBytes(nonce);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
                cipher.updateAAD(AAD);
                byte[] encrypted = cipher.doFinal(plaintext);
                byte[] output = new byte[nonce.length + encrypted.length];
                System.arraycopy(nonce, 0, output, 0, nonce.length);
                System.arraycopy(encrypted, 0, output, nonce.length, encrypted.length);
                Arrays.fill(encrypted, (byte) 0);
                return output;
            } catch (GeneralSecurityException failure) {
                throw new IllegalStateException("FAKE_PROTECTOR_FAILED");
            } finally {
                Arrays.fill(key, (byte) 0);
                Arrays.fill(nonce, (byte) 0);
            }
        }

        @Override
        public byte[] unprotect(byte[] protectedBytes, byte[] entropy) {
            if (protectedBytes == null || protectedBytes.length <= NONCE_BYTES + 16) {
                throw new IllegalStateException("FAKE_PROTECTOR_FAILED");
            }
            byte[] key = digest(entropy);
            byte[] nonce = Arrays.copyOf(protectedBytes, NONCE_BYTES);
            byte[] encrypted = Arrays.copyOfRange(protectedBytes, NONCE_BYTES, protectedBytes.length);
            try {
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
                cipher.updateAAD(AAD);
                return cipher.doFinal(encrypted);
            } catch (GeneralSecurityException failure) {
                throw new IllegalStateException("FAKE_PROTECTOR_FAILED");
            } finally {
                Arrays.fill(key, (byte) 0);
                Arrays.fill(nonce, (byte) 0);
                Arrays.fill(encrypted, (byte) 0);
            }
        }

        private static byte[] digest(byte[] entropy) {
            try {
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                digest.update(entropy);
                return digest.digest();
            } catch (Exception failure) {
                throw new IllegalStateException("FAKE_PROTECTOR_FAILED");
            }
        }
    }

    private static final class ZeroSecureRandom extends SecureRandom {
        @Override
        public void nextBytes(byte[] bytes) {
            Arrays.fill(bytes, (byte) 0);
        }
    }

    private record VaultObservation(String vaultId, byte[] key) {
        private VaultObservation {
            key = key.clone();
        }
    }
}
