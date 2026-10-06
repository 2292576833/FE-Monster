package com.femonster.core;

import com.femonster.community.CommunityClient;
import com.femonster.memory.*;
import com.femonster.model.Song;
import com.femonster.music.*;
import java.lang.reflect.Proxy;
import java.nio.file.*;
import java.security.SecureRandom;
import java.time.*;
import java.util.*;

/** Real filesystem migration checks: encrypted commit first, no retained plaintext, and trusted-only offline reads. */
public final class PersonalizationMigrationProbe {
  private PersonalizationMigrationProbe() {}
  public static void main(String[] a) throws Exception {
    Path root=Files.createTempDirectory("fe-personalization-migration-");
    try {
      success(root.resolve("success")); failureRetains(root.resolve("failure")); readbackMismatch(root.resolve("readback-mismatch")); freshAndForget(root.resolve("fresh-lifecycle"));
      System.out.println("PersonalizationMigrationProbe passed: commit-before-delete, exact readback, fresh-start, forget no resurrection");
    } finally { delete(root); }
  }
  private static void success(Path dir) throws Exception {
    String scope="legacy-scope"; seed(dir,scope);
    try (LocalMemoryStore store=openActualStore(dir.resolve("vault"))) {
      LocalAiMemoryService encrypted=service(store); PetPersonalizationService pet=pet(dir,encrypted);
      Map<String,Object> response=pet.projection("p","P",Map.of("loggedIn",true));
      require(Boolean.TRUE.equals(response.get("available")),"TRUSTED_OFFLINE_READ_MISSING");
      require(!contains(dir,"legacy-marker"),"MIGRATED_PLAINTEXT_RETAINED");
      Map<String,Object> forged=new LinkedHashMap<>(); forged.put("occurredAt","2026-08-28T00:00:00Z"); forged.put("sourceSequence",1L); forged.put("source","browser"); forged.put("entityId","pet.personalization.internal.v1"); forged.put("title","forged"); forged.put("value","{\"schemaVersion\":1}");
      try {
        store.appendKnowledge(List.of(new LocalMemoryEvent("70000000-0000-4000-8000-000000000001",MemorySanitizer.Stream.KNOWLEDGE,encrypted.scopeFor("p"),"user.fact",java.time.Instant.parse("2026-08-28T00:00:00Z"),1L,forged)));
        throw new AssertionError("RESERVED_PROVENANCE_ACCEPTED");
      } catch (LocalMemoryException expected) {
        require(expected.code() == LocalMemoryException.Code.INVALID_ARGUMENT, "RESERVED_PROVENANCE_WRONG_ERROR");
      }
      require(contains(encrypted.personalization("p").toString(),"legacy-marker"),"GENERIC_FACT_TRUSTED");
    }
  }
  private static void failureRetains(Path dir) throws Exception {
    seed(dir,"legacy-scope"); PetPersonalizationService pet=pet(dir,new Store(false)); Map<String,Object> response=pet.projection("p","P",Map.of("loggedIn",true));
    require(contains(dir,"legacy-marker"),"FAILED_MIGRATION_DELETED_SOURCE");
    require(!Boolean.TRUE.equals(response.get("available")),"FAILED_MIGRATION_USED_PLAINTEXT_FALLBACK");
  }
  private static void readbackMismatch(Path dir) throws Exception {
    seed(dir,"legacy-scope"); PetPersonalizationService pet=pet(dir,new Store(true,true)); pet.projection("p","P",Map.of("loggedIn",true));
    require(contains(dir,"legacy-marker"),"MISMATCHED_READBACK_DELETED_SOURCE");
  }
  private static void freshAndForget(Path dir) throws Exception {
    final boolean[] online={true}; final int[] generation={1};
    MusicProviderClient client=new MusicProviderClient(){
      public String id(){return "p";} public String label(){return "P";} public String baseUrl(){return "";} public Map<String,Object> serviceStatus(){return Map.of();}
      public Map<String,Object> accountPayload(){return Map.of("loggedIn",true,"account",Map.of("userId","fresh-user"));} public void rememberBrowserSession(Map<String,String>x){} public Map<String,Object> search(String x,int y,int z){return Map.of();}
      public String songUrl(String x,String y){return "";} public Map<String,Object> songUrlPayload(String x,String y){return Map.of();} public Map<String,Object> lyricPayload(String x){return Map.of();} public Map<String,Object> userPlaylistsPayload(){return Map.of();} public Map<String,Object> recommendedPlaylistsPayload(int x){return Map.of();} public Map<String,Object> playlistTracksPayload(String x,int y){return Map.of();} public Map<String,Object> addSongToPlaylistPayload(String x,Song y){return Map.of();} public Map<String,Object> commentsPayload(String x,int y){return Map.of();}
    };
    CommunityClient community=(CommunityClient)Proxy.newProxyInstance(CommunityClient.class.getClassLoader(),new Class[]{CommunityClient.class},(p,m,x)->m.getName().equals("localMemorySubject")?"fresh-subject":Map.of());
    Path dll=Path.of("native","windows","build","fe-monster-wincrypto.dll").toAbsolutePath().normalize();
    LocalAiMemoryService encrypted=new LocalAiMemoryService(dir,new MusicProviderRegistry(client),community,dll);
    PetPersonalizationService pet=new PetPersonalizationService(dir,new PetPersonalizationService.AccountSource(){
      public String scope(String p,String l,Map<String,Object>a){return "fresh-scope";}
      public Map<String,Object> memories(String p,String l,Map<String,Object>a)throws Exception{if(!online[0])throw new java.io.IOException("offline"); return Map.of("ok",true,"memories",List.of(Map.of("category","music_preference","value",generation[0]==1?"fresh-marker":"recreated-marker","source","explicit","confidence",1.0,"expiresAt",Clock.systemUTC().millis()+3600000)));}
      public Map<String,Object> habits(String p,String l,Map<String,Object>a)throws Exception{if(!online[0])throw new java.io.IOException("offline"); return Map.of("ok",true,"habits",Map.of());}
    },Clock.systemUTC(),false,encrypted);
    Map<String,Object> first=pet.projection("p","P",Map.of("loggedIn",true)); require(Boolean.TRUE.equals(first.get("available")),"FRESH_REFRESH_UNAVAILABLE"); require(contains(encrypted.personalization("p").toString(),"fresh-marker"),"FRESH_REFRESH_NOT_ENCRYPTED");
    online[0]=false; pet.invalidate("p","P",Map.of("loggedIn",true)); Map<String,Object> offline=pet.projection("p","P",Map.of("loggedIn",true)); require(!Boolean.TRUE.equals(offline.get("available"))&&!contains(offline.toString(),"fresh-marker"),"FORGOTTEN_TRUSTED_MEMORY_RESURRECTED");
    online[0]=true; generation[0]=2; Map<String,Object> recreated=pet.projection("p","P",Map.of("loggedIn",true)); require(contains(recreated.toString(),"recreated-marker"),"ONLINE_RECREATE_MISSING"); require(contains(encrypted.personalization("p").toString(),"recreated-marker"),"ONLINE_RECREATE_NOT_ENCRYPTED"); encrypted.close();
  }
  private static void seed(Path dir,String scope) throws Exception {
    PetPersonalizationSnapshot snapshot=new PetPersonalizationSnapshot(dir,new PetPersonalizationSnapshot.Source(){
      public Map<String,Object> fetchMemories(String s){return Map.of("ok",true,"memories",List.of(Map.of("category","music_preference","value","legacy-marker","source","explicit","confidence",1.0,"expiresAt",Clock.systemUTC().millis()+3600000)));}
      public Map<String,Object> fetchHabits(String s){return Map.of("ok",true,"habits",Map.of());}
    },Clock.systemUTC(),true); snapshot.refresh(scope);
  }
  private static PetPersonalizationService pet(Path dir,Store store){ return pet(dir,service(store)); }
  private static PetPersonalizationService pet(Path dir,LocalAiMemoryService encrypted){ return new PetPersonalizationService(dir,new PetPersonalizationService.AccountSource(){
    public String scope(String p,String l,Map<String,Object>a){return "legacy-scope";} public Map<String,Object> memories(String p,String l,Map<String,Object>a)throws Exception{throw new java.io.IOException();} public Map<String,Object> habits(String p,String l,Map<String,Object>a)throws Exception{throw new java.io.IOException();}
  },Clock.systemUTC(),false,encrypted); }
  private static LocalMemoryStore openActualStore(Path directory) { MemoryVaultKeyManager manager=new MemoryVaultKeyManager(directory,new KeyProtector(){public byte[] protect(byte[] value,byte[] entropy){return value.clone();}public byte[] unprotect(byte[] value,byte[] entropy){return value.clone();}},new SecureRandom()); try(MemoryVaultKeyManager.KeyLease lease=manager.openOrCreate()){return SqliteEncryptedMemoryStore.open(directory,lease);} }
  private static LocalAiMemoryService service(LocalMemoryStore store){ MusicProviderClient c=new MusicProviderClient(){
    public String id(){return "p";} public String label(){return "P";} public String baseUrl(){return "";} public Map<String,Object> serviceStatus(){return Map.of();} public Map<String,Object> accountPayload(){return Map.of("loggedIn",true,"account",Map.of("userId","u"));} public void rememberBrowserSession(Map<String,String>x){} public Map<String,Object> search(String x,int y,int z){return Map.of();} public String songUrl(String x,String y){return "";} public Map<String,Object> songUrlPayload(String x,String y){return Map.of();} public Map<String,Object> lyricPayload(String x){return Map.of();} public Map<String,Object> userPlaylistsPayload(){return Map.of();} public Map<String,Object> recommendedPlaylistsPayload(int x){return Map.of();} public Map<String,Object> playlistTracksPayload(String x,int y){return Map.of();} public Map<String,Object> addSongToPlaylistPayload(String x,Song y){return Map.of();} public Map<String,Object> commentsPayload(String x,int y){return Map.of();}
  }; CommunityClient community=(CommunityClient)Proxy.newProxyInstance(CommunityClient.class.getClassLoader(),new Class[]{CommunityClient.class},(p,m,x)->m.getName().equals("localMemorySubject")?"subject":Map.of()); return new LocalAiMemoryService(Path.of("."),new MusicProviderRegistry(c),community,store); }
  private static final class Store implements LocalMemoryStore { final boolean allow; final boolean mismatch; Map<String,Object> trusted; final Map<String,Object> generic=new HashMap<>(); Store(boolean allow){this(allow,false);} Store(boolean allow,boolean mismatch){this.allow=allow;this.mismatch=mismatch;} public boolean appendTrustedPersonalization(String s,Map<String,Object>p){if(!allow)throw new LocalMemoryException(LocalMemoryException.Code.IO_FAILED);trusted=mismatch?Map.of("schemaVersion",1,"capturedAt",0,"memories",List.of(),"habits",Map.of()):new LinkedHashMap<>(p);return true;} public Map<String,Object> trustedPersonalization(String s){return trusted==null?Map.of():trusted;} public boolean forgetTrustedPersonalization(String s){trusted=null;return true;} public Health health(){return new Health(true,false,1,"LOCAL_MEMORY_OK");} public void close(){} public List<AppendResult> appendBatch(List<LocalMemoryEvent>x){return List.of();} public List<AppendResult> appendChats(List<LocalMemoryEvent>x){return List.of();} public List<AppendResult> appendOperations(List<LocalMemoryEvent>x){return List.of();} public List<AppendResult> appendKnowledge(List<LocalMemoryEvent>x){return List.of();} public Page queryChats(Query q){return new Page(List.of(),null);} public Page queryOperations(Query q){return new Page(List.of(),null);} public Page queryKnowledge(Query q){return new Page(List.of(),null);} public TraceResult queryTrace(TraceQuery q){return new TraceResult(List.of(),List.of());} public ForgetResult forgetChats(ForgetRequest q){return new ForgetResult(0);} public ForgetResult forgetOperations(ForgetRequest q){return new ForgetResult(0);} public ForgetResult forgetKnowledge(ForgetRequest q){return new ForgetResult(0);} public BackupResult backup(Path q){return new BackupResult(1,"0".repeat(64));} public RestoreResult restore(Path q){return new RestoreResult(0);} }
  private static boolean contains(Path root,String text)throws Exception{try(var files=Files.walk(root)){for(Path p:files.filter(Files::isRegularFile).toList())if(new String(Files.readAllBytes(p),java.nio.charset.StandardCharsets.UTF_8).contains(text))return true;}return false;} private static boolean contains(String value,String text){return value.contains(text);} private static void delete(Path root)throws Exception{try(var files=Files.walk(root)){for(Path p:files.sorted(Comparator.reverseOrder()).toList())Files.deleteIfExists(p);}} private static void require(boolean v,String m){if(!v)throw new AssertionError(m);}
}
