package com.femonster.music.sources;

import com.femonster.core.ProjectPaths;
import com.femonster.json.SimpleJson;
import com.femonster.model.Song;
import com.femonster.music.PlaybackSource;
import java.nio.file.*;
import java.util.*;

/** Actual Node/QuickJS execution. This fixture does not claim external playback. */
public final class AudioSourceQuickJsProbe {
    public static void main(String[] args) throws Exception {
        try(var service=new AudioSourceService(Path.of(args[0]),()->List.of(),new LxProcessRunner(ProjectPaths.detect()))) {
            if(!Boolean.TRUE.equals(service.payload().get("runtimeReady")))throw new AssertionError("QuickJS install unavailable");
            String script="lx.send(lx.EVENT_NAMES.inited,{sources:{wy:{name:'self-authored',type:'music',actions:['musicUrl'],qualitys:['128k']}}});lx.on(lx.EVENT_NAMES.request,()=>{throw new Error('SECRET_SCRIPT_ERROR');});";
            var imported=service.importScript(Map.of("script",script,"consent",true,"allowedHosts",List.of()));
            String id=(String)((Map<?,?>)((List<?>)imported.get("custom")).get(0)).get("id");
            var result=service.test(id,"netease",Song.fromMap(Map.of("id","1")),"standard",()->{throw new AssertionError("builtin called");});
            if(!Boolean.FALSE.equals(result.get("resolved")) || result.toString().contains("SECRET"))throw new AssertionError("guest error behavior");
            String hostile="if(typeof process!=='undefined'||typeof require!=='undefined'||typeof document!=='undefined')throw Error('escape');"+script;
            service.importScript(Map.of("script",hostile,"consent",true,"allowedHosts",List.of()));
            System.out.println("AudioSourceQuickJsProbe: actual isolated QuickJS initialization, host API absence and sanitized script failure passed");
        }
        networkInitializationPreview(Path.of(args[0]).resolve("network-preview"));
        missingHostDiagnostics(Path.of(args[0]).resolve("missing-hosts"));
    }

    private static void missingHostDiagnostics(Path data) throws Exception {
        String init = "lx.send(lx.EVENT_NAMES.inited,{sources:{wy:{type:'music',actions:['musicUrl'],qualitys:['128k']}}});";
        try (var service = new AudioSourceService(data, () -> List.of(), new LxProcessRunner(ProjectPaths.detect()))) {
            for (boolean media : List.of(false, true)) {
                String script = init + (media ? "lx.on('request',()=> 'https://cdn.example.org/PRIVATE_PATH?token=PRIVATE_QUERY');"
                    : "lx.on('request',()=>new Promise((resolve,reject)=>lx.request('https://api.example.org/PRIVATE_PATH?token=PRIVATE_QUERY',{},error=>reject(error))));");
                String id = (String)service.importScript(Map.of("script", script, "allowedHosts", List.of("allowed.example.org"), "consent", true, "apply", true)).get("selected");
                var result = service.test(id, "netease", Song.fromMap(Map.of("id", "1")), "standard", () -> { throw new AssertionError("builtin called"); });
                String code = media ? "AUDIO_SOURCE_MEDIA_HOST_NOT_ALLOWED" : "AUDIO_SOURCE_HOST_NOT_ALLOWED";
                String host = media ? "cdn.example.org" : "api.example.org";
                if (!code.equals(result.get("error")) || !List.of(host).equals(result.get("requiredHosts")) || !Boolean.FALSE.equals(result.get("resolved"))) throw new AssertionError("real missing-host error lost across runtime and Java: " + result);
                if (SimpleJson.stringify(result).contains("PRIVATE")) throw new AssertionError("real missing-host diagnostic leaked URL path or query");
                if (!List.of("allowed.example.org").equals(service.selectedSource().get("allowedHosts"))) throw new AssertionError("diagnostic auto-authorized a host");
            }
            System.out.println("AudioSourceQuickJsProbe: actual request/media missing hosts preserve only hostname diagnostics without granting access passed");
        }
    }

    private static void networkInitializationPreview(Path data) throws Exception {
        String script = "// @name Network initialization fixture\n"
            + "if(typeof process!=='undefined'||typeof require!=='undefined')throw Error('escape');"
            + "lx.request('https://init.example.org/start?PRIVATE_QUERY',{},error=>{if(error)throw error;lx.send(lx.EVENT_NAMES.inited,{sources:{wy:{type:'music',actions:['musicUrl'],qualitys:['128k']}}});});";
        try (var actual = new LxProcessRunner(ProjectPaths.detect())) {
            var inspection = actual.run(Map.of("op", "inspect", "script", script, "allowedHosts", List.of()));
            if (!"AUDIO_SOURCE_INIT_NETWORK_REQUIRED".equals(inspection.get("code")) || !List.of("init.example.org").equals(inspection.get("requiredHosts"))) throw new AssertionError("real QuickJS did not report offline initialization dependency: " + inspection);
            if (SimpleJson.stringify(inspection).contains("PRIVATE")) throw new AssertionError("real QuickJS initialization requirement leaked query");
            var downloads = new java.util.concurrent.atomic.AtomicInteger();
            var staged = new AudioSourceService.Runner() {
                public boolean ready() { return actual.ready(); }
                public Map<String,Object> run(Map<String,Object> input) {
                    if ("download".equals(input.get("op"))) { downloads.incrementAndGet(); return Map.of("ok", true, "script", script); }
                    return actual.run(input);
                }
                public void close() {}
            };
            try (var service = new AudioSourceService(data, () -> List.of(), staged)) {
                var preview = SimpleJson.asMap(service.previewUrl(Map.of("url", "https://scripts.example.org/own.js")).get("preview"));
                if (!Boolean.TRUE.equals(preview.get("initializationRequired")) || !SimpleJson.asMap(preview.get("capabilities")).isEmpty()) throw new AssertionError("real QuickJS pending preview was not staged honestly");
                try {
                    service.importPreview(Map.of("token", preview.get("token"), "allowedHosts", List.of(), "consent", true, "apply", true));
                    throw new AssertionError("real pending source imported without required host");
                } catch (IllegalArgumentException expected) {
                    if (!"AUDIO_SOURCE_HOST_NOT_ALLOWED".equals(expected.getMessage())) throw expected;
                }
                if (downloads.get() != 1 || !"builtin".equals(service.payload().get("selected")) || Files.exists(data.resolve("audio-sources/sources.json"))) throw new AssertionError("real pending preview mutated persistent state");
            }
            System.out.println("AudioSourceQuickJsProbe: actual offline initialization requirement, staged preview, host consent and no persistence passed");
        }
    }
}
