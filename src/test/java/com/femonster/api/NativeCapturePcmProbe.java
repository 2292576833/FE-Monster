package com.femonster.api;

import java.io.ByteArrayInputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Map;

public final class NativeCapturePcmProbe {
    public static void main(String[] args) throws Exception {
        Map<String, String> query = Map.of("frames", "2", "channels", "2", "sampleRate", "48000");
        byte[] bytes = ByteBuffer.allocate(16).order(ByteOrder.LITTLE_ENDIAN).putFloat(.25f).putFloat(-.25f).putFloat(.5f).putFloat(-.5f).array();
        ByteBuffer pcm = NativeCapturePcm.read(new ByteArrayInputStream(bytes), query, "application/octet-stream", bytes.length);
        if (!pcm.isDirect() || pcm.getFloat(4) != -.25f || pcm.remaining() != 16) throw new AssertionError("PCM layout");
        reject(() -> NativeCapturePcm.read(new ByteArrayInputStream(bytes), query, "text/plain", 16));
        reject(() -> NativeCapturePcm.read(new ByteArrayInputStream(bytes), query, "application/octet-stream", -1));
        reject(() -> NativeCapturePcm.read(new ByteArrayInputStream(new byte[15]), query, "application/octet-stream", 16));
        reject(() -> NativeCapturePcm.read(new ByteArrayInputStream(new byte[17]), query, "application/octet-stream", 16));
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).putFloat(Float.NaN);
        reject(() -> NativeCapturePcm.read(new ByteArrayInputStream(bytes), query, "application/octet-stream", 16));
        for (String invalid : new String[] { "0", "4097", "-1", "1.5", "" })
            reject(() -> NativeCapturePcm.requiredInteger(Map.of("frames", invalid), "frames", 1, 4096));
        reject(() -> NativeCapturePcm.requiredInteger(Map.of("channels", "3"), "channels", 1, 2));
        reject(() -> NativeCapturePcm.requiredInteger(Map.of("sampleRate", "8000000"), "sampleRate", 8000, 192000));
        System.out.println("Native capture transport PASS: bounded frames, direct LE PCM, exact bytes and finite samples");
    }
    private static void reject(Checked action) throws Exception {
        try { action.run(); } catch (IllegalArgumentException expected) { return; }
        throw new AssertionError("Invalid input accepted");
    }
    private interface Checked { void run() throws Exception; }
}
