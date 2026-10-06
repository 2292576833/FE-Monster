package com.femonster.api;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpContext;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpPrincipal;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;
import java.nio.file.Files;
import java.nio.file.Path;

import com.femonster.memory.LocalMemoryException;

/** Behavioral HTTP checks that do not need an unlocked vault. */
public final class LocalMemoryHttpModuleProbe {
    private LocalMemoryHttpModuleProbe() {}
    public static void main(String[] args) throws Exception {
        LocalMemoryHttpModule module = new LocalMemoryHttpModule(null);
        Exchange rejected = new Exchange("GET", "/api/local-memory/health", new InetSocketAddress("10.0.0.9", 5000));
        module.tryHandle(rejected);
        require(rejected.status == 403 && "no-store".equals(rejected.response.getFirst("Cache-Control")), "GUARD_NO_STORE_FAILED");
        Exchange options = new Exchange("OPTIONS", "/api/local-memory/events", new InetSocketAddress(InetAddress.getLoopbackAddress(), 5000));
        options.request.set("Host", "127.0.0.1:18080"); options.request.set("Sec-Fetch-Site", "same-origin");
        module.tryHandle(options);
        require(options.status == 204 && "no-store".equals(options.response.getFirst("Cache-Control")), "OPTIONS_NO_STORE_FAILED");
        Exchange wrongMethod = new Exchange("GET", "/api/local-memory/events", new InetSocketAddress(InetAddress.getLoopbackAddress(), 5000));
        wrongMethod.request.set("Host", "127.0.0.1:18080"); wrongMethod.request.set("Sec-Fetch-Site", "same-origin");
        module.tryHandle(wrongMethod);
        require(wrongMethod.status == 405 && "no-store".equals(wrongMethod.response.getFirst("Cache-Control")), "METHOD_MATRIX_FAILED");
        Exchange spoof = new Exchange("POST", "/api/local-memory/events", new InetSocketAddress(InetAddress.getLoopbackAddress(), 5000), bytes("{\"provider\":\"netease\",\"event\":{\"eventId\":\"10000000-0000-4000-8000-000000000001\",\"stream\":\"knowledge\",\"type\":\"user.fact\",\"sourceSequence\":1,\"payload\":{\"occurredAt\":\"2026-08-28T00:00:00Z\",\"sourceSequence\":1,\"source\":\"browser\",\"entityId\":\"pet.personalization.internal.v1\",\"title\":\"forged\",\"value\":\"x\",\"producerProof\":\"forged\"}}}"));
        sameOrigin(spoof); module.tryHandle(spoof);
        require(spoof.status == 400 && "no-store".equals(spoof.response.getFirst("Cache-Control")), "DTO_PROVENANCE_SPOOF_ACCEPTED");
        Exchange oversized = new Exchange("POST", "/api/local-memory/events", new InetSocketAddress(InetAddress.getLoopbackAddress(), 5000), new byte[1024 * 1024 + 1]);
        sameOrigin(oversized); module.tryHandle(oversized);
        require(oversized.status == 507 && "no-store".equals(oversized.response.getFirst("Cache-Control")), "ONE_MIB_BODY_BOUNDARY_FAILED");
        nullableLegacyTimestamp(); restoreBoundary(); errorMapping();
        System.out.println("LocalMemoryHttpModuleProbe passed: guard, OPTIONS, method matrix, DTO spoof, 1MiB JSON, 64MiB restore, error mapping");
    }
    private static void sameOrigin(Exchange exchange) { exchange.request.set("Host", "127.0.0.1:18080"); exchange.request.set("Sec-Fetch-Site", "same-origin"); }
    private static byte[] bytes(String value) { return value.getBytes(java.nio.charset.StandardCharsets.UTF_8); }
    private static void nullableLegacyTimestamp() throws Exception {
        Method parser = LocalMemoryHttpModule.class.getDeclaredMethod("nullableEventTimestamp", Map.class, String.class);
        parser.setAccessible(true);
        require(parser.invoke(null, Map.of("occurredAt", "2026-08-28T00:00:00Z"), "occurredAt").equals("2026-08-28T00:00:00Z"), "EXACT_EVENT_TIMESTAMP_REJECTED");
        Map<String, Object> legacy = new HashMap<>(); legacy.put("occurredAt", null);
        require(parser.invoke(null, legacy, "occurredAt") == null, "LEGACY_NULL_TIMESTAMP_REJECTED");
    }
    private static void restoreBoundary() throws Exception {
        Method copy = LocalMemoryHttpModule.class.getDeclaredMethod("copyBounded", InputStream.class, Path.class, long.class);
        copy.setAccessible(true); Path file = Files.createTempFile("fe-memory-restore-limit-", ".tmp"); Files.deleteIfExists(file);
        try {
            try { copy.invoke(null, new CountingInputStream(64L * 1024 * 1024 + 1), file, 64L * 1024 * 1024); throw new AssertionError("RESTORE_LIMIT_NOT_ENFORCED"); }
            catch (InvocationTargetException failure) { require(failure.getCause() instanceof LocalMemoryException local && local.code() == LocalMemoryException.Code.TOO_LARGE, "RESTORE_LIMIT_WRONG_ERROR"); }
        } finally { Files.deleteIfExists(file); }
    }
    private static void errorMapping() throws Exception {
        Method status = LocalMemoryHttpModule.class.getDeclaredMethod("status", LocalMemoryException.Code.class); status.setAccessible(true);
        require((Integer) status.invoke(null, LocalMemoryException.Code.CONFLICT) == 409, "CONFLICT_MAPPING_FAILED");
        require((Integer) status.invoke(null, LocalMemoryException.Code.LOCKED) == 423, "LOCKED_MAPPING_FAILED");
        require((Integer) status.invoke(null, LocalMemoryException.Code.TOO_LARGE) == 507, "LIMIT_MAPPING_FAILED");
        require((Integer) status.invoke(null, LocalMemoryException.Code.UNAVAILABLE) == 503, "UNAVAILABLE_MAPPING_FAILED");
        require((Integer) status.invoke(null, LocalMemoryException.Code.INTEGRITY) == 422, "INTEGRITY_MAPPING_FAILED");
    }
    private static void require(boolean value, String message) { if (!value) throw new AssertionError(message); }
    private static final class Exchange extends HttpExchange {
        final Headers request = new Headers(), response = new Headers(); final String method; final URI uri; final InetSocketAddress remote; final Map<String,Object> attrs = new HashMap<>(); final ByteArrayOutputStream output = new ByteArrayOutputStream(); final byte[] body; int status = -1;
        Exchange(String method, String path, InetSocketAddress remote) { this(method,path,remote,new byte[0]); }
        Exchange(String method, String path, InetSocketAddress remote, byte[] body) { this.method=method; this.uri=URI.create(path); this.remote=remote; this.body=body; }
        public Headers getRequestHeaders(){return request;} public Headers getResponseHeaders(){return response;} public URI getRequestURI(){return uri;} public String getRequestMethod(){return method;} public HttpContext getHttpContext(){return null;} public void close(){} public ByteArrayInputStream getRequestBody(){return new ByteArrayInputStream(body);} public ByteArrayOutputStream getResponseBody(){return output;} public void sendResponseHeaders(int code,long length){status=code;} public InetSocketAddress getRemoteAddress(){return remote;} public int getResponseCode(){return status;} public InetSocketAddress getLocalAddress(){return new InetSocketAddress(InetAddress.getLoopbackAddress(),18080);} public String getProtocol(){return "HTTP/1.1";} public Object getAttribute(String name){return attrs.get(name);} public void setAttribute(String name,Object value){attrs.put(name,value);} public void setStreams(java.io.InputStream input,java.io.OutputStream output){} public HttpPrincipal getPrincipal(){return null;}
    }
    private static final class CountingInputStream extends InputStream { long left; CountingInputStream(long left) { this.left=left; } public int read(byte[] value,int offset,int length) { if(left==0)return -1; int count=(int)Math.min(left,length); left-=count; return count; } public int read(){if(left==0)return -1;left--;return 0;} }
}
