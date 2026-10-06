package com.femonster.core;

import com.femonster.model.Song;
import com.femonster.music.MusicProviderClient;
import com.femonster.music.MusicProviderRegistry;
import com.femonster.music.PlaybackSource;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/** Uses the real PlayerService with delayed, interruptible provider resolution. */
public final class PlayerLoadRecoveryProbe {
    static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    static Song song(String id) { Song song = new Song(); song.id = id; song.provider = "netease"; song.title = id; song.duration = 120; return song; }
    public static void main(String[] args) throws Exception {
        Path directory = Path.of(args[0]); Files.createDirectories(directory);
        ExecutorService requests = Executors.newFixedThreadPool(4);
        BlockingQueue<String> entered = new LinkedBlockingQueue<>();
        AtomicInteger interrupted = new AtomicInteger(), resolves = new AtomicInteger();
        MusicProviderClient provider = (MusicProviderClient) Proxy.newProxyInstance(
            MusicProviderClient.class.getClassLoader(), new Class<?>[] { MusicProviderClient.class }, (proxy, method, values) -> {
                if (method.getName().equals("id")) return "netease";
                if (method.getName().equals("resolvePlayback")) {
                    Song song = (Song) values[0]; resolves.incrementAndGet(); entered.add(song.id);
                    if (song.id.startsWith("slow")) {
                        try { Thread.sleep(10000); }
                        catch (InterruptedException cancelled) { interrupted.incrementAndGet(); Thread.currentThread().interrupt(); }
                    }
                    return PlaybackSource.fromUrl("netease", "standard", "https://audio.example/" + song.id + "-" + resolves.get());
                }
                if (method.getReturnType() == String.class) return "fixture";
                return Map.of();
            });
        PlayerService player = new PlayerService(directory.resolve("state.json"), new MusicProviderRegistry(provider));
        try {
            Future<Map<String,Object>> stale = requests.submit(() -> player.load(song("slow-first"), "standard"));
            require("slow-first".equals(entered.poll(2, TimeUnit.SECONDS)), "old source did not start");
            long start = System.nanoTime();
            Map<String,Object> latest = player.load(song("latest"), "standard");
            require(Boolean.TRUE.equals(latest.get("playable")), "latest source must play");
            require(Boolean.TRUE.equals(stale.get(1, TimeUnit.SECONDS).get("superseded")), "old request must settle promptly as superseded");
            require(TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start) < 1000, "latest song waited for obsolete network work");
            long cancelledDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
            while (interrupted.get() < 1 && System.nanoTime() < cancelledDeadline) Thread.sleep(2);
            require(interrupted.get() == 1, "obsolete provider network request was not cancelled");
            entered.clear();

            Future<Map<String,Object>> paused = requests.submit(() -> player.load(song("slow-pause"), "standard"));
            require("slow-pause".equals(entered.poll(2, TimeUnit.SECONDS)), "pause fixture did not start");
            player.pause();
            require(Boolean.TRUE.equals(paused.get(1, TimeUnit.SECONDS).get("superseded")), "pause must cancel pending source");
            require(Boolean.FALSE.equals(player.state().get("playing")), "old source resumed after pause");
            entered.clear();

            player.setQueue(List.of(song("slow-navigation"), song("unwanted-next")), -1);
            Future<Map<String,Object>> navigation = requests.submit(player::next);
            require("slow-navigation".equals(entered.poll(2, TimeUnit.SECONDS)), "navigation fixture did not start");
            player.load(song("explicit-latest"), "standard");
            require(Boolean.TRUE.equals(navigation.get(1, TimeUnit.SECONDS).get("superseded")), "superseded navigation must not auto-skip into another load");
            require("explicit-latest".equals(((Map<?,?>)player.state().get("song")).get("id")), "old navigation replaced the explicit selection");
            require(!entered.contains("unwanted-next"), "old navigation queried another song after cancellation");

            player.seek(37); player.flush(); player.close();
            int beforeRestore = resolves.get();
            PlayerService restored = new PlayerService(directory.resolve("state.json"), new MusicProviderRegistry(provider));
            try {
                require(Boolean.FALSE.equals(restored.state().get("playable")), "persisted URLs can expire and must not be treated as freshly resolved");
                require(Boolean.TRUE.equals(restored.play().get("playable")), "restored song must resolve on play");
                require(resolves.get() == beforeRestore + 1, "restored player reused a persisted signed URL");
                require(((Number)restored.state().get("position")).intValue() == 37, "fresh URL resolution lost saved playback position");
            } finally { restored.close(); }
            boundedBurst(directory.resolve("burst.json"), requests);
            System.out.println("PlayerLoadRecoveryProbe passed: superseded resolution, pause, navigation, restored URL freshness, bounded rapid selection");
        } finally { player.close(); requests.shutdownNow(); }
    }

    static void boundedBurst(Path stateFile, ExecutorService requests) throws Exception {
        CountDownLatch release = new CountDownLatch(1);
        BlockingQueue<String> started = new LinkedBlockingQueue<>();
        AtomicInteger active = new AtomicInteger(), maximum = new AtomicInteger();
        MusicProviderClient provider = (MusicProviderClient) Proxy.newProxyInstance(
            MusicProviderClient.class.getClassLoader(), new Class<?>[] { MusicProviderClient.class }, (proxy, method, values) -> {
                if (method.getName().equals("id")) return "netease";
                if (!method.getName().equals("resolvePlayback")) return method.getReturnType() == String.class ? "fixture" : Map.of();
                String id = ((Song)values[0]).id;
                maximum.accumulateAndGet(active.incrementAndGet(), Math::max); started.add(id);
                try {
                    if (id.startsWith("blocking")) {
                        // Model a slow provider whose socket does not promptly
                        // observe cancellation; it must not create extra workers.
                        while (release.getCount() > 0) {
                            try { release.await(); } catch (InterruptedException ignored) {}
                        }
                    }
                    return PlaybackSource.fromUrl("netease", "standard", "https://audio.example/" + id);
                } finally { active.decrementAndGet(); }
            });
        PlayerService player = new PlayerService(stateFile, new MusicProviderRegistry(provider));
        CompletableFuture<Map<String,Object>> queuedResult = new CompletableFuture<>();
        Thread queuedRequest = new Thread(() -> {
            try { queuedResult.complete(player.load(song("obsolete-queued"), "standard")); }
            catch (Throwable failure) { queuedResult.completeExceptionally(failure); }
        });
        try {
            Future<Map<String,Object>> first = requests.submit(() -> player.load(song("blocking-a"), "standard"));
            require("blocking-a".equals(started.poll(1, TimeUnit.SECONDS)), "first blocking request did not start");
            Future<Map<String,Object>> second = requests.submit(() -> player.load(song("blocking-b"), "standard"));
            require("blocking-b".equals(started.poll(1, TimeUnit.SECONDS)), "second blocking request did not start");
            queuedRequest.start();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
            while (queuedRequest.getState() != Thread.State.TIMED_WAITING && System.nanoTime() < deadline) Thread.sleep(2);
            require(queuedRequest.getState() == Thread.State.TIMED_WAITING, "third request did not enter its bounded wait");
            Future<Map<String,Object>> latest = requests.submit(() -> player.load(song("burst-latest"), "standard"));
            require(Boolean.TRUE.equals(queuedResult.get(1, TimeUnit.SECONDS).get("superseded")), "new selection did not discard queued obsolete work");
            release.countDown();
            require(Boolean.TRUE.equals(latest.get(1, TimeUnit.SECONDS).get("playable")), "last selection could not use the released worker");
            require(Boolean.TRUE.equals(first.get(1, TimeUnit.SECONDS).get("superseded")), "first slow result was not superseded");
            require(Boolean.TRUE.equals(second.get(1, TimeUnit.SECONDS).get("superseded")), "second slow result was not superseded");
            require(!started.contains("obsolete-queued"), "obsolete queued selection was unnecessarily resolved");
            require(maximum.get() <= 2, "rapid selection spawned unbounded source work");
            require("burst-latest".equals(((Map<?,?>)player.state().get("song")).get("id")), "slow provider overwrote the latest song");
        } finally { release.countDown(); player.close(); queuedRequest.join(1000); }
    }
}
