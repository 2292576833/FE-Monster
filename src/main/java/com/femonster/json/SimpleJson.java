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
        return new Parser(text == null ? "" : text).parse();
    }

    public static Map<String, Object> parseObject(String text) {
        Object value = parse(text);
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
        private final String text;
        private int index;

        Parser(String text) {
            this.text = text;
        }

        Object parse() {
            skipWhitespace();
            Object value = parseValue();
            skipWhitespace();
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
            Map<String, Object> map = new LinkedHashMap<>();
            index++;
            skipWhitespace();
            if (peek('}')) {
                index++;
                return map;
            }
            while (index < text.length()) {
                skipWhitespace();
                String key = parseString();
                skipWhitespace();
                if (peek(':')) index++;
                Object value = parseValue();
                map.put(key, value);
                skipWhitespace();
                if (peek(',')) {
                    index++;
                    continue;
                }
                if (peek('}')) {
                    index++;
                    break;
                }
            }
            return map;
        }

        private List<Object> parseArrayValue() {
            List<Object> list = new ArrayList<>();
            index++;
            skipWhitespace();
            if (peek(']')) {
                index++;
                return list;
            }
            while (index < text.length()) {
                list.add(parseValue());
                skipWhitespace();
                if (peek(',')) {
                    index++;
                    continue;
                }
                if (peek(']')) {
                    index++;
                    break;
                }
            }
            return list;
        }

        private String parseString() {
            if (!peek('"')) return "";
            index++;
            StringBuilder out = new StringBuilder();
            while (index < text.length()) {
                char c = text.charAt(index++);
                if (c == '"') break;
                if (c == '\\' && index < text.length()) {
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
                        default -> out.append(e);
                    }
                } else {
                    out.append(c);
                }
            }
            return out.toString();
        }

        private char parseUnicode() {
            if (index + 4 > text.length()) return '?';
            String hex = text.substring(index, index + 4);
            index += 4;
            try {
                return (char) Integer.parseInt(hex, 16);
            } catch (NumberFormatException ignored) {
                return '?';
            }
        }

        private Number parseNumber() {
            int start = index;
            if (peek('-')) index++;
            while (index < text.length() && Character.isDigit(text.charAt(index))) index++;
            boolean decimal = false;
            if (peek('.')) {
                decimal = true;
                index++;
                while (index < text.length() && Character.isDigit(text.charAt(index))) index++;
            }
            if (index < text.length() && (text.charAt(index) == 'e' || text.charAt(index) == 'E')) {
                decimal = true;
                index++;
                if (index < text.length() && (text.charAt(index) == '+' || text.charAt(index) == '-')) index++;
                while (index < text.length() && Character.isDigit(text.charAt(index))) index++;
            }
            String raw = text.substring(start, Math.max(start, index));
            try {
                return decimal ? Double.parseDouble(raw) : Long.parseLong(raw);
            } catch (NumberFormatException ignored) {
                return 0;
            }
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
    }
}
