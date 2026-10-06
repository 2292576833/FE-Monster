package com.femonster.core;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;

/** Offline account-memory identity must stay isolated, opaque, and stable. */
public final class CommunityAccountProfileStoreProbe {
    private CommunityAccountProfileStoreProbe() {}

    public static void main(String[] args) throws Exception {
        Path root = Files.createTempDirectory("fe-community-memory-subject-");
        Path file = root.resolve("community-account-profiles.json");
        String accountA = "https://community.example\nqishui\naccount-a";
        String accountB = "https://community.example\nqishui\naccount-b";
        String serverBinding = "membind_v1_" + "a".repeat(64);
        try {
            CommunityAccountProfileStore store = new CommunityAccountProfileStore(file);
            String localA = store.openOrCreateLocalMemorySubject(accountA);
            String localB = store.openOrCreateLocalMemorySubject(accountB);
            require(localA.matches("memlocal_v1_[A-Za-z0-9_-]{43}"), "LOCAL_SUBJECT_FORMAT");
            require(!localA.equals(localB), "LOCAL_ACCOUNT_SCOPE_COLLISION");
            require(store.rememberMemorySubject(accountA, serverBinding), "SERVER_BINDING_REJECTED");
            require(localA.equals(store.memorySubject(accountA)), "SERVER_BINDING_REPLACED_LOCAL_SCOPE");
            require(serverBinding.equals(store.serverMemorySubject(accountA)), "SERVER_BINDING_NOT_RETAINED");

            store = new CommunityAccountProfileStore(file);
            require(localA.equals(store.openOrCreateLocalMemorySubject(accountA)), "LOCAL_SUBJECT_NOT_STABLE");
            require(localB.equals(store.openOrCreateLocalMemorySubject(accountB)), "SECOND_LOCAL_SUBJECT_NOT_STABLE");
            require(serverBinding.equals(store.serverMemorySubject(accountA)), "SERVER_BINDING_NOT_PERSISTED");

            String accountC = "https://community.example\nqq\naccount-c";
            require(store.rememberMemorySubject(accountC, serverBinding), "DIRECT_SERVER_BINDING_REJECTED");
            require(serverBinding.equals(store.memorySubject(accountC)), "DIRECT_SERVER_SCOPE_NOT_USED");
            System.out.println("CommunityAccountProfileStoreProbe passed");
        } finally {
            try (var files = Files.walk(root)) {
                for (Path filePath : files.sorted(Comparator.reverseOrder()).toList()) {
                    Files.deleteIfExists(filePath);
                }
            }
        }
    }

    private static void require(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
}
