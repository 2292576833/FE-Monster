package com.femonster;

import com.femonster.api.ApiRoutes;
import com.femonster.core.AppContext;
import com.femonster.core.ProjectPaths;
import com.femonster.desktop.LocalClientLauncher;
import com.femonster.http.StaticFileHandler;
import com.femonster.music.MusicApiBootstrap;
import com.sun.net.httpserver.HttpServer;

import java.awt.Desktop;
import java.io.IOException;
import java.net.BindException;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.net.URI;
import java.nio.file.Files;
import java.util.Enumeration;
import java.util.concurrent.Executors;
import java.util.concurrent.CountDownLatch;

public final class FeMonsterJavaApp {
    private FeMonsterJavaApp() {
    }

    public static void main(String[] args) throws Exception {
        int preferredPort = parsePort();
        String bindHost = parseBindHost();
        ProjectPaths paths = ProjectPaths.detect();
        Files.createDirectories(paths.dataDir);
        MusicApiBootstrap.ensureAvailable(paths);

        AppContext context = new AppContext(paths);
        HttpServer server = createServer(preferredPort, bindHost);
        int port = server.getAddress().getPort();
        server.setExecutor(Executors.newCachedThreadPool());
        ApiRoutes.register(server, context);
        server.createContext("/components/", new StaticFileHandler(paths.root));
        server.createContext("/", new StaticFileHandler(paths.webRoot));
        server.start();

        String url = "http://127.0.0.1:" + port + "/";
        String remoteUrl = remoteAccessUrl(bindHost, port);
        System.out.println("FE Monster Java is running.");
        if (port != preferredPort) {
            System.out.println("Port " + preferredPort + " was busy; using " + port + " instead.");
        }
        System.out.println("Bind: " + bindHost);
        System.out.println("Root: " + paths.root);
        System.out.println("Client assets: " + paths.webRoot);
        System.out.println("Data: " + paths.dataDir);
        System.out.println("URL:  " + url);
        if (!url.equals(remoteUrl)) {
            System.out.println("Remote URL: " + remoteUrl);
        }

        ClientMode clientMode = clientMode(args);
        if (clientMode == ClientMode.LOCAL) {
            boolean opened = LocalClientLauncher.open(url, paths, context.runtimeSettings.snapshot());
            if (!opened) {
                System.out.println("Local client window could not be launched; opening the default browser instead.");
                openBrowser(url);
            }
        } else if (clientMode == ClientMode.BROWSER) {
            openBrowser(url);
        }

        new CountDownLatch(1).await();
    }

    private static HttpServer createServer(int preferredPort, String bindHost) throws IOException {
        IOException last = null;
        int maxPort = Math.min(65535, preferredPort + 20);
        for (int port = preferredPort; port <= maxPort; port++) {
            try {
                return HttpServer.create(new InetSocketAddress(bindHost, port), 0);
            } catch (BindException e) {
                last = e;
            }
        }
        try {
            return HttpServer.create(new InetSocketAddress(bindHost, 0), 0);
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

    private static String parseBindHost() {
        String raw = System.getenv().getOrDefault("FE_MONSTER_BIND", "127.0.0.1").trim();
        return raw.isEmpty() ? "127.0.0.1" : raw;
    }

    private static String remoteAccessUrl(String bindHost, int port) {
        if ("127.0.0.1".equals(bindHost) || "localhost".equalsIgnoreCase(bindHost) || "::1".equals(bindHost)) {
            return "http://127.0.0.1:" + port + "/";
        }
        String host = ("0.0.0.0".equals(bindHost) || "::".equals(bindHost)) ? firstLanIpv4Address() : bindHost;
        return "http://" + host + ":" + port + "/";
    }

    private static String firstLanIpv4Address() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface network = interfaces.nextElement();
                if (!network.isUp() || network.isLoopback() || network.isVirtual()) continue;
                Enumeration<InetAddress> addresses = network.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();
                    if (address instanceof Inet4Address && !address.isLoopbackAddress()) {
                        return address.getHostAddress();
                    }
                }
            }
        } catch (SocketException ignored) {
        }
        return "127.0.0.1";
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
