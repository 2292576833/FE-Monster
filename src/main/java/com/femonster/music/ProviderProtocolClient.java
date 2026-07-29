package com.femonster.music;

import java.nio.file.Path;

/**
 * Uses exactly one documented FE sidecar route per operation.
 * GenericMusicClient remains available for manually configured legacy APIs.
 */
public final class ProviderProtocolClient extends GenericMusicClient {
    public ProviderProtocolClient(String id, String label, String baseUrl) {
        this(id, label, baseUrl, null);
    }

    public ProviderProtocolClient(String id, String label, String baseUrl, Path sessionFile) {
        super(id, label, baseUrl, sessionFile, ProviderProtocol.forProvider(id), true);
    }
}
