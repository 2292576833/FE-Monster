package com.femonster.ai.tts;

import java.io.IOException;
import java.net.URI;
import java.util.Map;

/** Narrow WebSocket seam so protocol behavior can be tested without network credentials. */
public interface DoubaoV3Transport {
    interface Factory {
        Connection connect(URI endpoint, Map<String, String> headers, Listener listener) throws IOException;
    }

    interface Connection {
        void send(byte[] frame) throws IOException;
        void close();
    }

    interface Listener {
        void onBinary(byte[] frame);
        void onClosed(int statusCode, String reason);
        void onFailure(Throwable error);
    }
}
