package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Per-install request identity used for Internet-facing community requests.
 * The private key never leaves the client; the server stores only the public key.
 */
final class CommunityDeviceCredentials {
    static final String DEVICE_KEY_HEADER = "X-FE-Device-Key";
    static final String COMPUTER_ID_HEADER = "X-FE-Computer-Id";
    static final String TIMESTAMP_HEADER = "X-FE-Timestamp";
    static final String NONCE_HEADER = "X-FE-Nonce";
    static final String SIGNATURE_HEADER = "X-FE-Signature";

    private static final Base64.Encoder BASE64_URL = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder BASE64_URL_DECODER = Base64.getUrlDecoder();

    private final Path storagePath;
    private final String computerId;
    private final String computerIdSource;
    private final PrivateKey privateKey;
    private final PublicKey publicKey;
    private final String keyId;

    CommunityDeviceCredentials(Path storagePath, String computerId, String computerIdSource) {
        this.storagePath = storagePath;
        this.computerId = cleanComputerId(computerId);
        this.computerIdSource = cleanSource(computerIdSource);
        if (this.computerId.isBlank()) {
            throw new IllegalArgumentException("community device computer id is required");
        }

        KeyPair keyPair = loadKeyPair();
        if (keyPair == null) {
            keyPair = generateKeyPair();
            persist(keyPair);
        }
        this.privateKey = keyPair.getPrivate();
        this.publicKey = keyPair.getPublic();
        this.keyId = keyId(this.publicKey.getEncoded());
    }

    String keyId() {
        return keyId;
    }

    String computerId() {
        return computerId;
    }

    Map<String, Object> enrollmentPayload() {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("computerId", computerId);
        payload.put("computerIdSource", computerIdSource);
        payload.put("keyId", keyId);
        payload.put("publicKey", BASE64_URL.encodeToString(publicKey.getEncoded()));
        return payload;
    }

    Map<String, String> signatureHeaders(String method, String path, String body) {
        String timestamp = String.valueOf(System.currentTimeMillis());
        String nonce = "device-" + UUID.randomUUID().toString().replace("-", "");
        String base = signatureBase(method, path, timestamp, nonce, body);
        try {
            Signature signer = Signature.getInstance("Ed25519");
            signer.initSign(privateKey);
            signer.update(base.getBytes(StandardCharsets.UTF_8));
            Map<String, String> headers = new LinkedHashMap<>();
            headers.put(DEVICE_KEY_HEADER, keyId);
            headers.put(COMPUTER_ID_HEADER, computerId);
            headers.put(TIMESTAMP_HEADER, timestamp);
            headers.put(NONCE_HEADER, nonce);
            headers.put(SIGNATURE_HEADER, BASE64_URL.encodeToString(signer.sign()));
            return headers;
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException("could not sign community request", e);
        }
    }

    static String signatureBase(String method, String path, String timestamp, String nonce, String body) {
        return String.join(
            "\n",
            method == null ? "" : method.trim().toUpperCase(),
            path == null ? "" : path.trim(),
            timestamp == null ? "" : timestamp.trim(),
            nonce == null ? "" : nonce.trim(),
            sha256Hex(body == null ? "" : body)
        );
    }

    private KeyPair loadKeyPair() {
        if (storagePath == null || !Files.isRegularFile(storagePath)) return null;
        try {
            Map<String, Object> stored = SimpleJson.parseObject(Files.readString(storagePath, StandardCharsets.UTF_8));
            if (!computerId.equals(String.valueOf(stored.getOrDefault("computerId", "")).trim())) return null;
            byte[] privateBytes = BASE64_URL_DECODER.decode(String.valueOf(stored.getOrDefault("privateKey", "")));
            byte[] publicBytes = BASE64_URL_DECODER.decode(String.valueOf(stored.getOrDefault("publicKey", "")));
            KeyFactory factory = KeyFactory.getInstance("Ed25519");
            PrivateKey loadedPrivate = factory.generatePrivate(new PKCS8EncodedKeySpec(privateBytes));
            PublicKey loadedPublic = factory.generatePublic(new X509EncodedKeySpec(publicBytes));
            String storedKeyId = String.valueOf(stored.getOrDefault("keyId", "")).trim();
            if (!keyId(publicBytes).equals(storedKeyId)) return null;
            return new KeyPair(loadedPublic, loadedPrivate);
        } catch (IOException | GeneralSecurityException | IllegalArgumentException e) {
            return null;
        }
    }

    private void persist(KeyPair keyPair) {
        if (storagePath == null) return;
        Map<String, Object> stored = new LinkedHashMap<>();
        stored.put("version", 1);
        stored.put("algorithm", "Ed25519");
        stored.put("computerId", computerId);
        stored.put("keyId", keyId(keyPair.getPublic().getEncoded()));
        stored.put("publicKey", BASE64_URL.encodeToString(keyPair.getPublic().getEncoded()));
        stored.put("privateKey", BASE64_URL.encodeToString(keyPair.getPrivate().getEncoded()));
        stored.put("createdAt", System.currentTimeMillis());

        try {
            Path parent = storagePath.getParent();
            if (parent != null) Files.createDirectories(parent);
            Path temporary = storagePath.resolveSibling(storagePath.getFileName() + ".tmp-" + UUID.randomUUID());
            Files.writeString(temporary, SimpleJson.stringify(stored), StandardCharsets.UTF_8);
            try {
                Files.move(
                    temporary,
                    storagePath,
                    StandardCopyOption.ATOMIC_MOVE,
                    StandardCopyOption.REPLACE_EXISTING
                );
            } catch (AtomicMoveNotSupportedException ignored) {
                Files.move(temporary, storagePath, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new IllegalArgumentException("could not persist community device identity", e);
        }
    }

    private static KeyPair generateKeyPair() {
        try {
            return KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException("Ed25519 is unavailable", e);
        }
    }

    private static String keyId(byte[] publicKey) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(publicKey);
            return "device-" + BASE64_URL.encodeToString(digest);
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException("SHA-256 is unavailable", e);
        }
    }

    private static String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder(digest.length * 2);
            for (byte item : digest) out.append(String.format("%02x", item & 0xff));
            return out.toString();
        } catch (GeneralSecurityException e) {
            throw new IllegalArgumentException("SHA-256 is unavailable", e);
        }
    }

    private static String cleanComputerId(String value) {
        String normalized = value == null ? "" : value.trim();
        return normalized.matches("[A-Za-z0-9_-]{16,128}") ? normalized : "";
    }

    private static String cleanSource(String value) {
        String normalized = value == null ? "" : value.trim();
        return normalized.matches("[A-Za-z0-9._-]{1,40}") ? normalized : "install";
    }
}
