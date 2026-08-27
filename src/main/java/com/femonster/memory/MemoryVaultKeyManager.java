package com.femonster.memory;

import com.femonster.json.SimpleJson;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

public final class MemoryVaultKeyManager {
    private static final int SCHEMA_VERSION = 1;
    private static final int MASTER_KEY_BYTES = 32;
    private static final int MAX_METADATA_BYTES = 8_192;
    private static final int MAX_PROTECTED_KEY_BYTES = 65_536;
    private static final int ENVELOPE_BYTES = 8 + Integer.BYTES + Long.BYTES * 3 + Integer.BYTES + MASTER_KEY_BYTES;
    private static final long LOCK_TIMEOUT_NANOS = TimeUnit.SECONDS.toNanos(5);
    private static final String KEY_PURPOSE = "FE Monster Local AI Memory v1";
    private static final byte[] KEY_ENVELOPE_MAGIC = {'F', 'E', 'M', 'K', 'E', 'Y', '0', '1'};
    private static final byte[] ENTROPY_DOMAIN = "fe-monster/local-ai-memory/dpapi-entropy/v1\0"
        .getBytes(StandardCharsets.UTF_8);
    private static final Pattern OWNED_TEMPORARY = Pattern.compile(
        "\\.vault-(?:key|meta)-[0-9a-f-]{36}\\.next"
    );

    private final Path directory;
    private final Path metadataPath;
    private final Path protectedKeyPath;
    private final Path lockPath;
    private final KeyProtector protector;
    private final SecureRandom random;

    public MemoryVaultKeyManager(Path directory, KeyProtector protector, SecureRandom random) {
        if (directory == null || protector == null || random == null) {
            throw new IllegalArgumentException("MEMORY_VAULT_INVALID_INPUT");
        }
        this.directory = directory.toAbsolutePath().normalize();
        this.metadataPath = this.directory.resolve("vault-meta.json");
        this.protectedKeyPath = this.directory.resolve("vault-key.dpapi");
        this.lockPath = this.directory.resolve(".vault.lock");
        this.protector = protector;
        this.random = random;
    }

    public synchronized KeyLease openOrCreate() {
        try {
            ensureDirectory();
            if (Files.isSymbolicLink(lockPath)) throw locked();
            try (FileChannel channel = FileChannel.open(
                lockPath,
                StandardOpenOption.CREATE,
                StandardOpenOption.WRITE,
                LinkOption.NOFOLLOW_LINKS
            )) {
                MemoryFileSecurity.hardenOwnerOnly(lockPath, false);
                try (FileLock ignored = acquireLock(channel)) {
                    return openOrCreateLocked();
                }
            }
        } catch (VaultFailure failure) {
            throw failure;
        } catch (IOException | SecurityException failure) {
            throw new VaultFailure("MEMORY_VAULT_IO_FAILED");
        }
    }

    private void ensureDirectory() throws IOException {
        boolean exists = Files.exists(directory, LinkOption.NOFOLLOW_LINKS);
        if (exists && (!Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(directory))) {
            throw locked();
        }
        if (!exists) Files.createDirectories(directory);
        MemoryFileSecurity.hardenOwnerOnly(directory, true);
    }

    private FileLock acquireLock(FileChannel channel) throws IOException {
        long deadline = System.nanoTime() + LOCK_TIMEOUT_NANOS;
        while (true) {
            try {
                FileLock lock = channel.tryLock();
                if (lock != null) return lock;
            } catch (OverlappingFileLockException ignored) {
            }
            if (System.nanoTime() - deadline >= 0) throw new VaultFailure("MEMORY_VAULT_BUSY");
            try {
                Thread.sleep(20L);
            } catch (InterruptedException failure) {
                Thread.currentThread().interrupt();
                throw new VaultFailure("MEMORY_VAULT_BUSY");
            }
        }
    }

    private KeyLease openOrCreateLocked() throws IOException {
        cleanupOwnedTemporaryFiles();
        if (Files.isSymbolicLink(metadataPath) || Files.isSymbolicLink(protectedKeyPath)) throw locked();
        boolean metadataExists = Files.isRegularFile(metadataPath, LinkOption.NOFOLLOW_LINKS);
        boolean keyExists = Files.isRegularFile(protectedKeyPath, LinkOption.NOFOLLOW_LINKS);
        if (metadataExists) MemoryFileSecurity.hardenOwnerOnly(metadataPath, false);
        if (keyExists) MemoryFileSecurity.hardenOwnerOnly(protectedKeyPath, false);

        if (keyExists) {
            try (UnwrappedVault vault = unwrapKeyFile()) {
                if (metadataExists) {
                    VaultMetadata metadata = readMetadata();
                    if (!metadata.equals(vault.metadata())) throw locked();
                } else {
                    publishMetadata(vault.metadata());
                }
                return new KeyLease(vault.metadata().vaultId(), vault.metadata().createdAt(), vault.key());
            }
        }
        if (metadataExists) throw locked();
        if (directoryHasUnexpectedEntries()) throw locked();
        return createFresh();
    }

    private KeyLease createFresh() {
        UUID vaultUuid = UUID.randomUUID();
        VaultMetadata metadata = new VaultMetadata(vaultUuid.toString(), Instant.now());
        byte[] key = new byte[MASTER_KEY_BYTES];
        byte[] envelope = null;
        byte[] entropy = null;
        byte[] protectedBytes = null;
        byte[] metadataBytes = null;
        Path keyTemporary = temporaryPath("key");
        Path metadataTemporary = temporaryPath("meta");
        try {
            try {
                random.nextBytes(key);
            } catch (RuntimeException failure) {
                throw new VaultFailure("MEMORY_VAULT_UNAVAILABLE");
            }
            if (isAllZero(key)) throw new VaultFailure("MEMORY_VAULT_UNAVAILABLE");
            envelope = createEnvelope(vaultUuid, metadata.createdAt(), key);
            entropy = fixedEntropy();
            try {
                protectedBytes = protector.protect(envelope, entropy);
            } catch (RuntimeException failure) {
                throw new VaultFailure("MEMORY_VAULT_UNAVAILABLE");
            }
            if (protectedBytes == null || protectedBytes.length == 0 || protectedBytes.length > MAX_PROTECTED_KEY_BYTES) {
                throw new VaultFailure("MEMORY_VAULT_UNAVAILABLE");
            }
            metadataBytes = metadataBytes(metadata);

            durableCreate(keyTemporary, protectedBytes);
            durableCreate(metadataTemporary, metadataBytes);
            atomicPublish(keyTemporary, protectedKeyPath);
            atomicPublish(metadataTemporary, metadataPath);
            return new KeyLease(metadata.vaultId(), metadata.createdAt(), key);
        } catch (VaultFailure failure) {
            throw failure;
        } catch (IOException | SecurityException failure) {
            throw new VaultFailure("MEMORY_VAULT_IO_FAILED");
        } finally {
            deleteTemporary(keyTemporary);
            deleteTemporary(metadataTemporary);
            clear(key);
            clear(envelope);
            clear(entropy);
            clear(protectedBytes);
            clear(metadataBytes);
        }
    }

    private UnwrappedVault unwrapKeyFile() {
        byte[] protectedBytes = null;
        byte[] entropy = null;
        byte[] envelope = null;
        byte[] key = null;
        try {
            protectedBytes = readBounded(protectedKeyPath, MAX_PROTECTED_KEY_BYTES);
            entropy = fixedEntropy();
            try {
                envelope = protector.unprotect(protectedBytes, entropy);
            } catch (RuntimeException failure) {
                throw locked();
            }
            try (ParsedEnvelope parsed = parseEnvelope(envelope)) {
                key = parsed.key();
                return new UnwrappedVault(parsed.metadata(), key);
            }
        } catch (VaultFailure failure) {
            throw failure;
        } catch (IOException | RuntimeException failure) {
            throw locked();
        } finally {
            clear(protectedBytes);
            clear(entropy);
            clear(envelope);
            clear(key);
        }
    }

    private static byte[] createEnvelope(UUID vaultId, Instant createdAt, byte[] key) {
        ByteBuffer buffer = ByteBuffer.allocate(ENVELOPE_BYTES);
        buffer.put(KEY_ENVELOPE_MAGIC);
        buffer.putInt(SCHEMA_VERSION);
        buffer.putLong(vaultId.getMostSignificantBits());
        buffer.putLong(vaultId.getLeastSignificantBits());
        buffer.putLong(createdAt.getEpochSecond());
        buffer.putInt(createdAt.getNano());
        buffer.put(key);
        return buffer.array();
    }

    private static ParsedEnvelope parseEnvelope(byte[] envelope) {
        if (envelope == null || envelope.length != ENVELOPE_BYTES) throw locked();
        ByteBuffer buffer = ByteBuffer.wrap(envelope);
        byte[] magic = new byte[KEY_ENVELOPE_MAGIC.length];
        byte[] key = new byte[MASTER_KEY_BYTES];
        try {
            buffer.get(magic);
            if (!MessageDigest.isEqual(magic, KEY_ENVELOPE_MAGIC) || buffer.getInt() != SCHEMA_VERSION) throw locked();
            UUID vaultId = new UUID(buffer.getLong(), buffer.getLong());
            long epochSecond = buffer.getLong();
            int nano = buffer.getInt();
            buffer.get(key);
            if (nano < 0 || nano > 999_999_999 || isAllZero(key)) throw locked();
            Instant createdAt;
            try {
                createdAt = Instant.ofEpochSecond(epochSecond, nano);
            } catch (RuntimeException failure) {
                throw locked();
            }
            return new ParsedEnvelope(new VaultMetadata(vaultId.toString(), createdAt), key);
        } finally {
            clear(magic);
            clear(key);
        }
    }

    private void publishMetadata(VaultMetadata metadata) throws IOException {
        byte[] bytes = metadataBytes(metadata);
        Path temporary = temporaryPath("meta");
        try {
            durableCreate(temporary, bytes);
            atomicPublish(temporary, metadataPath);
        } finally {
            deleteTemporary(temporary);
            clear(bytes);
        }
    }

    private static byte[] metadataBytes(VaultMetadata metadata) {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("schemaVersion", SCHEMA_VERSION);
        root.put("vaultId", metadata.vaultId());
        root.put("keyPurpose", KEY_PURPOSE);
        root.put("createdAt", metadata.createdAt().toString());
        byte[] bytes = (SimpleJson.stringify(root) + "\n").getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_METADATA_BYTES) {
            clear(bytes);
            throw new VaultFailure("MEMORY_VAULT_IO_FAILED");
        }
        return bytes;
    }

    private VaultMetadata readMetadata() throws IOException {
        byte[] bytes = readBounded(metadataPath, MAX_METADATA_BYTES);
        Map<String, Object> root;
        try {
            root = SimpleJson.parseObjectStrict(new String(bytes, StandardCharsets.UTF_8));
        } catch (RuntimeException failure) {
            throw locked();
        } finally {
            clear(bytes);
        }
        if (root.size() != 4
            || !(root.get("schemaVersion") instanceof Number schema)
            || schema.intValue() != SCHEMA_VERSION
            || schema.doubleValue() != SCHEMA_VERSION
            || !KEY_PURPOSE.equals(root.get("keyPurpose"))) {
            throw locked();
        }
        String vaultId = string(root.get("vaultId"));
        String createdAtText = string(root.get("createdAt"));
        try {
            UUID parsedId = UUID.fromString(vaultId);
            Instant createdAt = Instant.parse(createdAtText);
            if (!parsedId.toString().equals(vaultId) || !createdAtText.endsWith("Z")) throw locked();
            return new VaultMetadata(vaultId, createdAt);
        } catch (IllegalArgumentException failure) {
            throw locked();
        }
    }

    private void cleanupOwnedTemporaryFiles() throws IOException {
        try (var entries = Files.list(directory)) {
            for (Path entry : entries.toList()) {
                Path name = entry.getFileName();
                if (name != null && OWNED_TEMPORARY.matcher(name.toString()).matches()) {
                    Files.deleteIfExists(entry);
                }
            }
        }
    }

    private boolean directoryHasUnexpectedEntries() throws IOException {
        try (var entries = Files.list(directory)) {
            return entries.anyMatch(path -> !path.equals(lockPath));
        }
    }

    private Path temporaryPath(String kind) {
        return directory.resolve(".vault-" + kind + "-" + UUID.randomUUID() + ".next");
    }

    private static void durableCreate(Path path, byte[] bytes) throws IOException {
        try (FileChannel channel = FileChannel.open(
            path,
            StandardOpenOption.CREATE_NEW,
            StandardOpenOption.WRITE,
            LinkOption.NOFOLLOW_LINKS
        )) {
            ByteBuffer buffer = ByteBuffer.wrap(bytes);
            while (buffer.hasRemaining()) channel.write(buffer);
            channel.force(true);
        }
        MemoryFileSecurity.hardenOwnerOnly(path, false);
    }

    private static byte[] readBounded(Path path, int maximumBytes) throws IOException {
        try (InputStream input = Files.newInputStream(
            path,
            StandardOpenOption.READ,
            LinkOption.NOFOLLOW_LINKS
        )) {
            byte[] bytes = input.readNBytes(maximumBytes + 1);
            if (bytes.length == 0 || bytes.length > maximumBytes || input.read() != -1) {
                clear(bytes);
                throw locked();
            }
            return bytes;
        }
    }

    private static void atomicPublish(Path source, Path target) throws IOException {
        try {
            Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException failure) {
            throw new IOException("ATOMIC_MOVE_REQUIRED");
        }
    }

    private static byte[] fixedEntropy() {
        try {
            return MessageDigest.getInstance("SHA-256").digest(ENTROPY_DOMAIN);
        } catch (NoSuchAlgorithmException failure) {
            throw new VaultFailure("MEMORY_VAULT_UNAVAILABLE");
        }
    }

    private static boolean isAllZero(byte[] value) {
        int combined = 0;
        for (byte current : value) combined |= current;
        return combined == 0;
    }

    private static String string(Object value) {
        return value instanceof String text ? text : "";
    }

    private static void deleteTemporary(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException | SecurityException ignored) {
        }
    }

    private static void clear(byte[] value) {
        if (value != null) Arrays.fill(value, (byte) 0);
    }

    private static VaultFailure locked() {
        return new VaultFailure("MEMORY_VAULT_LOCKED");
    }

    public static final class KeyLease implements AutoCloseable {
        private final String vaultId;
        private final Instant createdAt;
        private byte[] key;

        private KeyLease(String vaultId, Instant createdAt, byte[] key) {
            this.vaultId = Objects.requireNonNull(vaultId);
            this.createdAt = Objects.requireNonNull(createdAt);
            this.key = key.clone();
        }

        public String vaultId() {
            return vaultId;
        }

        public Instant createdAt() {
            return createdAt;
        }

        public synchronized byte[] key() {
            if (key == null) throw new IllegalStateException("MEMORY_KEY_LEASE_CLOSED");
            return key.clone();
        }

        @Override
        public synchronized void close() {
            clear(key);
            key = null;
        }
    }

    private record VaultMetadata(String vaultId, Instant createdAt) {
    }

    private static final class ParsedEnvelope implements AutoCloseable {
        private final VaultMetadata metadata;
        private byte[] key;

        private ParsedEnvelope(VaultMetadata metadata, byte[] key) {
            this.metadata = metadata;
            this.key = key.clone();
        }

        private VaultMetadata metadata() {
            return metadata;
        }

        private byte[] key() {
            if (key == null) throw locked();
            return key.clone();
        }

        @Override
        public void close() {
            clear(key);
            key = null;
        }
    }

    private static final class UnwrappedVault implements AutoCloseable {
        private final VaultMetadata metadata;
        private byte[] key;

        private UnwrappedVault(VaultMetadata metadata, byte[] key) {
            this.metadata = metadata;
            this.key = key.clone();
        }

        private VaultMetadata metadata() {
            return metadata;
        }

        private byte[] key() {
            return key.clone();
        }

        @Override
        public void close() {
            clear(key);
            key = null;
        }
    }

    private static final class VaultFailure extends IllegalStateException {
        private VaultFailure(String code) {
            super(code);
        }
    }
}
