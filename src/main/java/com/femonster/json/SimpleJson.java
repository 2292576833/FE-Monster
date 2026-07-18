package com.femonster.json;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class SimpleJson {
    private SimpleJson() {
    }

    public static String stringify(Object value) {
        StringBuilder out = new StringBuilder();
        write(value, out);
        return out.toString();
    }

    public static Object parse(String text) {
        return new Parser(text == null ? "" : text, false).parse();
    }

    public static Object parseStrict(String text) {
        return new Parser(text == null ? "" : text, true).parse();
    }

    public static Map<String, Object> parseObject(String text) {
        Object value = parse(text);
        return asMap(value);
    }

    public static Map<String, Object> parseObjectStrict(String text) {
        Object value = parseStrict(text);
        if (!(value instanceof Map<?, ?>)) throw new IllegalArgumentException("JSON root must be an object");
        return asMap(value);
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> asMap(Object value) {
        if (value instanceof Map<?, ?>) {
            return (Map<String, Object>) value;
        }
        return new LinkedHashMap<>();
    }

    @SuppressWarnings("unchecked")
    public static List<Object> asList(Object value) {
        if (value instanceof List<?>) {
            return (List<Object>) value;
        }
        return new ArrayList<>();
    }

    public static String asString(Object value, String fallback) {
        if (value == null) return fallback;
        if (value instanceof String s) return s;
        if (value instanceof Number n) return numberString(n);
        if (value instanceof Boolean) return String.valueOf(value);
        return fallback;
    }

    public static int asInt(Object value, int fallback) {
        if (value instanceof Number n) return n.intValue();
        if (value instanceof String s) {
            try {
                return Integer.parseInt(s);
            } catch (NumberFormatException ignored) {
            }
        }
        return fallback;
    }

    public static long asLong(Object value, long fallback) {
        if (value instanceof Number n) return n.longValue();
        if (value instanceof String s) {
            try {
                return Long.parseLong(s);
            } catch (NumberFormatException ignored) {
            }
        }
        return fallback;
    }

    public static double asDouble(Object value, double fallback) {
        if (value instanceof Number n) return n.doubleValue();
        if (value instanceof String s) {
            try {
                return Double.parseDouble(s);
            } catch (NumberFormatException ignored) {
            }
        }
        return fallback;
    }

    public static boolean asBoolean(Object value, boolean fallback) {
        if (value instanceof Boolean b) return b;
        if (value instanceof String s) return Boolean.parseBoolean(s);
        return fallback;
    }

    private static void write(Object value, StringBuilder out) {
        if (value == null) {
            out.append("null");
        } else if (value instanceof String s) {
            out.append('"').append(escape(s)).append('"');
        } else if (value instanceof Number || value instanceof Boolean) {
            out.append(value);
        } else if (value instanceof Map<?, ?> map) {
            out.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!first) out.append(',');
                first = false;
                out.append('"').append(escape(String.valueOf(entry.getKey()))).append('"').append(':');
                write(entry.getValue(), out);
            }
            out.append('}');
        } else if (value instanceof Iterable<?> list) {
            out.append('[');
            boolean first = true;
            for (Object item : list) {
                if (!first) out.append(',');
                first = false;
                write(item, out);
            }
            out.append(']');
        } else {
            out.append('"').append(escape(String.valueOf(value))).append('"');
        }
    }

    private static String escape(String value) {
        StringBuilder out = new StringBuilder(value.length() + 16);
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\b' -> out.append("\\b");
                case '\f' -> out.append("\\f");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
                }
            }
        }
        return out.toString();
    }

    private static String numberString(Number number) {
        if (number instanceof Double || number instanceof Float) {
            double value = number.doubleValue();
            if (Double.isFinite(value) && value >= Long.MIN_VALUE && value <= Long.MAX_VALUE && Math.rint(value) == value) {
                return Long.toString((long) value);
            }
        }
        return String.valueOf(number);
    }

    private static final class Parser {
        private static final int MAX_DEPTH = 64;
        private final String text;
        private final boolean strict;
        private int index;
        private int depth;

        Parser(String text, boolean strict) {
            this.text = text;
            this.strict = strict;
        }

        Object parse() {
            skipWhitespace();
            if (index >= text.length()) {
                if (strict) throw error("empty JSON");
                return null;
            }
            Object value = parseValue();
            skipWhitespace();
            if (strict && index != text.length()) throw error("unexpected trailing content");
            return value;
        }

        private Object parseValue() {
            skipWhitespace();
            if (index >= text.length()) return null;
            char c = text.charAt(index);
            if (c == '"') return parseString();
            if (c == '{') return parseObjectValue();
            if (c == '[') return parseArrayValue();
            if (c == 't' && match("true")) return Boolean.TRUE;
            if (c == 'f' && match("false")) return Boolean.FALSE;
            if (c == 'n' && match("null")) return null;
            return parseNumber();
        }

        private Map<String, Object> parseObjectValue() {
            enter();
            Map<String, Object> map = new LinkedHashMap<>();
            try {
                index++;
                skipWhitespace();
                if (peek('}')) {
                    index++;
                    return map;
                }
                while (index < text.length()) {
                    int iterationStart = index;
                    skipWhitespace();
                    if (strict && !peek('"')) throw error("object key must be a string");
                    String key = parseString();
                    skipWhitespace();
                    if (peek(':')) index++;
                    else if (strict) throw error("object key is missing ':'");
                    Object value = parseValue();
                    map.put(key, value);
                    skipWhitespace();
                    if (peek(',')) {
                        index++;
                        continue;
                    }
                    if (peek('}')) {
                        index++;
                        return map;
                    }
                    if (strict) throw error("object is missing ',' or '}'");
                    if (index <= iterationStart) index++;
                }
                if (strict) throw error("unterminated object");
                return map;
            } finally {
                leave();
            }
        }

        private List<Object> parseArrayValue() {
            enter();
            List<Object> list = new ArrayList<>();
            try {
                index++;
                skipWhitespace();
                if (peek(']')) {
                    index++;
                    return list;
                }
                while (index < text.length()) {
                    int iterationStart = index;
                    list.add(parseValue());
                    skipWhitespace();
                    if (peek(',')) {
                        index++;
                        continue;
                    }
                    if (peek(']')) {
                        index++;
                        return list;
                    }
                    if (strict) throw error("array is missing ',' or ']'");
                    if (index <= iterationStart) index++;
                }
                if (strict) throw error("unterminated array");
                return list;
            } finally {
                leave();
            }
        }

        private String parseString() {
            if (!peek('"')) {
                if (strict) throw error("expected string");
                return "";
            }
            index++;
            StringBuilder out = new StringBuilder();
            boolean closed = false;
            while (index < text.length()) {
                char c = text.charAt(index++);
                if (c == '"') {
                    closed = true;
                    break;
                }
                if (c < 0x20 && strict) throw error("control character in string");
                if (c == '\\') {
                    if (index >= text.length()) {
                        if (strict) throw error("unterminated escape sequence");
                        break;
                    }
                    char e = text.charAt(index++);
                    switch (e) {
                        case '"' -> out.append('"');
                        case '\\' -> out.append('\\');
                        case '/' -> out.append('/');
                        case 'b' -> out.append('\b');
                        case 'f' -> out.append('\f');
                        case 'n' -> out.append('\n');
                        case 'r' -> out.append('\r');
                        case 't' -> out.append('\t');
                        case 'u' -> out.append(parseUnicode());
                        default -> {
                            if (strict) throw error("invalid escape sequence");
                            out.append(e);
                        }
                    }
                } else {
                    out.append(c);
                }
            }
            if (strict && !closed) throw error("unterminated string");
            return out.toString();
        }

        private char parseUnicode() {
            if (index + 4 > text.length()) {
                if (strict) throw error("incomplete unicode escape");
                index = text.length();
                return '?';
            }
            String hex = text.substring(index, index + 4);
            index += 4;
            try {
                return (char) Integer.parseInt(hex, 16);
            } catch (NumberFormatException ignored) {
                if (strict) throw error("invalid unicode escape");
                return '?';
            }
        }

        private Number parseNumber() {
            int start = index;
            if (peek('-')) index++;
            int integerStart = index;
            if (peek('0')) {
                index++;
                if (strict && index < text.length() && Character.isDigit(text.charAt(index))) throw error("leading zero in number");
            } else {
                while (index < text.length() && Character.isDigit(text.charAt(index))) index++;
            }
            if (index == integerStart) return invalidNumber(start);
            boolean decimal = false;
            if (peek('.')) {
                decimal = true;
                index++;
                int fractionStart = index;
                while (index < text.length() && Character.isDigit(text.charAt(index))) index++;
                if (index == fractionStart) return invalidNumber(start);
            }
            if (index < text.length() && (text.charAt(index) == 'e' || text.charAt(index) == 'E')) {
                decimal = true;
                index++;
                if (index < text.length() && (text.charAt(index) == '+' || text.charAt(index) == '-')) index++;
                int exponentStart = index;
                while (index < text.length() && Character.isDigit(text.charAt(index))) index++;
                if (index == exponentStart) return invalidNumber(start);
            }
            String raw = text.substring(start, index);
            try {
                Number value = decimal ? Double.parseDouble(raw) : Long.parseLong(raw);
                if (strict && value instanceof Double number && !Double.isFinite(number)) throw error("number is outside the supported range");
                return value;
            } catch (NumberFormatException ignored) {
                return invalidNumber(start);
            }
        }

        private Number invalidNumber(int start) {
            if (strict) throw error("invalid JSON value");
            index = Math.min(text.length(), Math.max(index, start + 1));
            return 0;
        }

        private boolean match(String token) {
            if (!text.startsWith(token, index)) return false;
            index += token.length();
            return true;
        }

        private boolean peek(char c) {
            return index < text.length() && text.charAt(index) == c;
        }

        private void skipWhitespace() {
            while (index < text.length() && Character.isWhitespace(text.charAt(index))) index++;
        }

        private void enter() {
            depth++;
            if (depth > MAX_DEPTH) throw error("JSON nesting exceeds 64 levels");
        }

        private void leave() {
            depth--;
        }

        private IllegalArgumentException error(String message) {
            return new IllegalArgumentException(message + " at position " + index);
        }
    }
}
