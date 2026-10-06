package com.femonster.memory;

import com.femonster.community.CommunityClient;
import com.femonster.model.Song;
import com.femonster.music.MusicProviderClient;
import com.femonster.music.MusicProviderRegistry;
import java.lang.reflect.Proxy;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.Set;
import java.util.UUID;

/** Behavioral service coverage: server scopes, selector forwarding, output caps, and close. */
public final class LocalAiMemoryServiceProbe {
    private LocalAiMemoryServiceProbe() {}
    public static void main(String[] args) {
        startupContracts();
        physicalVaultContract();
        FixtureStore store = new FixtureStore();
        MusicProviderRegistry music = new MusicProviderRegistry(client("a", "user-a", "old-feid", true), client("b", "user-b", "other-feid", true), client("anon", "", "", false));
        CommunityClient community = (CommunityClient) Proxy.newProxyInstance(CommunityClient.class.getClassLoader(), new Class<?>[] {CommunityClient.class}, (p, m, a) -> m.getName().equals("localMemorySubject") ? "subject-" + a[0] + "-" + ((Map<?, ?>) a[2]).get("userId") : Map.of());
        LocalAiMemoryService service = new LocalAiMemoryService(Path.of("."), music, community, store);
        require(!service.scopeFor("a").equals(service.scopeFor("b")), "ACCOUNT_SCOPE_COLLISION");
        require(service.scopeFor("anon").contains("anonymous-device"), "ANONYMOUS_SCOPE_MISSING");
        LocalAiMemoryService renamed = new LocalAiMemoryService(Path.of("."), new MusicProviderRegistry(client("a", "user-a", "renamed-feid", true)), community, store);
        require(service.scopeFor("a").equals(renamed.scopeFor("a")), "FEID_RENAME_CHANGED_SCOPE");
        service.chats("a", Set.of("chat.message"), 10, null, null, "conv-a");
        require("conv-a".equals(store.lastChatQuery.conversationId()), "CONVERSATION_NOT_IN_STORE_QUERY");
        service.operations("a", Set.of("command.succeeded"), 10, null, null, "trace-a", "op-a");
        require("trace-a".equals(store.lastOperationQuery.traceId()) && "op-a".equals(store.lastOperationQuery.operationId()), "OPERATION_FILTER_NOT_IN_STORE_QUERY");
        LocalAiMemoryService.ContextResult context = service.context("a", Set.of(), 100, null, null);
        require(context.chats().size() + context.operations().size() + context.knowledge().size() == 100, "CONTEXT_EXCEEDS_100");
        service.close();
        try { service.chats("a", Set.of("chat.message"), 1, null, null); throw new AssertionError("POST_CLOSE_QUERY_ALLOWED"); }
        catch (LocalMemoryException expected) { require(expected.code() == LocalMemoryException.Code.CLOSED, "POST_CLOSE_WRONG_ERROR"); }
        System.out.println("LocalAiMemoryServiceProbe passed: locked health, DLL resolution, FEID continuity, scopes, selectors, aggregate bound, close");
    }
    private static void physicalVaultContract() {
        Path root;
        try { root = Files.createTempDirectory("fe-memory-service-vaults-"); }
        catch (java.io.IOException failure) { throw new AssertionError("PHYSICAL_VAULT_FIXTURE_FAILED", failure); }
        Path dll = Path.of("native", "windows", "build", "fe-monster-wincrypto.dll").toAbsolutePath().normalize();
        try {
            final String[] subject = {"server-subject-a"};
            MusicProviderRegistry music = new MusicProviderRegistry(client("p", "same-user", "same-feid", true));
            CommunityClient community = (CommunityClient) Proxy.newProxyInstance(
                CommunityClient.class.getClassLoader(), new Class<?>[] {CommunityClient.class},
                (p, m, args) -> m.getName().equals("localMemorySubject") ? subject[0] : Map.of()
            );
            LocalAiMemoryService service = new LocalAiMemoryService(root, music, community, dll);
            service.append("p", List.of(new LocalAiMemoryService.EventInput(
                "61000000-0000-4000-8000-000000000001", "chat", "chat.message",
                "2026-08-29T00:00:00Z", 1L, chatPayload("61000000-0000-4000-8000-000000000001", "vault-a")
            )));
            String aScope = service.scopeFor("p");
            Path aDir = root.resolve("accounts").resolve(aScope.substring(aScope.lastIndexOf(':') + 1));
            Path backupA = service.backup("p");
            byte[] aKey = Files.readAllBytes(aDir.resolve("vault-key.dpapi"));
            service.close();

            // A present encrypted vault is not evidence that it is locked.
            // A cold health request must actually unlock the selected account.
            service = new LocalAiMemoryService(root, music, community, dll);
            Method scopedHealth = LocalAiMemoryService.class.getMethod("health", String.class);
            LocalMemoryStore.Health reopened = (LocalMemoryStore.Health) scopedHealth.invoke(service, "p");
            require(reopened.available() && !reopened.locked(), "COLD_HEALTH_DID_NOT_OPEN_ACCOUNT");
            require(service.chats("p", Set.of("chat.message"), 10, null, null).records().size() == 1,
                "COLD_HEALTH_LOST_CHAT");
            subject[0] = "";
            LocalMemoryStore.Health unbound = (LocalMemoryStore.Health) scopedHealth.invoke(service, "p");
            require(!unbound.available() && unbound.locked(), "HEALTH_LEAKED_PREVIOUS_ACCOUNT_STATUS");
            subject[0] = "server-subject-a";
            service.close();

            // Same provider and platform account, but a different immutable server subject.
            subject[0] = "server-subject-b";
            service = new LocalAiMemoryService(root, music, community, dll);
            service.append("p", List.of(new LocalAiMemoryService.EventInput(
                "62000000-0000-4000-8000-000000000001", "chat", "chat.message",
                "2026-08-29T00:00:00Z", 1L, chatPayload("62000000-0000-4000-8000-000000000001", "vault-b")
            )));
            String bScope = service.scopeFor("p");
            Path bDir = root.resolve("accounts").resolve(bScope.substring(bScope.lastIndexOf(':') + 1));
            Path backupB = service.backup("p");
            require(!aScope.equals(bScope) && !aDir.equals(bDir), "PHYSICAL_SCOPE_COLLISION");
            require(Files.isRegularFile(aDir.resolve("memory.db")) && Files.isRegularFile(aDir.resolve("vault-key.dpapi")), "VAULT_A_MISSING");
            require(Files.isRegularFile(bDir.resolve("memory.db")) && Files.isRegularFile(bDir.resolve("vault-key.dpapi")), "VAULT_B_MISSING");
            require(!Arrays.equals(aKey, Files.readAllBytes(bDir.resolve("vault-key.dpapi"))), "VAULT_KEYS_SHARED");
            require(!backupA.getParent().equals(backupB.getParent()) && Files.isRegularFile(backupA) && Files.isRegularFile(backupB), "BACKUP_DIRECTORIES_SHARED");
            byte[] bDbBefore = Files.readAllBytes(bDir.resolve("memory.db"));
            Path staged = service.newRestoreUpload("p");
            Files.copy(backupA, staged, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            try {
                service.restore("p", staged);
                throw new AssertionError("CROSS_VAULT_RESTORE_ACCEPTED");
            } catch (LocalMemoryException expected) {
                require(expected.code() == LocalMemoryException.Code.INTEGRITY
                    || expected.code() == LocalMemoryException.Code.RESTORE_INVALID
                    || expected.code() == LocalMemoryException.Code.IO_FAILED, "CROSS_VAULT_RESTORE_WRONG_ERROR");
            }
            require(Arrays.equals(bDbBefore, Files.readAllBytes(bDir.resolve("memory.db"))), "CROSS_VAULT_RESTORE_MUTATED_B");
            service.close();
            Path renamed = aDir.resolve("memory.db.renamed");
            Files.move(aDir.resolve("memory.db"), renamed);
            Files.move(renamed, aDir.resolve("memory.db"));
        } catch (Exception failure) {
            throw new AssertionError("PHYSICAL_VAULT_CONTRACT_FAILED", failure);
        } finally {
            try (var files = Files.walk(root)) { for (Path file : files.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(file); }
            catch (java.io.IOException ignored) { }
        }
    }
    private static Map<String, Object> chatPayload(String id, String text) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("messageId", id); payload.put("conversationId", "c"); payload.put("traceId", "t");
        payload.put("turnId", "u"); payload.put("role", "user"); payload.put("text", text);
        payload.put("source", "app"); payload.put("modelOrigin", "local"); payload.put("timeAccuracy", "exact");
        payload.put("occurredAt", "2026-08-29T00:00:00Z"); payload.put("sourceSequence", 1L);
        return payload;
    }
    private static void startupContracts() {
        Path root;
        try { root = Files.createTempDirectory("fe-memory-service-startup-"); }
        catch (java.io.IOException failure) { throw new AssertionError("STARTUP_FIXTURE_FAILED", failure); }
        try {
            Path sourceDll = Path.of("native", "windows", "build", "fe-monster-wincrypto.dll").toAbsolutePath().normalize();
            require(Files.isRegularFile(sourceDll), "SOURCE_DPAPI_DLL_MISSING");
            Method resolve = LocalAiMemoryService.class.getDeclaredMethod("resolveDpapiDll", Path.class);
            resolve.setAccessible(true);
            require(sourceDll.equals(resolve.invoke(null, sourceDll)), "SOURCE_DLL_NOT_RESOLVED");
            Path installed = root.resolve("installed").resolve("native").resolve("windows").resolve("build").resolve("fe-monster-wincrypto.dll");
            Files.createDirectories(installed.getParent()); Files.write(installed, new byte[] { 1 });
            require(installed.equals(resolve.invoke(null, root.resolve("installed").resolve("launcher.exe"))), "INSTALLED_DLL_NOT_RESOLVED");

            Path lockedVault = root.resolve("locked-vault"); Files.createDirectories(lockedVault); Files.writeString(lockedVault.resolve("vault-meta.json"), "{}");
            MusicProviderRegistry music = new MusicProviderRegistry(client("a", "user-a", "any-feid", true));
            CommunityClient community = (CommunityClient) Proxy.newProxyInstance(CommunityClient.class.getClassLoader(), new Class<?>[] {CommunityClient.class}, (p, m, a) -> m.getName().equals("localMemorySubject") ? "subject" : Map.of());
            try (LocalAiMemoryService locked = new LocalAiMemoryService(lockedVault, music, community, sourceDll)) {
                require(!locked.health().available() && locked.health().locked() && "LOCAL_MEMORY_LOCKED".equals(locked.health().code()), "LOCKED_VAULT_HEALTH_INACCURATE");
            }
            Path nested = root.resolve("nested").resolve("accounts").resolve("a".repeat(64));
            Files.createDirectories(nested); Files.writeString(nested.resolve("vault-meta.json"), "{}");
            try (LocalAiMemoryService locked = new LocalAiMemoryService(root.resolve("nested"), music, community, sourceDll)) {
                require(!locked.health().available() && locked.health().locked() && "LOCAL_MEMORY_LOCKED".equals(locked.health().code()), "NESTED_LOCKED_VAULT_HEALTH_INACCURATE");
            }
        } catch (ReflectiveOperationException | java.io.IOException failure) {
            throw new AssertionError("STARTUP_CONTRACT_FAILED", failure);
        } finally {
            try (var files = Files.walk(root)) { for (Path file : files.sorted(java.util.Comparator.reverseOrder()).toList()) Files.deleteIfExists(file); }
            catch (java.io.IOException ignored) { }
        }
    }
    private static MusicProviderClient client(String id, String userId, String feId, boolean loggedIn) { return new MusicProviderClient() {
        public String id() { return id; } public String label() { return id; } public String baseUrl() { return ""; } public Map<String,Object> serviceStatus() { return Map.of(); }
        public Map<String,Object> accountPayload() { return Map.of("loggedIn", loggedIn, "account", Map.of("userId", userId, "feId", feId)); } public void rememberBrowserSession(Map<String,String> cookies) {} public Map<String,Object> search(String q,int p,int l) { return Map.of(); }
        public String songUrl(String i,String q) { return ""; } public Map<String,Object> songUrlPayload(String i,String q) { return Map.of(); } public Map<String,Object> lyricPayload(String id) { return Map.of(); } public Map<String,Object> userPlaylistsPayload() { return Map.of(); } public Map<String,Object> recommendedPlaylistsPayload(int l) { return Map.of(); } public Map<String,Object> playlistTracksPayload(String i,int l) { return Map.of(); } public Map<String,Object> addSongToPlaylistPayload(String i,Song s) { return Map.of(); } public Map<String,Object> commentsPayload(String i,int l) { return Map.of(); }
    }; }
    private static final class FixtureStore implements LocalMemoryStore {
        Query lastChatQuery, lastOperationQuery; final List<StoredEvent> rows = new ArrayList<>(); FixtureStore() { for (int i=0;i<100;i++) rows.add(chat(i)); }
        public List<AppendResult> appendBatch(List<LocalMemoryEvent> x){return List.of();} public List<AppendResult> appendChats(List<LocalMemoryEvent>x){return List.of();} public List<AppendResult> appendOperations(List<LocalMemoryEvent>x){return List.of();} public List<AppendResult> appendKnowledge(List<LocalMemoryEvent>x){return List.of();}
        public boolean appendTrustedPersonalization(String scope, Map<String,Object> projection){return true;} public Map<String,Object> trustedPersonalization(String scope){return Map.of();} public boolean forgetTrustedPersonalization(String scope){return true;}
        public Page queryChats(Query q){lastChatQuery=q;return new Page(rows,null);} public Page queryOperations(Query q){lastOperationQuery=q;return new Page(rows.stream().map(LocalAiMemoryServiceProbe::operation).toList(),null);} public Page queryKnowledge(Query q){return new Page(rows.stream().map(LocalAiMemoryServiceProbe::knowledge).toList(),null);} public TraceResult queryTrace(TraceQuery q){return new TraceResult(List.of(),List.of());} public ForgetResult forgetChats(ForgetRequest q){return new ForgetResult(0);} public ForgetResult forgetOperations(ForgetRequest q){return new ForgetResult(0);} public ForgetResult forgetKnowledge(ForgetRequest q){return new ForgetResult(0);} public BackupResult backup(Path q){return new BackupResult(1,"0".repeat(64));} public RestoreResult restore(Path q){return new RestoreResult(0);} public Health health(){return new Health(true,false,1,"LOCAL_MEMORY_OK");} public void close(){}
    }
    private static LocalMemoryStore.StoredEvent chat(int i){String id=UUID.nameUUIDFromBytes(("c"+i).getBytes()).toString();Instant at=Instant.ofEpochMilli(1000L+i);Map<String,Object>p=new LinkedHashMap<>();p.put("messageId",id);p.put("conversationId","conv");p.put("traceId","trace");p.put("turnId","turn");p.put("role","user");p.put("text","hello");p.put("source","app");p.put("modelOrigin","local");p.put("timeAccuracy","exact");p.put("occurredAt",at.toString());p.put("sourceSequence",(long)i);return new LocalMemoryStore.StoredEvent(new LocalMemoryEvent(id,MemorySanitizer.Stream.CHAT,"scope","chat.message",at,i,p),at);}
    private static LocalMemoryStore.StoredEvent operation(LocalMemoryStore.StoredEvent b){LocalMemoryEvent e=b.event();Map<String,Object>p=Map.of("operationId","op","traceId","trace","turnId","turn","actor","app","phase","done","status","ok","commandId","x","commandManifestRevision","v1","occurredAt",e.occurredAt().toString(),"sourceSequence",e.sourceSequence());return new LocalMemoryStore.StoredEvent(new LocalMemoryEvent(UUID.randomUUID().toString(),MemorySanitizer.Stream.OPERATION,"scope","command.succeeded",e.occurredAt(),e.sourceSequence(),p),b.recordedAt());}
    private static LocalMemoryStore.StoredEvent knowledge(LocalMemoryStore.StoredEvent b){LocalMemoryEvent e=b.event();Map<String,Object>p=Map.of("occurredAt",e.occurredAt().toString(),"sourceSequence",e.sourceSequence(),"source","app","entityId","x","title","x","value","x");return new LocalMemoryStore.StoredEvent(new LocalMemoryEvent(UUID.randomUUID().toString(),MemorySanitizer.Stream.KNOWLEDGE,"scope","user.fact",e.occurredAt(),e.sourceSequence(),p),b.recordedAt());}
    private static void require(boolean value,String message){if(!value)throw new AssertionError(message);}
}
