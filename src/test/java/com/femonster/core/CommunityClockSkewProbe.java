package com.femonster.core;

import com.femonster.json.SimpleJson;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

public final class CommunityClockSkewProbe {
    private static final long ALLOWED_ASSERTION_DRIFT_MILLIS = 5_000L;

    private CommunityClockSkewProbe() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("usage: <client-root>");
        Path root = Path.of(args[0]).toAbsolutePath().normalize();
        Files.createDirectories(root);
        MachineIdentityService machine = new MachineIdentityService(ProjectPaths.detect());

        long usableSkewMillis = 12L * 60L * 1_000L;
        CapturedRequest corrected = runScenario(root.resolve("corrected"), machine, usableSkewMillis, true);
        require(
            Math.abs(corrected.timestampMillis() - corrected.serverTimeMillis()) <= ALLOWED_ASSERTION_DRIFT_MILLIS,
            "device signature timestamp was not corrected from the trusted health Date header: " + corrected
        );
        require(
            Math.abs(corrected.timestampMillis() - corrected.localTimeMillis()) >= 10L * 60L * 1_000L,
            "clock-skew probe did not exercise a timestamp outside the server's five-minute window: " + corrected
        );

        long unsafeSkewMillis = 48L * 60L * 60L * 1_000L;
        CapturedRequest bounded = runScenario(root.resolve("bounded"), machine, unsafeSkewMillis, true);
        require(
            Math.abs(bounded.timestampMillis() - bounded.localTimeMillis()) <= ALLOWED_ASSERTION_DRIFT_MILLIS,
            "an implausible health Date offset must fall back to the local clock: " + bounded
        );
        require(
            Math.abs(bounded.timestampMillis() - bounded.serverTimeMillis()) >= 47L * 60L * 60L * 1_000L,
            "unsafe server clock offset was unexpectedly applied: " + bounded
        );

        CapturedRequest missing = runScenario(root.resolve("missing"), machine, usableSkewMillis, false);
        require(
            Math.abs(missing.timestampMillis() - missing.localTimeMillis()) <= ALLOWED_ASSERTION_DRIFT_MILLIS,
            "a missing health Date header must fall back to the local clock: " + missing
        );

        System.out.println("CommunityClockSkewProbe passed");
    }

    private static CapturedRequest runScenario(
        Path scenarioRoot,
        MachineIdentityService machine,
        long skewMillis,
        boolean includeDate
    )
        throws Exception {
        Files.createDirectories(scenarioRoot);
        AtomicLong signedTimestamp = new AtomicLong(Long.MIN_VALUE);
        AtomicLong responseServerTime = new AtomicLong(Long.MIN_VALUE);
        AtomicLong requestLocalTime = new AtomicLong(Long.MIN_VALUE);
        try (ClockServer server = new ClockServer(
            skewMillis,
            includeDate,
            signedTimestamp,
            responseServerTime,
            requestLocalTime
        )) {
            Path config = scenarioRoot.resolve("community-server-url.txt");
            Files.writeString(
                config,
                "http://127.0.0.1:" + server.port(),
                StandardCharsets.UTF_8
            );
            CommunityService service = new CommunityService(config, machine, null);
            Map<String, Object> account = new LinkedHashMap<>();
            account.put("userId", "clock-skew-fixture");
            account.put("nickname", "Clock Skew Fixture");
            Map<String, Object> provider = new LinkedHashMap<>();
            provider.put("loggedIn", true);
            provider.put("account", account);
            Map<String, Object> state = service.state("fixture", "Fixture", provider);
            require(SimpleJson.asBoolean(state.get("ok"), false), "signed registration failed: " + state);
            require(signedTimestamp.get() != Long.MIN_VALUE, "device enrollment signature was not observed");
            return new CapturedRequest(
                signedTimestamp.get(),
                requestLocalTime.get(),
                responseServerTime.get()
            );
        }
    }

    private static final class ClockServer implements AutoCloseable {
        private final long skewMillis;
        private final boolean includeDate;
        private final AtomicLong signedTimestamp;
        private final AtomicLong responseServerTime;
        private final AtomicLong requestLocalTime;
        private final ServerSocket serverSocket;
        private final Thread worker;

        private ClockServer(
            long skewMillis,
            boolean includeDate,
            AtomicLong signedTimestamp,
            AtomicLong responseServerTime,
            AtomicLong requestLocalTime
        ) throws IOException {
            this.skewMillis = skewMillis;
            this.includeDate = includeDate;
            this.signedTimestamp = signedTimestamp;
            this.responseServerTime = responseServerTime;
            this.requestLocalTime = requestLocalTime;
            this.serverSocket = new ServerSocket();
            this.serverSocket.bind(new InetSocketAddress("127.0.0.1", 0));
            this.worker = new Thread(this::serve, "community-clock-skew-fixture");
            this.worker.setDaemon(true);
            this.worker.start();
        }

        private int port() {
            return serverSocket.getLocalPort();
        }

        private void serve() {
            while (!serverSocket.isClosed()) {
                try (Socket socket = serverSocket.accept()) {
                    socket.setSoTimeout(5_000);
                    handle(socket);
                } catch (SocketException error) {
                    if (!serverSocket.isClosed()) throw new IllegalStateException(error);
                } catch (IOException error) {
                    if (!serverSocket.isClosed()) throw new IllegalStateException(error);
                }
            }
        }

        private void handle(Socket socket) throws IOException {
            BufferedReader reader = new BufferedReader(new InputStreamReader(
                socket.getInputStream(),
                StandardCharsets.ISO_8859_1
            ));
            String requestLine = reader.readLine();
            if (requestLine == null || requestLine.isBlank()) return;
            String[] requestParts = requestLine.split(" ", 3);
            String path = requestParts.length >= 2 ? requestParts[1] : "";
            Map<String, String> headers = new LinkedHashMap<>();
            for (String line = reader.readLine(); line != null && !line.isBlank(); line = reader.readLine()) {
                int separator = line.indexOf(':');
                if (separator <= 0) continue;
                headers.put(
                    line.substring(0, separator).trim().toLowerCase(java.util.Locale.ROOT),
                    line.substring(separator + 1).trim()
                );
            }

            if ("/health".equals(path)) {
                long serverTime = System.currentTimeMillis() + skewMillis;
                responseServerTime.set(serverTime);
                sendJson(
                    socket.getOutputStream(),
                    200,
                    Map.of("ok", true, "service", "fe-monster-community"),
                    includeDate
                        ? DateTimeFormatter.RFC_1123_DATE_TIME.format(
                            Instant.ofEpochMilli(serverTime).atZone(ZoneOffset.UTC)
                        )
                        : ""
                );
                return;
            }
            if ("/api/community/device/enroll".equals(path)) {
                requestLocalTime.set(System.currentTimeMillis());
                signedTimestamp.set(Long.parseLong(headers.getOrDefault("x-fe-timestamp", "0")));
                sendJson(socket.getOutputStream(), 200, Map.of("ok", true), "");
                return;
            }
            if ("/api/community/register".equals(path)) {
                sendJson(socket.getOutputStream(), 200, Map.of(
                    "ok", true,
                    "profile", Map.of("feId", "12345678"),
                    "friends", java.util.List.of(),
                    "friendRequests", Map.of("incoming", java.util.List.of(), "outgoing", java.util.List.of())
                ), "");
                return;
            }
            sendJson(socket.getOutputStream(), 404, Map.of("ok", false, "error", "not found"), "");
        }

        private static void sendJson(OutputStream output, int statusCode, Map<String, Object> value, String date)
            throws IOException {
            byte[] body = SimpleJson.stringify(value).getBytes(StandardCharsets.UTF_8);
            String reason = statusCode == 200 ? "OK" : "Not Found";
            StringBuilder headers = new StringBuilder()
                .append("HTTP/1.1 ").append(statusCode).append(' ').append(reason).append("\r\n")
                .append("Content-Type: application/json; charset=utf-8\r\n")
                .append("Content-Length: ").append(body.length).append("\r\n")
                .append("Connection: close\r\n");
            if (date != null && !date.isBlank()) headers.append("Date: ").append(date).append("\r\n");
            headers.append("\r\n");
            output.write(headers.toString().getBytes(StandardCharsets.ISO_8859_1));
            output.write(body);
            output.flush();
        }

        @Override
        public void close() throws Exception {
            serverSocket.close();
            worker.join(2_000L);
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }

    private record CapturedRequest(long timestampMillis, long localTimeMillis, long serverTimeMillis) {
    }
}
