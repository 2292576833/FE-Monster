package com.femonster.memory;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Canonical JSON used for encrypted payloads and idempotency comparison. */
public final class CanonicalMemoryJson {
    public static final int MAX_JSON_BYTES = 1_048_576;
    private static final int MAX_DEPTH = 12;
    private static final int MAX_COLLECTION_SIZE = 1_000;

    private CanonicalMemoryJson() {
    }

    public static byte[] encode(Object value) {
        BoundedOutput output = new BoundedOutput();
        write(value, output, 0);
        return output.toByteArray();
    }

    public static String stringify(Object value) {
        return new String(encode(value), StandardCharsets.UTF_8);
    }

    public static Map<String, Object> immutableObject(Map<String, Object> value) {
        if (value == null) throw invalid();
        @SuppressWarnings("unchecked")
        Map<String, Object> frozen = (Map<String, Object>) freeze(value, 0);
        // Enforce the aggregate encrypted-record ceiling after recursive normalization.
        encode(frozen);
        return frozen;
    }

    private static Object freeze(Object value, int depth) {
        requireDepth(depth);
        if (value == null || value instanceof Boolean) return value;
        if (value instanceof String text) {
            validateUnicode(text);
            return text;
        }
        if (value instanceof Number number) return normalizeNumber(number);
        if (value instanceof Map<?, ?> map) {
            requireCollectionSize(map.size());
            ArrayList<String> keys = new ArrayList<>(map.size());
            for (Object key : map.keySet()) {
                if (!(key instanceof String text)) throw invalid();
                validateUnicode(text);
                keys.add(text);
            }
            Collections.sort(keys);
            LinkedHashMap<String, Object> frozen = new LinkedHashMap<>(keys.size());
            for (String key : keys) frozen.put(key, freeze(map.get(key), depth + 1));
            return Collections.unmodifiableMap(frozen);
        }
        if (value instanceof List<?> list) {
            requireCollectionSize(list.size());
            ArrayList<Object> frozen = new ArrayList<>(list.size());
            for (Object item : list) frozen.add(freeze(item, depth + 1));
            return Collections.unmodifiableList(frozen);
        }
        throw invalid();
    }

    private static void write(Object value, BoundedOutput output, int depth) {
        requireDepth(depth);
        if (value == null) {
            output.ascii("null");
            return;
        }
        if (value instanceof Boolean bool) {
            output.ascii(bool ? "true" : "false");
            return;
        }
        if (value instanceof String text) {
            writeString(text, output);
            return;
        }
        if (value instanceof Number number) {
            output.ascii(canonicalNumber(number));
            return;
        }
        if (value instanceof Map<?, ?> map) {
            requireCollectionSize(map.size());
            ArrayList<String> keys = new ArrayList<>(map.size());
            for (Object key : map.keySet()) {
                if (!(key instanceof String text)) throw invalid();
                validateUnicode(text);
                keys.add(text);
            }
            Collections.sort(keys);
            output.ascii("{");
            boolean first = true;
            for (String key : keys) {
                if (!first) output.ascii(",");
                first = false;
                writeString(key, output);
                output.ascii(":");
                write(map.get(key), output, depth + 1);
            }
            output.ascii("}");
            return;
        }
        if (value instanceof List<?> list) {
            requireCollectionSize(list.size());
            output.ascii("[");
            boolean first = true;
            for (Object item : list) {
                if (!first) output.ascii(",");
                first = false;
                write(item, output, depth + 1);
            }
            output.ascii("]");
            return;
        }
        throw invalid();
    }

    private static void writeString(String value, BoundedOutput output) {
        validateUnicode(value);
        output.ascii("\"");
        int runStart = 0;
        for (int index = 0; index < value.length(); index++) {
            char current = value.charAt(index);
            String escape = switch (current) {
                case '\"' -> "\\\"";
                case '\\' -> "\\\\";
                case '\b' -> "\\b";
                case '\f' -> "\\f";
                case '\n' -> "\\n";
                case '\r' -> "\\r";
                case '\t' -> "\\t";
                default -> current < 0x20 ? String.format("\\u%04x", (int) current) : null;
            };
            if (escape == null) continue;
            if (runStart < index) output.utf8(value.substring(runStart, index));
            output.ascii(escape);
            runStart = index + 1;
        }
        if (runStart < value.length()) output.utf8(value.substring(runStart));
        output.ascii("\"");
    }

    private static Number normalizeNumber(Number number) {
        String canonical = canonicalNumber(number);
        if (canonical.indexOf('.') < 0) {
            try {
                return Long.valueOf(canonical);
            } catch (NumberFormatException ignored) {
                return new BigInteger(canonical);
            }
        }
        return new BigDecimal(canonical);
    }

    private static String canonicalNumber(Number number) {
        if (number == null) throw invalid();
        BigDecimal decimal;
        if (number instanceof Byte || number instanceof Short || number instanceof Integer || number instanceof Long) {
            decimal = BigDecimal.valueOf(number.longValue());
        } else if (number instanceof BigInteger integer) {
            decimal = new BigDecimal(integer);
        } else if (number instanceof BigDecimal bigDecimal) {
            decimal = bigDecimal;
        } else if (number instanceof Double boxed) {
            double value = boxed;
            if (!Double.isFinite(value) || Double.doubleToRawLongBits(value) == Double.doubleToRawLongBits(-0.0d)) {
                throw invalidNumber();
            }
            decimal = BigDecimal.valueOf(value);
        } else if (number instanceof Float boxed) {
            float value = boxed;
            if (!Float.isFinite(value) || Float.floatToRawIntBits(value) == Float.floatToRawIntBits(-0.0f)) {
                throw invalidNumber();
            }
            decimal = new BigDecimal(Float.toString(value));
        } else {
            throw invalidNumber();
        }
        if (decimal.signum() == 0 && number.toString().startsWith("-")) throw invalidNumber();
        if (decimal.signum() == 0) return "0";
        BigDecimal stripped = decimal.stripTrailingZeros();
        long sign = stripped.signum() < 0 ? 1L : 0L;
        long precision = stripped.precision();
        long scale = stripped.scale();
        long plainLength = scale <= 0
            ? sign + precision - scale
            : sign + (scale >= precision ? scale + 2L : precision + 1L);
        if (plainLength > MAX_JSON_BYTES) {
            throw new LocalMemoryException(LocalMemoryException.Code.TOO_LARGE);
        }
        if (stripped.scale() < 0) stripped = stripped.setScale(0);
        return stripped.toPlainString();
    }

    private static void validateUnicode(String value) {
        if (value == null) throw invalid();
        for (int index = 0; index < value.length(); index++) {
            char current = value.charAt(index);
            if (Character.isHighSurrogate(current)) {
                if (index + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(index + 1))) {
                    throw invalid();
                }
                index++;
            } else if (Character.isLowSurrogate(current)) {
                throw invalid();
            }
        }
    }

    private static void requireDepth(int depth) {
        if (depth > MAX_DEPTH) throw invalid();
    }

    private static void requireCollectionSize(int size) {
        if (size > MAX_COLLECTION_SIZE) throw invalid();
    }

    private static LocalMemoryException invalid() {
        return new LocalMemoryException(LocalMemoryException.Code.INVALID_ARGUMENT);
    }

    private static LocalMemoryException invalidNumber() {
        return new LocalMemoryException(LocalMemoryException.Code.EVENT_INVALID);
    }

    private static final class BoundedOutput extends ByteArrayOutputStream {
        private BoundedOutput() {
            super(8_192);
        }

        private void ascii(String value) {
            writeBounded(value.getBytes(StandardCharsets.US_ASCII));
        }

        private void utf8(String value) {
            writeBounded(value.getBytes(StandardCharsets.UTF_8));
        }

        private void writeBounded(byte[] bytes) {
            if (count > MAX_JSON_BYTES - bytes.length) {
                throw new LocalMemoryException(LocalMemoryException.Code.TOO_LARGE);
            }
            write(bytes, 0, bytes.length);
        }
    }
}
