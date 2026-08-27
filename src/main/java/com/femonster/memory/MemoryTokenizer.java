package com.femonster.memory;

import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

public final class MemoryTokenizer {
    private static final int MAX_TEXT_BYTES = 32_768;
    private static final int MAX_TOKEN_CODE_POINTS = 64;
    private static final int MAX_TOKENS = 2_048;

    private MemoryTokenizer() {
    }

    public static Set<String> tokens(String text) {
        if (text == null) throw new IllegalArgumentException("MEMORY_TOKENIZER_INVALID_INPUT");
        if (text.getBytes(StandardCharsets.UTF_8).length > MAX_TEXT_BYTES) {
            throw new IllegalArgumentException("MEMORY_TEXT_TOO_LARGE");
        }
        String normalized = Normalizer.normalize(text, Normalizer.Form.NFKC)
            .toLowerCase(Locale.ROOT);
        LinkedHashSet<String> output = new LinkedHashSet<>();
        StringBuilder word = new StringBuilder();
        StringBuilder cjk = new StringBuilder();

        normalized.codePoints().forEach(codePoint -> {
            if (isCjk(codePoint)) {
                flushWord(word, output);
                cjk.appendCodePoint(codePoint);
                return;
            }
            flushCjk(cjk, output);
            if (Character.isLetterOrDigit(codePoint) || Character.getType(codePoint) == Character.NON_SPACING_MARK) {
                word.appendCodePoint(codePoint);
            } else {
                flushWord(word, output);
            }
        });
        flushWord(word, output);
        flushCjk(cjk, output);
        return Collections.unmodifiableSet(output);
    }

    private static void flushWord(StringBuilder word, LinkedHashSet<String> output) {
        if (word.length() == 0 || output.size() >= MAX_TOKENS) {
            word.setLength(0);
            return;
        }
        int[] codePoints = word.codePoints().toArray();
        int boundedLength = Math.min(codePoints.length, MAX_TOKEN_CODE_POINTS);
        if (codePoints.length <= MAX_TOKEN_CODE_POINTS) {
            add(output, new String(codePoints, 0, codePoints.length));
        }
        for (int length = 1; length <= boundedLength && output.size() < MAX_TOKENS; length++) {
            add(output, new String(codePoints, 0, length));
        }
        word.setLength(0);
    }

    private static void flushCjk(StringBuilder cjk, LinkedHashSet<String> output) {
        if (cjk.length() == 0 || output.size() >= MAX_TOKENS) {
            cjk.setLength(0);
            return;
        }
        int[] codePoints = cjk.codePoints().toArray();
        for (int width = 1; width <= 3 && output.size() < MAX_TOKENS; width++) {
            for (int start = 0; start + width <= codePoints.length && output.size() < MAX_TOKENS; start++) {
                add(output, new String(codePoints, start, width));
            }
        }
        cjk.setLength(0);
    }

    private static void add(LinkedHashSet<String> output, String token) {
        if (output.size() >= MAX_TOKENS || token.isEmpty()) return;
        if (token.codePointCount(0, token.length()) <= MAX_TOKEN_CODE_POINTS) output.add(token);
    }

    private static boolean isCjk(int codePoint) {
        Character.UnicodeScript script = Character.UnicodeScript.of(codePoint);
        return script == Character.UnicodeScript.HAN
            || script == Character.UnicodeScript.HIRAGANA
            || script == Character.UnicodeScript.KATAKANA
            || script == Character.UnicodeScript.HANGUL;
    }
}
