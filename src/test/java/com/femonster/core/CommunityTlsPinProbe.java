package com.femonster.core;

import java.lang.reflect.Constructor;
import java.math.BigInteger;
import java.net.Socket;
import java.security.MessageDigest;
import java.security.Principal;
import java.security.PublicKey;
import java.security.cert.CertificateEncodingException;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.Date;
import java.util.Set;
import javax.net.ssl.SSLEngine;
import javax.net.ssl.X509ExtendedTrustManager;
import javax.security.auth.x500.X500Principal;

public final class CommunityTlsPinProbe {
    private CommunityTlsPinProbe() {
    }

    public static void main(String[] args) throws Exception {
        byte[] encoded = "fixture-community-certificate".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        X509Certificate certificate = new FixtureCertificate(encoded);
        String matchingPin = hex(MessageDigest.getInstance("SHA-256").digest(encoded));

        X509ExtendedTrustManager accepting = new FixtureTrustManager(false);
        X509ExtendedTrustManager rejecting = new FixtureTrustManager(true);
        X509ExtendedTrustManager strictMatching = pinned(accepting, Set.of(matchingPin));
        X509ExtendedTrustManager strictMismatch = pinned(accepting, Set.of("0".repeat(64)));
        X509ExtendedTrustManager pinnedSelfSigned = pinned(rejecting, Set.of(matchingPin));

        strictMatching.checkServerTrusted(new X509Certificate[] { certificate }, "RSA");
        pinnedSelfSigned.checkServerTrusted(new X509Certificate[] { certificate }, "RSA");
        boolean mismatchRejected = false;
        try {
            strictMismatch.checkServerTrusted(new X509Certificate[] { certificate }, "RSA");
        } catch (CertificateException expected) {
            mismatchRejected = true;
        }
        require(mismatchRejected, "a system-trusted certificate with the wrong pin was accepted");
        System.out.println("CommunityTlsPinProbe passed");
    }

    private static X509ExtendedTrustManager pinned(X509ExtendedTrustManager delegate, Set<String> pins) throws Exception {
        Class<?> type = Class.forName("com.femonster.core.CommunityService$PinnedTrustManager");
        Constructor<?> constructor = type.getDeclaredConstructor(X509ExtendedTrustManager.class, Set.class);
        constructor.setAccessible(true);
        return (X509ExtendedTrustManager) constructor.newInstance(delegate, pins);
    }

    private static String hex(byte[] value) {
        StringBuilder out = new StringBuilder(value.length * 2);
        for (byte item : value) out.append(String.format("%02X", item & 0xff));
        return out.toString();
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalStateException(message);
    }

    private static final class FixtureTrustManager extends X509ExtendedTrustManager {
        private final boolean reject;

        private FixtureTrustManager(boolean reject) {
            this.reject = reject;
        }

        private void check() throws CertificateException {
            if (reject) throw new CertificateException("fixture certificate is not system trusted");
        }

        public void checkClientTrusted(X509Certificate[] chain, String authType, Socket socket) throws CertificateException { check(); }
        public void checkServerTrusted(X509Certificate[] chain, String authType, Socket socket) throws CertificateException { check(); }
        public void checkClientTrusted(X509Certificate[] chain, String authType, SSLEngine engine) throws CertificateException { check(); }
        public void checkServerTrusted(X509Certificate[] chain, String authType, SSLEngine engine) throws CertificateException { check(); }
        public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException { check(); }
        public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException { check(); }
        public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
    }

    @SuppressWarnings("deprecation")
    private static final class FixtureCertificate extends X509Certificate {
        private final byte[] encoded;

        private FixtureCertificate(byte[] encoded) {
            this.encoded = encoded.clone();
        }

        public void checkValidity() { }
        public void checkValidity(Date date) { }
        public int getVersion() { return 3; }
        public BigInteger getSerialNumber() { return BigInteger.ONE; }
        public Principal getIssuerDN() { return new X500Principal("CN=Fixture"); }
        public Principal getSubjectDN() { return new X500Principal("CN=Fixture"); }
        public Date getNotBefore() { return new Date(0); }
        public Date getNotAfter() { return new Date(Long.MAX_VALUE); }
        public byte[] getTBSCertificate() { return encoded.clone(); }
        public byte[] getSignature() { return new byte[0]; }
        public String getSigAlgName() { return "none"; }
        public String getSigAlgOID() { return "0.0"; }
        public byte[] getSigAlgParams() { return null; }
        public boolean[] getIssuerUniqueID() { return null; }
        public boolean[] getSubjectUniqueID() { return null; }
        public boolean[] getKeyUsage() { return null; }
        public int getBasicConstraints() { return -1; }
        public byte[] getEncoded() throws CertificateEncodingException { return encoded.clone(); }
        public void verify(PublicKey key) { }
        public void verify(PublicKey key, String sigProvider) { }
        public String toString() { return "FixtureCertificate"; }
        public PublicKey getPublicKey() { return null; }
        public Set<String> getCriticalExtensionOIDs() { return null; }
        public byte[] getExtensionValue(String oid) { return null; }
        public Set<String> getNonCriticalExtensionOIDs() { return null; }
        public boolean hasUnsupportedCriticalExtension() { return false; }
    }
}
