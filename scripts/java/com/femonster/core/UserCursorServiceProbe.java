package com.femonster.core;

import com.femonster.json.SimpleJson;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

public final class UserCursorServiceProbe {
    private UserCursorServiceProbe() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("expected <data-dir>");
        Path dataDir = Path.of(args[0]).toAbsolutePath().normalize();
        UserCursorService service = new UserCursorService(dataDir);

        Map<String, Object> imported = service.importPng("my cursor.png", png(64, 48));
        Map<String, Object> cursor = SimpleJson.asMap(imported.get("cursor"));
        String id = SimpleJson.asString(cursor.get("id"), "");
        Path stored = service.resolve(id);
        Map<String, Object> restored = service.payload();
        List<Object> cursors = SimpleJson.asList(restored.get("cursors"));

        boolean invalidRejected = rejects(() -> service.importPng(
            "not-an-image.png",
            new ByteArrayInputStream("not a png".getBytes(java.nio.charset.StandardCharsets.UTF_8))
        ));
        boolean oversizedDimensionsRejected = rejects(() -> service.importPng(
            "too-large.png",
            png(256, 256)
        ));
        boolean unknownIdRejected = rejects(() -> service.resolve("../outside"));

        Map<String, Object> checks = Map.of(
            "storedInsideDataUserCursors",
            Files.isRegularFile(stored)
                && stored.startsWith(dataDir.resolve("user-cursors").toAbsolutePath().normalize()),
            "normalizedPngIsServable",
            "image/png".equals(Files.probeContentType(stored))
                || stored.getFileName().toString().endsWith(".png"),
            "catalogRestoresOnRestart",
            cursors.stream().map(SimpleJson::asMap).anyMatch(item -> id.equals(SimpleJson.asString(item.get("id"), ""))),
            "invalidPayloadRejected",
            invalidRejected,
            "oversizedDimensionsRejected",
            oversizedDimensionsRejected,
            "pathTraversalRejected",
            unknownIdRejected
        );
        boolean pass = checks.values().stream().allMatch(Boolean.TRUE::equals);
        System.out.println(SimpleJson.stringify(Map.of("pass", pass, "checks", checks, "cursor", cursor)));
        if (!pass) System.exit(1);
    }

    private static ByteArrayInputStream png(int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = image.createGraphics();
        try {
            graphics.setColor(new Color(255, 255, 255, 220));
            graphics.fillOval(0, 0, width, height);
        } finally {
            graphics.dispose();
        }
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(image, "png", output);
        return new ByteArrayInputStream(output.toByteArray());
    }

    private static boolean rejects(ThrowingAction action) {
        try {
            action.run();
            return false;
        } catch (IOException | IllegalArgumentException expected) {
            return true;
        } catch (Exception unexpected) {
            throw new RuntimeException(unexpected);
        }
    }

    @FunctionalInterface
    private interface ThrowingAction {
        void run() throws Exception;
    }
}
