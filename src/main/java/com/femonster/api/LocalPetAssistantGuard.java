package com.femonster.api;

import com.sun.net.httpserver.HttpExchange;

import java.net.URI;

/** Owns the local-application origin policy shared by pet and client-AI routes. */
final class LocalPetAssistantGuard {
    private LocalPetAssistantGuard() {
    }

    static void require(HttpExchange exchange) {
        exchange.setAttribute("fe.cors.same-origin", Boolean.TRUE);
        var remote = exchange.getRemoteAddress();
        if (remote == null || remote.getAddress() == null || !remote.getAddress().isLoopbackAddress()) {
            throw new SecurityException("pet assistant is only available from this device");
        }

        int servicePort = exchange.getLocalAddress().getPort();
        URI requestUri;
        try {
            String requestHost = exchange.getRequestHeaders().getFirst("Host");
            if (requestHost == null || requestHost.isBlank()) throw new IllegalArgumentException();
            requestUri = URI.create("http://" + requestHost);
            int requestPort = requestUri.getPort() >= 0 ? requestUri.getPort() : servicePort;
            if (!isApplicationLoopbackHost(requestUri.getHost()) || requestPort != servicePort) {
                throw new IllegalArgumentException();
            }
        } catch (IllegalArgumentException error) {
            throw new SecurityException("pet assistant requires the local application host");
        }

        String fetchSite = exchange.getRequestHeaders().getFirst("Sec-Fetch-Site");
        if (
            fetchSite != null
                && !fetchSite.isBlank()
                && !"same-origin".equalsIgnoreCase(fetchSite)
                && !"none".equalsIgnoreCase(fetchSite)
        ) {
            throw new SecurityException("pet assistant requires the application origin");
        }

        String source = exchange.getRequestHeaders().getFirst("Origin");
        if (source == null || source.isBlank()) source = exchange.getRequestHeaders().getFirst("Referer");
        if (source == null || source.isBlank()) {
            if (
                !"same-origin".equalsIgnoreCase(fetchSite)
                    && !"none".equalsIgnoreCase(fetchSite)
            ) {
                throw new SecurityException("pet assistant requires an application origin header");
            }
            return;
        }
        if ("null".equalsIgnoreCase(source.trim())) {
            throw new SecurityException("pet assistant rejects opaque origins");
        }
        try {
            URI sourceUri = URI.create(source);
            int sourcePort = sourceUri.getPort() >= 0 ? sourceUri.getPort() : defaultPort(sourceUri.getScheme());
            if (
                !"http".equalsIgnoreCase(sourceUri.getScheme())
                    || !isApplicationLoopbackHost(sourceUri.getHost())
                    || requestUri.getHost() == null
                    || !sourceUri.getHost().equalsIgnoreCase(requestUri.getHost())
                    || sourcePort != servicePort
            ) {
                throw new IllegalArgumentException();
            }
        } catch (IllegalArgumentException error) {
            throw new SecurityException("pet assistant requires the application origin");
        }
    }

    private static boolean isApplicationLoopbackHost(String host) {
        if (host == null) return false;
        String normalized = host.toLowerCase();
        return "127.0.0.1".equals(normalized)
            || "localhost".equals(normalized)
            || "::1".equals(normalized);
    }

    private static int defaultPort(String scheme) {
        return "https".equalsIgnoreCase(scheme) ? 443 : 80;
    }
}
