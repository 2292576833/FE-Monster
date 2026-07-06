package com.femonster.community;

/**
 * Public contract used by the open client to call the closed community module.
 * Implementations must live outside the open-source tree and keep their app
 * secret private.
 */
public interface CommunityModule {
    /**
     * Closed modules must verify their own package/signature/integrity before
     * accepting any request. Returning false disables the module.
     */
    default boolean verifyIntegrity() {
        return false;
    }

    /**
     * Generate a stable device fingerprint from raw local signals. Salts and
     * fingerprint algorithms must stay inside the closed module.
     */
    default String deviceFingerprint(CommunityDeviceRequest request) {
        return "";
    }

    /**
     * Sign a community request. The closed module owns timestamp, nonce, HMAC
     * generation and all signing secrets.
     */
    CommunitySignature sign(CommunityRequest request);

    default String moduleName() {
        return getClass().getName();
    }
}
