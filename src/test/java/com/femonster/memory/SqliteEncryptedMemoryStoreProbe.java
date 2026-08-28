package com.femonster.memory;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

public final class SqliteEncryptedMemoryStoreProbe {
    private static final String CHAT_PLAINTEXT = "FE_STORE_CHAT_PLAINTEXT_8F2A 音乐区密语";
    private static final String OPERATION_PLAINTEXT = "FE_STORE_OPERATION_PLAINTEXT_91C4";
    private static final String KNOWLEDGE_PLAINTEXT = "FE_STORE_KNOWLEDGE_PLAINTEXT_37D6";
    private static final String PRIVATE_SCOPE_A = "provider:subject-alpha-private";
    private static final String PRIVATE_SCOPE_B = "provider:subject-beta-private";
    private static final String CHAT_ONE = "10000000-0000-4000-8000-000000000001";
    private static final String CHAT_SEARCH = "10000000-0000-4000-8000-000000000002";
    private static final String CHAT_SCOPE_B = "10000000-0000-4000-8000-000000000003";
    private static final String CHAT_CURSOR_ONE = "10000000-0000-4000-8000-000000000004";
    private static final String CHAT_CURSOR_TWO = "10000000-0000-4000-8000-000000000005";
    private static final String CHAT_CURSOR_THREE = "10000000-0000-4000-8000-000000000006";
    private static final String CHAT_BATCH_ROLLBACK = "10000000-0000-4000-8000-000000000007";
    private static final String OPERATION_ONE = "20000000-0000-4000-8000-000000000001";
    private static final String KNOWLEDGE_ONE = "30000000-0000-4000-8000-000000000001";
    private static final String TRACE_ONE = "trace-main-001";
    private static final Instant TIME_ONE = Instant.parse("2026-08-27T10:11:12.123456789Z");
    private static final Instant TIME_TWO = Instant.parse("2026-08-27T10:11:13.234Z");
    private static final Instant TIME_THREE = Instant.parse("2026-08-27T10:11:14.345Z");

    private SqliteEncryptedMemoryStoreProbe() {
    }

    public static void main(String[] arguments) throws Exception {
        require(arguments.length == 1, "FIXTURE_DIRECTORY_REQUIRED");
        Class.forName("org.sqlite.JDBC");
        Path fixture = Path.of(arguments[0]).toAbsolutePath().normalize();
        Files.createDirectories(fixture);

        primaryStoreContract(fixture.resolve("primary"));
        backupRestoreContract(fixture.resolve("backup-restore"));
        ciphertextTamperContract(fixture.resolve("ciphertext-tamper"));
        nonceTamperContract(fixture.resolve("nonce-tamper"));
        aadMetadataTamperContract(fixture.resolve("aad-tamper"));
        blindTokenTamperContract(fixture.resolve("token-tamper"));
        removedTokenTamperContract(fixture.resolve("removed-token-tamper"));
        tombstoneTamperContract(fixture.resolve("tombstone-tamper"));
        unexpectedSchemaObjectContract(fixture.resolve("unexpected-schema-object"));
        schemaDefinitionTamperContract(fixture.resolve("schema-definition-tamper"));
        backupAuditContract(fixture.resolve("backup-audit"));
        restoreCrashRecoveryContract(fixture.resolve("restore-crash-before-publish"), "before-publish");
        restoreCrashRecoveryContract(fixture.resolve("restore-crash-after-publish"), "after-publish");
        restoreCrashRecoveryContract(
            fixture.resolve("restore-crash-after-wal-configure"),
            "after-wal-configure"
        );
        restoreCrashRecoveryContract(
            fixture.resolve("restore-crash-wal-row-deleted"),
            "after-wal-row-deleted"
        );
        restoreCrashRecoveryContract(fixture.resolve("restore-crash-torn-published"), "torn-published");
        restoreCrashRecoveryContract(
            fixture.resolve("restore-crash-torn-published-staging"),
            "torn-published-staging"
        );
        restoreCrashRecoveryContract(fixture.resolve("restore-crash-missing-live"), "missing-live");
        tornRestoreIntentWriteContract(fixture.resolve("restore-crash-torn-intent-staging"));
        restoreIntentTamperContract(fixture.resolve("restore-intent-tamper"));
        futureSchemaContract(fixture.resolve("future-schema"));
        busyContract(fixture.resolve("busy"));
        rollbackFailureContract(fixture.resolve("rollback-failure"));
        unsupportedNumberContract();

        System.out.println("PASS local encrypted sqlite memory store");
    }

    private static void primaryStoreContract(Path root) throws Exception {
        LocalMemoryEvent firstChat = chat(
            CHAT_ONE,
            PRIVATE_SCOPE_A,
            TRACE_ONE,
            TIME_ONE,
            1,
            CHAT_PLAINTEXT
        );
        LocalMemoryEvent searchChat = chat(
            CHAT_SEARCH,
            PRIVATE_SCOPE_A,
            "trace-search-001",
            TIME_TWO,
            2,
            "我们在音乐区附近继续听歌，记号是星海回声"
        );
        LocalMemoryEvent scopeBChat = chat(
            CHAT_SCOPE_B,
            PRIVATE_SCOPE_B,
            "trace-scope-b-001",
            TIME_TWO,
            1,
            "scope beta memory"
        );
        LocalMemoryEvent operation = operation(OPERATION_ONE, PRIVATE_SCOPE_A, TRACE_ONE, CHAT_ONE, TIME_TWO, 3);
        LocalMemoryEvent knowledge = knowledge(KNOWLEDGE_ONE, PRIVATE_SCOPE_A, TIME_THREE, 4);

        expectCode(
            () -> chatWithMessageId(
                CHAT_ONE,
                "ffffffff-ffff-4fff-8fff-ffffffffffff",
                PRIVATE_SCOPE_A,
                TRACE_ONE,
                TIME_ONE,
                1,
                "mismatch"
            ),
            LocalMemoryException.Code.EVENT_INVALID
        );

        LocalMemoryStore closedStore;
        Instant vaultCreatedAt;
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root)) {
            vaultCreatedAt = lease.createdAt();
            try (LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
                closedStore = store;
                assertHealthy(store.health());
                assertSchemaAndPragmas(root.resolve("memory.db"), lease);

                Instant beforeAppend = Instant.now().minusSeconds(1);
                LocalMemoryStore.AppendResult chatAppend = only(store.appendChats(List.of(firstChat)));
                LocalMemoryStore.AppendResult operationAppend = only(store.appendOperations(List.of(operation)));
                LocalMemoryStore.AppendResult knowledgeAppend = only(store.appendKnowledge(List.of(knowledge)));
                store.appendChats(List.of(searchChat, scopeBChat));
                Instant afterAppend = Instant.now().plusSeconds(1);

                require(!chatAppend.duplicate(), "FRESH_CHAT_REPORTED_DUPLICATE");
                require(!operationAppend.duplicate(), "FRESH_OPERATION_REPORTED_DUPLICATE");
                require(!knowledgeAppend.duplicate(), "FRESH_KNOWLEDGE_REPORTED_DUPLICATE");
                require(CHAT_ONE.equals(chatAppend.eventId()), "CHAT_APPEND_ID_CHANGED");
                require(!chatAppend.recordedAt().isBefore(beforeAppend), "RECORDED_AT_PRECEDES_RECEIPT");
                require(!chatAppend.recordedAt().isAfter(afterAppend), "RECORDED_AT_AFTER_RECEIPT");

                LocalMemoryStore.StoredEvent storedChat = findById(
                    store.queryChats(query(PRIVATE_SCOPE_A, "chat.message", 100, null, null)),
                    CHAT_ONE
                );
                assertStored(storedChat, firstChat);
                require(TIME_ONE.equals(storedChat.event().occurredAt()), "CHAT_OCCURRED_AT_CHANGED");
                require(chatAppend.recordedAt().equals(storedChat.recordedAt()), "CHAT_RECORDED_AT_CHANGED");
                require(CHAT_ONE.equals(storedChat.event().messageId()), "CHAT_EVENT_MESSAGE_ID_DIVERGED");
                require(CHAT_PLAINTEXT.equals(storedChat.event().payload().get("text")), "CHAT_TEXT_NOT_LOSSLESS");

                LocalMemoryStore.StoredEvent storedOperation = findById(
                    store.queryOperations(query(PRIVATE_SCOPE_A, "command.succeeded", 100, null, null)),
                    OPERATION_ONE
                );
                assertStored(storedOperation, operation);
                require("local-ai".equals(storedOperation.event().payload().get("actor")), "OPERATION_ACTOR_LOST");
                require(
                    "local-configured-model".equals(storedOperation.event().payload().get("modelOrigin")),
                    "OPERATION_MODEL_ORIGIN_LOST"
                );
                require(
                    OPERATION_PLAINTEXT.equals(map(storedOperation.event().payload().get("receipt")).get("summary")),
                    "OPERATION_RECEIPT_NOT_LOSSLESS"
                );
                require(
                    "receipt-main-001".equals(map(storedOperation.event().payload().get("undo")).get("receiptId")),
                    "OPERATION_UNDO_RECEIPT_LOST"
                );

                LocalMemoryStore.StoredEvent storedKnowledge = findById(
                    store.queryKnowledge(query(PRIVATE_SCOPE_A, "library.playlist_snapshot", 100, null, null)),
                    KNOWLEDGE_ONE
                );
                assertStored(storedKnowledge, knowledge);
                require(
                    KNOWLEDGE_PLAINTEXT.equals(storedKnowledge.event().payload().get("title")),
                    "KNOWLEDGE_NOT_LOSSLESS"
                );
                require(storedKnowledge.event().sourceSequence() == 4, "KNOWLEDGE_SOURCE_SEQUENCE_LOST");

                LocalMemoryStore.TraceResult trace = store.queryTrace(
                    new LocalMemoryStore.TraceQuery(PRIVATE_SCOPE_A, TRACE_ONE, 100)
                );
                require(ids(trace.chats()).equals(Set.of(CHAT_ONE)), "TRACE_CHAT_COLLECTION_WRONG");
                require(ids(trace.operations()).equals(Set.of(OPERATION_ONE)), "TRACE_OPERATION_COLLECTION_WRONG");
                require(
                    trace.chats().stream().allMatch(item -> item.event().stream() == MemorySanitizer.Stream.CHAT),
                    "TRACE_CHAT_STREAM_MIXED"
                );
                require(
                    trace.operations().stream().allMatch(
                        item -> item.event().stream() == MemorySanitizer.Stream.OPERATION
                    ),
                    "TRACE_OPERATION_STREAM_MIXED"
                );

                LocalMemoryStore.Page scopeA = store.queryChats(
                    query(PRIVATE_SCOPE_A, "chat.message", 100, null, null)
                );
                LocalMemoryStore.Page scopeB = store.queryChats(
                    query(PRIVATE_SCOPE_B, "chat.message", 100, null, null)
                );
                require(!ids(scopeA.records()).contains(CHAT_SCOPE_B), "SCOPE_B_LEAKED_INTO_SCOPE_A");
                require(ids(scopeB.records()).equals(Set.of(CHAT_SCOPE_B)), "SCOPE_B_QUERY_NOT_ISOLATED");

                LocalMemoryStore.Page chinese = store.queryChats(
                    query(PRIVATE_SCOPE_A, "chat.message", 100, null, "星海回声")
                );
                require(ids(chinese.records()).contains(CHAT_SEARCH), "CHINESE_BLIND_SEARCH_MISSED_RECORD");
                require(
                    chinese.records().stream().allMatch(item -> item.event().stream() == MemorySanitizer.Stream.CHAT),
                    "SEARCH_CROSSED_STREAM_BOUNDARY"
                );
                require(
                    store.queryChats(query(PRIVATE_SCOPE_A, "chat.message", 100, null, "……？！"))
                        .records().isEmpty(),
                    "TOKENLESS_SEARCH_BECAME_UNFILTERED_QUERY"
                );

                cursorContract(store);
                duplicateAndRollbackContract(store, firstChat, knowledge);
                assertPhysicalSeparation(root.resolve("memory.db"), lease, firstChat, operation, knowledge);
                assertOwnerOnly(root);
                scanPersistentArtifacts(root);

                LocalMemoryStore.ForgetResult forgotten = store.forgetChats(
                    new LocalMemoryStore.ForgetRequest(
                        PRIVATE_SCOPE_A,
                        Set.of(CHAT_SEARCH),
                        null,
                        null,
                        Set.of(),
                        null,
                        false
                    )
                );
                require(forgotten.count() == 1, "FORGET_COUNT_WRONG");
                require(
                    !ids(store.queryChats(query(PRIVATE_SCOPE_A, "chat.message", 100, null, null)).records())
                        .contains(CHAT_SEARCH),
                    "FORGOTTEN_CHAT_STILL_QUERYABLE"
                );
                require(
                    store.queryChats(query(PRIVATE_SCOPE_A, "chat.message", 100, null, "星海回声")).records().isEmpty(),
                    "FORGOTTEN_CHAT_SEARCH_TOKEN_STILL_QUERYABLE"
                );
                assertTombstoneAndTokenRemoval(root.resolve("memory.db"), CHAT_SEARCH);
                require(
                    ids(store.queryOperations(query(PRIVATE_SCOPE_A, "command.succeeded", 100, null, null)).records())
                        .contains(OPERATION_ONE),
                    "CHAT_FORGET_REMOVED_OPERATION"
                );
            }
        }

        expectCode(
            () -> closedStore.queryChats(query(PRIVATE_SCOPE_A, "chat.message", 1, null, null)),
            LocalMemoryException.Code.CLOSED
        );

        try (MemoryVaultKeyManager.KeyLease reopenedLease = openLease(root);
             LocalMemoryStore reopened = SqliteEncryptedMemoryStore.open(root, reopenedLease)) {
            require(vaultCreatedAt.equals(reopenedLease.createdAt()), "VAULT_CREATED_AT_CHANGED_ON_RESTART");
            LocalMemoryStore.StoredEvent reopenedChat = findById(
                reopened.queryChats(query(PRIVATE_SCOPE_A, "chat.message", 100, null, null)),
                CHAT_ONE
            );
            require(TIME_ONE.equals(reopenedChat.event().occurredAt()), "NANOSECOND_TIME_LOST_ON_RESTART");
            require(
                ids(reopened.queryOperations(query(PRIVATE_SCOPE_A, "command.succeeded", 100, null, null)).records())
                    .contains(OPERATION_ONE),
                "OPERATION_DID_NOT_SURVIVE_RESTART"
            );
            require(
                ids(reopened.queryKnowledge(
                    query(PRIVATE_SCOPE_A, "library.playlist_snapshot", 100, null, null)
                ).records()).contains(KNOWLEDGE_ONE),
                "KNOWLEDGE_DID_NOT_SURVIVE_RESTART"
            );
            scanPersistentArtifacts(root);
        }
        require(!Files.exists(root.resolve("memory.db-wal")), "WAL_REMAINED_AFTER_CLOSE");
        require(!Files.exists(root.resolve("memory.db-shm")), "SHM_REMAINED_AFTER_CLOSE");
    }

    private static void cursorContract(LocalMemoryStore store) {
        Instant sameTime = Instant.parse("2026-08-27T11:00:00.500Z");
        store.appendChats(List.of(
            chat(CHAT_CURSOR_ONE, PRIVATE_SCOPE_A, "trace-cursor-1", sameTime, 11, "cursor one"),
            chat(CHAT_CURSOR_TWO, PRIVATE_SCOPE_A, "trace-cursor-2", sameTime, 12, "cursor two"),
            chat(CHAT_CURSOR_THREE, PRIVATE_SCOPE_A, "trace-cursor-3", sameTime, 13, "cursor three")
        ));

        LocalMemoryStore.Query firstQuery = query(PRIVATE_SCOPE_A, "chat.message", 2, null, null);
        LocalMemoryStore.Page first = store.queryChats(firstQuery);
        LocalMemoryStore.Page repeated = store.queryChats(firstQuery);
        require(first.records().size() == 2, "CURSOR_FIRST_PAGE_SIZE_WRONG");
        require(first.next() != null, "CURSOR_FIRST_PAGE_MISSING");
        require(eventIds(first.records()).equals(eventIds(repeated.records())), "CURSOR_ORDER_NOT_STABLE");
        require(first.next().equals(repeated.next()), "CURSOR_VALUE_NOT_STABLE");

        LocalMemoryStore.Page second = store.queryChats(
            query(PRIVATE_SCOPE_A, "chat.message", 100, first.next(), null)
        );
        Set<String> overlap = ids(first.records());
        overlap.retainAll(ids(second.records()));
        require(overlap.isEmpty(), "CURSOR_PAGE_OVERLAP");
        LinkedHashSet<String> combined = new LinkedHashSet<>(ids(first.records()));
        combined.addAll(ids(second.records()));
        require(
            combined.containsAll(Set.of(CHAT_CURSOR_ONE, CHAT_CURSOR_TWO, CHAT_CURSOR_THREE)),
            "CURSOR_PAGINATION_LOST_RECORD"
        );
    }

    private static void duplicateAndRollbackContract(
        LocalMemoryStore store,
        LocalMemoryEvent originalChat,
        LocalMemoryEvent originalKnowledge
    ) {
        LocalMemoryStore.AppendResult duplicate = only(store.appendChats(List.of(originalChat)));
        require(duplicate.duplicate(), "IDENTICAL_DUPLICATE_NOT_IDEMPOTENT");

        LocalMemoryEvent conflictingChat = chat(
            CHAT_ONE,
            PRIVATE_SCOPE_A,
            TRACE_ONE,
            TIME_ONE,
            1,
            "different authenticated content"
        );
        expectCode(
            () -> store.appendChats(List.of(conflictingChat)),
            LocalMemoryException.Code.CONFLICT
        );
        LocalMemoryStore.StoredEvent unchanged = findById(
            store.queryChats(query(PRIVATE_SCOPE_A, "chat.message", 100, null, null)),
            CHAT_ONE
        );
        require(CHAT_PLAINTEXT.equals(unchanged.event().payload().get("text")), "CONFLICT_OVERWROTE_CHAT");

        LocalMemoryEvent crossStream = operation(CHAT_ONE, PRIVATE_SCOPE_A, "trace-cross-stream", CHAT_ONE, TIME_TWO, 9);
        expectCode(
            () -> store.appendOperations(List.of(crossStream)),
            LocalMemoryException.Code.CONFLICT
        );
        require(
            !ids(store.queryOperations(query(PRIVATE_SCOPE_A, "command.succeeded", 100, null, null)).records())
                .contains(CHAT_ONE),
            "CROSS_STREAM_DUPLICATE_WAS_WRITTEN"
        );

        LocalMemoryEvent validFirst = chat(
            CHAT_BATCH_ROLLBACK,
            PRIVATE_SCOPE_A,
            "trace-batch-rollback",
            TIME_THREE,
            99,
            "batch must roll back"
        );
        LocalMemoryEvent conflictingLast = knowledge(
            originalKnowledge.eventId(),
            PRIVATE_SCOPE_A,
            TIME_THREE,
            originalKnowledge.sourceSequence() + 1
        );
        expectCode(
            () -> store.appendBatch(List.of(validFirst, conflictingLast)),
            LocalMemoryException.Code.CONFLICT
        );
        require(
            !ids(store.queryChats(query(PRIVATE_SCOPE_A, "chat.message", 100, null, null)).records())
                .contains(CHAT_BATCH_ROLLBACK),
            "MIXED_BATCH_PARTIALLY_COMMITTED"
        );
    }

    private static void backupRestoreContract(Path root) throws Exception {
        LocalMemoryEvent chat = chat(
            "40000000-0000-4000-8000-000000000001",
            PRIVATE_SCOPE_A,
            "trace-backup-001",
            TIME_ONE,
            1,
            CHAT_PLAINTEXT
        );
        LocalMemoryEvent operation = operation(
            "40000000-0000-4000-8000-000000000002",
            PRIVATE_SCOPE_A,
            "trace-backup-001",
            chat.eventId(),
            TIME_TWO,
            2
        );
        LocalMemoryEvent knowledge = knowledge(
            "40000000-0000-4000-8000-000000000003",
            PRIVATE_SCOPE_A,
            TIME_THREE,
            3
        );
        Path backup = root.resolve("backups").resolve("snapshot.fememory");
        Path tampered = root.resolve("backups").resolve("snapshot-tampered.fememory");
        Path manifestTampered = root.resolve("backups").resolve("snapshot-manifest-tampered.fememory");

        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
            store.appendBatch(List.of(chat, operation, knowledge));
            ArrayList<LocalMemoryEvent> padding = new ArrayList<>();
            String paddingText = "padding ".repeat(4_000);
            for (int index = 1; index <= 40; index++) {
                padding.add(chat(
                    "41000000-0000-4000-8000-" + "%012d".formatted(index),
                    "provider:backup-padding-private",
                    "trace-backup-padding-" + index,
                    TIME_THREE.plusSeconds(index),
                    100L + index,
                    paddingText
                ));
            }
            store.appendBatch(padding);
            expectCode(
                () -> store.backup(root.resolve("outside.fememory")),
                LocalMemoryException.Code.INVALID_ARGUMENT
            );
            require(!Files.exists(root.resolve("outside.fememory")), "OUT_OF_BOUNDS_BACKUP_CREATED");
            LocalMemoryStore.BackupResult result = store.backup(backup);
            require(Files.isRegularFile(backup), "BACKUP_FILE_MISSING");
            require(Files.size(root.resolve("memory.db")) > 1_048_576L, "BACKUP_TEST_DATABASE_TOO_SMALL");
            require(result.bytes() > 1_048_576L, "LARGE_BACKUP_NOT_EXERCISED");
            require(result.bytes() == Files.size(backup), "BACKUP_SIZE_RECEIPT_WRONG");
            require(result.sha256().equals(sha256(backup)), "BACKUP_SHA256_RECEIPT_WRONG");
            require(MemoryFileSecurity.isOwnerOnly(backup.getParent(), true), "BACKUP_DIRECTORY_NOT_OWNER_ONLY");
            require(MemoryFileSecurity.isOwnerOnly(backup, false), "BACKUP_NOT_OWNER_ONLY");
            scanPersistentArtifacts(root);

            LocalMemoryStore.ForgetResult forgotten = store.forgetChats(
                new LocalMemoryStore.ForgetRequest(
                    PRIVATE_SCOPE_A,
                    Set.of(chat.eventId()),
                    null,
                    null,
                    Set.of(),
                    null,
                    false
                )
            );
            require(forgotten.count() == 1, "BACKUP_PRE_RESTORE_DELETE_FAILED");
            require(
                store.queryChats(query(PRIVATE_SCOPE_A, "chat.message", 100, null, null)).records().isEmpty(),
                "BACKUP_PRE_RESTORE_STATE_WRONG"
            );

            LocalMemoryStore.RestoreResult restored = store.restore(backup);
            require(restored.records() == 43, "RESTORE_RECORD_COUNT_WRONG");
            require(
                ids(store.queryChats(query(PRIVATE_SCOPE_A, "chat.message", 100, null, null)).records())
                    .equals(Set.of(chat.eventId())),
                "RESTORE_CHAT_NOT_LOSSLESS"
            );
            LocalMemoryStore.StoredEvent restoredOperation = onlyStored(
                store.queryOperations(query(PRIVATE_SCOPE_A, "command.succeeded", 100, null, null))
            );
            require(
                OPERATION_PLAINTEXT.equals(map(restoredOperation.event().payload().get("receipt")).get("summary")),
                "RESTORE_OPERATION_NOT_LOSSLESS"
            );
            require(
                ids(store.queryKnowledge(
                    query(PRIVATE_SCOPE_A, "library.playlist_snapshot", 100, null, null)
                ).records()).equals(Set.of(knowledge.eventId())),
                "RESTORE_KNOWLEDGE_NOT_LOSSLESS"
            );
            require(
                store.queryChats(query(
                    "provider:backup-padding-private", "chat.message", 100, null, null
                )).records().size() == 40,
                "LARGE_BACKUP_PADDING_NOT_RESTORED"
            );
            expectCode(
                () -> store.restore(root.resolve("memory.db")),
                LocalMemoryException.Code.RESTORE_INVALID
            );

            Files.copy(backup, manifestTampered, StandardCopyOption.REPLACE_EXISTING);
            byte[] manifestBytes = Files.readAllBytes(manifestTampered);
            require(manifestBytes.length > 24, "BACKUP_MANIFEST_MISSING");
            manifestBytes[20] ^= 0x20;
            Files.write(manifestTampered, manifestBytes);
            expectCode(
                () -> store.restore(manifestTampered),
                LocalMemoryException.Code.RESTORE_INVALID
            );

            Files.copy(backup, tampered, StandardCopyOption.REPLACE_EXISTING);
            byte[] bytes = Files.readAllBytes(tampered);
            require(bytes.length > 32, "BACKUP_TOO_SMALL_TO_AUTHENTICATE");
            bytes[bytes.length / 2] ^= 0x40;
            Files.write(tampered, bytes);
            expectAnyCode(
                () -> store.restore(tampered),
                Set.of(LocalMemoryException.Code.RESTORE_INVALID, LocalMemoryException.Code.INTEGRITY)
            );
            require(
                ids(store.queryChats(query(PRIVATE_SCOPE_A, "chat.message", 100, null, null)).records())
                    .equals(Set.of(chat.eventId())),
                "FAILED_RESTORE_CHANGED_LIVE_DATABASE"
            );
            scanPersistentArtifacts(root);
        }
        require(!Files.exists(root.resolve("memory.db-wal")), "RESTORE_LEFT_WAL_AFTER_CLOSE");
        require(!Files.exists(root.resolve("memory.db-shm")), "RESTORE_LEFT_SHM_AFTER_CLOSE");
    }

    private static void ciphertextTamperContract(Path root) throws Exception {
        LocalMemoryEvent chat = chat(
            "50000000-0000-4000-8000-000000000001",
            PRIVATE_SCOPE_A,
            "trace-ciphertext-tamper",
            TIME_ONE,
            1,
            CHAT_PLAINTEXT
        );
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
            store.appendChats(List.of(chat));
        }
        mutateBlob(root.resolve("memory.db"), "chat_records", "ciphertext", "message_id", chat.eventId());
        expectIntegrityOnOpenOrQuery(root, query(PRIVATE_SCOPE_A, "chat.message", 100, null, null));
        assertQuarantined(root);
    }

    private static void nonceTamperContract(Path root) throws Exception {
        LocalMemoryEvent chat = chat(
            "51000000-0000-4000-8000-000000000001",
            PRIVATE_SCOPE_A,
            "trace-nonce-tamper",
            TIME_ONE,
            1,
            CHAT_PLAINTEXT
        );
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
            store.appendChats(List.of(chat));
        }
        mutateBlob(root.resolve("memory.db"), "chat_records", "nonce", "message_id", chat.eventId());
        expectIntegrityOnOpenOrQuery(root, query(PRIVATE_SCOPE_A, "chat.message", 100, null, null));
        assertQuarantined(root);
    }

    private static void aadMetadataTamperContract(Path root) throws Exception {
        LocalMemoryEvent chat = chat(
            "52000000-0000-4000-8000-000000000001",
            PRIVATE_SCOPE_A,
            "trace-aad-tamper",
            TIME_ONE,
            1,
            CHAT_PLAINTEXT
        );
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
            store.appendChats(List.of(chat));
        }
        try (Connection connection = sqlite(root.resolve("memory.db"));
             PreparedStatement statement = connection.prepareStatement(
                 "UPDATE chat_records SET type = 'legacy.chat_snapshot' WHERE message_id = ?"
             )) {
            statement.setString(1, chat.eventId());
            require(statement.executeUpdate() == 1, "AAD_TAMPER_DID_NOT_CHANGE_ROW");
        }
        expectIntegrityOnOpenOrQuery(root, query(PRIVATE_SCOPE_A, "chat.message", 100, null, null));
        assertQuarantined(root);
    }

    private static void blindTokenTamperContract(Path root) throws Exception {
        LocalMemoryEvent chat = chat(
            "60000000-0000-4000-8000-000000000001",
            PRIVATE_SCOPE_A,
            "trace-token-tamper",
            TIME_ONE,
            1,
            CHAT_PLAINTEXT
        );
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
            store.appendChats(List.of(chat));
        }
        try (Connection connection = sqlite(root.resolve("memory.db"));
             PreparedStatement statement = connection.prepareStatement(
                 "UPDATE chat_search_tokens SET token = ? WHERE message_id = ? AND rowid = "
                     + "(SELECT rowid FROM chat_search_tokens WHERE message_id = ? LIMIT 1)"
             )) {
            byte[] tampered = new byte[32];
            Arrays.fill(tampered, (byte) 0x5A);
            statement.setBytes(1, tampered);
            statement.setString(2, chat.eventId());
            statement.setString(3, chat.eventId());
            require(statement.executeUpdate() == 1, "TOKEN_TAMPER_DID_NOT_CHANGE_ROW");
        }
        expectIntegrityOnOpenOrQuery(root, query(PRIVATE_SCOPE_A, "chat.message", 100, null, null));
        assertQuarantined(root);
    }

    private static void removedTokenTamperContract(Path root) throws Exception {
        LocalMemoryEvent chat = chat(
            "61000000-0000-4000-8000-000000000001",
            PRIVATE_SCOPE_A,
            "trace-token-removal",
            TIME_ONE,
            1,
            "唯一检索词 星海回声"
        );
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
            store.appendChats(List.of(chat));
        }
        try (Connection connection = sqlite(root.resolve("memory.db"));
             PreparedStatement statement = connection.prepareStatement(
                 "DELETE FROM chat_search_tokens WHERE message_id = ?"
             )) {
            statement.setString(1, chat.eventId());
            require(statement.executeUpdate() > 0, "TOKEN_REMOVAL_DID_NOT_CHANGE_ROWS");
        }
        expectIntegrityOnOpenOrQuery(
            root,
            query(PRIVATE_SCOPE_A, "chat.message", 100, null, "唯一检索词")
        );
        assertQuarantined(root);
    }

    private static void tombstoneTamperContract(Path root) throws Exception {
        LocalMemoryEvent chat = chat(
            "62000000-0000-4000-8000-000000000001",
            PRIVATE_SCOPE_A,
            "trace-tombstone-tamper",
            TIME_ONE,
            1,
            "live row must not disappear"
        );
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
            store.appendChats(List.of(chat));
        }
        try (Connection connection = sqlite(root.resolve("memory.db"));
             PreparedStatement statement = connection.prepareStatement(
                 "UPDATE chat_records SET deleted_at = ? WHERE message_id = ?"
             )) {
            statement.setLong(1, Instant.now().toEpochMilli());
            statement.setString(2, chat.eventId());
            require(statement.executeUpdate() == 1, "TOMBSTONE_TAMPER_DID_NOT_CHANGE_ROW");
        }
        expectIntegrityOnOpenOrQuery(root, query(PRIVATE_SCOPE_A, "chat.message", 100, null, null));
        assertQuarantined(root);
    }

    private static void unexpectedSchemaObjectContract(Path root) throws Exception {
        LocalMemoryEvent chat = chat(
            "62500000-0000-4000-8000-000000000001",
            PRIVATE_SCOPE_A,
            "trace-schema-trigger",
            TIME_ONE,
            1,
            "unexpected schema objects must be rejected"
        );
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
            store.appendChats(List.of(chat));
        }
        try (Connection connection = sqlite(root.resolve("memory.db"));
             Statement statement = connection.createStatement()) {
            statement.execute("""
                CREATE TRIGGER destructive_memory_trigger
                AFTER INSERT ON chat_records
                BEGIN
                  DELETE FROM chat_records WHERE message_id <> NEW.message_id;
                END
                """);
        }
        expectIntegrityOnOpenOrQuery(root, query(PRIVATE_SCOPE_A, "chat.message", 100, null, null));
        assertQuarantined(root);
    }

    private static void schemaDefinitionTamperContract(Path root) throws Exception {
        LocalMemoryEvent chat = chat(
            "62700000-0000-4000-8000-000000000001",
            PRIVATE_SCOPE_A,
            "trace-schema-definition",
            TIME_ONE,
            1,
            "schema constraints are part of the authenticated contract"
        );
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
            store.appendChats(List.of(chat));
        }
        try (Connection connection = sqlite(root.resolve("memory.db"));
             Statement statement = connection.createStatement()) {
            statement.execute("ALTER TABLE vault_state RENAME TO vault_state_legacy");
            statement.execute("""
                CREATE TABLE vault_state (
                  singleton INTEGER PRIMARY KEY,
                  schema_version INTEGER NOT NULL,
                  vault_id TEXT NOT NULL,
                  created_at INTEGER NOT NULL
                )
                """);
            statement.execute("INSERT INTO vault_state SELECT * FROM vault_state_legacy");
            statement.execute("DROP TABLE vault_state_legacy");
        }
        expectIntegrityOnOpenOrQuery(root, query(PRIVATE_SCOPE_A, "chat.message", 100, null, null));
        assertQuarantined(root);
    }

    private static void backupAuditContract(Path root) throws Exception {
        LocalMemoryEvent chat = chat(
            "63000000-0000-4000-8000-000000000001",
            PRIVATE_SCOPE_A,
            "trace-backup-audit",
            TIME_ONE,
            1,
            "backup must reject hidden corruption"
        );
        Path backup = root.resolve("backups").resolve("must-not-exist.fememory");
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
            store.appendChats(List.of(chat));
            try (Connection connection = sqlite(root.resolve("memory.db"));
                 PreparedStatement statement = connection.prepareStatement(
                     "DELETE FROM chat_search_tokens WHERE message_id = ?"
                 )) {
                statement.setString(1, chat.eventId());
                require(statement.executeUpdate() > 0, "BACKUP_TAMPER_DID_NOT_CHANGE_ROWS");
            }
            expectCode(() -> store.backup(backup), LocalMemoryException.Code.INTEGRITY);
            require(!Files.exists(backup), "CORRUPT_BACKUP_WAS_PUBLISHED");
            require(store.health().locked(), "CORRUPT_BACKUP_DID_NOT_LOCK_STORE");
        }
        assertQuarantined(root);
    }

    private static void unsupportedNumberContract() {
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("occurredAt", TIME_ONE.toString());
        payload.put("sourceSequence", 1L);
        payload.put("source", "local-ai");
        payload.put("entityId", "fact-number-boundary");
        payload.put("title", "number boundary");
        payload.put("value", new java.math.BigDecimal("0.1234567890123456789"));
        payload.put("timeAccuracy", "exact");
        payload.put("traceId", "trace-number-boundary");
        expectCode(
            () -> new LocalMemoryEvent(
                "64000000-0000-4000-8000-000000000001",
                MemorySanitizer.Stream.KNOWLEDGE,
                PRIVATE_SCOPE_A,
                "user.fact",
                TIME_ONE,
                1L,
                payload
            ),
            LocalMemoryException.Code.EVENT_INVALID
        );
    }

    private static void restoreCrashRecoveryContract(Path root, String crashPoint) throws Exception {
        String oldId = "65000000-0000-4000-8000-000000000001";
        String newId = "65000000-0000-4000-8000-000000000002";
        LocalMemoryEvent oldEvent = chat(
            oldId, PRIVATE_SCOPE_A, "trace-restore-old", TIME_ONE, 1, "old durable memory"
        );
        LocalMemoryEvent newEvent = chat(
            newId, PRIVATE_SCOPE_A, "trace-restore-new", TIME_TWO, 2, "new restored memory"
        );
        Path database = root.resolve("memory.db");
        Path oldSnapshot = root.resolve("old-snapshot.db");
        Path newSnapshot = root.resolve("new-snapshot.db");
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
            store.appendChats(List.of(oldEvent));
        }
        Files.copy(database, oldSnapshot);
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
            store.appendChats(List.of(newEvent));
        }
        Files.copy(database, newSnapshot);

        if (Set.of("after-wal-configure", "after-wal-row-deleted").contains(crashPoint)) {
            try (Connection connection = sqlite(newSnapshot);
                 Statement statement = connection.createStatement()) {
                require(
                    "delete".equalsIgnoreCase(singleText(connection, "PRAGMA journal_mode=DELETE")),
                    "RESTORE_WAL_FIXTURE_NOT_NORMALIZED"
                );
            }
        }

        String restoreId = java.util.UUID.randomUUID().toString();
        String oldSha256 = sha256(oldSnapshot);
        String newSha256 = sha256(newSnapshot);
        String oldLogicalSha256 = logicalSha256(oldSnapshot);
        String newLogicalSha256 = logicalSha256(newSnapshot);
        Path recovery = root.resolve(".memory-restore-recovery-" + restoreId + ".db");
        Path replacement = root.resolve(".memory-restore-" + restoreId + ".db.next");
        Files.copy(oldSnapshot, recovery);
        Files.copy(newSnapshot, replacement);
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root)) {
            writeRestoreIntentFixture(
                root,
                lease,
                restoreId,
                oldSha256,
                newSha256,
                oldLogicalSha256,
                newLogicalSha256
            );
            if (Set.of(
                "after-publish", "after-wal-configure", "after-wal-row-deleted",
                "torn-published", "torn-published-staging"
            ).contains(crashPoint)) {
                Files.copy(newSnapshot, database, StandardCopyOption.REPLACE_EXISTING);
                Files.delete(replacement);
                if (Set.of(
                    "after-publish", "after-wal-configure", "after-wal-row-deleted"
                ).contains(crashPoint)) {
                    writeRestorePublishedFixture(
                        root,
                        lease,
                        restoreId,
                        newSha256,
                        newLogicalSha256
                    );
                } else if ("torn-published".equals(crashPoint)) {
                    Files.write(
                        root.resolve(".memory-restore-published-" + restoreId + ".json"),
                        "{\"restoreId\":".getBytes(StandardCharsets.UTF_8)
                    );
                } else {
                    Files.write(
                        root.resolve(".memory-restore-published-" + restoreId + ".json.next"),
                        "{\"restoreId\":".getBytes(StandardCharsets.UTF_8)
                    );
                }
                if (Set.of("after-wal-configure", "after-wal-row-deleted").contains(crashPoint)) {
                    try (Connection connection = sqlite(database);
                         Statement statement = connection.createStatement()) {
                        require(
                            "wal".equalsIgnoreCase(singleText(connection, "PRAGMA journal_mode=WAL")),
                            "RESTORE_WAL_FIXTURE_NOT_CONFIGURED"
                        );
                        if ("after-wal-row-deleted".equals(crashPoint)) {
                            statement.execute("PRAGMA foreign_keys=ON");
                            try (PreparedStatement delete = connection.prepareStatement(
                                "DELETE FROM chat_records WHERE message_id = ?"
                            )) {
                                delete.setString(1, newId);
                                require(delete.executeUpdate() == 1, "RESTORE_LOGICAL_TAMPER_NOT_APPLIED");
                            }
                        }
                    }
                    require(
                        !newSha256.equals(sha256(database)),
                        "RESTORE_WAL_TRANSITION_DID_NOT_CHANGE_PHYSICAL_HASH"
                    );
                }
            } else {
                Files.copy(oldSnapshot, database, StandardCopyOption.REPLACE_EXISTING);
                if ("missing-live".equals(crashPoint)) Files.delete(database);
            }
        }
        Files.delete(oldSnapshot);
        Files.delete(newSnapshot);

        if ("after-wal-row-deleted".equals(crashPoint)) {
            expectCode(
                () -> {
                    try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
                         LocalMemoryStore ignored = SqliteEncryptedMemoryStore.open(root, lease)) {
                    }
                },
                LocalMemoryException.Code.RESTORE_INVALID
            );
            try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
                 LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
                require(
                    ids(store.queryChats(query(PRIVATE_SCOPE_A, "chat.message", 100, null, null)).records())
                        .equals(Set.of(oldId)),
                    "RESTORE_LOGICAL_TAMPER_DID_NOT_ROLL_BACK"
                );
                assertHealthy(store.health());
            }
        } else {
            try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
                 LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
                Set<String> ids = ids(
                    store.queryChats(query(PRIVATE_SCOPE_A, "chat.message", 100, null, null)).records()
                );
                Set<String> expected = Set.of(
                    "after-publish", "after-wal-configure", "torn-published", "torn-published-staging"
                )
                    .contains(crashPoint)
                    ? Set.of(oldId, newId)
                    : Set.of(oldId);
                require(ids.equals(expected), "RESTORE_CRASH_RECOVERED_WRONG_DATABASE");
                assertHealthy(store.health());
            }
        }
        require(!Files.exists(root.resolve(".memory-restore-intent.json")), "RESTORE_INTENT_NOT_CLEANED");
        require(!Files.exists(recovery), "RESTORE_RECOVERY_NOT_CLEANED");
        require(!Files.exists(replacement), "RESTORE_REPLACEMENT_NOT_CLEANED");
        require(
            !Files.exists(root.resolve(".memory-restore-published-" + restoreId + ".json")),
            "RESTORE_PUBLISHED_MARKER_NOT_CLEANED"
        );
        require(
            !Files.exists(root.resolve(".memory-restore-published-" + restoreId + ".json.next")),
            "RESTORE_PUBLISHED_STAGING_NOT_CLEANED"
        );
    }

    private static void tornRestoreIntentWriteContract(Path root) throws Exception {
        LocalMemoryEvent chat = chat(
            "65500000-0000-4000-8000-000000000001",
            PRIVATE_SCOPE_A,
            "trace-torn-intent-staging",
            TIME_ONE,
            1,
            "an interrupted intent write must not lock a healthy database"
        );
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
            store.appendChats(List.of(chat));
        }
        Path staging = root.resolve(".memory-restore-intent.json.next");
        Files.write(staging, "{\"restoreId\":".getBytes(StandardCharsets.UTF_8));
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
            require(
                ids(store.queryChats(query(PRIVATE_SCOPE_A, "chat.message", 100, null, null)).records())
                    .equals(Set.of(chat.eventId())),
                "TORN_INTENT_STAGING_CHANGED_HEALTHY_DATABASE"
            );
            assertHealthy(store.health());
        }
        require(!Files.exists(staging), "TORN_INTENT_STAGING_NOT_CLEANED");
    }

    private static void writeRestoreIntentFixture(
        Path root,
        MemoryVaultKeyManager.KeyLease lease,
        String restoreId,
        String oldSha256,
        String newSha256,
        String oldLogicalSha256,
        String newLogicalSha256
    ) throws Exception {
        LinkedHashMap<String, Object> unsigned = new LinkedHashMap<>();
        unsigned.put("createdAt", Instant.now().toEpochMilli());
        unsigned.put("newDatabaseLogicalSha256", newLogicalSha256);
        unsigned.put("newDatabaseSha256", newSha256);
        unsigned.put("oldDatabaseLogicalSha256", oldLogicalSha256);
        unsigned.put("oldDatabaseSha256", oldSha256);
        unsigned.put("restoreId", restoreId);
        unsigned.put("schemaVersion", 1L);
        unsigned.put("vaultId", lease.vaultId());
        byte[] key = lease.key();
        byte[] canonical = CanonicalMemoryJson.encode(unsigned);
        byte[] mac = null;
        try (MemoryCrypto crypto = new MemoryCrypto(key)) {
            mac = crypto.backupMac(canonical);
            LinkedHashMap<String, Object> signed = new LinkedHashMap<>(unsigned);
            signed.put("mac", HexFormat.of().formatHex(mac));
            Files.write(root.resolve(".memory-restore-intent.json"), CanonicalMemoryJson.encode(signed));
        } finally {
            Arrays.fill(key, (byte) 0);
            Arrays.fill(canonical, (byte) 0);
            if (mac != null) Arrays.fill(mac, (byte) 0);
        }
    }

    private static void writeRestorePublishedFixture(
        Path root,
        MemoryVaultKeyManager.KeyLease lease,
        String restoreId,
        String newSha256,
        String newLogicalSha256
    ) throws Exception {
        LinkedHashMap<String, Object> unsigned = new LinkedHashMap<>();
        unsigned.put("newDatabaseLogicalSha256", newLogicalSha256);
        unsigned.put("newDatabaseSha256", newSha256);
        unsigned.put("restoreId", restoreId);
        unsigned.put("vaultId", lease.vaultId());
        byte[] key = lease.key();
        byte[] canonical = CanonicalMemoryJson.encode(unsigned);
        byte[] mac = null;
        try (MemoryCrypto crypto = new MemoryCrypto(key)) {
            mac = crypto.backupMac(canonical);
            LinkedHashMap<String, Object> signed = new LinkedHashMap<>(unsigned);
            signed.put("mac", HexFormat.of().formatHex(mac));
            Files.write(
                root.resolve(".memory-restore-published-" + restoreId + ".json"),
                CanonicalMemoryJson.encode(signed)
            );
        } finally {
            Arrays.fill(key, (byte) 0);
            Arrays.fill(canonical, (byte) 0);
            if (mac != null) Arrays.fill(mac, (byte) 0);
        }
    }

    private static void restoreIntentTamperContract(Path root) throws Exception {
        LocalMemoryEvent chat = chat(
            "66000000-0000-4000-8000-000000000001",
            PRIVATE_SCOPE_A,
            "trace-intent-tamper",
            TIME_ONE,
            1,
            "restore intent must be authenticated"
        );
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
            store.appendChats(List.of(chat));
        }
        Path database = root.resolve("memory.db");
        byte[] before = Files.readAllBytes(database);
        Files.write(root.resolve(".memory-restore-intent.json"), "{}".getBytes(StandardCharsets.UTF_8));
        expectCode(
            () -> {
                try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
                     LocalMemoryStore ignored = SqliteEncryptedMemoryStore.open(root, lease)) {
                }
            },
            LocalMemoryException.Code.LOCKED
        );
        require(Arrays.equals(before, Files.readAllBytes(database)), "TAMPERED_INTENT_CHANGED_DATABASE");
        require(!Files.exists(root.resolve("memory.db-wal")), "TAMPERED_INTENT_LEFT_WAL");
        require(!Files.exists(root.resolve("memory.db-shm")), "TAMPERED_INTENT_LEFT_SHM");
    }

    private static void futureSchemaContract(Path root) throws Exception {
        Path database = root.resolve("memory.db");
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore ignored = SqliteEncryptedMemoryStore.open(root, lease)) {
        }
        try (Connection connection = sqlite(database);
             Statement statement = connection.createStatement()) {
            require(statement.executeUpdate("UPDATE vault_state SET schema_version = 999 WHERE singleton = 1") == 1,
                "FUTURE_SCHEMA_SETUP_FAILED");
            statement.execute("PRAGMA user_version=999");
        }
        byte[] before = Files.readAllBytes(database);
        var modifiedBefore = Files.getLastModifiedTime(database);
        expectCode(
            () -> {
                try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
                     LocalMemoryStore ignored = SqliteEncryptedMemoryStore.open(root, lease)) {
                }
            },
            LocalMemoryException.Code.FUTURE_SCHEMA
        );
        require(Arrays.equals(before, Files.readAllBytes(database)), "FUTURE_SCHEMA_DATABASE_BYTES_CHANGED");
        require(modifiedBefore.equals(Files.getLastModifiedTime(database)), "FUTURE_SCHEMA_MTIME_CHANGED");
        require(!Files.exists(root.resolve("memory.db-wal")), "FUTURE_SCHEMA_LEFT_WAL");
        require(!Files.exists(root.resolve("memory.db-shm")), "FUTURE_SCHEMA_LEFT_SHM");
        try (Connection connection = sqlite(database);
             Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery("SELECT schema_version FROM vault_state WHERE singleton = 1")) {
            require(rows.next() && rows.getInt(1) == 999, "FUTURE_SCHEMA_WAS_OVERWRITTEN");
        }
    }

    private static void busyContract(Path root) throws Exception {
        LocalMemoryEvent blockedChat = chat(
            "70000000-0000-4000-8000-000000000001",
            PRIVATE_SCOPE_A,
            "trace-busy-001",
            TIME_ONE,
            1,
            "busy append must not commit"
        );
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease);
             Connection blocker = sqlite(root.resolve("memory.db"));
             Statement lock = blocker.createStatement()) {
            lock.execute("PRAGMA busy_timeout=0");
            lock.execute("BEGIN IMMEDIATE");
            long started = System.nanoTime();
            try {
                expectCode(
                    () -> store.appendChats(List.of(blockedChat)),
                    LocalMemoryException.Code.BUSY
                );
            } finally {
                lock.execute("ROLLBACK");
            }
            long elapsedMillis = (System.nanoTime() - started) / 1_000_000L;
            require(elapsedMillis < 8_000L, "BUSY_FAILURE_WAS_NOT_BOUNDED");
            require(
                store.queryChats(query(PRIVATE_SCOPE_A, "chat.message", 100, null, null)).records().isEmpty(),
                "BUSY_WRITE_PARTIALLY_COMMITTED"
            );
        }
    }

    private static void rollbackFailureContract(Path root) throws Exception {
        LocalMemoryEvent baseline = chat(
            "71000000-0000-4000-8000-000000000001",
            PRIVATE_SCOPE_A,
            "trace-rollback-baseline",
            TIME_ONE,
            1,
            "rollback baseline"
        );
        LocalMemoryEvent firstInFailedBatch = chat(
            "71000000-0000-4000-8000-000000000002",
            PRIVATE_SCOPE_A,
            "trace-rollback-first",
            TIME_TWO,
            2,
            "must be rolled back"
        );
        LocalMemoryEvent conflict = chat(
            baseline.eventId(),
            PRIVATE_SCOPE_A,
            "trace-rollback-baseline",
            TIME_ONE,
            1,
            "conflicting content"
        );
        AtomicBoolean rollbackFailed = new AtomicBoolean();
        AtomicBoolean autoCommitEnabledAfterFailure = new AtomicBoolean();
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
            store.appendChats(List.of(baseline));
            var field = SqliteEncryptedMemoryStore.class.getDeclaredField("connection");
            field.setAccessible(true);
            Connection real = (Connection) field.get(store);
            Connection failing = (Connection) java.lang.reflect.Proxy.newProxyInstance(
                Connection.class.getClassLoader(),
                new Class<?>[]{Connection.class},
                (proxy, method, arguments) -> {
                    if ("rollback".equals(method.getName())) {
                        rollbackFailed.set(true);
                        throw new java.sql.SQLException("INJECTED_ROLLBACK_FAILURE");
                    }
                    if ("setAutoCommit".equals(method.getName())
                        && arguments != null
                        && Boolean.TRUE.equals(arguments[0])
                        && rollbackFailed.get()) {
                        autoCommitEnabledAfterFailure.set(true);
                    }
                    try {
                        return method.invoke(real, arguments);
                    } catch (java.lang.reflect.InvocationTargetException problem) {
                        throw problem.getCause();
                    }
                }
            );
            field.set(store, failing);
            expectCode(
                () -> store.appendBatch(List.of(firstInFailedBatch, conflict)),
                LocalMemoryException.Code.LOCKED
            );
            require(rollbackFailed.get(), "ROLLBACK_FAILURE_NOT_INJECTED");
            require(!autoCommitEnabledAfterFailure.get(), "AUTOCOMMIT_REENABLED_AFTER_ROLLBACK_FAILURE");
            require(store.health().locked(), "ROLLBACK_FAILURE_DID_NOT_LOCK_STORE");
        }
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
             LocalMemoryStore reopened = SqliteEncryptedMemoryStore.open(root, lease)) {
            Set<String> ids = ids(
                reopened.queryChats(query(PRIVATE_SCOPE_A, "chat.message", 100, null, null)).records()
            );
            require(ids.contains(baseline.eventId()), "ROLLBACK_FAILURE_LOST_PRIOR_COMMIT");
            require(!ids.contains(firstInFailedBatch.eventId()), "ROLLBACK_FAILURE_PARTIALLY_COMMITTED_BATCH");
        }
    }

    private static void expectIntegrityOnOpenOrQuery(Path root, LocalMemoryStore.Query query) {
        try (MemoryVaultKeyManager.KeyLease lease = openLease(root)) {
            try (LocalMemoryStore store = SqliteEncryptedMemoryStore.open(root, lease)) {
                expectCode(() -> store.queryChats(query), LocalMemoryException.Code.INTEGRITY);
            } catch (LocalMemoryException failure) {
                require(failure.code() == LocalMemoryException.Code.INTEGRITY, "TAMPER_WRONG_OPEN_ERROR");
                assertRedacted(failure);
            }
        }
    }

    private static void assertSchemaAndPragmas(
        Path database,
        MemoryVaultKeyManager.KeyLease lease
    ) throws Exception {
        require(Files.isRegularFile(database), "DATABASE_NOT_CREATED");
        try (Connection connection = sqlite(database)) {
            require("wal".equalsIgnoreCase(singleText(connection, "PRAGMA journal_mode")), "WAL_NOT_ENABLED");
            require(tableExists(connection, "vault_state"), "VAULT_STATE_TABLE_MISSING");
            require(tableExists(connection, "chat_records"), "CHAT_TABLE_MISSING");
            require(tableExists(connection, "operation_records"), "OPERATION_TABLE_MISSING");
            require(tableExists(connection, "knowledge_records"), "KNOWLEDGE_TABLE_MISSING");
            require(!tableExists(connection, "records"), "GENERIC_RECORDS_TABLE_PRESENT");
            require(!tableExists(connection, "memory_records"), "GENERIC_MEMORY_RECORDS_TABLE_PRESENT");
            require(columns(connection, "chat_records").contains("type"), "CHAT_TYPE_COLUMN_MISSING");
            require(
                columns(connection, "knowledge_records").contains("source_sequence"),
                "KNOWLEDGE_SOURCE_SEQUENCE_COLUMN_MISSING"
            );
            try (Statement statement = connection.createStatement();
                 ResultSet rows = statement.executeQuery(
                     "SELECT schema_version, vault_id, created_at FROM vault_state WHERE singleton = 1"
                 )) {
                require(rows.next(), "VAULT_STATE_ROW_MISSING");
                require(rows.getInt(1) == 1, "FRESH_SCHEMA_VERSION_WRONG");
                require(lease.vaultId().equals(rows.getString(2)), "VAULT_STATE_ID_MISMATCH");
                require(lease.createdAt().toEpochMilli() == rows.getLong(3), "VAULT_STATE_CREATED_AT_MISMATCH");
                require(!rows.next(), "VAULT_STATE_HAS_MULTIPLE_ROWS");
            }
        }
    }

    private static void assertPhysicalSeparation(
        Path database,
        MemoryVaultKeyManager.KeyLease lease,
        LocalMemoryEvent chat,
        LocalMemoryEvent operation,
        LocalMemoryEvent knowledge
    ) throws Exception {
        try (Connection connection = sqlite(database)) {
            require(rowExists(connection, "chat_records", "message_id", chat.eventId()), "CHAT_NOT_IN_CHAT_TABLE");
            require(!rowExists(connection, "operation_records", "event_id", chat.eventId()), "CHAT_IN_OPERATION_TABLE");
            require(!rowExists(connection, "knowledge_records", "event_id", chat.eventId()), "CHAT_IN_KNOWLEDGE_TABLE");
            require(rowExists(connection, "operation_records", "event_id", operation.eventId()), "OPERATION_NOT_IN_OPERATION_TABLE");
            require(!rowExists(connection, "chat_records", "message_id", operation.eventId()), "OPERATION_IN_CHAT_TABLE");
            require(!rowExists(connection, "knowledge_records", "event_id", operation.eventId()), "OPERATION_IN_KNOWLEDGE_TABLE");
            require(rowExists(connection, "knowledge_records", "event_id", knowledge.eventId()), "KNOWLEDGE_NOT_IN_KNOWLEDGE_TABLE");
            require(!rowExists(connection, "chat_records", "message_id", knowledge.eventId()), "KNOWLEDGE_IN_CHAT_TABLE");
            require(!rowExists(connection, "operation_records", "event_id", knowledge.eventId()), "KNOWLEDGE_IN_OPERATION_TABLE");

            try (PreparedStatement statement = connection.prepareStatement(
                "SELECT type FROM chat_records WHERE message_id = ?"
            )) {
                statement.setString(1, chat.eventId());
                try (ResultSet rows = statement.executeQuery()) {
                    require(rows.next() && chat.type().equals(rows.getString(1)), "CHAT_PUBLIC_TYPE_WRONG");
                }
            }
            try (PreparedStatement statement = connection.prepareStatement(
                "SELECT source_sequence FROM knowledge_records WHERE event_id = ?"
            )) {
                statement.setString(1, knowledge.eventId());
                try (ResultSet rows = statement.executeQuery()) {
                    require(
                        rows.next() && rows.getLong(1) == knowledge.sourceSequence(),
                        "KNOWLEDGE_PUBLIC_SEQUENCE_WRONG"
                    );
                }
            }
            try (PreparedStatement statement = connection.prepareStatement(
                "SELECT scope_hash FROM chat_records WHERE message_id = ?"
            )) {
                statement.setString(1, chat.eventId());
                try (ResultSet rows = statement.executeQuery()) {
                    require(rows.next(), "CHAT_SCOPE_HASH_MISSING");
                    String scopeHash = rows.getString(1);
                    require(!PRIVATE_SCOPE_A.equals(scopeHash), "RAW_SCOPE_STORED_IN_DATABASE");
                    require(scopeHash.matches("[0-9a-f]{64}"), "SCOPE_HASH_FORMAT_INVALID");
                }
            }
            require(lease.createdAt().toEpochMilli() == singleLong(
                connection,
                "SELECT created_at FROM vault_state WHERE singleton = 1"
            ), "VAULT_CREATED_AT_CHANGED_AFTER_WRITES");
        }
    }

    private static void assertTombstoneAndTokenRemoval(Path database, String eventId) throws Exception {
        try (Connection connection = sqlite(database);
             PreparedStatement record = connection.prepareStatement(
                 "SELECT deleted_at FROM chat_records WHERE message_id = ?"
             );
             PreparedStatement tokens = connection.prepareStatement(
                 "SELECT COUNT(*) FROM chat_search_tokens WHERE message_id = ?"
             )) {
            record.setString(1, eventId);
            try (ResultSet rows = record.executeQuery()) {
                require(rows.next() && rows.getObject(1) != null, "FORGET_TOMBSTONE_MISSING");
            }
            tokens.setString(1, eventId);
            try (ResultSet rows = tokens.executeQuery()) {
                require(rows.next() && rows.getLong(1) == 0, "FORGET_SEARCH_TOKENS_REMAINED");
            }
        }
    }

    private static void assertHealthy(LocalMemoryStore.Health health) {
        require(health.available(), "STORE_HEALTH_UNAVAILABLE");
        require(!health.locked(), "STORE_HEALTH_LOCKED");
        require(health.schemaVersion() == 1, "STORE_HEALTH_SCHEMA_WRONG");
        require("LOCAL_MEMORY_OK".equals(health.code()), "STORE_HEALTH_CODE_WRONG");
    }

    private static void assertOwnerOnly(Path root) throws Exception {
        require(MemoryFileSecurity.isOwnerOnly(root, true), "STORE_DIRECTORY_NOT_OWNER_ONLY");
        for (String name : List.of(
            "vault-meta.json",
            "vault-key.dpapi",
            ".vault.lock",
            "memory.db",
            "memory.db-wal",
            "memory.db-shm"
        )) {
            Path path = root.resolve(name);
            if (Files.exists(path)) {
                require(MemoryFileSecurity.isOwnerOnly(path, false), "STORE_ARTIFACT_NOT_OWNER_ONLY");
            }
        }
    }

    private static void assertQuarantined(Path root) throws Exception {
        Path lock = root.resolve(".memory-quarantine-lock.json");
        Path quarantine = root.resolve("quarantine");
        require(Files.isRegularFile(lock), "QUARANTINE_LOCK_MISSING");
        require(MemoryFileSecurity.isOwnerOnly(lock, false), "QUARANTINE_LOCK_NOT_OWNER_ONLY");
        require(Files.isDirectory(quarantine), "QUARANTINE_DIRECTORY_MISSING");
        require(!Files.exists(root.resolve("memory.db")), "CORRUPT_DATABASE_NOT_QUARANTINED");
        require(!Files.exists(root.resolve("memory.db-wal")), "CORRUPT_WAL_NOT_QUARANTINED");
        require(!Files.exists(root.resolve("memory.db-shm")), "CORRUPT_SHM_NOT_QUARANTINED");
        try (var paths = Files.walk(quarantine)) {
            List<Path> files = paths.filter(Files::isRegularFile).toList();
            require(files.stream().anyMatch(path -> path.getFileName().toString().equals("manifest.json")),
                "QUARANTINE_MANIFEST_MISSING");
            require(files.stream().anyMatch(path -> path.getFileName().toString().equals("complete.json")),
                "QUARANTINE_COMPLETION_MISSING");
            require(files.stream().anyMatch(path -> path.getFileName().toString().equals("memory.db")),
                "QUARANTINED_DATABASE_EVIDENCE_MISSING");
        }
        expectCode(
            () -> {
                try (MemoryVaultKeyManager.KeyLease lease = openLease(root);
                     LocalMemoryStore ignored = SqliteEncryptedMemoryStore.open(root, lease)) {
                }
            },
            LocalMemoryException.Code.LOCKED
        );
        require(!Files.exists(root.resolve("memory.db")), "LOCKED_VAULT_RECREATED_DATABASE");
    }

    private static void scanPersistentArtifacts(Path root) throws Exception {
        List<byte[]> markers = new ArrayList<>();
        for (String value : List.of(
            CHAT_PLAINTEXT,
            OPERATION_PLAINTEXT,
            KNOWLEDGE_PLAINTEXT,
            "音乐区密语",
            "星海回声",
            PRIVATE_SCOPE_A,
            PRIVATE_SCOPE_B
        )) {
            markers.add(value.getBytes(StandardCharsets.UTF_8));
            markers.add(value.getBytes(StandardCharsets.UTF_16LE));
        }
        if (!Files.exists(root)) return;
        try (var paths = Files.walk(root)) {
            for (Path path : paths.filter(Files::isRegularFile).toList()) {
                String name = path.getFileName().toString().toLowerCase();
                if (!(name.equals("memory.db")
                    || name.equals("memory.db-wal")
                    || name.equals("memory.db-shm")
                    || name.endsWith(".fememory")
                    || name.endsWith(".next")
                    || name.endsWith(".tmp")
                    || name.contains("restore")
                    || name.contains("backup"))) {
                    continue;
                }
                byte[] bytes = Files.readAllBytes(path);
                for (byte[] marker : markers) {
                    require(!contains(bytes, marker), "PLAINTEXT_MARKER_PERSISTED");
                }
            }
        }
    }

    private static LocalMemoryEvent chat(
        String id,
        String scope,
        String trace,
        Instant occurredAt,
        long sequence,
        String text
    ) {
        return chatWithMessageId(id, id, scope, trace, occurredAt, sequence, text);
    }

    private static LocalMemoryEvent chatWithMessageId(
        String eventId,
        String messageId,
        String scope,
        String trace,
        Instant occurredAt,
        long sequence,
        String text
    ) {
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("messageId", messageId);
        payload.put("conversationId", "conversation-main-001");
        payload.put("traceId", trace);
        payload.put("turnId", "turn-" + sequence);
        payload.put("role", "user");
        payload.put("text", text);
        payload.put("source", "desktop-client");
        payload.put("modelOrigin", "local-configured-model");
        payload.put("timeAccuracy", "exact");
        payload.put("occurredAt", occurredAt.toString());
        payload.put("sourceSequence", sequence);
        return new LocalMemoryEvent(
            eventId,
            MemorySanitizer.Stream.CHAT,
            scope,
            "chat.message",
            occurredAt,
            sequence,
            payload
        );
    }

    private static LocalMemoryEvent operation(
        String eventId,
        String scope,
        String trace,
        String causedByMessageId,
        Instant occurredAt,
        long sequence
    ) {
        LinkedHashMap<String, Object> receipt = new LinkedHashMap<>();
        receipt.put("receiptId", "receipt-main-001");
        receipt.put("summary", OPERATION_PLAINTEXT);
        receipt.put("undoable", true);
        LinkedHashMap<String, Object> undo = new LinkedHashMap<>();
        undo.put("receiptId", "receipt-main-001");
        undo.put("status", "available");
        LinkedHashMap<String, Object> arguments = new LinkedHashMap<>();
        arguments.put("presetId", "preset-main-001");
        arguments.put("gain", 1);

        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("operationId", "operation-main-001");
        payload.put("traceId", trace);
        payload.put("turnId", "turn-" + sequence);
        payload.put("causedByMessageId", causedByMessageId);
        payload.put("actor", "local-ai");
        payload.put("modelOrigin", "local-configured-model");
        payload.put("phase", "succeeded");
        payload.put("status", "succeeded");
        payload.put("commandId", "scene.apply");
        payload.put("commandManifestRevision", "sha256:manifest-v1");
        payload.put("arguments", arguments);
        payload.put("outcome", Map.of("applied", true));
        payload.put("receipt", receipt);
        payload.put("undo", undo);
        payload.put("occurredAt", occurredAt.toString());
        payload.put("sourceSequence", sequence);
        return new LocalMemoryEvent(
            eventId,
            MemorySanitizer.Stream.OPERATION,
            scope,
            "command.succeeded",
            occurredAt,
            sequence,
            payload
        );
    }

    private static LocalMemoryEvent knowledge(
        String eventId,
        String scope,
        Instant occurredAt,
        long sequence
    ) {
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("occurredAt", occurredAt.toString());
        payload.put("sourceSequence", sequence);
        payload.put("source", "music-provider");
        payload.put("entityId", "playlist-main-001");
        payload.put("title", KNOWLEDGE_PLAINTEXT);
        payload.put("value", List.of(
            Map.of("songId", "song-main-001", "title", "Song Alpha"),
            Map.of("songId", "song-main-002", "title", "Song Beta")
        ));
        payload.put("timeAccuracy", "exact");
        payload.put("traceId", "trace-knowledge-001");
        return new LocalMemoryEvent(
            eventId,
            MemorySanitizer.Stream.KNOWLEDGE,
            scope,
            "library.playlist_snapshot",
            occurredAt,
            sequence,
            payload
        );
    }

    private static MemoryVaultKeyManager.KeyLease openLease(Path root) {
        return new MemoryVaultKeyManager(root, new DeterministicProtector(), new SecureRandom()).openOrCreate();
    }

    private static LocalMemoryStore.Query query(
        String scope,
        String type,
        int limit,
        LocalMemoryStore.Cursor before,
        String text
    ) {
        return new LocalMemoryStore.Query(scope, Set.of(type), limit, before, text);
    }

    private static Connection sqlite(Path database) throws Exception {
        return DriverManager.getConnection("jdbc:sqlite:" + database.toAbsolutePath().normalize());
    }

    private static boolean tableExists(Connection connection, String name) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
        )) {
            statement.setString(1, name);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next();
            }
        }
    }

    private static Set<String> columns(Connection connection, String table) throws Exception {
        LinkedHashSet<String> columns = new LinkedHashSet<>();
        try (Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery("PRAGMA table_info(" + table + ")")) {
            while (rows.next()) columns.add(rows.getString("name"));
        }
        return columns;
    }

    private static boolean rowExists(
        Connection connection,
        String table,
        String idColumn,
        String id
    ) throws Exception {
        try (PreparedStatement statement = connection.prepareStatement(
            "SELECT 1 FROM " + table + " WHERE " + idColumn + " = ?"
        )) {
            statement.setString(1, id);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next();
            }
        }
    }

    private static String singleText(Connection connection, String sql) throws Exception {
        try (Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery(sql)) {
            require(rows.next(), "EXPECTED_SQL_ROW_MISSING");
            return rows.getString(1);
        }
    }

    private static long singleLong(Connection connection, String sql) throws Exception {
        try (Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery(sql)) {
            require(rows.next(), "EXPECTED_SQL_ROW_MISSING");
            return rows.getLong(1);
        }
    }

    private static void mutateBlob(
        Path database,
        String table,
        String blobColumn,
        String idColumn,
        String id
    ) throws Exception {
        byte[] bytes;
        try (Connection connection = sqlite(database);
             PreparedStatement read = connection.prepareStatement(
                 "SELECT " + blobColumn + " FROM " + table + " WHERE " + idColumn + " = ?"
             )) {
            read.setString(1, id);
            try (ResultSet rows = read.executeQuery()) {
                require(rows.next(), "TAMPER_TARGET_MISSING");
                bytes = rows.getBytes(1);
            }
            require(bytes != null && bytes.length > 0, "TAMPER_TARGET_EMPTY");
            bytes[bytes.length / 2] ^= 0x01;
            try (PreparedStatement update = connection.prepareStatement(
                "UPDATE " + table + " SET " + blobColumn + " = ? WHERE " + idColumn + " = ?"
            )) {
                update.setBytes(1, bytes);
                update.setString(2, id);
                require(update.executeUpdate() == 1, "TAMPER_UPDATE_FAILED");
            }
        }
    }

    private static String sha256(Path path) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path)));
    }

    private static String logicalSha256(Path database) throws Exception {
        try (Connection connection = sqlite(database)) {
            return SqliteEncryptedMemoryStore.logicalDatabaseSha256(connection);
        }
    }

    private static LocalMemoryStore.AppendResult only(List<LocalMemoryStore.AppendResult> values) {
        require(values.size() == 1, "EXPECTED_ONE_APPEND_RESULT");
        return values.get(0);
    }

    private static LocalMemoryStore.StoredEvent onlyStored(LocalMemoryStore.Page page) {
        require(page.records().size() == 1, "EXPECTED_ONE_STORED_EVENT");
        return page.records().get(0);
    }

    private static LocalMemoryStore.StoredEvent findById(LocalMemoryStore.Page page, String id) {
        return page.records().stream()
            .filter(record -> id.equals(record.event().eventId()))
            .findFirst()
            .orElseThrow(() -> new IllegalStateException("EXPECTED_RECORD_MISSING"));
    }

    private static void assertStored(LocalMemoryStore.StoredEvent stored, LocalMemoryEvent expected) {
        LocalMemoryEvent actual = stored.event();
        require(expected.eventId().equals(actual.eventId()), "STORED_EVENT_ID_CHANGED");
        require(expected.stream() == actual.stream(), "STORED_STREAM_CHANGED");
        require(expected.scope().equals(actual.scope()), "STORED_SCOPE_CHANGED");
        require(expected.type().equals(actual.type()), "STORED_TYPE_CHANGED");
        require(equals(expected.occurredAt(), actual.occurredAt()), "STORED_OCCURRED_AT_CHANGED");
        require(expected.sourceSequence() == actual.sourceSequence(), "STORED_SEQUENCE_CHANGED");
        require(expected.payload().equals(actual.payload()), "STORED_PAYLOAD_CHANGED");
        require(stored.recordedAt() != null, "STORED_RECORDED_AT_MISSING");
    }

    private static List<String> eventIds(List<LocalMemoryStore.StoredEvent> records) {
        return records.stream().map(record -> record.event().eventId()).toList();
    }

    private static Set<String> ids(List<LocalMemoryStore.StoredEvent> records) {
        LinkedHashSet<String> values = new LinkedHashSet<>();
        for (LocalMemoryStore.StoredEvent record : records) values.add(record.event().eventId());
        return values;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {
        require(value instanceof Map<?, ?>, "EXPECTED_MAP_VALUE");
        return (Map<String, Object>) value;
    }

    private static boolean equals(Object left, Object right) {
        return left == null ? right == null : left.equals(right);
    }

    private static boolean contains(byte[] haystack, byte[] needle) {
        if (needle.length == 0) return true;
        outer:
        for (int start = 0; start + needle.length <= haystack.length; start++) {
            for (int index = 0; index < needle.length; index++) {
                if (haystack[start + index] != needle[index]) continue outer;
            }
            return true;
        }
        return false;
    }

    private static void expectCode(ThrowingCall call, LocalMemoryException.Code expected) {
        expectAnyCode(call, Set.of(expected));
    }

    private static void expectAnyCode(
        ThrowingCall call,
        Set<LocalMemoryException.Code> expected
    ) {
        try {
            call.run();
            throw new IllegalStateException("EXPECTED_FAILURE_NOT_THROWN");
        } catch (LocalMemoryException failure) {
            require(expected.contains(failure.code()), "UNEXPECTED_LOCAL_MEMORY_ERROR_CODE");
            assertRedacted(failure);
        } catch (RuntimeException failure) {
            throw failure;
        } catch (Exception failure) {
            throw new IllegalStateException("UNEXPECTED_CHECKED_EXCEPTION");
        }
    }

    private static void assertRedacted(LocalMemoryException failure) {
        require(failure.getMessage().equals(failure.code().value()), "ERROR_MESSAGE_NOT_STABLE_CODE");
        String message = String.valueOf(failure.getMessage());
        require(!message.contains("FE_STORE_"), "ERROR_LEAKED_PLAINTEXT");
        require(!message.contains("jdbc:"), "ERROR_LEAKED_JDBC_DETAILS");
        require(!message.contains("memory.db"), "ERROR_LEAKED_PATH");
    }

    private static void require(boolean condition, String code) {
        if (!condition) throw new IllegalStateException(code);
    }

    @FunctionalInterface
    private interface ThrowingCall {
        void run() throws Exception;
    }

    private static final class DeterministicProtector implements KeyProtector {
        private static final byte[] AAD = "FE Monster stateless test protector v1"
            .getBytes(StandardCharsets.UTF_8);
        private static final byte[] NONCE = {
            0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x17, 0x28, 0x39, 0x4A, 0x5B, 0x6C
        };

        @Override
        public byte[] protect(byte[] plaintext, byte[] entropy) {
            return crypt(Cipher.ENCRYPT_MODE, plaintext, entropy);
        }

        @Override
        public byte[] unprotect(byte[] protectedBytes, byte[] entropy) {
            return crypt(Cipher.DECRYPT_MODE, protectedBytes, entropy);
        }

        private static byte[] crypt(int mode, byte[] value, byte[] entropy) {
            byte[] key = digest(entropy);
            byte[] input = value == null ? null : value.clone();
            try {
                if (input == null || input.length == 0) throw new GeneralSecurityException();
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(mode, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, NONCE));
                cipher.updateAAD(AAD);
                return cipher.doFinal(input);
            } catch (GeneralSecurityException failure) {
                throw new IllegalStateException("TEST_KEY_PROTECTOR_FAILED");
            } finally {
                Arrays.fill(key, (byte) 0);
                if (input != null) Arrays.fill(input, (byte) 0);
            }
        }

        private static byte[] digest(byte[] entropy) {
            try {
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                digest.update("FE Monster test protector key v1".getBytes(StandardCharsets.UTF_8));
                digest.update(entropy);
                return digest.digest();
            } catch (GeneralSecurityException failure) {
                throw new IllegalStateException("TEST_KEY_PROTECTOR_FAILED");
            }
        }
    }
}
