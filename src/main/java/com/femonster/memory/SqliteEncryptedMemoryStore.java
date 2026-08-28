package com.femonster.memory;

import com.femonster.json.SimpleJson;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

/**
 * SQLite-backed local-memory vault. Sensitive record bodies and searchable text
 * are encrypted or blind-indexed before they reach SQLite.
 */
public final class SqliteEncryptedMemoryStore implements LocalMemoryStore {
    private static final int SCHEMA_VERSION = 1;
    private static final int AAD_VERSION = 1;
    private static final int MAX_BATCH = 100;
    private static final int MAX_RESULTS = 100;
    private static final int MAX_BACKUP_BYTES = 64 * 1024 * 1024;
    private static final int MAX_BACKUP_MANIFEST_BYTES = 16 * 1024;
    private static final int BACKUP_FORMAT_VERSION = 1;
    private static final int BACKUP_MAC_BYTES = 32;
    private static final int MAX_SCOPE_BYTES = 1_024;
    private static final int MAX_IDENTIFIER_BYTES = 512;
    private static final long BUSY_TIMEOUT_MILLIS = 5_000L;
    private static final byte[] BACKUP_MAGIC = {'F', 'E', 'M', 'E', 'M', '0', '0', '1'};
    private static final String RESTORE_UPLOAD_FILE_NAME = ".memory-restore-upload.fememory";
    private static final String RESTORE_INTENT_FILE_NAME = ".memory-restore-intent.json";
    private static final String QUARANTINE_LOCK_FILE_NAME = ".memory-quarantine-lock.json";
    private static final Pattern BACKUP_FILE_NAME = Pattern.compile(
        "[A-Za-z0-9][A-Za-z0-9._-]{0,120}\\.fememory"
    );

    private static final String CREATE_SCHEMA = """
        CREATE TABLE vault_state (
          singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
          schema_version INTEGER NOT NULL,
          vault_id TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE chat_records (
          message_id TEXT PRIMARY KEY,
          scope_hash TEXT NOT NULL,
          conversation_token BLOB NOT NULL,
          type TEXT NOT NULL,
          trace_id TEXT NOT NULL,
          turn_id TEXT,
          occurred_at INTEGER,
          recorded_at INTEGER NOT NULL,
          source_sequence INTEGER NOT NULL,
          nonce BLOB NOT NULL,
          ciphertext BLOB NOT NULL,
          aad_version INTEGER NOT NULL,
          deleted_at INTEGER
        );
        CREATE INDEX chat_records_scope_time
          ON chat_records(scope_hash, occurred_at DESC, recorded_at DESC, source_sequence DESC, message_id DESC);
        CREATE INDEX chat_records_scope_type
          ON chat_records(scope_hash, type, occurred_at DESC, message_id DESC);
        CREATE INDEX chat_records_trace
          ON chat_records(scope_hash, trace_id, turn_id);
        CREATE TABLE chat_search_tokens (
          message_id TEXT NOT NULL REFERENCES chat_records(message_id) ON DELETE CASCADE,
          token BLOB NOT NULL,
          PRIMARY KEY(message_id, token)
        );
        CREATE INDEX chat_search_lookup ON chat_search_tokens(token, message_id);
        CREATE TABLE operation_records (
          event_id TEXT PRIMARY KEY,
          operation_id TEXT NOT NULL,
          scope_hash TEXT NOT NULL,
          trace_id TEXT NOT NULL,
          turn_id TEXT,
          caused_by_message_id TEXT,
          type TEXT NOT NULL,
          phase TEXT NOT NULL,
          actor TEXT NOT NULL,
          occurred_at INTEGER NOT NULL,
          recorded_at INTEGER NOT NULL,
          source_sequence INTEGER NOT NULL,
          nonce BLOB NOT NULL,
          ciphertext BLOB NOT NULL,
          aad_version INTEGER NOT NULL,
          deleted_at INTEGER
        );
        CREATE INDEX operation_records_scope_time
          ON operation_records(scope_hash, occurred_at DESC, recorded_at DESC, source_sequence DESC, event_id DESC);
        CREATE INDEX operation_records_trace
          ON operation_records(scope_hash, trace_id, operation_id, occurred_at);
        CREATE INDEX operation_records_operation
          ON operation_records(scope_hash, operation_id, occurred_at DESC, event_id DESC);
        CREATE TABLE operation_search_tokens (
          event_id TEXT NOT NULL REFERENCES operation_records(event_id) ON DELETE CASCADE,
          token BLOB NOT NULL,
          PRIMARY KEY(event_id, token)
        );
        CREATE INDEX operation_search_lookup ON operation_search_tokens(token, event_id);
        CREATE TABLE knowledge_records (
          event_id TEXT PRIMARY KEY,
          scope_hash TEXT NOT NULL,
          type TEXT NOT NULL,
          occurred_at INTEGER,
          recorded_at INTEGER NOT NULL,
          source_sequence INTEGER NOT NULL,
          nonce BLOB NOT NULL,
          ciphertext BLOB NOT NULL,
          aad_version INTEGER NOT NULL,
          deleted_at INTEGER
        );
        CREATE INDEX knowledge_records_scope_time
          ON knowledge_records(scope_hash, type, occurred_at DESC, recorded_at DESC, source_sequence DESC, event_id DESC);
        CREATE TABLE knowledge_search_tokens (
          event_id TEXT NOT NULL REFERENCES knowledge_records(event_id) ON DELETE CASCADE,
          token BLOB NOT NULL,
          PRIMARY KEY(event_id, token)
        );
        CREATE INDEX knowledge_search_lookup ON knowledge_search_tokens(token, event_id);
        """;
    private static final Pattern CREATE_SCHEMA_OBJECT = Pattern.compile(
        "^create\\s+(table|index)\\s+([a-z0-9_]+)\\b",
        Pattern.CASE_INSENSITIVE
    );
    private static final Map<String, String> EXPECTED_SCHEMA_SQL = expectedSchemaSql();

    private static final Map<String, List<ColumnSpec>> EXPECTED_COLUMNS = Map.of(
        "vault_state", List.of(
            new ColumnSpec("singleton", "INTEGER", false, true),
            new ColumnSpec("schema_version", "INTEGER", true, false),
            new ColumnSpec("vault_id", "TEXT", true, false),
            new ColumnSpec("created_at", "INTEGER", true, false)
        ),
        "chat_records", List.of(
            new ColumnSpec("message_id", "TEXT", false, true),
            new ColumnSpec("scope_hash", "TEXT", true, false),
            new ColumnSpec("conversation_token", "BLOB", true, false),
            new ColumnSpec("type", "TEXT", true, false),
            new ColumnSpec("trace_id", "TEXT", true, false),
            new ColumnSpec("turn_id", "TEXT", false, false),
            new ColumnSpec("occurred_at", "INTEGER", false, false),
            new ColumnSpec("recorded_at", "INTEGER", true, false),
            new ColumnSpec("source_sequence", "INTEGER", true, false),
            new ColumnSpec("nonce", "BLOB", true, false),
            new ColumnSpec("ciphertext", "BLOB", true, false),
            new ColumnSpec("aad_version", "INTEGER", true, false),
            new ColumnSpec("deleted_at", "INTEGER", false, false)
        ),
        "chat_search_tokens", List.of(
            new ColumnSpec("message_id", "TEXT", true, true),
            new ColumnSpec("token", "BLOB", true, true)
        ),
        "operation_records", List.of(
            new ColumnSpec("event_id", "TEXT", false, true),
            new ColumnSpec("operation_id", "TEXT", true, false),
            new ColumnSpec("scope_hash", "TEXT", true, false),
            new ColumnSpec("trace_id", "TEXT", true, false),
            new ColumnSpec("turn_id", "TEXT", false, false),
            new ColumnSpec("caused_by_message_id", "TEXT", false, false),
            new ColumnSpec("type", "TEXT", true, false),
            new ColumnSpec("phase", "TEXT", true, false),
            new ColumnSpec("actor", "TEXT", true, false),
            new ColumnSpec("occurred_at", "INTEGER", true, false),
            new ColumnSpec("recorded_at", "INTEGER", true, false),
            new ColumnSpec("source_sequence", "INTEGER", true, false),
            new ColumnSpec("nonce", "BLOB", true, false),
            new ColumnSpec("ciphertext", "BLOB", true, false),
            new ColumnSpec("aad_version", "INTEGER", true, false),
            new ColumnSpec("deleted_at", "INTEGER", false, false)
        ),
        "operation_search_tokens", List.of(
            new ColumnSpec("event_id", "TEXT", true, true),
            new ColumnSpec("token", "BLOB", true, true)
        ),
        "knowledge_records", List.of(
            new ColumnSpec("event_id", "TEXT", false, true),
            new ColumnSpec("scope_hash", "TEXT", true, false),
            new ColumnSpec("type", "TEXT", true, false),
            new ColumnSpec("occurred_at", "INTEGER", false, false),
            new ColumnSpec("recorded_at", "INTEGER", true, false),
            new ColumnSpec("source_sequence", "INTEGER", true, false),
            new ColumnSpec("nonce", "BLOB", true, false),
            new ColumnSpec("ciphertext", "BLOB", true, false),
            new ColumnSpec("aad_version", "INTEGER", true, false),
            new ColumnSpec("deleted_at", "INTEGER", false, false)
        ),
        "knowledge_search_tokens", List.of(
            new ColumnSpec("event_id", "TEXT", true, true),
            new ColumnSpec("token", "BLOB", true, true)
        )
    );

    private static final Set<String> EXPECTED_INDEXES = Set.of(
        "chat_records_scope_time",
        "chat_records_scope_type",
        "chat_records_trace",
        "chat_search_lookup",
        "operation_records_scope_time",
        "operation_records_trace",
        "operation_records_operation",
        "operation_search_lookup",
        "knowledge_records_scope_time",
        "knowledge_search_lookup"
    );
    private static final Map<String, List<IndexColumnSpec>> EXPECTED_INDEX_COLUMNS = Map.ofEntries(
        Map.entry("chat_records_scope_time", List.of(
            new IndexColumnSpec("scope_hash", false), new IndexColumnSpec("occurred_at", true),
            new IndexColumnSpec("recorded_at", true), new IndexColumnSpec("source_sequence", true),
            new IndexColumnSpec("message_id", true)
        )),
        Map.entry("chat_records_scope_type", List.of(
            new IndexColumnSpec("scope_hash", false), new IndexColumnSpec("type", false),
            new IndexColumnSpec("occurred_at", true), new IndexColumnSpec("message_id", true)
        )),
        Map.entry("chat_records_trace", List.of(
            new IndexColumnSpec("scope_hash", false), new IndexColumnSpec("trace_id", false),
            new IndexColumnSpec("turn_id", false)
        )),
        Map.entry("chat_search_lookup", List.of(
            new IndexColumnSpec("token", false), new IndexColumnSpec("message_id", false)
        )),
        Map.entry("operation_records_scope_time", List.of(
            new IndexColumnSpec("scope_hash", false), new IndexColumnSpec("occurred_at", true),
            new IndexColumnSpec("recorded_at", true), new IndexColumnSpec("source_sequence", true),
            new IndexColumnSpec("event_id", true)
        )),
        Map.entry("operation_records_trace", List.of(
            new IndexColumnSpec("scope_hash", false), new IndexColumnSpec("trace_id", false),
            new IndexColumnSpec("operation_id", false), new IndexColumnSpec("occurred_at", false)
        )),
        Map.entry("operation_records_operation", List.of(
            new IndexColumnSpec("scope_hash", false), new IndexColumnSpec("operation_id", false),
            new IndexColumnSpec("occurred_at", true), new IndexColumnSpec("event_id", true)
        )),
        Map.entry("operation_search_lookup", List.of(
            new IndexColumnSpec("token", false), new IndexColumnSpec("event_id", false)
        )),
        Map.entry("knowledge_records_scope_time", List.of(
            new IndexColumnSpec("scope_hash", false), new IndexColumnSpec("type", false),
            new IndexColumnSpec("occurred_at", true), new IndexColumnSpec("recorded_at", true),
            new IndexColumnSpec("source_sequence", true), new IndexColumnSpec("event_id", true)
        )),
        Map.entry("knowledge_search_lookup", List.of(
            new IndexColumnSpec("token", false), new IndexColumnSpec("event_id", false)
        ))
    );
    private static final List<LogicalTable> LOGICAL_TABLES = List.of(
        new LogicalTable(
            "vault_state",
            "SELECT singleton, schema_version, vault_id, created_at FROM vault_state ORDER BY singleton"
        ),
        new LogicalTable(
            "chat_records",
            "SELECT message_id, scope_hash, conversation_token, type, trace_id, turn_id, occurred_at, "
                + "recorded_at, source_sequence, nonce, ciphertext, aad_version, deleted_at "
                + "FROM chat_records ORDER BY message_id"
        ),
        new LogicalTable(
            "chat_search_tokens",
            "SELECT message_id, token FROM chat_search_tokens ORDER BY message_id, token"
        ),
        new LogicalTable(
            "operation_records",
            "SELECT event_id, operation_id, scope_hash, trace_id, turn_id, caused_by_message_id, type, "
                + "phase, actor, occurred_at, recorded_at, source_sequence, nonce, ciphertext, aad_version, "
                + "deleted_at FROM operation_records ORDER BY event_id"
        ),
        new LogicalTable(
            "operation_search_tokens",
            "SELECT event_id, token FROM operation_search_tokens ORDER BY event_id, token"
        ),
        new LogicalTable(
            "knowledge_records",
            "SELECT event_id, scope_hash, type, occurred_at, recorded_at, source_sequence, nonce, ciphertext, "
                + "aad_version, deleted_at FROM knowledge_records ORDER BY event_id"
        ),
        new LogicalTable(
            "knowledge_search_tokens",
            "SELECT event_id, token FROM knowledge_search_tokens ORDER BY event_id, token"
        )
    );

    private final Path directory;
    private final Path databasePath;
    private final String vaultId;
    private final long vaultCreatedAt;
    private final MemoryCrypto crypto;
    private final ExecutorService executor;
    private final AtomicBoolean closeStarted = new AtomicBoolean();
    private final AtomicBoolean quarantineStarted = new AtomicBoolean();
    private volatile Connection connection;
    private volatile boolean initialized;
    private volatile boolean locked;
    private volatile Path pinnedDirectory;

    private SqliteEncryptedMemoryStore(
        Path directory,
        String vaultId,
        Instant createdAt,
        byte[] masterKey
    ) {
        this.directory = directory;
        this.databasePath = directory.resolve("memory.db");
        this.vaultId = vaultId;
        this.vaultCreatedAt = createdAt.toEpochMilli();
        this.crypto = new MemoryCrypto(masterKey);
        this.executor = Executors.newSingleThreadExecutor(runnable -> {
            Thread thread = new Thread(runnable, "fe-local-memory-store");
            thread.setDaemon(true);
            return thread;
        });
    }

    public static SqliteEncryptedMemoryStore open(Path vaultDirectory, MemoryVaultKeyManager.KeyLease lease) {
        if (vaultDirectory == null || lease == null) throw failure("MEMORY_STORE_INVALID_INPUT");
        Path directory = vaultDirectory.toAbsolutePath().normalize();
        byte[] key = null;
        SqliteEncryptedMemoryStore store = null;
        try {
            validateIdentifier(lease.vaultId(), "MEMORY_VAULT_LOCKED");
            key = lease.key();
            store = new SqliteEncryptedMemoryStore(directory, lease.vaultId(), lease.createdAt(), key);
            SqliteEncryptedMemoryStore candidate = store;
            candidate.execute(() -> {
                candidate.openOnStoreThread();
                return null;
            });
            return candidate;
        } catch (RuntimeException failure) {
            if (store != null) store.closeAfterFailedOpen();
            throw normalize(failure);
        } finally {
            clear(key);
        }
    }

    private void openOnStoreThread() {
        PendingRestore pendingRestore = null;
        try {
            ensureSecureDirectory();
            refuseQuarantinedVault();
            pendingRestore = reconcilePendingRestoreBeforeOpen();
            if (Files.isSymbolicLink(databasePath)) throw failure("MEMORY_VAULT_LOCKED");
            Class.forName("org.sqlite.JDBC");
            connection = DriverManager.getConnection("jdbc:sqlite:" + databasePath);
            inspectBeforeWritableConfiguration(connection);
            hardenDatabaseFiles();
            // Filtered reads cannot discover a row that an attacker suppressed by
            // changing a public tombstone or deleting a blind token. Audit every
            // authenticated envelope and its exact token set before serving reads.
            verifyDatabaseIntegrity(connection);
            validateEveryRecord(connection);
            if (pendingRestore != null) {
                validatePendingRestoreLogicalRoot(connection, pendingRestore);
                completePendingRestore(pendingRestore);
            }
            initialized = true;
        } catch (Exception problem) {
            LocalMemoryException mapped = problem instanceof ClassNotFoundException
                ? failure("MEMORY_STORE_UNAVAILABLE")
                : mapFailure(problem);
            if (pendingRestore != null
                && pendingRestore.activeNewDatabase()
                && mapped.code() == LocalMemoryException.Code.INTEGRITY) {
                try {
                    recoverOldDatabaseAfterFailedRestore(pendingRestore);
                    mapped = new LocalMemoryException(LocalMemoryException.Code.RESTORE_INVALID, problem);
                } catch (Exception recoveryFailure) {
                    locked = true;
                    throw new LocalMemoryException(LocalMemoryException.Code.LOCKED, recoveryFailure);
                }
            }
            throw mapped;
        }
    }

    private void ensureSecureDirectory() throws IOException {
        boolean exists = Files.exists(directory, LinkOption.NOFOLLOW_LINKS);
        if (exists && (!Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS)
            || Files.isSymbolicLink(directory))) {
            throw failure("MEMORY_VAULT_LOCKED");
        }
        if (!exists) Files.createDirectories(directory);
        Path realDirectory = directory.toRealPath();
        if (!realDirectory.equals(directory)) throw failure("MEMORY_VAULT_LOCKED");
        if (pinnedDirectory == null) pinnedDirectory = realDirectory;
        else if (!pinnedDirectory.equals(realDirectory)) throw failure("MEMORY_VAULT_LOCKED");
        MemoryFileSecurity.hardenOwnerOnly(directory, true);
    }

    private static void configureConnection(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            String journalMode;
            try (ResultSet result = statement.executeQuery("PRAGMA journal_mode=WAL")) {
                journalMode = result.next() ? result.getString(1) : "";
            }
            if (!"wal".equalsIgnoreCase(journalMode)) throw failure("MEMORY_STORE_UNAVAILABLE");
            statement.execute("PRAGMA foreign_keys=ON");
            statement.execute("PRAGMA synchronous=FULL");
            statement.execute("PRAGMA busy_timeout=" + BUSY_TIMEOUT_MILLIS);
            statement.execute("PRAGMA temp_store=MEMORY");
        }
        requirePragma(connection, "foreign_keys", 1L);
        requirePragma(connection, "synchronous", 2L);
        requirePragma(connection, "busy_timeout", BUSY_TIMEOUT_MILLIS);
        requirePragma(connection, "temp_store", 2L);
    }

    private static void requirePragma(Connection connection, String name, long expected) throws SQLException {
        try (Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("PRAGMA " + name)) {
            if (!result.next() || result.getLong(1) != expected) {
                throw failure("MEMORY_STORE_UNAVAILABLE");
            }
        }
    }

    private void inspectBeforeWritableConfiguration(Connection connection) throws SQLException {
        int version = userVersion(connection);
        if (version > SCHEMA_VERSION) throw failure("MEMORY_SCHEMA_FUTURE");
        if (version < 0) throw failure("MEMORY_INTEGRITY_FAILED");
        if (version == 0) {
            if (hasApplicationSchemaObjects(connection)) throw failure("MEMORY_INTEGRITY_FAILED");
            configureConnection(connection);
            createSchema(connection);
        } else if (version != SCHEMA_VERSION) {
            throw failure("MEMORY_SCHEMA_UNSUPPORTED");
        } else {
            // Validate identity and the exact known schema before any PRAGMA that can
            // mutate the file or create a WAL sidecar.
            validateExactSchema(connection);
            validateVaultState(connection);
            configureConnection(connection);
        }
        validateExactSchema(connection);
        validateVaultState(connection);
    }

    private void createSchema(Connection connection) throws SQLException {
        boolean previousAutoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        try (Statement statement = connection.createStatement()) {
            for (String sql : CREATE_SCHEMA.split(";")) {
                if (!sql.isBlank()) statement.execute(sql);
            }
            try (PreparedStatement insert = connection.prepareStatement(
                "INSERT INTO vault_state(singleton, schema_version, vault_id, created_at) VALUES(1, ?, ?, ?)"
            )) {
                insert.setInt(1, SCHEMA_VERSION);
                insert.setString(2, vaultId);
                insert.setLong(3, vaultCreatedAt);
                if (insert.executeUpdate() != 1) throw failure("MEMORY_STORE_UNAVAILABLE");
            }
            statement.execute("PRAGMA user_version=" + SCHEMA_VERSION);
            connection.commit();
        } catch (SQLException | RuntimeException failure) {
            rollbackOrLock(connection);
            throw failure;
        } finally {
            restoreAutoCommitOrLock(connection, previousAutoCommit);
        }
    }

    private static int userVersion(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("PRAGMA user_version")) {
            if (!result.next()) throw failure("MEMORY_INTEGRITY_FAILED");
            return result.getInt(1);
        }
    }

    private static boolean hasApplicationSchemaObjects(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
            "SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1"
        ); ResultSet result = statement.executeQuery()) {
            return result.next();
        }
    }

    private static void validateExactSchema(Connection connection) throws SQLException {
        Set<String> tables = new HashSet<>();
        Set<String> indexes = new HashSet<>();
        Set<String> schemaObjects = new HashSet<>();
        try (PreparedStatement statement = connection.prepareStatement(
            "SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"
        ); ResultSet result = statement.executeQuery()) {
            while (result.next()) {
                String type = result.getString(1);
                String name = result.getString(2);
                if ("table".equals(type)) tables.add(name);
                else if ("index".equals(type)) indexes.add(name);
                else throw failure("MEMORY_INTEGRITY_FAILED");
                String key = schemaObjectKey(type, name);
                String expectedSql = EXPECTED_SCHEMA_SQL.get(key);
                String actualSql = result.getString(3);
                if (expectedSql == null
                    || actualSql == null
                    || !expectedSql.equals(normalizeSchemaSql(actualSql))) {
                    throw failure("MEMORY_INTEGRITY_FAILED");
                }
                schemaObjects.add(key);
            }
        }
        if (!tables.equals(EXPECTED_COLUMNS.keySet())
            || !indexes.equals(EXPECTED_INDEXES)
            || !schemaObjects.equals(EXPECTED_SCHEMA_SQL.keySet())) {
            throw failure("MEMORY_INTEGRITY_FAILED");
        }
        for (Map.Entry<String, List<ColumnSpec>> entry : EXPECTED_COLUMNS.entrySet()) {
            List<ColumnSpec> actual = new ArrayList<>();
            try (Statement statement = connection.createStatement();
                 ResultSet result = statement.executeQuery("PRAGMA table_info(" + entry.getKey() + ")")) {
                while (result.next()) {
                    actual.add(new ColumnSpec(
                        result.getString("name"),
                        result.getString("type").toUpperCase(Locale.ROOT),
                        result.getInt("notnull") == 1,
                        result.getInt("pk") > 0
                    ));
                }
            }
            if (!actual.equals(entry.getValue())) throw failure("MEMORY_INTEGRITY_FAILED");
        }
        for (Map.Entry<String, List<IndexColumnSpec>> entry : EXPECTED_INDEX_COLUMNS.entrySet()) {
            List<IndexColumnSpec> actual = new ArrayList<>();
            try (Statement statement = connection.createStatement();
                 ResultSet result = statement.executeQuery("PRAGMA index_xinfo(" + entry.getKey() + ")")) {
                while (result.next()) {
                    if (result.getInt("key") == 1 && result.getInt("cid") >= 0) {
                        actual.add(new IndexColumnSpec(
                            result.getString("name"),
                            result.getInt("desc") == 1
                        ));
                    }
                }
            }
            if (!actual.equals(entry.getValue())) throw failure("MEMORY_INTEGRITY_FAILED");
        }
        validateForeignKey(connection, "chat_search_tokens", "message_id", "chat_records", "message_id");
        validateForeignKey(connection, "operation_search_tokens", "event_id", "operation_records", "event_id");
        validateForeignKey(connection, "knowledge_search_tokens", "event_id", "knowledge_records", "event_id");
    }

    private static Map<String, String> expectedSchemaSql() {
        Map<String, String> expected = new LinkedHashMap<>();
        for (String statement : CREATE_SCHEMA.split(";")) {
            String normalized = normalizeSchemaSql(statement);
            if (normalized.isEmpty()) continue;
            var matcher = CREATE_SCHEMA_OBJECT.matcher(normalized);
            if (!matcher.find()) throw new ExceptionInInitializerError("INVALID_MEMORY_SCHEMA");
            String type = matcher.group(1).toLowerCase(Locale.ROOT);
            String name = matcher.group(2).toLowerCase(Locale.ROOT);
            if (expected.put(schemaObjectKey(type, name), normalized) != null) {
                throw new ExceptionInInitializerError("DUPLICATE_MEMORY_SCHEMA_OBJECT");
            }
        }
        return Map.copyOf(expected);
    }

    private static String normalizeSchemaSql(String sql) {
        return sql.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }

    private static String schemaObjectKey(String type, String name) {
        return type + ':' + name;
    }

    private static void validateForeignKey(
        Connection connection,
        String table,
        String column,
        String parentTable,
        String parentColumn
    ) throws SQLException {
        int matches = 0;
        try (Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("PRAGMA foreign_key_list(" + table + ")")) {
            while (result.next()) {
                if (parentTable.equals(result.getString("table"))
                    && column.equals(result.getString("from"))
                    && parentColumn.equals(result.getString("to"))
                    && "CASCADE".equalsIgnoreCase(result.getString("on_delete"))) {
                    matches++;
                }
            }
        }
        if (matches != 1) throw failure("MEMORY_INTEGRITY_FAILED");
    }

    private void validateVaultState(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
            "SELECT singleton, schema_version, vault_id, created_at FROM vault_state"
        ); ResultSet result = statement.executeQuery()) {
            if (!result.next()
                || result.getInt(1) != 1
                || result.getInt(2) != SCHEMA_VERSION
                || !vaultId.equals(result.getString(3))
                || result.getLong(4) != vaultCreatedAt
                || result.next()) {
                throw failure("MEMORY_VAULT_LOCKED");
            }
        }
    }

    private void hardenDatabaseFiles() throws IOException {
        MemoryFileSecurity.hardenOwnerOnly(databasePath, false);
        for (String suffix : List.of("-wal", "-shm")) {
            Path path = Path.of(databasePath + suffix);
            if (Files.exists(path, LinkOption.NOFOLLOW_LINKS)) {
                MemoryFileSecurity.hardenOwnerOnly(path, false);
            }
        }
    }

    @Override
    public List<AppendResult> appendBatch(List<LocalMemoryEvent> events) {
        return append(events, null);
    }

    @Override
    public List<AppendResult> appendChats(List<LocalMemoryEvent> events) {
        return append(events, MemorySanitizer.Stream.CHAT);
    }

    @Override
    public List<AppendResult> appendOperations(List<LocalMemoryEvent> events) {
        return append(events, MemorySanitizer.Stream.OPERATION);
    }

    @Override
    public List<AppendResult> appendKnowledge(List<LocalMemoryEvent> events) {
        return append(events, MemorySanitizer.Stream.KNOWLEDGE);
    }

    private List<AppendResult> append(
        List<LocalMemoryEvent> events,
        MemorySanitizer.Stream expectedStream
    ) {
        List<LocalMemoryEvent> bounded = LocalMemoryStore.Bounds.batch(events, expectedStream);
        return execute(() -> appendOnStoreThread(bounded));
    }

    private List<AppendResult> appendOnStoreThread(List<LocalMemoryEvent> events) {
        Connection database = requireConnection();
        boolean previousAutoCommit;
        try {
            previousAutoCommit = database.getAutoCommit();
            database.setAutoCommit(false);
        } catch (SQLException failure) {
            throw mapFailure(failure);
        }
        try {
            ArrayList<AppendResult> results = new ArrayList<>(events.size());
            for (LocalMemoryEvent event : events) results.add(appendOne(database, event));
            database.commit();
            hardenDatabaseFiles();
            return List.copyOf(results);
        } catch (SQLException | IOException | RuntimeException problem) {
            rollbackOrLock(database);
            throw mapFailure(problem);
        } finally {
            restoreAutoCommitOrLock(database, previousAutoCommit);
        }
    }

    private AppendResult appendOne(Connection database, LocalMemoryEvent event) throws SQLException {
        MemorySanitizer.Stream existingStream = findStreamForId(database, event.eventId());
        if (existingStream != null) {
            if (existingStream != event.stream()) throw failure(LocalMemoryException.Code.CONFLICT);
            StoredRow existing = readRowById(database, descriptor(existingStream), event.eventId());
            if (existing == null) throw failure(LocalMemoryException.Code.INTEGRITY);
            try {
                DecryptedEnvelope envelope = decryptAndVerify(
                    database, existingStream, event.scope(), existing
                );
                Map<String, Object> payload = envelope.payload();
                byte[] incoming = event.canonicalPayloadBytes();
                byte[] persisted = CanonicalMemoryJson.encode(payload);
                try {
                    if (!existing.scopeHash().equals(scopeHash(event.scope()))
                        || !existing.type().equals(event.type())
                        || !Objects.equals(existing.occurredAt(), event.occurredAtEpochMillis())
                        || existing.sourceSequence() != event.sourceSequence()
                        || !MessageDigest.isEqual(incoming, persisted)) {
                        throw failure(LocalMemoryException.Code.CONFLICT);
                    }
                } finally {
                    clear(incoming);
                    clear(persisted);
                }
            } finally {
                existing.clearSecrets();
            }
            return new AppendResult(event.eventId(), true, Instant.ofEpochMilli(existing.recordedAt()));
        }

        StreamDescriptor stream = descriptor(event.stream());
        String scopeHash = scopeHash(event.scope());
        Long occurredAt = event.occurredAtEpochMillis();
        long recordedAt = Instant.now().toEpochMilli();
        byte[] canonical = encryptedEnvelopeBytes(event.payload(), recordedAt, null);
        byte[] aad = aad(event.stream(), scopeHash, event.eventId(), event.type(), occurredAt);
        MemoryCrypto.Sealed sealed = null;
        try {
            sealed = crypto.seal(canonical, aad);
            insertRecord(database, stream, event, scopeHash, recordedAt, sealed);
            insertSearchTokens(database, stream, event.eventId(), event.payload());
            return new AppendResult(event.eventId(), false, Instant.ofEpochMilli(recordedAt));
        } finally {
            clear(canonical);
            clear(aad);
            if (sealed != null) {
                clear(sealed.nonce());
                clear(sealed.ciphertext());
            }
        }
    }

    private static MemorySanitizer.Stream findStreamForId(Connection database, String eventId)
        throws SQLException {
        MemorySanitizer.Stream found = null;
        for (MemorySanitizer.Stream stream : MemorySanitizer.Stream.values()) {
            StreamDescriptor descriptor = descriptor(stream);
            try (PreparedStatement statement = database.prepareStatement(
                "SELECT 1 FROM " + descriptor.recordTable() + " WHERE " + descriptor.idColumn() + "=? LIMIT 1"
            )) {
                statement.setString(1, eventId);
                try (ResultSet result = statement.executeQuery()) {
                    if (result.next()) {
                        if (found != null) throw failure(LocalMemoryException.Code.INTEGRITY);
                        found = stream;
                    }
                }
            }
        }
        return found;
    }

    private void insertRecord(
        Connection database,
        StreamDescriptor stream,
        LocalMemoryEvent event,
        String scopeHash,
        long recordedAt,
        MemoryCrypto.Sealed sealed
    ) throws SQLException {
        byte[] nonce = sealed.nonce();
        byte[] ciphertext = sealed.ciphertext();
        try {
            if (event.stream() == MemorySanitizer.Stream.CHAT) {
                try (PreparedStatement statement = database.prepareStatement("""
                    INSERT INTO chat_records(
                      message_id, scope_hash, conversation_token, type, trace_id, turn_id,
                      occurred_at, recorded_at, source_sequence, nonce, ciphertext, aad_version, deleted_at
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL)
                    """)) {
                    statement.setString(1, event.eventId());
                    statement.setString(2, scopeHash);
                    byte[] conversation = conversationToken(event.conversationId());
                    try {
                        statement.setBytes(3, conversation);
                        statement.setString(4, event.type());
                        statement.setString(5, event.traceId());
                        nullableString(statement, 6, event.turnId());
                        nullableLong(statement, 7, event.occurredAtEpochMillis());
                        statement.setLong(8, recordedAt);
                        statement.setLong(9, event.sourceSequence());
                        statement.setBytes(10, nonce);
                        statement.setBytes(11, ciphertext);
                        statement.setInt(12, AAD_VERSION);
                        requireOne(statement.executeUpdate());
                    } finally {
                        clear(conversation);
                    }
                }
            } else if (event.stream() == MemorySanitizer.Stream.OPERATION) {
                try (PreparedStatement statement = database.prepareStatement("""
                    INSERT INTO operation_records(
                      event_id, operation_id, scope_hash, trace_id, turn_id, caused_by_message_id,
                      type, phase, actor, occurred_at, recorded_at, source_sequence,
                      nonce, ciphertext, aad_version, deleted_at
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)
                    """)) {
                    statement.setString(1, event.eventId());
                    statement.setString(2, event.operationId());
                    statement.setString(3, scopeHash);
                    statement.setString(4, event.traceId());
                    nullableString(statement, 5, event.turnId());
                    nullableString(statement, 6, event.causedByMessageId());
                    statement.setString(7, event.type());
                    statement.setString(8, payloadString(event.payload(), "phase"));
                    statement.setString(9, payloadString(event.payload(), "actor"));
                    statement.setLong(10, requiredOccurredAt(event));
                    statement.setLong(11, recordedAt);
                    statement.setLong(12, event.sourceSequence());
                    statement.setBytes(13, nonce);
                    statement.setBytes(14, ciphertext);
                    statement.setInt(15, AAD_VERSION);
                    requireOne(statement.executeUpdate());
                }
            } else {
                try (PreparedStatement statement = database.prepareStatement("""
                    INSERT INTO knowledge_records(
                      event_id, scope_hash, type, occurred_at, recorded_at, source_sequence,
                      nonce, ciphertext, aad_version, deleted_at
                    ) VALUES(?,?,?,?,?,?,?,?,?,NULL)
                    """)) {
                    statement.setString(1, event.eventId());
                    statement.setString(2, scopeHash);
                    statement.setString(3, event.type());
                    nullableLong(statement, 4, event.occurredAtEpochMillis());
                    statement.setLong(5, recordedAt);
                    statement.setLong(6, event.sourceSequence());
                    statement.setBytes(7, nonce);
                    statement.setBytes(8, ciphertext);
                    statement.setInt(9, AAD_VERSION);
                    requireOne(statement.executeUpdate());
                }
            }
        } finally {
            clear(nonce);
            clear(ciphertext);
        }
    }

    private void insertSearchTokens(
        Connection database,
        StreamDescriptor stream,
        String eventId,
        Map<String, Object> payload
    ) throws SQLException {
        List<byte[]> tokens = blindSearchTokens(payload);
        try (PreparedStatement statement = database.prepareStatement(
            "INSERT INTO " + stream.tokenTable() + "(" + stream.tokenIdColumn() + ", token) VALUES(?,?)"
        )) {
            for (byte[] token : tokens) {
                statement.setString(1, eventId);
                statement.setBytes(2, token);
                statement.addBatch();
            }
            int[] counts = statement.executeBatch();
            for (int count : counts) {
                if (count != 1 && count != Statement.SUCCESS_NO_INFO) {
                    throw failure(LocalMemoryException.Code.IO_FAILED);
                }
            }
        } finally {
            clearAll(tokens);
        }
    }

    @Override
    public Page queryChats(Query query) {
        return query(query, MemorySanitizer.Stream.CHAT);
    }

    @Override
    public Page queryOperations(Query query) {
        return query(query, MemorySanitizer.Stream.OPERATION);
    }

    @Override
    public Page queryKnowledge(Query query) {
        return query(query, MemorySanitizer.Stream.KNOWLEDGE);
    }

    private Page query(Query query, MemorySanitizer.Stream stream) {
        if (query == null) throw failure(LocalMemoryException.Code.INVALID_ARGUMENT);
        query.requireStream(stream);
        return execute(() -> {
            List<StoredEvent> rows = queryRows(
                requireConnection(), stream, query.scope(), query.types(), query.limit(),
                query.before(), query.text(), null
            );
            boolean hasMore = rows.size() > query.limit();
            List<StoredEvent> page = hasMore ? List.copyOf(rows.subList(0, query.limit())) : List.copyOf(rows);
            Cursor next = hasMore && !page.isEmpty() ? page.get(page.size() - 1).cursor() : null;
            return new Page(page, next);
        });
    }

    @Override
    public TraceResult queryTrace(TraceQuery query) {
        if (query == null) throw failure(LocalMemoryException.Code.INVALID_ARGUMENT);
        return execute(() -> {
            Connection database = requireConnection();
            List<StoredEvent> chats = queryRows(
                database,
                MemorySanitizer.Stream.CHAT,
                query.scope(),
                MemorySanitizer.allowedTypes(MemorySanitizer.Stream.CHAT),
                query.limit() - 1,
                null,
                null,
                query.traceId()
            );
            List<StoredEvent> operations = queryRows(
                database,
                MemorySanitizer.Stream.OPERATION,
                query.scope(),
                MemorySanitizer.allowedTypes(MemorySanitizer.Stream.OPERATION),
                query.limit() - 1,
                null,
                null,
                query.traceId()
            );
            return new TraceResult(chats, operations);
        });
    }

    private List<StoredEvent> queryRows(
        Connection database,
        MemorySanitizer.Stream stream,
        String scope,
        Set<String> types,
        int requestedLimit,
        Cursor before,
        String search,
        String traceId
    ) throws SQLException {
        StreamDescriptor descriptor = descriptor(stream);
        String scopeHash = scopeHash(scope);
        List<byte[]> queryTokens = search == null ? List.of() : blindQueryTokens(search);
        try {
            // A nonblank query that normalizes to no searchable terms must not
            // silently degrade into an unfiltered read of the whole scope.
            if (search != null && queryTokens.isEmpty()) return List.of();
            if (!queryTokens.isEmpty()) prepareQueryTokens(database, queryTokens);
            StringBuilder sql = new StringBuilder(selectProjection(descriptor));
            sql.append(" WHERE scope_hash=? AND deleted_at IS NULL AND type IN (");
            appendPlaceholders(sql, types.size());
            sql.append(')');
            if (traceId != null) {
                if (stream == MemorySanitizer.Stream.KNOWLEDGE) throw failure(LocalMemoryException.Code.INVALID_ARGUMENT);
                sql.append(" AND trace_id=?");
            }
            if (before != null) {
                sql.append(" AND (COALESCE(occurred_at,-9223372036854775808) < ?")
                    .append(" OR (COALESCE(occurred_at,-9223372036854775808) = ? AND recorded_at < ?)")
                    .append(" OR (COALESCE(occurred_at,-9223372036854775808) = ? AND recorded_at = ? AND source_sequence < ?)")
                    .append(" OR (COALESCE(occurred_at,-9223372036854775808) = ? AND recorded_at = ? AND source_sequence = ? AND ")
                    .append(descriptor.idColumn()).append(" < ?))");
            }
            if (!queryTokens.isEmpty()) {
                sql.append(" AND ").append(descriptor.idColumn()).append(" IN (")
                    .append("SELECT st.").append(descriptor.tokenIdColumn())
                    .append(" FROM ").append(descriptor.tokenTable()).append(" st")
                    .append(" JOIN temp.memory_query_tokens qt ON qt.token=st.token")
                    .append(" GROUP BY st.").append(descriptor.tokenIdColumn())
                    .append(" HAVING COUNT(*)=(SELECT COUNT(*) FROM temp.memory_query_tokens))");
            }
            sql.append(" ORDER BY COALESCE(occurred_at,-9223372036854775808) DESC,")
                .append(" recorded_at DESC, source_sequence DESC, ")
                .append(descriptor.idColumn()).append(" DESC LIMIT ?");

            ArrayList<StoredEvent> output = new ArrayList<>();
            try (PreparedStatement statement = database.prepareStatement(sql.toString())) {
                int parameter = 1;
                statement.setString(parameter++, scopeHash);
                for (String type : types) statement.setString(parameter++, type);
                if (traceId != null) statement.setString(parameter++, traceId);
                if (before != null) {
                    long cursorOccurred = before.occurredAtMillis() == null
                        ? Long.MIN_VALUE
                        : before.occurredAtMillis();
                    statement.setLong(parameter++, cursorOccurred);
                    statement.setLong(parameter++, cursorOccurred);
                    statement.setLong(parameter++, before.recordedAtMillis());
                    statement.setLong(parameter++, cursorOccurred);
                    statement.setLong(parameter++, before.recordedAtMillis());
                    statement.setLong(parameter++, before.sourceSequence());
                    statement.setLong(parameter++, cursorOccurred);
                    statement.setLong(parameter++, before.recordedAtMillis());
                    statement.setLong(parameter++, before.sourceSequence());
                    statement.setString(parameter++, before.eventId());
                }
                statement.setInt(parameter, Math.min(MAX_RESULTS + 1, requestedLimit + 1));
                try (ResultSet result = statement.executeQuery()) {
                    while (result.next()) {
                        StoredRow row = storedRow(result);
                        try {
                            DecryptedEnvelope envelope = decryptAndVerify(database, stream, scope, row);
                            Map<String, Object> payload = envelope.payload();
                            LocalMemoryEvent event = new LocalMemoryEvent(
                                row.eventId(), stream, scope, row.type(),
                                payloadOccurredAt(payload, row.occurredAt()),
                                row.sourceSequence(), payload
                            );
                            verifyPublicProjection(stream, event, row);
                            output.add(new StoredEvent(event, Instant.ofEpochMilli(row.recordedAt())));
                        } finally {
                            row.clearSecrets();
                        }
                    }
                }
            }
            return List.copyOf(output);
        } finally {
            clearAll(queryTokens);
            clearQueryTokens(database);
        }
    }

    private DecryptedEnvelope decryptAndVerify(
        Connection database,
        MemorySanitizer.Stream stream,
        String scope,
        StoredRow row
    ) throws SQLException {
        return decryptAndVerifyHash(database, stream, scopeHash(scope), row);
    }

    private DecryptedEnvelope decryptAndVerifyStoredScope(
        Connection database,
        MemorySanitizer.Stream stream,
        StoredRow row
    ) throws SQLException {
        return decryptAndVerifyHash(database, stream, null, row);
    }

    private DecryptedEnvelope decryptAndVerifyHash(
        Connection database,
        MemorySanitizer.Stream stream,
        String expectedScopeHash,
        StoredRow row
    ) throws SQLException {
        if (row.aadVersion() != AAD_VERSION
            || (expectedScopeHash != null && !row.scopeHash().equals(expectedScopeHash))) {
            throw failure(LocalMemoryException.Code.INTEGRITY);
        }
        byte[] aad = aad(stream, row.scopeHash(), row.eventId(), row.type(), row.occurredAt());
        byte[] plaintext = null;
        try {
            plaintext = crypto.open(new MemoryCrypto.Sealed(row.nonce(), row.ciphertext()), aad);
            Map<String, Object> root;
            try {
                root = CanonicalMemoryJson.immutableObject(
                    SimpleJson.parseObjectStrict(new String(plaintext, StandardCharsets.UTF_8))
                );
            } catch (RuntimeException problem) {
                throw failure(LocalMemoryException.Code.INTEGRITY);
            }
            byte[] canonical = CanonicalMemoryJson.encode(root);
            try {
                if (!MessageDigest.isEqual(plaintext, canonical)) {
                    throw failure(LocalMemoryException.Code.INTEGRITY);
                }
            } finally {
                clear(canonical);
            }
            if (root.size() != 3 || !root.containsKey("payload")
                || !root.containsKey("recordedAt") || !root.containsKey("deletedAt")) {
                throw failure(LocalMemoryException.Code.INTEGRITY);
            }
            long encryptedRecordedAt = exactLong(root.get("recordedAt"));
            Long encryptedDeletedAt = nullableExactLong(root.get("deletedAt"));
            if (encryptedRecordedAt != row.recordedAt()
                || !Objects.equals(encryptedDeletedAt, row.deletedAt())) {
                throw failure(LocalMemoryException.Code.INTEGRITY);
            }
            Object payloadValue = root.get("payload");
            if (!(payloadValue instanceof Map<?, ?> rawPayload)) {
                throw failure(LocalMemoryException.Code.INTEGRITY);
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> payload = CanonicalMemoryJson.immutableObject(
                (Map<String, Object>) rawPayload
            );
            verifySearchTokens(
                database,
                descriptor(stream),
                row.eventId(),
                payload,
                encryptedDeletedAt != null
            );
            return new DecryptedEnvelope(payload, encryptedRecordedAt, encryptedDeletedAt);
        } catch (LocalMemoryException problem) {
            throw problem;
        } catch (RuntimeException problem) {
            throw failure(LocalMemoryException.Code.INTEGRITY);
        } finally {
            clear(aad);
            clear(plaintext);
            row.clearCipherSecrets();
        }
    }

    private void verifySearchTokens(
        Connection database,
        StreamDescriptor stream,
        String eventId,
        Map<String, Object> payload,
        boolean deleted
    ) throws SQLException {
        List<byte[]> expected = deleted ? List.of() : blindSearchTokens(payload);
        ArrayList<byte[]> actual = new ArrayList<>();
        try (PreparedStatement statement = database.prepareStatement(
            "SELECT token FROM " + stream.tokenTable() + " WHERE " + stream.tokenIdColumn() + "=? ORDER BY token"
        )) {
            statement.setString(1, eventId);
            try (ResultSet result = statement.executeQuery()) {
                while (result.next()) actual.add(result.getBytes(1));
            }
        }
        try {
            if (!tokenSetsEqual(expected, actual)) throw failure(LocalMemoryException.Code.INTEGRITY);
        } finally {
            clearAll(expected);
            clearAll(actual);
        }
    }

    private static boolean tokenSetsEqual(List<byte[]> left, List<byte[]> right) {
        if (left.size() != right.size()) return false;
        ArrayList<String> leftEncoded = new ArrayList<>(left.size());
        ArrayList<String> rightEncoded = new ArrayList<>(right.size());
        Base64.Encoder encoder = Base64.getEncoder();
        for (byte[] value : left) leftEncoded.add(encoder.encodeToString(value));
        for (byte[] value : right) rightEncoded.add(encoder.encodeToString(value));
        leftEncoded.sort(Comparator.naturalOrder());
        rightEncoded.sort(Comparator.naturalOrder());
        return leftEncoded.equals(rightEncoded);
    }

    @Override
    public ForgetResult forgetChats(ForgetRequest request) {
        return forget(request, MemorySanitizer.Stream.CHAT);
    }

    @Override
    public ForgetResult forgetOperations(ForgetRequest request) {
        return forget(request, MemorySanitizer.Stream.OPERATION);
    }

    @Override
    public ForgetResult forgetKnowledge(ForgetRequest request) {
        return forget(request, MemorySanitizer.Stream.KNOWLEDGE);
    }

    private ForgetResult forget(ForgetRequest request, MemorySanitizer.Stream stream) {
        if (request == null) throw failure(LocalMemoryException.Code.INVALID_ARGUMENT);
        request.requireStream(stream);
        return execute(() -> forgetOnStoreThread(request, stream));
    }

    private ForgetResult forgetOnStoreThread(ForgetRequest request, MemorySanitizer.Stream stream) {
        Connection database = requireConnection();
        StreamDescriptor descriptor = descriptor(stream);
        SqlFilter filter = forgetFilter(request, stream);
        try {
            boolean previousAutoCommit = database.getAutoCommit();
            database.setAutoCommit(false);
            try {
                ArrayList<StoredRow> selected = new ArrayList<>();
                try (PreparedStatement rows = database.prepareStatement(
                    selectProjection(descriptor) + " WHERE " + filter.sql()
                )) {
                    bind(rows, filter.values());
                    try (ResultSet result = rows.executeQuery()) {
                        while (result.next()) selected.add(storedRow(result));
                    }
                }
                long deletedAt = Instant.now().toEpochMilli();
                int changed = 0;
                for (StoredRow row : selected) {
                    try {
                        DecryptedEnvelope envelope = decryptAndVerify(
                            database, stream, request.scope(), row
                        );
                        LocalMemoryEvent event = new LocalMemoryEvent(
                            row.eventId(), stream, request.scope(), row.type(),
                            payloadOccurredAt(envelope.payload(), row.occurredAt()),
                            row.sourceSequence(), envelope.payload()
                        );
                        verifyPublicProjection(stream, event, row);
                        byte[] plaintext = encryptedEnvelopeBytes(
                            envelope.payload(), envelope.recordedAt(), deletedAt
                        );
                        byte[] additional = aad(
                            stream, row.scopeHash(), row.eventId(), row.type(), row.occurredAt()
                        );
                        MemoryCrypto.Sealed sealed = null;
                        try {
                            sealed = crypto.seal(plaintext, additional);
                            byte[] nonce = sealed.nonce();
                            byte[] ciphertext = sealed.ciphertext();
                            try (PreparedStatement update = database.prepareStatement(
                                "UPDATE " + descriptor.recordTable()
                                    + " SET deleted_at=?, nonce=?, ciphertext=? WHERE "
                                    + descriptor.idColumn() + "=? AND deleted_at IS NULL"
                            )) {
                                update.setLong(1, deletedAt);
                                update.setBytes(2, nonce);
                                update.setBytes(3, ciphertext);
                                update.setString(4, row.eventId());
                                requireOne(update.executeUpdate());
                            } finally {
                                clear(nonce);
                                clear(ciphertext);
                            }
                        } finally {
                            clear(plaintext);
                            clear(additional);
                            if (sealed != null) {
                                clear(sealed.nonce());
                                clear(sealed.ciphertext());
                            }
                        }
                        try (PreparedStatement tokens = database.prepareStatement(
                            "DELETE FROM " + descriptor.tokenTable() + " WHERE "
                                + descriptor.tokenIdColumn() + "=?"
                        )) {
                            tokens.setString(1, row.eventId());
                            tokens.executeUpdate();
                        }
                        changed++;
                    } finally {
                        row.clearSecrets();
                    }
                }
                database.commit();
                hardenDatabaseFiles();
                return new ForgetResult(changed);
            } catch (SQLException | IOException | RuntimeException problem) {
                rollbackOrLock(database);
                throw mapFailure(problem);
            } finally {
                restoreAutoCommitOrLock(database, previousAutoCommit);
            }
        } catch (SQLException problem) {
            throw mapFailure(problem);
        }
    }

    private SqlFilter forgetFilter(ForgetRequest request, MemorySanitizer.Stream stream) {
        StreamDescriptor descriptor = descriptor(stream);
        StringBuilder sql = new StringBuilder("scope_hash=? AND deleted_at IS NULL");
        ArrayList<Object> values = new ArrayList<>();
        values.add(scopeHash(request.scope()));
        if (!request.eventIds().isEmpty()) {
            sql.append(" AND ").append(descriptor.idColumn()).append(" IN (");
            appendPlaceholders(sql, request.eventIds().size());
            sql.append(')');
            values.addAll(request.eventIds());
        } else if (request.conversationId() != null) {
            sql.append(" AND conversation_token=?");
            values.add(conversationToken(request.conversationId()));
        } else if (!request.entireScope()) {
            if (request.operationId() != null) {
                sql.append(" AND operation_id=?");
                values.add(request.operationId());
            }
            if (!request.types().isEmpty()) {
                sql.append(" AND type IN (");
                appendPlaceholders(sql, request.types().size());
                sql.append(')');
                values.addAll(request.types());
            }
            if (request.occurredBefore() != null) {
                sql.append(" AND occurred_at<?");
                values.add(request.occurredBefore().toEpochMilli());
            }
        }
        return new SqlFilter(sql.toString(), List.copyOf(values));
    }

    @Override
    public BackupResult backup(Path target) {
        Path archive = LocalMemoryStore.Bounds.path(target);
        return execute(() -> backupOnStoreThread(archive));
    }

    private BackupResult backupOnStoreThread(Path archive) {
        byte[] manifest = null;
        byte[] header = null;
        byte[] mac = null;
        Path temporary = null;
        try {
            Path backupDirectory = validateBackupTarget(archive);
            Connection database = requireConnection();
            verifyDatabaseIntegrity(database);
            validateEveryRecord(database);
            checkpointTruncate(database);
            long databaseSize = Files.size(databasePath);
            if (databaseSize <= 0
                || databaseSize > MAX_BACKUP_BYTES - MAX_BACKUP_MANIFEST_BYTES - 64L) {
                throw failure(LocalMemoryException.Code.TOO_LARGE);
            }
            manifest = backupManifest(databaseSize, sha256Hex(databasePath));
            header = backupHeader(manifest);
            mac = crypto.backupMac(header);
            if (mac.length != BACKUP_MAC_BYTES) throw failure(LocalMemoryException.Code.UNAVAILABLE);
            long archiveSize = header.length + (long) mac.length + databaseSize;
            if (archiveSize > MAX_BACKUP_BYTES) {
                throw failure(LocalMemoryException.Code.TOO_LARGE);
            }
            temporary = backupDirectory.resolve(".fememory-" + UUID.randomUUID() + ".next");
            durableCreateBackup(temporary, header, mac, databasePath, databaseSize);
            atomicMoveNew(temporary, archive);
            MemoryFileSecurity.hardenOwnerOnly(archive, false);
            return new BackupResult(archiveSize, sha256Hex(archive));
        } catch (LocalMemoryException problem) {
            throw problem;
        } catch (SQLException | IOException | SecurityException problem) {
            throw mapFailure(problem);
        } finally {
            clear(manifest);
            clear(header);
            clear(mac);
            deleteQuietly(temporary);
        }
    }

    @Override
    public RestoreResult restore(Path source) {
        Path archive = LocalMemoryStore.Bounds.path(source);
        return execute(() -> restoreOnStoreThread(archive));
    }

    private RestoreResult restoreOnStoreThread(Path archive) {
        String restoreId = UUID.randomUUID().toString();
        Path replacement = restoreReplacementPath(restoreId);
        Path recovery = restoreRecoveryPath(restoreId);
        RestoreIntent intent = null;
        boolean intentDurable = false;
        boolean publishedVerified = false;
        try {
            validateRestoreSource(archive);
            long size = Files.size(archive);
            if (size <= BACKUP_MAGIC.length + 8L + BACKUP_MAC_BYTES || size > MAX_BACKUP_BYTES) {
                throw failure(LocalMemoryException.Code.RESTORE_INVALID);
            }
            readBackupDatabase(archive, size, replacement);
            ValidatedReplacement validatedReplacement = validateReplacementDatabase(replacement);

            Connection live = requireConnection();
            checkpointTruncate(live);
            verifyDatabaseIntegrity(live);
            validateEveryRecord(live);
            String oldDatabaseLogicalSha256 = logicalDatabaseSha256(live);
            String oldDatabaseSha256 = sha256Hex(databasePath);
            String newDatabaseSha256 = sha256Hex(replacement);
            durableCopyDatabase(databasePath, recovery);
            if (!oldDatabaseSha256.equals(sha256Hex(recovery))) {
                throw failure(LocalMemoryException.Code.RESTORE_INVALID);
            }
            intent = new RestoreIntent(
                restoreId,
                Instant.now().toEpochMilli(),
                oldDatabaseSha256,
                newDatabaseSha256,
                oldDatabaseLogicalSha256,
                validatedReplacement.logicalSha256()
            );
            writeRestoreIntent(intent);
            intentDurable = true;

            closeConnectionWithoutCheckpoint();
            initialized = false;
            requireSidecarsAbsent(databasePath);
            atomicReplace(replacement, databasePath);
            writeRestorePublished(intent);
            PendingRestore pending = new PendingRestore(intent, true);
            openRestoredDatabase();
            validatePendingRestoreLogicalRoot(requireConnection(), pending);
            publishedVerified = true;
            completePendingRestore(pending);
            intentDurable = false;
            return new RestoreResult(validatedReplacement.records());
        } catch (LocalMemoryException problem) {
            if (intentDurable && intent != null) {
                if (publishedVerified) {
                    locked = true;
                    throw new LocalMemoryException(LocalMemoryException.Code.LOCKED, problem);
                }
                recoverOrLockAfterRestoreFailure(intent, problem);
                intentDurable = false;
            }
            throw problem;
        } catch (Exception problem) {
            if (intentDurable && intent != null) {
                if (publishedVerified) {
                    locked = true;
                    throw new LocalMemoryException(LocalMemoryException.Code.LOCKED, problem);
                }
                recoverOrLockAfterRestoreFailure(intent, problem);
                intentDurable = false;
            }
            throw mapFailure(problem);
        } finally {
            if (!intentDurable) {
                deleteQuietly(replacement);
                deleteQuietly(recovery);
            }
        }
    }

    private byte[] backupManifest(long databaseLength, String databaseSha256) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("createdAt", vaultCreatedAt);
        values.put("databaseLength", databaseLength);
        values.put("databaseSha256", databaseSha256);
        values.put("schemaVersion", SCHEMA_VERSION);
        values.put("vaultId", vaultId);
        byte[] manifest = CanonicalMemoryJson.encode(values);
        if (manifest.length == 0 || manifest.length > MAX_BACKUP_MANIFEST_BYTES) {
            clear(manifest);
            throw failure(LocalMemoryException.Code.TOO_LARGE);
        }
        return manifest;
    }

    private static byte[] backupHeader(byte[] manifest) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(BACKUP_MAGIC.length + manifest.length + 8);
        try (DataOutputStream output = new DataOutputStream(bytes)) {
            output.write(BACKUP_MAGIC);
            output.writeInt(BACKUP_FORMAT_VERSION);
            output.writeInt(manifest.length);
            output.write(manifest);
        }
        return bytes.toByteArray();
    }

    private void readBackupDatabase(Path archive, long archiveSize, Path replacement) throws IOException {
        byte[] magic = null;
        byte[] manifestBytes = null;
        byte[] header = null;
        byte[] expectedMac = null;
        try (DataInputStream input = new DataInputStream(Files.newInputStream(
            archive,
            StandardOpenOption.READ,
            LinkOption.NOFOLLOW_LINKS
        ))) {
            magic = input.readNBytes(BACKUP_MAGIC.length);
            if (magic.length != BACKUP_MAGIC.length || !MessageDigest.isEqual(magic, BACKUP_MAGIC)) {
                throw failure(LocalMemoryException.Code.RESTORE_INVALID);
            }
            int formatVersion = input.readInt();
            if (formatVersion > BACKUP_FORMAT_VERSION) {
                throw failure(LocalMemoryException.Code.FUTURE_SCHEMA);
            }
            if (formatVersion != BACKUP_FORMAT_VERSION) {
                throw failure(LocalMemoryException.Code.RESTORE_INVALID);
            }
            int manifestLength = input.readInt();
            if (manifestLength <= 0 || manifestLength > MAX_BACKUP_MANIFEST_BYTES) {
                throw failure(LocalMemoryException.Code.RESTORE_INVALID);
            }
            manifestBytes = input.readNBytes(manifestLength);
            if (manifestBytes.length != manifestLength) {
                throw failure(LocalMemoryException.Code.RESTORE_INVALID);
            }
            header = backupHeader(manifestBytes);
            expectedMac = input.readNBytes(BACKUP_MAC_BYTES);
            if (expectedMac.length != BACKUP_MAC_BYTES || !crypto.verifyBackupMac(header, expectedMac)) {
                throw failure(LocalMemoryException.Code.RESTORE_INVALID);
            }
            BackupManifest manifest = parseBackupManifest(manifestBytes);
            long expectedSize = header.length + (long) BACKUP_MAC_BYTES + manifest.databaseLength();
            if (expectedSize != archiveSize) throw failure(LocalMemoryException.Code.RESTORE_INVALID);
            durableCreateRestoredDatabase(input, replacement, manifest);
            if (input.read() != -1) throw failure(LocalMemoryException.Code.RESTORE_INVALID);
        } catch (LocalMemoryException problem) {
            if (problem.code() == LocalMemoryException.Code.FUTURE_SCHEMA) throw problem;
            throw new LocalMemoryException(LocalMemoryException.Code.RESTORE_INVALID, problem);
        } catch (RuntimeException problem) {
            throw new LocalMemoryException(LocalMemoryException.Code.RESTORE_INVALID, problem);
        } finally {
            clear(magic);
            clear(manifestBytes);
            clear(header);
            clear(expectedMac);
        }
    }

    private BackupManifest parseBackupManifest(byte[] manifestBytes) {
        try {
            Map<String, Object> values = CanonicalMemoryJson.immutableObject(
                SimpleJson.parseObjectStrict(new String(manifestBytes, StandardCharsets.UTF_8))
            );
            byte[] canonical = CanonicalMemoryJson.encode(values);
            try {
                if (!MessageDigest.isEqual(canonical, manifestBytes)
                    || !values.keySet().equals(Set.of(
                        "createdAt", "databaseLength", "databaseSha256", "schemaVersion", "vaultId"
                    ))) {
                    throw failure(LocalMemoryException.Code.RESTORE_INVALID);
                }
            } finally {
                clear(canonical);
            }
            long schemaVersion = exactLong(values.get("schemaVersion"));
            if (schemaVersion > SCHEMA_VERSION) throw failure(LocalMemoryException.Code.FUTURE_SCHEMA);
            long createdAt = exactLong(values.get("createdAt"));
            long databaseLength = exactLong(values.get("databaseLength"));
            Object vault = values.get("vaultId");
            Object digest = values.get("databaseSha256");
            if (schemaVersion != SCHEMA_VERSION
                || createdAt != vaultCreatedAt
                || !(vault instanceof String backupVaultId)
                || !vaultId.equals(backupVaultId)
                || databaseLength <= 0
                || databaseLength > MAX_BACKUP_BYTES - MAX_BACKUP_MANIFEST_BYTES - 64L
                || !(digest instanceof String databaseSha256)
                || !databaseSha256.matches("[0-9a-f]{64}")) {
                throw failure(LocalMemoryException.Code.RESTORE_INVALID);
            }
            return new BackupManifest(databaseLength, databaseSha256);
        } catch (LocalMemoryException problem) {
            throw problem;
        } catch (RuntimeException problem) {
            throw new LocalMemoryException(LocalMemoryException.Code.RESTORE_INVALID, problem);
        }
    }

    private Path restoreIntentPath() {
        return directory.resolve(RESTORE_INTENT_FILE_NAME);
    }

    private Path restoreReplacementPath(String restoreId) {
        return directory.resolve(".memory-restore-" + restoreId + ".db.next");
    }

    private Path restoreRecoveryPath(String restoreId) {
        return directory.resolve(".memory-restore-recovery-" + restoreId + ".db");
    }

    private Path restorePublishedPath(String restoreId) {
        return directory.resolve(".memory-restore-published-" + restoreId + ".json");
    }

    private void writeRestoreIntent(RestoreIntent intent) throws IOException {
        Path path = restoreIntentPath();
        if (Files.exists(path, LinkOption.NOFOLLOW_LINKS)) {
            throw failure(LocalMemoryException.Code.LOCKED);
        }
        byte[] bytes = restoreIntentBytes(intent);
        try {
            durableAtomicCreateBytes(path, bytes);
        } finally {
            clear(bytes);
        }
    }

    private byte[] restoreIntentBytes(RestoreIntent intent) {
        Map<String, Object> unsignedValues = restoreIntentUnsignedValues(intent);
        byte[] unsigned = CanonicalMemoryJson.encode(unsignedValues);
        byte[] mac = null;
        try {
            mac = crypto.backupMac(unsigned);
            Map<String, Object> values = new LinkedHashMap<>(unsignedValues);
            values.put("mac", HexFormat.of().formatHex(mac));
            return CanonicalMemoryJson.encode(values);
        } finally {
            clear(unsigned);
            clear(mac);
        }
    }

    private Map<String, Object> restoreIntentUnsignedValues(RestoreIntent intent) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("createdAt", intent.createdAt());
        values.put("newDatabaseLogicalSha256", intent.newDatabaseLogicalSha256());
        values.put("newDatabaseSha256", intent.newDatabaseSha256());
        values.put("oldDatabaseLogicalSha256", intent.oldDatabaseLogicalSha256());
        values.put("oldDatabaseSha256", intent.oldDatabaseSha256());
        values.put("restoreId", intent.restoreId());
        values.put("schemaVersion", SCHEMA_VERSION);
        values.put("vaultId", vaultId);
        return values;
    }

    private RestoreIntent readRestoreIntent() throws IOException {
        Path path = restoreIntentPath();
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)
            || Files.isSymbolicLink(path)
            || Files.size(path) <= 0
            || Files.size(path) > MAX_BACKUP_MANIFEST_BYTES) {
            throw failure(LocalMemoryException.Code.LOCKED);
        }
        MemoryFileSecurity.hardenOwnerOnly(path, false);
        byte[] bytes = Files.readAllBytes(path);
        try {
            Map<String, Object> values = CanonicalMemoryJson.immutableObject(
                SimpleJson.parseObjectStrict(new String(bytes, StandardCharsets.UTF_8))
            );
            byte[] canonical = CanonicalMemoryJson.encode(values);
            try {
                if (!MessageDigest.isEqual(bytes, canonical)
                    || !values.keySet().equals(Set.of(
                        "createdAt", "newDatabaseLogicalSha256", "newDatabaseSha256",
                        "oldDatabaseLogicalSha256", "oldDatabaseSha256", "restoreId",
                        "schemaVersion", "vaultId", "mac"
                    ))) {
                    throw failure(LocalMemoryException.Code.LOCKED);
                }
            } finally {
                clear(canonical);
            }
            long schemaVersion = exactLong(values.get("schemaVersion"));
            if (schemaVersion > SCHEMA_VERSION) throw failure(LocalMemoryException.Code.FUTURE_SCHEMA);
            Object intentVault = values.get("vaultId");
            Object restoreIdValue = values.get("restoreId");
            Object oldHashValue = values.get("oldDatabaseSha256");
            Object newHashValue = values.get("newDatabaseSha256");
            Object oldLogicalHashValue = values.get("oldDatabaseLogicalSha256");
            Object newLogicalHashValue = values.get("newDatabaseLogicalSha256");
            Object macValue = values.get("mac");
            if (schemaVersion != SCHEMA_VERSION
                || !(intentVault instanceof String intentVaultId)
                || !vaultId.equals(intentVaultId)
                || !(restoreIdValue instanceof String restoreId)
                || !canonicalUuid(restoreId).equals(restoreId)
                || !(oldHashValue instanceof String oldHash)
                || !(newHashValue instanceof String newHash)
                || !oldHash.matches("[0-9a-f]{64}")
                || !newHash.matches("[0-9a-f]{64}")
                || !(oldLogicalHashValue instanceof String oldLogicalHash)
                || !(newLogicalHashValue instanceof String newLogicalHash)
                || !oldLogicalHash.matches("[0-9a-f]{64}")
                || !newLogicalHash.matches("[0-9a-f]{64}")
                || !(macValue instanceof String macHex)
                || !macHex.matches("[0-9a-f]{64}")) {
                throw failure(LocalMemoryException.Code.LOCKED);
            }
            RestoreIntent intent = new RestoreIntent(
                restoreId,
                exactLong(values.get("createdAt")),
                oldHash,
                newHash,
                oldLogicalHash,
                newLogicalHash
            );
            byte[] unsigned = CanonicalMemoryJson.encode(restoreIntentUnsignedValues(intent));
            byte[] expectedMac = HexFormat.of().parseHex(macHex);
            try {
                if (!crypto.verifyBackupMac(unsigned, expectedMac)) {
                    throw failure(LocalMemoryException.Code.LOCKED);
                }
            } finally {
                clear(unsigned);
                clear(expectedMac);
            }
            return intent;
        } catch (LocalMemoryException problem) {
            throw problem;
        } catch (RuntimeException problem) {
            throw new LocalMemoryException(LocalMemoryException.Code.LOCKED, problem);
        } finally {
            clear(bytes);
        }
    }

    private byte[] restorePublishedBytes(RestoreIntent intent) {
        Map<String, Object> unsignedValues = new LinkedHashMap<>();
        unsignedValues.put("newDatabaseLogicalSha256", intent.newDatabaseLogicalSha256());
        unsignedValues.put("newDatabaseSha256", intent.newDatabaseSha256());
        unsignedValues.put("restoreId", intent.restoreId());
        unsignedValues.put("vaultId", vaultId);
        byte[] unsigned = CanonicalMemoryJson.encode(unsignedValues);
        byte[] mac = null;
        try {
            mac = crypto.backupMac(unsigned);
            Map<String, Object> values = new LinkedHashMap<>(unsignedValues);
            values.put("mac", HexFormat.of().formatHex(mac));
            return CanonicalMemoryJson.encode(values);
        } finally {
            clear(unsigned);
            clear(mac);
        }
    }

    private void writeRestorePublished(RestoreIntent intent) throws IOException {
        byte[] bytes = restorePublishedBytes(intent);
        try {
            durableAtomicCreateBytes(restorePublishedPath(intent.restoreId()), bytes);
        } finally {
            clear(bytes);
        }
    }

    private boolean hasValidRestorePublished(RestoreIntent intent) throws IOException {
        Path path = restorePublishedPath(intent.restoreId());
        if (!Files.exists(path, LinkOption.NOFOLLOW_LINKS)) return false;
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)
            || Files.isSymbolicLink(path)
            || Files.size(path) > MAX_BACKUP_MANIFEST_BYTES) {
            throw failure(LocalMemoryException.Code.LOCKED);
        }
        byte[] actual = Files.readAllBytes(path);
        byte[] expected = restorePublishedBytes(intent);
        try {
            return MessageDigest.isEqual(actual, expected);
        } finally {
            clear(actual);
            clear(expected);
        }
    }

    private PendingRestore reconcilePendingRestoreBeforeOpen() throws IOException {
        Path intentPath = restoreIntentPath();
        discardIncompleteAtomicWrite(intentPath);
        if (!Files.exists(intentPath, LinkOption.NOFOLLOW_LINKS)) return null;
        RestoreIntent intent = readRestoreIntent();
        discardIncompleteAtomicWrite(restorePublishedPath(intent.restoreId()));
        Path recovery = restoreRecoveryPath(intent.restoreId());
        if (Files.exists(databasePath, LinkOption.NOFOLLOW_LINKS)) {
            if (!Files.isRegularFile(databasePath, LinkOption.NOFOLLOW_LINKS)
                || Files.isSymbolicLink(databasePath)) {
                locked = true;
                throw failure(LocalMemoryException.Code.LOCKED);
            }
            String currentHash = sha256Hex(databasePath);
            if (intent.oldDatabaseSha256().equals(currentHash)) {
                return new PendingRestore(intent, false);
            }
            if (intent.newDatabaseSha256().equals(currentHash)) {
                return new PendingRestore(intent, true);
            }
            // configureConnection switches the freshly published DELETE-mode
            // database back to WAL and changes its physical hash. The atomic,
            // authenticated published marker proves that this transition began;
            // openOnStoreThread still performs exact schema, SQLite integrity and
            // full record/token authentication before the recovery copy is removed.
            if (hasValidRestorePublished(intent)) {
                return new PendingRestore(intent, true);
            }
            locked = true;
            throw failure(LocalMemoryException.Code.LOCKED);
        }
        if (!Files.isRegularFile(recovery, LinkOption.NOFOLLOW_LINKS)
            || Files.isSymbolicLink(recovery)
            || !intent.oldDatabaseSha256().equals(sha256Hex(recovery))) {
            locked = true;
            throw failure(LocalMemoryException.Code.LOCKED);
        }
        Path republish = directory.resolve(".memory-restore-republish-" + intent.restoreId() + ".db.next");
        try {
            durableCopyDatabase(recovery, republish);
            atomicMoveNew(republish, databasePath);
        } finally {
            deleteQuietly(republish);
        }
        return new PendingRestore(intent, false);
    }

    private void completePendingRestore(PendingRestore pending) throws IOException {
        RestoreIntent intent = pending.intent();
        deleteExpectedStagedFile(
            restoreReplacementPath(intent.restoreId()),
            intent.newDatabaseSha256()
        );
        deleteExpectedStagedFile(
            restoreRecoveryPath(intent.restoreId()),
            intent.oldDatabaseSha256()
        );
        Path published = restorePublishedPath(intent.restoreId());
        if (Files.exists(published, LinkOption.NOFOLLOW_LINKS)) {
            // activeNewDatabase is assigned only after the live database matched the
            // signed new hash (or immediately after our verified atomic replace). A
            // partial legacy marker is therefore redundant and safe to discard.
            if (!hasValidRestorePublished(intent) && !pending.activeNewDatabase()) {
                throw failure(LocalMemoryException.Code.LOCKED);
            }
        }
        Files.delete(restoreIntentPath());
        // The intent is the authoritative recovery state. Once it is removed,
        // a leftover signed published marker is inert and may be cleaned later.
        deleteQuietly(published);
    }

    private static void deleteExpectedStagedFile(Path path, String expectedSha256) throws IOException {
        if (!Files.exists(path, LinkOption.NOFOLLOW_LINKS)) return;
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)
            || Files.isSymbolicLink(path)
            || !expectedSha256.equals(sha256Hex(path))) {
            throw failure(LocalMemoryException.Code.LOCKED);
        }
        Files.delete(path);
    }

    private void recoverOldDatabaseAfterFailedRestore(PendingRestore pending) throws Exception {
        RestoreIntent intent = pending.intent();
        closeConnectionWithoutCheckpoint();
        initialized = false;
        if (pending.activeNewDatabase()) {
            Path recovery = restoreRecoveryPath(intent.restoreId());
            if (!Files.isRegularFile(recovery, LinkOption.NOFOLLOW_LINKS)
                || Files.isSymbolicLink(recovery)
                || !intent.oldDatabaseSha256().equals(sha256Hex(recovery))) {
                throw failure(LocalMemoryException.Code.LOCKED);
            }
            Path rollback = directory.resolve(".memory-restore-rollback-" + intent.restoreId() + ".db.next");
            try {
                durableCopyDatabase(recovery, rollback);
                atomicReplace(rollback, databasePath);
            } finally {
                deleteQuietly(rollback);
            }
        }
        openRestoredDatabase();
        completePendingRestore(new PendingRestore(intent, false));
    }

    private void recoverOrLockAfterRestoreFailure(RestoreIntent intent, Throwable original) {
        closeConnectionWithoutCheckpoint();
        initialized = false;
        try {
            PendingRestore pending = reconcilePendingRestoreBeforeOpen();
            if (pending == null || !pending.intent().equals(intent)) {
                throw failure(LocalMemoryException.Code.LOCKED);
            }
            if (pending.activeNewDatabase()) {
                recoverOldDatabaseAfterFailedRestore(pending);
            } else {
                openRestoredDatabase();
                completePendingRestore(pending);
            }
        } catch (Exception recoveryFailure) {
            locked = true;
            LocalMemoryException lockedFailure = new LocalMemoryException(
                LocalMemoryException.Code.LOCKED,
                recoveryFailure
            );
            lockedFailure.addSuppressed(original);
            throw lockedFailure;
        }
    }

    private ValidatedReplacement validateReplacementDatabase(Path replacement) throws SQLException, IOException {
        Connection candidate = null;
        try {
            candidate = DriverManager.getConnection("jdbc:sqlite:" + replacement);
            int version = userVersion(candidate);
            if (version > SCHEMA_VERSION) throw failure(LocalMemoryException.Code.FUTURE_SCHEMA);
            if (version != SCHEMA_VERSION) throw failure(LocalMemoryException.Code.RESTORE_INVALID);
            validateExactSchema(candidate);
            validateVaultState(candidate);
            configureConnection(candidate);
            verifyDatabaseIntegrity(candidate);
            long records = validateEveryRecord(candidate);
            String logicalSha256 = logicalDatabaseSha256(candidate);
            checkpointTruncate(candidate);
            try (Statement statement = candidate.createStatement()) {
                String mode;
                try (ResultSet result = statement.executeQuery("PRAGMA journal_mode=DELETE")) {
                    mode = result.next() ? result.getString(1) : "";
                }
                if (!"delete".equalsIgnoreCase(mode)) {
                    throw failure(LocalMemoryException.Code.RESTORE_INVALID);
                }
            }
            return new ValidatedReplacement(records, logicalSha256);
        } finally {
            if (candidate != null) {
                try {
                    candidate.close();
                } catch (SQLException ignored) {
                }
            }
            requireSidecarsAbsent(replacement);
        }
    }

    private static void verifyDatabaseIntegrity(Connection database) throws SQLException {
        try (Statement statement = database.createStatement();
             ResultSet result = statement.executeQuery("PRAGMA integrity_check(1)")) {
            if (!result.next() || !"ok".equalsIgnoreCase(result.getString(1)) || result.next()) {
                throw failure(LocalMemoryException.Code.INTEGRITY);
            }
        }
        try (Statement statement = database.createStatement();
             ResultSet result = statement.executeQuery("PRAGMA foreign_key_check")) {
            if (result.next()) throw failure(LocalMemoryException.Code.INTEGRITY);
        }
    }

    private long validateEveryRecord(Connection database) throws SQLException {
        HashSet<String> eventIds = new HashSet<>();
        long count = 0;
        for (MemorySanitizer.Stream stream : MemorySanitizer.Stream.values()) {
            StreamDescriptor descriptor = descriptor(stream);
            try (PreparedStatement statement = database.prepareStatement(selectProjection(descriptor));
                 ResultSet result = statement.executeQuery()) {
                while (result.next()) {
                    StoredRow row = storedRow(result);
                    try {
                        if (!eventIds.add(row.eventId())) {
                            throw failure(LocalMemoryException.Code.INTEGRITY);
                        }
                        DecryptedEnvelope envelope = decryptAndVerifyStoredScope(database, stream, row);
                        LocalMemoryEvent event = new LocalMemoryEvent(
                            row.eventId(), stream, "restore-verification", row.type(),
                            payloadOccurredAt(envelope.payload(), row.occurredAt()),
                            row.sourceSequence(), envelope.payload()
                        );
                        verifyPublicProjection(stream, event, row);
                        count++;
                    } finally {
                        row.clearSecrets();
                    }
                }
            }
        }
        return count;
    }

    static String logicalDatabaseSha256(Connection database) throws SQLException {
        MessageDigest digest = sha256Digest();
        digest.update("FE_MONSTER_MEMORY_LOGICAL_V1".getBytes(StandardCharsets.UTF_8));
        for (LogicalTable table : LOGICAL_TABLES) {
            updateLogicalValue(digest, table.name());
            try (PreparedStatement statement = database.prepareStatement(table.query());
                 ResultSet result = statement.executeQuery()) {
                int columns = result.getMetaData().getColumnCount();
                while (result.next()) {
                    digest.update((byte) 0x52);
                    for (int column = 1; column <= columns; column++) {
                        updateLogicalValue(digest, result.getObject(column));
                    }
                }
            }
            digest.update((byte) 0x54);
        }
        byte[] value = digest.digest();
        try {
            return HexFormat.of().formatHex(value);
        } finally {
            clear(value);
        }
    }

    private static void updateLogicalValue(MessageDigest digest, Object value) {
        if (value == null) {
            digest.update((byte) 0x00);
            return;
        }
        if (value instanceof String text) {
            byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
            try {
                digest.update((byte) 0x01);
                updateLogicalBytes(digest, bytes);
            } finally {
                clear(bytes);
            }
            return;
        }
        if (value instanceof byte[] bytes) {
            digest.update((byte) 0x02);
            updateLogicalBytes(digest, bytes);
            return;
        }
        if (value instanceof Byte || value instanceof Short
            || value instanceof Integer || value instanceof Long) {
            digest.update((byte) 0x03);
            byte[] bytes = ByteBuffer.allocate(Long.BYTES).putLong(((Number) value).longValue()).array();
            try {
                digest.update(bytes);
            } finally {
                clear(bytes);
            }
            return;
        }
        throw failure(LocalMemoryException.Code.INTEGRITY);
    }

    private static void updateLogicalBytes(MessageDigest digest, byte[] value) {
        byte[] length = ByteBuffer.allocate(Integer.BYTES).putInt(value.length).array();
        try {
            digest.update(length);
            digest.update(value);
        } finally {
            clear(length);
        }
    }

    private static void validatePendingRestoreLogicalRoot(
        Connection database,
        PendingRestore pending
    ) throws SQLException {
        String expected = pending.activeNewDatabase()
            ? pending.intent().newDatabaseLogicalSha256()
            : pending.intent().oldDatabaseLogicalSha256();
        if (!expected.equals(logicalDatabaseSha256(database))) {
            throw failure(LocalMemoryException.Code.INTEGRITY);
        }
    }

    private void openRestoredDatabase() throws SQLException, IOException {
        connection = DriverManager.getConnection("jdbc:sqlite:" + databasePath);
        initialized = false;
        inspectBeforeWritableConfiguration(connection);
        hardenDatabaseFiles();
        verifyDatabaseIntegrity(connection);
        validateEveryRecord(connection);
        initialized = true;
    }

    private static void bind(PreparedStatement statement, List<Object> values) throws SQLException {
        bind(statement, values, 1);
    }

    private static void bind(PreparedStatement statement, List<Object> values, int first) throws SQLException {
        int index = first;
        for (Object value : values) {
            if (value instanceof byte[] bytes) statement.setBytes(index++, bytes);
            else if (value instanceof Long number) statement.setLong(index++, number);
            else statement.setString(index++, String.valueOf(value));
        }
    }

    private static void checkpointTruncate(Connection database) throws SQLException {
        try (Statement statement = database.createStatement();
             ResultSet result = statement.executeQuery("PRAGMA wal_checkpoint(TRUNCATE)")) {
            if (!result.next() || result.getInt(1) != 0) {
                throw failure(LocalMemoryException.Code.BUSY);
            }
        }
    }

    private Path validateBackupTarget(Path archive) throws IOException {
        Path backupDirectory = directory.resolve("backups").normalize();
        String fileName = archive.getFileName() == null ? "" : archive.getFileName().toString();
        if (!backupDirectory.equals(archive.getParent())
            || !BACKUP_FILE_NAME.matcher(fileName).matches()
            || Files.exists(archive, LinkOption.NOFOLLOW_LINKS)) {
            throw failure(LocalMemoryException.Code.INVALID_ARGUMENT);
        }
        if (Files.exists(backupDirectory, LinkOption.NOFOLLOW_LINKS)) {
            if (!Files.isDirectory(backupDirectory, LinkOption.NOFOLLOW_LINKS)
                || Files.isSymbolicLink(backupDirectory)) {
                throw failure(LocalMemoryException.Code.INVALID_ARGUMENT);
            }
        } else {
            Files.createDirectory(backupDirectory);
        }
        MemoryFileSecurity.hardenOwnerOnly(backupDirectory, true);
        requireUnredirectedDirectory(backupDirectory, LocalMemoryException.Code.INVALID_ARGUMENT);
        return backupDirectory;
    }

    private void refuseQuarantinedVault() throws IOException {
        Path lock = directory.resolve(QUARANTINE_LOCK_FILE_NAME);
        if (!Files.exists(lock, LinkOption.NOFOLLOW_LINKS)) return;
        locked = true;
        if (!Files.isRegularFile(lock, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(lock)) {
            throw failure(LocalMemoryException.Code.LOCKED);
        }
        MemoryFileSecurity.hardenOwnerOnly(lock, false);
        throw failure(LocalMemoryException.Code.LOCKED);
    }

    private void quarantineOnStoreThread() {
        if (!quarantineStarted.compareAndSet(false, true)) {
            locked = true;
            return;
        }
        locked = true;
        initialized = false;
        closeConnectionWithoutCheckpoint();
        String quarantineId = Instant.now().toEpochMilli() + "-" + UUID.randomUUID();
        Path quarantineRoot = directory.resolve("quarantine");
        Path quarantineDirectory = quarantineRoot.resolve(quarantineId);
        Path lock = directory.resolve(QUARANTINE_LOCK_FILE_NAME);
        ArrayList<Path> artifacts = new ArrayList<>();
        for (String name : List.of("memory.db", "memory.db-wal", "memory.db-shm")) {
            Path artifact = directory.resolve(name);
            if (Files.exists(artifact, LinkOption.NOFOLLOW_LINKS)) artifacts.add(artifact);
        }
        try {
            if (Files.exists(quarantineRoot, LinkOption.NOFOLLOW_LINKS)) {
                if (!Files.isDirectory(quarantineRoot, LinkOption.NOFOLLOW_LINKS)
                    || Files.isSymbolicLink(quarantineRoot)) {
                    return;
                }
            } else {
                Files.createDirectory(quarantineRoot);
            }
            requireUnredirectedDirectory(quarantineRoot, LocalMemoryException.Code.LOCKED);
            MemoryFileSecurity.hardenOwnerOnly(quarantineRoot, true);
            Files.createDirectory(quarantineDirectory);
            MemoryFileSecurity.hardenOwnerOnly(quarantineDirectory, true);

            ArrayList<String> names = new ArrayList<>();
            boolean invalidArtifact = false;
            for (Path artifact : artifacts) {
                names.add(artifact.getFileName().toString());
                if (!Files.isRegularFile(artifact, LinkOption.NOFOLLOW_LINKS)
                    || Files.isSymbolicLink(artifact)) {
                    invalidArtifact = true;
                }
            }
            byte[] staging = quarantineDocument(quarantineId, names, "staging");
            try {
                durableCreateBytes(quarantineDirectory.resolve("manifest.json"), staging);
            } finally {
                clear(staging);
            }
            if (!Files.exists(lock, LinkOption.NOFOLLOW_LINKS)) {
                byte[] lockBytes = quarantineDocument(quarantineId, names, "locked");
                try {
                    durableCreateBytes(lock, lockBytes);
                } finally {
                    clear(lockBytes);
                }
            }
            if (invalidArtifact) return;

            for (Path artifact : artifacts) {
                Path target = quarantineDirectory.resolve(artifact.getFileName().toString());
                atomicMoveNew(artifact, target);
                MemoryFileSecurity.hardenOwnerOnly(target, false);
            }
            byte[] complete = quarantineDocument(quarantineId, names, "complete");
            try {
                durableCreateBytes(quarantineDirectory.resolve("complete.json"), complete);
            } finally {
                clear(complete);
            }
        } catch (IOException | RuntimeException ignored) {
            // The durable lock is written before any evidence move. If even that
            // cannot be created, the current instance remains locked and the
            // original corrupt files are left untouched for the next recovery.
        }
    }

    private byte[] quarantineDocument(String quarantineId, List<String> artifacts, String state) {
        Map<String, Object> unsignedValues = new LinkedHashMap<>();
        unsignedValues.put("artifacts", List.copyOf(artifacts));
        unsignedValues.put("createdAt", Instant.now().toEpochMilli());
        unsignedValues.put("quarantineId", quarantineId);
        unsignedValues.put("reason", "LOCAL_MEMORY_INTEGRITY");
        unsignedValues.put("schemaVersion", SCHEMA_VERSION);
        unsignedValues.put("state", state);
        unsignedValues.put("vaultId", vaultId);
        byte[] unsigned = CanonicalMemoryJson.encode(unsignedValues);
        byte[] mac = null;
        try {
            mac = crypto.backupMac(unsigned);
            Map<String, Object> values = new LinkedHashMap<>(unsignedValues);
            values.put("mac", HexFormat.of().formatHex(mac));
            return CanonicalMemoryJson.encode(values);
        } finally {
            clear(unsigned);
            clear(mac);
        }
    }

    private void validateRestoreSource(Path archive) throws IOException {
        Path backupDirectory = directory.resolve("backups").normalize();
        Path upload = directory.resolve(RESTORE_UPLOAD_FILE_NAME).normalize();
        String fileName = archive.getFileName() == null ? "" : archive.getFileName().toString();
        boolean storedBackup = backupDirectory.equals(archive.getParent())
            && BACKUP_FILE_NAME.matcher(fileName).matches();
        if ((!storedBackup && !upload.equals(archive))
            || !Files.isRegularFile(archive, LinkOption.NOFOLLOW_LINKS)
            || Files.isSymbolicLink(archive)) {
            throw failure(LocalMemoryException.Code.RESTORE_INVALID);
        }
        Path parent = archive.getParent();
        if (parent == null
            || !Files.isDirectory(parent, LinkOption.NOFOLLOW_LINKS)
            || Files.isSymbolicLink(parent)) {
            throw failure(LocalMemoryException.Code.RESTORE_INVALID);
        }
        requireUnredirectedDirectory(parent, LocalMemoryException.Code.RESTORE_INVALID);
        if (!archive.toRealPath().equals(archive)) {
            throw failure(LocalMemoryException.Code.RESTORE_INVALID);
        }
        MemoryFileSecurity.hardenOwnerOnly(parent, true);
        MemoryFileSecurity.hardenOwnerOnly(archive, false);
    }

    private static void requireUnredirectedDirectory(Path path, LocalMemoryException.Code code)
        throws IOException {
        if (!path.toRealPath().equals(path.toAbsolutePath().normalize())) throw failure(code);
    }

    private static void durableCreateBackup(
        Path target,
        byte[] header,
        byte[] mac,
        Path database,
        long expectedDatabaseSize
    ) throws IOException {
        byte[] chunk = new byte[64 * 1024];
        try (java.nio.channels.FileChannel output = java.nio.channels.FileChannel.open(
                 target,
                 StandardOpenOption.CREATE_NEW,
                 StandardOpenOption.WRITE,
                 LinkOption.NOFOLLOW_LINKS
             );
             java.nio.channels.FileChannel input = java.nio.channels.FileChannel.open(
                 database,
                 StandardOpenOption.READ,
                 LinkOption.NOFOLLOW_LINKS
             )) {
            writeFully(output, ByteBuffer.wrap(header));
            writeFully(output, ByteBuffer.wrap(mac));
            long copied = 0;
            ByteBuffer buffer = ByteBuffer.wrap(chunk);
            while (true) {
                buffer.clear();
                int count = input.read(buffer);
                if (count < 0) break;
                if (count == 0) continue;
                copied += count;
                if (copied > expectedDatabaseSize) throw new IOException("DATABASE_CHANGED");
                buffer.flip();
                writeFully(output, buffer);
            }
            if (copied != expectedDatabaseSize) throw new IOException("DATABASE_CHANGED");
            output.force(true);
        } finally {
            clear(chunk);
        }
        MemoryFileSecurity.hardenOwnerOnly(target, false);
    }

    private static void durableCreateBytes(Path target, byte[] bytes) throws IOException {
        try (java.nio.channels.FileChannel output = java.nio.channels.FileChannel.open(
            target,
            StandardOpenOption.CREATE_NEW,
            StandardOpenOption.WRITE,
            LinkOption.NOFOLLOW_LINKS
        )) {
            writeFully(output, ByteBuffer.wrap(bytes));
            output.force(true);
        }
        MemoryFileSecurity.hardenOwnerOnly(target, false);
    }

    private static void durableAtomicCreateBytes(Path target, byte[] bytes) throws IOException {
        if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) throw new IOException("TARGET_EXISTS");
        Path staging = atomicWriteStagingPath(target);
        if (Files.exists(staging, LinkOption.NOFOLLOW_LINKS)) throw new IOException("STAGING_EXISTS");
        try {
            durableCreateBytes(staging, bytes);
            atomicMoveNew(staging, target);
        } finally {
            deleteQuietly(staging);
        }
    }

    private static void discardIncompleteAtomicWrite(Path target) throws IOException {
        Path staging = atomicWriteStagingPath(target);
        if (!Files.exists(staging, LinkOption.NOFOLLOW_LINKS)) return;
        if (!Files.isRegularFile(staging, LinkOption.NOFOLLOW_LINKS)
            || Files.isSymbolicLink(staging)
            || Files.size(staging) > MAX_BACKUP_MANIFEST_BYTES) {
            throw failure(LocalMemoryException.Code.LOCKED);
        }
        MemoryFileSecurity.hardenOwnerOnly(staging, false);
        Files.delete(staging);
    }

    private static Path atomicWriteStagingPath(Path target) {
        return target.resolveSibling(target.getFileName().toString() + ".next");
    }

    private static void durableCopyDatabase(Path source, Path target) throws IOException {
        byte[] chunk = new byte[64 * 1024];
        try (java.nio.channels.FileChannel input = java.nio.channels.FileChannel.open(
                 source,
                 StandardOpenOption.READ,
                 LinkOption.NOFOLLOW_LINKS
             );
             java.nio.channels.FileChannel output = java.nio.channels.FileChannel.open(
                 target,
                 StandardOpenOption.CREATE_NEW,
                 StandardOpenOption.WRITE,
                 LinkOption.NOFOLLOW_LINKS
             )) {
            ByteBuffer buffer = ByteBuffer.wrap(chunk);
            while (true) {
                buffer.clear();
                int count = input.read(buffer);
                if (count < 0) break;
                if (count == 0) continue;
                buffer.flip();
                writeFully(output, buffer);
            }
            output.force(true);
        } finally {
            clear(chunk);
        }
        MemoryFileSecurity.hardenOwnerOnly(target, false);
    }

    private static void durableCreateRestoredDatabase(
        DataInputStream input,
        Path target,
        BackupManifest manifest
    ) throws IOException {
        byte[] chunk = new byte[64 * 1024];
        MessageDigest digest = sha256Digest();
        try (java.nio.channels.FileChannel output = java.nio.channels.FileChannel.open(
            target,
            StandardOpenOption.CREATE_NEW,
            StandardOpenOption.WRITE,
            LinkOption.NOFOLLOW_LINKS
        )) {
            long remaining = manifest.databaseLength();
            while (remaining > 0) {
                int wanted = (int) Math.min(chunk.length, remaining);
                int count = input.read(chunk, 0, wanted);
                if (count < 0) throw failure(LocalMemoryException.Code.RESTORE_INVALID);
                if (count == 0) continue;
                digest.update(chunk, 0, count);
                writeFully(output, ByteBuffer.wrap(chunk, 0, count));
                remaining -= count;
            }
            output.force(true);
        } finally {
            clear(chunk);
        }
        byte[] actual = digest.digest();
        try {
            String actualHex = HexFormat.of().formatHex(actual);
            if (!manifest.databaseSha256().equals(actualHex)) {
                throw failure(LocalMemoryException.Code.RESTORE_INVALID);
            }
        } finally {
            clear(actual);
        }
        MemoryFileSecurity.hardenOwnerOnly(target, false);
    }

    private static void writeFully(java.nio.channels.FileChannel channel, ByteBuffer buffer) throws IOException {
        while (buffer.hasRemaining()) {
            if (channel.write(buffer) <= 0) throw new IOException("WRITE_STALLED");
        }
    }

    private static void atomicMoveNew(Path source, Path target) throws IOException {
        if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) throw new IOException("TARGET_EXISTS");
        try {
            Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException problem) {
            throw new IOException("ATOMIC_MOVE_REQUIRED");
        }
    }

    private static void atomicReplace(Path source, Path target) throws IOException {
        if (!Files.isRegularFile(source, LinkOption.NOFOLLOW_LINKS)
            || Files.isSymbolicLink(source)
            || !Files.isRegularFile(target, LinkOption.NOFOLLOW_LINKS)
            || Files.isSymbolicLink(target)) {
            throw new IOException("INVALID_ATOMIC_REPLACE");
        }
        try {
            Files.move(
                source,
                target,
                StandardCopyOption.ATOMIC_MOVE,
                StandardCopyOption.REPLACE_EXISTING
            );
        } catch (AtomicMoveNotSupportedException problem) {
            throw new IOException("ATOMIC_MOVE_REQUIRED");
        }
    }

    private static String sha256Hex(Path path) throws IOException {
        MessageDigest digest = sha256Digest();
        byte[] chunk = new byte[64 * 1024];
        try (var input = Files.newInputStream(path, StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS)) {
            int count;
            while ((count = input.read(chunk)) >= 0) {
                if (count > 0) digest.update(chunk, 0, count);
            }
        } finally {
            clear(chunk);
        }
        byte[] value = digest.digest();
        try {
            return HexFormat.of().formatHex(value);
        } finally {
            clear(value);
        }
    }

    private static MessageDigest sha256Digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw failure(LocalMemoryException.Code.UNAVAILABLE);
        }
    }

    private static void requireSidecarsAbsent(Path database) throws IOException {
        for (String suffix : List.of("-wal", "-shm")) {
            Path sidecar = Path.of(database + suffix);
            if (!Files.exists(sidecar, LinkOption.NOFOLLOW_LINKS)) continue;
            if (Files.isSymbolicLink(sidecar) || !Files.isRegularFile(sidecar, LinkOption.NOFOLLOW_LINKS)) {
                throw new IOException("INVALID_SIDECAR");
            }
            if (Files.size(sidecar) != 0L) throw new IOException("NONEMPTY_SIDECAR");
            Files.delete(sidecar);
        }
    }

    private static void deleteQuietly(Path path) {
        if (path == null) return;
        try {
            Files.deleteIfExists(path);
        } catch (IOException | SecurityException ignored) {
        }
    }

    private Connection requireConnection() {
        if (locked) throw failure(LocalMemoryException.Code.LOCKED);
        Connection current = connection;
        if (current == null) throw failure(LocalMemoryException.Code.CLOSED);
        try {
            if (current.isClosed()) throw failure(LocalMemoryException.Code.CLOSED);
        } catch (SQLException problem) {
            throw mapFailure(problem);
        }
        return current;
    }

    private static StreamDescriptor descriptor(MemorySanitizer.Stream stream) {
        if (stream == null) throw failure(LocalMemoryException.Code.INVALID_ARGUMENT);
        return switch (stream) {
            case CHAT -> new StreamDescriptor(
                stream, "chat_records", "message_id", "chat_search_tokens", "message_id"
            );
            case OPERATION -> new StreamDescriptor(
                stream, "operation_records", "event_id", "operation_search_tokens", "event_id"
            );
            case KNOWLEDGE -> new StreamDescriptor(
                stream, "knowledge_records", "event_id", "knowledge_search_tokens", "event_id"
            );
        };
    }

    private static String selectProjection(StreamDescriptor descriptor) {
        String common = switch (descriptor.stream()) {
            case CHAT -> "message_id AS event_id, scope_hash, type, occurred_at, recorded_at,"
                + " source_sequence, nonce, ciphertext, aad_version, deleted_at,"
                + " conversation_token, trace_id, turn_id, NULL AS operation_id,"
                + " NULL AS caused_by_message_id, NULL AS phase, NULL AS actor";
            case OPERATION -> "event_id, scope_hash, type, occurred_at, recorded_at,"
                + " source_sequence, nonce, ciphertext, aad_version, deleted_at,"
                + " NULL AS conversation_token, trace_id, turn_id, operation_id,"
                + " caused_by_message_id, phase, actor";
            case KNOWLEDGE -> "event_id, scope_hash, type, occurred_at, recorded_at,"
                + " source_sequence, nonce, ciphertext, aad_version, deleted_at,"
                + " NULL AS conversation_token, NULL AS trace_id, NULL AS turn_id,"
                + " NULL AS operation_id, NULL AS caused_by_message_id, NULL AS phase, NULL AS actor";
        };
        return "SELECT " + common + " FROM " + descriptor.recordTable();
    }

    private static StoredRow readRowById(
        Connection database,
        StreamDescriptor descriptor,
        String eventId
    ) throws SQLException {
        try (PreparedStatement statement = database.prepareStatement(
            selectProjection(descriptor) + " WHERE " + descriptor.idColumn() + "=?"
        )) {
            statement.setString(1, eventId);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) return null;
                StoredRow row = storedRow(result);
                if (result.next()) {
                    row.clearSecrets();
                    throw failure(LocalMemoryException.Code.INTEGRITY);
                }
                return row;
            }
        }
    }

    private static StoredRow storedRow(ResultSet result) throws SQLException {
        long occurred = result.getLong("occurred_at");
        Long occurredAt = result.wasNull() ? null : occurred;
        long deleted = result.getLong("deleted_at");
        Long deletedAt = result.wasNull() ? null : deleted;
        byte[] nonce = result.getBytes("nonce");
        byte[] ciphertext = result.getBytes("ciphertext");
        byte[] conversationToken = result.getBytes("conversation_token");
        if (nonce == null || ciphertext == null) throw failure(LocalMemoryException.Code.INTEGRITY);
        return new StoredRow(
            result.getString("event_id"),
            result.getString("scope_hash"),
            result.getString("type"),
            occurredAt,
            result.getLong("recorded_at"),
            result.getLong("source_sequence"),
            nonce,
            ciphertext,
            result.getInt("aad_version"),
            deletedAt,
            conversationToken,
            result.getString("trace_id"),
            result.getString("turn_id"),
            result.getString("operation_id"),
            result.getString("caused_by_message_id"),
            result.getString("phase"),
            result.getString("actor")
        );
    }

    private void verifyPublicProjection(
        MemorySanitizer.Stream stream,
        LocalMemoryEvent event,
        StoredRow row
    ) {
        if (stream == MemorySanitizer.Stream.CHAT) {
            byte[] expectedConversation = conversationToken(event.conversationId());
            try {
                if (!secureEquals(expectedConversation, row.conversationToken())
                    || !Objects.equals(event.traceId(), row.traceId())
                    || !Objects.equals(event.turnId(), row.turnId())) {
                    throw failure(LocalMemoryException.Code.INTEGRITY);
                }
            } finally {
                clear(expectedConversation);
            }
        } else if (stream == MemorySanitizer.Stream.OPERATION) {
            if (!Objects.equals(event.operationId(), row.operationId())
                || !Objects.equals(event.traceId(), row.traceId())
                || !Objects.equals(event.turnId(), row.turnId())
                || !Objects.equals(event.causedByMessageId(), row.causedByMessageId())
                || !Objects.equals(payloadString(event.payload(), "phase"), row.phase())
                || !Objects.equals(payloadString(event.payload(), "actor"), row.actor())) {
                throw failure(LocalMemoryException.Code.INTEGRITY);
            }
        }
    }

    private static boolean secureEquals(byte[] left, byte[] right) {
        return left != null && right != null && MessageDigest.isEqual(left, right);
    }

    private String scopeHash(String scope) {
        if (scope == null || scope.isBlank()
            || scope.getBytes(StandardCharsets.UTF_8).length > MAX_SCOPE_BYTES) {
            throw failure(LocalMemoryException.Code.INVALID_ARGUMENT);
        }
        byte[] token = boundedBlindToken("scope", "s", scope);
        try {
            return HexFormat.of().formatHex(token);
        } finally {
            clear(token);
        }
    }

    private byte[] conversationToken(String conversationId) {
        validateIdentifier(conversationId, "MEMORY_STORE_INVALID_INPUT");
        return boundedBlindToken("conversation", "c", conversationId);
    }

    private byte[] aad(
        MemorySanitizer.Stream stream,
        String scopeHash,
        String eventId,
        String type,
        Long occurredAt
    ) {
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(256);
            try (DataOutputStream output = new DataOutputStream(bytes)) {
                output.writeInt(AAD_VERSION);
                writeAadString(output, "FE Monster Local AI Memory record v1");
                writeAadString(output, vaultId);
                writeAadString(output, stream.name().toLowerCase(Locale.ROOT));
                writeAadString(output, scopeHash);
                writeAadString(output, eventId);
                writeAadString(output, type);
                output.writeBoolean(occurredAt != null);
                if (occurredAt != null) output.writeLong(occurredAt);
            }
            return bytes.toByteArray();
        } catch (IOException impossible) {
            throw failure(LocalMemoryException.Code.INTERNAL);
        }
    }

    private static void writeAadString(DataOutputStream output, String value) throws IOException {
        byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
        try {
            output.writeInt(bytes.length);
            output.write(bytes);
        } finally {
            clear(bytes);
        }
    }

    private List<byte[]> blindSearchTokens(Map<String, Object> payload) {
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        collectSearchTokens(payload, normalized);
        ArrayList<byte[]> result = new ArrayList<>(normalized.size());
        for (String token : normalized) result.add(boundedBlindToken("search", "q", token));
        return result;
    }

    private List<byte[]> blindQueryTokens(String search) {
        Set<String> normalized;
        try {
            normalized = MemoryTokenizer.tokens(search);
        } catch (RuntimeException problem) {
            throw failure(LocalMemoryException.Code.INVALID_ARGUMENT);
        }
        ArrayList<byte[]> result = new ArrayList<>(normalized.size());
        for (String token : normalized) result.add(boundedBlindToken("search", "q", token));
        return result;
    }

    private byte[] boundedBlindToken(String domain, String prefix, String rawValue) {
        byte[] domainBytes = domain.getBytes(StandardCharsets.UTF_8);
        byte[] rawBytes = rawValue.getBytes(StandardCharsets.UTF_8);
        byte[] digest = null;
        try {
            MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
            sha256.update(domainBytes);
            sha256.update((byte) 0);
            digest = sha256.digest(rawBytes);
            String encoded = Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
            return crypto.blindToken(prefix + ':' + encoded);
        } catch (java.security.NoSuchAlgorithmException impossible) {
            throw failure(LocalMemoryException.Code.UNAVAILABLE);
        } finally {
            clear(domainBytes);
            clear(rawBytes);
            clear(digest);
        }
    }

    private static void collectSearchTokens(Object value, LinkedHashSet<String> output) {
        if (output.size() >= 2_048 || value == null) return;
        if (value instanceof String text) {
            for (String token : MemoryTokenizer.tokens(text)) {
                output.add(token);
                if (output.size() >= 2_048) break;
            }
        } else if (value instanceof Map<?, ?> map) {
            for (Object nested : map.values()) {
                collectSearchTokens(nested, output);
                if (output.size() >= 2_048) break;
            }
        } else if (value instanceof Iterable<?> iterable) {
            for (Object nested : iterable) {
                collectSearchTokens(nested, output);
                if (output.size() >= 2_048) break;
            }
        }
    }

    private static void prepareQueryTokens(Connection database, List<byte[]> tokens) throws SQLException {
        try (Statement statement = database.createStatement()) {
            statement.execute("CREATE TEMP TABLE IF NOT EXISTS memory_query_tokens(token BLOB PRIMARY KEY) WITHOUT ROWID");
            statement.execute("DELETE FROM temp.memory_query_tokens");
        }
        try (PreparedStatement statement = database.prepareStatement(
            "INSERT INTO temp.memory_query_tokens(token) VALUES(?)"
        )) {
            for (byte[] token : tokens) {
                statement.setBytes(1, token);
                statement.addBatch();
            }
            statement.executeBatch();
        }
    }

    private static void clearQueryTokens(Connection database) {
        try (Statement statement = database.createStatement()) {
            statement.execute("DELETE FROM temp.memory_query_tokens");
        } catch (SQLException ignored) {
        }
    }

    private static void appendPlaceholders(StringBuilder sql, int count) {
        if (count < 1) throw failure(LocalMemoryException.Code.INVALID_ARGUMENT);
        for (int index = 0; index < count; index++) {
            if (index > 0) sql.append(',');
            sql.append('?');
        }
    }

    private static void nullableString(PreparedStatement statement, int index, String value)
        throws SQLException {
        if (value == null) statement.setNull(index, Types.VARCHAR);
        else statement.setString(index, value);
    }

    private static void nullableLong(PreparedStatement statement, int index, Long value)
        throws SQLException {
        if (value == null) statement.setNull(index, Types.BIGINT);
        else statement.setLong(index, value);
    }

    private static long requiredOccurredAt(LocalMemoryEvent event) {
        Long occurredAt = event.occurredAtEpochMillis();
        if (occurredAt == null) throw failure(LocalMemoryException.Code.EVENT_INVALID);
        return occurredAt;
    }

    private static Instant payloadOccurredAt(Map<String, Object> payload, Long storedEpochMillis) {
        Object value = payload.get("occurredAt");
        if (value == null) {
            if (storedEpochMillis != null) throw failure(LocalMemoryException.Code.INTEGRITY);
            return null;
        }
        if (!(value instanceof String text)) throw failure(LocalMemoryException.Code.INTEGRITY);
        try {
            Instant parsed = Instant.parse(text);
            if (storedEpochMillis == null || parsed.toEpochMilli() != storedEpochMillis) {
                throw failure(LocalMemoryException.Code.INTEGRITY);
            }
            return parsed;
        } catch (java.time.format.DateTimeParseException problem) {
            throw failure(LocalMemoryException.Code.INTEGRITY);
        }
    }

    private static byte[] encryptedEnvelopeBytes(
        Map<String, Object> payload,
        long recordedAt,
        Long deletedAt
    ) {
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("payload", payload);
        envelope.put("recordedAt", recordedAt);
        envelope.put("deletedAt", deletedAt);
        return CanonicalMemoryJson.encode(envelope);
    }

    private static long exactLong(Object value) {
        if (!(value instanceof Number number)
            || number.longValue() != number.doubleValue()) {
            throw failure(LocalMemoryException.Code.INTEGRITY);
        }
        return number.longValue();
    }

    private static Long nullableExactLong(Object value) {
        return value == null ? null : exactLong(value);
    }

    private static String payloadString(Map<String, Object> payload, String field) {
        Object value = payload.get(field);
        if (!(value instanceof String text) || text.isBlank()) {
            throw failure(LocalMemoryException.Code.EVENT_INVALID);
        }
        return text;
    }

    private static void requireOne(int count) {
        if (count != 1) throw failure(LocalMemoryException.Code.IO_FAILED);
    }

    private static void clearAll(List<byte[]> values) {
        if (values == null) return;
        for (byte[] value : values) clear(value);
    }

    @Override
    public Health health() {
        if (closeStarted.get()) throw failure(LocalMemoryException.Code.CLOSED);
        if (locked) return new Health(false, true, SCHEMA_VERSION, "LOCAL_MEMORY_LOCKED");
        return execute(() -> {
            requireConnection();
            return new Health(true, false, SCHEMA_VERSION, "LOCAL_MEMORY_OK");
        });
    }

    @Override
    public void close() {
        if (!closeStarted.compareAndSet(false, true)) return;
        try {
            var closure = executor.submit(() -> {
                closeConnectionQuietly();
                crypto.close();
            });
            executor.shutdown();
            closure.get(60L, TimeUnit.SECONDS);
        } catch (InterruptedException problem) {
            Thread.currentThread().interrupt();
        } catch (Exception ignored) {
            // Never close JDBC or key material from the caller while a queued
            // store operation may still own them. The queued closure remains
            // responsible for teardown even if this bounded wait expires.
            executor.shutdown();
        }
    }

    private void closeAfterFailedOpen() {
        if (!closeStarted.compareAndSet(false, true)) return;
        closeConnectionWithoutCheckpoint();
        crypto.close();
        executor.shutdownNow();
    }

    private void closeConnectionQuietly() {
        Connection current = connection;
        connection = null;
        if (current == null) return;
        if (initialized) {
            try (Statement statement = current.createStatement()) {
                statement.execute("PRAGMA wal_checkpoint(TRUNCATE)");
            } catch (SQLException ignored) {
            }
        }
        try {
            current.close();
        } catch (SQLException ignored) {
        }
    }

    private void closeConnectionWithoutCheckpoint() {
        Connection current = connection;
        connection = null;
        if (current == null) return;
        try {
            current.close();
        } catch (SQLException ignored) {
        }
    }

    private <T> T execute(Callable<T> action) {
        if (closeStarted.get()) throw failure("MEMORY_STORE_CLOSED");
        if (locked) throw failure(LocalMemoryException.Code.LOCKED);
        try {
            return executor.submit(() -> {
                if (closeStarted.get()) throw failure("MEMORY_STORE_CLOSED");
                try {
                    return action.call();
                } catch (Exception problem) {
                    LocalMemoryException mapped = mapFailure(problem);
                    if (mapped.code() == LocalMemoryException.Code.INTEGRITY) {
                        quarantineOnStoreThread();
                    }
                    throw mapped;
                }
            }).get();
        } catch (RejectedExecutionException failure) {
            throw failure("MEMORY_STORE_CLOSED");
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw failure("MEMORY_STORE_BUSY");
        } catch (ExecutionException failure) {
            Throwable cause = failure.getCause();
            throw mapFailure(cause);
        }
    }

    private static LocalMemoryException mapFailure(Throwable problem) {
        if (problem instanceof LocalMemoryException memoryFailure) return memoryFailure;
        if (problem instanceof SQLException sql) {
            return switch (sql.getErrorCode()) {
                case 5, 6 -> failure(LocalMemoryException.Code.BUSY);
                case 8 -> failure(LocalMemoryException.Code.IO_FAILED);
                case 11, 26 -> failure(LocalMemoryException.Code.INTEGRITY);
                case 13 -> failure(LocalMemoryException.Code.FULL);
                case 19 -> failure(LocalMemoryException.Code.CONFLICT);
                default -> failure(LocalMemoryException.Code.IO_FAILED);
            };
        }
        return failure(LocalMemoryException.Code.IO_FAILED);
    }

    private static LocalMemoryException normalize(RuntimeException failure) {
        return failure instanceof LocalMemoryException memoryFailure
            ? memoryFailure
            : mapKnownRuntimeFailure(failure);
    }

    private static LocalMemoryException mapKnownRuntimeFailure(RuntimeException problem) {
        String message = problem.getMessage();
        if ("MEMORY_INTEGRITY_FAILED".equals(message)) return failure(LocalMemoryException.Code.INTEGRITY);
        if ("MEMORY_CRYPTO_INVALID_INPUT".equals(message)) return failure(LocalMemoryException.Code.EVENT_INVALID);
        if ("MEMORY_VAULT_LOCKED".equals(message)) return failure(LocalMemoryException.Code.LOCKED);
        return failure(LocalMemoryException.Code.INTERNAL);
    }

    private void rollbackOrLock(Connection database) {
        try {
            database.rollback();
        } catch (SQLException problem) {
            lockBrokenConnection(database, problem);
        }
    }

    private void restoreAutoCommitOrLock(Connection database, boolean autoCommit) {
        if (locked || connection != database) return;
        try {
            database.setAutoCommit(autoCommit);
        } catch (SQLException problem) {
            lockBrokenConnection(database, problem);
        }
    }

    private void lockBrokenConnection(Connection database, SQLException cause) {
        locked = true;
        initialized = false;
        if (connection == database) {
            closeConnectionWithoutCheckpoint();
        } else {
            try {
                database.close();
            } catch (SQLException ignored) {
            }
        }
        throw new LocalMemoryException(LocalMemoryException.Code.LOCKED, cause);
    }

    private static void validateIdentifier(String value, String code) {
        if (value == null || value.isBlank() || value.getBytes(StandardCharsets.UTF_8).length > MAX_IDENTIFIER_BYTES) {
            throw failure(code);
        }
    }

    private static String canonicalUuid(String value) {
        try {
            String canonical = UUID.fromString(value).toString();
            if (!canonical.equals(value)) throw failure(LocalMemoryException.Code.LOCKED);
            return canonical;
        } catch (IllegalArgumentException problem) {
            throw new LocalMemoryException(LocalMemoryException.Code.LOCKED, problem);
        }
    }

    private static LocalMemoryException failure(String code) {
        return switch (code) {
            case "MEMORY_STORE_INVALID_INPUT" -> failure(LocalMemoryException.Code.INVALID_ARGUMENT);
            case "MEMORY_EVENT_CONFLICT" -> failure(LocalMemoryException.Code.CONFLICT);
            case "MEMORY_VAULT_LOCKED" -> failure(LocalMemoryException.Code.LOCKED);
            case "MEMORY_STORE_FULL" -> failure(LocalMemoryException.Code.FULL);
            case "MEMORY_STORE_BUSY" -> failure(LocalMemoryException.Code.BUSY);
            case "MEMORY_INTEGRITY_FAILED" -> failure(LocalMemoryException.Code.INTEGRITY);
            case "MEMORY_STORE_UNAVAILABLE" -> failure(LocalMemoryException.Code.UNAVAILABLE);
            case "MEMORY_SCHEMA_FUTURE" -> failure(LocalMemoryException.Code.FUTURE_SCHEMA);
            case "MEMORY_STORE_CLOSED" -> failure(LocalMemoryException.Code.CLOSED);
            default -> failure(LocalMemoryException.Code.IO_FAILED);
        };
    }

    private static LocalMemoryException failure(LocalMemoryException.Code code) {
        return new LocalMemoryException(code);
    }

    private static void clear(byte[] value) {
        if (value != null) Arrays.fill(value, (byte) 0);
    }

    private record StreamDescriptor(
        MemorySanitizer.Stream stream,
        String recordTable,
        String idColumn,
        String tokenTable,
        String tokenIdColumn
    ) {
    }

    private record SqlFilter(String sql, List<Object> values) {
    }

    private record DecryptedEnvelope(
        Map<String, Object> payload,
        long recordedAt,
        Long deletedAt
    ) {
    }

    private record BackupManifest(long databaseLength, String databaseSha256) {
    }

    private record ValidatedReplacement(long records, String logicalSha256) {
    }

    private record RestoreIntent(
        String restoreId,
        long createdAt,
        String oldDatabaseSha256,
        String newDatabaseSha256,
        String oldDatabaseLogicalSha256,
        String newDatabaseLogicalSha256
    ) {
    }

    private record PendingRestore(RestoreIntent intent, boolean activeNewDatabase) {
    }

    private record LogicalTable(String name, String query) {
    }

    private static final class StoredRow {
        private final String eventId;
        private final String scopeHash;
        private final String type;
        private final Long occurredAt;
        private final long recordedAt;
        private final long sourceSequence;
        private byte[] nonce;
        private byte[] ciphertext;
        private final int aadVersion;
        private final Long deletedAt;
        private byte[] conversationToken;
        private final String traceId;
        private final String turnId;
        private final String operationId;
        private final String causedByMessageId;
        private final String phase;
        private final String actor;

        private StoredRow(
            String eventId,
            String scopeHash,
            String type,
            Long occurredAt,
            long recordedAt,
            long sourceSequence,
            byte[] nonce,
            byte[] ciphertext,
            int aadVersion,
            Long deletedAt,
            byte[] conversationToken,
            String traceId,
            String turnId,
            String operationId,
            String causedByMessageId,
            String phase,
            String actor
        ) {
            this.eventId = eventId;
            this.scopeHash = scopeHash;
            this.type = type;
            this.occurredAt = occurredAt;
            this.recordedAt = recordedAt;
            this.sourceSequence = sourceSequence;
            this.nonce = nonce;
            this.ciphertext = ciphertext;
            this.aadVersion = aadVersion;
            this.deletedAt = deletedAt;
            this.conversationToken = conversationToken;
            this.traceId = traceId;
            this.turnId = turnId;
            this.operationId = operationId;
            this.causedByMessageId = causedByMessageId;
            this.phase = phase;
            this.actor = actor;
        }

        private String eventId() { return eventId; }
        private String scopeHash() { return scopeHash; }
        private String type() { return type; }
        private Long occurredAt() { return occurredAt; }
        private long recordedAt() { return recordedAt; }
        private long sourceSequence() { return sourceSequence; }
        private byte[] nonce() { return nonce; }
        private byte[] ciphertext() { return ciphertext; }
        private int aadVersion() { return aadVersion; }
        private Long deletedAt() { return deletedAt; }
        private byte[] conversationToken() { return conversationToken; }
        private String traceId() { return traceId; }
        private String turnId() { return turnId; }
        private String operationId() { return operationId; }
        private String causedByMessageId() { return causedByMessageId; }
        private String phase() { return phase; }
        private String actor() { return actor; }

        private void clearCipherSecrets() {
            clear(nonce);
            clear(ciphertext);
            nonce = null;
            ciphertext = null;
        }

        private void clearSecrets() {
            clearCipherSecrets();
            clear(conversationToken);
            conversationToken = null;
        }
    }

    private record ColumnSpec(String name, String type, boolean notNull, boolean primaryKey) {
    }

    private record IndexColumnSpec(String name, boolean descending) {
    }
}
