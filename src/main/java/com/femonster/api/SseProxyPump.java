package com.femonster.api;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.time.Duration;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

final class SseProxyPump {
    private static final ScheduledExecutorService WATCHDOG = Executors.newSingleThreadScheduledExecutor(task -> {
        Thread thread = new Thread(task, "fe-community-sse-idle-watchdog");
        thread.setDaemon(true);
        return thread;
    });

    private SseProxyPump() {
    }

    static CopyResult copy(InputStream input, OutputStream output, Duration idleTimeout) throws IOException {
        if (input == null) throw new IllegalArgumentException("SSE input is required");
        if (output == null) throw new IllegalArgumentException("SSE output is required");
        long idleMillis = Math.max(25L, idleTimeout == null ? 45_000L : idleTimeout.toMillis());
        long idleNanos = TimeUnit.MILLISECONDS.toNanos(idleMillis);
        long checkEveryMillis = Math.max(10L, Math.min(1000L, idleMillis / 4L));
        AtomicLong lastActivityAt = new AtomicLong(System.nanoTime());
        AtomicBoolean idleExpired = new AtomicBoolean(false);

        ScheduledFuture<?> watchdog = WATCHDOG.scheduleWithFixedDelay(() -> {
            if (System.nanoTime() - lastActivityAt.get() < idleNanos) return;
            if (!idleExpired.compareAndSet(false, true)) return;
            try {
                input.close();
            } catch (IOException ignored) {
            }
        }, checkEveryMillis, checkEveryMillis, TimeUnit.MILLISECONDS);

        long copied = 0L;
        IOException failure = null;
        try {
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) >= 0) {
                if (read == 0) continue;
                lastActivityAt.set(System.nanoTime());
                output.write(buffer, 0, read);
                output.flush();
                copied += read;
            }
        } catch (IOException error) {
            failure = error;
        } finally {
            watchdog.cancel(false);
        }

        if (idleExpired.get()) {
            throw new IdleTimeoutException("community SSE upstream was idle for " + idleMillis + " ms", failure);
        }
        if (failure != null) throw failure;
        return new CopyResult(copied, TimeUnit.NANOSECONDS.toMillis(lastActivityAt.get()));
    }

    record CopyResult(long bytesCopied, long lastActivityAtMillis) {
    }

    static final class IdleTimeoutException extends IOException {
        private IdleTimeoutException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
