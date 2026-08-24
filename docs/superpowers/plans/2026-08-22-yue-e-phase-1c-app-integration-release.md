# Yue E Phase 1C App Integration and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the Phase 1B Yue E runtime shell into the app without interrupting playback, prove its four failure/success lifecycle slices in a real browser, and ship only the exact Gate-A-approved content-addressed asset through the release pipelines before USER GATE B.

**Architecture:** `web/app.js` remains a thin owner bridge: it creates one Phase 1B runtime, serializes heavy-world ownership, and maps app/page lifecycle events onto the runtime's six-method API. Release verification treats the approved lookdev gate as the trust root, derives the GLB filename from the committed runtime manifest, and verifies the same model/gate/contract/rig/LOD0 lineage in source, staged payload, and isolated install. Browser and release probes are build-time scripts and are excluded from shipped payloads.

**Tech Stack:** Browser-native ES modules, Three.js r128 already loaded by the app, Node.js built-ins (`node:test`, `node:assert`, HTTP, raw CDP), Microsoft Edge, PowerShell 5.1, existing Windows installer scripts, Android Gradle, macOS shell packaging.

**Spec:** `docs/superpowers/specs/2026-08-21-yue-e-open-world-scene-design.md`

**Umbrella plan:** `docs/superpowers/plans/2026-08-21-yue-e-phase-1-character-runtime-shell.md` Tasks 7–8.

**Depends on:** Phase 1B Tasks 1–6 completed; USER GATE A says `approved`; the promoted runtime manifest and its one content-addressed GLB exist and pass all Phase 1B checks.

## Global Constraints

- Phase 1C integrates and releases the Phase 1 shell only. Do not add movement, grassland streaming, a controllable camera, real-time presets, playlist DOM migration, spatial emitters, achievements, LOD1/LOD2, or any Stage 2+ behavior.
- `window.FeYueE` exposes exactly `mount`, `enter`, `exit`, `snapshot`, `restore`, and `dispose`; Phase 1C does not add a seventh public method.
- Use only the app's local Three r128 and local `vendor/GLTFLoader.r128.js`; do not add a package, CDN, remote model, or network runtime dependency.
- The cache token for every new Phase 1 import/style and the modified `web/app.js` entry is exactly `20260821-yue-e-phase1-1`.
- Entry waits for three consecutive healthy frames, then performs a 520ms overlap; reduced motion is immediate. The 560ms timer is only a transition safety cap.
- The current song, queue, player source, media clock, loop, volume, mute state, and playback rate remain unchanged across preload, entry, error, retry, recovery, exit, BFCache, and disposal.
- At most one heavy-world RAF owner may run. The shared coordinator suspends the base renderer immediately before Yue E creates its renderer and resumes the currently valid base mode on every exit/failure.
- Context loss remains a runtime recovery substate; app code must not translate it into ordinary exit.
- The approved gate is `docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json`; exact raw gate SHA, model SHA, contract SHA, rig fingerprint, and approved LOD0 fingerprint form the release lineage.
- `web/assets/yue-e/character/` contains exactly one direct child matching `^yue-e-traveler-lookdev\.[A-F0-9]{12}\.glb$`, and it is the file selected by `yue-e-traveler-lookdev.manifest.json`.
- Build-only `scripts/yue-e/`, root `scripts/check-yue-e-*`, lookdev candidates, Blender sources, approval tools, docs, and review artifacts never enter staged or installed payloads.
- USER GATE B is a hard stop. Do not create or execute a Phase 2 plan until the user explicitly accepts Phase 1.

---

## Scope and File Map

The UI bridge and release boundary are coupled: release checks must prove the exact files exercised by the four browser profiles. They therefore remain one Phase 1C plan; no unrelated subsystem is included.

| Path | Action | Single responsibility |
|---|---|---|
| `scripts/check-yue-e-entry-contract.mjs` | Create | Static DOM/CSS/bridge/lifecycle boundary checks |
| `web/index.html` | Modify near current lines 25, 575–599, 2552, 3098 | Scene entry button, sibling shell DOM, stylesheet/app cache tokens |
| `web/yue-e/yue-e.css` | Create | Entry cluster, shell layers, 520ms transition, responsive/special-client rules |
| `web/app.js` | Modify at `els`, `state`, GLTF loader, sandbox/DIY setters, Escape/lifecycle/init | Runtime bridge and exclusive heavy-world ownership |
| `scripts/yue-e/lib/browser-probe.mjs` | Create | Bounded HTTP/Edge/raw-CDP/WAV test helper; build-only |
| `scripts/check-yue-e-phase-1-browser.mjs` | Create | Four clean real-browser profiles and screenshots |
| `scripts/check-yue-e-phase-1-contract.mjs` | Create | Non-browser aggregate, cache graph, source exactly-one GLB, approved lineage |
| `scripts/check-yue-e-cross-platform-release.mjs` | Create | Verify a copied Android/macOS web root against the same Gate A lineage |
| `scripts/check-web-cache-fingerprints.mjs` | Modify current lines 109–128 | Discover static ESM imports/exports through the existing resolver/queue |
| `web/cache-fingerprints.json` | Regenerate | Exact hashes for the finalized versioned graph |
| `scripts/yue-e-release-contract.ps1` | Create | Shared Windows static-file list and manifest/lineage resolver |
| `scripts/build-installer.ps1` | Modify in `Stage-Payload` and `$requiredPayloadItems` | Manifest-derived staging; exclude build-only files |
| `scripts/install-fe-monster.ps1` | Modify in `Assert-RequiredFiles` | Verify installed runtime manifest and selected GLB |
| `scripts/check-windows-installer-contract.ps1` | Modify source and `-PayloadRoot` branches | Verify source/staged declarations and exact lineage |
| `scripts/check-final-installer-isolated-install.ps1` | Modify params unchanged | Compare isolated install directly with current approved gate |
| `artifacts/yue-e/phase-1/*.png` | Generate, do not commit as source | Gate-B visual evidence |

## Frozen Cross-Plan Interfaces

```ts
type YueEPhase = "idle" | "mounted" | "loading" | "ready" | "entering" | "active" | "error" | "exiting" | "disposed";
type YueERecoveryPhase = "none" | "lost" | "rebuilding" | "fading-in" | "failed";
type WorldMode = "yue-e" | "sandbox" | "diy";

interface FeYueE {
  mount(dependencies: YueEDomainDependencies): void;
  enter(): Promise<{ ready: true; stableFrames: 3; gateReport: Readonly<Record<string, unknown>> }>;
  exit(reason?: string): Promise<void>;
  snapshot(): YueESnapshotV2;
  restore(snapshot: YueESnapshotV2): Readonly<{ restored: boolean; reason?: "invalid"; spawn: "music-zone" | "volatile" }>;
  dispose(): void;
}

interface HeavyRafCoordinator {
  suspendBase(reason: string): void;
  resumeBase(reason: string): void;
  snapshot(): Readonly<{ baseSuspended: boolean; activeOwners: readonly string[]; activeHeavyRafCount: number }>;
}

interface YueEBridgeState {
  phase: YueEPhase;
  recoveryPhase: YueERecoveryPhase;
  surfaceOpen: boolean;
  active: boolean;
  baseRenderSuspended: boolean;
  activationToken: number;
  runtime: FeYueE | null;
  runtimePromise: Promise<FeYueE> | null;
  enterPromise: Promise<unknown> | null;
  exitPromise: Promise<void> | null;
  returnFocus: HTMLElement | null;
  returnSurface: "sandbox" | "diy" | "playback" | "home" | null;
}
```

The Phase 1B platform seam consumed here is exact:

```js
createYueERuntime({
  three,
  ensureGltfLoader,
  createRenderer,
  elements,
  fetch,
  cryptoSubtle,
  requestFrame,
  cancelFrame,
  now,
  setTimer,
  clearTimer,
  resizeObserverFactory,
  prefersReducedMotion,
  waitForSurfaceTransition, // ({ direction:"enter"|"exit", signal:AbortSignal }) => Promise<void>
  setBaseRenderSuspended,    // (suspended:boolean, reason:string) => void
  setBaseSurfaceObscured,    // (obscured:boolean) => void
  onPhase                    // ({ phase, recoveryPhase, errorCode? }) => void
});
```

Windows release helper functions are exact and keep existing installer CLI parameters unchanged:

```powershell
Get-YueERuntimeRelativeFiles
Get-YueEApprovedLineage -RepositoryRoot <root>
Resolve-YueEReleaseAsset -Root <repository-or-payload-root> [-ExpectedLineage <object>]
```

`Resolve-YueEReleaseAsset` returns `Manifest`, `ManifestPath`, `ManifestRelative`, `AssetPath`, `AssetRelative`, `AssetSha256`, and `MatchingGlbCount`. It rejects path escape, a non-direct child, a non-uppercase hash, a filename/hash-prefix mismatch, more or fewer than one promoted GLB, byte-hash mismatch, and any mismatch with `ExpectedLineage`.

## Task Outline

### Task 7A: Static entry contract, HTML, and CSS

**Files:**

- Create: `scripts/check-yue-e-entry-contract.mjs`
- Create: `web/yue-e/yue-e.css`
- Modify: `web/index.html:25`, `web/index.html:575-599`, immediately after the `.app-shell` close near `web/index.html:2552`, `web/index.html:3098`

**Interfaces:**

- Produces DOM IDs `yueEButton`, `yueERoot`, `yueECanvas`, `yueEStatus`, `yueERecovery`, `yueERetryButton`, `yueEExitButton`.
- `node scripts/check-yue-e-entry-contract.mjs` takes no arguments, prints one JSON object, and exits non-zero on any mismatch.
- Consumed by Task 7B through the same DOM IDs; no bridge code is required for the first green state.

- [ ] **Step 1: Verify the Phase 1B handoff and Gate A before touching shared app files**

  ```powershell
  $phase1Gate = Get-Content -Raw -LiteralPath "docs\superpowers\assets\yue-e\lookdev\yue-e-traveler-gate.json" | ConvertFrom-Json
  if ([string]$phase1Gate.approval.status -cne 'approved') { throw 'USER GATE A is not approved.' }
  if ([string]$phase1Gate.approval.approvedModelSha256 -cne [string]$phase1Gate.model.sha256) { throw 'Gate A model identity is inconsistent.' }
  node scripts/check-yue-e-runtime-state.mjs
  node scripts/check-yue-e-runtime-shell.mjs
  node scripts/check-yue-e-shell-modules.mjs
  ```

  Expected: all three Node checks exit `0`. Stop this plan if any command fails; repair Phase 1B under its own plan.

- [ ] **Step 2: Record the dirty-worktree baseline**

  Run: `git status --short`

  Expected: output may be non-empty. Save it in the execution log and never stage unrelated paths.

- [ ] **Step 3: Write the first failing entry contract**

  Create `scripts/check-yue-e-entry-contract.mjs` with this complete first version:

  ```js
  import assert from "node:assert/strict";
  import fs from "node:fs";
  import path from "node:path";

  const root = path.resolve(import.meta.dirname, "..");
  const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
  const html = read("web/index.html");
  const cssPath = path.join(root, "web/yue-e/yue-e.css");

  assert.match(html, /<div class="world-mode-entry-actions">\s*<button\b[^>]*id="sandboxModeButton"[\s\S]*?<\/button>\s*<button\b[^>]*id="yueEButton"[\s\S]*?<\/button>\s*<\/div>/u);
  const sceneButton = html.match(/<button\b[^>]*id="yueEButton"[\s\S]*?<\/button>/u)?.[0] || "";
  assert.match(sceneButton, /aria-controls="yueERoot"/u);
  assert.match(sceneButton, /aria-pressed="false"/u);
  assert.match(sceneButton, />\s*<span[^>]*>场景<\/span>\s*<\/button>/u);

  const shell = html.match(/<section\b[^>]*id="yueERoot"[\s\S]*?<\/section>/u)?.[0] || "";
  assert.match(shell, /\bhidden\b/u);
  assert.match(shell, /data-yue-e-state="idle"/u);
  for (const id of ["yueECanvas", "yueEStatus", "yueERecovery", "yueERetryButton", "yueEExitButton"]) {
    assert.match(shell, new RegExp(`id="${id}"`, "u"));
  }
  assert.match(shell, /id="yueEStatus"[^>]*role="status"[^>]*aria-live="polite"/u);
  assert.match(shell, /id="yueERecovery"[^>]*role="status"[^>]*aria-live="assertive"/u);
  const appShellOpenIndex = html.indexOf('<main class="app-shell"');
  const appShellCloseIndex = html.indexOf("</main>", appShellOpenIndex);
  const yueRootIndex = html.indexOf('id="yueERoot"');
  const recordingDialogIndex = html.indexOf('id="recordingDialog"');
  assert.ok(appShellOpenIndex >= 0 && appShellCloseIndex > appShellOpenIndex);
  assert.ok(appShellCloseIndex < yueRootIndex && yueRootIndex < recordingDialogIndex,
    "#yueERoot must be an app-shell sibling before #recordingDialog");

  const stylesIndex = html.indexOf("styles.css?v=");
  const yueStyleIndex = html.indexOf("yue-e/yue-e.css?v=20260821-yue-e-phase1-1");
  assert.ok(stylesIndex >= 0 && yueStyleIndex > stylesIndex, "Yue E CSS must follow styles.css");
  assert.match(html, /app\.js\?v=20260821-yue-e-phase1-1/u);
  assert.doesNotMatch(html, /app\.js\?v=20260821-audio-atomic-6/u);
  assert.ok(fs.existsSync(cssPath), "web/yue-e/yue-e.css is missing");

  const css = read("web/yue-e/yue-e.css");
  assert.match(css, /\.world-mode-entry-actions[\s\S]*display:\s*flex/u);
  assert.match(css, /520ms/u);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/u);
  assert.match(css, /html\[data-fe-client="desktop-scene"\][\s\S]*\.world-mode-entry-actions/u);
  assert.match(css, /html\[data-fe-client="desktop-pet"\][\s\S]*#yueERoot/u);
  assert.doesNotMatch(css, /(?:grain|noise|dither)/iu);

  console.log(JSON.stringify({ ok: true, domIds: 7, transitionMs: 520 }));
  ```

- [ ] **Step 4: Run the contract in red state**

  Run: `node scripts/check-yue-e-entry-contract.mjs`

  Expected: non-zero exit with the first `AssertionError`; `#yueEButton` and `web/yue-e/yue-e.css` do not exist yet.

- [ ] **Step 5: Add the entry cluster without changing the existing sandbox button**

  Immediately before the existing `#sandboxModeButton`, insert:

  ```html
  <div class="world-mode-entry-actions">
  ```

  Immediately after that existing button's closing `</button>`, insert:

  ```html
    <button id="yueEButton" class="yue-e-entry-button glass-surface" type="button"
            aria-label="进入遇E" aria-controls="yueERoot" aria-pressed="false">
      <span class="glass-surface__content">场景</span>
    </button>
  </div>
  ```

  Do not reindent or edit the existing sandbox button; this keeps its event/CSS contract byte-stable except for the new parent.

- [ ] **Step 6: Add the runtime shell as an app-shell sibling**

  Insert this exact block immediately after the closing `</main>` of `.app-shell` (current line approximately 2552) and before `#recordingDialog`. Do not put it after `#sandboxPage` or before `.stage`: both are inside `.app-shell`, and `.app-shell.yue-e-active { opacity:0 }` would hide Yue E with the base surface.

  ```html
  <section id="yueERoot" class="yue-e-root" data-yue-e-state="idle"
           aria-label="遇E 三维场景" aria-busy="false" hidden>
    <canvas id="yueECanvas" aria-label="遇E 三维画面"></canvas>
    <div id="yueEStatus" role="status" aria-live="polite"></div>
    <div id="yueERecovery" role="status" aria-live="assertive" hidden>正在恢复遇E画面…</div>
    <button id="yueERetryButton" type="button" hidden>重试</button>
    <button id="yueEExitButton" type="button">退出遇E</button>
  </section>
  ```

- [ ] **Step 7: Load the new stylesheet and bump the app entry token**

  Add after the current `styles.css` link:

  ```html
  <link rel="stylesheet" href="yue-e/yue-e.css?v=20260821-yue-e-phase1-1" />
  ```

  Change only the final app script URL to:

  ```html
  <script src="app.js?v=20260821-yue-e-phase1-1"></script>
  ```

- [ ] **Step 8: Implement the focused responsive CSS**

  Create `web/yue-e/yue-e.css` with:

  ```css
  .world-mode-entry-actions {
    position: fixed;
    top: 18px;
    left: 24px;
    z-index: 86;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .world-mode-entry-actions #sandboxModeButton,
  .world-mode-entry-actions #yueEButton {
    position: static;
    inset: auto;
    min-width: 126px;
    min-height: 44px;
    margin: 0;
  }

  .yue-e-root {
    position: fixed;
    inset: 0;
    z-index: 82;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
    transition: opacity 520ms cubic-bezier(.22, .8, .24, 1);
  }

  .yue-e-root.is-ui-visible,
  .yue-e-root.is-scene-visible {
    opacity: 1;
  }

  .yue-e-root.is-transition-primed {
    opacity: 0;
    transition: none;
  }

  .yue-e-root[data-yue-e-state="entering"],
  .yue-e-root[data-yue-e-state="active"] {
    pointer-events: auto;
  }

  #yueECanvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    pointer-events: none;
  }

  .yue-e-root[data-yue-e-state="entering"] #yueECanvas,
  .yue-e-root[data-yue-e-state="active"] #yueECanvas {
    pointer-events: auto;
  }

  #yueEStatus,
  #yueERecovery,
  #yueERetryButton,
  #yueEExitButton {
    position: fixed;
    z-index: 2;
    pointer-events: auto;
  }

  #yueEStatus,
  #yueERecovery {
    left: 50%;
    bottom: 78px;
    max-width: min(560px, calc(100vw - 32px));
    transform: translateX(-50%);
    padding: 10px 14px;
    border: 1px solid rgba(255, 255, 255, .22);
    border-radius: 14px;
    color: #fffaf0;
    background: rgba(7, 13, 26, .78);
    backdrop-filter: blur(16px);
  }

  #yueERetryButton { right: 94px; bottom: 24px; }
  #yueEExitButton { right: 24px; bottom: 24px; }

  .app-shell {
    transition: opacity 520ms cubic-bezier(.22, .8, .24, 1);
  }

  .app-shell.yue-e-active { opacity: 0; }
  .app-shell.yue-e-obscured { visibility: hidden; pointer-events: none; }

  html[data-fe-client="desktop-scene"] .world-mode-entry-actions,
  html[data-fe-client="desktop-scene"] #yueERoot,
  html[data-fe-client="desktop-pet"] .world-mode-entry-actions,
  html[data-fe-client="desktop-pet"] #yueERoot {
    display: none !important;
  }

  @media (max-width: 820px) {
    .world-mode-entry-actions { top: 12px; left: 12px; gap: 8px; }
    .world-mode-entry-actions #sandboxModeButton,
    .world-mode-entry-actions #yueEButton { min-width: 108px; }
  }

  @media (max-width: 680px) {
    .world-mode-entry-actions #sandboxModeButton,
    .world-mode-entry-actions #yueEButton {
      min-width: 44px;
      width: 44px;
      padding-inline: 8px;
    }
    .world-mode-entry-actions .glass-surface__content { font-size: 12px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .yue-e-root,
    .app-shell { transition-duration: 0ms !important; }
  }
  ```

- [ ] **Step 9: Run the entry contract and inspect the focused diff**

  ```powershell
  node scripts/check-yue-e-entry-contract.mjs
  git diff --check -- web/index.html web/yue-e/yue-e.css scripts/check-yue-e-entry-contract.mjs
  git diff -- web/index.html web/yue-e/yue-e.css scripts/check-yue-e-entry-contract.mjs
  ```

  Expected: JSON contains `"ok":true`; both git checks exit `0`; only the entry cluster, shell, link, and app token changed in `web/index.html`.

- [ ] **Step 10: Commit Task 7A without unrelated shared-file hunks**

  ```powershell
  git add web/yue-e/yue-e.css scripts/check-yue-e-entry-contract.mjs
  git add -p -- web/index.html
  git diff --cached --check
  git commit -m "feat: add Yue E scene entry shell"
  ```

### Task 7B: App bridge, HeavyRafCoordinator, exclusivity, and page lifecycle

**Files:**

- Modify: `scripts/check-yue-e-entry-contract.mjs`
- Modify: `web/app.js:15-350`, `web/app.js:2397-3141`, `web/app.js:34050-34072`, `web/app.js:35272-35340`, `web/app.js:35989-36019`, `web/app.js:36083-36295`, `web/app.js:38108-38129`, `web/app.js:38723`, `web/app.js:39378-39771`, `web/app.js:41897-42035`, `web/app.js:45398-45480`

**Interfaces:**

- Consumes the Phase 1B `createYueERuntime(platform) -> FeYueE` seam and the Task 7A DOM IDs.
- Produces bridge functions `ensureYueERuntime`, `createYueEPlatform`, `createYueEDomainDependencies`, `createSurfaceTransitionWait`, `captureBaseSurfaceSnapshot`, `requestExclusiveWorldMode`, `isYueERecovering`, `enterYueE`, `exitYueE`, `syncYueEPhase`, `bindYueEEvents`.
- Produces read-only `window.FeYueEDiagnostics.snapshot()`; `window.FeYueE` remains the exact six-method runtime.

- [ ] **Step 1: Extend the static contract before adding bridge code**

  Append before the final `console.log` in `scripts/check-yue-e-entry-contract.mjs`:

  ```js
  const app = read("web/app.js");
  const bridgeStart = app.indexOf("// YUE_E_BRIDGE_START");
  const bridgeEnd = app.indexOf("// YUE_E_BRIDGE_END");
  assert.ok(bridgeStart >= 0 && bridgeEnd > bridgeStart, "bounded Yue E bridge markers are missing");
  const bridge = app.slice(bridgeStart, bridgeEnd);
  for (const name of [
    "ensureYueERuntime", "createYueEPlatform", "createYueEDomainDependencies",
    "createSurfaceTransitionWait", "captureBaseSurfaceSnapshot", "requestExclusiveWorldMode",
    "isYueERecovering", "enterYueE", "exitYueE", "syncYueEPhase", "bindYueEEvents"
  ]) assert.match(bridge, new RegExp(`function\\s+${name}\\s*\\(`, "u"));
  assert.equal((bridge.match(/import\("\.\/yue-e\/runtime\.js\?v=20260821-yue-e-phase1-1"\)/gu) || []).length, 1);
  assert.doesNotMatch(bridge, /https?:\/\//iu);
  assert.doesNotMatch(bridge, /new\s+Audio\s*\(/u);
  assert.doesNotMatch(bridge, /els\.audio\.(?:play|pause|load)\s*\(/u);
  assert.doesNotMatch(bridge, /els\.audio\.(?:src|currentSrc|currentTime)\s*=/u);
  assert.match(bridge, /yue-e\.traveler\.lookdev\.manifest/u);
  assert.match(bridge, /activeHeavyRafCount/u);
  assert.match(bridge, /pagehide-persisted/u);
  assert.match(bridge, /pagehide-terminal/u);
  assert.match(bridge, /visibility-hidden/u);
  assert.match(bridge, /beforeunload/u);
  assert.match(app, /function\s+setSandboxOpen\s*\(open,\s*options\s*=\s*\{\}\)[\s\S]*?requestExclusiveWorldMode\("sandbox"\)/u);
  assert.match(app, /function\s+setDiyOpen\s*\(open,\s*options\s*=\s*\{\}\)[\s\S]*?requestExclusiveWorldMode\("diy"\)/u);
  assert.match(app, /function\s+ensureSandboxGltfLoader[\s\S]*?resetAndReject[\s\S]*?script\.remove\(\)/u);
  ```

- [ ] **Step 2: Run the expanded contract in red state**

  Run: `node scripts/check-yue-e-entry-contract.mjs`

  Expected: non-zero exit with `bounded Yue E bridge markers are missing`.

- [ ] **Step 3: Add element/state fields and the bridge bounds**

  Add the seven Task 7A elements to `els`. Add this exact object inside `state`:

  ```js
  yueE: {
    phase: "idle",
    recoveryPhase: "none",
    surfaceOpen: false,
    active: false,
    baseRenderSuspended: false,
    activationToken: 0,
    runtime: null,
    runtimePromise: null,
    enterPromise: null,
    exitPromise: null,
    returnFocus: null,
    returnSurface: null
  },
  ```

  Bound all new bridge functions between literal comments `// YUE_E_BRIDGE_START` and `// YUE_E_BRIDGE_END`; the checker scans only that slice, not legacy player code.

- [ ] **Step 4: Add the one-heavy-RAF coordinator and guard base schedulers**

  Add inside the bridge bounds:

  ```js
  function isYueERecovering() {
    return state.yueE.recoveryPhase !== "none";
  }

  function yueEOwnsHeavySurface() {
    return state.yueE.baseRenderSuspended || state.yueE.active || isYueERecovering();
  }

  const heavyRafCoordinator = Object.freeze({
    suspendBase(reason) {
      state.yueE.baseRenderSuspended = true;
      if (state.sandbox.animationFrame) window.cancelAnimationFrame(state.sandbox.animationFrame);
      state.sandbox.animationFrame = 0;
      state.sandbox.renderRequested = false;
      if (state.orb.animationFrame) window.cancelAnimationFrame(state.orb.animationFrame);
      state.orb.animationFrame = 0;
      state.yueE.lastRenderReason = String(reason || "yue-e");
    },
    resumeBase(reason) {
      state.yueE.baseRenderSuspended = false;
      state.yueE.lastRenderReason = String(reason || "yue-e-exit");
      if (document.hidden) return;
      if (sandboxRendererActive()) requestSandboxRender();
      else requestOrbFrame();
    },
    snapshot() {
      const runtimeRaf = state.yueE.runtime?.snapshot?.().diagnostics?.rafRunning === true;
      const owners = [];
      if (state.sandbox.animationFrame) owners.push("sandbox");
      if (state.orb.animationFrame) owners.push("base");
      if (runtimeRaf) owners.push("yue-e");
      return Object.freeze({
        baseSuspended: state.yueE.baseRenderSuspended,
        activeOwners: Object.freeze(owners),
        activeHeavyRafCount: owners.length
      });
    }
  });
  ```

  Add `if (yueEOwnsHeavySurface()) return;` at the top of `requestSandboxRender`, `renderSandboxFrame`, `requestOrbFrame`, and `drawOrb`. Keep `stopSandboxRendering()` unchanged and use it from existing teardown paths.

- [ ] **Step 5: Harden the shared GLTF-loader retry path**

  Replace only `ensureSandboxGltfLoader()` with:

  ```js
  function ensureSandboxGltfLoader() {
    if (window.THREE?.GLTFLoader) return Promise.resolve(window.THREE.GLTFLoader);
    if (sandboxGltfLoaderPromise) return sandboxGltfLoaderPromise;
    let pending;
    pending = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const resetAndReject = (message) => {
        if (sandboxGltfLoaderPromise === pending) sandboxGltfLoaderPromise = null;
        script.remove();
        reject(new Error(message));
      };
      script.src = "vendor/GLTFLoader.r128.js?v=20260811-cache-audit-1";
      script.async = true;
      script.dataset.sandboxGltfLoader = "true";
      script.addEventListener("load", () => {
        if (window.THREE?.GLTFLoader) resolve(window.THREE.GLTFLoader);
        else resetAndReject("GLTFLoader 未正确初始化");
      }, { once: true });
      script.addEventListener("error", () => resetAndReject("GLTFLoader 加载失败"), { once: true });
      document.head.appendChild(script);
    });
    sandboxGltfLoaderPromise = pending;
    return pending;
  }
  ```

- [ ] **Step 6: Add transition, phase, domain, and platform adapters**

  Add inside the bridge bounds. `createSurfaceTransitionWait` must attach `transitionend` and `abort`, start a 560ms safety timer, toggle root/base opacity in the same animation frame, and remove all three handles in one `finish()` function. Its reduced-motion branch applies the final classes synchronously. Add these exact platform/domain bodies:

  ```js
  let yueEBaseObscuredTarget = false;

  function createYueEDomainDependencies() {
    return Object.freeze({
      playerCommands: Object.freeze({
        snapshot: () => Object.freeze({
          songId: String(state.currentSong?.id || ""),
          queueRevision: Number(state.queueRevision) || 0,
          paused: els.audio.paused,
          currentTime: Number(els.audio.currentTime) || 0
        }),
        subscribe(listener) {
          const events = ["play", "pause", "timeupdate", "loadedmetadata"];
          events.forEach((name) => els.audio.addEventListener(name, listener));
          return () => events.forEach((name) => els.audio.removeEventListener(name, listener));
        },
        play: () => els.audio.paused ? togglePlay() : Promise.resolve(),
        pause: () => { if (!els.audio.paused) void togglePlay(); },
        next: () => { void transport("/api/player/next"); },
        previous: () => { void transport("/api/player/previous"); },
        seek: (seconds) => setAudioCurrentTimeWithNativeContinuity(Number(seconds) || 0, "yue-e-domain")
      }),
      playlistNodeProvider: Object.freeze({ get: (stableId) => document.getElementById(String(stableId || "")) }),
      achievementEvents: Object.freeze({
        emit: (event) => window.dispatchEvent(new CustomEvent("fe:yue-e-achievement", { detail: event }))
      }),
      spatialAudioBackend: Object.freeze({
        snapshot: () => Object.freeze({
          kind: String(state.clientRuntime.audioSpatialBackend || "none"),
          ready: state.clientRuntime.nativeAudioActive === true
        })
      }),
      resolveResource(stableAssetId) {
        if (stableAssetId !== "yue-e.traveler.lookdev.manifest") {
          const error = new Error("Unknown Yue E resource");
          error.code = "YUE_E_RESOURCE_UNKNOWN";
          throw error;
        }
        return "assets/yue-e/character/yue-e-traveler-lookdev.manifest.json?v=20260821-yue-e-phase1-1";
      },
      logger: console
    });
  }

  function createYueEPlatform() {
    return {
      three: window.THREE,
      ensureGltfLoader: ensureSandboxGltfLoader,
      createRenderer: (three, options) => createDirectX11Renderer(three, options),
      elements: {
        root: els.yueERoot, canvas: els.yueECanvas, status: els.yueEStatus,
        recovery: els.yueERecovery, retryButton: els.yueERetryButton, exitButton: els.yueEExitButton
      },
      fetch: window.fetch.bind(window),
      cryptoSubtle: window.crypto.subtle,
      requestFrame: window.requestAnimationFrame.bind(window),
      cancelFrame: window.cancelAnimationFrame.bind(window),
      now: () => performance.now(),
      setTimer: window.setTimeout.bind(window),
      clearTimer: window.clearTimeout.bind(window),
      resizeObserverFactory: (callback) => new ResizeObserver(callback),
      prefersReducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      waitForSurfaceTransition: createSurfaceTransitionWait,
      setBaseRenderSuspended: (suspended, reason) => suspended
        ? heavyRafCoordinator.suspendBase(reason)
        : heavyRafCoordinator.resumeBase(reason),
      setBaseSurfaceObscured: (obscured) => {
        yueEBaseObscuredTarget = obscured === true;
        if (!obscured) els.appShell.classList.remove("yue-e-obscured");
      },
      onPhase: syncYueEPhase
    };
  }
  ```

  `syncYueEPhase(detail)` writes only known `phase/recoveryPhase`, sets `data-yue-e-state`, sets `aria-busy="true"` only for `loading/entering/rebuilding/fading-in`, shows retry only in `error/failed`, adds `yue-e-obscured` only after enter transition completion, and maps error codes to fixed safe Chinese messages rather than raw errors.

- [ ] **Step 7: Add single-flight runtime creation and bridge enter/exit**

  Add inside the bridge bounds:

  ```js
  async function ensureYueERuntime() {
    if (state.yueE.runtime) return state.yueE.runtime;
    if (!state.yueE.runtimePromise) {
      state.yueE.runtimePromise = import("./yue-e/runtime.js?v=20260821-yue-e-phase1-1")
        .then(({ createYueERuntime }) => {
          const runtime = createYueERuntime(createYueEPlatform());
          runtime.mount(createYueEDomainDependencies());
          state.yueE.runtime = runtime;
          window.FeYueE = runtime;
          return runtime;
        })
        .catch((error) => {
          state.yueE.runtimePromise = null;
          throw error;
        });
    }
    return state.yueE.runtimePromise;
  }

  function captureBaseSurfaceSnapshot() {
    return Object.freeze({
      sandboxOpen: state.sandbox.open,
      diyOpen: state.diyOpen,
      playbackPage: state.playbackPage,
      songId: String(state.currentSong?.id || ""),
      queueRevision: Number(state.queueRevision) || 0,
      focused: document.activeElement instanceof HTMLElement ? document.activeElement : null
    });
  }

  function enterYueE(options = {}) {
    if (options.exclusiveLease !== true) return requestExclusiveWorldMode("yue-e");
    if (state.yueE.enterPromise) return state.yueE.enterPromise;
    const token = ++state.yueE.activationToken;
    const base = captureBaseSurfaceSnapshot();
    state.yueE.returnFocus = base.focused;
    state.yueE.returnSurface = base.sandboxOpen ? "sandbox" : base.diyOpen ? "diy" : base.playbackPage ? "playback" : "home";
    state.yueE.surfaceOpen = true;
    els.yueERoot.hidden = false;
    els.yueERoot.classList.add("is-ui-visible");
    els.yueEButton.setAttribute("aria-busy", "true");
    const operation = ensureYueERuntime().then((runtime) => runtime.enter()).then((result) => {
      if (token !== state.yueE.activationToken) return { stale: true };
      state.yueE.active = true;
      els.yueEButton.setAttribute("aria-pressed", "true");
      return result;
    }).finally(() => {
      if (state.yueE.enterPromise === operation) state.yueE.enterPromise = null;
    });
    state.yueE.enterPromise = operation;
    return operation;
  }

  function exitYueE(reason = "user") {
    if (state.yueE.exitPromise) return state.yueE.exitPromise;
    ++state.yueE.activationToken;
    const runtime = state.yueE.runtime;
    const operation = Promise.resolve(runtime?.exit(reason)).finally(() => {
      state.yueE.active = false;
      state.yueE.surfaceOpen = false;
      state.yueE.recoveryPhase = "none";
      els.yueERoot.hidden = true;
      els.yueERoot.classList.remove("is-ui-visible", "is-scene-visible", "is-transition-primed");
      els.yueEButton.setAttribute("aria-pressed", "false");
      els.yueEButton.setAttribute("aria-busy", "false");
      state.yueE.returnFocus?.focus?.({ preventScroll: true });
      state.yueE.returnFocus = null;
      if (state.yueE.exitPromise === operation) state.yueE.exitPromise = null;
    });
    state.yueE.exitPromise = operation;
    return operation;
  }
  ```

  Never apply `captureBaseSurfaceSnapshot()` back to state; it is observation and diagnostics only.

- [ ] **Step 8: Serialize world-mode requests and guard direct setters**

  Add a module-local `let yueEWorldModeQueue = Promise.resolve();`. Implement `requestExclusiveWorldMode(mode)` so a sandbox/DIY request immediately calls the current runtime's `exit("mode-switch")` to invalidate pending preload, then queues cleanup before opening the requested mode. For `yue-e`, queue `enterYueE({ exclusiveLease:true })`. Pass `{ exclusiveLease:true }` only from the queue into setters.

  Change signatures and add these first branches:

  ```js
  function setSandboxOpen(open, options = {}) {
    if (open && state.yueE.surfaceOpen && options.exclusiveLease !== true) {
      void requestExclusiveWorldMode("sandbox");
      return;
    }
  ```

  ```js
  function setDiyOpen(open, options = {}) {
    if (open && state.yueE.surfaceOpen && options.exclusiveLease !== true) {
      void requestExclusiveWorldMode("diy");
      return;
    }
  ```

  Preserve each existing function body after the guard. Route closed-to-open sandbox/DIY button clicks through `requestExclusiveWorldMode`; direct close stays synchronous.

- [ ] **Step 9: Bind focus, retry, Escape, and page lifecycle**

  `bindYueEEvents()` binds scene click, retry, exit, `visibilitychange`, `pagehide`, `pageshow`, and `beforeunload`. Use exact reasons `visibility-hidden`, `pagehide-persisted`, `pagehide-terminal`, and `beforeunload`. Persisted pagehide/visibility call the runtime's immediate `exit`; terminal paths synchronously call `dispose()`, null `runtime/runtimePromise/enterPromise/exitPromise`, and set `window.FeYueE = null`. Pageshow normalizes root/button flags and reuses a still-mounted runtime.

  Make Yue E the first branch in `dismissTopUiLayer()` and the global Escape handler whenever `surfaceOpen` is true. Add `if (state.yueE.surfaceOpen) return;` before sandbox Escape/Delete logic and before its visibility-resume scheduling. Call `bindYueEEvents()` once from `init()`.

- [ ] **Step 10: Add read-only diagnostics used by the browser probe**

  Add after the bridge bounds:

  ```js
  window.FeYueEDiagnostics = Object.freeze({
    snapshot() {
      const runtime = state.yueE.runtime?.snapshot?.() || null;
      return Object.freeze({
        phase: state.yueE.phase,
        recoveryPhase: state.yueE.recoveryPhase,
        surfaceOpen: state.yueE.surfaceOpen,
        active: state.yueE.active,
        runtime,
        runtimeId: runtime?.diagnostics?.recovery?.runtimeId || "",
        sandboxOpen: state.sandbox.open,
        diyOpen: state.diyOpen,
        playbackPage: state.playbackPage,
        songId: String(state.currentSong?.id || ""),
        queueRevision: Number(state.queueRevision) || 0,
        ...heavyRafCoordinator.snapshot()
      });
    }
  });
  ```

- [ ] **Step 11: Run static/syntax/runtime checks**

  ```powershell
  node scripts/check-yue-e-entry-contract.mjs
  node --check web/app.js
  node --check web/yue-e/runtime.js
  node scripts/check-yue-e-runtime-shell.mjs
  ```

  Expected: every command exits `0`; entry JSON reports `ok:true`; runtime shell still reports the exact six-method API.

- [ ] **Step 12: Commit only the bridge hunks**

  ```powershell
  git add scripts/check-yue-e-entry-contract.mjs
  git add -p -- web/app.js
  git diff --cached --check
  git diff --cached -- web/app.js
  git commit -m "feat: integrate Yue E runtime lifecycle"
  ```

### Task 7C: Four real-browser profiles

**Files:**

- Create: `scripts/yue-e/lib/browser-probe.mjs`
- Create: `scripts/check-yue-e-phase-1-browser.mjs`
- Generate: `artifacts/yue-e/phase-1/runtime-shell.png`
- Generate: `artifacts/yue-e/phase-1/error-fallback.png`
- Generate: `artifacts/yue-e/phase-1/webgl-unavailable.png`
- Generate: `artifacts/yue-e/phase-1/context-recovery.png`

**Interfaces:**

```ts
startYueEFixture({ root }): Promise<{
  url: string;
  setGlbFault(value: { delayMs?: number; failuresRemaining?: number }): void;
  requests: readonly string[];
  close(): Promise<void>;
}>;
launchEdgeProbe({ url, profileDirectory, artifactDirectory }): Promise<{
  evaluate(expression: string): Promise<unknown>;
  waitFor(expression: string, label: string, timeoutMs?: number): Promise<void>;
  screenshot(fileName: string): Promise<string>;
  pageErrors: string[];
  consoleErrors: string[];
  close(): Promise<void>;
}>;
```

Each profile owns one HTTP server, one never-reused Edge user-data directory, one CDP socket, and a `finally` teardown.

- [ ] **Step 1: Write the four-profile test driver before its helper exists**

  Create `scripts/check-yue-e-phase-1-browser.mjs` with imports, these exact profile names, and the final result schema:

  ```js
  import assert from "node:assert/strict";
  import fs from "node:fs";
  import path from "node:path";
  import { launchEdgeProbe, startYueEFixture } from "./yue-e/lib/browser-probe.mjs";

  const root = path.resolve(import.meta.dirname, "..");
  const artifactDirectory = path.join(root, "artifacts/yue-e/phase-1");
  fs.mkdirSync(artifactDirectory, { recursive: true });
  const profileNames = ["success-continuity", "asset-503-retry", "webgl-unavailable-retry", "context-loss-restore"];
  const reports = {};
  for (const name of profileNames) reports[name] = await runProfile(name);
  console.log(JSON.stringify({ ok: true, environment: reports[profileNames[0]].environment, profiles: reports }, null, 2));
  ```

  Define `runProfile(name)` in the same file with a `try/finally` that starts the fixture, launches Edge with a profile under `.tmp/yue-e-phase-1-browser/<name>-<pid>`, dispatches to the named body, asserts no page/console errors, and closes Edge before the server.

- [ ] **Step 2: Run the driver in red state**

  Run: `node scripts/check-yue-e-phase-1-browser.mjs`

  Expected: non-zero `ERR_MODULE_NOT_FOUND` for `scripts/yue-e/lib/browser-probe.mjs`.

- [ ] **Step 3: Implement the deterministic 30-second WAV and safe fixture route**

  In `browser-probe.mjs`, generate mono signed 16-bit PCM at 44,100Hz. The implementation is exact:

  ```js
  function createPcmWave() {
    const sampleRate = 44_100;
    const samples = sampleRate * 30;
    const dataBytes = samples * 2;
    const wave = Buffer.alloc(44 + dataBytes);
    wave.write("RIFF", 0); wave.writeUInt32LE(36 + dataBytes, 4); wave.write("WAVE", 8);
    wave.write("fmt ", 12); wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20);
    wave.writeUInt16LE(1, 22); wave.writeUInt32LE(sampleRate, 24);
    wave.writeUInt32LE(sampleRate * 2, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34);
    wave.write("data", 36); wave.writeUInt32LE(dataBytes, 40);
    for (let index = 0; index < samples; index += 1) {
      wave.writeInt16LE(Math.round(Math.sin(index * Math.PI * 2 * 220 / sampleRate) * 2048), 44 + index * 2);
    }
    return wave;
  }
  ```

  Reuse the repository fixture API response map, `contentType`, and root-contained `safeStaticPath` behavior from `scripts/check-main-boot-ready-browser.mjs`. Add `/__yue_e_audio.wav`, and intercept only basenames matching the promoted GLB regex. `delayMs` delays that response; `failuresRemaining` returns `503` before reading bytes. Always set `Cache-Control: no-store` and call `server.closeAllConnections?.()` during close.

- [ ] **Step 4: Implement the bounded raw-CDP Edge transport**

  Reuse the exact `DevToolsActivePort`, `/json`, WebSocket command IDs/timeouts, `Runtime.exceptionThrown`, and `Runtime.consoleAPICalled` handling from `scripts/check-main-boot-ready-browser.mjs`, but export it through `launchEdgeProbe`. Launch with:

  ```js
  const flags = [
    "--headless=new", "--no-sandbox", "--disable-background-networking",
    "--disable-component-update", "--disable-default-apps", "--disable-sync",
    "--autoplay-policy=no-user-gesture-required", "--use-angle=d3d11",
    "--enable-webgl", "--ignore-gpu-blocklist", "--remote-allow-origins=*",
    "--remote-debugging-port=0", `--user-data-dir=${profileDirectory}`, "about:blank"
  ];
  ```

  `close()` closes the socket, terminates the Edge process tree with the existing bounded `taskkill.exe` fallback, and removes only the verified child profile directory.

- [ ] **Step 5: Add the media spy before any scene action**

  After boot entry completes, evaluate this once per profile:

  ```js
  window.__yueEAudioProbe = await (async () => {
    const audio = document.getElementById("audio");
    const calls = { play: 0, pause: 0, load: 0 };
    const writes = { src: 0, currentTime: 0, loop: 0, volume: 0, muted: 0, playbackRate: 0 };
    for (const name of Object.keys(calls)) {
      const original = audio[name].bind(audio);
      audio[name] = (...args) => { calls[name] += 1; return original(...args); };
    }
    for (const name of Object.keys(writes)) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, name);
      Object.defineProperty(audio, name, {
        configurable: true,
        get: () => descriptor.get.call(audio),
        set: (value) => { writes[name] += 1; descriptor.set.call(audio, value); }
      });
    }
    audio.src = "/__yue_e_audio.wav";
    audio.loop = true;
    await audio.play();
    while (audio.currentTime <= 0.15) await new Promise((resolve) => setTimeout(resolve, 25));
    const sample = (label) => ({
      label, currentTime: audio.currentTime, paused: audio.paused, src: audio.getAttribute("src"),
      currentSrc: audio.currentSrc, loop: audio.loop, volume: audio.volume, muted: audio.muted,
      playbackRate: audio.playbackRate, calls: { ...calls }, writes: { ...writes },
      songId: window.FeYueEDiagnostics.snapshot().songId,
      queueRevision: window.FeYueEDiagnostics.snapshot().queueRevision
    });
    return { sample, baseline: sample("baseline") };
  })();
  ```

  Add the executable Node-side helpers:

  ```js
  const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
  const click=(id)=>probe.evaluate(`document.getElementById(${JSON.stringify(id)}).click();true`);
  const diag=()=>probe.evaluate("window.FeYueEDiagnostics.snapshot()");
  const media=(label)=>probe.evaluate(`window.__yueEAudioProbe.sample(${JSON.stringify(label)})`);
  const baseline=await media("baseline");
  function assertMedia(before,after){for(const key of ["paused","src","currentSrc","loop","volume","muted","playbackRate","songId","queueRevision"])assert.deepEqual(after[key],before[key]);assert.deepEqual(after.calls,before.calls);assert.deepEqual(after.writes,before.writes);assert.ok((after.currentTime-before.currentTime+30)%30>.05);}
  ```

- [ ] **Step 6: Add the D3D11 environment gate and shared assertions**

  Query a temporary WebGL context's `WEBGL_debug_renderer_info`. Fail with an `environment-unavailable` report unless renderer contains `ANGLE` and `Direct3D11`/`D3D11`, and does not contain `SwiftShader` or `llvmpipe`. After every click and teardown sample:

  ```js
  const diagnostics = await probe.evaluate("window.FeYueEDiagnostics.snapshot()");
  assert.ok(diagnostics.activeHeavyRafCount <= 1, JSON.stringify(diagnostics));
  assert.equal(probe.pageErrors.length, 0);
  assert.equal(probe.consoleErrors.length, 0);
  ```

- [ ] **Step 7: Implement success/continuity profile**

  Add this executable body (the local `click/id`, `diag`, `media`, and `sleep` helpers call `probe.evaluate`, and `assertMedia` deep-compares counters/source/loop/volume/mute/rate/song/queue while requiring positive modulo-30 clock advance):

  ```js
  async function successContinuity() { fixture.setGlbFault({ delayMs: 900 }); await click("yueEButton"); await sleep(100); await click("sandboxModeButton");
    await probe.waitFor("window.FeYueEDiagnostics.snapshot().sandboxOpen && !window.FeYueEDiagnostics.snapshot().active", "preload cancellation");
    fixture.setGlbFault({ delayMs: 0 }); await click("sandboxModeButton"); await click("yueEButton"); await probe.waitFor("window.FeYueEDiagnostics.snapshot().phase === 'active'", "active Yue E", 15000);
    const opacity = await probe.evaluate("new Promise(async r=>{const a=[];for(let i=0;i<15;i++){a.push([+getComputedStyle(document.querySelector('.app-shell')).opacity,+getComputedStyle(yueERoot).opacity]);await new Promise(x=>setTimeout(x,40));}r(a)})");
    assert.ok(opacity.every(([base, scene]) => base + scene >= .95)); const runtimeId=(await diag()).runtimeId; await probe.screenshot("runtime-shell.png");
    await click("diyButton"); await probe.waitFor("window.FeYueEDiagnostics.snapshot().diyOpen && !window.FeYueEDiagnostics.snapshot().surfaceOpen", "exclusive DIY");
    await probe.evaluate("dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));true");
    assert.equal((await diag()).runtimeId, runtimeId); assertMedia(baseline, await media("success-final")); }
  ```

- [ ] **Step 8: Implement asset-503/retry profile**

  ```js
  async function asset503Retry() { await click("sandboxModeButton"); const before=await probe.evaluate("({hidden:sandboxPage.hidden,pressed:sandboxModeButton.getAttribute('aria-pressed'),focus:document.activeElement?.id||''})");
    fixture.setGlbFault({ failuresRemaining:1 }); await click("yueEButton"); await probe.waitFor("window.FeYueEDiagnostics.snapshot().phase === 'error'", "503 error");
    assert.deepEqual(await probe.evaluate("({hidden:sandboxPage.hidden,pressed:sandboxModeButton.getAttribute('aria-pressed'),focus:document.activeElement?.id||''})"),before); await probe.screenshot("error-fallback.png");
    const id=(await diag()).runtimeId; fixture.setGlbFault({failuresRemaining:0}); await click("yueERetryButton"); await probe.waitFor("window.FeYueEDiagnostics.snapshot().phase === 'active'", "503 retry",15000); assert.equal((await diag()).runtimeId,id); assertMedia(baseline,await media("503-final")); }
  ```

- [ ] **Step 9: Implement WebGL-unavailable/retry profile**

  ```js
  async function webglUnavailableRetry() { await click("diyButton"); await probe.evaluate("window.__yeGetContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(k,o){return this.id==='yueECanvas'?null:window.__yeGetContext.call(this,k,o)};true");
    await click("yueEButton"); await probe.waitFor("window.FeYueEDiagnostics.snapshot().phase === 'error'", "WebGL error"); assert.equal((await diag()).diyOpen,true); await probe.screenshot("webgl-unavailable.png");
    const id=(await diag()).runtimeId; await probe.evaluate("HTMLCanvasElement.prototype.getContext=window.__yeGetContext;true"); await click("yueERetryButton"); await probe.waitFor("window.FeYueEDiagnostics.snapshot().phase === 'active'", "WebGL retry",15000); assert.equal((await diag()).runtimeId,id); assertMedia(baseline,await media("webgl-final")); }
  ```

- [ ] **Step 10: Implement real context-loss/restore profile**

  ```js
  async function contextLossRestore() { await click("yueEButton"); await probe.waitFor("window.FeYueEDiagnostics.snapshot().phase === 'active'", "context profile active",15000); const id=(await diag()).runtimeId;
    await probe.evaluate("window.__yeLoss=yueECanvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')||yueECanvas.getContext('webgl')?.getExtension('WEBGL_lose_context');window.__yeLoss.loseContext();true");
    await probe.waitFor("['lost','rebuilding'].includes(window.FeYueEDiagnostics.snapshot().recoveryPhase)", "context lost"); await probe.screenshot("context-recovery.png");
    await probe.evaluate("window.__yeLoss.restoreContext();true"); await probe.waitFor("window.FeYueEDiagnostics.snapshot().recoveryPhase === 'none'", "context restored",15000); assert.equal((await diag()).runtimeId,id);
    await probe.evaluate("window.__yeLoss.loseContext();true"); await click("sandboxModeButton"); await probe.waitFor("window.FeYueEDiagnostics.snapshot().sandboxOpen && !window.FeYueEDiagnostics.snapshot().surfaceOpen", "loss mode switch"); assertMedia(baseline,await media("context-final")); }
  ```

- [ ] **Step 11: Assert final ownership release for every profile**

  Add to `runProfile` after its named body:

  ```js
  await probe.evaluate("dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));true");
  await probe.waitFor("window.FeYueEDiagnostics.snapshot().runtime === null && yueERoot.hidden", "terminal release");
  const final=await diag(); assert.equal(final.activeHeavyRafCount,0); assert.equal(await probe.evaluate("yueEButton.getAttribute('aria-busy')"),"false");
  assert.equal(final.runtime?.diagnostics?.listenerCount||0,0); assertMedia(baseline,await media("terminal"));
  ```

- [ ] **Step 12: Run the four profiles**

  Run: `node scripts/check-yue-e-phase-1-browser.mjs`

  Expected: final JSON has `ok:true`, four named profile objects, D3D11 vendor/renderer, media-clock samples, counter baselines, stable-frame/resource reports, and four existing PNG paths.

- [ ] **Step 13: Commit browser probes, not generated screenshots**

  ```powershell
  git add scripts/yue-e/lib/browser-probe.mjs scripts/check-yue-e-phase-1-browser.mjs
  git diff --cached --check
  git commit -m "test: verify Yue E phase one in Edge"
  ```

### Task 8A: Static ESM cache graph and Gate-A lineage aggregate

**Files:** Create `scripts/check-yue-e-phase-1-contract.mjs`, `scripts/check-yue-e-cross-platform-release.mjs`; modify `scripts/check-web-cache-fingerprints.mjs:109-128`; regenerate `web/cache-fingerprints.json`.

**Interfaces:** `check-yue-e-phase-1-contract.mjs` takes no arguments. `check-yue-e-cross-platform-release.mjs --web-root=<absolute-or-repository-relative-directory>` verifies a copied `web` root against the repository Gate A.

- [ ] **Step 1: Write the failing lineage/cache aggregate**

  Create `scripts/check-yue-e-phase-1-contract.mjs` with this core (retain uppercase comparison):

  ```js
  import assert from "node:assert/strict"; import crypto from "node:crypto";
  import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url"; import { spawnSync } from "node:child_process";
  const root = path.resolve(import.meta.dirname, "..");
  const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));
  const hash = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").toUpperCase();
  const gateRel = "docs/superpowers/assets/yue-e/lookdev/yue-e-traveler-gate.json";
  const manifestRel = "web/assets/yue-e/character/yue-e-traveler-lookdev.manifest.json";
  export function approvedLineage() {
    const gate = json(gateRel); assert.equal(gate.approval.status, "approved");
    assert.equal(gate.approval.approvedModelSha256, gate.model.sha256);
    return { gate, model: gate.model.sha256, gateSha: hash(path.join(root, gateRel)),
      contract: gate.lookdevContractSha256, rig: gate.rigFingerprintSha256, lod0: gate.approvedLod0FingerprintSha256 };
  }
  export function verifyWebRoot(webRoot, expected = approvedLineage()) {
    const dir = path.join(webRoot, "assets/yue-e/character");
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "yue-e-traveler-lookdev.manifest.json"), "utf8"));
    assert.match(manifest.assetUrl, /^\.\/yue-e-traveler-lookdev\.[A-F0-9]{12}\.glb$/u);
    const name = manifest.assetUrl.slice(2); const asset = path.resolve(dir, name);
    assert.equal(path.dirname(asset), path.resolve(dir));
    const matches = fs.readdirSync(dir).filter((item) => /^yue-e-traveler-lookdev\.[A-F0-9]{12}\.glb$/u.test(item));
    assert.deepEqual(matches, [name], "source/copy must contain exactly the manifest-selected promoted GLB");
    const fields = [[manifest.sha256, expected.model], [manifest.approvedModelSha256, expected.model],
      [manifest.approvedGateSha256, expected.gateSha], [manifest.lookdevContractSha256, expected.contract],
      [manifest.rigFingerprintSha256, expected.rig], [manifest.approvedLod0FingerprintSha256, expected.lod0]];
    for (const [actual, wanted] of fields) assert.equal(actual, wanted);
    assert.equal(hash(asset), expected.model); assert.equal(name, `yue-e-traveler-lookdev.${expected.model.slice(0, 12)}.glb`);
    for (const key of ["bodyBounds", "bodyMaxRadialDistance", "lod0SemanticIds", "bindPoseMaxResidual", "exportedPoseProbes"])
      assert.deepEqual(manifest[key], expected.gate.model.metrics[key]);
    return { asset, manifest, matchingGlbCount: matches.length };
  }
  async function main() { const result = verifyWebRoot(path.join(root, "web"));
    const cache = new Set(json("web/cache-fingerprints.json").assets.map((item) => item.path));
    for (const file of ["app.js", "yue-e/runtime.js", "yue-e/core/lifecycle.js", "yue-e/core/stable-frames.js",
      "yue-e/core/errors.js", "yue-e/core/context-recovery.js", "yue-e/assets/asset-gate.js",
      "yue-e/character/lookdev-contract.js", "yue-e/character/lookdev-loader.js",
      "yue-e/world/phase-1-collision.js", "yue-e/music-zone/anchors.js", "yue-e/scene/shell-scene.js"])
      assert.ok(cache.has(file), `cache graph missing ${file}`);
    for (const script of ["check-yue-e-runtime-state.mjs", "check-yue-e-runtime-shell.mjs", "check-yue-e-entry-contract.mjs"])
      assert.equal(spawnSync(process.execPath, [path.join(root, "scripts", script)], { stdio: "inherit" }).status, 0);
    console.log(JSON.stringify({ ok: true, asset: path.basename(result.asset), matchingGlbCount: 1 })); }
  if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
  ```

- [ ] **Step 2: Run red aggregate** — Run `node scripts/check-yue-e-phase-1-contract.mjs`; expect non-zero `cache graph missing yue-e/runtime.js`; it must also fail earlier if two source GLBs exist.

- [ ] **Step 3: Add static ESM discovery to the existing queue**

  Prepend these patterns to `dynamicPatterns`; keep the same `record(resolveLocalReference(...))` loop and pending-JavaScript queue:

  ```js
  /\bimport\s+(?:[^"'();]*?\s+from\s*)?["']([^"']+\.js(?:\?[^"']*)?)["']/giu,
  /\bexport\s+(?:\*|\{[^}]*\})\s+from\s*["']([^"']+\.js(?:\?[^"']*)?)["']/giu,
  ```

- [ ] **Step 4: Add copied-web-root verification**

  Create `scripts/check-yue-e-cross-platform-release.mjs`:

  ```js
  import assert from "node:assert/strict"; import fs from "node:fs"; import path from "node:path";
  import { approvedLineage, verifyWebRoot } from "./check-yue-e-phase-1-contract.mjs";
  const values=process.argv.slice(2).filter((value)=>value.startsWith("--web-root=")); assert.equal(values.length,1,"exactly one --web-root is required");
  const webRoot=path.resolve(values[0].slice(11)); assert.ok(fs.statSync(webRoot).isDirectory()); const result=verifyWebRoot(webRoot,approvedLineage());
  for(const file of ["yue-e/package.json","yue-e/runtime.js","yue-e/yue-e.css","yue-e/core/lifecycle.js","yue-e/core/stable-frames.js","yue-e/core/errors.js","yue-e/core/context-recovery.js","yue-e/assets/asset-gate.js","yue-e/character/lookdev-contract.js","yue-e/character/lookdev-loader.js","yue-e/world/phase-1-collision.js","yue-e/music-zone/anchors.js","yue-e/scene/shell-scene.js"])assert.ok(fs.statSync(path.join(webRoot,file)).isFile(),`missing ${file}`);
  console.log(JSON.stringify({ok:true,webRoot,asset:path.basename(result.asset),matchingGlbCount:result.matchingGlbCount}));
  ```

- [ ] **Step 5: Regenerate and verify cache fingerprints**

  ```powershell
  node scripts/check-web-cache-fingerprints.mjs --write
  node scripts/check-web-cache-fingerprints.mjs
  node scripts/check-yue-e-phase-1-contract.mjs
  node scripts/check-yue-e-cross-platform-release.mjs "--web-root=web"
  ```

  Expected: all exit `0`; aggregate reports the approved basename and `matchingGlbCount:1`.

- [ ] **Step 6: Commit cache/aggregate work**

  ```powershell
  git add scripts/check-yue-e-phase-1-contract.mjs scripts/check-yue-e-cross-platform-release.mjs
  git add -p -- scripts/check-web-cache-fingerprints.mjs web/cache-fingerprints.json
  git diff --cached --check
  git commit -m "test: lock Yue E release lineage"
  ```

### Task 8B: Manifest-derived Windows package and installed lineage

**Files:** Create `scripts/yue-e-release-contract.ps1`; modify `scripts/build-installer.ps1`, `scripts/install-fe-monster.ps1`, `scripts/check-windows-installer-contract.ps1`, `scripts/check-final-installer-isolated-install.ps1`.

**Interfaces:** Consume the three frozen PowerShell functions; do not add installer CLI parameters and never hardcode the 12-hex GLB basename in a payload list.

- [ ] **Step 1: Add failing Windows source assertions**

  In `check-windows-installer-contract.ps1`, read `scripts\yue-e-release-contract.ps1` and assert build/install/isolated sources contain `Get-YueERuntimeRelativeFiles` and `Resolve-YueEReleaseAsset`; assert build source removes `scripts\yue-e`; run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check-windows-installer-contract.ps1`. Expected: non-zero `missing source file: scripts\yue-e-release-contract.ps1`.

- [ ] **Step 2: Implement the shared resolver**

  Create `scripts/yue-e-release-contract.ps1` with these complete rules:

  ```powershell
  function Get-YueERuntimeRelativeFiles { @(
    'web\yue-e\package.json','web\yue-e\runtime.js','web\yue-e\yue-e.css',
    'web\yue-e\core\lifecycle.js','web\yue-e\core\stable-frames.js','web\yue-e\core\errors.js','web\yue-e\core\context-recovery.js',
    'web\yue-e\assets\asset-gate.js','web\yue-e\character\lookdev-contract.js','web\yue-e\character\lookdev-loader.js',
    'web\yue-e\world\phase-1-collision.js','web\yue-e\music-zone\anchors.js','web\yue-e\scene\shell-scene.js',
    'web\assets\yue-e\character\yue-e-traveler-lookdev.manifest.json','scripts\yue-e-release-contract.ps1'
  ) }
  function Get-YueEApprovedLineage { param([Parameter(Mandatory=$true)][string]$RepositoryRoot)
    $gateRelative='docs\superpowers\assets\yue-e\lookdev\yue-e-traveler-gate.json'; $gatePath=Join-Path $RepositoryRoot $gateRelative
    $gate=Get-Content -Raw -LiteralPath $gatePath|ConvertFrom-Json
    if([string]$gate.approval.status -cne 'approved' -or [string]$gate.approval.approvedModelSha256 -cne [string]$gate.model.sha256){throw 'Yue E Gate A is not an exact approval.'}
    [pscustomobject]@{ApprovedGatePath=$gateRelative.Replace('\','/');ApprovedModelSha256=[string]$gate.model.sha256;
      ApprovedGateSha256=(Get-FileHash -LiteralPath $gatePath -Algorithm SHA256).Hash;LookdevContractSha256=[string]$gate.lookdevContractSha256;
      RigFingerprintSha256=[string]$gate.rigFingerprintSha256;ApprovedLod0FingerprintSha256=[string]$gate.approvedLod0FingerprintSha256}
  }
  function Resolve-YueEReleaseAsset { param([Parameter(Mandatory=$true)][string]$Root,[object]$ExpectedLineage=$null)
    $rootPath=(Resolve-Path -LiteralPath $Root).Path; $relativeManifest='web\assets\yue-e\character\yue-e-traveler-lookdev.manifest.json'
    $manifestPath=Join-Path $rootPath $relativeManifest; $manifest=Get-Content -Raw -LiteralPath $manifestPath|ConvertFrom-Json
    $url=[string]$manifest.assetUrl; if($url -cnotmatch '^\./(?<name>yue-e-traveler-lookdev\.[A-F0-9]{12}\.glb)$'){throw "Invalid Yue E assetUrl: $url"}; $assetName=[string]$Matches.name
    $directory=(Resolve-Path -LiteralPath (Split-Path -Parent $manifestPath)).Path; $assetPath=[IO.Path]::GetFullPath((Join-Path $directory $assetName))
    if((Split-Path -Parent $assetPath) -cne $directory){throw 'Yue E asset escaped its direct character directory.'}
    $matching=@(Get-ChildItem -LiteralPath $directory -File|Where-Object{$_.Name -cmatch '^yue-e-traveler-lookdev\.[A-F0-9]{12}\.glb$'})
    if($matching.Count -ne 1 -or $matching[0].Name -cne $assetName){throw 'Yue E character directory must contain exactly the selected GLB.'}
    $actual=(Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash; if($actual -cne [string]$manifest.sha256){throw 'Yue E selected GLB hash mismatch.'}
    if($assetName -cne "yue-e-traveler-lookdev.$($actual.Substring(0,12)).glb"){throw 'Yue E filename/hash prefix mismatch.'}
    if($null-ne $ExpectedLineage){$pairs=@(@('sha256','ApprovedModelSha256'),@('approvedModelSha256','ApprovedModelSha256'),@('approvedGateSha256','ApprovedGateSha256'),@('approvedGatePath','ApprovedGatePath'),@('lookdevContractSha256','LookdevContractSha256'),@('rigFingerprintSha256','RigFingerprintSha256'),@('approvedLod0FingerprintSha256','ApprovedLod0FingerprintSha256'));foreach($pair in $pairs){$actualField=[string]$manifest.PSObject.Properties[$pair[0]].Value;$expectedField=[string]$ExpectedLineage.PSObject.Properties[$pair[1]].Value;if($actualField-cne$expectedField){throw "Yue E lineage mismatch: $($pair[0])"}}}
    [pscustomobject]@{Manifest=$manifest;ManifestPath=$manifestPath;ManifestRelative=$relativeManifest;AssetPath=$assetPath;
      AssetRelative=$assetPath.Substring($rootPath.Length).TrimStart('\');AssetSha256=$actual;MatchingGlbCount=$matching.Count}
  }
  ```

- [ ] **Step 3: Wire manifest-derived staging**

  Dot-source the helper after `$rootPath`, then use this code (the last four lines belong inside `Stage-Payload`, after recursive copy and before `New-PayloadIntegrityManifest`):

  ```powershell
  . (Join-Path $rootPath 'scripts\yue-e-release-contract.ps1')
  $yueELineage=Get-YueEApprovedLineage -RepositoryRoot $rootPath
  $yueESource=Resolve-YueEReleaseAsset -Root $rootPath -ExpectedLineage $yueELineage
  $stagedBuildTools=Join-Path $payloadRoot 'scripts\yue-e'; if(Test-Path -LiteralPath $stagedBuildTools){Remove-Item -LiteralPath $stagedBuildTools -Recurse -Force}
  $stagedYueE=Resolve-YueEReleaseAsset -Root $payloadRoot -ExpectedLineage $yueELineage
  Assert-GlbImagesAreEmbedded $stagedYueE.AssetPath
  $requiredPayloadItems+=@(Get-YueERuntimeRelativeFiles); $requiredPayloadItems+=$stagedYueE.AssetRelative
  ```

- [ ] **Step 4: Wire install/staged/isolated checks**

  Dot-source the helper in all three scripts and insert the matching block:

  ```powershell
  # install-fe-monster.ps1, inside Assert-RequiredFiles
  $required+=@(Get-YueERuntimeRelativeFiles); $null=Resolve-YueEReleaseAsset -Root $installPath
  # check-windows-installer-contract.ps1, inside the PayloadRoot branch
  $expectedYueE=Get-YueEApprovedLineage -RepositoryRoot $rootPath; $payloadYueE=Resolve-YueEReleaseAsset -Root $payloadPath -ExpectedLineage $expectedYueE
  foreach($relative in @((Get-YueERuntimeRelativeFiles)+$payloadYueE.AssetRelative)){if($manifestRelativePaths -notcontains $relative.Replace('\','/')){$failures.Add("Yue E payload manifest entry missing: $relative")|Out-Null}}
  # check-final-installer-isolated-install.ps1, after installPath exists
  $expectedYueE=Get-YueEApprovedLineage -RepositoryRoot $rootPath; $installedYueE=Resolve-YueEReleaseAsset -Root $installPath -ExpectedLineage $expectedYueE
  $criticalRelativeFiles+=@((Get-YueERuntimeRelativeFiles)+$installedYueE.AssetRelative)
  ```

  Then reject `scripts\yue-e`, `scripts\check-yue-e-*`, `docs\superpowers\assets\yue-e`, `.blend`, and lookdev candidates in staged/isolated trees, and include all five hashes plus `MatchingGlbCount:1` in isolated JSON.

- [ ] **Step 5: Run staged and full/isolated Windows gates**

  ```powershell
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -StageOnly -WebView2Mode Online -AllowEmbeddedPayload
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check-windows-installer-contract.ps1 -PayloadRoot "out\installer\work\payload\FE Monster" -WebView2Mode Online
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1 -SkipBuild -OutputDir "artifacts\yue-e\phase-1\installer" -WebView2Mode Online -AllowEmbeddedPayload
  $v=[string](Get-Content -Raw package.json|ConvertFrom-Json).version; $setup=(Resolve-Path "artifacts\yue-e\phase-1\installer\FE-Monster-Setup-$v.exe").Path
  $testRoot=Join-Path (Resolve-Path '.').Path ('.tmp\yue-e-phase1-isolated-'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/check-final-installer-isolated-install.ps1 -SetupExe $setup -TestRoot $testRoot -ExpectedCacheToken "20260821-yue-e-phase1-1"
  ```

  Expected: every command exits `0`; staged and isolated reports show the same five hashes and exactly one selected GLB.

- [ ] **Step 6: Commit package-boundary changes**

  ```powershell
  git add scripts/yue-e-release-contract.ps1
  git add -p -- scripts/build-installer.ps1 scripts/install-fe-monster.ps1 scripts/check-windows-installer-contract.ps1 scripts/check-final-installer-isolated-install.ps1
  git diff --cached --check
  git commit -m "build: package approved Yue E phase one asset"
  ```

### Task 8C: Existing regressions, Android/macOS copied payloads, and USER GATE B

**Files:** Read all Phase 1 outputs; generate only temporary copied-payload directories and Gate-B evidence under `artifacts/yue-e/phase-1/`.

**Interfaces:** No production interface. Every command must exit `0`; an unavailable real macOS runner is an unresolved gate, not a Windows-inferred pass.

- [ ] **Step 1: Run the non-browser Phase 1 chain**

  ```powershell
  function Invoke-Phase1NodeGate { param([string[]]$GateArgs) & node @GateArgs; if($LASTEXITCODE -ne 0){throw "Phase 1 gate failed: node $($GateArgs -join ' ')"} }
  Invoke-Phase1NodeGate @('scripts/check-yue-e-lookdev-contract.mjs')
  Invoke-Phase1NodeGate @('scripts/check-yue-e-character-scene.mjs')
  Invoke-Phase1NodeGate @('scripts/check-yue-e-glb-parser.mjs')
  Invoke-Phase1NodeGate @('scripts/check-yue-e-character-asset.mjs','--stage=lookdev')
  Invoke-Phase1NodeGate @('scripts/check-yue-e-approval-gate.mjs')
  Invoke-Phase1NodeGate @('scripts/check-yue-e-promotion.mjs')
  Invoke-Phase1NodeGate @('scripts/check-yue-e-asset-gate.mjs')
  Invoke-Phase1NodeGate @('scripts/check-yue-e-runtime-state.mjs')
  Invoke-Phase1NodeGate @('scripts/check-yue-e-shell-scene.mjs')
  Invoke-Phase1NodeGate @('scripts/check-yue-e-runtime-shell.mjs')
  Invoke-Phase1NodeGate @('scripts/check-yue-e-shell-modules.mjs')
  Invoke-Phase1NodeGate @('scripts/check-yue-e-entry-contract.mjs')
  Invoke-Phase1NodeGate @('scripts/check-yue-e-phase-1-contract.mjs')
  Invoke-Phase1NodeGate @('scripts/check-web-cache-fingerprints.mjs')
  Invoke-Phase1NodeGate @('--check','web/app.js')
  Invoke-Phase1NodeGate @('--check','web/yue-e/runtime.js')
  ```

  Expected: every process exits `0`; the aggregate prints one selected asset and `matchingGlbCount:1`.

- [ ] **Step 2: Run the real-browser and existing app regressions**

  ```powershell
  node scripts/check-yue-e-lookdev-browser.mjs
  node scripts/check-yue-e-phase-1-browser.mjs
  node scripts/check-main-boot-ready-browser.mjs
  node scripts/check-audio-playback-continuity.mjs
  node scripts/check-app-exit-lifecycle.mjs
  ```

  Expected: all exit `0`; the Yue E report contains four profiles, D3D11 renderer, unchanged audio counters, and one-heavy-RAF samples.

- [ ] **Step 3: Build and inspect the Android copied payload**

  ```powershell
  node scripts/check-android-local-runtime.mjs
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-android.ps1 -Configuration Debug
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $androidApk=(Resolve-Path "android\app\build\outputs\apk\debug\app-debug.apk").Path
  $androidExtract=Join-Path (Resolve-Path ".tmp").Path ("yue-e-android-apk-"+[DateTime]::UtcNow.ToString("yyyyMMddHHmmss"))
  New-Item -ItemType Directory -Path $androidExtract | Out-Null
  [IO.Compression.ZipFile]::ExtractToDirectory($androidApk,$androidExtract)
  node scripts/check-yue-e-cross-platform-release.mjs "--web-root=$androidExtract\assets\fe-monster-web"
  ```

  Expected: build and copied-root checker exit `0`; copied root reports the exact approved basename and one GLB.

- [ ] **Step 4: Run the macOS static regression and real copied-resource check on macOS**

  On Windows run `node scripts/check-macos-port.mjs`; expect exit `0`. On the release macOS runner run:

  ```bash
  node scripts/check-macos-port.mjs
  phase1_mac_stage="$(mktemp -d /tmp/fe-monster-yue-e-phase1.XXXXXX)"
  bash "FE moster苹果端/Build/sync-shared-resources.sh" out/fe-monster-java.jar "$phase1_mac_stage/Contents/Resources"
  node scripts/check-yue-e-cross-platform-release.mjs "--web-root=$phase1_mac_stage/Contents/Resources/App/web"
  ```

  Expected: both checks exit `0`; macOS copied root reports the same five Gate-A hashes and one selected GLB. Retain the temp path until Gate B evidence is recorded.

- [ ] **Step 5: Verify the final diff and unfinished-marker boundary**

  ```powershell
  git diff --check
  rg -n "T[B]D|T[O]DO|F[I]XME|X[X]X|待[定]|占位[符]|implement l[a]ter" web/yue-e scripts/yue-e scripts/yue-e-release-contract.ps1 scripts -g "check-yue-e-*"
  git status --short
  ```

  Expected: `git diff --check` exits `0`; `rg` returns no matches; status contains no uncommitted source change from this plan.

- [ ] **Step 6: Assemble the exact Gate-B report**

  ```powershell
  $gate=Get-Content -Raw "docs\superpowers\assets\yue-e\lookdev\yue-e-traveler-gate.json"|ConvertFrom-Json
  $manifest=Get-Content -Raw "web\assets\yue-e\character\yue-e-traveler-lookdev.manifest.json"|ConvertFrom-Json
  [ordered]@{approvedModelSha256=$gate.model.sha256;approvedGateSha256=$manifest.approvedGateSha256;
    lookdevContractSha256=$manifest.lookdevContractSha256;rigFingerprintSha256=$manifest.rigFingerprintSha256;
    approvedLod0FingerprintSha256=$manifest.approvedLod0FingerprintSha256;metrics=$gate.model.metrics;
    evidence=@('runtime-shell.png','error-fallback.png','webgl-unavailable.png','context-recovery.png');
    requiredResults=@('r128-turntable','four-edge-profiles','windows-staged','windows-isolated','android-copied-web','macos-copied-web','boot','audio','exit')}|ConvertTo-Json -Depth 12
  ```

  Add the browser report's Three r128 vendor/renderer, three-frame readiness components, media-clock samples, method/property spy counts, per-renderer resource ledger, and every command result; show all four PNGs to the user.

- [ ] **Step 7: USER GATE B — STOP**

  Ask the user to accept or reject Phase 1. Do not create, modify, or execute Phase 2 work until the user explicitly accepts.

## Self-Review Checklist

- [ ] Every implementation task below has a concrete failing check, its expected failure, minimal code, a passing command, and a commit command.
- [ ] Every interface name and property matches the frozen blocks above and Phase 1B.
- [ ] Source, staged payload, and isolated install each assert exactly one manifest-selected GLB.
- [ ] Aggregate and isolated-install checks both compare all five Gate-A lineage hashes.
- [ ] Browser profiles prove audio continuity, one heavy RAF, retry, lifecycle, and resource release.
- [ ] Android and macOS results are not inferred from Windows staging; each copied web root is checked.
- [ ] No Stage 2 behavior or unfinished marker remains.
