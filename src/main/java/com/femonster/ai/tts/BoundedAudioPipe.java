package com.femonster.ai.tts;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.Queue;

/** Single-reader blocking stream with a hard byte budget for upstream backpressure. */
final class BoundedAudioPipe {
    private final long maxBufferedBytes;
    private final Queue<byte[]> chunks = new ArrayDeque<>();
    private long bufferedBytes;
    private byte[] current;
    private int currentOffset;
    private boolean complete;
    private boolean readerOpened;
    private IOException failure;

    BoundedAudioPipe(long maxBufferedBytes) {
        if (maxBufferedBytes < 1) throw new IllegalArgumentException("audio buffer limit must be positive");
        this.maxBufferedBytes = maxBufferedBytes;
    }

    synchronized boolean offer(byte[] audio) {
        if (complete || failure != null) return false;
        if (audio == null || audio.length == 0) return true;
        if (bufferedBytes + audio.length > maxBufferedBytes) return false;
        chunks.add(audio.clone());
        bufferedBytes += audio.length;
        notifyAll();
        return true;
    }

    synchronized InputStream open() {
        if (readerOpened) throw new IllegalStateException("audio stream is already open");
        readerOpened = true;
        return new PipeInputStream();
    }

    synchronized void complete() {
        complete = true;
        notifyAll();
    }

    synchronized void fail(String safeMessage) {
        if (failure == null) failure = new IOException(safeMessage == null ? "TTS audio stream failed" : safeMessage);
        complete = true;
        chunks.clear();
        current = null;
        bufferedBytes = 0;
        notifyAll();
    }

    synchronized long bufferedBytes() {
        return bufferedBytes;
    }

    private final class PipeInputStream extends InputStream {
        private boolean closed;

        @Override
        public int read() throws IOException {
            byte[] one = new byte[1];
            int count = read(one, 0, 1);
            return count < 0 ? -1 : Byte.toUnsignedInt(one[0]);
        }

        @Override
        public int read(byte[] target, int offset, int length) throws IOException {
            if (target == null) throw new NullPointerException("target");
            if (offset < 0 || length < 0 || length > target.length - offset) {
                throw new IndexOutOfBoundsException();
            }
            if (length == 0) return 0;
            synchronized (BoundedAudioPipe.this) {
                while (!closed && current == null && chunks.isEmpty() && failure == null && !complete) {
                    try {
                        BoundedAudioPipe.this.wait();
                    } catch (InterruptedException error) {
                        Thread.currentThread().interrupt();
                        throw new IOException("TTS audio read was interrupted");
                    }
                }
                if (closed) return -1;
                if (failure != null) throw failure;
                if (current == null && !chunks.isEmpty()) {
                    current = chunks.remove();
                    currentOffset = 0;
                }
                if (current == null) return complete ? -1 : 0;
                int count = Math.min(length, current.length - currentOffset);
                System.arraycopy(current, currentOffset, target, offset, count);
                currentOffset += count;
                bufferedBytes -= count;
                if (currentOffset == current.length) {
                    current = null;
                    currentOffset = 0;
                }
                return count;
            }
        }

        @Override
        public void close() {
            synchronized (BoundedAudioPipe.this) {
                if (closed) return;
                closed = true;
                chunks.clear();
                current = null;
                bufferedBytes = 0;
                BoundedAudioPipe.this.notifyAll();
            }
        }
    }
}
