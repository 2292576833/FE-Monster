package com.femonster.music.sources;

import com.femonster.api.AudioSourceHttpModule;
import com.femonster.music.MusicProviderRegistry;
import com.femonster.model.Song;
import com.femonster.json.SimpleJson;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.util.*;

public final class AudioSourceHttpProbe {
    public static void main(String[] args) throws Exception {
        System.setProperty("jdk.httpclient.allowRestrictedHeaders", "host");
        var networkPreview = new java.util.concurrent.atomic.AtomicBoolean(false);
        var initializationFailure = new java.util.concurrent.atomic.AtomicBoolean(true);
        var networkInspections = new java.util.concurrent.atomic.AtomicInteger();
        var runnerCalls = new java.util.concurrent.atomic.AtomicInteger();
        var runner = new AudioSourceService.Runner() {
            public boolean ready() { return true; }
            public Map<String,Object> run(Map<String,Object> input) {
                runnerCalls.incrementAndGet();
                if ("download".equals(input.get("op"))) return Map.of("ok", true, "script", "// @name Own URL fixture\n// PRIVATE_SCRIPT_BODY" + (networkPreview.get() ? " NETWORK_INIT_FIXTURE" : ""));
                if ("inspect".equals(input.get("op")) && String.valueOf(input.get("script")).contains("NETWORK_INIT_FIXTURE")) {
                    networkInspections.incrementAndGet();
                    if (List.of().equals(input.get("allowedHosts"))) return Map.of("ok", false, "code", "AUDIO_SOURCE_INIT_NETWORK_REQUIRED", "requiredHosts", List.of("init.example.org"));
                    if (initializationFailure.get()) return Map.of("ok", false, "code", "AUDIO_SOURCE_TIMEOUT");
                }
                return "resolve".equals(input.get("op")) ? Map.of("ok",true,"url","https://audio.example.org/fixture") : Map.of("ok", true, "sources", Map.of("wy", Map.of("actions", List.of("musicUrl"), "qualitys", List.of("128k"))));
            }
            public void close() {}
        };
        try (var service = new AudioSourceService(Path.of(args[0]), () -> List.of(), runner)) {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            var module = new AudioSourceHttpModule(service, new MusicProviderRegistry());
            server.createContext("/", exchange -> { if (!module.tryHandle(exchange)) { exchange.sendResponseHeaders(404,-1); exchange.close(); } });
            server.start();
            String base = "http://127.0.0.1:" + server.getAddress().getPort();
            HttpClient client = HttpClient.newHttpClient();
            try {
                var get = send(client, base, "", "GET", null, null, base);
                check(get.statusCode() == 200 && get.headers().firstValue("cache-control").orElse("").equals("no-store"), "GET and no-store");
                var unknownEndpoint = send(client, base, "/unknown-operation", "POST", "{}", "application/json", base);
                check(unknownEndpoint.statusCode() == 404 && "AUDIO_SOURCE_ENDPOINT_NOT_FOUND".equals(SimpleJson.parseObjectStrict(unknownEndpoint.body()).get("error")), "unknown endpoint has a distinct 404 error code");
                var missingSource = send(client, base, "/select", "POST", "{\"id\":\"00000000-0000-0000-0000-000000000001\"}", "application/json", base);
                check(missingSource.statusCode() == 400 && "AUDIO_SOURCE_NOT_FOUND".equals(SimpleJson.parseObjectStrict(missingSource.body()).get("error")), "missing source ID preserves its distinct 400 error code");
                check(send(client,base,"","GET",null,null,"https://evil.example").statusCode()==403, "foreign origin");
                check(send(client,base,"","GET",null,null,null).statusCode()==403, "missing origin");
                check(send(client,base,"/select","POST","{}","text/plain",base).statusCode()==415, "content type");
                check(send(client,base,"/select","POST","{\"id\":\"builtin\",\"script\":\"SECRET\"}","application/json",base).statusCode()==400, "unknown field");
                check(send(client,base,"/select","POST","{\"id\":\"builtin\",\"id\":\"builtin\"}","application/json",base).statusCode()==400, "duplicate field");
                check(send(client,base,"/select","POST","x".repeat(768*1024+1),"application/json",base).statusCode()==413, "body limit");
                check(send(client,base,"/select","POST","{\"id\":\"builtin\"}","application/json",base).statusCode()==200, "select builtin");
                check(send(client,base,"/preview-url","POST","{\"url\":\"https://scripts.example.org/own.js\"}","application/json","https://evil.example").statusCode()==403, "URL preview requires same origin");
                check(send(client,base,"/preview-url","POST","{\"url\":\"http://localhost/own.js\"}","application/json",base).statusCode()==400, "URL preview rejects unsafe input");
                var previewResponse = send(client,base,"/preview-url","POST","{\"url\":\"https://scripts.example.org/own.js?key=PRIVATE_QUERY\"}","application/json",base);
                check(previewResponse.statusCode()==200 && !previewResponse.body().contains("PRIVATE"), "preview endpoint returns sanitized metadata only");
                String previewToken = (String)SimpleJson.asMap(SimpleJson.parseObjectStrict(previewResponse.body()).get("preview")).get("token");
                String importBody = SimpleJson.stringify(Map.of("token",previewToken,"allowedHosts",List.of("audio.example.org"),"consent",true,"apply",true));
                var urlImported = send(client,base,"/import-preview","POST",importBody,"application/json",base);
                check(urlImported.statusCode()==200 && !"builtin".equals(SimpleJson.parseObjectStrict(urlImported.body()).get("selected")), "preview import atomically applies via HTTP");
                check(send(client,base,"/import-preview","POST",importBody,"application/json",base).statusCode()==400, "preview token cannot be replayed");
                networkPreview.set(true);
                String previousSelection = (String)service.payload().get("selected");
                var pendingResponse = send(client,base,"/preview-url","POST","{\"url\":\"https://scripts.example.org/network.js?PRIVATE_QUERY\"}","application/json",base);
                check(pendingResponse.statusCode() == 200 && !pendingResponse.body().contains("PRIVATE"), "HTTP pending preview remains sanitized");
                var pendingPreview = SimpleJson.asMap(SimpleJson.parseObjectStrict(pendingResponse.body()).get("preview"));
                check(Boolean.TRUE.equals(pendingPreview.get("initializationRequired")) && "awaiting-network-consent".equals(pendingPreview.get("status")), "HTTP preview exposes pending initialization status");
                check(List.of("init.example.org").equals(pendingPreview.get("requiredHosts")), "HTTP preview exposes hostname only");
                String pendingToken = (String)pendingPreview.get("token");
                String missingHostBody = SimpleJson.stringify(Map.of("token",pendingToken,"allowedHosts",List.of("audio.example.org"),"consent",true,"apply",true));
                var denied = send(client,base,"/import-preview","POST",missingHostBody,"application/json",base);
                check(denied.statusCode() == 400 && denied.body().contains("AUDIO_SOURCE_HOST_NOT_ALLOWED") && networkInspections.get() == 1, "HTTP missing-host consent fails before reinspection");
                String pendingImport = SimpleJson.stringify(Map.of("token",pendingToken,"allowedHosts",List.of("init.example.org","audio.example.org"),"consent",true,"apply",true));
                var initializationFailed = send(client,base,"/import-preview","POST",pendingImport,"application/json",base);
                check(initializationFailed.statusCode() == 400 && initializationFailed.body().contains("AUDIO_SOURCE_TIMEOUT") && previousSelection.equals(service.payload().get("selected")), "HTTP initialization failure preserves prior selection");
                initializationFailure.set(false);
                var initialized = send(client,base,"/import-preview","POST",pendingImport,"application/json",base);
                check(initialized.statusCode() == 200 && !previousSelection.equals(SimpleJson.parseObjectStrict(initialized.body()).get("selected")), "HTTP retry initializes and atomically applies staged source");
                check(send(client,base,"/import-preview","POST",pendingImport,"application/json",base).body().contains("AUDIO_SOURCE_PREVIEW_EXPIRED"), "HTTP pending token is consumed only on success");
                networkPreview.set(false);
                String editingId = (String)service.payload().get("selected");
                String hostsRoute = "/" + editingId + "/hosts";
                String editedHosts = SimpleJson.stringify(Map.of("allowedHosts", List.of("init.example.org", "audio.example.org", "CDN.Example.org"), "consent", true));
                String beforeEdit = SimpleJson.stringify(service.payload());
                Path store = Path.of(args[0]).resolve("audio-sources/sources.json");
                String savedBefore = Files.readString(store);
                int callsBefore = runnerCalls.get();
                check(send(client,base,hostsRoute,"POST",editedHosts,"application/json","https://evil.example").statusCode()==403, "editing domains requires same origin");
                check(send(client,base,hostsRoute,"GET",null,null,base).statusCode()==405, "editing domains requires POST");
                check(send(client,base,hostsRoute,"POST",editedHosts,"text/plain",base).statusCode()==415, "editing domains requires JSON");
                for (String invalidBody : List.of("{\"allowedHosts\":[\"cdn.example.org\"]}", "{\"allowedHosts\":[\"cdn.example.org\"],\"consent\":false}", "{\"allowedHosts\":[\"cdn.example.org\"],\"consent\":\"true\"}", "{\"allowedHosts\":[\"*.example.org\"],\"consent\":true}", "{\"allowedHosts\":[\"127.0.0.1\"],\"consent\":true}", "{\"allowedHosts\":[\"host.home.arpa\"],\"consent\":true}", "{\"allowedHosts\":[\"cdn.example.org\"],\"consent\":true,\"script\":\"PRIVATE\"}", "{\"allowedHosts\":[],\"consent\":true,\"consent\":true}")) {
                    var rejected = send(client,base,hostsRoute,"POST",invalidBody,"application/json",base);
                    check(rejected.statusCode()==400 && !rejected.body().contains("PRIVATE"), "invalid edit is rejected without diagnostic leakage");
                }
                check(send(client,base,"/00000000-0000-0000-0000-000000000001/hosts","POST",editedHosts,"application/json",base).body().contains("AUDIO_SOURCE_NOT_FOUND"), "editing missing source is distinct from unknown route");
                check(beforeEdit.equals(SimpleJson.stringify(service.payload())) && savedBefore.equals(Files.readString(store)), "rejected edits cannot mutate persisted or in-memory state");
                Path preservedStore = store.resolveSibling("before-host-edit.json");
                Files.move(store, preservedStore); Files.createDirectory(store);
                try {
                    var failedSave = send(client,base,hostsRoute,"POST",editedHosts,"application/json",base);
                    check(failedSave.statusCode()==400 && failedSave.body().contains("AUDIO_SOURCE_STORAGE"), "failed edit persistence reports fixed error");
                    check(beforeEdit.equals(SimpleJson.stringify(service.payload())), "failed edit persistence preserves current source");
                } finally { Files.delete(store); Files.move(preservedStore, store); }
                var updated = send(client,base,hostsRoute,"POST",editedHosts,"application/json",base);
                check(updated.statusCode()==200 && !updated.body().contains("PRIVATE"), "confirmed host edit succeeds without exposing script");
                check(editingId.equals(service.payload().get("selected")) && List.of("init.example.org", "audio.example.org", "cdn.example.org").equals(service.selectedSource().get("allowedHosts")), "edit preserves selection and normalizes explicit hosts");
                var beforeStore = SimpleJson.parseObjectStrict(savedBefore);
                var afterStore = SimpleJson.parseObjectStrict(Files.readString(store));
                for (Object entry : (List<?>)afterStore.get("custom")) {
                    Map<String,Object> item = SimpleJson.asMap(entry);
                    if (editingId.equals(item.get("id"))) item.put("allowedHosts", List.of("init.example.org", "audio.example.org"));
                }
                check(beforeStore.equals(afterStore), "host edit preserves every other persisted field and every other source");
                check(runnerCalls.get()==callsBefore, "host edits and all rejected edits never execute or inspect the source");
                try (var reloaded = new AudioSourceService(Path.of(args[0]), () -> List.of(), runner)) {
                    check(editingId.equals(reloaded.payload().get("selected")) && List.of("init.example.org", "audio.example.org", "cdn.example.org").equals(reloaded.selectedSource().get("allowedHosts")), "host edit survives reload");
                }
                check(send(client,base,"/test","POST","{\"id\":\"builtin\",\"provider\":\"netease\",\"song\":{\"id\":\"1\"}}","application/json",base).body().contains("\"playable\":false"), "failed resolution honest");
                var imported = service.importScript(Map.of("script","// media fixture", "allowedHosts",List.of("audio.example.org"),"consent",true));
                String id = (String)((Map<?,?>)((List<?>)imported.get("custom")).get(0)).get("id");
                service.select(id); service.setLocalPort(server.getAddress().getPort());
                String mediaUrl = service.resolve("netease",Song.fromMap(Map.of("id","1")),"standard",()->{throw new AssertionError();}).url();
                var nativeGet = client.send(HttpRequest.newBuilder(URI.create(mediaUrl)).build(),HttpResponse.BodyHandlers.ofString());
                check(nativeGet.statusCode()==503, "valid native ticket passes origin policy (fixture has no relay)");
                var guessed = client.send(HttpRequest.newBuilder(URI.create(base+"/api/audio-sources/media?ticket="+"a".repeat(43))).build(),HttpResponse.BodyHandlers.ofString());
                check(guessed.statusCode()==404, "guessed ticket");
                var forged = client.send(HttpRequest.newBuilder(URI.create(mediaUrl)).header("Host","evil.example:"+server.getAddress().getPort()).build(),HttpResponse.BodyHandlers.ofString());
                check(forged.statusCode()==403,"forged media host");
                var foreign = client.send(HttpRequest.newBuilder(URI.create(mediaUrl)).header("Origin","https://evil.example").build(),HttpResponse.BodyHandlers.ofString());
                check(foreign.statusCode()==403,"foreign media origin");
                for(int i=0;i<128;i++) service.resolve("netease",Song.fromMap(Map.of("id","1")),"standard",()->{throw new AssertionError();});
                var evicted = client.send(HttpRequest.newBuilder(URI.create(mediaUrl)).build(),HttpResponse.BodyHandlers.ofString());
                check(evicted.statusCode()==404,"oldest ticket evicted after capacity");
                System.out.println("AudioSourceHttpProbe: loopback HTTP, URL preview, atomic apply, replay and origin checks passed");
            } finally { server.stop(0); }
        }
    }
    private static HttpResponse<String> send(HttpClient client,String base,String route,String method,String body,String contentType,String origin) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(base + "/api/audio-sources" + route));
        if (origin != null) request.header("Origin", origin);
        if (contentType != null) request.header("Content-Type", contentType);
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        return client.send(request.build(),HttpResponse.BodyHandlers.ofString());
    }
    private static void check(boolean pass,String reason) { if (!pass) throw new AssertionError(reason); }
}
