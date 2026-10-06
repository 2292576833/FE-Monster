# Audio source service evidence

Scope: new `music/sources/` service and process adapters, `AudioSourceHttpModule`, and isolated probes. No accounts, effects, OBR, upmix, installed-client files, git staging, or commits were changed by this task.

## Executed checks

Run from the repository root:

```text
node scripts/check-audio-source-service.mjs
```

The driver compiles the listed service/module/probe sources with `javac -encoding UTF-8 --release 17`, using `out/fe-monster-java.jar` only for unchanged dependencies, into an OS temporary directory. Each probe runs with those fresh classes first on the classpath. All storage directories are temporary; the driver removes only its own created temporary directory. The actual runtime probe reads the repository's installed QuickJS runtime.

Observed GREEN output (2026-09-11):

```text
AudioSourceServiceProbe: 26 checks passed
LxProcessRunnerProbe: environment, timeout, process disposal, stdout limit, redaction passed
AudioSourceHttpProbe: 14 loopback HTTP checks passed
AudioSourceMediaRelayProbe: binary GET, HEAD, range, header whitelist, ticket redaction and expiration passed
AudioSourceQuickJsProbe: actual isolated QuickJS initialization, host API absence and sanitized script failure passed
```

Initial RED: standalone driver failed compilation because `AudioSourceService.java` did not exist. Further regression RED: duplicate JSON fields were accepted by existing `SimpleJson.parseObjectStrict`; the new HTTP module now independently rejects duplicate keys, including escaped spellings, before strict JSON parsing. Actual runtime probe initially exposed Windows `Path`/`PATH` lookup differences; discovery now uses `System.getenv("PATH")`.

Coverage includes built-in supplier, selection and import persistence/reload, remove-to-builtin, explicit test of an unselected id, 20-script and 512 KiB limits, consent/unknown-fields/hostname rejection, no script text in payload, identity-only sourceRef mapping for WY/TX/KG, QQ UI `128` quality mapping, unsupported qualities/providers, Qishui built-in preservation, opaque media URL, Node environment clearing, timeout and confirmed dead process PID, 2 MiB output limit, error redaction, same-origin HTTP, 768 KiB body and content-type limits, duplicate keys, forged Host, foreign Origin, valid native no-Origin ticket, guessed and evicted tickets, binary streaming, range/HEAD, upstream header whitelist, and 30-minute ticket expiry with a fixture clock.

## Integration interfaces

```java
AudioSourceService(ProjectPaths paths, MusicApiConfigService musicApis) throws IOException
Map<String,Object> payload()
Map<String,Object> importScript(Map<String,Object> input)
Map<String,Object> select(String id)
Map<String,Object> remove(String id)
PlaybackSource resolve(String provider, Song song, String quality, Supplier<PlaybackSource> builtin)
Map<String,Object> test(String id, String provider, Song song, String quality, Supplier<PlaybackSource> builtin)
void setLocalPort(int port)
void serveMedia(HttpExchange exchange) throws IOException
void close()

AudioSourceHttpModule(AudioSourceService sources, MusicProviderRegistry music)
boolean tryHandle(HttpExchange exchange) throws IOException
```

Root must set the listening port before any custom playback resolution. Registry delegates selected playback resolution to `sources::resolve`. HTTP test invokes `music.get(provider).resolvePlayback(song, quality)` as the built-in supplier, avoiding recursive registry resolution.

## Runtime, storage, and limitations

User imports are copied only into `dataDir/audio-sources/sources.json`. A single atomic replacement commits scripts, allowed hosts, capabilities, and selection together. A failed write does not change live state. Original user script files are never opened or deleted. Symlinked storage directory/settings are refused. Corrupt on-disk settings fail closed with a generic storage error rather than silently resetting imports.

The fixed runtime command is `native/audio-sources/lx-runner.mjs`; JSON stdin carries only script, allowlist, and a whitelisted song request. Java clears inherited environment except Windows `SystemRoot` and fixed `LANG`; no Node preload or proxy environment survives. At most two concurrent script processes, 18-second outer deadline, and 2 MiB stdout. Runtime-ready checks Node, runner, installed QuickJS/IP dependency manifests, and the QuickJS WASM artifact; this is dependency availability, not proof an external service works.

Custom status is `initialized-unverified`. Tests always return `playable:false`; `resolved:true` means only that the resolver returned an allowed URL. Neither Java fixture success nor QuickJS initialization proves a real third-party script or song is playable. The standalone real QuickJS probe executes self-authored scripts for initialization, host API absence, and error handling without making external HTTP requests; resolver success and media bytes are self-authored protocol fixtures, not commercial music providers.

WY uses native `sourceRef.providerSongId/songId/id` then Song id as `songmid`. TX uses `mediaMid/media_mid/songmid/mid`, sets `strMediaMid`, and includes only the numeric-id field from `qqId/songId`. KG uses hash/album IDs and honors immutable compound `kg|hash|audio|album` identity; hashless KG identities are explicitly unsupported by this subset. No cookie/header/account/ref credential fields are forwarded. Only supported actions/types actually declared by the runtime are exposed.

Resolved media hostnames must also be explicitly present in the user's original allowlist. A custom playback result exposes only a random 256-bit local ticket. Tickets cap at 128, expire after 30 minutes, and retain no script. The fixed media relay handles public DNS pinning and HTTPS; Java supplies the fixed URL and original allowlist, streams only a small header whitelist and audio bytes, and kills children on disconnect/close/deadline. At most four media processes, one-hour deadline, 512 MiB Java stream ceiling. Built-in playback remains unchanged.

## Separate live built-in availability check

Executed 2026-09-11 against the isolated backend `http://127.0.0.1:58930`, PID 24028, using only `output/audio-sources-verification/data`. All four plugin listeners (3010–3013) were verified as child processes of that isolated PID before direct plugin diagnostics. The user's port 3000 service and data were not touched. No account was logged in.

The normal activation endpoint `/api/app/interactive/activate` successfully started all four providers; `/api/music-apis/status` reported `reachable:true,status:ready` for each. These are process/service health checks, not music availability guarantees.

Live probe command:

```text
node src/test/java/com/femonster/music/sources/BuiltinAvailabilityProbe.mjs
```

This opt-in live probe uses the isolated backend, searches the public keyword 小星星 with a maximum of five results, resolves standard-quality audio, requests only the first 4096 bytes, validates an audio header, and immediately cancels the response stream. It does not print/persist URLs, tokens, song identities, or full responses. It does not play audio through speakers.

| Provider | Search results | Resolution attempts | Verified media bytes | Observation |
| --- | ---: | ---: | ---: | --- |
| Netease | 5 | 1 | 4096 | HTTP 206, `audio/mpeg`, MP3 signature confirmed |
| QQ | 5 | 4 | 4096 | First three unavailable; fourth returned HTTP 206, `audio/mpeg`, MP3 signature confirmed |
| Kugou | 5 | 5 | 0 | Every sampled resolution returned HTTP 403 |
| Qishui | 0 | 0 | 0 | Empty unauthenticated local metadata search |

Kugou diagnosis: the isolated plugin's direct response identified `reason:account-entitlement-required`, `type:api`, `code:403`, with the fixed message “Kugou audio source is unavailable for this account”. Its bundled resolver tries its two normal upstream URL resolvers and emits this restriction when neither produces an allowed matching URL. This check did not bypass account restrictions and does not establish that every Kugou track fails; all five sampled tracks did. The Java API currently reduces this detailed restriction to a generic HTTP 403 message.

Qishui diagnosis: the isolated plugin explicitly returned `source:local-metadata-filter`, `authorizationRequiredForPlayback:true`, and `limitedToImportedMetadata:true`. Its existing unauthenticated search only filters imported metadata; isolated storage contains none. Playback requires an authorized official OpenAPI token. The Java search adapter currently discards these limitation flags when rebuilding the search response.

Minimal proposed follow-up (not implemented in this diagnosis): preserve the provider's structured restriction reason and Qishui search limitation flags through the Java adapter so the UI can explain missing authorization rather than show only HTTP 403 or an unexplained empty list. Neither limitation requires changing the new source service. Default built-in Netease and QQ both delivered real audio bytes without login in this run; this does not guarantee every track, region, or quality is available.
