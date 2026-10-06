package com.femonster.music.sources;

import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

public final class AudioSourceMediaRelayProbe {
    public static void main(String[] args) throws Exception {
        AtomicLong clock=new AtomicLong(1);
        try(var relay=new AudioSourceMediaRelay(Path.of(args[0]),Path.of(args[1]),clock::get)) {
            HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
            server.createContext("/api/audio-sources/media",relay::serve);
            server.start();relay.setLocalPort(server.getAddress().getPort());
            try {
                HttpClient client=HttpClient.newHttpClient();
                String url=relay.issue("https://audio.example.org/test?token=SECRET",List.of("audio.example.org"));
                if(url.contains("SECRET") || url.contains("example.org"))throw new AssertionError("ticket leaked URL");
                var full=client.send(HttpRequest.newBuilder(URI.create(url)).build(),HttpResponse.BodyHandlers.ofString());
                if(full.statusCode()!=200 || !full.body().equals("RIFF-FE-AUDIO-FIXTURE") || full.headers().firstValue("authorization").isPresent())throw new AssertionError("stream/headers");
                var range=client.send(HttpRequest.newBuilder(URI.create(url)).header("Range","bytes=0-3").build(),HttpResponse.BodyHandlers.ofString());
                if(range.statusCode()!=206 || !range.body().equals("RIFF"))throw new AssertionError("range");
                var head=client.send(HttpRequest.newBuilder(URI.create(url)).method("HEAD",HttpRequest.BodyPublishers.noBody()).build(),HttpResponse.BodyHandlers.ofString());
                if(head.statusCode()!=200 || !head.body().isEmpty() || head.headers().firstValue("content-length").isEmpty())throw new AssertionError("head");
                var badRange=client.send(HttpRequest.newBuilder(URI.create(url)).header("Range","bytes=1-2,5-6").build(),HttpResponse.BodyHandlers.ofString());
                if(badRange.statusCode()!=416)throw new AssertionError("multipart range refused");
                clock.addAndGet(TimeUnit.MINUTES.toNanos(31));
                var expired=client.send(HttpRequest.newBuilder(URI.create(url)).build(),HttpResponse.BodyHandlers.ofString());
                if(expired.statusCode()!=404)throw new AssertionError("ticket TTL");
                System.out.println("AudioSourceMediaRelayProbe: binary GET, HEAD, range, header whitelist, ticket redaction and expiration passed");
            } finally { server.stop(0); }
        }
    }
}
