package com.femonster.memory;

public interface KeyProtector {
    byte[] protect(byte[] plaintext, byte[] entropy);

    byte[] unprotect(byte[] protectedBytes, byte[] entropy);
}
