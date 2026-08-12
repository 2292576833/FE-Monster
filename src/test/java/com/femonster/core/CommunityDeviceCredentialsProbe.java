package com.femonster.core;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Comparator;
import java.util.Map;

public final class CommunityDeviceCredentialsProbe {
    private CommunityDeviceCredentialsProbe() {
    }

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-community-device-");
        Path identity = root.resolve("community-device-credentials.json");
        String computerId = "install-0123456789abcdef0123456789abcdef";
        try {
            CommunityDeviceCredentials first = new CommunityDeviceCredentials(identity, computerId, "install");
            require(Files.isRegularFile(identity), "device identity was not persisted");
            CommunityDeviceCredentials restored = new CommunityDeviceCredentials(identity, computerId, "install");
            require(first.keyId().equals(restored.keyId()), "persisted device key changed after reload");

            String method = "POST";
            String path = "/api/community/register";
            String body = "{\"computerId\":\"" + computerId + "\"}";
            Map<String, String> headers = restored.signatureHeaders(method, path, body);
            require(computerId.equals(headers.get(CommunityDeviceCredentials.COMPUTER_ID_HEADER)), "computer id header mismatch");
            require(first.keyId().equals(headers.get(CommunityDeviceCredentials.DEVICE_KEY_HEADER)), "key id header mismatch");

            Map<String, Object> enrollment = restored.enrollmentPayload();
            byte[] publicBytes = Base64.getUrlDecoder().decode(String.valueOf(enrollment.get("publicKey")));
            PublicKey publicKey = KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(publicBytes));
            String signatureBase = CommunityDeviceCredentials.signatureBase(
                method,
                path,
                headers.get(CommunityDeviceCredentials.TIMESTAMP_HEADER),
                headers.get(CommunityDeviceCredentials.NONCE_HEADER),
                body
            );
            require(
                verify(publicKey, signatureBase, headers.get(CommunityDeviceCredentials.SIGNATURE_HEADER)),
                "valid device signature was rejected"
            );
            require(
                !verify(publicKey, signatureBase + "-tampered", headers.get(CommunityDeviceCredentials.SIGNATURE_HEADER)),
                "tampered signature base was accepted"
            );

            Map<String, String> secondSignature = restored.signatureHeaders(method, path, body);
            require(
                !headers.get(CommunityDeviceCredentials.NONCE_HEADER).equals(secondSignature.get(CommunityDeviceCredentials.NONCE_HEADER)),
                "request nonce was reused"
            );

            CommunityDeviceCredentials replacement = new CommunityDeviceCredentials(
                identity,
                "install-fedcba9876543210fedcba9876543210",
                "install"
            );
            require(!first.keyId().equals(replacement.keyId()), "a different installation reused the old private key");
            System.out.println("CommunityDeviceCredentialsProbe passed: " + first.keyId());
        } finally {
            try (var paths = Files.walk(root)) {
                paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                    try {
                        Files.deleteIfExists(path);
                    } catch (Exception ignored) {
                    }
                });
            }
        }
    }

    private static boolean verify(PublicKey key, String message, String encodedSignature) throws Exception {
        Signature verifier = Signature.getInstance("Ed25519");
        verifier.initVerify(key);
        verifier.update(message.getBytes(StandardCharsets.UTF_8));
        return verifier.verify(Base64.getUrlDecoder().decode(encodedSignature));
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }
}
