# Audio source runtime implementation

Verified on 2026-09-11 with Node.js 24.17.0 on Windows. Files are source workspace changes only; no installed client was overwritten and no files were committed.

## Entry points

### Resolution diagnostics and existing-host repair (2026-09-18 follow-up)

The public v6 source matching the screenshot passes `follow_max:5` on every request. The strict option parser previously rejected this before transport. The runtime now accepts integer hints from 0 through 10 without forwarding them or following any redirect; invalid hints still fail before DNS. The original source resolves wy/tx/kg against fully mocked success responses inside production QuickJS. These are compatibility tests, not external playback.

Failed API/media permissions now propagate only validated hostname suggestions through runtime, subprocess, Java test response and UI. Transport failures and source-promise rejection have separate fixed codes; raw guest/server error text, URL paths and queries remain redacted. Initialization and resolution failures are separated, and a later successful response clears a recovered optional-request failure rather than misclassifying a subsequent song rejection. A fresh regression for this independent-review finding was observed failing before the fix.

`POST /api/audio-sources/<uuid>/hosts` accepts only `{allowedHosts,consent:true}` through the existing same-origin JSON guard. It atomically changes the host list while preserving ID, script, capabilities and selection; it neither runs the script nor imports another copy. The per-source UI pre-fills only previously approved hosts, shows missing hosts as text, requires manual editing and fresh consent, and retains the draft on save failure. Browser fixtures verify stale/closed responses, retries, cancellation, double submits, no selection/import side effects, and 320–1440 px layouts.

Verification for this follow-up: 66 native tests; 94 Java service checks plus subprocess, HTTP, relay and actual QuickJS probes; UI, URL UI, isolated browser, integration and packaging checks passed. Rebuilt workspace backend artifacts were published without replacing the running locked stable jar. No installer was rebuilt or user source configuration changed. The source-manager JS/CSS cache tokens and hashes match; whole-workspace fingerprint regeneration remains blocked by an unrelated concurrent `web/app.js` content change under its existing cache token.

Live evidence remains negative: Sixyin initialization returned HTTP 200; the saved Netease track and three additional known-ID samples returned no media URL (row codes -110 or 404). The actual outgoing AES-128-ECB envelope, endpoint path, digest, IDs and bitrate were checked without using account cookies. The matching v6 source initialized with HTTP 200, but its song endpoint returned HTTP 502. No media was downloaded or played. These observations do not prove universal source failure or identify the exact upstream reason; no same-track comparison in the original LX app is yet available. They explicitly do not satisfy a claim that these third-party sources are now playable.

### URL import extension (2026-09-18)

The trusted CLI also accepts `{op:"download",url}`. `download.mjs` requires an HTTPS `.js` URL and reuses the existing all-answer public-IP check and DNS-pinned HTTPS transport. It sends one GET with no ambient account headers, rejects redirects/compression/non-200 responses, caps the body at 512 KiB, validates UTF-8 without replacement, and bounds DNS/connection time. The URL query and script text are never returned by the public preview API or diagnostics.

`POST /api/audio-sources/preview-url` takes `{url}`. Java inspects the downloaded bytes in QuickJS with an empty host allowlist, then stores at most three previews in memory for ten minutes. It returns a token and sanitized name/version/author, byte count, download hostname and platform/quality capabilities when initialized. A valid first network request with no granted hosts yields fixed code `INIT_NETWORK_REQUIRED` without DNS or HTTP; Java stages an `awaiting-network-consent` preview with `initializationRequired:true` and hostname-only `requiredHosts`. No capabilities are claimed yet. Local file import remains available under its existing consent flow.

`POST /api/audio-sources/import-preview` takes `{token,allowedHosts,consent:true,apply:boolean}`. It imports the exact staged script with the approved runtime host list, without downloading or evaluating a replacement. Pending previews require the explicit allowlist to cover their required hosts, then initialize the cached script under that allowlist. A single atomic settings write saves both the source and optional selected ID; failed runtime/persistence checks leave the prior list/selection and retryable preview intact. Successful tokens are consumed. `POST /import` also accepts optional `apply`; omission keeps its previous import-only behavior. Download and preview hostnames are not implicitly granted to the guest. `GET /api/audio-sources` additionally returns `selectedSource` for catalog integration.

Verification: the new tests were observed failing before implementation. The complete native suite now passes 34 tests; Java service probe passes 50 checks plus subprocess/environment, same-origin HTTP/preview replay, media relay and actual QuickJS probes. `check-audio-source-url-ui.mjs` covers consent, cancellation and stale results/errors, atomic-failure UI state, selection/browse callbacks, background refresh and late local file reads; existing manager and packaging checks pass. All fixtures are self-authored or mocked transports; these results do not claim third-party-script compatibility or external playback. No dependencies were added and no installer or installed client was modified for this extension.

`check-audio-source-manager-browser.mjs` passes in an isolated headless browser against self-authored loopback HTTP fixtures. It covers URL preview/cancel, consent, persistence-failure retry, atomic apply, retained local-file import-only behavior, inert metadata, and the browse callback receiving the selected source after the manager has closed and restored login focus. Screenshots at 320 and 1024 pixels were inspected; 320/640/1024/1440 layouts have no horizontal overflow, and the run has no page errors or console warnings. The callback is intentionally independent of the app's playlist/song surface. Browser checks exposed and fixed a hidden cancel action, native URL validation blocking subsequent local-file import, and lost modal keyboard focus after disabling a submit button.

`lx-runner.mjs` reads one UTF-8 JSON object from stdin. `inspect` returns `{ok:true,sources}`; `resolve` additionally consumes `{source,action:"musicUrl",info:{type,musicInfo}}` and returns `{ok:true,url}`. Failures contain only a fixed error code/message. Script console calls are discarded. Input is at most 768 KiB, script at most 512 KiB, output at most 2 MiB.

`media-relay.mjs` is a separate trusted streaming transport; it does not execute scripts. Input: `{url,allowedHosts,method:"GET"|"HEAD",range?:"bytes=N-M"}`. First stdout line is `{ok:true,status,headers}` followed by raw binary audio for GET. Headers include only validated content-type/content-length/content-range/accept-ranges. HEAD has no body. Only HTTP 200/206 and audio/* or application/octet-stream are accepted. Failures before metadata emit `{ok:false,code,error}`; later failures close the stream and exit nonzero. Java must use this relay for the actual media transfer instead of handing the hostname URL directly to another HTTP client, so DNS checks cannot be bypassed through subsequent DNS rebinding or redirects.

## Supported LX subset

- `lx.env = "desktop"`, `lx.version = "fe-subset-1"`; this is deliberately a subset identifier.
- `lx.EVENT_NAMES.inited/request/updateAlert`, `lx.send("inited", {sources})`, and `lx.on("request", handler)`. Legacy `status:true` is accepted; `status:false` fails. The handler may return a promise or string. `updateAlert` is an inert advisory compatibility event: it never opens a URL, presents a popup, or updates the script.
- Frozen guest `lx.currentScriptInfo` includes header name/description/version/author/homepage and the exact `rawScript`; no host path or account information is exposed. Full metadata is kept inside the guest, while public previews use separately sanitized display fields.
- `setTimeout`/`clearTimeout` retain callbacks in QuickJS, with at most 64 active timers, the existing bridge-call limit and invocation deadline, and complete cleanup on return. String callbacks are rejected; no intervals or host function objects are exposed.
- Supported provider keys: wy, tx, kg; music type and musicUrl action only. Qualities are the intersection of the script's declaration with 128k, 320k, flac, flac24bit. Unsupported keys/actions are not exposed as capabilities.
- `lx.request(url, options, callback)`: GET/POST, string or JSON body, URL-encoded form, bounded headers/timeout. Callback receives `(err, response, body)` and `response.body` is also populated. JSON responses are parsed; other responses remain UTF-8 text. The returned cancel function cancels the active request and suppresses its callback.
- `lx.utils.buffer.from` (string, byte array, guest Uint8Array or ArrayBuffer), `bufToString`, crypto.md5 (string), crypto.randomBytes (up to 4096 bytes). Bytes remain guest Uint8Arrays. Encodings: utf8, utf-8, hex, base64, latin1, ascii.
- `crypto.aesEncrypt(data, mode, key, iv)` accepts UTF-8 strings or bytes with AES-128/192/256 CBC/ECB and default PKCS#7 padding. Keys must match the mode; CBC IV is 16 bytes and ECB IV must be empty. Each byte input is capped at 128 KiB and the serialized bridge retains its 256 KiB bound; errors are fixed/redacted.
- No RSA/zlib helpers, multipart formData, DOM, fetch, Node modules, filesystem, process, host environment or developer tools. kw/mg/local, lyrics and artwork are not connected.

The contract was checked against the [official LX custom-source documentation](https://lxmusic.toside.cn/desktop/custom-source). Initial tests used self-authored fixtures; the 2026-09-18 compatibility check below also uses the exact user-provided Sixyin script, without claiming universal compatibility or playback.

## Isolation and network limits

Each invocation creates an independent QuickJS WebAssembly module. A supplied WebAssembly.Memory enforces a hard 64 MiB ceiling and its identity is asserted after construction. QuickJS guest allocation is capped at 24 MiB, stack at 512 KiB. An interrupt handler enforces a 12-second deadline; promise execution is capped at 10,000 jobs; the JSON bridge permits 256 calls. CLI supervision times out at 15 seconds, and Java also must forcibly reap stalled children. This follows the [QuickJS wrapper's documented runtime controls](https://github.com/justjake/quickjs-emscripten) and its [custom-memory variant API](https://github.com/justjake/quickjs-emscripten/blob/main/packages/quickjs-emscripten-core/src/variants.ts).

HTTP and returned media URL hostnames must be explicitly present in the user's exact ASCII hostname allowlist (at most 32). No IP literals, credentials, fragments, non-HTTPS, non-443 ports, wildcard hosts, redirects, private/loopback/link-local/multicast/reserved/documentation IPs, IPv4-mapped IPv6, or IPv6 transition addresses are allowed. Every DNS answer is checked, then the transport lookup callback supplies only the chosen validated IP while TLS verifies the original hostname. Per-request agents are disabled, TLS verification is explicit, and no ambient cookies or account headers are installed. The [Node HTTPS options](https://nodejs.org/api/https.html) and [ipaddr.js address classification](https://github.com/whitequark/ipaddr.js) informed this implementation.

Legacy script API requests and returned media URLs spelled `http://` are normalized to the same HTTPS host/path/query before the above checks, accepting only default HTTP ports and no credentials/fragments. There is no HTTP transport or plaintext fallback; custom ports and private literals remain forbidden. Downloads still require HTTPS; returned media is validated and relayed exclusively using the upgraded HTTPS URL, never the original HTTP string.

Script HTTP: 12 requests, 128 KiB request body, 1 MiB response, 4 MiB cumulative responses, 16 KiB headers, 6 seconds/request, and the invocation's total deadline. Compressed HTTP responses are rejected, avoiding decompression expansion. DNS waits are independently bounded.

Media relay: connection including DNS at most 8 seconds, idle at most 15 seconds, transfer at most 1 hour, at most 8 GiB transferred, strict single byte Range, no content decompression. Writes await downstream completion instead of buffering the whole file. The host service must bound concurrent relay processes and kill them on disconnected consumers.

## Dependencies and distribution

Independent package.json and package-lock.json pin `quickjs-emscripten@0.32.0` and `ipaddr.js@2.5.0`. QuickJS wrapper core and all @jitl transitive dependencies lock to 0.32.0. All are MIT licensed. Only the release-sync WASM variant is used. The lockfile records integrity hashes. Dependency lifecycle scripts were disabled:

```powershell
npm install --ignore-scripts --no-fund --prefix native/audio-sources
npm audit --ignore-scripts --prefix native/audio-sources
```

Audit result: 9 packages audited, 0 known vulnerabilities. Reproducible distribution uses `npm ci --ignore-scripts --omit=dev --prefix native/audio-sources`. Package the resulting node_modules with the trusted runner/relay and preserve package LICENSE files. node_modules is ignored in Git. See THIRD_PARTY_NOTICES.md for notices, including the underlying QuickJS engine.

## Verification evidence

RED: `node --test native/audio-sources/test/*.test.mjs` first failed because runtime.mjs/network.mjs were absent. Relay tests likewise failed on absent relay.mjs before implementation.

GREEN: `node --test native/audio-sources/test/*.test.mjs`: 28 passed, 0 failed, 0 skipped. Tests exercise actual QuickJS evaluation and host mocks for deterministic DNS/HTTPS; media binary bytes are streamed through actual Node Readable/Writable streams. Cases cover initialization, song request shape, undeclared source/action/quality, script errors/redaction, isolation, infinite loops, promise churn, unresolved promises, heap exhaustion, callback HTTP, utilities, CLI framing, input limits, all-answer DNS policy/pinning, redirects, headers, cancellation, timeouts, response/request budgets, CDN allowlist, relay content types, binary preservation, ranges and HEAD.

`node --check` passed for runner, runtime, network and media CLI. `npm ls --all` resolved the pinned dependency tree, and the post-implementation audit still reported zero known vulnerabilities.

## Limits and residual risks

Synthetic fixtures validate the stated contract, not general third-party compatibility or provider availability. Network unit tests use injected DNS/HTTPS transports; the separate Sixyin initialization check below contacted its public initialization endpoint but did not play live audio. No OS-level sandbox is installed: the trusted Node supervisor has normal process permissions, while the untrusted script sees only QuickJS and the bounded bridge. WebAssembly/runtime/Node vulnerabilities remain a dependency-maintenance concern; npm audit is not a security proof. API coverage is intentionally limited and some existing LX scripts will fail until their missing API is explicitly implemented and tested. Untrusted returned media URLs must always flow through the relay, never an unguarded browser/native HTTP client.

## Sixyin initialization compatibility verification (2026-09-18)

User URL: `https://ghproxy.net/raw.githubusercontent.com/pdone/lx-music-source/main/sixyin/latest.js`. The unmodified v1.2.1 script was 333015 bytes with SHA-256 `a407ffe0ab23c29cd32ce249b83e61c8e2b70719895f16034566ad7557282785`. It was executed only inside the bounded QuickJS runtime, never by Node eval/import. Root causes were missing currentScriptInfo/updateAlert, delayed initialization via setTimeout, and an HTTP-spelled initialization API blocked by offline preview. A later isolated resolution probe also identified the missing AES-128-ECB utility.

The original script now yields a pending preview for `www.hibai.cn` and successfully declares wy/tx/kg via its real HTTPS initialization endpoint after explicitly granting that host. Mock-initialization probes reach each platform's request path; unapproved platform hosts remain blocked. This is initialization/API-compatibility evidence, not end-to-end playback, copyright/account permission, or CDN availability evidence. No user source was saved or selected.

An opt-in Java probe using the rebuilt backend additionally downloaded the exact user URL, verified that preview performed no persistence, authorized only `www.hibai.cn`, and successfully imported into a fresh isolated test store with all three capabilities. Import-only kept that store's selection at builtin. This test did not touch the running application's source store.

A full mock of the original script identified two further QQ blockers: its vkey request needs the track MID, not `file.media_mid`, and its successful branch constructs an HTTP-spelled media URL. The Java adapter now preserves distinct `songmid` and `strMediaMid`; a regression uses the real catalog mapper with synthetic data. Returned HTTP media is upgraded before allowlist and all-answer DNS validation, preserving the HTTPS-only transport. No real song or media request was made by these probes.

Final verification: native QuickJS/network/relay/download suite 49/49; Java service 77 checks plus subprocess, HTTP consent/atomic retry, media relay and actual QuickJS probes; URL UI, manager UI and isolated browser flow; playback-resolver integration and runtime packaging contract all passed. Existing catalog regression tests (18) and real-app isolated library browser flow also passed. Narrow/wide pending-preview screenshots were inspected. New regressions were observed failing before their fixes. Browser fixtures are self-authored and do not use account data. The Java backend was rebuilt for the next workspace launch; the running backend and installer were not replaced.

Shared-worktree boundary: the audio-source-manager cache token and content fingerprint were updated and verified. A later whole-workspace cache check reports concurrent changes with unchanged cache keys in app.js, lyric-highlight-particles.js and particle-lyrics-runtime.js. Those unrelated edits were preserved; this report does not claim the entire workspace's cache check is green.
