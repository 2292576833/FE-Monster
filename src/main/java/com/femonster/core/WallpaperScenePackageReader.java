package com.femonster.core;

import java.io.EOFException;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.channels.FileChannel;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Reads the bounded file index from a Wallpaper Engine scene package.
 *
 * <p>The package contents are never extracted or executed here. Wallpaper Engine remains the
 * runtime for SceneScript, materials and shaders; this reader only provides a safe inventory for
 * projects that the application has already discovered.</p>
 */
public final class WallpaperScenePackageReader {
    private static final Set<String> SUPPORTED_VERSIONS = Set.of(
        "PKGV0013", "PKGV0015", "PKGV0020", "PKGV0021"
    );
    private static final int VERSION_LENGTH = 8;
    private static final int MAX_ENTRY_COUNT = 8_192;
    private static final int MAX_ENTRY_NAME_BYTES = 4_096;
    private static final long MAX_INDEX_BYTES = 16L * 1024L * 1024L;
    private static final int MAX_SCENE_SCRIPT_SCAN_BYTES = 16 * 1024 * 1024;
    private static final byte[] SCRIPT_FIELD = "\"script\"".getBytes(StandardCharsets.US_ASCII);

    private WallpaperScenePackageReader() {
    }

    public static PackageIndex inspect(Path rawPackage) throws IOException {
        if (rawPackage == null || !Files.isRegularFile(rawPackage)) {
            throw new IOException("Wallpaper Engine scene package not found");
        }
        Path packageFile = rawPackage.toRealPath();
        long packageSize = Files.size(packageFile);
        if (packageSize < 16L) throw new IOException("Wallpaper Engine scene package is truncated");

        try (FileChannel channel = FileChannel.open(packageFile, StandardOpenOption.READ)) {
            long versionLength = readUnsignedInt(channel);
            if (versionLength != VERSION_LENGTH) {
                throw new IOException("unsupported Wallpaper Engine package header");
            }
            byte[] versionBytes = readBytes(channel, VERSION_LENGTH);
            String version = new String(versionBytes, StandardCharsets.US_ASCII);
            if (!version.matches("PKGV\\d{4}")) {
                throw new IOException("invalid Wallpaper Engine package version");
            }

            long declaredEntryCount = readUnsignedInt(channel);
            if (!SUPPORTED_VERSIONS.contains(version)) {
                return new PackageIndex(
                    version,
                    false,
                    packageSize,
                    -1L,
                    -1L,
                    declaredEntryCount,
                    List.of(),
                    false,
                    false
                );
            }
            if (declaredEntryCount > MAX_ENTRY_COUNT) {
                throw new IOException("Wallpaper Engine package contains too many entries");
            }

            List<Entry> entries = new ArrayList<>((int) declaredEntryCount);
            Set<String> normalizedNames = new HashSet<>();
            for (int index = 0; index < (int) declaredEntryCount; index++) {
                ensureIndexBound(channel.position(), 4L, packageSize);
                long rawNameLength = readUnsignedInt(channel);
                if (rawNameLength < 1L || rawNameLength > MAX_ENTRY_NAME_BYTES) {
                    throw new IOException("invalid Wallpaper Engine package entry name length");
                }
                ensureIndexBound(channel.position(), rawNameLength + 8L, packageSize);
                String name = decodeEntryName(readBytes(channel, (int) rawNameLength));
                String duplicateKey = name.toLowerCase(Locale.ROOT);
                if (!normalizedNames.add(duplicateKey)) {
                    throw new IOException("duplicate Wallpaper Engine package entry");
                }
                long offset = readUnsignedInt(channel);
                long size = readUnsignedInt(channel);
                entries.add(new Entry(name, offset, size, resourceCategory(name), isSourceCode(name)));
            }

            long payloadStart = channel.position();
            if (payloadStart > MAX_INDEX_BYTES || payloadStart > packageSize) {
                throw new IOException("Wallpaper Engine package index exceeds the safe limit");
            }
            long payloadBytes = packageSize - payloadStart;
            validateRanges(entries, payloadBytes);

            boolean scriptScanComplete = true;
            boolean embeddedSceneScript = false;
            List<Entry> enrichedEntries = new ArrayList<>(entries.size());
            for (Entry entry : entries) {
                boolean code = entry.sourceCode();
                if (isSceneJson(entry.name())) {
                    int bytesToRead = (int) Math.min(entry.size(), MAX_SCENE_SCRIPT_SCAN_BYTES);
                    byte[] scenePrefix = readEntryPrefix(channel, payloadStart, entry, bytesToRead);
                    boolean containsScript = contains(scenePrefix, SCRIPT_FIELD);
                    embeddedSceneScript |= containsScript;
                    code |= containsScript;
                    if (entry.size() > MAX_SCENE_SCRIPT_SCAN_BYTES) scriptScanComplete = false;
                }
                enrichedEntries.add(new Entry(
                    entry.name(),
                    entry.offset(),
                    entry.size(),
                    entry.category(),
                    code
                ));
            }

            return new PackageIndex(
                version,
                true,
                packageSize,
                payloadStart,
                payloadBytes,
                declaredEntryCount,
                enrichedEntries,
                embeddedSceneScript,
                scriptScanComplete
            );
        }
    }

    static String resourceCategory(String rawName) {
        String name = rawName == null ? "" : rawName.toLowerCase(Locale.ROOT);
        int dot = name.lastIndexOf('.');
        String extension = dot >= 0 ? name.substring(dot) : "";
        return switch (extension) {
            case ".frag", ".vert", ".glsl", ".hlsl", ".inc" -> "shader-source";
            case ".js", ".mjs", ".ts" -> "script-source";
            case ".dxs", ".cso", ".spv" -> "compiled-shader";
            case ".json" -> "scene-data";
            case ".tex", ".dds", ".ktx", ".ktx2" -> "texture";
            case ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg" -> "image";
            case ".mp4", ".webm", ".mov" -> "video";
            case ".mp3", ".wav", ".ogg", ".oga", ".flac", ".m4a" -> "audio";
            case ".ttf", ".otf", ".woff", ".woff2" -> "font";
            case ".obj", ".fbx", ".gltf", ".glb" -> "model";
            case ".pkg" -> "scene-package";
            default -> "binary-resource";
        };
    }

    static boolean isSourceCode(String rawName) {
        String category = resourceCategory(rawName);
        return "shader-source".equals(category) || "script-source".equals(category);
    }

    private static void validateRanges(List<Entry> entries, long payloadBytes) throws IOException {
        for (Entry entry : entries) {
            if (entry.offset() > payloadBytes || entry.size() > payloadBytes - entry.offset()) {
                throw new IOException("Wallpaper Engine package entry is outside the payload");
            }
        }

        List<Entry> ranges = entries.stream()
            .filter(entry -> entry.size() > 0L)
            .sorted(Comparator.comparingLong(Entry::offset).thenComparingLong(Entry::size))
            .toList();
        long previousEnd = 0L;
        boolean first = true;
        for (Entry entry : ranges) {
            if (!first && entry.offset() < previousEnd) {
                throw new IOException("Wallpaper Engine package entries overlap");
            }
            previousEnd = entry.offset() + entry.size();
            first = false;
        }
    }

    private static String decodeEntryName(byte[] bytes) throws IOException {
        String decoded;
        try {
            decoded = StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes))
                .toString();
        } catch (CharacterCodingException error) {
            throw new IOException("Wallpaper Engine package entry name is not valid UTF-8", error);
        }
        String normalized = decoded.replace('\\', '/');
        if (normalized.startsWith("/") || normalized.contains(":")) {
            throw new IOException("Wallpaper Engine package entry path is not relative");
        }
        for (int index = 0; index < normalized.length(); index++) {
            char character = normalized.charAt(index);
            if (character < 0x20 || character == 0x7f) {
                throw new IOException("Wallpaper Engine package entry path contains control characters");
            }
        }
        String[] segments = normalized.split("/", -1);
        for (String segment : segments) {
            if (segment.isBlank() || ".".equals(segment) || "..".equals(segment)) {
                throw new IOException("Wallpaper Engine package entry path contains traversal");
            }
        }
        return normalized;
    }

    private static boolean isSceneJson(String name) {
        String normalized = name.toLowerCase(Locale.ROOT);
        return "scene.json".equals(normalized) || normalized.endsWith("/scene.json");
    }

    private static byte[] readEntryPrefix(
        FileChannel channel,
        long payloadStart,
        Entry entry,
        int byteCount
    ) throws IOException {
        if (byteCount <= 0) return new byte[0];
        channel.position(payloadStart + entry.offset());
        return readBytes(channel, byteCount);
    }

    private static boolean contains(byte[] haystack, byte[] needle) {
        if (needle.length == 0 || haystack.length < needle.length) return false;
        int last = haystack.length - needle.length;
        for (int start = 0; start <= last; start++) {
            int index = 0;
            while (index < needle.length && haystack[start + index] == needle[index]) index++;
            if (index == needle.length) return true;
        }
        return false;
    }

    private static void ensureIndexBound(long position, long requested, long packageSize) throws IOException {
        if (position < 0L || requested < 0L || position > MAX_INDEX_BYTES
            || requested > MAX_INDEX_BYTES - position
            || position > packageSize
            || requested > packageSize - position) {
            throw new IOException("Wallpaper Engine package index is truncated or too large");
        }
    }

    private static long readUnsignedInt(FileChannel channel) throws IOException {
        ByteBuffer buffer = ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN);
        readFully(channel, buffer);
        buffer.flip();
        return Integer.toUnsignedLong(buffer.getInt());
    }

    private static byte[] readBytes(FileChannel channel, int length) throws IOException {
        ByteBuffer buffer = ByteBuffer.allocate(length);
        readFully(channel, buffer);
        return buffer.array();
    }

    private static void readFully(FileChannel channel, ByteBuffer buffer) throws IOException {
        while (buffer.hasRemaining()) {
            if (channel.read(buffer) < 0) throw new EOFException("Wallpaper Engine scene package is truncated");
        }
    }

    public record Entry(String name, long offset, long size, String category, boolean sourceCode) {
    }

    public record PackageIndex(
        String version,
        boolean formatSupported,
        long packageSize,
        long payloadStart,
        long payloadBytes,
        long declaredEntryCount,
        List<Entry> entries,
        boolean embeddedSceneScript,
        boolean scriptScanComplete
    ) {
        public PackageIndex {
            entries = List.copyOf(entries);
        }

        public long sourceCodeEntryCount() {
            return entries.stream().filter(Entry::sourceCode).count();
        }

        public long categoryCount(String category) {
            return entries.stream().filter(entry -> category.equals(entry.category())).count();
        }
    }
}
