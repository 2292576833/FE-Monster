package com.femonster.core;

import com.femonster.community.CommunityModule;
import com.femonster.community.CommunityDeviceRequest;
import com.femonster.community.CommunityRequest;
import com.femonster.community.CommunitySignature;

import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.ServiceConfigurationError;
import java.util.ServiceLoader;
import java.util.Set;

public final class CommunityModuleBridge {
    private final List<CommunityModule> modules = new ArrayList<>();
    private final List<ClassLoader> pluginLoaders = new ArrayList<>();

    public CommunityModuleBridge(Path pluginDir) {
        loadFrom(ServiceLoader.load(CommunityModule.class));
        loadPluginDirectory(pluginDir);
    }

    public Map<String, String> signatureHeaders(String method, String path, String body) {
        if (modules.isEmpty()) return Map.of();
        CommunityRequest request = new CommunityRequest(method, path, body);
        for (CommunityModule module : modules) {
            try {
                CommunitySignature signature = module.sign(request);
                if (signature != null && !signature.headers().isEmpty()) {
                    return signature.headers();
                }
            } catch (RuntimeException error) {
                System.err.println("[community] closed module signing failed: " + module.moduleName() + ": " + error.getMessage());
            }
        }
        return Map.of();
    }

    public String deviceFingerprint(Map<String, String> rawSignals) {
        if (modules.isEmpty()) return "";
        CommunityDeviceRequest request = new CommunityDeviceRequest(rawSignals);
        for (CommunityModule module : modules) {
            try {
                String fingerprint = module.deviceFingerprint(request);
                if (fingerprint != null && fingerprint.matches("[A-Za-z0-9_-]{16,128}")) {
                    return fingerprint;
                }
            } catch (RuntimeException error) {
                System.err.println("[community] closed module fingerprint failed: " + module.moduleName() + ": " + error.getMessage());
            }
        }
        return "";
    }

    private void loadPluginDirectory(Path pluginDir) {
        if (pluginDir == null || !Files.isDirectory(pluginDir)) return;
        try {
            List<URL> urls = new ArrayList<>();
            try (var stream = Files.list(pluginDir)) {
                stream
                    .filter((file) -> Files.isRegularFile(file) && file.getFileName().toString().toLowerCase().endsWith(".jar"))
                    .forEach((file) -> {
                        try {
                            urls.add(file.toUri().toURL());
                        } catch (IOException ignored) {
                        }
                    });
            }
            if (urls.isEmpty()) return;
            URLClassLoader loader = new URLClassLoader(urls.toArray(URL[]::new), CommunityModule.class.getClassLoader());
            pluginLoaders.add(loader);
            loadFrom(ServiceLoader.load(CommunityModule.class, loader));
        } catch (IOException error) {
            System.err.println("[community] could not load closed module directory: " + error.getMessage());
        }
    }

    private void loadFrom(ServiceLoader<CommunityModule> loader) {
        Set<String> loaded = new LinkedHashSet<>();
        for (CommunityModule module : modules) {
            loaded.add(module.getClass().getName());
        }
        Iterator<CommunityModule> iterator = loader.iterator();
        while (true) {
            CommunityModule module;
            try {
                if (!iterator.hasNext()) break;
                module = iterator.next();
            } catch (ServiceConfigurationError error) {
                System.err.println("[community] could not load closed module: " + error.getMessage());
                continue;
            }
            String key = module.getClass().getName();
            if (!moduleTrusted(module)) continue;
            if (loaded.add(key)) modules.add(module);
        }
    }

    private boolean moduleTrusted(CommunityModule module) {
        try {
            if (module.verifyIntegrity()) return true;
            System.err.println("[community] closed module integrity check failed: " + module.moduleName());
        } catch (RuntimeException error) {
            System.err.println("[community] closed module integrity check failed: " + module.moduleName() + ": " + error.getMessage());
        }
        return false;
    }
}
