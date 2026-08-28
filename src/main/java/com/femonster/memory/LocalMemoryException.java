package com.femonster.memory;

import java.util.Objects;

/**
 * Stable, redacted failure returned by the local-memory boundary.
 *
 * <p>The message is always the machine-readable code. Callers must never expose the
 * cause, which may contain storage implementation details.</p>
 */
public final class LocalMemoryException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    public enum Code {
        INVALID_ARGUMENT("LOCAL_MEMORY_INVALID_ARGUMENT"),
        EVENT_INVALID("LOCAL_MEMORY_EVENT_INVALID"),
        TOO_LARGE("LOCAL_MEMORY_TOO_LARGE"),
        CONFLICT("LOCAL_MEMORY_CONFLICT"),
        LOCKED("LOCAL_MEMORY_LOCKED"),
        FULL("LOCAL_MEMORY_FULL"),
        BUSY("LOCAL_MEMORY_BUSY"),
        INTEGRITY("LOCAL_MEMORY_INTEGRITY"),
        UNAVAILABLE("LOCAL_MEMORY_UNAVAILABLE"),
        IO_FAILED("LOCAL_MEMORY_IO_FAILED"),
        RESTORE_INVALID("LOCAL_MEMORY_RESTORE_INVALID"),
        FUTURE_SCHEMA("LOCAL_MEMORY_FUTURE_SCHEMA"),
        CLOSED("LOCAL_MEMORY_CLOSED"),
        INTERNAL("LOCAL_MEMORY_INTERNAL");

        private final String value;

        Code(String value) {
            this.value = value;
        }

        public String value() {
            return value;
        }
    }

    private final Code code;

    public LocalMemoryException(Code code) {
        this(code, null);
    }

    public LocalMemoryException(Code code, Throwable cause) {
        super(Objects.requireNonNull(code, "code").value(), cause);
        this.code = code;
    }

    public Code code() {
        return code;
    }
}
