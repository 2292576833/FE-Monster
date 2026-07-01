package com.femonster;

import com.femonster.api.ApiRoutes;
import com.femonster.core.AppContext;
import com.femonster.core.ProjectPaths;
import com.femonster.desktop.LocalClientLauncher;
import com.femonster.http.StaticFileHandler;
import com.sun.net.httpserver.HttpServer;

import java.awt.Desktop;
import java.io.IOException;
import java.net.BindException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.file.Files;
import java.util.concurrent.Executors;

public final class FeMonsterJavaApp {
    private FeMonsterJavaApp() {
    }

    public static void main(String[] args) throws Exception {
        int preferredPort = parsePort();
        ProjectPaths paths = ProjectPaths.detect();
        Files.createDirectories(paths.dataDir);

        AppContext context = new AppContext(paths);
        HttpServer server = createServer(preferredPort);
        int port = server.getAddress().getPort();
        server.setExecutor(Executors.newCachedThreadPool());
        ApiRoutes.register(server, context);
        server.createContext("/components/", new StaticFileHandler(paths.root));
        server.createContext("/", new StaticFileHandler(paths.webRoot));
        server.start();

        String url = "http://127.0.0.1:" + port + "/";
        System.out.println("FE Monster Java is running.");
        if (port != preferredPort) {
            System.out.println("Port " + preferredPort + " was busy; using " + port + " instead.");
        }
        System.out.println("Root: " + paths.root);
        System.out.println("Client assets: " + paths.webRoot);
        System.out.println("Data: " + paths.dataDir);
        System.out.println("URL:  " + url);

        ClientMode clientMode = clientMode(args);
        if (clientMode == ClientMode.LOCAL) {
            boolean opened = LocalClientLauncher.open(url, paths);
            if (!opened) {
                System.out.println("Local client window could not be launched; opening the default browser instead.");
                openBrowser(url);
            }
        } else if (clientMode == ClientMode.BROWSER) {
            openBrowser(url);
        }
    }

    private static HttpServer createServer(int preferredPort) throws IOException {
        IOException last = null;
        int maxPort = Math.min(65535, preferredPort + 20);
        for (int port = preferredPort; port <= maxPort; port++) {
            try {
                return HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
            } catch (BindException e) {
                last = e;
            }
        }
        try {
            return HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            if (last != null) e.addSuppressed(last);
            throw e;
        }
    }

    private static int parsePort() {
        String raw = System.getenv().getOrDefault("FE_MONSTER_PORT", "3000");
        try {
            return Integer.parseInt(raw);
        } catch (NumberFormatException ignored) {
            return 3000;
        }
    }

    private enum ClientMode {
        LOCAL,
        BROWSER,
        NONE
    }

    private static ClientMode clientMode(String[] args) {
        for (String arg : args) {
            if ("--no-client".equalsIgnoreCase(arg) || "--server".equalsIgnoreCase(arg)) return ClientMode.NONE;
            if ("--web".equalsIgnoreCase(arg) || "--browser".equalsIgnoreCase(arg)) return ClientMode.BROWSER;
            if ("--local".equalsIgnoreCase(arg) || "--client".equalsIgnoreCase(arg) || "--open".equalsIgnoreCase(arg)) {
                return ClientMode.LOCAL;
            }
        }
        return ClientMode.LOCAL;
    }

    private static void openBrowser(String url) {
        if (!Desktop.isDesktopSupported()) return;
        try {
            Desktop.getDesktop().browse(URI.create(url));
        } catch (IOException ignored) {
        }
    }
}
