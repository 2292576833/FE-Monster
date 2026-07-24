package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class WallpaperServiceFixtureProbe {
    private WallpaperServiceFixtureProbe() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("expected <fixture-root> <data-dir>");
        Path fixtureRoot = Path.of(args[0]).toAbsolutePath().normalize();
        Path dataDir = Path.of(args[1]).toAbsolutePath().normalize();
        WallpaperService service = new WallpaperService(dataDir);

        Map<String, Object> beforeScan = diagnostics(service);
        service.payload(false);
        Map<String, Object> afterImportedOnly = diagnostics(service);
        Map<String, Object> payload = service.payload(true);
        Map<String, Object> afterFirstScan = diagnostics(service);

        List<Map<String, Object>> wallpapers = maps(payload.get("wallpapers"));
        Map<String, Object> video = byName(wallpapers, "Fixture Manifest Video");
        Map<String, Object> web = byName(wallpapers, "Fixture Web Wallpaper");
        Map<String, Object> scene = byName(wallpapers, "Fixture Native Scene");
        Map<String, Object> unsafe = byName(wallpapers, "Fixture Unsafe Project");

        Map<String, Object> checks = new LinkedHashMap<>();
        checks.put("importedOnlyDoesNotScanWallpaperEngine",
            count(beforeScan, "rootScanCount") >= 0
                && count(afterImportedOnly, "rootScanCount") == count(beforeScan, "rootScanCount")
                && count(afterImportedOnly, "catalogScanCount") == count(beforeScan, "catalogScanCount"));
        checks.put("manifestTypesPreserved",
            "video".equals(text(video.get("kind")))
                && "web".equals(text(web.get("kind")))
                && "scene".equals(text(scene.get("kind"))));
        checks.put("videoUsesManifestFile",
            decodedFileUrl(text(video.get("entryUrl"))).endsWith("video-project\\media\\manifest-video.mp4")
                || decodedFileUrl(text(video.get("entryUrl"))).endsWith("video-project/media/manifest-video.mp4"));
        checks.put("webHasIsolatedEntry",
            text(web.get("entryUrl")).startsWith("/api/wallpapers/web-entry/")
                && text(web.get("entryUrl")).endsWith("/site/index.html")
                && !text(web.get("url")).equals(text(web.get("entryUrl"))));
        checks.put("sceneDeclaresNativeEngine",
            text(scene.get("projectJson")).endsWith("scene-project" + java.io.File.separator + "project.json")
                && !text(scene.get("previewUrl")).isBlank()
                && Boolean.TRUE.equals(scene.get("requiresNativeEngine"))
                && "wallpaper-engine".equals(text(SimpleJson.asMap(scene.get("engineLaunch")).get("provider")))
                && "scene.json".equals(text(SimpleJson.asMap(scene.get("engineLaunch")).get("manifestFile")))
                && text(SimpleJson.asMap(scene.get("engineLaunch")).get("entryFile")).endsWith(
                    "scene-project" + java.io.File.separator + "scene.pkg"
                ));
        checks.put("unsafeManifestPathRejected", unsafe.isEmpty());

        Path manifestVideo = fixtureRoot.resolve("video-project/media/manifest-video.mp4").toRealPath();
        boolean repeatedResolveWorks = true;
        for (int index = 0; index < 8; index++) {
            repeatedResolveWorks &= service.resolveServableFile(manifestVideo.toString()).equals(manifestVideo);
        }
        Map<String, Object> afterFileRequests = diagnostics(service);
        checks.put("fileRequestsReuseRootAndCatalogCache",
            count(afterFirstScan, "rootScanCount") >= 0
                && repeatedResolveWorks
                && count(afterFileRequests, "rootScanCount") == count(afterFirstScan, "rootScanCount")
                && count(afterFileRequests, "catalogScanCount") == count(afterFirstScan, "catalogScanCount"));

        boolean webResourceResolved = false;
        boolean traversalRejected = false;
        try {
            Method resolveWebFile = WallpaperService.class.getMethod("resolveWebFile", String.class, String.class);
            String entryUrl = text(web.get("entryUrl"));
            String marker = "/api/wallpapers/web-entry/";
            String suffix = entryUrl.substring(entryUrl.indexOf(marker) + marker.length());
            int slash = suffix.indexOf('/');
            String projectKey = URLDecoder.decode(suffix.substring(0, slash), StandardCharsets.UTF_8);
            Path css = (Path) resolveWebFile.invoke(service, projectKey, "site/assets/theme.css");
            webResourceResolved = css.equals(fixtureRoot.resolve("web-project/site/assets/theme.css").toRealPath());
            try {
                resolveWebFile.invoke(service, projectKey, "../project.json");
            } catch (InvocationTargetException expected) {
                traversalRejected = expected.getCause() instanceof java.io.IOException;
            }
        } catch (ReflectiveOperationException | RuntimeException ignored) {
        }
        checks.put("webRelativeResourcesAreRootBound", webResourceResolved && traversalRejected);
        checks.put("webMimeTypesAreExplicit",
            WallpaperService.contentType(Path.of("index.html")).startsWith("text/html")
                && WallpaperService.contentType(Path.of("theme.css")).startsWith("text/css")
                && WallpaperService.contentType(Path.of("runtime.js")).startsWith("text/javascript"));

        service.payload(true);
        Map<String, Object> afterManualRefresh = diagnostics(service);
        checks.put("manualScanInvalidatesCaches",
            count(afterManualRefresh, "rootScanCount") == count(afterFileRequests, "rootScanCount") + 1
                && count(afterManualRefresh, "catalogScanCount") == count(afterFileRequests, "catalogScanCount") + 1);

        boolean pass = checks.values().stream().allMatch(Boolean.TRUE::equals);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("pass", pass);
        result.put("checks", checks);
        result.put("kinds", List.of(text(video.get("kind")), text(web.get("kind")), text(scene.get("kind"))));
        result.put("beforeScan", beforeScan);
        result.put("afterFirstScan", afterFirstScan);
        result.put("afterFileRequests", afterFileRequests);
        result.put("afterManualRefresh", afterManualRefresh);
        System.out.println(SimpleJson.stringify(result));
        if (!pass) System.exit(1);
    }

    private static Map<String, Object> diagnostics(WallpaperService service) {
        try {
            Method method = WallpaperService.class.getMethod("cacheDiagnostics");
            return SimpleJson.asMap(method.invoke(service));
        } catch (ReflectiveOperationException ignored) {
            return Map.of();
        }
    }

    private static long count(Map<String, Object> source, String key) {
        return SimpleJson.asLong(source.get(key), -1);
    }

    private static String decodedFileUrl(String value) {
        int marker = value.indexOf("path=");
        return marker < 0 ? "" : URLDecoder.decode(value.substring(marker + 5), StandardCharsets.UTF_8);
    }

    private static String text(Object value) {
        return SimpleJson.asString(value, "");
    }

    private static Map<String, Object> byName(List<Map<String, Object>> wallpapers, String name) {
        return wallpapers.stream()
            .filter(item -> name.equals(text(item.get("name"))))
            .findFirst()
            .orElseGet(Map::of);
    }

    private static List<Map<String, Object>> maps(Object value) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : SimpleJson.asList(value)) {
            Map<String, Object> map = SimpleJson.asMap(item);
            if (!map.isEmpty()) result.add(map);
        }
        return result;
    }
}
