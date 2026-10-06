package com.femonster.memory;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HexFormat;

/** Executes in two separate JVMs on macOS, against the real bundled JNI library. */
public final class MacKeychainKeyProtectorProbe {
    private static final byte[] ENTROPY = "fe-monster/macos/keychain-probe/v1".getBytes(StandardCharsets.UTF_8);

    public static void main(String[] args) throws Exception {
        Path library = Path.of(args[0]), referenceFile = Path.of(args[1]);
        MacKeychainKeyProtector protector = new MacKeychainKeyProtector(library);
        byte[] expected = MessageDigest.getInstance("SHA-256").digest(ENTROPY);
        if ("write".equals(args[2])) {
            Files.write(referenceFile, protector.protect(expected, ENTROPY));
            return;
        }
        byte[] reference = Files.readAllBytes(referenceFile);
        try {
            if (!Arrays.equals(expected, protector.unprotect(reference, ENTROPY))) throw new AssertionError("Keychain restart lost the vault envelope");
            rejects(() -> protector.unprotect(reference, "wrong-vault".getBytes(StandardCharsets.UTF_8)));
            byte[] invalidUtf8 = reference.clone();
            invalidUtf8[4] = (byte) 0xff;
            rejects(() -> protector.unprotect(invalidUtf8, ENTROPY));
            byte[] invalidUuid = reference.clone();
            invalidUuid[12] = 'A';
            rejects(() -> protector.unprotect(invalidUuid, ENTROPY));
            rejects(() -> protector.unprotect(Arrays.copyOf(reference, 12), ENTROPY));
            Class.forName("org.sqlite.JDBC");
            try (var connection = java.sql.DriverManager.getConnection("jdbc:sqlite::memory:");
                 var statement = connection.createStatement(); var rows = statement.executeQuery("select sqlite_version()")) {
                if (!rows.next()) throw new AssertionError("Bundled SQLite native driver is unavailable");
            }
            System.out.println("macOS Keychain restart, entropy/tamper rejection and SQLite JNI: PASS");
        } finally {
            // Remove only the dummy item created by this probe, never user vaults.
            String account = new String(reference, 4, 36, StandardCharsets.US_ASCII) + ":"
                + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(ENTROPY));
            new ProcessBuilder("/usr/bin/security", "delete-generic-password", "-s",
                "com.femonster.local-memory.v1", "-a", account).redirectErrorStream(true)
                .redirectOutput(ProcessBuilder.Redirect.DISCARD).start().waitFor();
        }
    }

    private static void rejects(Runnable operation) {
        try { operation.run(); } catch (IllegalStateException failure) { return; }
        throw new AssertionError("Corrupt or foreign Keychain reference was accepted");
    }
}
