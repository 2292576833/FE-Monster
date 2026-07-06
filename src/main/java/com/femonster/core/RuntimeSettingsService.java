package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

public final class RuntimeSettingsService {
    private final Path file;
    private boolean gpuAcceleration = true;
    private boolean directX11 = true;
    private boolean xAudio2 = true;
    private boolean x3DAudio = true;
    private boolean gestureControl = false;
    private String gestureCameraSource = "webcam";

    public RuntimeSettingsService(Path file) {
        this.file = file.toAbsolutePath().normalize();
        restore();
    }

    public synchronized Map<String, Object> snapshot() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("gpuAcceleration", gpuAcceleration);
        body.put("directX11", directX11);
        body.put("xAudio2", xAudio2);
        body.put("x3DAudio", x3DAudio);
        body.put("gestureControl", gestureControl);
        body.put("gestureCameraSource", gestureCameraSource);
        return body;
    }

    public synchronized Map<String, Object> update(Map<String, Object> next) {
        gpuAcceleration = SimpleJson.asBoolean(next.get("gpuAcceleration"), gpuAcceleration);
        directX11 = SimpleJson.asBoolean(next.get("directX11"), directX11);
        xAudio2 = SimpleJson.asBoolean(next.get("xAudio2"), xAudio2);
        x3DAudio = SimpleJson.asBoolean(next.get("x3DAudio"), x3DAudio);
        gestureControl = SimpleJson.asBoolean(next.get("gestureControl"), gestureControl);
        gestureCameraSource = normalizeGestureCameraSource(SimpleJson.asString(next.get("gestureCameraSource"), gestureCameraSource));
        save();
        return snapshot();
    }

    public synchronized boolean gestureControlEnabled() {
        return gestureControl;
    }

    public synchronized String gestureCameraSource() {
        return gestureCameraSource;
    }

    private void restore() {
        if (!Files.exists(file)) return;
        try {
            Map<String, Object> root = SimpleJson.parseObject(Files.readString(file, StandardCharsets.UTF_8));
            gpuAcceleration = SimpleJson.asBoolean(root.get("gpuAcceleration"), gpuAcceleration);
            directX11 = SimpleJson.asBoolean(root.get("directX11"), directX11);
            xAudio2 = SimpleJson.asBoolean(root.get("xAudio2"), xAudio2);
            x3DAudio = SimpleJson.asBoolean(root.get("x3DAudio"), x3DAudio);
            gestureControl = SimpleJson.asBoolean(root.get("gestureControl"), gestureControl);
            gestureCameraSource = normalizeGestureCameraSource(SimpleJson.asString(root.get("gestureCameraSource"), gestureCameraSource));
        } catch (IOException | RuntimeException ignored) {
        }
    }

    private static String normalizeGestureCameraSource(String source) {
        if (source == null) return "webcam";
        String normalized = source.trim().toLowerCase();
        return "camera".equals(normalized) || "canon".equals(normalized) || "eos".equals(normalized) ? "camera" : "webcam";
    }

    private void save() {
        try {
            Path parent = file.getParent();
            if (parent != null) Files.createDirectories(parent);
            Files.writeString(file, SimpleJson.stringify(snapshot()), StandardCharsets.UTF_8);
        } catch (IOException ignored) {
        }
    }
}
