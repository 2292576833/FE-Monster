package com.femonster.api;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Map;

/** Bounded analysis-only transport from the native macOS capture service. */
final class NativeCapturePcm {
    private NativeCapturePcm() {}

    static int requiredInteger(Map<String, String> query, String name, int minimum, int maximum) {
        try {
            int value = Integer.parseInt(query.getOrDefault(name, ""));
            if (value < minimum || value > maximum) throw new NumberFormatException();
            return value;
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException("invalid capture " + name);
        }
    }

    static ByteBuffer read(InputStream input, Map<String, String> query, String contentType, long contentLength) throws IOException {
        if (contentType == null || !contentType.split(";", 2)[0].trim().equalsIgnoreCase("application/octet-stream")) {
            throw new IllegalArgumentException("native capture requires application/octet-stream");
        }
        int frames = requiredInteger(query, "frames", 1, 4096);
        int channels = requiredInteger(query, "channels", 1, 2);
        requiredInteger(query, "sampleRate", 8000, 192000);
        int bytes = frames * channels * Float.BYTES;
        if (contentLength != bytes) throw new IllegalArgumentException("invalid capture PCM byte length");
        byte[] encoded;
        try (input) {
            encoded = input.readNBytes(bytes + 1);
        }
        if (encoded.length != bytes) throw new IllegalArgumentException("capture PCM ended early or exceeded its frame count");
        ByteBuffer buffer = ByteBuffer.allocateDirect(bytes).order(ByteOrder.LITTLE_ENDIAN);
        buffer.put(encoded).flip();
        for (int offset = 0; offset < bytes; offset += Float.BYTES) {
            if (!Float.isFinite(buffer.getFloat(offset))) throw new IllegalArgumentException("capture PCM contains a non-finite sample");
        }
        return buffer;
    }
}
