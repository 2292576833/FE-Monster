package com.femonster.core;

import com.femonster.json.SimpleJson;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public final class UserCursorService {
    private static final int MAX_NORMALIZED_PNG_BYTES = 512 * 1024;
    private static final int MAX_CURSOR_DIMENSION = 128;
    private static final int MAX_CURSOR_COUNT = 64;
    private static final Pattern CURSOR_ID = Pattern.compile(
        "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    );
    private static final byte[] PNG_SIGNATURE = new byte[] {
        (byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
    };

    private final Path cursorDir;

    public UserCursorService(Path dataDir) {
        this.cursorDir = dataDir.resolve("user-cursors").toAbsolutePath().normalize();
    }

    public Map<String, Object> payload() throws IOException {
        Files.createDirectories(cursorDir);
        List<Map<String, Object>> cursors = new ArrayList<>();
        try (Stream<Path> stream = Files.list(cursorDir)) {
            stream
                .filter(Files::isRegularFile)
                .filter(UserCursorService::isCursorFile)
                .sorted(Comparator.comparingLong(UserCursorService::lastModified).reversed())
                .limit(MAX_CURSOR_COUNT)
                .forEach(path -> cursors.add(item(path)));
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("cursors", cursors);
        body.put("maximumCount", MAX_CURSOR_COUNT);
        return body;
    }

    public Map<String, Object> importPng(String originalName, InputStream input) throws IOException {
        byte[] source = input.readNBytes(MAX_NORMALIZED_PNG_BYTES + 1);
        if (source.length == 0 || source.length > MAX_NORMALIZED_PNG_BYTES) {
            throw new IOException("cursor PNG exceeds 512 KiB");
        }
        requirePngSignature(source);
        BufferedImage decoded = decodeBoundedPng(source);
        BufferedImage normalized = new BufferedImage(
            decoded.getWidth(),
            decoded.getHeight(),
            BufferedImage.TYPE_INT_ARGB
        );
        Graphics2D graphics = normalized.createGraphics();
        try {
            graphics.drawImage(decoded, 0, 0, null);
        } finally {
            graphics.dispose();
        }
        ByteArrayOutputStream encoded = new ByteArrayOutputStream();
        if (!ImageIO.write(normalized, "png", encoded)) throw new IOException("cursor PNG encoder is unavailable");
        byte[] pixelsOnly = encoded.toByteArray();
        if (pixelsOnly.length > MAX_NORMALIZED_PNG_BYTES) throw new IOException("normalized cursor PNG exceeds 512 KiB");

        Files.createDirectories(cursorDir);
        enforceCatalogLimit();
        String id = UUID.randomUUID().toString().toLowerCase(Locale.ROOT);
        Path target = cursorDir.resolve(id + ".png").normalize();
        if (!target.startsWith(cursorDir)) throw new IOException("invalid cursor path");
        Path temporary = cursorDir.resolve(id + ".tmp").normalize();
        try {
            Files.write(temporary, pixelsOnly, StandardOpenOption.CREATE_NEW);
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException error) {
            Files.deleteIfExists(temporary);
            Files.deleteIfExists(target);
            throw error;
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("sourceName", safeDisplayName(originalName));
        body.put("cursor", item(target));
        return body;
    }

    public Path resolve(String rawId) throws IOException {
        String id = normalizeId(rawId);
        Path candidate = cursorDir.resolve(id + ".png").normalize();
        if (!candidate.startsWith(cursorDir) || !Files.isRegularFile(candidate)) {
            throw new IOException("user cursor not found");
        }
        if (Files.isSymbolicLink(cursorDir) || Files.isSymbolicLink(candidate) || !isCursorFile(candidate)) {
            throw new IOException("user cursor not found");
        }
        return candidate;
    }

    private static BufferedImage decodeBoundedPng(byte[] source) throws IOException {
        try (ImageInputStream imageInput = ImageIO.createImageInputStream(new ByteArrayInputStream(source))) {
            if (imageInput == null) throw new IOException("invalid cursor PNG");
            Iterator<ImageReader> readers = ImageIO.getImageReaders(imageInput);
            if (!readers.hasNext()) throw new IOException("invalid cursor PNG");
            ImageReader reader = readers.next();
            try {
                if (!"png".equalsIgnoreCase(reader.getFormatName())) throw new IOException("cursor must be PNG");
                reader.setInput(imageInput, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > MAX_CURSOR_DIMENSION || height > MAX_CURSOR_DIMENSION) {
                    throw new IOException("cursor dimensions must be between 1 and 128 pixels");
                }
                BufferedImage decoded = reader.read(0);
                if (decoded == null) throw new IOException("invalid cursor PNG");
                return decoded;
            } finally {
                reader.dispose();
            }
        }
    }

    private void enforceCatalogLimit() throws IOException {
        try (Stream<Path> stream = Files.list(cursorDir)) {
            if (stream.filter(Files::isRegularFile).filter(UserCursorService::isCursorFile).count() >= MAX_CURSOR_COUNT) {
                throw new IOException("user cursor limit reached");
            }
        }
    }

    private static void requirePngSignature(byte[] source) throws IOException {
        if (source.length < PNG_SIGNATURE.length) throw new IOException("invalid cursor PNG");
        for (int index = 0; index < PNG_SIGNATURE.length; index++) {
            if (source[index] != PNG_SIGNATURE[index]) throw new IOException("invalid cursor PNG");
        }
    }

    private static Map<String, Object> item(Path path) {
        String filename = path.getFileName().toString();
        String id = filename.substring(0, filename.length() - ".png".length());
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", id);
        item.put("name", "自定义光标 " + id.substring(0, 6));
        item.put("kind", "image");
        item.put("format", "png");
        item.put("staticFrame", true);
        item.put("url", "/api/user-cursors/file?id=" + URLEncoder.encode(id, StandardCharsets.UTF_8));
        return item;
    }

    private static String normalizeId(String rawId) throws IOException {
        String id = SimpleJson.asString(rawId, "").trim().toLowerCase(Locale.ROOT);
        if (!CURSOR_ID.matcher(id).matches()) throw new IOException("invalid user cursor id");
        return id;
    }

    private static String safeDisplayName(String originalName) {
        if (originalName == null || originalName.isBlank()) return "cursor.png";
        try {
            String name = Path.of(originalName).getFileName().toString();
            name = name.replaceAll("[\\x00-\\x1f<>:\"/\\\\|?*]", "_").trim();
            return name.isBlank() ? "cursor.png" : name.substring(0, Math.min(120, name.length()));
        } catch (RuntimeException ignored) {
            return "cursor.png";
        }
    }

    private static boolean isCursorFile(Path path) {
        String name = path.getFileName().toString().toLowerCase(Locale.ROOT);
        return name.endsWith(".png")
            && CURSOR_ID.matcher(name.substring(0, name.length() - ".png".length())).matches();
    }

    private static long lastModified(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (IOException ignored) {
            return 0;
        }
    }
}
