package com.femonster.ai.tts;

import com.femonster.ai.AiProviderCatalog;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Production Java 17 WebSocket transport for the fixed Doubao V3 endpoint. */
public final class JavaNetDoubaoV3TransportFactory implements DoubaoV3Transport.Factory {
    private static final URI OFFICIAL_ENDPOINT = URI.create(AiProviderCatalog.DOUBAO_TTS_V3_ENDPOINT);
    private static final Set<String> API_KEY_HEADERS = Set.of(
        "X-Api-Key", "X-Api-Resource-Id", "X-Api-Connect-Id"
    );
    private static final Set<String> LEGACY_HEADERS = Set.of(
        "X-Api-App-Key", "X-Api-Access-Key", "X-Api-Resource-Id", "X-Api-Connect-Id"
    );
    private static final int MAX_FRAME_BYTES = 10 * 1024 * 1024;
    private final HttpClient client;

    public JavaNetDoubaoV3TransportFactory() {
        this(HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build());
    }

    JavaNetDoubaoV3TransportFactory(HttpClient client) {
        if (client == null) throw new IllegalArgumentException("WebSocket HTTP client is required");
        this.client = client;
    }

    @Override
    public DoubaoV3Transport.Connection connect(
        URI endpoint,
        Map<String, String> headers,
        DoubaoV3Transport.Listener listener
    ) throws IOException {
        if (!OFFICIAL_ENDPOINT.equals(endpoint)) {
            throw new IOException("Doubao V3 endpoint is not the fixed official endpoint");
        }
        validateHeaders(headers);
        if (listener == null) throw new IOException("Doubao WebSocket listener is required");

        WebSocket.Builder builder = client.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(10));
        for (Map.Entry<String, String> entry : headers.entrySet()) builder.header(entry.getKey(), entry.getValue());
        BridgeListener bridge = new BridgeListener(listener);
        try {
            WebSocket socket = builder.buildAsync(endpoint, bridge)
                .orTimeout(12, TimeUnit.SECONDS)
                .join();
            return new JavaNetConnection(socket);
        } catch (CompletionException error) {
            throw new IOException("Doubao WebSocket handshake failed");
        }
    }

    private static void validateHeaders(Map<String, String> headers) throws IOException {
        if (headers == null || (!headers.keySet().equals(API_KEY_HEADERS) && !headers.keySet().equals(LEGACY_HEADERS))) {
            throw new IOException("invalid Doubao authentication header set");
        }
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            String value = entry.getValue();
            if (value == null || value.isBlank() || value.length() > 4096) {
                throw new IOException("invalid Doubao authentication header value");
            }
            for (int index = 0; index < value.length(); index++) {
                char c = value.charAt(index);
                if (c < 0x20 || c == 0x7f) throw new IOException("invalid Doubao authentication header value");
            }
        }
        String resourceId = headers.get("X-Api-Resource-Id");
        if (!Set.of("seed-tts-2.0", "seed-icl-2.0").contains(resourceId)) {
            throw new IOException("unsupported Doubao resource ID");
        }
    }

    private static final class JavaNetConnection implements DoubaoV3Transport.Connection {
        private final WebSocket socket;
        private final AtomicBoolean closed = new AtomicBoolean(false);
        private final Object sendLock = new Object();

        private JavaNetConnection(WebSocket socket) {
            this.socket = socket;
        }

        @Override
        public void send(byte[] frame) throws IOException {
            if (frame == null || frame.length == 0 || frame.length > MAX_FRAME_BYTES) {
                throw new IOException("invalid Doubao WebSocket frame size");
            }
            synchronized (sendLock) {
                if (closed.get()) throw new IOException("Doubao WebSocket is closed");
                try {
                    socket.sendBinary(ByteBuffer.wrap(frame), true).join();
                } catch (CompletionException error) {
                    throw new IOException("Doubao WebSocket send failed");
                }
            }
        }

        @Override
        public void close() {
            if (!closed.compareAndSet(false, true)) return;
            try {
                socket.sendClose(WebSocket.NORMAL_CLOSURE, "");
            } catch (RuntimeException error) {
                socket.abort();
            }
        }
    }

    private static final class BridgeListener implements WebSocket.Listener {
        private final DoubaoV3Transport.Listener downstream;
        private final Object frameLock = new Object();
        private ByteArrayOutputStream fragments = new ByteArrayOutputStream();
        private int fragmentBytes;
        private final AtomicBoolean terminal = new AtomicBoolean(false);

        private BridgeListener(DoubaoV3Transport.Listener downstream) {
            this.downstream = downstream;
        }

        @Override
        public void onOpen(WebSocket webSocket) {
            webSocket.request(1);
        }

        @Override
        public CompletionStage<?> onBinary(WebSocket webSocket, ByteBuffer data, boolean last) {
            byte[] complete = null;
            synchronized (frameLock) {
                int incoming = data.remaining();
                if (terminal.get() || incoming > MAX_FRAME_BYTES - fragmentBytes) {
                    terminal.set(true);
                    fragments.reset();
                    fragmentBytes = 0;
                    webSocket.abort();
                    downstream.onFailure(new IOException("Doubao WebSocket frame exceeded the limit"));
                    return null;
                }
                byte[] bytes = new byte[incoming];
                data.get(bytes);
                fragments.writeBytes(bytes);
                fragmentBytes += incoming;
                if (last) {
                    complete = fragments.toByteArray();
                    fragments = new ByteArrayOutputStream();
                    fragmentBytes = 0;
                }
            }
            if (complete != null) downstream.onBinary(complete);
            if (!terminal.get()) webSocket.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onText(WebSocket webSocket, CharSequence data, boolean last) {
            if (terminal.compareAndSet(false, true)) {
                webSocket.abort();
                downstream.onFailure(new IOException("Doubao returned an unexpected text frame"));
            }
            return null;
        }

        @Override
        public CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            if (terminal.compareAndSet(false, true)) downstream.onClosed(statusCode, "");
            return null;
        }

        @Override
        public void onError(WebSocket webSocket, Throwable error) {
            if (terminal.compareAndSet(false, true)) downstream.onFailure(error);
        }
    }
}
