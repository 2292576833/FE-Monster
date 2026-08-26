package com.femonster.memory;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Arrays;

public final class WindowsDpapiKeyProtectorProbe {
    private static final String SECRET_CANARY = "FE_DPAPI_SECRET_CANARY_7A91";
    private static final String ENTROPY_CANARY = "FE_DPAPI_ENTROPY_CANARY_4C28";

    private WindowsDpapiKeyProtectorProbe() {
    }

    public static void main(String[] args) {
        require(args.length == 1, "DLL_ARGUMENT_REQUIRED");
        Path dll = Path.of(args[0]);
        WindowsDpapiKeyProtector protector = new WindowsDpapiKeyProtector(dll);

        byte[] plaintext = Arrays.copyOf(SECRET_CANARY.getBytes(StandardCharsets.UTF_8), 32);
        byte[] entropy = Arrays.copyOf(ENTROPY_CANARY.getBytes(StandardCharsets.UTF_8), 32);
        byte[] plaintextBefore = plaintext.clone();
        byte[] entropyBefore = entropy.clone();

        byte[] protectedOne = protector.protect(plaintext, entropy);
        byte[] protectedTwo = protector.protect(plaintext, entropy);
        require(protectedOne.length > plaintext.length, "PROTECTED_BLOB_TOO_SHORT");
        require(!Arrays.equals(protectedOne, protectedTwo), "DPAPI_OUTPUT_MUST_BE_RANDOMIZED");
        require(Arrays.equals(plaintext, plaintextBefore), "CALLER_PLAINTEXT_WAS_MODIFIED");
        require(Arrays.equals(entropy, entropyBefore), "CALLER_ENTROPY_WAS_MODIFIED");

        byte[] protectedSnapshot = protectedOne.clone();
        byte[] recovered = protector.unprotect(protectedOne, entropy);
        require(Arrays.equals(plaintext, recovered), "DPAPI_ROUND_TRIP_FAILED");
        require(Arrays.equals(protectedOne, protectedSnapshot), "CALLER_BLOB_WAS_MODIFIED");
        require(Arrays.equals(entropy, entropyBefore), "CALLER_ENTROPY_WAS_MODIFIED_AFTER_UNPROTECT");

        byte[] wrongEntropy = entropy.clone();
        wrongEntropy[0] ^= 0x55;
        expectOneOf(
            () -> protector.unprotect(protectedOne, wrongEntropy),
            "DPAPI_UNPROTECT_FAILED",
            "DPAPI_INTEGRITY_FAILED"
        );
        require(Arrays.equals(protectedOne, protectedSnapshot), "FAILED_UNPROTECT_MODIFIED_BLOB");

        for (int position : new int[]{0, protectedOne.length / 2, protectedOne.length - 1}) {
            byte[] tampered = protectedOne.clone();
            tampered[position] ^= 0x01;
            byte[] tamperedBefore = tampered.clone();
            expectOneOf(
                () -> protector.unprotect(tampered, entropy),
                "DPAPI_UNPROTECT_FAILED",
                "DPAPI_INTEGRITY_FAILED"
            );
            require(Arrays.equals(tampered, tamperedBefore), "FAILED_UNPROTECT_MODIFIED_TAMPERED_BLOB");
        }

        expectCode(() -> protector.protect(null, entropy), "DPAPI_INVALID_INPUT");
        expectCode(() -> protector.protect(new byte[0], entropy), "DPAPI_INVALID_INPUT");
        expectCode(() -> protector.protect(plaintext, null), "DPAPI_INVALID_INPUT");
        expectCode(() -> protector.protect(plaintext, new byte[0]), "DPAPI_INVALID_INPUT");
        expectCode(() -> protector.protect(new byte[4_097], entropy), "DPAPI_INVALID_INPUT");
        expectCode(() -> protector.protect(plaintext, new byte[4_097]), "DPAPI_INVALID_INPUT");
        expectCode(() -> protector.unprotect(null, entropy), "DPAPI_INVALID_INPUT");
        expectCode(() -> protector.unprotect(new byte[0], entropy), "DPAPI_INVALID_INPUT");
        expectCode(() -> protector.unprotect(new byte[65_537], entropy), "DPAPI_INVALID_INPUT");

        expectCode(
            () -> new WindowsDpapiKeyProtector(dll.resolveSibling("unexpected-name.dll")),
            "DPAPI_UNAVAILABLE"
        );

        Arrays.fill(recovered, (byte) 0);
        Arrays.fill(protectedOne, (byte) 0);
        Arrays.fill(protectedTwo, (byte) 0);
        Arrays.fill(plaintext, (byte) 0);
        Arrays.fill(entropy, (byte) 0);
        Arrays.fill(wrongEntropy, (byte) 0);
        Arrays.fill(plaintextBefore, (byte) 0);
        Arrays.fill(entropyBefore, (byte) 0);
        Arrays.fill(protectedSnapshot, (byte) 0);
        System.out.println("PASS Windows DPAPI key protector");
    }

    private static void expectCode(ThrowingCall call, String expected) {
        expectOneOf(call, expected);
    }

    private static void expectOneOf(ThrowingCall call, String... expected) {
        try {
            call.run();
            throw new IllegalStateException("EXPECTED_FAILURE_NOT_THROWN");
        } catch (RuntimeException failure) {
            String message = failure.getMessage();
            require(message != null && message.matches("DPAPI_[A-Z_]+"), "UNSTABLE_DPAPI_ERROR");
            require(!message.contains(SECRET_CANARY), "PLAINTEXT_LEAKED_IN_ERROR");
            require(!message.contains(ENTROPY_CANARY), "ENTROPY_LEAKED_IN_ERROR");
            require(Arrays.asList(expected).contains(message), "UNEXPECTED_DPAPI_ERROR_CODE");
        }
    }

    private static void require(boolean condition, String code) {
        if (!condition) throw new IllegalStateException(code);
    }

    @FunctionalInterface
    private interface ThrowingCall {
        void run();
    }
}
