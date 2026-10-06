package com.femonster.music;

import com.femonster.model.Song;
import java.lang.reflect.Proxy;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

public final class PlaybackResolverRegistryProbe {
    public static void main(String[] args) {
        AtomicInteger builtinCalls = new AtomicInteger();
        MusicProviderClient client = (MusicProviderClient) Proxy.newProxyInstance(
            MusicProviderClient.class.getClassLoader(), new Class<?>[]{MusicProviderClient.class},
            (proxy, method, values) -> switch (method.getName()) {
                case "id" -> "netease";
                case "resolvePlayback" -> {
                    builtinCalls.incrementAndGet();
                    yield PlaybackSource.fromUrl("netease", (String) values[1], "https://builtin.example/song.mp3");
                }
                default -> throw new AssertionError("unexpected direct client path: " + method.getName());
            }
        );
        MusicProviderRegistry registry = new MusicProviderRegistry(client);
        Song song = new Song();
        song.id = "42";
        song.provider = "netease";
        song.sourceRef = Map.of("mediaMid", "track-identity");
        equal("https://builtin.example/song.mp3", registry.songUrl("netease", "42", "standard"));
        equal(1, builtinCalls.get());
        AtomicInteger resolverCalls = new AtomicInteger();
        registry.setPlaybackResolver((provider, track, quality, builtin) -> {
            equal("netease", provider);
            equal("42", track.id);
            resolverCalls.incrementAndGet();
            return PlaybackSource.fromUrl(provider, quality, "https://custom.example/song.mp3");
        });
        equal("https://custom.example/song.mp3", registry.songUrl("163", "42", "standard"));
        equal("https://custom.example/song.mp3", registry.songUrlPayload("netease", "42", "standard").get("url"));
        equal("https://custom.example/song.mp3", registry.songUrlPayload("netease", song, "standard").get("url"));
        equal("https://custom.example/song.mp3", registry.resolvePlayback("netease", song, "standard").url());
        equal(4, resolverCalls.get());
        equal(1, builtinCalls.get());
        equal("track-identity", song.sourceRef.get("mediaMid"));
        registry.replace(client);
        equal("https://custom.example/song.mp3", registry.resolvePlayback("netease", song, "standard").url());
        registry.setPlaybackResolver(null);
        equal("https://builtin.example/song.mp3", registry.resolvePlayback("netease", song, "standard").url());
        equal(2, builtinCalls.get());
        System.out.println("PlaybackResolverRegistryProbe passed: all URL entries, defaults, aliases, identity, reload and reset");
    }

    private static void equal(Object expected, Object actual) {
        if (!expected.equals(actual)) throw new AssertionError("Expected " + expected + " but got " + actual);
    }
}
